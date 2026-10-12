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

  if (["karyotype", "karyotypingchromosomalanalysis", "chromosomeanalysis"].includes(normalizedName)) {
    return [
      createParameter("Karyotype Result / Summary"),
      createParameter("ISCN Karyotype", { normalRange: "Use current ISCN nomenclature" }),
      createParameter("Specimen / Tissue Source", { normalRange: "State the actual specimen analysed" }),
      createParameter("Culture / Harvest Details", { normalRange: "Laboratory record" }),
      createParameter("Banding Method / Resolution", { normalRange: "State the validated method and resolution" }),
      createParameter("Cells Counted / Analysed / Karyotyped", { normalRange: "State cells evaluated" }),
      createParameter("Mosaicism / Clonal Findings, if present", { normalRange: "Report if detected" }),
      createParameter("Interpretation", { normalRange: "Laboratory geneticist / cytogeneticist interpretation" }),
      createParameter("Limitations", { normalRange: "State assay-specific limitations" }),
      createParameter("Recommendations / Correlation", { normalRange: "Clinical or genetic-counselling correlation, if indicated" }),
    ];
  }

  if (["karyotypingwithcbanding", "karyotypecbanding", "cbandingkaryotype", "cbandingchromosomeanalysis"].includes(normalizedName)) {
    return [
      createParameter("C-Banding Karyotype Result / Summary"),
      createParameter("ISCN Karyotype", { normalRange: "Use current ISCN nomenclature" }),
      createParameter("Specimen / Tissue Source", { normalRange: "State the actual specimen analysed" }),
      createParameter("C-Banding Method / Protocol", { normalRange: "State the validated C-banding method" }),
      createParameter("C-Band Findings / Heterochromatin Pattern"),
      createParameter("Cells Counted / Analysed / Karyotyped", { normalRange: "State cells evaluated" }),
      createParameter("Concurrent G-Band Karyotype, if performed"),
      createParameter("Mosaicism / Clonal Findings, if present", { normalRange: "Report if detected" }),
      createParameter("Interpretation", { normalRange: "Laboratory geneticist / cytogeneticist interpretation" }),
      createParameter("Limitations", { normalRange: "State assay-specific limitations" }),
      createParameter("Recommendations / Correlation", { normalRange: "Clinical or genetic-counselling correlation, if indicated" }),
    ];
  }

  if (["immatureplateletfractionipf", "immatureplateletfraction", "ipf"].includes(normalizedName)) {
    return [
      createParameter("Immature Platelet Fraction (IPF)", { unit: "%", normalRange: "Laboratory-validated, analyzer-specific reference interval" }),
      createParameter("Absolute Immature Platelet Count, if reported", { unit: "cells/µL" }),
      createParameter("Platelet Count, Concurrent", { unit: "cells/µL" }),
      createParameter("Mean Platelet Volume (MPV), if reported", { unit: "fL" }),
      createParameter("Analyzer / Method"),
      createParameter("Specimen", { normalRange: "EDTA whole blood, as validated by laboratory" }),
      createParameter("Collection / Analysis Timing"),
      createParameter("Platelet Flags / Smear Correlation, if performed"),
      createParameter("Interpretation / Comments"),
    ];
  }

  if (["immunoglobulinigaiggigm", "immunoglobuliniggigaigm", "immunoglobulingamprofile"].includes(normalizedName)) {
    return [
      createParameter("Immunoglobulin G (IgG), Serum", { unit: "mg/dL", normalRange: "Laboratory-validated, age- and method-specific reference interval" }),
      createParameter("Immunoglobulin A (IgA), Serum", { unit: "mg/dL", normalRange: "Laboratory-validated, age- and method-specific reference interval" }),
      createParameter("Immunoglobulin M (IgM), Serum", { unit: "mg/dL", normalRange: "Laboratory-validated, age- and method-specific reference interval" }),
      createParameter("Specimen", { normalRange: "Serum" }),
      createParameter("Method / Analyzer"),
      createParameter("Clinical Context / Indication"),
      createParameter("Serum Protein Electrophoresis / Immunofixation Correlation, if performed"),
      createParameter("Interpretation / Comments"),
    ];
  }

  if (["immunoglobulinprofile", "serumimmunoglobulinprofile", "quantitativeimmunoglobulinprofile"].includes(normalizedName)) {
    return [
      createParameter("Immunoglobulin G (IgG), Serum", { unit: "mg/dL", normalRange: "Laboratory-validated, age- and method-specific reference interval" }),
      createParameter("Immunoglobulin A (IgA), Serum", { unit: "mg/dL", normalRange: "Laboratory-validated, age- and method-specific reference interval" }),
      createParameter("Immunoglobulin M (IgM), Serum", { unit: "mg/dL", normalRange: "Laboratory-validated, age- and method-specific reference interval" }),
      createParameter("Total Immunoglobulin E (IgE), if ordered", { unit: "Laboratory reporting unit", normalRange: "Laboratory-validated, age- and method-specific reference interval" }),
      createParameter("Specimen", { normalRange: "Serum" }),
      createParameter("Method / Analyzer"),
      createParameter("Clinical Context / Indication"),
      createParameter("Serum Protein Electrophoresis / Immunofixation Correlation, if performed"),
      createParameter("Interpretation / Comments"),
    ];
  }

  if (["indiainkpreperation", "indiainkpreparation", "indiainkstain", "indiaink"].includes(normalizedName)) {
    return [
      createParameter("India Ink Microscopy Result", { normalRange: "No encapsulated yeast seen" }),
      createParameter("Microscopic Observation / Morphology"),
      createParameter("Specimen", { normalRange: "CSF preferred; other specimen only if validated by laboratory" }),
      createParameter("Concentration / Centrifugation, if performed"),
      createParameter("Cryptococcal Antigen (CrAg), if performed"),
      createParameter("Fungal Culture, if performed"),
      createParameter("Microscopy Method / Reader"),
      createParameter("Interpretation / Comments"),
    ];
  }

  if (["jointfluidforafbstain", "jointfluidafbstain", "synovialfluidforafbstain", "synovialfluidafbstain", "afbstainjointfluid"].includes(normalizedName)) {
    return [
      createParameter("AFB Smear Result", { normalRange: "No acid-fast bacilli seen" }),
      createParameter("AFB Smear Grade, if positive"),
      createParameter("Microscopic Findings / Morphology"),
      createParameter("Joint / Aspiration Site"),
      createParameter("Specimen", { normalRange: "Joint (synovial) fluid" }),
      createParameter("Stain Method"),
      createParameter("Mycobacterial Culture, if performed"),
      createParameter("Mycobacterium tuberculosis Complex Molecular Test, if performed"),
      createParameter("Identification / Susceptibility, if available"),
      createParameter("Interpretation / Comments"),
    ];
  }

  if (["jointfluidforcalcium", "jointfluidcalcium", "calciumjointfluid", "synovialfluidforcalcium", "synovialfluidcalcium"].includes(normalizedName)) {
    return [
      createParameter("Calcium, Synovial Fluid", { unit: "mg/dL", normalRange: "No universally established interval; interpret using the laboratory's validated fluid-specific reference information" }),
      createParameter("Joint / Aspiration Site"),
      createParameter("Specimen / Collection Details"),
      createParameter("Analytical Method, if recorded"),
      createParameter("Concurrent Serum Calcium, if available", { unit: "mg/dL", normalRange: "Laboratory-validated serum reference interval" }),
      createParameter("Serum Albumin, if available", { unit: "g/dL", normalRange: "Laboratory-validated serum reference interval" }),
      createParameter("Synovial Fluid Crystal Examination, if separately performed"),
      createParameter("Interpretation / Comments"),
      createParameter("Clinical Correlation / Follow-up, if indicated"),
    ];
  }

  if (["jointfluidforcrystals", "jointfluidcrystals", "synovialfluidforcrystals", "synovialfluidcrystals", "crystalexaminationsynovialfluid"].includes(normalizedName)) {
    return [
      createParameter("Joint / Aspiration Site"),
      createParameter("Specimen / Collection Details"),
      createParameter("Gross Appearance, if recorded"),
      createParameter("Wet Preparation / Polarized Light Microscopy Method"),
      createParameter("Crystal Examination Result", { normalRange: "No crystals seen" }),
      createParameter("Monosodium Urate Crystals, if identified"),
      createParameter("Calcium Pyrophosphate Crystals, if identified"),
      createParameter("Other Crystals / Artefacts, if identified"),
      createParameter("Crystal Morphology / Birefringence, if assessed"),
      createParameter("Intracellular / Extracellular Location, if assessed"),
      createParameter("Crystal Quantity / Burden, if reported"),
      createParameter("Cell Count / Gram Stain / Culture Correlation, if separately performed"),
      createParameter("Microscopy Interpretation / Comments"),
    ];
  }

  if (["jointfluidforuricacid", "jointfluiduricacid", "uricacidjointfluid", "synovialfluidforuricacid", "synovialfluiduricacid"].includes(normalizedName)) {
    return [
      createParameter("Uric Acid, Synovial Fluid", { unit: "mg/dL", normalRange: "No universally established interval; interpret with concurrent serum urate and laboratory-validated fluid-specific information" }),
      createParameter("Joint / Aspiration Site"),
      createParameter("Specimen / Collection Details"),
      createParameter("Analytical Method, if recorded"),
      createParameter("Concurrent Serum Uric Acid, if available", { unit: "mg/dL", normalRange: "Laboratory-validated serum reference interval" }),
      createParameter("Synovial Fluid / Serum Uric Acid Ratio, if calculated"),
      createParameter("Synovial Fluid Crystal Examination, if separately performed"),
      createParameter("Cell Count / Gram Stain / Culture Correlation, if separately performed"),
      createParameter("Interpretation / Comments"),
      createParameter("Clinical Correlation / Follow-up, if indicated"),
    ];
  }

  if (["t3ustsh", "t3ultrasensitivetsh", "t3andustsh"].includes(normalizedName)) {
    return [
      createParameter("T3, Serum", { unit: "ng/dL", normalRange: "Laboratory-validated reference interval for the reported T3 assay (total or free)" }),
      createParameter("T3 Assay Type / Method", { normalRange: "State whether total T3 or free T3 was measured" }),
      createParameter("Ultra-Sensitive TSH, Serum", { unit: "mIU/L", normalRange: "Laboratory-validated, age- and method-specific reference interval" }),
      createParameter("Specimen / Collection Details"),
      createParameter("Thyroid Medication / Biotin Interference Note, if provided"),
      createParameter("Laboratory Interpretation / Comments"),
      createParameter("Clinical Correlation / Follow-up, if indicated"),
    ];
  }

  if (["t4ustsh", "t4ultrasensitivetsh", "t4andustsh"].includes(normalizedName)) {
    return [
      createParameter("T4, Serum", { unit: "mcg/dL", normalRange: "Laboratory-validated reference interval for the reported T4 assay (total or free)" }),
      createParameter("T4 Assay Type / Method", { normalRange: "State whether total T4 or free T4 was measured" }),
      createParameter("Ultra-Sensitive TSH, Serum", { unit: "mIU/L", normalRange: "Laboratory-validated, age- and method-specific reference interval" }),
      createParameter("Specimen / Collection Details"),
      createParameter("Thyroid Medication / Biotin Interference Note, if provided"),
      createParameter("Laboratory Interpretation / Comments"),
      createParameter("Clinical Correlation / Follow-up, if indicated"),
    ];
  }

  if (["tbiga", "tuberculosisiga", "mycobacteriumtuberculosisiga"].includes(normalizedName)) {
    return [
      createParameter("TB IgA Antibody Result", { normalRange: "Report as positive, negative, or equivocal according to the validated assay instructions" }),
      createParameter("TB IgA Index / Titre, if reported"),
      createParameter("Assay Cut-off / Interpretation Category"),
      createParameter("Assay Method / Kit, if recorded"),
      createParameter("Specimen / Collection Details"),
      createParameter("Internal Quality Control, if recorded"),
      createParameter("Laboratory Comment / Limitation"),
      createParameter("AFB Smear / Culture / Molecular Test Correlation, if separately performed"),
      createParameter("Clinical Correlation / Follow-up, if indicated"),
    ];
  }

  if (["tbigm", "tuberculosisigm", "mycobacteriumtuberculosisigm"].includes(normalizedName)) {
    return [
      createParameter("TB IgM Antibody Result", { normalRange: "Report as positive, negative, or equivocal according to the validated assay instructions" }),
      createParameter("TB IgM Index / Titre, if reported"),
      createParameter("Assay Cut-off / Interpretation Category"),
      createParameter("Assay Method / Kit, if recorded"),
      createParameter("Specimen / Collection Details"),
      createParameter("Internal Quality Control, if recorded"),
      createParameter("Laboratory Comment / Limitation"),
      createParameter("AFB Smear / Culture / Molecular Test Correlation, if separately performed"),
      createParameter("Clinical Correlation / Follow-up, if indicated"),
    ];
  }

  if (["tbgthyroxinebindingglobulin", "thyroxinebindingglobulin", "tbg"].includes(normalizedName)) {
    return [
      createParameter("Thyroxine-Binding Globulin (TBG), Serum", { unit: "mcg/mL", normalRange: "Laboratory-validated, age-, sex-, pregnancy-, and method-specific reference interval" }),
      createParameter("Assay Method / Platform, if recorded"),
      createParameter("Concurrent Total T4, if available"),
      createParameter("Concurrent Free T4, if available"),
      createParameter("Concurrent TSH, if available"),
      createParameter("Pregnancy / Estrogen / Androgen / Relevant Medication Note, if provided"),
      createParameter("Interpretation / Comments"),
      createParameter("Clinical Correlation / Follow-up, if indicated"),
    ];
  }

  if (["tcdc", "totalcountdifferentialcount", "tlcdlc"].includes(normalizedName)) {
    return [
      createParameter("Total Leukocyte Count (TLC / TC)", { unit: "cells/cumm", normalRange: "Age-specific laboratory reference interval" }),
      createParameter("Neutrophils", { unit: "%", normalRange: "Laboratory-validated age-specific reference interval" }),
      createParameter("Lymphocytes", { unit: "%", normalRange: "Laboratory-validated age-specific reference interval" }),
      createParameter("Monocytes", { unit: "%", normalRange: "Laboratory-validated age-specific reference interval" }),
      createParameter("Eosinophils", { unit: "%", normalRange: "Laboratory-validated age-specific reference interval" }),
      createParameter("Basophils", { unit: "%", normalRange: "Laboratory-validated age-specific reference interval" }),
      createParameter("Immature / Abnormal Cells, if seen"),
      createParameter("Absolute Differential Counts, if reported"),
      createParameter("Method / Analyzer, if recorded"),
      createParameter("Peripheral Smear Correlation, if performed"),
      createParameter("Laboratory Interpretation / Comments"),
    ];
  }

  if (["tcdcesr", "totalcountdifferentialcountesr", "tlcdlcesr"].includes(normalizedName)) {
    return [
      createParameter("Total Leukocyte Count (TLC / TC)", { unit: "cells/cumm", normalRange: "Age-specific laboratory reference interval" }),
      createParameter("Neutrophils", { unit: "%", normalRange: "Laboratory-validated age-specific reference interval" }),
      createParameter("Lymphocytes", { unit: "%", normalRange: "Laboratory-validated age-specific reference interval" }),
      createParameter("Monocytes", { unit: "%", normalRange: "Laboratory-validated age-specific reference interval" }),
      createParameter("Eosinophils", { unit: "%", normalRange: "Laboratory-validated age-specific reference interval" }),
      createParameter("Basophils", { unit: "%", normalRange: "Laboratory-validated age-specific reference interval" }),
      createParameter("Immature / Abnormal Cells, if seen"),
      createParameter("Erythrocyte Sedimentation Rate (ESR)", { unit: "mm/hr", normalRange: "Laboratory-validated age- and sex-specific reference interval" }),
      createParameter("ESR Method, if recorded"),
      createParameter("Absolute Differential Counts, if reported"),
      createParameter("Peripheral Smear Correlation, if performed"),
      createParameter("Laboratory Interpretation / Comments"),
    ];
  }

  if (["tcdcmp", "totalcountdifferentialcountmp", "tlcdlcmp", "totalcountdifferentialcountmalarialparasite"].includes(normalizedName)) {
    return [
      createParameter("Total Leukocyte Count (TLC / TC)", { unit: "cells/cumm", normalRange: "Age-specific laboratory reference interval" }),
      createParameter("Neutrophils", { unit: "%", normalRange: "Laboratory-validated age-specific reference interval" }),
      createParameter("Lymphocytes", { unit: "%", normalRange: "Laboratory-validated age-specific reference interval" }),
      createParameter("Monocytes", { unit: "%", normalRange: "Laboratory-validated age-specific reference interval" }),
      createParameter("Eosinophils", { unit: "%", normalRange: "Laboratory-validated age-specific reference interval" }),
      createParameter("Basophils", { unit: "%", normalRange: "Laboratory-validated age-specific reference interval" }),
      createParameter("Immature / Abnormal Cells, if seen"),
      createParameter("Malaria Parasite on Peripheral Smear", { normalRange: "Detected / Not detected by the documented microscopy method" }),
      createParameter("Plasmodium Species, if detected"),
      createParameter("Parasite Stage / Forms, if detected"),
      createParameter("Parasite Density / Grading, if reported"),
      createParameter("Blood Film / Stain Method, if recorded"),
      createParameter("Absolute Differential Counts, if reported"),
      createParameter("Peripheral Smear Correlation, if performed"),
      createParameter("Laboratory Interpretation / Comments"),
    ];
  }

  if (["taeniaechinococcus", "taeniaechinococcusserology", "taeniaandechinococcus"].includes(normalizedName)) {
    return [
      createParameter("Taenia Antibody Result", { normalRange: "Interpret using the validated assay cut-off" }),
      createParameter("Echinococcus Antibody Result", { normalRange: "Interpret using the validated assay cut-off" }),
      createParameter("Assay Index / Titre, if reported"),
      createParameter("Assay Cut-off / Interpretation Category"),
      createParameter("Assay Method / Antigen / Kit, if recorded"),
      createParameter("Specimen / Collection Details"),
      createParameter("Relevant Imaging / Parasitology Correlation, if provided"),
      createParameter("Laboratory Comment / Limitation"),
      createParameter("Clinical Correlation / Follow-up, if indicated"),
    ];
  }

  if (["testicularcancermonitorprofile", "testicularcancermonitoringprofile", "testicularcancermarkers", "testiculartumourmarkermonitoring"].includes(normalizedName)) {
    return [
      createParameter("Alpha-Fetoprotein (AFP), Serum", { unit: "ng/mL", normalRange: "Laboratory-validated, method-specific reference interval" }),
      createParameter("Beta-human Chorionic Gonadotropin (beta-hCG), Serum", { unit: "mIU/mL", normalRange: "Laboratory-validated, method-specific reference interval" }),
      createParameter("Lactate Dehydrogenase (LDH), Serum", { unit: "U/L", normalRange: "Laboratory-validated, method-specific reference interval" }),
      createParameter("Collection Date / Treatment Phase, if provided"),
      createParameter("Prior Marker Values / Trend, if provided"),
      createParameter("Assay Method / Platform, if recorded"),
      createParameter("Sample Quality / Haemolysis Comment, if applicable"),
      createParameter("Laboratory Interpretation / Comments"),
      createParameter("Clinical / Imaging Correlation, if indicated"),
    ];
  }

  if (["testicularfunctionprofile", "testicularfunction", "malegonadalfunctionprofile", "malehormoneprofile"].includes(normalizedName)) {
    return [
      createParameter("Total Testosterone, Serum", { unit: "ng/dL", normalRange: "Laboratory-validated, age- and method-specific reference interval" }),
      createParameter("Free Testosterone, if measured or calculated", { unit: "pg/mL", normalRange: "Laboratory-validated, method-specific reference interval" }),
      createParameter("Sex Hormone-Binding Globulin (SHBG), Serum", { unit: "nmol/L", normalRange: "Laboratory-validated, age- and method-specific reference interval" }),
      createParameter("Albumin, Serum, if used for calculation", { unit: "g/dL", normalRange: "Laboratory-validated reference interval" }),
      createParameter("Luteinizing Hormone (LH), Serum", { unit: "mIU/mL", normalRange: "Laboratory-validated, age- and method-specific reference interval" }),
      createParameter("Follicle-Stimulating Hormone (FSH), Serum", { unit: "mIU/mL", normalRange: "Laboratory-validated, age- and method-specific reference interval" }),
      createParameter("Prolactin, Serum, if performed", { unit: "ng/mL", normalRange: "Laboratory-validated, age- and method-specific reference interval" }),
      createParameter("Estradiol, Serum, if performed", { unit: "pg/mL", normalRange: "Laboratory-validated, age- and method-specific reference interval" }),
      createParameter("Collection Time / Fasting Status, if recorded"),
      createParameter("Testosterone Therapy / Relevant Medication Note, if provided"),
      createParameter("Assay Method / Calculation, if recorded"),
      createParameter("Laboratory Interpretation / Comments"),
      createParameter("Clinical Correlation / Follow-up, if indicated"),
    ];
  }

  if (["thalassemiaprofile", "thalassaemiaprofile", "thalassemiascreeningprofile", "thalassaemiascreeningprofile"].includes(normalizedName)) {
    return [
      createParameter("Haemoglobin", { unit: "g/dL", normalRange: "Laboratory-validated age- and sex-specific reference interval" }),
      createParameter("Red Blood Cell Count", { unit: "million/cumm", normalRange: "Laboratory-validated age- and sex-specific reference interval" }),
      createParameter("Packed Cell Volume / Haematocrit", { unit: "%", normalRange: "Laboratory-validated age- and sex-specific reference interval" }),
      createParameter("Mean Corpuscular Volume (MCV)", { unit: "fL", normalRange: "Laboratory-validated age-specific reference interval" }),
      createParameter("Mean Corpuscular Haemoglobin (MCH)", { unit: "pg", normalRange: "Laboratory-validated age-specific reference interval" }),
      createParameter("Mean Corpuscular Haemoglobin Concentration (MCHC)", { unit: "g/dL", normalRange: "Laboratory-validated age- and sex-specific reference interval" }),
      createParameter("Red Cell Distribution Width (RDW)", { unit: "%", normalRange: "Laboratory-validated reference interval" }),
      createParameter("Peripheral Smear Morphology, if performed"),
      createParameter("Haemoglobin A (HbA)", { unit: "%", normalRange: "Laboratory-validated age- and method-specific reference interval" }),
      createParameter("Haemoglobin A2 (HbA2)", { unit: "%", normalRange: "Laboratory-validated age- and method-specific reference interval" }),
      createParameter("Haemoglobin F (HbF)", { unit: "%", normalRange: "Laboratory-validated age- and method-specific reference interval" }),
      createParameter("Haemoglobin Variant(s), if detected"),
      createParameter("Haemoglobin Analysis Method", { normalRange: "State the validated HPLC, capillary electrophoresis, or other method" }),
      createParameter("Iron Status / Ferritin Correlation, if available"),
      createParameter("Recent Transfusion History, if provided"),
      createParameter("Molecular / Genetic Testing Correlation, if performed"),
      createParameter("Laboratory Interpretation / Comments"),
      createParameter("Genetic Counselling / Clinical Correlation, if indicated"),
    ];
  }

  if (["throatswabculture", "throatculture", "pharyngealswabculture"].includes(normalizedName)) {
    return [
      createParameter("Specimen / Collection Details"),
      createParameter("Specimen Quality / Processing Notes"),
      createParameter("Culture Result", { normalRange: "Report the growth or no-growth finding using the validated laboratory convention" }),
      createParameter("Group A Streptococcus (Streptococcus pyogenes), if isolated"),
      createParameter("Other Potential Pathogen(s), if isolated"),
      createParameter("Normal Respiratory Flora / Mixed Growth, if applicable"),
      createParameter("Organism Identification Method, if performed"),
      createParameter("Culture Medium / Incubation / Method, if recorded"),
      createParameter("Direct Microscopy / Gram Stain, if performed"),
      createParameter("Antimicrobial Susceptibility, if specifically performed"),
      createParameter("Laboratory Interpretation / Comments"),
      createParameter("Clinical Correlation / Follow-up, if indicated"),
    ];
  }

  if (["throatswabculturesensitivity", "throatswabcultureandsensitivity", "throatcultureandsensitivity", "throatswabcs", "throatculturesensitivity"].includes(normalizedName)) {
    return [
      createParameter("Specimen / Collection Details"),
      createParameter("Specimen Quality / Processing Notes"),
      createParameter("Culture Result", { normalRange: "Report the growth or no-growth finding using the validated laboratory convention" }),
      createParameter("Group A Streptococcus (Streptococcus pyogenes), if isolated"),
      createParameter("Other Potential Pathogen(s), if isolated"),
      createParameter("Normal Respiratory Flora / Mixed Growth, if applicable"),
      createParameter("Organism Identification Method, if performed"),
      createParameter("Culture Medium / Incubation / Method, if recorded"),
      createParameter("Direct Microscopy / Gram Stain, if performed"),
      createParameter("Antimicrobial Susceptibility Result(s), if performed"),
      createParameter("Susceptibility Method / Standard, if recorded"),
      createParameter("Resistance Mechanism / Special Test, if performed"),
      createParameter("Laboratory Interpretation / Comments"),
      createParameter("Clinical Correlation / Follow-up, if indicated"),
    ];
  }

  if (["inorganicphosphorusurine", "urineinorganicphosphorus", "urinephosphorus", "phosphorusurine"].includes(normalizedName)) {
    return [
      createParameter("Inorganic Phosphorus, Urine Concentration", { unit: "mg/dL", normalRange: "No universal interval for a random specimen; interpret with collection type and clinical context" }),
      createParameter("Inorganic Phosphorus, 24-Hour Urine", { unit: "mg/24 h", normalRange: "Laboratory-validated, age-specific 24-hour reference interval" }),
      createParameter("Urine Volume", { unit: "mL" }),
      createParameter("Collection Duration", { unit: "hours" }),
      createParameter("Urine Creatinine, if measured", { unit: "mg/dL" }),
      createParameter("Serum Phosphorus, Concurrent, if available", { unit: "mg/dL" }),
      createParameter("Serum Creatinine, Concurrent, if available", { unit: "mg/dL" }),
      createParameter("Fractional Excretion of Phosphate, if calculated", { unit: "%" }),
      createParameter("Specimen / Collection Type", { normalRange: "24-hour collection preferred for excretion assessment" }),
      createParameter("Method / Analyzer"),
      createParameter("Interpretation / Comments"),
    ];
  }

  if (["insulinfree", "freeinsulin", "insulinfreeandtotal"].includes(normalizedName)) {
    return [
      createParameter("Free Insulin, Serum", { unit: "mcIU/mL", normalRange: "Laboratory-validated, method-specific reference interval" }),
      createParameter("Total Insulin, Serum, if performed", { unit: "mcIU/mL", normalRange: "Laboratory-validated, method-specific reference interval" }),
      createParameter("Glucose, Concurrent, if available", { unit: "mg/dL" }),
      createParameter("C-Peptide, Concurrent, if available", { unit: "ng/mL" }),
      createParameter("Fasting Duration / Collection Timing"),
      createParameter("Exogenous Insulin / Analog Treatment Details"),
      createParameter("Insulin Antibody Result, if available"),
      createParameter("Specimen", { normalRange: "Serum" }),
      createParameter("Method / Analyzer"),
      createParameter("Interpretation / Comments"),
    ];
  }

  if (["insulinmidnight", "midnightinsulin", "insulin0000"].includes(normalizedName)) {
    return [
      createParameter("Insulin, Serum - Midnight", { unit: "mcIU/mL", normalRange: "Laboratory-validated, collection-time and method-specific reference interval" }),
      createParameter("Verified Collection Date / Time"),
      createParameter("Glucose, Concurrent, if available", { unit: "mg/dL" }),
      createParameter("Fasting Duration / Study Protocol"),
      createParameter("C-Peptide, Concurrent, if available", { unit: "ng/mL" }),
      createParameter("Proinsulin, Concurrent, if available", { unit: "pmol/L" }),
      createParameter("Exogenous Insulin / Glucose-Altering Medication Details"),
      createParameter("Specimen", { normalRange: "Serum" }),
      createParameter("Method / Analyzer"),
      createParameter("Interpretation / Comments"),
    ];
  }

  if (["gastrinlevel", "gastrin", "serumgastrin"].includes(normalizedName)) {
    return [
      createParameter("Gastrin, Serum", { unit: "pg/mL", normalRange: "Laboratory-validated fasting reference interval" }),
      createParameter("Fasting Duration / Collection Time"),
      createParameter("Acid-Suppression Medication / PPI History"),
      createParameter("Gastrointestinal Motility Medication History"),
      createParameter("Specimen", { normalRange: "Serum" }),
      createParameter("Method / Analyzer"),
      createParameter("Clinical Context / Indication"),
      createParameter("Interpretation / Comments"),
    ];
  }

  if (["glucoserandom", "randomglucose", "randombloodglucose"].includes(normalizedName)) {
    return [
      createParameter("Random Plasma Glucose", { unit: "mg/dL", normalRange: "Laboratory-validated random glucose reference interval" }),
      createParameter("Collection Date / Time"),
      createParameter("Time Since Last Meal / Meal Context"),
      createParameter("Specimen", { normalRange: "Laboratory-validated plasma or serum specimen" }),
      createParameter("Method / Analyzer"),
      createParameter("Clinical Context / Symptoms, if provided"),
      createParameter("Interpretation / Comments"),
    ];
  }

  if (["gttglucosetolerancetest", "glucosetolerancetest", "oralglucosetolerancetest", "ogtt"].includes(normalizedName)) {
    return [
      createParameter("Fasting Plasma Glucose (0 Minute)", { unit: "mg/dL", normalRange: "Laboratory-validated, protocol-specific reference interval" }),
      createParameter("Glucose, 30 Minutes After Load, if collected", { unit: "mg/dL" }),
      createParameter("Glucose, 60 Minutes After Load, if collected", { unit: "mg/dL" }),
      createParameter("Glucose, 90 Minutes After Load, if collected", { unit: "mg/dL" }),
      createParameter("Glucose, 120 Minutes After Load, if collected", { unit: "mg/dL", normalRange: "Laboratory-validated, protocol-specific reference interval" }),
      createParameter("Glucose Load / Protocol"),
      createParameter("Fasting Duration / Collection Details"),
      createParameter("Specimen", { normalRange: "Laboratory-validated plasma or serum specimen" }),
      createParameter("Method / Analyzer"),
      createParameter("Pregnancy / Clinical Context, if applicable"),
      createParameter("Interpretation / Comments"),
    ];
  }

  if (["ghgrowthhormone", "growthhormone", "humangrowthhormone", "hgh", "somatotropin"].includes(normalizedName)) {
    return [
      createParameter("Growth Hormone (GH)", { unit: "ng/mL", normalRange: "Laboratory-validated age/sex- and method-specific reference interval" }),
      createParameter("Specimen", { normalRange: "Serum" }),
      createParameter("Collection Time / Fasting Status"),
      createParameter("Method / Analyzer"),
      createParameter("Age / Sex / Pubertal Status, if applicable"),
      createParameter("Clinical Context / Indication"),
      createParameter("Dynamic Testing Context, if applicable"),
      createParameter("Interpretation / Comments"),
    ];
  }

  if (["ghfastingglucose", "growthhormonefastingglucose", "fastinggrowthhormoneglucose"].includes(normalizedName)) {
    return [
      createParameter("Growth Hormone (GH), Fasting", { unit: "ng/mL", normalRange: "Laboratory-validated age/sex- and method-specific reference interval" }),
      createParameter("Fasting Plasma Glucose", { unit: "mg/dL", normalRange: "Laboratory-validated fasting glucose reference interval" }),
      createParameter("Fasting Duration / Collection Time"),
      createParameter("Specimen(s)", { normalRange: "Serum for GH; specimen validated by laboratory for glucose" }),
      createParameter("Method / Analyzer"),
      createParameter("Clinical Context / Indication"),
      createParameter("Interpretation / Comments"),
    ];
  }

  if (["gh90minutesafterglucose", "growthhormone90minutesafterglucose", "growthhormone90minafterglucose", "gh90minafterglucose"].includes(normalizedName)) {
    return [
      createParameter("Growth Hormone (GH), 90 Minutes After Glucose", { unit: "ng/mL", normalRange: "Laboratory-validated glucose-suppression protocol interpretation" }),
      createParameter("Glucose, 90 Minutes After Load, if measured", { unit: "mg/dL" }),
      createParameter("Time After Glucose Load", { normalRange: "90 minutes" }),
      createParameter("Glucose Load / Fasting Confirmation"),
      createParameter("Specimen", { normalRange: "Serum" }),
      createParameter("Method / Analyzer"),
      createParameter("Baseline GH / IGF-1, if available"),
      createParameter("Interpretation / Comments"),
    ];
  }

  if (["ggtgammagt", "gammaglutamyltransferaseggt", "gammaglutamyltransferase", "ggtp", "ggt"].includes(normalizedName)) {
    return [
      createParameter("Gamma-Glutamyl Transferase (GGT), Serum", { unit: "U/L", normalRange: "Laboratory-validated, age/sex- and method-specific reference interval" }),
      createParameter("Specimen", { normalRange: "Serum" }),
      createParameter("Method / Analyzer"),
      createParameter("Clinical Details / Relevant Medication History"),
      createParameter("Interpretation / Comments"),
    ];
  }

  if (["gad65antibody", "gad65ab", "gad65", "glutamicaciddecarboxylasegad65antibody", "gadantibody"].includes(normalizedName)) {
    return [
      createParameter("GAD65 Antibody", { normalRange: "Laboratory-validated, method-specific reference interval" }),
      createParameter("Assay Qualitative Interpretation, if reported"),
      createParameter("Specimen", { normalRange: "Serum" }),
      createParameter("Method / Analyzer"),
      createParameter("Clinical Context / Indication"),
      createParameter("Other Islet Autoantibodies, if ordered"),
      createParameter("Relevant Neurologic Autoantibody Context, if applicable"),
      createParameter("Interpretation / Comments"),
    ];
  }

  if (["funguscultureandsensitivity", "fungalcultureandsensitivity", "fungusculturesensitivity", "fungalculturesensitivity"].includes(normalizedName)) {
    return [
      createParameter("Specimen / Collection Site"),
      createParameter("Direct Microscopy / Stain, if performed"),
      createParameter("Culture Status (Preliminary / Final)"),
      createParameter("Culture Result", { normalRange: "Laboratory culture interpretation" }),
      createParameter("Organism(s) Isolated"),
      createParameter("Identification Method, if performed"),
      createParameter("Antifungal Susceptibility Method, if performed"),
      createParameter("Antifungal Agent / MIC or Category, if reported"),
      createParameter("Susceptibility Interpretation, if reported"),
      createParameter("Comments / Clinical Correlation"),
    ];
  }

  if (["fungusculture", "fungalculture", "mycologicalculture"].includes(normalizedName)) {
    return [
      createParameter("Specimen / Collection Site"),
      createParameter("Direct Microscopy / Stain, if performed"),
      createParameter("Culture Status (Preliminary / Final)"),
      createParameter("Culture Result", { normalRange: "Laboratory culture interpretation" }),
      createParameter("Organism(s) Isolated"),
      createParameter("Identification Method, if performed"),
      createParameter("Antifungal Susceptibility, if performed"),
      createParameter("Incubation / Report Status"),
      createParameter("Comments / Clinical Correlation"),
    ];
  }

  if (["freetestosterone", "testosteronefree", "freet", "freeandrogentestosterone"].includes(normalizedName)) {
    return [
      createParameter("Free Testosterone", { normalRange: "Laboratory-validated, age/sex- and method-specific reference interval" }),
      createParameter("Free Testosterone Method (Measured / Calculated)"),
      createParameter("Total Testosterone, if measured"),
      createParameter("Sex Hormone-Binding Globulin (SHBG), if measured"),
      createParameter("Albumin, if used for calculation"),
      createParameter("Specimen", { normalRange: "Serum" }),
      createParameter("Sex / Age / Pubertal or Menopausal Status"),
      createParameter("Collection Time / Hormone Therapy Details"),
      createParameter("Interpretation / Comments"),
    ];
  }

  if (["freepsa", "fpsa", "freeprostatespecificantigen", "freeprostateantigen"].includes(normalizedName)) {
    return [
      createParameter("Free PSA", { unit: "ng/mL", normalRange: "Laboratory-validated, method-specific reference interval" }),
      createParameter("Total PSA, same specimen", { unit: "ng/mL", normalRange: "Laboratory-validated, age- and method-specific reference interval" }),
      createParameter("Free PSA / Total PSA Ratio, if calculated"),
      createParameter("Percent Free PSA, if calculated", { unit: "%" }),
      createParameter("Specimen", { normalRange: "Serum" }),
      createParameter("Method / Analyzer"),
      createParameter("Age / Relevant Clinical Details"),
      createParameter("Interpretation / Comments"),
    ];
  }

  if (["freeestradiol", "estradiolfree", "freee2", "estradiolfreefraction"].includes(normalizedName)) {
    return [
      createParameter("Free Estradiol", { normalRange: "Laboratory-validated, age/sex- and method-specific reference interval" }),
      createParameter("Free Estradiol, Percent (if reported)"),
      createParameter("Total Estradiol (E2), if reported"),
      createParameter("Sex Hormone-Binding Globulin (SHBG), if reported"),
      createParameter("Specimen", { normalRange: "Serum" }),
      createParameter("Method / Analyzer"),
      createParameter("Sex / Age / Cycle Phase or Menopausal Status"),
      createParameter("Hormone Therapy / Relevant Clinical Details"),
      createParameter("Interpretation / Comments"),
    ];
  }

  if (["freecholesterol", "cholesterolfree", "nonesterifiedcholesterol", "unesterifiedcholesterol"].includes(normalizedName)) {
    return [
      createParameter("Free Cholesterol (Non-esterified)", { normalRange: "Laboratory-validated, method-specific reference interval" }),
      createParameter("Total Cholesterol, if measured"),
      createParameter("Cholesteryl Esters, if measured"),
      createParameter("Free / Total Cholesterol Ratio, if calculated"),
      createParameter("Specimen", { normalRange: "Serum or plasma, as validated by the laboratory" }),
      createParameter("Method / Analyzer"),
      createParameter("Fasting Status / Clinical Details"),
      createParameter("Interpretation / Comments"),
    ];
  }

  if (["freebetahcg", "freebetahcgquantitative", "freebhcg", "freebetahumanchorionicgonadotropin"].includes(normalizedName)) {
    return [
      createParameter("Free Beta hCG", { normalRange: "Laboratory-validated, gestational-age-specific reference interval" }),
      createParameter("Multiple of Median (MoM), if calculated"),
      createParameter("Specimen", { normalRange: "Serum" }),
      createParameter("Method / Analyzer"),
      createParameter("Gestational Age / Crown-Rump Length (if available)"),
      createParameter("Collection Date / Time"),
      createParameter("Screening Context / Adjustment Factors"),
      createParameter("Interpretation / Comments"),
    ];
  }

  if (["hbelectrophoresis", "hemoglobinelectrophoresis", "haemoglobinelectrophoresis", "hemoglobinopathyassessment", "haemoglobinopathyassessment"].includes(normalizedName)) {
    return [
      createParameter("Hemoglobin A (HbA)", { unit: "%", normalRange: "Laboratory-validated, age-specific reference interval" }),
      createParameter("Hemoglobin A2 (HbA2)", { unit: "%", normalRange: "Laboratory-validated, age-specific reference interval" }),
      createParameter("Hemoglobin F (HbF)", { unit: "%", normalRange: "Laboratory-validated, age-specific reference interval" }),
      createParameter("Hemoglobin S (HbS), if detected", { unit: "%" }),
      createParameter("Hemoglobin C (HbC), if detected", { unit: "%" }),
      createParameter("Hemoglobin E (HbE), if detected", { unit: "%" }),
      createParameter("Other Hemoglobin Fraction / Variant"),
      createParameter("Specimen", { normalRange: "EDTA whole blood" }),
      createParameter("Method / Analyzer"),
      createParameter("Age / Clinical Details"),
      createParameter("Transfusion History / Date of Last Transfusion"),
      createParameter("Interpretation / Comments"),
    ];
  }

  if (["foetalhaemoglobinbyhplc", "fetalhaemoglobinbyhplc", "fetalhemoglobinbyhplc", "hemoglobinfbyhplc", "haemoglobinfbyhplc"].includes(normalizedName)) {
    return [
      createParameter("Hemoglobin F (HbF)", { unit: "%", normalRange: "Laboratory-validated, age-specific reference interval" }),
      createParameter("Hemoglobin A (HbA), if measured", { unit: "%", normalRange: "Laboratory-validated, age-specific reference interval" }),
      createParameter("Hemoglobin A2 (HbA2), if measured", { unit: "%", normalRange: "Laboratory-validated, age-specific reference interval" }),
      createParameter("Other Hemoglobin Fraction / Variant Window"),
      createParameter("Specimen", { normalRange: "EDTA whole blood" }),
      createParameter("HPLC Analyzer / Program"),
      createParameter("Age / Gestational Age (if applicable)"),
      createParameter("Clinical Details / Transfusion History"),
      createParameter("Interpretation / Comments"),
    ];
  }

  if (["foetalhaemoglobin", "fetalhaemoglobin", "fetalhemoglobin", "hemoglobinf", "haemoglobinf"].includes(normalizedName)) {
    return [
      createParameter("Hemoglobin F (HbF)", { unit: "%", normalRange: "Laboratory-validated, age-specific reference interval" }),
      createParameter("Specimen", { normalRange: "EDTA whole blood" }),
      createParameter("Method / Analyzer"),
      createParameter("Age / Gestational Age (if applicable)"),
      createParameter("Hemoglobin A2 (HbA2), if measured", { unit: "%", normalRange: "Laboratory-validated, age-specific reference interval" }),
      createParameter("Other Hemoglobin Fractions / Variant Comment"),
      createParameter("Interpretation"),
      createParameter("Clinical Details / Transfusion History"),
      createParameter("Comments"),
    ];
  }

  if (["filariaantigen", "filarialantigen", "circulatingfilarialantigen"].includes(normalizedName)) {
    return [
      createParameter("Filarial Antigen", { normalRange: "Laboratory-validated qualitative interpretation" }),
      createParameter("Assay Target / Scope"),
      createParameter("Result Interpretation", { normalRange: "Detected / Not detected / Invalid" }),
      createParameter("Specimen", { normalRange: "Serum; confirm with assay instructions" }),
      createParameter("Collection Date / Time"),
      createParameter("Assay / Device / Kit"),
      createParameter("Quality Control / Validity"),
      createParameter("Microscopy / Microfilaria Correlation"),
      createParameter("Clinical Details / Indication"),
      createParameter("Comments"),
    ];
  }

  if (["filariawuchereriabancroftiantigenedtabloimmuno", "filariawuchereriabancroftiantigen", "wuchereriabancroftiantigen"].includes(normalizedName)) {
    return [
      createParameter("Wuchereria bancrofti Antigen", { normalRange: "Not detected" }),
      createParameter("Result Interpretation", { normalRange: "Detected / Not detected / Invalid" }),
      createParameter("Specimen", { normalRange: "EDTA whole blood" }),
      createParameter("Collection Date / Time"),
      createParameter("Assay / Device / Kit"),
      createParameter("Quality Control / Validity"),
      createParameter("Microscopy / Microfilaria Correlation"),
      createParameter("Clinical Details / Indication"),
      createParameter("Comments"),
    ];
  }

  if (["microfilaria", "microfilariae", "microfilarialsmear"].includes(normalizedName)) {
    return [
      createParameter("Microfilaria Detection Result", { normalRange: "Not seen / seen / indeterminate" }),
      createParameter("Species / Morphologic Identification, if possible"),
      createParameter("Microfilarial Density / Quantitation, if performed"),
      createParameter("Specimen / Blood Collection Time"),
      createParameter("Preparation / Stain / Method"),
      createParameter("Examination / Concentration Technique"),
      createParameter("Clinical / Travel / Endemic Exposure, if provided"),
      createParameter("Interpretation / Comments"),
    ];
  }

  if (["ferntest", "ferntestcollcharges10oextra", "cervicalmucusferning", "cervicalmucusferntest"].includes(normalizedName)) {
    return [
      createParameter("Specimen / Collection Site", { normalRange: "Cervical mucus; collection details as supplied" }),
      createParameter("Collection Date / Time"),
      createParameter("Menstrual Cycle Day / Last Menstrual Period"),
      createParameter("Fern Test Result", { normalRange: "Positive / Negative / Indeterminate; correlate with cycle context" }),
      createParameter("Ferning Pattern / Grade"),
      createParameter("Microscopy Remarks"),
      createParameter("Clinical Details / Indication"),
      createParameter("Method / Preparation"),
      createParameter("Comments"),
    ];
  }

  if (["factorviiimmunodepleted", "factorviiiimmunodepleted", "f8immunodepleted"].includes(normalizedName)) {
    return [
      createParameter("Assay / Immunodepletion Protocol"),
      createParameter("Factor VIII Activity (FVIII:C)", { unit: "%", normalRange: "Laboratory-validated assay reference interval" }),
      createParameter("Immunodepleted Plasma / Control Result"),
      createParameter("Inhibitor Screen / Mixing Study Result"),
      createParameter("Factor VIII Inhibitor Titre", { unit: "Bethesda Units/mL", normalRange: "Laboratory-validated assay interpretation" }),
      createParameter("Interpretation"),
      createParameter("Method / Analyzer"),
      createParameter("Comments"),
    ];
  }

  if (["factoriimutation", "prothrombinmutation", "f2mutation"].includes(normalizedName)) {
    return [
      createParameter("Target Variant / Assay", { normalRange: "Laboratory-validated assay target" }),
      createParameter("Genotype Result", { normalRange: "Detected / Not detected / Indeterminate" }),
      createParameter("Zygosity"),
      createParameter("Method / Platform"),
      createParameter("Interpretation"),
      createParameter("Test Limitations"),
      createParameter("Comments / Genetic Counselling"),
    ];
  }

  if (["fshlhprl", "fshlhprolactin", "fshlhandprl"].includes(normalizedName)) {
    return [
      createParameter("Follicle Stimulating Hormone (FSH), Serum", { unit: "mIU/mL", normalRange: "Laboratory-validated, sex- and phase-specific reference interval" }),
      createParameter("Luteinizing Hormone (LH), Serum", { unit: "mIU/mL", normalRange: "Laboratory-validated, sex- and phase-specific reference interval" }),
      createParameter("Prolactin (PRL), Serum", { unit: "ng/mL", normalRange: "Laboratory-validated, sex- and physiologic-state-specific reference interval" }),
      createParameter("Menstrual Cycle Phase / Physiologic State"),
      createParameter("Clinical Details / Medication History"),
      createParameter("Method / Analyzer"),
      createParameter("Comments"),
    ];
  }

  if (["lhfsh", "lhandfsh", "luteinizinghormonefolliclestimulatinghormone"].includes(normalizedName)) {
    return [
      createParameter("Luteinizing Hormone (LH), Serum", { unit: "mIU/mL", normalRange: "Laboratory-validated, sex- and phase-specific reference interval" }),
      createParameter("Follicle Stimulating Hormone (FSH), Serum", { unit: "mIU/mL", normalRange: "Laboratory-validated, sex- and phase-specific reference interval" }),
      createParameter("Menstrual Cycle Phase / Physiologic State"),
      createParameter("Clinical Details / Medication History"),
      createParameter("Method / Analyzer"),
      createParameter("Comments"),
    ];
  }

  if (["lhprl", "lhandprl", "luteinizinghormoneprolactin"].includes(normalizedName)) {
    return [
      createParameter("Luteinizing Hormone (LH), Serum", { unit: "mIU/mL", normalRange: "Laboratory-validated, sex- and phase-specific reference interval" }),
      createParameter("Prolactin (PRL), Serum", { unit: "ng/mL", normalRange: "Laboratory-validated, sex- and physiologic-state-specific reference interval" }),
      createParameter("Menstrual Cycle Phase / Physiologic State"),
      createParameter("Clinical Details / Medication History"),
      createParameter("Method / Analyzer"),
      createParameter("Comments"),
    ];
  }

  if (["leadlevelintroducing", "bloodleadlevel", "leadlevel", "leadpb"].includes(normalizedName)) {
    return [
      createParameter("Lead (Pb), Whole Blood", { unit: "µg/dL", normalRange: "Report with specimen type; interpret using applicable laboratory and public-health guidance" }),
      createParameter("Specimen Type / Collection Method", { normalRange: "State venous or capillary whole-blood collection" }),
      createParameter("Clinical / Occupational / Environmental Exposure History"),
      createParameter("Method / Analyzer"),
      createParameter("Comments"),
    ];
  }

  if (["femaleinfertilityprofile", "femaleinfertilitypanel", "infertilityprofilefemale"].includes(normalizedName)) {
    return [
      createParameter("Follicle Stimulating Hormone (FSH), Serum", { unit: "mIU/mL", normalRange: "Laboratory-validated, sex- and phase-specific reference interval" }),
      createParameter("Luteinizing Hormone (LH), Serum", { unit: "mIU/mL", normalRange: "Laboratory-validated, sex- and phase-specific reference interval" }),
      createParameter("Estradiol (E2), Serum", { unit: "pg/mL", normalRange: "Laboratory-validated, sex- and phase-specific reference interval" }),
      createParameter("Anti-Mullerian Hormone (AMH), Serum", { unit: "ng/mL", normalRange: "Laboratory-validated, age- and assay-specific reference interval" }),
      createParameter("Thyroid Stimulating Hormone (TSH), Serum", { unit: "mIU/L", normalRange: "Laboratory-validated reference interval" }),
      createParameter("Prolactin (PRL), Serum", { unit: "ng/mL", normalRange: "Laboratory-validated, sex- and physiologic-state-specific reference interval" }),
      createParameter("Progesterone, Serum", { unit: "ng/mL", normalRange: "Laboratory-validated, cycle-day-specific reference interval" }),
      createParameter("Menstrual Cycle Day / Physiologic State"),
      createParameter("Clinical Details / Medication History"),
      createParameter("Method / Analyzer"),
      createParameter("Comments"),
    ];
  }

  if (["ovarianfunctionprofile", "ovarianfunctionpanel", "ovarianreserveprofile"].includes(normalizedName)) {
    return [
      createParameter("Follicle Stimulating Hormone (FSH), Serum", { unit: "mIU/mL", normalRange: "Laboratory-validated, age- and cycle-phase-specific reference interval" }),
      createParameter("Luteinizing Hormone (LH), Serum", { unit: "mIU/mL", normalRange: "Laboratory-validated, age- and cycle-phase-specific reference interval" }),
      createParameter("Estradiol (E2), Serum", { unit: "pg/mL", normalRange: "Laboratory-validated, age- and cycle-phase-specific reference interval" }),
      createParameter("Anti-Mullerian Hormone (AMH), Serum, if ordered", { unit: "ng/mL", normalRange: "Laboratory-validated, age- and assay-specific reference interval" }),
      createParameter("Progesterone, Serum, if ordered", { unit: "ng/mL", normalRange: "Laboratory-validated, cycle-day-specific reference interval" }),
      createParameter("Menstrual Cycle Day / Physiologic State"),
      createParameter("Hormonal Therapy / Relevant Medication Details, if provided"),
      createParameter("Collection Date / Time"),
      createParameter("Method / Analyzer"),
      createParameter("Interpretation / Comments"),
    ];
  }

  if (["oxygenforeachdayafter1st3days", "oxygeneachdayafterfirst3days", "oxygendailyafter3days"].includes(normalizedName)) {
    return [
      createParameter("Service Date"),
      createParameter("Oxygen Delivery Interface"),
      createParameter("Prescribed Flow / Concentration"),
      createParameter("Duration of Oxygen Administration"),
      createParameter("Monitoring / Observation, if recorded"),
      createParameter("Clinical / Billing Remarks"),
    ];
  }

  if (["oxygen3days", "oxygen3day", "oxygenforthreedays"].includes(normalizedName)) {
    return [
      createParameter("Start Date / Time"),
      createParameter("End Date / Time"),
      createParameter("Oxygen Delivery Interface"),
      createParameter("Prescribed Flow / Concentration"),
      createParameter("Total Duration of Oxygen Administration"),
      createParameter("Monitoring / Observation, if recorded"),
      createParameter("Clinical / Billing Remarks"),
    ];
  }

  if (["pancaantipr3", "pancaantiproteinase3", "perinuclearancapr3"].includes(normalizedName)) {
    return [
      createParameter("P-ANCA Pattern, if performed", { normalRange: "Negative by the laboratory-validated indirect immunofluorescence method" }),
      createParameter("PR3-ANCA Antibody Result", { unit: "IU/mL", normalRange: "Laboratory-validated assay-specific reference interval" }),
      createParameter("PR3-ANCA Interpretation"),
      createParameter("MPO-ANCA Result, if performed", { unit: "IU/mL", normalRange: "Laboratory-validated assay-specific reference interval" }),
      createParameter("Assay / Method"),
      createParameter("Clinical Correlation / Comments"),
    ];
  }

  if (["praplasmareninactivity", "plasmareninactivity", "pra"].includes(normalizedName)) {
    return [
      createParameter("Plasma Renin Activity (PRA)", { unit: "ng/mL/hour", normalRange: "Laboratory-validated, posture-, age-, and collection-condition-specific reference interval" }),
      createParameter("Patient Posture / Collection Conditions"),
      createParameter("Collection Date / Time"),
      createParameter("Sodium Intake / Diet Information, if provided"),
      createParameter("Antihypertensive / Interfering Medication Details"),
      createParameter("Method / Analyzer"),
      createParameter("Interpretation / Comments"),
    ];
  }

  if (["psaprostatespecificantigen", "prostatespecificantigen", "psatotal"].includes(normalizedName)) {
    return [
      createParameter("Prostate Specific Antigen (PSA), Total", { unit: "ng/mL", normalRange: "Laboratory-validated, age- and assay-specific reference interval" }),
      createParameter("Previous PSA / Collection Date, if available"),
      createParameter("Relevant Clinical History, if provided"),
      createParameter("Method / Analyzer"),
      createParameter("Interpretation / Comments"),
    ];
  }

  if (["pthparathyroidhormone", "pthintactmolecule", "intactparathyroidhormone", "intactpth"].includes(normalizedName)) {
    return [
      createParameter("Parathyroid Hormone (PTH), Intact", { unit: "pg/mL", normalRange: "Laboratory-validated assay-specific reference interval" }),
      createParameter("Calcium, Concurrent, if available", { unit: "mg/dL", normalRange: "Laboratory-validated reference interval" }),
      createParameter("Albumin, Concurrent, if available", { unit: "g/dL", normalRange: "Laboratory-validated reference interval" }),
      createParameter("Phosphorus, Concurrent, if available", { unit: "mg/dL", normalRange: "Laboratory-validated reference interval" }),
      createParameter("25-Hydroxy Vitamin D, if available", { unit: "ng/mL", normalRange: "Laboratory-validated reference interval" }),
      createParameter("Creatinine / eGFR, if available"),
      createParameter("Method / Analyzer"),
      createParameter("Interpretation / Comments"),
    ];
  }

  if (["puoworkupprofile", "puoworkup", "feverofunknownoriginworkup"].includes(normalizedName)) {
    return [
      createParameter("Complete Blood Count (CBC), if performed"),
      createParameter("ESR / CRP, if performed"),
      createParameter("Blood Culture(s), if performed"),
      createParameter("Urine Routine / Culture, if performed"),
      createParameter("Liver / Renal Function Tests, if performed"),
      createParameter("Targeted Serology / Molecular Tests, if performed"),
      createParameter("Imaging / Other Investigation Correlation, if provided"),
      createParameter("Clinical Summary / Duration of Fever"),
      createParameter("Interpretation / Comments"),
    ];
  }

  if (["pusafbstain", "pusacidfastbacillistain", "afbstainpus"].includes(normalizedName)) {
    return [
      createParameter("Specimen / Aspiration Site"),
      createParameter("AFB Smear Microscopy Result", { normalRange: "No acid-fast bacilli seen" }),
      createParameter("AFB Smear Grade / Quantitation"),
      createParameter("Stain Method"),
      createParameter("Specimen Adequacy / Volume"),
      createParameter("Culture / Molecular Test Status"),
      createParameter("Microscopy Remarks / Comments"),
    ];
  }

  if (["pusculturesensitivity", "puscultureandsensitivity", "puscs", "pusculture"].includes(normalizedName)) {
    return [
      createParameter("Specimen / Collection Site"),
      createParameter("Direct Microscopy / Gram Stain, if performed"),
      createParameter("Culture Growth Result"),
      createParameter("Organism(s) Isolated"),
      createParameter("Colony Count / Growth Quantity, if reported"),
      createParameter("Antimicrobial Susceptibility Result"),
      createParameter("Method / Incubation Conditions"),
      createParameter("Additional Comments / Clinical Correlation"),
    ];
  }

  if (["swabculturesensitivityforanysiteswab", "anysiteswabculturesensitivity", "swabculturesensitivity"].includes(normalizedName)) {
    return [
      createParameter("Swab Collection Site / Anatomical Source"),
      createParameter("Specimen / Collection Details"),
      createParameter("Specimen Quality / Transport Notes"),
      createParameter("Direct Microscopy / Gram Stain, if performed"),
      createParameter("Culture Growth Result", { normalRange: "No growth / as per laboratory reporting policy" }),
      createParameter("Organism(s) Isolated"),
      createParameter("Growth Quantity / Predominance, if reported"),
      createParameter("Antimicrobial Susceptibility Result, if performed"),
      createParameter("Anaerobic / Fungal / Special Culture Correlation, if requested"),
      createParameter("Method / Incubation Conditions, if recorded"),
      createParameter("Laboratory Interpretation / Comments"),
      createParameter("Clinical Correlation / Follow-up, if indicated"),
    ];
  }

  if (["pusgramstain", "pusgramstaining", "gramstainpus"].includes(normalizedName)) {
    return [
      createParameter("Specimen / Collection Site"),
      createParameter("Smear Quality / Specimen Adequacy"),
      createParameter("Pus Cells / Polymorphs"),
      createParameter("Gram Positive Cocci, if seen"),
      createParameter("Gram Negative Bacilli, if seen"),
      createParameter("Other Organisms / Morphology, if seen"),
      createParameter("Epithelial Cells / Background Material"),
      createParameter("Culture Correlation / Status, if performed"),
      createParameter("Microscopy Remarks / Comments"),
    ];
  }

  if (["peritonealfluidchloride", "asciticfluidchloride", "chlorideperitonealfluid"].includes(normalizedName)) {
    return [
      createParameter("Peritoneal Fluid Chloride", { unit: "mmol/L", normalRange: "Laboratory-validated fluid-specific reference interval, if established" }),
      createParameter("Specimen / Collection Site"),
      createParameter("Concurrent Serum Chloride, if available", { unit: "mmol/L", normalRange: "Laboratory-validated serum reference interval" }),
      createParameter("Gross Appearance / Specimen Quality, if recorded"),
      createParameter("Method / Analyzer"),
      createParameter("Clinical Details / Indication"),
      createParameter("Interpretation / Comments"),
    ];
  }

  if (["peritonealfluidgramstain", "asciticfluidgramstain", "gramstainperitonealfluid"].includes(normalizedName)) {
    return [
      createParameter("Specimen / Collection Site"),
      createParameter("Smear Quality / Specimen Adequacy"),
      createParameter("Polymorphs / Inflammatory Cells"),
      createParameter("Gram Positive Organisms, if seen"),
      createParameter("Gram Negative Organisms, if seen"),
      createParameter("Other Organisms / Morphology, if seen"),
      createParameter("Background Material / Epithelial Cells"),
      createParameter("Culture Correlation / Status, if performed"),
      createParameter("Microscopy Remarks / Comments"),
    ];
  }

  if (["peritonealfluidldh", "asciticfluidldh", "ldhperitonealfluid"].includes(normalizedName)) {
    return [
      createParameter("Peritoneal Fluid LDH", { unit: "U/L", normalRange: "Laboratory-validated fluid-specific reference interval, if established" }),
      createParameter("Specimen / Collection Site"),
      createParameter("Concurrent Serum LDH, if available", { unit: "U/L", normalRange: "Laboratory-validated serum reference interval" }),
      createParameter("Fluid / Serum LDH Ratio, if calculated"),
      createParameter("Gross Appearance / Specimen Quality, if recorded"),
      createParameter("Method / Analyzer"),
      createParameter("Clinical Details / Indication"),
      createParameter("Interpretation / Comments"),
    ];
  }

  if (["peritonealfluidprotein", "asciticfluidprotein", "proteinperitonealfluid"].includes(normalizedName)) {
    return [
      createParameter("Peritoneal Fluid Total Protein", { unit: "g/dL", normalRange: "Laboratory-validated fluid-specific reference interval, if established" }),
      createParameter("Specimen / Collection Site"),
      createParameter("Concurrent Serum Total Protein, if available", { unit: "g/dL", normalRange: "Laboratory-validated serum reference interval" }),
      createParameter("Fluid / Serum Protein Ratio, if calculated"),
      createParameter("Gross Appearance / Specimen Quality, if recorded"),
      createParameter("Method / Analyzer"),
      createParameter("Clinical Details / Indication"),
      createParameter("Interpretation / Comments"),
    ];
  }

  if (["peritonealfluidsugar", "peritonealfluidglucose", "asciticfluidsugar", "asciticfluidglucose", "glucoseperitonealfluid"].includes(normalizedName)) {
    return [
      createParameter("Peritoneal Fluid Glucose", { unit: "mg/dL", normalRange: "Laboratory-validated fluid-specific reference interval, if established" }),
      createParameter("Specimen / Collection Site"),
      createParameter("Concurrent Serum / Plasma Glucose, if available", { unit: "mg/dL", normalRange: "Laboratory-validated serum / plasma reference interval" }),
      createParameter("Fluid / Serum Glucose Ratio, if calculated"),
      createParameter("Fasting Status / Collection Context, if supplied"),
      createParameter("Gross Appearance / Specimen Quality, if recorded"),
      createParameter("Method / Analyzer"),
      createParameter("Clinical Details / Indication"),
      createParameter("Interpretation / Comments"),
    ];
  }

  if (["peritonealfluidforspecificgravity", "peritonealfluidspecificgravity", "asciticfluidspecificgravity", "specificgravityperitonealfluid"].includes(normalizedName)) {
    return [
      createParameter("Peritoneal Fluid Specific Gravity", { normalRange: "Laboratory-validated fluid-specific reference interval, if established" }),
      createParameter("Specimen / Collection Site"),
      createParameter("Method / Analyzer"),
      createParameter("Measurement Conditions / Temperature, if applicable"),
      createParameter("Gross Appearance / Specimen Quality, if recorded"),
      createParameter("Associated Fluid Studies / Accession, if available"),
      createParameter("Clinical Details / Indication"),
      createParameter("Interpretation / Comments"),
    ];
  }

  if (["pertussis", "bordetellapertussis", "whoopingcough"].includes(normalizedName)) {
    return [
      createParameter("Bordetella pertussis Result", { normalRange: "Detected / Not detected / Indeterminate, as reported" }),
      createParameter("Specimen Type / Collection Site", { normalRange: "Nasopharyngeal swab / aspirate, as received" }),
      createParameter("Method / Assay"),
      createParameter("Other Bordetella Targets / Species, if included"),
      createParameter("Specimen Adequacy / Quality"),
      createParameter("Culture Correlation / Status, if performed"),
      createParameter("Clinical Details / Symptom Duration, if supplied"),
      createParameter("Interpretation / Comments"),
    ];
  }

  if (["phenytoindilantin", "phenytoin", "dilantin"].includes(normalizedName)) {
    return [
      createParameter("Phenytoin, Total", { unit: "µg/mL", normalRange: "Laboratory-validated therapeutic / reference interval" }),
      createParameter("Specimen Type"),
      createParameter("Collection Time Relative to Last Dose"),
      createParameter("Last Dose Date / Time"),
      createParameter("Dose / Dosing Regimen, if supplied"),
      createParameter("Serum Albumin, if available", { unit: "g/dL", normalRange: "Laboratory-validated serum reference interval" }),
      createParameter("Phenytoin, Free, if performed", { unit: "µg/mL", normalRange: "Laboratory-validated therapeutic / reference interval" }),
      createParameter("Method / Analyzer"),
      createParameter("Interpretation / Comments"),
    ];
  }

  if (normalizedName === "phospholipid") {
    return [
      createParameter("Total Phospholipids", { unit: "mg/dL", normalRange: "Laboratory-validated serum reference interval" }),
      createParameter("Specimen Type"),
      createParameter("Fasting Status, if supplied"),
      createParameter("Total Cholesterol, if available", { unit: "mg/dL", normalRange: "Laboratory-validated serum reference interval" }),
      createParameter("Triglycerides, if available", { unit: "mg/dL", normalRange: "Laboratory-validated serum reference interval" }),
      createParameter("Method / Analyzer"),
      createParameter("Clinical Details / Indication"),
      createParameter("Interpretation / Comments"),
    ];
  }

  if (["phospholipidantibodyiggaplag", "phospholipidantibodyigg"].includes(normalizedName)) {
    return [
      createParameter("Anticardiolipin Antibody IgG, Serum", { unit: "GPL-U/mL", normalRange: "< 15.0" }),
      createParameter("Result Interpretation", { normalRange: "Negative / equivocal / positive, as validated by the laboratory" }),
      createParameter("Specimen Type"),
      createParameter("Method / Assay"),
      createParameter("Other Antiphospholipid Antibodies, if available"),
      createParameter("Clinical Details / Indication"),
      createParameter("Prior Result / Repeat Testing Context, if supplied"),
      createParameter("Comments"),
    ];
  }

  if (["phospholipidantibodyigmaplam", "phospholipidantibodyigm"].includes(normalizedName)) {
    return [
      createParameter("Anticardiolipin Antibody IgM, Serum", { unit: "MPL-U/mL", normalRange: "< 15.0" }),
      createParameter("Result Interpretation", { normalRange: "Negative / equivocal / positive, as validated by the laboratory" }),
      createParameter("Specimen Type"),
      createParameter("Method / Assay"),
      createParameter("Other Antiphospholipid Antibodies, if available"),
      createParameter("Clinical Details / Indication"),
      createParameter("Prior Result / Repeat Testing Context, if supplied"),
      createParameter("Comments"),
    ];
  }

  if (["phosphorus24hrsurine", "phosphorus24hoursurine", "phosphorus24hoururine", "phosphorus24hrurine", "phosphate24hoururine", "urinephosphorus24hour"].includes(normalizedName)) {
    return [
      createParameter("Phosphorus, 24-Hour Urine", { unit: "mg/24 h", normalRange: "Laboratory-validated age- and method-specific reference interval" }),
      createParameter("Urine Phosphorus Concentration, if reported", { unit: "mg/dL" }),
      createParameter("Total 24-Hour Urine Volume", { unit: "mL", normalRange: "Required for 24-hour excretion calculation" }),
      createParameter("Collection Duration", { unit: "hours", normalRange: "24 hours, unless otherwise stated" }),
      createParameter("Urine Creatinine, 24-Hour, if available", { unit: "mg/24 h", normalRange: "Laboratory-validated reference interval" }),
      createParameter("Serum Phosphorus, if available", { unit: "mg/dL", normalRange: "Laboratory-validated serum reference interval" }),
      createParameter("Method / Analyzer"),
      createParameter("Clinical Details / Indication"),
      createParameter("Interpretation / Comments"),
    ];
  }

  if (["plasma02contentsp02", "plasmao2contentspo2", "plasmao2contentpo2", "oxygencontent", "bloodoxygencontent", "o2content"].includes(normalizedName)) {
    return [
      createParameter("Oxygen Content (ctO2)", { unit: "mL/dL", normalRange: "Laboratory-validated, specimen-source-specific reference interval" }),
      createParameter("Partial Pressure of Oxygen (pO2), if performed", { unit: "mmHg", normalRange: "Laboratory-validated, specimen-source-specific reference interval" }),
      createParameter("Oxygen Saturation, if performed", { unit: "%", normalRange: "Laboratory-validated, specimen-source-specific reference interval" }),
      createParameter("Total Hemoglobin, if available", { unit: "g/dL", normalRange: "Laboratory-validated reference interval" }),
      createParameter("Specimen Source / Type", { normalRange: "State arterial, venous, or mixed venous whole blood" }),
      createParameter("Inspired Oxygen / Oxygen Therapy, if supplied"),
      createParameter("Collection and Analysis Time, if supplied"),
      createParameter("Method / Analyzer"),
      createParameter("Clinical Details / Indication"),
      createParameter("Interpretation / Comments"),
    ];
  }

  if (["pleuralfluidspecificgravity", "specificgravitypleuralfluid"].includes(normalizedName)) {
    return [
      createParameter("Pleural Fluid Specific Gravity", { normalRange: "Laboratory-validated fluid-specific reference interval, if established" }),
      createParameter("Specimen / Collection Site"),
      createParameter("Method / Analyzer"),
      createParameter("Measurement Conditions / Temperature, if applicable"),
      createParameter("Gross Appearance / Specimen Quality, if recorded"),
      createParameter("Associated Pleural / Serum Studies, if available"),
      createParameter("Clinical Details / Indication"),
      createParameter("Interpretation / Comments"),
    ];
  }

  if (["pleuralfluidforprotein", "pleuralfluidprotein", "proteinpleuralfluid"].includes(normalizedName)) {
    return [
      createParameter("Pleural Fluid Total Protein", { unit: "g/dL", normalRange: "Laboratory-validated fluid-specific reference interval, if established" }),
      createParameter("Specimen / Collection Site"),
      createParameter("Concurrent Serum Total Protein, if available", { unit: "g/dL", normalRange: "Laboratory-validated serum reference interval" }),
      createParameter("Pleural Fluid / Serum Protein Ratio, if calculated"),
      createParameter("Pleural / Serum LDH Studies, if available"),
      createParameter("Gross Appearance / Specimen Quality, if recorded"),
      createParameter("Method / Analyzer"),
      createParameter("Clinical Details / Indication"),
      createParameter("Interpretation / Comments"),
    ];
  }

  if (["pleuralfluidforsugar", "pleuralfluidsugar", "pleuralfluidglucose", "glucosepleuralfluid"].includes(normalizedName)) {
    return [
      createParameter("Pleural Fluid Glucose", { unit: "mg/dL", normalRange: "Laboratory-validated fluid-specific reference interval, if established" }),
      createParameter("Specimen / Collection Site"),
      createParameter("Concurrent Serum / Plasma Glucose, if available", { unit: "mg/dL", normalRange: "Laboratory-validated serum / plasma reference interval" }),
      createParameter("Pleural Fluid / Serum Glucose Ratio, if calculated"),
      createParameter("Fasting Status / Collection Context, if supplied"),
      createParameter("Pleural pH / LDH Studies, if available"),
      createParameter("Gross Appearance / Specimen Quality, if recorded"),
      createParameter("Method / Analyzer"),
      createParameter("Clinical Details / Indication"),
      createParameter("Interpretation / Comments"),
    ];
  }

  if (["postcoitaltest", "postcoital", "pct"].includes(normalizedName)) {
    return [
      createParameter("Specimen Type / Collection Site", { normalRange: "Cervical mucus, vaginal mucus, or both, as received" }),
      createParameter("Cycle Day / Ovulation Context, if supplied"),
      createParameter("Interval Since Intercourse, if supplied", { unit: "hours" }),
      createParameter("Specimen Adequacy / Volume"),
      createParameter("Mucus Appearance / Consistency"),
      createParameter("Spinnbarkeit / Stretchability, if assessed"),
      createParameter("Ferning Pattern, if assessed"),
      createParameter("pH, if measured"),
      createParameter("Sperm Seen on Microscopy"),
      createParameter("Sperm Motility"),
      createParameter("Motile Sperm Count / High-Power Field, if reported"),
      createParameter("Other Microscopic Findings / Cells"),
      createParameter("Interpretation / Comments"),
    ];
  }

  if (["potassium24hoururine", "potassium24hrurine", "potassium24hoururine", "urinepotassium24hour"].includes(normalizedName)) {
    return [
      createParameter("Potassium, 24-Hour Urine", { unit: "mmol/24 h", normalRange: "Laboratory-validated age- and method-specific reference interval" }),
      createParameter("Urine Potassium Concentration, if reported", { unit: "mmol/L" }),
      createParameter("Total 24-Hour Urine Volume", { unit: "mL", normalRange: "Required for 24-hour excretion calculation" }),
      createParameter("Collection Duration", { unit: "hours", normalRange: "24 hours, unless otherwise stated" }),
      createParameter("Urine Creatinine, 24-Hour, if available", { unit: "mg/24 h", normalRange: "Laboratory-validated reference interval" }),
      createParameter("Serum Potassium, if available", { unit: "mmol/L", normalRange: "Laboratory-validated serum reference interval" }),
      createParameter("Method / Analyzer"),
      createParameter("Medication / Supplement History, if supplied"),
      createParameter("Interpretation / Comments"),
    ];
  }

  if (["potassiumrandam", "potassiumrandom", "randomurinepotassium", "potassiumrandomurine"].includes(normalizedName)) {
    return [
      createParameter("Urine Potassium, Random", { unit: "mmol/L", normalRange: "Laboratory-validated random-urine reference interval, if established" }),
      createParameter("Urine Creatinine, Random, if available", { unit: "mg/dL", normalRange: "Laboratory-validated reference interval" }),
      createParameter("Potassium / Creatinine Ratio, if calculated"),
      createParameter("Specimen Collection Time / Context, if supplied"),
      createParameter("Specimen Quality / Concentration Context, if recorded"),
      createParameter("Serum Potassium, if available", { unit: "mmol/L", normalRange: "Laboratory-validated serum reference interval" }),
      createParameter("Method / Analyzer"),
      createParameter("Medication / Supplement History, if supplied"),
      createParameter("Interpretation / Comments"),
    ];
  }

  if (["preemploymentcheckup", "preemploymentmedicalcheckup", "preemploymentcheck"].includes(normalizedName)) {
    return [
      createParameter("Employer / Organization, if supplied"),
      createParameter("Job Role / Exposure Context, if supplied"),
      createParameter("Specimens / Collection Details"),
      createParameter("Complete Blood Count (CBC), if requested"),
      createParameter("Urinalysis / Urine Routine, if requested"),
      createParameter("Blood Glucose, if requested"),
      createParameter("Other Requested Laboratory Tests / Results"),
      createParameter("Abnormal Results / Laboratory Comments"),
      createParameter("Laboratory Report Summary"),
      createParameter("Authorized Medical Fitness Opinion, if issued separately"),
    ];
  }

  if (["precancerearlydetectionoforal", "oralprecancerearlydetection", "oralearlydetection"].includes(normalizedName)) {
    return [
      createParameter("Clinical Indication / Presenting Concern, if supplied"),
      createParameter("Risk Exposure History, if supplied"),
      createParameter("Oral Site / Lesion Location, if supplied"),
      createParameter("Visual Oral Examination Findings"),
      createParameter("Lesion Description / Morphology, if observed"),
      createParameter("Adjunctive Screening Test / Method, if performed"),
      createParameter("Specimen / Cytology / Biopsy Reference, if submitted"),
      createParameter("Screening Assessment / Impression"),
      createParameter("Referral / Further Evaluation Recommendation"),
      createParameter("Limitations / Laboratory Comments"),
      createParameter("Authorized Clinical / Pathology Diagnosis, if issued separately"),
    ];
  }

  if (["pregnancyelisatest", "pregnancyelisa", "hcgelisa"].includes(normalizedName)) {
    return [
      createParameter("hCG Qualitative Result"),
      createParameter("hCG Concentration, if quantitative", { unit: "IU/L", normalRange: "Laboratory-validated reference interval / decision limit" }),
      createParameter("Laboratory Interpretation"),
      createParameter("Specimen Type"),
      createParameter("Last Menstrual Period / Gestational Age, if supplied"),
      createParameter("Test Method / ELISA Kit"),
      createParameter("Repeat Test / Follow-up Recommendation, if indicated"),
      createParameter("Analytical Limitations / Interference, if relevant"),
      createParameter("Comments"),
    ];
  }

  if (["rbcwbcmorphology", "redcellwhitecellmorphology", "rbcwbcsmear"].includes(normalizedName)) {
    return [
      createParameter("Specimen / Film Preparation"),
      createParameter("Stain / Review Method"),
      createParameter("Film Quality / Adequacy"),
      createParameter("Red Cell Size / Chromia"),
      createParameter("Red Cell Shape / Poikilocytosis"),
      createParameter("Red Cell Inclusions / Polychromasia"),
      createParameter("Nucleated Red Cells, if present"),
      createParameter("White Cell Count / Differential Correlation, if available"),
      createParameter("White Cell Morphology"),
      createParameter("Immature Cells / Blasts, if seen"),
      createParameter("Platelet Estimate / Morphology"),
      createParameter("Hemoparasites / Other Significant Findings, if seen"),
      createParameter("Morphology Impression / Comments"),
      createParameter("Further Evaluation Recommendation, if indicated"),
    ];
  }

  if (["rbcfragilitytest", "redcellfragilitytest"].includes(normalizedName)) {
    return [
      createParameter("Specimen / Anticoagulant"),
      createParameter("Unincubated Osmotic Fragility / Hemolysis"),
      createParameter("Incubated Osmotic Fragility / Hemolysis"),
      createParameter("Sodium Chloride Concentration(s) / Hemolysis Results"),
      createParameter("Patient / Shipping Control Status"),
      createParameter("Peripheral Smear Correlation, if performed"),
      createParameter("Recent Transfusion / Clinical Context, if provided"),
      createParameter("Method / Incubation Conditions"),
      createParameter("Interpretation / Comments"),
    ];
  }

  if (["rectalswabgramstain", "rectalgramstain", "gramstainrectalswab"].includes(normalizedName)) {
    return [
      createParameter("Specimen / Transport Medium"),
      createParameter("Specimen Quality / Adequacy"),
      createParameter("Polymorphonuclear Cells / Inflammatory Cells"),
      createParameter("Gram-Positive Organisms, if seen"),
      createParameter("Gram-Negative Organisms, if seen"),
      createParameter("Yeast / Other Organisms, if seen"),
      createParameter("Background Flora / Mixed Morphotypes"),
      createParameter("Direct Gram Stain Interpretation"),
      createParameter("Culture / NAAT Correlation or Recommendation, if indicated"),
      createParameter("Comments"),
    ];
  }

  if (["renalkidneyprofile", "renalprofile", "kidneyprofile"].includes(normalizedName)) {
    return [
      createParameter("Serum Creatinine", { unit: "mg/dL", normalRange: "Laboratory-validated age- and sex-specific reference interval" }),
      createParameter("Estimated GFR (eGFR)", { unit: "mL/min/1.73 m²", normalRange: "Report the laboratory-validated equation and interpretation" }),
      createParameter("Blood Urea Nitrogen (BUN) / Urea"),
      createParameter("Sodium"),
      createParameter("Potassium"),
      createParameter("Chloride"),
      createParameter("Bicarbonate / Total CO₂"),
      createParameter("Calcium, if ordered"),
      createParameter("Phosphorus, if ordered"),
      createParameter("Serum Albumin, if ordered"),
      createParameter("Uric Acid, if ordered"),
      createParameter("Urine Albumin-Creatinine Ratio (ACR), if ordered"),
      createParameter("Urinalysis / Urine Protein Findings, if ordered"),
      createParameter("Method / Analyzer"),
      createParameter("Laboratory Interpretation / Comments"),
    ];
  }

  if (["respiratorysyncytialvirusrsv", "respiratorysyncytialvirus", "rsv"].includes(normalizedName)) {
    return [
      createParameter("Specimen Type / Collection Site"),
      createParameter("Test Method / Platform"),
      createParameter("RSV Result"),
      createParameter("RSV Subtype, if reported"),
      createParameter("Target / Ct Value, if applicable"),
      createParameter("Internal / Procedural Control"),
      createParameter("Result Validity"),
      createParameter("Laboratory Interpretation / Comments"),
    ];
  }

  if (["reviewforhistologyslide", "histologyslidereview", "histologyslidereview"].includes(normalizedName)) {
    return [
      createParameter("Original Case / Accession Number, if supplied"),
      createParameter("Referring Laboratory / Pathologist, if supplied"),
      createParameter("Clinical History / Question for Review"),
      createParameter("Specimen / Site"),
      createParameter("Material Received / Slides Reviewed"),
      createParameter("Original Diagnosis / Report Summary, if supplied"),
      createParameter("Microscopic Review Findings"),
      createParameter("Ancillary Studies / Additional Material Reviewed"),
      createParameter("Review Diagnosis / Opinion"),
      createParameter("Concordance with Original Report"),
      createParameter("Recommendations / Additional Studies"),
      createParameter("Limitations / Comments"),
    ];
  }

  if (["rheumaticfeverprofile", "acuterheumaticfeverprofile", "arfprofile"].includes(normalizedName)) {
    return [
      createParameter("Clinical History / Timing of Preceding Infection, if supplied"),
      createParameter("Antistreptolysin O (ASO) Titer, if ordered"),
      createParameter("Anti-DNase B Antibody, if ordered"),
      createParameter("Group A Streptococcus Throat Test / Culture, if performed"),
      createParameter("Erythrocyte Sedimentation Rate (ESR), if ordered"),
      createParameter("C-Reactive Protein (CRP), if ordered"),
      createParameter("Complete Blood Count / Leukocyte Count, if ordered"),
      createParameter("Other Streptococcal Antibody / Microbiology Results, if performed"),
      createParameter("Electrocardiogram / Echocardiography Reference, if supplied"),
      createParameter("Clinical Jones-Criteria Information, if supplied"),
      createParameter("Laboratory Summary / Comments"),
      createParameter("Authorized Clinical Diagnosis / Management Plan, if issued separately"),
    ];
  }

  if (["rheumatoidprofile", "rheumatoidarthritisprofile", "raprofile"].includes(normalizedName)) {
    return [
      createParameter("Clinical History / Joint Symptoms, if supplied"),
      createParameter("Rheumatoid Factor (RF)"),
      createParameter("Anti-Cyclic Citrullinated Peptide (Anti-CCP) Antibody"),
      createParameter("Erythrocyte Sedimentation Rate (ESR), if ordered"),
      createParameter("C-Reactive Protein (CRP), if ordered"),
      createParameter("Antinuclear Antibody (ANA), if ordered"),
      createParameter("Complete Blood Count, if ordered"),
      createParameter("Uric Acid, if ordered"),
      createParameter("Other Autoimmune / Inflammatory Tests, if ordered"),
      createParameter("Imaging / Joint Assessment Reference, if supplied"),
      createParameter("Laboratory Summary / Comments"),
      createParameter("Authorized Rheumatology Diagnosis / Management Plan, if issued separately"),
    ];
  }

  if (["rubellaigg", "rubellavirusigg", "rubellaantibodyigg"].includes(normalizedName)) {
    return [
      createParameter("Rubella IgG Result"),
      createParameter("Rubella IgG Antibody Index / Concentration, if reported"),
      createParameter("Laboratory Interpretation"),
      createParameter("Specimen Type"),
      createParameter("Test Method / Platform"),
      createParameter("Relevant Vaccination / Exposure History, if supplied"),
      createParameter("Comments / Follow-up Recommendation, if indicated"),
    ];
  }

  if (["shbgsexhormonebindingglobulin", "shbg", "sexhormonebindingglobulin"].includes(normalizedName)) {
    return [
      createParameter("Sex Hormone Binding Globulin (SHBG)", { unit: "nmol/L", normalRange: "Laboratory-validated age-, sex-, and physiologic-state-specific reference interval" }),
      createParameter("Total Testosterone, if supplied / co-tested"),
      createParameter("Albumin, if supplied / co-tested"),
      createParameter("Calculated Free Testosterone / Free Androgen Index, if calculated"),
      createParameter("Relevant Physiologic / Treatment Context, if supplied"),
      createParameter("Specimen Type"),
      createParameter("Test Method / Platform"),
      createParameter("Laboratory Interpretation / Comments"),
    ];
  }

  if (["semenculture", "semencultureandsensitivity", "spermoculture"].includes(normalizedName)) {
    return [
      createParameter("Specimen / Collection Details"),
      createParameter("Specimen Quality / Transport / Processing Notes"),
      createParameter("Direct Microscopy / Gram Stain, if performed"),
      createParameter("Culture Result"),
      createParameter("Organism(s) Isolated"),
      createParameter("Colony Count / Semiquantitation, if reported"),
      createParameter("Mixed Growth / Contamination Assessment"),
      createParameter("Antimicrobial Susceptibility"),
      createParameter("Anaerobic / Fungal Culture, if performed"),
      createParameter("Interpretation / Comments"),
      createParameter("Correlation with Semen Analysis / Clinical Assessment, if indicated"),
    ];
  }

  if (["seminalfluidforculturesensitivity", "seminalfluidculturesensitivity", "seminalfluidcultureandsensitivity"].includes(normalizedName)) {
    return [
      createParameter("Specimen / Collection Details"),
      createParameter("Specimen Quality / Transport / Processing Notes"),
      createParameter("Direct Microscopy / Gram Stain, if performed"),
      createParameter("Culture Result"),
      createParameter("Organism(s) Isolated"),
      createParameter("Colony Count / Semiquantitation, if reported"),
      createParameter("Mixed Growth / Contamination Assessment"),
      createParameter("Antimicrobial Susceptibility"),
      createParameter("Anaerobic / Fungal Culture, if performed"),
      createParameter("Interpretation / Comments"),
      createParameter("Correlation with Semen Analysis / Clinical Assessment, if indicated"),
    ];
  }

  if (["sputumculturesensitivity", "sputumcultureandsensitivity", "sputumcs"].includes(normalizedName)) {
    return [
      createParameter("Specimen / Collection Details"),
      createParameter("Specimen Quality Assessment / Sputum Screening Microscopy"),
      createParameter("Direct Microscopy / Gram Stain, if performed"),
      createParameter("Culture Result"),
      createParameter("Organism(s) Isolated"),
      createParameter("Colony Count / Semiquantitation, if reported"),
      createParameter("Mixed Upper Respiratory Flora / Contamination Assessment"),
      createParameter("Antimicrobial Susceptibility"),
      createParameter("Resistance Mechanism / Critical Alert, if detected"),
      createParameter("Interpretation / Comments"),
      createParameter("AFB / Fungal / Molecular Test Correlation, if separately requested"),
    ];
  }

  if (["sputumculturenonafb", "nonafbsputumculture", "sputumbacterialculture"].includes(normalizedName)) {
    return [
      createParameter("Specimen / Collection Details"),
      createParameter("Specimen Quality Assessment / Sputum Screening Microscopy"),
      createParameter("Direct Microscopy / Gram Stain, if performed"),
      createParameter("Routine Bacterial Culture Result"),
      createParameter("Organism(s) Isolated"),
      createParameter("Colony Count / Semiquantitation, if reported"),
      createParameter("Mixed Upper Respiratory Flora / Contamination Assessment"),
      createParameter("Antimicrobial Susceptibility, if performed"),
      createParameter("Resistance Mechanism / Critical Alert, if detected"),
      createParameter("Interpretation / Comments"),
      createParameter("Separate AFB / Mycobacterial / Fungal Test Status, if requested"),
    ];
  }

  if (["sputumgramstain", "gramstainsputum", "sputumgramstaining"].includes(normalizedName)) {
    return [
      createParameter("Specimen / Collection Details"),
      createParameter("Specimen Quality Assessment / Sputum Screening Microscopy"),
      createParameter("Gram Stain Method"),
      createParameter("Squamous Epithelial Cells"),
      createParameter("Inflammatory Cells / Polymorphs (PMNs)"),
      createParameter("Predominant Bacterial Morphotype, if present"),
      createParameter("Gram-Positive Organisms, if seen"),
      createParameter("Gram-Negative Organisms, if seen"),
      createParameter("Yeast / Other Organisms, if seen"),
      createParameter("Direct Microscopy Interpretation"),
      createParameter("Culture Correlation, if performed"),
      createParameter("Laboratory Comments / Recommendation"),
    ];
  }

  if (["sputumreleishmanstaingram", "sputumreleishmangram", "sputumrespiratoryexamination"].includes(normalizedName)) {
    return [
      createParameter("Specimen / Collection Details"),
      createParameter("Specimen Quality Assessment / Sputum Screening Microscopy"),
      createParameter("Leishman Stain Method / Cellular Assessment"),
      createParameter("Squamous Epithelial Cells"),
      createParameter("Inflammatory Cells / Polymorphs (PMNs)"),
      createParameter("Eosinophils, if assessed"),
      createParameter("Alveolar Macrophages / Histiocytes, if seen"),
      createParameter("Other Cellular Elements / Atypical Cells, if noted"),
      createParameter("Gram Stain Method"),
      createParameter("Gram-Positive Organisms, if seen"),
      createParameter("Gram-Negative Organisms, if seen"),
      createParameter("Yeast / Other Organisms, if seen"),
      createParameter("Combined Direct Microscopy Interpretation"),
      createParameter("Culture / AFB / Fungal Test Correlation, if separately requested"),
      createParameter("Laboratory Comments / Recommendation"),
    ];
  }

  if (["stoneanalysisurinarygallbladder", "stoneanalysis", "calculusanalysis"].includes(normalizedName)) {
    return [
      createParameter("Stone Source / Anatomical Site"),
      createParameter("Specimen / Collection Details"),
      createParameter("Gross Description"),
      createParameter("Stone Size / Weight, if measured"),
      createParameter("Analytical Method"),
      createParameter("Primary Stone Component"),
      createParameter("Primary Component Proportion, if reported"),
      createParameter("Secondary Stone Component(s), if present"),
      createParameter("Secondary Component Proportion, if reported"),
      createParameter("Other Component(s) / Layering, if identified"),
      createParameter("Stone Analysis Interpretation / Comments"),
      createParameter("Clinical / Metabolic or Biliary Correlation, if indicated"),
    ];
  }

  if (["stoolobt", "stooloccultbloodtest", "faecaloccultbloodtest", "fecaloccultbloodtest"].includes(normalizedName)) {
    return [
      createParameter("Fecal Occult Blood Result", { normalRange: "Not detected / Negative" }),
      createParameter("Test Method / Kit, if recorded"),
      createParameter("Specimen / Collection Details"),
      createParameter("Internal Quality Control, if recorded"),
      createParameter("Laboratory Interpretation / Comments"),
      createParameter("Clinical Follow-up Recommendation, if indicated"),
    ];
  }

  if (["stoolobtre3days", "stooloccultbloodroutineexamination3days"].includes(normalizedName)) {
    return [
      createParameter("Test Method / Kit, if recorded"),
      createParameter("Day 1 Collection Date / Time"),
      createParameter("Day 1 Fecal Occult Blood Result", { normalRange: "Not detected / Negative" }),
      createParameter("Day 1 Routine Examination Findings, if performed"),
      createParameter("Day 2 Collection Date / Time"),
      createParameter("Day 2 Fecal Occult Blood Result", { normalRange: "Not detected / Negative" }),
      createParameter("Day 2 Routine Examination Findings, if performed"),
      createParameter("Day 3 Collection Date / Time"),
      createParameter("Day 3 Fecal Occult Blood Result", { normalRange: "Not detected / Negative" }),
      createParameter("Day 3 Routine Examination Findings, if performed"),
      createParameter("Overall Occult Blood Summary"),
      createParameter("Overall Routine Examination Interpretation, if performed"),
      createParameter("Internal Quality Control, if recorded"),
      createParameter("Laboratory Interpretation / Comments"),
      createParameter("Clinical Follow-up Recommendation, if indicated"),
    ];
  }

  if (["stoolopc", "stoolovaparasitecyst", "stoolovacystsparasites"].includes(normalizedName)) {
    return [
      createParameter("Specimen / Collection Details"),
      createParameter("Specimen Consistency / Gross Appearance, if recorded"),
      createParameter("Direct Wet Mount / Concentration Method"),
      createParameter("Protozoa (Trophozoites), if seen"),
      createParameter("Protozoa (Cysts), if seen"),
      createParameter("Helminth Ova / Larvae, if seen"),
      createParameter("Coccidian Oocysts, if seen"),
      createParameter("Other Organisms / Yeast / Artefacts, if noted"),
      createParameter("Ova, Cyst and Parasite Examination Result"),
      createParameter("Microscopy Interpretation / Comments"),
      createParameter("Antigen / Molecular Parasite Testing, if separately requested"),
      createParameter("Recommendation for Additional Specimens / Follow-up, if indicated"),
    ];
  }

  if (["stoolreredsubph", "stoolroutineexaminationreducingsubstancesph"].includes(normalizedName)) {
    return [
      createParameter("Specimen / Collection Details"),
      createParameter("Gross Appearance / Consistency"),
      createParameter("Colour, if recorded"),
      createParameter("Mucus / Visible Blood, if seen"),
      createParameter("Direct Microscopy Method"),
      createParameter("Red Blood Cells, if seen"),
      createParameter("Pus Cells / White Blood Cells, if seen"),
      createParameter("Ova / Cysts / Parasites, if seen"),
      createParameter("Yeast / Other Microscopic Findings, if seen"),
      createParameter("Reducing Substances"),
      createParameter("Stool pH"),
      createParameter("Routine Examination Interpretation / Comments"),
      createParameter("Recommendation / Follow-up, if indicated"),
    ];
  }

  if (["stoolculture", "stoolcultureandsensitivity", "entericstoolculture"].includes(normalizedName)) {
    return [
      createParameter("Specimen / Collection Details"),
      createParameter("Specimen Condition / Transport Notes"),
      createParameter("Routine Enteric Culture Result"),
      createParameter("Enteric Pathogen(s) Isolated"),
      createParameter("Routine Enteric Pathogen Screen / Method"),
      createParameter("Shiga Toxin / STEC Result, if performed"),
      createParameter("Campylobacter Result, if performed"),
      createParameter("Other Special Pathogen Request / Result, if performed"),
      createParameter("Antimicrobial Susceptibility, if performed"),
      createParameter("Public Health / Referral Notification, if applicable"),
      createParameter("Interpretation / Comments"),
      createParameter("C. difficile / Parasite / GI NAAT Correlation, if separately requested"),
    ];
  }

  if (["seminalfluidforgramstain", "seminalfluidgramstain", "semengramstain"].includes(normalizedName)) {
    return [
      createParameter("Specimen / Collection Details"),
      createParameter("Specimen Quality / Processing Notes"),
      createParameter("Gram Stain Method"),
      createParameter("Inflammatory Cells / Polymorphs"),
      createParameter("Gram-Positive Organisms, if seen"),
      createParameter("Gram-Negative Organisms, if seen"),
      createParameter("Yeast / Other Organisms, if seen"),
      createParameter("Mixed Bacterial Flora / Background"),
      createParameter("Direct Microscopy Interpretation"),
      createParameter("Culture Correlation, if performed"),
      createParameter("Laboratory Comments / Recommendation"),
    ];
  }

  if (["seminalgermcellstudy", "semenimmaturegermcellstudy", "semenroundcellstudy"].includes(normalizedName)) {
    return [
      createParameter("Specimen / Collection Details"),
      createParameter("Specimen Quality / Processing Notes"),
      createParameter("Stain / Examination Method"),
      createParameter("Round Cells, Total"),
      createParameter("Immature Germ Cells Identified"),
      createParameter("Predominant Germ Cell Stage / Morphology, if assessable"),
      createParameter("Immature Germ Cells / Round Cells Proportion, if calculated"),
      createParameter("Leukocyte Assessment, if performed"),
      createParameter("Epithelial Cells / Debris / Other Cellular Elements"),
      createParameter("Semen Analysis Correlation, if available"),
      createParameter("Laboratory Interpretation / Comments"),
    ];
  }

  if (["serologyviralmarker", "viralmarker", "viralmarkers", "viralserologymarker"].includes(normalizedName)) {
    return [
      createParameter("Specimen / Collection Details"),
      createParameter("HIV-1/2 Antigen / Antibody Screen, if ordered"),
      createParameter("Hepatitis B Surface Antigen (HBsAg), if ordered"),
      createParameter("Hepatitis C Virus Antibody (Anti-HCV), if ordered"),
      createParameter("Hepatitis B Surface Antibody (Anti-HBs), if ordered"),
      createParameter("Total Hepatitis B Core Antibody (Total Anti-HBc), if ordered"),
      createParameter("Hepatitis B e Antigen / Antibody, if ordered"),
      createParameter("HCV RNA / Antigen, if performed"),
      createParameter("HIV Supplemental / Nucleic-Acid Testing, if performed"),
      createParameter("Other Requested Viral Marker(s), if performed"),
      createParameter("Test Method / Platform"),
      createParameter("Laboratory Interpretation / Comments"),
    ];
  }

  if (["sexchromatinstudy", "sexchromatintest", "barrbodystudy"].includes(normalizedName)) {
    return [
      createParameter("Specimen / Collection Site"),
      createParameter("Specimen Adequacy / Cellular Preservation"),
      createParameter("Stain / Examination Method"),
      createParameter("Epithelial Cells Examined"),
      createParameter("Barr-body Positive Cells"),
      createParameter("Barr-body Positive Nuclei (%)"),
      createParameter("Y Chromatin / Fluorescent Body Finding, if assessed"),
      createParameter("Nuclear Morphology / Technical Limitations"),
      createParameter("Sex Chromatin (Barr Body) Finding"),
      createParameter("Cytogenetic / Molecular Correlation, if available"),
      createParameter("Laboratory Interpretation / Comments"),
    ];
  }

  if (["solubleliverantigenslaantibody", "solubleliverantigenantibody", "antislaantibody", "antisla"].includes(normalizedName)) {
    return [
      createParameter("Anti-Soluble Liver Antigen (SLA) Antibody Result"),
      createParameter("Anti-SLA Antibody Index / Concentration, if reported"),
      createParameter("Laboratory Interpretation"),
      createParameter("Specimen Type"),
      createParameter("Test Method / Platform"),
      createParameter("Other Autoimmune Liver Antibodies, if co-tested"),
      createParameter("Total IgG / Liver Test Correlation, if available"),
      createParameter("Clinical / Treatment Context, if supplied"),
      createParameter("Comments / Follow-up Recommendation, if indicated"),
    ];
  }

  if (["spirometry", "spirometery", "pulmonaryfunctiontestspirometry"].includes(normalizedName)) {
    return [
      createParameter("Patient Measurements / Reference Equation"),
      createParameter("Test Session Quality / Acceptability"),
      createParameter("Pre-Bronchodilator FVC"),
      createParameter("Pre-Bronchodilator FEV1"),
      createParameter("Pre-Bronchodilator FEV1/FVC"),
      createParameter("Pre-Bronchodilator FEF25-75"),
      createParameter("Pre-Bronchodilator Peak Expiratory Flow (PEF)"),
      createParameter("Post-Bronchodilator FVC, if performed"),
      createParameter("Post-Bronchodilator FEV1, if performed"),
      createParameter("Post-Bronchodilator FEV1/FVC, if performed"),
      createParameter("Post-Bronchodilator FEF25-75, if performed"),
      createParameter("Post-Bronchodilator Peak Expiratory Flow (PEF), if performed"),
      createParameter("Bronchodilator / Timing, if performed"),
      createParameter("FEV1 Change Pre- to Post-Bronchodilator, if calculated"),
      createParameter("FVC Change Pre- to Post-Bronchodilator, if calculated"),
      createParameter("Flow-Volume / Volume-Time Curve Review"),
      createParameter("Laboratory Interpretation / Comments"),
    ];
  }

  if (["semenforfructose", "semenfructose", "fructosesemen"].includes(normalizedName)) {
    return [
      createParameter("Specimen / Collection Details"),
      createParameter("Semen Volume, if supplied"),
      createParameter("Liquefaction / Processing Details, if supplied"),
      createParameter("Seminal Fructose Result"),
      createParameter("Seminal Fructose Concentration, if quantitative"),
      createParameter("Test Method"),
      createParameter("Sperm Concentration / Azoospermia Reference, if supplied"),
      createParameter("Semen Analysis Correlation, if available"),
      createParameter("Laboratory Interpretation / Comments"),
    ];
  }

  if (["seminalfluidforafbstain", "semenafbstain", "seminalfluidafbstain"].includes(normalizedName)) {
    return [
      createParameter("Specimen / Collection Details"),
      createParameter("Specimen Quality / Volume / Processing Notes"),
      createParameter("Stain Method"),
      createParameter("AFB Smear Result"),
      createParameter("AFB Smear Grade / Quantitation, if applicable"),
      createParameter("Microscopy Findings / Morphology"),
      createParameter("Internal Quality Control / Stain Validity"),
      createParameter("Mycobacterial Culture / NAAT Correlation, if performed"),
      createParameter("Laboratory Interpretation / Comments"),
    ];
  }

  if (["preoperativeprofile", "preopprofile", "preoperativecheckup"].includes(normalizedName)) {
    return [
      createParameter("Planned Procedure / Surgery, if supplied"),
      createParameter("Clinical Indication / Comorbidity Context, if supplied"),
      createParameter("Specimens / Collection Details"),
      createParameter("Complete Blood Count (CBC), if requested"),
      createParameter("Blood Group / Antibody Screen, if requested"),
      createParameter("Coagulation Studies, if requested"),
      createParameter("Renal Function / Electrolytes, if requested"),
      createParameter("Blood Glucose / HbA1c, if requested"),
      createParameter("Other Requested Laboratory Tests / Results"),
      createParameter("Abnormal Results / Laboratory Comments"),
      createParameter("Laboratory Report Summary"),
      createParameter("Anaesthesia / Surgical Clearance, if issued separately"),
    ];
  }

  if (["precathprofile", "precatheterizationprofile"].includes(normalizedName)) {
    return [
      createParameter("Planned Catheterization / Procedure Context, if supplied"),
      createParameter("Clinical Indication / Relevant History, if supplied"),
      createParameter("Specimens / Collection Details"),
      createParameter("Complete Blood Count (CBC), if requested"),
      createParameter("Renal Function / eGFR, if requested"),
      createParameter("Electrolytes, if requested"),
      createParameter("Coagulation Studies, if requested"),
      createParameter("Blood Group / Antibody Screen, if requested"),
      createParameter("Blood Glucose, if requested"),
      createParameter("Other Requested Laboratory Tests / Results"),
      createParameter("Abnormal Results / Laboratory Comments"),
      createParameter("Cardiology / Procedural Clearance, if issued separately"),
    ];
  }

  if (["premarriageprofile", "premaritalprofile", "premarriagescreening"].includes(normalizedName)) {
    return [
      createParameter("Requesting Clinician / Organization, if supplied"),
      createParameter("Informed Consent / Counselling Record, if supplied"),
      createParameter("Specimens / Collection Details"),
      createParameter("ABO / Rh Blood Group, if requested"),
      createParameter("Hemoglobin / Complete Blood Count, if requested"),
      createParameter("Hemoglobinopathy Screening, if requested"),
      createParameter("Carrier / Genetic Screening, if requested"),
      createParameter("Infectious Disease Tests, if explicitly requested and consented"),
      createParameter("Other Requested Laboratory Tests / Results"),
      createParameter("Abnormal Results / Laboratory Comments"),
      createParameter("Laboratory Report Summary"),
      createParameter("Medical / Genetic Counselling or Certification, if issued separately"),
    ];
  }

  if (["fshprl", "fshprolactin", "folliclestimulatinghormoneprolactin"].includes(normalizedName)) {
    return [
      createParameter("Follicle Stimulating Hormone (FSH), Serum", { unit: "mIU/mL", normalRange: "Laboratory-validated, sex- and phase-specific reference interval" }),
      createParameter("Prolactin (PRL), Serum", { unit: "ng/mL", normalRange: "Laboratory-validated, sex- and physiologic-state-specific reference interval" }),
      createParameter("Menstrual Cycle Phase / Physiologic State"),
      createParameter("Clinical Details / Medication History"),
      createParameter("Method / Analyzer"),
      createParameter("Comments"),
    ];
  }

  if (["earswabafbstain", "earafbstain"].includes(normalizedName)) {
    return [
      createParameter("Specimen / Collection Site", { normalRange: "Ear swab; state right / left / bilateral where supplied" }),
      createParameter("AFB Smear Microscopy Result", { normalRange: "No acid-fast bacilli seen" }),
      createParameter("AFB Smear Grade / Quantitation"),
      createParameter("Stain Method"),
      createParameter("Specimen Adequacy / Volume"),
      createParameter("Microscopy Remarks"),
      createParameter("Culture / Molecular Test Status"),
      createParameter("Comments"),
    ];
  }

  if (["earcuwahgamstain", "earswabgramstain"].includes(normalizedName)) {
    return [
      createParameter("Specimen / Collection Site", { normalRange: "Ear swab; state right / left / bilateral where supplied" }),
      createParameter("Smear Method / Preparation"),
      createParameter("Inflammatory Cells / PMNs"),
      createParameter("Gram Stain Findings", { normalRange: "Direct microscopy finding" }),
      createParameter("Gram Reaction / Bacterial Morphology"),
      createParameter("Epithelial Cells / Debris"),
      createParameter("Impression"),
      createParameter("Culture / Molecular Test Status"),
      createParameter("Comments"),
    ];
  }

  if (["throatswabforgramstain", "throatswabgramstain", "throatgramstain", "gramstainthroatswab"].includes(normalizedName)) {
    return [
      createParameter("Specimen / Collection Site", { normalRange: "Throat swab; state site where supplied" }),
      createParameter("Smear Method / Preparation"),
      createParameter("Inflammatory Cells / PMNs"),
      createParameter("Epithelial Cells / Specimen Quality"),
      createParameter("Gram-Positive Organisms / Morphology, if seen"),
      createParameter("Gram-Negative Organisms / Morphology, if seen"),
      createParameter("Yeast / Fungal Elements, if seen"),
      createParameter("Overall Gram Stain Findings"),
      createParameter("Culture / Molecular Test Status"),
      createParameter("Comments / Clinical Correlation"),
    ];
  }

  if (["nasalswabgramstain", "nasalgramstain", "gramstainnasalswab"].includes(normalizedName)) {
    return [
      createParameter("Specimen / Collection Site", { normalRange: "Nasal swab; state nostril / site where supplied" }),
      createParameter("Smear Method / Preparation"),
      createParameter("Inflammatory Cells / PMNs"),
      createParameter("Epithelial Cells / Specimen Quality"),
      createParameter("Gram-Positive Organisms / Morphology, if seen"),
      createParameter("Gram-Negative Organisms / Morphology, if seen"),
      createParameter("Yeast / Fungal Elements, if seen"),
      createParameter("Overall Gram Stain Findings"),
      createParameter("Impression"),
      createParameter("Culture / Other Correlation, if ordered"),
      createParameter("Comments"),
    ];
  }

  if (["diabeticrenalprofile", "diabetesrenalprofile", "diabetickidneyprofile"].includes(normalizedName)) {
    return [
      createParameter("Fasting Plasma Glucose", { unit: "mg/dL", normalRange: "70 - 99" }),
      createParameter("HbA1c", { unit: "%", normalRange: "< 5.7" }),
      {
        ...createParameter("Estimated Average Glucose (eAG)", { unit: "mg/dL", normalRange: "Calculated from HbA1c" }),
        entryMode: "calculated",
        calculationFormula: "{HbA1c} * 28.7 - 46.7",
        calculationPrecision: 0,
      },
      createParameter("Serum Creatinine", { unit: "mg/dL", normalRange: "Laboratory-validated reference interval" }),
      createParameter("Estimated GFR (eGFR)", { unit: "mL/min/1.73 m²", normalRange: "Laboratory-reported, equation-specific" }),
      createParameter("Blood Urea Nitrogen (BUN)", { unit: "mg/dL", normalRange: "Laboratory-validated reference interval" }),
      createParameter("Urine Albumin (Microalbumin)", { unit: "mg/L", normalRange: "Laboratory-validated reference interval" }),
      createParameter("Urine Creatinine", { unit: "mg/dL", normalRange: "Laboratory-validated reference interval" }),
      {
        ...createParameter("Urine Albumin-Creatinine Ratio (UACR)", { unit: "mg/g", normalRange: "< 30" }),
        entryMode: "calculated",
        calculationFormula: "{Urine Albumin (Microalbumin)} * 100 / {Urine Creatinine}",
        calculationPrecision: 1,
      },
      createParameter("Method / Analyzer"),
      createParameter("Comments"),
    ];
  }

  if (["diabeticprofileextended", "diabetesprofileextended", "extendeddiabeticprofile"].includes(normalizedName)) {
    return [
      createParameter("Fasting Plasma Glucose", { unit: "mg/dL", normalRange: "70 - 99" }),
      createParameter("Postprandial Plasma Glucose (2 Hours)", { unit: "mg/dL", normalRange: "< 140" }),
      createParameter("HbA1c", { unit: "%", normalRange: "< 5.7" }),
      {
        ...createParameter("Estimated Average Glucose (eAG)", { unit: "mg/dL", normalRange: "Calculated from HbA1c" }),
        entryMode: "calculated",
        calculationFormula: "{HbA1c} * 28.7 - 46.7",
        calculationPrecision: 0,
      },
      createParameter("Total Cholesterol", { unit: "mg/dL", normalRange: "Laboratory-validated reference interval" }),
      createParameter("Triglycerides", { unit: "mg/dL", normalRange: "Laboratory-validated reference interval" }),
      createParameter("HDL Cholesterol", { unit: "mg/dL", normalRange: "Laboratory-validated reference interval" }),
      createParameter("LDL Cholesterol", { unit: "mg/dL", normalRange: "Laboratory-validated reference interval" }),
      createParameter("VLDL Cholesterol", { unit: "mg/dL", normalRange: "Laboratory-validated reference interval" }),
      createParameter("Urine Glucose", { normalRange: "Negative" }),
      createParameter("Urine Ketones", { normalRange: "Negative" }),
      createParameter("Method / Analyzer"),
      createParameter("Comments"),
    ];
  }

  if (["diabeticprofile", "diabetesprofile", "diabetesmellitusprofile", "diabetescheckupprofile"].includes(normalizedName)) {
    return [
      createParameter("Fasting Plasma Glucose", { unit: "mg/dL", normalRange: "70 - 99" }),
      createParameter("Postprandial Plasma Glucose (2 Hours)", { unit: "mg/dL", normalRange: "< 140" }),
      createParameter("HbA1c", { unit: "%", normalRange: "< 5.7" }),
      {
        ...createParameter("Estimated Average Glucose (eAG)", { unit: "mg/dL", normalRange: "Calculated from HbA1c" }),
        entryMode: "calculated",
        calculationFormula: "{HbA1c} * 28.7 - 46.7",
        calculationPrecision: 0,
      },
      createParameter("Urine Glucose", { normalRange: "Negative" }),
      createParameter("Urine Ketones", { normalRange: "Negative" }),
      createParameter("Method / Analyzer"),
      createParameter("Comments"),
    ];
  }

  if (["cmvcytomegalovirusigmigg", "cytomegaloviruscmvigmigg", "cytomegaloviruscmviggigm", "cytomegalovirusigmigg", "cmviggigm"].includes(normalizedName)) {
    return [
      createParameter("Cytomegalovirus (CMV) IgM", { normalRange: "Laboratory-validated assay interpretation" }),
      createParameter("Cytomegalovirus (CMV) IgG", { normalRange: "Laboratory-validated assay interpretation" }),
      createParameter("Specimen"),
      createParameter("Method / Analyzer"),
      createParameter("Clinical Details / Indication"),
      createParameter("Comments"),
    ];
  }

  if (["cryoglobulinsscreeningtest", "cryoglobulinscreeningtest", "cryoglobulinscreen", "cryoglobulinscreening", "cryoglobulintest"].includes(normalizedName)) {
    return [
      createParameter("Cryoglobulin Screen", { normalRange: "Negative" }),
      createParameter("Cryoprecipitate / Cryocrit", { unit: "%", normalRange: "Not detected" }),
      createParameter("Incubation / Observation Period", { normalRange: "Laboratory-validated protocol" }),
      createParameter("Specimen"),
      createParameter("Collection / Transport Temperature"),
      createParameter("Method / Analyzer"),
      createParameter("Comments / Reflex Testing"),
    ];
  }

  if (["gonorrhea", "gonorrhoea", "gonorrheatest", "gonorrhoeatest"].includes(normalizedName)) {
    return [
      createParameter("Specimen / Collection Site"),
      createParameter("Test Method (NAAT / Culture / Other)"),
      createParameter("Neisseria gonorrhoeae Result", { normalRange: "Laboratory-validated qualitative interpretation" }),
      createParameter("Direct Microscopy / Gram Stain, if performed"),
      createParameter("Culture / Identification Result, if performed"),
      createParameter("Antimicrobial Susceptibility / MIC, if performed"),
      createParameter("Chlamydia Co-test Result, if ordered"),
      createParameter("Report Status"),
      createParameter("Comments / Clinical Correlation"),
    ];
  }

  if (["gramstainofurethraldischarge", "urethraldischargegramstain", "gramstainurethraldischarge"].includes(normalizedName)) {
    return [
      createParameter("Specimen / Collection Site", { normalRange: "Urethral discharge" }),
      createParameter("Smear Method / Preparation"),
      createParameter("Inflammatory Cells / PMNs"),
      createParameter("Epithelial Cells"),
      createParameter("Gram Stain Findings / Bacterial Morphology"),
      createParameter("Intracellular Gram-Negative Diplococci, if observed"),
      createParameter("Culture / NAAT Correlation, if ordered"),
      createParameter("Comments / Clinical Correlation"),
    ];
  }

  if (["gramstainofsmears", "gramstainsmears", "gramstainsmear", "gramsmearexamination"].includes(normalizedName)) {
    return [
      createParameter("Specimen / Collection Site"),
      createParameter("Smear Method / Preparation"),
      createParameter("Inflammatory Cells / PMNs"),
      createParameter("Epithelial Cells"),
      createParameter("Gram-Positive Organisms / Morphology, if seen"),
      createParameter("Gram-Negative Organisms / Morphology, if seen"),
      createParameter("Yeast / Fungal Elements, if seen"),
      createParameter("Overall Gram Stain Findings"),
      createParameter("Culture / Other Correlation, if ordered"),
      createParameter("Comments"),
    ];
  }

  if (["generalhealthcheckup", "generalhealthcheck", "healthcheckupgeneral", "healthcheckup"].includes(normalizedName)) {
    return [
      createParameter("Specimen(s) / Collection Conditions"),
      createParameter("Complete Blood Count Summary, if ordered"),
      createParameter("Glucose Assessment, if ordered"),
      createParameter("HbA1c, if ordered"),
      createParameter("Lipid Profile Summary, if ordered"),
      createParameter("Liver Function Summary, if ordered"),
      createParameter("Renal Function Summary, if ordered"),
      createParameter("Thyroid Assessment, if ordered"),
      createParameter("Urinalysis Summary, if ordered"),
      createParameter("Other Ordered Investigations"),
      createParameter("Laboratory Comments / Clinical Correlation"),
    ];
  }

  if (["havtotaliggigm", "havtotal", "hepatitisatotalantibody", "hepatitisatotalantibodies", "totalantihav"].includes(normalizedName)) {
    return [
      createParameter("Total Anti-HAV (IgG + IgM)", { normalRange: "Laboratory-validated qualitative interpretation" }),
      createParameter("Assay / Method"),
      createParameter("Specimen", { normalRange: "Serum" }),
      createParameter("Anti-HAV IgM, if performed"),
      createParameter("Clinical Indication / Vaccination History, if provided"),
      createParameter("Interpretation / Comments"),
    ];
  }

  if (["hbdhldh1", "hbdh", "alphahydroxybutyratedehydrogenase", "hydroxybutyratedehydrogenase", "ldh1"].includes(normalizedName)) {
    return [
      createParameter("Alpha-Hydroxybutyrate Dehydrogenase (HBDH)", { unit: "U/L", normalRange: "Laboratory-validated, method-specific reference interval" }),
      createParameter("Specimen", { normalRange: "Serum or plasma, as validated by laboratory" }),
      createParameter("Method / Analyzer"),
      createParameter("Total LDH, if measured", { unit: "U/L" }),
      createParameter("HBDH / LDH Ratio, if calculated"),
      createParameter("Hemolysis / Specimen Quality Comment"),
      createParameter("Clinical Context / Indication"),
      createParameter("Interpretation / Comments"),
    ];
  }

  if (["hbsagquantitative", "quantitativehbsag", "hepatitisbsurfaceantigenquantitative", "hbsagquant"].includes(normalizedName)) {
    return [
      createParameter("HBsAg, Quantitative", { unit: "IU/mL", normalRange: "Laboratory-validated, assay-specific reference interval" }),
      createParameter("Assay / Method"),
      createParameter("Specimen", { normalRange: "Serum" }),
      createParameter("Qualitative HBsAg / Neutralization Confirmation, if performed"),
      createParameter("HBV DNA, if measured"),
      createParameter("Prior Quantitative HBsAg / Collection Date, if available"),
      createParameter("Clinical Context / Treatment Status"),
      createParameter("Interpretation / Comments"),
    ];
  }

  if (["hepatitisbviraldnaqualitative", "hbvdnaqualitative", "hepatitisbdnaqualitative", "hbvdnapcrqualitative"].includes(normalizedName)) {
    return [
      createParameter("HBV DNA, Qualitative", { normalRange: "Detected / Not detected / Invalid" }),
      createParameter("Assay / Method"),
      createParameter("Specimen", { normalRange: "Serum or plasma, as validated by laboratory" }),
      createParameter("Assay Target / Genomic Region, if reported"),
      createParameter("Analytical Sensitivity / Detection Limit"),
      createParameter("Internal Control / Run Validity"),
      createParameter("HBsAg / HBeAg / Anti-HBc Context, if available"),
      createParameter("Collection Date / Time"),
      createParameter("Antiviral Treatment Status, if provided"),
      createParameter("Interpretation / Comments"),
    ];
  }

  if (["hepatitisbvirustreatmentfollowup", "hepatitisbvirustreatmentfollow", "hepatitisbtreatmentfollowup", "hbvtreatmentfollowup", "hbvfollowup"].includes(normalizedName)) {
    return [
      createParameter("HBV DNA, Quantitative", { unit: "IU/mL", normalRange: "Laboratory-validated assay-specific reporting range" }),
      createParameter("HBV DNA, Log10", { unit: "log10 IU/mL" }),
      createParameter("HBV DNA Detection / Quantification Status"),
      createParameter("Assay / Method"),
      createParameter("Specimen", { normalRange: "Specimen validated for the stated molecular assay" }),
      createParameter("Lower Limit of Quantification / Detection"),
      createParameter("HBsAg / HBeAg / Anti-HBe Context, if available"),
      createParameter("ALT / AST, if measured", { unit: "U/L" }),
      createParameter("Antiviral Treatment / Regimen, if provided"),
      createParameter("Prior HBV DNA / Collection Date, if available"),
      createParameter("Collection Date / Time"),
      createParameter("Interpretation / Comments"),
    ];
  }

  if (["hepatitisprofile", "viralhepatitisprofile", "hepatitisviralscreeningprofile"].includes(normalizedName)) {
    return [
      createParameter("Anti-HAV IgM, if performed", { normalRange: "Laboratory-validated qualitative interpretation" }),
      createParameter("HBsAg, if performed", { normalRange: "Laboratory-validated qualitative interpretation" }),
      createParameter("Anti-HBc IgM, if performed", { normalRange: "Laboratory-validated qualitative interpretation" }),
      createParameter("HBeAg / Anti-HBe, if performed"),
      createParameter("Anti-HCV / HCV Antibody, if performed", { normalRange: "Laboratory-validated qualitative interpretation" }),
      createParameter("HCV RNA / NAT, if performed"),
      createParameter("Anti-HEV IgM, if performed", { normalRange: "Laboratory-validated qualitative interpretation" }),
      createParameter("HEV RNA, if performed"),
      createParameter("Assay / Method"),
      createParameter("Specimen", { normalRange: "Serum or plasma, as validated by laboratory" }),
      createParameter("Collection Date / Time"),
      createParameter("Clinical Context / Exposure Timing, if provided"),
      createParameter("Interpretation / Comments"),
    ];
  }

  if (["herpessimplexvirus2hsv2igg", "hsv2igg", "herpessimplex2igg", "herpessimplexvirus2igg"].includes(normalizedName)) {
    return [
      createParameter("HSV-2 IgG", { unit: "Index", normalRange: "Laboratory-validated assay-specific interpretation" }),
      createParameter("Assay / Method"),
      createParameter("Specimen", { normalRange: "Serum or plasma, as validated by laboratory" }),
      createParameter("Signal / Cutoff Index, if reported"),
      createParameter("HSV-2 Qualitative Interpretation"),
      createParameter("HSV-1 IgG / Type-Specific Context, if performed"),
      createParameter("Lesion PCR / Culture, if performed"),
      createParameter("Symptoms / Lesion Status, if provided"),
      createParameter("Exposure Timing, if provided"),
      createParameter("Interpretation / Comments"),
    ];
  }

  if (["herpessimplexvirus2hsv2igm", "hsv2igm", "herpessimplex2igm", "herpessimplexvirus2igm"].includes(normalizedName)) {
    return [
      createParameter("HSV-2 IgM", { unit: "Index", normalRange: "Laboratory-validated assay-specific interpretation" }),
      createParameter("Assay / Method"),
      createParameter("Specimen", { normalRange: "Serum or plasma, as validated by laboratory" }),
      createParameter("Signal / Cutoff Index, if reported"),
      createParameter("HSV IgM Qualitative Interpretation"),
      createParameter("HSV-1 / HSV-2 Type-Specific IgG, if performed"),
      createParameter("Lesion PCR / Culture, if performed"),
      createParameter("Symptoms / Lesion Status, if provided"),
      createParameter("Exposure Timing, if provided"),
      createParameter("Interpretation / Comments"),
    ];
  }

  if (["herpessimplexvirus1hsv1igg", "hsv1igg", "herpessimplex1igg", "herpessimplexvirus1igg"].includes(normalizedName)) {
    return [
      createParameter("HSV-1 IgG", { unit: "Index", normalRange: "Laboratory-validated assay-specific interpretation" }),
      createParameter("Assay / Method"),
      createParameter("Specimen", { normalRange: "Serum or plasma, as validated by laboratory" }),
      createParameter("Signal / Cutoff Index, if reported"),
      createParameter("HSV-1 Qualitative Interpretation"),
      createParameter("HSV-2 IgG / Type-Specific Context, if performed"),
      createParameter("Lesion PCR / Culture, if performed"),
      createParameter("Symptoms / Lesion Status, if provided"),
      createParameter("Exposure Timing, if provided"),
      createParameter("Interpretation / Comments"),
    ];
  }

  if (["herpessimplexvirus1hsv1igm", "hsv1igm", "herpessimplex1igm", "herpessimplexvirus1igm"].includes(normalizedName)) {
    return [
      createParameter("HSV-1 IgM", { unit: "Index", normalRange: "Laboratory-validated assay-specific interpretation" }),
      createParameter("Assay / Method"),
      createParameter("Specimen", { normalRange: "Serum or plasma, as validated by laboratory" }),
      createParameter("Signal / Cutoff Index, if reported"),
      createParameter("HSV IgM Qualitative Interpretation"),
      createParameter("HSV-1 / HSV-2 Type-Specific IgG, if performed"),
      createParameter("Lesion PCR / Culture, if performed"),
      createParameter("Symptoms / Lesion Status, if provided"),
      createParameter("Exposure Timing, if provided"),
      createParameter("Interpretation / Comments"),
    ];
  }

  if (["homocystineblood", "homocysteinblood", "homocysteineblood"].includes(normalizedName)) {
    return [
      createParameter("Homocystine, Blood", { unit: "Laboratory-reported unit", normalRange: "Laboratory-validated, specimen- and method-specific reference interval" }),
      createParameter("Specimen / Anticoagulant"),
      createParameter("Collection / Processing Details"),
      createParameter("Method / Analyzer"),
      createParameter("Fasting Status, if relevant"),
      createParameter("Vitamin B12 / Folate / Renal Function Context, if available"),
      createParameter("Interpretation / Comments"),
    ];
  }

  if (["homocystineurine", "homocysteinurine", "homocysteineurine"].includes(normalizedName)) {
    return [
      createParameter("Homocystine, Urine", { unit: "Laboratory-reported unit", normalRange: "Laboratory-validated, collection- and method-specific reference interval" }),
      createParameter("Urine Collection Type / Duration"),
      createParameter("Total Urine Volume, if timed collection"),
      createParameter("Urine Creatinine / Normalization, if reported"),
      createParameter("Collection / Processing Details"),
      createParameter("Method / Analyzer"),
      createParameter("Clinical Context / Indication"),
      createParameter("Interpretation / Comments"),
    ];
  }

  if (["hypertensionprofile", "hypertensionworkupprofile", "hypertensiveprofile"].includes(normalizedName)) {
    return [
      createParameter("Serum Creatinine / eGFR, if performed"),
      createParameter("Serum Sodium, if performed"),
      createParameter("Serum Potassium, if performed"),
      createParameter("Fasting Plasma Glucose / HbA1c, if performed"),
      createParameter("Lipid Profile Summary, if performed"),
      createParameter("Serum Uric Acid, if performed"),
      createParameter("Urine Protein / Albumin-Creatinine Ratio, if performed"),
      createParameter("Urinalysis Summary, if performed"),
      createParameter("Renin / Aldosterone Testing, if performed"),
      createParameter("Thyroid Function Testing, if performed"),
      createParameter("Blood Pressure / Medication Context, if provided"),
      createParameter("Interpretation / Comments"),
    ];
  }

  if (["hcvtotaligmigg", "hcvtotalantibody", "hepatitisctotalantibody", "totalantihcv", "antihcvtotaligmigg"].includes(normalizedName)) {
    return [
      createParameter("Total Anti-HCV (IgM + IgG)", { normalRange: "Laboratory-validated qualitative interpretation" }),
      createParameter("Assay / Method"),
      createParameter("Specimen", { normalRange: "Serum or plasma, as validated by laboratory" }),
      createParameter("Individual Anti-HCV IgM / IgG, if separately performed"),
      createParameter("HCV RNA / NAT, if performed"),
      createParameter("Exposure or Symptom Timing, if provided"),
      createParameter("Interpretation / Comments"),
    ];
  }

  if (["hepatitiscvirushcvantibodyigg", "hcvantibodyigg", "hepatitiscantibodyigg", "antihcvigg"].includes(normalizedName)) {
    return [
      createParameter("HCV Antibody IgG", { normalRange: "Reactive / Non-reactive / Indeterminate" }),
      createParameter("Assay / Method"),
      createParameter("Specimen", { normalRange: "Serum or plasma, as validated by laboratory" }),
      createParameter("Signal / Cutoff Index, if reported"),
      createParameter("HCV Antibody Screen / Confirmation Context, if available"),
      createParameter("HCV RNA / NAT, if performed"),
      createParameter("Exposure or Symptom Timing, if provided"),
      createParameter("Immunocompromised Status, if relevant"),
      createParameter("Interpretation / Comments"),
    ];
  }

  if (["hepatitiscvirushcvantibodyigm", "hcvantibodyigm", "hepatitiscantibodyigm", "antihcvigm"].includes(normalizedName)) {
    return [
      createParameter("HCV Antibody IgM", { normalRange: "Reactive / Non-reactive / Indeterminate" }),
      createParameter("Assay / Method"),
      createParameter("Specimen", { normalRange: "Serum or plasma, as validated by laboratory" }),
      createParameter("Signal / Cutoff Index, if reported"),
      createParameter("HCV Antibody IgG / Total Antibody Context, if available"),
      createParameter("HCV RNA / NAT, if performed"),
      createParameter("Exposure or Symptom Timing, if provided"),
      createParameter("Immunocompromised Status, if relevant"),
      createParameter("Interpretation / Comments"),
    ];
  }

  if (["hepatitiscrnapcrquantitative", "hcvrnapcrquantitative", "hcvrnaquantitative", "hcvquantitativepcr"].includes(normalizedName)) {
    return [
      createParameter("HCV RNA, Quantitative", { unit: "IU/mL", normalRange: "Undetected or assay-specific quantification range" }),
      createParameter("HCV RNA, Log10", { unit: "log10 IU/mL", normalRange: "Assay-specific quantification range" }),
      createParameter("Result Interpretation", { normalRange: "Undetected / Detected below quantification limit / Quantified / Invalid" }),
      createParameter("Assay / Method"),
      createParameter("Specimen", { normalRange: "Serum or plasma, as validated by laboratory" }),
      createParameter("Lower / Upper Limit of Quantification"),
      createParameter("Internal Control / Run Validity"),
      createParameter("HCV Antibody / Prior RNA Context, if available"),
      createParameter("Collection Date / Time"),
      createParameter("Antiviral Treatment Status / Monitoring Timepoint, if provided"),
      createParameter("Interpretation / Comments"),
    ];
  }

  if (["hddcesr", "hbdcesr", "hbdlcesr", "hemoglobindifferentialcountesr"].includes(normalizedName)) {
    return [
      createParameter("Hemoglobin (Hb)", { unit: "g/dL", normalRange: "Age- and sex-specific laboratory reference interval" }),
      createParameter("Neutrophils", { unit: "%", normalRange: "Laboratory reference interval" }),
      createParameter("Lymphocytes", { unit: "%", normalRange: "Laboratory reference interval" }),
      createParameter("Eosinophils", { unit: "%", normalRange: "Laboratory reference interval" }),
      createParameter("Monocytes", { unit: "%", normalRange: "Laboratory reference interval" }),
      createParameter("Basophils", { unit: "%", normalRange: "Laboratory reference interval" }),
      createParameter("ESR", { unit: "mm/hr", normalRange: "Laboratory method-, age- and sex-specific reference interval" }),
    ];
  }

  if (["hbtltctcwbcdlcesrprofile", "hbtlcdlcesrprofile"].includes(normalizedName)) {
    return [
      createParameter("Hemoglobin (Hb)", { unit: "g/dL", normalRange: "Age- and sex-specific laboratory reference interval" }),
      createParameter("Total Leucocyte Count (TLC)", { unit: "cells/cumm", normalRange: "Laboratory reference interval" }),
      createParameter("Neutrophils", { unit: "%", normalRange: "Laboratory reference interval" }),
      createParameter("Lymphocytes", { unit: "%", normalRange: "Laboratory reference interval" }),
      createParameter("Eosinophils", { unit: "%", normalRange: "Laboratory reference interval" }),
      createParameter("Monocytes", { unit: "%", normalRange: "Laboratory reference interval" }),
      createParameter("Basophils", { unit: "%", normalRange: "Laboratory reference interval" }),
      createParameter("ESR", { unit: "mm/hr", normalRange: "Laboratory method-, age- and sex-specific reference interval" }),
    ];
  }

  if (["hdlldl", "hdlldlratio", "ldlhdlratio"].includes(normalizedName)) {
    return [
      createParameter("HDL Cholesterol", { unit: "mg/dL", normalRange: "Laboratory-validated reference interval" }),
      createParameter("LDL Cholesterol", { unit: "mg/dL", normalRange: "Laboratory-validated reference interval" }),
      {
        ...createParameter("HDL : LDL Ratio", { normalRange: "No universal decision limit; interpret with complete lipid profile" }),
        entryMode: "calculated",
        calculationFormula: "{HDL Cholesterol} / {LDL Cholesterol}",
        calculationPrecision: 2,
      },
      createParameter("Method / Comments"),
    ];
  }

  if (["hdvantibody", "antihdv", "hepatitisdvirusantibody", "antihdvantibody"].includes(normalizedName)) {
    return [
      createParameter("Anti-HDV Antibody", { normalRange: "Laboratory-validated qualitative interpretation" }),
      createParameter("Assay / Method"),
      createParameter("Specimen", { normalRange: "Serum or plasma, as validated by laboratory" }),
      createParameter("HBsAg Status, if available"),
      createParameter("HDV RNA, if performed"),
      createParameter("Interpretation / Comments"),
    ];
  }

  if (["hevtotaliggigm", "hevtotal", "hepatitisevirustotalantibody", "totalantihev"].includes(normalizedName)) {
    return [
      createParameter("Total Anti-HEV (IgG + IgM)", { normalRange: "Laboratory-validated qualitative interpretation" }),
      createParameter("Assay / Method"),
      createParameter("Specimen", { normalRange: "Serum or plasma, as validated by laboratory" }),
      createParameter("Anti-HEV IgM, if performed"),
      createParameter("HEV RNA, if performed"),
      createParameter("Exposure or Symptom Timing, if provided"),
      createParameter("Interpretation / Comments"),
    ];
  }

  if (["hepatitisevirushevantibodyigg", "hevantibodyigg", "hepatitiseantibodyigg", "antihevigg"].includes(normalizedName)) {
    return [
      createParameter("Anti-HEV IgG", { normalRange: "Reactive / Non-reactive / Indeterminate" }),
      createParameter("Assay / Method"),
      createParameter("Specimen", { normalRange: "Serum or plasma, as validated by laboratory" }),
      createParameter("Signal / Cutoff Index, if reported"),
      createParameter("Anti-HEV IgM, if performed"),
      createParameter("HEV RNA, if performed"),
      createParameter("Exposure or Symptom Timing, if provided"),
      createParameter("Immunocompromised Status, if relevant"),
      createParameter("Interpretation / Comments"),
    ];
  }

  if (["hepatitisevirushevantibodyigm", "hevantibodyigm", "hepatitiseantibodyigm", "antihevigm"].includes(normalizedName)) {
    return [
      createParameter("Anti-HEV IgM", { normalRange: "Reactive / Non-reactive / Indeterminate" }),
      createParameter("Assay / Method"),
      createParameter("Specimen", { normalRange: "Serum or plasma, as validated by laboratory" }),
      createParameter("Signal / Cutoff Index, if reported"),
      createParameter("Anti-HEV IgG, if performed"),
      createParameter("HEV RNA, if performed"),
      createParameter("Exposure or Symptom Timing, if provided"),
      createParameter("Immunocompromised Status, if relevant"),
      createParameter("Interpretation / Comments"),
    ];
  }

  if (["hiviii", "hiv1and2", "hiv12screen"].includes(normalizedName)) {
    return [
      createParameter("HIV 1 & 2 Result", { normalRange: "Laboratory-validated qualitative interpretation" }),
      createParameter("Assay / Method"),
      createParameter("Specimen", { normalRange: "Specimen type accepted by the validated assay" }),
      createParameter("HIV-1/HIV-2 Antigen/Antibody Screen, if performed"),
      createParameter("HIV-1/HIV-2 Antibody Differentiation, if performed"),
      createParameter("HIV Nucleic Acid Test, if performed"),
      createParameter("Interpretation / Comments"),
    ];
  }

  if (["hlab27", "hlab27antigen"].includes(normalizedName)) {
    return [
      createParameter("HLA-B27 Result", { normalRange: "Present / absent, according to the validated assay" }),
      createParameter("Method / Platform"),
      createParameter("Specimen", { normalRange: "Whole blood, unless otherwise validated by laboratory" }),
      createParameter("Clinical Indication"),
      createParameter("Interpretation / Comments"),
    ];
  }

  if (normalizedName === "hangingdroppreparation") {
    return [
      createParameter("Specimen / Source"),
      createParameter("Macroscopic Description"),
      createParameter("Motility Observation", { normalRange: "Direct microscopy observation" }),
      createParameter("Organism Morphology / Observation"),
      createParameter("Method / Magnification"),
      createParameter("Correlation / Follow-up"),
    ];
  }

  if (["cultureforgnd", "cultureforgndiplococci", "gndculture", "gonococcalculture", "neisseriagonorrhoeaeculture"].includes(normalizedName)) {
    return [
      createParameter("Specimen / Collection Site"),
      createParameter("Direct Microscopy / Gram Stain"),
      createParameter("Gonococcal Culture Result", { normalRange: "No Neisseria gonorrhoeae isolated" }),
      createParameter("Organism Identification / Confirmation"),
      createParameter("Antimicrobial Susceptibility / MIC"),
      createParameter("Report Status"),
      createParameter("Comments"),
    ];
  }

  if (["cysticfibrosiscfgenemutation", "cysticfibrosisgenemutation", "cftrgenemutation", "cftrmutationanalysis", "cysticfibrosismutationanalysis"].includes(normalizedName)) {
    return [
      createParameter("Specimen"),
      createParameter("CFTR Test Method / Panel"),
      createParameter("CFTR Variant(s) Detected"),
      createParameter("Zygosity / Phase"),
      createParameter("Variant Classification"),
      createParameter("Overall Interpretation"),
      createParameter("Test Limitations / Coverage"),
      createParameter("Comments / Genetic Counselling"),
    ];
  }

  if (["cytomegaloviruscmvigg", "cytomegalovirusigg", "cmvigg", "cmvantibodyigg"].includes(normalizedName)) {
    return [
      createParameter("Cytomegalovirus (CMV) IgG", { normalRange: "Laboratory-validated assay interpretation" }),
      createParameter("Specimen"),
      createParameter("Method / Analyzer"),
      createParameter("Clinical Details / Indication"),
      createParameter("Comments"),
    ];
  }

  if (["c3complement3", "c3complement", "complement3", "complementc3"].includes(normalizedName)) {
    return [
      createParameter("Complement C3, Serum", { unit: "mg/dL", normalRange: "Laboratory-validated, age-specific reference interval" }),
      createParameter("Specimen"),
      createParameter("Collection Date / Time"),
      createParameter("Method / Analyzer"),
      createParameter("Clinical Indication"),
      createParameter("Comments"),
    ];
  }

  if (["c4complement4", "c4complement", "complement4", "complementc4"].includes(normalizedName)) {
    return [
      createParameter("Complement C4, Serum", { unit: "mg/dL", normalRange: "Laboratory-validated, age-specific reference interval" }),
      createParameter("Specimen"),
      createParameter("Collection Date / Time"),
      createParameter("Method / Analyzer"),
      createParameter("Clinical Indication"),
      createParameter("Comments"),
    ];
  }

  if (["cancaantipr3", "canca", "antipr3", "proteinase3antibody", "proteinase3antibodies"].includes(normalizedName)) {
    return [
      createParameter("cANCA (IIF) Result / Pattern", { normalRange: "Negative" }),
      createParameter("Anti-PR3 Antibody, IgG", { unit: "U/mL", normalRange: "Laboratory-validated assay interpretation" }),
      createParameter("Titre / Endpoint Dilution"),
      createParameter("Specimen"),
      createParameter("Method / Analyzer"),
      createParameter("Clinical Details / Indication"),
      createParameter("Comments"),
    ];
  }

  if (["cctcreatinineclearancetest", "creatinineclearancetest", "creatinineclearance", "cct"].includes(normalizedName)) {
    return [
      createParameter("Urine Creatinine Concentration", { unit: "mg/dL" }),
      createParameter("Total Urine Volume", { unit: "mL" }),
      createParameter("Collection Duration", { unit: "hours", normalRange: "24 hours unless otherwise stated" }),
      createParameter("Serum Creatinine", { unit: "mg/dL" }),
      {
        ...createParameter("Creatinine Clearance (Uncorrected)", { unit: "mL/min", normalRange: "Laboratory-validated, age- and sex-specific reference interval" }),
        entryMode: "calculated",
        calculationFormula: "{Urine Creatinine Concentration} * {Total Urine Volume} / {Serum Creatinine} / {Collection Duration} / 60",
        calculationPrecision: 1,
      },
      createParameter("Height", { unit: "cm" }),
      createParameter("Weight", { unit: "kg" }),
      createParameter("Method / Analyzer"),
      createParameter("Comments"),
    ];
  }

  if (["calcium24hrsurine", "calcium24hoururine", "calcium24hurine", "urinecalcium24hour", "24hoururinecalcium"].includes(normalizedName)) {
    return [
      createParameter("Calcium, Urine, 24 Hour", { unit: "mg/24 h", normalRange: "Laboratory-validated, age- and sex-specific reference interval" }),
      createParameter("Collection Duration", { unit: "hours", normalRange: "24 hours unless otherwise stated" }),
      createParameter("Total Urine Volume", { unit: "mL" }),
      createParameter("Urine Calcium Concentration", { unit: "mg/dL" }),
      createParameter("Collection Completeness / Preservative"),
      createParameter("Method / Analyzer"),
      createParameter("Comments"),
    ];
  }

  if (["capillaryfragilitytest", "capillaryfragility", "tourniquettest"].includes(normalizedName)) {
    return [
      createParameter("Capillary Fragility Test Result", { normalRange: "Laboratory-approved interpretation" }),
      createParameter("Petechiae Count", { unit: "count" }),
      createParameter("Test Site / Cuff Pressure"),
      createParameter("Method / Procedure"),
      createParameter("Comments"),
    ];
  }

  if (["osmoticfragilitytest", "osmoticfragility", "erythrocyteosmoticfragility", "rbcosmoticfragility"].includes(normalizedName)) {
    return [
      createParameter("Specimen / Anticoagulant"),
      createParameter("Unincubated Osmotic Fragility / Hemolysis"),
      createParameter("Incubated Osmotic Fragility / Hemolysis"),
      createParameter("Sodium Chloride Concentration(s) / Hemolysis Results"),
      createParameter("Patient / Shipping Control Status"),
      createParameter("Peripheral Smear Correlation, if performed"),
      createParameter("Recent Transfusion / Clinical Context, if provided"),
      createParameter("Method / Incubation Conditions"),
      createParameter("Interpretation / Comments"),
    ];
  }

  if (["cardiacprofile", "cardiacmarkerprofile"].includes(normalizedName)) {
    return [
      createParameter("Troponin I", { unit: "ng/L", normalRange: "Laboratory-validated assay interpretation" }),
      createParameter("Troponin T", { unit: "ng/L", normalRange: "Laboratory-validated assay interpretation" }),
      createParameter("CK-MB", { unit: "U/L", normalRange: "Laboratory-validated assay interpretation" }),
      createParameter("Total CK", { unit: "U/L", normalRange: "Laboratory-validated, age- and sex-specific reference interval" }),
      createParameter("BNP / NT-proBNP", { unit: "pg/mL", normalRange: "Laboratory-validated assay interpretation" }),
      createParameter("Collection Date / Time"),
      createParameter("Clinical Details / Indication"),
      createParameter("Comments"),
    ];
  }

  if (["ceruloplasmin", "ceruloplasminserum"].includes(normalizedName)) {
    return [
      createParameter("Ceruloplasmin, Serum", { unit: "mg/dL", normalRange: "Laboratory-validated, age- and sex-specific reference interval" }),
      createParameter("Specimen"),
      createParameter("Method / Analyzer"),
      createParameter("Comments"),
    ];
  }

  if (["cd3lymphocyte", "cd3tlymphocyte", "cd3tcell", "cd3tcellcount"].includes(normalizedName)) {
    return [
      createParameter("CD3+ T Lymphocytes", { unit: "% of lymphocytes", normalRange: "Laboratory-validated, age-specific reference interval" }),
      createParameter("CD3+ T Lymphocytes, Absolute Count", { unit: "cells/µL", normalRange: "Laboratory-validated, age-specific reference interval" }),
      createParameter("Total Lymphocyte Count", { unit: "cells/µL" }),
      createParameter("Specimen"),
      createParameter("Method / Analyzer"),
      createParameter("Lymphocyte Viability"),
      createParameter("Comments"),
    ];
  }

  if (["cd4lymphocyte", "cd4tlymphocyte", "cd4tcell", "cd4tcellcount"].includes(normalizedName)) {
    return [
      createParameter("CD4+ T Lymphocytes", { unit: "% of lymphocytes", normalRange: "Laboratory-validated, age-specific reference interval" }),
      createParameter("CD4+ T Lymphocytes, Absolute Count", { unit: "cells/µL", normalRange: "Laboratory-validated, age-specific reference interval" }),
      createParameter("Total Lymphocyte Count", { unit: "cells/µL" }),
      createParameter("Specimen"),
      createParameter("Method / Analyzer"),
      createParameter("Lymphocyte Viability"),
      createParameter("Comments"),
    ];
  }

  if (["cd8lymphocyte", "cd8tlymphocyte", "cd8tcell", "cd8tcellcount"].includes(normalizedName)) {
    return [
      createParameter("CD8+ T Lymphocytes", { unit: "% of lymphocytes", normalRange: "Laboratory-validated, age-specific reference interval" }),
      createParameter("CD8+ T Lymphocytes, Absolute Count", { unit: "cells/µL", normalRange: "Laboratory-validated, age-specific reference interval" }),
      createParameter("Total Lymphocyte Count", { unit: "cells/µL" }),
      createParameter("Specimen"), createParameter("Method / Analyzer"), createParameter("Lymphocyte Viability"), createParameter("Comments"),
    ];
  }

  if (["ceacarcinoembryonicantigen", "cea"].includes(normalizedName)) {
    return [createParameter("Carcinoembryonic Antigen (CEA)", { unit: "ng/mL", normalRange: "Laboratory-validated reference interval" }), createParameter("Specimen"), createParameter("Method / Analyzer"), createParameter("Clinical Indication"), createParameter("Comments")];
  }

  if (["colorectalcancermonitorprofile", "colorectalcancermonitor", "coloncancermonitorprofile"].includes(normalizedName)) {
    return [
      createParameter("Carcinoembryonic Antigen (CEA)", { unit: "ng/mL", normalRange: "Laboratory-validated reference interval" }),
      createParameter("CA 19-9", { unit: "U/mL", normalRange: "Laboratory-validated reference interval" }),
      createParameter("Zinc, Serum", { unit: "µg/dL", normalRange: "Laboratory-validated, age- and sex-specific reference interval" }),
      createParameter("Collection Date / Time"),
      createParameter("Clinical Details / Monitoring Context"),
      createParameter("Method / Analyzer"),
      createParameter("Comments"),
    ];
  }

  if (["oncologyprofile", "oncologymarkerprofile", "tumormarkerprofile", "tumourmarkerprofile"].includes(normalizedName)) {
    return [
      createParameter("Carcinoembryonic Antigen (CEA), if ordered", { unit: "ng/mL", normalRange: "Laboratory-validated reference interval / decision limit" }),
      createParameter("Alpha-Fetoprotein (AFP), if ordered", { unit: "ng/mL", normalRange: "Laboratory-validated reference interval / decision limit" }),
      createParameter("CA 19-9, if ordered", { unit: "U/mL", normalRange: "Laboratory-validated reference interval / decision limit" }),
      createParameter("CA 125, if ordered", { unit: "U/mL", normalRange: "Laboratory-validated reference interval / decision limit" }),
      createParameter("CA 15-3, if ordered", { unit: "U/mL", normalRange: "Laboratory-validated reference interval / decision limit" }),
      createParameter("PSA, Total, if ordered", { unit: "ng/mL", normalRange: "Laboratory-validated reference interval / decision limit" }),
      createParameter("Beta-hCG, if ordered", { unit: "mIU/mL", normalRange: "Laboratory-validated reference interval / decision limit" }),
      createParameter("Other Ordered Tumor Marker / Assay, if applicable"),
      createParameter("Collection Date / Time"),
      createParameter("Clinical Details / Monitoring Context, if provided"),
      createParameter("Method / Analyzer"),
      createParameter("Interpretation / Comments"),
    ];
  }

  if (["cftcompletefixsationtest", "cftcompletefixationtest", "cftcomplementfixationtest", "complementfixationtest", "complimentfixsationtest", "cft"].includes(normalizedName)) {
    return [createParameter("Target Antigen / Assay"), createParameter("Complement Fixation Result", { normalRange: "Laboratory-validated interpretation" }), createParameter("Complement Fixation Titre"), createParameter("Specimen"), createParameter("Method / Laboratory"), createParameter("Comments")];
  }

  if (["conjswabbotheye", "conjunctivalswabbotheye", "bilateralconjunctivalswab"].includes(normalizedName)) {
    return [
      createParameter("Right Eye Specimen / Site"),
      createParameter("Left Eye Specimen / Site"),
      createParameter("Right Eye Direct Microscopy / Gram Stain"),
      createParameter("Left Eye Direct Microscopy / Gram Stain"),
      createParameter("Right Eye Culture Result", { normalRange: "Laboratory-validated interpretation" }),
      createParameter("Left Eye Culture Result", { normalRange: "Laboratory-validated interpretation" }),
      createParameter("Right Eye Organism(s) Isolated"),
      createParameter("Left Eye Organism(s) Isolated"),
      createParameter("Right Eye Antimicrobial Susceptibility"),
      createParameter("Left Eye Antimicrobial Susceptibility"),
      createParameter("Collection Date / Time"),
      createParameter("Method / Laboratory"),
      createParameter("Comments"),
    ];
  }

  if (["conjswabcsrteye", "conjunctivalswabcultureandsensitivityrighteye", "rightconjunctivalswabcultureandsensitivity"].includes(normalizedName)) {
    return [
      createParameter("Right Eye Specimen / Site"),
      createParameter("Right Eye Direct Microscopy / Gram Stain"),
      createParameter("Right Eye Culture Result", { normalRange: "Laboratory-validated interpretation" }),
      createParameter("Right Eye Organism(s) Isolated"),
      createParameter("Right Eye Antimicrobial Susceptibility"),
      createParameter("Collection Date / Time"),
      createParameter("Method / Laboratory"),
      createParameter("Comments"),
    ];
  }

  if (["conjunctivalswabculture", "conjswabculture", "conjunctivalswabculturesensitivity"].includes(normalizedName)) {
    return [
      createParameter("Specimen / Site"),
      createParameter("Direct Microscopy / Gram Stain"),
      createParameter("Culture Result", { normalRange: "Laboratory-validated interpretation" }),
      createParameter("Organism(s) Isolated"),
      createParameter("Antimicrobial Susceptibility"),
      createParameter("Collection Date / Time"),
      createParameter("Method / Laboratory"),
      createParameter("Comments"),
    ];
  }

  if (["coppe24hrsurine", "copper24hrsurnine", "copper24hoursurine", "copper24hurine", "urinecopper24hour"].includes(normalizedName)) {
    return [
      createParameter("Copper, 24-Hour Urine", { unit: "mcg/24 h", normalRange: "Laboratory-validated reference interval" }),
      createParameter("Total Urine Volume", { unit: "mL" }),
      createParameter("Collection Duration", { unit: "hours", normalRange: "24" }),
      createParameter("Collection Start Date / Time"),
      createParameter("Collection End Date / Time"),
      createParameter("Method / Analyzer"),
      createParameter("Clinical Details / Indication"),
      createParameter("Comments"),
    ];
  }

  if (["copperurine", "urinecopper", "randomurinecopper"].includes(normalizedName)) {
    return [
      createParameter("Copper, Random Urine", { unit: "mcg/dL", normalRange: "Laboratory-validated reference interval" }),
      createParameter("Creatinine, Random Urine", { unit: "mg/dL", normalRange: "Laboratory-validated reference interval" }),
      createParameter("Copper / Creatinine Ratio", { unit: "mcg/g creatinine", normalRange: "Laboratory-validated, age- and sex-specific reference interval" }),
      createParameter("Specimen / Collection Type"),
      createParameter("Method / Analyzer"),
      createParameter("Clinical Details / Indication"),
      createParameter("Comments"),
    ];
  }

  if (["cortisolevening", "pmcortisol", "eveningcortisol"].includes(normalizedName)) {
    return [
      createParameter("Cortisol, Evening", { unit: "mcg/dL", normalRange: "Laboratory-validated p.m. reference interval" }),
      createParameter("Collection Date / Time"),
      createParameter("Collection Time"),
      createParameter("Specimen"),
      createParameter("Method / Analyzer"),
      createParameter("Clinical Details / Indication"),
      createParameter("Comments"),
    ];
  }

  if (["cortisolmidnight", "midnightcortisol", "latenightcortisol"].includes(normalizedName)) {
    return [
      createParameter("Cortisol, Midnight", { normalRange: "Laboratory-validated late-night reference interval" }),
      createParameter("Collection Date / Time"),
      createParameter("Collection Time"),
      createParameter("Specimen"),
      createParameter("Method / Analyzer"),
      createParameter("Clinical Details / Indication"),
      createParameter("Comments"),
    ];
  }

  if (["cortisolmorningevening", "morningeveningcortisol", "amandpmcortisol"].includes(normalizedName)) {
    return [
      createParameter("Cortisol, Morning", { unit: "mcg/dL", normalRange: "Laboratory-validated a.m. reference interval" }),
      createParameter("Morning Collection Date / Time"),
      createParameter("Cortisol, Evening", { unit: "mcg/dL", normalRange: "Laboratory-validated p.m. reference interval" }),
      createParameter("Evening Collection Date / Time"),
      createParameter("Specimen"),
      createParameter("Method / Analyzer"),
      createParameter("Clinical Details / Indication"),
      createParameter("Comments"),
    ];
  }

  if (["cortisolmorning", "morningcortisol", "amcortisol"].includes(normalizedName)) {
    return [
      createParameter("Cortisol, Morning", { unit: "mcg/dL", normalRange: "Laboratory-validated a.m. reference interval" }),
      createParameter("Collection Date / Time"),
      createParameter("Collection Time"),
      createParameter("Specimen"),
      createParameter("Method / Analyzer"),
      createParameter("Clinical Details / Indication"),
      createParameter("Comments"),
    ];
  }

  if (["cortisolmorningeveningmidnight", "morningeveningmidnightcortisol", "amandpmmidnightcortisol"].includes(normalizedName)) {
    return [
      createParameter("Cortisol, Morning", { unit: "mcg/dL", normalRange: "Laboratory-validated a.m. reference interval" }),
      createParameter("Morning Collection Date / Time"),
      createParameter("Cortisol, Evening", { unit: "mcg/dL", normalRange: "Laboratory-validated p.m. reference interval" }),
      createParameter("Evening Collection Date / Time"),
      createParameter("Cortisol, Midnight", { normalRange: "Laboratory-validated late-night reference interval" }),
      createParameter("Midnight Collection Date / Time"),
      createParameter("Specimen"),
      createParameter("Method / Analyzer"),
      createParameter("Clinical Details / Indication"),
      createParameter("Comments"),
    ];
  }

  if (["cpkwithckmb", "cpkckmb", "creatinephosphokinasewithckmb"].includes(normalizedName)) return [createParameter("Creatine Phosphokinase (CPK), Total", { unit: "U/L", normalRange: "Laboratory-validated, age- and sex-specific reference interval" }), createParameter("CK-MB", { unit: "U/L", normalRange: "Laboratory-validated reference interval" }), createParameter("Specimen"), createParameter("Method / Analyzer"), createParameter("Clinical Details / Indication"), createParameter("Comments")];

  if (["cpkcreatinephosphokinase", "creatinephosphokinase", "cpk", "cktotal", "totalck"].includes(normalizedName)) return [createParameter("Creatine Phosphokinase (CPK), Total", { unit: "U/L", normalRange: "Laboratory-validated, age- and sex-specific reference interval" }), createParameter("Specimen"), createParameter("Method / Analyzer"), createParameter("Clinical Details / Indication"), createParameter("Comments")];

  if (["ckmb", "creatinekinasemb"].includes(normalizedName)) return [createParameter("CK-MB", { unit: "U/L", normalRange: "Laboratory-validated reference interval" }), createParameter("Specimen"), createParameter("Method / Analyzer"), createParameter("Comments")];

  if (["bronchialbrushingforpap", "bronchiallavageforpap", "bronchialwashingforpap"].includes(normalizedName)) {
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

  if (["uricacidurine", "urineuricacid", "randomurineuricacid", "uricacidrandomurine", "uricacidurinerandom"].includes(normalizedName)) {
    return [
      createParameter("Uric Acid, Random Urine", { unit: "mg/dL", normalRange: "Laboratory-validated random urine interval or interpretive comment" }),
      createParameter("Specimen / Collection Type"),
      createParameter("Collection Date / Time"),
      createParameter("Method / Analyzer"),
      createParameter("Interpretation / Comments"),
    ];
  }

  if (["uricacid24hrsurine", "uricacid24hoururine", "uricacid24hoursurine", "24hoururineuricacid", "urineuricacid24hour"].includes(normalizedName)) {
    return [
      createParameter("Urine Uric Acid, 24 Hour", { unit: "mg/24 h", normalRange: "Adults: Male 200 - 1000; Female 250 - 750; use laboratory-validated interval" }),
      createParameter("Urine Uric Acid Concentration", { unit: "mg/dL" }),
      createParameter("Total Urine Volume", { unit: "mL" }),
      createParameter("Collection Duration", { unit: "hours" }),
      createParameter("Collection Start Date / Time"),
      createParameter("Collection End Date / Time"),
      createParameter("Method / Analyzer"),
      createParameter("Collection Completeness / Comments"),
    ];
  }

  if (["urea24hrsurine", "urea24hoururine", "urea24hoursurine", "24hoururineurea", "urineurea24hour"].includes(normalizedName)) {
    return [
      createParameter("Urine Urea, 24 Hour", { unit: "g/24 h", normalRange: "Adults: 7 - 42; use laboratory-validated interval" }),
      createParameter("Urine Urea Concentration", { unit: "mg/dL" }),
      createParameter("Total Urine Volume", { unit: "mL" }),
      createParameter("Collection Duration", { unit: "hours" }),
      createParameter("Collection Start Date / Time"),
      createParameter("Collection End Date / Time"),
      createParameter("Method / Analyzer"),
      createParameter("Collection Completeness / Comments"),
    ];
  }

  if (["urethraldischargecs", "urethraldischargecultureandsensitivity", "urethraldischargeculturesensitivity"].includes(normalizedName)) {
    return [
      createParameter("Specimen / Collection Site"),
      createParameter("Collection Date / Time"),
      createParameter("Clinical Details / Antimicrobial Exposure"),
      createParameter("Report Status"),
      createParameter("Direct Gram Stain, if performed"),
      createParameter("Culture Status / Result", { normalRange: "No pathogenic organism isolated; interpret with culture scope" }),
      createParameter("Culture Method / Scope"),
      createParameter("Organism(s) Isolated"),
      createParameter("Growth Quantity / Significance"),
      createParameter("Identification Method"),
      createParameter("Antimicrobial Susceptibility / MIC"),
      createParameter("Susceptibility Method / Interpretive Standard"),
      createParameter("Comments / Clinical Correlation"),
    ];
  }

  if (["urineacetone", "unineacetone", "acetoneurine"].includes(normalizedName)) {
    return [
      createParameter("Urine Acetone / Ketone Screen", { normalRange: "Negative (qualitative screen)" }),
      createParameter("Collection Date / Time"),
      createParameter("Method / Reagent"),
      createParameter("Grade / Semiquantitative Category, if reported"),
      createParameter("Specimen Quality / Handling"),
      createParameter("Interpretation / Comments"),
    ];
  }

  if (["ulcersmearforpap", "ulcersmearpap", "ulcersmearforpapanicolaou", "ulcercytologypapstain"].includes(normalizedName)) {
    return [
      createParameter("Specimen / Ulcer Site"),
      createParameter("Collection Date / Time"),
      createParameter("Clinical Details / Provisional Diagnosis"),
      createParameter("Preparation / Stain Method"),
      createParameter("Specimen Adequacy"),
      createParameter("Background / Inflammation / Necrosis"),
      createParameter("Epithelial / Cytologic Findings"),
      createParameter("Other Findings / Organisms"),
      createParameter("Cytologic Impression"),
      createParameter("Recommendations / Correlation"),
      createParameter("Comments / Limitations"),
    ];
  }

  if (["cervicalsmearforpapstain", "cervicalsmearpapstain", "cervicalpapsmear", "cervicalcytologypapsmear"].includes(normalizedName)) {
    return [
      createParameter("Specimen / Collection Site"),
      createParameter("Collection Date / Time"),
      createParameter("Clinical Details / Screening History"),
      createParameter("Preparation / Stain Method"),
      createParameter("Specimen Adequacy"),
      createParameter("Transformation Zone / Endocervical Component"),
      createParameter("General Categorization"),
      createParameter("Epithelial Cell Abnormality / Cytologic Interpretation"),
      createParameter("Additional Findings / Organisms"),
      createParameter("HPV Test / Ancillary Studies"),
      createParameter("Recommendations / Follow-up"),
      createParameter("Comments / Limitations"),
    ];
  }

  if (["cervicalswabgramstain", "cervicalgramstain", "endocervicalswabgramstain"].includes(normalizedName)) {
    return [
      createParameter("Specimen / Collection Site"),
      createParameter("Collection Date / Time"),
      createParameter("Smear Preparation / Stain Method"),
      createParameter("Inflammatory Cells / PMNs"),
      createParameter("Epithelial Cells / Clue Cells"),
      createParameter("Gram Stain Findings"),
      createParameter("Gram Reaction / Morphology"),
      createParameter("Nugent Score (If Performed)"),
      createParameter("Impression"),
      createParameter("Culture / NAAT Correlation"),
      createParameter("Comments / Limitations"),
    ];
  }

  if (["cervicalswabafbstain", "cervicalafbsmear", "endocervicalswabafbstain"].includes(normalizedName)) {
    return [
      createParameter("Specimen / Collection Site"), createParameter("Collection Date / Time"), createParameter("Stain Method"),
      createParameter("AFB Smear Microscopy Result"), createParameter("AFB Smear Grade / Quantitation"),
      createParameter("Specimen Adequacy / Volume"), createParameter("Microscopy Remarks"),
      createParameter("Culture / Molecular Test Status"), createParameter("Comments / Limitations"),
    ];
  }

  if (["chikungunyaigg", "chikungunyavirusigg", "antichikungunyaigg"].includes(normalizedName)) {
    return [
      createParameter("Chikungunya Virus IgG", { normalRange: "Laboratory-validated assay interpretation" }),
      createParameter("Chikungunya Virus IgM"), createParameter("Specimen"), createParameter("Method / Analyzer"),
      createParameter("Days Since Symptom Onset"), createParameter("Clinical Details / Travel History"), createParameter("Comments"),
    ];
  }

  if (["chikungunyaigm", "chikungunyavirusigm", "antichikungunyaigm"].includes(normalizedName)) {
    return [
      createParameter("Chikungunya Virus IgM", { normalRange: "Laboratory-validated assay interpretation" }),
      createParameter("Chikungunya Virus IgG"), createParameter("Specimen"), createParameter("Method / Analyzer"),
      createParameter("Days Since Symptom Onset"), createParameter("Clinical Details / Travel History"),
      createParameter("Confirmatory Neutralizing Antibody Test / Referral"), createParameter("Comments"),
    ];
  }

  if (["chlamydiaantibodyiggigm", "chlamydiaiggigm", "chlamydiatrachomatisiggigm", "chlamydiatrachomatisantibodyiggigm"].includes(normalizedName)) {
    return [
      createParameter("Chlamydia trachomatis IgG", { normalRange: "Laboratory-validated assay interpretation" }),
      createParameter("Chlamydia trachomatis IgM", { normalRange: "Laboratory-validated assay interpretation" }),
      createParameter("Specimen"), createParameter("Method / Analyzer"), createParameter("Clinical Details / Indication"),
      createParameter("Direct Detection / NAAT Result (If Performed)"), createParameter("Comments"),
    ];
  }

  if (["chlamydiaantigen", "chlamydiatrachomatisantigen", "ctantigen"].includes(normalizedName)) {
    return [
      createParameter("Chlamydia trachomatis Antigen", { normalRange: "Laboratory-validated assay interpretation" }),
      createParameter("Specimen / Collection Site"), createParameter("Collection Date / Time"),
      createParameter("Method / Kit / Analyzer"), createParameter("Assay Control Status"),
      createParameter("NAAT Result (If Performed)"), createParameter("Comments / Limitations"),
    ];
  }

  if (["chloriderandom", "randomurinechloride", "urinechloriderandom"].includes(normalizedName)) {
    return [
      createParameter("Urine Chloride", { unit: "mmol/L", normalRange: "Laboratory-validated interpretation; random urine reference interval not established" }),
      createParameter("Specimen / Collection Type"), createParameter("Collection Date / Time"),
      createParameter("Method / Analyzer"), createParameter("Concurrent Serum Electrolytes / Bicarbonate"),
      createParameter("Urine Sodium / Potassium (If Performed)"), createParameter("Comments"),
    ];
  }

  if (["chlorideserum", "serumchloride", "plasmachloride"].includes(normalizedName)) {
    return [
      createParameter("Serum Chloride", { unit: "mmol/L", normalRange: "98 - 107" }),
      createParameter("Specimen"), createParameter("Method / Analyzer"), createParameter("Serum Sodium"),
      createParameter("Serum Potassium"), createParameter("Serum Bicarbonate / Total CO2"),
      createParameter("Comments"),
    ];
  }

  if (["chloride24hrsure", "chloride24hrsurine", "chloride24hoururine", "24hoururinechloride", "urinechloride24hour"].includes(normalizedName)) {
    return [
      createParameter("Urine Chloride, 24 Hour", { unit: "mmol/24 h", normalRange: "110 - 250" }),
      createParameter("Collection Start Date / Time"), createParameter("Collection End Date / Time"),
      createParameter("Collection Duration"), createParameter("Total Urine Volume", { unit: "mL" }),
      createParameter("Method / Analyzer"), createParameter("Collection Completeness / Comments"),
    ];
  }

  if (["cholesteroltotal", "totalcholesterol", "cholesterol", "cholesterolserum"].includes(normalizedName)) {
    return [
      createParameter("Total Cholesterol", { unit: "mg/dL", normalRange: "< 200" }),
      createParameter("Specimen"), createParameter("Fasting Status"), createParameter("Method / Analyzer"),
      createParameter("HDL Cholesterol (If Performed)"), createParameter("LDL Cholesterol (If Performed)"),
      createParameter("Triglycerides (If Performed)"), createParameter("Comments"),
    ];
  }

  if (["clostridioidesdifficiletoxin", "clostridiumdifficiletoxin", "cdifftoxin"].includes(normalizedName)) {
    return [
      createParameter("C. difficile Toxin A/B", { normalRange: "Not detected" }), createParameter("Specimen / Consistency"),
      createParameter("Method / Assay"), createParameter("GDH Antigen (If Performed)"), createParameter("NAAT / PCR (If Performed)"), createParameter("Comments / Limitations"),
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

  if (["microalbuminurine", "urinemicroalbumin", "microalbuminuria"].includes(normalizedName)) {
    return [
      createParameter("Urine Albumin (Microalbumin)", { unit: "mg/L", normalRange: "Laboratory-validated, method-specific reference interval" }),
      createParameter("Specimen / Collection Type"),
      createParameter("Urine Creatinine, if measured", { unit: "mg/dL", normalRange: "Laboratory-validated reference interval" }),
      createParameter("Urine Albumin-Creatinine Ratio (UACR), if requested", { unit: "mg/g", normalRange: "< 30; interpret with laboratory method and clinical context" }),
      createParameter("Method / Analyzer"),
      createParameter("Clinical Context / Relevant Conditions, if provided"),
      createParameter("Interpretation / Comments"),
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

  if (["jointfluidforprotein", "jointfluidprotein", "proteinjointfluid", "synovialfluidprotein"].includes(normalizedName)) {
    return [
      createParameter("Total Protein, Joint Fluid", { unit: "g/dL", normalRange: "Laboratory-validated joint-fluid interval or interpretive comment" }),
      createParameter("Joint / Aspiration Site"),
      createParameter("Collection Date / Time"),
      createParameter("Appearance"),
      createParameter("Paired Serum Total Protein, if measured", { unit: "g/dL" }),
      createParameter("Method / Analyzer"),
      createParameter("Interpretation / Comments"),
    ];
  }

  if (["csffluidforchloride", "csffluidchloride", "chloridecsf", "csfchloride", "cerebrospinalfluidchloride"].includes(normalizedName)) {
    return [
      createParameter("Chloride, CSF", { unit: "mmol/L", normalRange: "Laboratory-validated, age-specific reference interval" }),
      createParameter("Collection Date / Time"),
      createParameter("Appearance"),
      createParameter("Method / Analyzer"),
      createParameter("Comments"),
    ];
  }

  if (["csffluidforprotein", "csffluidprotein", "proteincsf", "csfprotein", "cerebrospinalfluidprotein"].includes(normalizedName)) {
    return [
      createParameter("Total Protein, CSF", { unit: "mg/dL", normalRange: "Laboratory-validated, age-specific reference interval" }),
      createParameter("Collection Date / Time"),
      createParameter("Appearance"),
      createParameter("Method / Analyzer"),
      createParameter("Specimen Quality / Blood Contamination"),
      createParameter("Comments"),
    ];
  }

  if (["csffluidforspecificgravity", "csffluidspecificgravity", "specificgravitycsf", "csfspecificgravity", "cerebrospinalfluidspecificgravity"].includes(normalizedName)) {
    return [
      createParameter("Specific Gravity, CSF", { normalRange: "Laboratory-validated, method-specific reference interval" }),
      createParameter("Collection Date / Time"),
      createParameter("Appearance"),
      createParameter("Method / Instrument"),
      createParameter("Specimen Quality / Blood Contamination"),
      createParameter("Comments"),
    ];
  }

  if (["csffluidforsugar", "csffluidglucose", "glucosecsf", "csfglucose", "cerebrospinalfluidglucose"].includes(normalizedName)) {
    return [
      createParameter("Glucose, CSF", { unit: "mg/dL", normalRange: "Laboratory-validated, age-specific reference interval" }),
      createParameter("Paired Serum / Plasma Glucose", { unit: "mg/dL" }),
      {
        ...createParameter("CSF / Serum Glucose Ratio", { normalRange: "Laboratory-validated interpretation; paired sample required" }),
        entryMode: "calculated",
        calculationFormula: "{Glucose, CSF} / {Paired Serum / Plasma Glucose}",
        calculationPrecision: 2,
      },
      createParameter("Collection Date / Time"),
      createParameter("Method / Analyzer"),
      createParameter("Comments"),
    ];
  }

  if (["jointfluidforsugar", "jointfluidglucose", "glucosejointfluid", "synovialfluidglucose"].includes(normalizedName)) {
    return [
      createParameter("Glucose, Joint Fluid", { unit: "mg/dL", normalRange: "Laboratory-validated joint-fluid interpretation" }),
      createParameter("Paired Serum / Plasma Glucose, if measured", { unit: "mg/dL" }),
      createParameter("Joint / Aspiration Site"),
      createParameter("Collection Date / Time"),
      createParameter("Appearance"),
      createParameter("Method / Analyzer"),
      createParameter("Interpretation / Comments"),
    ];
  }

  if (["kahntest", "kahn"].includes(normalizedName)) {
    return [
      createParameter("Kahn Test Result", { normalRange: "Non-reactive" }),
      createParameter("Kahn Test Titre, if reactive"),
      createParameter("Specimen", { normalRange: "Serum" }),
      createParameter("Method / Antigen Preparation"),
      createParameter("Treponemal Confirmatory Test, if performed"),
      createParameter("Previous Non-treponemal Test / Titre, if available"),
      createParameter("Interpretation / Comments"),
    ];
  }

  if (["kalazarrapidtest", "kalaazarrapidtest", "kalazar", "kalaazar", "rk39rapidtest", "rk39"].includes(normalizedName)) {
    return [
      createParameter("Kala-azar Rapid Test Result", { normalRange: "Non-reactive" }),
      createParameter("Specimen", { normalRange: "Use only specimen types validated by the test kit and laboratory" }),
      createParameter("Rapid Test Device / Kit"),
      createParameter("Lot Number / Expiry, if recorded"),
      createParameter("Read Time / Test Validity"),
      createParameter("Clinical History / Endemic-area Exposure, if provided"),
      createParameter("Additional / Confirmatory Testing, if performed"),
      createParameter("Interpretation / Comments"),
    ];
  }

  if (["leishmaniakalaazarantibodyigg", "leishmaniaantibodyigg", "kalaazarantibodyigg", "antileishmaniaigg"].includes(normalizedName)) {
    return [
      createParameter("Leishmania / Kala-azar Antibody IgG, Serum", { normalRange: "Negative" }),
      createParameter("Antibody Index / Titre, if applicable"),
      createParameter("Assay / Antigen Used"),
      createParameter("Clinical History / Endemic-area Exposure, if provided"),
      createParameter("Additional Parasitological / Molecular Testing, if performed"),
      createParameter("Interpretation / Comments"),
    ];
  }

  if (["leishmaniakalaazarantibodyigm", "leishmaniaantibodyigm", "kalaazarantibodyigm", "antileishmaniaigm"].includes(normalizedName)) {
    return [
      createParameter("Leishmania / Kala-azar Antibody IgM, Serum", { normalRange: "Negative" }),
      createParameter("Antibody Index / Titre, if applicable"),
      createParameter("Assay / Antigen Used"),
      createParameter("Clinical History / Endemic-area Exposure, if provided"),
      createParameter("Additional Parasitological / Molecular Testing, if performed"),
      createParameter("Interpretation / Comments"),
    ];
  }

  if (["leptospiraantibodiesiggigm", "leptospiraiggigm", "antileptospiraiggigm"].includes(normalizedName)) {
    return [
      createParameter("Leptospira Antibody IgG, Serum", { normalRange: "Negative / non-reactive (assay-specific)" }),
      createParameter("Leptospira Antibody IgM, Serum", { normalRange: "Negative / non-reactive (assay-specific)" }),
      createParameter("Assay / Method"),
      createParameter("Symptom Onset / Days of Illness, if provided"),
      createParameter("Clinical / Exposure History, if provided"),
      createParameter("MAT / PCR / Other Confirmatory Testing, if performed"),
      createParameter("Interpretation / Comments"),
    ];
  }

  if (["leptospiraantibodyigg", "leptospiraigg", "antileptospiraigg"].includes(normalizedName)) {
    return [
      createParameter("Leptospira Antibody IgG, Serum", { normalRange: "Negative / non-reactive (assay-specific)" }),
      createParameter("Antibody Index / Titre, if applicable"),
      createParameter("Assay / Method"),
      createParameter("Symptom Onset / Days of Illness, if provided"),
      createParameter("Clinical / Exposure History, if provided"),
      createParameter("MAT / PCR / Other Confirmatory Testing, if performed"),
      createParameter("Interpretation / Comments"),
    ];
  }

  if (["leptospiraantibodyigm", "leptospiraigm", "antileptospiraigm"].includes(normalizedName)) {
    return [
      createParameter("Leptospira Antibody IgM, Serum", { normalRange: "Negative / non-reactive (assay-specific)" }),
      createParameter("Antibody Index / Titre, if applicable"),
      createParameter("Assay / Method"),
      createParameter("Symptom Onset / Days of Illness, if provided"),
      createParameter("Clinical / Exposure History, if provided"),
      createParameter("MAT / PCR / Other Confirmatory Testing, if performed"),
      createParameter("Interpretation / Comments"),
    ];
  }

  if (["lipidcomprehensiveprofile", "comprehensivelipidprofile", "advancedlipidprofile"].includes(normalizedName)) {
    return [
      createParameter("Total Cholesterol", { unit: "mg/dL", normalRange: "Laboratory-validated reference interval" }),
      createParameter("Triglycerides", { unit: "mg/dL", normalRange: "Laboratory-validated reference interval" }),
      createParameter("HDL Cholesterol", { unit: "mg/dL", normalRange: "Laboratory-validated reference interval" }),
      createParameter("LDL Cholesterol", { unit: "mg/dL", normalRange: "Laboratory-validated reference interval" }),
      createParameter("VLDL Cholesterol", { unit: "mg/dL", normalRange: "Laboratory-validated reference interval" }),
      createParameter("Non-HDL Cholesterol", { unit: "mg/dL", normalRange: "Calculated from total cholesterol and HDL cholesterol" }),
      createParameter("Total Cholesterol / HDL Ratio"),
      createParameter("LDL Cholesterol / HDL Ratio"),
      createParameter("Apolipoprotein A1, if ordered"),
      createParameter("Apolipoprotein B, if ordered"),
      createParameter("Apolipoprotein B / A1 Ratio, if ordered"),
      createParameter("Lipoprotein(a), if ordered"),
      createParameter("Fasting Status / Collection Details"),
      createParameter("Method / Analyzer"),
      createParameter("Comments"),
    ];
  }

  if (["lipoprotein", "lipoproteintest"].includes(normalizedName)) {
    return [
      createParameter("Lipoprotein Analyte / Fraction"),
      createParameter("Lipoprotein Result"),
      createParameter("Unit"),
      createParameter("Laboratory Reference Interval / Decision Limit"),
      createParameter("Assay / Method"),
      createParameter("Fasting Status / Collection Details"),
      createParameter("Clinical Indication / Relevant History, if provided"),
      createParameter("Interpretation / Comments"),
    ];
  }

  if (["lipoproteinprofile", "lipoproteinpanel"].includes(normalizedName)) {
    return [
      createParameter("Total Cholesterol", { unit: "mg/dL", normalRange: "Laboratory-validated reference interval" }),
      createParameter("Triglycerides", { unit: "mg/dL", normalRange: "Laboratory-validated reference interval" }),
      createParameter("HDL Cholesterol", { unit: "mg/dL", normalRange: "Laboratory-validated reference interval" }),
      createParameter("LDL Cholesterol", { unit: "mg/dL", normalRange: "Laboratory-validated reference interval" }),
      createParameter("VLDL Cholesterol", { unit: "mg/dL", normalRange: "Laboratory-validated reference interval" }),
      createParameter("Non-HDL Cholesterol", { unit: "mg/dL", normalRange: "Calculated from total cholesterol and HDL cholesterol" }),
      createParameter("Total Cholesterol / HDL Ratio"),
      createParameter("LDL Cholesterol / HDL Ratio"),
      createParameter("Fasting Status / Collection Details"),
      createParameter("Method / Analyzer"),
      createParameter("Comments"),
    ];
  }

  if (["lithium", "lithiumserum", "lithiumlevel"].includes(normalizedName)) {
    return [
      createParameter("Lithium, Serum", { unit: "mmol/L", normalRange: "Laboratory-validated therapeutic interval; collection timing required" }),
      createParameter("Date / Time of Last Dose"),
      createParameter("Date / Time of Collection"),
      createParameter("Time Since Last Dose / Trough Status"),
      createParameter("Current Lithium Dose / Regimen, if provided"),
      createParameter("Clinical Indication / Symptoms, if provided"),
      createParameter("Renal Function / Electrolyte Context, if provided"),
      createParameter("Method / Analyzer"),
      createParameter("Interpretation / Comments"),
    ];
  }

  if (["liverbiopsy", "histopathologyliverbiopsy"].includes(normalizedName)) {
    return [
      createParameter("Clinical History / Indication"),
      createParameter("Specimen / Site", { normalRange: "Liver tissue" }),
      createParameter("Procedure / Biopsy Type"),
      createParameter("Fixative / Specimen Received In"),
      createParameter("Gross Description"),
      createParameter("Number / Length of Cores, if applicable"),
      createParameter("Microscopic Description"),
      createParameter("Portal Tracts / Inflammation"),
      createParameter("Steatosis / Steatohepatitis"),
      createParameter("Necrosis / Cholestasis"),
      createParameter("Fibrosis / Stage, if assessed"),
      createParameter("Special Stains / IHC / Ancillary Studies"),
      createParameter("Final Diagnosis"),
      createParameter("Comment / Clinicoradiological Correlation"),
    ];
  }

  if (["livercancermonitorprofile", "livercancermonitor", "hepatocellularcarcinomamonitorprofile"].includes(normalizedName)) {
    return [
      createParameter("Alpha-Fetoprotein (AFP)", { unit: "ng/mL", normalRange: "Laboratory-validated reference interval / decision limit" }),
      createParameter("AFP-L3%, if performed", { unit: "%", normalRange: "Laboratory-validated reference interval / decision limit" }),
      createParameter("Des-gamma-carboxy Prothrombin (DCP / PIVKA-II), if performed", { unit: "mAU/mL", normalRange: "Laboratory-validated reference interval / decision limit" }),
      createParameter("Collection Date / Time"),
      createParameter("Monitoring Context / Prior Result, if provided"),
      createParameter("Method / Analyzer"),
      createParameter("Interpretation / Comments"),
    ];
  }

  if (["lupusanticoagulant", "lupusanticoagulantprofile", "laevaluation"].includes(normalizedName)) {
    return [
      createParameter("aPTT Screen", { unit: "seconds", normalRange: "Laboratory-validated reference interval" }),
      createParameter("dRVVT Screen Ratio", { normalRange: "Laboratory-validated reference interval / decision limit" }),
      createParameter("dRVVT Mix Ratio, if performed", { normalRange: "Laboratory-validated reference interval / decision limit" }),
      createParameter("dRVVT Confirm Ratio, if performed", { normalRange: "Laboratory-validated reference interval / decision limit" }),
      createParameter("Lupus-sensitive aPTT / Silica Clotting Time, if performed", { unit: "seconds", normalRange: "Laboratory-validated reference interval / decision limit" }),
      createParameter("Mixing Study / Phospholipid Neutralization, if performed"),
      createParameter("Anticoagulant / Heparin Exposure, if known"),
      createParameter("Final Lupus Anticoagulant Interpretation"),
      createParameter("Method / Analyzer"),
      createParameter("Comments / Limitations"),
    ];
  }

  if (["mdmascreen", "mdmaurinescreen", "ecstasyscreen"].includes(normalizedName)) {
    return [
      createParameter("MDMA Screen Result", { normalRange: "Not detected" }),
      createParameter("Screening Cutoff / Decision Limit", { unit: "ng/mL", normalRange: "Laboratory-validated cutoff" }),
      createParameter("Specimen Validity / Collection Details"),
      createParameter("Screening Method"),
      createParameter("Confirmation Test / Result, if performed"),
      createParameter("Interpretation / Comments"),
    ];
  }

  if (["magnesiumurine", "urinemagnesium", "magnesium24hoururine"].includes(normalizedName)) {
    return [
      createParameter("Magnesium, Urine", { unit: "mg/24 hours", normalRange: "Laboratory-validated reference interval" }),
      createParameter("Collection Type / Duration", { normalRange: "State random or timed collection duration" }),
      createParameter("Total Urine Volume", { unit: "mL" }),
      createParameter("Urine Magnesium Concentration, if reported", { unit: "mg/dL", normalRange: "Laboratory-validated reference interval" }),
      createParameter("Urine Creatinine / Magnesium-Creatinine Ratio, if performed", { normalRange: "Laboratory-validated reference interval" }),
      createParameter("Concurrent Serum Magnesium, if provided", { unit: "mg/dL", normalRange: "Laboratory-validated reference interval" }),
      createParameter("Method / Analyzer"),
      createParameter("Interpretation / Comments"),
    ];
  }

  if (["malariapanpfantigen", "malariapfpanantigen", "malariapanpfag", "malariaantigenpanpf"].includes(normalizedName)) {
    return [
      createParameter("P. falciparum (Pf) Antigen"),
      createParameter("Pan-malarial Antigen"),
      createParameter("Test Control / Validity"),
      createParameter("Rapid Test Kit / Method"),
      createParameter("Peripheral Smear / Microscopy Result, if performed"),
      createParameter("Species / Parasitemia, if determined"),
      createParameter("Interpretation / Comments"),
    ];
  }

  if (["optimalitantigen", "optimalitmalariaantigen", "optimalit", "optimalitrdt"].includes(normalizedName)) {
    return [
      createParameter("P. falciparum-specific pLDH Result"),
      createParameter("Pan-Plasmodium pLDH Result"),
      createParameter("Test Control / Validity"),
      createParameter("OptiMAL-IT Result Interpretation", { normalRange: "Not detected / Pf detected / non-Pf detected / invalid per kit instructions" }),
      createParameter("Rapid Test Kit / Method"),
      createParameter("Peripheral Smear / Microscopy Result, if performed"),
      createParameter("Plasmodium Species / Parasitemia, if determined"),
      createParameter("Interpretation / Comments"),
    ];
  }

  if (["malariaprofile", "malariapanel", "malariaworkupprofile"].includes(normalizedName)) {
    return [
      createParameter("Malaria Rapid Antigen Result, if performed"),
      createParameter("P. falciparum (Pf) Antigen, if performed"),
      createParameter("Pan-malarial Antigen, if performed"),
      createParameter("Thick Blood Film / Parasite Detection"),
      createParameter("Thin Blood Film / Species Identification"),
      createParameter("Plasmodium Species, if identified"),
      createParameter("Parasite Stage / Morphology, if reported"),
      createParameter("Parasitemia / Parasite Density, if positive"),
      createParameter("Microscopy Stain / Method"),
      createParameter("Interpretation / Comments"),
    ];
  }

  if (["maleinfertilityprofile", "maleinfertilitypanel", "infertilityprofilemale"].includes(normalizedName)) {
    return [
      createParameter("Follicle Stimulating Hormone (FSH)", { unit: "mIU/mL", normalRange: "Laboratory-validated adult male reference interval" }),
      createParameter("Luteinizing Hormone (LH)", { unit: "mIU/mL", normalRange: "Laboratory-validated adult male reference interval" }),
      createParameter("Total Testosterone", { unit: "ng/dL", normalRange: "Laboratory-validated adult male reference interval" }),
      createParameter("Prolactin", { unit: "ng/mL", normalRange: "Laboratory-validated adult male reference interval" }),
      createParameter("Estradiol, if performed", { unit: "pg/mL", normalRange: "Laboratory-validated adult male reference interval" }),
      createParameter("Thyroid Stimulating Hormone (TSH), if performed", { unit: "mIU/L", normalRange: "Laboratory-validated reference interval" }),
      createParameter("Semen Analysis Correlation, if available"),
      createParameter("Collection Time / Clinical Details"),
      createParameter("Method / Analyzer"),
      createParameter("Interpretation / Comments"),
    ];
  }

  if (["manganese", "manganeseserum", "manganesewholeblood"].includes(normalizedName)) {
    return [
      createParameter("Manganese", { unit: "ng/mL", normalRange: "Laboratory-validated specimen-specific reference interval" }),
      createParameter("Specimen / Matrix"),
      createParameter("Collection / Trace-Element Precautions"),
      createParameter("Exposure History / Clinical Context, if provided"),
      createParameter("Method / Analyzer"),
      createParameter("Interpretation / Comments"),
    ];
  }

  if (["measlesrubeolaantibodyigg", "measlesrubeolaigg", "measlesigg", "rubeolaigg"].includes(normalizedName)) {
    return [
      createParameter("Measles (Rubeola) IgG Antibody Result", { normalRange: "Negative / equivocal / positive per assay" }),
      createParameter("Measles IgG Antibody Index / Titre, if reported", { normalRange: "Assay-specific qualitative cutoff" }),
      createParameter("Specimen Collection Date / Clinical Context, if provided"),
      createParameter("Vaccination / Exposure History, if provided"),
      createParameter("Method / Analyzer"),
      createParameter("Interpretation / Comments"),
    ];
  }

  if (["measlesrubeolaantibodyigm", "measlesrubeolaigm", "measlesigm", "rubeolaigm"].includes(normalizedName)) {
    return [
      createParameter("Measles (Rubeola) IgM Antibody Result", { normalRange: "Negative / equivocal / positive per assay" }),
      createParameter("Rash / Symptom Onset Date, if provided"),
      createParameter("Specimen Collection Date"),
      createParameter("Measles IgG Result, if available"),
      createParameter("Vaccination / Exposure History, if provided"),
      createParameter("Method / Analyzer"),
      createParameter("Interpretation / Comments"),
    ];
  }

  if (["menstrualbloodfortbpcr", "menstrualbloodtbpcr", "endometrialmenstrualbloodtbpcr"].includes(normalizedName)) {
    return [
      createParameter("MTB Complex PCR Result", { normalRange: "Not detected / detected / invalid per assay" }),
      createParameter("Rifampicin Resistance Result, if applicable"),
      createParameter("Specimen Adequacy / Processing Status"),
      createParameter("Internal Control / Inhibition Status"),
      createParameter("Assay / Platform"),
      createParameter("AFB Smear / Culture Correlation, if available"),
      createParameter("Clinical / Sampling Context, if provided"),
      createParameter("Interpretation / Comments"),
    ];
  }

  if (["csffluidforafbstain", "csffluidafbstain", "afbstaincsf", "csfafbstain", "cerebrospinalfluidafbstain"].includes(normalizedName)) {
    return [
      createParameter("AFB Smear Microscopy Result"),
      createParameter("AFB Smear Grade / Quantitation"),
      createParameter("Stain Method"),
      createParameter("Specimen Adequacy / Volume"),
      createParameter("Microscopy Remarks"),
      createParameter("Culture / Molecular Test Status"),
      createParameter("Comments"),
    ];
  }

  if (["urethralswabafbstain", "urethralswabforafb", "urethralafbstain", "afbstainurethralswab"].includes(normalizedName)) {
    return [
      createParameter("AFB Smear Microscopy Result", { normalRange: "No acid-fast bacilli seen" }),
      createParameter("Specimen / Collection Site"),
      createParameter("Collection Date / Time"),
      createParameter("Stain Method"),
      createParameter("Smear Preparation / Processing"),
      createParameter("Specimen Adequacy"),
      createParameter("AFB Smear Grade / Quantitation"),
      createParameter("Microscopy Remarks"),
      createParameter("Impression"),
      createParameter("Culture / Molecular Test Status, if performed"),
      createParameter("Comments / Limitations"),
    ];
  }

  if (["throatswabforafb", "throatafbstain", "throatswabafbstain", "afbstainthroatswab"].includes(normalizedName)) {
    return [
      createParameter("AFB Smear Microscopy Result"),
      createParameter("AFB Smear Grade / Quantitation"),
      createParameter("Stain Method"),
      createParameter("Specimen Adequacy / Processing Notes"),
      createParameter("Microscopy Remarks"),
      createParameter("Culture / Molecular Test Status"),
      createParameter("Comments"),
    ];
  }

  if (["csffluidforgramstain", "csffluidgramstain", "gramstaincsf", "csfgramstain", "cerebrospinalfluidgramstain"].includes(normalizedName)) {
    return [
      createParameter("Specimen / Collection Site"),
      createParameter("Smear Method / Preparation"),
      createParameter("Inflammatory Cells / PMNs"),
      createParameter("Gram Stain Findings"),
      createParameter("Gram Reaction / Bacterial Morphology"),
      createParameter("Impression"),
      createParameter("Culture / Molecular Test Status"),
      createParameter("Comments"),
    ];
  }

  if (["jointfluidforgramstain", "jointfluidgramstain", "gramstainjointfluid", "synovialfluidgramstain"].includes(normalizedName)) {
    return [
      createParameter("Joint / Aspiration Site"),
      createParameter("Specimen", { normalRange: "Joint (synovial) fluid" }),
      createParameter("Smear Method / Preparation"),
      createParameter("Inflammatory Cells / PMNs"),
      createParameter("Gram Stain Findings"),
      createParameter("Gram Reaction / Bacterial Morphology"),
      createParameter("Impression"),
      createParameter("Culture / Molecular Test Status"),
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

  if (["jointfluidforchloride", "jointfluidchloride", "chloridejointfluid", "synovialfluidchloride"].includes(normalizedName)) {
    return [
      createParameter("Chloride, Joint Fluid", { unit: "mmol/L", normalRange: "Laboratory-validated joint-fluid interval or interpretive comment" }),
      createParameter("Joint / Aspiration Site"),
      createParameter("Collection Date / Time"),
      createParameter("Appearance"),
      createParameter("Paired Serum Chloride, if measured", { unit: "mmol/L" }),
      createParameter("Method / Analyzer"),
      createParameter("Interpretation / Comments"),
    ];
  }

  if (["bodyfluidsbiochemistry", "bodyfluidbiochemistry"].includes(normalizedName)) {
    return [
      createParameter("Fluid Type / Source"),
      createParameter("Collection Date / Time"),
      createParameter("Appearance"),
      createParameter("Total Protein, Body Fluid", { unit: "g/dL", normalRange: "Fluid-specific / interpretive" }),
      createParameter("Albumin, Body Fluid", { unit: "g/dL", normalRange: "Fluid-specific / interpretive" }),
      createParameter("Glucose, Body Fluid", { unit: "mg/dL", normalRange: "Fluid-specific / interpretive" }),
      createParameter("LDH, Body Fluid", { unit: "U/L", normalRange: "Fluid-specific / interpretive" }),
      createParameter("Additional Biochemistry / Findings"),
      createParameter("Method / Analyzer"),
      createParameter("Comments"),
    ];
  }

  if (["bodyfluidsforspecificgravity", "bodyfluidforspecificgravity", "bodyfluidspecificgravity"].includes(normalizedName)) {
    return [
      createParameter("Specific Gravity, Body Fluid", { normalRange: "Fluid-specific / interpretive" }),
      createParameter("Fluid Type / Source"),
      createParameter("Collection Date / Time"),
      createParameter("Appearance"),
      createParameter("Method / Instrument"),
      createParameter("Comments"),
    ];
  }

  if (["jointfluidforspecificgravity", "jointfluidspecificgravity", "specificgravityjointfluid", "synovialfluidspecificgravity"].includes(normalizedName)) {
    return [
      createParameter("Specific Gravity, Joint Fluid", { normalRange: "Laboratory-validated joint-fluid interpretation" }),
      createParameter("Joint / Aspiration Site"),
      createParameter("Collection Date / Time"),
      createParameter("Appearance"),
      createParameter("Method / Instrument"),
      createParameter("Interpretation / Comments"),
    ];
  }

  if (["bronchialwashingforcs", "bronchialwashingcultureandsensitivity", "bronchialwashingculturesensitivity"].includes(normalizedName)) {
    return [
      createParameter("Culture Status / Result", { normalRange: "No growth" }),
      createParameter("Bronchial Site / Procedure"),
      createParameter("Collection Date / Time"),
      createParameter("Clinical Indication"),
      createParameter("Report Status"),
      createParameter("Direct Gram Stain"),
      createParameter("Aerobic Culture", { normalRange: "No growth" }),
      createParameter("Culture Quantity / Semi-quantitation"),
      createParameter("Organism(s) Isolated", { normalRange: "No growth" }),
      createParameter("Identification Method"),
      createParameter("Antimicrobial Susceptibility"),
      createParameter("Resistance Markers / Alerts"),
      createParameter("Comments"),
    ];
  }

  if (["baccalsmearforbrrbody", "buccalsmearforbarrbody", "buccalsmearforsexchromation", "buccalsmearforsexchromatin"].includes(normalizedName)
    || normalizedName.startsWith("buccalsmearforsexchromationb")) {
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

  if (["fluidaspirationcytology", "bodyfluidaspirationcytology", "fluidcytology"].includes(normalizedName)) {
    return [
      createParameter("Specimen / Aspiration Site"),
      createParameter("Fluid Volume / Gross Appearance"),
      createParameter("Clinical History / Imaging Findings"),
      createParameter("Preparation / Stains"),
      createParameter("Specimen Adequacy / Cellularity"),
      createParameter("Microscopic Description"),
      createParameter("Diagnostic Category"),
      createParameter("Cytologic Impression / Diagnosis"),
      createParameter("Ancillary Studies / Cell Block"),
      createParameter("Advice / Correlation"),
      createParameter("Comments"),
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
