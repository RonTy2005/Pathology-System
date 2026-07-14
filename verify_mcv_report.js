const { buildReportHtml } = require('./src/utils/reportFormatter');
const fs = require('fs');
const path = require('path');

const mockReportData = {
  patient: {
    name: "David White",
    age: "42",
    gender: "Male",
    id: "PT-77665"
  },
  visit: {
    bill_no: "BILL-2026-006",
    created_at: "2026-05-04 15:00:00",
    associate_label: "Direct at Lab"
  },
  report: {
    finalized_at: "2026-05-04 17:00:00"
  },
  doctor: {
    name: "Dr. Self",
    specialization: "General"
  },
  tests: [
    {
      id: 606,
      name: "MCV (Mean Corpuscular Volume)",
      code: "MCV8506",
      parameters: [
        {
          parameter_name: "Mean Corpuscular Volume (MCV)",
          value: "87.85",
          unit: "fL",
          normal_range: "83.00 - 101.00"
        }
      ]
    }
  ]
};

const html = buildReportHtml(mockReportData);
const outputPath = path.join(__dirname, 'scratch', 'test_mcv_final.html');
fs.writeFileSync(outputPath, html);
console.log('Report generated at:', outputPath);
