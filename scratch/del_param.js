const sqlite3 = require('sqlite3');
const db = new sqlite3.Database('lab-lms.db');
db.run("DELETE FROM test_parameters WHERE parameter_name = 'LFT (Liver Function Test)'", (err) => {
  if (err) console.error(err);
  else console.log('Deleted LFT header parameter');
  process.exit(0);
});
