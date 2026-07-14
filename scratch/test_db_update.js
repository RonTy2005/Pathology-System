const { all, run } = require("../src/db/helpers");

async function testUpdate() {
  try {
    // 1. Get a test
    const test = await all("SELECT * FROM tests LIMIT 1");
    if (!test.length) {
      console.log("No tests found");
      return;
    }
    const target = test[0];
    console.log("Original test:", target);

    // 2. Try to update price
    const newPrice = (target.price || 0) + 10;
    await run(
      `UPDATE tests
       SET name = ?, code = ?, category = ?, sample_type = ?, price = ?, turnaround_hours = ?, active = ?
       WHERE id = ?`,
      [target.name, target.code, target.category, target.sample_type, newPrice, target.turnaround_hours || 24, 1, target.id]
    );

    // 3. Verify
    const updated = await all("SELECT * FROM tests WHERE id = ?", [target.id]);
    console.log("Updated test:", updated[0]);
    
    if (updated[0].price === newPrice) {
      console.log("SUCCESS: Price updated in DB");
    } else {
      console.log("FAILURE: Price not updated");
    }
  } catch (error) {
    console.error("ERROR:", error);
  }
}

testUpdate();
