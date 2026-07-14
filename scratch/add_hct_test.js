const { openDatabase } = require('../src/db/connection');
const db = openDatabase();

db.serialize(() => {
  db.run(
    'INSERT INTO tests (name, code, category, sample_type, price, turnaround_hours, active) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ['HCT (Hematocrit)', 'HCT1002', 'Hematology', 'Blood', 150, 24, 1],
    function(err) {
      if (err) {
        console.error('Error inserting HCT test:', err);
        process.exit(1);
      }
      const testId = this.lastID;
      console.log('HCT test inserted with ID:', testId);

      // Add Header parameter
      db.run(
        'INSERT INTO test_parameters (test_id, parameter_name, unit, normal_range, display_order) VALUES (?, ?, ?, ?, ?)',
        [testId, 'Hematocrit (HCT) / Packed Cell Volume (PCV)', null, null, 1],
        function(err) {
          if (err) {
            console.error('Error inserting HCT header parameter:', err);
            process.exit(1);
          }
          console.log('HCT header parameter inserted.');

          // Add Investigation parameter
          db.run(
            'INSERT INTO test_parameters (test_id, parameter_name, unit, normal_range, display_order) VALUES (?, ?, ?, ?, ?)',
            [testId, 'HCT / PCV', '%', '40 - 50', 2],
            function(err) {
              if (err) {
                console.error('Error inserting HCT investigation parameter:', err);
                process.exit(1);
              }
              console.log('HCT investigation parameter inserted.');
              db.close();
            }
          );
        }
      );
    }
  );
});
