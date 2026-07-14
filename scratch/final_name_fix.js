const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('lab-lms.db');

db.run("UPDATE tests SET name = 'Activated partial thromboplastin time, APTT' WHERE id = 1098", (err) => {
    if (err) console.error(err);
    console.log("DB Update: Fixed APTT name.");
    db.close();
});
