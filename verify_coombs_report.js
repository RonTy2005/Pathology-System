const { buildReportHtml } = require('./src/utils/reportFormatter');
const fs = require('fs');

const reportData = {
    patient: { name: 'JOHN DOE', age: '35', gender: 'Male', id: 'P123' },
    visit: { bill_no: 'BILL-12345-P123', created_at: '2026-05-08 06:00:00', associate_label: 'Self' },
    report: { finalized_at: '2026-05-08 06:30:00' },
    doctor: { name: 'Dr. Jane Smith', specialization: 'Haematologist' },
    tests: [
        {
            name: 'COOMBS TEST, INDIRECT, SERUM',
            parameters: [
                { parameter_name: 'Result', value: 'Negative', unit: '', normal_range: '' },
                { parameter_name: 'Titre', value: '1:128', unit: '', normal_range: '' }
            ]
        }
    ]
};

const html = buildReportHtml(reportData);
fs.writeFileSync('scratch/coombs_report.html', html);
console.log('Coombs report generated at scratch/coombs_report.html');
