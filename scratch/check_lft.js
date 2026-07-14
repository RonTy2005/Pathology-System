const sqlite3 = require('sqlite3');
const db = new sqlite3.Database('lab-lms.db');
db.all("SELECT * FROM tests WHERE name LIKE '%Liver Function Test%' OR code = 'LFT'", (err, rows) => {
  console.log("Tests:", rows);
  if (rows && rows.length > 0) {
    db.all("SELECT * FROM parameters WHERE test_id = ?", [rows[0].id], (err, params) => {
      console.log("Parameters:", params);
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
});
