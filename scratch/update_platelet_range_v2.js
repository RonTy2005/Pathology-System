const sqlite3 = require('sqlite3');
const db = new sqlite3.Database('lab-lms.db');

db.all("SELECT id FROM tests WHERE name = 'Platelet Count'", (err, rows) => {
    if (err) {
        console.error(err);
        process.exit(1);
    }
    
    if (rows.length === 0) {
        console.log("Test not found");
        process.exit(0);
    }
    
    const testId = rows[0].id;
    
    db.run("UPDATE test_parameters SET unit = 'cumm', normal_range = '150000 - 410000' WHERE test_id = ? AND parameter_name = 'Platelet Count'", [testId], (err) => {
        if (err) console.error("Error updating parameter", err);
        else console.log("Updated Platelet Count parameter for test ID: " + testId);
    });
});
