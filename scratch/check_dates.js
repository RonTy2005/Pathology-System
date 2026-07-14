const sqlite3 = require('sqlite3');
const db = new sqlite3.Database('lab-lms.db');
db.all("SELECT v.created_at, r.generated_at, r.finalized_at FROM visits v LEFT JOIN reports r ON v.id = r.visit_id JOIN patients p ON p.id = v.patient_id WHERE p.name LIKE '%Jishu%'", (err, rows) => {
  console.log(rows);
  process.exit(0);
});
