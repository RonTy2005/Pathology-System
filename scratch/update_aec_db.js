const { openDatabase } = require('../src/db/connection');
const db = openDatabase();

db.run(
  'UPDATE test_parameters SET parameter_name = ?, unit = ?, normal_range = ? WHERE test_id = 1032 AND parameter_name = ?',
  ['ABSOLUTE EOSINOPHIL COUNT (AEC)', 'cells/mcL', '0 - 500', 'Result'],
  function(err) {
    if (err) {
      console.error('Error updating AEC parameters:', err);
      process.exit(1);
    }
    console.log('Rows updated:', this.changes);
    db.close();
  }
);
