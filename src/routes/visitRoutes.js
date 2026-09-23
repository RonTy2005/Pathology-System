const express = require("express");
const { all, get, run, transaction } = require("../db/helpers");
const { nextDailySequenceId } = require("../db/sequences");
const { allowAnyPermission, allowPermissions, allowRoles, hasPermission } = require("../middleware/auth");
const { ACCESS_CONTROLS, PAYMENT_MODES, PERMISSIONS, ROLES, TECHNICIAN_ROLES, VISIT_STATUS } = require("../config/constants");
const { logAction } = require("../services/logService");
const { buildReportHtml } = require("../utils/reportFormatter");
const { buildBillHtml } = require("../utils/billFormatter");
const { getBusinessSettings } = require("../services/businessSettingsService");
const { createPatientPortalToken, getPatientPortalUrl, getPatientPortalReportUrl, getPatientPortalBillUrl } = require("../utils/patientPortal");
const { applyCalculatedParameters } = require("../utils/resultCalculations");
const { expandTestBundleConfigs, expandBundleReportTests } = require("../services/testBundleService");
const { materializeRegistrationTests } = require("../services/registrationTestService");
const { isPathologyTest, isBillingOnlyTest, BILLING_ONLY_MESSAGE } = require('../../frontend/scripts/reportEligibility');

const visitRouter = express.Router();
const MAX_IMAGING_REPORT_BYTES = 6 * 1024 * 1024;
const IMAGING_REPORT_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

function imagingRoleForCategory(category) {
  const categoryRoles = {
    "CT Scan": ROLES.CT_TECHNICIAN,
    Radiology: ROLES.USG_TECHNICIAN,
    MRI: ROLES.MRI_TECHNICIAN,
  };
  return categoryRoles[category] || null;
}

function canManageImagingCategory(user, category) {
  if ([ROLES.SUPERADMIN, ROLES.ADMIN].includes(user?.role)) {
    return true;
  }

  return user?.role === imagingRoleForCategory(category);
}

function sanitizeImagingFileName(fileName) {
  const cleaned = String(fileName || "report")
    .replace(/[\\/:*?"<>|\x00-\x1F]/g, "_")
    .trim()
    .slice(0, 180);
  return cleaned || "report";
}

function readImagingReportUpload({ fileName, mimeType, dataUrl }) {
  if (!IMAGING_REPORT_MIME_TYPES.has(mimeType)) {
    throw httpError("Upload a PDF, JPG, PNG, or WebP report file", 400);
  }

  const prefix = `data:${mimeType};base64,`;
  if (typeof dataUrl !== "string" || !dataUrl.startsWith(prefix)) {
    throw httpError("The uploaded file data is invalid", 400);
  }

  const encodedFile = dataUrl.slice(prefix.length);
  if (!encodedFile || !/^[A-Za-z0-9+/]+={0,2}$/.test(encodedFile)) {
    throw httpError("The uploaded file data is invalid", 400);
  }

  const fileData = Buffer.from(encodedFile, "base64");
  if (!fileData.length || fileData.length > MAX_IMAGING_REPORT_BYTES) {
    throw httpError("Report files must be between 1 byte and 6 MB", 400);
  }

  return {
    originalName: sanitizeImagingFileName(fileName),
    mimeType,
    fileData,
  };
}

visitRouter.get("/ct-scans", allowRoles(ROLES.ADMIN, ROLES.CT_TECHNICIAN), async (req, res, next) => {
  try {
    const visits = await all(`
      SELECT
        v.id AS visit_id,
        v.bill_no,
        v.created_at,
        p.name AS patient_name,
        p.age,
        p.gender,
        vt.id AS visit_test_id,
        vt.scan_done,
        t.name AS test_name,
        irf.id AS report_file_id,
        irf.original_name AS report_file_name,
        irf.mime_type AS report_file_mime_type,
        irf.uploaded_at AS report_uploaded_at
      FROM visit_tests vt
      JOIN visits v ON v.id = vt.visit_id
      JOIN patients p ON p.id = v.patient_id
      JOIN tests t ON t.id = vt.test_id
      LEFT JOIN imaging_report_files irf ON irf.visit_test_id = vt.id
      WHERE t.category = 'CT Scan'
        AND v.created_at >= DATE('now', '-2 days')
      ORDER BY datetime(v.created_at) ASC, v.id ASC
    `);
    res.json({ visits });
  } catch (error) {
    next(error);
  }
});

visitRouter.get("/usg-scans", allowRoles(ROLES.ADMIN, ROLES.USG_TECHNICIAN), async (req, res, next) => {
  try {
    const visits = await all(`
      SELECT
        v.id AS visit_id,
        v.bill_no,
        v.created_at,
        p.name AS patient_name,
        p.age,
        p.gender,
        vt.id AS visit_test_id,
        vt.scan_done,
        t.name AS test_name,
        irf.id AS report_file_id,
        irf.original_name AS report_file_name,
        irf.mime_type AS report_file_mime_type,
        irf.uploaded_at AS report_uploaded_at
      FROM visit_tests vt
      JOIN visits v ON v.id = vt.visit_id
      JOIN patients p ON p.id = v.patient_id
      JOIN tests t ON t.id = vt.test_id
      LEFT JOIN imaging_report_files irf ON irf.visit_test_id = vt.id
      WHERE t.category = 'Radiology'
        AND v.created_at >= DATE('now', '-2 days')
      ORDER BY datetime(v.created_at) ASC, v.id ASC
    `);
    res.json({ visits });
  } catch (error) {
    next(error);
  }
});

visitRouter.get("/mri-scans", allowRoles(ROLES.ADMIN, ROLES.MRI_TECHNICIAN), async (req, res, next) => {
  try {
    const visits = await all(`
      SELECT
        v.id AS visit_id,
        v.bill_no,
        v.created_at,
        p.name AS patient_name,
        p.age,
        p.gender,
        vt.id AS visit_test_id,
        vt.scan_done,
        t.name AS test_name,
        irf.id AS report_file_id,
        irf.original_name AS report_file_name,
        irf.mime_type AS report_file_mime_type,
        irf.uploaded_at AS report_uploaded_at
      FROM visit_tests vt
      JOIN visits v ON v.id = vt.visit_id
      JOIN patients p ON p.id = v.patient_id
      JOIN tests t ON t.id = vt.test_id
      LEFT JOIN imaging_report_files irf ON irf.visit_test_id = vt.id
      WHERE t.category = 'MRI'
        AND v.created_at >= DATE('now', '-2 days')
      ORDER BY datetime(v.created_at) ASC, v.id ASC
    `);
    res.json({ visits });
  } catch (error) {
    next(error);
  }
});

visitRouter.patch("/tests/:visitTestId/scan-status", allowRoles(ROLES.ADMIN, ROLES.CT_TECHNICIAN, ROLES.USG_TECHNICIAN, ROLES.MRI_TECHNICIAN), async (req, res, next) => {
  try {
    const { scanDone } = req.body;
    const scan = await get(
      `SELECT vt.id, t.category
       FROM visit_tests vt
       JOIN tests t ON t.id = vt.test_id
       WHERE vt.id = ?`,
      [req.params.visitTestId]
    );

    if (!scan) {
      throw httpError("Study not found", 404);
    }

    if (!canManageImagingCategory(req.user, scan.category)) {
      throw httpError("You can only update studies for your department", 403);
    }

    await run(
      `UPDATE visit_tests SET scan_done = ? WHERE id = ?`,
      [scanDone ? 1 : 0, req.params.visitTestId]
    );
    
    await logAction({
      userId: req.user.id,
      action: "imaging_scan_status_updated",
      entityType: "visit_test",
      entityId: req.params.visitTestId,
      meta: { scanDone },
    });

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

visitRouter.put(
  "/tests/:visitTestId/imaging-report",
  allowRoles(ROLES.ADMIN, ROLES.CT_TECHNICIAN, ROLES.USG_TECHNICIAN, ROLES.MRI_TECHNICIAN),
  async (req, res, next) => {
    try {
      const study = await get(
        `SELECT vt.id, vt.scan_done, t.category, t.name AS test_name
         FROM visit_tests vt
         JOIN tests t ON t.id = vt.test_id
         WHERE vt.id = ?`,
        [req.params.visitTestId]
      );

      if (!study) {
        throw httpError("Study not found", 404);
      }

      if (!canManageImagingCategory(req.user, study.category)) {
        throw httpError("You can only upload reports for your department", 403);
      }

      if (!study.scan_done) {
        throw httpError("Mark the study as done before uploading its report", 400);
      }

      const upload = readImagingReportUpload(req.body || {});
      const existingFile = await get(
        "SELECT id FROM imaging_report_files WHERE visit_test_id = ?",
        [study.id]
      );

      await transaction(async () => {
        await run(
          `INSERT INTO imaging_report_files (
            visit_test_id, original_name, mime_type, file_data, file_size, uploaded_by, uploaded_at
          ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
          ON CONFLICT(visit_test_id) DO UPDATE SET
            original_name = excluded.original_name,
            mime_type = excluded.mime_type,
            file_data = excluded.file_data,
            file_size = excluded.file_size,
            uploaded_by = excluded.uploaded_by,
            uploaded_at = CURRENT_TIMESTAMP`,
          [study.id, upload.originalName, upload.mimeType, upload.fileData, upload.fileData.length, req.user.id]
        );
        await run(
          "UPDATE visit_tests SET status = 'reported', finalized_at = CURRENT_TIMESTAMP WHERE id = ?",
          [study.id]
        );
      });

      const storedFile = await get(
        `SELECT id, original_name, mime_type, file_size, uploaded_at
         FROM imaging_report_files WHERE visit_test_id = ?`,
        [study.id]
      );

      await logAction({
        userId: req.user.id,
        action: "imaging_report_uploaded",
        entityType: "visit_test",
        entityId: study.id,
        meta: {
          testName: study.test_name,
          fileName: storedFile.original_name,
          mimeType: storedFile.mime_type,
          fileSize: storedFile.file_size,
          replacedExisting: Boolean(existingFile),
        },
      });

      res.json({ ok: true, reportFile: storedFile });
    } catch (error) {
      next(error);
    }
  }
);

visitRouter.get(
  "/tests/:visitTestId/imaging-report",
  allowRoles(ROLES.ADMIN, ROLES.MANAGER, ROLES.RECEPTIONIST, ...TECHNICIAN_ROLES),
  allowAnyPermission(PERMISSIONS.VIEW_REPORTS, PERMISSIONS.MANAGE_BILLING),
  async (req, res, next) => {
    try {
      const reportFile = await get(
        `SELECT original_name, mime_type, file_data
         FROM imaging_report_files
         WHERE visit_test_id = ?`,
        [req.params.visitTestId]
      );

      if (!reportFile) {
        throw httpError("No uploaded imaging report was found", 404);
      }

      const safeFileName = sanitizeImagingFileName(reportFile.original_name).replace(/"/g, "_");
      res.set({
        "Cache-Control": "no-store",
        "Content-Type": reportFile.mime_type,
        "Content-Disposition": `inline; filename="${safeFileName}"`,
      });
      res.send(reportFile.file_data);
    } catch (error) {
      next(error);
    }
  }
);

function hasAccessControl(user, control) {
  return Boolean(user?.accessControls?.[control]);
}

function httpError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function parseReportReferringDoctor(value) {
  const raw = String(value || "").trim().replace(/\s+/g, " ");
  if (!raw) return { provided: false, doctorName: null, specialization: null };
  if (raw.toLowerCase() === "self") return { provided: true, doctorName: null, specialization: null };

  const separatorIndex = raw.indexOf(" - ");
  const doctorName = (separatorIndex >= 0 ? raw.slice(0, separatorIndex) : raw).trim();
  const specialization = (separatorIndex >= 0 ? raw.slice(separatorIndex + 3) : "General").trim() || "General";

  if (doctorName.length < 2 || doctorName.length > 120) {
    throw httpError("Enter a referring doctor name between 2 and 120 characters.", 400);
  }

  return { provided: true, doctorName, specialization };
}

async function resolveReportReferringDoctor(value) {
  const requested = parseReportReferringDoctor(value);
  if (!requested.provided || !requested.doctorName) {
    return { ...requested, doctor: null, created: false };
  }

  const existingDoctor = await get(
    `SELECT *
     FROM doctors
     WHERE LOWER(TRIM(name)) = LOWER(TRIM(?))
     ORDER BY active DESC, id ASC
     LIMIT 1`,
    [requested.doctorName]
  );
  if (existingDoctor) return { ...requested, doctor: existingDoctor, created: false };

  const created = await run(
    `INSERT INTO doctors (name, specialization, commission_percent, active, created_at)
     VALUES (?, ?, 0, 1, CURRENT_TIMESTAMP)`,
    [requested.doctorName, requested.specialization]
  );
  const doctor = await get("SELECT * FROM doctors WHERE id = ?", [created.id]);
  return { ...requested, doctor, created: true };
}

async function getReportUserAction(reportId, userId) {
  let action = await get(
    `SELECT * FROM report_user_actions WHERE report_id = ? AND user_id = ?`,
    [reportId, userId]
  );

  if (!action) {
    await run(
      `INSERT INTO report_user_actions (report_id, user_id, print_count, edit_count, updated_at)
       VALUES (?, ?, 0, 0, CURRENT_TIMESTAMP)`,
      [reportId, userId]
    );
    action = await get(
      `SELECT * FROM report_user_actions WHERE report_id = ? AND user_id = ?`,
      [reportId, userId]
    );
  }

  return action;
}

async function getBillUserAction(visitId, userId) {
  let action = await get(
    `SELECT * FROM bill_user_actions WHERE visit_id = ? AND user_id = ?`,
    [visitId, userId]
  );

  if (!action) {
    await run(
      `INSERT INTO bill_user_actions (visit_id, user_id, print_count, updated_at)
       VALUES (?, ?, 0, CURRENT_TIMESTAMP)`,
      [visitId, userId]
    );
    action = await get(
      `SELECT * FROM bill_user_actions WHERE visit_id = ? AND user_id = ?`,
      [visitId, userId]
    );
  }

  return action;
}

async function createPatientIfNeeded({ name, age, gender, phone }, registrationTime) {
  const existing = await get(
    `SELECT *
     FROM patients
     WHERE name = ? AND COALESCE(phone, '') = COALESCE(?, '')
     ORDER BY id DESC
     LIMIT 1`,
    [name, phone || ""]
  );

  if (existing) {
    await run(
      `UPDATE patients SET age = ?, gender = ?, phone = ? WHERE id = ?`,
      [age, gender, phone, existing.id]
    );
    return existing.id;
  }

  const created = await run(
    `INSERT INTO patients (patient_code, name, age, gender, phone, created_at)
     VALUES (?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))`,
    [
      await nextDailySequenceId("PAT", "patients", "patient_code"),
      name,
      age,
      gender,
      phone,
      registrationTime ? new Date(registrationTime).toISOString() : null,
    ]
  );
  return created.id;
}

async function getVisitDetails(visitId, user = null) {
  const visit = await get(
    `
    SELECT
      v.*,
      p.patient_code,
      p.name AS patient_name,
      p.age,
      p.gender,
      p.phone,
      d.name AS doctor_name,
      d.commission_percent,
      a.associate_code,
      a.name AS associate_name
    FROM visits v
    JOIN patients p ON p.id = v.patient_id
    LEFT JOIN doctors d ON d.id = v.doctor_id
    LEFT JOIN associates a ON a.id = v.associate_id
    WHERE v.id = ?
    `,
    [visitId]
  );

  if (!visit) {
    return null;
  }

  let testQuery = `
    SELECT
      vt.*,
      COALESCE(vt.custom_test_name, t.name) AS name,
      t.code,
      COALESCE(vt.custom_test_price, t.price) AS price,
      u.full_name AS technician_name
    FROM visit_tests vt
    LEFT JOIN tests t ON t.id = vt.test_id
    LEFT JOIN users u ON u.id = vt.assigned_to
    WHERE vt.visit_id = ?
  `;

  const params = [visitId];

  if (user && TECHNICIAN_ROLES.includes(user.role)) {
    testQuery += " AND (vt.assigned_to = ? OR vt.assigned_to IS NULL)";
    params.push(user.id);
  }

  testQuery += " ORDER BY name ASC";

  const tests = await all(testQuery, params);

  for (const test of tests) {
    test.results = await all(
      `SELECT parameter_name, value, unit, normal_range, entry_mode
       FROM results
       WHERE visit_test_id = ?
       ORDER BY id ASC`,
      [test.id]
    );
  }

  return { visit, tests };
}

async function getReportBundle(visitId) {
  const report = await get("SELECT * FROM reports WHERE visit_id = ?", [visitId]);
  if (!report) {
    return null;
  }

  const visit = await get("SELECT * FROM visits WHERE id = ?", [visitId]);
  const patient = await get("SELECT * FROM patients WHERE id = ?", [visit.patient_id]);
  const doctor = visit.doctor_id ? await get("SELECT * FROM doctors WHERE id = ?", [visit.doctor_id]) : null;
  const associate = visit.associate_id ? await get("SELECT * FROM associates WHERE id = ?", [visit.associate_id]) : null;
  const generatedByUser = await get("SELECT full_name FROM users WHERE id = ?", [report.generated_by]);

  const all_tests = await all(
    `
    SELECT
      vt.id AS visit_test_id,
      vt.test_id AS test_id,
      COALESCE(vt.custom_test_name, t.name) AS name,
      t.category,
      t.code,
      t.sample_type,
      t.turnaround_hours,
      t.report_body,
      COALESCE(vt.custom_test_price, t.price) AS price,
      vt.is_outside,
      vt.external_lab_name
    FROM visit_tests vt
    LEFT JOIN tests t ON t.id = vt.test_id
    WHERE vt.visit_id = ?
    ORDER BY vt.id ASC
    `,
    [visitId]
  );

  const tests = all_tests.filter(vt => isPathologyTest(vt.name, vt.category));

  for (const test of tests) {
    test.parameters = await all(
      `
      SELECT parameter_name, value, unit, normal_range, entry_mode
      FROM results
      WHERE visit_test_id = ?
      ORDER BY id ASC
      `,
      [test.visit_test_id]
    );
  }

  const reportTests = await expandBundleReportTests(tests);

  return {
    report,
    visit,
    patient,
    doctor,
    associate,
    tests: reportTests,
    generatedBy: generatedByUser?.full_name,
  };
}

async function getBillBundle(visitId) {
  const visit = await get(
    `SELECT v.*, u.full_name AS creator_name, u.username AS creator_username 
     FROM visits v 
     LEFT JOIN users u ON u.id = v.created_by 
     WHERE v.id = ?`,
    [visitId]
  );
  if (!visit) {
    return null;
  }

  const patient = await get("SELECT * FROM patients WHERE id = ?", [visit.patient_id]);
  const doctor = visit.doctor_id ? await get("SELECT * FROM doctors WHERE id = ?", [visit.doctor_id]) : null;
  const associate = visit.associate_id ? await get("SELECT * FROM associates WHERE id = ?", [visit.associate_id]) : null;
  const tests = await all(
    `
    SELECT 
      vt.*, 
      COALESCE(vt.custom_test_name, t.name) AS name, 
      t.code, 
      COALESCE(vt.custom_test_price, t.price) AS price 
    FROM visit_tests vt 
    LEFT JOIN tests t ON t.id = vt.test_id 
    WHERE vt.visit_id = ? 
    ORDER BY name ASC
    `,
    [visitId]
  );

  return { visit, patient, doctor, associate, tests };
}

visitRouter.get("/", async (req, res, next) => {
  try {
    const status = req.query.status;
    const query = `%${req.query.query || ""}%`;
    const dateFrom = req.query.dateFrom;
    const dateTo = req.query.dateTo;
    const params = [query, query, query];
    let sql = `
      SELECT
        v.id,
        v.patient_id,
        v.bill_no,
        v.total,
        v.amount_paid,
        v.amount_due,
        v.payment_status,
        v.status,
        v.created_at,
        p.name AS patient_name,
        p.patient_code,
        p.created_at AS patient_created_at,
        p.age,
        p.gender,
        p.phone,
        d.name AS doctor_name,
        COALESCE(v.associate_label, a.name, 'Direct at lab') AS associate_name,
        GROUP_CONCAT(COALESCE(vt.custom_test_name, t.name), ', ') AS tests,
        MAX(vt.is_outside) AS has_outside
      FROM visits v
      JOIN patients p ON p.id = v.patient_id
      LEFT JOIN doctors d ON d.id = v.doctor_id
      LEFT JOIN associates a ON a.id = v.associate_id
      LEFT JOIN visit_tests vt ON vt.visit_id = v.id
      LEFT JOIN tests t ON t.id = vt.test_id
      WHERE (v.bill_no LIKE ? OR p.name LIKE ? OR COALESCE(p.phone, '') LIKE ?)
    `;

    if (status) {
      sql += " AND v.status = ?";
      params.push(status);
    }

    if (req.query.due === "1") {
      sql += " AND v.amount_due > 0.005";
    }

    if (dateFrom) {
      sql += " AND DATE(v.created_at, 'localtime') >= ?";
      params.push(dateFrom);
    }

    if (dateTo) {
      sql += " AND DATE(v.created_at, 'localtime') <= ?";
      params.push(dateTo);
    }

    if (TECHNICIAN_ROLES.includes(req.user.role) && !req.query.all) {
      sql += " AND EXISTS (SELECT 1 FROM visit_tests own_vt WHERE own_vt.visit_id = v.id AND (own_vt.assigned_to = ? OR own_vt.assigned_to IS NULL))";
      params.push(req.user.id);
    }

    sql += " GROUP BY v.id ORDER BY datetime(v.created_at) DESC, v.id DESC LIMIT 100";

    const visits = await all(sql, params);
    res.json({ visits });
  } catch (error) {
    next(error);
  }
});

visitRouter.get("/reception-summary", allowRoles(ROLES.ADMIN, ROLES.MANAGER, ROLES.RECEPTIONIST), async (req, res, next) => {
  try {
    const labBills = await get(
      `SELECT COUNT(*) AS count FROM visits 
       WHERE DATE(created_at, 'localtime') = DATE('now', 'localtime') 
       AND sample_source = 'lab'`
    );

    const totalSales = await get(
      `SELECT SUM(amount_paid) AS total FROM visits 
       WHERE DATE(created_at, 'localtime') = DATE('now', 'localtime') 
       AND sample_source = 'lab'`
    );

    const duesCleared = await get(
      `SELECT SUM(CAST(json_extract(l.meta, '$.amount') AS REAL)) AS cleared
       FROM logs l
       JOIN visits v ON l.entity_id = v.id
       WHERE l.action = 'payment_collected'
          AND DATE(l.created_at, 'localtime') = DATE('now', 'localtime')
          AND DATE(v.created_at, 'localtime') < DATE('now', 'localtime')
         AND v.sample_source = 'lab'`
    );

    const salesTotal = totalSales?.total || 0;
    const clearedTotal = duesCleared?.cleared || 0;

    res.json({
      labBills: labBills?.count || 0,
      totalSales: salesTotal,
      totalDuesCleared: clearedTotal,
      totalMoney: salesTotal + clearedTotal
    });
  } catch (error) {
    next(error);
  }
});

visitRouter.get("/technician-summary", allowRoles(ROLES.ADMIN, ...TECHNICIAN_ROLES), async (req, res, next) => {
  try {
    const pending = await get(
      `SELECT COUNT(*) AS count FROM visits 
       WHERE status != 'reported' 
       AND DATE(created_at, 'localtime') = DATE('now', 'localtime')`
    );

    const totalReported = await get(
      `SELECT COUNT(*) AS count FROM visits 
       WHERE DATE(created_at, 'localtime') = DATE('now', 'localtime') 
       AND status = 'reported'`
    );

    const todaySamples = (pending.count || 0) + (totalReported.count || 0);

    res.json({
      pendingReports: pending.count || 0,
      todaySamples: todaySamples,
      totalReported: totalReported.count || 0
    });
  } catch (error) {
    next(error);
  }
});

visitRouter.get("/latest-for-patient/:patientId", async (req, res, next) => {
  try {
    const requestedVisitId = Number(req.query.visitId || 0);
    if (req.query.visitId && (!Number.isInteger(requestedVisitId) || requestedVisitId < 1)) {
      return res.status(400).json({ message: "Invalid visit selected for bill editing" });
    }

    const visit = await get(
      `SELECT v.*, d.id AS doctor_id_val, d.name AS doctor_name, d.phone AS doctor_phone,
              d.specialization AS doctor_specialization
       FROM visits v
       LEFT JOIN doctors d ON d.id = v.doctor_id
       WHERE v.patient_id = ?${requestedVisitId ? " AND v.id = ?" : ""}
       ORDER BY datetime(v.created_at) DESC, v.id DESC LIMIT 1`,
      requestedVisitId ? [req.params.patientId, requestedVisitId] : [req.params.patientId]
    );

    if (!visit) {
      return res.json({ visit: null, tests: [], doctor: null });
    }

    const tests = await all(
      `SELECT vt.*, vt.id AS visit_test_id, t.id AS test_id, COALESCE(vt.custom_test_name, t.name) AS name, t.code, COALESCE(vt.custom_test_price, t.price) AS price
       FROM visit_tests vt LEFT JOIN tests t ON t.id = vt.test_id
       WHERE vt.visit_id = ?
       ORDER BY name ASC`,
      [visit.id]
    );

    const doctor = visit.doctor_name
      ? {
          id: visit.doctor_id,
          name: visit.doctor_name,
          phone: visit.doctor_phone,
          specialization: visit.doctor_specialization,
        }
      : null;

    res.json({ visit, tests, doctor });
  } catch (error) {
    next(error);
  }
});

visitRouter.get("/patient/:patientId", async (req, res, next) => {
  try {
    const visits = await all(
      `SELECT v.*, d.name AS doctor_name,
              (SELECT GROUP_CONCAT(COALESCE(vt.custom_test_name, t.name), ', ')
               FROM visit_tests vt
               LEFT JOIN tests t ON t.id = vt.test_id
               WHERE vt.visit_id = v.id) AS tests
       FROM visits v
       LEFT JOIN doctors d ON d.id = v.doctor_id
       WHERE v.patient_id = ?
       ORDER BY v.created_at DESC`,
      [req.params.patientId]
    );

    res.json(visits);
  } catch (error) {
    next(error);
  }
});

visitRouter.delete(
  "/:id/tests/:visitTestId",
  allowRoles(ROLES.ADMIN, ROLES.RECEPTIONIST),
  async (req, res, next) => {
    try {
      const visit = await get("SELECT * FROM visits WHERE id = ?", [req.params.id]);
      if (!visit) return res.status(404).json({ message: "Visit not found" });

      const visitTest = await get(
        "SELECT * FROM visit_tests WHERE id = ? AND visit_id = ?",
        [req.params.visitTestId, req.params.id]
      );
      if (!visitTest) return res.status(404).json({ message: "Test not found on this visit" });

      const remaining = await get(
        "SELECT COUNT(*) AS count FROM visit_tests WHERE visit_id = ? AND id != ?",
        [req.params.id, req.params.visitTestId]
      );
      if (!remaining.count) {
        return res.status(400).json({ message: "Cannot remove the last test from a visit" });
      }

      await run("DELETE FROM visit_tests WHERE id = ?", [req.params.visitTestId]);

      // Recalculate billing
      const sum = await get(
        `SELECT COALESCE(SUM(COALESCE(vt.custom_test_price, t.price)), 0) AS subtotal
         FROM visit_tests vt LEFT JOIN tests t ON t.id = vt.test_id
         WHERE vt.visit_id = ?`,
        [req.params.id]
      );
      const newSubtotal = sum.subtotal;
      const newTotal = Math.max(0, newSubtotal - Number(visit.discount || 0));
      // Cap amount_paid at new total — overpayment is returned as cash by receptionist
      const newPaid = Math.min(Number(visit.amount_paid || 0), newTotal);
      const newDue = Math.max(0, newTotal - newPaid);
      const paymentStatus = newDue === 0 ? "paid" : newPaid > 0 ? "partial" : "due";

      await run(
        `UPDATE visits SET subtotal = ?, total = ?, amount_paid = ?, amount_due = ?, payment_status = ? WHERE id = ?`,
        [newSubtotal, newTotal, newPaid, newDue, paymentStatus, req.params.id]
      );

      await logAction({
        userId: req.user.id,
        action: "visit_test_removed",
        entityType: "visit",
        entityId: req.params.id,
        meta: { visitTestId: req.params.visitTestId, newTotal },
      });

      const updatedVisit = await get("SELECT * FROM visits WHERE id = ?", [req.params.id]);
      const remainingTests = await all(
        `SELECT vt.id AS visit_test_id, vt.status, t.id AS test_id, COALESCE(vt.custom_test_name, t.name) AS name, t.code, COALESCE(vt.custom_test_price, t.price) AS price
         FROM visit_tests vt LEFT JOIN tests t ON t.id = vt.test_id
         WHERE vt.visit_id = ? ORDER BY name ASC`,
        [req.params.id]
      );

      res.json({ visit: updatedVisit, tests: remainingTests });
    } catch (error) {
      next(error);
    }
  }
);

visitRouter.get(
  "/:id/bill-share",
  allowRoles(ROLES.ADMIN, ROLES.RECEPTIONIST, ...TECHNICIAN_ROLES),
  allowPermissions(PERMISSIONS.MANAGE_BILLING),
  async (req, res, next) => {
    try {
      const bill = await getBillBundle(req.params.id);
      if (!bill) {
        return res.status(404).json({ message: "Bill not found" });
      }

      const businessSettings = await getBusinessSettings();
      res.json({
        billNo: bill.visit.bill_no,
        patientName: bill.patient.name,
        patientPhone: bill.patient.phone || "",
        billUrl: getPatientPortalBillUrl(req, bill.visit.patient_portal_token, businessSettings.patientPortalBaseUrl),
      });
    } catch (error) {
      next(error);
    }
  }
);

visitRouter.patch(
  "/:id/report-contact",
  allowRoles(ROLES.ADMIN, ROLES.RECEPTIONIST, ...TECHNICIAN_ROLES),
  allowPermissions(PERMISSIONS.SHARE_WHATSAPP_PDF),
  async (req, res, next) => {
    try {
      const visitId = Number(req.params.id);
      const phone = String(req.body?.phone || "").trim();
      const phoneDigits = phone.replace(/\D/g, "");

      if (!Number.isInteger(visitId) || visitId <= 0) {
        return res.status(400).json({ message: "Invalid report visit" });
      }

      if (phoneDigits.length < 7 || phoneDigits.length > 15) {
        return res.status(400).json({ message: "Enter a valid patient WhatsApp number" });
      }

      const visit = await get(
        `SELECT v.id, v.bill_no, v.patient_id, v.patient_portal_token, p.name AS patient_name
         FROM visits v
         JOIN patients p ON p.id = v.patient_id
         WHERE v.id = ?`,
        [visitId]
      );
      if (!visit) {
        return res.status(404).json({ message: "Report visit not found" });
      }

      const storedPhone = phone.startsWith("+") ? `+${phoneDigits}` : phoneDigits;
      const portalToken = visit.patient_portal_token || createPatientPortalToken();
      if (!visit.patient_portal_token) {
        await run("UPDATE visits SET patient_portal_token = ? WHERE id = ?", [portalToken, visit.id]);
      }
      await run("UPDATE patients SET phone = ? WHERE id = ?", [storedPhone, visit.patient_id]);
      await logAction({
        userId: req.user.id,
        action: "patient_phone_updated_for_report_share",
        entityType: "patient",
        entityId: visit.patient_id,
        details: `Updated the patient phone number while sharing report ${visit.bill_no}`,
      });

      const businessSettings = await getBusinessSettings();
      res.json({
        patientId: visit.patient_id,
        patientName: visit.patient_name,
        patientPhone: storedPhone,
        billNo: visit.bill_no,
        reportUrl: getPatientPortalReportUrl(req, portalToken, businessSettings.patientPortalBaseUrl),
      });
    } catch (error) {
      next(error);
    }
  }
);

visitRouter.get("/:id/bill", allowRoles(ROLES.ADMIN, ROLES.RECEPTIONIST, ...TECHNICIAN_ROLES), async (req, res, next) => {
  try {
    if (!hasPermission(req.user, PERMISSIONS.MANAGE_BILLING)) {
      return res.status(403).json({ message: "Permission denied" });
    }

    const bill = await getBillBundle(req.params.id);
    if (!bill) {
      return res.status(404).json({ message: "Bill not found" });
    }

    if (req.query.format === "html") {
      res.type("html");
      const businessSettings = await getBusinessSettings({ includeBusinessLogo: true });
      return res.send(buildBillHtml({
        ...bill,
        businessSettings,
        patientPortalUrl: getPatientPortalUrl(req, bill.visit.patient_portal_token, businessSettings.patientPortalBaseUrl),
      }));
    }

    res.json(bill);
  } catch (error) {
    next(error);
  }
});

visitRouter.get(
  "/:id/report",
  allowRoles(ROLES.ADMIN, ROLES.RECEPTIONIST, ...TECHNICIAN_ROLES),
  (req, res, next) => {
    const printMode = req.query.print === "1";
    const pdfMode = req.query.pdf === "1";
    const whatsappPdfMode = req.query.whatsapp === "1";
    const canViewReports = hasPermission(req.user, PERMISSIONS.VIEW_REPORTS);
    // PDF permissions include access to the report itself. This keeps View Report
    // read-only while allowing the two optional actions to be granted separately.
    const canDownloadReportPdf = hasPermission(req.user, PERMISSIONS.DOWNLOAD_REPORTS);
    const canShareWhatsAppPdf = hasPermission(req.user, PERMISSIONS.SHARE_WHATSAPP_PDF);
    const canAccessReport = canViewReports || canDownloadReportPdf || canShareWhatsAppPdf;
    const allowed = printMode
      ? hasPermission(req.user, PERMISSIONS.PRINT_REPORTS)
      : whatsappPdfMode
        ? canShareWhatsAppPdf
        : pdfMode
          ? canDownloadReportPdf
          : canAccessReport;

    if (!allowed) {
      return res.status(403).json({ message: "Permission denied for this action" });
    }
    return next();
  },
  async (req, res, next) => {
    try {
      const report = await getReportBundle(req.params.id);
      if (!report) {
        return res.status(404).json({ message: "Report not found" });
      }

      if (req.query.format === "html") {
        if (req.query.download) {
          res.setHeader("Content-Disposition", `attachment; filename="${report.report.report_no}.html"`);
        }
        res.type("html");
        const businessSettings = await getBusinessSettings({
          includeLetterhead: true,
          includeBusinessLogo: true,
          includeReportDoctorSignature: true,
        });
        const includeLetterhead = req.query.letterhead === "0"
          ? false
          : req.query.letterhead === "1"
            ? true
            : businessSettings.defaultReportIncludesLetterhead;
        const printMode = req.query.print === "1";
        const pdfMode = req.query.pdf === "1";
        const canDownloadReportPdf = hasPermission(req.user, PERMISSIONS.DOWNLOAD_REPORTS);
        const canShareWhatsAppPdf = hasPermission(req.user, PERMISSIONS.SHARE_WHATSAPP_PDF);
        return res.send(buildReportHtml({
          ...report,
          businessName: businessSettings.businessName,
          facilityType: businessSettings.facilityType,
          address: businessSettings.address,
          phone: businessSettings.phone,
          email: businessSettings.email,
          registrationNo: businessSettings.registrationNo,
          digitalReportUrl: getPatientPortalReportUrl(req, report.visit.patient_portal_token, businessSettings.patientPortalBaseUrl),
          letterheadDataUrl: includeLetterhead ? businessSettings.letterheadDataUrl : null,
          businessLogoDataUrl: includeLetterhead && businessSettings.letterheadDataUrl
            ? null
            : businessSettings.businessLogoDataUrl,
          reportHeaderSpaceMm: businessSettings.reportHeaderSpaceMm,
          reportFooterSpaceMm: businessSettings.reportFooterSpaceMm,
          reportDoctorName: businessSettings.reportDoctorName,
          reportDoctorQualification: businessSettings.reportDoctorQualification,
          reportDoctorRegistrationNo: businessSettings.reportDoctorRegistrationNo,
          reportDoctorSignatureDataUrl: businessSettings.reportDoctorSignatureDataUrl,
          showPrintControls: false,
          readOnlyView: !printMode && !pdfMode,
          showReportActions: !printMode && req.query.actions !== "0" && (canDownloadReportPdf || canShareWhatsAppPdf),
          reportActionVisitId: req.params.id,
          reportActionPatientPhone: report.patient.phone,
          canDownloadReportPdf,
          canShareWhatsAppPdf,
        }));
      }

      res.json(report);
    } catch (error) {
      next(error);
    }
  }
);

visitRouter.patch(
  "/:id/payment",
  allowPermissions(PERMISSIONS.COLLECT_DUE_PAYMENTS),
  async (req, res, next) => {
    try {
      const amount = Number(req.body.amountPaid);
      const paymentMode = req.body.paymentMode || "cash";

      if (!Number.isFinite(amount) || amount <= 0) {
        return res.status(400).json({ message: "Enter a valid payment amount" });
      }

      if (!PAYMENT_MODES.includes(paymentMode)) {
        return res.status(400).json({ message: "Invalid payment mode" });
      }

      const visit = await transaction(async () => {
        const current = await get("SELECT * FROM visits WHERE id = ?", [req.params.id]);
        if (!current) {
          throw httpError("Visit not found", 404);
        }

        const currentDue = Number(current.amount_due || 0);
        if (currentDue <= 0.005) {
          throw httpError("No due amount is pending for this bill", 400);
        }

        if (amount > currentDue + 0.005) {
          throw httpError("Payment exceeds the outstanding amount", 400);
        }

        const collected = Math.min(amount, currentDue);
        const newPaid = Number(current.amount_paid || 0) + collected;
        const newDue = Math.max(0, Number(current.total || 0) - newPaid);
        const paymentStatus = newDue === 0 ? "paid" : "partial";

        await run(
          `UPDATE visits
           SET amount_paid = ?, amount_due = ?, payment_mode = ?, payment_status = ?
           WHERE id = ?`,
          [newPaid, newDue, paymentMode, paymentStatus, req.params.id]
        );

        await logAction({
          userId: req.user.id,
          action: "payment_collected",
          entityType: "visit",
          entityId: req.params.id,
          meta: { amount: collected, mode: paymentMode, newDue },
        });

        return get("SELECT * FROM visits WHERE id = ?", [req.params.id]);
      });

      res.json({ visit });
    } catch (error) {
      next(error);
    }
  }
);

visitRouter.get("/:id", async (req, res, next) => {
  try {
    const data = await getVisitDetails(req.params.id, req.user);
    if (!data) {
      return res.status(404).json({ message: "Visit not found" });
    }

    if (TECHNICIAN_ROLES.includes(req.user.role)) {
      if (!data.tests.length) {
        return res.status(403).json({ message: "Permission denied" });
      }
    }

    res.json(data);
  } catch (error) {
    next(error);
  }
});

visitRouter.post(
  "/",
  allowRoles(ROLES.ADMIN, ROLES.RECEPTIONIST, ...TECHNICIAN_ROLES),
  // Patient registration includes creating the initial visit.  Billing access is
  // deliberately separate so a registration-only technician cannot open the
  // wider billing workspace or print other patients' bills.
  allowPermissions(PERMISSIONS.MANAGE_PATIENTS),
  async (req, res, next) => {
  try {
    const {
      patient,
      doctorId,
      testIds = [],
      discount = 0,
      amountPaid = 0,
      paymentMode = "cash",
      associateId,
      associateName,
      sampleSource = "lab",
      registrationTime,
    } = req.body;

    if (!PAYMENT_MODES.includes(paymentMode)) {
      return res.status(400).json({ message: "Invalid payment mode" });
    }

    const tests = [];
    const requestedTestConfigs = Array.isArray(req.body.tests) ? req.body.tests : (testIds || []).map(id => ({ id }));
    const materializedTests = await materializeRegistrationTests(requestedTestConfigs);
    const testConfigs = await expandTestBundleConfigs(materializedTests.testConfigs);
    
    for (const config of testConfigs) {
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

    if (!tests.length) {
      return res.status(400).json({ message: "Select at least one test" });
    }

    let associateRecord = null;
    if (sampleSource === "associate") {
      if (!associateId) {
        return res.status(400).json({ message: "Select an associate or collector" });
      }
      associateRecord = await get("SELECT * FROM associates WHERE id = ? AND active = 1", [associateId]);
      if (!associateRecord) {
        return res.status(400).json({ message: "Associate not found" });
      }
    }

    const visit = await transaction(async () => {
    const patientId = await createPatientIfNeeded(patient, registrationTime);
    const subtotal = tests.reduce((sum, test) => sum + Number(test.price), 0);
    const total = Math.max(0, subtotal - Number(discount || 0));
    const due = Math.max(0, total - Number(amountPaid || 0));
    const paymentStatus = due === 0 ? "paid" : amountPaid > 0 ? "partial" : "due";
    const created = await run(
      `
      INSERT INTO visits (
        bill_no, patient_id, doctor_id, subtotal, discount, total, amount_paid,
        amount_due, payment_mode, payment_status, associate_id, associate_label, sample_source,
        status, created_by, created_at, patient_portal_token
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP), ?)
      `,
      [
        await nextDailySequenceId("BILL", "visits", "bill_no"),
        patientId,
        doctorId || null,
        subtotal,
        discount || 0,
        total,
        amountPaid || 0,
        due,
        paymentMode,
        paymentStatus,
        associateRecord?.id || null,
        associateRecord ? `${associateRecord.name} (${associateRecord.associate_code})` : (associateName || "Direct at lab"),
        sampleSource,
        VISIT_STATUS.REGISTERED,
        req.user.id,
        registrationTime ? new Date(registrationTime).toISOString() : new Date().toISOString(),
        createPatientPortalToken(),
      ]
    );

    let technicians = [];
    if (TECHNICIAN_ROLES.includes(req.user.role)) {
      technicians = [{ id: req.user.id }];
    } else {
      technicians = await all(
        `SELECT id FROM users WHERE role IN (${TECHNICIAN_ROLES.map(() => "?").join(",")}) AND active = 1 ORDER BY id ASC`,
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

    await logAction({
      userId: req.user.id,
      action: "visit_create",
      entityType: "visit",
      entityId: created.id,
      meta: {
        patient: patient.name,
        tests: tests.map((test) => test.name),
        newlyAddedCatalogueTests: materializedTests.createdTests.map((test) => test.name),
        sampleSource,
        associate: associateRecord?.name || "Direct at lab",
      },
    });

      return getVisitDetails(created.id);
    });

    res.status(201).json(visit);
  } catch (error) {
    next(error);
  }
});

visitRouter.post(
  "/:id/results",
  allowRoles(ROLES.ADMIN, ...TECHNICIAN_ROLES),
  allowPermissions(PERMISSIONS.ENTER_RESULTS),
  async (req, res, next) => {
  try {
    const { visitTestId, parameters = [] } = req.body;
    const visitTest = await get(
      `SELECT vt.*, COALESCE(vt.custom_test_name, t.name) AS name, t.category, t.code, COALESCE(vt.custom_test_price, t.price) AS price, vt.external_lab_name
      FROM visit_tests vt
      LEFT JOIN tests t ON t.id = vt.test_id
      WHERE vt.id = ? AND vt.visit_id = ?
      `,
      [visitTestId, req.params.id]
    );

    if (!visitTest) {
      return res.status(404).json({ message: "Assigned test not found" });
    }
    if (isBillingOnlyTest(visitTest)) return res.status(400).json({ message: BILLING_ONLY_MESSAGE });

    if (TECHNICIAN_ROLES.includes(req.user.role) && visitTest.assigned_to && visitTest.assigned_to !== req.user.id) {
      return res.status(403).json({ message: "This test is not assigned to you" });
    }

    const report = await get("SELECT * FROM reports WHERE visit_id = ?", [req.params.id]);
    if (report?.finalized) {
      const reportAction = await getReportUserAction(report.id, req.user.id);
      const allowMultipleEdit = hasAccessControl(req.user, ACCESS_CONTROLS.MULTIPLE_REPORT_EDIT);
      if (!allowMultipleEdit && reportAction.edit_count >= 1) {
        return res.status(403).json({ message: "Report editing is allowed only once for this user" });
      }
    }

    const catalogParameters = visitTest.test_id
      ? await all(
        `SELECT parameter_name, unit, normal_range, entry_mode, calculation_formula, calculation_precision
         FROM test_parameters
         WHERE test_id = ?
         ORDER BY display_order ASC, id ASC`,
        [visitTest.test_id]
      )
      : [];
    const resolvedParameters = applyCalculatedParameters(catalogParameters, parameters);

    await run("DELETE FROM results WHERE visit_test_id = ?", [visitTestId]);

    for (const parameter of resolvedParameters) {
      await run(
        `
        INSERT INTO results (
          visit_test_id, parameter_name, value, unit, normal_range, entry_mode, entered_by, entered_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `,
        [
          visitTestId,
          parameter.parameter_name,
          parameter.value,
          parameter.unit,
          parameter.normal_range,
          parameter.entry_mode,
          req.user.id,
        ]
      );
    }

    const assignmentClaimUserId = TECHNICIAN_ROLES.includes(req.user.role) ? req.user.id : null;
    await run(
      `UPDATE visit_tests
       SET status = 'completed',
           result_entered_at = CURRENT_TIMESTAMP,
           assigned_to = COALESCE(assigned_to, ?)
       WHERE id = ?`,
      [assignmentClaimUserId, visitTestId]
    );

    if (report?.finalized) {
      const reportAction = await getReportUserAction(report.id, req.user.id);
      await run(
        `UPDATE report_user_actions
         SET edit_count = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [Number(reportAction.edit_count || 0) + 1, reportAction.id]
      );
    }

    await run(
      `UPDATE visits
       SET status = ?
       WHERE id = ?`,
      [VISIT_STATUS.IN_PROGRESS, req.params.id]
    );

    await logAction({
      userId: req.user.id,
      action: "result_entered",
      entityType: "visit_test",
      entityId: visitTestId,
      meta: { parameterCount: parameters.length },
    });

    res.json({ ok: true, parameters: resolvedParameters });
  } catch (error) {
    next(error);
  }
});

visitRouter.post(
  "/:id/finalize-report",
  allowRoles(ROLES.ADMIN, ...TECHNICIAN_ROLES),
  allowPermissions(PERMISSIONS.FINALIZE_REPORTS),
  async (req, res, next) => {
  try {
    const visit = await get("SELECT * FROM visits WHERE id = ?", [req.params.id]);
    if (!visit) return res.status(404).json({ message: "Visit not found" });

    const visitTests = await all(
      `SELECT vt.*, t.name, t.category 
       FROM visit_tests vt 
       LEFT JOIN tests t ON vt.test_id = t.id 
       WHERE vt.visit_id = ?`,
      [req.params.id]
    );

    if (!visitTests.length) {
      return res.status(400).json({ message: "No tests on this visit" });
    }

    const pathTests = visitTests.filter(vt => isPathologyTest(vt.custom_test_name || vt.name, vt.category));

    if (!pathTests.length) {
      return res.status(400).json({ message: "No pathology tests to finalize on this visit" });
    }

    const allPathCompleted = pathTests.every((t) => t.status === "completed" || t.status === "reported");
    if (!allPathCompleted) {
      return res.status(400).json({ message: "All pathology tests must be completed before finalizing" });
    }

    const hasReferringDoctorInput = Object.prototype.hasOwnProperty.call(req.body || {}, "referringDoctorName");
    let resolvedReferringDoctor = null;
    let referringDoctorCreated = false;
    let linkedDoctorId = visit.doctor_id || null;

    await transaction(async () => {
      if (hasReferringDoctorInput) {
        resolvedReferringDoctor = await resolveReportReferringDoctor(req.body.referringDoctorName);
        if (resolvedReferringDoctor.provided) {
          linkedDoctorId = resolvedReferringDoctor.doctor?.id || null;
          referringDoctorCreated = resolvedReferringDoctor.created;
        }
      }

      const existingReport = await get("SELECT * FROM reports WHERE visit_id = ?", [req.params.id]);
      if (existingReport) {
        await run(
          `UPDATE reports SET finalized = 1, finalized_at = CURRENT_TIMESTAMP WHERE id = ?`,
          [existingReport.id]
        );
      } else {
        await run(
          `INSERT INTO reports (visit_id, report_no, generated_by, finalized, finalized_at)
           VALUES (?, ?, ?, 1, CURRENT_TIMESTAMP)`,
          [
            req.params.id,
            await nextDailySequenceId("RPT", "reports", "report_no"),
            req.user.id,
          ]
        );
      }

      await run(
        `UPDATE visits SET status = 'reported', doctor_id = ? WHERE id = ?`,
        [linkedDoctorId, req.params.id]
      );

      for (const t of pathTests) {
        if (t.status === 'completed') {
          await run(
            `UPDATE visit_tests SET status = 'reported', finalized_at = CURRENT_TIMESTAMP WHERE id = ?`,
            [t.id]
          );
        }
      }

      await logAction({
        userId: req.user.id,
        action: "report_finalized",
        entityType: "visit",
        entityId: req.params.id,
        meta: {
          referringDoctorId: linkedDoctorId,
          referringDoctorCreated,
        },
      });
    });

    if (referringDoctorCreated && resolvedReferringDoctor?.doctor) {
      await logAction({
        userId: req.user.id,
        action: "doctor_create",
        entityType: "doctor",
        entityId: resolvedReferringDoctor.doctor.id,
        meta: { name: resolvedReferringDoctor.doctor.name, autoCreatedFrom: "report_finalization" },
      });
    }

    res.json({
      ok: true,
      doctor: resolvedReferringDoctor?.doctor || null,
      doctorCreated: referringDoctorCreated,
    });
  } catch (error) {
    next(error);
  }
});

visitRouter.post(
  "/:id/print",
  allowRoles(ROLES.ADMIN, ROLES.MANAGER, ROLES.RECEPTIONIST, ...TECHNICIAN_ROLES),
  allowPermissions(PERMISSIONS.PRINT_REPORTS),
  async (req, res, next) => {
  try {
    const report = await get("SELECT * FROM reports WHERE visit_id = ?", [req.params.id]);
    if (!report) return res.status(404).json({ message: "Report not found" });

    const reportAction = await getReportUserAction(report.id, req.user.id);
    if (!req.user.accessControls?.[ACCESS_CONTROLS.MULTIPLE_REPORT_PRINT] && Number(reportAction.print_count || 0) > 0) {
      return res.status(403).json({ message: "Multiple report printing not allowed for this user" });
    }

    await run(
      `UPDATE report_user_actions SET print_count = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [Number(reportAction.print_count || 0) + 1, reportAction.id]
    );

    await logAction({
      userId: req.user.id,
      action: "report_printed",
      entityType: "visit",
      entityId: req.params.id,
    });

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

visitRouter.post("/:id/bill-print", allowRoles(ROLES.ADMIN, ROLES.RECEPTIONIST, ...TECHNICIAN_ROLES), async (req, res, next) => {
  try {
    if (!hasPermission(req.user, PERMISSIONS.MANAGE_BILLING)) {
      return res.status(403).json({ message: "Permission denied" });
    }

    const billAction = await getBillUserAction(req.params.id, req.user.id);
    if (!req.user.accessControls?.[ACCESS_CONTROLS.MULTIPLE_BILL_PRINT] && Number(billAction.print_count || 0) > 0) {
      return res.status(403).json({ message: "Multiple bill printing not allowed for this user" });
    }

    await run(
      `UPDATE bill_user_actions SET print_count = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [Number(billAction.print_count || 0) + 1, billAction.id]
    );

    await logAction({
      userId: req.user.id,
      action: "bill_printed",
      entityType: "visit",
      entityId: req.params.id,
    });

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

module.exports = { visitRouter, getReportBundle, getBillBundle };
