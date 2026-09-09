const { isUntouchedPlaceholder } = require('./reportCombinationRepair');
const normalize = value => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const parameter = (parameterName, unit = '', normalRange = '') => ({
  parameterName, unit, normalRange, entryMode: 'manual', calculationFormula: null, calculationPrecision: 2,
});

const fluidParameters = () => [
  parameter('Specimen / Site'),
  parameter('Total Nucleated Cell Count', 'cells/µL'),
  parameter('Red Blood Cell Count', 'cells/µL'),
  parameter('Differential / Cell Types'),
  parameter('Microscopic Findings'), parameter('Impression'), parameter('Comments'),
];
const fluidContent = {
  use: 'Fluid cell counts and cell-type assessment describe the cellular content of the submitted specimen. Interpret them with the fluid source and clinical findings.',
  rows: [
    ['Nucleated cells', 'The concentration of nucleated cells in the fluid.'],
    ['Red cells', 'Describe the red-cell content; blood in the sample can affect interpretation.'],
    ['Differential / morphology', 'Describe the types and appearance of cells examined. These findings do not establish a diagnosis by themselves.'],
  ],
  referenceNote: 'Reference intervals depend on the fluid source and method. Use the laboratory-approved interval for this specimen; blood and CSF intervals must not be substituted for other body fluids.',
  note: 'Record the collection site and any specimen limitations. A cell-count report is not a substitute for cytology, culture or other investigations when clinically indicated.',
  sources: ['https://www.mayocliniclabs.com/test-catalog/Overview/608873'],
};

// Exact catalogue identities only. Specimens are documented in import_batch_1,
// import_batch_2, import_batch_3, import_batch_4 and import_batch_14 respectively.
const CELL_REPORT_DEFINITIONS = [
  {
    key: 'abnormal-cells', names: ['Abnormal Cells'], sampleType: 'Blood',
    specimens: ['blood', 'wholeblood', 'edtablood', 'edtawholeblood'],
    parameters: [parameter('Abnormal Cells', '', 'No abnormal cells seen'), parameter('Microscopic Findings'), parameter('Impression'), parameter('Comments')],
    content: {
      use: 'Blood-cell morphology assessment describes unusual cells and supports interpretation of the blood count. Findings are assessed with the clinical history and other laboratory results.',
      rows: [
        ['Not seen', 'No abnormal cells identified in the material examined. This is a qualitative observation, not a percentage or an exclusion of every blood disorder.'],
        ['Seen', 'Describe the cells and their morphology in the findings section. Further review or testing may be needed to characterize them.'],
        ['Limited assessment', 'Document specimen or examination limitations rather than reporting a negative finding without adequate review.'],
      ],
      qualitative: true,
      note: 'The expected qualitative finding is no abnormal cells seen. This is reference guidance, not an automatically assigned patient result. A blood-film assessment alone does not establish a diagnosis.',
      sources: ['https://medlineplus.gov/lab-tests/blood-smear/'],
    },
  },
  {
    key: 'ascitic-cell-count', names: ['Ascitic Fluids (Cell Type & Cell Count)'],
    sampleType: 'Ascitic Fluid', specimens: ['asciticfluid', 'peritonealfluid'],
    parameters: fluidParameters(), content: fluidContent,
  },
  {
    key: 'body-fluid-cell-count', names: ['BodyFluids (Cell Type&Cell Count)'],
    sampleType: 'Body fluid', specimens: ['bodyfluid', 'asciticfluid', 'peritonealfluid', 'pleuralfluid', 'pericardialfluid', 'jointfluid', 'synovialfluid'],
    parameters: fluidParameters(), content: fluidContent,
  },
  {
    key: 'csf-cell-count', names: ['CSFFluid forCell Type &Cell Count'],
    sampleType: 'CSF', specimens: ['csf', 'cerebrospinalfluid'],
    parameters: fluidParameters(),
    content: {
      use: 'CSF cell-count and cell-type assessment examines the cellular content of cerebrospinal fluid. The findings contribute to evaluation of conditions affecting the central nervous system.',
      referenceNote: 'Use CSF-specific, age-appropriate laboratory intervals. Do not apply blood or other body-fluid intervals to CSF.',
      note: 'Interpret the cell findings with the clinical presentation and other CSF investigations that were actually performed. This cell-count test does not include or replace CSF chemistry, microbiology or cytology.',
      sources: ['https://medlineplus.gov/lab-tests/cerebrospinal-fluid-csf-analysis/'],
    },
  },
  {
    key: 'joint-fluid-cell-count', names: ['Joint Fluid for Cell Count & Cell Type'],
    sampleType: 'Joint Fluid', specimens: ['jointfluid', 'synovialfluid'],
    parameters: fluidParameters(), content: fluidContent,
  },
];

function getCellReportDefinition(test = {}) {
  const name = normalize(test?.name);
  const specimen = normalize(test?.sample_type || test?.sampleType);
  return CELL_REPORT_DEFINITIONS.find(d => d.names.some(alias => normalize(alias) === name)
    && (!specimen || d.specimens.includes(specimen))) || null;
}

function getCellReportParameters(test) {
  return getCellReportDefinition(test)?.parameters.map(p => ({ ...p })) || null;
}

// Only preview routes call this. Production results remain entirely staff-entered.
function getCellReportPreviewValue(test, field = {}) {
  const definition = getCellReportDefinition(test);
  if (!definition) return null;
  const name = normalize(field.parameterName || field.parameter_name);
  const samples = {
    abnormalcells: 'Sample observation — enter reviewed findings',
    specimen: definition.sampleType, specimensite: definition.sampleType,
    totalnucleatedcellcount: 'Sample count', redbloodcellcount: 'Sample count',
    differentialcelltypes: 'Sample cell types and differential findings',
    microscopicfindings: 'Sample description of the cells examined',
    impression: 'Sample interpretation of the examination', comments: 'Sample comment',
  };
  return samples[name] ?? null;
}

async function repairCellReportSchemas(db) {
  return db.transaction(async () => {
    await db.run(`CREATE TABLE IF NOT EXISTS cell_report_schema_backups (
      test_id INTEGER PRIMARY KEY, test_name TEXT NOT NULL, old_sample_type TEXT,
      old_parameters_json TEXT NOT NULL, replacement_parameters_json TEXT NOT NULL,
      repaired_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
    const tests = await db.all('SELECT id,name,sample_type,category,report_body FROM tests WHERE active=1');
    const repaired = [];
    for (const test of tests) {
      const definition = getCellReportDefinition(test);
      if (!definition || String(test.category || '').trim().toLowerCase() !== 'imported legacy catalogue'
        || String(test.report_body || '').trim()) continue;
      const used = await db.get(`SELECT 1 AS found WHERE
        EXISTS (SELECT 1 FROM visit_tests WHERE test_id=?) OR
        EXISTS (SELECT 1 FROM test_bundle_items WHERE bundle_test_id=? OR component_test_id=?)`, [test.id, test.id, test.id]);
      if (used || await db.get('SELECT test_id FROM cell_report_schema_backups WHERE test_id=?', [test.id])) continue;
      const old = await db.all('SELECT * FROM test_parameters WHERE test_id=? ORDER BY display_order,id', [test.id]);
      if (old.length && !isUntouchedPlaceholder(old)) continue;
      await db.run(`INSERT INTO cell_report_schema_backups
        (test_id,test_name,old_sample_type,old_parameters_json,replacement_parameters_json) VALUES (?,?,?,?,?)`,
      [test.id, test.name, test.sample_type, JSON.stringify(old), JSON.stringify(definition.parameters)]);
      for (const p of old) await db.run('DELETE FROM test_parameters WHERE id=? AND test_id=?', [p.id, test.id]);
      for (const [index, p] of definition.parameters.entries()) {
        await db.run(`INSERT INTO test_parameters
          (test_id,parameter_name,unit,normal_range,entry_mode,calculation_formula,calculation_precision,display_order)
          VALUES (?,?,?,?,?,?,?,?)`, [test.id, p.parameterName, p.unit, p.normalRange, p.entryMode, null, p.calculationPrecision, index + 1]);
      }
      if (!String(test.sample_type || '').trim()) await db.run('UPDATE tests SET sample_type=? WHERE id=?', [definition.sampleType, test.id]);
      repaired.push(test.id);
    }
    return repaired;
  });
}

module.exports = { CELL_REPORT_DEFINITIONS, getCellReportDefinition, getCellReportParameters, getCellReportPreviewValue, repairCellReportSchemas };
