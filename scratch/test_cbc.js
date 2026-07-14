const { request } = require("../frontend/scripts/common.js"); // Wait, I can't require frontend scripts in Node directly easily without setup.
// I'll use a script that uses the backend helpers directly to simulate the process.

const { run, get, all } = require("../src/db/helpers");

async function testCBCWorkflow() {
  console.log("Starting CBC Workflow Test...");

  // 1. Create a patient
  const patientResult = await run(
    "INSERT INTO patients (patient_code, name, age, gender, phone) VALUES (?, ?, ?, ?, ?)",
    [`P-TEST-${Date.now()}`, "Test Mita Ghosh", 28, "Female", "9876543210"]
  );
  const patientId = patientResult.id;

  // 2. Create a visit with CBC (test_id = 1)
  const billNo = `TEST-${Date.now()}`;
  const visitResult = await run(
    `INSERT INTO visits (bill_no, patient_id, subtotal, discount, total, amount_paid, amount_due, status, payment_mode, payment_status, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [billNo, patientId, 350, 0, 350, 350, 0, "registered", "cash", "paid", 1]
  );
  const visitId = visitResult.id;

  await run(
    "INSERT INTO visit_tests (visit_id, test_id, status) VALUES (?, ?, ?)",
    [visitId, 1, "pending"]
  );
  const visitTestId = (await get("SELECT id FROM visit_tests WHERE visit_id = ?", [visitId])).id;

  console.log(`Created Patient ID: ${patientId}, Visit ID: ${visitId}, VisitTest ID: ${visitTestId}`);

  // 3. Enter results
  // Parameters to enter: Hemoglobin, Total Leukocyte Count, Total RBC Count, Hematocrit Value, Hct, Neutrophils, Lymphocyte, Eosinophils, Monocytes, Basophils, Platelet Count
  const results = [
    { name: "Hemoglobin", value: "14.2" },
    { name: "Total Leukocyte Count", value: "7500" },
    { name: "Total RBC Count", value: "4.5" },
    { name: "Hematocrit Value, Hct", value: "42.5" },
    { name: "Neutrophils", value: "65" },
    { name: "Lymphocyte", value: "25" },
    { name: "Eosinophils", value: "4" },
    { name: "Monocytes", value: "5" },
    { name: "Basophils", value: "1" },
    { name: "Platelet Count", value: "2.8" },
    // Calculated ones (simulating UI calculation)
    { name: "Mean Corpuscular Volume, MCV", value: "94.4" },
    { name: "Mean Cell Haemoglobin, MCH", value: "31.6" },
    { name: "Mean Cell Haemoglobin CON, MCHC", value: "33.4" },
    { name: "Absolute Neutrophil Count", value: "4875" },
    { name: "Absolute Lymphocyte Count", value: "1875" }
  ];

  for (const r of results) {
    await run(
      "INSERT INTO results (visit_test_id, parameter_name, value, entered_by) VALUES (?, ?, ?, ?)",
      [visitTestId, r.name, r.value, 1]
    );
  }
  
  await run("UPDATE visit_tests SET status = 'completed' WHERE id = ?", [visitTestId]);
  await run("UPDATE visits SET status = 'reported' WHERE id = ?", [visitId]);

  // 4. Finalize report
  await run(
    "INSERT INTO reports (visit_id, report_no, generated_by, finalized, finalized_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)",
    [visitId, `RPT-${Date.now()}`, 1, 1]
  );

  console.log("Report finalized. Fetching report data...");

  // 5. Build report HTML to verify
  const { buildReportHtml } = require("../src/utils/reportFormatter");
  
  // Mock report data
  const reportData = {
    report: { report_no: "RPT-TEST-001", finalized_at: new Date().toISOString() },
    patient: { id: patientId, name: "Test Mita Ghosh", age: 28, gender: "Female" },
    visit: { bill_no: billNo, sample_source: "lab" },
    tests: [
      {
        name: "Complete Blood Count",
        parameters: results.map(r => {
            // Find normal range and unit from DB
            return { parameter_name: r.name, value: r.value, unit: "", normal_range: "" };
        })
      }
    ]
  };

  // We need to fetch real data from DB to get ranges/units
  const dbParams = await all("SELECT * FROM test_parameters WHERE test_id = 1");
  reportData.tests[0].parameters = dbParams.map(p => {
    const res = results.find(r => r.name === p.parameter_name);
    return {
        parameter_name: p.parameter_name,
        value: res ? res.value : null,
        unit: p.unit,
        normal_range: p.normal_range
    };
  });

  const html = buildReportHtml(reportData);
  const fs = require("fs");
  const path = require("path");
  fs.writeFileSync(path.resolve(__dirname, "test_cbc_report.html"), html);
  
  console.log("Test report generated: scratch/test_cbc_report.html");
}

testCBCWorkflow().catch(console.error);
