const { openDatabase } = require('../src/db/connection');
const db = openDatabase();

db.serialize(() => {
  db.run(
    'UPDATE test_parameters SET parameter_name = ?, unit = ?, normal_range = ? WHERE id = ?',
    ['ESR', 'mm/hr', '0 - 15', 427],
    function(err) {
      if (err) {
        console.error('Error updating ESR parameter:', err);
        process.exit(1);
      }
      console.log('ESR parameter updated.');
      db.close();
    }
  );
});
