const { all, run } = require('./src/db/helpers');

async function test() {
  const visitTests = await all('SELECT vt.*, u.username FROM visit_tests vt LEFT JOIN users u ON vt.assigned_to = u.id LIMIT 10');
  console.log('Visit Tests:', visitTests);

  const user = await all("SELECT * FROM users WHERE username = 'technician'");
  console.log('Technician user:', user);
}
test();
