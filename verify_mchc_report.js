const { buildReportHtml } = require('./src/utils/reportFormatter');
const fs = require('fs');
const path = require('path');

const mockReportData = {
  patient: {
    name: "Alice Brown",
    age: "28",
    gender: "Female",
    id: "PT-55667"
  },
  visit: {
    bill_no: "BILL-2026-004",
    created_at: "2026-05-04 13:00:00",
    associate_label: "Direct at Lab"
  },
  report: {
    finalized_at: "2026-05-04 15:00:00"
  },
  doctor: {
    name: "Dr. Self",
    specialization: "General"
  },
  tests: [
    {
      id: 605,
      name: "MCHC (Mean Corpuscular Hb. Concentration)",
      code: "MCH1628",
      parameters: [
        {
          parameter_name: "Mean Corpuscular Hemoglobin Concentration (MCHC)",
          value: "",
          unit: "",
          normal_range: ""
        },
        {
          parameter_name: "MCHC",
          value: "32.8",
          unit: "g/dL",
          normal_range: "32.5 - 34.5"
        }
      ]
    }
  ]
};

const html = buildReportHtml(mockReportData);
const outputPath = path.join(__dirname, 'scratch', 'test_mchc_final.html');
fs.writeFileSync(outputPath, html);
console.log('Report generated at:', outputPath);
