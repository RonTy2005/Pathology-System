const express = require("express");
const { all, get, run, transaction } = require("../db/helpers");
const { nextDailyPatientCode, nextDailySequenceId } = require("../db/sequences");
const { allowPermissions, allowRoles, hasPermission } = require("../middleware/auth");
const { logAction } = require("../services/logService");
const { ACCESS_CONTROLS, PAYMENT_MODES, PERMISSIONS, ROLES, TECHNICIAN_ROLES } = require("../config/constants");
const { expandTestBundleConfigs } = require("../services/testBundleService");
const { materializeRegistrationTests } = require("../services/registrationTestService");
const { createPatientPortalToken } = require("../utils/patientPortal");

const patientRouter = express.Router();

async function findExistingPatient(name, phone) {
  return get(
    `SELECT *
     FROM patients
     WHERE name = ? AND COALESCE(phone, '') = COALESCE(?, '')
     ORDER BY id DESC
     LIMIT 1`,
    [name, phone || ""]
  );
}

async function savePatient({ name, age, gender, phone }, registrationTime) {
  const existing = await findExistingPatient(name, phone);

  if (existing) {
    await run(
      `UPDATE patients SET age = ?, gender = ?, phone = ? WHERE id = ?`,
      [age, gender, phone || null, existing.id]
    );
    return get("SELECT * FROM patients WHERE id = ?", [existing.id]);
  }

  const created = await run(
    `INSERT INTO patients (patient_code, name, age, gender, phone, created_at)
     VALUES (?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))`,
    [
      await nextDailyPatientCode(),
      name,
      age,
      gender,
      phone || null,
      registrationTime ? new Date(registrationTime).toISOString() : null,
    ]
  );

  return get("SELECT * FROM patients WHERE id = ?", [created.id]);
}

async function createRegistrationVisit({ patientId, tests: testConfigs, user, amountPaid = 0, discount = 0, paymentMode = "cash", doctorId = null, associateId = null, associateName = null, sampleSource = "lab" }, registrationTime) {
  const tests = [];
  const materializedTests = await materializeRegistrationTests(testConfigs);
  const expandedTestConfigs = await expandTestBundleConfigs(materializedTests.testConfigs);
  for (const config of expandedTestConfigs) {
    if (config.isCustom) {
      tests.push({
        id: null,
        name: config.customName,
        price: config.customPrice || 0,
        isOutside: true,
        externalLabName: config.externalLabName || null,
        isCustom: true
      });
    } else {
      const test = await get("SELECT * FROM tests WHERE id = ? AND active = 1", [config.id]);
      if (test) {
        tests.push({
          ...test,
          isOutside: !!config.isOutside,
          externalLabName: config.externalLabName || null
        });
      }
    }
  }

  const subtotal = tests.reduce((sum, test) => sum + Number(test.price), 0);
  const total = Math.max(0, subtotal - Number(discount || 0));
  const due = Math.max(0, total - Number(amountPaid || 0));
  const paymentStatus = due === 0 ? "paid" : amountPaid > 0 ? "partial" : "due";

  const created = await run(
    `INSERT INTO visits (
      bill_no, patient_id, doctor_id, subtotal, discount, total, amount_paid,
      amount_due, payment_mode, payment_status, associate_id, associate_label,
      sample_source, status, created_by, created_at, patient_portal_token
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'registered', ?, COALESCE(?, CURRENT_TIMESTAMP), ?)`,
    [
      await nextDailySequenceId("REG", "visits", "bill_no"),
      patientId, 
      doctorId,
      subtotal, 
      Number(discount || 0), 
      total, 
      Number(amountPaid || 0), 
      due, 
      paymentMode, 
      paymentStatus, 
      associateId,
      associateName || "Direct at lab",
      sampleSource || "lab",
      user.id, 
      registrationTime ? new Date(registrationTime).toISOString() : null,
      createPatientPortalToken(),
    ]
  );

  let technicians = [];
  if (TECHNICIAN_ROLES.includes(user.role)) {
    technicians = [{ id: user.id }];
  } else {
    technicians = await all(
      `SELECT id FROM users WHERE role IN (${TECHNICIAN_ROLES.map(() => '?').join(',')}) AND active = 1 ORDER BY id ASC`,
      TECHNICIAN_ROLES
    );
  }

  for (let index = 0; index < tests.length; index += 1) {
    const assigned = technicians.length ? technicians[index % technicians.length].id : null;
    const test = tests[index];
    await run(
      `INSERT INTO visit_tests (visit_id, test_id, assigned_to, status, is_outside, external_lab_name, custom_test_name, custom_test_price)
       VALUES (?, ?, ?, 'pending', ?, ?, ?, ?)`,
      [created.id, test.id, assigned, test.isOutside ? 1 : 0, test.externalLabName, test.isCustom ? test.name : null, test.isCustom ? test.price : null]
    );
  }

  return get(
    `SELECT
      v.id,
      v.bill_no,
      v.status,
      v.created_at,
      GROUP_CONCAT(COALESCE(vt.custom_test_name, t.name), ', ') AS tests
     FROM visits v
     LEFT JOIN visit_tests vt ON vt.visit_id = v.id
     LEFT JOIN tests t ON t.id = vt.test_id
     WHERE v.id = ?
     GROUP BY v.id`,
    [created.id]
  );
}

patientRouter.post("/", allowRoles(ROLES.ADMIN, ROLES.RECEPTIONIST, ...TECHNICIAN_ROLES), async (req, res, next) => {
  try {
    const name = String(req.body.name || "").trim();
    const age = req.body.age === "" || req.body.age == null ? null : Number(req.body.age);
    const gender = req.body.gender || null;
    const phone = String(req.body.phone || "").trim();
    const testConfigs = Array.isArray(req.body.tests) ? req.body.tests : (req.body.testIds || []).map(id => ({ id }));
    const registrationTime = req.body.registrationTime;

    if (!name) {
      return res.status(400).json({ message: "Patient name is required" });
    }

    if (age !== null && (!Number.isFinite(age) || age < 0)) {
      return res.status(400).json({ message: "Enter a valid patient age" });
    }

    if (testConfigs.length && !PAYMENT_MODES.includes(req.body.paymentMode || "cash")) {
      return res.status(400).json({ message: "Invalid payment mode" });
    }

    const result = await transaction(async () => {
      const patient = await savePatient({ name, age, gender, phone }, registrationTime);
      const shouldCreateVisit = Boolean(req.body.createVisit) || testConfigs.length > 0;
      const visit = shouldCreateVisit
        ? await createRegistrationVisit({ 
            patientId: patient.id, 
            tests: testConfigs, 
            user: req.user,
            amountPaid: req.body.amountPaid,
            discount: req.body.discount,
            paymentMode: req.body.paymentMode,
            doctorId: req.body.doctorId,
            associateId: req.body.associateId,
            associateName: req.body.associateName,
            sampleSource: req.body.sampleSource
          }, registrationTime)
        : null;

      await logAction({
        userId: req.user.id,
        action: visit && testConfigs.length > 0 ? "patient_register_tests" : visit ? "patient_register" : "patient_create",
        details: visit
          ? testConfigs.length > 0
            ? `Registered patient ${patient.patient_code} with tests`
            : `Registered patient ${patient.patient_code}`
          : `Saved patient ${patient.patient_code}`,
        entityId: patient.id,
        entityType: "patient",
      });

      return { patient, visit };
    });

    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

patientRouter.get("/search", async (req, res, next) => {
  try {
    const query = `%${req.query.q || ""}%`;
    const dateFrom = req.query.dateFrom;
    const dateTo = req.query.dateTo;
    
    let sql = `
      SELECT
        p.id,
        p.patient_code,
        p.name,
        p.age,
        p.gender,
        p.phone,
        p.created_at,
        COUNT(DISTINCT v.id) AS visit_count,
        (SELECT GROUP_CONCAT(COALESCE(vt2.custom_test_name, t2.name), ', ')
         FROM visit_tests vt2
         LEFT JOIN tests t2 ON t2.id = vt2.test_id
         WHERE vt2.visit_id = (SELECT id FROM visits WHERE patient_id = p.id ORDER BY created_at DESC LIMIT 1)
        ) AS tests,
        (SELECT status FROM visits WHERE patient_id = p.id ORDER BY created_at DESC LIMIT 1) AS latest_visit_status,
        MAX(COALESCE(v.created_at, p.created_at)) as latest_activity
      FROM patients p
      LEFT JOIN visits v ON v.patient_id = p.id
      WHERE (p.name LIKE ? OR COALESCE(p.phone, '') LIKE ? OR p.patient_code LIKE ?)
    `;
    
    const params = [query, query, query];

    if (dateFrom && dateTo) {
      sql += ` AND (
        (DATE(p.created_at, 'localtime') >= ? AND DATE(p.created_at, 'localtime') <= ?)
        OR
        EXISTS (SELECT 1 FROM visits v2 WHERE v2.patient_id = p.id AND DATE(v2.created_at, 'localtime') >= ? AND DATE(v2.created_at, 'localtime') <= ?)
      )`;
      params.push(dateFrom, dateTo, dateFrom, dateTo);
    } else if (dateFrom) {
      sql += ` AND (
        DATE(p.created_at, 'localtime') >= ?
        OR
        EXISTS (SELECT 1 FROM visits v2 WHERE v2.patient_id = p.id AND DATE(v2.created_at, 'localtime') >= ?)
      )`;
      params.push(dateFrom, dateFrom);
    } else if (dateTo) {
      sql += ` AND (
        DATE(p.created_at, 'localtime') <= ?
        OR
        EXISTS (SELECT 1 FROM visits v2 WHERE v2.patient_id = p.id AND DATE(v2.created_at, 'localtime') <= ?)
      )`;
      params.push(dateTo, dateTo);
    }

    sql += `
      GROUP BY p.id
      ORDER BY latest_activity DESC
      LIMIT 20
    `;

    const patients = await all(sql, params);
    res.json(patients);
  } catch (error) {
    next(error);
  }
});

patientRouter.delete("/:id", allowPermissions(PERMISSIONS.DELETE_PATIENTS), async (req, res, next) => {
  try {
    const patientId = Number(req.params.id);
    if (!Number.isInteger(patientId) || patientId <= 0) {
      return res.status(400).json({ message: "Invalid patient id" });
    }

    const patient = await get("SELECT * FROM patients WHERE id = ?", [patientId]);
    if (!patient) {
      return res.status(404).json({ message: "Patient not found" });
    }

    const summary = await transaction(async () => {
      const counts = await get(
        `
        SELECT
          COUNT(DISTINCT v.id) AS visitCount,
          COUNT(DISTINCT vt.id) AS testCount,
          COUNT(DISTINCT r.id) AS reportCount
        FROM patients p
        LEFT JOIN visits v ON v.patient_id = p.id
        LEFT JOIN visit_tests vt ON vt.visit_id = v.id
        LEFT JOIN reports r ON r.visit_id = v.id
        WHERE p.id = ?
        `,
        [patientId]
      );

      await run(
        `DELETE FROM report_user_actions
         WHERE report_id IN (
           SELECT r.id
           FROM reports r
           JOIN visits v ON v.id = r.visit_id
           WHERE v.patient_id = ?
         )`,
        [patientId]
      );
      await run(
        `DELETE FROM reports
         WHERE visit_id IN (SELECT id FROM visits WHERE patient_id = ?)`,
        [patientId]
      );
      await run(
        `DELETE FROM results
         WHERE visit_test_id IN (
           SELECT vt.id
           FROM visit_tests vt
           JOIN visits v ON v.id = vt.visit_id
           WHERE v.patient_id = ?
         )`,
        [patientId]
      );
      await run(
        `DELETE FROM bill_user_actions
         WHERE visit_id IN (SELECT id FROM visits WHERE patient_id = ?)`,
        [patientId]
      );
      await run(
        `DELETE FROM visit_tests
         WHERE visit_id IN (SELECT id FROM visits WHERE patient_id = ?)`,
        [patientId]
      );
      await run("DELETE FROM visits WHERE patient_id = ?", [patientId]);
      await run("DELETE FROM patients WHERE id = ?", [patientId]);

      await logAction({
        userId: req.user.id,
        action: "patient_delete",
        details: `Deleted patient ${patient.patient_code}`,
        entityId: patientId,
        entityType: "patient",
        meta: {
          patientCode: patient.patient_code,
          name: patient.name,
          visitCount: counts.visitCount || 0,
          testCount: counts.testCount || 0,
          reportCount: counts.reportCount || 0,
        },
      });

      return counts;
    });

    res.json({ ok: true, patient, summary });
  } catch (error) {
    next(error);
  }
});

patientRouter.patch("/:id", async (req, res, next) => {
  try {
    const canEditDetails = !!req.user.accessControls?.[ACCESS_CONTROLS.EDIT_PATIENT_DETAILS];
    const canManageVisits = hasPermission(req.user, PERMISSIONS.MANAGE_PATIENTS);
    if (!canEditDetails && !canManageVisits) {
      return res.status(403).json({ message: "Patient editing is disabled for this user" });
    }

    const detailFields = new Set(["name", "age", "gender", "phone"]);
    const hasVisitFields = Object.keys(req.body).some((field) => !detailFields.has(field));
    if (hasVisitFields && !canManageVisits) {
      return res.status(403).json({ message: "Permission denied to edit visits or billing" });
    }

    if (!hasVisitFields && canEditDetails) {
      const name = String(req.body.name || "").trim();
      const age = Number(req.body.age);
      const gender = String(req.body.gender || "");
      const phone = String(req.body.phone || "").trim();
      if (!name || !Number.isFinite(age) || age < 0 || !gender) {
        return res.status(400).json({ message: "Enter a valid patient name, age and gender" });
      }
      const patient = await transaction(async () => {
        const existing = await get("SELECT * FROM patients WHERE id = ?", [req.params.id]);
        if (!existing) {
          const error = new Error("Patient not found");
          error.statusCode = 404;
          throw error;
        }
        await run(
          "UPDATE patients SET name = ?, age = ?, gender = ?, phone = ? WHERE id = ?",
          [name, age, gender, phone || null, req.params.id]
        );
        await logAction({
          userId: req.user.id,
          action: "patient_update",
          details: `Updated patient ${existing.patient_code}`,
          entityId: req.params.id,
          entityType: "patient",
        });
        return get("SELECT * FROM patients WHERE id = ?", [req.params.id]);
      });
      return res.json({ patient });
    }

    const testConfigs = Array.isArray(req.body.tests) ? req.body.tests : (req.body.testIds || []).map(id => ({ id }));

    if (!canEditDetails && !testConfigs.length) {
      return res.status(403).json({ message: "Patient editing is disabled for this user" });
    }

    const { id } = req.params;
    const {
      name, age, gender, phone,
      discount = 0, amountPaid = 0, paymentMode = "cash",
      doctorId, associateId, associateName, sampleSource,
    } = req.body;

    if (testConfigs.length && !PAYMENT_MODES.includes(paymentMode)) {
      return res.status(400).json({ message: "Invalid payment mode" });
    }

    const result = await transaction(async () => {
    if (req.user.accessControls?.[ACCESS_CONTROLS.EDIT_PATIENT_DETAILS]) {
      await run(
        `UPDATE patients SET name = ?, age = ?, gender = ?, phone = ? WHERE id = ?`,
        [name, age, gender, phone, id]
      );
    }

    const patient = await get("SELECT * FROM patients WHERE id = ?", [id]);
    if (!patient) {
      const error = new Error("Patient not found");
      error.statusCode = 404;
      throw error;
    }

    // Always work on the latest existing visit
    const latestVisit = await get(
      "SELECT * FROM visits WHERE patient_id = ? ORDER BY created_at DESC LIMIT 1",
      [id]
    );

    let visit = null;

    if (latestVisit) {
      // Add any new tests that are not already on this visit
      let toAdd = [];
      if (testConfigs.length) {
        const existingTestIds = (await all(
          "SELECT test_id FROM visit_tests WHERE visit_id = ?",
          [latestVisit.id]
        )).map(r => r.test_id);

        const materializedTests = await materializeRegistrationTests(testConfigs);
        const expandedTestConfigs = await expandTestBundleConfigs(materializedTests.testConfigs);
        toAdd = expandedTestConfigs.filter(t => t.isCustom || !existingTestIds.includes(t.id));
        if (toAdd.length) {
          let technicians = [];
          if (TECHNICIAN_ROLES.includes(req.user.role)) {
            technicians = [{ id: req.user.id }];
          } else {
            technicians = await all(
              `SELECT id FROM users WHERE role IN (${TECHNICIAN_ROLES.map(() => "?").join(",")}) AND active = 1 ORDER BY id ASC`,
              TECHNICIAN_ROLES
            );
          }
          const base = existingTestIds.length;
          for (let i = 0; i < toAdd.length; i++) {
            const config = toAdd[i];
            if (config.isCustom) {
              const assigned = technicians.length ? technicians[(base + i) % technicians.length].id : null;
              await run(
                "INSERT INTO visit_tests (visit_id, test_id, assigned_to, status, is_outside, external_lab_name, custom_test_name, custom_test_price) VALUES (?, NULL, ?, 'pending', 1, ?, ?, ?)",
                [latestVisit.id, assigned, config.externalLabName || null, config.customName, config.customPrice]
              );
            } else {
              const test = await get("SELECT * FROM tests WHERE id = ? AND active = 1", [config.id]);
              if (test) {
                const assigned = technicians.length ? technicians[(base + i) % technicians.length].id : null;
                await run(
                  "INSERT INTO visit_tests (visit_id, test_id, assigned_to, status, is_outside, external_lab_name) VALUES (?, ?, ?, 'pending', ?, ?)",
                  [latestVisit.id, test.id, assigned, config.isOutside ? 1 : 0, config.externalLabName || null]
                );
              }
            }
          }
        }
      }

      // Recalculate billing from all current tests on the visit
      const sum = await get(
        `SELECT COALESCE(SUM(COALESCE(vt.custom_test_price, t.price)), 0) AS subtotal
         FROM visit_tests vt LEFT JOIN tests t ON t.id = vt.test_id
         WHERE vt.visit_id = ?`,
        [latestVisit.id]
      );
      const newSubtotal = sum.subtotal;
      const discountVal = Number(discount || 0);
      const newTotal = Math.max(0, newSubtotal - discountVal);
      // If overpaid, cap amount_paid at new total (receptionist returns excess as expense)
      const newPaid = Math.min(Number(amountPaid || 0), newTotal);
      const newDue = Math.max(0, newTotal - newPaid);
      const paymentStatus = newDue === 0 ? "paid" : newPaid > 0 ? "partial" : "due";

      const statusUpdate = toAdd.length > 0 ? ", status = 'pending'" : "";

      await run(
        `UPDATE visits
         SET subtotal = ?, discount = ?, total = ?, amount_paid = ?, amount_due = ?,
             payment_mode = ?, payment_status = ?,
             doctor_id = ?, associate_id = ?, associate_label = ?, sample_source = ?
             ${statusUpdate}
         WHERE id = ?`,
        [
          newSubtotal, discountVal, newTotal, newPaid, newDue,
          paymentMode, paymentStatus,
          doctorId || null, associateId || null, associateName || "Direct at lab",
          sampleSource || "lab", latestVisit.id,
        ]
      );

      visit = await get(
        `SELECT v.*, GROUP_CONCAT(COALESCE(vt.custom_test_name, t.name), ', ') AS tests
         FROM visits v
         LEFT JOIN visit_tests vt ON vt.visit_id = v.id
         LEFT JOIN tests t ON t.id = vt.test_id
         WHERE v.id = ? GROUP BY v.id`,
        [latestVisit.id]
      );
    } else if (testConfigs.length) {
      // No existing visit — create one
      visit = await createRegistrationVisit({
        patientId: patient.id, tests: testConfigs, user: req.user,
        amountPaid, discount, paymentMode, doctorId, associateId, associateName, sampleSource,
      });
    }

    await logAction({
      userId: req.user.id,
      action: visit ? "patient_tests_updated" : "patient_update",
      details: visit
        ? `Updated visit tests for patient ${patient.patient_code}`
        : `Updated patient ${patient.patient_code}`,
      entityId: id,
      entityType: "patient",
    });

      return { patient, visit };
    });

    res.json(result);
  } catch (error) {
    next(error);
  }
});

module.exports = { patientRouter };
