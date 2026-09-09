// Read-only catalogue audit. Uses synthetic metadata, never patient records.
const fs = require('node:fs/promises');
const path = require('node:path');
const sqlite3 = require('sqlite3');
const { buildReportHtml } = require('../src/utils/reportFormatter');
const { isBillingOnlyTest } = require('../frontend/scripts/reportEligibility');

function sampleReport(test) {
  return {
    patient: { id: 'SAMPLE', name: 'SAMPLE PATIENT', age: 35, gender: 'Male' },
    visit: { bill_no: 'CONTENT-AUDIT', created_at: '2026-09-09T00:00:00Z' },
    report: { finalized_at: '2026-09-09T00:00:00Z' },
    tests: [test], isPreview: true, embeddedPreview: true,
  };
}

function inspectReport(test, { billingOnly = isBillingOnlyTest(test) } = {}) {
  if (billingOnly) return {
    id: test.id, name: test.name, code: test.code, specimen: test.sample_type || '',
    billingOnly: true, reviewCategory: 'billing-only-no-report-required',
    parameterCount: (test.parameters || []).length,
    placeholderOnly: false, hasNotes: false, hasCustomNotes: Boolean(String(test.report_body || '').trim()),
    numericalReferenceCount: 0, referenceCount: 0, contentKeys: [],
  };
  const html = buildReportHtml(sampleReport(test));
  const body = html.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
  const resultTables = body.match(/<table\b[^>]*class="[^"]*\bresults-table\b[^"]*"[^>]*>[\s\S]*?<\/table>/gi) || [];
  const withoutResults = resultTables.reduce((text, table) => text.replace(table, ''), body);
  const hasNotes = /class="[^"]*(?:\b[\w-]*notes?\b|\b[\w-]*interpretation[\w-]*\b|\bcustom-report-body\b)/i.test(withoutResults);
  const parameters = test.parameters || [];
  const placeholderOnly = parameters.length === 0 || parameters.every(p =>
    /^(result|result\s*\/\s*findings|comments)$/i.test(p.parameter_name.trim())
    && !String(p.unit || '').trim() && !String(p.normal_range || '').trim());
  const numericalReferenceCount = parameters.filter(p => /\d/.test(p.normal_range || '')).length;
  const narrativeTest = /(histopath|histology|biopsy|cytology|fnac|smear|stain|culture|scan|ultrasound|usg|xray|mri|doppler|holter|echo|uroflow)/i.test(test.name.replace(/[^a-z]/gi, ''));
  return {
    id: test.id, name: test.name, code: test.code, specimen: test.sample_type || '',
    billingOnly: false, parameterCount: parameters.length, placeholderOnly, hasNotes,
    hasCustomNotes: Boolean(String(test.report_body || '').trim()),
    numericalReferenceCount,
    reviewCategory: placeholderOnly ? 'placeholder-schema' : !hasNotes ? (narrativeTest ? 'narrative-or-qualitative-review' : 'missing-explanatory-section') : 'existing-content-review',
    referenceCount: parameters.filter(p => String(p.normal_range || '').trim()).length,
    contentKeys: [...body.matchAll(/data-report-content="([^"]+)"/g)].map(match => match[1]),
  };
}

async function audit(databasePath) {
  const db = new sqlite3.Database(databasePath, sqlite3.OPEN_READONLY);
  const query = (sql) => new Promise((resolve, reject) => db.all(sql, (err, rows) => err ? reject(err) : resolve(rows)));
  try {
    const tests = await query('SELECT id,name,code,sample_type,category,report_body FROM tests WHERE active=1 ORDER BY id');
    const parameters = await query('SELECT test_id,parameter_name,unit,normal_range,entry_mode,calculation_formula,calculation_precision FROM test_parameters ORDER BY display_order,id');
    const bundles = await query('SELECT bundle_test_id,component_test_id FROM test_bundle_items ORDER BY display_order');
    const byId = new Map(tests.map(test => [test.id, { ...test, parameters: parameters.filter(p => p.test_id === test.id) }]));
    const rows = tests.map(test => {
      const entry = byId.get(test.id);
      const components = bundles.filter(b => b.bundle_test_id === test.id).map(b => byId.get(b.component_test_id)).filter(Boolean);
      // Bundle schemas are supplied by components, not the parent's optional fields.
      if (components.length) {
        const reportComponents = components.filter(c => !isBillingOnlyTest(c));
        if (!reportComponents.length) return { ...inspectReport(entry, { billingOnly: true }), componentCount: components.length };
        entry.parameters = reportComponents.flatMap(c => c.parameters);
      }
      return { ...inspectReport(entry), componentCount: components.length };
    });
    return {
      summary: {
        activeTests: rows.length,
        billingOnly: rows.filter(r => r.billingOnly).length,
        reportableTests: rows.filter(r => !r.billingOnly).length,
        placeholderOnly: rows.filter(r => r.placeholderOnly).length,
        withoutExplanatorySections: rows.filter(r => !r.billingOnly && !r.hasNotes).length,
        withoutConfiguredReferences: rows.filter(r => !r.billingOnly && !r.referenceCount).length,
        supplementedReports: rows.filter(r => r.contentKeys.length).length,
        reviewCategories: Object.fromEntries([...new Set(rows.map(r => r.reviewCategory))].map(key => [key, rows.filter(r => r.reviewCategory === key).length])),
      },
      caveat: 'X-ray, MRI, CT and USG entries are billing-only and excluded from missing-content counts. Missing reference ranges are review candidates, not necessarily errors: narrative, culture and method-dependent tests may not use numerical intervals. Notes detection checks rendered markup, not clinical completeness.',
      tests: rows,
    };
  } finally {
    await new Promise((resolve, reject) => db.close(err => err ? reject(err) : resolve()));
  }
}

if (require.main === module) {
  const args = process.argv.slice(2);
  audit(path.resolve(args.find(arg => !arg.startsWith('--')) || 'lab-lms.db')).then(async result => {
    const output = args.find(arg => arg.startsWith('--output='))?.slice(9);
    if (output) {
      await fs.mkdir(path.dirname(path.resolve(output)), { recursive: true });
      await fs.writeFile(output, JSON.stringify(result, null, 2) + '\n');
    }
    console.log(JSON.stringify(result.summary, null, 2));
    if (args.includes('--missing')) console.log(result.tests.filter(r => !r.billingOnly && !r.hasNotes && !r.placeholderOnly).map(r => `${r.id} | ${r.name} | ${r.specimen}`).join('\n'));
  }).catch(error => { console.error(error); process.exitCode = 1; });
}

module.exports = { audit, inspectReport, sampleReport };
