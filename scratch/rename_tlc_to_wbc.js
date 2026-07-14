const sqlite3 = require('sqlite3');
const db = new sqlite3.Database('lab-lms.db');

db.run("UPDATE tests SET name = 'White Blood Cell (WBC)' WHERE name = 'TOTAL LEUCOCYTE COUNT (TLC)'", (err) => {
    if (err) console.error(err);
    else console.log("Renamed test to White Blood Cell (WBC) in catalog");
});
