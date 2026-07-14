const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('lab-lms.db');

db.all("SELECT * FROM tests WHERE name LIKE '%PT%' OR name LIKE '%APTT%'", (err, rows) => {
    if (err) {
        console.error(err);
    } else {
        console.log(JSON.stringify(rows, null, 2));
    }
    db.close();
});
