// CONTENT only: reuse the formatter's existing CSS and preserve bespoke notes.
// Numeric intervals are lab-owned parameter data, never website defaults.
const { CELL_REPORT_DEFINITIONS } = require('./cellReportService');
const normalize = value => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const medline = slug => `https://medlineplus.gov/lab-tests/${slug}/`;
const rangeNote = 'Compare with the laboratory interval and unit alongside each result. Intervals depend on the assay and patient population; adult intervals may not apply to children or pregnancy. An out-of-range result is not, by itself, a diagnosis.';
const REPORT_CONTENT = [
  ...CELL_REPORT_DEFINITIONS.map(definition => ({
    key: definition.key, names: definition.names, specimens: definition.specimens,
    allowMissingSpecimen: true, exactSpecimens: true, ...definition.content,
  })),
  {
    key: 'thyroid-function',
    names: ['FT3 (Free Tri-iodothyronine)', 'FT4 (Free Thyroxine)', 'FT3 & TSH', 'FT4 & TSH', 'FT3, FT4 & TSH', 'T3&TSH', 'T3,T4&TSH', 'T4&TSH'],
    codes: ['FT3001', 'FT4001', 'FT3TSH001', 'FT4TSH001', 'FT3FT4TSH001'], specimens: ['serum', 'plasma'],
    use: 'Thyroid hormones and TSH are assessed together to investigate thyroid function and monitor treatment. Free hormone measurements represent the unbound fraction and are not interchangeable with total T3 or total T4.',
    rows: [
      ['TSH', 'A raised TSH commonly accompanies primary underactive thyroid function; a suppressed TSH commonly accompanies overactive function. Other thyroid measurements are needed to evaluate the pattern.'],
      ['Free T4', 'Interpret with TSH. Low free T4 with a non-raised TSH needs clinical assessment, including consideration of pituitary disease.'],
      ['T3 / Free T3', 'T3 testing can help evaluate suspected overactive thyroid function. A normal T3 does not exclude hypothyroidism.'],
      ['Total T3 / Total T4', 'Binding-protein changes, including those associated with pregnancy or medicines, can alter total hormone concentrations.'],
    ],
    note: 'These explanations are not a diagnosis from this report. Interpret only the analytes actually measured. Tell the clinician about thyroid medicines and biotin supplements, which can affect interpretation or some assays.',
    sources: ['https://www.niddk.nih.gov/health-information/diagnostic-tests/thyroid', 'https://www.thyroid.org/thyroid-function-tests/'],
  },
  {
    key: 'blood-count-combinations',
    names: ['Hb&ESR', 'Hb,TC&DC', 'Hb,TC,DC&ESR', 'Hb.TC,DC&MP', 'Hb,TC,DC&PCV', 'Hb,TC,DC,ESR&PlateletCount'],
    specimens: ['blood', 'wholeblood', 'edtawholeblood'],
    use: 'This combination reports only the blood-count components requested. Hemoglobin assesses oxygen-carrying capacity; the white-cell count and differential describe immune cells. Platelets and hematocrit are included only when ordered.',
    rows: [
      ['Hemoglobin / hematocrit', 'Low values may accompany anemia. Hydration and other clinical factors can also affect these measurements.'],
      ['White cells / differential', 'Changes can occur with infection, inflammation, medicines or blood disorders; the pattern is not specific to one cause.'],
      ['ESR, if included', 'A non-specific indicator of inflammation; it does not identify the cause or location.'],
    ],
    note: 'Interpret the included results with symptoms, medicines, prior counts and, when indicated, blood-film findings. Age- and sex-appropriate intervals are important.',
    sources: [medline('complete-blood-count-cbc'), medline('erythrocyte-sedimentation-rate-esr')],
  },
  {
    key: 'iron-tibc', names: ['Iron&TIBC'], specimens: ['serum', 'plasma'],
    use: 'Serum iron measures circulating iron. Total iron-binding capacity (TIBC) reflects the blood proteins available to bind and transport iron. Together they support assessment of iron deficiency or excess.',
    rows: [['Serum iron', 'Varies during the day and should not be used alone to assess iron stores.'], ['TIBC', 'Interpret with serum iron and, when available, ferritin and the blood count.']],
    note: 'Supplements, medicines and collection time can influence results. A single result does not establish the cause of anemia or iron overload.',
    sources: [medline('iron-tests')],
  },
  {
    key: 'phosphorus', names: ['Phosphorus (Serum)'], codes: ['PHOSPHORUS'], specimens: ['serum', 'plasma'],
    use: 'Phosphorus testing supports assessment of mineral balance, kidney function and parathyroid-related disorders.',
    rows: [['Increased', 'May occur with impaired kidney excretion or reduced parathyroid activity.'], ['Decreased', 'May occur with reduced intake or absorption, or increased parathyroid activity.']],
    note: 'Interpret with calcium, renal function and, when indicated, vitamin D and parathyroid hormone. Children can have higher physiological values than adults.',
    sources: [medline('phosphate-in-blood')],
  },
  {
    key: 'alkaline-phosphatase', names: ['ALP (Alkaline Phosphatase)'], codes: ['ALP'], specimens: ['serum', 'plasma'],
    use: 'Alkaline phosphatase (ALP) is an enzyme associated principally with liver/biliary and bone activity.',
    rows: [['Increased', 'May reflect a liver/biliary or bone process. This test alone does not identify the tissue source.'], ['Further correlation', 'Other liver tests or ALP isoenzymes can help assess the source when indicated.']],
    note: 'Growing children and pregnancy can have higher ALP values. Interpret using the appropriate age and pregnancy context, rather than an adult interval alone.',
    sources: [medline('alkaline-phosphatase')],
  },
  {
    key: 'electrolytes', names: ['Sodium (Serum)', 'Chloride (Serum)'], codes: ['SODIUM', 'CHLORIDE'], specimens: ['serum', 'plasma'],
    use: 'Sodium and chloride contribute to fluid balance and normal nerve and muscle function. Chloride also contributes to acid-base balance.',
    rows: [['Abnormal concentration', 'May accompany fluid loss or retention, kidney disorders, or medication effects.'], ['Interpretation', 'Assess with hydration status, renal function and other electrolytes; one measurement does not identify the cause.']],
    note: 'Use the specimen type and unit stated with the result. Serum/plasma intervals must not be applied to urine measurements.',
    sources: [medline('electrolyte-panel')],
  },
  {
    key: 'creatinine-serum', names: ['Creatinine (Serum)'], codes: ['CREATININE'], specimens: ['serum', 'plasma'],
    use: 'Creatinine is a muscle-derived waste product cleared by the kidneys. Blood creatinine supports assessment of kidney filtration.',
    rows: [['Increased', 'Can accompany reduced filtration; dehydration, muscle injury, diet and medicines may also influence the value.'], ['Within interval', 'Does not exclude early kidney disease. Interpret with eGFR and urine albumin assessment when available.']],
    note: 'Muscle mass, age and activity influence creatinine. Use trends and clinical context; a single measurement cannot establish chronic kidney disease.',
    sources: [medline('creatinine-test')],
  },
  {
    key: 'creatinine-urine-24h', names: ['Creatinine, 24-Hour Urine'], codes: ['CREATININE_24H_URINE'], specimens: ['urine'],
    use: 'Timed urine creatinine measures excretion during the stated collection period. It can contribute to a clearance assessment when paired with blood measurements.',
    note: 'Interpretation depends on a complete timed collection. A urine concentration and an amount excreted per 24 hours are different measurements; compare matching units. Muscle mass and incomplete collection can affect the result.',
    sources: [medline('creatinine-test')],
  },
  {
    key: 'uric-acid-serum', names: ['Uric Acid'], codes: ['URIC_ACID'], specimens: ['serum', 'plasma'],
    use: 'Uric acid is formed during purine breakdown and is mainly cleared through the kidneys. Measurement may support assessment of gout, stone risk or increased cell breakdown.',
    rows: [['Increased', 'May reflect increased production or reduced excretion. Not everyone with a high result has gout.'], ['Clinical correlation', 'Diagnosis and treatment decisions require symptoms, history and other relevant investigations.']],
    note: 'Diet, medicines and renal function can influence results. A reference interval is not the same as an individual treatment target.',
    sources: [medline('uric-acid-test')],
  },
  {
    key: 'bilirubin-indirect', names: ['Indirect Bilirubin'], codes: ['PF015'], specimens: ['serum', 'plasma'],
    use: 'Bilirubin is produced during red-cell breakdown and processed by the liver. Indirect bilirubin is the unconjugated fraction.',
    note: 'Interpret with total/direct bilirubin, other liver tests and the blood count when indicated. Changes can reflect altered red-cell breakdown or liver processing. Newborn bilirubin assessment needs age-specific evaluation; adult intervals are unsuitable.',
    sources: [medline('bilirubin-blood-test')],
  },
  {
    key: 'metabolic-panel', names: ['Comprehensive Metabolic Panel (CMP)'], codes: ['PF016'], specimens: ['serum', 'plasma'],
    use: 'A metabolic panel brings together measurements relevant to glucose metabolism, kidney function, liver function and fluid/electrolyte balance.',
    note: 'Interpret the pattern across the components actually reported, with fasting status, medicines and clinical findings. An isolated abnormality may need confirmation or further testing and is not a diagnosis on its own.',
    sources: [medline('comprehensive-metabolic-panel-cmp')],
  },
  {
    key: 'renal-panel', names: ['Kidney Function Test (KFT)'], codes: ['KFT001'], specimens: ['serum', 'plasma'],
    use: 'The reported chemistry measurements support assessment of renal function and related mineral/electrolyte balance. Interpret creatinine alongside eGFR and urine albumin testing when available.',
    note: 'Normal blood creatinine does not exclude early kidney disease. Muscle mass, hydration, diet and medicines may influence results; changes over time and the clinical history are important.',
    sources: [medline('creatinine-test'), medline('electrolyte-panel')],
  },
  {
    key: 'ionized-calcium', names: ['Ionized Calcium (iCalcium)'], codes: ['ICALCIUM'], specimens: ['serum', 'plasma', 'wholeblood'],
    use: 'Ionized calcium measures the free, biologically active calcium fraction. It is a different measurement from total calcium.',
    note: 'Interpret with the clinical picture and relevant kidney/parathyroid investigations. Compare with the interval for ionized calcium, not a total-calcium interval.',
    sources: [medline('calcium-blood-test')],
  },
  {
    key: 'urine-glucose', names: ['Urine Glucose'], codes: ['PF055'], specimens: ['urine'],
    use: 'Urine glucose testing detects glucose lost in urine. Urine normally contains little or no glucose.',
    rows: [['Detected / increased', 'May accompany raised blood glucose or altered renal glucose handling; pregnancy and some medicines also affect results.'], ['Not detected', 'Does not exclude diabetes or a raised blood glucose concentration.']],
    note: 'Urine glucose alone cannot diagnose diabetes. Correlate with blood glucose testing when indicated.',
    sources: [medline('glucose-in-urine-test')],
  },
  {
    key: 'arterial-blood-gas', names: ['Blood Gas Analysis, Arterial'], codes: ['ABG'], specimens: ['arterialblood'],
    use: 'Arterial blood gases assess oxygenation, ventilation and acid-base balance.',
    rows: [['pH', 'Describes how acidic or alkaline the blood is.'], ['PaCO2 and bicarbonate', 'Help assess respiratory and metabolic contributions to acid-base balance.'], ['PaO2 / oxygen saturation', 'Support assessment of oxygen transfer into arterial blood.']],
    note: 'Interpret together with oxygen therapy, respiratory status and clinical findings. Arterial and venous gas results are not interchangeable.',
    sources: [medline('arterial-blood-gas-abg-test')],
  },
  {
    key: 'liver-panel-ggt', names: ['LFT With GGT'], specimens: ['serum', 'plasma'],
    use: 'Liver chemistry tests assess several different processes, including enzyme release, bilirubin handling and protein production. Interpret the pattern across the reported components.',
    rows: [['ALT / AST', 'Enzyme changes can accompany liver-cell injury, but do not identify its cause.'], ['ALP / GGT', 'Together with other findings, may help assess a biliary pattern; raised ALP can also come from bone.'], ['Bilirubin / albumin', 'Provide complementary information about bilirubin processing and protein balance.']],
    note: 'Medicines and other health conditions can influence liver tests. A single abnormal value does not establish a liver diagnosis; follow-up depends on the clinical context.',
    sources: [medline('liver-function-tests'), medline('alkaline-phosphatase')],
  },
  {
    key: 'semen-analysis', names: ['Semen Analysis - Seminogram'], codes: ['SEMEN001'], specimens: ['semen'],
    use: 'Semen analysis assesses sperm quantity, movement and morphology together with the physical characteristics of the sample.',
    rows: [['Count / concentration', 'Describe sperm quantity in the whole ejaculate or per unit volume; these are different measurements.'], ['Motility / morphology', 'Describe sperm movement and shape and are interpreted with the other semen measurements.']],
    note: 'One abnormal sample does not prove infertility. Results vary between collections; abstinence period, completeness of collection and delivery time matter. Post-vasectomy assessment requires its own clinical protocol.',
    referenceNote: 'Use the method-specific reference limits supplied for each measurement. Fertility is not determined by a single numerical cutoff; interpret the complete analysis with the clinical history.',
    sources: [medline('semen-analysis')],
  },
  {
    key: 'csf-analysis', names: ['Cerebrospinal Fluid (CSF) Analysis'], codes: ['CSF001'], specimens: ['csf', 'cerebrospinalfluid'],
    use: 'CSF analysis assesses the fluid surrounding the brain and spinal cord. Cell counts, chemistry and microbiology provide complementary information.',
    rows: [['Cells / appearance', 'May help evaluate inflammation, infection or bleeding, but require clinical correlation.'], ['Protein / glucose', 'Interpret with other CSF findings and relevant blood measurements. CSF glucose is related to the blood glucose concentration.']],
    note: 'The combination of findings, specimen quality and clinical presentation guides interpretation. No single CSF measurement identifies every cause; additional microbiological or other testing may be needed.',
    sources: [medline('cerebrospinal-fluid-csf-analysis')],
  },
  {
    key: 'koh-microscopy', names: ['Fungus Routine, KOH Preparation'], codes: ['KOH'], specimens: ['skinnail', 'skin', 'nail'],
    use: 'KOH preparation clears cellular material so the sample can be examined microscopically for fungal elements.',
    rows: [['Fungal elements seen', 'Supports a fungal process in the sampled material; interpret with the site and clinical appearance.'], ['No fungal elements seen', 'No fungal structures identified in the material examined. Uncertain findings may require further investigation.']],
    note: 'The expected qualitative finding is absence of fungal elements, not a numerical reference interval. Microscopy is not a drug-susceptibility test.',
    qualitative: true, sources: ['https://medlineplus.gov/ency/article/003761.htm'],
  },
  {
    key: 'hav-igg', names: ['Anti HAV (Hepatitis A Virus)'], specimens: ['serum', 'plasma'],
    requiredParameter: 'Anti HAV, IgG, SERUM',
    use: 'Anti-HAV IgG assesses antibodies associated with previous hepatitis A infection or vaccination.',
    rows: [['Positive IgG', 'Indicates immunity from past infection or vaccination; IgG alone does not establish acute hepatitis A.'], ['Negative IgG', 'No IgG detected by this assay. Assess suspected recent infection with the appropriate acute-infection tests.']],
    note: 'Use the assay-specific cutoff stated with the result. Acute hepatitis A assessment uses IgM anti-HAV or HAV RNA in the appropriate clinical setting; IgG and IgM results are not interchangeable.',
    qualitative: true, sources: ['https://www.cdc.gov/hepatitis-a/hcp/diagnosis-testing/index.html'],
  },
  {
    key: 'afb-culture', names: ['AFB Culture & Sensitivity'], codes: ['AFBCULTURESENS'],
    use: 'Mycobacterial culture investigates organisms that may include Mycobacterium tuberculosis complex and non-tuberculous mycobacteria. Identification establishes the organism recovered.',
    rows: [['No growth', 'No organism recovered under the reported culture conditions. A negative culture does not completely exclude tuberculosis.'], ['Growth detected', 'Interpret with organism identification; acid-fast organisms are not all M. tuberculosis.'], ['Susceptibility', 'Use findings for the identified organism. An unreported drug must not be assumed susceptible.']],
    note: 'Correlate with the specimen, microscopy, molecular tests and clinical findings. A preliminary culture result is not a final culture result.',
    qualitative: true, allowExistingComment: true,
    sources: ['https://www.cdc.gov/tb/hcp/testing-diagnosis/clinical-and-laboratory-diagnosis.html'],
  },
];

function getReportContent(test = {}) {
  if (!test) return null;
  const name = normalize(test.name), code = normalize(test.code), specimen = normalize(test.sample_type);
  return REPORT_CONTENT.find(entry =>
    (entry.names.some(alias => normalize(alias) === name) || (code && (entry.codes || []).some(alias => normalize(alias) === code)))
    && (!entry.specimens || (!specimen && entry.allowMissingSpecimen)
      || entry.specimens.some(allowed => entry.exactSpecimens ? specimen === allowed : specimen.startsWith(allowed)))
    && (!entry.requiredParameter || (test.parameters || []).some(p => normalize(p.parameter_name) === normalize(entry.requiredParameter)))) || null;
}

function escapeHtml(value) {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

function buildSupplementaryNotes(test, content = getReportContent(test)) {
  if (!content || String(test.report_body || '').trim()) return '';
  const names = (test.parameters || []).map(p => normalize(p.parameter_name));
  const contains = expression => names.some(name => expression.test(name));
  let rows = content.rows || [];
  if (content.key === 'thyroid-function') {
    rows = rows.filter((row, index) => [
      contains(/^(tsh|thyroidstimulating)/), contains(/^(ft4|freet4|freethyroxine)/),
      contains(/^(t3|ft3|freet3|triiodothyronine)/), contains(/^(t3total|t4total|totalt3|totalt4)/),
    ][index]);
  }
  if (content.key === 'blood-count-combinations') {
    rows = rows.filter((row, index) => [contains(/^(hb|hemoglobin|haemoglobin|hct|pcv)/), contains(/(leucocyte|leukocyte|neutrophil)/), contains(/^esr/)][index]);
  }
  return `<div class="single-analyte-notes" data-report-content="${escapeHtml(content.key)}">
    <div class="report-note-heading">Clinical use:</div><p>${escapeHtml(content.use)}</p>
    ${rows.length ? `<div class="report-note-heading">Interpretation guide:</div>
      <table class="notes-table"><thead><tr><th>Measurement / finding</th><th>Explanation</th></tr></thead><tbody>
      ${rows.map(row => `<tr>${row.map(cell => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('')}
      </tbody></table>` : ''}
    ${content.qualitative ? '' : `<div class="report-note-heading">Reference values:</div><p>${escapeHtml(content.referenceNote || rangeNote)}</p>`}
    <div class="report-note-heading">Notes and limitations:</div><p>${escapeHtml(content.note)}</p>
  </div>`;
}

function supplementReportHtml(html, test) {
  const content = getReportContent(test);
  if (!content || String(test.report_body || '').trim()) return html;
  const body = html.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
  if (/data-report-content=/.test(body)) return html;
  const hasNotes = /class="[^"]*(?:\b[\w-]*notes\b|\b[\w-]*interpretation[\w-]*\b)/i.test(body);
  if (hasNotes && !content.allowExistingComment) return html;
  return html.replace('<!-- supplemental-report-content -->', buildSupplementaryNotes(test, content));
}

module.exports = { REPORT_CONTENT, getReportContent, buildSupplementaryNotes, supplementReportHtml };
