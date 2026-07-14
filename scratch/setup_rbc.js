const sqlite3 = require('sqlite3');
const db = new sqlite3.Database('lab-lms.db');

const testId = 833; // Total Count of RBC

const newName = 'RED BLOOD CELL (RBC) COUNT';

const params = [
  { name: 'Primary Sample Type', unit: '', normal_range: '' },
  { name: 'RBC COUNT', unit: '', normal_range: '' },
  { name: 'Total RBC count', unit: 'mill/cumm', normal_range: '4.5 - 5.5' }
];

db.serialize(() => {
  db.run("UPDATE tests SET name = ?, code = ? WHERE id = ?", [newName, 'RBC', testId]);
  db.run("DELETE FROM test_parameters WHERE test_id = ?", [testId]);
  
  const stmt = db.prepare("INSERT INTO test_parameters (test_id, parameter_name, unit, normal_range) VALUES (?, ?, ?, ?)");
  for (const p of params) {
    stmt.run([testId, p.name, p.unit, p.normal_range]);
  }
  stmt.finalize(() => {
    console.log("Updated RBC test");
    process.exit(0);
  });
});
