const fs = require('fs');

let t = fs.readFileSync('frontend/scripts/technician.js', 'utf8');
t = t.replace(/"ESR \(Erythrocyte Sedimentation Rate\)"/g, '"ESR (Erythrocyte Sedimentation Rate)",\n          "RBC COUNT"');
fs.writeFileSync('frontend/scripts/technician.js', t);

let r = fs.readFileSync('src/utils/reportFormatter.js', 'utf8');
r = r.replace(/"ESR \(Erythrocyte Sedimentation Rate\)"/g, '"ESR (Erythrocyte Sedimentation Rate)",\n                  "RBC COUNT"');
fs.writeFileSync('src/utils/reportFormatter.js', r);

console.log("Added RBC COUNT to isHeader");
