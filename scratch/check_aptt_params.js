const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('lab-lms.db');

db.all("SELECT parameter_name FROM test_parameters WHERE test_id = 1098", (err, rows) => {
    if (err) console.error(err);
    console.log(rows);
    db.close();
});
