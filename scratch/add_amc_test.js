const { openDatabase } = require('../src/db/connection');
const db = openDatabase();

db.serialize(() => {
  db.run(
    'INSERT INTO tests (name, code, category, sample_type, price, turnaround_hours, active) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ['Absolute Monocyte Count (AMC)', 'AMC1005', 'Hematology', 'Blood', 150, 24, 1],
    function(err) {
      if (err) {
        console.error('Error inserting AMC test:', err);
        process.exit(1);
      }
      const testId = this.lastID;
      console.log('AMC test inserted with ID:', testId);

      db.run(
        'INSERT INTO test_parameters (test_id, parameter_name, unit, normal_range, display_order) VALUES (?, ?, ?, ?, ?)',
        [testId, 'ABSOLUTE MONOCYTE COUNT (AMC)', 'cells/mcL', '200 - 950', 1],
        function(err) {
          if (err) {
            console.error('Error inserting AMC parameter:', err);
            process.exit(1);
          }
          console.log('AMC parameter inserted.');
          db.close();
        }
      );
    }
  );
});
