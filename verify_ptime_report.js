const { buildReportHtml } = require('./src/utils/reportFormatter.js');
const fs = require('fs');
const path = require('path');

const reportData = {
  patient: { name: 'JOHN DOE', age: '35', gender: 'Male', id: 'P123' },
  visit: { bill_no: 'BILL-12345-P123', created_at: '2026-07-13 16:30:00', associate_label: 'Self' },
  report: { finalized_at: '2026-07-13 17:00:00' },
  doctor: { name: 'Dr. Jane Smith', specialization: 'Haematologist' },
  tests: [
    {
      name: 'Prothrombin Time with INR',
      parameters: [
        { parameter_name: 'PROTHROMBIN TIME STUDIES', value: '', unit: '', normal_range: '' },
        { parameter_name: 'Mean Normal Prothrombin Time (PT)', value: '10.60', unit: 'Sec', normal_range: '' },
        { parameter_name: 'Patient value', value: '12.10', unit: 'Sec', normal_range: '9.60 - 11.70' },
        { parameter_name: 'Prothrombin Ratio (PR)', value: '1.15', unit: '', normal_range: '' },
        { parameter_name: 'International Normalized Ratio (INR)', value: '1.00', unit: '', normal_range: '0.90 - 1.10' }
      ]
    }
  ]
};

const html = buildReportHtml(reportData);
const outputPath = path.join(__dirname, 'scratch', 'ptime_verify.html');
fs.writeFileSync(outputPath, html);
console.log('Prothrombin Time report generated at:', outputPath);
