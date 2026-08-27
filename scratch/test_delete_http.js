const http = require('http');

function request(options, body) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(data) }));
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
  }, { username: 'RonTy', password: 'BokaChoda69!' });

  const token = login.body.token;

  const del = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/users/16',
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${token}` }
  });

  console.log(JSON.stringify(del, null, 2));
}

run();
