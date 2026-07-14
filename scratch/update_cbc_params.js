const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('e:/Web Development/lab-system/lab-lms.db');

const test_id = 1;

const newParams = [
    { name: "Hb(Haemoglobin)", unit: "gm/dl", range: "Male :13.5 - 18.0, Female :12.0 - 16.0, Infants :13.6 - 19.6", order: 1 },
    { name: "TLC (Total Leukocytes Count)", unit: "", range: "", order: 2 }, // Header param
    { name: "Erythrocytes", unit: "millions/cu.mm", range: "4.0 - 5.5", order: 3 },
    { name: "Leukocytes", unit: "Cell/c.mm", range: "4000 - 11000", order: 4 },
    { name: "DLC (Differential Leukocytes Count)", unit: "", range: "", order: 5 }, // Header param
    { name: "Neutrophils", unit: "%", range: "40 - 70", order: 6 },
    { name: "Lymphocytes", unit: "%", range: "20 - 40", order: 7 },
    { name: "Monocytes", unit: "%", range: "2 - 8", order: 8 },
    { name: "Eosinophils", unit: "%", range: "1 - 6", order: 9 },
    { name: "Basophils", unit: "%", range: "0 - 1", order: 10 },
    { name: "ESR (Erythrocyte Sedimentation Rate)", unit: "", range: "", order: 11 }, // Header param
    { name: "1st Hr. (Westegren Method)", unit: "mm", range: "Male : 0-15, Female 0-20", order: 12 },
    { name: "Platelet Count", unit: "Lakhs/cu mm", range: "1.5 - 4.0", order: 13 },
    { name: "PCV (Packed Cell Volume)", unit: "%", range: "M: 42-52, F: 36-48", order: 14 },
    { name: "MCV (Mean Corpuscular Volume)", unit: "fl", range: "80 - 100", order: 15 },
    { name: "MCH (Mean Corpuscular Haemoglobin)", unit: "pg", range: "26 - 34", order: 16 },
    { name: "MCHC (Mean Corpuscular Hb. Concentration)", unit: "gm/dl", range: "31.5 - 35", order: 17 },
    { name: "Peripheral Smear", unit: "", range: "Methodology: Done by Hematology Analyzer", order: 18 }
];

db.serialize(() => {
    db.run("DELETE FROM test_parameters WHERE test_id = ?", [test_id], (err) => {
        if (err) console.error("Delete failed:", err);
    });

    const stmt = db.prepare("INSERT INTO test_parameters (test_id, parameter_name, unit, normal_range, display_order) VALUES (?, ?, ?, ?, ?)");
    newParams.forEach(p => {
        stmt.run(test_id, p.name, p.unit, p.range, p.order);
    });
    stmt.finalize();
    console.log("Database updated successfully.");
});

db.close();
