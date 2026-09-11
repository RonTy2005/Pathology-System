const assert = require("node:assert/strict");
const { test } = require("node:test");
const { buildBillHtml } = require("../src/utils/billFormatter");
const { sampleBill } = require("./bill-layout-fixture.cjs");

test("short bills remain in the upper half of A4 with readable print typography", () => {
  const html = buildBillHtml(sampleBill(5));
  assert.match(html, /@page \{ size: A4 portrait; margin: 0 !important; \}/);
  assert.match(html, /\.bill-slip \{ width: 210mm; height: 148\.5mm; padding: 5mm 8mm 4mm;/);
  assert.match(html, /body \{[^}]*font-size: 11\.5px; line-height: 1\.3;/);
  assert.match(html, /\.items-table th \{[^}]*font-size: 10px;/);
  assert.match(html, /\.items-table td \{[^}]*min-height: 7mm;[^}]*font-size: 11\.2px;/);
  assert.match(html, /\.details-column p \{[^}]*font-size: 10\.5px;/);
  assert.match(html, /\.totals-table \{[^}]*font-size: 10px;/);
  assert.equal((html.match(/class="bill-slip/g) || []).length, 1);
  assert.equal((html.match(/<tbody>/g) || []).length, 2, "items and totals tables remain present");
});

test("a sixth service starts a second upper-half bill instead of shrinking the first bill", () => {
  const html = buildBillHtml(sampleBill(6));
  assert.equal((html.match(/class="bill-slip/g) || []).length, 2);
  assert.match(html, /Continued on the next booking slip/);
  assert.match(html, /continued \(page 2 of 2\)/);
});
