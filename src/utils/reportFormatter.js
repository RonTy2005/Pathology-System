const { getCbcHeading, getCbcParameters, getCbcVariant } = require("../config/cbc");
const { supplementReportHtml } = require("../services/reportContentService");
const { getCombinationDefinition } = require("../services/reportCombinationRepair");
const { getCellReportDefinition } = require("../services/cellReportService");
const { isBillingOnlyTest, BILLING_ONLY_MESSAGE } = require('../../frontend/scripts/reportEligibility');

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatDateStr(date) {
  if (!date) return "-";
  const d = new Date(date);
  return d.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
}

function checkResultRange(value, rangeStr) {
  if (!value || !rangeStr) return { isAbnormal: false, colorClass: "" };
  const val = parseFloat(value.replace(/,/g, ""));
  if (isNaN(val)) return { isAbnormal: false, colorClass: "" };
  const range = getRangeBounds(rangeStr);
  if (!range) return { isAbnormal: false, colorClass: "" };
  const [min, max] = range;
  if (val < min) return { isAbnormal: true, colorClass: "low-val" };
  if (val > max) return { isAbnormal: true, colorClass: "high-val" };
  return { isAbnormal: false, colorClass: "" };
}

function getRangeBounds(rangeStr) {
  const match = String(rangeStr || "")
    .replace(/,/g, "")
    .match(/(-?\d+(?:\.\d+)?)\s*(?:-|–|to)\s*(-?\d+(?:\.\d+)?)/i);
  if (!match) return null;
  return [Number(match[1]), Number(match[2])];
}

function normalizeParameterName(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function findCbcResult(test, definition) {
  const acceptedNames = [definition.parameterName, definition.label, ...(definition.aliases || [])]
    .map(normalizeParameterName);

  return (test.parameters || []).find(parameter =>
    acceptedNames.includes(normalizeParameterName(parameter.parameter_name))
  );
}

function getCbcStatus(value, normalRange) {
  const numericValue = Number(String(value || "").replace(/,/g, ""));
  const range = getRangeBounds(normalRange);
  if (!Number.isFinite(numericValue) || !range) return null;
  if (numericValue < range[0]) return { label: "Low", className: "low-val" };
  if (numericValue > range[1]) return { label: "High", className: "high-val" };
  return { label: "Normal", className: "normal-val" };
}

const ABSOLUTE_COUNT_TEMPLATES = [
  {
    title: "ABSOLUTE POLYMORPHS COUNT (APC)",
    aliases: ["absolutepolymorphscount", "absolutepolymorphs"],
    normalRange: "1500 - 7500",
    unit: "cells/mcL",
    comments: ["Polymorphs, also called neutrophils, are an important type of white blood cells that help the body fight infections and inflammation."],
    lowHeading: "Low APC Causes :",
    lowCauses: [
      "Viral infections - Certain viral infections, such as HIV or hepatitis, can cause a decrease in polymorphs.",
      "Bone marrow disorders - Disorders that affect the bone marrow, such as aplastic anemia or myelodysplastic syndromes, can cause a decrease in polymorphs.",
      "Chemotherapy - Chemotherapy drugs used to treat cancer can cause a decrease in polymorphs.",
      "Autoimmune disorders - Certain autoimmune disorders, such as lupus or rheumatoid arthritis, can cause a decrease in polymorphs.",
      "Certain congenital disorders, such as Kostmann syndrome or Shwachman-Diamond syndrome, can cause a decrease in polymorphs."
    ],
    highHeading: "High APC Causes :",
    highCauses: [
      "Bacterial infections - Certain bacterial infections, such as sepsis, pneumonia, and urinary tract infections, can cause an increase in polymorphs.",
      "Inflammation - Inflammatory conditions, such as rheumatoid arthritis, inflammatory bowel disease, or lupus, can cause an increase in polymorphs.",
      "Tissue injury - Tissue injury due to trauma, surgery, or burns can cause an increase in polymorphs.",
      "Cancer - Certain types of cancer, such as leukemia or lymphoma, can cause an increase in polymorphs.",
      "Stress - Physical or emotional stress can cause an increase in polymorphs.",
      "Smoking - Chronic smoking can cause an increase in polymorphs."
    ]
  },
  {
    title: "ABSOLUTE NEUTROPHIL COUNT (ANC)",
    aliases: ["absoluteneutrophilcount", "absoluteneutrophilscount", "absoluteneutrophils", "anc"],
    normalRange: "2.00 - 7.00",
    unit: "thou/mm3",
    sampleType: "Blood (2 ml)",
    turnaroundText: "1 hr (Normal: 1 - 4 hrs)",
    method: "Electrical Impedance, VCS",
    showStatus: true,
    notesHtml: `
      <div class="report-note-heading">Comments:</div>
      <p class="absolute-paragraph">The Absolute Neutrophil Count (ANC) is a crucial component of a complete blood count (CBC) that measures the number of neutrophils in a microliter of blood. Neutrophils are a type of white blood cell that plays a central role in the body's immune response, particularly in fighting bacterial infections. Interpreting the ANC results is important for assessing a person's immune status and their ability to combat infections. Here's how to interpret ANC values:</p>
      <div class="report-note-heading">Normal ANC:</div>
      <ul>
        <li>A normal ANC typically falls within a reference range, which may vary slightly depending on the laboratory or clinical facility but is typically in the range of 2,500 to 6,000 neutrophils per microliter of blood.</li>
        <li>In this range, it indicates that the individual's immune system is functioning adequately, and they have a sufficient number of neutrophils to combat infections.</li>
      </ul>
      <div class="report-note-heading">Low ANC (Neutropenia):</div>
      <ul>
        <li>An ANC below the normal range is indicative of neutropenia, a condition characterized by a decreased number of neutrophils.</li>
        <li>Mild Neutropenia: ANC between 1,000 and 1,500 may suggest a mild decrease in immune function.</li>
        <li>Moderate Neutropenia: ANC between 500 and 1,000 indicates a moderate decrease in neutrophil count, increasing the risk of bacterial infections.</li>
        <li>Severe Neutropenia: ANC below 500 is considered severe neutropenia and significantly increases the risk of potentially life-threatening infections, particularly in individuals with compromised immune systems, such as cancer patients undergoing chemotherapy.</li>
      </ul>
      <div class="report-note-heading">High ANC (Neutrophilia):</div>
      <ul>
        <li>An ANC above the normal range is uncommon but can occur in certain medical conditions, such as acute bacterial infections or myeloproliferative disorders.</li>
        <li>High ANC is typically associated with an active or overwhelming bacterial infection, and additional clinical and laboratory assessments are needed to determine the underlying cause.</li>
      </ul>
    `
  },
  {
    title: "ABSOLUTE LYMPHOCYTE COUNT (ALC)",
    aliases: ["absolutelymphocytecount", "absolutelymphocytes"],
    normalRange: "1300 - 3500",
    unit: "cells/mcL",
    comments: ["Lymphocytes are a type of white blood cell that plays an important role in the immune system by recognizing and attacking foreign substances, such as bacteria, viruses, and cancer cells."],
    lowHeading: "Low ALC Causes :",
    lowCauses: [
      "Viral infections - Some viral infections, such as HIV, can lead to a decrease in lymphocytes.",
      "Cancer treatment - Chemotherapy or radiation therapy can decrease lymphocyte counts.",
      "Autoimmune disorders - Certain autoimmune disorders, such as lupus or rheumatoid arthritis, can cause lymphopenia.",
      "Malnutrition - Severe malnutrition can lead to a decrease in lymphocytes.",
      "Genetic disorders - Some genetic disorders, such as DiGeorge syndrome or Wiskott-Aldrich syndrome, can cause lymphopenia."
    ],
    highHeading: "High ALC Causes :",
    highCauses: [
      "Infections - Bacterial, viral, fungal, or parasitic infections can lead to an increase in lymphocytes.",
      "Autoimmune disorders - Conditions like lupus, rheumatoid arthritis, and multiple sclerosis can cause lymphocytosis.",
      "Cancer - Lymphocytosis can be a symptom of certain types of cancer, such as leukemia, lymphoma, or myeloma.",
      "Stress - Physical or emotional stress can cause temporary lymphocytosis.",
      "Exercise - Strenuous exercise can cause temporary lymphocytosis.",
      "Smoking - Chronic smoking can increase lymphocyte counts."
    ]
  },
  {
    title: "ABSOLUTE EOSINOPHIL COUNT (AEC)",
    aliases: ["absoluteeosinophilcount", "absoluteeosinophilscount", "absoluteeosinophils"],
    normalRange: "0 - 500",
    unit: "cells/mcL",
    comments: ["Eosinophils are a type of white blood cell that plays a role in the immune system's response to allergies and parasitic infections."],
    lowHeading: "Low AEC Causes :",
    lowCauses: [
      "Steroid medication use - Long-term use of corticosteroids",
      "Sepsis - A bacterial or fungal infection that has spread throughout the body",
      "Chemotherapy - Cancer treatment that can suppress the bone marrow",
      "Autoimmune diseases - Systemic lupus erythematosus (SLE), rheumatoid arthritis",
      "Bone marrow disorders - Aplastic anemia, myelodysplastic syndrome",
      "Malnutrition - Severe malnutrition, especially protein deficiency",
      "Overwhelming parasitic infections - Strongyloidiasis, visceral larva migrans"
    ],
    highHeading: "High AEC Causes :",
    highCauses: [
      "Allergic reactions - Food allergies, medication allergies, seasonal allergies, insect bites or stings, hay fever",
      "Parasitic infections - Hookworm, schistosomiasis, filariasis, toxocariasis",
      "Asthma - Uncontrolled asthma, exercise-induced asthma",
      "Autoimmune diseases - Churg-Strauss syndrome, eosinophilic granulomatosis with polyangiitis (EGPA)",
      "Skin disorders - Eczema, dermatitis herpetiformis",
      "Blood disorders - Chronic eosinophilic leukemia, hypereosinophilic syndrome"
    ]
  },
  {
    title: "ABSOLUTE BASOPHIL COUNT (ABC)",
    aliases: ["absolutebasophilcount", "absolutebasophilscount", "absolutebasophils"],
    normalRange: "0 - 300",
    unit: "cells/mcL",
    comments: ["Basophils play a role in the immune system's response to allergens and parasitic infections."],
    lowHeading: "Low ABC Causes :",
    lowCauses: [
      "Allergic reactions - Basophils are involved in the body's immune response to allergens, and an allergic reaction can cause an increase in their numbers.",
      "Chronic inflammation - Chronic inflammation caused by autoimmune diseases or infections can lead to an increase in the number of basophils.",
      "Myeloproliferative disorders - Certain blood disorders, such as chronic myeloid leukemia or polycythemia vera, can cause an increase in the number of basophils.",
      "Hypothyroidism - In some cases, a high absolute basophil count can be associated with an underactive thyroid gland."
    ],
    highHeading: "High ABC Causes :",
    highCauses: [
      "Acute infections - During acute infections, the number of basophils in the bloodstream may decrease.",
      "Stress - Stress hormones can suppress the production of basophils.",
      "Hyperthyroidism - In some cases, a low absolute basophil count can be associated with an overactive thyroid gland.",
      "Treatment with certain medications - Certain medications, such as corticosteroids, can cause a decrease in the number of basophils."
    ]
  },
  {
    title: "ABSOLUTE MONOCYTE COUNT (AMC)",
    aliases: ["absolutemonocytecount", "absolutemonocytescount", "absolutemonocytes"],
    normalRange: "200 - 950",
    unit: "cells/mcL",
    notesHtml: `
      <div class="report-note-heading">Comments :</div>
      <p class="absolute-paragraph">Monocytes play a role in the immune system's response to infection and inflammation.</p>
      <p class="absolute-paragraph">The purpose of an absolute monocytes count test is to measure the number of monocytes, a type of white blood cell, in a person's blood. Monocytes play an important role in the immune system's response to infection and inflammation.</p>
      <ul>
        <li>To diagnose and monitor infections</li>
        <li>To evaluate autoimmune diseases</li>
        <li>To monitor cancer treatment.</li>
        <li>To monitor chronic inflammatory diseases</li>
      </ul>
      <ul class="absolute-cause-list">
        <li><strong>High count cause</strong> - Possible infection or inflammation</li>
      </ul>
      <ul class="absolute-cause-list">
        <li><strong>Low count cause</strong> - Potential immune system dysfunction</li>
      </ul>
    `
  }
];

function getAbsoluteCountTemplate(test) {
  if (!normalizeParameterName(test?.name).includes("absolute")) return null;
  const parameterNames = (test?.parameters || []).map(parameter => normalizeParameterName(parameter.parameter_name));
  return ABSOLUTE_COUNT_TEMPLATES.find(template =>
    parameterNames.some(parameterName => template.aliases.some(alias =>
      parameterName === alias || parameterName.includes(alias)
    ))
  );
}

function isMchcTest(test) {
  const name = normalizeParameterName(test?.name);
  return name.startsWith("mchc")
    || name.includes("meancorpuscularhbconcentration")
    || name.includes("meancorpuscularhemoglobinconcentration")
    || name.includes("meancorpuscularhaemoglobinconcentration");
}

function isBloodGroupTest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return name.includes("bloodgroup") || (name.includes("abo") && name.includes("rh")) || code.startsWith("bgr");
}

function isDDimerTest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return name.includes("ddimer") || code.startsWith("ddi") || code.startsWith("dxd");
}

function isSickleCellMutationAnalysisTest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return name.includes("sicklecellanemiamutationanalysis") || code.startsWith("scm");
}

function isRtPcrTest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return name === "rtpcr" || name.includes("realtimertpcr") || code === "pf008";
}

function isTpmtGenotypingTest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return name.includes("thiopurinemethyltransferase") || code === "pf010";
}

function isCysticFibrosisNewbornScreenTest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return (name.includes("cysticfibrosis") && name.includes("newborn") && name.includes("screen")) || code === "pf066";
}

function isKftTest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return code === "kft001"
    || code.startsWith("kft")
    || name === "kidneyfunctiontestkft"
    || name.startsWith("kftrftkidneyrenalfunctiontest");
}

function isFactorIiFunctionalTest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return code === "pf067" || name === "factorii" || name === "factoriifunctional";
}

function isKaryotypeTest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return code === "pf068" || name === "karyotype";
}

function isLipidProfileTest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return code === "lipid" || name === "lipidprofile";
}

function isLftTest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return code === "lft001" || code.startsWith("lft") || name === "liverfunctiontestlft" || name.startsWith("lftliverfunctiontest");
}

function isHba1cTest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return code === "hba1c001"
    || name === "hba1c"
    || name.includes("hba1c")
    || name.includes("glycosylatedhemoglobin")
    || name.includes("glycosylatedhaemoglobin")
    || name.includes("glycatedhemoglobin")
    || name.includes("glycatedhaemoglobin");
}

function isVitaminD25HydroxyTest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return code === "vitd25oh"
    || name === "25ohvitamind"
    || (name.includes("vitamind") && (name.includes("25oh") || name.includes("25hydroxy")));
}

function isVitaminCTest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return code === "vitc" || name === "vitaminc" || name.includes("ascorbicacid");
}

function isVitaminB12Test(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return code === "vitb12" || name.includes("vitaminb12") || name.includes("cobalamin");
}

function isRandomBloodSugarTest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return code === "rbs" || name === "rbs" || name.includes("randombloodsugar");
}

function isFastingBloodSugarTest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return code === "fbs" || code === "fpg" || name === "fbs"
    || name.includes("fastingbloodsugar")
    || name.includes("fastingplasmaglucose")
    || name === "glucosefasting";
}

function isBTypeNatriureticPeptideTest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return code === "bnp" || code === "pf022" || name === "bnp"
    || name.includes("btypenatriureticpeptide")
    || name.includes("brainnatriureticpeptide");
}

function isCreatineKinaseTest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return code === "ck" || code === "pf023" || code === "creatinekinase"
    || name === "ck"
    || name.includes("creatinekinase")
    || name.includes("totalck");
}

function isBeta2MicroglobulinTest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return code === "b2m" || code === "beta2" || code === "beta2microglobulin"
    || name === "b2microglobulin"
    || name.includes("beta2microglobulin");
}

function isAltSgptTest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return code === "alt" || code === "sgpt"
    || name === "alt"
    || name === "sgptalt"
    || name === "altsgpt"
    || name.includes("alanineaminotransferase")
    || name.includes("alaninetransaminase");
}

function isDnphTest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return code === "dnph" || name === "dnph" || name.includes("dinitrophenylhydrazine");
}

function isPrealbuminTest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return code === "prealbumin" || name === "prealbumin" || name.includes("transthyretin");
}

function isHaptoglobinTest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return code === "haptoglobin" || code === "pf024" || name === "haptoglobin" || name.includes("haptoglobinserum");
}

function isGramStainBacterialVaginosisTest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return code === "bv" || code === "bvg" || code === "nugent"
    || name.includes("bacterialvaginosis")
    || name.includes("nugentscore");
}

function isAldolaseTest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return code === "aldolase" || name === "aldolase" || name.includes("aldolaseserum");
}

function isUrineProteinCreatinineRatioTest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return code === "upcr" || code === "pcrurine"
    || name.includes("proteincreatinineratio")
    || name.includes("urineproteincreatinine");
}

function isAlbuminCreatinineRatioTest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return code === "acr" || code === "uacr"
    || name === "acr"
    || name.includes("albumincreatinineratio")
    || name.includes("urinealbumincreatinineratio");
}

function isPostPrandialBloodSugarTest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return code === "ppbs" || code === "glucosepp"
    || name === "ppbs"
    || (name.includes("postprandial") && name.includes("glucose"));
}

function isTacrolimusTest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return code === "tacrolimus" || code === "pf025" || name === "tacrolimus" || name.includes("tacrolimuswholeblood");
}

function isPhosphorusTest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return code === "phosphorus" || code === "phosphate"
    || name === "phosphorusserum"
    || name === "inorganicphosphorusserum"
    || name === "phosphate";
}

function isAlkalinePhosphataseTest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return (
    code === "alp" ||
    code === "alkalinephosphatase" ||
    name === "alpalkalinephosphatase" ||
    name === "alkalinephosphatasealp" ||
    name.includes("alkalinephosphatase")
  );
}

function isClotRetractionTest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return (
    code === "clotretraction" ||
    code === "clo5203" ||
    name === "clotretractiontest" ||
    name === "clotretractiontime" ||
    name.includes("clotretraction")
  );
}

function isGroupBStrepTest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return code === "gbs" || code === "pf026" || name.includes("groupbstreptococcus") || name.includes("groupbstrep");
}

function isFungusKohPreparationTest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return code === "koh" || name === "kohpreparation" || name.includes("kohpreparation") || name.includes("fungusroutinekoh");
}

function isSputumAfbTest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return code === "sputumafb" || name === "sputumexaminationafb" || name.includes("sputumafbstain") || name.includes("sputumexaminationafb");
}

function isAfbCultureSensitivityTest(test) {
  const name = normalizeParameterName(test?.name);
  return name === "afbculturesensitivity" || name === "afbcultureandsensitivity"
    || name === "afbculturesensitivitybactecmethod" || name === "afbcultureandsensitivitybactecmethod";
}

function isStoolCultureTest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return code === "stoolculture" || name === "stoolculture" || name.includes("stoolculture");
}

function isUrineCultureTest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return code === "urineculture" || name === "urineculture" || name.includes("urineculture");
}

function isMalariaParasiteIdentificationTest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return code === "malariamp" || name === "malariaparasiteidentification" || name.includes("malariaparasites");
}

function isMycobacteriumCombinedPanelTest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return code === "pf028" || code === "mycobacterium" || name === "mycobacterialpanel" || name.includes("mycobacteriumcombinedpanel");
}

function isOvaAndParasiteTest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return code === "pf027" || code === "ovaparasite" || name === "ovaandparasiteexamination" || name.includes("ovaandparasite");
}

function isTripleMarkerTest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return code === "triplemarker" || code === "tri8385" || name === "triplemarker" || name.includes("triplescreening");
}

function isDoubleMarkerTest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return code === "doublemarker" || name === "doublemarker" || name.includes("dualmarker");
}

function isPax8Test(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return code === "pax8" || code === "pf036" || name === "pax8" || name.includes("pairedboxgene8");
}

function isGalectin3Test(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return code === "galectin3" || code === "pf035" || name === "galectin3";
}

function isHer2Test(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return code === "her2" || code === "pf034" || name.includes("her2") || name.includes("erb2");
}

function isDcpTest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return code === "dcp" || code === "pf033" || name.includes("desgammacarboxyprothrombin") || name.includes("pivkaii");
}

function isAfpTumorMarkerTest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return code === "afptumor" || code === "afp5204" || (name.includes("alpha") && name.includes("feto")) || name.includes("afptumormarker");
}

function isCa199Test(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return code === "ca199" || code === "cax8971" || name.includes("ca199") || name.includes("pancreaticcancermarker");
}

function isCa153Test(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return code === "ca153" || code === "cax7407" || name.includes("ca153") || name.includes("breastcancermarker");
}

function isCa125Test(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return code === "ca125" || code === "cax5035" || name.includes("ca125") || name.includes("ovariancancermarker");
}

function isTroponinITest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return code === "troponini" || code === "tro6148" || name.includes("troponini");
}

function isTroponinTTest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return code === "troponint" || code === "tro6900" || name.includes("troponint");
}

function isDengueNs1Test(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return code === "den5889" || code === "denguens1" || (name.includes("dengue") && name.includes("ns1"));
}

function isDengueIggTest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return code === "den2397" || code === "dengueigg" || (name.includes("dengue") && name.includes("igg"));
}

function isDengueIgmTest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return code === "den9867" || code === "dengueigm" || (name.includes("dengue") && name.includes("igm"));
}

function isRastTest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return code === "rast" || name.includes("radioallergosorbent") || name === "rasttest";
}

function isWidalTest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return code === "wid5948" || code === "widalslide" || name.includes("widalslide") || name === "widaltest";
}

function isCrpTest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return code === "crp" || code === "crp192" || name.includes("creactiveprotein");
}

function isHsCrpTest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return code === "pf053" || code === "hscrp" || name.includes("highsensitivitycreactiveprotein") || name.includes("hscrp");
}

function isBeta2GlycoproteinPanelTest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return code === "pf054" || code === "b2gpi" || (name.includes("beta2glycoprotein") && (name.includes("panel") || name.includes("antibody")));
}

function isToxoplasmaAntibodiesPanelTest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return code === "toxo001" || (name.includes("toxoplasma") && (name.includes("antibodies") || name.includes("antibody") || name.includes("panel")));
}

function isTorchProfileTest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return code === "torch" || name.includes("torchprofile") || name.includes("torchpanel");
}

function isTnfAlphaTest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return code === "tnfa" || (name.includes("necrosisfactor") && name.includes("tnf") && name.includes("alpha"));
}

function isRheumatoidFactorTest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return code === "rf001" || name === "rf" || name.includes("rheumatoidfactor");
}

function isAsoTiterTest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return code === "aso001" || name.includes("antistreptolysin") || name.includes("asotiter") || name === "aso";
}

function isTyphidotTest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return code === "typ1509" || code === "typhidot" || name.includes("typhidot");
}

function isVdrlTest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return code === "vdr4178" || code === "rpr8017" || code === "vdrlrpr" || name.includes("vdrl") || name === "rpr" || name === "rprtest";
}

function isHavIggTest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return code === "hep5558" || code === "ant4603" || code === "havigg" || ((name.includes("hepatitisa") || name.includes("antihav")) && name.includes("igg"));
}

function isHavIgmTest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return code === "hep7606" || code === "havigm" || ((name.includes("hepatitisa") || name.includes("antihav")) && name.includes("igm"));
}

function isHcvRapidScreeningTest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return code === "hcv3176" || code === "ant4369" || code === "hcvrapid" || ((name.includes("hcv") || name.includes("hepatitisc")) && (name.includes("rapid") || name.includes("card"))) || name === "antihcvantibody";
}

function isHbsAgTest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return code === "hbsag" || name === "hbsag" || (name.includes("hepatitisbsurfaceantigen") && !name.includes("quantitative") && !name.includes("profile"));
}

function isAntiHbcIgmTest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return code === "antihbcigm" || (name.includes("hepatitisbcoreantibody") && name.includes("igm")) || name === "antihbcigm";
}

function isHepatitisBProfileTest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return code === "hepbprofile" || name === "hepatitisbprofile" || name === "hbvprofile" || name.includes("hepatitisbviralprofile");
}

function isMantouxTest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return code === "mantoux" || name.includes("mantoux") || name.includes("tuberculinskintest");
}

function isHiv12ScreeningTest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return code === "hiv12screen" || name.includes("hiv12antibodiesscreening") || name.includes("hiv1and2antibodies");
}

function isAntiBTitreTest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return code === "antibtitre" || name.includes("antibtitre") || name.includes("antibtiter");
}

function isAntiATitreTest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return code === "antiatitre" || name.includes("antiatitre") || name.includes("antiatiter");
}

function isDustAllergyTest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return code === "dustallergy" || name === "dustallergy" || name.includes("housedustallergy");
}

function isDengueFeverPanelTest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return code === "denguepanel" || name === "denguefeverpanel" || name === "denguepanel" || name.includes("denguefeverantibodypanel");
}

function isG6PdTest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return code === "g6pd" || name === "g6pd" || name.includes("glucose6phosphatedehydrogenase");
}

function isAntiHbsTest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return code === "antihbs" || name === "antihbs" || (name.includes("hepatitisbsurfaceantibody") && !name.includes("profile"));
}

function isGangliosideGm1IggTest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return code === "gangliosidegm1igg" || name === "gangliosidegm1antibodyigg" || name === "gm1antibodyigg";
}

function isGangliosideGm1IgmTest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return code === "gangliosidegm1igm" || name === "gangliosidegm1antibodyigm" || name === "gm1antibodyigm";
}

function isGangliosideGd1aIggTest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return code === "gangliosidegd1aigg" || name === "gangliosidegd1aantibodyigg" || name === "gd1aantibodyigg";
}

function isGangliosideGd1aIgmTest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return code === "gangliosidegd1aigm" || name === "gangliosidegd1aantibodyigm" || name === "gd1aantibodyigm";
}

function isGangliosideGd1bIggTest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return code === "gangliosidegd1bigg" || name === "gangliosidegd1bantibodyigg" || name === "gd1bantibodyigg";
}

function isGangliosideGq1bIggTest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return code === "gangliosidegq1bigg" || name === "gangliosidegq1bantibodyigg" || name === "gq1bantibodyigg";
}

function isAntiHistoneAntibodiesTest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return code === "antihistone" || name === "antihistoneantibodies" || name === "histoneantibodies";
}

function isRibosomePAntibodiesTest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return code === "ribosomep" || name === "ribosomepantibodies" || name === "ribosomepantibodiesigg" || name === "ribosomalpantibodies";
}

function isAntiCcpTest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return code === "anticcp" || name === "anticcp" || name.includes("cycliccitrullinated");
}

function isImmunoglobulinIggTest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return code === "immunoglobulinigg" || name === "immunoglobulinigg" || name === "immunoglobuling" || name === "igg";
}

function isImmunoglobulinIgeTest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return code === "immunoglobulinige" || name === "immunoglobulinige" || name === "immunoglobuline" || name === "ige";
}

function isImmunoglobulinIgmTest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return code === "immunoglobulinigm" || name === "immunoglobulinigm" || name === "immunoglobulinm" || name === "igm";
}

function isImmunoglobulinIgaTest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return code === "immunoglobuliniga" || name === "immunoglobuliniga" || name === "immunoglobulina" || name === "iga";
}

function isVitaminETest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return code === "vite" || name === "vitamine" || name.includes("tocopherol");
}

function isVitaminB9Test(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return code === "vitb9"
    || name === "folicacid"
    || name === "folate"
    || name.includes("vitaminb9")
    || name.includes("folicacidfolate");
}

function isVitaminKTest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return code === "vitk" || name === "vitamink" || name.includes("phylloquinone");
}

function isLdlCholesterolTest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return code === "ldl"
    || name === "ldlcholesterol"
    || name === "lowdensitylipoproteincholesterol";
}

function isHdlCholesterolTest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return code === "hdl"
    || name === "hdlcholesterol"
    || name === "highdensitylipoproteincholesterol";
}

function isIndirectBilirubinTest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return code === "bilind"
    || name === "indirectbilirubin"
    || name === "bilirubinindirect";
}

function isCalciumTest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return code === "calcium"
    || name === "calcium"
    || name === "calciumserum"
    || name === "serumcalcium";
}

function isFerritinTest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return code === "ferritin" || name === "ferritin" || name === "ferritinserum";
}

function isCPeptideTest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return code === "cpeptide"
    || name === "cpeptide"
    || name === "cpeptidelevel"
    || name === "cpeptidefasting";
}

function isVldlCholesterolTest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return code === "vldl"
    || name === "vldlcholesterol"
    || name === "verylowdensitylipoproteincholesterol";
}

function isComprehensiveMetabolicPanelTest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return code === "cmp"
    || name === "cmp"
    || name === "comprehensivemetabolicpanel"
    || name === "comprehensivemetabolicpanelcmp";
}

function isElectrolyteProfileTest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return code === "electrolytes"
    || name === "electrolytes"
    || name === "electrolyteprofile"
    || name === "serumelectrolytes";
}

function isPotassiumTest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return code === "potassium"
    || name === "potassiumserum"
    || name === "serumpotassium";
}

function isAstSgotTest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return code === "ast"
    || name === "sgotast"
    || name === "astsgot"
    || name === "aspartateaminotransferaseastsgot"
    || name === "aspartateaminotransferaseast";
}

function isGlobulinTest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return code === "globulin" || name === "globulin" || name === "globulinserum" || name === "serumglobulin";
}

function isAlbuminTest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return code === "albumin" || name === "albumin" || name === "albuminserum" || name === "serumalbumin";
}

function isBunTest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return code === "bun"
    || name === "bun"
    || name === "bunbloodureanitrogen"
    || name === "bloodureanitrogenbun"
    || name === "bloodureanitrogen";
}

function isSodiumTest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return code === "sodium" || name === "sodium" || name === "sodiumserum" || name === "serumsodium";
}

function isIronTest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return code === "iron" || name === "iron" || name === "ironserum" || name === "serumiron";
}

function isLacticAcidTest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return code === "lactate"
    || code === "lacticacid"
    || name === "lacticacidlactate"
    || name === "lacticacid"
    || name === "lactate"
    || name === "lactateplasma";
}

function isMagnesiumTest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return code === "magnesium" || name === "magnesium" || name === "magnesiumserum" || name === "serummagnesium";
}

function isLipaseTest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return code === "lipase" || name === "lipase" || name === "lipaseserum" || name === "serumlipase";
}

function isAmylaseTest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return code === "amylase" || name === "amylase" || name === "amylaseserum" || name === "serumamylase";
}

function isGgtTest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return code === "ggt" || code === "ggtp" || name === "ggt" || name === "ggtp"
    || name === "gammaglutamyltransferase" || name === "gammaglutamyltransferaseggt";
}

function isChlorideTest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return code === "chloride" || name === "chloride" || name === "chlorideserum" || name === "serumchloride";
}

function isCreatinineTest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return code === "creatinine" || name === "creatinine" || name === "creatinineserum" || name === "serumcreatinine";
}

function isIonizedCalciumTest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return code === "icalcium" || code === "ionizedcalcium"
    || name === "ionizedcalciumicalcium" || name === "ionizedcalcium" || name === "icalcium" || name === "calciumionized";
}

function isFlecainideTest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return code === "flecainide" || name === "flecainide" || name === "flecainideserum" || name === "serumflecainide";
}

function isPhenobarbitalTest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return code === "phenobarbital" || code === "phenobarbitone" || code === "phenobarbitole"
    || name === "phenobarbital" || name === "phenobarbitone" || name === "phenobarbitole" || name === "phenobarbitalserum" || name === "phenobarbitoneserum" || name === "phenobarbitoleserum";
}

function isDigoxinTest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return code === "digoxin" || code.startsWith("dig") || name === "digoxin" || name.includes("digoxinserum");
}

function isKetoneBodyTest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return code === "ketonebody" || code === "betahydroxybutyrate"
    || name === "ketonebodybetahydroxybutyrate" || name === "ketonebody" || name === "betahydroxybutyrate";
}

function isUricAcidTest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return code === "uricacid" || name === "uricacid" || name === "uricacidserum" || name === "serumuricacid";
}

function isTibcTest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return code === "tibc" || name === "tibc" || name === "totalironbindingcapacitytibc" || name === "tibctotalironbindingcapacity";
}

function isSerumOsmolalityTest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return code === "osmolality" || code === "serumosmolality"
    || name === "serumosmolality" || name === "osmolalityserum" || name === "osmolality";
}

function isCreatinine24HourUrineTest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return code === "creatinine24hoururine" || code === "creatinine24hurine"
    || (name.includes("creatinine") && name.includes("24") && name.includes("urine"));
}

function isSemenAnalysisTest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return code === "semenanalysis" || code === "seminogram" || code === "semen001"
    || name === "semenanalysis" || name === "semenanalysisseminogram" || name === "seminogram";
}

function isUrineCotinineTest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return code === "pf056" || code === "urinecotinine"
    || name === "urinecotinine" || name === "cotinineurine";
}

function isUrineGlucoseTest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return code === "pf055" || code === "urineglucose"
    || name === "urineglucose" || name === "glucoseurine";
}

function isPorphyrinsTest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return code === "porphy001" || code === "porphyrins" || name === "porphyrins" || name === "bloodporphyrins";
}

function isOccultBloodStoolTest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return code === "occult001" || code === "occultblood" || code === "stooloccultblood"
    || name === "occultbloodstoolexamination" || name === "stooloccultblood" || name === "stooloccultbloodexamination";
}

function isCsfAnalysisTest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return code === "csf001" || code === "csfanalysis"
    || name === "cerebrospinalfluidcsfanalysis" || name === "csfanalysis" || name === "cerebrospinalfluidanalysis";
}

function isTshTest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return code === "tsh001" || code === "tsh" || name === "tsh" || name === "tshserum"
    || name === "thyroidstimulatinghormonetsh" || name === "thyroidstimulatinghormone";
}

function isThyroidProfileTest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return code === "thypro001" || code === "thyroidprofile" || code === "tft"
    || name === "thyroidprofile" || name === "thyroidfunctiontest" || name === "thyroidfunctionprofile";
}

function isThyroidAntibodiesTest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return code === "pf059" || code === "thyab001" || code === "thyroidantibodies"
    || name === "thyroidantibodies" || name === "thyroidantibodyprofile"
    || name === "thyroidantibodiespanel";
}

function isTriiodothyronineTotalTest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return code === "t3total001" || code === "t3total"
    || name === "triiodothyroninet3total" || name === "t3total"
    || name === "totaltriiodothyronine";
}

function isTestosteroneTotalTest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return code === "testo001" || code === "testosteronetotal"
    || name === "testosteronetotal" || name === "testosterone";
}

function isProgesteroneTest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return code === "prog001" || code === "progesterone"
    || name === "progesterone" || name === "progesteroneserum";
}

function isCortisoneTest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return code === "cortisone001" || code === "cortisone"
    || name === "cortisone" || name === "cortisoneserum";
}

function isBetaHcgPregnancyTest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return code === "betahcg001" || code === "hcgbetatotal"
    || name === "hcgbetatotalpregnancy" || name === "betahcgtotal"
    || name === "betahcgpregnancy" || name === "humanchorionicgonadotropinbetatotal";
}

function isProlactinTest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return code === "prl001" || code === "prolactin"
    || name === "prolactin" || name === "prolactinprl" || name === "prolactinserum";
}

function isDheaTest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return code === "dhea001" || code === "dhea"
    || name === "dehydroepiandrosteronedhea" || name === "dehydroepiandrosterone"
    || name === "dhea" || name === "dheaserum";
}

function isEstradiolTest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return code === "e2001" || code === "estradiol"
    || name === "estradiole2" || name === "estradiol" || name === "estradiolserum";
}

function isLuteinizingHormoneTest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return code === "pf060" || code === "lh001" || code === "lh"
    || name === "luteinizinghormonelh" || name === "luteinisinghormonelh"
    || name === "luteinizinghormone" || name === "luteinisinghormone" || name === "lh";
}

function isFollicleStimulatingHormoneTest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return code === "fsh001" || code === "fsh"
    || name === "folliclestimulatinghormonefsh" || name === "folliclestimulatinghormone"
    || name === "fsh";
}

function isThyroxineTotalTest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return code === "t4total001" || code === "t4total"
    || name === "thyroxinet4total" || name === "t4total" || name === "totalthyroxine";
}

function isCalcitoninTest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return code === "calcitonin001" || code === "calcitonin"
    || name === "calcitonin" || name === "calcitoninserum";
}

function isInhibinATest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return code === "pf062" || code === "inhibina001" || code === "inhibina"
    || name === "inhibina" || name === "inhibinareproductivemarker";
}

function isInhibinBTest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return code === "pf063" || code === "inhibinb001" || code === "inhibinb"
    || name === "inhibinb" || name === "inhibinbserum";
}

function isPappATest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return code === "pf061" || code === "pappa001" || code === "pappa"
    || name === "pappa" || name === "pregnancyassociatedplasmaproteina";
}

function isDheasTest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return code === "dheas001" || code === "dheas"
    || name === "dehydroepiandrosteronesulphatedheas" || name === "dehydroepiandrosteronesulfatedheas"
    || name === "dehydroepiandrosteronesulphate" || name === "dehydroepiandrosteronesulfate"
    || name === "dheas" || name === "dheasserum";
}

function isFnacTest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return code === "fnac001" || code === "fnac"
    || name === "fineneedleaspirationcytologyfnac" || name === "fineneedleaspirationcytology"
    || name.startsWith("fnac");
}

function isPapSmearTest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return code === "papsmear001" || code === "papsmear" || code === "pap8254"
    || name === "papsmear" || name === "cytologypapsmearexamination";
}

function isHistopathologyReportTest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return ["pf057", "pf058", "skinbio001", "colonbio001"].includes(code)
    || name === "prostatebiopsy" || name === "liverbiopsy" || name === "histopathologyskinbiopsy"
    || name === "skinbiopsy" || name === "histopathologycolonoscopywithpolypectomybiopsy"
    || name === "colonoscopywithpolypectomybiopsy";
}

function isArterialBloodGasTest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return code === "abg" || code === "arterialbloodgas" || code === "arterialbloodgasanalysis"
    || name === "bloodgasanalysisarterial" || name === "arterialbloodgasanalysis"
    || name === "arterialbloodgas";
}

function isManganeseBloodTest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return code === "manganese" || code === "bloodmanganese"
    || name === "manganeseblood" || name === "bloodmanganese";
}

function isSeleniumSerumTest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return code === "selenium" || code === "serumselenium"
    || name === "selenium" || name === "seleniumserum" || name === "serumselenium";
}

function getReferenceStatus(value, referenceRange) {
  const numericValue = Number(String(value || "").replace(/,/g, ""));
  if (!Number.isFinite(numericValue)) return null;

  const range = getRangeBounds(referenceRange);
  if (range) {
    if (numericValue < range[0]) return { label: "Low", className: "low-val" };
    if (numericValue > range[1]) return { label: "High", className: "high-val" };
    return { label: "Normal", className: "normal-val" };
  }

  const upperLimit = String(referenceRange || "").match(/^\s*<\s*(-?\d+(?:\.\d+)?)/);
  if (upperLimit) {
    return numericValue > Number(upperLimit[1])
      ? { label: "High", className: "high-val" }
      : { label: "Normal", className: "normal-val" };
  }

  const lowerLimit = String(referenceRange || "").match(/^\s*>\s*(-?\d+(?:\.\d+)?)/);
  if (lowerLimit) {
    return numericValue < Number(lowerLimit[1])
      ? { label: "Low", className: "low-val" }
      : { label: "Normal", className: "normal-val" };
  }

  return null;
}

function getLipidStatus(type, value) {
  const numericValue = Number(String(value || "").replace(/,/g, ""));
  if (!Number.isFinite(numericValue)) return null;

  if (type === "total") {
    if (numericValue >= 240) return { label: "High", className: "high-val" };
    if (numericValue >= 200) return { label: "Borderline High", className: "high-val" };
  } else if (type === "triglycerides") {
    if (numericValue >= 500) return { label: "Very High", className: "high-val" };
    if (numericValue >= 200) return { label: "High", className: "high-val" };
    if (numericValue >= 150) return { label: "Borderline High", className: "high-val" };
  } else if (type === "hdl") {
    if (numericValue < 40) return { label: "Low", className: "low-val" };
  } else if (type === "ldl") {
    if (numericValue >= 190) return { label: "Very High", className: "high-val" };
    if (numericValue >= 160) return { label: "High", className: "high-val" };
    if (numericValue >= 130) return { label: "Borderline High", className: "high-val" };
    if (numericValue >= 100) return { label: "Above Desirable", className: "high-val" };
  } else if (type === "vldl") {
    if (numericValue >= 30) return { label: "High", className: "high-val" };
  } else if (type === "nonHdl") {
    if (numericValue >= 220) return { label: "Very High", className: "high-val" };
    if (numericValue >= 190) return { label: "High", className: "high-val" };
    if (numericValue >= 160) return { label: "Borderline High", className: "high-val" };
    if (numericValue >= 130) return { label: "Above Desirable", className: "high-val" };
  }

  return { label: "Normal", className: "normal-val" };
}

function getHba1cStatus(value) {
  const numericValue = Number(String(value || "").replace(/,/g, ""));
  if (!Number.isFinite(numericValue)) return null;
  if (numericValue < 5.7) return { label: "Normal", className: "normal-val" };
  if (numericValue < 6.5) return { label: "Prediabetes", className: "high-val" };
  return { label: "High", className: "high-val" };
}

function getGlucoseStatus(value, upperNormalLimit) {
  const numericValue = Number(String(value || "").replace(/,/g, ""));
  if (!Number.isFinite(numericValue)) return null;
  if (numericValue < 70) return { label: "Low", className: "low-val" };
  if (numericValue > 200) return { label: "Very High", className: "high-val" };
  if (numericValue > upperNormalLimit) return { label: "High", className: "high-val" };
  return { label: "Normal", className: "normal-val" };
}

function getFastingPlasmaGlucoseStatus(value) {
  const numericValue = Number(String(value || "").replace(/,/g, ""));
  if (!Number.isFinite(numericValue)) return null;
  if (numericValue < 70) return { label: "Low", className: "low-val" };
  if (numericValue < 100) return { label: "Normal", className: "normal-val" };
  if (numericValue <= 126) return { label: "Prediabetes", className: "high-val" };
  return { label: "Diabetes", className: "high-val" };
}

function getPostPrandialGlucoseStatus(value) {
  const numericValue = Number(String(value || "").replace(/,/g, ""));
  if (!Number.isFinite(numericValue)) return null;
  if (numericValue < 100) return { label: "Low", className: "low-val" };
  if (numericValue <= 140) return { label: "Normal", className: "normal-val" };
  if (numericValue < 200) return { label: "Prediabetes", className: "high-val" };
  return { label: "Very High", className: "high-val" };
}

function getTacrolimusStatus(value) {
  const numericValue = Number(String(value || "").replace(/,/g, ""));
  if (!Number.isFinite(numericValue)) return null;
  if (numericValue < 10) return { label: "Therapeutic range", className: "normal-val" };
  return { label: "Toxic range", className: "high-val" };
}

function getClotRetractionStatus(value) {
  const numericValue = Number(String(value || "").replace(/,/g, ""));
  if (!Number.isFinite(numericValue)) return null;
  if (numericValue < 48) return { label: "Low", className: "low-val" };
  if (numericValue > 64) return { label: "High", className: "high-val" };
  return { label: "Normal", className: "normal-val" };
}

function getGroupBStrepStatus(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return null;
  if (normalized.includes("non-reactive") || normalized.includes("nonreactive") || normalized.includes("negative") || normalized.includes("not detected") || normalized.includes("absent")) {
    return { resultLabel: "Non-reactive", referenceLabel: "Negative", className: "normal-val" };
  }
  if (normalized.includes("reactive") || normalized.includes("positive") || normalized.includes("detected") || normalized.includes("present")) {
    return { resultLabel: "Reactive", referenceLabel: "Positive", className: "high-val" };
  }
  return { resultLabel: value, referenceLabel: "Negative", className: "" };
}

function getCultureStatus(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return null;
  if (normalized.includes("absent") || normalized.includes("no growth") || normalized.includes("negative")) {
    return { label: "Absent", className: "normal-val" };
  }
  if (normalized.includes("present") || normalized.includes("growth") || normalized.includes("positive")) {
    return { label: "Present", className: "high-val" };
  }
  return { label: value, className: "" };
}

function getMalariaParasiteStatus(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return null;
  if (normalized.includes("no mp") || normalized.includes("negative") || normalized.includes("not seen") || normalized.includes("absent")) {
    return { label: "No MP seen in smears examined", className: "normal-val" };
  }
  if (normalized.includes("mp") || normalized.includes("positive") || normalized.includes("seen") || normalized.includes("present")) {
    return { label: "MP seen in smears examined", className: "high-val" };
  }
  return { label: value, className: "" };
}

function getDetectedNotDetectedStatus(value, { negativeClassName = "normal-val" } = {}) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return null;
  if (normalized.includes("not detected") || normalized.includes("negative") || normalized.includes("not seen") || normalized.includes("absent") || normalized === "nil") {
    return { resultLabel: "Not Detected", referenceLabel: "Negative", className: negativeClassName };
  }
  if (normalized.includes("detected") || normalized.includes("positive") || normalized.includes("present")) {
    return { resultLabel: "Detected", referenceLabel: "Positive", className: "high-val" };
  }
  return { resultLabel: value, referenceLabel: "Negative", className: "" };
}

function getPositiveNegativeStatus(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return null;
  if (normalized.includes("negative") || normalized.includes("not detected") || normalized.includes("absent") || normalized.includes("non-reactive") || normalized.includes("nonreactive")) {
    return { label: "Negative", className: "normal-val" };
  }
  if (normalized.includes("positive") || normalized.includes("detected") || normalized.includes("present") || normalized.includes("reactive")) {
    return { label: "Positive", className: "high-val" };
  }
  return { label: value, className: "" };
}

function getHer2Status(value) {
  const numericValue = Number(String(value || "").replace(/,/g, ""));
  if (!Number.isFinite(numericValue)) return null;
  return numericValue >= 2
    ? { label: "Positive", className: "high-val" }
    : { label: "Negative", className: "normal-val" };
}

function getAldolaseStatus(value) {
  const numericValue = Number(String(value || "").replace(/,/g, ""));
  if (!Number.isFinite(numericValue)) return null;
  if (numericValue < 2) return { label: "Low", className: "low-val" };
  if (numericValue <= 7.6) return { label: "Normal", className: "normal-val" };
  return { label: "High", className: "high-val" };
}

function getNugentScoreStatus(value) {
  const numericValue = Number(String(value || "").replace(/,/g, ""));
  if (!Number.isFinite(numericValue)) return null;
  if (numericValue <= 3) return { label: "Negative", className: "normal-val" };
  if (numericValue <= 6) return { label: "Intermediate", className: "low-val" };
  return { label: "Indicative of BV", className: "high-val" };
}

function getDigoxinStatus(value) {
  const numericValue = Number(String(value || "").replace(/,/g, ""));
  if (!Number.isFinite(numericValue)) return null;
  if (numericValue < 0.8) return { label: "Low", className: "low-val" };
  if (numericValue <= 2) return { label: "Therapeutic", className: "normal-val" };
  return { label: "High", className: "high-val" };
}

function getBeta2MicroglobulinStatus(value) {
  const numericValue = Number(String(value || "").replace(/,/g, ""));
  if (!Number.isFinite(numericValue)) return null;
  if (numericValue < 3500) return { label: "Normal", className: "normal-val" };
  if (numericValue <= 5500) return { label: "Stage II", className: "high-val" };
  return { label: "Stage III", className: "high-val" };
}

function getDetectedStatus(value) {
  const normalized = normalizeParameterName(value);
  if (!normalized) return null;
  if (normalized === "negative" || normalized.includes("notdetected")) {
    return { label: "Negative", className: "normal-val" };
  }
  if (normalized === "positive" || (normalized.includes("detected") && !normalized.includes("notdetected"))) {
    return { label: "Positive", className: "high-val" };
  }
  return null;
}

function getSickleCellMutationStatus(value) {
  const normalized = String(value || "").trim().toLowerCase();

  if (!normalized) return null;
  if (normalized.includes("not detected") || normalized === "negative" || normalized.includes("mutation not detected")) {
    return { label: "Negative", className: "normal-val" };
  }
  if (normalized.includes("detected") || normalized === "positive") {
    return { label: "Positive", className: "high-val" };
  }

  return null;
}

function isMchTest(test) {
  const name = normalizeParameterName(test?.name);
  return !name.startsWith("mchc")
    && (name === "mch" || name.startsWith("mch") || name.includes("meancorpuscularhaemoglobin") || name.includes("meancorpuscularhemoglobin"));
}

function isMcvTest(test) {
  const name = normalizeParameterName(test?.name);
  return name === "mcv" || name.startsWith("mcv") || name.includes("meancorpuscularvolume");
}

function isMpvTest(test) {
  const name = normalizeParameterName(test?.name);
  return name === "mpv" || name.startsWith("mpv") || name.includes("meanplateletvolume");
}

function isHctPcvTest(test) {
  const name = normalizeParameterName(test?.name);
  return name.startsWith("hct") || name.startsWith("pcv") || name.includes("hematocrit") || name.includes("haematocrit");
}

function isEsrTest(test) {
  const name = normalizeParameterName(test?.name);
  return name === "esr" || name.startsWith("esr") || name.includes("erythrocytesedimentationrate");
}

function isPdwTest(test) {
  const name = normalizeParameterName(test?.name);
  return name === "pdw" || name.startsWith("pdw") || name.includes("plateletdistributionwidth");
}

function isHemoglobinTest(test) {
  const name = normalizeParameterName(test?.name);
  return !name.includes("fetal")
    && !name.includes("foetal")
    && !name.includes("hba1c")
    && !name.includes("mean")
    && (name === "hemoglobin" || name === "haemoglobin" || name.startsWith("hbhemoglobin") || name.startsWith("hbhaemoglobin"));
}

function isProthrombinTimeTest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return name === "pt" || name.includes("prothrombintime") || code.startsWith("pt");
}

function isApttTest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return name === "aptt"
    || name.includes("activatedpartialthromboplastin")
    || code.startsWith("aptt");
}

function isDlcTest(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  return name === "dlc"
    || code.startsWith("dlc")
    || (name.includes("differential") && (name.includes("leucocyte") || name.includes("leukocyte")));
}

function isDirectCoombsTest(test) {
  const name = normalizeParameterName(test?.name);
  return name.includes("coombs") && name.includes("direct");
}

function isIndirectCoombsTest(test) {
  const name = normalizeParameterName(test?.name);
  return name.includes("coombs") && name.includes("indirect");
}

function isFibrinogenTest(test) {
  return normalizeParameterName(test?.name) === "fibrinogen";
}

function isReticulocyteCountTest(test) {
  return normalizeParameterName(test?.name).includes("reticulocytecount");
}

function isClottingTimeTest(test) {
  const name = normalizeParameterName(test?.name);
  return name === "ctclottingtime" || name === "clottingtime";
}

function isBleedingTimeTest(test) {
  const name = normalizeParameterName(test?.name);
  return name === "btbleedingtime" || name === "bleedingtimebt" || name === "bleedingtime";
}

function isCoagulationProfileTest(test) {
  return normalizeParameterName(test?.name) === "coagulationprofile";
}

function isFactorViiiTest(test) {
  const name = normalizeParameterName(test?.name);
  return name.includes("factorviii")
    && (name.includes("antihemophilic") || name.includes("functional") || name.includes("activity"));
}

function isFactorVTest(test) {
  const name = normalizeParameterName(test?.name);
  return name === "factorv" || name === "factorvdeficiency";
}

function isFactorViiTest(test) {
  const name = normalizeParameterName(test?.name);
  return name.includes("factorvii") && !name.includes("factorviii");
}

function isFactorIxTest(test) {
  return normalizeParameterName(test?.name).includes("factorix");
}

function isFactorXTest(test) {
  const name = normalizeParameterName(test?.name);
  return name.includes("factorx")
    && !name.includes("factorxi")
    && !name.includes("factorxii")
    && !name.includes("factorxiii");
}

function isFactorXiTest(test) {
  const name = normalizeParameterName(test?.name);
  return name.includes("factorxi")
    && !name.includes("factorxii")
    && !name.includes("factorxiii");
}

function isPeripheralBloodSmearTest(test) {
  const name = normalizeParameterName(test?.name);
  return name === "peripheralbloodsmearexamination" || name === "peripheralsmear";
}

function isFactorXiiTest(test) {
  const name = normalizeParameterName(test?.name);
  return name === "factorxii" || name === "factorxiideficiency";
}

function isFactorXiiiTest(test) {
  const name = normalizeParameterName(test?.name);
  return name === "factorxiii" || name === "factorxiiideficiency";
}

function isRbcCountTest(test) {
  const name = String(test?.name || "").toLowerCase();
  const code = String(test?.code || "").toLowerCase();
  return code === "rbc" || (name.includes("red blood cell") && name.includes("count"));
}

function isPlateletCountTest(test) {
  return normalizeParameterName(test?.name) === "plateletcount";
}

function isTlcCountTest(test) {
  // A TLC component must not turn an explicitly named panel into a TLC-only report.
  if (getCombinationDefinition(test)) return false;
  const name = normalizeParameterName(test?.name);
  const code = String(test?.code || "").toLowerCase();
  const hasTlcParameter = (test?.parameters || []).some(parameter => {
    const parameterName = normalizeParameterName(parameter.parameter_name);
    return parameterName === "tlc"
      || parameterName === "wbccount"
      || parameterName === "totalwbccount"
      || parameterName.includes("totalleucocytecount")
      || parameterName.includes("totalleukocytecount");
  });

  return hasTlcParameter
    || code.startsWith("tlc")
    || name.includes("whitebloodcell")
    || name.includes("totalleucocytecount")
    || name.includes("totalleukocytecount");
}

function buildRbcReportBody(test) {
  const rbcResult = (test.parameters || []).find(parameter => {
    const name = normalizeParameterName(parameter.parameter_name);
    return name === "totalrbccount" || name === "erythrocytes" || name === "rbccount";
  });
  const normalRange = rbcResult?.normal_range || "4.5 - 5.5";
  const unit = rbcResult?.unit || "mill/cumm";
  const value = rbcResult?.value || "-";
  const status = getCbcStatus(rbcResult?.value, normalRange);
  const statusText = status && status.label !== "Normal"
    ? ` <span class="rbc-status ${status.className}">${status.label}</span>`
    : "";

  return `
    <table class="results-table rbc-table">
      <thead>
        <tr>
          <th style="width: 40%">Investigation</th>
          <th style="width: 25%">Result</th>
          <th style="width: 22%">Reference Value</th>
          <th style="width: 13%">Unit</th>
        </tr>
      </thead>
      <tbody>
        <tr class="rbc-sample-row">
          <td>Primary Sample Type</td>
          <td colspan="3">${escapeHtml(test.sample_type || "Blood")}</td>
        </tr>
        <tr class="rbc-section"><td colspan="4">RBC COUNT</td></tr>
        <tr>
          <td>Total RBC Count</td>
          <td><span class="${status?.className || ""}">${escapeHtml(value)}</span>${statusText}</td>
          <td>${escapeHtml(normalRange)}</td>
          <td>${escapeHtml(unit)}</td>
        </tr>
      </tbody>
    </table>
    <div class="rbc-notes">
      <div class="report-note-heading">Comments :</div>
      <ul>
        <li>RBC test measures the number of red blood cells in a blood sample.</li>
        <li>It is a common blood test used to evaluate overall health and diagnose certain medical conditions.</li>
        <li>RBC count provides information about oxygen-carrying capacity and blood cell production.</li>
      </ul>
      <div class="report-note-heading">Low RBC Count Causes :</div>
      <ul>
        <li>Anemia - Iron deficiency, chronic diseases</li>
        <li>Bleeding - Trauma, ulcers, heavy menstruation</li>
        <li>Bone marrow disorders - Leukemia, myelodysplastic syndrome</li>
        <li>Nutritional deficiencies - Vitamin B12 or folate deficiency</li>
        <li>Kidney disease - Decreased erythropoietin production</li>
        <li>Medications - Chemotherapy, certain medications</li>
      </ul>
      <div class="report-note-heading">High RBC Count Causes :</div>
      <ul>
        <li>Polycythemia - Increased production of red blood cells</li>
        <li>Dehydration - Concentration of red blood cells due to fluid loss</li>
        <li>Lung diseases - Chronic obstructive pulmonary disease (COPD)</li>
        <li>Kidney disease - Increased production of erythropoietin</li>
        <li>Certain medications - Steroids, diuretics</li>
      </ul>
      <p class="instrument-note"><strong>Instruments:</strong> Fully automated cell counter - Mindray 300</p>
    </div>
  `;
}

function buildPlateletReportBody(test) {
  const plateletResult = (test.parameters || []).find(parameter =>
    normalizeParameterName(parameter.parameter_name) === "plateletcount"
  );
  const normalRange = plateletResult?.normal_range || "150000 - 410000";
  const unit = plateletResult?.unit || "cumm";
  const value = plateletResult?.value || "-";
  const status = getCbcStatus(plateletResult?.value, normalRange);
  const statusText = status && status.label !== "Normal"
    ? ` <span class="platelet-status ${status.className}">${status.label}</span>`
    : "";

  return `
    <table class="results-table platelet-table">
      <thead>
        <tr>
          <th style="width: 40%">Investigation</th>
          <th style="width: 25%">Result</th>
          <th style="width: 22%">Reference Value</th>
          <th style="width: 13%">Unit</th>
        </tr>
      </thead>
      <tbody>
        <tr class="platelet-sample-row">
          <td>Primary Sample Type</td>
          <td colspan="3">${escapeHtml(test.sample_type || "Blood")}</td>
        </tr>
        <tr>
          <td><strong>Platelet Count</strong><div class="platelet-method">Electrical impedance</div></td>
          <td><span class="${status?.className || ""}">${escapeHtml(value)}</span>${statusText}</td>
          <td>${escapeHtml(normalRange)}</td>
          <td>${escapeHtml(unit)}</td>
        </tr>
      </tbody>
    </table>
    <div class="platelet-notes">
      <div class="report-note-heading">Comments :</div>
      <ul>
        <li>Platelets are small, colorless cell fragments that help in blood clotting to prevent bleeding.</li>
      </ul>
      <div class="report-note-heading">Low Platelet Count Causes :</div>
      <ul>
        <li>Viral infections, such as hepatitis C or HIV</li>
        <li>Certain medications, such as heparin, chemotherapy drugs, or antibiotics</li>
        <li>Autoimmune disorders, such as lupus or idiopathic thrombocytopenic purpura (ITP)</li>
        <li>Heavy alcohol consumption</li>
        <li>Bone marrow disorders, such as leukemia or myelodysplastic syndrome (MDS)</li>
        <li>Nutritional deficiencies, such as vitamin B12 or folate deficiency</li>
        <li>Pregnancy complications, such as preeclampsia or HELLP syndrome</li>
        <li>Certain genetic disorders, such as Wiskott-Aldrich syndrome or Fanconi anemia</li>
      </ul>
      <div class="report-note-heading">High Platelet Count Causes :</div>
      <ul>
        <li>Chronic infections or inflammatory disorders, such as tuberculosis, hepatitis, or rheumatoid arthritis</li>
        <li>Trauma, surgery, or splenectomy (surgical removal of the spleen)</li>
        <li>Cancer or blood disorders such as leukemia, lymphoma, or myeloproliferative neoplasms (MPNs)</li>
        <li>Certain medications, such as aspirin, heparin, or estrogen</li>
        <li>Iron deficiency anemia or other nutritional deficiencies</li>
        <li>Genetic mutations or inherited conditions, such as essential thrombocythemia (ET) or familial thrombocytosis</li>
        <li>Smoking, obesity, or high cholesterol levels</li>
      </ul>
    </div>
  `;
}

function buildTlcReportBody(test) {
  const tlcResult = (test.parameters || []).find(parameter => {
    const name = normalizeParameterName(parameter.parameter_name);
    return name === "tlc"
      || name === "wbccount"
      || name === "totalwbccount"
      || name.includes("totalleucocytecount")
      || name.includes("totalleukocytecount");
  });
  const normalRange = tlcResult?.normal_range || "4000 - 11000";
  const unit = tlcResult?.unit || "cumm";
  const value = tlcResult?.value || "-";
  const status = getCbcStatus(tlcResult?.value, normalRange);
  const statusText = status && status.label !== "Normal"
    ? ` <span class="tlc-status ${status.className}">${status.label}</span>`
    : "";

  return `
    <table class="results-table tlc-table">
      <thead>
        <tr>
          <th style="width: 40%">Investigation</th>
          <th style="width: 25%">Result</th>
          <th style="width: 22%">Reference Value</th>
          <th style="width: 13%">Unit</th>
        </tr>
      </thead>
      <tbody>
        <tr class="tlc-sample-row">
          <td>Primary Sample Type</td>
          <td colspan="3">${escapeHtml(test.sample_type || "Blood")}</td>
        </tr>
        <tr>
          <td><strong>Total Leucocyte Count (TLC)</strong><div class="tlc-method">Electrical Impedance</div></td>
          <td><span class="${status?.className || ""}">${escapeHtml(value)}</span>${statusText}</td>
          <td>${escapeHtml(normalRange)}</td>
          <td>${escapeHtml(unit)}</td>
        </tr>
      </tbody>
    </table>
    <div class="tlc-notes">
      <div class="report-note-heading">Comments :</div>
      <ul>
        <li>WBC stands for white blood cell, which is a type of blood cell that is responsible for fighting infections and diseases in the body.</li>
      </ul>
      <div class="report-note-heading">Low WBC Count Causes :</div>
      <ul>
        <li>Viral infections - can suppress the bone marrow, resulting in a decrease in WBC production.</li>
        <li>Chemotherapy or radiation therapy - These treatments can damage the bone marrow and reduce WBC production.</li>
        <li>Autoimmune disorders - can cause the body to attack and destroy its own WBCs.</li>
        <li>Bone marrow disorders - such as aplastic anemia, can reduce WBC production.</li>
        <li>HIV/AIDS - can attack and destroy WBCs, particularly CD4 cells.</li>
      </ul>
      <div class="report-note-heading">High WBC Count Causes :</div>
      <ul>
        <li>Infection - Bacterial, viral, or parasitic infections can cause an increase in WBC count.</li>
        <li>Leukemia - A type of blood cancer that begins in the bone marrow and leads to the overproduction of abnormal WBCs.</li>
        <li>Stress - Emotional or physical stress can cause a temporary increase in the WBC count.</li>
        <li>Smoking - Smoking can cause a rise in the WBC count.</li>
        <li>Allergies - Allergic reactions can cause a temporary increase in the WBC count.</li>
        <li>Trauma - Physical trauma or injury can cause a temporary increase in the WBC count.</li>
      </ul>
    </div>
  `;
}

function buildAbsoluteCountReportBody(test, template) {
  const result = (test.parameters || []).find(parameter => {
    const parameterName = normalizeParameterName(parameter.parameter_name);
    return template.aliases.some(alias =>
      parameterName === alias || parameterName.includes(alias) || alias.includes(parameterName)
    );
  });
  const normalRange = result?.normal_range || template.normalRange;
  const unit = result?.unit || template.unit;
  const value = result?.value || "-";
  const status = template.showStatus ? getCbcStatus(result?.value, normalRange) : null;
  const statusText = status
    ? ` <span class="absolute-count-status ${status.className}">${status.label}</span>`
    : "";
  const list = items => `<ul>${items.map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
  const notesHtml = template.notesHtml || `
    <div class="report-note-heading">Comments :</div>
    ${list(template.comments)}
    <div class="report-note-heading">${escapeHtml(template.lowHeading)}</div>
    ${list(template.lowCauses)}
    <div class="report-note-heading">${escapeHtml(template.highHeading)}</div>
    ${list(template.highCauses)}
  `;

  return `
    <table class="results-table absolute-count-table">
      <thead>
        <tr>
          <th style="width: 40%">Investigation</th>
          <th style="width: 25%">Result</th>
          <th style="width: 22%">Reference Value</th>
          <th style="width: 13%">Unit</th>
        </tr>
      </thead>
      <tbody>
        ${template.turnaroundText ? `
          <tr class="absolute-count-sample-row">
            <td><strong>Sample Type</strong></td>
            <td>${escapeHtml(template.sampleType || test.sample_type || "Blood")}</td>
            <td colspan="2"><strong>TAT :</strong> ${escapeHtml(template.turnaroundText)}</td>
          </tr>
        ` : `
          <tr class="absolute-count-sample-row">
            <td>Primary Sample Type :</td>
            <td>${escapeHtml(test.sample_type || "Blood")}</td>
            <td>&nbsp;</td>
            <td>&nbsp;</td>
          </tr>
        `}
        <tr>
          <td><strong>${escapeHtml(template.title)}</strong><div class="absolute-count-method">${escapeHtml(template.method || "Electrical Impedance, VCS")}</div></td>
          <td><span class="${status?.className || ""}">${escapeHtml(value)}</span>${statusText}</td>
          <td>${escapeHtml(normalRange)}</td>
          <td>${escapeHtml(unit)}</td>
        </tr>
      </tbody>
    </table>
    <div class="absolute-count-notes">
      ${notesHtml}
    </div>
  `;
}

function buildBloodGroupReportBody(test) {
  const aboGroup = findReportParameter(test, ["ABO Group", "ABO", "Blood Group", "Result"]);
  const rhFactor = findReportParameter(test, ["Rh Factor", "Rh", "Rhesus Factor"]);

  return `
    <table class="results-table blood-group-table">
      <thead>
        <tr>
          <th style="width: 40%">Investigation</th>
          <th style="width: 25%">Result</th>
          <th style="width: 22%">Reference Value</th>
          <th style="width: 13%">Unit</th>
        </tr>
      </thead>
      <tbody>
        <tr class="blood-group-sample-row">
          <td><strong>Sample Type</strong></td>
          <td>Blood (2 ml)</td>
          <td>1 hr (Normal: 1 - 2 hrs)</td>
          <td>&nbsp;</td>
        </tr>
        <tr class="blood-group-section"><td colspan="4">Blood Group, ABO &amp; Rh Typing</td></tr>
        <tr>
          <td><strong>ABO Group</strong><div class="blood-group-method">Erythrocyte Magnetized Technology</div></td>
          <td>${escapeHtml(aboGroup?.value || "-")}</td>
          <td>&nbsp;</td>
          <td>&nbsp;</td>
        </tr>
        <tr>
          <td><strong>Rh Factor</strong><div class="blood-group-method">Erythrocyte Magnetized Technology</div></td>
          <td>${escapeHtml(rhFactor?.value || "-")}</td>
          <td>&nbsp;</td>
          <td>&nbsp;</td>
        </tr>
      </tbody>
    </table>
    <div class="blood-group-notes">
      <div class="report-note-heading">Note:</div>
      <ol>
        <li>Both forward and reverse grouping performed</li>
        <li>Test conducted on EDTA whole blood</li>
      </ol>
    </div>
  `;
}

function buildDDimerReportBody(test) {
  const result = findReportParameter(test, ["D-DIMER, QUANTITATIVE", "D-Dimer", "D Dimer", "Result"]);

  return `
    <table class="results-table d-dimer-table">
      <thead>
        <tr>
          <th style="width: 40%">Investigation</th>
          <th style="width: 25%">Result</th>
          <th style="width: 22%">Reference Value</th>
          <th style="width: 13%">Unit</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><strong>D-DIMER, QUANTITATIVE</strong><div class="d-dimer-method">Immunotubidimetry</div></td>
          <td>${escapeHtml(result?.value || "-")}</td>
          <td>${escapeHtml(result?.normal_range || "< 243.00")}</td>
          <td>${escapeHtml(result?.unit || "mg/mL DDU")}</td>
        </tr>
      </tbody>
    </table>
    <div class="d-dimer-notes">
      <div class="report-note-heading">Note :</div>
      <ol>
        <li>Degree of D-dimer increase does not definitely correlate with the clinical severity of associated disease state</li>
        <li>Increased levels have a high probability of Venous thromboembolism (VTE) and require clinical correlation.</li>
        <li>Lipemia falsely decreases D-dimer levels</li>
        <li>Test conducted on Citrated plasma.</li>
      </ol>
      <div class="report-note-heading">Comments :</div>
      <p>D-Dimer is one of the measurable byproducts of activation of the fibrinolytic system. It assessesfibrinolytic activation and intravascular thrombosis. D-dimer assays are characteristic for Disseminated Intravascular Coagulation (DIC) as this test demonstrates simultaneous presence of thrombin and plasmin formation. It can also be elevated in individuals with large vessel thrombosis, soft tissue hematomas, Pulmonary embolism, recent surgery, active or recent bleeding, pregnancy, liver disease, malignancy and hypercoagulable states. D-Dimer is of particular value in excluding the diagnosis of venous thromboembolism among patients at high risk.</p>
    </div>
  `;
}

function buildSickleCellMutationAnalysisReportBody(test) {
  const result = findReportParameter(test, ["SICKLE CELL ANEMIA MUTATION ANALYSIS", "Sickle Cell Mutation Analysis", "Result"]);
  const value = result?.value || "-";
  const status = getSickleCellMutationStatus(result?.value);

  return `
    <table class="results-table sickle-cell-mutation-table">
      <thead>
        <tr>
          <th style="width: 40%">Investigation</th>
          <th style="width: 25%">Result</th>
          <th style="width: 22%">Reference Value</th>
          <th style="width: 13%">Unit</th>
        </tr>
      </thead>
      <tbody>
        <tr class="sickle-cell-mutation-sample-row">
          <td><strong>Sample Type</strong></td>
          <td>Blood (3 ml)</td>
          <td><strong>TAT:</strong> 3 days (Normal: 3 - 7 days)</td>
          <td>&nbsp;</td>
        </tr>
        <tr>
          <td><strong>SICKLE CELL ANEMIA MUTATION ANALYSIS</strong><div class="sickle-cell-mutation-method">PCR, Sequencing</div></td>
          <td><span class="${status?.className || ""}">${escapeHtml(value)}</span></td>
          <td>${status ? `<span class="sickle-cell-mutation-status ${status.className}">${status.label}</span>` : "&nbsp;"}</td>
          <td>&nbsp;</td>
        </tr>
      </tbody>
    </table>
    <table class="sickle-cell-interpretation-table">
      <thead>
        <tr><th colspan="2" class="sickle-cell-interpretation-title">Interpretation</th></tr>
        <tr><th>Result</th><th>Remarks</th></tr>
      </thead>
      <tbody>
        <tr><td>Homozygous mutation detected</td><td>Both copies of the gene carry mutation</td></tr>
        <tr><td>Heterozygous mutation detected</td><td>One copy of the gene carries mutation</td></tr>
        <tr><td>Mutation Not Detected</td><td>Both copies of the gene carry the wild type trait</td></tr>
      </tbody>
    </table>
    <div class="sickle-cell-mutation-notes">
      <div class="report-note-heading">Note:</div>
      <ol>
        <li>This test identifies both HbC c.19G&gt;A, p.Glu7Lys and HbS c.20A&gt;T, p.Glu7Val. Therefore, the following combinations are possible: HbA/HbA, HbA/HbC, HbA/HbS, HbS/HbC, HbC/HbC, or HbS/HbS.</li>
        <li>The presence of substances that inhibit PCR in the sample may hinder the amplification of DNA.</li>
        <li>This assay has been developed in-house.</li>
        <li>The test is performed on whole blood for postnatal mutation analysis and on amniotic fluid for prenatal mutation analysis.</li>
      </ol>
      <div class="report-note-heading">Comments:</div>
      <p>Sickle cell anemia is an autosomal recessive disorder caused by a mutation in the HBB gene located on chromosome 11. Sickle-cell disease (SCD) is a collection of hereditary blood disorders that are typically inherited from one's parents. The most prevalent form is referred to as sickle-cell anemia, which results from an abnormality in the hemoglobin protein (hemoglobin S) responsible for carrying oxygen in red blood cells. This anomaly leads to the cells taking on a rigid, sickle-like shape under specific conditions. Symptoms of sickle cell disease typically manifest around 5 to 6 months of age and may include painful episodes known as "sickle-cell crises," anemia, swelling in the extremities, susceptibility to bacterial infections, and an increased risk of stroke. As individuals with sickle cell disease age, they may experience chronic pain. In developed countries, the average life expectancy for individuals with this condition ranges from 40 to 60 years. Sickle-cell disease is more prevalent in certain ethnic groups in central India that share a genetic connection with African populations, with prevalence rates ranging from 9.4% to 22.2% in endemic areas of Madhya Pradesh, Rajasthan, and Chhattisgarh. It is also endemic in some African communities.</p>
    </div>
  `;
}

function buildMcvReportBody(test) {
  const mcvResult = (test.parameters || []).find(parameter => {
    const name = normalizeParameterName(parameter.parameter_name);
    return name === "mcv" || name.includes("meancorpuscularvolume");
  });
  const normalRange = mcvResult?.normal_range || "83.00 - 101.00";
  const unit = mcvResult?.unit || "fL";
  const value = mcvResult?.value || "-";
  const status = getCbcStatus(mcvResult?.value, normalRange);
  const statusText = status && status.label !== "Normal"
    ? ` <span class="mcv-status ${status.className}">${status.label}</span>`
    : "";

  return `
    <table class="results-table mcv-table">
      <thead>
        <tr>
          <th style="width: 40%">Investigation</th>
          <th style="width: 25%">Result</th>
          <th style="width: 22%">Reference Value</th>
          <th style="width: 13%">Unit</th>
        </tr>
      </thead>
      <tbody>
        <tr class="mcv-sample-row">
          <td>Primary Sample Type</td>
          <td colspan="3">${escapeHtml(test.sample_type || "Blood")}</td>
        </tr>
        <tr>
          <td><strong>Mean Corpuscular Volume (MCV)</strong><div class="mcv-method">Calculated</div></td>
          <td><span class="${status?.className || ""}">${escapeHtml(value)}</span>${statusText}</td>
          <td>${escapeHtml(normalRange)}</td>
          <td>${escapeHtml(unit)}</td>
        </tr>
      </tbody>
    </table>
    <div class="mcv-notes">
      <div class="report-note-heading">Comments :</div>
      <ul>
        <li>MCV Blood Test (Mean Corpuscular Volume) Calculates the average size of your red blood cell.</li>
      </ul>
      <div class="report-note-heading">Low MCV Causes :</div>
      <ul>
        <li>Sideroblastic anemia - A rare type of anemia in which the bone marrow produces immature red blood cells that can't carry oxygen effectively.</li>
        <li>Thalassemia - A group of inherited blood disorders that cause the body to produce abnormal hemoglobin, leading to low levels of healthy red blood cells.</li>
        <li>Lead poisoning - Exposure to high levels of lead can interfere with the body's production of hemoglobin and lead to anemia.</li>
        <li>Bone marrow disorders - Certain bone marrow disorders, such as myelodysplastic syndrome or aplastic anemia, can lead to low levels of red blood cells.</li>
      </ul>
      <div class="report-note-heading">High MCV Causes :</div>
      <ul>
        <li>Macrocytic anemia - A type of anemia characterized by red blood cells that are larger than normal. This can be caused by deficiencies in vitamin B12 or folate.</li>
        <li>Liver disease - Some types of liver disease, such as cirrhosis, can interfere with the body's ability to process and metabolize certain nutrients, leading to anemia and high MCV levels.</li>
        <li>Hypothyroidism - An underactive thyroid gland can cause a variety of symptoms, including anemia and high MCV levels.</li>
        <li>Bone marrow disorders - Certain bone marrow disorders, such as myelodysplastic syndrome, can lead to abnormal red blood cell production and high MCV levels.</li>
      </ul>
    </div>
  `;
}

function buildMpvReportBody(test) {
  const mpvResult = (test.parameters || []).find(parameter => {
    const name = normalizeParameterName(parameter.parameter_name);
    return name === "mpv" || name.includes("meanplateletvolume");
  }) || (test.parameters || [])[0];
  const normalRange = mpvResult?.normal_range || "6.50 - 12.00";
  const unit = mpvResult?.unit || "fL";
  const value = mpvResult?.value || "-";
  const status = getCbcStatus(mpvResult?.value, normalRange);
  const statusText = status && status.label !== "Normal"
    ? ` <span class="mpv-status ${status.className}">${status.label}</span>`
    : "";

  return `
    <table class="results-table mpv-table">
      <thead>
        <tr>
          <th style="width: 40%">Investigation</th>
          <th style="width: 25%">Result</th>
          <th style="width: 22%">Reference Value</th>
          <th style="width: 13%">Unit</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><strong>Mean Platelet Volume (MPV),<br />Whole Blood</strong><div class="mpv-method">Electrical Impedance</div></td>
          <td><span class="${status?.className || ""}">${escapeHtml(value)}</span>${statusText}</td>
          <td>${escapeHtml(normalRange)}</td>
          <td>${escapeHtml(unit)}</td>
        </tr>
      </tbody>
    </table>
    <div class="mpv-notes">
      <div class="report-note-heading">Comment :</div>
      <p>MPV varies inversely with the platelet count in normal subjects. It is lowered when thrombocytopenia is caused by Megaloblastic anemia or bone marrow failure. It is generally higher in Myeloproliferative disorders, Immune thrombocytopenic purpura (ITP), massive hemorrhage and thrombocytopenia due to sepsis.</p>
    </div>
  `;
}

function buildHctPcvReportBody(test) {
  const parameters = test.parameters || [];
  const hctResult = parameters.find(parameter => {
    const name = normalizeParameterName(parameter.parameter_name);
    return name === "hctpcv" || name === "hct" || name === "pcv";
  }) || parameters.find(parameter => {
    const name = normalizeParameterName(parameter.parameter_name);
    return name.includes("hematocrit") || name.includes("haematocrit") || name.includes("packedcellvolume");
  }) || parameters[0];
  const normalRange = hctResult?.normal_range || "40 - 50";
  const unit = hctResult?.unit || "%";
  const value = hctResult?.value || "-";
  const status = getCbcStatus(hctResult?.value, normalRange);
  const statusText = status && status.label !== "Normal"
    ? ` <span class="hct-status ${status.className}">${status.label}</span>`
    : "";

  return `
    <table class="results-table hct-table">
      <thead>
        <tr>
          <th style="width: 40%">Investigation</th>
          <th style="width: 25%">Result</th>
          <th style="width: 22%">Reference Value</th>
          <th style="width: 13%">Unit</th>
        </tr>
      </thead>
      <tbody>
        <tr class="hct-sample-row">
          <td>Primary Sample Type</td>
          <td colspan="3">${escapeHtml(test.sample_type || "Blood")}</td>
        </tr>
        <tr class="hct-section"><td colspan="4">Hematocrit (HCT) /<br />Packed Cell Volume (PCV)</td></tr>
        <tr>
          <td>HCT / PCV</td>
          <td><span class="${status?.className || ""}">${escapeHtml(value)}</span>${statusText}</td>
          <td>${escapeHtml(normalRange)}</td>
          <td>${escapeHtml(unit)}</td>
        </tr>
      </tbody>
    </table>
    <div class="hct-notes">
      <div class="report-note-heading">Comments :</div>
      <ul>
        <li>A Hematocrit (HCT) Blood Test or packed-cell volume (PCV) Blood lab test determines the percentage of the blood that is composed of Red blood cells (RBCs). RBCs carry oxygen throughout your body. Having too few or too many red blood cells can be a sign of certain diseases.</li>
      </ul>
      <div class="report-note-heading">Low HCT / PCV Causes :</div>
      <ul>
        <li>Anemia - Fatigue, weakness, shortness of breath, dizziness, pale skin</li>
        <li>Blood loss - Weakness, dizziness, pale skin, rapid heartbeat</li>
        <li>Nutritional deficiencies - Fatigue, weakness, shortness of breath, pale skin, brittle nails</li>
        <li>Kidney disease - Fatigue, weakness, shortness of breath, swelling in the legs</li>
        <li>Bone marrow disorders - Fatigue, weakness, shortness of breath, increased susceptibility to infections</li>
        <li>Chronic inflammation - Fatigue, weakness, joint pain, fever</li>
        <li>Hormonal imbalances - Fatigue, weakness, weight gain or loss, dry skin, hair loss</li>
        <li>Pregnancy - Fatigue, weakness, shortness of breath, dizziness, lightheadedness</li>
      </ul>
      <div class="report-note-heading">High HCT / PCV Causes :</div>
      <ul>
        <li>Dehydration - Lack of fluids in the body</li>
        <li>Polycythemia vera - Bone marrow disorder that produces too many red blood cells</li>
        <li>Chronic obstructive pulmonary disease (COPD) - Lung disease that limits oxygen intake</li>
        <li>Congenital heart disease - Birth defects that affect heart function</li>
        <li>Living at a high altitude - Lower oxygen levels can stimulate the production of red blood cells</li>
        <li>Certain medications - Such as testosterone or erythropoietin (EPO), which stimulate red blood cell production</li>
      </ul>
    </div>
  `;
}

function buildHemoglobinReportBody(test, patientGender) {
  const hemoglobinResult = (test.parameters || []).find(parameter => {
    const name = normalizeParameterName(parameter.parameter_name);
    return name === "hb" || name === "hemoglobinhb" || name === "haemoglobinhb" || name.includes("hemoglobin") || name.includes("haemoglobin");
  }) || (test.parameters || [])[0];
  const isFemale = String(patientGender || "").toLowerCase().startsWith("f");
  const normalRange = isFemale ? "12.0 - 15.5" : "13.5 - 17.5";
  const unit = hemoglobinResult?.unit || "g/dL";
  const value = hemoglobinResult?.value || "-";
  const status = getCbcStatus(hemoglobinResult?.value, normalRange);
  const statusText = status
    ? ` <span class="hemoglobin-status ${status.className}">${status.label}</span>`
    : "";

  return `
    <table class="results-table hemoglobin-table">
      <thead>
        <tr>
          <th style="width: 40%">Investigation</th>
          <th style="width: 25%">Result</th>
          <th style="width: 22%">Reference Value</th>
          <th style="width: 13%">Unit</th>
        </tr>
      </thead>
      <tbody>
        <tr class="hemoglobin-sample-row">
          <td>Primary Sample Type</td>
          <td colspan="3">${escapeHtml(test.sample_type || "Blood")}</td>
        </tr>
        <tr>
          <td><strong>Hemoglobin (Hb)</strong><div class="hemoglobin-method">Photometry</div></td>
          <td><span class="${status?.className || ""}">${escapeHtml(value)}</span>${statusText}</td>
          <td>${escapeHtml(normalRange)}</td>
          <td>${escapeHtml(unit)}</td>
        </tr>
      </tbody>
    </table>
    <div class="hemoglobin-notes">
      <div class="report-note-heading">Comment :</div>
      <table class="hemoglobin-range-table">
        <thead>
          <tr><th>Gender</th><th>Normal Range (g/dL)</th></tr>
        </thead>
        <tbody>
          <tr><td>Male</td><td>13.5 - 17.5</td></tr>
          <tr><td>Female</td><td>12.0 - 15.5</td></tr>
        </tbody>
      </table>
      <div class="report-note-heading">Interpretation :</div>
      <table class="hemoglobin-interpretation-table">
        <thead>
          <tr><th>Hemoglobin</th><th>Interpretation</th></tr>
        </thead>
        <tbody>
          <tr><td>Low Levels</td><td>May indicate anemia or blood loss. Further testing may be necessary to determine the underlying cause.</td></tr>
          <tr><td>High Levels</td><td>May indicate conditions such as polycythemia vera, a bone marrow disorder that causes the production of too many red blood cells.</td></tr>
        </tbody>
      </table>
    </div>
  `;
}

function buildEsrReportBody(test) {
  const esrResult = (test.parameters || []).find(parameter => {
    const name = normalizeParameterName(parameter.parameter_name);
    return name === "esr" || name.includes("erythrocytesedimentationrate");
  }) || (test.parameters || [])[0];
  const normalRange = esrResult?.normal_range || "0 - 15";
  const unit = esrResult?.unit || "mm/hr";
  const value = esrResult?.value || "-";

  return `
    <table class="results-table esr-table">
      <thead>
        <tr>
          <th style="width: 40%">Investigation</th>
          <th style="width: 25%">Result</th>
          <th style="width: 22%">Reference Value</th>
          <th style="width: 13%">Unit</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><strong>ESR</strong><div class="esr-method">Capillary photometry</div></td>
          <td>${escapeHtml(value)}</td>
          <td>${escapeHtml(normalRange)}</td>
          <td>${escapeHtml(unit)}</td>
        </tr>
      </tbody>
    </table>
    <div class="esr-notes">
      <div class="report-note-heading">Interpretation :</div>
      <p>An erythrocyte sedimentation rate (ESR) is a type of blood test that measures how quickly erythrocytes (red blood cells) settle at the bottom of a test tube that contains a blood sample. Normally, red blood cells settle relatively slowly. A faster-than-normal rate may indicate inflammation in the body.</p>
      <div class="report-note-heading">Note :</div>
      <ol>
        <li>C-Reactive Protein (CRP) is the recommended test in acute inflammatory conditions.</li>
        <li>Test conducted on EDTA whole blood at 37°C.</li>
        <li>ESR readings are auto-corrected with respect to Hematocrit (PCV) values.</li>
      </ol>
    </div>
  `;
}

function buildPdwReportBody(test) {
  const pdwResult = (test.parameters || []).find(parameter => {
    const name = normalizeParameterName(parameter.parameter_name);
    return name === "pdw" || name.includes("plateletdistributionwidth");
  }) || (test.parameters || [])[0];
  const normalRange = pdwResult?.normal_range || "9.00 - 17.00";
  const unit = pdwResult?.unit || "%";
  const value = pdwResult?.value || "-";
  const status = getCbcStatus(pdwResult?.value, normalRange);
  const statusText = status
    ? ` <span class="pdw-status ${status.className}">${status.label}</span>`
    : "";

  return `
    <table class="results-table pdw-table">
      <thead>
        <tr>
          <th style="width: 40%">Investigation</th>
          <th style="width: 25%">Result</th>
          <th style="width: 22%">Reference Value</th>
          <th style="width: 13%">Unit</th>
        </tr>
      </thead>
      <tbody>
        <tr class="pdw-sample-row">
          <td><strong>Sample Type</strong></td>
          <td>${escapeHtml(test.sample_type || "Blood (2 ml)")}</td>
          <td colspan="2"><strong>TAT :</strong> 1 day &nbsp; (Normal: 1 - 3 days)</td>
        </tr>
        <tr>
          <td><strong>Platelet Distribution Width</strong><div class="pdw-method">Electrical Impedence</div></td>
          <td><span class="${status?.className || ""}">${escapeHtml(value)}</span>${statusText}</td>
          <td>${escapeHtml(normalRange)}</td>
          <td>${escapeHtml(unit)}</td>
        </tr>
      </tbody>
    </table>
    <table class="pdw-age-table">
      <thead>
        <tr><th>Age Group</th><th>Normal Range</th></tr>
      </thead>
      <tbody>
        <tr><td>Adults</td><td>9.0 - 17.0%</td></tr>
        <tr><td>Children</td><td>7.5 - 13.5%</td></tr>
        <tr><td>Newborns</td><td>9.0 - 17.0%</td></tr>
      </tbody>
    </table>
    <div class="pdw-notes">
      <div class="report-note-heading">Comments :</div>
      <p>PDW is a measure of platelet anisocytosis &amp; plateletcrit and is indicative of the volume of circulating platelets in a unit volume of blood. This test is useful in distinguishing Essential thrombocythemia (PDW increased) from Reactive thrombocytosis (PDW normal).</p>
      <div class="report-note-heading">Interpretation :</div>
      <table class="pdw-interpretation-table">
        <thead>
          <tr><th>PDW %</th><th>Interpretation</th></tr>
        </thead>
        <tbody>
          <tr><td>&lt; 9.0</td><td>Lower than normal range; may indicate iron or B12 deficiency, bone marrow disorders</td></tr>
          <tr><td>9.0 - 17.0</td><td>Normal range; indicates a normal variation in the size of platelets in the blood</td></tr>
          <tr><td>&gt; 17.0</td><td>Higher than normal range; may indicate liver disease, bone marrow disorders, or immune thrombocytopenia</td></tr>
        </tbody>
      </table>
    </div>
  `;
}

function buildMchReportBody(test) {
  const mchResult = (test.parameters || []).find(parameter => {
    const name = normalizeParameterName(parameter.parameter_name);
    return name === "mch" || name.includes("meancorpuscularhemoglobin") || name.includes("meancorpuscularhaemoglobin");
  });
  const normalRange = mchResult?.normal_range || "27.0 - 32.0";
  const unit = mchResult?.unit || "pg";
  const value = mchResult?.value || "-";
  const status = getCbcStatus(mchResult?.value, normalRange);
  const statusText = status && status.label !== "Normal"
    ? ` <span class="mch-status ${status.className}">${status.label}</span>`
    : "";

  return `
    <table class="results-table mch-table">
      <thead>
        <tr>
          <th style="width: 40%">Investigation</th>
          <th style="width: 25%">Result</th>
          <th style="width: 22%">Reference Value</th>
          <th style="width: 13%">Unit</th>
        </tr>
      </thead>
      <tbody>
        <tr class="mch-sample-row">
          <td>Primary Sample Type</td>
          <td colspan="3">${escapeHtml(test.sample_type || "Blood")}</td>
        </tr>
        <tr>
          <td><strong>Mean Corpuscular Hemoglobin (MCH)</strong><div class="mch-method">Calculated</div></td>
          <td><span class="${status?.className || ""}">${escapeHtml(value)}</span>${statusText}</td>
          <td>${escapeHtml(normalRange)}</td>
          <td>${escapeHtml(unit)}</td>
        </tr>
      </tbody>
    </table>
    <div class="mch-notes">
      <div class="report-note-heading">Comments :</div>
      <ul>
        <li>The Mean Corpuscular Hemoglobin (MCH) blood test measures the average amount of hemoglobin in each red blood cell. It provides information about the oxygen-carrying capacity of the blood cells.</li>
      </ul>
      <div class="report-note-heading">Low MCH Causes :</div>
      <ul>
        <li>Microcytic anemia - A type of anemia characterized by smaller than normal red blood cells, which contain less hemoglobin and can result in low MCH levels</li>
        <li>Lead poisoning - Exposure to high levels of lead can affect the production of hemoglobin and lead to low MCH levels</li>
        <li>Chronic inflammatory conditions - Conditions such as rheumatoid arthritis or inflammatory bowel disease can interfere with red blood cell production and result in low MCH levels</li>
      </ul>
      <div class="report-note-heading">High MCH Causes :</div>
      <ul>
        <li>Macrocytic anemia - A type of anemia characterized by larger than normal red blood cells, which contain more hemoglobin and can result in high MCH levels</li>
        <li>Vitamin B12 or folate deficiency - Deficiencies in these essential nutrients can lead to abnormal red blood cell development and result in high MCH levels</li>
        <li>Hypothyroidism - An underactive thyroid gland can affect red blood cell production and lead to high MCH levels</li>
        <li>Hemoglobinopathies (abnormal hemoglobin) - Certain inherited blood disorders, such as sickle cell disease, can cause abnormal hemoglobin production and result in high MCH levels</li>
        <li>Chronic obstructive pulmonary disease (COPD) - This respiratory condition can cause low oxygen levels in the blood, leading to increased red blood cell production and high MCH levels</li>
      </ul>
    </div>
  `;
}

function buildMchcReportBody(test) {
  const mchcResult = (test.parameters || []).find(parameter =>
    normalizeParameterName(parameter.parameter_name) === "mchc"
  );
  const normalRange = mchcResult?.normal_range || "32.5 - 34.5";
  const unit = mchcResult?.unit || "g/dL";
  const value = mchcResult?.value || "-";
  const status = getCbcStatus(mchcResult?.value, normalRange);
  const statusText = status && status.label !== "Normal"
    ? ` <span class="mchc-status ${status.className}">${status.label}</span>`
    : "";

  return `
    <table class="results-table mchc-table">
      <thead>
        <tr>
          <th style="width: 40%">Investigation</th>
          <th style="width: 25%">Result</th>
          <th style="width: 22%">Reference Value</th>
          <th style="width: 13%">Unit</th>
        </tr>
      </thead>
      <tbody>
        <tr class="mchc-sample-row">
          <td>Primary Sample Type</td>
          <td colspan="3">${escapeHtml(test.sample_type || "Blood")}</td>
        </tr>
        <tr class="mchc-section"><td colspan="4">Mean Corpuscular Hemoglobin Concentration (MCHC)</td></tr>
        <tr>
          <td><strong>MCHC</strong><div class="mchc-method">Calculated</div></td>
          <td><span class="${status?.className || ""}">${escapeHtml(value)}</span>${statusText}</td>
          <td>${escapeHtml(normalRange)}</td>
          <td>${escapeHtml(unit)}</td>
        </tr>
      </tbody>
    </table>
    <div class="mchc-notes">
      <div class="report-note-heading">Comments :</div>
      <ul>
        <li>The Mean Corpuscular Hemoglobin Concentration (MCHC) blood test measures the concentration of hemoglobin in each red blood cell. It helps assess the overall quality and density of the hemoglobin in the blood.</li>
      </ul>
      <div class="report-note-heading">Low MCHC Causes :</div>
      <ul>
        <li>Iron deficiency anemia - A condition in which the body lacks sufficient iron to produce hemoglobin.</li>
        <li>Thalassemia - A genetic disorder that affects the production of hemoglobin.</li>
        <li>Chronic disease - Chronic diseases such as cancer, kidney disease, and inflammatory bowel disease.</li>
        <li>Blood loss - Acute or chronic blood loss can lead to anemia.</li>
        <li>Nutritional deficiencies - Deficiencies in vitamins B6, B12, and folate can affect red blood cell production.</li>
        <li>Hemoglobinopathies, such as sickle cell anemia.</li>
        <li>Genetic conditions that affect hemoglobin production and can lead to anemia.</li>
        <li>Bone marrow disorders, such as aplastic anemia.</li>
        <li>Hemorrhagic shock - A condition in which severe bleeding leads to a rapid drop in blood pressure.</li>
      </ul>
      <div class="report-note-heading">High MCHC Causes :</div>
      <ul>
        <li>Hemolytic anemia - Autoimmune hemolytic anemia.</li>
        <li>Spherocytosis - A genetic disorder in which red blood cells are abnormally shaped.</li>
        <li>Dehydration or hemoconcentration - A condition in which there is a decreased amount of fluid in the bloodstream.</li>
        <li>Hereditary spherocytosis - An inherited condition that causes red blood cells to be spherical and fragile.</li>
        <li>Liver disease or obstructive jaundice.</li>
        <li>High-dose intravenous immunoglobulin therapy.</li>
      </ul>
    </div>
  `;
}

function findReportParameter(test, aliases) {
  const normalizedAliases = aliases.map(normalizeParameterName);
  const parameters = test?.parameters || [];

  return parameters.find(parameter => normalizedAliases.includes(normalizeParameterName(parameter.parameter_name)))
    || parameters.find(parameter => {
      const parameterName = normalizeParameterName(parameter.parameter_name);
      return normalizedAliases.some(alias => parameterName.includes(alias) || alias.includes(parameterName));
    });
}

function buildProthrombinTimeReportBody(test) {
  const meanPt = findReportParameter(test, ["Mean Normal Prothrombin Time (PT)", "Mean Normal PT"]);
  const patientValue = findReportParameter(test, ["Patient value", "Patient Value", "Prothrombin Time"]);
  const prothrombinRatio = findReportParameter(test, ["Prothrombin Ratio (PR)", "Prothrombin Ratio", "PR"]);
  const inr = findReportParameter(test, ["International Normalized Ratio (INR)", "International Normalised Ratio (INR)", "INR"]);
  const patientRange = patientValue?.normal_range || "9.60 - 11.70";
  const patientStatus = getCbcStatus(patientValue?.value, patientRange);
  const patientStatusText = patientStatus && patientStatus.label !== "Normal"
    ? ` <span class="pt-status ${patientStatus.className}">${patientStatus.label}</span>`
    : "";
  const value = parameter => escapeHtml(parameter?.value || "-");
  const unit = parameter => escapeHtml(parameter?.unit || "Sec");

  return `
    <table class="results-table pt-table">
      <thead>
        <tr>
          <th style="width: 40%">Investigation</th>
          <th style="width: 25%">Result</th>
          <th style="width: 22%">Reference Value</th>
          <th style="width: 13%">Unit</th>
        </tr>
      </thead>
      <tbody>
        <tr class="pt-section"><td colspan="4"><strong>Prothrombin Time Studies</strong><div class="pt-method">Photo optical Clot Detection</div></td></tr>
        <tr>
          <td>Mean Normal Prothrombin Time (PT)</td>
          <td>${value(meanPt)}</td>
          <td>&nbsp;</td>
          <td>${unit(meanPt)}</td>
        </tr>
        <tr>
          <td>Patient value</td>
          <td><span class="${patientStatus?.className || ""}">${value(patientValue)}</span>${patientStatusText}</td>
          <td>${escapeHtml(patientRange)}</td>
          <td>${unit(patientValue)}</td>
        </tr>
        <tr>
          <td>Prothrombin Ratio (PR)</td>
          <td>${value(prothrombinRatio)}</td>
          <td>&nbsp;</td>
          <td>&nbsp;</td>
        </tr>
        <tr>
          <td>International Normalized Ratio (INR)</td>
          <td>${value(inr)}</td>
          <td>${escapeHtml(inr?.normal_range || "0.90 - 1.10")}</td>
          <td>&nbsp;</td>
        </tr>
      </tbody>
    </table>
    <div class="pt-notes">
      <div class="report-note-heading">Note :</div>
      <ol>
        <li>INR is the parameter of choice in monitoring adequacy of oral anticoagulant therapy. Appropriate therapeutic range varies with the disease and treatment intensity</li>
        <li>Prolonged INR suggests potential bleeding disorder / bleeding complications</li>
        <li>Results should be clinically correlated</li>
        <li>Test conducted on Citrated plasma</li>
      </ol>
      <div class="report-note-heading">Recommended Therapeutic range for Oral Anticoagulant therapy</div>
      <div class="pt-subheading">INR 2.0 - 3.0 :</div>
      <ul>
        <li>Treatment of Venous thrombosis &amp; Pulmonary embolism</li>
        <li>Prophylaxis of Venous thrombosis (High risk surgery)</li>
        <li>Prevention of systemic embolism in tissue heart valves, AMI, Valvular heart disease &amp; Atrial fibrillation</li>
        <li>Bileaflet mechanical valve in aortic position</li>
      </ul>
      <div class="pt-subheading">INR 2.5 - 3.5</div>
      <ul>
        <li>Mechanical prosthetic valves</li>
        <li>Systemic recurrent emboli</li>
      </ul>
      <div class="report-note-heading">Comments :</div>
      <p>Prothrombin time measures the extrinsic coagulation pathway which consists of activated Factor VII (VIIa), Tissue factor and Proteins of the common pathway (Factors X, V, II &amp; Fibrinogen). This assay is used to control long term oral anticoagulant therapy, evaluation of liver function &amp; to evaluate coagulation disorders specially factors involved in the extrinsic pathway like Factors V, VII, X, Prothrombin &amp; Fibrinogen.</p>
    </div>
  `;
}

function buildApttReportBody(test) {
  const patientValue = findReportParameter(test, ["Patient Value", "Patient value", "APTT Patient Value"]);
  const controlValue = findReportParameter(test, ["Control Value", "Control value", "APTT Control Value"]);
  const normalRange = patientValue?.normal_range || "23.70 - 33.00";
  const status = getCbcStatus(patientValue?.value, normalRange);
  const statusText = status && status.label !== "Normal"
    ? ` <span class="aptt-status ${status.className}">${status.label}</span>`
    : "";
  const value = parameter => escapeHtml(parameter?.value || "-");
  const unit = parameter => escapeHtml(parameter?.unit || "Sec");

  return `
    <table class="results-table aptt-table">
      <thead>
        <tr>
          <th style="width: 40%">Investigation</th>
          <th style="width: 25%">Result</th>
          <th style="width: 22%">Reference Value</th>
          <th style="width: 13%">Unit</th>
        </tr>
      </thead>
      <tbody>
        <tr class="aptt-section"><td colspan="4"><strong>Partial Thromboplastin Time,<br />Activated (APTT)</strong><div class="aptt-method">Photo optical Clot Detection</div></td></tr>
        <tr>
          <td>Patient Value</td>
          <td><span class="${status?.className || ""}">${value(patientValue)}</span>${statusText}</td>
          <td>${escapeHtml(normalRange)}</td>
          <td>${unit(patientValue)}</td>
        </tr>
        <tr>
          <td>Control Value</td>
          <td>${value(controlValue)}</td>
          <td>&nbsp;</td>
          <td>${unit(controlValue)}</td>
        </tr>
      </tbody>
    </table>
    <div class="aptt-notes">
      <div class="report-note-heading">Note :</div>
      <ol>
        <li>Degree of prolongation of PTT / APTT is neither predictive of bleeding risk nor underlying diagnosis</li>
        <li>Results should be clinically correlated</li>
        <li>Test conducted on Citrated plasma</li>
        <li>Heparin therapeutic range is not established, for heparin monitoring Anti-Xa is recommended.</li>
      </ol>
      <div class="report-note-heading">Comments :</div>
      <p>Partial Thromboplastin time (PTT / APTT) measures the proteins of the intrinsic coagulation pathway which consists of Factor XII, Prekallikrein, High molecular weight kininogen, Factors VIII, IX &amp; XI. It also measures proteins of the common pathway namely factors II, V, X &amp; Fibrinogen. PTT is prolonged when Factor VIII level is &lt; 35-40% of normal and Factor XII &amp; High molecular weight kininogen is &lt; 10-15% of normal.</p>
      <div class="report-note-heading">Abnormal Partial Thromboplastin Time</div>
      <ul>
        <li>Associated with bleeding: Defects of factors VIII, IX &amp; XI</li>
        <li>Not associated with bleeding: Defects of factor XII, Prekallikrein, High molecular weight kininogen &amp; Lupus anticoagulants</li>
      </ul>
      <div class="report-note-heading">Causes of prolonged PTT / APTT</div>
      <ul>
        <li>Liver disease · Consumptive coagulopathy</li>
        <li>Circulating anticoagulants including Lupus Anticoagulant</li>
        <li>Oral Anticoagulant therapy</li>
        <li>Factor deficiencies</li>
      </ul>
    </div>
  `;
}

function buildDlcReportBody(test) {
  const definitions = [
    { label: "Neutrophils", aliases: ["Neutrophils", "Neutrophil"], normalRange: "50 - 62", unit: "%" },
    { label: "Lymphocytes", aliases: ["Lymphocytes", "Lymphocyte"], normalRange: "20 - 40", unit: "%" },
    { label: "Eosinophils", aliases: ["Eosinophils", "Eosinophil"], normalRange: "00 - 06", unit: "%" },
    { label: "Monocytes", aliases: ["Monocytes", "Monocyte"], normalRange: "00 - 10", unit: "%" },
    { label: "Basophils", aliases: ["Basophils", "Basophil"], normalRange: "00 - 02", unit: "%" }
  ];
  const rows = definitions.map(definition => {
    const result = findReportParameter(test, definition.aliases);
    return `
      <tr>
        <td>${definition.label}</td>
        <td>${escapeHtml(result?.value || "-")}</td>
        <td>${escapeHtml(result?.normal_range || definition.normalRange)}</td>
        <td>${escapeHtml(result?.unit || definition.unit)}</td>
      </tr>
    `;
  }).join("");

  return `
    <table class="results-table dlc-table">
      <thead>
        <tr>
          <th style="width: 40%">Investigation</th>
          <th style="width: 25%">Result</th>
          <th style="width: 22%">Reference Value</th>
          <th style="width: 13%">Unit</th>
        </tr>
      </thead>
      <tbody>
        <tr class="dlc-sample-row"><td>Primary Sample Type :</td><td>${escapeHtml(test.sample_type || "Blood")}</td><td>&nbsp;</td><td>&nbsp;</td></tr>
        <tr class="dlc-section"><td colspan="4">Differential Leucocyte Count</td></tr>
        ${rows}
      </tbody>
    </table>
    <div class="dlc-notes">
      <div class="report-note-heading">Comments :</div>
      <ul>
        <li>WBC stands for white blood cell, which is a type of blood cell that is responsible for fighting infections and diseases in the body.</li>
      </ul>
      <div class="report-note-heading">Low WBC Count Causes :</div>
      <ul>
        <li>Viral infections - can suppress the bone marrow, resulting in a decrease in WBC production.</li>
        <li>Chemotherapy or radiation therapy - These treatments can damage the bone marrow and reduce WBC production.</li>
        <li>Autoimmune disorders - can cause the body to attack and destroy its own WBCs.</li>
        <li>Bone marrow disorders - such as aplastic anemia, can reduce WBC production.</li>
        <li>HIV/AIDS - can attack and destroy WBCs, particularly CD4 cells.</li>
      </ul>
      <div class="report-note-heading">High WBC Count Causes :</div>
      <ul>
        <li>Infection - Bacterial, viral, or parasitic infections can cause an increase in WBC count</li>
        <li>Leukemia - A type of blood cancer that begins in the bone marrow and leads to the overproduction of abnormal WBCs</li>
        <li>Stress - Emotional or physical stress can cause a temporary increase in the WBC count</li>
        <li>Smoking - Smoking can cause a rise in the WBC count</li>
        <li>Allergies - Allergic reactions can cause a temporary increase in the WBC count</li>
        <li>Trauma - Physical trauma or injury can cause a temporary increase in the WBC count</li>
      </ul>
    </div>
  `;
}

function buildIndirectCoombsReportBody(test) {
  const result = findReportParameter(test, ["Result"]);
  const titre = findReportParameter(test, ["Titre", "Titer"]);

  return `
    <table class="results-table indirect-coombs-table">
      <thead>
        <tr>
          <th style="width: 40%">Investigation</th>
          <th style="width: 25%">Result</th>
          <th style="width: 22%">Reference Value</th>
          <th style="width: 13%">Unit</th>
        </tr>
      </thead>
      <tbody>
        <tr class="indirect-coombs-section"><td colspan="4"><strong>Coombs Test, Indirect, Serum</strong><div class="indirect-coombs-method">Erythrocyte Magnetized Technology</div></td></tr>
        <tr><td>Result</td><td>${escapeHtml(result?.value || "-")}</td><td>&nbsp;</td><td>&nbsp;</td></tr>
        <tr><td>Titre</td><td>${escapeHtml(titre?.value || "-")}</td><td>&nbsp;</td><td>&nbsp;</td></tr>
      </tbody>
    </table>
    <div class="indirect-coombs-notes">
      <div class="report-note-heading">Interpretation :</div>
      <table class="indirect-coombs-interpretation-table">
        <thead>
          <tr><th>Result</th><th>Comments</th></tr>
        </thead>
        <tbody>
          <tr><td><strong>Negative</strong></td><td>No antibodies detected</td></tr>
          <tr><td><strong>Equivocal</strong></td><td>Positive in undiluted serum &amp; titre upto 1:16</td></tr>
          <tr><td><strong>Positive</strong></td><td><ul><li>Titre of 1:32 or above</li><li>Rising titre on serial testing</li></ul></td></tr>
        </tbody>
      </table>
      <div class="report-note-heading">Comments :</div>
      <p>Indirect Coomb's test (ICT) is used to detect incomplete Rh IgG antibodies in the serum. This test is used for: &middot; Compatibility testing, &middot; Screening and detection of unexpected antibodies in the serum &middot; Detection of red cell antigens not detected by other techniques like K, Fy, JK etc.,</p>
      <div class="report-note-heading">Recommended sampling regime in pregnancy :</div>
      <table class="indirect-coombs-pregnancy-table">
        <thead>
          <tr><th>Stage of Pregnancy</th><th>Reference Group</th></tr>
        </thead>
        <tbody>
          <tr><td>Early pregnancy</td><td>All cases</td></tr>
          <tr><td>28th week</td><td>Rh D negative cases</td></tr>
          <tr><td>34th-36th week</td><td>All cases</td></tr>
        </tbody>
      </table>
    </div>
  `;
}

function buildDirectCoombsReportBody(test) {
  const result = findReportParameter(test, ["COOMBS TEST, DIRECT, SERUM", "Direct Coombs Test", "Result"])
    || (test.parameters || [])[0];

  return `
    <table class="results-table direct-coombs-table">
      <thead>
        <tr>
          <th style="width: 40%">Investigation</th>
          <th style="width: 25%">Result</th>
          <th style="width: 22%">Reference Value</th>
          <th style="width: 13%">Unit</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><strong>Coombs Test, Direct, Serum</strong><div class="direct-coombs-method">Erythrocyte Magnetized Technology</div></td>
          <td>${escapeHtml(result?.value || "-")}</td>
          <td>&nbsp;</td>
          <td>&nbsp;</td>
        </tr>
      </tbody>
    </table>
    <div class="direct-coombs-notes">
      <div class="report-note-heading">Note:</div>
      <p>Test conducted on EDTA whole blood</p>
      <div class="report-note-heading">Comments :</div>
      <p>Direct Coomb's Test (Antiglobulin test) demonstrates the sensitization of red blood cells in vivo with IgG antibody or complement component. This test is useful in :</p>
      <ul>
        <li>Diagnosis of hemolytic disease of newborn</li>
        <li>Diagnosis of Autoimmune hemolytic anemias</li>
        <li>Investigation of Drug induced red cell sensitization</li>
        <li>Investigation of Hemolytic transfusion reactions</li>
      </ul>
    </div>
  `;
}

function buildFibrinogenReportBody(test) {
  const result = findReportParameter(test, ["FIBRINOGEN, CLOTTING ACTIVITY", "Fibrinogen"])
    || (test.parameters || [])[0];
  const normalRange = result?.normal_range || "200.00 - 400.00";
  const unit = result?.unit || "mg/dL";
  const status = getCbcStatus(result?.value, normalRange);
  const statusText = status && status.label !== "Normal"
    ? ` <span class="fibrinogen-status ${status.className}">${status.label}</span>`
    : "";

  return `
    <table class="results-table fibrinogen-table">
      <thead>
        <tr>
          <th style="width: 40%">Investigation</th>
          <th style="width: 25%">Result</th>
          <th style="width: 22%">Reference Value</th>
          <th style="width: 13%">Unit</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><strong>Fibrinogen, Clotting Activity</strong><div class="fibrinogen-method">Photo optical clot detection</div></td>
          <td><span class="${status?.className || ""}">${escapeHtml(result?.value || "-")}</span>${statusText}</td>
          <td>${escapeHtml(normalRange)}</td>
          <td>${escapeHtml(unit)}</td>
        </tr>
      </tbody>
    </table>
    <div class="fibrinogen-notes">
      <div class="report-note-heading">Note:</div>
      <ol>
        <li>Results must be clinically correlated.</li>
        <li>Test conducted on Citrated plasma.</li>
      </ol>
      <div class="report-note-heading">Comments :</div>
      <p>Fibrinogen (Factor I), a coagulation factor produced by the liver prolongs PT &amp; PTT at low plasma concentrations usually &lt;100 mg/dL.</p>
      <p><strong>Afibrinogenemia</strong> represents total absence of fibrinogen and is an autosomal recessive disorder causing mainly bleeding from umbilical stump &amp; mucosa.</p>
      <p><strong>Hypofibrinogenemia</strong> shows decreased levels of fibrinogen with a milder pattern of bleeding. These are also associated with recurrent miscarriage, antepartum and postpartum hemorrhage.</p>
      <p><strong>Dysfibrinogenemia</strong> represents a qualitative defect in fibrinogen and is most commonly acquired due to liver disease.</p>
      <p>Fibrinogen is also an acute phase reactant that rises sharply with conditions causing acute tissue inflammation or damage.</p>
      <div class="report-note-heading">Decreased levels :</div>
      <p>Disseminated Intravascular coagulation, liver disease, massive transfusion, Dysfibrinogenemia &amp; following thrombolytic therapy.</p>
      <div class="report-note-heading">Increased levels :</div>
      <p>Increasing age, female gender, pregnancy, contraception, post menopausal women, acute phase reaction &amp; disseminated malignancy.</p>
    </div>
  `;
}

function buildReticulocyteReportBody(test) {
  const result = findReportParameter(test, ["RETICULOCYTE COUNT", "Reticulocyte Count"])
    || (test.parameters || [])[0];
  const normalRange = result?.normal_range || "0.5 - 2.5";
  const unit = result?.unit || "%";
  const status = getCbcStatus(result?.value, normalRange);
  const statusText = status && status.label !== "Normal"
    ? ` <span class="reticulocyte-status ${status.className}">${status.label}</span>`
    : "";

  return `
    <table class="results-table reticulocyte-table">
      <thead>
        <tr>
          <th style="width: 40%">Investigation</th>
          <th style="width: 25%">Result</th>
          <th style="width: 22%">Reference Value</th>
          <th style="width: 13%">Unit</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><strong>Reticulocyte Count</strong><div class="reticulocyte-method">Automated</div></td>
          <td><span class="${status?.className || ""}">${escapeHtml(result?.value || "-")}</span>${statusText}</td>
          <td>${escapeHtml(normalRange)}</td>
          <td>${escapeHtml(unit)}</td>
        </tr>
      </tbody>
    </table>
    <div class="reticulocyte-notes">
      <div class="report-note-heading">Comments :</div>
      <p>Reticulocyte count or percentage is a good indicator of the bone marrow's ability to produce enough red blood cells (erythropoiesis).</p>
      <ul>
        <li>Help find out the cause of anemia, after an abnormal blood test</li>
        <li>Find out whether bone marrow is functioning properly</li>
        <li>Monitor response to a treatment, such as treatment for specific types of anemia</li>
        <li>Check bone marrow function after chemo or radiation therapy</li>
        <li>Monitor the function of bone marrow after a bone marrow transplant</li>
      </ul>
      <div class="report-note-heading">Low Reticulocyte Count Causes :</div>
      <ul>
        <li>Abnormal Bone Marrow Function</li>
        <li>Nutritional Deficiencies</li>
        <li>Alcoholism</li>
        <li>Viral infections, Kidney Disease and Liver Disease</li>
      </ul>
      <div class="report-note-heading">High Reticulocyte Count Causes :</div>
      <ul>
        <li>Blood Loss, Hemolysis, and Endurance Exercise</li>
        <li>Toxins, Smoking, Pregnancy</li>
        <li>Overproduction of Red Blood Cells</li>
        <li>Erythropoietin Therapy/Doping</li>
        <li>Treatment for Anemia or Recovery After Cancer Therapy</li>
      </ul>
    </div>
  `;
}

function buildClottingTimeReportBody(test) {
  const result = findReportParameter(test, ["CLOTTING TIME (CT)", "Clotting Time", "Result"])
    || (test.parameters || [])[0];
  const normalRange = result?.normal_range || "3 - 10";
  const unit = result?.unit || "minutes";
  const status = getCbcStatus(result?.value, normalRange);
  const statusLabel = status?.label === "High"
    ? "Prolonged"
    : status?.label === "Low"
      ? "Shortened"
      : status?.label === "Normal"
        ? "Normal"
        : "";

  return `
    <table class="results-table clotting-time-table">
      <thead>
        <tr>
          <th style="width: 42%">Investigation</th>
          <th style="width: 25%">Result</th>
          <th style="width: 23%">Reference Value</th>
          <th style="width: 10%">Unit</th>
        </tr>
      </thead>
      <tbody>
        <tr class="clotting-time-sample-row">
          <td><strong>Sample Type</strong></td>
          <td>Whole Blood (3 ml)</td>
          <td colspan="2"><strong>TAT :</strong> 30 min (Normal: 30 - 45 min)</td>
        </tr>
        <tr>
          <td><strong>Clotting Time (CT)</strong><div class="clotting-time-method">Lee &amp; White</div></td>
          <td><span class="${status?.className || ""}">${escapeHtml(result?.value || "-")}</span>${statusLabel ? ` <span class="clotting-time-status ${status?.className || ""}">${statusLabel}</span>` : ""}</td>
          <td>${escapeHtml(normalRange)}</td>
          <td>${escapeHtml(unit)}</td>
        </tr>
      </tbody>
    </table>
    <div class="clotting-time-notes">
      <div class="report-note-heading">Comments:</div>
      <p>Interpreting the Clotting Time (CT) involves assessing the time it takes for blood to clot in a laboratory setting.</p>
      <p>Here's a general guideline for interpreting CT:</p>
      <ul>
        <li><strong>Normal Clotting Time:</strong> A normal CT falls within a specific range established by the laboratory performing the test. This range is typically based on the reagents and equipment used. If the CT falls within this range, it suggests that the blood has a normal clotting ability.</li>
        <li><strong>Prolonged CT:</strong> If the CT is significantly longer than the established reference range, it may indicate a delay in the blood's ability to form a clot. This can be due to various factors, such as deficiencies in clotting factors (e.g., hemophilia), liver disease, vitamin K deficiency, or the presence of anticoagulant medications. Further tests may be necessary to identify the specific cause.</li>
        <li><strong>Shortened CT:</strong> In rare cases, a CT that is much shorter than the reference range may be observed. This may suggest a hypercoagulable state, where the blood has a tendency to clot more rapidly than usual. This can be associated with conditions like disseminated intravascular coagulation (DIC) or some genetic clotting disorders. Additional tests are often required to confirm the diagnosis.</li>
        <li><strong>Clinical Correlation:</strong> The interpretation of CT should always be done in conjunction with the patient's clinical history, symptoms, and other coagulation tests (such as PT and APTT). The context is crucial in determining the significance of a prolonged or shortened CT.</li>
        <li><strong>Treatment Adjustment:</strong> In clinical practice, if CT results indicate a prolonged or shortened clotting time, healthcare providers may use this information to guide treatment decisions, such as adjusting medication dosages or choosing appropriate therapies for coagulation disorders.</li>
      </ul>
    </div>
  `;
}

function buildBleedingTimeReportBody(test) {
  const result = findReportParameter(test, ["BLEEDING TIME (BT)", "Bleeding Time", "BT", "Result"])
    || (test.parameters || [])[0];
  const normalRange = result?.normal_range || "2 - 7";
  const unit = result?.unit || "minutes";
  const status = getCbcStatus(result?.value, normalRange);
  const statusLabel = status?.label === "High"
    ? "Prolonged"
    : status?.label === "Low"
      ? "Shortened"
      : status?.label === "Normal"
        ? "Normal"
        : "";

  return `
    <table class="results-table bleeding-time-table">
      <thead>
        <tr>
          <th style="width: 42%">Investigation</th>
          <th style="width: 25%">Result</th>
          <th style="width: 23%">Reference Value</th>
          <th style="width: 10%">Unit</th>
        </tr>
      </thead>
      <tbody>
        <tr class="bleeding-time-sample-row">
          <td><strong>Sample Type</strong></td>
          <td>Whole Blood</td>
          <td colspan="2"><strong>TAT :</strong> 10 min (Normal: 10 - 30 min)</td>
        </tr>
        <tr>
          <td><strong>Bleeding Time (BT)</strong><div class="bleeding-time-method">Ivy's Method</div></td>
          <td><span class="${status?.className || ""}">${escapeHtml(result?.value || "-")}</span>${statusLabel ? ` <span class="bleeding-time-status ${status?.className || ""}">${statusLabel}</span>` : ""}</td>
          <td>${escapeHtml(normalRange)}</td>
          <td>${escapeHtml(unit)}</td>
        </tr>
      </tbody>
    </table>
    <div class="bleeding-time-notes">
      <div class="report-note-heading">Comments:</div>
      <p>Interpreting Bleeding Time (BT) involves assessing the time it takes for a small standardized incision or puncture on the skin to stop bleeding.</p>
      <p>Here's a general guideline for interpreting BT:</p>
      <ol>
        <li><strong>Normal Bleeding Time:</strong> A normal BT typically falls within a specific range established by the laboratory performing the test. This range is usually around 2 to 7 minutes. If the BT falls within this range, it suggests that the blood is clotting appropriately, and the patient has a normal ability to form a platelet plug to stop bleeding from a small wound.</li>
        <li><strong>Prolonged Bleeding Time:</strong> If the BT is significantly longer than the reference range, it may indicate a delay in the blood's ability to stop bleeding. This could be due to various factors, such as platelet disorders (e.g., von Willebrand disease or thrombocytopenia), vascular abnormalities, or the use of medications that affect platelet function. A prolonged BT may also be associated with certain hereditary or acquired bleeding disorders. Further tests, such as platelet function assays and coagulation factor tests, may be needed to identify the specific cause.</li>
        <li><strong>Clinical Correlation:</strong> Interpretation of BT should always be done in conjunction with the patient's clinical history, symptoms, and other coagulation tests (such as PT and APTT). The context is essential in determining the significance of a prolonged BT.</li>
        <li><strong>Treatment Adjustment:</strong> In clinical practice, if BT results indicate a prolonged bleeding time, healthcare providers may use this information to guide treatment decisions. Treatment may involve addressing the underlying cause, adjusting medication dosages, or providing specific therapies for bleeding disorders.</li>
      </ol>
      <p>It's important to note that while BT can provide valuable information, it is considered less sensitive and specific than other coagulation tests, such as PT and APTT. A comprehensive evaluation of a patient's coagulation profile, including additional specific tests, is often necessary for a more accurate diagnosis and appropriate management of bleeding disorders.</p>
    </div>
  `;
}

function buildCoagulationProfileReportBody(test) {
  const definitions = [
    {
      label: "Bleeding Time (BT)",
      aliases: ["BLEEDING TIME (BT)", "Bleeding Time", "BT"],
      method: "Ivy's Method",
      range: "3 - 10",
      unit: "min.",
    },
    {
      label: "Clotting Time (CT)",
      aliases: ["CLOTTING TIME (CT)", "Clotting Time", "CT"],
      method: "Lee &amp; White",
      range: "2 - 7",
      unit: "min.",
    },
    {
      label: "Prothrombin Time (PT)",
      aliases: ["PROTHROMBIN TIME (PT)", "Prothrombin Time", "PT"],
      method: "Photo optical Clot Detection",
      range: "10.3 - 12.8",
      unit: "sec.",
    },
    {
      label: "Activated Partial Thromboplastin Time (APTT)",
      aliases: ["ACTIVATED PARTIAL THROMBOPLASTIN TIME (APTT)", "Activated Partial Thromboplastin Time", "APTT"],
      method: "",
      range: "25 - 37",
      unit: "sec.",
    },
  ];

  const rows = definitions.map(definition => {
    const parameter = findReportParameter(test, definition.aliases);
    const range = parameter?.normal_range || definition.range;
    const unit = parameter?.unit || definition.unit;
    const status = getCbcStatus(parameter?.value, range);
    const statusText = status && status.label !== "Normal"
      ? ` <span class="coagulation-profile-status ${status.className}">${status.label}</span>`
      : "";

    return `
      <tr>
        <td><strong>${definition.label}</strong>${definition.method ? `<div class="coagulation-profile-method">${definition.method}</div>` : ""}</td>
        <td><span class="${status?.className || ""}">${escapeHtml(parameter?.value || "-")}</span>${statusText}</td>
        <td>${escapeHtml(range)}</td>
        <td>${escapeHtml(unit)}</td>
      </tr>
    `;
  }).join("");

  return `
    <table class="results-table coagulation-profile-table">
      <thead>
        <tr>
          <th style="width: 38%">Investigation</th>
          <th style="width: 26%">Result</th>
          <th style="width: 25%">Reference Value</th>
          <th style="width: 11%">Unit</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="coagulation-profile-notes">
      <div class="report-note-heading">Note:</div>
      <ul>
        <li>Degree of prolongation of PTT / APTT is neither predictive of bleeding risk nor underlying diagnosis.</li>
        <li>Results should be clinically correlated &amp; test conducted on Citrated plasma.</li>
      </ul>

      <div class="report-note-heading">Comments:</div>
      <p>Partial Thromboplastin time (PTT / APTT) measures the proteins of the intrinsic coagulation pathway which consists of Factor XII, Prekallikrein, High molecular weight kininogen, Factors VIII, IX &amp; XI. It also measures proteins of the common pathway namely factors II, V, X &amp; Fibrinogen. PTT is prolonged when Factor VIII level is &lt; 35-40% of normal and Factor XII &amp; High molecular weight kininogen is &lt; 10-15% of normal.</p>

      <div class="report-note-heading">Abnormal Partial Thromboplastin Time</div>
      <ul>
        <li>Associated with bleeding: Defects of factors VIII, IX &amp; XI.</li>
        <li>Not associated with bleeding: Defects of factor XII, Prekallikrein, High molecular weight kininogen &amp; Lupus anticoagulants.</li>
      </ul>

      <div class="report-note-heading">Causes of prolonged PTT / APTT</div>
      <ul>
        <li>Liver disease &amp; consumptive coagulopathy.</li>
        <li>Circulating anticoagulants including Lupus Anticoagulant, Oral Anticoagulant therapy &amp; Factor deficiencies.</li>
      </ul>

      <div class="report-note-heading">Recommended Therapeutic range for Oral Anticoagulant therapy</div>
      <table class="coagulation-therapy-table">
        <tbody>
          <tr>
            <td>INR 2.0-3.0</td>
            <td>
              <ul>
                <li>Treatment of Venous thrombosis &amp; Pulmonary embolism</li>
                <li>Prophylaxis of Venous thrombosis (High risk surgery)</li>
                <li>Prevention of systemic embolism in tissue heart valves, AMI, Valvular heart disease &amp; Atrial fibrillation</li>
                <li>Bileaflet mechanical valve in aortic position</li>
              </ul>
            </td>
          </tr>
          <tr>
            <td>INR 2.5-3.5</td>
            <td>
              <ul>
                <li>Mechanical prosthetic valves</li>
                <li>Systemic recurrent emboli</li>
              </ul>
            </td>
          </tr>
        </tbody>
      </table>

      <div class="report-note-heading">Comments:</div>
      <p>Prothrombin time measures the extrinsic coagulation pathway which consists of activated Factor VII (VIIa), Tissue factor and Proteins of the common pathway (Factors X, V, II &amp; Fibrinogen). This assay is used to control long term oral anticoagulant therapy, evaluation of liver function &amp; to evaluate coagulation disorders specially factors involved in the extrinsic pathway like Factors V, VII, X, Prothrombin &amp; Fibrinogen.</p>
    </div>
  `;
}

function buildFactorViiiReportBody(test) {
  const result = findReportParameter(test, ["FACTOR VIII, FUNCTIONAL / ACTIVITY (FVIII:C)", "Factor VIII Activity", "Result"])
    || (test.parameters || [])[0];
  const normalRange = result?.normal_range || "50.00 - 150.00";
  const unit = result?.unit || "%";
  const status = getCbcStatus(result?.value, normalRange);
  const statusText = status
    ? ` <span class="factor-viii-status ${status.className}">${status.label}</span>`
    : "";

  return `
    <table class="results-table factor-viii-table">
      <thead>
        <tr>
          <th style="width: 42%">Investigation</th>
          <th style="width: 25%">Result</th>
          <th style="width: 23%">Reference Value</th>
          <th style="width: 10%">Unit</th>
        </tr>
      </thead>
      <tbody>
        <tr class="factor-viii-sample-row">
          <td><strong>Sample Type</strong></td>
          <td>Blood, Plasma (3 ml)</td>
          <td colspan="2"><strong>TAT :</strong> 8 hrs (Normal: 1 - 3 days)</td>
        </tr>
        <tr>
          <td><strong>Factor VIII, Functional / Activity (FVIII:C)</strong><div class="factor-viii-method">Ivy's Method</div></td>
          <td><span class="${status?.className || ""}">${escapeHtml(result?.value || "-")}</span>${statusText}</td>
          <td>${escapeHtml(normalRange)}</td>
          <td>${escapeHtml(unit)}</td>
        </tr>
      </tbody>
    </table>
    <table class="factor-viii-classification-table">
      <thead>
        <tr><th colspan="4">Classification of Hemophilia A</th></tr>
        <tr><th>Parameters</th><th>Severe</th><th>Moderate</th><th>Mild</th></tr>
      </thead>
      <tbody>
        <tr><td>Factor VIII activity in %</td><td>&lt; 1</td><td>1 - 5</td><td>6 - 30</td></tr>
        <tr><td>Bleeding episodes</td><td>2 - 4 per month</td><td>4 - 6 per year</td><td>Uncommon</td></tr>
        <tr><td>Etiology of bleeding</td><td>Spontaneous</td><td>Minor trauma</td><td>Major trauma</td></tr>
        <tr><td>Percentage of Affected Patients</td><td>50 - 70</td><td>10</td><td>30 - 40</td></tr>
      </tbody>
    </table>
    <div class="factor-viii-notes">
      <div class="report-note-heading">Interpretation:</div>
      <ul>
        <li><strong>Normal Range:</strong> The normal range for Factor VIII levels can vary slightly between different laboratories. In general, Factor VIII activity is expressed as a percentage, with 100% being considered normal.</li>
        <li><strong>Low Levels:</strong> A low level of Factor VIII is indicative of a bleeding disorder. Hemophilia A, the most common form of hemophilia, is characterized by a deficiency of Factor VIII. The severity of symptoms can vary based on the extent of the deficiency.</li>
        <li><strong>High Levels:</strong> Elevated Factor VIII levels may be associated with certain medical conditions, such as liver disease or inflammatory disorders. However, high levels are less common than low levels.</li>
      </ul>
      <div class="report-note-heading">Comments:</div>
      <p>Hemophilia A, characterized by Factor VIII deficiency, is the most prevalent severe congenital bleeding disorder, primarily affecting males at a rate of 1 in 5000 to 10,000. Females are typically carriers, but in rare instances, they may develop Hemophilia A due to imbalanced Lyonization of the normal X-chromosome, Turner's syndrome, or if they are daughters of an affected male and a carrier female. The condition is marked by symptoms such as hemarthrosis, soft tissue hematomas, easy bruising, excessive bleeding during surgical procedures, dental extractions, and impaired wound healing.</p>
    </div>
  `;
}

function buildPeripheralBloodSmearReportBody(test) {
  const rbcMorphology = findReportParameter(test, ["RBC Morphology"]);
  const wbcMorphology = findReportParameter(test, ["WBC Morphology"]);
  const platelets = findReportParameter(test, ["Platelets"]);
  const rows = [
    ["RBC Morphology", rbcMorphology],
    ["WBC Morphology", wbcMorphology],
    ["Platelets", platelets],
  ].map(([label, parameter]) => `
    <tr>
      <td><strong>${label}</strong><div class="peripheral-smear-method">Microscopy</div></td>
      <td colspan="3">${escapeHtml(parameter?.value || "-")}</td>
    </tr>
  `).join("");

  return `
    <table class="results-table peripheral-smear-table">
      <thead>
        <tr>
          <th style="width: 42%">Investigation</th>
          <th style="width: 25%">Result</th>
          <th style="width: 23%">Reference Value</th>
          <th style="width: 10%">Unit</th>
        </tr>
      </thead>
      <tbody>
        <tr class="peripheral-smear-section"><td colspan="4">Peripheral Blood Smear Examination</td></tr>
        ${rows}
      </tbody>
    </table>
  `;
}

function buildFactorViiReportBody(test) {
  const result = findReportParameter(test, ["FACTOR VII, FUNCTIONAL", "Factor VII Functional", "Result"])
    || (test.parameters || [])[0];
  const normalRange = result?.normal_range || "70.00 - 120.00";
  const unit = result?.unit || "%";
  const status = getCbcStatus(result?.value, normalRange);
  const statusText = status
    ? ` <span class="factor-vii-status ${status.className}">${status.label}</span>`
    : "";

  return `
    <table class="results-table factor-vii-table">
      <thead>
        <tr>
          <th style="width: 42%">Investigation</th>
          <th style="width: 25%">Result</th>
          <th style="width: 23%">Reference Value</th>
          <th style="width: 10%">Unit</th>
        </tr>
      </thead>
      <tbody>
        <tr class="factor-vii-sample-row">
          <td><strong>Sample Type</strong></td>
          <td>Blood, Plasma (3 ml)</td>
          <td colspan="2"><strong>TAT :</strong> 8 hrs (Normal: 1 - 3 days)</td>
        </tr>
        <tr>
          <td><strong>FACTOR VII, FUNCTIONAL</strong><div class="factor-vii-method">Photo Optical Clot Detection</div></td>
          <td><span class="${status?.className || ""}">${escapeHtml(result?.value || "-")}</span>${statusText}</td>
          <td>${escapeHtml(normalRange)}</td>
          <td>${escapeHtml(unit)}</td>
        </tr>
      </tbody>
    </table>
    <div class="factor-vii-notes">
      <div class="report-note-heading">Interpretation:</div>
      <ul>
        <li><strong>Normal Range:</strong> Factor VII activity is usually expressed as a percentage, with 100% being considered normal. However, reference ranges can vary among laboratories.</li>
        <li><strong>Low Levels:</strong> Low levels of Factor VII may be associated with conditions such as liver disease or vitamin K deficiency. In severe cases, it can contribute to bleeding disorders.</li>
        <li><strong>High Levels:</strong> Elevated Factor VII levels are less common. They may be seen in certain medical conditions or as a response to certain medications.</li>
      </ul>
      <div class="report-note-heading">Comments:</div>
      <p>Factor VII deficiency is relatively common when compared to other rare hereditary coagulation factor deficiencies. Mild to moderate deficiency is characterized by symptoms like nosebleeds, mucosal bleeding, and menorrhagia. Severe deficiency, typically inherited in an autosomal recessive manner, presents shortly after birth with intracranial hemorrhage. Factor VII is a clotting factor dependent on vitamin K, and its levels can be low in newborns, especially in the presence of vitamin K deficiency. It is associated with a normal Partial Thromboplastin Time (PTT) but a prolonged Prothrombin Time (PT).</p>
    </div>
  `;
}

function buildFactorVReportBody(test) {
  const result = findReportParameter(test, ["FACTOR V, FUNCTIONAL", "Factor V Functional", "Result"])
    || (test.parameters || [])[0];
  const normalRange = result?.normal_range || "70.00 - 120.00";
  const unit = result?.unit || "%";
  const status = getCbcStatus(result?.value, normalRange);
  const statusText = status
    ? ` <span class="factor-v-status ${status.className}">${status.label}</span>`
    : "";

  return `
    <table class="results-table factor-v-table">
      <thead>
        <tr>
          <th style="width: 35%">Investigation</th>
          <th style="width: 30%">Result</th>
          <th style="width: 25%">Reference Value</th>
          <th style="width: 10%">Unit</th>
        </tr>
      </thead>
      <tbody>
        <tr class="factor-v-sample-row">
          <td><strong>Sample Type</strong></td>
          <td>Blood, Plasma (3 ml)</td>
          <td colspan="2"><strong>TAT :</strong> 8 hrs (Normal: 1 - 3 days)</td>
        </tr>
        <tr>
          <td><strong>FACTOR V, FUNCTIONAL</strong><div class="factor-v-method">Photo Optical Clot Detection</div></td>
          <td><span class="${status?.className || ""}">${escapeHtml(result?.value || "-")}</span>${statusText}</td>
          <td>${escapeHtml(normalRange)}</td>
          <td>${escapeHtml(unit)}</td>
        </tr>
      </tbody>
    </table>
    <div class="factor-v-notes">
      <div class="report-note-heading">Interpretation:</div>
      <ul>
        <li><strong>Normal Range:</strong> Factor V activity is usually expressed as a percentage, with 100% being considered normal. However, reference ranges can vary among laboratories.</li>
        <li><strong>Low Levels:</strong> Low levels of Factor V are relatively rare but can be associated with conditions such as congenital Factor V deficiency, which may lead to a bleeding tendency.</li>
        <li><strong>High Levels:</strong> Elevated Factor V levels are less common but can be associated with an increased risk of venous thrombosis. Factor V Leiden, a genetic mutation that makes blood more prone to clotting, is an example of a condition where Factor V levels may be increased.</li>
      </ul>
      <div class="report-note-heading">Comments:</div>
      <p>Factor V, also known as Proaccelerin or Labile factor, deficiency is an autosomal recessive inherited disorder, typically without noticeable symptoms. Homozygous Factor V deficiency is infrequent but can result in easy bruising and mucosal bleeding in children. Individuals with Factor V deficiency should also undergo Factor VIII assays to assess for combined deficiencies. Acquired deficiencies may occur in cases of liver disease and Disseminated Intravascular Coagulation (DIC).</p>
    </div>
  `;
}

function buildFactorIxReportBody(test) {
  const result = findReportParameter(test, ["FACTOR IX, FUNCTIONAL", "Factor IX Functional", "Result"])
    || (test.parameters || [])[0];
  const normalRange = result?.normal_range || "70.00 - 120.00";
  const unit = result?.unit || "%";
  const status = getCbcStatus(result?.value, normalRange);
  const statusText = status
    ? ` <span class="factor-ix-status ${status.className}">${status.label}</span>`
    : "";

  return `
    <table class="results-table factor-ix-table">
      <thead>
        <tr>
          <th style="width: 35%">Investigation</th>
          <th style="width: 30%">Result</th>
          <th style="width: 25%">Reference Value</th>
          <th style="width: 10%">Unit</th>
        </tr>
      </thead>
      <tbody>
        <tr class="factor-ix-sample-row">
          <td><strong>Sample Type</strong></td>
          <td>Blood, Plasma (3 ml)</td>
          <td colspan="2"><strong>TAT :</strong> 8 hrs (Normal: 1 - 3 days)</td>
        </tr>
        <tr>
          <td><strong>FACTOR IX, FUNCTIONAL</strong><div class="factor-ix-method">Photo Optical Clot Detection</div></td>
          <td><span class="${status?.className || ""}">${escapeHtml(result?.value || "-")}</span>${statusText}</td>
          <td>${escapeHtml(normalRange)}</td>
          <td>${escapeHtml(unit)}</td>
        </tr>
      </tbody>
    </table>
    <div class="factor-ix-notes">
      <div class="report-note-heading">Interpretation:</div>
      <ul>
        <li><strong>Normal Range:</strong> Factor IX activity is usually expressed as a percentage, with 100% being considered normal. However, reference ranges can vary among laboratories.</li>
        <li><strong>Low Levels:</strong> Low levels of Factor IX can result in a bleeding tendency. Hemophilia B, also known as Christmas disease, is characterized by a deficiency or dysfunction of Factor IX. The severity of bleeding symptoms can vary depending on the extent of the deficiency.</li>
        <li><strong>High Levels:</strong> Elevated Factor IX levels are less common and may be associated with certain medical conditions or as a response to oral contraceptives. However, high Factor IX levels are less likely to result in bleeding tendencies.</li>
      </ul>
      <div class="report-note-heading">Comments:</div>
      <p>Hemophilia B, also known as Christmas disease (resulting from Factor IX deficiency), is a severe congenital bleeding disorder linked to the X chromosome. It affects approximately 1 in 25,000 to 30,000 males. This condition is characterized by symptoms such as hemarthrosis (bleeding into joints), soft tissue hematomas, easy bruising, excessive bleeding during surgical procedures, dental extractions, and slow wound healing. During childhood, Factor IX activity levels typically remain at around 75% of adult levels. At puberty, both males and females experience a 25% increase in Factor IX expression.</p>
    </div>
  `;
}

function buildFactorXReportBody(test) {
  const result = findReportParameter(test, ["FACTOR X, FUNCTIONAL", "Factor X Functional", "Result"])
    || (test.parameters || [])[0];
  const normalRange = result?.normal_range || "70.00 - 120.00";
  const unit = result?.unit || "%";
  const status = getCbcStatus(result?.value, normalRange);
  const statusText = status
    ? ` <span class="factor-x-status ${status.className}">${status.label}</span>`
    : "";

  return `
    <table class="results-table factor-x-table">
      <thead>
        <tr>
          <th style="width: 35%">Investigation</th>
          <th style="width: 30%">Result</th>
          <th style="width: 25%">Reference Value</th>
          <th style="width: 10%">Unit</th>
        </tr>
      </thead>
      <tbody>
        <tr class="factor-x-sample-row">
          <td><strong>Sample Type</strong></td>
          <td>Blood, Plasma (3 ml)</td>
          <td colspan="2"><strong>TAT :</strong> 8 hrs (Normal: 1 - 3 days)</td>
        </tr>
        <tr>
          <td><strong>FACTOR X, FUNCTIONAL</strong><div class="factor-x-method">Electromechanical Clot Detection</div></td>
          <td><span class="${status?.className || ""}">${escapeHtml(result?.value || "-")}</span>${statusText}</td>
          <td>${escapeHtml(normalRange)}</td>
          <td>${escapeHtml(unit)}</td>
        </tr>
      </tbody>
    </table>
    <div class="factor-x-notes">
      <div class="report-note-heading">Interpretation:</div>
      <ul>
        <li><strong>Normal Range:</strong> Factor X activity is usually expressed as a percentage, with 100% being considered normal. However, reference ranges can vary among laboratories.</li>
        <li><strong>Low Levels:</strong> Low levels of Factor X can result in a bleeding tendency. Conditions such as Factor X deficiency, which can be inherited or acquired, may lead to abnormal bleeding.</li>
        <li><strong>High Levels:</strong> Elevated Factor X levels are less common and may be associated with certain medical conditions or as a response to medications. However, high Factor X levels are less likely to result in bleeding tendencies.</li>
      </ul>
      <div class="report-note-heading">Comments:</div>
      <p>Factor X, also known as Stuart-Prower factor, deficiency can manifest as either heterozygous or homozygous. Heterozygous deficiency is typically asymptomatic, whereas homozygous deficiency is associated with severe bleeding, particularly in infancy. As Factor X is a vitamin K-dependent clotting factor, it is crucial to rule out acquired causes like Vitamin K deficiency or other factors before diagnosing inherited deficiency. This condition is often observed in Primary Amyloidosis (affecting 8.7% of patients).</p>
    </div>
  `;
}

function getFactorXiStatus(value, normalRange) {
  const numericValue = Number.parseFloat(String(value ?? "").replace(/,/g, ""));
  if (!Number.isFinite(numericValue)) return null;

  const bounds = getRangeBounds(normalRange) || { min: 70, max: 120 };
  if (numericValue < 20) return { label: "Severe Deficiency", className: "high-val" };
  if (numericValue < bounds.min) return { label: "Mild Deficiency", className: "high-val" };
  if (numericValue <= bounds.max) return { label: "Normal", className: "normal-val" };
  return { label: "High", className: "high-val" };
}

function buildFactorXiReportBody(test) {
  const result = findReportParameter(test, ["FACTOR XI, FUNCTIONAL", "Factor XI Functional", "Result"])
    || (test.parameters || [])[0];
  const normalRange = result?.normal_range || "70.00 - 120.00";
  const unit = result?.unit || "%";
  const status = getFactorXiStatus(result?.value, normalRange);
  const statusText = status
    ? ` <span class="factor-xi-status ${status.className}">${status.label}</span>`
    : "";

  return `
    <table class="results-table factor-xi-table">
      <thead>
        <tr>
          <th style="width: 35%">Investigation</th>
          <th style="width: 30%">Result</th>
          <th style="width: 25%">Reference Value</th>
          <th style="width: 10%">Unit</th>
        </tr>
      </thead>
      <tbody>
        <tr class="factor-xi-sample-row">
          <td><strong>Sample Type</strong></td>
          <td>Blood, Plasma (3 ml)</td>
          <td colspan="2"><strong>TAT :</strong> 8 hrs (Normal: 1 - 3 days)</td>
        </tr>
        <tr>
          <td><strong>FACTOR XI, FUNCTIONAL</strong><div class="factor-xi-method">Photo Optical Clot Detection</div></td>
          <td><span class="${status?.className || ""}">${escapeHtml(result?.value || "-")}</span>${statusText}</td>
          <td>${escapeHtml(normalRange)}</td>
          <td>${escapeHtml(unit)}</td>
        </tr>
      </tbody>
    </table>
    <div class="factor-xi-notes">
      <div class="report-note-heading">Interpretation</div>
      <table class="factor-xi-interpretation-table">
        <thead>
          <tr><th>Parameter</th><th>Severe Deficiency</th><th>Mild Deficiency</th></tr>
        </thead>
        <tbody>
          <tr><td><strong>Factor XI activity</strong></td><td>&lt; 20.00 %</td><td>20.00 - 70.00 %</td></tr>
        </tbody>
      </table>
      <ul>
        <li><strong>Normal Range:</strong> Factor XI activity is usually expressed as a percentage, with 100% being considered normal. However, reference ranges can vary among laboratories.</li>
        <li><strong>Low Levels:</strong> Factor XI deficiency can be associated with a bleeding tendency, but the severity of bleeding can vary widely among affected individuals. Some people with mild deficiencies may not experience significant bleeding symptoms.</li>
        <li><strong>High Levels:</strong> Elevated Factor XI levels are less common and may be associated with conditions such as liver disease or inflammation. However, high Factor XI levels are less likely to result in bleeding tendencies.</li>
      </ul>
      <div class="report-note-heading">Comments:</div>
      <p>Factor XI, also known as Plasma Thromboplastin Antecedent, deficiency is frequently observed in the Ashkenazi Jewish population, with a prevalence of 8% among heterozygotes. Individuals with this deficiency tend to experience spontaneous bleeding and hemorrhage following injuries or surgical procedures. In women, it often leads to menorrhagia (excessive menstrual bleeding) and postpartum hemorrhage. The development of inhibitors is a rare occurrence in patients with Factor XI deficiency. This disorder is the most common among the rare bleeding disorders and is the second most prevalent bleeding disorder in women, following Von Willebrand disease.</p>
    </div>
  `;
}

function buildFactorXiiReportBody(test) {
  const result = findReportParameter(test, ["FACTOR XII, FUNCTIONAL", "Factor XII Functional", "Result"])
    || (test.parameters || [])[0];
  const normalRange = result?.normal_range || "70.00 - 120.00";
  const unit = result?.unit || "%";
  const status = getCbcStatus(result?.value, normalRange);
  const statusText = status
    ? ` <span class="factor-xii-status ${status.className}">${status.label}</span>`
    : "";

  return `
    <table class="results-table factor-xii-table">
      <thead>
        <tr>
          <th style="width: 42%">Investigation</th>
          <th style="width: 25%">Result</th>
          <th style="width: 23%">Reference Value</th>
          <th style="width: 10%">Unit</th>
        </tr>
      </thead>
      <tbody>
        <tr class="factor-xii-sample-row">
          <td><strong>Sample Type</strong></td>
          <td>Blood, Plasma (3 ml)</td>
          <td colspan="2"><strong>TAT :</strong> 8 hrs (Normal: 1 - 3 days)</td>
        </tr>
        <tr>
          <td><strong>Factor XII, Functional</strong><div class="factor-xii-method">Photo Optical Clot Detection</div></td>
          <td><span class="${status?.className || ""}">${escapeHtml(result?.value || "-")}</span>${statusText}</td>
          <td>${escapeHtml(normalRange)}</td>
          <td>${escapeHtml(unit)}</td>
        </tr>
      </tbody>
    </table>
    <div class="factor-xii-notes">
      <div class="report-note-heading">Interpretation:</div>
      <ul>
        <li><strong>Normal Range:</strong> Factor XII levels are typically not routinely measured in clinical practice, as deficiencies are rare, and low levels do not necessarily result in bleeding disorders. Factor XII deficiency is generally not associated with a bleeding tendency.</li>
        <li><strong>Low Levels:</strong> Factor XII deficiency is a rare condition and is usually not associated with a significant bleeding risk. It may be discovered incidentally during coagulation testing.</li>
        <li><strong>High Levels:</strong> Elevated Factor XII levels are less commonly encountered and may be associated with certain medical conditions. However, Factor XII levels are not routinely tested for hypercoagulable states.</li>
      </ul>
      <div class="report-note-heading">Comments:</div>
      <p>Factor XII, also known as Hageman factor, deficiency is a relatively common condition found in individuals of all racial and ethnic backgrounds. It is characterized by a prolonged activated partial thromboplastin time (APTT) without a heightened risk of bleeding. Recognizing Factor XII deficiency in cases with prolonged APTT is crucial to avoid unnecessary transfusions. Additionally, it's worth noting that Factor XII deficiency may be associated with an increased risk of thrombosis.</p>
    </div>
  `;
}

function buildFactorXiiiReportBody(test) {
  const result = findReportParameter(test, ["FACTOR XIII, FUNCTIONAL, QUALITATIVE", "Factor XIII Qualitative", "Result"])
    || (test.parameters || [])[0];
  const resultValue = String(result?.value || "-");
  const normalizedValue = normalizeParameterName(resultValue);
  const valueClass = normalizedValue === "normal"
    ? "normal-val"
    : normalizedValue.includes("diminished") || normalizedValue.includes("deficien") || normalizedValue.includes("abnormal") || normalizedValue.includes("low")
      ? "high-val"
      : "";

  return `
    <table class="results-table factor-xiii-table">
      <thead>
        <tr>
          <th style="width: 42%">Investigation</th>
          <th style="width: 25%">Result</th>
          <th style="width: 23%">Reference Value</th>
          <th style="width: 10%">Unit</th>
        </tr>
      </thead>
      <tbody>
        <tr class="factor-xiii-sample-row">
          <td><strong>Sample Type</strong></td>
          <td>Blood, Plasma (3 ml)</td>
          <td colspan="2"><strong>TAT :</strong> 8 hrs (Normal: 1 - 3 days)</td>
        </tr>
        <tr>
          <td><strong>Factor XIII, Functional, Qualitative</strong><div class="factor-xiii-method">Clot dissolution with 5M Urea</div></td>
          <td><span class="${valueClass}">${escapeHtml(resultValue)}</span></td>
          <td></td>
          <td></td>
        </tr>
      </tbody>
    </table>
    <div class="factor-xiii-notes">
      <div class="report-note-heading">Interpretation:</div>
      <ul>
        <li><strong>Normal Range:</strong> Factor XIII activity is usually expressed as a percentage, with 100% being considered normal. However, reference ranges can vary among laboratories.</li>
        <li><strong>Low Levels:</strong> Low levels of Factor XIII can result in a tendency for delayed or inadequate clot stabilization. This deficiency is rare but can lead to prolonged bleeding and poor wound healing.</li>
        <li><strong>High Levels:</strong> Elevated Factor XIII levels are less common and may be associated with certain medical conditions or as a response to medications. However, high Factor XIII levels are less likely to result in bleeding tendencies.</li>
      </ul>
      <div class="report-note-heading">Comments:</div>
      <p>Factor XIII, also known as Fibrin Stabilizing Factor, deficiency should be considered in individuals who have a history of bleeding issues but exhibit normal Prothrombin Time (PT) and Partial Thromboplastin Time (PTT). In cases where prophylactic therapy has not been initiated, it's noteworthy that approximately 30% of severely deficient patients may experience spontaneous intracranial hemorrhage in middle age. Factor XIII deficiency is often associated with bleeding from the umbilical stump and an increased risk of miscarriages.</p>
    </div>
  `;
}

function buildRtPcrReportBody(test) {
  const result = findReportParameter(test, ["SARS-CoV-2 (COVID-19) Qualitative", "Result"])
    || (test.parameters || [])[0];
  const resultValue = String(result?.value || "-");
  const normalizedValue = normalizeParameterName(resultValue);
  const valueClass = normalizedValue === "negative" || normalizedValue.includes("notdetected")
    ? "normal-val"
    : normalizedValue === "positive" || normalizedValue.includes("detected")
      ? "high-val"
      : "";
  const specimenType = test.sample_type || "Nasopharyngeal / Oropharyngeal Swab";

  return `
    <table class="results-table rt-pcr-table">
      <thead>
        <tr>
          <th style="width: 40%">Investigation</th>
          <th style="width: 25%">Result</th>
          <th style="width: 22%">Reference Value</th>
          <th style="width: 13%">Unit</th>
        </tr>
      </thead>
      <tbody>
        <tr class="rt-pcr-investigation-row">
          <td colspan="4"><strong>SARS-CoV-2 (COVID-19) QUALITATIVE</strong><div class="rt-pcr-method">REAL TIME RT-PCR</div></td>
        </tr>
        <tr>
          <td>Type of Specimen</td>
          <td colspan="3">${escapeHtml(specimenType)}</td>
        </tr>
        <tr>
          <td>Result</td>
          <td colspan="3"><strong class="${valueClass}">${escapeHtml(resultValue)}</strong></td>
        </tr>
      </tbody>
    </table>
    <div class="rt-pcr-notes">
      <div class="report-note-heading">Note:</div>
      <ol>
        <li>ICMR registration number for COVID-19 is LABXXX01. Please scan the QR code given at the end of this report to check the authenticity of the report.</li>
        <li>Negative result does not rule out the possibility of COVID-19 infection. Presence of inhibitors, mutations, and insufficient RNA specific to SARS-CoV-2 can influence the test result. Kindly correlate the results with clinical findings. A negative result in a single upper respiratory tract sample does not rule out SARS-CoV-2 infection. In such cases, a repeat sample should be sent. Lower respiratory tract samples like sputum, BAL, and ET aspirate are appropriate samples especially in severe and progressive lung disease.</li>
        <li>COVID-19 test conducted as per kits approved by ICMR / CE-IVD / USFDA.</li>
        <li>Kindly consult the referring physician / authorized hospitals for appropriate follow up.</li>
        <li>This is a qualitative test. The Ct values do not provide a measure of viral load due to inherent variability in sampling and kits. According to ICMR guidelines, Ct values should not be used to gauge the severity of the disease.</li>
        <li>It is recommended that RT-PCR test not be repeated in any individual who has tested positive once either by RAT or RT-PCR, as per ICMR guidelines.</li>
        <li>No testing is required for COVID-19 recovered individuals at the time of hospital discharge in accordance with the discharge policy of MoH&amp;FW (https://www.mohfw.gov.in/pdf/ReviseddischargePolicyforCOVI019.pdf).</li>
      </ol>
      <div class="report-note-heading">Comments:</div>
      <p>Coronaviruses (CoV) are a large family of viruses that cause illness ranging from the common cold to more severe diseases such as Middle East Respiratory Syndrome (MERS-CoV) and Severe Acute Respiratory Syndrome (SARS-CoV). Coronavirus disease (COVID-19) is a new strain that was discovered in 2019 and has not been previously identified in humans. Common signs of infection include respiratory symptoms, fever, cough, shortness of breath, and breathing difficulties. In more severe cases, infection can cause pneumonia, severe acute respiratory syndrome, and kidney failure.</p>
    </div>
  `;
}

function buildTpmtGenotypingReportBody(test) {
  const mutations = [
    "TPMT*1 wild type",
    "TPMT*2 G238C",
    "TPMT*3A G460A and A719G",
    "TPMT*3B G460A",
    "TPMT*3C A719G",
  ];
  const rows = mutations.map((mutation) => {
    const result = findReportParameter(test, [mutation]);
    const resultValue = String(result?.value || "-");
    const status = getDetectedStatus(resultValue);
    return `
      <tr>
        <td><strong>${escapeHtml(mutation)}</strong></td>
        <td><span class="${status?.className || ""}"><strong>${escapeHtml(resultValue)}</strong></span></td>
        <td><span class="${status?.className || ""}"><strong>${status?.label || ""}</strong></span></td>
        <td></td>
      </tr>
    `;
  }).join("");

  return `
    <table class="results-table tpmt-table">
      <thead>
        <tr>
          <th style="width: 40%">Investigation</th>
          <th style="width: 25%">Result</th>
          <th style="width: 22%">Reference Value</th>
          <th style="width: 13%">Unit</th>
        </tr>
      </thead>
      <tbody>
        <tr class="tpmt-investigation-row">
          <td colspan="4"><strong>THIOPURINE METHYL TRANSFERASE (TPMT), GENOTYPING</strong><div class="tpmt-method">Real Time PCR</div></td>
        </tr>
        <tr class="tpmt-sample-row">
          <td><strong>Sample Type</strong></td>
          <td>Blood (2 ml)</td>
          <td colspan="2"><strong>TAT :</strong> 1 Week (Normal: 1 - 4 Weeks)</td>
        </tr>
        ${rows}
      </tbody>
    </table>
    <table class="tpmt-interpretation-table">
      <thead>
        <tr><th colspan="2" class="tpmt-interpretation-title">Interpretation</th></tr>
        <tr><th>GENOTYPE</th><th>EFFECT OF POLYMORPHISM</th></tr>
      </thead>
      <tbody>
        <tr><td>TPMT*1 wild type</td><td>Normal enzyme activity</td></tr>
        <tr><td>TPMT*2 G238C</td><td>Reduced enzyme activity</td></tr>
        <tr><td>TPMT*3A G460A and A719G</td><td>No enzyme activity</td></tr>
        <tr><td>TPMT*3B G460A</td><td>Reduced enzyme activity</td></tr>
        <tr><td>TPMT*3C A719G</td><td>Reduced enzyme activity</td></tr>
      </tbody>
    </table>
    <div class="tpmt-notes">
      <div class="report-note-heading">Note:</div>
      <ol>
        <li>This test predicts the TPMT enzyme activity based on polymorphism at three positions 238, 460, and 719 of the TPMT gene.</li>
        <li>Current TPMT phenotype may not be reproducible in patients who have received blood transfusions within 30-60 days of testing.</li>
      </ol>
      <div class="report-note-heading">Comments:</div>
      <p>It is recommended to measure TPMT (Thiopurine S-methyltransferase) activity before initiating treatment with Thiopurine drugs, such as Azathioprine, 6-Mercaptopurine, and 6-Thioguanine. Patients with low TPMT activity (prevalence of about 10%) or those with absent TPMT activity (prevalence of about 0.3%) are at a significantly higher risk of experiencing drug-induced bone marrow toxicity. This increased risk is primarily due to the accumulation of unmetabolized drug in their bodies.</p>
      <p>Approximately 5% of all Thiopurine therapies may fail due to drug-induced toxicity. It is worth noting that there is considerable variation in TPMT mutations, and the types of mutations can differ among ethnic groups. This diversity in mutation types contributes to the variability in individual responses to these drugs. Therefore, measuring TPMT activity before starting Thiopurine therapy is important in identifying individuals at risk for toxicity and optimizing treatment outcomes.</p>
    </div>
  `;
}

function buildCysticFibrosisNewbornScreenReportBody(test) {
  const result = findReportParameter(test, ["Immunoreactive Trypsinogen (IRT)", "Result"])
    || (test.parameters || [])[0];
  const resultValue = String(result?.value || "-");
  const numericValue = Number(resultValue.replace(/,/g, ""));
  const hasNumericValue = Number.isFinite(numericValue);
  const isPositive = hasNumericValue && numericValue >= 65;
  const statusLabel = hasNumericValue ? (isPositive ? "Positive" : "Negative") : "";
  const valueClass = hasNumericValue ? (isPositive ? "high-val" : "normal-val") : "";

  return `
    <table class="results-table cystic-fibrosis-newborn-table">
      <thead>
        <tr>
          <th style="width: 43%">Investigation</th>
          <th style="width: 18%">Result</th>
          <th style="width: 27%">Reference Value</th>
          <th style="width: 12%">Unit</th>
        </tr>
      </thead>
      <tbody>
        <tr class="cystic-fibrosis-sample-row">
          <td><strong>Sample Type</strong></td>
          <td>Blood</td>
          <td colspan="2"><strong>TAT :</strong> 1 week (Normal: 1 - 3 weeks)</td>
        </tr>
        <tr>
          <td><strong>CYSTIC FIBROSIS, NEWBORN, SCREEN</strong><div class="cystic-fibrosis-method">DELFIA</div></td>
          <td><span class="${valueClass}"><strong>${escapeHtml(resultValue)}</strong></span></td>
          <td><span class="${valueClass}"><strong>${statusLabel}</strong></span>${statusLabel ? "&nbsp;&nbsp;" : ""}&lt; 65.00</td>
          <td>ng/mL</td>
        </tr>
      </tbody>
    </table>
    <div class="cystic-fibrosis-newborn-notes">
      <div class="report-note-heading">Note:</div>
      <ol>
        <li>Immunoreactive trypsinogen (IRT) levels decrease with age.</li>
        <li>Elevated IRT levels require confirmation through a secondary test, such as sweat chloride or mutation analysis.</li>
        <li>The screening test is conducted using heel prick blood samples.</li>
      </ol>
      <div class="report-note-heading">Comments:</div>
      <p>Cystic fibrosis stands as one of the prevalent autosomal recessive disorders arising from mutations in the Cystic Fibrosis transmembrane conductance regulator (CFTR) gene, particularly prevalent in individuals of Northern European descent. This condition impacts multiple systems, affecting the lungs, digestive tract, and reproductive organs. The disease manifests heterogeneously, ranging from meconium ileus in newborns to severe respiratory issues in infants. Immunoreactive trypsinogen (IRT) serves as a screening tool for identifying newborns at an elevated risk of developing cystic fibrosis. Screening has significantly contributed to improved life expectancy, facilitated by advancements in organ transplantation, enhanced nutrition, and emerging drug therapies. The potential for successful gene therapy continues to be explored.</p>
      <p>Factors Associated with <strong>Increased IRT Levels</strong>: Conditions contributing to elevated IRT levels include cystic fibrosis (particularly Delta F 508 heterozygotes, the most common mutation), hypoxic insult to the pancreas, renal insufficiency, congenital heart disease, spina bifida, viral infections, and chromosomal abnormalities (Trisomy 13, 18 &amp; Galactosemia).</p>
      <p>Factors Affecting Test Results: <strong>False positive results</strong> may occur in cases of transient neonatal hypertrypsinemia, low Apgar scores, among African-American infants, and in healthy carriers.</p>
      <p><strong>False negative results</strong> may occur in the presence of meconium ileus, with the sweat chloride test being the preferred screening method in such cases.</p>
    </div>
  `;
}

function buildKftReportBody(test) {
  const parameters = [
    { name: "Urea", aliases: ["Urea"], method: "Urease UV", unit: "mg/dL", range: "13 - 43" },
    { name: "Creatinine", aliases: ["Creatinine"], method: "Modified Jaffe, Kinetic", unit: "mg/dL", range: "0.7 - 1.3" },
    { name: "Uric Acid", aliases: ["Uric Acid"], method: "Uricase", unit: "mg/dL", range: "3.5 - 7.2" },
    { name: "Calcium, Total", aliases: ["Calcium, Total", "Total Calcium"], method: "Arsenazo III", unit: "mg/dL", range: "8.7 - 10.4" },
    { name: "Phosphorus", aliases: ["Phosphorus", "Phosphate"], method: "Molybdate UV", unit: "mg/dL", range: "2.4 - 5.1" },
    { name: "Alkaline Phosphatase (ALP)", aliases: ["Alkaline Phosphatase (ALP)", "Alkaline Phosphatase"], method: "IFCC", unit: "U/L", range: "30 - 120" },
    { name: "Total Protein", aliases: ["Total Protein"], method: "Biuret", unit: "g/dL", range: "5.7 - 8.2" },
    { name: "Albumin", aliases: ["Albumin"], method: "BCG", unit: "g/dL", range: "3.2 - 4.8" },
    { name: "Sodium", aliases: ["Sodium"], method: "Indirect ISE", unit: "mEq/L", range: "136 - 145" },
    { name: "Potassium", aliases: ["Potassium"], method: "Indirect ISE", unit: "mEq/L", range: "3.5 - 5.1" },
    { name: "Chloride", aliases: ["Chloride"], method: "Indirect ISE", unit: "mEq/L", range: "98 - 107" },
  ];

  const rows = parameters.map((definition) => {
    const result = findReportParameter(test, definition.aliases) || {};
    const value = result.value || "-";
    const range = result.normal_range || definition.range;
    const unit = result.unit || definition.unit;
    const { isAbnormal, colorClass } = checkResultRange(value, range);
    const statusLabel = isAbnormal ? (colorClass === "high-val" ? "High" : "Low") : "";
    return `
      <tr>
        <td><strong>${escapeHtml(definition.name)}</strong><div class="kft-method">${escapeHtml(definition.method)}</div></td>
        <td><span class="${colorClass}">${escapeHtml(value)}</span>${statusLabel ? ` <span class="kft-status ${colorClass}">${statusLabel}</span>` : ""}</td>
        <td>${escapeHtml(range)}</td>
        <td>${escapeHtml(unit)}</td>
      </tr>
    `;
  }).join("");

  return `
    <table class="results-table kft-table">
      <thead>
        <tr>
          <th style="width: 34%">Investigation</th>
          <th style="width: 27%">Result</th>
          <th style="width: 25%">Reference Value</th>
          <th style="width: 14%">Unit</th>
        </tr>
      </thead>
      <tbody>
        <tr class="kft-sample-row"><td>Primary Sample Type :</td><td colspan="3">${escapeHtml(test.sample_type || "Serum")}</td></tr>
        ${rows}
      </tbody>
    </table>
    <div class="kft-advice"><strong>ADVICE: CKD RISK MAP</strong><p>KDIGO guideline, 2012 recommends Chronic Kidney disease (CKD) should be classified based on cause, GFR category and albuminuria (ACR) category. GFR &amp; ACR category combined together reflect risk of progression and helps clinician to identify individuals who are progressing at more rapid rate than anticipated.</p></div>
  `;
}

function buildFactorIiReportBody(test) {
  const result = findReportParameter(test, ["FACTOR II, FUNCTIONAL", "Result"])
    || (test.parameters || [])[0];
  const value = result?.value || "-";
  const normalRange = result?.normal_range || "70.00 - 120.00";
  const unit = result?.unit || "%";
  const status = getCbcStatus(value, normalRange);
  const statusText = status ? ` <span class="factor-ii-status ${status.className}">${status.label}</span>` : "";

  return `
    <table class="results-table factor-ii-table">
      <thead>
        <tr>
          <th style="width: 42%">Investigation</th>
          <th style="width: 25%">Result</th>
          <th style="width: 23%">Reference Value</th>
          <th style="width: 10%">Unit</th>
        </tr>
      </thead>
      <tbody>
        <tr class="factor-ii-sample-row">
          <td><strong>Sample Type</strong></td>
          <td>Blood, Plasma (3 ml)</td>
          <td colspan="2"><strong>TAT:</strong> 8 hrs (Normal: 1 - 3 days)</td>
        </tr>
        <tr>
          <td><strong>FACTOR II, FUNCTIONAL</strong><div class="factor-ii-method">Photo Optical Clot Detection</div></td>
          <td><span class="${status?.className || ""}">${escapeHtml(value)}</span>${statusText}</td>
          <td>${escapeHtml(normalRange)}</td>
          <td>${escapeHtml(unit)}</td>
        </tr>
      </tbody>
    </table>
    <div class="factor-ii-notes">
      <div class="report-note-heading">Interpretation:</div>
      <ul>
        <li><strong>Normal Range:</strong> Factor II activity is usually expressed as a percentage, with 100% being considered normal. However, reference ranges can vary among laboratories.</li>
        <li><strong>Low Levels:</strong> Low levels of Factor II may be associated with conditions such as vitamin K deficiency, liver disease, or certain genetic disorders. In severe cases, it can lead to bleeding disorders.</li>
        <li><strong>High Levels:</strong> Elevated Factor II levels may be associated with an increased risk of thrombosis (blood clot formation). This can contribute to conditions such as deep vein thrombosis (DVT), pulmonary embolism (PE), or other clotting disorders.</li>
      </ul>
      <div class="report-note-heading">Comments:</div>
      <p>Factor II, also known as Prothrombin, deficiency is a rare inherited autosomal recessive disorder. A genuine prothrombin deficiency, also called hypoprothrombinemia (Type 1 deficiency), is characterized by a simultaneous reduction in prothrombin activity and antigen levels, resulting in symptoms like mucosal bleeding, hematomas, and hemarthrosis. Dysprothrombinemia (Type II deficiency) is marked by reduced activity but normal antigen levels, often leading to mild bleeding or presenting asymptomatically. Factor II deficiency can be inherited alongside other factor deficiencies or acquired later in life due to conditions like liver disease, vitamin K deficiency, and the use of oral anticoagulant therapy. Acquired factor II deficiency is more common than the inherited form.</p>
    </div>
  `;
}

function buildKaryotypeReportBody(test) {
  const result = findReportParameter(test, ["Karyotype Result", "Result"])
    || (test.parameters || [])[0];
  const resultValue = String(result?.value || "").trim();
  const resultBlock = resultValue
    ? `<div class="karyotype-result"><strong>Karyotype Result:</strong> ${escapeHtml(resultValue)}</div>`
    : "";

  return `
    <div class="karyotype-notes">
      <div class="report-note-heading">Test Overview :</div>
      <p>Karyotype is a test to identify and evaluate the size, shape, and number of chromosomes in a sample of body cells. Extra, missing, or abnormal positions of chromosome pieces can cause problems with a person's growth, development, and body functions.</p>
      <div class="report-note-heading">How to Prepare :</div>
      <p>No special preparation is required for this test. A genetic counselor or a specialized doctor can help you make well-informed decisions. Ask to have genetic counselling before making a decision about a genetic test.</p>
      <div class="report-note-heading">How It Is Done :</div>
      <p>Karyotype testing can be done using almost any cell or tissue from the body. A karyotype test usually is done on a blood sample taken from a vein.</p>
      ${resultBlock}
      <table class="karyotype-comparison-table">
        <thead><tr><th colspan="2">Karyotype</th></tr></thead>
        <tbody>
          <tr><th>Normal</th><td><ul><li>There are 46 chromosomes that can be grouped as 22 matching pairs and 1 pair of sex chromosomes (XX for a female and XY for a male).</li><li>The size, shape, and structure are normal for each chromosome.</li></ul></td></tr>
          <tr><th>Abnormal</th><td><ul><li>There are more than or less than 46 chromosomes.</li><li>The shape or size of one or more chromosomes is abnormal.</li><li>A chromosome pair may be broken or incorrectly separated.</li></ul></td></tr>
        </tbody>
      </table>
      <div class="report-note-heading">What Affects the Test ?</div>
      <ul>
        <li>Factors that can interfere with your test or the accuracy of the results include:</li>
        <li>Being treated for cancer. Chromosomes may be damaged by some types of cancer treatment.</li>
        <li>The area where the cells are collected. The results of a karyotype test may depend on whether the cells were collected from the amniotic fluid, the fetus, or the placenta.</li>
      </ul>
    </div>
  `;
}

function buildLipidProfileReportBody(test) {
  const parameters = [
    { name: "Cholesterol Total", aliases: ["Total Cholesterol", "Cholesterol Total"], type: "total", method: "Spectrophotometry", range: "< 200.00", unit: "mg/dL" },
    { name: "Triglycerides", aliases: ["Triglycerides"], type: "triglycerides", method: "Spectrophotometry", range: "< 150.00", unit: "mg/dL" },
    { name: "HDL Cholesterol", aliases: ["HDL Cholesterol"], type: "hdl", method: "Calculated", range: "> 40.00", unit: "mg/dL" },
    { name: "LDL Cholesterol", aliases: ["LDL Cholesterol"], type: "ldl", method: "Calculated", range: "< 100.00", unit: "mg/dL" },
    { name: "VLDL Cholesterol", aliases: ["VLDL Cholesterol"], type: "vldl", method: "Calculated", range: "< 30.00", unit: "mg/dL" },
    { name: "Non-HDL Cholesterol", aliases: ["Non-HDL Cholesterol", "Non HDL Cholesterol"], type: "nonHdl", method: "Calculated", range: "< 130.00", unit: "mg/dL" },
  ];

  const rows = parameters.map((definition) => {
    const result = findReportParameter(test, definition.aliases) || {};
    const value = result.value || "-";
    const range = result.normal_range || definition.range;
    const unit = result.unit || definition.unit;
    const status = getLipidStatus(definition.type, value);
    return `
      <tr>
        <td><strong>${escapeHtml(definition.name)}</strong><div class="lipid-method">${escapeHtml(definition.method)}</div></td>
        <td><span class="${status?.className || ""}">${escapeHtml(value)}</span>${status ? ` <span class="lipid-status ${status.className}">${status.label}</span>` : ""}</td>
        <td>${escapeHtml(range)}</td>
        <td>${escapeHtml(unit)}</td>
      </tr>
    `;
  }).join("");

  return `
    <table class="results-table lipid-profile-table">
      <thead>
        <tr>
          <th style="width: 34%">Investigation</th>
          <th style="width: 27%">Result</th>
          <th style="width: 25%">Reference Value</th>
          <th style="width: 14%">Unit</th>
        </tr>
      </thead>
      <tbody>
        <tr class="lipid-sample-row"><td><strong>Sample Type</strong></td><td>Serum (2 ml)</td><td colspan="2"><strong>TAT :</strong> 1 day (Normal: 1 - 3 days)</td></tr>
        ${rows}
      </tbody>
    </table>
    <table class="lipid-recommendation-table">
      <thead>
        <tr><th>NLA - 2014<br />RECOMMENDATIONS</th><th>Total Cholesterol<br />(mg/dL)</th><th>HDL Cholesterol<br />(mg/dL)</th><th>LDL Cholesterol<br />(mg/dL)</th><th>Triglycerides<br />(mg/dL)</th></tr>
      </thead>
      <tbody>
        <tr><td>Desirable</td><td>&lt; 200</td><td>&gt; 40</td><td>&lt; 100</td><td>&lt; 150</td></tr>
        <tr><td>Above Desirable</td><td></td><td></td><td>100 - 129</td><td></td></tr>
        <tr><td>Borderline High</td><td>200 - 239</td><td></td><td>130 - 159</td><td>150 - 199</td></tr>
        <tr><td>High</td><td>&ge; 240</td><td></td><td>160 - 189</td><td>200 - 499</td></tr>
        <tr><td>Very High</td><td></td><td></td><td>&ge; 190</td><td>&ge; 500</td></tr>
      </tbody>
    </table>
    <div class="lipid-notes">
      <div class="report-note-heading">Note :</div>
      <ol>
        <li>Measurements in the same patient can show physiological &amp; analytical variations. Three serial samples 1 week apart are recommended for Total Cholesterol, Triglycerides, HDL &amp; LDL Cholesterol.</li>
        <li>As per NLA-2014 guidelines, all adults above the age of 20 years should be screened for lipid status. Selective screening of children above the age of 2 years with a family history of premature cardiovascular disease or those with at least one parent with high total cholesterol is recommended.</li>
      </ol>
    </div>
  `;
}

function buildLftReportBody(test) {
  const parameters = [
    { name: "AST (SGOT)", aliases: ["AST (SGOT)", "SGOT / AST"], method: "IFCC without P5P", range: "15.00 - 40.00", unit: "U/L" },
    { name: "ALT (SGPT)", aliases: ["ALT (SGPT)", "SGPT / ALT"], method: "IFCC without P5P", range: "10.00 - 49.00", unit: "U/L" },
    { name: "AST : ALT Ratio", aliases: ["AST : ALT Ratio", "AST:ALT Ratio", "AST ALT Ratio"], method: "Calculated", range: "< 1.00", unit: "" },
    { name: "GGTP", aliases: ["GGTP", "GGT", "Gamma Glutamyl Transferase"], method: "IFCC", range: "0.00 - 73.00", unit: "U/L" },
    { name: "Alkaline Phosphatase (ALP)", aliases: ["Alkaline Phosphatase (ALP)", "ALP (Alkaline Phosphatase)", "Alkaline Phosphatase"], method: "IFCC-AMP", range: "30.00 - 120.00", unit: "U/L" },
    { name: "Bilirubin Total", aliases: ["Bilirubin Total", "Total Bilirubin"], method: "DPD", range: "0.30 - 1.20", unit: "mg/dL" },
    { name: "Bilirubin Direct", aliases: ["Bilirubin Direct", "Direct Bilirubin"], method: "DPD", range: "< 0.30", unit: "mg/dL" },
    { name: "Bilirubin Indirect", aliases: ["Bilirubin Indirect", "Indirect Bilirubin"], method: "Calculated", range: "< 1.10", unit: "mg/dL" },
    { name: "Total Protein", aliases: ["Total Protein"], method: "Biuret", range: "5.70 - 8.20", unit: "g/dL" },
    { name: "Albumin", aliases: ["Albumin"], method: "BCG", range: "3.20 - 4.80", unit: "g/dL" },
    { name: "Globulin", aliases: ["Globulin"], method: "Calculated", range: "2.00 - 3.50", unit: "g/dL" },
    { name: "A : G Ratio", aliases: ["A : G Ratio", "A G Ratio", "A:G Ratio"], method: "Calculated", range: "0.90 - 2.00", unit: "" },
  ];

  const rows = parameters.map((definition) => {
    const result = findReportParameter(test, definition.aliases) || {};
    const value = result.value || "-";
    const range = result.normal_range || definition.range;
    const unit = result.unit || definition.unit;
    const status = getReferenceStatus(value, range);
    return `
      <tr>
        <td><strong>${escapeHtml(definition.name)}</strong><div class="lft-method">${escapeHtml(definition.method)}</div></td>
        <td><span class="${status?.className || ""}">${escapeHtml(value)}</span>${status ? ` <span class="lft-status ${status.className}">${status.label}</span>` : ""}</td>
        <td>${escapeHtml(range)}</td>
        <td>${escapeHtml(unit)}</td>
      </tr>
    `;
  }).join("");

  return `
    <table class="results-table lft-table">
      <thead>
        <tr>
          <th style="width: 34%">Investigation</th>
          <th style="width: 27%">Result</th>
          <th style="width: 25%">Reference Value</th>
          <th style="width: 14%">Unit</th>
        </tr>
      </thead>
      <tbody>
        <tr class="lft-sample-row"><td><strong>Sample Type</strong></td><td>Serum (2 ml)</td><td colspan="2"><strong>TAT :</strong> 1 day (Normal: 1 - 3 days)</td></tr>
        ${rows}
      </tbody>
    </table>
    <div class="lft-notes">
      <div class="report-note-heading">Note :</div>
      <ol>
        <li>In an asymptomatic patient, Non alcoholic fatty liver disease (NAFLD) is the most common cause of increased AST, ALT levels. NAFLD is considered as hepatic manifestation of metabolic syndrome.</li>
        <li>In most type of liver disease, ALT activity is higher than that of AST; exception may be seen in Alcoholic Hepatitis, Hepatic Cirrhosis, and Liver neoplasia. In a patient with Chronic liver disease, AST:ALT ratio &gt; 1 is highly suggestive of advanced liver fibrosis.</li>
      </ol>
    </div>
  `;
}

function buildHba1cReportBody(test) {
  const result = findReportParameter(test, [
    "Glycosylated Hemoglobin, HbA1c",
    "Glycosylated Haemoglobin, HbA1c",
    "Glycated Hemoglobin, HbA1c",
    "HbA1c",
    "Result",
  ]) || {};
  const value = result.value || "-";
  const status = getHba1cStatus(value);
  const range = result.normal_range || "< 5.70";
  const unit = result.unit || "%";

  return `
    <table class="results-table hba1c-table">
      <thead>
        <tr>
          <th style="width: 35%">Investigation</th>
          <th style="width: 26%">Result</th>
          <th style="width: 25%">Reference Value</th>
          <th style="width: 14%">Unit</th>
        </tr>
      </thead>
      <tbody>
        <tr class="hba1c-sample-row"><td><strong>Sample Type</strong></td><td>Blood (2 ml)</td><td colspan="2"><strong>TAT :</strong> 1 day (Normal: 1 - 3 days)</td></tr>
        <tr>
          <td><strong>GLYCOSYLATED HEMOGLOBIN, HbA1c</strong><div class="hba1c-method">HPLC, NGSP certified</div></td>
          <td><span class="${status?.className || ""}">${escapeHtml(value)}</span>${status ? ` <span class="hba1c-status ${status.className}">${status.label}</span>` : ""}</td>
          <td>${escapeHtml(range)}</td>
          <td>${escapeHtml(unit)}</td>
        </tr>
      </tbody>
    </table>
    <div class="hba1c-interpretation-heading">Interpretation :</div>
    <table class="hba1c-interpretation-table">
      <thead>
        <tr><th colspan="2" class="hba1c-interpretation-title">As per American Diabetes Association (ADA)</th></tr>
      </thead>
      <tbody>
        <tr><td>Reference Group</td><td>HbA1c in %</td></tr>
        <tr><td>Non diabetic adults &gt;=18 years</td><td><strong>&lt;5.7</strong></td></tr>
        <tr><td>At risk (Prediabetes)</td><td><strong>5.7 - 6.4</strong></td></tr>
        <tr><td>Diabetes</td><td><strong>&gt;= 6.5</strong></td></tr>
        <tr>
          <td>Therapeutic goals for glycemic control</td>
          <td><strong>Age &gt; 19 years</strong><br />&bull; Goal of therapy: &lt; 7.0<br />&bull; Action suggested: &gt; 8.0<br /><strong>Age &lt; 19 years</strong><br />&bull; Goal of therapy: &lt;7.5</td>
        </tr>
      </tbody>
    </table>
    <div class="hba1c-notes">
      <div class="report-note-heading">Note:</div>
      <ol>
        <li>Since HbA1c reflects long term fluctuations in the blood glucose concentration, a diabetic patient who is recently under good control may still have a high concentration of HbA1c. Converse is true for a diabetic previously under good control but now poorly controlled.</li>
        <li>Target goals of &lt; 7.0 % may be beneficial in patients with short duration of diabetes, long life expectancy and no significant cardiovascular disease. In patients with significant complications of diabetes, limited life expectancy or extensive co-morbid conditions, targeting a goal of &lt; 7.0 % may not be appropriate.</li>
      </ol>
    </div>
  `;
}

function buildSingleAnalyteResultTable(test, {
  tableClass,
  investigation,
  aliases,
  method,
  defaultRange,
  defaultUnit,
  statusForValue = getReferenceStatus,
}) {
  const result = findReportParameter(test, aliases) || {};
  const value = result.value || "-";
  const range = result.normal_range && result.normal_range !== "N/A" ? result.normal_range : defaultRange;
  const unit = result.unit && result.unit !== "N/A" ? result.unit : defaultUnit;
  const status = statusForValue(value, range);

  return `
    <table class="results-table ${tableClass}">
      <thead>
        <tr>
          <th style="width: 34%">Investigation</th>
          <th style="width: 27%">Result</th>
          <th style="width: 25%">Reference Value</th>
          <th style="width: 14%">Unit</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><strong>${escapeHtml(investigation)}</strong>${method ? `<div class="single-analyte-method">${escapeHtml(method)}</div>` : ""}</td>
          <td><span class="${status?.className || ""}">${escapeHtml(value)}</span>${status ? ` <span class="single-analyte-status ${status.className}">${status.label}</span>` : ""}</td>
          <td>${escapeHtml(range)}</td>
          <td>${escapeHtml(unit)}</td>
        </tr>
      </tbody>
    </table>
  `;
}

function buildDrlogyStyleAnalyteResultTable(test, {
  tableClass,
  investigation,
  aliases,
  method,
  defaultRange,
  defaultUnit,
  sampleLabel = "Sample Type",
  sampleType,
  turnaroundText = "1 hr (Normal: 1 - 4 hrs)",
  statusForValue = getReferenceStatus,
}) {
  const result = findReportParameter(test, aliases) || {};
  const value = result.value || "-";
  const range = result.normal_range && result.normal_range !== "N/A" ? result.normal_range : defaultRange;
  const unit = result.unit && result.unit !== "N/A" ? result.unit : defaultUnit;
  const status = statusForValue(value, range);
  const resolvedSampleType = sampleType || test.sample_type || "Serum";

  return `
    <table class="results-table ${tableClass}">
      <thead>
        <tr>
          <th style="width: 34%">Investigation</th>
          <th style="width: 27%">Result</th>
          <th style="width: 25%">Reference Value</th>
          <th style="width: 14%">Unit</th>
        </tr>
      </thead>
      <tbody>
        <tr class="single-analyte-sample-row">
          <td><strong>${escapeHtml(sampleLabel)}</strong></td>
          <td>${escapeHtml(resolvedSampleType)}</td>
          <td colspan="2">${turnaroundText ? `<strong>TAT :</strong> ${escapeHtml(turnaroundText)}` : ""}</td>
        </tr>
        <tr>
          <td><strong>${escapeHtml(investigation)}</strong>${method ? `<div class="single-analyte-method">${escapeHtml(method)}</div>` : ""}</td>
          <td><span class="${status?.className || ""}">${escapeHtml(value)}</span>${status ? ` <span class="single-analyte-status ${status.className}">${status.label}</span>` : ""}</td>
          <td>${escapeHtml(range)}</td>
          <td>${escapeHtml(unit)}</td>
        </tr>
      </tbody>
    </table>
  `;
}

function buildVitaminDReportBody(test) {
  return `
    ${buildSingleAnalyteResultTable(test, {
      tableClass: "single-analyte-table vitamin-d-table",
      investigation: "VITAMIN D, 25 - HYDROXY, SERUM",
      aliases: ["Vitamin D, 25 - Hydroxy, Serum", "25-OH Vitamin D", "Vitamin D Total - 25 OH", "Result"],
      method: "CLIA",
      defaultRange: "75.00 - 250.00",
      defaultUnit: "nmol/L",
    })}
    <div class="single-analyte-heading">Interpretation :</div>
    <table class="vitamin-d-interpretation-table">
      <thead><tr><th>Level</th><th>Reference Range</th><th>Comments</th></tr></thead>
      <tbody>
        <tr><td>Deficient</td><td>&lt; 50 nmol/L</td><td>High risk for developing bone disease</td></tr>
        <tr><td>Insufficient</td><td>50 - 74 nmol/L</td><td>Vitamin D concentration which normalizes Parathyroid hormone concentration</td></tr>
        <tr><td>Sufficient</td><td>75 - 250 nmol/L</td><td>Optimal concentration for maximal health benefit</td></tr>
        <tr><td>Potential intoxication</td><td>&gt; 250 nmol/L</td><td>High risk for toxic effects</td></tr>
      </tbody>
    </table>
    <div class="single-analyte-notes vitamin-d-notes">
      <div class="report-note-heading">Note :</div>
      <ul>
        <li>25 (OH)D is influenced by sunlight, latitude, skin pigmentation, sunscreen use, and hepatic function.</li>
        <li>Optimal calcium absorption requires vitamin D 25 (OH) levels exceeding 75 nmol/L.</li>
        <li>It shows seasonal variation, with values being 40-50% lower in winter than in summer.</li>
      </ul>
      <div class="report-note-heading">Comments :</div>
      <p>Vitamin D promotes the absorption of calcium and phosphorus and the mineralization of bones and teeth. Deficiency in children causes Rickets and in adults leads to Osteomalacia. It can also lead to Hypocalcemia and Tetany. Vitamin D status is best determined by measurement of 25 hydroxy vitamin D, as it is the major circulating form and has a longer half-life (2-3 weeks) than 1,25 Dihydroxy vitamin D (5-8 hrs).</p>
      <div class="report-note-heading">Decreased Levels :</div>
      <ul><li>Inadequate exposure to sunlight</li><li>Dietary deficiency &amp; Vitamin D malabsorption</li><li>Severe Hepatocellular disease</li><li>Drugs like Anticonvulsants</li><li>Nephrotic syndrome</li></ul>
      <div class="report-note-heading">Increased levels :</div>
      <ul><li>Vitamin D intoxication</li></ul>
    </div>
  `;
}

function buildVitaminCReportBody(test) {
  return `
    ${buildSingleAnalyteResultTable(test, {
      tableClass: "single-analyte-table vitamin-c-table",
      investigation: "VITAMIN C, SERUM",
      aliases: ["Vitamin C, Serum", "Vitamin C", "Ascorbic Acid", "Result"],
      method: "",
      defaultRange: "0.40 - 2.00",
      defaultUnit: "mg/dL",
    })}
    <div class="single-analyte-notes vitamin-c-notes">
      <div class="report-note-heading">Comments :</div>
      <p>The Vitamin C test provides valuable insights into nutritional status and potential deficiencies. With its ability to evaluate the adequacy of vitamin C intake, this test aids in promoting overall health and wellness.</p>
      <div class="report-note-heading">Deficiency or Low Levels:</div>
      <p>Indicates potential vitamin C deficiency. Further evaluation may be needed.</p>
      <div class="report-note-heading">Excess or High Levels:</div>
      <p>Suggests excess intake or supplementation of vitamin C. Adjustments may be required.</p>
    </div>
  `;
}

function buildVitaminB12ReportBody(test) {
  return `
    ${buildSingleAnalyteResultTable(test, {
      tableClass: "single-analyte-table vitamin-b12-table",
      investigation: "VITAMIN B12, SERUM",
      aliases: ["Vitamin B12, Serum", "Vitamin B12", "Serum Vitamin B12", "Result"],
      method: "CLIA",
      defaultRange: "200.00 - 900.00",
      defaultUnit: "pg/mL",
    })}
    <div class="single-analyte-notes vitamin-b12-notes">
      <div class="report-note-heading">Notes :</div>
      <ol>
        <li>Interpretation of the result should be considered in relation to clinical circumstances.</li>
        <li>It is recommended to consider supplementary testing with plasma Methylmalonic acid (MMA) or plasma homocysteine levels to determine biochemical cobalamin deficiency in presence of clinical suspicion of deficiency but indeterminate levels. Homocysteine levels are more sensitive but MMA is more specific.</li>
        <li>False increase in Vitamin B12 levels may be observed in patients with intrinsic factor blocking antibodies; MMA measurement should be considered in such patients.</li>
        <li>The concentration of Vitamin B12 obtained with different assay methods cannot be used interchangeably due to differences in assay methods and reagent specificity.</li>
      </ol>
    </div>
  `;
}

function buildRandomBloodSugarReportBody(test) {
  return `
    ${buildSingleAnalyteResultTable(test, {
      tableClass: "single-analyte-table glucose-table",
      investigation: "GLUCOSE, RANDOM, PLASMA",
      aliases: ["Glucose, Random, Plasma", "Random Glucose", "Glucose", "Result"],
      method: "Hexokinase",
      defaultRange: "70.00 - 140.00",
      defaultUnit: "mg/dL",
      statusForValue: value => getGlucoseStatus(value, 140),
    })}
    <div class="single-analyte-notes glucose-notes">
      <div class="report-note-heading">Interpretation</div>
      <p>The laboratory reference interval for random plasma glucose in this report is 70-140 mg/dL. Results above the interval require clinical correlation. A random plasma glucose result alone does not diagnose prediabetes. In a person with classic hyperglycemic symptoms or hyperglycemic crisis, a random plasma glucose of 200 mg/dL or more meets an ADA diagnostic criterion; otherwise, abnormal results require confirmatory testing.</p>
    </div>
  `;
}

function buildFastingBloodSugarReportBody(test) {
  return `
    ${buildDrlogyStyleAnalyteResultTable(test, {
      tableClass: "single-analyte-table glucose-table fasting-plasma-glucose-table",
      investigation: "GLUCOSE, FASTING, PLASMA",
      aliases: ["Glucose, Fasting, Plasma", "Fasting Glucose", "Glucose", "Result"],
      method: "Hexokinase",
      defaultRange: "70.00 - 100.00",
      defaultUnit: "mg/dL",
      sampleType: "Plasma (2 ml)",
      statusForValue: getFastingPlasmaGlucoseStatus,
    })}
    <div class="single-analyte-notes glucose-notes">
      <div class="report-note-heading">Interpretation</div>
      <table class="fasting-glucose-interpretation-table">
        <thead><tr><th>RESULT (mg/dL)</th><th>REMARK</th></tr></thead>
        <tbody>
          <tr><td>70.00 - 99.00</td><td>Normal</td></tr>
          <tr><td>100.00 - 126.00</td><td>Prediabetes / increased risk of diabetes</td></tr>
          <tr><td>Over 126.00</td><td>Diabetes</td></tr>
          <tr><td>Under 55.00</td><td>Hypoglycemia / dangerously low</td></tr>
        </tbody>
      </table>
      <ul>
        <li><strong>Normal range:</strong> Fasting plasma glucose is generally considered normal below 100 mg/dL.</li>
        <li><strong>Impaired fasting glucose:</strong> Results from 100 to 125 mg/dL may indicate impaired fasting glucose and increased future diabetes risk.</li>
        <li><strong>Diabetes:</strong> A fasting plasma glucose of 126 mg/dL or more on two separate occasions is consistent with diabetes.</li>
        <li><strong>Clinical context:</strong> Results should be interpreted by a healthcare professional alongside the patient's clinical condition, history, and risk factors.</li>
        <li><strong>Monitoring:</strong> Repeat testing, HbA1c, or an oral glucose tolerance test may be appropriate when clinically indicated.</li>
      </ul>
      <div class="report-note-heading">Comments :</div>
      <p>Borderline or high results may need repeat testing or further investigation such as HbA1c or an oral glucose tolerance test. Fasting duration, timing of sample collection, medicines, illness, exercise, and handling delays can influence glucose results.</p>
    </div>
  `;
}

function buildBTypeNatriureticPeptideReportBody(test) {
  return `
    ${buildDrlogyStyleAnalyteResultTable(test, {
      tableClass: "single-analyte-table bnp-table",
      investigation: "BNP (B-TYPE NATRIURETIC PEPTIDE)",
      aliases: ["BNP (B-Type Natriuretic Peptide)", "B-Type Natriuretic Peptide (BNP)", "BNP", "Result"],
      method: "CLIA",
      defaultRange: "< 29.40",
      defaultUnit: "pg/mL",
      sampleType: "Plasma (2 ml)",
    })}
    <div class="single-analyte-notes bnp-notes">
      <div class="report-note-heading">Note :</div>
      <ol>
        <li>This test should be used in conjunction with medical history, clinical evaluation, and other diagnostic procedures.</li>
        <li>Several clinical factors affect BNP concentration, including age, sex, BMI, and renal function.</li>
        <li>A decision threshold of 100 pg/mL is often used when evaluating heart failure; results require clinical correlation.</li>
      </ol>
      <div class="report-note-heading">Interpretation :</div>
      <p>BNP concentration in patients with heart failure.</p>
      <table class="bnp-interpretation-table">
        <thead><tr><th>NYHA CLASSES</th><th>5TH - 95TH PERCENTILE</th><th>&gt; 100 pg/mL (%)</th></tr></thead>
        <tbody>
          <tr><td>I</td><td>&lt; 2 - 772</td><td>43.1</td></tr>
          <tr><td>II</td><td>5.4 - 999</td><td>58.7</td></tr>
          <tr><td>III</td><td>21.1 - 1696</td><td>82.0</td></tr>
          <tr><td>IV</td><td>109 - 3157</td><td>95.8</td></tr>
          <tr><td>ALL</td><td>10.8 - 1873</td><td>72.6</td></tr>
        </tbody>
      </table>
      <div class="report-note-heading">Comments:</div>
      <p>B-type natriuretic peptide (BNP) is released mainly from the ventricular myocardium. Elevated levels can occur with volume or pressure overload and are associated with a higher risk of cardiac events in heart failure; interpret the result with symptoms and clinical findings.</p>
      <div class="report-note-heading">High Levels:</div>
      <ul>
        <li><strong>Cardiac causes:</strong> heart failure, asymptomatic left ventricular dysfunction, arterial or pulmonary hypertension, cardiac hypertrophy, valvular heart disease, arrhythmia, or acute coronary syndrome.</li>
        <li><strong>Non-cardiac causes:</strong> acute or chronic renal failure, liver cirrhosis, hyperaldosteronism, or Cushing syndrome.</li>
      </ul>
      <div class="report-note-heading">Clinical Use:</div>
      <ul><li>Helps support assessment of heart failure in patients with unclear clinical symptoms.</li></ul>
    </div>
  `;
}

function buildCreatineKinaseReportBody(test) {
  return `
    ${buildSingleAnalyteResultTable(test, {
      tableClass: "single-analyte-table creatine-kinase-table",
      investigation: "CK, SERUM",
      aliases: ["CK, Serum", "Creatine Kinase (Total CK)", "Creatine Kinase", "Total CK", "CK", "Result"],
      method: "Agarose Gel Electrophoresis",
      defaultRange: "< 171.00",
      defaultUnit: "U/L",
    })}
    <div class="single-analyte-notes creatine-kinase-notes">
      <div class="report-note-heading">Note :</div>
      <ol>
        <li>CK activity in normal individuals is mainly due to CK-MM, while contributions from other CK isoenzymes are negligible.</li>
        <li>CK isoenzyme fractions are reported as a percentage of total CK.</li>
      </ol>
      <div class="report-note-heading">Comments :</div>
      <p>Creatine kinase (CK) activity is found in skeletal muscle, myocardium, and brain as the isoenzymes MM (CK3), MB (CK2), and BB (CK1), respectively. In a normal heart, about 15-20% of CK is CK-MB, with a higher percentage in the right heart than in the left heart. This assay helps indicate the source of raised CK levels.</p>
    </div>
  `;
}

function buildBeta2MicroglobulinReportBody(test) {
  return `
    ${buildDrlogyStyleAnalyteResultTable(test, {
      tableClass: "single-analyte-table beta2-microglobulin-table",
      investigation: "BETA 2 MICROGLOBULIN",
      aliases: ["Beta 2 Microglobulin", "Beta-2 Microglobulin", "β2 Microglobulin", "B2M", "Result"],
      method: "CLIA",
      defaultRange: "609.00 - 2366.00",
      defaultUnit: "ng/mL",
      sampleType: "Serum (2 ml)",
      turnaroundText: "1 day (Normal: 1 - 3 days)",
      statusForValue: getBeta2MicroglobulinStatus,
    })}
    <div class="single-analyte-notes beta2-microglobulin-notes">
      <div class="report-note-heading">Note:</div>
      <ol>
        <li>False-negative or false-positive results may occur in patients undergoing diagnosis or therapy with mouse monoclonal antibodies.</li>
        <li>Beta 2 microglobulin values, regardless of their level, should not be considered absolute evidence of the presence or absence of disease. Correlate all values with clinical findings and other investigations.</li>
      </ol>
      <div class="report-note-heading">Comments:</div>
      <p>As per the International Staging System for multiple myeloma, the level of beta 2 microglobulin can be used for staging the disease:</p>
      <table class="beta2-microglobulin-staging-table">
        <thead><tr><th>Stage</th><th>Beta 2 microglobulin level (ng/mL)</th></tr></thead>
        <tbody>
          <tr><td>Stage I</td><td>&lt; 3500</td></tr>
          <tr><td>Stage II</td><td>3500 - 5500</td></tr>
          <tr><td>Stage III</td><td>&gt; 5500</td></tr>
        </tbody>
      </table>
      <div class="report-note-heading">High Levels:</div>
      <ul>
        <li>Lymphoproliferative disorders such as multiple myeloma, B-cell lymphoma, and chronic lymphocytic leukemia.</li>
        <li>Inflammatory disorders, including rheumatoid arthritis, systemic lupus erythematosus (SLE), Sjögren syndrome, and Crohn disease.</li>
        <li>Renal dysfunction.</li>
      </ul>
      <div class="report-note-heading">Uses:</div>
      <ul>
        <li>Prognostic indicator for multiple myeloma and other hematopoietic malignancies.</li>
        <li>Supportive tool in management of patients with renal dysfunction and rheumatoid arthritis.</li>
        <li>Contribution to staging of multiple myeloma.</li>
      </ul>
    </div>
  `;
}

function buildAltSgptReportBody(test) {
  return `
    ${buildSingleAnalyteResultTable(test, {
      tableClass: "single-analyte-table alt-sgpt-table",
      investigation: "ALT (SGPT), SERUM",
      aliases: ["ALT (SGPT), Serum", "SGPT / ALT", "ALT (SGPT)", "ALT", "SGPT", "Result"],
      method: "IFCC without P5P",
      defaultRange: "10.00 - 49.00",
      defaultUnit: "U/L",
    })}
    <div class="single-analyte-notes alt-sgpt-notes">
      <div class="report-note-heading">Note:</div>
      <p>Alanine aminotransferase (ALT), also called glutamate pyruvate transaminase (GPT), is an enzyme made mainly by liver cells. The liver stores vitamins and iron, clears toxins from the blood, produces proteins, and makes bile that aids digestion.</p>
    </div>
  `;
}

function buildDnphReportBody(test) {
  return buildSingleAnalyteResultTable(test, {
    tableClass: "single-analyte-table dnph-table",
    investigation: "DNPH, URINE",
    aliases: ["DNPH, Urine", "DNPH", "Dinitrophenylhydrazine", "Result"],
    method: "Chemical",
    defaultRange: "",
    defaultUnit: "",
  });
}

function buildPrealbuminReportBody(test) {
  return `
    ${buildSingleAnalyteResultTable(test, {
      tableClass: "single-analyte-table prealbumin-table",
      investigation: "PREALBUMIN, SERUM",
      aliases: ["Prealbumin, Serum", "Prealbumin", "Transthyretin", "Result"],
      method: "Turbidimetric Immunoassay",
      defaultRange: "16.00 - 30.00",
      defaultUnit: "mg/dL",
    })}
    <div class="single-analyte-notes prealbumin-notes">
      <div class="report-note-heading">Clinical Use :</div>
      <p>The prealbumin blood test helps assess whether a patient is receiving sufficient nutrients, particularly protein. Prealbumin is a protein made by the liver that is used in the formation of other proteins.</p>
      <div class="report-note-heading">Low levels caused by:</div>
      <ul>
        <li>Malnutrition or insufficient dietary zinc.</li>
        <li>Liver disease.</li>
        <li>Cancer or chronic illness.</li>
        <li>Inflammation or infection.</li>
        <li>Digestive disorders.</li>
        <li>Hyperthyroidism.</li>
      </ul>
      <div class="report-note-heading">High levels caused by:</div>
      <ul>
        <li>Pregnancy.</li>
        <li>Kidney problems.</li>
        <li>Hodgkin disease.</li>
        <li>Iron deficiency.</li>
        <li>Hyperactive adrenal glands.</li>
        <li>Steroid use.</li>
        <li>Alcohol use.</li>
      </ul>
    </div>
  `;
}

function buildHaptoglobinReportBody(test) {
  return `
    ${buildSingleAnalyteResultTable(test, {
      tableClass: "single-analyte-table haptoglobin-table",
      investigation: "HAPTOGLOBIN, SERUM",
      aliases: ["Haptoglobin, Serum", "Serum Haptoglobin", "Haptoglobin", "Result"],
      method: "Immunoturbidimetry",
      defaultRange: "41.00 - 165.00",
      defaultUnit: "mg/dL",
    })}
    <div class="single-analyte-notes haptoglobin-notes">
      <div class="report-note-heading">Comments :</div>
      <p>Haptoglobin binds hemoglobin released during red-cell lysis, helping preserve body iron and protein stores. Serum haptoglobin may rise with stress, infection, acute inflammation, and tissue necrosis. After a hemolytic episode, its concentration falls as hemoglobin-haptoglobin complexes are cleared from circulation. The test can also help serially monitor conditions with ongoing red-cell breakdown, including mechanical heart valves, hemoglobinopathies, and exercise-associated trauma.</p>
      <div class="report-note-heading">High levels caused by:</div>
      <p>Acute inflammation, protein-losing enteropathy, protein-losing nephropathy, tissue necrosis, and stress.</p>
      <div class="report-note-heading">Low levels caused by:</div>
      <p>Congenital deficiency, hemolytic transfusion reaction, thermal burns, and autoimmune hemolytic anemia.</p>
    </div>
  `;
}

function buildGramStainBacterialVaginosisReportBody(test) {
  const score = findReportParameter(test, ["Nugent Score", "Nugent Score / Manual Micro Comment", "Manual Micro Comment", "Result"]) || {};
  const value = score.value || "-";
  const status = getNugentScoreStatus(value);

  return `
    <table class="results-table gram-bv-table">
      <thead>
        <tr><th style="width: 36%">Investigation</th><th style="width: 26%">Result</th><th style="width: 28%">Reference Value</th><th style="width: 10%">Unit</th></tr>
      </thead>
      <tbody>
        <tr class="gram-bv-investigation-row"><td colspan="4"><strong>GRAM STAIN FOR BACTERIAL VAGINOSIS (BV), VAGINAL SWAB</strong><div class="single-analyte-method">Gram stain microscopy with Nugent score</div></td></tr>
        <tr>
          <td><strong>Nugent score</strong></td>
          <td><span class="${status?.className || ""}">${escapeHtml(value)}</span>${status ? ` <span class="single-analyte-status ${status.className}">${status.label}</span>` : ""}</td>
          <td>0 - 3 Negative for Bacterial Vaginosis (BV)</td>
          <td></td>
        </tr>
      </tbody>
    </table>
    <div class="single-analyte-notes gram-bv-notes">
      <div class="report-note-heading">Interpretation :</div>
      <p>A Nugent score of 0-10 is generated by combining Lactobacilli morphotypes, Gardnerella and Bacteroides species, and curved Gram-variable rods. The scores are interpreted as follows:</p>
      <ul>
        <li>0-3: negative for bacterial vaginosis.</li>
        <li>4-6: intermediate.</li>
        <li>7-10: indicative of bacterial vaginosis.</li>
      </ul>
      <table class="nugent-score-table">
        <thead><tr><th>Nugent Score</th><th>Lactobacilli spp.</th><th>Gardnerella &amp; Bacteroides spp.</th><th>Curved Gram-variable rods</th></tr></thead>
        <tbody>
          <tr><td>0</td><td>4 +</td><td>0</td><td>0</td></tr>
          <tr><td>1</td><td>3 +</td><td>1 +</td><td>1 + / 2 +</td></tr>
          <tr><td>2</td><td>2 +</td><td>2 +</td><td>3 + / 4 +</td></tr>
          <tr><td>3</td><td>1 +</td><td>3 +</td><td>-</td></tr>
          <tr><td>4</td><td>0</td><td>4 +</td><td>-</td></tr>
        </tbody>
      </table>
      <div class="report-note-heading">Comments :</div>
      <p>Bacterial vaginosis is a syndrome marked by increased vaginal pH, milky or creamy discharge, and an amine or fishy odor. Microbiologically, it is characterized by a shift from Lactobacillus-dominant flora to mixed vaginal flora that may include Gardnerella vaginalis, Bacteroides species, and Mobiluncus species. This scored Gram stain should be used with the patient’s symptoms and clinical assessment; bacterial vaginosis has been associated with pregnancy complications including amniotic fluid infection, prematurity, chorioamnionitis, and post-cesarean endometritis.</p>
    </div>
  `;
}

function buildAldolaseReportBody(test) {
  return `
    ${buildSingleAnalyteResultTable(test, {
      tableClass: "single-analyte-table aldolase-table",
      investigation: "ALDOLASE, SERUM",
      aliases: ["Aldolase, Serum", "Serum Aldolase", "Aldolase", "Result"],
      method: "Spectrophotometry",
      defaultRange: "< 7.60",
      defaultUnit: "U/L",
      statusForValue: getAldolaseStatus,
    })}
    <div class="single-analyte-notes aldolase-notes">
      <div class="report-note-heading">Comments :</div>
      <p>Serum aldolase determinations can be useful in primary diseases of skeletal muscle. When used with CK levels, aldolase activity can help distinguish neuromuscular atrophies from myopathies. Levels are higher in neonates and children than in adults and may rise with muscle injury, gangrene, infection, or strenuous exercise.</p>
      <div class="report-note-heading">Interpretation :</div>
      <ul>
        <li>Higher than normal aldolase levels may indicate muscle damage or disease and may require further evaluation.</li>
        <li>Lower than normal aldolase levels are less common and may require further investigation.</li>
      </ul>
    </div>
  `;
}

function buildUrineProteinCreatinineRatioReportBody(test) {
  const definitions = [
    { label: "Protein Total", aliases: ["Protein Total", "Urine Protein", "Protein"], range: "< 14.00", unit: "mg/dL" },
    { label: "Creatinine", aliases: ["Creatinine", "Urine Creatinine"], range: "24.00 - 392.00", unit: "mg/dL" },
    { label: "Protein Creatinine Ratio", aliases: ["Protein Creatinine Ratio", "Urine Protein Creatinine Ratio", "UPCR"], range: "< 0.20", unit: "mg/mg" },
  ];
  const rows = definitions.map((definition) => {
    const result = findReportParameter(test, definition.aliases) || {};
    const value = result.value || "-";
    const range = result.normal_range && result.normal_range !== "N/A" ? result.normal_range : definition.range;
    const unit = result.unit && result.unit !== "N/A" ? result.unit : definition.unit;
    const status = getReferenceStatus(value, range);
    const showStatus = status && status.label !== "Normal";
    return `
      <tr>
        <td>${escapeHtml(definition.label)}</td>
        <td><span class="${showStatus ? status.className : ""}">${escapeHtml(value)}</span>${showStatus ? ` <span class="single-analyte-status ${status.className}">${status.label}</span>` : ""}</td>
        <td>${escapeHtml(range)}</td>
        <td>${escapeHtml(unit)}</td>
      </tr>
    `;
  }).join("");

  return `
    <table class="results-table upcr-table">
      <thead><tr><th style="width: 34%">Investigation</th><th style="width: 27%">Result</th><th style="width: 25%">Reference Value</th><th style="width: 14%">Unit</th></tr></thead>
      <tbody>
        <tr class="upcr-meta-row"><td>Primary Sample Type :</td><td>Urine</td><td colspan="2"></td></tr>
        <tr class="upcr-meta-row"><td>Test method :</td><td>Spectrophotometry</td><td colspan="2"></td></tr>
        <tr class="upcr-section"><td colspan="4">PARAMETER</td></tr>
        ${rows}
      </tbody>
    </table>
    <div class="single-analyte-notes upcr-notes">
      <div class="report-note-heading">Interpretation :</div>
      <table class="upcr-interpretation-table">
        <thead><tr><th>Protein creatinine ratio</th><th>Remark</th></tr></thead>
        <tbody>
          <tr><td>&lt; 0.2</td><td>Normal</td></tr>
          <tr><td>0.2 - 1.0</td><td>Low-grade proteinuria</td></tr>
          <tr><td>1.0 - 5.0</td><td>Moderate proteinuria</td></tr>
          <tr><td>&gt; 5.0</td><td>Nephrosis</td></tr>
        </tbody>
      </table>
      <div class="report-note-heading">Comments :</div>
      <p>Urinary total proteins are nearly negligible in healthy adults. The protein-creatinine ratio is a simple, convenient method to quantify and monitor proteinuria in adults with chronic kidney disease. Patients with two or more positive results within one to two weeks may have persistent proteinuria and should be investigated further.</p>
      <div class="report-note-heading">UPCR High Levels cause:</div>
      <ul><li>Kidney disease with protein leak from glomeruli.</li><li>Nephrotic syndrome with protein loss in urine.</li></ul>
      <div class="report-note-heading">UPCR Low Levels cause:</div>
      <ul><li>Healthy kidneys with protein reabsorption.</li><li>Dehydration or low urine output.</li></ul>
    </div>
  `;
}

function getAlbuminCreatinineRatioCategory(value) {
  const numericValue = Number(String(value || "").replace(/,/g, ""));
  if (!Number.isFinite(numericValue)) return null;
  if (numericValue < 30) {
    return { code: "A1", label: "Normal to mildly increased", className: "normal-val" };
  }
  if (numericValue <= 300) {
    return { code: "A2", label: "Moderately increased", className: "high-val" };
  }
  return { code: "A3", label: "Severely increased", className: "high-val" };
}

function buildAlbuminCreatinineRatioReportBody(test) {
  const albumin = findReportParameter(test, ["Urine Albumin", "Albumin", "Microalbumin", "Urinary Albumin"]) || {};
  const creatinine = findReportParameter(test, ["Urine Creatinine", "Creatinine", "Urinary Creatinine"]) || {};
  const ratio = findReportParameter(test, ["Albumin Creatinine Ratio (ACR)", "Albumin Creatinine Ratio", "ACR", "UACR"]) || {};
  const displayValue = (value) => String(value ?? "").trim() || "-";
  const ratioValue = displayValue(ratio.value);
  const category = getAlbuminCreatinineRatioCategory(ratioValue);
  const rows = [
    { label: "Urine Albumin", value: displayValue(albumin.value), range: albumin.normal_range || "-", unit: albumin.unit || "mg/L" },
    { label: "Urine Creatinine", value: displayValue(creatinine.value), range: creatinine.normal_range || "-", unit: creatinine.unit || "mg/dL" },
  ].map((definition) => `
    <tr>
      <td>${escapeHtml(definition.label)}</td>
      <td>${escapeHtml(definition.value)}</td>
      <td>${escapeHtml(definition.range)}</td>
      <td>${escapeHtml(definition.unit)}</td>
    </tr>
  `).join("");

  return `
    <table class="results-table acr-table">
      <thead><tr><th style="width: 34%">Investigation</th><th style="width: 27%">Result</th><th style="width: 25%">Reference Value</th><th style="width: 14%">Unit</th></tr></thead>
      <tbody>
        <tr class="acr-meta-row"><td><strong>Sample Type</strong></td><td>${escapeHtml(test.sample_type || "Spot Urine")}</td><td colspan="2"></td></tr>
        <tr class="acr-meta-row"><td><strong>Calculation</strong></td><td colspan="3">Urine albumin-to-creatinine ratio</td></tr>
        <tr class="acr-section"><td colspan="4">URINE ALBUMIN / CREATININE</td></tr>
        ${rows}
        <tr class="acr-ratio-row">
          <td><strong>Albumin Creatinine Ratio (ACR)</strong></td>
          <td><span class="${category?.className || ""}">${escapeHtml(ratioValue)}</span>${category ? ` <span class="single-analyte-status ${category.className}">${escapeHtml(category.code)}</span>` : ""}</td>
          <td>&lt; 30.00</td>
          <td>${escapeHtml(ratio.unit || "mg/g creatinine")}</td>
        </tr>
        <tr class="acr-category-row"><td><strong>Albuminuria Category</strong></td><td colspan="3">${category ? `<strong class="${category.className}">${escapeHtml(category.code)} - ${escapeHtml(category.label)}</strong>` : "-"}</td></tr>
      </tbody>
    </table>
    <div class="single-analyte-notes acr-notes">
      <div class="report-note-heading">Albuminuria Classification (ACR, mg/g creatinine)</div>
      <table class="acr-interpretation-table">
        <thead><tr><th>Category</th><th>ACR</th><th>Interpretation</th></tr></thead>
        <tbody>
          <tr><td>A1</td><td>&lt; 30</td><td>Normal to mildly increased</td></tr>
          <tr><td>A2</td><td>30 - 300</td><td>Moderately increased</td></tr>
          <tr><td>A3</td><td>&gt; 300</td><td>Severely increased</td></tr>
        </tbody>
      </table>
      <p>ACR is calculated from urine albumin and urine creatinine concentrations to reduce the effect of urine dilution. Interpret results with the patient's clinical history and other renal findings; persistent elevation should be clinically evaluated.</p>
    </div>
  `;
}

function buildPostPrandialBloodSugarReportBody(test) {
  return `
    ${buildSingleAnalyteResultTable(test, {
      tableClass: "single-analyte-table ppbs-table",
      investigation: "GLUCOSE, POST PRANDIAL, 2 HOURS, PLASMA",
      aliases: ["Glucose, Post Prandial, 2 Hours, Plasma", "Glucose PP (Post Prandial)", "Post Prandial Blood Sugar", "PPBS", "Result"],
      method: "Hexokinase",
      defaultRange: "100.00 - 140.00",
      defaultUnit: "mg/dL",
      statusForValue: getPostPrandialGlucoseStatus,
    })}
    <div class="single-analyte-notes ppbs-notes">
      <div class="report-note-heading">Interpretation :</div>
      <p>Two-hour postprandial results are commonly interpreted as:</p>
      <ul>
        <li>100 - 140 mg/dL: normal PPBS level.</li>
        <li>141 - 199 mg/dL: impaired glucose tolerance (prediabetes).</li>
        <li>200 mg/dL or above: high blood sugar (diabetes range).</li>
      </ul>
      <div class="report-note-heading">Causes of High Levels :</div>
      <ul>
        <li>Diabetes: a chronic condition characterized by high blood sugar.</li>
        <li>Insulin resistance: reduced sensitivity to the hormone insulin.</li>
        <li>Poor dietary choices, including high-sugar or high-carbohydrate meals.</li>
        <li>Lack of physical activity, with a sedentary lifestyle and insufficient exercise.</li>
        <li>Medicines or medical conditions that can raise PPBS levels.</li>
        <li>Hormonal disorders, such as cortisol or growth-hormone imbalance.</li>
        <li>Pancreatic disorders affecting insulin production.</li>
      </ul>
      <div class="report-note-heading">Causes of Low Levels :</div>
      <ul>
        <li>Hypoglycemia: abnormally low blood sugar levels.</li>
        <li>Excessive insulin in the bloodstream.</li>
        <li>Overmedication with diabetes medicine or insulin.</li>
        <li>Delayed or missed meals.</li>
        <li>Malabsorption or malnutrition.</li>
        <li>Liver or kidney disorders and hormonal imbalance.</li>
        <li>Strenuous exercise or physical activity.</li>
      </ul>
    </div>
  `;
}

function buildTacrolimusReportBody(test) {
  return `
    ${buildDrlogyStyleAnalyteResultTable(test, {
      tableClass: "single-analyte-table tacrolimus-table",
      investigation: "TACROLIMUS",
      aliases: ["Tacrolimus, Whole Blood", "Tacrolimus", "FK506", "Result"],
      method: "LC-MS / MS",
      defaultRange: "< 10.00",
      defaultUnit: "mcg/L",
      sampleType: "Whole Blood (3 ml)",
      turnaroundText: "1 day (Normal: 1 - 3 days)",
      statusForValue: getTacrolimusStatus,
    })}
    <table class="tacrolimus-interpretation-table">
      <thead>
        <tr><th>Interpretation</th><th colspan="2">Kidney transplant</th><th colspan="2">Liver transplant</th></tr>
        <tr><th></th><th>Post transplant</th><th>Therapeutic range</th><th>Post transplant</th><th>Therapeutic range</th></tr>
      </thead>
      <tbody>
        <tr><th>Pediatric</th><td>0-3 months</td><td>10-12 mcg/L</td><td>0-3 months</td><td>10-12 mcg/L</td></tr>
        <tr><th></th><td>3-6 months</td><td>8-10 mcg/L</td><td>3-6 months</td><td>8-10 mcg/L</td></tr>
        <tr><th></th><td>6-12 months</td><td>6-8 mcg/L</td><td>&gt;6 months</td><td>6-8 mcg/L</td></tr>
        <tr><th></th><td>&gt;1 year</td><td>4-7 mcg/L</td><td></td><td></td></tr>
        <tr><th>Adult</th><td>0-6 months</td><td>8-10 mcg/L</td><td>0-3 months</td><td>10-12 mcg/L</td></tr>
        <tr><th></th><td>6-12 months</td><td>6-8 mcg/L</td><td>3-6 months</td><td>8-10 mcg/L</td></tr>
        <tr><th></th><td>&gt;1 year</td><td>4-6 mcg/L</td><td>&gt;6 months</td><td>6-8 mcg/L</td></tr>
        <tr><th></th><td>&gt;5 year</td><td>3-5 mcg/L</td><td></td><td></td></tr>
        <tr><th></th><td>Toxic range</td><td>&gt;20 mcg/L</td><td>Toxic range</td><td>&gt;20 mcg/L</td></tr>
      </tbody>
    </table>
    <div class="single-analyte-notes tacrolimus-notes">
      <div class="report-note-heading">Comments:</div>
      <p>LC-MS/MS is a sensitive, specific, and precise method for monitoring immunosuppressants. Therapeutic drug monitoring helps maintain drug concentrations within the range that provides clinical effect with minimal adverse reactions.</p>
      <div class="report-note-heading">Interpretation:</div>
      <p>Tacrolimus results are interpreted by comparing the blood concentration with the relevant therapeutic range. Tacrolimus has a narrow therapeutic window, so monitoring must be individualized according to the patient’s clinical condition, transplant history, and any signs of rejection or toxicity.</p>
      <ul>
        <li><strong>Subtherapeutic levels:</strong> may indicate a risk of organ rejection and may require dose adjustment.</li>
        <li><strong>Therapeutic levels:</strong> suggest the dose is appropriate for preventing rejection without reaching toxic concentrations.</li>
        <li><strong>Supratherapeutic levels:</strong> can lead to adverse effects or toxicity and may require dose reduction.</li>
      </ul>
      <p>Regular monitoring is essential for optimizing transplant outcomes and minimizing risks associated with immunosuppressive therapy.</p>
    </div>
  `;
}

function buildPhosphorusReportBody(test) {
  return buildSingleAnalyteResultTable(test, {
    tableClass: "single-analyte-table phosphorus-table",
    investigation: "PHOSPHORUS, SERUM",
    aliases: ["Phosphorus, Serum", "Inorganic Phosphorus, Serum", "Inorganic Phosphorus (Serum)", "Phosphorus", "Phosphate", "Result"],
    method: "Molybdate UV",
    defaultRange: "2.40 - 5.10",
    defaultUnit: "mg/dL",
  });
}

function buildAlkalinePhosphataseReportBody(test) {
  return buildSingleAnalyteResultTable(test, {
    tableClass: "single-analyte-table alkaline-phosphatase-table",
    investigation: "ALKALINE PHOSPHATASE, SERUM",
    aliases: ["Alkaline Phosphatase, Serum", "Alkaline Phosphatase (ALP)", "ALP (Alkaline Phosphatase)", "Alkaline Phosphatase", "ALP", "Result"],
    method: "IFCC",
    defaultRange: "30.00 - 120.00",
    defaultUnit: "U/L",
  });
}

function buildClotRetractionReportBody(test) {
  return `
    ${buildDrlogyStyleAnalyteResultTable(test, {
      tableClass: "single-analyte-table clot-retraction-table",
      investigation: "CLOT RETRACTION TEST",
      aliases: ["Clot Retraction Test", "Clot Retraction Time", "Clot Retraction", "Result"],
      method: "Manual",
      defaultRange: "48.00 - 64.00",
      defaultUnit: "%",
      sampleType: "Whole Blood (3 ml)",
      turnaroundText: "1 day (Normal: 1 - 2 days)",
      statusForValue: getClotRetractionStatus,
    })}
    <div class="single-analyte-notes clot-retraction-notes">
      <div class="report-note-heading">Interpretation:</div>
      <ol>
        <li><strong>Normal Clot Retraction:</strong><ul><li>If the clot retracts appropriately, it may suggest normal blood clotting function.</li></ul></li>
        <li><strong>Abnormal Clot Retraction:</strong><ul><li>Abnormalities in clot retraction might indicate issues with platelet function, clotting factors, or other components involved in the blood clotting process.</li></ul></li>
      </ol>
      <div class="report-note-heading">Comments:</div>
      <ul>
        <li><strong>Immediate Appearance:</strong> Initially, after blood coagulation, a red clot formation is observed. This is a normal response indicating the initial stages of clotting.</li>
        <li><strong>Clot Retraction:</strong> The clot should then start to contract or retract over time. Complete or near-complete retraction suggests normal platelet function and fibrin polymerization.</li>
        <li><strong>Time:</strong> The rate of clot retraction is important. A slower retraction time may indicate possible platelet dysfunction or a clotting factor deficiency.</li>
        <li><strong>Size and Firmness:</strong> A normal clot should be relatively small, dense, and well-retracted. A loose, soft, or large clot may indicate an issue with platelet function, fibrinogen levels, or other coagulation factors.</li>
        <li><strong>Color Change:</strong> An abnormal color change, such as excessive redness or an absence of retraction, may indicate a problem with clot stability.</li>
        <li><strong>Bleeding Time:</strong> Consider the patient's overall bleeding time together with the clot retraction result. Prolonged bleeding time with an abnormal clot retraction result may suggest a bleeding disorder.</li>
      </ul>
    </div>
  `;
}

function buildGroupBStrepReportBody(test) {
  const result = findReportParameter(test, ["Group B Streptococcus", "Streptococcus Group B Antigen Detection", "Result"]) || {};
  const status = getGroupBStrepStatus(result.value);
  const resultLabel = status?.resultLabel || result.value || "-";
  const referenceLabel = status?.referenceLabel || "Negative";
  const sampleType = test.sample_type || "Cardial";

  return `
    <table class="results-table gbs-table">
      <thead><tr><th style="width: 44%">Investigation</th><th style="width: 22%">Result</th><th style="width: 24%">Reference Value</th><th style="width: 10%">Unit</th></tr></thead>
      <tbody>
        <tr class="gbs-heading-row"><td colspan="4"><strong>STREPTOCOCCUS GROUP B ANTIGEN DETECTION</strong><div class="single-analyte-method">Latex Agglutination</div></td></tr>
        <tr><td>Sample Type</td><td>${escapeHtml(sampleType)}</td><td></td><td></td></tr>
        <tr><td>Group B Streptococcus</td><td><span class="${status?.className || ""}">${escapeHtml(resultLabel)}</span></td><td><span class="${status?.className || ""}">${escapeHtml(referenceLabel)}</span></td><td></td></tr>
      </tbody>
    </table>
    <div class="single-analyte-notes gbs-notes">
      <div class="report-note-heading">Comments:</div>
      <p>Neonatal sepsis is frequently attributed to Streptococcus group B and <em>E. coli</em> K1, whereas in older age groups, prevalent isolates include H. influenzae Type B, S. pneumoniae, and N. meningitidis A, B, C, Y, and W135. Prompt recognition of these causative agents is crucial for administering patients with the suitable antibiotic treatment.</p>
      <div class="report-note-heading">Interpretation:</div>
      <ol>
        <li><strong>Negative Result:</strong> A negative result suggests that the Group B Streptococcus antigen was not detected in the sample. In the context of pregnancy, a negative result indicates a lower risk of transmitting GBS to the newborn during delivery.</li>
        <li><strong>Positive Result:</strong> A positive result indicates the presence of the Group B Streptococcus antigen. This finding suggests an increased risk of GBS colonization or infection. In the context of pregnancy, a positive result may prompt healthcare providers to take preventive measures during labor and delivery.</li>
        <li><strong>Interpretation in Pregnancy:</strong> During pregnancy, women are often screened for GBS between 35 and 37 weeks of gestation. If the result is positive, intrapartum antibiotic prophylaxis (IAP) is typically recommended during labor to reduce the risk of GBS transmission to the newborn. The antibiotics are usually administered to the mother through an IV.</li>
        <li><strong>Clinical Correlation:</strong> The interpretation of the GBS Antigen Detection test results should be done by a healthcare professional in the context of the patient's overall clinical condition, medical history, and risk factors. Positive results may lead to specific interventions to prevent GBS-related complications.</li>
      </ol>
    </div>
  `;
}

function buildFungusKohPreparationReportBody(test) {
  const valueFor = (aliases, fallback = "-") => {
    const parameter = findReportParameter(test, aliases) || {};
    return String(parameter.value || "").trim() || fallback;
  };
  const rows = [
    ["Yeast cells", ["Yeast Cells"], ["Yeast Cells Grade"]],
    ["Pseudohyphae", ["Pseudohyphae"], ["Pseudohyphae Grade"]],
    ["Fungal spores", ["Fungal Spores"], ["Fungal Spores Grade"]],
    ["Fungal hyphae", ["Fungal Hyphae"], ["Fungal Hyphae Grade"]],
    ["Others", ["Others"], ["Others Grade"]],
  ].map(([label, resultAliases, gradeAliases]) => ({
    label,
    result: valueFor(resultAliases, "Nil"),
    grade: valueFor(gradeAliases, "0"),
  }));
  const hasFungalElement = rows.some((row) => !["", "nil", "none", "negative", "0", "-"].includes(String(row.result).trim().toLowerCase()));
  const enteredImpression = valueFor(["Impression"], "");
  const impression = enteredImpression || (hasFungalElement ? "Fungal element seen" : "No Fungal element seen");
  const specimen = valueFor(["Type of Specimen", "Specimen Type", "Specimen"], test.sample_type || "Skin/Nail");

  return `
    <div class="micro-investigation"><strong>FUNGUS ROUTINE, KOH PREPARATION</strong><div class="single-analyte-method">KOH/KOH- Calcofluor preparation fluorescent Microscopy</div></div>
    <div class="micro-specimen"><strong>Type of Specimen :</strong> ${escapeHtml(specimen)}</div>
    <table class="micro-exam-table koh-table">
      <thead><tr><th>Fungal Elements</th><th>Result</th><th>Grade</th></tr></thead>
      <tbody>${rows.map((row) => `<tr><td>${escapeHtml(row.label)}</td><td>${escapeHtml(row.result)}</td><td>${escapeHtml(row.grade)}</td></tr>`).join("")}
        <tr><td><strong>Impression :</strong></td><td colspan="2">${escapeHtml(impression)}</td></tr>
      </tbody>
    </table>
  `;
}

function buildSputumAfbReportBody(test) {
  const valueFor = (aliases, fallback = "-") => {
    const parameter = findReportParameter(test, aliases) || {};
    return String(parameter.value || "").trim() || fallback;
  };
  const specimen = valueFor(["Type of Specimen", "Specimen Type", "Specimen"], test.sample_type || "Sputum");
  const rows = [
    ["Auramine", valueFor(["Auramine Result"], "No acid fast bacilli seen"), valueFor(["Auramine Grade"], "0")],
    ["Ziehl Neelsen", valueFor(["Ziehl Neelsen Result", "Ziehl-Neelsen Result"], "No acid fast bacilli seen"), valueFor(["Ziehl Neelsen Grade", "Ziehl-Neelsen Grade"], "0")],
  ];

  return `
    <div class="micro-investigation"><strong>SPUTUM EXAMINATION, AFB</strong><div class="single-analyte-method">Microscopy</div></div>
    <div class="micro-specimen"><strong>Type of Specimen :</strong> ${escapeHtml(specimen)}</div>
    <table class="micro-exam-table afb-table">
      <thead><tr><th>Stain</th><th>Result</th><th>Grade</th></tr></thead>
      <tbody>${rows.map(([stain, result, grade]) => `<tr><td>${escapeHtml(stain)}</td><td>${escapeHtml(result)}</td><td>${escapeHtml(grade)}</td></tr>`).join("")}</tbody>
    </table>
    <div class="micro-note"><strong>Note:</strong> Result is dependent on the quality of specimen submitted.</div>
  `;
}

function buildAfbCultureSensitivityReportBody(test) {
  const valueFor = (aliases, fallback = "-") => {
    const parameter = findReportParameter(test, aliases) || {};
    return String(parameter.value || "").trim() || fallback;
  };
  const cultureResult = valueFor(["AFB Culture Result", "Culture Result", "AFB Culture", "Result"]);
  const organism = valueFor(["Organism Isolated", "Organism", "Isolate"]);
  const sensitivity = valueFor(["Drug Sensitivity", "Drug Susceptibility", "Sensitivity", "Susceptibility"]);
  const comments = valueFor(["Comments", "Comment", "Remarks"], "");
  const status = getCultureStatus(cultureResult);

  return `
    <table class="results-table culture-table afb-culture-table">
      <thead><tr><th style="width: 38%">Investigation</th><th style="width: 25%">Result</th><th style="width: 25%">Reference Value</th><th style="width: 12%">Unit</th></tr></thead>
      <tbody>
        <tr><td><strong>AFB CULTURE &amp; SENSITIVITY</strong><div class="single-analyte-method">Culture, identification and susceptibility testing</div></td><td><span class="${status?.className || ""}">${escapeHtml(status?.label || cultureResult)}</span></td><td>No growth</td><td></td></tr>
        <tr><td>Organism Isolated</td><td colspan="3">${escapeHtml(organism)}</td></tr>
        <tr><td>Drug Sensitivity</td><td colspan="3">${escapeHtml(sensitivity)}</td></tr>
      </tbody>
    </table>
    ${comments ? `<div class="single-analyte-notes culture-notes"><div class="report-note-heading">Comments:</div><p>${escapeHtml(comments)}</p></div>` : ""}
  `;
}

function buildCultureReportBody(test, { cultureName, aliases, defaultComment }) {
  const result = findReportParameter(test, aliases) || {};
  const status = getCultureStatus(result.value);
  const comments = findReportParameter(test, ["Comments", "Comment", "Remarks"]) || {};
  const comment = String(comments.value || "").trim() || defaultComment;

  return `
    <table class="results-table culture-table">
      <thead><tr><th style="width: 38%">Investigation</th><th style="width: 25%">Result</th><th style="width: 25%">Reference Value</th><th style="width: 12%">Unit</th></tr></thead>
      <tbody><tr><td><strong>${escapeHtml(cultureName)}</strong><div class="single-analyte-method">Conventional culture, Automated Identification &amp; Sensitivity</div></td><td><span class="${status?.className || ""}">${escapeHtml(status?.label || result.value || "-")}</span></td><td>Absent</td><td></td></tr></tbody>
    </table>
    <div class="single-analyte-notes culture-notes"><div class="report-note-heading">Comments:</div><p>${escapeHtml(comment)}</p></div>
  `;
}

function buildMalariaParasiteIdentificationReportBody(test) {
  const result = findReportParameter(test, ["Malaria Parasite Identification", "MP (Malaria Parasites)", "Malaria Parasite", "MP", "Result"]) || {};
  const status = getMalariaParasiteStatus(result.value);
  const sampleType = test.sample_type || "Blood (2 ml)";

  return `
    <table class="results-table malaria-parasite-table">
      <thead><tr><th style="width: 36%">Investigation</th><th style="width: 24%">Result</th><th style="width: 26%">Reference Value</th><th style="width: 14%">Unit</th></tr></thead>
      <tbody>
        <tr class="single-analyte-sample-row"><td><strong>Sample Type</strong></td><td>${escapeHtml(sampleType)}</td><td colspan="2"><strong>TAT :</strong> 1 Hr (Normal: 1 - 3 hrs)</td></tr>
        <tr><td><strong>MALARIA PARASITE IDENTIFICATION</strong><div class="single-analyte-method">Microscopy</div></td><td><span class="${status?.className || ""}">${escapeHtml(status?.label || result.value || "-")}</span></td><td></td><td></td></tr>
      </tbody>
    </table>
    <div class="single-analyte-notes malaria-parasite-notes"><div class="report-note-heading">Note:</div><ul><li>A single negative smear does not rule out malaria.</li><li>Test conducted on whole blood.</li></ul></div>
  `;
}

function buildMycobacteriumCombinedPanelReportBody(test) {
  const valueFor = (aliases, fallback = "-") => {
    const parameter = findReportParameter(test, aliases) || {};
    return String(parameter.value || "").trim() || fallback;
  };
  const specimen = valueFor(["Type of Specimen", "Specimen Type", "Specimen"], test.sample_type || "Sputum");
  const tuberculosisValue = valueFor(["Mycobacterium tuberculosis Complex", "MTB Complex", "Mycobacterium Tuberculosis Complex"]);
  const nonTuberculosisValue = valueFor(["Non tuberculous Mycobacteria", "Non-tuberculous Mycobacteria", "NTM"]);
  const tuberculosisStatus = getDetectedNotDetectedStatus(tuberculosisValue, { negativeClassName: "low-val" });
  const nonTuberculosisStatus = getDetectedNotDetectedStatus(nonTuberculosisValue, { negativeClassName: "low-val" });

  return `
    <table class="results-table mycobacterium-results-table">
      <thead><tr><th style="width: 37%">Investigation</th><th style="width: 25%">Result</th><th style="width: 26%">Reference Value</th><th style="width: 12%">Unit</th></tr></thead>
      <tbody>
        <tr><td><strong>MYCOBACTERIUM TUBERCULOSIS, PCR; MYCOSURE</strong><div class="single-analyte-method">Real Time PCR</div></td><td></td><td></td><td></td></tr>
        <tr class="single-analyte-sample-row"><td>Type of Specimen</td><td>${escapeHtml(specimen)}</td><td></td><td></td></tr>
        <tr><td>Mycobacterium tuberculosis Complex</td><td><span class="${tuberculosisStatus?.className || ""}">${escapeHtml(tuberculosisStatus?.resultLabel || tuberculosisValue)}</span></td><td>${escapeHtml(tuberculosisStatus?.referenceLabel || "Negative")}</td><td></td></tr>
        <tr><td>Non tuberculous Mycobacteria</td><td><span class="${nonTuberculosisStatus?.className || ""}">${escapeHtml(nonTuberculosisStatus?.resultLabel || nonTuberculosisValue)}</span></td><td>${escapeHtml(nonTuberculosisStatus?.referenceLabel || "Negative")}</td><td></td></tr>
      </tbody>
    </table>
    <table class="mycobacterium-interpretation-table">
      <thead><tr><th>Result</th><th>Comments</th></tr></thead>
      <tbody>
        <tr><td>Mycobacterium tuberculosis complex - Detected</td><td>Infection is likely with <em>M. tuberculosis</em>, <em>M. bovis</em>, <em>M. microti</em>, or <em>M. africanum</em>.</td></tr>
        <tr><td>Non tuberculous Mycobacteria - Detected</td><td>Infection is likely with a Mycobacterium other than the tuberculosis complex.</td></tr>
        <tr><td>Inhibition Detected</td><td>Inhibitors were detected in the submitted sample; repeat sampling is recommended.</td></tr>
        <tr><td>Mycobacterium tuberculosis complex and non tuberculous Mycobacteria - Not Detected</td><td>Mycobacteria were not detected in the submitted sample.</td></tr>
      </tbody>
    </table>
    <div class="single-analyte-notes mycobacterium-notes">
      <div class="report-note-heading">Note:</div>
      <ol>
        <li>This assay includes three targets: two for the tuberculosis complex (IS6110 and MPB64) and one for Mycobacterium genus (16sRNA).</li>
        <li>It is an in-house developed real-time PCR qualitative detection test.</li>
        <li>The analytical limit of detection is approximately 1-10 Mycobacteria per PCR reaction.</li>
        <li>The assay does not differentiate individual Mycobacteria species.</li>
        <li>Mycobacterial culture is recommended when inhibition is detected.</li>
      </ol>
      <div class="report-note-heading">Comments:</div>
      <p>The Mycobacterium tuberculosis complex includes <em>M. tuberculosis</em>, <em>M. bovis</em>, <em>M. microti</em>, and <em>M. africanum</em>, which have public-health importance because they can spread person to person. Common non-tuberculous Mycobacteria include the <em>M. avium</em> complex and <em>M. kansasii</em>, which may cause pulmonary disease, and <em>M. abscessus</em>, <em>M. chelonae</em>, <em>M. marinum</em>, and <em>M. fortuitum</em>, which may cause skin and soft-tissue infections. Nucleic acid amplification tests directly detect Mycobacteria, but clinical correlation remains essential.</p>
    </div>
  `;
}

function buildOvaAndParasiteReportBody(test) {
  const valueFor = (aliases, fallback = "-") => {
    const parameter = findReportParameter(test, aliases) || {};
    return String(parameter.value || "").trim() || fallback;
  };
  const specimen = valueFor(["Type of Specimen", "Specimen Type", "Specimen"], test.sample_type || "Stool (5 g)");
  const analytes = [
    "Cryptosporidium spp",
    "OVA, Cryptosporidium spp",
    "LARVA, Cryptosporidium spp",
    "OTHER, Cryptosporidium spp",
    "Cyclospora spp",
    "OVA, Cyclospora spp",
    "LARVA, Cyclospora spp",
    "OTHER, Cyclospora spp",
    "Isospora spp",
    "Microsporidia spp",
    "Strongyloides stercoralis larvae",
  ];
  const rows = analytes.map((name) => {
    const aliases = name === "Isospora spp" ? [name, "Cystoisospora spp"] : name === "Strongyloides stercoralis larvae" ? [name, "Strongyloides stercoralis"] : [name];
    const value = valueFor(aliases);
    const status = getDetectedNotDetectedStatus(value);
    return `<tr><td>${escapeHtml(name)}</td><td><span class="${status?.className || ""}">${escapeHtml(status?.resultLabel || value)}</span></td><td>${escapeHtml(status?.referenceLabel || "Negative")}</td><td></td></tr>`;
  }).join("");

  return `
    <table class="results-table ova-parasite-results-table">
      <thead><tr><th style="width: 43%">Investigation</th><th style="width: 22%">Result</th><th style="width: 24%">Reference Value</th><th style="width: 11%">Unit</th></tr></thead>
      <tbody>
        <tr class="single-analyte-sample-row"><td><strong>Sample Type</strong></td><td>${escapeHtml(specimen)}</td><td colspan="2"><strong>TAT :</strong> 4 hrs (Normal: 4 - 8 hrs)</td></tr>
        <tr><td colspan="4"><strong>OVA AND PARASITE</strong><div class="single-analyte-method">Light Microscopy</div></td></tr>
        ${rows}
      </tbody>
    </table>
    <div class="single-analyte-notes ova-parasite-notes">
      <div class="report-note-heading">Note:</div>
      <p>This is a microscopic screening test for commonly occurring opportunistic enteric parasitic infections in immunocompromised patients. Routine enteric parasites found in stool are outside the scope of this test.</p>
      <div class="report-note-heading">Comments:</div>
      <p>Cryptosporidium, Cyclospora, Cystoisospora, Microsporidia, and Strongyloides stercoralis can cause severe diarrhoea in immunocompromised patients. Opportunistic enteric parasitic infections are common among people living with HIV, and severity generally rises as CD4 cell counts decrease. Interpret results with the patient's symptoms, immune status, and other clinical findings.</p>
    </div>
  `;
}

function buildPrenatalMarkerReportBody(test, type) {
  const isTriple = type === "triple";
  const parameters = isTriple
    ? [
      { label: "HCG", aliases: ["HCG", "hCG", "Human Chorionic Gonadotropin"], unit: "mIU/mL" },
      { label: "AFP", aliases: ["AFP", "Alpha Feto Protein"], unit: "ng/mL" },
      { label: "ESTRIOL, FREE", aliases: ["Estriol, Free", "Free Estriol", "E3"], unit: "ng/mL" },
    ]
    : [
      { label: "BETA HCG FREE", aliases: ["Beta HCG Free", "Free Beta HCG", "Beta hCG"], unit: "ng/mL" },
      { label: "PAPP-A", aliases: ["PAPP-A", "PAPP A", "Pregnancy Associated Plasma Protein A"], unit: "mIU/mL" },
    ];

  const rows = parameters.map((definition) => {
    const parameter = findReportParameter(test, definition.aliases) || {};
    const value = parameter.value || "-";
    const range = parameter.normal_range && parameter.normal_range !== "N/A" ? parameter.normal_range : "";
    const unit = parameter.unit && parameter.unit !== "N/A" ? parameter.unit : definition.unit;
    return `<tr><td><strong>${definition.label}</strong><div class="single-analyte-method">CLIA</div></td><td>${escapeHtml(value)}</td><td>${escapeHtml(range)}</td><td>${escapeHtml(unit)}</td></tr>`;
  }).join("");

  const note = isTriple
    ? `<p>This is a screening test. Risk calculation uses maternal demographic, biochemical, and ultrasound information and should be reported as multiples of the median (MoM). It is not a diagnostic test; screen-positive results require confirmatory diagnostic assessment.</p>
       <p>The test is generally performed from 14 to 22 weeks of gestation, with 15 to 20 weeks being the preferred sampling interval. Accurate gestational age and maternal clinical details are essential for reliable risk calculation.</p>`
    : `<ul><li>Screening is based on maternal demographic and biochemical information and indicates a risk category rather than a diagnosis. Screen-positive results require confirmatory assessment.</li><li>MoM interpretation accounts for gestational age, maternal weight, diabetes, multiple gestation, IVF, smoking, and relevant clinical history.</li><li>Combining biochemical screening with nuchal translucency improves the detection rate for common fetal chromosomal abnormalities.</li></ul>`;
  const comments = isTriple
    ? "Second-trimester screening helps identify pregnancies at increased risk for trisomy 21, trisomy 18, and open neural-tube defects. A high-risk result does not confirm fetal abnormality, and a low-risk result does not exclude it; correlate with ultrasound findings and specialist advice."
    : "First-trimester screening helps identify pregnancies at increased risk for trisomies 21, 18, and 13. This is a risk-estimation test, not a diagnostic test, and the result should be correlated with ultrasound findings and appropriate follow-up testing.";

  return `
    <table class="results-table prenatal-marker-table">
      <thead><tr><th style="width: 34%">Investigation</th><th style="width: 27%">Result</th><th style="width: 25%">Reference Value</th><th style="width: 14%">Unit</th></tr></thead>
      <tbody><tr class="prenatal-marker-section"><td colspan="4"><strong>MATERNAL SERUM; ${isTriple ? "TRIPLE" : "DUAL"} MARKER</strong></td></tr>${rows}</tbody>
    </table>
    <div class="single-analyte-notes prenatal-marker-notes">
      <div class="report-note-heading">Note:</div>
      ${note}
      <div class="report-note-heading">Comments:</div>
      <p>${comments}</p>
    </div>
  `;
}

function buildPax8ReportBody(test) {
  const result = findReportParameter(test, ["PAX 8", "PAX8", "Pax 8", "Result"]) || {};
  const value = result.value || "-";
  const status = getPositiveNegativeStatus(value);
  return `
    ${buildDrlogyStyleAnalyteResultTable(test, {
      tableClass: "single-analyte-table pax8-table",
      investigation: "PAX 8",
      aliases: ["PAX 8", "PAX8", "Pax 8", "Result"],
      method: "Immunohistochemistry",
      defaultRange: "Negative",
      defaultUnit: "",
      sampleType: "Serum (1 ml)",
      turnaroundText: "1 day (Normal: 1 - 3 days)",
      statusForValue: () => status,
    })}
    <div class="single-analyte-notes pax8-notes">
      <div class="report-note-heading">Comments:</div>
      <p>PAX8 is a transcription factor expressed in tissues including the thyroid, kidney, and female reproductive tract. In immunohistochemistry it can help establish the likely origin of tumour cells, particularly thyroid, renal, and MÃ¼llerian tumours.</p>
      <div class="report-note-heading">Interpretation:</div>
      <ol>
        <li><strong>Positive PAX8 expression:</strong> indicates that PAX8 protein is detected in the examined cells and may support a relevant tissue of origin.</li>
        <li><strong>Negative PAX8 expression:</strong> indicates that PAX8 protein is not detected in the examined cells; it does not independently exclude disease.</li>
        <li><strong>Clinical correlation:</strong> interpret alongside morphology, other immunostains, imaging, and the patient's clinical findings.</li>
      </ol>
    </div>
  `;
}

function buildGalectin3ReportBody(test) {
  return `
    ${buildDrlogyStyleAnalyteResultTable(test, {
      tableClass: "single-analyte-table galectin3-table",
      investigation: "GALECTIN-3",
      aliases: ["Galectin-3", "Galectin 3", "Result"],
      method: "Immunohistochemistry",
      defaultRange: "< 22.10",
      defaultUnit: "ng/mL",
      sampleType: "Serum (1 ml)",
      turnaroundText: "2 days (Normal: 1 - 8 days)",
    })}
    <table class="galectin-age-table"><thead><tr><th>Age group</th><th>Reference values (ng/mL)</th></tr></thead><tbody><tr><td>&lt; 2 years</td><td>Not established</td></tr><tr><td>2 - 17 years</td><td>&lt; 25.00</td></tr><tr><td>&ge; 18 years</td><td>&lt; 22.10</td></tr></tbody></table>
    <div class="single-analyte-notes galectin3-notes">
      <div class="report-note-heading">Comments:</div>
      <p>Galectin-3 is associated with inflammation and fibrosis and may assist in risk assessment for heart failure and other fibrotic or inflammatory conditions. It should be interpreted with clinical assessment and other investigations.</p>
      <div class="report-note-heading">Useful for:</div>
      <ol><li>Supporting prognosis and risk stratification in heart failure.</li><li>Identifying patients who may need closer follow-up.</li><li>Supporting assessment of inflammatory or fibrotic disease.</li></ol>
      <div class="report-note-heading">High levels may be seen in:</div>
      <ul><li>Heart failure and other cardiovascular disease.</li><li>Inflammation or infection.</li><li>Kidney or liver dysfunction.</li><li>Some cancers and autoimmune, pulmonary, or metabolic disorders.</li></ul>
    </div>
  `;
}

function buildHer2ReportBody(test) {
  const valueFor = (aliases, fallback = "-") => {
    const parameter = findReportParameter(test, aliases) || {};
    return String(parameter.value || "").trim() || fallback;
  };
  const specimen = valueFor(["Specimen", "Sample Type"], test.sample_type || "Formalin fixed paraffin embedded tissue block");
  const blockNo = valueFor(["Block No.", "Block Number"]);
  const fixation = valueFor(["Fixation Time", "Fixation"]);
  const indication = valueFor(["Clinical Indication", "Indication"]);
  const cells = valueFor(["Cells Counted", "Cells Count"]);
  const her2Signals = valueFor(["Total HER2 Signals", "Total Her2 Signals", "HER2 Signals"]);
  const cep17Signals = valueFor(["Total CEP17 Signals", "Total Cep17 Signals", "CEP17 Signals"]);
  const her2Mean = valueFor(["HER2 Signals Mean per Cell", "HER2 Mean per Cell"]);
  const cep17Mean = valueFor(["CEP17 Signals Mean per Cell", "CEP17 Mean per Cell"]);
  const ratio = valueFor(["HER2/neu:CEP17 Ratio", "HER2 CEP17 Ratio"]);
  const status = getHer2Status(ratio);
  const enteredInterpretation = valueFor(["Interpretation", "HER2 Interpretation"], "");
  const interpretation = enteredInterpretation || (status ? `Tumour cells are ${status.label} for HER2 gene amplification.` : "Interpret together with the specimen morphology and laboratory quality controls.");

  return `
    <div class="her2-heading">HER2 (ERBB2) AMPLIFICATION<br>FLUORESCENCE IN-SITU HYBRIDIZATION (FISH)</div>
    <table class="her2-detail-table"><tbody>
      <tr><th>Specimen</th><td>${escapeHtml(specimen)}</td></tr>
      <tr><th>Block no.</th><td>${escapeHtml(blockNo)}</td></tr>
      <tr><th>Fixation time</th><td>${escapeHtml(fixation)}</td></tr>
      <tr><th>Clinical indication</th><td>${escapeHtml(indication)}</td></tr>
      <tr><th>Result</th><td>HER2 gene:CEP17 ratio: <strong class="${status?.className || ""}">${escapeHtml(ratio)}</strong></td></tr>
      <tr><th>Interpretation</th><td>${escapeHtml(interpretation)}</td></tr>
    </tbody></table>
    <table class="her2-calculation-table"><tbody>
      <tr><td>Cells counted</td><td>${escapeHtml(cells)}</td></tr>
      <tr><td>Total HER2 signals</td><td>${escapeHtml(her2Signals)}</td></tr>
      <tr><td>Total CEP17 signals</td><td>${escapeHtml(cep17Signals)}</td></tr>
      <tr><td>HER2 signals mean per cell</td><td>${escapeHtml(her2Mean)}</td></tr>
      <tr><td>CEP17 signals mean per cell</td><td>${escapeHtml(cep17Mean)}</td></tr>
      <tr><td>HER2/neu:CEP17 ratio</td><td>${escapeHtml(ratio)}</td></tr>
    </tbody></table>
    <div class="single-analyte-notes her2-notes">
      <div class="report-note-heading">Comment:</div>
      <p>HER2 (ERBB2) amplification is identified in a subset of breast cancers and can guide targeted therapy decisions. FISH results must be reviewed with histopathology and other HER2 testing in accordance with the laboratory's validated criteria.</p>
      <div class="report-note-heading">Uses:</div>
      <ul><li>Confirmation of HER2 amplification where immunohistochemistry is equivocal or requires correlation.</li><li>Support for treatment planning in primary or metastatic breast carcinoma.</li><li>Assessment of discordant or unusual HER2 expression patterns.</li></ul>
    </div>
  `;
}

function buildDcpReportBody(test) {
  return `
    ${buildDrlogyStyleAnalyteResultTable(test, {
      tableClass: "single-analyte-table dcp-table",
      investigation: "DES-GAMMA CARBOXY PROTHROMBIN (DCP)",
      aliases: ["Des-Gamma Carboxy Prothrombin (DCP)", "DCP", "PIVKA II", "Result"],
      method: "CMIA",
      defaultRange: "< 40.00",
      defaultUnit: "mAU/mL",
      sampleType: "Serum (3 ml)",
      turnaroundText: "4 hrs (Normal: 4 - 8 hrs)",
    })}
    <div class="single-analyte-notes dcp-notes">
      <div class="report-note-heading">Note:</div>
      <ol><li>Heterophilic antibodies and mouse monoclonal antibodies may interfere with immunoassays.</li><li>Interpret results with medical history, clinical presentation, and other test findings.</li><li>Vitamin K analogues or antagonists, antimicrobial therapy, poor vitamin K intake, and alcohol use may affect results.</li></ol>
      <div class="report-note-heading">Comment:</div>
      <p>Des-gamma carboxyprothrombin, also known as PIVKA-II, is a biomarker that may be elevated in hepatocellular carcinoma. It can be used with AFP and imaging as part of a clinical assessment; it is not diagnostic when used alone.</p>
      <div class="report-note-heading">Usages:</div>
      <ol><li>Assessment of hepatocellular carcinoma risk in chronic liver disease.</li><li>Supporting diagnosis and prognosis in hepatocellular carcinoma.</li><li>Monitoring response to therapy when clinically indicated.</li></ol>
    </div>
  `;
}

function buildAfpTumorMarkerReportBody(test) {
  return `
    ${buildSingleAnalyteResultTable(test, {
      tableClass: "single-analyte-table afp-tumor-table",
      investigation: "AFP, TUMOR MARKER, SERUM",
      aliases: ["AFP, Tumor Marker, Serum", "AFP", "Alpha Feto Protein", "Result"],
      method: "CMIA",
      defaultRange: "200.00 - 400.00",
      defaultUnit: "ng/dL",
    })}
    <div class="single-analyte-notes afp-tumor-notes">
      <div class="report-note-heading">Note:</div>
      <ol><li>This test is not recommended as a general-population cancer screening test.</li><li>False positive or false negative results may occur, including in patients receiving mouse monoclonal antibodies.</li><li>AFP tumour-marker results are not recommended for interpretation during pregnancy.</li><li>Correlate all values with clinical findings and other investigations.</li></ol>
      <div class="report-note-heading">Clinical Use:</div>
      <ul><li>Monitoring therapy and prognosis in hepatocellular carcinoma.</li><li>Supporting classification and monitoring of non-seminomatous germ-cell tumours with HCG.</li><li>Assessment for tumour recurrence or residual disease when clinically indicated.</li></ul>
      <div class="report-note-heading">Increased Levels:</div>
      <ul><li>Germ-cell tumours and primary hepatocellular carcinoma.</li><li>Teratocarcinoma and some gastrointestinal malignancies.</li><li>Benign hepatic conditions including viral hepatitis and cirrhosis.</li></ul>
    </div>
  `;
}

function buildCaMarkerReportBody(test, definition) {
  const tableRows = definition.rows.map(([label, value]) => `<tr><td>${label}</td><td>${value}</td></tr>`).join("");
  return `
    ${buildSingleAnalyteResultTable(test, {
      tableClass: `single-analyte-table ${definition.className}`,
      investigation: definition.investigation,
      aliases: definition.aliases,
      method: "CMIA",
      defaultRange: definition.range,
      defaultUnit: "U/mL",
    })}
    <div class="single-analyte-notes ca-marker-notes">
      <div class="report-note-heading">Note:</div>
      <ol><li>This test is not recommended as a general-population screening test.</li><li>False positive and false negative results may occur in patients receiving mouse monoclonal antibodies.</li><li>Results should not be treated as absolute evidence of the presence or absence of malignancy and require clinical correlation.</li></ol>
      <div class="report-note-heading">Clinical Use:</div>
      <ul>${definition.uses.map((item) => `<li>${item}</li>`).join("")}</ul>
    </div>
    <table class="tumor-marker-reference-table"><thead><tr><th>${definition.tableHeading}</th><th>${definition.valueHeading}</th></tr></thead><tbody>${tableRows}</tbody></table>
  `;
}

function buildTroponinReportBody(test, type) {
  const isI = String(type).toUpperCase() === "I";
  const definition = isI
    ? {
      investigation: "TROPONIN- I, HIGH SENSITIVE, SERUM",
      aliases: ["Troponin - I, High Sensitive, Serum", "Troponin I", "Troponin-I", "Result"],
      range: "< 26.20",
      method: "CMIA",
      rows: [["&lt; 26.20", "The upper reference limit (99th percentile) for high-sensitive Troponin I (hsTnI)."], ["&lt; 26.20 and pain &lt; 6 hrs", "Repeat sampling after 3 hours; a significant change in the initial value may support myocardial infarction assessment."], ["&gt; 26.20 - 262.00", "Repeat sampling after 3 hours; interpret change with symptoms, ECG, and clinical findings."], ["&gt; 262.00", "A markedly elevated value requires urgent clinical correlation for myocardial injury."]],
      comment: "Troponin I is a cardiac biomarker of myocardial injury. Serial values and the clinical presentation are required to differentiate acute coronary syndromes from chronic cardiac disease or non-ischaemic injury.",
    }
    : {
      investigation: "TROPONIN- T, HIGH SENSITIVE, SERUM",
      aliases: ["Troponin - T, High Sensitive, Serum", "Troponin T", "Troponin-T", "Result"],
      range: "< 14.00",
      method: "ECLIA",
      rows: [["&lt; 14.00", "The upper reference limit (99th percentile) for high-sensitive Troponin T (hsTnT)."], ["&gt; 14.00 - &lt; 53.00", "Repeat sampling after 3 hours; assess change from the initial value."], ["&gt; 53.00 - 100.00", "Repeat sampling after 3 hours; interpret serial change with clinical findings."], ["&gt; 100.00", "A markedly elevated value requires urgent clinical correlation for myocardial injury."]],
      comment: "Troponin T is a highly sensitive marker of myocardial injury. Results may remain elevated after cardiac injury and can also rise in some non-ischaemic conditions, including renal dysfunction.",
    };
  const rows = definition.rows.map(([initial, remark]) => `<tr><td>${initial}</td><td>${remark}</td></tr>`).join("");
  return `
    ${buildSingleAnalyteResultTable(test, {
      tableClass: "single-analyte-table troponin-table",
      investigation: definition.investigation,
      aliases: definition.aliases,
      method: definition.method,
      defaultRange: definition.range,
      defaultUnit: "pg/mL",
    })}
    <div class="single-analyte-heading">Interpretation:</div>
    <table class="troponin-interpretation-table"><thead><tr><th>Initial result in pg/mL</th><th>Remark</th></tr></thead><tbody>${rows}</tbody></table>
    <div class="single-analyte-notes troponin-notes">
      <div class="report-note-heading">Note:</div>
      <ul><li>Serial sampling is recommended to assess the temporal rise or fall in troponin levels.</li><li>A single result may be insufficient to diagnose or exclude myocardial infarction, particularly soon after symptoms begin.</li><li>False positive results can occur with rheumatoid factor or heterophile antibodies.</li></ul>
      <div class="report-note-heading">Comments:</div>
      <p>${definition.comment}</p>
      <div class="report-note-heading">Increased Levels:</div>
      <p>Congestive heart failure, cardiomyopathy, myocarditis, cardiac contusion, cardiac procedures, renal failure, pulmonary embolism, sepsis, rhabdomyolysis, and other causes of myocardial injury.</p>
    </div>
  `;
}

function getDengueIndexStatus(value, { negativeMax, equivocalMax }) {
  const numericValue = Number(String(value || "").replace(/,/g, ""));
  if (!Number.isFinite(numericValue)) return null;
  if (numericValue < negativeMax) return { label: "Negative", className: "normal-val" };
  if (numericValue <= equivocalMax) return { label: "Equivocal", className: "low-val" };
  return { label: "Positive", className: "high-val" };
}

function getInfectiousResult(test, aliases) {
  return findReportParameter(test, aliases) || {};
}

function getNumericValue(value) {
  const numericValue = Number.parseFloat(String(value || "").replace(/,/g, "").trim());
  return Number.isFinite(numericValue) ? numericValue : null;
}

function buildInfectiousResultTable({
  test,
  investigation,
  aliases,
  method,
  unit = "",
  resultMarkup,
  referenceMarkup = "",
}) {
  const result = getInfectiousResult(test, aliases);
  const value = String(result.value || "").trim() || "-";

  return `
    <table class="results-table infectious-result-table">
      <thead>
        <tr>
          <th style="width: 40%">Investigation</th>
          <th style="width: 25%">Result</th>
          <th style="width: 25%">Reference Value</th>
          <th style="width: 10%">Unit</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><strong>${investigation}</strong><div class="single-analyte-method">${method}</div></td>
          <td>${resultMarkup(value)}</td>
          <td>${referenceMarkup}</td>
          <td>${escapeHtml(unit)}</td>
        </tr>
      </tbody>
    </table>
  `;
}

function buildDengueReportBody(test, assay) {
  const definitions = {
    ns1: {
      investigation: "DENGUE FEVER ANTIGEN, NS1, EIA, SERUM",
      aliases: ["Dengue Fever Antigen, NS1, EIA, Serum", "Dengue NS1", "NS1 Antigen", "Result"],
      negativeMax: 0.9,
      equivocalMax: 1.1,
      range: "< 0.90",
      rows: [
        ["Negative (&lt; 0.90)", "No detectable Dengue NS1 antigen.The Result does not rule out Dengue infection. An additional sample should be tested for IgG &amp; IgM serology in 7-14 days."],
        ["Equivocal (0.90 - 1.10)", "Repeat sample after 1 week"],
        ["Positive (&gt; 1.10)", "Presence of detectable dengue NS1 antigen. Dengue IgG &amp; IgM serology assay should be performed on follow up samples after 5-7 days of onset of fever, to confirm dengue infection."],
      ],
      note: "The recommended test is NS1 Antigen by ELISA in the first 5 days of fever. After 7-10 days of fever, the recommended test is Dengue fever antibodies IgG &amp; IgM by ELISA.",
    },
    igg: {
      investigation: "DENGUE FEVER ANTIBODY, IgG, SERUM",
      aliases: ["Dengue Fever Antibody, IgG, Serum", "Dengue IgG", "Dengue Antibody IgG", "Result"],
      negativeMax: 1.8,
      equivocalMax: 2.2,
      range: "< 1.80",
      rows: [
        ["Negative (&lt; 1.80)", "No detectable IgG antibody indicating a presumptive evidence that the patients does not have secondary Dengue infection."],
        ["Equivocal (1.80 - 2.20)", "Retesting advised."],
        ["Positive (&gt; 2.20)", "IgG antibody detected indicating presumptive evidence that the patient has been recently exposed to/or currently infected with dengue virus"],
      ],
      note: "Recommended test is NS1 Antigen by ELISA in the first 5 days of fever. After 7-10 days of fever, the recommended test is Dengue fever antibodies IgG &amp; IgM by ELISA<br>2. Cross reactivity is seen in the Flavivirus group between Dengue virus, Murray Valley encephalitis, Japanese encephalitis, Yellow fever &amp; West Nile viruses.",
    },
    igm: {
      investigation: "DENGUE FEVER ANTIBODY, IgM, SERUM",
      aliases: ["Dengue Fever Antibody, IgM, Serum", "Dengue IgM", "Dengue Antibody IgM", "Result"],
      negativeMax: 0.9,
      equivocalMax: 1.1,
      range: "< 0.90",
      rows: [
        ["Negative (&lt; 0.90)", "No detectable IgM antibody. Result does not rule out Dengue infection. Additional sample to be tested after 7-14 days if infection is suspected."],
        ["Equivocal (0.90 - 1.10)", "Retesting advised."],
        ["Positive (&gt; 1.10)", "IgM antibody detected. Suggestive of Primary / Secondary Dengue infection."],
      ],
      note: "Recommended test is NS1 Antigen by ELISA in the first 5 days of fever. After 7-10 days of fever, the recommended test is Dengue fever antibodies IgG &amp; IgM by ELISA<br>2. Cross-reactivity is seen in the Flavivirus group between Dengue virus, Murray Valley encephalitis, Japanese encephalitis, Yellow fever &amp; West Nile viruses.",
    },
  };
  const definition = definitions[assay];
  const rows = definition.rows.map(([result, remark]) => `<tr><td>${result}</td><td>${remark}</td></tr>`).join("");
  const result = getInfectiousResult(test, definition.aliases);
  const value = String(result.value || "").trim() || "-";
  const numericValue = getNumericValue(value);
  const isAbnormal = Number.isFinite(numericValue) && numericValue >= definition.negativeMax;
  const isNs1 = assay === "ns1";
  const referenceMarkup = isNs1 ? escapeHtml(definition.range) : "";
  const dengueComment = "Dengue viruses belong to the family Flaviviridae and have 4 subtypes (1-4). Dengue virus is transmitted by the mosquito Aedes aegypti and Aedes albopictus, widely distributed in Tropical and Subtropical areas of the world. Dengue is considered to be the most important arthropod borne viral disease due to the human morbidity and mortality it causes. The disease may be subclinical, self limiting, febrile or may progress to a severe form of Dengue hemorrhagic fever or Dengue shock syndrome.";
  const antibodyTimingTable = (assay === "igg" || assay === "igm") ? `
    <table class="infectious-interpretation-table dengue-timing-table">
      <thead>
        <tr><th rowspan="2">Dengue Infection</th><th colspan="2">Antibody Detected Post Illness</th></tr>
        <tr><th>IgG</th><th>IgM</th></tr>
      </thead>
      <tbody>
        <tr><td>Primary</td><td>5th-10th day</td><td>14th day &amp; persists for life</td></tr>
        <tr><td>Secondary</td><td>4th-5th day</td><td>1st-2nd day</td></tr>
      </tbody>
    </table>
  ` : "";

  return `
    ${buildInfectiousResultTable({
      test,
      investigation: definition.investigation,
      aliases: definition.aliases,
      method: "ELISA",
      unit: "Index",
      referenceMarkup,
      resultMarkup: () => `<span class="${isAbnormal ? "high-val" : ""}">${escapeHtml(value)}</span>${isNs1 && isAbnormal ? ` <span class="single-analyte-status high-val">High</span>` : ""}`,
    })}
    <div class="single-analyte-heading">Interpretation:</div>
    <table class="infectious-interpretation-table dengue-interpretation-table"><thead><tr><th>Result in index</th><th>Remarks</th></tr></thead><tbody>${rows}</tbody></table>
    <div class="single-analyte-notes infectious-notes">
      <div class="report-note-heading">Note:</div><p>${definition.note}</p>
      <div class="report-note-heading">Comments:</div><p>${dengueComment}</p>
    </div>
    ${antibodyTimingTable}
  `;
}

function getRastStatus(value) {
  const numericValue = Number(String(value || "").replace(/,/g, ""));
  if (!Number.isFinite(numericValue)) return null;
  if (numericValue <= 64) return { label: "Normal", className: "normal-val" };
  if (numericValue > 100) return { label: "Very High", className: "high-val" };
  return { label: "High", className: "high-val" };
}

function buildRastReportBody(test) {
  const rows = [
    ["&lt; 0.10", "Undetectable", "Unlikely"], ["0.10 - 0.50", "Very low", "Uncommon"], ["0.50 - 2.00", "Low", "Low"], ["2.00 - 15.00", "Moderate", "Common"], ["15.00 - 50.00", "High", "High"], ["50.00 - 100.00", "Very high", "Very high"], ["&gt; 100.00", "Very high", "Very high"],
  ].map(([value, level, relation]) => `<tr><td>${value}</td><td>${level}</td><td>${relation}</td></tr>`).join("");

  return `
    ${buildSingleAnalyteResultTable(test, {
      tableClass: "single-analyte-table rast-table",
      investigation: "IMMUNOGLOBULIN IgE, SERUM",
      aliases: ["Immunoglobulin IgE, Serum", "Total IgE", "Immunoglobulin E", "IgE", "Result"],
      method: "ImmunoCAP, FEIA",
      defaultRange: "< 64.00",
      defaultUnit: "kUA/L",
      statusForValue: getRastStatus,
    })}
    <div class="single-analyte-notes infectious-notes">
      <div class="report-note-heading">Comments:</div><p>Total IgE can be raised in allergic and non-allergic conditions. It is not diagnostic of a specific allergy and should be interpreted with the patient history and, when appropriate, allergen-specific testing.</p>
      <div class="report-note-heading">Allergen-specific IgE interpretation:</div>
    </div>
    <table class="infectious-interpretation-table rast-interpretation-table"><thead><tr><th>Quantitative result in kUA/L</th><th>Level of allergen-specific antibody</th><th>Symptom relation</th></tr></thead><tbody>${rows}</tbody></table>
  `;
}

function getWidalStatus(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return null;
  if (normalized.includes("non-reactive") || normalized.includes("nonreactive") || normalized.includes("negative")) return { label: "Non-Reactive", className: "normal-val" };
  if (normalized.includes("reactive") || normalized.includes("positive")) return { label: "Reactive", className: "high-val" };
  return null;
}

function buildWidalReportBody(test) {
  const definitions = [
    ["Salmonella typhi O (TO)", ["Salmonella typhi O (TO)", "S. typhi O", "TO"], "> 1:80"],
    ["Salmonella typhi H (TH)", ["Salmonella typhi H (TH)", "S. typhi H", "TH"], "> 1:160"],
    ["Salmonella paratyphi A, H (AH)", ["Salmonella paratyphi A, H (AH)", "S. paratyphi A H", "AH"], "> 1:320"],
    ["Salmonella paratyphi B, H (BH)", ["Salmonella paratyphi B, H (BH)", "S. paratyphi B H", "BH"], "> 1:320"],
  ];
  const rows = definitions.map(([label, aliases, defaultRange]) => {
    const parameter = findReportParameter(test, aliases) || {};
    const value = parameter.value || "-";
    const status = getWidalStatus(value);
    const range = parameter.normal_range && parameter.normal_range !== "N/A" ? parameter.normal_range : defaultRange;
    const unit = parameter.unit && parameter.unit !== "N/A" ? parameter.unit : "Titre";
    return `<tr><td><strong>${label}</strong></td><td><span class="${status?.className || ""}">${escapeHtml(status?.label || value)}</span></td><td>${escapeHtml(range)}</td><td>${escapeHtml(unit)}</td></tr>`;
  }).join("");

  return `
    <table class="results-table widal-table"><thead><tr><th style="width:34%">Investigation</th><th style="width:27%">Result</th><th style="width:25%">Reference Value</th><th style="width:14%">Unit</th></tr></thead><tbody>
      <tr class="single-analyte-sample-row"><td><strong>Sample Type</strong></td><td>Serum</td><td colspan="2"><strong>TAT :</strong> 8 hrs (Normal: 8 - 12 hrs)</td></tr>${rows}
    </tbody></table>
    <div class="single-analyte-heading">Interpretation:</div>
    <table class="infectious-interpretation-table widal-interpretation-table"><thead><tr><th>Result</th><th>Remarks</th></tr></thead><tbody><tr><td><strong>Reactive</strong></td><td>Indicates detectable agglutinating antibodies against the reported Salmonella antigen.</td></tr><tr><td><strong>Non-Reactive</strong></td><td>Indicates no detectable agglutination at the tested dilution.</td></tr></tbody></table>
    <div class="single-analyte-notes infectious-notes"><div class="report-note-heading">Note:</div><ol><li>Rising titres in paired sera can be more informative than a single result.</li><li>Interpret results with symptoms, disease prevalence, vaccination history, and other microbiology findings.</li></ol><div class="report-note-heading">Comments:</div><p>Widal slide agglutination is a supportive serologic test and should not be used alone to diagnose enteric fever. Where clinically indicated, confirmatory culture or locally recommended testing should be considered.</p></div>
  `;
}

function buildCrpReportBody(test) {
  return `
    ${buildSingleAnalyteResultTable(test, {
      tableClass: "single-analyte-table crp-table",
      investigation: "C-REACTIVE PROTEIN",
      aliases: ["C-Reactive Protein", "CRP", "C Reactive Protein", "Result"],
      method: "Immunoturbidimetry",
      defaultRange: "0.0 - 5.0",
      defaultUnit: "mg/dL",
    })}
    <div class="single-analyte-notes infectious-notes"><div class="report-note-heading">Interpretation:</div><ol><li>CRP is a non-specific marker that may rise with infection, inflammation, tissue injury, and other conditions.</li><li>Results should be interpreted with the clinical history, examination findings, and other investigations.</li><li>For cardiovascular-risk assessment, use only a validated high-sensitivity CRP method and the relevant clinical protocol.</li></ol><div class="report-note-heading">Comments:</div><p>Serial CRP measurements may help follow an inflammatory response when used with clinical assessment; the result does not identify the site or cause of inflammation.</p></div>
  `;
}

function getToxoplasmaStatus(value, antibodyClass) {
  const numericValue = Number(String(value || "").replace(/,/g, "").trim());
  if (!Number.isFinite(numericValue)) return null;

  const thresholds = antibodyClass === "IgM"
    ? { negative: 0.5, equivocal: 0.6 }
    : { negative: 1.6, equivocal: 3 };

  if (numericValue < thresholds.negative) return { label: "Negative", className: "normal-val" };
  if (numericValue < thresholds.equivocal) return { label: "Equivocal", className: "equivocal-val" };
  return { label: "Positive", className: "high-val" };
}

function buildBeta2GlycoproteinPanelReportBody(test) {
  if (isFnacTest(test)) return buildFnacReportBody(test);
  if (isPapSmearTest(test)) return buildPapSmearReportBody(test);

  const definitions = [
    { label: "Beta 2 Glycoprotein IgG", aliases: ["Beta 2 Glycoprotein IgG", "Beta-2 Glycoprotein IgG", "B2GPI IgG"], unit: "SGU" },
    { label: "Beta 2 Glycoprotein IgM", aliases: ["Beta 2 Glycoprotein IgM", "Beta-2 Glycoprotein IgM", "B2GPI IgM"], unit: "SMU" },
    { label: "Beta 2 Glycoprotein IgA", aliases: ["Beta 2 Glycoprotein IgA", "Beta-2 Glycoprotein IgA", "B2GPI IgA"], unit: "SAU" },
  ];
  const rows = definitions.map((definition) => {
    const parameter = findReportParameter(test, definition.aliases) || {};
    const value = parameter.value || "-";
    const range = parameter.normal_range || "< 20.00";
    const unit = parameter.unit || definition.unit;
    const status = getReferenceStatus(value, range);
    return `<tr><td>${escapeHtml(definition.label)}</td><td><span class="${status?.className || ""}">${escapeHtml(value)}</span>${status ? ` <span class="report-result-status ${status.className}">${status.label}</span>` : ""}</td><td>${escapeHtml(range)}</td><td>${escapeHtml(unit)}</td></tr>`;
  }).join("");

  return `
    <table class="results-table b2gpi-table">
      <thead><tr><th style="width: 43%">Investigation</th><th style="width: 24%">Result</th><th style="width: 22%">Reference Value</th><th style="width: 11%">Unit</th></tr></thead>
      <tbody>
        <tr class="single-analyte-sample-row"><td><strong>Sample Type</strong></td><td>${escapeHtml(test.sample_type || "Serum (2 ml)")}</td><td colspan="2"><strong>TAT :</strong> 1 day (Normal: 1 - 3 days)</td></tr>
        <tr class="b2gpi-section"><td colspan="4"><strong>BETA 2 GLYCOPROTEIN I, PANEL</strong><div class="single-analyte-method">EIA</div></td></tr>
        ${rows}
      </tbody>
    </table>
    <div class="report-template-notes">
      <div class="report-note-heading">2006 INTERNATIONAL CONSENSUS STATEMENT ON CLASSIFICATION OF DEFINITE APS</div>
      <table class="report-reference-table b2gpi-criteria-table"><thead><tr><th>Clinical Criteria</th><th>Laboratory Criteria</th></tr></thead><tbody>
        <tr><td>Arterial/venous thrombosis</td><td>Cardiolipin antibodies (aCL)</td></tr>
        <tr><td>Fetal loss</td><td>Beta 2 Glycoprotein 1 antibodies</td></tr>
        <tr><td>Premature birth</td><td>Lupus anticoagulant (LA)</td></tr>
      </tbody></table>
      <div class="report-note-heading">Comments:</div>
      <p>This particular test aims to detect the presence of IgG antibodies to Beta-2 glycoprotein, which are associated with arterial and venous thrombosis as well as recurrent abortions. The new International classification criteria for Antiphospholipid syndrome (APS) emphasize the role of Beta-2 glycoprotein for two key reasons:</p>
      <ol>
        <li>Beta-2 Glycoprotein antibodies may be the sole antibody present in 10% of patients with APS.</li>
        <li>Beta-2 Glycoprotein antibodies exhibit high specificity for APS, unlike Anticardiolipin antibodies, which may yield positive results in certain infectious diseases.</li>
      </ol>
      <div class="report-note-heading">Indications:</div>
      <ul>
        <li>Presence of a clinical history suggestive of arterial or venous thrombosis</li>
        <li>History of recurrent fetal loss, intrauterine growth restriction, or premature birth</li>
        <li>Thrombocytopenia</li>
      </ul>
      <p>It is crucial that the Laboratory criteria are observed on two or more occasions 12 weeks apart for a confirmed diagnosis of APS.</p>
    </div>
  `;
}

function buildToxoplasmaAntibodiesPanelReportBody(test) {
  const definitions = [
    { label: "Toxoplasma IgG", aliases: ["Toxoplasma IgG", "Toxo IgG"], antibodyClass: "IgG", range: "< 1.60", unit: "IU/mL" },
    { label: "Toxoplasma IgM", aliases: ["Toxoplasma IgM", "Toxo IgM"], antibodyClass: "IgM", range: "< 0.50", unit: "Index" },
  ];
  const rows = definitions.map((definition) => {
    const parameter = findReportParameter(test, definition.aliases) || {};
    const value = parameter.value || "-";
    const status = getToxoplasmaStatus(value, definition.antibodyClass);
    return `<tr><td><strong>${escapeHtml(definition.label)}</strong></td><td><span class="${status?.className || ""}">${escapeHtml(value)}</span>${status ? ` <span class="report-result-status ${status.className}">${status.label}</span>` : ""}</td><td>${escapeHtml(parameter.normal_range || definition.range)}</td><td>${escapeHtml(parameter.unit || definition.unit)}</td></tr>`;
  }).join("");

  return `
    <table class="results-table toxoplasma-table">
      <thead><tr><th style="width: 35%">Investigation</th><th style="width: 28%">Result</th><th style="width: 25%">Reference Value</th><th style="width: 12%">Unit</th></tr></thead>
      <tbody>
        <tr class="toxoplasma-section"><td colspan="4"><strong>TOXOPLASMA ANTIBODIES PANEL</strong><div class="single-analyte-method">CMIA</div></td></tr>
        <tr class="single-analyte-sample-row"><td><strong>Sample Type</strong></td><td>${escapeHtml(test.sample_type || "Serum (2 ml)")}</td><td colspan="2"><strong>TAT :</strong> 1 hr (Normal: 1 - 4 hrs)</td></tr>
        ${rows}
      </tbody>
    </table>
    <div class="report-template-notes">
      <table class="report-reference-table toxoplasma-threshold-table"><thead><tr><th>Infection</th><th>Negative</th><th>Equivocal</th><th>Positive</th></tr></thead><tbody>
        <tr><td>Toxoplasma IgG (IU/mL)</td><td>&lt; 1.60</td><td>1.60 - &lt; 3.00</td><td>&ge; 3.00</td></tr>
        <tr><td>Toxoplasma IgM (Index)</td><td>&lt; 0.50</td><td>0.50 - &lt; 0.60</td><td>&ge; 0.60</td></tr>
      </tbody></table>
      <table class="report-reference-table toxoplasma-remark-table"><thead><tr><th>Toxoplasma IgG</th><th>Toxoplasma IgM</th><th>Remark</th></tr></thead><tbody>
        <tr><td><strong>Negative</strong></td><td><strong>Negative</strong></td><td>No infection or very early infection; no previous exposure</td></tr>
        <tr><td><strong>Positive</strong></td><td><strong>Negative</strong></td><td>Acute infection</td></tr>
        <tr><td><strong>Positive</strong></td><td><strong>Positive</strong></td><td>Acute infection; Chronic infection; could indicate re-activation; IgM may be positive for several months after the infection resolves. Toxoplasma IgG avidity test will help differentiate between acute &amp; chronic infection.</td></tr>
        <tr><td><strong>Negative</strong></td><td><strong>Positive</strong></td><td>Past infection</td></tr>
      </tbody></table>
      <div class="report-note-heading">Comments:</div>
      <p>Toxoplasma gondii is an intracellular parasite that can only thrive within host cells and has a wide range of intermediate hosts, including humans. Human infection with this parasite, known as toxoplasmosis, typically occurs through the ingestion of food or water contaminated with cat feces or by consuming undercooked meat containing viable oocysts. Vertical transmission of the parasite through the placenta can also result in congenital toxoplasmosis.</p>
      <p>In most cases, toxoplasmosis in humans is asymptomatic. After an initial infection, Toxoplasma gondii can remain latent within the host for the host's lifetime, with the risk of reactivation being highest among individuals with compromised immune systems. Symptomatic presentations of toxoplasmosis in humans can include lymphadenopathy, encephalitis, myocarditis, and pneumonitis. The diagnosis of ocular toxoplasmosis can be aided by the presence of Toxoplasma IgG in the serum of individuals with eye lesions. Additionally, confirming the diagnosis of ocular toxoplasmosis can involve assessing antibody levels and detecting parasite DNA in the aqueous humor of the eye.</p>
      <p>Congenital toxoplasmosis occurs when a pregnant woman passes the infection to her fetus, either after acquiring a primary infection during pregnancy or, less commonly, when a previously acquired infection is reactivated. The transmission rate to the fetus can vary, typically ranging from 30% to 50%, depending on the stage of pregnancy. A definitive diagnosis of fetal infection involves the demonstration of Toxoplasma-specific IgM and IgA antibodies in fetal serum or the isolation of Toxoplasma from fetal white blood cells. This confirms the presence of the parasite in the fetus.</p>
    </div>
  `;
}

function getTorchProfileStatus(value, thresholds) {
  const numericValue = Number(String(value || "").replace(/,/g, "").trim());
  if (!Number.isFinite(numericValue)) return null;
  if (numericValue < thresholds.negative) return { label: "Negative", className: "normal-val" };
  if (thresholds.equivocal && numericValue < thresholds.equivocal) return { label: "Equivocal", className: "equivocal-val" };
  return { label: "Positive", className: "high-val" };
}

function buildTorchProfileReportBody(test) {
  const definitions = [
    { label: "Toxoplasma IgG", aliases: ["Toxoplasma IgG", "Toxo IgG"], unit: "IU/mL", range: "< 7.20", thresholds: { negative: 7.2, equivocal: 8.8 }, interpretation: ["< 7.20", "7.20- <8.80", "≥8.80"] },
    { label: "Toxoplasma IgM", aliases: ["Toxoplasma IgM", "Toxo IgM"], unit: "AU/mL", range: "< 10.00", thresholds: { negative: 10 }, interpretation: ["< 10.00", "", "≥10.00"] },
    { label: "Rubella IgG", aliases: ["Rubella IgG"], unit: "IU/mL", range: "< 7.00", thresholds: { negative: 7, equivocal: 10 }, interpretation: ["< 7.00", "7.00- <10.00", "≥10.00"] },
    { label: "Rubella IgM", aliases: ["Rubella IgM"], unit: "AU/mL", range: "< 20.00", thresholds: { negative: 20, equivocal: 25 }, interpretation: ["< 20.00", "20.00- <25.00", "≥25.00"] },
    { label: "Cytomegalovirus IgG", aliases: ["Cytomegalovirus IgG", "CMV IgG"], unit: "U/mL", range: "< 12.00", thresholds: { negative: 12, equivocal: 14 }, interpretation: ["< 12.00", "12.00- <14.00", "≥14.00"] },
    { label: "Cytomegalovirus IgM", aliases: ["Cytomegalovirus IgM", "CMV IgM"], unit: "U/mL", range: "< 18.00", thresholds: { negative: 18, equivocal: 22 }, interpretation: ["< 18.00", "18.00- <22.00", "≥22.00"] },
    { label: "Herpes simplex virus 1+2 IgG", aliases: ["Herpes simplex virus 1+2 IgG", "HSV 1+2 IgG", "HSV IgG"], unit: "Index", range: "< 0.90", thresholds: { negative: 0.9, equivocal: 1.1 }, interpretation: ["< 0.90", "0.90- <1.10", "≥1.10"] },
    { label: "Herpes simplex virus 1+2 IgM", aliases: ["Herpes simplex virus 1+2 IgM", "HSV 1+2 IgM", "HSV IgM"], unit: "Index", range: "< 0.90", thresholds: { negative: 0.9, equivocal: 1.1 }, interpretation: ["< 0.90", "0.90- <1.10", "≥1.10"] },
  ];

  const rows = definitions.map((definition) => {
    const parameter = findReportParameter(test, definition.aliases) || {};
    const value = parameter.value || "-";
    const status = getTorchProfileStatus(value, definition.thresholds);
    const statusText = status && status.label !== "Negative"
      ? ` <span class="torch-profile-status ${status.className}">${status.label}</span>`
      : "";
    return `<tr><td><strong>${escapeHtml(definition.label)}</strong></td><td><span class="${status?.className || ""}">${escapeHtml(value)}</span>${statusText}</td><td>${escapeHtml(parameter.normal_range || definition.range)}</td><td>${escapeHtml(parameter.unit || definition.unit)}</td></tr>`;
  }).join("");

  const interpretationRows = definitions.map((definition) => `
    <tr><td>${escapeHtml(definition.label)}</td><td>${escapeHtml(definition.unit)}</td><td>${escapeHtml(definition.interpretation[0])}</td><td>${escapeHtml(definition.interpretation[1])}</td><td>${escapeHtml(definition.interpretation[2])}</td></tr>
  `).join("");

  return `
    <table class="results-table torch-profile-table">
      <thead><tr><th style="width: 36%">Investigation</th><th style="width: 27%">Result</th><th style="width: 24%">Reference Value</th><th style="width: 13%">Unit</th></tr></thead>
      <tbody>
        <tr class="torch-profile-section"><td colspan="4"><strong>TORCH PANEL, IgG &amp; IgM, SERUM</strong></td></tr>
        ${rows}
      </tbody>
    </table>
    <div class="report-template-notes torch-profile-notes">
      <div class="report-note-heading">Interpretation</div>
      <table class="report-reference-table torch-profile-interpretation-table"><thead><tr><th>Infection</th><th>Unit</th><th>Negative</th><th>Equivocal</th><th>Positive</th></tr></thead><tbody>${interpretationRows}</tbody></table>
    </div>
  `;
}

function getTnfAlphaStatus(value) {
  const numericValue = Number(String(value || "").replace(/,/g, "").trim());
  if (!Number.isFinite(numericValue)) return null;
  return numericValue <= 2.8
    ? { label: "Negative", className: "normal-val" }
    : { label: "Positive", className: "high-val" };
}

function buildTnfAlphaReportBody(test) {
  const result = findReportParameter(test, ["TUMOUR NECROSIS FACTOR (TNF), ALPHA", "TNF Alpha", "TNF-α", "Tumor Necrosis Factor Alpha", "Result"])
    || (test.parameters || [])[0];
  const value = result?.value || "-";
  const status = getTnfAlphaStatus(value);
  const normalRange = result?.normal_range || "< = 2.80";
  const unit = result?.unit || "pg/mL";

  return `
    <table class="results-table tnf-alpha-table">
      <thead><tr><th style="width: 42%">Investigation</th><th style="width: 25%">Result</th><th style="width: 23%">Reference Value</th><th style="width: 10%">Unit</th></tr></thead>
      <tbody>
        <tr class="tnf-alpha-sample-row"><td><strong>Sample Type</strong></td><td>${escapeHtml(test.sample_type || "Plasma (1 ml)")}</td><td colspan="2"><strong>TAT :</strong> 2 days (Normal: 2 - 8 days)</td></tr>
        <tr><td><strong>TUMOUR NECROSIS FACTOR (TNF), ALPHA</strong><div class="tnf-alpha-method">CLIA</div></td><td><span class="${status?.className || ""}">${escapeHtml(value)}</span>${status ? ` <span class="tnf-alpha-status ${status.className}">${status.label}</span>` : ""}</td><td>${escapeHtml(normalRange)}</td><td>${escapeHtml(unit)}</td></tr>
      </tbody>
    </table>
    <div class="tnf-alpha-notes">
      <div class="report-note-heading">Comments:</div>
      <p>TNF-α (Tumor Necrosis Factor-alpha), a proinflammatory cytokine with various functions, including its effects on tumor control and therapeutic applications.</p>
      <div class="report-note-heading">TNF-α and Its Production:</div>
      <ul>
        <li>TNF-α is a proinflammatory cytokine that can induce apoptosis (programmed cell death) and is involved in various physiological processes.</li>
        <li>Macrophages and monocytes are the primary producers of TNF-α, but activated T cells, mast cells, and keratinocytes can also produce it to a lesser extent.</li>
      </ul>
      <div class="report-note-heading">Effects of TNF-α:</div>
      <ul><li>TNF-α has multiple effects on different aspects of the immune system and cellular functions. These effects include apoptosis, adhesion and cellular trafficking, angiogenesis (formation of new blood vessels), myocyte proliferation, fibrosis, phagocytosis (cellular engulfment), cytokine production, leucocyte/macrophage function, inflammation, and tumor control.</li></ul>
      <div class="report-note-heading">Effect of TNF-α on Tumor Control:</div>
      <ul>
        <li>TNF-α can have a direct cytotoxic effect on tumor cells while sparing normal cells.</li>
        <li>It can modify vasculature to enhance the migration of lymphocytes (white blood cells) into tumors, supporting the immune response against cancer.</li>
        <li>TNF-α stimulates the immune response by activating cells that mediate anti-tumor immunity.</li>
      </ul>
      <div class="report-note-heading">Therapeutic Applications:</div>
      <ul>
        <li>Diseases directly related to excessive TNF-α production, such as septic shock, graft-versus-host disease, and lupus nephritis, may be amenable to treatment with anti-TNF-α antibodies or anti-inflammatory agents that reduce TNF production. This approach can help mitigate the inflammatory response associated with these conditions.</li>
        <li>TNF-α has been used in the chemotherapy of certain tumors, including melanomas and advanced neoplastic diseases. However, the text notes that its success in this regard has been limited.</li>
      </ul>
    </div>
  `;
}

function buildRheumatoidFactorReportBody(test) {
  return `
    ${buildSingleAnalyteResultTable(test, {
      tableClass: "single-analyte-table rheumatoid-factor-table",
      investigation: "RHEUMATOID FACTOR, RA, SERUM",
      aliases: ["Rheumatoid Factor, RA, Serum", "Rheumatoid Factor", "RF", "Result"],
      method: "Immunoturbidimetry",
      defaultRange: "0 - 18.00",
      defaultUnit: "IU/mL",
    })}
    <div class="single-analyte-notes report-template-notes"><div class="report-note-heading">Comments:</div><p>Rheumatoid factor is an antibody directed against the Fc portion of the IgG molecule. Polyreactive RF has binding specificity for substances other than IgG like nuclear components. This polyreactive RF is usually of the IgM class with low affinity. RF is not specific only for Rheumatoid arthritis, but it is often seen in cases of chronic infection and other systemic inflammatory conditions. Healthy individuals &gt; 65 years of age may also show positive RF results. In addition to the common IgM RF, both IgA RF &amp; IgG RF have been detected. IgA RF has been related to the more severe form of the disease with erosions.</p></div>
  `;
}

function buildAsoTiterReportBody(test) {
  return `
    ${buildSingleAnalyteResultTable(test, {
      tableClass: "single-analyte-table aso-titer-table",
      investigation: "ANTISTREPTOLYSIN O, ASO TITER, SERUM",
      aliases: ["Antistreptolysin O, ASO Titer, Serum", "Antistreptolysin O", "ASO Titer", "ASO", "Result"],
      method: "Immunoturbidimetry",
      defaultRange: "0 - 200.00",
      defaultUnit: "IU/mL",
    })}
    <div class="single-analyte-notes report-template-notes"><div class="report-note-heading">Comments:</div><p>Positive Antistreptolysin O (ASO) titres are useful for confirming exposure to Streptococcus pyogenes in the absence of other confirmatory laboratory evidence. ASO antibodies are detected in acute and convalescent serum samples primarily to diagnose Acute Rheumatic Fever and Acute Glomerulonephritis following infection with Group A streptococcus. Results should always be assessed in conjunction with the medical history and clinical findings of the patient.</p></div>
  `;
}

function buildHsCrpReportBody(test) {
  const result = findReportParameter(test, ["hsCRP", "hs-CRP", "High Sensitivity C-Reactive Protein", "Result"]) || {};
  const value = result.value || "-";
  const range = result.normal_range || "< 1.00";
  const status = getReferenceStatus(value, range);
  return `
    <table class="results-table hs-crp-table">
      <thead><tr><th style="width: 43%">Investigation</th><th style="width: 24%">Result</th><th style="width: 22%">Reference Value</th><th style="width: 11%">Unit</th></tr></thead>
      <tbody>
        <tr class="single-analyte-sample-row"><td><strong>Sample Type</strong></td><td>${escapeHtml(test.sample_type || "Serum (1 ml)")}</td><td colspan="2"><strong>TAT :</strong> 1 day (Normal: 1 - 2 days)</td></tr>
        <tr><td><strong>hsCRP</strong><div class="single-analyte-method">Immunoturbidimetry</div></td><td><span class="${status?.className || ""}">${escapeHtml(value)}</span>${status ? ` <span class="report-result-status ${status.className}">${status.label}</span>` : ""}</td><td>${escapeHtml(range)}</td><td>${escapeHtml(result.unit || "mg/L")}</td></tr>
      </tbody>
    </table>
    <div class="report-template-notes">
      <table class="report-reference-table hs-crp-interpretation-table"><thead><tr><th colspan="2">Interpretation</th></tr><tr><th>hsCRP (mg/L)</th><th>Cardiovascular Risk</th></tr></thead><tbody>
        <tr><td>&lt; 1</td><td>Low</td></tr><tr><td>1 - 3</td><td>Average</td></tr><tr><td>3 - 10</td><td>High</td></tr><tr><td>&gt; 10</td><td>Persistent elevation may represent non-cardiovascular inflammation</td></tr>
      </tbody></table>
      <div class="report-note-heading">Note:</div>
      <p>To evaluate vascular risk, it is advisable to measure hsCRP levels with an interval of 2 or more weeks and calculate the average.</p>
      <div class="report-note-heading">Comments:</div>
      <p>It is important to note that hs-CRP is a marker of inflammation, and various factors can influence the results. Interpretation should be done in the context of an individual's overall health, medical history, and other risk factors for cardiovascular disease. Additionally, hs-CRP alone is not diagnostic; it is often used in conjunction with other clinical and laboratory assessments to provide a comprehensive evaluation of cardiovascular risk.</p>
      <div class="report-note-heading">Clinical Considerations:</div>
      <ul>
        <li><strong>Cardiovascular Risk Assessment:</strong> Elevated hs-CRP levels are associated with an increased risk of cardiovascular events, including heart attacks and strokes.</li>
        <li><strong>Inflammatory Conditions:</strong> hs-CRP can be elevated in response to various inflammatory conditions, not limited to cardiovascular issues. This includes infections, autoimmune disorders, and chronic inflammatory diseases.</li>
        <li><strong>Treatment Monitoring:</strong> In some cases, hs-CRP levels may be monitored to assess the effectiveness of anti-inflammatory treatments or interventions.</li>
      </ul>
    </div>
  `;
}

function buildSemenAnalysisReportBody(test) {
  const sections = [
    {
      heading: "Physical Examination",
      rows: [
        { label: "Time of Specimen", aliases: ["Time of Specimen"] },
        { label: "Time of Examination", aliases: ["Time of Examination"] },
        { label: "Duration of Abstinence", aliases: ["Duration of Abstinence"], range: "2 - 7", unit: "days" },
        { label: "Liquefaction at 37 °C", aliases: ["Liquefaction at 37 °C", "Liquefaction at 37 C"], range: "30 - 60", unit: "minutes" },
        { label: "Volume", aliases: ["Volume"], range: "> 1.5", unit: "mL" },
        { label: "Appearance", aliases: ["Appearance"] },
        { label: "Colour", aliases: ["Colour", "Color"] },
        { label: "Viscosity", aliases: ["Viscosity"] },
        { label: "pH", aliases: ["pH", "PH"] },
      ],
    },
    {
      heading: "Microscopic Examination",
      rows: [
        { label: "Total Sperm Concentration", aliases: ["Total Sperm Concentration", "Total Sperm concentration"], range: "> 15", unit: "Million/mL" },
        { label: "Percentage Motility", aliases: ["Percentage Motility"], range: "> 50", unit: "%" },
        { label: "Grade A", aliases: ["Grade A"], range: "Fast progressive", unit: "%" },
        { label: "Grade B", aliases: ["Grade B"], range: "Slow progressive", unit: "%" },
        { label: "Grade C", aliases: ["Grade C"], range: "Immotile", unit: "%" },
        { label: "Vitality", aliases: ["Vitality"], range: "> 58 %", unit: "%" },
        { label: "Agglutination", aliases: ["Agglutination"], range: "Negative" },
        { label: "Pus Cells", aliases: ["Pus Cells", "Pus cells"], range: "Nil", unit: "/hpf" },
        { label: "Red Blood Cells", aliases: ["Red Blood Cells", "Red Blood cells"], range: "Nil", unit: "/hpf" },
        { label: "Epithelial Cells", aliases: ["Epithelial Cells", "Epithelial cells"], range: "Nil", unit: "/hpf" },
      ],
    },
    {
      heading: "Morphology",
      rows: [
        { label: "Normal Morphology", aliases: ["Normal Morphology", "Normal morphology"], range: "70 - 75", unit: "%" },
        { label: "Abnormal Morphology", aliases: ["Abnormal Morphology", "Abnormal morphology"], range: "25 - 30", unit: "%" },
        { label: "a. Head Defects", aliases: ["a. Head Defects", "Head Defects"], range: "10 - 15", unit: "%", indented: true },
        { label: "b. Neck & Mid Piece", aliases: ["b. Neck & Mid Piece", "Neck & Mid Piece", "Neck & mid piece"], range: "5 - 10", unit: "%", indented: true },
        { label: "c. Tail Defects", aliases: ["c. Tail Defects", "Tail Defects"], range: "10 - 15", unit: "%", indented: true },
      ],
    },
    {
      heading: "Chemical Examination",
      rows: [{ label: "Semen Fructose, Qualitative", aliases: ["Semen Fructose, Qualitative", "Semen Fructose"] }],
    },
  ];

  const body = sections.map((section) => {
    const rows = section.rows.map((definition) => {
      const parameter = findReportParameter(test, definition.aliases) || {};
      const value = parameter.value || "-";
      const range = parameter.normal_range || definition.range || "";
      const unit = parameter.unit || definition.unit || "";
      const status = getReferenceStatus(value, range);
      return `<tr><td class="${definition.indented ? "semen-investigation-indent" : ""}">${escapeHtml(definition.label)}</td><td><span class="${status?.className || ""}">${escapeHtml(value)}</span>${status ? ` <span class="report-result-status ${status.className}">${status.label}</span>` : ""}</td><td>${escapeHtml(range)}</td><td>${escapeHtml(unit)}</td></tr>`;
    }).join("");
    return `<tr class="semen-section"><td colspan="4">${escapeHtml(section.heading)}</td></tr>${rows}`;
  }).join("");

  return `<table class="results-table semen-analysis-table"><thead><tr><th style="width: 37%">Investigation</th><th style="width: 27%">Result</th><th style="width: 24%">Reference Value</th><th style="width: 12%">Unit</th></tr></thead><tbody>${body}</tbody></table>`;
}

function getUrineCotinineStatus(value) {
  const numericValue = Number(String(value || "").replace(/,/g, "").trim());
  if (!Number.isFinite(numericValue)) return null;
  if (numericValue <= 10) return { label: "Non-smoker", className: "normal-val" };
  if (numericValue >= 300 && numericValue <= 1300) return { label: "Smoker", className: "normal-val" };
  if (numericValue > 1300) return { label: "High", className: "high-val" };
  return { label: "Intermediate", className: "equivocal-val" };
}

function buildUrineCotinineReportBody(test) {
  const result = findReportParameter(test, ["Cotinine, Urine", "Urine Cotinine", "Cotinine", "Result"]) || {};
  const value = result.value || "-";
  const status = getUrineCotinineStatus(value);
  const reference = result.normal_range || "Smokers 300.00 - 1300.00; Non-smoker <= 10.00";
  return `
    <table class="results-table urine-cotinine-table"><thead><tr><th style="width: 31%">Investigation</th><th style="width: 25%">Result</th><th style="width: 29%">Reference Value</th><th style="width: 15%">Unit</th></tr></thead><tbody>
      <tr><td><strong>COTININE, URINE</strong><div class="single-analyte-method">CLIA</div></td><td><span class="${status?.className || ""}">${escapeHtml(value)}</span>${status ? ` <span class="report-result-status ${status.className}">${status.label}</span>` : ""}</td><td>${escapeHtml(reference).replace("; ", "<br>")}</td><td>${escapeHtml(result.unit || "ng/mL")}</td></tr>
    </tbody></table>
    <div class="report-template-notes cotinine-notes">
      <div class="report-note-heading">Clinic Use:</div><p>Cotinine, a metabolite of nicotine, in the urine. It is commonly performed to determine recent nicotine exposure or tobacco use.</p>
      <div class="report-note-heading">High Levels Causes:</div><ul><li>Active smoking - Heavy smoking of tobacco products</li><li>Passive smoking - Frequent exposure to secondhand smoke</li><li>Nicotine replacement therapy - Recent use of nicotine patches, gum, or lozenges</li><li>Smokeless tobacco use - Regular use of smokeless tobacco products</li><li>Environmental exposure - Prolonged exposure to high levels of environmental smoke</li></ul>
      <div class="report-note-heading">Low Levels Causes:</div><ul><li>Nonsmoker - No recent or significant exposure to tobacco or nicotine products</li><li>Smoking cessation - Recent quitting or reduction in tobacco or nicotine use</li><li>Smoke exposure - Minimal exposure to secondhand smoke</li><li>Nicotine-free environment - Working or living in a smoke-free environment</li><li>Nicotine products - Infrequent or low usage of nicotine-containing products</li></ul>
    </div>
  `;
}

function buildUrineGlucoseReportBody(test) {
  const result = findReportParameter(test, ["Glucose, Urine", "Urine Glucose", "Glucose", "Result"]) || {};
  return `
    <table class="results-table urine-glucose-table"><thead><tr><th style="width: 38%">Investigation</th><th style="width: 27%">Result</th><th style="width: 23%">Reference Value</th><th style="width: 12%">Unit</th></tr></thead><tbody>
      <tr><td><strong>GLUCOSE, URINE</strong><div class="single-analyte-method">Automated Strip Test / Benedict's test</div></td><td><strong>${escapeHtml(result.value || "-")}</strong></td><td>${escapeHtml(result.normal_range || "")}</td><td>${escapeHtml(result.unit || "")}</td></tr>
    </tbody></table>
  `;
}

function buildPorphyrinsReportBody(test) {
  const definitions = [
    { label: "Total Porphyrin", aliases: ["Total Porphyrin"], range: "0 - 1.0" },
    { label: "Coproporphyrin", aliases: ["Coproporphyrin"], range: "< 2.0" },
    { label: "Protoporphyrin (PROTO)", aliases: ["Protoporphyrin (PROTO)", "Protoporphyrin", "PROTO"], range: "16.0 - 60.0" },
    { label: "Uroporphyrin", aliases: ["Uroporphyrin"], range: "< 2.0" },
  ];
  const rows = definitions.map((definition) => {
    const parameter = findReportParameter(test, definition.aliases) || {};
    const value = parameter.value || "-";
    const range = parameter.normal_range || definition.range;
    const status = getReferenceStatus(value, range);
    return `<tr><td>${escapeHtml(definition.label)}</td><td><span class="${status?.className || ""}">${escapeHtml(value)}</span>${status ? ` <span class="report-result-status ${status.className}">${status.label}</span>` : ""}</td><td>${escapeHtml(range)}</td><td>${escapeHtml(parameter.unit || "mcg/dL")}</td></tr>`;
  }).join("");

  return `
    <table class="results-table porphyrins-table"><thead><tr><th style="width: 42%">Investigation</th><th style="width: 23%">Result</th><th style="width: 24%">Reference Value</th><th style="width: 11%">Unit</th></tr></thead><tbody>
      <tr class="porphyrins-section"><td colspan="4"><strong>PORPHYRINS</strong><div class="single-analyte-method">Latex Agglutination</div></td></tr>
      <tr class="single-analyte-sample-row"><td><strong>Sample Type</strong></td><td>${escapeHtml(test.sample_type || "Blood (3 ml)")}</td><td colspan="2"><strong>TAT :</strong> 4 hrs (Normal: 4 - 8 hrs)</td></tr>
      ${rows}
    </tbody></table>
    <div class="report-template-notes porphyrin-notes">
      <div class="report-note-heading">Interpretation:</div>
      <ol>
        <li><strong>Normal Range:</strong><ul><li>Normal values for porphyrin levels can vary depending on the specific type of porphyrin being measured and the laboratory's reference ranges.</li><li>Typically, normal values are provided in the test results to help interpret whether the measured levels are within the expected range.</li></ul></li>
        <li><strong>Increased Porphyrins:</strong><ul><li>Elevated levels of porphyrins may indicate a dysfunction in heme synthesis, and this could be associated with various porphyrias.</li><li>Acute porphyrias, such as acute intermittent porphyria (AIP), may show increased levels of porphobilinogen (PBG) in urine during acute attacks.</li><li>Cutaneous porphyrias, like porphyria cutanea tarda (PCT), may present with elevated uroporphyrin and coproporphyrin levels, especially in urine and sometimes in stool.</li></ul></li>
        <li><strong>Type of Porphyrin Elevation:</strong><ul><li>Different types of porphyrias lead to the accumulation of specific porphyrins. The type of porphyrin that is elevated can provide clues about the specific porphyria involved.</li><li>For example, elevations in uroporphyrin and coproporphyrin suggest a possible diagnosis of porphyria cutanea tarda.</li></ul></li>
        <li><strong>Clinical Correlation:</strong><ul><li>The interpretation of porphyrin test results should be done in conjunction with the patient's clinical history, symptoms, and other diagnostic findings.</li><li>Some porphyrias may present with symptoms such as abdominal pain, neuropathy, skin photosensitivity, and dark urine.</li></ul></li>
        <li><strong>Porphyrin Fractionation:</strong><ul><li>In some cases, porphyrin tests may involve fractionation to identify specific porphyrin isomers. This can provide additional information about the type of porphyria.</li><li>Fractionation may reveal patterns associated with specific porphyrias, aiding in diagnosis and management.</li></ul></li>
        <li><strong>Follow-Up Testing:</strong><ul><li>Abnormal porphyrin test results may require follow-up testing, such as genetic testing or additional biochemical assays, to confirm the diagnosis and identify the specific type of porphyria.</li></ul></li>
      </ol>
    </div>
  `;
}

function buildOccultBloodStoolReportBody(test) {
  const result = findReportParameter(test, ["Stool Examination, Occult Blood", "Occult Blood, Stool", "Occult Blood", "Result"]) || {};
  return `
    <table class="results-table occult-blood-table"><thead><tr><th style="width: 37%">Investigation</th><th style="width: 26%">Result</th><th style="width: 25%">Reference Value</th><th style="width: 12%">Unit</th></tr></thead><tbody>
      <tr><td><strong>STOOL EXAMINATION, OCCULT BLOOD</strong><div class="single-analyte-method">Guaiac method</div></td><td>${escapeHtml(result.value || "-")}</td><td>${escapeHtml(result.normal_range || "Absent")}</td><td>${escapeHtml(result.unit || "")}</td></tr>
    </tbody></table>
    <div class="report-template-notes occult-blood-notes"><div class="report-note-heading">Comments:</div><p>This test is mainly used as screening for asymptomatic ulcerated lesions of the GI tract. In order to avoid false positivity, certain dietary and drug restrictions are recommended. For 3 days before the test avoid large doses of drugs like Aspirin NSAID Vitamin C Oral iron, red meat, poultry, fish, vegetables like cucumber, horseradish &amp; cauliflower &amp; vigorous brushing of teeth with a hard toothbrush.</p></div>
  `;
}

function getCsfQualitativeClass(value, expectedValue) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized || normalized === "-") return "";
  return normalized === String(expectedValue).toLowerCase() ? "normal-val" : "high-val";
}

function getCsfNumericStatus(value, range) {
  const standardStatus = getReferenceStatus(value, range);
  if (standardStatus) return standardStatus;
  const numericValue = Number(String(value || "").replace(/,/g, "").trim());
  const target = Number(String(range || "").trim());
  if (!Number.isFinite(numericValue) || !Number.isFinite(target)) return null;
  if (numericValue === target) return { label: "Normal", className: "normal-val" };
  return numericValue > target
    ? { label: "High", className: "high-val" }
    : { label: "Low", className: "low-val" };
}

function buildCsfAnalysisReportBody(test) {
  const sections = [
    {
      heading: "Physical Examination",
      rows: [
        { label: "Volume", aliases: ["Volume"], unit: "ml", type: "plain" },
        { label: "Colour", aliases: ["Colour", "Color"], expected: "Clear", type: "qualitative" },
        { label: "Turbidity", aliases: ["Turbidity"], expected: "Clear", type: "qualitative" },
        { label: "Coagulum", aliases: ["Coagulum"], expected: "Nil", type: "qualitative" },
        { label: "Blood", aliases: ["Blood"], expected: "Nil", type: "qualitative" },
        { label: "Deposits", aliases: ["Deposits"], expected: "Nil", type: "qualitative" },
      ],
    },
    {
      heading: "Chemical Examination",
      rows: [
        { label: "Glucose", aliases: ["Glucose"], range: "40.00 - 70.00", unit: "mg/dL", type: "numeric" },
        { label: "Chloride", aliases: ["Chloride"], range: "101.00 - 109.00", unit: "mEq/L", type: "numeric" },
        { label: "Total Protein", aliases: ["Total Protein"], range: "15.00 - 45.00", unit: "mg/dL", type: "numeric" },
      ],
    },
    {
      heading: "Cytological Examination",
      rows: [
        { label: "Cell Count", aliases: ["Cell Count", "Cell count"], range: "< 4.00", unit: "/mm3", type: "numeric" },
        { label: "Neutrophils", aliases: ["Neutrophils"], range: "0.00 - 3.00", unit: "%", type: "numeric" },
        { label: "Lymphocytes", aliases: ["Lymphocytes"], range: "40.00 - 80.00", unit: "%", type: "numeric" },
        { label: "Eosinophils", aliases: ["Eosinophils"], range: "0.00 - 1.00", unit: "%", type: "numeric" },
        { label: "Monocytes", aliases: ["Monocytes"], range: "0.00 - 2.00", unit: "%", type: "numeric" },
        { label: "Basophils", aliases: ["Basophils"], range: "0.00", unit: "%", type: "numeric" },
        { label: "Degenerated Cells", aliases: ["Degenerated Cells", "Degenerated cells"], expected: "Nil", type: "qualitative" },
        { label: "Atypical Cells", aliases: ["Atypical Cells", "Atypical cells"], expected: "Nil", type: "qualitative" },
      ],
    },
  ];

  const body = sections.map((section) => {
    const rows = section.rows.map((definition) => {
      const parameter = findReportParameter(test, definition.aliases) || {};
      const value = parameter.value || "-";
      const range = parameter.normal_range || definition.range || "";
      const unit = parameter.unit || definition.unit || "";
      const status = definition.type === "numeric" ? getCsfNumericStatus(value, range) : null;
      const className = definition.type === "qualitative"
        ? getCsfQualitativeClass(value, definition.expected)
        : definition.type === "numeric" ? (status?.className || "") : "";
      const statusLabel = status && status.label !== "Normal"
        ? ` <span class="report-result-status ${status.className}">${status.label}</span>`
        : "";
      return `<tr><td>${escapeHtml(definition.label)}</td><td><span class="${className}">${escapeHtml(value)}</span>${statusLabel}</td><td>${escapeHtml(range)}</td><td>${escapeHtml(unit)}</td></tr>`;
    }).join("");
    return `<tr class="csf-section"><td colspan="4">${escapeHtml(section.heading)}</td></tr>${rows}`;
  }).join("");

  return `
    <table class="results-table csf-analysis-table"><thead><tr><th style="width: 39%">Investigation</th><th style="width: 25%">Result</th><th style="width: 25%">Reference Value</th><th style="width: 11%">Unit</th></tr></thead><tbody>
      <tr class="single-analyte-sample-row"><td><strong>Sample Type</strong></td><td>${escapeHtml(test.sample_type || "CSF")}</td><td colspan="2"><strong>TAT :</strong> 4 hrs (Normal: 4 - 8 hrs)</td></tr>
      ${body}
    </tbody></table>
  `;
}

function buildTshReportBody(test) {
  return `
    ${buildSingleAnalyteResultTable(test, {
      tableClass: "single-analyte-table tsh-table",
      investigation: "TSH, SERUM",
      aliases: ["TSH, Serum", "TSH", "Thyroid Stimulating Hormone", "Result"],
      method: "CLIA",
      defaultRange: "0.40 - 4.00",
      defaultUnit: "mU/L",
    })}
    <div class="single-analyte-notes tsh-notes">
      <div class="report-note-heading">Note :</div>
      <p>TSH levels are subject to circadian variation, reaching peak levels between 2 - 4 a.m. and at a minimum between 6-10 pm. The variation is of the order of 50%, hence time of the day has influence on the measured serum TSH concentrations.</p>
      <div class="report-note-heading">Clinical Use :</div>
      <ul><li>Diagnose Hypothyroidism and Hyperthyroidism</li><li>Monitor T4 replacement or T4 suppressive therapy</li><li>Quantify TSH levels in the subnormal range</li></ul>
      <div class="report-note-heading">Increased Levels:</div>
      <p>Primary hypothyroidism, Subclinical hypothyroidism, TSH dependent Hyperthyroidism, Thyroid hormone resistance</p>
      <div class="report-note-heading">Decreased Levels:</div>
      <p>Graves disease, Autonomous thyroid hormone secretion, TSH deficiency</p>
    </div>
  `;
}

function buildThyroidProfileReportBody(test) {
  const definitions = [
    { label: "T3, TOTAL", aliases: ["T3, Total", "T3 Total", "Total T3", "Triiodothyronine (T3)"], range: "80.00 - 200.00", unit: "ng/dL" },
    { label: "T4, TOTAL", aliases: ["T4, Total", "T4 Total", "Total T4", "Thyroxine (T4)"], range: "4.50 - 12.50", unit: "mcg/dL" },
    { label: "TSH", aliases: ["TSH", "TSH, Serum", "Thyroid Stimulating Hormone"], range: "0.40 - 4.00", unit: "mU/L" },
  ];

  const rows = definitions.map((definition) => {
    const parameter = findReportParameter(test, definition.aliases) || {};
    const value = parameter.value || "-";
    const range = parameter.normal_range || definition.range;
    const status = getReferenceStatus(value, range);
    return `<tr><td>${escapeHtml(definition.label)}</td><td><span class="${status?.className || ""}">${escapeHtml(value)}</span>${status ? ` <span class="report-result-status ${status.className}">${status.label}</span>` : ""}</td><td>${escapeHtml(range)}</td><td>${escapeHtml(parameter.unit || definition.unit)}</td></tr>`;
  }).join("");

  return `
    <table class="results-table thyroid-profile-table"><thead><tr><th style="width: 34%">Investigation</th><th style="width: 27%">Result</th><th style="width: 25%">Reference Value</th><th style="width: 14%">Unit</th></tr></thead><tbody>
      <tr class="single-analyte-sample-row"><td><strong>Sample Type</strong></td><td>${escapeHtml(test.sample_type || "Serum (2 ml)")}</td><td colspan="2"><strong>TAT :</strong> 1 day (Normal: 1 - 3 days)</td></tr>
      <tr class="thyroid-profile-section"><td colspan="4"><strong>THYROID PROFILE</strong><div class="single-analyte-method">EIA</div></td></tr>
      ${rows}
    </tbody></table>
    <div class="report-template-notes thyroid-profile-notes">
      <table class="thyroid-profile-interpretation-table"><thead><tr><th colspan="3">Interpretation:</th></tr><tr><th>Hormone</th><th>Low Level</th><th>High Level</th></tr></thead><tbody>
        <tr><td>Thyroxine (T4)</td><td>Hypothyroidism</td><td>Hyperthyroidism</td></tr>
        <tr><td>Triiodothyronine (T3)</td><td>Hypothyroidism</td><td>Hyperthyroidism</td></tr>
        <tr><td>Thyroid Stimulating Hormone (TSH)</td><td>Hyperthyroidism</td><td>Hypothyroidism</td></tr>
      </tbody></table>
      <div class="report-note-heading">Note :</div>
      <ol>
        <li>TSH levels are subject to circadian variation, reaching peak levels between 2 - 4 a.m. and at a minimum between 6-10 pm. The variation is of the order of 50%, hence time of the day has influence on the measured serum TSH concentrations.</li>
        <li>Alteration in concentration of Thyroid hormone binding protein can profoundly affect Total T3 and/or Total T4 levels especially in pregnancy and in patients on steroid therapy.</li>
        <li>Unbound fraction (Free T4 / Free T3) of thyroid hormone is biologically active form and correlate more closely with clinical status of the patient than total T4/T3 concentration.</li>
        <li>Values &lt;0.04 mU/L need to be clinically correlated due to presence of a rare TSH variant in some individuals.</li>
      </ol>
    </div>
  `;
}

function buildThyroidAntibodiesReportBody(test) {
  const definitions = [
    {
      heading: "ANTI THYROGLOBULIN ANTIBODY (ANTI - Tg)",
      label: "ANTI - Tg, SERUM",
      aliases: ["Anti - Tg, Serum", "Anti Tg, Serum", "Anti Thyroglobulin Antibody", "Anti Tg (Anti Thyroglobulin)"],
    },
    {
      heading: "ANTI THYROID PEROXIDASE ANTIBODY (ANTI TPO)",
      label: "ANTI TPO, SERUM",
      aliases: ["Anti TPO, Serum", "Anti Thyroid Peroxidase Antibody", "Anti TPO (Anti Thyroid Peroxidase)"],
    },
  ];

  const rows = definitions.map((definition) => {
    const parameter = findReportParameter(test, definition.aliases) || {};
    const value = parameter.value || "-";
    const range = parameter.normal_range || "< 60.00";
    const status = getReferenceStatus(value, range);
    return `
      <tr class="thyroid-antibodies-section"><td colspan="4"><strong>${escapeHtml(definition.heading)}</strong></td></tr>
      <tr><td><strong>${escapeHtml(definition.label)}</strong><div class="single-analyte-method">CLIA</div></td><td><span class="${status?.className || ""}">${escapeHtml(value)}</span>${status ? ` <span class="report-result-status ${status.className}">${status.label}</span>` : ""}</td><td>${escapeHtml(range)}</td><td>${escapeHtml(parameter.unit || "U/mL")}</td></tr>
    `;
  }).join("");

  return `
    <table class="results-table thyroid-antibodies-table"><thead><tr><th style="width: 34%">Investigation</th><th style="width: 27%">Result</th><th style="width: 25%">Reference Value</th><th style="width: 14%">Unit</th></tr></thead><tbody>${rows}</tbody></table>
    <div class="report-template-notes thyroid-antibodies-notes">
      <div class="report-note-heading">Note:</div>
      <ul>
        <li>Thyroglobulin antibodies may be detected in individuals without clinically significant thyroid disease. They do not define the patient&rsquo;s thyroid functional status.</li>
        <li>Thyroid Peroxidase antibodies may be detected in individuals without clinically significant thyroid disease. They do not define the patient&rsquo;s thyroid functional status. Anti TPO is technically superior and a more specific method for measuring thyroid antibodies. It is especially useful in patients presenting with subclinical hypothyroidism where TSH is elevated but free T4 levels are normal.</li>
      </ul>
      <div class="report-note-heading">Clinical Use :</div>
      <p>Confirm presence of Autoimmune thyroid disease</p>
      <div class="report-note-heading">Increased Levels</div>
      <ul><li>Hashimoto thyroiditis</li><li>Graves disease</li><li>Postpartum thyroiditis</li><li>Primary hypothyroidism due to Hashimoto thyroiditis</li></ul>
    </div>
  `;
}

function getVeryHighReferenceStatus(value, range) {
  const status = getReferenceStatus(value, range);
  return status?.label === "High"
    ? { label: "Very High", className: "high-val" }
    : status;
}

function getAbnormalReferenceStatus(value, range) {
  const status = getReferenceStatus(value, range);
  return status?.label === "Normal" ? null : status;
}

function getUpperThresholdStatus(value, threshold, highLabel = "High") {
  const numericValue = Number(String(value || "").replace(/,/g, ""));
  if (!Number.isFinite(numericValue)) return null;
  return numericValue > threshold
    ? { label: highLabel, className: "high-val" }
    : { label: "Normal", className: "normal-val" };
}

function getPappAReferenceForWeek(value) {
  const week = Number(String(value || "").trim());
  const references = {
    9: 0.90,
    10: 1.40,
    11: 2.19,
    12: 3.42,
    13: 5.34,
  };
  return Number.isFinite(week) && references[week] ? references[week] : null;
}

function getPappAStatus(value, referenceValue) {
  const numericValue = Number(String(value || "").replace(/,/g, ""));
  if (!Number.isFinite(numericValue) || !Number.isFinite(referenceValue)) return null;
  if (numericValue < referenceValue * 0.5) return { label: "Low", className: "low-val" };
  if (numericValue > referenceValue * 1.5) return { label: "High", className: "high-val" };
  return { label: "Normal", className: "normal-val" };
}

function buildTriiodothyronineTotalReportBody(test) {
  return `
    ${buildSingleAnalyteResultTable(test, {
      tableClass: "single-analyte-table hormone-table triiodothyronine-table",
      investigation: "T3, TOTAL, SERUM",
      aliases: ["T3, Total, Serum", "T3, Total", "T3 Total", "Total T3", "Triiodothyronine (T3)", "Result"],
      method: "CLIA",
      defaultRange: "80.00 - 200.00",
      defaultUnit: "ng/dL",
    })}
    <div class="single-analyte-notes hormone-notes">
      <div class="report-note-heading">Comment:</div>
      <p>T3 (Triiodothyronine), hormone in the body, providing important insights into thyroid function and potential thyroid disorders.</p>
      <div class="report-note-heading">Note:</div>
      <p>Total T3 &amp; T4 levels measure the hormone which is in the bound form and is not available to most tissues. In addition severe systemic illness which affects the thyroid binding proteins can falsely alter Total T4 levels in the absence of a primary thyroid disease. Hence Free T3 &amp; T4 levels are recommended for accurate assessment of thyroid dysfunction.</p>
      <div class="report-note-heading">Clinical Use:</div>
      <p>Diagnose and monitor treatment of Hyperthyroidism</p>
      <div class="report-note-heading">Increased Levels:</div>
      <p>Pregnancy, Graves disease, T3 thyrotoxicosis, TSH dependent Hyperthyroidism, Increased TBG</p>
      <div class="report-note-heading">Decreased Levels:</div>
      <p>Nonthyroidal illness, Hypothyroidism, Nutritional deficiency, Systemic illness, Decreased TBG</p>
    </div>
  `;
}

function buildTestosteroneTotalReportBody(test) {
  return `
    ${buildSingleAnalyteResultTable(test, {
      tableClass: "single-analyte-table hormone-table testosterone-table",
      investigation: "TESTOSTERONE, TOTAL",
      aliases: ["Testosterone, Total", "Total Testosterone", "Testosterone", "Result"],
      method: "CLIA",
      defaultRange: "300.00 - 1000.00",
      defaultUnit: "ng/dL",
      statusForValue: getVeryHighReferenceStatus,
    })}
    <div class="single-analyte-notes hormone-notes">
      <div class="report-note-heading">Note :</div>
      <ul>
        <li>All applications that require measurement of very low level of testosterone (eg hypogonadal men, children, virilization or intersex disorders in women etc) recommended test is Testosterone total, Ultrasensitive.</li>
        <li>LC-MS/MS is the gold standard for steroid hormone assays due to increased sensitivity &amp; specificity as compared to immunoassays.</li>
      </ul>
      <div class="report-note-heading">Clinical Use :</div>
      <ul><li>Assessment of testicular function in males.</li></ul>
      <div class="report-note-heading">Increased levels :</div>
      <ul><li>Precocious puberty (Males)</li><li>Androgen resistance</li><li>Testotoxicosis</li><li>Congenital Adrenal Hyperplasia</li></ul>
      <div class="report-note-heading">Decreased levels :</div>
      <ul><li>Delayed puberty (Males)</li><li>Gonadotropin deficiency</li><li>Testicular defects</li><li>Systemic diseases</li></ul>
    </div>
  `;
}

function buildProgesteroneReportBody(test) {
  return `
    ${buildSingleAnalyteResultTable(test, {
      tableClass: "single-analyte-table hormone-table progesterone-table",
      investigation: "PROGESTERONE, SERUM",
      aliases: ["Progesterone, Serum", "Progesterone", "Result"],
      method: "CMIA",
      defaultRange: "< 0.20",
      defaultUnit: "ng/mL",
    })}
    <div class="single-analyte-notes hormone-notes">
      <div class="report-note-heading">Comments :</div>
      <p>Progesterone is a hormone in the body, that provides insights into reproductive health, fertility, and certain medical conditions.</p>
      <div class="report-note-heading">Progesterone High Levels causes :</div>
      <ul>
        <li>Ovarian cyst A fluid-filled sac that forms on an ovary.</li>
        <li>Pregnancy The condition of carrying a fetus in the womb.</li>
        <li>Adrenal gland tumor A growth of tissue in the adrenal gland.</li>
        <li>Liver disorder A condition that affects the liver.</li>
        <li>Medications Certain medications, such as birth control pills.</li>
        <li>Cancer A group of diseases involving abnormal cell growth.</li>
      </ul>
      <div class="report-note-heading">Progesterone Low Levels causes :</div>
      <ul>
        <li>PCOS A condition that affects the ovaries and can cause irregular periods, infertility.</li>
        <li>Early pregnancy loss The loss of a pregnancy before 20 weeks of gestation.</li>
        <li>Hormonal imbalance A condition in which the levels of certain hormones are not within the normal range.</li>
        <li>Hypothyroidism A condition in which the thyroid gland does not produce enough thyroid hormone.</li>
        <li>Adrenal insufficiency A condition in which the adrenal glands do not produce enough hormones.</li>
        <li>Medications Certain medications, such as chemotherapy drugs, can cause low progesterone levels.</li>
        <li>Nutritional deficiencies A deficiency in certain nutrients, such as vitamin B6, can cause low progesterone levels.</li>
        <li>Stress can cause a number of hormonal imbalances, including low progesterone levels.</li>
        <li>Age Progesterone levels naturally decline with age.</li>
        <li>Genetics Some people are more likely to have low progesterone levels due to their genes.</li>
      </ul>
    </div>
  `;
}

function buildCortisoneReportBody(test) {
  return `
    ${buildSingleAnalyteResultTable(test, {
      tableClass: "single-analyte-table hormone-table cortisone-table",
      investigation: "CORTISONE, SERUM",
      aliases: ["Cortisone, Serum", "Cortisone", "Result"],
      method: "LC-MS/MS",
      defaultRange: "16.62 - 74.79",
      defaultUnit: "nmol/L",
    })}
    <div class="single-analyte-notes hormone-notes">
      <div class="report-note-heading">Note:</div>
      <p>LC-MS/MS is the gold standard for steroid hormone assays due to increased sensitivity &amp; specificity as compared to immunoassays.</p>
      <div class="single-analyte-heading">Interpretation :</div>
      <table class="hormone-reference-table cortisone-reference-table"><thead><tr><th colspan="2">Cortisone</th></tr><tr><th>Age</th><th>Reference Range<br>(nmol/L)</th></tr></thead><tbody><tr><td>Children</td><td>6.37 - 49.02</td></tr><tr><td>Adults</td><td>16.62 - 74.79</td></tr></tbody></table>
      <div class="report-note-heading">Comment :</div>
      <p>Cortisone is one of the main hormone released by the adrenal gland in response to stress. Measurement of Cortisone is useful in diagnosing patients with low-renin hypertension caused by apparent mineralocorticoid excess. This may be due to either an inherited defect in 11HSDβ2 enzyme or an acquired inhibitor of the enzyme by such compounds as glycyrrhizic acid, a component of natural licorice. Suppressed cortisone levels may also be observed in Primary adrenal insufficiency.</p>
    </div>
  `;
}

function buildBetaHcgPregnancyReportBody(test) {
  return `
    ${buildSingleAnalyteResultTable(test, {
      tableClass: "single-analyte-table hormone-table beta-hcg-table",
      investigation: "HCG, BETA, TOTAL, SERUM",
      aliases: ["HCG, Beta, Total, Serum", "HCG, Beta, Total", "Beta HCG, Total", "Beta hCG Total", "Result"],
      method: "CMIA",
      defaultRange: "< 5.00",
      defaultUnit: "mIU/mL",
      statusForValue: getVeryHighReferenceStatus,
    })}
    <div class="single-analyte-notes hormone-notes">
      <div class="single-analyte-heading">Interpretation :</div>
      <table class="hormone-reference-table beta-hcg-reference-table"><thead><tr><th>Pregnancy Weeks Post LMP</th><th>HCG Levels in mIU/mL</th></tr></thead><tbody>
        <tr><td>4</td><td>5 - 100</td></tr><tr><td>5</td><td>200 - 3000</td></tr><tr><td>6</td><td>10000 - 80,000</td></tr><tr><td>7 - 14</td><td>90000 - 500000</td></tr><tr><td>15 - 26</td><td>5000 - 80000</td></tr><tr><td>27 - 40</td><td>3000 - 15000</td></tr><tr><td>Non Pregnant</td><td>&lt; 5</td></tr><tr><td>Trophoblastic disease</td><td>&gt;100000</td></tr>
      </tbody></table>
      <div class="report-note-heading">Note :</div>
      <ol>
        <li>Consistently elevated HCG levels may be due to the presence of heterophilic antibodies, non specific protein binding &amp; HCG like substance.</li>
        <li>False negative / positive results may be seen in patients receiving mouse monoclonal antibodies for diagnosis or therapy.</li>
      </ol>
      <div class="report-note-heading">Comments :</div>
      <p>Beta HCG levels rise geometrically in the serum in the first 8 weeks of pregnancy. Detectable amounts of beta HCG are present 8-11 days after conception. During the second to fifth week, HCG levels double in about 1.5 days. After 5 weeks of gestation, the doubling time gradually increases to 2-3 days. Serial determination of HCG is helpful when abnormal pregnancy is suspected. In ectopic pregnancy and spontaneous abortion HCG concentration increases slowly or decreases. Ultrasonography should detect a gestational sac in the uterus of all patients having HCG concentration &gt; 6500 mIU/mL. Failure to detect a gestational sac 24 days or more after conception is presumptive evidence of ectopic pregnancy. The presence of twins approximately doubles the HCG concentration.</p>
    </div>
  `;
}

function buildProlactinReportBody(test) {
  return `
    ${buildSingleAnalyteResultTable(test, {
      tableClass: "single-analyte-table hormone-table prolactin-table",
      investigation: "PROLACTIN, SERUM",
      aliases: ["Prolactin, Serum", "Prolactin (PRL)", "Prolactin", "PRL", "Result"],
      method: "CLIA",
      defaultRange: "2.10 - 17.70",
      defaultUnit: "ng/mL",
      statusForValue: getAbnormalReferenceStatus,
    })}
    <div class="single-analyte-notes hormone-notes prolactin-notes">
      <div class="report-note-heading">Note:</div>
      <ol>
        <li>Since prolactin is secreted in a pulsatile manner and is also influenced by a variety of physiologic stimuli, it is recommended to test 3 specimens at 20-30 minute intervals after pooling.</li>
        <li>Major circulating form of Prolactin is a nonglycosylated monomer, but several forms of Prolactin linked with immunoglobulin occur which can give falsely high Prolactin results.</li>
        <li>Macroprolactin assay is recommended if prolactin levels are elevated, but signs and symptoms of hyperprolactinemia are absent or pituitary imaging studies are normal.</li>
      </ol>
      <div class="report-note-heading">Clinical Use</div>
      <ul><li>Diagnosis &amp; management of pituitary adenomas</li><li>Differential diagnosis of male &amp; female hypogonadism</li></ul>
      <div class="report-note-heading">Increased Levels</div>
      <ul>
        <li>Physiologic: Sleep, stress, postprandially, pain, coitus</li>
        <li>Systemic disorders: Chest wall or thoracic spinal cord lesions, Primary / Secondary hypothyroidism, Adrenal insufficiency, Chronic renal failure, Cirrhosis</li>
        <li>Medications:<ol><li>Psychiatric medications like Phenothiazine, Haloperidol, Risperidone, Domperidone, Fluoxetine, Amitriptylene, MAO inhibitors etc.</li><li>Antihypertensives: Alphamethyldopa, Reserpine, Verapamil</li><li>Opiates: Heroin, Methadone, Morphine, Apomorphine</li><li>Cimetidine / Ranitidine</li></ol></li>
        <li>Prolactin secreting pituitary tumors: Prolactinoma, Acromegaly</li>
        <li>Miscellaneous: Epileptic seizures, Ectopic secretion of prolactin by non-pituitary tumors, pressure/transaction of the pituitary stalk, macroprolactinemia &amp; Idiopathic</li>
      </ul>
      <div class="report-note-heading">Decreased levels</div>
      <ul><li>Pituitary necrosis/infarction</li><li>Bromocriptine administration</li><li>Pseudohypoparathyroidism</li></ul>
    </div>
  `;
}

function buildDheaReportBody(test) {
  return `
    ${buildSingleAnalyteResultTable(test, {
      tableClass: "single-analyte-table hormone-table dhea-table",
      investigation: "DHEA, SERUM",
      aliases: ["DHEA, Serum", "Dehydroepiandrosterone (DHEA)", "Dehydroepiandrosterone", "DHEA", "Result"],
      method: "EIA",
      defaultRange: "0.52 - 5.18",
      defaultUnit: "ng/mL",
    })}
    <div class="single-analyte-notes hormone-notes">
      <div class="report-note-heading">Clinical Use :</div>
      <ul><li>Marker of Adrenal androgen production</li><li>Assess adrenal reserve after ACTH stimulation</li></ul>
      <div class="report-note-heading">Increased Levels :</div>
      <ul><li>Adrenal tumors</li><li>Cushing’s disease</li><li>Congenital Adrenal Hyperplasia</li><li>Premature adrenarche</li></ul>
      <div class="report-note-heading">Decreased Levels :</div>
      <p>Addison’s disease<br>Anorexia nervosa</p>
    </div>
  `;
}

function buildEstradiolReportBody(test) {
  return `
    ${buildSingleAnalyteResultTable(test, {
      tableClass: "single-analyte-table hormone-table estradiol-table",
      investigation: "ESTRADIOL (E2), SERUM",
      aliases: ["Estradiol (E2), Serum", "Estradiol (E2)", "Estradiol, Serum", "Estradiol", "E2", "Result"],
      method: "CLIA",
      defaultRange: "< 39.80",
      defaultUnit: "pg/mL",
    })}
    <div class="single-analyte-notes hormone-notes">
      <div class="report-note-heading">Note :</div>
      <p>All applications that require measurement of very low levels of estradiol (eg men, children, post-menopausal women, hypogonadal women, etc) recommended test is Estradiol, Ultrasensitive.<br>LC-MS/MS is the gold standard for steroid hormone assays due to increased sensitivity &amp; specificity as compared to immunoassays.</p>
      <div class="report-note-heading">Clinical Use :</div>
      <p>Determine estrogen status in women<br>Monitor follicular development during induction of ovulation<br>Assess estrogen production in males</p>
      <div class="report-note-heading">Increased Levels :</div>
      <ul><li>Precocious puberty (female)</li><li>Male gynecomastia</li><li>Liver disease</li><li>Ovarian tumors</li><li>Adrenal feminizing tumors</li></ul>
      <div class="report-note-heading">Decreased Level :</div>
      <ul><li>Oral contraceptives</li><li>Ovarian failure</li></ul>
    </div>
  `;
}

function buildLuteinizingHormoneReportBody(test) {
  return `
    ${buildSingleAnalyteResultTable(test, {
      tableClass: "single-analyte-table hormone-table luteinizing-hormone-table",
      investigation: "LUTEINISING HORMONE (LH), SERUM",
      aliases: ["Luteinising Hormone (LH), Serum", "Luteinizing Hormone (LH), Serum", "Luteinising Hormone (LH)", "Luteinizing Hormone (LH)", "LH", "Result"],
      method: "CLIA",
      defaultRange: "1.50 - 9.30",
      defaultUnit: "mIU/mL",
    })}
    <div class="single-analyte-notes hormone-notes">
      <div class="report-note-heading">Clinical Use :</div>
      <ul><li>Diagnosis of gonadal function disorders</li><li>Diagnosis of pituitary disorders</li></ul>
      <div class="report-note-heading">Increased levels</div>
      <ul><li>Primary hypogonadism</li><li>Gonadotropin secreting pituitary tumors</li></ul>
      <div class="report-note-heading">Decreased levels</div>
      <ul><li>Hypothalamic GnRH deficiency</li><li>Pituitary LH deficiency</li><li>Ectopic steroid hormone production</li><li>GnRH analog treatment</li></ul>
    </div>
  `;
}

function buildFollicleStimulatingHormoneReportBody(test) {
  return `
    ${buildSingleAnalyteResultTable(test, {
      tableClass: "single-analyte-table hormone-table follicle-stimulating-hormone-table",
      investigation: "FOLLICLE STIMULATING HORMONE (FSH), SERUM",
      aliases: ["Follicle Stimulating Hormone (FSH), Serum", "Follicle-Stimulating Hormone (FSH), Serum", "Follicle Stimulating Hormone (FSH)", "Follicle-Stimulating Hormone (FSH)", "FSH", "Result"],
      method: "CLIA",
      defaultRange: "1.40 - 18.10",
      defaultUnit: "mIU/mL",
    })}
    <div class="single-analyte-notes hormone-notes">
      <div class="report-note-heading">Clinical Use :</div>
      <ul><li>Diagnosis of gonadal function disorders</li><li>Management and treatment of infertility in both genders</li></ul>
      <div class="report-note-heading">Increased levels</div>
      <ul><li>Primary hypogonadism</li><li>Gonadotropin secreting pituitary tumors</li></ul>
      <div class="report-note-heading">Decreased levels</div>
      <ul><li>Hypothalamic GnRH deficiency</li><li>Pituitary FSH deficiency</li><li>Ectopic steroid hormone production</li></ul>
    </div>
  `;
}

function buildThyroxineTotalReportBody(test) {
  return `
    ${buildSingleAnalyteResultTable(test, {
      tableClass: "single-analyte-table hormone-table thyroxine-total-table",
      investigation: "T4, TOTAL, SERUM",
      aliases: ["T4, Total, Serum", "T4, Total", "T4 Total", "Total T4", "Thyroxine (T4), Total", "Result"],
      method: "CLIA",
      defaultRange: "4.50 - 12.50",
      defaultUnit: "mcg/dL",
    })}
    <div class="single-analyte-notes hormone-notes">
      <div class="report-note-heading">Comments :</div>
      <p>Thyroxine (T4) is a hormone produced by the thyroid gland, which plays a crucial role in regulating metabolism and growth. The T4 test is used to assess thyroid function and diagnose thyroid disorders such as hypothyroidism (underactive thyroid) or hyperthyroidism (overactive thyroid).</p>
      <div class="report-note-heading">Note :</div>
      <ul><li>Total T3 &amp; T4 levels measure the hormone which is in the bound form and is not available to most tissues.</li><li>Severe systemic illness affects the thyroid binding proteins and can falsely alter Total T4 levels in the absence of a primary thyroid disease. Hence Free T3 &amp; T4 levels are recommended for accurate assessment of thyroid dysfunction.</li></ul>
      <div class="report-note-heading">Interpretation</div>
      <ul><li>High T4 Level - May be a sign of hyperthyroidism, which is an overactive thyroid gland.</li><li>Low T4 Level - This may be a sign of hypothyroidism, which is an underactive thyroid gland.</li><li>Normal T4 Level - This indicates that your thyroid gland is functioning normally.</li></ul>
      <div class="report-note-heading">T4 High Levels cause:</div>
      <ul><li>Graves' disease - Autoimmune disorder</li><li>Toxic nodular goiter - Nodules in thyroid</li><li>Subacute thyroiditis - Inflammation</li><li>Thyroid storm - Severe increase</li></ul>
      <div class="report-note-heading">T4 Low Levels cause :</div>
      <ul><li>Hypothyroidism - Underactive thyroid</li><li>Medications - Side effect</li><li>Iodine deficiency - Lack of iodine</li></ul>
    </div>
  `;
}

function buildCalcitoninReportBody(test) {
  return `
    ${buildSingleAnalyteResultTable(test, {
      tableClass: "single-analyte-table hormone-table calcitonin-table",
      investigation: "CALCITONIN, SERUM",
      aliases: ["Calcitonin, Serum", "Calcitonin", "Result"],
      method: "CLIA",
      defaultRange: "0.00 - 10.00",
      defaultUnit: "pg/mL",
    })}
    <div class="single-analyte-notes hormone-notes">
      <div class="report-note-heading">Comments :</div>
      <p>Calcitonin, a hormone produced by the thyroid gland, assisting in the diagnosis and monitoring of certain thyroid conditions, particularly medullary thyroid cancer, and evaluating the effectiveness of treatment.</p>
      <div class="report-note-heading">Calcitonin high levels causes :</div>
      <ul>
        <li>Medullary thyroid cancer Overproduction of calcitonin by cancer cells.</li>
        <li>Thyroid nodules Abnormal growths in the thyroid gland.</li>
        <li>Hyperparathyroidism Overactivity of the parathyroid glands.</li>
        <li>Chronic kidney disease Impaired kidney function affecting calcitonin levels.</li>
        <li>C-cell hyperplasia Increased number of C-cells in the thyroid gland.</li>
        <li>Inflammation or infection Inflammatory conditions or infections affecting calcitonin levels.</li>
        <li>Medications that can affect calcitonin production.</li>
      </ul>
      <div class="report-note-heading">Calcitonin low levels causes :</div>
      <ul>
        <li>Hypothyroidism Underactive thyroid gland affecting calcitonin levels.</li>
        <li>Thyroid removal Total or partial removal of the thyroid gland.</li>
        <li>Low protein intake Inadequate dietary protein affects calcitonin levels.</li>
        <li>Vitamin D deficiency Insufficient vitamin D levels affect calcitonin production.</li>
        <li>Hyperparathyroidism Overactivity of the parathyroid glands affects calcitonin levels.</li>
        <li>Medications that can lower calcitonin levels.</li>
        <li>End-stage renal disease Advanced kidney disease affecting calcitonin levels.</li>
      </ul>
    </div>
  `;
}

function buildInhibinAReportBody(test) {
  const result = findReportParameter(test, ["Inhibin A, Reproductive Marker", "Inhibin A", "Inhibin A, Serum"]) || {};
  const value = result.value || "-";
  const status = getUpperThresholdStatus(value, 97.5, "Very High");

  return `
    <table class="results-table hormone-table inhibin-a-table">
      <thead><tr><th style="width: 34%">Investigation</th><th style="width: 27%">Result</th><th style="width: 25%">Reference Value</th><th style="width: 14%">Unit</th></tr></thead>
      <tbody>
        <tr class="single-analyte-sample-row"><td><strong>Sample Type</strong></td><td>Serum (1 ml)</td><td colspan="2"><strong>TAT :</strong> 1 day (Normal: 1 - 3 days)</td></tr>
        <tr><td><strong>INHIBIN A, REPRODUCTIVE MARKER</strong><div class="single-analyte-method">CLIA</div></td><td><span class="${status?.className || ""}">${escapeHtml(value)}</span>${status ? ` <span class="single-analyte-status ${status.className}">${status.label}</span>` : ""}</td><td>&nbsp;</td><td>pg/mL</td></tr>
      </tbody>
    </table>
    <div class="single-analyte-notes hormone-notes inhibin-a-notes">
      <div class="single-analyte-heading">Interpretation</div>
      <table class="hormone-reference-table inhibin-a-reference-table">
        <thead><tr><th colspan="2">Reference Group</th><th>Reference Range (pg/mL)</th></tr></thead>
        <tbody>
          <tr><td colspan="3"><strong>Adult Females</strong></td></tr>
          <tr><td></td><td>Early follicular phase</td><td>1.8 - 17.3</td></tr>
          <tr><td></td><td>Mid follicular phase</td><td>3.5 - 31.7</td></tr>
          <tr><td></td><td>Late follicular phase</td><td>9.8 - 90.3</td></tr>
          <tr><td></td><td>Mid Cycle</td><td>16.9 - 91.8</td></tr>
          <tr><td></td><td>Early luteal phase</td><td>16.1 - 97.5</td></tr>
          <tr><td></td><td>Mid luteal phase</td><td>3.9 - 87.7</td></tr>
          <tr><td></td><td>Late luteal phase</td><td>2.7 - 47.1</td></tr>
          <tr><td></td><td>Post-Menopausal</td><td>&lt; 2.1</td></tr>
          <tr><td colspan="2"><strong>Adult Males</strong></td><td>&lt; 2.0</td></tr>
        </tbody>
      </table>
      <div class="report-note-heading">Comments:</div>
      <p>Prenatal Risk Assessment for Down syndrome.</p>
      <div class="report-note-heading">High Levels:</div>
      <p>In pregnancies affected by Down syndrome, Inhibin A levels exhibit a twofold increase compared to unaffected pregnancies. The inclusion of Inhibin A testing alongside AFP, beta HCG, and Free Estriol can enhance the detection rate by approximately 10%.</p>
      <p><strong>Low Levels:</strong> Menopause</p>
    </div>
  `;
}

function buildInhibinBReportBody(test) {
  return `
    ${buildDrlogyStyleAnalyteResultTable(test, {
      tableClass: "hormone-table inhibin-b-table",
      investigation: "INHIBIN B",
      aliases: ["Inhibin B, Serum", "Inhibin B", "Result"],
      method: "EIA",
      defaultRange: "151.70 - 173.90",
      defaultUnit: "pg/mL",
      sampleType: "Serum (1 ml)",
      turnaroundText: "2 days (Normal: 2 - 4 days)",
      statusForValue: (value) => getUpperThresholdStatus(value, 173.9, "Very High"),
    })}
    <div class="single-analyte-notes hormone-notes inhibin-b-notes">
      <div class="report-note-heading">Comments:</div>
      <p>Inhibins are protein hormones produced by Granulosa cells in females and Sertoli cells in males. In females, Inhibin B is primarily generated by small developing ovarian follicles and displays fluctuations during the menstrual cycle. It rises early in the follicular phase, reaching its peak during the mid-follicular phase, coinciding with a decline in FSH levels, and subsequently decreases in the late follicular phase. Elevated Inhibin B levels are observed in 89-100% of patients with Granulosa cell tumors and 55-60% of patients with Epithelial ovarian tumors. However, it&rsquo;s important to note that a normal Inhibin B level does not rule out the presence of Mucinous or Granulosa cell ovarian tumors.</p>
      <div class="report-note-heading">Interpretation:</div>
      <ol>
        <li><strong>Normal Range:</strong><ul><li>The specific reference range for inhibin B levels may vary depending on the laboratory and the individual&rsquo;s age and sex.</li><li>In females, normal inhibin B levels are typically associated with normal ovarian function and reproductive health.</li><li>In males, normal inhibin B levels are generally indicative of normal testicular function and spermatogenesis.</li></ul></li>
        <li><strong>Low Levels:</strong><ul><li>Decreased inhibin B levels may indicate:<ul><li>Ovarian dysfunction or failure in females.</li><li>Testicular dysfunction or impaired spermatogenesis in males.</li><li>Certain medical conditions affecting reproductive health, such as polycystic ovary syndrome (PCOS) in females or hypogonadism in males.</li></ul></li></ul></li>
        <li><strong>Elevated Levels:</strong><ul><li>Increased inhibin B levels may suggest:<ul><li>Granulosa cell tumors or other ovarian neoplasms in females.</li><li>Certain testicular tumors or conditions in males.</li><li>Other less common medical conditions or factors affecting inhibin B secretion and regulation.</li></ul></li></ul></li>
        <li><strong>Clinical Correlation:</strong><ul><li>Interpretation of INHIBIN B test results should be done in conjunction with clinical findings, medical history, other diagnostic tests, and imaging studies.</li><li>Abnormal inhibin B levels may necessitate further evaluation, including additional laboratory tests, imaging studies, and consultation with specialists in reproductive endocrinology or urology, depending on the clinical context.</li></ul></li>
      </ol>
      <div class="report-note-heading">Clinical Use:</div>
      <ul><li>In aiding the diagnosis and monitoring of Granulosa cell tumors and Mucinous epithelial ovarian tumors.</li><li>For assessing ovarian reserve; Inhibin B levels in the postmenopausal range may suggest diminished or depleted ovarian reserve.</li><li>As an adjunct to FSH testing in infertility evaluations.</li></ul>
    </div>
  `;
}

function buildPappAReportBody(test) {
  const gestation = findReportParameter(test, ["Weeks of Gestation", "Gestation Weeks", "Pregnancy Weeks"]) || {};
  const result = findReportParameter(test, ["PAPP-A", "PAPP-A, Serum", "Pregnancy Associated Plasma Protein-A"]) || {};
  const weeks = gestation.value || "-";
  const value = result.value || "-";
  const referenceValue = getPappAReferenceForWeek(weeks);
  const status = getPappAStatus(value, referenceValue);

  return `
    <table class="results-table hormone-table papp-a-table">
      <thead><tr><th style="width: 34%">Investigation</th><th style="width: 27%">Result</th><th style="width: 25%">Reference Value</th><th style="width: 14%">Unit</th></tr></thead>
      <tbody>
        <tr class="single-analyte-sample-row"><td><strong>Sample Type</strong></td><td>Serum (1 ml)</td><td colspan="2"><strong>TAT:</strong> 1 day (Normal: 1 - 3 days)</td></tr>
        <tr><td><strong>Weeks of Gestation</strong></td><td>${escapeHtml(weeks)}</td><td></td><td>weeks</td></tr>
        <tr><td><strong>PAPP-A</strong><div class="single-analyte-method">CLIA</div></td><td><span class="${status?.className || ""}">${escapeHtml(value)}</span>${status ? ` <span class="single-analyte-status ${status.className}">${status.label}</span>` : ""}</td><td>${referenceValue === null ? "-" : referenceValue.toFixed(2)}</td><td>mIU/mL</td></tr>
      </tbody>
    </table>
    <div class="single-analyte-notes hormone-notes papp-a-notes">
      <div class="single-analyte-heading">Interpretation</div>
      <table class="hormone-reference-table papp-a-reference-table"><thead><tr><th>Weeks of Gestation</th><th>PAPP-A (mIU/ml)</th></tr></thead><tbody><tr><td>9</td><td>0.90</td></tr><tr><td>10</td><td>1.40</td></tr><tr><td>11</td><td>2.19</td></tr><tr><td>12</td><td>3.42</td></tr><tr><td>13</td><td>5.34</td></tr></tbody></table>
      <div class="report-note-heading">Comments:</div>
      <p>Pregnancy-Associated Plasma Protein-A (PAPP-A) is a protein primarily secreted by the placenta, and its levels increase as the pregnancy progresses. While it is expressed in various tissues, the expression levels in these tissues are significantly lower. Interestingly, PAPP-A is found in unstable or ruptured coronary artery plaques but not in stable plaques.</p>
      <div class="report-note-heading">Elevated Levels:</div>
      <ul><li>Pregnancy</li><li>Acute Coronary Syndrome, including Unstable Angina and Myocardial Infarction</li></ul>
      <div class="report-note-heading">Decreased Levels:</div>
      <ul><li>Down Syndrome: Used as a marker for maternal screening</li><li>Edward Syndrome (Trisomy 18 anomaly)</li></ul>
      <div class="report-note-heading">Clinical Use:</div>
      <p>PAPP-A plays a crucial role in first-trimester prenatal screening, aiding in the assessment of potential chromosomal abnormalities in the developing fetus.</p>
    </div>
  `;
}

function buildDheasReportBody(test) {
  return `
    ${buildSingleAnalyteResultTable(test, {
      tableClass: "single-analyte-table hormone-table dheas-table",
      investigation: "DHEAS, SERUM",
      aliases: ["DHEAS, Serum", "DHEAS", "Dehydroepiandrosterone Sulphate (DHEAS)", "Dehydroepiandrosterone Sulfate (DHEAS)", "Result"],
      method: "CMIA",
      defaultRange: "167.90 - 591.90",
      defaultUnit: "µg/dL",
    })}
    <div class="single-analyte-notes hormone-notes">
      <div class="report-note-heading">Clinical Use :</div>
      <ul><li>Marker for Adrenal cortical function and disease</li><li>Differential diagnosis of virilized patient. In patients with virilizing tumors, DHEAS levels usually exceed 7000 µg/dL.</li></ul>
      <div class="report-note-heading">Increased levels :</div>
      <ul><li>Congenital Adrenal Hyperplasia</li><li>Adrenal carcinoma</li><li>Virilizing tumors of the Adrenal gland</li><li>Cushing's disease, pituitary dependent</li></ul>
      <div class="report-note-heading">Decreased Levels :</div>
      <ul><li>Addison's disease</li><li>Adrenal hypoplasia</li></ul>
    </div>
  `;
}

function formatCytologyText(value, fallback = "-") {
  const text = String(value || "").trim() || fallback;
  return escapeHtml(text).replace(/\r?\n/g, "<br>");
}

function getCytologyValue(test, aliases, fallback = "") {
  return findReportParameter(test, aliases)?.value || fallback;
}

function buildFnacReportBody(test) {
  const specimen = getCytologyValue(test, ["Specimen"], "Cervical / Vaginal Specimens");
  const clinicalHistory = getCytologyValue(
    test,
    ["Clinical History", "Clinical Data"],
    "• Early detection of cervical cancer by identifying abnormal changes in the cells of the cervix.\n• Screening for precancerous conditions, allowing for timely intervention and prevention of cervical cancer.\n• Detection of human papillomavirus (HPV) infection, which is a significant risk factor for cervical cancer.\n• Monitoring the effectiveness of treatment for cervical abnormalities or cervical cancer."
  );
  const gross = getCytologyValue(
    test,
    ["Gross", "Gross Description"],
    "Patient should avoid douches 48 to 72 hours prior to examination. Specimen should not be collected during or shortly after menstrual period. Excessive use of lubricating jelly on the vaginal speculum will interfere with cytologic examination."
  );
  const microscopic = getCytologyValue(
    test,
    ["Microscopic", "Microscopic Description"],
    "• Reactive or reparative cellular changes\n• Atypical squamous or glandular cells of undetermined significance\n• Cells in the premalignant or malignant category\n• In these cases, LabCorp will charge for the associated service. (Slides that are routinely reviewed by a pathologist for quality control purposes are not included.)"
  );
  const impression = getCytologyValue(
    test,
    ["Impression"],
    "Improperly labeled vial; specimen more than 21 days old (from collection date) in liquid-based preservative; specimen submitted in vial that expired according to manufacturer's label; frozen specimen."
  );
  const advised = getCytologyValue(
    test,
    ["Advised", "Advice"],
    "The cervix is the lower portion of your uterus. It forms the opening of your uterus and extends into your vagina, which is the passageway that leads from your uterus to the outside of your body."
  );
  const note = getCytologyValue(
    test,
    ["Note"],
    "The cells that form the lining of your cervix can undergo abnormal changes known as dysplasia. Most often, these changes are the result of infection with HPV, but they can also be caused by irritation, other infections, and hormonal changes."
  );
  const comments = getCytologyValue(
    test,
    ["Comments", "Comment"],
    "A Pap test is an exam in which a sample of cells is removed from your cervix, and the cells are viewed under a microscope to look for abnormal changes that could lead to cancer."
  );

  const rows = [
    ["Specimen", specimen],
    ["Clinical History", clinicalHistory],
    ["Gross", gross],
    ["Microscopic", microscopic],
    ["Impression", impression],
    ["Advised", advised],
    ["Note", note],
    ["Comments", comments],
  ];

  return `
    <div class="cytology-report-body fnac-report-body">
      <table class="cytology-report-table"><tbody>
        ${rows.map(([label, value]) => `<tr><th>${escapeHtml(label)}</th><td>${formatCytologyText(value)}</td></tr>`).join("")}
      </tbody></table>
    </div>
  `;
}

function buildPapSmearReportBody(test) {
  const specimen = getCytologyValue(test, ["Specimen"], "ThinPrep");
  const diagnosis = getCytologyValue(test, ["Pap Diagnosis", "Diagnosis"], "ATYPICAL SQUAMOUS CELLS OF UNDETERMINED SIGNIFICANCE (ASC-US)");
  const highRiskHpv = getCytologyValue(test, ["High Risk HPV Result", "High Risk HPV"], "DETECTED");
  const chlamydia = getCytologyValue(test, ["Chlamydia Trachomatis Results", "Chlamydia Trachomatis"], "not detected");
  const gonorrhoea = getCytologyValue(test, ["Neisseria Gonorrhoeae Results", "Neisseria Gonorrhoeae"], "not detected");
  const trichomonas = getCytologyValue(test, ["Trichomonas Vaginalis Results", "Trichomonas Vaginalis"], "not detected");
  const adequacy = getCytologyValue(test, ["Specimen Adequacy"], "Satisfactory for evaluation.");
  const findings = getCytologyValue(test, ["Additional Cytologic Findings", "Cytologic Findings"], "Endocervical/transformation zone component present");
  const comments = getCytologyValue(
    test,
    ["Comments", "Comment"],
    "The PAP smear is a screening test for cervical cancer with an inherent and irreducible false negative rate, the consequences of which may be minimized by obtaining regular annual PAP smears. Molecular testing was performed with either the APTIMA HPV Assay kit for the 14 high-risk types of HPV 16, 18, 31, 33, 35, 39, 45, 51, 52, 56, 58, 59, 66 and 68 (does not discriminate between the 14 high-risk types), APTIMA HPV 16 18/45 Genotype Assay kit, APTIMA Combo 2 (CT/GC) Assay kit, APTIMA Trichomonas vaginalis Assay kit, APTIMA Bacterial Vaginosis Assay kit, APTIMA CV/TV Assay kit for the detection of Candida Species, Candida Glabrata and Trichomonas, and/or the APTIMA Herpes Simplex virus types 1 & 2 Assay kit. All Assays have been FDA approved and are performed according to the manufacturers specifications. The laboratory is regulated under CLIA as qualified to perform high-complexity testing. This test is used for clinical purposes. It should not be regarded as investigational or for research."
  );

  return `
    <div class="cytology-report-body pap-smear-report-body">
      <div class="pap-smear-specimen"><strong>Specimen:</strong> ${formatCytologyText(specimen)}</div>
      <h3>Cytologic and Molecular Results</h3>
      <div class="cytology-field"><strong>Pap Diagnosis:</strong><div>${formatCytologyText(diagnosis)}</div></div>
      <div class="cytology-field"><strong>Molecular Results:</strong><div>HIGH RISK HPV RESULT: <span class="${getQualitativeResultStatus(highRiskHpv)?.className || ""}">${formatCytologyText(highRiskHpv)}</span></div><div>CHLAMYDIA TRACHOMATIS RESULTS: ${formatCytologyText(chlamydia)}</div><div>NEISSERIA GONORRHOEAE RESULTS: ${formatCytologyText(gonorrhoea)}</div><div>TRICHOMONAS VAGINALIS RESULTS: ${formatCytologyText(trichomonas)}</div></div>
      <div class="cytology-field"><strong>Additional Cytologic Findings</strong><div>SPECIMEN ADEQUACY: ${formatCytologyText(adequacy)}</div><div>${formatCytologyText(findings)}</div></div>
      <p class="cytology-comments">${formatCytologyText(comments)}</p>
    </div>
  `;
}

function formatHistopathologyText(value) {
  const text = String(value || "").trim();
  return text ? escapeHtml(text).replace(/\r?\n/g, "<br>") : "-";
}

function getHistopathologyTitle(test) {
  const name = normalizeParameterName(test?.name);
  const code = normalizeParameterName(test?.code);
  if (code === "colonbio001" || name.includes("colonoscopy") || name.includes("polypectomy")) return "HISTOPATHOLOGY COLONOSCOPY WITH POLYPECTOMY BIOPSY";
  if (code === "skinbio001" || name.includes("skinbiopsy")) return "HISTOPATHOLOGY SKIN BIOPSY";
  if (code === "pf058" || name.includes("liverbiopsy")) return "HISTOPATHOLOGY LIVER BIOPSY";
  if (code === "pf057" || name.includes("prostatebiopsy")) return "HISTOPATHOLOGY PROSTATE BIOPSY";
  return "HISTOPATHOLOGY REPORT";
}

function buildHistopathologyReportBody(test) {
  const getValue = (aliases) => findReportParameter(test, aliases)?.value || "";
  const clinicalData = getValue(["Clinical Data", "Clinical History"]);
  const specimen = getValue(["Specimen"]);
  const diagnosis = getValue(["Diagnosis", "Final Diagnosis"]);
  const note = getValue(["Note", "Comment"]);
  const grossDescription = getValue(["Gross Description"]);
  const microscopicDescription = getValue(["Microscopic Description"]);

  return `
    <div class="histopathology-report-body">
      <table class="histopathology-meta-table"><tbody>
        <tr><th>Clinical Data:</th><td>${formatHistopathologyText(clinicalData)}</td></tr>
        <tr><th>Specimen:</th><td>${formatHistopathologyText(specimen)}</td></tr>
      </tbody></table>
      <section class="histopathology-section"><div class="histopathology-heading">Diagnosis:</div><div class="histopathology-content histopathology-diagnosis">${formatHistopathologyText(diagnosis)}</div></section>
      <section class="histopathology-section"><div class="histopathology-heading">Note:</div><div class="histopathology-content">${formatHistopathologyText(note)}</div></section>
      <section class="histopathology-section"><div class="histopathology-heading">Gross Description:</div><div class="histopathology-content">${formatHistopathologyText(grossDescription)}</div></section>
      <section class="histopathology-section"><div class="histopathology-heading">Microscopic Description:</div><div class="histopathology-content">${formatHistopathologyText(microscopicDescription)}</div></section>
    </div>
  `;
}

function getQualitativeResultStatus(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized || normalized === "-") return null;
  if (normalized.includes("non-reactive") || normalized.includes("nonreactive") || normalized.includes("negative") || normalized.includes("not detected") || normalized.includes("absent")) {
    return { label: "Non-Reactive", className: "normal-val" };
  }
  if (normalized.includes("borderline") || normalized.includes("equivocal")) {
    return { label: "Borderline", className: "high-val" };
  }
  if (normalized.includes("reactive") || normalized.includes("positive") || normalized.includes("detected") || normalized.includes("present")) {
    return { label: "Reactive", className: "high-val" };
  }
  return null;
}

function getHavStatus(value, variant) {
  const parsed = Number.parseFloat(String(value || "").replace(/,/g, "").trim());
  if (!Number.isFinite(parsed)) return getQualitativeResultStatus(value);
  if (variant === "igg") {
    return parsed >= 1
      ? { label: "Reactive", className: "high-val" }
      : { label: "Non-Reactive", className: "normal-val" };
  }
  if (parsed > 1.2) return { label: "Reactive", className: "high-val" };
  if (parsed >= 0.8) return { label: "Borderline", className: "high-val" };
  return { label: "Non-Reactive", className: "normal-val" };
}

function buildTyphidotReportBody(test) {
  if (isHbsAgTest(test)) return buildHbsAgReportBody(test);
  if (isAntiHbcIgmTest(test)) return buildAntiHbcIgmReportBody(test);
  if (isHepatitisBProfileTest(test)) return buildHepatitisBProfileReportBody(test);
  if (isMantouxTest(test)) return buildMantouxReportBody(test);
  if (isHiv12ScreeningTest(test)) return buildHiv12ScreeningReportBody(test);
  if (isAntiBTitreTest(test)) return buildAntiBTitreReportBody(test);
  if (isAntiATitreTest(test)) return buildAntiATitreReportBody(test);
  if (isDustAllergyTest(test)) return buildDustAllergyReportBody(test);
  if (isDengueFeverPanelTest(test)) return buildDengueFeverPanelReportBody(test);
  if (isG6PdTest(test)) return buildG6PdReportBody(test);
  if (isAntiHbsTest(test)) return buildAntiHbsReportBody(test);
  if (isGangliosideGm1IggTest(test)) return buildGangliosideAntibodyReportBody(test, "GM1", "IgG");
  if (isGangliosideGm1IgmTest(test)) return buildGangliosideAntibodyReportBody(test, "GM1", "IgM");
  if (isGangliosideGd1aIggTest(test)) return buildGangliosideAntibodyReportBody(test, "GD1a", "IgG");
  if (isGangliosideGd1aIgmTest(test)) return buildGangliosideAntibodyReportBody(test, "GD1a", "IgM");
  if (isGangliosideGd1bIggTest(test)) return buildGangliosideAntibodyReportBody(test, "GD1b", "IgG");
  if (isGangliosideGq1bIggTest(test)) return buildGangliosideGq1bIggReportBody(test);
  if (isAntiHistoneAntibodiesTest(test)) return buildAntiHistoneAntibodiesReportBody(test);
  if (isRibosomePAntibodiesTest(test)) return buildRibosomePAntibodiesReportBody(test);
  if (isAntiCcpTest(test)) return buildAntiCcpReportBody(test);
  if (isImmunoglobulinIggTest(test)) return buildImmunoglobulinIggReportBody(test);
  if (isImmunoglobulinIgeTest(test)) return buildImmunoglobulinIgeReportBody(test);
  if (isImmunoglobulinIgmTest(test)) return buildImmunoglobulinIgmReportBody(test);
  if (isImmunoglobulinIgaTest(test)) return buildImmunoglobulinIgaReportBody(test);

  const aliases = ["Typhidot / Salmonella typhi, IgG", "Typhidot", "Typhi Dot", "Typhi Dot IgG & IgM", "Salmonella typhi", "Result"];
  return `
    ${buildInfectiousResultTable({
      test,
      investigation: "TYPHIDOT / SALMONELLA TYPHI, IgG",
      aliases,
      method: "ICT",
      resultMarkup: (value) => `<span class="${getQualitativeResultStatus(value)?.className || ""}">${escapeHtml(value)}</span>`,
    })}
    <div class="single-analyte-heading">Interpretation:</div>
    <table class="infectious-interpretation-table"><thead><tr><th>Result</th><th>Remarks</th></tr></thead><tbody><tr><td>Reactive</td><td>Indicates presence of IgG antibodies against Salmonella typhi and/or paratyphi.</td></tr><tr><td>Non-Reactive</td><td>Indicates absence of IgG antibodies against Salmonella typhi and/or paratyphi.</td></tr></tbody></table>
    <div class="single-analyte-notes infectious-notes">
      <div class="report-note-heading">Note:</div>
      <ol>
        <li>Positive results are seen in past/chronic Enteric fever caused by Salmonella typhi and/or paratyphi or immunized individuals.</li>
        <li>Negative results are seen in absence of Salmonella typhi and/or paratyphi infection. However, it does not rule out the disease.</li>
        <li>False positive results may be due to cross reactivity with other Salmonella spp., Dengue virus infection &amp; in patients with high levels of heterophile antibodies or Rheumatoid factor.</li>
        <li>False negative reaction may be due to processing of sample collected early in the course of disease, suboptimal level of antibodies and immunosuppression.</li>
        <li>The results obtained with this test should only be interpreted in conjunction with other diagnostic procedures and clinical findings.</li>
        <li>Test conducted on serum.</li>
      </ol>
      <div class="report-note-heading">Uses:</div>
      <ul><li>To diagnose chronic or past infection due to Salmonella typhi and/or paratyphi (Enteric fever).</li><li>To assess response to typhoid vaccination.</li></ul>
    </div>
  `;
}

function buildVdrlReportBody(test) {
  const aliases = ["VDRL (RPR), Serum", "VDRL", "RPR TEST", "RPR", "Result"];
  return `
    ${buildInfectiousResultTable({
      test,
      investigation: "VDRL (RPR), SERUM",
      aliases,
      method: "Charcoal flocculation",
      resultMarkup: (value) => `<span class="${getQualitativeResultStatus(value)?.className || ""}">${escapeHtml(value)}</span>`,
    })}
    <div class="single-analyte-heading">Interpretation:</div>
    <table class="infectious-interpretation-table"><thead><tr><th>Result</th><th>Remarks</th></tr></thead><tbody><tr><td>Reactive</td><td>Indicates presence of IgG &amp; IgM antibodies against non-treponemal antigens</td></tr><tr><td>Non-Reactive</td><td>Indicates absence of IgG &amp; IgM antibodies against non-treponemal antigens</td></tr></tbody></table>
    <div class="single-analyte-notes infectious-notes">
      <div class="report-note-heading">Note:</div>
      <ol>
        <li>Titers of ≥1: 8 and rising titres are significant.</li>
        <li>Titers are reported only in reactive cases.</li>
        <li>Positive result indicates ongoing or recent infection and the diagnosis should be confirmed by specific Treponemal tests such as TPHA &amp; FTA- AbS.</li>
        <li>The reactivity will vary with Primary (60-86%), Secondary (99%) and Tertiary (98%) stage of Syphilis.</li>
        <li>False positive results may be observed in patients of Malaria, Hepatitis, Mumps, Leprosy, Infectious Mononucleosis, Rheumatoid Arthritis and Collagen disease.</li>
        <li>False negative reaction may be due to processing of sample collected early in the course of disease, immunosuppression and due to prozone effect.</li>
        <li>Test conducted on serum.</li>
      </ol>
      <div class="report-note-heading">Uses:</div>
      <ul><li>To screen for presence of Syphilis infection.</li><li>To monitor the progression of disease.</li><li>To assess the response to therapy (decreasing titres) in patients being treated for Syphilis</li></ul>
    </div>
  `;
}

function buildHavIggReportBody(test) {
  const aliases = ["Anti HAV, IgG, Serum", "Anti HAV IgG", "HAV IgG", "Hepatitis A IgG", "Result"];
  const result = getInfectiousResult(test, aliases);
  const value = String(result.value || "").trim() || "-";
  const status = getHavStatus(value, "igg");
  return `
    ${buildInfectiousResultTable({
      test,
      investigation: "Anti HAV, IgG, SERUM",
      aliases,
      method: "CMIA",
      unit: "Index",
      referenceMarkup: `${status ? `<span class="${status.className}">${status.label}</span> ` : ""}&lt; 1.00`,
      resultMarkup: () => `<span class="${status?.className || ""}">${escapeHtml(value)}</span>`,
    })}
    <div class="single-analyte-heading">Interpretation:</div>
    <table class="infectious-interpretation-table hav-interpretation-table"><thead><tr><th>Result (Index)</th><th>Remarks</th></tr></thead><tbody><tr><td>&lt;1.00</td><td>Non Reactive</td></tr><tr><td>&gt;=1.00</td><td>Reactive</td></tr></tbody></table>
    <div class="single-analyte-notes infectious-notes">
      <div class="report-note-heading">Note:</div>
      <ol>
        <li>Reactive result indicates present or past exposure to HAV / recovery / immunity to HAV.</li>
        <li>Reactive result does not distinguish recent from past infection. To establish recent infection, Anti HAV IgM should be measured.</li>
        <li>False negative / positive results are observed in patients receiving mouse . monoclonal antibodies for diagnosis or therapy.</li>
        <li>For heparinized patients, draw specimen prior to heparin therapy as presence of fibrin leads to erroneous results.</li>
      </ol>
      <div class="report-note-heading">Comments:</div>
      <p>Hepatitis A Virus ( HAV) is a RNA virus of Picornavirus family transmitted by fecal- oral route. Infection with HAV is self limiting though 5-10% cases may show a secondary rise in enzymes. Since symptomatic Hepatitis A virus infections are clinically indistinguishable from Hepatitis B or C virus, serological testing is an extremely important tool to achieve proper diagnosis. Anti HAV IgG antibodies develop within 1-2 weeks of IgM antibodies and typically remain positive for life.</p>
    </div>
  `;
}

function buildHavIgmReportBody(test) {
  const aliases = ["Anti HAV, IgM, Serum", "Anti HAV IgM", "HAV IgM", "Hepatitis A IgM", "Result"];
  const result = getInfectiousResult(test, aliases);
  const value = String(result.value || "").trim() || "-";
  const status = getHavStatus(value, "igm");
  return `
    ${buildInfectiousResultTable({
      test,
      investigation: "Anti HAV, IgM, SERUM",
      aliases,
      method: "CMIA",
      unit: "Index",
      referenceMarkup: `${status ? `<span class="${status.className}">${status.label}</span> ` : ""}&lt; 0.80`,
      resultMarkup: () => `<span class="${status?.className || ""}">${escapeHtml(value)}</span>`,
    })}
    <div class="single-analyte-heading">Interpretation:</div>
    <table class="infectious-interpretation-table hav-interpretation-table"><thead><tr><th>Result (Index)</th><th>Remarks</th></tr></thead><tbody><tr><td>&lt;0.80</td><td>Non Reactive</td></tr><tr><td>0.80-1.20</td><td>Borderline Reactive</td></tr><tr><td>&gt;1.20</td><td>Reactive</td></tr></tbody></table>
    <div class="single-analyte-notes infectious-notes">
      <div class="report-note-heading">Note:</div>
      <ol>
        <li>Patients exhibiting Borderline Reactivity should be monitored at weekly intervals. This will distinguish rising Anti HAV- IgM levels associated with Acute Hepatitis A infection from decreasing or unchanging levels associated with recovery.</li>
        <li>Rheumatoid factor can give rise to false positive results</li>
        <li>Reactive results suggest recent HAV infection</li>
        <li>False negative / positive results are observed in patients receiving mouse monoclonal antibodies for diagnosis or therapy.</li>
        <li>For heparinized patients, draw specimen prior to heparin therapy as presence of fibrin leads to erroneous results.</li>
      </ol>
      <div class="report-note-heading">Comments:</div>
      <p>Hepatitis A Virus ( HAV) is a RNA virus of Picornavirus family transmitted by fecal- oral route. Infection with HAV is self limiting though 5-10% cases may show a secondary rise in enzymes. Since symptomatic Hepatitis A virus infections are clinically indistinguishable from Hepatitis B or C virus, serological testing is an extremely important tool to achieve proper diagnosis. During the acute phase of HAV infection, IgM appears in patient’s serum in nearly all cases at the onset of symptoms, peaks within the first month of illness and persists for 3- 6 months. It declines to undetectable levels within 12 months. The most effective diagnostic determination of HAV acute infection is the detection of Anti HAV- IgM.</p>
    </div>
  `;
}

function buildHcvRapidScreeningReportBody(test) {
  const aliases = ["HCV Rapid Screening Test, Serum", "HCV Rapid", "HCV Antibody", "Anti HCV Antibody", "Anti HCV", "Result"];
  return `
    ${buildInfectiousResultTable({
      test,
      investigation: "HCV RAPID SCREENING TEST, SERUM",
      aliases,
      method: "ICT",
      resultMarkup: (value) => `<span class="${getQualitativeResultStatus(value)?.className || ""}">${escapeHtml(value)}</span>`,
    })}
    <div class="single-analyte-heading">Interpretation:</div>
    <table class="infectious-interpretation-table"><thead><tr><th>Results</th><th>Remarks</th></tr></thead><tbody><tr><td><strong>Reactive</strong></td><td>Indicates presence of antibodies to Hepatitis C virus</td></tr><tr><td><strong>Non-Reactive</strong></td><td>Indicates absence of antibodies to Hepatitis C virus</td></tr></tbody></table>
    <div class="single-analyte-notes infectious-notes">
      <p><strong>* It is recommended to confirm all reactive results with the HCV antibody confirmatory test (S314)*</strong></p>
      <div class="report-note-heading">Note:</div>
      <ol>
        <li>Reactive test result indicates presence of Hepatitis C virus infection. It cannot differentiate between the stages of Hepatitis C viral infection nor used to monitor the efficacy of treatment.</li>
        <li>Non-Reactive test result indicates Hepatitis C virus infection is unlikely.</li>
        <li>False positive results may be observed in patients receiving mouse monoclonal antibodies, on heparin therapy, on biotin supplements for diagnosis or therapy or presence of heterophilic antibodies in serum.</li>
        <li>False negative reaction may be due to processing of sample collected early in the course of disease, Prozone phenomenon, Immunosuppression &amp; Immuno-incompetence.</li>
        <li>Test conducted on serum.</li>
      </ol>
      <div class="report-note-heading">Uses:</div>
      <ol><li>To diagnose suspected HCV infection in risk group.</li><li>Prenatal Screening of pregnant women and pre surgical/interventional procedures work up.</li></ol>
    </div>
  `;
}

function buildHbsAgReportBody(test) {
  const aliases = ["HBsAg, Serum", "HBsAg", "Hepatitis B Surface Antigen", "Result"];
  return `
    ${buildInfectiousResultTable({
      test,
      investigation: "HBsAg, SERUM",
      aliases,
      method: "CMIA",
      referenceMarkup: "Reactive / Non Reactive",
      resultMarkup: (value) => `<span class="${getQualitativeResultStatus(value)?.className || ""}">${escapeHtml(value)}</span>`,
    })}
    <div class="single-analyte-notes infectious-notes">
      <div class="report-note-heading">Note:</div>
      <ol>
        <li>All Reactive results are tested additionally by Specific antibody Neutralization assay . For further confirmation Molecular assays are recommended</li>
        <li>Discrepant results may be observed during pregnancy, patients receiving mouse monoclonal antibodies for diagnosis or therapy &amp; mutant forms of HBsAg</li>
        <li>For diagnostic purposes, results should be used in conjunction with clinical history and other hepatitis markers for Acute or Chronic infection</li>
        <li>For monitoring HBsAg levels, Quantitative HBsAg assay is recommended</li>
      </ol>
      <div class="report-note-heading">Comment :</div>
      <p>Hepatitis B Virus ( HBV) is a member of the Hepadna virus family causing infections of the liver with extremely variable clinical features. Hepatitis B is transmitted primarily by body fluids especially serum and also spread effectively sexually and from mother to baby. In most individuals HBV hepatitis is self limiting, but 1-2% normal adolescents and adults develop Chronic Hepatitis. Frequency of chronic HBV infection is 5-10% in immunocompromised patients and 80% in neonates. The initial serological marker of acute infection is HBsAg which typically appears 2-3 months after infection and disappears 12-20 weeks after onset of symptoms. Persistence of HBsAg for more than six months indicates development of carrier state or Chronic liver disease.</p>
      <div class="report-note-heading">Uses :</div>
      <ul>
        <li>Routine screening of blood and blood products to prevent transmission of Hepatitis B virus (HBV) to recipients</li>
        <li>To diagnose suspected HBV infection and monitor the status of infected individuals</li>
        <li>To evaluate the efficacy of antiviral drugs</li>
        <li>For Prenatal Screening of pregnant women</li>
      </ul>
    </div>
  `;
}

function getAntiHbcIgmStatus(value) {
  const numericValue = getNumericValue(value);
  if (!Number.isFinite(numericValue)) return getQualitativeResultStatus(value);
  return numericValue >= 1
    ? { label: "Reactive", className: "high-val" }
    : { label: "Non Reactive", className: "normal-val" };
}

function buildAntiHbcIgmReportBody(test) {
  const aliases = ["Anti- HBc, IgM, Serum", "Anti-HBc IgM", "Anti HBc IgM", "Hepatitis B Core Antibody IgM", "Result"];
  const result = getInfectiousResult(test, aliases);
  const value = String(result.value || "").trim() || "-";
  const status = getAntiHbcIgmStatus(value);
  return `
    ${buildInfectiousResultTable({
      test,
      investigation: "Anti- HBc, IgM, SERUM",
      aliases,
      method: "CMIA",
      unit: "Index",
      referenceMarkup: `${status ? `<span class="${status.className}">${status.label}</span> ` : ""}&lt; 1.00`,
      resultMarkup: () => `<span class="${status?.className || ""}">${escapeHtml(value)}</span>`,
    })}
    <div class="single-analyte-heading">INTERPRETATION :</div>
    <table class="infectious-interpretation-table anti-hbc-igm-interpretation-table">
      <thead><tr><th>Result (Index)</th><th>Remarks</th><th>Comments</th></tr></thead>
      <tbody><tr><td>&lt;1.00</td><td>Non Reactive</td><td>Not Detected</td></tr><tr><td>&gt;=1.00</td><td>Reactive</td><td>Acute HBV infection</td></tr></tbody>
    </table>
    <div class="single-analyte-notes infectious-notes">
      <div class="report-note-heading">Note:</div>
      <ol>
        <li>Discrepant results may be observed in patients receiving mouse monoclonal antibodies for diagnosis or therapy / Multiple myeloma / Rheumatoid arthritis</li>
        <li>For heparinized patients, draw specimen prior to heparin therapy as presence of fibrin leads to erroneous results</li>
      </ol>
      <div class="report-note-heading">Comments :</div>
      <p>Anti- HBc IgM is the earliest specific antibody appearing usually within 2 weeks after HBsAg. It is found in high titres for a short period during the acute phase that covers the serologic window and declines to low levels during recovery. It may be detectable upto 6 months. It may be the only serologic marker present after HBsAg and HBeAg have disappeared and HBsAb &amp; HBeAb have not appeared ( Serologic gap / window).</p>
      <div class="report-note-heading">Uses :</div>
      <p>To differentiate Acute &amp; Chronic HBV infection</p>
    </div>
  `;
}

function buildHepatitisBProfileReportBody(test) {
  const definitions = [
    ["Hepatitis B Surface Antigen (HBsAg), Quantitative", ["Hepatitis B Surface Antigen (HBsAg), Quantitative", "HBsAg Quantitative", "HBsAg"], "< 0.05", "IU/mL"],
    ["Hepatitis B Surface Antibody (Anti-HBs)", ["Hepatitis B Surface Antibody (Anti-HBs)", "Anti-HBs", "HBsAb"], "< 10.00", "mIU/mL"],
    ["Hepatitis B Core Antibody (Anti- HBc), IgM", ["Hepatitis B Core Antibody (Anti- HBc), IgM", "Anti-HBc IgM", "Anti HBc IgM"], "< 1.00", "Index"],
    ["Hepatitis B Core Antibody (Anti- HBc), Total", ["Hepatitis B Core Antibody (Anti- HBc), Total", "Anti-HBc Total", "Anti HBc Total"], "< 1.00", "Index"],
    ["Hepatitis Be Antigen (HBeAg)", ["Hepatitis Be Antigen (HBeAg)", "HBeAg", "Hepatitis B e Antigen"], "< 1.00", "Index"],
    ["Hepatitis Be Antibody (Anti-HBe)", ["Hepatitis Be Antibody (Anti-HBe)", "Anti-HBe", "HBeAb"], "> 1.00", "Index"],
  ];
  const rows = definitions.map(([label, aliases, defaultRange, defaultUnit]) => {
    const result = getInfectiousResult(test, aliases);
    const value = String(result.value || "").trim() || "-";
    const range = result.normal_range || defaultRange;
    const unit = result.unit || defaultUnit;
    return `<tr><td><strong>${escapeHtml(label)}</strong><div class="single-analyte-method">CMIA</div></td><td>${escapeHtml(value)}</td><td>${escapeHtml(range)}</td><td>${escapeHtml(unit)}</td></tr>`;
  }).join("");
  const interpretations = [
    ["Incubation period of HBV infection", "-", "-", "+", "-", "-", "-"],
    ["Acute HBV infection", "+", "+", "+", "-", "+", "-"],
    ["Recent Resolving HBV infection", "+", "+", "-", "+", "-", "+"],
    ["Acute HBV infection in Core window", "+", "+", "-", "-", "-", "-"],
    ["Active Chronic HBV infection", "-", "+", "+", "-", "+", "-"],
    ["Chronic HBV Carrier state", "-", "+", "+", "-", "-", "+"],
    ["Resolved HBV infection", "-", "+", "-", "+", "-", "+"],
    ["HBV Immunity after Vaccination", "-", "-", "-", "+", "-", "-"],
  ].map((row) => `<tr>${row.map((cell, index) => `<td${index ? " class=\"hbv-profile-marker\"" : ""}>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("");
  return `
    <table class="results-table hepatitis-b-profile-table">
      <thead><tr><th style="width: 40%">Investigation</th><th style="width: 25%">Result</th><th style="width: 25%">Reference Value</th><th style="width: 10%">Unit</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="single-analyte-heading">COMMENT :</div>
    <table class="infectious-interpretation-table hepatitis-b-profile-interpretation-table">
      <thead><tr><th>Interpretation</th><th>Anti-HBc IgM</th><th>Anti-HBc Total</th><th>HBsAg</th><th>Anti-HBs</th><th>HBeAg</th><th>Anti-HBe</th></tr></thead>
      <tbody>${interpretations}</tbody>
    </table>
  `;
}

function buildMantouxReportBody(test) {
  const dose = String(getInfectiousResult(test, ["Tuberculin Dose", "Dose"]).value || "").trim() || "0.1 mL of 1 TU PPD";
  const induration = String(getInfectiousResult(test, ["Induration (mm)", "Induration", "Induration Size"]).value || "").trim() || "-";
  const enteredResult = String(getInfectiousResult(test, ["Result after 48 hours", "Mantoux Result", "Result"]).value || "").trim();
  const result = enteredResult || "-";
  return `
    <table class="infectious-interpretation-table mantoux-result-table">
      <tbody>
        <tr><th>Tuberculin Dose</th><td>${escapeHtml(dose)}</td></tr>
        <tr><th>Induration (mm)</th><td>${escapeHtml(induration)}</td></tr>
        <tr><th>Result after 48 hours</th><td><strong class="${String(result).toLowerCase().includes("positive") ? "high-val" : ""}">${escapeHtml(result)}</strong></td></tr>
      </tbody>
    </table>
    <div class="single-analyte-notes infectious-notes mantoux-notes">
      <div class="report-note-heading">Interpretation :</div>
      <p>Induration measuring 10 mm or more is considered positive which shows hypersensitivity to tuberculoprotein. It indicates past or present infection with Mycobacterium tuberculosis.</p>
    </div>
    <table class="infectious-interpretation-table mantoux-interpretation-table">
      <thead><tr><th>Induration size</th><th>Interpretation</th></tr></thead>
      <tbody>
        <tr><td>&lt; 5 mm</td><td>A negative result, indicating no exposure to TB</td></tr>
        <tr><td>5-9 mm</td><td>Usually considered positive for people who are immunocompromised or have other risk factors for TB</td></tr>
        <tr><td>10-14 mm</td><td>Usually considered positive for people with medical risk factors for TB, recent immigrants from areas with high TB prevalence, or close contacts with people with TB</td></tr>
        <tr><td>≥ 15 mm</td><td>Usually considered positive for people with no known risk factors for TB</td></tr>
      </tbody>
    </table>
  `;
}

function buildHiv12ScreeningReportBody(test) {
  const valueFor = (aliases, fallback = "-") => String(getInfectiousResult(test, aliases).value || "").trim() || fallback;
  const finalResult = valueFor(["Final Result", "HIV Final Result"]);
  const methodOneIndex = valueFor(["Method 1 Index Value", "Index Value", "HIV 1 / 2 & P 24 Combo Index"]);
  const parsedMethodOneIndex = getNumericValue(methodOneIndex);
  const methodOneResult = valueFor(["Method 1 Result", "Method 1 HIV Result"], Number.isFinite(parsedMethodOneIndex) ? (parsedMethodOneIndex >= 1 ? "Positive" : "Negative") : "-");
  const methodTwoResult = valueFor(["Method 2 Result", "HIV 1 / 2 by Immunochromatography", "Method 2 HIV Result"]);
  const hivOne = valueFor(["HIV 1", "Method 3 HIV 1"]);
  const hivTwo = valueFor(["HIV 2", "Method 3 HIV 2"]);
  const valueMarkup = (value) => `<strong class="${getQualitativeResultStatus(value)?.className || ""}">${escapeHtml(value)}</strong>`;
  return `
    <table class="infectious-interpretation-table hiv-screening-table">
      <tbody>
        <tr><th style="width: 30%; text-align: center; font-size: 13px; font-weight: normal;">Final Result :</th><td>${valueMarkup(finalResult)}</td></tr>
        <tr><td colspan="2"><ul><li>Advised confirmation by HIV Western Blot (Test Code S063) for HIV-1</li><li>Advised confirmation at HIV-2 referral laboratory for HIV-2</li></ul></td></tr>
        <tr><td colspan="2"><strong>Method 1: HIV 1 / 2 &amp; P 24 COMBO TEST</strong><div class="single-analyte-method">(CLIA)</div><table class="hiv-method-values"><tr><td>Index Value</td><td>${valueMarkup(methodOneIndex)}</td><td><strong>&lt;1.00</strong></td><td><strong>Index</strong></td></tr><tr><td>Result</td><td colspan="3">${valueMarkup(methodOneResult)}</td></tr></table></td></tr>
        <tr><td colspan="2"><strong>Method 2: HIV 1 / 2 BY IMMUNOCHROMATOGRAPHY</strong><table class="hiv-method-values"><tr><td>Result</td><td colspan="3">${valueMarkup(methodTwoResult)}</td></tr></table></td></tr>
        <tr><td colspan="2"><strong>Method 3: HIV 1 / 2 BY FLOW THROUGH IMMUNOFILTRATION</strong><table class="hiv-method-values"><tr><td>Result</td><td colspan="3"></td></tr><tr><td>HIV 1</td><td colspan="3">${valueMarkup(hivOne)}</td></tr><tr><td>HIV 2</td><td colspan="3">${valueMarkup(hivTwo)}</td></tr></table></td></tr>
      </tbody>
    </table>
    <div class="single-analyte-notes infectious-notes hiv-screening-notes">
      <div class="report-note-heading">Note :</div>
      <ol>
        <li>Positive test result indicates antibody detected against HIV-1/2. It does not differentiate between type of antibody and antigen.</li>
        <li>Negative test result indicates antibody is not detected against HIV- 1/2.</li>
        <li>The indeterminate test result indicates antibodies to HIV-1/2 have been detected in the sample by two of three methods.</li>
        <li>False positive results may be observed in Autoimmune diseases, Alcoholic hepatitis, Primary biliary cirrhosis, Leprosy, Multiple pregnancies, Rheumatoid factor, and due to the presence of heterophile antibodies.</li>
        <li>False-negative results may occur during the window period and during the end stage of the disease.</li>
      </ol>
    </div>
  `;
}

function buildReferenceRangeAnalyteReportBody(test, {
  investigation,
  aliases,
  method,
  defaultRange,
  defaultUnit,
  body,
}) {
  const result = getInfectiousResult(test, aliases);
  const value = String(result.value || "").trim() || "-";
  const range = result.normal_range && result.normal_range !== "N/A" ? result.normal_range : defaultRange;
  const unit = result.unit && result.unit !== "N/A" ? result.unit : defaultUnit;
  const status = getReferenceStatus(value, range);
  const showStatus = status && status.label !== "Normal";

  return `
    ${buildInfectiousResultTable({
      test,
      investigation,
      aliases,
      method,
      unit,
      referenceMarkup: escapeHtml(range),
      resultMarkup: () => `<span class="${status?.className || ""}">${escapeHtml(value)}</span>${showStatus ? ` <span class="single-analyte-status ${status.className}">${status.label}</span>` : ""}`,
    })}
    ${body}
  `;
}

function buildAntiCcpReportBody(test) {
  return buildReferenceRangeAnalyteReportBody(test, {
    investigation: "ANTI CCP (CYCLIC CITRULLINATED PEPTIDE), SERUM",
    aliases: ["ANTI CCP (CYCLIC CITRULLINATED PEPTIDE), SERUM", "Anti CCP", "Anti-CCP", "Cyclic Citrullinated Peptide", "Result"],
    method: "CMIA",
    defaultRange: "< 5.00",
    defaultUnit: "U/mL",
    body: `
      <div class="single-analyte-notes infectious-notes">
        <div class="report-note-heading">Note :</div>
        <ol>
          <li>Sensitivity of this assay is 70.6% and specificity is 98.2%.</li>
          <li>Specificity of Anti CCP antibodies in Juvenile arthritis patients has not been established</li>
        </ol>
        <div class="report-note-heading">Comments :</div>
        <p>Anti CCP antibodies are useful for evaluating patients suspected of Rheumatoid arthritis. Positive results occur in 60-80% of Rheumatoid arthritis patients depending on disease severity. The positive predictive value of Anti CCP antibodies for Rheumatoid arthritis is far greater than Rheumatoid factor. False positive results are uncommon. Upto 30% patients with seronegative Rheumatoid arthritis also show Anti CCP antibodies.</p>
        <div class="report-note-heading">Clinical Uses :</div>
        <ul>
          <li>For diagnosis of early Rheumatoid arthritis - Anti CCP antibodies are detected in approximately 50-60% patients of Rheumatoid arthritis usually after 3-6 months of symptoms</li>
          <li>Prediction of severity of disease - Early Rheumatoid arthritis patients with Anti CCP positivity may develop a more erosive form of the disease as compared with Anti CCP negative patients</li>
          <li>To differentiate elderly onset Rheumatoid arthritis from Polymyalgia rheumatica and erosive SLE</li>
        </ul>
      </div>
    `,
  });
}

function buildImmunoglobulinIggReportBody(test) {
  return buildReferenceRangeAnalyteReportBody(test, {
    investigation: "IMMUNOGLOBULIN IgG, SERUM",
    aliases: ["IMMUNOGLOBULIN IgG, SERUM", "Immunoglobulin IgG", "Immunoglobulin G", "IgG", "Result"],
    method: "Immunoturbidimetry",
    defaultRange: "700.00 - 1600.00",
    defaultUnit: "mg/dL",
    body: `
      <div class="single-analyte-notes infectious-notes">
        <div class="report-note-heading">Comments :</div>
        <p>Approximately 80% of serum immunoglobulin is IgG whose main functions are defense against microorganisms, direct neutralization of toxins and induction of complement fixation. IgG is the only immunoglobulin that can cross the placental barrier and provide passive immune protection to the fetus and newborn. Near adult levels are reached by 18 months. Polyclonal IgG increase is seen in SLE, Chronic liver diseases, Infectious diseases and Cystic fibrosis. Monoclonal IgG increase is seen in IgG Myelomas. Decreased synthesis of IgG is found in Congenital and Acquired Immunodeficiency diseases and selective IgG subclass deficiency. Decreased IgG levels are seen in Protein losing enteropathies, Nephrotic syndrome and skin burns.</p>
      </div>
    `,
  });
}

function buildImmunoglobulinIgeReportBody(test) {
  return buildReferenceRangeAnalyteReportBody(test, {
    investigation: "IMMUNOGLOBULIN IgE, SERUM",
    aliases: ["IMMUNOGLOBULIN IgE, SERUM", "Immunoglobulin IgE", "Immunoglobulin E", "IgE", "Result"],
    method: "FEIA",
    defaultRange: "< 64.00",
    defaultUnit: "kUA/L",
    body: `
      <div class="single-analyte-notes infectious-notes">
        <div class="report-note-heading">Note:</div>
        <ol>
          <li>Normal levels of IgE do not rule out the possibility of IgE-dependent allergies as the diagnostic sensitivity of the test depends upon elapsed time between exposure to an allergen and testing, patient age, and affected target organs.</li>
          <li>No close correlation has been demonstrated between the severity of the allergic reaction and IgE levels.</li>
        </ol>
        <div class="report-note-heading">Comments :</div>
        <p>Immunoglobulin E (IgE) is the most important trigger molecule for allergic information. The level of IgE is low during the first year of life, gradually increases with age and reaches adult levels after 10 years. As IgE is a mediator of allergic response, quantitative measurement can provide useful information for differential diagnosis of atopic and non-atopic diseases. Patients with atopic diseases like Allergic asthma, Allergic rhinitis &amp; Atopic dermatitis have moderately elevated IgE levels.</p>
        <p><strong>Increased Levels</strong> - Atopic/Non-atopic allergy, Hyper IgE syndrome, Parasitic infections, IgE Myeloma, Pulmonary Aspergillosis, Immunodeficiency states &amp; Autoimmune diseases</p>
        <div class="report-note-heading">Uses :</div>
        <ul>
          <li>Evaluation of children with a strong family history of allergies and early clinical signs of disease</li>
          <li>Evaluation of children and adults suspected of having the allergic respiratory disease to establish the diagnosis and define the allergens</li>
          <li>To confirm clinical expression of sensitivity to foods in patients with Anaphylactic sensitivity or with Asthma, Angioedema or Cutaneous disease</li>
          <li>To evaluate sensitivity to insect venom allergens, particularly as an aid in defining venom specificity in those cases in which skin tests are equivocal</li>
          <li>To confirm the presence of IgE antibodies to certain occupational allergens</li>
        </ul>
      </div>
    `,
  });
}

function buildImmunoglobulinIgmReportBody(test) {
  return buildReferenceRangeAnalyteReportBody(test, {
    investigation: "IMMUNOGLOBULIN IgM, SERUM",
    aliases: ["IMMUNOGLOBULIN IgM, SERUM", "Immunoglobulin IgM", "Immunoglobulin M", "IgM", "Result"],
    method: "Immunoturbidimetry",
    defaultRange: "40.00 - 230.00",
    defaultUnit: "mg/dL",
    body: `
      <div class="single-analyte-notes infectious-notes">
        <div class="report-note-heading">Comments :</div>
        <p>IgM is the largest immunoglobulin molecule that makes 6% of the total immunoglobulins. It is the first specific antibody to appear in serum after infection which is capable of activating complement and killing bacteria. Post-infection IgM returns rapidly to normal levels as compared to IgG. If IgM is prevalent, the infection is acute whereas if IgG predominates, the infection is chronic. Polyclonal IgM increase is seen in viral, bacterial, and parasitic infections, Liver diseases, Rheumatoid arthritis, Scleroderma, Cystic fibrosis &amp; heroin addiction. Monoclonal IgM increase is seen in Waldenstrom macroglobulinemia. Decreased synthesis of IgM is found in Congenital and Acquired Immunodeficiency diseases. Decreased IgM levels are seen in Protein-losing enteropathies and skin burns.</p>
      </div>
    `,
  });
}

function buildImmunoglobulinIgaReportBody(test) {
  return buildReferenceRangeAnalyteReportBody(test, {
    investigation: "IMMUNOGLOBULIN IgA, SERUM",
    aliases: ["IMMUNOGLOBULIN IgA, SERUM", "Immunoglobulin IgA", "Immunoglobulin A", "IgA", "Result"],
    method: "Immunoturbidimetry",
    defaultRange: "70.00 - 400.00",
    defaultUnit: "mg/dL",
    body: `
      <div class="single-analyte-notes infectious-notes">
        <div class="report-note-heading">Comments :</div>
        <p>IgA accounts for 13% of total immunoglobulins and protects the skin &amp; mucosa against micro-organisms. It is capable of binding toxins &amp; in combination with Lysozyme develops anti-bacterial and anti-viral activities. IgA is the predominant immunoglobulin in body secretions like saliva, sweat and colostrum. Polyclonal IgA increase is seen in Chronic liver diseases, Chronic infections, Autoimmune disorders, Sarcoidosis and Wiscott - Aldrich syndrome. Monoclonal IgA increase is seen in IgA Myeloma. Decreased synthesis of IgA is found in Congenital and Acquired Immunodeficiency diseases. Decreased IgA levels are seen in Protein losing enteropathies and skin burns.</p>
      </div>
    `,
  });
}

function getAntiBTitreStatus(value) {
  const denominator = String(value || "").match(/:\s*(\d+(?:\.\d+)?)/);
  if (!denominator) return null;
  return Number(denominator[1]) <= 256
    ? { label: "Positive", className: "high-val" }
    : { label: "Negative", className: "normal-val" };
}

function buildAntiBTitreReportBody(test) {
  const result = getInfectiousResult(test, ["ANTI B TITRE, IgG", "Anti B Titre, IgG", "Anti B Titer, IgG", "Anti-B Titre", "Anti B Titre", "Result"]);
  const value = String(result.value || "").trim() || "-";
  const range = result.normal_range && result.normal_range !== "N/A" ? result.normal_range : "1:1 - 1:256";
  const unit = result.unit && result.unit !== "N/A" ? result.unit : "Titre";
  const status = getAntiBTitreStatus(value);

  return `
    <table class="results-table anti-b-titre-table">
      <thead><tr><th style="width: 40%">Investigation</th><th style="width: 25%">Result</th><th style="width: 25%">Reference Value</th><th style="width: 10%">Unit</th></tr></thead>
      <tbody>
        <tr class="single-analyte-sample-row"><td><strong>Sample Type</strong></td><td>Serum (2 ml)</td><td colspan="2"><strong>TAT :</strong> 24 hrs (Normal: 24 hrs)</td></tr>
        <tr><td><strong>ANTI B TITRE, IgG</strong><div class="single-analyte-method">Erythrocytes Magnetized Technology</div></td><td><span class="${status?.className || ""}">${escapeHtml(value)}</span>${status ? ` <span class="single-analyte-status ${status.className}">${status.label}</span>` : ""}</td><td>${escapeHtml(range)}</td><td>${escapeHtml(unit)}</td></tr>
      </tbody>
    </table>
    <div class="single-analyte-notes infectious-notes">
      <div class="report-note-heading">Note:</div>
      <p>The ABO blood group system classifies blood into different types based on the presence or absence of antigens (A and B) on the surface of red blood cells. Individuals can have blood types A, B, AB, or O.</p>
      <p>The test is performed to determine the presence and concentration of antibodies (specifically IgG antibodies) against the B antigen on red blood cells.</p>
      <div class="report-note-heading">Clinical Significance:</div>
      <p>The Anti B Titre test is particularly relevant in situations such as blood transfusions, organ transplants, and pregnancy. Knowing the antibody status is crucial to avoid transfusion reactions or complications during pregnancy, especially if there is a potential for blood type incompatibility.</p>
      <div class="report-note-heading">Interpretation:</div>
      <ul>
        <li>A positive result indicates the presence of anti-B antibodies, suggesting that the person has been sensitized to the B antigen.</li>
        <li>A negative result means that no significant level of anti-B antibodies was detected.</li>
      </ul>
    </div>
  `;
}

function getAntiATitreStatus(value) {
  const denominator = String(value || "").match(/:\s*(\d+(?:\.\d+)?)/);
  if (!denominator) return null;
  return Number(denominator[1]) <= 1024
    ? { label: "Positive", className: "high-val" }
    : { label: "Negative", className: "normal-val" };
}

function buildAntiATitreReportBody(test) {
  const result = getInfectiousResult(test, ["ANTI A TITRE, IgM", "Anti A Titre, IgM", "Anti A Titer, IgM", "Anti-A Titre", "Anti A Titre", "Result"]);
  const value = String(result.value || "").trim() || "-";
  const range = result.normal_range && result.normal_range !== "N/A" ? result.normal_range : "1:2 - 1:1024";
  const unit = result.unit && result.unit !== "N/A" ? result.unit : "Titre";
  const status = getAntiATitreStatus(value);

  return `
    <table class="results-table anti-a-titre-table">
      <thead><tr><th style="width: 40%">Investigation</th><th style="width: 25%">Result</th><th style="width: 25%">Reference Value</th><th style="width: 10%">Unit</th></tr></thead>
      <tbody>
        <tr class="single-analyte-sample-row"><td><strong>Sample Type</strong></td><td>Serum (2 ml)</td><td colspan="2"><strong>TAT :</strong> 24 hrs (Normal: 24 hrs)</td></tr>
        <tr><td><strong>ANTI A TITRE, IgM</strong><div class="single-analyte-method">Erythrocytes Magnetized Technology</div></td><td><span class="${status?.className || ""}">${escapeHtml(value)}</span>${status ? ` <span class="single-analyte-status ${status.className}">${status.label}</span>` : ""}</td><td>${escapeHtml(range)}</td><td>${escapeHtml(unit)}</td></tr>
      </tbody>
    </table>
    <div class="single-analyte-notes infectious-notes">
      <div class="report-note-heading">Note:</div>
      <p>The ABO blood group system classifies blood into different types based on the presence or absence of antigens (A and B) on the surface of red blood cells. Individuals can have blood types A, B, AB, or O.</p>
      <p>The test is performed to determine the presence and concentration of antibodies (specifically IgM antibodies) against the A antigen on red blood cells.</p>
      <div class="report-note-heading">Clinical Significance:</div>
      <p>The Anti-A Titre test is relevant in situations such as blood transfusions, organ transplants, and pregnancy. Knowing the antibody status is crucial to avoid transfusion reactions or complications during pregnancy, especially if there is a potential for blood type incompatibility.</p>
      <div class="report-note-heading">Interpretation:</div>
      <ul>
        <li>A positive result indicates the presence of anti-A antibodies, suggesting that the person has been sensitized to the A antigen.</li>
        <li>A negative result means that no significant level of anti-A antibodies was detected.</li>
      </ul>
    </div>
  `;
}

function getDustAllergyStatus(value) {
  const numericValue = getNumericValue(value);
  if (!Number.isFinite(numericValue)) return null;
  return numericValue <= 0.35
    ? { label: "Normal", className: "normal-val" }
    : { label: "High", className: "high-val" };
}

function buildDustAllergyReportBody(test) {
  const rows = [
    ["&lt;0.10", "Undetectable", "Unlikely"],
    ["0.10-0.50", "Very low", "Uncommon"],
    ["0.50-2.00", "Low", "Low"],
    ["2.00-15.00", "Moderate", "Common"],
    ["15.00-50.00", "High", "High"],
    ["50.00-100.00", "Very High", "Very High"],
    ["&gt;100.00", "Very High", "Very High"],
  ].map(([value, level, relation]) => `<tr><td>${value}</td><td>${level}</td><td>${relation}</td></tr>`).join("");

  return `
    ${buildDrlogyStyleAnalyteResultTable(test, {
      tableClass: "single-analyte-table dust-allergy-table",
      investigation: "ALLERGY, HOUSE DUST, IgE",
      aliases: ["ALLERGY, HOUSE DUST, IgE", "House Dust IgE", "Dust Allergy", "House Dust Allergy", "Result"],
      method: "FEIA",
      defaultRange: "< 0.35",
      defaultUnit: "kUA/L",
      sampleType: "Serum (1 ml)",
      turnaroundText: "1 days (Normal: 1 - 3 days)",
      statusForValue: getDustAllergyStatus,
    })}
    <div class="single-analyte-heading">Interpretation:</div>
    <table class="infectious-interpretation-table dust-allergy-interpretation-table"><thead><tr><th>Quantitative Result (kUA/L)</th><th>Level of Allergen Specific Antibody</th><th>Symptom Relation</th></tr></thead><tbody>${rows}</tbody></table>
    <div class="single-analyte-notes infectious-notes">
      <div class="report-note-heading">Note:</div>
      <ol>
        <li>Sensitized patients often exhibit elevated levels of specific allergens, with a direct correlation between the kUA/L value and the patient's exposure to the allergen.</li>
        <li>It is crucial to interpret all test results in the context of the patient's individual medical history.</li>
      </ol>
      <div class="report-note-heading">Comments:</div>
      <p>House dust, comprised of various allergenic elements such as molds, pet and human dander, cockroach waste, and mites, can trigger allergic reactions. Ordinary household dust is the primary culprit for allergic conditions, including asthma and upper respiratory tract infections. Remarkably, even after the elimination of the mites and cockroaches, their waste products can sustain allergic symptoms. House dust allergies are a leading environmental factor contributing to childhood asthma.</p>
      <div class="report-note-heading">Interpretation:</div>
      <p>This test measures the levels of specific immunoglobulin E (IgE) antibodies in response to dust mite allergens. Elevated levels suggest sensitivity or allergy to house dust mites, which are common indoor allergens. Interpretation is done in the context of clinical symptoms and medical history to assess the likelihood of allergic reactions.</p>
    </div>
  `;
}

function getDenguePanelStatus(value, variant) {
  const numericValue = getNumericValue(value);
  if (!Number.isFinite(numericValue)) return null;
  const thresholds = variant === "igg" ? { negative: 1.8, equivocal: 2.2 } : { negative: 0.9, equivocal: 1.1 };
  if (numericValue < thresholds.negative) return { label: "Negative", className: "normal-val" };
  if (numericValue <= thresholds.equivocal) return { label: "Equivocal", className: "high-val" };
  return { label: "Positive", className: "high-val" };
}

function buildDengueFeverPanelReportBody(test) {
  const definitions = [
    { key: "igg", label: "DENGUE FEVER ANTIBODY, IgG", aliases: ["DENGUE FEVER ANTIBODY, IgG", "Dengue IgG", "Dengue Fever Antibody IgG"], range: "1.80 - 2.20" },
    { key: "igm", label: "DENGUE FEVER ANTIBODY, IgM", aliases: ["DENGUE FEVER ANTIBODY, IgM", "Dengue IgM", "Dengue Fever Antibody IgM"], range: "0.90 - 1.10" },
  ];
  const rows = definitions.map((definition) => {
    const result = getInfectiousResult(test, definition.aliases);
    const value = String(result.value || "").trim() || "-";
    const range = result.normal_range && result.normal_range !== "N/A" ? result.normal_range : definition.range;
    const unit = result.unit && result.unit !== "N/A" ? result.unit : "Index";
    const status = getDenguePanelStatus(value, definition.key);
    return `<tr><td><strong>${definition.label}</strong><div class="single-analyte-method">ELISA</div></td><td><span class="${status?.className || ""}">${escapeHtml(value)}</span>${status ? ` <span class="single-analyte-status ${status.className}">${status.label}</span>` : ""}</td><td>${escapeHtml(range)}</td><td>${escapeHtml(unit)}</td></tr>`;
  }).join("");
  const dengueComment = "Dengue viruses belong to the family Flaviviridae and have 4 subtypes (1-4). Dengue virus is transmitted by the mosquito Aedes aegypti and Aedes albopictus, widely distributed in Tropical and Subtropical areas of the world. Dengue is considered to be the most important arthropod borne viral disease due to the human morbidity and mortality it causes. The disease may be subclinical, self limiting, febrile or may progress to a severe form of Dengue hemorrhagic fever or Dengue shock syndrome.";

  return `
    <table class="results-table dengue-fever-panel-table">
      <thead><tr><th style="width: 36%">Investigation</th><th style="width: 21%">Result</th><th style="width: 28%">Reference Value</th><th style="width: 15%">Unit</th></tr></thead>
      <tbody><tr class="single-analyte-sample-row"><td><strong>Sample Type</strong></td><td>Serum (2 ml)</td><td colspan="2"><strong>TAT :</strong> 1 day (Normal: 1 - 3 days)</td></tr>${rows}</tbody>
    </table>
    <table class="infectious-interpretation-table dengue-fever-panel-interpretation-table">
      <thead><tr><th colspan="3">Interpretation</th></tr><tr><th>Antibody</th><th>Result in Index</th><th>Remarks</th></tr></thead>
      <tbody>
        <tr><td rowspan="3"><strong>IgG</strong></td><td>Negative (&lt; 1.80)</td><td>No detectable IgG antibody indicating a presumptive evidence that the patients does not have secondary Dengue infection.</td></tr>
        <tr><td>Equivocal (1.80 - 2.20)</td><td>Retesting advised.</td></tr>
        <tr><td>Positive (&gt; 2.20)</td><td>IgG antibody detected indicating presumptive evidence that the patient has been recently exposed to/or currently infected with dengue virus</td></tr>
        <tr><td rowspan="3"><strong>IgM</strong></td><td>Negative (&lt; 0.90)</td><td>No detectable IgM antibody. Result does not rule out Dengue infection. Additional sample to be tested after 7-14 days if infection is suspected.</td></tr>
        <tr><td>Equivocal (0.90 - 1.10)</td><td>Retesting advised.</td></tr>
        <tr><td>Positive (&gt; 1.10)</td><td>IgM antibody detected. Suggestive of Primary / Secondary Dengue infection.</td></tr>
      </tbody>
    </table>
    <div class="single-analyte-notes infectious-notes">
      <div class="report-note-heading">Note :</div>
      <ol>
        <li>Recommended test is NS1 Antigen by ELISA in the first 5 days of fever. After 7-10 days of fever, the recommended test is Dengue fever antibodies IgG &amp; IgM by ELISA</li>
        <li>Cross reactivity is seen in the Flavivirus group between Dengue virus, Murray Valley encephalitis, Japanese encephalitis, Yellow fever &amp; West Nile viruses</li>
      </ol>
      <div class="report-note-heading">Comments :</div>
      <p>${dengueComment}</p>
    </div>
  `;
}

function buildG6PdReportBody(test) {
  return `
    ${buildSingleAnalyteResultTable(test, {
      tableClass: "single-analyte-table g6pd-table",
      investigation: "G-6-PD, NEWBORN SCREEN, WHOLE BLOOD",
      aliases: ["G-6-PD, NEWBORN SCREEN, WHOLE BLOOD", "G-6-PD", "G6PD", "Glucose-6-phosphate dehydrogenase", "Result"],
      method: "Delfia",
      defaultRange: "1.50 - 9.30",
      defaultUnit: "mIU/mL",
    })}
    <div class="single-analyte-heading">Interpretation :</div>
    <div class="single-analyte-notes infectious-notes">
      <div class="report-note-heading">Note :</div>
      <ol>
        <li>Results should be clinically correlated as individual / biological variations can affect the test results</li>
        <li>Test conducted on heel prick blood</li>
        <li>Recommended confirmation of deficient state is by quantitative estimation of G-6-PD in whole blood</li>
        <li>False negative results may be observed in heterozygous G6PD deficient females</li>
      </ol>
      <div class="report-note-heading">Comments :</div>
      <p>Glucose -6-Phosphate dehydrogenase (G-6-PD) deficiency is the most common enzymopathy affecting 400 million people worldwide. The disease is X-linked and more than 300 different types of G-6-PD variants have been described. Majority of G-6-PD deficient individuals are usually asymptomatic and develop hemolysis only when oxidative stress occurs as with bacterial / viral infections and after ingestion of certain drugs or fava beans.</p>
    </div>
    <table class="infectious-interpretation-table g6pd-classification-table">
      <thead><tr><th colspan="2">Classification of G-6-PD deficiency</th></tr></thead>
      <tbody>
        <tr><td><strong>Class I</strong></td><td>Severe deficiency associated with Chronic hemolytic anemia</td></tr>
        <tr><td><strong>Class II</strong></td><td>Severe deficiency (&lt;10% residual activity)usuallywithout Hemolytic anemia</td></tr>
        <tr><td><strong>Class III</strong></td><td>Moderate to mild deficiency (10-60% residual activity)</td></tr>
        <tr><td><strong>Class IV</strong></td><td>Very mild or no deficiency</td></tr>
        <tr><td><strong>Class V</strong></td><td>Increased activity</td></tr>
      </tbody>
    </table>
  `;
}

function buildAntiHbsReportBody(test) {
  const aliases = ["Anti- HBs, SERUM", "Anti-HBs", "Anti HBs", "HBsAb", "Result"];
  const result = getInfectiousResult(test, aliases);
  const value = String(result.value || "").trim() || "-";
  const range = result.normal_range && result.normal_range !== "N/A" ? result.normal_range : "< 10.00";
  const unit = result.unit && result.unit !== "N/A" ? result.unit : "mIU/mL";

  return `
    ${buildInfectiousResultTable({
      test,
      investigation: "Anti- HBs, SERUM",
      aliases,
      method: "CMIA",
      unit,
      referenceMarkup: escapeHtml(range),
      resultMarkup: () => `<strong>${escapeHtml(value)}</strong>`,
    })}
    <div class="single-analyte-heading">INTERPRETATION :</div>
    <table class="infectious-interpretation-table anti-hbs-interpretation-table">
      <thead><tr><th>Result in mIU/mL</th><th>Remarks</th><th>Comments</th></tr></thead>
      <tbody>
        <tr><td>&lt; 10.00</td><td>Non Reactive</td><td>Not Detected</td></tr>
        <tr><td>&gt;=10.00</td><td>Reactive</td><td><ul><li>Recent resolving HBV infection</li><li>Resolved HBV infection</li><li>HBV immunity after vaccination</li></ul></td></tr>
      </tbody>
    </table>
    <div class="single-analyte-notes infectious-notes">
      <div class="report-note-heading">Note:</div>
      <ol>
        <li>Discrepant results may be observed in patients receiving mouse monoclonal antibodies for diagnosis or therapy &amp; mutant forms of HBsAg</li>
        <li>For diagnostic purposes, results should be used in conjunction with clinical history and other hepatitis markers</li>
        <li>For heparinized patients, draw specimen prior to heparin therapy as presence of fibrin leads to erroneous results</li>
      </ol>
      <div class="report-note-heading">Comments :</div>
      <p>Anti HBs appears after HBsAg disappears and persists thereafter. It is rarely detected in the presence of HBsAg in patients with Acute Hepatitis B, but 10-20% of patients with Chronic Hepatitis B may show low levels of Anti HBs. Presence of Anti HBs has been shown to be important in protection against HBV infection. Passively acquired antibody to HBV as in the case of blood transfusion and recent immunoglobulin therapy does not signify immunity.</p>
      <div class="report-note-heading">Uses :</div>
      <ul><li>To monitor the success of Hepatitis B vaccination</li><li>To monitor the convalescence and recovery of Hepatitis B infected individuals</li><li>To indicate previous exposure to HBV in an asymptomatic individual</li></ul>
    </div>
  `;
}

function getPositiveNegativeStatus(value) {
  const normalizedValue = String(value || "").trim().toLowerCase();
  if (normalizedValue.includes("negative")) return { label: "Negative", className: "normal-val" };
  if (normalizedValue.includes("positive")) return { label: "Positive", className: "high-val" };
  return null;
}

function getGq1bTiterStatus(value) {
  const titer = String(value || "").match(/:\s*(\d+(?:\.\d+)?)/);
  if (!titer) return null;
  return Number(titer[1]) <= 100
    ? { label: "Normal", className: "normal-val" }
    : { label: "High", className: "high-val" };
}

function getAntiHistoneStatus(value) {
  const numericValue = getNumericValue(value);
  if (!Number.isFinite(numericValue)) return null;
  if (numericValue < 1) return { label: "Negative", className: "normal-val" };
  if (numericValue <= 1.5) return { label: "Borderline", className: "high-val" };
  return { label: "Positive", className: "high-val" };
}

function getRibosomePStatus(value) {
  const numericValue = getNumericValue(value);
  if (!Number.isFinite(numericValue)) return null;
  return numericValue < 1
    ? { label: "Negative", className: "normal-val" }
    : { label: "Positive", className: "high-val" };
}

function buildGangliosideAntibodyReportBody(test, antigen, immunoglobulinClass) {
  const antibodyName = `Ganglioside ${antigen} Antibody`;
  const aliases = [
    `${antibodyName} ${immunoglobulinClass}`,
    `${antibodyName}, ${immunoglobulinClass}`,
    `${antigen} Antibody ${immunoglobulinClass}`,
    "Result",
  ];
  const result = getInfectiousResult(test, aliases);
  const value = String(result.value || "").trim() || "-";
  const status = getPositiveNegativeStatus(value);

  return `
    <table class="results-table ganglioside-gm1-table">
      <thead><tr><th style="width: 40%">Investigation</th><th style="width: 25%">Result</th><th style="width: 25%">Reference Value</th><th style="width: 10%">Unit</th></tr></thead>
      <tbody>
        <tr class="single-analyte-sample-row"><td><strong>Sample Type</strong></td><td>Serum (1 ml)</td><td colspan="2"><strong>TAT:</strong> 5 days (Normal: 5 - 8 days)</td></tr>
        <tr><td><strong>${antibodyName} ${immunoglobulinClass}</strong><div class="single-analyte-method">Immunoblot</div></td><td><span class="${status?.className || ""}">${escapeHtml(value)}</span></td><td>&nbsp;</td><td>&nbsp;</td></tr>
      </tbody>
    </table>
    <div class="single-analyte-notes infectious-notes">
      <div class="report-note-heading">Comments:</div>
      <p>Guillain-Barre syndrome falls under the category of autoimmune peripheral neuropathies, encompassing a range of disorders that include Acute Inflammatory Demyelinating Polyradiculoneuropathy, Acute Motor Axonal Neuropathy, Miller Fisher syndrome, and Acute Motor and Sensory Axonal Neuropathy. These conditions are characterized by a sudden onset and the presence of Ganglioside antibodies, particularly GM1, Asialo GM1, and GD1b. These antibodies play a role in immune-mediated damage to the peripheral nerves.</p>
    </div>
    <table class="infectious-interpretation-table ganglioside-gm1-associated-diseases-table">
      <thead><tr><th>Antibodies</th><th>Immunoglobulin Class</th><th>Associated Disease</th></tr></thead>
      <tbody>
        <tr><td>GM1</td><td>IgM</td><td>Multifocal motor neuropathy</td></tr>
        <tr><td>GM1, GD1a, GT1b</td><td>IgM, IgG, IgA</td><td>Guillain - Barre syndrome</td></tr>
        <tr><td>GQ1b</td><td>IgG</td><td>Miller - Fisher syndrome</td></tr>
        <tr><td>GD1b</td><td>IgG</td><td>Sensory neuropathy</td></tr>
      </tbody>
    </table>
    <div class="single-analyte-notes infectious-notes">
      <div class="report-note-heading">Uses:</div>
      <p>This diagnostic assay plays a pivotal role in supporting the identification of neurological diseases, particularly primary motor neuron diseases and motor neuropathies.</p>
    </div>
  `;
}

function buildGangliosideGq1bIggReportBody(test) {
  return `
    ${buildDrlogyStyleAnalyteResultTable(test, {
      tableClass: "ganglioside-gq1b-table",
      investigation: "GANGLIOSIDE GQ1b ANTIBODY, IgG",
      aliases: ["GANGLIOSIDE GQ1b ANTIBODY, IgG", "Ganglioside GQ1b Antibody, IgG", "GQ1b Antibody IgG", "Result"],
      method: "EIA",
      defaultRange: "< 1:100",
      defaultUnit: "Titre",
      sampleType: "Serum (1 ml)",
      turnaroundText: "5 days (Normal: 4 - 9 days)",
      statusForValue: getGq1bTiterStatus,
    })}
    <div class="single-analyte-notes infectious-notes">
      <div class="report-note-heading">Comments:</div>
      <p>Ganglioside GQ1b Antibody IgG related to nerve and muscle functions. Moreover, GQ1b Antibody IgG has been identified in patients with conditions like Miller-Fisher syndrome, Guillain-Barré syndrome (GBS) and neurological disorders, especially those affecting muscle strength and nerve signaling.</p>
      <div class="report-note-heading">High Level Indicated</div>
      <ul><li>Guillain-Barré Syndrome</li><li>Miller Fisher Syndrome - Autoimmune neuropathy</li><li>Chronic Inflammatory Demyelinating Polyradiculoneuropathy (CIDP) -Neurological disorders</li><li>Bickerstaff Brainstem Encephalitis - Peripheral neuropathy</li></ul>
      <p>It's important to note that while the presence of Ganglioside GQ1b antibodies is associated with certain neurological conditions, the diagnosis is often made based on a combination of clinical symptoms, physical examination findings, and laboratory tests. The test results should be interpreted by a healthcare professional who takes into account the overall clinical picture.</p>
    </div>
  `;
}

function buildAntiHistoneAntibodiesReportBody(test) {
  return `
    ${buildDrlogyStyleAnalyteResultTable(test, {
      tableClass: "anti-histone-antibodies-table",
      investigation: "ANTI-HISTONE ANTIBODIES",
      aliases: ["ANTI-HISTONE ANTIBODIES", "Anti Histone Antibodies", "Histone Antibodies", "Result"],
      method: "ELISA",
      defaultRange: "< 1.00",
      defaultUnit: "Units",
      sampleType: "Serum (1 ml)",
      turnaroundText: "24 hrs (Normal: 1 - 4 days)",
      statusForValue: getAntiHistoneStatus,
    })}
    <table class="infectious-interpretation-table anti-histone-reference-table">
      <thead><tr><th>Reference Values (Units)</th><th>Remark</th></tr></thead>
      <tbody><tr><td>&lt; 1.0</td><td>Negative</td></tr><tr><td>1.0 - 1.5</td><td>Borderline</td></tr><tr><td>&gt; 1.5</td><td>Positive</td></tr><tr><td colspan="2"><strong>Reference values apply to all ages.</strong></td></tr></tbody>
    </table>
    <div class="single-analyte-notes infectious-notes">
      <div class="report-note-heading">Comments:</div>
      <ul>
        <li>The anti-histone antibodies test is a blood test that measures the presence of antibodies against histones, which are proteins that help package and organize DNA in the cell nucleus. This test is primarily used in the diagnosis and monitoring of autoimmune conditions, particularly drug-induced lupus erythematosus (DILE) and certain types of idiopathic (of unknown cause) systemic lupus erythematosus (SLE)</li>
        <li>Moreover, Histone antibodies have been identified in patients with conditions like Rheumatoid arthritis, Mixed connective tissue diseases, and Progressive scleroderma. This suggests their relevance in various autoimmune disorders beyond drug-induced Lupus erythematosus.</li>
        <li>Test is useful for Evaluating patients suspected of having drug-induced lupus</li>
        <li>Test is not useful for determining prognosis in patients with systemic lupus erythematosus or drug-induced lupus</li>
      </ul>
      <div class="report-note-heading">Interpretation:</div>
      <ul>
        <li><strong>Positive Result:</strong> A positive result indicates the presence of anti-histone antibodies in the blood. The interpretation of the result is usually done in conjunction with clinical symptoms and other laboratory tests. In the context of drug-induced lupus, a positive result may suggest a connection between the use of certain medications and the development of lupus-like symptoms.</li>
        <li><strong>Borderline Result:</strong> A borderline result typically falls in a range that is neither clearly positive nor clearly negative, and additional factors need to be taken into account for a comprehensive assessment. Here are some considerations like Clinical Symptoms, Other Laboratory Tests, Medical History, Follow-Up Testing, and Clinical Judgment.</li>
        <li><strong>Negative Result:</strong> A negative result means that anti-histone antibodies were not detected in the blood. However, it's essential to note that a negative result does not rule out the possibility of other autoimmune conditions, and further testing may be needed based on clinical judgment.</li>
      </ul>
    </div>
  `;
}

function buildRibosomePAntibodiesReportBody(test) {
  return `
    ${buildDrlogyStyleAnalyteResultTable(test, {
      tableClass: "ribosome-p-antibodies-table",
      investigation: "Ribosome P Antibodies, IgG",
      aliases: ["Ribosome P Antibodies, IgG", "Ribosome P Antibodies", "Ribosomal P Antibodies", "Result"],
      method: "Immunoassay",
      defaultRange: "< 1.0",
      defaultUnit: "U",
      sampleType: "Serum (1 ml)",
      turnaroundText: "1 day (Normal: 1 - 3 days)",
      statusForValue: getRibosomePStatus,
    })}
    <div class="single-analyte-notes infectious-notes">
      <div class="report-note-heading">Comments:</div>
      <p>Ribosomal P antibodies, also referred to as anti-ribosomal P antibodies or anti-P protein antibodies, are a group of autoantibodies associated with autoimmune diseases, notably systemic lupus erythematosus (SLE) and, in some instances, lupus-related central nervous system (CNS) involvement.</p>
      <p>Systemic Lupus Erythematosus (SLE) is characterized by an autoimmune response where the body's immune system erroneously targets healthy tissues in various organs and systems throughout the body.</p>
      <div class="report-note-heading">Interpretation:</div>
      <ol>
        <li>Positive Result:<ul><li>The presence of RIBOSOME P antibodies in the serum indicates a potential association with autoimmune conditions, particularly systemic lupus erythematosus (SLE).</li><li>However, it is essential to interpret the results in the context of clinical symptoms, other laboratory findings, and medical history to make an accurate diagnosis.</li></ul></li>
        <li>Negative Result:<ul><li>A negative result suggests that RIBOSOME P antibodies were not detected in the serum sample.</li><li>It is important to note that the absence of these antibodies does not completely rule out the possibility of autoimmune diseases like SLE, as other tests and clinical evaluations may be necessary for a comprehensive diagnosis.</li></ul></li>
        <li>Clinical Correlation:<ul><li>The presence or absence of RIBOSOME P antibodies should be interpreted in conjunction with clinical findings, other laboratory tests, and imaging studies.</li><li>A positive result may guide further diagnostic evaluation and management strategies, while a negative result may necessitate additional testing or consideration of alternative diagnoses.</li></ul></li>
      </ol>
    </div>
  `;
}

function buildVitaminEReportBody(test) {
  const result = findReportParameter(test, ["Vitamin E (Tocopherol)", "Vitamin E", "Tocopherol", "Result"]) || {};
  const value = result.value || "-";
  const range = result.normal_range && result.normal_range !== "N/A" ? result.normal_range : "5.00 - 18.00";
  const unit = result.unit && result.unit !== "N/A" ? result.unit : "mg/L";
  const status = getReferenceStatus(value, range);

  return `
    <table class="results-table vitamin-e-table">
      <thead><tr><th style="width: 40%">Investigation</th><th style="width: 25%">Result</th><th style="width: 23%">Reference Value</th><th style="width: 12%">Unit</th></tr></thead>
      <tbody>
        <tr class="vitamin-e-sample-row"><td><strong>Sample Type</strong></td><td>Serum (2 ml)</td><td colspan="2"><strong>TAT :</strong> 1 hr (Normal: 1 - 4 hrs)</td></tr>
        <tr><td><strong>VITAMIN E (TOCOPHEROL)</strong><div class="single-analyte-method">HPLC</div></td><td><span class="${status?.className || ""}">${escapeHtml(value)}</span>${status ? ` <span class="single-analyte-status ${status.className}">${status.label}</span>` : ""}</td><td>${escapeHtml(range)}</td><td>${escapeHtml(unit)}</td></tr>
      </tbody>
    </table>
    <table class="vitamin-e-reference-table"><thead><tr><th>Reference Group</th><th>Reference Range in mg/L</th></tr></thead><tbody><tr><td>Premature infants</td><td>1 - 5</td></tr><tr><td>1 - 12 years</td><td>3 - 9</td></tr><tr><td>13 - 19 years</td><td>6 - 10</td></tr><tr><td>Adults</td><td>5 - 18</td></tr></tbody></table>
    <table class="vitamin-e-interpretation-table"><thead><tr><th>Interpretation</th><th>Level of Vit. E (mg/L)</th></tr></thead><tbody><tr><td>Significant deficiency</td><td>&lt; 3</td></tr><tr><td>Significant excess</td><td>&gt; 40</td></tr></tbody></table>
    <div class="single-analyte-notes vitamin-e-notes">
      <div class="report-note-heading">Comments:</div>
      <p>Vitamin E, also known as tocopherol, is a fat-soluble vitamin renowned for its antioxidant properties. Notably, corn and soybeans are abundant sources of this vitamin. Although deficiency is rare, it may manifest due to factors such as malabsorption, total parenteral nutrition, and prematurity in infants. In children, a deficiency can lead to reversible motor and sensory neuropathies. The potential toxicity of Vitamin E remains unclear, but low blood levels are linked to Abetalipoproteinemia. Furthermore, chronic excessive intake has been suggested as a contributor to Thrombophlebitis.</p>
      <div class="report-note-heading">Use:</div>
      <ol><li>Assessment of individuals experiencing motor and sensory neuropathies.</li><li>Monitoring the Vitamin E status of premature infants requiring oxygenation.</li><li>Examination of individuals with lipid malabsorption in the intestines.</li></ol>
    </div>
  `;
}

function buildVitaminB9ReportBody(test) {
  const parameters = [
    { name: "FOLATE, SERUM", aliases: ["Folate, Serum", "Folate Serum", "Folic Acid", "Result"], range: "> 5.38" },
    { name: "FOLATE, RBC", aliases: ["Folate, RBC", "RBC Folate", "Folate RBC"], range: "280.00 - 791.00" },
  ];
  const rows = parameters.map((definition) => {
    const result = findReportParameter(test, definition.aliases) || {};
    const value = result.value || "-";
    const range = result.normal_range && result.normal_range !== "N/A" ? result.normal_range : definition.range;
    const unit = result.unit && result.unit !== "N/A" ? result.unit : "ng/mL";
    const status = getReferenceStatus(value, range);
    return `<tr><td><strong>${definition.name}</strong><div class="single-analyte-method">CLIA</div></td><td><span class="${status?.className || ""}">${escapeHtml(value)}</span>${status ? ` <span class="single-analyte-status ${status.className}">${status.label}</span>` : ""}</td><td>${escapeHtml(range)}</td><td>${escapeHtml(unit)}</td></tr>`;
  }).join("");

  return `
    <table class="results-table vitamin-b9-table">
      <thead><tr><th style="width: 34%">Investigation</th><th style="width: 27%">Result</th><th style="width: 25%">Reference Value</th><th style="width: 14%">Unit</th></tr></thead>
      <tbody><tr class="vitamin-b9-section"><td colspan="4">VITAMIN B9</td></tr>${rows}</tbody>
    </table>
    <div class="single-analyte-notes vitamin-b9-notes">
      <div class="report-note-heading">Note :</div>
      <ol><li>Drugs like Methotrexate &amp; Leucovorin interfere with folate measurement.</li><li>RBC folate concentration is indicative of tissue stores. It reflects the folate status over a period of 120 days.</li></ol>
      <div class="report-note-heading">Comments :</div>
      <p>Folate plays an important role in the synthesis of purine &amp; pyrimidines in the body and is important for the maturation of erythrocytes. It is widely available from plants and to a lesser extent organ meats, but more than half the folate content of food is lost during cooking. Folate deficiency is commonly prevalent in alcoholic liver disease, pregnancy and the elderly. It may result from poor intestinal absorption, nutrition deficiency, excessive demand as in pregnancy or in malignancy and in response to certain drugs like Methotrexate &amp; anticonvulsants.</p>
      <div class="report-note-heading">Decreased Levels :</div>
      <p>Megaloblastic anemia, Infantile hyperthyroidism, Alcoholism, Malnutrition, Scurvy, Liver disease, B12 deficiency, dietary amino acid excess, adult Celiac disease, Tropical Sprue, Crohn's disease, Hemolytic anemias, Carcinomas, Myelofibrosis, vitamin B6 deficiency, pregnancy, Whipple's disease, extensive intestinal resection and severe exfoliative dermatitis.</p>
    </div>
  `;
}

function buildVitaminKReportBody(test) {
  return `
    ${buildSingleAnalyteResultTable(test, {
      tableClass: "single-analyte-table vitamin-k-table",
      investigation: "VITAMIN K1, SERUM",
      aliases: ["Vitamin K1, Serum", "Vitamin K", "Vitamin K1", "Phylloquinone", "Result"],
      method: "",
      defaultRange: "0.20 - 3.20",
      defaultUnit: "ng/mL",
    })}
    <div class="single-analyte-notes vitamin-k-notes">
      <div class="report-note-heading">Note:</div>
      <ul><li>Vitamin K is an important nutrient that helps the body form blood clots, which can prevent excessive bleeding.</li><li>The test may be used to monitor the effectiveness of Vitamin K supplementation in people who have a deficiency.</li></ul>
    </div>
    <div class="single-analyte-heading">Interpretation :</div>
    <table class="vitamin-k-interpretation-table"><thead><tr><th>Vitamin K1 level (ng/mL)</th><th>Interpretation</th></tr></thead><tbody><tr><td>&lt; 0.2</td><td>Deficient</td></tr><tr><td>0.2 - 3.2</td><td>Normal</td></tr><tr><td>&gt; 3.2</td><td>Excessive</td></tr></tbody></table>
  `;
}

function buildLipidRecommendationTable() {
  return `
    <table class="lipid-recommendation-table single-cholesterol-recommendation-table">
      <thead>
        <tr><th>NLA - 2014<br />RECOMMENDATIONS</th><th>Total Cholesterol<br />(mg/dL)</th><th>HDL Cholesterol<br />(mg/dL)</th><th>LDL Cholesterol<br />(mg/dL)</th><th>Triglycerides<br />(mg/dL)</th></tr>
      </thead>
      <tbody>
        <tr><td>Desirable</td><td>&lt; 200</td><td>&gt; 40</td><td>&lt; 100</td><td>&lt; 150</td></tr>
        <tr><td>Above Desirable</td><td></td><td></td><td>100 - 129</td><td></td></tr>
        <tr><td>Borderline High</td><td>200 - 239</td><td></td><td>130 - 159</td><td>150 - 199</td></tr>
        <tr><td>High</td><td>&ge; 240</td><td></td><td>160 - 189</td><td>200 - 499</td></tr>
        <tr><td>Very High</td><td></td><td></td><td>&ge; 190</td><td>&ge; 500</td></tr>
      </tbody>
    </table>
  `;
}

function buildCholesterolReportBody(test, definition) {
  return `
    ${buildSingleAnalyteResultTable(test, {
      tableClass: `single-analyte-table single-cholesterol-table ${definition.tableClass}`,
      investigation: definition.investigation,
      aliases: definition.aliases,
      method: definition.method,
      defaultRange: definition.defaultRange,
      defaultUnit: "mg/dL",
      statusForValue: (value) => getLipidStatus(definition.lipidType, value),
    })}
    <div class="single-analyte-notes single-cholesterol-notes">
      <div class="report-note-heading">Note :</div>
      <p>${definition.note}</p>
    </div>
    ${buildLipidRecommendationTable()}
    <div class="single-analyte-notes single-cholesterol-notes">
      <div class="report-note-heading">Note :</div>
      <ol>
        <li>Measurements in the same patient can show physiological &amp; analytical variations. Three serial samples 1 week apart are recommended for Total Cholesterol, Triglycerides, HDL &amp; LDL Cholesterol.</li>
        <li>As per NLA-2014 guidelines, all adults above the age of 20 years should be screened for lipid status. Selective screening of children above the age of 2 years with a family history of premature cardiovascular disease or those with at least one parent with high total cholesterol is recommended.</li>
      </ol>
    </div>
  `;
}

function buildLdlCholesterolReportBody(test) {
  return buildCholesterolReportBody(test, {
    tableClass: "ldl-cholesterol-table",
    investigation: "LDL Cholesterol",
    aliases: ["LDL Cholesterol", "LDL-C", "Low Density Lipoprotein Cholesterol", "Result"],
    method: "Calculated",
    defaultRange: "< 100.00",
    lipidType: "ldl",
    note: "LDL cholesterol test is a blood test that measures the level of low-density lipoprotein (LDL) cholesterol in the blood, which is commonly known as \"bad cholesterol\". LDL cholesterol is often estimated from HDL and VLDL results taken during a lipid panel test, although a direct LDL measurement may also be used.",
  });
}

function buildHdlCholesterolReportBody(test) {
  return buildCholesterolReportBody(test, {
    tableClass: "hdl-cholesterol-table",
    investigation: "HDL Cholesterol",
    aliases: ["HDL Cholesterol", "HDL-C", "High Density Lipoprotein Cholesterol", "Result"],
    method: "Spectrophotometry",
    defaultRange: "> 40.00",
    lipidType: "hdl",
    note: "An HDL cholesterol test (high-density lipoprotein) measures the amount of cholesterol found inside high-density lipoproteins (HDL) in a sample of your blood. HDL cholesterol is considered \"good cholesterol\" and is associated with a lower risk of coronary heart disease events.",
  });
}

function buildIndirectBilirubinReportBody(test) {
  return buildSingleAnalyteResultTable(test, {
    tableClass: "single-analyte-table indirect-bilirubin-table",
    investigation: "BILIRUBIN, INDIRECT, SERUM",
    aliases: ["Bilirubin, Indirect, Serum", "Bilirubin Indirect", "Indirect Bilirubin", "Result"],
    method: "Calculated",
    defaultRange: "< 1.10",
    defaultUnit: "mg/dL",
  });
}

function buildCalciumReportBody(test) {
  return `
    ${buildSingleAnalyteResultTable(test, {
      tableClass: "single-analyte-table calcium-table",
      investigation: "CALCIUM, SERUM",
      aliases: ["Calcium, Serum", "Serum Calcium", "Total Calcium", "Calcium", "Result"],
      method: "Arsenazo III",
      defaultRange: "8.6 - 10.2",
      defaultUnit: "mg/dL",
    })}
    <div class="single-analyte-notes calcium-notes">
      <div class="report-note-heading">Clinical Use :</div>
      <p>Calcium helps assess bone health, monitor kidney function, and detect disorders related to calcium levels in the body.</p>
      <div class="report-note-heading">Calcium High Levels Causes :</div>
      <p>Here are the potential causes of high calcium levels (hypercalcemia).</p>
      <ul>
        <li>Hyperparathyroidism - Overactive parathyroid glands</li>
        <li>Cancer - Certain types of cancer, such as lung or breast cancer</li>
        <li>Vitamin D toxicity - Excessive intake of vitamin D</li>
        <li>Hyperthyroidism - Overactive thyroid gland</li>
        <li>Prolonged immobilization - Long periods of inactivity or immobility</li>
      </ul>
      <div class="report-note-heading">Calcium Low Levels Causes :</div>
      <p>Here are the potential causes of low calcium levels (hypocalcemia).</p>
      <ul>
        <li>Hypoparathyroidism - Underactive parathyroid glands</li>
        <li>Kidney disease - Impaired kidney function</li>
        <li>Vitamin D deficiency - Inadequate intake or absorption of vitamin D</li>
        <li>Malabsorption - Inability to absorb calcium from the digestive tract</li>
        <li>Hypoalbuminemia - Low levels of albumin in the blood</li>
      </ul>
    </div>
  `;
}

function buildFerritinReportBody(test) {
  return `
    ${buildSingleAnalyteResultTable(test, {
      tableClass: "single-analyte-table ferritin-table",
      investigation: "FERRITIN, SERUM",
      aliases: ["Ferritin, Serum", "Serum Ferritin", "Ferritin", "Result"],
      method: "CLIA",
      defaultRange: "22.00 - 322.00",
      defaultUnit: "ng/mL",
    })}
    <div class="single-analyte-notes ferritin-notes">
      <div class="report-note-heading">Note :</div>
      <p>An increase in serum ferritin due to inflammatory conditions (acute-phase response) can mask iron deficiency.</p>
      <div class="report-note-heading">Comments :</div>
      <p>Serum ferritin is generally in equilibrium with tissue ferritin and is a useful indicator of stored iron in healthy individuals and many clinical settings. In some hepatocellular diseases, malignancies, and inflammatory disorders, ferritin may overestimate iron stores because it is an acute-phase reactant. In these settings, iron deficiency anemia may coexist with a normal ferritin concentration. In the presence of inflammation, people with low serum ferritin are likely to respond to iron therapy.</p>
      <div class="report-note-heading">Increased Levels :</div>
      <ul>
        <li>Iron overload - Hemochromatosis, thalassemia, and sideroblastic anemia</li>
        <li>Malignant conditions - Acute myeloblastic and lymphoblastic leukemia, Hodgkin's disease, and breast carcinoma</li>
        <li>Inflammatory diseases - Pulmonary infections, osteomyelitis, chronic UTI, rheumatoid arthritis, SLE, and burns</li>
        <li>Acute and chronic hepatocellular disease</li>
      </ul>
    </div>
  `;
}

function buildCPeptideReportBody(test) {
  return `
    ${buildSingleAnalyteResultTable(test, {
      tableClass: "single-analyte-table c-peptide-table",
      investigation: "C-PEPTIDE FASTING, SERUM",
      aliases: ["C-Peptide Fasting, Serum", "C-Peptide Level", "C-Peptide", "C Peptide", "Result"],
      method: "CLIA",
      defaultRange: "0.50 - 2.00",
      defaultUnit: "ng/mL",
    })}
    <div class="single-analyte-notes c-peptide-notes">
      <div class="report-note-heading">Note:</div>
      <p>C-peptide and insulin are released in equal amounts when the pancreas produces insulin, but C-peptide remains in the bloodstream longer. Results should be interpreted with the clinical context, glucose, and insulin results.</p>
      <div class="report-note-heading">Clinical Use :</div>
      <ul>
        <li>Assess pancreatic islet cell function.</li>
        <li>Distinguish insulin-secreting tumors (insulinoma) from exogenous insulin administration as a cause of hypoglycemia. Commercial insulin does not contain C-peptide; insulinoma typically produces high insulin and C-peptide levels, whereas injected insulin produces high insulin with low C-peptide.</li>
        <li>Help distinguish Type 1 and Type 2 diabetes mellitus when the diagnosis is uncertain.</li>
      </ul>
      <p><strong>Increased Levels -</strong> Insulinoma and Type II diabetes.</p>
      <p><strong>Decreased Levels -</strong> Type I diabetes and exogenous insulin administration.</p>
    </div>
  `;
}

function buildVldlCholesterolReportBody(test) {
  return buildCholesterolReportBody(test, {
    tableClass: "vldl-cholesterol-table",
    investigation: "VLDL Cholesterol",
    aliases: ["VLDL Cholesterol", "VLDL-C", "Very Low Density Lipoprotein Cholesterol", "Result"],
    method: "Calculated",
    defaultRange: "2.00 - 30.00",
    lipidType: "vldl",
    note: "A VLDL (very low-density lipoprotein) cholesterol test uses a blood sample. VLDL cholesterol is often estimated from triglyceride results obtained during a triglycerides test or lipid panel, although direct measurement may also be used.",
  });
}

function buildComprehensiveMetabolicPanelReportBody(test) {
  const definitions = [
    { label: "AST (SGOT)", aliases: ["AST (SGOT)", "SGOT / AST"], method: "IFCC without P5P", range: "15.00 - 40.00", unit: "U/L" },
    { label: "ALT (SGPT)", aliases: ["ALT (SGPT)", "SGPT / ALT"], method: "IFCC without P5P", range: "10.00 - 49.00", unit: "U/L" },
    { label: "Alkaline Phosphatase (ALP)", aliases: ["Alkaline Phosphatase (ALP)", "ALP (Alkaline Phosphatase)", "Alkaline Phosphatase"], method: "IFCC", range: "30.00 - 120.00", unit: "U/L" },
    { label: "Bilirubin Total", aliases: ["Bilirubin Total", "Total Bilirubin"], method: "DPD", range: "0.30 - 1.20", unit: "mg/dL" },
    { label: "Total Protein", aliases: ["Total Protein"], method: "Biuret", range: "5.70 - 8.20", unit: "g/dL" },
    { label: "Albumin", aliases: ["Albumin"], method: "BCG", range: "3.20 - 4.80", unit: "g/dL" },
    { label: "GFR", aliases: ["GFR", "eGFR", "Estimated GFR"], range: "> 60.00", unit: "mL/min/1.73 m²" },
    { label: "Glucose, Fasting", aliases: ["Glucose, Fasting", "Fasting Glucose", "Glucose Fasting"], method: "Hexokinase", range: "70.00 - 99.00", unit: "mg/dL" },
    { label: "Sodium", aliases: ["Sodium"], method: "Indirect ISE", range: "135.00 - 145.00", unit: "mmol/L" },
    { label: "Potassium", aliases: ["Potassium"], method: "Indirect ISE", range: "3.50 - 5.00", unit: "mmol/L" },
    { label: "Calcium", aliases: ["Calcium", "Calcium, Serum", "Total Calcium"], method: "Arsenazo III", range: "8.50 - 10.50", unit: "mg/dL" },
    { label: "BUN", aliases: ["BUN", "Blood Urea Nitrogen"], method: "Urease UV", range: "7.00 - 20.00", unit: "mg/dL" },
    { label: "Creatinine", aliases: ["Creatinine"], method: "Modified Jaffe, Kinetic", range: "0.60 - 1.30", unit: "mg/dL" },
  ];

  const rows = definitions.map(definition => {
    const result = findReportParameter(test, definition.aliases) || {};
    const value = result.value || "-";
    const range = result.normal_range && result.normal_range !== "N/A" ? result.normal_range : definition.range;
    const unit = result.unit && result.unit !== "N/A" ? result.unit : definition.unit;
    const status = getReferenceStatus(value, range);

    return `<tr>
      <td><strong>${escapeHtml(definition.label)}</strong>${definition.method ? `<div class="cmp-method">${escapeHtml(definition.method)}</div>` : ""}</td>
      <td><span class="${status?.className || ""}">${escapeHtml(value)}</span>${status ? ` <span class="cmp-status ${status.className}">${status.label}</span>` : ""}</td>
      <td>${escapeHtml(range)}</td>
      <td>${escapeHtml(unit)}</td>
    </tr>`;
  }).join("");

  return `
    <table class="results-table cmp-table">
      <thead><tr><th style="width: 30%">Investigation</th><th style="width: 26%">Result</th><th style="width: 25%">Reference Value</th><th style="width: 19%">Unit</th></tr></thead>
      <tbody>
        <tr class="cmp-sample-row"><td>Primary Sample Type :</td><td>Serum</td><td colspan="2"></td></tr>
        ${rows}
      </tbody>
    </table>
  `;
}

function buildElectrolyteProfileReportBody(test) {
  const definitions = [
    { label: "Sodium", aliases: ["Sodium"], range: "136.00 - 145.00", unit: "mEq/L" },
    { label: "Potassium", aliases: ["Potassium"], range: "3.50 - 5.10", unit: "mEq/L" },
    { label: "Chloride", aliases: ["Chloride"], range: "98.00 - 107.00", unit: "mEq/L" },
    { label: "Bicarbonate", aliases: ["Bicarbonate", "Total CO2", "CO2"], range: "22.00 - 28.00", unit: "mEq/L" },
    { label: "Calcium", aliases: ["Calcium", "Calcium, Serum", "Total Calcium"], range: "8.6 - 10.2", unit: "mg/dL" },
    { label: "Magnesium", aliases: ["Magnesium", "Magnesium, Serum"], range: "1.8 - 2.3", unit: "mg/dL" },
  ];

  const rows = definitions.map(definition => {
    const result = findReportParameter(test, definition.aliases) || {};
    const value = result.value || "-";
    const range = result.normal_range && result.normal_range !== "N/A" ? result.normal_range : definition.range;
    const unit = result.unit && result.unit !== "N/A" ? result.unit : definition.unit;
    const status = getReferenceStatus(value, range);

    return `<tr>
      <td>${escapeHtml(definition.label)}</td>
      <td><span class="${status?.className || ""}">${escapeHtml(value)}</span>${status ? ` <span class="electrolyte-status ${status.className}">${status.label}</span>` : ""}</td>
      <td>${escapeHtml(range)}</td>
      <td>${escapeHtml(unit)}</td>
    </tr>`;
  }).join("");

  return `
    <table class="results-table electrolytes-table">
      <thead><tr><th style="width: 30%">Investigation</th><th style="width: 26%">Result</th><th style="width: 25%">Reference Value</th><th style="width: 19%">Unit</th></tr></thead>
      <tbody>
        <tr class="electrolyte-meta-row"><td>Primary Sample Type :</td><td>Serum</td><td colspan="2"></td></tr>
        <tr class="electrolyte-meta-row"><td>Test method :</td><td>Indirect ISE</td><td colspan="2"></td></tr>
        <tr class="electrolyte-section"><td colspan="4">ELECTROLYTES</td></tr>
        ${rows}
      </tbody>
    </table>
    <div class="electrolyte-notes">
      <div class="report-note-heading">Interpretation :</div>
      <p>The serum electrolytes test measures the levels of electrolytes in the blood, providing valuable information about hydration status, kidney function, and electrolyte imbalances.</p>
      <div class="report-note-heading">Electrolytes High Levels Causes :</div>
      <ul>
        <li>Sodium - Water loss or dehydration, diabetes insipidus, and certain kidney disorders.</li>
        <li>Potassium - Kidney disease, adrenal insufficiency, medications, high potassium intake, or cell breakdown.</li>
        <li>Chloride - Dehydration, kidney disorders, and acid-base disorders.</li>
        <li>Bicarbonate - Metabolic alkalosis, prolonged vomiting, and certain respiratory or kidney conditions.</li>
        <li>Calcium - Hyperparathyroidism, kidney disease, and vitamin D toxicity.</li>
        <li>Magnesium - Kidney disease and excess magnesium-containing supplements or medicines.</li>
      </ul>
      <div class="report-note-heading">Electrolytes Low Levels Causes :</div>
      <ul>
        <li>Sodium - Excess water intake, diuretics, adrenal insufficiency, and some kidney disorders.</li>
        <li>Potassium - Diarrhea, vomiting, kidney losses, and diuretic use.</li>
        <li>Chloride - Vomiting, diuretic use, and certain kidney or acid-base disorders.</li>
        <li>Bicarbonate - Diarrhea, metabolic acidosis, and some kidney disorders.</li>
        <li>Calcium - Hypoparathyroidism, kidney disease, and vitamin D deficiency.</li>
        <li>Magnesium - Diarrhea, vomiting, kidney losses, and excessive laxative use.</li>
      </ul>
    </div>
  `;
}

function buildPotassiumReportBody(test) {
  return `
    ${buildSingleAnalyteResultTable(test, {
      tableClass: "single-analyte-table potassium-table",
      investigation: "POTASSIUM, SERUM",
      aliases: ["Potassium, Serum", "Serum Potassium", "Potassium", "Result"],
      method: "Indirect ISE",
      defaultRange: "3.5 - 5.2",
      defaultUnit: "mEq/L",
    })}
    <div class="single-analyte-notes potassium-notes">
      <div class="report-note-heading">Comments:</div>
      <p>Potassium in blood helps evaluate electrolyte balance, kidney function, and medical conditions related to potassium levels.</p>
      <div class="report-note-heading">High Levels Causes :</div>
      <ul>
        <li>Kidney disease - Impaired kidney function or kidney failure.</li>
        <li>Medications - Certain medicines, including ACE inhibitors, ARBs, potassium-sparing diuretics, or NSAIDs.</li>
        <li>Adrenal insufficiency - Reduced production of adrenal hormones.</li>
        <li>Potassium supplements - Excessive potassium intake.</li>
        <li>Tissue damage or cell breakdown - Trauma, burns, or other conditions causing cell damage.</li>
      </ul>
      <div class="report-note-heading">Low Levels Causes :</div>
      <ul>
        <li>Diuretic use - Medicines that increase urine output.</li>
        <li>Gastrointestinal disorders - Diarrhea, vomiting, or other conditions causing potassium loss.</li>
        <li>Hormonal imbalances - Excess aldosterone production or Cushing syndrome.</li>
        <li>Malnutrition - Inadequate dietary potassium intake.</li>
        <li>Medications - Certain medicines, including laxatives or corticosteroids.</li>
      </ul>
    </div>
  `;
}

function buildAstSgotReportBody(test) {
  return `
    ${buildSingleAnalyteResultTable(test, {
      tableClass: "single-analyte-table ast-sgot-table",
      investigation: "AST (SGOT), SERUM",
      aliases: ["AST (SGOT), Serum", "AST (SGOT)", "SGOT", "AST", "Result"],
      method: "IFCC without P5P",
      defaultRange: "10.00 - 40.00",
      defaultUnit: "U/L",
    })}
    <div class="single-analyte-notes ast-sgot-notes">
      <div class="report-note-heading">Comments :</div>
      <p>AST (aspartate aminotransferase), also known as SGOT (serum glutamic oxaloacetic transaminase), is an enzyme found in several tissues, including the liver, heart, and muscles. Along with other tests, it can help assess and monitor certain medical conditions.</p>
      <div class="report-note-heading">High Levels Causes :</div>
      <ul>
        <li>Liver damage - Conditions that affect liver function.</li>
        <li>Hepatitis - Inflammation of the liver.</li>
        <li>Alcohol use - Excessive or prolonged alcohol consumption.</li>
        <li>Medications or toxins - Certain medicines or toxic substances.</li>
        <li>Muscle injury or trauma - Severe muscle damage or injury.</li>
        <li>Heart attack or heart failure - Cardiac events affecting heart muscle.</li>
        <li>Pancreatitis - Inflammation of the pancreas.</li>
      </ul>
      <div class="report-note-heading">Low Levels Causes :</div>
      <ul>
        <li>Vitamin B6 deficiency - Insufficient vitamin B6 levels in the body.</li>
        <li>Chronic liver disease - Long-term liver dysfunction or damage.</li>
        <li>Malnutrition or poor diet - Inadequate nutrient intake.</li>
        <li>Genetic disorders - Inherited conditions affecting AST production.</li>
        <li>Severe infection - Serious bacterial or viral infections.</li>
        <li>Certain medications - Medicines that can lower AST levels.</li>
        <li>Hypothyroidism - An underactive thyroid can affect AST levels.</li>
      </ul>
    </div>
  `;
}

function buildGlobulinReportBody(test) {
  return `
    ${buildSingleAnalyteResultTable(test, {
      tableClass: "single-analyte-table globulin-table",
      investigation: "GLOBULIN, SERUM",
      aliases: ["Globulin, Serum", "Serum Globulin", "Globulin", "Result"],
      method: "Calculated",
      defaultRange: "2.00 - 3.50",
      defaultUnit: "g/dL",
    })}
    <div class="single-analyte-notes globulin-notes">
      <div class="report-note-heading">Clinical Use :</div>
      <p>Globulins are proteins in the blood that provide information about immune-system function and other medical conditions. They have several roles, including immune function and transport of substances.</p>
      <div class="report-note-heading">High Levels Caused By:</div>
      <ul>
        <li>Chronic inflammation - Prolonged inflammation in the body.</li>
        <li>Autoimmune disorders - Conditions where the immune system attacks healthy tissues.</li>
        <li>Liver disease - Liver dysfunction or damage affecting globulin levels.</li>
        <li>Kidney disease - Impaired kidney function affecting globulin levels.</li>
        <li>Certain cancers - Specific cancers can elevate globulin levels.</li>
        <li>Infections - Severe or chronic infections in the body.</li>
        <li>Multiple myeloma - A cancer of plasma cells that can raise globulin levels.</li>
      </ul>
      <div class="report-note-heading">Low Levels Caused By:</div>
      <ul>
        <li>Malabsorption disorders - Conditions affecting the absorption of nutrients.</li>
        <li>Liver disease or damage - Liver dysfunction affecting globulin production.</li>
        <li>Kidney disease - Loss of proteins or impaired kidney function.</li>
        <li>Malnutrition or poor diet - Inadequate nutrient intake affecting protein levels.</li>
        <li>Protein-losing enteropathy - Intestinal disorders causing excessive protein loss.</li>
        <li>Genetic disorders - Inherited conditions affecting globulin production.</li>
        <li>Severe burns or trauma - Extensive injury affecting protein production and loss.</li>
      </ul>
    </div>
  `;
}

function buildAlbuminReportBody(test) {
  return `
    ${buildSingleAnalyteResultTable(test, {
      tableClass: "single-analyte-table albumin-table",
      investigation: "ALBUMIN, SERUM",
      aliases: ["Albumin, Serum", "Serum Albumin", "Albumin", "Result"],
      defaultRange: "3.40 - 5.40",
      defaultUnit: "g/dL",
    })}
    <div class="single-analyte-notes albumin-notes">
      <div class="report-note-heading">Interpretation :</div>
      <p>Albumin helps keep fluid from leaking out of blood vessels and helps carry hormones, medicines, vitamins, and other substances throughout the body. Albumin is made in the liver.</p>
      <div class="report-note-heading">Albumin High Levels :</div>
      <ul>
        <li>Dehydration - Reduced fluid volume in the body.</li>
        <li>Severe vomiting or diarrhea - Excessive fluid and electrolyte loss.</li>
        <li>Certain medical conditions - Such as severe burns or Cushing syndrome.</li>
        <li>Steroid use - Prolonged corticosteroid treatment.</li>
        <li>Excessive sweating - Intense physical activity or hot weather.</li>
      </ul>
      <div class="report-note-heading">Albumin Low Levels :</div>
      <ul>
        <li>Liver disease - Impaired albumin production or liver dysfunction.</li>
        <li>Kidney disease - Albumin may be lost in urine when the kidneys are damaged.</li>
        <li>Malnutrition - Inadequate intake or absorption of nutrients.</li>
        <li>Inflammatory conditions - Such as inflammatory bowel disease or chronic infections.</li>
        <li>Protein-losing conditions - Conditions that result in excessive protein loss.</li>
      </ul>
    </div>
  `;
}

function buildBunReportBody(test) {
  if (isGroupBStrepTest(test)) return buildGroupBStrepReportBody(test);
  if (isFungusKohPreparationTest(test)) return buildFungusKohPreparationReportBody(test);
  if (isSputumAfbTest(test)) return buildSputumAfbReportBody(test);
  if (isAfbCultureSensitivityTest(test)) return buildAfbCultureSensitivityReportBody(test);
  if (isStoolCultureTest(test)) return buildCultureReportBody(test, {
    cultureName: "CULTURE, STOOL",
    aliases: ["Culture, Stool", "Culture Result", "Stool Culture", "Result"],
    defaultComment: "No aerobic pyogenic organism grown after 5 days incubation at 37°C.",
  });
  if (isUrineCultureTest(test)) return buildCultureReportBody(test, {
    cultureName: "CULTURE, URINE",
    aliases: ["Culture, Urine", "Culture Result", "Urine Culture", "Result"],
    defaultComment: "No growth after incubation."
  });
  if (isMalariaParasiteIdentificationTest(test)) return buildMalariaParasiteIdentificationReportBody(test);
  if (isMycobacteriumCombinedPanelTest(test)) return buildMycobacteriumCombinedPanelReportBody(test);
  if (isOvaAndParasiteTest(test)) return buildOvaAndParasiteReportBody(test);
  if (isTripleMarkerTest(test)) return buildPrenatalMarkerReportBody(test, "triple");
  if (isDoubleMarkerTest(test)) return buildPrenatalMarkerReportBody(test, "double");
  if (isPax8Test(test)) return buildPax8ReportBody(test);
  if (isGalectin3Test(test)) return buildGalectin3ReportBody(test);
  if (isHer2Test(test)) return buildHer2ReportBody(test);
  if (isDcpTest(test)) return buildDcpReportBody(test);
  if (isAfpTumorMarkerTest(test)) return buildAfpTumorMarkerReportBody(test);
  if (isCa199Test(test)) return buildCaMarkerReportBody(test, {
    className: "ca199-table",
    investigation: "CA 19-9, SERUM",
    aliases: ["CA 19-9, Serum", "CA 19.9", "CA19-9", "Result"],
    range: "< 37.00",
    uses: ["An aid in the management of pancreatic cancer patients.", "Monitoring the course of disease and possible recurrence in pancreatic carcinoma."],
    tableHeading: "Disease",
    valueHeading: "Percentage positivity of CA 19-9",
    rows: [["Pancreatic cancer", "80"], ["Hepatobiliary cancer", "67"], ["Gastric cancer", "40 - 50"], ["Hepatocellular cancer", "30 - 50"], ["Colorectal cancer", "30"], ["Breast cancer", "15"], ["Pancreatitis", "10 - 20"], ["Benign gastrointestinal diseases", "10 - 20"]],
  });
  if (isCa153Test(test)) return buildCaMarkerReportBody(test, {
    className: "ca153-table",
    investigation: "CA 15-3, SERUM",
    aliases: ["CA 15-3, Serum", "CA15-3", "CA 15.3", "Result"],
    range: "< 30.00",
    uses: ["An aid in the management and therapy monitoring of breast cancer patients.", "Helping predict recurrence in patients with stage II or III breast carcinoma."],
    tableHeading: "Disease",
    valueHeading: "Percentage positivity of CA 15.3",
    rows: [["Primary breast cancer", "23"], ["Metastatic breast cancer", "69"], ["Pancreatic cancer", "80"], ["Lung cancer", "71"], ["Ovarian cancer", "64"], ["Colorectal cancer", "63"], ["Liver cancer", "28"], ["Benign liver disease", "42"], ["Benign breast disease", "16"]],
  });
  if (isCa125Test(test)) return buildCaMarkerReportBody(test, {
    className: "ca125-table",
    investigation: "CA 125, SERUM",
    aliases: ["CA 125, Serum", "CA125", "Result"],
    range: "< 35.00",
    uses: ["An aid in the management of ovarian cancer patients.", "Monitoring disease course and detecting residual tumour in primary epithelial ovarian cancer after first-line therapy."],
    tableHeading: "Stage of ovarian cancer",
    valueHeading: "Percentage positivity of CA 125",
    rows: [["Stage I", "50"], ["Stage II", "90"], ["Stage III & IV", "> 90"]],
  });
  if (isTroponinITest(test)) return buildTroponinReportBody(test, "i");
  if (isTroponinTTest(test)) return buildTroponinReportBody(test, "t");
  if (isDengueNs1Test(test)) return buildDengueReportBody(test, "ns1");
  if (isDengueIggTest(test)) return buildDengueReportBody(test, "igg");
  if (isDengueIgmTest(test)) return buildDengueReportBody(test, "igm");
  if (isRastTest(test)) return buildRastReportBody(test);
  if (isWidalTest(test)) return buildWidalReportBody(test);
  if (isCrpTest(test)) return buildCrpReportBody(test);
  if (isSodiumTest(test)) return buildSodiumReportBody(test);
  if (isIronTest(test)) return buildIronReportBody(test);
  if (isLacticAcidTest(test)) return buildLacticAcidReportBody(test);
  if (isMagnesiumTest(test)) return buildMagnesiumReportBody(test);
  if (isLipaseTest(test)) return buildLipaseReportBody(test);
  if (isAmylaseTest(test)) return buildAmylaseReportBody(test);
  if (isGgtTest(test)) return buildGgtReportBody(test);
  if (isChlorideTest(test)) return buildChlorideReportBody(test);
  if (isCreatinine24HourUrineTest(test)) return buildCreatinine24HourUrineReportBody(test);
  if (isSemenAnalysisTest(test)) return buildSemenAnalysisReportBody(test);
  if (isUrineCotinineTest(test)) return buildUrineCotinineReportBody(test);
  if (isUrineGlucoseTest(test)) return buildUrineGlucoseReportBody(test);
  if (isPorphyrinsTest(test)) return buildPorphyrinsReportBody(test);
  if (isOccultBloodStoolTest(test)) return buildOccultBloodStoolReportBody(test);
  if (isCsfAnalysisTest(test)) return buildCsfAnalysisReportBody(test);
  if (isTshTest(test)) return buildTshReportBody(test);
  if (isThyroidProfileTest(test)) return buildThyroidProfileReportBody(test);
  if (isThyroidAntibodiesTest(test)) return buildThyroidAntibodiesReportBody(test);
  if (isTriiodothyronineTotalTest(test)) return buildTriiodothyronineTotalReportBody(test);
  if (isTestosteroneTotalTest(test)) return buildTestosteroneTotalReportBody(test);
  if (isProgesteroneTest(test)) return buildProgesteroneReportBody(test);
  if (isCortisoneTest(test)) return buildCortisoneReportBody(test);
  if (isBetaHcgPregnancyTest(test)) return buildBetaHcgPregnancyReportBody(test);
  if (isProlactinTest(test)) return buildProlactinReportBody(test);
  if (isDheaTest(test)) return buildDheaReportBody(test);
  if (isEstradiolTest(test)) return buildEstradiolReportBody(test);
  if (isLuteinizingHormoneTest(test)) return buildLuteinizingHormoneReportBody(test);
  if (isFollicleStimulatingHormoneTest(test)) return buildFollicleStimulatingHormoneReportBody(test);
  if (isThyroxineTotalTest(test)) return buildThyroxineTotalReportBody(test);
  if (isCalcitoninTest(test)) return buildCalcitoninReportBody(test);
  if (isInhibinATest(test)) return buildInhibinAReportBody(test);
  if (isInhibinBTest(test)) return buildInhibinBReportBody(test);
  if (isPappATest(test)) return buildPappAReportBody(test);
  if (isDheasTest(test)) return buildDheasReportBody(test);
  if (isFnacTest(test)) return buildFnacReportBody(test);
  if (isPapSmearTest(test)) return buildPapSmearReportBody(test);
  if (isHistopathologyReportTest(test)) return buildHistopathologyReportBody(test);
  if (isCreatinineTest(test)) return buildCreatinineReportBody(test);
  if (isIonizedCalciumTest(test)) return buildIonizedCalciumReportBody(test);
  if (isFlecainideTest(test)) return buildFlecainideReportBody(test);
  if (isPhenobarbitalTest(test)) return buildPhenobarbitalReportBody(test);
  if (isKetoneBodyTest(test)) return buildKetoneBodyReportBody(test);
  if (isUricAcidTest(test)) return buildUricAcidReportBody(test);
  if (isTibcTest(test)) return buildTibcReportBody(test);
  if (isSerumOsmolalityTest(test)) return buildSerumOsmolalityReportBody(test);
  if (isArterialBloodGasTest(test)) return buildArterialBloodGasReportBody(test);
  if (isManganeseBloodTest(test)) return buildManganeseBloodReportBody(test);
  if (isSeleniumSerumTest(test)) return buildSeleniumSerumReportBody(test);

  const statusForBun = (value, range) => {
    const status = getReferenceStatus(value, range);
    const bounds = getRangeBounds(range);
    const numericValue = Number(String(value || "").replace(/,/g, ""));
    if (status?.className === "high-val" && bounds && Number.isFinite(numericValue) && numericValue > bounds[1] * 2) {
      return { label: "Very High", className: "high-val" };
    }
    return status;
  };

  return `
    ${buildSingleAnalyteResultTable(test, {
      tableClass: "single-analyte-table bun-table",
      investigation: "BLOOD UREA NITROGEN (BUN)",
      aliases: ["Blood Urea Nitrogen (BUN)", "BUN", "Blood Urea Nitrogen", "Result"],
      method: "Urease UV",
      defaultRange: "7.00 - 20.00",
      defaultUnit: "mg/dL",
      statusForValue: statusForBun,
    })}
    <div class="single-analyte-notes bun-notes">
      <div class="report-note-heading">Clinical Use :</div>
      <p>The BUN (blood urea nitrogen) test measures urea nitrogen in the blood to help assess kidney function and overall health. It is commonly used to help diagnose or monitor conditions related to kidney health.</p>
      <div class="report-note-heading">High Levels Causes :</div>
      <ul>
        <li>Kidney dysfunction - Acute kidney injury, chronic kidney disease, or kidney failure.</li>
        <li>Dehydration - Inadequate fluid intake or excessive fluid loss.</li>
        <li>Urinary tract obstruction - A blockage in the urinary system.</li>
        <li>High protein intake - Consuming large amounts of protein-rich foods.</li>
        <li>Medications - Certain medicines, such as diuretics or corticosteroids.</li>
      </ul>
      <div class="report-note-heading">Low Levels Causes :</div>
      <ul>
        <li>Liver disease - Severe liver damage or dysfunction.</li>
        <li>Malnutrition - Inadequate protein intake or malabsorption.</li>
        <li>Overhydration - Excessive fluid intake or fluid retention.</li>
        <li>Pregnancy - Normal physiological changes during pregnancy.</li>
        <li>Certain medications - Some medicines can affect BUN results.</li>
      </ul>
    </div>
  `;
}

function buildSodiumReportBody(test) {
  return buildSingleAnalyteResultTable(test, {
    tableClass: "single-analyte-table sodium-table",
    investigation: "SODIUM, SERUM",
    aliases: ["Sodium, Serum", "Serum Sodium", "Sodium", "Result"],
    method: "Indirect ISE",
    defaultRange: "136.00 - 145.00",
    defaultUnit: "mEq/L",
  });
}

function buildIronReportBody(test) {
  return `
    ${buildSingleAnalyteResultTable(test, {
      tableClass: "single-analyte-table iron-table",
      investigation: "IRON, SERUM",
      aliases: ["Iron, Serum", "Serum Iron", "Iron", "Result"],
      method: "Spectrophotometry",
      defaultRange: "50.00 - 170.00",
      defaultUnit: "mcg/dL",
    })}
    <div class="single-analyte-notes iron-notes">
      <div class="report-note-heading">Comments:</div>
      <p>Iron is an essential mineral needed to make hemoglobin and support many body processes. Low iron may lead to microcytic, hypochromic anemia. Excess iron can build up in organs, as can occur with hemochromatosis.</p>
      <div class="report-note-heading">High Levels Causes :</div>
      <ul>
        <li>Hemochromatosis - An inherited disorder that causes excessive iron absorption.</li>
        <li>Iron overload from multiple blood transfusions - Accumulation of iron after repeated transfusions.</li>
        <li>Liver disease - Liver conditions can affect iron regulation.</li>
        <li>Iron poisoning - Ingestion of toxic amounts of iron.</li>
        <li>Hemolytic anemia - Increased breakdown of red blood cells.</li>
      </ul>
      <div class="report-note-heading">Low Levels Causes :</div>
      <ul>
        <li>Iron deficiency anemia - Insufficient iron to produce red blood cells.</li>
        <li>Chronic blood loss - Continuous bleeding, including from the gastrointestinal tract.</li>
        <li>Inadequate dietary intake - Not enough iron-rich foods in the diet.</li>
        <li>Malabsorption disorders - Reduced absorption of iron in the digestive system.</li>
        <li>Pregnancy - Increased iron demand during pregnancy.</li>
      </ul>
    </div>
  `;
}

function buildLacticAcidReportBody(test) {
  const result = findReportParameter(test, ["Lactate, Plasma", "Lactate", "Lactic Acid", "Result"]) || {};
  const value = result.value || "-";
  const status = getReferenceStatus(value, result.normal_range || "4.5 - 19.8");
  const unit = result.unit && result.unit !== "N/A" ? result.unit : "mg/dL";

  return `
    <table class="results-table single-analyte-table lactic-acid-table">
      <thead>
        <tr><th style="width: 34%">Investigation</th><th style="width: 27%">Result</th><th style="width: 25%">Reference Value</th><th style="width: 14%">Unit</th></tr>
      </thead>
      <tbody>
        <tr>
          <td><strong>LACTATE, PLASMA</strong><div class="single-analyte-method">Enzymatic</div></td>
          <td><span class="${status?.className || ""}">${escapeHtml(value)}</span>${status ? ` <span class="single-analyte-status ${status.className}">${status.label}</span>` : ""}</td>
          <td>4.5 - 14.4 ARTERIAL<br />4.5 - 19.8 VENOUS</td>
          <td>${escapeHtml(unit)}</td>
        </tr>
      </tbody>
    </table>
    <div class="single-analyte-notes lactic-acid-notes">
      <div class="report-note-heading">Note:</div>
      <ol>
        <li>Tourniquet use, hand clenching, exercise, and hyperventilation can transiently increase lactate results. Follow the laboratory's collection and handling instructions.</li>
        <li>There is no single lactate concentration that establishes lactic acidosis. Interpret results with the clinical condition and acid-base findings, including pH.</li>
      </ol>
      <div class="report-note-heading">Comment :</div>
      <p>Lactate is produced during anaerobic carbohydrate metabolism. Elevated lactate may reflect increased production, reduced clearance, or both; this test helps assess and monitor patients in whom lactic acidosis is suspected.</p>
      <div class="report-note-heading">Potential Causes of Elevated Lactate / Lactic Acidosis :</div>
      <table class="lactic-acid-causes-table">
        <thead>
          <tr><th>Transient or Other Causes</th><th>Reduced Oxygen Delivery / Tissue Hypoxia (Type A)</th><th>Without Tissue Hypoxia (Type B)</th></tr>
        </thead>
        <tbody>
          <tr><td>Muscular exercise</td><td>Circulatory shock</td><td>Acute alcoholism</td></tr>
          <tr><td>Hyperventilation</td><td>Severe hypoxemia</td><td>Drugs &amp; toxins</td></tr>
          <tr><td>Glycogen storage disease</td><td>Heart failure</td><td>Diabetes mellitus</td></tr>
          <tr><td>Insulin infusions</td><td>Severe anemia</td><td>Leukemia</td></tr>
          <tr><td>Reye's syndrome</td><td>Grand mal seizure</td><td>Thiamin or riboflavin deficiency</td></tr>
          <tr><td></td><td></td><td>Idiopathic</td></tr>
        </tbody>
      </table>
    </div>
  `;
}

function buildMagnesiumReportBody(test) {
  return `
    ${buildSingleAnalyteResultTable(test, {
      tableClass: "single-analyte-table magnesium-table",
      investigation: "MAGNESIUM, SERUM",
      aliases: ["Magnesium, Serum", "Serum Magnesium", "Magnesium", "Result"],
      method: "Xylidyl blue",
      defaultRange: "1.70 - 2.20",
      defaultUnit: "mg/dL",
    })}
    <div class="single-analyte-notes magnesium-notes">
      <div class="report-note-heading">Comments :</div>
      <p>This test helps evaluate magnesium deficiency or excess and may be used for diagnosis and monitoring.</p>
      <div class="report-note-heading">Magnesium High Levels :</div>
      <p>Potential causes of high magnesium levels (hypermagnesemia) include:</p>
      <ul>
        <li>Kidney dysfunction or failure - Impaired magnesium excretion.</li>
        <li>Excess magnesium intake - Overuse of supplements or magnesium-containing products.</li>
        <li>Adrenal insufficiency - Reduced hormone production.</li>
        <li>Dehydration - Reduced fluid balance in the body.</li>
        <li>Laxatives or antacids - Some magnesium-containing medicines can raise magnesium levels.</li>
      </ul>
      <div class="report-note-heading">Magnesium Low Levels :</div>
      <p>Potential causes of low magnesium levels (hypomagnesemia) include:</p>
      <ul>
        <li>Inadequate dietary intake - Insufficient magnesium in the diet.</li>
        <li>Malabsorption disorders - Impaired magnesium absorption in the intestines.</li>
        <li>Chronic alcohol use - Can reduce absorption and increase magnesium loss.</li>
        <li>Kidney disorders - Impaired magnesium reabsorption by the kidneys.</li>
        <li>Diuretics - Medicines that increase urinary magnesium excretion.</li>
      </ul>
    </div>
  `;
}

function buildLipaseReportBody(test) {
  return `
    ${buildSingleAnalyteResultTable(test, {
      tableClass: "single-analyte-table lipase-table",
      investigation: "LIPASE, SERUM",
      aliases: ["Lipase, Serum", "Serum Lipase", "Lipase", "Result"],
      method: "Spectrophotometry",
      defaultRange: "< 67.00",
      defaultUnit: "U/L",
    })}
    <div class="single-analyte-notes lipase-notes">
      <div class="report-note-heading">Comments:</div>
      <p>Pancreas is the major and primary source of serum lipase though lipases are also present in liver, stomach, intestine, WBC, fat cells and milk. In acute pancreatitis, serum lipase becomes elevated at the same time as amylase and remains high for 7-10 days. Increased lipase activity rarely lasts longer than 14 days. Prolonged increase suggests poor prognosis or presence of a cyst. The combined use of serum lipase and serum amylase is effective in ruling out acute pancreatitis.</p>
      <div class="report-note-heading">Increased Levels :</div>
      <ul>
        <li>Acute &amp; Chronic pancreatitis.</li>
        <li>Obstruction of pancreatic duct.</li>
        <li>Non pancreatic conditions like renal diseases, acute cholecystitis, intestinal obstruction, duodenal ulcer, alcoholism, diabetic ketoacidosis and following endoscopic retrograde cholangiopancreatography.</li>
      </ul>
    </div>
  `;
}

function buildAmylaseReportBody(test) {
  return `
    ${buildSingleAnalyteResultTable(test, {
      tableClass: "single-analyte-table amylase-table",
      investigation: "AMYLASE, SERUM",
      aliases: ["Amylase, Serum", "Serum Amylase", "Amylase", "Result"],
      method: "IFCC",
      defaultRange: "28.00 - 100.00",
      defaultUnit: "U/L",
    })}
    <div class="single-analyte-notes amylase-notes">
      <div class="report-note-heading">Comments:</div>
      <p>Amylase is produced in the Pancreas and most of the elevation in serum is due to an increased rate of Amylase entry into the bloodstream / decreased rate of clearance or both. Serum Amylase rises within 6 to 48 hours of the onset of Acute pancreatitis in 80% of patients but is not proportional to the severity of the disease. Activity usually returns to normal in 3-5 days in patients with a milder edematous form of the disease. Values persisting longer than this period suggest continuing necrosis of the pancreas or Pseudocyst formation.</p>
      <p>Approximately 20% of patients with Pancreatitis have normal or near-normal activity. Hyperlipemic patients with Pancreatitis also show spuriously normal Amylase levels due to suppression of Amylase activity by triglyceride. Low Amylase levels are seen in Chronic Pancreatitis, Congestive Heart failure, 2nd and 3rd trimesters of pregnancy, Gastrointestinal cancer and bone fractures.</p>
    </div>
  `;
}

function buildGgtReportBody(test) {
  return `
    ${buildSingleAnalyteResultTable(test, {
      tableClass: "single-analyte-table ggt-table",
      investigation: "GAMMA-GLUTAMYL TRANSFERASE (GGT), SERUM",
      aliases: ["Gamma-Glutamyl Transferase (GGT), Serum", "Gamma Glutamyl Transferase (GGT)", "GGT", "GGTP", "Result"],
      method: "IFCC",
      defaultRange: "12.00 - 18.00",
      defaultUnit: "U/L",
    })}
    <table class="ggt-reference-table">
      <thead><tr><th>Gender</th><th>Normal Range (U/L)</th></tr></thead>
      <tbody>
        <tr><td>Male</td><td>12 - 18</td></tr>
        <tr><td>Female</td><td>6 - 29</td></tr>
      </tbody>
    </table>
    <div class="single-analyte-notes ggt-notes">
      <div class="report-note-heading">Comment :</div>
      <p>Gamma-glutamyl transferase (GGT) is an enzyme that is found in many organs throughout the body, with the highest concentrations found in the liver. GGT is elevated in the blood in most diseases that cause damage to the liver or bile ducts. This test measures the level of GGT in a blood sample.</p>
    </div>
  `;
}

function buildChlorideReportBody(test) {
  return buildSingleAnalyteResultTable(test, {
    tableClass: "single-analyte-table chloride-table",
    investigation: "CHLORIDE, SERUM",
    aliases: ["Chloride, Serum", "Serum Chloride", "Chloride", "Result"],
    method: "Indirect ISE",
    defaultRange: "98.00 - 107.00",
    defaultUnit: "mEq/L",
  });
}

function buildCreatinineReportBody(test) {
  return buildSingleAnalyteResultTable(test, {
    tableClass: "single-analyte-table creatinine-table",
    investigation: "CREATININE, SERUM",
    aliases: ["Creatinine, Serum", "Serum Creatinine", "Creatinine", "Result"],
    method: "Compensated Jaffe's reaction, IDMS traceable",
    defaultRange: "0.55 - 1.02",
    defaultUnit: "mg/dL",
  });
}

function buildIonizedCalciumReportBody(test) {
  const result = findReportParameter(test, ["iCalcium, Serum", "Ionized Calcium", "Calcium, Ionized", "iCalcium", "Result"]) || {};
  const value = result.value || "-";
  const range = result.normal_range && result.normal_range !== "N/A" ? result.normal_range : "1.16 - 1.32";
  const unit = result.unit && result.unit !== "N/A" ? result.unit : "mmol/L";
  const status = getReferenceStatus(value, range);

  return `
    <table class="results-table single-analyte-table ionized-calcium-table">
      <thead>
        <tr><th style="width: 34%">Investigation</th><th style="width: 27%">Result</th><th style="width: 25%">Reference Value</th><th style="width: 14%">Unit</th></tr>
      </thead>
      <tbody>
        <tr>
          <td><strong>CALCIUM, IONIZED</strong><div class="ionized-calcium-test-name">iCalcium, Serum</div><div class="single-analyte-method">ISE</div></td>
          <td><span class="${status?.className || ""}">${escapeHtml(value)}</span>${status ? ` <span class="single-analyte-status ${status.className}">${status.label}</span>` : ""}</td>
          <td>${escapeHtml(range)}</td>
          <td>${escapeHtml(unit)}</td>
        </tr>
      </tbody>
    </table>
  `;
}

function getFlecainideStatus(value, range) {
  const numericValue = Number(String(value || "").replace(/,/g, ""));
  const bounds = getRangeBounds(range);
  if (!Number.isFinite(numericValue) || !bounds) return null;
  if (numericValue < bounds[0]) return { label: "Subtherapeutic", className: "low-val" };
  if (numericValue <= bounds[1]) return { label: "Therapeutic Range", className: "normal-val" };
  return {
    label: numericValue > bounds[1] * 2 ? "Very High" : "High",
    className: "high-val",
  };
}

function buildFlecainideReportBody(test) {
  const result = findReportParameter(test, ["Flecainide, Serum", "Serum Flecainide", "Flecainide", "Result"]) || {};
  const value = result.value || "-";
  const range = result.normal_range && result.normal_range !== "N/A" ? result.normal_range : "0.2 - 1.0";
  const unit = result.unit && result.unit !== "N/A" ? result.unit : "µg/mL";
  const status = getFlecainideStatus(value, range);

  return `
    <table class="results-table single-analyte-table drug-monitoring-table flecainide-table">
      <thead>
        <tr><th style="width: 34%">Investigation</th><th style="width: 27%">Result</th><th style="width: 25%">Reference Value</th><th style="width: 14%">Unit</th></tr>
      </thead>
      <tbody>
        <tr class="drug-monitoring-meta-row"><td><strong>Sample Type</strong></td><td>Serum (1.5 ml)</td><td colspan="2"><strong>TAT:</strong> 2 days (Normal: 2 - 5 days)</td></tr>
        <tr>
          <td><strong>FLECAINIDE</strong><div class="single-analyte-method">CLIA</div></td>
          <td><span class="${status?.className || ""}">${escapeHtml(value)}</span>${status ? ` <span class="single-analyte-status ${status.className}">${status.label}</span>` : ""}</td>
          <td>${escapeHtml(range)}</td>
          <td>${escapeHtml(unit)}</td>
        </tr>
      </tbody>
    </table>
    <div class="single-analyte-notes flecainide-notes">
      <div class="report-note-heading">Comments:</div>
      <p>Flecainide is a medication employed to both prevent and manage abnormally rapid heart rates, particularly in patients with irregular heart rhythms (arrhythmias) that have not responded to other treatments. This monitoring test is essential to track Flecainide blood levels, ensuring that the patient receives the appropriate dose while avoiding potential toxicity.</p>
      <div class="report-note-heading">Interpretation:</div>
      <ol class="flecainide-interpretation-list">
        <li><strong>Therapeutic Range:</strong>
          <ul>
            <li>The specific therapeutic range for Flecainide levels may vary depending on the clinical indication, patient characteristics (e.g., age, renal function), and healthcare provider's recommendations.</li>
            <li>Monitoring Flecainide levels helps ensure that the drug is present in the bloodstream at therapeutic concentrations to effectively manage arrhythmias while minimizing the risk of adverse effects.</li>
          </ul>
        </li>
        <li><strong>Subtherapeutic Levels:</strong>
          <ul>
            <li>Below optimal Flecainide levels may be associated with inadequate therapeutic efficacy, potentially leading to inadequate control of arrhythmias or symptom recurrence.</li>
            <li>Healthcare providers may adjust the dosage, frequency, or administration of Flecainide based on subtherapeutic levels, clinical symptoms, and other relevant factors.</li>
          </ul>
        </li>
        <li><strong>Supratherapeutic Levels:</strong>
          <ul>
            <li>Elevated Flecainide levels may increase the risk of adverse effects, including proarrhythmia, dizziness, visual disturbances, or other cardiovascular complications.</li>
            <li>If supratherapeutic levels are detected, healthcare providers may reduce the Flecainide dosage, modify the treatment regimen, or monitor the patient closely for signs of toxicity or adverse reactions.</li>
          </ul>
        </li>
        <li><strong>Clinical Correlation:</strong>
          <ul>
            <li>Interpretation of Flecainide test results should be done in conjunction with clinical findings, patient symptoms, electrocardiographic (ECG) evaluations, and other relevant diagnostic tests.</li>
            <li>Therapeutic drug monitoring of Flecainide levels helps guide individualized treatment strategies, optimize therapeutic outcomes, minimize adverse effects, and ensure patient safety in the management of arrhythmias.</li>
          </ul>
        </li>
      </ol>
    </div>
  `;
}

function getPhenobarbitalStatus(value, range) {
  const numericValue = Number(String(value || "").replace(/,/g, ""));
  const bounds = getRangeBounds(range);
  if (!Number.isFinite(numericValue) || !bounds) return null;
  if (numericValue < bounds[0]) return { label: "Low", className: "low-val" };
  if (numericValue <= bounds[1]) return { label: "Therapeutic range", className: "normal-val" };
  return { label: "Toxic range", className: "high-val" };
}

function buildPhenobarbitalReportBody(test) {
  const result = findReportParameter(test, ["Phenobarbitone", "Phenobarbitole", "Phenobarbital", "Phenobarbitone, Serum", "Phenobarbitole, Serum", "Phenobarbital, Serum", "Result"]) || {};
  const value = result.value || "-";
  const range = result.normal_range && result.normal_range !== "N/A" ? result.normal_range : "15.00 - 40.00";
  const unit = result.unit && result.unit !== "N/A" ? result.unit : "µg/mL";
  const status = getPhenobarbitalStatus(value, range);

  return `
    <table class="results-table single-analyte-table drug-monitoring-table phenobarbital-table">
      <thead>
        <tr><th style="width: 34%">Investigation</th><th style="width: 27%">Result</th><th style="width: 25%">Reference Value</th><th style="width: 14%">Unit</th></tr>
      </thead>
      <tbody>
        <tr class="drug-monitoring-meta-row"><td><strong>Sample Type</strong></td><td>Serum (1 ml)</td><td colspan="2"><strong>TAT:</strong> 1 day (Normal: 1 - 3 days)</td></tr>
        <tr>
          <td><strong>PHENOBARBITONE</strong><div class="single-analyte-method">CLIA</div></td>
          <td><span class="${status?.className || ""}">${escapeHtml(value)}</span>${status ? ` <span class="single-analyte-status ${status.className}">${status.label}</span>` : ""}</td>
          <td>${escapeHtml(range)}</td>
          <td>${escapeHtml(unit)}</td>
        </tr>
      </tbody>
    </table>
    <div class="single-analyte-heading">Interpretation</div>
    <table class="phenobarbital-interpretation-table">
      <thead><tr><th>Result</th><th>Remark</th></tr></thead>
      <tbody>
        <tr><td>15.00 - 40.00 µg/mL</td><td>Therapeutic range</td></tr>
        <tr><td>&gt; 40.00 µg/mL</td><td>Toxic range</td></tr>
      </tbody>
    </table>
    <div class="single-analyte-notes phenobarbital-notes">
      <div class="report-note-heading">Note:</div>
      <ol>
        <li>Alcohol, Carbamazepine, other barbiturates and Rifampicin may increase its metabolism leading to reduced serum concentration.</li>
        <li>Drugs like Chloramphenicol, Cimetidine, Disulfiram, Isoniazid, Omeprazole &amp; Topiramate compete with Phenobarbital metabolism.</li>
        <li>Elimination of Phenobarbital metabolism is decreased in the presence of Valproic acid &amp; Salicylates.</li>
        <li>Impaired renal and hepatic function can lead to reduced clearance of the drug.</li>
      </ol>
      <div class="report-note-heading">Comments:</div>
      <p>Phenobarbital is a medication prescribed for managing a range of seizure types, including Generalized tonic-clonic, Partial, Focal onset, Temporal lobe, and Febrile seizures. The metabolism of this drug is influenced by a person's age, and its elimination half-life can range from approximately 70 hours in children to around 100 hours in the elderly.</p>
    </div>
  `;
}

function buildDigoxinReportBody(test) {
  return `
    ${buildDrlogyStyleAnalyteResultTable(test, {
      tableClass: "single-analyte-table drug-monitoring-table digoxin-table",
      investigation: "DIGOXIN, SERUM",
      aliases: ["Digoxin, Serum", "Serum Digoxin", "Digoxin", "Result"],
      method: "CLIA",
      defaultRange: "0.50 - 2.00",
      defaultUnit: "ng/mL",
      sampleLabel: "Primary Sample Type",
      sampleType: "Serum",
      turnaroundText: "",
      statusForValue: getDigoxinStatus,
    })}
    <div class="single-analyte-notes digoxin-notes">
      <div class="report-note-heading">Interpretation:</div>
      <table class="digoxin-interpretation-table">
        <thead><tr><th>RESULT in ng/mL</th><th>REMARKS</th></tr></thead>
        <tbody>
          <tr><td>0.80</td><td>Minimum effective concentration</td></tr>
          <tr><td>0.80 - 2.00</td><td>Therapeutic range</td></tr>
          <tr><td>&gt; 2.00</td><td>Toxic range in adults</td></tr>
          <tr><td>&gt; 4.00</td><td>Toxic range in children</td></tr>
        </tbody>
      </table>
      <div class="report-note-heading">Note :</div>
      <ul>
        <li>Gastrointestinal absorption may be decreased in sprue, small intestinal resection, high-fiber diets, hyperthyroidism, and increased gastrointestinal motility.</li>
        <li>Co-administration of cyclosporine, protease inhibitors, quinidine, or verapamil can prolong clearance and may require dose adjustment.</li>
      </ul>
      <div class="report-note-heading">Comments :</div>
      <p>Digoxin is used in the management of congestive heart failure and supraventricular tachycardia. Hypokalemia, hypomagnesemia, and hypercalcemia can increase sensitivity to digoxin. The result should be interpreted with dose timing, renal function, symptoms, and concurrent medicines. For correlation with tissue concentration, collect the specimen at least 6 to 8 hours after a dose.</p>
    </div>
  `;
}

function buildKetoneBodyReportBody(test) {
  return `
    ${buildSingleAnalyteResultTable(test, {
      tableClass: "single-analyte-table ketone-body-table",
      investigation: "KETONE BODY (BETA HYDROXYBUTYRATE), SERUM",
      aliases: ["Ketone Body (Beta Hydroxybutyrate), Serum", "Beta Hydroxybutyrate", "Beta-Hydroxybutyrate", "Ketone Body", "Result"],
      method: "Enzymatic",
      defaultRange: "0.02 - 0.27",
      defaultUnit: "mmol/L",
    })}
    <div class="single-analyte-notes ketone-body-notes">
      <div class="report-note-heading">Comment :</div>
      <p>Beta hydroxybutyrate, a predominant ketone is an extremely reliable guide for monitoring insulin therapy in the treatment of Diabetic Ketoacidosis (DKA). During successful therapy, Total ketones &amp; Beta Hydroxybutyrate decreases but Acetoacetate increases. It may produce a paradoxical situation, as ketosis may appear to worsen because most of the tests for ketosis detects acetoacetate only whereas Beta hydroxybutyrate measurement quantitates this decrease. Its production increases during decreased carbohydrate availability as in starvation &amp; frequent vomiting or decreased carbohydrate utilization as in Diabetes Mellitus, Glycogen storage diseases, Alkalosis &amp; Salicylate poisoning.</p>
      <div class="report-note-heading">Usage :</div>
      <ul>
        <li>Monitoring therapy for Diabetic ketoacidosis</li>
        <li>Investigating the differential diagnosis in cases of hypoglycemia, acidosis, suspected alcohol ingestion, or an unexplained increase in the anion gap</li>
        <li>In pediatric patients, the presence or absence of ketonemia/uria is an essential component in the differential diagnosis of inborn errors of metabolism</li>
      </ul>
    </div>
  `;
}

function buildUricAcidReportBody(test) {
  return buildSingleAnalyteResultTable(test, {
    tableClass: "single-analyte-table uric-acid-table",
    investigation: "URIC ACID, SERUM",
    aliases: ["Uric Acid, Serum", "Serum Uric Acid", "Uric Acid", "Result"],
    method: "Uricase",
    defaultRange: "3.50 - 7.20",
    defaultUnit: "mg/dL",
  });
}

function buildTibcReportBody(test) {
  return `
    ${buildSingleAnalyteResultTable(test, {
      tableClass: "single-analyte-table tibc-table",
      investigation: "TOTAL IRON BINDING CAPACITY (TIBC)",
      aliases: ["Total Iron Binding Capacity (TIBC)", "TIBC", "Total Iron Binding Capacity", "Result"],
      method: "Spectrophotometry",
      defaultRange: "250.00 - 450.00",
      defaultUnit: "mcg/dL",
    })}
    <div class="single-analyte-notes tibc-notes">
      <div class="report-note-heading">Comments :</div>
      <p>The Total Iron Binding Capacity (TIBC) test measures the blood's ability to bind and transport iron, aiding in the assessment of iron levels and related disorders.</p>
      <div class="report-note-heading">High Levels cause :</div>
      <ul>
        <li>Iron deficiency anemia - Decreased iron levels</li>
        <li>Hemochromatosis - Excessive iron absorption</li>
        <li>Liver disease - Impaired iron metabolism</li>
      </ul>
      <div class="report-note-heading">Low Levels cause :</div>
      <ul>
        <li>Iron overload - Excess iron in the body</li>
        <li>Pregnancy - Increased iron demand</li>
        <li>Chronic inflammation - Altered iron metabolism</li>
      </ul>
    </div>
  `;
}

function buildSerumOsmolalityReportBody(test) {
  const result = findReportParameter(test, ["Osmolality", "Serum Osmolality", "Osmolality, Serum", "Result"]) || {};
  const value = result.value || "-";
  const range = result.normal_range && result.normal_range !== "N/A" ? result.normal_range : "278.00 - 298.00";
  const unit = result.unit && result.unit !== "N/A" ? result.unit : "mOsm/kgH2O";
  const status = getReferenceStatus(value, range);

  return `
    <table class="results-table single-analyte-table drug-monitoring-table serum-osmolality-table">
      <thead>
        <tr><th style="width: 34%">Investigation</th><th style="width: 27%">Result</th><th style="width: 25%">Reference Value</th><th style="width: 14%">Unit</th></tr>
      </thead>
      <tbody>
        <tr class="drug-monitoring-meta-row"><td><strong>Sample Type</strong></td><td>Serum (3 ml)</td><td colspan="2"><strong>TAT :</strong> 4 hrs (Normal: 4 - 8 hrs)</td></tr>
        <tr>
          <td><strong>OSMOLALITY</strong><div class="single-analyte-method">Latex Agglutination</div></td>
          <td><span class="${status?.className || ""}">${escapeHtml(value)}</span>${status ? ` <span class="single-analyte-status ${status.className}">${status.label}</span>` : ""}</td>
          <td>${escapeHtml(range)}</td>
          <td>${escapeHtml(unit)}</td>
        </tr>
      </tbody>
    </table>
    <div class="single-analyte-notes serum-osmolality-notes">
      <div class="report-note-heading">Comments:</div>
      <p>This assay is useful in the assessment of electrolytes &amp; acid base disorders.</p>
      <div class="report-note-heading">Interpretation:</div>
      <ol class="serum-osmolality-interpretation-list">
        <li><strong>Normal Range:</strong> A serum osmolality within the normal range suggests that the concentration of solutes in the blood is balanced, and the body's fluid balance is likely normal.</li>
        <li><strong>Low Serum Osmolality:</strong>
          <ul>
            <li>Low serum osmolality may indicate overhydration or water excess.</li>
            <li>Conditions such as water intoxication, syndrome of inappropriate antidiuretic hormone (SIADH), and certain kidney diseases can lead to decreased osmolality.</li>
          </ul>
        </li>
        <li><strong>High Serum Osmolality:</strong>
          <ul>
            <li>High serum osmolality may indicate dehydration or an excess of osmotically active substances in the blood.</li>
            <li>Conditions such as diabetes mellitus (especially with uncontrolled hyperglycemia), hypernatremia (elevated sodium levels), and mannitol infusion can lead to increased osmolality.</li>
          </ul>
        </li>
        <li><strong>Calculation of Effective Osmolality:</strong>
          <ul>
            <li>Effective osmolality takes into account major osmotically active substances like sodium, glucose, and blood urea nitrogen (BUN). It is calculated using the formula: 2 × (Na) + (glucose/18) + (BUN/2.8).</li>
            <li>A significant difference between measured and calculated osmolality may suggest the presence of unmeasured osmotically active substances, such as ethanol or methanol.</li>
          </ul>
        </li>
        <li><strong>Clinical Correlation:</strong>
          <ul>
            <li>The interpretation of serum osmolality should be done in conjunction with the patient's clinical history, physical examination, and other relevant laboratory tests.</li>
            <li>For example, in diabetic ketoacidosis (DKA), the osmolality may be elevated due to increased glucose levels, but the patient may also exhibit signs of dehydration.</li>
          </ul>
        </li>
      </ol>
    </div>
  `;
}

function buildArterialBloodGasReportBody(test) {
  const definitions = [
    { label: "pH", aliases: ["pH", "PH", "Result"], range: "7.35 - 7.45", unit: "" },
    { label: "PCO2", aliases: ["PCO2", "pCO2", "PCO₂"], range: "35.00 - 45.00", unit: "mmHg" },
    { label: "BICARBONATE (HCO3)", aliases: ["Bicarbonate (HCO3)", "BICARBONATE (HCO3)", "HCO3"], range: "21.00 - 28.00", unit: "mEq/L" },
    { label: "TOTAL CO2 CONTENTS (TCO2)", aliases: ["Total CO2 Contents (TCO2)", "TOTAL CO2 CONTENTS (TCO2)", "TCO2"], range: "23.00 - 27.00", unit: "mmol/L" },
    { label: "STANDARD BICARBONATE (SBC)", aliases: ["Standard Bicarbonate (SBC)", "STANDARD BICARBONATE (SBC)", "SBC"], range: "22.00 - 26.00", unit: "mEq/L" },
    { label: "BASE EXCESS", aliases: ["Base Excess", "BASE EXCESS"], range: "-2.00 - 3.00", unit: "mEq/L" },
    { label: "PO2", aliases: ["PO2", "pO2", "PO₂"], range: "83.00 - 108.00", unit: "mmHg" },
    { label: "OXYGEN SATURATION CAPACITY", aliases: ["Oxygen Saturation Capacity", "OXYGEN SATURATION CAPACITY", "Oxygen Saturation"], range: "95.00 - 98.00", unit: "%" },
    { label: "BASE EXCESS - EXTRACELLULAR FLUID", aliases: ["Base Excess - Extracellular Fluid", "BASE EXCESS - EXTRACELLULAR FLUID", "Base Excess ECF"], range: "<0.02", unit: "mEq/L" },
    { label: "HEMOGLOBIN", aliases: ["Hemoglobin", "HEMOGLOBIN", "Hb"], range: "13.00 - 18.00", unit: "g/dL" },
  ];

  const rows = definitions.map(({ label, aliases, range: defaultRange, unit: defaultUnit }) => {
    const result = findReportParameter(test, aliases) || {};
    const value = result.value || "-";
    const range = result.normal_range && result.normal_range !== "N/A" ? result.normal_range : defaultRange;
    const unit = result.unit && result.unit !== "N/A" ? result.unit : defaultUnit;
    return `
      <tr>
        <td><strong>${escapeHtml(label)}</strong></td>
        <td>${escapeHtml(value)}</td>
        <td>${escapeHtml(range)}</td>
        <td>${escapeHtml(unit)}</td>
      </tr>
    `;
  }).join("");

  return `
    <table class="results-table arterial-blood-gas-table">
      <thead>
        <tr><th style="width: 36%">Investigation</th><th style="width: 25%">Result</th><th style="width: 25%">Reference Value</th><th style="width: 14%">Unit</th></tr>
      </thead>
      <tbody>
        <tr class="arterial-blood-gas-section"><td colspan="4"><strong>BLOOD GAS ANALYSIS, ARTERIAL</strong><div class="single-analyte-method">ISE, Amperometry, Reflectance photometry</div></td></tr>
        ${rows}
      </tbody>
    </table>
  `;
}

function buildManganeseBloodReportBody(test) {
  const result = findReportParameter(test, ["Manganese", "Blood Manganese", "Result"]) || {};
  const value = result.value || "-";
  const range = result.normal_range && result.normal_range !== "N/A" ? result.normal_range : "4.20 - 16.50";
  const unit = result.unit && result.unit !== "N/A" ? result.unit : "µg/L";
  const status = getReferenceStatus(value, range);

  return `
    <table class="results-table single-analyte-table drug-monitoring-table manganese-blood-table">
      <thead>
        <tr><th style="width: 34%">Investigation</th><th style="width: 27%">Result</th><th style="width: 25%">Reference Value</th><th style="width: 14%">Unit</th></tr>
      </thead>
      <tbody>
        <tr class="drug-monitoring-meta-row"><td><strong>Sample Type</strong></td><td>Blood (2 ml)</td><td colspan="2"><strong>TAT :</strong> 24 hrs (Normal: 24 - 48 hrs)</td></tr>
        <tr>
          <td><strong>MANGANESE</strong><div class="single-analyte-method">ICPMS</div></td>
          <td><span class="${status?.className || ""}">${escapeHtml(value)}</span>${status ? ` <span class="single-analyte-status ${status.className}">${status.label}</span>` : ""}</td>
          <td>${escapeHtml(range)}</td>
          <td>${escapeHtml(unit)}</td>
        </tr>
      </tbody>
    </table>
    <div class="single-analyte-notes manganese-blood-notes">
      <div class="report-note-heading">Note:</div>
      <ol>
        <li>Blood Manganese levels exceeding 20 micrograms per liter (µg/L) suggest Manganese retention.</li>
        <li>Inductively Coupled Plasma Mass Spectrometry (ICPMS) is a technique employed to quantify heavy and trace metals in biological tissues.</li>
        <li>To evaluate occupational exposure, samples should be collected at the end of a work shift on the last day of the workweek.</li>
      </ol>
      <div class="report-note-heading">Comments:</div>
      <p>Manganese is an essential element that acts as a co-factor in numerous enzymatic reactions. It is primarily obtained through dietary sources, including foods, vegetables, the germinal parts of grains, fruits, nuts, tea, and certain spices. Manganese is also utilized in various industrial processes, such as the production of steel alloys, dry cell batteries, electrical coils, ceramics, matches, glass tiles, welding rods, animal food additives, and fertilizers. Workers exposed to high levels of manganese dust in industrial settings face a significantly increased risk of respiratory diseases, up to 30 times more than the general population.</p>
      <p>Manganese exposure can lead to abnormal electrocardiograms and hinder myocardial contraction.</p>
      <div class="report-note-heading">High Levels:</div>
      <ul>
        <li>Acute hepatitis</li>
        <li>Industrial exposure</li>
        <li>Myocardial infarction</li>
      </ul>
      <div class="report-note-heading">Low Levels:</div>
      <ul>
        <li>Seizures</li>
        <li>Phenylketonuria</li>
      </ul>
    </div>
  `;
}

function buildSeleniumSerumReportBody(test) {
  const result = findReportParameter(test, ["Selenium", "Serum Selenium", "Result"]) || {};
  const value = result.value || "-";
  const range = result.normal_range && result.normal_range !== "N/A" ? result.normal_range : "23.00 - 190.00";
  const unit = result.unit && result.unit !== "N/A" ? result.unit : "µg/L";
  const rawStatus = getReferenceStatus(value, range);
  const status = rawStatus?.className === "low-val" ? { ...rawStatus, label: "Deficiency" } : rawStatus;

  return `
    <table class="results-table single-analyte-table drug-monitoring-table selenium-serum-table">
      <thead>
        <tr><th style="width: 34%">Investigation</th><th style="width: 27%">Result</th><th style="width: 25%">Reference Value</th><th style="width: 14%">Unit</th></tr>
      </thead>
      <tbody>
        <tr class="drug-monitoring-meta-row"><td><strong>Sample Type</strong></td><td>Serum (2 ml)</td><td colspan="2"><strong>TAT :</strong> 4 hrs (Normal: 4 - 12 hrs)</td></tr>
        <tr>
          <td><strong>SELENIUM</strong><div class="single-analyte-method">CPMS</div></td>
          <td><span class="${status?.className || ""}">${escapeHtml(value)}</span>${status ? ` <span class="single-analyte-status ${status.className}">${status.label}</span>` : ""}</td>
          <td>${escapeHtml(range)}</td>
          <td>${escapeHtml(unit)}</td>
        </tr>
      </tbody>
    </table>
    <div class="single-analyte-notes selenium-serum-notes">
      <div class="report-note-heading">Note:</div>
      <ol>
        <li>Inductively Coupled Plasma Mass Spectrometry (ICPMS) is employed for the quantification of heavy and trace metals in biological tissues.</li>
        <li>The recommended specimen for toxicity assessment is a 24-hour urine sample.</li>
      </ol>
      <p>Selenium is an essential trace element that plays a crucial role in various physiological processes, including antioxidant defense, thyroid hormone metabolism, and immune function. However, excessive or deficient levels of selenium can have adverse health effects. Here are some key points regarding the importance and interpretation of a selenium, random urine test:</p>
      <div class="report-note-heading">Importance:</div>
      <ol class="selenium-outline-list">
        <li><strong>Nutritional Status Assessment:</strong>
          <ul>
            <li>Selenium is obtained through the diet, and the urine test can help assess an individual's nutritional status.</li>
            <li>A deficiency or excess of selenium can have implications for health, so monitoring levels is important.</li>
          </ul>
        </li>
        <li><strong>Environmental Exposure:</strong>
          <ul>
            <li>Selenium levels in the body can be influenced by environmental factors, such as the selenium content in soil and water.</li>
            <li>Certain geographical areas may have higher or lower selenium concentrations, affecting the population's selenium intake.</li>
          </ul>
        </li>
        <li><strong>Health Conditions:</strong>
          <ul>
            <li>Selenium is associated with various health conditions, including cardiovascular disease, cancer, and thyroid disorders.</li>
            <li>Monitoring selenium levels can provide insights into potential risks or protective effects associated with these conditions.</li>
          </ul>
        </li>
      </ol>
      <div class="report-note-heading">Interpretation:</div>
      <ol class="selenium-outline-list">
        <li><strong>Normal Range:</strong>
          <ul>
            <li>Interpretation of the test results depends on the reference range provided by the laboratory.</li>
            <li>Normal selenium levels in urine can vary, and deviations from the reference range may indicate potential issues.</li>
          </ul>
        </li>
        <li><strong>Deficiency:</strong>
          <ul><li>Low levels of selenium in the urine may suggest a deficiency, which can be associated with conditions like muscle weakness, fatigue, and increased susceptibility to infections.</li></ul>
        </li>
        <li><strong>Excess:</strong>
          <ul>
            <li>Elevated selenium levels may indicate excessive intake, either through diet or supplementation.</li>
            <li>Chronic high selenium levels can lead to selenosis, which may cause symptoms such as hair loss, gastrointestinal disturbances, and neurological issues.</li>
          </ul>
        </li>
        <li><strong>Clinical Correlation:</strong>
          <ul>
            <li>It's essential to interpret the results in the context of an individual's overall health, medical history, and symptoms.</li>
            <li>Clinical correlation is crucial for a comprehensive understanding of the significance of the test results.</li>
          </ul>
        </li>
      </ol>
    </div>
  `;
}

function buildCreatinine24HourUrineReportBody(test) {
  const definitions = [
    {
      label: "CREATININE, 24 HOUR",
      aliases: ["Creatinine, 24 Hour", "Creatinine, 24-Hour Urine", "24 Hour Urine Creatinine", "Result"],
      defaultRange: "14.00 - 26.00",
      defaultUnit: "mg/kg/day",
    },
    {
      label: "TOTAL URINE VOLUME",
      aliases: ["Total Urine Volume", "Urine Volume"],
      defaultRange: "800.00 - 1800.00",
      defaultUnit: "mL/day",
    },
    {
      label: "BODY WEIGHT",
      aliases: ["Body Weight", "Weight"],
      defaultRange: "",
      defaultUnit: "kg",
    },
  ];

  const rows = definitions.map((definition) => {
    const result = findReportParameter(test, definition.aliases) || {};
    const value = result.value || "-";
    const range = result.normal_range && result.normal_range !== "N/A" ? result.normal_range : definition.defaultRange;
    const unit = result.unit && result.unit !== "N/A" ? result.unit : definition.defaultUnit;
    const status = range ? getReferenceStatus(value, range) : null;

    return `
      <tr>
        <td><strong>${definition.label}</strong></td>
        <td><span class="${status?.className || ""}">${escapeHtml(value)}</span>${status ? ` <span class="single-analyte-status ${status.className}">${status.label}</span>` : ""}</td>
        <td>${escapeHtml(range)}</td>
        <td>${escapeHtml(unit)}</td>
      </tr>
    `;
  }).join("");

  return `
    <table class="results-table creatinine-24-hour-urine-table">
      <thead>
        <tr><th style="width: 34%">Investigation</th><th style="width: 27%">Result</th><th style="width: 25%">Reference Value</th><th style="width: 14%">Unit</th></tr>
      </thead>
      <tbody>
        <tr class="creatinine-24-hour-urine-section"><td colspan="4"><strong>CREATININE, 24-HOUR URINE</strong><div class="single-analyte-method">Compensated Jaffe's reaction, IDMS traceable</div></td></tr>
        ${rows}
      </tbody>
    </table>
  `;
}

function buildCbcReportBody(test, variant) {
  let currentSection = null;
  const rows = getCbcParameters(variant).map(definition => {
    const result = findCbcResult(test, definition);
    const normalRange = result?.normal_range || definition.normalRange;
    const unit = result?.unit || definition.unit;
    const value = result?.value || "-";
    const status = getCbcStatus(result?.value, normalRange);
    const sectionRow = currentSection === definition.section
      ? ""
      : `<tr class="cbc-section"><td colspan="4">${escapeHtml(definition.section)}</td></tr>`;
    currentSection = definition.section;

    const isCalculated = result?.entry_mode === "calculated"
      || (!result?.entry_mode && definition.entryMode === "calculated");
    const method = isCalculated
      ? `<div class="cbc-method">Calculated</div>`
      : "";
    const statusText = status
      ? ` <span class="cbc-status ${status.className}">${status.label}</span>`
      : "";

    return `
      ${sectionRow}
      <tr>
        <td><div class="cbc-investigation">${escapeHtml(definition.label)}</div>${method}</td>
        <td><span class="${status?.className || ""}">${escapeHtml(value)}</span>${statusText}</td>
        <td>${escapeHtml(normalRange || "-")}</td>
        <td>${escapeHtml(unit || "")}</td>
      </tr>
    `;
  }).join("");

  const sampleType = test.sample_type || "Whole Blood";
  return `
    <table class="results-table cbc-table">
      <thead>
        <tr>
          <th style="width: 31%">Investigation</th>
          <th style="width: 25%">Result</th>
          <th style="width: 25%">Reference Value</th>
          <th style="width: 19%">Unit</th>
        </tr>
      </thead>
      <tbody>
        <tr class="cbc-sample-row">
          <td>Primary Sample Type</td>
          <td>${escapeHtml(sampleType)}</td>
          <td></td>
          <td></td>
        </tr>
        ${rows}
      </tbody>
    </table>
    <div class="cbc-clinical-note"><strong>Interpretation:</strong> Results should be correlated with the patient's clinical condition.</div>
  `;
}

function buildCustomReportNarratives(tests) {
  const activeTests = Array.isArray(tests) ? tests : [];
  const hasMultipleTests = activeTests.length > 1;

  return activeTests
    .map((test) => {
      const body = String(test.report_body || "").trim();
      if (!body) return "";

      const paragraphs = body
        .split(/\r?\n\s*\r?\n/)
        .map((paragraph) => paragraph.trim())
        .filter(Boolean)
        .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\r?\n/g, "<br />")}</p>`)
        .join("");
      const title = hasMultipleTests ? `${escapeHtml(test.name)} - Notes` : "Report Notes";

      return `
        <section class="custom-report-body">
          <div class="custom-report-body-title">${title}</div>
          ${paragraphs}
        </section>
      `;
    })
    .filter(Boolean)
    .join("");
}

function buildReportHtml(reportData) {
  const suppliedTests = Array.isArray(reportData.tests) ? reportData.tests : [];
  const reportTests = suppliedTests.filter(test => !isBillingOnlyTest(test));
  if (!reportTests.length) {
    const error = new Error(suppliedTests.length ? BILLING_ONLY_MESSAGE : 'No laboratory tests are available for this report.');
    error.statusCode = 400;
    throw error;
  }
  reportData = { ...reportData, tests: reportTests };
  if (reportTests.length > 1 && !reportData._singleTestPage) {
    return buildMultiTestReportHtml(reportData, reportTests);
  }

  const businessName = String(reportData.businessName || "Your Diagnostic Centre");
  const embeddedPreview = reportData.embeddedPreview === true;
  const showPrintControls = reportData.showPrintControls === true;
  const readOnlyView = reportData.readOnlyView === true;
  const reportPrintEndpoint = String(reportData.reportPrintEndpoint || "");
  const reportActionControls = buildReportActionControls({
    show: reportData.showReportActions === true && readOnlyView,
    visitId: reportData.reportActionVisitId,
    patientPhone: reportData.reportActionPatientPhone,
    canDownload: reportData.canDownloadReportPdf === true,
    canShareWhatsApp: reportData.canShareWhatsAppPdf === true,
  });
  const letterheadDataUrl = /^data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/]+={0,2}$/i.test(String(reportData.letterheadDataUrl || ""))
    ? String(reportData.letterheadDataUrl)
    : "";
  const reportDoctorSignatureDataUrl = /^data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/]+={0,2}$/i.test(String(reportData.reportDoctorSignatureDataUrl || ""))
    ? String(reportData.reportDoctorSignatureDataUrl)
    : "";
  const reportDoctorName = escapeHtml(reportData.reportDoctorName || "");
  const reportDoctorQualification = escapeHtml(reportData.reportDoctorQualification || "");
  const reportDoctorRegistrationNo = escapeHtml(reportData.reportDoctorRegistrationNo || "");
  const reportDoctorSignatureMarkup = reportDoctorSignatureDataUrl || reportDoctorName || reportDoctorQualification || reportDoctorRegistrationNo
    ? `
        <div class="signature-wrapper report-doctor-signature">
          <div class="signature-section">
            ${reportDoctorSignatureDataUrl ? `<img src="${reportDoctorSignatureDataUrl}" class="sig-image" alt="Reporting doctor signature" />` : ""}
            ${reportDoctorName ? `<p class="doc-name">${reportDoctorName}</p>` : ""}
            ${reportDoctorQualification ? `<p class="doc-detail">${reportDoctorQualification}</p>` : ""}
            ${reportDoctorRegistrationNo ? `<p class="doc-detail">Regd. No. ${reportDoctorRegistrationNo}</p>` : ""}
          </div>
        </div>`
    : "";
  const reportHeaderSpaceMm = Number.isInteger(Number(reportData.reportHeaderSpaceMm))
    && Number(reportData.reportHeaderSpaceMm) >= 0
    && Number(reportData.reportHeaderSpaceMm) <= 140
    ? Number(reportData.reportHeaderSpaceMm)
    : 0;
  const requestedFooterSpaceMm = Number.isInteger(Number(reportData.reportFooterSpaceMm))
    && Number(reportData.reportFooterSpaceMm) >= 0
    && Number(reportData.reportFooterSpaceMm) <= 140
    ? Number(reportData.reportFooterSpaceMm)
    : 0;
  const reportFooterSpaceMm = Math.min(requestedFooterSpaceMm, 240 - reportHeaderSpaceMm);
  const patientName = escapeHtml(reportData.patient.name);
  const billNo = escapeHtml(reportData.visit.bill_no);
  const age = escapeHtml(reportData.patient.age);
  const sex = escapeHtml(reportData.patient.gender);
  const doctorName = escapeHtml(reportData.doctor?.name || "Self");
  const billNoStr = String(reportData.visit.bill_no || "");
  const patientId = billNoStr.split("-").pop() || escapeHtml(reportData.patient.id);
  
  const registeredOn = formatDateStr(reportData.visit.created_at);
  const reportedOn = formatDateStr(reportData.report.finalized_at || new Date());

  const associateName = reportData.visit.associate_label || (reportData.associate ? reportData.associate.name : "");
  const collectionLocation = reportData.isPreview
    ? "Preview report — no patient sample"
    : reportData.visit.sample_source === "associate" && associateName
      ? associateName
      : businessName;

  const digitalReportUrl = String(reportData.digitalReportUrl || "").trim();
  const qrPayload = digitalReportUrl || `${billNo}-${patientName}`;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(qrPayload)}`;
  const barcodeUrl = `https://bwipjs-api.metafloor.com/?bcid=code128&text=${encodeURIComponent(billNo)}&scale=2&height=10&includetext`;

  const singleTest = reportData.tests.length === 1 ? reportData.tests[0] : null;
  const customReportNarratives = buildCustomReportNarratives(reportData.tests);
  const beta2GlycoproteinPanelTest = singleTest && (
    isBeta2GlycoproteinPanelTest(singleTest)
    || isFnacTest(singleTest)
    || isPapSmearTest(singleTest)
  ) ? singleTest : null;
  const toxoplasmaAntibodiesPanelTest = singleTest && isToxoplasmaAntibodiesPanelTest(singleTest) ? singleTest : null;
  const torchProfileTest = singleTest && isTorchProfileTest(singleTest) ? singleTest : null;
  const tnfAlphaTest = singleTest && isTnfAlphaTest(singleTest) ? singleTest : null;
  const rheumatoidFactorTest = singleTest && isRheumatoidFactorTest(singleTest) ? singleTest : null;
  const asoTiterTest = singleTest && isAsoTiterTest(singleTest) ? singleTest : null;
  const hsCrpTest = singleTest && isHsCrpTest(singleTest) ? singleTest : null;
  const fnacTest = singleTest && isFnacTest(singleTest) ? singleTest : null;
  const papSmearTest = singleTest && isPapSmearTest(singleTest) ? singleTest : null;
  const rtPcrTest = singleTest && isRtPcrTest(singleTest) ? singleTest : null;
  const tpmtTest = singleTest && isTpmtGenotypingTest(singleTest) ? singleTest : null;
  const cysticFibrosisNewbornTest = singleTest && isCysticFibrosisNewbornScreenTest(singleTest) ? singleTest : null;
  const kftTest = singleTest && isKftTest(singleTest) ? singleTest : null;
  const factorIiTest = singleTest && isFactorIiFunctionalTest(singleTest) ? singleTest : null;
  const karyotypeTest = singleTest && isKaryotypeTest(singleTest) ? singleTest : null;
  const lipidProfileTest = singleTest && isLipidProfileTest(singleTest) ? singleTest : null;
  const lftTest = singleTest && isLftTest(singleTest) ? singleTest : null;
  const hba1cTest = singleTest && isHba1cTest(singleTest) ? singleTest : null;
  const vitaminDTest = singleTest && isVitaminD25HydroxyTest(singleTest) ? singleTest : null;
  const vitaminCTest = singleTest && isVitaminCTest(singleTest) ? singleTest : null;
  const vitaminB12Test = singleTest && isVitaminB12Test(singleTest) ? singleTest : null;
  const randomBloodSugarTest = singleTest && isRandomBloodSugarTest(singleTest) ? singleTest : null;
  const fastingBloodSugarTest = singleTest && isFastingBloodSugarTest(singleTest) ? singleTest : null;
  const bTypeNatriureticPeptideTest = singleTest && isBTypeNatriureticPeptideTest(singleTest) ? singleTest : null;
  const creatineKinaseTest = singleTest && isCreatineKinaseTest(singleTest) ? singleTest : null;
  const beta2MicroglobulinTest = singleTest && isBeta2MicroglobulinTest(singleTest) ? singleTest : null;
  const altSgptTest = singleTest && isAltSgptTest(singleTest) ? singleTest : null;
  const dnphTest = singleTest && isDnphTest(singleTest) ? singleTest : null;
  const prealbuminTest = singleTest && isPrealbuminTest(singleTest) ? singleTest : null;
  const haptoglobinTest = singleTest && isHaptoglobinTest(singleTest) ? singleTest : null;
  const gramStainBacterialVaginosisTest = singleTest && isGramStainBacterialVaginosisTest(singleTest) ? singleTest : null;
  const aldolaseTest = singleTest && isAldolaseTest(singleTest) ? singleTest : null;
  const urineProteinCreatinineRatioTest = singleTest && isUrineProteinCreatinineRatioTest(singleTest) ? singleTest : null;
  const albuminCreatinineRatioTest = singleTest && isAlbuminCreatinineRatioTest(singleTest) ? singleTest : null;
  const postPrandialBloodSugarTest = singleTest && isPostPrandialBloodSugarTest(singleTest) ? singleTest : null;
  const tacrolimusTest = singleTest && isTacrolimusTest(singleTest) ? singleTest : null;
  const phosphorusTest = singleTest && isPhosphorusTest(singleTest) ? singleTest : null;
  const alkalinePhosphataseTest = singleTest && isAlkalinePhosphataseTest(singleTest) ? singleTest : null;
  const clotRetractionTest = singleTest && isClotRetractionTest(singleTest) ? singleTest : null;
  const groupBStrepTest = singleTest && isGroupBStrepTest(singleTest) ? singleTest : null;
  const fungusKohPreparationTest = singleTest && isFungusKohPreparationTest(singleTest) ? singleTest : null;
  const sputumAfbTest = singleTest && isSputumAfbTest(singleTest) ? singleTest : null;
  const stoolCultureTest = singleTest && isStoolCultureTest(singleTest) ? singleTest : null;
  const urineCultureTest = singleTest && isUrineCultureTest(singleTest) ? singleTest : null;
  const malariaParasiteIdentificationTest = singleTest && isMalariaParasiteIdentificationTest(singleTest) ? singleTest : null;
  const mycobacteriumCombinedPanelTest = singleTest && isMycobacteriumCombinedPanelTest(singleTest) ? singleTest : null;
  const ovaAndParasiteTest = singleTest && isOvaAndParasiteTest(singleTest) ? singleTest : null;
  const vitaminETest = singleTest && isVitaminETest(singleTest) ? singleTest : null;
  const vitaminB9Test = singleTest && isVitaminB9Test(singleTest) ? singleTest : null;
  const vitaminKTest = singleTest && isVitaminKTest(singleTest) ? singleTest : null;
  const ldlCholesterolTest = singleTest && isLdlCholesterolTest(singleTest) ? singleTest : null;
  const hdlCholesterolTest = singleTest && isHdlCholesterolTest(singleTest) ? singleTest : null;
  const indirectBilirubinTest = singleTest && isIndirectBilirubinTest(singleTest) ? singleTest : null;
  const calciumTest = singleTest && isCalciumTest(singleTest) ? singleTest : null;
  const ferritinTest = singleTest && isFerritinTest(singleTest) ? singleTest : null;
  const cPeptideTest = singleTest && isCPeptideTest(singleTest) ? singleTest : null;
  const vldlCholesterolTest = singleTest && isVldlCholesterolTest(singleTest) ? singleTest : null;
  const comprehensiveMetabolicPanelTest = singleTest && isComprehensiveMetabolicPanelTest(singleTest) ? singleTest : null;
  const electrolyteProfileTest = singleTest && isElectrolyteProfileTest(singleTest) ? singleTest : null;
  const potassiumTest = singleTest && isPotassiumTest(singleTest) ? singleTest : null;
  const astSgotTest = singleTest && isAstSgotTest(singleTest) ? singleTest : null;
  const globulinTest = singleTest && isGlobulinTest(singleTest) ? singleTest : null;
  const albuminTest = singleTest && isAlbuminTest(singleTest) ? singleTest : null;
  const digoxinTest = singleTest && isDigoxinTest(singleTest) ? singleTest : null;
  const bunTest = singleTest && (isBunTest(singleTest) || isGroupBStrepTest(singleTest) || isFungusKohPreparationTest(singleTest) || isSputumAfbTest(singleTest) || isAfbCultureSensitivityTest(singleTest) || isStoolCultureTest(singleTest) || isUrineCultureTest(singleTest) || isMalariaParasiteIdentificationTest(singleTest) || isMycobacteriumCombinedPanelTest(singleTest) || isOvaAndParasiteTest(singleTest) || isTripleMarkerTest(singleTest) || isDoubleMarkerTest(singleTest) || isPax8Test(singleTest) || isGalectin3Test(singleTest) || isHer2Test(singleTest) || isDcpTest(singleTest) || isAfpTumorMarkerTest(singleTest) || isCa199Test(singleTest) || isCa153Test(singleTest) || isCa125Test(singleTest) || isTroponinITest(singleTest) || isTroponinTTest(singleTest) || isDengueNs1Test(singleTest) || isDengueIggTest(singleTest) || isDengueIgmTest(singleTest) || isRastTest(singleTest) || isWidalTest(singleTest) || isCrpTest(singleTest) || isSodiumTest(singleTest) || isIronTest(singleTest) || isLacticAcidTest(singleTest) || isMagnesiumTest(singleTest) || isLipaseTest(singleTest) || isAmylaseTest(singleTest) || isGgtTest(singleTest) || isChlorideTest(singleTest) || isCreatinine24HourUrineTest(singleTest) || isSemenAnalysisTest(singleTest) || isUrineCotinineTest(singleTest) || isUrineGlucoseTest(singleTest) || isPorphyrinsTest(singleTest) || isOccultBloodStoolTest(singleTest) || isCsfAnalysisTest(singleTest) || isTshTest(singleTest) || isThyroidProfileTest(singleTest) || isThyroidAntibodiesTest(singleTest) || isTriiodothyronineTotalTest(singleTest) || isTestosteroneTotalTest(singleTest) || isProgesteroneTest(singleTest) || isCortisoneTest(singleTest) || isBetaHcgPregnancyTest(singleTest) || isProlactinTest(singleTest) || isDheaTest(singleTest) || isEstradiolTest(singleTest) || isLuteinizingHormoneTest(singleTest) || isFollicleStimulatingHormoneTest(singleTest) || isThyroxineTotalTest(singleTest) || isCalcitoninTest(singleTest) || isInhibinATest(singleTest) || isInhibinBTest(singleTest) || isPappATest(singleTest) || isDheasTest(singleTest) || isHistopathologyReportTest(singleTest) || isCreatinineTest(singleTest) || isIonizedCalciumTest(singleTest) || isFlecainideTest(singleTest) || isPhenobarbitalTest(singleTest) || isKetoneBodyTest(singleTest) || isUricAcidTest(singleTest) || isTibcTest(singleTest) || isSerumOsmolalityTest(singleTest) || isArterialBloodGasTest(singleTest) || isManganeseBloodTest(singleTest) || isSeleniumSerumTest(singleTest))
    ? singleTest
    : null;
  const typhidotTest = singleTest && (isTyphidotTest(singleTest) || isHbsAgTest(singleTest) || isAntiHbcIgmTest(singleTest) || isHepatitisBProfileTest(singleTest) || isMantouxTest(singleTest) || isHiv12ScreeningTest(singleTest) || isAntiBTitreTest(singleTest) || isAntiATitreTest(singleTest) || isDustAllergyTest(singleTest) || isDengueFeverPanelTest(singleTest) || isG6PdTest(singleTest) || isAntiHbsTest(singleTest) || isGangliosideGm1IggTest(singleTest) || isGangliosideGm1IgmTest(singleTest) || isGangliosideGd1aIggTest(singleTest) || isGangliosideGd1aIgmTest(singleTest) || isGangliosideGd1bIggTest(singleTest) || isGangliosideGq1bIggTest(singleTest) || isAntiHistoneAntibodiesTest(singleTest) || isRibosomePAntibodiesTest(singleTest) || isAntiCcpTest(singleTest) || isImmunoglobulinIggTest(singleTest) || isImmunoglobulinIgeTest(singleTest) || isImmunoglobulinIgmTest(singleTest) || isImmunoglobulinIgaTest(singleTest))
    ? singleTest
    : null;
  const vdrlTest = singleTest && isVdrlTest(singleTest) ? singleTest : null;
  const havIggTest = singleTest && isHavIggTest(singleTest) ? singleTest : null;
  const havIgmTest = singleTest && isHavIgmTest(singleTest) ? singleTest : null;
  const hcvRapidScreeningTest = singleTest && isHcvRapidScreeningTest(singleTest) ? singleTest : null;
  const hbsAgTest = singleTest && isHbsAgTest(singleTest) ? singleTest : null;
  const antiHbcIgmTest = singleTest && isAntiHbcIgmTest(singleTest) ? singleTest : null;
  const hepatitisBProfileTest = singleTest && isHepatitisBProfileTest(singleTest) ? singleTest : null;
  const mantouxTest = singleTest && isMantouxTest(singleTest) ? singleTest : null;
  const hiv12ScreeningTest = singleTest && isHiv12ScreeningTest(singleTest) ? singleTest : null;
  const cbcTest = singleTest && getCbcVariant(singleTest.name) ? singleTest : null;
  const cbcVariant = cbcTest ? getCbcVariant(cbcTest.name) : null;
  const bloodGroupTest = !cbcTest && singleTest && isBloodGroupTest(singleTest) ? singleTest : null;
  const dDimerTest = !cbcTest && !bloodGroupTest && singleTest && isDDimerTest(singleTest) ? singleTest : null;
  const sickleCellMutationTest = !cbcTest && !bloodGroupTest && !dDimerTest && singleTest && isSickleCellMutationAnalysisTest(singleTest)
    ? singleTest
    : null;
  const rbcTest = !cbcTest && singleTest && isRbcCountTest(singleTest) ? singleTest : null;
  const plateletTest = !cbcTest && !rbcTest && singleTest && isPlateletCountTest(singleTest) ? singleTest : null;
  const tlcTest = !cbcTest && !rbcTest && !plateletTest && singleTest && isTlcCountTest(singleTest) ? singleTest : null;
  const absoluteCountTemplate = !cbcTest && !rbcTest && !plateletTest && !tlcTest && singleTest
    ? getAbsoluteCountTemplate(singleTest)
    : null;
  const absoluteCountTest = absoluteCountTemplate ? singleTest : null;
  const mchcTest = !cbcTest && !rbcTest && !plateletTest && !tlcTest && !absoluteCountTest && singleTest && isMchcTest(singleTest)
    ? singleTest
    : null;
  const mchTest = !cbcTest && !rbcTest && !plateletTest && !tlcTest && !absoluteCountTest && !mchcTest && singleTest && isMchTest(singleTest)
    ? singleTest
    : null;
  const mcvTest = !cbcTest && !rbcTest && !plateletTest && !tlcTest && !absoluteCountTest && !mchcTest && !mchTest && singleTest && isMcvTest(singleTest)
    ? singleTest
    : null;
  const mpvTest = !cbcTest && !rbcTest && !plateletTest && !tlcTest && !absoluteCountTest && !mchcTest && !mchTest && !mcvTest && singleTest && isMpvTest(singleTest)
    ? singleTest
    : null;
  const hctPcvTest = !cbcTest && !rbcTest && !plateletTest && !tlcTest && !absoluteCountTest && !mchcTest && !mchTest && !mcvTest && !mpvTest && singleTest && isHctPcvTest(singleTest)
    ? singleTest
    : null;
  const esrTest = !cbcTest && !rbcTest && !plateletTest && !tlcTest && !absoluteCountTest && !mchcTest && !mchTest && !mcvTest && !mpvTest && !hctPcvTest && singleTest && isEsrTest(singleTest)
    ? singleTest
    : null;
  const pdwTest = !cbcTest && !rbcTest && !plateletTest && !tlcTest && !absoluteCountTest && !mchcTest && !mchTest && !mcvTest && !mpvTest && !hctPcvTest && !esrTest && singleTest && isPdwTest(singleTest)
    ? singleTest
    : null;
  const hemoglobinTest = !cbcTest && !rbcTest && !plateletTest && !tlcTest && !absoluteCountTest && !mchcTest && !mchTest && !mcvTest && !mpvTest && !hctPcvTest && !esrTest && !pdwTest && singleTest && isHemoglobinTest(singleTest)
    ? singleTest
    : null;
  const ptTest = !cbcTest && !rbcTest && !plateletTest && !tlcTest && !absoluteCountTest && !mchcTest && !mchTest && !mcvTest && !mpvTest && !hctPcvTest && !esrTest && !pdwTest && !hemoglobinTest && singleTest && isProthrombinTimeTest(singleTest)
    ? singleTest
    : null;
  const apttTest = !cbcTest && !rbcTest && !plateletTest && !tlcTest && !absoluteCountTest && !mchcTest && !mchTest && !mcvTest && !mpvTest && !hctPcvTest && !esrTest && !pdwTest && !hemoglobinTest && !ptTest && singleTest && isApttTest(singleTest)
    ? singleTest
    : null;
  const dlcTest = !cbcTest && !rbcTest && !plateletTest && !tlcTest && !absoluteCountTest && !mchcTest && !mchTest && !mcvTest && !mpvTest && !hctPcvTest && !esrTest && !pdwTest && !hemoglobinTest && !ptTest && !apttTest && singleTest && isDlcTest(singleTest)
    ? singleTest
    : null;
  const indirectCoombsTest = !cbcTest && !rbcTest && !plateletTest && !tlcTest && !absoluteCountTest && !mchcTest && !mchTest && !mcvTest && !mpvTest && !hctPcvTest && !esrTest && !pdwTest && !hemoglobinTest && !ptTest && !apttTest && !dlcTest && singleTest && isIndirectCoombsTest(singleTest)
    ? singleTest
    : null;
  const directCoombsTest = !cbcTest && !rbcTest && !plateletTest && !tlcTest && !absoluteCountTest && !mchcTest && !mchTest && !mcvTest && !mpvTest && !hctPcvTest && !esrTest && !pdwTest && !hemoglobinTest && !ptTest && !apttTest && !dlcTest && !indirectCoombsTest && singleTest && isDirectCoombsTest(singleTest)
    ? singleTest
    : null;
  const fibrinogenTest = !cbcTest && !rbcTest && !plateletTest && !tlcTest && !absoluteCountTest && !mchcTest && !mchTest && !mcvTest && !mpvTest && !hctPcvTest && !esrTest && !pdwTest && !hemoglobinTest && !ptTest && !apttTest && !dlcTest && !indirectCoombsTest && !directCoombsTest && singleTest && isFibrinogenTest(singleTest)
    ? singleTest
    : null;
  const reticulocyteTest = !cbcTest && !rbcTest && !plateletTest && !tlcTest && !absoluteCountTest && !mchcTest && !mchTest && !mcvTest && !mpvTest && !hctPcvTest && !esrTest && !pdwTest && !hemoglobinTest && !ptTest && !apttTest && !dlcTest && !indirectCoombsTest && !directCoombsTest && !fibrinogenTest && singleTest && isReticulocyteCountTest(singleTest)
    ? singleTest
    : null;
  const clottingTimeTest = !cbcTest && !rbcTest && !plateletTest && !tlcTest && !absoluteCountTest && !mchcTest && !mchTest && !mcvTest && !mpvTest && !hctPcvTest && !esrTest && !pdwTest && !hemoglobinTest && !ptTest && !apttTest && !dlcTest && !indirectCoombsTest && !directCoombsTest && !fibrinogenTest && !reticulocyteTest && singleTest && isClottingTimeTest(singleTest)
    ? singleTest
    : null;
  const bleedingTimeTest = !cbcTest && !rbcTest && !plateletTest && !tlcTest && !absoluteCountTest && !mchcTest && !mchTest && !mcvTest && !mpvTest && !hctPcvTest && !esrTest && !pdwTest && !hemoglobinTest && !ptTest && !apttTest && !dlcTest && !indirectCoombsTest && !directCoombsTest && !fibrinogenTest && !reticulocyteTest && !clottingTimeTest && singleTest && isBleedingTimeTest(singleTest)
    ? singleTest
    : null;
  const coagulationProfileTest = !cbcTest && !rbcTest && !plateletTest && !tlcTest && !absoluteCountTest && !mchcTest && !mchTest && !mcvTest && !mpvTest && !hctPcvTest && !esrTest && !pdwTest && !hemoglobinTest && !ptTest && !apttTest && !dlcTest && !indirectCoombsTest && !directCoombsTest && !fibrinogenTest && !reticulocyteTest && !clottingTimeTest && !bleedingTimeTest && singleTest && isCoagulationProfileTest(singleTest)
    ? singleTest
    : null;
  const factorViiiTest = !cbcTest && !rbcTest && !plateletTest && !tlcTest && !absoluteCountTest && !mchcTest && !mchTest && !mcvTest && !mpvTest && !hctPcvTest && !esrTest && !pdwTest && !hemoglobinTest && !ptTest && !apttTest && !dlcTest && !indirectCoombsTest && !directCoombsTest && !fibrinogenTest && !reticulocyteTest && !clottingTimeTest && !coagulationProfileTest && singleTest && isFactorViiiTest(singleTest)
    ? singleTest
    : null;
  const factorVTest = !cbcTest && !rbcTest && !plateletTest && !tlcTest && !absoluteCountTest && !mchcTest && !mchTest && !mcvTest && !mpvTest && !hctPcvTest && !esrTest && !pdwTest && !hemoglobinTest && !ptTest && !apttTest && !dlcTest && !indirectCoombsTest && !directCoombsTest && !fibrinogenTest && !reticulocyteTest && !clottingTimeTest && !coagulationProfileTest && !factorViiiTest && singleTest && isFactorVTest(singleTest)
    ? singleTest
    : null;
  const factorViiTest = !cbcTest && !rbcTest && !plateletTest && !tlcTest && !absoluteCountTest && !mchcTest && !mchTest && !mcvTest && !mpvTest && !hctPcvTest && !esrTest && !pdwTest && !hemoglobinTest && !ptTest && !apttTest && !dlcTest && !indirectCoombsTest && !directCoombsTest && !fibrinogenTest && !reticulocyteTest && !clottingTimeTest && !coagulationProfileTest && !factorViiiTest && !factorVTest && singleTest && isFactorViiTest(singleTest)
    ? singleTest
    : null;
  const factorIxTest = !cbcTest && !rbcTest && !plateletTest && !tlcTest && !absoluteCountTest && !mchcTest && !mchTest && !mcvTest && !mpvTest && !hctPcvTest && !esrTest && !pdwTest && !hemoglobinTest && !ptTest && !apttTest && !dlcTest && !indirectCoombsTest && !directCoombsTest && !fibrinogenTest && !reticulocyteTest && !clottingTimeTest && !coagulationProfileTest && !factorViiiTest && !factorVTest && !factorViiTest && singleTest && isFactorIxTest(singleTest)
    ? singleTest
    : null;
  const factorXTest = !cbcTest && !rbcTest && !plateletTest && !tlcTest && !absoluteCountTest && !mchcTest && !mchTest && !mcvTest && !mpvTest && !hctPcvTest && !esrTest && !pdwTest && !hemoglobinTest && !ptTest && !apttTest && !dlcTest && !indirectCoombsTest && !directCoombsTest && !fibrinogenTest && !reticulocyteTest && !clottingTimeTest && !coagulationProfileTest && !factorViiiTest && !factorVTest && !factorViiTest && !factorIxTest && singleTest && isFactorXTest(singleTest)
    ? singleTest
    : null;
  const factorXiTest = !cbcTest && !rbcTest && !plateletTest && !tlcTest && !absoluteCountTest && !mchcTest && !mchTest && !mcvTest && !mpvTest && !hctPcvTest && !esrTest && !pdwTest && !hemoglobinTest && !ptTest && !apttTest && !dlcTest && !indirectCoombsTest && !directCoombsTest && !fibrinogenTest && !reticulocyteTest && !clottingTimeTest && !coagulationProfileTest && !factorViiiTest && !factorVTest && !factorViiTest && !factorIxTest && !factorXTest && singleTest && isFactorXiTest(singleTest)
    ? singleTest
    : null;
  const peripheralSmearTest = !cbcTest && !rbcTest && !plateletTest && !tlcTest && !absoluteCountTest && !mchcTest && !mchTest && !mcvTest && !mpvTest && !hctPcvTest && !esrTest && !pdwTest && !hemoglobinTest && !ptTest && !apttTest && !dlcTest && !indirectCoombsTest && !directCoombsTest && !fibrinogenTest && !reticulocyteTest && !clottingTimeTest && !factorViiiTest && singleTest && isPeripheralBloodSmearTest(singleTest)
    ? singleTest
    : null;
  const factorXiiTest = !cbcTest && !rbcTest && !plateletTest && !tlcTest && !absoluteCountTest && !mchcTest && !mchTest && !mcvTest && !mpvTest && !hctPcvTest && !esrTest && !pdwTest && !hemoglobinTest && !ptTest && !apttTest && !dlcTest && !indirectCoombsTest && !directCoombsTest && !fibrinogenTest && !reticulocyteTest && !clottingTimeTest && !factorViiiTest && !peripheralSmearTest && singleTest && isFactorXiiTest(singleTest)
    ? singleTest
    : null;
  const factorXiiiTest = !cbcTest && !rbcTest && !plateletTest && !tlcTest && !absoluteCountTest && !mchcTest && !mchTest && !mcvTest && !mpvTest && !hctPcvTest && !esrTest && !pdwTest && !hemoglobinTest && !ptTest && !apttTest && !dlcTest && !indirectCoombsTest && !directCoombsTest && !fibrinogenTest && !reticulocyteTest && !clottingTimeTest && !factorViiiTest && !peripheralSmearTest && !factorXiiTest && singleTest && isFactorXiiiTest(singleTest)
    ? singleTest
    : null;

  const testTitle = reportData.tests.length > 0 
    ? reportData.tests.map(t => {
        if (getCombinationDefinition(t)) return escapeHtml(t.name);
        if (getCellReportDefinition(t)) return escapeHtml(t.name);
        const name = t.name.toUpperCase();
        if (name.includes("INDIRECT COOMBS TEST") || name.includes("COOMBS TEST, INDIRECT")) return "INDIRECT COOMBS TEST";
        if (reportData.tests.length === 1 && isDirectCoombsTest(t)) return "DIRECT COOMBS TEST";
        if (reportData.tests.length === 1 && isBloodGroupTest(t)) return "BLOOD GROUP";
        if (reportData.tests.length === 1 && isDDimerTest(t)) return "D-DIMER";
        if (reportData.tests.length === 1 && isSickleCellMutationAnalysisTest(t)) return "SICKLE CELL ANEMIA MUTATION ANALYSIS";
        if (reportData.tests.length === 1 && isBeta2GlycoproteinPanelTest(t)) return "BETA 2 GLYCOPROTEIN I, PANEL";
        if (reportData.tests.length === 1 && isToxoplasmaAntibodiesPanelTest(t)) return "TOXOPLASMA ANTIBODIES PANEL";
        if (reportData.tests.length === 1 && isTorchProfileTest(t)) return "TORCH PROFILE";
        if (reportData.tests.length === 1 && isTnfAlphaTest(t)) return "TUMOUR NECROSIS FACTOR (TNF), ALPHA";
        if (reportData.tests.length === 1 && isRheumatoidFactorTest(t)) return "RHEUMATOID FACTOR, RA";
        if (reportData.tests.length === 1 && isAsoTiterTest(t)) return "ANTISTREPTOLYSIN O, ASO TITER";
        if (reportData.tests.length === 1 && isHsCrpTest(t)) return "HS-CRP (HIGH SENSITIVITY C-REACTIVE PROTEIN)";
        if (reportData.tests.length === 1 && isRtPcrTest(t)) return "RT-PCR";
        if (reportData.tests.length === 1 && isTpmtGenotypingTest(t)) return "THIOPURINE METHYL TRANSFERASE (TPMT), GENOTYPING";
        if (reportData.tests.length === 1 && isCysticFibrosisNewbornScreenTest(t)) return "CYSTIC FIBROSIS (CF), NEWBORN, SCREEN";
        if (reportData.tests.length === 1 && isKftTest(t)) return "KIDNEY FUNCTION TEST (KFT)";
        if (reportData.tests.length === 1 && isFactorIiFunctionalTest(t)) return "FACTOR II";
        if (reportData.tests.length === 1 && isKaryotypeTest(t)) return "KARYOTYPE";
        if (reportData.tests.length === 1 && isLipidProfileTest(t)) return "LIPID PROFILE";
        if (reportData.tests.length === 1 && isLftTest(t)) return "LIVER FUNCTION TEST (LFT)";
        if (reportData.tests.length === 1 && isHba1cTest(t)) return "HbA1c (GLYCOSYLATED HEMOGLOBIN)";
        if (reportData.tests.length === 1 && isVitaminD25HydroxyTest(t)) return "VITAMIN D, 25 - HYDROXY";
        if (reportData.tests.length === 1 && isVitaminCTest(t)) return "VITAMIN C (ASCORBIC ACID)";
        if (reportData.tests.length === 1 && isVitaminB12Test(t)) return "VITAMIN B12 (CYANOCOBALAMIN)";
        if (reportData.tests.length === 1 && isRandomBloodSugarTest(t)) return "RANDOM BLOOD SUGAR (RBS)";
        if (reportData.tests.length === 1 && isFastingBloodSugarTest(t)) return "FASTING PLASMA GLUCOSE (FPG)";
        if (reportData.tests.length === 1 && isBTypeNatriureticPeptideTest(t)) return "B-TYPE NATRIURETIC PEPTIDE (BNP)";
        if (reportData.tests.length === 1 && isCreatineKinaseTest(t)) return "CREATINE KINASE (CK)";
        if (reportData.tests.length === 1 && isBeta2MicroglobulinTest(t)) return "BETA 2 MICROGLOBULIN";
        if (reportData.tests.length === 1 && isAltSgptTest(t)) return "ALANINE AMINOTRANSFERASE (ALT) - SGPT";
        if (reportData.tests.length === 1 && isDnphTest(t)) return "DNPH";
        if (reportData.tests.length === 1 && isPrealbuminTest(t)) return "PREALBUMIN";
        if (reportData.tests.length === 1 && isHaptoglobinTest(t)) return "HAPTOGLOBIN";
        if (reportData.tests.length === 1 && isGramStainBacterialVaginosisTest(t)) return "GRAM STAIN FOR BACTERIAL VAGINOSIS (BV)";
        if (reportData.tests.length === 1 && isAldolaseTest(t)) return "ALDOLASE";
        if (reportData.tests.length === 1 && isUrineProteinCreatinineRatioTest(t)) return "URINE PROTEIN - CREATININE RATIO (UPCR)";
        if (reportData.tests.length === 1 && isAlbuminCreatinineRatioTest(t)) return "URINE ALBUMIN - CREATININE RATIO (ACR)";
        if (reportData.tests.length === 1 && isPostPrandialBloodSugarTest(t)) return "POST PRANDIAL BLOOD SUGAR (PPBS)";
        if (reportData.tests.length === 1 && isTacrolimusTest(t)) return "TACROLIMUS";
        if (reportData.tests.length === 1 && isPhosphorusTest(t)) return "PHOSPHORUS";
        if (reportData.tests.length === 1 && isAlkalinePhosphataseTest(t)) return "ALKALINE PHOSPHATASE (ALP)";
        if (reportData.tests.length === 1 && isClotRetractionTest(t)) return "CLOT RETRACTION TEST";
        if (reportData.tests.length === 1 && isGroupBStrepTest(t)) return "GROUP B STREP (GBS)";
        if (reportData.tests.length === 1 && isFungusKohPreparationTest(t)) return "FUNGUS ROUTINE, KOH PREPARATION";
        if (reportData.tests.length === 1 && isSputumAfbTest(t)) return "SPUTUM EXAMINATION, AFB";
        if (reportData.tests.length === 1 && isAfbCultureSensitivityTest(t)) return "AFB CULTURE & SENSITIVITY";
        if (reportData.tests.length === 1 && isStoolCultureTest(t)) return "STOOL CULTURE";
        if (reportData.tests.length === 1 && isUrineCultureTest(t)) return "URINE CULTURE";
        if (reportData.tests.length === 1 && isMalariaParasiteIdentificationTest(t)) return "MALARIA PARASITE IDENTIFICATION";
        if (reportData.tests.length === 1 && isMycobacteriumCombinedPanelTest(t)) return "MYCOBACTERIUM COMBINED PANEL - TB (COMBINE)";
        if (reportData.tests.length === 1 && isOvaAndParasiteTest(t)) return "OVA AND PARASITE TEST";
        if (reportData.tests.length === 1 && isTripleMarkerTest(t)) return "TRIPLE MARKER";
        if (reportData.tests.length === 1 && isDoubleMarkerTest(t)) return "DOUBLE MARKER";
        if (reportData.tests.length === 1 && isPax8Test(t)) return "PAX 8";
        if (reportData.tests.length === 1 && isGalectin3Test(t)) return "GALECTIN-3";
        if (reportData.tests.length === 1 && isHer2Test(t)) return "HER2 (ERBB2) AMPLIFICATION FLUORESCENCE IN-SITU HYBRIDIZATION (FISH)";
        if (reportData.tests.length === 1 && isDcpTest(t)) return "DES-GAMMA CARBOXY PROTHROMBIN (DCP)";
        if (reportData.tests.length === 1 && isAfpTumorMarkerTest(t)) return "AFP (ALPHA FETOPROTEIN), TUMOR MARKER";
        if (reportData.tests.length === 1 && isCa199Test(t)) return "CA 19-9 PANCREATIC CANCER MARKER";
        if (reportData.tests.length === 1 && isCa153Test(t)) return "CA 15-3 BREAST CANCER MARKER";
        if (reportData.tests.length === 1 && isCa125Test(t)) return "CA 125 - OVARIAN CANCER MARKER";
        if (reportData.tests.length === 1 && isTroponinITest(t)) return "TROPONIN-I, HIGH SENSITIVE";
        if (reportData.tests.length === 1 && isTroponinTTest(t)) return "TROPONIN-T, HIGH SENSITIVE";
        if (reportData.tests.length === 1 && isDengueNs1Test(t)) return "DENGUE FEVER ANTIGEN, NS1";
        if (reportData.tests.length === 1 && isDengueIggTest(t)) return "DENGUE FEVER ANTIBODY, IgG";
        if (reportData.tests.length === 1 && isDengueIgmTest(t)) return "DENGUE FEVER ANTIBODY, IgM";
        if (reportData.tests.length === 1 && isTyphidotTest(t)) return "TYPHIDOT";
        if (reportData.tests.length === 1 && isVdrlTest(t)) return "VDRL (RPR)";
        if (reportData.tests.length === 1 && isHavIggTest(t)) return "HEPATITIS A ANTIBODY (Anti- HAV), IgG, SERUM";
        if (reportData.tests.length === 1 && isHavIgmTest(t)) return "HEPATITIS A ANTIBODY (Anti HAV), IgM, SERUM";
        if (reportData.tests.length === 1 && isHcvRapidScreeningTest(t)) return "HEPATITIS C VIRUS (HCV) RAPID SCREENING TEST";
        if (reportData.tests.length === 1 && isHbsAgTest(t)) return "HEPATITIS B SURFACE ANTIGEN (HBsAg)";
        if (reportData.tests.length === 1 && isAntiHbcIgmTest(t)) return "HEPATITIS B CORE ANTIBODY (Anti- HBc), IgM";
        if (reportData.tests.length === 1 && isHepatitisBProfileTest(t)) return "HEPATITIS B PROFILE";
        if (reportData.tests.length === 1 && isMantouxTest(t)) return "MANTOUX TEST (TUBERCULIN SKIN TEST)<br>(Intradermal Skin Test)";
        if (reportData.tests.length === 1 && isHiv12ScreeningTest(t)) return "HIV 1 &amp; 2 ANTIBODIES SCREENING TEST, SERUM";
        if (reportData.tests.length === 1 && isAntiBTitreTest(t)) return "Anti B TITRE, IgG";
        if (reportData.tests.length === 1 && isAntiATitreTest(t)) return "ANTI A TITRE, IGM";
        if (reportData.tests.length === 1 && isDustAllergyTest(t)) return "DUST ALLERGY";
        if (reportData.tests.length === 1 && isDengueFeverPanelTest(t)) return "DENGUE FEVER PANEL";
        if (reportData.tests.length === 1 && isG6PdTest(t)) return "Glucose-6-phosphate dehydrogenase (G-6-PD)";
        if (reportData.tests.length === 1 && isAntiHbsTest(t)) return "HEPATITIS B SURFACE ANTIBODY (Anti- HBs)";
        if (reportData.tests.length === 1 && isGangliosideGm1IggTest(t)) return "Ganglioside GM1 Antibody, IgG";
        if (reportData.tests.length === 1 && isGangliosideGm1IgmTest(t)) return "Ganglioside GM1 Antibody, IgM";
        if (reportData.tests.length === 1 && isGangliosideGd1aIggTest(t)) return "Ganglioside GD1a Antibody, IgG";
        if (reportData.tests.length === 1 && isGangliosideGd1aIgmTest(t)) return "Ganglioside GD1a Antibody, IgM";
        if (reportData.tests.length === 1 && isGangliosideGd1bIggTest(t)) return "Ganglioside GD1b Antibody, IgG";
        if (reportData.tests.length === 1 && isGangliosideGq1bIggTest(t)) return "GANGLIOSIDE GQ1b ANTIBODY, IgG";
        if (reportData.tests.length === 1 && isAntiHistoneAntibodiesTest(t)) return "ANTI-HISTONE ANTIBODIES";
        if (reportData.tests.length === 1 && isRibosomePAntibodiesTest(t)) return "RIBOSOME P ANTIBODIES";
        if (reportData.tests.length === 1 && isAntiCcpTest(t)) return "ANTI CYCLIC-CITRULLINATED-PEPTIDE (ANTI CCP)";
        if (reportData.tests.length === 1 && isImmunoglobulinIggTest(t)) return "IMMUNOGLOBULIN IgG";
        if (reportData.tests.length === 1 && isImmunoglobulinIgeTest(t)) return "IMMUNOGLOBULIN IgE";
        if (reportData.tests.length === 1 && isImmunoglobulinIgmTest(t)) return "IMMUNOGLOBULIN IgM";
        if (reportData.tests.length === 1 && isImmunoglobulinIgaTest(t)) return "IMMUNOGLOBULIN IgA";
        if (reportData.tests.length === 1 && isRastTest(t)) return "RADIOALLERGOSORBENT (RAST)";
        if (reportData.tests.length === 1 && isWidalTest(t)) return "WIDAL SLIDE AGGLUTINATION TEST";
        if (reportData.tests.length === 1 && isCrpTest(t)) return "C-REACTIVE PROTEIN (CRP)";
        if (reportData.tests.length === 1 && isVitaminETest(t)) return "VITAMIN E (TOCOPHEROL)";
        if (reportData.tests.length === 1 && isVitaminB9Test(t)) return "VITAMIN B9 (FOLIC ACID / FOLATE)";
        if (reportData.tests.length === 1 && isVitaminKTest(t)) return "VITAMIN K";
        if (reportData.tests.length === 1 && isLdlCholesterolTest(t)) return "LDL Cholesterol";
        if (reportData.tests.length === 1 && isHdlCholesterolTest(t)) return "HDL Cholesterol";
        if (reportData.tests.length === 1 && isIndirectBilirubinTest(t)) return "BILIRUBIN, INDIRECT";
        if (reportData.tests.length === 1 && isCalciumTest(t)) return "CALCIUM";
        if (reportData.tests.length === 1 && isFerritinTest(t)) return "FERRITIN";
        if (reportData.tests.length === 1 && isCPeptideTest(t)) return "C-PEPTIDE FASTING";
        if (reportData.tests.length === 1 && isVldlCholesterolTest(t)) return "VLDL Cholesterol";
        if (reportData.tests.length === 1 && isComprehensiveMetabolicPanelTest(t)) return "COMPREHENSIVE METABOLIC PANEL (CMP)";
        if (reportData.tests.length === 1 && isElectrolyteProfileTest(t)) return "ELECTROLYTES";
        if (reportData.tests.length === 1 && isPotassiumTest(t)) return "POTASSIUM";
        if (reportData.tests.length === 1 && isAstSgotTest(t)) return "ASPARTATE AMINOTRANSFERASE (AST) - SGOT";
        if (reportData.tests.length === 1 && isGlobulinTest(t)) return "GLOBULIN";
        if (reportData.tests.length === 1 && isAlbuminTest(t)) return "ALBUMIN";
        if (reportData.tests.length === 1 && isDigoxinTest(t)) return "DIGOXIN";
        if (reportData.tests.length === 1 && isBunTest(t)) return "BLOOD UREA NITROGEN (BUN)";
        if (reportData.tests.length === 1 && isSodiumTest(t)) return "SODIUM";
        if (reportData.tests.length === 1 && isIronTest(t)) return "IRON";
        if (reportData.tests.length === 1 && isLacticAcidTest(t)) return "LACTIC ACID (LACTATE)";
        if (reportData.tests.length === 1 && isMagnesiumTest(t)) return "MAGNESIUM";
        if (reportData.tests.length === 1 && isLipaseTest(t)) return "LIPASE";
        if (reportData.tests.length === 1 && isAmylaseTest(t)) return "AMYLASE";
        if (reportData.tests.length === 1 && isGgtTest(t)) return "GAMMA GLUTAMYL TRANSFERASE (GGT)";
        if (reportData.tests.length === 1 && isChlorideTest(t)) return "CHLORIDE";
        if (reportData.tests.length === 1 && isCreatinine24HourUrineTest(t)) return "CREATININE, 24-HOUR URINE";
        if (reportData.tests.length === 1 && isSemenAnalysisTest(t)) return "SEMEN ANALYSIS - SEMINOGRAM";
        if (reportData.tests.length === 1 && isUrineCotinineTest(t)) return "URINE COTININE";
        if (reportData.tests.length === 1 && isUrineGlucoseTest(t)) return "URINE GLUCOSE";
        if (reportData.tests.length === 1 && isPorphyrinsTest(t)) return "PORPHYRINS";
        if (reportData.tests.length === 1 && isOccultBloodStoolTest(t)) return "OCCULT BLOOD STOOL EXAMINATION";
        if (reportData.tests.length === 1 && isCsfAnalysisTest(t)) return "CEREBROSPINAL FLUID (CSF) ANALYSIS";
        if (reportData.tests.length === 1 && isTshTest(t)) return "THYROID STIMULATING HORMONE (TSH)";
        if (reportData.tests.length === 1 && isThyroidProfileTest(t)) return "THYROID PROFILE";
        if (reportData.tests.length === 1 && isThyroidAntibodiesTest(t)) return "THYROID ANTIBODIES";
        if (reportData.tests.length === 1 && isTriiodothyronineTotalTest(t)) return "TRIIODOTHYRONINE (T3), TOTAL";
        if (reportData.tests.length === 1 && isTestosteroneTotalTest(t)) return "TESTOSTERONE, TOTAL";
        if (reportData.tests.length === 1 && isProgesteroneTest(t)) return "PROGESTERONE";
        if (reportData.tests.length === 1 && isCortisoneTest(t)) return "CORTISONE";
        if (reportData.tests.length === 1 && isBetaHcgPregnancyTest(t)) return "HCG, BETA, TOTAL, PREGNANCY";
        if (reportData.tests.length === 1 && isProlactinTest(t)) return "PROLACTIN (PRL)";
        if (reportData.tests.length === 1 && isDheaTest(t)) return "DEHYDROEPIANDROSTERONE (DHEA)";
        if (reportData.tests.length === 1 && isEstradiolTest(t)) return "ESTRADIOL (E2)";
        if (reportData.tests.length === 1 && isLuteinizingHormoneTest(t)) return "LUTEINISING HORMONE (LH)";
        if (reportData.tests.length === 1 && isFollicleStimulatingHormoneTest(t)) return "FOLLICLE STIMULATING HORMONE (FSH)";
        if (reportData.tests.length === 1 && isThyroxineTotalTest(t)) return "THYROXINE (T4), TOTAL";
        if (reportData.tests.length === 1 && isCalcitoninTest(t)) return "CALCITONIN";
        if (reportData.tests.length === 1 && isInhibinATest(t)) return "INHIBIN A, REPRODUCTIVE MARKER";
        if (reportData.tests.length === 1 && isInhibinBTest(t)) return "INHIBIN B";
        if (reportData.tests.length === 1 && isPappATest(t)) return "PAPP-A (PREGNANCY ASSOCIATED PLASMA PROTEIN-A)";
        if (reportData.tests.length === 1 && isDheasTest(t)) return "DEHYDROEPIANDROSTERONE SULPHATE (DHEAS)";
        if (reportData.tests.length === 1 && isFnacTest(t)) return "FINE NEEDLE ASPIRATION CYTOLOGY (FNAC)";
        if (reportData.tests.length === 1 && isPapSmearTest(t)) return "CYTOLOGY, PAP SMEAR EXAMINATION";
        if (reportData.tests.length === 1 && isHistopathologyReportTest(t)) return getHistopathologyTitle(t);
        if (reportData.tests.length === 1 && isCreatinineTest(t)) return "CREATININE";
        if (reportData.tests.length === 1 && isIonizedCalciumTest(t)) return "IONIZED CALCIUM (iCalcium)";
        if (reportData.tests.length === 1 && isFlecainideTest(t)) return "FLECAINIDE";
        if (reportData.tests.length === 1 && isPhenobarbitalTest(t)) return "PHENOBARBITAL";
        if (reportData.tests.length === 1 && isKetoneBodyTest(t)) return "KETONE BODY (BETA HYDROXYBUTYRATE)";
        if (reportData.tests.length === 1 && isUricAcidTest(t)) return "URIC ACID";
        if (reportData.tests.length === 1 && isTibcTest(t)) return "Total Iron Binding Capacity (TIBC)";
        if (reportData.tests.length === 1 && isSerumOsmolalityTest(t)) return "OSMOLALITY, SERUM";
        if (reportData.tests.length === 1 && isArterialBloodGasTest(t)) return "BLOOD GAS ANALYSIS, ARTERIAL";
        if (reportData.tests.length === 1 && isManganeseBloodTest(t)) return "MANGANESE, BLOOD";
        if (reportData.tests.length === 1 && isSeleniumSerumTest(t)) return "SELENIUM, SERUM";
        if (getCbcVariant(t.name)) return getCbcHeading(getCbcVariant(t.name));
        if (isRbcCountTest(t)) return "RED BLOOD CELL (RBC) COUNT";
        if (isPlateletCountTest(t)) return "PLATELET COUNT";
        if (isTlcCountTest(t)) return "TOTAL LEUCOCYTE COUNT (TLC)";
        const absoluteTemplate = reportData.tests.length === 1 ? getAbsoluteCountTemplate(t) : null;
        if (absoluteTemplate) return absoluteTemplate.title;
        if (reportData.tests.length === 1 && isMchcTest(t)) return "MEAN CORPUSCULAR HEMOGLOBIN CONCENTRATION (MCHC)";
        if (reportData.tests.length === 1 && isMchTest(t)) return "MEAN CORPUSCULAR HEMOGLOBIN (MCH)";
        if (reportData.tests.length === 1 && isMcvTest(t)) return "MEAN CORPUSCULAR VOLUME (MCV)";
        if (reportData.tests.length === 1 && isMpvTest(t)) return "MEAN PLATELET VOLUME (MPV)";
        if (reportData.tests.length === 1 && isHctPcvTest(t)) return "HEMATOCRIT (HCT)";
        if (reportData.tests.length === 1 && isEsrTest(t)) return "ESR (ERYTHROCYTE SEDIMENTATION RATE)";
        if (reportData.tests.length === 1 && isPdwTest(t)) return "PLATELET DISTRIBUTION WIDTH (PDW)";
        if (reportData.tests.length === 1 && isHemoglobinTest(t)) return "HEMOGLOBIN (HB)";
        if (reportData.tests.length === 1 && isProthrombinTimeTest(t)) return "PROTHROMBIN TIME STUDIES";
        if (reportData.tests.length === 1 && isApttTest(t)) return "Activated partial thromboplastin time, APTT";
        if (reportData.tests.length === 1 && isDlcTest(t)) return "DIFFERENTIAL LEUCOCYTE COUNT (DLC)";
        if (reportData.tests.length === 1 && isFibrinogenTest(t)) return "FIBRINOGEN";
        if (reportData.tests.length === 1 && isReticulocyteCountTest(t)) return "RETICULOCYTE COUNT";
        if (reportData.tests.length === 1 && isClottingTimeTest(t)) return "CLOTTING TIME (CT)";
        if (reportData.tests.length === 1 && isBleedingTimeTest(t)) return "BLEEDING TIME (BT)";
        if (reportData.tests.length === 1 && isCoagulationProfileTest(t)) return "COAGULATION PROFILE";
        if (reportData.tests.length === 1 && isFactorVTest(t)) return "FACTOR V";
        if (reportData.tests.length === 1 && isFactorViiTest(t)) return "FACTOR VII";
        if (reportData.tests.length === 1 && isFactorIxTest(t)) return "FACTOR IX";
        if (reportData.tests.length === 1 && isFactorXTest(t)) return "FACTOR X";
        if (reportData.tests.length === 1 && isFactorXiTest(t)) return "FACTOR XI";
        if (reportData.tests.length === 1 && isFactorViiiTest(t)) return "FACTOR VIII (ANTIHEMOPHILIC FACTOR A)";
        if (reportData.tests.length === 1 && isPeripheralBloodSmearTest(t)) return "PERIPHERAL BLOOD SMEAR EXAMINATION";
        if (reportData.tests.length === 1 && isFactorXiiTest(t)) return "FACTOR XII";
        if (reportData.tests.length === 1 && isFactorXiiiTest(t)) return "FACTOR XIII";
        if (name.includes("PROTHROMBIN TIME") || name.includes("PTIME") || name.includes("P-TIME") || name === "PT") return "PROTHROMBIN TIME STUDIES";
        return "LABORATORY REPORT";
      }).filter((v, i, a) => a.indexOf(v) === i).join(", ")
    : "LABORATORY REPORT";

  return supplementReportHtml(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <style>
        @page {
          size: A4;
          margin: 0;
        }
        body { 
          font-family: Aptos, "Segoe UI", Calibri, Arial, sans-serif;
          font-size: 14px;
          margin: 0; 
          padding: 0;
          color: #000; 
          line-height: 1.1;
          box-sizing: border-box;
          background: white;
          width: auto;
        }
        @media screen {
          html {
            min-height: 100%;
            padding: ${embeddedPreview ? "0" : "16px"};
            background: ${embeddedPreview ? "#ffffff" : "#e9efee"};
            /* Prevent mobile browsers from selectively enlarging note and
               description text when a report is opened through its QR link. */
            -webkit-text-size-adjust: none;
            text-size-adjust: none;
          }
          body {
            position: relative;
            width: 210mm;
            min-height: 297mm;
            margin: ${embeddedPreview ? "0" : "0 auto"};
            padding: ${reportHeaderSpaceMm}mm 10mm ${reportFooterSpaceMm}mm;
            box-shadow: ${embeddedPreview ? "none" : "0 14px 34px rgba(15, 23, 42, 0.18)"};
          }
        }
        /* Android browsers may otherwise boost only selected paragraphs in
           long report descriptions. This applies only to the QR/mobile view. */
        @media screen and (max-width: 767px) {
          html, body, body * {
            -webkit-text-size-adjust: none !important;
            text-size-adjust: none !important;
          }
        }
        .letterhead-background {
          position: fixed;
          top: 0;
          left: 0;
          width: 210mm;
          height: 297mm;
          display: block;
          object-fit: fill;
          z-index: 0;
        }
        @media screen {
          .letterhead-background {
            position: absolute;
          }
        }
        .main-content {
          position: relative;
          z-index: 1;
          padding: 0;
          min-height: calc(297mm - ${reportHeaderSpaceMm}mm - ${reportFooterSpaceMm}mm);
          display: flex;
          flex-direction: column;
        }
        .report-print-controls {
          position: fixed;
          right: 16px;
          bottom: 16px;
          z-index: 20;
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 9px;
          border: 1px solid #cbd5e1;
          border-radius: 12px;
          background: rgba(255, 255, 255, 0.96);
          box-shadow: 0 8px 22px rgba(15, 23, 42, 0.18);
          font-family: Aptos, "Segoe UI", Calibri, Arial, sans-serif;
        }
        .report-print-controls span { color: #475569; font-size: 12px; font-weight: 600; }
        .report-print-controls button {
          border: 0;
          border-radius: 8px;
          padding: 8px 11px;
          color: #fff;
          background: #0f766e;
          font: inherit;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
        }
        .report-print-controls button[data-print-style="plain"] { background: #334155; }
        .report-print-controls button:disabled { cursor: wait; opacity: 0.7; }
        .report-view-controls {
          position: fixed;
          right: 16px;
          bottom: 16px;
          z-index: 20;
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 9px;
          border: 1px solid #cbd5e1;
          border-radius: 12px;
          background: rgba(255, 255, 255, 0.96);
          box-shadow: 0 8px 22px rgba(15, 23, 42, 0.18);
          font-family: Aptos, "Segoe UI", Calibri, Arial, sans-serif;
        }
        .report-view-controls span { color: #475569; font-size: 12px; font-weight: 600; }
        .report-view-controls button {
          border: 0;
          border-radius: 8px;
          padding: 8px 11px;
          color: #fff;
          background: #0f766e;
          font: inherit;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
        }
        .report-view-controls button[data-report-action="download"] { background: #334155; }
        .view-only-print-notice { display: none; }
        
        .header-table {
          width: 100%;
          border-bottom: 1.5px solid #000;
          border-collapse: collapse;
          margin-bottom: 10px;
        }
        .header-table td {
          vertical-align: top;
          padding: 7px 8px;
          border-right: 1px solid #c6cbd0;
        }
        .header-table td:last-child {
          border-right: none;
        }

        .patient-overview {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 8px;
        }
        .patient-meta { min-width: 0; flex: 1 1 auto; }
        .patient-name { font-size: 18px; font-weight: 700; margin-bottom: 5px; text-transform: uppercase; line-height: 1.1; }
        .info-row { margin-bottom: 3px; font-size: 12px; line-height: 1.2; }
        
        .qr-frame {
          width: 72px;
          height: 72px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 1px 0 0;
          padding: 3px;
          border: 1.5px solid #000;
        }
        .qr-img { width: 64px; height: 64px; display: block; }
        .collection-heading { font-size: 15px; font-weight: 700; line-height: 1.18; margin-bottom: 5px; }
        .collection-location { font-size: 12px; line-height: 1.32; min-height: 32px; white-space: pre-line; }
        .referral-row { margin-top: 9px; font-size: 13px; line-height: 1.25; }
        .header-barcode { text-align: right; padding-left: 5px !important; }
        .barcode-img { height: 32px; width: auto; max-width: 100%; margin: 0 0 6px; }
        .date-row { font-size: 10.5px; line-height: 1.48; white-space: nowrap; }

        .test-title { 
          text-align: center; 
          font-weight: bold; 
          font-size: 18px; 
          margin: 5px 0;
          text-transform: uppercase;
          text-decoration: underline;
        }
        
        table.results-table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
        table.results-table th { 
          border-top: 1.5px solid #000; 
          border-bottom: 1.5px solid #000; 
          padding: 5px; 
          text-align: left; 
          font-weight: bold;
          font-size: 15px;
        }
        table.results-table td { padding: 4px 5px; font-size: 15px; vertical-align: top; }
        .center { text-align: center; }
        .high-val { color: #d32f2f; font-weight: bold; }
        .low-val { color: #1976d2; font-weight: bold; }
        .normal-val { color: #2e7d32; font-weight: bold; }
        .equivocal-val { color: #1565c0; font-weight: bold; }
        .report-result-status { margin-left: 8px; font-size: 11px; font-weight: bold; white-space: nowrap; }
        .b2gpi-table td, .b2gpi-table th, .toxoplasma-table td, .toxoplasma-table th, .hs-crp-table td, .hs-crp-table th { font-size: 10.5px; line-height: 1.12; padding: 4px; }
        .b2gpi-section td, .toxoplasma-section td { padding-top: 6px !important; padding-bottom: 4px !important; }
        .torch-profile-table td, .torch-profile-table th, .tnf-alpha-table td, .tnf-alpha-table th { font-size: 10.5px; line-height: 1.12; padding: 4px; }
        .torch-profile-section td { font-weight: bold; text-transform: uppercase; padding-top: 6px !important; padding-bottom: 4px !important; }
        .torch-profile-interpretation-table { width: 72%; }
        .torch-profile-status, .tnf-alpha-status { margin-left: 8px; font-weight: bold; white-space: nowrap; }
        .tnf-alpha-method { font-size: 8px; line-height: 1; color: #333; font-weight: normal; margin-top: 1px; }
        .tnf-alpha-notes { margin: 5px 5px 3px; font-size: 10px; line-height: 1.2; }
        .tnf-alpha-notes p { margin: 3px 0 7px; text-align: justify; }
        .tnf-alpha-notes ul { margin: 2px 0 7px; padding-left: 18px; }
        .tnf-alpha-notes li { margin-bottom: 2px; text-align: justify; }
        .report-template-notes { margin: 5px 5px 3px; font-size: 10px; line-height: 1.2; }
        .report-template-notes p { margin: 3px 0 6px; text-align: justify; }
        .report-template-notes ul, .report-template-notes ol { margin: 2px 0 6px; padding-left: 18px; }
        .report-template-notes li { margin: 0 0 2px; text-align: justify; }
        .report-reference-table { border-collapse: collapse; margin: 4px 0 8px; font-size: 9.5px; }
        .report-reference-table th, .report-reference-table td { border: 1px solid #888; padding: 4px 5px; text-align: left; vertical-align: top; }
        .report-reference-table th { font-weight: bold; }
        .b2gpi-criteria-table { width: 68%; }
        .toxoplasma-threshold-table { width: 48%; }
        .toxoplasma-remark-table { width: 100%; }
        .toxoplasma-remark-table th:first-child, .toxoplasma-remark-table td:first-child, .toxoplasma-remark-table th:nth-child(2), .toxoplasma-remark-table td:nth-child(2) { width: 15%; }
        .hs-crp-interpretation-table { width: 72%; }
        .hs-crp-interpretation-table th { text-transform: uppercase; }
        .semen-analysis-table { margin-bottom: 4px; }
        .semen-analysis-table th { font-size: 10.5px !important; line-height: 1.05; padding: 3px 4px !important; }
        .semen-analysis-table td { font-size: 10px !important; line-height: 1.04; padding: 2px 4px !important; }
        .semen-analysis-table .semen-section td { font-weight: bold; text-transform: uppercase; padding-top: 5px !important; padding-bottom: 2px !important; }
        .semen-investigation-indent { padding-left: 14px !important; }
        .urine-cotinine-table td, .urine-cotinine-table th, .urine-glucose-table td, .urine-glucose-table th { font-size: 11px; line-height: 1.12; padding: 4px; }
        .cotinine-notes { font-size: 10.5px; line-height: 1.16; }
        .porphyrins-table td, .porphyrins-table th, .occult-blood-table td, .occult-blood-table th { font-size: 10.5px; line-height: 1.1; padding: 4px; }
        .porphyrins-section td { padding-top: 6px !important; padding-bottom: 4px !important; }
        .porphyrin-notes { font-size: 9px; line-height: 1.1; margin-top: 3px; }
        .porphyrin-notes ol { padding-left: 16px; margin: 2px 0; }
        .porphyrin-notes ul { padding-left: 16px; margin: 1px 0 2px; }
        .porphyrin-notes li { margin-bottom: 1px; }
        .occult-blood-notes { font-size: 11px; line-height: 1.2; margin-top: 6px; }
        .csf-analysis-table { margin-bottom: 4px; }
        .csf-analysis-table th { font-size: 10.5px !important; line-height: 1.05; padding: 3px 4px !important; }
        .csf-analysis-table td { font-size: 10px !important; line-height: 1.05; padding: 2px 4px !important; }
        .csf-analysis-table .single-analyte-sample-row td { padding-top: 4px !important; padding-bottom: 4px !important; }
        .csf-analysis-table .csf-section td { font-size: 10.5px !important; font-weight: bold; padding-top: 5px !important; padding-bottom: 2px !important; }
        .tsh-table td, .tsh-table th { font-size: 11px; line-height: 1.12; padding: 4px; }
        .tsh-notes { font-size: 10.5px; line-height: 1.2; }
        .thyroid-profile-table, .thyroid-antibodies-table { margin-bottom: 5px; }
        .thyroid-profile-table td, .thyroid-antibodies-table td { font-size: 10.5px; line-height: 1.12; padding: 3px 4px; }
        .thyroid-profile-table th, .thyroid-antibodies-table th { font-size: 10.5px; line-height: 1.1; padding: 4px; }
        .thyroid-profile-section td, .thyroid-antibodies-section td { font-weight: bold; padding-top: 5px !important; padding-bottom: 2px !important; }
        .thyroid-profile-notes, .thyroid-antibodies-notes { font-size: 10px; line-height: 1.18; margin: 5px 5px 2px; }
        .thyroid-profile-notes ol, .thyroid-antibodies-notes ul { margin: 2px 0 5px; padding-left: 18px; }
        .thyroid-profile-notes li, .thyroid-antibodies-notes li { margin-bottom: 2px; }
        .thyroid-antibodies-notes p { margin: 2px 0 7px; }
        .thyroid-profile-interpretation-table { width: 65%; border-collapse: collapse; margin: 3px 0 7px; font-size: 9.5px; }
        .thyroid-profile-interpretation-table th, .thyroid-profile-interpretation-table td { border: 1px solid #aaa; padding: 3px 4px; text-align: left; vertical-align: top; }
        .thyroid-profile-interpretation-table th { font-weight: bold; }
        .hormone-table td, .hormone-table th { font-size: 10.5px; line-height: 1.12; padding: 4px; }
        .hormone-notes { font-size: 10px; line-height: 1.2; }
        .hormone-reference-table { border-collapse: collapse; width: 62%; margin: 3px 0 7px; font-size: 9.5px; }
        .hormone-reference-table th, .hormone-reference-table td { border: 1px solid #aaa; padding: 3px 4px; text-align: left; vertical-align: middle; }
        .hormone-reference-table th { font-weight: bold; text-transform: uppercase; }
        .cortisone-reference-table { width: 39%; }
        .cortisone-reference-table th { text-align: center; }
        .beta-hcg-reference-table { width: 65%; }
        .inhibin-a-reference-table { width: 82%; }
        .papp-a-reference-table { width: 40%; }
        .inhibin-b-notes { font-size: 9px; line-height: 1.14; }
        .prolactin-notes ol ol { margin: 3px 0 2px; padding-left: 16px; }
        .cytology-report-body { font-size: 10px; line-height: 1.26; margin: 7px 6px 3px; }
        .cytology-report-table { width: 100%; border-collapse: collapse; }
        .cytology-report-table th, .cytology-report-table td { border: 1px solid #aaa; padding: 5px 6px; text-align: left; vertical-align: top; }
        .cytology-report-table th { width: 17%; text-transform: uppercase; font-weight: bold; }
        .cytology-report-table td { white-space: normal; }
        .pap-smear-specimen { margin: 1px 0 12px; }
        .pap-smear-report-body h3 { font-size: 14px; text-align: center; margin: 7px 0 9px; }
        .cytology-field { margin: 10px 0; }
        .cytology-field > strong { text-transform: uppercase; display: block; margin-bottom: 5px; }
        .cytology-field > div { margin: 4px 0; }
        .cytology-comments { margin: 13px 0 2px; text-align: justify; }
        .histopathology-report-body { font-size: 10px; line-height: 1.22; margin: 7px 6px 3px; }
        .histopathology-meta-table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
        .histopathology-meta-table th { width: 16%; text-align: left; text-transform: uppercase; vertical-align: top; padding: 3px 6px 3px 0; font-size: 10px; }
        .histopathology-meta-table td { vertical-align: top; padding: 3px 0; font-weight: 600; white-space: pre-line; }
        .histopathology-section { margin: 8px 0; }
        .histopathology-heading { font-size: 10px; font-weight: bold; text-transform: uppercase; margin-bottom: 3px; }
        .histopathology-content { white-space: normal; text-align: justify; }
        .histopathology-diagnosis { font-weight: 600; text-align: left; }

        /* CBC: clear grouped body, modeled for a familiar A4 lab-report reading flow. */
        table.cbc-table { margin-bottom: 4px; }
        table.cbc-table th {
          font-size: 11px;
          line-height: 1.1;
          padding: 4px 3px;
        }
        table.cbc-table td {
          font-size: 10.5px;
          line-height: 1.12;
          padding: 2px 3px;
        }
        .cbc-table .cbc-sample-row td { padding-top: 4px; padding-bottom: 4px; }
        .cbc-table .cbc-section td {
          font-size: 10.5px;
          line-height: 1;
          font-weight: bold;
          text-transform: uppercase;
          padding-top: 6px;
          padding-bottom: 2px;
        }
        .cbc-table .cbc-investigation { font-weight: 500; }
        .cbc-method { font-size: 8px; line-height: 1; color: #3b4c59; font-weight: 600; margin-top: 2px; }
        .cbc-status { font-size: 9.5px; margin-left: 5px; }
        .cbc-clinical-note { font-size: 9.5px; line-height: 1.2; margin: 3px 3px 4px; }
        .cbc-report .report-footer { margin-top: 3px; padding-top: 3px; font-size: 10px; }
        .rbc-table { margin-bottom: 8px; }
        .rbc-table .rbc-sample-row td { padding-top: 5px; padding-bottom: 5px; }
        .rbc-table .rbc-section td { font-weight: bold; text-transform: uppercase; padding-top: 8px; padding-bottom: 2px; }
        .rbc-status { font-size: 12px; margin-left: 10px; }
        .rbc-notes, .platelet-notes { font-size: 10px; line-height: 1.15; margin: 5px 5px 3px; }
        .rbc-notes ul, .platelet-notes ul { margin: 2px 0 5px; padding-left: 18px; }
        .rbc-notes li, .platelet-notes li { margin: 0 0 2px; }
        .report-note-heading { font-size: 11px; font-weight: bold; margin-top: 5px; }
        .instrument-note { margin: 5px 0 0; }
        .platelet-table { margin-bottom: 8px; }
        .platelet-table .platelet-sample-row td { padding-top: 5px; padding-bottom: 5px; }
        .platelet-method { font-size: 10px; color: #333; font-weight: normal; margin-top: 2px; }
        .platelet-status { font-size: 12px; margin-left: 10px; }
        .tlc-table { margin-bottom: 8px; }
        .tlc-table .tlc-sample-row td { padding-top: 5px; padding-bottom: 5px; }
        .tlc-method { font-size: 10px; color: #333; font-weight: normal; margin-top: 2px; }
        .tlc-status { font-size: 12px; margin-left: 10px; }
        .tlc-notes { font-size: 10px; line-height: 1.15; margin: 5px 5px 3px; }
        .tlc-notes ul { margin: 2px 0 5px; padding-left: 18px; }
        .tlc-notes li { margin: 0 0 2px; }
        .absolute-count-table { margin-bottom: 8px; }
        .absolute-count-table .absolute-count-sample-row td { padding-top: 5px; padding-bottom: 5px; }
        .absolute-count-method { font-size: 10px; color: #333; font-weight: normal; margin-top: 2px; }
        .absolute-count-status { font-size: 12px; margin-left: 10px; }
        .absolute-count-notes { font-size: 10px; line-height: 1.15; margin: 5px 5px 3px; }
        .absolute-count-notes ul { margin: 2px 0 5px; padding-left: 18px; }
        .absolute-count-notes li { margin: 0 0 2px; }
        .absolute-count-notes .absolute-paragraph { margin: 3px 0; }
        .absolute-count-notes .absolute-cause-list { margin-top: 10px; }
        .blood-group-table { margin-bottom: 7px; }
        .blood-group-table td { font-size: 10px; line-height: 1.1; padding: 3px; }
        .blood-group-table th { font-size: 10.5px; line-height: 1.08; padding: 3px; }
        .blood-group-sample-row td { padding-top: 4px !important; padding-bottom: 4px !important; }
        .blood-group-section td { font-weight: bold; text-transform: uppercase; padding-top: 5px !important; padding-bottom: 2px !important; }
        .blood-group-method { font-size: 8px; line-height: 1; color: #333; font-weight: normal; margin-top: 1px; }
        .blood-group-notes { font-size: 10px; line-height: 1.12; margin: 5px 5px 3px; }
        .blood-group-notes ol { margin: 2px 0 3px; padding-left: 18px; }
        .blood-group-notes li { margin: 0 0 2px; }
        .blood-group-report .report-footer { margin-top: 3px; padding-top: 3px; font-size: 10px; }
        .d-dimer-table { margin-bottom: 7px; }
        .d-dimer-table td { font-size: 10px; line-height: 1.1; padding: 3px; }
        .d-dimer-table th { font-size: 10.5px; line-height: 1.08; padding: 3px; }
        .d-dimer-method { font-size: 8px; line-height: 1; color: #333; font-weight: normal; margin-top: 1px; }
        .d-dimer-notes { font-size: 10px; line-height: 1.12; margin: 5px 5px 3px; }
        .d-dimer-notes ol { margin: 2px 0 5px; padding-left: 18px; }
        .d-dimer-notes li { margin: 0 0 2px; }
        .d-dimer-notes p { margin: 3px 0; text-align: justify; }
        .d-dimer-report .report-footer { margin-top: 3px; padding-top: 3px; font-size: 10px; }
        .mchc-table { margin-bottom: 8px; }
        .mchc-table .mchc-sample-row td { padding-top: 5px; padding-bottom: 5px; }
        .mchc-table .mchc-section td { padding-top: 8px; padding-bottom: 2px; font-weight: bold; }
        .mchc-method { font-size: 10px; color: #333; font-weight: normal; margin-top: 2px; }
        .mchc-status { font-size: 12px; margin-left: 10px; }
        .mchc-notes { font-size: 10px; line-height: 1.15; margin: 5px 5px 3px; }
        .mchc-notes ul { margin: 2px 0 5px; padding-left: 18px; }
        .mchc-notes li { margin: 0 0 2px; }
        .mchc-report .report-footer { margin-top: 3px; padding-top: 3px; font-size: 10px; }
        .mch-table { margin-bottom: 8px; }
        .mch-table .mch-sample-row td { padding-top: 5px; padding-bottom: 5px; }
        .mch-method { font-size: 10px; color: #333; font-weight: normal; margin-top: 2px; }
        .mch-status { font-size: 12px; margin-left: 10px; }
        .mch-notes { font-size: 10px; line-height: 1.15; margin: 5px 5px 3px; }
        .mch-notes ul { margin: 2px 0 5px; padding-left: 18px; }
        .mch-notes li { margin: 0 0 2px; }
        .mch-report .report-footer { margin-top: 3px; padding-top: 3px; font-size: 10px; }
        .mcv-table { margin-bottom: 8px; }
        .mcv-table .mcv-sample-row td { padding-top: 5px; padding-bottom: 5px; }
        .mcv-method { font-size: 10px; color: #333; font-weight: normal; margin-top: 2px; }
        .mcv-status { font-size: 12px; margin-left: 10px; }
        .mcv-notes { font-size: 10px; line-height: 1.15; margin: 5px 5px 3px; }
        .mcv-notes ul { margin: 2px 0 5px; padding-left: 18px; }
        .mcv-notes li { margin: 0 0 2px; }
        .mcv-report .report-footer { margin-top: 3px; padding-top: 3px; font-size: 10px; }
        .mpv-table { margin-bottom: 8px; }
        .mpv-method { font-size: 10px; color: #333; font-weight: normal; margin-top: 2px; }
        .mpv-status { font-size: 12px; margin-left: 10px; }
        .mpv-notes { font-size: 11px; line-height: 1.25; margin: 8px 5px 3px; }
        .mpv-notes p { margin: 3px 0; }
        .mpv-report .report-footer { margin-top: 3px; padding-top: 3px; font-size: 10px; }
        .hct-table { margin-bottom: 8px; }
        .hct-table .hct-sample-row td { padding-top: 5px; padding-bottom: 5px; }
        .hct-table .hct-section td { padding-top: 8px; padding-bottom: 2px; font-weight: bold; }
        .hct-status { font-size: 12px; margin-left: 10px; }
        .hct-notes { font-size: 10px; line-height: 1.15; margin: 5px 5px 3px; }
        .hct-notes ul { margin: 2px 0 5px; padding-left: 18px; }
        .hct-notes li { margin: 0 0 2px; }
        .hct-pcv-report .report-footer { margin-top: 3px; padding-top: 3px; font-size: 10px; }
        .esr-table { margin-bottom: 8px; }
        .esr-method { font-size: 10px; color: #333; font-weight: normal; margin-top: 2px; }
        .esr-notes { font-size: 11px; line-height: 1.3; margin: 8px 5px 3px; }
        .esr-notes p { margin: 3px 0 10px; }
        .esr-notes ol { margin: 2px 0 5px; padding-left: 18px; }
        .esr-notes li { margin: 0 0 4px; }
        .esr-report .report-footer { margin-top: 3px; padding-top: 3px; font-size: 10px; }
        .pdw-table { margin-bottom: 7px; }
        .pdw-table .pdw-sample-row td { padding-top: 5px; padding-bottom: 5px; }
        .pdw-method { font-size: 10px; color: #333; font-weight: normal; margin-top: 2px; }
        .pdw-status { font-size: 12px; margin-left: 10px; }
        .pdw-age-table, .pdw-interpretation-table { border-collapse: collapse; margin: 4px 5px 8px; font-size: 10px; }
        .pdw-age-table th, .pdw-age-table td, .pdw-interpretation-table th, .pdw-interpretation-table td { border: 1px solid #bbb; padding: 3px 5px; text-align: left; vertical-align: top; }
        .pdw-age-table th, .pdw-interpretation-table th { font-weight: bold; background: #fafafa; }
        .pdw-interpretation-table { width: calc(100% - 10px); }
        .pdw-interpretation-table th:first-child, .pdw-interpretation-table td:first-child { width: 16%; }
        .pdw-notes { font-size: 10px; line-height: 1.18; margin: 5px 5px 3px; }
        .pdw-notes p { margin: 3px 0 8px; }
        .pdw-report .report-footer { margin-top: 3px; padding-top: 3px; font-size: 10px; }
        .hemoglobin-table { margin-bottom: 8px; }
        .hemoglobin-table .hemoglobin-sample-row td { padding-top: 5px; padding-bottom: 5px; }
        .hemoglobin-method { font-size: 10px; color: #333; font-weight: normal; margin-top: 2px; }
        .hemoglobin-status { font-size: 12px; margin-left: 10px; }
        .hemoglobin-notes { font-size: 10px; line-height: 1.18; margin: 5px 5px 3px; }
        .hemoglobin-range-table, .hemoglobin-interpretation-table { border-collapse: collapse; margin: 4px 0 12px; font-size: 10px; }
        .hemoglobin-range-table th, .hemoglobin-range-table td, .hemoglobin-interpretation-table th, .hemoglobin-interpretation-table td { border: 1px solid #bbb; padding: 4px 5px; text-align: left; vertical-align: top; }
        .hemoglobin-range-table th, .hemoglobin-interpretation-table th { font-weight: bold; background: #fafafa; }
        .hemoglobin-interpretation-table { width: 100%; }
        .hemoglobin-interpretation-table th:first-child, .hemoglobin-interpretation-table td:first-child { width: 14%; }
        .hemoglobin-report .report-footer { margin-top: 3px; padding-top: 3px; font-size: 10px; }
        .pt-table, .aptt-table, .dlc-table { margin-bottom: 5px; }
        .pt-table td, .aptt-table td, .dlc-table td { font-size: 10px; line-height: 1.08; padding: 2px 3px; }
        .pt-table th, .aptt-table th, .dlc-table th { font-size: 10.5px; line-height: 1.08; padding: 3px; }
        .pt-section td, .aptt-section td, .dlc-section td { font-weight: bold; text-transform: uppercase; padding-top: 4px !important; padding-bottom: 1px !important; }
        .pt-method, .aptt-method { font-size: 8px; line-height: 1; color: #333; font-weight: normal; margin-top: 1px; text-transform: none; }
        .pt-status, .aptt-status { font-size: 9px; margin-left: 5px; }
        .pt-notes, .aptt-notes, .dlc-notes { font-size: 9.5px; line-height: 1.12; margin: 3px 5px 2px; }
        .pt-notes ol, .aptt-notes ol, .dlc-notes ul, .pt-notes ul, .aptt-notes ul { margin: 1px 0 3px; padding-left: 16px; }
        .pt-notes li, .aptt-notes li, .dlc-notes li { margin: 0 0 1px; }
        .pt-notes p, .aptt-notes p { margin: 2px 0; text-align: justify; }
        .pt-subheading { font-weight: bold; margin-top: 2px; }
        .pt-report .report-footer, .aptt-report .report-footer, .dlc-report .report-footer { margin-top: 3px; padding-top: 3px; font-size: 10px; }
        .direct-coombs-table, .fibrinogen-table, .reticulocyte-table { margin-bottom: 5px; }
        .direct-coombs-table td, .fibrinogen-table td, .reticulocyte-table td { font-size: 10px; line-height: 1.1; padding: 3px; }
        .direct-coombs-table th, .fibrinogen-table th, .reticulocyte-table th { font-size: 10.5px; line-height: 1.08; padding: 3px; }
        .direct-coombs-method, .fibrinogen-method, .reticulocyte-method { font-size: 8px; line-height: 1; color: #333; font-weight: normal; margin-top: 1px; }
        .fibrinogen-status, .reticulocyte-status { font-size: 9px; margin-left: 5px; }
        .direct-coombs-notes, .fibrinogen-notes, .reticulocyte-notes { font-size: 10px; line-height: 1.16; margin: 4px 5px 2px; }
        .direct-coombs-notes p, .fibrinogen-notes p, .reticulocyte-notes p { margin: 3px 0 5px; }
        .direct-coombs-notes ul, .reticulocyte-notes ul { margin: 2px 0 6px; padding-left: 18px; }
        .fibrinogen-notes ol { margin: 2px 0 7px; padding-left: 18px; }
        .direct-coombs-notes li, .reticulocyte-notes li, .fibrinogen-notes li { margin: 0 0 2px; }
        .direct-coombs-report .report-footer, .fibrinogen-report .report-footer, .reticulocyte-report .report-footer { margin-top: 3px; padding-top: 3px; font-size: 10px; }
        .indirect-coombs-table { margin-bottom: 5px; }
        .indirect-coombs-table td { font-size: 10px; line-height: 1.1; padding: 3px; }
        .indirect-coombs-table th { font-size: 10.5px; line-height: 1.08; padding: 3px; }
        .indirect-coombs-section td { font-weight: bold; text-transform: uppercase; padding-top: 4px !important; padding-bottom: 1px !important; }
        .indirect-coombs-method { font-size: 8px; line-height: 1; color: #333; font-weight: normal; margin-top: 1px; text-transform: none; }
        .indirect-coombs-notes { font-size: 10px; line-height: 1.15; margin: 4px 5px 2px; }
        .indirect-coombs-notes p { margin: 3px 0 6px; }
        .indirect-coombs-interpretation-table, .indirect-coombs-pregnancy-table { border-collapse: collapse; margin: 3px 0 7px; font-size: 9.5px; }
        .indirect-coombs-interpretation-table th, .indirect-coombs-interpretation-table td, .indirect-coombs-pregnancy-table th, .indirect-coombs-pregnancy-table td { border: 1px solid #bbb; padding: 3px 4px; text-align: left; vertical-align: top; }
        .indirect-coombs-interpretation-table th, .indirect-coombs-pregnancy-table th { font-weight: bold; text-transform: uppercase; background: #fafafa; }
        .indirect-coombs-interpretation-table td:first-child { width: 18%; }
        .indirect-coombs-interpretation-table ul { margin: 0; padding-left: 15px; }
        .indirect-coombs-pregnancy-table { width: 62%; }
        .indirect-coombs-pregnancy-table td:first-child { width: 36%; }
        .indirect-coombs-report .report-footer { margin-top: 3px; padding-top: 3px; font-size: 10px; }
        .clotting-time-table { margin-bottom: 5px; }
        .clotting-time-table td { font-size: 10px; line-height: 1.1; padding: 3px; }
        .clotting-time-table th { font-size: 10.5px; line-height: 1.08; padding: 3px; }
        .clotting-time-sample-row td { padding-top: 4px !important; padding-bottom: 4px !important; }
        .clotting-time-method { font-size: 8px; line-height: 1; color: #333; font-weight: normal; margin-top: 1px; }
        .clotting-time-status { font-size: 9px; margin-left: 5px; }
        .clotting-time-notes { font-size: 9.5px; line-height: 1.12; margin: 4px 5px 2px; }
        .clotting-time-notes p { margin: 3px 0 6px; }
        .clotting-time-notes ul { margin: 2px 0 3px; padding-left: 18px; }
        .clotting-time-notes li { margin: 0 0 5px; }
        .clotting-time-report .report-footer { margin-top: 3px; padding-top: 3px; font-size: 10px; }
        .bleeding-time-table { margin-bottom: 5px; }
        .bleeding-time-table td { font-size: 10px; line-height: 1.1; padding: 3px; }
        .bleeding-time-table th { font-size: 10.5px; line-height: 1.08; padding: 3px; }
        .bleeding-time-sample-row td { padding-top: 4px !important; padding-bottom: 4px !important; }
        .bleeding-time-method { font-size: 8px; line-height: 1; color: #333; font-weight: normal; margin-top: 1px; }
        .bleeding-time-status { font-size: 9px; margin-left: 5px; }
        .bleeding-time-notes { font-size: 9px; line-height: 1.11; margin: 4px 5px 2px; }
        .bleeding-time-notes p { margin: 3px 0 6px; text-align: justify; }
        .bleeding-time-notes ol { margin: 2px 0 5px; padding-left: 18px; }
        .bleeding-time-notes li { margin: 0 0 3px; }
        .bleeding-time-report .report-footer { margin-top: 3px; padding-top: 3px; font-size: 10px; }
        .coagulation-profile-table { margin-bottom: 4px; }
        .coagulation-profile-table td { font-size: 9.5px; line-height: 1.08; padding: 3px; }
        .coagulation-profile-table th { font-size: 10.5px; line-height: 1.08; padding: 3px; }
        .coagulation-profile-method { font-size: 7.5px; line-height: 1; color: #333; font-weight: normal; margin-top: 1px; }
        .coagulation-profile-status { font-size: 8.5px; margin-left: 4px; }
        .coagulation-profile-notes { font-size: 8.9px; line-height: 1.1; margin: 3px 5px 2px; }
        .coagulation-profile-notes p { margin: 2px 0 4px; text-align: justify; }
        .coagulation-profile-notes ul { margin: 1px 0 3px; padding-left: 17px; }
        .coagulation-profile-notes li { margin: 0 0 1px; }
        .coagulation-therapy-table { width: 100%; border-collapse: collapse; margin: 2px 0 4px; font-size: 8.7px; }
        .coagulation-therapy-table td { border: 1px solid #bbb; padding: 2px 3px; vertical-align: top; }
        .coagulation-therapy-table td:first-child { width: 13%; white-space: nowrap; }
        .coagulation-therapy-table ul { margin: 0; padding-left: 13px; }
        .coagulation-profile-report .report-footer { margin-top: 3px; padding-top: 3px; font-size: 10px; }
        .factor-viii-table, .peripheral-smear-table { margin-bottom: 5px; }
        .factor-viii-table td, .peripheral-smear-table td { font-size: 10px; line-height: 1.1; padding: 3px; }
        .factor-viii-table th, .peripheral-smear-table th { font-size: 10.5px; line-height: 1.08; padding: 3px; }
        .factor-viii-sample-row td { padding-top: 4px !important; padding-bottom: 4px !important; }
        .factor-viii-method, .peripheral-smear-method { font-size: 8px; line-height: 1; color: #333; font-weight: normal; margin-top: 1px; }
        .factor-viii-status { font-size: 9px; margin-left: 5px; }
        .factor-viii-classification-table { border-collapse: collapse; margin: 3px 0 7px; width: 62%; font-size: 9px; }
        .factor-viii-classification-table th, .factor-viii-classification-table td { border: 1px solid #777; padding: 3px 4px; text-align: left; vertical-align: top; }
        .factor-viii-classification-table th { font-weight: bold; text-transform: uppercase; }
        .factor-viii-classification-table thead tr:first-child th { text-transform: none; }
        .factor-viii-classification-table th:not(:first-child), .factor-viii-classification-table td:not(:first-child) { text-align: center; }
        .factor-viii-notes { font-size: 9.5px; line-height: 1.13; margin: 4px 5px 2px; }
        .factor-viii-notes p { margin: 3px 0 4px; text-align: justify; }
        .factor-viii-notes ul { margin: 2px 0 5px; padding-left: 18px; }
        .factor-viii-notes li { margin: 0 0 3px; }
        .peripheral-smear-section td { font-weight: bold; text-transform: uppercase; padding-top: 5px !important; padding-bottom: 4px !important; }
        .factor-viii-report .report-footer, .peripheral-smear-report .report-footer { margin-top: 3px; padding-top: 3px; font-size: 10px; }
        .factor-vii-table { margin-bottom: 5px; }
        .factor-vii-table td { font-size: 10px; line-height: 1.1; padding: 3px; }
        .factor-vii-table th { font-size: 10.5px; line-height: 1.08; padding: 3px; }
        .factor-vii-sample-row td { padding-top: 4px !important; padding-bottom: 4px !important; }
        .factor-vii-method { font-size: 8px; line-height: 1; color: #333; font-weight: normal; margin-top: 1px; }
        .factor-vii-status { font-size: 9px; margin-left: 5px; }
        .factor-vii-notes { font-size: 9.5px; line-height: 1.13; margin: 4px 5px 2px; }
        .factor-vii-notes p { margin: 3px 0 4px; text-align: justify; }
        .factor-vii-notes ul { margin: 2px 0 5px; padding-left: 18px; }
        .factor-vii-notes li { margin: 0 0 3px; }
        .factor-vii-report .report-footer { margin-top: 3px; padding-top: 3px; font-size: 10px; }
        .factor-v-table, .factor-ix-table, .factor-x-table, .factor-xi-table { margin-bottom: 5px; }
        .factor-v-table td, .factor-ix-table td, .factor-x-table td, .factor-xi-table td { font-size: 10px; line-height: 1.1; padding: 3px; }
        .factor-v-table th, .factor-ix-table th, .factor-x-table th, .factor-xi-table th { font-size: 10.5px; line-height: 1.08; padding: 3px; }
        .factor-v-sample-row td, .factor-ix-sample-row td, .factor-x-sample-row td, .factor-xi-sample-row td { padding-top: 4px !important; padding-bottom: 4px !important; }
        .factor-v-method, .factor-ix-method, .factor-x-method, .factor-xi-method { font-size: 8px; line-height: 1; color: #333; font-weight: normal; margin-top: 1px; }
        .factor-v-status, .factor-ix-status, .factor-x-status, .factor-xi-status { font-size: 9px; margin-left: 5px; white-space: nowrap; }
        .factor-v-notes, .factor-ix-notes, .factor-x-notes { font-size: 9.5px; line-height: 1.13; margin: 4px 5px 2px; }
        .factor-v-notes p, .factor-ix-notes p, .factor-x-notes p { margin: 3px 0 4px; text-align: justify; }
        .factor-v-notes ul, .factor-ix-notes ul, .factor-x-notes ul { margin: 2px 0 5px; padding-left: 18px; }
        .factor-v-notes li, .factor-ix-notes li, .factor-x-notes li { margin: 0 0 3px; }
        .factor-v-report .report-footer, .factor-ix-report .report-footer, .factor-x-report .report-footer { margin-top: 3px; padding-top: 3px; font-size: 10px; }
        .factor-xi-notes { font-size: 9.5px; line-height: 1.13; margin: 4px 5px 2px; }
        .factor-xi-notes p { margin: 3px 0 4px; text-align: justify; }
        .factor-xi-notes ul { margin: 2px 0 5px; padding-left: 18px; }
        .factor-xi-notes li { margin: 0 0 3px; }
        .factor-xi-interpretation-table { border-collapse: collapse; width: 58%; margin: 3px 0 6px; font-size: 9px; }
        .factor-xi-interpretation-table th, .factor-xi-interpretation-table td { border: 1px solid #777; padding: 3px 4px; text-align: left; vertical-align: top; }
        .factor-xi-interpretation-table th { font-weight: bold; }
        .factor-xi-report .report-footer { margin-top: 3px; padding-top: 3px; font-size: 10px; }
        .factor-xii-table, .factor-xiii-table { margin-bottom: 5px; }
        .factor-xii-table td, .factor-xiii-table td { font-size: 10px; line-height: 1.1; padding: 3px; }
        .factor-xii-table th, .factor-xiii-table th { font-size: 10.5px; line-height: 1.08; padding: 3px; }
        .factor-xii-sample-row td, .factor-xiii-sample-row td { padding-top: 4px !important; padding-bottom: 4px !important; }
        .factor-xii-method, .factor-xiii-method { font-size: 8px; line-height: 1; color: #333; font-weight: normal; margin-top: 1px; }
        .factor-xii-status { font-size: 9px; margin-left: 5px; }
        .factor-xii-notes, .factor-xiii-notes { font-size: 9.5px; line-height: 1.13; margin: 4px 5px 2px; }
        .factor-xii-notes p, .factor-xiii-notes p { margin: 3px 0 4px; text-align: justify; }
        .factor-xii-notes ul, .factor-xiii-notes ul { margin: 2px 0 5px; padding-left: 18px; }
        .factor-xii-notes li, .factor-xiii-notes li { margin: 0 0 3px; }
        .factor-xii-report .report-footer, .factor-xiii-report .report-footer { margin-top: 3px; padding-top: 3px; font-size: 10px; }
        .rt-pcr-table { margin-bottom: 6px; }
        .rt-pcr-table td, .rt-pcr-table th { font-size: 10px; line-height: 1.15; padding: 4px; }
        .rt-pcr-investigation-row td { padding-top: 6px !important; padding-bottom: 5px !important; }
        .rt-pcr-method { font-size: 8px; font-weight: normal; color: #333; margin-top: 1px; }
        .rt-pcr-notes { font-size: 9.4px; line-height: 1.27; margin: 5px 5px 2px; }
        .rt-pcr-notes .report-note-heading { margin-top: 6px; }
        .rt-pcr-notes ol { margin: 2px 0 7px; padding-left: 19px; }
        .rt-pcr-notes li { margin: 0 0 3px; text-align: justify; }
        .rt-pcr-notes p { margin: 2px 0; text-align: justify; }
        .rt-pcr-report .report-footer { margin-top: 3px; padding-top: 3px; font-size: 10px; }
        .tpmt-table, .cystic-fibrosis-newborn-table { margin-bottom: 5px; }
        .tpmt-table td, .tpmt-table th, .cystic-fibrosis-newborn-table td, .cystic-fibrosis-newborn-table th { font-size: 10px; line-height: 1.1; padding: 3px; }
        .tpmt-investigation-row td { padding-top: 5px !important; padding-bottom: 4px !important; }
        .tpmt-method, .cystic-fibrosis-method { font-size: 8px; line-height: 1; color: #333; font-weight: normal; margin-top: 1px; }
        .tpmt-sample-row td, .cystic-fibrosis-sample-row td { padding-top: 4px !important; padding-bottom: 4px !important; }
        .tpmt-interpretation-table { border-collapse: collapse; width: 54%; margin: 3px 0 6px; font-size: 9px; }
        .tpmt-interpretation-table th, .tpmt-interpretation-table td { border: 1px solid #888; padding: 3px 4px; text-align: left; vertical-align: top; }
        .tpmt-interpretation-table th { font-weight: bold; }
        .tpmt-interpretation-table .tpmt-interpretation-title { text-transform: none; }
        .tpmt-notes, .cystic-fibrosis-newborn-notes { font-size: 9px; line-height: 1.13; margin: 4px 5px 2px; }
        .tpmt-notes ol, .cystic-fibrosis-newborn-notes ol { margin: 2px 0 6px; padding-left: 18px; }
        .tpmt-notes li, .cystic-fibrosis-newborn-notes li { margin: 0 0 2px; }
        .tpmt-notes p, .cystic-fibrosis-newborn-notes p { margin: 3px 0 5px; text-align: justify; }
        .tpmt-report .report-footer, .cystic-fibrosis-newborn-report .report-footer { margin-top: 3px; padding-top: 3px; font-size: 10px; }
        .kft-table, .factor-ii-table { margin-bottom: 5px; }
        .kft-table td, .kft-table th, .factor-ii-table td, .factor-ii-table th { font-size: 10px; line-height: 1.1; padding: 3px; }
        .kft-sample-row td, .factor-ii-sample-row td { padding-top: 4px !important; padding-bottom: 4px !important; }
        .kft-method, .factor-ii-method { font-size: 8px; line-height: 1; color: #333; font-weight: normal; margin-top: 1px; }
        .kft-status, .factor-ii-status { font-size: 9px; font-weight: bold; margin-left: 5px; }
        .kft-advice, .factor-ii-notes { font-size: 9.5px; line-height: 1.14; margin: 5px 5px 2px; }
        .kft-advice p, .factor-ii-notes p { margin: 3px 0 4px; text-align: justify; }
        .factor-ii-notes ul { margin: 2px 0 5px; padding-left: 18px; }
        .factor-ii-notes li { margin: 0 0 3px; }
        .karyotype-notes { font-size: 10px; line-height: 1.25; margin: 5px 5px 2px; }
        .karyotype-notes .report-note-heading { margin-top: 10px; }
        .karyotype-notes p { margin: 3px 0 7px; text-align: justify; }
        .karyotype-notes > ul { margin: 3px 0 5px; padding-left: 18px; }
        .karyotype-notes > ul li { margin: 0 0 3px; }
        .karyotype-result { border: 1px solid #bbb; margin: 7px 0; padding: 4px 6px; }
        .karyotype-comparison-table { width: 100%; border-collapse: collapse; margin: 9px 0 8px; font-size: 9.5px; }
        .karyotype-comparison-table th, .karyotype-comparison-table td { border: 1px solid #999; padding: 4px 5px; text-align: left; vertical-align: top; }
        .karyotype-comparison-table thead th { text-align: center; font-size: 11px; }
        .karyotype-comparison-table tbody th { width: 13%; vertical-align: middle; text-align: center; }
        .karyotype-comparison-table ul { margin: 0; padding-left: 16px; }
        .karyotype-comparison-table li { margin: 0 0 2px; }
        .kft-report .report-footer, .factor-ii-report .report-footer, .karyotype-report .report-footer { margin-top: 3px; padding-top: 3px; font-size: 10px; }
        .lipid-profile-table, .lft-table, .hba1c-table { margin-bottom: 5px; }
        .lipid-profile-table td, .lipid-profile-table th, .lft-table td, .lft-table th, .hba1c-table td, .hba1c-table th { font-size: 9.5px; line-height: 1.08; padding: 3px; }
        .lipid-sample-row td, .lft-sample-row td, .hba1c-sample-row td { padding-top: 4px !important; padding-bottom: 4px !important; }
        .lipid-method, .lft-method, .hba1c-method { font-size: 7.8px; line-height: 1; color: #333; font-weight: normal; margin-top: 1px; }
        .lipid-status, .lft-status, .hba1c-status { font-size: 8.8px; font-weight: bold; margin-left: 5px; white-space: nowrap; }
        .lipid-recommendation-table { border-collapse: collapse; width: 57%; margin: 7px 0 7px; font-size: 8.4px; }
        .lipid-recommendation-table th, .lipid-recommendation-table td { border: 1px solid #999; padding: 3px 4px; text-align: left; vertical-align: middle; }
        .lipid-recommendation-table th { font-weight: bold; }
        .lipid-notes { font-size: 8.6px; line-height: 1.14; margin: 4px 5px 2px; }
        .lipid-notes ol { margin: 2px 0 4px; padding-left: 18px; }
        .lipid-notes li { margin: 0 0 2px; text-align: justify; }
        .lft-notes { font-size: 8.4px; line-height: 1.13; margin: 4px 5px 2px; }
        .lft-notes ol { margin: 2px 0 3px; padding-left: 18px; }
        .lft-notes li { margin: 0 0 2px; text-align: justify; }
        .hba1c-interpretation-heading { font-size: 10px; font-weight: bold; margin: 5px 0 3px; }
        .hba1c-interpretation-table { border-collapse: collapse; width: 97%; margin: 0 0 6px; font-size: 9px; }
        .hba1c-interpretation-table th, .hba1c-interpretation-table td { border: 1px solid #999; padding: 3px 4px; text-align: left; vertical-align: middle; }
        .hba1c-interpretation-table .hba1c-interpretation-title { text-align: center; font-size: 10px; }
        .hba1c-interpretation-table tbody td:first-child { width: 34%; }
        .hba1c-notes { font-size: 8.6px; line-height: 1.14; margin: 4px 5px 2px; }
        .hba1c-notes ol { margin: 2px 0 3px; padding-left: 18px; }
        .hba1c-notes li { margin: 0 0 2px; text-align: justify; }
        .lipid-profile-report .report-footer, .lft-report .report-footer, .hba1c-report .report-footer { margin-top: 3px; padding-top: 3px; font-size: 10px; }
        .single-analyte-table { margin-bottom: 7px; }
        .single-analyte-table td, .single-analyte-table th { font-size: 10px; line-height: 1.12; padding: 4px; }
        .single-analyte-sample-row td { padding-top: 5px !important; padding-bottom: 5px !important; }
        .single-analyte-method { font-size: 8px; line-height: 1; color: #333; font-weight: normal; margin-top: 2px; }
        .single-analyte-status { font-size: 9px; font-weight: bold; margin-left: 5px; white-space: nowrap; }
        .single-analyte-heading { font-size: 11px; font-weight: bold; margin: 5px 0 4px; }
        .single-analyte-notes { font-size: 10px; line-height: 1.25; margin: 6px 5px 2px; }
        .single-analyte-notes .report-note-heading { margin-top: 7px; }
        .single-analyte-notes p { margin: 3px 0 7px; text-align: justify; }
        .single-analyte-notes ul, .single-analyte-notes ol { margin: 3px 0 6px; padding-left: 18px; }
        .single-analyte-notes li { margin: 0 0 3px; text-align: justify; }
        .micro-investigation { margin: 8px 5px 7px; font-size: 11px; }
        .micro-investigation strong { font-size: 12px; }
        .micro-specimen { margin: 7px 5px; font-size: 11px; }
        .micro-exam-table { width: 65%; border-collapse: collapse; margin: 7px 5px 8px; font-size: 11px; }
        .micro-exam-table th, .micro-exam-table td { border: 1px solid #aaa; padding: 5px; text-align: left; vertical-align: top; }
        .micro-exam-table th { font-size: 10px; text-transform: uppercase; }
        .koh-table th:first-child { width: 56%; }
        .koh-table th:nth-child(2) { width: 23%; }
        .afb-table { width: 53%; }
        .afb-table th:first-child { width: 28%; }
        .micro-note { margin: 5px; font-size: 11px; }
        .gbs-table { margin-bottom: 4px; }
        .gbs-table td { font-size: 11px; }
        .culture-notes { margin-top: 4px; }
        .culture-notes .report-note-heading { margin-top: 0; }
        .mycobacterium-results-table { margin-bottom: 5px; }
        .mycobacterium-interpretation-table { width: 86%; border-collapse: collapse; margin: 5px 5px 7px; font-size: 9px; }
        .mycobacterium-interpretation-table th, .mycobacterium-interpretation-table td { border: 1px solid #999; padding: 4px; vertical-align: top; text-align: left; }
        .mycobacterium-interpretation-table th { text-transform: uppercase; }
        .mycobacterium-interpretation-table th:first-child, .mycobacterium-interpretation-table td:first-child { width: 39%; }
        .mycobacterium-notes { font-size: 9px; line-height: 1.22; }
        .ova-parasite-results-table { margin-bottom: 5px; }
        .ova-parasite-results-table td { padding-top: 3px; padding-bottom: 3px; }
        .ova-parasite-notes { margin-top: 4px; }
        .prenatal-marker-table { margin-bottom: 6px; }
        .prenatal-marker-table td, .prenatal-marker-table th { font-size: 10px; line-height: 1.12; padding: 4px; }
        .prenatal-marker-section td { font-weight: bold; text-transform: uppercase; padding-top: 6px !important; }
        .prenatal-marker-notes { font-size: 9.5px; line-height: 1.2; }
        .galectin-age-table, .tumor-marker-reference-table, .troponin-interpretation-table, .her2-detail-table, .her2-calculation-table { border-collapse: collapse; margin: 4px 5px 7px; font-size: 9px; }
        .galectin-age-table { width: 42%; }
        .tumor-marker-reference-table { width: 70%; }
        .troponin-interpretation-table { width: 100%; }
        .her2-detail-table { width: 100%; font-size: 10px; }
        .her2-calculation-table { width: 49%; font-size: 9px; }
        .galectin-age-table th, .galectin-age-table td, .tumor-marker-reference-table th, .tumor-marker-reference-table td, .troponin-interpretation-table th, .troponin-interpretation-table td, .her2-detail-table th, .her2-detail-table td, .her2-calculation-table th, .her2-calculation-table td { border: 1px solid #999; padding: 3px 4px; text-align: left; vertical-align: middle; }
        .galectin-age-table th, .tumor-marker-reference-table th, .troponin-interpretation-table th { font-weight: bold; text-transform: uppercase; }
        .infectious-interpretation-table { border-collapse: collapse; margin: 4px 5px 7px; width: 96%; font-size: 9px; }
        .infectious-interpretation-table th, .infectious-interpretation-table td { border: 1px solid #999; padding: 3px 4px; text-align: left; vertical-align: middle; }
        .infectious-interpretation-table th { font-weight: bold; text-transform: uppercase; }
        .anti-hbc-igm-interpretation-table { width: 66%; }
        .anti-hbc-igm-interpretation-table th:first-child, .anti-hbc-igm-interpretation-table td:first-child { width: 30%; }
        .hepatitis-b-profile-table td { padding-top: 7px; padding-bottom: 7px; }
        .hepatitis-b-profile-interpretation-table { width: 94%; }
        .hepatitis-b-profile-interpretation-table th, .hepatitis-b-profile-interpretation-table td { text-transform: none; text-align: center; }
        .hepatitis-b-profile-interpretation-table th:first-child, .hepatitis-b-profile-interpretation-table td:first-child { width: 33%; text-align: left; }
        .hbv-profile-marker { font-weight: bold; }
        .mantoux-result-table { width: 74%; margin-top: 18px; margin-bottom: 28px; }
        .mantoux-result-table th { width: 35%; text-transform: none; }
        .mantoux-result-table th, .mantoux-result-table td { font-size: 11px; padding: 8px 4px; }
        .mantoux-interpretation-table { width: 92%; margin-top: 14px; }
        .mantoux-interpretation-table th:first-child, .mantoux-interpretation-table td:first-child { width: 18%; }
        .hiv-screening-table { width: 94%; margin-top: 8px; }
        .hiv-screening-table th, .hiv-screening-table td { font-size: 10px; text-transform: none; }
        .hiv-screening-table ul { margin: 1px 0; padding-left: 18px; }
        .hiv-screening-table li { margin: 3px 0; }
        .hiv-method-values { width: 100%; border-collapse: collapse; margin-top: 4px; }
        .hiv-method-values td { border: 0; padding: 2px 0; text-align: left; }
        .hiv-method-values td:first-child { width: 40%; }
        .her2-detail-table th { width: 24%; }
        .her2-heading { font-size: 14px; font-weight: bold; text-align: center; margin: 4px 0 8px; line-height: 1.25; }
        .prenatal-marker-notes, .pax8-notes, .galectin3-notes, .her2-notes, .dcp-notes, .afp-tumor-notes, .ca-marker-notes, .troponin-notes { font-size: 9px; line-height: 1.18; }
        .prenatal-marker-notes p, .pax8-notes p, .galectin3-notes p, .her2-notes p, .dcp-notes p, .afp-tumor-notes p, .ca-marker-notes p, .troponin-notes p { margin: 3px 0 5px; text-align: justify; }
        .infectious-notes { font-size: 9px; line-height: 1.18; }
        .infectious-notes p { margin: 3px 0 5px; text-align: justify; }
        .infectious-notes ul, .infectious-notes ol { margin: 2px 0 5px 17px; padding: 0; }
        .infectious-notes li { margin: 1px 0; }
        .prenatal-marker-notes ul, .prenatal-marker-notes ol, .pax8-notes ul, .pax8-notes ol, .galectin3-notes ul, .galectin3-notes ol, .her2-notes ul, .her2-notes ol, .dcp-notes ul, .dcp-notes ol, .afp-tumor-notes ul, .afp-tumor-notes ol, .ca-marker-notes ul, .ca-marker-notes ol, .troponin-notes ul, .troponin-notes ol { margin: 2px 0 5px; padding-left: 18px; }
        .prenatal-marker-notes li, .pax8-notes li, .galectin3-notes li, .her2-notes li, .dcp-notes li, .afp-tumor-notes li, .ca-marker-notes li, .troponin-notes li { margin: 0 0 2px; text-align: justify; }
        .fasting-glucose-interpretation-table, .bnp-interpretation-table, .digoxin-interpretation-table, .beta2-microglobulin-staging-table { border-collapse: collapse; margin: 4px 0 7px; font-size: 9px; }
        .fasting-glucose-interpretation-table { width: 43%; }
        .bnp-interpretation-table { width: 51%; }
        .digoxin-interpretation-table { width: 54%; }
        .beta2-microglobulin-staging-table { width: 47%; }
        .fasting-glucose-interpretation-table th, .fasting-glucose-interpretation-table td, .bnp-interpretation-table th, .bnp-interpretation-table td, .digoxin-interpretation-table th, .digoxin-interpretation-table td, .beta2-microglobulin-staging-table th, .beta2-microglobulin-staging-table td { border: 1px solid #888; padding: 3px 4px; text-align: left; vertical-align: middle; }
        .fasting-glucose-interpretation-table th, .bnp-interpretation-table th, .digoxin-interpretation-table th, .beta2-microglobulin-staging-table th { font-weight: bold; text-transform: uppercase; }
        .bnp-interpretation-table td, .bnp-interpretation-table th { text-align: center; }
        .gram-bv-table, .upcr-table { margin-bottom: 6px; }
        .gram-bv-table td, .gram-bv-table th, .upcr-table td, .upcr-table th { font-size: 10px; line-height: 1.18; padding: 4px; }
        .gram-bv-investigation-row td, .upcr-section td { font-weight: bold; padding-top: 5px !important; padding-bottom: 4px !important; }
        .upcr-meta-row td { padding-top: 3px !important; padding-bottom: 3px !important; }
        .nugent-score-table, .upcr-interpretation-table { border-collapse: collapse; margin: 4px 0 7px; font-size: 9px; }
        .nugent-score-table { width: 54%; }
        .upcr-interpretation-table { width: 60%; }
        .nugent-score-table th, .nugent-score-table td, .upcr-interpretation-table th, .upcr-interpretation-table td { border: 1px solid #888; padding: 3px 4px; text-align: left; vertical-align: middle; }
        .nugent-score-table th, .upcr-interpretation-table th { font-weight: bold; text-transform: uppercase; }
        .gram-bv-notes, .upcr-notes, .prealbumin-notes, .haptoglobin-notes, .aldolase-notes, .ppbs-notes { font-size: 9px; line-height: 1.16; }
        .gram-bv-notes p, .upcr-notes p, .prealbumin-notes p, .haptoglobin-notes p, .aldolase-notes p, .ppbs-notes p { margin: 2px 0 5px; }
        .gram-bv-notes ul, .upcr-notes ul, .prealbumin-notes ul, .haptoglobin-notes ul, .aldolase-notes ul, .ppbs-notes ul { margin: 2px 0 5px; }
        .gram-bv-report .report-footer, .upcr-report .report-footer, .prealbumin-report .report-footer, .haptoglobin-report .report-footer, .aldolase-report .report-footer, .ppbs-report .report-footer { margin-top: 3px; padding-top: 3px; font-size: 10px; }
        .acr-table { margin-bottom: 6px; }
        .acr-meta-row td { padding-top: 3px !important; padding-bottom: 3px !important; }
        .acr-section td { font-weight: bold; padding-top: 5px !important; padding-bottom: 4px !important; }
        .acr-ratio-row td { font-weight: bold; border-top: 1.5px solid #000; }
        .acr-category-row td { padding-top: 5px !important; padding-bottom: 5px !important; }
        .acr-interpretation-table { width: 76%; border-collapse: collapse; margin: 4px 0 7px; font-size: 10px; }
        .acr-interpretation-table th, .acr-interpretation-table td { border: 1px solid #888; padding: 4px 5px; text-align: left; vertical-align: middle; }
        .acr-interpretation-table th { font-weight: bold; text-transform: uppercase; }
        .acr-notes { font-size: 10px; line-height: 1.25; margin-top: 5px; }
        .acr-notes p { margin: 3px 0 5px; text-align: justify; }
        .acr-report .report-footer { margin-top: 3px; padding-top: 3px; font-size: 10px; }
        .tacrolimus-table { margin-bottom: 6px; }
        .tacrolimus-interpretation-table { border-collapse: collapse; width: 90%; margin: 4px 0 7px; font-size: 8px; }
        .tacrolimus-interpretation-table th, .tacrolimus-interpretation-table td { border: 1px solid #777; padding: 3px 4px; text-align: center; vertical-align: middle; }
        .tacrolimus-interpretation-table thead th { font-weight: bold; text-transform: uppercase; }
        .tacrolimus-interpretation-table th:first-child { width: 17%; }
        .tacrolimus-notes { font-size: 8.6px; line-height: 1.14; margin-top: 4px; }
        .tacrolimus-notes p { margin: 2px 0 4px; }
        .tacrolimus-notes ul { margin: 2px 0 4px; padding-left: 18px; }
        .tacrolimus-notes li { margin: 0 0 2px; text-align: justify; }
        .tacrolimus-report .report-footer { margin-top: 3px; padding-top: 3px; font-size: 10px; }
        .vitamin-d-interpretation-table { border-collapse: collapse; width: 97%; margin: 0 0 6px; font-size: 9px; }
        .vitamin-d-interpretation-table th, .vitamin-d-interpretation-table td { border: 1px solid #999; padding: 3px 4px; text-align: left; vertical-align: middle; }
        .vitamin-d-interpretation-table th { text-transform: uppercase; }
        .vitamin-d-interpretation-table th:first-child { width: 14%; }
        .vitamin-d-interpretation-table th:nth-child(2) { width: 20%; }
        .vitamin-d-notes { font-size: 8.6px; line-height: 1.16; }
        .vitamin-d-notes .report-note-heading { margin-top: 4px; }
        .vitamin-d-notes p { margin: 2px 0 4px; }
        .vitamin-d-notes ul { margin: 1px 0 3px; }
        .vitamin-c-notes, .vitamin-b12-notes, .glucose-notes { max-width: 97%; }
        .vitamin-c-report .report-footer, .vitamin-b12-report .report-footer, .rbs-report .report-footer, .fbs-report .report-footer, .vitamin-d-report .report-footer { margin-top: 3px; padding-top: 3px; font-size: 10px; }
        .vitamin-e-table, .vitamin-b9-table { margin-bottom: 6px; }
        .vitamin-e-table td, .vitamin-e-table th, .vitamin-b9-table td, .vitamin-b9-table th { font-size: 10px; line-height: 1.1; padding: 3px; }
        .vitamin-e-sample-row td { padding-top: 4px !important; padding-bottom: 4px !important; }
        .vitamin-e-reference-table, .vitamin-e-interpretation-table, .vitamin-k-interpretation-table { border-collapse: collapse; width: 46%; margin: 5px 0 6px; font-size: 9px; }
        .vitamin-e-reference-table th, .vitamin-e-reference-table td, .vitamin-e-interpretation-table th, .vitamin-e-interpretation-table td, .vitamin-k-interpretation-table th, .vitamin-k-interpretation-table td { border: 1px solid #777; padding: 3px 4px; text-align: left; vertical-align: middle; }
        .vitamin-e-reference-table th, .vitamin-e-interpretation-table th, .vitamin-k-interpretation-table th { text-transform: uppercase; }
        .vitamin-e-notes, .vitamin-b9-notes { font-size: 9px; line-height: 1.16; }
        .vitamin-e-notes p, .vitamin-b9-notes p { margin: 2px 0 5px; }
        .vitamin-e-notes ol, .vitamin-b9-notes ol { margin: 2px 0 5px; }
        .vitamin-b9-section td { font-size: 10px; font-weight: bold; padding-top: 4px !important; padding-bottom: 2px !important; }
        .vitamin-k-interpretation-table { width: 46%; margin-top: 0; }
        .vitamin-e-report .report-footer, .vitamin-b9-report .report-footer, .vitamin-k-report .report-footer, .ldl-cholesterol-report .report-footer, .hdl-cholesterol-report .report-footer, .indirect-bilirubin-report .report-footer, .calcium-report .report-footer, .ferritin-report .report-footer, .c-peptide-report .report-footer, .vldl-cholesterol-report .report-footer { margin-top: 3px; padding-top: 3px; font-size: 10px; }
        .single-cholesterol-table { margin-bottom: 5px; }
        .single-cholesterol-recommendation-table { width: 92%; margin: 5px 0 5px; font-size: 8.8px; }
        .single-cholesterol-notes { font-size: 9px; line-height: 1.16; margin-top: 3px; }
        .single-cholesterol-notes p { margin-bottom: 4px; }
        .indirect-bilirubin-table { margin-bottom: 5px; }
        .calcium-notes, .ferritin-notes, .c-peptide-notes { font-size: 9px; line-height: 1.16; margin-top: 4px; }
        .calcium-notes p, .ferritin-notes p, .c-peptide-notes p { margin: 2px 0 5px; }
        .calcium-notes ul, .ferritin-notes ul, .c-peptide-notes ul { margin: 2px 0 5px; }
        .cmp-table, .electrolytes-table { margin-bottom: 5px; }
        .cmp-table td, .cmp-table th, .electrolytes-table td, .electrolytes-table th { font-size: 9.5px; line-height: 1.08; padding: 3px; }
        .cmp-sample-row td, .electrolyte-meta-row td { padding-top: 4px !important; padding-bottom: 4px !important; }
        .cmp-method { font-size: 7.8px; line-height: 1; color: #333; font-weight: normal; margin-top: 1px; }
        .cmp-status, .electrolyte-status { font-size: 8.8px; font-weight: bold; margin-left: 5px; white-space: nowrap; }
        .electrolyte-section td { font-weight: bold; padding-top: 4px !important; padding-bottom: 2px !important; }
        .electrolyte-notes, .potassium-notes { font-size: 9px; line-height: 1.16; margin: 4px 5px 2px; }
        .electrolyte-notes p, .potassium-notes p { margin: 2px 0 5px; text-align: justify; }
        .electrolyte-notes ul, .potassium-notes ul { margin: 2px 0 5px; padding-left: 18px; }
        .electrolyte-notes li, .potassium-notes li { margin: 0 0 2px; text-align: justify; }
        .cmp-report .report-footer, .electrolytes-report .report-footer, .potassium-report .report-footer { margin-top: 3px; padding-top: 3px; font-size: 10px; }
        .ast-sgot-notes, .globulin-notes, .albumin-notes, .bun-notes, .iron-notes, .lactic-acid-notes, .magnesium-notes, .lipase-notes, .amylase-notes, .ggt-notes { font-size: 9px; line-height: 1.16; margin-top: 4px; }
        .ast-sgot-notes p, .globulin-notes p, .albumin-notes p, .bun-notes p, .iron-notes p, .lactic-acid-notes p, .magnesium-notes p, .lipase-notes p, .amylase-notes p, .ggt-notes p { margin: 2px 0 5px; text-align: justify; }
        .ast-sgot-notes ul, .globulin-notes ul, .albumin-notes ul, .bun-notes ul, .iron-notes ul, .lactic-acid-notes ul, .magnesium-notes ul, .lipase-notes ul, .amylase-notes ul, .ggt-notes ul { margin: 2px 0 5px; padding-left: 18px; }
        .ast-sgot-notes li, .globulin-notes li, .albumin-notes li, .bun-notes li, .iron-notes li, .lactic-acid-notes li, .magnesium-notes li, .lipase-notes li, .amylase-notes li, .ggt-notes li { margin: 0 0 2px; text-align: justify; }
        .lactic-acid-notes ol { margin: 2px 0 5px; padding-left: 18px; }
        .lactic-acid-causes-table { width: 95%; border-collapse: collapse; margin: 4px 0 5px; font-size: 8.5px; }
        .lactic-acid-causes-table th, .lactic-acid-causes-table td { border: 1px solid #888; padding: 3px 4px; text-align: left; vertical-align: middle; }
        .lactic-acid-causes-table th { font-weight: bold; text-transform: uppercase; }
        .ggt-reference-table { width: 32%; border-collapse: collapse; margin: 4px 0 5px; font-size: 9px; }
        .ggt-reference-table th, .ggt-reference-table td { border: 1px solid #888; padding: 3px 4px; text-align: left; vertical-align: middle; }
        .ggt-reference-table th { font-weight: bold; text-transform: uppercase; }
        .ionized-calcium-test-name { margin-top: 4px; font-weight: bold; }
        .drug-monitoring-meta-row td { padding-top: 4px !important; padding-bottom: 4px !important; }
        .phenobarbital-interpretation-table { width: 49%; border-collapse: collapse; margin: 3px 0 5px; font-size: 9px; }
        .phenobarbital-interpretation-table th, .phenobarbital-interpretation-table td { border: 1px solid #888; padding: 3px 4px; text-align: left; vertical-align: middle; }
        .phenobarbital-interpretation-table th { font-weight: bold; text-transform: none; }
        .flecainide-notes, .phenobarbital-notes, .ketone-body-notes, .tibc-notes, .serum-osmolality-notes, .manganese-blood-notes { font-size: 9px; line-height: 1.16; margin-top: 4px; }
        .flecainide-notes p, .phenobarbital-notes p, .ketone-body-notes p, .tibc-notes p, .serum-osmolality-notes p, .manganese-blood-notes p { margin: 2px 0 5px; text-align: justify; }
        .flecainide-notes ul, .flecainide-notes ol, .phenobarbital-notes ol, .ketone-body-notes ul, .tibc-notes ul, .serum-osmolality-notes ul, .serum-osmolality-notes ol, .manganese-blood-notes ul, .manganese-blood-notes ol { margin: 2px 0 5px; padding-left: 18px; }
        .flecainide-notes li, .phenobarbital-notes li, .ketone-body-notes li, .tibc-notes li, .serum-osmolality-notes li, .manganese-blood-notes li { margin: 0 0 2px; text-align: justify; }
        .flecainide-interpretation-list > li { margin-bottom: 3px; }
        .creatinine-24-hour-urine-table { margin-bottom: 5px; }
        .creatinine-24-hour-urine-table td, .creatinine-24-hour-urine-table th { font-size: 10px; line-height: 1.12; padding: 4px; }
        .creatinine-24-hour-urine-section td { padding-top: 5px !important; padding-bottom: 4px !important; }
        .arterial-blood-gas-table { margin-bottom: 5px; }
        .arterial-blood-gas-table th, .arterial-blood-gas-table td { font-size: 9.5px; line-height: 1.1; padding: 3px 4px; }
        .arterial-blood-gas-section td { padding-top: 5px !important; padding-bottom: 4px !important; }
        .manganese-blood-table, .selenium-serum-table { margin-bottom: 4px; }
        .selenium-serum-notes { font-size: 7.8px; line-height: 1.12; margin-top: 3px; }
        .selenium-serum-notes p { margin: 2px 0 4px; text-align: justify; }
        .selenium-serum-notes ol, .selenium-serum-notes ul { margin: 1px 0 3px; padding-left: 16px; }
        .selenium-serum-notes li { margin: 0 0 1px; text-align: justify; }
        .selenium-serum-notes .report-note-heading { margin-top: 3px; }
        .ast-sgot-report .report-footer, .globulin-report .report-footer, .albumin-report .report-footer, .bun-report .report-footer, .sodium-report .report-footer, .iron-report .report-footer, .lactic-acid-report .report-footer, .magnesium-report .report-footer, .flecainide-report .report-footer, .phenobarbital-report .report-footer, .ketone-body-report .report-footer, .uric-acid-report .report-footer, .tibc-report .report-footer, .serum-osmolality-report .report-footer, .creatinine-24-hour-urine-report .report-footer, .arterial-blood-gas-report .report-footer, .manganese-blood-report .report-footer, .selenium-serum-report .report-footer { margin-top: 3px; padding-top: 3px; font-size: 10px; }
        .sickle-cell-mutation-table { margin-bottom: 4px; }
        .sickle-cell-mutation-table td { font-size: 9.5px; line-height: 1.08; padding: 3px; }
        .sickle-cell-mutation-table th { font-size: 10.5px; line-height: 1.08; padding: 3px; }
        .sickle-cell-mutation-sample-row td { padding-top: 4px !important; padding-bottom: 4px !important; }
        .sickle-cell-mutation-method { font-size: 8px; line-height: 1; color: #333; font-weight: normal; margin-top: 1px; }
        .sickle-cell-mutation-status { font-size: 9px; font-weight: bold; }
        .sickle-cell-interpretation-table { border-collapse: collapse; width: 72%; margin: 3px 0 6px; font-size: 9px; }
        .sickle-cell-interpretation-table th, .sickle-cell-interpretation-table td { border: 1px solid #888; padding: 3px 4px; text-align: left; vertical-align: top; }
        .sickle-cell-interpretation-table th { font-weight: bold; text-transform: uppercase; }
        .sickle-cell-interpretation-table .sickle-cell-interpretation-title { text-transform: none; }
        .sickle-cell-mutation-notes { font-size: 9px; line-height: 1.11; margin: 3px 5px 2px; }
        .sickle-cell-mutation-notes ol { margin: 1px 0 4px; padding-left: 17px; }
        .sickle-cell-mutation-notes li { margin: 0 0 2px; }
        .sickle-cell-mutation-notes p { margin: 2px 0; text-align: justify; }
        .sickle-cell-mutation-report .report-footer { margin-top: 3px; padding-top: 3px; font-size: 10px; }

        /* Keep the actual reported values legible.  This deliberately applies
           only to result tables, not to the clinical notes and descriptions. */
        table.results-table > thead > tr > th,
        table.results-table > tbody > tr > td {
          font-size: 14px !important;
          line-height: 1.2 !important;
        }

        @media print {
          /* Chromium clips page-margin content, including fixed letterhead
             artwork. Keep the page edge-to-edge and reserve the header/footer
             within the report content instead. */
          html, body { width: auto; height: auto; min-height: 0; }
          .main-content {
            display: block;
            min-height: 297mm;
            padding: ${reportHeaderSpaceMm}mm 10mm ${reportFooterSpaceMm}mm;
            box-sizing: border-box;
            -webkit-box-decoration-break: clone;
            box-decoration-break: clone;
          }
          .letterhead-background {
            top: 0;
            left: 0;
          }
          .report-print-controls, .report-view-controls { display: none !important; }
          body.report-read-only .letterhead-background,
          body.report-read-only .main-content { display: none !important; }
          body.report-read-only .view-only-print-notice {
            display: block !important;
            margin: 30mm 20mm;
            color: #111827;
            font-family: Aptos, "Segoe UI", Calibri, Arial, sans-serif;
            font-size: 15px;
            line-height: 1.45;
          }
          .cbc-report { height: calc(297mm - ${reportHeaderSpaceMm}mm - ${reportFooterSpaceMm}mm); box-sizing: border-box; }
        }
        
        .group-header { font-weight: bold; padding-top: 6px !important; padding-bottom: 1px !important; font-size: 15px; text-transform: uppercase; }
        .method-note { font-size: 10px; color: #333; font-weight: normal; margin-bottom: 3px; }
        
        .report-notes { font-size: 11px; margin-top: 8px; }
        .notes-table { width: 100%; border-collapse: collapse; margin-top: 4px; border: 1px solid #ccc; }
        .notes-table th { border: 1px solid #ccc; padding: 3px; text-align: left; background-color: #f9f9f9; font-weight: bold; font-size: 11px; }
        .notes-table td { border: 1px solid #ccc; padding: 3px; text-align: left; vertical-align: top; font-size: 11px; }
        
        .report-footer {
          margin-top: 8px;
          border-top: 1px solid #000;
          display: flex;
          justify-content: space-between;
          font-size: 11px;
          padding-top: 4px;
        }

        .signature-wrapper {
          margin-top: auto;
          padding-top: 5px;
          display: flex;
          justify-content: flex-end;
        }
        .legacy-signature { display: none; }
        .signature-section {
          text-align: center;
          width: 180px;
        }
        .sig-image { 
          width: 100px; 
          height: auto; 
          display: block; 
          margin: 0 auto 2px auto;
        }
        .doc-name { font-weight: bold; font-size: 13px; margin: 0; color: #1a237e; }
        .doc-detail { font-size: 11px; margin: 0; color: #1a237e; line-height: 1.1; }

        .custom-report-body {
          margin: 14px 0 8px;
          padding: 10px 12px;
          border: 1px solid #c9d5d1;
          border-left: 4px solid #0f766e;
          background: #fbfefd;
          font-size: 11px;
          line-height: 1.45;
          page-break-inside: avoid;
        }
        .custom-report-body-title {
          margin-bottom: 6px;
          color: #0f4f48;
          font-size: 12px;
          font-weight: bold;
          text-transform: uppercase;
        }
        .custom-report-body p { margin: 0 0 7px; }
        .custom-report-body p:last-child { margin-bottom: 0; }
 
        tr { page-break-inside: avoid; }
      </style>
    </head>
    <body class="${readOnlyView ? "report-read-only" : ""}">
      ${letterheadDataUrl ? `<img class="letterhead-background" src="${letterheadDataUrl}" alt="" />` : ""}
      ${showPrintControls ? `
        <div class="report-print-controls" data-report-print-endpoint="${escapeHtml(reportPrintEndpoint)}">
          <span>Quick print</span>
          <button type="button" data-print-style="letterhead">Print with letterhead</button>
          <button type="button" data-print-style="plain">Print without letterhead</button>
        </div>
      ` : ""}
      ${reportActionControls}
      ${readOnlyView ? `<div class="view-only-print-notice">Printing is disabled while viewing a report. Please return to Lab LMS and use the Print Report button.</div>` : ""}
      <div class="main-content${rtPcrTest ? " rt-pcr-report" : tpmtTest ? " tpmt-report" : cysticFibrosisNewbornTest ? " cystic-fibrosis-newborn-report" : kftTest ? " kft-report" : factorIiTest ? " factor-ii-report" : karyotypeTest ? " karyotype-report" : lipidProfileTest ? " lipid-profile-report" : lftTest ? " lft-report" : hba1cTest ? " hba1c-report" : vitaminDTest ? " vitamin-d-report" : vitaminCTest ? " vitamin-c-report" : vitaminB12Test ? " vitamin-b12-report" : randomBloodSugarTest ? " rbs-report" : fastingBloodSugarTest ? " fbs-report" : bTypeNatriureticPeptideTest ? " bnp-report" : creatineKinaseTest ? " creatine-kinase-report" : beta2MicroglobulinTest ? " beta2-microglobulin-report" : altSgptTest ? " alt-sgpt-report" : dnphTest ? " dnph-report" : prealbuminTest ? " prealbumin-report" : haptoglobinTest ? " haptoglobin-report" : gramStainBacterialVaginosisTest ? " gram-bv-report" : aldolaseTest ? " aldolase-report" : urineProteinCreatinineRatioTest ? " upcr-report" : albuminCreatinineRatioTest ? " acr-report" : postPrandialBloodSugarTest ? " ppbs-report" : tacrolimusTest ? " tacrolimus-report" : phosphorusTest ? " phosphorus-report" : alkalinePhosphataseTest ? " alkaline-phosphatase-report" : clotRetractionTest ? " clot-retraction-report" : vitaminETest ? " vitamin-e-report" : vitaminB9Test ? " vitamin-b9-report" : vitaminKTest ? " vitamin-k-report" : ldlCholesterolTest ? " ldl-cholesterol-report" : hdlCholesterolTest ? " hdl-cholesterol-report" : indirectBilirubinTest ? " indirect-bilirubin-report" : calciumTest ? " calcium-report" : ferritinTest ? " ferritin-report" : cPeptideTest ? " c-peptide-report" : vldlCholesterolTest ? " vldl-cholesterol-report" : comprehensiveMetabolicPanelTest ? " cmp-report" : electrolyteProfileTest ? " electrolytes-report" : potassiumTest ? " potassium-report" : astSgotTest ? " ast-sgot-report" : globulinTest ? " globulin-report" : albuminTest ? " albumin-report" : digoxinTest ? " digoxin-report" : bunTest ? " bun-report" : cbcTest ? " cbc-report" : bloodGroupTest ? " blood-group-report" : dDimerTest ? " d-dimer-report" : sickleCellMutationTest ? " sickle-cell-mutation-report" : rbcTest ? " rbc-report" : plateletTest ? " platelet-report" : tlcTest ? " tlc-report" : absoluteCountTest ? " absolute-count-report" : mchcTest ? " mchc-report" : mchTest ? " mch-report" : mcvTest ? " mcv-report" : mpvTest ? " mpv-report" : hctPcvTest ? " hct-pcv-report" : esrTest ? " esr-report" : pdwTest ? " pdw-report" : hemoglobinTest ? " hemoglobin-report" : ptTest ? " pt-report" : apttTest ? " aptt-report" : dlcTest ? " dlc-report" : indirectCoombsTest ? " indirect-coombs-report" : directCoombsTest ? " direct-coombs-report" : fibrinogenTest ? " fibrinogen-report" : reticulocyteTest ? " reticulocyte-report" : clottingTimeTest ? " clotting-time-report" : bleedingTimeTest ? " bleeding-time-report" : coagulationProfileTest ? " coagulation-profile-report" : factorVTest ? " factor-v-report" : factorViiTest ? " factor-vii-report" : factorIxTest ? " factor-ix-report" : factorXTest ? " factor-x-report" : factorXiTest ? " factor-xi-report" : factorViiiTest ? " factor-viii-report" : peripheralSmearTest ? " peripheral-smear-report" : factorXiiTest ? " factor-xii-report" : factorXiiiTest ? " factor-xiii-report" : ""}">
        <table class="header-table">
          <tr>
            <td style="width: 39%;">
              <div class="patient-overview">
                <div class="patient-meta">
                  <div class="patient-name">${patientName}</div>
                  <div class="info-row">Age : ${age} Years</div>
                  <div class="info-row">Sex : ${sex}</div>
                  <div class="info-row">PID : ${patientId}</div>
                </div>
                <div class="header-qr">
                  <div class="qr-frame"><img src="${qrUrl}" class="qr-img" /></div>
                </div>
              </div>
            </td>
            <td style="width: 35%;">
              <div class="collection-heading">Sample Collected At:</div>
              <div class="collection-location">${escapeHtml(collectionLocation)}</div>
              <div class="referral-row">Ref. By: <strong>${doctorName}</strong></div>
            </td>
            <td style="width: 26%;" class="header-barcode">
              <div>
                <img src="${barcodeUrl}" class="barcode-img" />
              </div>
              <div class="date-row"><strong>Registered on:</strong> ${registeredOn}</div>
              <div class="date-row"><strong>Reported on:</strong> ${reportedOn}</div>
            </td>
          </tr>
        </table>

        <div class="test-title">${testTitle}</div>

        ${beta2GlycoproteinPanelTest ? buildBeta2GlycoproteinPanelReportBody(beta2GlycoproteinPanelTest) : toxoplasmaAntibodiesPanelTest ? buildToxoplasmaAntibodiesPanelReportBody(toxoplasmaAntibodiesPanelTest) : torchProfileTest ? buildTorchProfileReportBody(torchProfileTest) : tnfAlphaTest ? buildTnfAlphaReportBody(tnfAlphaTest) : rheumatoidFactorTest ? buildRheumatoidFactorReportBody(rheumatoidFactorTest) : asoTiterTest ? buildAsoTiterReportBody(asoTiterTest) : hsCrpTest ? buildHsCrpReportBody(hsCrpTest) : typhidotTest ? buildTyphidotReportBody(typhidotTest) : vdrlTest ? buildVdrlReportBody(vdrlTest) : havIggTest ? buildHavIggReportBody(havIggTest) : havIgmTest ? buildHavIgmReportBody(havIgmTest) : hcvRapidScreeningTest ? buildHcvRapidScreeningReportBody(hcvRapidScreeningTest) : rtPcrTest ? buildRtPcrReportBody(rtPcrTest) : tpmtTest ? buildTpmtGenotypingReportBody(tpmtTest) : cysticFibrosisNewbornTest ? buildCysticFibrosisNewbornScreenReportBody(cysticFibrosisNewbornTest) : kftTest ? buildKftReportBody(kftTest) : factorIiTest ? buildFactorIiReportBody(factorIiTest) : karyotypeTest ? buildKaryotypeReportBody(karyotypeTest) : lipidProfileTest ? buildLipidProfileReportBody(lipidProfileTest) : lftTest ? buildLftReportBody(lftTest) : hba1cTest ? buildHba1cReportBody(hba1cTest) : vitaminDTest ? buildVitaminDReportBody(vitaminDTest) : vitaminCTest ? buildVitaminCReportBody(vitaminCTest) : vitaminB12Test ? buildVitaminB12ReportBody(vitaminB12Test) : randomBloodSugarTest ? buildRandomBloodSugarReportBody(randomBloodSugarTest) : fastingBloodSugarTest ? buildFastingBloodSugarReportBody(fastingBloodSugarTest) : bTypeNatriureticPeptideTest ? buildBTypeNatriureticPeptideReportBody(bTypeNatriureticPeptideTest) : creatineKinaseTest ? buildCreatineKinaseReportBody(creatineKinaseTest) : beta2MicroglobulinTest ? buildBeta2MicroglobulinReportBody(beta2MicroglobulinTest) : altSgptTest ? buildAltSgptReportBody(altSgptTest) : dnphTest ? buildDnphReportBody(dnphTest) : prealbuminTest ? buildPrealbuminReportBody(prealbuminTest) : haptoglobinTest ? buildHaptoglobinReportBody(haptoglobinTest) : gramStainBacterialVaginosisTest ? buildGramStainBacterialVaginosisReportBody(gramStainBacterialVaginosisTest) : aldolaseTest ? buildAldolaseReportBody(aldolaseTest) : urineProteinCreatinineRatioTest ? buildUrineProteinCreatinineRatioReportBody(urineProteinCreatinineRatioTest) : albuminCreatinineRatioTest ? buildAlbuminCreatinineRatioReportBody(albuminCreatinineRatioTest) : postPrandialBloodSugarTest ? buildPostPrandialBloodSugarReportBody(postPrandialBloodSugarTest) : tacrolimusTest ? buildTacrolimusReportBody(tacrolimusTest) : phosphorusTest ? buildPhosphorusReportBody(phosphorusTest) : alkalinePhosphataseTest ? buildAlkalinePhosphataseReportBody(alkalinePhosphataseTest) : clotRetractionTest ? buildClotRetractionReportBody(clotRetractionTest) : vitaminETest ? buildVitaminEReportBody(vitaminETest) : vitaminB9Test ? buildVitaminB9ReportBody(vitaminB9Test) : vitaminKTest ? buildVitaminKReportBody(vitaminKTest) : ldlCholesterolTest ? buildLdlCholesterolReportBody(ldlCholesterolTest) : hdlCholesterolTest ? buildHdlCholesterolReportBody(hdlCholesterolTest) : indirectBilirubinTest ? buildIndirectBilirubinReportBody(indirectBilirubinTest) : calciumTest ? buildCalciumReportBody(calciumTest) : ferritinTest ? buildFerritinReportBody(ferritinTest) : cPeptideTest ? buildCPeptideReportBody(cPeptideTest) : vldlCholesterolTest ? buildVldlCholesterolReportBody(vldlCholesterolTest) : comprehensiveMetabolicPanelTest ? buildComprehensiveMetabolicPanelReportBody(comprehensiveMetabolicPanelTest) : electrolyteProfileTest ? buildElectrolyteProfileReportBody(electrolyteProfileTest) : potassiumTest ? buildPotassiumReportBody(potassiumTest) : astSgotTest ? buildAstSgotReportBody(astSgotTest) : globulinTest ? buildGlobulinReportBody(globulinTest) : albuminTest ? buildAlbuminReportBody(albuminTest) : digoxinTest ? buildDigoxinReportBody(digoxinTest) : bunTest ? buildBunReportBody(bunTest) : cbcTest ? buildCbcReportBody(cbcTest, cbcVariant) : bloodGroupTest ? buildBloodGroupReportBody(bloodGroupTest) : dDimerTest ? buildDDimerReportBody(dDimerTest) : sickleCellMutationTest ? buildSickleCellMutationAnalysisReportBody(sickleCellMutationTest) : rbcTest ? buildRbcReportBody(rbcTest) : plateletTest ? buildPlateletReportBody(plateletTest) : tlcTest ? buildTlcReportBody(tlcTest) : absoluteCountTest ? buildAbsoluteCountReportBody(absoluteCountTest, absoluteCountTemplate) : mchcTest ? buildMchcReportBody(mchcTest) : mchTest ? buildMchReportBody(mchTest) : mcvTest ? buildMcvReportBody(mcvTest) : mpvTest ? buildMpvReportBody(mpvTest) : hctPcvTest ? buildHctPcvReportBody(hctPcvTest) : esrTest ? buildEsrReportBody(esrTest) : pdwTest ? buildPdwReportBody(pdwTest) : hemoglobinTest ? buildHemoglobinReportBody(hemoglobinTest, reportData.patient.gender) : ptTest ? buildProthrombinTimeReportBody(ptTest) : apttTest ? buildApttReportBody(apttTest) : dlcTest ? buildDlcReportBody(dlcTest) : indirectCoombsTest ? buildIndirectCoombsReportBody(indirectCoombsTest) : directCoombsTest ? buildDirectCoombsReportBody(directCoombsTest) : fibrinogenTest ? buildFibrinogenReportBody(fibrinogenTest) : reticulocyteTest ? buildReticulocyteReportBody(reticulocyteTest) : clottingTimeTest ? buildClottingTimeReportBody(clottingTimeTest) : bleedingTimeTest ? buildBleedingTimeReportBody(bleedingTimeTest) : coagulationProfileTest ? buildCoagulationProfileReportBody(coagulationProfileTest) : factorVTest ? buildFactorVReportBody(factorVTest) : factorViiTest ? buildFactorViiReportBody(factorViiTest) : factorIxTest ? buildFactorIxReportBody(factorIxTest) : factorXTest ? buildFactorXReportBody(factorXTest) : factorXiTest ? buildFactorXiReportBody(factorXiTest) : factorViiiTest ? buildFactorViiiReportBody(factorViiiTest) : peripheralSmearTest ? buildPeripheralBloodSmearReportBody(peripheralSmearTest) : factorXiiTest ? buildFactorXiiReportBody(factorXiiTest) : factorXiiiTest ? buildFactorXiiiReportBody(factorXiiiTest) : `
        <table class="results-table">
          <thead>
            <tr>
              <th style="width: 40%">Investigation</th>
              <th style="width: 20%">Result</th>
              <th style="width: 25%">Reference Value</th>
              <th style="width: 15%">Unit</th>
            </tr>
          </thead>
          <tbody>
            ${reportData.tests.flatMap(test => {
              const rows = [];
              const parameters = Array.isArray(test.parameters) ? test.parameters : [];
              
              if (test.name.toUpperCase().includes("COOMBS TEST")) {
                rows.push(`
                  <tr>
                    <td colspan="4">
                      <div class="group-header">${escapeHtml(test.name)}</div>
                      <div class="method-note">Erythrocyte Magnetized Technology</div>
                    </td>
                  </tr>
                `);
              }

              if (!parameters.length) {
                rows.push(`
                  <tr class="empty-result-row">
                    <td>Result</td>
                    <td>-</td>
                    <td>-</td>
                    <td></td>
                  </tr>
                `);
              }

              parameters.forEach(param => {
                if (param.parameter_name.toUpperCase() === "PROTHROMBIN TIME STUDIES") {
                  rows.push(`
                    <tr>
                      <td colspan="4" style="padding-top: 8px;">
                        <div class="group-header" style="font-weight: bold; font-size: 15px; text-transform: uppercase;">PROTHROMBIN TIME STUDIES</div>
                        <div class="method-note" style="font-size: 10px; color: #333; font-weight: normal; margin-bottom: 3px;">Photo optical Clot Detection</div>
                      </td>
                    </tr>
                  `);
                  return;
                }

                const { isAbnormal, colorClass } = checkResultRange(param.value, param.normal_range);
                let valDisplay = escapeHtml(param.value || "-");
                if (getCellReportDefinition(test)) valDisplay = valDisplay.replace(/\r?\n/g, "<br />");
                if (isAbnormal) {
                  const label = colorClass === 'high-val' ? 'High' : 'Low';
                  valDisplay = `<span class="${colorClass}">${valDisplay}</span> &nbsp; <span class="${colorClass}" style="font-size: 13px; font-weight: bold;">${label}</span>`;
                }
                
                const needsIndentation = [
                  "Neutrophils", "Lymphocytes", "Eosinophils", "Monocytes", "Basophils",
                  "Neutrophil", "Lymphocyte", "Eosinophil", "Monocyte", "Basophil"
                ].some(s => param.parameter_name.includes(s));
                const paddingLeft = needsIndentation ? '20px' : '0';

                rows.push(`
                  <tr>
                    <td style="padding-left: ${paddingLeft}">${escapeHtml(param.parameter_name)}</td>
                    <td style="font-weight: ${isAbnormal ? 'bold' : 'normal'}">${valDisplay}</td>
                    <td>${escapeHtml(param.normal_range || "-")}</td>
                    <td>${escapeHtml(param.unit || "")}</td>
                  </tr>
                `);
              });
              return rows;
            }).join('')}
          </tbody>
        </table>
        `}

        <!-- supplemental-report-content -->
        ${customReportNarratives}

        ${!indirectCoombsTest && reportData.tests.some(t => t.name.toUpperCase().includes("COOMBS TEST") && t.name.toUpperCase().includes("INDIRECT")) ? `
          <div class="report-notes">
            <div style="font-weight: bold; margin-bottom: 4px; font-size: 14px;">Interpretation :</div>
            <table class="notes-table">
              <thead>
                <tr>
                  <th style="width: 20%;">RESULT</th>
                  <th>COMMENTS</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><strong>Negative</strong></td>
                  <td>No antibodies detected</td>
                </tr>
                <tr>
                  <td><strong>Equivocal</strong></td>
                  <td>Positive in undiluted serum & titre upto 1:16</td>
                </tr>
                <tr>
                  <td><strong>Positive</strong></td>
                  <td>
                    <ul style="margin: 0; padding-left: 15px;">
                      <li>Titre of 1:32 or above</li>
                      <li>Rising titre on serial testing</li>
                    </ul>
                  </td>
                </tr>
              </tbody>
            </table>

            <div style="margin-top: 15px;">
              <div style="font-weight: bold; margin-bottom: 4px; font-size: 14px;">Comments :</div>
              <p style="margin: 0; line-height: 1.3;">
                Indirect Coomb's test (ICT) is used to detect incomplete Rh IgG antibodies in the serum. This test is used for: · Compatibility testing, · Screening and detection of unexpected antibodies in the serum · Detection of red cell antigens not detected by other techniques like K, Fy, JK etc.,
              </p>
            </div>

            <div style="margin-top: 15px;">
              <div style="font-weight: bold; margin-bottom: 4px; font-size: 14px;">Recommended sampling regime in pregnancy :</div>
              <table class="notes-table">
                <thead>
                  <tr>
                    <th style="width: 40%;">STAGE OF PREGNANCY</th>
                    <th>REFERENCE GROUP</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Early pregnancy</td>
                    <td>All cases</td>
                  </tr>
                  <tr>
                    <td>28th week</td>
                    <td>Rh D negative cases</td>
                  </tr>
                  <tr>
                    <td>34th-36th week</td>
                    <td>All cases</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        ` : ''}

        ${!ptTest && reportData.tests.some(t => {
          const n = t.name.toUpperCase();
          return n.includes("PROTHROMBIN TIME") || n.includes("PTIME") || n.includes("P-TIME") || n === "PT";
        }) ? `
          <div class="report-notes" style="margin-top: 15px; font-size: 11px; line-height: 1.4;">
            <div style="font-weight: bold; margin-bottom: 4px; font-size: 14px;">Note :</div>
            <ol style="margin: 0; padding-left: 15px;">
              <li>INR is the parameter of choice in monitoring adequacy of oral anticoagulant therapy. Appropriate therapeutic range varies with the disease and treatment intensity</li>
              <li>Prolonged INR suggests potential bleeding disorder / bleeding complications</li>
              <li>Results should be clinically correlated</li>
              <li>Test conducted on Citrated plasma</li>
            </ol>

            <div style="margin-top: 12px;">
              <div style="font-weight: bold; margin-bottom: 4px; font-size: 14px;">Recommended Therapeutic range for Oral Anticoagulant therapy</div>
              <div style="font-weight: bold; margin-top: 4px; font-size: 13px;">INR 2.0 - 3.0 :</div>
              <ul style="margin: 0; padding-left: 15px; list-style-type: disc;">
                <li>Treatment of Venous thrombosis & Pulmonary embolism</li>
                <li>Prophylaxis of Venous thrombosis (High risk surgery)</li>
                <li>Prevention of systemic embolism in tissue heart valves, AMI, Valvular heart disease & Atrial fibrillation</li>
                <li>Bileaflet mechanical valve in aortic position</li>
              </ul>
              <div style="font-weight: bold; margin-top: 4px; font-size: 13px;">INR 2.5 - 3.5</div>
              <ul style="margin: 0; padding-left: 15px; list-style-type: disc;">
                <li>Mechanical prosthetic valves</li>
                <li>Systemic recurrent emboli</li>
              </ul>
            </div>

            <div style="margin-top: 12px;">
              <div style="font-weight: bold; margin-bottom: 4px; font-size: 14px;">Comments :</div>
              <p style="margin: 0; text-align: justify; line-height: 1.4;">
                Prothrombin time measures the extrinsic coagulation pathway which consists of activated Factor VII (VIIa), Tissue factor and Proteins of the common pathway (Factors X, V, II & Fibrinogen). This assay is used to control long term oral anticoagulant therapy, evaluation of liver function & to evaluate coagulation disorders specially factors involved in the extrinsic pathway like Factors V, VII, X, Prothrombin & Fibrinogen.
              </p>
            </div>
          </div>
        ` : ''}

        <div class="report-footer">
          <div>Thanks for Reference</div>
          <div style="font-weight: bold;">****End of Report****</div>
          <div style="width: 100px;"></div>
        </div>

        <div class="signature-wrapper legacy-signature">
          <div class="signature-section">
            <img src="data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCAB8AXIDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD9U6KKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiivhz/gpb+2/d/s5+HbLwP4LuY4/Huv2zzS3hBJ0qyIZBMvQea7BgnXGxiR93LSu7DPrnxh8WPBHw8kjTxV4y8P8Ahl5PuLrGqQWhb6CRhnrV/wAJeOPDnj/TG1Lwv4g0vxJpyyGJrvSL2O6hDgAlS8bEZAIOM55FfzOf8JDdapqE93fTPfXt1I01xd3jmSSaRiSzux5JJJJJ9a9C8C3XjTwJcL4v8CarqWiXsC4fUdCmaORFzyjhPvISoyHGD05FevTyyrVg509bE8yvY/o8or8o/wBmn/grxr2lahZ6F8bLC31TTXcI/irSoRFdW4Jb557VBtlUZQZhCFVU/LI3Ffp/4J8c+H/iR4YsfEXhbWbPXtEvU3wX1jKJI37EZHRgcgqcFSCCAQRXlzpyg7SQzdooorMAooooA8C/bh+Ovi39nH9nzVvHHg3RLLWtTtLq3glbUdzQWcMj7DO6Kys+GKIAGHMgJyFIPyX+yL/wVj1n4j/EXRvA/wATfDdgk+u30Om6brXh5XjVLiVwkaTwyOxKszD94jDbxlDkkfUn7f8A8T7P4Y/sz+IGvdNg1WPX5E0AW9zzGPPDBmI9VRXI/wBoKe1fFn/BMv8AZ+8DfEn4ra34wvtJR5/Az2s+n2+MxG6maYxyuD/FCINy+hdW6qK1VJum532NUly3Z+sFFVra+W5ubuARTxtbOqF5IiqPlQ2UY8MOcEjoQR2qj4w8UWXgjwlrfiPU2ZdO0ixn1C5ZBlhFFG0jkDudqmslrsZ26Hzx+0r/AMFC/hl+zJ4xh8J6vb6z4j8SmET3FjoMMUn2JSFZPPaSRApZW3ADccYJADKT678DPjh4d/aC8AW/izw0t5b2jytBNZajGsd1bSAKwSVVZlBZHjkGGOVkQ96/nm1/xT4k+L/jvV/E+uyXGra9rVxJfXlwFwN7DOFHRVUYUKOAFAHAr9d/+CZfil77wWmnefHIi6esbx78yiSF+C47fLMoHsor2lls3g5YrtYydRKaifcdFV7uxhvWgaZSzQSiaMqxUqwBGeD6EgjoQSDVivE1NApM5paYIYxMZhGolKhDJgbiASQM+nJ/OmA+isfxf4R0fx74Y1Pw74gsItU0XUoGtru0mztljYcjIIIPoQQQcEEEU/wv4X0jwX4esND0HTLbR9HsIhDa2NnGI4okHZVHHv7kknmlrceljVooopiCis3Tb6/utS1aC70w2VrbTIlndeesgvIzEjM+0cx7XZ02t12bhwwrSpJ3HsFFFFMQUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFfzlftkeNL34iftU/FTWr65+1t/wkN1ZwyKgUfZrZzBAMADpFFGM9TjJ5Jr+jWv56P29PhTqHwg/av+IOn38apa6rqc2vac8cZSOS1u3eVdoP8AcYtEe26JsV0ULc+odD9D/wDgnl+wd8KJvgV4R+Ini3wlb+K/FOu28l4V10fabSCJndY1S3b92QYwrbnVmBYkEcCvffGP7Avwc8QR31xoXhtfAet3EXlpqXheRrQRcY/49wfIYHuCnPPIPNc3/wAExfipY/En9kXwnZR3iT6v4YEmiahABhoTG7GDjuDA0RDdCQw6qa+r6KlSXtG4uweh+UXxK/4I1eLIdLvb/wAL/EbTvEmqrukjstR0w6f5p5OBIskg3HoNwUepAr4y8BfFv4v/ALEfxQ1Ky0y8v/CWuWFyi6t4d1Bd9rdsoyFnhzh0ZGJWRTnbJuRhkNX9FVfKf7dn7D/h/wDaj8DX+r6XYx2PxP0y0ZtK1KEKhvdoJFncZIDI/RXYgxsQwO3eriqt6SGV/wBjb/gol4J/aqeDw3dwHwn8RFtzK+jXDhob3YCXa0l/jwo3mNgHUbiN6oz19aV/LxIuu/D/AMWn/j/8OeJtEvc8l7a7sLqJ/XhkkR19iCvY1+5//BOj9sm6/as+GN7a+KPs0XxA8NtHBqRt18tb6FgfKuwmAELFXV1XKhk3AIrqiqpC2sdhH1xRRRWAH5if8FlfjhaxW/gv4SQWztemWPxTd3Z+6kYE9vDEvPJYmYtkDAVMZ3HHbf8ABGjRoJPgl488TEk32o+JTZS+gSC2hdB+dy9fnp+3949j+IP7YvxS1FY3his9TOjBCc4+xolsxHszws3/AAKv1N/4JRfD9/A/7HmiXsrOJ/EmpXmtPE67TGC4t0A9QUtkfP8At11tONHyB7n2HXzP/wAFGPjJB8Gf2TfGM7RpPf8AiOE+GrGGRSVeS6jdZCcdNsCzuM8bkA719MV+Hn/BVb9pmD42/HC38K+H9QivvCPg5Gtop7Zw8V1fPg3EisAMhdqRDkjMbspw9Y0480rAcR+xL8XfDfhT9pzQfFfj6/g03w7ptrOvzwmVEzEyooUAnqfSvs/4Ma7rvxa/ast/GPwB05Y/h7ZanFbeINSmt1s7FrSQh7iJIzhnlI+YYGQxUnAOa/Pz9lD9lfxh+1j8Qf8AhHfDYFhpNmEl1jXriMvb6dAxIDEcb5WCt5cQILFSSVVXdf39+D/wo8P/AAO+GmgeBvC8MsOiaNb+RB9offLIxYvJJI2AC7uzu2ABljgAYA93F5hJ0/ZLdqzfldvb+tDHku7s7GiiivnTYKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiqGua9pnhjSrjU9Y1G00nTbdd015fTrDDEPVnYgAfU15H4p/bW+A3g6yN1qHxa8JyxjjZpupx38v/AH7ty7/pTSb2HY9ror4o8Xf8Fef2f/Dd4YNPuPEniuMY/wBI0fSdidAf+Xl4W46dO1ex/szftnfDT9q631FfBd/d2+r6coku9F1eAQXkcRbasoVWZXTPBKM20lQ20suW4tasR7pRRRUgFFFFABRRRQAUUUUAFFFFABRRRQAV+e3/AAVt/ZW1X4q+DdF+JnhXT5dT1rwxDJa6rZ26bpZtOOZBKvzZPkvuO1VJImY5ATn9CaKabTugP5yf2Wf2pfF37KHxITxR4bEWoWV1GLbVNGuXKwX8Oc7WI5SRTyjjlT1DKzK37c/s2ftu/Cz9p3T7SLw7rsWmeKZEJm8Laq6w38bAMWEak4nUKhbdEWwpG7YcqPDf2vv+CWXhb423934r+HM1h4H8ZTt5lzaSxEaXqDnALOqAmBz1LxqQxySm5i9fmp8Rv2Kvjx8Fb1bzVPh74gi+xg3aat4fj+3wwiM580z25Yw4xkb9pGM4FbvlmtXqM/oaor8IfhZ/wVL+P/w1t47G78R6b4xs4YvKjj8WWRmdOc5M0TRzO3vI7V654b/4LTfEuG6U654F8I6hbjqmny3No5+hkkkx+VQqd9mI+rv+Cgn/AAT/ALD9pbRZvGPgy3ttN+KNhCT0WOPXI1UAQTscAShVCxyscDhH+Xa0f5afsu/HDxB+x78fbXxBcWN3bGxmk0rxHoc0O2eS13gXEJRiu2VGQOgJX54gG4yD9eeJP+C2viE2Ai0b4VaVZX2f+Pi91x7qLH/XNIoz/wCP18QftJftGa5+0v8AECTxnr2laNpGrSW8dvL/AGLA8ayhPlUtvdmLBQq5J6KO1d1DlUZRqS0t+P8Awwmup/RL4F8daB8TPCGleKPC+qW+taBqkAuLS+tiSkiHjocFWBBVlYBlYFSAQRT/ABh418P/AA+0C51zxPren+H9Ht8ebf6ncpbwoTwAXcgZJ4A6k8Cv5o/Anxa8bfC+W6fwd4w17wo12ALg6JqM1p5wGdu/y2G7GTjPrUvjrVPG3i423inxjc+INabUAVg1nXZZ5/tIT5Tsmkzv27dvBOMY7VnDCuom4vYLob8VPFlt42+J/jHxFZLJHZ6zrF7fwrKoV1jmmd1yBwDhug4r9DB/wWE0z4e/Bbwf4S+HXgCebW9I0Sz017vxHOFs7d4Y0jO2OJt8ykIcEvERkHB6V8B/Bn4G+N/2gvGK+F/AWhya3q/ktcSIJEijgiUgNJJI5CqoJA5PJIAySAf2+/Z2/wCCdvwe+C3gfSbbV/BOi+LvFxs4hq2r63ANQWW5+85hSZdkSBiVXYisUVdxZsk1VcacVB6i3dz8ovEHxW/aW/bavfEHkXfifxVpESCfUNH0NZYdItYxlkV4lIjz8hK78uxU8sQa+aZEYbgeoJGPpX9I37QGoR/DL9mj4kX2gxQ6OdI8L6lPYpZxCNIJFtpGj2qoAGHweK/m8ilG+NpMsu5WcZ6jvWtCcZJ2VmDVz9/P+CdnwGHwD/Zf8N2V0gXXtfH9v6mQSdsk6r5cfIBGyFYlI5G8OQea+maKK8ycueTkUFFFFQAUUVGglEshdkMZxsAUgjjnJzzz7CgCSiivLviN+1F8JPhMLpfFfxE8P6Vc2rbJrH7ck12jen2ePdL9fl4ppN7Adr428aaR8PPC994i165Nlo9iFe6udhcQoXCl2ABO1d2SewBPatyvjLxv/wAFaP2efDG2Ox1XW/F6uh3/ANjaQ6qv+y32kwgk+2RXjHi7/gt34bs9Q8vwt8LNU1ey258/WNXisJA3p5ccc4I/4HVezmPofppRX416r/wWr+LM19K+meCvBlpZk/u4rqK7nkUe7rOgP/fIrw34j/8ABRv9oL4oSFLnx/feH7PzDKlr4YUacI/9nzYgJWX2Z2q1Sl1Ef0DVxHj/AOOHw8+FRKeMfHHh7wzN5ZmW31TU4YJnUDOUjZgz/RQSa/m+8Z/E/wAZfEK5E3inxZr3iOVekmsanNdsOMdZGJ6CsPTbK61jULewsrea9vbiRYobe2jMssrscKqqOSSeABVqlHqwP3P8Z/8ABWP9nfwrHGbDX9W8WOxIePRdImBjx3JuBCpz/sk14141/wCC23hDT7qNfCXwy1rW7Yr88us6jDprKfZY1uMj3yPpXwp4Q/4J7/tD+ObZp9N+FetW0anB/tl4NLf8EuXjY/gK9Q8Kf8Ehfj/4hI/tC38OeGBjJOqat5hHt/o6S5NPkprdgbXj7/gsd8Z/FKT2/h3TfDngy3aTdHc21o15dxr/AHS07GJvc+UPbFeBeLP22Pj14qvZNRvPi34rt55SSU0zUXsIR9I4NiD8BX3B4Q/4Ih2yLaTeKPitNI5ANzaaPo4QA91SaSU5/wB4xj6V6B4x/Yl/ZY/ZS8OWD+KPCfij4ka1qlw8el2TTT3moXjgAtHHFbeTFgAg5cZ56npVxlSWjGk27I/HfW9d1XxTqk+pazqN3rGo3Db5ru+uGnmkOMZZ2JJPHc1HpmmX2sX0Nlp9pNe3kzBIre1iMkjsegCrkk/Sv1+1H/gnL4f/AGgj4c1Kx8B2nwG8JBVmu7NWe71++Q7P3To/7qz434IaVskFkzlR9n/Bb9nf4d/s96ANJ8B+F7HQ0ZAlxeIm+7u8EtmadsyScsxAYkLnCgAAAqVIxdo/1+YWs9T8I/Af7Bv7QPxFuZodM+FfiCz8pQ7Sa7B/ZUeCf4WujGH+i5PtX6T/APBOn/gn54z/AGXPHes+OfGutaS19f6O+kw6NpReby1eaGVnllZVAYGEKFUMDuzu4wfvyiuWU3LRgFFFFQIKKKKACiiigAooooAKKKKACiiigAooooAKKKKAOY8Y/C7wZ8Q0RPFXhHQvEyIcqusabDdhfp5inFckP2UfgkpyPg74AB9vDFj/APGq9UooA8wi/Zb+DEEoli+EXgSORTkOnhqyBB+vlVr+Kfgd8PPGvhWTw3rngjQNR0JwcWMunReXGSpXemFGxwCQHXDDsRXcUUDufh9+2d/wTJ8ZfAm/1rxX4FtJfFHw1i33P7l/NvtLhChn89No3Rr837xN2FTL7ep8b+KH7Z/j34u/ALwf8IvEFrov/CO+F3tmsr22tXS8kFvC8MKyMXKELHIVyqKTgEknJP8ARIyh1KsAykYIPQ1+Xnx9/wCCN114r+KsusfDPxNo/h3wlqdwZrrS9Tjm36bkruFsEDCVc7yEYx7eFyRyOmnVcRWuM/4Ik/DmZbD4m+P7m0xDPLa6JY3e8csgaa5TbnP8dqckeuOhr9R685/Z6+CWkfs6/B7w54A0WZ7u10mFhJeSoEe6nd2kllIGcbnZiFydowuTjNejVlUk5yuBxPxw8Fz/ABH+C/jzwpaIj3mt6DfadAJCAvmy27ohJ7fMw57V/NFMON+OWySD7/8A1wa/qTr8Zv8Agof/AME+PEfw38aa18Q/h7o0+t+BNWlm1C8stOhzLocxy8oMaj/j2PzMrKMIAVbaFVn2o1FBNPqFj9PvgN+0Z4P+Mnw38Kaxb+K9BuNc1DTLae+062v4vNt7l4laWJot25SrbhgjtVb4iftjfBT4WWN3ceIPiZ4djltX8qWwsb5L28D/AN37PCXkzkYPy4Hciv5xWi+fG07vQA5/Kux8IfBj4g+PFaTwv4E8TeIkXq2laPcXIH1KIcUnCLd0PfY/Vj9nX/grR4O17xL46s/ipqjeHNJOpz3Xhi/OnSOfsBciO2nWBXImVdp3YIbLAnIG7vvHn/BXT4DeFIk/sWbxB4zldSQNK0toEQ9t7XJiIB9VDV+Y3hL/AIJ7/tEeL4UntPhTrEUbcgarPb6c3XHK3Do36V754J/4I2fFvxQ1hN4r8T+GfCNlKuZ4beSa/vIPYxhViY9Puy4x3zQoUore4Gh4z/4LXfEa61md/CngLwtpWlcCKDWWub2fpyTJHJCpycnAXjOMnGT4f44/4Kd/tE+OBfRf8JyPD1jdn/j00HT4LfyR6RzFWmX6+Zn3r7K8Kf8ABEbwbaTKfE3xO13V4h1XStPhsG/AuZ8flXt/hv8A4JT/ALN+h6RBZ3vg6+8RXEed2oanrd4s8uST8wgkjj4zj5UHA9eaFKEdUgPxS8a/Gz4g/Emzjs/FvjzxL4ltIn8yO31rWLi7jRsYyqOxAP0rK8GeAfFPxC1F7Dwp4a1jxNfBSxttH06W7kC+u1FJA96/ox+GP7M/wq+DUNqvg3wBoOhz2wZY76KyWS8ILFjuuX3SvyeNznAwBwAK9Mo9tb4UI/AfwZ/wTJ/aN8bJYz/8IEdEsroj/Sdc1G3tjEM43SQ7zMuPTy846A17v4X/AOCJXj+7YjxF8RfDWkr2OlWtxek/g4hr9gaKzdSTA/Mzwl/wRD8NWV+H8TfFXVdXsf4odJ0iKwkP0eSScD/vmvobwd/wS9/Zz8Jafawy+B5PEF3CCHv9Z1O5lkmOScuiusXGcfLGBgDvkn6toqHKT6jueRaL+yH8D/D6AWXwk8FqV5Ek2h28zj/gToT+teheHPBHh3wckiaBoGl6GsgAddNs47cMB0zsUZrboqdwuFFFFAgooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKAP/Z" class="sig-image" />
            <p class="doc-name">Dr. Arun Kumar Biswas</p>
            <p class="doc-detail">MBBS, MD (Path.)</p>
            <p class="doc-detail">Consultant Pathologist</p>
            <p class="doc-detail">Regd. No.- 58516</p>
          </div>
        </div>
        ${reportDoctorSignatureMarkup}
      </div>
      ${showPrintControls ? `
        <script>
          (() => {
            const controls = document.querySelector(".report-print-controls");
            if (!controls) return;

            const buttons = Array.from(controls.querySelectorAll("button[data-print-style]"));
            const setBusy = (busy) => buttons.forEach((button) => { button.disabled = busy; });

            const printVariant = async (style) => {
              const includeLetterhead = style === "letterhead";
              const endpoint = controls.dataset.reportPrintEndpoint;
              setBusy(true);

              try {
                if (endpoint) {
                  const url = new URL(endpoint, window.location.origin);
                  url.searchParams.set("letterhead", includeLetterhead ? "1" : "0");
                  const token = window.localStorage?.getItem("labToken");
                  const response = await fetch(url.toString(), {
                    headers: token ? { Authorization: "Bearer " + token } : {},
                  });
                  if (!response.ok) throw new Error("Unable to prepare this report for printing.");
                  const html = await response.text();
                  document.open();
                  document.write(html);
                  document.close();
                  window.setTimeout(() => window.print(), 250);
                  return;
                }

                const url = new URL(window.location.href);
                url.searchParams.set("letterhead", includeLetterhead ? "1" : "0");
                url.searchParams.set("print", "1");
                window.location.assign(url.toString());
              } catch (error) {
                window.alert(error.message || "Unable to prepare this report for printing.");
                setBusy(false);
              }
            };

            buttons.forEach((button) => button.addEventListener("click", () => printVariant(button.dataset.printStyle)));

            const currentUrl = new URL(window.location.href);
            if (!controls.dataset.reportPrintEndpoint && currentUrl.searchParams.get("print") === "1") {
              currentUrl.searchParams.delete("print");
              try { window.history.replaceState({}, "", currentUrl.toString()); } catch (_error) {}
              window.setTimeout(() => window.print(), 250);
            }
          })();
        </script>
      ` : ""}
      ${readOnlyView ? `
        <script>
          document.addEventListener("keydown", (event) => {
            if ((event.ctrlKey || event.metaKey) && String(event.key).toLowerCase() === "p") {
              event.preventDefault();
              event.stopImmediatePropagation();
              window.alert("Use the Print Report button in Lab LMS to print this report.");
            }
          }, true);
        </script>
      ` : ""}
    </body>
    </html>
  `, singleTest);
}

function buildReportActionControls({ show, visitId, patientPhone = "", canDownload, canShareWhatsApp }) {
  const normalizedVisitId = Number.parseInt(visitId, 10);
  if (!show || !Number.isInteger(normalizedVisitId) || normalizedVisitId <= 0 || (!canDownload && !canShareWhatsApp)) {
    return "";
  }

  const storedPhone = escapeHtml(String(patientPhone || "").trim());

  return `
    <div class="report-view-controls" data-report-visit-id="${normalizedVisitId}" data-patient-phone="${storedPhone}">
      <span>Report actions</span>
      ${canDownload ? `<button type="button" data-report-action="download">Download PDF</button>` : ""}
      ${canShareWhatsApp ? `<button type="button" data-report-action="whatsapp">Share on WhatsApp</button>` : ""}
    </div>
    <script>
      (() => {
        const controls = document.querySelector(".report-view-controls");
        if (!controls) return;
        const visitId = Number(controls.dataset.reportVisitId);

        controls.querySelectorAll("button[data-report-action]").forEach((button) => {
          button.addEventListener("click", () => {
            if (!window.opener || window.opener.closed) {
              window.alert("Open this report from Lab LMS to use this action.");
              return;
            }
            let patientPhone = controls.dataset.patientPhone || "";
            if (button.dataset.reportAction === "whatsapp" && !patientPhone.trim()) {
              patientPhone = window.prompt("Enter the patient's WhatsApp phone number. It will be saved to this patient record.", "");
              if (patientPhone === null) return;
              patientPhone = patientPhone.trim();
              if (!patientPhone) {
                window.alert("A patient phone number is required to share the report on WhatsApp.");
                return;
              }
            }
            window.opener.postMessage({
              type: "lab-lms-report-action",
              action: button.dataset.reportAction,
              visitId,
              patientPhone,
            }, window.location.origin);
          });
        });
      })();
    </script>
  `;
}

function buildMultiTestReportHtml(reportData, tests) {
  const singleTestPages = tests.map((test) => buildReportHtml({
    ...reportData,
    tests: [test],
    _singleTestPage: true,
    readOnlyView: false,
    showPrintControls: false,
    showReportActions: false,
    reportPrintEndpoint: "",
  }));

  const firstPage = extractGeneratedReportParts(singleTestPages[0]);
  const pageBodies = singleTestPages.map((pageHtml) => extractGeneratedReportParts(pageHtml).body);
  const readOnlyView = reportData.readOnlyView === true;
  const reportActionControls = buildReportActionControls({
    show: reportData.showReportActions === true && readOnlyView,
    visitId: reportData.reportActionVisitId,
    patientPhone: reportData.reportActionPatientPhone,
    canDownload: reportData.canDownloadReportPdf === true,
    canShareWhatsApp: reportData.canShareWhatsAppPdf === true,
  });
  const reportHeaderSpaceMm = Number.isInteger(Number(reportData.reportHeaderSpaceMm))
    && Number(reportData.reportHeaderSpaceMm) >= 0
    && Number(reportData.reportHeaderSpaceMm) <= 140
    ? Number(reportData.reportHeaderSpaceMm)
    : 0;
  const requestedFooterSpaceMm = Number.isInteger(Number(reportData.reportFooterSpaceMm))
    && Number(reportData.reportFooterSpaceMm) >= 0
    && Number(reportData.reportFooterSpaceMm) <= 140
    ? Number(reportData.reportFooterSpaceMm)
    : 0;
  const reportFooterSpaceMm = Math.min(requestedFooterSpaceMm, 240 - reportHeaderSpaceMm);

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <style>
        ${firstPage.style}
        body.multi-report { width: auto; min-height: auto; margin: 0; padding: 0; box-shadow: none; }
        .multi-report-page {
          position: relative;
          width: 210mm;
          min-height: 297mm;
          margin: 0 auto 16px;
          padding: ${reportHeaderSpaceMm}mm 10mm ${reportFooterSpaceMm}mm;
          box-sizing: border-box;
          background: #fff;
          break-after: page;
          page-break-after: always;
        }
        .multi-report-page:last-of-type { break-after: auto; page-break-after: auto; }
        .multi-report-page .letterhead-background { position: absolute; }
        .multi-report-page .main-content {
          min-height: calc(297mm - ${reportHeaderSpaceMm}mm - ${reportFooterSpaceMm}mm);
        }
        .multi-report-page .view-only-print-notice,
        .multi-report-page .report-print-controls { display: none !important; }
        @media screen {
          body.multi-report { background: #e9efee; }
          .multi-report-page { box-shadow: 0 14px 34px rgba(15, 23, 42, 0.18); }
        }
        @media print {
          html { padding: 0; background: #fff; }
          body.multi-report { background: #fff; }
          .multi-report-page {
            width: 210mm;
            min-height: 297mm;
            margin: 0;
            padding: ${reportHeaderSpaceMm}mm 10mm ${reportFooterSpaceMm}mm;
            box-shadow: none;
          }
          /* The page already reserves the letterhead header/footer. Without
             this override, the single-report print rule adds that space again. */
          .multi-report-page .main-content {
            min-height: calc(297mm - ${reportHeaderSpaceMm}mm - ${reportFooterSpaceMm}mm);
            padding: 0 !important;
          }
          .multi-report-page .letterhead-background { position: absolute; top: 0; left: 0; }
          body.report-read-only .multi-report-page { display: none !important; }
          body.report-read-only > .view-only-print-notice {
            display: block !important;
            margin: 30mm 20mm;
            color: #111827;
            font-family: Aptos, "Segoe UI", Calibri, Arial, sans-serif;
            font-size: 15px;
            line-height: 1.45;
          }
        }
      </style>
    </head>
    <body class="multi-report${readOnlyView ? " report-read-only" : ""}">
      ${reportActionControls}
      ${readOnlyView ? `<div class="view-only-print-notice">Printing is disabled while viewing a report. Please return to Lab LMS and use the Print Report button.</div>` : ""}
      ${pageBodies.map((body) => `<section class="multi-report-page">${body}</section>`).join("\n")}
      ${readOnlyView ? `
        <script>
          document.addEventListener("keydown", (event) => {
            if ((event.ctrlKey || event.metaKey) && String(event.key).toLowerCase() === "p") {
              event.preventDefault();
              event.stopImmediatePropagation();
              window.alert("Use the Print Report button in Lab LMS to print this report.");
            }
          }, true);
        </script>
      ` : ""}
    </body>
    </html>
  `;
}

function extractGeneratedReportParts(html) {
  const markup = String(html || "");
  const style = markup.match(/<style>([\s\S]*?)<\/style>/i)?.[1] || "";
  const body = markup.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] || "";
  return {
    style,
    body: body.replace(/<script>[\s\S]*?<\/script>/gi, ""),
  };
}

module.exports = { buildReportHtml };
