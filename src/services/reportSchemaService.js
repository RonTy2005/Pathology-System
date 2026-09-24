const { getCellReportParameters } = require('./cellReportService');
const { isBillingOnlyTest } = require('../../frontend/scripts/reportEligibility');

function normalizeSchemaName(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function createParameter(parameterName, { unit = "", normalRange = "" } = {}) {
  return {
    parameterName,
    unit,
    normalRange,
    entryMode: "manual",
    calculationFormula: null,
    calculationPrecision: 2,
  };
}

/**
 * Gives a new or imported test a usable result entry field when its source
 * catalogue did not include a parameter schema.  The classifications are
 * deliberately conservative: a generic result is preferable to inventing
 * clinical analytes or reference ranges that were not supplied by the lab.
 */
function getFallbackReportParameters(test = {}) {
  if (isBillingOnlyTest(test)) return [];
  const cellParameters = getCellReportParameters(test);
  if (cellParameters) return cellParameters;
  const normalizedName = normalizeSchemaName(test.name);

  if (["bronchialbrushingforpap", "bronchiallavageforpap"].includes(normalizedName)) {
    return [
      createParameter("Specimen / Collection Site"),
      createParameter("Collection Date / Time"),
      createParameter("Clinical Details / Imaging"),
      createParameter("Preparation / Stains"),
      createParameter("Specimen Adequacy"),
      createParameter("Cytomorphologic Findings"),
      createParameter("Other Findings / Organisms"),
      createParameter("Diagnostic Category"),
      createParameter("Interpretation / Diagnosis"),
      createParameter("Ancillary Studies / Correlation"),
      createParameter("Comments / Limitations"),
    ];
  }

  if (normalizedName === "acr" || normalizedName.includes("albumincreatinineratio")) {
    return [
      createParameter("Urine Albumin", { unit: "mg/L" }),
      createParameter("Urine Creatinine", { unit: "mg/dL" }),
      {
        ...createParameter("Albumin Creatinine Ratio (ACR)", { unit: "mg/g creatinine", normalRange: "< 30.00" }),
        entryMode: "calculated",
        calculationFormula: "{Urine Albumin} / {Urine Creatinine} * 100",
        calculationPrecision: 1,
      },
    ];
  }

  if (normalizedName === "bloodculturesensitivity" || normalizedName === "bloodcultureandsensitivity") {
    return [
      createParameter("Culture Status / Result", { normalRange: "No growth" }),
      createParameter("Specimen / Collection Site"),
      createParameter("Collection Date / Time"),
      createParameter("Bottle / Set"),
      createParameter("Culture System / Method"),
      createParameter("Report Status"),
      createParameter("Gram Stain"),
      createParameter("Time to Positivity"),
      createParameter("Organism Isolated"),
      createParameter("Identification Method"),
      createParameter("Antimicrobial Susceptibility"),
      createParameter("Resistance Markers / Alerts"),
      createParameter("Comments"),
    ];
  }

  if (["bodyfluidculturesensitivity", "bodyfluidcultureandsensitivity", "sterilebodyfluidculturesensitivity", "sterilebodyfluidcultureandsensitivity"].includes(normalizedName)) {
    return [
      createParameter("Culture Status / Result", { normalRange: "No growth" }),
      createParameter("Fluid Type / Source"),
      createParameter("Anatomic Site / Collection Procedure"),
      createParameter("Collection Date / Time"),
      createParameter("Report Status"),
      createParameter("Direct Gram Stain", { normalRange: "No organisms seen" }),
      createParameter("Aerobic Culture", { normalRange: "No growth" }),
      createParameter("Anaerobic Culture", { normalRange: "No growth" }),
      createParameter("Organism(s) Isolated", { normalRange: "No growth" }),
      createParameter("Identification Method"),
      createParameter("Antimicrobial Susceptibility"),
      createParameter("Resistance Markers / Alerts"),
      createParameter("Comments"),
    ];
  }

  if (["bodyfluidsforchloride", "bodyfluidforchloride", "chloridebodyfluid", "bodyfluidchloride"].includes(normalizedName)) {
    return [
      createParameter("Chloride, Body Fluid", { unit: "mmol/L", normalRange: "Interpretive / fluid-specific" }),
      createParameter("Fluid Type / Source"),
      createParameter("Collection Date / Time"),
      createParameter("Appearance"),
      createParameter("Method / Analyzer"),
      createParameter("Comments"),
    ];
  }

  if (["baccalsmearforbrrbody", "buccalsmearforbarrbody"].includes(normalizedName)) {
    return [
      createParameter("Specimen / Collection Site"),
      createParameter("Collection Date / Time"),
      createParameter("Clinical Indication"),
      createParameter("Stain / Method"),
      createParameter("Smear Adequacy"),
      createParameter("Epithelial Cells Examined", { unit: "cells" }),
      createParameter("Barr-body Positive Cells", { unit: "cells" }),
      {
        ...createParameter("Barr-body Positive Nuclei (%)", { unit: "%", normalRange: "Laboratory-validated / stain-specific interpretive cut-off" }),
        entryMode: "calculated",
        calculationFormula: "{Barr-body Positive Cells} / {Epithelial Cells Examined} * 100",
        calculationPrecision: 1,
      },
      createParameter("Sex Chromatin (Barr Body) Finding", { normalRange: "Laboratory-validated interpretive criteria" }),
      createParameter("Cytomorphologic Findings"),
      createParameter("Interpretation / Impression"),
      createParameter("Limitations / Notes"),
      createParameter("Comments"),
    ];
  }

  if (normalizedName === "autoimmuneprofile") {
    return [
      createParameter("ANA Screen / Result", { normalRange: "Negative / below the laboratory screening threshold" }),
      createParameter("ANA Titer", { normalRange: "Laboratory-validated reporting threshold (when IFA is performed)" }),
      createParameter("ANA Pattern (ICAP)"),
      createParameter("Anti-dsDNA Antibody", { unit: "IU/mL", normalRange: "Assay-specific reference interval" }),
      createParameter("Complement C3", { unit: "mg/dL", normalRange: "Laboratory- and age-specific reference interval" }),
      createParameter("Clinical Indication"),
      createParameter("Method / Platform"),
      createParameter("Interpretation / Findings"),
      createParameter("Comments"),
    ];
  }

  if (["antenatalprofile", "antenatalbookingprofile", "antenatalscreeningprofile"].includes(normalizedName)) {
    return [
      createParameter("Gestational Age / Trimester", { normalRange: "Clinical information" }),
      createParameter("Haemoglobin (Hb)", { unit: "g/dL", normalRange: "Pregnancy / trimester-specific laboratory interval" }),
      createParameter("Total Leucocyte Count (TLC)", { unit: "cells/cumm", normalRange: "Pregnancy / trimester-specific laboratory interval" }),
      createParameter("Platelet Count", { unit: "cells/cumm", normalRange: "Pregnancy-specific laboratory interval" }),
      createParameter("ABO Blood Group", { normalRange: "Not applicable" }),
      createParameter("Rh(D) Type", { normalRange: "Not applicable" }),
      createParameter("Red-cell Antibody Screen (ICT)", { normalRange: "Negative" }),
      createParameter("Glucose / GDM Screening", { unit: "mg/dL", normalRange: "Test-, gestation- and protocol-specific" }),
      createParameter("HIV 1 & 2 Screen", { normalRange: "Non-reactive" }),
      createParameter("Hepatitis B Surface Antigen (HBsAg)", { normalRange: "Non-reactive" }),
      createParameter("Hepatitis C Screen (Anti-HCV)", { normalRange: "Non-reactive" }),
      createParameter("Syphilis Screen (VDRL / RPR)", { normalRange: "Non-reactive" }),
      createParameter("Urine Protein / Albumin", { normalRange: "Negative" }),
      createParameter("Urine Glucose", { normalRange: "Negative" }),
      createParameter("Urine Culture / Bacteriuria Screen", { normalRange: "No significant growth" }),
      createParameter("Overall Findings"),
      createParameter("Comments"),
    ];
  }

  if (["anticardiolipinantibodyiga", "anticardiolipiniga", "cardiolipinantibodyiga", "phospholipidcardiolipinantibodiesiga"].includes(normalizedName)) {
    return [
      createParameter("Anticardiolipin Antibody IgA, Serum", { unit: "APL-U/mL", normalRange: "< 15.0" }),
      createParameter("Comments"),
    ];
  }

  if (["antiinsulinantibody", "insulinantibody", "insulinantibodies", "insulinautoantibodyiaa"].includes(normalizedName)) {
    return [createParameter("Insulin Antibodies (IAA), Serum", { normalRange: "Assay-specific negative cut-off" })];
  }

  if (["antileptospiraantibody", "leptospiraantibody"].includes(normalizedName)) {
    return [createParameter("Anti-Leptospira Antibody, Serum", { normalRange: "Negative / non-reactive (assay-specific)" })];
  }

  if (normalizedName === "antimicrosomalantibody") {
    return [
      createParameter("Antigen / Assay Target"),
      createParameter("Assay Method"),
      createParameter("Anti-Microsomal Antibody Result", { normalRange: "Performing laboratory's validated criterion" }),
      createParameter("Laboratory Interpretation"),
      createParameter("Comments"),
    ];
  }

  if (normalizedName === "antidsdnaantibody") {
    return [
      createParameter("Anti-dsDNA Antibody", { normalRange: "Assay-specific reference interval" }),
      createParameter("Assay Method / Platform"),
      createParameter("Laboratory Interpretation"),
      createParameter("Comments"),
    ];
  }

  if (normalizedName === "antissdnaantibody") {
    return [
      createParameter("Anti-ssDNA Antibody", { normalRange: "Assay-specific reference interval" }),
      createParameter("Assay Method / Platform"),
      createParameter("Laboratory Interpretation"),
      createParameter("Comments"),
    ];
  }

  if (normalizedName === "antihistoneantibody") {
    return [
      createParameter("Anti-Histone Antibody", { normalRange: "Assay-specific negative cut-off" }),
      createParameter("Assay Method / Platform"),
      createParameter("Laboratory Interpretation"),
      createParameter("Comments"),
    ];
  }

  if (normalizedName === "antiribosomalpantibody") {
    return [
      createParameter("Anti-Ribosomal P Antibody", { normalRange: "Assay-specific negative cut-off" }),
      createParameter("Assay Method / Platform"),
      createParameter("Laboratory Interpretation"),
      createParameter("Comments"),
    ];
  }

  if (normalizedName === "anticcpab") {
    return [
      createParameter("Anti-CCP Antibody", { normalRange: "Assay-specific negative cut-off" }),
      createParameter("Assay Method / Platform"),
      createParameter("Laboratory Interpretation"),
      createParameter("Comments"),
    ];
  }

  if (normalizedName === "antispermantibody") {
    return [
      createParameter("Specimen / Matrix"),
      createParameter("Assay Method / Platform"),
      createParameter("Antibody Class"),
      createParameter("Anti-Sperm Antibody Result", { normalRange: "Specimen- and assay-specific criterion" }),
      createParameter("Laboratory Interpretation"),
      createParameter("Comments"),
    ];
  }

  if (["apolipoproteina1", "apolipoproteinai"].includes(normalizedName)) {
    return [
      createParameter("Apolipoprotein A1, Serum", { unit: "mg/dL", normalRange: "Age- and sex-specific laboratory interval" }),
      createParameter("Assay Method / Platform"),
      createParameter("Laboratory Interpretation"),
      createParameter("Comments"),
    ];
  }

  if (normalizedName === "arsenicurine" || normalizedName === "urinearsenic") {
    return [
      createParameter("Collection Type / Duration"),
      createParameter("Arsenic, Total, Urine", { unit: "mcg/L", normalRange: "Collection- and method-specific laboratory interval" }),
      createParameter("Assay Method / Platform"),
      createParameter("Laboratory Interpretation"),
      createParameter("Comments"),
    ];
  }

  if (normalizedName === "arthritisprofile") {
    return [
      createParameter("Serum Uric Acid", { unit: "mg/dL", normalRange: "Lab-validated interval" }),
      createParameter("Rheumatoid Factor, RA", { unit: "IU/mL", normalRange: "Assay-specific laboratory interval" }),
      createParameter("C-Reactive Protein, CRP", { unit: "mg/L", normalRange: "Assay-specific laboratory interval" }),
      createParameter("Antistreptolysin O, ASO Titer", { unit: "IU/mL", normalRange: "Age- and assay-specific laboratory interval" }),
      createParameter("iCalcium", { unit: "mmol/L", normalRange: "Lab-validated interval" }),
      createParameter("Total Calcium", { unit: "mg/dL", normalRange: "Lab-validated interval" }),
      createParameter("Serum Phosphorus", { unit: "mg/dL", normalRange: "Age-specific laboratory interval" }),
      createParameter("Comments"),
    ];
  }

  if (normalizedName === "asciticfluidsgramstain" || normalizedName === "asciticfluidgramstain") {
    return [
      createParameter("Specimen / Site"),
      createParameter("Smear Method / Preparation"),
      createParameter("Inflammatory Cells / PMNs"),
      createParameter("Gram Stain Findings"),
      createParameter("Gram Reaction / Bacterial Morphology"),
      createParameter("Impression"),
      createParameter("Comments"),
    ];
  }

  if (["asciticfluidforprotein", "asciticfluidtotalprotein"].includes(normalizedName)) {
    return [
      createParameter("Ascitic Fluid Total Protein", { unit: "g/dL", normalRange: "Interpretive; no universal reference interval" }),
      createParameter("Specimen / Site"),
      createParameter("Appearance"),
      createParameter("Method / Analyzer"),
      createParameter("Comments"),
    ];
  }

  if (normalizedName === "bacteccultureforaerobicbacteria") {
    return [
      createParameter("Specimen / Collection Site"),
      createParameter("Bottle / Medium"),
      createParameter("Collection Date / Time"),
      createParameter("Culture Status / Result"),
      createParameter("Report Status"),
      createParameter("Time to Positivity"),
      createParameter("Gram Stain from Positive Bottle"),
      createParameter("Organism(s) Isolated"),
      createParameter("Identification Method"),
      createParameter("Antimicrobial Susceptibility"),
      createParameter("Comments"),
    ];
  }

  if (normalizedName === "bacteccultureforanaerobicbacteria" || normalizedName === "bactecanaerobicculture") {
    return [
      createParameter("Specimen / Collection Site"),
      createParameter("Bottle / Medium"),
      createParameter("Collection Date / Time"),
      createParameter("Culture Status / Result"),
      createParameter("Report Status"),
      createParameter("Time to Positivity"),
      createParameter("Gram Stain from Positive Bottle"),
      createParameter("Organism(s) Isolated"),
      createParameter("Identification Method"),
      createParameter("Antimicrobial Susceptibility"),
      createParameter("Comments"),
    ];
  }

  if (["anticardiolipinantibodyigaigm", "anticardiolipinigaigm", "cardiolipinantibodyigaigm", "phospholipidcardiolipinantibodiesigaigm"].includes(normalizedName)) {
    return [
      createParameter("Anticardiolipin Antibody IgA, Serum", { unit: "APL-U/mL", normalRange: "< 15.0" }),
      createParameter("Anticardiolipin Antibody IgM, Serum", { unit: "MPL-U/mL", normalRange: "< 15.0" }),
      createParameter("Comments"),
    ];
  }

  if (["anticardiolipinantibodyigaigg", "anticardiolipinigaigg", "cardiolipinantibodyigaigg", "phospholipidcardiolipinantibodiesigaigg"].includes(normalizedName)) {
    return [
      createParameter("Anticardiolipin Antibody IgA, Serum", { unit: "APL-U/mL", normalRange: "< 15.0" }),
      createParameter("Anticardiolipin Antibody IgG, Serum", { unit: "GPL-U/mL", normalRange: "< 15.0" }),
      createParameter("Comments"),
    ];
  }

  if (["anticardiolipinantibodyiggigm", "anticardiolipiniggigm", "cardiolipinantibodyiggigm", "phospholipidcardiolipinantibodiesiggigm"].includes(normalizedName)) {
    return [
      createParameter("Anticardiolipin Antibody IgG, Serum", { unit: "GPL-U/mL", normalRange: "< 15.0" }),
      createParameter("Anticardiolipin Antibody IgM, Serum", { unit: "MPL-U/mL", normalRange: "< 15.0" }),
      createParameter("Comments"),
    ];
  }

  if (normalizedName === "bonemarrowcytology") {
    return [
      createParameter("Specimen / Aspirate Site"),
      createParameter("Collection Date / Time"),
      createParameter("Clinical Details / Indication"),
      createParameter("Aspirate Quality / Adequacy"),
      createParameter("Peripheral Blood Counts"),
      createParameter("Peripheral Blood Smear"),
      createParameter("Marrow Particles / Cellularity"),
      createParameter("Nucleated Differential / Myelogram"),
      createParameter("Total Nucleated Cells Counted", { unit: "cells" }),
      createParameter("Myeloid : Erythroid Ratio", { normalRange: "Laboratory-validated / age-specific" }),
      createParameter("Blasts (%)", { unit: "%", normalRange: "Laboratory-validated / classification-specific" }),
      createParameter("Erythropoiesis"),
      createParameter("Granulopoiesis / Myelopoiesis"),
      createParameter("Megakaryocytes"),
      createParameter("Lymphocytes / Plasma Cells"),
      createParameter("Other / Abnormal Cells or Infiltrates"),
      createParameter("Detailed Morphologic Description"),
      createParameter("Iron Stain / Stores"),
      createParameter("Cytochemistry / Ancillary Studies"),
      createParameter("Interpretation / Morphologic Diagnosis"),
      createParameter("Recommendations / Pending Studies"),
      createParameter("Limitations / Notes"),
      createParameter("Comments"),
    ];
  }

  if (normalizedName === "bonemarrowaspirationcytology") {
    return [
      createParameter("Specimen / Aspirate Site"),
      createParameter("Collection Date / Time"),
      createParameter("Clinical Details / Indication"),
      createParameter("Aspiration Procedure / Material Received"),
      createParameter("Aspirate Quality / Adequacy"),
      createParameter("Peripheral Blood Counts"),
      createParameter("Peripheral Blood Smear"),
      createParameter("Marrow Particles / Cellularity"),
      createParameter("Total Nucleated Cells Counted", { unit: "cells" }),
      createParameter("Nucleated Differential / Myelogram"),
      createParameter("Myeloid : Erythroid Ratio", { normalRange: "Laboratory-validated / age-specific" }),
      createParameter("Blasts (%)", { unit: "%", normalRange: "Laboratory-validated / classification-specific" }),
      createParameter("Erythropoiesis"),
      createParameter("Granulopoiesis / Myelopoiesis"),
      createParameter("Megakaryocytes"),
      createParameter("Lymphocytes"),
      createParameter("Plasma Cells"),
      createParameter("Other / Abnormal Cells or Infiltrates"),
      createParameter("Detailed Morphologic Description"),
      createParameter("Iron Stain / Stores"),
      createParameter("Sideroblasts / Ring Sideroblasts"),
      createParameter("Cytochemistry / Special Stains"),
      createParameter("Flow Cytometry"),
      createParameter("Cytogenetics / FISH"),
      createParameter("Molecular Studies"),
      createParameter("Trephine Biopsy Correlation"),
      createParameter("Interpretation / Morphologic Diagnosis"),
      createParameter("Integrated Diagnosis / Report Status"),
      createParameter("Recommendations / Pending Studies"),
      createParameter("Limitations / Notes"),
      createParameter("Comments"),
    ];
  }

  if (/afb.*culture.*sensitivity/.test(normalizedName)) {
    return [
      createParameter("AFB Culture Result"),
      createParameter("Organism Isolated"),
      createParameter("Drug Sensitivity"),
      createParameter("Comments"),
    ];
  }

  if (normalizedName.includes("culture")) {
    return [
      createParameter("Culture Result"),
      createParameter("Organism Isolated"),
      createParameter("Antibiotic Sensitivity"),
      createParameter("Comments"),
    ];
  }

  if (/(histopath|histology|biopsy)/.test(normalizedName)) {
    return [
      createParameter("Clinical History"),
      createParameter("Specimen"),
      createParameter("Diagnosis"),
      createParameter("Note"),
      createParameter("Gross Description"),
      createParameter("Microscopic Description"),
    ];
  }

  if (/(cytology|fnac)/.test(normalizedName)) {
    return [
      createParameter("Specimen"),
      createParameter("Clinical History"),
      createParameter("Gross Description"),
      createParameter("Microscopic Description"),
      createParameter("Impression"),
      createParameter("Advice"),
      createParameter("Note"),
      createParameter("Comments"),
    ];
  }

  if (/(scan|ultrasound|usg|xray|mri|mammograph|angiograph|fluoroscop|doppler|petct|pet scan|bmd|uroflow|ecg|echo|holter)/.test(normalizedName)) {
    return [
      createParameter("Clinical Details"),
      createParameter("Findings"),
      createParameter("Impression"),
      createParameter("Advice"),
    ];
  }

  if (/(smear|stain|microscopy|microscopic|examination)/.test(normalizedName)) {
    return [
      createParameter("Findings"),
      createParameter("Impression"),
      createParameter("Comments"),
    ];
  }

  if (/(profile|panel|package|screening|combination)/.test(normalizedName)) {
    return [
      createParameter("Result / Findings"),
      createParameter("Comments"),
    ];
  }

  return [createParameter("Result")];
}

/**
 * A small set of imported aliases that already have carefully designed
 * report renderers in the catalogue.  The migration copies their real
 * result schema rather than degrading them to a generic one-field report.
 */
function getCanonicalSchemaTargetForLegacyTest(testName) {
  const normalizedName = normalizeSchemaName(testName);

  if (normalizedName.includes("afbculture") && normalizedName.includes("sensitivity")) return "AFB Culture & Sensitivity";
  if (normalizedName.includes("25ohvitamind") || normalizedName.includes("vitamindtotal25oh")) return "Vitamin D, 25 - Hydroxy";
  if (normalizedName.includes("bloodgroup")) return "Blood Group";
  if (normalizedName.includes("creactiveprotein") || normalizedName === "crp") return "C-Reactive Protein (CRP)";
  if (normalizedName.includes("clottingtime")) return "Clotting Time";
  if (normalizedName.includes("coombstestindirect")) return "Indirect Coombs Test";
  if (normalizedName.includes("coombstestdirect")) return "Direct Coombs Test";
  if (normalizedName.includes("differentialleukocytescount") || normalizedName === "dlc") return "Differential Leucocyte Count (DLC)";
  if (normalizedName.includes("electrolyteprofile")) return "Electrolytes";
  if (normalizedName.includes("fnac")) return "Fine Needle Aspiration Cytology (FNAC)";
  if (normalizedName.includes("factorvii")) return "Factor VII";
  if (normalizedName.includes("glucosepp") || normalizedName.includes("postprandial")) return "Post Prandial Blood Sugar (PPBS)";
  if (normalizedName.includes("hepatitisbsurfaceantibody") || normalizedName.includes("hbsab")) return "Hepatitis B Surface Antibody (Anti-HBs)";
  if (normalizedName.includes("hepatitisbprofile")) return "Hepatitis B Profile";
  if (normalizedName.startsWith("mch") && !normalizedName.includes("mchc")) return "Mean Corpuscular Hemoglobin (MCH)";
  if (normalizedName.startsWith("mcv")) return "Mean Corpuscular Volume (MCV)";
  if (normalizedName.includes("malariaparasite") || normalizedName.includes("mpmalar")) return "Malaria Parasite Identification";
  if (normalizedName.includes("mantoux")) return "Mantoux Test (Tuberculin Skin Test)";
  if (normalizedName.includes("peripheralsmear")) return "Peripheral Blood Smear Examination";
  if (normalizedName.includes("rheumatoidfactor") || normalizedName.startsWith("rarheumatoid")) return "Rheumatoid Factor, RA";
  if (normalizedName.includes("semenanalysis")) return "Semen Analysis - Seminogram";
  if (normalizedName.includes("vitaminb12")) return "Vitamin B12";
  if (normalizedName.includes("sputumafb")) return "Sputum Examination, AFB";
  if (normalizedName.includes("torch")) return "TORCH Profile";
  if (normalizedName.includes("typhidot") || normalizedName.includes("typhidot")) return "Typhidot";

  return null;
}

module.exports = {
  getFallbackReportParameters,
  getCanonicalSchemaTargetForLegacyTest,
  normalizeSchemaName,
};
