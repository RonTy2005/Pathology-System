const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('lab-lms.db');

const testId = 1098;

db.serialize(() => {
    // 1. Update Test name and sample type
    db.run("UPDATE tests SET name = ?, sample_type = ? WHERE id = ?", [
        "Activated partial thromboplastin time, APTT",
        "Citrated plasma",
        testId
    ]);

    // 2. Clear old parameters
    db.run("DELETE FROM test_parameters WHERE test_id = ?", [testId]);

    // 3. Insert new parameters
    const params = [
        ["Patient Value", "Sec", "23.70 - 33.00", 1],
        ["Control Value", "Sec", "", 2]
    ];

    const stmt = db.prepare("INSERT INTO test_parameters (test_id, parameter_name, unit, normal_range, display_order) VALUES (?, ?, ?, ?, ?)");
    for (const p of params) {
        stmt.run(testId, ...p);
    }
    stmt.finalize();

    console.log("APTT test and parameters updated.");
    db.close();
});
