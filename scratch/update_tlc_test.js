const sqlite3 = require('sqlite3');
const db = new sqlite3.Database('lab-lms.db');

const testId = 827; // Existing TLC test ID

db.serialize(() => {
    // Update test name and price
    db.run("UPDATE tests SET name = 'TOTAL LEUCOCYTE COUNT (TLC)', price = 50 WHERE id = ?", [testId]);
    
    // Delete existing parameters
    db.run("DELETE FROM test_parameters WHERE test_id = ?", [testId]);
    
    // Insert new parameters
    const params = [
        ['Primary Sample Type', '', '', 1],
        ['TOTAL LEUCOCYTE COUNT (TLC)', 'cumm', '4000-11000', 2]
    ];
    
    params.forEach(p => {
        db.run("INSERT INTO test_parameters (test_id, parameter_name, unit, normal_range, display_order) VALUES (?, ?, ?, ?, ?)", [testId, ...p]);
    });
    
    console.log("Updated test catalog for TOTAL LEUCOCYTE COUNT (TLC)");
});
