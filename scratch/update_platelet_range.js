const sqlite3 = require('sqlite3');
const db = new sqlite3.Database('lab-lms.db');

db.all("SELECT id, name, parameters FROM tests WHERE name = 'Platelet Count'", (err, rows) => {
    if (err) {
        console.error(err);
        process.exit(1);
    }
    
    rows.forEach(row => {
        let params = JSON.parse(row.parameters);
        params = params.map(p => {
            if (p.parameter_name === 'Platelet Count') {
                return {
                    ...p,
                    unit: 'cumm',
                    normal_range: '150000 - 410000'
                };
            }
            return p;
        });
        
        db.run("UPDATE tests SET parameters = ? WHERE id = ?", [JSON.stringify(params), row.id], (err) => {
            if (err) console.error("Error updating test " + row.id, err);
            else console.log("Updated test " + row.name + " (ID: " + row.id + ")");
        });
    });
});
