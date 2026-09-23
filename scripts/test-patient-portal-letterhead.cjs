const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  getPatientPortalReportUrl,
  shouldIncludePortalLetterhead,
} = require("../src/utils/patientPortal");
const { getPortalPathologyReportLinks } = require("../src/routes/patientPortalRoutes");

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

test("patient QR portal lists every finalized laboratory test as its own report", () => {
  const links = getPortalPathologyReportLinks(
    { patient_portal_token: "patient-token" },
    [
      { visit_test_id: 101, test_id: 11, name: "Complete Blood Count" },
      { visit_test_id: 102, test_id: 12, name: "Thyroid Stimulating Hormone (TSH)" },
      { visit_test_id: 103, test_id: 13, name: "Liver Function Test (LFT)" },
    ]
  );

  assert.equal(links.length, 3);
  assert.deepEqual(links.map((link) => link.label), [
    "Complete Blood Count report",
    "Thyroid Stimulating Hormone (TSH) report",
    "Liver Function Test (LFT) report",
  ]);
  assert.equal(
    links[1].url,
    "/api/patient-reports/patient-token/report?visitTestId=102&testId=12"
  );
});

test("new patient registrations receive a secure portal token before their bill QR is printed", () => {
  const routeSource = fs.readFileSync(path.join(__dirname, "../src/routes/patientRoutes.js"), "utf8");
  assert.match(routeSource, /const \{ createPatientPortalToken \} = require\("\.\.\/utils\/patientPortal"\);/);
  assert.match(routeSource, /created_at, patient_portal_token\s*\)\s*VALUES[\s\S]*?createPatientPortalToken\(\)/);
});
