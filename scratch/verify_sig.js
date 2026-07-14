const fs = require('fs');
const content = fs.readFileSync('e:/Web Development/lab-system/src/utils/reportFormatter.js', 'utf8');
const match = content.match(/src="data:image\/jpeg;base64,([^"]+)"/);
if (match) {
    try {
        const b = Buffer.from(match[1].trim(), 'base64');
        console.log('Valid base64, length:', match[1].trim().length);
        console.log('Buffer size:', b.length);
        // Check if it's a valid JPEG header
        if (b[0] === 0xff && b[1] === 0xd8) {
            console.log('Valid JPEG header found');
        } else {
            console.log('INVALID JPEG header:', b[0].toString(16), b[1].toString(16));
        }
    } catch (e) {
        console.log('Invalid base64:', e.message);
    }
} else {
    console.log('No match found');
}
