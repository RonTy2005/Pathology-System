const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { PERMISSIONS, ROLES } = require("../src/config/constants");

const reception = fs.readFileSync(path.join(__dirname, "../frontend/scripts/reception.js"), "utf8");
const common = fs.readFileSync(path.join(__dirname, "../frontend/scripts/common.js"), "utf8");
const visitRoutes = fs.readFileSync(path.join(__dirname, "../src/routes/visitRoutes.js"), "utf8");

function renderHistory(canBill) {
  const definition = reception.match(/function renderPatientHistory\(visits, container = [\s\S]*?\n\}(?=\s*function updateEditTotals)/)?.[0];
  assert.ok(definition, "patient-history renderer exists");
  const actions = [];
  const container = {
    innerHTML: "",
    querySelectorAll(selector) {
      const key = selector.slice(1, -1);
      return [...this.innerHTML.matchAll(new RegExp(`${key}="(\\d+)"`, "g"))].map((match) => ({
        dataset: { [key.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())]: match[1] },
        textContent: "Download PDF",
        addEventListener(_name, callback) { this.click = callback; actions.push({ key, button: this }); },
      }));
    },
  };
  const scope = vm.createContext({
    document: {},
    hasPermission: (permission) => permission === "manage_billing" && canBill,
    escapeHtml: (value) => String(value).replace(/</g, "&lt;"),
    formatDate: (value) => value,
    currency: (value) => `Rs. ${Number(value).toFixed(2)}`,
    openHtmlBill: (id, print) => actions.push({ operation: print ? "print" : "preview", id }),
    shareBillViaWhatsApp: (id) => actions.push({ operation: "share", id }),
    downloadBillPdf: async (id, billNo) => actions.push({ operation: "download", id, billNo }),
    alert: () => {},
  });
  vm.runInContext(definition, scope);
  scope.renderPatientHistory([
    { id: 1, bill_no: "OLD-1", created_at: "2026-01-01", tests: "CBC", doctor_name: "Self", total: 120, status: "reported" },
    { id: 2, bill_no: "OLD-2", created_at: "2026-01-02", tests: "TSH", doctor_name: "Self", total: 230, status: "registered" },
  ], container);
  return { container, actions };
}

test("every previous visit exposes all four bill actions only with billing permission", async () => {
  const permitted = renderHistory(true);
  assert.match(permitted.container.innerHTML, /OLD-1/);
  assert.match(permitted.container.innerHTML, /OLD-2/);
  for (const key of ["data-bill-preview", "data-bill-print", "data-download-bill", "data-share-bill"]) {
    assert.equal(permitted.actions.filter((item) => item.key === key).length, 2, key);
  }
  permitted.actions.find((item) => item.key === "data-bill-preview").button.click();
  permitted.actions.find((item) => item.key === "data-bill-print").button.click();
  permitted.actions.find((item) => item.key === "data-share-bill").button.click();
  await permitted.actions.find((item) => item.key === "data-download-bill").button.click();
  assert.deepEqual(permitted.actions.filter((item) => item.operation).map((item) => item.operation), ["preview", "print", "share", "download"]);
  assert.deepEqual(permitted.actions.filter((item) => item.operation).map((item) => item.id), ["1", "1", "1", 1]);

  const forbidden = renderHistory(false);
  assert.doesNotMatch(forbidden.container.innerHTML, /data-(bill-preview|bill-print|download-bill|share-bill)/);
  assert.equal(forbidden.actions.length, 0);
});

test("billing-only accounts land on read-only history and bill endpoints require billing permission", () => {
  const definition = common.match(/function getRoleHome\(role, user\) \{[\s\S]*?\n\}(?=\s*function currency)/)?.[0];
  assert.ok(definition);
  const scope = vm.createContext({});
  vm.runInContext(definition, scope);
  assert.equal(scope.getRoleHome(ROLES.NA, { permissions: [PERMISSIONS.MANAGE_BILLING] }), "reception.html#patient-management");
  assert.match(reception, /if \(!canManagePatientVisits && !canEditPatientDetails\) \{\s*if \(!hasPermission\("manage_billing"\)\) return;/);
  assert.match(reception, /patientEditForm\.hidden = true;/);
  assert.match(visitRoutes, /"\/:id\/bill-share",\s*allowRoles\([^)]*ROLES\.MANAGER[^)]*ROLES\.NA[^)]*\),\s*allowPermissions\(PERMISSIONS\.MANAGE_BILLING\)/s);
  assert.match(visitRoutes, /"\/:id\/bill", allowRoles\([^)]*ROLES\.MANAGER[^)]*ROLES\.NA[^)]*\)[\s\S]*?hasPermission\(req\.user, PERMISSIONS\.MANAGE_BILLING\)/);
  assert.match(visitRoutes, /"\/:id\/bill-print", allowRoles\([^)]*ROLES\.MANAGER[^)]*ROLES\.NA[^)]*\)[\s\S]*?hasPermission\(req\.user, PERMISSIONS\.MANAGE_BILLING\)/);
});
