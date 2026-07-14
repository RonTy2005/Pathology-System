const { buildReportHtml } = require('./src/utils/reportFormatter');
const fs = require('fs');
const path = require('path');

const mockReportData = {
  patient: {
    name: "John Doe",
    age: "45",
    gender: "Male",
    id: "PT-12345"
  },
  visit: {
    bill_no: "BILL-2026-001",
    created_at: "2026-05-04 10:00:00",
    associate_label: "Direct at Lab"
  },
  report: {
    finalized_at: "2026-05-04 12:00:00"
  },
  doctor: {
    name: "Dr. Self",
    specialization: "General"
  },
  tests: [
    {
      id: 1032,
      name: "Absolute Eosinophils Count",
      code: "ABS5177",
      parameters: [
        {
          parameter_name: "ABSOLUTE EOSINOPHIL COUNT (AEC)",
          value: "10",
          unit: "cells/mcL",
          normal_range: "0 - 500"
        }
      ]
    }
  ]
};

const html = buildReportHtml(mockReportData);
const outputPath = path.join(__dirname, 'scratch', 'test_aec_final.html');
fs.writeFileSync(outputPath, html);
console.log('Report generated at:', outputPath);
