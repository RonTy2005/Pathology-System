const { run, all } = require("../src/db/helpers");

async function updateCBCParameters() {
  const testId = 1; // Complete Blood Count
  
  // 1. Delete existing parameters
  await run("DELETE FROM test_parameters WHERE test_id = ?", [testId]);
  
  // 2. Insert new parameters from docx
  const parameters = [
    { name: "Hemoglobin", unit: "g/dl", range: "12 - 15" },
    { name: "Total Leukocyte Count", unit: "cumm", range: "4,800 - 10,800" },
    { name: "Differential Leucocyte Count", unit: "", range: "" }, // Header
    { name: "Neutrophils", unit: "%", range: "40 - 80" },
    { name: "Lymphocyte", unit: "%", range: "20 - 40" },
    { name: "Eosinophils", unit: "%", range: "1 - 6" },
    { name: "Monocytes", unit: "%", range: "2 - 10" },
    { name: "Basophils", unit: "%", range: "< 2" },
    { name: "Platelet Count", unit: "lakhs/cumm", range: "1.5 - 4.1" },
    { name: "Total RBC Count", unit: "million/cumm", range: "3.9 - 4.8" },
    { name: "Hematocrit Value, Hct", unit: "%", range: "36 - 46" },
    { name: "Mean Corpuscular Volume, MCV", unit: "fL", range: "83 - 101" },
    { name: "Mean Cell Haemoglobin, MCH", unit: "Pg", range: "27 - 32" },
    { name: "Mean Cell Haemoglobin CON, MCHC", unit: "%", range: "31.5 - 34.5" },
    // Adding requested calculated fields even if not in docx table, can be hidden or shown at end
    { name: "RDW", unit: "%", range: "11.5 - 14.5" },
    { name: "Absolute Neutrophil Count", unit: "cumm", range: "2,000 - 7,000" },
    { name: "Absolute Lymphocyte Count", unit: "cumm", range: "1,000 - 3,000" },
    { name: "Absolute Eosinophil Count", unit: "cumm", range: "20 - 500" },
    { name: "Absolute Monocyte Count", unit: "cumm", range: "200 - 1,000" },
    { name: "Absolute Basophil Count", unit: "cumm", range: "20 - 100" }
  ];
  
  for (let i = 0; i < parameters.length; i++) {
    const p = parameters[i];
    await run(
      "INSERT INTO test_parameters (test_id, parameter_name, unit, normal_range, display_order) VALUES (?, ?, ?, ?, ?)",
      [testId, p.name, p.unit, p.range, i + 1]
    );
  }
  
  console.log("CBC parameters updated successfully.");
}

updateCBCParameters().catch(console.error);
