const { buildReportHtml } = require('./src/utils/reportFormatter');
const fs = require('fs');
const path = require('path');

const mockReportData = {
  patient: {
    name: "Jane Smith",
    age: "32",
    gender: "Female",
    id: "PT-67890"
  },
  visit: {
    bill_no: "BILL-2026-002",
    created_at: "2026-05-04 11:00:00",
    associate_label: "Direct at Lab"
  },
  report: {
    finalized_at: "2026-05-04 13:00:00"
  },
  doctor: {
    name: "Dr. Self",
    specialization: "General"
  },
  tests: [
    {
      id: 1035,
      name: "Absolute Lymphocytes Count",
      code: "ABS6622",
      parameters: [
        {
          parameter_name: "ABSOLUTE LYMPHOCYTE COUNT (ALC)",
          value: "2000",
          unit: "cells/mcL",
          normal_range: "1300 - 3500"
        }
      ]
    }
  ]
};

const html = buildReportHtml(mockReportData);
const outputPath = path.join(__dirname, 'scratch', 'test_alc_final.html');
fs.writeFileSync(outputPath, html);
console.log('Report generated at:', outputPath);
