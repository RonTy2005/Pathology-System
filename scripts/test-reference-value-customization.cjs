const assert = require("node:assert/strict");
const { test } = require("node:test");
const { buildReportHtml } = require("../src/utils/reportFormatter");

function reportFor(parameter) {
  return buildReportHtml({
    patient: { id: "P-1", name: "Sample Patient", age: "30", gender: "Male" },
    visit: { bill_no: "REG-1", created_at: new Date().toISOString() },
    report: { report_no: "R-1", finalized_at: new Date().toISOString() },
    businessName: "Sample Lab",
    tests: [{ name: "Custom Chemistry Test", sample_type: "Serum", parameters: [parameter] }],
  });
}

test("a manually customised reference value suppresses automatic result status styling", () => {
  const html = reportFor({
    parameter_name: "Analyte",
    value: "20",
    unit: "mg/dL",
    normal_range: "1 - 10",
    reference_value_customized: 1,
  });

  assert.doesNotMatch(html, /<span class="high-val">20<\/span>/);
  assert.doesNotMatch(html, />High<\/span>/);
  assert.match(html, /<td style="font-weight: normal">20<\/td>/);
});

test("the normal automatic range behavior remains for unchanged reference values", () => {
  const html = reportFor({
    parameter_name: "Analyte",
    value: "20",
    unit: "mg/dL",
    normal_range: "1 - 10",
    reference_value_customized: 0,
  });

  assert.match(html, /<span class="high-val">20<\/span>/);
  assert.match(html, />High<\/span>/);
});
