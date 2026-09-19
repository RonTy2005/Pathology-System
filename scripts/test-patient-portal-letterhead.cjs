const test = require("node:test");
const assert = require("node:assert/strict");

const {
  getPatientPortalReportUrl,
  shouldIncludePortalLetterhead,
} = require("../src/utils/patientPortal");

function request() {
  return {
    headers: {},
    protocol: "https",
    get(name) {
      return name === "host" ? "reports.example.test" : "";
    },
    socket: { localPort: 3000 },
  };
}

test("patient portal displays an uploaded pad for legacy QR links", () => {
  assert.equal(shouldIncludePortalLetterhead(undefined, "data:image/png;base64,AAAA"), true);
  assert.equal(shouldIncludePortalLetterhead(undefined, ""), false);
});

test("an explicit report style is preserved in the public QR URL", () => {
  assert.equal(shouldIncludePortalLetterhead("0", "data:image/png;base64,AAAA"), false);
  assert.equal(shouldIncludePortalLetterhead("1", ""), true);
  assert.equal(
    getPatientPortalReportUrl(request(), "patient-token", "https://reports.example.test", true),
    "https://reports.example.test/api/patient-reports/patient-token/report?letterhead=1"
  );
  assert.equal(
    getPatientPortalReportUrl(request(), "patient-token", "https://reports.example.test", false),
    "https://reports.example.test/api/patient-reports/patient-token/report?letterhead=0"
  );
});

test("status-page report links without a style remain backward compatible", () => {
  assert.equal(
    getPatientPortalReportUrl(request(), "patient-token", "https://reports.example.test"),
    "https://reports.example.test/api/patient-reports/patient-token/report"
  );
});
