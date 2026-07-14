const { openDatabase } = require('../src/db/connection');
const db = openDatabase();

db.run(
  'UPDATE test_parameters SET parameter_name = ?, unit = ?, normal_range = ? WHERE test_id = 605 AND parameter_name = ?',
  ['MCHC', 'g/dL', '32.5 - 34.5', 'Result'],
  function(err) {
    if (err) {
      console.error('Error updating MCHC parameters:', err);
      process.exit(1);
    }
    console.log('Rows updated:', this.changes);
    db.close();
  }
);
