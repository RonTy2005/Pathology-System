const { all } = require("../src/db/helpers");

async function checkRecentLogs() {
  try {
    const logs = await all("SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 10");
    console.log("Recent Audit Logs:");
    console.log(JSON.stringify(logs, null, 2));
    
    const tests = await all("SELECT id, name, price FROM tests ORDER BY id DESC LIMIT 5");
    console.log("Recent Tests:");
    console.log(JSON.stringify(tests, null, 2));
  } catch (error) {
    console.error(error);
  }
}

checkRecentLogs();
