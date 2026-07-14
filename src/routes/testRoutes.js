const express = require("express");
const { all, get, run, transaction } = require("../db/helpers");
const { allowPermissions, allowRoles } = require("../middleware/auth");
const { logAction } = require("../services/logService");
const { PERMISSIONS, ROLES } = require("../config/constants");

const testRouter = express.Router();
const { buildReportHtml } = require("../utils/reportFormatter");

testRouter.get("/:id/sample-report", allowRoles(ROLES.ADMIN), async (req, res, next) => {
  try {
    const test = await get("SELECT * FROM tests WHERE id = ?", [req.params.id]);
    if (!test) {
      return res.status(404).json({ message: "Test not found" });
    }

    const parameters = await all(
      `SELECT parameter_name, unit, normal_range FROM test_parameters WHERE test_id = ? ORDER BY display_order ASC, id ASC`,
      [test.id]
    );

    // Construct mock report data
    const mockReportData = {
      patient: {
        id: "SAMPLE-P-001",
        name: "SAMPLE PATIENT",
        age: "30",
        gender: "Male",
        phone: "9999999999"
      },
      visit: {
        bill_no: "SAMPLE-001",
        created_at: new Date().toISOString(),
        associate_label: "Direct at lab"
      },
      report: {
        report_no: "SAMPLE-R-001",
        finalized_at: new Date().toISOString()
      },
      doctor: {
        name: "Dr. Sample Doctor",
        specialization: "General Physician"
      },
      associate: null,
      tests: [
        {
          name: test.name,
          code: test.code,
          category: test.category,
          parameters: parameters.map(p => {
            // Try to provide a "normal" value
            let value = "Normal";
            if (p.parameter_name.toUpperCase() === "PROTHROMBIN TIME STUDIES") {
               value = "";
            } else if (p.parameter_name.toLowerCase().includes('value') || p.parameter_name.toLowerCase().includes('prothrombin time') || p.parameter_name.toLowerCase().includes('ratio') || p.parameter_name.toLowerCase().includes('inr')) {
               if (p.parameter_name.toLowerCase().includes('patient')) value = "12.10";
               else if (p.parameter_name.toLowerCase().includes('mean normal')) value = "10.60";
               else if (p.parameter_name.toLowerCase().includes('inr')) value = "1.00";
               else if (p.parameter_name.toLowerCase().includes('ratio') || p.parameter_name.toLowerCase().includes('pr')) value = "1.15";
               else value = "10.60";
            } else if (p.normal_range) {
              const match = p.normal_range.match(/(\d+\.?\d*)\s*-\s*(\d+\.?\d*)/);
              if (match) {
                // Return low end of range as sample
                value = match[1];
              }
            }
            return {
              parameter_name: p.parameter_name,
              unit: p.unit,
              normal_range: p.normal_range,
              value: value
            };
          })
        }
      ]
    };

    res.type("html");
    res.send(buildReportHtml(mockReportData));
  } catch (error) {
    next(error);
  }
});

testRouter.get("/", async (req, res, next) => {
  try {
    const query = `%${req.query.query || ""}%`;
    const tests = await all(
      `
      SELECT *
      FROM tests
      WHERE active = 1
        AND (name LIKE ? OR COALESCE(code, '') LIKE ? OR COALESCE(category, '') LIKE ?)
      ORDER BY name ASC
      `,
      [query, query, query]
    );

    for (const test of tests) {
      test.parameters = await all(
        `SELECT id, parameter_name, unit, normal_range, display_order
         FROM test_parameters
         WHERE test_id = ?
         ORDER BY display_order ASC, id ASC`,
        [test.id]
      );
    }

    res.json({ tests });
  } catch (error) {
    next(error);
  }
});

testRouter.get("/categories", async (req, res, next) => {
  try {
    const categories = await all(
      `SELECT DISTINCT category FROM tests WHERE category IS NOT NULL AND active = 1 ORDER BY category ASC`
    );
    res.json({ categories: categories.map((c) => c.category) });
  } catch (error) {
    next(error);
  }
});

testRouter.post("/", allowRoles(ROLES.ADMIN, ROLES.MANAGER, ROLES.RECEPTIONIST), allowPermissions(PERMISSIONS.MANAGE_TESTS), async (req, res, next) => {
  try {
    const { name, code, category, sampleType, price, turnaroundHours, parameters = [] } = req.body;
    const created = await run(
      `INSERT INTO tests (name, code, category, sample_type, price, turnaround_hours, active, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP)`,
      [name, code, category, sampleType, price, turnaroundHours || 24]
    );

    for (let index = 0; index < parameters.length; index += 1) {
      const parameter = parameters[index];
      await run(
        `INSERT INTO test_parameters (test_id, parameter_name, unit, normal_range, display_order)
         VALUES (?, ?, ?, ?, ?)`,
        [
          created.id,
          parameter.parameterName,
          parameter.unit || "",
          parameter.normalRange || "",
          index + 1,
        ]
      );
    }

    const test = await get("SELECT * FROM tests WHERE id = ?", [created.id]);

    await logAction({
      userId: req.user.id,
      action: "test_create",
      entityType: "test",
      entityId: created.id,
      meta: { name, code },
    });

    res.status(201).json({ test });
  } catch (error) {
    if (error.message.includes("UNIQUE")) {
      res.status(400).json({ message: "Test name or code already exists" });
      return;
    }
    next(error);
  }
});

testRouter.post(
  "/import",
  allowRoles(ROLES.ADMIN, ROLES.MANAGER, ROLES.RECEPTIONIST),
  allowPermissions(PERMISSIONS.MANAGE_TESTS),
  async (req, res, next) => {
    try {
      const tests = req.body.tests;
      if (!Array.isArray(tests) || !tests.length) {
        return res.status(400).json({ message: "Provide a non-empty tests array" });
      }

      const createdTests = [];
      for (const testData of tests) {
        const name = testData.name?.trim();
        if (!name) {
          continue;
        }

        const code = testData.code?.trim() || null;
        const category = testData.category?.trim() || null;
        const sampleType = testData.sampleType?.trim() || null;
        const price = Number(testData.price || 0);
        const turnaroundHours = Number(testData.turnaroundHours || 24);
        const parameters = Array.isArray(testData.parameters) ? testData.parameters : [];

        let test = await get(`SELECT * FROM tests WHERE name = ? OR code = ?`, [name, code]);

        if (test) {
          await run(
            `UPDATE tests SET name = ?, code = ?, category = ?, sample_type = ?, price = ?, turnaround_hours = ?, active = 1 WHERE id = ?`,
            [name, code, category, sampleType, price, turnaroundHours, test.id]
          );
        } else {
          test = await run(
            `INSERT INTO tests (name, code, category, sample_type, price, turnaround_hours, active, created_at)
             VALUES (?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP)`,
            [name, code, category, sampleType, price, turnaroundHours]
          );
        }

        const testId = test.id;
        await run("DELETE FROM test_parameters WHERE test_id = ?", [testId]);

        for (let index = 0; index < parameters.length; index += 1) {
          const parameter = parameters[index] || {};
          await run(
            `INSERT INTO test_parameters (test_id, parameter_name, unit, normal_range, display_order)
             VALUES (?, ?, ?, ?, ?)`,
            [testId, parameter.parameterName || parameter.parameter_name || "", parameter.unit || "", parameter.normalRange || parameter.normal_range || "", index + 1]
          );
        }

        createdTests.push(testId);
      }

      res.status(201).json({ imported: createdTests.length });
    } catch (error) {
      next(error);
    }
  }
);

testRouter.put("/:id", allowRoles(ROLES.ADMIN, ROLES.MANAGER, ROLES.RECEPTIONIST), allowPermissions(PERMISSIONS.MANAGE_TESTS), async (req, res, next) => {
  try {
    const { name, code, category, sampleType, price, turnaroundHours, active, parameters = [] } = req.body;
    await run(
      `UPDATE tests
       SET name = ?, code = ?, category = ?, sample_type = ?, price = ?, turnaround_hours = ?, active = ?
       WHERE id = ?`,
      [name, code, category, sampleType, price, turnaroundHours || 24, active ? 1 : 0, req.params.id]
    );
    await run("DELETE FROM test_parameters WHERE test_id = ?", [req.params.id]);

    for (let index = 0; index < parameters.length; index += 1) {
      const parameter = parameters[index];
      await run(
        `INSERT INTO test_parameters (test_id, parameter_name, unit, normal_range, display_order)
         VALUES (?, ?, ?, ?, ?)`,
        [req.params.id, parameter.parameterName, parameter.unit || "", parameter.normalRange || "", index + 1]
      );
    }

    await logAction({
      userId: req.user.id,
      action: "test_update",
      entityType: "test",
      entityId: req.params.id,
      meta: { name, code },
    });

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

testRouter.delete("/:id", allowRoles(ROLES.ADMIN, ROLES.MANAGER, ROLES.RECEPTIONIST), allowPermissions(PERMISSIONS.MANAGE_TESTS), async (req, res, next) => {
  try {
    const test = await get("SELECT * FROM tests WHERE id = ?", [req.params.id]);
    if (!test) {
      return res.status(404).json({ message: "Test not found" });
    }

    await transaction(async () => {
      await run(
        `UPDATE visit_tests
         SET custom_test_name = COALESCE(custom_test_name, ?),
             custom_test_price = COALESCE(custom_test_price, ?),
             test_id = NULL
         WHERE test_id = ?`,
        [test.name, test.price, req.params.id]
      );
      await run("DELETE FROM test_parameters WHERE test_id = ?", [req.params.id]);
      await run("DELETE FROM tests WHERE id = ?", [req.params.id]);
    });

    await logAction({
      userId: req.user.id,
      action: "test_delete",
      entityType: "test",
      entityId: req.params.id,
      meta: { name: test.name, code: test.code },
    });

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

module.exports = { testRouter };
