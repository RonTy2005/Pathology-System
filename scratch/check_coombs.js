const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('e:/Web Development/lab-system/lab-lms.db');

db.all("SELECT * FROM tests WHERE name LIKE '%COOMBS%'", (err, rows) => {
    if (err) {
        console.error(err);
        return;
    }
    console.log('Tests found:', rows);
    if (rows.length > 0) {
        const testIds = rows.map(r => r.id).join(',');
        db.all(`SELECT * FROM test_parameters WHERE test_id IN (${testIds})`, (err, params) => {
            if (err) {
                console.error(err);
                return;
            }
            console.log('Parameters found:', params);
            db.close();
        });
    } else {
        db.close();
    }
});
