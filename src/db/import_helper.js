const { openDatabase } = require('./connection.js');
const db = openDatabase();

function runQuery(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function getQuery(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

async function importBatch(tests) {
  console.log(`Processing batch of ${tests.length} tests...`);
  let imported = 0;
  let skipped = 0;

  for (const test of tests) {
    // Exact name match or very close match
    const existing = await getQuery("SELECT id FROM tests WHERE LOWER(name) = LOWER(?)", [test.name.trim()]);

    if (existing) {
      console.log(`Skipping: ${test.name} (Already exists)`);
      skipped++;
      continue;
    }

    const code = test.code || (test.name.substring(0, 3).toUpperCase().replace(/[^A-Z]/g, "X") + Math.floor(1000 + Math.random() * 8999));
    
    try {
      const result = await runQuery(
        `INSERT INTO tests (name, category, price, sample_type, code, active, created_at)
         VALUES (?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP)`,
        [test.name.trim(), test.category || 'General', test.price || 0, test.sample_type || 'N/A', code]
      );

      const testId = result.lastID;
      
      // Create a default parameter
      await runQuery(
        `INSERT INTO test_parameters (test_id, parameter_name, unit, normal_range)
         VALUES (?, ?, ?, ?)`,
        [testId, "Result", "N/A", "N/A"]
      );

      console.log(`Imported: ${test.name}`);
      imported++;
    } catch (err) {
      console.error(`Failed to import ${test.name}:`, err.message);
    }
  }

  console.log(`Batch Summary: ${imported} imported, ${skipped} skipped.`);
}

module.exports = { importBatch };
