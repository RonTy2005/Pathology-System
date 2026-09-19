const crypto = require("crypto");
const os = require("os");

function createPatientPortalToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function getLanIpv4Address() {
  const addresses = Object.values(os.networkInterfaces()).flat()
    .filter((address) => address && !address.internal
      && (address.family === "IPv4" || address.family === 4))
    .map((address) => address.address)
    .filter((address) => {
      const [first, second] = address.split(".").map(Number);
      return first === 10
        || (first === 192 && second === 168)
        || (first === 172 && second >= 16 && second <= 31);
    });

  return addresses.find((address) => address.startsWith("192.168."))
    || addresses.find((address) => address.startsWith("10."))
    || addresses[0]
    || null;
}

function isLocalHost(host) {
  const hostname = String(host || "").trim().toLowerCase()
    .replace(/^\[/, "")
    .replace(/\].*$/, "")
    .replace(/:\d+$/, "");
  return hostname === "localhost" || hostname === "::1" || hostname.startsWith("127.");
}

function getPatientPortalBaseUrl(req, savedBaseUrl = "") {
  const configuredBaseUrl = String(savedBaseUrl || process.env.PATIENT_PORTAL_BASE_URL || "").trim().replace(/\/+$/, "");
  if (/^https?:\/\/[^/]+(?:\/.*)?$/i.test(configuredBaseUrl)) {
    return configuredBaseUrl;
  }

  const forwardedProtocol = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim();
  const protocol = forwardedProtocol || req.protocol || "http";
  const host = req.get("host") || "";
  if (isLocalHost(host)) {
    const lanAddress = getLanIpv4Address();
    const port = Number(req.socket?.localPort) || 3000;
    if (lanAddress) return `${protocol}://${lanAddress}:${port}`;
  }

  return `${protocol}://${host}`;
}

function getPatientPortalUrl(req, token, savedBaseUrl) {
  return `${getPatientPortalBaseUrl(req, savedBaseUrl)}/report-status.html?token=${encodeURIComponent(token)}`;
}

function getPatientPortalReportUrl(req, token, savedBaseUrl, includeLetterhead) {
  const url = `${getPatientPortalBaseUrl(req, savedBaseUrl)}/api/patient-reports/${encodeURIComponent(token)}/report`;
  if (typeof includeLetterhead !== "boolean") return url;
  return `${url}?letterhead=${includeLetterhead ? "1" : "0"}`;
}

function shouldIncludePortalLetterhead(requestedStyle, letterheadDataUrl) {
  if (requestedStyle === "0") return false;
  if (requestedStyle === "1") return true;

  // Older printed QR codes do not carry a style parameter. Patient-facing
  // reports should still show the laboratory pad whenever one is available,
  // regardless of the staff-facing default print selection.
  return Boolean(String(letterheadDataUrl || "").trim());
}

function getPatientPortalBillUrl(req, token, savedBaseUrl) {
  return `${getPatientPortalBaseUrl(req, savedBaseUrl)}/api/patient-reports/${encodeURIComponent(token)}/bill`;
}

function getTestReportPreviewUrl(req, testId, savedBaseUrl) {
  return `${getPatientPortalBaseUrl(req, savedBaseUrl)}/api/patient-reports/sample/test/${encodeURIComponent(String(testId))}/report`;
}

function getPatientPortalQrUrl(portalUrl) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=130x130&margin=0&data=${encodeURIComponent(portalUrl)}`;
}

module.exports = {
  createPatientPortalToken,
  getPatientPortalBaseUrl,
  getPatientPortalUrl,
  getPatientPortalReportUrl,
  shouldIncludePortalLetterhead,
  getPatientPortalBillUrl,
  getTestReportPreviewUrl,
  getPatientPortalQrUrl,
};
