const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('lab-lms.db');

db.serialize(() => {
  console.log("--- visits table ---");
  db.all("PRAGMA table_info(visits)", (err, rows) => {
    if (err) console.error(err);
    else console.log(JSON.stringify(rows, null, 2));
  });

  console.log("--- reports table ---");
  db.all("PRAGMA table_info(reports)", (err, rows) => {
    if (err) console.error(err);
    else console.log(JSON.stringify(rows, null, 2));
    db.close();
  });
});
