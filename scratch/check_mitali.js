const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./database.sqlite');

db.serialize(() => {
  db.get("SELECT id FROM patients WHERE name LIKE '%Mitali Ghosh%'", (err, row) => {
    if (!row) {
      console.log("Mitali not found");
      return;
    }
    console.log("Patient ID:", row.id);
    db.all("SELECT * FROM visits WHERE patient_id = ?", [row.id], (err, visits) => {
      console.log("Visits:", visits);
      for (const v of visits) {
        db.all("SELECT * FROM visit_tests WHERE visit_id = ?", [v.id], (err, tests) => {
          console.log("Tests for visit", v.id, ":", tests);
        });
      }
    });
  });
});
