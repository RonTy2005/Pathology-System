const { buildReportHtml } = require('./src/utils/reportFormatter');
const fs = require('fs');
const path = require('path');

const mockReportData = {
  patient: {
    name: "Ian Indigo",
    age: "35",
    gender: "Male",
    id: "PT-99001"
  },
  visit: {
    bill_no: "BILL-2026-011",
    created_at: "2026-05-04 20:00:00",
    associate_label: "Direct at Lab"
  },
  report: {
    finalized_at: "2026-05-04 22:00:00"
  },
  doctor: {
    name: "Dr. Self",
    specialization: "General"
  },
  tests: [
    {
      id: 1261,
      name: "Absolute Basophil Count (ABC)",
      code: "ABC1004",
      parameters: [
        {
          parameter_name: "ABSOLUTE BASOPHIL COUNT (ABC)",
          value: "30",
          unit: "cells/mcL",
          normal_range: "0 - 300"
        }
      ]
    }
  ]
};

const html = buildReportHtml(mockReportData);
const outputPath = path.join(__dirname, 'scratch', 'test_abc_final.html');
fs.writeFileSync(outputPath, html);
console.log('Report generated at:', outputPath);
