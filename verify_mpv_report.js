const { buildReportHtml } = require('./src/utils/reportFormatter');
const fs = require('fs');
const path = require('path');

const mockReportData = {
  patient: {
    name: "Eve Black",
    age: "29",
    gender: "Female",
    id: "PT-11223"
  },
  visit: {
    bill_no: "BILL-2026-007",
    created_at: "2026-05-04 16:00:00",
    associate_label: "Direct at Lab"
  },
  report: {
    finalized_at: "2026-05-04 18:00:00"
  },
  doctor: {
    name: "Dr. Self",
    specialization: "General"
  },
  tests: [
    {
      id: 1258,
      name: "Mean Platelet Volume (MPV)",
      code: "MPV1001",
      parameters: [
        {
          parameter_name: "MEAN PLATELET VOLUME (MPV)",
          value: null,
          unit: null,
          normal_range: null
        },
        {
          parameter_name: "MEAN PLATELET VOLUME (MPV), WHOLE BLOOD",
          value: "1.25",
          unit: "fL",
          normal_range: "6.50 - 12.00"
        }
      ]
    }
  ]
};

const html = buildReportHtml(mockReportData);
const outputPath = path.join(__dirname, 'scratch', 'test_mpv_final.html');
fs.writeFileSync(outputPath, html);
console.log('Report generated at:', outputPath);
