const express = require("express");
const { all, get, run, transaction } = require("../db/helpers");
const { allowPermissions } = require("../middleware/auth");
const { logAction } = require("../services/logService");
const { PERMISSIONS } = require("../config/constants");

const testRouter = express.Router();
const { buildReportHtml } = require("../utils/reportFormatter");
const { getBusinessSettings } = require("../services/businessSettingsService");
const { getTestReportPreviewUrl } = require("../utils/patientPortal");
const { getBundleComponentTests } = require("../services/testBundleService");
const { getFallbackReportParameters } = require("../services/reportSchemaService");
const { getCellReportPreviewValue } = require("../services/cellReportService");
const { isBillingOnlyTest, BILLING_ONLY_MESSAGE } = require('../../frontend/scripts/reportEligibility');

function normalizeParameterDefinition(parameter = {}) {
  const entryMode = (parameter.entryMode || parameter.entry_mode) === "calculated"
    ? "calculated"
    : "manual";
  const requestedPrecision = Number(parameter.calculationPrecision ?? parameter.calculation_precision ?? 2);

  return {
    parameterName: String(parameter.parameterName || parameter.parameter_name || "").trim(),
    unit: String(parameter.unit || "").trim(),
    normalRange: String(parameter.normalRange || parameter.normal_range || "").trim(),
    entryMode,
    calculationFormula: entryMode === "calculated"
      ? String(parameter.calculationFormula || parameter.calculation_formula || "").trim() || null
      : null,
    calculationPrecision: Number.isInteger(requestedPrecision)
      ? Math.min(6, Math.max(0, requestedPrecision))
      : 2,
  };
}

function normalizeReportBody(value) {
  return String(value || "").trim().slice(0, 8000);
}

function resolveTestParameters(parameters, test = {}) {
  const configuredParameters = (Array.isArray(parameters) ? parameters : [])
    .map(normalizeParameterDefinition)
    .filter((parameter) => parameter.parameterName);

  return configuredParameters.length
    ? configuredParameters
    : getFallbackReportParameters(test);
}

function getBundlePreviewValue(parameter = {}) {
  const range = String(parameter.normal_range || "");
  const numericRange = range.match(/(-?\d+(?:\.\d+)?)\s*(?:-|to)\s*(-?\d+(?:\.\d+)?)/i);
  if (numericRange) return numericRange[1];
  if (/negative|non-reactive|not detected/i.test(range)) return "Negative";
  return "Normal";
}

function buildUnsavedTestPreview(testInput = {}) {
  const rawParameters = Array.isArray(testInput.parameters) ? testInput.parameters.slice(0, 200) : [];
  const parameters = resolveTestParameters(rawParameters, testInput)
    .map((parameter) => ({
      parameter_name: parameter.parameterName,
      unit: parameter.unit,
      normal_range: parameter.normalRange,
      value: getCellReportPreviewValue(testInput, parameter) ?? getBundlePreviewValue({ normal_range: parameter.normalRange }),
    }));

  return {
    name: String(testInput.name || "").trim().slice(0, 160) || "New laboratory test",
    code: String(testInput.code || "").trim().slice(0, 80),
    category: String(testInput.category || "").trim().slice(0, 120),
    sample_type: String(testInput.sampleType || testInput.sample_type || "").trim().slice(0, 120),
    turnaround_hours: Math.max(1, Math.min(720, Number(testInput.turnaroundHours) || 24)),
    report_body: normalizeReportBody(testInput.reportBody ?? testInput.report_body),
    parameters,
  };
}

testRouter.post(
  "/builder-report-preview",
  allowPermissions(PERMISSIONS.MANAGE_TESTS),
  async (req, res, next) => {
    try {
      const test = buildUnsavedTestPreview(req.body);
      if (isBillingOnlyTest(test)) return res.status(400).json({ message: BILLING_ONLY_MESSAGE });
      const businessSettings = await getBusinessSettings({ includeLetterhead: true, includeReportDoctorSignature: true });
      const mockReportData = {
        patient: {
          id: "SAMPLE-P-001",
          name: "SAMPLE PATIENT",
          age: "30",
          gender: "Male",
          phone: "9999999999",
        },
        visit: {
          bill_no: "SAMPLE-001",
          created_at: new Date().toISOString(),
          associate_label: "Direct at lab",
        },
        report: {
          report_no: "SAMPLE-R-001",
          finalized_at: new Date().toISOString(),
        },
        doctor: {
          name: "Dr. Sample Doctor",
          specialization: "General Physician",
        },
        associate: null,
        tests: [test],
      };

      res.type("html");
      res.send(buildReportHtml({
        ...mockReportData,
        isPreview: true,
        embeddedPreview: true,
        businessName: businessSettings.businessName,
        facilityType: businessSettings.facilityType,
        address: businessSettings.address,
        phone: businessSettings.phone,
        email: businessSettings.email,
        registrationNo: businessSettings.registrationNo,
        letterheadDataUrl: businessSettings.defaultReportIncludesLetterhead ? businessSettings.letterheadDataUrl : null,
        reportHeaderSpaceMm: businessSettings.reportHeaderSpaceMm,
        reportFooterSpaceMm: businessSettings.reportFooterSpaceMm,
        reportDoctorName: businessSettings.reportDoctorName,
        reportDoctorQualification: businessSettings.reportDoctorQualification,
        reportDoctorRegistrationNo: businessSettings.reportDoctorRegistrationNo,
        reportDoctorSignatureDataUrl: businessSettings.reportDoctorSignatureDataUrl,
      }));
    } catch (error) {
      next(error);
    }
  }
);

testRouter.get("/:id/sample-report", allowPermissions(PERMISSIONS.MANAGE_TESTS), async (req, res, next) => {
  try {
    const test = await get("SELECT * FROM tests WHERE id = ?", [req.params.id]);
    if (!test) {
      return res.status(404).json({ message: "Test not found" });
    }
    if (isBillingOnlyTest(test)) return res.status(400).json({ message: BILLING_ONLY_MESSAGE });

    const parameters = await all(
      `SELECT parameter_name, unit, normal_range FROM test_parameters WHERE test_id = ? ORDER BY display_order ASC, id ASC`,
      [test.id]
    );
    const bundleComponents = await getBundleComponentTests(test.id);

    // Construct mock report data
    const mockReportData = {
      patient: {
        id: "SAMPLE-P-001",
        name: "SAMPLE PATIENT",
        age: "30",
        gender: "Male",
        phone: "9999999999"
      },
      visit: {
        bill_no: "SAMPLE-001",
        created_at: new Date().toISOString(),
        associate_label: "Direct at lab"
      },
      report: {
        report_no: "SAMPLE-R-001",
        finalized_at: new Date().toISOString()
      },
      doctor: {
        name: "Dr. Sample Doctor",
        specialization: "General Physician"
      },
      associate: null,
      tests: [
        {
          name: test.name,
          code: test.code,
          category: test.category,
          sample_type: test.sample_type,
          turnaround_hours: test.turnaround_hours,
          parameters: parameters.map(p => {
            // Try to provide a "normal" value
            const parameterName = p.parameter_name.toLowerCase();
            const testName = String(test.name || "").toLowerCase();
            const hasRatioLabel = /\bratio\b/.test(parameterName);
            const hasInrLabel = /\binr\b/.test(parameterName);
            let value = "Normal";
            if (["antiinsulinantibody", "insulinantibody", "insulinantibodies", "insulinautoantibodyiaa"]
              .includes(testName.replace(/[^a-z0-9]/g, ""))) {
              value = "Negative";
            } else if (["antileptospiraantibody", "leptospiraantibody"]
              .includes(testName.replace(/[^a-z0-9]/g, ""))) {
              value = "Non-reactive";
            } else if (testName.replace(/[^a-z0-9]/g, "") === "antimicrosomalantibody") {
              if (parameterName.includes("target")) value = "Specify antigen (sample)";
              else if (parameterName.includes("method")) value = "Specify method (sample)";
              else if (parameterName.includes("result")) value = "Example result";
              else if (parameterName.includes("interpretation")) value = "Use assay-specific criteria";
              else value = "Sample only";
            } else if (testName.replace(/[^a-z0-9]/g, "") === "antidsdnaantibody") {
              if (parameterName.includes("method")) value = "Specify method (sample)";
              else if (parameterName.includes("interpretation")) value = "Use assay-specific criteria";
              else if (parameterName.includes("comment")) value = "Sample comment";
              else value = "Example result";
            } else if (testName.replace(/[^a-z0-9]/g, "") === "antissdnaantibody") {
              if (parameterName.includes("method")) value = "Specify method (sample)";
              else if (parameterName.includes("interpretation")) value = "Use assay-specific criteria";
              else if (parameterName.includes("comment")) value = "Sample comment";
              else value = "Example result";
            } else if (testName.replace(/[^a-z0-9]/g, "") === "antihistoneantibody") {
              if (parameterName.includes("method")) value = "Specify method (sample)";
              else if (parameterName.includes("interpretation")) value = "Use assay-specific criteria";
              else if (parameterName.includes("comment")) value = "Sample comment";
              else value = "Example result";
            } else if (testName.replace(/[^a-z0-9]/g, "") === "antiribosomalpantibody") {
              if (parameterName.includes("method")) value = "Specify method (sample)";
              else if (parameterName.includes("interpretation")) value = "Use assay-specific criteria";
              else if (parameterName.includes("comment")) value = "Sample comment";
              else value = "Example result";
            } else if (testName.replace(/[^a-z0-9]/g, "") === "anticcpab") {
              if (parameterName.includes("method")) value = "Specify method (sample)";
              else if (parameterName.includes("interpretation")) value = "Use assay-specific criteria";
              else if (parameterName.includes("comment")) value = "Sample comment";
              else value = "Example result";
            } else if (testName.replace(/[^a-z0-9]/g, "") === "antispermantibody") {
              if (parameterName.includes("specimen") || parameterName.includes("matrix")) value = "Specify specimen (sample)";
              else if (parameterName.includes("method")) value = "Specify method (sample)";
              else if (parameterName.includes("class")) value = "Specify class if tested";
              else if (parameterName.includes("interpretation")) value = "Use specimen-specific criteria";
              else if (parameterName.includes("comment")) value = "Sample comment";
              else value = "Example result";
            } else if (testName.replace(/[^a-z0-9]/g, "") === "apolipoproteina1") {
              if (parameterName.includes("method")) value = "Specify method (sample)";
              else if (parameterName.includes("interpretation")) value = "Use age/sex-specific interval";
              else if (parameterName.includes("comment")) value = "Sample comment";
              else value = "Example result";
            } else if (["arsenicurine", "urinearsenic"].includes(testName.replace(/[^a-z0-9]/g, ""))) {
              if (parameterName.includes("collection")) value = "Random urine (sample)";
              else if (parameterName.includes("method")) value = "Specify method (sample)";
              else if (parameterName.includes("interpretation")) value = "Use collection-specific interval";
              else if (parameterName.includes("comment")) value = "Sample comment";
              else value = "Example result";
            } else if (testName.replace(/[^a-z0-9]/g, "") === "arthritisprofile") {
              value = parameterName.includes("comment") ? "Sample comment" : "Example result";
            } else if (["asciticfluidsgramstain", "asciticfluidgramstain"].includes(testName.replace(/[^a-z0-9]/g, ""))) {
              if (parameterName.includes("specimen")) value = "Ascitic fluid (sample)";
              else if (parameterName.includes("method")) value = "Direct smear (sample)";
              else if (parameterName.includes("reaction") || parameterName.includes("morphology")) value = "Describe if organisms are seen";
              else if (parameterName.includes("comment")) value = "Sample comment";
              else value = "Example observation";
            } else if (["asciticfluidforprotein", "asciticfluidtotalprotein"].includes(testName.replace(/[^a-z0-9]/g, ""))) {
              if (parameterName.includes("specimen")) value = "Ascitic fluid (sample)";
              else if (parameterName.includes("appearance")) value = "Specify appearance (sample)";
              else if (parameterName.includes("method")) value = "Specify method (sample)";
              else if (parameterName.includes("comment")) value = "Sample comment";
              else value = "Example result";
            } else if (["bacteccultureforaerobicbacteria", "bacteccultureforanaerobicbacteria", "bactecanaerobicculture"].includes(testName.replace(/[^a-z0-9]/g, ""))) {
              if (parameterName.includes("specimen")) value = "Specify specimen/site (sample)";
              else if (parameterName.includes("bottle")) value = "Specify bottle (sample)";
              else if (parameterName.includes("collection")) value = "Specify collection time (sample)";
              else if (parameterName.includes("report status")) value = "Specify preliminary/final";
              else if (parameterName.includes("comment")) value = "Sample comment";
              else value = "Example result (if tested)";
            } else if (testName.includes("blood group")) {
              if (parameterName.includes("abo")) value = "B";
              else if (parameterName.includes("rh")) value = "+";
            } else if (testName.includes("d-dimer") || testName.includes("d dimer")) {
              value = "140.00";
            } else if (testName.includes("beta-2 glycoprotein") || testName.includes("beta 2 glycoprotein") || testName.includes("b2gpi")) {
              value = "3.00";
            } else if (testName.includes("toxoplasma")) {
              value = parameterName.includes("igm") ? "0.40" : "0.80";
            } else if (testName.includes("rheumatoid factor") || testName === "rf") {
              value = "12.00";
            } else if (testName.includes("antistreptolysin") || testName.includes("aso titer") || testName === "aso") {
              value = "122.00";
            } else if (testName.includes("high-sensitivity c-reactive protein") || testName.includes("high sensitivity c-reactive protein") || testName.includes("hs-crp") || testName.includes("hscrp")) {
              value = "0.20";
            } else if (testName.includes("semen analysis") || testName.includes("seminogram")) {
              const semenAnalysisSampleValues = {
                "time of specimen": "11:30 am",
                "time of examination": "11:40 am",
                "duration of abstinence": "2",
                "liquefaction at 37 °c": "37",
                volume: "1.5",
                appearance: "Grayish White",
                colour: "Grey",
                viscosity: "Thick",
                ph: "7.2",
                "total sperm concentration": "15",
                "percentage motility": "60",
                "grade a": "40",
                "grade b": "20",
                "grade c": "5",
                vitality: "60",
                agglutination: "Negative",
                "pus cells": "1 - 2",
                "red blood cells": "Nil",
                "epithelial cells": "Nil",
                "normal morphology": "72",
                "abnormal morphology": "28",
                "a. head defects": "12",
                "b. neck & mid piece": "6",
                "c. tail defects": "13",
                "semen fructose, qualitative": "Positive",
              };
              value = semenAnalysisSampleValues[parameterName] || "-";
            } else if (testName.includes("urine cotinine") || testName.includes("cotinine, urine")) {
              value = "1550.00";
            } else if (testName.includes("urine glucose") || testName.includes("glucose, urine")) {
              value = "Mild Traces";
            } else if (testName === "porphyrins" || testName.includes("blood porphyrins")) {
              const porphyrinsSampleValues = {
                "total porphyrin": "0.50",
                coproporphyrin: "1.00",
                "protoporphyrin (proto)": "56.00",
                uroporphyrin: "0.55",
              };
              value = porphyrinsSampleValues[parameterName] || "-";
            } else if (testName.includes("occult blood")) {
              value = "Absent";
            } else if (testName.includes("cerebrospinal fluid") || testName === "csf analysis") {
              const csfSampleValues = {
                volume: "2.00",
                colour: "Clear",
                turbidity: "Clear",
                coagulum: "Nil",
                blood: "Nil",
                deposits: "Nil",
                glucose: "60.00",
                chloride: "105.00",
                "total protein": "25.00",
                "cell count": "3.50",
                neutrophils: "1.50",
                lymphocytes: "45.00",
                eosinophils: "0.50",
                monocytes: "2.00",
                basophils: "0.00",
                "degenerated cells": "Nil",
                "atypical cells": "Nil",
              };
              value = csfSampleValues[parameterName] || "-";
            } else if (testName === "thyroid profile" || testName === "thyroid function test" || testName === "thyroid function profile") {
              const thyroidProfileValues = {
                "t3, total": "150.00",
                "t4, total": "10.50",
                tsh: "2.50",
              };
              value = thyroidProfileValues[parameterName] || "-";
            } else if (testName === "thyroid antibody profile" || testName === "thyroid antibodies" || testName === "thyroid antibodies panel") {
              value = parameterName.includes("tpo") ? "128.00" : "217.40";
            } else if (testName === "triiodothyronine (t3), total" || testName === "triiodothyronine (t3) total" || testName === "t3, total") {
              value = "17.40";
            } else if (testName === "testosterone, total" || testName === "total testosterone" || testName === "testosterone") {
              value = "1055.50";
            } else if (testName === "progesterone" || testName === "progesterone, serum") {
              value = "11.50";
            } else if (testName === "cortisone" || testName === "cortisone, serum") {
              value = "3.00";
            } else if (testName === "hcg, beta, total, pregnancy" || testName === "hcg, beta, total" || testName === "beta hcg, total" || testName === "beta hcg total") {
              value = "60.50";
            } else if (testName === "prolactin (prl)" || testName === "prolactin" || testName === "prolactin, serum") {
              value = "5.50";
            } else if (testName === "dehydroepiandrosterone (dhea)" || testName === "dehydroepiandrosterone" || testName === "dhea" || testName === "dhea, serum") {
              value = "11.00";
            } else if (testName === "estradiol (e2)" || testName === "estradiol" || testName === "estradiol, serum") {
              value = "98.00";
            } else if (testName === "luteinizing hormone (lh)" || testName === "luteinising hormone (lh)" || testName === "luteinizing hormone" || testName === "luteinising hormone" || testName === "lh") {
              value = "0.40";
            } else if (testName === "follicle stimulating hormone (fsh)" || testName === "follicle-stimulating hormone (fsh)" || testName === "fsh") {
              value = "0.40";
            } else if (testName === "thyroxine (t4), total" || testName === "thyroxine (t4) total" || testName === "t4, total" || testName === "t4 total") {
              value = "13.40";
            } else if (testName === "calcitonin" || testName === "calcitonin, serum" || testName === "calsitonin") {
              value = "15.00";
            } else if (testName === "inhibin a" || testName === "inhibin a, reproductive marker" || testName === "inhibin a, serum") {
              value = "1.00";
            } else if (testName === "inhibin b" || testName === "inhibin b, serum") {
              value = "19.00";
            } else if (testName === "papp-a" || testName === "papp-a, serum" || testName === "pregnancy associated plasma protein-a") {
              value = parameterName.includes("gestation") || parameterName.includes("pregnancy weeks") ? "12" : "3.40";
            } else if (testName === "dehydroepiandrosterone sulphate (dheas)" || testName === "dehydroepiandrosterone sulfate (dheas)" || testName === "dheas" || testName === "dheas, serum") {
              value = "11.00";
            } else if (testName.startsWith("fnac") || testName === "fine needle aspiration cytology (fnac)" || testName === "fine needle aspiration cytology") {
              const fnacSampleValues = {
                specimen: "Cervical / Vaginal Specimens",
                "clinical history": "Early detection of cervical cancer by identifying abnormal changes in cervical cells.\nScreening for precancerous conditions and HPV infection.",
                gross: "Avoid douches for 48 to 72 hours before examination; do not collect during or shortly after the menstrual period.",
                microscopic: "Reactive or reparative cellular changes\nAtypical squamous or glandular cells of undetermined significance\nCells in the premalignant or malignant category",
                impression: "Improperly labeled vial; aged or expired liquid-based specimen; frozen specimen.",
                advised: "The cervix is the lower portion of the uterus and forms the opening into the vagina.",
                note: "Cervical lining cells can undergo dysplasia from HPV, irritation, infection, or hormonal changes.",
                comments: "A Pap test examines cervical cells under a microscope for abnormal changes that could lead to cancer.",
              };
              value = fnacSampleValues[parameterName] || "";
            } else if (testName === "pap smear" || testName === "pap smear examination" || testName === "cytology, pap smear examination") {
              const papSmearSampleValues = {
                specimen: "ThinPrep",
                "pap diagnosis": "ATYPICAL SQUAMOUS CELLS OF UNDETERMINED SIGNIFICANCE (ASC-US)",
                "high risk hpv result": "DETECTED",
                "chlamydia trachomatis results": "not detected",
                "neisseria gonorrhoeae results": "not detected",
                "trichomonas vaginalis results": "not detected",
                "specimen adequacy": "Satisfactory for evaluation.",
                "additional cytologic findings": "Endocervical/transformation zone component present",
                comments: "The PAP smear is a cervical-cancer screening test; regular screening reduces the impact of false-negative results.",
              };
              value = papSmearSampleValues[parameterName] || "";
            } else if (testName === "thyroid stimulating hormone (tsh)" || testName === "tsh" || testName === "tsh, serum") {
              value = "10.10";
            } else if (testName.includes("sickle cell anemia mutation")) {
              value = "Not Detected";
            } else if (testName === "rt-pcr" || testName.includes("real time rt-pcr")) {
              value = "Negative";
            } else if (testName.includes("thiopurine methyltransferase")) {
              value = "Not Detected";
            } else if (testName.includes("cystic fibrosis") && testName.includes("newborn")) {
              value = "55.00";
            } else if (testName === "lipid profile") {
              const lipidSampleValues = {
                "total cholesterol": "150.00",
                triglycerides: "100.00",
                "hdl cholesterol": "50.00",
                "ldl cholesterol": "80.00",
                "vldl cholesterol": "20.00",
                "non-hdl cholesterol": "100.00",
              };
              value = lipidSampleValues[parameterName] || "Normal";
            } else if (testName.startsWith("lft") || testName === "liver function test (lft)") {
              const lftSampleValues = {
                "ast (sgot)": "35.00",
                "alt (sgpt)": "35.00",
                "ast : alt ratio": "1.00",
                ggtp: "65.00",
                "alkaline phosphatase (alp)": "45.00",
                "bilirubin total": "1.00",
                "bilirubin direct": "0.20",
                "bilirubin indirect": "0.80",
                "total protein": "6.50",
                albumin: "3.50",
                globulin: "3.00",
                "a : g ratio": "1.66",
              };
              value = lftSampleValues[parameterName] || "Normal";
            } else if (testName.includes("hba1c") || testName.includes("glycosylated hemoglobin") || testName.includes("glycosylated haemoglobin") || testName.includes("glycated hemoglobin") || testName.includes("glycated haemoglobin")) {
              value = "4.50";
            } else if ((testName.includes("vitamin d") && (testName.includes("25") || testName.includes("hydroxy"))) || testName.includes("25-oh vitamin d")) {
              value = "100.00";
            } else if (testName.includes("vitamin c") || testName.includes("ascorbic acid")) {
              value = "1.00";
            } else if (testName.includes("vitamin b12") || testName.includes("cobalamin")) {
              value = "450.00";
            } else if (testName.includes("random blood sugar") || testName === "rbs") {
              value = "110.00";
            } else if (testName.includes("fasting blood sugar") || testName === "fbs") {
              value = "90.00";
            } else if (testName.includes("vitamin e") || testName.includes("tocopherol")) {
              value = "10.00";
            } else if (testName.includes("folic acid") || testName.includes("folate") || testName.includes("vitamin b9")) {
              value = parameterName.includes("rbc") ? "350.00" : "6.50";
            } else if (testName.includes("vitamin k") || testName.includes("phylloquinone")) {
              value = "1.00";
            } else if ((testName === "ldl - cholesterol" || testName === "ldl cholesterol") && !testName.includes("ratio")) {
              value = "90.00";
            } else if ((testName === "hdl - cholesterol" || testName === "hdl cholesterol") && !testName.includes("ratio")) {
              value = "60.00";
            } else if (testName.includes("indirect bilirubin") || testName.includes("bilirubin, indirect")) {
              value = "0.80";
            } else if (testName === "calcium" || testName === "calcium (serum)" || testName === "serum calcium") {
              value = "9.50";
            } else if (testName === "ferritin" || testName === "ferritin (serum)" || testName === "serum ferritin") {
              value = "100.00";
            } else if (testName.startsWith("c-peptide") || testName.startsWith("c peptide")) {
              value = "1.20";
            } else if (testName === "vldl-cholesterol" || testName === "vldl cholesterol") {
              value = "20.00";
            } else if (testName === "comprehensive metabolic panel (cmp)" || testName === "comprehensive metabolic panel" || testName === "cmp") {
              const cmpSampleValues = {
                "ast (sgot)": "16.00",
                "alt (sgpt)": "35.00",
                "alkaline phosphatase (alp)": "80.00",
                "bilirubin total": "0.60",
                "total protein": "6.39",
                albumin: "4.00",
                gfr: "120.00",
                "glucose, fasting": "90.00",
                sodium: "140.00",
                potassium: "4.00",
                calcium: "10.00",
                bun: "15.00",
                creatinine: "1.00",
              };
              value = cmpSampleValues[parameterName] || "Normal";
            } else if (testName === "electrolyte profile" || testName === "electrolytes" || testName === "serum electrolytes") {
              const electrolyteSampleValues = {
                sodium: "140.00",
                potassium: "4.00",
                chloride: "99.00",
                bicarbonate: "25.00",
                calcium: "10.00",
                magnesium: "1.90",
              };
              value = electrolyteSampleValues[parameterName] || "Normal";
            } else if (testName === "potassium(serum)" || testName === "potassium (serum)" || testName === "potassium, serum" || testName === "serum potassium") {
              value = "4.00";
            } else if (testName === "sgot / ast" || testName === "ast (sgot)" || testName.includes("aspartate aminotransferase")) {
              value = "25.00";
            } else if (testName === "globulin" || testName === "globulin (serum)" || testName === "serum globulin") {
              value = "3.00";
            } else if (testName === "albumin" || testName === "albumin (serum)" || testName === "serum albumin") {
              value = "4.20";
            } else if (testName === "bun (blood urea nitrogen)" || testName === "blood urea nitrogen (bun)" || testName === "bun") {
              value = "15.00";
            } else if (testName === "sodium (serum)" || testName === "sodium, serum" || testName === "serum sodium" || testName === "sodium") {
              value = "140.00";
            } else if (testName === "iron" || testName === "iron (serum)" || testName === "serum iron") {
              value = "100.00";
            } else if (testName === "lactic acid (lactate)" || testName === "lactic acid" || testName === "lactate" || testName === "lactate (plasma)") {
              value = "12.00";
            } else if (testName === "magnesium" || testName === "magnesium (serum)" || testName === "serum magnesium") {
              value = "1.90";
            } else if (testName === "lipase" || testName === "lipase (serum)" || testName === "serum lipase") {
              value = "55.00";
            } else if (testName === "amylase" || testName === "amylase (serum)" || testName === "serum amylase") {
              value = "90.00";
            } else if (testName === "gamma glutamyl transferase (ggt)" || testName === "gamma-glutamyl transferase (ggt)" || testName === "ggt" || testName === "ggtp" || testName === "gamma glutamyl transferase") {
              value = "15.00";
            } else if (testName === "chloride (serum)" || testName === "chloride, serum" || testName === "serum chloride" || testName === "chloride") {
              value = "100.00";
            } else if (testName.includes("creatinine") && testName.includes("24") && testName.includes("urine")) {
              const creatinine24HourSampleValues = {
                "creatinine, 24 hour": "20.00",
                "total urine volume": "1200.00",
                "body weight": "70.00",
              };
              value = creatinine24HourSampleValues[parameterName] || "-";
            } else if (testName === "creatinine" || testName === "creatinine (serum)" || testName === "serum creatinine") {
              value = "0.85";
            } else if (testName === "ionized calcium (icalcium)" || testName === "ionized calcium" || testName === "icalcium" || testName === "calcium, ionized") {
              value = "1.24";
            } else if (testName === "flecainide" || testName === "flecainide (serum)" || testName === "serum flecainide") {
              value = "0.30";
            } else if (testName === "phenobarbital" || testName === "phenobarbitone" || testName === "phenobarbitole" || testName === "phenobarbital (serum)" || testName === "phenobarbitone (serum)" || testName === "phenobarbitole (serum)") {
              value = "25.00";
            } else if (testName === "ketone body (beta hydroxybutyrate)" || testName === "ketone body" || testName === "beta hydroxybutyrate" || testName === "beta-hydroxybutyrate") {
              value = "0.10";
            } else if (testName === "uric acid" || testName === "uric acid (serum)" || testName === "serum uric acid") {
              value = "5.50";
            } else if (testName === "total iron binding capacity (tibc)" || testName === "tibc (total iron binding capacity)" || testName === "tibc") {
              value = "300.00";
            } else if (testName === "serum osmolality" || testName === "osmolality, serum" || testName === "osmolality (serum)") {
              value = "288.00";
            } else if (testName === "blood gas analysis, arterial" || testName === "arterial blood gas analysis" || testName === "arterial blood gas" || testName === "abg") {
              const arterialBloodGasSampleValues = {
                ph: "7.40",
                pco2: "40.00",
                "bicarbonate (hco3)": "25.00",
                "total co2 contents (tco2)": "26.00",
                "standard bicarbonate (sbc)": "24.00",
                "base excess": "1.00",
                po2: "100.00",
                "oxygen saturation capacity": "96.00",
                "base excess - extracellular fluid": "0.01",
                hemoglobin: "14.00",
              };
              value = arterialBloodGasSampleValues[parameterName] || "-";
            } else if (testName === "manganese, blood" || testName === "manganese blood" || testName === "blood manganese") {
              value = "15.00";
            } else if (testName === "selenium, serum" || testName === "serum selenium" || testName === "selenium") {
              value = "99.00";
            } else if (testName.includes("kft") && testName.includes("function")) {
              const kftSampleValues = {
                urea: "15",
                creatinine: "1.1",
                "uric acid": "5.5",
                "calcium, total": "10.2",
                phosphorus: "2.8",
                "alkaline phosphatase (alp)": "80",
                "total protein": "5.9",
                albumin: "4.1",
                sodium: "139",
                potassium: "3.9",
                chloride: "100",
              };
              value = kftSampleValues[parameterName] || "Normal";
            } else if (testName === "factor ii" || testName.includes("factor ii functional")) {
              value = "88.00";
            } else if (testName === "karyotype") {
              value = "46,XX";
            } else if (testName.includes("absolute eosinophil")) {
              value = "10";
            } else if (testName.includes("absolute neutrophil")) {
              value = "5.40";
            } else if (testName.includes("differential") && (testName.includes("leucocyte") || testName.includes("leukocyte"))) {
              if (parameterName.includes("neutrophil")) value = "60";
              else if (parameterName.includes("lymphocyte")) value = "31";
              else if (parameterName.includes("eosinophil")) value = "1";
              else if (parameterName.includes("monocyte")) value = "7";
              else if (parameterName.includes("basophil")) value = "1";
            } else if (testName === "bt (bleeding time)" || testName === "bleeding time (bt)") {
              value = "3";
            } else if (testName === "coagulation profile") {
              if (parameterName.includes("bleeding time")) value = "5";
              else if (parameterName.includes("activated partial thromboplastin")) value = "26";
              else if (parameterName.includes("prothrombin time")) value = "11";
              else if (parameterName.includes("clotting time")) value = "4";
            } else if (testName === "factor v" || testName === "factor v deficiency") {
              value = "90.00";
            } else if (testName.includes("factor ix")) {
              value = "95.00";
            } else if (testName.includes("factor x") && !testName.includes("factor xi")) {
              value = "90.00";
            } else if (testName.includes("factor xi") && !testName.includes("factor xii") && !testName.includes("factor xiii")) {
              value = "90.00";
            } else if (testName === "factor xii deficiency") {
              value = "100";
            } else if (testName.includes("factor vii") && !testName.includes("factor viii")) {
              value = "90.00";
            } else if (testName === "factor viii (antihemophilic factor a)") {
              value = "60";
            } else if (testName === "peripheral blood smear examination") {
              if (parameterName === "rbc morphology") value = "Normocytic Normochromic";
              else if (parameterName === "platelets") value = "Normal & Adequate in Number";
            } else if (p.parameter_name.toUpperCase() === "PROTHROMBIN TIME STUDIES") {
               value = "";
            } else if (parameterName.includes('value') || parameterName.includes('prothrombin time') || hasRatioLabel || hasInrLabel) {
               if (parameterName.includes('patient')) value = "12.10";
               else if (parameterName.includes('mean normal')) value = "10.60";
               else if (hasInrLabel) value = "1.00";
               else if (hasRatioLabel || /\bpr\b/.test(parameterName)) value = "1.15";
               else value = "10.60";
            } else if (p.normal_range) {
              const match = p.normal_range.match(/(\d+\.?\d*)\s*-\s*(\d+\.?\d*)/);
              if (match) {
                // Return low end of range as sample
                value = match[1];
              }
            }
            return {
              parameter_name: p.parameter_name,
              unit: p.unit,
              normal_range: p.normal_range,
              value: getCellReportPreviewValue(test, p) ?? value
            };
          })
        }
      ]
    };

    if (bundleComponents.length) {
      mockReportData.tests = await Promise.all(bundleComponents.map(async (component) => {
        const componentParameters = await all(
          `SELECT parameter_name, unit, normal_range, entry_mode
           FROM test_parameters
           WHERE test_id = ?
           ORDER BY display_order ASC, id ASC`,
          [component.id]
        );
        return {
          ...component,
          test_id: component.id,
          parameters: componentParameters.map((parameter) => ({
            ...parameter,
            value: getCellReportPreviewValue(component, parameter) ?? getBundlePreviewValue(parameter),
          })),
        };
      }));
    }

    const businessSettings = await getBusinessSettings({ includeLetterhead: true, includeReportDoctorSignature: true });
    const includeLetterhead = req.query.letterhead === "0"
      ? false
      : req.query.letterhead === "1"
        ? true
        : businessSettings.defaultReportIncludesLetterhead;
    res.set("Cache-Control", "no-store");
    res.type("html");
    res.send(buildReportHtml({
      ...mockReportData,
      isPreview: true,
      businessName: businessSettings.businessName,
      facilityType: businessSettings.facilityType,
      address: businessSettings.address,
      phone: businessSettings.phone,
      email: businessSettings.email,
      registrationNo: businessSettings.registrationNo,
      digitalReportUrl: getTestReportPreviewUrl(req, test.id, businessSettings.patientPortalBaseUrl),
      letterheadDataUrl: includeLetterhead ? businessSettings.letterheadDataUrl : null,
      reportHeaderSpaceMm: businessSettings.reportHeaderSpaceMm,
      reportFooterSpaceMm: businessSettings.reportFooterSpaceMm,
      reportDoctorName: businessSettings.reportDoctorName,
      reportDoctorQualification: businessSettings.reportDoctorQualification,
      reportDoctorRegistrationNo: businessSettings.reportDoctorRegistrationNo,
      reportDoctorSignatureDataUrl: businessSettings.reportDoctorSignatureDataUrl,
      showPrintControls: true,
    }));
  } catch (error) {
    next(error);
  }
});

testRouter.get("/", async (req, res, next) => {
  try {
    const query = `%${req.query.query || ""}%`;
    const tests = await all(
      `
      SELECT t.*,
             EXISTS(
               SELECT 1 FROM test_bundle_items tbi
               WHERE tbi.bundle_test_id = t.id
             ) AS is_bundle,
             (
               SELECT COUNT(*) FROM test_bundle_items tbi
               WHERE tbi.bundle_test_id = t.id
             ) AS bundle_item_count,
             (
               SELECT COALESCE(SUM(component.price), 0)
               FROM test_bundle_items tbi
               JOIN tests component ON component.id = tbi.component_test_id
               WHERE tbi.bundle_test_id = t.id
             ) AS bundle_price
      FROM tests t
      WHERE t.active = 1
        AND (t.name LIKE ? OR COALESCE(t.code, '') LIKE ? OR COALESCE(t.category, '') LIKE ?)
      ORDER BY t.name ASC
      `,
      [query, query, query]
    );

    for (const test of tests) {
      test.billing_only = isBillingOnlyTest(test);
      test.parameters = await all(
        `SELECT id, parameter_name, unit, normal_range, entry_mode, calculation_formula, calculation_precision, display_order
         FROM test_parameters
         WHERE test_id = ?
         ORDER BY display_order ASC, id ASC`,
        [test.id]
      );
    }

    res.json({ tests });
  } catch (error) {
    next(error);
  }
});

testRouter.get("/categories", async (req, res, next) => {
  try {
    const categories = await all(
      `SELECT DISTINCT category FROM tests WHERE category IS NOT NULL AND active = 1 ORDER BY category ASC`
    );
    res.json({ categories: categories.map((c) => c.category) });
  } catch (error) {
    next(error);
  }
});

testRouter.post("/", allowPermissions(PERMISSIONS.MANAGE_TESTS), async (req, res, next) => {
  try {
    const { name, code, category, sampleType, price, turnaroundHours, parameters: requestedParameters = [] } = req.body;
    const reportBody = normalizeReportBody(req.body.reportBody ?? req.body.report_body);
    const parameters = resolveTestParameters(requestedParameters, { name, category, sampleType });
    const created = await run(
      `INSERT INTO tests (name, code, category, sample_type, price, turnaround_hours, report_body, active, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP)`,
      [name, code, category, sampleType, price, turnaroundHours || 24, reportBody]
    );

    for (let index = 0; index < parameters.length; index += 1) {
      const parameter = parameters[index];
      await run(
        `INSERT INTO test_parameters (test_id, parameter_name, unit, normal_range, entry_mode, calculation_formula, calculation_precision, display_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          created.id,
          parameter.parameterName,
          parameter.unit,
          parameter.normalRange,
          parameter.entryMode,
          parameter.calculationFormula,
          parameter.calculationPrecision,
          index + 1,
        ]
      );
    }

    const test = await get("SELECT * FROM tests WHERE id = ?", [created.id]);

    await logAction({
      userId: req.user.id,
      action: "test_create",
      entityType: "test",
      entityId: created.id,
      meta: { name, code },
    });

    res.status(201).json({ test });
  } catch (error) {
    if (error.message.includes("UNIQUE")) {
      res.status(400).json({ message: "Test name or code already exists" });
      return;
    }
    next(error);
  }
});

testRouter.post(
  "/import",
  allowPermissions(PERMISSIONS.MANAGE_TESTS),
  async (req, res, next) => {
    try {
      const tests = req.body.tests;
      if (!Array.isArray(tests) || !tests.length) {
        return res.status(400).json({ message: "Provide a non-empty tests array" });
      }

      const createdTests = [];
      for (const testData of tests) {
        const name = testData.name?.trim();
        if (!name) {
          continue;
        }

        const code = testData.code?.trim() || null;
        const category = testData.category?.trim() || null;
        const sampleType = testData.sampleType?.trim() || null;
        const price = Number(testData.price || 0);
        const turnaroundHours = Number(testData.turnaroundHours || 24);
        const reportBody = normalizeReportBody(testData.reportBody ?? testData.report_body);
        const parameters = resolveTestParameters(testData.parameters, { name, category, sampleType });

        let test = await get(`SELECT * FROM tests WHERE name = ? OR code = ?`, [name, code]);

        if (test) {
          await run(
            `UPDATE tests SET name = ?, code = ?, category = ?, sample_type = ?, price = ?, turnaround_hours = ?, report_body = ?, active = 1 WHERE id = ?`,
            [name, code, category, sampleType, price, turnaroundHours, reportBody, test.id]
          );
        } else {
          test = await run(
            `INSERT INTO tests (name, code, category, sample_type, price, turnaround_hours, report_body, active, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP)`,
            [name, code, category, sampleType, price, turnaroundHours, reportBody]
          );
        }

        const testId = test.id;
        await run("DELETE FROM test_parameters WHERE test_id = ?", [testId]);

        for (let index = 0; index < parameters.length; index += 1) {
          const parameter = parameters[index];
          await run(
            `INSERT INTO test_parameters (test_id, parameter_name, unit, normal_range, entry_mode, calculation_formula, calculation_precision, display_order)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [testId, parameter.parameterName, parameter.unit, parameter.normalRange, parameter.entryMode, parameter.calculationFormula, parameter.calculationPrecision, index + 1]
          );
        }

        createdTests.push(testId);
      }

      res.status(201).json({ imported: createdTests.length });
    } catch (error) {
      next(error);
    }
  }
);

testRouter.put("/:id", allowPermissions(PERMISSIONS.MANAGE_TESTS), async (req, res, next) => {
  try {
    const { name, code, category, sampleType, price, turnaroundHours, active, parameters: requestedParameters = [] } = req.body;
    const reportBody = normalizeReportBody(req.body.reportBody ?? req.body.report_body);
    const parameters = resolveTestParameters(requestedParameters, { name, category, sampleType });
    await run(
      `UPDATE tests
       SET name = ?, code = ?, category = ?, sample_type = ?, price = ?, turnaround_hours = ?, report_body = ?, active = ?
       WHERE id = ?`,
      [name, code, category, sampleType, price, turnaroundHours || 24, reportBody, active ? 1 : 0, req.params.id]
    );
    await run("DELETE FROM test_parameters WHERE test_id = ?", [req.params.id]);

    for (let index = 0; index < parameters.length; index += 1) {
      const parameter = parameters[index];
      await run(
        `INSERT INTO test_parameters (test_id, parameter_name, unit, normal_range, entry_mode, calculation_formula, calculation_precision, display_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [req.params.id, parameter.parameterName, parameter.unit, parameter.normalRange, parameter.entryMode, parameter.calculationFormula, parameter.calculationPrecision, index + 1]
      );
    }

    await logAction({
      userId: req.user.id,
      action: "test_update",
      entityType: "test",
      entityId: req.params.id,
      meta: { name, code },
    });

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

testRouter.delete("/:id", allowPermissions(PERMISSIONS.MANAGE_TESTS), async (req, res, next) => {
  try {
    const test = await get("SELECT * FROM tests WHERE id = ?", [req.params.id]);
    if (!test) {
      return res.status(404).json({ message: "Test not found" });
    }

    await transaction(async () => {
      await run(
        `UPDATE visit_tests
         SET custom_test_name = COALESCE(custom_test_name, ?),
             custom_test_price = COALESCE(custom_test_price, ?),
             test_id = NULL
         WHERE test_id = ?`,
        [test.name, test.price, req.params.id]
      );
      await run("DELETE FROM test_parameters WHERE test_id = ?", [req.params.id]);
      await run("DELETE FROM tests WHERE id = ?", [req.params.id]);
    });

    await logAction({
      userId: req.user.id,
      action: "test_delete",
      entityType: "test",
      entityId: req.params.id,
      meta: { name: test.name, code: test.code },
    });

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

module.exports = { testRouter };
