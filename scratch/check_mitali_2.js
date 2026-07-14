const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./database.sqlite');
db.all("SELECT * FROM patients WHERE name LIKE '%Mitali%'", (err, rows) => {
  console.log('Patients:', rows);
  rows.forEach(r => {
    db.all("SELECT * FROM visits WHERE patient_id = ?", [r.id], (err, visits) => {
      console.log('Visits for', r.name, ':', visits);
      visits.forEach(v => {
        db.all("SELECT vt.*, t.name, t.category FROM visit_tests vt LEFT JOIN tests t ON vt.test_id = t.id WHERE vt.visit_id = ?", [v.id], (err, tests) => {
          console.log('Tests for visit', v.id, ':', tests);
        });
      });
    });
  });
});
