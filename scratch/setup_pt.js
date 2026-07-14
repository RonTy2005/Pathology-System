const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('lab-lms.db');

const testId = 718;

db.serialize(() => {
    // 1. Update Test name
    db.run("UPDATE tests SET name = ?, sample_type = ? WHERE id = ?", [
        "Prothrombin Time with INR",
        "Citrated plasma",
        testId
    ]);

    // 2. Clear old parameters
    db.run("DELETE FROM test_parameters WHERE test_id = ?", [testId]);

    // 3. Insert new parameters
    const params = [
        ["PROTHROMBIN TIME STUDIES", "", "", 1],
        ["Mean Normal Prothrombin Time (PT)", "Sec", "", 2],
        ["Patient value", "Sec", "9.60 - 11.70", 3],
        ["Prothrombin Ratio (PR)", "", "", 4],
        ["International Normalized Ratio (INR)", "", "0.90 - 1.10", 5]
    ];

    const stmt = db.prepare("INSERT INTO test_parameters (test_id, parameter_name, unit, normal_range, display_order) VALUES (?, ?, ?, ?, ?)");
    for (const p of params) {
        stmt.run(testId, ...p);
    }
    stmt.finalize();

    console.log("Prothrombin Time test and parameters updated.");
    db.close();
});
