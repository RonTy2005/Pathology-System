const assert = require("node:assert/strict");
const { test } = require("node:test");
const connection = require("../src/db/connection");
const { run, get } = require("../src/db/helpers");
const { ensureCtScanBrainBillingService } = require("../src/db/init");
const { isBillingOnlyTest } = require("../frontend/scripts/reportEligibility");

async function createCatalogueTable() {
  await run(`CREATE TABLE tests (
    id INTEGER PRIMARY KEY,
    name TEXT UNIQUE,
    code TEXT,
    category TEXT,
    sample_type TEXT,
    price REAL,
    turnaround_hours INTEGER,
    active INTEGER,
    created_at TEXT
  )`);
}

test("CT Scan of Brain is a single billing-only catalogue service", async () => {
  await connection.switchDatabasePath(":memory:");
  try {
    await createCatalogueTable();
    await ensureCtScanBrainBillingService();
    const created = await get("SELECT * FROM tests WHERE name = 'CT Scan of Brain'");
    assert.equal(created.category, "CT Scan");
    assert.equal(created.sample_type, "Imaging");
    assert.equal(created.price, 1600);
    assert.equal(created.active, 1);
    assert.equal(isBillingOnlyTest(created), true);
    await ensureCtScanBrainBillingService();
    assert.equal((await get("SELECT COUNT(*) AS count FROM tests")).count, 1);
  } finally {
    await connection.closeDatabase();
  }
});

test("CT Scan Brain is renamed in place instead of duplicated", async () => {
  await connection.switchDatabasePath(":memory:");
  try {
    await createCatalogueTable();
    await run(
      "INSERT INTO tests (id, name, category, sample_type, price, active) VALUES (1, 'CT Scan Brain', 'Imported legacy catalogue', 'Unknown', 2450, 0)"
    );
    await ensureCtScanBrainBillingService();
    const service = await get("SELECT * FROM tests WHERE id = 1");
    assert.equal(service.name, "CT Scan of Brain");
    assert.equal(service.category, "CT Scan");
    assert.equal(service.sample_type, "Imaging");
    assert.equal(service.price, 2450, "the laboratory's existing price is preserved");
    assert.equal(service.active, 1);
    assert.equal((await get("SELECT COUNT(*) AS count FROM tests")).count, 1);
  } finally {
    await connection.closeDatabase();
  }
});
