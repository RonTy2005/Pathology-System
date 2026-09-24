const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { PERMISSIONS, ROLES } = require("../src/config/constants");
const { normalizePermissions } = require("../src/services/authService");

test("startup preserves explicitly revoked admin report permissions", async () => {
  const connection = require("../src/db/connection");
  await connection.switchDatabasePath(":memory:");
  const { get, run } = require("../src/db/helpers");
  try {
    await run("CREATE TABLE users (id INTEGER PRIMARY KEY, role TEXT, permissions TEXT, access_controls TEXT, employee_code TEXT)");
    await run("INSERT INTO users (id, role, permissions) VALUES (1, 'admin', '[]')");
    await run("INSERT INTO users (id, role, permissions) VALUES (2, 'admin', ?)", [JSON.stringify([PERMISSIONS.MANAGE_USERS])]);
    await run("INSERT INTO users (id, role, permissions) VALUES (3, 'admin', NULL)");

    const { ensureUserDefaults } = require("../src/db/init");
    await ensureUserDefaults();
    await ensureUserDefaults();

    const empty = await get("SELECT permissions FROM users WHERE id = 1");
    const restricted = await get("SELECT permissions FROM users WHERE id = 2");
    const fresh = await get("SELECT permissions FROM users WHERE id = 3");
    assert.deepEqual(normalizePermissions(ROLES.ADMIN, empty.permissions), []);
    assert.deepEqual(normalizePermissions(ROLES.ADMIN, restricted.permissions), [PERMISSIONS.MANAGE_USERS]);
    assert.ok(normalizePermissions(ROLES.ADMIN, fresh.permissions).includes(PERMISSIONS.PRINT_REPORTS));
  } finally {
    await connection.closeDatabase();
  }
});

test("editing a user does not reselect role defaults for an empty saved list", () => {
  const source = fs.readFileSync(path.join(__dirname, "../frontend/scripts/admin.js"), "utf8");
  const definition = source.match(/function getPermissionsForEdit\(user\) \{[\s\S]*?\n\}/)?.[0];
  assert.ok(definition);
  const scope = vm.createContext({ ROLE_DEFAULTS: { admin: [PERMISSIONS.PRINT_REPORTS] } });
  vm.runInContext(definition, scope);
  assert.deepEqual(Array.from(scope.getPermissionsForEdit({ role: ROLES.ADMIN, permissions: [] })), []);
  assert.deepEqual(Array.from(scope.getPermissionsForEdit({ role: ROLES.ADMIN, permissions: null })), [PERMISSIONS.PRINT_REPORTS]);
});

test("all staff report routes reject a user with report access revoked", () => {
  const { visitRouter } = require("../src/routes/visitRoutes");
  const user = { id: 2, role: ROLES.ADMIN, permissions: [PERMISSIONS.MANAGE_USERS] };
  function denied(method, routePath, query = {}) {
    const route = visitRouter.stack.find((layer) => layer.route?.path === routePath && layer.route.methods[method])?.route;
    assert.ok(route, `${method} ${routePath} exists`);
    const response = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
    let index = 0;
    function next(error) {
      if (error) throw error;
      const layer = route.stack[index++];
      assert.ok(layer, "an authorized handler must not be reached");
      assert.notEqual(index, route.stack.length, "the final report handler must not run");
      layer.handle({ user, query, params: { id: "1" } }, response, next);
    }
    next();
    assert.equal(response.statusCode, 403, `${method} ${routePath} ${JSON.stringify(query)}`);
  }

  denied("get", "/:id/report", { format: "html" });
  denied("get", "/:id/report", { format: "html", print: "1" });
  denied("get", "/:id/report", { format: "html", pdf: "1" });
  denied("get", "/:id/report", { format: "html", whatsapp: "1" });
  denied("post", "/:id/print");
});

test("result-entry pages do not re-enable report printing after finalization without permission", () => {
  const reception = fs.readFileSync(path.join(__dirname, "../frontend/scripts/reception.js"), "utf8");
  const technician = fs.readFileSync(path.join(__dirname, "../frontend/scripts/technician.js"), "utf8");
  assert.match(reception, /resultsPrintBtn\.disabled = !hasPermission\("print_reports"\) \|\| !reportData\?\.report\?\.finalized/);
  assert.match(reception, /resultsPrintBtn\.disabled = !hasPermission\("print_reports"\);/);
  assert.match(technician, /printBtn\.disabled = !hasPermission\("print_reports"\) \|\| !reportData\?\.report\?\.finalized/);
  assert.match(technician, /patientPrintBtn\.disabled = !hasPermission\("print_reports"\) \|\| !reportData\?\.report\?\.finalized/);
  assert.match(technician, /printBtn\.disabled = !hasPermission\("print_reports"\);/);
  assert.match(technician, /patientPrintBtn\.disabled = !hasPermission\("print_reports"\);/);
});
