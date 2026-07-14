const { openDatabase } = require('../src/db/connection');
const db = openDatabase();

db.run(
  'UPDATE test_parameters SET parameter_name = ?, unit = ?, normal_range = ? WHERE test_id = 604 AND parameter_name = ?',
  ['Mean Corpuscular Hemoglobin (MCH)', 'pg', '27.0 - 32.0', 'Result'],
  function(err) {
    if (err) {
      console.error('Error updating MCH parameters:', err);
      process.exit(1);
    }
    console.log('Rows updated:', this.changes);
    db.close();
  }
);
