const { openDatabase } = require('../src/db/connection');
const db = openDatabase();

db.run(
  'UPDATE test_parameters SET parameter_name = ?, unit = ?, normal_range = ? WHERE test_id = 1036 AND parameter_name = ?',
  ['ABSOLUTE POLYMORPHS COUNT (APC)', 'cells/mcL', '1500 - 7500', 'Result'],
  function(err) {
    if (err) {
      console.error('Error updating APC parameters:', err);
      process.exit(1);
    }
    console.log('Rows updated:', this.changes);
    db.close();
  }
);
