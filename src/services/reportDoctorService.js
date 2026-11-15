const MAX_REPORT_DOCTORS = 24;

function cleanDoctorText(value, maxLength) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, maxLength);
}

function parseAdditionalReportDoctors(value) {
  let doctors = value;
  if (typeof doctors === "string") {
    try { doctors = JSON.parse(doctors); } catch (_) { return []; }
  }
  if (!Array.isArray(doctors)) return [];
  return doctors.filter(doctor => doctor && typeof doctor === "object" && !Array.isArray(doctor)).map(doctor => ({
    name: cleanDoctorText(doctor.name, 100),
    qualification: cleanDoctorText(doctor.qualification, 160),
    registrationNo: cleanDoctorText(doctor.registrationNo, 80),
    signatureDataUrl: doctor.signatureDataUrl || null,
  }));
}

function badRequest(message) {
  const error = new Error(message);
  error.statusCode = 400;
  throw error;
}

function validateReportDoctorSignatureImage(value) {
  if (value === null) return null;
  const imageDataUrl = String(value || "");
  const isImageDataUrl = /^data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/]+={0,2}$/i.test(imageDataUrl);
  const estimatedBytes = Math.floor((imageDataUrl.length - imageDataUrl.indexOf(",") - 1) * 0.75);
  if (!isImageDataUrl || estimatedBytes > 2 * 1024 * 1024) {
    badRequest("Upload a valid doctor signature image no larger than 2 MB.");
  }
  return imageDataUrl;
}

function validateAdditionalReportDoctors(value) {
  if (!Array.isArray(value) || value.length >= MAX_REPORT_DOCTORS) {
    badRequest(`Provide a doctor list with at most ${MAX_REPORT_DOCTORS - 1} additional doctors.`);
  }
  return value.map(doctor => {
    if (!doctor || typeof doctor !== "object" || Array.isArray(doctor)) badRequest("Enter valid reporting doctor details.");
    const name = cleanDoctorText(doctor.name, 100);
    if (!name) badRequest("Enter a name for every additional reporting doctor, or remove the empty doctor.");
    return {
      name,
      qualification: cleanDoctorText(doctor.qualification, 160),
      registrationNo: cleanDoctorText(doctor.registrationNo, 80),
      signatureDataUrl: validateReportDoctorSignatureImage(doctor.signatureDataUrl ?? null),
    };
  });
}

module.exports = { MAX_REPORT_DOCTORS, parseAdditionalReportDoctors, validateAdditionalReportDoctors, validateReportDoctorSignatureImage };
