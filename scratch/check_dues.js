const sqlite3 = require("sqlite3").verbose();
const db = new sqlite3.Database("e:/Web Development/lab-system/lab-lms.db");

db.all(
  "SELECT id, bill_no, status, amount_due, created_at FROM visits WHERE amount_due > 0 AND created_at >= '2026-04-01' LIMIT 50",
  [],
  (err, rows) => {
    if (err) {
      console.error(err);
    } else {
      console.log(JSON.stringify(rows, null, 2));
    }
    db.close();
  }
);
