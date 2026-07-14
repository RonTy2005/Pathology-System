const { buildReportHtml } = require('./src/utils/reportFormatter');
const fs = require('fs');
const path = require('path');

const mockReportData = {
  patient: {
    name: "Frank Blue",
    age: "31",
    gender: "Male",
    id: "PT-33445"
  },
  visit: {
    bill_no: "BILL-2026-008",
    created_at: "2026-05-04 17:00:00",
    associate_label: "Direct at Lab"
  },
  report: {
    finalized_at: "2026-05-04 19:00:00"
  },
  doctor: {
    name: "Dr. Self",
    specialization: "General"
  },
  tests: [
    {
      id: 1259,
      name: "HCT (Hematocrit)",
      code: "HCT1002",
      parameters: [
        {
          parameter_name: "Hematocrit (HCT) / Packed Cell Volume (PCV)",
          value: null,
          unit: null,
          normal_range: null
        },
        {
          parameter_name: "HCT / PCV",
          value: "57",
          unit: "%",
          normal_range: "40 - 50"
        }
      ]
    }
  ]
};

const html = buildReportHtml(mockReportData);
const outputPath = path.join(__dirname, 'scratch', 'test_hct_final.html');
fs.writeFileSync(outputPath, html);
console.log('Report generated at:', outputPath);
