// Generate synthetic report fixtures using the real catalogue and formatter.
// No patient, visit, result or business-settings records are read or changed.
const fs = require('node:fs');
const path = require('node:path');
const sqlite3 = require('sqlite3').verbose();
const assert = require('node:assert/strict');
const { buildReportHtml } = require('../src/utils/reportFormatter');

const output = path.resolve(process.argv[2] || 'tmp/report-design/current');
const db = new sqlite3.Database(path.resolve('lab-lms.db'), sqlite3.OPEN_READONLY);
const all = (sql, args = []) => new Promise((resolve, reject) => db.all(sql, args, (error, rows) => error ? reject(error) : resolve(rows)));
const definitions = [
  ['cbc', 'CBC'], ['lft', 'LFT001'], ['thyroid', 'FT3FT4TSH001'],
  ['acr', 'ACR'], ['afb-culture', 'AFBCULTURESENS'], ['vitamin-d', 'VITD25OH'],
  ['histopathology', 'SKINBIO001'], ['semen', 'SEMEN001'], ['hba1c', 'HBA1C001'],
  ['fnac', 'FNAC001'], ['tacrolimus', 'PF025'], ['cbc-absolute', 'CBCABS'],
];
const sampleValues = {
  'AST (SGOT)': '52.00', 'ALT (SGPT)': '65.00', 'Urine Albumin': '45.0',
  'Urine Creatinine': '100.0', 'Albumin Creatinine Ratio (ACR)': '45.0',
  'AFB Culture Result': 'Growth detected', 'Organism Isolated': 'Sample isolate identification',
  'Drug Sensitivity': 'Drug A: susceptible\nDrug B: resistant\nDrug C: pending',
  'Clinical History': 'Synthetic sample for layout review.', 'Clinical Data': 'Synthetic sample for layout review.',
  Specimen: 'Sample tissue specimen', Diagnosis: 'Sample diagnosis for layout review.',
  'Gross Description': 'One labelled tissue specimen received for examination.\nSample dimensions: 1.0 x 0.6 x 0.3 cm.',
  'Microscopic Description': 'Sample microscopic findings are recorded in this section.\nAdditional observations appear on a separate line.',
  Comments: 'Demonstration report. These are synthetic values, not patient results.',
};
function sampleValue(parameter) {
  if (sampleValues[parameter.parameter_name]) return sampleValues[parameter.parameter_name];
  const bounds = String(parameter.normal_range || '').match(/(-?\d+(?:\.\d+)?)\s*-\s*(-?\d+(?:\.\d+)?)/);
  if (bounds) return ((Number(bounds[1]) + Number(bounds[2])) / 2).toFixed(2);
  const upper = String(parameter.normal_range || '').match(/^<\s*(\d+(?:\.\d+)?)/);
  if (upper) return (Number(upper[1]) * .7).toFixed(2);
  if (/negative|absent|not detected/i.test(parameter.normal_range || '')) return 'Negative';
  return 'Sample finding';
}
async function main() {
  fs.mkdirSync(output, { recursive: true });
  const catalogue = await all('SELECT * FROM tests WHERE active = 1');
  const allParams = await all('SELECT * FROM test_parameters ORDER BY test_id, display_order, id');
  const prepared = catalogue.map(test => ({ ...test, parameters: allParams.filter(p => p.test_id === test.id).map(p => ({...p, value: sampleValue(p)})) }));
  const base = {
    patient: { id: 'DEMO', name: 'SAMPLE PATIENT', age: '35', gender: 'Female' },
    visit: { bill_no: 'DEMO-2026-001', created_at: '2026-09-09T07:00:00Z', sample_source: 'lab' },
    report: { finalized_at: '2026-09-09T09:30:00Z' }, doctor: { name: 'Sample referring doctor' },
    businessName: 'Sample Diagnostic Centre', isPreview: true, embeddedPreview: true,
    reportHeaderSpaceMm: 12, reportFooterSpaceMm: 12,
    reportDoctorName: 'Sample reporting doctor', reportDoctorQualification: 'For layout review only',
  };
  const fixtures = [];
  for (const [name, code] of definitions) {
    const test = prepared.find(t => String(t.code).toUpperCase() === code) || (name === 'acr' ? prepared.find(t => /albumin.*creatinine.*ratio/i.test(t.name)) : null);
    if (!test) { console.log(`Skipped unavailable sample: ${name} (${code})`); continue; }
    fixtures.push({ name, data: { ...base, tests: [test] } });
  }
  const generic = { name: 'Custom laboratory panel', category: 'Biochemistry', sample_type: 'Serum', parameters: [
    { parameter_name: 'Sample analyte', value: '28.5', normal_range: '10 - 25', unit: 'U/L' },
    { parameter_name: 'Additional finding', value: 'Sample observation entered by the laboratory.', normal_range: '', unit: '' },
  ], report_body: 'Laboratory comment\nThis text was entered in the report builder.' };
  fixtures.push({ name: 'custom', data: { ...base, tests: [generic] } });
  const narrative = { name: 'Imaging findings', category: 'Radiology', parameters: [
    { parameter_name: 'Clinical Details', value: 'Synthetic sample for layout review.' },
    { parameter_name: 'Findings', value: 'Sample findings on the first line.\nAdditional observations on the next line.' },
    { parameter_name: 'Impression', value: 'Sample impression entered by the laboratory.' },
    { parameter_name: 'Advice', value: 'Sample advice.' },
  ] };
  fixtures.push({ name: 'narrative', data: { ...base, tests: [narrative] } });
  fixtures.push({ name: 'grouped', data: { ...base, tests: fixtures.slice(0, 3).map(f => f.data.tests[0]) } });
  const longTest = { ...generic, parameters: Array.from({ length: 80 }, (_, i) => ({parameter_name: `Investigation ${i + 1}`, value: `${i + 1}.0`, unit: 'U/L', normal_range: '0 - 100'})) };
  fixtures.push({ name: 'long-report', data: { ...base, reportHeaderSpaceMm: 40, reportFooterSpaceMm: 20, tests: [longTest] } });
  const letterhead = '<svg xmlns="http://www.w3.org/2000/svg" width="794" height="1123"><rect width="794" height="1123" fill="white"/><rect width="794" height="130" fill="#f2f6f8"/><text x="38" y="60" font-family="Arial" font-size="24" fill="#196d78">SAMPLE DIAGNOSTIC CENTRE</text><text x="38" y="90" font-family="Arial" font-size="12">Synthetic letterhead for pagination review</text><rect y="1055" width="794" height="68" fill="#f2f6f8"/><text x="38" y="1090" font-family="Arial" font-size="12">Sample footer - no patient data</text></svg>';
  fixtures.push({ name: 'long-letterhead', data: { ...base, reportHeaderSpaceMm: 40, reportFooterSpaceMm: 20, letterheadDataUrl: `data:image/svg+xml;base64,${Buffer.from(letterhead).toString('base64')}`, tests: [longTest] } });
  const qrFile = path.resolve('tmp/report-design/sample-qr.png');
  const barcodeFile = path.resolve('tmp/report-design/sample-barcode.png');
  const localImage = file => `data:image/png;base64,${fs.readFileSync(file).toString('base64')}`;
  for (const { name, data } of fixtures) {
    let html = buildReportHtml(data);
    if (fs.existsSync(qrFile)) html = html.replace(/https:\/\/api\.qrserver\.com\/[^\"]+/g, localImage(qrFile));
    if (fs.existsSync(barcodeFile)) html = html.replace(/https:\/\/bwipjs-api\.metafloor\.com\/[^\"]+/g, localImage(barcodeFile));
    fs.writeFileSync(path.join(output, `${name}.html`), html);
  }
  // Exercise every catalogue renderer, including entries using the generic body.
  for (const test of prepared) {
    const html = buildReportHtml({ ...base, tests: [test] });
    if (!html.includes('</html>') || /<tbody>\s*<\/tbody>/.test(html)) throw new Error(`Empty report body: ${test.name}`);
    assert.ok(html.includes('report-findings'), `Missing shared layout: ${test.name}`);
  }
  const genericHtml = buildReportHtml({ ...base, tests: [generic] });
  assert.ok(genericHtml.includes('<h1 class="test-title">Custom laboratory panel</h1>'));
  assert.ok(genericHtml.includes('28.5') && genericHtml.includes('report-result-status high-val'));
  const narrativeHtml = buildReportHtml({ ...base, tests: [narrative] });
  assert.ok(narrativeHtml.includes('narrative-finding'));
  assert.ok(narrativeHtml.includes('first line.<br>Additional observations'));
  const escapedHtml = buildReportHtml({ ...base, tests: [{...generic, name: '<img src=x onerror=alert(1)>'}] });
  assert.ok(escapedHtml.includes('&lt;img src=x onerror=alert(1)&gt;'));
  assert.equal(escapedHtml.includes('<img src=x onerror=alert(1)>'), false);
  console.log(`Rendered ${prepared.length} catalogue definitions; saved ${fixtures.length} synthetic fixtures to ${output}`);
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => db.close());
