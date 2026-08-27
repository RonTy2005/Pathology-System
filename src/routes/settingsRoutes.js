const express = require("express");
const { authRequired, allowRoles } = require("../middleware/auth");
const { ROLES } = require("../config/constants");
const { getBusinessSettings, updateBusinessSettings } = require("../services/businessSettingsService");
const { getSubscriptionStatus, updateSubscriptionExpiry } = require("../services/subscriptionService");
const { logAction } = require("../services/logService");

const settingsRouter = express.Router();

const FACILITY_TYPES = new Set([
  "Diagnostic Centre",
  "Hospital",
  "Laboratory",
  "Clinic",
  "Imaging Centre",
  "Other",
]);

function cleanText(value, maxLength) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, maxLength);
}

function normalizeFacilityTypes(value, fallback = []) {
  const requestedTypes = Array.isArray(value) ? value : value == null ? fallback : [value];
  return Array.from(new Set(
    requestedTypes
      .flatMap((type) => String(type || "").split(","))
      .map((type) => cleanText(type, 40))
      .filter(Boolean)
  ));
}

function normalizePatientPortalBaseUrl(value) {
  const rawValue = cleanText(value, 250).replace(/\/+$/, "");
  if (!rawValue) return "";

  const candidate = /^https?:\/\//i.test(rawValue) ? rawValue : `https://${rawValue}`;
  let url;
  try {
    url = new URL(candidate);
  } catch (_error) {
    const error = new Error("Enter a valid public report portal URL.");
    error.statusCode = 400;
    throw error;
  }

  if (url.protocol !== "https:" || !url.hostname || url.username || url.password || url.search || url.hash) {
    const error = new Error("Use a public HTTPS URL without a query, fragment, or login details.");
    error.statusCode = 400;
    throw error;
  }

  return url.toString().replace(/\/+$/, "");
}

function reportDoctorSignatureResponse(settings) {
  return {
    reportDoctorName: settings.reportDoctorName,
    reportDoctorQualification: settings.reportDoctorQualification,
    reportDoctorRegistrationNo: settings.reportDoctorRegistrationNo,
    hasReportDoctorSignature: settings.hasReportDoctorSignature,
    reportDoctorSignatureDataUrl: settings.reportDoctorSignatureDataUrl || null,
  };
}

function validateReportDoctorSignatureImage(value) {
  if (value === null) return null;

  const imageDataUrl = String(value || "");
  const isImageDataUrl = /^data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/]+={0,2}$/i.test(imageDataUrl);
  const estimatedBytes = Math.floor((imageDataUrl.length - imageDataUrl.indexOf(",") - 1) * 0.75);
  if (!isImageDataUrl || estimatedBytes > 2 * 1024 * 1024) {
    const error = new Error("Upload a valid doctor signature image no larger than 2 MB.");
    error.statusCode = 400;
    throw error;
  }

  return imageDataUrl;
}

function validateBusinessLogoImage(value) {
  if (value === null) return null;

  const imageDataUrl = String(value || "");
  const isImageDataUrl = /^data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/]+={0,2}$/i.test(imageDataUrl);
  const estimatedBytes = Math.floor((imageDataUrl.length - imageDataUrl.indexOf(",") - 1) * 0.75);
  if (!isImageDataUrl || estimatedBytes > 2 * 1024 * 1024) {
    const error = new Error("Upload a valid business logo image no larger than 2 MB.");
    error.statusCode = 400;
    throw error;
  }

  return imageDataUrl;
}

// Keep the public surface deliberately small; facility profile and setup state
// are visible only to a signed-in Super Admin.
settingsRouter.get("/branding", async (_req, res, next) => {
  try {
    const settings = await getBusinessSettings();
    res.json({ businessName: settings.businessName });
  } catch (error) {
    next(error);
  }
});

settingsRouter.get("/business", authRequired, allowRoles(ROLES.SUPERADMIN), async (_req, res, next) => {
  try {
    res.json(await getBusinessSettings({ includeReportDoctorSignature: true }));
  } catch (error) {
    next(error);
  }
});

settingsRouter.get("/business/letterhead", authRequired, allowRoles(ROLES.SUPERADMIN), async (_req, res, next) => {
  try {
    const settings = await getBusinessSettings({ includeLetterhead: true });
    res.json({ letterheadDataUrl: settings.letterheadDataUrl });
  } catch (error) {
    next(error);
  }
});

settingsRouter.get("/business/logo", authRequired, allowRoles(ROLES.SUPERADMIN), async (_req, res, next) => {
  try {
    const settings = await getBusinessSettings({ includeBusinessLogo: true });
    res.json({ businessLogoDataUrl: settings.businessLogoDataUrl || null });
  } catch (error) {
    next(error);
  }
});

settingsRouter.get("/report-doctor-signature", authRequired, allowRoles(ROLES.ADMIN), async (_req, res, next) => {
  try {
    const settings = await getBusinessSettings({ includeReportDoctorSignature: true });
    res.json(reportDoctorSignatureResponse(settings));
  } catch (error) {
    next(error);
  }
});

settingsRouter.patch("/report-doctor-signature", authRequired, allowRoles(ROLES.ADMIN), async (req, res, next) => {
  try {
    const previous = await getBusinessSettings({ includeReportDoctorSignature: true });
    const updateReportDoctorSignature = Object.prototype.hasOwnProperty.call(req.body, "reportDoctorSignatureDataUrl");
    const reportDoctorSignatureDataUrl = updateReportDoctorSignature
      ? validateReportDoctorSignatureImage(req.body.reportDoctorSignatureDataUrl)
      : undefined;
    const reportDoctorName = cleanText(req.body.reportDoctorName ?? previous.reportDoctorName, 100);
    const reportDoctorQualification = cleanText(req.body.reportDoctorQualification ?? previous.reportDoctorQualification, 160);
    const reportDoctorRegistrationNo = cleanText(req.body.reportDoctorRegistrationNo ?? previous.reportDoctorRegistrationNo, 80);

    const settings = await updateBusinessSettings(previous.businessName, {
      reportDoctorName,
      reportDoctorQualification,
      reportDoctorRegistrationNo,
      updateReportDoctorDetails: true,
      reportDoctorSignatureDataUrl,
      updateReportDoctorSignature,
    });

    await logAction({
      userId: req.user.id,
      action: "report_doctor_signature_updated",
      entityType: "business_settings",
      entityId: "1",
      meta: {
        doctorName: reportDoctorName,
        signatureImageChanged: updateReportDoctorSignature,
      },
    });

    res.json(reportDoctorSignatureResponse({
      ...settings,
      reportDoctorSignatureDataUrl: updateReportDoctorSignature
        ? reportDoctorSignatureDataUrl
        : previous.reportDoctorSignatureDataUrl,
    }));
  } catch (error) {
    next(error);
  }
});

settingsRouter.get("/subscription", authRequired, allowRoles(ROLES.SUPERADMIN), async (_req, res, next) => {
  try {
    res.json(await getSubscriptionStatus());
  } catch (error) {
    next(error);
  }
});

settingsRouter.patch("/subscription", authRequired, allowRoles(ROLES.SUPERADMIN), async (req, res, next) => {
  try {
    const subscription = await updateSubscriptionExpiry(req.body.expiresOn, req.user.id);
    await logAction({
      userId: req.user.id,
      action: "subscription_expiry_updated",
      entityType: "business_settings",
      entityId: "1",
      meta: { expiresOn: subscription.expiresOn, daysRemaining: subscription.daysRemaining },
    });
    res.json(subscription);
  } catch (error) {
    next(error);
  }
});

settingsRouter.patch("/business", authRequired, allowRoles(ROLES.SUPERADMIN), async (req, res, next) => {
  try {
    const businessName = cleanText(req.body.businessName, 100);
    const updateLetterhead = Object.prototype.hasOwnProperty.call(req.body, "letterheadDataUrl");
    const letterheadDataUrl = req.body.letterheadDataUrl;
    const updateDefaultReportIncludesLetterhead = Object.prototype.hasOwnProperty.call(req.body, "defaultReportIncludesLetterhead");
    const updateBusinessLogo = Object.prototype.hasOwnProperty.call(req.body, "businessLogoDataUrl");
    const businessLogoDataUrl = updateBusinessLogo
      ? validateBusinessLogoImage(req.body.businessLogoDataUrl)
      : undefined;
    const updatePatientPortalBaseUrl = Object.prototype.hasOwnProperty.call(req.body, "patientPortalBaseUrl");
    const updateReportLayout = Object.prototype.hasOwnProperty.call(req.body, "reportHeaderSpaceMm")
      || Object.prototype.hasOwnProperty.call(req.body, "reportFooterSpaceMm");
    const updateReportDoctorDetails = ["reportDoctorName", "reportDoctorQualification", "reportDoctorRegistrationNo"]
      .some((field) => Object.prototype.hasOwnProperty.call(req.body, field));
    const updateReportDoctorSignature = Object.prototype.hasOwnProperty.call(req.body, "reportDoctorSignatureDataUrl");
    const reportDoctorSignatureDataUrl = req.body.reportDoctorSignatureDataUrl;

    if (businessName.length < 2 || businessName.length > 100) {
      return res.status(400).json({ message: "Business name must be between 2 and 100 characters." });
    }

    const previous = await getBusinessSettings();
    const updateFacilityProfile = ["facilityType", "facilityTypes", "address", "phone", "email", "registrationNo"]
      .some((field) => Object.prototype.hasOwnProperty.call(req.body, field));
    const facilityTypes = normalizeFacilityTypes(
      req.body.facilityTypes ?? req.body.facilityType,
      previous.facilityTypes
    );
    const facilityType = facilityTypes.join(", ");
    const address = cleanText(req.body.address ?? previous.address, 250);
    const phone = cleanText(req.body.phone ?? previous.phone, 80);
    const email = cleanText(req.body.email ?? previous.email, 120);
    const registrationNo = cleanText(req.body.registrationNo ?? previous.registrationNo, 80);
    const patientPortalBaseUrl = updatePatientPortalBaseUrl
      ? normalizePatientPortalBaseUrl(req.body.patientPortalBaseUrl)
      : previous.patientPortalBaseUrl;
    const reportDoctorName = cleanText(req.body.reportDoctorName ?? previous.reportDoctorName, 100);
    const reportDoctorQualification = cleanText(req.body.reportDoctorQualification ?? previous.reportDoctorQualification, 160);
    const reportDoctorRegistrationNo = cleanText(req.body.reportDoctorRegistrationNo ?? previous.reportDoctorRegistrationNo, 80);
    const completeSetup = req.body.completeSetup === true;
    const defaultReportIncludesLetterhead = updateDefaultReportIncludesLetterhead
      ? req.body.defaultReportIncludesLetterhead
      : previous.defaultReportIncludesLetterhead;

    if ((completeSetup || previous.setupCompleted) && facilityTypes.length === 0) {
      return res.status(400).json({ message: "Select at least one facility type before completing setup." });
    }

    if (facilityTypes.some((type) => !FACILITY_TYPES.has(type))) {
      return res.status(400).json({ message: "One or more selected facility types are not supported." });
    }

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ message: "Enter a valid email address or leave it blank." });
    }

    if (updateDefaultReportIncludesLetterhead && typeof defaultReportIncludesLetterhead !== "boolean") {
      return res.status(400).json({ message: "Choose whether reports should print with or without the letterhead." });
    }
    const reportHeaderSpaceMm = updateReportLayout
      ? Number(req.body.reportHeaderSpaceMm ?? previous.reportHeaderSpaceMm)
      : previous.reportHeaderSpaceMm;
    const reportFooterSpaceMm = updateReportLayout
      ? Number(req.body.reportFooterSpaceMm ?? previous.reportFooterSpaceMm)
      : previous.reportFooterSpaceMm;

    if (!Number.isInteger(reportHeaderSpaceMm) || !Number.isInteger(reportFooterSpaceMm)
      || reportHeaderSpaceMm < 0 || reportHeaderSpaceMm > 140
      || reportFooterSpaceMm < 0 || reportFooterSpaceMm > 140
      || reportHeaderSpaceMm + reportFooterSpaceMm > 240) {
      return res.status(400).json({ message: "Header and footer space must be whole millimetres and leave room for report content." });
    }

    if (updateLetterhead && letterheadDataUrl !== null) {
      const imageDataUrl = String(letterheadDataUrl || "");
      const isImageDataUrl = /^data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/]+={0,2}$/i.test(imageDataUrl);
      const estimatedBytes = Math.floor((imageDataUrl.length - imageDataUrl.indexOf(",") - 1) * 0.75);

      if (!isImageDataUrl || estimatedBytes > 4 * 1024 * 1024) {
        return res.status(400).json({ message: "Upload a valid image letterhead no larger than 4 MB." });
      }
    }

    if (updateReportDoctorSignature) validateReportDoctorSignatureImage(reportDoctorSignatureDataUrl);

    const settings = await updateBusinessSettings(businessName, {
      facilityType,
      address,
      phone,
      email,
      registrationNo,
      updateFacilityProfile,
      patientPortalBaseUrl,
      updatePatientPortalBaseUrl,
      setupCompleted: completeSetup ? true : previous.setupCompleted,
      updateSetupCompleted: completeSetup,
      letterheadDataUrl,
      updateLetterhead,
      defaultReportIncludesLetterhead,
      updateDefaultReportIncludesLetterhead,
      businessLogoDataUrl,
      updateBusinessLogo,
      reportHeaderSpaceMm,
      reportFooterSpaceMm,
      updateReportLayout,
      reportDoctorName,
      reportDoctorQualification,
      reportDoctorRegistrationNo,
      updateReportDoctorDetails,
      reportDoctorSignatureDataUrl,
      updateReportDoctorSignature,
    });

    await logAction({
      userId: req.user.id,
      action: completeSetup ? "business_setup_completed" : updateLetterhead || updateDefaultReportIncludesLetterhead || updateBusinessLogo || updatePatientPortalBaseUrl || updateReportLayout || updateFacilityProfile || updateReportDoctorDetails || updateReportDoctorSignature ? "business_settings_updated" : "business_name_updated",
      entityType: "business_settings",
      entityId: "1",
      meta: {
        previousBusinessName: previous.businessName,
        businessName: settings.businessName,
        facilityType: settings.facilityType,
        patientPortalBaseUrl: settings.patientPortalBaseUrl,
        patientPortalBaseUrlChanged: updatePatientPortalBaseUrl,
        setupCompleted: settings.setupCompleted,
        letterheadChanged: updateLetterhead,
        defaultReportIncludesLetterheadChanged: updateDefaultReportIncludesLetterhead,
        defaultReportIncludesLetterhead: settings.defaultReportIncludesLetterhead,
        businessLogoChanged: updateBusinessLogo,
        reportLayoutChanged: updateReportLayout,
        reportHeaderSpaceMm: settings.reportHeaderSpaceMm,
        reportFooterSpaceMm: settings.reportFooterSpaceMm,
        reportDoctorDetailsChanged: updateReportDoctorDetails,
        reportDoctorSignatureChanged: updateReportDoctorSignature,
      },
    });

    res.json(settings);
  } catch (error) {
    next(error);
  }
});

module.exports = { settingsRouter };
