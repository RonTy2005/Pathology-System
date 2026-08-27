const { get, run } = require("../db/helpers");
const { DEFAULT_BUSINESS_NAME } = require("../config/constants");

const DEFAULT_LETTERHEAD_HEADER_SPACE_MM = 50;

function normalizeReportSpace(value) {
  const space = Number(value);
  return Number.isInteger(space) && space >= 0 && space <= 140 ? space : 0;
}

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeFacilityTypes(value) {
  return Array.from(new Set(
    normalizeText(value)
      .split(",")
      .map((type) => type.trim())
      .filter(Boolean)
  ));
}

async function getBusinessSettings({ includeLetterhead = false, includeReportDoctorSignature = false, includeBusinessLogo = false } = {}) {
  const settings = await get(
    `SELECT business_name,
            facility_type,
            address,
            phone,
            email,
            registration_no,
            patient_portal_base_url,
            ${includeBusinessLogo ? "business_logo_data_url," : ""}
            report_doctor_name,
            report_doctor_qualification,
            report_doctor_registration_no,
            setup_completed,
            ${includeLetterhead ? "letterhead_data_url," : ""}
            default_report_includes_letterhead,
            ${includeReportDoctorSignature ? "report_doctor_signature_data_url," : ""}
            CASE WHEN COALESCE(business_logo_data_url, '') <> '' THEN 1 ELSE 0 END AS has_business_logo,
            CASE WHEN COALESCE(letterhead_data_url, '') <> '' THEN 1 ELSE 0 END AS has_letterhead,
            CASE WHEN COALESCE(report_doctor_signature_data_url, '') <> '' THEN 1 ELSE 0 END AS has_report_doctor_signature,
            report_header_space_mm,
            report_footer_space_mm,
            updated_at
     FROM business_settings
     WHERE id = 1`
  );

  const facilityTypes = normalizeFacilityTypes(settings?.facility_type);

  const hasLetterhead = Boolean(settings?.has_letterhead);
  // A full-page letterhead needs a protected header area. Existing installations
  // created before this setting may have 0 saved, so use a safe A4 default until
  // the Super Admin chooses a different non-zero value.
  const savedHeaderSpaceMm = normalizeReportSpace(settings?.report_header_space_mm);
  const reportHeaderSpaceMm = hasLetterhead && savedHeaderSpaceMm === 0
    ? DEFAULT_LETTERHEAD_HEADER_SPACE_MM
    : savedHeaderSpaceMm;

  return {
    businessName: settings?.business_name || DEFAULT_BUSINESS_NAME,
    facilityType: facilityTypes.join(", "),
    facilityTypes,
    address: normalizeText(settings?.address),
    phone: normalizeText(settings?.phone),
    email: normalizeText(settings?.email),
    registrationNo: normalizeText(settings?.registration_no),
    patientPortalBaseUrl: normalizeText(settings?.patient_portal_base_url),
    hasBusinessLogo: Boolean(settings?.has_business_logo),
    reportDoctorName: normalizeText(settings?.report_doctor_name),
    reportDoctorQualification: normalizeText(settings?.report_doctor_qualification),
    reportDoctorRegistrationNo: normalizeText(settings?.report_doctor_registration_no),
    hasReportDoctorSignature: Boolean(settings?.has_report_doctor_signature),
    setupCompleted: Number(settings?.setup_completed) === 1,
    hasLetterhead,
    defaultReportIncludesLetterhead: Number(settings?.default_report_includes_letterhead) !== 0,
    ...(includeLetterhead ? { letterheadDataUrl: settings?.letterhead_data_url || null } : {}),
    ...(includeBusinessLogo ? { businessLogoDataUrl: settings?.business_logo_data_url || null } : {}),
    ...(includeReportDoctorSignature ? { reportDoctorSignatureDataUrl: settings?.report_doctor_signature_data_url || null } : {}),
    reportHeaderSpaceMm,
    reportFooterSpaceMm: normalizeReportSpace(settings?.report_footer_space_mm),
    updatedAt: settings?.updated_at || null,
  };
}

async function getBusinessName() {
  const settings = await getBusinessSettings();
  return settings.businessName;
}

async function isBusinessSetupComplete() {
  const settings = await getBusinessSettings();
  return settings.setupCompleted;
}

async function updateBusinessSettings(businessName, {
  facilityType,
  address,
  phone,
  email,
  registrationNo,
  updateFacilityProfile = false,
  patientPortalBaseUrl,
  updatePatientPortalBaseUrl = false,
  setupCompleted,
  updateSetupCompleted = false,
  letterheadDataUrl,
  updateLetterhead = false,
  defaultReportIncludesLetterhead,
  updateDefaultReportIncludesLetterhead = false,
  reportHeaderSpaceMm,
  reportFooterSpaceMm,
  updateReportLayout = false,
  reportDoctorName,
  reportDoctorQualification,
  reportDoctorRegistrationNo,
  updateReportDoctorDetails = false,
  reportDoctorSignatureDataUrl,
  updateReportDoctorSignature = false,
  businessLogoDataUrl,
  updateBusinessLogo = false,
} = {}) {
  const assignments = ["business_name = ?"];
  const params = [businessName];

  if (updateFacilityProfile) {
    assignments.push(
      "facility_type = ?",
      "address = ?",
      "phone = ?",
      "email = ?",
      "registration_no = ?"
    );
    params.push(facilityType, address, phone, email, registrationNo);
  }

  if (updateSetupCompleted) {
    assignments.push("setup_completed = ?");
    params.push(setupCompleted ? 1 : 0);
  }

  if (updatePatientPortalBaseUrl) {
    assignments.push("patient_portal_base_url = ?");
    params.push(patientPortalBaseUrl);
  }

  if (updateLetterhead) {
    assignments.push("letterhead_data_url = ?");
    params.push(letterheadDataUrl);
  }

  if (updateDefaultReportIncludesLetterhead) {
    assignments.push("default_report_includes_letterhead = ?");
    params.push(defaultReportIncludesLetterhead ? 1 : 0);
  }

  if (updateBusinessLogo) {
    assignments.push("business_logo_data_url = ?");
    params.push(businessLogoDataUrl);
  }

  if (updateReportLayout) {
    assignments.push("report_header_space_mm = ?", "report_footer_space_mm = ?");
    params.push(reportHeaderSpaceMm, reportFooterSpaceMm);
  }

  if (updateReportDoctorDetails) {
    assignments.push(
      "report_doctor_name = ?",
      "report_doctor_qualification = ?",
      "report_doctor_registration_no = ?"
    );
    params.push(reportDoctorName, reportDoctorQualification, reportDoctorRegistrationNo);
  }

  if (updateReportDoctorSignature) {
    assignments.push("report_doctor_signature_data_url = ?");
    params.push(reportDoctorSignatureDataUrl);
  }

  assignments.push("updated_at = CURRENT_TIMESTAMP");

  await run(`UPDATE business_settings SET ${assignments.join(", ")} WHERE id = 1`, params);

  return getBusinessSettings();
}

async function updateBusinessName(businessName) {
  return updateBusinessSettings(businessName);
}

module.exports = {
  getBusinessSettings,
  getBusinessName,
  isBusinessSetupComplete,
  normalizeFacilityTypes,
  updateBusinessSettings,
  updateBusinessName,
};
