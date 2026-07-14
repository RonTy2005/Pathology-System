const http = require('http');

function request(options, body) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: data.startsWith('{') ? JSON.parse(data) : data });
        } catch (e) {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function run() {
  const login = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/auth/login',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, { username: 'admin', password: 'admin123' });

  const token = login.body.token;

  const csv = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/dashboard/patient-data-csv',
    method: 'GET',
    headers: { 'Authorization': `Bearer ${token}` }
  });

  console.log("Status:", csv.status);
  console.log("CSV Preview (First 5 lines):");
  console.log(csv.body.split('\n').slice(0, 5).join('\n'));
}

run();
