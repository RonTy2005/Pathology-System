const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const {
  PERMISSIONS,
  ROLES,
  ROLE_PERMISSION_DEFAULTS,
} = require("../src/config/constants");
const { allowPermissions } = require("../src/middleware/auth");

test("bill collection is a distinct permission with appropriate default roles", () => {
  assert.equal(PERMISSIONS.COLLECT_DUE_PAYMENTS, "collect_due_payments");
  for (const role of [ROLES.SUPERADMIN, ROLES.ADMIN, ROLES.MANAGER, ROLES.RECEPTIONIST]) {
    assert.ok(ROLE_PERMISSION_DEFAULTS[role].includes(PERMISSIONS.COLLECT_DUE_PAYMENTS), role);
  }
  for (const role of [ROLES.BLOOD_SAMPLE_TECHNICIAN, ROLES.USG_TECHNICIAN, ROLES.MRI_TECHNICIAN, ROLES.CT_TECHNICIAN]) {
    assert.ok(!ROLE_PERMISSION_DEFAULTS[role].includes(PERMISSIONS.COLLECT_DUE_PAYMENTS), role);
  }

  const adminUi = fs.readFileSync(path.join(__dirname, "../frontend/scripts/admin.js"), "utf8");
  assert.match(adminUi, /admin: \[\s*"manage_patients",\s*"manage_billing",\s*"collect_due_payments",/s);
});

test("login sends a collection-only account directly to Due Collection", () => {
  const source = fs.readFileSync(path.join(__dirname, "../frontend/scripts/common.js"), "utf8");
  const definition = source.match(/function getRoleHome\(role, user\) \{[\s\S]*?\n\}(?=\s*function currency)/)?.[0];
  assert.ok(definition, "role landing function exists");
  const scope = vm.createContext({});
  vm.runInContext(definition, scope);
  assert.equal(scope.getRoleHome("na", { permissions: [PERMISSIONS.COLLECT_DUE_PAYMENTS] }), "reception.html#due-collection");
  assert.equal(scope.getRoleHome("na", { permissions: [] }), "login.html");
  assert.equal(scope.getRoleHome(ROLES.MANAGER, { permissions: [PERMISSIONS.COLLECT_DUE_PAYMENTS] }), "admin.html");
});

test("due collection API accepts the collection permission without broad billing access", () => {
  const guard = allowPermissions(PERMISSIONS.COLLECT_DUE_PAYMENTS);
  const response = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; } };
  let reachedHandler = false;
  guard({ user: { permissions: [PERMISSIONS.COLLECT_DUE_PAYMENTS] } }, response, () => { reachedHandler = true; });
  assert.equal(reachedHandler, true);

  guard({ user: { permissions: [PERMISSIONS.MANAGE_BILLING] } }, response, () => { reachedHandler = true; });
  assert.equal(response.statusCode, 403);
});

test("Due Collection and Reports are separate workspaces with their own permissions", () => {
  const reception = fs.readFileSync(path.join(__dirname, "../frontend/scripts/reception.js"), "utf8");
  const visits = fs.readFileSync(path.join(__dirname, "../src/routes/visitRoutes.js"), "utf8");
  const init = fs.readFileSync(path.join(__dirname, "../src/db/init.js"), "utf8");

  assert.match(reception, /const canCollectPayments = hasPermission\("collect_due_payments"\);/);
  assert.match(reception, /const canIssueRefunds = \(isAdministrativeRole\(getUser\(\)\?\.role\).*canManageBilling;/);
  assert.match(reception, /"#due-collection": \["collect_due_payments"\]/);
  assert.match(reception, /"#reports": \["view_reports", "print_reports", "download_reports"\]/);
  assert.match(reception, /const relevantVisits = data\.visits\.filter\(\(visit\) => Number\(visit\.amount_due \|\| 0\) > 0\);/);
  assert.match(reception, /const finalizedVisits = \(data\.visits \|\| \[\]\)\.filter\(\(visit\) => visit\.status === "reported"\);/);
  assert.match(visits, /"\/:id\/payment",\s*allowPermissions\(PERMISSIONS\.COLLECT_DUE_PAYMENTS\)/s);
  assert.doesNotMatch(visits, /"\/:id\/payment",\s*allowRoles\(/s);
  assert.match(init, /applyOneTimeMigration\("bill-collection-permission-v1", grantLegacyDueCollectionPermission\)/);
});

test("older dues remain searchable and a collection-only user can settle them safely", async () => {
  const connection = require("../src/db/connection");
  await connection.switchDatabasePath(":memory:");
  const { run, get } = require("../src/db/helpers");

  try {
    await run("CREATE TABLE patients (id INTEGER PRIMARY KEY, name TEXT, patient_code TEXT, age INTEGER, gender TEXT, phone TEXT, created_at TEXT)");
    await run("CREATE TABLE doctors (id INTEGER PRIMARY KEY, name TEXT)");
    await run("CREATE TABLE associates (id INTEGER PRIMARY KEY, name TEXT)");
    await run("CREATE TABLE tests (id INTEGER PRIMARY KEY, name TEXT)");
    await run("CREATE TABLE visit_tests (id INTEGER PRIMARY KEY, visit_id INTEGER, test_id INTEGER, custom_test_name TEXT, is_outside INTEGER, assigned_to INTEGER)");
    await run("CREATE TABLE visits (id INTEGER PRIMARY KEY, patient_id INTEGER, bill_no TEXT, subtotal REAL, discount REAL DEFAULT 0, total REAL, amount_paid REAL, amount_due REAL, payment_mode TEXT, payment_status TEXT, status TEXT, created_at TEXT, associate_label TEXT, associate_id INTEGER, doctor_id INTEGER)");
    await run("CREATE TABLE logs (id INTEGER PRIMARY KEY, user_id INTEGER, action TEXT, entity_type TEXT, entity_id TEXT, meta TEXT, created_at TEXT)");
    await run("INSERT INTO patients (id, name) VALUES (1, 'Sample Patient')");
    await run("INSERT INTO visits (id, patient_id, bill_no, subtotal, total, amount_paid, amount_due, payment_status, status, created_at) VALUES (1, 1, 'OLD-DUE', 600, 600, 2, 598, 'partial', 'registered', '2026-01-01')");
    await run("WITH RECURSIVE numbers(n) AS (SELECT 2 UNION ALL SELECT n+1 FROM numbers WHERE n < 102) INSERT INTO visits (id, patient_id, bill_no, total, amount_paid, amount_due, payment_status, status, created_at) SELECT n, 1, 'PAID-' || n, 100, 100, 0, 'paid', 'reported', '2026-09-23' FROM numbers");

    const { visitRouter } = require("../src/routes/visitRoutes");
    async function request(method, routePath, req) {
      const route = visitRouter.stack.find((layer) => layer.route?.path === routePath && layer.route.methods[method])?.route;
      assert.ok(route, `${method} ${routePath} exists`);
      return new Promise((resolve, reject) => {
        let index = 0;
        const response = {
          statusCode: 200,
          status(code) { this.statusCode = code; return this; },
          json(body) { this.body = body; resolve(this); return this; },
        };
        function next(error) {
          if (error) return reject(error);
          const layer = route.stack[index++];
          if (!layer) return reject(new Error("Route did not send a response"));
          Promise.resolve(layer.handle(req, response, next)).catch(reject);
        }
        next();
      });
    }

    const user = { id: 7, role: ROLES.BLOOD_SAMPLE_TECHNICIAN, permissions: [PERMISSIONS.COLLECT_DUE_PAYMENTS] };
    const dueList = await request("get", "/", { user, query: { all: "1", due: "1", query: "" } });
    assert.deepEqual(dueList.body.visits.map((visit) => visit.bill_no), ["OLD-DUE"]);

    const excessive = await request("patch", "/:id/payment", { user, params: { id: "1" }, body: { amountPaid: 599, paymentMode: "cash" } }).catch((error) => error);
    assert.match(excessive.message, /exceed the outstanding amount/);
    assert.equal((await get("SELECT amount_due FROM visits WHERE id = 1")).amount_due, 598);

    const collection = await request("patch", "/:id/payment", { user, params: { id: "1" }, body: { amountPaid: 100, paymentMode: "upi" } });
    assert.equal(collection.statusCode, 200);
    assert.equal(collection.body.visit.amount_paid, 102);
    assert.equal(collection.body.visit.amount_due, 498);
    const audit = await get("SELECT action, meta FROM logs WHERE entity_id = '1'");
    assert.equal(audit.action, "payment_collected");
    assert.equal(JSON.parse(audit.meta).amount, 100);

    const excessiveDiscount = await request("patch", "/:id/payment", { user, params: { id: "1" }, body: { amountPaid: 450, discount: 50, paymentMode: "cash" } }).catch((error) => error);
    assert.match(excessiveDiscount.message, /exceed the outstanding amount/);
    assert.equal((await get("SELECT amount_due FROM visits WHERE id = 1")).amount_due, 498);

    const discountedCollection = await request("patch", "/:id/payment", { user, params: { id: "1" }, body: { amountPaid: 150, discount: 50, paymentMode: "cash" } });
    assert.equal(discountedCollection.body.visit.discount, 50);
    assert.equal(discountedCollection.body.visit.total, 550);
    assert.equal(discountedCollection.body.visit.amount_paid, 252);
    assert.equal(discountedCollection.body.visit.amount_due, 298);
    assert.equal(discountedCollection.body.visit.payment_status, "partial");

    const discountOnly = await request("patch", "/:id/payment", { user, params: { id: "1" }, body: { amountPaid: 0, discount: 298, paymentMode: "upi" } });
    assert.equal(discountOnly.body.visit.discount, 348);
    assert.equal(discountOnly.body.visit.total, 252);
    assert.equal(discountOnly.body.visit.amount_paid, 252, "a discount must not be recorded as cash received");
    assert.equal(discountOnly.body.visit.amount_due, 0);
    assert.equal(discountOnly.body.visit.payment_status, "paid");
    assert.equal(discountOnly.body.visit.payment_mode, "cash", "a discount-only change preserves the last actual payment mode");
    const discountAudit = await get("SELECT action, meta FROM logs WHERE entity_id = '1' ORDER BY id DESC LIMIT 1");
    assert.equal(discountAudit.action, "due_discount_applied");
    assert.equal(JSON.parse(discountAudit.meta).discount, 298);

    await run("INSERT INTO visits (id, patient_id, bill_no, subtotal, total, amount_paid, amount_due, payment_status, status, created_at) VALUES (200, 1, 'DISCOUNT-ONLY', 100, 100, 0, 100, 'due', 'registered', '2026-09-25')");
    const invalidDiscount = await request("patch", "/:id/payment", { user, params: { id: "200" }, body: { amountPaid: 0, discount: -1, paymentMode: "cash" } });
    assert.equal(invalidDiscount.statusCode, 400);
    assert.equal((await get("SELECT amount_due FROM visits WHERE id = 200")).amount_due, 100);
    const fullWaiver = await request("patch", "/:id/payment", { user, params: { id: "200" }, body: { amountPaid: 0, discount: 100, paymentMode: "cash" } });
    assert.equal(fullWaiver.body.visit.total, 0);
    assert.equal(fullWaiver.body.visit.amount_paid, 0);
    assert.equal(fullWaiver.body.visit.amount_due, 0);
    assert.equal(fullWaiver.body.visit.payment_status, "paid");
  } finally {
    await connection.closeDatabase();
  }
});

test("Due Collection shows the discount and remaining balance before saving", () => {
  const form = fs.readFileSync(path.join(__dirname, "../frontend/reception.html"), "utf8");
  const logic = fs.readFileSync(path.join(__dirname, "../frontend/scripts/reception.js"), "utf8");
  assert.match(form, /id="paymentDiscount"[^>]*min="0"/);
  assert.match(form, /id="paymentBalancePreview"/);
  assert.match(logic, /updatePaymentBalancePreview\(true\)/);
  assert.match(logic, /JSON\.stringify\(\{ amountPaid: amount, discount, paymentMode: mode \}\)/);
});
