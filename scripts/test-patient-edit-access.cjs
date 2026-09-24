const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

test("patient-detail access reveals the patient-management workspace", () => {
  const common = fs.readFileSync(path.join(__dirname, "../frontend/scripts/common.js"), "utf8");
  const reception = fs.readFileSync(path.join(__dirname, "../frontend/scripts/reception.js"), "utf8");
  const technician = fs.readFileSync(path.join(__dirname, "../frontend/scripts/technician.js"), "utf8");
  const admin = fs.readFileSync(path.join(__dirname, "../frontend/admin.html"), "utf8");
  const form = fs.readFileSync(path.join(__dirname, "../frontend/reception.html"), "utf8");
  const definition = common.match(/function getRoleHome\(role, user\) \{[\s\S]*?\n\}(?=\s*function currency)/)?.[0];
  assert.ok(definition);
  const scope = vm.createContext({});
  vm.runInContext(definition, scope);
  assert.equal(scope.getRoleHome("na", { permissions: [], accessControls: { edit_patient_details: true } }), "reception.html#patient-management");
  assert.match(reception, /href === "#patient-management" && \(hasPermission\("manage_billing"\) \|\| canEditPatients\)/);
  assert.match(reception, /"#patient-management" && canEditPatients/);
  assert.match(reception, /if \(!canManagePatientVisits\) \{/);
  assert.match(technician, /hasAccessControl\("edit_patient_details"\)/);
  assert.match(admin, /id="adminPatientManagementLink"/);
  assert.match(form, /id="patientVisitEditFields"/);
  assert.match(form, /id="savePatientEditBtn"/);
});

test("editing only patient details leaves existing visit payments untouched", async () => {
  const connection = require("../src/db/connection");
  await connection.switchDatabasePath(":memory:");
  const { run, get } = require("../src/db/helpers");
  try {
    await run("CREATE TABLE patients (id INTEGER PRIMARY KEY, patient_code TEXT, name TEXT, age INTEGER, gender TEXT, phone TEXT)");
    await run("CREATE TABLE visits (id INTEGER PRIMARY KEY, patient_id INTEGER, discount REAL, amount_paid REAL, amount_due REAL, total REAL, payment_mode TEXT)");
    await run("CREATE TABLE logs (id INTEGER PRIMARY KEY, user_id INTEGER, action TEXT, entity_type TEXT, entity_id TEXT, meta TEXT, created_at TEXT)");
    await run("INSERT INTO patients VALUES (1, '250926-001', 'Old Name', 36, 'Female', '1111111111')");
    await run("INSERT INTO visits VALUES (1, 1, 40, 200, 360, 560, 'upi')");

    const { patientRouter } = require("../src/routes/patientRoutes");
    const route = patientRouter.stack.find((layer) => layer.route?.path === "/:id" && layer.route.methods.patch)?.route;
    assert.ok(route);
    async function patch(user, body) {
      return new Promise((resolve, reject) => {
        let index = 0;
        const response = {
          statusCode: 200,
          status(code) { this.statusCode = code; return this; },
          json(payload) { this.body = payload; resolve(this); return this; },
        };
        function next(error) {
          if (error) return reject(error);
          const layer = route.stack[index++];
          if (!layer) return reject(new Error("Patient route did not respond"));
          Promise.resolve(layer.handle({ user, params: { id: "1" }, body }, response, next)).catch(reject);
        }
        next();
      });
    }

    const editor = { id: 8, role: "na", permissions: [], accessControls: { edit_patient_details: true } };
    const changed = await patch(editor, { name: "New Name", age: 37, gender: "Female", phone: "2222222222" });
    assert.equal(changed.statusCode, 200);
    assert.equal(changed.body.patient.name, "New Name");
    assert.equal(changed.body.visit, undefined);
    assert.deepEqual(
      await get("SELECT discount, amount_paid, amount_due, total, payment_mode FROM visits WHERE id = 1"),
      { discount: 40, amount_paid: 200, amount_due: 360, total: 560, payment_mode: "upi" }
    );

    const billAttempt = await patch(editor, { name: "Wrong", age: 37, gender: "Female", phone: "2222222222", discount: 100 });
    assert.equal(billAttempt.statusCode, 403);
    const testAttempt = await patch(editor, { name: "Wrong", age: 37, gender: "Female", phone: "2222222222", tests: [{ id: 1 }] });
    assert.equal(testAttempt.statusCode, 403);
    const unprivileged = await patch({ id: 9, role: "na", permissions: [], accessControls: {} }, { name: "Wrong", age: 37, gender: "Female", phone: "2222222222" });
    assert.equal(unprivileged.statusCode, 403);
    assert.equal((await get("SELECT name FROM patients WHERE id = 1")).name, "New Name");
    assert.equal((await get("SELECT amount_paid FROM visits WHERE id = 1")).amount_paid, 200);
    assert.equal((await get("SELECT action FROM logs ORDER BY id DESC LIMIT 1")).action, "patient_update");
  } finally {
    await connection.closeDatabase();
  }
});
