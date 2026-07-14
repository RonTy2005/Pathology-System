const sqlite3 = require('sqlite3');
const db = new sqlite3.Database('lab-lms.db');
db.get("SELECT GROUP_CONCAT(DISTINCT 'A') AS res", (err, row) => console.log(err || row));
