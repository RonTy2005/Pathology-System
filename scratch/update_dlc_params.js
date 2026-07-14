const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('lab-lms.db');

db.serialize(() => {
    db.get("SELECT id FROM tests WHERE name LIKE '%DLC%' OR name LIKE '%DIFFERENTIAL LEUCOCYTE COUNT%'", (err, test) => {
        if (err || !test) {
            console.error('Test not found');
            process.exit(1);
        }
        
        const testId = test.id;
        console.log(`Updating parameters for test ID: ${testId}`);
        
        db.run("DELETE FROM test_parameters WHERE test_id = ?", [testId], (err) => {
            if (err) {
                console.error('Error deleting old parameters:', err);
                process.exit(1);
            }
            
            const params = [
                ['Neutrophils', '%', '50 - 62', 1],
                ['Lymphocytes', '%', '20 - 40', 2],
                ['Eosinophils', '%', '00 - 06', 3],
                ['Monocytes', '%', '00 - 10', 4],
                ['Basophils', '%', '00 - 02', 5]
            ];
            
            const stmt = db.prepare("INSERT INTO test_parameters (test_id, parameter_name, unit, normal_range, display_order) VALUES (?, ?, ?, ?, ?)");
            params.forEach(p => stmt.run(testId, p[0], p[1], p[2], p[3]));
            stmt.finalize(() => {
                console.log('DLC Parameters updated successfully');
                db.close();
            });
        });
    });
});
