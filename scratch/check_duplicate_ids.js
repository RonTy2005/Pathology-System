const fs = require('fs');
const content = fs.readFileSync('frontend/admin.html', 'utf8');
const ids = content.match(/id="([^"]+)"/g) || [];
const counts = {};
ids.forEach(idStr => {
  const id = idStr.match(/"([^"]+)"/)[1];
  counts[id] = (counts[id] || 0) + 1;
});
console.log(JSON.stringify(Object.entries(counts).filter(([id, count]) => count > 1), null, 2));
