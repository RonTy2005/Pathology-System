const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const vm = require("node:vm");
const { PERMISSIONS, ROLES } = require("../src/config/constants");

function getRoleHome() {
  const source = fs.readFileSync(path.join(__dirname, "../frontend/scripts/common.js"), "utf8");
  const definition = source.match(/function getRoleHome\(role, user\) \{[\s\S]*?\n\}(?=\s*function currency)/)?.[0];
  assert.ok(definition, "role landing function exists");
  const scope = vm.createContext({});
  vm.runInContext(definition, scope);
  return scope.getRoleHome;
}

test("each assigned N/A workspace permission has a reachable landing tab", () => {
  const roleHome = getRoleHome();
  const destinations = [
    [PERMISSIONS.MANAGE_PATIENTS, "reception.html#new-visit"],
    [PERMISSIONS.MANAGE_BILLING, "reception.html#billing"],
    [PERMISSIONS.COLLECT_DUE_PAYMENTS, "reception.html#due-collection"],
    [PERMISSIONS.ENTER_RESULTS, "reception.html#results-entry"],
    [PERMISSIONS.FINALIZE_REPORTS, "reception.html#results-entry"],
    [PERMISSIONS.VIEW_REPORTS, "reception.html#reports"],
    [PERMISSIONS.PRINT_REPORTS, "reception.html#reports"],
    [PERMISSIONS.DOWNLOAD_REPORTS, "reception.html#reports"],
    [PERMISSIONS.SHARE_WHATSAPP_PDF, "reception.html#reports"],
    [PERMISSIONS.MANAGE_TESTS, "reception.html#test-catalog"],
  ];
  for (const [permission, destination] of destinations) {
    assert.equal(roleHome(ROLES.NA, { permissions: [permission] }), destination, permission);
  }
});

test("reception navigation exposes every permitted N/A workspace", () => {
  const source = fs.readFileSync(path.join(__dirname, "../frontend/scripts/reception.js"), "utf8");
  assert.match(source, /const receptionWorkspacePermissions = \[/);
  assert.match(source, /href === "#new-visit" && hasPermission\("manage_patients"\)/);
  assert.match(source, /href === "#results-entry" && \(hasPermission\("enter_results"\) \|\| hasPermission\("finalize_reports"\)\)/);
  assert.match(source, /href === "#reports" && \["view_reports", "print_reports", "download_reports", "share_whatsapp_pdf"\]/);
  assert.match(source, /href === "#test-catalog" && hasPermission\("manage_tests"\)/);
});

test("permission edits refresh an active user session instead of invalidating it", () => {
  const auth = fs.readFileSync(path.join(__dirname, "../src/services/authService.js"), "utf8");
  const users = fs.readFileSync(path.join(__dirname, "../src/routes/userRoutes.js"), "utf8");
  assert.match(auth, /async function refreshUserSessions\(userId\)/);
  assert.match(users, /await refreshUserSessions\(req\.params\.id\)/);
  assert.doesNotMatch(users, /await invalidateUserSessions\(req\.params\.id\)/);
});
