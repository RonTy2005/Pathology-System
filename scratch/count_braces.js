const fs = require('fs');
const content = fs.readFileSync('e:/Web Development/lab-system/scratch/reconstruct_formatter.js', 'utf8');

let openBraces = 0;
let closeBraces = 0;
let openParens = 0;
let closeParens = 0;
let backticks = 0;

for (let i = 0; i < content.length; i++) {
    const char = content[i];
    if (char === '{') openBraces++;
    if (char === '}') closeBraces++;
    if (char === '(') openParens++;
    if (char === ')') closeParens++;
    if (char === '`') {
        if (i === 0 || content[i-1] !== '\\') {
            backticks++;
        }
    }
}

console.log('Braces:', openBraces, closeBraces, openBraces === closeBraces ? 'OK' : 'MISSING');
console.log('Parens:', openParens, closeParens, openParens === closeParens ? 'OK' : 'MISSING');
console.log('Backticks:', backticks, backticks % 2 === 0 ? 'OK' : 'UNBALANCED');
