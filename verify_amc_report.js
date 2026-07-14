const { buildReportHtml } = require('./src/utils/reportFormatter');
const fs = require('fs');
const path = require('path');

const mockReportData = {
  patient: {
    name: "James Jett",
    age: "29",
    gender: "Male",
    id: "PT-11223"
  },
  visit: {
    bill_no: "BILL-2026-012",
    created_at: "2026-05-04 21:00:00",
    associate_label: "Direct at Lab"
  },
  report: {
    finalized_at: "2026-05-04 23:00:00"
  },
  doctor: {
    name: "Dr. Self",
    specialization: "General"
  },
  tests: [
    {
      id: 1262,
      name: "Absolute Monocyte Count (AMC)",
      code: "AMC1005",
      parameters: [
        {
          parameter_name: "ABSOLUTE MONOCYTE COUNT (AMC)",
          value: "110",
          unit: "cells/mcL",
          normal_range: "200 - 950"
        }
      ]
    }
  ]
};

const html = buildReportHtml(mockReportData);
const outputPath = path.join(__dirname, 'scratch', 'test_amc_final.html');
fs.writeFileSync(outputPath, html);
console.log('Report generated at:', outputPath);
