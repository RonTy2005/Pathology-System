const { openDatabase } = require('../src/db/connection');
const db = openDatabase();

db.serialize(() => {
  db.run(
    'INSERT INTO tests (name, code, category, sample_type, price, turnaround_hours, active) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ['Mean Platelet Volume (MPV)', 'MPV1001', 'Hematology', 'Whole Blood (EDTA)', 120, 24, 1],
    function(err) {
      if (err) {
        console.error('Error inserting MPV test:', err);
        process.exit(1);
      }
      const testId = this.lastID;
      console.log('MPV test inserted with ID:', testId);

      db.run(
        'INSERT INTO test_parameters (test_id, parameter_name, unit, normal_range, display_order) VALUES (?, ?, ?, ?, ?)',
        [testId, 'MEAN PLATELET VOLUME (MPV), WHOLE BLOOD', 'fL', '6.50 - 12.00', 1],
        function(err) {
          if (err) {
            console.error('Error inserting MPV parameter:', err);
            process.exit(1);
          }
          console.log('MPV parameter inserted.');
          db.close();
        }
      );
    }
  );
});
