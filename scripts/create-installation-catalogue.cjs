const fs = require("fs/promises");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();

const [sourceDatabasePath, destinationDatabasePath] = process.argv.slice(2);

if (!sourceDatabasePath || !destinationDatabasePath) {
  throw new Error("Usage: node scripts/create-installation-catalogue.cjs <source-db> <destination-db>");
}

function openDatabase(databasePath, mode) {
  return new Promise((resolve, reject) => {
    const database = new sqlite3.Database(databasePath, mode, (error) => {
      if (error) reject(error);
      else resolve(database);
    });
  });
}

function closeDatabase(database) {
  return new Promise((resolve, reject) => {
    database.close((error) => (error ? reject(error) : resolve()));
  });
}

function execute(database, statement) {
  return new Promise((resolve, reject) => {
    database.exec(statement, (error) => (error ? reject(error) : resolve()));
  });
}

function fetchOne(database, statement) {
  return new Promise((resolve, reject) => {
    database.get(statement, (error, row) => (error ? reject(error) : resolve(row)));
  });
}

function copyDatabase(sourceDatabase, destinationPath) {
  return new Promise((resolve, reject) => {
    const backup = sourceDatabase.backup(destinationPath);
    backup.step(-1, (stepError) => {
      if (stepError) {
        reject(stepError);
        return;
      }

      backup.finish((finishError) => (finishError ? reject(finishError) : resolve()));
    });
  });
}

async function createCatalogueOnlySeed() {
  const sourcePath = path.resolve(sourceDatabasePath);
  const destinationPath = path.resolve(destinationDatabasePath);
  await fs.mkdir(path.dirname(destinationPath), { recursive: true });
  await fs.rm(destinationPath, { force: true });

  const source = await openDatabase(sourcePath, sqlite3.OPEN_READONLY);
  source.configure("busyTimeout", 10000);
  try {
    await copyDatabase(source, destinationPath);
  } finally {
    await closeDatabase(source);
  }

  const seed = await openDatabase(destinationPath, sqlite3.OPEN_READWRITE);
  try {
    await execute(seed, `
      PRAGMA foreign_keys = OFF;
      BEGIN TRANSACTION;
      DELETE FROM user_sessions;
      DELETE FROM users;
      DELETE FROM business_settings;
      DELETE FROM doctors;
      DELETE FROM patients;
      DELETE FROM associates;
      DELETE FROM visits;
      DELETE FROM visit_tests;
      DELETE FROM reports;
      DELETE FROM report_user_actions;
      DELETE FROM bill_user_actions;
      DELETE FROM results;
      DELETE FROM imaging_report_files;
      DELETE FROM expenses;
      DELETE FROM vendors;
      DELETE FROM daily_account_submissions;
      DELETE FROM logs;
      DELETE FROM salary_payments;
      DELETE FROM associate_payments;
      DELETE FROM app_migrations;
      DELETE FROM report_schema_repair_backups;
      DELETE FROM cell_report_schema_backups;
      DELETE FROM sqlite_sequence
        WHERE name NOT IN ('tests', 'test_parameters', 'test_bundle_items');
      COMMIT;
      PRAGMA foreign_keys = ON;
    `);
    await execute(seed, "VACUUM");

    const [tests, parameters, bundles, patients, visits, results, users, businessSettings, doctors, associates, expenses] = await Promise.all([
      fetchOne(seed, "SELECT COUNT(*) AS count FROM tests"),
      fetchOne(seed, "SELECT COUNT(*) AS count FROM test_parameters"),
      fetchOne(seed, "SELECT COUNT(*) AS count FROM test_bundle_items"),
      fetchOne(seed, "SELECT COUNT(*) AS count FROM patients"),
      fetchOne(seed, "SELECT COUNT(*) AS count FROM visits"),
      fetchOne(seed, "SELECT COUNT(*) AS count FROM results"),
      fetchOne(seed, "SELECT COUNT(*) AS count FROM users"),
      fetchOne(seed, "SELECT COUNT(*) AS count FROM business_settings"),
      fetchOne(seed, "SELECT COUNT(*) AS count FROM doctors"),
      fetchOne(seed, "SELECT COUNT(*) AS count FROM associates"),
      fetchOne(seed, "SELECT COUNT(*) AS count FROM expenses"),
    ]);

    if ([patients, visits, results, users, businessSettings, doctors, associates, expenses].some(({ count }) => count)) {
      throw new Error("The installation seed still contains operational, clinical, or financial records.");
    }

    console.log(`Created catalogue-only seed: ${tests.count} tests, ${parameters.count} parameters, ${bundles.count} bundle items.`);
  } finally {
    await closeDatabase(seed);
  }
}

createCatalogueOnlySeed().catch((error) => {
  console.error("Unable to create the LabShield installation catalogue:", error.message);
  process.exit(1);
});
