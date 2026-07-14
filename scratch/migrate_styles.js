const fs = require('fs');
const filePath = 'e:/Web Development/lab-system/src/utils/reportFormatter.js';
let content = fs.readFileSync(filePath, 'utf8');

// Replace all hardcoded small styles with the class
content = content.replace(/<div style="font-size: 9\.5px; margin-top: 2px; line-height: 1\.0;">/g, '<div class="report-notes">');
content = content.replace(/<div style="font-size: 11\.5px; margin-top: 3px; line-height: 1\.05;">/g, '<div class="report-notes">');
content = content.replace(/<div style="font-size: 10px;">/g, '<div class="report-notes">');
content = content.replace(/<div style="font-size: 11px;">/g, '<div class="report-notes">');
content = content.replace(/margin-top: 2px; line-height: 1\.0;/g, 'margin-top: 8px; line-height: 1.2;');

fs.writeFileSync(filePath, content);
console.log("Migration to report-notes class complete.");
