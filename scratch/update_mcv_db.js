const { openDatabase } = require('../src/db/connection');
const db = openDatabase();

db.run(
  'UPDATE test_parameters SET parameter_name = ?, unit = ?, normal_range = ? WHERE test_id = 606 AND parameter_name = ?',
  ['Mean Corpuscular Volume (MCV)', 'fL', '83.00 - 101.00', 'Result'],
  function(err) {
    if (err) {
      console.error('Error updating MCV parameters:', err);
      process.exit(1);
    }
    console.log('Rows updated:', this.changes);
    db.close();
  }
);
