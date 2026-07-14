const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('e:/Web Development/lab-system/lab-lms.db');

db.all("SELECT * FROM test_parameters WHERE test_id = 1", [], (err, rows) => {
    if (err) {
        console.error(err);
        return;
    }
    console.log(JSON.stringify(rows, null, 2));
    db.close();
});
