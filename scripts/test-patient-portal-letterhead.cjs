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

test("patient portal displays an uploaded pad for every QR report", () => {
  assert.equal(shouldIncludePortalLetterhead("data:image/png;base64,AAAA"), true);
  assert.equal(shouldIncludePortalLetterhead(""), false);
});

test("public QR URL remains independent of the staff print style", () => {
  assert.equal(
    getPatientPortalReportUrl(request(), "patient-token", "https://reports.example.test"),
    "https://reports.example.test/api/patient-reports/patient-token/report"
  );
});
