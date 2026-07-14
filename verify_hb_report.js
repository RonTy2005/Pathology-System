const { buildReportHtml } = require('./src/utils/reportFormatter');
const fs = require('fs');
const path = require('path');

const mockReportData = {
  patient: {
    name: "Kelly King",
    age: "42",
    gender: "Female",
    id: "PT-55667"
  },
  visit: {
    bill_no: "BILL-2026-013",
    created_at: "2026-05-04 22:00:00",
    associate_label: "Direct at Lab"
  },
  report: {
    finalized_at: "2026-05-05 00:00:00"
  },
  doctor: {
    name: "Dr. Self",
    specialization: "General"
  },
  tests: [
    {
      id: 492,
      name: "Hb(Haemoglobin)",
      code: "HBX3289",
      parameters: [
        {
          parameter_name: "Hemoglobin (Hb)",
          value: "11.5",
          unit: "g/dL",
          normal_range: "Male: 13.5 - 17.5\nFemale: 12.0 - 15.5"
        }
      ]
    }
  ]
};

const html = buildReportHtml(mockReportData);
const outputPath = path.join(__dirname, 'scratch', 'test_hb_final.html');
fs.writeFileSync(outputPath, html);
console.log('Report generated at:', outputPath);
