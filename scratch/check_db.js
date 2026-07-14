const { all } = require("../src/db/helpers");

async function test() {
  try {
    const columns = await all("PRAGMA table_info(visits)");
    console.log("Visits columns:", columns.map(c => c.name));
  } catch (err) {
    console.error(err);
  }
}
test();
