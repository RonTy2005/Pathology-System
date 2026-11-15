const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const { buildReportHtml } = require("../src/utils/reportFormatter");
const { isRichReportBody, sanitizeRichReportBody, RICH_REPORT_BODY_PREFIX } = require("../src/utils/richReportBody");
const { sampleReport } = require("./audit-report-content.cjs");

test("catalogue report descriptions retain only the supported rich-text markup", () => {
  const source = `${RICH_REPORT_BODY_PREFIX}<p><strong>Clinical note</strong> &amp; advice</p><table class="editor-table"><tr><th>Item</th><th>Value</th></tr><tr><td>Plan</td><td>Repeat</td></tr></table><script>alert('no')</script><img src=x onerror=alert(1)>`;
  const safe = sanitizeRichReportBody(source);

  assert.equal(isRichReportBody(source), true);
  assert.match(safe, /\[\[LABSHIELD_RICH\]\]<p><strong>Clinical note<\/strong> &amp; advice<\/p>/);
  assert.match(safe, /<table><tr><th>Item<\/th><th>Value<\/th><\/tr><tr><td>Plan<\/td><td>Repeat<\/td><\/tr><\/table>/);
  assert.doesNotMatch(safe, /script|alert|img|class=|onerror/i);
  assert.equal(sanitizeRichReportBody("Legacy plain\ntext"), "Legacy plain\ntext");
});

test("formatted catalogue descriptions render below results while legacy notes remain escaped", () => {
  const rich = `${RICH_REPORT_BODY_PREFIX}<p><strong>Interpretation</strong>: review clinically.</p><table><tbody><tr><th>Finding</th><th>Action</th></tr><tr><td>Raised</td><td>Repeat</td></tr></tbody></table>`;
  const richHtml = buildReportHtml(sampleReport({
    name: "Custom Laboratory Test",
    report_body: rich,
    parameters: [{ parameter_name: "Result", value: "Normal" }],
  }));
  assert.match(richHtml, /<div class="custom-report-body-title">Report Notes<\/div>/);
  assert.match(richHtml, /<strong>Interpretation<\/strong>/);
  assert.match(richHtml, /<table><tbody><tr><th>Finding<\/th>/);
  assert.match(richHtml, /\.custom-report-body th, \.custom-report-body td/);

  const legacyHtml = buildReportHtml(sampleReport({
    name: "Custom Laboratory Test",
    report_body: "Legacy <b>text</b>",
    parameters: [{ parameter_name: "Result", value: "Normal" }],
  }));
  assert.match(legacyHtml, /Legacy &lt;b&gt;text&lt;\/b&gt;/);
});

test("the Test Catalogue provides an editable rich description toolbar", () => {
  const markup = fs.readFileSync(require.resolve("../frontend/admin.html"), "utf8");
  const script = fs.readFileSync(require.resolve("../frontend/scripts/admin.js"), "utf8");
  assert.match(markup, /id="testReportBody"[^>]*contenteditable="true"/);
  assert.match(markup, /data-report-body-command="bold"/);
  assert.match(markup, /id="insertReportBodyTableBtn"/);
  assert.match(markup, /id="testStandardReportDescription"/);
  assert.match(markup, /id="copyStandardReportDescriptionBtn"/);
  assert.match(markup, /id="undoReportBodyBtn"/);
  assert.match(markup, /id="redoReportBodyBtn"/);
  assert.match(markup, /id="restoreDefaultReportBodyBtn"/);
  assert.match(script, /function getReportBodyEditorValue/);
  assert.match(script, /function insertReportBodyTable/);
  assert.match(script, /function renderStandardReportDescription/);
  assert.match(script, /function undoReportBody/);
  assert.match(script, /function redoReportBody/);
  assert.match(script, /function restoreDefaultReportBody/);
  assert.match(script, /reportBody: getReportBodyEditorValue\(\)/);
});
