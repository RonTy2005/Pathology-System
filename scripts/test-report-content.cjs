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
const { CELL_REPORT_DEFINITIONS, getCellReportDefinition, getCellReportParameters, getCellReportPreviewValue, repairCellReportSchemas } = require('../src/services/cellReportService');
const { getFallbackReportParameters } = require('../src/services/reportSchemaService');
const { sampleReport } = require('./audit-report-content.cjs');
const { isBillingOnlyTest } = require('../frontend/scripts/reportEligibility');

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

test('ACTH uses the endocrine report format for both current and corrected catalogue names', () => {
  for (const name of ['ACTH (AdrenocorticoproticHormone)', 'ACTH (Adrenocorticoprotic Hormone)', 'Adrenocorticotropic Hormone (ACTH)']) {
    const html = buildReportHtml(sampleReport({
      name,
      sample_type: 'EDTA Plasma',
      parameters: [{ parameter_name: 'ACTH, Plasma', value: '24.5', unit: 'pg/mL', normal_range: '7.2 - 63.0' }],
    }));
    assert.match(html, /<div class="test-title">ADRENOCORTICOTROPIC HORMONE \(ACTH\)<\/div>/);
    assert.match(html, /ADRENOCORTICOTROPIC HORMONE \(ACTH\), PLASMA/);
    assert.match(html, />24\.5</);
    assert.match(html, /7\.2 - 63\.0/);
    assert.match(html, /Specimen &amp; Collection Note/);
    assert.match(html, /pre-chilled EDTA tube/);
  }
});

test('ADA uses a specimen-aware activity report for the imported catalogue name', () => {
  const html = buildReportHtml(sampleReport({
    name: 'ADA(AdenosineDeaminaseActivity)',
    sample_type: 'Serum / Body Fluid',
    parameters: [{ parameter_name: 'Result', value: '42', unit: '', normal_range: '' }],
  }));
  assert.match(html, /<div class="test-title">ADENOSINE DEAMINASE \(ADA\) ACTIVITY<\/div>/);
  assert.match(html, /ADENOSINE DEAMINASE \(ADA\) ACTIVITY/);
  assert.match(html, />42</);
  assert.match(html, /Specimen-dependent/);
  assert.match(html, /Raised fluid ADA is not specific for tuberculosis/);
  assert.match(html, /Ascitic fluid<\/td><td>&lt; 35 U\/L/);
});

test('AFB Ziehl-Neelsen stain uses a microscopy report instead of a blank narrative', () => {
  const html = buildReportHtml(sampleReport({
    name: 'AFB(Z-NStain)',
    sample_type: 'Sputum / Pus',
    parameters: [
      { parameter_name: 'Findings', value: 'Acid-fast bacilli seen', unit: '', normal_range: '' },
      { parameter_name: 'Impression', value: '1+', unit: '', normal_range: '' },
      { parameter_name: 'Comments', value: 'Correlate with culture.', unit: '', normal_range: '' },
    ],
  }));
  assert.match(html, /<div class="test-title">AFB \(ZIEHL-NEELSEN STAIN\)<\/div>/);
  assert.match(html, /ACID-FAST BACILLI \(AFB\), ZIEHL-NEELSEN STAIN/);
  assert.match(html, /Acid-fast bacilli seen/);
  assert.match(html, />1\+<\/td>/);
  assert.match(html, /AFB detected/);
  assert.match(html, /A negative smear does not exclude tuberculosis/);
});

test('Albert stain for KLB uses a dedicated direct-smear microscopy report', () => {
  const html = buildReportHtml(sampleReport({
    name: 'Albert Stain of Smears for KLB',
    sample_type: 'Throat Swab',
    parameters: [
      { parameter_name: 'Findings', value: 'Pleomorphic bacilli with metachromatic granules seen', unit: '', normal_range: '' },
      { parameter_name: 'Metachromatic Granules', value: 'Present', unit: '', normal_range: '' },
      { parameter_name: 'Impression', value: 'Morphologically suggestive of KLB', unit: '', normal_range: '' },
      { parameter_name: 'Comments', value: 'Culture confirmation advised.', unit: '', normal_range: '' },
    ],
  }));
  assert.match(html, /<div class="test-title">ALBERT STAIN OF SMEARS FOR KLB<\/div>/);
  assert.match(html, /ALBERT STAIN FOR KLEBS&ndash;L&Ouml;FFLER BACILLI \(KLB\)/);
  assert.match(html, /Pleomorphic bacilli with metachromatic granules seen/);
  assert.match(html, /Morphologically suggestive of KLB/);
  assert.match(html, /Culture confirmation advised/);
  assert.match(html, /Microscopy alone does not confirm/);
  assert.match(html, /validated toxigenicity test/);
});

test('A/G ratio renders the protein components, calculation, and laboratory interval', () => {
  const html = buildReportHtml(sampleReport({
    name: 'AGRatio',
    sample_type: 'Serum',
    parameters: [
      { parameter_name: 'Total Protein', value: '7.2', unit: 'g/dL', normal_range: '5.70 - 8.20' },
      { parameter_name: 'Albumin', value: '4.5', unit: 'g/dL', normal_range: '3.20 - 4.80' },
      { parameter_name: 'Globulin', value: '2.7', unit: 'g/dL', normal_range: '2.00 - 3.50' },
      { parameter_name: 'A : G Ratio', value: '1.67', unit: '', normal_range: '0.90 - 2.00' },
    ],
  }));
  assert.match(html, /<div class="test-title">ALBUMIN \/ GLOBULIN RATIO \(A\/G\)<\/div>/);
  assert.match(html, /TOTAL PROTEIN/);
  assert.match(html, /GLOBULIN/);
  assert.match(html, />1\.67</);
  assert.match(html, /A\/G Ratio = Albumin/);
  assert.match(html, /0\.90 - 2\.00/);
  assert.match(html, /laboratory-validated interval printed above takes precedence/);
});

test('qualitative ANF uses a dedicated autoimmune screening report', () => {
  for (const name of ['ANF (AntiNuclearFactor) Qualitative', 'ANF(AntiNudearFactor)Qualitative']) {
    const html = buildReportHtml(sampleReport({
      name,
      sample_type: 'Serum',
      parameters: [{ parameter_name: 'Result', value: 'Positive', unit: '', normal_range: '' }],
    }));
    assert.match(html, /<div class="test-title">ANTINUCLEAR FACTOR \(ANF\), QUALITATIVE<\/div>/);
    assert.match(html, /ANTINUCLEAR FACTOR \(ANF\) \/ ANTINUCLEAR ANTIBODY \(ANA\), QUALITATIVE/);
    assert.match(html, />Positive</);
    assert.match(html, /<td>Negative<\/td>/);
    assert.match(html, /A positive result alone does not diagnose a specific disease/);
    assert.match(html, /laboratory result and its validated procedure take precedence/);
  }
});

test('prostatic acid phosphatase uses a dedicated PAP report without matching total acid phosphatase', () => {
  const html = buildReportHtml(sampleReport({
    name: 'AcidPhosphataseProstate/PAP',
    sample_type: 'Serum',
    parameters: [{ parameter_name: 'Result', value: '2.1', unit: '', normal_range: '' }],
  }));
  assert.match(html, /<div class="test-title">PROSTATIC ACID PHOSPHATASE \(PAP\)<\/div>/);
  assert.match(html, /PROSTATIC ACID PHOSPHATASE \(PAP\), SERUM/);
  assert.match(html, />2\.1</);
  assert.match(html, /0\.00 - 3\.50/);
  assert.match(html, /PAP is not a screening test for prostate cancer/);
  assert.match(html, /laboratory-validated interval printed above takes precedence/);

  const totalAcidPhosphataseHtml = buildReportHtml(sampleReport({
    name: 'AcidPhosphataseTotal',
    sample_type: 'Serum',
    parameters: [{ parameter_name: 'Result', value: '2.1', unit: '', normal_range: '' }],
  }));
  assert.doesNotMatch(totalAcidPhosphataseHtml, /PROSTATIC ACID PHOSPHATASE \(PAP\), SERUM/);
});

test('total acid phosphatase uses its own enzymatic report without matching PAP', () => {
  const html = buildReportHtml(sampleReport({
    name: 'AcidPhosphataseTotal',
    sample_type: 'Serum',
    parameters: [{ parameter_name: 'Result', value: '3.1', unit: '', normal_range: '' }],
  }));
  assert.match(html, /<div class="test-title">ACID PHOSPHATASE, TOTAL<\/div>/);
  assert.match(html, /ACID PHOSPHATASE, TOTAL, SERUM/);
  assert.match(html, />3\.1</);
  assert.match(html, /0\.00 - 4\.30/);
  assert.match(html, /Quantitative enzymatic assay/);
  assert.match(html, /distinct from the prostatic acid phosphatase \(PAP\) fraction/);
  assert.doesNotMatch(html, /PROSTATIC ACID PHOSPHATASE \(PAP\), SERUM/);
});

test('urine alcohol supports quantitative or qualitative reporting without matching serum alcohol', () => {
  const html = buildReportHtml(sampleReport({
    name: 'Alcohol (urine)',
    sample_type: 'Random Urine',
    parameters: [{ parameter_name: 'Result', value: '18', unit: '', normal_range: '' }],
  }));
  assert.match(html, /<div class="test-title">ETHANOL \(ALCOHOL\), URINE<\/div>/);
  assert.match(html, /ETHANOL \(ALCOHOL\), URINE/);
  assert.match(html, />18</);
  assert.match(html, /Not detected \(cutoff: 10 mg\/dL\)/);
  assert.match(html, /Detected<\/span>/);
  assert.match(html, /does not establish the degree of intoxication or impairment/);
  assert.match(html, /Urine ethanol is different from urine ethyl glucuronide\/ethyl sulfate testing/);

  const serumHtml = buildReportHtml(sampleReport({
    name: 'Alcohol (serum)',
    sample_type: 'Serum',
    parameters: [{ parameter_name: 'Result', value: '18', unit: 'mg/dL', normal_range: '' }],
  }));
  assert.doesNotMatch(serumHtml, /urine-alcohol-table/);
});

test('Aldehyde Test uses a dedicated nonspecific formol-gel report', () => {
  const html = buildReportHtml(sampleReport({
    name: 'Aldehyde Test (AT)',
    sample_type: 'Serum',
    parameters: [
      { parameter_name: 'Result', value: 'Positive', unit: '', normal_range: '' },
      { parameter_name: 'Reaction Time', value: '15 minutes', unit: '', normal_range: '' },
      { parameter_name: 'Reaction Grade', value: '+++', unit: '', normal_range: '' },
      { parameter_name: 'Comments', value: 'Correlate clinically.', unit: '', normal_range: '' },
    ],
  }));
  assert.match(html, /<div class="test-title">ALDEHYDE TEST \(AT\)<\/div>/);
  assert.match(html, /NAPIER&rsquo;S ALDEHYDE TEST \(FORMOL-GEL TEST\)/);
  assert.match(html, />Positive<\/strong>/);
  assert.match(html, /15 minutes/);
  assert.match(html, />\+\+\+<\/td>/);
  assert.match(html, /Correlate clinically\./);
  assert.match(html, /does not confirm visceral leishmaniasis/);
  assert.match(html, /current validated diagnostic methods/);
});

test('Aldosterone uses a posture-aware serum endocrine report', () => {
  const html = buildReportHtml(sampleReport({
    name: 'Aldosterone',
    sample_type: 'Serum',
    parameters: [
      { parameter_name: 'Result', value: '14.2', unit: '', normal_range: '' },
      { parameter_name: 'Collection Posture', value: 'Seated', unit: '', normal_range: '' },
      { parameter_name: 'Collection Time', value: '08:30 AM', unit: '', normal_range: '' },
      { parameter_name: 'Comments', value: 'Interpret with renin.', unit: '', normal_range: '' },
    ],
  }));
  assert.match(html, /<div class="test-title">ALDOSTERONE<\/div>/);
  assert.match(html, /ALDOSTERONE, SERUM/);
  assert.match(html, />14\.2<\/span>/);
  assert.match(html, /≤ 21\.0 \(≥ 11 years, a\.m\.\)/);
  assert.match(html, /Seated; 08:30 AM/);
  assert.match(html, /Interpret with renin\./);
  assert.match(html, /aldosterone-to-renin ratio \(ARR\)/);
  assert.match(html, /single aldosterone result is not diagnostic/);
  assert.match(html, /Medication changes must be directed by the treating clinician/);
});

test('Allergy blood panel reports specific IgE without duplicating Total IgE', () => {
  const html = buildReportHtml(sampleReport({
    name: 'Allergy (Blood)',
    sample_type: 'Serum',
    parameters: [
      { parameter_name: 'Result', value: 'Milk: 1.20\nDust mite: 0.08', unit: '', normal_range: '' },
      { parameter_name: 'Allergen / Panel Tested', value: 'Food and inhalant panel', unit: '', normal_range: '' },
      { parameter_name: 'Reported Class', value: 'Reported individually', unit: '', normal_range: '' },
      { parameter_name: 'Comments', value: 'Correlate with exposure history.', unit: '', normal_range: '' },
    ],
  }));
  assert.match(html, /<div class="test-title">ALLERGY \(BLOOD\) - SPECIFIC IgE<\/div>/);
  assert.match(html, /ALLERGEN-SPECIFIC IgE, SERUM/);
  assert.match(html, /Milk: 1\.20\nDust mite: 0\.08/);
  assert.match(html, /Food and inhalant panel/);
  assert.match(html, /Reported individually/);
  assert.match(html, /Class 0 \/ &lt; 0\.10 per allergen/);
  assert.match(html, /does not by itself establish clinical allergy or predict reaction severity/);
  assert.match(html, /Total IgE is a separate measurement/);
  assert.doesNotMatch(html, /IMMUNOGLOBULIN IgE, SERUM/);

  const drugAllergyHtml = buildReportHtml(sampleReport({
    name: 'Allergy (Drug)',
    sample_type: 'Serum',
    parameters: [{ parameter_name: 'Result', value: 'Sample result', unit: '', normal_range: '' }],
  }));
  assert.doesNotMatch(drugAllergyHtml, /blood-allergy-table/);
});

test('Drug allergy report identifies the drug and preserves IgE testing limitations', () => {
  const html = buildReportHtml(sampleReport({
    name: 'Allergy (Drug)',
    sample_type: 'Serum',
    parameters: [
      { parameter_name: 'Result', value: '0.82', unit: '', normal_range: '' },
      { parameter_name: 'Drug / Determinant Tested', value: 'Penicillin G', unit: '', normal_range: '' },
      { parameter_name: 'Reported Class', value: 'Class 2 - Positive', unit: '', normal_range: '' },
      { parameter_name: 'Reaction History / Clinical Details', value: 'Immediate urticaria after previous dose.', unit: '', normal_range: '' },
      { parameter_name: 'Comments', value: 'Specialist correlation advised.', unit: '', normal_range: '' },
    ],
  }));
  assert.match(html, /<div class="test-title">ALLERGY \(DRUG\) - SPECIFIC IgE<\/div>/);
  assert.match(html, /DRUG-SPECIFIC IgE, SERUM/);
  assert.match(html, /Penicillin G/);
  assert.match(html, />0\.82<\/span>/);
  assert.match(html, /Class 2 - Positive/);
  assert.match(html, /Immediate urticaria after previous dose\./);
  assert.match(html, /does not exclude drug allergy/);
  assert.match(html, /does not exclude delayed, non-IgE-mediated reactions/);
  assert.match(html, /Do not remove an allergy label, re-administer the suspected drug, or perform a challenge solely from this result/);
  assert.doesNotMatch(html, /blood-allergy-table/);
});

test('random urine alpha amylase has a specimen-specific report distinct from 24-hour urine', () => {
  const html = buildReportHtml(sampleReport({
    name: 'Alpha Amylase (Urine)',
    sample_type: 'Random Urine',
    parameters: [
      { parameter_name: 'Result', value: '210', unit: '', normal_range: '' },
      { parameter_name: 'Comments', value: 'Correlate with serum lipase.', unit: '', normal_range: '' },
    ],
  }));
  assert.match(html, /<div class="test-title">ALPHA AMYLASE, RANDOM URINE<\/div>/);
  assert.match(html, /ALPHA AMYLASE, RANDOM URINE/);
  assert.match(html, />210<\/span>/);
  assert.match(html, /Male: 16 - 491; Female: 21 - 447/);
  assert.match(html, /<td>Male<\/td><td>16 - 491<\/td>/);
  assert.match(html, /<td>Female<\/td><td>21 - 447<\/td>/);
  assert.match(html, /supportive, nonspecific marker/);
  assert.match(html, /must not be interpreted using a timed or 24-hour urine excretion interval/);

  const timedHtml = buildReportHtml(sampleReport({
    name: 'Amylase (24 hrs. urine)',
    sample_type: '24-hour Urine',
    parameters: [{ parameter_name: 'Result', value: '8', unit: 'U/hour', normal_range: '1 - 17' }],
  }));
  assert.doesNotMatch(timedHtml, /class="results-table single-analyte-table urine-amylase-table"/);
});

test('24-hour urine amylase reports timed excretion and collection completeness', () => {
  const html = buildReportHtml(sampleReport({
    name: 'Amylase (24 hrs. urine)',
    sample_type: '24-Hour Urine',
    parameters: [
      { parameter_name: 'Result', value: '9.5', unit: '', normal_range: '' },
      { parameter_name: 'Amylase Concentration, Urine', value: '190', unit: '', normal_range: '' },
      { parameter_name: 'Total Urine Volume', value: '1200', unit: '', normal_range: '' },
      { parameter_name: 'Collection Duration', value: '24', unit: '', normal_range: '' },
      { parameter_name: 'Comments', value: 'Complete collection reported.', unit: '', normal_range: '' },
    ],
  }));
  assert.match(html, /<div class="test-title">AMYLASE, 24-HOUR URINE<\/div>/);
  assert.match(html, /AMYLASE EXCRETION, 24-HOUR URINE/);
  assert.match(html, />9\.5<\/span>/);
  assert.match(html, /Male: 0 - 18; Female: 0 - 17/);
  assert.match(html, />190<\/td>/);
  assert.match(html, /<strong>Total Volume:<\/strong> 1200 mL/);
  assert.match(html, /<strong>Duration:<\/strong> 24 hours/);
  assert.match(html, /Amylase excretion \(U\/hour\) = urine amylase concentration/);
  assert.match(html, /incomplete collection can invalidate the calculated excretion rate/);
  assert.match(html, /must not use the reference interval for a random urine amylase concentration/);
  assert.doesNotMatch(html, /class="results-table single-analyte-table urine-amylase-table"/);
});

test('Ammonia uses an EDTA plasma report with critical handling guidance', () => {
  const html = buildReportHtml(sampleReport({
    name: 'Ammonia',
    sample_type: 'EDTA Plasma',
    parameters: [
      { parameter_name: 'Result', value: '42', unit: '', normal_range: '' },
      { parameter_name: 'Specimen Handling / Processing Note', value: 'Received chilled and separated promptly.', unit: '', normal_range: '' },
      { parameter_name: 'Comments', value: 'Correlate clinically.', unit: '', normal_range: '' },
    ],
  }));
  assert.match(html, /<div class="test-title">AMMONIA, PLASMA<\/div>/);
  assert.match(html, /AMMONIA, PLASMA/);
  assert.match(html, />42<\/span>/);
  assert.match(html, />≤ 30<\/td>/);
  assert.match(html, />µmol\/L<\/td>/);
  assert.match(html, /Received chilled and separated promptly\./);
  assert.match(html, /does not correlate reliably with the presence or severity of hepatic encephalopathy/);
  assert.match(html, /place on ice immediately, separate plasma from cells promptly/);
  assert.match(html, /can cause a falsely increased result/);
});

test('combined androgen panel reports testosterone and DHEA-S as separate analytes', () => {
  const html = buildReportHtml(sampleReport({
    name: 'Androgens (Testosterone &DHEAS)',
    sample_type: 'Serum',
    parameters: [
      { parameter_name: 'Result', value: '520', unit: '', normal_range: '' },
      { parameter_name: 'DHEA-S, Serum', value: '240', unit: '', normal_range: '' },
      { parameter_name: 'Collection Time', value: '08:15 AM', unit: '', normal_range: '' },
      { parameter_name: 'Comments', value: 'Interpret with clinical findings.', unit: '', normal_range: '' },
    ],
  }));
  assert.match(html, /<div class="test-title">ANDROGEN PROFILE \(TESTOSTERONE & DHEA-S\)<\/div>/);
  assert.match(html, /TESTOSTERONE, TOTAL, SERUM/);
  assert.match(html, />520<\/span>/);
  assert.match(html, /DHEA-S, SERUM/);
  assert.match(html, />240<\/span>/);
  assert.match(html, /Male, 19 years and older<\/td><td>240 - 950/);
  assert.match(html, /Female, 18 - 30 years<\/td><td>83 - 377/);
  assert.match(html, /repeat morning fasting total testosterone measurement/);
  assert.match(html, /08:15 AM/);
  assert.match(html, /Interpret with clinical findings\./);
  assert.doesNotMatch(html, /Testosterone.*DHEA-S Ratio/i);

  const testosteroneOnly = buildReportHtml(sampleReport({
    name: 'Testosterone, Total',
    parameters: [{ parameter_name: 'Result', value: '450', unit: 'ng/dL', normal_range: '300 - 1000' }],
  }));
  assert.doesNotMatch(testosteroneOnly, /androgen-panel-table/);
});

test('Androstenedione A4 uses a dedicated age- and sex-aware serum report', () => {
  for (const name of ['Androsteindione(A4)', 'Androstenedione (A4)']) {
    const html = buildReportHtml(sampleReport({
      name,
      sample_type: 'Serum',
      parameters: [
        { parameter_name: 'Result', value: '112', unit: '', normal_range: '' },
        { parameter_name: 'Collection Time', value: '09:10 AM', unit: '', normal_range: '' },
        { parameter_name: 'Comments', value: 'Interpret with the clinical presentation.', unit: '', normal_range: '' },
      ],
    }));
    assert.match(html, /<div class="test-title">ANDROSTENEDIONE \(A4\)<\/div>/);
    assert.match(html, /ANDROSTENEDIONE \(A4\), SERUM/);
    assert.match(html, />112<\/span>/);
    assert.match(html, /Adult male<\/td><td>40 - 150/);
    assert.match(html, /Adult female<\/td><td>30 - 200/);
    assert.match(html, /III<\/td><td>50 - 100<\/td><td>80 - 190/);
    assert.match(html, /congenital adrenal hyperplasia/);
    assert.match(html, /should not be used alone to diagnose/);
    assert.match(html, /09:10 AM/);
    assert.match(html, /Interpret with the clinical presentation\./);
  }
});

test('comprehensive anemia profile combines CBC, marrow, iron and vitamin findings', () => {
  const html = buildReportHtml(sampleReport({
    name: 'AnemiaComprehenssiveProfilefd',
    sample_type: 'EDTA Whole Blood and Serum',
    parameters: [
      { parameter_name: 'Haemoglobin (Hb)', value: '9.8', unit: 'g/dL', normal_range: 'Male: 13.5 - 17.5; Female: 12.0 - 15.5' },
      { parameter_name: 'Mean Corpuscular Volume (MCV)', value: '72', unit: 'fL', normal_range: '80 - 100' },
      { parameter_name: 'Reticulocyte Count', value: '1.1', unit: '%', normal_range: '0.5 - 2.5' },
      { parameter_name: 'Result / Findings', value: 'Microcytic hypochromic red cells seen.', unit: '', normal_range: '' },
      { parameter_name: 'Serum Iron', value: '28', unit: 'mcg/dL', normal_range: '' },
      { parameter_name: 'Total Iron Binding Capacity (TIBC)', value: '410', unit: 'mcg/dL', normal_range: '' },
      { parameter_name: 'Transferrin Saturation', value: '6.8', unit: '%', normal_range: '14 - 50' },
      { parameter_name: 'Ferritin, Serum', value: '8', unit: 'ng/mL', normal_range: '' },
      { parameter_name: 'Vitamin B12, Serum', value: '410', unit: 'pg/mL', normal_range: '' },
      { parameter_name: 'Folate, Serum', value: '8.2', unit: 'ng/mL', normal_range: '' },
      { parameter_name: 'Comments', value: 'Correlate with clinical history.', unit: '', normal_range: '' },
    ],
  }));
  assert.match(html, /<div class="test-title">COMPREHENSIVE ANEMIA PROFILE<\/div>/);
  assert.match(html, /EDTA Whole Blood and Serum/);
  assert.match(html, /COMPLETE BLOOD COUNT \(EDTA WHOLE BLOOD\)/);
  assert.match(html, /BONE-MARROW RESPONSE \(EDTA WHOLE BLOOD\)/);
  assert.match(html, /IRON STATUS \(SERUM\)/);
  assert.match(html, /HAEMATINIC VITAMINS \(SERUM\)/);
  assert.match(html, />9\.8<\/span>/);
  assert.match(html, /Microcytic hypochromic red cells seen\./);
  assert.match(html, />6\.8<\/span>/);
  assert.match(html, /ferritin.*acute-phase reactant/i);
  assert.match(html, /corrected reticulocyte count or reticulocyte production index/);
  assert.match(html, /Correlate with clinical history\./);
});

test('anemia screening profile stays focused on CBC and iron status', () => {
  const html = buildReportHtml(sampleReport({
    name: 'AnemiaScreeningProfile',
    sample_type: 'EDTA Whole Blood and Serum',
    parameters: [
      { parameter_name: 'Haemoglobin (Hb)', value: '11.2', unit: 'g/dL', normal_range: '' },
      { parameter_name: 'Mean Corpuscular Volume (MCV)', value: '78', unit: 'fL', normal_range: '' },
      { parameter_name: 'Serum Iron', value: '44', unit: 'mcg/dL', normal_range: '' },
      { parameter_name: 'Total Iron Binding Capacity (TIBC)', value: '360', unit: 'mcg/dL', normal_range: '' },
      { parameter_name: 'Transferrin Saturation', value: '12.2', unit: '%', normal_range: '' },
      { parameter_name: 'Ferritin, Serum', value: '14', unit: 'ng/mL', normal_range: '' },
      { parameter_name: 'Result / Findings', value: 'Screen-positive pattern; correlate clinically.', unit: '', normal_range: '' },
      { parameter_name: 'Comments', value: 'Consider comprehensive work-up if persistent.', unit: '', normal_range: '' },
    ],
  }));
  assert.match(html, /<div class="test-title">ANEMIA SCREENING PROFILE<\/div>/);
  assert.match(html, /EDTA Whole Blood and Serum/);
  assert.match(html, /COMPLETE BLOOD COUNT \(EDTA WHOLE BLOOD\)/);
  assert.match(html, /IRON SCREEN \(SERUM\)/);
  assert.match(html, />11\.2<\/span>/);
  assert.match(html, />12\.2<\/span>/);
  assert.match(html, /Screen-positive pattern; correlate clinically\./);
  assert.match(html, /comprehensive anaemia profile or targeted testing/);
  assert.match(html, /ferritin is an acute-phase reactant/);
  assert.doesNotMatch(html, /HAEMATINIC VITAMINS \(SERUM\)|BONE-MARROW RESPONSE/);
});

test('Anti-TPO has a dedicated autoimmune thyroid report without adding Anti-Tg', () => {
  const html = buildReportHtml(sampleReport({
    name: 'Anti TPO (Anti ThyroidPeroxidase)',
    sample_type: 'Serum',
    parameters: [
      { parameter_name: 'Result', value: '145', unit: '', normal_range: '' },
      { parameter_name: 'Comments', value: 'Correlate with TSH and free T4.', unit: '', normal_range: '' },
    ],
  }));
  assert.match(html, /<div class="test-title">ANTI-THYROID PEROXIDASE ANTIBODY \(ANTI-TPO\)<\/div>/);
  assert.match(html, /ANTI-TPO ANTIBODY, SERUM/);
  assert.match(html, />145<\/span>/);
  assert.match(html, /&lt; 60\.00/);
  assert.match(html, /does not show whether the thyroid is currently underactive, normal, or overactive/);
  assert.match(html, /focuses on thyroid function rather than repeated Anti-TPO titres/);
  assert.match(html, /High-dose biotin/);
  assert.match(html, /Correlate with TSH and free T4\./);
  assert.doesNotMatch(html, /ANTI - Tg, SERUM|ANTI THYROGLOBULIN/);

  const combined = buildReportHtml(sampleReport({
    name: 'Thyroid Antibody Profile',
    parameters: [
      { parameter_name: 'Anti - Tg, Serum', value: '20', unit: 'U/mL', normal_range: '< 60.00' },
      { parameter_name: 'Anti TPO, Serum', value: '25', unit: 'U/mL', normal_range: '< 60.00' },
    ],
  }));
  assert.match(combined, /ANTI - Tg, SERUM/);
  assert.doesNotMatch(combined, /class="results-table single-analyte-table thyroid-antibodies-table anti-tpo-table"/);
});

test('Anti-Tg has a dedicated thyroid autoantibody report without adding Anti-TPO', () => {
  const html = buildReportHtml(sampleReport({
    name: 'Anti Tg (Anti Thyroglobulin)',
    sample_type: 'Serum',
    parameters: [
      { parameter_name: 'Result', value: '82', unit: '', normal_range: '' },
      { parameter_name: 'Comments', value: 'Interpret with thyroid function.', unit: '', normal_range: '' },
    ],
  }));
  assert.match(html, /<div class="test-title">ANTI-THYROGLOBULIN ANTIBODY \(ANTI-TG\)<\/div>/);
  assert.match(html, /ANTI-TG ANTIBODY, SERUM/);
  assert.match(html, />82<\/span>/);
  assert.match(html, /&lt; 60\.00/);
  assert.match(html, /does not determine current thyroid function/);
  assert.match(html, /methods and numerical results are not interchangeable/);
  assert.match(html, /can interfere with thyroglobulin measurements/);
  assert.match(html, /Interpret with thyroid function\./);
  assert.doesNotMatch(html, /ANTI-TPO ANTIBODY, SERUM/);

  const combined = buildReportHtml(sampleReport({
    name: 'Thyroid Antibody Profile',
    parameters: [
      { parameter_name: 'Anti - Tg, Serum', value: '20', unit: 'U/mL', normal_range: '< 60.00' },
      { parameter_name: 'Anti TPO, Serum', value: '25', unit: 'U/mL', normal_range: '< 60.00' },
    ],
  }));
  assert.match(combined, /ANTI - Tg, SERUM/);
  assert.match(combined, /ANTI TPO, SERUM/);
  assert.doesNotMatch(combined, /class="results-table single-analyte-table thyroid-antibodies-table anti-tg-table"/);
});

test('anticardiolipin IgG has a dedicated APS report without matching combined isotypes', () => {
  const html = buildReportHtml(sampleReport({
    name: 'AntiCardiolipinAntibodyIgG',
    sample_type: 'Serum',
    parameters: [
      { parameter_name: 'Result', value: '56.2', unit: '', normal_range: '' },
      { parameter_name: 'Comments', value: 'Repeat after 12 weeks if clinically indicated.', unit: '', normal_range: '' },
    ],
  }));
  assert.match(html, /<div class="test-title">ANTICARDIOLIPIN ANTIBODY IgG<\/div>/);
  assert.match(html, /ANTICARDIOLIPIN ANTIBODY IgG, SERUM/);
  assert.match(html, />56\.2<\/span>/);
  assert.match(html, /GPL-U\/mL/);
  assert.match(html, /&lt; 15\.0/);
  assert.match(html, /15\.0 - 39\.9 GPL-U\/mL/);
  assert.match(html, /40\.0 - 79\.9 GPL-U\/mL/);
  assert.match(html, /at least 12 weeks later/);
  assert.match(html, /lupus anticoagulant and anti-beta-2 glycoprotein I IgG\/IgM/);
  assert.match(html, /not a stand-alone diagnostic rule/);
  assert.match(html, /Repeat after 12 weeks if clinically indicated\./);

  const combined = buildReportHtml(sampleReport({
    name: 'Anti Cardiolipin Antibody IgG & IgM',
    parameters: [{ parameter_name: 'Result', value: 'Combined isotype result', unit: '', normal_range: '' }],
  }));
  assert.doesNotMatch(combined, /class="results-table single-analyte-table anticardiolipin-igg-table"/);
});

test('anticardiolipin IgM has a dedicated APS report without matching IgG or combined isotypes', () => {
  const html = buildReportHtml(sampleReport({
    name: 'AntiCardiolipinAntibodyIgM',
    sample_type: 'Serum',
    parameters: [
      { parameter_name: 'Result', value: '44.8', unit: '', normal_range: '' },
      { parameter_name: 'Comments', value: 'Correlate with the complete antiphospholipid profile.', unit: '', normal_range: '' },
    ],
  }));
  assert.match(html, /<div class="test-title">ANTICARDIOLIPIN ANTIBODY IgM<\/div>/);
  assert.match(html, /ANTICARDIOLIPIN ANTIBODY IgM, SERUM/);
  assert.match(html, />44\.8<\/span>/);
  assert.match(html, /MPL-U\/mL/);
  assert.match(html, /&lt; 15\.0/);
  assert.match(html, /15\.0 - 39\.9 MPL-U\/mL/);
  assert.match(html, /40\.0 - 79\.9 MPL-U\/mL/);
  assert.match(html, /at least 12 weeks later/);
  assert.match(html, /isolated low-level IgM result has a lower association with APS/);
  assert.match(html, /not a stand-alone diagnostic rule/);
  assert.match(html, /Correlate with the complete antiphospholipid profile\./);
  assert.doesNotMatch(html, /ANTICARDIOLIPIN ANTIBODY IgG, SERUM/);

  const combined = buildReportHtml(sampleReport({
    name: 'Anti Cardiolipin Antibody IgG & IgM',
    parameters: [{ parameter_name: 'Result', value: 'Combined isotype result', unit: '', normal_range: '' }],
  }));
  assert.doesNotMatch(combined, /class="results-table single-analyte-table anticardiolipin-igm-table"/);
});

test('Apolipoprotein B has a dedicated cardiovascular-risk report without matching ApoA1 profiles', () => {
  const html = buildReportHtml(sampleReport({
    name: 'Apolipoprotein B',
    sample_type: 'Serum',
    parameters: [
      { parameter_name: 'Result', value: '126', unit: '', normal_range: '' },
      { parameter_name: 'Comments', value: 'Interpret with the complete lipid profile.', unit: '', normal_range: '' },
    ],
  }));
  assert.match(html, /<div class="test-title">APOLIPOPROTEIN B \(APOB\)<\/div>/);
  assert.match(html, /APOLIPOPROTEIN B, SERUM/);
  assert.match(html, />126<\/span>/);
  assert.match(html, /mg\/dL/);
  assert.match(html, /&lt; 90/);
  assert.match(html, /90 - 99 mg\/dL/);
  assert.match(html, /100 - 119 mg\/dL/);
  assert.match(html, /120 - 139 mg\/dL/);
  assert.match(html, /reflects the number of circulating atherogenic lipoprotein particles/);
  assert.match(html, /not automatically the treatment target for every patient/);
  assert.match(html, /below 48 mg\/dL is unusually low/);
  assert.match(html, /Interpret with the complete lipid profile\./);

  const combined = buildReportHtml(sampleReport({
    name: 'Apolipoprotein A1 and B Profile',
    parameters: [
      { parameter_name: 'Apolipoprotein A1', value: '145', unit: 'mg/dL', normal_range: '> 120' },
      { parameter_name: 'Apolipoprotein B', value: '85', unit: 'mg/dL', normal_range: '< 90' },
    ],
  }));
  assert.doesNotMatch(combined, /class="results-table single-analyte-table apolipoprotein-b-table"/);
});

test('combined ascitic-fluid analysis separates cells and biochemistry with calculated PMN and SAAG', () => {
  const html = buildReportHtml(sampleReport({
    name: 'Ascitic Fluid (Cell Count,Biochemistry..)',
    sample_type: 'Ascitic Fluid',
    parameters: [
      { parameter_name: 'Specimen / Site', value: 'Diagnostic paracentesis', unit: '', normal_range: '' },
      { parameter_name: 'Appearance', value: 'Slightly cloudy', unit: '', normal_range: '' },
      { parameter_name: 'Colour', value: 'Straw coloured', unit: '', normal_range: '' },
      { parameter_name: 'Total Nucleated Cell Count', value: '1200', unit: 'cells/µL', normal_range: '' },
      { parameter_name: 'Red Blood Cell Count', value: '180', unit: 'cells/µL', normal_range: '' },
      { parameter_name: 'Neutrophils', value: '30', unit: '%', normal_range: '' },
      { parameter_name: 'Lymphocytes', value: '55', unit: '%', normal_range: '' },
      { parameter_name: 'Monocytes / Macrophages', value: '15', unit: '%', normal_range: '' },
      { parameter_name: 'Ascitic Fluid Albumin', value: '1.2', unit: 'g/dL', normal_range: '' },
      { parameter_name: 'Serum Albumin, Paired', value: '3.4', unit: 'g/dL', normal_range: '' },
      { parameter_name: 'Ascitic Fluid Total Protein', value: '2.1', unit: 'g/dL', normal_range: '' },
      { parameter_name: 'Ascitic Fluid Glucose', value: '94', unit: 'mg/dL', normal_range: '' },
      { parameter_name: 'Ascitic Fluid LDH', value: '88', unit: 'U/L', normal_range: '' },
      { parameter_name: 'Ascitic Fluid Amylase', value: '31', unit: 'U/L', normal_range: '' },
      { parameter_name: 'Impression', value: 'Interpret in the clinical context.', unit: '', normal_range: '' },
    ],
  }));
  assert.match(html, /<div class="test-title">ASCITIC FLUID ANALYSIS \(CELL COUNT & BIOCHEMISTRY\)<\/div>/);
  assert.match(html, /PHYSICAL EXAMINATION/);
  assert.match(html, /CELL COUNT &amp; DIFFERENTIAL/);
  assert.match(html, /BIOCHEMISTRY/);
  assert.match(html, /Diagnostic paracentesis/);
  assert.match(html, />360<\/span>\s*<span class="report-result-status high-val">At\/above SBP decision limit/);
  assert.match(html, />2\.20\s*<span class="report-result-status equivocal-val">Portal-hypertension pattern/);
  assert.match(html, /PMN count &ge; 250 cells\/&micro;L supports spontaneous bacterial peritonitis/);
  assert.match(html, /SAAG &ge; 1\.1 g\/dL supports portal-hypertensive ascites/);
  assert.match(html, /no universal healthy reference intervals/);
  assert.match(html, /Gram stain, bacterial culture, mycobacterial studies, ADA, and cytology are separate investigations/);

  for (const separateName of ['Ascitic Fluids (Cell Type & Cell Count)', 'AsciticFluidforProtein', 'Ascitic Fluids Gram Stain']) {
    const separate = buildReportHtml(sampleReport({ name: separateName, sample_type: 'Ascitic Fluid', parameters: [] }));
    assert.doesNotMatch(separate, /class="results-table ascitic-fluid-analysis-table"/);
  }
});

test('serum bicarbonate has a dedicated acid-base report without matching ABG or electrolyte panels', () => {
  const html = buildReportHtml(sampleReport({
    name: 'Bicarbonate (Hco3)',
    sample_type: 'Serum',
    parameters: [
      { parameter_name: 'Result', value: '18', unit: '', normal_range: '' },
      { parameter_name: 'Comments', value: 'Correlate with anion gap and blood gas when indicated.', unit: '', normal_range: '' },
    ],
  }));
  assert.match(html, /<div class="test-title">BICARBONATE \(HCO3\), SERUM<\/div>/);
  assert.match(html, /BICARBONATE \(HCO3\), SERUM/);
  assert.match(html, />18<\/span>/);
  assert.match(html, /22 - 29/);
  assert.match(html, /mmol\/L/);
  assert.match(html, /Age- and Sex-Specific Reference Intervals/);
  assert.match(html, /8 - 17 years<\/td><td>21 - 29/);
  assert.match(html, /bicarbonate result alone cannot identify the acid-base disorder/);
  assert.match(html, /calculated bicarbonate on a blood-gas analyser are related but are not interchangeable/);
  assert.match(html, /may produce a falsely decreased result/);
  assert.match(html, /Correlate with anion gap and blood gas when indicated\./);

  for (const separateName of ['Arterial Blood Gas', 'Serum Electrolytes']) {
    const separate = buildReportHtml(sampleReport({ name: separateName, sample_type: 'Blood', parameters: [] }));
    assert.doesNotMatch(separate, /class="results-table single-analyte-table serum-bicarbonate-table"/);
  }
});

test('bilirubin fractionation reports measured total/direct and calculated indirect without matching LFT or indirect-only tests', () => {
  const html = buildReportHtml(sampleReport({
    name: 'Bilirubin Total, Direct & Indirect',
    sample_type: 'Serum',
    parameters: [
      { parameter_name: 'Bilirubin Total, Serum', value: '3.2', unit: 'mg/dL', normal_range: '0.30 - 1.20' },
      { parameter_name: 'Bilirubin Direct, Serum', value: '2.1', unit: 'mg/dL', normal_range: '< 0.30' },
      { parameter_name: 'Bilirubin Indirect, Serum', value: '', unit: 'mg/dL', normal_range: '< 1.10' },
      { parameter_name: 'Comments', value: 'Correlate with liver enzymes and clinical findings.', unit: '', normal_range: '' },
    ],
  }));
  assert.match(html, /<div class="test-title">BILIRUBIN TOTAL, DIRECT & INDIRECT<\/div>/);
  assert.match(html, /class="results-table single-analyte-table bilirubin-fractionation-table"/);
  assert.match(html, /Bilirubin Total, Serum/);
  assert.match(html, /Bilirubin Direct, Serum/);
  assert.match(html, /Bilirubin Indirect, Serum/);
  assert.match(html, /Diazo \/ photometric/);
  assert.match(html, /Calculated: Total - Direct/);
  assert.match(html, />1\.10<\/span>/);
  assert.match(html, /0\.30 - 1\.20/);
  assert.match(html, /&lt; 0\.30/);
  assert.match(html, /&lt; 1\.10/);
  assert.match(html, /direct bilirubin assay measures conjugated bilirubin together with delta bilirubin/);
  assert.match(html, /predominantly indirect pattern/);
  assert.match(html, /predominantly direct pattern/);
  assert.match(html, /adult reference intervals must not be used to assess neonatal jaundice/);
  assert.match(html, /gross haemolysis can cause a falsely decreased direct bilirubin result/);
  assert.match(html, /Correlate with liver enzymes and clinical findings\./);

  const invalid = buildReportHtml(sampleReport({
    name: 'Bilirubin Fractionation',
    parameters: [
      { parameter_name: 'Total Bilirubin', value: '1.0', unit: 'mg/dL', normal_range: '0.0 - 1.2' },
      { parameter_name: 'Direct Bilirubin', value: '1.2', unit: 'mg/dL', normal_range: '< 0.3' },
    ],
  }));
  assert.match(invalid, /Direct bilirubin exceeds total bilirubin\. Verify the entered values/);

  for (const separateName of ['Indirect Bilirubin', 'Liver Function Test']) {
    const separate = buildReportHtml(sampleReport({ name: separateName, sample_type: 'Serum', parameters: [] }));
    assert.doesNotMatch(separate, /class="results-table single-analyte-table bilirubin-fractionation-table"/);
  }
});

test('medium-section biopsy uses a structured narrative histopathology report without inventing findings', () => {
  const html = buildReportHtml(sampleReport({
    name: 'Biopsy (Medium section)',
    sample_type: 'Tissue',
    parameters: [
      { parameter_name: 'Clinical History', value: 'Slow-growing left forearm lesion.', unit: '', normal_range: '' },
      { parameter_name: 'Specimen / Site', value: 'Left forearm, skin and subcutaneous tissue.', unit: '', normal_range: '' },
      { parameter_name: 'Procedure', value: 'Excision biopsy.', unit: '', normal_range: '' },
      { parameter_name: 'Fixative', value: '10% neutral buffered formalin.', unit: '', normal_range: '' },
      { parameter_name: 'Gross Description', value: 'Skin-covered tissue measuring 2.0 x 1.2 x 0.8 cm.', unit: '', normal_range: '' },
      { parameter_name: 'Blocks Submitted', value: 'A1-A3.', unit: '', normal_range: '' },
      { parameter_name: 'Microscopic Description', value: 'Sections show a circumscribed dermal lesion.', unit: '', normal_range: '' },
      { parameter_name: 'Final Diagnosis', value: 'Left forearm lesion: sample histopathological diagnosis.', unit: '', normal_range: '' },
      { parameter_name: 'Margins (If Applicable)', value: 'Sample margin statement.', unit: '', normal_range: '' },
      { parameter_name: 'Special Stains / IHC', value: 'Not performed.', unit: '', normal_range: '' },
      { parameter_name: 'Comment', value: 'Correlate with clinical findings.', unit: '', normal_range: '' },
    ],
  }));
  assert.match(html, /<div class="test-title">HISTOPATHOLOGY - BIOPSY \(MEDIUM SECTION\)<\/div>/);
  assert.match(html, /<div class="histopathology-report-body medium-biopsy-report-body"/);
  assert.match(html, /SURGICAL PATHOLOGY REPORT/);
  assert.match(html, /Specimen \/ Site:/);
  assert.match(html, /Excision biopsy\./);
  assert.match(html, /10% neutral buffered formalin\./);
  assert.match(html, /Final Diagnosis:/);
  assert.match(html, /sample histopathological diagnosis/);
  assert.match(html, /Gross Description:/);
  assert.match(html, /Microscopic Description:/);
  assert.match(html, /Margins \(If Applicable\):/);
  assert.match(html, /Special Stains \/ IHC:/);
  assert.match(html, /does not use a numerical normal range/);
  assert.match(html, /not applicable or not assessable in a limited biopsy/);
  assert.match(html, /Pending studies should be issued in an addendum or amended report/);

  const blankHtml = buildReportHtml(sampleReport({
    name: 'Biopsy (Medium Section)',
    sample_type: 'Tissue',
    parameters: [],
  }));
  assert.match(blankHtml, /Final Diagnosis:<\/div>\s*<div class="histopathology-content"[^>]*>-<\/div>/);
  assert.doesNotMatch(blankHtml, /benign|malignant|negative for malignancy/i);

  for (const separateName of ['Biopsy(SmallSection)', 'HistologyBiopsyPerSection', 'Liver Biopsy']) {
    const separate = buildReportHtml(sampleReport({ name: separateName, sample_type: 'Tissue', parameters: [] }));
    assert.doesNotMatch(separate, /<div class="histopathology-report-body medium-biopsy-report-body"/);
  }
});

test('small-section biopsy uses a limited-specimen histopathology report distinct from medium biopsy', () => {
  const html = buildReportHtml(sampleReport({
    name: 'Biopsy(SmallSection)',
    sample_type: 'Tissue',
    parameters: [
      { parameter_name: 'Clinical History', value: 'Small gastric mucosal lesion.', unit: '', normal_range: '' },
      { parameter_name: 'Specimen / Site', value: 'Gastric antrum biopsy.', unit: '', normal_range: '' },
      { parameter_name: 'Procedure', value: 'Endoscopic biopsy.', unit: '', normal_range: '' },
      { parameter_name: 'Fixative', value: '10% neutral buffered formalin.', unit: '', normal_range: '' },
      { parameter_name: 'Gross Description', value: 'Two pale-tan tissue fragments.', unit: '', normal_range: '' },
      { parameter_name: 'Blocks Submitted', value: 'A1, entirely submitted.', unit: '', normal_range: '' },
      { parameter_name: 'Microscopic Description', value: 'Sections show sampled gastric mucosa.', unit: '', normal_range: '' },
      { parameter_name: 'Final Diagnosis', value: 'Gastric antrum: sample histopathological diagnosis.', unit: '', normal_range: '' },
      { parameter_name: 'Adequacy / Limitations', value: 'Limited biopsy; correlate with endoscopic findings.', unit: '', normal_range: '' },
      { parameter_name: 'Margins (If Applicable)', value: 'Not applicable to this mucosal biopsy.', unit: '', normal_range: '' },
      { parameter_name: 'Special Stains / IHC', value: 'Not performed.', unit: '', normal_range: '' },
      { parameter_name: 'Comment', value: 'Clinical correlation advised.', unit: '', normal_range: '' },
    ],
  }));
  assert.match(html, /<div class="test-title">HISTOPATHOLOGY - BIOPSY \(SMALL SECTION\)<\/div>/);
  assert.match(html, /<div class="histopathology-report-body small-biopsy-report-body"/);
  assert.match(html, /SURGICAL PATHOLOGY REPORT/);
  assert.match(html, /Gastric antrum biopsy\./);
  assert.match(html, /Endoscopic biopsy\./);
  assert.match(html, /Final Diagnosis:/);
  assert.match(html, /sample histopathological diagnosis/);
  assert.match(html, /Gross Description:/);
  assert.match(html, /Microscopic Description:/);
  assert.match(html, /Adequacy \/ Limitations:/);
  assert.match(html, /Limited biopsy; correlate with endoscopic findings\./);
  assert.match(html, /Margins \(If Applicable\):/);
  assert.match(html, /Small or fragmented biopsies may not represent the entire lesion/);
  assert.match(html, /orientation, depth, crush artefact, and sampling limitations/);

  const blankHtml = buildReportHtml(sampleReport({
    name: 'Biopsy (Small Section)',
    sample_type: 'Tissue',
    parameters: [],
  }));
  assert.match(blankHtml, /Final Diagnosis:<\/div>\s*<div class="histopathology-content"[^>]*>-<\/div>/);
  assert.doesNotMatch(blankHtml, /benign|malignant|negative for malignancy/i);

  for (const separateName of ['Biopsy (Medium section)', 'HistologyBiopsyPerSection', 'Liver Biopsy']) {
    const separate = buildReportHtml(sampleReport({ name: separateName, sample_type: 'Tissue', parameters: [] }));
    assert.doesNotMatch(separate, /<div class="histopathology-report-body small-biopsy-report-body"/);
  }
});

test('blood culture and sensitivity uses a bloodstream-infection report rather than the AFB schema', () => {
  const html = buildReportHtml(sampleReport({
    name: 'BloodCulture&Sensitivity',
    sample_type: 'Blood',
    parameters: [
      { parameter_name: 'Culture Status / Result', value: 'Growth detected', unit: '', normal_range: 'No growth' },
      { parameter_name: 'Specimen / Collection Site', value: 'Peripheral blood, left antecubital vein', unit: '', normal_range: '' },
      { parameter_name: 'Collection Date / Time', value: '19-Sep-2026 08:30', unit: '', normal_range: '' },
      { parameter_name: 'Bottle / Set', value: 'Set 1: aerobic and anaerobic bottles', unit: '', normal_range: '' },
      { parameter_name: 'Culture System / Method', value: 'Automated continuous monitoring', unit: '', normal_range: '' },
      { parameter_name: 'Report Status', value: 'Final', unit: '', normal_range: '' },
      { parameter_name: 'Gram Stain', value: 'Gram-positive cocci in clusters', unit: '', normal_range: '' },
      { parameter_name: 'Time to Positivity', value: '13.4', unit: 'hours', normal_range: '' },
      { parameter_name: 'Organism Isolated', value: 'Sample organism', unit: '', normal_range: 'No growth' },
      { parameter_name: 'Identification Method', value: 'Automated identification', unit: '', normal_range: '' },
      { parameter_name: 'Antimicrobial Susceptibility', value: 'Antimicrobial A | MIC 1 | Susceptible\nAntimicrobial B | MIC 8 | Resistant', unit: '', normal_range: '' },
      { parameter_name: 'Resistance Markers / Alerts', value: 'Sample resistance alert', unit: '', normal_range: '' },
      { parameter_name: 'Comments', value: 'Critical result communicated according to laboratory policy.', unit: '', normal_range: '' },
    ],
  }));
  assert.match(html, /<div class="test-title">BLOOD CULTURE & SENSITIVITY<\/div>/);
  assert.match(html, /class="results-table culture-table blood-culture-table"/);
  assert.match(html, /Peripheral blood, left antecubital vein/);
  assert.match(html, /Gram-positive cocci in clusters/);
  assert.match(html, /Sample organism/);
  assert.match(html, /ANTIMICROBIAL SUSCEPTIBILITY/);
  assert.match(html, /Antimicrobial A \| MIC 1 \| Susceptible<br \/>Antimicrobial B \| MIC 8 \| Resistant/);
  assert.match(html, /true bloodstream infection or contamination/);
  assert.match(html, /negative culture does not completely exclude bloodstream infection/);
  assert.match(html, /An antimicrobial not reported must not be assumed susceptible/);
  assert.match(html, /Collection must not delay urgent treatment/);
  assert.doesNotMatch(html, /AFB CULTURE &amp; SENSITIVITY|mycobacterial/i);

  const bloodFallback = getFallbackReportParameters({ name: 'BloodCulture&Sensitivity', sample_type: 'Blood' });
  assert.equal(bloodFallback[0].parameterName, 'Culture Status / Result');
  assert.ok(bloodFallback.some(field => field.parameterName === 'Antimicrobial Susceptibility'));
  assert.ok(!bloodFallback.some(field => field.parameterName === 'AFB Culture Result'));
  const afbFallback = getFallbackReportParameters({ name: 'AFB Culture & Sensitivity', sample_type: 'Sputum' });
  assert.equal(afbFallback[0].parameterName, 'AFB Culture Result');

  for (const separateName of ['AFB Culture & Sensitivity', 'Blood Culture & Sensitivity (Conventional)', 'Blood Culture (Rapid Bactec method)']) {
    const separate = buildReportHtml(sampleReport({ name: separateName, sample_type: 'Blood', parameters: [] }));
    assert.doesNotMatch(separate, /class="results-table culture-table blood-culture-table"/);
  }
});

test('body-fluid culture and sensitivity uses a sterile-fluid microbiology report rather than the AFB schema', () => {
  const html = buildReportHtml(sampleReport({
    name: 'BodyFluid Culture &Sensitivity',
    sample_type: 'Body Fluid',
    parameters: [
      { parameter_name: 'Culture Status / Result', value: 'Growth detected', unit: '', normal_range: 'No growth' },
      { parameter_name: 'Fluid Type / Source', value: 'Pleural fluid', unit: '', normal_range: '' },
      { parameter_name: 'Anatomic Site / Collection Procedure', value: 'Left hemithorax, thoracentesis', unit: '', normal_range: '' },
      { parameter_name: 'Collection Date / Time', value: '19-Sep-2026 11:10', unit: '', normal_range: '' },
      { parameter_name: 'Report Status', value: 'Final', unit: '', normal_range: '' },
      { parameter_name: 'Direct Gram Stain', value: 'Many polymorphs; Gram-positive cocci seen', unit: '', normal_range: 'No organisms seen' },
      { parameter_name: 'Aerobic Culture', value: 'Growth after incubation', unit: '', normal_range: 'No growth' },
      { parameter_name: 'Anaerobic Culture', value: 'No anaerobes isolated', unit: '', normal_range: 'No growth' },
      { parameter_name: 'Organism(s) Isolated', value: 'Sample organism', unit: '', normal_range: 'No growth' },
      { parameter_name: 'Identification Method', value: 'MALDI-TOF mass spectrometry', unit: '', normal_range: '' },
      { parameter_name: 'Antimicrobial Susceptibility', value: 'Antimicrobial A | MIC 1 | Susceptible\nAntimicrobial B | MIC 8 | Resistant', unit: '', normal_range: '' },
      { parameter_name: 'Resistance Markers / Alerts', value: 'Sample resistance alert', unit: '', normal_range: '' },
      { parameter_name: 'Comments', value: 'Correlate with clinical and radiological findings.', unit: '', normal_range: '' },
    ],
  }));
  assert.match(html, /<div class="test-title">BODY FLUID CULTURE & SENSITIVITY<\/div>/);
  assert.match(html, /class="results-table culture-table body-fluid-culture-table"/);
  assert.match(html, /Pleural fluid/);
  assert.match(html, /Left hemithorax, thoracentesis/);
  assert.match(html, /DIRECT EXAMINATION/);
  assert.match(html, /Gram-positive cocci seen/);
  assert.match(html, /BACTERIAL CULTURE/);
  assert.match(html, /Sample organism/);
  assert.match(html, /ANTIMICROBIAL SUSCEPTIBILITY/);
  assert.match(html, /Antimicrobial A \| MIC 1 \| Susceptible<br \/>Antimicrobial B \| MIC 8 \| Resistant/);
  assert.match(html, /No growth does not completely exclude infection/);
  assert.match(html, /No organisms seen on direct Gram stain does not exclude a positive culture/);
  assert.match(html, /An antimicrobial not reported must not be assumed susceptible/);
  assert.match(html, /Fungal and mycobacterial cultures require separate methods/);
  assert.doesNotMatch(html, /AFB CULTURE &amp; SENSITIVITY|mycobacterial culture result/i);

  const fallback = getFallbackReportParameters({ name: 'BodyFluid Culture &Sensitivity', sample_type: 'Body Fluid' });
  assert.equal(fallback[0].parameterName, 'Culture Status / Result');
  assert.ok(fallback.some(field => field.parameterName === 'Direct Gram Stain'));
  assert.ok(fallback.some(field => field.parameterName === 'Antimicrobial Susceptibility'));
  assert.ok(!fallback.some(field => field.parameterName === 'AFB Culture Result'));

  for (const separateName of ['AFB Culture & Sensitivity', 'BloodCulture&Sensitivity', 'FungusCulture&Sensitivity', 'PusCulture&Sensitivity', 'Seminal Fluidfor Culture&Sensitivity', 'Sputum Culture & Sensitivity', 'CSF Culture']) {
    const separate = buildReportHtml(sampleReport({ name: separateName, sample_type: 'Body Fluid', parameters: [] }));
    assert.doesNotMatch(separate, /class="results-table culture-table body-fluid-culture-table"/);
  }
});

test('body-fluid total protein uses fluid-specific interpretation and an optional calculated serum ratio', () => {
  const html = buildReportHtml(sampleReport({
    name: 'Body Fluides for Proein',
    sample_type: 'Body Fluid',
    parameters: [
      { parameter_name: 'Total Protein, Body Fluid', value: '3.8', unit: 'g/dL', normal_range: 'Interpretive / fluid-specific' },
      { parameter_name: 'Fluid Type / Source', value: 'Pleural fluid, right hemithorax', unit: '', normal_range: '' },
      { parameter_name: 'Collection Date / Time', value: '19-Sep-2026 09:15', unit: '', normal_range: '' },
      { parameter_name: 'Appearance', value: 'Straw coloured', unit: '', normal_range: '' },
      { parameter_name: 'Paired Serum Total Protein', value: '6.8', unit: 'g/dL', normal_range: '' },
      { parameter_name: 'Fluid / Serum Protein Ratio', value: '', unit: '', normal_range: 'Pleural fluid: > 0.50 supports exudate (one Light criterion)' },
      { parameter_name: 'Comments', value: 'Interpret with paired LDH results.', unit: '', normal_range: '' },
    ],
  }));
  assert.match(html, /<div class="test-title">TOTAL PROTEIN, BODY FLUID<\/div>/);
  assert.match(html, /class="results-table single-analyte-table body-fluid-protein-table"/);
  assert.match(html, /Pleural fluid, right hemithorax/);
  assert.match(html, /TOTAL PROTEIN, BODY FLUID/);
  assert.match(html, />3\.8<\/td>/);
  assert.match(html, /Calculated: fluid protein &divide; paired serum protein/);
  assert.match(html, />0\.56<\/td>/);
  assert.match(html, /Above 0\.50/);
  assert.match(html, /no single normal reference interval for total protein across all body fluids/);
  assert.match(html, /only one component of Light&rsquo;s criteria/);
  assert.match(html, /serum-ascites albumin gradient \(SAAG\)/);
  assert.match(html, /Cerebrospinal fluid requires a dedicated CSF protein assay/);
  assert.match(html, /Interpret with paired LDH results\./);

  for (const separateName of ['AsciticFluidforProtein', 'CSFFluidforProtein', 'Joint Fluid for Protein', 'Peritonial Fluid Protein', 'Pleural Fluid for Protein']) {
    const separate = buildReportHtml(sampleReport({ name: separateName, sample_type: 'Body Fluid', parameters: [] }));
    assert.doesNotMatch(separate, /class="results-table single-analyte-table body-fluid-protein-table"/);
  }
});

test('body-fluid chloride uses a source-specific electrolyte report without borrowing serum or CSF ranges', () => {
  const html = buildReportHtml(sampleReport({
    name: 'Body Fluids for Chloride',
    sample_type: 'Body Fluid',
    parameters: [
      { parameter_name: 'Chloride, Body Fluid', value: '108', unit: 'mmol/L', normal_range: 'Interpretive / fluid-specific' },
      { parameter_name: 'Fluid Type / Source', value: 'Pleural fluid, left hemithorax', unit: '', normal_range: '' },
      { parameter_name: 'Collection Date / Time', value: '19-Sep-2026 10:20', unit: '', normal_range: '' },
      { parameter_name: 'Appearance', value: 'Clear, pale yellow', unit: '', normal_range: '' },
      { parameter_name: 'Method / Analyzer', value: 'Ion-selective electrode', unit: '', normal_range: '' },
      { parameter_name: 'Comments', value: 'Interpret with the complete fluid analysis.', unit: '', normal_range: '' },
    ],
  }));
  assert.match(html, /<div class="test-title">CHLORIDE, BODY FLUID<\/div>/);
  assert.match(html, /class="results-table single-analyte-table body-fluid-chloride-table"/);
  assert.match(html, /Pleural fluid, left hemithorax/);
  assert.match(html, /CHLORIDE, BODY FLUID/);
  assert.match(html, />108<\/span>/);
  assert.match(html, /Ion-selective electrode/);
  assert.match(html, /No general reference interval has been established for chloride across all body-fluid types/);
  assert.match(html, /Serum or plasma chloride reference intervals must not be applied directly/);
  assert.match(html, /Cerebrospinal fluid should be reported under a dedicated CSF chloride assay/);
  assert.match(html, /Interpret with the complete fluid analysis\./);

  const fallback = getFallbackReportParameters({ name: 'Body Fluids for Chloride', sample_type: 'Body Fluid' });
  assert.equal(fallback[0].parameterName, 'Chloride, Body Fluid');
  assert.equal(fallback[0].unit, 'mmol/L');
  assert.ok(fallback.some(field => field.parameterName === 'Fluid Type / Source'));

  for (const separateName of ['CSFFluidfor Chloride', 'JointFluidforChloride', 'Peritonial Fluid Chloride', 'Serum Chloride']) {
    const separate = buildReportHtml(sampleReport({ name: separateName, sample_type: 'Body Fluid', parameters: [] }));
    assert.doesNotMatch(separate, /class="results-table single-analyte-table body-fluid-chloride-table"/);
  }
});

test('bone marrow cytology uses a structured aspirate morphology report without changing the separate aspiration test', () => {
  const html = buildReportHtml(sampleReport({
    name: 'Bone Marrow Cytology',
    sample_type: 'Bone Marrow Aspirate',
    parameters: [
      { parameter_name: 'Specimen / Aspirate Site', value: 'Bone marrow aspirate, posterior iliac crest' },
      { parameter_name: 'Collection Date / Time', value: '19-Sep-2026 12:00' },
      { parameter_name: 'Clinical Details / Indication', value: 'Sample indication for morphology review.' },
      { parameter_name: 'Aspirate Quality / Adequacy', value: 'Particulate aspirate; adequate for morphologic assessment.' },
      { parameter_name: 'Peripheral Blood Counts', value: 'Hb: sample; WBC: sample; Platelets: sample' },
      { parameter_name: 'Peripheral Blood Smear', value: 'Sample peripheral smear description.' },
      { parameter_name: 'Marrow Particles / Cellularity', value: 'Sample cellularity description.' },
      { parameter_name: 'Nucleated Differential / Myelogram', value: 'Myeloid precursors: sample\nErythroid precursors: sample' },
      { parameter_name: 'Total Nucleated Cells Counted', value: '500', unit: 'cells' },
      { parameter_name: 'Myeloid : Erythroid Ratio', value: '2.4 : 1' },
      { parameter_name: 'Blasts (%)', value: '1.5', unit: '%' },
      { parameter_name: 'Erythropoiesis', value: 'Sample erythroid morphology.' },
      { parameter_name: 'Granulopoiesis / Myelopoiesis', value: 'Sample myeloid morphology.' },
      { parameter_name: 'Megakaryocytes', value: 'Sample megakaryocyte morphology.' },
      { parameter_name: 'Lymphocytes / Plasma Cells', value: 'Sample lymphoid and plasma-cell description.' },
      { parameter_name: 'Other / Abnormal Cells or Infiltrates', value: 'Sample abnormal-cell assessment.' },
      { parameter_name: 'Detailed Morphologic Description', value: 'Sample integrated morphology description.' },
      { parameter_name: 'Iron Stain / Stores', value: 'Sample iron-stain result.' },
      { parameter_name: 'Cytochemistry / Ancillary Studies', value: 'Flow cytometry pending.' },
      { parameter_name: 'Interpretation / Morphologic Diagnosis', value: 'Sample morphology-based conclusion.' },
      { parameter_name: 'Recommendations / Pending Studies', value: 'Correlate with pending ancillary studies.' },
      { parameter_name: 'Limitations / Notes', value: 'Interpret within the stated specimen limitations.' },
      { parameter_name: 'Comments', value: 'Sample final comment.' },
    ],
  }));
  assert.match(html, /<div class="test-title">BONE MARROW ASPIRATE - CYTOLOGY<\/div>/);
  assert.match(html, /class="bone-marrow-cytology-report"/);
  assert.match(html, /PERIPHERAL BLOOD CORRELATION/);
  assert.match(html, /Nucleated Differential \/ Myelogram/);
  assert.match(html, /Myeloid : Erythroid Ratio/);
  assert.match(html, /Blasts/);
  assert.match(html, /Sample megakaryocyte morphology/);
  assert.match(html, /Iron Stain \/ Stores/);
  assert.match(html, /Interpretation \/ Morphologic Diagnosis/);
  assert.match(html, /Aspirate and biopsy specimens provide complementary information/);
  assert.match(html, /haemodilute aspirate, blood tap, dry tap/);
  assert.match(html, /flow cytometry, cytogenetic, molecular/);

  const fallback = getFallbackReportParameters({ name: 'Bone Marrow Cytology', sample_type: 'Bone Marrow Aspirate' });
  assert.equal(fallback[0].parameterName, 'Specimen / Aspirate Site');
  assert.ok(fallback.some(field => field.parameterName === 'Nucleated Differential / Myelogram'));
  assert.ok(fallback.some(field => field.parameterName === 'Blasts (%)'));
  assert.ok(fallback.some(field => field.parameterName === 'Interpretation / Morphologic Diagnosis'));

  const separate = buildReportHtml(sampleReport({ name: 'BoneMarrowAspiration&Cytology', sample_type: 'Bone Marrow Aspirate', parameters: [] }));
  assert.doesNotMatch(separate, /class="bone-marrow-cytology-report"/);
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
    const tests = await query('SELECT id,name,code,category,sample_type,report_body FROM tests WHERE active=1');
    const params = await query('SELECT * FROM test_parameters ORDER BY display_order,id');
    for (const t of tests) {
      const input = { ...t, parameters: params.filter(p => p.test_id === t.id).map(p => ({ ...p, value: '' })) };
      if (isBillingOnlyTest(input)) {
        assert.throws(() => buildReportHtml(sampleReport(input)), /Billing only/);
        continue;
      }
      const oldHtml = baseline.exports.buildReportHtml(sampleReport(input));
      const newHtml = buildReportHtml(sampleReport(input));
      assert.equal(newHtml.match(/<style>[\s\S]*?<\/style>/)[0], oldHtml.match(/<style>[\s\S]*?<\/style>/)[0]);
      // Named combinations now display all requested components, not TLC alone.
      const normalizedInputName = String(input.name).toLowerCase().replace(/[^a-z0-9]/g, '');
      const isActh = normalizedInputName === 'acth'
        || normalizedInputName === 'acthplasma'
        || normalizedInputName.includes('adrenocortic');
      const isAda = normalizedInputName === 'ada'
        || normalizedInputName.includes('adenosinedeaminase')
        || normalizedInputName.endsWith('forada');
      const isAfbZiehlNeelsen = normalizedInputName === 'afbznstain'
        || normalizedInputName === 'afbziehlneelsenstain';
      const isAlbertStainKlb = normalizedInputName === 'albertstainofsmearsforklb'
        || normalizedInputName === 'albertstainofsmearforklb'
        || normalizedInputName === 'albertstainforklb';
      const isAgRatio = normalizedInputName === 'agratio'
        || normalizedInputName === 'albuminglobulinratio';
      const isAnfQualitative = normalizedInputName === 'anfantinuclearfactorqualitative'
        || normalizedInputName === 'anfantinudearfactorqualitative'
        || normalizedInputName === 'antinuclearfactoranfqualitative';
      const isProstaticAcidPhosphatase = normalizedInputName === 'acidphosphataseprostatepap'
        || normalizedInputName === 'acidphosphataseprostaticpap'
        || normalizedInputName === 'prostaticacidphosphatasepap';
      const isTotalAcidPhosphatase = normalizedInputName === 'acidphosphatasetotal'
        || normalizedInputName === 'totalacidphosphatase';
      const isUrineAlcohol = normalizedInputName === 'alcoholurine'
        || normalizedInputName === 'urinealcohol'
        || normalizedInputName === 'ethanolurine'
        || normalizedInputName === 'ethylalcoholurine';
      const isAldehydeTest = normalizedInputName === 'aldehydetestat'
        || normalizedInputName === 'aldehydetest'
        || normalizedInputName === 'napieraldehydetest'
        || normalizedInputName === 'formolgeltest';
      const isAldosterone = normalizedInputName === 'aldosterone'
        || normalizedInputName === 'aldosteroneserum'
        || normalizedInputName === 'serumaldosterone';
      const isBloodAllergy = normalizedInputName === 'allergyblood'
        || normalizedInputName === 'bloodallergy'
        || normalizedInputName === 'allergenspecificigepanel';
      const isDrugAllergy = normalizedInputName === 'allergydrug'
        || normalizedInputName === 'drugallergy'
        || normalizedInputName === 'drugspecificige';
      const isRandomUrineAlphaAmylase = normalizedInputName === 'alphaamylaseurine'
        || normalizedInputName === 'amylaserandomurine'
        || normalizedInputName === 'randomurineamylase';
      const isAmmonia = normalizedInputName === 'ammonia'
        || normalizedInputName === 'ammoniaplasma'
        || normalizedInputName === 'plasmaammonia';
      const isAndrogenPanel = normalizedInputName === 'androgenstestosteronedheas'
        || normalizedInputName === 'androgenstestosteronedheasprofile'
        || normalizedInputName === 'testosteronedheaspanel'
        || normalizedInputName === 'testosteroneanddheaspanel';
      const isAndrostenedione = normalizedInputName === 'androsteindionea4'
        || normalizedInputName === 'androstenedionea4'
        || normalizedInputName === 'androstenedione'
        || normalizedInputName === '4androstenedione'
        || normalizedInputName === 'delta4androstenedione';
      const isComprehensiveAnemia = normalizedInputName === 'anemiacomprehenssiveprofilefd'
        || normalizedInputName === 'anemiacomprehensiveprofile'
        || normalizedInputName === 'anaemiacomprehensiveprofile'
        || normalizedInputName === 'comprehensiveanemiaprofile'
        || normalizedInputName === 'comprehensiveanaemiaprofile';
      const isAnemiaScreening = normalizedInputName === 'anemiascreeningprofile'
        || normalizedInputName === 'anaemiascreeningprofile'
        || normalizedInputName === 'anemiascreen'
        || normalizedInputName === 'anaemiascreen';
      const isAntiTpo = normalizedInputName === 'antitpoantithyroidperoxidase'
        || normalizedInputName === 'antitpoantithyroidperoxidaseantibody'
        || normalizedInputName === 'antithyroidperoxidase'
        || normalizedInputName === 'thyroidperoxidaseantibody'
        || normalizedInputName === 'thyroperoxidaseantibodies';
      const isAntiTg = normalizedInputName === 'antitgantithyroglobulin'
        || normalizedInputName === 'antitgantithyroglobulinantibody'
        || normalizedInputName === 'antithyroglobulin'
        || normalizedInputName === 'thyroglobulinantibody'
        || normalizedInputName === 'thyroglobulinantibodies';
      const isAnticardiolipinIgg = normalizedInputName === 'anticardiolipinantibodyigg'
        || normalizedInputName === 'anticardiolipinigg'
        || normalizedInputName === 'cardiolipinantibodyigg'
        || normalizedInputName === 'phospholipidcardiolipinantibodiesigg';
      const isAnticardiolipinIgm = normalizedInputName === 'anticardiolipinantibodyigm'
        || normalizedInputName === 'anticardiolipinigm'
        || normalizedInputName === 'cardiolipinantibodyigm'
        || normalizedInputName === 'phospholipidcardiolipinantibodiesigm';
      const isApolipoproteinB = normalizedInputName === 'apolipoproteinb'
        || normalizedInputName === 'apolipoproteinb100'
        || normalizedInputName === 'apob'
        || normalizedInputName === 'apob100';
      const isAsciticFluidAnalysis = normalizedInputName === 'asciticfluidcellcountbiochemistry'
        || normalizedInputName === 'asciticfluidanalysiscellcountbiochemistry'
        || normalizedInputName === 'peritonealfluidcellcountbiochemistry';
      const isSerumBicarbonate = normalizedInputName === 'bicarbonatehco3'
        || normalizedInputName === 'bicarbonateserum'
        || normalizedInputName === 'serumbicarbonate'
        || normalizedInputName === 'totalco2serum';
      const isBilirubinFractionation = normalizedInputName === 'bilirubintotaldirectindirect'
        || normalizedInputName === 'totaldirectindirectbilirubin'
        || normalizedInputName === 'bilirubinfractionation';
      const isMediumSectionBiopsy = normalizedInputName === 'biopsymediumsection'
        || normalizedInputName === 'mediumsectionbiopsy';
      const isSmallSectionBiopsy = normalizedInputName === 'biopsysmallsection'
        || normalizedInputName === 'smallsectionbiopsy';
      const isBloodCultureSensitivity = normalizedInputName === 'bloodculturesensitivity'
        || normalizedInputName === 'bloodcultureandsensitivity';
      const isBodyFluidCultureSensitivity = normalizedInputName === 'bodyfluidculturesensitivity'
        || normalizedInputName === 'bodyfluidcultureandsensitivity'
        || normalizedInputName === 'sterilebodyfluidculturesensitivity'
        || normalizedInputName === 'sterilebodyfluidcultureandsensitivity';
      const isBodyFluidTotalProtein = normalizedInputName === 'bodyfluidesforproein'
        || normalizedInputName === 'bodyfluidsforprotein'
        || normalizedInputName === 'bodyfluidforprotein'
        || normalizedInputName === 'totalproteinbodyfluid';
      const isBodyFluidChloride = normalizedInputName === 'bodyfluidsforchloride'
        || normalizedInputName === 'bodyfluidforchloride'
        || normalizedInputName === 'chloridebodyfluid'
        || normalizedInputName === 'bodyfluidchloride';
      const isBoneMarrowCytology = normalizedInputName === 'bonemarrowcytology';
      const isTimedUrineAmylase = normalizedInputName === 'amylase24hrsurine'
        || normalizedInputName === 'amylase24hoururine'
        || normalizedInputName === 'amylase24hurine'
        || normalizedInputName === '24hoururineamylase';
      if (isActh || isAda || isAfbZiehlNeelsen || isAlbertStainKlb || isAgRatio || isAnfQualitative || isProstaticAcidPhosphatase || isTotalAcidPhosphatase || isUrineAlcohol || isAldehydeTest || isAldosterone || isBloodAllergy || isDrugAllergy || isRandomUrineAlphaAmylase || isTimedUrineAmylase || isAmmonia || isAndrogenPanel || isAndrostenedione || isComprehensiveAnemia || isAnemiaScreening || isAntiTpo || isAntiTg || isAnticardiolipinIgg || isAnticardiolipinIgm || isApolipoproteinB || isAsciticFluidAnalysis || isSerumBicarbonate || isBilirubinFractionation || isMediumSectionBiopsy || isSmallSectionBiopsy || isBloodCultureSensitivity || isBodyFluidCultureSensitivity || isBodyFluidTotalProtein || isBodyFluidChloride || isBoneMarrowCytology) {
        if (isBoneMarrowCytology) {
          assert.match(newHtml, /BONE MARROW ASPIRATE - CYTOLOGY/);
          assert.match(newHtml, /Nucleated Differential \/ Myelogram/);
          assert.match(newHtml, /Myeloid : Erythroid Ratio/);
          assert.match(newHtml, /Iron Stain \/ Stores/);
          assert.match(newHtml, /Aspirate and biopsy specimens provide complementary information/);
          continue;
        }
        if (isBodyFluidCultureSensitivity) {
          assert.match(newHtml, /BODY FLUID CULTURE & SENSITIVITY/);
          assert.match(newHtml, /Direct Gram Stain/);
          assert.match(newHtml, /Aerobic Culture/);
          assert.match(newHtml, /ANTIMICROBIAL SUSCEPTIBILITY/);
          assert.match(newHtml, /No growth does not completely exclude infection/);
          assert.doesNotMatch(newHtml, /AFB CULTURE &amp; SENSITIVITY/);
          continue;
        }
        if (isBodyFluidChloride) {
          assert.match(newHtml, /CHLORIDE, BODY FLUID/);
          assert.match(newHtml, /Fluid Type \/ Source/);
          assert.match(newHtml, /No general reference interval has been established/);
          assert.match(newHtml, /dedicated CSF chloride assay/);
          continue;
        }
        if (isBodyFluidTotalProtein) {
          assert.match(newHtml, /TOTAL PROTEIN, BODY FLUID/);
          assert.match(newHtml, /Fluid \/ Serum Protein Ratio/);
          assert.match(newHtml, /no single normal reference interval/);
          assert.match(newHtml, /Cerebrospinal fluid requires a dedicated CSF protein assay/);
          continue;
        }
        if (isBloodCultureSensitivity) {
          assert.match(newHtml, /BLOOD CULTURE & SENSITIVITY/);
          assert.match(newHtml, /Culture Status \/ Result/);
          assert.match(newHtml, /ANTIMICROBIAL SUSCEPTIBILITY/);
          assert.match(newHtml, /negative culture does not completely exclude bloodstream infection/);
          assert.doesNotMatch(newHtml, /AFB CULTURE &amp; SENSITIVITY/);
          continue;
        }
        if (isSmallSectionBiopsy) {
          assert.match(newHtml, /HISTOPATHOLOGY - BIOPSY \(SMALL SECTION\)/);
          assert.match(newHtml, /SURGICAL PATHOLOGY REPORT/);
          assert.match(newHtml, /Final Diagnosis:/);
          assert.match(newHtml, /Adequacy \/ Limitations:/);
          assert.match(newHtml, /Small or fragmented biopsies may not represent the entire lesion/);
          continue;
        }
        if (isMediumSectionBiopsy) {
          assert.match(newHtml, /HISTOPATHOLOGY - BIOPSY \(MEDIUM SECTION\)/);
          assert.match(newHtml, /SURGICAL PATHOLOGY REPORT/);
          assert.match(newHtml, /Final Diagnosis:/);
          assert.match(newHtml, /Gross Description:/);
          assert.match(newHtml, /Microscopic Description:/);
          assert.match(newHtml, /does not use a numerical normal range/);
          continue;
        }
        if (isBilirubinFractionation) {
          assert.match(newHtml, /BILIRUBIN FRACTIONATION/);
          assert.match(newHtml, /Bilirubin Total, Serum/);
          assert.match(newHtml, /Bilirubin Direct, Serum/);
          assert.match(newHtml, /Bilirubin Indirect, Serum/);
          assert.match(newHtml, /Indirect bilirubin is calculated/);
          continue;
        }
        if (isSerumBicarbonate) {
          assert.match(newHtml, /BICARBONATE \(HCO3\), SERUM/);
          assert.match(newHtml, /bicarbonate result alone cannot identify the acid-base disorder/);
          assert.match(newHtml, /falsely decreased result/);
          continue;
        }
        if (isAsciticFluidAnalysis) {
          assert.match(newHtml, /ASCITIC FLUID ANALYSIS/);
          assert.match(newHtml, /Absolute PMN Count/);
          assert.match(newHtml, /Serum-Ascites Albumin Gradient \(SAAG\)/);
          assert.match(newHtml, /no universal healthy reference intervals/);
          continue;
        }
        if (isApolipoproteinB) {
          assert.match(newHtml, /APOLIPOPROTEIN B, SERUM/);
          assert.match(newHtml, /number of circulating atherogenic lipoprotein particles/);
          assert.match(newHtml, /not automatically the treatment target for every patient/);
          continue;
        }
        if (isAnticardiolipinIgm) {
          assert.match(newHtml, /ANTICARDIOLIPIN ANTIBODY IgM, SERUM/);
          assert.match(newHtml, /isolated low-level IgM result has a lower association with APS/);
          assert.doesNotMatch(newHtml, /ANTICARDIOLIPIN ANTIBODY IgG, SERUM/);
          continue;
        }
        if (isAnticardiolipinIgg) {
          assert.match(newHtml, /ANTICARDIOLIPIN ANTIBODY IgG, SERUM/);
          assert.match(newHtml, /at least 12 weeks later/);
          assert.match(newHtml, /not a stand-alone diagnostic rule/);
          continue;
        }
        if (isAntiTg) {
          assert.match(newHtml, /ANTI-TG ANTIBODY, SERUM/);
          assert.match(newHtml, /can interfere with thyroglobulin measurements/);
          assert.doesNotMatch(newHtml, /ANTI-TPO ANTIBODY, SERUM/);
          continue;
        }
        if (isAntiTpo) {
          assert.match(newHtml, /ANTI-TPO ANTIBODY, SERUM/);
          assert.match(newHtml, /does not show whether the thyroid is currently underactive, normal, or overactive/);
          assert.doesNotMatch(newHtml, /ANTI - Tg, SERUM/);
          continue;
        }
        if (isAnemiaScreening) {
          assert.match(newHtml, /ANEMIA SCREENING PROFILE/);
          assert.match(newHtml, /IRON SCREEN \(SERUM\)/);
          assert.match(newHtml, /comprehensive anaemia profile or targeted testing/);
          continue;
        }
        if (isComprehensiveAnemia) {
          assert.match(newHtml, /COMPREHENSIVE ANEMIA PROFILE/);
          assert.match(newHtml, /IRON STATUS \(SERUM\)/);
          assert.match(newHtml, /ferritin.*acute-phase reactant/i);
          continue;
        }
        if (isAndrostenedione) {
          assert.match(newHtml, /ANDROSTENEDIONE \(A4\), SERUM/);
          assert.match(newHtml, /congenital adrenal hyperplasia/);
          assert.match(newHtml, /should not be used alone to diagnose/);
          continue;
        }
        if (isAndrogenPanel) {
          assert.match(newHtml, /ANDROGEN PROFILE \(TESTOSTERONE & DHEA-S\)/);
          assert.match(newHtml, /repeat morning fasting total testosterone measurement/);
          assert.match(newHtml, /DHEA-S, SERUM/);
          continue;
        }
        if (isTimedUrineAmylase) {
          assert.match(newHtml, /AMYLASE EXCRETION, 24-HOUR URINE/);
          assert.match(newHtml, /incomplete collection can invalidate the calculated excretion rate/);
          continue;
        }
        if (isAmmonia) {
          assert.match(newHtml, /AMMONIA, PLASMA/);
          assert.match(newHtml, /can cause a falsely increased result/);
          continue;
        }
        if (isRandomUrineAlphaAmylase) {
          assert.match(newHtml, /ALPHA AMYLASE, RANDOM URINE/);
          assert.match(newHtml, /must not be interpreted using a timed or 24-hour urine excretion interval/);
          continue;
        }
        if (isDrugAllergy) {
          assert.match(newHtml, /DRUG-SPECIFIC IgE, SERUM/);
          assert.match(newHtml, /does not exclude drug allergy/);
          continue;
        }
        if (isBloodAllergy) {
          assert.match(newHtml, /ALLERGEN-SPECIFIC IgE, SERUM/);
          assert.match(newHtml, /Total IgE is a separate measurement/);
          continue;
        }
        if (isAldosterone) {
          assert.match(newHtml, /ALDOSTERONE, SERUM/);
          assert.match(newHtml, /single aldosterone result is not diagnostic/);
          continue;
        }
        if (isAldehydeTest) {
          assert.match(newHtml, /NAPIER&rsquo;S ALDEHYDE TEST \(FORMOL-GEL TEST\)/);
          assert.match(newHtml, /does not confirm visceral leishmaniasis/);
          continue;
        }
        if (isUrineAlcohol) {
          assert.match(newHtml, /ETHANOL \(ALCOHOL\), URINE/);
          assert.match(newHtml, /does not establish the degree of intoxication or impairment/);
          continue;
        }
        if (isAlbertStainKlb) {
          assert.match(newHtml, /ALBERT STAIN FOR KLEBS&ndash;L&Ouml;FFLER BACILLI \(KLB\)/);
          assert.match(newHtml, /Microscopy alone does not confirm/);
          continue;
        }
        if (isTotalAcidPhosphatase) {
          assert.match(newHtml, /ACID PHOSPHATASE, TOTAL, SERUM/);
          assert.match(newHtml, /distinct from the prostatic acid phosphatase \(PAP\) fraction/);
          continue;
        }
        if (isProstaticAcidPhosphatase) {
          assert.match(newHtml, /PROSTATIC ACID PHOSPHATASE \(PAP\), SERUM/);
          assert.match(newHtml, /PAP is not a screening test for prostate cancer/);
          continue;
        }
        if (isAnfQualitative) {
          assert.match(newHtml, /ANTINUCLEAR FACTOR \(ANF\) \/ ANTINUCLEAR ANTIBODY \(ANA\), QUALITATIVE/);
          assert.match(newHtml, /A positive result alone does not diagnose a specific disease/);
          continue;
        }
        if (isAgRatio) {
          assert.match(newHtml, /ALBUMIN \/ GLOBULIN RATIO \(A\/G\)/);
          assert.match(newHtml, /Globulin = Total Protein/);
          continue;
        }
        if (isAda) {
          assert.match(newHtml, /ADENOSINE DEAMINASE \(ADA\) ACTIVITY/);
          assert.match(newHtml, /Raised fluid ADA is not specific for tuberculosis/);
          continue;
        }
        if (isAfbZiehlNeelsen) {
          assert.match(newHtml, /ACID-FAST BACILLI \(AFB\), ZIEHL-NEELSEN STAIN/);
          assert.match(newHtml, /A negative smear does not exclude tuberculosis/);
          continue;
        }
        assert.match(newHtml, /ADRENOCORTICOTROPIC HORMONE \(ACTH\), PLASMA/);
        assert.match(newHtml, /Specimen &amp; Collection Note/);
        continue;
      }
      if (getCombinationDefinition(input) || getCellReportDefinition(input)) {
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

test('new cell tests get useful fields without guessed fluid reference intervals', () => {
  for (const definition of CELL_REPORT_DEFINITIONS) {
    const fields = getFallbackReportParameters({ name: definition.names[0], sample_type: definition.sampleType });
    assert.deepEqual(fields, definition.parameters);
    assert.ok(fields.every(p => p.parameterName !== 'Result' && p.entryMode === 'manual'));
    assert.ok(fields.some(p => p.parameterName === 'Microscopic Findings'));
    assert.ok(fields.some(p => p.parameterName === 'Impression'));
    if (definition.key !== 'abnormal-cells') assert.ok(fields.every(p => p.normalRange === ''));
  }
  assert.equal(getCellReportDefinition({ name: 'Abnormal Cells', sample_type: 'Urine' }), null);
  assert.equal(getCellReportDefinition({ name: 'BodyFluids (Cell Type&Cell Count)', sample_type: 'CSF' }), null);
  assert.equal(getCellReportDefinition({ name: 'Ascitic Fluid (Cell Count,Biochemistry..)' }), null);
  assert.equal(getCellReportDefinition({ name: 'Abnormal Cells', sampleType: 'Blood' }).key, 'abnormal-cells');
});

test('Abnormal Cells displays blank clinical fields, meaningful notes and a proper title', () => {
  const input = { name: 'Abnormal Cells', sample_type: 'Blood', parameters: getCellReportParameters({ name: 'Abnormal Cells' }).map(p => ({
    parameter_name: p.parameterName, unit: p.unit, normal_range: p.normalRange, value: '',
  })) };
  const original = JSON.stringify(input);
  const html = buildReportHtml({ ...sampleReport(input), isPreview: false });
  assert.match(html, /<div class="test-title">Abnormal Cells<\/div>/);
  assert.match(html, /data-report-content="abnormal-cells"/);
  const rows = html.match(/<table class="results-table">[\s\S]*?<\/table>/)[0];
  assert.match(rows, />Abnormal Cells<\/td>\s*<td[^>]*>-<\/td>/);
  assert.doesNotMatch(rows, />Sample|>Normal<|>Negative<|>0<|>Seen</);
  assert.equal(JSON.stringify(input), original);
});

test('cell report preserves multiline observations, zero counts and lab-defined reference text', () => {
  const input = { name: 'Joint Fluid for Cell Count & Cell Type', sample_type: 'Joint Fluid', parameters: [
    { parameter_name: 'Total Nucleated Cell Count', value: '0', unit: 'cells/µL', normal_range: 'Lab-specific interval' },
    { parameter_name: 'Microscopic Findings', value: 'First line\nSecond line <script>unsafe</script>', unit: '', normal_range: '' },
  ] };
  const html = buildReportHtml(sampleReport(input));
  assert.match(html, />0<\/td>/);
  assert.match(html, /Lab-specific interval/);
  assert.match(html, /First line<br \/>Second line &lt;script&gt;unsafe&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>unsafe/);
});

test('cell preview examples are labelled samples, not invented negative findings', () => {
  for (const definition of CELL_REPORT_DEFINITIONS) {
    for (const field of definition.parameters) {
      const value = getCellReportPreviewValue({ name: definition.names[0], sample_type: definition.sampleType }, field);
      assert.ok(value);
      if (field.parameterName !== 'Specimen / Site') assert.match(value, /^Sample /);
    }
  }
  assert.equal(getCellReportPreviewValue({ name: 'Unrelated test' }, { parameterName: 'Impression' }), null);
});

async function cellFixture() {
  const db = await fixture();
  for (const [index, definition] of CELL_REPORT_DEFINITIONS.entries()) {
    await db.run('INSERT INTO tests (id,name,category) VALUES (?,?,?)', [225 + index, definition.names[0], 'Imported legacy catalogue']);
    await db.run('INSERT INTO test_parameters (test_id,parameter_name,unit,normal_range,entry_mode,display_order) VALUES (?,?,?,?,?,?)', [225 + index, 'Result', '', '', 'manual', 1]);
  }
  return db;
}

test('cell migration repairs all five unused placeholders and keeps recoverable originals', async () => {
  const db = await cellFixture();
  try {
    await db.run('DELETE FROM test_parameters WHERE test_id=229'); // Also cover a truly empty imported schema.
    assert.deepEqual(await repairCellReportSchemas(db), [225, 226, 227, 228, 229]);
    for (const [index, definition] of CELL_REPORT_DEFINITIONS.entries()) {
      const fields = await db.all('SELECT * FROM test_parameters WHERE test_id=? ORDER BY display_order', [225 + index]);
      assert.deepEqual(fields.map(p => p.parameter_name), definition.parameters.map(p => p.parameterName));
      const backup = await db.get('SELECT * FROM cell_report_schema_backups WHERE test_id=?', [225 + index]);
      assert.equal(JSON.parse(backup.old_parameters_json).length, index === 4 ? 0 : 1);
      assert.equal((await db.get('SELECT sample_type FROM tests WHERE id=?', [225 + index])).sample_type, definition.sampleType);
    }
    await db.run("UPDATE test_parameters SET normal_range='Lab override' WHERE test_id=225 AND parameter_name='Abnormal Cells'");
    assert.deepEqual(await repairCellReportSchemas(db), []);
    assert.equal((await db.get("SELECT normal_range FROM test_parameters WHERE test_id=225 AND parameter_name='Abnormal Cells'")).normal_range, 'Lab override');
  } finally { await db.close(); }
});

test('cell migration preserves used tests, bundles, custom fields and manually written notes', async () => {
  const db = await cellFixture();
  try {
    await db.run('INSERT INTO visit_tests VALUES (225)');
    await db.run('INSERT INTO test_bundle_items VALUES (226, 999)');
    await db.run('INSERT INTO test_bundle_items VALUES (999, 227)');
    await db.run("UPDATE test_parameters SET parameter_name='Custom findings' WHERE test_id=228");
    await db.run("UPDATE tests SET report_body='My report content' WHERE id=229");
    assert.deepEqual(await repairCellReportSchemas(db), []);
    assert.equal((await db.get('SELECT parameter_name FROM test_parameters WHERE test_id=225')).parameter_name, 'Result');
  } finally { await db.close(); }
});

test('cell migration preserves customized ranges/formulas and incompatible specimens', async () => {
  const db = await cellFixture();
  try {
    await db.run("UPDATE test_parameters SET normal_range='custom' WHERE test_id=225");
    await db.run("UPDATE test_parameters SET unit='custom' WHERE test_id=226");
    await db.run("UPDATE test_parameters SET entry_mode='calculated',calculation_formula='1+1' WHERE test_id=227");
    await db.run("UPDATE tests SET sample_type='Urine' WHERE id=228");
    await db.run("UPDATE tests SET category='My catalogue' WHERE id=229");
    assert.deepEqual(await repairCellReportSchemas(db), []);
  } finally { await db.close(); }
});

test('cell migration rolls back placeholder deletion if a write fails', async () => {
  const db = await cellFixture();
  try {
    const originalRun = db.run;
    db.run = (sql, params) => /^INSERT INTO test_parameters/.test(sql) ? Promise.reject(new Error('cell write failed')) : originalRun(sql, params);
    await assert.rejects(repairCellReportSchemas(db), /cell write failed/);
    assert.equal((await db.get('SELECT parameter_name FROM test_parameters WHERE test_id=225')).parameter_name, 'Result');
    assert.equal((await db.get('SELECT sample_type FROM tests WHERE id=225')).sample_type, null);
  } finally { await db.close(); }
});
