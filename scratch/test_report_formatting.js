const { buildReportHtml } = require("../src/utils/reportFormatter");

const mockDataLab = {
  patient: { id: "P123", name: "John Doe", age: "30", gender: "Male" },
  visit: { bill_no: "BILL-20260503-0001", created_at: new Date().toISOString(), sample_source: "lab" },
  doctor: { name: "Dr. Smith", specialization: "MBBS, MD" },
  report: { finalized_at: new Date().toISOString(), report_no: "R123" },
  tests: [
    {
      parameters: [
        { parameter_name: "Hemoglobin", value: "14.5", unit: "g/dL", normal_range: "13.0-17.0" }
      ]
    }
  ]
};

const mockDataAssociate = {
  ...mockDataLab,
  visit: { ...mockDataLab.visit, sample_source: "associate", associate_label: "Express Clinic (A456)" },
  associate: { name: "Express Clinic" }
};

console.log("--- LAB DIRECT REPORT ---");
const htmlLab = buildReportHtml(mockDataLab);
if (htmlLab.includes("Ref. By: <strong>Dr. Smith</strong> (MBBS, MD)") && 
    htmlLab.includes("SAMPLE COLLECTED AT: WE CARE DIAGNOSTICS CENTRE") &&
    htmlLab.includes("<div class=\"info-row\">PID : 0001</div>")) {
  console.log("Lab Direct Report: PASSED");
} else {
  console.log("Lab Direct Report: FAILED");
  // console.log(htmlLab);
}

console.log("\n--- ASSOCIATE REPORT ---");
const htmlAssoc = buildReportHtml(mockDataAssociate);
if (htmlAssoc.includes("SAMPLE COLLECTED BY: Express Clinic (A456)")) {
  console.log("Associate Report: PASSED");
} else {
  console.log("Associate Report: FAILED");
  // console.log(htmlAssoc);
}
