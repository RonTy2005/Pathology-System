const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { buildBillHtml } = require("../src/utils/billFormatter");
const { sampleBill } = require("./bill-layout-fixture.cjs");

test("one- and two-service bills remain in the upper half of A4 with compact readable typography", () => {
  const html = buildBillHtml(sampleBill(2));
  assert.match(html, /<h1>LabShield Diagnostic Centre<\/h1>/);
  assert.doesNotMatch(html, /Diagnostic Laboratory/, "business category is not printed below the name");
  assert.match(html, /@page \{ size: A4 portrait; margin: 0 !important; \}/);
  assert.match(html, /\.bill-slip \{ width: 210mm; height: 148\.5mm; padding: 5mm 8mm 4mm;/);
  assert.match(html, /body \{[^}]*font-size: 14px; line-height: 1\.35;/);
  assert.match(html, /\.items-table th \{[^}]*font-size: 12px;/);
  assert.match(html, /\.items-table td \{[^}]*min-height: 8mm;[^}]*font-size: 13px;/);
  assert.match(html, /\.details-column p \{[^}]*font-size: 12\.5px;/);
  assert.match(html, /\.totals-table \{[^}]*font-size: 12px;/);
  assert.match(html, /<p class="business-address">123 Laboratory Road, City Centre, Kolkata, West Bengal<\/p>/);
  assert.match(html, /\.brand-block \.business-address \{[^}]*font-weight: 700;/);
  assert.match(html, /Please collect the report only from the lab at the scheduled time \(Business hours: 9:00 AM to 6:30 PM\)\./);
  assert.match(html, /\.receipt-notes \.collection-note \{[^}]*font-size: 11\.5px; font-weight: 700;/);
  assert.match(html, /\.portal-qr img \{[^}]*width: 24mm; height: 24mm;/);
  assert.equal((html.match(/class="bill-slip/g) || []).length, 1);
  assert.equal((html.match(/<tbody>/g) || []).length, 2, "items and totals tables remain present");
});

test("longer bills use the full A4 page instead of shrinking print text", () => {
  const html = buildBillHtml(sampleBill(6));
  assert.equal((html.match(/class="bill-slip/g) || []).length, 1);
  assert.match(html, /class="bill-slip bill-slip-full bill-slip-last"/);
  assert.match(html, /\.bill-slip-full \{ height: 297mm;/);
  assert.equal((html.match(/Please collect the report only from the lab/g) || []).length, 1);
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
  fixture.patientPortalStatusUrl = "https://reports.example.test/report-status.html?token=patient-token";
  fixture.paymentComplete = true;
  fixture.reportAvailable = true;
  const shared = buildBillHtml(fixture, { sharedLinkView: true });
  const normal = buildBillHtml(fixture);
  assert.match(shared, /<body class="shared-link-bill">/);
  assert.match(shared, /class="bill-slip bill-slip-full bill-slip-last"/);
  assert.match(shared, /@media screen \{[\s\S]*?\.shared-link-bill \.items-table td\.service strong \{ font-size: 11px; font-weight: 600;/);
  assert.match(shared, /\.shared-link-bill \.bill-slip \{ display: flex; flex-direction: column; \}/);
  assert.match(shared, /\.shared-link-bill \.slip-footer \{ margin-top: auto; \}/);
  assert.match(shared, /class="patient-portal-actions"/);
  assert.match(shared, /View report status/);
  assert.match(shared, /View available reports/);
  assert.match(shared, /https:\/\/reports\.example\.test\/report-status\.html\?token=patient-token/);
  assert.match(shared, /@media print \{[\s\S]*?\.patient-portal-actions \{ display: none !important; \}/);
  assert.match(shared, /\.items-table td\.service strong \{ font-size: 13px; \}/);
  assert.match(normal, /<body>\s*<main class="bill-slip/);
  assert.doesNotMatch(normal, /<body class="shared-link-bill">/);

  const portalRoute = fs.readFileSync(path.join(__dirname, "../src/routes/patientPortalRoutes.js"), "utf8");
  assert.match(portalRoute, /patientPortalRouter\.get\("\/:token\/bill"[\s\S]*?buildBillHtml\(\{[\s\S]*?\}, \{ sharedLinkView: true \}\)/);
  assert.match(portalRoute, /patientPortalStatusUrl: getPatientPortalUrl\(/);
  assert.match(portalRoute, /reportAvailable: reportAccess\.available/);
});

test("digital bills keep report access unavailable until payment and verification are complete", () => {
  const fixture = sampleBill(1);
  fixture.patientPortalStatusUrl = "https://reports.example.test/report-status.html?token=patient-token";
  const html = buildBillHtml(fixture, { sharedLinkView: true });

  assert.match(html, /View report status/);
  assert.match(html, /Reports will be available here after the bill is paid in full\./);
  assert.doesNotMatch(html, /View available reports/);
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
  assert.match(desktopPrinter, /RASTERIZE_EMBEDDED_SVG_IMAGES_SCRIPT/);
  assert.match(desktopPrinter, /canvas\.width = Math\.max\(1, Math\.ceil\(bounds\.width \* 6\)\)/);
});

test("WhatsApp bill PDF sharing saves the bill before opening the patient's WhatsApp chat", async () => {
  const source = fs.readFileSync(path.join(__dirname, "../frontend/scripts/common.js"), "utf8");
  const definition = source.match(/async function shareBillPdfViaWhatsApp\(visitId, billNo = ""\) \{[\s\S]*?\n\}(?=\s*async function downloadBillPdf)/)?.[0];
  assert.ok(definition);
  const calls = [];
  const popup = { focus: () => calls.push(["focus"]), close: () => calls.push(["close"]) };
  const scope = vm.createContext({
    API: { request: async (route) => {
      calls.push(["request", route]);
      return { billNo: "BILL-17", patientName: "Maya", patientPhone: "9876543210", billUrl: "https://lab.example/bill" };
    } },
    window: { open: (url) => { calls.push(["open", url]); return popup; } },
    downloadBillPdf: async (...args) => { calls.push(["pdf", ...args]); return { canceled: false }; },
    alert: (message) => calls.push(["alert", message]),
    encodeURIComponent,
  });
  vm.runInContext(definition, scope);
  await scope.shareBillPdfViaWhatsApp(17, "BILL-17");
  assert.deepEqual(calls.slice(0, 2), [
    ["request", "/api/visits/17/bill-share"],
    ["pdf", 17, "BILL-17"],
  ]);
  const whatsappUrl = calls.find(([type]) => type === "open")?.[1];
  assert.match(whatsappUrl, /^https:\/\/wa\.me\/919876543210\?text=/);
  const message = decodeURIComponent(whatsappUrl.split("?text=")[1]);
  assert.match(message, /You can view or download your bill securely here:/);
  assert.match(message, /Thank you\./);
  assert.doesNotMatch(message, /saved to this computer|Attach it/i);
});

test("browser bill PDF fallback keeps the receipt styles and removes screen-only spacing", () => {
  const source = fs.readFileSync(path.join(__dirname, "../frontend/scripts/common.js"), "utf8");
  const definition = source.match(/async function downloadBillPdf\(visitId, billNo = ""\) \{[\s\S]*?\n\}(?=\s*async function shareAndDownloadReport)/)?.[0];
  assert.ok(definition);
  assert.match(definition, /documentFrame\.head\.querySelectorAll\("style"\)/);
  assert.match(definition, /billContent\.insertBefore\(style\.cloneNode\(true\), billContent\.firstChild\)/);
  assert.match(definition, /billContent\.insertBefore\(pdfLayoutStyle, billContent\.querySelector\("\.bill-slip, \.receipt"\)\)/);
  assert.match(definition, /image\.src\.startsWith\("data:image\/svg\+xml"\)/);
  assert.match(definition, /canvas\.toDataURL\("image\/png"\)/);
  assert.match(definition, /html2pdf\(\)[\s\S]*?\.from\(billContent\)[\s\S]*?\.save\(\)/);
});
