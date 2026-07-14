const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('lab-lms.db');

const testId = 1098;

db.serialize(() => {
    // 1. Clean up test name - remove the code if it's there
    db.run("UPDATE tests SET name = ? WHERE id = ?", [
        "Activated partial thromboplastin time, APTT",
        testId
    ]);

    // 2. Update Control Value parameter - clear the normal_range (Reference Value)
    db.run("UPDATE test_parameters SET normal_range = '' WHERE test_id = ? AND parameter_name = ?", [
        testId,
        "Control Value"
    ]);

    console.log("APTT name and control value reference cleared.");
    db.close();
});
