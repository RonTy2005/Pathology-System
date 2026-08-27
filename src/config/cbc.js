const CBC_COMMON_PARAMETERS = [
  { parameterName: "Hb(Haemoglobin)", label: "Hemoglobin (Hb)", aliases: ["hemoglobin", "haemoglobin", "hb"], unit: "g/dL", normalRange: "13.0 - 17.0", section: "HEMOGLOBIN", entryMode: "manual" },
  { parameterName: "Erythrocytes", label: "Total RBC Count", aliases: ["erythrocytes", "total rbc count", "rbc count"], unit: "mill/cumm", normalRange: "4.50 - 5.50", section: "RBC COUNT", entryMode: "manual" },
  { parameterName: "PCV (Packed Cell Volume)", label: "Packed Cell Volume (PCV)", aliases: ["pcv", "packed cell volume", "hematocrit"], unit: "%", normalRange: "40 - 50", section: "BLOOD INDICES", entryMode: "manual" },
  { parameterName: "MCV (Mean Corpuscular Volume)", label: "Mean Corpuscular Volume (MCV)", aliases: ["mcv", "mean corpuscular volume"], unit: "fL", normalRange: "83 - 101", section: "BLOOD INDICES", entryMode: "calculated", formula: "{PCV (Packed Cell Volume)} * 10 / {Erythrocytes}", precision: 2 },
  { parameterName: "MCH (Mean Corpuscular Haemoglobin)", label: "MCH", aliases: ["mch", "mean corpuscular haemoglobin", "mean corpuscular hemoglobin"], unit: "pg", normalRange: "27 - 32", section: "BLOOD INDICES", entryMode: "calculated", formula: "{Hb(Haemoglobin)} * 10 / {Erythrocytes}", precision: 1 },
  { parameterName: "MCHC (Mean Corpuscular Hb. Concentration)", label: "MCHC", aliases: ["mchc", "mean corpuscular hb concentration"], unit: "g/dL", normalRange: "32.5 - 34.5", section: "BLOOD INDICES", entryMode: "calculated", formula: "{Hb(Haemoglobin)} * 100 / {PCV (Packed Cell Volume)}", precision: 1 },
  { parameterName: "RDW", label: "RDW", aliases: ["rdw", "red cell distribution width"], unit: "%", normalRange: "11.6 - 14.0", section: "BLOOD INDICES", entryMode: "manual" },
  { parameterName: "Leukocytes", label: "Total WBC Count", aliases: ["leukocytes", "leucocytes", "total wbc count", "tlc", "total leukocytes count"], unit: "cumm", normalRange: "4000 - 11000", section: "WBC COUNT", entryMode: "manual" },
  { parameterName: "Neutrophils", label: "Neutrophils", aliases: ["neutrophils", "neutrophil"], unit: "%", normalRange: "50 - 62", section: "DIFFERENTIAL WBC COUNT", entryMode: "manual" },
  { parameterName: "Lymphocytes", label: "Lymphocytes", aliases: ["lymphocytes", "lymphocyte"], unit: "%", normalRange: "20 - 40", section: "DIFFERENTIAL WBC COUNT", entryMode: "manual" },
  { parameterName: "Eosinophils", label: "Eosinophils", aliases: ["eosinophils", "eosinophil"], unit: "%", normalRange: "00 - 06", section: "DIFFERENTIAL WBC COUNT", entryMode: "manual" },
  { parameterName: "Monocytes", label: "Monocytes", aliases: ["monocytes", "monocyte"], unit: "%", normalRange: "00 - 10", section: "DIFFERENTIAL WBC COUNT", entryMode: "manual" },
  { parameterName: "Basophils", label: "Basophils", aliases: ["basophils", "basophil"], unit: "%", normalRange: "00 - 02", section: "DIFFERENTIAL WBC COUNT", entryMode: "manual" },
  { parameterName: "Platelet Count", label: "Platelet Count", aliases: ["platelet count", "platelets"], unit: "cumm", normalRange: "150000 - 410000", section: "PLATELET COUNT", entryMode: "manual" },
];

const CBC_ESR_PARAMETER = {
  parameterName: "1st Hr. (Westegren Method)",
  label: "ESR",
  aliases: ["esr", "erythrocyte sedimentation rate", "1st hr", "westegren"],
  unit: "mm/hr",
  normalRange: "0 - 15",
  section: "ESR",
  method: "Capillary photometry",
};

const CBC_ABSOLUTE_PARAMETERS = [
  { parameterName: "Absolute Neutrophils", label: "Absolute Neutrophils", aliases: ["absolute neutrophils", "absolute neutrophil count"], unit: "cells/mcL", normalRange: "1500 - 7500", section: "ABSOLUTE COUNT", entryMode: "calculated", formula: "{Leukocytes} * {Neutrophils} / 100", precision: 0 },
  { parameterName: "Absolute Lymphocytes", label: "Absolute Lymphocytes", aliases: ["absolute lymphocytes", "absolute lymphocyte count"], unit: "cells/mcL", normalRange: "1300 - 3500", section: "ABSOLUTE COUNT", entryMode: "calculated", formula: "{Leukocytes} * {Lymphocytes} / 100", precision: 0 },
  { parameterName: "Absolute Eosinophils", label: "Absolute Eosinophils", aliases: ["absolute eosinophils", "absolute eosinophil count"], unit: "cells/mcL", normalRange: "00 - 500", section: "ABSOLUTE COUNT", entryMode: "calculated", formula: "{Leukocytes} * {Eosinophils} / 100", precision: 0 },
  { parameterName: "Absolute Monocytes", label: "Absolute Monocytes", aliases: ["absolute monocytes", "absolute monocyte count"], unit: "cells/mcL", normalRange: "200 - 950", section: "ABSOLUTE COUNT", entryMode: "calculated", formula: "{Leukocytes} * {Monocytes} / 100", precision: 0 },
  { parameterName: "Absolute Basophils", label: "Absolute Basophils", aliases: ["absolute basophils", "absolute basophil count"], unit: "cells/mcL", normalRange: "00 - 300", section: "ABSOLUTE COUNT", entryMode: "calculated", formula: "{Leukocytes} * {Basophils} / 100", precision: 0 },
];

const CBC_REPORT_TESTS = [
  {
    name: "Complete Blood Count (CBC) with ESR",
    code: "CBCESR",
    category: "Hematology",
    sampleType: "Whole Blood",
    turnaroundHours: 8,
    variant: "esr",
    parameters: [...CBC_COMMON_PARAMETERS, CBC_ESR_PARAMETER],
  },
  {
    name: "Complete Blood Count (CBC) with Absolute Count",
    code: "CBCABS",
    category: "Hematology",
    sampleType: "Whole Blood",
    turnaroundHours: 8,
    variant: "absolute",
    parameters: [...CBC_COMMON_PARAMETERS, ...CBC_ABSOLUTE_PARAMETERS],
  },
];

function getCbcVariant(name) {
  const normalized = String(name || "").toLowerCase();
  if (!normalized.includes("complete blood count") && !normalized.includes("cbc")) return null;
  if (normalized.includes("absolute")) return "absolute";
  if (normalized.includes("esr")) return "esr";
  return "standard";
}

function getCbcParameters(variant = "standard") {
  if (variant === "esr") return [...CBC_COMMON_PARAMETERS, CBC_ESR_PARAMETER];
  if (variant === "absolute") return [...CBC_COMMON_PARAMETERS, ...CBC_ABSOLUTE_PARAMETERS];
  return CBC_COMMON_PARAMETERS;
}

function getCbcHeading(variant = "standard") {
  if (variant === "esr") return "Complete Blood Count (CBC) with ESR";
  if (variant === "absolute") return "Complete Blood Count (CBC) with Absolute Count";
  return "Complete Blood Count (CBC)";
}

module.exports = {
  CBC_COMMON_PARAMETERS,
  CBC_REPORT_TESTS,
  getCbcHeading,
  getCbcParameters,
  getCbcVariant,
};
