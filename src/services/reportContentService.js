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
    key: 'anti-insulin-antibody',
    names: ['Anti InsulinAntibody', 'Anti Insulin Antibody', 'Insulin Antibody', 'Insulin Antibodies', 'Insulin Autoantibody (IAA)'],
    specimens: ['serum'], allowMissingSpecimen: true,
    use: 'Insulin antibodies are measured as one marker of pancreatic islet autoimmunity. In a person who has not received insulin, the result may help assess suspected type 1 diabetes alongside other islet antibodies and glucose measurements.',
    rows: [
      ['Detected / above cut-off', 'Supports insulin-antibody reactivity, but does not by itself diagnose type 1 diabetes or predict its course. Interpret with the clinical history and other islet antibody results.'],
      ['Not detected / below cut-off', 'Does not exclude type 1 diabetes. An individual may have other islet antibodies, and antibody detection varies with age and disease stage.'],
      ['Previous insulin treatment', 'Injected insulin can induce antibodies that this test may detect; a positive result after treatment cannot reliably distinguish treatment-related antibodies from pre-existing autoimmunity.'],
    ],
    referenceNote: 'Negative means below the performing laboratory\'s validated assay cut-off. The numerical threshold and unit depend on the method and are not interchangeable between laboratories; use the interval printed beside the measured result.',
    note: 'For autoimmune classification, collect the specimen before insulin treatment when feasible. Interpret with glucose or HbA1c and, when indicated, GAD65, IA-2 and ZnT8 antibodies. Antibody results alone are not a diagnosis, and treatment decisions require clinical assessment.',
    sources: ['https://www.mayocliniclabs.com/test-catalog/Overview/75935', 'https://doi.org/10.2337/dci23-0036'],
  },
  {
    key: 'anti-leptospira-antibody',
    names: ['Anti Leptospira Antibody', 'Leptospira Antibody'],
    specimens: ['serum'], allowMissingSpecimen: true,
    use: 'Anti-Leptospira antibody testing supports evaluation of suspected leptospirosis in a patient with compatible symptoms and exposure. This general antibody entry does not specify IgM or IgG; interpret it according to the antibody class and method actually used by the performing laboratory.',
    rows: [
      ['Reactive / detected', 'Indicates antibody reactivity by the stated method, but a single screening result does not establish the timing of infection. Confirmatory testing or paired sera may be appropriate.'],
      ['Non-reactive / not detected', 'Does not exclude leptospirosis, especially when collected early before antibodies have developed.'],
      ['Collection timing', 'Serologic sensitivity generally increases after the first week of symptoms. For early suspected disease, a clinician may request a suitable molecular test and later serology.'],
    ],
    referenceNote: 'The expected screening result is negative or non-reactive according to the performing assay. Numerical cut-offs, index values and titers are method-specific; use only the reference information validated for the reported method.',
    note: 'Record symptom-onset and specimen-collection dates when available. Do not label an unspecified antibody result as IgM or IgG. A positive screening assay may require confirmation with microscopic agglutination testing (MAT), and paired acute/convalescent sera can clarify an uncertain result. Clinical assessment must not wait for serology when severe disease is suspected.',
    sources: ['https://www.cdc.gov/yellow-book/hcp/travel-associated-infections-diseases/leptospirosis.html', 'https://www.cdc.gov/leptospirosis/hcp/clinical-overview/index.html'],
  },
  {
    key: 'anti-microsomal-antibody',
    names: ['Anti Microsomal Antibody', 'Anti-Microsomal Antibody'],
    specimens: ['serum'], allowMissingSpecimen: true,
    use: 'This report records antibody testing against the microsomal antigen documented above. The name "anti-microsomal" alone does not identify the antigen or clinical indication; these must come from the assay performed by the laboratory.',
    rows: [
      ['Antigen / assay target', 'Identify the exact target tested before interpreting the result. Different microsomal antibody assays are not interchangeable.'],
      ['Method and result', 'Record the method, result and any unit or titer exactly as issued by the performing laboratory. Reactive and non-reactive interpretations depend on that method.'],
      ['Clinical correlation', 'An antibody result alone does not establish a diagnosis. Interpret only after the target and method are confirmed, with the relevant history and other investigations.'],
    ],
    referenceNote: 'There is no universal reference value for the unspecific term "anti-microsomal antibody." Enter the performing laboratory\'s validated cut-off or interpretation criteria for the exact antigen and method used.',
    note: 'Do not assume this is a thyroid peroxidase (TPO) or liver-kidney microsomal (LKM) assay from the catalogue name alone. If the target or method is not documented, obtain clarification from the performing laboratory before assigning disease-specific meaning.',
    sources: ['https://www.mayocliniclabs.com/test-catalog/Overview/800146', 'https://www.mayocliniclabs.com/test-catalog/Overview/80387'],
  },
  {
    key: 'anti-dsdna-antibody',
    names: ['Anti ds DNAAntibody', 'Anti ds DNA Antibody', 'Anti-dsDNA Antibody'],
    specimens: ['serum'], allowMissingSpecimen: true,
    use: 'Anti-double-stranded DNA (anti-dsDNA) antibody testing detects antibodies directed against double-stranded DNA. It may support assessment of suspected systemic lupus erythematosus (SLE) when interpreted with the clinical findings and other laboratory tests.',
    rows: [
      ['Detected / above cut-off', 'Antibody reactivity can support SLE in an appropriate clinical setting, but a positive result alone does not establish the diagnosis. Weakly positive results need particular caution.'],
      ['Not detected / below cut-off', 'Does not exclude SLE. Interpretation depends on the assay used and the clinical picture.'],
      ['Serial results', 'Changes may provide adjunctive information in a person with established SLE, but a small change or a single result should not be used alone to predict a flare or guide treatment.'],
    ],
    referenceNote: 'Use the performing laboratory\'s validated negative, equivocal and positive criteria for the stated method. Units and cut-offs differ by assay; do not apply a threshold from another platform.',
    note: 'Record the method or platform and antibody class if supplied by the performing laboratory. Consider the result alongside clinical findings, ANA and other relevant investigations. Anti-dsDNA and anti-single-stranded DNA (anti-ssDNA) are different assays.',
    sources: ['https://www.mayocliniclabs.com/test-catalog/Overview/620810'],
  },
  {
    key: 'anti-ssdna-antibody',
    names: ['Anti ssDNAAntibody', 'Anti ssDNA Antibody', 'Anti-ssDNA Antibody'],
    specimens: ['serum'], allowMissingSpecimen: true,
    use: 'Anti-single-stranded DNA (anti-ssDNA) antibody testing detects reactivity to single-stranded, or denatured, DNA. This is a different assay from anti-double-stranded DNA (anti-dsDNA) antibody testing.',
    rows: [
      ['Detected / above cut-off', 'Indicates anti-ssDNA reactivity by the reported method. Anti-ssDNA is less specific for systemic lupus erythematosus (SLE) than anti-dsDNA; a positive result alone does not diagnose SLE.'],
      ['Not detected / below cut-off', 'No reactivity was detected at the stated assay threshold. A negative result does not exclude SLE or another autoimmune condition.'],
      ['Clinical correlation', 'Interpret with the clinical presentation and other indicated investigations. Do not substitute this result for an anti-dsDNA measurement.'],
    ],
    referenceNote: 'Use the performing laboratory\'s validated negative, equivocal and positive criteria for the stated anti-ssDNA method. Units, index values and cut-offs are assay-specific; no universal numerical normal range is assumed.',
    note: 'Record the antibody class, method and unit or titer if supplied by the performing laboratory. This report contains an anti-ssDNA result only; ANA or anti-dsDNA results must be ordered and reported separately when clinically indicated.',
    sources: ['https://acrjournals.onlinelibrary.wiley.com/doi/pdf/10.1002/art.10558'],
  },
  {
    key: 'anti-histone-antibody',
    names: ['Anti-Histone Antibody', 'Anti Histone Antibody'],
    specimens: ['serum'], allowMissingSpecimen: true,
    use: 'Anti-histone antibody testing measures antibodies against histone proteins. It can contribute to the assessment of suspected drug-induced lupus when considered with medication exposure, symptoms and other findings.',
    rows: [
      ['Detected / above cut-off', 'Supports anti-histone reactivity by the stated assay, but does not by itself establish drug-induced lupus. Anti-histone antibodies can also occur in systemic lupus erythematosus (SLE) and other conditions.'],
      ['Not detected / below cut-off', 'No anti-histone reactivity was detected at the stated assay threshold. A negative result does not by itself rule out a clinically suspected condition.'],
      ['Clinical correlation', 'Interpret alongside the medication history, timing of symptoms, ANA results and clinical assessment. Do not infer the responsible drug or change treatment from this result alone.'],
    ],
    referenceNote: 'The expected finding is negative by the performing assay. Use the performing laboratory\'s validated units and negative, weak-positive and positive thresholds; the numerical cut-off must not be copied from a different method.',
    note: 'Record the method and antibody class if supplied by the laboratory. Anti-histone and anti-chromatin assays are not interchangeable; report only the analyte actually measured.',
    sources: ['https://www.labcorp.com/tests/012518/antihistone-antibodies', 'https://www.medlineplus.gov/ency/article/000446.htm'],
  },
  {
    key: 'anti-ribosomal-p-antibody',
    names: ['Anti-Ribosomal P Antibody', 'Anti Ribosomal P Antibody'],
    specimens: ['serum'], allowMissingSpecimen: true,
    use: 'Anti-ribosomal P antibody testing measures antibodies to ribosomal P proteins. It may provide adjunctive information when evaluating a patient for systemic lupus erythematosus (SLE), together with the clinical findings and other tests.',
    rows: [
      ['Detected / above cut-off', 'Indicates anti-ribosomal P reactivity by the stated assay. A positive result alone does not establish SLE or a particular organ manifestation.'],
      ['Not detected / below cut-off', 'Does not exclude SLE; many people with SLE have no detectable anti-ribosomal P antibodies.'],
      ['Clinical correlation', 'Interpret with symptoms, ANA and other relevant investigations. The result alone cannot establish neuropsychiatric lupus or guide treatment.'],
    ],
    referenceNote: 'Use the performing laboratory\'s validated negative, equivocal and positive criteria. Units and thresholds depend on the method and antigen preparation; do not transfer a cut-off from another platform.',
    note: 'Record the method, antibody class and unit or titer as supplied by the performing laboratory. Results from different assay platforms are not automatically interchangeable, especially for serial comparison.',
    sources: ['https://www.mayocliniclabs.com/test-catalog/Overview/800242'],
  },
  {
    key: 'anti-ccp-ab',
    names: ['AntiCCPAB', 'Anti CCP AB', 'Anti-CCP AB'],
    specimens: ['serum'], allowMissingSpecimen: true,
    use: 'Anti-cyclic citrullinated peptide (anti-CCP) antibodies are used as an adjunct in evaluating suspected rheumatoid arthritis (RA), alongside the symptoms, examination and other investigations.',
    rows: [
      ['Detected / above cut-off', 'Supports anti-CCP reactivity by the stated method. In a patient with compatible clinical features it may support RA, but the result alone does not establish a diagnosis.'],
      ['Not detected / below cut-off', 'Does not exclude RA; some patients with RA do not have detectable anti-CCP antibodies.'],
      ['Clinical correlation', 'Interpret with joint symptoms and examination, rheumatoid factor and other relevant findings. A result should not be used alone to predict disease severity or guide treatment.'],
    ],
    referenceNote: 'Use the performing laboratory\'s validated negative, weak-positive and positive criteria for the assay actually used. Numerical cut-offs and units vary across platforms; do not borrow an interval from a different method.',
    note: 'Document the assay method or platform and antibody class if supplied by the performing laboratory. Report the measured value, unit and laboratory interpretation exactly as issued; no method or numerical reference interval is assumed from this test name.',
    sources: ['https://www.mayocliniclabs.com/test-catalog/Overview/84182', 'https://medlineplus.gov/lab-tests/ccp-antibody-test/'],
  },
  {
    key: 'anti-sperm-antibody',
    names: ['AntiSpermAntibody', 'Anti Sperm Antibody', 'Anti-Sperm Antibody'],
    use: 'Anti-sperm antibody testing investigates antibodies that bind to sperm. The result must identify the specimen and method because direct sperm-binding tests and indirect tests on body fluids measure different things.',
    rows: [
      ['Direct semen testing', 'A direct mixed antiglobulin reaction (MAR) or immunobead test may report the proportion of motile sperm with bound antibody. Record the measured percentage and antibody class when reported.'],
      ['Indirect testing', 'Serum, seminal plasma or another fluid may be tested with an indirect method. Its result is not interchangeable with the percentage of antibody-bound sperm from a direct semen test.'],
      ['Clinical correlation', 'A detected antibody result alone does not establish infertility. Interpret alongside the semen analysis, clinical history and the laboratory method used.'],
    ],
    referenceNote: 'Use the performing laboratory\'s validated reference or interpretive criterion for the exact specimen, antibody class and method. No universal numerical normal range is assigned to this unspecified catalogue test.',
    note: 'Record specimen or matrix, method, antibody class and reporting unit before finalizing this result. Do not label a serum or other indirect result as a direct MAR-test percentage, or infer IgG or IgA when the assay did not specify it.',
    sources: ['https://iris.who.int/bitstream/handle/10665/343208/9789240030787-eng.pdf'],
  },
  {
    key: 'apolipoprotein-a1',
    names: ['ApolipoproteinA1', 'Apolipoprotein A1', 'Apolipoprotein A-I'],
    specimens: ['serum'], allowMissingSpecimen: true,
    use: 'Apolipoprotein A1 (ApoA1) is a major protein component of high-density lipoprotein (HDL). Its concentration can add context to a cardiovascular risk assessment but is not a stand-alone diagnosis or treatment target.',
    rows: [
      ['Below the laboratory interval', 'A lower ApoA1 concentration may be associated with greater atherosclerotic cardiovascular risk. Interpret with the full lipid profile, medical history and overall risk assessment.'],
      ['Within or above the interval', 'Interpret using the laboratory\'s age- and sex-specific interval. A higher value does not guarantee protection from cardiovascular disease.'],
      ['Related measurements', 'ApoA1 is not the same measurement as HDL cholesterol or ApoB. Calculate an ApoB:ApoA1 ratio only when both analytes were measured and reported with compatible units.'],
    ],
    referenceNote: 'Use the performing laboratory\'s validated age- and sex-specific ApoA1 reference interval in the unit printed with the result. Published intervals differ across laboratories; do not substitute an ApoB cutoff or an unrelated assay interval.',
    note: 'Report ApoA1 separately from ApoB and HDL cholesterol. Interpret in clinical context; this result alone cannot diagnose atherosclerotic disease or determine a lipid-lowering treatment decision.',
    sources: ['https://www.mayocliniclabs.com/test-catalog/Overview/607591', 'https://www.labcorp.com/tests/016873/apolipoprotein-a-1'],
  },
  {
    key: 'urine-arsenic',
    names: ['Arsenic (Urine)', 'Arsenic, Urine', 'Urine Arsenic'],
    specimens: ['urine'], allowMissingSpecimen: true,
    use: 'Urine arsenic testing helps assess recent arsenic exposure. A total arsenic result includes different chemical forms and does not, on its own, distinguish potentially harmful inorganic arsenic from organic arsenic associated with seafood.',
    rows: [
      ['Total arsenic', 'Interpret the reported concentration using the collection type, analytical method, unit and performing laboratory\'s validated interval. A raised total result alone does not establish toxic arsenic exposure.'],
      ['Seafood and speciation', 'Recent seafood intake can raise total urinary arsenic through organic forms. If total arsenic is elevated, species-specific testing may help distinguish inorganic and methylated forms from seafood-related organic forms. Do not infer a species result unless it was measured.'],
      ['Collection and clinical context', 'A random urine concentration and a 24-hour excretion result are not interchangeable. Review collection details, exposure history and clinical findings with the treating clinician.'],
    ],
    referenceNote: 'Use the performing laboratory\'s validated interval for the actual collection type and method. This template reports total urine arsenic in mcg/L; a 24-hour excretion (mcg/24 h), creatinine-adjusted result or speciated result requires its own validated unit and interval. No numeric cutoff is assumed here.',
    note: 'Record the collection type and recent seafood history. If speciation was not performed, do not label the total result as inorganic or toxic arsenic. Results should be interpreted with the clinician rather than used alone to diagnose poisoning.',
    sources: ['https://www.mayocliniclabs.com/test-catalog/overview/607691', 'https://www.atsdr.cdc.gov/environmental-medicine/hcp/clinician-briefs/arsenic.html'],
  },
  {
    key: 'arthritis-profile',
    names: ['Arthritis Profile'], codes: ['PF052'],
    specimens: ['serum'], allowMissingSpecimen: true,
    use: 'This profile brings together selected serum markers relevant to the evaluation of joint symptoms. It can support a clinical assessment of inflammatory, autoimmune, post-streptococcal or crystal-related conditions, but no combination of these results alone identifies the type of arthritis.',
    rows: [
      ['Serum uric acid', 'A raised serum urate may occur without gout. Interpret alongside symptoms and, when indicated, joint-fluid analysis; a result alone cannot confirm or exclude gout.'],
      ['Rheumatoid factor', 'A positive result can support rheumatoid arthritis in the appropriate clinical setting, but also occurs in other conditions. A negative result does not exclude rheumatoid arthritis.'],
      ['C-reactive protein', 'CRP is a nonspecific marker of inflammation. A raised value does not identify which joint condition or other cause is present.'],
      ['Antistreptolysin O', 'An elevated or rising ASO titer may support evidence of a preceding streptococcal infection. It does not independently diagnose rheumatic fever or another cause of arthritis.'],
      ['Calcium and phosphorus', 'Ionized calcium, total calcium and phosphorus describe mineral status. Interpret them using the appropriate laboratory intervals and clinical context; they do not diagnose arthritis by themselves.'],
    ],
    referenceNote: 'The reference interval and unit printed beside each measured result must be validated by the performing laboratory for its method and patient population. The source example is a panel layout, not authority to copy numerical cutoffs; confirm which components your laboratory actually performs.',
    note: 'Report only measurements actually performed. This default panel follows the seven analytes in the referenced example; anti-CCP, ESR and ANA are separate tests unless specifically ordered and added by the laboratory. Clinical assessment remains necessary even when all listed results are within their intervals.',
    sources: ['https://www.drlogy.com/test/arthritis-profile', 'https://www.niams.nih.gov/health-topics/rheumatoid-arthritis/diagnosis-treatment-and-steps-to-take', 'https://medlineplus.gov/lab-tests/uric-acid-test/', 'https://www.cdc.gov/group-a-strep/hcp/clinical-guidance/diagnosing-acute-rheumatic-fever.html'],
  },
  {
    key: 'ascitic-fluid-gram-stain',
    names: ['Ascitic Fluids Gram Stain', 'Ascitic Fluid Gram Stain'],
    specimens: ['asciticfluid'], allowMissingSpecimen: true, exactSpecimens: true,
    use: 'Direct Gram-stain microscopy of ascitic fluid describes visible bacteria and inflammatory cells in the examined smear. It is a preliminary finding, not organism identification or a culture and susceptibility result.',
    rows: [
      ['Organisms seen', 'Report the Gram reaction and morphology only when observed. Confirm the finding with culture and clinical assessment; microscopy alone cannot name the organism or determine antibiotic susceptibility.'],
      ['No organisms seen', 'No bacteria were seen in the material examined. A negative Gram stain has limited sensitivity and does not exclude spontaneous bacterial peritonitis or another infection.'],
      ['Inflammatory cells', 'Describe leukocytes or polymorphonuclear cells seen on the smear separately. A qualitative smear observation is not an absolute ascitic-fluid PMN count.'],
    ],
    note: 'Interpret with the ascitic-fluid cell count and differential, culture, collection quality and clinical findings. A Gram-stain result must not be reported as culture-negative, species-identified, or antibiotic-susceptible unless those separate tests were performed.',
    qualitative: true,
    sources: ['https://medlineplus.gov/lab-tests/gram-stain/', 'https://www.aasld.org/liver-fellow-network/core-series/why-series/antibiotics-sbp-prophylaxis-why-or-why-not', 'https://pubmed.ncbi.nlm.nih.gov/19201060/'],
  },
  {
    key: 'ascitic-fluid-total-protein',
    names: ['AsciticFluidforProtein', 'Ascitic Fluid for Protein', 'Ascitic Fluid Total Protein'],
    specimens: ['asciticfluid'], allowMissingSpecimen: true, exactSpecimens: true,
    use: 'Ascitic-fluid total protein measures protein concentration in fluid obtained by paracentesis. It provides context for evaluating ascites but does not, by itself, establish the underlying cause.',
    rows: [
      ['Total protein', 'Report the measured concentration and unit. Ascitic fluid does not have a universal healthy reference interval; interpret the result in the clinical setting.'],
      ['With a paired SAAG', 'A serum-ascites albumin gradient (SAAG), when separately measured from paired serum and ascitic albumin, is more useful for assessing portal-hypertensive ascites. Total protein can add context to that assessment, but does not replace SAAG.'],
      ['Infection assessment', 'Protein concentration alone does not diagnose or exclude peritonitis. Use the ascitic-fluid cell count and differential, culture and clinical findings when infection is suspected.'],
    ],
    referenceNote: 'There is no single normal reference interval for ascitic-fluid total protein. If a laboratory uses an interpretive threshold, state its clinical context and validated method; do not apply a serum-protein interval or a pleural-fluid protein ratio to this result.',
    note: 'This is a total-protein measurement only. Do not calculate SAAG without separately measured paired serum and ascitic albumin, or report a fluid-to-serum protein ratio unless those measurements were ordered.',
    sources: ['https://www.mayocliniclabs.com/test-catalog/overview/606619', 'https://www.aasld.org/liver-fellow-network/core-series/why-series/why-timing-matters-paracentesis-admission-cirrhosis', 'https://www.medlineplus.gov/ency/article/003626.htm'],
  },
  {
    key: 'bactec-aerobic-culture',
    names: ['Bactec Culture for Aerobic Bacteria', 'BACTEC Culture for Aerobic Bacteria'],
    use: 'An automated BACTEC aerobic culture bottle monitors the submitted specimen for growth. The specimen source must be stated; a positive bottle signal is preliminary until the laboratory reports the Gram stain, isolate identification and any susceptibility testing actually performed.',
    rows: [
      ['Positive bottle / preliminary report', 'Report the positive signal and observed Gram-stain morphology if examined. A Gram reaction or shape is not a species identification or an antimicrobial-susceptibility result.'],
      ['Organism isolated', 'Identify an organism only after the laboratory completes its identification method. Interpret its significance with the specimen source, collection details and clinical findings; contamination may need consideration.'],
      ['No growth / final report', 'Use a final no-growth statement only after the laboratory\'s validated incubation period is complete. A negative aerobic culture does not exclude infection, especially if antibiotics were given before collection or the organism requires another culture method.'],
      ['Antimicrobial susceptibility', 'Report only the drugs tested for the identified isolate, with the laboratory\'s actual S/I/R interpretation and MIC or zone result when supplied. Do not infer susceptibility for an untested drug.'],
    ],
    note: 'Record whether this is a preliminary or final report and the exact specimen and bottle. An aerobic bottle does not substitute for an anaerobic culture; fungal or mycobacterial investigations need appropriate separate methods. Promptly communicate clinically significant positive results according to local policy.',
    qualitative: true,
    sources: ['https://www.bd.com/en-us/products-and-solutions/products/product-families/bd-bactec-blood-culture-system', 'https://www.cdc.gov/antimicrobial-resistance/media/pdfs/LAARC-Users-Guide-508.pdf', 'https://stacks.cdc.gov/view/cdc/175582/cdc_175582_DS1.pdf'],
  },
  {
    key: 'bactec-anaerobic-culture',
    names: ['BactecCultureforAnaerobic Bacteria', 'Bactec Culture for Anaerobic Bacteria', 'BACTEC Anaerobic Culture'],
    use: 'An automated BACTEC anaerobic culture bottle monitors the submitted specimen for growth under anaerobic conditions. Record the specimen source and bottle; a positive signal is preliminary until microscopy, isolate identification and any performed susceptibility testing are reported.',
    rows: [
      ['Positive bottle / preliminary report', 'Describe the growth signal and Gram-stain findings if examined. A positive anaerobic bottle can contain an obligate anaerobe or a facultative organism; the bottle alone does not establish which.'],
      ['Organism isolated', 'Report species or group identification only after the laboratory identifies the isolate. Interpret its significance with the exact specimen source, collection quality and clinical findings.'],
      ['No growth / final report', 'Issue a final no-growth result only after the laboratory\'s validated incubation is complete. A negative anaerobic bottle does not exclude infection; prior antibiotics, collection, transport and organisms requiring other methods can affect recovery.'],
      ['Antimicrobial susceptibility', 'Report only testing actually performed for the identified isolate, using the laboratory\'s stated interpretation and MIC or zone result when available. An unlisted drug is not automatically susceptible.'],
    ],
    note: 'State preliminary or final status. An anaerobic culture is not a substitute for an aerobic bottle or separate fungal and mycobacterial investigations. Do not label an isolate as an obligate anaerobe solely because it grew in the anaerobic bottle; promptly communicate significant positive findings according to local policy.',
    qualitative: true,
    sources: ['https://www.bd.com/en-ca/products-and-solutions/products/product-page.442193', 'https://www.bd.com/en-ca/products-and-solutions/solutions/capabilities/bd-bactec-blood-culture-media', 'https://stacks.cdc.gov/view/cdc/23251/cdc_23251_DS1.pdf'],
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
  if (content.key === 'arthritis-profile') {
    rows = rows.filter((row, index) => [
      contains(/^(serumuricacid|uricacid)/),
      contains(/^(rheumatoidfactor|rf)/),
      contains(/^(creactiveprotein|crp)/),
      contains(/^(antistreptolysino|asotiter|aso)/),
      contains(/^(ionizedcalcium|icalcium|totalcalcium|calcium|serumphosphorus|phosphorus)/),
    ][index]);
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
