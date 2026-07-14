const { buildReportHtml } = require('./src/utils/reportFormatter');
const fs = require('fs');
const path = require('path');

const mockReportData = {
  patient: {
    name: "Charlie Green",
    age: "35",
    gender: "Male",
    id: "PT-99887"
  },
  visit: {
    bill_no: "BILL-2026-005",
    created_at: "2026-05-04 14:00:00",
    associate_label: "Direct at Lab"
  },
  report: {
    finalized_at: "2026-05-04 16:00:00"
  },
  doctor: {
    name: "Dr. Self",
    specialization: "General"
  },
  tests: [
    {
      id: 604,
      name: "MCH (Mean Corpuscular Haemoglobin)",
      code: "MCH3809",
      parameters: [
        {
          parameter_name: "Mean Corpuscular Hemoglobin (MCH)",
          value: "29.8",
          unit: "pg",
          normal_range: "27.0 - 32.0"
        }
      ]
    }
  ]
};

const html = buildReportHtml(mockReportData);
const outputPath = path.join(__dirname, 'scratch', 'test_mch_final.html');
fs.writeFileSync(outputPath, html);
console.log('Report generated at:', outputPath);
