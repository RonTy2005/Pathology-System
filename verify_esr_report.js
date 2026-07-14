const { buildReportHtml } = require('./src/utils/reportFormatter');
const fs = require('fs');
const path = require('path');

const mockReportData = {
  patient: {
    name: "Henry Hall",
    age: "42",
    gender: "Male",
    id: "PT-77889"
  },
  visit: {
    bill_no: "BILL-2026-010",
    created_at: "2026-05-04 19:00:00",
    associate_label: "Direct at Lab"
  },
  report: {
    finalized_at: "2026-05-04 21:00:00"
  },
  doctor: {
    name: "Dr. Self",
    specialization: "General"
  },
  tests: [
    {
      id: 424,
      name: "ESR (Erythrocyte Sedimentation Rate)",
      code: "ESR7260",
      parameters: [
        {
          parameter_name: "ESR",
          value: "5",
          unit: "mm/hr",
          normal_range: "0 - 15"
        }
      ]
    }
  ]
};

const html = buildReportHtml(mockReportData);
const outputPath = path.join(__dirname, 'scratch', 'test_esr_final.html');
fs.writeFileSync(outputPath, html);
console.log('Report generated at:', outputPath);
