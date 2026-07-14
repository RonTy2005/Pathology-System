const sqlite3 = require('sqlite3');
const db = new sqlite3.Database('lab-lms.db');
db.all("SELECT id, name FROM tests WHERE name LIKE '%Platelet%'", (err, rows) => {
    if (err) console.error(err);
    else console.log(rows);
});
