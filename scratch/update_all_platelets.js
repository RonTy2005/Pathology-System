const sqlite3 = require('sqlite3');
const db = new sqlite3.Database('lab-lms.db');

db.all("SELECT id, parameter_name, unit, normal_range FROM test_parameters WHERE parameter_name = 'Platelet Count'", (err, rows) => {
    if (err) {
        console.error(err);
        process.exit(1);
    }
    
    console.log(`Found ${rows.length} parameters to update.`);
    
    rows.forEach(row => {
        db.run("UPDATE test_parameters SET unit = 'cumm', normal_range = '150000 - 410000' WHERE id = ?", [row.id], (err) => {
            if (err) console.error("Error updating parameter ID: " + row.id, err);
            else console.log("Updated parameter ID: " + row.id);
        });
    });
});
