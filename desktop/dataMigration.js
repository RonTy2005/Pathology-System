const fs = require("fs/promises");
const fsSync = require("fs");
const path = require("path");

const SERVER_DIRECTORY_NAMES = [
  "LabShield Server",
  "labshield-server",
  "Lab LMS Server",
  "lab-lms-server",
  "lab-system",
];

const CLIENT_DIRECTORY_NAMES = [
  "LabShield",
  "labshield-client",
  "Lab LMS",
  "lab-lms-client",
  "lab-system",
];

const OPERATIONAL_TABLES = [
  "patients",
  "visits",
  "visit_tests",
  "results",
  "reports",
  "expenses",
  "daily_account_submissions",
  "salary_payments",
  "associate_payments",
  "imaging_report_files",
  "doctors",
  "associates",
  "vendors",
];

function uniquePaths(paths) {
  const seen = new Set();
  return paths.filter((candidate) => {
    const key = path.resolve(candidate).toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function configureStableUserDataPath(app, appMode) {
  const productName = appMode === "server" ? "LabShield Server" : "LabShield";
  app.setName(productName);
  const userDataPath = path.join(app.getPath("appData"), productName);
  const sessionDataPath = path.join(userDataPath, "Chromium");
  fsSync.mkdirSync(sessionDataPath, { recursive: true });
  app.setPath("userData", userDataPath);
  app.setPath("sessionData", sessionDataPath);
  return userDataPath;
}

function openDatabase(sqlite3, databasePath) {
  return new Promise((resolve, reject) => {
    const database = new sqlite3.Database(databasePath, sqlite3.OPEN_READONLY, (error) => {
      if (error) reject(error);
      else resolve(database);
    });
  });
}

function closeDatabase(database) {
  return new Promise((resolve) => database.close(() => resolve()));
}

function fetchAll(database, sql) {
  return new Promise((resolve, reject) => {
    database.all(sql, (error, rows) => (error ? reject(error) : resolve(rows)));
  });
}

function fetchOne(database, sql) {
  return new Promise((resolve, reject) => {
    database.get(sql, (error, row) => (error ? reject(error) : resolve(row)));
  });
}

async function inspectDatabase(sqlite3, databasePath) {
  try {
    const stats = await fs.stat(databasePath);
    if (!stats.isFile() || stats.size === 0) return null;
    const database = await openDatabase(sqlite3, databasePath);
    try {
      const integrity = await fetchOne(database, "PRAGMA quick_check");
      if (!integrity || Object.values(integrity)[0] !== "ok") return null;
      const tableRows = await fetchAll(database, "SELECT name FROM sqlite_master WHERE type = 'table'");
      const tables = new Set(tableRows.map(({ name }) => name));
      if (!tables.has("tests")) return null;

      const counts = {};
      for (const table of [...OPERATIONAL_TABLES, "users", "business_settings"]) {
        counts[table] = tables.has(table)
          ? Number((await fetchOne(database, `SELECT COUNT(*) AS count FROM ${table}`))?.count || 0)
          : 0;
      }

      let setupCompleted = 0;
      if (tables.has("business_settings")) {
        const columns = await fetchAll(database, "PRAGMA table_info(business_settings)");
        if (columns.some(({ name }) => name === "setup_completed")) {
          setupCompleted = Number((await fetchOne(
            database,
            "SELECT COUNT(*) AS count FROM business_settings WHERE COALESCE(setup_completed, 0) = 1"
          ))?.count || 0);
        }
      }

      const operationalCount = OPERATIONAL_TABLES.reduce((total, table) => total + counts[table], 0);
      const meaningfulScore = (operationalCount * 1000)
        + (Math.max(0, counts.users - 1) * 100)
        + (setupCompleted * 50);
      return {
        path: databasePath,
        size: stats.size,
        modifiedAt: stats.mtimeMs,
        counts,
        setupCompleted,
        operationalCount,
        meaningfulScore,
      };
    } finally {
      await closeDatabase(database);
    }
  } catch (_error) {
    return null;
  }
}

function chooseBestLegacyDatabase(profiles) {
  return profiles
    .filter(Boolean)
    .sort((left, right) => (
      right.meaningfulScore - left.meaningfulScore
      || right.modifiedAt - left.modifiedAt
      || right.size - left.size
    ))[0] || null;
}

function isReplaceableFreshDatabase(profile) {
  return Boolean(profile)
    && profile.operationalCount === 0
    && profile.counts.users <= 1;
}

async function copyDatabaseSafely(sourcePath, destinationPath) {
  await fs.mkdir(path.dirname(destinationPath), { recursive: true });
  const temporaryPath = `${destinationPath}.recovering`;
  const displacedPath = `${destinationPath}.previous`;
  await fs.copyFile(sourcePath, temporaryPath);
  let displacedExistingFile = false;
  try {
    await fs.unlink(displacedPath);
  } catch (_error) {
    // There is normally no interrupted replacement to clear.
  }
  try {
    await fs.rename(destinationPath, displacedPath);
    displacedExistingFile = true;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  try {
    await fs.rename(temporaryPath, destinationPath);
  } catch (error) {
    if (displacedExistingFile) await fs.rename(displacedPath, destinationPath);
    throw error;
  }
  if (displacedExistingFile) {
    try {
      await fs.unlink(displacedPath);
    } catch (_error) {
      // The new database is already active; a harmless previous copy can be
      // cleaned up on a later launch if antivirus software briefly locks it.
    }
  }
}

function safeVersion(value) {
  return String(value || "unknown").replace(/[^0-9A-Za-z.-]+/g, "-");
}

async function createUpgradeBackup(databasePath, dataDirectory, appVersion) {
  try {
    const stats = await fs.stat(databasePath);
    if (!stats.isFile() || !stats.size) return null;
  } catch (_error) {
    return null;
  }

  const backupDirectory = path.join(dataDirectory, "upgrade-backups");
  const markerPath = path.join(backupDirectory, `version-${safeVersion(appVersion)}.backed-up`);
  try {
    await fs.access(markerPath);
    return null;
  } catch (_error) {
    // The first launch of this version still needs its safety copy.
  }

  await fs.mkdir(backupDirectory, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.join(backupDirectory, `pre-${safeVersion(appVersion)}-${timestamp}.db`);
  await fs.copyFile(databasePath, backupPath);
  await fs.writeFile(markerPath, `${backupPath}\n`, "utf8");

  const backups = (await fs.readdir(backupDirectory, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith(".db"))
    .map((entry) => path.join(backupDirectory, entry.name));
  const backupStats = await Promise.all(backups.map(async (file) => ({ file, stats: await fs.stat(file) })));
  backupStats.sort((left, right) => right.stats.mtimeMs - left.stats.mtimeMs);
  for (const oldBackup of backupStats.slice(5)) await fs.unlink(oldBackup.file);
  return backupPath;
}

async function prepareServerDatabase({
  appDataDirectory,
  dataDirectory,
  packagedCataloguePath,
  sqlite3,
  appVersion,
  log = console,
}) {
  const databasePath = path.join(dataDirectory, "lab-lms.db");
  const candidatePaths = uniquePaths(SERVER_DIRECTORY_NAMES.map(
    (directoryName) => path.join(appDataDirectory, directoryName, "lab-lms.db")
  )).filter((candidate) => path.resolve(candidate).toLowerCase() !== path.resolve(databasePath).toLowerCase());

  const currentProfile = await inspectDatabase(sqlite3, databasePath);
  let currentFileExists = false;
  try {
    currentFileExists = (await fs.stat(databasePath)).isFile();
  } catch (_error) {
    // A missing destination is expected on the first launch.
  }
  const candidateProfiles = await Promise.all(candidatePaths.map((candidate) => inspectDatabase(sqlite3, candidate)));
  const bestLegacy = chooseBestLegacyDatabase(candidateProfiles);
  const shouldRecoverLegacy = bestLegacy?.meaningfulScore > 0
    && (!currentProfile || isReplaceableFreshDatabase(currentProfile));

  let recoveredFrom = null;
  if (shouldRecoverLegacy) {
    if (currentFileExists) {
      const recoveryBackupDirectory = path.join(dataDirectory, "recovery-backups");
      await fs.mkdir(recoveryBackupDirectory, { recursive: true });
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      await fs.copyFile(databasePath, path.join(recoveryBackupDirectory, `unused-fresh-${timestamp}.db`));
    }
    await copyDatabaseSafely(bestLegacy.path, databasePath);
    recoveredFrom = bestLegacy.path;
    log.info?.(`Recovered LabShield records from ${bestLegacy.path}.`);
  } else if (!currentProfile) {
    if (currentFileExists) {
      throw new Error(`The existing LabShield database could not be read and was preserved at ${databasePath}.`);
    }
    const fallbackLegacy = chooseBestLegacyDatabase(candidateProfiles);
    const seedSource = fallbackLegacy?.path || packagedCataloguePath;
    if (seedSource) {
      await copyDatabaseSafely(seedSource, databasePath);
      recoveredFrom = fallbackLegacy?.path || null;
    }
  }

  const backupPath = await createUpgradeBackup(databasePath, dataDirectory, appVersion);
  return { databasePath, recoveredFrom, backupPath };
}

async function recoverClientConnection({ appDataDirectory, dataDirectory }) {
  const connectionPath = path.join(dataDirectory, "server-connection.json");
  try {
    const current = JSON.parse(await fs.readFile(connectionPath, "utf8"));
    if (current?.serverUrl) return { connectionPath, recoveredFrom: null };
  } catch (_error) {
    // Search the historical application identities below.
  }

  const candidates = uniquePaths(CLIENT_DIRECTORY_NAMES.map(
    (directoryName) => path.join(appDataDirectory, directoryName, "server-connection.json")
  )).filter((candidate) => path.resolve(candidate).toLowerCase() !== path.resolve(connectionPath).toLowerCase());
  const validCandidates = [];
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(await fs.readFile(candidate, "utf8"));
      if (!parsed?.serverUrl) continue;
      validCandidates.push({ path: candidate, stats: await fs.stat(candidate) });
    } catch (_error) {
      // Ignore incomplete or unrelated historical files.
    }
  }
  validCandidates.sort((left, right) => right.stats.mtimeMs - left.stats.mtimeMs);
  if (!validCandidates[0]) return { connectionPath, recoveredFrom: null };
  await fs.mkdir(dataDirectory, { recursive: true });
  await fs.copyFile(validCandidates[0].path, connectionPath);
  return { connectionPath, recoveredFrom: validCandidates[0].path };
}

module.exports = {
  CLIENT_DIRECTORY_NAMES,
  SERVER_DIRECTORY_NAMES,
  chooseBestLegacyDatabase,
  configureStableUserDataPath,
  inspectDatabase,
  isReplaceableFreshDatabase,
  prepareServerDatabase,
  recoverClientConnection,
};
