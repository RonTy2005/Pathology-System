const sqlite3 = require('sqlite3');
const db = new sqlite3.Database('lab-lms.db');
db.all(`SELECT p.id, GROUP_CONCAT(DISTINCT COALESCE(vt.custom_test_name, t.name)) AS tests FROM patients p LEFT JOIN visits v ON v.patient_id = p.id LEFT JOIN visit_tests vt ON vt.visit_id = v.id LEFT JOIN tests t ON t.id = vt.test_id GROUP BY p.id LIMIT 5`, (err, rows) => {
  console.log(rows);
  process.exit(0);
});
