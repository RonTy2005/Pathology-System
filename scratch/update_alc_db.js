const { openDatabase } = require('../src/db/connection');
const db = openDatabase();

db.run(
  'UPDATE test_parameters SET parameter_name = ?, unit = ?, normal_range = ? WHERE test_id = 1035 AND parameter_name = ?',
  ['ABSOLUTE LYMPHOCYTE COUNT (ALC)', 'cells/mcL', '1300 - 3500', 'Result'],
  function(err) {
    if (err) {
      console.error('Error updating ALC parameters:', err);
      process.exit(1);
    }
    console.log('Rows updated:', this.changes);
    db.close();
  }
);
