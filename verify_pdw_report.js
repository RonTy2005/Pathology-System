const { buildReportHtml } = require('./src/utils/reportFormatter');
const fs = require('fs');
const path = require('path');

const mockReportData = {
  patient: {
    name: "Grace Green",
    age: "27",
    gender: "Female",
    id: "PT-55667"
  },
  visit: {
    bill_no: "BILL-2026-009",
    created_at: "2026-05-04 18:00:00",
    associate_label: "Direct at Lab"
  },
  report: {
    finalized_at: "2026-05-04 20:00:00"
  },
  doctor: {
    name: "Dr. Self",
    specialization: "General"
  },
  tests: [
    {
      id: 1260,
      name: "Platelet Distribution Width (PDW)",
      code: "PDW1003",
      parameters: [
        {
          parameter_name: "PLATELET DISTRIBUTION WIDTH",
          value: "37.00",
          unit: "%",
          normal_range: "9.00 - 17.00"
        }
      ]
    }
  ]
};

const html = buildReportHtml(mockReportData);
const outputPath = path.join(__dirname, 'scratch', 'test_pdw_final.html');
fs.writeFileSync(outputPath, html);
console.log('Report generated at:', outputPath);
