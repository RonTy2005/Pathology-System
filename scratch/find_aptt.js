const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('lab-lms.db');

db.all("SELECT id, name, code FROM tests WHERE name LIKE '%APTT%' OR code LIKE '%APT%'", (err, rows) => {
    if (err) console.error(err);
    console.log(rows);
    db.close();
});
