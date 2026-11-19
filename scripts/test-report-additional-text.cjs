const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const { buildReportHtml } = require('../src/utils/reportFormatter');
const { sampleReport } = require('./audit-report-content.cjs');
const { ROLES, PERMISSIONS } = require('../src/config/constants');

test('additional text appears below results, before template notes, escaped and only on its own test', () => {
  for (const entry of [
    { name: 'Total Protein', parameters: [{ parameter_name: 'Total Protein, Serum', value: '7.2' }] },
    { name: 'Custom Laboratory Test', report_body: 'Existing catalogue description', parameters: [{ parameter_name: 'Result', value: '12' }] },
    { name: 'FT4 & TSH', parameters: [{ parameter_name: 'FT4, Serum', value: '1.1' }, { parameter_name: 'TSH, Serum', value: '2' }] },
    { name: 'Liver Biopsy', parameters: [{ parameter_name: 'Diagnosis', value: 'Laboratory diagnosis' }] },
  ]) {
    const without = buildReportHtml(sampleReport(entry));
    const withText = buildReportHtml(sampleReport({ ...entry, additional_report_text: 'Doctor advice <script>alert(1)</script>\nRepeat as advised' }));
    const section = /<section class="additional-report-text" data-additional-report-text>[\s\S]*?<\/section>/;
    assert.match(withText, section);
    assert.match(withText, /Doctor advice &lt;script&gt;alert\(1\)&lt;\/script&gt;\nRepeat as advised/);
    assert.equal(withText.replace(section, ''), without, 'the existing report template remains identical');
    const advicePosition = withText.indexOf('<section class="additional-report-text"');
    if (entry.name !== 'Liver Biopsy') assert.ok(withText.lastIndexOf('</table>', advicePosition) >= 0);
    assert.ok(advicePosition < withText.indexOf('<div class="report-footer">'));
    if (entry.name === 'Total Protein') assert.ok(advicePosition < withText.indexOf('<div class="single-analyte-notes'));
    if (entry.report_body) assert.ok(advicePosition < withText.indexOf('Existing catalogue description'));
    if (entry.name === 'Liver Biopsy') assert.ok(advicePosition < withText.indexOf('<div class="report-template-notes liver-biopsy-notes'));
  }
  const first = { name: 'Total Protein', parameters: [], additional_report_text: 'Advice for protein only' };
  const second = { name: 'Urine Acetone', parameters: [], additional_report_text: 'Advice for urine only' };
  const html = buildReportHtml({ ...sampleReport(first), tests: [first, second] });
  assert.equal((html.match(/Advice for protein only/g) || []).length, 1);
  assert.equal((html.match(/Advice for urine only/g) || []).length, 1);
  assert.ok(html.indexOf('Advice for protein only') < html.indexOf('URINE ACETONE'));
  const blank = buildReportHtml(sampleReport({ ...first, additional_report_text: '  \n ' }));
  assert.doesNotMatch(blank, /<section class="additional-report-text"/);
});

test('the per-test plus editor provides both note and additional-test-row entry choices', () => {
  const source = fs.readFileSync(require.resolve('../frontend/scripts/common.js'), 'utf8');
  assert.match(source, /function renderResultAdditionalText/);
  assert.match(source, /Text box/);
  assert.match(source, /Test addition/);
  assert.match(source, /Investigation/);
  assert.match(source, /Reference Value/);
  assert.match(source, /data-additional-test-row-add/);
  assert.match(source, /function getAdditionalReportRowsFromForm/);
  assert.match(source, /function savePendingResultAdditionalText/);
});

test('result API saves, reloads, finalizes and clears per-test advice without changing other tests', async () => {
  const connection = require('../src/db/connection');
  await connection.switchDatabasePath(':memory:');
  const { run, get } = require('../src/db/helpers');
  try {
    await run('CREATE TABLE users (id INTEGER PRIMARY KEY, full_name TEXT)');
    await run('CREATE TABLE patients (id INTEGER PRIMARY KEY, patient_code TEXT, name TEXT, age INTEGER, gender TEXT, phone TEXT)');
    await run('CREATE TABLE doctors (id INTEGER PRIMARY KEY, name TEXT, commission_percent REAL)');
    await run('CREATE TABLE associates (id INTEGER PRIMARY KEY, name TEXT, associate_code TEXT)');
    await run('CREATE TABLE visits (id INTEGER PRIMARY KEY, patient_id INTEGER, doctor_id INTEGER, associate_id INTEGER, bill_no TEXT, status TEXT, created_at TEXT)');
    await run('CREATE TABLE tests (id INTEGER PRIMARY KEY, name TEXT, category TEXT, code TEXT, sample_type TEXT, turnaround_hours INTEGER, report_body TEXT, price REAL, active INTEGER DEFAULT 1)');
    await run("CREATE TABLE visit_tests (id INTEGER PRIMARY KEY, visit_id INTEGER, test_id INTEGER, assigned_to INTEGER, status TEXT, result_entered_at TEXT, finalized_at TEXT, custom_test_name TEXT, custom_test_price REAL, external_lab_name TEXT, is_outside INTEGER, additional_report_text TEXT NOT NULL DEFAULT '', additional_report_rows_json TEXT NOT NULL DEFAULT '[]')");
    await run('CREATE TABLE test_parameters (id INTEGER PRIMARY KEY, test_id INTEGER, parameter_name TEXT, unit TEXT, normal_range TEXT, reference_value_customized INTEGER NOT NULL DEFAULT 0, entry_mode TEXT, calculation_formula TEXT, calculation_precision INTEGER, display_order INTEGER)');
    await run('CREATE TABLE results (id INTEGER PRIMARY KEY, visit_test_id INTEGER, parameter_name TEXT, value TEXT, unit TEXT, normal_range TEXT, reference_value_customized INTEGER NOT NULL DEFAULT 0, entry_mode TEXT, entered_by INTEGER, entered_at TEXT)');
    await run('CREATE TABLE reports (id INTEGER PRIMARY KEY, visit_id INTEGER, report_no TEXT, generated_by INTEGER, finalized INTEGER, finalized_at TEXT)');
    await run('CREATE TABLE test_bundle_items (bundle_test_id INTEGER, component_test_id INTEGER, display_order INTEGER)');
    await run('CREATE TABLE logs (user_id INTEGER, action TEXT, entity_type TEXT, entity_id TEXT, meta TEXT, created_at TEXT)');
    await run('CREATE TABLE report_user_actions (id INTEGER PRIMARY KEY, report_id INTEGER, user_id INTEGER, edit_count INTEGER, print_count INTEGER, updated_at TEXT)');
    await run("INSERT INTO users VALUES (7, 'Test Technician')");
    await run("INSERT INTO patients VALUES (1, 'SAMPLE', 'Sample Patient', 35, 'Male', '')");
    await run("INSERT INTO visits VALUES (1, 1, NULL, NULL, 'SAMPLE-BILL', 'registered', CURRENT_TIMESTAMP)");
    await run("INSERT INTO tests (id, name, category) VALUES (1, 'Total Protein', 'Biochemistry'), (2, 'Urine Acetone', 'Biochemistry')");
    await run("INSERT INTO visit_tests (id, visit_id, test_id, assigned_to, status) VALUES (1, 1, 1, 7, 'pending'), (2, 1, 2, 7, 'completed')");
    await run("INSERT INTO reports VALUES (1, 1, 'SAMPLE-RPT', 7, 0, NULL)");
    const { visitRouter, getReportBundle } = require('../src/routes/visitRoutes');
    const user = { id: 7, role: ROLES.BLOOD_SAMPLE_TECHNICIAN, permissions: [PERMISSIONS.ENTER_RESULTS, PERMISSIONS.FINALIZE_REPORTS], access_controls: ['multiple_report_edit'] };
    function request(method, path, body = {}, requestUser = user) {
      const route = visitRouter.stack.find(layer => layer.route?.path === path && layer.route.methods[method]).route;
      return new Promise((resolve, reject) => {
        let index = 0;
        const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(data) { this.body = data; resolve(this); return this; } };
        const req = { user: requestUser, params: { id: '1' }, body, query: {} };
        function next(error) {
          if (error) return reject(error);
          const layer = route.stack[index++];
          if (!layer) return reject(new Error('No response'));
          Promise.resolve(layer.handle(req, res, next)).catch(reject);
        }
        next();
      });
    }
    const additionalRows = [{ investigation: 'Manual smear review', result: 'No abnormal cells', referenceValue: 'Not detected', unit: '' }];
    const payload = { visitTestId: 1, parameters: [{ parameter_name: 'Total Protein, Serum', value: '7.2', unit: 'g/dL' }], additionalReportText: 'Advice <b>literal</b>\nSecond line', additionalReportRows: additionalRows };
    assert.equal((await request('post', '/:id/results', payload)).statusCode, 200);
    assert.equal((await get('SELECT additional_report_text FROM visit_tests WHERE id = 1')).additional_report_text, payload.additionalReportText);
    assert.equal((await get('SELECT additional_report_rows_json FROM visit_tests WHERE id = 1')).additional_report_rows_json, JSON.stringify(additionalRows));
    assert.equal((await get('SELECT additional_report_text FROM visit_tests WHERE id = 2')).additional_report_text, '');
    const reopened = await request('get', '/:id');
    assert.equal(reopened.body.tests.find(entry => entry.id === 1).additional_report_text, payload.additionalReportText);
    assert.deepEqual(JSON.parse(reopened.body.tests.find(entry => entry.id === 1).additional_report_rows_json), additionalRows);
    const bundle = await getReportBundle(1);
    assert.equal(bundle.tests[0].additional_report_text, payload.additionalReportText);
    assert.match(buildReportHtml({ ...bundle, embeddedPreview: true }), /Advice &lt;b&gt;literal&lt;\/b&gt;\nSecond line/);
    assert.match(buildReportHtml({ ...bundle, embeddedPreview: true }), /Manual smear review/);
    assert.match(buildReportHtml({ ...bundle, embeddedPreview: true }), /No abnormal cells/);
    const noNote = { ...payload }; delete noNote.additionalReportText;
    await request('post', '/:id/results', noNote);
    assert.equal((await get('SELECT additional_report_text FROM visit_tests WHERE id = 1')).additional_report_text, payload.additionalReportText, 'older clients preserve the saved text');
    assert.equal((await get('SELECT additional_report_rows_json FROM visit_tests WHERE id = 1')).additional_report_rows_json, JSON.stringify(additionalRows), 'older clients preserve saved additional rows');
    const invalid = await request('post', '/:id/results', { ...payload, additionalReportText: {} });
    assert.equal(invalid.statusCode, 400);
    const invalidRows = await request('post', '/:id/results', { ...payload, additionalReportRows: [{}] });
    assert.equal(invalidRows.statusCode, 200);
    assert.equal((await get('SELECT additional_report_rows_json FROM visit_tests WHERE id = 1')).additional_report_rows_json, '[]');
    await request('post', '/:id/results', payload);
    const denied = await request('post', '/:id/results', payload, { ...user, permissions: [] });
    assert.equal(denied.statusCode, 403);
    const unassigned = await request('post', '/:id/results', payload, { ...user, id: 8 });
    assert.equal(unassigned.statusCode, 403);
    await run("CREATE TRIGGER fail_result_write BEFORE INSERT ON results WHEN NEW.value = 'FAIL' BEGIN SELECT RAISE(ABORT, 'Simulated save failure'); END");
    await assert.rejects(request('post', '/:id/results', { ...payload, parameters: [{ parameter_name: 'Total Protein, Serum', value: 'FAIL' }], additionalReportText: 'Failed advice' }), /Simulated save failure/);
    assert.equal((await get('SELECT value FROM results WHERE visit_test_id = 1')).value, '7.2');
    assert.equal((await get('SELECT additional_report_text FROM visit_tests WHERE id = 1')).additional_report_text, payload.additionalReportText);
    await run('DROP TRIGGER fail_result_write');
    await request('post', '/:id/results', { ...payload, additionalReportText: '' });
    assert.equal((await get('SELECT additional_report_text FROM visit_tests WHERE id = 1')).additional_report_text, '');
    await request('post', '/:id/results', payload);
    assert.equal((await request('post', '/:id/finalize-report')).statusCode, 200);
    assert.equal((await get('SELECT finalized FROM reports WHERE id = 1')).finalized, 1);
    assert.equal((await getReportBundle(1)).tests[0].additional_report_text, payload.additionalReportText);
  } finally {
    await connection.closeDatabase();
  }
});
