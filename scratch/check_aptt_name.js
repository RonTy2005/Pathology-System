const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('lab-lms.db');

db.get("SELECT name FROM tests WHERE id = 1098", (err, row) => {
    if (err) console.error(err);
    console.log("Current name in DB:", row.name);
    db.close();
});
