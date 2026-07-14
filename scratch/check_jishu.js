const sqlite3 = require('sqlite3');
const db = new sqlite3.Database('lab-lms.db');
db.all("SELECT * FROM visits v JOIN patients p ON v.patient_id = p.id WHERE p.name LIKE '%Jishu%'", (err, rows) => {
  console.log(rows);
  process.exit(0);
});
