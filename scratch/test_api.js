const http = require('http');

http.get('http://localhost:3000/api/patients/search?q=', (res) => {
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  res.on('end', () => {
    console.log(data);
    process.exit(0);
  });
}).on("error", (err) => {
  console.log("Error: " + err.message);
  process.exit(1);
});
