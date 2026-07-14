const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('lab-lms.db');

const testId = 1098;

db.serialize(() => {
    // 1. Update Test name to the top heading
    db.run("UPDATE tests SET name = ? WHERE id = ?", [
        "Activated partial thromboplastin time, APTT",
        testId
    ]);

    // 2. Update parameters to match the image exactly
    db.run("DELETE FROM test_parameters WHERE test_id = ?", [testId]);

    const params = [
        ["PARTIAL THROMBOPLASTIN TIME, ACTIVATED (APTT)", "", "", 1],
        ["Patient Value", "Sec", "23.70 - 33.00", 2],
        ["Control Value", "Sec", "28.40", 3]
    ];

    const stmt = db.prepare("INSERT INTO test_parameters (test_id, parameter_name, unit, normal_range, display_order) VALUES (?, ?, ?, ?, ?)");
    for (const p of params) {
        stmt.run(testId, ...p);
    }
    stmt.finalize();

    console.log("APTT parameters updated to match image.");
    db.close();
});
