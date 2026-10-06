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
