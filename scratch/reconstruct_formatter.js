const fs = require('fs');
const sig = fs.readFileSync('e:/Web Development/lab-system/scratch/sig_b64.txt', 'utf8').trim();

const content = `function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatDateStr(date) {
  if (!date) return "-";
  const d = new Date(date);
  return d.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
}

function checkResultRange(value, rangeStr) {
  if (!value || !rangeStr) return { isAbnormal: false, colorClass: "" };
  const val = parseFloat(value.replace(/,/g, ""));
  if (isNaN(val)) return { isAbnormal: false, colorClass: "" };
  const parts = rangeStr.split("-").map(p => parseFloat(p.trim().replace(/,/g, "")));
  if (parts.length !== 2) return { isAbnormal: false, colorClass: "" };
  const [min, max] = parts;
  if (val < min) return { isAbnormal: true, colorClass: "low-val" };
  if (val > max) return { isAbnormal: true, colorClass: "high-val" };
  return { isAbnormal: false, colorClass: "" };
}

function buildReportHtml(reportData) {
  const patientName = escapeHtml(reportData.patient.name);
  const billNo = escapeHtml(reportData.visit.bill_no);
  const age = escapeHtml(reportData.patient.age);
  const sex = escapeHtml(reportData.patient.gender);
  const doctorName = escapeHtml(reportData.doctor?.name || "Self");
  const doctorDegree = reportData.doctor?.specialization ? \` (\${escapeHtml(reportData.doctor.specialization)})\` : "";
  const billNoStr = String(reportData.visit.bill_no || "");
  const patientId = billNoStr.split("-").pop() || escapeHtml(reportData.patient.id);
  
  const registeredOn = formatDateStr(reportData.visit.created_at);
  const reportedOn = formatDateStr(reportData.report.finalized_at || new Date());

  const associateName = reportData.visit.associate_label || (reportData.associate ? reportData.associate.name : "");
  const sampleText = reportData.visit.sample_source === 'associate' 
    ? \`SAMPLE COLLECTED BY: \${escapeHtml(associateName)}\`
    : \`SAMPLE COLLECTED AT: WE CARE DIAGNOSTICS CENTRE\`;

  const qrUrl = \`https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=\${encodeURIComponent(billNo + '-' + patientName)}\`;
  const barcodeUrl = \`https://bwipjs-api.metafloor.com/?bcid=code128&text=\${encodeURIComponent(billNo)}&scale=2&height=10&includetext\`;

  const testTitle = reportData.tests.length > 0 
    ? reportData.tests.map(t => {
        const name = t.name.toUpperCase();
        if (name.includes("INDIRECT COOMBS TEST") || name.includes("COOMBS TEST, INDIRECT")) return "INDIRECT COOMBS TEST";
        if (name.includes("CBC") || name.includes("COMPLETE BLOOD COUNT")) return "COMPLETE BLOOD COUNT (CBC)";
        return "LABORATORY REPORT";
      }).filter((v, i, a) => a.indexOf(v) === i).join(", ")
    : "LABORATORY REPORT";

  return \`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <style>
        @page {
          size: A4;
          margin: 0;
        }
        body { 
          font-family: 'Times New Roman', Times, serif; 
          font-size: 14px;
          margin: 0; 
          padding: 0;
          color: #000; 
          line-height: 1.1;
          box-sizing: border-box;
          background: white;
          width: 210mm;
        }
        .blank-header {
          height: 5cm;
          width: 100%;
        }
        .main-content {
          padding: 0 1cm 3cm 1cm;
          min-height: calc(297mm - 5cm - 3cm);
          display: flex;
          flex-direction: column;
        }
        
        .header-table {
          width: 100%;
          border-top: 1.5px solid #000;
          border-bottom: 1.5px solid #000;
          border-collapse: collapse;
          margin-bottom: 8px;
        }
        .header-table td {
          vertical-align: top;
          padding: 4px 5px;
          border-right: 1px solid #ddd;
        }
        .header-table td:last-child {
          border-right: none;
        }
        
        .patient-name { font-size: 20px; font-weight: bold; margin-bottom: 3px; text-transform: uppercase; }
        .info-row { margin-bottom: 1px; font-size: 14px; }
        
        .qr-img { width: 70px; height: 70px; display: block; margin: 0 auto; }
        .sample-text { font-size: 9px; text-align: center; margin-top: 3px; font-weight: bold; text-transform: uppercase; }
        .barcode-img { height: 25px; width: auto; margin-bottom: 3px; }

        .test-title { 
          text-align: center; 
          font-weight: bold; 
          font-size: 18px; 
          margin: 5px 0;
          text-transform: uppercase;
          text-decoration: underline;
        }
        
        table.results-table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
        table.results-table th { 
          border-top: 1.5px solid #000; 
          border-bottom: 1.5px solid #000; 
          padding: 5px; 
          text-align: left; 
          font-weight: bold;
          font-size: 15px;
        }
        table.results-table td { padding: 4px 5px; font-size: 15px; vertical-align: top; }
        .center { text-align: center; }
        
        .group-header { font-weight: bold; padding-top: 6px !important; padding-bottom: 1px !important; font-size: 15px; text-transform: uppercase; }
        .method-note { font-size: 10px; color: #333; font-weight: normal; margin-bottom: 3px; }
        
        .report-notes { font-size: 11px; margin-top: 8px; }
        .notes-table { width: 100%; border-collapse: collapse; margin-top: 4px; border: 1px solid #ccc; }
        .notes-table th { border: 1px solid #ccc; padding: 3px; text-align: left; background-color: #f9f9f9; font-weight: bold; font-size: 11px; }
        .notes-table td { border: 1px solid #ccc; padding: 3px; text-align: left; vertical-align: top; font-size: 11px; }
        
        .report-footer {
          margin-top: 8px;
          border-top: 1px solid #000;
          display: flex;
          justify-content: space-between;
          font-size: 11px;
          padding-top: 4px;
        }

        .signature-wrapper {
          margin-top: auto;
          padding-top: 5px;
          display: flex;
          justify-content: flex-end;
        }
        .signature-section {
          text-align: center;
          width: 180px;
        }
        .sig-image { 
          width: 100px; 
          height: auto; 
          display: block; 
          margin: 0 auto 2px auto;
        }
        .doc-name { font-weight: bold; font-size: 13px; margin: 0; color: #1a237e; }
        .doc-detail { font-size: 11px; margin: 0; color: #1a237e; line-height: 1.1; }
 
        tr { page-break-inside: avoid; }
      </style>
    </head>
    <body>
      <div class="blank-header"></div>
      
      <div class="main-content">
        <table class="header-table">
          <tr>
            <td style="width: 40%;">
              <div class="patient-name">\${patientName}</div>
              <div class="info-row">Age : \${age} Years</div>
              <div class="info-row">Sex : \${sex}</div>
              <div class="info-row">Ref. By: <strong>\${doctorName}</strong>\${doctorDegree}</div>
            </td>
            <td style="width: 25%; text-align: center;">
              <img src="\${qrUrl}" class="qr-img" />
              <div class="sample-text">\${sampleText}</div>
            </td>
            <td style="width: 35%; text-align: right; border-right: none;">
              <div class="info-row">PID : \${patientId}</div>
              <div style="margin-top: 10px;">
                <img src="\${barcodeUrl}" class="barcode-img" />
              </div>
              <div class="info-row" style="font-size: 13px;">Registered on: \${registeredOn}</div>
              <div class="info-row" style="font-size: 13px;">Collected on: \${registeredOn}</div>
              <div class="info-row" style="font-size: 13px;">Reported on: \${reportedOn}</div>
            </td>
          </tr>
        </table>

        <div class="test-title">\${testTitle}</div>

        <table class="results-table">
          <thead>
            <tr>
              <th style="width: 40%">Investigation</th>
              <th style="width: 20%">Result</th>
              <th style="width: 25%">Reference Value</th>
              <th style="width: 15%">Unit</th>
            </tr>
          </thead>
          <tbody>
            \${reportData.tests.flatMap(test => {
              const rows = [];
              
              if (test.name.toUpperCase().includes("COOMBS TEST")) {
                rows.push(\`
                  <tr>
                    <td colspan="4">
                      <div class="group-header">\${escapeHtml(test.name)}</div>
                      <div class="method-note">Erythrocyte Magnetized Technology</div>
                    </td>
                  </tr>
                \`);
              }

              test.parameters.forEach(param => {
                const { isAbnormal, colorClass } = checkResultRange(param.value, param.normal_range);
                const valDisplay = isAbnormal ? \`<span class="\${colorClass}">\${escapeHtml(param.value || "-")}</span>\` : escapeHtml(param.value || "-");
                
                const needsIndentation = [
                  "Neutrophils", "Lymphocytes", "Eosinophils", "Monocytes", "Basophils",
                  "Neutrophil", "Lymphocyte", "Eosinophil", "Monocyte", "Basophil"
                ].some(s => param.parameter_name.includes(s));
                const paddingLeft = needsIndentation ? '20px' : '0';

                rows.push(\`
                  <tr>
                    <td style="padding-left: \${paddingLeft}">\${escapeHtml(param.parameter_name)}</td>
                    <td style="font-weight: \${isAbnormal ? 'bold' : 'normal'}">\${valDisplay}</td>
                    <td>\${escapeHtml(param.normal_range || "-")}</td>
                    <td>\${escapeHtml(param.unit || "")}</td>
                  </tr>
                \`);
              });
              return rows;
            }).join('')}
          </tbody>
        </table>

        \${reportData.tests.some(t => t.name.toUpperCase().includes("COOMBS TEST") && t.name.toUpperCase().includes("INDIRECT")) ? \`
          <div class="report-notes">
            <div style="font-weight: bold; margin-bottom: 4px; font-size: 14px;">Interpretation :</div>
            <table class="notes-table">
              <thead>
                <tr>
                  <th style="width: 20%;">RESULT</th>
                  <th>COMMENTS</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><strong>Negative</strong></td>
                  <td>No antibodies detected</td>
                </tr>
                <tr>
                  <td><strong>Equivocal</strong></td>
                  <td>Positive in undiluted serum & titre upto 1:16</td>
                </tr>
                <tr>
                  <td><strong>Positive</strong></td>
                  <td>
                    <ul style="margin: 0; padding-left: 15px;">
                      <li>Titre of 1:32 or above</li>
                      <li>Rising titre on serial testing</li>
                    </ul>
                  </td>
                </tr>
              </tbody>
            </table>

            <div style="margin-top: 15px;">
              <div style="font-weight: bold; margin-bottom: 4px; font-size: 14px;">Comments :</div>
              <p style="margin: 0; line-height: 1.3;">
                Indirect Coomb's test (ICT) is used to detect incomplete Rh IgG antibodies in the serum. This test is used for: · Compatibility testing, · Screening and detection of unexpected antibodies in the serum · Detection of red cell antigens not detected by other techniques like K, Fy, JK etc.,
              </p>
            </div>

            <div style="margin-top: 15px;">
              <div style="font-weight: bold; margin-bottom: 4px; font-size: 14px;">Recommended sampling regime in pregnancy :</div>
              <table class="notes-table">
                <thead>
                  <tr>
                    <th style="width: 40%;">STAGE OF PREGNANCY</th>
                    <th>REFERENCE GROUP</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Early pregnancy</td>
                    <td>All cases</td>
                  </tr>
                  <tr>
                    <td>28th week</td>
                    <td>Rh D negative cases</td>
                  </tr>
                  <tr>
                    <td>34th-36th week</td>
                    <td>All cases</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        \` : ''}

        <div class="report-footer">
          <div>Thanks for Reference</div>
          <div style="font-weight: bold;">****End of Report****</div>
          <div style="width: 100px;"></div>
        </div>

        <div class="signature-wrapper">
          <div class="signature-section">
            <img src="data:image/jpeg;base64,${sig}" class="sig-image" />
            <p class="doc-name">Dr. Arun Kumar Biswas</p>
            <p class="doc-detail">MBBS, MD (Path.)</p>
            <p class="doc-detail">Consultant Pathologist</p>
            <p class="doc-detail">Regd. No.- 58516</p>
          </div>
        </div>
      </div>
    </body>
    </html>
  \`;
}

module.exports = { buildReportHtml };
`;

fs.writeFileSync('e:/Web Development/lab-system/src/utils/reportFormatter.js', content);
console.log('Successfully reconstructed reportFormatter.js');
