const { openDatabase } = require("./connection");

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    const db = openDatabase();
    db.run(sql, params, function onRun(err) {
      if (err) {
        reject(err);
        return;
      }
      resolve({ id: this.lastID, changes: this.changes });
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    const db = openDatabase();
    db.get(sql, params, (err, row) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(row);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    const db = openDatabase();
    db.all(sql, params, (err, rows) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(rows);
    });
  });
}

async function transaction(work) {
  await run("BEGIN IMMEDIATE TRANSACTION");

  try {
    const result = await work();
    await run("COMMIT");
    return result;
  } catch (error) {
    try {
      await run("ROLLBACK");
    } catch (_rollbackError) {
      // Preserve the original failure; rollback errors are secondary here.
    }
    throw error;
  }
}

async function ensureColumn(table, column, definition) {
  const columns = await all(`PRAGMA table_info(${table})`);
  const hasColumn = columns.some((item) => item.name === column);

  if (!hasColumn) {
    await run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

module.exports = {
  run,
  get,
  all,
  transaction,
  ensureColumn,
};
