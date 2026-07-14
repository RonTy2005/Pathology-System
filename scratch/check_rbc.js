const sqlite3 = require('sqlite3');
const db = new sqlite3.Database('lab-lms.db');
db.all("SELECT * FROM tests WHERE name LIKE '%RBC%' OR name LIKE '%Red Blood%'", (err, rows) => {
  console.log(rows);
  if (rows && rows.length > 0) {
    db.all("SELECT * FROM test_parameters WHERE test_id = ?", [rows[0].id], (err, p) => {
      console.log(p);
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
});
