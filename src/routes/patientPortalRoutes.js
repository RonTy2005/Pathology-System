const express = require("express");

const { all, get } = require("../db/helpers");
const { getBusinessSettings } = require("../services/businessSettingsService");
const { logAction } = require("../services/logService");
const { getPublicPortalAvailability } = require("../services/publicPortalAvailabilityService");
const { buildReportHtml } = require("../utils/reportFormatter");
const { buildBillHtml } = require("../utils/billFormatter");
const {
  getPatientPortalReportUrl,
  getPatientPortalUrl,
  getTestReportPreviewUrl,
  shouldIncludePortalLetterhead,
} = require("../utils/patientPortal");
const { getReportBundle, getBillBundle } = require("./visitRoutes");
const { getBundleComponentTests } = require("../services/testBundleService");
const { getCellReportPreviewValue } = require("../services/cellReportService");
const { isBillingOnlyTest, BILLING_ONLY_MESSAGE } = require('../../frontend/scripts/reportEligibility');

const patientPortalRouter = express.Router();

function isValidToken(token) {
  return /^[A-Za-z0-9_-]{32,128}$/.test(String(token || ""));
}

async function getPortalVisit(token) {
  return get(
    `SELECT v.id,
            v.bill_no,
            v.created_at,
            v.patient_portal_token,
            v.payment_status,
            v.amount_due,
            p.name AS patient_name,
            r.id AS report_id,
            r.report_no,
            r.finalized,
            r.finalized_at
     FROM visits v
     JOIN patients p ON p.id = v.patient_id
     LEFT JOIN reports r ON r.visit_id = v.id
     WHERE v.patient_portal_token = ?`,
    [token]
  );
}

function getPortalPathologyReportLinks(visit, tests = []) {
  return tests.map((test) => ({
    id: `pathology-${test.visit_test_id}-${test.test_id}`,
    type: "pathology",
    label: `${test.name} report`,
    url: `/api/patient-reports/${encodeURIComponent(visit.patient_portal_token)}/report?visitTestId=${encodeURIComponent(test.visit_test_id)}&testId=${encodeURIComponent(test.test_id)}`,
  }));
}

async function getPortalReports(visit) {
  const reports = [];

  if (visit.report_id && Number(visit.finalized) === 1) {
    const reportBundle = await getReportBundle(visit.id);
    const pathologyReports = getPortalPathologyReportLinks(visit, reportBundle?.tests || []);
    reports.push(...(pathologyReports.length ? pathologyReports : [{
      id: "pathology",
      type: "pathology",
      label: "Laboratory report",
      url: `/api/patient-reports/${encodeURIComponent(visit.patient_portal_token)}/report`,
    }]));
  }

  const imagingReports = await all(
    `SELECT irf.id,
            irf.original_name,
            irf.mime_type,
            t.name AS test_name
     FROM imaging_report_files irf
     JOIN visit_tests vt ON vt.id = irf.visit_test_id
     JOIN tests t ON t.id = vt.test_id
     WHERE vt.visit_id = ?
     ORDER BY t.name ASC, irf.id ASC`,
    [visit.id]
  );

  for (const imagingReport of imagingReports) {
    reports.push({
      id: imagingReport.id,
      type: "imaging",
      label: `${imagingReport.test_name} report`,
      fileName: imagingReport.original_name,
      mimeType: imagingReport.mime_type,
      url: `/api/patient-reports/${encodeURIComponent(visit.patient_portal_token)}/imaging-reports/${imagingReport.id}`,
    });
  }

  return reports;
}

function getPortalAccess(visit, reports) {
  const paymentComplete = Number(visit.amount_due || 0) <= 0.005 && visit.payment_status === "paid";
  const reportFinalized = reports.length > 0;
  return {
    paymentComplete,
    reportFinalized,
    available: paymentComplete && reportFinalized,
  };
}

function setPrivateHeaders(res) {
  res.set("Cache-Control", "private, no-store, max-age=0");
  res.set("X-Content-Type-Options", "nosniff");
}

function getSampleParameterValue(parameter) {
  const referenceRange = String(parameter.normal_range || "");
  const numericRange = referenceRange.match(/(-?\d+(?:\.\d+)?)\s*(?:-|to)\s*(-?\d+(?:\.\d+)?)/i);
  if (numericRange) {
    const lower = Number(numericRange[1]);
    const upper = Number(numericRange[2]);
    if (Number.isFinite(lower) && Number.isFinite(upper)) {
      return String(Math.round(((lower + upper) / 2) * 100) / 100);
    }
  }

  return referenceRange ? "Normal" : "Sample value";
}

async function resolvePortalVisit(req, res) {
  const token = req.params.token;
  if (!isValidToken(token)) {
    res.status(404).json({ message: "Report link not found." });
    return null;
  }

  const businessSettings = await getBusinessSettings();
  const availability = getPublicPortalAvailability(businessSettings);
  if (!availability.isOpen) {
    setPrivateHeaders(res);
    res.status(503).json({
      message: availability.message,
      portalOpen: false,
      closedOutsideBusinessHours: true,
      businessOpeningTime: availability.openingTime,
      businessClosingTime: availability.closingTime,
    });
    return null;
  }

  const visit = await getPortalVisit(token);
  if (!visit) {
    res.status(404).json({ message: "Report link not found." });
    return null;
  }

  return visit;
}

// This route intentionally contains no patient data. It lets the QR code in a
// catalogue layout preview demonstrate the same public web flow as a real
// patient report, without exposing a signed-in staff session or a live report.
patientPortalRouter.get("/sample/test/:testId/report", async (req, res, next) => {
  try {
    const testId = Number(req.params.testId);
    if (!Number.isSafeInteger(testId) || testId < 1) {
      return res.status(404).send("Sample report not found.");
    }

    const test = await get(
      `SELECT id, name, code, category, sample_type, turnaround_hours, report_body
       FROM tests
       WHERE id = ? AND active = 1`,
      [testId]
    );
    if (!test) {
      return res.status(404).send("Sample report not found.");
    }
    if (isBillingOnlyTest(test)) return res.status(400).send(BILLING_ONLY_MESSAGE);

    const parameters = await all(
      `SELECT parameter_name, unit, normal_range
       FROM test_parameters
       WHERE test_id = ?
       ORDER BY display_order ASC, id ASC`,
      [test.id]
    );
    const bundleComponents = await getBundleComponentTests(test.id);
    const previewTests = bundleComponents.length
      ? await Promise.all(bundleComponents.map(async (component) => {
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
              value: getCellReportPreviewValue(component, parameter) ?? getSampleParameterValue(parameter),
            })),
          };
        }))
      : [{
          ...test,
          parameters: parameters.map((parameter) => ({
            ...parameter,
            value: getCellReportPreviewValue(test, parameter) ?? getSampleParameterValue(parameter),
          })),
        }];
    const businessSettings = await getBusinessSettings({
      includeLetterhead: true,
      includeBusinessLogo: true,
      includeReportDoctorSignature: true,
    });
    const includeLetterhead = shouldIncludePortalLetterhead(businessSettings.letterheadDataUrl);

    setPrivateHeaders(res);
    res.set("X-Robots-Tag", "noindex, nofollow");
    res.type("html").send(buildReportHtml({
      isPreview: true,
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
        associate_label: "Catalogue preview",
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
      tests: previewTests,
      businessName: businessSettings.businessName,
      facilityType: businessSettings.facilityType,
      address: businessSettings.address,
      phone: businessSettings.phone,
      email: businessSettings.email,
      registrationNo: businessSettings.registrationNo,
      digitalReportUrl: getTestReportPreviewUrl(req, test.id, businessSettings.patientPortalBaseUrl),
      letterheadDataUrl: includeLetterhead ? businessSettings.letterheadDataUrl : null,
      businessLogoDataUrl: includeLetterhead && businessSettings.letterheadDataUrl ? null : businessSettings.businessLogoDataUrl,
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
});

patientPortalRouter.get("/:token/status", async (req, res, next) => {
  try {
    const visit = await resolvePortalVisit(req, res);
    if (!visit) return;

    const reports = await getPortalReports(visit);
    const access = getPortalAccess(visit, reports);
    setPrivateHeaders(res);
    res.json({
      patientName: visit.patient_name,
      billNo: visit.bill_no,
      registeredAt: visit.created_at,
      paymentStatus: access.paymentComplete ? "paid" : "payment_pending",
      reportStatus: access.reportFinalized ? "ready" : "in_progress",
      reportAvailable: access.available,
      reports: access.available ? reports : [],
      message: access.available
        ? "Your report is ready to view."
        : !access.paymentComplete
          ? "Your report will be available after the bill is paid in full."
          : "Your report is being prepared by the laboratory team.",
    });
  } catch (error) {
    next(error);
  }
});

// The same unguessable token printed on the patient's bill can also open the
// receipt. This lets staff share a bill through WhatsApp without granting
// access to a staff session or the rest of the system.
patientPortalRouter.get("/:token/bill", async (req, res, next) => {
  try {
    const visit = await resolvePortalVisit(req, res);
    if (!visit) return;

    const bill = await getBillBundle(visit.id);
    if (!bill) {
      return res.status(404).json({ message: "Bill not found." });
    }

    const businessSettings = await getBusinessSettings({ includeBusinessLogo: true });
    await logAction({
      action: "patient_portal_bill_viewed",
      entityType: "visit",
      entityId: String(visit.id),
      meta: { billNo: visit.bill_no },
    });

    setPrivateHeaders(res);
    res.type("html").send(buildBillHtml({
      ...bill,
      businessSettings,
      patientPortalUrl: getPatientPortalUrl(req, visit.patient_portal_token, businessSettings.patientPortalBaseUrl),
    }, { sharedLinkView: true }));
  } catch (error) {
    next(error);
  }
});

patientPortalRouter.get("/:token/report", async (req, res, next) => {
  try {
    const visit = await resolvePortalVisit(req, res);
    if (!visit) return;

    const reports = await getPortalReports(visit);
    const access = getPortalAccess(visit, reports);
    if (!access.available) {
      return res.status(403).json({
        message: !access.paymentComplete
          ? "This report can be viewed after the bill is paid in full."
          : "This report is not ready yet.",
      });
    }

    const report = await getReportBundle(visit.id);
    if (!report?.report?.finalized) {
      return res.status(403).json({ message: "This report is not ready yet." });
    }

    const hasIndividualReportRequest = Object.prototype.hasOwnProperty.call(req.query, "visitTestId")
      || Object.prototype.hasOwnProperty.call(req.query, "testId");
    if (hasIndividualReportRequest) {
      const visitTestId = Number(req.query.visitTestId);
      const testId = Number(req.query.testId);
      if (!Number.isSafeInteger(visitTestId) || !Number.isSafeInteger(testId)) {
        return res.status(404).json({ message: "Report not found." });
      }

      const selectedTests = report.tests.filter((test) => (
        Number(test.visit_test_id) === visitTestId && Number(test.test_id) === testId
      ));
      if (!selectedTests.length) {
        return res.status(404).json({ message: "Report not found." });
      }
      report.tests = selectedTests;
    }

    const businessSettings = await getBusinessSettings({
      includeLetterhead: true,
      includeBusinessLogo: true,
      includeReportDoctorSignature: true,
    });
    const includeLetterhead = shouldIncludePortalLetterhead(businessSettings.letterheadDataUrl);
    await logAction({
      action: "patient_portal_report_viewed",
      entityType: "visit",
      entityId: String(visit.id),
      meta: { reportNo: visit.report_no },
    });

    setPrivateHeaders(res);
    res.type("html").send(buildReportHtml({
      ...report,
      businessName: businessSettings.businessName,
      facilityType: businessSettings.facilityType,
      address: businessSettings.address,
      phone: businessSettings.phone,
      email: businessSettings.email,
      registrationNo: businessSettings.registrationNo,
      digitalReportUrl: getPatientPortalReportUrl(req, visit.patient_portal_token, businessSettings.patientPortalBaseUrl),
      letterheadDataUrl: includeLetterhead ? businessSettings.letterheadDataUrl : null,
      businessLogoDataUrl: includeLetterhead && businessSettings.letterheadDataUrl ? null : businessSettings.businessLogoDataUrl,
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
});

patientPortalRouter.get("/:token/imaging-reports/:fileId", async (req, res, next) => {
  try {
    const visit = await resolvePortalVisit(req, res);
    if (!visit) return;

    const reports = await getPortalReports(visit);
    const access = getPortalAccess(visit, reports);
    if (!access.paymentComplete) {
      return res.status(403).json({ message: "This report can be viewed after the bill is paid in full." });
    }

    const reportFile = await get(
      `SELECT irf.id, irf.original_name, irf.mime_type, irf.file_data
       FROM imaging_report_files irf
       JOIN visit_tests vt ON vt.id = irf.visit_test_id
       WHERE irf.id = ? AND vt.visit_id = ?`,
      [req.params.fileId, visit.id]
    );

    if (!reportFile) {
      return res.status(404).json({ message: "Report file not found." });
    }

    const safeFileName = String(reportFile.original_name || "report").replace(/[\"\\]/g, "_");
    await logAction({
      action: "patient_portal_imaging_report_viewed",
      entityType: "imaging_report_file",
      entityId: String(reportFile.id),
      meta: { visitId: visit.id, fileName: reportFile.original_name },
    });

    setPrivateHeaders(res);
    res.set({
      "Content-Type": reportFile.mime_type,
      "Content-Disposition": `inline; filename="${safeFileName}"`,
    });
    res.send(reportFile.file_data);
  } catch (error) {
    next(error);
  }
});

module.exports = { patientPortalRouter, getPortalPathologyReportLinks };
