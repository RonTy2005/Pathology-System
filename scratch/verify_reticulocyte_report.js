const { buildReportHtml } = require('../src/utils/reportFormatter');
const fs = require('fs');
const path = require('path');

const mockReportData = {
  patient: {
    name: "John Doe",
    age: "35",
    gender: "Male",
    id: "PT-99887"
  },
  visit: {
    bill_no: "BILL-2026-RET-001",
    created_at: "2026-05-07 10:00:00",
    associate_label: "Direct at Lab"
  },
  report: {
    finalized_at: "2026-05-07 11:00:00"
  },
  doctor: {
    name: "Dr. Self",
    specialization: "General"
  },
  tests: [
    {
      id: 1263,
      name: "RETICULOCYTE COUNT",
      code: "RETIC",
      parameters: [
        {
          parameter_name: "RETICULOCYTE COUNT",
          value: "4.5",
          unit: "%",
          normal_range: "0.5 - 2.5"
        }
      ]
    }
  ]
};

const html = buildReportHtml(mockReportData);
const outputPath = path.join(__dirname, 'test_reticulocyte_report.html');
fs.writeFileSync(outputPath, html);
console.log('Report generated at:', outputPath);
