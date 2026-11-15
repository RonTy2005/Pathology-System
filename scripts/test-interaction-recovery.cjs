const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");

test("browser PDF capture layers cannot block a long-running workspace", () => {
  const common = fs.readFileSync(path.join(__dirname, "../frontend/scripts/common.js"), "utf8");
  assert.match(common, /function clearStaleBrowserPdfLayers\(\)/);
  assert.match(common, /\.html2pdf__overlay, \.html2pdf__container/);
  assert.match(common, /if \(activeBrowserPdfExports > 0\) return;/);
  assert.match(common, /window\.addEventListener\("focus", clearStaleBrowserPdfLayers\)/);
  assert.match(common, /if \(!document\.hidden\) clearStaleBrowserPdfLayers\(\)/);
  assert.match(common, /function recoverInputFocusFromStalePdfLayer\(event\)/);
  assert.match(common, /document\.elementFromPoint\(clientX, clientY\)/);
  assert.match(common, /intendedField\.focus\(\{ preventScroll: true \}\)/);
  assert.match(common, /document\.addEventListener\("pointerdown", recoverInputFocusFromStalePdfLayer, true\)/);
  assert.match(common, /const finishBrowserPdfExport = beginBrowserPdfExport\(\);/);
  assert.match(common, /iframe\.remove\(\);\s*finishBrowserPdfExport\(\);/);
});
