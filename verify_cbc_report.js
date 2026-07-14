const { buildReportHtml } = require('./src/utils/reportFormatter.js');
const fs = require('fs');

const reportData = {
  patient: { name: 'JANE SMITH', age: '28', gender: 'Female', id: 'P789' },
  visit: { bill_no: 'BILL-100-P789', created_at: new Date() },
  doctor: { name: 'Dr. John Doe', specialization: 'Pathologist' },
  report: { finalized_at: new Date() },
  tests: [
    {
      name: 'COMPLETE BLOOD COUNT (CBC)',
      parameters: [
        { parameter_name: 'Hemoglobin', value: '12.5', normal_range: '12.0 - 15.0', unit: 'g/dL' },
        { parameter_name: 'TLC', value: '8500', normal_range: '4000 - 11000', unit: 'cells/cumm' },
        { parameter_name: 'Neutrophils', value: '65', normal_range: '40 - 75', unit: '%' },
        { parameter_name: 'Lymphocytes', value: '25', normal_range: '20 - 45', unit: '%' }
      ]
    }
  ]
};

const html = buildReportHtml(reportData);
fs.writeFileSync('e:/Web Development/lab-system/scratch/cbc_verify.html', html);
console.log('CBC report generated at scratch/cbc_verify.html');
