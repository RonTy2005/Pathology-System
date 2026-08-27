const path = require("path");
const sqlite3 = require("sqlite3").verbose();
const { dataDirectory } = require("../config/paths");

let currentDatabasePath = path.join(dataDirectory, "lab-lms.db");
let db;

function openDatabase() {
  if (!db) {
    db = new sqlite3.Database(currentDatabasePath);
    db.serialize(() => {
      db.run("PRAGMA journal_mode = MEMORY");
      db.run("PRAGMA synchronous = NORMAL");
      db.run("PRAGMA foreign_keys = ON");
    });
  }

  return db;
}

function closeDatabase() {
  return new Promise((resolve) => {
    if (!db) {
      resolve();
      return;
    }

    db.close(() => {
      db = null;
      resolve();
    });
  });
}

async function switchDatabasePath(nextPath) {
  await closeDatabase();
  currentDatabasePath = nextPath;
}

module.exports = {
  openDatabase,
  closeDatabase,
  switchDatabasePath,
  getDatabasePath: () => currentDatabasePath,
};
