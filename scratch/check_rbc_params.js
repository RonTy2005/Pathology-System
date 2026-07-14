const sqlite3 = require('sqlite3');
const db = new sqlite3.Database('lab-lms.db');
db.all("SELECT * FROM test_parameters WHERE test_id = 833", (err, p) => {
  console.log(p);
  process.exit(0);
});
