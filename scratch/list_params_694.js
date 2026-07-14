const sqlite3 = require('sqlite3');
const db = new sqlite3.Database('lab-lms.db');
db.all("SELECT id, parameter_name, unit, normal_range FROM test_parameters WHERE test_id = 694", (err, rows) => {
    if (err) console.error(err);
    else console.log(rows);
});
