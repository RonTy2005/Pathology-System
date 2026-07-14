const fs = require('fs');
const sig = fs.readFileSync('e:/Web Development/lab-system/scratch/sig_b64.txt', 'utf8').trim();
let content = fs.readFileSync('e:/Web Development/lab-system/src/utils/reportFormatter.js', 'utf8');

// Find the line with the img tag and replace the base64 part
const regex = /<img src="data:image\/jpeg;base64,[^"]*"/;
const newContent = content.replace(regex, `<img src="data:image/jpeg;base64,${sig}"`);

fs.writeFileSync('e:/Web Development/lab-system/src/utils/reportFormatter.js', newContent);
console.log('Successfully patched reportFormatter.js with full signature.');
