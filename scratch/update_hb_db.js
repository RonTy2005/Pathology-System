const { openDatabase } = require('../src/db/connection');
const db = openDatabase();

db.serialize(() => {
  db.run(
    'UPDATE test_parameters SET parameter_name = ?, unit = ?, normal_range = ? WHERE id = ?',
    ['Hemoglobin (Hb)', 'g/dL', 'Male: 13.5 - 17.5\nFemale: 12.0 - 15.5', 495],
    function(err) {
      if (err) {
        console.error('Error updating Hb parameter:', err);
        process.exit(1);
      }
      console.log('Hb parameter updated.');
      db.close();
    }
  );
});
