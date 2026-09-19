const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const sqlite3 = require("sqlite3").verbose();
const {
  configureStableUserDataPath,
  prepareServerDatabase,
  recoverClientConnection,
} = require("../desktop/dataMigration");

function openDatabase(databasePath, mode = sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE) {
  return new Promise((resolve, reject) => {
    const database = new sqlite3.Database(databasePath, mode, (error) => {
      if (error) reject(error);
      else resolve(database);
    });
  });
}

function execute(database, sql) {
  return new Promise((resolve, reject) => {
    database.exec(sql, (error) => (error ? reject(error) : resolve()));
  });
}

function fetchOne(database, sql) {
  return new Promise((resolve, reject) => {
    database.get(sql, (error, row) => (error ? reject(error) : resolve(row)));
  });
}

function closeDatabase(database) {
  return new Promise((resolve, reject) => {
    database.close((error) => (error ? reject(error) : resolve()));
  });
}

async function createDatabase(databasePath, {
  label,
  users = 0,
  patients = 0,
  visits = 0,
  results = 0,
  setupCompleted = 0,
} = {}) {
  await fs.mkdir(path.dirname(databasePath), { recursive: true });
  const database = await openDatabase(databasePath);
  try {
    await execute(database, `
      CREATE TABLE tests (id INTEGER PRIMARY KEY, name TEXT);
      CREATE TABLE users (id INTEGER PRIMARY KEY, username TEXT);
      CREATE TABLE business_settings (id INTEGER PRIMARY KEY, setup_completed INTEGER);
      CREATE TABLE patients (id INTEGER PRIMARY KEY, name TEXT);
      CREATE TABLE visits (id INTEGER PRIMARY KEY, label TEXT);
      CREATE TABLE results (id INTEGER PRIMARY KEY, value TEXT);
      INSERT INTO tests (name) VALUES ('${label || "catalogue"}');
      ${Array.from({ length: users }, (_, index) => `INSERT INTO users (username) VALUES ('user-${index}');`).join("\n")}
      INSERT INTO business_settings (id, setup_completed) VALUES (1, ${setupCompleted});
      ${Array.from({ length: patients }, (_, index) => `INSERT INTO patients (name) VALUES ('patient-${index}');`).join("\n")}
      ${Array.from({ length: visits }, (_, index) => `INSERT INTO visits (label) VALUES ('visit-${index}');`).join("\n")}
      ${Array.from({ length: results }, (_, index) => `INSERT INTO results (value) VALUES ('result-${index}');`).join("\n")}
    `);
  } finally {
    await closeDatabase(database);
  }
}

async function readValue(databasePath, sql) {
  const database = await openDatabase(databasePath, sqlite3.OPEN_READONLY);
  try {
    return await fetchOne(database, sql);
  } finally {
    await closeDatabase(database);
  }
}

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "labshield-data-migration-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return {
    root,
    appDataDirectory: path.join(root, "AppData"),
    dataDirectory: path.join(root, "AppData", "LabShield Server"),
    packagedCataloguePath: path.join(root, "package", "labshield-catalogue.db"),
  };
}

test("a fresh renamed database is backed up and replaced by historical clinical records", async (t) => {
  const f = await fixture(t);
  const currentPath = path.join(f.dataDirectory, "lab-lms.db");
  const legacyPath = path.join(f.appDataDirectory, "lab-system", "lab-lms.db");
  await createDatabase(currentPath, { label: "fresh", users: 1, setupCompleted: 1 });
  await createDatabase(legacyPath, { label: "legacy", users: 3, patients: 4, visits: 5, results: 6, setupCompleted: 1 });
  await createDatabase(f.packagedCataloguePath, { label: "seed" });

  const result = await prepareServerDatabase({ ...f, sqlite3, appVersion: "1.2.0", log: { info() {} } });
  assert.equal(result.recoveredFrom, legacyPath);
  assert.equal((await readValue(currentPath, "SELECT COUNT(*) AS count FROM patients")).count, 4);
  assert.equal((await readValue(currentPath, "SELECT name FROM tests LIMIT 1")).name, "legacy");
  assert.ok(result.backupPath, "the recovered database receives a pre-version backup");
  assert.equal((await fs.readdir(path.join(f.dataDirectory, "recovery-backups"))).length, 1);
});

test("an active current database is never overwritten by a historical database", async (t) => {
  const f = await fixture(t);
  const currentPath = path.join(f.dataDirectory, "lab-lms.db");
  const legacyPath = path.join(f.appDataDirectory, "Lab LMS Server", "lab-lms.db");
  await createDatabase(currentPath, { label: "current", users: 2, patients: 1, visits: 1, setupCompleted: 1 });
  await createDatabase(legacyPath, { label: "legacy", users: 5, patients: 10, visits: 10, results: 10, setupCompleted: 1 });
  await createDatabase(f.packagedCataloguePath, { label: "seed" });

  const result = await prepareServerDatabase({ ...f, sqlite3, appVersion: "1.2.0", log: { info() {} } });
  assert.equal(result.recoveredFrom, null);
  assert.equal((await readValue(currentPath, "SELECT name FROM tests LIMIT 1")).name, "current");
  assert.equal((await readValue(currentPath, "SELECT COUNT(*) AS count FROM patients")).count, 1);
});

test("a first installation prefers a valid historical catalogue over the packaged seed", async (t) => {
  const f = await fixture(t);
  const currentPath = path.join(f.dataDirectory, "lab-lms.db");
  const legacyPath = path.join(f.appDataDirectory, "Lab LMS Server", "lab-lms.db");
  await createDatabase(legacyPath, { label: "custom legacy catalogue", users: 1 });
  await createDatabase(f.packagedCataloguePath, { label: "seed" });

  const result = await prepareServerDatabase({ ...f, sqlite3, appVersion: "1.2.0", log: { info() {} } });
  assert.equal(result.recoveredFrom, legacyPath);
  assert.equal((await readValue(currentPath, "SELECT name FROM tests LIMIT 1")).name, "custom legacy catalogue");
});

test("an unreadable current database is preserved instead of silently replaced", async (t) => {
  const f = await fixture(t);
  const currentPath = path.join(f.dataDirectory, "lab-lms.db");
  await fs.mkdir(f.dataDirectory, { recursive: true });
  await fs.writeFile(currentPath, "not a sqlite database", "utf8");
  await createDatabase(f.packagedCataloguePath, { label: "seed" });

  await assert.rejects(
    prepareServerDatabase({ ...f, sqlite3, appVersion: "1.2.0", log: { info() {} } }),
    /could not be read and was preserved/
  );
  assert.equal(await fs.readFile(currentPath, "utf8"), "not a sqlite database");
});

test("the client recovers its saved server from the former shared data directory", async (t) => {
  const f = await fixture(t);
  const clientDirectory = path.join(f.appDataDirectory, "LabShield");
  const legacyConnection = path.join(f.appDataDirectory, "lab-system", "server-connection.json");
  await fs.mkdir(path.dirname(legacyConnection), { recursive: true });
  await fs.writeFile(legacyConnection, JSON.stringify({ serverUrl: "http://192.168.1.20:3000" }), "utf8");

  const result = await recoverClientConnection({
    appDataDirectory: f.appDataDirectory,
    dataDirectory: clientDirectory,
  });
  assert.equal(result.recoveredFrom, legacyConnection);
  const recovered = JSON.parse(await fs.readFile(path.join(clientDirectory, "server-connection.json"), "utf8"));
  assert.equal(recovered.serverUrl, "http://192.168.1.20:3000");
});

test("desktop data paths are explicit and no longer depend on package names", async (t) => {
  const f = await fixture(t);
  const calls = [];
  const app = {
    setName: (value) => calls.push(["name", value]),
    getPath: (key) => {
      assert.equal(key, "appData");
      return f.appDataDirectory;
    },
    setPath: (key, value) => calls.push([key, value]),
  };

  const stablePath = configureStableUserDataPath(app, "server");
  assert.equal(stablePath, path.join(f.appDataDirectory, "LabShield Server"));
  assert.deepEqual(calls, [
    ["name", "LabShield Server"],
    ["userData", stablePath],
    ["sessionData", path.join(stablePath, "Chromium")],
  ]);
});
