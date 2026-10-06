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
const { ensureAntiInsulinAntibodyTestConfiguration, ensureAntiLeptospiraAntibodyTestConfiguration, ensureAntiMicrosomalAntibodyTestConfiguration, ensureAntiDsDnaAntibodyTestConfiguration, ensureAntiSsDnaAntibodyTestConfiguration, ensureAntiHistoneAntibodyTestConfiguration, ensureAntiRibosomalPAntibodyTestConfiguration, ensureAntiCcpAbTestConfiguration, ensureAntiSpermAntibodyTestConfiguration, ensureApolipoproteinA1TestConfiguration, ensureUrineArsenicTestConfiguration, ensureArthritisProfileTestConfiguration, ensureAsciticFluidGramStainTestConfiguration, ensureAsciticFluidTotalProteinTestConfiguration, ensureBodyFluidBiochemistryTestConfiguration, ensureBodyFluidSpecificGravityTestConfiguration, ensureCsfFluidChlorideTestConfiguration, ensureCsfFluidProteinTestConfiguration, ensureCsfFluidAfbStainTestConfiguration, ensureCsfFluidGramStainTestConfiguration, ensureComplementC3TestConfiguration, ensureComplementC4TestConfiguration, ensureCancaAntiPr3TestConfiguration, ensureBronchialWashingCultureSensitivityTestConfiguration, ensureBactecAerobicCultureTestConfiguration, ensureBactecAnaerobicCultureTestConfiguration, ensureBronchialPapCytologyTestConfigurations, ensureCryoglobulinsScreeningTestConfiguration } = require('../src/db/init');
const { sampleReport } = require('./audit-report-content.cjs');
const { isBillingOnlyTest } = require('../frontend/scripts/reportEligibility');

function extractMainContentMarkup(html) {
  const source = String(html || '');
  const opening = /<div class="[^"]*\bmain-content\b[^"]*">/i.exec(source);
  assert.ok(opening, 'Generated report must contain its main report content.');
  const tagPattern = /<\/?div\b[^>]*>/gi;
  tagPattern.lastIndex = opening.index;
  let depth = 0;
  let match;
  while ((match = tagPattern.exec(source))) {
    depth += /^<div\b/i.test(match[0]) ? 1 : -1;
    if (depth === 0) {
      // The barcode is header artwork, not a clinical report body. Its source
      // changed from an external URL to an embedded offline-safe SVG.
      return source.slice(opening.index, tagPattern.lastIndex)
        .replace(/<img\b[^>]*\bclass="barcode-img"[^>]*\/>/g, '<barcode-image />');
    }
  }
  throw new Error('Generated report main content is not balanced.');
}

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

test('CPK with CK-MB keeps total CPK and CK-MB as separate, cautiously interpreted results', () => {
  const test = {
    name: 'CPKwith CK-MB',
    sample_type: 'Serum',
    parameters: [
      { parameter_name: 'Creatine Phosphokinase (CPK), Total', value: '186', unit: 'U/L', normal_range: '24 - 204' },
      { parameter_name: 'CK-MB', value: '18', unit: 'U/L', normal_range: '0 - 25' },
    ],
  };
  const html = buildReportHtml(sampleReport(test));
  assert.match(html, /<div class="test-title">CPK WITH CK-MB<\/div>/);
  assert.match(html, /CREATINE PHOSPHOKINASE \(CPK\), TOTAL/);
  assert.match(html, /186/);
  assert.match(html, /CK-MB/);
  assert.match(html, /18/);
  assert.match(html, /CK-MB must not be interpreted alone as proof of myocardial injury/);
  assert.match(html, /symptoms, ECG, cardiac troponin where clinically indicated/);
  assert.deepEqual(
    getFallbackReportParameters({ name: 'CPKwith CK-MB' }).slice(0, 2).map(parameter => parameter.parameterName),
    ['Creatine Phosphokinase (CPK), Total', 'CK-MB'],
  );
});

test('DNPH uses a qualitative urine ketoacid screen without asserting a metabolic diagnosis', () => {
  const html = buildReportHtml(sampleReport({
    name: 'DNPH',
    code: 'DNPH',
    sample_type: 'Urine',
    parameters: [
      { parameter_name: 'DNPH, Urine', value: 'Positive', unit: '', normal_range: 'Negative' },
      { parameter_name: 'Observation / Precipitate', value: 'Yellow-white precipitate observed', unit: '', normal_range: '' },
      { parameter_name: 'Collection Date / Time', value: '01-Oct-2026 09:15', unit: '', normal_range: '' },
      { parameter_name: 'Method / Kit', value: 'DNPH spot reaction', unit: '', normal_range: '' },
    ],
  }));
  assert.match(html, /<div class="test-title">DNPH<\/div>/);
  assert.match(html, /2,4-DINITROPHENYLHYDRAZINE \(DNPH\) URINE SCREEN/);
  assert.match(html, />Positive</);
  assert.match(html, /Yellow-white precipitate observed/);
  assert.match(html, /Qualitative metabolic screen/);
  assert.match(html, /qualitative screen for urinary alpha-ketoacids/);
  assert.match(html, /does not identify a specific compound or establish a diagnosis by itself/);
  assert.match(html, /quantitative plasma amino acids \(including alloisoleucine\)/);
  assert.doesNotMatch(html, /Maple Syrup Urine Disease diagnosed/i);
});

test('DiabeticProfile renders glucose, HbA1c, calculated eAG, and urine-screen fields as one cautious profile', () => {
  const html = buildReportHtml(sampleReport({
    name: 'DiabeticProfile',
    sample_type: 'Blood / Urine',
    parameters: [
      { parameter_name: 'Fasting Plasma Glucose', value: '112', unit: 'mg/dL', normal_range: '70 - 99' },
      { parameter_name: 'Postprandial Plasma Glucose (2 Hours)', value: '168', unit: 'mg/dL', normal_range: '< 140' },
      { parameter_name: 'HbA1c', value: '6.4', unit: '%', normal_range: '< 5.7' },
      { parameter_name: 'Estimated Average Glucose (eAG)', value: '137', unit: 'mg/dL', normal_range: 'Calculated from HbA1c' },
      { parameter_name: 'Urine Glucose', value: 'Negative', unit: '', normal_range: 'Negative' },
      { parameter_name: 'Urine Ketones', value: 'Negative', unit: '', normal_range: 'Negative' },
    ],
  }));
  assert.match(html, /<div class="test-title">DIABETIC PROFILE<\/div>/);
  assert.match(html, /data-report-content="diabetic-profile"/);
  assert.match(html, /FASTING PLASMA GLUCOSE|Fasting Plasma Glucose/);
  assert.match(html, />112</);
  assert.match(html, /Postprandial Plasma Glucose \(2 Hours\)/);
  assert.match(html, />168</);
  assert.match(html, /HbA1c/);
  assert.match(html, /Estimated Average Glucose \(eAG\)/);
  assert.match(html, /Urine Ketones/);
  assert.match(html, /requires confirmation on a separate day/);
  assert.match(html, /does not by itself establish the type or cause of diabetes/);
  assert.deepEqual(
    getFallbackReportParameters({ name: 'DiabeticProfile' }).slice(0, 6).map(parameter => parameter.parameterName),
    ['Fasting Plasma Glucose', 'Postprandial Plasma Glucose (2 Hours)', 'HbA1c', 'Estimated Average Glucose (eAG)', 'Urine Glucose', 'Urine Ketones'],
  );
  assert.equal(getFallbackReportParameters({ name: 'DiabeticProfile' })[3].calculationFormula, '{HbA1c} * 28.7 - 46.7');
});

test('DiabeticProfile Extended keeps glycaemic and lipid measurements in separate report sections', () => {
  const html = buildReportHtml(sampleReport({
    name: 'DiabeticProfile(Extended)',
    sample_type: 'Blood / Urine',
    parameters: [
      { parameter_name: 'Fasting Plasma Glucose', value: '104', unit: 'mg/dL', normal_range: '70 - 99' },
      { parameter_name: 'Postprandial Plasma Glucose (2 Hours)', value: '154', unit: 'mg/dL', normal_range: '< 140' },
      { parameter_name: 'HbA1c', value: '6.1', unit: '%', normal_range: '< 5.7' },
      { parameter_name: 'Estimated Average Glucose (eAG)', value: '128', unit: 'mg/dL', normal_range: 'Calculated from HbA1c' },
      { parameter_name: 'Total Cholesterol', value: '188', unit: 'mg/dL', normal_range: 'Laboratory-validated reference interval' },
      { parameter_name: 'Triglycerides', value: '142', unit: 'mg/dL', normal_range: 'Laboratory-validated reference interval' },
      { parameter_name: 'HDL Cholesterol', value: '46', unit: 'mg/dL', normal_range: 'Laboratory-validated reference interval' },
      { parameter_name: 'LDL Cholesterol', value: '114', unit: 'mg/dL', normal_range: 'Laboratory-validated reference interval' },
      { parameter_name: 'VLDL Cholesterol', value: '28', unit: 'mg/dL', normal_range: 'Laboratory-validated reference interval' },
      { parameter_name: 'Urine Glucose', value: 'Negative', unit: '', normal_range: 'Negative' },
      { parameter_name: 'Urine Ketones', value: 'Negative', unit: '', normal_range: 'Negative' },
    ],
  }));
  assert.match(html, /<div class="test-title">DIABETIC PROFILE - EXTENDED<\/div>/);
  assert.match(html, /data-report-content="diabetic-profile-extended"/);
  assert.match(html, /GLYCAEMIC STATUS/);
  assert.match(html, /LIPID ASSESSMENT/);
  assert.match(html, /Total Cholesterol/);
  assert.match(html, /HDL Cholesterol/);
  assert.match(html, /Urine Ketones/);
  assert.match(html, /Lipid results are reported as individual measurements/);
  assert.deepEqual(
    getFallbackReportParameters({ name: 'DiabeticProfile(Extended)' }).slice(0, 9).map(parameter => parameter.parameterName),
    ['Fasting Plasma Glucose', 'Postprandial Plasma Glucose (2 Hours)', 'HbA1c', 'Estimated Average Glucose (eAG)', 'Total Cholesterol', 'Triglycerides', 'HDL Cholesterol', 'LDL Cholesterol', 'VLDL Cholesterol'],
  );
});

test('DiabeticRenalProfile keeps glycaemic, serum renal, and urine albumin assessment separate', () => {
  const html = buildReportHtml(sampleReport({
    name: 'DiabeticRenalProfile',
    sample_type: 'Blood / Urine',
    parameters: [
      { parameter_name: 'Fasting Plasma Glucose', value: '108', unit: 'mg/dL', normal_range: '70 - 99' },
      { parameter_name: 'HbA1c', value: '6.2', unit: '%', normal_range: '< 5.7' },
      { parameter_name: 'Estimated Average Glucose (eAG)', value: '131', unit: 'mg/dL', normal_range: 'Calculated from HbA1c' },
      { parameter_name: 'Serum Creatinine', value: '1.02', unit: 'mg/dL', normal_range: 'Laboratory-validated reference interval' },
      { parameter_name: 'Estimated GFR (eGFR)', value: '88', unit: 'mL/min/1.73 m²', normal_range: 'Laboratory-reported, equation-specific' },
      { parameter_name: 'Blood Urea Nitrogen (BUN)', value: '16', unit: 'mg/dL', normal_range: 'Laboratory-validated reference interval' },
      { parameter_name: 'Urine Albumin (Microalbumin)', value: '12', unit: 'mg/L', normal_range: 'Laboratory-validated reference interval' },
      { parameter_name: 'Urine Creatinine', value: '96', unit: 'mg/dL', normal_range: 'Laboratory-validated reference interval' },
      { parameter_name: 'Urine Albumin-Creatinine Ratio (UACR)', value: '12.5', unit: 'mg/g', normal_range: '< 30' },
    ],
  }));
  assert.match(html, /<div class="test-title">DIABETIC RENAL PROFILE<\/div>/);
  assert.match(html, /data-report-content="diabetic-renal-profile"/);
  assert.match(html, /SERUM RENAL ASSESSMENT/);
  assert.match(html, /URINE ALBUMIN ASSESSMENT/);
  assert.match(html, /Urine Albumin-Creatinine Ratio \(UACR\)/);
  assert.match(html, /does not establish chronic kidney disease or its cause by itself/);
  assert.deepEqual(
    getFallbackReportParameters({ name: 'DiabeticRenalProfile' }).slice(0, 9).map(parameter => parameter.parameterName),
    ['Fasting Plasma Glucose', 'HbA1c', 'Estimated Average Glucose (eAG)', 'Serum Creatinine', 'Estimated GFR (eGFR)', 'Blood Urea Nitrogen (BUN)', 'Urine Albumin (Microalbumin)', 'Urine Creatinine', 'Urine Albumin-Creatinine Ratio (UACR)'],
  );
  assert.equal(getFallbackReportParameters({ name: 'DiabeticRenalProfile' })[8].calculationFormula, '{Urine Albumin (Microalbumin)} * 100 / {Urine Creatinine}');
});

test('EarCuwahGamStain uses an ear-swab direct-microscopy report without inventing culture results', () => {
  const html = buildReportHtml(sampleReport({
    name: 'EarCuwahGamStain',
    sample_type: 'Ear Swab',
    parameters: [
      { parameter_name: 'Specimen / Collection Site', value: 'Right ear swab' },
      { parameter_name: 'Smear Method / Preparation', value: 'Direct Gram stain' },
      { parameter_name: 'Inflammatory Cells / PMNs', value: 'Many polymorphs seen' },
      { parameter_name: 'Gram Stain Findings', value: 'Gram-positive cocci seen' },
      { parameter_name: 'Gram Reaction / Bacterial Morphology', value: 'Gram-positive cocci in clusters' },
      { parameter_name: 'Culture / Molecular Test Status', value: 'Culture requested separately' },
    ],
  }));
  assert.match(html, /<div class="test-title">EAR SWAB - GRAM STAIN<\/div>/);
  assert.match(html, /data-report-content="ear-swab-gram-stain"/);
  assert.match(html, /EAR SWAB - GRAM STAIN DIRECT MICROSCOPY/);
  assert.match(html, /Gram-positive cocci seen/);
  assert.match(html, /Culture requested separately/);
  assert.match(html, /does not provide definitive organism identification or antimicrobial susceptibility/);
  assert.deepEqual(
    getFallbackReportParameters({ name: 'EarCuwahGamStain' }).slice(0, 5).map(parameter => parameter.parameterName),
    ['Specimen / Collection Site', 'Smear Method / Preparation', 'Inflammatory Cells / PMNs', 'Gram Stain Findings', 'Gram Reaction / Bacterial Morphology'],
  );
  assert.equal(getFallbackReportParameters({ name: 'EarSwabGramStain' })[3].parameterName, 'Gram Stain Findings');
});

test('EarSwabAFBStain uses an ear-swab AFB microscopy report without asserting TB', () => {
  const html = buildReportHtml(sampleReport({
    name: 'EarSwabAFBStain', sample_type: 'Ear Swab', parameters: [
      { parameter_name: 'Specimen / Collection Site', value: 'Left ear swab' },
      { parameter_name: 'AFB Smear Microscopy Result', value: 'No acid-fast bacilli seen', normal_range: 'No acid-fast bacilli seen' },
      { parameter_name: 'Stain Method', value: 'Ziehl-Neelsen stain' },
      { parameter_name: 'Culture / Molecular Test Status', value: 'Culture requested separately' },
    ],
  }));
  assert.match(html, /<div class="test-title">EAR SWAB - AFB STAIN<\/div>/);
  assert.match(html, /data-report-content="ear-swab-afb-stain"/);
  assert.match(html, /EAR SWAB - AFB DIRECT MICROSCOPY/);
  assert.match(html, /No acid-fast bacilli seen/);
  assert.match(html, /does not identify the species or confirm/);
  assert.match(html, /does not exclude mycobacterial infection/);
});

test('FSH&PRL keeps both endocrine measurements and their laboratory-specific intervals', () => {
  const html = buildReportHtml(sampleReport({ name: 'FSH&PRL', sample_type: 'Serum', parameters: [
    { parameter_name: 'Follicle Stimulating Hormone (FSH), Serum', value: '6.8', unit: 'mIU/mL', normal_range: 'Female follicular phase: 3.0 - 8.1' },
    { parameter_name: 'Prolactin (PRL), Serum', value: '12.4', unit: 'ng/mL', normal_range: 'Laboratory validated interval' },
    { parameter_name: 'Menstrual Cycle Phase / Physiologic State', value: 'Follicular phase' },
  ] }));
  assert.match(html, /<div class="test-title">FSH & PROLACTIN \(PRL\)<\/div>/);
  assert.match(html, /data-report-content="fsh-prl"/);
  assert.match(html, /Female follicular phase: 3.0 - 8.1/);
  assert.match(html, /Follicular phase/);
  assert.match(html, /does not establish a specific reproductive or pituitary diagnosis by itself/);
});

test('FSH,LH&PRL includes LH without changing the FSH and prolactin report', () => {
  const html = buildReportHtml(sampleReport({ name: 'FSH,LH&PRL', sample_type: 'Serum', parameters: [
    { parameter_name: 'Follicle Stimulating Hormone (FSH), Serum', value: '6.8', unit: 'mIU/mL', normal_range: 'Lab interval' },
    { parameter_name: 'Luteinizing Hormone (LH), Serum', value: '7.1', unit: 'mIU/mL', normal_range: 'Lab interval' },
    { parameter_name: 'Prolactin (PRL), Serum', value: '12.4', unit: 'ng/mL', normal_range: 'Lab interval' },
  ] }));
  assert.match(html, /<div class="test-title">FSH, LH & PROLACTIN \(PRL\)<\/div>/);
  assert.match(html, /Luteinizing Hormone \(LH\), Serum/);
  assert.equal(getFallbackReportParameters({ name: 'FSH,LH&PRL' })[1].parameterName, 'Luteinizing Hormone (LH), Serum');
});

test('FemaleInfertilityProfile uses a cycle-aware endocrine profile rather than a blank report', () => {
  const html = buildReportHtml(sampleReport({ name: 'FemaleInfertilityProfile', sample_type: 'Serum', parameters: [
    { parameter_name: 'Follicle Stimulating Hormone (FSH), Serum', value: '6.8', unit: 'mIU/mL', normal_range: 'Follicular phase: laboratory validated' },
    { parameter_name: 'Luteinizing Hormone (LH), Serum', value: '7.1', unit: 'mIU/mL', normal_range: 'Follicular phase: laboratory validated' },
    { parameter_name: 'Estradiol (E2), Serum', value: '45', unit: 'pg/mL', normal_range: 'Laboratory validated' },
    { parameter_name: 'Anti-Mullerian Hormone (AMH), Serum', value: '2.4', unit: 'ng/mL', normal_range: 'Laboratory validated' },
    { parameter_name: 'Thyroid Stimulating Hormone (TSH), Serum', value: '1.8', unit: 'mIU/L', normal_range: 'Laboratory validated' },
    { parameter_name: 'Prolactin (PRL), Serum', value: '12.4', unit: 'ng/mL', normal_range: 'Laboratory validated' },
    { parameter_name: 'Progesterone, Serum', value: '10.0', unit: 'ng/mL', normal_range: 'Laboratory validated' },
    { parameter_name: 'Menstrual Cycle Day / Physiologic State', value: 'Cycle day 3' },
  ] }));
  assert.match(html, /<div class="test-title">FEMALE INFERTILITY PROFILE<\/div>/);
  assert.match(html, /data-report-content="female-infertility-profile"/);
  assert.match(html, /OVARIAN \/ OVULATORY ASSESSMENT/);
  assert.match(html, /OTHER ENDOCRINE COMPONENTS/);
  assert.match(html, /LUTEAL \/ CYCLE-TIMED COMPONENT/);
  assert.match(html, /Cycle day 3/);
  assert.match(html, /do not by themselves confirm infertility or predict spontaneous conception/);
  assert.deepEqual(
    getFallbackReportParameters({ name: 'FemaleInfertilityProfile' }).slice(0, 7).map(parameter => parameter.parameterName),
    ['Follicle Stimulating Hormone (FSH), Serum', 'Luteinizing Hormone (LH), Serum', 'Estradiol (E2), Serum', 'Anti-Mullerian Hormone (AMH), Serum', 'Thyroid Stimulating Hormone (TSH), Serum', 'Prolactin (PRL), Serum', 'Progesterone, Serum'],
  );
});

test('FernTest uses a cervical-mucus microscopy format without diagnosing fertility status', () => {
  const html = buildReportHtml(sampleReport({ name: 'FernTest (Coll.Charges 10o/extra)', sample_type: 'Cervical Mucus', parameters: [
    { parameter_name: 'Specimen / Collection Site', value: 'Cervical mucus' },
    { parameter_name: 'Menstrual Cycle Day / Last Menstrual Period', value: 'Cycle day 13' },
    { parameter_name: 'Fern Test Result', value: 'Ferning pattern observed' },
    { parameter_name: 'Ferning Pattern / Grade', value: 'Arborization present' },
    { parameter_name: 'Microscopy Remarks', value: 'Dried smear examined by light microscopy' },
  ] }));
  assert.match(html, /<div class="test-title">FERN TEST<\/div>/);
  assert.match(html, /data-report-content="fern-test"/);
  assert.match(html, /CERVICAL MUCUS FERN TEST/);
  assert.match(html, /Cycle day 13/);
  assert.match(html, /not a stand-alone confirmation of ovulation, fertility, infertility, or a cervical-factor diagnosis/);
  assert.deepEqual(
    getFallbackReportParameters({ name: 'FernTest (Coll.Charges 10o/extra)' }).slice(0, 5).map(parameter => parameter.parameterName),
    ['Specimen / Collection Site', 'Collection Date / Time', 'Menstrual Cycle Day / Last Menstrual Period', 'Fern Test Result', 'Ferning Pattern / Grade'],
  );
});

test('Wuchereria bancrofti antigen uses a qualitative EDTA-blood immunoassay format', () => {
  const html = buildReportHtml(sampleReport({ name: 'Filaria (Wuchereria Bancrofti) AntigenEDTA Blo..Immuno../', sample_type: 'EDTA Whole Blood', parameters: [
    { parameter_name: 'Wuchereria bancrofti Antigen', value: 'Not detected', normal_range: 'Not detected' },
    { parameter_name: 'Result Interpretation', value: 'Not detected' },
    { parameter_name: 'Assay / Device / Kit', value: 'Immunochromatographic antigen assay' },
    { parameter_name: 'Quality Control / Validity', value: 'Valid' },
  ] }));
  assert.match(html, /<div class="test-title">WUCHERERIA BANCROFTI ANTIGEN<\/div>/);
  assert.match(html, /data-report-content="wuchereria-bancrofti-antigen"/);
  assert.match(html, /WUCHERERIA BANCROFTI ANTIGEN, EDTA WHOLE BLOOD/);
  assert.match(html, /may be detected from blood collected at any time of day/);
  assert.deepEqual(
    getFallbackReportParameters({ name: 'Filaria (Wuchereria Bancrofti) AntigenEDTA Blo..Immuno../' }).slice(0, 4).map(parameter => parameter.parameterName),
    ['Wuchereria bancrofti Antigen', 'Result Interpretation', 'Specimen', 'Collection Date / Time'],
  );
});

test('Filaria Antigen uses a generic target-aware serum format without conflating it with the Wuchereria assay', () => {
  const html = buildReportHtml(sampleReport({ name: 'Filaria Antigen', sample_type: 'Serum', parameters: [
    { parameter_name: 'Filarial Antigen', value: 'Not detected', normal_range: 'Laboratory-validated qualitative interpretation' },
    { parameter_name: 'Assay Target / Scope', value: 'As stated by the manufacturer' },
    { parameter_name: 'Result Interpretation', value: 'Not detected' },
    { parameter_name: 'Quality Control / Validity', value: 'Valid' },
  ] }));
  assert.match(html, /<div class="test-title">FILARIA ANTIGEN<\/div>/);
  assert.match(html, /data-report-content="filaria-antigen"/);
  assert.match(html, /FILARIAL ANTIGEN, SERUM/);
  assert.match(html, /Do not assume species identification, parasite burden, microfilaria microscopy/);
  assert.deepEqual(
    getFallbackReportParameters({ name: 'Filaria Antigen' }).slice(0, 4).map(parameter => parameter.parameterName),
    ['Filarial Antigen', 'Assay Target / Scope', 'Result Interpretation', 'Specimen'],
  );
});

test('Fluid Aspiration&Cytology uses a structured qualitative cytology format without adding unperformed studies', () => {
  const html = buildReportHtml(sampleReport({ name: 'Fluid Aspiration&Cytology', sample_type: 'Body Fluid', parameters: [
    { parameter_name: 'Specimen / Aspiration Site', value: 'Pleural fluid, left' },
    { parameter_name: 'Fluid Volume / Gross Appearance', value: '20 mL, straw coloured' },
    { parameter_name: 'Specimen Adequacy / Cellularity', value: 'Satisfactory; moderately cellular' },
    { parameter_name: 'Microscopic Description', value: 'Mesothelial cells and mixed inflammatory cells seen' },
    { parameter_name: 'Diagnostic Category', value: 'Laboratory-approved category recorded' },
    { parameter_name: 'Cytologic Impression / Diagnosis', value: 'See microscopic description and correlation' },
  ] }));
  assert.match(html, /<div class="test-title">FLUID ASPIRATION &amp; CYTOLOGY<\/div>/);
  assert.match(html, /data-report-content="fluid-aspiration-cytology"/);
  assert.match(html, /FLUID ASPIRATION - CYTOLOGY/);
  assert.match(html, /Pleural fluid, left/);
  assert.match(html, /Report ancillary stains, cell-block, immunocytochemistry, microbiology, or molecular studies only when actually performed/);
  assert.deepEqual(
    getFallbackReportParameters({ name: 'Fluid Aspiration&Cytology' }).slice(0, 6).map(parameter => parameter.parameterName),
    ['Specimen / Aspiration Site', 'Fluid Volume / Gross Appearance', 'Clinical History / Imaging Findings', 'Preparation / Stains', 'Specimen Adequacy / Cellularity', 'Microscopic Description'],
  );
});

test('Hb Electrophoresis reports measured fractions with laboratory-specific interpretation fields', () => {
  const html = buildReportHtml(sampleReport({ name: 'Hb Electrophoresis', sample_type: 'Whole Blood', parameters: [
    { parameter_name: 'Hemoglobin A (HbA)', value: '96.8', unit: '%' },
    { parameter_name: 'Hemoglobin A2 (HbA2)', value: '2.7', unit: '%' },
    { parameter_name: 'Hemoglobin F (HbF)', value: '0.5', unit: '%' },
    { parameter_name: 'Hemoglobin S (HbS), if detected', value: 'Not detected' },
    { parameter_name: 'Method / Analyzer', value: 'Capillary electrophoresis' },
    { parameter_name: 'Transfusion History / Date of Last Transfusion', value: 'No recent transfusion reported' },
  ] }));
  assert.match(html, /<div class="test-title">HEMOGLOBIN ELECTROPHORESIS<\/div>/);
  assert.match(html, /data-report-content="hb-electrophoresis"/);
  assert.match(html, /Hemoglobin A2 \(HbA2\)/);
  assert.match(html, />96\.8</);
  assert.match(html, /Capillary electrophoresis/);
  assert.match(html, /must not assign a hemoglobinopathy diagnosis/);
  assert.deepEqual(
    getFallbackReportParameters({ name: 'Hb Electrophoresis' }).slice(0, 7).map(parameter => parameter.parameterName),
    ['Hemoglobin A (HbA)', 'Hemoglobin A2 (HbA2)', 'Hemoglobin F (HbF)', 'Hemoglobin S (HbS), if detected', 'Hemoglobin C (HbC), if detected', 'Hemoglobin E (HbE), if detected', 'Other Hemoglobin Fraction / Variant'],
  );
});

test('Foetal Haemoglobin uses an age-aware HbF quantitation format', () => {
  const html = buildReportHtml(sampleReport({ name: 'Foetal Haemoglobin', sample_type: 'Whole Blood', parameters: [
    { parameter_name: 'Hemoglobin F (HbF)', value: '0.8', unit: '%', normal_range: 'Laboratory-validated, age-specific reference interval' },
    { parameter_name: 'Hemoglobin A2 (HbA2), if measured', value: '2.6', unit: '%' },
    { parameter_name: 'Method / Analyzer', value: 'HPLC' },
    { parameter_name: 'Age / Gestational Age (if applicable)', value: 'Adult' },
  ] }));
  assert.match(html, /<div class="test-title">FOETAL HAEMOGLOBIN \(HbF\)<\/div>/);
  assert.match(html, /data-report-content="foetal-haemoglobin"/);
  assert.match(html, /FOETAL HAEMOGLOBIN \(HbF\) QUANTITATION/);
  assert.match(html, /Laboratory-validated, age-specific reference interval/);
  assert.match(html, /HbF is strongly age-dependent/);
  assert.deepEqual(
    getFallbackReportParameters({ name: 'Foetal Haemoglobin' }).slice(0, 5).map(parameter => parameter.parameterName),
    ['Hemoglobin F (HbF)', 'Specimen', 'Method / Analyzer', 'Age / Gestational Age (if applicable)', 'Hemoglobin A2 (HbA2), if measured'],
  );
});

test('Foetal Haemoglobin by HPLC keeps fraction analysis distinct from the general HbF format', () => {
  const html = buildReportHtml(sampleReport({ name: 'Foetal Haemoglobin by HPLC', sample_type: 'Whole Blood', parameters: [
    { parameter_name: 'Hemoglobin F (HbF)', value: '0.8', unit: '%', normal_range: 'Laboratory-validated, age-specific reference interval' },
    { parameter_name: 'Hemoglobin A (HbA), if measured', value: '96.6', unit: '%' },
    { parameter_name: 'Hemoglobin A2 (HbA2), if measured', value: '2.6', unit: '%' },
    { parameter_name: 'HPLC Analyzer / Program', value: 'Validated Hb fraction program' },
  ] }));
  assert.match(html, /<div class="test-title">FOETAL HAEMOGLOBIN \(HbF\) BY HPLC<\/div>/);
  assert.match(html, /data-report-content="foetal-haemoglobin-hplc"/);
  assert.match(html, /FOETAL HAEMOGLOBIN \(HbF\) BY HPLC/);
  assert.match(html, /HPLC hemoglobin fraction analysis/);
  assert.match(html, /Recent transfusion, sample quality, and co-eluting or variant peaks/);
  assert.deepEqual(
    getFallbackReportParameters({ name: 'Foetal Haemoglobin by HPLC' }).slice(0, 6).map(parameter => parameter.parameterName),
    ['Hemoglobin F (HbF)', 'Hemoglobin A (HbA), if measured', 'Hemoglobin A2 (HbA2), if measured', 'Other Hemoglobin Fraction / Variant Window', 'Specimen', 'HPLC Analyzer / Program'],
  );
});

test('Free Beta hCG uses a gestational-age-aware screening format without a diagnostic conclusion', () => {
  const html = buildReportHtml(sampleReport({ name: 'Free Beta hCG', sample_type: 'Serum', parameters: [
    { parameter_name: 'Free Beta hCG', value: '32.1', unit: 'ng/mL', normal_range: 'Laboratory-validated, gestational-age-specific reference interval' },
    { parameter_name: 'Multiple of Median (MoM), if calculated', value: '1.05' },
    { parameter_name: 'Gestational Age / Crown-Rump Length (if available)', value: '12 weeks / CRL recorded' },
    { parameter_name: 'Method / Analyzer', value: 'Validated immunoassay' },
  ] }));
  assert.match(html, /<div class="test-title">FREE BETA hCG<\/div>/);
  assert.match(html, /data-report-content="free-beta-hcg"/);
  assert.match(html, /Maternal serum screening marker when clinically requested/);
  assert.match(html, /Laboratory-validated, gestational-age-specific reference interval/);
  assert.match(html, /this isolated result is not a diagnostic result/);
  assert.deepEqual(
    getFallbackReportParameters({ name: 'Free Beta hCG' }).slice(0, 5).map(parameter => parameter.parameterName),
    ['Free Beta hCG', 'Multiple of Median (MoM), if calculated', 'Specimen', 'Method / Analyzer', 'Gestational Age / Crown-Rump Length (if available)'],
  );
});

test('Free Cholesterol uses a non-esterified cholesterol format without replacing the lipid profile', () => {
  const html = buildReportHtml(sampleReport({ name: 'Free Cholesterol', sample_type: 'Serum', parameters: [
    { parameter_name: 'Free Cholesterol (Non-esterified)', value: '54', unit: 'mg/dL', normal_range: 'Laboratory-validated, method-specific reference interval' },
    { parameter_name: 'Total Cholesterol, if measured', value: '180', unit: 'mg/dL' },
    { parameter_name: 'Free / Total Cholesterol Ratio, if calculated', value: '0.30' },
    { parameter_name: 'Method / Analyzer', value: 'Validated enzymatic method' },
  ] }));
  assert.match(html, /<div class="test-title">FREE CHOLESTEROL \(NON-ESTERIFIED\)<\/div>/);
  assert.match(html, /data-report-content="free-cholesterol"/);
  assert.match(html, /Fraction-specific cholesterol measurement/);
  assert.match(html, /not interchangeable with the total cholesterol result in a routine lipid profile/);
  assert.deepEqual(
    getFallbackReportParameters({ name: 'Free Cholesterol' }).slice(0, 5).map(parameter => parameter.parameterName),
    ['Free Cholesterol (Non-esterified)', 'Total Cholesterol, if measured', 'Cholesteryl Esters, if measured', 'Free / Total Cholesterol Ratio, if calculated', 'Specimen'],
  );
});

test('Free Estradiol uses a fraction-specific endocrine format without replacing total estradiol', () => {
  const html = buildReportHtml(sampleReport({ name: 'Free Estradiol', sample_type: 'Serum', parameters: [
    { parameter_name: 'Free Estradiol', value: '0.68', unit: 'pg/mL', normal_range: 'Laboratory-validated, age/sex- and method-specific reference interval' },
    { parameter_name: 'Free Estradiol, Percent (if reported)', value: '1.8', unit: '%' },
    { parameter_name: 'Total Estradiol (E2), if reported', value: '42', unit: 'pg/mL' },
    { parameter_name: 'Sex Hormone-Binding Globulin (SHBG), if reported', value: '55', unit: 'nmol/L' },
  ] }));
  assert.match(html, /<div class="test-title">FREE ESTRADIOL<\/div>/);
  assert.match(html, /data-report-content="free-estradiol"/);
  assert.match(html, /Free-fraction estradiol measurement/);
  assert.match(html, /Do not substitute it for total estradiol/);
  assert.deepEqual(
    getFallbackReportParameters({ name: 'Free Estradiol' }).slice(0, 5).map(parameter => parameter.parameterName),
    ['Free Estradiol', 'Free Estradiol, Percent (if reported)', 'Total Estradiol (E2), if reported', 'Sex Hormone-Binding Globulin (SHBG), if reported', 'Specimen'],
  );
});

test('Free PSA keeps free and total PSA together only when both are reported', () => {
  const html = buildReportHtml(sampleReport({ name: 'Free P S A', sample_type: 'Serum', parameters: [
    { parameter_name: 'Free PSA', value: '0.72', unit: 'ng/mL', normal_range: 'Laboratory-validated, method-specific reference interval' },
    { parameter_name: 'Total PSA, same specimen', value: '4.8', unit: 'ng/mL' },
    { parameter_name: 'Free PSA / Total PSA Ratio, if calculated', value: '0.15' },
    { parameter_name: 'Percent Free PSA, if calculated', value: '15', unit: '%' },
  ] }));
  assert.match(html, /<div class="test-title">FREE PROSTATE-SPECIFIC ANTIGEN \(FREE PSA\)<\/div>/);
  assert.match(html, /data-report-content="free-psa"/);
  assert.match(html, /Free and total PSA comparison when both are measured/);
  assert.match(html, /same specimen using compatible methods/);
  assert.deepEqual(
    getFallbackReportParameters({ name: 'Free P S A' }).slice(0, 5).map(parameter => parameter.parameterName),
    ['Free PSA', 'Total PSA, same specimen', 'Free PSA / Total PSA Ratio, if calculated', 'Percent Free PSA, if calculated', 'Specimen'],
  );
});

test('Free Testosterone distinguishes measured from calculated results and preserves its inputs', () => {
  const html = buildReportHtml(sampleReport({ name: 'Free Testosterone', sample_type: 'Serum', parameters: [
    { parameter_name: 'Free Testosterone', value: '12.4', unit: 'pg/mL', normal_range: 'Laboratory-validated, age/sex- and method-specific reference interval' },
    { parameter_name: 'Free Testosterone Method (Measured / Calculated)', value: 'Calculated from total testosterone, SHBG, and albumin' },
    { parameter_name: 'Total Testosterone, if measured', value: '480', unit: 'ng/dL' },
    { parameter_name: 'Sex Hormone-Binding Globulin (SHBG), if measured', value: '35', unit: 'nmol/L' },
    { parameter_name: 'Albumin, if used for calculation', value: '4.4', unit: 'g/dL' },
  ] }));
  assert.match(html, /<div class="test-title">FREE TESTOSTERONE<\/div>/);
  assert.match(html, /data-report-content="free-testosterone"/);
  assert.match(html, /Free testosterone measurement or calculation, as stated/);
  assert.match(html, /State whether free testosterone was directly measured or calculated/);
  assert.deepEqual(
    getFallbackReportParameters({ name: 'Free Testosterone' }).slice(0, 6).map(parameter => parameter.parameterName),
    ['Free Testosterone', 'Free Testosterone Method (Measured / Calculated)', 'Total Testosterone, if measured', 'Sex Hormone-Binding Globulin (SHBG), if measured', 'Albumin, if used for calculation', 'Specimen'],
  );
});

test('GGT (Gamma GT) uses a quantitative liver-enzyme report with laboratory-specific intervals', () => {
  const html = buildReportHtml(sampleReport({ name: 'GGT (Gamma GT)', sample_type: 'Serum', parameters: [
    { parameter_name: 'Gamma-Glutamyl Transferase (GGT), Serum', value: '42', unit: 'U/L', normal_range: 'Laboratory interval' },
    { parameter_name: 'Method / Analyzer', value: 'Validated laboratory method' },
  ] }));
  assert.match(html, /<div class="test-title">GAMMA GLUTAMYL TRANSFERASE \(GGT\)<\/div>/);
  assert.match(html, /data-report-content="ggt"/);
  assert.match(html, /GAMMA-GLUTAMYL TRANSFERASE \(GGT\)/);
  assert.match(html, /Medication exposure and recent alcohol intake can affect GGT activity/);
  assert.deepEqual(
    getFallbackReportParameters({ name: 'GGT (Gamma GT)' }).slice(0, 3).map(parameter => parameter.parameterName),
    ['Gamma-Glutamyl Transferase (GGT), Serum', 'Specimen', 'Method / Analyzer'],
  );
});

test('Gastrin Level records fasting and medication context without diagnosing from an isolated result', () => {
  const html = buildReportHtml(sampleReport({ name: 'Gastrin Level', sample_type: 'Serum', parameters: [
    { parameter_name: 'Gastrin, Serum', value: '145', unit: 'pg/mL' },
    { parameter_name: 'Fasting Duration / Collection Time', value: '12 hours; 08:00' },
    { parameter_name: 'Acid-Suppression Medication / PPI History', value: 'As documented by requesting clinician' },
  ] }));
  assert.match(html, /<div class="test-title">GASTRIN, SERUM<\/div>/);
  assert.match(html, /data-report-content="gastrin-level"/);
  assert.match(html, /proton-pump inhibitors, can increase serum gastrin/);
  assert.match(html, /does not establish a cause of hypergastrinaemia or a diagnosis/);
  assert.deepEqual(
    getFallbackReportParameters({ name: 'Gastrin Level' }).slice(0, 4).map(parameter => parameter.parameterName),
    ['Gastrin, Serum', 'Fasting Duration / Collection Time', 'Acid-Suppression Medication / PPI History', 'Gastrointestinal Motility Medication History'],
  );
});

test('Glucose Random records collection context without diagnosing from an isolated result', () => {
  const html = buildReportHtml(sampleReport({ name: 'Glucose Random', sample_type: 'Plasma', parameters: [
    { parameter_name: 'Random Plasma Glucose', value: '156', unit: 'mg/dL' },
    { parameter_name: 'Collection Date / Time', value: '2026-10-05 10:30' },
    { parameter_name: 'Time Since Last Meal / Meal Context', value: '2 hours after breakfast' },
  ] }));
  assert.match(html, /<div class="test-title">RANDOM PLASMA GLUCOSE<\/div>/);
  assert.match(html, /data-report-content="random-glucose"/);
  assert.match(html, /Random glucose is collected without a required fasting interval/);
  assert.match(html, /An isolated random glucose result does not establish diabetes/);
  assert.deepEqual(
    getFallbackReportParameters({ name: 'Glucose Random' }).slice(0, 4).map(parameter => parameter.parameterName),
    ['Random Plasma Glucose', 'Collection Date / Time', 'Time Since Last Meal / Meal Context', 'Specimen'],
  );
});

test('HAV Total separates combined antibody detection from acute HAV diagnosis', () => {
  const html = buildReportHtml(sampleReport({ name: 'HAV Total (IgG + IgM)', sample_type: 'Serum', parameters: [
    { parameter_name: 'Total Anti-HAV (IgG + IgM)', value: 'Reactive', normal_range: 'Laboratory-validated qualitative interpretation' },
    { parameter_name: 'Assay / Method', value: 'Validated total anti-HAV immunoassay' },
    { parameter_name: 'Anti-HAV IgM, if performed', value: 'Not performed' },
  ] }));
  assert.match(html, /<div class="test-title">HEPATITIS A TOTAL ANTIBODY \(ANTI-HAV, IgG \+ IgM\)<\/div>/);
  assert.match(html, /data-report-content="hav-total"/);
  assert.match(html, /Total anti-HAV measures combined IgG and IgM antibodies/);
  assert.match(html, /do not use total antibody alone to diagnose acute illness/);
  assert.deepEqual(
    getFallbackReportParameters({ name: 'HAV Total (IgG + IgM)' }).slice(0, 4).map(parameter => parameter.parameterName),
    ['Total Anti-HAV (IgG + IgM)', 'Assay / Method', 'Specimen', 'Anti-HAV IgM, if performed'],
  );
});

test('HBDH (LDH - 1) has a method-aware enzyme format without a diagnostic conclusion', () => {
  const html = buildReportHtml(sampleReport({ name: 'HBDH (LDH - 1)', sample_type: 'Serum', parameters: [
    { parameter_name: 'Alpha-Hydroxybutyrate Dehydrogenase (HBDH)', value: '165', unit: 'U/L', normal_range: 'Laboratory interval' },
    { parameter_name: 'Method / Analyzer', value: 'Validated kinetic method' },
    { parameter_name: 'Hemolysis / Specimen Quality Comment', value: 'No visible haemolysis' },
  ] }));
  assert.match(html, /<div class="test-title">ALPHA-HYDROXYBUTYRATE DEHYDROGENASE \(HBDH \/ LDH-1\)<\/div>/);
  assert.match(html, /data-report-content="hbdh"/);
  assert.match(html, /Do not use an isolated HBDH or HBDH\/LDH result to diagnose/);
  assert.match(html, /Haemolysis and specimen quality can affect enzyme activity measurements/);
  assert.deepEqual(
    getFallbackReportParameters({ name: 'HBDH (LDH - 1)' }).slice(0, 4).map(parameter => parameter.parameterName),
    ['Alpha-Hydroxybutyrate Dehydrogenase (HBDH)', 'Specimen', 'Method / Analyzer', 'Total LDH, if measured'],
  );
});

test('HBsAg Quantitative preserves assay context without assigning HBV phase from one result', () => {
  const html = buildReportHtml(sampleReport({ name: 'HBsAg Quantitative', sample_type: 'Serum', parameters: [
    { parameter_name: 'HBsAg, Quantitative', value: '325', unit: 'IU/mL', normal_range: 'Laboratory interval' },
    { parameter_name: 'Assay / Method', value: 'Validated quantitative immunoassay' },
    { parameter_name: 'HBV DNA, if measured', value: 'Not measured' },
  ] }));
  assert.match(html, /<div class="test-title">HEPATITIS B SURFACE ANTIGEN \(HBsAg\), QUANTITATIVE<\/div>/);
  assert.match(html, /data-report-content="hbsag-quantitative"/);
  assert.match(html, /does not establish acute versus chronic infection, infectivity, treatment eligibility, or treatment response/);
  assert.match(html, /do not derive a trend from a single measurement/);
  assert.deepEqual(
    getFallbackReportParameters({ name: 'HBsAg Quantitative' }).slice(0, 4).map(parameter => parameter.parameterName),
    ['HBsAg, Quantitative', 'Assay / Method', 'Specimen', 'Qualitative HBsAg / Neutralization Confirmation, if performed'],
  );
});

test('Hepatitis B Viral DNA Qualitative distinguishes qualitative detection from viral-load quantitation', () => {
  const html = buildReportHtml(sampleReport({ name: 'Hepatitis B Viral DNA Qualitative', sample_type: 'Serum', parameters: [
    { parameter_name: 'HBV DNA, Qualitative', value: 'Detected' },
    { parameter_name: 'Assay / Method', value: 'Validated real-time PCR' },
    { parameter_name: 'Analytical Sensitivity / Detection Limit', value: 'Assay-specific' },
    { parameter_name: 'Internal Control / Run Validity', value: 'Valid' },
  ] }));
  assert.match(html, /<div class="test-title">HEPATITIS B VIRUS \(HBV\) DNA - QUALITATIVE<\/div>/);
  assert.match(html, /data-report-content="hbv-dna-qualitative"/);
  assert.match(html, /Detected/);
  assert.match(html, /does not provide a viral-load value/);
  assert.match(html, /must not alone determine acute versus chronic infection/);
  assert.deepEqual(
    getFallbackReportParameters({ name: 'Hepatitis B Viral DNA Qualitative' }).slice(0, 6).map(parameter => parameter.parameterName),
    ['HBV DNA, Qualitative', 'Assay / Method', 'Specimen', 'Assay Target / Genomic Region, if reported', 'Analytical Sensitivity / Detection Limit', 'Internal Control / Run Validity'],
  );
});

test('Hepatitis B Virus Treatment (Follow Up) supports longitudinal molecular monitoring', () => {
  const html = buildReportHtml(sampleReport({ name: 'Hepatitis B Virus Treatment (Follow Up)', sample_type: 'Plasma', parameters: [
    { parameter_name: 'HBV DNA, Quantitative', value: '1250', unit: 'IU/mL' },
    { parameter_name: 'HBV DNA, Log10', value: '3.10', unit: 'log10 IU/mL' },
    { parameter_name: 'Antiviral Treatment / Regimen, if provided', value: 'As documented by treating clinician' },
  ] }));
  assert.match(html, /<div class="test-title">HEPATITIS B VIRUS \(HBV\) TREATMENT FOLLOW-UP<\/div>/);
  assert.match(html, /data-report-content="hbv-treatment-follow-up"/);
  assert.match(html, /below the lower quantification limit is not the same as an undetected result/);
  assert.match(html, /must not alone determine treatment response, treatment failure, infectivity, liver disease stage, or a treatment change/);
  assert.deepEqual(
    getFallbackReportParameters({ name: 'Hepatitis B Virus Treatment (Follow Up)' }).slice(0, 6).map(parameter => parameter.parameterName),
    ['HBV DNA, Quantitative', 'HBV DNA, Log10', 'HBV DNA Detection / Quantification Status', 'Assay / Method', 'Specimen', 'Lower Limit of Quantification / Detection'],
  );
});

test('HepatitisProfile distinguishes reported components from unperformed hepatitis tests', () => {
  const html = buildReportHtml(sampleReport({ name: 'HepatitisProfile', sample_type: 'Serum', parameters: [
    { parameter_name: 'HBsAg, if performed', value: 'Non-reactive' },
    { parameter_name: 'Anti-HCV / HCV Antibody, if performed', value: 'Reactive' },
    { parameter_name: 'HCV RNA / NAT, if performed', value: 'Not performed' },
  ] }));
  assert.match(html, /<div class="test-title">HEPATITIS PROFILE<\/div>/);
  assert.match(html, /data-report-content="hepatitis-profile"/);
  assert.match(html, /a blank or not-performed component must not be interpreted as a negative result/);
  assert.match(html, /does not by itself establish current viraemia, disease stage, or the timing of infection/);
  assert.deepEqual(
    getFallbackReportParameters({ name: 'HepatitisProfile' }).slice(0, 7).map(parameter => parameter.parameterName),
    ['Anti-HAV IgM, if performed', 'HBsAg, if performed', 'Anti-HBc IgM, if performed', 'HBeAg / Anti-HBe, if performed', 'Anti-HCV / HCV Antibody, if performed', 'HCV RNA / NAT, if performed', 'Anti-HEV IgM, if performed'],
  );
});

test('Herpes Simplex Virus- 2 (HSV-2) IgG keeps antibody detection separate from active disease', () => {
  const html = buildReportHtml(sampleReport({ name: 'Herpes Simplex Virus- 2 (HSV-2) IgG', sample_type: 'Serum', parameters: [
    { parameter_name: 'HSV-2 IgG', value: 'Reactive', unit: 'Index' },
    { parameter_name: 'Assay / Method', value: 'Type-specific validated immunoassay' },
    { parameter_name: 'Lesion PCR / Culture, if performed', value: 'Not performed' },
  ] }));
  assert.match(html, /<div class="test-title">HERPES SIMPLEX VIRUS TYPE 2 \(HSV-2\) IgG<\/div>/);
  assert.match(html, /data-report-content="hsv2-igg"/);
  assert.match(html, /does not establish the timing of infection, identify an active lesion, or prove the site of infection/);
  assert.match(html, /direct testing of the lesion by a validated molecular assay or culture may be clinically more informative/);
  assert.deepEqual(
    getFallbackReportParameters({ name: 'Herpes Simplex Virus- 2 (HSV-2) IgG' }).slice(0, 6).map(parameter => parameter.parameterName),
    ['HSV-2 IgG', 'Assay / Method', 'Specimen', 'Signal / Cutoff Index, if reported', 'HSV-2 Qualitative Interpretation', 'HSV-1 IgG / Type-Specific Context, if performed'],
  );
});

test('Herpes Simplex Virus- 2 (HSV-2) IgM does not imply new or type-specific HSV-2 infection', () => {
  const html = buildReportHtml(sampleReport({ name: 'Herpes Simplex Virus- 2 (HSV-2) IgM', sample_type: 'Serum', parameters: [
    { parameter_name: 'HSV-2 IgM', value: 'Reactive', unit: 'Index' },
    { parameter_name: 'Assay / Method', value: 'Validated immunoassay' },
    { parameter_name: 'Lesion PCR / Culture, if performed', value: 'Not performed' },
  ] }));
  assert.match(html, /<div class="test-title">HERPES SIMPLEX VIRUS TYPE 2 \(HSV-2\) IgM<\/div>/);
  assert.match(html, /data-report-content="hsv2-igm"/);
  assert.match(html, /not type-specific and a reactive HSV IgM result must not be used alone to diagnose a new HSV-2 infection/);
  assert.match(html, /direct testing of the lesion by a validated molecular assay or culture is preferred for diagnosis/);
  assert.deepEqual(
    getFallbackReportParameters({ name: 'Herpes Simplex Virus- 2 (HSV-2) IgM' }).slice(0, 6).map(parameter => parameter.parameterName),
    ['HSV-2 IgM', 'Assay / Method', 'Specimen', 'Signal / Cutoff Index, if reported', 'HSV IgM Qualitative Interpretation', 'HSV-1 / HSV-2 Type-Specific IgG, if performed'],
  );
});

test('Herpes Simplex Virus-1(HSV-1) IgG does not infer infection site or timing', () => {
  const html = buildReportHtml(sampleReport({ name: 'Herpes Simplex Virus-1(HSV-1) IgG', sample_type: 'Serum', parameters: [
    { parameter_name: 'HSV-1 IgG', value: 'Reactive', unit: 'Index' },
    { parameter_name: 'Assay / Method', value: 'Type-specific validated immunoassay' },
    { parameter_name: 'Lesion PCR / Culture, if performed', value: 'Not performed' },
  ] }));
  assert.match(html, /<div class="test-title">HERPES SIMPLEX VIRUS TYPE 1 \(HSV-1\) IgG<\/div>/);
  assert.match(html, /data-report-content="hsv1-igg"/);
  assert.match(html, /does not establish the timing of infection, identify an active lesion, or determine whether infection is oral or genital/);
  assert.match(html, /direct testing of the lesion by a validated molecular assay or culture may be clinically more informative/);
  assert.deepEqual(
    getFallbackReportParameters({ name: 'Herpes Simplex Virus-1(HSV-1) IgG' }).slice(0, 6).map(parameter => parameter.parameterName),
    ['HSV-1 IgG', 'Assay / Method', 'Specimen', 'Signal / Cutoff Index, if reported', 'HSV-1 Qualitative Interpretation', 'HSV-2 IgG / Type-Specific Context, if performed'],
  );
});

test('Herpes Simplex Virus-1(HSV-1) IgM does not imply new or type-specific HSV-1 infection', () => {
  const html = buildReportHtml(sampleReport({ name: 'Herpes Simplex Virus-1(HSV-1) IgM', sample_type: 'Serum', parameters: [
    { parameter_name: 'HSV-1 IgM', value: 'Reactive', unit: 'Index' },
    { parameter_name: 'Assay / Method', value: 'Validated immunoassay' },
    { parameter_name: 'Lesion PCR / Culture, if performed', value: 'Not performed' },
  ] }));
  assert.match(html, /<div class="test-title">HERPES SIMPLEX VIRUS TYPE 1 \(HSV-1\) IgM<\/div>/);
  assert.match(html, /data-report-content="hsv1-igm"/);
  assert.match(html, /not type-specific and a reactive HSV IgM result must not be used alone to diagnose a new HSV-1 infection/);
  assert.match(html, /direct testing of the lesion by a validated molecular assay or culture is preferred for diagnosis/);
  assert.deepEqual(
    getFallbackReportParameters({ name: 'Herpes Simplex Virus-1(HSV-1) IgM' }).slice(0, 6).map(parameter => parameter.parameterName),
    ['HSV-1 IgM', 'Assay / Method', 'Specimen', 'Signal / Cutoff Index, if reported', 'HSV IgM Qualitative Interpretation', 'HSV-1 / HSV-2 Type-Specific IgG, if performed'],
  );
});

test('Histology Biopsy Per Section uses a structured qualitative histopathology report', () => {
  const html = buildReportHtml(sampleReport({ name: 'Histology Biopsy Per Section', sample_type: 'Tissue', parameters: [
    { parameter_name: 'Clinical History', value: 'Clinical details as supplied.' },
    { parameter_name: 'Specimen', value: 'Tissue biopsy, site stated on container.' },
    { parameter_name: 'Diagnosis', value: 'Pathologist diagnosis entered after review.' },
  ] }));
  assert.match(html, /<div class="test-title">HISTOLOGY BIOPSY - PER SECTION<\/div>/);
  assert.match(html, /histopathology-report-body/);
  assert.match(html, /Pathologist diagnosis entered after review/);
  assert.deepEqual(
    getFallbackReportParameters({ name: 'Histology Biopsy Per Section' }).map(parameter => parameter.parameterName),
    ['Clinical History', 'Specimen', 'Diagnosis', 'Note', 'Gross Description', 'Microscopic Description'],
  );
});

test('Homo cystine - Blood preserves the catalogue analyte without guessing an interchangeable assay', () => {
  const html = buildReportHtml(sampleReport({ name: 'Homo cystine - Blood', parameters: [
    { parameter_name: 'Homocystine, Blood', value: '12.4', unit: 'µmol/L' },
    { parameter_name: 'Method / Analyzer', value: 'Validated laboratory method' },
  ] }));
  assert.match(html, /<div class="test-title">HOMOCYSTINE - BLOOD<\/div>/);
  assert.match(html, /data-report-content="homocystine-blood"/);
  assert.match(html, /preserves the catalogue term “Homocystine”/);
  assert.deepEqual(getFallbackReportParameters({ name: 'Homo cystine - Blood' }).slice(0, 4).map(parameter => parameter.parameterName), ['Homocystine, Blood', 'Specimen / Anticoagulant', 'Collection / Processing Details', 'Method / Analyzer']);
});

test('Homo cystine - Urine records timed-collection context without inventing a reference interval', () => {
  const html = buildReportHtml(sampleReport({ name: 'Homo cystine - Urine', sample_type: 'Urine', parameters: [
    { parameter_name: 'Homocystine, Urine', value: '8.2', unit: 'µmol/L' },
    { parameter_name: 'Urine Collection Type / Duration', value: 'Spot urine' },
  ] }));
  assert.match(html, /<div class="test-title">HOMOCYSTINE - URINE<\/div>/);
  assert.match(html, /data-report-content="homocystine-urine"/);
  assert.match(html, /do not treat it as interchangeable with a different assay/);
  assert.deepEqual(getFallbackReportParameters({ name: 'Homo cystine - Urine' }).slice(0, 4).map(parameter => parameter.parameterName), ['Homocystine, Urine', 'Urine Collection Type / Duration', 'Total Urine Volume, if timed collection', 'Urine Creatinine / Normalization, if reported']);
});

test('Hypertension Profile only presents components actually performed', () => {
  const html = buildReportHtml(sampleReport({ name: 'Hypertension Profile', sample_type: 'Serum', parameters: [
    { parameter_name: 'Serum Creatinine / eGFR, if performed', value: 'Creatinine 0.9 mg/dL; eGFR 98 mL/min/1.73 m²' },
    { parameter_name: 'Serum Potassium, if performed', value: '4.1 mmol/L' },
  ] }));
  assert.match(html, /<div class="test-title">HYPERTENSION PROFILE<\/div>/);
  assert.match(html, /data-report-content="hypertension-profile"/);
  assert.match(html, /A blank or not-performed component must not be interpreted as a normal or negative result/);
  assert.match(html, /does not establish the cause of hypertension or a treatment plan/);
  assert.deepEqual(getFallbackReportParameters({ name: 'Hypertension Profile' }).slice(0, 5).map(parameter => parameter.parameterName), ['Serum Creatinine / eGFR, if performed', 'Serum Sodium, if performed', 'Serum Potassium, if performed', 'Fasting Plasma Glucose / HbA1c, if performed', 'Lipid Profile Summary, if performed']);
});

test('HCV Total (IgM + IgG) keeps combined antibody detection separate from current infection', () => {
  const html = buildReportHtml(sampleReport({ name: 'HCV Total (IgM + IgG)', sample_type: 'Serum', parameters: [
    { parameter_name: 'Total Anti-HCV (IgM + IgG)', value: 'Reactive', normal_range: 'Laboratory interpretation' },
    { parameter_name: 'Assay / Method', value: 'Validated immunoassay' },
    { parameter_name: 'HCV RNA / NAT, if performed', value: 'Not performed' },
  ] }));
  assert.match(html, /<div class="test-title">HEPATITIS C VIRUS \(HCV\) TOTAL ANTIBODY \(IgM \+ IgG\)<\/div>/);
  assert.match(html, /data-report-content="hcv-total-antibody"/);
  assert.match(html, /does not by itself distinguish current infection, resolved past infection, or a biologic false-positive result/);
  assert.match(html, /HCV RNA \/ nucleic-acid testing is needed to determine whether current viraemia is present/);
  assert.deepEqual(
    getFallbackReportParameters({ name: 'HCV Total (IgM + IgG)' }).slice(0, 5).map(parameter => parameter.parameterName),
    ['Total Anti-HCV (IgM + IgG)', 'Assay / Method', 'Specimen', 'Individual Anti-HCV IgM / IgG, if separately performed', 'HCV RNA / NAT, if performed'],
  );
});

test('Hepatitis C Virus (HCV) Antibody IgG keeps antibody detection distinct from HCV RNA', () => {
  const html = buildReportHtml(sampleReport({ name: 'Hepatitis C Virus (HCV) Antibody IgG', sample_type: 'Serum', parameters: [
    { parameter_name: 'HCV Antibody IgG', value: 'Reactive' },
    { parameter_name: 'Assay / Method', value: 'Validated chemiluminescent immunoassay' },
    { parameter_name: 'HCV RNA / NAT, if performed', value: 'Not performed' },
  ] }));
  assert.match(html, /<div class="test-title">HEPATITIS C VIRUS \(HCV\) ANTIBODY IgG<\/div>/);
  assert.match(html, /data-report-content="hcv-antibody-igg"/);
  assert.match(html, /current infection, past resolved infection, or a biologic false-reactive result/);
  assert.match(html, /HCV RNA nucleic-acid testing is needed to determine whether current viraemia is present/);
  assert.deepEqual(
    getFallbackReportParameters({ name: 'Hepatitis C Virus (HCV) Antibody IgG' }).slice(0, 6).map(parameter => parameter.parameterName),
    ['HCV Antibody IgG', 'Assay / Method', 'Specimen', 'Signal / Cutoff Index, if reported', 'HCV Antibody Screen / Confirmation Context, if available', 'HCV RNA / NAT, if performed'],
  );
});

test('Hepatitis C Virus (HCV) Antibody IgM does not label IgM as an acute HCV diagnosis', () => {
  const html = buildReportHtml(sampleReport({ name: 'Hepatitis C Virus (HCV) Antibody IgM', sample_type: 'Serum', parameters: [
    { parameter_name: 'HCV Antibody IgM', value: 'Reactive' },
    { parameter_name: 'Assay / Method', value: 'Validated immunoassay' },
    { parameter_name: 'HCV RNA / NAT, if performed', value: 'Not performed' },
  ] }));
  assert.match(html, /<div class="test-title">HEPATITIS C VIRUS \(HCV\) ANTIBODY IgM<\/div>/);
  assert.match(html, /data-report-content="hcv-antibody-igm"/);
  assert.match(html, /must not be used alone to diagnose recent or acute HCV infection/);
  assert.match(html, /HCV RNA nucleic-acid testing is needed to determine whether current viraemia is present/);
  assert.deepEqual(
    getFallbackReportParameters({ name: 'Hepatitis C Virus (HCV) Antibody IgM' }).slice(0, 6).map(parameter => parameter.parameterName),
    ['HCV Antibody IgM', 'Assay / Method', 'Specimen', 'Signal / Cutoff Index, if reported', 'HCV Antibody IgG / Total Antibody Context, if available', 'HCV RNA / NAT, if performed'],
  );
});

test('Hepatitis C RNA PCR (Quantitative) retains quantitative and logarithmic viral-load fields', () => {
  const html = buildReportHtml(sampleReport({ name: 'Hepatitis C RNA PCR (Quantitative)', sample_type: 'Serum', parameters: [
    { parameter_name: 'HCV RNA, Quantitative', value: '124500', unit: 'IU/mL' },
    { parameter_name: 'HCV RNA, Log10', value: '5.10', unit: 'log10 IU/mL' },
    { parameter_name: 'Result Interpretation', value: 'Quantified' },
    { parameter_name: 'Assay / Method', value: 'Validated real-time RT-PCR' },
  ] }));
  assert.match(html, /<div class="test-title">HEPATITIS C VIRUS \(HCV\) RNA PCR - QUANTITATIVE<\/div>/);
  assert.match(html, /data-report-content="hcv-rna-quantitative"/);
  assert.match(html, /124500/);
  assert.match(html, /Detected below the lower quantification limit is not equivalent to undetected/);
  assert.match(html, /must not alone determine disease stage or treatment decisions/);
  assert.deepEqual(
    getFallbackReportParameters({ name: 'Hepatitis C RNA PCR (Quantitative)' }).slice(0, 6).map(parameter => parameter.parameterName),
    ['HCV RNA, Quantitative', 'HCV RNA, Log10', 'Result Interpretation', 'Assay / Method', 'Specimen', 'Lower / Upper Limit of Quantification'],
  );
});

test('HD,DC&ESR is a focused haemoglobin, differential count and ESR format', () => {
  const html = buildReportHtml(sampleReport({ name: 'HD,DC&ESR', sample_type: 'Whole Blood', parameters: [
    { parameter_name: 'Hemoglobin (Hb)', value: '13.8', unit: 'g/dL', normal_range: '13.0 - 17.0' },
    { parameter_name: 'Neutrophils', value: '58', unit: '%', normal_range: '40 - 75' },
    { parameter_name: 'ESR', value: '12', unit: 'mm/hr', normal_range: '0 - 15' },
  ] }));
  assert.match(html, /<div class="test-title">Haemoglobin, Differential Leucocyte Count \(DLC\) & ESR<\/div>/);
  assert.match(html, /data-report-content="hb-dlc-esr"/);
  assert.match(html, /Hemoglobin \(Hb\)/);
  assert.match(html, /DIFFERENTIAL WBC COUNT/);
  assert.match(html, /<div class="cbc-investigation">ESR<\/div>/);
  assert.doesNotMatch(html, /Total WBC Count/);
  assert.deepEqual(
    getFallbackReportParameters({ name: 'HD,DC&ESR' }).map(parameter => parameter.parameterName),
    ['Hemoglobin (Hb)', 'Neutrophils', 'Lymphocytes', 'Eosinophils', 'Monocytes', 'Basophils', 'ESR'],
  );
});

test('Hb + TLC/TC/WBC + DLC + ESR Profile renders all requested haematology fields together', () => {
  const html = buildReportHtml(sampleReport({ name: 'Hb + TLC/TC/WBC + DLC + ESR Profile', sample_type: 'Whole Blood', parameters: [
    { parameter_name: 'Hemoglobin (Hb)', value: '13.8', unit: 'g/dL' },
    { parameter_name: 'Total Leucocyte Count (TLC)', value: '7200', unit: 'cells/cumm' },
    { parameter_name: 'Neutrophils', value: '58', unit: '%' },
    { parameter_name: 'ESR', value: '12', unit: 'mm/hr' },
  ] }));
  assert.match(html, /<div class="test-title">Hb \+ TLC\/TC\/WBC \+ DLC \+ ESR Profile<\/div>/);
  assert.match(html, /data-report-content="hb-tlc-dlc-esr-profile"/);
  assert.match(html, /Total Leucocyte Count \(TLC\)/);
  assert.match(html, /DIFFERENTIAL WBC COUNT/);
  assert.match(html, /<div class="cbc-investigation">ESR<\/div>/);
});

test('HDL : LDL keeps both cholesterol values visible with an optional calculated ratio', () => {
  const html = buildReportHtml(sampleReport({ name: 'HDL : LDL', sample_type: 'Serum', parameters: [
    { parameter_name: 'HDL Cholesterol', value: '52', unit: 'mg/dL', normal_range: '>= 40' },
    { parameter_name: 'LDL Cholesterol', value: '104', unit: 'mg/dL', normal_range: '< 100' },
  ] }));
  assert.match(html, /<div class="test-title">HDL : LDL RATIO<\/div>/);
  assert.match(html, /data-report-content="hdl-ldl-ratio"/);
  assert.match(html, />0\.50<\/td>/);
  assert.match(html, /No universal decision limit; interpret with the complete lipid profile/);
  assert.match(html, /Do not use this ratio alone to diagnose cardiovascular disease/);
  assert.deepEqual(
    getFallbackReportParameters({ name: 'HDL : LDL' }).map(parameter => parameter.parameterName),
    ['HDL Cholesterol', 'LDL Cholesterol', 'HDL : LDL Ratio', 'Method / Comments'],
  );
});

test('HDV Antibody separates exposure serology from active viraemia', () => {
  const html = buildReportHtml(sampleReport({ name: 'HDV Antibody', sample_type: 'Serum', parameters: [
    { parameter_name: 'Anti-HDV Antibody', value: 'Reactive', normal_range: 'Laboratory interpretation' },
    { parameter_name: 'HBsAg Status, if available', value: 'Reactive' },
    { parameter_name: 'HDV RNA, if performed', value: 'Not performed' },
  ] }));
  assert.match(html, /<div class="test-title">HEPATITIS D VIRUS \(HDV\) ANTIBODY<\/div>/);
  assert.match(html, /data-report-content="hdv-antibody"/);
  assert.match(html, /does not by itself establish active viraemic infection/);
  assert.match(html, /HDV RNA testing is used to assess active HDV viraemia/);
  assert.deepEqual(
    getFallbackReportParameters({ name: 'HDV Antibody' }).slice(0, 5).map(parameter => parameter.parameterName),
    ['Anti-HDV Antibody', 'Assay / Method', 'Specimen', 'HBsAg Status, if available', 'HDV RNA, if performed'],
  );
});

test('HEV Total (IgG + IgM) keeps total antibodies separate from acute HEV assessment', () => {
  const html = buildReportHtml(sampleReport({ name: 'HEV Total (IgG + IgM)', sample_type: 'Serum', parameters: [
    { parameter_name: 'Total Anti-HEV (IgG + IgM)', value: 'Reactive', normal_range: 'Laboratory interpretation' },
    { parameter_name: 'Anti-HEV IgM, if performed', value: 'Not performed' },
  ] }));
  assert.match(html, /<div class="test-title">HEPATITIS E VIRUS \(HEV\) TOTAL ANTIBODY \(IgG \+ IgM\)<\/div>/);
  assert.match(html, /data-report-content="hev-total-antibody"/);
  assert.match(html, /should not be used alone to determine acute HEV infection/);
  assert.match(html, /HEV RNA may be required in selected situations/);
  assert.deepEqual(
    getFallbackReportParameters({ name: 'HEV Total (IgG + IgM)' }).slice(0, 5).map(parameter => parameter.parameterName),
    ['Total Anti-HEV (IgG + IgM)', 'Assay / Method', 'Specimen', 'Anti-HEV IgM, if performed', 'HEV RNA, if performed'],
  );
});

test('Hepatitis E Virus (HEV) Antibody IgG distinguishes past exposure from active infection', () => {
  const html = buildReportHtml(sampleReport({ name: 'Hepatitis E Virus (HEV) Antibody IgG', sample_type: 'Serum', parameters: [
    { parameter_name: 'Anti-HEV IgG', value: 'Reactive' },
    { parameter_name: 'Assay / Method', value: 'Validated immunoassay' },
    { parameter_name: 'Anti-HEV IgM, if performed', value: 'Not performed' },
  ] }));
  assert.match(html, /<div class="test-title">HEPATITIS E VIRUS \(HEV\) ANTIBODY IgG<\/div>/);
  assert.match(html, /data-report-content="hev-antibody-igg"/);
  assert.match(html, /commonly consistent with previous exposure/);
  assert.match(html, /must not alone establish current or recent hepatitis E infection/);
  assert.deepEqual(
    getFallbackReportParameters({ name: 'Hepatitis E Virus (HEV) Antibody IgG' }).slice(0, 6).map(parameter => parameter.parameterName),
    ['Anti-HEV IgG', 'Assay / Method', 'Specimen', 'Signal / Cutoff Index, if reported', 'Anti-HEV IgM, if performed', 'HEV RNA, if performed'],
  );
});

test('Hepatitis E Virus (HEV) Antibody IgM does not overstate acute HEV diagnosis', () => {
  const html = buildReportHtml(sampleReport({ name: 'Hepatitis E Virus (HEV) Antibody IgM', sample_type: 'Serum', parameters: [
    { parameter_name: 'Anti-HEV IgM', value: 'Reactive' },
    { parameter_name: 'Assay / Method', value: 'Validated immunoassay' },
    { parameter_name: 'HEV RNA, if performed', value: 'Not performed' },
  ] }));
  assert.match(html, /<div class="test-title">HEPATITIS E VIRUS \(HEV\) ANTIBODY IgM<\/div>/);
  assert.match(html, /data-report-content="hev-antibody-igm"/);
  assert.match(html, /must not alone confirm acute infection/);
  assert.match(html, /consider HEV RNA testing when active infection needs clarification/);
  assert.deepEqual(
    getFallbackReportParameters({ name: 'Hepatitis E Virus (HEV) Antibody IgM' }).slice(0, 6).map(parameter => parameter.parameterName),
    ['Anti-HEV IgM', 'Assay / Method', 'Specimen', 'Signal / Cutoff Index, if reported', 'Anti-HEV IgG, if performed', 'HEV RNA, if performed'],
  );
});

test('HIV I & II presents reactive screening as preliminary and includes follow-up fields', () => {
  const html = buildReportHtml(sampleReport({ name: 'HIV I & II', sample_type: 'Serum', parameters: [
    { parameter_name: 'HIV 1 & 2 Result', value: 'Reactive', normal_range: 'Laboratory interpretation' },
    { parameter_name: 'HIV-1/HIV-2 Antibody Differentiation, if performed', value: 'Not performed' },
  ] }));
  assert.match(html, /<div class="test-title">HIV I &amp; II SCREENING<\/div>/);
  assert.match(html, /data-report-content="hiv-i-ii"/);
  assert.match(html, /reactive screening result is preliminary/);
  assert.match(html, /nucleic-acid testing is used to resolve possible acute infection/);
  assert.deepEqual(
    getFallbackReportParameters({ name: 'HIV I & II' }).slice(0, 5).map(parameter => parameter.parameterName),
    ['HIV 1 & 2 Result', 'Assay / Method', 'Specimen', 'HIV-1/HIV-2 Antigen/Antibody Screen, if performed', 'HIV-1/HIV-2 Antibody Differentiation, if performed'],
  );
});

test('HLA B27 reports the genetic marker without assigning a rheumatologic diagnosis', () => {
  const html = buildReportHtml(sampleReport({ name: 'HLA B27', sample_type: 'Whole Blood', parameters: [
    { parameter_name: 'HLA-B27 Result', value: 'Present', normal_range: 'Present / absent' },
    { parameter_name: 'Method / Platform', value: 'Validated molecular assay' },
  ] }));
  assert.match(html, /<div class="test-title">HLA-B27<\/div>/);
  assert.match(html, /data-report-content="hla-b27"/);
  assert.match(html, /does not establish a diagnosis by itself/);
  assert.match(html, /HLA-B27 occurs in some healthy people/);
  assert.deepEqual(
    getFallbackReportParameters({ name: 'HLA B27' }).map(parameter => parameter.parameterName),
    ['HLA-B27 Result', 'Method / Platform', 'Specimen', 'Clinical Indication', 'Interpretation / Comments'],
  );
});

test('Hanging Drop Preparation records direct microscopy without identifying an organism', () => {
  const html = buildReportHtml(sampleReport({ name: 'Hanging Drop Preparation', sample_type: 'Stool', parameters: [
    { parameter_name: 'Specimen / Source', value: 'Fresh stool' },
    { parameter_name: 'Motility Observation', value: 'Motile organisms observed' },
  ] }));
  assert.match(html, /<div class="test-title">HANGING DROP PREPARATION<\/div>/);
  assert.match(html, /data-report-content="hanging-drop-preparation"/);
  assert.match(html, /Motility must be distinguished from Brownian movement/);
  assert.match(html, /does not identify an organism or confirm an infectious diagnosis/);
  assert.deepEqual(
    getFallbackReportParameters({ name: 'Hanging Drop Preparation' }).map(parameter => parameter.parameterName),
    ['Specimen / Source', 'Macroscopic Description', 'Motility Observation', 'Organism Morphology / Observation', 'Method / Magnification', 'Correlation / Follow-up'],
  );
});

test('GTT preserves only documented glucose timepoints and protocol details', () => {
  const html = buildReportHtml(sampleReport({ name: 'GTT (Glucose Tolerance Test)', parameters: [
    { parameter_name: 'Fasting Plasma Glucose (0 Minute)', value: '88', unit: 'mg/dL' },
    { parameter_name: 'Glucose, 60 Minutes After Load, if collected', value: '154', unit: 'mg/dL' },
    { parameter_name: 'Glucose, 120 Minutes After Load, if collected', value: '118', unit: 'mg/dL' },
    { parameter_name: 'Glucose Load / Protocol', value: 'Documented local oral glucose protocol' },
  ] }));
  assert.match(html, /<div class="test-title">GLUCOSE TOLERANCE TEST \(GTT\)<\/div>/);
  assert.match(html, /data-report-content="glucose-tolerance-test"/);
  assert.match(html, /Only timepoints actually collected should be reported/);
  assert.match(html, /do not create an intermediate result/i);
  assert.deepEqual(
    getFallbackReportParameters({ name: 'GTT (Glucose Tolerance Test)' }).slice(0, 5).map(parameter => parameter.parameterName),
    ['Fasting Plasma Glucose (0 Minute)', 'Glucose, 30 Minutes After Load, if collected', 'Glucose, 60 Minutes After Load, if collected', 'Glucose, 90 Minutes After Load, if collected', 'Glucose, 120 Minutes After Load, if collected'],
  );
});

test('standalone Growth Hormone format does not imply a stimulation or suppression diagnosis', () => {
  const html = buildReportHtml(sampleReport({ name: 'GH (Growth Hormone)', sample_type: 'Serum', parameters: [
    { parameter_name: 'Growth Hormone (GH)', value: '2.1', unit: 'ng/mL' },
    { parameter_name: 'Collection Time / Fasting Status', value: '08:00; fasting as documented' },
    { parameter_name: 'Method / Analyzer', value: 'Validated immunoassay' },
  ] }));
  assert.match(html, /<div class="test-title">GROWTH HORMONE \(GH\)<\/div>/);
  assert.match(html, /data-report-content="growth-hormone"/);
  assert.match(html, /GH secretion is pulsatile/);
  assert.match(html, /Do not infer growth hormone excess or deficiency/);
  assert.deepEqual(
    getFallbackReportParameters({ name: 'GH (Growth Hormone)' }).slice(0, 4).map(parameter => parameter.parameterName),
    ['Growth Hormone (GH)', 'Specimen', 'Collection Time / Fasting Status', 'Method / Analyzer'],
  );
});

test('GH fasting with glucose keeps fasting analytes separate from a timed suppression study', () => {
  const html = buildReportHtml(sampleReport({ name: 'GH (Fasting + Glucose)', parameters: [
    { parameter_name: 'Growth Hormone (GH), Fasting', value: '1.8', unit: 'ng/mL' },
    { parameter_name: 'Fasting Plasma Glucose', value: '91', unit: 'mg/dL' },
    { parameter_name: 'Fasting Duration / Collection Time', value: '10 hours; 08:00' },
  ] }));
  assert.match(html, /<div class="test-title">GROWTH HORMONE \(GH\) WITH FASTING GLUCOSE<\/div>/);
  assert.match(html, /data-report-content="gh-fasting-glucose"/);
  assert.match(html, /Fasting glucose and fasting GH are separate measurements/);
  assert.match(html, /Do not infer a post-glucose GH response/);
  assert.deepEqual(
    getFallbackReportParameters({ name: 'GH (Fasting + Glucose)' }).slice(0, 3).map(parameter => parameter.parameterName),
    ['Growth Hormone (GH), Fasting', 'Fasting Plasma Glucose', 'Fasting Duration / Collection Time'],
  );
});

test('GH 90 minutes after glucose uses a timed suppression-study format without treating one point as diagnostic', () => {
  const html = buildReportHtml(sampleReport({ name: 'GH (90 Minutes after Glucose)', sample_type: 'Serum', parameters: [
    { parameter_name: 'Growth Hormone (GH), 90 Minutes After Glucose', value: '0.4', unit: 'ng/mL' },
    { parameter_name: 'Glucose, 90 Minutes After Load, if measured', value: '126', unit: 'mg/dL' },
    { parameter_name: 'Time After Glucose Load', value: '90 minutes' },
    { parameter_name: 'Glucose Load / Fasting Confirmation', value: 'Documented per local protocol' },
  ] }));
  assert.match(html, /<div class="test-title">GROWTH HORMONE \(GH\) - 90 MINUTES AFTER GLUCOSE<\/div>/);
  assert.match(html, /data-report-content="gh-90-glucose"/);
  assert.match(html, /Timed serum specimen from the documented glucose-suppression protocol/);
  assert.match(html, /not a diagnostic result by itself/);
  assert.deepEqual(
    getFallbackReportParameters({ name: 'GH (90 Minutes after Glucose)' }).slice(0, 4).map(parameter => parameter.parameterName),
    ['Growth Hormone (GH), 90 Minutes After Glucose', 'Glucose, 90 Minutes After Load, if measured', 'Time After Glucose Load', 'Glucose Load / Fasting Confirmation'],
  );
});

test('GAD65 Antibody uses a method-specific report without making a diagnosis from the result alone', () => {
  const html = buildReportHtml(sampleReport({ name: 'GAD65 Antibody', sample_type: 'Serum', parameters: [
    { parameter_name: 'GAD65 Antibody', value: 'Reported by laboratory', unit: 'nmol/L' },
    { parameter_name: 'Assay Qualitative Interpretation, if reported', value: 'Assay interpretation issued' },
    { parameter_name: 'Method / Analyzer', value: 'Validated laboratory method' },
    { parameter_name: 'Clinical Context / Indication', value: 'As provided by requesting clinician' },
  ] }));
  assert.match(html, /<div class="test-title">GAD65 ANTIBODY<\/div>/);
  assert.match(html, /data-report-content="gad65-antibody"/);
  assert.match(html, /GLUTAMIC ACID DECARBOXYLASE 65 \(GAD65\) ANTIBODY/);
  assert.match(html, /must not be used alone to assign a diabetes subtype/);
  assert.deepEqual(
    getFallbackReportParameters({ name: 'GAD65 Antibody' }).slice(0, 5).map(parameter => parameter.parameterName),
    ['GAD65 Antibody', 'Assay Qualitative Interpretation, if reported', 'Specimen', 'Method / Analyzer', 'Clinical Context / Indication'],
  );
});

test('Fungus Culture uses a specimen-aware mycology report without inventing microscopy or susceptibility results', () => {
  const html = buildReportHtml(sampleReport({ name: 'Fungus Culture', sample_type: 'Nail clipping', parameters: [
    { parameter_name: 'Specimen / Collection Site', value: 'Nail clipping, left great toe' },
    { parameter_name: 'Direct Microscopy / Stain, if performed', value: 'KOH microscopy performed' },
    { parameter_name: 'Culture Status (Preliminary / Final)', value: 'Final' },
    { parameter_name: 'Culture Result', value: 'Growth observed' },
    { parameter_name: 'Organism(s) Isolated', value: 'Organism identified by laboratory' },
    { parameter_name: 'Antifungal Susceptibility, if performed', value: '' },
  ] }));
  assert.match(html, /<div class="test-title">FUNGUS CULTURE<\/div>/);
  assert.match(html, /data-report-content="fungus-culture"/);
  assert.match(html, /Nail clipping, left great toe/);
  assert.match(html, /Antifungal susceptibility, if performed/);
  assert.match(html, /Culture, direct microscopy, identification, and antifungal susceptibility are separate steps/);
  assert.deepEqual(
    getFallbackReportParameters({ name: 'Fungus Culture' }).slice(0, 6).map(parameter => parameter.parameterName),
    ['Specimen / Collection Site', 'Direct Microscopy / Stain, if performed', 'Culture Status (Preliminary / Final)', 'Culture Result', 'Organism(s) Isolated', 'Identification Method, if performed'],
  );
});

test('Fungus Culture and Sensitivity keeps antifungal susceptibility distinct from culture findings', () => {
  const html = buildReportHtml(sampleReport({ name: 'Fungus Culture & Sensitivity', sample_type: 'Wound aspirate', parameters: [
    { parameter_name: 'Specimen / Collection Site', value: 'Wound aspirate, left foot' },
    { parameter_name: 'Culture Status (Preliminary / Final)', value: 'Final' },
    { parameter_name: 'Culture Result', value: 'Growth observed' },
    { parameter_name: 'Organism(s) Isolated', value: 'Organism identified by laboratory' },
    { parameter_name: 'Antifungal Susceptibility Method, if performed', value: 'Laboratory-validated method' },
    { parameter_name: 'Antifungal Agent / MIC or Category, if reported', value: 'As reported by laboratory' },
  ] }));
  assert.match(html, /<div class="test-title">FUNGUS CULTURE &amp; SENSITIVITY<\/div>/);
  assert.match(html, /data-report-content="fungus-culture-sensitivity"/);
  assert.match(html, /FUNGUS CULTURE &amp; ANTIFUNGAL SUSCEPTIBILITY/);
  assert.match(html, /not interchangeable with antibacterial drug sensitivity/);
  assert.deepEqual(
    getFallbackReportParameters({ name: 'Fungus Culture & Sensitivity' }).slice(0, 7).map(parameter => parameter.parameterName),
    ['Specimen / Collection Site', 'Direct Microscopy / Stain, if performed', 'Culture Status (Preliminary / Final)', 'Culture Result', 'Organism(s) Isolated', 'Identification Method, if performed', 'Antifungal Susceptibility Method, if performed'],
  );
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

test('CSF AFB stain is a dedicated direct-microscopy report without asserting a TB diagnosis', () => {
  const html = buildReportHtml(sampleReport({
    name: 'CSFFluidforAFBStain',
    sample_type: 'Cerebrospinal Fluid (CSF)',
    parameters: [
      { parameter_name: 'AFB Smear Microscopy Result', value: 'No acid-fast bacilli seen', unit: '', normal_range: '' },
      { parameter_name: 'AFB Smear Grade / Quantitation', value: 'Not applicable', unit: '', normal_range: '' },
      { parameter_name: 'Stain Method', value: 'Ziehl-Neelsen stain', unit: '', normal_range: '' },
      { parameter_name: 'Specimen Adequacy / Volume', value: 'Adequate CSF volume received', unit: '', normal_range: '' },
      { parameter_name: 'Microscopy Remarks', value: 'Correlate with mycobacterial culture and NAAT where indicated.', unit: '', normal_range: '' },
    ],
  }));
  assert.match(html, /<div class="test-title">AFB STAIN, CEREBROSPINAL FLUID<\/div>/);
  assert.match(html, /csf-afb-stain-table/);
  assert.match(html, /No acid-fast bacilli seen/);
  assert.match(html, /Ziehl-Neelsen stain/);
  assert.match(html, /do not identify the species or confirm <em>Mycobacterium tuberculosis<\/em> complex/);
  assert.match(html, /does not exclude tuberculous meningitis/);
  assert.doesNotMatch(html, /AFB detected/);
});

test('CSF Gram stain records microscopy separately from culture without assuming infection', () => {
  const html = buildReportHtml(sampleReport({
    name: 'CSFFluidforGramstain',
    sample_type: 'CSF',
    parameters: [
      { parameter_name: 'Smear Method / Preparation', value: 'Gram-stained centrifuged deposit', unit: '', normal_range: '' },
      { parameter_name: 'Inflammatory Cells / PMNs', value: 'Occasional polymorphs seen', unit: '', normal_range: '' },
      { parameter_name: 'Gram Stain Findings', value: 'No organisms seen', unit: '', normal_range: '' },
      { parameter_name: 'Gram Reaction / Bacterial Morphology', value: 'No bacterial morphology observed', unit: '', normal_range: '' },
      { parameter_name: 'Impression', value: 'Direct microscopy finding only', unit: '', normal_range: '' },
      { parameter_name: 'Culture / Molecular Test Status', value: 'Culture requested separately', unit: '', normal_range: '' },
    ],
  }));
  assert.match(html, /<div class="test-title">GRAM STAIN, CEREBROSPINAL FLUID<\/div>/);
  assert.match(html, /csf-gram-stain-table/);
  assert.match(html, /Gram-stained centrifuged deposit/);
  assert.match(html, /Culture requested separately/);
  assert.match(html, /does not provide definitive organism identification or antimicrobial susceptibility/);
  assert.match(html, /does not exclude infection/);
  assert.doesNotMatch(html, /Culture &amp; Sensitivity/);
});

test('CSF protein has a dedicated age-aware quantitative report', () => {
  const html = buildReportHtml(sampleReport({
    name: 'CSFFluidforProtein',
    sample_type: 'CSF',
    parameters: [
      { parameter_name: 'Total Protein, CSF', value: '52', unit: 'mg/dL', normal_range: 'Laboratory-validated, age-specific reference interval' },
      { parameter_name: 'Collection Date / Time', value: '30-Sep-2026 09:30', unit: '', normal_range: '' },
      { parameter_name: 'Appearance', value: 'Clear and colourless', unit: '', normal_range: '' },
      { parameter_name: 'Specimen Quality / Blood Contamination', value: 'No visible blood contamination', unit: '', normal_range: '' },
    ],
  }));
  assert.match(html, /<div class="test-title">TOTAL PROTEIN, CEREBROSPINAL FLUID<\/div>/);
  assert.match(html, /csf-protein-table/);
  assert.match(html, />52</);
  assert.match(html, /Laboratory-validated, age-specific reference interval/);
  assert.match(html, /Blood contamination from a traumatic lumbar puncture/);
  assert.match(html, /does not establish or exclude meningitis/);
  assert.doesNotMatch(html, /TOTAL PROTEIN, BODY FLUID/);
});

test('CSF specific gravity is method-aware and does not invent a universal interval', () => {
  const html = buildReportHtml(sampleReport({
    name: 'CSFFluidforSpecificGravity',
    sample_type: 'CSF',
    parameters: [
      { parameter_name: 'Specific Gravity, CSF', value: '1.006', unit: '', normal_range: 'Laboratory-validated, method-specific reference interval' },
      { parameter_name: 'Method / Instrument', value: 'Refractometry', unit: '', normal_range: '' },
      { parameter_name: 'Appearance', value: 'Clear and colourless', unit: '', normal_range: '' },
    ],
  }));
  assert.match(html, /<div class="test-title">SPECIFIC GRAVITY, CEREBROSPINAL FLUID<\/div>/);
  assert.match(html, /csf-specific-gravity-table/);
  assert.match(html, />1\.006</);
  assert.match(html, /Refractometry/);
  assert.match(html, /must be interpreted using the laboratory&rsquo;s validated method/);
  assert.match(html, /does not establish or exclude infection/);
});

test('CSF sugar reports paired serum glucose and ratio without a serum-only interpretation', () => {
  const html = buildReportHtml(sampleReport({
    name: 'CSFFluidforSugar',
    sample_type: 'CSF',
    parameters: [
      { parameter_name: 'Glucose, CSF', value: '54', unit: 'mg/dL', normal_range: 'Laboratory-validated, age-specific reference interval' },
      { parameter_name: 'Paired Serum / Plasma Glucose', value: '90', unit: 'mg/dL', normal_range: '' },
      { parameter_name: 'Method / Analyzer', value: 'Hexokinase method', unit: '', normal_range: '' },
    ],
  }));
  assert.match(html, /<div class="test-title">GLUCOSE, CEREBROSPINAL FLUID<\/div>/);
  assert.match(html, /csf-glucose-table/);
  assert.match(html, />54</);
  assert.match(html, />90</);
  assert.match(html, />0\.60</);
  assert.match(html, /paired serum or plasma glucose collected at approximately the same time/);
  assert.match(html, /does not establish or exclude meningitis/);
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

test('BACCAL smear for BRR body uses a dedicated Barr-body cytology screen without inventing a result', () => {
  const html = buildReportHtml(sampleReport({
    name: 'BACCAL Smear for BRR Body',
    sample_type: 'Buccal Smear',
    parameters: [
      { parameter_name: 'Specimen / Collection Site', value: 'Buccal mucosa, inner cheek', unit: '', normal_range: '' },
      { parameter_name: 'Stain / Method', value: 'Papanicolaou stain; light microscopy', unit: '', normal_range: '' },
      { parameter_name: 'Smear Adequacy', value: 'Adequate; intact epithelial nuclei present', unit: '', normal_range: '' },
      { parameter_name: 'Epithelial Cells Examined', value: '100', unit: 'cells', normal_range: '' },
      { parameter_name: 'Barr-body Positive Cells', value: '18', unit: 'cells', normal_range: '' },
      { parameter_name: 'Barr-body Positive Nuclei (%)', value: '18.0', unit: '%', normal_range: 'Laboratory-validated / stain-specific interpretive cut-off' },
      { parameter_name: 'Sex Chromatin (Barr Body) Finding', value: 'Barr bodies identified in a proportion of evaluable nuclei', unit: '', normal_range: '' },
      { parameter_name: 'Findings', value: 'Condensed chromatin apposed to the nuclear membrane in selected cells', unit: '', normal_range: '' },
      { parameter_name: 'Impression', value: 'Sex-chromatin-positive cytologic pattern', unit: '', normal_range: '' },
      { parameter_name: 'Comments', value: 'Confirmatory chromosome analysis may be considered when clinically indicated.', unit: '', normal_range: '' },
    ],
  }));
  assert.match(html, /<div class="test-title">BUCCAL SMEAR FOR BARR BODY \(SEX CHROMATIN\)<\/div>/);
  assert.match(html, /SEX CHROMATIN \/ BARR BODY ASSESSMENT/);
  assert.match(html, /Buccal mucosa, inner cheek/);
  assert.match(html, /Epithelial Cells Examined/);
  assert.match(html, /Barr-body Positive Nuclei \(%\)/);
  assert.match(html, />18\.0<\/td>/);
  assert.match(html, /Sex-chromatin-positive cytologic pattern/);
  assert.match(html, /does not by itself establish chromosomal complement/);
  assert.match(html, /may miss mosaicism, structural abnormalities/);

  const blank = buildReportHtml(sampleReport({ name: 'BACCAL Smear for BRR Body', sample_type: 'Buccal Smear', parameters: [] }));
  assert.match(blank, /Sex Chromatin \(Barr Body\) Finding<\/strong><\/td><td>-<\/td>/);
  assert.doesNotMatch(blank, /Barr bodies (?:identified|not identified)/i);

  const fallback = getFallbackReportParameters({ name: 'BACCAL Smear for BRR Body', sample_type: 'Buccal Smear' });
  const percentage = fallback.find(field => field.parameterName === 'Barr-body Positive Nuclei (%)');
  assert.equal(percentage.entryMode, 'calculated');
  assert.equal(percentage.calculationFormula, '{Barr-body Positive Cells} / {Epithelial Cells Examined} * 100');
  assert.ok(fallback.some(field => field.parameterName === 'Smear Adequacy'));
  assert.ok(fallback.some(field => field.parameterName === 'Interpretation / Impression'));

  const sexChromation = buildReportHtml(sampleReport({ name: 'Buccal SmearforSexChromation(B..)', sample_type: 'Buccal Smear', parameters: [] }));
  assert.match(sexChromation, /class="results-table buccal-barr-body-table"/);
  assert.match(sexChromation, /BUCCAL SMEAR FOR BARR BODY \(SEX CHROMATIN\)/);
  assert.equal(getFallbackReportParameters({ name: 'Buccal Smear for Sex Chromation' }).length, fallback.length);
});

test('Autoimmune Profile reports ANA, anti-dsDNA and C3 without claiming a diagnosis', () => {
  const html = buildReportHtml(sampleReport({
    name: 'Autoimmune Profile',
    sample_type: 'Serum',
    parameters: [
      { parameter_name: 'ANA Screen / Result', value: 'Positive', unit: '', normal_range: 'Negative' },
      { parameter_name: 'ANA Titer', value: '1:160', unit: '', normal_range: '< 1:80' },
      { parameter_name: 'ANA Pattern (ICAP)', value: 'Speckled nuclear pattern (AC-4)', unit: '', normal_range: '' },
      { parameter_name: 'Anti-dsDNA Antibody', value: '36', unit: 'IU/mL', normal_range: '< 10' },
      { parameter_name: 'Complement C3', value: '74', unit: 'mg/dL', normal_range: '90 - 180' },
      { parameter_name: 'Method / Platform', value: 'ANA by HEp-2 IFA; anti-dsDNA by immunoassay; C3 by immunoturbidimetry', unit: '', normal_range: '' },
      { parameter_name: 'Result / Findings', value: 'Correlate this serologic pattern with the clinical presentation.', unit: '', normal_range: '' },
      { parameter_name: 'Comments', value: 'Method-specific intervals printed above take precedence.', unit: '', normal_range: '' },
    ],
  }));
  assert.match(html, /<div class="test-title">AUTOIMMUNE PROFILE<\/div>/);
  assert.match(html, /SYSTEMIC AUTOIMMUNE SEROLOGY/);
  assert.match(html, /ANA Screen \/ Result/);
  assert.match(html, />1:160<\/span>/);
  assert.match(html, /Speckled nuclear pattern \(AC-4\)/);
  assert.match(html, /Anti-dsDNA Antibody/);
  assert.match(html, />36<\/span>/);
  assert.match(html, /Complement C3/);
  assert.match(html, />74<\/span>/);
  assert.match(html, /Correlate this serologic pattern with the clinical presentation\./);
  assert.match(html, /not a universal screen for every autoimmune disorder/);
  assert.match(html, /This profile alone does not establish or exclude a diagnosis/);

  const blank = buildReportHtml(sampleReport({ name: 'Autoimmune Profile', sample_type: 'Serum', parameters: [] }));
  assert.match(blank, /ANA Screen \/ Result<\/div>.*?<td><span>-<\/span><\/td>/s);
  assert.doesNotMatch(blank, /<td><span>(?:Positive|Negative)<\/span><\/td>/i);

  const fallback = getFallbackReportParameters({ name: 'Autoimmune Profile', sample_type: 'Serum' });
  assert.deepEqual(
    fallback.slice(0, 5).map(field => field.parameterName),
    ['ANA Screen / Result', 'ANA Titer', 'ANA Pattern (ICAP)', 'Anti-dsDNA Antibody', 'Complement C3']
  );
  assert.equal(fallback.find(field => field.parameterName === 'Anti-dsDNA Antibody').normalRange, 'Assay-specific reference interval');
  assert.equal(fallback.find(field => field.parameterName === 'Complement C3').unit, 'mg/dL');

  const separate = buildReportHtml(sampleReport({ name: 'Thyroid Autoimmune Profile', sample_type: 'Serum', parameters: [] }));
  assert.doesNotMatch(separate, /class="results-table cbc-table autoimmune-profile-table"/);
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

test('new calcium, capillary fragility, cardiac, and ceruloplasmin formats retain their clinical context', () => {
  const urineCalcium = buildReportHtml(sampleReport({
    name: 'Calcium(24 hrs Urine)', sample_type: '24-Hour Urine', parameters: [
      { parameter_name: 'Calcium, Urine, 24 Hour', value: '215', unit: 'mg/24 h', normal_range: 'Laboratory-validated, age- and sex-specific reference interval' },
      { parameter_name: 'Collection Duration', value: '24', unit: 'hours', normal_range: '24 hours unless otherwise stated' },
      { parameter_name: 'Total Urine Volume', value: '1800', unit: 'mL', normal_range: '' },
    ],
  }));
  assert.match(urineCalcium, /<div class="test-title">CALCIUM, 24-HOUR URINE<\/div>/);
  assert.match(urineCalcium, /TIMED URINE COLLECTION/);
  assert.match(urineCalcium, /reference interval applies only to a complete timed collection/);
  assert.match(urineCalcium, /does not diagnose kidney stone disease or another disorder by itself/);

  const capillaryFragility = buildReportHtml(sampleReport({ name: 'Capillary Fragility Test', parameters: [{ parameter_name: 'Capillary Fragility Test Result', value: 'Negative', unit: '', normal_range: 'Laboratory-approved interpretation' }] }));
  assert.match(capillaryFragility, /CAPILLARY FRAGILITY ASSESSMENT/);
  assert.match(capillaryFragility, /does not identify the cause of bleeding or bruising by itself/);

  const cardiac = buildReportHtml(sampleReport({ name: 'Cardiac Profile', parameters: [{ parameter_name: 'Troponin I', value: '8', unit: 'ng\/L', normal_range: 'Laboratory-validated assay interpretation' }, { parameter_name: 'CK-MB', value: '14', unit: 'U\/L', normal_range: '' }] }));
  assert.match(cardiac, /CARDIAC BIOMARKERS/);
  assert.match(cardiac, /serial measurements where indicated/);
  assert.match(cardiac, /does not independently confirm or exclude acute myocardial infarction/);

  const ceruloplasmin = buildReportHtml(sampleReport({ name: 'Ceruloplasmin', sample_type: 'Serum', parameters: [{ parameter_name: 'Ceruloplasmin, Serum', value: '21', unit: 'mg\/dL', normal_range: 'Laboratory-validated, age- and sex-specific reference interval' }] }));
  assert.match(ceruloplasmin, /COPPER METABOLISM/);
  assert.match(ceruloplasmin, /positive acute-phase reactant/);
  assert.match(ceruloplasmin, /not diagnostic by itself/);
});

test('Colorectal Cancer Monitor Profile has a structured, blank-safe serial monitoring format', () => {
  const html = buildReportHtml(sampleReport({
    name: 'Colorectal Cancer Monitor Profile', sample_type: 'Serum', parameters: [
      { parameter_name: 'Carcinoembryonic Antigen (CEA)', value: '3.2', unit: 'ng/mL', normal_range: 'Laboratory-validated reference interval' },
      { parameter_name: 'CA 19-9', value: '14', unit: 'U/mL', normal_range: 'Laboratory-validated reference interval' },
      { parameter_name: 'Zinc, Serum', value: '92', unit: 'µg/dL', normal_range: 'Laboratory-validated reference interval' },
      { parameter_name: 'Clinical Details / Monitoring Context', value: 'Oncology follow-up' },
    ],
  }));
  assert.match(html, /<div class="test-title">COLORECTAL CANCER MONITOR PROFILE<\/div>/);
  assert.match(html, /data-report-content="colorectal-cancer-monitor-profile"/);
  assert.match(html, /Carcinoembryonic Antigen \(CEA\)/);
  assert.match(html, /CA 19-9/);
  assert.match(html, /Zinc, Serum/);
  assert.match(html, /not a screening or diagnostic test for colorectal cancer/);
  assert.equal(getFallbackReportParameters({ name: 'Colorectal Cancer Monitor Profile' })[0].parameterName, 'Carcinoembryonic Antigen (CEA)');
});

test('ComplimentFixsation Test uses the Complement Fixation Test report format', () => {
  const html = buildReportHtml(sampleReport({
    name: 'ComplimentFixsation Test', sample_type: 'Serum', parameters: [
      { parameter_name: 'Target Antigen / Assay', value: 'Lab-entered target antigen' },
      { parameter_name: 'Complement Fixation Result', value: 'Lab-entered result', normal_range: 'Laboratory-validated interpretation' },
      { parameter_name: 'Complement Fixation Titre', value: '1:16' },
    ],
  }));
  assert.match(html, /<div class="test-title">COMPLEMENT FIXATION TEST \(CFT\)<\/div>/);
  assert.match(html, /COMPLEMENT FIXATION TEST/);
  assert.match(html, /Lab-entered target antigen/);
  assert.match(html, /CFT result alone does not identify the underlying disease/);
  assert.equal(getFallbackReportParameters({ name: 'ComplimentFixsation Test' })[1].parameterName, 'Complement Fixation Result');
});

test('ConjSwabBothEye keeps right and left conjunctival findings distinct', () => {
  const html = buildReportHtml(sampleReport({
    name: 'ConjSwabBothEye', sample_type: 'Bilateral Conjunctival Swabs', parameters: [
      { parameter_name: 'Right Eye Direct Microscopy / Gram Stain', value: 'Right-eye microscopy finding' },
      { parameter_name: 'Left Eye Direct Microscopy / Gram Stain', value: 'Left-eye microscopy finding' },
      { parameter_name: 'Right Eye Culture Result', value: 'Right-eye culture finding', normal_range: 'Laboratory-validated interpretation' },
      { parameter_name: 'Left Eye Culture Result', value: 'Left-eye culture finding', normal_range: 'Laboratory-validated interpretation' },
      { parameter_name: 'Right Eye Organism(s) Isolated', value: 'Right-eye isolate' },
      { parameter_name: 'Left Eye Organism(s) Isolated', value: 'Left-eye isolate' },
    ],
  }));
  assert.match(html, /<div class="test-title">CONJUNCTIVAL SWAB - BOTH EYES<\/div>/);
  assert.match(html, /data-report-content="bilateral-conjunctival-swab"/);
  assert.match(html, /RIGHT EYE CONJUNCTIVAL SWAB/);
  assert.match(html, /LEFT EYE CONJUNCTIVAL SWAB/);
  assert.match(html, /Right-eye culture finding/);
  assert.match(html, /Left-eye culture finding/);
  assert.match(html, /negative bacterial culture does not exclude viral, chlamydial, fungal/);
  assert.equal(getFallbackReportParameters({ name: 'ConjSwabBothEye' })[0].parameterName, 'Right Eye Specimen / Site');
});

test('ConjSwabC/SRtEye uses a right-eye culture and sensitivity format', () => {
  const html = buildReportHtml(sampleReport({
    name: 'ConjSwabC/SRtEye', sample_type: 'Right Conjunctival Swab', parameters: [
      { parameter_name: 'Right Eye Direct Microscopy / Gram Stain', value: 'Occasional polymorphs; no organisms seen' },
      { parameter_name: 'Right Eye Culture Result', value: 'Growth of clinically significant isolate', normal_range: 'Laboratory-validated interpretation' },
      { parameter_name: 'Right Eye Organism(s) Isolated', value: 'Lab-entered organism' },
      { parameter_name: 'Right Eye Antimicrobial Susceptibility', value: 'Lab-entered susceptibility' },
    ],
  }));
  assert.match(html, /<div class="test-title">CONJUNCTIVAL SWAB CULTURE & SENSITIVITY - RIGHT EYE<\/div>/);
  assert.match(html, /data-report-content="right-conjunctival-swab-culture"/);
  assert.match(html, /RIGHT EYE CONJUNCTIVAL SWAB/);
  assert.match(html, /Lab-entered organism/);
  assert.match(html, /negative bacterial culture does not exclude viral, chlamydial, fungal/);
  assert.equal(getFallbackReportParameters({ name: 'ConjSwabC/SRtEye' })[0].parameterName, 'Right Eye Specimen / Site');
});

test('Conjunctival Swab Culture is a specimen-neutral culture format', () => {
  const html = buildReportHtml(sampleReport({
    name: 'Conjunctival Swab Culture', sample_type: 'Conjunctival Swab', parameters: [
      { parameter_name: 'Direct Microscopy / Gram Stain', value: 'No organisms seen' },
      { parameter_name: 'Culture Result', value: 'No growth', normal_range: 'Laboratory-validated interpretation' },
      { parameter_name: 'Organism(s) Isolated', value: 'None isolated' },
    ],
  }));
  assert.match(html, /<div class="test-title">CONJUNCTIVAL SWAB CULTURE<\/div>/);
  assert.match(html, /data-report-content="conjunctival-swab-culture"/);
  assert.match(html, /Document the collection site and eye where applicable/);
  assert.doesNotMatch(html, /RIGHT EYE CONJUNCTIVAL SWAB/);
  assert.equal(getFallbackReportParameters({ name: 'Conjunctival Swab Culture' })[0].parameterName, 'Specimen / Site');
});

test('Coppe (24 hrs.urine) uses a complete timed urine copper format', () => {
  const html = buildReportHtml(sampleReport({
    name: 'Coppe (24 hrs.urine)', sample_type: '24-Hour Urine', parameters: [
      { parameter_name: 'Copper, 24-Hour Urine', value: '35', unit: 'mcg/24 h', normal_range: 'Laboratory-validated reference interval' },
      { parameter_name: 'Total Urine Volume', value: '1600', unit: 'mL' },
      { parameter_name: 'Collection Duration', value: '24', unit: 'hours', normal_range: '24' },
    ],
  }));
  assert.match(html, /<div class="test-title">COPPER, 24-HOUR URINE<\/div>/);
  assert.match(html, /data-report-content="urine-copper-24-hour"/);
  assert.match(html, /COPPER EXCRETION/);
  assert.match(html, /The completeness and recorded duration of the urine collection are essential/);
  assert.equal(getFallbackReportParameters({ name: 'Coppe (24 hrs.urine)' })[0].parameterName, 'Copper, 24-Hour Urine');
});

test('Copper(Urine) is a random-urine copper format, not a 24-hour collection', () => {
  const html = buildReportHtml(sampleReport({
    name: 'Copper(Urine)', sample_type: 'Random Urine', parameters: [
      { parameter_name: 'Copper, Random Urine', value: '2.1', unit: 'mcg/dL', normal_range: 'Laboratory-validated reference interval' },
      { parameter_name: 'Creatinine, Random Urine', value: '88', unit: 'mg/dL', normal_range: 'Laboratory-validated reference interval' },
      { parameter_name: 'Copper / Creatinine Ratio', value: '24', unit: 'mcg/g creatinine', normal_range: 'Laboratory-validated, age- and sex-specific reference interval' },
    ],
  }));
  assert.match(html, /<div class="test-title">COPPER, RANDOM URINE<\/div>/);
  assert.match(html, /data-report-content="random-urine-copper"/);
  assert.match(html, /This is a spot-urine result, not a 24-hour copper excretion measurement/);
  assert.equal(getFallbackReportParameters({ name: 'Copper(Urine)' })[0].parameterName, 'Copper, Random Urine');
});

test('Cortisol (Evening) records collection timing with the p.m. result', () => {
  const html = buildReportHtml(sampleReport({
    name: 'Cortisol (Evening)', sample_type: 'Serum', parameters: [
      { parameter_name: 'Cortisol, Evening', value: '7.8', unit: 'mcg/dL', normal_range: 'Laboratory-validated p.m. reference interval' },
      { parameter_name: 'Collection Time', value: '18:00' },
    ],
  }));
  assert.match(html, /<div class="test-title">CORTISOL, EVENING<\/div>/);
  assert.match(html, /data-report-content="evening-cortisol"/);
  assert.match(html, /18:00/);
  assert.match(html, /Cortisol has a marked diurnal rhythm/);
  assert.equal(getFallbackReportParameters({ name: 'Cortisol (Evening)' })[0].parameterName, 'Cortisol, Evening');
});

test('Cortisol (Midnight) preserves specimen and exact late-night collection details', () => {
  const html = buildReportHtml(sampleReport({
    name: 'Cortisol (Midnight)', sample_type: 'Saliva', parameters: [
      { parameter_name: 'Cortisol, Midnight', value: '88', unit: 'ng/dL', normal_range: 'Laboratory-validated late-night reference interval' },
      { parameter_name: 'Collection Time', value: '23:45' },
      { parameter_name: 'Specimen', value: 'Saliva' },
    ],
  }));
  assert.match(html, /<div class="test-title">CORTISOL, MIDNIGHT<\/div>/);
  assert.match(html, /data-report-content="midnight-cortisol"/);
  assert.match(html, /23:45/);
  assert.match(html, /Midnight cortisol must be interpreted using the stated specimen type/);
  assert.equal(getFallbackReportParameters({ name: 'Cortisol (Midnight)' })[0].parameterName, 'Cortisol, Midnight');
});

test('Cortisol (Morning&Evening) keeps both timepoints and collection times distinct', () => {
  const html = buildReportHtml(sampleReport({
    name: 'Cortisol (Morning&Evening)', sample_type: 'Serum', parameters: [
      { parameter_name: 'Cortisol, Morning', value: '16.2', unit: 'mcg/dL', normal_range: 'Laboratory-validated a.m. reference interval' },
      { parameter_name: 'Morning Collection Date / Time', value: '08:00' },
      { parameter_name: 'Cortisol, Evening', value: '6.4', unit: 'mcg/dL', normal_range: 'Laboratory-validated p.m. reference interval' },
      { parameter_name: 'Evening Collection Date / Time', value: '16:00' },
    ],
  }));
  assert.match(html, /<div class="test-title">CORTISOL, MORNING & EVENING<\/div>/);
  assert.match(html, /data-report-content="morning-evening-cortisol"/);
  assert.match(html, /08:00/);
  assert.match(html, /16:00/);
  assert.match(html, /Morning and evening results must be interpreted separately/);
  assert.equal(getFallbackReportParameters({ name: 'Cortisol (Morning&Evening)' })[0].parameterName, 'Cortisol, Morning');
});

test('Cortisol (Morning) records the morning collection time with the result', () => {
  const html = buildReportHtml(sampleReport({
    name: 'Cortisol (Morning)', sample_type: 'Serum', parameters: [
      { parameter_name: 'Cortisol, Morning', value: '16.2', unit: 'mcg/dL', normal_range: 'Laboratory-validated a.m. reference interval' },
      { parameter_name: 'Collection Time', value: '08:00' },
    ],
  }));
  assert.match(html, /<div class="test-title">CORTISOL, MORNING<\/div>/);
  assert.match(html, /data-report-content="morning-cortisol"/);
  assert.match(html, /08:00/);
  assert.match(html, /Cortisol has a marked diurnal rhythm/);
  assert.equal(getFallbackReportParameters({ name: 'Cortisol (Morning)' })[0].parameterName, 'Cortisol, Morning');
});

test('Cortisol (Morning,Evening &Midnight) keeps all three collection timepoints distinct', () => {
  const html = buildReportHtml(sampleReport({
    name: 'Cortisol (Morning,Evening &Midnight)', sample_type: 'Serum', parameters: [
      { parameter_name: 'Cortisol, Morning', value: '16.2', unit: 'mcg/dL', normal_range: 'Laboratory-validated a.m. reference interval' },
      { parameter_name: 'Morning Collection Date / Time', value: '08:00' },
      { parameter_name: 'Cortisol, Evening', value: '6.4', unit: 'mcg/dL', normal_range: 'Laboratory-validated p.m. reference interval' },
      { parameter_name: 'Evening Collection Date / Time', value: '16:00' },
      { parameter_name: 'Cortisol, Midnight', value: '88', unit: 'ng/dL', normal_range: 'Laboratory-validated late-night reference interval' },
      { parameter_name: 'Midnight Collection Date / Time', value: '23:45' },
    ],
  }));
  assert.match(html, /<div class="test-title">CORTISOL, MORNING, EVENING & MIDNIGHT<\/div>/);
  assert.match(html, /data-report-content="morning-evening-midnight-cortisol"/);
  assert.match(html, /08:00/);
  assert.match(html, /16:00/);
  assert.match(html, /23:45/);
  assert.match(html, /Each cortisol result must be interpreted with its own collection time/);
  assert.equal(getFallbackReportParameters({ name: 'Cortisol (Morning,Evening &Midnight)' })[0].parameterName, 'Cortisol, Morning');
});

test('Cryoglobulins Screening Test records the screen, cryocrit, and temperature-sensitive specimen handling', () => {
  const html = buildReportHtml(sampleReport({
    name: 'Cryoglobulins Screening Test', sample_type: 'Serum', parameters: [
      { parameter_name: 'Cryoglobulin Screen', value: 'Negative', normal_range: 'Negative' },
      { parameter_name: 'Cryoprecipitate / Cryocrit', value: 'Not detected', unit: '%', normal_range: 'Not detected' },
      { parameter_name: 'Collection / Transport Temperature', value: 'Maintained warm until serum separation' },
      { parameter_name: 'Incubation / Observation Period', value: '7 days' },
    ],
  }));
  assert.match(html, /<div class="test-title">CRYOGLOBULINS SCREENING TEST<\/div>/);
  assert.match(html, /data-report-content="cryoglobulins-screening"/);
  assert.match(html, /CRYOPRECIPITATE \/ CRYOCRIT/);
  assert.match(html, /Maintained warm until serum separation/);
  assert.match(html, /Inappropriate specimen handling may produce a false-negative result/);
  assert.equal(getFallbackReportParameters({ name: 'Cryoglobulins Screening Test' })[0].parameterName, 'Cryoglobulin Screen');
});

test('CultureforG.N.D records specimen-specific gonococcal culture and susceptibility reporting', () => {
  const html = buildReportHtml(sampleReport({
    name: 'CultureforG.N.D', sample_type: 'Endocervical Swab', parameters: [
      { parameter_name: 'Specimen / Collection Site', value: 'Endocervical swab' },
      { parameter_name: 'Direct Microscopy / Gram Stain', value: 'Polymorphs seen; no intracellular diplococci observed' },
      { parameter_name: 'Gonococcal Culture Result', value: 'No Neisseria gonorrhoeae isolated', normal_range: 'No Neisseria gonorrhoeae isolated' },
      { parameter_name: 'Report Status', value: 'Final' },
    ],
  }));
  assert.match(html, /<div class="test-title">CULTURE FOR GRAM-NEGATIVE DIPLOCOCCI<\/div>/);
  assert.match(html, /data-report-content="gnd-culture"/);
  assert.match(html, /GONOCOCCAL CULTURE/);
  assert.match(html, /Endocervical swab/);
  assert.match(html, /Gram-negative diplococci on direct microscopy are not by themselves a final culture identification/);
  assert.equal(getFallbackReportParameters({ name: 'CultureforG.N.D' })[0].parameterName, 'Specimen / Collection Site');
});

test('Gonorrhea uses a method-aware detection report without assuming culture or NAAT', () => {
  const html = buildReportHtml(sampleReport({
    name: 'Gonorrhea', sample_type: 'First-void urine', parameters: [
      { parameter_name: 'Specimen / Collection Site', value: 'First-void urine' },
      { parameter_name: 'Test Method (NAAT / Culture / Other)', value: 'Validated NAAT' },
      { parameter_name: 'Neisseria gonorrhoeae Result', value: 'Not detected', normal_range: 'Not detected' },
      { parameter_name: 'Chlamydia Co-test Result, if ordered', value: 'Not detected' },
      { parameter_name: 'Report Status', value: 'Final' },
    ],
  }));
  assert.match(html, /<div class="test-title">GONORRHEA - NEISSERIA GONORRHOEAE<\/div>/);
  assert.match(html, /data-report-content="gonorrhea"/);
  assert.match(html, /NEISSERIA GONORRHOEAE DETECTION/);
  assert.match(html, /NAAT and culture are separate methods/);
  assert.match(html, /A NAAT result does not provide antimicrobial susceptibility/);
  assert.deepEqual(
    getFallbackReportParameters({ name: 'Gonorrhea' }).slice(0, 4).map(parameter => parameter.parameterName),
    ['Specimen / Collection Site', 'Test Method (NAAT / Culture / Other)', 'Neisseria gonorrhoeae Result', 'Direct Microscopy / Gram Stain, if performed'],
  );
});

test('Gram Stain Of Urethral Discharge is a specimen-specific direct microscopy format', () => {
  const html = buildReportHtml(sampleReport({
    name: 'Gram Stain Of Urethral Discharge', sample_type: 'Urethral discharge', parameters: [
      { parameter_name: 'Specimen / Collection Site', value: 'Urethral discharge' },
      { parameter_name: 'Inflammatory Cells / PMNs', value: 'Many PMNs seen' },
      { parameter_name: 'Gram Stain Findings / Bacterial Morphology', value: 'Gram-negative diplococci observed' },
      { parameter_name: 'Culture / NAAT Correlation, if ordered', value: 'NAAT requested separately' },
    ],
  }));
  assert.match(html, /<div class="test-title">GRAM STAIN OF URETHRAL DISCHARGE<\/div>/);
  assert.match(html, /data-report-content="urethral-discharge-gram-stain"/);
  assert.match(html, /URETHRAL DISCHARGE - GRAM STAIN/);
  assert.match(html, /does not provide definitive species identification or antimicrobial susceptibility/);
  assert.deepEqual(
    getFallbackReportParameters({ name: 'Gram Stain Of Urethral Discharge' }).slice(0, 4).map(parameter => parameter.parameterName),
    ['Specimen / Collection Site', 'Smear Method / Preparation', 'Inflammatory Cells / PMNs', 'Epithelial Cells'],
  );
});

test('Gram Stain of Smears keeps morphology and culture correlation distinct', () => {
  const html = buildReportHtml(sampleReport({
    name: 'Gram Stain of Smears', sample_type: 'Wound swab', parameters: [
      { parameter_name: 'Specimen / Collection Site', value: 'Wound swab' },
      { parameter_name: 'Inflammatory Cells / PMNs', value: 'Moderate PMNs seen' },
      { parameter_name: 'Gram-Positive Organisms / Morphology, if seen', value: 'Gram-positive cocci in clusters' },
      { parameter_name: 'Overall Gram Stain Findings', value: 'Mixed bacterial morphotypes seen' },
    ],
  }));
  assert.match(html, /<div class="test-title">GRAM STAIN OF SMEARS<\/div>/);
  assert.match(html, /data-report-content="gram-stain-smears"/);
  assert.match(html, /Do not infer an organism, susceptibility pattern, or infection site from morphology alone/);
  assert.deepEqual(
    getFallbackReportParameters({ name: 'Gram Stain of Smears' }).slice(0, 4).map(parameter => parameter.parameterName),
    ['Specimen / Collection Site', 'Smear Method / Preparation', 'Inflammatory Cells / PMNs', 'Epithelial Cells'],
  );
});

test('General Health Check Up reports only components actually ordered', () => {
  const html = buildReportHtml(sampleReport({
    name: 'General Health Check Up', sample_type: 'Blood / Urine, as ordered', parameters: [
      { parameter_name: 'Specimen(s) / Collection Conditions', value: 'Fasting blood and urine received' },
      { parameter_name: 'Complete Blood Count Summary, if ordered', value: 'See individual CBC report' },
      { parameter_name: 'Glucose Assessment, if ordered', value: 'See individual glucose report' },
      { parameter_name: 'Laboratory Comments / Clinical Correlation', value: 'Correlate with clinical review' },
    ],
  }));
  assert.match(html, /<div class="test-title">GENERAL HEALTH CHECK UP<\/div>/);
  assert.match(html, /data-report-content="general-health-check-up"/);
  assert.match(html, /This check-up is a summary only of investigations actually ordered and reported/);
  assert.match(html, /Do not infer missing results, normality, or a diagnosis from an unperformed component/);
  assert.equal(getFallbackReportParameters({ name: 'General Health Check Up' })[0].parameterName, 'Specimen(s) / Collection Conditions');
});

test('Cystic Fibrosis (CF) Gene Mutation uses a distinct CFTR molecular report', () => {
  const html = buildReportHtml(sampleReport({
    name: 'Cystic Fibrosis (CF) Gene Mutation', sample_type: 'Whole Blood', parameters: [
      { parameter_name: 'CFTR Test Method / Panel', value: 'Laboratory-validated CFTR variant panel' },
      { parameter_name: 'CFTR Variant(s) Detected', value: 'c.1521_1523delCTT (p.Phe508del)' },
      { parameter_name: 'Zygosity / Phase', value: 'Heterozygous' },
      { parameter_name: 'Variant Classification', value: 'Pathogenic' },
      { parameter_name: 'Overall Interpretation', value: 'Report according to the laboratory-validated CFTR interpretation.' },
    ],
  }));
  assert.match(html, /<div class="test-title">CYSTIC FIBROSIS \(CF\) GENE MUTATION<\/div>/);
  assert.match(html, /data-report-content="cftr-gene-mutation"/);
  assert.match(html, /CFTR GENE MUTATION ANALYSIS/);
  assert.match(html, /p\.Phe508del/);
  assert.match(html, /does not by itself establish cystic fibrosis/);
  assert.equal(getFallbackReportParameters({ name: 'Cystic Fibrosis (CF) Gene Mutation' })[0].parameterName, 'Specimen');
});

test('Cytomegalovirus (CMV) IgG uses a standalone serology report without an IgM row', () => {
  const html = buildReportHtml(sampleReport({
    name: 'Cytomegalovirus (CMV) IgG', sample_type: 'Serum', parameters: [
      { parameter_name: 'Cytomegalovirus (CMV) IgG', value: 'Positive', normal_range: 'Laboratory-validated assay interpretation' },
      { parameter_name: 'Method / Analyzer', value: 'CMV IgG immunoassay' },
    ],
  }));
  assert.match(html, /<div class="test-title">CYTOMEGALOVIRUS \(CMV\) IgG ANTIBODY<\/div>/);
  assert.match(html, /data-report-content="cmv-igg"/);
  assert.match(html, /CYTOMEGALOVIRUS \(CMV\) IgG ANTIBODY/);
  assert.match(html, /does not establish the timing of infection or active CMV disease/);
  assert.doesNotMatch(html, /CYTOMEGALOVIRUS \(CMV\) IgM<\/strong>/);
  assert.equal(getFallbackReportParameters({ name: 'Cytomegalovirus (CMV) IgG' })[0].parameterName, 'Cytomegalovirus (CMV) IgG');
});

test('cervical Pap smear has a blank-safe Bethesda-style cytology format', () => {
  const html = buildReportHtml(sampleReport({
    name: 'Cervical SmearforPAPStain', sample_type: 'Cervical Smear', parameters: [
      { parameter_name: 'Specimen Adequacy', value: 'Satisfactory for evaluation', unit: '', normal_range: '' },
      { parameter_name: 'General Categorization', value: 'Negative for intraepithelial lesion or malignancy (NILM)', unit: '', normal_range: '' },
      { parameter_name: 'Epithelial Cell Abnormality / Cytologic Interpretation', value: 'No epithelial cell abnormality identified.', unit: '', normal_range: '' },
    ],
  }));
  assert.match(html, /<div class="test-title">CERVICAL SMEAR - PAP STAIN<\/div>/);
  assert.match(html, /SPECIMEN ADEQUACY/);
  assert.match(html, /CERVICAL CYTOLOGY INTERPRETATION/);
  assert.match(html, /Negative for intraepithelial lesion or malignancy \(NILM\)/);
  assert.match(html, /do not add a cytologic category, HPV result, organism, or recommendation unless it was actually assessed and documented/);
  assert.match(html, /does not by itself establish cervical cancer/);
  assert.doesNotMatch(html, /BRONCHIAL .* PAP CYTOLOGY/);
});

test('cervical swab Gram stain separates microscopy from molecular correlation', () => {
  const html = buildReportHtml(sampleReport({
    name: 'Cervical SwabGramStain', sample_type: 'Cervical Swab', parameters: [
      { parameter_name: 'Inflammatory Cells / PMNs', value: 'Moderate', unit: '', normal_range: '' },
      { parameter_name: 'Gram Stain Findings', value: 'Mixed bacterial morphotypes seen', unit: '', normal_range: '' },
      { parameter_name: 'Nugent Score (If Performed)', value: 'Not performed', unit: '', normal_range: '' },
    ],
  }));
  assert.match(html, /<div class="test-title">CERVICAL SWAB - GRAM STAIN<\/div>/);
  assert.match(html, /SPECIMEN AND DIRECT MICROSCOPY/);
  assert.match(html, /Gram Reaction \/ Morphology/);
  assert.match(html, /Nugent Score \(If Performed\)/);
  assert.match(html, /does not provide definitive organism identification or antimicrobial susceptibility/);
  assert.match(html, /not a standardized or sufficiently sensitive test for chlamydia or gonorrhoea/);
});

test('cervical swab AFB stain is direct microscopy without a TB diagnosis', () => {
  const html = buildReportHtml(sampleReport({ name: 'CervicalSwabAFBStain', sample_type: 'Cervical Swab', parameters: [
    { parameter_name: 'AFB Smear Microscopy Result', value: 'No AFB seen', unit: '', normal_range: '' },
    { parameter_name: 'AFB Smear Grade / Quantitation', value: 'Not applicable', unit: '', normal_range: '' },
  ] }));
  assert.match(html, /<div class="test-title">CERVICAL SWAB - AFB STAIN<\/div>/);
  assert.match(html, /SPECIMEN AND AFB DIRECT MICROSCOPY/);
  assert.match(html, /does not identify the species or confirm/);
  assert.match(html, /A negative smear does not exclude mycobacterial infection/);
});

test('Chikungunya IgG is a timing-aware serology report, not an acute diagnosis', () => {
  const html = buildReportHtml(sampleReport({ name: 'Chikungunya IgG', sample_type: 'Serum', parameters: [
    { parameter_name: 'Chikungunya Virus IgG', value: 'Positive', unit: '', normal_range: 'Laboratory-validated assay interpretation' },
    { parameter_name: 'Days Since Symptom Onset', value: '14', unit: 'days', normal_range: '' },
  ] }));
  assert.match(html, /<div class="test-title">CHIKUNGUNYA VIRUS IgG<\/div>/);
  assert.match(html, /CHIKUNGUNYA VIRUS SEROLOGY/);
  assert.match(html, /does not by itself establish acute chikungunya virus disease/);
  assert.match(html, /viral RNA testing is generally more appropriate/);
});

test('Chikungunya IgM is a confirmation-aware recent-infection screen', () => {
  const html = buildReportHtml(sampleReport({ name: 'Chikungunya IgM', sample_type: 'Serum', parameters: [
    { parameter_name: 'Chikungunya Virus IgM', value: 'Positive', unit: '', normal_range: 'Laboratory-validated assay interpretation' },
    { parameter_name: 'Days Since Symptom Onset', value: '9', unit: 'days', normal_range: '' },
    { parameter_name: 'Confirmatory Neutralizing Antibody Test / Referral', value: 'Pending', unit: '', normal_range: '' },
  ] }));
  assert.match(html, /<div class="test-title">CHIKUNGUNYA VIRUS IgM<\/div>/);
  assert.match(html, /CHIKUNGUNYA VIRUS SEROLOGY/);
  assert.match(html, /not a stand-alone confirmation/);
  assert.match(html, /False-positive or cross-reactive serologic results can occur/);
  assert.match(html, /During the first week of illness, viral RNA testing is generally preferred/);
});

test('Chlamydia Antibody IgG and IgM separates serology from direct infection testing', () => {
  const html = buildReportHtml(sampleReport({ name: 'Chlamydia Antibody IgG & IgM', sample_type: 'Serum', parameters: [
    { parameter_name: 'Chlamydia trachomatis IgG', value: 'Positive', unit: '', normal_range: 'Laboratory-validated assay interpretation' },
    { parameter_name: 'Chlamydia trachomatis IgM', value: 'Negative', unit: '', normal_range: 'Laboratory-validated assay interpretation' },
    { parameter_name: 'Direct Detection / NAAT Result (If Performed)', value: 'Not performed', unit: '', normal_range: '' },
  ] }));
  assert.match(html, /<div class="test-title">CHLAMYDIA ANTIBODY - IgG & IgM<\/div>/);
  assert.match(html, /CHLAMYDIA TRACHOMATIS ANTIBODY SEROLOGY/);
  assert.match(html, /does not establish an active uncomplicated genital/);
  assert.match(html, /use a validated direct-detection test such as NAAT/);
  assert.match(html, /Do not infer active infection, anatomical site, treatment response/);
});

test('Chlamydia Antigen keeps assay reporting distinct from NAAT and serology', () => {
  const html = buildReportHtml(sampleReport({ name: 'Chlamydia Antigen', sample_type: 'Endocervical Swab', parameters: [
    { parameter_name: 'Chlamydia trachomatis Antigen', value: 'Detected', unit: '', normal_range: 'Laboratory-validated assay interpretation' },
    { parameter_name: 'Method / Kit / Analyzer', value: 'Validated antigen detection assay', unit: '', normal_range: '' },
  ] }));
  assert.match(html, /<div class="test-title">CHLAMYDIA ANTIGEN<\/div>/);
  assert.match(html, /CHLAMYDIA TRACHOMATIS ANTIGEN DETECTION/);
  assert.match(html, /not an antibody-serology result and it is not a nucleic-acid amplification test/);
  assert.match(html, /For routine diagnosis of urogenital/);
  assert.match(html, /Do not infer organism viability, antimicrobial susceptibility/);
});

test('Chloride Random uses a random-urine electrolyte format without a 24-hour interval', () => {
  const html = buildReportHtml(sampleReport({ name: 'Chloride (Random)', sample_type: 'Random Urine', parameters: [
    { parameter_name: 'Urine Chloride', value: '22', unit: 'mmol/L', normal_range: '' },
    { parameter_name: 'Concurrent Serum Electrolytes / Bicarbonate', value: 'Serum bicarbonate: 31 mmol/L', unit: '', normal_range: '' },
  ] }));
  assert.match(html, /<div class="test-title">CHLORIDE, RANDOM URINE<\/div>/);
  assert.match(html, /RANDOM URINE ELECTROLYTE/);
  assert.match(html, /random urine reference interval not established/);
  assert.match(html, /Do not apply a 24-hour urine chloride reference interval/);
  assert.match(html, /Do not calculate chloride excretion, fractional excretion/);
});

test('Chloride Serum uses a serum-electrolyte format distinct from urine chloride', () => {
  const html = buildReportHtml(sampleReport({ name: 'Chloride (Serum)', sample_type: 'Serum', parameters: [
    { parameter_name: 'Serum Chloride', value: '103', unit: 'mmol/L', normal_range: '98 - 107' },
    { parameter_name: 'Serum Sodium', value: '140', unit: 'mmol/L', normal_range: '136 - 145' },
  ] }));
  assert.match(html, /SERUM ELECTROLYTE/);
  assert.match(html, /Serum Bicarbonate \/ Total CO2/);
  assert.match(html, /intervals and methods may differ between laboratories/);
  assert.match(html, /Do not infer an anion gap, acid-base diagnosis/);
});

test('Chloride 24-hour urine records timed collection integrity and daily excretion separately from random urine', () => {
  const html = buildReportHtml(sampleReport({ name: 'Chloride (24 hrs. Urine)', sample_type: '24h Urine', parameters: [
    { parameter_name: 'Urine Chloride, 24 Hour', value: '160', unit: 'mmol/24 h', normal_range: '110 - 250' },
    { parameter_name: 'Total Urine Volume', value: '1800', unit: 'mL', normal_range: '' },
  ] }));
  assert.match(html, /24-HOUR URINE ELECTROLYTE/);
  assert.match(html, /Collection Duration/);
  assert.match(html, /An incomplete or incorrectly timed collection can make a total daily result unreliable/);
  assert.match(html, /Do not compare this total daily excretion directly with a random urine chloride concentration/);
});

test('Total cholesterol is a standalone lipid measurement, not a complete lipid profile', () => {
  const html = buildReportHtml(sampleReport({ name: 'Cholesterol -Total', sample_type: 'Serum', parameters: [
    { parameter_name: 'Total Cholesterol', value: '212', unit: 'mg/dL', normal_range: '< 200' },
  ] }));
  assert.match(html, /TOTAL CHOLESTEROL/);
  assert.match(html, /should not be used alone to assign cardiovascular risk or a treatment target/);
  assert.match(html, /Do not infer fasting status, LDL cholesterol, non-HDL cholesterol/);
});

test('C difficile toxin is a symptom- and specimen-aware stool microbiology report', () => {
  const html = buildReportHtml(sampleReport({ name: 'Clostridioides difficile Toxin', sample_type: 'Unformed Stool', parameters: [{ parameter_name: 'C. difficile Toxin A/B', value: 'Not detected', unit: '', normal_range: 'Not detected' }] }));
  assert.match(html, /CLOSTRIDIOIDES DIFFICILE TOXIN DETECTION/); assert.match(html, /A laboratory result alone does not establish C\. difficile infection/); assert.match(html, /toxin is unstable at room temperature/);
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

test('antenatal profile renders maternal booking screens without inventing results', () => {
  const html = buildReportHtml(sampleReport({
    name: 'AntenatalProfile',
    sample_type: 'EDTA Whole Blood, Serum / Plasma and Urine',
    parameters: [
      { parameter_name: 'Gestational Age', value: '18 weeks', unit: '', normal_range: '' },
      { parameter_name: 'Haemoglobin (Hb)', value: '10.8', unit: 'g/dL', normal_range: 'Pregnancy-specific laboratory interval' },
      { parameter_name: 'Blood Group', value: 'B', unit: '', normal_range: '' },
      { parameter_name: 'Rh Factor', value: 'Positive', unit: '', normal_range: '' },
      { parameter_name: 'HIV Screen', value: 'Non-reactive', unit: '', normal_range: 'Non-reactive' },
      { parameter_name: 'HBsAg', value: 'Non-reactive', unit: '', normal_range: 'Non-reactive' },
      { parameter_name: 'VDRL', value: 'Non-reactive', unit: '', normal_range: 'Non-reactive' },
      { parameter_name: 'Urine Albumin', value: 'Negative', unit: '', normal_range: 'Negative' },
      { parameter_name: 'Result / Findings', value: 'Correlate with antenatal assessment.', unit: '', normal_range: '' },
    ],
  }));
  assert.match(html, /<div class="test-title">ANTENATAL PROFILE<\/div>/);
  assert.match(html, /PREGNANCY DETAILS/);
  assert.match(html, /HAEMATOLOGY \(EDTA WHOLE BLOOD\)/);
  assert.match(html, /BLOOD GROUP &amp; IMMUNOHAEMATOLOGY/);
  assert.match(html, /MATERNAL INFECTION SCREENING/);
  assert.match(html, /URINE SCREENING/);
  assert.match(html, />18 weeks<\/span>/);
  assert.match(html, />B<\/span>/);
  assert.match(html, /Correlate with antenatal assessment\./);
  assert.match(html, /24&ndash;28 weeks/);
  assert.match(html, /does not replace clinical examination, ultrasound, aneuploidy screening/);

  const blank = buildReportHtml(sampleReport({ name: 'Antenatal Profile', parameters: [] }));
  assert.match(blank, /class="results-table cbc-table antenatal-profile-table"/);
  assert.match(blank, /HIV 1 &amp; 2 Screen<\/div>.*?<td><span>-<\/span><\/td>/s);
  assert.doesNotMatch(blank, /<td><span>(?:Non-reactive|Negative)<\/span><\/td>/i);

  const fallback = getFallbackReportParameters({ name: 'AntenatalProfile' });
  assert.equal(fallback[0].parameterName, 'Gestational Age / Trimester');
  assert.ok(fallback.some(field => field.parameterName === 'Red-cell Antibody Screen (ICT)'));
  assert.ok(fallback.some(field => field.parameterName === 'Urine Culture / Bacteriuria Screen'));
  assert.equal(fallback.find(field => field.parameterName === 'HIV 1 & 2 Screen').normalRange, 'Non-reactive');
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

test('Anti InsulinAntibody keeps the shared result layout and adds assay-aware interpretation', () => {
  const input = {
    name: 'Anti InsulinAntibody', sample_type: 'Serum',
    parameters: [{ parameter_name: 'Insulin Antibodies (IAA), Serum', value: 'Measured value', unit: 'Lab unit', normal_range: 'Lab cut-off' }],
  };
  const html = buildReportHtml(sampleReport(input));
  assert.match(html, /<div class="test-title">INSULIN ANTIBODIES \(IAA\)<\/div>/);
  assert.match(html, /Insulin Antibodies \(IAA\), Serum/);
  assert.match(html, /Measured value/);
  assert.match(html, /Lab cut-off/);
  assert.match(html, /data-report-content="anti-insulin-antibody"/);
  assert.match(html, /Injected insulin can induce antibodies/);
  assert.match(html, /numerical threshold and unit depend on the method/);
  assert.doesNotMatch(html, /<5\.0 uU\/mL|0\.4 U\/mL/);
  assert.equal(getReportContent({ name: 'Anti Insulin Receptor Antibody', sample_type: 'Serum' }), null);
  assert.equal(getReportContent({ name: 'Anti InsulinAntibody', sample_type: 'Urine' }), null);
  assert.equal(getFallbackReportParameters({ name: 'Anti InsulinAntibody' })[0].normalRange, 'Assay-specific negative cut-off');
  const custom = buildReportHtml(sampleReport({ ...input, report_body: 'Lab-approved interpretation' }));
  assert.doesNotMatch(custom, /data-report-content="anti-insulin-antibody"/);
  assert.match(custom, /Lab-approved interpretation/);
});

test('Anti Leptospira Antibody adds timed-serology guidance without claiming IgM or IgG', () => {
  const input = {
    name: 'Anti Leptospira Antibody', sample_type: 'Serum',
    parameters: [{ parameter_name: 'Anti-Leptospira Antibody, Serum', value: 'Non-reactive', unit: '', normal_range: 'Negative / non-reactive (assay-specific)' }],
  };
  const html = buildReportHtml(sampleReport(input));
  assert.match(html, /<div class="test-title">ANTI-LEPTOSPIRA ANTIBODY<\/div>/);
  assert.match(html, /Anti-Leptospira Antibody, Serum/);
  assert.match(html, /Non-reactive/);
  assert.match(html, /data-report-content="anti-leptospira-antibody"/);
  assert.match(html, /Does not exclude leptospirosis/);
  assert.match(html, /microscopic agglutination testing \(MAT\)/);
  assert.match(html, /does not specify IgM or IgG/);
  assert.equal(getFallbackReportParameters({ name: 'Anti Leptospira Antibody' })[0].normalRange, 'Negative / non-reactive (assay-specific)');
  for (const other of ['Leptospira Antibodies (IgG & IgM)', 'Leptospira Antibody IgG', 'LeptospiraAntibodyIgM']) {
    assert.equal(getReportContent({ name: other, sample_type: 'Serum' }), null);
    assert.doesNotMatch(buildReportHtml(sampleReport({ name: other, sample_type: 'Serum', parameters: [] })), /data-report-content="anti-leptospira-antibody"/);
  }
  const custom = buildReportHtml(sampleReport({ ...input, report_body: 'Lab-authored explanation' }));
  assert.doesNotMatch(custom, /data-report-content="anti-leptospira-antibody"/);
  assert.match(custom, /Lab-authored explanation/);
});

test('Anti Microsomal Antibody has a target-neutral report, not thyroid or LKM findings', () => {
  const input = {
    name: 'Anti Microsomal Antibody', sample_type: 'Serum',
    parameters: [
      { parameter_name: 'Antigen / Assay Target', value: 'Laboratory target', unit: '', normal_range: '' },
      { parameter_name: 'Assay Method', value: 'Laboratory method', unit: '', normal_range: '' },
      { parameter_name: 'Anti-Microsomal Antibody Result', value: 'Measured result', unit: 'Lab unit', normal_range: 'Lab criterion' },
      { parameter_name: 'Laboratory Interpretation', value: 'Lab interpretation', unit: '', normal_range: '' },
    ],
  };
  const html = buildReportHtml(sampleReport(input));
  assert.match(html, /<div class="test-title">ANTI-MICROSOMAL ANTIBODY<\/div>/);
  for (const value of ['Laboratory target', 'Laboratory method', 'Measured result', 'Lab criterion', 'Lab interpretation']) {
    assert.match(html, new RegExp(value));
  }
  assert.match(html, /data-report-content="anti-microsomal-antibody"/);
  assert.match(html, /does not identify the antigen or clinical indication/);
  assert.match(html, /Do not assume this is a thyroid peroxidase/);
  assert.doesNotMatch(html, /class="results-table single-analyte-table thyroid-antibodies-table anti-tpo-table"/);
  assert.equal(getFallbackReportParameters({ name: 'Anti Microsomal Antibody' }).length, 5);
  assert.equal(getReportContent({ name: 'Anti LKM', sample_type: 'Serum' }), null);
  assert.equal(getReportContent({ name: 'Anti TPO (Anti ThyroidPeroxidase)', sample_type: 'Serum' }), null);
  const custom = buildReportHtml(sampleReport({ ...input, report_body: 'Performing lab text' }));
  assert.doesNotMatch(custom, /data-report-content="anti-microsomal-antibody"/);
  assert.match(custom, /Performing lab text/);
});

test('Anti ds DNAAntibody has a dedicated assay-aware report distinct from anti-ssDNA', () => {
  const input = {
    name: 'Anti ds DNAAntibody', sample_type: 'Serum',
    parameters: [
      { parameter_name: 'Anti-dsDNA Antibody', value: 'Lab result', unit: 'Lab unit', normal_range: 'Lab cut-off' },
      { parameter_name: 'Assay Method / Platform', value: 'Lab method', unit: '', normal_range: '' },
      { parameter_name: 'Laboratory Interpretation', value: 'Lab interpretation', unit: '', normal_range: '' },
    ],
  };
  const html = buildReportHtml(sampleReport(input));
  assert.match(html, /<div class="test-title">ANTI-dsDNA ANTIBODY<\/div>/);
  for (const value of ['Lab result', 'Lab unit', 'Lab cut-off', 'Lab method', 'Lab interpretation']) {
    assert.match(html, new RegExp(value));
  }
  assert.match(html, /data-report-content="anti-dsdna-antibody"/);
  assert.match(html, /positive result alone does not establish the diagnosis/);
  assert.match(html, /Does not exclude SLE/);
  assert.equal(getFallbackReportParameters({ name: input.name }).length, 4);
  assert.equal(getFallbackReportParameters({ name: input.name })[0].normalRange, 'Assay-specific reference interval');
  assert.equal(getReportContent({ name: 'Anti ssDNAAntibody', sample_type: 'Serum' }).key, 'anti-ssdna-antibody');
  assert.equal(getReportContent({ name: 'SLE (L.E. Cell + ANF + Anti ds DNA)', sample_type: 'Serum' }), null);
  const custom = buildReportHtml(sampleReport({ ...input, report_body: 'Lab-authored explanation' }));
  assert.doesNotMatch(custom, /data-report-content="anti-dsdna-antibody"/);
  assert.match(custom, /Lab-authored explanation/);
});

test('Anti ssDNAAntibody has its own report without borrowing anti-dsDNA interpretation', () => {
  const input = {
    name: 'Anti ssDNAAntibody', sample_type: 'Serum',
    parameters: [
      { parameter_name: 'Anti-ssDNA Antibody', value: 'Lab result', unit: 'Lab unit', normal_range: 'Lab cut-off' },
      { parameter_name: 'Assay Method / Platform', value: 'Lab method', unit: '', normal_range: '' },
      { parameter_name: 'Laboratory Interpretation', value: 'Lab interpretation', unit: '', normal_range: '' },
    ],
  };
  const html = buildReportHtml(sampleReport(input));
  assert.match(html, /<div class="test-title">ANTI-ssDNA ANTIBODY<\/div>/);
  for (const value of ['Lab result', 'Lab unit', 'Lab cut-off', 'Lab method', 'Lab interpretation']) {
    assert.match(html, new RegExp(value));
  }
  assert.match(html, /data-report-content="anti-ssdna-antibody"/);
  assert.match(html, /less specific for systemic lupus erythematosus/);
  assert.match(html, /does not diagnose SLE/);
  assert.doesNotMatch(html, /data-report-content="anti-dsdna-antibody"/);
  assert.equal(getFallbackReportParameters({ name: input.name }).length, 4);
  assert.equal(getFallbackReportParameters({ name: input.name })[0].normalRange, 'Assay-specific reference interval');
  assert.equal(getReportContent({ name: 'Anti ds DNAAntibody', sample_type: 'Serum' }).key, 'anti-dsdna-antibody');
  const custom = buildReportHtml(sampleReport({ ...input, report_body: 'Lab-authored explanation' }));
  assert.doesNotMatch(custom, /data-report-content="anti-ssdna-antibody"/);
  assert.match(custom, /Lab-authored explanation/);
});

test('Anti-Histone Antibody explains the result without replacing an existing assay range', () => {
  const input = {
    name: 'Anti-Histone Antibody', sample_type: 'Serum',
    parameters: [
      { parameter_name: 'Anti-Histone Antibody', value: 'Lab result', unit: 'Lab unit', normal_range: 'Lab cut-off' },
      { parameter_name: 'Assay Method / Platform', value: 'Lab method', unit: '', normal_range: '' },
      { parameter_name: 'Laboratory Interpretation', value: 'Lab interpretation', unit: '', normal_range: '' },
    ],
  };
  const html = buildReportHtml(sampleReport(input));
  assert.match(html, /<div class="test-title">ANTI-HISTONE ANTIBODY<\/div>/);
  for (const value of ['Lab result', 'Lab unit', 'Lab cut-off', 'Lab method', 'Lab interpretation']) {
    assert.match(html, new RegExp(value));
  }
  assert.match(html, /data-report-content="anti-histone-antibody"/);
  assert.match(html, /does not by itself establish drug-induced lupus/);
  assert.equal(getFallbackReportParameters({ name: input.name }).length, 4);
  const existing = buildReportHtml(sampleReport({
    name: 'Anti-Histone Antibodies', sample_type: 'Serum (1 ml)',
    parameters: [{ parameter_name: 'ANTI-HISTONE ANTIBODIES', value: '0.5', unit: 'Units', normal_range: '< 1.00' }],
  }));
  assert.match(existing, /<div class="test-title">ANTI-HISTONE ANTIBODIES<\/div>/);
  assert.doesNotMatch(existing, /data-report-content="anti-histone-antibody"/);
  assert.match(existing, /&lt; 1\.00/);
  assert.equal(getReportContent({ name: 'Anti-Chromatin Antibody', sample_type: 'Serum' }), null);
  const custom = buildReportHtml(sampleReport({ ...input, report_body: 'Lab-authored explanation' }));
  assert.doesNotMatch(custom, /data-report-content="anti-histone-antibody"/);
  assert.match(custom, /Lab-authored explanation/);
});

test('Anti-Ribosomal P Antibody has a distinct report and leaves the plural bespoke format intact', () => {
  const input = {
    name: 'Anti-Ribosomal P Antibody', sample_type: 'Serum',
    parameters: [
      { parameter_name: 'Anti-Ribosomal P Antibody', value: 'Lab result', unit: 'Lab unit', normal_range: 'Lab cut-off' },
      { parameter_name: 'Assay Method / Platform', value: 'Lab method', unit: '', normal_range: '' },
      { parameter_name: 'Laboratory Interpretation', value: 'Lab interpretation', unit: '', normal_range: '' },
    ],
  };
  const html = buildReportHtml(sampleReport(input));
  assert.match(html, /<div class="test-title">ANTI-RIBOSOMAL P ANTIBODY<\/div>/);
  for (const value of ['Lab result', 'Lab unit', 'Lab cut-off', 'Lab method', 'Lab interpretation']) {
    assert.match(html, new RegExp(value));
  }
  assert.match(html, /data-report-content="anti-ribosomal-p-antibody"/);
  assert.match(html, /does not establish SLE or a particular organ manifestation/);
  assert.equal(getFallbackReportParameters({ name: input.name }).length, 4);
  const existing = buildReportHtml(sampleReport({
    name: 'Ribosome P Antibodies', code: 'RIBOSOMEP', sample_type: 'Serum (1 ml)',
    parameters: [{ parameter_name: 'Ribosome P Antibodies, IgG', value: '0.5', unit: 'U', normal_range: '< 1.0' }],
  }));
  assert.match(existing, /<div class="test-title">RIBOSOME P ANTIBODIES<\/div>/);
  assert.doesNotMatch(existing, /data-report-content="anti-ribosomal-p-antibody"/);
  assert.match(existing, /&lt; 1\.0/);
  assert.equal(getReportContent({ name: 'Ribosome P Antibodies', sample_type: 'Serum' }), null);
  const custom = buildReportHtml(sampleReport({ ...input, report_body: 'Lab-authored explanation' }));
  assert.doesNotMatch(custom, /data-report-content="anti-ribosomal-p-antibody"/);
  assert.match(custom, /Lab-authored explanation/);
});

test('AntiCCPAB has an assay-aware report without borrowing the copied Anti CCP cutoff', () => {
  const input = {
    name: 'AntiCCPAB', sample_type: 'Serum',
    parameters: [
      { parameter_name: 'Anti-CCP Antibody', value: 'Lab result', unit: 'Lab unit', normal_range: 'Lab cut-off' },
      { parameter_name: 'Assay Method / Platform', value: 'Lab method', unit: '', normal_range: '' },
      { parameter_name: 'Laboratory Interpretation', value: 'Lab interpretation', unit: '', normal_range: '' },
    ],
  };
  const html = buildReportHtml(sampleReport(input));
  assert.match(html, /<div class="test-title">ANTI-CCP ANTIBODY<\/div>/);
  for (const value of ['Lab result', 'Lab unit', 'Lab cut-off', 'Lab method', 'Lab interpretation']) {
    assert.match(html, new RegExp(value));
  }
  assert.match(html, /data-report-content="anti-ccp-ab"/);
  assert.match(html, /does not establish a diagnosis/);
  assert.doesNotMatch(html, /class="results-table anti-ccp-table"/);
  assert.equal(getFallbackReportParameters({ name: input.name }).length, 4);
  assert.equal(getFallbackReportParameters({ name: input.name })[0].normalRange, 'Assay-specific negative cut-off');
  const existing = buildReportHtml(sampleReport({
    name: 'Anti Cyclic-Citrullinated-Peptide (Anti CCP)', code: 'ANTICCP', sample_type: 'Serum',
    parameters: [{ parameter_name: 'ANTI CCP (CYCLIC CITRULLINATED PEPTIDE), SERUM', value: '2.0', unit: 'U/mL', normal_range: '< 5.00' }],
  }));
  assert.doesNotMatch(existing, /data-report-content="anti-ccp-ab"/);
  assert.match(existing, /&lt; 5\.00/);
  assert.equal(getReportContent({ name: 'Anti Cyclic-Citrullinated-Peptide (Anti CCP)', sample_type: 'Serum' }), null);
  const custom = buildReportHtml(sampleReport({ ...input, report_body: 'Lab-authored explanation' }));
  assert.doesNotMatch(custom, /data-report-content="anti-ccp-ab"/);
  assert.match(custom, /Lab-authored explanation/);
});

test('AntiSpermAntibody report requires specimen and method without assuming a MAR cutoff', () => {
  const input = {
    name: 'AntiSpermAntibody', sample_type: '',
    parameters: [
      { parameter_name: 'Specimen / Matrix', value: 'Lab specimen', unit: '', normal_range: '' },
      { parameter_name: 'Assay Method / Platform', value: 'Lab method', unit: '', normal_range: '' },
      { parameter_name: 'Antibody Class', value: 'Lab class', unit: '', normal_range: '' },
      { parameter_name: 'Anti-Sperm Antibody Result', value: 'Lab result', unit: 'Lab unit', normal_range: 'Lab criterion' },
      { parameter_name: 'Laboratory Interpretation', value: 'Lab interpretation', unit: '', normal_range: '' },
    ],
  };
  const html = buildReportHtml(sampleReport(input));
  assert.match(html, /<div class="test-title">ANTI-SPERM ANTIBODY<\/div>/);
  for (const value of ['Lab specimen', 'Lab method', 'Lab class', 'Lab result', 'Lab unit', 'Lab criterion', 'Lab interpretation']) {
    assert.match(html, new RegExp(value));
  }
  assert.match(html, /data-report-content="anti-sperm-antibody"/);
  assert.match(html, /A detected antibody result alone does not establish infertility/);
  assert.doesNotMatch(html, /50% or more/);
  assert.deepEqual(getFallbackReportParameters({ name: input.name }).map(field => field.parameterName), [
    'Specimen / Matrix', 'Assay Method / Platform', 'Antibody Class',
    'Anti-Sperm Antibody Result', 'Laboratory Interpretation', 'Comments',
  ]);
  assert.equal(getReportContent({ name: 'Semen Analysis - Seminogram', sample_type: 'Semen' }).key, 'semen-analysis');
  const custom = buildReportHtml(sampleReport({ ...input, report_body: 'Lab-authored explanation' }));
  assert.doesNotMatch(custom, /data-report-content="anti-sperm-antibody"/);
  assert.match(custom, /Lab-authored explanation/);
});

test('ApolipoproteinA1 has an age- and sex-aware report separate from ApoB', () => {
  const input = {
    name: 'ApolipoproteinA1', sample_type: 'Serum',
    parameters: [
      { parameter_name: 'Apolipoprotein A1, Serum', value: 'Lab result', unit: 'mg/dL', normal_range: 'Lab interval' },
      { parameter_name: 'Assay Method / Platform', value: 'Lab method', unit: '', normal_range: '' },
      { parameter_name: 'Laboratory Interpretation', value: 'Lab interpretation', unit: '', normal_range: '' },
    ],
  };
  const html = buildReportHtml(sampleReport(input));
  assert.match(html, /<div class="test-title">APOLIPOPROTEIN A1 \(APOA1\)<\/div>/);
  for (const value of ['Lab result', 'mg/dL', 'Lab interval', 'Lab method', 'Lab interpretation']) {
    assert.match(html, new RegExp(value));
  }
  assert.match(html, /data-report-content="apolipoprotein-a1"/);
  assert.match(html, /major protein component of high-density lipoprotein/);
  assert.match(html, /age- and sex-specific ApoA1 reference interval/);
  assert.doesNotMatch(html, /apolipoprotein-b-table/);
  const fields = getFallbackReportParameters({ name: input.name });
  assert.deepEqual(fields.map(field => field.parameterName), [
    'Apolipoprotein A1, Serum', 'Assay Method / Platform', 'Laboratory Interpretation', 'Comments',
  ]);
  assert.equal(fields[0].normalRange, 'Age- and sex-specific laboratory interval');
  assert.equal(getReportContent({ name: 'Apolipoprotein B', sample_type: 'Serum' }), null);
  const custom = buildReportHtml(sampleReport({ ...input, report_body: 'Lab-authored explanation' }));
  assert.doesNotMatch(custom, /data-report-content="apolipoprotein-a1"/);
  assert.match(custom, /Lab-authored explanation/);
});

test('Arsenic (Urine) reports total concentration without implying inorganic arsenic or a universal cutoff', () => {
  const input = {
    name: 'Arsenic (Urine)', sample_type: 'Urine',
    parameters: [
      { parameter_name: 'Collection Type / Duration', value: 'Random urine', unit: '', normal_range: '' },
      { parameter_name: 'Arsenic, Total, Urine', value: 'Lab result', unit: 'mcg/L', normal_range: 'Lab interval' },
      { parameter_name: 'Assay Method / Platform', value: 'Lab method', unit: '', normal_range: '' },
      { parameter_name: 'Laboratory Interpretation', value: 'Lab interpretation', unit: '', normal_range: '' },
    ],
  };
  const html = buildReportHtml(sampleReport(input));
  assert.match(html, /<div class="test-title">ARSENIC, URINE \(TOTAL\)<\/div>/);
  for (const value of ['Random urine', 'Lab result', 'mcg/L', 'Lab interval', 'Lab method', 'Lab interpretation']) {
    assert.match(html, new RegExp(value));
  }
  assert.match(html, /data-report-content="urine-arsenic"/);
  assert.match(html, /Recent seafood intake can raise total urinary arsenic/);
  assert.match(html, /do not label the total result as inorganic or toxic arsenic/);
  const fields = getFallbackReportParameters({ name: input.name });
  assert.deepEqual(fields.map(field => field.parameterName), [
    'Collection Type / Duration', 'Arsenic, Total, Urine', 'Assay Method / Platform',
    'Laboratory Interpretation', 'Comments',
  ]);
  assert.equal(fields[1].normalRange, 'Collection- and method-specific laboratory interval');
  assert.equal(getReportContent({ name: 'Arsenic (Blood)', sample_type: 'Blood' }), null);
  const custom = buildReportHtml(sampleReport({ ...input, report_body: 'Lab-authored explanation' }));
  assert.doesNotMatch(custom, /data-report-content="urine-arsenic"/);
  assert.match(custom, /Lab-authored explanation/);
});

test('Arthritis Profile reports the selected seven serum markers with component-aware explanations', () => {
  const fields = getFallbackReportParameters({ name: 'Arthritis Profile' });
  assert.deepEqual(fields.map(field => field.parameterName), [
    'Serum Uric Acid', 'Rheumatoid Factor, RA', 'C-Reactive Protein, CRP',
    'Antistreptolysin O, ASO Titer', 'iCalcium', 'Total Calcium', 'Serum Phosphorus', 'Comments',
  ]);
  assert.deepEqual(fields.slice(0, 7).map(field => field.unit), [
    'mg/dL', 'IU/mL', 'mg/L', 'IU/mL', 'mmol/L', 'mg/dL', 'mg/dL',
  ]);
  assert.ok(fields.slice(0, 7).every(field => !/\d/.test(field.normalRange)));

  const input = {
    name: 'Arthritis Profile', code: 'PF052', sample_type: 'Serum',
    parameters: fields.map((field, index) => ({
      parameter_name: field.parameterName,
      value: index === 7 ? 'Sample comment' : `Lab result ${index + 1}`,
      unit: field.unit, normal_range: field.normalRange,
    })),
  };
  const html = buildReportHtml(sampleReport(input));
  assert.match(html, /<div class="test-title">ARTHRITIS PROFILE<\/div>/);
  for (let index = 1; index <= 7; index++) assert.match(html, new RegExp(`Lab result ${index}`));
  assert.match(html, /data-report-content="arthritis-profile"/);
  assert.match(html, /A negative result does not exclude rheumatoid arthritis/);
  assert.match(html, /a result alone cannot confirm or exclude gout/);
  assert.doesNotMatch(html, /anti-CCP antibodies are useful/i);

  const limited = buildReportHtml(sampleReport({
    ...input, parameters: input.parameters.filter(field => /uric acid|comments/i.test(field.parameter_name)),
  }));
  assert.match(limited, /A raised serum urate may occur without gout/);
  assert.doesNotMatch(limited, /A positive result can support rheumatoid arthritis/);
  const custom = buildReportHtml(sampleReport({ ...input, report_body: 'Lab-authored explanation' }));
  assert.doesNotMatch(custom, /data-report-content="arthritis-profile"/);
  assert.match(custom, /Lab-authored explanation/);
});

test('Ascitic Fluids Gram Stain records microscopy without inventing a negative result or culture finding', () => {
  const fields = getFallbackReportParameters({ name: 'Ascitic Fluids Gram Stain' });
  assert.deepEqual(fields.map(field => field.parameterName), [
    'Specimen / Site', 'Smear Method / Preparation', 'Inflammatory Cells / PMNs',
    'Gram Stain Findings', 'Gram Reaction / Bacterial Morphology', 'Impression', 'Comments',
  ]);
  assert.ok(fields.every(field => !field.normalRange));
  const input = {
    name: 'Ascitic Fluids Gram Stain', sample_type: 'Ascitic Fluid',
    parameters: [
      { parameter_name: 'Specimen / Site', value: 'Ascitic fluid', unit: '', normal_range: '' },
      { parameter_name: 'Smear Method / Preparation', value: 'Lab method', unit: '', normal_range: '' },
      { parameter_name: 'Inflammatory Cells / PMNs', value: 'Observed cells', unit: '', normal_range: '' },
      { parameter_name: 'Gram Stain Findings', value: 'Observed finding', unit: '', normal_range: '' },
      { parameter_name: 'Gram Reaction / Bacterial Morphology', value: 'Observed morphology', unit: '', normal_range: '' },
      { parameter_name: 'Impression', value: 'Lab impression', unit: '', normal_range: '' },
    ],
  };
  const html = buildReportHtml(sampleReport(input));
  assert.match(html, /<div class="test-title">ASCITIC FLUID GRAM STAIN<\/div>/);
  for (const value of ['Ascitic fluid', 'Lab method', 'Observed cells', 'Observed finding', 'Observed morphology', 'Lab impression']) {
    assert.match(html, new RegExp(value));
  }
  assert.match(html, /data-report-content="ascitic-fluid-gram-stain"/);
  assert.match(html, /does not exclude spontaneous bacterial peritonitis/);
  assert.match(html, /not an absolute ascitic-fluid PMN count/);
  assert.equal(getReportContent({ name: 'Peritonial Fluid Gram stain' }), null);
  const custom = buildReportHtml(sampleReport({ ...input, report_body: 'Lab-authored explanation' }));
  assert.doesNotMatch(custom, /data-report-content="ascitic-fluid-gram-stain"/);
  assert.match(custom, /Lab-authored explanation/);
});

test('AsciticFluidforProtein has a standalone total-protein report without a pleural ratio or invented SAAG', () => {
  const fields = getFallbackReportParameters({ name: 'AsciticFluidforProtein' });
  assert.deepEqual(fields.map(field => field.parameterName), [
    'Ascitic Fluid Total Protein', 'Specimen / Site', 'Appearance', 'Method / Analyzer', 'Comments',
  ]);
  assert.equal(fields[0].unit, 'g/dL');
  assert.equal(fields[0].normalRange, 'Interpretive; no universal reference interval');
  const input = {
    name: 'AsciticFluidforProtein', sample_type: 'Ascitic Fluid',
    parameters: [
      { parameter_name: 'Ascitic Fluid Total Protein', value: 'Lab result', unit: 'g/dL', normal_range: 'Lab interpretation' },
      { parameter_name: 'Specimen / Site', value: 'Ascitic fluid', unit: '', normal_range: '' },
      { parameter_name: 'Method / Analyzer', value: 'Lab method', unit: '', normal_range: '' },
    ],
  };
  const html = buildReportHtml(sampleReport(input));
  assert.match(html, /<div class="test-title">ASCITIC FLUID TOTAL PROTEIN<\/div>/);
  for (const value of ['Lab result', 'g/dL', 'Lab interpretation', 'Ascitic fluid', 'Lab method']) {
    assert.match(html, new RegExp(value));
  }
  assert.match(html, /data-report-content="ascitic-fluid-total-protein"/);
  assert.match(html, /universal healthy reference interval/);
  assert.match(html, /Do not calculate SAAG without separately measured paired serum and ascitic albumin/);
  assert.doesNotMatch(html, /body-fluid-protein-table/);
  assert.equal(getReportContent({ name: 'Body Fluides for Proein', sample_type: 'Body Fluid' }), null);
  const custom = buildReportHtml(sampleReport({ ...input, report_body: 'Lab-authored explanation' }));
  assert.doesNotMatch(custom, /data-report-content="ascitic-fluid-total-protein"/);
  assert.match(custom, /Lab-authored explanation/);
});

test('Bactec Culture for Aerobic Bacteria keeps specimen and report stage explicit without assuming growth', () => {
  const fields = getFallbackReportParameters({ name: 'Bactec Culture for Aerobic Bacteria' });
  assert.deepEqual(fields.map(field => field.parameterName), [
    'Specimen / Collection Site', 'Bottle / Medium', 'Collection Date / Time',
    'Culture Status / Result', 'Report Status', 'Time to Positivity',
    'Gram Stain from Positive Bottle', 'Organism(s) Isolated', 'Identification Method',
    'Antimicrobial Susceptibility', 'Comments',
  ]);
  assert.ok(fields.every(field => !field.normalRange));
  const input = {
    name: 'Bactec Culture for Aerobic Bacteria', sample_type: '',
    parameters: [
      { parameter_name: 'Specimen / Collection Site', value: 'Submitted specimen', unit: '', normal_range: '' },
      { parameter_name: 'Bottle / Medium', value: 'Aerobic bottle', unit: '', normal_range: '' },
      { parameter_name: 'Culture Status / Result', value: 'Lab culture result', unit: '', normal_range: '' },
      { parameter_name: 'Report Status', value: 'Lab report stage', unit: '', normal_range: '' },
      { parameter_name: 'Gram Stain from Positive Bottle', value: 'Lab stain finding', unit: '', normal_range: '' },
      { parameter_name: 'Organism(s) Isolated', value: 'Lab isolate', unit: '', normal_range: '' },
      { parameter_name: 'Antimicrobial Susceptibility', value: 'Lab susceptibility', unit: '', normal_range: '' },
    ],
  };
  const html = buildReportHtml(sampleReport(input));
  assert.match(html, /<div class="test-title">BACTEC AEROBIC CULTURE<\/div>/);
  for (const value of ['Submitted specimen', 'Aerobic bottle', 'Lab culture result', 'Lab report stage', 'Lab stain finding', 'Lab isolate', 'Lab susceptibility']) {
    assert.match(html, new RegExp(value));
  }
  assert.match(html, /data-report-content="bactec-aerobic-culture"/);
  assert.match(html, /Use a final no-growth statement only after/);
  assert.match(html, /An aerobic bottle does not substitute for an anaerobic culture/);
  assert.equal(getReportContent({ name: 'BactecCultureforAnaerobic Bacteria' }).key, 'bactec-anaerobic-culture');
  const custom = buildReportHtml(sampleReport({ ...input, report_body: 'Lab-authored explanation' }));
  assert.doesNotMatch(custom, /data-report-content="bactec-aerobic-culture"/);
  assert.match(custom, /Lab-authored explanation/);
});

test('BactecCultureforAnaerobic Bacteria reports its own bottle without assuming obligate anaerobes', () => {
  const fields = getFallbackReportParameters({ name: 'BactecCultureforAnaerobic Bacteria' });
  assert.deepEqual(fields.map(field => field.parameterName), [
    'Specimen / Collection Site', 'Bottle / Medium', 'Collection Date / Time',
    'Culture Status / Result', 'Report Status', 'Time to Positivity',
    'Gram Stain from Positive Bottle', 'Organism(s) Isolated', 'Identification Method',
    'Antimicrobial Susceptibility', 'Comments',
  ]);
  assert.ok(fields.every(field => !field.normalRange));
  const input = {
    name: 'BactecCultureforAnaerobic Bacteria', sample_type: '',
    parameters: [
      { parameter_name: 'Specimen / Collection Site', value: 'Submitted specimen', unit: '', normal_range: '' },
      { parameter_name: 'Bottle / Medium', value: 'Anaerobic bottle', unit: '', normal_range: '' },
      { parameter_name: 'Culture Status / Result', value: 'Lab culture result', unit: '', normal_range: '' },
      { parameter_name: 'Report Status', value: 'Lab report stage', unit: '', normal_range: '' },
      { parameter_name: 'Gram Stain from Positive Bottle', value: 'Lab stain finding', unit: '', normal_range: '' },
      { parameter_name: 'Organism(s) Isolated', value: 'Lab isolate', unit: '', normal_range: '' },
      { parameter_name: 'Antimicrobial Susceptibility', value: 'Lab susceptibility', unit: '', normal_range: '' },
    ],
  };
  const html = buildReportHtml(sampleReport(input));
  assert.match(html, /<div class="test-title">BACTEC ANAEROBIC CULTURE<\/div>/);
  for (const value of ['Submitted specimen', 'Anaerobic bottle', 'Lab culture result', 'Lab report stage', 'Lab stain finding', 'Lab isolate', 'Lab susceptibility']) {
    assert.match(html, new RegExp(value));
  }
  assert.match(html, /data-report-content="bactec-anaerobic-culture"/);
  assert.match(html, /can contain an obligate anaerobe or a facultative organism/);
  assert.match(html, /Do not label an isolate as an obligate anaerobe solely because it grew/);
  assert.equal(getReportContent({ name: 'Bactec Culture for Aerobic Bacteria' }).key, 'bactec-aerobic-culture');
  const custom = buildReportHtml(sampleReport({ ...input, report_body: 'Lab-authored explanation' }));
  assert.doesNotMatch(custom, /data-report-content="bactec-anaerobic-culture"/);
  assert.match(custom, /Lab-authored explanation/);
});

test('anticardiolipin IgA has a dedicated non-criteria aPL report without matching combined isotypes', () => {
  const html = buildReportHtml(sampleReport({
    name: 'Anti Cardiolipin Antibody IgA',
    sample_type: 'Serum',
    parameters: [
      { parameter_name: 'Result', value: '22.4', unit: '', normal_range: '' },
      { parameter_name: 'Comments', value: 'Interpret with the criteria antiphospholipid tests.', unit: '', normal_range: '' },
    ],
  }));
  assert.match(html, /<div class="test-title">ANTICARDIOLIPIN ANTIBODY IgA<\/div>/);
  assert.match(html, /ANTICARDIOLIPIN ANTIBODY IgA, SERUM/);
  assert.match(html, />22\.4<\/span>/);
  assert.match(html, /APL-U\/mL/);
  assert.match(html, /&lt; 15\.0/);
  assert.match(html, /non-criteria antiphospholipid antibody/);
  assert.match(html, /is not included in the IgG\/IgM laboratory domains/);
  assert.match(html, /at least 12 weeks may help assess persistence/);
  assert.match(html, /Interpret with the criteria antiphospholipid tests\./);
  assert.doesNotMatch(html, /ANTICARDIOLIPIN ANTIBODY Ig[GM], SERUM/);

  const blank = buildReportHtml(sampleReport({ name: 'AntiCardiolipinAntibodyIgA', parameters: [] }));
  assert.match(blank, /class="results-table single-analyte-table anticardiolipin-iga-table"/);
  assert.match(blank, /<td><span class="">-<\/span><\/td>/);
  assert.doesNotMatch(blank, /<td><span[^>]*>(?:Positive|Negative)<\/span>/i);

  const fallback = getFallbackReportParameters({ name: 'Anti Cardiolipin Antibody IgA' });
  assert.deepEqual(fallback.map(field => field.parameterName), ['Anticardiolipin Antibody IgA, Serum', 'Comments']);
  assert.equal(fallback[0].unit, 'APL-U/mL');

  for (const name of [
    'Anti Cardiolipin Antibody IgA &IgG',
    'Anti Cardiolipin Antibody IgA & IgM',
    'Anti Cardiolipin Antibody IgA, IgG & IgM',
  ]) {
    const combined = buildReportHtml(sampleReport({ name, parameters: [{ parameter_name: 'Result', value: 'Combined isotype result' }] }));
    assert.doesNotMatch(combined, /class="results-table single-analyte-table anticardiolipin-iga-table"/);
  }
});

test('anticardiolipin IgA and IgM panel reports both isotypes without absorbing other panels', () => {
  const html = buildReportHtml(sampleReport({
    name: 'Anti Cardiolipin Antibody IgA & IgM',
    sample_type: 'Serum',
    parameters: [
      { parameter_name: 'Anticardiolipin Antibody IgA, Serum', value: '18.2', unit: 'APL-U/mL', normal_range: '< 15.0' },
      { parameter_name: 'Anticardiolipin Antibody IgM, Serum', value: '42.6', unit: 'MPL-U/mL', normal_range: '< 15.0' },
      { parameter_name: 'Comments', value: 'Repeat criteria antibodies when clinically indicated.', unit: '', normal_range: '' },
    ],
  }));
  assert.match(html, /<div class="test-title">ANTICARDIOLIPIN ANTIBODY IgA & IgM<\/div>/);
  assert.match(html, /class="results-table single-analyte-table anticardiolipin-iga-igm-panel-table"/);
  assert.match(html, /ANTICARDIOLIPIN ANTIBODY IgA, SERUM/);
  assert.match(html, /ANTICARDIOLIPIN ANTIBODY IgM, SERUM/);
  assert.match(html, />18\.2<\/span>/);
  assert.match(html, />42\.6<\/span>/);
  assert.match(html, /APL-U\/mL/);
  assert.match(html, /MPL-U\/mL/);
  assert.match(html, /IgM is one of the criteria antiphospholipid antibody isotypes/);
  assert.match(html, /IgA is not included in the laboratory domains/);
  assert.match(html, /40&ndash;79 units is considered moderate/);
  assert.match(html, /Repeat criteria antibodies when clinically indicated\./);
  assert.doesNotMatch(html, /ANTICARDIOLIPIN ANTIBODY IgG, SERUM/);

  const blank = buildReportHtml(sampleReport({ name: 'Anti Cardiolipin Antibody IgA &IgM', parameters: [] }));
  assert.equal((blank.match(/<td><span class="">-<\/span><\/td>/g) || []).length, 2);
  assert.doesNotMatch(blank, /<td><span[^>]*>(?:Positive|Negative)<\/span>/i);

  const fallback = getFallbackReportParameters({ name: 'Anti Cardiolipin Antibody IgA & IgM' });
  assert.deepEqual(
    fallback.map(field => field.parameterName),
    ['Anticardiolipin Antibody IgA, Serum', 'Anticardiolipin Antibody IgM, Serum', 'Comments']
  );
  assert.deepEqual(fallback.slice(0, 2).map(field => field.unit), ['APL-U/mL', 'MPL-U/mL']);

  for (const name of ['Anti Cardiolipin Antibody IgA & IgG', 'Anti Cardiolipin Antibody IgA, IgG & IgM']) {
    const other = buildReportHtml(sampleReport({ name, parameters: [{ parameter_name: 'Result', value: 'Other panel result' }] }));
    assert.doesNotMatch(other, /anticardiolipin-iga-igm-panel-table/);
  }
});

test('anticardiolipin IgA and IgG panel reports both isotypes without absorbing other panels', () => {
  const html = buildReportHtml(sampleReport({
    name: 'Anti Cardiolipin Antibody IgA &IgG',
    sample_type: 'Serum',
    parameters: [
      { parameter_name: 'Anticardiolipin Antibody IgA, Serum', value: '12.1', unit: 'APL-U/mL', normal_range: '< 15.0' },
      { parameter_name: 'Anticardiolipin Antibody IgG, Serum', value: '64.5', unit: 'GPL-U/mL', normal_range: '< 15.0' },
      { parameter_name: 'Comments', value: 'Correlate with the complete APS laboratory profile.', unit: '', normal_range: '' },
    ],
  }));
  assert.match(html, /<div class="test-title">ANTICARDIOLIPIN ANTIBODY IgA & IgG<\/div>/);
  assert.match(html, /class="results-table single-analyte-table anticardiolipin-iga-igg-panel-table"/);
  assert.match(html, /ANTICARDIOLIPIN ANTIBODY IgA, SERUM/);
  assert.match(html, /ANTICARDIOLIPIN ANTIBODY IgG, SERUM/);
  assert.match(html, />12\.1<\/span>/);
  assert.match(html, />64\.5<\/span>/);
  assert.match(html, /APL-U\/mL/);
  assert.match(html, /GPL-U\/mL/);
  assert.match(html, /IgG is one of the criteria antiphospholipid antibody isotypes/);
  assert.match(html, /IgA is not included in the laboratory domains/);
  assert.match(html, /40&ndash;79 units is considered moderate/);
  assert.match(html, /Correlate with the complete APS laboratory profile\./);
  assert.doesNotMatch(html, /ANTICARDIOLIPIN ANTIBODY IgM, SERUM/);

  const blank = buildReportHtml(sampleReport({ name: 'Anti Cardiolipin Antibody IgA & IgG', parameters: [] }));
  assert.equal((blank.match(/<td><span class="">-<\/span><\/td>/g) || []).length, 2);
  assert.doesNotMatch(blank, /<td><span[^>]*>(?:Positive|Negative)<\/span>/i);

  const fallback = getFallbackReportParameters({ name: 'Anti Cardiolipin Antibody IgA &IgG' });
  assert.deepEqual(
    fallback.map(field => field.parameterName),
    ['Anticardiolipin Antibody IgA, Serum', 'Anticardiolipin Antibody IgG, Serum', 'Comments']
  );
  assert.deepEqual(fallback.slice(0, 2).map(field => field.unit), ['APL-U/mL', 'GPL-U/mL']);

  for (const name of ['Anti Cardiolipin Antibody IgA & IgM', 'Anti Cardiolipin Antibody IgA, IgG & IgM']) {
    const other = buildReportHtml(sampleReport({ name, parameters: [{ parameter_name: 'Result', value: 'Other panel result' }] }));
    assert.doesNotMatch(other, /anticardiolipin-iga-igg-panel-table/);
  }
});

test('anticardiolipin IgG and IgM panel reports both criteria isotypes separately', () => {
  const html = buildReportHtml(sampleReport({
    name: 'Anti Cardiolipin Antibody IgG & IgM',
    sample_type: 'Serum',
    parameters: [
      { parameter_name: 'Anticardiolipin Antibody IgG, Serum', value: '82.3', unit: 'GPL-U/mL', normal_range: '< 15.0' },
      { parameter_name: 'Anticardiolipin Antibody IgM, Serum', value: '27.4', unit: 'MPL-U/mL', normal_range: '< 15.0' },
      { parameter_name: 'Comments', value: 'Confirm persistence when clinically appropriate.', unit: '', normal_range: '' },
    ],
  }));
  assert.match(html, /<div class="test-title">ANTICARDIOLIPIN ANTIBODY IgG & IgM<\/div>/);
  assert.match(html, /class="results-table single-analyte-table anticardiolipin-igg-igm-panel-table"/);
  assert.match(html, /ANTICARDIOLIPIN ANTIBODY IgG, SERUM/);
  assert.match(html, /ANTICARDIOLIPIN ANTIBODY IgM, SERUM/);
  assert.match(html, />82\.3<\/span>/);
  assert.match(html, />27\.4<\/span>/);
  assert.match(html, /GPL-U\/mL/);
  assert.match(html, /MPL-U\/mL/);
  assert.match(html, /IgG and IgM are criteria antiphospholipid antibody isotypes/);
  assert.match(html, /second specimen collected at least 12 weeks later/);
  assert.match(html, /40&ndash;79 units is considered moderate/);
  assert.match(html, /IgG and IgM have different laboratory weights/);
  assert.match(html, /Confirm persistence when clinically appropriate\./);
  assert.doesNotMatch(html, /ANTICARDIOLIPIN ANTIBODY IgA, SERUM/);

  const blank = buildReportHtml(sampleReport({ name: 'Anti Cardiolipin Antibody IgG &IgM', parameters: [] }));
  assert.equal((blank.match(/<td><span class="">-<\/span><\/td>/g) || []).length, 2);
  assert.doesNotMatch(blank, /<td><span[^>]*>(?:Positive|Negative)<\/span>/i);

  const fallback = getFallbackReportParameters({ name: 'Anti Cardiolipin Antibody IgG & IgM' });
  assert.deepEqual(
    fallback.map(field => field.parameterName),
    ['Anticardiolipin Antibody IgG, Serum', 'Anticardiolipin Antibody IgM, Serum', 'Comments']
  );
  assert.deepEqual(fallback.slice(0, 2).map(field => field.unit), ['GPL-U/mL', 'MPL-U/mL']);

  for (const name of ['Anti Cardiolipin Antibody IgA & IgM', 'Anti Cardiolipin Antibody IgA & IgG', 'Anti Cardiolipin Antibody IgA, IgG & IgM']) {
    const other = buildReportHtml(sampleReport({ name, parameters: [{ parameter_name: 'Result', value: 'Other panel result' }] }));
    assert.doesNotMatch(other, /anticardiolipin-igg-igm-panel-table/);
  }
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

test('CSF chloride has a dedicated electrolyte report with age-aware laboratory interpretation', () => {
  const html = buildReportHtml(sampleReport({
    name: 'CSFFluidfor Chloride',
    sample_type: 'Cerebrospinal Fluid (CSF)',
    parameters: [
      { parameter_name: 'Chloride, CSF', value: '121', unit: 'mmol/L', normal_range: '118 - 132' },
      { parameter_name: 'Collection Date / Time', value: '2026-09-30 10:30', unit: '', normal_range: '' },
      { parameter_name: 'Appearance', value: 'Clear', unit: '', normal_range: '' },
      { parameter_name: 'Method / Analyzer', value: 'Ion-selective electrode', unit: '', normal_range: '' },
      { parameter_name: 'Comments', value: 'Interpret with the complete CSF panel.', unit: '', normal_range: '' },
    ],
  }));
  assert.match(html, /<div class="test-title">CHLORIDE, CEREBROSPINAL FLUID<\/div>/);
  assert.match(html, /class="results-table single-analyte-table csf-chloride-table"/);
  assert.match(html, /CHLORIDE, CEREBROSPINAL FLUID/);
  assert.match(html, />121<\/span>/);
  assert.match(html, /118 - 132/);
  assert.match(html, /Ion-selective electrode/);
  assert.match(html, /adult interval must not be applied to an infant result/);
  assert.match(html, /not recommended as a routine stand-alone test for suspected tuberculous meningitis/);
  assert.match(html, /Interpret with the complete CSF panel\./);

  const fallback = getFallbackReportParameters({ name: 'CSFFluidfor Chloride' });
  assert.equal(fallback[0].parameterName, 'Chloride, CSF');
  assert.equal(fallback[0].unit, 'mmol/L');
  assert.ok(fallback.some(field => field.parameterName === 'Method / Analyzer'));
});

test('Body Fluids Biochemistry uses a structured, specimen-aware chemistry panel', () => {
  const html = buildReportHtml(sampleReport({
    name: 'Body Fluids Biochemistry',
    sample_type: 'Body Fluid',
    parameters: [
      { parameter_name: 'Fluid Type / Source', value: 'Pleural fluid, left side' },
      { parameter_name: 'Collection Date / Time', value: '28-Sep-2026 10:15' },
      { parameter_name: 'Appearance', value: 'Clear, pale yellow' },
      { parameter_name: 'Total Protein, Body Fluid', value: '3.4', unit: 'g/dL', normal_range: 'Fluid-specific / interpretive' },
      { parameter_name: 'Albumin, Body Fluid', value: '1.8', unit: 'g/dL', normal_range: 'Fluid-specific / interpretive' },
      { parameter_name: 'Glucose, Body Fluid', value: '82', unit: 'mg/dL', normal_range: 'Fluid-specific / interpretive' },
      { parameter_name: 'LDH, Body Fluid', value: '410', unit: 'U/L', normal_range: 'Fluid-specific / interpretive' },
      { parameter_name: 'Method / Analyzer', value: 'Laboratory validated analyser' },
      { parameter_name: 'Comments', value: 'Interpret with paired serum studies.' },
    ],
  }));
  assert.match(html, /<div class="test-title">BODY FLUID BIOCHEMISTRY<\/div>/);
  assert.match(html, /class="results-table single-analyte-table body-fluid-biochemistry-table"/);
  assert.match(html, /Pleural fluid, left side/);
  assert.match(html, /TOTAL PROTEIN/);
  assert.match(html, /ALBUMIN/);
  assert.match(html, /GLUCOSE/);
  assert.match(html, /LDH/);
  assert.match(html, /Fluid values alone do not establish an exudate or transudate/);
  assert.match(html, /serum-ascites albumin gradient \(SAAG\)/);
  assert.match(html, /Interpret with paired serum studies\./);
  const fallback = getFallbackReportParameters({ name: 'Body Fluids Biochemistry', sample_type: 'Body Fluid' });
  assert.deepEqual(fallback.slice(0, 7).map(field => field.parameterName), [
    'Fluid Type / Source', 'Collection Date / Time', 'Appearance', 'Total Protein, Body Fluid',
    'Albumin, Body Fluid', 'Glucose, Body Fluid', 'LDH, Body Fluid',
  ]);
});

test('BodyFluids for SpecificGravity uses a source-aware physical examination format', () => {
  const html = buildReportHtml(sampleReport({
    name: 'BodyFluids for SpecificGravity', sample_type: 'Body Fluid',
    parameters: [
      { parameter_name: 'Specific Gravity, Body Fluid', value: '1.022', normal_range: 'Fluid-specific / interpretive' },
      { parameter_name: 'Fluid Type / Source', value: 'Peritoneal fluid' },
      { parameter_name: 'Collection Date / Time', value: '28-Sep-2026 11:20' },
      { parameter_name: 'Appearance', value: 'Clear, straw coloured' },
      { parameter_name: 'Method / Instrument', value: 'Refractometry' },
      { parameter_name: 'Comments', value: 'Correlate with fluid protein and albumin.' },
    ],
  }));
  assert.match(html, /<div class="test-title">SPECIFIC GRAVITY, BODY FLUID<\/div>/);
  assert.match(html, /class="results-table single-analyte-table body-fluid-specific-gravity-table"/);
  assert.match(html, /Peritoneal fluid/);
  assert.match(html, /Refractometry/);
  assert.match(html, /There is no universal reference interval for all body fluids/);
  assert.match(html, /must not be used to classify a fluid as transudate or exudate/);
  assert.match(html, /Correlate with fluid protein and albumin\./);
  assert.equal(getFallbackReportParameters({ name: 'BodyFluids for SpecificGravity' })[0].parameterName, 'Specific Gravity, Body Fluid');
  for (const separateName of ['Pleural Fluid Specific Gravity', 'Joint Fluid for Specific Gravity', 'CSF Fluid for Specific Gravity']) {
    assert.doesNotMatch(buildReportHtml(sampleReport({ name: separateName, parameters: [] })), /body-fluid-specific-gravity-table/);
  }
});

test('C3 (Complement-3) uses a dedicated serum complement concentration report', () => {
  const html = buildReportHtml(sampleReport({
    name: 'C3 (Complement-3)', sample_type: 'Serum',
    parameters: [
      { parameter_name: 'Complement C3, Serum', value: '86', unit: 'mg/dL', normal_range: '75 - 175' },
      { parameter_name: 'Specimen', value: 'Serum' },
      { parameter_name: 'Collection Date / Time', value: '29-Sep-2026 10:15' },
      { parameter_name: 'Method / Analyzer', value: 'Immunoturbidimetry' },
      { parameter_name: 'Clinical Indication', value: 'Clinical correlation requested' },
    ],
  }));
  assert.match(html, /<div class="test-title">COMPLEMENT C3 \(C3\), SERUM<\/div>/);
  assert.match(html, /class="results-table single-analyte-table complement-c3-table"/);
  assert.match(html, /Immunoturbidimetry/);
  assert.match(html, /This assay measures the concentration of complement component C3/);
  assert.match(html, /not a functional C3 assay/);
  assert.match(html, /acute-phase reactant/);
  assert.equal(getFallbackReportParameters({ name: 'C3 (Complement-3)' })[0].parameterName, 'Complement C3, Serum');
  for (const separateName of ['C4 (Complement-4)', 'C3 Functional Assay', 'Complement C3d']) {
    assert.doesNotMatch(buildReportHtml(sampleReport({ name: separateName, parameters: [] })), /complement-c3-table/);
  }
});

test('C4 (Complement-4) uses a dedicated serum complement concentration report', () => {
  const html = buildReportHtml(sampleReport({
    name: 'C4 (Complement-4)', sample_type: 'Serum',
    parameters: [
      { parameter_name: 'Complement C4, Serum', value: '18', unit: 'mg/dL', normal_range: '14 - 40' },
      { parameter_name: 'Specimen', value: 'Serum' },
      { parameter_name: 'Collection Date / Time', value: '29-Sep-2026 10:15' },
      { parameter_name: 'Method / Analyzer', value: 'Nephelometry' },
      { parameter_name: 'Clinical Indication', value: 'Clinical correlation requested' },
    ],
  }));
  assert.match(html, /<div class="test-title">COMPLEMENT C4 \(C4\), SERUM<\/div>/);
  assert.match(html, /class="results-table single-analyte-table complement-c4-table"/);
  assert.match(html, /Nephelometry/);
  assert.match(html, /This assay measures the concentration of complement component C4/);
  assert.match(html, /not a functional C4 assay/);
  assert.equal(getFallbackReportParameters({ name: 'C4 (Complement-4)' })[0].parameterName, 'Complement C4, Serum');
  for (const separateName of ['C3 (Complement-3)', 'C4 Functional Assay', 'Complement C4d']) {
    assert.doesNotMatch(buildReportHtml(sampleReport({ name: separateName, parameters: [] })), /complement-c4-table/);
  }
});

test('C ANCA (Anti-PR3) uses a dedicated cANCA and antigen-specific PR3 report', () => {
  const html = buildReportHtml(sampleReport({
    name: 'C ANCA (Anti-PR3)', sample_type: 'Serum',
    parameters: [
      { parameter_name: 'cANCA (IIF) Result / Pattern', value: 'Cytoplasmic pattern detected', normal_range: 'Negative' },
      { parameter_name: 'Anti-PR3 Antibody, IgG', value: '2.4', unit: 'U/mL', normal_range: 'Laboratory cutoff applies' },
      { parameter_name: 'Titre / Endpoint Dilution', value: '1:80' },
      { parameter_name: 'Method / Analyzer', value: 'Antigen-specific immunoassay with IIF correlation' },
    ],
  }));
  assert.match(html, /<div class="test-title">cANCA \(ANTI-PR3\)<\/div>/);
  assert.match(html, /class="results-table single-analyte-table canca-pr3-table"/);
  assert.match(html, /CYTOPLASMIC ANCA \/ ANTI-PR3/);
  assert.match(html, /Antigen-specific immunoassay with IIF correlation/);
  assert.match(html, /not diagnostic of ANCA-associated vasculitis/);
  assert.match(html, /A negative result does not exclude ANCA-associated vasculitis/);
  assert.equal(getFallbackReportParameters({ name: 'C ANCA (Anti-PR3)' })[0].parameterName, 'cANCA (IIF) Result / Pattern');
  for (const separateName of ['P ANCA (Anti - PR3)', 'MPO-ANCA', 'ANCA Vasculitis Panel']) {
    assert.doesNotMatch(buildReportHtml(sampleReport({ name: separateName, parameters: [] })), /canca-pr3-table/);
  }
});

test('CCT (Creatinine Clearance Test) calculates uncorrected clearance from complete timed collection inputs', () => {
  const html = buildReportHtml(sampleReport({
    name: 'CCT (Creatinine Clearance Test)', sample_type: 'Serum & 24h Urine',
    parameters: [
      { parameter_name: 'Urine Creatinine Concentration', value: '100', unit: 'mg/dL' },
      { parameter_name: 'Total Urine Volume', value: '1440', unit: 'mL' },
      { parameter_name: 'Collection Duration', value: '24', unit: 'hours' },
      { parameter_name: 'Serum Creatinine', value: '1.0', unit: 'mg/dL' },
      { parameter_name: 'Method / Analyzer', value: 'Enzymatic colorimetric assay' },
    ],
  }));
  assert.match(html, /<div class="test-title">CREATININE CLEARANCE TEST \(CCT\)<\/div>/);
  assert.match(html, /class="results-table single-analyte-table creatinine-clearance-table"/);
  assert.match(html, />100\.0 <span class="single-analyte-status normal">CALCULATED<\/span>/);
  assert.match(html, /Accurate collection timing and complete urine collection are essential/);
  assert.match(html, /not body-surface-area corrected/);
  assert.equal(getFallbackReportParameters({ name: 'CCT (Creatinine Clearance Test)' })[4].entryMode, 'calculated');
  assert.doesNotMatch(buildReportHtml(sampleReport({ name: 'Creatinine, 24-Hour Urine', parameters: [] })), /creatinine-clearance-table/);
});

test('CD3Lymphocyte uses a focused flow-cytometry T-lymphocyte report', () => {
  const html = buildReportHtml(sampleReport({
    name: 'CD3Lymphocyte', sample_type: 'EDTA Whole Blood',
    parameters: [
      { parameter_name: 'CD3+ T Lymphocytes', value: '68', unit: '% of lymphocytes', normal_range: 'Laboratory interval' },
      { parameter_name: 'CD3+ T Lymphocytes, Absolute Count', value: '1224', unit: 'cells/µL', normal_range: 'Laboratory interval' },
      { parameter_name: 'Total Lymphocyte Count', value: '1800', unit: 'cells/µL' },
      { parameter_name: 'Method / Analyzer', value: 'Flow cytometry' },
    ],
  }));
  assert.match(html, /<div class="test-title">CD3\+ T LYMPHOCYTES<\/div>/);
  assert.match(html, /class="results-table single-analyte-table cd3-lymphocyte-table"/);
  assert.match(html, /CD3\+ T Lymphocytes, Absolute Count/);
  assert.match(html, /Percentage and absolute count describe different aspects of the result/);
  assert.match(html, /not a complete T-, B-, and NK-cell panel/);
  assert.equal(getFallbackReportParameters({ name: 'CD3Lymphocyte' })[0].parameterName, 'CD3+ T Lymphocytes');
  assert.doesNotMatch(buildReportHtml(sampleReport({ name: 'CD4 Lymphocyte', parameters: [] })), /cd3-lymphocyte-table/);
});

test('CD4Lymphocyte uses a focused flow-cytometry helper T-lymphocyte report', () => {
  const html = buildReportHtml(sampleReport({
    name: 'CD4Lymphocyte', sample_type: 'EDTA Blood',
    parameters: [
      { parameter_name: 'CD4+ T Lymphocytes', value: '42', unit: '% of lymphocytes', normal_range: 'Laboratory interval' },
      { parameter_name: 'CD4+ T Lymphocytes, Absolute Count', value: '756', unit: 'cells/µL', normal_range: 'Laboratory interval' },
      { parameter_name: 'Total Lymphocyte Count', value: '1800', unit: 'cells/µL' },
    ],
  }));
  assert.match(html, /<div class="test-title">CD4\+ T LYMPHOCYTES<\/div>/);
  assert.match(html, /class="results-table single-analyte-table cd4-lymphocyte-table"/);
  assert.match(html, /CD4\+ T Lymphocytes, Absolute Count/);
  assert.match(html, /CD4 identifies a helper T-cell subset/);
  assert.match(html, /not a complete T-, B-, and NK-cell panel/);
  assert.equal(getFallbackReportParameters({ name: 'CD4Lymphocyte' })[0].parameterName, 'CD4+ T Lymphocytes');
  assert.doesNotMatch(buildReportHtml(sampleReport({ name: 'CD3 Lymphocyte', parameters: [] })), /cd4-lymphocyte-table/);
});

test('Bronchial Washingfor C/s uses a specimen-specific bacterial culture report', () => {
  const html = buildReportHtml(sampleReport({
    name: 'Bronchial Washingfor C/s', sample_type: 'Bronchial Washing',
    parameters: [
      { parameter_name: 'Culture Status / Result', value: 'Growth detected', normal_range: 'No growth' },
      { parameter_name: 'Bronchial Site / Procedure', value: 'Right middle lobe bronchial washing' },
      { parameter_name: 'Direct Gram Stain', value: 'Few Gram-negative bacilli seen' },
      { parameter_name: 'Aerobic Culture', value: 'Growth after incubation' },
      { parameter_name: 'Culture Quantity / Semi-quantitation', value: 'Moderate growth' },
      { parameter_name: 'Organism(s) Isolated', value: 'Lab-entered isolate' },
      { parameter_name: 'Antimicrobial Susceptibility', value: 'Lab-entered susceptibility' },
    ],
  }));
  assert.match(html, /<div class="test-title">BRONCHIAL WASHING CULTURE & SENSITIVITY<\/div>/);
  assert.match(html, /class="results-table culture-table bronchial-washing-culture-table"/);
  assert.match(html, /Right middle lobe bronchial washing/);
  assert.match(html, /Culture Quantity \/ Semi-quantitation/);
  assert.match(html, /ANTIMICROBIAL SUSCEPTIBILITY/);
  assert.match(html, /may reflect lower-respiratory infection, airway colonisation, or contamination/);
  assert.match(html, /Mycobacterial, fungal, viral, and molecular investigations require separate/);
  assert.equal(getFallbackReportParameters({ name: 'Bronchial Washingfor C/s' })[0].parameterName, 'Culture Status / Result');
  assert.doesNotMatch(buildReportHtml(sampleReport({ name: 'Bronchial Washing for PAP', parameters: [] })), /bronchial-washing-culture-table/);
});

test('bone marrow cytology uses a structured aspirate morphology report distinct from the combined aspiration format', () => {
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
  assert.match(separate, /class="bone-marrow-aspiration-cytology-report"/);
  assert.doesNotMatch(separate, /class="bone-marrow-cytology-report"/);
});

test('bone marrow aspiration and cytology has a complete modern morphology and ancillary-studies format', () => {
  const html = buildReportHtml(sampleReport({
    name: 'BoneMarrowAspiration&Cytology',
    sample_type: 'Bone Marrow Aspirate',
    parameters: [
      { parameter_name: 'Specimen', value: 'Posterior iliac crest aspirate' },
      { parameter_name: 'Clinical History', value: 'Unexplained cytopenia under evaluation' },
      { parameter_name: 'Gross Description', value: 'Particulate aspirate; adequate for morphology' },
      { parameter_name: 'Peripheral Blood Counts', value: 'CBC correlation supplied' },
      { parameter_name: 'Peripheral Blood Smear', value: 'Representative peripheral-smear findings' },
      { parameter_name: 'Nucleated Differential / Myelogram', value: 'Differential findings entered by the reporting pathologist' },
      { parameter_name: 'Total Nucleated Cells Counted', value: '500', unit: 'cells' },
      { parameter_name: 'Myeloid : Erythroid Ratio', value: '2.5 : 1' },
      { parameter_name: 'Blasts (%)', value: '1', unit: '%' },
      { parameter_name: 'Microscopic Description', value: 'Detailed sample morphology' },
      { parameter_name: 'Iron Stain / Stores', value: 'Iron-stain findings entered here' },
      { parameter_name: 'Sideroblasts / Ring Sideroblasts', value: 'Sideroblast assessment entered here' },
      { parameter_name: 'Flow Cytometry', value: 'Flow-cytometry correlation pending' },
      { parameter_name: 'Cytogenetics / FISH', value: 'Cytogenetic correlation pending' },
      { parameter_name: 'Molecular Studies', value: 'Molecular correlation pending' },
      { parameter_name: 'Impression', value: 'Morphology-based diagnostic impression' },
      { parameter_name: 'Integrated Diagnosis / Report Status', value: 'Preliminary; ancillary studies pending' },
      { parameter_name: 'Advice', value: 'Correlate with trephine biopsy and ancillary studies' },
    ],
  }));
  assert.match(html, /<div class="test-title">BONE MARROW ASPIRATION &amp; CYTOLOGY<\/div>/);
  assert.match(html, /class="bone-marrow-aspiration-cytology-report"/);
  assert.match(html, /SPECIMEN, PROCEDURE AND CLINICAL DATA/);
  assert.match(html, /PERIPHERAL BLOOD CORRELATION/);
  assert.match(html, /ASPIRATE MORPHOLOGY AND MYELOGRAM/);
  assert.match(html, /IRON, SPECIAL STAINS AND ANCILLARY STUDIES/);
  assert.match(html, /INTERPRETATION AND CONCLUSION/);
  assert.match(html, /Posterior iliac crest aspirate/);
  assert.match(html, /Detailed sample morphology/);
  assert.match(html, /Sideroblasts \/ Ring Sideroblasts/);
  assert.match(html, /Flow Cytometry/);
  assert.match(html, /Cytogenetics \/ FISH/);
  assert.match(html, /Molecular Studies/);
  assert.match(html, /Trephine Biopsy Correlation/);
  assert.match(html, /no universal adult reference interval/);
  assert.match(html, /Do not interpret a blank or unperformed study as a negative result/);

  const fallback = getFallbackReportParameters({ name: 'Bone Marrow Aspiration & Cytology', sample_type: 'Bone Marrow Aspirate' });
  assert.equal(fallback[0].parameterName, 'Specimen / Aspirate Site');
  assert.ok(fallback.some(field => field.parameterName === 'Nucleated Differential / Myelogram'));
  assert.ok(fallback.some(field => field.parameterName === 'Sideroblasts / Ring Sideroblasts'));
  assert.ok(fallback.some(field => field.parameterName === 'Flow Cytometry'));
  assert.ok(fallback.some(field => field.parameterName === 'Integrated Diagnosis / Report Status'));
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

test('local catalogue: existing report bodies stay unchanged inside the pagination shell', async context => {
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
      // Named combinations now display all requested components, not TLC alone.
      const normalizedInputName = String(input.name).toLowerCase().replace(/[^a-z0-9]/g, '');
      const isActh = normalizedInputName === 'acth'
        || normalizedInputName === 'acthplasma'
        || normalizedInputName.includes('adrenocortic');
      const isAda = normalizedInputName === 'ada'
        || normalizedInputName.includes('adenosinedeaminase')
        || normalizedInputName.endsWith('forada');
      const isDnph = normalizedInputName === 'dnph'
        || normalizedInputName === '24dnph'
        || normalizedInputName.includes('dinitrophenylhydrazine');
      const isDiabeticProfile = ['diabeticprofile', 'diabetesprofile', 'diabetesmellitusprofile', 'diabetescheckupprofile'].includes(normalizedInputName);
      const isExtendedDiabeticProfile = ['diabeticprofileextended', 'diabetesprofileextended', 'extendeddiabeticprofile'].includes(normalizedInputName);
      const isDiabeticRenalProfile = ['diabeticrenalprofile', 'diabetesrenalprofile', 'diabetickidneyprofile'].includes(normalizedInputName);
      const isEarSwabGramStain = ['earcuwahgamstain', 'earswabgramstain'].includes(normalizedInputName);
      const isEarSwabAfbStain = normalizedInputName === 'earswabafbstain';
      const isFshPrl = ['fshprl', 'fshprolactin', 'folliclestimulatinghormoneprolactin'].includes(normalizedInputName);
      const isFshLhPrl = ['fshlhprl', 'fshlhprolactin', 'fshlhandprl'].includes(normalizedInputName);
      const isFemaleInfertilityProfile = ['femaleinfertilityprofile', 'femaleinfertilitypanel', 'infertilityprofilefemale'].includes(normalizedInputName);
      const isFernTest = ['ferntest', 'ferntestcollcharges10oextra', 'cervicalmucusferning', 'cervicalmucusferntest'].includes(normalizedInputName);
      const isWuchereriaBancroftiAntigen = ['filariawuchereriabancroftiantigenedtabloimmuno', 'filariawuchereriabancroftiantigen', 'wuchereriabancroftiantigen'].includes(normalizedInputName);
      const isFilariaAntigen = ['filariaantigen', 'filarialantigen', 'circulatingfilarialantigen'].includes(normalizedInputName);
      const isFluidAspirationCytology = ['fluidaspirationcytology', 'bodyfluidaspirationcytology', 'fluidcytology'].includes(normalizedInputName);
      const isHbElectrophoresis = ['hbelectrophoresis', 'hemoglobinelectrophoresis', 'haemoglobinelectrophoresis', 'hemoglobinopathyassessment', 'haemoglobinopathyassessment'].includes(normalizedInputName);
      const isFoetalHaemoglobinByHplc = ['foetalhaemoglobinbyhplc', 'fetalhaemoglobinbyhplc', 'fetalhemoglobinbyhplc', 'hemoglobinfbyhplc', 'haemoglobinfbyhplc'].includes(normalizedInputName);
      const isFoetalHaemoglobin = ['foetalhaemoglobin', 'fetalhaemoglobin', 'fetalhemoglobin', 'hemoglobinf', 'haemoglobinf'].includes(normalizedInputName);
      const isFreeBetaHcg = ['freebetahcg', 'freebetahcgquantitative', 'freebhcg', 'freebetahumanchorionicgonadotropin'].includes(normalizedInputName);
      const isFreeCholesterol = ['freecholesterol', 'cholesterolfree', 'nonesterifiedcholesterol', 'unesterifiedcholesterol'].includes(normalizedInputName);
      const isFreeEstradiol = ['freeestradiol', 'estradiolfree', 'freee2', 'estradiolfreefraction'].includes(normalizedInputName);
      const isFreePsa = ['freepsa', 'fpsa', 'freeprostatespecificantigen', 'freeprostateantigen'].includes(normalizedInputName);
      const isFreeTestosterone = ['freetestosterone', 'testosteronefree', 'freet', 'freeandrogentestosterone'].includes(normalizedInputName);
      const isGgt = ['ggt', 'ggtp', 'ggtgammagt', 'gammaglutamyltransferase', 'gammaglutamyltransferaseggt'].includes(normalizedInputName);
      const isGad65Antibody = ['gad65antibody', 'gad65ab', 'gad65', 'glutamicaciddecarboxylasegad65antibody', 'gadantibody'].includes(normalizedInputName);
      const isGh90MinutesAfterGlucose = ['gh90minutesafterglucose', 'growthhormone90minutesafterglucose', 'growthhormone90minafterglucose', 'gh90minafterglucose'].includes(normalizedInputName);
      const isGhFastingGlucose = ['ghfastingglucose', 'growthhormonefastingglucose', 'fastinggrowthhormoneglucose'].includes(normalizedInputName);
      const isGrowthHormone = ['ghgrowthhormone', 'growthhormone', 'humangrowthhormone', 'hgh', 'somatotropin'].includes(normalizedInputName);
      const isGlucoseToleranceTest = ['gttglucosetolerancetest', 'glucosetolerancetest', 'oralglucosetolerancetest', 'ogtt'].includes(normalizedInputName);
      const isRandomGlucose = ['glucoserandom', 'randomglucose', 'randombloodglucose'].includes(normalizedInputName);
      const isGastrinLevel = ['gastrinlevel', 'gastrin', 'serumgastrin', 'glucoserandom', 'randomglucose', 'randombloodglucose'].includes(normalizedInputName);
      const isFungusCulture = ['fungusculture', 'fungalculture', 'mycologicalculture'].includes(normalizedInputName);
      const isFungusCultureSensitivity = ['funguscultureandsensitivity', 'fungalcultureandsensitivity', 'fungusculturesensitivity', 'fungalculturesensitivity'].includes(normalizedInputName);
      const isFactorIiMutation = normalizedInputName === 'factoriimutation' || normalizedInputName === 'prothrombinmutation';
      const isFactorViiiImmunodepleted = ['factorviiimmunodepleted', 'factorviiiimmunodepleted', 'f8immunodepleted'].includes(normalizedInputName);
      const isAfbZiehlNeelsen = normalizedInputName === 'afbznstain'
        || normalizedInputName === 'afbziehlneelsenstain';
      const isCsfFluidAfbStain = normalizedInputName === 'csffluidforafbstain'
        || normalizedInputName === 'csffluidafbstain'
        || normalizedInputName === 'afbstaincsf'
        || normalizedInputName === 'csfafbstain'
        || normalizedInputName === 'cerebrospinalfluidafbstain';
      const isCsfFluidGramStain = normalizedInputName === 'csffluidforgramstain'
        || normalizedInputName === 'csffluidgramstain'
        || normalizedInputName === 'gramstaincsf'
        || normalizedInputName === 'csfgramstain'
        || normalizedInputName === 'cerebrospinalfluidgramstain';
      const isCsfFluidProtein = normalizedInputName === 'csffluidforprotein'
        || normalizedInputName === 'csffluidprotein'
        || normalizedInputName === 'proteincsf'
        || normalizedInputName === 'csfprotein'
        || normalizedInputName === 'cerebrospinalfluidprotein';
      const isCsfFluidSpecificGravity = normalizedInputName === 'csffluidforspecificgravity'
        || normalizedInputName === 'csffluidspecificgravity'
        || normalizedInputName === 'specificgravitycsf'
        || normalizedInputName === 'csfspecificgravity'
        || normalizedInputName === 'cerebrospinalfluidspecificgravity';
      const isCsfFluidGlucose = normalizedInputName === 'csffluidforsugar'
        || normalizedInputName === 'csffluidglucose'
        || normalizedInputName === 'glucosecsf'
        || normalizedInputName === 'csfglucose'
        || normalizedInputName === 'cerebrospinalfluidglucose';
      const isUrineCalcium24Hour = normalizedInputName === 'calcium24hrsurine'
        || normalizedInputName === 'calcium24hoururine'
        || normalizedInputName === 'calcium24hurine'
        || normalizedInputName === 'urinecalcium24hour'
        || normalizedInputName === '24hoururinecalcium';
      const isUrineCopper24Hour = normalizedInputName === 'coppe24hrsurine'
        || normalizedInputName === 'copper24hrsurine'
        || normalizedInputName === 'copper24hoursurine'
        || normalizedInputName === 'copper24hoururine'
        || normalizedInputName === 'urinecopper24hour';
      const isRandomUrineCopper = normalizedInputName === 'copperurine'
        || normalizedInputName === 'urinecopper'
        || normalizedInputName === 'randomurinecopper';
      const isEveningCortisol = normalizedInputName === 'cortisolevening'
        || normalizedInputName === 'eveningcortisol'
        || normalizedInputName === 'pmcortisol';
      const isMidnightCortisol = normalizedInputName === 'cortisolmidnight'
        || normalizedInputName === 'midnightcortisol'
        || normalizedInputName === 'latenightcortisol';
      const isMorningEveningCortisol = normalizedInputName === 'cortisolmorningevening'
        || normalizedInputName === 'morningeveningcortisol'
        || normalizedInputName === 'amandpmcortisol';
      const isMorningCortisol = normalizedInputName === 'cortisolmorning'
        || normalizedInputName === 'morningcortisol'
        || normalizedInputName === 'amcortisol';
      const isMorningEveningMidnightCortisol = normalizedInputName === 'cortisolmorningeveningmidnight'
        || normalizedInputName === 'morningeveningmidnightcortisol'
        || normalizedInputName === 'amandpmmidnightcortisol';
      const isCryoglobulinsScreening = normalizedInputName === 'cryoglobulinsscreeningtest'
        || normalizedInputName === 'cryoglobulinscreeningtest'
        || normalizedInputName === 'cryoglobulinscreen'
        || normalizedInputName === 'cryoglobulinscreening'
        || normalizedInputName === 'cryoglobulintest';
      const isGonorrhea = ['gonorrhea', 'gonorrhoea', 'gonorrheatest', 'gonorrhoeatest'].includes(normalizedInputName);
      const isHavTotal = ['havtotaliggigm', 'havtotal', 'hepatitisatotalantibody', 'hepatitisatotalantibodies', 'totalantihav'].includes(normalizedInputName);
      const isHbdh = ['hbdhldh1', 'hbdh', 'alphahydroxybutyratedehydrogenase', 'hydroxybutyratedehydrogenase', 'ldh1'].includes(normalizedInputName);
      const isHbsAgQuantitative = ['hbsagquantitative', 'quantitativehbsag', 'hepatitisbsurfaceantigenquantitative', 'hbsagquant'].includes(normalizedInputName);
      const isHepatitisBViralDnaQualitative = ['hepatitisbviraldnaqualitative', 'hbvdnaqualitative', 'hepatitisbdnaqualitative', 'hbvdnapcrqualitative'].includes(normalizedInputName);
      const isHepatitisBVirusTreatmentFollowUp = ['hepatitisbvirustreatmentfollowup', 'hepatitisbvirustreatmentfollow', 'hepatitisbtreatmentfollowup', 'hbvtreatmentfollowup', 'hbvfollowup'].includes(normalizedInputName);
      const isHepatitisProfile = ['hepatitisprofile', 'viralhepatitisprofile', 'hepatitisviralscreeningprofile'].includes(normalizedInputName);
      const isHsv2Igg = ['herpessimplexvirus2hsv2igg', 'hsv2igg', 'herpessimplex2igg', 'herpessimplexvirus2igg'].includes(normalizedInputName);
      const isHsv2Igm = ['herpessimplexvirus2hsv2igm', 'hsv2igm', 'herpessimplex2igm', 'herpessimplexvirus2igm'].includes(normalizedInputName);
      const isHsv1Igg = ['herpessimplexvirus1hsv1igg', 'hsv1igg', 'herpessimplex1igg', 'herpessimplexvirus1igg'].includes(normalizedInputName);
      const isHsv1Igm = ['herpessimplexvirus1hsv1igm', 'hsv1igm', 'herpessimplex1igm', 'herpessimplexvirus1igm'].includes(normalizedInputName);
      const isHcvTotalAntibody = ['hcvtotaligmigg', 'hcvtotalantibody', 'hepatitisctotalantibody', 'totalantihcv', 'antihcvtotaligmigg'].includes(normalizedInputName);
      const isHcvAntibodyIgg = ['hepatitiscvirushcvantibodyigg', 'hcvantibodyigg', 'hepatitiscantibodyigg', 'antihcvigg'].includes(normalizedInputName);
      const isHcvAntibodyIgm = ['hepatitiscvirushcvantibodyigm', 'hcvantibodyigm', 'hepatitiscantibodyigm', 'antihcvigm'].includes(normalizedInputName);
      const isHepatitisCRnaPcrQuantitative = ['hepatitiscrnapcrquantitative', 'hcvrnapcrquantitative', 'hcvrnaquantitative', 'hcvquantitativepcr'].includes(normalizedInputName);
      const isHbDlcEsr = ['hddcesr', 'hbdcesr', 'hbdlcesr', 'hemoglobindifferentialcountesr'].includes(normalizedInputName);
      const isHbTlcDlcEsrProfile = ['hbtltcdlcesrprofile', 'hbtlctcwbcdlcesrprofile', 'hbtlcdlcesr'].includes(normalizedInputName);
      const isHdlLdlRatio = ['hdlldl', 'hdlldlratio', 'ldlhdlratio'].includes(normalizedInputName);
      const isHdvAntibody = ['hdvantibody', 'antihdv', 'hepatitisdvirusantibody', 'antihdvantibody'].includes(normalizedInputName);
      const isHevTotalAntibody = ['hevtotaliggigm', 'hevtotal', 'hepatitisevirustotalantibody', 'totalantihev'].includes(normalizedInputName);
      const isHevAntibodyIgg = ['hepatitisevirushevantibodyigg', 'hevantibodyigg', 'hepatitiseantibodyigg', 'antihevigg'].includes(normalizedInputName);
      const isHevAntibodyIgm = ['hepatitisevirushevantibodyigm', 'hevantibodyigm', 'hepatitiseantibodyigm', 'antihevigm'].includes(normalizedInputName);
      const isHivIAndIi = normalizedInputName === 'hiviii';
      const isHlaB27 = ['hlab27', 'hlab27antigen'].includes(normalizedInputName);
      const isHangingDropPreparation = normalizedInputName === 'hangingdroppreparation';
      const isUrethralDischargeGramStain = ['gramstainofurethraldischarge', 'urethraldischargegramstain', 'gramstainurethraldischarge'].includes(normalizedInputName);
      const isGeneralGramStain = ['gramstainofsmears', 'gramstainsmears', 'gramstainsmear', 'gramsmearexamination'].includes(normalizedInputName);
      const isGeneralHealthCheckUp = ['generalhealthcheckup', 'generalhealthcheck', 'healthcheckupgeneral', 'healthcheckup'].includes(normalizedInputName);
      const isGndCulture = isGonorrhea || isHavTotal || isHbdh || isHbsAgQuantitative || isHepatitisBViralDnaQualitative || isHcvTotalAntibody || isHcvAntibodyIgg || isHcvAntibodyIgm || isHepatitisCRnaPcrQuantitative || isUrethralDischargeGramStain || isGeneralGramStain || isGeneralHealthCheckUp
        || normalizedInputName === 'cultureforgnd'
        || normalizedInputName === 'cultureforgndiplococci'
        || normalizedInputName === 'gndculture'
        || normalizedInputName === 'gonococcalculture'
        || normalizedInputName === 'neisseriagonorrhoeaeculture';
      const isCysticFibrosisGeneMutation = normalizedInputName === 'cysticfibrosiscfgenemutation'
        || normalizedInputName === 'cysticfibrosisgenemutation'
        || normalizedInputName === 'cftrgenemutation'
        || normalizedInputName === 'cftrmutationanalysis'
        || normalizedInputName === 'cysticfibrosismutationanalysis';
      const isCapillaryFragility = normalizedInputName === 'capillaryfragilitytest'
        || normalizedInputName === 'capillaryfragility'
        || normalizedInputName === 'tourniquettest';
      const isCardiacProfile = normalizedInputName === 'cardiacprofile'
        || normalizedInputName === 'cardiacmarkerprofile';
      const isColorectalCancerMonitorProfile = normalizedInputName === 'colorectalcancermonitorprofile'
        || normalizedInputName === 'colorectalcancermonitor'
        || normalizedInputName === 'coloncancermonitorprofile';
      const isCeruloplasmin = normalizedInputName === 'ceruloplasmin'
        || normalizedInputName === 'ceruloplasminserum';
      const isCervicalPapSmear = normalizedInputName === 'cervicalsmearforpapstain'
        || normalizedInputName === 'cervicalsmearpapstain'
        || normalizedInputName === 'cervicalpapsmear'
        || normalizedInputName === 'cervicalcytologypapsmear';
      const isCervicalSwabGramStain = normalizedInputName === 'cervicalswabgramstain'
        || normalizedInputName === 'cervicalgramstain'
        || normalizedInputName === 'endocervicalswabgramstain';
      const isCervicalSwabAfbStain = normalizedInputName === 'cervicalswabafbstain'
        || normalizedInputName === 'cervicalafbsmear'
        || normalizedInputName === 'endocervicalswabafbstain';
      const isChikungunyaIgg = normalizedInputName === 'chikungunyaigg'
        || normalizedInputName === 'chikungunyavirusigg'
        || normalizedInputName === 'antichikungunyaigg';
      const isChikungunyaIgm = normalizedInputName === 'chikungunyaigm'
        || normalizedInputName === 'chikungunyavirusigm'
        || normalizedInputName === 'antichikungunyaigm';
      const isChlamydiaAntibodyIggIgm = normalizedInputName === 'chlamydiaantibodyiggigm'
        || normalizedInputName === 'chlamydiaiggigm'
        || normalizedInputName === 'chlamydiatrachomatisiggigm'
        || normalizedInputName === 'chlamydiatrachomatisantibodyiggigm';
      const isChlamydiaAntigen = normalizedInputName === 'chlamydiaantigen'
        || normalizedInputName === 'chlamydiatrachomatisantigen'
        || normalizedInputName === 'ctantigen';
      const isRandomUrineChloride = normalizedInputName === 'chloriderandom'
        || normalizedInputName === 'randomurinechloride'
        || normalizedInputName === 'urinechloriderandom';
      const isSerumChloride = normalizedInputName === 'chlorideserum'
        || normalizedInputName === 'serumchloride'
        || normalizedInputName === 'plasmachloride';
      const is24HourUrineChloride = normalizedInputName === 'chloride24hrsurine'
        || normalizedInputName === 'chloride24hoururine'
        || normalizedInputName === '24hoururinechloride'
        || normalizedInputName === 'urinechloride24hour';
      const isCDiffToxin = normalizedInputName === 'clostridioidesdifficiletoxin' || normalizedInputName === 'clostridiumdifficiletoxin' || normalizedInputName === 'cdifftoxin';
      const isTotalCholesterol = normalizedInputName === 'cholesteroltotal'
        || normalizedInputName === 'totalcholesterol'
        || normalizedInputName === 'cholesterol'
        || normalizedInputName === 'cholesterolserum';
      const isAlbertStainKlb = normalizedInputName === 'albertstainofsmearsforklb'
        || normalizedInputName === 'albertstainofsmearforklb'
        || normalizedInputName === 'albertstainforklb';
      const isBaccalSmearBrrBody = normalizedInputName === 'baccalsmearforbrrbody'
        || normalizedInputName === 'buccalsmearforbarrbody'
        || normalizedInputName === 'buccalsmearforsexchromation'
        || normalizedInputName === 'buccalsmearforsexchromatin'
        || normalizedInputName.startsWith('buccalsmearforsexchromationb');
      const isAutoimmuneProfile = normalizedInputName === 'autoimmuneprofile';
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
      const isAntenatalProfile = normalizedInputName === 'antenatalprofile'
        || normalizedInputName === 'antenatalbookingprofile'
        || normalizedInputName === 'antenatalscreeningprofile';
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
      const isAnticardiolipinIga = normalizedInputName === 'anticardiolipinantibodyiga'
        || normalizedInputName === 'anticardiolipiniga'
        || normalizedInputName === 'cardiolipinantibodyiga'
        || normalizedInputName === 'phospholipidcardiolipinantibodiesiga';
      const isAnticardiolipinIgaIgm = normalizedInputName === 'anticardiolipinantibodyigaigm'
        || normalizedInputName === 'anticardiolipinigaigm'
        || normalizedInputName === 'cardiolipinantibodyigaigm'
        || normalizedInputName === 'phospholipidcardiolipinantibodiesigaigm';
      const isAnticardiolipinIgaIgg = normalizedInputName === 'anticardiolipinantibodyigaigg'
        || normalizedInputName === 'anticardiolipinigaigg'
        || normalizedInputName === 'cardiolipinantibodyigaigg'
        || normalizedInputName === 'phospholipidcardiolipinantibodiesigaigg';
      const isAnticardiolipinIggIgm = normalizedInputName === 'anticardiolipinantibodyiggigm'
        || normalizedInputName === 'anticardiolipiniggigm'
        || normalizedInputName === 'cardiolipinantibodyiggigm'
        || normalizedInputName === 'phospholipidcardiolipinantibodiesiggigm';
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
      const isHistologyBiopsyPerSection = normalizedInputName === 'histologybiopsypersection';
      const isHomocystineBlood = ['homocystineblood', 'homocysteinblood', 'homocysteineblood'].includes(normalizedInputName);
      const isHomocystineUrine = ['homocystineurine', 'homocysteinurine', 'homocysteineurine'].includes(normalizedInputName);
      const isHypertensionProfile = ['hypertensionprofile', 'hypertensionworkupprofile', 'hypertensiveprofile'].includes(normalizedInputName);
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
      const isCsfFluidChloride = normalizedInputName === 'csffluidforchloride'
        || normalizedInputName === 'csffluidchloride'
        || normalizedInputName === 'chloridecsf'
        || normalizedInputName === 'csfchloride'
        || normalizedInputName === 'cerebrospinalfluidchloride';
      const isBodyFluidBiochemistry = normalizedInputName === 'bodyfluidsbiochemistry'
        || normalizedInputName === 'bodyfluidbiochemistry';
      const isBodyFluidSpecificGravity = normalizedInputName === 'bodyfluidsforspecificgravity'
        || normalizedInputName === 'bodyfluidforspecificgravity'
        || normalizedInputName === 'bodyfluidspecificgravity';
      const isComplementC3 = normalizedInputName === 'c3complement3'
        || normalizedInputName === 'c3complement'
        || normalizedInputName === 'complement3'
        || normalizedInputName === 'complementc3';
      const isComplementC4 = normalizedInputName === 'c4complement4'
        || normalizedInputName === 'c4complement'
        || normalizedInputName === 'complement4'
        || normalizedInputName === 'complementc4';
      const isCancaAntiPr3 = normalizedInputName === 'cancaantipr3'
        || normalizedInputName === 'canca'
        || normalizedInputName === 'antipr3'
        || normalizedInputName === 'proteinase3antibody'
        || normalizedInputName === 'proteinase3antibodies';
      const isCreatinineClearance = normalizedInputName === 'cctcreatinineclearancetest'
        || normalizedInputName === 'creatinineclearancetest'
        || normalizedInputName === 'creatinineclearance'
        || normalizedInputName === 'cct';
      const isCd3Lymphocyte = normalizedInputName === 'cd3lymphocyte'
        || normalizedInputName === 'cd3tlymphocyte'
        || normalizedInputName === 'cd3tcell'
        || normalizedInputName === 'cd3tcellcount';
      const isCd4Lymphocyte = normalizedInputName === 'cd4lymphocyte'
        || normalizedInputName === 'cd4tlymphocyte'
        || normalizedInputName === 'cd4tcell'
        || normalizedInputName === 'cd4tcellcount';
      const isCd8Lymphocyte = normalizedInputName === 'cd8lymphocyte'
        || normalizedInputName === 'cd8tlymphocyte'
        || normalizedInputName === 'cd8tcell'
        || normalizedInputName === 'cd8tcellcount';
      const isCea = normalizedInputName === 'ceacarcinoembryonicantigen'
        || normalizedInputName === 'carcinoembryonicantigen'
        || normalizedInputName === 'cea';
      const isCft = normalizedInputName === 'cftcompletefixsationtest'
        || normalizedInputName === 'cftcompletefixationtest'
        || normalizedInputName === 'complementfixationtest'
        || normalizedInputName === 'complimentfixsationtest'
        || normalizedInputName === 'cft';
      const isBilateralConjunctivalSwab = normalizedInputName === 'conjswabbotheye'
        || normalizedInputName === 'conjunctivalswabbotheye'
        || normalizedInputName === 'bilateralconjunctivalswab';
      const isRightConjunctivalSwabCulture = normalizedInputName === 'conjswabcsrteye'
        || normalizedInputName === 'conjunctivalswabcultureandsensitivityrighteye'
        || normalizedInputName === 'rightconjunctivalswabcultureandsensitivity';
      const isConjunctivalSwabCulture = normalizedInputName === 'conjunctivalswabculture'
        || normalizedInputName === 'conjswabculture'
        || normalizedInputName === 'conjunctivalswabculturesensitivity';
      const isCkMb = normalizedInputName === 'ckmb'
        || normalizedInputName === 'creatinekinasemb';
      const isCpk = normalizedInputName === 'cpk'
        || normalizedInputName === 'cpkcreatinephosphokinase'
        || normalizedInputName === 'creatinephosphokinase';
      const isCpkWithCkMb = normalizedInputName === 'cpkwithckmb'
        || normalizedInputName === 'cpkckmb'
        || normalizedInputName === 'creatinephosphokinasewithckmb';
      const isCmvIgmIgg = normalizedInputName === 'cmvcytomegalovirusigmigg'
        || normalizedInputName === 'cytomegaloviruscmvigmigg'
        || normalizedInputName === 'cytomegaloviruscmviggigm'
        || normalizedInputName === 'cytomegalovirusigmigg'
        || normalizedInputName === 'cmviggigm';
      const isCmvIgg = normalizedInputName === 'cytomegaloviruscmvigg'
        || normalizedInputName === 'cytomegalovirusigg'
        || normalizedInputName === 'cmvigg'
        || normalizedInputName === 'cmvantibodyigg';
      const isBronchialWashingCultureSensitivity = normalizedInputName === 'bronchialwashingforcs'
        || normalizedInputName === 'bronchialwashingcultureandsensitivity'
        || normalizedInputName === 'bronchialwashingculturesensitivity';
      const isBoneMarrowAspirationCytology = normalizedInputName === 'bonemarrowaspirationcytology';
      const isBoneMarrowCytology = normalizedInputName === 'bonemarrowcytology';
      const isAntiInsulinAntibody = normalizedInputName === 'antiinsulinantibody'
        || normalizedInputName === 'insulinantibody'
        || normalizedInputName === 'insulinantibodies'
        || normalizedInputName === 'insulinautoantibodyiaa';
      const isAntiLeptospiraAntibody = normalizedInputName === 'antileptospiraantibody'
        || normalizedInputName === 'leptospiraantibody';
      const isAntiMicrosomalAntibody = normalizedInputName === 'antimicrosomalantibody';
      const isAntiDsDnaAntibody = normalizedInputName === 'antidsdnaantibody';
      const isAntiSsDnaAntibody = normalizedInputName === 'antissdnaantibody';
      const isAntiHistoneAntibody = normalizedInputName === 'antihistoneantibody';
      const isAntiRibosomalPAntibody = normalizedInputName === 'antiribosomalpantibody';
      const isAntiCcpAb = normalizedInputName === 'anticcpab';
      const isAntiSpermAntibody = normalizedInputName === 'antispermantibody';
      const isApolipoproteinA1 = normalizedInputName === 'apolipoproteina1';
      const isUrineArsenic = normalizedInputName === 'arsenicurine';
      const isArthritisProfile = normalizedInputName === 'arthritisprofile';
      const isAsciticFluidGramStain = normalizedInputName === 'asciticfluidsgramstain';
      const isAsciticFluidTotalProtein = normalizedInputName === 'asciticfluidforprotein';
      const isBactecAerobicCulture = normalizedInputName === 'bacteccultureforaerobicbacteria';
      const isBactecAnaerobicCulture = normalizedInputName === 'bacteccultureforanaerobicbacteria';
      const isBronchialBrushingPap = normalizedInputName === 'bronchialbrushingforpap';
      const isBronchialLavagePap = normalizedInputName === 'bronchiallavageforpap';
      const isBronchialWashingPap = normalizedInputName === 'bronchialwashingforpap';
      const isTimedUrineAmylase = normalizedInputName === 'amylase24hrsurine'
        || normalizedInputName === 'amylase24hoururine'
        || normalizedInputName === 'amylase24hurine'
        || normalizedInputName === '24hoururineamylase';
      if (isHbDlcEsr) {
        assert.match(newHtml, /Haemoglobin, Differential Leucocyte Count \(DLC\) & ESR/);
        assert.match(newHtml, /data-report-content="hb-dlc-esr"/);
        assert.match(newHtml, /DIFFERENTIAL WBC COUNT/);
        assert.match(newHtml, /<div class="cbc-investigation">ESR<\/div>/);
        continue;
      }
      if (isHbTlcDlcEsrProfile) {
        assert.match(newHtml, /Hb \+ TLC\/TC\/WBC \+ DLC \+ ESR Profile/);
        assert.match(newHtml, /data-report-content="hb-tlc-dlc-esr-profile"/);
        assert.match(newHtml, /DIFFERENTIAL WBC COUNT/);
        assert.match(newHtml, /<div class="cbc-investigation">ESR<\/div>/);
        continue;
      }
      if (isHdlLdlRatio) {
        assert.match(newHtml, /HDL : LDL RATIO/);
        assert.match(newHtml, /data-report-content="hdl-ldl-ratio"/);
        assert.match(newHtml, /HDL cholesterol/);
        assert.match(newHtml, /LDL cholesterol/);
        continue;
      }
      if (isHdvAntibody) {
        assert.match(newHtml, /HEPATITIS D VIRUS \(HDV\) ANTIBODY/);
        assert.match(newHtml, /data-report-content="hdv-antibody"/);
        assert.match(newHtml, /does not by itself establish active viraemic infection/);
        continue;
      }
      if (isHepatitisBVirusTreatmentFollowUp) {
        assert.match(newHtml, /HEPATITIS B VIRUS \(HBV\) TREATMENT FOLLOW-UP/);
        assert.match(newHtml, /data-report-content="hbv-treatment-follow-up"/);
        assert.match(newHtml, /below the lower quantification limit is not the same as an undetected result/);
        continue;
      }
      if (isHepatitisProfile) {
        assert.match(newHtml, /HEPATITIS PROFILE/);
        assert.match(newHtml, /data-report-content="hepatitis-profile"/);
        assert.match(newHtml, /a blank or not-performed component must not be interpreted as a negative result/);
        continue;
      }
      if (isHsv2Igg) {
        assert.match(newHtml, /HERPES SIMPLEX VIRUS TYPE 2 \(HSV-2\) IgG/);
        assert.match(newHtml, /data-report-content="hsv2-igg"/);
        assert.match(newHtml, /does not establish the timing of infection, identify an active lesion, or prove the site of infection/);
        continue;
      }
      if (isHsv2Igm) {
        assert.match(newHtml, /HERPES SIMPLEX VIRUS TYPE 2 \(HSV-2\) IgM/);
        assert.match(newHtml, /data-report-content="hsv2-igm"/);
        assert.match(newHtml, /not type-specific and a reactive HSV IgM result must not be used alone to diagnose a new HSV-2 infection/);
        continue;
      }
      if (isHsv1Igg) {
        assert.match(newHtml, /HERPES SIMPLEX VIRUS TYPE 1 \(HSV-1\) IgG/);
        assert.match(newHtml, /data-report-content="hsv1-igg"/);
        assert.match(newHtml, /does not establish the timing of infection, identify an active lesion, or determine whether infection is oral or genital/);
        continue;
      }
      if (isHsv1Igm) {
        assert.match(newHtml, /HERPES SIMPLEX VIRUS TYPE 1 \(HSV-1\) IgM/);
        assert.match(newHtml, /data-report-content="hsv1-igm"/);
        assert.match(newHtml, /not type-specific and a reactive HSV IgM result must not be used alone to diagnose a new HSV-1 infection/);
        continue;
      }
      if (isHistologyBiopsyPerSection) {
        assert.match(newHtml, /HISTOLOGY BIOPSY - PER SECTION/);
        assert.match(newHtml, /histopathology-report-body/);
        continue;
      }
      if (isHomocystineBlood) {
        assert.match(newHtml, /HOMOCYSTINE - BLOOD/);
        assert.match(newHtml, /data-report-content="homocystine-blood"/);
        continue;
      }
      if (isHomocystineUrine) {
        assert.match(newHtml, /HOMOCYSTINE - URINE/);
        assert.match(newHtml, /data-report-content="homocystine-urine"/);
        continue;
      }
      if (isHypertensionProfile) {
        assert.match(newHtml, /HYPERTENSION PROFILE/);
        assert.match(newHtml, /data-report-content="hypertension-profile"/);
        continue;
      }
      if (isHevAntibodyIgm) {
        assert.match(newHtml, /HEPATITIS E VIRUS \(HEV\) ANTIBODY IgM/);
        assert.match(newHtml, /data-report-content="hev-antibody-igm"/);
        assert.match(newHtml, /must not alone confirm acute infection/);
        continue;
      }
      if (isHevAntibodyIgg) {
        assert.match(newHtml, /HEPATITIS E VIRUS \(HEV\) ANTIBODY IgG/);
        assert.match(newHtml, /data-report-content="hev-antibody-igg"/);
        assert.match(newHtml, /must not alone establish current or recent hepatitis E infection/);
        continue;
      }
      if (isHevTotalAntibody) {
        assert.match(newHtml, /HEPATITIS E VIRUS \(HEV\) TOTAL ANTIBODY \(IgG \+ IgM\)/);
        assert.match(newHtml, /data-report-content="hev-total-antibody"/);
        assert.match(newHtml, /should not be used alone to determine acute HEV infection/);
        continue;
      }
      if (isHivIAndIi) {
        assert.match(newHtml, /HIV I &amp; II SCREENING/);
        assert.match(newHtml, /data-report-content="hiv-i-ii"/);
        assert.match(newHtml, /reactive screening result is preliminary/);
        continue;
      }
      if (isHlaB27) {
        assert.match(newHtml, /<div class="test-title">HLA-B27<\/div>/);
        assert.match(newHtml, /data-report-content="hla-b27"/);
        assert.match(newHtml, /does not establish a diagnosis by itself/);
        continue;
      }
      if (isHangingDropPreparation) {
        assert.match(newHtml, /HANGING DROP PREPARATION/);
        assert.match(newHtml, /data-report-content="hanging-drop-preparation"/);
        assert.match(newHtml, /does not identify an organism or confirm an infectious diagnosis/);
        continue;
      }
      if (isHbElectrophoresis) {
        assert.match(newHtml, /HEMOGLOBIN ELECTROPHORESIS/);
        assert.match(newHtml, /data-report-content="hb-electrophoresis"/);
        assert.match(newHtml, /Hemoglobin A2 \(HbA2\)/);
        continue;
      }
      if (isAsciticFluidTotalProtein) {
        assert.match(newHtml, /ASCITIC FLUID TOTAL PROTEIN/);
        assert.match(newHtml, /data-report-content="ascitic-fluid-total-protein"/);
        continue;
      }
      if (isBactecAerobicCulture) {
        assert.match(newHtml, /BACTEC AEROBIC CULTURE/);
        assert.match(newHtml, /data-report-content="bactec-aerobic-culture"/);
        continue;
      }
      if (isBactecAnaerobicCulture) {
        assert.match(newHtml, /BACTEC ANAEROBIC CULTURE/);
        assert.match(newHtml, /data-report-content="bactec-anaerobic-culture"/);
        continue;
      }
      if ((isBronchialBrushingPap || isBronchialLavagePap || isBronchialWashingPap) && !String(input.report_body || '').trim()) {
        const title = isBronchialBrushingPap ? /BRONCHIAL BRUSHING - PAP CYTOLOGY/
          : isBronchialLavagePap ? /BRONCHIAL LAVAGE - PAP CYTOLOGY/
            : /BRONCHIAL WASHING - PAP CYTOLOGY/;
        assert.match(newHtml, title);
        assert.match(newHtml, /class="bronchial-pap-cytology-report"/);
        assert.match(newHtml, /Specimen Adequacy/);
        assert.match(newHtml, /Diagnostic Category/);
        continue;
      }
if (isActh || isAda || isDnph || isDiabeticProfile || isExtendedDiabeticProfile || isDiabeticRenalProfile || isEarSwabGramStain || isEarSwabAfbStain || isFshPrl || isFshLhPrl || isFemaleInfertilityProfile || isFernTest || isWuchereriaBancroftiAntigen || isFilariaAntigen || isFluidAspirationCytology || isFoetalHaemoglobinByHplc || isFoetalHaemoglobin || isFreeBetaHcg || isFreeCholesterol || isFreeEstradiol || isFreePsa || isFreeTestosterone || isGgt || isGad65Antibody || isGh90MinutesAfterGlucose || isGhFastingGlucose || isGrowthHormone || isGlucoseToleranceTest || isGastrinLevel || isFungusCulture || isFungusCultureSensitivity || isFactorIiMutation || isFactorViiiImmunodepleted || isAfbZiehlNeelsen || isCsfFluidAfbStain || isCsfFluidGramStain || isCsfFluidProtein || isCsfFluidSpecificGravity || isCsfFluidGlucose || isUrineCalcium24Hour || isUrineCopper24Hour || isRandomUrineCopper || isEveningCortisol || isMidnightCortisol || isMorningEveningCortisol || isMorningCortisol || isMorningEveningMidnightCortisol || isCryoglobulinsScreening || isGndCulture || isCysticFibrosisGeneMutation || isCapillaryFragility || isCardiacProfile || isColorectalCancerMonitorProfile || isCeruloplasmin || isCervicalPapSmear || isCervicalSwabGramStain || isCervicalSwabAfbStain || isCDiffToxin || isTotalCholesterol || is24HourUrineChloride || isSerumChloride || isRandomUrineChloride || isChlamydiaAntigen || isChlamydiaAntibodyIggIgm || isChikungunyaIgm || isChikungunyaIgg || isAlbertStainKlb || isBaccalSmearBrrBody || isAutoimmuneProfile || isAgRatio || isAnfQualitative || isProstaticAcidPhosphatase || isTotalAcidPhosphatase || isUrineAlcohol || isAldehydeTest || isAldosterone || isBloodAllergy || isDrugAllergy || isRandomUrineAlphaAmylase || isTimedUrineAmylase || isAmmonia || isAndrogenPanel || isAndrostenedione || isComprehensiveAnemia || isAnemiaScreening || isAntenatalProfile || isAntiTpo || isAntiTg || isAntiInsulinAntibody || isAntiLeptospiraAntibody || isAntiMicrosomalAntibody || isAntiDsDnaAntibody || isAntiSsDnaAntibody || isAntiHistoneAntibody || isAntiRibosomalPAntibody || isAntiCcpAb || isAntiSpermAntibody || isApolipoproteinA1 || isUrineArsenic || isArthritisProfile || isAsciticFluidGramStain || isAnticardiolipinIggIgm || isAnticardiolipinIgaIgg || isAnticardiolipinIgaIgm || isAnticardiolipinIga || isAnticardiolipinIgg || isAnticardiolipinIgm || isApolipoproteinB || isAsciticFluidAnalysis || isSerumBicarbonate || isBilirubinFractionation || isMediumSectionBiopsy || isSmallSectionBiopsy || isBloodCultureSensitivity || isBodyFluidCultureSensitivity || isBodyFluidTotalProtein || isCsfFluidChloride || isBodyFluidChloride || isBodyFluidBiochemistry || isBodyFluidSpecificGravity || isComplementC3 || isComplementC4 || isCancaAntiPr3 || isCreatinineClearance || isCd3Lymphocyte || isCd4Lymphocyte || isCd8Lymphocyte || isCea || isCft || isBilateralConjunctivalSwab || isRightConjunctivalSwabCulture || isConjunctivalSwabCulture || isCkMb || isCpk || isCpkWithCkMb || isCmvIgmIgg || isCmvIgg || isBronchialWashingCultureSensitivity || isBoneMarrowAspirationCytology || isBoneMarrowCytology) {
        if (isDnph) {
          assert.match(newHtml, /2,4-DINITROPHENYLHYDRAZINE \(DNPH\) URINE SCREEN/);
          assert.match(newHtml, /data-report-content="dnph-urine-screen"/);
          assert.match(newHtml, /does not identify a specific compound or establish a diagnosis by itself/);
          continue;
        }
        if (isDiabeticProfile) {
          assert.match(newHtml, /DIABETIC PROFILE/);
          assert.match(newHtml, /data-report-content="diabetic-profile"/);
          assert.match(newHtml, /Fasting Plasma Glucose/);
          continue;
        }
        if (isExtendedDiabeticProfile) {
          assert.match(newHtml, /DIABETIC PROFILE - EXTENDED/);
          assert.match(newHtml, /data-report-content="diabetic-profile-extended"/);
          assert.match(newHtml, /LIPID ASSESSMENT/);
          continue;
        }
        if (isDiabeticRenalProfile) {
          assert.match(newHtml, /DIABETIC RENAL PROFILE/);
          assert.match(newHtml, /data-report-content="diabetic-renal-profile"/);
          assert.match(newHtml, /URINE ALBUMIN ASSESSMENT/);
          continue;
        }
        if (isEarSwabGramStain) {
          assert.match(newHtml, /EAR SWAB - GRAM STAIN/);
          assert.match(newHtml, /data-report-content="ear-swab-gram-stain"/);
          continue;
        }
        if (isEarSwabAfbStain) {
          assert.match(newHtml, /EAR SWAB - AFB STAIN/);
          assert.match(newHtml, /data-report-content="ear-swab-afb-stain"/);
          continue;
        }
        if (isFshPrl) {
          assert.match(newHtml, /FSH & PROLACTIN \(PRL\)/);
          assert.match(newHtml, /data-report-content="fsh-prl"/);
          continue;
        }
        if (isFshLhPrl) {
          assert.match(newHtml, /FSH, LH & PROLACTIN \(PRL\)/);
          assert.match(newHtml, /Luteinizing Hormone \(LH\), Serum/);
          continue;
        }
        if (isFactorIiMutation) {
          assert.match(newHtml, /FACTOR II \(PROTHROMBIN\) MUTATION/);
          assert.match(newHtml, /data-report-content="factor-ii-mutation"/);
          continue;
        }
        if (isFactorViiiImmunodepleted) {
          assert.match(newHtml, /FACTOR VIII IMMUNODEPLETED/);
          assert.match(newHtml, /data-report-content="factor-viii-immunodepleted"/);
          continue;
        }
        if (isFemaleInfertilityProfile) {
          assert.match(newHtml, /FEMALE INFERTILITY PROFILE/);
          assert.match(newHtml, /data-report-content="female-infertility-profile"/);
          assert.match(newHtml, /OVARIAN \/ OVULATORY ASSESSMENT/);
          continue;
        }
        if (isFernTest) {
          assert.match(newHtml, /FERN TEST/);
          assert.match(newHtml, /data-report-content="fern-test"/);
          assert.match(newHtml, /CERVICAL MUCUS FERN TEST/);
          continue;
        }
        if (isWuchereriaBancroftiAntigen) {
          assert.match(newHtml, /WUCHERERIA BANCROFTI ANTIGEN/);
          assert.match(newHtml, /data-report-content="wuchereria-bancrofti-antigen"/);
          continue;
        }
        if (isFilariaAntigen) {
          assert.match(newHtml, /FILARIA ANTIGEN/);
          assert.match(newHtml, /data-report-content="filaria-antigen"/);
          continue;
        }
        if (isFluidAspirationCytology) {
          assert.match(newHtml, /FLUID ASPIRATION &amp; CYTOLOGY/);
          assert.match(newHtml, /data-report-content="fluid-aspiration-cytology"/);
          continue;
        }
        if (isFoetalHaemoglobinByHplc) {
          assert.match(newHtml, /FOETAL HAEMOGLOBIN \(HbF\) BY HPLC/);
          assert.match(newHtml, /data-report-content="foetal-haemoglobin-hplc"/);
          assert.match(newHtml, /HPLC hemoglobin fraction analysis/);
          continue;
        }
        if (isFoetalHaemoglobin) {
          assert.match(newHtml, /FOETAL HAEMOGLOBIN \(HbF\)/);
          assert.match(newHtml, /data-report-content="foetal-haemoglobin"/);
          assert.match(newHtml, /FOETAL HAEMOGLOBIN \(HbF\) QUANTITATION/);
          continue;
        }
        if (isFreeBetaHcg) {
          assert.match(newHtml, /FREE BETA hCG/);
          assert.match(newHtml, /data-report-content="free-beta-hcg"/);
          assert.match(newHtml, /Maternal serum screening marker when clinically requested/);
          continue;
        }
        if (isFreeCholesterol) {
          assert.match(newHtml, /FREE CHOLESTEROL \(NON-ESTERIFIED\)/);
          assert.match(newHtml, /data-report-content="free-cholesterol"/);
          assert.match(newHtml, /Fraction-specific cholesterol measurement/);
          continue;
        }
        if (isFreeEstradiol) {
          assert.match(newHtml, /FREE ESTRADIOL/);
          assert.match(newHtml, /data-report-content="free-estradiol"/);
          assert.match(newHtml, /Free-fraction estradiol measurement/);
          continue;
        }
        if (isFreePsa) {
          assert.match(newHtml, /FREE PROSTATE-SPECIFIC ANTIGEN \(FREE PSA\)/);
          assert.match(newHtml, /data-report-content="free-psa"/);
          assert.match(newHtml, /Free and total PSA comparison when both are measured/);
          continue;
        }
        if (isFreeTestosterone) {
          assert.match(newHtml, /FREE TESTOSTERONE/);
          assert.match(newHtml, /data-report-content="free-testosterone"/);
          assert.match(newHtml, /Free testosterone measurement or calculation, as stated/);
          continue;
        }
        if (isGgt) {
          assert.match(newHtml, /GAMMA GLUTAMYL TRANSFERASE \(GGT\)/);
          assert.match(newHtml, /data-report-content="ggt"/);
          assert.match(newHtml, /Medication exposure and recent alcohol intake can affect GGT activity/);
          continue;
        }
        if (isGad65Antibody) {
          assert.match(newHtml, /GAD65 ANTIBODY/);
          assert.match(newHtml, /data-report-content="gad65-antibody"/);
          assert.match(newHtml, /GLUTAMIC ACID DECARBOXYLASE 65 \(GAD65\) ANTIBODY/);
          continue;
        }
        if (isGh90MinutesAfterGlucose) {
          assert.match(newHtml, /GROWTH HORMONE \(GH\) - 90 MINUTES AFTER GLUCOSE/);
          assert.match(newHtml, /data-report-content="gh-90-glucose"/);
          assert.match(newHtml, /Timed serum specimen from the documented glucose-suppression protocol/);
          continue;
        }
        if (isGhFastingGlucose) {
          assert.match(newHtml, /GROWTH HORMONE \(GH\) WITH FASTING GLUCOSE/);
          assert.match(newHtml, /data-report-content="gh-fasting-glucose"/);
          assert.match(newHtml, /Fasting glucose and fasting GH are separate measurements/);
          continue;
        }
        if (isGrowthHormone) {
          assert.match(newHtml, /GROWTH HORMONE \(GH\)/);
          assert.match(newHtml, /data-report-content="growth-hormone"/);
          assert.match(newHtml, /GH secretion is pulsatile/);
          continue;
        }
        if (isGlucoseToleranceTest) {
          assert.match(newHtml, /GLUCOSE TOLERANCE TEST \(GTT\)/);
          assert.match(newHtml, /data-report-content="glucose-tolerance-test"/);
          assert.match(newHtml, /Only timepoints actually collected should be reported/);
          continue;
        }
        if (isGastrinLevel) {
          if (isRandomGlucose) {
            assert.match(newHtml, /RANDOM PLASMA GLUCOSE/);
            assert.match(newHtml, /data-report-content="random-glucose"/);
            assert.match(newHtml, /An isolated random glucose result does not establish diabetes/);
            continue;
          }
          assert.match(newHtml, /GASTRIN, SERUM/);
          assert.match(newHtml, /data-report-content="gastrin-level"/);
          assert.match(newHtml, /proton-pump inhibitors, can increase serum gastrin/);
          continue;
        }
        if (isFungusCulture) {
          assert.match(newHtml, /FUNGUS CULTURE/);
          assert.match(newHtml, /data-report-content="fungus-culture"/);
          assert.match(newHtml, /Site-specific mycology culture/);
          continue;
        }
        if (isFungusCultureSensitivity) {
          assert.match(newHtml, /FUNGUS CULTURE &amp; SENSITIVITY/);
          assert.match(newHtml, /data-report-content="fungus-culture-sensitivity"/);
          assert.match(newHtml, /Site-specific mycology culture and susceptibility, if performed/);
          continue;
        }
        if (isUrineCalcium24Hour) {
          assert.match(newHtml, /CALCIUM, 24-HOUR URINE/);
          assert.match(newHtml, /TIMED URINE COLLECTION/);
          assert.match(newHtml, /reference interval applies only to a complete timed collection/);
          continue;
        }
        if (isUrineCopper24Hour) {
          assert.match(newHtml, /COPPER, 24-HOUR URINE/);
          assert.match(newHtml, /data-report-content="urine-copper-24-hour"/);
          continue;
        }
        if (isRandomUrineCopper) {
          assert.match(newHtml, /COPPER, RANDOM URINE/);
          assert.match(newHtml, /data-report-content="random-urine-copper"/);
          continue;
        }
        if (isEveningCortisol) {
          assert.match(newHtml, /CORTISOL, EVENING/);
          assert.match(newHtml, /data-report-content="evening-cortisol"/);
          continue;
        }
        if (isMidnightCortisol) {
          assert.match(newHtml, /CORTISOL, MIDNIGHT/);
          assert.match(newHtml, /data-report-content="midnight-cortisol"/);
          continue;
        }
        if (isMorningEveningCortisol) {
          assert.match(newHtml, /CORTISOL, MORNING & EVENING/);
          assert.match(newHtml, /data-report-content="morning-evening-cortisol"/);
          continue;
        }
        if (isMorningCortisol) {
          assert.match(newHtml, /CORTISOL, MORNING/);
          assert.match(newHtml, /data-report-content="morning-cortisol"/);
          continue;
        }
        if (isMorningEveningMidnightCortisol) {
          assert.match(newHtml, /CORTISOL, MORNING, EVENING & MIDNIGHT/);
          assert.match(newHtml, /data-report-content="morning-evening-midnight-cortisol"/);
          continue;
        }
        if (isCryoglobulinsScreening) {
          assert.match(newHtml, /CRYOGLOBULINS SCREENING TEST/);
          assert.match(newHtml, /data-report-content="cryoglobulins-screening"/);
          continue;
        }
        if (isGndCulture) {
          if (isHcvAntibodyIgm) {
            assert.match(newHtml, /HEPATITIS C VIRUS \(HCV\) ANTIBODY IgM/);
            assert.match(newHtml, /data-report-content="hcv-antibody-igm"/);
            assert.match(newHtml, /must not be used alone to diagnose recent or acute HCV infection/);
            continue;
          }
          if (isHcvAntibodyIgg) {
            assert.match(newHtml, /HEPATITIS C VIRUS \(HCV\) ANTIBODY IgG/);
            assert.match(newHtml, /data-report-content="hcv-antibody-igg"/);
            assert.match(newHtml, /HCV RNA nucleic-acid testing is needed to determine whether current viraemia is present/);
            continue;
          }
          if (isHcvTotalAntibody) {
            assert.match(newHtml, /HEPATITIS C VIRUS \(HCV\) TOTAL ANTIBODY \(IgM \+ IgG\)/);
            assert.match(newHtml, /data-report-content="hcv-total-antibody"/);
            assert.match(newHtml, /does not by itself distinguish current infection, resolved past infection, or a biologic false-positive result/);
            continue;
          }
          if (isHbsAgQuantitative) {
            assert.match(newHtml, /HEPATITIS B SURFACE ANTIGEN \(HBsAg\), QUANTITATIVE/);
            assert.match(newHtml, /data-report-content="hbsag-quantitative"/);
            assert.match(newHtml, /does not establish acute versus chronic infection, infectivity, treatment eligibility, or treatment response/);
            continue;
          }
          if (isHepatitisBViralDnaQualitative) {
            assert.match(newHtml, /HEPATITIS B VIRUS \(HBV\) DNA - QUALITATIVE/);
            assert.match(newHtml, /data-report-content="hbv-dna-qualitative"/);
            assert.match(newHtml, /does not provide a viral-load value/);
            continue;
          }
          if (isHepatitisCRnaPcrQuantitative) {
            assert.match(newHtml, /HEPATITIS C VIRUS \(HCV\) RNA PCR - QUANTITATIVE/);
            assert.match(newHtml, /data-report-content="hcv-rna-quantitative"/);
            assert.match(newHtml, /must not alone determine disease stage or treatment decisions/);
            continue;
          }
          if (isHbdh) {
            assert.match(newHtml, /ALPHA-HYDROXYBUTYRATE DEHYDROGENASE \(HBDH \/ LDH-1\)/);
            assert.match(newHtml, /data-report-content="hbdh"/);
            assert.match(newHtml, /Do not use an isolated HBDH or HBDH\/LDH result to diagnose/);
            continue;
          }
          if (isHavTotal) {
            assert.match(newHtml, /HEPATITIS A TOTAL ANTIBODY \(ANTI-HAV, IgG \+ IgM\)/);
            assert.match(newHtml, /data-report-content="hav-total"/);
            assert.match(newHtml, /do not use total antibody alone to diagnose acute illness/);
            continue;
          }
          if (isGonorrhea) {
            assert.match(newHtml, /GONORRHEA - NEISSERIA GONORRHOEAE/);
            assert.match(newHtml, /data-report-content="gonorrhea"/);
            assert.match(newHtml, /NAAT and culture are separate methods/);
            continue;
          }
          if (isUrethralDischargeGramStain) {
            assert.match(newHtml, /GRAM STAIN OF URETHRAL DISCHARGE/);
            assert.match(newHtml, /data-report-content="urethral-discharge-gram-stain"/);
            assert.match(newHtml, /does not provide definitive species identification or antimicrobial susceptibility/);
            continue;
          }
          if (isGeneralGramStain) {
            assert.match(newHtml, /GRAM STAIN OF SMEARS/);
            assert.match(newHtml, /data-report-content="gram-stain-smears"/);
            assert.match(newHtml, /Do not infer an organism, susceptibility pattern, or infection site from morphology alone/);
            continue;
          }
          if (isGeneralHealthCheckUp) {
            assert.match(newHtml, /GENERAL HEALTH CHECK UP/);
            assert.match(newHtml, /data-report-content="general-health-check-up"/);
            assert.match(newHtml, /This check-up is a summary only of investigations actually ordered and reported/);
            continue;
          }
          assert.match(newHtml, /CULTURE FOR GRAM-NEGATIVE DIPLOCOCCI/);
          assert.match(newHtml, /data-report-content="gnd-culture"/);
          continue;
        }
        if (isCysticFibrosisGeneMutation) {
          assert.match(newHtml, /CYSTIC FIBROSIS \(CF\) GENE MUTATION/);
          assert.match(newHtml, /data-report-content="cftr-gene-mutation"/);
          continue;
        }
        if (isCervicalPapSmear) {
          assert.match(newHtml, /CERVICAL SMEAR - PAP STAIN/);
          assert.match(newHtml, /CERVICAL CYTOLOGY INTERPRETATION/);
          assert.match(newHtml, /does not by itself establish cervical cancer/);
          continue;
        }
        if (isCervicalSwabGramStain) {
          assert.match(newHtml, /CERVICAL SWAB - GRAM STAIN/);
          assert.match(newHtml, /SPECIMEN AND DIRECT MICROSCOPY/);
          assert.match(newHtml, /not a standardized or sufficiently sensitive test for chlamydia or gonorrhoea/);
          continue;
        }
        if (isCervicalSwabAfbStain) {
          assert.match(newHtml, /CERVICAL SWAB - AFB STAIN/);
          assert.match(newHtml, /SPECIMEN AND AFB DIRECT MICROSCOPY/);
          assert.match(newHtml, /A negative smear does not exclude mycobacterial infection/);
          continue;
        }
        if (isCDiffToxin) {
          assert.match(newHtml, /CLOSTRIDIOIDES DIFFICILE TOXIN DETECTION/);
          assert.match(newHtml, /A laboratory result alone does not establish C\. difficile infection/);
          continue;
        }
        if (isTotalCholesterol) {
          assert.match(newHtml, /TOTAL CHOLESTEROL/);
          assert.match(newHtml, /should not be used alone to assign cardiovascular risk or a treatment target/);
          continue;
        }
        if (is24HourUrineChloride) {
          assert.match(newHtml, /24-HOUR URINE ELECTROLYTE/);
          assert.match(newHtml, /Do not compare this total daily excretion directly with a random urine chloride concentration/);
          continue;
        }
        if (isSerumChloride) {
          assert.match(newHtml, /SERUM ELECTROLYTE/);
          assert.match(newHtml, /Do not infer an anion gap, acid-base diagnosis/);
          continue;
        }
        if (isRandomUrineChloride) {
          assert.match(newHtml, /RANDOM URINE ELECTROLYTE/);
          assert.match(newHtml, /Do not apply a 24-hour urine chloride reference interval/);
          continue;
        }
        if (isChlamydiaAntigen) {
          assert.match(newHtml, /CHLAMYDIA TRACHOMATIS ANTIGEN DETECTION/);
          assert.match(newHtml, /not an antibody-serology result and it is not a nucleic-acid amplification test/);
          continue;
        }
        if (isChlamydiaAntibodyIggIgm) {
          assert.match(newHtml, /CHLAMYDIA TRACHOMATIS ANTIBODY SEROLOGY/);
          assert.match(newHtml, /does not establish an active uncomplicated genital/);
          continue;
        }
        if (isChikungunyaIgm) {
          assert.match(newHtml, /CHIKUNGUNYA VIRUS SEROLOGY/);
          assert.match(newHtml, /not a stand-alone confirmation/);
          continue;
        }
        if (isChikungunyaIgg) {
          assert.match(newHtml, /CHIKUNGUNYA VIRUS SEROLOGY/);
          assert.match(newHtml, /does not by itself establish acute chikungunya virus disease/);
          continue;
        }
        if (isCapillaryFragility) {
          assert.match(newHtml, /CAPILLARY FRAGILITY ASSESSMENT/);
          assert.match(newHtml, /does not identify the cause of bleeding or bruising by itself/);
          continue;
        }
        if (isCardiacProfile) {
          assert.match(newHtml, /CARDIAC BIOMARKERS/);
          assert.match(newHtml, /serial measurements where indicated/);
          continue;
        }
        if (isColorectalCancerMonitorProfile) {
          assert.match(newHtml, /COLORECTAL CANCER MONITOR PROFILE/);
          assert.match(newHtml, /data-report-content="colorectal-cancer-monitor-profile"/);
          continue;
        }
        if (isBilateralConjunctivalSwab) {
          assert.match(newHtml, /CONJUNCTIVAL SWAB - BOTH EYES/);
          assert.match(newHtml, /data-report-content="bilateral-conjunctival-swab"/);
          continue;
        }
        if (isRightConjunctivalSwabCulture) {
          assert.match(newHtml, /CONJUNCTIVAL SWAB CULTURE & SENSITIVITY - RIGHT EYE/);
          assert.match(newHtml, /data-report-content="right-conjunctival-swab-culture"/);
          continue;
        }
        if (isConjunctivalSwabCulture) {
          assert.match(newHtml, /CONJUNCTIVAL SWAB CULTURE/);
          assert.match(newHtml, /data-report-content="conjunctival-swab-culture"/);
          continue;
        }
        if (isCeruloplasmin) {
          assert.match(newHtml, /CERULOPLASMIN, SERUM/);
          assert.match(newHtml, /positive acute-phase reactant/);
          continue;
        }
        if (isAsciticFluidGramStain) {
          assert.match(newHtml, /ASCITIC FLUID GRAM STAIN/);
          assert.match(newHtml, /data-report-content="ascitic-fluid-gram-stain"/);
          continue;
        }
        if (isArthritisProfile) {
          assert.match(newHtml, /ARTHRITIS PROFILE/);
          assert.match(newHtml, /data-report-content="arthritis-profile"/);
          continue;
        }
        if (isUrineArsenic) {
          assert.match(newHtml, /ARSENIC, URINE \(TOTAL\)/);
          assert.match(newHtml, /data-report-content="urine-arsenic"/);
          continue;
        }
        if (isApolipoproteinA1) {
          assert.match(newHtml, /APOLIPOPROTEIN A1 \(APOA1\)/);
          assert.match(newHtml, /data-report-content="apolipoprotein-a1"/);
          continue;
        }
        if (isAntiSpermAntibody) {
          assert.match(newHtml, /ANTI-SPERM ANTIBODY/);
          assert.match(newHtml, /data-report-content="anti-sperm-antibody"/);
          continue;
        }
        if (isAntiCcpAb) {
          assert.match(newHtml, /ANTI-CCP ANTIBODY/);
          assert.match(newHtml, /data-report-content="anti-ccp-ab"/);
          continue;
        }
        if (isAntiRibosomalPAntibody) {
          assert.match(newHtml, /ANTI-RIBOSOMAL P ANTIBODY/);
          assert.match(newHtml, /data-report-content="anti-ribosomal-p-antibody"/);
          continue;
        }
        if (isAntiHistoneAntibody) {
          assert.match(newHtml, /ANTI-HISTONE ANTIBODY/);
          assert.match(newHtml, /data-report-content="anti-histone-antibody"/);
          continue;
        }
        if (isAntiSsDnaAntibody) {
          assert.match(newHtml, /ANTI-ssDNA ANTIBODY/);
          assert.match(newHtml, /data-report-content="anti-ssdna-antibody"/);
          continue;
        }
        if (isAntiDsDnaAntibody) {
          assert.match(newHtml, /ANTI-dsDNA ANTIBODY/);
          assert.match(newHtml, /data-report-content="anti-dsdna-antibody"/);
          continue;
        }
        if (isAntiMicrosomalAntibody) {
          assert.match(newHtml, /ANTI-MICROSOMAL ANTIBODY/);
          assert.match(newHtml, /data-report-content="anti-microsomal-antibody"/);
          continue;
        }
        if (isAntiLeptospiraAntibody) {
          assert.match(newHtml, /ANTI-LEPTOSPIRA ANTIBODY/);
          assert.match(newHtml, /data-report-content="anti-leptospira-antibody"/);
          continue;
        }
        if (isAntiInsulinAntibody) {
          assert.match(newHtml, /INSULIN ANTIBODIES \(IAA\)/);
          assert.match(newHtml, /data-report-content="anti-insulin-antibody"/);
          continue;
        }
        if (isBoneMarrowAspirationCytology) {
          assert.match(newHtml, /BONE MARROW ASPIRATION &amp; CYTOLOGY/);
          assert.match(newHtml, /Nucleated Differential \/ Myelogram/);
          assert.match(newHtml, /Sideroblasts \/ Ring Sideroblasts/);
          assert.match(newHtml, /Flow Cytometry/);
          assert.match(newHtml, /Integrated Diagnosis \/ Report Status/);
          continue;
        }
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
        if (isCsfFluidChloride) {
          assert.match(newHtml, /CHLORIDE, CEREBROSPINAL FLUID/);
          assert.match(newHtml, /CSF ELECTROLYTE/);
          assert.match(newHtml, /adult interval must not be applied to an infant result/);
          assert.match(newHtml, /not recommended as a routine stand-alone test for suspected tuberculous meningitis/);
          continue;
        }
        if (isCsfFluidAfbStain) {
          assert.match(newHtml, /AFB STAIN, CEREBROSPINAL FLUID/);
          assert.match(newHtml, /Direct microscopy/);
          assert.match(newHtml, /do not identify the species or confirm/);
          assert.match(newHtml, /does not exclude tuberculous meningitis/);
          continue;
        }
        if (isCsfFluidGramStain) {
          assert.match(newHtml, /GRAM STAIN, CEREBROSPINAL FLUID/);
          assert.match(newHtml, /DIRECT MICROSCOPY/);
          assert.match(newHtml, /does not provide definitive organism identification/);
          assert.match(newHtml, /does not exclude infection/);
          continue;
        }
        if (isCsfFluidProtein) {
          assert.match(newHtml, /TOTAL PROTEIN, CEREBROSPINAL FLUID/);
          assert.match(newHtml, /CSF BIOCHEMISTRY/);
          assert.match(newHtml, /age- and method-specific CSF protein reference interval/);
          assert.match(newHtml, /does not establish or exclude meningitis/);
          continue;
        }
        if (isCsfFluidSpecificGravity) {
          assert.match(newHtml, /SPECIFIC GRAVITY, CEREBROSPINAL FLUID/);
          assert.match(newHtml, /CSF PHYSICAL EXAMINATION/);
          assert.match(newHtml, /must be interpreted using the laboratory&rsquo;s validated method/);
          assert.match(newHtml, /does not establish or exclude infection/);
          continue;
        }
        if (isCsfFluidGlucose) {
          assert.match(newHtml, /GLUCOSE, CEREBROSPINAL FLUID/);
          assert.match(newHtml, /CSF \/ Serum Glucose Ratio/);
          assert.match(newHtml, /paired serum or plasma glucose collected at approximately the same time/);
          assert.match(newHtml, /does not establish or exclude meningitis/);
          continue;
        }
        if (isBodyFluidBiochemistry) {
          assert.match(newHtml, /BODY FLUID BIOCHEMISTRY/);
          assert.match(newHtml, /Fluid Type \/ Source/);
          assert.match(newHtml, /Fluid values alone do not establish an exudate or transudate/);
          assert.match(newHtml, /serum-ascites albumin gradient \(SAAG\)/);
          continue;
        }
        if (isBodyFluidSpecificGravity) {
          assert.match(newHtml, /SPECIFIC GRAVITY, BODY FLUID/);
          assert.match(newHtml, /Fluid Type \/ Source/);
          assert.match(newHtml, /must not be used to classify a fluid as transudate or exudate/);
          continue;
        }
        if (isComplementC3) {
          assert.match(newHtml, /COMPLEMENT C3 \(C3\), SERUM/);
          assert.match(newHtml, /COMPLEMENT COMPONENT C3/);
          assert.match(newHtml, /not a functional C3 assay/);
          continue;
        }
        if (isComplementC4) {
          assert.match(newHtml, /COMPLEMENT C4 \(C4\), SERUM/);
          assert.match(newHtml, /COMPLEMENT COMPONENT C4/);
          assert.match(newHtml, /not a functional C4 assay/);
          continue;
        }
        if (isCancaAntiPr3) {
          assert.match(newHtml, /cANCA \(ANTI-PR3\)/);
          assert.match(newHtml, /CYTOPLASMIC ANCA \/ ANTI-PR3/);
          assert.match(newHtml, /not diagnostic of ANCA-associated vasculitis/);
          continue;
        }
        if (isCreatinineClearance) {
          assert.match(newHtml, /CREATININE CLEARANCE TEST \(CCT\)/);
          assert.match(newHtml, /CREATININE CLEARANCE/);
          assert.match(newHtml, /Accurate collection timing and complete urine collection are essential/);
          continue;
        }
        if (isCd3Lymphocyte) {
          assert.match(newHtml, /CD3\+ T LYMPHOCYTES/);
          assert.match(newHtml, /CD3\+ T-LYMPHOCYTE ENUMERATION/);
          assert.match(newHtml, /not a complete T-, B-, and NK-cell panel/);
          continue;
        }
        if (isCd4Lymphocyte) {
          assert.match(newHtml, /CD4\+ T LYMPHOCYTES/);
          assert.match(newHtml, /CD4\+ T-LYMPHOCYTE ENUMERATION/);
          assert.match(newHtml, /not a complete T-, B-, and NK-cell panel/);
          continue;
        }
        if (isCd8Lymphocyte) {
          assert.match(newHtml, /CD8\+ T LYMPHOCYTES/);
          assert.match(newHtml, /CD8\+ T-LYMPHOCYTE ENUMERATION/);
          assert.match(newHtml, /not a complete T-, B-, and NK-cell panel/);
          continue;
        }
        if (isCea) {
          assert.match(newHtml, /CARCINOEMBRYONIC ANTIGEN \(CEA\)/);
          assert.match(newHtml, /not a screening test for asymptomatic individuals/);
          continue;
        }
        if (isCft) {
          assert.match(newHtml, /COMPLEMENT FIXATION TEST/);
          assert.match(newHtml, /Target Antigen \/ Assay/);
          continue;
        }
        if (isCkMb) {
          assert.match(newHtml, /CREATINE KINASE-MB \(CK-MB\)/);
          continue;
        }
        if (isCpk) {
          assert.match(newHtml, /CREATINE PHOSPHOKINASE \(CPK\), TOTAL/);
          assert.match(newHtml, /Total CK\/CPK is an enzyme activity measurement/);
          continue;
        }
        if (isCpkWithCkMb) {
          assert.match(newHtml, /CPK WITH CK-MB/);
          assert.match(newHtml, /CREATINE PHOSPHOKINASE \(CPK\), TOTAL/);
          assert.match(newHtml, /CK-MB/);
          assert.match(newHtml, /CK-MB must not be interpreted alone as proof of myocardial injury/);
          continue;
        }
        if (isCmvIgmIgg) {
          assert.match(newHtml, /CYTOMEGALOVIRUS \(CMV\) ANTIBODIES, IgM &amp; IgG/);
          assert.match(newHtml, /CMV IgM reactivity may occur/);
          assert.doesNotMatch(newHtml, /TORCH PANEL, IgG &amp; IgM, SERUM/);
          continue;
        }
        if (isCmvIgg) {
          assert.match(newHtml, /CYTOMEGALOVIRUS \(CMV\) IgG ANTIBODY/);
          assert.match(newHtml, /data-report-content="cmv-igg"/);
          continue;
        }
        if (isBronchialWashingCultureSensitivity) {
          assert.match(newHtml, /BRONCHIAL WASHING CULTURE & SENSITIVITY/);
          assert.match(newHtml, /DIRECT EXAMINATION/);
          assert.match(newHtml, /ANTIMICROBIAL SUSCEPTIBILITY/);
          assert.match(newHtml, /airway colonisation, or contamination/);
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
        if (isAnticardiolipinIga) {
          assert.match(newHtml, /ANTICARDIOLIPIN ANTIBODY IgA, SERUM/);
          assert.match(newHtml, /non-criteria antiphospholipid antibody/);
          assert.match(newHtml, /is not included in the IgG\/IgM laboratory domains/);
          assert.doesNotMatch(newHtml, /ANTICARDIOLIPIN ANTIBODY Ig[GM], SERUM/);
          continue;
        }
        if (isAnticardiolipinIgaIgm) {
          assert.match(newHtml, /ANTICARDIOLIPIN ANTIBODY IgA, SERUM/);
          assert.match(newHtml, /ANTICARDIOLIPIN ANTIBODY IgM, SERUM/);
          assert.match(newHtml, /IgA is not included in the laboratory domains/);
          assert.doesNotMatch(newHtml, /ANTICARDIOLIPIN ANTIBODY IgG, SERUM/);
          continue;
        }
        if (isAnticardiolipinIgaIgg) {
          assert.match(newHtml, /ANTICARDIOLIPIN ANTIBODY IgA, SERUM/);
          assert.match(newHtml, /ANTICARDIOLIPIN ANTIBODY IgG, SERUM/);
          assert.match(newHtml, /IgA is not included in the laboratory domains/);
          assert.doesNotMatch(newHtml, /ANTICARDIOLIPIN ANTIBODY IgM, SERUM/);
          continue;
        }
        if (isAnticardiolipinIggIgm) {
          assert.match(newHtml, /ANTICARDIOLIPIN ANTIBODY IgG, SERUM/);
          assert.match(newHtml, /ANTICARDIOLIPIN ANTIBODY IgM, SERUM/);
          assert.match(newHtml, /IgG and IgM have different laboratory weights/);
          assert.doesNotMatch(newHtml, /ANTICARDIOLIPIN ANTIBODY IgA, SERUM/);
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
        if (isAntenatalProfile) {
          assert.match(newHtml, /ANTENATAL PROFILE/);
          assert.match(newHtml, /BLOOD GROUP &amp; IMMUNOHAEMATOLOGY/);
          assert.match(newHtml, /MATERNAL INFECTION SCREENING/);
          assert.match(newHtml, /24&ndash;28 weeks/);
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
        if (isBaccalSmearBrrBody) {
          assert.match(newHtml, /BUCCAL SMEAR FOR BARR BODY \(SEX CHROMATIN\)/);
          assert.match(newHtml, /Barr-body Positive Nuclei \(%\)/);
          assert.match(newHtml, /supportive screening test/);
          assert.match(newHtml, /may miss mosaicism, structural abnormalities/);
          continue;
        }
        if (isAutoimmuneProfile) {
          assert.match(newHtml, /AUTOIMMUNE PROFILE/);
          assert.match(newHtml, /ANA Screen \/ Result/);
          assert.match(newHtml, /Anti-dsDNA Antibody/);
          assert.match(newHtml, /Complement C3/);
          assert.match(newHtml, /does not establish or exclude a diagnosis/);
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
      assert.equal(
        extractMainContentMarkup(withoutAddedNotes),
        extractMainContentMarkup(oldHtml),
        `Only supplemental content and the shared pagination shell may differ: ${t.name}`
      );
    }
  } finally { await new Promise(resolve => db.close(resolve)); }
});

test('bronchial brushing, lavage and washing PAP cytology render distinct blank-safe reports', () => {
  for (const [name, specimen, other] of [
    ['Bronchial BrushingforPAP', 'Bronchial Brushing', 'Bronchial Lavage'],
    ['Bronchial LavageforPAp', 'Bronchial Lavage', 'Bronchial Brushing'],
    ['Bronchial WashingforPAP', 'Bronchial Washing', 'Bronchial Lavage'],
  ]) {
    const fields = getFallbackReportParameters({ name });
    assert.deepEqual(fields.map(field => field.parameterName), [
      'Specimen / Collection Site', 'Collection Date / Time', 'Clinical Details / Imaging',
      'Preparation / Stains', 'Specimen Adequacy', 'Cytomorphologic Findings',
      'Other Findings / Organisms', 'Diagnostic Category', 'Interpretation / Diagnosis',
      'Ancillary Studies / Correlation', 'Comments / Limitations',
    ]);
    assert.ok(fields.every(field => !field.normalRange && field.entryMode === 'manual'));

    const html = buildReportHtml(sampleReport({
      name, sample_type: specimen, parameters: fields.map(field => ({ parameter_name: field.parameterName, value: '' })),
    }));
    assert.match(html, new RegExp(`<div class="test-title">${specimen.toUpperCase()} - PAP CYTOLOGY<\\/div>`));
    assert.match(html, /class="bronchial-pap-cytology-report"/);
    assert.match(html, /Specimen Adequacy/);
    assert.match(html, /Diagnostic Category/);
    assert.match(html, /A negative cytology result does not exclude a lesion/);
    assert.doesNotMatch(html, new RegExp(`${other} - PAP CYTOLOGY`));
    assert.doesNotMatch(html, /ATYPICAL SQUAMOUS CELLS|HIGH RISK HPV RESULT|Satisfactory for evaluation/);
  }

  const entered = buildReportHtml(sampleReport({
    name: 'Bronchial BrushingforPAP', sample_type: 'Bronchial Brushing',
    parameters: [
      { parameter_name: 'Specimen / Collection Site', value: 'Right upper lobe' },
      { parameter_name: 'Cytomorphologic Findings', value: 'Reactive cells <review>\nMacrophages present' },
      { parameter_name: 'Interpretation / Diagnosis', value: 'Pathologist-entered conclusion' },
    ],
  }));
  assert.match(entered, /Reactive cells &lt;review&gt;<br \/>Macrophages present/);
  assert.match(entered, /Pathologist-entered conclusion/);
  assert.doesNotMatch(entered, /Reactive cells <review>/);
  const legacy = buildReportHtml(sampleReport({
    name: 'Bronchial LavageforPAp', parameters: [{ parameter_name: 'Result', value: 'Legacy recorded finding' }],
  }));
  assert.match(legacy, /Legacy recorded finding/);
  assert.equal(getFallbackReportParameters({ name: 'Bronchial WashingforPAP' }).length, 11);
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

test('bronchial PAP cytology upgrades only unused blank placeholders and preserves neighbouring tests', async () => {
  const db = await fixture();
  try {
    for (const [id, name, body] of [
      [800, 'Bronchial BrushingforPAP', ''],
      [801, 'Bronchial LavageforPAp', ''],
      [802, 'Bronchial BrushingforPAP', ''],
      [803, 'Bronchial LavageforPAp', ''],
      [804, 'Bronchial BrushingforPAP', 'Lab-authored report'],
      [805, 'Bronchial WashingforPAP', ''],
      [806, 'Bronchial LavageforPAp', ''],
      [807, 'Bronchial LavageforPAp', ''],
      [808, 'Bronchial WashingforPAP', ''],
    ]) {
      await db.run('INSERT INTO tests (id,name,category,report_body) VALUES (?,?,?,?)', [id, name, 'Imported legacy catalogue', body]);
      await db.run(
        'INSERT INTO test_parameters (test_id,parameter_name,unit,normal_range,entry_mode,display_order) VALUES (?,?,?,?,?,?)',
        [id, 'Result', '', '', 'manual', 1]
      );
    }
    const originalBrushingId = (await db.get('SELECT id FROM test_parameters WHERE test_id=800')).id;
    const originalLavageId = (await db.get('SELECT id FROM test_parameters WHERE test_id=801')).id;
    const originalWashingId = (await db.get('SELECT id FROM test_parameters WHERE test_id=808')).id;
    await db.run('INSERT INTO visit_tests (test_id) VALUES (?)', [802]);
    await db.run('INSERT INTO test_bundle_items (bundle_test_id,component_test_id) VALUES (?,?)', [803, 805]);
    await db.run("UPDATE test_parameters SET normal_range='Lab custom' WHERE test_id=806");
    await db.run("UPDATE tests SET sample_type='Bronchoalveolar Lavage' WHERE id=807");

    await ensureBronchialPapCytologyTestConfigurations(db);
    await ensureBronchialPapCytologyTestConfigurations(db);

    for (const [id, specimen, originalId] of [
      [800, 'Bronchial Brushing', originalBrushingId],
      [801, 'Bronchial Lavage', originalLavageId],
      [808, 'Bronchial Washing', originalWashingId],
    ]) {
      const fields = await db.all('SELECT id,parameter_name,normal_range FROM test_parameters WHERE test_id=? ORDER BY display_order', [id]);
      const name = id === 800 ? 'Bronchial BrushingforPAP' : id === 801 ? 'Bronchial LavageforPAp' : 'Bronchial WashingforPAP';
      assert.deepEqual(fields.map(field => field.parameter_name), getFallbackReportParameters({ name }).map(field => field.parameterName));
      assert.equal(fields[8].id, originalId);
      assert.ok(fields.every(field => !field.normal_range));
      assert.equal((await db.get('SELECT sample_type FROM tests WHERE id=?', [id])).sample_type, specimen);
    }
    for (const id of [802, 803, 804, 805, 806, 807]) {
      assert.deepEqual((await db.all('SELECT parameter_name FROM test_parameters WHERE test_id=?', [id])).map(field => field.parameter_name), ['Result']);
    }
    assert.equal((await db.get('SELECT normal_range FROM test_parameters WHERE test_id=806')).normal_range, 'Lab custom');
  } finally {
    await db.close();
  }
});

test('Anti InsulinAntibody upgrades only unused blank placeholders and stays idempotent', async () => {
  const db = await fixture();
  try {
    for (const [id, name, body] of [
      [500, 'Anti InsulinAntibody', ''],
      [501, 'Anti Insulin Antibody', ''],
      [502, 'Insulin Antibody', ''],
      [503, 'Anti InsulinAntibody', 'Lab-authored format'],
      [504, 'Anti Insulin Receptor Antibody', ''],
      [505, 'Insulin Antibodies', ''],
    ]) {
      await db.run('INSERT INTO tests (id,name,category,report_body) VALUES (?,?,?,?)', [id, name, 'Imported legacy catalogue', body]);
    }
    for (const id of [500, 501, 502, 503, 504]) {
      await db.run("INSERT INTO test_parameters (test_id,parameter_name,unit,normal_range,entry_mode,display_order) VALUES (?,'Result','','','manual',1)", [id]);
    }
    await db.run('INSERT INTO visit_tests (test_id) VALUES (?)', [501]);
    await db.run("UPDATE test_parameters SET unit='Custom unit' WHERE test_id=502");

    await ensureAntiInsulinAntibodyTestConfiguration(db);
    await ensureAntiInsulinAntibodyTestConfiguration(db);

    const upgraded = await db.get('SELECT sample_type FROM tests WHERE id=500');
    const upgradedFields = await db.all('SELECT parameter_name,normal_range FROM test_parameters WHERE test_id=500');
    assert.equal(upgraded.sample_type, 'Serum');
    assert.deepEqual(upgradedFields, [{ parameter_name: 'Insulin Antibodies (IAA), Serum', normal_range: 'Assay-specific negative cut-off' }]);
    assert.equal((await db.get('SELECT parameter_name FROM test_parameters WHERE test_id=501')).parameter_name, 'Result');
    assert.equal((await db.get('SELECT unit FROM test_parameters WHERE test_id=502')).unit, 'Custom unit');
    assert.equal((await db.get('SELECT sample_type FROM tests WHERE id=503')).sample_type, null);
    assert.equal((await db.get('SELECT sample_type FROM tests WHERE id=504')).sample_type, null);
    assert.equal((await db.get('SELECT COUNT(*) AS count FROM test_parameters WHERE test_id=505')).count, 1);
  } finally {
    await db.close();
  }
});

test('Anti Leptospira Antibody repairs only its unused generic entry', async () => {
  const db = await fixture();
  try {
    for (const [id, name, body] of [
      [520, 'Anti Leptospira Antibody', ''],
      [521, 'Leptospira Antibody', ''],
      [522, 'Anti Leptospira Antibody', ''],
      [523, 'Anti Leptospira Antibody', 'Lab-authored format'],
      [524, 'Leptospira Antibody IgG', ''],
      [525, 'Leptospira Antibody IgM', ''],
      [526, 'Leptospira Antibodies (IgG & IgM)', ''],
      [527, 'Leptospira Antibody', ''],
    ]) {
      await db.run('INSERT INTO tests (id,name,category,report_body) VALUES (?,?,?,?)', [id, name, 'Imported legacy catalogue', body]);
      if (id !== 527) await db.run("INSERT INTO test_parameters (test_id,parameter_name,unit,normal_range,entry_mode,display_order) VALUES (?,'Result','','','manual',1)", [id]);
    }
    await db.run('INSERT INTO visit_tests (test_id) VALUES (?)', [521]);
    await db.run("UPDATE test_parameters SET normal_range='Custom cut-off' WHERE test_id=522");

    await ensureAntiLeptospiraAntibodyTestConfiguration(db);
    await ensureAntiLeptospiraAntibodyTestConfiguration(db);

    assert.equal((await db.get('SELECT sample_type FROM tests WHERE id=520')).sample_type, 'Serum');
    assert.deepEqual(await db.all('SELECT parameter_name,normal_range FROM test_parameters WHERE test_id=520'), [
      { parameter_name: 'Anti-Leptospira Antibody, Serum', normal_range: 'Negative / non-reactive (assay-specific)' },
    ]);
    assert.equal((await db.get('SELECT parameter_name FROM test_parameters WHERE test_id=521')).parameter_name, 'Result');
    assert.equal((await db.get('SELECT normal_range FROM test_parameters WHERE test_id=522')).normal_range, 'Custom cut-off');
    for (const id of [523, 524, 525, 526]) {
      assert.equal((await db.get('SELECT sample_type FROM tests WHERE id=?', [id])).sample_type, null);
    }
    assert.equal((await db.get('SELECT COUNT(*) AS count FROM test_parameters WHERE test_id=527')).count, 1);
  } finally {
    await db.close();
  }
});

test('Anti Microsomal Antibody repairs only its unused generic entry', async () => {
  const db = await fixture();
  try {
    for (const [id, name, body] of [
      [540, 'Anti Microsomal Antibody', ''],
      [541, 'Anti Microsomal Antibody', ''],
      [542, 'Anti Microsomal Antibody', ''],
      [543, 'Anti Microsomal Antibody', 'Lab-authored format'],
      [544, 'Anti TPO (Anti ThyroidPeroxidase)', ''],
      [545, 'Anti LKM', ''],
      [546, 'Anti Microsomal Antibody', ''],
    ]) {
      await db.run('INSERT INTO tests (id,name,category,report_body) VALUES (?,?,?,?)', [id, name, 'Imported legacy catalogue', body]);
      if (id !== 546) await db.run("INSERT INTO test_parameters (test_id,parameter_name,unit,normal_range,entry_mode,display_order) VALUES (?,'Result','','','manual',1)", [id]);
    }
    await db.run('INSERT INTO visit_tests (test_id) VALUES (?)', [541]);
    await db.run("UPDATE test_parameters SET normal_range='Custom cut-off' WHERE test_id=542");

    await ensureAntiMicrosomalAntibodyTestConfiguration(db);
    await ensureAntiMicrosomalAntibodyTestConfiguration(db);

    const expectedNames = ['Antigen / Assay Target', 'Assay Method', 'Anti-Microsomal Antibody Result', 'Laboratory Interpretation', 'Comments'];
    for (const id of [540, 546]) {
      assert.equal((await db.get('SELECT sample_type FROM tests WHERE id=?', [id])).sample_type, 'Serum');
      const fields = await db.all('SELECT parameter_name FROM test_parameters WHERE test_id=? ORDER BY display_order', [id]);
      assert.deepEqual(fields.map(field => field.parameter_name), expectedNames);
    }
    assert.equal((await db.get('SELECT parameter_name FROM test_parameters WHERE test_id=541')).parameter_name, 'Result');
    assert.equal((await db.get('SELECT normal_range FROM test_parameters WHERE test_id=542')).normal_range, 'Custom cut-off');
    for (const id of [543, 544, 545]) {
      assert.equal((await db.get('SELECT sample_type FROM tests WHERE id=?', [id])).sample_type, null);
      assert.equal((await db.get('SELECT parameter_name FROM test_parameters WHERE test_id=?', [id])).parameter_name, 'Result');
    }
  } finally {
    await db.close();
  }
});

test('Anti ds DNAAntibody repairs only its unused generic entry', async () => {
  const db = await fixture();
  try {
    for (const [id, name, body] of [
      [560, 'Anti ds DNAAntibody', ''],
      [561, 'Anti ds DNAAntibody', ''],
      [562, 'Anti ds DNAAntibody', ''],
      [563, 'Anti ds DNAAntibody', 'Lab-authored format'],
      [564, 'Anti ssDNAAntibody', ''],
      [565, 'Anti ds DNAAntibody', ''],
    ]) {
      await db.run('INSERT INTO tests (id,name,category,report_body) VALUES (?,?,?,?)', [id, name, 'Imported legacy catalogue', body]);
      if (id !== 565) await db.run("INSERT INTO test_parameters (test_id,parameter_name,unit,normal_range,entry_mode,display_order) VALUES (?,'Result','','','manual',1)", [id]);
    }
    await db.run('INSERT INTO visit_tests (test_id) VALUES (?)', [561]);
    await db.run("UPDATE test_parameters SET normal_range='Custom cut-off' WHERE test_id=562");

    await ensureAntiDsDnaAntibodyTestConfiguration(db);
    await ensureAntiDsDnaAntibodyTestConfiguration(db);

    const expectedNames = ['Anti-dsDNA Antibody', 'Assay Method / Platform', 'Laboratory Interpretation', 'Comments'];
    for (const id of [560, 565]) {
      assert.equal((await db.get('SELECT sample_type FROM tests WHERE id=?', [id])).sample_type, 'Serum');
      const fields = await db.all('SELECT parameter_name,normal_range FROM test_parameters WHERE test_id=? ORDER BY display_order', [id]);
      assert.deepEqual(fields.map(field => field.parameter_name), expectedNames);
      assert.equal(fields[0].normal_range, 'Assay-specific reference interval');
    }
    assert.equal((await db.get('SELECT parameter_name FROM test_parameters WHERE test_id=561')).parameter_name, 'Result');
    assert.equal((await db.get('SELECT normal_range FROM test_parameters WHERE test_id=562')).normal_range, 'Custom cut-off');
    for (const id of [563, 564]) {
      assert.equal((await db.get('SELECT sample_type FROM tests WHERE id=?', [id])).sample_type, null);
      assert.equal((await db.get('SELECT parameter_name FROM test_parameters WHERE test_id=?', [id])).parameter_name, 'Result');
    }
  } finally {
    await db.close();
  }
});

test('Anti ssDNAAntibody repairs only its unused generic entry', async () => {
  const db = await fixture();
  try {
    for (const [id, name, body] of [
      [580, 'Anti ssDNAAntibody', ''],
      [581, 'Anti ssDNAAntibody', ''],
      [582, 'Anti ssDNAAntibody', ''],
      [583, 'Anti ssDNAAntibody', 'Lab-authored format'],
      [584, 'Anti ds DNAAntibody', ''],
      [585, 'Anti ssDNAAntibody', ''],
    ]) {
      await db.run('INSERT INTO tests (id,name,category,report_body) VALUES (?,?,?,?)', [id, name, 'Imported legacy catalogue', body]);
      if (id !== 585) await db.run("INSERT INTO test_parameters (test_id,parameter_name,unit,normal_range,entry_mode,display_order) VALUES (?,'Result','','','manual',1)", [id]);
    }
    await db.run('INSERT INTO visit_tests (test_id) VALUES (?)', [581]);
    await db.run("UPDATE test_parameters SET normal_range='Custom cut-off' WHERE test_id=582");

    await ensureAntiSsDnaAntibodyTestConfiguration(db);
    await ensureAntiSsDnaAntibodyTestConfiguration(db);

    const expectedNames = ['Anti-ssDNA Antibody', 'Assay Method / Platform', 'Laboratory Interpretation', 'Comments'];
    for (const id of [580, 585]) {
      assert.equal((await db.get('SELECT sample_type FROM tests WHERE id=?', [id])).sample_type, 'Serum');
      const fields = await db.all('SELECT parameter_name,normal_range FROM test_parameters WHERE test_id=? ORDER BY display_order', [id]);
      assert.deepEqual(fields.map(field => field.parameter_name), expectedNames);
      assert.equal(fields[0].normal_range, 'Assay-specific reference interval');
    }
    assert.equal((await db.get('SELECT parameter_name FROM test_parameters WHERE test_id=581')).parameter_name, 'Result');
    assert.equal((await db.get('SELECT normal_range FROM test_parameters WHERE test_id=582')).normal_range, 'Custom cut-off');
    for (const id of [583, 584]) {
      assert.equal((await db.get('SELECT sample_type FROM tests WHERE id=?', [id])).sample_type, null);
      assert.equal((await db.get('SELECT parameter_name FROM test_parameters WHERE test_id=?', [id])).parameter_name, 'Result');
    }
  } finally {
    await db.close();
  }
});

test('Anti-Histone Antibody fills the blank entry but preserves the configured duplicate', async () => {
  const db = await fixture();
  try {
    for (const [id, name, body] of [
      [600, 'Anti-Histone Antibody', ''],
      [601, 'Anti-Histone Antibody', ''],
      [602, 'Anti-Histone Antibodies', ''],
      [603, 'Anti-Histone Antibody', 'Lab-authored format'],
      [604, 'Anti-Chromatin Antibody', ''],
      [605, 'Anti-Histone Antibody', ''],
    ]) {
      await db.run('INSERT INTO tests (id,name,category,report_body) VALUES (?,?,?,?)', [id, name, 'Immunology', body]);
      if (id !== 605) await db.run("INSERT INTO test_parameters (test_id,parameter_name,unit,normal_range,entry_mode,display_order) VALUES (?,'Result','','','manual',1)", [id]);
    }
    await db.run('INSERT INTO visit_tests (test_id) VALUES (?)', [601]);
    await db.run("UPDATE tests SET sample_type='Serum (1 ml)' WHERE id=602");
    await db.run("UPDATE test_parameters SET parameter_name='ANTI-HISTONE ANTIBODIES',unit='Units',normal_range='< 1.00' WHERE test_id=602");

    await ensureAntiHistoneAntibodyTestConfiguration(db);
    await ensureAntiHistoneAntibodyTestConfiguration(db);

    const expectedNames = ['Anti-Histone Antibody', 'Assay Method / Platform', 'Laboratory Interpretation', 'Comments'];
    for (const id of [600, 605]) {
      assert.equal((await db.get('SELECT sample_type FROM tests WHERE id=?', [id])).sample_type, 'Serum');
      const fields = await db.all('SELECT parameter_name,normal_range FROM test_parameters WHERE test_id=? ORDER BY display_order', [id]);
      assert.deepEqual(fields.map(field => field.parameter_name), expectedNames);
      assert.equal(fields[0].normal_range, 'Assay-specific negative cut-off');
    }
    assert.equal((await db.get('SELECT parameter_name FROM test_parameters WHERE test_id=601')).parameter_name, 'Result');
    assert.deepEqual(await db.all('SELECT parameter_name,unit,normal_range FROM test_parameters WHERE test_id=602'), [
      { parameter_name: 'ANTI-HISTONE ANTIBODIES', unit: 'Units', normal_range: '< 1.00' },
    ]);
    assert.equal((await db.get('SELECT sample_type FROM tests WHERE id=602')).sample_type, 'Serum (1 ml)');
    for (const id of [603, 604]) {
      assert.equal((await db.get('SELECT parameter_name FROM test_parameters WHERE test_id=?', [id])).parameter_name, 'Result');
    }
  } finally {
    await db.close();
  }
});

test('Anti-Ribosomal P Antibody fills only its unused blank entry', async () => {
  const db = await fixture();
  try {
    for (const [id, name, body] of [
      [620, 'Anti-Ribosomal P Antibody', ''],
      [621, 'Anti-Ribosomal P Antibody', ''],
      [622, 'Ribosome P Antibodies', ''],
      [623, 'Anti-Ribosomal P Antibody', 'Lab-authored format'],
      [624, 'Anti-Ribosomal P Antibody', ''],
    ]) {
      await db.run('INSERT INTO tests (id,name,category,report_body) VALUES (?,?,?,?)', [id, name, 'Immunology', body]);
      if (id !== 624) await db.run("INSERT INTO test_parameters (test_id,parameter_name,unit,normal_range,entry_mode,display_order) VALUES (?,'Result','','','manual',1)", [id]);
    }
    await db.run('INSERT INTO visit_tests (test_id) VALUES (?)', [621]);
    await db.run("UPDATE tests SET sample_type='Serum (1 ml)' WHERE id=622");
    await db.run("UPDATE test_parameters SET parameter_name='Ribosome P Antibodies, IgG',unit='U',normal_range='< 1.0' WHERE test_id=622");

    await ensureAntiRibosomalPAntibodyTestConfiguration(db);
    await ensureAntiRibosomalPAntibodyTestConfiguration(db);

    const expectedNames = ['Anti-Ribosomal P Antibody', 'Assay Method / Platform', 'Laboratory Interpretation', 'Comments'];
    for (const id of [620, 624]) {
      assert.equal((await db.get('SELECT sample_type FROM tests WHERE id=?', [id])).sample_type, 'Serum');
      const fields = await db.all('SELECT parameter_name,normal_range FROM test_parameters WHERE test_id=? ORDER BY display_order', [id]);
      assert.deepEqual(fields.map(field => field.parameter_name), expectedNames);
      assert.equal(fields[0].normal_range, 'Assay-specific negative cut-off');
    }
    assert.equal((await db.get('SELECT parameter_name FROM test_parameters WHERE test_id=621')).parameter_name, 'Result');
    assert.deepEqual(await db.all('SELECT parameter_name,unit,normal_range FROM test_parameters WHERE test_id=622'), [
      { parameter_name: 'Ribosome P Antibodies, IgG', unit: 'U', normal_range: '< 1.0' },
    ]);
    assert.equal((await db.get('SELECT sample_type FROM tests WHERE id=622')).sample_type, 'Serum (1 ml)');
    assert.equal((await db.get('SELECT parameter_name FROM test_parameters WHERE test_id=623')).parameter_name, 'Result');
  } finally {
    await db.close();
  }
});

test('AntiCCPAB fills its placeholder without changing the copied Anti CCP assay', async () => {
  const db = await fixture();
  try {
    for (const [id, name, body] of [
      [640, 'AntiCCPAB', ''],
      [641, 'AntiCCPAB', ''],
      [642, 'Anti Cyclic-Citrullinated-Peptide (Anti CCP)', ''],
      [643, 'AntiCCPAB', 'Lab-authored format'],
      [644, 'AntiCCPAB', ''],
    ]) {
      await db.run('INSERT INTO tests (id,name,category,report_body) VALUES (?,?,?,?)', [id, name, 'Immunology', body]);
      if (id !== 644) await db.run("INSERT INTO test_parameters (test_id,parameter_name,unit,normal_range,entry_mode,display_order) VALUES (?,'Result','','','manual',1)", [id]);
    }
    await db.run('INSERT INTO visit_tests (test_id) VALUES (?)', [641]);
    await db.run("UPDATE tests SET sample_type='Serum' WHERE id=642");
    await db.run("UPDATE test_parameters SET parameter_name='ANTI CCP (CYCLIC CITRULLINATED PEPTIDE), SERUM',unit='U/mL',normal_range='< 5.00' WHERE test_id=642");

    await ensureAntiCcpAbTestConfiguration(db);
    await ensureAntiCcpAbTestConfiguration(db);

    const expectedNames = ['Anti-CCP Antibody', 'Assay Method / Platform', 'Laboratory Interpretation', 'Comments'];
    for (const id of [640, 644]) {
      assert.equal((await db.get('SELECT sample_type FROM tests WHERE id=?', [id])).sample_type, 'Serum');
      const fields = await db.all('SELECT parameter_name,normal_range FROM test_parameters WHERE test_id=? ORDER BY display_order', [id]);
      assert.deepEqual(fields.map(field => field.parameter_name), expectedNames);
      assert.equal(fields[0].normal_range, 'Assay-specific negative cut-off');
    }
    assert.equal((await db.get('SELECT parameter_name FROM test_parameters WHERE test_id=641')).parameter_name, 'Result');
    assert.deepEqual(await db.all('SELECT parameter_name,unit,normal_range FROM test_parameters WHERE test_id=642'), [
      { parameter_name: 'ANTI CCP (CYCLIC CITRULLINATED PEPTIDE), SERUM', unit: 'U/mL', normal_range: '< 5.00' },
    ]);
    assert.equal((await db.get('SELECT parameter_name FROM test_parameters WHERE test_id=643')).parameter_name, 'Result');
  } finally {
    await db.close();
  }
});

test('AntiSpermAntibody repairs only unused placeholders and leaves specimen unspecified', async () => {
  const db = await fixture();
  try {
    for (const [id, name, body] of [
      [660, 'AntiSpermAntibody', ''],
      [661, 'AntiSpermAntibody', ''],
      [662, 'AntiSpermAntibody', ''],
      [663, 'AntiSpermAntibody', 'Lab-authored format'],
      [664, 'Semen Analysis - Seminogram', ''],
      [665, 'AntiSpermAntibody', ''],
    ]) {
      await db.run('INSERT INTO tests (id,name,category,report_body) VALUES (?,?,?,?)', [id, name, 'Imported legacy catalogue', body]);
      if (id !== 665) await db.run("INSERT INTO test_parameters (test_id,parameter_name,unit,normal_range,entry_mode,display_order) VALUES (?,'Result','','','manual',1)", [id]);
    }
    await db.run('INSERT INTO visit_tests (test_id) VALUES (?)', [661]);
    await db.run("UPDATE test_parameters SET normal_range='Custom criterion' WHERE test_id=662");

    await ensureAntiSpermAntibodyTestConfiguration(db);
    await ensureAntiSpermAntibodyTestConfiguration(db);

    const expectedNames = ['Specimen / Matrix', 'Assay Method / Platform', 'Antibody Class', 'Anti-Sperm Antibody Result', 'Laboratory Interpretation', 'Comments'];
    for (const id of [660, 665]) {
      assert.equal((await db.get('SELECT sample_type FROM tests WHERE id=?', [id])).sample_type, null);
      const fields = await db.all('SELECT parameter_name,normal_range FROM test_parameters WHERE test_id=? ORDER BY display_order', [id]);
      assert.deepEqual(fields.map(field => field.parameter_name), expectedNames);
      assert.equal(fields[3].normal_range, 'Specimen- and assay-specific criterion');
    }
    assert.equal((await db.get('SELECT parameter_name FROM test_parameters WHERE test_id=661')).parameter_name, 'Result');
    assert.equal((await db.get('SELECT normal_range FROM test_parameters WHERE test_id=662')).normal_range, 'Custom criterion');
    for (const id of [663, 664]) {
      assert.equal((await db.get('SELECT parameter_name FROM test_parameters WHERE test_id=?', [id])).parameter_name, 'Result');
    }
  } finally {
    await db.close();
  }
});

test('ApolipoproteinA1 fills only its unused serum placeholder and preserves ApoB', async () => {
  const db = await fixture();
  try {
    for (const [id, name, body] of [
      [680, 'ApolipoproteinA1', ''],
      [681, 'ApolipoproteinA1', ''],
      [682, 'ApolipoproteinA1', ''],
      [683, 'ApolipoproteinA1', 'Lab-authored format'],
      [684, 'Apolipoprotein B', ''],
      [685, 'ApolipoproteinA1', ''],
      [686, 'ApolipoproteinA1', ''],
    ]) {
      await db.run('INSERT INTO tests (id,name,category,report_body) VALUES (?,?,?,?)', [id, name, 'Imported legacy catalogue', body]);
      if (id !== 685) await db.run("INSERT INTO test_parameters (test_id,parameter_name,unit,normal_range,entry_mode,display_order) VALUES (?,'Result','','','manual',1)", [id]);
    }
    await db.run('INSERT INTO visit_tests (test_id) VALUES (?)', [681]);
    await db.run("UPDATE test_parameters SET normal_range='Custom interval' WHERE test_id=682");
    await db.run("UPDATE tests SET sample_type='Plasma' WHERE id=686");

    await ensureApolipoproteinA1TestConfiguration(db);
    await ensureApolipoproteinA1TestConfiguration(db);

    const expectedNames = ['Apolipoprotein A1, Serum', 'Assay Method / Platform', 'Laboratory Interpretation', 'Comments'];
    for (const id of [680, 685]) {
      assert.equal((await db.get('SELECT sample_type FROM tests WHERE id=?', [id])).sample_type, 'Serum');
      const fields = await db.all('SELECT parameter_name,unit,normal_range FROM test_parameters WHERE test_id=? ORDER BY display_order', [id]);
      assert.deepEqual(fields.map(field => field.parameter_name), expectedNames);
      assert.equal(fields[0].unit, 'mg/dL');
      assert.equal(fields[0].normal_range, 'Age- and sex-specific laboratory interval');
    }
    assert.equal((await db.get('SELECT parameter_name FROM test_parameters WHERE test_id=681')).parameter_name, 'Result');
    assert.equal((await db.get('SELECT normal_range FROM test_parameters WHERE test_id=682')).normal_range, 'Custom interval');
    for (const id of [683, 684, 686]) {
      assert.equal((await db.get('SELECT parameter_name FROM test_parameters WHERE test_id=?', [id])).parameter_name, 'Result');
    }
    assert.equal((await db.get('SELECT sample_type FROM tests WHERE id=686')).sample_type, 'Plasma');
  } finally {
    await db.close();
  }
});

test('Arsenic (Urine) repairs only unused blank urine placeholders', async () => {
  const db = await fixture();
  try {
    for (const [id, name, body] of [
      [690, 'Arsenic (Urine)', ''],
      [691, 'Arsenic (Urine)', ''],
      [692, 'Arsenic (Urine)', ''],
      [693, 'Arsenic (Urine)', 'Lab-authored format'],
      [694, 'Arsenic (Blood)', ''],
      [695, 'Arsenic (Urine)', ''],
      [696, 'Arsenic (Urine)', ''],
    ]) {
      await db.run('INSERT INTO tests (id,name,category,report_body) VALUES (?,?,?,?)', [id, name, 'Imported legacy catalogue', body]);
      if (id !== 695) await db.run("INSERT INTO test_parameters (test_id,parameter_name,unit,normal_range,entry_mode,display_order) VALUES (?,'Result','','','manual',1)", [id]);
    }
    await db.run('INSERT INTO visit_tests (test_id) VALUES (?)', [691]);
    await db.run("UPDATE test_parameters SET normal_range='Custom interval' WHERE test_id=692");
    await db.run("UPDATE tests SET sample_type='Blood' WHERE id=696");

    await ensureUrineArsenicTestConfiguration(db);
    await ensureUrineArsenicTestConfiguration(db);

    const expectedNames = [
      'Collection Type / Duration', 'Arsenic, Total, Urine', 'Assay Method / Platform',
      'Laboratory Interpretation', 'Comments',
    ];
    for (const id of [690, 695]) {
      assert.equal((await db.get('SELECT sample_type FROM tests WHERE id=?', [id])).sample_type, 'Urine');
      const fields = await db.all('SELECT parameter_name,unit,normal_range FROM test_parameters WHERE test_id=? ORDER BY display_order', [id]);
      assert.deepEqual(fields.map(field => field.parameter_name), expectedNames);
      assert.equal(fields[1].unit, 'mcg/L');
      assert.equal(fields[1].normal_range, 'Collection- and method-specific laboratory interval');
    }
    assert.equal((await db.get('SELECT parameter_name FROM test_parameters WHERE test_id=691')).parameter_name, 'Result');
    assert.equal((await db.get('SELECT normal_range FROM test_parameters WHERE test_id=692')).normal_range, 'Custom interval');
    for (const id of [693, 694, 696]) {
      assert.equal((await db.get('SELECT parameter_name FROM test_parameters WHERE test_id=?', [id])).parameter_name, 'Result');
    }
    assert.equal((await db.get('SELECT sample_type FROM tests WHERE id=696')).sample_type, 'Blood');
  } finally {
    await db.close();
  }
});

test('Arthritis Profile fills only unused unbundled serum placeholders', async () => {
  const db = await fixture();
  try {
    for (const [id, name, body] of [
      [700, 'Arthritis Profile', ''],
      [701, 'Arthritis Profile', ''],
      [702, 'Arthritis Profile', ''],
      [703, 'Arthritis Profile', 'Lab-authored format'],
      [704, 'Rheumatoid Factor, RA', ''],
      [705, 'Arthritis Profile', ''],
      [706, 'Arthritis Profile', ''],
      [707, 'Arthritis Profile', ''],
    ]) {
      await db.run('INSERT INTO tests (id,name,category,report_body) VALUES (?,?,?,?)', [id, name, 'Imported legacy catalogue', body]);
      if (id !== 705) await db.run("INSERT INTO test_parameters (test_id,parameter_name,unit,normal_range,entry_mode,display_order) VALUES (?,'Result','','','manual',1)", [id]);
    }
    await db.run('INSERT INTO visit_tests (test_id) VALUES (?)', [701]);
    await db.run("UPDATE test_parameters SET normal_range='Custom interval' WHERE test_id=702");
    await db.run("UPDATE tests SET sample_type='Blood' WHERE id=706");
    await db.run('INSERT INTO test_bundle_items (bundle_test_id, component_test_id) VALUES (?,?)', [707, 704]);

    await ensureArthritisProfileTestConfiguration(db);
    await ensureArthritisProfileTestConfiguration(db);

    const expectedNames = [
      'Serum Uric Acid', 'Rheumatoid Factor, RA', 'C-Reactive Protein, CRP',
      'Antistreptolysin O, ASO Titer', 'iCalcium', 'Total Calcium', 'Serum Phosphorus', 'Comments',
    ];
    for (const id of [700, 705]) {
      assert.equal((await db.get('SELECT sample_type FROM tests WHERE id=?', [id])).sample_type, 'Serum');
      const fields = await db.all('SELECT parameter_name,unit,normal_range FROM test_parameters WHERE test_id=? ORDER BY display_order', [id]);
      assert.deepEqual(fields.map(field => field.parameter_name), expectedNames);
      assert.equal(fields[2].unit, 'mg/L');
      assert.equal(fields[6].normal_range, 'Age-specific laboratory interval');
    }
    assert.equal((await db.get('SELECT parameter_name FROM test_parameters WHERE test_id=701')).parameter_name, 'Result');
    assert.equal((await db.get('SELECT normal_range FROM test_parameters WHERE test_id=702')).normal_range, 'Custom interval');
    for (const id of [703, 704, 706, 707]) {
      assert.equal((await db.get('SELECT parameter_name FROM test_parameters WHERE test_id=?', [id])).parameter_name, 'Result');
    }
    assert.equal((await db.get('SELECT sample_type FROM tests WHERE id=706')).sample_type, 'Blood');
  } finally {
    await db.close();
  }
});

test('Ascitic Fluids Gram Stain expands only unused generic microscopy fields and preserves their IDs', async () => {
  const db = await fixture();
  try {
    for (const [id, name, body] of [
      [710, 'Ascitic Fluids Gram Stain', ''],
      [711, 'Ascitic Fluids Gram Stain', ''],
      [712, 'Ascitic Fluids Gram Stain', ''],
      [713, 'Ascitic Fluids Gram Stain', 'Lab-authored format'],
      [714, 'Peritonial Fluid Gram stain', ''],
      [715, 'Ascitic Fluids Gram Stain', ''],
      [716, 'Ascitic Fluids Gram Stain', ''],
      [717, 'Ascitic Fluids Gram Stain', ''],
      [718, 'Ascitic Fluids Gram Stain', ''],
    ]) {
      await db.run('INSERT INTO tests (id,name,category,report_body) VALUES (?,?,?,?)', [id, name, 'Imported legacy catalogue', body]);
      const names = id === 715 ? [] : id === 717 ? ['Result'] : ['Findings', 'Impression', 'Comments'];
      for (const [index, fieldName] of names.entries()) {
        await db.run(
          'INSERT INTO test_parameters (test_id,parameter_name,unit,normal_range,entry_mode,display_order) VALUES (?,?,?,?,?,?)',
          [id, fieldName, '', '', 'manual', index + 1]
        );
      }
    }
    const originalIds = (await db.all('SELECT id FROM test_parameters WHERE test_id=? ORDER BY display_order', [710])).map(field => field.id);
    await db.run('INSERT INTO visit_tests (test_id) VALUES (?)', [711]);
    await db.run("UPDATE test_parameters SET unit='Lab custom' WHERE test_id=712 AND parameter_name='Findings'");
    await db.run("UPDATE tests SET sample_type='Blood' WHERE id=716");
    await db.run('INSERT INTO test_bundle_items (bundle_test_id,component_test_id) VALUES (?,?)', [718, 714]);

    await ensureAsciticFluidGramStainTestConfiguration(db);
    await ensureAsciticFluidGramStainTestConfiguration(db);

    const expected = [
      'Specimen / Site', 'Smear Method / Preparation', 'Inflammatory Cells / PMNs',
      'Gram Stain Findings', 'Gram Reaction / Bacterial Morphology', 'Impression', 'Comments',
    ];
    for (const id of [710, 715, 717]) {
      assert.equal((await db.get('SELECT sample_type FROM tests WHERE id=?', [id])).sample_type, 'Ascitic Fluid');
      const fields = await db.all('SELECT id,parameter_name,normal_range FROM test_parameters WHERE test_id=? ORDER BY display_order', [id]);
      assert.deepEqual(fields.map(field => field.parameter_name), expected);
      assert.ok(fields.every(field => !field.normal_range));
      if (id === 710) assert.deepEqual([fields[3].id, fields[5].id, fields[6].id], originalIds);
    }
    for (const id of [711, 712, 713, 714, 716, 718]) {
      assert.deepEqual(
        (await db.all('SELECT parameter_name FROM test_parameters WHERE test_id=? ORDER BY display_order', [id])).map(field => field.parameter_name),
        ['Findings', 'Impression', 'Comments']
      );
    }
    assert.equal((await db.get('SELECT unit FROM test_parameters WHERE test_id=712 AND parameter_name=?', ['Findings'])).unit, 'Lab custom');
    assert.equal((await db.get('SELECT sample_type FROM tests WHERE id=716')).sample_type, 'Blood');
  } finally {
    await db.close();
  }
});

test('AsciticFluidforProtein upgrades only unused blank placeholders without changing general body-fluid protein', async () => {
  const db = await fixture();
  try {
    for (const [id, name, body] of [
      [720, 'AsciticFluidforProtein', ''],
      [721, 'AsciticFluidforProtein', ''],
      [722, 'AsciticFluidforProtein', ''],
      [723, 'AsciticFluidforProtein', 'Lab-authored format'],
      [724, 'Body Fluides for Proein', ''],
      [725, 'AsciticFluidforProtein', ''],
      [726, 'AsciticFluidforProtein', ''],
      [727, 'AsciticFluidforProtein', ''],
    ]) {
      await db.run('INSERT INTO tests (id,name,category,report_body) VALUES (?,?,?,?)', [id, name, 'Imported legacy catalogue', body]);
      if (id !== 725) await db.run("INSERT INTO test_parameters (test_id,parameter_name,unit,normal_range,entry_mode,display_order) VALUES (?,'Result','','','manual',1)", [id]);
    }
    const originalId = (await db.get('SELECT id FROM test_parameters WHERE test_id=?', [720])).id;
    await db.run('INSERT INTO visit_tests (test_id) VALUES (?)', [721]);
    await db.run("UPDATE test_parameters SET unit='Lab custom' WHERE test_id=722");
    await db.run("UPDATE tests SET sample_type='Pleural Fluid' WHERE id=726");
    await db.run('INSERT INTO test_bundle_items (bundle_test_id,component_test_id) VALUES (?,?)', [727, 724]);

    await ensureAsciticFluidTotalProteinTestConfiguration(db);
    await ensureAsciticFluidTotalProteinTestConfiguration(db);

    const expected = ['Ascitic Fluid Total Protein', 'Specimen / Site', 'Appearance', 'Method / Analyzer', 'Comments'];
    for (const id of [720, 725]) {
      assert.equal((await db.get('SELECT sample_type FROM tests WHERE id=?', [id])).sample_type, 'Ascitic Fluid');
      const fields = await db.all('SELECT id,parameter_name,unit,normal_range FROM test_parameters WHERE test_id=? ORDER BY display_order', [id]);
      assert.deepEqual(fields.map(field => field.parameter_name), expected);
      assert.equal(fields[0].unit, 'g/dL');
      assert.equal(fields[0].normal_range, 'Interpretive; no universal reference interval');
      if (id === 720) assert.equal(fields[0].id, originalId);
    }
    for (const id of [721, 722, 723, 724, 726, 727]) {
      assert.equal((await db.get('SELECT parameter_name FROM test_parameters WHERE test_id=?', [id])).parameter_name, 'Result');
    }
    assert.equal((await db.get('SELECT unit FROM test_parameters WHERE test_id=722')).unit, 'Lab custom');
    assert.equal((await db.get('SELECT sample_type FROM tests WHERE id=726')).sample_type, 'Pleural Fluid');
  } finally {
    await db.close();
  }
});

test('Body Fluids Biochemistry upgrades only unused blank placeholders', async () => {
  const db = await fixture();
  try {
    for (const [id, name, body] of [
      [730, 'Body Fluids Biochemistry', ''],
      [731, 'Body Fluids Biochemistry', ''],
      [732, 'Body Fluids Biochemistry', ''],
      [733, 'Body Fluids Biochemistry', 'Lab-authored format'],
      [734, 'Body Fluid Biochemistry', ''],
      [735, 'Body Fluids Biochemistry', ''],
    ]) {
      await db.run('INSERT INTO tests (id,name,category,report_body) VALUES (?,?,?,?)', [id, name, 'Imported legacy catalogue', body]);
      if (id !== 734) await db.run("INSERT INTO test_parameters (test_id,parameter_name,unit,normal_range,entry_mode,display_order) VALUES (?,'Result','','','manual',1)", [id]);
    }
    const originalId = (await db.get('SELECT id FROM test_parameters WHERE test_id=?', [730])).id;
    await db.run('INSERT INTO visit_tests (test_id) VALUES (?)', [731]);
    await db.run("UPDATE test_parameters SET unit='Lab custom' WHERE test_id=732");
    await db.run("UPDATE tests SET sample_type='Pleural Fluid' WHERE id=735");

    await ensureBodyFluidBiochemistryTestConfiguration(db);
    await ensureBodyFluidBiochemistryTestConfiguration(db);

    const expected = [
      'Fluid Type / Source', 'Collection Date / Time', 'Appearance', 'Total Protein, Body Fluid',
      'Albumin, Body Fluid', 'Glucose, Body Fluid', 'LDH, Body Fluid',
      'Additional Biochemistry / Findings', 'Method / Analyzer', 'Comments',
    ];
    for (const id of [730, 734]) {
      assert.equal((await db.get('SELECT sample_type FROM tests WHERE id=?', [id])).sample_type, 'Body Fluid');
      const fields = await db.all('SELECT id,parameter_name,unit FROM test_parameters WHERE test_id=? ORDER BY display_order', [id]);
      assert.deepEqual(fields.map(field => field.parameter_name), expected);
      if (id === 730) assert.equal(fields[0].id, originalId);
    }
    for (const id of [731, 732, 733, 735]) {
      assert.equal((await db.get('SELECT parameter_name FROM test_parameters WHERE test_id=?', [id])).parameter_name, 'Result');
    }
    assert.equal((await db.get('SELECT unit FROM test_parameters WHERE test_id=?', [732])).unit, 'Lab custom');
  } finally {
    await db.close();
  }
});

test('BodyFluids for SpecificGravity upgrades only unused blank placeholders', async () => {
  const db = await fixture();
  try {
    for (const [id, body] of [[736, ''], [737, ''], [738, 'Lab-authored format'], [739, '']]) {
      await db.run('INSERT INTO tests (id,name,category,report_body) VALUES (?,?,?,?)', [id, 'BodyFluids for SpecificGravity', 'Imported legacy catalogue', body]);
      if (id !== 739) await db.run("INSERT INTO test_parameters (test_id,parameter_name,unit,normal_range,entry_mode,display_order) VALUES (?,'Result','','','manual',1)", [id]);
    }
    const originalId = (await db.get('SELECT id FROM test_parameters WHERE test_id=?', [736])).id;
    await db.run('INSERT INTO visit_tests (test_id) VALUES (?)', [737]);

    await ensureBodyFluidSpecificGravityTestConfiguration(db);
    await ensureBodyFluidSpecificGravityTestConfiguration(db);

    const expected = ['Specific Gravity, Body Fluid', 'Fluid Type / Source', 'Collection Date / Time', 'Appearance', 'Method / Instrument', 'Comments'];
    for (const id of [736, 739]) {
      assert.equal((await db.get('SELECT sample_type FROM tests WHERE id=?', [id])).sample_type, 'Body Fluid');
      assert.deepEqual((await db.all('SELECT parameter_name FROM test_parameters WHERE test_id=? ORDER BY display_order', [id])).map(field => field.parameter_name), expected);
    }
    assert.equal((await db.get('SELECT id FROM test_parameters WHERE test_id=? ORDER BY display_order', [736])).id, originalId);
    for (const id of [737, 738]) {
      assert.equal((await db.get('SELECT parameter_name FROM test_parameters WHERE test_id=?', [id])).parameter_name, 'Result');
    }
  } finally {
    await db.close();
  }
});

test('CSF chloride upgrades only unused blank CSF placeholders', async () => {
  const db = await fixture();
  try {
    for (const [id, name, body] of [
      [740, 'CSFFluidfor Chloride', ''],
      [741, 'CSF Fluid for Chloride', ''],
      [742, 'CSF Chloride', 'Lab-authored format'],
      [743, 'CSF Chloride', ''],
      [744, 'Body Fluids for Chloride', ''],
    ]) {
      await db.run('INSERT INTO tests (id,name,category,report_body) VALUES (?,?,?,?)', [id, name, 'Imported legacy catalogue', body]);
      if (id !== 743) await db.run("INSERT INTO test_parameters (test_id,parameter_name,unit,normal_range,entry_mode,display_order) VALUES (?,'Result','','','manual',1)", [id]);
    }
    const originalId = (await db.get('SELECT id FROM test_parameters WHERE test_id=?', [740])).id;
    await db.run('INSERT INTO visit_tests (test_id) VALUES (?)', [741]);

    await ensureCsfFluidChlorideTestConfiguration(db);
    await ensureCsfFluidChlorideTestConfiguration(db);

    const expected = ['Chloride, CSF', 'Collection Date / Time', 'Appearance', 'Method / Analyzer', 'Comments'];
    for (const id of [740, 743]) {
      assert.equal((await db.get('SELECT sample_type FROM tests WHERE id=?', [id])).sample_type, 'Cerebrospinal Fluid (CSF)');
      const fields = await db.all('SELECT id,parameter_name,unit,normal_range FROM test_parameters WHERE test_id=? ORDER BY display_order', [id]);
      assert.deepEqual(fields.map(field => field.parameter_name), expected);
      assert.equal(fields[0].unit, 'mmol/L');
      assert.equal(fields[0].normal_range, 'Laboratory-validated, age-specific reference interval');
    }
    assert.equal((await db.get('SELECT id FROM test_parameters WHERE test_id=? ORDER BY display_order', [740])).id, originalId);
    for (const id of [741, 742, 744]) {
      assert.equal((await db.get('SELECT parameter_name FROM test_parameters WHERE test_id=?', [id])).parameter_name, 'Result');
    }
  } finally {
    await db.close();
  }
});

test('CSF protein upgrades only unused blank CSF placeholders', async () => {
  const db = await fixture();
  try {
    for (const [id, name, body] of [
      [755, 'CSFFluidforProtein', ''],
      [756, 'CSF Fluid for Protein', ''],
      [757, 'CSF Protein', 'Lab-authored format'],
      [758, 'Protein, CSF', ''],
      [759, 'Body Fluids for Protein', ''],
    ]) {
      await db.run('INSERT INTO tests (id,name,category,report_body) VALUES (?,?,?,?)', [id, name, 'Imported legacy catalogue', body]);
      if (id !== 758) await db.run("INSERT INTO test_parameters (test_id,parameter_name,unit,normal_range,entry_mode,display_order) VALUES (?,'Result','','','manual',1)", [id]);
    }
    const originalId = (await db.get('SELECT id FROM test_parameters WHERE test_id=?', [755])).id;
    await db.run('INSERT INTO visit_tests (test_id) VALUES (?)', [756]);

    await ensureCsfFluidProteinTestConfiguration(db);
    await ensureCsfFluidProteinTestConfiguration(db);

    const expected = ['Total Protein, CSF', 'Collection Date / Time', 'Appearance', 'Method / Analyzer', 'Specimen Quality / Blood Contamination', 'Comments'];
    for (const id of [755, 758]) {
      assert.equal((await db.get('SELECT sample_type FROM tests WHERE id=?', [id])).sample_type, 'Cerebrospinal Fluid (CSF)');
      const fields = await db.all('SELECT id,parameter_name,unit,normal_range FROM test_parameters WHERE test_id=? ORDER BY display_order', [id]);
      assert.deepEqual(fields.map(field => field.parameter_name), expected);
      assert.equal(fields[0].unit, 'mg/dL');
      assert.equal(fields[0].normal_range, 'Laboratory-validated, age-specific reference interval');
    }
    assert.equal((await db.get('SELECT id FROM test_parameters WHERE test_id=? ORDER BY display_order', [755])).id, originalId);
    for (const id of [756, 757, 759]) {
      assert.equal((await db.get('SELECT parameter_name FROM test_parameters WHERE test_id=?', [id])).parameter_name, 'Result');
    }
  } finally {
    await db.close();
  }
});

test('CSF AFB stain upgrades only unused blank CSF placeholders', async () => {
  const db = await fixture();
  try {
    for (const [id, name, body] of [
      [745, 'CSFFluidforAFBStain', ''],
      [746, 'CSF Fluid for AFB Stain', ''],
      [747, 'CSF AFB Stain', 'Lab-authored format'],
      [748, 'AFB Stain, CSF', ''],
      [749, 'AFB (Z-N Stain)', ''],
    ]) {
      await db.run('INSERT INTO tests (id,name,category,report_body) VALUES (?,?,?,?)', [id, name, 'Imported legacy catalogue', body]);
      if (id !== 748) await db.run("INSERT INTO test_parameters (test_id,parameter_name,unit,normal_range,entry_mode,display_order) VALUES (?,'Result','','','manual',1)", [id]);
    }
    const originalId = (await db.get('SELECT id FROM test_parameters WHERE test_id=?', [745])).id;
    await db.run('INSERT INTO visit_tests (test_id) VALUES (?)', [746]);

    await ensureCsfFluidAfbStainTestConfiguration(db);
    await ensureCsfFluidAfbStainTestConfiguration(db);

    const expected = ['AFB Smear Microscopy Result', 'AFB Smear Grade / Quantitation', 'Stain Method', 'Specimen Adequacy / Volume', 'Microscopy Remarks', 'Culture / Molecular Test Status', 'Comments'];
    for (const id of [745, 748]) {
      assert.equal((await db.get('SELECT sample_type FROM tests WHERE id=?', [id])).sample_type, 'Cerebrospinal Fluid (CSF)');
      assert.deepEqual((await db.all('SELECT parameter_name FROM test_parameters WHERE test_id=? ORDER BY display_order', [id])).map(field => field.parameter_name), expected);
    }
    assert.equal((await db.get('SELECT id FROM test_parameters WHERE test_id=? ORDER BY display_order', [745])).id, originalId);
    for (const id of [746, 747, 749]) {
      assert.equal((await db.get('SELECT parameter_name FROM test_parameters WHERE test_id=?', [id])).parameter_name, 'Result');
    }
  } finally {
    await db.close();
  }
});

test('CSF Gram stain upgrades only unused blank CSF placeholders', async () => {
  const db = await fixture();
  try {
    for (const [id, name, body] of [
      [750, 'CSFFluidforGramstain', ''],
      [751, 'CSF Fluid for Gram stain', ''],
      [752, 'CSF Gram Stain', 'Lab-authored format'],
      [753, 'Gram Stain, CSF', ''],
      [754, 'Ascitic Fluids Gram Stain', ''],
    ]) {
      await db.run('INSERT INTO tests (id,name,category,report_body) VALUES (?,?,?,?)', [id, name, 'Imported legacy catalogue', body]);
      if (id !== 753) await db.run("INSERT INTO test_parameters (test_id,parameter_name,unit,normal_range,entry_mode,display_order) VALUES (?,'Result','','','manual',1)", [id]);
    }
    const originalId = (await db.get('SELECT id FROM test_parameters WHERE test_id=?', [750])).id;
    await db.run('INSERT INTO visit_tests (test_id) VALUES (?)', [751]);

    await ensureCsfFluidGramStainTestConfiguration(db);
    await ensureCsfFluidGramStainTestConfiguration(db);

    const expected = ['Specimen / Collection Site', 'Smear Method / Preparation', 'Inflammatory Cells / PMNs', 'Gram Stain Findings', 'Gram Reaction / Bacterial Morphology', 'Impression', 'Culture / Molecular Test Status', 'Comments'];
    for (const id of [750, 753]) {
      assert.equal((await db.get('SELECT sample_type FROM tests WHERE id=?', [id])).sample_type, 'Cerebrospinal Fluid (CSF)');
      assert.deepEqual((await db.all('SELECT parameter_name FROM test_parameters WHERE test_id=? ORDER BY display_order', [id])).map(field => field.parameter_name), expected);
    }
    assert.equal((await db.get('SELECT id FROM test_parameters WHERE test_id=? ORDER BY display_order', [750])).id, originalId);
    for (const id of [751, 752, 754]) {
      assert.equal((await db.get('SELECT parameter_name FROM test_parameters WHERE test_id=?', [id])).parameter_name, 'Result');
    }
  } finally {
    await db.close();
  }
});

test('C3 (Complement-3) upgrades only unused blank placeholders', async () => {
  const db = await fixture();
  try {
    for (const [id, name, body] of [
      [809, 'C3 (Complement-3)', ''],
      [810, 'C3 (Complement-3)', ''],
      [811, 'C3 (Complement-3)', 'Lab-authored format'],
      [812, 'C3 (Complement-3)', ''],
      [813, 'C4 (Complement-4)', ''],
    ]) {
      await db.run('INSERT INTO tests (id,name,category,report_body) VALUES (?,?,?,?)', [id, name, 'Imported legacy catalogue', body]);
      if (id !== 812) await db.run("INSERT INTO test_parameters (test_id,parameter_name,unit,normal_range,entry_mode,display_order) VALUES (?,'Result','','','manual',1)", [id]);
    }
    const originalId = (await db.get('SELECT id FROM test_parameters WHERE test_id=?', [809])).id;
    await db.run('INSERT INTO visit_tests (test_id) VALUES (?)', [810]);
    await db.run("UPDATE test_parameters SET normal_range='Lab custom' WHERE test_id=811");

    await ensureComplementC3TestConfiguration(db);
    await ensureComplementC3TestConfiguration(db);

    const expected = ['Complement C3, Serum', 'Specimen', 'Collection Date / Time', 'Method / Analyzer', 'Clinical Indication', 'Comments'];
    for (const id of [809, 812]) {
      assert.equal((await db.get('SELECT sample_type FROM tests WHERE id=?', [id])).sample_type, 'Serum');
      assert.deepEqual((await db.all('SELECT parameter_name FROM test_parameters WHERE test_id=? ORDER BY display_order', [id])).map(field => field.parameter_name), expected);
    }
    assert.equal((await db.get('SELECT id FROM test_parameters WHERE test_id=? ORDER BY display_order', [809])).id, originalId);
    for (const id of [810, 811, 813]) {
      assert.equal((await db.get('SELECT parameter_name FROM test_parameters WHERE test_id=?', [id])).parameter_name, 'Result');
    }
    assert.equal((await db.get('SELECT normal_range FROM test_parameters WHERE test_id=?', [811])).normal_range, 'Lab custom');
  } finally {
    await db.close();
  }
});

test('C4 (Complement-4) upgrades only unused blank placeholders', async () => {
  const db = await fixture();
  try {
    for (const [id, name, body] of [
      [814, 'C4 (Complement-4)', ''],
      [815, 'C4 (Complement-4)', ''],
      [816, 'C4 (Complement-4)', 'Lab-authored format'],
      [817, 'C4 (Complement-4)', ''],
      [818, 'C3 (Complement-3)', ''],
    ]) {
      await db.run('INSERT INTO tests (id,name,category,report_body) VALUES (?,?,?,?)', [id, name, 'Imported legacy catalogue', body]);
      if (id !== 817) await db.run("INSERT INTO test_parameters (test_id,parameter_name,unit,normal_range,entry_mode,display_order) VALUES (?,'Result','','','manual',1)", [id]);
    }
    const originalId = (await db.get('SELECT id FROM test_parameters WHERE test_id=?', [814])).id;
    await db.run('INSERT INTO visit_tests (test_id) VALUES (?)', [815]);
    await db.run("UPDATE test_parameters SET unit='Lab custom' WHERE test_id=816");

    await ensureComplementC4TestConfiguration(db);
    await ensureComplementC4TestConfiguration(db);

    const expected = ['Complement C4, Serum', 'Specimen', 'Collection Date / Time', 'Method / Analyzer', 'Clinical Indication', 'Comments'];
    for (const id of [814, 817]) {
      assert.equal((await db.get('SELECT sample_type FROM tests WHERE id=?', [id])).sample_type, 'Serum');
      assert.deepEqual((await db.all('SELECT parameter_name FROM test_parameters WHERE test_id=? ORDER BY display_order', [id])).map(field => field.parameter_name), expected);
    }
    assert.equal((await db.get('SELECT id FROM test_parameters WHERE test_id=? ORDER BY display_order', [814])).id, originalId);
    for (const id of [815, 816, 818]) {
      assert.equal((await db.get('SELECT parameter_name FROM test_parameters WHERE test_id=?', [id])).parameter_name, 'Result');
    }
    assert.equal((await db.get('SELECT unit FROM test_parameters WHERE test_id=?', [816])).unit, 'Lab custom');
  } finally {
    await db.close();
  }
});

test('C ANCA (Anti-PR3) upgrades only unused blank placeholders', async () => {
  const db = await fixture();
  try {
    for (const [id, name, body] of [
      [819, 'C ANCA (Anti-PR3)', ''],
      [820, 'C ANCA (Anti-PR3)', ''],
      [821, 'C ANCA (Anti-PR3)', 'Lab-authored format'],
      [822, 'C ANCA (Anti-PR3)', ''],
      [823, 'P ANCA (Anti - PR3)', ''],
    ]) {
      await db.run('INSERT INTO tests (id,name,category,report_body) VALUES (?,?,?,?)', [id, name, 'Imported legacy catalogue', body]);
      if (id !== 822) await db.run("INSERT INTO test_parameters (test_id,parameter_name,unit,normal_range,entry_mode,display_order) VALUES (?,'Result','','','manual',1)", [id]);
    }
    const originalId = (await db.get('SELECT id FROM test_parameters WHERE test_id=?', [819])).id;
    await db.run('INSERT INTO visit_tests (test_id) VALUES (?)', [820]);
    await db.run("UPDATE test_parameters SET unit='Lab custom' WHERE test_id=821");

    await ensureCancaAntiPr3TestConfiguration(db);
    await ensureCancaAntiPr3TestConfiguration(db);

    const expected = ['cANCA (IIF) Result / Pattern', 'Anti-PR3 Antibody, IgG', 'Titre / Endpoint Dilution', 'Specimen', 'Method / Analyzer', 'Clinical Details / Indication', 'Comments'];
    for (const id of [819, 822]) {
      assert.equal((await db.get('SELECT sample_type FROM tests WHERE id=?', [id])).sample_type, 'Serum');
      assert.deepEqual((await db.all('SELECT parameter_name FROM test_parameters WHERE test_id=? ORDER BY display_order', [id])).map(field => field.parameter_name), expected);
    }
    assert.equal((await db.get('SELECT id FROM test_parameters WHERE test_id=? ORDER BY display_order', [819])).id, originalId);
    for (const id of [820, 821, 823]) {
      assert.equal((await db.get('SELECT parameter_name FROM test_parameters WHERE test_id=?', [id])).parameter_name, 'Result');
    }
    assert.equal((await db.get('SELECT unit FROM test_parameters WHERE test_id=?', [821])).unit, 'Lab custom');
  } finally {
    await db.close();
  }
});

test('BACTEC aerobic culture expands only unused generic fields, preserving specimen and anaerobic culture', async () => {
  const db = await fixture();
  try {
    for (const [id, name, body] of [
      [740, 'Bactec Culture for Aerobic Bacteria', ''],
      [741, 'Bactec Culture for Aerobic Bacteria', ''],
      [742, 'Bactec Culture for Aerobic Bacteria', ''],
      [743, 'Bactec Culture for Aerobic Bacteria', 'Lab-authored format'],
      [744, 'BactecCultureforAnaerobic Bacteria', ''],
      [745, 'Bactec Culture for Aerobic Bacteria', ''],
      [746, 'Bactec Culture for Aerobic Bacteria', ''],
      [747, 'Bactec Culture for Aerobic Bacteria', ''],
      [748, 'Bactec Culture for Aerobic Bacteria', ''],
    ]) {
      await db.run('INSERT INTO tests (id,name,category,report_body) VALUES (?,?,?,?)', [id, name, 'Imported legacy catalogue', body]);
      const names = id === 745 ? [] : id === 746 ? ['Result'] : [
        'Culture Result', 'Organism Isolated', 'Antibiotic Sensitivity', 'Comments',
      ];
      for (const [index, fieldName] of names.entries()) {
        await db.run(
          'INSERT INTO test_parameters (test_id,parameter_name,unit,normal_range,entry_mode,display_order) VALUES (?,?,?,?,?,?)',
          [id, fieldName, '', '', 'manual', index + 1]
        );
      }
    }
    const originalIds = (await db.all('SELECT id FROM test_parameters WHERE test_id=? ORDER BY display_order', [740])).map(field => field.id);
    await db.run('INSERT INTO visit_tests (test_id) VALUES (?)', [741]);
    await db.run("UPDATE test_parameters SET normal_range='Lab custom' WHERE test_id=742 AND parameter_name='Culture Result'");
    await db.run('INSERT INTO test_bundle_items (bundle_test_id,component_test_id) VALUES (?,?)', [747, 744]);
    await db.run("UPDATE tests SET sample_type='Sterile Body Fluid' WHERE id=748");

    await ensureBactecAerobicCultureTestConfiguration(db);
    await ensureBactecAerobicCultureTestConfiguration(db);

    const expected = [
      'Specimen / Collection Site', 'Bottle / Medium', 'Collection Date / Time',
      'Culture Status / Result', 'Report Status', 'Time to Positivity',
      'Gram Stain from Positive Bottle', 'Organism(s) Isolated', 'Identification Method',
      'Antimicrobial Susceptibility', 'Comments',
    ];
    for (const id of [740, 745, 746, 748]) {
      const fields = await db.all('SELECT id,parameter_name,unit,normal_range FROM test_parameters WHERE test_id=? ORDER BY display_order', [id]);
      assert.deepEqual(fields.map(field => field.parameter_name), expected);
      assert.ok(fields.every(field => !field.normal_range));
      if (id === 740) assert.deepEqual([fields[3].id, fields[7].id, fields[9].id, fields[10].id], originalIds);
    }
    assert.equal((await db.get('SELECT sample_type FROM tests WHERE id=740')).sample_type, null);
    assert.equal((await db.get('SELECT sample_type FROM tests WHERE id=748')).sample_type, 'Sterile Body Fluid');
    for (const id of [741, 742, 743, 744, 747]) {
      assert.deepEqual(
        (await db.all('SELECT parameter_name FROM test_parameters WHERE test_id=? ORDER BY display_order', [id])).map(field => field.parameter_name),
        ['Culture Result', 'Organism Isolated', 'Antibiotic Sensitivity', 'Comments']
      );
    }
    assert.equal((await db.get('SELECT normal_range FROM test_parameters WHERE test_id=742 AND parameter_name=?', ['Culture Result'])).normal_range, 'Lab custom');
  } finally {
    await db.close();
  }
});

test('BACTEC anaerobic culture expands only unused generic fields and leaves aerobic culture untouched', async () => {
  const db = await fixture();
  try {
    for (const [id, name, body] of [
      [760, 'BactecCultureforAnaerobic Bacteria', ''],
      [761, 'BactecCultureforAnaerobic Bacteria', ''],
      [762, 'BactecCultureforAnaerobic Bacteria', ''],
      [763, 'BactecCultureforAnaerobic Bacteria', 'Lab-authored format'],
      [764, 'Bactec Culture for Aerobic Bacteria', ''],
      [765, 'BactecCultureforAnaerobic Bacteria', ''],
      [766, 'BactecCultureforAnaerobic Bacteria', ''],
      [767, 'BactecCultureforAnaerobic Bacteria', ''],
      [768, 'BactecCultureforAnaerobic Bacteria', ''],
    ]) {
      await db.run('INSERT INTO tests (id,name,category,report_body) VALUES (?,?,?,?)', [id, name, 'Imported legacy catalogue', body]);
      const names = id === 765 ? [] : id === 766 ? ['Result'] : [
        'Culture Result', 'Organism Isolated', 'Antibiotic Sensitivity', 'Comments',
      ];
      for (const [index, fieldName] of names.entries()) {
        await db.run(
          'INSERT INTO test_parameters (test_id,parameter_name,unit,normal_range,entry_mode,display_order) VALUES (?,?,?,?,?,?)',
          [id, fieldName, '', '', 'manual', index + 1]
        );
      }
    }
    const originalIds = (await db.all('SELECT id FROM test_parameters WHERE test_id=? ORDER BY display_order', [760])).map(field => field.id);
    await db.run('INSERT INTO visit_tests (test_id) VALUES (?)', [761]);
    await db.run("UPDATE test_parameters SET normal_range='Lab custom' WHERE test_id=762 AND parameter_name='Culture Result'");
    await db.run('INSERT INTO test_bundle_items (bundle_test_id,component_test_id) VALUES (?,?)', [767, 764]);
    await db.run("UPDATE tests SET sample_type='Peritoneal Fluid' WHERE id=768");

    await ensureBactecAnaerobicCultureTestConfiguration(db);
    await ensureBactecAnaerobicCultureTestConfiguration(db);

    const expected = [
      'Specimen / Collection Site', 'Bottle / Medium', 'Collection Date / Time',
      'Culture Status / Result', 'Report Status', 'Time to Positivity',
      'Gram Stain from Positive Bottle', 'Organism(s) Isolated', 'Identification Method',
      'Antimicrobial Susceptibility', 'Comments',
    ];
    for (const id of [760, 765, 766, 768]) {
      const fields = await db.all('SELECT id,parameter_name,unit,normal_range FROM test_parameters WHERE test_id=? ORDER BY display_order', [id]);
      assert.deepEqual(fields.map(field => field.parameter_name), expected);
      assert.ok(fields.every(field => !field.normal_range));
      if (id === 760) assert.deepEqual([fields[3].id, fields[7].id, fields[9].id, fields[10].id], originalIds);
    }
    assert.equal((await db.get('SELECT sample_type FROM tests WHERE id=760')).sample_type, null);
    assert.equal((await db.get('SELECT sample_type FROM tests WHERE id=768')).sample_type, 'Peritoneal Fluid');
    for (const id of [761, 762, 763, 764, 767]) {
      assert.deepEqual(
        (await db.all('SELECT parameter_name FROM test_parameters WHERE test_id=? ORDER BY display_order', [id])).map(field => field.parameter_name),
        ['Culture Result', 'Organism Isolated', 'Antibiotic Sensitivity', 'Comments']
      );
    }
    assert.equal((await db.get('SELECT normal_range FROM test_parameters WHERE test_id=762 AND parameter_name=?', ['Culture Result'])).normal_range, 'Lab custom');
  } finally {
    await db.close();
  }
});

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
