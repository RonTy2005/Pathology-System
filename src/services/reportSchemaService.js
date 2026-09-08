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
  const normalizedName = normalizeSchemaName(test.name);

  if (/(afbculture.*sensitivity|culture.*sensitivity)/.test(normalizedName)) {
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
