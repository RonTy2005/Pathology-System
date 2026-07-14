const sqlite3 = require('sqlite3');
const db = new sqlite3.Database('lab-lms.db');

// Find all visit_test_ids that are for Platelet related tests
db.all(`
    SELECT vt.id AS visit_test_id, t.name AS test_name 
    FROM visit_tests vt 
    JOIN tests t ON t.id = vt.test_id 
    WHERE t.name LIKE '%Platelet%'
`, (err, rows) => {
    if (err) {
        console.error(err);
        process.exit(1);
    }
    
    console.log(`Found ${rows.length} visit tests to check.`);
    
    rows.forEach(row => {
        db.run(`
            UPDATE results 
            SET parameter_name = 'Platelet Count',
                unit = 'cumm',
                normal_range = '150000 - 410000'
            WHERE visit_test_id = ? AND (parameter_name = 'Result' OR parameter_name = 'Platelet Count')
        `, [row.visit_test_id], (err) => {
            if (err) console.error("Error updating results for visit_test_id: " + row.visit_test_id, err);
            else console.log("Updated results for visit_test_id: " + row.visit_test_id + " (" + row.test_name + ")");
        });
    });
});
