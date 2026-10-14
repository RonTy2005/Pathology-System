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
const { ensureUrinary17KetosteroidTestConfiguration } = require('../src/db/init');
const { ensureUrinaryVmaTestConfiguration } = require('../src/db/init');
const { ensureUrineObtThreeDayTestConfiguration } = require('../src/db/init');
const { ensureUrinePorphobilinogenTestConfiguration } = require('../src/db/init');
const { ensureUrinePregnancyTestConfiguration } = require('../src/db/init');
const { ensureUrineProteinAlbuminTestConfiguration } = require('../src/db/init');
const { ensure24HourUrineProteinTestConfiguration } = require('../src/db/init');
const { ensureUrineRoutineTestConfiguration } = require('../src/db/init');
const { ensureUrineReducingSubstancesTestConfiguration } = require('../src/db/init');
const { ensureUrineSugarTestConfiguration } = require('../src/db/init');
const { ensureUrineUrobilinogenTestConfiguration } = require('../src/db/init');
const { ensureUrinePhTestConfiguration } = require('../src/db/init');
const { ensureUroflowmetryTestConfiguration } = require('../src/db/init');
const { ensureVaginalCervicalSwabTestConfiguration } = require('../src/db/init');
const { ensureVaginalSwabAfbStainTestConfiguration } = require('../src/db/init');
const { ensureVaginalSwabGramStainTestConfiguration } = require('../src/db/init');
const { ensureValproateLevelTestConfiguration } = require('../src/db/init');
const { ensureVanDenBerghReactionTestConfiguration } = require('../src/db/init');
const { ensureWeilFelixTestConfiguration } = require('../src/db/init');
const { ensureWellWomenProfileTestConfiguration } = require('../src/db/init');
const { ensureWoundSwabAfbStainTestConfiguration } = require('../src/db/init');
const { ensureWoundSwabGramStainTestConfiguration } = require('../src/db/init');
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
        .replace(/<img\b[^>]*\bclass="barcode-img"[^>]*\/>/g, '<barcode-image />')
        .replace(/<img\b[^>]*\bclass="qr-img"[^>]*\/>/g, '<qr-image />');
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

test('Serum Osmolality uses an osmolality-specific method and cautious interpretation', () => {
  const html = buildReportHtml(sampleReport({
    name: 'Serum Osmolality',
    code: 'OSMOLALITY',
    sample_type: 'Serum',
    parameters: [{ parameter_name: 'Osmolality', value: '286', unit: 'mOsm/kg H2O', normal_range: '278 - 298' }],
  }));
  assert.match(html, /<div class="test-title">OSMOLALITY, SERUM<\/div>/);
  assert.match(html, /data-report-content="serum-osmolality"/);
  assert.match(html, /Freezing-point depression osmometry/);
  assert.match(html, />286</);
  assert.match(html, /278 - 298/);
  assert.doesNotMatch(html, /Latex Agglutination/);
});

test('Sputum AFB Stain retains method-specific AFB grading and confirmation context', () => {
  const html = buildReportHtml(sampleReport({
    name: 'Sputum AFB Stain',
    code: 'SPUTUMAFB',
    sample_type: 'Sputum',
    parameters: [
      { parameter_name: 'Type of Specimen', value: 'Early morning sputum' },
      { parameter_name: 'Auramine Result', value: 'AFB seen' },
      { parameter_name: 'Auramine Grade', value: '1+' },
      { parameter_name: 'Ziehl Neelsen Result', value: 'AFB seen' },
      { parameter_name: 'Ziehl Neelsen Grade', value: '1+' },
    ],
  }));
  assert.match(html, /<div class="test-title">SPUTUM EXAMINATION, AFB<\/div>/);
  assert.match(html, /data-report-content="sputum-afb-stain"/);
  assert.match(html, /Auramine \/ fluorescent microscopy/);
  assert.match(html, /Ziehl-Neelsen microscopy/);
  assert.match(html, /A positive smear is not species-specific/);
  assert.match(html, /A negative smear does not exclude tuberculosis/);
});

test('Stool OBT presents method-aware occult-blood screening and follow-up context', () => {
  const html = buildReportHtml(sampleReport({
    name: 'Stool OBT',
    sample_type: 'Stool',
    parameters: [{ parameter_name: 'Fecal Occult Blood Result', value: 'Positive' }],
  }));
  assert.match(html, /data-report-content="stool-occult-blood"/);
  assert.match(html, /STOOL OCCULT BLOOD TEST \(OBT\)/);
  assert.match(html, /does not identify the source of bleeding/);
  assert.match(html, /commonly colonoscopy/);
});

test('Immature Platelet Fraction (IPF) uses analyzer-aware platelet-production context', () => {
  const html = buildReportHtml(sampleReport({
    name: 'Immature Platelet Fraction (IPF)',
    code: 'PF007',
    sample_type: 'Whole Blood',
    parameters: [
      { parameter_name: 'Immature Platelet Fraction (IPF)', value: '5.2', unit: '%', normal_range: 'Analyzer validated interval' },
      { parameter_name: 'Platelet Count, Concurrent', value: '85,000', unit: 'cells/µL', normal_range: '150,000 - 450,000' },
      { parameter_name: 'Analyzer / Method', value: 'Validated automated hematology analyzer' },
    ],
  }));
  assert.match(html, /<div class="test-title">IMMATURE PLATELET FRACTION \(IPF\)<\/div>/);
  assert.match(html, /data-report-content="immature-platelet-fraction"/);
  assert.match(html, /must be interpreted with the concurrent platelet count/);
  assert.match(html, /does not establish the cause of thrombocytopenia/);
  assert.deepEqual(
    getFallbackReportParameters({ name: 'Immature Platelet Fraction (IPF)' }).slice(0, 6).map(parameter => parameter.parameterName),
    ['Immature Platelet Fraction (IPF)', 'Absolute Immature Platelet Count, if reported', 'Platelet Count, Concurrent', 'Mean Platelet Volume (MPV), if reported', 'Analyzer / Method', 'Specimen'],
  );
});

test('Immunoglobulin (IgA) + (IgG) + (IgM) uses a combined quantitative panel', () => {
  const html = buildReportHtml(sampleReport({
    name: 'Immunoglobulin (IgA) + (IgG) + (IgM)',
    sample_type: 'Serum',
    parameters: [
      { parameter_name: 'Immunoglobulin G (IgG), Serum', value: '1,020', unit: 'mg/dL', normal_range: 'Laboratory interval' },
      { parameter_name: 'Immunoglobulin A (IgA), Serum', value: '185', unit: 'mg/dL', normal_range: 'Laboratory interval' },
      { parameter_name: 'Immunoglobulin M (IgM), Serum', value: '102', unit: 'mg/dL', normal_range: 'Laboratory interval' },
    ],
  }));
  assert.match(html, /<div class="test-title">IMMUNOGLOBULIN \(IgA\) \+ \(IgG\) \+ \(IgM\)<\/div>/);
  assert.match(html, /data-report-content="immunoglobulin-gam-panel"/);
  assert.match(html, /Immunoglobulin G \(IgG\), Serum/);
  assert.match(html, /Immunoglobulin A \(IgA\), Serum/);
  assert.match(html, /Immunoglobulin M \(IgM\), Serum/);
  assert.match(html, /serum protein electrophoresis and immunofixation are generally required/);
  assert.deepEqual(
    getFallbackReportParameters({ name: 'Immunoglobulin (IgA) + (IgG) + (IgM)' }).slice(0, 5).map(parameter => parameter.parameterName),
    ['Immunoglobulin G (IgG), Serum', 'Immunoglobulin A (IgA), Serum', 'Immunoglobulin M (IgM), Serum', 'Specimen', 'Method / Analyzer'],
  );
});

test('Immunoglobulin Profile includes core quantitative immunoglobulins and optional total IgE', () => {
  const html = buildReportHtml(sampleReport({
    name: 'Immunoglobulin Profile',
    sample_type: 'Serum',
    parameters: [
      { parameter_name: 'Immunoglobulin G (IgG), Serum', value: '1,020', unit: 'mg/dL', normal_range: 'Laboratory interval' },
      { parameter_name: 'Immunoglobulin A (IgA), Serum', value: '185', unit: 'mg/dL', normal_range: 'Laboratory interval' },
      { parameter_name: 'Immunoglobulin M (IgM), Serum', value: '102', unit: 'mg/dL', normal_range: 'Laboratory interval' },
      { parameter_name: 'Total Immunoglobulin E (IgE), if ordered', value: '44', unit: 'kUA/L', normal_range: 'Laboratory interval' },
    ],
  }));
  assert.match(html, /<div class="test-title">IMMUNOGLOBULIN PROFILE<\/div>/);
  assert.match(html, /data-report-content="immunoglobulin-profile"/);
  assert.match(html, /Total Immunoglobulin E \(IgE\), if ordered/);
  assert.match(html, /Total IgE, when ordered, has its own assay-specific interval/);
  assert.deepEqual(
    getFallbackReportParameters({ name: 'Immunoglobulin Profile' }).slice(0, 5).map(parameter => parameter.parameterName),
    ['Immunoglobulin G (IgG), Serum', 'Immunoglobulin A (IgA), Serum', 'Immunoglobulin M (IgM), Serum', 'Total Immunoglobulin E (IgE), if ordered', 'Specimen'],
  );
});

test('India Ink Preparation uses a specimen-aware direct microscopy report', () => {
  const html = buildReportHtml(sampleReport({
    name: 'India Ink Preperation',
    sample_type: 'CSF',
    parameters: [
      { parameter_name: 'India Ink Microscopy Result', value: 'No encapsulated yeast seen', normal_range: 'No encapsulated yeast seen' },
      { parameter_name: 'Microscopic Observation / Morphology', value: 'No encapsulated budding yeast observed' },
      { parameter_name: 'Cryptococcal Antigen (CrAg), if performed', value: 'Pending' },
    ],
  }));
  assert.match(html, /<div class="test-title">INDIA INK PREPARATION<\/div>/);
  assert.match(html, /data-report-content="india-ink-preparation"/);
  assert.match(html, /A negative India ink preparation does not exclude cryptococcal infection/);
  assert.match(html, /Cryptococcal Antigen \(CrAg\), if performed/);
  assert.deepEqual(
    getFallbackReportParameters({ name: 'India Ink Preperation' }).slice(0, 5).map(parameter => parameter.parameterName),
    ['India Ink Microscopy Result', 'Microscopic Observation / Morphology', 'Specimen', 'Concentration / Centrifugation, if performed', 'Cryptococcal Antigen (CrAg), if performed'],
  );
});

test('Joint Fluid for AFB Stain uses a specimen-aware mycobacterial microscopy report', () => {
  const html = buildReportHtml(sampleReport({
    name: 'Joint Fluid for AFB Stain',
    sample_type: 'Joint (Synovial) Fluid',
    parameters: [
      { parameter_name: 'AFB Smear Result', value: 'No acid-fast bacilli seen', normal_range: 'No acid-fast bacilli seen' },
      { parameter_name: 'Joint / Aspiration Site', value: 'Right knee' },
      { parameter_name: 'Mycobacterial Culture, if performed', value: 'Pending' },
    ],
  }));
  assert.match(html, /<div class="test-title">JOINT FLUID - AFB STAIN<\/div>/);
  assert.match(html, /data-report-content="joint-fluid-afb-stain"/);
  assert.match(html, /A negative AFB smear does not exclude mycobacterial infection/);
  assert.match(html, /Mycobacterial Culture, if performed/);
  assert.deepEqual(
    getFallbackReportParameters({ name: 'Joint Fluid for AFB Stain' }).slice(0, 5).map(parameter => parameter.parameterName),
    ['AFB Smear Result', 'AFB Smear Grade, if positive', 'Microscopic Findings / Morphology', 'Joint / Aspiration Site', 'Specimen'],
  );
  assert.deepEqual(
    getFallbackReportParameters({ name: 'Synovial Fluid for AFB Stain' }).slice(0, 5).map(parameter => parameter.parameterName),
    ['AFB Smear Result', 'AFB Smear Grade, if positive', 'Microscopic Findings / Morphology', 'Joint / Aspiration Site', 'Specimen'],
  );
});

test('Joint Fluid for Chloride keeps synovial-fluid reporting separate from serum chloride', () => {
  const html = buildReportHtml(sampleReport({
    name: 'Joint Fluid for Chloride',
    sample_type: 'Joint (Synovial) Fluid',
    parameters: [
      { parameter_name: 'Chloride, Joint Fluid', value: '109', unit: 'mmol/L', normal_range: 'Laboratory fluid comment' },
      { parameter_name: 'Joint / Aspiration Site', value: 'Left knee' },
      { parameter_name: 'Paired Serum Chloride, if measured', value: '103', unit: 'mmol/L' },
    ],
  }));
  assert.match(html, /<div class="test-title">CHLORIDE, JOINT FLUID<\/div>/);
  assert.match(html, /data-report-content="joint-fluid-chloride"/);
  assert.match(html, /serum or plasma chloride reference intervals must not be applied directly to synovial fluid/i);
  assert.match(html, /Paired Serum Chloride, if measured/);
  assert.deepEqual(
    getFallbackReportParameters({ name: 'Joint Fluid for Chloride' }).slice(0, 5).map(parameter => parameter.parameterName),
    ['Chloride, Joint Fluid', 'Joint / Aspiration Site', 'Collection Date / Time', 'Appearance', 'Paired Serum Chloride, if measured'],
  );
});

test('Joint Fluid for Gram Stain uses direct microscopy with culture correlation', () => {
  const html = buildReportHtml(sampleReport({
    name: 'Joint Fluid for Gram Stain',
    sample_type: 'Joint (Synovial) Fluid',
    parameters: [
      { parameter_name: 'Joint / Aspiration Site', value: 'Right knee' },
      { parameter_name: 'Gram Stain Findings', value: 'No organisms seen' },
      { parameter_name: 'Inflammatory Cells / PMNs', value: 'Many PMNs seen' },
      { parameter_name: 'Culture / Molecular Test Status', value: 'Culture pending' },
    ],
  }));
  assert.match(html, /<div class="test-title">GRAM STAIN, JOINT FLUID<\/div>/);
  assert.match(html, /data-report-content="joint-fluid-gram-stain"/);
  assert.match(html, /A negative joint-fluid Gram stain does not exclude infection/);
  assert.match(html, /Culture \/ Molecular Test Status/);
  assert.deepEqual(
    getFallbackReportParameters({ name: 'Joint Fluid for Gram Stain' }).slice(0, 5).map(parameter => parameter.parameterName),
    ['Joint / Aspiration Site', 'Specimen', 'Smear Method / Preparation', 'Inflammatory Cells / PMNs', 'Gram Stain Findings'],
  );
});

test('Joint Fluid for Protein keeps synovial-fluid reporting separate from serum and pleural-fluid thresholds', () => {
  const html = buildReportHtml(sampleReport({
    name: 'Joint Fluid for Protein',
    sample_type: 'Joint (Synovial) Fluid',
    parameters: [
      { parameter_name: 'Total Protein, Joint Fluid', value: '4.1', unit: 'g/dL', normal_range: 'Laboratory fluid comment' },
      { parameter_name: 'Joint / Aspiration Site', value: 'Left knee' },
      { parameter_name: 'Paired Serum Total Protein, if measured', value: '6.8', unit: 'g/dL' },
    ],
  }));
  assert.match(html, /<div class="test-title">TOTAL PROTEIN, JOINT FLUID<\/div>/);
  assert.match(html, /data-report-content="joint-fluid-protein"/);
  assert.match(html, /serum and pleural-fluid protein thresholds must not be applied directly to synovial fluid/i);
  assert.match(html, /Paired Serum Total Protein, if measured/);
  assert.deepEqual(
    getFallbackReportParameters({ name: 'Joint Fluid for Protein' }).slice(0, 5).map(parameter => parameter.parameterName),
    ['Total Protein, Joint Fluid', 'Joint / Aspiration Site', 'Collection Date / Time', 'Appearance', 'Paired Serum Total Protein, if measured'],
  );
});

test('Joint Fluid for Specific Gravity uses a synovial-fluid physical-examination report', () => {
  const html = buildReportHtml(sampleReport({
    name: 'Joint Fluid for Specific Gravity',
    sample_type: 'Joint (Synovial) Fluid',
    parameters: [
      { parameter_name: 'Specific Gravity, Joint Fluid', value: '1.024', normal_range: 'Laboratory fluid comment' },
      { parameter_name: 'Joint / Aspiration Site', value: 'Right knee' },
      { parameter_name: 'Method / Instrument', value: 'Validated refractometric method' },
    ],
  }));
  assert.match(html, /<div class="test-title">SPECIFIC GRAVITY, JOINT FLUID<\/div>/);
  assert.match(html, /data-report-content="joint-fluid-specific-gravity"/);
  assert.match(html, /No universal reference interval applies to joint fluid/);
  assert.match(html, /Validated refractometric method/);
  assert.deepEqual(
    getFallbackReportParameters({ name: 'Joint Fluid for Specific Gravity' }).slice(0, 5).map(parameter => parameter.parameterName),
    ['Specific Gravity, Joint Fluid', 'Joint / Aspiration Site', 'Collection Date / Time', 'Appearance', 'Method / Instrument'],
  );
});

test('Joint Fluid for Sugar keeps synovial-fluid glucose separate from serum ranges', () => {
  const html = buildReportHtml(sampleReport({
    name: 'Joint Fluid for Sugar',
    sample_type: 'Joint (Synovial) Fluid',
    parameters: [
      { parameter_name: 'Glucose, Joint Fluid', value: '62', unit: 'mg/dL', normal_range: 'Laboratory fluid comment' },
      { parameter_name: 'Paired Serum / Plasma Glucose, if measured', value: '96', unit: 'mg/dL' },
      { parameter_name: 'Joint / Aspiration Site', value: 'Left knee' },
    ],
  }));
  assert.match(html, /<div class="test-title">GLUCOSE, JOINT FLUID<\/div>/);
  assert.match(html, /data-report-content="joint-fluid-sugar"/);
  assert.match(html, /serum or plasma glucose reference intervals must not be applied directly to synovial fluid/i);
  assert.match(html, /Paired Serum \/ Plasma Glucose, if measured/);
  assert.deepEqual(
    getFallbackReportParameters({ name: 'Joint Fluid for Sugar' }).slice(0, 5).map(parameter => parameter.parameterName),
    ['Glucose, Joint Fluid', 'Paired Serum / Plasma Glucose, if measured', 'Joint / Aspiration Site', 'Collection Date / Time', 'Appearance'],
  );
});

test('Kahn Test uses a cautious non-treponemal syphilis serology report', () => {
  const html = buildReportHtml(sampleReport({
    name: 'Kahn Test',
    sample_type: 'Serum',
    parameters: [
      { parameter_name: 'Kahn Test Result', value: 'Reactive', normal_range: 'Non-reactive' },
      { parameter_name: 'Kahn Test Titre, if reactive', value: '1:8' },
      { parameter_name: 'Treponemal Confirmatory Test, if performed', value: 'Pending' },
    ],
  }));
  assert.match(html, /<div class="test-title">KAHN TEST<\/div>/);
  assert.match(html, /data-report-content="kahn-test"/);
  assert.match(html, /not specific for/);
  assert.match(html, /Treponemal Confirmatory Test, if performed/);
  assert.deepEqual(
    getFallbackReportParameters({ name: 'Kahn Test' }).slice(0, 5).map(parameter => parameter.parameterName),
    ['Kahn Test Result', 'Kahn Test Titre, if reactive', 'Specimen', 'Method / Antigen Preparation', 'Treponemal Confirmatory Test, if performed'],
  );
});

test('Kalazar (Rapid Test) reports rK39 serology with its clinical limitations', () => {
  const html = buildReportHtml(sampleReport({
    name: 'Kalazar (Rapid Test)',
    parameters: [
      { parameter_name: 'Kala-azar Rapid Test Result', value: 'Reactive', normal_range: 'Non-reactive' },
      { parameter_name: 'Rapid Test Device / Kit', value: 'rK39 ICT' },
      { parameter_name: 'Read Time / Test Validity', value: 'Valid at 10 minutes' },
    ],
  }));
  assert.match(html, /<div class="test-title">KALA-AZAR \(RAPID TEST\)<\/div>/);
  assert.match(html, /data-report-content="kala-azar-rapid-test"/);
  assert.match(html, /does not by itself establish active disease/);
  assert.match(html, /rK39 ICT/);
  assert.deepEqual(
    getFallbackReportParameters({ name: 'Kalazar (Rapid Test)' }).slice(0, 5).map(parameter => parameter.parameterName),
    ['Kala-azar Rapid Test Result', 'Specimen', 'Rapid Test Device / Kit', 'Lot Number / Expiry, if recorded', 'Read Time / Test Validity'],
  );
});

test('Leishmania / Kala-Azar Antibody IgG reports serology without asserting active infection', () => {
  const html = buildReportHtml(sampleReport({
    name: 'Leishmania / Kala-Azar Antibody IgG',
    sample_type: 'Serum',
    parameters: [
      { parameter_name: 'Leishmania / Kala-azar Antibody IgG, Serum', value: 'Reactive', normal_range: 'Negative' },
      { parameter_name: 'Antibody Index / Titre, if applicable', value: '1.8 index' },
      { parameter_name: 'Assay / Antigen Used', value: 'Validated antibody assay' },
    ],
  }));
  assert.match(html, /<div class="test-title">LEISHMANIA \/ KALA-AZAR ANTIBODY IgG<\/div>/);
  assert.match(html, /data-report-content="leishmania-kala-azar-antibody-igg"/);
  assert.match(html, /does not exclude visceral leishmaniasis/);
  assert.match(html, /must not be used as the sole criterion to diagnose active disease/);
  assert.deepEqual(
    getFallbackReportParameters({ name: 'Leishmania / Kala-Azar Antibody IgG' }).slice(0, 4).map(parameter => parameter.parameterName),
    ['Leishmania / Kala-azar Antibody IgG, Serum', 'Antibody Index / Titre, if applicable', 'Assay / Antigen Used', 'Clinical History / Endemic-area Exposure, if provided'],
  );
});

test('Leishmania / Kala-Azar Antibody IgM reports limited-use serology without asserting active infection', () => {
  const html = buildReportHtml(sampleReport({
    name: 'Leishmania / Kala-Azar Antibody IgM',
    sample_type: 'Serum',
    parameters: [
      { parameter_name: 'Leishmania / Kala-azar Antibody IgM, Serum', value: 'Reactive', normal_range: 'Negative' },
      { parameter_name: 'Antibody Index / Titre, if applicable', value: '1.4 index' },
      { parameter_name: 'Assay / Antigen Used', value: 'Validated antibody assay' },
    ],
  }));
  assert.match(html, /<div class="test-title">LEISHMANIA \/ KALA-AZAR ANTIBODY IgM<\/div>/);
  assert.match(html, /data-report-content="leishmania-kala-azar-antibody-igm"/);
  assert.match(html, /limited diagnostic utility for parasitic infections/);
  assert.match(html, /must not be used alone to diagnose active visceral leishmaniasis/);
  assert.deepEqual(
    getFallbackReportParameters({ name: 'Leishmania / Kala-Azar Antibody IgM' }).slice(0, 4).map(parameter => parameter.parameterName),
    ['Leishmania / Kala-azar Antibody IgM, Serum', 'Antibody Index / Titre, if applicable', 'Assay / Antigen Used', 'Clinical History / Endemic-area Exposure, if provided'],
  );
});

test('Karyotype uses a structured cytogenetics report with ISCN and assay limitations', () => {
  const html = buildReportHtml(sampleReport({
    name: 'Karyotype',
    sample_type: 'Peripheral blood',
    parameters: [
      { parameter_name: 'Karyotype Result / Summary', value: 'Normal constitutional karyotype within the stated resolution' },
      { parameter_name: 'ISCN Karyotype', value: '46,XX[20]' },
      { parameter_name: 'Banding Method / Resolution', value: 'GTG banding; 550 bands' },
      { parameter_name: 'Cells Counted / Analysed / Karyotyped', value: '20 / 20 / 5' },
    ],
  }));
  assert.match(html, /<div class="test-title">KARYOTYPE<\/div>/);
  assert.match(html, /data-report-content="karyotype"/);
  assert.match(html, /46,XX\[20\]/);
  assert.match(html, /International System for Human Cytogenomic Nomenclature/);
  assert.match(html, /does not exclude submicroscopic copy-number changes/);
});

test('Karyotyping (Chromosomal Analysis) uses the same structured cytogenetics format', () => {
  const html = buildReportHtml(sampleReport({
    name: 'Karyotyping (Chromosomal Analysis)',
    parameters: [
      { parameter_name: 'Karyotype Result / Summary', value: 'Abnormal karyotype detected' },
      { parameter_name: 'ISCN Karyotype', value: '47,XY,+21[15]/46,XY[5]' },
      { parameter_name: 'Mosaicism / Clonal Findings, if present', value: 'Mosaic finding reported' },
    ],
  }));
  assert.match(html, /<div class="test-title">KARYOTYPE<\/div>/);
  assert.match(html, /data-report-content="karyotype"/);
  assert.match(html, /47,XY,\+21\[15\]\/46,XY\[5\]/);
  assert.deepEqual(
    getFallbackReportParameters({ name: 'Karyotyping (Chromosomal Analysis)' }).slice(0, 4).map(parameter => parameter.parameterName),
    ['Karyotype Result / Summary', 'ISCN Karyotype', 'Specimen / Tissue Source', 'Culture / Harvest Details'],
  );
});

test('Karyotyping with C-Banding uses a dedicated heterochromatin-focused cytogenetics report', () => {
  const html = buildReportHtml(sampleReport({
    name: 'Karyotyping with C-Banding',
    parameters: [
      { parameter_name: 'C-Banding Karyotype Result / Summary', value: 'C-banding study completed' },
      { parameter_name: 'ISCN Karyotype', value: '46,XY,9qh+[20]' },
      { parameter_name: 'C-Band Findings / Heterochromatin Pattern', value: 'Prominent heterochromatin on chromosome 9q' },
    ],
  }));
  assert.match(html, /<div class="test-title">KARYOTYPING WITH C-BANDING<\/div>/);
  assert.match(html, /data-report-content="karyotype-c-banding"/);
  assert.match(html, /constitutive heterochromatin/);
  assert.match(html, /46,XY,9qh\+\[20\]/);
  assert.deepEqual(
    getFallbackReportParameters({ name: 'Karyotyping with C-Banding' }).slice(0, 5).map(parameter => parameter.parameterName),
    ['C-Banding Karyotype Result / Summary', 'ISCN Karyotype', 'Specimen / Tissue Source', 'C-Banding Method / Protocol', 'C-Band Findings / Heterochromatin Pattern'],
  );
});

test('LFT with GGT uses the liver-function panel with a dedicated GGT interpretation note', () => {
  const html = buildReportHtml(sampleReport({
    name: 'LFT with GGT',
    sample_type: 'Serum',
    parameters: [
      { parameter_name: 'AST (SGOT)', value: '31', unit: 'U/L', normal_range: '15 - 40' },
      { parameter_name: 'ALT (SGPT)', value: '28', unit: 'U/L', normal_range: '10 - 49' },
      { parameter_name: 'GGTP', value: '42', unit: 'U/L', normal_range: '0 - 73' },
      { parameter_name: 'Alkaline Phosphatase (ALP)', value: '90', unit: 'U/L', normal_range: '30 - 120' },
    ],
  }));
  assert.match(html, /<div class="test-title">LIVER FUNCTION TEST \(LFT\) WITH GGT<\/div>/);
  assert.match(html, /data-report-content="lft-with-ggt"/);
  assert.match(html, /GGTP/);
  assert.match(html, /GGT can help support a hepatic source/);
});

test('LH & FSH uses a cycle-aware two-hormone gonadotropin format', () => {
  const html = buildReportHtml(sampleReport({
    name: 'LH & FSH',
    sample_type: 'Serum',
    parameters: [
      { parameter_name: 'Luteinizing Hormone (LH), Serum', value: '7.1', unit: 'mIU/mL', normal_range: 'Laboratory follicular-phase interval' },
      { parameter_name: 'Follicle Stimulating Hormone (FSH), Serum', value: '6.8', unit: 'mIU/mL', normal_range: 'Laboratory follicular-phase interval' },
      { parameter_name: 'Menstrual Cycle Phase / Physiologic State', value: 'Follicular phase' },
    ],
  }));
  assert.match(html, /<div class="test-title">LH & FSH<\/div>/);
  assert.match(html, /data-report-content="lh-fsh"/);
  assert.match(html, /midcycle surge/);
  assert.doesNotMatch(html, /Prolactin \(PRL\), Serum/);
  assert.deepEqual(
    getFallbackReportParameters({ name: 'LH & FSH' }).slice(0, 4).map(parameter => parameter.parameterName),
    ['Luteinizing Hormone (LH), Serum', 'Follicle Stimulating Hormone (FSH), Serum', 'Menstrual Cycle Phase / Physiologic State', 'Clinical Details / Medication History'],
  );
});

test('LH & PRL uses a cycle-aware gonadotropin and prolactin format', () => {
  const html = buildReportHtml(sampleReport({
    name: 'LH & PRL',
    sample_type: 'Serum',
    parameters: [
      { parameter_name: 'Luteinizing Hormone (LH), Serum', value: '7.1', unit: 'mIU/mL', normal_range: 'Laboratory follicular-phase interval' },
      { parameter_name: 'Prolactin (PRL), Serum', value: '12.4', unit: 'ng/mL', normal_range: 'Laboratory validated interval' },
      { parameter_name: 'Menstrual Cycle Phase / Physiologic State', value: 'Follicular phase' },
    ],
  }));
  assert.match(html, /<div class="test-title">LH & PRL<\/div>/);
  assert.match(html, /data-report-content="lh-prl"/);
  assert.match(html, /Follicular phase/);
  assert.match(html, /pregnancy\/lactation, medicines, stress/);
  assert.doesNotMatch(html, /Follicle Stimulating Hormone \(FSH\), Serum/);
  assert.deepEqual(
    getFallbackReportParameters({ name: 'LH & PRL' }).slice(0, 4).map(parameter => parameter.parameterName),
    ['Luteinizing Hormone (LH), Serum', 'Prolactin (PRL), Serum', 'Menstrual Cycle Phase / Physiologic State', 'Clinical Details / Medication History'],
  );
});

test('LeadLevel-Introducing uses a specimen-aware blood lead assessment format', () => {
  const html = buildReportHtml(sampleReport({
    name: 'LeadLevel-Introducing',
    sample_type: 'Whole Blood',
    parameters: [
      { parameter_name: 'Lead (Pb), Whole Blood', value: '4.2', unit: 'µg/dL', normal_range: 'Laboratory reporting interval' },
      { parameter_name: 'Specimen Type / Collection Method', value: 'Capillary whole blood' },
      { parameter_name: 'Clinical / Occupational / Environmental Exposure History', value: 'Screening assessment' },
    ],
  }));
  assert.match(html, /<div class="test-title">LEAD LEVEL<\/div>/);
  assert.match(html, /data-report-content="lead-level"/);
  assert.match(html, /Capillary whole blood/);
  assert.match(html, /confirmed with a properly collected venous whole-blood sample/);
  assert.deepEqual(
    getFallbackReportParameters({ name: 'LeadLevel-Introducing' }).slice(0, 3).map(parameter => parameter.parameterName),
    ['Lead (Pb), Whole Blood', 'Specimen Type / Collection Method', 'Clinical / Occupational / Environmental Exposure History'],
  );
});

test('Inorganic Phosphorus (Urine) distinguishes random concentration from timed excretion', () => {
  const html = buildReportHtml(sampleReport({
    name: 'Inorganic Phosphorus (Urine)',
    sample_type: 'Urine',
    parameters: [
      { parameter_name: 'Inorganic Phosphorus, Urine Concentration', value: '48', unit: 'mg/dL' },
      { parameter_name: 'Inorganic Phosphorus, 24-Hour Urine', value: '860', unit: 'mg/24 h', normal_range: 'Laboratory interval' },
      { parameter_name: 'Urine Volume', value: '1,800', unit: 'mL' },
      { parameter_name: 'Collection Duration', value: '24', unit: 'hours' },
      { parameter_name: 'Serum Phosphorus, Concurrent, if available', value: '3.5', unit: 'mg/dL' },
    ],
  }));
  assert.match(html, /<div class="test-title">INORGANIC PHOSPHORUS \(URINE\)<\/div>/);
  assert.match(html, /data-report-content="urine-inorganic-phosphorus"/);
  assert.match(html, /No universal interval for a random specimen/);
  assert.match(html, /A timed 24-hour urine collection is preferred/);
  assert.deepEqual(
    getFallbackReportParameters({ name: 'Inorganic Phosphorus (Urine)' }).slice(0, 5).map(parameter => parameter.parameterName),
    ['Inorganic Phosphorus, Urine Concentration', 'Inorganic Phosphorus, 24-Hour Urine', 'Urine Volume', 'Collection Duration', 'Urine Creatinine, if measured'],
  );
});

test('Insulin (Free) reports free insulin with treatment and antibody context', () => {
  const html = buildReportHtml(sampleReport({
    name: 'Insulin (Free)',
    sample_type: 'Serum',
    parameters: [
      { parameter_name: 'Free Insulin, Serum', value: '12.4', unit: 'mcIU/mL', normal_range: 'Laboratory interval' },
      { parameter_name: 'Total Insulin, Serum, if performed', value: '49.7', unit: 'mcIU/mL', normal_range: 'Laboratory interval' },
      { parameter_name: 'Glucose, Concurrent, if available', value: '96', unit: 'mg/dL' },
      { parameter_name: 'Insulin Antibody Result, if available', value: 'Pending' },
    ],
  }));
  assert.match(html, /<div class="test-title">INSULIN \(FREE\)<\/div>/);
  assert.match(html, /data-report-content="free-insulin"/);
  assert.match(html, /Free Insulin, Serum/);
  assert.match(html, /not bound by circulating insulin antibodies/);
  assert.deepEqual(
    getFallbackReportParameters({ name: 'Insulin (Free)' }).slice(0, 5).map(parameter => parameter.parameterName),
    ['Free Insulin, Serum', 'Total Insulin, Serum, if performed', 'Glucose, Concurrent, if available', 'C-Peptide, Concurrent, if available', 'Fasting Duration / Collection Timing'],
  );
});

test('Insulin (Midnight) preserves collection-time and glucose context', () => {
  const html = buildReportHtml(sampleReport({
    name: 'Insulin (Midnight)',
    sample_type: 'Serum',
    parameters: [
      { parameter_name: 'Insulin, Serum - Midnight', value: '8.1', unit: 'mcIU/mL', normal_range: 'Laboratory interval' },
      { parameter_name: 'Verified Collection Date / Time', value: '06-Oct-2026 00:03' },
      { parameter_name: 'Glucose, Concurrent, if available', value: '88', unit: 'mg/dL' },
      { parameter_name: 'Fasting Duration / Study Protocol', value: '8-hour fast; midnight collection' },
    ],
  }));
  assert.match(html, /<div class="test-title">INSULIN \(MIDNIGHT\)<\/div>/);
  assert.match(html, /data-report-content="midnight-insulin"/);
  assert.match(html, /Midnight insulin is timing-critical/);
  assert.match(html, /Verified Collection Date \/ Time/);
  assert.deepEqual(
    getFallbackReportParameters({ name: 'Insulin (Midnight)' }).slice(0, 5).map(parameter => parameter.parameterName),
    ['Insulin, Serum - Midnight', 'Verified Collection Date / Time', 'Glucose, Concurrent, if available', 'Fasting Duration / Study Protocol', 'C-Peptide, Concurrent, if available'],
  );
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

test('Throat swab Gram stain reports direct microscopy without implying a culture identification', () => {
  const html = buildReportHtml(sampleReport({
    name: 'Throat Swab for Gram Stain',
    sample_type: 'Throat Swab',
    parameters: [
      { parameter_name: 'Specimen / Collection Site', value: 'Posterior pharyngeal swab' },
      { parameter_name: 'Smear Method / Preparation', value: 'Direct Gram stain' },
      { parameter_name: 'Inflammatory Cells / PMNs', value: 'Few PMNs' },
      { parameter_name: 'Overall Gram Stain Findings', value: 'Mixed upper-respiratory tract flora seen' },
    ],
  }));
  assert.match(html, /<div class="test-title">THROAT SWAB - GRAM STAIN<\/div>/);
  assert.match(html, /data-report-content="throat-swab-gram-stain"/);
  assert.match(html, /Mixed upper-respiratory tract flora seen/);
  assert.match(html, /does not provide definitive organism identification or antimicrobial susceptibility/);
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

test('Throat swab for AFB uses a direct-microscopy report and does not imply tuberculosis confirmation', () => {
  const html = buildReportHtml(sampleReport({
    name: 'Throat Swab for AFB',
    sample_type: 'Throat Swab',
    parameters: [
      { parameter_name: 'AFB Smear Microscopy Result', value: 'No acid-fast bacilli seen' },
      { parameter_name: 'AFB Smear Grade / Quantitation', value: 'Not applicable' },
      { parameter_name: 'Stain Method', value: 'Ziehl-Neelsen stain' },
      { parameter_name: 'Specimen Adequacy / Processing Notes', value: 'Adequate specimen received' },
    ],
  }));
  assert.match(html, /<div class="test-title">AFB STAIN, THROAT SWAB<\/div>/);
  assert.match(html, /data-report-content="throat-swab-afb-stain"/);
  assert.match(html, /No acid-fast bacilli seen/);
  assert.match(html, /Ziehl-Neelsen stain/);
  assert.match(html, /do not identify the species or confirm <em>Mycobacterium tuberculosis<\/em> complex/);
  assert.match(html, /A negative smear does not exclude mycobacterial infection/);
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

test('Throat swab for KLB uses the Albert-stain microscopy format', () => {
  const html = buildReportHtml(sampleReport({
    name: 'Throat Swab for KLB',
    sample_type: 'Throat Swab',
    parameters: [
      { parameter_name: 'Albert Stain Microscopy', value: 'No bacilli morphologically suggestive of KLB seen' },
      { parameter_name: 'Metachromatic Granules', value: 'Not seen' },
    ],
  }));
  assert.match(html, /<div class="test-title">THROAT SWAB FOR KLB<\/div>/);
  assert.match(html, /ALBERT STAIN FOR KLEBS&ndash;L&Ouml;FFLER BACILLI \(KLB\)/);
  assert.match(html, /Microscopy alone does not confirm/);
});

test('Thrombin Time uses a dedicated fibrin-clot formation report', () => {
  const html = buildReportHtml(sampleReport({
    name: 'Thrombin Time (TT)',
    sample_type: 'Citrated Plasma',
    parameters: [
      { parameter_name: 'Thrombin Time (TT)', value: '18.4', unit: 'seconds', normal_range: '14.0 - 21.0' },
      { parameter_name: 'Control Time', value: '16.2', unit: 'seconds', normal_range: '' },
      { parameter_name: 'Comments', value: 'Correlate with fibrinogen.', unit: '', normal_range: '' },
    ],
  }));
  assert.match(html, /<div class="test-title">THROMBIN TIME \(TT\)<\/div>/);
  assert.match(html, /thrombin-time-table/);
  assert.match(html, />18\.4</);
  assert.match(html, /Correlate with fibrinogen/);
  assert.match(html, /heparin or direct thrombin-inhibitor effect/);
  assert.match(html, /does not by itself establish a bleeding disorder/);
});

test('TORCH Panel (IgG) keeps prior-exposure serology separate from acute-infection testing', () => {
  const html = buildReportHtml(sampleReport({
    name: 'TORCH Panel (IgG)',
    sample_type: 'Serum',
    parameters: [
      { parameter_name: 'Toxoplasma gondii IgG', value: 'Positive', normal_range: 'Reactive / non-reactive per validated assay' },
      { parameter_name: 'Rubella Virus IgG', value: 'Positive', normal_range: 'Reactive / non-reactive per validated assay' },
      { parameter_name: 'Cytomegalovirus (CMV) IgG', value: 'Positive', normal_range: 'Reactive / non-reactive per validated assay' },
      { parameter_name: 'Herpes Simplex Virus 1 (HSV-1) IgG', value: 'Positive', normal_range: 'Reactive / non-reactive per validated assay' },
      { parameter_name: 'Herpes Simplex Virus 2 (HSV-2) IgG', value: 'Negative', normal_range: 'Reactive / non-reactive per validated assay' },
    ],
  }));
  assert.match(html, /<div class="test-title">TORCH PANEL \(IgG\)<\/div>/);
  assert.match(html, /data-report-content="torch-igg-panel"/);
  assert.match(html, /Toxoplasma gondii IgG/);
  assert.match(html, /Herpes Simplex Virus 2 \(HSV-2\) IgG/);
  assert.match(html, /does not establish active infection or when exposure occurred/);
  assert.match(html, /cannot diagnose congenital CMV infection/);
});

test('TORCH Panel (IgM) marks isolated IgM reactivity as non-confirmatory', () => {
  const html = buildReportHtml(sampleReport({
    name: 'TORCH Panel (IgM)',
    sample_type: 'Serum',
    parameters: [
      { parameter_name: 'Toxoplasma gondii IgM', value: 'Negative', normal_range: 'Reactive / non-reactive per validated assay' },
      { parameter_name: 'Rubella Virus IgM', value: 'Negative', normal_range: 'Reactive / non-reactive per validated assay' },
      { parameter_name: 'Cytomegalovirus (CMV) IgM', value: 'Reactive', normal_range: 'Reactive / non-reactive per validated assay' },
      { parameter_name: 'Herpes Simplex Virus 1 (HSV-1) IgM', value: 'Negative', normal_range: 'Reactive / non-reactive per validated assay' },
      { parameter_name: 'Herpes Simplex Virus 2 (HSV-2) IgM', value: 'Negative', normal_range: 'Reactive / non-reactive per validated assay' },
    ],
  }));
  assert.match(html, /<div class="test-title">TORCH PANEL \(IgM\)<\/div>/);
  assert.match(html, /data-report-content="torch-igm-panel"/);
  assert.match(html, /Cytomegalovirus \(CMV\) IgM/);
  assert.match(html, /must not be used alone to date infection or diagnose fetal infection/);
  assert.match(html, /CMV IgM alone cannot diagnose primary CMV infection/);
});

test('Total IgE uses a quantitative total-IgE report distinct from allergen-specific testing', () => {
  const html = buildReportHtml(sampleReport({
    name: 'Total IgE',
    sample_type: 'Serum',
    parameters: [
      { parameter_name: 'Total Immunoglobulin E (IgE)', value: '185', unit: 'kUA/L', normal_range: 'Laboratory-validated, age- and assay-specific reference interval' },
    ],
  }));
  assert.match(html, /<div class="test-title">TOTAL IMMUNOGLOBULIN E \(IgE\)<\/div>/);
  assert.match(html, /data-report-content="total-ige"/);
  assert.match(html, />185</);
  assert.match(html, /does not identify a specific allergen/);
  assert.match(html, /does not exclude clinically relevant allergy/);
  assert.doesNotMatch(html, /Level of allergen-specific antibody/);
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
  const custom = buildReportHtml(sampleReport({ ...input, report_body: 'Lab-authored explanation' }));
  assert.doesNotMatch(custom, /data-report-content="anti-leptospira-antibody"/);
  assert.match(custom, /Lab-authored explanation/);
});

test('Leptospira Antibody IgM reports a screening result with early-disease and confirmation guidance', () => {
  const html = buildReportHtml(sampleReport({
    name: 'Leptospira Antibody IgM',
    sample_type: 'Serum',
    parameters: [
      { parameter_name: 'Leptospira Antibody IgM, Serum', value: 'Reactive', normal_range: 'Negative / non-reactive (assay-specific)' },
      { parameter_name: 'Antibody Index / Titre, if applicable', value: '1.7 index' },
      { parameter_name: 'Symptom Onset / Days of Illness, if provided', value: 'Day 5 of illness' },
    ],
  }));
  assert.match(html, /<div class="test-title">LEPTOSPIRA ANTIBODY IgM<\/div>/);
  assert.match(html, /data-report-content="leptospira-antibody-igm"/);
  assert.match(html, /does not alone definitively diagnose acute infection/);
  assert.match(html, /particularly early in illness before antibodies are detectable/);
  assert.deepEqual(
    getFallbackReportParameters({ name: 'Leptospira Antibody IgM' }).slice(0, 4).map(parameter => parameter.parameterName),
    ['Leptospira Antibody IgM, Serum', 'Antibody Index / Titre, if applicable', 'Assay / Method', 'Symptom Onset / Days of Illness, if provided'],
  );
});

test('Lipid Comprehensive Profile separates standard lipids from optional advanced measures', () => {
  const html = buildReportHtml(sampleReport({
    name: 'Lipid Comprehensive Profile',
    sample_type: 'Serum',
    parameters: [
      { parameter_name: 'Total Cholesterol', value: '186', unit: 'mg/dL', normal_range: 'Laboratory interval' },
      { parameter_name: 'Triglycerides', value: '118', unit: 'mg/dL', normal_range: 'Laboratory interval' },
      { parameter_name: 'HDL Cholesterol', value: '48', unit: 'mg/dL', normal_range: 'Laboratory interval' },
      { parameter_name: 'LDL Cholesterol', value: '114', unit: 'mg/dL', normal_range: 'Laboratory interval' },
      { parameter_name: 'Non-HDL Cholesterol', value: '138', unit: 'mg/dL', normal_range: 'Calculated from total cholesterol and HDL cholesterol' },
      { parameter_name: 'Apolipoprotein B, if ordered', value: '96', unit: 'mg/dL', normal_range: 'Laboratory interval' },
      { parameter_name: 'Fasting Status / Collection Details', value: 'Fasting, 10 hours' },
    ],
  }));
  assert.match(html, /<div class="test-title">LIPID COMPREHENSIVE PROFILE<\/div>/);
  assert.match(html, /data-report-content="lipid-comprehensive-profile"/);
  assert.match(html, /ADDITIONAL LIPOPROTEIN MEASURES/);
  assert.match(html, /Fasting, 10 hours/);
  assert.match(html, /non-HDL cholesterol is calculated as total cholesterol minus HDL cholesterol/);
  assert.deepEqual(
    getFallbackReportParameters({ name: 'Lipid Comprehensive Profile' }).slice(0, 8).map(parameter => parameter.parameterName),
    ['Total Cholesterol', 'Triglycerides', 'HDL Cholesterol', 'LDL Cholesterol', 'VLDL Cholesterol', 'Non-HDL Cholesterol', 'Total Cholesterol / HDL Ratio', 'LDL Cholesterol / HDL Ratio'],
  );
});

test('Total Lipid uses an aggregate measurement format rather than a lipid profile', () => {
  const html = buildReportHtml(sampleReport({
    name: 'Total Lipid',
    sample_type: 'Serum',
    parameters: [
      { parameter_name: 'Total Lipids, Serum', value: '610', unit: 'mg/dL', normal_range: 'Laboratory-validated reference interval' },
    ],
  }));
  assert.match(html, /<div class="test-title">TOTAL LIPIDS, SERUM<\/div>/);
  assert.match(html, /data-report-content="total-lipid"/);
  assert.match(html, />610</);
  assert.match(html, /not interchangeable with a standard lipid profile/);
  assert.match(html, /does not provide separate total cholesterol, triglyceride, HDL cholesterol, or LDL cholesterol values/);
  assert.doesNotMatch(html, /NLA - 2014/);
});

test('Total Protein uses a serum-specific aggregate-protein format', () => {
  const html = buildReportHtml(sampleReport({
    name: 'Total Protein',
    sample_type: 'Serum',
    parameters: [
      { parameter_name: 'Total Protein, Serum', value: '7.2', unit: 'g/dL', normal_range: 'Laboratory-validated reference interval' },
    ],
  }));
  assert.match(html, /<div class="test-title">TOTAL PROTEIN, SERUM<\/div>/);
  assert.match(html, /data-report-content="total-protein"/);
  assert.match(html, />7\.2</);
  assert.match(html, /combined concentration of albumin and globulins in serum/);
  assert.match(html, /not interchangeable with total-protein testing in cerebrospinal fluid/);
  assert.doesNotMatch(html, /Fluid \/ Serum Protein Ratio/);
});

test('Ulcer Smear for PAP uses a site-aware exfoliative-cytology format', () => {
  const html = buildReportHtml(sampleReport({
    name: 'Ulcer Smear for PAP',
    sample_type: 'Ulcer smear / exfoliative cytology specimen',
    parameters: [
      { parameter_name: 'Specimen / Ulcer Site', value: 'Non-healing ulcer, lateral tongue' },
      { parameter_name: 'Preparation / Stain Method', value: 'Papanicolaou stain' },
      { parameter_name: 'Specimen Adequacy', value: 'Satisfactory for evaluation' },
      { parameter_name: 'Background / Inflammation / Necrosis', value: 'Inflammatory background with necrotic debris' },
      { parameter_name: 'Epithelial / Cytologic Findings', value: 'Reactive squamous cells; no overt malignant cells seen' },
      { parameter_name: 'Cytologic Impression', value: 'Negative for malignant cells in this smear' },
      { parameter_name: 'Recommendations / Correlation', value: 'Correlate clinically; biopsy if lesion persists' },
    ],
  }));
  assert.match(html, /<div class="test-title">ULCER SMEAR FOR PAP STAIN<\/div>/);
  assert.match(html, /data-report-content="ulcer-smear-pap"/);
  assert.match(html, /Non-healing ulcer, lateral tongue/);
  assert.match(html, /Satisfactory for evaluation/);
  assert.match(html, /does not replace histopathology or tissue biopsy/);
  assert.doesNotMatch(html, /CERVICAL SMEAR - PAP STAIN/);
});

test('Urethral Swab AFB Stain preserves direct microscopy without assuming tuberculosis', () => {
  for (const name of ['Urethral Swab AFB Stain', 'Urethral Swab for AFB', 'AFB Stain Urethral Swab']) {
    const html = buildReportHtml(sampleReport({ name, parameters: [
      { parameter_name: 'AFB Smear Microscopy Result', value: 'Acid-fast bacilli seen', normal_range: 'Local microscopy reference' },
      { parameter_name: 'Stain Method', value: 'Ziehl-Neelsen stain' },
      { parameter_name: 'Specimen Adequacy', value: 'Limited cellular material' },
      { parameter_name: 'AFB Smear Grade / Quantitation', value: '0' },
      { parameter_name: 'Microscopy Remarks', value: 'Confirm microscopic finding\nCorrelate with molecular testing' },
      { parameter_name: 'Impression', value: 'AFB observed; species undetermined' },
    ] }));
    assert.match(html, /<div class="test-title">URETHRAL SWAB - AFB STAIN<\/div>/);
    assert.match(html, /data-report-content="urethral-swab-afb-stain"/);
    assert.match(html, /Acid-fast bacilli seen/);
    assert.match(html, /Local microscopy reference/);
    assert.match(html, /Ziehl-Neelsen stain/);
    assert.match(html, /Limited cellular material/);
    assert.match(html, />0<\/td>/);
    assert.match(html, /Confirm microscopic finding<br \/>Correlate with molecular testing/);
    assert.match(html, /AFB observed; species undetermined/);
    assert.match(html, /A positive AFB smear does not identify the species or confirm Mycobacterium tuberculosis/);
    assert.doesNotMatch(html, /data-report-content="throat-swab-afb-stain"/);
    assert.equal(getFallbackReportParameters({ name }).length, 11);
  }
  const blank = buildReportHtml(sampleReport({ name: 'Urethral Swab AFB Stain', parameters: [] }));
  assert.match(blank, /<strong>AFB Smear Microscopy Result<\/strong><\/td><td>-<\/td>/);
  assert.match(blank, /<strong>Stain Method<\/strong><\/td><td colspan="2">-<\/td>/);
  const legacy = buildReportHtml(sampleReport({ name: 'Urethral Swab AFB Stain', parameters: [
    { parameter_name: 'Findings', value: 'Laboratory microscopy finding' },
    { parameter_name: 'Impression', value: 'Laboratory impression' },
    { parameter_name: 'Comments', value: 'Laboratory comment' },
  ] }));
  assert.match(legacy, /Laboratory microscopy finding/);
  assert.match(legacy, /Laboratory impression/);
  assert.match(legacy, /Laboratory comment/);
});

test('Urethral Discharge C/S preserves culture scope and isolate-specific susceptibility', () => {
  for (const name of ['Urethral Discharge C/S', 'Urethral Discharge Culture & Sensitivity', 'Urethral Discharge Culture and Sensitivity']) {
    const html = buildReportHtml(sampleReport({ name, parameters: [
      { parameter_name: 'Culture Status / Result', value: 'Growth detected', normal_range: 'Laboratory culture reference' },
      { parameter_name: 'Report Status', value: 'Final' },
      { parameter_name: 'Culture Method / Scope', value: 'Routine aerobic culture' },
      { parameter_name: 'Organism(s) Isolated', value: 'Isolate 1: laboratory-confirmed organism' },
      { parameter_name: 'Antimicrobial Susceptibility / MIC', value: 'Isolate 1: agent A - susceptible\nIsolate 1: agent B - resistant' },
      { parameter_name: 'Susceptibility Method / Interpretive Standard', value: 'Laboratory validated standard' },
    ] }));
    assert.match(html, /data-report-content="urethral-discharge-culture"/);
    assert.match(html, /<div class="test-title">URETHRAL DISCHARGE - CULTURE & SENSITIVITY<\/div>/);
    assert.match(html, /Growth detected/);
    assert.match(html, /Laboratory culture reference/);
    assert.match(html, /Routine aerobic culture/);
    assert.match(html, /Isolate 1: agent A - susceptible<br \/>Isolate 1: agent B - resistant/);
    assert.match(html, /negative routine bacterial culture does not exclude urethritis/);
    assert.doesNotMatch(html, /data-report-content="gnd-culture"/);
    assert.equal(getFallbackReportParameters({ name }).length, 13);
  }
  const blank = buildReportHtml(sampleReport({ name: 'Urethral Discharge C/S', parameters: [] }));
  assert.match(blank, /<strong>Culture Status \/ Result<\/strong><\/td><td>-<\/td>/);
  assert.match(blank, /<strong>Organism\(s\) Isolated<\/strong><\/td><td colspan="2">-<\/td>/);
});

test('Uric Acid Urine reports spot concentration with collection-specific interpretation', () => {
  for (const name of ['Uric Acid(Urine)', 'Uric Acid (Random Urine)', 'Urine Uric Acid']) {
    const html = buildReportHtml(sampleReport({ name, parameters: [
      { parameter_name: 'Uric Acid, Random Urine', value: '38.5', unit: 'mg/dL', normal_range: 'Laboratory random-urine interval' },
      { parameter_name: 'Specimen / Collection Type', value: 'Spot urine' },
      { parameter_name: 'Method / Analyzer', value: 'Uricase method' },
      { parameter_name: 'Interpretation / Comments', value: 'Collection recorded\nCorrelate clinically' },
    ] }));
    assert.match(html, /<div class="test-title">URIC ACID, RANDOM URINE<\/div>/);
    assert.match(html, /data-report-content="random-urine-uric-acid"/);
    assert.match(html, />38\.5<\/td><td>Laboratory random-urine interval<\/td><td>mg\/dL/);
    assert.match(html, /Spot urine/);
    assert.match(html, /Uricase method/);
    assert.match(html, /Collection recorded<br \/>Correlate clinically/);
    assert.match(html, /it does not measure 24-hour uric acid excretion/);
    assert.doesNotMatch(html, /Male 200 - 1000|Female 250 - 750|mg\/24 h/);
    assert.equal(getFallbackReportParameters({ name })[0].unit, 'mg/dL');
  }
  const blank = buildReportHtml(sampleReport({ name: 'Uric Acid(Urine)', parameters: [] }));
  assert.match(blank, /<strong>Uric Acid, Random Urine<\/strong><\/td><td>-<\/td>/);
  const legacy = buildReportHtml(sampleReport({ name: 'Uric Acid(Urine)', parameters: [
    { parameter_name: 'Result', value: '0', unit: 'mmol/L', normal_range: 'Local interval in mmol/L' },
  ] }));
  assert.match(legacy, />0<\/td><td>Local interval in mmol\/L<\/td><td>mmol\/L/);
});

test('24-hour urine uric acid preserves daily-excretion units and actual collection details', () => {
  for (const name of ['Uric Acid(24 hrs Urine)', 'Uric Acid (24 hour urine)', '24 Hour Urine Uric Acid']) {
    const html = buildReportHtml(sampleReport({ name, parameters: [
      { parameter_name: 'Urine Uric Acid, 24 Hour', value: '600', unit: 'mg/24 h', normal_range: 'Local interval: 200 - 800' },
      { parameter_name: 'Urine Uric Acid Concentration', value: '40', unit: 'mg/dL' },
      { parameter_name: 'Total Urine Volume', value: '1500', unit: 'mL' },
      { parameter_name: 'Collection Duration', value: '24', unit: 'hours' },
      { parameter_name: 'Collection Start Date / Time', value: '2026-10-12 07:00' },
      { parameter_name: 'Collection End Date / Time', value: '2026-10-13 07:00' },
      { parameter_name: 'Collection Completeness / Comments', value: 'Complete collection\nDiet history recorded' },
    ] }));
    assert.match(html, /<div class="test-title">URIC ACID, 24-HOUR URINE<\/div>/);
    assert.match(html, /data-report-content="urine-uric-acid-24-hour"/);
    assert.match(html, />600<\/td><td>Local interval: 200 - 800<\/td><td>mg\/24 h/);
    assert.match(html, />40<\/td>/);
    assert.match(html, />1500<\/td>/);
    assert.match(html, /2026-10-12 07:00/);
    assert.match(html, /Complete collection<br \/>Diet history recorded/);
    assert.match(html, /&divide; 100\./);
    assert.match(html, /aged 18 years or older/);
    assert.equal(getFallbackReportParameters({ name })[0].unit, 'mg/24 h');
  }
  const blank = buildReportHtml(sampleReport({ name: 'Uric Acid(24 hrs Urine)', parameters: [] }));
  assert.match(blank, /<strong>Urine Uric Acid, 24 Hour<\/strong><\/td><td>-<\/td>/);
  assert.match(blank, /<strong>Collection Duration<\/strong><\/td><td>-<\/td>/);
  const partial = buildReportHtml(sampleReport({ name: 'Uric Acid(24 hrs Urine)', parameters: [
    { parameter_name: 'Urine Uric Acid Concentration', value: '40' },
    { parameter_name: 'Total Urine Volume', value: '1500' },
    { parameter_name: 'Collection Duration', value: '12' },
  ] }));
  assert.match(partial, /<strong>Urine Uric Acid, 24 Hour<\/strong><\/td><td>-<\/td>/);
  const serum = buildReportHtml(sampleReport({ name: 'Uric Acid', code: 'URIC_ACID', sample_type: 'Serum', parameters: [] }));
  assert.doesNotMatch(serum, /data-report-content="urine-uric-acid-24-hour"/);
  const random = buildReportHtml(sampleReport({ name: 'Uric Acid(Urine)', parameters: [] }));
  assert.doesNotMatch(random, /data-report-content="urine-uric-acid-24-hour"/);
});

test('Wound Swab Gram Stain reports actual cells and morphology with wound-site-specific guidance', () => {
  for (const name of ['Wound Swab Gram Stain', 'Wound Swab for Gram Stain', 'Wound Gram Stain', 'Gram Stain Wound Swab']) {
    const input = { name, parameters: [
      { parameter_name: 'Gram Stain Findings', value: 'Recorded <finding>\nMixed morphology', normal_range: 'Actual local reference' },
      { parameter_name: 'Specimen / Wound Site', value: 'Left foot wound\nExact site recorded' },
      { parameter_name: 'Collection Date / Time', value: 'Recorded collection time' },
      { parameter_name: 'Collection Context / Surface or Deep Site', value: 'Actual collection context' },
      { parameter_name: 'Smear Preparation / Stain Method', value: 'Recorded smear method' },
      { parameter_name: 'Specimen Adequacy', value: 'Actual adequacy assessment' },
      { parameter_name: 'Pus Cells', value: '12', normal_range: 'Local microscopy guide', unit: '/field' },
      { parameter_name: 'Squamous Epithelial Cells', value: 'Few observed' },
      { parameter_name: 'GPC', value: 'Few in clusters' },
      { parameter_name: 'Gram-positive Bacilli', value: 'Recorded GP rods' },
      { parameter_name: 'GNB', value: 'Recorded GN rods' },
      { parameter_name: 'Other Bacterial Morphology / Mixed Morphotypes', value: 'Recorded mixed forms' },
      { parameter_name: 'Yeast / Fungal Elements', value: 'Recorded yeast finding' },
      { parameter_name: 'Culture Status', value: 'Actual separately requested culture status' },
      { parameter_name: 'Comments / Limitations', value: 'Actual laboratory comment' },
    ], additional_report_text: 'Doctor advice' };
    const original = JSON.stringify(input);
    const html = buildReportHtml(sampleReport(input));
    assert.match(html, /<div class="test-title">WOUND SWAB - GRAM STAIN<\/div>/);
    assert.match(html, /data-report-content="wound-swab-gram-stain"/);
    assert.match(html, /Recorded &lt;finding&gt;<br \/>Mixed morphology<\/td><td>Actual local reference/);
    assert.match(html, /Left foot wound<br \/>Exact site recorded/);
    assert.match(html, /<strong>Inflammatory Cells \/ PMNs<\/strong><\/td><td>12<\/td><td>Local microscopy guide<\/td><td>\/field/);
    assert.match(html, /<strong>Gram-positive Cocci<\/strong><\/td><td>Few in clusters/);
    assert.match(html, /Recorded smear method/);
    assert.match(html, /Actual adequacy assessment/);
    assert.match(html, /Actual separately requested culture status/);
    assert.match(html, /do not apply sputum rejection thresholds to a wound swab/);
    assert.match(html, /A negative smear does not exclude infection/);
    assert.ok(html.indexOf('Doctor advice') > html.indexOf('Actual laboratory comment'));
    assert.ok(html.indexOf('Doctor advice') < html.indexOf('<div class="single-analyte-notes report-template-notes wound-swab-gram-stain-notes">'));
    assert.equal(JSON.stringify(input), original);
    const schema = getFallbackReportParameters({ name });
    assert.equal(schema.length, 17);
    assert.ok(schema.every(p => p.entryMode === 'manual'));
  }
});

test('Wound Swab Gram Stain preserves legacy and custom findings without inventing negative microscopy', () => {
  const blank = buildReportHtml(sampleReport({ name: 'Wound Swab Gram Stain', parameters: [] }));
  for (const label of ['Gram Stain Findings', 'Gram-positive Cocci', 'Gram-negative Bacilli']) assert.ok(blank.includes(`<strong>${label}</strong></td><td>-</td>`));
  assert.doesNotMatch(blank, /<strong>Culture \/ Specific Test Status, if performed<\/strong>/);
  assert.doesNotMatch(blank, /<strong>Gram Stain Findings<\/strong><\/td><td>No organisms seen<\/td>/);
  const legacy = buildReportHtml(sampleReport({ name: 'Wound Swab Gram Stain', parameters: [
    { parameter_name: 'Findings', value: 'Historical <finding>\nRetained', normal_range: 'Original reference', unit: 'original unit' },
    { parameter_name: 'Impression', value: 'Prior impression' },
    { parameter_name: 'Comments', value: 'Prior comments' },
    { parameter_name: 'Custom Count', value: '0', unit: 'local unit', normal_range: 'Local reference' },
  ] }));
  assert.match(legacy, /<strong>Gram Stain Findings<\/strong><\/td><td>Historical &lt;finding&gt;<br \/>Retained<\/td><td>Original reference<\/td><td>original unit/);
  assert.match(legacy, /Prior impression/);
  assert.match(legacy, /Prior comments/);
  assert.match(legacy, /<strong>Custom Count<\/strong><\/td><td>0<\/td><td>Local reference<\/td><td>local unit/);
  const partial = buildReportHtml(sampleReport({ name: 'Wound Swab Gram Stain', parameters: [{ parameter_name: 'Result', value: 'Organisms seen' }] }));
  assert.match(partial, /<strong>Gram Stain Findings<\/strong><\/td><td>Organisms seen<\/td>/);
  assert.match(partial, /<strong>Gram-positive Cocci<\/strong><\/td><td>-<\/td>/);
  const manual = buildReportHtml(sampleReport({ name: 'Wound Swab Gram Stain', report_body: 'Manual format <retained>', parameters: [] }));
  assert.match(manual, /Manual format &lt;retained&gt;/);
  assert.doesNotMatch(manual, /data-report-content="wound-swab-gram-stain"/);
  for (const name of ['Wound Swab AFB Stain', 'Vaginal Swab Gram Stain', 'PUS Gram Stain', 'Gram Stain of Smears', 'Swab Culture & Sensitivity for Any Site Swab']) assert.doesNotMatch(buildReportHtml(sampleReport({ name, parameters: [] })), /data-report-content="wound-swab-gram-stain"/);
});

test('Wound Swab Gram Stain schema repair protects used, bundled and custom records and keeps existing IDs', async () => {
  const db = await fixture();
  try {
    for (let i = 0; i < 9; i++) {
      await db.run('INSERT INTO tests (id,name,category,sample_type,report_body) VALUES (?,?,?,?,?)', [10110 + i, i === 6 ? 'Wound Swab AFB Stain' : i === 7 ? 'Wound Swab for Gram Stain' : 'Wound Swab Gram Stain', 'Imported legacy catalogue', i === 5 ? 'Cervical Swab' : null, i === 4 ? 'Manual format' : null]);
      for (const [order, name] of ['Findings', 'Impression', 'Comments'].entries()) await db.run('INSERT INTO test_parameters (test_id,parameter_name,unit,normal_range,entry_mode,display_order) VALUES (?,?,?,?,?,?)', [10110 + i, name, '', i === 3 ? 'Custom reference' : '', 'manual', order + 1]);
    }
    const original = await db.all('SELECT id FROM test_parameters WHERE test_id=10110 ORDER BY display_order');
    await db.run('INSERT INTO visit_tests VALUES (10111)');
    await db.run('INSERT INTO test_bundle_items VALUES (999,10112)');
    await db.run('INSERT INTO test_bundle_items VALUES (10118,999)');
    await ensureWoundSwabGramStainTestConfiguration(db);
    for (const id of [10110, 10117]) {
      const fields = await db.all('SELECT * FROM test_parameters WHERE test_id=? ORDER BY display_order', [id]);
      assert.deepEqual(fields.map(p => p.parameter_name), getFallbackReportParameters({ name: 'Wound Swab Gram Stain' }).map(p => p.parameterName));
      assert.equal((await db.get('SELECT sample_type FROM tests WHERE id=?', [id])).sample_type, 'Wound Swab');
      if (id === 10110) assert.deepEqual(fields.slice(0, 3).map(p => p.id), original.map(p => p.id));
    }
    for (const i of [1,2,3,4,5,6,8]) assert.equal((await db.get('SELECT COUNT(*) AS n FROM test_parameters WHERE test_id=?', [10110 + i])).n, 3);
    assert.equal((await db.get('SELECT COUNT(*) AS n FROM tests WHERE id BETWEEN 10110 AND 10118')).n, 9);
    await db.run("UPDATE test_parameters SET normal_range='Local override' WHERE test_id=10110 AND display_order=1");
    await ensureWoundSwabGramStainTestConfiguration(db);
    assert.equal((await db.get('SELECT normal_range FROM test_parameters WHERE test_id=10110 AND display_order=1')).normal_range, 'Local override');
  } finally { await db.close(); }
});

test('Wound Swab AFB Stain reports microscopy and grade with the actual wound site and sampling limitations', () => {
  for (const name of ['Wound Swab AFB Stain', 'Wound Swab for AFB Stain', 'Wound AFB Stain', 'AFB Stain Wound Swab']) {
    const input = { name, parameters: [
      { parameter_name: 'AFB Smear Microscopy Result', value: 'AFB seen', normal_range: 'Actual laboratory reference' },
      { parameter_name: 'AFB Smear Grade / Quantitation', value: 'Actual reported grade', normal_range: 'Local grading protocol' },
      { parameter_name: 'Specimen / Wound Site', value: 'Left leg wound swab' },
      { parameter_name: 'Collection Context / Surface or Deep Site', value: 'Actual surface collection context' },
      { parameter_name: 'Stain Method', value: 'Actual laboratory stain' },
      { parameter_name: 'Smear Preparation / Processing', value: 'Recorded processing' },
      { parameter_name: 'Specimen Adequacy', value: 'Actual adequacy assessment' },
      { parameter_name: 'Microscopy Remarks', value: 'Review <smear>\nRecorded observations' },
      { parameter_name: 'Culture / Molecular Test Status, if performed', value: 'Actual separately performed test status' },
      { parameter_name: 'Comments / Limitations', value: 'Actual laboratory comment' },
    ], additional_report_text: 'Doctor advice' };
    const original = JSON.stringify(input);
    const html = buildReportHtml(sampleReport(input));
    assert.match(html, /<div class="test-title">WOUND SWAB - AFB STAIN<\/div>/);
    assert.match(html, /data-report-content="wound-swab-afb-stain"/);
    assert.match(html, /<strong>AFB Smear Microscopy Result<\/strong><\/td><td>AFB seen<\/td><td>Actual laboratory reference/);
    assert.match(html, />Actual reported grade<\/td><td>Local grading protocol/);
    assert.match(html, /Left leg wound swab/);
    assert.match(html, /Actual surface collection context/);
    assert.match(html, /Actual laboratory stain/);
    assert.match(html, /Review &lt;smear&gt;<br \/>Recorded observations/);
    assert.match(html, /Actual separately performed test status/);
    assert.match(html, /a superficial swab is not equivalent to a deep specimen/);
    assert.match(html, /A negative smear does not exclude tuberculosis or another mycobacterial infection/);
    assert.ok(html.indexOf('Doctor advice') > html.indexOf('Actual laboratory comment'));
    assert.ok(html.indexOf('Doctor advice') < html.indexOf('<div class="single-analyte-notes report-template-notes wound-swab-afb-stain-notes">'));
    assert.equal(JSON.stringify(input), original);
    const schema = getFallbackReportParameters({ name });
    assert.equal(schema.length, 13);
    assert.ok(schema.every(p => p.entryMode === 'manual'));
  }
});

test('Wound Swab AFB Stain leaves missing results blank and retains historical findings without inferring grades', () => {
  const blank = buildReportHtml(sampleReport({ name: 'Wound Swab AFB Stain', parameters: [] }));
  assert.match(blank, /<strong>AFB Smear Microscopy Result<\/strong><\/td><td>-<\/td>/);
  assert.match(blank, /<strong>AFB Smear Grade \/ Quantitation<\/strong><\/td><td>-<\/td>/);
  assert.doesNotMatch(blank, /<strong>Culture \/ Molecular Test Status, if performed<\/strong>/);
  const legacy = buildReportHtml(sampleReport({ name: 'Wound Swab AFB Stain', parameters: [
    { parameter_name: 'Findings', value: 'Historical <finding>\nRetained' },
    { parameter_name: 'Impression', value: 'Prior impression' },
    { parameter_name: 'Comments', value: 'Prior comments' },
    { parameter_name: 'Custom Count', value: '0', unit: 'local unit', normal_range: 'Local reference' },
  ] }));
  assert.match(legacy, /<strong>Microscopy Remarks<\/strong><\/td><td colspan="3">Historical &lt;finding&gt;<br \/>Retained/);
  assert.match(legacy, /Prior impression/);
  assert.match(legacy, /Prior comments/);
  assert.match(legacy, /<strong>Custom Count<\/strong><\/td><td>0<\/td><td>Local reference<\/td><td>local unit/);
  const partial = buildReportHtml(sampleReport({ name: 'Wound Swab AFB Stain', parameters: [{ parameter_name: 'Result', value: 'AFB seen' }] }));
  assert.match(partial, /<strong>AFB Smear Microscopy Result<\/strong><\/td><td>AFB seen<\/td>/);
  assert.match(partial, /<strong>AFB Smear Grade \/ Quantitation<\/strong><\/td><td>-<\/td>/);
  const manual = buildReportHtml(sampleReport({ name: 'Wound Swab AFB Stain', report_body: 'Manual format <retained>', parameters: [] }));
  assert.match(manual, /Manual format &lt;retained&gt;/);
  assert.doesNotMatch(manual, /data-report-content="wound-swab-afb-stain"/);
  for (const name of ['Wound Swab Gram Stain', 'Vaginal Swab AFB Stain', 'PUS AFB Stain', 'AFB Culture & Sensitivity', 'Swab Culture & Sensitivity for Any Site Swab']) assert.doesNotMatch(buildReportHtml(sampleReport({ name, parameters: [] })), /data-report-content="wound-swab-afb-stain"/);
});

test('Wound Swab AFB Stain schema repair protects used, bundled and custom records and keeps existing IDs', async () => {
  const db = await fixture();
  try {
    for (let i = 0; i < 9; i++) {
      await db.run('INSERT INTO tests (id,name,category,sample_type,report_body) VALUES (?,?,?,?,?)', [10100 + i, i === 6 ? 'Wound Swab Gram Stain' : i === 7 ? 'Wound Swab for AFB Stain' : 'Wound Swab AFB Stain', 'Imported legacy catalogue', i === 5 ? 'Cervical Swab' : null, i === 4 ? 'Manual format' : null]);
      for (const [order, name] of ['Findings', 'Impression', 'Comments'].entries()) await db.run('INSERT INTO test_parameters (test_id,parameter_name,unit,normal_range,entry_mode,display_order) VALUES (?,?,?,?,?,?)', [10100 + i, name, '', i === 3 ? 'Custom reference' : '', 'manual', order + 1]);
    }
    const original = await db.all('SELECT id FROM test_parameters WHERE test_id=10100 ORDER BY display_order');
    await db.run('INSERT INTO visit_tests VALUES (10101)');
    await db.run('INSERT INTO test_bundle_items VALUES (999,10102)');
    await db.run('INSERT INTO test_bundle_items VALUES (10108,999)');
    await ensureWoundSwabAfbStainTestConfiguration(db);
    for (const id of [10100, 10107]) {
      const fields = await db.all('SELECT * FROM test_parameters WHERE test_id=? ORDER BY display_order', [id]);
      assert.deepEqual(fields.map(p => p.parameter_name), getFallbackReportParameters({ name: 'Wound Swab AFB Stain' }).map(p => p.parameterName));
      assert.equal((await db.get('SELECT sample_type FROM tests WHERE id=?', [id])).sample_type, 'Wound Swab');
      if (id === 10100) assert.deepEqual(fields.slice(0, 3).map(p => p.id), original.map(p => p.id));
    }
    for (const i of [1,2,3,4,5,6,8]) assert.equal((await db.get('SELECT COUNT(*) AS n FROM test_parameters WHERE test_id=?', [10100 + i])).n, 3);
    assert.equal((await db.get('SELECT COUNT(*) AS n FROM tests WHERE id BETWEEN 10100 AND 10108')).n, 9);
    await db.run("UPDATE test_parameters SET normal_range='Local override' WHERE test_id=10100 AND display_order=1");
    await ensureWoundSwabAfbStainTestConfiguration(db);
    assert.equal((await db.get('SELECT normal_range FROM test_parameters WHERE test_id=10100 AND display_order=1')).normal_range, 'Local override');
  } finally { await db.close(); }
});

test('Well Women Profile provides a proposed core with actual-only measurements and optional targeted results', () => {
  for (const name of ['Well Women Profile', 'WellWomenProfile', 'Well Woman Profile']) {
    const input = { name, parameters: [
      { parameter_name: 'Profile Scope / Tests Requested', value: 'CBC, glucose and lipids as requested' },
      { parameter_name: 'Specimen(s) / Collection Conditions', value: 'Actual EDTA blood and serum' },
      { parameter_name: 'Fasting Status / Hours', value: 'Fasting as recorded' },
      { parameter_name: 'Haemoglobin', value: '12.5', unit: 'g/dL', normal_range: 'Local female reference' },
      { parameter_name: 'Platelet Count', value: '250000', unit: 'cells/µL', normal_range: 'Local platelet reference' },
      { parameter_name: 'Fasting Plasma Glucose', value: '5.0', unit: 'mmol/L', normal_range: 'Local fasting mmol/L interval' },
      { parameter_name: 'Total Cholesterol', value: '180', unit: 'mg/dL' },
      { parameter_name: 'Ferritin, if ordered', value: '20', unit: 'ng/mL', normal_range: 'Actual ferritin interval' },
      { parameter_name: 'Comments / Limitations', value: 'Review <history>\nRecorded comment' },
    ], additional_report_text: 'Doctor advice' };
    const original = JSON.stringify(input);
    const html = buildReportHtml(sampleReport(input));
    assert.match(html, /<div class="test-title">WELL WOMEN PROFILE<\/div>/);
    assert.match(html, /data-report-content="well-women-profile"/);
    assert.match(html, /<strong>Haemoglobin<\/strong><\/td><td>12.5<\/td><td>Local female reference<\/td><td>g\/dL/);
    assert.match(html, /<strong>Fasting Plasma Glucose<\/strong><\/td><td>5.0<\/td><td>Local fasting mmol\/L interval<\/td><td>mmol\/L/);
    assert.match(html, /OPTIONAL TARGETED TESTS, ONLY IF ORDERED/);
    assert.match(html, /<strong>Ferritin, if ordered<\/strong><\/td><td>20<\/td><td>Actual ferritin interval/);
    assert.match(html, /Review &lt;history&gt;<br \/>Recorded comment/);
    assert.match(html, /not a universal screening order for all women/);
    assert.match(html, /Evidence is insufficient to support universal thyroid screening/);
    assert.ok(html.indexOf('Doctor advice') > html.indexOf('Recorded comment'));
    assert.ok(html.indexOf('Doctor advice') < html.indexOf('<div class="single-analyte-notes report-template-notes well-women-profile-notes">'));
    assert.equal(JSON.stringify(input), original);
    const schema = getFallbackReportParameters({ name });
    assert.equal(schema.length, 33);
    assert.ok(schema.every(p => p.entryMode === 'manual'));
    assert.ok(schema.every(p => !p.calculationFormula));
    assert.ok(!schema.some(p => /FSH|CA.?125|HIV|Vitamin|PAP|HPV|Urine Culture/.test(p.parameterName)));
  }
});

test('Well Women Profile does not fabricate optional assays, diagnoses or calculations and retains legacy results', () => {
  const blank = buildReportHtml(sampleReport({ name: 'Well Women Profile', parameters: [] }));
  assert.match(blank, /No results entered; not a normal or negative profile/);
  assert.doesNotMatch(blank, /<strong>Haemoglobin<\/strong>|<strong>HbA1c<\/strong>|<strong>Ferritin, if ordered<\/strong>|<strong>TSH, if ordered<\/strong>/);
  const legacy = buildReportHtml(sampleReport({ name: 'Well Women Profile', parameters: [
    { parameter_name: 'Result / Findings', value: 'Original <findings>\nRetained' },
    { parameter_name: 'Comments', value: 'Original comment' },
    { parameter_name: 'Custom Investigation', value: '0', unit: 'local unit', normal_range: 'Local reference' },
  ] }));
  assert.match(legacy, /<strong>Overall Findings<\/strong><\/td><td colspan="3">Original &lt;findings&gt;<br \/>Retained/);
  assert.match(legacy, /Original comment/);
  assert.match(legacy, /<strong>Custom Investigation<\/strong><\/td><td>0<\/td><td>Local reference<\/td><td>local unit/);
  const subset = buildReportHtml(sampleReport({ name: 'Well Women Profile', parameters: [
    { parameter_name: 'Total Cholesterol', value: '180' },
    { parameter_name: 'Triglycerides', value: '100' },
    { parameter_name: 'HDL', value: '55' },
    { parameter_name: 'Creatinine', value: '1.0' },
  ] }));
  assert.doesNotMatch(subset, /<strong>LDL Cholesterol<\/strong>|<strong>eGFR, if reported<\/strong>|<strong>TSH, if ordered<\/strong>/);
  const differentUnit = buildReportHtml(sampleReport({ name: 'Well Women Profile', parameters: [{ parameter_name: 'FPG', value: '5.0', unit: 'mmol/L' }] }));
  assert.match(differentUnit, /<strong>Fasting Plasma Glucose<\/strong><\/td><td>5.0<\/td><td>Laboratory-validated reference for the reported unit<\/td><td>mmol\/L/);
  const manual = buildReportHtml(sampleReport({ name: 'Well Women Profile', report_body: 'Manual format <retained>', parameters: [] }));
  assert.match(manual, /Manual format &lt;retained&gt;/);
  assert.doesNotMatch(manual, /data-report-content="well-women-profile"/);
  for (const name of ['Female Infertility Profile', 'Antenatal Profile', 'General Health Check Up', 'Complete Blood Count', 'Lipid Profile']) assert.doesNotMatch(buildReportHtml(sampleReport({ name, parameters: [] })), /data-report-content="well-women-profile"/);
});

test('Well Women Profile schema repair expands only unused generic placeholders and leaves bundle membership intact', async () => {
  const db = await fixture();
  try {
    for (let i = 0; i < 9; i++) {
      await db.run('INSERT INTO tests (id,name,category,sample_type,report_body) VALUES (?,?,?,?,?)', [10090 + i, i === 6 ? 'Female Infertility Profile' : i === 7 ? 'Well Woman Profile' : 'Well Women Profile', 'Imported legacy catalogue', i === 5 ? 'Urine' : null, i === 4 ? 'Manual format' : null]);
      for (const [order, name] of ['Result / Findings', 'Comments'].entries()) await db.run('INSERT INTO test_parameters (test_id,parameter_name,unit,normal_range,entry_mode,display_order) VALUES (?,?,?,?,?,?)', [10090 + i, name, '', i === 3 ? 'Custom reference' : '', 'manual', order + 1]);
    }
    const original = await db.all('SELECT id FROM test_parameters WHERE test_id=10090 ORDER BY display_order');
    await db.run('INSERT INTO visit_tests VALUES (10091)');
    await db.run('INSERT INTO test_bundle_items VALUES (999,10092)');
    await db.run('INSERT INTO test_bundle_items VALUES (10098,999)');
    const bundlesBefore = await db.all('SELECT * FROM test_bundle_items');
    await ensureWellWomenProfileTestConfiguration(db);
    for (const id of [10090, 10097]) {
      const fields = await db.all('SELECT * FROM test_parameters WHERE test_id=? ORDER BY display_order', [id]);
      assert.deepEqual(fields.map(p => p.parameter_name), getFallbackReportParameters({ name: 'Well Women Profile' }).map(p => p.parameterName));
      assert.equal(fields.length, 33);
      if (id === 10090) assert.deepEqual(fields.slice(0, 2).map(p => p.id), original.map(p => p.id));
    }
    for (const i of [1,2,3,4,5,6,8]) assert.equal((await db.get('SELECT COUNT(*) AS n FROM test_parameters WHERE test_id=?', [10090 + i])).n, 2);
    assert.deepEqual(await db.all('SELECT * FROM test_bundle_items'), bundlesBefore);
    assert.equal((await db.get('SELECT name FROM tests WHERE id=10090')).name, 'Well Women Profile');
    await db.run("UPDATE test_parameters SET normal_range='Local override' WHERE test_id=10090 AND parameter_name='Haemoglobin'");
    await ensureWellWomenProfileTestConfiguration(db);
    assert.equal((await db.get("SELECT normal_range FROM test_parameters WHERE test_id=10090 AND parameter_name='Haemoglobin'")).normal_range, 'Local override');
  } finally { await db.close(); }
});

test('Weil Felix Test reports OX2, OX19 and OXK separately with method-specific reference guidance', () => {
  for (const name of ['Well Felix Test', 'Weil Felix Test', 'Weil-Felix Test', 'Weil Felix', 'Well Felix']) {
    const input = { name, parameters: [
      { parameter_name: 'Proteus OX2 Result / Titre', value: '<1:20', normal_range: 'Local OX2 baseline' },
      { parameter_name: 'Proteus OX19 Result / Titre', value: '1:80', normal_range: 'Local OX19 baseline' },
      { parameter_name: 'Proteus OXK Result / Titre', value: '1:160', normal_range: 'Local OXK baseline' },
      { parameter_name: 'Method (Slide / Tube Agglutination)', value: 'Actual tube agglutination method' },
      { parameter_name: 'Kit / Reagent', value: 'Actual laboratory reagent' },
      { parameter_name: 'Laboratory Cut-off / Local Baseline', value: 'Actual local criteria' },
      { parameter_name: 'Fever Onset / Illness Timing', value: 'Reported illness timing' },
      { parameter_name: 'Paired Specimen / Comparison, if available', value: 'Actual laboratory paired comparison' },
      { parameter_name: 'Specific / Confirmatory Test Status, if performed', value: 'Actual specific test status' },
      { parameter_name: 'Comments / Limitations', value: 'Review <history>\nRecorded comment' },
    ], additional_report_text: 'Doctor advice' };
    const original = JSON.stringify(input);
    const html = buildReportHtml(sampleReport(input));
    assert.match(html, /<div class="test-title">WEIL-FELIX TEST<\/div>/);
    assert.match(html, /data-report-content="weil-felix"/);
    assert.match(html, /<strong>Proteus OX2 Result \/ Titre<\/strong><\/td><td>&lt;1:20<\/td><td>Local OX2 baseline/);
    assert.match(html, /<strong>Proteus OX19 Result \/ Titre<\/strong><\/td><td>1:80<\/td><td>Local OX19 baseline/);
    assert.match(html, /<strong>Proteus OXK Result \/ Titre<\/strong><\/td><td>1:160<\/td><td>Local OXK baseline/);
    assert.match(html, /Actual tube agglutination method/);
    assert.match(html, /Actual local criteria/);
    assert.match(html, /Actual laboratory paired comparison/);
    assert.match(html, /Actual specific test status/);
    assert.match(html, /Review &lt;history&gt;<br \/>Recorded comment/);
    assert.match(html, /A single universal titre threshold is not applied/);
    assert.match(html, /very low sensitivity and specificity/);
    assert.ok(html.indexOf('Doctor advice') > html.indexOf('Recorded comment'));
    assert.ok(html.indexOf('Doctor advice') < html.indexOf('<div class="single-analyte-notes report-template-notes weil-felix-notes">'));
    assert.equal(JSON.stringify(input), original);
    const schema = getFallbackReportParameters({ name });
    assert.equal(schema.length, 15);
    assert.ok(schema.every(p => p.entryMode === 'manual'));
  }
});

test('Weil Felix Test preserves overall legacy results without filling antigen titres or diagnoses', () => {
  const blank = buildReportHtml(sampleReport({ name: 'Well Felix Test', parameters: [] }));
  for (const antigen of ['OX2', 'OX19', 'OXK']) assert.match(blank, new RegExp(`<strong>Proteus ${antigen} Result / Titre</strong></td><td>-</td>`));
  assert.doesNotMatch(blank, /<strong>Overall Screening Result, if reported<\/strong>|<strong>Paired Specimen \/ Comparison, if available<\/strong>|<strong>Specific \/ Confirmatory Test Status, if performed<\/strong>/);
  const legacy = buildReportHtml(sampleReport({ name: 'Well Felix Test', parameters: [
    { parameter_name: 'Result', value: 'Original reactive screen' },
    { parameter_name: 'Findings', value: 'Historical <finding>\nRetained' },
    { parameter_name: 'Impression', value: 'Prior interpretation' },
    { parameter_name: 'Custom Parameter', value: '0', unit: 'local unit', normal_range: 'Local reference' },
  ] }));
  assert.match(legacy, /<strong>Overall Screening Result, if reported<\/strong><\/td><td colspan="3">Original reactive screen/);
  assert.match(legacy, /Historical &lt;finding&gt;<br \/>Retained/);
  assert.match(legacy, /Prior interpretation/);
  assert.match(legacy, /<strong>Custom Parameter<\/strong><\/td><td>0<\/td><td>Local reference<\/td><td>local unit/);
  for (const antigen of ['OX2', 'OX19', 'OXK']) assert.match(legacy, new RegExp(`<strong>Proteus ${antigen} Result / Titre</strong></td><td>-</td>`));
  const partial = buildReportHtml(sampleReport({ name: 'Well Felix Test', parameters: [{ parameter_name: 'OX2', value: 'Reactive (slide)' }, { parameter_name: 'OXK', value: '1:160' }] }));
  assert.match(partial, /<strong>Proteus OX2 Result \/ Titre<\/strong><\/td><td>Reactive \(slide\)<\/td>/);
  assert.match(partial, /<strong>Proteus OX19 Result \/ Titre<\/strong><\/td><td>-<\/td>/);
  assert.match(partial, /<strong>Laboratory Interpretation<\/strong><\/td><td colspan="3">-<\/td>/);
  const manual = buildReportHtml(sampleReport({ name: 'Well Felix Test', report_body: 'Manual format <retained>', parameters: [] }));
  assert.match(manual, /Manual format &lt;retained&gt;/);
  assert.doesNotMatch(manual, /data-report-content="weil-felix"/);
  for (const name of ['Widal', 'Scrub Typhus IgM', 'Leptospira Antibody IgM', 'VDRL', 'Wasserman Test']) assert.doesNotMatch(buildReportHtml(sampleReport({ name, parameters: [] })), /data-report-content="weil-felix"/);
});

test('Weil Felix Test schema repair expands unused placeholders and preserves custom formats and catalogue names', async () => {
  const db = await fixture();
  try {
    for (let i = 0; i < 9; i++) {
      await db.run('INSERT INTO tests (id,name,category,sample_type,report_body) VALUES (?,?,?,?,?)', [10080 + i, i === 6 ? 'Widal' : i === 7 ? 'Weil-Felix Test' : 'Well Felix Test', 'Imported legacy catalogue', i === 5 ? 'Urine' : null, i === 4 ? 'Manual format' : null]);
      await db.run('INSERT INTO test_parameters (test_id,parameter_name,unit,normal_range,entry_mode,display_order) VALUES (?,?,?,?,?,?)', [10080 + i, 'Result', i === 3 ? 'Custom unit' : '', '', 'manual', 1]);
    }
    const original = await db.get('SELECT id FROM test_parameters WHERE test_id=10080');
    await db.run('INSERT INTO visit_tests VALUES (10081)');
    await db.run('INSERT INTO test_bundle_items VALUES (999,10082)');
    await db.run('INSERT INTO test_bundle_items VALUES (10088,999)');
    await ensureWeilFelixTestConfiguration(db);
    for (const id of [10080, 10087]) {
      const fields = await db.all('SELECT * FROM test_parameters WHERE test_id=? ORDER BY display_order', [id]);
      assert.deepEqual(fields.map(p => p.parameter_name), getFallbackReportParameters({ name: 'Well Felix Test' }).map(p => p.parameterName));
      assert.equal((await db.get('SELECT sample_type FROM tests WHERE id=?', [id])).sample_type, 'Serum');
      if (id === 10080) assert.equal(fields[0].id, original.id);
    }
    for (const i of [1,2,3,4,5,6,8]) assert.equal((await db.get('SELECT COUNT(*) AS n FROM test_parameters WHERE test_id=?', [10080 + i])).n, 1);
    assert.equal((await db.get('SELECT COUNT(*) AS n FROM tests WHERE id BETWEEN 10080 AND 10088')).n, 9);
    assert.equal((await db.get('SELECT name FROM tests WHERE id=10080')).name, 'Well Felix Test');
    await db.run("UPDATE test_parameters SET normal_range='Local override' WHERE test_id=10080 AND parameter_name='Proteus OX2 Result / Titre'");
    await ensureWeilFelixTestConfiguration(db);
    assert.equal((await db.get("SELECT normal_range FROM test_parameters WHERE test_id=10080 AND parameter_name='Proteus OX2 Result / Titre'")).normal_range, 'Local override');
  } finally { await db.close(); }
});

test('Van den Bergh Reaction reports the observed qualitative reaction and separately entered bilirubin values', () => {
  for (const name of ['Vanden Burgh Reaction', 'Van den Burgh Reaction', 'Vanden Bergh Reaction', 'Van den Bergh Reaction', 'Van den Bergh Test', 'Van den Burgh Test']) {
    const input = { name, parameters: [
      { parameter_name: 'Van den Bergh Reaction Result', value: 'Actual observed reaction', normal_range: 'Local qualitative criteria' },
      { parameter_name: 'Reaction Category (Direct / Indirect / Biphasic), if assigned', value: 'Biphasic (laboratory-assigned)' },
      { parameter_name: 'Observed Colour / Reaction', value: 'Recorded colour' },
      { parameter_name: 'Reaction Timing / Accelerator Details', value: 'Actual protocol timing and accelerator' },
      { parameter_name: 'Method / Reagent', value: 'Actual laboratory diazo method' },
      { parameter_name: 'Total Bilirubin, if measured', value: '30', unit: 'µmol/L', normal_range: 'Local total interval' },
      { parameter_name: 'Direct Bilirubin, if measured', value: '10', unit: 'µmol/L', normal_range: 'Local direct interval' },
      { parameter_name: 'Comments / Limitations', value: 'Review <sample>\nRecorded comment' },
    ], additional_report_text: 'Doctor advice' };
    const original = JSON.stringify(input);
    const html = buildReportHtml(sampleReport(input));
    assert.match(html, /<div class="test-title">VAN DEN BERGH REACTION<\/div>/);
    assert.match(html, /data-report-content="van-den-bergh-reaction"/);
    assert.match(html, /Actual observed reaction<\/td><td>Local qualitative criteria/);
    assert.match(html, /Biphasic \(laboratory-assigned\)/);
    assert.match(html, /Recorded colour/);
    assert.match(html, /Actual protocol timing and accelerator/);
    assert.match(html, /Actual laboratory diazo method/);
    assert.match(html, /<strong>Total Bilirubin, if measured<\/strong><\/td><td>30<\/td><td>Local total interval<\/td><td>µmol\/L/);
    assert.match(html, /<strong>Direct Bilirubin, if measured<\/strong><\/td><td>10<\/td><td>Local direct interval<\/td><td>µmol\/L/);
    assert.doesNotMatch(html, /<strong>Indirect Bilirubin, if reported<\/strong>/);
    assert.match(html, /Review &lt;sample&gt;<br \/>Recorded comment/);
    assert.match(html, /A qualitative reaction category is not a bilirubin concentration/);
    assert.ok(html.indexOf('Doctor advice') > html.indexOf('Recorded comment'));
    assert.ok(html.indexOf('Doctor advice') < html.indexOf('<div class="single-analyte-notes report-template-notes van-den-bergh-reaction-notes">'));
    assert.equal(JSON.stringify(input), original);
    const schema = getFallbackReportParameters({ name });
    assert.equal(schema.length, 14);
    assert.equal(schema[0].unit, '');
    assert.ok(schema.every(p => p.entryMode === 'manual'));
  }
});

test('Van den Bergh Reaction retains legacy results and does not infer categories or concentrations', () => {
  const blank = buildReportHtml(sampleReport({ name: 'Vanden Burgh Reaction', parameters: [] }));
  assert.match(blank, /<strong>Van den Bergh Reaction Result<\/strong><\/td><td>-<\/td>/);
  assert.doesNotMatch(blank, /<strong>Reaction Category \(Direct \/ Indirect \/ Biphasic\), if assigned<\/strong>|SEPARATELY REPORTED BILIRUBIN VALUES/);
  const legacy = buildReportHtml(sampleReport({ name: 'Vanden Burgh Reaction', parameters: [
    { parameter_name: 'Result', value: 'Historical <reaction>\nRetained', unit: 'Recorded legacy unit', normal_range: 'Local reference' },
    { parameter_name: 'Findings', value: 'Original findings' },
    { parameter_name: 'Impression', value: 'Prior interpretation' },
  ] }));
  assert.match(legacy, /Historical &lt;reaction&gt;<br \/>Retained<\/td><td>Local reference<\/td><td>Recorded legacy unit/);
  assert.match(legacy, /Original findings/);
  assert.match(legacy, /Prior interpretation/);
  const colourOnly = buildReportHtml(sampleReport({ name: 'Vanden Burgh Reaction', parameters: [{ parameter_name: 'Observed Colour', value: 'Pink-red' }] }));
  assert.match(colourOnly, /Pink-red/);
  assert.match(colourOnly, /<strong>Van den Bergh Reaction Result<\/strong><\/td><td>-<\/td>/);
  assert.doesNotMatch(colourOnly, /<strong>Reaction Category \(Direct \/ Indirect \/ Biphasic\), if assigned<\/strong>/);
  const measuredZero = buildReportHtml(sampleReport({ name: 'Van den Bergh Reaction', parameters: [{ parameter_name: 'Indirect Bilirubin', value: '0', unit: 'mg/dL', normal_range: 'Actual reported interval' }] }));
  assert.match(measuredZero, /<strong>Indirect Bilirubin, if reported<\/strong><\/td><td>0<\/td><td>Actual reported interval<\/td><td>mg\/dL/);
  const manual = buildReportHtml(sampleReport({ name: 'Vanden Burgh Reaction', report_body: 'Manual format <retained>', parameters: [] }));
  assert.match(manual, /Manual format &lt;retained&gt;/);
  assert.doesNotMatch(manual, /data-report-content="van-den-bergh-reaction"/);
  for (const name of ['Bilirubin Total, Direct & Indirect', 'Indirect Bilirubin', 'Urine Urobilinogen', 'Urine Bilirubin', 'VDRL', 'Valproic Acid']) assert.doesNotMatch(buildReportHtml(sampleReport({ name, parameters: [] })), /data-report-content="van-den-bergh-reaction"/);
});

test('Van den Bergh Reaction schema repair expands only unused placeholders and preserves names and IDs', async () => {
  const db = await fixture();
  try {
    for (let i = 0; i < 9; i++) {
      await db.run('INSERT INTO tests (id,name,category,sample_type,report_body) VALUES (?,?,?,?,?)', [10070 + i, i === 6 ? 'Bilirubin Total, Direct & Indirect' : i === 7 ? 'Van den Bergh Reaction' : 'Vanden Burgh Reaction', 'Imported legacy catalogue', i === 5 ? 'Urine' : null, i === 4 ? 'Manual format' : null]);
      await db.run('INSERT INTO test_parameters (test_id,parameter_name,unit,normal_range,entry_mode,display_order) VALUES (?,?,?,?,?,?)', [10070 + i, 'Result', '', i === 3 ? 'Custom reference' : '', 'manual', 1]);
    }
    const original = await db.get('SELECT id FROM test_parameters WHERE test_id=10070');
    await db.run('INSERT INTO visit_tests VALUES (10071)');
    await db.run('INSERT INTO test_bundle_items VALUES (999,10072)');
    await db.run('INSERT INTO test_bundle_items VALUES (10078,999)');
    await ensureVanDenBerghReactionTestConfiguration(db);
    for (const id of [10070, 10077]) {
      const fields = await db.all('SELECT * FROM test_parameters WHERE test_id=? ORDER BY display_order', [id]);
      assert.deepEqual(fields.map(p => p.parameter_name), getFallbackReportParameters({ name: 'Van den Bergh Reaction' }).map(p => p.parameterName));
      assert.equal((await db.get('SELECT sample_type FROM tests WHERE id=?', [id])).sample_type, 'Serum');
      if (id === 10070) assert.equal(fields[0].id, original.id);
    }
    for (const i of [1,2,3,4,5,6,8]) assert.equal((await db.get('SELECT COUNT(*) AS n FROM test_parameters WHERE test_id=?', [10070 + i])).n, 1);
    assert.equal((await db.get('SELECT COUNT(*) AS n FROM tests WHERE id BETWEEN 10070 AND 10078')).n, 9);
    assert.equal((await db.get('SELECT name FROM tests WHERE id=10070')).name, 'Vanden Burgh Reaction');
    await db.run("UPDATE test_parameters SET normal_range='Local override' WHERE test_id=10070 AND display_order=1");
    await ensureVanDenBerghReactionTestConfiguration(db);
    assert.equal((await db.get('SELECT normal_range FROM test_parameters WHERE test_id=10070 AND display_order=1')).normal_range, 'Local override');
  } finally { await db.close(); }
});

test('Valproate Level reports measured concentration with dose and sampling context without automated dose advice', () => {
  for (const name of ['Valporic Acid (Sodium valproate)', 'Valproic Acid (Sodium Valproate)', 'Valproic Acid', 'Valporic Acid', 'Sodium Valproate', 'Valproate Level']) {
    const input = { name, parameters: [
      { parameter_name: 'Valproic Acid (Valproate) Level', value: '68', unit: 'mg/L', normal_range: 'Actual laboratory total-level interval' },
      { parameter_name: 'Measurement Basis (Total / Free)', value: 'Total' },
      { parameter_name: 'Specimen', value: 'Serum' },
      { parameter_name: 'Collection Date / Time', value: '2026-10-14 08:00' },
      { parameter_name: 'Dose / Regimen', value: 'Actual prescribed regimen' },
      { parameter_name: 'Last Dose Date / Time', value: '2026-10-13 20:00' },
      { parameter_name: 'Sampling Timing (Trough / Peak / Random)', value: 'Trough (recorded)' },
      { parameter_name: 'Time Since Last Dose, if supplied', value: '12', unit: 'hours' },
      { parameter_name: 'Method / Analyzer', value: 'Actual laboratory assay' },
      { parameter_name: 'Critical Result Communication, if applicable', value: 'Actual communication record' },
      { parameter_name: 'Comments / Limitations', value: 'Review <history>\nRecorded comment' },
    ], additional_report_text: 'Doctor advice' };
    const original = JSON.stringify(input);
    const html = buildReportHtml(sampleReport(input));
    assert.match(html, /<div class="test-title">VALPROIC ACID \(VALPROATE\) LEVEL<\/div>/);
    assert.match(html, /data-report-content="valproate-level"/);
    assert.match(html, /<strong>Valproic Acid \(Valproate\) Level<\/strong><\/td><td>68<\/td><td>Actual laboratory total-level interval<\/td><td>mg\/L/);
    assert.match(html, /Actual prescribed regimen/);
    assert.match(html, /Trough \(recorded\)/);
    assert.match(html, /<strong>Time Since Last Dose<\/strong><\/td><td>12<\/td><td><\/td><td>hours/);
    assert.match(html, /Actual laboratory assay/);
    assert.match(html, /Actual communication record/);
    assert.match(html, /Review &lt;history&gt;<br \/>Recorded comment/);
    assert.match(html, /not a universal trough target/);
    assert.match(html, /Do not apply the total-drug range to a free result/);
    assert.match(html, /No dose adjustment, free fraction, albumin correction or time-since-dose calculation/);
    assert.ok(html.indexOf('Doctor advice') > html.indexOf('Recorded comment'));
    assert.ok(html.indexOf('Doctor advice') < html.indexOf('<div class="single-analyte-notes report-template-notes valproate-level-notes">'));
    assert.equal(JSON.stringify(input), original);
    const schema = getFallbackReportParameters({ name });
    assert.equal(schema.length, 13);
    assert.equal(schema[0].unit, 'µg/mL');
    assert.ok(schema.every(p => p.entryMode === 'manual'));
  }
});

test('Valproate Level keeps total and free assays distinct and retains legacy results without fabricated timing or concentration', () => {
  const blank = buildReportHtml(sampleReport({ name: 'Valporic Acid (Sodium valproate)', parameters: [] }));
  assert.match(blank, /<strong>Valproic Acid \(Valproate\) Level<\/strong><\/td><td>-<\/td>/);
  assert.match(blank, /<strong>Measurement Basis \(Total \/ Free\)<\/strong><\/td><td colspan="3">-<\/td>/);
  assert.doesNotMatch(blank, /<strong>Time Since Last Dose<\/strong>|<strong>Critical Result Communication, if applicable<\/strong>/);
  const legacy = buildReportHtml(sampleReport({ name: 'Valproic Acid', parameters: [
    { parameter_name: 'Result', value: '0', unit: 'mg/L', normal_range: 'Local reference' },
    { parameter_name: 'Findings', value: 'Historical <finding>\nRetained' },
    { parameter_name: 'Impression', value: 'Prior impression' },
  ] }));
  assert.match(legacy, /<strong>Valproic Acid \(Valproate\) Level<\/strong><\/td><td>0<\/td><td>Local reference<\/td><td>mg\/L/);
  assert.match(legacy, /Historical &lt;finding&gt;<br \/>Retained/);
  assert.match(legacy, /Prior impression/);
  const freeOnly = buildReportHtml(sampleReport({ name: 'Valproic Acid', parameters: [{ parameter_name: 'Free Valproic Acid', value: '9', unit: 'µg/mL', normal_range: 'Actual free assay interval' }] }));
  assert.match(freeOnly, /<strong>Valproic Acid, Free \(reported\)<\/strong><\/td><td>9<\/td><td>Actual free assay interval/);
  assert.doesNotMatch(freeOnly, /<strong>Valproic Acid, Total \(reported\)<\/strong>|<strong>Valproic Acid \(Valproate\) Level<\/strong>/);
  const totalOnly = buildReportHtml(sampleReport({ name: 'Valproic Acid', parameters: [{ parameter_name: 'Total Valproic Acid', value: '60' }, { parameter_name: 'Collection Date / Time', value: '2026-10-14 08:00' }, { parameter_name: 'Last Dose Date / Time', value: '2026-10-13 20:00' }] }));
  assert.match(totalOnly, /<strong>Valproic Acid, Total \(reported\)<\/strong><\/td><td>60<\/td>/);
  assert.doesNotMatch(totalOnly, /<strong>Valproic Acid, Free \(reported\)<\/strong>|<strong>Time Since Last Dose<\/strong>/);
  const manual = buildReportHtml(sampleReport({ name: 'Valproic Acid', report_body: 'Manual format <retained>', parameters: [] }));
  assert.match(manual, /Manual format &lt;retained&gt;/);
  assert.doesNotMatch(manual, /data-report-content="valproate-level"/);
  for (const name of ['Valproic Acid, Free', 'Valproic Acid, Free and Total', 'Lithium', 'Phenytoin / Dilantin', 'Phenobarbital']) assert.doesNotMatch(buildReportHtml(sampleReport({ name, parameters: [] })), /data-report-content="valproate-level"/);
});

test('Valproate Level schema repair protects used, bundled and custom records without renaming the catalogue entry', async () => {
  const db = await fixture();
  try {
    for (let i = 0; i < 9; i++) {
      await db.run('INSERT INTO tests (id,name,category,sample_type,report_body) VALUES (?,?,?,?,?)', [10060 + i, i === 6 ? 'Valproic Acid, Free' : i === 7 ? 'Valproic Acid' : 'Valporic Acid (Sodium valproate)', 'Imported legacy catalogue', i === 5 ? 'Urine' : null, i === 4 ? 'Manual format' : null]);
      await db.run('INSERT INTO test_parameters (test_id,parameter_name,unit,normal_range,entry_mode,display_order) VALUES (?,?,?,?,?,?)', [10060 + i, 'Result', i === 3 ? 'Custom unit' : '', '', 'manual', 1]);
    }
    const original = await db.get('SELECT id FROM test_parameters WHERE test_id=10060');
    await db.run('INSERT INTO visit_tests VALUES (10061)');
    await db.run('INSERT INTO test_bundle_items VALUES (999,10062)');
    await db.run('INSERT INTO test_bundle_items VALUES (10068,999)');
    await ensureValproateLevelTestConfiguration(db);
    for (const id of [10060, 10067]) {
      const fields = await db.all('SELECT * FROM test_parameters WHERE test_id=? ORDER BY display_order', [id]);
      assert.deepEqual(fields.map(p => p.parameter_name), getFallbackReportParameters({ name: 'Valproic Acid' }).map(p => p.parameterName));
      assert.equal((await db.get('SELECT sample_type FROM tests WHERE id=?', [id])).sample_type, 'Serum');
      if (id === 10060) assert.equal(fields[0].id, original.id);
    }
    for (const i of [1,2,3,4,5,6,8]) assert.equal((await db.get('SELECT COUNT(*) AS n FROM test_parameters WHERE test_id=?', [10060 + i])).n, 1);
    assert.equal((await db.get('SELECT COUNT(*) AS n FROM tests WHERE id BETWEEN 10060 AND 10068')).n, 9);
    assert.equal((await db.get('SELECT name FROM tests WHERE id=10060')).name, 'Valporic Acid (Sodium valproate)');
    await db.run("UPDATE test_parameters SET normal_range='Local override' WHERE test_id=10060 AND display_order=1");
    await ensureValproateLevelTestConfiguration(db);
    assert.equal((await db.get('SELECT normal_range FROM test_parameters WHERE test_id=10060 AND display_order=1')).normal_range, 'Local override');
  } finally { await db.close(); }
});

test('Vaginal Swab Gram Stain reports cells, morphotypes and optional verified Nugent assessment', () => {
  for (const name of ['Vaginal Swab Gram Stain', 'Vaginal Swab for Gram Stain', 'Vaginal Gram Stain', 'Gram Stain Vaginal Swab', 'Vaginal Swab for Fram Stain']) {
    const input = { name, parameters: [
      { parameter_name: 'Gram Stain Findings', value: 'Actual reported microscopy', normal_range: 'Local microscopy interpretation' },
      { parameter_name: 'Specimen / Collection Site', value: 'High vaginal swab' },
      { parameter_name: 'Smear Preparation / Stain Method', value: 'Actual Gram-stain preparation' },
      { parameter_name: 'Inflammatory Cells / PMNs', value: '4', unit: '/HPF', normal_range: 'Local cell reference' },
      { parameter_name: 'Clue Cells', value: 'Reported finding' },
      { parameter_name: 'Lactobacillus-type Morphotypes', value: 'Recorded abundance' },
      { parameter_name: 'Small Gram-variable / Gram-negative Rods', value: 'Recorded small rods' },
      { parameter_name: 'Curved Rod Morphotypes', value: 'Recorded curved rods' },
      { parameter_name: 'Yeast / Fungal Elements', value: 'Actual observation' },
      { parameter_name: 'Nugent Score, if assessed', value: '0', normal_range: 'Local validated scoring reference' },
      { parameter_name: 'Nugent Interpretation, if assessed', value: 'Reported laboratory category' },
      { parameter_name: 'Comments / Limitations', value: 'Review <smear>\nRecorded comment' },
    ], additional_report_text: 'Doctor advice' };
    const original = JSON.stringify(input);
    const html = buildReportHtml(sampleReport(input));
    assert.match(html, /<div class="test-title">VAGINAL SWAB - GRAM STAIN<\/div>/);
    assert.match(html, /data-report-content="vaginal-swab-gram-stain"/);
    assert.match(html, /Actual reported microscopy<\/td><td>Local microscopy interpretation/);
    assert.match(html, /<strong>Inflammatory Cells \/ PMNs<\/strong><\/td><td>4<\/td><td>Local cell reference<\/td><td>\/HPF/);
    assert.match(html, /Actual Gram-stain preparation/);
    assert.match(html, /Recorded abundance/);
    assert.match(html, /Recorded small rods/);
    assert.match(html, /Recorded curved rods/);
    assert.match(html, /<strong>Nugent Score, if assessed<\/strong><\/td><td>0<\/td><td>Local validated scoring reference/);
    assert.match(html, /Reported laboratory category/);
    assert.match(html, /Review &lt;smear&gt;<br \/>Recorded comment/);
    assert.match(html, /4 - 6: intermediate microbiota/);
    assert.match(html, /7 - 10: consistent with bacterial vaginosis/);
    assert.ok(html.indexOf('Doctor advice') > html.indexOf('Recorded comment'));
    assert.ok(html.indexOf('Doctor advice') < html.indexOf('<div class="single-analyte-notes report-template-notes vaginal-swab-gram-stain-notes">'));
    assert.equal(JSON.stringify(input), original);
    const schema = getFallbackReportParameters({ name });
    assert.equal(schema.length, 19);
    assert.ok(schema.every(p => p.entryMode === 'manual'));
  }
});

test('Vaginal Swab Gram Stain keeps absent entries blank and does not calculate Nugent scores or diagnostic categories', () => {
  const blank = buildReportHtml(sampleReport({ name: 'Vaginal Swab Gram Stain', parameters: [] }));
  assert.match(blank, /<strong>Gram Stain Findings<\/strong><\/td><td>-<\/td>/);
  assert.match(blank, /<strong>Clue Cells<\/strong><\/td><td>-<\/td>/);
  assert.match(blank, /<strong>Yeast \/ Fungal Elements<\/strong><\/td><td>-<\/td>/);
  assert.doesNotMatch(blank, /<strong>Nugent Score, if assessed<\/strong>|<strong>Nugent Interpretation, if assessed<\/strong>|<strong>Culture \/ Specific Test Status, if performed<\/strong>/);
  const legacy = buildReportHtml(sampleReport({ name: 'Vaginal Swab Gram Stain', parameters: [
    { parameter_name: 'Findings', value: 'Historical <finding>\nRetained' },
    { parameter_name: 'Impression', value: 'Prior impression' },
    { parameter_name: 'Comments', value: 'Prior comments' },
    { parameter_name: 'Custom Count', value: '0', unit: 'local unit', normal_range: 'Local reference' },
  ] }));
  assert.match(legacy, /<strong>Gram Stain Findings<\/strong><\/td><td>Historical &lt;finding&gt;<br \/>Retained/);
  assert.match(legacy, /Prior impression/);
  assert.match(legacy, /Prior comments/);
  assert.match(legacy, /<strong>Custom Count<\/strong><\/td><td>0<\/td><td>Local reference<\/td><td>local unit/);
  const morphologyOnly = buildReportHtml(sampleReport({ name: 'Vaginal Swab Gram Stain', parameters: [{ parameter_name: 'Lactobacilli', value: 'Present' }, { parameter_name: 'Clue Cells', value: 'Present' }] }));
  assert.doesNotMatch(morphologyOnly, /<strong>Nugent Score, if assessed<\/strong>/);
  const scoreOnly = buildReportHtml(sampleReport({ name: 'Vaginal Swab Gram Stain', parameters: [{ parameter_name: 'Nugent Score', value: '8' }] }));
  assert.match(scoreOnly, /<strong>Nugent Score, if assessed<\/strong><\/td><td>8<\/td>/);
  assert.doesNotMatch(scoreOnly, /<strong>Nugent Interpretation, if assessed<\/strong>/);
  const manual = buildReportHtml(sampleReport({ name: 'Vaginal Swab Gram Stain', report_body: 'Manual format <retained>', parameters: [] }));
  assert.match(manual, /Manual format &lt;retained&gt;/);
  assert.doesNotMatch(manual, /data-report-content="vaginal-swab-gram-stain"/);
  for (const name of ['Vaginal / Cervical swab', 'Vaginal Swab AFB Stain', 'Cervical Swab Gram Stain', 'Vaginal Swab Culture', 'Gram Stain for Bacterial Vaginosis (BV)', 'Vaginal Smear for PAP Stain']) assert.doesNotMatch(buildReportHtml(sampleReport({ name, parameters: [] })), /data-report-content="vaginal-swab-gram-stain"/);
});

test('Vaginal Swab Gram Stain schema repair expands both unused entries without renaming or deleting custom data', async () => {
  const db = await fixture();
  try {
    for (let i = 0; i < 9; i++) {
      await db.run('INSERT INTO tests (id,name,category,sample_type,report_body) VALUES (?,?,?,?,?)', [10050 + i, i === 6 ? 'Cervical Swab Gram Stain' : i === 7 ? 'Vaginal Swab for Fram Stain' : 'Vaginal Swab Gram Stain', 'Imported legacy catalogue', i === 5 ? 'Cervical Swab' : null, i === 4 ? 'Manual format' : null]);
      for (const [order, name] of ['Findings', 'Impression', 'Comments'].entries()) await db.run('INSERT INTO test_parameters (test_id,parameter_name,unit,normal_range,entry_mode,display_order) VALUES (?,?,?,?,?,?)', [10050 + i, name, '', i === 3 ? 'Custom reference' : '', 'manual', order + 1]);
    }
    const original = await db.all('SELECT id FROM test_parameters WHERE test_id=10050 ORDER BY display_order');
    await db.run('INSERT INTO visit_tests VALUES (10051)');
    await db.run('INSERT INTO test_bundle_items VALUES (999,10052)');
    await db.run('INSERT INTO test_bundle_items VALUES (10058,999)');
    await ensureVaginalSwabGramStainTestConfiguration(db);
    for (const id of [10050, 10057]) {
      const fields = await db.all('SELECT * FROM test_parameters WHERE test_id=? ORDER BY display_order', [id]);
      assert.deepEqual(fields.map(p => p.parameter_name), getFallbackReportParameters({ name: 'Vaginal Swab Gram Stain' }).map(p => p.parameterName));
      assert.equal((await db.get('SELECT sample_type FROM tests WHERE id=?', [id])).sample_type, 'Vaginal Swab');
      if (id === 10050) assert.deepEqual(fields.slice(0, 3).map(p => p.id), original.map(p => p.id));
    }
    for (const i of [1,2,3,4,5,6,8]) assert.equal((await db.get('SELECT COUNT(*) AS n FROM test_parameters WHERE test_id=?', [10050 + i])).n, 3);
    assert.equal((await db.get('SELECT COUNT(*) AS n FROM tests WHERE id BETWEEN 10050 AND 10058')).n, 9);
    assert.equal((await db.get('SELECT name FROM tests WHERE id=10057')).name, 'Vaginal Swab for Fram Stain');
    await db.run("UPDATE test_parameters SET normal_range='Local override' WHERE test_id=10050 AND display_order=1");
    await ensureVaginalSwabGramStainTestConfiguration(db);
    assert.equal((await db.get('SELECT normal_range FROM test_parameters WHERE test_id=10050 AND display_order=1')).normal_range, 'Local override');
  } finally { await db.close(); }
});

test('Vaginal Swab AFB Stain reports actual microscopy, grading and method with explanatory limitations', () => {
  for (const name of ['Vaginal Swab AFB Stain', 'Vaginal Swab for AFB Stain', 'Vaginal AFB Stain', 'AFB Stain Vaginal Swab']) {
    const input = { name, parameters: [
      { parameter_name: 'AFB Smear Microscopy Result', value: 'AFB seen', normal_range: 'Actual laboratory reference' },
      { parameter_name: 'AFB Smear Grade / Quantitation', value: 'Recorded grade', normal_range: 'Validated local grading protocol' },
      { parameter_name: 'Specimen / Collection Site', value: 'High vaginal swab' },
      { parameter_name: 'Stain Method', value: 'Actual laboratory stain' },
      { parameter_name: 'Smear Preparation / Processing', value: 'Recorded processing' },
      { parameter_name: 'Specimen Adequacy', value: 'Actual adequacy assessment' },
      { parameter_name: 'Microscopy Remarks', value: 'Review <smear>\nRecorded observations' },
      { parameter_name: 'Culture / Molecular Test Status, if performed', value: 'Actual separately performed test status' },
      { parameter_name: 'Comments / Limitations', value: 'Actual laboratory comment' },
    ], additional_report_text: 'Doctor advice' };
    const original = JSON.stringify(input);
    const html = buildReportHtml(sampleReport(input));
    assert.match(html, /<div class="test-title">VAGINAL SWAB - AFB STAIN<\/div>/);
    assert.match(html, /data-report-content="vaginal-swab-afb-stain"/);
    assert.match(html, /<strong>AFB Smear Microscopy Result<\/strong><\/td><td>AFB seen<\/td><td>Actual laboratory reference/);
    assert.match(html, />Recorded grade<\/td><td>Validated local grading protocol/);
    assert.match(html, /High vaginal swab/);
    assert.match(html, /Actual laboratory stain/);
    assert.match(html, /Recorded processing/);
    assert.match(html, /Review &lt;smear&gt;<br \/>Recorded observations/);
    assert.match(html, /Actual separately performed test status/);
    assert.match(html, /Smear positivity does not identify the species or confirm Mycobacterium tuberculosis complex/);
    assert.match(html, /A negative smear does not exclude mycobacterial infection or tuberculosis/);
    assert.ok(html.indexOf('Doctor advice') > html.indexOf('Actual laboratory comment'));
    assert.ok(html.indexOf('Doctor advice') < html.indexOf('<div class="single-analyte-notes report-template-notes vaginal-swab-afb-stain-notes">'));
    assert.equal(JSON.stringify(input), original);
    const schema = getFallbackReportParameters({ name });
    assert.equal(schema.length, 12);
    assert.ok(schema.every(p => p.entryMode === 'manual'));
  }
});

test('Vaginal Swab AFB Stain keeps missing results blank and preserves legacy findings without inferring grades', () => {
  const blank = buildReportHtml(sampleReport({ name: 'Vaginal Swab AFB Stain', parameters: [] }));
  assert.match(blank, /<strong>AFB Smear Microscopy Result<\/strong><\/td><td>-<\/td>/);
  assert.match(blank, /<strong>AFB Smear Grade \/ Quantitation<\/strong><\/td><td>-<\/td>/);
  assert.doesNotMatch(blank, /<strong>Culture \/ Molecular Test Status, if performed<\/strong>/);
  const legacy = buildReportHtml(sampleReport({ name: 'Vaginal Swab AFB Stain', parameters: [
    { parameter_name: 'Findings', value: 'Historical <finding>\nRetained' },
    { parameter_name: 'Impression', value: 'Prior impression' },
    { parameter_name: 'Comments', value: 'Prior comments' },
    { parameter_name: 'Custom Count', value: '0', unit: 'local unit', normal_range: 'Local reference' },
  ] }));
  assert.match(legacy, /<strong>Microscopy Remarks<\/strong><\/td><td colspan="3">Historical &lt;finding&gt;<br \/>Retained/);
  assert.match(legacy, /Prior impression/);
  assert.match(legacy, /Prior comments/);
  assert.match(legacy, /<strong>Custom Count<\/strong><\/td><td>0<\/td><td>Local reference<\/td><td>local unit/);
  const partial = buildReportHtml(sampleReport({ name: 'Vaginal Swab AFB Stain', parameters: [{ parameter_name: 'Result', value: 'AFB seen' }] }));
  assert.match(partial, /<strong>AFB Smear Microscopy Result<\/strong><\/td><td>AFB seen<\/td>/);
  assert.match(partial, /<strong>AFB Smear Grade \/ Quantitation<\/strong><\/td><td>-<\/td>/);
  const manual = buildReportHtml(sampleReport({ name: 'Vaginal Swab AFB Stain', report_body: 'Manual format <retained>', parameters: [] }));
  assert.match(manual, /Manual format &lt;retained&gt;/);
  assert.doesNotMatch(manual, /data-report-content="vaginal-swab-afb-stain"/);
  for (const name of ['Vaginal / Cervical swab', 'Vaginal Swab Gram Stain', 'Cervical Swab AFB Stain', 'Vaginal Swab Culture', 'AFB Culture & Sensitivity', 'Vaginal Smear for PAP Stain']) assert.doesNotMatch(buildReportHtml(sampleReport({ name, parameters: [] })), /data-report-content="vaginal-swab-afb-stain"/);
});

test('Vaginal Swab AFB Stain schema repair supports both entries while protecting used and custom formats', async () => {
  const db = await fixture();
  try {
    for (let i = 0; i < 9; i++) {
      await db.run('INSERT INTO tests (id,name,category,sample_type,report_body) VALUES (?,?,?,?,?)', [10040 + i, i === 6 ? 'Cervical Swab AFB Stain' : i === 7 ? 'Vaginal Swab for AFB Stain' : 'Vaginal Swab AFB Stain', 'Imported legacy catalogue', i === 5 ? 'Cervical Swab' : null, i === 4 ? 'Manual format' : null]);
      for (const [order, name] of ['Findings', 'Impression', 'Comments'].entries()) await db.run('INSERT INTO test_parameters (test_id,parameter_name,unit,normal_range,entry_mode,display_order) VALUES (?,?,?,?,?,?)', [10040 + i, name, '', i === 3 ? 'Custom reference' : '', 'manual', order + 1]);
    }
    const original = await db.all('SELECT id FROM test_parameters WHERE test_id=10040 ORDER BY display_order');
    await db.run('INSERT INTO visit_tests VALUES (10041)');
    await db.run('INSERT INTO test_bundle_items VALUES (999,10042)');
    await db.run('INSERT INTO test_bundle_items VALUES (10048,999)');
    await ensureVaginalSwabAfbStainTestConfiguration(db);
    for (const id of [10040, 10047]) {
      const fields = await db.all('SELECT * FROM test_parameters WHERE test_id=? ORDER BY display_order', [id]);
      assert.deepEqual(fields.map(p => p.parameter_name), getFallbackReportParameters({ name: 'Vaginal Swab AFB Stain' }).map(p => p.parameterName));
      assert.equal((await db.get('SELECT sample_type FROM tests WHERE id=?', [id])).sample_type, 'Vaginal Swab');
      if (id === 10040) assert.deepEqual(fields.slice(0, 3).map(p => p.id), original.map(p => p.id));
    }
    for (const i of [1,2,3,4,5,6,8]) assert.equal((await db.get('SELECT COUNT(*) AS n FROM test_parameters WHERE test_id=?', [10040 + i])).n, 3);
    assert.equal((await db.get('SELECT COUNT(*) AS n FROM tests WHERE id BETWEEN 10040 AND 10048')).n, 9);
    assert.equal((await db.get('SELECT name FROM tests WHERE id=10047')).name, 'Vaginal Swab for AFB Stain');
    await db.run("UPDATE test_parameters SET normal_range='Local override' WHERE test_id=10040 AND display_order=1");
    await ensureVaginalSwabAfbStainTestConfiguration(db);
    assert.equal((await db.get('SELECT normal_range FROM test_parameters WHERE test_id=10040 AND display_order=1')).normal_range, 'Local override');
  } finally { await db.close(); }
});

test('Vaginal Cervical swab records exact site and performed examinations with explanatory notes', () => {
  for (const name of ['Vaginal / Cervical swab', 'Vaginal/Cervical Swab', 'Vaginal / Cervical Swabs', 'Cervical / Vaginal Swab']) {
    const input = { name, parameters: [
      { parameter_name: 'Specimen / Exact Collection Site', value: 'Endocervical swab' },
      { parameter_name: 'Examination Requested / Performed', value: 'Actual microscopy and culture' },
      { parameter_name: 'Method / Preparation', value: 'Recorded laboratory preparation' },
      { parameter_name: 'Laboratory Result / Findings', value: 'Actual reported findings', normal_range: 'Site-specific local interpretation' },
      { parameter_name: 'Microscopy / Gram Stain Findings, if performed', value: 'Recorded cells\nReview <finding>' },
      { parameter_name: 'Culture Result, if performed', value: 'Actual culture description' },
      { parameter_name: 'Organism Identification / Growth, if isolated', value: 'Isolate A: actual identification' },
      { parameter_name: 'Antimicrobial Susceptibility, if performed', value: 'Isolate A\nDrug X: laboratory category' },
      { parameter_name: 'Susceptibility Method / Standard, if performed', value: 'Actual AST method and standard' },
      { parameter_name: 'Additional Specific Tests, if performed', value: 'Actual separately requested test result' },
      { parameter_name: 'Comments / Limitations', value: 'Actual laboratory comment' },
    ], additional_report_text: 'Doctor advice' };
    const original = JSON.stringify(input);
    const html = buildReportHtml(sampleReport(input));
    assert.match(html, /<div class="test-title">VAGINAL \/ CERVICAL SWAB<\/div>/);
    assert.match(html, /data-report-content="vaginal-cervical-swab"/);
    assert.match(html, /Endocervical swab/);
    assert.match(html, /Actual microscopy and culture/);
    assert.match(html, /Recorded laboratory preparation/);
    assert.match(html, /<strong>Laboratory Result \/ Findings<\/strong><\/td><td>Actual reported findings<\/td><td>Site-specific local interpretation/);
    assert.match(html, /Recorded cells<br \/>Review &lt;finding&gt;/);
    assert.match(html, /Actual culture description/);
    assert.match(html, /Isolate A<br \/>Drug X: laboratory category/);
    assert.match(html, /Actual AST method and standard/);
    assert.match(html, /Actual separately requested test result/);
    assert.match(html, /does not imply that both sites were sampled/);
    assert.ok(html.indexOf('Doctor advice') > html.indexOf('Actual laboratory comment'));
    assert.ok(html.indexOf('Doctor advice') < html.indexOf('<div class="single-analyte-notes report-template-notes vaginal-cervical-swab-notes">'));
    assert.equal(JSON.stringify(input), original);
    const schema = getFallbackReportParameters({ name });
    assert.equal(schema.length, 15);
    assert.ok(schema.every(p => p.entryMode === 'manual'));
  }
});

test('Vaginal Cervical swab omits unperformed sections and retains original results and custom formats', () => {
  const blank = buildReportHtml(sampleReport({ name: 'Vaginal / Cervical swab', parameters: [] }));
  assert.match(blank, /<strong>Laboratory Result \/ Findings<\/strong><\/td><td>-<\/td>/);
  assert.match(blank, /<strong>Specimen \/ Exact Collection Site<\/strong><\/td><td colspan="3">-<\/td>/);
  assert.doesNotMatch(blank, /<strong>Culture Result, if performed<\/strong>|<strong>Microscopy \/ Gram Stain Findings, if performed<\/strong>|<strong>Antimicrobial Susceptibility, if performed<\/strong>/);
  const legacy = buildReportHtml(sampleReport({ name: 'Vaginal / Cervical swab', parameters: [
    { parameter_name: 'Result', value: 'Historical <finding>\nRetained', unit: 'Recorded unit', normal_range: 'Local reference' },
    { parameter_name: 'Impression', value: 'Actual interpretation' },
    { parameter_name: 'Comments', value: 'Prior comments' },
    { parameter_name: 'Pus Cells', value: '0', unit: '/HPF', normal_range: 'Local microscopy reference' },
  ] }));
  assert.match(legacy, /Historical &lt;finding&gt;<br \/>Retained<\/td><td>Local reference<\/td><td>Recorded unit/);
  assert.match(legacy, /Actual interpretation/);
  assert.match(legacy, /Prior comments/);
  assert.match(legacy, /<strong>Pus Cells<\/strong><\/td><td>0<\/td><td>Local microscopy reference<\/td><td>\/HPF/);
  const microscopyOnly = buildReportHtml(sampleReport({ name: 'Vaginal / Cervical swab', parameters: [{ parameter_name: 'Microscopy', value: 'Reported microscopy findings' }] }));
  assert.match(microscopyOnly, /Reported microscopy findings/);
  assert.doesNotMatch(microscopyOnly, /<strong>Culture Result, if performed<\/strong>/);
  const manual = buildReportHtml(sampleReport({ name: 'Vaginal / Cervical swab', report_body: 'Manual format <retained>', parameters: [] }));
  assert.match(manual, /Manual format &lt;retained&gt;/);
  assert.doesNotMatch(manual, /data-report-content="vaginal-cervical-swab"/);
  for (const name of ['Vaginal Swab Culture', 'Vaginal Swab Gram Stain', 'Cervical Swab Gram Stain', 'Vaginal Smear for PAP Stain', 'Cervical Swab AFB Stain', 'Urine Culture']) assert.doesNotMatch(buildReportHtml(sampleReport({ name, parameters: [] })), /data-report-content="vaginal-cervical-swab"/);
});

test('Vaginal Cervical swab schema repair protects used, bundled and custom entries without deleting catalogue data', async () => {
  const db = await fixture();
  try {
    for (let i = 0; i < 9; i++) {
      await db.run('INSERT INTO tests (id,name,category,sample_type,report_body) VALUES (?,?,?,?,?)', [10030 + i, i === 6 ? 'Vaginal Swab Gram Stain' : i === 7 ? 'Cervical / Vaginal Swab' : 'Vaginal / Cervical swab', 'Imported legacy catalogue', i === 5 ? 'Serum' : null, i === 4 ? 'Manual format' : null]);
      await db.run('INSERT INTO test_parameters (test_id,parameter_name,unit,normal_range,entry_mode,display_order) VALUES (?,?,?,?,?,?)', [10030 + i, 'Result', i === 3 ? 'Custom unit' : '', '', 'manual', 1]);
    }
    const original = await db.get('SELECT id FROM test_parameters WHERE test_id=10030');
    await db.run('INSERT INTO visit_tests VALUES (10031)');
    await db.run('INSERT INTO test_bundle_items VALUES (999,10032)');
    await db.run('INSERT INTO test_bundle_items VALUES (10038,999)');
    await ensureVaginalCervicalSwabTestConfiguration(db);
    for (const id of [10030, 10037]) {
      const fields = await db.all('SELECT * FROM test_parameters WHERE test_id=? ORDER BY display_order', [id]);
      assert.deepEqual(fields.map(p => p.parameter_name), getFallbackReportParameters({ name: 'Vaginal / Cervical swab' }).map(p => p.parameterName));
      assert.equal((await db.get('SELECT sample_type FROM tests WHERE id=?', [id])).sample_type, 'Swab (record vaginal or cervical collection site)');
      if (id === 10030) assert.equal(fields[0].id, original.id);
    }
    for (const i of [1,2,3,4,5,6,8]) assert.equal((await db.get('SELECT COUNT(*) AS n FROM test_parameters WHERE test_id=?', [10030 + i])).n, 1);
    assert.equal((await db.get('SELECT COUNT(*) AS n FROM tests WHERE id BETWEEN 10030 AND 10038')).n, 9);
    await db.run("UPDATE test_parameters SET normal_range='Local override' WHERE test_id=10030 AND display_order=1");
    await ensureVaginalCervicalSwabTestConfiguration(db);
    assert.equal((await db.get('SELECT normal_range FROM test_parameters WHERE test_id=10030 AND display_order=1')).normal_range, 'Local override');
  } finally { await db.close(); }
});

test('Uroflowmetry reports measured flow, volume, timing and narrative without inventing a curve', () => {
  for (const name of ['Uroflowmetry', 'Uroflowmetry Test', 'Urinary Flow Rate Study']) {
    const input = { name, parameters: [
      { parameter_name: 'Clinical Details', value: 'Actual clinical history' },
      { parameter_name: 'Method / Device', value: 'Recorded uroflowmeter' },
      { parameter_name: 'Voided Volume', value: '220', unit: 'mL' },
      { parameter_name: 'Maximum Flow Rate (Qmax)', value: '18.5', unit: 'mL/s', normal_range: 'Local nomogram assessment' },
      { parameter_name: 'Average Flow Rate (Qavg)', value: '9.0', unit: 'mL/s' },
      { parameter_name: 'Flow Time', value: '24.4', unit: 's' },
      { parameter_name: 'Voiding Time', value: '30', unit: 's' },
      { parameter_name: 'Time to Maximum Flow', value: '7', unit: 's' },
      { parameter_name: 'Flow Curve / Pattern', value: 'Actual recorded pattern' },
      { parameter_name: 'Representative of Usual Voiding', value: 'Patient reports representative void' },
      { parameter_name: 'Post-Void Residual (PVR), if measured', value: '0', unit: 'mL' },
      { parameter_name: 'PVR Method / Timing, if measured', value: 'Recorded method and timing' },
      { parameter_name: 'Findings', value: 'Review <tracing>\nRetained observations' },
      { parameter_name: 'Impression', value: 'Clinician interpretation' },
      { parameter_name: 'Advice', value: 'Actual clinician advice' },
    ], additional_report_text: 'Additional doctor note' };
    const original = JSON.stringify(input);
    const html = buildReportHtml(sampleReport(input));
    assert.match(html, /<div class="test-title">UROFLOWMETRY<\/div>/);
    assert.match(html, /data-report-content="uroflowmetry"/);
    assert.match(html, /<strong>Maximum Flow Rate \(Qmax\)<\/strong><\/td><td>18.5<\/td><td>Local nomogram assessment<\/td><td>mL\/s/);
    assert.match(html, /<strong>Flow Time<\/strong><\/td><td>24.4<\/td>/);
    assert.match(html, /<strong>Voiding Time<\/strong><\/td><td>30<\/td>/);
    assert.match(html, /<strong>Post-Void Residual \(PVR\), if measured<\/strong><\/td><td>0<\/td>/);
    assert.match(html, /Recorded method and timing/);
    assert.match(html, /Review &lt;tracing&gt;<br \/>Retained observations/);
    assert.match(html, /Clinician interpretation/);
    assert.match(html, /no curve is generated from these entries/);
    assert.match(html, /not a universal minimum for women or children/);
    assert.ok(html.indexOf('Additional doctor note') > html.indexOf('Actual clinician advice'));
    assert.ok(html.indexOf('Additional doctor note') < html.indexOf('<div class="single-analyte-notes report-template-notes uroflowmetry-notes">'));
    assert.equal(JSON.stringify(input), original);
    const schema = getFallbackReportParameters({ name });
    assert.equal(schema.length, 19);
    assert.equal(schema.find(p => p.parameterName === 'Maximum Flow Rate (Qmax)').unit, 'mL/s');
    assert.ok(schema.every(p => p.entryMode === 'manual'));
  }
});

test('Uroflowmetry keeps missing metrics blank and preserves original narrative or custom reports', () => {
  const blank = buildReportHtml(sampleReport({ name: 'Uroflowmetry', parameters: [] }));
  assert.match(blank, /<strong>Maximum Flow Rate \(Qmax\)<\/strong><\/td><td>-<\/td>/);
  assert.doesNotMatch(blank, /<strong>Post-Void Residual \(PVR\), if measured<\/strong>|<strong>PVR Method \/ Timing, if measured<\/strong>/);
  const partial = buildReportHtml(sampleReport({ name: 'Uroflowmetry', parameters: [
    { parameter_name: 'Voided Volume', value: '100' },
    { parameter_name: 'Flow Time', value: '20' },
    { parameter_name: 'Clinical Details', value: 'Historical symptoms' },
    { parameter_name: 'Findings', value: 'Historical <finding>\nUnchanged' },
    { parameter_name: 'Impression', value: 'Historical impression' },
    { parameter_name: 'Advice', value: 'Historical advice' },
    { parameter_name: 'Custom Parameter', value: 'Actual value', unit: 'local unit', normal_range: 'Local reference' },
  ] }));
  assert.match(partial, /<strong>Average Flow Rate \(Qavg\)<\/strong><\/td><td>-<\/td>/);
  assert.match(partial, /Historical symptoms/);
  assert.match(partial, /Historical &lt;finding&gt;<br \/>Unchanged/);
  assert.match(partial, /Historical impression/);
  assert.match(partial, /Historical advice/);
  assert.match(partial, /<strong>Custom Parameter<\/strong><\/td><td>Actual value<\/td><td>Local reference<\/td><td>local unit/);
  const aliases = buildReportHtml(sampleReport({ name: 'Uroflowmetry', parameters: [{ parameter_name: 'Qmax', value: '0', unit: 'Recorded unit' }, { parameter_name: 'Result', value: 'Original result narrative' }] }));
  assert.match(aliases, /<strong>Maximum Flow Rate \(Qmax\)<\/strong><\/td><td>0<\/td><td>Age-, sex- and voided-volume-specific assessment<\/td><td>Recorded unit/);
  assert.match(aliases, /Original result narrative/);
  const manual = buildReportHtml(sampleReport({ name: 'Uroflowmetry', report_body: 'Manual format <retained>', parameters: [] }));
  assert.match(manual, /Manual format &lt;retained&gt;/);
  assert.doesNotMatch(manual, /data-report-content="uroflowmetry"/);
  assert.equal(isBillingOnlyTest({ name: 'Uroflowmetry' }), false);
  for (const name of ['Urine RE (Routine Examination)', 'Urine pH', 'Creatinine Clearance Test', 'Spirometry']) assert.doesNotMatch(buildReportHtml(sampleReport({ name, parameters: [] })), /data-report-content="uroflowmetry"/);
});

test('Uroflowmetry schema repair expands unused narrative placeholders without altering custom or historical records', async () => {
  const db = await fixture();
  try {
    for (let i = 0; i < 9; i++) {
      await db.run('INSERT INTO tests (id,name,category,sample_type,report_body) VALUES (?,?,?,?,?)', [10020 + i, i === 6 ? 'Spirometry' : i === 7 ? 'Uroflowmetry Test' : 'Uroflowmetry', 'Imported legacy catalogue', i === 5 ? 'Serum' : null, i === 4 ? 'Manual format' : null]);
      for (const [order, name] of ['Clinical Details', 'Findings', 'Impression', 'Advice'].entries()) await db.run('INSERT INTO test_parameters (test_id,parameter_name,unit,normal_range,entry_mode,display_order) VALUES (?,?,?,?,?,?)', [10020 + i, name, '', i === 3 ? 'Custom reference' : '', 'manual', order + 1]);
    }
    const original = await db.all('SELECT id FROM test_parameters WHERE test_id=10020 ORDER BY display_order');
    await db.run('INSERT INTO visit_tests VALUES (10021)');
    await db.run('INSERT INTO test_bundle_items VALUES (999,10022)');
    await db.run('INSERT INTO test_bundle_items VALUES (10028,999)');
    await ensureUroflowmetryTestConfiguration(db);
    for (const id of [10020, 10027]) {
      const fields = await db.all('SELECT * FROM test_parameters WHERE test_id=? ORDER BY display_order', [id]);
      assert.deepEqual(fields.map(p => p.parameter_name), getFallbackReportParameters({ name: 'Uroflowmetry' }).map(p => p.parameterName));
      assert.equal((await db.get('SELECT sample_type FROM tests WHERE id=?', [id])).sample_type, 'N/A (non-invasive uroflowmetry)');
      if (id === 10020) assert.deepEqual(fields.slice(0, 4).map(p => p.id), original.map(p => p.id));
    }
    for (const i of [1,2,3,4,5,6,8]) assert.equal((await db.get('SELECT COUNT(*) AS n FROM test_parameters WHERE test_id=?', [10020 + i])).n, 4);
    assert.equal((await db.get('SELECT COUNT(*) AS n FROM tests WHERE id BETWEEN 10020 AND 10028')).n, 9);
    await db.run("UPDATE test_parameters SET normal_range='Local override' WHERE test_id=10020 AND parameter_name='Maximum Flow Rate (Qmax)'");
    await ensureUroflowmetryTestConfiguration(db);
    assert.equal((await db.get("SELECT normal_range FROM test_parameters WHERE test_id=10020 AND parameter_name='Maximum Flow Rate (Qmax)'")).normal_range, 'Local override');
  } finally { await db.close(); }
});

test('Urine pH provides manual findings and explanatory reference guidance without changing reported precision', () => {
  for (const name of ['Urine pH', 'UrinepH', 'pH (Urine)', 'pH, Urine', 'Urine pH Test', 'pH Urine Test']) {
    const input = { name, parameters: [
      { parameter_name: 'Urine pH', value: '6.25', normal_range: 'Local interval: 5.0 - 8.0' },
      { parameter_name: 'Reaction / Description, if recorded', value: 'Acidic (reported)' },
      { parameter_name: 'Specimen / Collection Type', value: 'Fresh random urine' },
      { parameter_name: 'Collection Date / Time', value: '2026-10-14 13:00' },
      { parameter_name: 'Method / Reagent / Analyzer', value: 'Actual laboratory pH meter' },
      { parameter_name: 'Specimen Handling / Quality, if supplied', value: 'Promptly tested' },
      { parameter_name: 'Comments / Limitations', value: 'Review <history>\nCorrelate clinically' },
    ], additional_report_text: 'Doctor advice' };
    const original = JSON.stringify(input);
    const html = buildReportHtml(sampleReport(input));
    assert.match(html, /<div class="test-title">URINE pH<\/div>/);
    assert.match(html, /data-report-content="urine-ph"/);
    assert.match(html, /<strong>Urine pH<\/strong><\/td><td>6.25<\/td><td>Local interval: 5.0 - 8.0<\/td><td><\/td>/);
    assert.match(html, /Actual laboratory pH meter/);
    assert.match(html, /Acidic \(reported\)/);
    assert.match(html, /Promptly tested/);
    assert.match(html, /Review &lt;history&gt;<br \/>Correlate clinically/);
    assert.match(html, /pH is dimensionless/);
    assert.match(html, /pH alone does not establish a urinary infection/);
    assert.ok(html.indexOf('Doctor advice') > html.indexOf('Correlate clinically'));
    assert.ok(html.indexOf('Doctor advice') < html.indexOf('<div class="single-analyte-notes report-template-notes urine-ph-notes">'));
    assert.equal(JSON.stringify(input), original);
    const schema = getFallbackReportParameters({ name });
    assert.equal(schema.length, 9);
    assert.equal(schema[0].unit, '');
    assert.match(schema[0].normalRange, /4.6 - 8.0/);
    assert.ok(schema.every(p => p.entryMode === 'manual'));
  }
});

test('Urine pH keeps missing values blank and does not infer numbers from reaction or blood pH', () => {
  const blank = buildReportHtml(sampleReport({ name: 'Urine pH', parameters: [] }));
  assert.match(blank, /<strong>Urine pH<\/strong><\/td><td>-<\/td><td>4.6 - 8.0 \(general guide; lab-specific\)<\/td><td><\/td>/);
  assert.doesNotMatch(blank, /<strong>Reaction \/ Description, if recorded<\/strong>|<strong>Specimen Handling \/ Quality, if supplied<\/strong>/);
  const legacy = buildReportHtml(sampleReport({ name: 'Urine pH', parameters: [
    { parameter_name: 'Result', value: 'Acidic', normal_range: 'Original laboratory description', unit: 'Recorded legacy unit' },
    { parameter_name: 'Findings', value: 'Prior <findings>\nRetained' },
    { parameter_name: 'Impression', value: 'Actual interpretation' },
  ] }));
  assert.match(legacy, /<strong>Urine pH<\/strong><\/td><td>Acidic<\/td><td>Original laboratory description<\/td><td>Recorded legacy unit/);
  assert.match(legacy, /Prior &lt;findings&gt;<br \/>Retained/);
  assert.match(legacy, /Actual interpretation/);
  const otherOnly = buildReportHtml(sampleReport({ name: 'Urine pH', parameters: [
    { parameter_name: 'Blood pH', value: '7.40' },
    { parameter_name: 'Reaction', value: 'Alkaline' },
  ] }));
  assert.match(otherOnly, /<strong>Urine pH<\/strong><\/td><td>-<\/td>/);
  assert.match(otherOnly, /<strong>Blood pH<\/strong><\/td><td>7.40<\/td>/);
  assert.match(otherOnly, /<strong>Reaction \/ Description, if recorded<\/strong><\/td><td colspan="3">Alkaline/);
  const named = buildReportHtml(sampleReport({ name: 'Urine pH', parameters: [{ parameter_name: 'pH', value: '0' }] }));
  assert.match(named, /<strong>Urine pH<\/strong><\/td><td>0<\/td>/);
  const manual = buildReportHtml(sampleReport({ name: 'Urine pH', report_body: 'Manual format <retained>', parameters: [] }));
  assert.match(manual, /Manual format &lt;retained&gt;/);
  assert.doesNotMatch(manual, /data-report-content="urine-ph"/);
  for (const name of ['Urine RE (Routine Examination)', 'Urine Phosphorus', 'Inorganic Phosphorus (Urine)', 'Urine Porphobilinogen', 'Stool RE + Red Sub + pH', 'Blood Gas Analysis, Arterial', 'Urine Urobilinogen']) assert.doesNotMatch(buildReportHtml(sampleReport({ name, parameters: [] })), /data-report-content="urine-ph"/);
});

test('Urine pH schema repair protects custom, used and bundled entries and preserves catalogue IDs', async () => {
  const db = await fixture();
  try {
    for (let i = 0; i < 9; i++) {
      await db.run('INSERT INTO tests (id,name,category,sample_type,report_body) VALUES (?,?,?,?,?)', [10010 + i, i === 6 ? 'Urine Phosphorus' : i === 7 ? 'pH (Urine)' : 'Urine pH', 'Imported legacy catalogue', i === 5 ? 'Serum' : null, i === 4 ? 'Manual format' : null]);
      await db.run('INSERT INTO test_parameters (test_id,parameter_name,unit,normal_range,entry_mode,display_order) VALUES (?,?,?,?,?,?)', [10010 + i, 'Result', '', i === 3 ? 'Custom reference' : '', 'manual', 1]);
    }
    const original = await db.get('SELECT id FROM test_parameters WHERE test_id=10010');
    await db.run('INSERT INTO visit_tests VALUES (10011)');
    await db.run('INSERT INTO test_bundle_items VALUES (999,10012)');
    await db.run('INSERT INTO test_bundle_items VALUES (10018,999)');
    await ensureUrinePhTestConfiguration(db);
    for (const id of [10010, 10017]) {
      const fields = await db.all('SELECT * FROM test_parameters WHERE test_id=? ORDER BY display_order', [id]);
      assert.deepEqual(fields.map(p => p.parameter_name), getFallbackReportParameters({ name: 'Urine pH' }).map(p => p.parameterName));
      assert.equal((await db.get('SELECT sample_type FROM tests WHERE id=?', [id])).sample_type, 'Urine');
      if (id === 10010) assert.equal(fields[0].id, original.id);
    }
    for (const i of [1,2,3,4,5,6,8]) assert.equal((await db.get('SELECT COUNT(*) AS n FROM test_parameters WHERE test_id=?', [10010 + i])).n, 1);
    assert.equal((await db.get('SELECT COUNT(*) AS n FROM tests WHERE id BETWEEN 10010 AND 10018')).n, 9);
    await db.run("UPDATE test_parameters SET normal_range='Local override' WHERE test_id=10010 AND display_order=1");
    await ensureUrinePhTestConfiguration(db);
    assert.equal((await db.get('SELECT normal_range FROM test_parameters WHERE test_id=10010 AND display_order=1')).normal_range, 'Local override');
  } finally { await db.close(); }
});

test('Urine Urobilinogen preserves method-specific values and references with explanatory notes', () => {
  for (const name of ['Urine Urobilinogen', 'UrineUrobilinogen', 'Urobilinogen (Urine)', 'Urobilinogen, Urine', 'Urobilinogen Urine Test']) {
    const input = { name, parameters: [
      { parameter_name: 'Urobilinogen, Urine', value: '8', unit: 'µmol/L', normal_range: 'Validated local interval' },
      { parameter_name: 'Reporting Category / Grade, if supplied', value: 'Reported local category' },
      { parameter_name: 'Specimen / Collection Type', value: 'Fresh random urine' },
      { parameter_name: 'Collection Date / Time', value: '2026-10-14 12:00' },
      { parameter_name: 'Method / Reagent / Analyzer', value: 'Actual laboratory reagent' },
      { parameter_name: 'Specimen Handling / Quality, if supplied', value: 'Recorded handling' },
      { parameter_name: 'Comments / Limitations', value: 'Review <history>\nCorrelate clinically' },
    ], additional_report_text: 'Doctor advice' };
    const original = JSON.stringify(input);
    const html = buildReportHtml(sampleReport(input));
    assert.match(html, /<div class="test-title">URINE UROBILINOGEN<\/div>/);
    assert.match(html, /data-report-content="urine-urobilinogen"/);
    assert.match(html, /<strong>Urobilinogen, Urine<\/strong><\/td><td>8<\/td><td>Validated local interval<\/td><td>µmol\/L/);
    assert.match(html, /Actual laboratory reagent/);
    assert.match(html, /Reported local category/);
    assert.match(html, /Recorded handling/);
    assert.match(html, /Review &lt;history&gt;<br \/>Correlate clinically/);
    assert.match(html, /Manufacturer example only/);
    assert.match(html, /not a universal interval or evidence that this reagent was used/);
    assert.match(html, /small amounts normally appear in urine/);
    assert.ok(html.indexOf('Doctor advice') > html.indexOf('Correlate clinically'));
    assert.ok(html.indexOf('Doctor advice') < html.indexOf('<div class="single-analyte-notes report-template-notes urine-urobilinogen-notes">'));
    assert.equal(JSON.stringify(input), original);
    const schema = getFallbackReportParameters({ name });
    assert.equal(schema.length, 9);
    assert.equal(schema[0].unit, '');
    assert.doesNotMatch(schema[0].normalRange, /Negative|0\.2/);
    assert.ok(schema.every(p => p.entryMode === 'manual'));
  }
});

test('Urine Urobilinogen keeps missing results blank and does not substitute bilirubin or porphobilinogen', () => {
  const blank = buildReportHtml(sampleReport({ name: 'Urine Urobilinogen', parameters: [] }));
  assert.match(blank, /<strong>Urobilinogen, Urine<\/strong><\/td><td>-<\/td><td>Laboratory-validated method-specific range \/ category<\/td><td><\/td>/);
  assert.doesNotMatch(blank, /<strong>Reporting Category \/ Grade, if supplied<\/strong>|<strong>Specimen Handling \/ Quality, if supplied<\/strong>/);
  const legacy = buildReportHtml(sampleReport({ name: 'Urine Urobilinogen', parameters: [
    { parameter_name: 'Result', value: '0', unit: 'EU/dL', normal_range: 'Local Ehrlich-unit reference' },
    { parameter_name: 'Findings', value: 'Prior <findings>\nRetained' },
    { parameter_name: 'Impression', value: 'Actual interpretation' },
  ] }));
  assert.match(legacy, /<strong>Urobilinogen, Urine<\/strong><\/td><td>0<\/td><td>Local Ehrlich-unit reference<\/td><td>EU\/dL/);
  assert.match(legacy, /Prior &lt;findings&gt;<br \/>Retained/);
  assert.match(legacy, /Actual interpretation/);
  const otherOnly = buildReportHtml(sampleReport({ name: 'Urine Urobilinogen', parameters: [
    { parameter_name: 'Urine Bilirubin', value: 'Positive' },
    { parameter_name: 'Porphobilinogen', value: 'Not detected' },
  ] }));
  assert.match(otherOnly, /<strong>Urobilinogen, Urine<\/strong><\/td><td>-<\/td>/);
  assert.match(otherOnly, /<strong>Urine Bilirubin<\/strong><\/td><td>Positive<\/td>/);
  assert.match(otherOnly, /<strong>Porphobilinogen<\/strong><\/td><td>Not detected<\/td>/);
  const named = buildReportHtml(sampleReport({ name: 'Urine Urobilinogen', parameters: [{ parameter_name: 'Urobilinogen', value: 'Normal', normal_range: 'Actual reagent category' }] }));
  assert.match(named, /<strong>Urobilinogen, Urine<\/strong><\/td><td>Normal<\/td><td>Actual reagent category<\/td><td><\/td>/);
  const manual = buildReportHtml(sampleReport({ name: 'Urine Urobilinogen', report_body: 'Manual format <retained>', parameters: [] }));
  assert.match(manual, /Manual format &lt;retained&gt;/);
  assert.doesNotMatch(manual, /data-report-content="urine-urobilinogen"/);
  for (const name of ['Urine Porphobilinogen', 'Urine Bilirubin', 'Urine RE (Routine Examination)', 'Urine Porphyrins', 'Bilirubin Total, Direct & Indirect', 'Urine Sugar']) assert.doesNotMatch(buildReportHtml(sampleReport({ name, parameters: [] })), /data-report-content="urine-urobilinogen"/);
});

test('Urine Urobilinogen schema repair protects used, bundled and custom fields and keeps parameter IDs', async () => {
  const db = await fixture();
  try {
    for (let i = 0; i < 9; i++) {
      await db.run('INSERT INTO tests (id,name,category,sample_type,report_body) VALUES (?,?,?,?,?)', [10000 + i, i === 6 ? 'Urine Porphobilinogen' : i === 7 ? 'Urobilinogen (Urine)' : 'Urine Urobilinogen', 'Imported legacy catalogue', i === 5 ? 'Serum' : null, i === 4 ? 'Manual format' : null]);
      await db.run('INSERT INTO test_parameters (test_id,parameter_name,unit,normal_range,entry_mode,display_order) VALUES (?,?,?,?,?,?)', [10000 + i, 'Result', i === 3 ? 'Custom unit' : '', '', 'manual', 1]);
    }
    const original = await db.get('SELECT id FROM test_parameters WHERE test_id=10000');
    await db.run('INSERT INTO visit_tests VALUES (10001)');
    await db.run('INSERT INTO test_bundle_items VALUES (999,10002)');
    await db.run('INSERT INTO test_bundle_items VALUES (10008,999)');
    await ensureUrineUrobilinogenTestConfiguration(db);
    for (const id of [10000, 10007]) {
      const fields = await db.all('SELECT * FROM test_parameters WHERE test_id=? ORDER BY display_order', [id]);
      assert.deepEqual(fields.map(p => p.parameter_name), getFallbackReportParameters({ name: 'Urine Urobilinogen' }).map(p => p.parameterName));
      assert.equal((await db.get('SELECT sample_type FROM tests WHERE id=?', [id])).sample_type, 'Urine');
      if (id === 10000) assert.equal(fields[0].id, original.id);
    }
    for (const i of [1,2,3,4,5,6,8]) assert.equal((await db.get('SELECT COUNT(*) AS n FROM test_parameters WHERE test_id=?', [10000 + i])).n, 1);
    assert.equal((await db.get('SELECT COUNT(*) AS n FROM tests WHERE id BETWEEN 10000 AND 10008')).n, 9);
    await db.run("UPDATE test_parameters SET normal_range='Local override',unit='mg/dL' WHERE test_id=10000 AND display_order=1");
    await ensureUrineUrobilinogenTestConfiguration(db);
    const override = await db.get('SELECT unit,normal_range FROM test_parameters WHERE test_id=10000 AND display_order=1');
    assert.deepEqual(override, { unit: 'mg/dL', normal_range: 'Local override' });
  } finally { await db.close(); }
});

test('Urine Sugar reports actual result, method, grading and explanatory reference guidance', () => {
  for (const name of ['Urine Sugar', 'UrineSugar', 'Urine Sugar Test', 'Sugar (Urine)', 'UnneSugar']) {
    const input = { name, parameters: [
      { parameter_name: 'Urine Sugar Result', value: 'Trace', normal_range: 'Negative - local reagent' },
      { parameter_name: 'Grade / Semiquantitative Category, if reported', value: '+ (reported grade)' },
      { parameter_name: 'Specimen / Collection Type', value: 'Random urine' },
      { parameter_name: 'Collection Date / Time', value: '2026-10-14 11:00' },
      { parameter_name: 'Method / Reagent', value: 'Actual glucose-specific reagent' },
      { parameter_name: 'Reporting Basis / Measured Analyte', value: 'Qualitative glucose screen' },
      { parameter_name: 'Comments / Limitations', value: 'Review <history>\nCorrelate with blood testing' },
    ], additional_report_text: 'Doctor advice' };
    const original = JSON.stringify(input);
    const html = buildReportHtml(sampleReport(input));
    assert.match(html, /<div class="test-title">URINE SUGAR<\/div>/);
    assert.match(html, /data-report-content="urine-sugar"/);
    assert.match(html, /<strong>Urine Sugar<\/strong><\/td><td>Trace<\/td><td>Negative - local reagent<\/td><td><\/td>/);
    assert.match(html, /\+ \(reported grade\)/);
    assert.match(html, /Actual glucose-specific reagent/);
    assert.match(html, /Qualitative glucose screen/);
    assert.match(html, /Review &lt;history&gt;<br \/>Correlate with blood testing/);
    assert.match(html, /a negative urine result does not exclude high blood glucose or diabetes/);
    assert.match(html, /Do not assume a Benedict-type result identifies glucose alone/);
    assert.ok(html.indexOf('Doctor advice') > html.indexOf('Correlate with blood testing'));
    assert.ok(html.indexOf('Doctor advice') < html.indexOf('<div class="single-analyte-notes report-template-notes urine-sugar-notes">'));
    assert.equal(JSON.stringify(input), original);
    const schema = getFallbackReportParameters({ name });
    assert.equal(schema.length, 9);
    assert.equal(schema[0].unit, '');
    assert.ok(schema.every(p => p.entryMode === 'manual'));
  }
});

test('Urine Sugar preserves legacy units and narratives without substituting blood glucose or reducing reactions', () => {
  const blank = buildReportHtml(sampleReport({ name: 'Urine Sugar', parameters: [] }));
  assert.match(blank, /<strong>Urine Sugar<\/strong><\/td><td>-<\/td>/);
  assert.doesNotMatch(blank, /<strong>Grade \/ Semiquantitative Category, if reported<\/strong>/);
  const legacy = buildReportHtml(sampleReport({ name: 'Urine Sugar', parameters: [
    { parameter_name: 'Result', value: '0', unit: 'mmol/L', normal_range: 'Local quantitative interval' },
    { parameter_name: 'Findings', value: 'Prior <findings>\nRetained' },
    { parameter_name: 'Impression', value: 'Actual interpretation' },
  ] }));
  assert.match(legacy, /<strong>Urine Sugar<\/strong><\/td><td>0<\/td><td>Local quantitative interval<\/td><td>mmol\/L/);
  assert.match(legacy, /Prior &lt;findings&gt;<br \/>Retained/);
  assert.match(legacy, /Actual interpretation/);
  const otherOnly = buildReportHtml(sampleReport({ name: 'Urine Sugar', parameters: [
    { parameter_name: 'Blood Glucose', value: '150', unit: 'mg/dL' },
    { parameter_name: 'Reducing Substances', value: 'Positive' },
  ] }));
  assert.match(otherOnly, /<strong>Urine Sugar<\/strong><\/td><td>-<\/td>/);
  assert.match(otherOnly, /<strong>Blood Glucose<\/strong><\/td><td>150<\/td>/);
  assert.match(otherOnly, /<strong>Reducing Substances<\/strong><\/td><td>Positive<\/td>/);
  const namedGlucose = buildReportHtml(sampleReport({ name: 'Urine Sugar', parameters: [{ parameter_name: 'Glucose, Urine', value: '12', unit: 'mg/dL', normal_range: 'Local concentration interval' }] }));
  assert.match(namedGlucose, /<strong>Urine Sugar<\/strong><\/td><td>12<\/td><td>Local concentration interval<\/td><td>mg\/dL/);
  const manual = buildReportHtml(sampleReport({ name: 'Urine Sugar', report_body: 'Manual format <retained>', parameters: [] }));
  assert.match(manual, /Manual format &lt;retained&gt;/);
  assert.doesNotMatch(manual, /data-report-content="urine-sugar"/);
  for (const name of ['Urine Glucose', 'Urine Reducing Substance', 'Urine RE (Routine Examination)', 'Glucose Random', 'Fasting Blood Sugar', 'Joint Fluid for Sugar', 'Pleural Fluid for Sugar']) assert.doesNotMatch(buildReportHtml(sampleReport({ name, parameters: [] })), /data-report-content="urine-sugar"/);
});

test('Urine Sugar schema repair changes only unused placeholders and protects existing history and custom formats', async () => {
  const db = await fixture();
  try {
    for (let i = 0; i < 9; i++) {
      await db.run('INSERT INTO tests (id,name,category,sample_type,report_body) VALUES (?,?,?,?,?)', [9990 + i, i === 6 ? 'Urine Glucose' : i === 7 ? 'UnneSugar' : 'Urine Sugar', 'Imported legacy catalogue', i === 5 ? 'Serum' : null, i === 4 ? 'Manual format' : null]);
      await db.run('INSERT INTO test_parameters (test_id,parameter_name,unit,normal_range,entry_mode,display_order) VALUES (?,?,?,?,?,?)', [9990 + i, 'Result', '', i === 3 ? 'Custom reference' : '', 'manual', 1]);
    }
    const original = await db.get('SELECT id FROM test_parameters WHERE test_id=9990');
    await db.run('INSERT INTO visit_tests VALUES (9991)');
    await db.run('INSERT INTO test_bundle_items VALUES (999,9992)');
    await db.run('INSERT INTO test_bundle_items VALUES (9998,999)');
    await ensureUrineSugarTestConfiguration(db);
    for (const id of [9990, 9997]) {
      const fields = await db.all('SELECT * FROM test_parameters WHERE test_id=? ORDER BY display_order', [id]);
      assert.deepEqual(fields.map(p => p.parameter_name), getFallbackReportParameters({ name: 'Urine Sugar' }).map(p => p.parameterName));
      assert.equal((await db.get('SELECT sample_type FROM tests WHERE id=?', [id])).sample_type, 'Urine');
      if (id === 9990) assert.equal(fields[0].id, original.id);
    }
    for (const i of [1,2,3,4,5,6,8]) assert.equal((await db.get('SELECT COUNT(*) AS n FROM test_parameters WHERE test_id=?', [9990 + i])).n, 1);
    assert.equal((await db.get('SELECT COUNT(*) AS n FROM tests WHERE id BETWEEN 9990 AND 9998')).n, 9);
    await db.run("UPDATE test_parameters SET normal_range='Local override' WHERE test_id=9990 AND display_order=1");
    await ensureUrineSugarTestConfiguration(db);
    assert.equal((await db.get('SELECT normal_range FROM test_parameters WHERE test_id=9990 AND display_order=1')).normal_range, 'Local override');
  } finally { await db.close(); }
});

test('Urine Reducing Substance reports actual screen, method and grade with non-specific interpretation', () => {
  for (const name of ['Urine Reducing Substance', 'Urine Reducing Substances', 'Reducing Substances (Urine)', 'Urine for Reducing Substances', 'UrineRedusing Substence', 'UrnineRedusing Substance']) {
    const input = { name, parameters: [
      { parameter_name: 'Urine Reducing Substances Result', value: 'Positive', normal_range: 'Negative - local method' },
      { parameter_name: 'Grade / Semiquantitative Category, if reported', value: '++ (local category)' },
      { parameter_name: 'Specimen / Collection Type', value: 'Fresh random urine' },
      { parameter_name: 'Collection Date / Time', value: '2026-10-14 10:00' },
      { parameter_name: 'Method / Reagent', value: 'Recorded laboratory reagent' },
      { parameter_name: 'Observed Reaction, if recorded', value: 'Recorded colour' },
      { parameter_name: 'Laboratory Interpretation', value: 'Review <history>\nConfirm as indicated' },
    ], additional_report_text: 'Doctor advice' };
    const original = JSON.stringify(input);
    const html = buildReportHtml(sampleReport(input));
    assert.match(html, /<div class="test-title">URINE REDUCING SUBSTANCES<\/div>/);
    assert.match(html, /data-report-content="urine-reducing-substances"/);
    assert.match(html, /<strong>Urine Reducing Substances<\/strong><\/td><td>Positive<\/td><td>Negative - local method<\/td><td><\/td>/);
    assert.match(html, /\+\+ \(local category\)/);
    assert.match(html, /Fresh random urine/);
    assert.match(html, /Recorded laboratory reagent/);
    assert.match(html, /Recorded colour/);
    assert.match(html, /Review &lt;history&gt;<br \/>Confirm as indicated/);
    assert.match(html, /no concentration is inferred from a reaction colour or plus grade/);
    assert.match(html, /urine sugar chromatography/);
    assert.ok(html.indexOf('Doctor advice') > html.indexOf('Confirm as indicated'));
    assert.ok(html.indexOf('Doctor advice') < html.indexOf('<div class="single-analyte-notes report-template-notes urine-reducing-substances-notes">'));
    assert.equal(JSON.stringify(input), original);
    const schema = getFallbackReportParameters({ name });
    assert.equal(schema.length, 9);
    assert.equal(schema[0].unit, '');
    assert.ok(schema.every(p => p.entryMode === 'manual'));
  }
});

test('Urine Reducing Substance preserves legacy and quantitative values without inventing glucose or negative results', () => {
  const blank = buildReportHtml(sampleReport({ name: 'Urine Reducing Substance', parameters: [] }));
  assert.match(blank, /<strong>Urine Reducing Substances<\/strong><\/td><td>-<\/td>/);
  assert.doesNotMatch(blank, /<strong>Grade \/ Semiquantitative Category, if reported<\/strong>|<strong>Observed Reaction, if recorded<\/strong>/);
  const legacy = buildReportHtml(sampleReport({ name: 'Urine Reducing Substance', parameters: [
    { parameter_name: 'Result', value: '0', unit: 'g/dL', normal_range: 'Validated local interval' },
    { parameter_name: 'Urine Glucose', value: 'Not detected', normal_range: 'Separate assay reference' },
    { parameter_name: 'Findings', value: 'Prior <findings>\nRetained' },
    { parameter_name: 'Comments', value: 'Preserve comment' },
  ] }));
  assert.match(legacy, /<strong>Urine Reducing Substances<\/strong><\/td><td>0<\/td><td>Validated local interval<\/td><td>g\/dL/);
  assert.match(legacy, /<strong>Urine Glucose<\/strong><\/td><td>Not detected<\/td><td>Separate assay reference/);
  assert.match(legacy, /Prior &lt;findings&gt;<br \/>Retained/);
  assert.match(legacy, /Preserve comment/);
  const glucoseOnly = buildReportHtml(sampleReport({ name: 'Urine Reducing Substance', parameters: [{ parameter_name: 'Urine Glucose', value: 'Positive' }] }));
  assert.match(glucoseOnly, /<strong>Urine Reducing Substances<\/strong><\/td><td>-<\/td>/);
  const manual = buildReportHtml(sampleReport({ name: 'Urine Reducing Substance', report_body: 'Custom body <retained>', parameters: [] }));
  assert.match(manual, /Custom body &lt;retained&gt;/);
  assert.doesNotMatch(manual, /data-report-content="urine-reducing-substances"/);
  for (const name of ['Urine RE (Routine Examination)', 'Urine Glucose', 'Glucose Random', 'Urine Protein / Albumin', 'Stool RE + Red Sub + pH', 'Stool Reducing Substances']) assert.doesNotMatch(buildReportHtml(sampleReport({ name, parameters: [] })), /data-report-content="urine-reducing-substances"/);
});

test('Urine Reducing Substance schema repair keeps both catalogue entries and protects used or custom formats', async () => {
  const db = await fixture();
  try {
    for (let i = 0; i < 9; i++) {
      await db.run('INSERT INTO tests (id,name,category,sample_type,report_body) VALUES (?,?,?,?,?)', [9980 + i, i === 6 ? 'Stool Reducing Substances' : i === 7 ? 'UrineRedusing Substence' : 'Urine Reducing Substance', 'Imported legacy catalogue', i === 5 ? 'Stool' : null, i === 4 ? 'Manual format' : null]);
      await db.run('INSERT INTO test_parameters (test_id,parameter_name,unit,normal_range,entry_mode,display_order) VALUES (?,?,?,?,?,?)', [9980 + i, 'Result', i === 3 ? 'Custom unit' : '', '', 'manual', 1]);
    }
    const original = await db.get('SELECT id FROM test_parameters WHERE test_id=9980');
    await db.run('INSERT INTO visit_tests VALUES (9981)');
    await db.run('INSERT INTO test_bundle_items VALUES (999,9982)');
    await db.run('INSERT INTO test_bundle_items VALUES (9988,999)');
    await ensureUrineReducingSubstancesTestConfiguration(db);
    for (const id of [9980, 9987]) {
      const fields = await db.all('SELECT * FROM test_parameters WHERE test_id=? ORDER BY display_order', [id]);
      assert.deepEqual(fields.map(p => p.parameter_name), getFallbackReportParameters({ name: 'Urine Reducing Substance' }).map(p => p.parameterName));
      assert.equal((await db.get('SELECT sample_type FROM tests WHERE id=?', [id])).sample_type, 'Urine');
      if (id === 9980) assert.equal(fields[0].id, original.id);
    }
    for (const i of [1,2,3,4,5,6,8]) assert.equal((await db.get('SELECT COUNT(*) AS n FROM test_parameters WHERE test_id=?', [9980 + i])).n, 1);
    assert.equal((await db.get('SELECT name FROM tests WHERE id=9987')).name, 'UrineRedusing Substence');
    assert.equal((await db.get('SELECT COUNT(*) AS n FROM tests WHERE id BETWEEN 9980 AND 9988')).n, 9);
    await db.run("UPDATE test_parameters SET normal_range='Local override' WHERE test_id=9980 AND display_order=1");
    await ensureUrineReducingSubstancesTestConfiguration(db);
    assert.equal((await db.get('SELECT normal_range FROM test_parameters WHERE test_id=9980 AND display_order=1')).normal_range, 'Local override');
  } finally { await db.close(); }
});

test('Urine RE provides physical, chemical and microscopic sections with manual results and explanatory notes', () => {
  for (const name of ['Urine RE (Routine Examination)', 'Urine RE', 'Urine Routine Examination', 'Routine Urine Examination', 'Urinalysis']) {
    const input = { name, parameters: [
      { parameter_name: 'Colour', value: 'Pale yellow' },
      { parameter_name: 'Specific Gravity', value: '1.020', normal_range: 'Local interval' },
      { parameter_name: 'pH', value: '6.0' },
      { parameter_name: 'Blood / Haemoglobin', value: 'Trace' },
      { parameter_name: 'WBC / Pus Cells', value: '18', unit: 'cells/µL', normal_range: 'Analyzer-specific interval' },
      { parameter_name: 'RBC', value: '0', unit: '/HPF' },
      { parameter_name: 'Casts', value: 'Hyaline casts\nReview <finding>' },
      { parameter_name: 'Comments / Limitations', value: 'Correlate clinically' },
    ], additional_report_text: 'Doctor advice' };
    const original = JSON.stringify(input);
    const html = buildReportHtml(sampleReport(input));
    assert.match(html, /<div class="test-title">URINE ROUTINE EXAMINATION \(RE\)<\/div>/);
    assert.match(html, /data-report-content="urine-routine-examination"/);
    for (const section of ['PHYSICAL EXAMINATION', 'CHEMICAL EXAMINATION', 'MICROSCOPIC EXAMINATION']) assert.match(html, new RegExp(section));
    assert.match(html, />1.020<\/td><td>Local interval<\/td>/);
    assert.match(html, />18<\/td><td>Analyzer-specific interval<\/td><td>cells\/µL/);
    assert.match(html, /<strong>RBC<\/strong><\/td><td>0<\/td>/);
    assert.match(html, /Hyaline casts<br \/>Review &lt;finding&gt;/);
    assert.match(html, /Counts per high-power field and automated counts per microlitre are not interchangeable/);
    assert.ok(html.indexOf('Doctor advice') > html.indexOf('Correlate clinically'));
    assert.ok(html.indexOf('Doctor advice') < html.indexOf('<div class="single-analyte-notes report-template-notes urine-routine-notes">'));
    assert.equal(JSON.stringify(input), original);
    const schema = getFallbackReportParameters({ name });
    assert.equal(schema.length, 30);
    assert.ok(schema.every(p => p.entryMode === 'manual'));
  }
});

test('Urine RE preserves legacy narratives and custom results without inventing negative findings', () => {
  const blank = buildReportHtml(sampleReport({ name: 'Urine RE', parameters: [] }));
  assert.match(blank, /<strong>Glucose<\/strong><\/td><td>-<\/td>/);
  assert.match(blank, /<strong>RBC<\/strong><\/td><td>-<\/td>/);
  assert.doesNotMatch(blank, /<strong>Bile Salts, if performed<\/strong>|<strong>Parasites \/ Trichomonas, if examined<\/strong>/);
  const legacy = buildReportHtml(sampleReport({ name: 'Urine RE', parameters: [
    { parameter_name: 'Findings', value: 'Historical <findings>\nRetained' },
    { parameter_name: 'Impression', value: 'Prior impression' },
    { parameter_name: 'Custom Analyte', value: '12', unit: 'local unit', normal_range: 'Local range' },
    { parameter_name: 'Bile Salts', value: 'Not detected' },
  ] }));
  assert.match(legacy, /Historical &lt;findings&gt;<br \/>Retained/);
  assert.match(legacy, /<strong>Laboratory Interpretation<\/strong><\/td><td colspan="3">Prior impression/);
  assert.match(legacy, /<strong>Custom Analyte<\/strong><\/td><td>12<\/td><td>Local range<\/td><td>local unit/);
  assert.match(legacy, /<strong>Bile Salts, if performed<\/strong><\/td><td>Not detected/);
  assert.match(legacy, /<strong>Colour<\/strong><\/td><td>-<\/td>/);
  const manual = buildReportHtml(sampleReport({ name: 'Urine RE', report_body: 'Existing manual body <retained>', parameters: [] }));
  assert.match(manual, /Existing manual body &lt;retained&gt;/);
  assert.doesNotMatch(manual, /data-report-content="urine-routine-examination"/);
  for (const name of ['Urine Protein / Albumin', 'Urine Reducing Substance', 'Urine Culture', 'Stool RE', 'Urine Protein 24 Hours']) assert.doesNotMatch(buildReportHtml(sampleReport({ name, parameters: [] })), /data-report-content="urine-routine-examination"/);
});

test('Urine RE schema repair expands only unused placeholders and retains test and parameter IDs', async () => {
  const db = await fixture();
  try {
    for (let i = 0; i < 8; i++) {
      await db.run('INSERT INTO tests (id,name,category,sample_type,report_body) VALUES (?,?,?,?,?)', [9970 + i, i === 6 ? 'Urine Reducing Substance' : i === 7 ? 'Urine RE' : 'Urine RE (Routine Examination)', 'Imported legacy catalogue', i === 5 ? 'Serum' : null, i === 4 ? 'Custom body' : null]);
      for (const [order, name] of ['Findings', 'Impression', 'Comments'].entries()) await db.run('INSERT INTO test_parameters (test_id,parameter_name,unit,normal_range,entry_mode,display_order) VALUES (?,?,?,?,?,?)', [9970 + i, name, '', i === 3 ? 'Custom reference' : '', 'manual', order + 1]);
    }
    const original = await db.all('SELECT id FROM test_parameters WHERE test_id=9970 ORDER BY display_order');
    await db.run('INSERT INTO visit_tests VALUES (9971)');
    await db.run('INSERT INTO test_bundle_items VALUES (9972,999)');
    await ensureUrineRoutineTestConfiguration(db);
    for (const id of [9970, 9977]) {
      const fields = await db.all('SELECT * FROM test_parameters WHERE test_id=? ORDER BY display_order', [id]);
      assert.deepEqual(fields.map(p => p.parameter_name), getFallbackReportParameters({ name: 'Urine RE' }).map(p => p.parameterName));
      assert.equal((await db.get('SELECT sample_type FROM tests WHERE id=?', [id])).sample_type, 'Urine');
      if (id === 9970) assert.deepEqual(fields.slice(0, 3).map(p => p.id), original.map(p => p.id));
    }
    for (let i = 1; i < 7; i++) assert.equal((await db.get('SELECT COUNT(*) AS n FROM test_parameters WHERE test_id=?', [9970 + i])).n, 3);
    await db.run("UPDATE test_parameters SET normal_range='Local override' WHERE test_id=9970 AND parameter_name='pH'");
    await ensureUrineRoutineTestConfiguration(db);
    assert.equal((await db.get("SELECT normal_range FROM test_parameters WHERE test_id=9970 AND parameter_name='pH'")).normal_range, 'Local override');
  } finally { await db.close(); }
});

test('24-hour Urine Protein separates concentration, daily excretion and verified collection details', () => {
  for (const name of ['Urine Protein 24 Hours', '24 Hrs. Urinary Protein', '24 Hour Urine Protein', 'Total Protein (24 Hour Urine)']) {
    const input = { name, parameters: [
      { parameter_name: 'Total Urine Protein, 24 Hour', value: '180', unit: 'mg/24 h', normal_range: 'Local interval: 40 - 150' },
      { parameter_name: 'Urine Protein Concentration', value: '12', unit: 'mg/dL' },
      { parameter_name: 'Total Urine Volume', value: '1500', unit: 'mL' },
      { parameter_name: 'Collection Duration', value: '24', unit: 'hours' },
      { parameter_name: 'Collection Start Date / Time', value: '2026-10-13 07:00' },
      { parameter_name: 'Collection End Date / Time', value: '2026-10-14 07:00' },
      { parameter_name: 'Method / Analyzer', value: 'Actual laboratory method' },
      { parameter_name: 'Collection Completeness / Comments', value: 'Complete collection\nReview <timing>' },
    ], additional_report_text: 'Clinician advice' };
    const original = JSON.stringify(input);
    const html = buildReportHtml(sampleReport(input));
    assert.match(html, /<div class="test-title">TOTAL PROTEIN, 24-HOUR URINE<\/div>/);
    assert.match(html, /data-report-content="urine-protein-24-hour"/);
    assert.match(html, />180<\/td><td>Local interval: 40 - 150<\/td><td>mg\/24 h/);
    assert.match(html, /<strong>Urine Protein Concentration<\/strong><\/td><td>12<\/td>/);
    assert.match(html, />1500<\/td>/);
    assert.match(html, /2026-10-13 07:00/);
    assert.match(html, /2026-10-14 07:00/);
    assert.match(html, /Actual laboratory method/);
    assert.match(html, /Complete collection<br \/>Review &lt;timing&gt;/);
    assert.match(html, /&divide; 100/);
    assert.match(html, /not albumin alone/);
    assert.match(html, /no result is calculated automatically or extrapolated from partial timing/);
    assert.ok(html.indexOf('Clinician advice') > html.indexOf('<strong>Clinical Details / Indication</strong>'));
    assert.ok(html.indexOf('Clinician advice') < html.indexOf('<div class="single-analyte-notes report-template-notes urine-protein-24-hour-notes">'));
    assert.equal(JSON.stringify(input), original);
    const schema = getFallbackReportParameters({ name });
    assert.equal(schema.length, 10);
    assert.equal(schema[0].unit, 'mg/24 h');
    assert.ok(schema.every(p => p.entryMode === 'manual'));
  }
});

test('24-hour Urine Protein does not invent or extrapolate daily totals and preserves legacy units', () => {
  const blank = buildReportHtml(sampleReport({ name: 'Urine Protein 24 Hours', parameters: [] }));
  assert.match(blank, /<strong>Total Urine Protein, 24 Hour<\/strong><\/td><td>-<\/td>/);
  const partial = buildReportHtml(sampleReport({ name: 'Urine Protein 24 Hours', parameters: [
    { parameter_name: 'Urine Protein Concentration', value: '12' },
    { parameter_name: 'Total Urine Volume', value: '1500' },
    { parameter_name: 'Collection Duration', value: '12' },
  ] }));
  assert.match(partial, /<strong>Total Urine Protein, 24 Hour<\/strong><\/td><td>-<\/td>/);
  const legacy = buildReportHtml(sampleReport({ name: 'Urine Protein 24 Hours', parameters: [{ parameter_name: 'Result', value: '0', unit: 'g/24 h', normal_range: 'Laboratory g/24 h interval' }] }));
  assert.match(legacy, />0<\/td><td>Laboratory g\/24 h interval<\/td><td>g\/24 h/);
  const manual = buildReportHtml(sampleReport({ name: 'Urine Protein 24 Hours', report_body: 'Manual notes <retained>', parameters: [] }));
  assert.match(manual, /Manual notes &lt;retained&gt;/);
  assert.doesNotMatch(manual, /data-report-content="urine-protein-24-hour"/);
  for (const name of ['Urine Protein / Albumin', 'Urine Protein - Creatinine Ratio (UPCR)', 'Albumin Creatinine Ratio', 'Microalbumin (Urine)', 'Total Protein']) {
    assert.doesNotMatch(buildReportHtml(sampleReport({ name, parameters: [] })), /data-report-content="urine-protein-24-hour"/);
  }
});

test('24-hour Urine Protein schema repair supports both names without deleting or overwriting custom entries', async () => {
  const db = await fixture();
  try {
    for (let i = 0; i < 8; i++) {
      await db.run('INSERT INTO tests (id,name,category,sample_type,report_body) VALUES (?,?,?,?,?)', [9960 + i, i === 6 ? 'Urine Protein / Albumin' : i === 7 ? '24 Hrs. Urinary Protein' : 'Urine Protein 24 Hours', 'Imported legacy catalogue', i === 5 ? 'Random urine' : null, i === 4 ? 'Manual notes' : null]);
      await db.run('INSERT INTO test_parameters (test_id,parameter_name,unit,normal_range,entry_mode,display_order) VALUES (?,?,?,?,?,?)', [9960 + i, 'Result', i === 3 ? 'Custom unit' : '', '', 'manual', 1]);
    }
    await db.run('INSERT INTO visit_tests VALUES (9961)');
    await db.run('INSERT INTO test_bundle_items VALUES (999, 9962)');
    await ensure24HourUrineProteinTestConfiguration(db);
    for (const id of [9960, 9967]) {
      const fields = await db.all('SELECT * FROM test_parameters WHERE test_id=? ORDER BY display_order', [id]);
      assert.deepEqual(fields.map(p => p.parameter_name), getFallbackReportParameters({ name: 'Urine Protein 24 Hours' }).map(p => p.parameterName));
      assert.equal((await db.get('SELECT sample_type FROM tests WHERE id=?', [id])).sample_type, '24-hour urine collection');
    }
    for (let i = 1; i < 7; i++) assert.equal((await db.get('SELECT COUNT(*) AS n FROM test_parameters WHERE test_id=?', [9960 + i])).n, 1);
    await db.run("UPDATE test_parameters SET normal_range='Local override' WHERE test_id=9960 AND display_order=1");
    await ensure24HourUrineProteinTestConfiguration(db);
    assert.equal((await db.get('SELECT normal_range FROM test_parameters WHERE test_id=9960 AND display_order=1')).normal_range, 'Local override');
    assert.equal((await db.get('SELECT name FROM tests WHERE id=9967')).name, '24 Hrs. Urinary Protein');
  } finally { await db.close(); }
});

test('Urine Protein Albumin uses method-specific screening results without inferring creatinine ratios', () => {
  for (const name of ['Urine Protein / Albumin', 'Urine Protein/Albumin', 'UnneProtein/Albumin', 'Protein / Albumin (Urine)']) {
    const input = { name, parameters: [
      { parameter_name: 'Urine Protein / Albumin Result', value: 'Trace', normal_range: 'Negative - laboratory reagent' },
      { parameter_name: 'Grade / Semiquantitative Category, if reported', value: 'Trace (local category)' },
      { parameter_name: 'Specimen / Collection Type', value: 'Random urine' },
      { parameter_name: 'Collection Date / Time', value: '2026-10-14 09:00' },
      { parameter_name: 'Method / Reagent', value: 'Recorded screening reagent' },
      { parameter_name: 'Reporting Basis / Measured Analyte', value: 'Qualitative urine protein screen' },
      { parameter_name: 'Comments / Limitations', value: 'Reviewed\nCheck <collection>' },
    ], additional_report_text: 'Clinician advice' };
    const original = JSON.stringify(input);
    const html = buildReportHtml(sampleReport(input));
    assert.match(html, /<div class="test-title">URINE PROTEIN \/ ALBUMIN<\/div>/);
    assert.match(html, /data-report-content="urine-protein-albumin"/);
    assert.match(html, />Trace<\/td><td>Negative - laboratory reagent<\/td><td><\/td>/);
    assert.match(html, /Trace \(local category\)/);
    assert.match(html, /Recorded screening reagent/);
    assert.match(html, /Random urine/);
    assert.match(html, /Reviewed<br \/>Check &lt;collection&gt;/);
    assert.match(html, /A grade is not an exact protein concentration/);
    assert.match(html, /may miss some non-albumin proteins/);
    assert.match(html, /does not establish that total protein and albumin were measured separately/);
    assert.ok(html.indexOf('Clinician advice') > html.indexOf('<strong>Comments / Limitations</strong>'));
    assert.ok(html.indexOf('Clinician advice') < html.indexOf('<div class="single-analyte-notes report-template-notes urine-protein-albumin-notes">'));
    assert.equal(JSON.stringify(input), original);
    const schema = getFallbackReportParameters({ name });
    assert.equal(schema.length, 8);
    assert.equal(schema[0].unit, '');
    assert.ok(schema.every(p => p.entryMode === 'manual'));
  }
});

test('Urine Protein Albumin preserves blank, numerical and separately recorded protein/albumin values', () => {
  const blank = buildReportHtml(sampleReport({ name: 'Urine Protein / Albumin', parameters: [] }));
  assert.match(blank, /<strong>Urine Protein \/ Albumin Result<\/strong><\/td><td>-<\/td>/);
  assert.doesNotMatch(blank, /<strong>Grade \/ Semiquantitative Category<\/strong>/);
  const quantitative = buildReportHtml(sampleReport({ name: 'Urine Protein / Albumin', parameters: [
    { parameter_name: 'Result', value: '0', normal_range: 'Laboratory quantitative interval', unit: 'mg/dL' },
  ] }));
  assert.match(quantitative, />0<\/td><td>Laboratory quantitative interval<\/td><td>mg\/dL/);
  const separate = buildReportHtml(sampleReport({ name: 'Urine Protein / Albumin', parameters: [
    { parameter_name: 'Urine Protein', value: '14', unit: 'mg/dL', normal_range: 'Protein interval' },
    { parameter_name: 'Urine Albumin', value: '8', unit: 'mg/L', normal_range: 'Albumin interval' },
  ] }));
  assert.match(separate, /<strong>Protein, Urine \(reported\)<\/strong><\/td><td>14<\/td><td>Protein interval<\/td><td>mg\/dL/);
  assert.match(separate, /<strong>Albumin, Urine \(reported\)<\/strong><\/td><td>8<\/td><td>Albumin interval<\/td><td>mg\/L/);
  const manual = buildReportHtml(sampleReport({ name: 'Urine Protein / Albumin', report_body: 'Custom notes <retained>', parameters: [] }));
  assert.match(manual, /Custom notes &lt;retained&gt;/);
  assert.doesNotMatch(manual, /data-report-content="urine-protein-albumin"/);
  for (const name of ['Urine Protein 24 Hours', 'Urine Protein - Creatinine Ratio (UPCR)', 'Albumin Creatinine Ratio', 'Microalbumin (Urine)', 'Albumin']) {
    assert.doesNotMatch(buildReportHtml(sampleReport({ name, parameters: [] })), /data-report-content="urine-protein-albumin"/);
  }
});

test('Urine Protein Albumin fills only unused blank urine entries and preserves related assays', async () => {
  const db = await fixture();
  try {
    for (let i = 0; i < 7; i++) {
      await db.run('INSERT INTO tests (id,name,category,sample_type,report_body) VALUES (?,?,?,?,?)', [9950 + i, i === 6 ? 'Urine Protein 24 Hours' : 'Urine Protein / Albumin', 'Imported legacy catalogue', i === 5 ? 'Serum' : null, i === 4 ? 'Manual report body' : null]);
      await db.run('INSERT INTO test_parameters (test_id,parameter_name,unit,normal_range,entry_mode,display_order) VALUES (?,?,?,?,?,?)', [9950 + i, 'Result', i === 3 ? 'Lab unit' : '', '', 'manual', 1]);
    }
    await db.run('INSERT INTO visit_tests VALUES (9951)');
    await db.run('INSERT INTO test_bundle_items VALUES (9952, 999)');
    await ensureUrineProteinAlbuminTestConfiguration(db);
    const fields = await db.all('SELECT * FROM test_parameters WHERE test_id=9950 ORDER BY display_order');
    assert.deepEqual(fields.map(p => p.parameter_name), getFallbackReportParameters({ name: 'Urine Protein / Albumin' }).map(p => p.parameterName));
    assert.equal((await db.get('SELECT sample_type FROM tests WHERE id=9950')).sample_type, 'Urine');
    for (let i = 1; i < 7; i++) assert.equal((await db.get('SELECT COUNT(*) AS n FROM test_parameters WHERE test_id=?', [9950 + i])).n, 1);
    await db.run("UPDATE test_parameters SET normal_range='Local override' WHERE test_id=9950 AND display_order=1");
    await ensureUrineProteinAlbuminTestConfiguration(db);
    assert.equal((await db.get('SELECT normal_range FROM test_parameters WHERE test_id=9950 AND display_order=1')).normal_range, 'Local override');
  } finally { await db.close(); }
});

test('Urine Pregnancy Test uses a qualitative urine hCG format with laboratory-entered method and validity', () => {
  for (const name of ['Urine Pregnancy Test', 'Pregnancy Test (Urine)', 'UnnePregnancyTest', 'Urine hCG Qualitative']) {
    const input = { name, parameters: [
      { parameter_name: 'Urine hCG, Qualitative Result', value: 'Positive', normal_range: 'Negative - kit-specific' },
      { parameter_name: 'Collection Date / Time', value: '2026-10-14 09:00' },
      { parameter_name: 'Method / Assay', value: 'Recorded urine hCG method' },
      { parameter_name: 'Kit / Platform', value: 'Actual laboratory kit' },
      { parameter_name: 'Assay Cut-off / Detection Limit, if supplied', value: '20', unit: 'mIU/mL' },
      { parameter_name: 'Control / Test Validity, if applicable', value: 'Valid control - recorded' },
      { parameter_name: 'Comments / Limitations', value: 'Clinical follow-up\nReview <timing>' },
    ], additional_report_text: 'Clinician-entered advice' };
    const original = JSON.stringify(input);
    const html = buildReportHtml(sampleReport(input));
    assert.match(html, /<div class="test-title">URINE PREGNANCY TEST \(QUALITATIVE hCG\)<\/div>/);
    assert.match(html, /data-report-content="urine-pregnancy-test"/);
    assert.match(html, />Positive<\/td><td>Negative - kit-specific<\/td><td><\/td>/);
    assert.match(html, /Recorded urine hCG method/);
    assert.match(html, /Actual laboratory kit/);
    assert.match(html, />20<\/td><td>Manufacturer \/ laboratory-validated limit<\/td><td>mIU\/mL/);
    assert.match(html, /Valid control - recorded/);
    assert.match(html, /Clinical follow-up<br \/>Review &lt;timing&gt;/);
    assert.match(html, /Testing too early or using dilute urine/);
    assert.match(html, /Do not treat an invalid test as negative/);
    assert.ok(html.indexOf('Clinician-entered advice') > html.indexOf('<strong>Comments / Limitations</strong>'));
    assert.ok(html.indexOf('Clinician-entered advice') < html.indexOf('<div class="single-analyte-notes report-template-notes urine-pregnancy-notes">'));
    assert.equal(JSON.stringify(input), original);
    const schema = getFallbackReportParameters({ name });
    assert.equal(schema.length, 9);
    assert.equal(schema[0].unit, '');
    assert.ok(schema.every(p => p.entryMode === 'manual'));
  }
});

test('Urine Pregnancy Test keeps unreported results and cut-offs blank without implying valid or negative', () => {
  const blank = buildReportHtml(sampleReport({ name: 'Urine Pregnancy Test', parameters: [] }));
  assert.match(blank, /<strong>Urine hCG, Qualitative Result<\/strong><\/td><td>-<\/td>/);
  assert.match(blank, /<strong>Control \/ Test Validity, if applicable<\/strong><\/td><td colspan="3">-<\/td>/);
  assert.doesNotMatch(blank, /<strong>Assay Cut-off \/ Detection Limit<\/strong>/);
  assert.doesNotMatch(blank, />25<\/td>/);
  const invalid = buildReportHtml(sampleReport({ name: 'Urine Pregnancy Test', parameters: [
    { parameter_name: 'Urine hCG, Qualitative Result', value: 'Invalid - repeat required' },
    { parameter_name: 'Control / Test Validity, if applicable', value: 'Control not valid' },
  ] }));
  assert.match(invalid, />Invalid - repeat required<\/td>/);
  assert.match(invalid, /Control not valid/);
  const legacy = buildReportHtml(sampleReport({ name: 'Urine Pregnancy Test', parameters: [{ parameter_name: 'Result', value: 'Historical finding', normal_range: 'Historical reference' }] }));
  assert.match(legacy, />Historical finding<\/td><td>Historical reference/);
  const manual = buildReportHtml(sampleReport({ name: 'Urine Pregnancy Test', report_body: 'Lab note <preserved>', parameters: [] }));
  assert.match(manual, /Lab note &lt;preserved&gt;/);
  assert.doesNotMatch(manual, /data-report-content="urine-pregnancy-test"/);
  for (const name of ['Pregnancy Elisa Test', 'HCG, Beta, Total, Pregnancy', 'Free Beta hCG']) {
    assert.doesNotMatch(buildReportHtml(sampleReport({ name, parameters: [] })), /data-report-content="urine-pregnancy-test"/);
  }
});

test('Urine Pregnancy Test expands only unused blank urine placeholders and preserves serum/custom tests', async () => {
  const db = await fixture();
  try {
    for (let i = 0; i < 7; i++) {
      await db.run('INSERT INTO tests (id,name,category,sample_type,report_body) VALUES (?,?,?,?,?)', [9940 + i, i === 6 ? 'Pregnancy Elisa Test' : 'Urine Pregnancy Test', 'Imported legacy catalogue', i === 5 ? 'Serum' : null, i === 4 ? 'Manual notes' : null]);
      await db.run('INSERT INTO test_parameters (test_id,parameter_name,unit,normal_range,entry_mode,display_order) VALUES (?,?,?,?,?,?)', [9940 + i, 'Result', '', i === 3 ? 'Custom interval' : '', 'manual', 1]);
    }
    await db.run('INSERT INTO visit_tests VALUES (9941)');
    await db.run('INSERT INTO test_bundle_items VALUES (9942, 999)');
    await ensureUrinePregnancyTestConfiguration(db);
    const fields = await db.all('SELECT * FROM test_parameters WHERE test_id=9940 ORDER BY display_order');
    assert.deepEqual(fields.map(p => p.parameter_name), getFallbackReportParameters({ name: 'Urine Pregnancy Test' }).map(p => p.parameterName));
    assert.equal((await db.get('SELECT sample_type FROM tests WHERE id=9940')).sample_type, 'Urine');
    for (let i = 1; i < 7; i++) assert.equal((await db.get('SELECT COUNT(*) AS n FROM test_parameters WHERE test_id=?', [9940 + i])).n, 1);
    await db.run("UPDATE test_parameters SET normal_range='Local reference' WHERE test_id=9940 AND display_order=1");
    await ensureUrinePregnancyTestConfiguration(db);
    assert.equal((await db.get('SELECT normal_range FROM test_parameters WHERE test_id=9940 AND display_order=1')).normal_range, 'Local reference');
  } finally { await db.close(); }
});

test('Urine Porphobilinogen preserves qualitative results and method-specific reference guidance', () => {
  for (const name of ['Urine Porphobilinogen', 'Porphobilinogen (Urine)', 'Porphobilinogen (PBG), Urine', 'Urine PBG']) {
    const input = { name, parameters: [
      { parameter_name: 'Porphobilinogen (PBG), Urine', value: 'Not detected', normal_range: 'Laboratory screening reference' },
      { parameter_name: 'Test / Reporting Basis', value: 'Qualitative screen' },
      { parameter_name: 'Method / Analyzer', value: 'Laboratory-entered method' },
      { parameter_name: 'Collection Date / Time', value: '2026-10-14 09:00' },
      { parameter_name: 'Light Protection / Storage', value: 'Light-protected specimen' },
      { parameter_name: 'Comments / Limitations', value: 'Reviewed\nConfirm <handling>' },
    ] };
    const original = JSON.stringify(input);
    const html = buildReportHtml(sampleReport(input));
    assert.match(html, /<div class="test-title">PORPHOBILINOGEN \(PBG\), URINE<\/div>/);
    assert.match(html, /data-report-content="urine-porphobilinogen"/);
    assert.match(html, />Not detected<\/td><td>Laboratory screening reference<\/td><td><\/td>/);
    assert.match(html, /Qualitative screen/);
    assert.match(html, /Laboratory-entered method/);
    assert.match(html, /Light-protected specimen/);
    assert.match(html, /Reviewed<br \/>Confirm &lt;handling&gt;/);
    assert.match(html, /&le; 0\.2 mmol\/mol creatinine/);
    assert.match(html, /it is not a concentration or a daily-excretion limit/);
    assert.doesNotMatch(html, /<strong>PBG \/ Creatinine Ratio, if reported<\/strong>/);
    assert.equal(JSON.stringify(input), original);
    const schema = getFallbackReportParameters({ name });
    assert.equal(schema.length, 14);
    assert.equal(schema[0].unit, '');
    assert.ok(schema.every(p => p.entryMode === 'manual'));
  }
});

test('Urine Porphobilinogen retains quantitative units and zero without calculating missing values', () => {
  const html = buildReportHtml(sampleReport({ name: 'Urine Porphobilinogen', parameters: [
    { parameter_name: 'Porphobilinogen (PBG), Urine', value: '1.4', unit: 'mg/L', normal_range: 'Local concentration interval' },
    { parameter_name: 'PBG / Creatinine Ratio, if reported', value: '0', unit: 'mmol/mol creatinine', normal_range: '0.0 - 0.2' },
    { parameter_name: 'Total Urine Volume, if timed collection', value: '1500', unit: 'mL' },
    { parameter_name: 'Collection Duration, if timed collection', value: '12', unit: 'hours' },
  ], additional_report_text: 'Doctor-entered advice' }));
  assert.match(html, />1\.4<\/td><td>Local concentration interval<\/td><td>mg\/L/);
  assert.match(html, />0<\/td><td>0.0 - 0.2<\/td><td>mmol\/mol creatinine/);
  assert.doesNotMatch(html, /<strong>PBG, 24-Hour Excretion, if reported<\/strong>/);
  assert.ok(html.indexOf('Doctor-entered advice') > html.indexOf('<strong>Comments / Limitations</strong>'));
  assert.ok(html.indexOf('Doctor-entered advice') < html.indexOf('<div class="single-analyte-notes report-template-notes urine-porphobilinogen-notes">'));
  const blank = buildReportHtml(sampleReport({ name: 'Urine Porphobilinogen', parameters: [] }));
  assert.match(blank, /<strong>Porphobilinogen \(PBG\), Urine<\/strong><\/td><td>-<\/td>/);
  const legacy = buildReportHtml(sampleReport({ name: 'Urine Porphobilinogen', parameters: [{ parameter_name: 'Result', value: 'Historical finding', normal_range: 'Historical reference', unit: 'Lab unit' }] }));
  assert.match(legacy, />Historical finding<\/td><td>Historical reference<\/td><td>Lab unit/);
  const manual = buildReportHtml(sampleReport({ name: 'Urine Porphobilinogen', report_body: 'Manual note <retained>', parameters: [] }));
  assert.match(manual, /Manual note &lt;retained&gt;/);
  assert.doesNotMatch(manual, /data-report-content="urine-porphobilinogen"/);
  for (const name of ['Urine Porphyrins', 'Urine Urobilinogen', 'Aminolevulinic Acid, Urine', 'Porphyrins and PBG, Urine']) {
    assert.doesNotMatch(buildReportHtml(sampleReport({ name, parameters: [] })), /data-report-content="urine-porphobilinogen"/);
  }
});

test('Urine Porphobilinogen upgrades only unused blank placeholders and preserves custom assays', async () => {
  const db = await fixture();
  try {
    for (let i = 0; i < 7; i++) {
      await db.run('INSERT INTO tests (id,name,category,sample_type,report_body) VALUES (?,?,?,?,?)', [9930 + i, i === 6 ? 'Urine Porphyrins' : 'Urine Porphobilinogen', 'Imported legacy catalogue', i === 5 ? 'Blood' : null, i === 4 ? 'Manual notes' : null]);
      await db.run('INSERT INTO test_parameters (test_id,parameter_name,unit,normal_range,entry_mode,display_order) VALUES (?,?,?,?,?,?)', [9930 + i, 'Result', i === 3 ? 'Custom unit' : '', '', 'manual', 1]);
    }
    await db.run('INSERT INTO visit_tests VALUES (9931)');
    await db.run('INSERT INTO test_bundle_items VALUES (999, 9932)');
    await ensureUrinePorphobilinogenTestConfiguration(db);
    const fields = await db.all('SELECT * FROM test_parameters WHERE test_id=9930 ORDER BY display_order');
    assert.deepEqual(fields.map(p => p.parameter_name), getFallbackReportParameters({ name: 'Urine Porphobilinogen' }).map(p => p.parameterName));
    assert.match((await db.get('SELECT sample_type FROM tests WHERE id=9930')).sample_type, /protect from light/);
    for (let i = 1; i < 7; i++) assert.equal((await db.get('SELECT COUNT(*) AS n FROM test_parameters WHERE test_id=?', [9930 + i])).n, 1);
    await db.run("UPDATE test_parameters SET normal_range='Local interval' WHERE test_id=9930 AND display_order=1");
    await ensureUrinePorphobilinogenTestConfiguration(db);
    assert.equal((await db.get('SELECT normal_range FROM test_parameters WHERE test_id=9930 AND display_order=1')).normal_range, 'Local interval');
  } finally { await db.close(); }
});

test('Urine OBT three-day series records independent urine dates, results and method-specific grades', () => {
  for (const name of ['Urine OBT (3 Consecutive days)', 'Urine OBT (Three Consecutive Days)', 'Urine Occult Blood Test (3 Days)']) {
    const input = { name, parameters: [
      { parameter_name: 'Day 1 Collection Date / Time', value: '2026-10-12 08:00' },
      { parameter_name: 'Day 1 Urine Blood / OBT Result', value: 'Not detected', normal_range: 'Laboratory reference' },
      { parameter_name: 'Day 2 Collection Date / Time', value: '2026-10-13 08:00' },
      { parameter_name: 'Day 2 Urine Blood / OBT Result', value: 'Trace' },
      { parameter_name: 'Day 2 Grade, if reported', value: 'Local trace category' },
      { parameter_name: 'Day 3 Collection Date / Time', value: '2026-10-14 08:00' },
      { parameter_name: 'Method / Reagent', value: 'Recorded urine assay' },
      { parameter_name: 'Comments / Specimen Limitations', value: 'Day 3 pending\nReview <collection>' },
    ], additional_report_text: 'Clinician-entered advice' };
    const original = JSON.stringify(input);
    const html = buildReportHtml(sampleReport(input));
    assert.match(html, /<div class="test-title">URINE OBT \(THREE CONSECUTIVE DAYS\)<\/div>/);
    assert.match(html, /data-report-content="urine-obt-three-days"/);
    assert.match(html, /2026-10-12 08:00/);
    assert.match(html, /2026-10-13 08:00/);
    assert.match(html, /<strong>Day 2<\/strong><\/td><td>2026-10-13 08:00<\/td><td>Trace<\/td><td>Local trace category/);
    assert.match(html, /<strong>Day 3<\/strong><\/td><td>2026-10-14 08:00<\/td><td>-<\/td>/);
    assert.match(html, /Day 3 pending<br \/>Review &lt;collection&gt;/);
    assert.match(html, /not a stool occult blood test/);
    assert.match(html, /does not establish microscopic haematuria/);
    assert.equal(JSON.stringify(input), original);
    const advicePosition = html.indexOf('Clinician-entered advice');
    assert.ok(advicePosition > html.indexOf('<strong>Comments / Specimen Limitations</strong>'));
    assert.ok(advicePosition < html.indexOf('<div class="single-analyte-notes report-template-notes urine-obt-three-day-notes">'));
    assert.equal(getFallbackReportParameters({ name }).length, 13);
    assert.ok(getFallbackReportParameters({ name }).every(p => p.entryMode === 'manual'));
  }
});

test('Urine OBT three-day series leaves missing days blank and preserves unassigned historical results', () => {
  const blank = buildReportHtml(sampleReport({ name: 'Urine OBT (3 Consecutive days)', parameters: [] }));
  for (const day of [1, 2, 3]) assert.match(blank, new RegExp(`<strong>Day ${day}</strong></td><td>-</td><td>-</td><td>-</td>`));
  const legacy = buildReportHtml(sampleReport({ name: 'Urine OBT (3 Consecutive days)', parameters: [{ parameter_name: 'Result', value: 'Old result <retained>' }] }));
  assert.match(legacy, /Previously Recorded Result \(day not specified\)/);
  assert.match(legacy, /Old result &lt;retained&gt;/);
  assert.match(legacy, /<strong>Day 1<\/strong><\/td><td>-<\/td><td>-<\/td>/);
  const manual = buildReportHtml(sampleReport({ name: 'Urine OBT (3 Consecutive days)', report_body: 'Custom notes <retained>', parameters: [] }));
  assert.match(manual, /Custom notes &lt;retained&gt;/);
  assert.doesNotMatch(manual, /data-report-content="urine-obt-three-days"/);
  for (const name of ['Urine OBT', 'Stool OBT', 'Stool OBT + RE (3 Days)', 'Occult Blood Stool Examination']) {
    assert.doesNotMatch(buildReportHtml(sampleReport({ name, parameters: [] })), /data-report-content="urine-obt-three-days"/);
  }
});

test('Urine OBT three-day schema repair preserves used/custom tests and neighbouring stool tests', async () => {
  const db = await fixture();
  try {
    for (let i = 0; i < 7; i++) {
      await db.run('INSERT INTO tests (id,name,category,sample_type,report_body) VALUES (?,?,?,?,?)', [9920 + i, i === 6 ? 'Stool OBT + RE (3 Days)' : 'Urine OBT (3 Consecutive days)', 'Imported legacy catalogue', i === 5 ? 'Stool' : null, i === 4 ? 'Manual report body' : null]);
      await db.run('INSERT INTO test_parameters (test_id,parameter_name,unit,normal_range,entry_mode,display_order) VALUES (?,?,?,?,?,?)', [9920 + i, 'Result', '', i === 3 ? 'Custom interval' : '', 'manual', 1]);
    }
    await db.run('INSERT INTO visit_tests VALUES (9921)');
    await db.run('INSERT INTO test_bundle_items VALUES (9922, 999)');
    await ensureUrineObtThreeDayTestConfiguration(db);
    const fields = await db.all('SELECT * FROM test_parameters WHERE test_id=9920 ORDER BY display_order');
    assert.deepEqual(fields.map(p => p.parameter_name), getFallbackReportParameters({ name: 'Urine OBT (3 Consecutive days)' }).map(p => p.parameterName));
    for (let i = 1; i < 7; i++) assert.equal((await db.get('SELECT COUNT(*) AS n FROM test_parameters WHERE test_id=?', [9920 + i])).n, 1);
    await db.run("UPDATE test_parameters SET normal_range='Local interval' WHERE test_id=9920 AND display_order=2");
    await ensureUrineObtThreeDayTestConfiguration(db);
    assert.equal((await db.get('SELECT normal_range FROM test_parameters WHERE test_id=9920 AND display_order=2')).normal_range, 'Local interval');
  } finally { await db.close(); }
});

test('Urinary VMA separates timed excretion, concentration and creatinine-normalized results', () => {
  for (const name of ['Urinary V M A', 'Urinary VMA', 'VMA (Urine)', 'Vanillylmandelic Acid (VMA), Urine']) {
    const html = buildReportHtml(sampleReport({ name, parameters: [
      { parameter_name: 'VMA, 24-Hour Urine', value: '4.2', unit: 'mg/24 h', normal_range: 'Laboratory interval: 0 - 6' },
      { parameter_name: 'VMA, Urine Concentration', value: '2.8', unit: 'mg/L' },
      { parameter_name: 'VMA / Creatinine Ratio, if reported', value: '3.5', unit: 'mg/g creatinine', normal_range: 'Age-specific laboratory interval' },
      { parameter_name: 'Total Urine Volume', value: '1500', unit: 'mL' },
      { parameter_name: 'Collection Duration', value: '24', unit: 'hours' },
      { parameter_name: 'Specimen / Collection Type', value: 'Complete timed urine' },
      { parameter_name: 'Collection Completeness / Interpretation / Comments', value: 'Reviewed\nDiscuss <medications>' },
    ] }));
    assert.match(html, /<div class="test-title">URINARY VMA \(VANILLYLMANDELIC ACID\)<\/div>/);
    assert.match(html, /data-report-content="urinary-vma"/);
    assert.match(html, />4\.2<\/td><td>Laboratory interval: 0 - 6<\/td><td>mg\/24 h/);
    assert.match(html, />2\.8<\/td><td>No established concentration reference interval<\/td><td>mg\/L/);
    assert.match(html, />3\.5<\/td><td>Age-specific laboratory interval<\/td><td>mg\/g creatinine/);
    assert.match(html, /Complete timed urine/);
    assert.match(html, /Reviewed<br \/>Discuss &lt;medications&gt;/);
    assert.match(html, /a normal result does not exclude a tumour/);
    assert.match(html, /0 - 27/);
    assert.equal(getFallbackReportParameters({ name }).length, 13);
    assert.equal(getFallbackReportParameters({ name })[0].unit, 'mg/24 h');
    assert.ok(getFallbackReportParameters({ name }).every(p => p.entryMode === 'manual'));
  }
});

test('Urinary VMA preserves blank and legacy values without confusing concentration with daily excretion', () => {
  const blank = buildReportHtml(sampleReport({ name: 'Urinary V M A', parameters: [] }));
  assert.match(blank, /<strong>VMA, 24-Hour Urine<\/strong><\/td><td>-<\/td>/);
  const partial = buildReportHtml(sampleReport({ name: 'Urinary V M A', parameters: [
    { parameter_name: 'VMA, Urine Concentration', value: '2.8' },
    { parameter_name: 'Total Urine Volume', value: '1500' },
    { parameter_name: 'Collection Duration', value: '12' },
  ] }));
  assert.match(partial, /<strong>VMA, 24-Hour Urine<\/strong><\/td><td>-<\/td>/);
  assert.match(partial, /<strong>VMA \/ Creatinine Ratio, if reported<\/strong><\/td><td>-<\/td>/);
  const legacy = buildReportHtml(sampleReport({ name: 'Urinary V M A', parameters: [{ parameter_name: 'Result', value: '0', unit: 'Lab unit', normal_range: 'Lab range' }] }));
  assert.match(legacy, />0<\/td><td>Lab range<\/td><td>Lab unit/);
  const manual = buildReportHtml(sampleReport({ name: 'Urinary V M A', report_body: 'Preserve laboratory note <original>', parameters: [] }));
  assert.match(manual, /Preserve laboratory note &lt;original&gt;/);
  assert.doesNotMatch(manual, /data-report-content="urinary-vma"/);
  for (const name of ['Homovanillic Acid (HVA), Urine', 'VMA & HVA, Urine', 'Urinary 17 Ketosteroid', 'Urinary 17 Oxysteriod', 'Metanephrines, Urine', 'VMA (Random Urine)']) {
    assert.doesNotMatch(buildReportHtml(sampleReport({ name, parameters: [] })), /data-report-content="urinary-vma"/);
  }
});

test('Urinary VMA upgrades only unused blank timed-urine placeholders and preserves custom schemas', async () => {
  const db = await fixture();
  try {
    for (let i = 0; i < 7; i++) {
      await db.run('INSERT INTO tests (id,name,category,sample_type,report_body) VALUES (?,?,?,?,?)', [9910 + i, i === 6 ? 'Urinary 17 Oxysteriod' : 'Urinary V M A', 'Imported legacy catalogue', i === 5 ? 'Random urine' : null, i === 4 ? 'Manual format' : null]);
      await db.run('INSERT INTO test_parameters (test_id,parameter_name,unit,normal_range,entry_mode,display_order) VALUES (?,?,?,?,?,?)', [9910 + i, 'Result', i === 3 ? 'Custom unit' : '', '', 'manual', 1]);
    }
    await db.run('INSERT INTO visit_tests VALUES (9911)');
    await db.run('INSERT INTO test_bundle_items VALUES (999, 9912)');
    await ensureUrinaryVmaTestConfiguration(db);
    const fields = await db.all('SELECT * FROM test_parameters WHERE test_id=9910 ORDER BY display_order');
    assert.deepEqual(fields.map(p => p.parameter_name), getFallbackReportParameters({ name: 'Urinary V M A' }).map(p => p.parameterName));
    assert.equal((await db.get('SELECT sample_type FROM tests WHERE id=9910')).sample_type, '24-hour urine collection');
    for (let i = 1; i < 7; i++) assert.equal((await db.get('SELECT COUNT(*) AS n FROM test_parameters WHERE test_id=?', [9910 + i])).n, 1);
    await db.run("UPDATE test_parameters SET normal_range='Local override' WHERE test_id=9910 AND display_order=1");
    await ensureUrinaryVmaTestConfiguration(db);
    assert.equal((await db.get('SELECT normal_range FROM test_parameters WHERE test_id=9910 AND display_order=1')).normal_range, 'Local override');
  } finally { await db.close(); }
});

test('Urinary 17 Ketosteroid uses a complete timed-urine format with qualified reference guidance', () => {
  for (const name of ['Urinary 17 Ketosteroid', 'Urinary 17-Ketosteroids', '17-Ketosteroids, Urine', '17-KS Urine']) {
    const html = buildReportHtml(sampleReport({ name, parameters: [
      { parameter_name: '17-Ketosteroids, 24-Hour Urine', value: '8.5', unit: 'mg/24 h', normal_range: 'Local interval: 4 - 12' },
      { parameter_name: '17-Ketosteroids, Urine Concentration', value: '5.7', unit: 'mg/L' },
      { parameter_name: 'Total Urine Volume', value: '1500', unit: 'mL' },
      { parameter_name: 'Collection Duration', value: '24', unit: 'hours' },
      { parameter_name: 'Collection Start Date / Time', value: '2026-10-13 07:00' },
      { parameter_name: 'Collection End Date / Time', value: '2026-10-14 07:00' },
      { parameter_name: 'Method / Analyzer', value: 'Laboratory-entered method' },
      { parameter_name: 'Collection Completeness / Comments', value: 'Complete collection\nReview <medication>' },
    ] }));
    assert.match(html, /<div class="test-title">URINARY 17-KETOSTEROIDS, 24-HOUR URINE<\/div>/);
    assert.match(html, /data-report-content="urinary-17-ketosteroids"/);
    assert.match(html, />8\.5<\/td><td>Local interval: 4 - 12<\/td><td>mg\/24 h/);
    assert.match(html, />5\.7<\/td>/);
    assert.match(html, /Complete collection<br \/>Review &lt;medication&gt;/);
    assert.match(html, /5\.3 - 17\.6/);
    assert.match(html, /children need their own age-specific intervals/);
    assert.match(html, /must not be compared with mg\/24 h limits/);
    assert.equal(getFallbackReportParameters({ name })[0].unit, 'mg/24 h');
    assert.equal(getFallbackReportParameters({ name }).length, 11);
  }
});

test('Urinary 17 Ketosteroid preserves zero and legacy results without fabricating timed excretion', () => {
  const blank = buildReportHtml(sampleReport({ name: 'Urinary 17 Ketosteroid', parameters: [] }));
  assert.match(blank, /<strong>17-Ketosteroids, 24-Hour Urine<\/strong><\/td><td>-<\/td>/);
  const partial = buildReportHtml(sampleReport({ name: 'Urinary 17 Ketosteroid', parameters: [
    { parameter_name: '17-Ketosteroids, Urine Concentration', value: '5.7' },
    { parameter_name: 'Total Urine Volume', value: '1500' },
    { parameter_name: 'Collection Duration', value: '12' },
  ] }));
  assert.match(partial, /<strong>17-Ketosteroids, 24-Hour Urine<\/strong><\/td><td>-<\/td>/);
  const legacy = buildReportHtml(sampleReport({ name: 'Urinary 17 Ketosteroid', parameters: [{ parameter_name: 'Result', value: '0', unit: 'lab-unit', normal_range: 'Lab range' }] }));
  assert.match(legacy, />0<\/td><td>Lab range<\/td><td>lab-unit/);
  const manual = buildReportHtml(sampleReport({ name: 'Urinary 17 Ketosteroid', report_body: 'Lab-approved notes <retain>', parameters: [] }));
  assert.match(manual, /Lab-approved notes &lt;retain&gt;/);
  assert.doesNotMatch(manual, /data-report-content="urinary-17-ketosteroids"/);
  for (const name of ['17-Hydroxycorticosteroids, Urine', '17-Hydroxyprogesterone', 'Uric Acid(Urine)']) {
    assert.doesNotMatch(buildReportHtml(sampleReport({ name, parameters: [] })), /data-report-content="urinary-17-ketosteroids"/);
  }
});

test('Urinary 17 Ketosteroid upgrades only unused blank placeholders and is idempotent', async () => {
  const db = await fixture();
  try {
    for (let i = 0; i < 6; i++) {
      await db.run('INSERT INTO tests (id,name,category,sample_type,report_body) VALUES (?,?,?,?,?)', [9900 + i, 'Urinary 17 Ketosteroid', 'Imported legacy catalogue', null, i === 4 ? 'Manual format' : null]);
      await db.run('INSERT INTO test_parameters (test_id,parameter_name,unit,normal_range,entry_mode,display_order) VALUES (?,?,?,?,?,?)', [9900 + i, 'Result', i === 3 ? 'Custom unit' : '', '', 'manual', 1]);
    }
    await db.run('INSERT INTO visit_tests VALUES (9901)');
    await db.run('INSERT INTO test_bundle_items VALUES (9902, 999)');
    await db.run("UPDATE tests SET sample_type='Serum' WHERE id=9905");
    await ensureUrinary17KetosteroidTestConfiguration(db);
    const fields = await db.all('SELECT * FROM test_parameters WHERE test_id=9900 ORDER BY display_order');
    assert.deepEqual(fields.map(p => p.parameter_name), getFallbackReportParameters({ name: 'Urinary 17 Ketosteroid' }).map(p => p.parameterName));
    assert.equal((await db.get('SELECT sample_type FROM tests WHERE id=9900')).sample_type, '24-hour urine collection');
    for (let i = 1; i < 6; i++) assert.equal((await db.get('SELECT COUNT(*) AS n FROM test_parameters WHERE test_id=?', [9900 + i])).n, 1);
    await db.run("UPDATE test_parameters SET normal_range='Local override' WHERE test_id=9900 AND display_order=1");
    await ensureUrinary17KetosteroidTestConfiguration(db);
    assert.equal((await db.get('SELECT normal_range FROM test_parameters WHERE test_id=9900 AND display_order=1')).normal_range, 'Local override');
  } finally { await db.close(); }
});

test('24-hour urine urea keeps daily excretion, concentration and collection details separate', () => {
  for (const name of ['Urea(24 hrs. Urine)', 'Urea (24 hour urine)', '24 Hour Urine Urea']) {
    const html = buildReportHtml(sampleReport({ name, parameters: [
      { parameter_name: 'Urine Urea, 24 Hour', value: '18', unit: 'g/24 h', normal_range: 'Local adult interval: 7 - 40' },
      { parameter_name: 'Urine Urea Concentration', value: '1200', unit: 'mg/dL' },
      { parameter_name: 'Total Urine Volume', value: '1500', unit: 'mL' },
      { parameter_name: 'Collection Duration', value: '24', unit: 'hours' },
      { parameter_name: 'Collection Start Date / Time', value: '2026-10-12 07:00' },
      { parameter_name: 'Collection End Date / Time', value: '2026-10-13 07:00' },
      { parameter_name: 'Collection Completeness / Comments', value: 'Complete collection\nNo spillage reported' },
    ] }));
    assert.match(html, /<div class="test-title">UREA, 24-HOUR URINE<\/div>/);
    assert.match(html, /data-report-content="urine-urea-24-hour"/);
    assert.match(html, />18<\/td><td>Local adult interval: 7 - 40<\/td><td>g\/24 h/);
    assert.match(html, />1200<\/td>/);
    assert.match(html, />1500<\/td>/);
    assert.match(html, /2026-10-12 07:00/);
    assert.match(html, /Complete collection<br \/>No spillage reported/);
    assert.match(html, /This report measures urea, not urine urea nitrogen/);
    assert.doesNotMatch(html, /<div class="test-title">BLOOD UREA NITROGEN/);
    assert.equal(getFallbackReportParameters({ name })[0].unit, 'g/24 h');
  }
  const blank = buildReportHtml(sampleReport({ name: 'Urea(24 hrs. Urine)', parameters: [] }));
  assert.match(blank, /<strong>Urine Urea, 24 Hour<\/strong><\/td><td>-<\/td>/);
  assert.match(blank, /<strong>Collection Duration<\/strong><\/td><td>-<\/td>/);
  const partial = buildReportHtml(sampleReport({ name: 'Urea(24 hrs. Urine)', parameters: [
    { parameter_name: 'Urine Urea Concentration', value: '1200' },
    { parameter_name: 'Total Urine Volume', value: '1500' },
    { parameter_name: 'Collection Duration', value: '12' },
  ] }));
  assert.match(partial, /<strong>Urine Urea, 24 Hour<\/strong><\/td><td>-<\/td>/);
});

test('Urine Acetone recognises the imported typo and preserves method-specific results', () => {
  for (const name of ['Unine Acetone', 'Urine Acetone', 'Acetone (Urine)']) {
    const html = buildReportHtml(sampleReport({
      name,
      sample_type: 'Urine',
      parameters: [
        { parameter_name: 'Urine Acetone / Ketone Screen', value: 'Trace', normal_range: 'Negative - local assay', unit: '' },
        { parameter_name: 'Method / Reagent', value: 'Laboratory urine ketone strip' },
        { parameter_name: 'Interpretation / Comments', value: 'Repeat on fresh urine\nCorrelate with glucose' },
      ],
    }));
    assert.match(html, /<div class="test-title">URINE ACETONE<\/div>/);
    assert.match(html, /data-report-content="urine-acetone"/);
    assert.match(html, />Trace</);
    assert.match(html, /Negative - local assay/);
    assert.match(html, /Laboratory urine ketone strip/);
    assert.match(html, /Repeat on fresh urine<br \/>Correlate with glucose/);
    assert.match(html, /They do not measure beta-hydroxybutyrate/);
    assert.match(html, /does not establish a specific acetone concentration/);
    assert.deepEqual(getFallbackReportParameters({ name }).map(parameter => parameter.parameterName), [
      'Urine Acetone / Ketone Screen', 'Collection Date / Time', 'Method / Reagent',
      'Grade / Semiquantitative Category, if reported', 'Specimen Quality / Handling', 'Interpretation / Comments',
    ]);
  }
  const blank = buildReportHtml(sampleReport({ name: 'Unine Acetone', parameters: [] }));
  assert.match(blank, /<strong>Urine Acetone \/ Ketone Screen<\/strong><\/td><td>-<\/td>/);
  const quantitative = buildReportHtml(sampleReport({ name: 'Urine Acetone', parameters: [
    { parameter_name: 'Result', value: '0', unit: 'mg/L', normal_range: 'Laboratory-specific quantitative interval' },
  ] }));
  assert.match(quantitative, />0<\/td>/);
  assert.match(quantitative, /Laboratory-specific quantitative interval/);
  assert.match(quantitative, />mg\/L<\/td>/);
});

test('Lipoprotein remains target-neutral until the exact analyte is specified', () => {
  const html = buildReportHtml(sampleReport({
    name: 'Lipoprotein',
    sample_type: 'Serum',
    parameters: [
      { parameter_name: 'Lipoprotein Analyte / Fraction', value: 'Laboratory-defined lipoprotein fraction' },
      { parameter_name: 'Lipoprotein Result', value: '1.6' },
      { parameter_name: 'Unit', value: 'Laboratory unit' },
      { parameter_name: 'Laboratory Reference Interval / Decision Limit', value: 'Assay-specific interval' },
    ],
  }));
  assert.match(html, /<div class="test-title">LIPOPROTEIN<\/div>/);
  assert.match(html, /data-report-content="lipoprotein"/);
  assert.match(html, /does not identify a specific analyte/);
  assert.match(html, /Do not apply lipoprotein\(a\), ApoB, LDL, HDL, or lipid-profile decision limits/);
  assert.deepEqual(
    getFallbackReportParameters({ name: 'Lipoprotein' }).slice(0, 4).map(parameter => parameter.parameterName),
    ['Lipoprotein Analyte / Fraction', 'Lipoprotein Result', 'Unit', 'Laboratory Reference Interval / Decision Limit'],
  );
});

test('Lipoprotein Profile uses a standard lipid component layout', () => {
  const html = buildReportHtml(sampleReport({
    name: 'Lipoprotein Profile',
    sample_type: 'Serum',
    parameters: [
      { parameter_name: 'Total Cholesterol', value: '186', unit: 'mg/dL', normal_range: 'Laboratory interval' },
      { parameter_name: 'Triglycerides', value: '118', unit: 'mg/dL', normal_range: 'Laboratory interval' },
      { parameter_name: 'HDL Cholesterol', value: '48', unit: 'mg/dL', normal_range: 'Laboratory interval' },
      { parameter_name: 'LDL Cholesterol', value: '114', unit: 'mg/dL', normal_range: 'Laboratory interval' },
      { parameter_name: 'Fasting Status / Collection Details', value: 'Non-fasting sample' },
    ],
  }));
  assert.match(html, /<div class="test-title">LIPOPROTEIN PROFILE<\/div>/);
  assert.match(html, /data-report-content="lipoprotein-profile"/);
  assert.match(html, /Non-fasting sample/);
  assert.match(html, /standard lipoprotein profile includes total cholesterol/);
  assert.deepEqual(
    getFallbackReportParameters({ name: 'Lipoprotein Profile' }).slice(0, 8).map(parameter => parameter.parameterName),
    ['Total Cholesterol', 'Triglycerides', 'HDL Cholesterol', 'LDL Cholesterol', 'VLDL Cholesterol', 'Non-HDL Cholesterol', 'Total Cholesterol / HDL Ratio', 'LDL Cholesterol / HDL Ratio'],
  );
});

test('Lithium records dose timing for therapeutic drug monitoring', () => {
  const html = buildReportHtml(sampleReport({
    name: 'Lithium',
    sample_type: 'Serum',
    parameters: [
      { parameter_name: 'Lithium, Serum', value: '0.8', unit: 'mmol/L', normal_range: 'Laboratory therapeutic interval' },
      { parameter_name: 'Date / Time of Last Dose', value: '2026-10-07 20:00' },
      { parameter_name: 'Time Since Last Dose / Trough Status', value: '12-hour trough' },
    ],
  }));
  assert.match(html, /<div class="test-title">LITHIUM<\/div>/);
  assert.match(html, /data-report-content="lithium"/);
  assert.match(html, /12-hour trough/);
  assert.match(html, /commonly collected 8-12 hours after the last dose/);
  assert.deepEqual(
    getFallbackReportParameters({ name: 'Lithium' }).slice(0, 4).map(parameter => parameter.parameterName),
    ['Lithium, Serum', 'Date / Time of Last Dose', 'Date / Time of Collection', 'Time Since Last Dose / Trough Status'],
  );
});

test('Liver Biopsy uses a structured liver histopathology report', () => {
  const html = buildReportHtml(sampleReport({
    name: 'Liver Biopsy',
    code: 'PF058',
    sample_type: 'Tissue',
    parameters: [
      { parameter_name: 'Specimen / Site', value: 'Liver core biopsy' },
      { parameter_name: 'Fibrosis / Stage, if assessed', value: 'Stage reported by pathologist' },
      { parameter_name: 'Final Diagnosis', value: 'Final diagnosis text' },
    ],
  }));
  assert.match(html, /<div class="test-title">HISTOPATHOLOGY LIVER BIOPSY<\/div>/);
  assert.match(html, /data-report-content="liver-biopsy"/);
  assert.match(html, /SURGICAL PATHOLOGY REPORT &mdash; LIVER BIOPSY/);
  assert.match(html, /Core number, length, fragmentation/);
  assert.deepEqual(
    getFallbackReportParameters({ name: 'Liver Biopsy' }).slice(0, 5).map(parameter => parameter.parameterName),
    ['Clinical History / Indication', 'Specimen / Site', 'Procedure / Biopsy Type', 'Fixative / Specimen Received In', 'Gross Description'],
  );
});

test('Liver Cancer Monitor Profile keeps tumor-marker monitoring context', () => {
  const html = buildReportHtml(sampleReport({
    name: 'Liver Cancer Monitor Profile',
    sample_type: 'Serum',
    parameters: [
      { parameter_name: 'Alpha-Fetoprotein (AFP)', value: '12.4', unit: 'ng/mL', normal_range: 'Laboratory interval' },
      { parameter_name: 'AFP-L3%, if performed', value: '8.0', unit: '%' },
      { parameter_name: 'Monitoring Context / Prior Result, if provided', value: 'Serial follow-up' },
    ],
  }));
  assert.match(html, /<div class="test-title">LIVER CANCER MONITOR PROFILE<\/div>/);
  assert.match(html, /data-report-content="liver-cancer-monitor-profile"/);
  assert.match(html, /Serial follow-up/);
  assert.match(html, /abnormal AFP result is not diagnostic by itself/);
  assert.deepEqual(
    getFallbackReportParameters({ name: 'Liver Cancer Monitor Profile' }).slice(0, 3).map(parameter => parameter.parameterName),
    ['Alpha-Fetoprotein (AFP)', 'AFP-L3%, if performed', 'Des-gamma-carboxy Prothrombin (DCP / PIVKA-II), if performed'],
  );
});

test('Lupus Anticoagulant uses a method-aware coagulation evaluation layout', () => {
  const html = buildReportHtml(sampleReport({
    name: 'Lupus Anticoagulant',
    sample_type: 'Citrated Plasma',
    parameters: [
      { parameter_name: 'dRVVT Screen Ratio', value: '1.10', normal_range: 'Laboratory decision limit' },
      { parameter_name: 'Final Lupus Anticoagulant Interpretation', value: 'No laboratory evidence detected by this method' },
    ],
  }));
  assert.match(html, /<div class="test-title">LUPUS ANTICOAGULANT<\/div>/);
  assert.match(html, /data-report-content="lupus-anticoagulant"/);
  assert.match(html, /No single coagulation assay can identify or exclude all lupus anticoagulants/);
  assert.match(html, /No laboratory evidence detected by this method/);
  assert.deepEqual(
    getFallbackReportParameters({ name: 'Lupus Anticoagulant' }).slice(0, 4).map(parameter => parameter.parameterName),
    ['aPTT Screen', 'dRVVT Screen Ratio', 'dRVVT Mix Ratio, if performed', 'dRVVT Confirm Ratio, if performed'],
  );
});

test('MDMA Screen distinguishes screening from confirmation', () => {
  const html = buildReportHtml(sampleReport({
    name: 'MDMA Screen',
    code: 'PF064',
    sample_type: 'Urine',
    parameters: [
      { parameter_name: 'MDMA Screen Result', value: 'Not Detected' },
      { parameter_name: 'Screening Cutoff / Decision Limit', value: 'Laboratory cutoff', unit: 'ng/mL' },
      { parameter_name: 'Screening Method', value: 'Validated screen' },
    ],
  }));
  assert.match(html, /<div class="test-title">MDMA SCREEN<\/div>/);
  assert.match(html, /data-report-content="mdma-screen"/);
  assert.match(html, /A screening result is presumptive/);
  assert.match(html, /MDMA is metabolized to MDA/);
  assert.deepEqual(
    getFallbackReportParameters({ name: 'MDMA Screen' }).slice(0, 4).map(parameter => parameter.parameterName),
    ['MDMA Screen Result', 'Screening Cutoff / Decision Limit', 'Specimen Validity / Collection Details', 'Screening Method'],
  );
});

test('Magnesium (Urine) captures timed-collection context', () => {
  const html = buildReportHtml(sampleReport({
    name: 'Magnesium (Urine)',
    sample_type: '24-hour urine',
    parameters: [
      { parameter_name: 'Magnesium, Urine', value: '86', unit: 'mg/24 hours', normal_range: 'Laboratory interval' },
      { parameter_name: 'Collection Type / Duration', value: '24 hours' },
      { parameter_name: 'Total Urine Volume', value: '1650', unit: 'mL' },
    ],
  }));
  assert.match(html, /<div class="test-title">MAGNESIUM, URINE<\/div>/);
  assert.match(html, /data-report-content="urine-magnesium"/);
  assert.match(html, /Document duration and volume for timed collections/);
  assert.match(html, /Intravenous magnesium administration/);
  assert.deepEqual(
    getFallbackReportParameters({ name: 'Magnesium (Urine)' }).slice(0, 4).map(parameter => parameter.parameterName),
    ['Magnesium, Urine', 'Collection Type / Duration', 'Total Urine Volume', 'Urine Magnesium Concentration, if reported'],
  );
});

test('Malaria Pan / Pf Antigen distinguishes targets and microscopy confirmation', () => {
  const html = buildReportHtml(sampleReport({
    name: 'Malaria (Pan / Pf ) Antigen',
    sample_type: 'Whole Blood',
    parameters: [
      { parameter_name: 'P. falciparum (Pf) Antigen', value: 'Not Detected' },
      { parameter_name: 'Pan-malarial Antigen', value: 'Not Detected' },
      { parameter_name: 'Test Control / Validity', value: 'Valid' },
    ],
  }));
  assert.match(html, /<div class="test-title">MALARIA ANTIGEN - PAN \/ PF<\/div>/);
  assert.match(html, /data-report-content="malaria-pan-pf-antigen"/);
  assert.match(html, /Rapid-test results, whether positive or negative/);
  assert.match(html, /thick and thin blood-film microscopy/);
  assert.deepEqual(
    getFallbackReportParameters({ name: 'Malaria (Pan / Pf ) Antigen' }).slice(0, 4).map(parameter => parameter.parameterName),
    ['P. falciparum (Pf) Antigen', 'Pan-malarial Antigen', 'Test Control / Validity', 'Rapid Test Kit / Method'],
  );
});

test('Optimal IT Antigen distinguishes Pf and pan-pLDH findings with kit-specific interpretation', () => {
  const html = buildReportHtml(sampleReport({
    name: 'Optimal IT Antigen',
    sample_type: 'Whole Blood',
    parameters: [
      { parameter_name: 'P. falciparum-specific pLDH Result', value: 'Not Detected' },
      { parameter_name: 'Pan-Plasmodium pLDH Result', value: 'Not Detected' },
      { parameter_name: 'Test Control / Validity', value: 'Valid' },
    ],
  }));
  assert.match(html, /<div class="test-title">OPTIMAL-IT MALARIA ANTIGEN<\/div>/);
  assert.match(html, /data-report-content="optimal-it-antigen"/);
  assert.match(html, /pLDH-based malaria rapid diagnostic test/);
  assert.match(html, /thick and thin blood-film microscopy/);
  assert.deepEqual(
    getFallbackReportParameters({ name: 'Optimal IT Antigen' }).slice(0, 4).map(parameter => parameter.parameterName),
    ['P. falciparum-specific pLDH Result', 'Pan-Plasmodium pLDH Result', 'Test Control / Validity', 'OptiMAL-IT Result Interpretation'],
  );
});

test('Osmotic fragility Test records method conditions and avoids a stand-alone diagnosis', () => {
  const html = buildReportHtml(sampleReport({
    name: 'Osmotic fragility Test',
    sample_type: 'EDTA Whole Blood',
    parameters: [
      { parameter_name: 'Unincubated Osmotic Fragility / Hemolysis', value: 'Laboratory interpretation recorded' },
      { parameter_name: 'Patient / Shipping Control Status', value: 'Satisfactory' },
      { parameter_name: 'Method / Incubation Conditions', value: 'Validated osmotic lysis method; incubated study performed' },
    ],
  }));
  assert.match(html, /<div class="test-title">OSMOTIC FRAGILITY TEST<\/div>/);
  assert.match(html, /data-report-content="osmotic-fragility"/);
  assert.match(html, /does not establish hereditary spherocytosis or another diagnosis/);
  assert.match(html, /Satisfactory/);
  assert.deepEqual(
    getFallbackReportParameters({ name: 'Osmotic fragility Test' }).slice(0, 4).map(parameter => parameter.parameterName),
    ['Specimen / Anticoagulant', 'Unincubated Osmotic Fragility / Hemolysis', 'Incubated Osmotic Fragility / Hemolysis', 'Sodium Chloride Concentration(s) / Hemolysis Results'],
  );
});

test('Ovarian Function Profile records cycle context without making a stand-alone diagnosis', () => {
  const html = buildReportHtml(sampleReport({
    name: 'Ovarian Function Profile',
    sample_type: 'Serum',
    parameters: [
      { parameter_name: 'Follicle Stimulating Hormone (FSH), Serum', value: '6.8', unit: 'mIU/mL', normal_range: 'Laboratory interval' },
      { parameter_name: 'Luteinizing Hormone (LH), Serum', value: '7.1', unit: 'mIU/mL', normal_range: 'Laboratory interval' },
      { parameter_name: 'Anti-Mullerian Hormone (AMH), Serum, if ordered', value: '2.1', unit: 'ng/mL', normal_range: 'Laboratory interval' },
      { parameter_name: 'Menstrual Cycle Day / Physiologic State', value: 'Cycle day 3' },
    ],
  }));
  assert.match(html, /<div class="test-title">OVARIAN FUNCTION PROFILE<\/div>/);
  assert.match(html, /data-report-content="ovarian-function-profile"/);
  assert.match(html, /Cycle day 3/);
  assert.match(html, /does not diagnose a specific cause of menstrual irregularity, infertility, or ovarian dysfunction by itself/);
  assert.deepEqual(
    getFallbackReportParameters({ name: 'Ovarian Function Profile' }).slice(0, 5).map(parameter => parameter.parameterName),
    ['Follicle Stimulating Hormone (FSH), Serum', 'Luteinizing Hormone (LH), Serum', 'Estradiol (E2), Serum', 'Anti-Mullerian Hormone (AMH), Serum, if ordered', 'Progesterone, Serum, if ordered'],
  );
});

test('oxygen services, endocrine, ANCA, PSA, PTH, and PUO profiles use dedicated report formats', () => {
  const cases = [
    ['Oxygen for each Day(after 1st 3 Days)', 'OXYGEN THERAPY - DAILY SERVICE RECORD', 'oxygen-daily', 'Oxygen delivery interface'],
    ['Oxygen( 3 Days)', 'OXYGEN THERAPY - THREE-DAY SERVICE RECORD', 'oxygen-three-days', 'Total duration of oxygen administration'],
    ['P ANCA (Anti - PR3)', 'P-ANCA / ANTI-PR3 ANTIBODY', 'panca-pr3', 'PR3-ANCA antibody'],
    ['PRA (Plasma Renin Activity)', 'PLASMA RENIN ACTIVITY (PRA)', 'plasma-renin-activity', 'Patient posture / collection conditions'],
    ['PSA (Prostate Specific Antigen)', 'PROSTATE SPECIFIC ANTIGEN (PSA), TOTAL', 'psa', 'Prostate specific antigen (PSA), total'],
    ['PTH (Para Thyroid Hormone)', 'PARATHYROID HORMONE (PTH)', 'pth', 'Calcium, concurrent, if available'],
    ['PTH - (Intact Molecule)', 'PARATHYROID HORMONE (PTH) - INTACT MOLECULE', 'intact-pth', 'Parathyroid hormone (PTH), intact'],
    ['PUO - Work Up Profile', 'PUO - WORK UP PROFILE', 'puo-workup', 'Complete blood count (CBC), if performed'],
    ['PUS AFB Stain', 'PUS / ASPIRATE - AFB STAIN', 'pus-afb-stain', 'AFB smear microscopy result'],
    ['PUS Culture & Sensitivity', 'PUS / ASPIRATE - CULTURE &amp; SENSITIVITY', 'pus-culture-sensitivity', 'Antimicrobial susceptibility result'],
    ['PUS Gram Stain', 'PUS / ASPIRATE - GRAM STAIN', 'pus-gram-stain', 'Pus cells / polymorphs'],
    ['Peritoneal Fluid Chloride', 'PERITONEAL (ASCITIC) FLUID CHLORIDE', 'peritoneal-fluid-chloride', 'Concurrent serum chloride, if available'],
    ['Peritoneal Fluid Gram Stain', 'PERITONEAL (ASCITIC) FLUID - GRAM STAIN', 'peritoneal-fluid-gram-stain', 'Polymorphs / inflammatory cells'],
    ['Peritoneal Fluid LDH', 'PERITONEAL (ASCITIC) FLUID LDH', 'peritoneal-fluid-ldh', 'Fluid / serum LDH ratio, if calculated'],
    ['Peritoneal Fluid Protein', 'PERITONEAL (ASCITIC) FLUID TOTAL PROTEIN', 'peritoneal-fluid-protein', 'Fluid / serum protein ratio, if calculated'],
    ['Peritoneal Fluid Sugar', 'PERITONEAL (ASCITIC) FLUID GLUCOSE (SUGAR)', 'peritoneal-fluid-sugar', 'Fluid / serum glucose ratio, if calculated'],
    ['Peritoneal Fluid for Specific Gravity', 'PERITONEAL (ASCITIC) FLUID SPECIFIC GRAVITY', 'peritoneal-fluid-specific-gravity', 'Measurement conditions / temperature, if applicable'],
    ['Pertussis', 'PERTUSSIS / BORDETELLA PERTUSSIS', 'pertussis', 'Bordetella pertussis result'],
    ['Phenytoin / Dilantin', 'PHENYTOIN (DILANTIN) - THERAPEUTIC DRUG MONITORING', 'phenytoin', 'Collection time relative to last dose'],
    ['Phospholipid', 'PHOSPHOLIPIDS, TOTAL', 'phospholipid', 'Total phospholipids'],
    ['Phospholipid Antibody IgG (APLA - G)', 'PHOSPHOLIPID (CARDIOLIPIN) ANTIBODY, IgG', 'phospholipid-antibody-igg', 'Phospholipid (cardiolipin) antibody, IgG'],
    ['Phospholipid Antibody IgM (APLA - M)', 'PHOSPHOLIPID (CARDIOLIPIN) ANTIBODY, IgM', 'phospholipid-antibody-igm', 'Phospholipid (cardiolipin) antibody, IgM'],
    ['Phosphorus (24 hrs. urine)', 'PHOSPHORUS, 24-HOUR URINE', 'urine-phosphorus-24-hour', 'Total 24-hour urine volume'],
    ['Plasma 02contents (P02)', 'OXYGEN CONTENT (ctO2)', 'oxygen-content', 'Specimen source / type'],
    ['Pleural Fluid Specific Gravity', 'PLEURAL FLUID SPECIFIC GRAVITY', 'pleural-fluid-specific-gravity', 'Associated pleural / serum studies, if available'],
    ['Pleural Fluid for Protein', 'PLEURAL FLUID TOTAL PROTEIN', 'pleural-fluid-protein', 'Pleural fluid / serum protein ratio, if calculated'],
    ['Pleural Fluid for Sugar', 'PLEURAL FLUID GLUCOSE (SUGAR)', 'pleural-fluid-sugar', 'Pleural fluid / serum glucose ratio, if calculated'],
    ['Post Coital Test', 'POST-COITAL TEST (PCT)', 'post-coital-test', 'Sperm seen on microscopy'],
    ['Potassium(24 hour Urine)', 'POTASSIUM, 24-HOUR URINE', 'urine-potassium-24-hour', 'Total 24-hour urine volume'],
    ['Potassium(Randam)', 'POTASSIUM, RANDOM URINE', 'urine-potassium-random', 'Potassium / creatinine ratio, if calculated'],
    ['Pre - Employment Check Up', 'PRE-EMPLOYMENT LABORATORY CHECK-UP', 'pre-employment-check-up', 'Authorized medical fitness opinion, if issued separately'],
    ['Precancer&EarlyDetectionoforal', 'ORAL POTENTIALLY MALIGNANT DISORDER / EARLY-DETECTION ASSESSMENT', 'oral-precancer-early-detection', 'Authorized clinical / pathology diagnosis, if issued separately'],
    ['Pregnancy Elisa Test', 'PREGNANCY TEST — hCG (ELISA)', 'pregnancy-elisa-test', 'hCG qualitative result'],
    ['RBC / WBC Morphology', 'PERIPHERAL BLOOD FILM — RBC / WBC MORPHOLOGY', 'rbc-wbc-morphology', 'White cell morphology'],
    ['RBC Fragility Test', 'OSMOTIC FRAGILITY TEST', 'osmotic-fragility', 'Unincubated osmotic fragility / hemolysis'],
    ['Rectal Swab Gram Stain', 'RECTAL SWAB — GRAM STAIN', 'rectal-swab-gram-stain', 'Direct Gram stain interpretation'],
    ['Renal (Kidney) Profile', 'RENAL (KIDNEY) PROFILE', 'renal-kidney-profile', 'Urine albumin-creatinine ratio (ACR), if ordered'],
    ['Respiratory Syncytial Virus (RSV)', 'RESPIRATORY SYNCYTIAL VIRUS (RSV)', 'respiratory-syncytial-virus', 'Internal / procedural control'],
    ['Review for Histology Slide', 'HISTOLOGY SLIDE REVIEW', 'histology-slide-review', 'Concordance with original report'],
    ['Rheumatic Fever Profile', 'RHEUMATIC FEVER PROFILE', 'rheumatic-fever-profile', 'Antistreptolysin O (ASO) titer, if ordered'],
    ['Rheumatoid Profile', 'RHEUMATOID PROFILE', 'rheumatoid-profile', 'Anti-cyclic citrullinated peptide (anti-CCP) antibody'],
    ['Rubella IgG', 'RUBELLA VIRUS ANTIBODY, IgG', 'rubella-igg', 'Rubella IgG antibody index / concentration, if reported'],
    ['SHBG (Sex Hormone Binding Globulin)', 'SEX HORMONE BINDING GLOBULIN (SHBG)', 'shbg', 'Calculated free testosterone / free androgen index, if calculated'],
    ['Semen Culture', 'SEMEN CULTURE', 'semen-culture', 'Mixed growth / contamination assessment'],
    ['Seminal Fluid for Culture & Sensitivity', 'SEMINAL FLUID - CULTURE & SENSITIVITY', 'seminal-fluid-culture-sensitivity', 'Antimicrobial susceptibility'],
    ['Sputum Culture & Sensitivity', 'SPUTUM - CULTURE & SENSITIVITY', 'sputum-culture-sensitivity', 'Mixed upper respiratory flora / contamination assessment'],
    ['Sputum Culture (Non AFB)', 'SPUTUM CULTURE (NON-AFB)', 'sputum-culture-non-afb', 'Routine bacterial culture result'],
    ['Sputum Gram Stain', 'SPUTUM - GRAM STAIN', 'sputum-gram-stain', 'Predominant bacterial morphotype, if present'],
    ['Sputum RE (Leishman Stain + Gram)', 'SPUTUM RESPIRATORY EXAMINATION (LEISHMAN STAIN + GRAM STAIN)', 'sputum-re-leishman-gram', 'Leishman stain method / cellular assessment'],
    ['Stone Analysis (Urinary / Gall Bladder)', 'STONE ANALYSIS (URINARY / GALL BLADDER)', 'stone-analysis', 'Primary stone component'],
    ['Stool Culture', 'STOOL CULTURE', 'stool-culture', 'Routine enteric culture result'],
    ['Stool OBT + RE (3 Days)', 'STOOL OBT + ROUTINE EXAMINATION (THREE DAYS)', 'stool-obt-re-three-days', 'Day 3 fecal occult blood result'],
    ['Stool OPC', 'STOOL OVA, CYSTS & PARASITES (OPC)', 'stool-opc', 'Protozoa (cysts), if seen'],
    ['Stool RE + Red Sub + pH', 'STOOL ROUTINE EXAMINATION + REDUCING SUBSTANCES + pH', 'stool-re-red-sub-ph', 'Reducing substances'],
    ['Swab Culture & Sensitivity for Any Site Swab', 'SWAB CULTURE & SENSITIVITY (ANY SITE)', 'any-site-swab-culture-sensitivity', 'Swab collection site / anatomical source'],
    ['Synovial Fluid for Calcium', 'SYNOVIAL FLUID CALCIUM', 'synovial-fluid-calcium', 'Calcium, synovial fluid'],
    ['Synovial Fluid for Crystals', 'SYNOVIAL FLUID CRYSTAL EXAMINATION', 'synovial-fluid-crystals', 'Crystal morphology / birefringence, if assessed'],
    ['Synovial Fluid for Uric Acid', 'SYNOVIAL FLUID URIC ACID', 'synovial-fluid-uric-acid', 'Uric acid, synovial fluid'],
    ['T3 & US-TSH', 'T3 & ULTRA-SENSITIVE TSH', 't3-us-tsh', 'Ultra-sensitive TSH, serum'],
    ['T4 & US-TSH', 'T4 & ULTRA-SENSITIVE TSH', 't4-us-tsh', 'Ultra-sensitive TSH, serum'],
    ['TB IgA', 'TUBERCULOSIS (TB) IgA ANTIBODY', 'tb-iga', 'TB IgA antibody result'],
    ['TB IgM', 'TUBERCULOSIS (TB) IgM ANTIBODY', 'tb-igm', 'TB IgM antibody result'],
    ['TBG (Thyroxine Binding Globulin)', 'THYROXINE-BINDING GLOBULIN (TBG)', 'thyroxine-binding-globulin', 'Thyroxine-binding globulin (TBG), serum'],
    ['TC & DC', 'TOTAL & DIFFERENTIAL LEUKOCYTE COUNT (TC & DC)', 'total-differential-count', 'Total leukocyte count (TLC / TC)'],
    ['TC, DC & ESR', 'TOTAL & DIFFERENTIAL LEUKOCYTE COUNT + ESR', 'total-differential-count-esr', 'Erythrocyte sedimentation rate (ESR)'],
    ['TC, DC & MP', 'TOTAL & DIFFERENTIAL LEUKOCYTE COUNT + MALARIA PARASITE', 'total-differential-count-malaria-parasite', 'Malaria parasite on peripheral smear'],
    ['Taenia Echinococcus', 'TAENIA / ECHINOCOCCUS SEROLOGY', 'taenia-echinococcus-serology', 'Echinococcus antibody result'],
    ['Testicular Cancer Monitor Profile', 'TESTICULAR CANCER MONITOR PROFILE', 'testicular-cancer-monitor-profile', 'Alpha-fetoprotein (AFP), serum'],
    ['Testicular Function Profile', 'TESTICULAR FUNCTION PROFILE', 'testicular-function-profile', 'Total testosterone, serum'],
    ['Thalassemia Profile', 'THALASSEMIA PROFILE', 'thalassemia-profile', 'Haemoglobin A2 (HbA2)'],
    ['Throat Swab Culture', 'THROAT SWAB CULTURE', 'throat-swab-culture', 'Group A Streptococcus (Streptococcus pyogenes), if isolated'],
    ['Throat Swab Culture & Sensitivity', 'THROAT SWAB CULTURE & SENSITIVITY', 'throat-swab-culture-sensitivity', 'Antimicrobial susceptibility result(s), if performed'],
    ['Seminal Fluid for Gram Stain', 'SEMINAL FLUID - GRAM STAIN', 'seminal-fluid-gram-stain', 'Inflammatory cells / polymorphs'],
    ['Seminal Germ Cell Study', 'SEMINAL GERM CELL STUDY', 'seminal-germ-cell-study', 'Immature germ cells identified'],
    ['Serology/Viral Marker', 'SEROLOGY / VIRAL MARKER PROFILE', 'serology-viral-marker', 'Hepatitis B surface antigen (HBsAg), if ordered'],
    ['Sex Chromatin Study', 'SEX CHROMATIN STUDY', 'sex-chromatin-study', 'Barr-body positive nuclei (%)'],
    ['Soluble Liver Antigen (SLA) Antibody', 'SOLUBLE LIVER ANTIGEN (SLA) ANTIBODY', 'soluble-liver-antigen-antibody', 'Anti-soluble liver antigen (SLA) antibody result'],
    ['Spirometry', 'SPIROMETRY', 'spirometry', 'Pre-bronchodilator FEV1'],
    ['Semen for Fructose', 'SEMEN FRUCTOSE', 'semen-fructose', 'Seminal fructose result'],
    ['Seminal Fluid for AFB Stain', 'SEMINAL FLUID — AFB STAIN', 'seminal-fluid-afb-stain', 'AFB smear grade / quantitation, if applicable'],
    ['Pre - Operative Profile', 'PRE-OPERATIVE LABORATORY PROFILE', 'pre-operative-profile', 'Anaesthesia / surgical clearance, if issued separately'],
    ['Pre Cath Profile', 'PRE-CATHETERIZATION LABORATORY PROFILE', 'pre-cath-profile', 'Cardiology / procedural clearance, if issued separately'],
    ['Pre-Marriage Profile', 'PRE-MARITAL LABORATORY SCREENING (REQUESTED TESTS)', 'pre-marriage-profile', 'Medical / genetic counselling or certification, if issued separately'],
  ];
  for (const [name, title, content, expectedField] of cases) {
    const html = buildReportHtml(sampleReport({ name, parameters: [{ parameter_name: 'Interpretation / Comments', value: 'Verified' }] }));
    assert.match(html, new RegExp(`<div class="test-title">${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}<\\/div>`));
    assert.match(html, new RegExp(`data-report-content="${content}"`));
    assert.match(html, new RegExp(expectedField.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.ok(getFallbackReportParameters({ name }).length > 0, `${name} should have fallback parameters`);
  }
});

test('Malaria Profile joins rapid antigen and blood-film reporting', () => {
  const html = buildReportHtml(sampleReport({
    name: 'Malaria Profile',
    sample_type: 'Whole Blood',
    parameters: [
      { parameter_name: 'Malaria Rapid Antigen Result, if performed', value: 'Not Detected' },
      { parameter_name: 'Thick Blood Film / Parasite Detection', value: 'No parasites seen' },
      { parameter_name: 'Thin Blood Film / Species Identification', value: 'No Plasmodium species identified' },
    ],
  }));
  assert.match(html, /<div class="test-title">MALARIA PROFILE<\/div>/);
  assert.match(html, /data-report-content="malaria-profile"/);
  assert.match(html, /Thick and thin blood films are complementary/);
  assert.match(html, /does not independently determine species, parasite density/);
  assert.deepEqual(
    getFallbackReportParameters({ name: 'Malaria Profile' }).slice(0, 4).map(parameter => parameter.parameterName),
    ['Malaria Rapid Antigen Result, if performed', 'P. falciparum (Pf) Antigen, if performed', 'Pan-malarial Antigen, if performed', 'Thick Blood Film / Parasite Detection'],
  );
});

test('Male Infertility Profile combines hormone and semen-analysis context', () => {
  const html = buildReportHtml(sampleReport({
    name: 'Male Infertility Profile',
    sample_type: 'Serum',
    parameters: [
      { parameter_name: 'Follicle Stimulating Hormone (FSH)', value: '5.4', unit: 'mIU/mL', normal_range: 'Laboratory interval' },
      { parameter_name: 'Luteinizing Hormone (LH)', value: '4.1', unit: 'mIU/mL', normal_range: 'Laboratory interval' },
      { parameter_name: 'Total Testosterone', value: '420', unit: 'ng/dL', normal_range: 'Laboratory interval' },
      { parameter_name: 'Semen Analysis Correlation, if available', value: 'Review with semen analysis' },
    ],
  }));
  assert.match(html, /<div class="test-title">MALE INFERTILITY PROFILE<\/div>/);
  assert.match(html, /data-report-content="male-infertility-profile"/);
  assert.match(html, /Review with semen analysis/);
  assert.match(html, /Semen analysis remains a separate, standardized laboratory assessment/);
  assert.deepEqual(
    getFallbackReportParameters({ name: 'Male Infertility Profile' }).slice(0, 4).map(parameter => parameter.parameterName),
    ['Follicle Stimulating Hormone (FSH)', 'Luteinizing Hormone (LH)', 'Total Testosterone', 'Prolactin'],
  );
});

test('Manganese keeps matrix and exposure context with the result', () => {
  const html = buildReportHtml(sampleReport({
    name: 'Manganese',
    code: 'PF021',
    sample_type: 'Whole Blood',
    parameters: [
      { parameter_name: 'Manganese', value: '10.2', unit: 'ng/mL', normal_range: 'Laboratory interval' },
      { parameter_name: 'Exposure History / Clinical Context, if provided', value: 'Occupational exposure history provided' },
    ],
  }));
  assert.match(html, /<div class="test-title">MANGANESE<\/div>/);
  assert.match(html, /data-report-content="manganese"/);
  assert.match(html, /Occupational exposure history provided/);
  assert.match(html, /Whole blood, serum, plasma, and red-cell results are not interchangeable/);
  assert.deepEqual(
    getFallbackReportParameters({ name: 'Manganese' }).slice(0, 4).map(parameter => parameter.parameterName),
    ['Manganese', 'Specimen / Matrix', 'Collection / Trace-Element Precautions', 'Exposure History / Clinical Context, if provided'],
  );
});

test('Measles / Rubeola Antibody IgG reports immunity evidence without diagnosing acute disease', () => {
  const html = buildReportHtml(sampleReport({
    name: 'Measles / Rubeola Antibody IgG',
    sample_type: 'Serum',
    parameters: [
      { parameter_name: 'Measles (Rubeola) IgG Antibody Result', value: 'Positive' },
      { parameter_name: 'Measles IgG Antibody Index / Titre, if reported', value: '1.4' },
    ],
  }));
  assert.match(html, /<div class="test-title">MEASLES \(RUBEOLA\) ANTIBODY IgG<\/div>/);
  assert.match(html, /data-report-content="measles-rubeola-igg"/);
  assert.match(html, /Qualitative evidence of prior immune response/);
  assert.match(html, /does not diagnose acute measles infection/);
  assert.deepEqual(
    getFallbackReportParameters({ name: 'Measles / Rubeola Antibody IgG' }).slice(0, 4).map(parameter => parameter.parameterName),
    ['Measles (Rubeola) IgG Antibody Result', 'Measles IgG Antibody Index / Titre, if reported', 'Specimen Collection Date / Clinical Context, if provided', 'Vaccination / Exposure History, if provided'],
  );
});

test('Measles / Rubeola Antibody IgM records acute-phase timing and limitations', () => {
  const html = buildReportHtml(sampleReport({
    name: 'Measles / Rubeola Antibody IgM',
    sample_type: 'Serum',
    parameters: [
      { parameter_name: 'Measles (Rubeola) IgM Antibody Result', value: 'Positive' },
      { parameter_name: 'Rash / Symptom Onset Date, if provided', value: '2026-10-07' },
      { parameter_name: 'Specimen Collection Date', value: '2026-10-10' },
    ],
  }));
  assert.match(html, /<div class="test-title">MEASLES \(RUBEOLA\) ANTIBODY IgM<\/div>/);
  assert.match(html, /data-report-content="measles-rubeola-igm"/);
  assert.match(html, /collection timing is essential/);
  assert.match(html, /must not be used to diagnose measles/);
  assert.deepEqual(
    getFallbackReportParameters({ name: 'Measles / Rubeola Antibody IgM' }).slice(0, 4).map(parameter => parameter.parameterName),
    ['Measles (Rubeola) IgM Antibody Result', 'Rash / Symptom Onset Date, if provided', 'Specimen Collection Date', 'Measles IgG Result, if available'],
  );
});

test('Menstrual Blood for TB PCR records molecular validity and diagnostic limitations', () => {
  const html = buildReportHtml(sampleReport({
    name: 'Menstrual Blood for TB PCR',
    sample_type: 'Menstrual Blood',
    parameters: [
      { parameter_name: 'MTB Complex PCR Result', value: 'Not Detected' },
      { parameter_name: 'Internal Control / Inhibition Status', value: 'Valid; no inhibition detected' },
    ],
  }));
  assert.match(html, /<div class="test-title">MENSTRUAL BLOOD FOR TB PCR<\/div>/);
  assert.match(html, /data-report-content="menstrual-blood-tb-pcr"/);
  assert.match(html, /negative result does not exclude genital\/extrapulmonary TB/);
  assert.match(html, /Valid; no inhibition detected/);
  assert.deepEqual(
    getFallbackReportParameters({ name: 'Menstrual Blood for TB PCR' }).slice(0, 4).map(parameter => parameter.parameterName),
    ['MTB Complex PCR Result', 'Rifampicin Resistance Result, if applicable', 'Specimen Adequacy / Processing Status', 'Internal Control / Inhibition Status'],
  );
});

test('Micro Filaria records microscopy observations without overstating a negative smear', () => {
  const html = buildReportHtml(sampleReport({
    name: 'Micro Filaria',
    sample_type: 'Peripheral Blood',
    parameters: [
      { parameter_name: 'Microfilaria Detection Result', value: 'Not seen' },
      { parameter_name: 'Specimen / Blood Collection Time', value: '22:30 h' },
      { parameter_name: 'Preparation / Stain / Method', value: 'Giemsa-stained thick and thin blood films' },
    ],
  }));
  assert.match(html, /<div class="test-title">MICRO FILARIA<\/div>/);
  assert.match(html, /data-report-content="microfilaria"/);
  assert.match(html, /Microfilariae may show species-dependent periodicity/);
  assert.match(html, /22:30 h/);
  assert.deepEqual(
    getFallbackReportParameters({ name: 'Micro Filaria' }).slice(0, 4).map(parameter => parameter.parameterName),
    ['Microfilaria Detection Result', 'Species / Morphologic Identification, if possible', 'Microfilarial Density / Quantitation, if performed', 'Specimen / Blood Collection Time'],
  );
});

test('Microalbumin (Urine) keeps the measured concentration distinct from UACR', () => {
  const html = buildReportHtml(sampleReport({
    name: 'Microalbumin (Urine)',
    sample_type: 'Spot Urine',
    parameters: [
      { parameter_name: 'Urine Albumin (Microalbumin)', value: '18', unit: 'mg/L' },
      { parameter_name: 'Urine Albumin-Creatinine Ratio (UACR), if requested', value: '21', unit: 'mg/g' },
      { parameter_name: 'Method / Analyzer', value: 'Immunoturbidimetric method' },
    ],
  }));
  assert.match(html, /<div class="test-title">MICROALBUMIN \(URINE\)<\/div>/);
  assert.match(html, /data-report-content="microalbumin-urine"/);
  assert.match(html, /report a ratio only when it has been requested or calculated by the laboratory/);
  assert.match(html, /Immunoturbidimetric method/);
  assert.deepEqual(
    getFallbackReportParameters({ name: 'Microalbumin (Urine)' }).slice(0, 4).map(parameter => parameter.parameterName),
    ['Urine Albumin (Microalbumin)', 'Specimen / Collection Type', 'Urine Creatinine, if measured', 'Urine Albumin-Creatinine Ratio (UACR), if requested'],
  );
});

test('Nasal Swab Gram Stain reports direct microscopy without inventing culture results', () => {
  const html = buildReportHtml(sampleReport({
    name: 'Nasal Swab Gram Stain',
    sample_type: 'Nasal Swab',
    parameters: [
      { parameter_name: 'Inflammatory Cells / PMNs', value: 'Few' },
      { parameter_name: 'Gram-Positive Organisms / Morphology, if seen', value: 'Few Gram-positive cocci in clusters' },
      { parameter_name: 'Overall Gram Stain Findings', value: 'Mixed nasal flora morphology observed' },
    ],
  }));
  assert.match(html, /<div class="test-title">NASAL SWAB - GRAM STAIN<\/div>/);
  assert.match(html, /data-report-content="nasal-swab-gram-stain"/);
  assert.match(html, /do not provide definitive species identification or antimicrobial susceptibility/);
  assert.match(html, /Few Gram-positive cocci in clusters/);
  assert.deepEqual(
    getFallbackReportParameters({ name: 'Nasal Swab Gram Stain' }).slice(0, 5).map(parameter => parameter.parameterName),
    ['Specimen / Collection Site', 'Smear Method / Preparation', 'Inflammatory Cells / PMNs', 'Epithelial Cells / Specimen Quality', 'Gram-Positive Organisms / Morphology, if seen'],
  );
});

test('Oncology Profile reports only ordered markers without presenting them as a cancer diagnosis', () => {
  const html = buildReportHtml(sampleReport({
    name: 'Oncology Profile',
    sample_type: 'Serum',
    parameters: [
      { parameter_name: 'Carcinoembryonic Antigen (CEA), if ordered', value: '2.4', unit: 'ng/mL', normal_range: 'Laboratory interval' },
      { parameter_name: 'CA 19-9, if ordered', value: '16', unit: 'U/mL', normal_range: 'Laboratory interval' },
      { parameter_name: 'Clinical Details / Monitoring Context, if provided', value: 'Clinician-directed serial monitoring' },
    ],
  }));
  assert.match(html, /<div class="test-title">ONCOLOGY PROFILE<\/div>/);
  assert.match(html, /data-report-content="oncology-profile"/);
  assert.match(html, /Carcinoembryonic Antigen \(CEA\), if ordered/);
  assert.match(html, /does not diagnose, exclude, or screen for cancer/);
  assert.match(html, /Clinician-directed serial monitoring/);
  assert.deepEqual(
    getFallbackReportParameters({ name: 'Oncology Profile' }).slice(0, 4).map(parameter => parameter.parameterName),
    ['Carcinoembryonic Antigen (CEA), if ordered', 'Alpha-Fetoprotein (AFP), if ordered', 'CA 19-9, if ordered', 'CA 125, if ordered'],
  );
});

test('Leptospira Antibody IgG reports a single antibody result without asserting acute infection', () => {
  const html = buildReportHtml(sampleReport({
    name: 'Leptospira Antibody IgG',
    sample_type: 'Serum',
    parameters: [
      { parameter_name: 'Leptospira Antibody IgG, Serum', value: 'Reactive', normal_range: 'Negative / non-reactive (assay-specific)' },
      { parameter_name: 'Antibody Index / Titre, if applicable', value: '2.3 index' },
      { parameter_name: 'Clinical / Exposure History, if provided', value: 'Compatible environmental exposure' },
    ],
  }));
  assert.match(html, /<div class="test-title">LEPTOSPIRA ANTIBODY IgG<\/div>/);
  assert.match(html, /data-report-content="leptospira-antibody-igg"/);
  assert.match(html, /does not alone establish acute infection/);
  assert.match(html, /Paired acute and convalescent serum testing and MAT/);
  assert.deepEqual(
    getFallbackReportParameters({ name: 'Leptospira Antibody IgG' }).slice(0, 4).map(parameter => parameter.parameterName),
    ['Leptospira Antibody IgG, Serum', 'Antibody Index / Titre, if applicable', 'Assay / Method', 'Symptom Onset / Days of Illness, if provided'],
  );
});

test('Leptospira Antibodies (IgG & IgM) keeps both results and timing-aware serology guidance', () => {
  const html = buildReportHtml(sampleReport({
    name: 'Leptospira Antibodies (IgG & IgM)',
    sample_type: 'Serum',
    parameters: [
      { parameter_name: 'Leptospira Antibody IgG, Serum', value: 'Non-reactive', normal_range: 'Negative / non-reactive (assay-specific)' },
      { parameter_name: 'Leptospira Antibody IgM, Serum', value: 'Reactive', normal_range: 'Negative / non-reactive (assay-specific)' },
      { parameter_name: 'Symptom Onset / Days of Illness, if provided', value: 'Day 8 of illness' },
    ],
  }));
  assert.match(html, /<div class="test-title">LEPTOSPIRA ANTIBODIES \(IgG &amp; IgM\)<\/div>/);
  assert.match(html, /data-report-content="leptospira-antibodies-igg-igm"/);
  assert.match(html, /Day 8 of illness/);
  assert.match(html, /IgM-based serologic screening results are supportive rather than confirmatory/);
  assert.match(html, /negative early serum result does not exclude leptospirosis/);
  assert.deepEqual(
    getFallbackReportParameters({ name: 'Leptospira Antibodies (IgG & IgM)' }).slice(0, 4).map(parameter => parameter.parameterName),
    ['Leptospira Antibody IgG, Serum', 'Leptospira Antibody IgM, Serum', 'Assay / Method', 'Symptom Onset / Days of Illness, if provided'],
  );
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

test('Urine Culture adds explanatory notes while preserving laboratory findings and the existing table', () => {
  for (const name of ['Urine Culture', 'Urine Culture & Sensitivity', 'Urine Culture and Sensitivity']) {
    const input = { name, sample_type: 'Urine', parameters: [
      { parameter_name: 'Culture, Urine', value: 'Mixed growth\nLab review <required>', normal_range: 'Lab-validated reference', unit: 'CFU/mL' },
      { parameter_name: 'Comments', value: 'Preliminary report\nRecollection advised by laboratory' },
      { parameter_name: 'Culture Method', value: 'Recorded culture method' },
    ] };
    const before = JSON.stringify(input);
    const html = buildReportHtml(sampleReport(input));
    assert.match(html, /<div class="test-title">URINE CULTURE<\/div>/);
    assert.match(html, /class="results-table culture-table"/);
    assert.match(html, /Mixed growth<br \/>Lab review &lt;required&gt;/);
    assert.match(html, /Lab-validated reference/);
    assert.match(html, /CFU\/mL/);
    assert.match(html, /Recorded culture method/);
    assert.match(html, /Preliminary report<br \/>Recollection advised by laboratory/);
    assert.equal((html.match(/data-report-content="urine-culture"/g) || []).length, 1);
    assert.match(html, /A single colony-count threshold does not apply/);
    assert.match(html, /true mixed infection is also possible/);
    assert.match(html, /unreported antibiotic must not be assumed susceptible/);
    assert.equal(JSON.stringify(input), before);
  }
});

test('Urine Culture does not invent findings, no-growth comments or performed susceptibility', () => {
  const html = buildReportHtml(sampleReport({ name: 'Urine Culture', sample_type: 'Urine', parameters: [] }));
  const table = html.match(/<table class="results-table culture-table">[\s\S]*?<\/table>/)[0];
  assert.match(table, /<span class="">-<\/span>/);
  assert.match(html, /Comments:<\/div><p>-<\/p>/);
  assert.doesNotMatch(html, /No growth after incubation\.|Automated Identification &amp; Sensitivity/);
  const entered = buildReportHtml(sampleReport({ name: 'Urine Culture', parameters: [
    { parameter_name: 'Culture, Urine', value: 'No growth at 24 hours - preliminary' },
  ] }));
  assert.match(entered, /No growth at 24 hours - preliminary/);
  const manual = buildReportHtml(sampleReport({ name: 'Urine Culture', report_body: 'Laboratory-authored notes <preserved>', parameters: [] }));
  assert.match(manual, /Laboratory-authored notes &lt;preserved&gt;/);
  assert.doesNotMatch(manual, /data-report-content="urine-culture"/);
  for (const name of ['Urine Culture / Bacteriuria Screen', 'Stool Culture', 'AFB Culture & Sensitivity']) {
    assert.notEqual(getReportContent({ name, sample_type: 'Urine' })?.key, 'urine-culture');
  }
  assert.equal(getReportContent({ name: 'Urine Culture', sample_type: 'Blood' }), null);
});

test('each urine culture report in a multi-test visit receives its own notes', () => {
  const input = { name: 'Urine Culture', sample_type: 'Urine', parameters: [{ parameter_name: 'Culture, Urine', value: 'Laboratory finding' }] };
  const html = buildReportHtml({ ...sampleReport(input), tests: [input, { name: 'Urinary V M A', sample_type: 'Urine', parameters: [] }] });
  assert.equal((html.match(/data-report-content="urine-culture"/g) || []).length, 1);
  assert.equal((html.match(/data-report-content="urinary-vma"/g) || []).length, 1);
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
      if (normalizedInputName === 'urineculture') {
        assert.match(newHtml, /class="results-table culture-table"/);
        assert.match(newHtml, /data-report-content="urine-culture"/);
        assert.doesNotMatch(newHtml, /No growth after incubation\./);
        continue;
      }
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
      const isOvarianFunctionProfile = ['ovarianfunctionprofile', 'ovarianfunctionpanel', 'ovarianreserveprofile'].includes(normalizedInputName);
      const isPhospholipidAntibodyIgg = ['phospholipidantibodyiggaplag', 'phospholipidantibodyigg'].includes(normalizedInputName);
      const additionalProfileFormats = {
        oxygenforeachdayafter1st3days: ['OXYGEN THERAPY - DAILY SERVICE RECORD', 'oxygen-daily'],
        oxygen3days: ['OXYGEN THERAPY - THREE-DAY SERVICE RECORD', 'oxygen-three-days'],
        pancaantipr3: ['P-ANCA / ANTI-PR3 ANTIBODY', 'panca-pr3'],
        praplasmareninactivity: ['PLASMA RENIN ACTIVITY (PRA)', 'plasma-renin-activity'],
        psaprostatespecificantigen: ['PROSTATE SPECIFIC ANTIGEN (PSA), TOTAL', 'psa'],
        pthparathyroidhormone: ['PARATHYROID HORMONE (PTH)', 'pth'],
        pthintactmolecule: ['PARATHYROID HORMONE (PTH) - INTACT MOLECULE', 'intact-pth'],
        puoworkupprofile: ['PUO - WORK UP PROFILE', 'puo-workup'],
        pusafbstain: ['PUS / ASPIRATE - AFB STAIN', 'pus-afb-stain'],
        pusculturesensitivity: ['PUS / ASPIRATE - CULTURE &amp; SENSITIVITY', 'pus-culture-sensitivity'],
        pusgramstain: ['PUS / ASPIRATE - GRAM STAIN', 'pus-gram-stain'],
        peritonealfluidchloride: ['PERITONEAL (ASCITIC) FLUID CHLORIDE', 'peritoneal-fluid-chloride'],
        peritonealfluidgramstain: ['PERITONEAL (ASCITIC) FLUID - GRAM STAIN', 'peritoneal-fluid-gram-stain'],
        peritonealfluidldh: ['PERITONEAL (ASCITIC) FLUID LDH', 'peritoneal-fluid-ldh'],
        peritonealfluidprotein: ['PERITONEAL (ASCITIC) FLUID TOTAL PROTEIN', 'peritoneal-fluid-protein'],
        peritonealfluidsugar: ['PERITONEAL (ASCITIC) FLUID GLUCOSE (SUGAR)', 'peritoneal-fluid-sugar'],
        peritonealfluidforspecificgravity: ['PERITONEAL (ASCITIC) FLUID SPECIFIC GRAVITY', 'peritoneal-fluid-specific-gravity'],
        pertussis: ['PERTUSSIS / BORDETELLA PERTUSSIS', 'pertussis'],
        phenytoindilantin: ['PHENYTOIN (DILANTIN) - THERAPEUTIC DRUG MONITORING', 'phenytoin'],
        phospholipid: ['PHOSPHOLIPIDS, TOTAL', 'phospholipid'],
        phospholipidantibodyiggaplag: ['PHOSPHOLIPID (CARDIOLIPIN) ANTIBODY, IgG', 'phospholipid-antibody-igg'],
        phospholipidantibodyigmaplam: ['PHOSPHOLIPID (CARDIOLIPIN) ANTIBODY, IgM', 'phospholipid-antibody-igm'],
        phosphorus24hrsurine: ['PHOSPHORUS, 24-HOUR URINE', 'urine-phosphorus-24-hour'],
        plasma02contentsp02: ['OXYGEN CONTENT (ctO2)', 'oxygen-content'],
        pleuralfluidspecificgravity: ['PLEURAL FLUID SPECIFIC GRAVITY', 'pleural-fluid-specific-gravity'],
        pleuralfluidforprotein: ['PLEURAL FLUID TOTAL PROTEIN', 'pleural-fluid-protein'],
        pleuralfluidforsugar: ['PLEURAL FLUID GLUCOSE (SUGAR)', 'pleural-fluid-sugar'],
        postcoitaltest: ['POST-COITAL TEST (PCT)', 'post-coital-test'],
        potassium24hoururine: ['POTASSIUM, 24-HOUR URINE', 'urine-potassium-24-hour'],
        potassiumrandam: ['POTASSIUM, RANDOM URINE', 'urine-potassium-random'],
        preemploymentcheckup: ['PRE-EMPLOYMENT LABORATORY CHECK-UP', 'pre-employment-check-up'],
        precancerearlydetectionoforal: ['ORAL POTENTIALLY MALIGNANT DISORDER / EARLY-DETECTION ASSESSMENT', 'oral-precancer-early-detection'],
        pregnancyelisatest: ['PREGNANCY TEST — hCG (ELISA)', 'pregnancy-elisa-test'],
        rbcwbcmorphology: ['PERIPHERAL BLOOD FILM — RBC / WBC MORPHOLOGY', 'rbc-wbc-morphology'],
        rbcfragilitytest: ['OSMOTIC FRAGILITY TEST', 'osmotic-fragility'],
        rectalswabgramstain: ['RECTAL SWAB — GRAM STAIN', 'rectal-swab-gram-stain'],
        renalkidneyprofile: ['RENAL (KIDNEY) PROFILE', 'renal-kidney-profile'],
        respiratorysyncytialvirusrsv: ['RESPIRATORY SYNCYTIAL VIRUS (RSV)', 'respiratory-syncytial-virus'],
        reviewforhistologyslide: ['HISTOLOGY SLIDE REVIEW', 'histology-slide-review'],
        rheumaticfeverprofile: ['RHEUMATIC FEVER PROFILE', 'rheumatic-fever-profile'],
        rheumatoidprofile: ['RHEUMATOID PROFILE', 'rheumatoid-profile'],
        rubellaigg: ['RUBELLA VIRUS ANTIBODY, IgG', 'rubella-igg'],
        shbgsexhormonebindingglobulin: ['SEX HORMONE BINDING GLOBULIN (SHBG)', 'shbg'],
        semenculture: ['SEMEN CULTURE', 'semen-culture'],
        seminalfluidforculturesensitivity: ['SEMINAL FLUID - CULTURE & SENSITIVITY', 'seminal-fluid-culture-sensitivity'],
        sputumculturesensitivity: ['SPUTUM - CULTURE & SENSITIVITY', 'sputum-culture-sensitivity'],
        sputumculturenonafb: ['SPUTUM CULTURE \(NON-AFB\)', 'sputum-culture-non-afb'],
        sputumgramstain: ['SPUTUM - GRAM STAIN', 'sputum-gram-stain'],
        sputumreleishmanstaingram: ['SPUTUM RESPIRATORY EXAMINATION (LEISHMAN STAIN [+] GRAM STAIN)', 'sputum-re-leishman-gram'],
        stoneanalysisurinarygallbladder: ['STONE ANALYSIS \(URINARY / GALL BLADDER\)', 'stone-analysis'],
        stoolculture: ['STOOL CULTURE', 'stool-culture'],
        stoolobtre3days: ['STOOL OBT [+] ROUTINE EXAMINATION \(THREE DAYS\)', 'stool-obt-re-three-days'],
        stoolopc: ['STOOL OVA, CYSTS & PARASITES (OPC)', 'stool-opc'],
        stoolreredsubph: ['STOOL ROUTINE EXAMINATION [+] REDUCING SUBSTANCES [+] pH', 'stool-re-red-sub-ph'],
        swabculturesensitivityforanysiteswab: ['SWAB CULTURE [&] SENSITIVITY \(ANY SITE\)', 'any-site-swab-culture-sensitivity'],
        synovialfluidforcalcium: ['SYNOVIAL FLUID CALCIUM', 'synovial-fluid-calcium'],
        synovialfluidforcrystals: ['SYNOVIAL FLUID CRYSTAL EXAMINATION', 'synovial-fluid-crystals'],
        synovialfluidforuricacid: ['SYNOVIAL FLUID URIC ACID', 'synovial-fluid-uric-acid'],
        t3ustsh: ['T3 [&] ULTRA-SENSITIVE TSH', 't3-us-tsh'],
        t4ustsh: ['T4 [&] ULTRA-SENSITIVE TSH', 't4-us-tsh'],
        tbiga: ['TUBERCULOSIS \(TB\) IgA ANTIBODY', 'tb-iga'],
        tbigm: ['TUBERCULOSIS \(TB\) IgM ANTIBODY', 'tb-igm'],
        tbgthyroxinebindingglobulin: ['THYROXINE-BINDING GLOBULIN \(TBG\)', 'thyroxine-binding-globulin'],
        tcdc: ['TOTAL [&] DIFFERENTIAL LEUKOCYTE COUNT \(TC [&] DC\)', 'total-differential-count'],
        tcdcesr: ['TOTAL [&] DIFFERENTIAL LEUKOCYTE COUNT [+] ESR', 'total-differential-count-esr'],
        tcdcmp: ['TOTAL [&] DIFFERENTIAL LEUKOCYTE COUNT [+] MALARIA PARASITE', 'total-differential-count-malaria-parasite'],
        taeniaechinococcus: ['TAENIA / ECHINOCOCCUS SEROLOGY', 'taenia-echinococcus-serology'],
        testicularcancermonitorprofile: ['TESTICULAR CANCER MONITOR PROFILE', 'testicular-cancer-monitor-profile'],
        testicularfunctionprofile: ['TESTICULAR FUNCTION PROFILE', 'testicular-function-profile'],
        thalassemiaprofile: ['THALASSEMIA PROFILE', 'thalassemia-profile'],
        throatswabculture: ['THROAT SWAB CULTURE', 'throat-swab-culture'],
        throatswabcultureandsensitivity: ['THROAT SWAB CULTURE [&](?:amp;)? SENSITIVITY', 'throat-swab-culture-sensitivity'],
        seminalfluidforgramstain: ['SEMINAL FLUID - GRAM STAIN', 'seminal-fluid-gram-stain'],
        seminalgermcellstudy: ['SEMINAL GERM CELL STUDY', 'seminal-germ-cell-study'],
        serologyviralmarker: ['SEROLOGY / VIRAL MARKER PROFILE', 'serology-viral-marker'],
        sexchromatinstudy: ['SEX CHROMATIN STUDY', 'sex-chromatin-study'],
        solubleliverantigenslaantibody: ['SOLUBLE LIVER ANTIGEN (SLA) ANTIBODY', 'soluble-liver-antigen-antibody'],
        spirometry: ['SPIROMETRY', 'spirometry'],
        semenforfructose: ['SEMEN FRUCTOSE', 'semen-fructose'],
        seminalfluidforafbstain: ['SEMINAL FLUID — AFB STAIN', 'seminal-fluid-afb-stain'],
        preoperativeprofile: ['PRE-OPERATIVE LABORATORY PROFILE', 'pre-operative-profile'],
        precathprofile: ['PRE-CATHETERIZATION LABORATORY PROFILE', 'pre-cath-profile'],
        premarriageprofile: ['PRE-MARITAL LABORATORY SCREENING (REQUESTED TESTS)', 'pre-marriage-profile'],
      };
      const additionalProfileFormat = additionalProfileFormats[normalizedInputName];
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
      const isJointFluidGramStain = ['jointfluidforgramstain', 'jointfluidgramstain', 'gramstainjointfluid', 'synovialfluidgramstain'].includes(normalizedInputName);
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
      const isJointFluidSugar = ['jointfluidforsugar', 'jointfluidglucose', 'glucosejointfluid', 'synovialfluidglucose'].includes(normalizedInputName);
      const isKaryotypingWithCBanding = ['karyotypingwithcbanding', 'karyotypecbanding', 'cbandingkaryotype', 'cbandingchromosomeanalysis'].includes(normalizedInputName);
      const isLftWithGgt = normalizedInputName === 'lftwithggt';
      const isLipidComprehensiveProfile = ['lipidcomprehensiveprofile', 'comprehensivelipidprofile', 'advancedlipidprofile'].includes(normalizedInputName);
      const isLipoprotein = ['lipoprotein', 'lipoproteintest'].includes(normalizedInputName);
      const isLipoproteinProfile = ['lipoproteinprofile', 'lipoproteinpanel'].includes(normalizedInputName);
      const isLithium = ['lithium', 'lithiumserum', 'lithiumlevel'].includes(normalizedInputName);
      const isLiverBiopsy = ['liverbiopsy', 'histopathologyliverbiopsy'].includes(normalizedInputName);
      const isLiverCancerMonitorProfile = ['livercancermonitorprofile', 'livercancermonitor', 'hepatocellularcarcinomamonitorprofile'].includes(normalizedInputName);
      const isLupusAnticoagulant = ['lupusanticoagulant', 'lupusanticoagulantprofile', 'laevaluation'].includes(normalizedInputName);
      const isMdmaScreen = ['mdmascreen', 'mdmaurinescreen', 'ecstasyscreen'].includes(normalizedInputName);
      const isUrineMagnesium = ['magnesiumurine', 'urinemagnesium', 'magnesium24hoururine'].includes(normalizedInputName);
      const isMalariaPanPfAntigen = ['malariapanpfantigen', 'malariapfpanantigen', 'malariapanpfag', 'malariaantigenpanpf'].includes(normalizedInputName);
      const isOptimalItAntigen = ['optimalitantigen', 'optimalitmalariaantigen', 'optimalit', 'optimalitrdt'].includes(normalizedInputName);
      const isOsmoticFragility = ['osmoticfragilitytest', 'osmoticfragility', 'erythrocyteosmoticfragility', 'rbcosmoticfragility'].includes(normalizedInputName);
      const isMalariaProfile = ['malariaprofile', 'malariapanel', 'malariaworkupprofile'].includes(normalizedInputName);
      const isMaleInfertilityProfile = ['maleinfertilityprofile', 'maleinfertilitypanel', 'infertilityprofilemale'].includes(normalizedInputName);
      const isManganese = ['manganese', 'manganeseserum', 'manganesewholeblood'].includes(normalizedInputName);
      const isMeaslesRubeolaIgg = ['measlesrubeolaantibodyigg', 'measlesrubeolaigg', 'measlesigg', 'rubeolaigg'].includes(normalizedInputName);
      const isMeaslesRubeolaIgm = ['measlesrubeolaantibodyigm', 'measlesrubeolaigm', 'measlesigm', 'rubeolaigm'].includes(normalizedInputName);
      const isMenstrualBloodTbPcr = ['menstrualbloodfortbpcr', 'menstrualbloodtbpcr', 'endometrialmenstrualbloodtbpcr'].includes(normalizedInputName);
      const isMicrofilaria = ['microfilaria', 'microfilariae', 'microfilarialsmear'].includes(normalizedInputName);
      const isMicroalbuminUrine = ['microalbuminurine', 'urinemicroalbumin', 'microalbuminuria'].includes(normalizedInputName);
      const isNasalSwabGramStain = ['nasalswabgramstain', 'nasalgramstain', 'gramstainnasalswab'].includes(normalizedInputName);
      const isOncologyProfile = ['oncologyprofile', 'oncologymarkerprofile', 'tumormarkerprofile', 'tumourmarkerprofile'].includes(normalizedInputName);
      const isLhFsh = ['lhfsh', 'lhandfsh', 'luteinizinghormonefolliclestimulatinghormone'].includes(normalizedInputName);
      const isLhPrl = ['lhprl', 'lhandprl', 'luteinizinghormoneprolactin'].includes(normalizedInputName);
      const isLeadLevel = ['leadlevelintroducing', 'bloodleadlevel', 'leadlevel', 'leadpb'].includes(normalizedInputName);
      const isKaryotype = ['karyotype', 'karyotypingchromosomalanalysis', 'chromosomeanalysis'].includes(normalizedInputName);
      const isKahnTest = ['kahntest', 'kahn'].includes(normalizedInputName);
      const isKalaAzarRapidTest = ['kalazarrapidtest', 'kalaazarrapidtest', 'kalazar', 'kalaazar', 'rk39rapidtest', 'rk39'].includes(normalizedInputName);
      const isLeishmaniaKalaAzarAntibodyIgg = ['leishmaniakalaazarantibodyigg', 'leishmaniaantibodyigg', 'kalaazarantibodyigg', 'antileishmaniaigg'].includes(normalizedInputName);
      const isLeishmaniaKalaAzarAntibodyIgm = ['leishmaniakalaazarantibodyigm', 'leishmaniaantibodyigm', 'kalaazarantibodyigm', 'antileishmaniaigm'].includes(normalizedInputName);
      const isLeptospiraAntibodiesIggIgm = ['leptospiraantibodiesiggigm', 'leptospiraiggigm', 'antileptospiraiggigm'].includes(normalizedInputName);
      const isLeptospiraAntibodyIgg = ['leptospiraantibodyigg', 'leptospiraigg', 'antileptospiraigg'].includes(normalizedInputName);
      const isLeptospiraAntibodyIgm = ['leptospiraantibodyigm', 'leptospiraigm', 'antileptospiraigm'].includes(normalizedInputName);
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
      const isImmaturePlateletFraction = ['immatureplateletfractionipf', 'immatureplateletfraction', 'ipf'].includes(normalizedInputName);
      const isImmunoglobulinGAMPanel = ['immunoglobulinigaiggigm', 'immunoglobuliniggigaigm', 'immunoglobulingamprofile'].includes(normalizedInputName);
      const isImmunoglobulinProfile = ['immunoglobulinprofile', 'serumimmunoglobulinprofile', 'quantitativeimmunoglobulinprofile'].includes(normalizedInputName);
      const isIndiaInkPreparation = ['indiainkpreperation', 'indiainkpreparation', 'indiainkstain', 'indiaink'].includes(normalizedInputName);
      const isJointFluidAfbStain = ['jointfluidforafbstain', 'jointfluidafbstain', 'synovialfluidforafbstain', 'synovialfluidafbstain', 'afbstainjointfluid'].includes(normalizedInputName);
      const isJointFluidChloride = ['jointfluidforchloride', 'jointfluidchloride', 'chloridejointfluid', 'synovialfluidchloride'].includes(normalizedInputName);
      const isUrineInorganicPhosphorus = ['inorganicphosphorusurine', 'urineinorganicphosphorus', 'urinephosphorus', 'phosphorusurine'].includes(normalizedInputName);
      const isFreeInsulin = ['insulinfree', 'freeinsulin', 'insulinfreeandtotal'].includes(normalizedInputName);
      const isMidnightInsulin = ['insulinmidnight', 'midnightinsulin', 'insulin0000'].includes(normalizedInputName);
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
      const isTorchIggPanel = normalizedInputName === 'torchpaneligg'
        || normalizedInputName === 'torchiggpanel'
        || normalizedInputName === 'torchprofileigg';
      const isTorchIgmPanel = normalizedInputName === 'torchpaneligm'
        || normalizedInputName === 'torchigmpanel'
        || normalizedInputName === 'torchprofileigm';
      const isTotalIge = normalizedInputName === 'totalige'
        || normalizedInputName === 'totalimmunoglobulineige'
        || normalizedInputName === 'immunoglobulinetotal';
      const isTotalLipid = normalizedInputName === 'totallipid'
        || normalizedInputName === 'totallipids'
        || normalizedInputName === 'serumtotallipids';
      const isTotalProtein = normalizedInputName === 'totalprotein'
        || normalizedInputName === 'totalproteinserum'
        || normalizedInputName === 'serumtotalprotein'
        || normalizedInputName === 'proteintotal';
      const isUlcerSmearPap = normalizedInputName === 'ulcersmearforpap'
        || normalizedInputName === 'ulcersmearpap'
        || normalizedInputName === 'ulcersmearforpapanicolaou'
        || normalizedInputName === 'ulcercytologypapstain';
      const isUrineAcetone = ['urineacetone', 'unineacetone', 'acetoneurine'].includes(normalizedInputName);
      const is24HourUrineUrea = ['urea24hrsurine', 'urea24hoururine', 'urea24hoursurine', '24hoururineurea', 'urineurea24hour'].includes(normalizedInputName);
      const is24HourUrineUricAcid = ['uricacid24hrsurine', 'uricacid24hoururine', 'uricacid24hoursurine', '24hoururineuricacid', 'urineuricacid24hour'].includes(normalizedInputName);
      const isRandomUrineUricAcid = ['uricacidurine', 'urineuricacid', 'randomurineuricacid', 'uricacidrandomurine', 'uricacidurinerandom'].includes(normalizedInputName);
      const isUrinary17Ketosteroid = ['urinary17ketosteroid', 'urinary17ketosteroids', 'urine17ketosteroids', '17ketosteroidsurine', '17ketosteroids24hoururine', '17ksurine'].includes(normalizedInputName);
      const isUrinaryVma = ['urinaryvma', 'urinevma', 'vmaurine', 'vma24hoururine', 'vanillylmandelicacidurine', 'vanillylmandelicacid24hoururine', 'vanillylmandelicacidvmaurine'].includes(normalizedInputName);
      const isUrineObtThreeDay = ['urineobt3consecutivedays', 'urineobtthreeconsecutivedays', 'urineoccultblood3consecutivedays', 'urineoccultbloodtest3days'].includes(normalizedInputName);
      const isUrinePorphobilinogen = ['urineporphobilinogen', 'porphobilinogenurine', 'porphobilinogenpbgurine', 'urinepbg', 'pbgurine'].includes(normalizedInputName);
      const isUrinePregnancy = ['urinepregnancytest', 'pregnancytesturine', 'unnepregnancytest', 'urinehcgqualitative', 'hcgurinequalitative'].includes(normalizedInputName);
      const isUrineProteinAlbumin = ['urineproteinalbumin', 'unneproteinalbumin', 'proteinalbuminurine'].includes(normalizedInputName);
      const is24HourUrineProtein = ['urineprotein24hours', 'urineprotein24hour', '24hrsurinaryprotein', '24hoururinaryprotein', '24hoururineprotein', 'protein24hoururine', 'totalprotein24hoururine'].includes(normalizedInputName);
      const isUrineRoutine = ['urinereroutineexamination', 'urinere', 'urineroutineexamination', 'routineurineexamination', 'urinalysis'].includes(normalizedInputName);
      const isUrineReducingSubstances = ['urinereducingsubstance', 'urinereducingsubstances', 'reducingsubstancesurine', 'urineforreducingsubstances', 'urineredusingsubstence', 'urnineredusingsubstance'].includes(normalizedInputName);
      const isUrineSugar = ['urinesugar', 'urinesugartest', 'sugarurine', 'unnesugar'].includes(normalizedInputName);
      const isUrineUrobilinogen = ['urineurobilinogen', 'urobilinogenurine', 'urobilinogenurinetest'].includes(normalizedInputName);
      const isUrinePh = ['urineph', 'phurine', 'urinephtest', 'phurinetest'].includes(normalizedInputName);
      const isUroflowmetry = ['uroflowmetry', 'uroflowmetrytest', 'urinaryflowratestudy'].includes(normalizedInputName);
      const isVaginalCervicalSwab = ['vaginalcervicalswab', 'vaginalcervicalswabs', 'cervicalvaginalswab'].includes(normalizedInputName);
      const isVaginalSwabAfb = ['vaginalswabafbstain', 'vaginalswabforafbstain', 'vaginalafbstain', 'afbstainvaginalswab'].includes(normalizedInputName);
      const isVaginalSwabGram = ['vaginalswabgramstain', 'vaginalswabforgramstain', 'vaginalgramstain', 'gramstainvaginalswab', 'vaginalswabforframstain'].includes(normalizedInputName);
      const isValproateLevel = ['valporicacidsodiumvalproate', 'valproicacidsodiumvalproate', 'valproicacid', 'valporicacid', 'sodiumvalproate', 'valproatelevel'].includes(normalizedInputName);
      const isVanDenBerghReaction = ['vandenburghreaction', 'vandenberghreaction', 'vandenberghtest', 'vandenburghtest'].includes(normalizedInputName);
      const isWeilFelix = ['wellfelixtest', 'weilfelixtest', 'weilfelix', 'wellfelix'].includes(normalizedInputName);
      const isWellWomenProfile = ['wellwomenprofile', 'wellwomanprofile'].includes(normalizedInputName);
      const isWoundSwabAfb = ['woundswabafbstain', 'woundswabforafbstain', 'woundafbstain', 'afbstainwoundswab'].includes(normalizedInputName);
      const isWoundSwabGram = ['woundswabgramstain', 'woundswabforgramstain', 'woundgramstain', 'gramstainwoundswab'].includes(normalizedInputName);
      const isUrethralDischargeCulture = ['urethraldischargecs', 'urethraldischargecultureandsensitivity', 'urethraldischargeculturesensitivity'].includes(normalizedInputName);
      const isUrethralSwabAfb = ['urethralswabafbstain', 'urethralswabforafb', 'urethralafbstain', 'afbstainurethralswab'].includes(normalizedInputName);
      const isAlbertStainKlb = normalizedInputName === 'albertstainofsmearsforklb'
        || normalizedInputName === 'albertstainofsmearforklb'
        || normalizedInputName === 'albertstainforklb'
        || normalizedInputName === 'throatswabforklb'
        || normalizedInputName === 'throatswabklb';
      const isThrombinTime = normalizedInputName === 'thrombintimett'
        || normalizedInputName === 'thrombintime'
        || normalizedInputName === 'tt'
        || normalizedInputName === 'thrombinclottingtime';
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
      const isJointFluidProtein = ['jointfluidforprotein', 'jointfluidprotein', 'proteinjointfluid', 'synovialfluidprotein'].includes(normalizedInputName);
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
      const isJointFluidSpecificGravity = ['jointfluidforspecificgravity', 'jointfluidspecificgravity', 'specificgravityjointfluid', 'synovialfluidspecificgravity'].includes(normalizedInputName);
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
      if (isImmaturePlateletFraction) {
        assert.match(newHtml, /IMMATURE PLATELET FRACTION \(IPF\)/);
        assert.match(newHtml, /data-report-content="immature-platelet-fraction"/);
        assert.match(newHtml, /must be interpreted with the concurrent platelet count/);
        continue;
      }
      if (isImmunoglobulinGAMPanel) {
        assert.match(newHtml, /IMMUNOGLOBULIN \(IgA\) \+ \(IgG\) \+ \(IgM\)/);
        assert.match(newHtml, /data-report-content="immunoglobulin-gam-panel"/);
        assert.match(newHtml, /serum protein electrophoresis and immunofixation are generally required/);
        continue;
      }
      if (isImmunoglobulinProfile) {
        assert.match(newHtml, /IMMUNOGLOBULIN PROFILE/);
        assert.match(newHtml, /data-report-content="immunoglobulin-profile"/);
        assert.match(newHtml, /Total Immunoglobulin E \(IgE\), if ordered/);
        continue;
      }
      if (isIndiaInkPreparation) {
        assert.match(newHtml, /INDIA INK PREPARATION/);
        assert.match(newHtml, /data-report-content="india-ink-preparation"/);
        assert.match(newHtml, /A negative India ink preparation does not exclude cryptococcal infection/);
        continue;
      }
      if (isJointFluidAfbStain) {
        assert.match(newHtml, /JOINT FLUID - AFB STAIN/);
        assert.match(newHtml, /data-report-content="joint-fluid-afb-stain"/);
        assert.match(newHtml, /A negative AFB smear does not exclude mycobacterial infection/);
        continue;
      }
      if (isJointFluidChloride) {
        assert.match(newHtml, /CHLORIDE, JOINT FLUID/);
        assert.match(newHtml, /data-report-content="joint-fluid-chloride"/);
        assert.match(newHtml, /serum or plasma chloride reference intervals must not be applied directly to synovial fluid/i);
        continue;
      }
      if (isUrineInorganicPhosphorus) {
        assert.match(newHtml, /INORGANIC PHOSPHORUS \(URINE\)/);
        assert.match(newHtml, /data-report-content="urine-inorganic-phosphorus"/);
        assert.match(newHtml, /A timed 24-hour urine collection is preferred/);
        continue;
      }
      if (isFreeInsulin) {
        assert.match(newHtml, /INSULIN \(FREE\)/);
        assert.match(newHtml, /data-report-content="free-insulin"/);
        assert.match(newHtml, /not bound by circulating insulin antibodies/);
        continue;
      }
      if (isMidnightInsulin) {
        assert.match(newHtml, /INSULIN \(MIDNIGHT\)/);
        assert.match(newHtml, /data-report-content="midnight-insulin"/);
        assert.match(newHtml, /Midnight insulin is timing-critical/);
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
      if (isJointFluidProtein) {
        assert.match(newHtml, /TOTAL PROTEIN, JOINT FLUID/);
        assert.match(newHtml, /data-report-content="joint-fluid-protein"/);
        assert.match(newHtml, /serum and pleural-fluid protein thresholds must not be applied directly to synovial fluid/i);
        continue;
      }
      if (isJointFluidSpecificGravity) {
        assert.match(newHtml, /SPECIFIC GRAVITY, JOINT FLUID/);
        assert.match(newHtml, /data-report-content="joint-fluid-specific-gravity"/);
        assert.match(newHtml, /No universal reference interval applies to joint fluid/);
        continue;
      }
      if (isJointFluidSugar) {
        assert.match(newHtml, /GLUCOSE, JOINT FLUID/);
        assert.match(newHtml, /data-report-content="joint-fluid-sugar"/);
        assert.match(newHtml, /serum or plasma glucose reference intervals must not be applied directly to synovial fluid/i);
        continue;
      }
      if (isKahnTest) {
        assert.match(newHtml, /KAHN TEST/);
        assert.match(newHtml, /data-report-content="kahn-test"/);
        assert.match(newHtml, /not specific for/);
        continue;
      }
      if (isKalaAzarRapidTest) {
        assert.match(newHtml, /KALA-AZAR \(RAPID TEST\)/);
        assert.match(newHtml, /data-report-content="kala-azar-rapid-test"/);
        assert.match(newHtml, /does not by itself establish active disease/);
        continue;
      }
      if (isLeishmaniaKalaAzarAntibodyIgg) {
        assert.match(newHtml, /LEISHMANIA \/ KALA-AZAR ANTIBODY IgG/);
        assert.match(newHtml, /data-report-content="leishmania-kala-azar-antibody-igg"/);
        assert.match(newHtml, /does not exclude visceral leishmaniasis/);
        continue;
      }
      if (isLeishmaniaKalaAzarAntibodyIgm) {
        assert.match(newHtml, /LEISHMANIA \/ KALA-AZAR ANTIBODY IgM/);
        assert.match(newHtml, /data-report-content="leishmania-kala-azar-antibody-igm"/);
        assert.match(newHtml, /limited diagnostic utility for parasitic infections/);
        continue;
      }
      if (isLeptospiraAntibodiesIggIgm) {
        assert.match(newHtml, /LEPTOSPIRA ANTIBODIES \(IgG &amp; IgM\)/);
        assert.match(newHtml, /data-report-content="leptospira-antibodies-igg-igm"/);
        assert.match(newHtml, /IgM-based serologic screening results are supportive rather than confirmatory/);
        continue;
      }
      if (isLeptospiraAntibodyIgg) {
        assert.match(newHtml, /LEPTOSPIRA ANTIBODY IgG/);
        assert.match(newHtml, /data-report-content="leptospira-antibody-igg"/);
        assert.match(newHtml, /does not alone establish acute infection/);
        continue;
      }
      if (isLeptospiraAntibodyIgm) {
        assert.match(newHtml, /LEPTOSPIRA ANTIBODY IgM/);
        assert.match(newHtml, /data-report-content="leptospira-antibody-igm"/);
        assert.match(newHtml, /does not alone definitively diagnose acute infection/);
        continue;
      }
      if (isKaryotypingWithCBanding) {
        assert.match(newHtml, /KARYOTYPING WITH C-BANDING/);
        assert.match(newHtml, /data-report-content="karyotype-c-banding"/);
        assert.match(newHtml, /constitutive heterochromatin/);
        continue;
      }
      if (isLftWithGgt) {
        assert.match(newHtml, /LIVER FUNCTION TEST \(LFT\) WITH GGT/);
        assert.match(newHtml, /data-report-content="lft-with-ggt"/);
        assert.match(newHtml, /GGT can help support a hepatic source/);
        continue;
      }
      if (isLipidComprehensiveProfile) {
        assert.match(newHtml, /LIPID COMPREHENSIVE PROFILE/);
        assert.match(newHtml, /data-report-content="lipid-comprehensive-profile"/);
        assert.match(newHtml, /non-HDL cholesterol is calculated as total cholesterol minus HDL cholesterol/);
        continue;
      }
      if (isLipoprotein) {
        assert.match(newHtml, /LIPOPROTEIN TEST/);
        assert.match(newHtml, /data-report-content="lipoprotein"/);
        assert.match(newHtml, /does not identify a specific analyte/);
        continue;
      }
      if (isLipoproteinProfile) {
        assert.match(newHtml, /LIPOPROTEIN PROFILE/);
        assert.match(newHtml, /data-report-content="lipoprotein-profile"/);
        assert.match(newHtml, /standard lipoprotein profile includes total cholesterol/);
        continue;
      }
      if (isLithium) {
        assert.match(newHtml, /LITHIUM THERAPEUTIC DRUG MONITORING/);
        assert.match(newHtml, /data-report-content="lithium"/);
        assert.match(newHtml, /commonly collected 8-12 hours after the last dose/);
        continue;
      }
      if (isLiverBiopsy) {
        assert.match(newHtml, /SURGICAL PATHOLOGY REPORT &mdash; LIVER BIOPSY/);
        assert.match(newHtml, /data-report-content="liver-biopsy"/);
        assert.match(newHtml, /Core number, length, fragmentation/);
        continue;
      }
      if (isLiverCancerMonitorProfile) {
        assert.match(newHtml, /LIVER CANCER MONITOR PROFILE/);
        assert.match(newHtml, /data-report-content="liver-cancer-monitor-profile"/);
        assert.match(newHtml, /abnormal AFP result is not diagnostic by itself/);
        continue;
      }
      if (isLupusAnticoagulant) {
        assert.match(newHtml, /LUPUS ANTICOAGULANT EVALUATION/);
        assert.match(newHtml, /data-report-content="lupus-anticoagulant"/);
        assert.match(newHtml, /No single coagulation assay can identify or exclude all lupus anticoagulants/);
        continue;
      }
      if (isMdmaScreen) {
        assert.match(newHtml, /MDMA \(ECSTASY\) SCREEN/);
        assert.match(newHtml, /data-report-content="mdma-screen"/);
        assert.match(newHtml, /A screening result is presumptive/);
        continue;
      }
      if (isUrineMagnesium) {
        assert.match(newHtml, /MAGNESIUM, URINE/);
        assert.match(newHtml, /data-report-content="urine-magnesium"/);
        assert.match(newHtml, /Document duration and volume for timed collections/);
        continue;
      }
      if (isMalariaPanPfAntigen) {
        assert.match(newHtml, /MALARIA ANTIGEN &mdash; PAN \/ PF/);
        assert.match(newHtml, /data-report-content="malaria-pan-pf-antigen"/);
        assert.match(newHtml, /Rapid-test results, whether positive or negative/);
        continue;
      }
      if (isOptimalItAntigen) {
        assert.match(newHtml, /OPTIMAL-IT MALARIA ANTIGEN/);
        assert.match(newHtml, /data-report-content="optimal-it-antigen"/);
        assert.match(newHtml, /pLDH-based malaria rapid diagnostic test/);
        continue;
      }
      if (isOsmoticFragility) {
        assert.match(newHtml, /OSMOTIC FRAGILITY TEST/);
        assert.match(newHtml, /data-report-content="osmotic-fragility"/);
        assert.match(newHtml, /does not establish hereditary spherocytosis or another diagnosis/);
        continue;
      }
      if (isMalariaProfile) {
        assert.match(newHtml, /MALARIA PROFILE/);
        assert.match(newHtml, /data-report-content="malaria-profile"/);
        assert.match(newHtml, /Thick and thin blood films are complementary/);
        continue;
      }
      if (isMaleInfertilityProfile) {
        assert.match(newHtml, /MALE INFERTILITY PROFILE/);
        assert.match(newHtml, /data-report-content="male-infertility-profile"/);
        assert.match(newHtml, /Semen analysis remains a separate, standardized laboratory assessment/);
        continue;
      }
      if (isManganese) {
        assert.match(newHtml, /MANGANESE/);
        assert.match(newHtml, /data-report-content="manganese"/);
        assert.match(newHtml, /Whole blood, serum, plasma, and red-cell results are not interchangeable/);
        continue;
      }
      if (isMeaslesRubeolaIgg) {
        assert.match(newHtml, /MEASLES \(RUBEOLA\) ANTIBODY, IgG/);
        assert.match(newHtml, /data-report-content="measles-rubeola-igg"/);
        assert.match(newHtml, /does not diagnose acute measles infection/);
        continue;
      }
      if (isMeaslesRubeolaIgm) {
        assert.match(newHtml, /MEASLES \(RUBEOLA\) ANTIBODY, IgM/);
        assert.match(newHtml, /data-report-content="measles-rubeola-igm"/);
        assert.match(newHtml, /must not be used to diagnose measles/);
        continue;
      }
      if (isMenstrualBloodTbPcr) {
        assert.match(newHtml, /MENSTRUAL BLOOD FOR TB PCR/);
        assert.match(newHtml, /data-report-content="menstrual-blood-tb-pcr"/);
        assert.match(newHtml, /negative result does not exclude genital\/extrapulmonary TB/);
        continue;
      }
      if (isMicrofilaria) {
        assert.match(newHtml, /MICRO FILARIA/);
        assert.match(newHtml, /data-report-content="microfilaria"/);
        assert.match(newHtml, /species-dependent periodicity/);
        continue;
      }
      if (isMicroalbuminUrine) {
        assert.match(newHtml, /MICROALBUMIN \(URINE\)/);
        assert.match(newHtml, /data-report-content="microalbumin-urine"/);
        assert.match(newHtml, /report a ratio only when it has been requested or calculated by the laboratory/);
        continue;
      }
      if (isNasalSwabGramStain) {
        assert.match(newHtml, /NASAL SWAB - GRAM STAIN/);
        assert.match(newHtml, /data-report-content="nasal-swab-gram-stain"/);
        assert.match(newHtml, /do not provide definitive species identification or antimicrobial susceptibility/);
        continue;
      }
      if (isOncologyProfile) {
        assert.match(newHtml, /ONCOLOGY PROFILE/);
        assert.match(newHtml, /data-report-content="oncology-profile"/);
        assert.match(newHtml, /does not diagnose, exclude, or screen for cancer/);
        continue;
      }
      if (isLhFsh) {
        assert.match(newHtml, /LH & FSH/);
        assert.match(newHtml, /data-report-content="lh-fsh"/);
        assert.match(newHtml, /midcycle surge/);
        continue;
      }
      if (isLhPrl) {
        assert.match(newHtml, /LH & PRL/);
        assert.match(newHtml, /data-report-content="lh-prl"/);
        assert.match(newHtml, /pregnancy\/lactation, medicines, stress/);
        continue;
      }
      if (isLeadLevel) {
        assert.match(newHtml, /LEAD LEVEL/);
        assert.match(newHtml, /data-report-content="lead-level"/);
        assert.match(newHtml, /confirmed with a properly collected venous whole-blood sample/);
        continue;
      }
      if (isKaryotype) {
        assert.match(newHtml, /KARYOTYPE \/ CHROMOSOME ANALYSIS/);
        assert.match(newHtml, /data-report-content="karyotype"/);
        assert.match(newHtml, /International System for Human Cytogenomic Nomenclature/);
        continue;
      }
      if (isOvarianFunctionProfile) {
        assert.match(newHtml, /OVARIAN FUNCTION PROFILE/);
        assert.match(newHtml, /data-report-content="ovarian-function-profile"/);
        assert.match(newHtml, /does not diagnose a specific cause of menstrual irregularity, infertility, or ovarian dysfunction by itself/);
        continue;
      }
      if (additionalProfileFormat) {
        assert.match(newHtml, new RegExp(additionalProfileFormat[0].replace(/[()]/g, '\\$&')));
        assert.match(newHtml, new RegExp(`data-report-content="${additionalProfileFormat[1]}"`));
        continue;
      }
      if (isTorchIgmPanel) {
        assert.match(newHtml, /TORCH PANEL \(IgM\)/);
        assert.match(newHtml, /data-report-content="torch-igm-panel"/);
        assert.match(newHtml, /must not be used alone to date infection or diagnose fetal infection/);
        continue;
      }
      if (isTorchIggPanel) {
        assert.match(newHtml, /TORCH PANEL \(IgG\)/);
        assert.match(newHtml, /data-report-content="torch-igg-panel"/);
        assert.match(newHtml, /does not establish active infection or when exposure occurred/);
        continue;
      }
      if (isTotalIge) {
        assert.match(newHtml, /TOTAL IMMUNOGLOBULIN E \(IgE\)/);
        assert.match(newHtml, /data-report-content="total-ige"/);
        assert.match(newHtml, /does not identify a specific allergen/);
        continue;
      }
      if (isTotalLipid) {
        assert.match(newHtml, /TOTAL LIPIDS, SERUM/);
        assert.match(newHtml, /data-report-content="total-lipid"/);
        assert.match(newHtml, /not interchangeable with a standard lipid profile/);
        continue;
      }
      if (isTotalProtein) {
        assert.match(newHtml, /TOTAL PROTEIN, SERUM/);
        assert.match(newHtml, /data-report-content="total-protein"/);
        assert.match(newHtml, /combined concentration of albumin and globulins in serum/);
        continue;
      }
      if (isUlcerSmearPap) {
        assert.match(newHtml, /ULCER SMEAR FOR PAP STAIN/);
        assert.match(newHtml, /data-report-content="ulcer-smear-pap"/);
        assert.match(newHtml, /does not replace histopathology or tissue biopsy/);
        continue;
      }
      if (isUrineAcetone) {
        assert.match(newHtml, /URINE ACETONE/);
        assert.match(newHtml, /data-report-content="urine-acetone"/);
        assert.match(newHtml, /They do not measure beta-hydroxybutyrate/);
        continue;
      }
      if (is24HourUrineUrea) {
        assert.match(newHtml, /UREA, 24-HOUR URINE/);
        assert.match(newHtml, /data-report-content="urine-urea-24-hour"/);
        assert.match(newHtml, /This report measures urea, not urine urea nitrogen/);
        continue;
      }
      if (is24HourUrineUricAcid) {
        assert.match(newHtml, /URIC ACID, 24-HOUR URINE/);
        assert.match(newHtml, /data-report-content="urine-uric-acid-24-hour"/);
        assert.match(newHtml, /aged 18 years or older/);
        continue;
      }
      if (isWoundSwabGram) {
        assert.match(newHtml, /WOUND SWAB - GRAM STAIN/);
        assert.match(newHtml, /data-report-content="wound-swab-gram-stain"/);
        assert.match(newHtml, /do not apply sputum rejection thresholds to a wound swab/);
        continue;
      }
      if (isWoundSwabAfb) {
        assert.match(newHtml, /WOUND SWAB - AFB STAIN/);
        assert.match(newHtml, /data-report-content="wound-swab-afb-stain"/);
        assert.match(newHtml, /a superficial swab is not equivalent to a deep specimen/);
        continue;
      }
      if (isWellWomenProfile) {
        assert.match(newHtml, /WELL WOMEN PROFILE/);
        assert.match(newHtml, /data-report-content="well-women-profile"/);
        assert.match(newHtml, /not a universal screening order for all women/);
        continue;
      }
      if (isWeilFelix) {
        assert.match(newHtml, /WEIL-FELIX TEST/);
        assert.match(newHtml, /data-report-content="weil-felix"/);
        assert.match(newHtml, /very low sensitivity and specificity/);
        continue;
      }
      if (isVanDenBerghReaction) {
        assert.match(newHtml, /VAN DEN BERGH REACTION/);
        assert.match(newHtml, /data-report-content="van-den-bergh-reaction"/);
        assert.match(newHtml, /A qualitative reaction category is not a bilirubin concentration/);
        continue;
      }
      if (isValproateLevel) {
        assert.match(newHtml, /VALPROIC ACID \(VALPROATE\) LEVEL/);
        assert.match(newHtml, /data-report-content="valproate-level"/);
        assert.match(newHtml, /Do not apply the total-drug range to a free result/);
        continue;
      }
      if (isVaginalSwabGram) {
        assert.match(newHtml, /VAGINAL SWAB - GRAM STAIN/);
        assert.match(newHtml, /data-report-content="vaginal-swab-gram-stain"/);
        assert.match(newHtml, /4 - 6: intermediate microbiota/);
        continue;
      }
      if (isVaginalSwabAfb) {
        assert.match(newHtml, /VAGINAL SWAB - AFB STAIN/);
        assert.match(newHtml, /data-report-content="vaginal-swab-afb-stain"/);
        assert.match(newHtml, /A negative smear does not exclude mycobacterial infection or tuberculosis/);
        continue;
      }
      if (isVaginalCervicalSwab) {
        assert.match(newHtml, /VAGINAL \/ CERVICAL SWAB/);
        assert.match(newHtml, /data-report-content="vaginal-cervical-swab"/);
        assert.match(newHtml, /does not imply that both sites were sampled/);
        continue;
      }
      if (isUroflowmetry) {
        assert.match(newHtml, /UROFLOWMETRY/);
        assert.match(newHtml, /data-report-content="uroflowmetry"/);
        assert.match(newHtml, /no curve is generated from these entries/);
        assert.match(newHtml, /not a universal minimum for women or children/);
        continue;
      }
      if (isUrinePh) {
        assert.match(newHtml, /URINE pH/);
        assert.match(newHtml, /data-report-content="urine-ph"/);
        assert.match(newHtml, /pH is dimensionless/);
        assert.match(newHtml, /4.6 - 8.0/);
        continue;
      }
      if (isUrineUrobilinogen) {
        assert.match(newHtml, /URINE UROBILINOGEN/);
        assert.match(newHtml, /data-report-content="urine-urobilinogen"/);
        assert.match(newHtml, /Manufacturer example only/);
        assert.match(newHtml, /small amounts normally appear in urine/);
        continue;
      }
      if (isUrineSugar) {
        assert.match(newHtml, /URINE SUGAR/);
        assert.match(newHtml, /data-report-content="urine-sugar"/);
        assert.match(newHtml, /Do not assume a Benedict-type result identifies glucose alone/);
        continue;
      }
      if (isUrineReducingSubstances) {
        assert.match(newHtml, /URINE REDUCING SUBSTANCES/);
        assert.match(newHtml, /data-report-content="urine-reducing-substances"/);
        assert.match(newHtml, /no concentration is inferred from a reaction colour or plus grade/);
        continue;
      }
      if (isUrineRoutine) {
        assert.match(newHtml, /URINE ROUTINE EXAMINATION \(RE\)/);
        assert.match(newHtml, /data-report-content="urine-routine-examination"/);
        assert.match(newHtml, /PHYSICAL EXAMINATION/);
        assert.match(newHtml, /CHEMICAL EXAMINATION/);
        assert.match(newHtml, /MICROSCOPIC EXAMINATION/);
        continue;
      }
      if (is24HourUrineProtein) {
        assert.match(newHtml, /TOTAL PROTEIN, 24-HOUR URINE/);
        assert.match(newHtml, /data-report-content="urine-protein-24-hour"/);
        assert.match(newHtml, /no result is calculated automatically or extrapolated from partial timing/);
        continue;
      }
      if (isUrineProteinAlbumin) {
        assert.match(newHtml, /URINE PROTEIN \/ ALBUMIN/);
        assert.match(newHtml, /data-report-content="urine-protein-albumin"/);
        assert.match(newHtml, /A grade is not an exact protein concentration/);
        continue;
      }
      if (isUrinePregnancy) {
        assert.match(newHtml, /URINE PREGNANCY TEST \(QUALITATIVE hCG\)/);
        assert.match(newHtml, /data-report-content="urine-pregnancy-test"/);
        assert.match(newHtml, /Testing too early or using dilute urine/);
        continue;
      }
      if (isUrinePorphobilinogen) {
        assert.match(newHtml, /PORPHOBILINOGEN \(PBG\), URINE/);
        assert.match(newHtml, /data-report-content="urine-porphobilinogen"/);
        assert.match(newHtml, /Protect urine from light/);
        continue;
      }
      if (isUrineObtThreeDay) {
        assert.match(newHtml, /URINE OBT \(THREE CONSECUTIVE DAYS\)/);
        assert.match(newHtml, /data-report-content="urine-obt-three-days"/);
        assert.match(newHtml, /not a stool occult blood test/);
        continue;
      }
      if (isUrinaryVma) {
        assert.match(newHtml, /URINARY VMA \(VANILLYLMANDELIC ACID\)/);
        assert.match(newHtml, /data-report-content="urinary-vma"/);
        assert.match(newHtml, /a normal result does not exclude a tumour/);
        continue;
      }
      if (isUrinary17Ketosteroid) {
        assert.match(newHtml, /URINARY 17-KETOSTEROIDS, 24-HOUR URINE/);
        assert.match(newHtml, /data-report-content="urinary-17-ketosteroids"/);
        assert.match(newHtml, /children need their own age-specific intervals/);
        continue;
      }
      if (isRandomUrineUricAcid) {
        assert.match(newHtml, /URIC ACID, RANDOM URINE/);
        assert.match(newHtml, /data-report-content="random-urine-uric-acid"/);
        assert.match(newHtml, /it does not measure 24-hour uric acid excretion/);
        continue;
      }
      if (isUrethralDischargeCulture) {
        assert.match(newHtml, /URETHRAL DISCHARGE - CULTURE & SENSITIVITY/);
        assert.match(newHtml, /data-report-content="urethral-discharge-culture"/);
        assert.match(newHtml, /negative routine bacterial culture does not exclude urethritis/);
        continue;
      }
      if (isUrethralSwabAfb) {
        assert.match(newHtml, /URETHRAL SWAB - AFB STAIN/);
        assert.match(newHtml, /data-report-content="urethral-swab-afb-stain"/);
        assert.match(newHtml, /A negative smear does not exclude mycobacterial infection/);
        continue;
      }
      if (isActh || isAda || isDnph || isDiabeticProfile || isExtendedDiabeticProfile || isDiabeticRenalProfile || isEarSwabGramStain || isEarSwabAfbStain || isFshPrl || isFshLhPrl || isLhPrl || isFemaleInfertilityProfile || isFernTest || isWuchereriaBancroftiAntigen || isFilariaAntigen || isFluidAspirationCytology || isFoetalHaemoglobinByHplc || isFoetalHaemoglobin || isFreeBetaHcg || isFreeCholesterol || isFreeEstradiol || isFreePsa || isFreeTestosterone || isGgt || isGad65Antibody || isGh90MinutesAfterGlucose || isGhFastingGlucose || isGrowthHormone || isGlucoseToleranceTest || isGastrinLevel || isFungusCulture || isFungusCultureSensitivity || isFactorIiMutation || isFactorViiiImmunodepleted || isAfbZiehlNeelsen || isCsfFluidAfbStain || isCsfFluidGramStain || isJointFluidGramStain || isCsfFluidProtein || isCsfFluidSpecificGravity || isCsfFluidGlucose || isUrineCalcium24Hour || isUrineCopper24Hour || isRandomUrineCopper || isEveningCortisol || isMidnightCortisol || isMorningEveningCortisol || isMorningCortisol || isMorningEveningMidnightCortisol || isCryoglobulinsScreening || isGndCulture || isCysticFibrosisGeneMutation || isCapillaryFragility || isCardiacProfile || isColorectalCancerMonitorProfile || isCeruloplasmin || isCervicalPapSmear || isCervicalSwabGramStain || isCervicalSwabAfbStain || isCDiffToxin || isTotalCholesterol || is24HourUrineChloride || isSerumChloride || isRandomUrineChloride || isChlamydiaAntigen || isChlamydiaAntibodyIggIgm || isChikungunyaIgm || isChikungunyaIgg || isAlbertStainKlb || isThrombinTime || isBaccalSmearBrrBody || isAutoimmuneProfile || isAgRatio || isAnfQualitative || isProstaticAcidPhosphatase || isTotalAcidPhosphatase || isUrineAlcohol || isAldehydeTest || isAldosterone || isBloodAllergy || isDrugAllergy || isRandomUrineAlphaAmylase || isTimedUrineAmylase || isAmmonia || isAndrogenPanel || isAndrostenedione || isComprehensiveAnemia || isAnemiaScreening || isAntenatalProfile || isAntiTpo || isAntiTg || isAntiInsulinAntibody || isAntiLeptospiraAntibody || isAntiMicrosomalAntibody || isAntiDsDnaAntibody || isAntiSsDnaAntibody || isAntiHistoneAntibody || isAntiRibosomalPAntibody || isAntiCcpAb || isAntiSpermAntibody || isApolipoproteinA1 || isUrineArsenic || isArthritisProfile || isAsciticFluidGramStain || isAnticardiolipinIggIgm || isAnticardiolipinIgaIgg || isAnticardiolipinIgaIgm || isAnticardiolipinIga || isAnticardiolipinIgg || isAnticardiolipinIgm || isApolipoproteinB || isAsciticFluidAnalysis || isSerumBicarbonate || isBilirubinFractionation || isMediumSectionBiopsy || isSmallSectionBiopsy || isBloodCultureSensitivity || isBodyFluidCultureSensitivity || isBodyFluidTotalProtein || isCsfFluidChloride || isBodyFluidChloride || isBodyFluidBiochemistry || isBodyFluidSpecificGravity || isComplementC3 || isComplementC4 || isCancaAntiPr3 || isCreatinineClearance || isCd3Lymphocyte || isCd4Lymphocyte || isCd8Lymphocyte || isCea || isCft || isBilateralConjunctivalSwab || isRightConjunctivalSwabCulture || isConjunctivalSwabCulture || isCkMb || isCpk || isCpkWithCkMb || isCmvIgmIgg || isCmvIgg || isBronchialWashingCultureSensitivity || isBoneMarrowAspirationCytology || isBoneMarrowCytology) {
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
        if (isJointFluidGramStain) {
          assert.match(newHtml, /GRAM STAIN, JOINT FLUID/);
          assert.match(newHtml, /data-report-content="joint-fluid-gram-stain"/);
          assert.match(newHtml, /A negative joint-fluid Gram stain does not exclude infection/);
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
        if (isJointFluidProtein) {
          assert.match(newHtml, /TOTAL PROTEIN, JOINT FLUID/);
          assert.match(newHtml, /data-report-content="joint-fluid-protein"/);
          assert.match(newHtml, /serum and pleural-fluid protein thresholds must not be applied directly to synovial fluid/i);
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
        if (isPhospholipidAntibodyIgg) {
          assert.match(newHtml, /ANTICARDIOLIPIN ANTIBODY IgG, SERUM/);
          assert.match(newHtml, /at least 12 weeks later/);
          assert.match(newHtml, /not a stand-alone diagnostic rule/);
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
        if (isThrombinTime) {
          assert.match(newHtml, /THROMBIN TIME \(TT\)/);
          assert.match(newHtml, /thrombin-time-table/);
          assert.match(newHtml, /heparin or direct thrombin-inhibitor effect/);
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
      if (['serumosmolality', 'osmolalityserum', 'osmolality'].includes(normalizedInputName)) {
        assert.match(newHtml, /OSMOLALITY, SERUM/);
        assert.match(newHtml, /data-report-content="serum-osmolality"/);
        assert.match(newHtml, /Freezing-point depression osmometry/);
        assert.doesNotMatch(newHtml, /Latex Agglutination/);
        continue;
      }
      if (['throatswabculturesensitivity', 'throatswabcultureandsensitivity', 'throatcultureandsensitivity', 'throatswabcs', 'throatculturesensitivity'].includes(normalizedInputName)) {
        assert.match(newHtml, /THROAT SWAB CULTURE & SENSITIVITY/);
        assert.match(newHtml, /data-report-content="throat-swab-culture-sensitivity"/);
        assert.match(newHtml, /Antimicrobial susceptibility result\(s\), if performed/);
        assert.match(newHtml, /Susceptibility findings do not replace clinical assessment/);
        continue;
      }
      if (['throatswabforafb', 'throatswabafbstain', 'throatafbstain', 'afbstainthroatswab'].includes(normalizedInputName)) {
        assert.match(newHtml, /AFB STAIN, THROAT SWAB/);
        assert.match(newHtml, /data-report-content="throat-swab-afb-stain"/);
        assert.match(newHtml, /A negative smear does not exclude mycobacterial infection/);
        continue;
      }
      if (['throatswabforgramstain', 'throatswabgramstain', 'throatgramstain', 'gramstainthroatswab'].includes(normalizedInputName)) {
        assert.match(newHtml, /THROAT SWAB - GRAM STAIN/);
        assert.match(newHtml, /data-report-content="throat-swab-gram-stain"/);
        assert.match(newHtml, /does not provide definitive organism identification or antimicrobial susceptibility/);
        continue;
      }
      if (['sputumafbstain', 'sputumexaminationafb', 'sputumafbexamination'].includes(normalizedInputName)) {
        assert.match(newHtml, /SPUTUM EXAMINATION, AFB/);
        assert.match(newHtml, /data-report-content="sputum-afb-stain"/);
        assert.match(newHtml, /A positive smear is not species-specific/);
        assert.match(newHtml, /A negative smear does not exclude tuberculosis/);
        continue;
      }
      if (['stoolobt', 'stooloccultbloodtest', 'faecaloccultbloodtest', 'fecaloccultbloodtest', 'occultbloodstoolexamination', 'stooloccultblood', 'stooloccultbloodexamination'].includes(normalizedInputName)) {
        assert.match(newHtml, /STOOL OCCULT BLOOD TEST \(OBT\)/);
        assert.match(newHtml, /data-report-content="stool-occult-blood"/);
        assert.match(newHtml, /does not identify the source of bleeding/);
        assert.match(newHtml, /commonly colonoscopy/);
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
