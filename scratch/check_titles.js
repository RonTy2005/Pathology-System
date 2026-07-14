const sqlite3 = require('sqlite3');
const db = new sqlite3.Database('lab-lms.db');

db.get("SELECT * FROM reports LIMIT 1", (err, report) => {
  console.log("Report:", report);
  db.get("SELECT * FROM tests WHERE id = ?", [report.test_id], (err, test) => {
    console.log("Test:", test);
    db.get("SELECT * FROM departments WHERE id = ?", [test.department_id], (err, dept) => {
      console.log("Department:", dept);
      process.exit(0);
    });
  });
});
