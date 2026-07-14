const sqlite3 = require('sqlite3');
const db = new sqlite3.Database('lab-lms.db');
db.all("SELECT * FROM visits v JOIN visit_tests vt ON vt.visit_id = v.id JOIN tests t ON t.id = vt.test_id WHERE v.id = 43", (err, rows) => {
  console.log(rows);
  process.exit(0);
});
