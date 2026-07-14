const fs = require('fs');

function updateFile(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');
    const target = '${isHeader ? \'<span></span>\' : \'<input placeholder="Enter value" />\'}';
    const replacement = '${isHeader ? \'<span></span>\' : (parameter.parameter_name === "Peripheral Smear" ? \'<textarea placeholder="Enter smear details (optional)" style="width: 100%; min-height: 60px;"></textarea>\' : \'<input placeholder="Enter value" />\')}';
    
    if (content.includes(target)) {
        content = content.replace(new RegExp(target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), replacement);
        
        // Also need to update result collection to handle textarea
        content = content.replace(/const input = row.querySelector\("input"\);/g, 'const input = row.querySelector("input, textarea");');
        
        fs.writeFileSync(filePath, content);
        console.log(`Updated ${filePath}`);
    } else {
        console.log(`Target not found in ${filePath}`);
    }
}

updateFile('e:/Web Development/lab-system/frontend/scripts/technician.js');
updateFile('e:/Web Development/lab-system/frontend/scripts/reception.js');
