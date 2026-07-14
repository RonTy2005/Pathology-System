const { run, get } = require("../src/db/helpers");

async function addReticulocyteTest() {
  try {
    console.log("Adding RETICULOCYTE COUNT test...");

    // Check if test already exists
    let test = await get("SELECT * FROM tests WHERE name = ?", ["RETICULOCYTE COUNT"]);
    
    if (!test) {
      const result = await run(
        `INSERT INTO tests (name, code, category, sample_type, price, turnaround_hours, active, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP)`,
        ["RETICULOCYTE COUNT", "RETIC", "Hematology", "Whole Blood", 250, 24]
      );
      test = { id: result.id };
      console.log("Created test with ID:", test.id);
    } else {
      console.log("Test already exists with ID:", test.id);
    }

    // Add parameters
    const params = [
      { name: "RETICULOCYTE COUNT", unit: "%", range: "0.5 - 2.5" }
    ];

    for (const p of params) {
      const existingParam = await get(
        "SELECT * FROM test_parameters WHERE test_id = ? AND parameter_name = ?",
        [test.id, p.name]
      );

      if (!existingParam) {
        await run(
          `INSERT INTO test_parameters (test_id, parameter_name, unit, normal_range, display_order)
           VALUES (?, ?, ?, ?, ?)`,
          [test.id, p.name, p.unit, p.range, 1]
        );
        console.log(`Added parameter: ${p.name}`);
      } else {
        await run(
          `UPDATE test_parameters SET unit = ?, normal_range = ? WHERE id = ?`,
          [p.unit, p.range, existingParam.id]
        );
        console.log(`Updated parameter: ${p.name}`);
      }
    }

    console.log("Done.");
    process.exit(0);
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

addReticulocyteTest();
