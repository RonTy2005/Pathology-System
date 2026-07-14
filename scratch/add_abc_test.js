const { openDatabase } = require('../src/db/connection');
const db = openDatabase();

db.serialize(() => {
  db.run(
    'INSERT INTO tests (name, code, category, sample_type, price, turnaround_hours, active) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ['Absolute Basophil Count (ABC)', 'ABC1004', 'Hematology', 'Blood', 150, 24, 1],
    function(err) {
      if (err) {
        console.error('Error inserting ABC test:', err);
        process.exit(1);
      }
      const testId = this.lastID;
      console.log('ABC test inserted with ID:', testId);

      db.run(
        'INSERT INTO test_parameters (test_id, parameter_name, unit, normal_range, display_order) VALUES (?, ?, ?, ?, ?)',
        [testId, 'ABSOLUTE BASOPHIL COUNT (ABC)', 'cells/mcL', '0 - 300', 1],
        function(err) {
          if (err) {
            console.error('Error inserting ABC parameter:', err);
            process.exit(1);
          }
          console.log('ABC parameter inserted.');
          db.close();
        }
      );
    }
  );
});
