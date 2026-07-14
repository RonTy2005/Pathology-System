const sqlite3 = require('sqlite3');
const db = new sqlite3.Database('lab-lms.db');
db.all("SELECT parameter_name FROM test_parameters WHERE test_id = 1", (err, rows) => {
    if (err) console.error(err);
    else console.log(rows.map(r => r.parameter_name));
});
