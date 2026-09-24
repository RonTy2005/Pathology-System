const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { buildBillHtml } = require("../src/utils/billFormatter");
const { sampleBill } = require("./bill-layout-fixture.cjs");

test("short bills remain in the upper half of A4 with readable print typography", () => {
  const html = buildBillHtml(sampleBill(5));
  assert.match(html, /<h1>LabShield Diagnostic Centre<\/h1>/);
  assert.doesNotMatch(html, /Diagnostic Laboratory/, "business category is not printed below the name");
  assert.match(html, /@page \{ size: A4 portrait; margin: 0 !important; \}/);
  assert.match(html, /\.bill-slip \{ width: 210mm; height: 148\.5mm; padding: 5mm 8mm 4mm;/);
  assert.match(html, /body \{[^}]*font-size: 11\.5px; line-height: 1\.3;/);
  assert.match(html, /\.items-table th \{[^}]*font-size: 10px;/);
  assert.match(html, /\.items-table td \{[^}]*min-height: 7mm;[^}]*font-size: 11\.2px;/);
  assert.match(html, /\.details-column p \{[^}]*font-size: 10\.5px;/);
  assert.match(html, /\.totals-table \{[^}]*font-size: 10px;/);
  assert.match(html, /<p class="business-address">123 Laboratory Road, City Centre, Kolkata, West Bengal<\/p>/);
  assert.match(html, /\.brand-block \.business-address \{[^}]*font-weight: 700;/);
  assert.match(html, /Please collect the report only from the lab at the scheduled time \(Business hours: 9:00 AM to 6:30 PM\)\./);
  assert.match(html, /\.receipt-notes \.collection-note \{[^}]*font-size: 10px; font-weight: 700;/);
  assert.equal((html.match(/class="bill-slip/g) || []).length, 1);
  assert.equal((html.match(/<tbody>/g) || []).length, 2, "items and totals tables remain present");
});

test("a sixth service starts a second upper-half bill instead of shrinking the first bill", () => {
  const html = buildBillHtml(sampleBill(6));
  assert.equal((html.match(/class="bill-slip/g) || []).length, 2);
  assert.match(html, /Continued on the next booking slip/);
  assert.match(html, /continued \(page 2 of 2\)/);
  assert.equal((html.match(/Please collect the report only from the lab/g) || []).length, 1, "collection notice appears on the settlement page only");
});

test("collection notice omits hours when the lab has not configured both times", () => {
  const fixture = sampleBill(1);
  fixture.businessSettings.businessClosingTime = "";
  const html = buildBillHtml(fixture);
  assert.match(html, /Please collect the report only from the lab at the scheduled time\./);
  assert.doesNotMatch(html, /Business hours:/);
});

test("WhatsApp bill link reduces only on-screen service names, not printable bills", () => {
  const fixture = sampleBill(2);
  const shared = buildBillHtml(fixture, { sharedLinkView: true });
  const normal = buildBillHtml(fixture);
  assert.match(shared, /<body class="shared-link-bill">/);
  assert.match(shared, /@media screen \{[\s\S]*?\.shared-link-bill \.items-table td\.service strong \{ font-size: 9\.5px; font-weight: 600;/);
  assert.match(shared, /\.items-table td\.service strong \{ font-size: 11\.2px; \}/);
  assert.match(normal, /<body>\s*<main class="bill-slip/);
  assert.doesNotMatch(normal, /<body class="shared-link-bill">/);

  const portalRoute = fs.readFileSync(path.join(__dirname, "../src/routes/patientPortalRoutes.js"), "utf8");
  assert.match(portalRoute, /patientPortalRouter\.get\("\/:token\/bill"[\s\S]*?buildBillHtml\(\{[\s\S]*?\}, \{ sharedLinkView: true \}\)/);
});

test("desktop bill PDF downloads the exact styled receipt through native A4 printing", async () => {
  const source = fs.readFileSync(path.join(__dirname, "../frontend/scripts/common.js"), "utf8");
  const definition = source.match(/async function downloadBillPdf\(visitId, billNo = ""\) \{[\s\S]*?\n\}(?=\s*async function shareAndDownloadReport)/)?.[0];
  assert.ok(definition);
  const billHtml = buildBillHtml(sampleBill(1));
  const calls = [];
  const scope = vm.createContext({
    API: { request: async (route) => { calls.push(["request", route]); return billHtml; } },
    window: { labLmsDesktop: { saveBillPdf: async (...args) => { calls.push(["save", ...args]); return { canceled: false }; } } },
  });
  vm.runInContext(definition, scope);
  await scope.downloadBillPdf(17, "BILL-17");
  assert.deepEqual(calls, [
    ["request", "/api/visits/17/bill?format=html"],
    ["save", billHtml, "Bill_BILL-17.pdf"],
  ]);

  const preload = fs.readFileSync(path.join(__dirname, "../desktop/preload.js"), "utf8");
  assert.match(preload, /saveBillPdf: \(html, fileName\) => ipcRenderer\.invoke\("lab-lms:save-report-pdf", \{ html, fileName, kind: "bill" \}\)/);
  const desktopPrinter = fs.readFileSync(path.join(__dirname, "../desktop/reportPdf.js"), "utf8");
  assert.match(desktopPrinter, /payload\.kind === "bill" \? "Save laboratory bill PDF"/);
});

test("browser bill PDF fallback keeps the receipt styles and removes screen-only spacing", () => {
  const source = fs.readFileSync(path.join(__dirname, "../frontend/scripts/common.js"), "utf8");
  const definition = source.match(/async function downloadBillPdf\(visitId, billNo = ""\) \{[\s\S]*?\n\}(?=\s*async function shareAndDownloadReport)/)?.[0];
  assert.ok(definition);
  assert.match(definition, /documentFrame\.head\.querySelectorAll\("style"\)/);
  assert.match(definition, /billContent\.insertBefore\(style\.cloneNode\(true\), billContent\.firstChild\)/);
  assert.match(definition, /billContent\.insertBefore\(pdfLayoutStyle, billContent\.querySelector\("\.bill-slip, \.receipt"\)\)/);
  assert.match(definition, /html2pdf\(\)[\s\S]*?\.from\(billContent\)[\s\S]*?\.save\(\)/);
});
