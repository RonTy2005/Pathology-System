// Only explicitly named combinations can inherit component definitions. Names
// such as "renal profile" and assay variants such as US-TSH are not guessed.
const normalize = value => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const COMBINATIONS = [
  { name: 'T3&TSH', specimen: 'Serum', codes: ['T3TOTAL001', 'TSH001'] },
  { name: 'T3,T4&TSH', specimen: 'Serum', codes: ['T3TOTAL001', 'T4TOTAL001', 'TSH001'] },
  { name: 'T4&TSH', specimen: 'Serum', codes: ['T4TOTAL001', 'TSH001'] },
  { name: 'Iron&TIBC', specimen: 'Serum', codes: ['IRON', 'TIBC'] },
  { name: 'Hb&ESR', specimen: 'Whole Blood', codes: ['HBX3289', 'ESR7260'] },
  { name: 'Hb,TC&DC', specimen: 'Whole Blood', codes: ['HBX3289', 'TLC', 'DLC1003'] },
  { name: 'Hb,TC,DC&ESR', specimen: 'Whole Blood', codes: ['HBX3289', 'TLC', 'DLC1003', 'ESR7260'] },
  { name: 'Hb.TC,DC&MP', specimen: 'Whole Blood', codes: ['HBX3289', 'TLC', 'DLC1003', 'MALARIAMP'] },
  { name: 'Hb,TC,DC&PCV', specimen: 'Whole Blood', codes: ['HBX3289', 'TLC', 'DLC1003', 'HCT'] },
  { name: 'Hb,TC,DC,ESR&PlateletCount', specimen: 'Whole Blood', codes: ['HBX3289', 'TLC', 'DLC1003', 'ESR7260', 'PLT1001'] },
];

function isUntouchedPlaceholder(parameters) {
  return parameters.length > 0 && parameters.every(p =>
    /^(result|result\s*\/\s*findings|comments)$/i.test(String(p.parameter_name || '').trim())
    && !String(p.normal_range || '').trim() && !String(p.unit || '').trim()
    && (!p.entry_mode || p.entry_mode === 'manual') && !p.calculation_formula);
}

function getCombinationDefinition(test) {
  return COMBINATIONS.find(definition => normalize(definition.name) === normalize(test?.name)) || null;
}

async function repairKnownCombinationSchemas(db) {
  return db.transaction(async () => {
    await db.run(`CREATE TABLE IF NOT EXISTS report_schema_repair_backups (
      test_id INTEGER PRIMARY KEY, test_name TEXT NOT NULL,
      old_sample_type TEXT, old_parameters_json TEXT NOT NULL,
      source_definitions_json TEXT NOT NULL,
      repaired_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
    const tests = await db.all('SELECT id,name,code,category,sample_type,report_body FROM tests WHERE active=1');
    const repaired = [];
    for (const definition of COMBINATIONS) {
      const targets = tests.filter(t => normalize(t.name) === normalize(definition.name)
        && String(t.category || '').trim().toLowerCase() === 'imported legacy catalogue');
      for (const target of targets) {
        if (String(target.report_body || '').trim()) continue;
        const specimen = normalize(target.sample_type);
        const allowed = definition.specimen === 'Serum' ? ['serum'] : ['blood', 'wholeblood', 'edtawholeblood'];
        if (specimen && !allowed.includes(specimen)) continue;
        // Do not reinterpret existing visits, saved results, or a parent bundle.
        const used = await db.get(`SELECT 1 AS found WHERE
          EXISTS (SELECT 1 FROM visit_tests WHERE test_id=?) OR
          EXISTS (SELECT 1 FROM test_bundle_items WHERE bundle_test_id=? OR component_test_id=?)`, [target.id, target.id, target.id]);
        if (used) continue;
        if (await db.get('SELECT test_id FROM report_schema_repair_backups WHERE test_id=?', [target.id])) continue;
        const oldParameters = await db.all('SELECT * FROM test_parameters WHERE test_id=? ORDER BY display_order,id', [target.id]);
        if (!isUntouchedPlaceholder(oldParameters)) continue;
        const components = [];
        for (const code of definition.codes) {
          const matches = tests.filter(t => t.code === code && String(t.category || '').trim().toLowerCase() !== 'imported legacy catalogue');
          if (matches.length !== 1 || !allowed.includes(normalize(matches[0].sample_type).replace(/\d+ml$/, ''))) break;
          const component = matches[0];
          const parameters = await db.all('SELECT * FROM test_parameters WHERE test_id=? ORDER BY display_order,id', [component.id]);
          // No incomplete schemas, formula dependencies, or guessed units.
          if (!parameters.length || isUntouchedPlaceholder(parameters)
            || parameters.some(p => p.entry_mode === 'calculated' || p.calculation_formula)) break;
          components.push({ id: component.id, code, parameters });
        }
        if (components.length !== definition.codes.length) continue;
        const replacement = components.flatMap(c => c.parameters);
        if (new Set(replacement.map(p => normalize(p.parameter_name))).size !== replacement.length) continue;
        await db.run(`INSERT INTO report_schema_repair_backups
          (test_id,test_name,old_sample_type,old_parameters_json,source_definitions_json) VALUES (?,?,?,?,?)`,
        [target.id, target.name, target.sample_type, JSON.stringify(oldParameters), JSON.stringify(components)]);
        // Exact unused placeholder rows, retained above for recovery.
        for (const parameter of oldParameters) await db.run('DELETE FROM test_parameters WHERE id=? AND test_id=?', [parameter.id, target.id]);
        for (const [index, parameter] of replacement.entries()) {
          await db.run(`INSERT INTO test_parameters
            (test_id,parameter_name,unit,normal_range,entry_mode,calculation_formula,calculation_precision,display_order)
            VALUES (?,?,?,?,?,?,?,?)`, [target.id, parameter.parameter_name, parameter.unit || '', parameter.normal_range || '',
            'manual', null, parameter.calculation_precision ?? 2, index + 1]);
        }
        if (!specimen) await db.run('UPDATE tests SET sample_type=? WHERE id=?', [definition.specimen, target.id]);
        repaired.push(target.id);
      }
    }
    return repaired;
  });
}

module.exports = { COMBINATIONS, getCombinationDefinition, isUntouchedPlaceholder, repairKnownCombinationSchemas };
