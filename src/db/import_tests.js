const sqlite3 = require("sqlite3").verbose();
const fs = require("fs");
const path = require("path");

// Use absolute paths for reliability
const dbPath = "e:\\Web Development\\lab-system\\lab-lms.db";
const jsonDataPath = "C:\\Users\\asus\\.gemini\\antigravity\\brain\\0e38e929-a685-4d9a-a44d-1ddafdc27fcb\\scratch\\test_import_data.json";

const db = new sqlite3.Database(dbPath);

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

async function importTests() {
  try {
    const tests = JSON.parse(fs.readFileSync(jsonDataPath, "utf8"));
    console.log(`Starting import of ${tests.length} tests...`);

    let importedCount = 0;
    let skippedCount = 0;

    for (const test of tests) {
      const existing = await getQuery("SELECT id FROM tests WHERE name = ?", [test.name]);

      if (existing) {
        console.log(`Skipping existing test: ${test.name}`);
        skippedCount++;
        continue;
      }

      const code = test.code || (test.name.substring(0, 3).toUpperCase().replace(/[^A-Z]/g, "X") + Math.floor(1000 + Math.random() * 8999));
      
      const result = await runQuery(
        `INSERT INTO tests (name, category, price, sample_type, code, active, created_at)
         VALUES (?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP)`,
        [test.name, test.category, test.price, test.sample_type, code]
      );

      const testId = result.lastID;
      importedCount++;

      // Create a default parameter for each test
      await runQuery(
        `INSERT INTO test_parameters (test_id, parameter_name, unit, normal_range)
         VALUES (?, ?, ?, ?)`,
        [testId, "Result", "N/A", "N/A"]
      );
    }

    console.log(`Import complete!`);
    console.log(`Imported: ${importedCount}`);
    console.log(`Skipped: ${skippedCount}`);
  } catch (error) {
    console.error("Import failed:", error);
  } finally {
    db.close();
  }
}

importTests();
