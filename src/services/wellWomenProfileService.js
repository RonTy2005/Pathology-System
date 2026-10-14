// Proposed, configurable report fields, not a universal screening order.
// Optional investigations must be requested and performed before reporting.
const lab = 'Laboratory-validated age-, sex- and pregnancy-specific interval';
const field = (section, parameterName, unit = '', normalRange = '', aliases = []) => ({ section, parameterName, unit, normalRange, aliases });
const WELL_WOMEN_FIELDS = [
  field('context', 'Profile Scope / Tests Requested', '', '', ['Tests Requested', 'Profile Scope']),
  field('context', 'Specimen(s) / Collection Conditions', '', '', ['Specimen', 'Specimens']),
  field('context', 'Collection Date / Time', '', '', ['Collection Date', 'Collection Time']),
  field('context', 'Fasting Status / Hours', '', '', ['Fasting Status', 'Fasting Hours']),
  field('context', 'Clinical Details / Pregnancy / Menstrual Context', '', '', ['Clinical Details', 'Clinical History', 'Pregnancy / Menstrual Context']),
  field('context', 'Method / Analyzer', '', '', ['Method', 'Analyzer']),
  field('CBC / HAEMATOLOGY', 'Haemoglobin', 'g/dL', lab, ['Hemoglobin', 'Hb']),
  field('CBC / HAEMATOLOGY', 'RBC Count', 'million/µL', lab, ['RBC', 'Red Blood Cell Count']),
  field('CBC / HAEMATOLOGY', 'Haematocrit (HCT / PCV)', '%', lab, ['Hematocrit', 'HCT', 'PCV']),
  field('CBC / HAEMATOLOGY', 'Mean Corpuscular Volume (MCV)', 'fL', lab, ['MCV']),
  field('CBC / HAEMATOLOGY', 'Mean Corpuscular Haemoglobin (MCH)', 'pg', lab, ['MCH']),
  field('CBC / HAEMATOLOGY', 'Mean Corpuscular Haemoglobin Concentration (MCHC)', 'g/dL', lab, ['MCHC']),
  field('CBC / HAEMATOLOGY', 'Red Cell Distribution Width (RDW-CV)', '%', lab, ['RDW-CV', 'RDW']),
  field('CBC / HAEMATOLOGY', 'Total Leucocyte Count (TLC)', 'cells/µL', lab, ['TLC', 'WBC', 'Total Leukocyte Count']),
  field('CBC / HAEMATOLOGY', 'Platelet Count', 'cells/µL', lab, ['Platelets']),
  ...['Neutrophils', 'Lymphocytes', 'Monocytes', 'Eosinophils', 'Basophils'].map(name => field('CBC / HAEMATOLOGY', name, '%', lab)),
  field('GLUCOSE SCREENING, IF ORDERED', 'Fasting Plasma Glucose', 'mg/dL', '70 - 99 (nonpregnant adult fasting guide)', ['Fasting Glucose', 'Fasting Blood Sugar', 'FPG']),
  field('GLUCOSE SCREENING, IF ORDERED', 'HbA1c', '%', '< 5.7 (nonpregnant adult screening guide)', ['Glycated Haemoglobin', 'Hemoglobin A1c']),
  field('LIPIDS / CARDIOVASCULAR RISK', 'Total Cholesterol', 'mg/dL', '< 200 (general adult guide; risk-specific targets)', ['Cholesterol Total']),
  field('LIPIDS / CARDIOVASCULAR RISK', 'Triglycerides', 'mg/dL', 'Laboratory-validated decision limits; consider fasting status', ['Triglyceride']),
  field('LIPIDS / CARDIOVASCULAR RISK', 'HDL Cholesterol', 'mg/dL', 'Adult female: < 50 is low; >= 60 desirable (general guide)', ['HDL']),
  field('LIPIDS / CARDIOVASCULAR RISK', 'LDL Cholesterol', 'mg/dL', '< 100 (general adult guide; risk-specific targets)', ['LDL']),
  field('OPTIONAL TARGETED TESTS, ONLY IF ORDERED', 'Ferritin, if ordered', 'ng/mL', lab, ['Ferritin', 'Serum Ferritin']),
  field('OPTIONAL TARGETED TESTS, ONLY IF ORDERED', 'Creatinine, if ordered', 'mg/dL', lab, ['Creatinine', 'Serum Creatinine']),
  field('OPTIONAL TARGETED TESTS, ONLY IF ORDERED', 'eGFR, if reported', 'mL/min/1.73 m²', 'Laboratory-reported estimate; interpret with clinical context', ['eGFR', 'Estimated GFR']),
  field('OPTIONAL TARGETED TESTS, ONLY IF ORDERED', 'TSH, if ordered', 'mIU/L', 'Laboratory-validated age- and pregnancy-specific interval', ['TSH', 'Thyroid Stimulating Hormone']),
  field('summary', 'Overall Findings', '', '', ['Result / Findings', 'Result', 'Findings']),
  field('summary', 'Laboratory Interpretation', '', '', ['Interpretation', 'Impression']),
  field('summary', 'Comments / Limitations', '', '', ['Comments', 'Comment', 'Remarks']),
];

const isWellWomenProfileName = name => ['wellwomenprofile', 'wellwomanprofile'].includes(String(name || '').toLowerCase().replace(/[^a-z0-9]/g, ''));

module.exports = { WELL_WOMEN_FIELDS, isWellWomenProfileName };
