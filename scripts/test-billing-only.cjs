const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { isBillingOnlyTest, isPathologyTest } = require('../frontend/scripts/reportEligibility');
const { getFallbackReportParameters } = require('../src/services/reportSchemaService');
const { buildReportHtml } = require('../src/utils/reportFormatter');
const { buildBillHtml } = require('../src/utils/billFormatter');
const { inspectReport, sampleReport } = require('./audit-report-content.cjs');

const imagingNames = ['Digital XRay Chest PA', 'X-ray Chest', 'X RAY Spine', 'MRI Brain',
  'MRIWholeSpine', 'Brain MRI', 'CT Scan Brain', 'CTScanWholeAbdomen', 'CTSCANBRAINWITHCONTRAST',
  'CTPNS WITHCONTRAST', 'CT chest', 'USG Whole Abdomen', 'USGWholeAbdomen',
  'Abdomen USG', 'Ultrasound Pelvis', 'Ultrasonography', 'Computed Tomography Brain', 'Magnetic Resonance Imaging'];
const labNames = ['CT(Clotting Time)', 'Clotting Time', 'CT', 'ACTH', 'HCT / PCV',
  'Procalcitonin (PCT)', 'Radioallergosorbent (RAST) Test', 'Abnormal Cells',
  'FT4 & TSH', 'USG Guided FNAC', 'USGGuidedBiopsy', 'CT-guided Biopsy', 'Histopathology'];

test('billing-only classification handles imported imaging names without confusing laboratory tests', () => {
  for (const name of imagingNames) {
    assert.equal(isBillingOnlyTest({ name, category: 'Imported legacy catalogue' }), true, name);
    assert.equal(isPathologyTest(name, 'Imported legacy catalogue'), false, name);
  }
  for (const name of labNames) assert.equal(isBillingOnlyTest({ name }), false, name);
  assert.equal(isPathologyTest('CT(Clotting Time)'), true);
  for (const category of ['Radiology', 'CT Scan', 'CT', 'X-Ray', 'MRI', 'USG']) {
    assert.equal(isBillingOnlyTest({ name: 'Chest study', category }), true);
  }
  assert.equal(isBillingOnlyTest({ name: 'Outside test', custom_test_name: 'CTScanBrain' }), true);
});

test('browser and server use the same billing policy and relevant pages load it first', () => {
  const scope = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../frontend/scripts/reportEligibility.js'), 'utf8'), scope);
  for (const name of [...imagingNames, ...labNames]) {
    assert.equal(scope.ReportEligibility.isBillingOnlyTest({ name }), isBillingOnlyTest({ name }));
  }
  for (const page of ['admin', 'test-catalog', 'reception', 'technician']) {
    const html = fs.readFileSync(path.join(__dirname, `../frontend/${page}.html`), 'utf8');
    assert.ok(html.indexOf('scripts/reportEligibility.js') >= 0);
    assert.ok(html.indexOf('scripts/reportEligibility.js') < html.indexOf('scripts/common.js'));
  }
});

test('new imaging services need no result schema; pathology schemas remain available', () => {
  for (const name of imagingNames) assert.deepEqual(getFallbackReportParameters({ name }), []);
  assert.equal(getFallbackReportParameters({ name: 'Abnormal Cells' }).length, 4);
  assert.ok(getFallbackReportParameters({ name: 'CT(Clotting Time)' }).length);
});

test('formatter rejects imaging-only reports and excludes imaging pages from mixed reports', () => {
  const imaging = imagingNames.map(name => ({ name, parameters: [{ parameter_name: 'Findings', value: 'OLD-IMAGING-TEXT' }] }));
  for (const entry of imaging) assert.throws(() => buildReportHtml(sampleReport(entry)), { statusCode: 400 });
  const lab = { name: 'Abnormal Cells', parameters: [{ parameter_name: 'Abnormal Cells', value: 'LAB-OBSERVATION' }] };
  const data = { ...sampleReport(lab), tests: [imaging[0], lab, imaging[3]] };
  const original = JSON.stringify(data);
  assert.equal(buildReportHtml(data), buildReportHtml(sampleReport(lab)));
  assert.equal(JSON.stringify(data), original, 'Historical data must not be mutated');
  assert.match(buildReportHtml(data), /LAB-OBSERVATION/);
  assert.doesNotMatch(buildReportHtml(data), /OLD-IMAGING-TEXT/);
  assert.throws(() => buildReportHtml({ ...data, tests: [] }), /No laboratory tests/);
});

test('imaging services remain on bills with their original prices', () => {
  const tests = ['X-ray Chest', 'MRI Brain', 'CT Scan Brain', 'USG Abdomen']
    .map((name, index) => ({ name, price: (index + 1) * 100, is_outside: 0 }));
  const data = { ...sampleReport(tests[0]), tests };
  data.visit = { ...data.visit, total_amount: 1000, amount_paid: 1000, amount_due: 0 };
  const original = JSON.stringify(data);
  const html = buildBillHtml(data);
  for (const entry of tests) {
    assert.ok(html.includes(entry.name));
    assert.ok(html.includes(entry.price.toFixed(2)));
  }
  assert.equal(JSON.stringify(data), original);
});

test('billing-only formats are excluded from missing-body review, not marked repaired', () => {
  for (const name of imagingNames) {
    const result = inspectReport({ name, parameters: [] });
    assert.equal(result.billingOnly, true);
    assert.equal(result.placeholderOnly, false);
    assert.equal(result.reviewCategory, 'billing-only-no-report-required');
    assert.deepEqual(result.contentKeys, []);
  }
  assert.equal(inspectReport({ name: 'Unconfigured laboratory test', parameters: [] }).placeholderOnly, true);
});

test('catalogue builder hides report controls without losing stored fields or scheduling a preview', () => {
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, { value: '', hidden: false, style: {}, srcdoc: '', addEventListener() {} });
    return elements.get(id);
  };
  const scope = vm.createContext({
    ReportEligibility: { isBillingOnlyTest, isPathologyTest },
    protectPage: () => ({ role: 'admin' }), hasPermission: () => true,
    document: { getElementById: element },
    setTimeout: () => { scope.scheduled += 1; return 1; }, clearTimeout() {}, scheduled: 0,
  });
  const source = fs.readFileSync(path.join(__dirname, '../frontend/scripts/testCatalog.js'), 'utf8').replace(/init\(\);\s*$/, '');
  vm.runInContext(source, scope);
  vm.runInContext("readParameters = () => [{ parameterName: 'Existing field', normalRange: 'Stored reference' }];", scope);
  element('testName').value = 'CTScanBrain';
  element('testReportBody').value = 'Stored legacy note';
  vm.runInContext('renderReportPreview()', scope);
  assert.equal(scope.scheduled, 0);
  for (const id of ['reportParameterSection', 'reportBodySection', 'reportPreviewPanel', 'previewTestBtn']) assert.equal(element(id).hidden, true);
  assert.equal(element('billingOnlyNotice').hidden, false);
  assert.equal(element('testPrice').hidden, false);
  assert.equal(element('saveTestBtn').hidden, false);
  assert.equal(element('testReportBody').value, 'Stored legacy note');
  assert.equal(vm.runInContext('readParameters()[0].normalRange', scope), 'Stored reference');
  element('testName').value = 'Abnormal Cells';
  vm.runInContext('renderReportPreview()', scope);
  assert.equal(scope.scheduled, 1);
  assert.equal(element('reportParameterSection').hidden, false);
  assert.equal(element('reportPreviewPanel').hidden, false);
});

test('route guards reject imaging previews and result entry while catalogue billing entries stay available', async () => {
  // All route-handler checks use a separate in-memory database, never the live lab.
  const connection = require('../src/db/connection');
  await connection.switchDatabasePath(':memory:');
  const { run, all } = require('../src/db/helpers');
  try {
    await run(`CREATE TABLE tests (id INTEGER PRIMARY KEY, name TEXT, code TEXT, category TEXT,
      sample_type TEXT, turnaround_hours INTEGER, report_body TEXT, price REAL, active INTEGER DEFAULT 1)`);
    await run(`CREATE TABLE test_parameters (id INTEGER PRIMARY KEY, test_id INTEGER, parameter_name TEXT,
      unit TEXT, normal_range TEXT, entry_mode TEXT, calculation_formula TEXT, calculation_precision INTEGER, display_order INTEGER)`);
    await run('CREATE TABLE test_bundle_items (bundle_test_id INTEGER, component_test_id INTEGER, display_order INTEGER)');
    await run(`CREATE TABLE visit_tests (id INTEGER PRIMARY KEY, visit_id INTEGER, test_id INTEGER,
      custom_test_name TEXT, custom_test_price REAL, external_lab_name TEXT)`);
    await run(`INSERT INTO tests (id,name,category,price,report_body) VALUES (1,'CTScanBrain','Imported legacy catalogue',500,'Original note')`);
    await run(`INSERT INTO test_parameters (id,test_id,parameter_name) VALUES (1,1,'Existing findings')`);
    await run('INSERT INTO visit_tests (id,visit_id,test_id) VALUES (1,1,1)');
    const { testRouter } = require('../src/routes/testRoutes');
    const { patientPortalRouter } = require('../src/routes/patientPortalRoutes');
    const { visitRouter } = require('../src/routes/visitRoutes');
    async function invoke(router, routePath, method, req) {
      const route = router.stack.find(layer => layer.route?.path === routePath && layer.route.methods[method]).route;
      const response = { statusCode: 200, status(code) { this.statusCode = code; return this; },
        json(body) { this.body = body; return this; }, send(body) { this.body = body; return this; } };
      await route.stack.at(-1).handle(req, response, error => { throw error; });
      return response;
    }
    const before = JSON.stringify(await all('SELECT * FROM tests'));
    for (const [router, routePath, method, req] of [
      [testRouter, '/builder-report-preview', 'post', { body: { name: 'CTScanBrain' } }],
      [testRouter, '/:id/sample-report', 'get', { params: { id: 1 } }],
      [patientPortalRouter, '/sample/test/:testId/report', 'get', { params: { testId: 1 } }],
      [visitRouter, '/:id/results', 'post', { params: { id: 1 }, body: { visitTestId: 1, parameters: [] } }],
    ]) {
      const response = await invoke(router, routePath, method, req);
      assert.equal(response.statusCode, 400, routePath);
      assert.match(JSON.stringify(response.body), /Billing only/);
    }
    const catalogue = await invoke(testRouter, '/', 'get', { query: {} });
    assert.equal(catalogue.body.tests.length, 1);
    assert.equal(catalogue.body.tests[0].billing_only, true);
    assert.equal(catalogue.body.tests[0].price, 500);
    assert.equal(catalogue.body.tests[0].parameters[0].parameter_name, 'Existing findings');
    assert.equal(JSON.stringify(await all('SELECT * FROM tests')), before);
  } finally { await connection.closeDatabase(); }
});
