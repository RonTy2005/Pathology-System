const { openDatabase } = require('../src/db/connection.js');
const db = openDatabase();

db.all("SELECT * FROM tests WHERE name LIKE '%Culture for K.L.B%'", [], (err, rows) => {
  if (err) {
    console.error(err);
  } else {
    console.log(JSON.stringify(rows, null, 2));
  }
  process.exit();
});
