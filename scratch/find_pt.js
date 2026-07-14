const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('lab-lms.db');

db.all("SELECT id, name FROM tests WHERE name LIKE '%Prothrombin%'", (err, rows) => {
    if (err) console.error(err);
    console.log(rows);
    db.close();
});
