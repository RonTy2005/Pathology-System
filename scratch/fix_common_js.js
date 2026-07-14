const fs = require('fs');
const path = 'e:/Web Development/lab-system/frontend/scripts/common.js';
let content = fs.readFileSync(path, 'utf8');

const target = 'const name = row.dataset.parameterName;\n    if (input) {';
const replacement = 'const name = row.dataset.parameterName;\n    const input = row.querySelector("input, textarea");\n    if (input) {';

if (content.includes(target)) {
    content = content.replace(target, replacement);
    fs.writeFileSync(path, content);
    console.log("Successfully fixed common.js");
} else {
    console.log("Target not found in common.js");
}
