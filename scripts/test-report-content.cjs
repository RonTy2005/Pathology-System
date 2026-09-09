const assert = require('node:assert/strict');
const { test } = require('node:test');
const { execFileSync } = require('node:child_process');
const Module = require('node:module');
const path = require('node:path');
const fs = require('node:fs');
const sqlite3 = require('sqlite3');
const { buildReportHtml } = require('../src/utils/reportFormatter');
const { REPORT_CONTENT, getReportContent, buildSupplementaryNotes, supplementReportHtml } = require('../src/services/reportContentService');
const { COMBINATIONS, getCombinationDefinition, repairKnownCombinationSchemas } = require('../src/services/reportCombinationRepair');
const { sampleReport } = require('./audit-report-content.cjs');

test('all content has exact identities and traceable medical sources', () => {
  assert.equal(new Set(REPORT_CONTENT.map(c => c.key)).size, REPORT_CONTENT.length);
  for (const content of REPORT_CONTENT) {
    assert.ok(content.names.length && content.use && content.note && content.sources.length);
    assert.ok(content.sources.every(url => /^https:\/\//.test(url)));
  }
});

test('specimens and similarly named assays remain separate', () => {
  assert.equal(getReportContent({ name: 'Creatinine (Serum)', sample_type: 'Urine' }), null);
  assert.equal(getReportContent({ name: 'T3 &US-TSH', sample_type: 'Serum' }), null);
  assert.equal(getReportContent({ name: 'AFB stain', sample_type: 'Sputum' }), null);
  assert.equal(getReportContent({ name: 'Blood Culture & Sensitivity', sample_type: 'Blood' }), null);
  assert.equal(getReportContent({ name: 'Renamed chemistry test', code: 'CREATININE', sample_type: 'Serum' }).key, 'creatinine-serum');
});

test('thyroid explanation includes only the measured component rows', () => {
  const notes = buildSupplementaryNotes({ name: 'FT4 & TSH', sample_type: 'Serum', parameters: [
    { parameter_name: 'FT4, Serum' }, { parameter_name: 'TSH, Serum' },
  ] });
  assert.match(notes, /<td>TSH<\/td>/);
  assert.match(notes, /<td>Free T4<\/td>/);
  assert.doesNotMatch(notes, /<td>T3 \/ Free T3<\/td>|<td>Total T3 \/ Total T4<\/td>/);
});

test('manual notes and existing bespoke explanatory formats take precedence', () => {
  const t = { name: 'FT4 & TSH', sample_type: 'Serum', parameters: [] };
  assert.equal(supplementReportHtml('<div class="thyroid-notes">Existing</div><!-- supplemental-report-content -->', t), '<div class="thyroid-notes">Existing</div><!-- supplemental-report-content -->');
  const html = buildReportHtml(sampleReport({ ...t, report_body: 'Lab-approved note <b>not HTML</b>' }));
  assert.doesNotMatch(html, /data-report-content=/);
  assert.match(html, /Lab-approved note &lt;b&gt;not HTML&lt;\/b&gt;/);
});

test('new notes are additive and never supply results or replace configured intervals', () => {
  const t = { name: 'FT4 & TSH', sample_type: 'Serum', parameters: [
    { parameter_name: 'FT4, Serum', unit: 'custom unit', normal_range: 'lab-specific interval', value: '' },
    { parameter_name: 'TSH, Serum', unit: 'mU/L', normal_range: '0.27 - 4.20', value: '7.3' },
  ] };
  const original = JSON.stringify(t);
  const html = buildReportHtml(sampleReport(t));
  assert.match(html, /lab-specific interval/);
  assert.match(html, /custom unit/);
  assert.match(html, /0.27 - 4.20/);
  assert.match(html, /7.3/);
  assert.equal(JSON.stringify(t), original);
  assert.equal((html.match(/data-report-content=/g) || []).length, 1);
  assert.equal(supplementReportHtml(html, t), html);
  assert.ok(html.indexOf('data-report-content=') > html.indexOf('</tbody>'));
});

test('multiple reports receive their own notes through the same renderer', () => {
  const tests = [
    { name: 'FT4 & TSH', sample_type: 'Serum', parameters: [] },
    { name: 'AFB Culture & Sensitivity', code: 'AFBCULTURESENS', parameters: [] },
  ];
  const html = buildReportHtml({ ...sampleReport(tests[0]), tests });
  assert.equal((html.match(/data-report-content="thyroid-function"/g) || []).length, 1);
  assert.equal((html.match(/data-report-content="afb-culture"/g) || []).length, 1);
});

test('named blood-count combinations render every requested field, not just TLC', () => {
  const input = { name: 'Hb,TC,DC,ESR&PlateletCount', sample_type: 'Whole Blood', parameters: [
    { parameter_name: 'Hemoglobin (Hb)', value: 'HB-SAMPLE' },
    { parameter_name: 'TOTAL LEUCOCYTE COUNT (TLC)', value: 'WBC-SAMPLE' },
    { parameter_name: 'Neutrophils', value: 'DC-SAMPLE' },
    { parameter_name: 'ESR', value: 'ESR-SAMPLE' },
    { parameter_name: 'Platelet Count', value: 'PLATELET-SAMPLE' },
  ] };
  const html = buildReportHtml(sampleReport(input));
  for (const parameter of input.parameters) assert.ok(html.includes(parameter.value));
  assert.match(html, /data-report-content="blood-count-combinations"/);
});

test('local catalogue: restored styles and existing formats stay unchanged', async context => {
  const databasePath = path.resolve(__dirname, '../lab-lms.db');
  if (!fs.existsSync(databasePath)) return context.skip('Optional full-catalogue regression requires a local catalogue database.');
  let originalFormatter;
  try {
    originalFormatter = execFileSync('git', ['show', '9ffd1c6:src/utils/reportFormatter.js'], { encoding: 'utf8', maxBuffer: 4e6, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch {
    return context.skip('Optional full-catalogue regression requires the restored-layout commit in Git history.');
  }
  const filename = path.resolve(__dirname, '../src/utils/reportFormatter.js');
  const baseline = new Module(filename, module);
  baseline.filename = filename;
  baseline.paths = Module._nodeModulePaths(path.dirname(filename));
  baseline._compile(originalFormatter, filename);
  const db = new sqlite3.Database(databasePath, sqlite3.OPEN_READONLY);
  const query = sql => new Promise((resolve, reject) => db.all(sql, (err, rows) => err ? reject(err) : resolve(rows)));
  try {
    const tests = await query('SELECT id,name,code,sample_type,report_body FROM tests WHERE active=1');
    const params = await query('SELECT * FROM test_parameters ORDER BY display_order,id');
    for (const t of tests) {
      const input = { ...t, parameters: params.filter(p => p.test_id === t.id).map(p => ({ ...p, value: '' })) };
      const oldHtml = baseline.exports.buildReportHtml(sampleReport(input));
      const newHtml = buildReportHtml(sampleReport(input));
      assert.equal(newHtml.match(/<style>[\s\S]*?<\/style>/)[0], oldHtml.match(/<style>[\s\S]*?<\/style>/)[0]);
      // Named combinations now display all requested components, not TLC alone.
      if (getCombinationDefinition(input)) {
        const table = newHtml.match(/<table class="results-table">[\s\S]*?<\/table>/)[0];
        for (const parameter of input.parameters) {
          const escaped = parameter.parameter_name.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
          assert.ok(table.includes(escaped), `${input.name} must include ${parameter.parameter_name}`);
        }
        continue;
      }
      const addedNotes = buildSupplementaryNotes(input);
      const withoutAddedNotes = (addedNotes ? newHtml.replace(addedNotes, '<!-- supplemental-report-content -->') : newHtml)
        .replace('        <!-- supplemental-report-content -->\n', '');
      assert.ok(withoutAddedNotes === oldHtml, `Only supplemental content may differ: ${t.name}`);
    }
  } finally { await new Promise(resolve => db.close(resolve)); }
});

async function fixture() {
  const raw = new sqlite3.Database(':memory:');
  const db = {
    run: (sql, params = []) => new Promise((resolve, reject) => raw.run(sql, params, function(err) { err ? reject(err) : resolve({ id: this.lastID }); })),
    all: (sql, params = []) => new Promise((resolve, reject) => raw.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows))),
    get: (sql, params = []) => new Promise((resolve, reject) => raw.get(sql, params, (err, row) => err ? reject(err) : resolve(row))),
    close: () => new Promise(resolve => raw.close(resolve)),
  };
  db.transaction = async work => {
    await db.run('BEGIN IMMEDIATE');
    try { const result = await work(); await db.run('COMMIT'); return result; }
    catch (err) { await db.run('ROLLBACK'); throw err; }
  };
  await db.run('CREATE TABLE tests (id INTEGER PRIMARY KEY,name TEXT,code TEXT,category TEXT,sample_type TEXT,report_body TEXT,active INTEGER DEFAULT 1)');
  await db.run('CREATE TABLE test_parameters (id INTEGER PRIMARY KEY,test_id INTEGER,parameter_name TEXT,unit TEXT,normal_range TEXT,entry_mode TEXT,calculation_formula TEXT,calculation_precision INTEGER,display_order INTEGER)');
  await db.run('CREATE TABLE visit_tests (test_id INTEGER)');
  await db.run('CREATE TABLE test_bundle_items (bundle_test_id INTEGER,component_test_id INTEGER)');
  const components = new Set();
  for (const def of COMBINATIONS) {
    for (const code of def.codes) {
      if (components.has(code)) continue;
      components.add(code);
      const { id } = await db.run('INSERT INTO tests (name,code,category,sample_type) VALUES (?,?,?,?)', [code, code, 'Canonical', def.specimen]);
      await db.run('INSERT INTO test_parameters (test_id,parameter_name,unit,normal_range,entry_mode,display_order) VALUES (?,?,?,?,?,?)', [id, code, 'lab-unit', 'configured-interval', 'manual', 1]);
    }
  }
  for (const [index, def] of COMBINATIONS.entries()) {
    await db.run('INSERT INTO tests (id,name,category) VALUES (?,?,?)', [100 + index, def.name, 'Imported legacy catalogue']);
    await db.run('INSERT INTO test_parameters (test_id,parameter_name,unit,normal_range,entry_mode,display_order) VALUES (?,?,?,?,?,?)', [100 + index, 'Result', '', '', 'manual', 1]);
  }
  return db;
}

test('combination repair copies exact source metadata, backs up placeholders and is idempotent', async () => {
  const db = await fixture();
  try {
    assert.equal((await repairKnownCombinationSchemas(db)).length, 10);
    for (const [index, def] of COMBINATIONS.entries()) {
      const params = await db.all('SELECT * FROM test_parameters WHERE test_id=? ORDER BY display_order', [100 + index]);
      assert.deepEqual(params.map(p => p.parameter_name), def.codes);
      assert.ok(params.every(p => p.unit === 'lab-unit' && p.normal_range === 'configured-interval'));
      const backup = await db.get('SELECT * FROM report_schema_repair_backups WHERE test_id=?', [100 + index]);
      assert.equal(JSON.parse(backup.old_parameters_json)[0].parameter_name, 'Result');
    }
    assert.deepEqual(await repairKnownCombinationSchemas(db), []);
  } finally { await db.close(); }
});

test('repair preserves visits, bundles, custom fields, notes and specimen variants', async () => {
  const db = await fixture();
  try {
    await db.run('INSERT INTO visit_tests VALUES (100)');
    await db.run('INSERT INTO test_bundle_items VALUES (101, 999)');
    await db.run('INSERT INTO test_bundle_items VALUES (999, 102)');
    await db.run("UPDATE tests SET report_body='My notes' WHERE id=103");
    await db.run("UPDATE test_parameters SET unit='custom' WHERE test_id=104");
    await db.run("UPDATE test_parameters SET normal_range='custom' WHERE test_id=105");
    await db.run("UPDATE test_parameters SET entry_mode='calculated' WHERE test_id=106");
    await db.run("UPDATE tests SET sample_type='Urine' WHERE id=107");
    await db.run("UPDATE test_parameters SET parameter_name='Manually defined' WHERE test_id=108");
    await db.run("UPDATE tests SET category='Custom catalogue' WHERE id=109");
    assert.deepEqual(await repairKnownCombinationSchemas(db), []);
  } finally { await db.close(); }
});

test('missing source and failed writes never create a partial combination', async () => {
  const db = await fixture();
  try {
    await db.run("UPDATE tests SET active=0 WHERE code='T3TOTAL001'");
    const repaired = await repairKnownCombinationSchemas(db);
    assert.ok(!repaired.includes(100) && !repaired.includes(101));
    assert.equal((await db.get('SELECT parameter_name FROM test_parameters WHERE test_id=100')).parameter_name, 'Result');
  } finally { await db.close(); }
  const broken = await fixture();
  try {
    const originalRun = broken.run;
    broken.run = (sql, params) => /^INSERT INTO test_parameters/.test(sql) ? Promise.reject(new Error('simulated failure')) : originalRun(sql, params);
    await assert.rejects(repairKnownCombinationSchemas(broken), /simulated failure/);
    assert.equal((await broken.get('SELECT parameter_name FROM test_parameters WHERE test_id=100')).parameter_name, 'Result');
    assert.equal((await broken.get('SELECT sample_type FROM tests WHERE id=100')).sample_type, null);
  } finally { await broken.close(); }
});
