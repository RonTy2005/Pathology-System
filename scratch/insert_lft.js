const sqlite3 = require('sqlite3');
const db = new sqlite3.Database('lab-lms.db');

const testId = 585; // LFT

const params = [
  { name: 'LFT (Liver Function Test)', unit: '', normal_range: '' },
  { name: 'Bilirubin Total', unit: 'mg/dl', normal_range: '0.1 - 1.0' },
  { name: 'Bilirubin Direct', unit: 'mg/dl', normal_range: '0.0 - 0.3' },
  { name: 'Bilirubin Indirect', unit: 'mg/dl', normal_range: '—' },
  { name: 'ALP (Alkaline Phosphatase)', unit: 'IU/L', normal_range: 'Adult: 108 - 306\n1-15 yrs: 210 - 810' },
  { name: 'SGOT / AST', unit: 'IU/L', normal_range: 'Male: 0.8 - 37\nFemale: 0.8 - 31' },
  { name: 'SGPT / ALT', unit: 'IU/L', normal_range: 'Up to 49' },
  { name: 'Total Protein', unit: 'mg/dl', normal_range: '6.0 - 8.4' },
  { name: 'Albumin', unit: 'mg/dl', normal_range: '3.4 - 5.4' },
  { name: 'Globulin', unit: 'mg/dl', normal_range: '2.3 - 3.6' },
  { name: 'A G Ratio', unit: '—', normal_range: '1.0 - 2.3' }
];

db.serialize(() => {
  db.run("DELETE FROM test_parameters WHERE test_id = ?", [testId]);
  
  const stmt = db.prepare("INSERT INTO test_parameters (test_id, parameter_name, unit, normal_range) VALUES (?, ?, ?, ?)");
  for (const p of params) {
    stmt.run([testId, p.name, p.unit, p.normal_range]);
  }
  stmt.finalize(() => {
    console.log("Inserted parameters for LFT");
    process.exit(0);
  });
});
