function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatCurrency(value) {
  return Number(value || 0).toFixed(2);
}

function formatDate(value) {
  if (!value) return "-";
  let dateStr = String(value);
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(dateStr)) {
    dateStr = dateStr.replace(' ', 'T') + 'Z';
  }
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return value;
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = String(date.getFullYear());
  return `${day}/${month}/${year}`;
}

function formatDateTime(value) {
  if (!value) return "-";
  let dateStr = String(value);
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(dateStr)) {
    dateStr = dateStr.replace(' ', 'T') + 'Z';
  }
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return value;
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = String(date.getFullYear());
  let hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12;
  hours = hours ? hours : 12;
  return `${day}/${month}/${year} ${String(hours).padStart(2, "0")}:${minutes} ${ampm}`;
}

function numberToWords(num) {
  const ones = ["", "ONE", "TWO", "THREE", "FOUR", "FIVE", "SIX", "SEVEN", "EIGHT", "NINE", "TEN", "ELEVEN", "TWELVE", "THIRTEEN", "FOURTEEN", "FIFTEEN", "SIXTEEN", "SEVENTEEN", "EIGHTEEN", "NINETEEN"];
  const tens = ["", "", "TWENTY", "THIRTY", "FORTY", "FIFTY", "SIXTY", "SEVENTY", "EIGHTY", "NINETY"];

  function convert(n) {
    if (n < 20) return ones[n];
    if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 !== 0 ? " " + ones[n % 10] : "");
    if (n < 1000) return ones[Math.floor(n / 100)] + " HUNDRED" + (n % 100 !== 0 ? " AND " + convert(n % 100) : "");
    if (n < 100000) return convert(Math.floor(n / 1000)) + " THOUSAND" + (n % 1000 !== 0 ? " " + convert(n % 1000) : "");
    if (n < 10000000) return convert(Math.floor(n / 100000)) + " LAKH" + (n % 100000 !== 0 ? " " + convert(n % 100000) : "");
    return convert(Math.floor(n / 10000000)) + " CRORE" + (n % 10000000 !== 0 ? " " + convert(n % 10000000) : "");
  }

  const amount = Math.floor(num);
  const words = convert(amount);
  return words ? words + " ONLY" : "ZERO ONLY";
}

function buildBillHtml(billData) {
  const TESTS_PER_PAGE = 10;
  const tests = billData.tests || [];
  const totalPages = Math.max(1, Math.ceil(tests.length / TESTS_PER_PAGE));
  
  const doctorName = billData.doctor ? escapeHtml(billData.doctor.name) : "";
  const doctorDegree = (billData.doctor && billData.doctor.specialization) ? escapeHtml(billData.doctor.specialization) : "";

  let pagesHtml = "";

  for (let i = 0; i < totalPages; i++) {
    const isFirstPage = i === 0;
    const isLastPage = i === totalPages - 1;
    const currentTests = tests.slice(i * TESTS_PER_PAGE, (i + 1) * TESTS_PER_PAGE);
    
    const testRows = currentTests
      .map(
        (test) => `
          <tr>
            <td>${escapeHtml(test.name)}</td>
            <td style="text-align: right;">${formatCurrency(test.price)}</td>
          </tr>
        `
      )
      .join("");

    const paddingRowsCount = Math.max(0, TESTS_PER_PAGE - currentTests.length);
    const paddingRows = Array(paddingRowsCount).fill('<tr><td>&nbsp;</td><td>&nbsp;</td></tr>').join('');

    pagesHtml += `
      <div class="page-container">
        <div class="header">
          <h1>We Care Diagnostic Centre</h1>
          <p>Madhuban (Near Purna Cinema Hall), Kalna- 713409, Purba Bardhaman</p>
          <p>Phone No: 03454-257571, 7872122767, 9434333750, 9433120433</p>
        </div>

        <div class="bill-title">BILL / MONEY RECEIPT</div>

        <div class="info-section">
          <div class="info-col">
            <div class="info-row">
              <span class="info-label">Bill No</span>
              <span class="info-value">: ${escapeHtml(billData.visit.bill_no)}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Name</span>
              <span class="info-value">: ${escapeHtml(billData.patient.name)}</span>
            </div>
            ${isFirstPage ? `
            <div class="info-row">
              <span class="info-label">Add/Ph</span>
              <span class="info-value">: ${escapeHtml(billData.patient.phone || "-")}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Ref.by</span>
              <span class="info-value">: ${doctorName}</span>
            </div>
            ${doctorDegree ? `
            <div class="info-row" style="margin-top: -2px;">
              <span class="info-label"></span>
              <span class="info-value" style="font-size: 9px; padding-left: 10px;">${doctorDegree}</span>
            </div>
            ` : ""}
            ` : ""}
          </div>
          <div class="info-col">
            <div class="info-row">
              <span class="info-label">Date & Time</span>
              <span class="info-value">: ${formatDateTime(billData.visit.created_at)}</span>
            </div>
            ${isFirstPage ? `
            <div class="info-row">
              <span class="info-label">Working Hours</span>
              <span class="info-value">: 7:30AM – 8:30PM</span>
            </div>
            <div class="info-row">
              <span class="info-label">Age/Sex</span>
              <span class="info-value">: ${escapeHtml(billData.patient.age)} / ${escapeHtml(billData.patient.gender)}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Associate</span>
              <span class="info-value">: ${escapeHtml(billData.visit.associate_label || "DIRECT")}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Sample Source</span>
              <span class="info-value">: ${escapeHtml((billData.visit.sample_source || 'lab').toUpperCase() === 'LAB' ? 'DIRECT' : (billData.visit.sample_source || 'DIRECT').toUpperCase())}</span>
            </div>
            ` : `
            <div class="info-row">
              <span class="info-label">Page</span>
              <span class="info-value">: ${i + 1} of ${totalPages}</span>
            </div>
            `}
          </div>
        </div>

        <table class="bill-table">
          <thead>
            <tr>
              <th style="width: 80%;">PARAMETER</th>
              <th style="text-align: right;">RATE</th>
            </tr>
          </thead>
          <tbody>
            ${testRows}
            ${paddingRows}
          </tbody>
        </table>

        ${isLastPage ? `
        <div class="totals-section">
          <div class="totals-row-single">
            <span class="total-label">TOTAL :</span>
            <span class="total-val">${formatCurrency(billData.visit.total)}</span>
            <span class="total-label">Disc. :</span>
            <span class="total-val">${formatCurrency(billData.visit.discount)}</span>
            <span class="total-label">Recd. :</span>
            <span class="total-val">${formatCurrency(billData.visit.amount_paid)}</span>
            <span class="total-label">Due Amt :</span>
            <span class="total-val">${formatCurrency(billData.visit.amount_due)}</span>
          </div>
        </div>

        <div class="amount-in-words">
          [ Received rupees ${numberToWords(billData.visit.amount_paid)} 
          - from ${escapeHtml(billData.patient.name)} for the above. ]
        </div>

        <div class="footer">
          <div class="footer-left">
            <p>** Patient report may delayed due to technical issues..</p>
          </div>
          <div class="footer-right">
            <p>For WE CARE DIAGNOSTIC CENTRE</p>
            <div class="signature-box">Authorised signatory</div>
            <p style="margin-top: 5px;">prep. By : ${escapeHtml(billData.visit.creator_name || billData.visit.creator_username || "Admin")}</p>
          </div>
        </div>
        ` : `<div style="text-align:center; margin-top:10px; font-style:italic; font-size:10px;">... Continued on next page (Page ${i+2}) ...</div>`}
      </div>
    `;
  }

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Bill ${escapeHtml(billData.visit.bill_no)}</title>
      <style>
        * { box-sizing: border-box; }
        html, body {
          margin: 0;
          padding: 0;
          background: #fff;
        }
        @page {
          size: A4 portrait;
          margin: 0 !important;
        }
        body {
          font-family: 'Courier New', Courier, monospace;
          font-size: 11px;
          color: #000;
        }
        .page-container {
          width: 100%;
          height: 148.5mm;
          padding: 8mm 10mm;
          position: relative;
          overflow: hidden;
          page-break-after: always;
          border-bottom: 1px dashed #eee;
        }
        .header {
          text-align: center;
          margin-bottom: 8px;
          border-bottom: 1px solid #000;
          padding-bottom: 4px;
        }
        .header h1 {
          margin: 0;
          font-size: 18px;
          text-transform: uppercase;
        }
        .header p {
          margin: 1px 0;
          font-size: 10px;
        }
        .bill-title {
          text-align: center;
          margin: 4px 0;
          font-weight: bold;
          text-decoration: underline;
          font-size: 12px;
        }
        .info-section {
          display: flex;
          justify-content: space-between;
          margin-bottom: 6px;
          font-size: 10px;
          line-height: 1.3;
          min-height: 48px;
        }
        .info-col {
          width: 48%;
        }
        .info-row {
          display: flex;
          margin-bottom: 1px;
        }
        .info-label {
          width: 110px;
          flex-shrink: 0;
        }
        .info-value {
          flex-grow: 1;
        }
        .bill-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 6px;
          border-top: 1px dashed #000;
          border-bottom: 1px dashed #000;
        }
        .bill-table th, .bill-table td {
          padding: 2px 5px;
          text-align: left;
        }
        .bill-table th {
          border-bottom: 1px solid #000;
          text-transform: uppercase;
        }
        .bill-table td {
          vertical-align: top;
          height: 16px;
        }
        .totals-section {
          border-top: 1px dashed #000;
          border-bottom: 1px dashed #000;
          padding: 4px 0;
          margin-bottom: 4px;
        }
        .totals-row-single {
          display: flex;
          justify-content: space-between;
          font-size: 10px;
        }
        .total-label {
          font-weight: normal;
        }
        .total-val {
          font-weight: bold;
          margin-right: 10px;
        }
        .amount-in-words {
          margin-top: 3px;
          font-style: italic;
          font-size: 10px;
        }
        .footer {
          margin-top: 6px;
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          font-size: 10px;
        }
        .footer-left {
          max-width: 60%;
        }
        .footer-right {
          text-align: right;
        }
        .signature-box {
          margin-top: 12px;
          border-top: 1px solid #000;
          padding-top: 3px;
          display: inline-block;
          min-width: 140px;
          text-align: center;
        }
        @media print {
          .page-container {
            border-bottom: none;
          }
          body { -webkit-print-color-adjust: exact; }
        }
      </style>
    </head>
    <body>
      ${pagesHtml}
    </body>
    </html>
  `;
}

module.exports = { buildBillHtml };
