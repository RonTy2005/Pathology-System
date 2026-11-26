const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

test('doctor, test and patient suggestion lists support arrow-key navigation and Enter selection', () => {
  const common = fs.readFileSync(path.resolve(__dirname, '../frontend/scripts/common.js'), 'utf8');
  const reception = fs.readFileSync(path.resolve(__dirname, '../frontend/scripts/reception.js'), 'utf8');

  assert.match(common, /function bindAutocompleteKeyboardNavigation\(input, container, options = \{\}\)/);
  assert.match(common, /event\.key === "ArrowDown" \|\| event\.key === "ArrowUp"/);
  assert.match(common, /event\.key === "Enter" && activeIndex >= 0/);
  assert.match(common, /selected\.click\(\)/);
  assert.match(reception, /bindAutocompleteKeyboardNavigation\(doctorSearch, doctorResults\)/);
  assert.match(reception, /bindAutocompleteKeyboardNavigation\(testSearch, testResults\)/);
  assert.match(reception, /bindAutocompleteKeyboardNavigation\(editTestSearch, editTestResults\)/);
  assert.match(reception, /bindAutocompleteKeyboardNavigation\(editDoctorSearch, editDoctorResults\)/);
  assert.match(reception, /bindAutocompleteKeyboardNavigation\(patientNameInput, patientNameResults\)/);
  assert.match(reception, /if \(event\.defaultPrevented\) return;\s*if \(event\.key !== "Enter"\) return;/);
});

test('automatically calculated result fields remain editable and preserve a technician override', () => {
  const common = fs.readFileSync(path.resolve(__dirname, '../frontend/scripts/common.js'), 'utf8');
  const reception = fs.readFileSync(path.resolve(__dirname, '../frontend/scripts/reception.js'), 'utf8');
  const technician = fs.readFileSync(path.resolve(__dirname, '../frontend/scripts/technician.js'), 'utf8');

  assert.doesNotMatch(common, /input\.readOnly\s*=\s*true;\s*\n\s*input\.classList\.add\("auto-calculated-input"\)/);
  assert.match(common, /row\.dataset\.manualOverride\s*=\s*"true"/);
  assert.match(common, /if \(row\.dataset\.manualOverride === "true"\) return;/);
  assert.match(reception, /manualOverride: row\.dataset\.manualOverride === "true"/);
  assert.match(technician, /manualOverride: row\.dataset\.manualOverride === "true"/);
});
