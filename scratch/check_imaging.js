const sqlite3 = require("sqlite3").verbose();
const db = new sqlite3.Database("e:/Web Development/lab-system/lab-lms.db");
db.all("SELECT name, category FROM tests WHERE category IN ('Radiology', 'Imaging') LIMIT 20;", [], (err, rows) => {
  if (err) console.error(err);
  else console.log(JSON.stringify(rows));
  db.close();
});
