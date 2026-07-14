const { buildReportHtml } = require('./src/utils/reportFormatter');
const fs = require('fs');
const path = require('path');

const mockReportData = {
  patient: {
    name: "Bob Johnson",
    age: "58",
    gender: "Male",
    id: "PT-11223"
  },
  visit: {
    bill_no: "BILL-2026-003",
    created_at: "2026-05-04 12:00:00",
    associate_label: "Direct at Lab"
  },
  report: {
    finalized_at: "2026-05-04 14:00:00"
  },
  doctor: {
    name: "Dr. Self",
    specialization: "General"
  },
  tests: [
    {
      id: 1036,
      name: "Absolute Neutrophils Count",
      code: "ABS4706",
      parameters: [
        {
          parameter_name: "ABSOLUTE POLYMORPHS COUNT (APC)",
          value: "2000",
          unit: "cells/mcL",
          normal_range: "1500 - 7500"
        }
      ]
    }
  ]
};

const html = buildReportHtml(mockReportData);
const outputPath = path.join(__dirname, 'scratch', 'test_apc_final.html');
fs.writeFileSync(outputPath, html);
console.log('Report generated at:', outputPath);
