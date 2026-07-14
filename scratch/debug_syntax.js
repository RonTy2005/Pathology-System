const fs = require('fs');
const content = fs.readFileSync('e:/Web Development/lab-system/src/utils/reportFormatter.js', 'utf8');
let openBrackets = 0;
let openBraces = 0;
let inTemplate = false;
let inSingleQuote = false;
let inDoubleQuote = false;

for (let i = 0; i < content.length; i++) {
    const char = content[i];
    if (char === '`') inTemplate = !inTemplate;
    if (char === "'" && !inTemplate && !inDoubleQuote) inSingleQuote = !inSingleQuote;
    if (char === '"' && !inTemplate && !inSingleQuote) inDoubleQuote = !inDoubleQuote;
    if (char === '(') openBrackets++;
    if (char === ')') openBrackets--;
    if (char === '{') openBraces++;
    if (char === '}') openBraces--;
}

console.log({ openBrackets, openBraces, inTemplate, inSingleQuote, inDoubleQuote });
