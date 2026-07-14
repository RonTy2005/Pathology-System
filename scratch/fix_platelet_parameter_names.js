const sqlite3 = require('sqlite3');
const db = new sqlite3.Database('lab-lms.db');

db.all("SELECT id, name FROM tests WHERE name LIKE '%Platelet%'", (err, tests) => {
    if (err) {
        console.error(err);
        process.exit(1);
    }
    
    tests.forEach(test => {
        db.run(`
            UPDATE test_parameters 
            SET parameter_name = 'Platelet Count', 
                unit = 'cumm', 
                normal_range = '150000 - 410000' 
            WHERE test_id = ? AND parameter_name = 'Result'
        `, [test.id], (err) => {
            if (err) console.error("Error updating test " + test.id, err);
            else console.log("Updated Platelet Count for test: " + test.name);
        });
    });
});
