const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { PERMISSIONS, ROLES } = require('../src/config/constants');
const { testRouter } = require('../src/routes/testRoutes');

function routeFor(method, routePath) {
  const route = testRouter.stack.find(layer => layer.route?.path === routePath && layer.route.methods[method])?.route;
  assert.ok(route, `${method.toUpperCase()} ${routePath} exists`);
  return route;
}

test('a user assigned only manage_tests lands in the catalogue and the page uses permission access', () => {
  const common = fs.readFileSync(path.join(__dirname, '../frontend/scripts/common.js'), 'utf8');
  const catalogue = fs.readFileSync(path.join(__dirname, '../frontend/scripts/testCatalog.js'), 'utf8');
  const definition = common.match(/function getRoleHome\(role, user\) \{[\s\S]*?\n\}(?=\s*function currency)/)?.[0];
  assert.ok(definition);
  const scope = vm.createContext({});
  vm.runInContext(definition, scope);
  assert.equal(scope.getRoleHome(ROLES.NA, { permissions: [PERMISSIONS.MANAGE_TESTS] }), 'test-catalog.html');
  assert.equal(scope.getRoleHome(ROLES.NA, { permissions: [] }), 'login.html');
  assert.match(catalogue, /const currentUser = protectPage\(\);/);
  assert.match(catalogue, /if \(!hasPermission\("manage_tests"\)\)/);
  assert.match(common, /link\.textContent = "Test Catalogue"/);
});

test('every catalogue action and both previews require manage_tests, regardless of role', () => {
  for (const [method, routePath] of [
    ['post', '/builder-report-preview'], ['get', '/:id/sample-report'],
    ['post', '/'], ['post', '/import'], ['put', '/:id'], ['delete', '/:id'],
  ]) {
    const route = routeFor(method, routePath);
    assert.equal(route.stack.length, 2, `${method} ${routePath} has only a permission guard before its handler`);
    const guard = route.stack[0].handle;
    let reached = false;
    const allowed = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json() {} };
    guard({ user: { role: ROLES.NA, permissions: [PERMISSIONS.MANAGE_TESTS] } }, allowed, () => { reached = true; });
    assert.equal(reached, true, `${method} ${routePath} accepts the assigned permission`);
    reached = false;
    const denied = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json() {} };
    guard({ user: { role: ROLES.ADMIN, permissions: [] } }, denied, () => { reached = true; });
    assert.equal(reached, false);
    assert.equal(denied.statusCode, 403);
  }
});

test('a manage_tests-only user can change a catalogue price without other permissions', async () => {
  const connection = require('../src/db/connection');
  await connection.switchDatabasePath(':memory:');
  const { run, get } = require('../src/db/helpers');
  try {
    await run('CREATE TABLE tests (id INTEGER PRIMARY KEY, name TEXT, code TEXT, category TEXT, sample_type TEXT, price REAL, turnaround_hours INTEGER, report_body TEXT, active INTEGER)');
    await run('CREATE TABLE test_parameters (test_id INTEGER, parameter_name TEXT, unit TEXT, normal_range TEXT, entry_mode TEXT, calculation_formula TEXT, calculation_precision INTEGER, display_order INTEGER)');
    await run('CREATE TABLE logs (user_id INTEGER, action TEXT, entity_type TEXT, entity_id TEXT, meta TEXT, created_at TEXT)');
    await run("INSERT INTO tests (id,name,price,active) VALUES (1,'Sample Test',100,1)");

    const route = routeFor('put', '/:id');
    const request = (user) => new Promise((resolve, reject) => {
      let index = 0;
      const response = {
        statusCode: 200,
        status(code) { this.statusCode = code; return this; },
        json(body) { this.body = body; resolve(this); return this; },
      };
      const req = {
        user, params: { id: '1' },
        body: { name: 'Sample Test', code: 'SAMPLE', category: 'Lab', sampleType: 'Serum', price: 275,
          turnaroundHours: 24, active: true, parameters: [{ parameterName: 'Result', unit: '', normalRange: '' }], reportBody: '' },
      };
      function next(error) {
        if (error) return reject(error);
        const layer = route.stack[index++];
        if (!layer) return reject(new Error('Route did not send a response'));
        Promise.resolve(layer.handle(req, response, next)).catch(reject);
      }
      next();
    });

    const denied = await request({ id: 2, role: ROLES.ADMIN, permissions: [] });
    assert.equal(denied.statusCode, 403);
    assert.equal((await get('SELECT price FROM tests WHERE id=1')).price, 100);

    const saved = await request({ id: 3, role: ROLES.NA, permissions: [PERMISSIONS.MANAGE_TESTS] });
    assert.equal(saved.statusCode, 200);
    assert.equal((await get('SELECT price FROM tests WHERE id=1')).price, 275);
    assert.equal((await get('SELECT action FROM logs WHERE entity_id=?', ['1'])).action, 'test_update');
  } finally {
    await connection.closeDatabase();
  }
});
