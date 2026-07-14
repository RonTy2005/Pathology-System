const { openDatabase } = require('../src/db/connection');
const db = openDatabase();

db.serialize(() => {
  db.run(
    'INSERT INTO tests (name, code, category, sample_type, price, turnaround_hours, active) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ['Platelet Distribution Width (PDW)', 'PDW1003', 'Hematology', 'Blood (2 ml)', 190, 24, 1],
    function(err) {
      if (err) {
        console.error('Error inserting PDW test:', err);
        process.exit(1);
      }
      const testId = this.lastID;
      console.log('PDW test inserted with ID:', testId);

      db.run(
        'INSERT INTO test_parameters (test_id, parameter_name, unit, normal_range, display_order) VALUES (?, ?, ?, ?, ?)',
        [testId, 'PLATELET DISTRIBUTION WIDTH', '%', '9.00 - 17.00', 1],
        function(err) {
          if (err) {
            console.error('Error inserting PDW parameter:', err);
            process.exit(1);
          }
          console.log('PDW parameter inserted.');
          db.close();
        }
      );
    }
  );
});
