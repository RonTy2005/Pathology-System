const { getPatientPortalQrUrl } = require("./patientPortal");
const { formatBusinessTime } = require("../services/publicPortalAvailabilityService");

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function money(value) {
  return Number(value || 0).toFixed(2);
}

function formatDateTime(value) {
  if (!value) return "-";
  let dateStr = String(value);
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(dateStr)) {
    dateStr = dateStr.replace(" ", "T") + "Z";
  }
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return value;
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = String(date.getFullYear());
  let hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12 || 12;
  return `${day}/${month}/${year} at ${String(hours).padStart(2, "0")}:${minutes} ${ampm}`;
}

function numberToWords(num) {
  const ones = ["", "ONE", "TWO", "THREE", "FOUR", "FIVE", "SIX", "SEVEN", "EIGHT", "NINE", "TEN", "ELEVEN", "TWELVE", "THIRTEEN", "FOURTEEN", "FIFTEEN", "SIXTEEN", "SEVENTEEN", "EIGHTEEN", "NINETEEN"];
  const tens = ["", "", "TWENTY", "THIRTY", "FORTY", "FIFTY", "SIXTY", "SEVENTY", "EIGHTY", "NINETY"];

  function convert(n) {
    if (n < 20) return ones[n];
    if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? ` ${ones[n % 10]}` : "");
    if (n < 1000) return `${ones[Math.floor(n / 100)]} HUNDRED${n % 100 ? ` AND ${convert(n % 100)}` : ""}`;
    if (n < 100000) return `${convert(Math.floor(n / 1000))} THOUSAND${n % 1000 ? ` ${convert(n % 1000)}` : ""}`;
    if (n < 10000000) return `${convert(Math.floor(n / 100000))} LAKH${n % 100000 ? ` ${convert(n % 100000)}` : ""}`;
    return `${convert(Math.floor(n / 10000000))} CRORE${n % 10000000 ? ` ${convert(n % 10000000)}` : ""}`;
  }

  const words = convert(Math.floor(Number(num) || 0));
  return words ? `${words} ONLY` : "ZERO ONLY";
}

function paymentSummary(visit) {
  const due = Math.max(0, Number(visit.amount_due || 0));
  const paid = Math.max(0, Number(visit.amount_paid || 0));
  if (due < 0.005) return { label: "PAID", tone: "paid" };
  if (paid > 0) return { label: "PARTIALLY PAID", tone: "partial" };
  return { label: "PAYMENT DUE", tone: "due" };
}

function buildBillHtml(billData, { sharedLinkView = false } = {}) {
  const settings = billData.businessSettings || {};
  const businessName = escapeHtml(settings.businessName || billData.businessName || "Your Diagnostic Centre");
  const address = escapeHtml(settings.address || "");
  const phone = escapeHtml(settings.phone || "");
  const email = escapeHtml(settings.email || "");
  const registrationNo = escapeHtml(settings.registrationNo || "");
  const openingTime = formatBusinessTime(settings.businessOpeningTime);
  const closingTime = formatBusinessTime(settings.businessClosingTime);
  const businessHours = openingTime && closingTime && openingTime !== closingTime
    ? ` (Business hours: ${openingTime} to ${closingTime})`
    : "";
  const logoDataUrl = /^data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/]+={0,2}$/i.test(String(settings.businessLogoDataUrl || ""))
    ? String(settings.businessLogoDataUrl)
    : "";
  const contactDetails = [phone && `+91 ${phone}`, email].filter(Boolean).join(" | ");
  const portalUrl = String(billData.patientPortalUrl || "");
  const portalQrUrl = portalUrl ? getPatientPortalQrUrl(portalUrl) : "";
  const tests = billData.tests || [];

  // Every receipt stays in the upper half of an A4 sheet. Five services leave
  // enough vertical room for a clearly readable patient copy instead of
  // compressing the type to fit a sixth line item.
  const testsPerPage = 5;
  const totalPages = Math.max(1, Math.ceil(tests.length / testsPerPage));
  const doctorName = billData.doctor ? escapeHtml(billData.doctor.name) : "Not specified";
  const associateName = escapeHtml(billData.visit.associate_label || "Direct at facility");
  const sampleSource = String(billData.visit.sample_source || "lab").toLowerCase() === "associate"
    ? "Collected through associate"
    : "Collected at facility";
  const payment = paymentSummary(billData.visit);
  const patientCode = escapeHtml(billData.patient.patient_code || `P-${billData.patient.id || "-"}`);
  const patientAge = escapeHtml(billData.patient.age || "-");
  const patientGender = escapeHtml(billData.patient.gender || "-");
  const patientPhone = escapeHtml(billData.patient.phone || "-");
  const paymentMode = escapeHtml(String(billData.visit.payment_mode || "Not recorded").replace(/\b\w/g, (letter) => letter.toUpperCase()));
  const billedAmount = Number(billData.visit.total || 0);

  const pagesHtml = Array.from({ length: totalPages }, (_, pageIndex) => {
    const firstPage = pageIndex === 0;
    const lastPage = pageIndex === totalPages - 1;
    const pageTests = tests.slice(pageIndex * testsPerPage, (pageIndex + 1) * testsPerPage);
    const testRows = pageTests.map((test, testIndex) => `
      <tr>
        <td class="serial">${pageIndex * testsPerPage + testIndex + 1}</td>
        <td class="service"><strong>${escapeHtml(test.name)}</strong></td>
        <td class="test-code">${escapeHtml(test.code || "-")}</td>
        <td class="amount">Rs. ${money(test.price)}</td>
      </tr>
    `).join("");

    return `
      <main class="bill-slip${lastPage ? " bill-slip-last" : ""}">
        <div class="accent-rule"></div>
        <header class="slip-header">
          <div class="brand-block">
            <div class="brand-mark">${logoDataUrl ? `<img src="${logoDataUrl}" alt="${businessName} logo" />` : `<span>${businessName.slice(0, 1)}</span>`}</div>
            <div>
              <h1>${businessName}</h1>
              ${address ? `<p class="business-address">${address}</p>` : ""}
              ${contactDetails ? `<p>${contactDetails}</p>` : ""}
            </div>
          </div>
          <div class="slip-title">
            <span>Patient copy</span>
            <strong>Diagnostic Booking Slip / Money Receipt</strong>
            ${registrationNo ? `<small>Registration no. ${registrationNo}</small>` : ""}
          </div>
        </header>

        <section class="booking-details" aria-label="Patient and booking details">
          <div class="details-column">
            <p><b>Patient ID</b><span>${patientCode}</span></p>
            <p><b>Patient name</b><span>${escapeHtml(billData.patient.name)}</span></p>
            <p><b>Age / gender</b><span>${patientAge} years / ${patientGender}</span></p>
            <p><b>Phone no.</b><span>${patientPhone}</span></p>
          </div>
          <div class="details-column">
            <p><b>Booking code</b><span>${escapeHtml(billData.visit.bill_no)}</span></p>
            <p><b>Booking date</b><span>${formatDateTime(billData.visit.created_at)}</span></p>
            <p><b>Referred by</b><span>${doctorName}</span></p>
            <p><b>Collection</b><span>${sampleSource} - ${associateName}</span></p>
          </div>
        </section>

        ${!firstPage ? `<p class="continued">Booking ${escapeHtml(billData.visit.bill_no)} - continued (page ${pageIndex + 1} of ${totalPages})</p>` : ""}

        <table class="items-table">
          <thead>
            <tr><th class="serial">Sr.</th><th>Services booked</th><th class="test-code">Code</th><th class="amount">Charges</th></tr>
          </thead>
          <tbody>${testRows}</tbody>
        </table>

        ${lastPage ? `
          <section class="settlement">
            <div class="receipt-notes">
              <p><b>Amount in words:</b> Rupees ${numberToWords(billedAmount)}</p>
              <p><b>Payment mode:</b> ${paymentMode}</p>
              <p class="report-note">Reports are released after payment and technical verification.</p>
              <p class="collection-note">Please collect the report only from the lab at the scheduled time${businessHours}.</p>
            </div>
            <table class="totals-table">
              <tbody>
                <tr><th>Gross bill</th><td>Rs. ${money(billData.visit.subtotal)}</td></tr>
                <tr><th>Discount</th><td>Rs. ${money(billData.visit.discount)}</td></tr>
                <tr class="total-row"><th>Net bill</th><td>Rs. ${money(billData.visit.total)}</td></tr>
                <tr><th>Amount received</th><td>Rs. ${money(billData.visit.amount_paid)}</td></tr>
                <tr class="balance ${payment.tone}"><th>Balance</th><td>Rs. ${money(billData.visit.amount_due)}</td></tr>
              </tbody>
            </table>
          </section>

          <footer class="slip-footer">
            <div>
              <strong>${payment.label}</strong>
              <p>Prepared by ${escapeHtml(billData.visit.creator_name || billData.visit.creator_username || "Admin")}</p>
            </div>
            ${portalQrUrl ? `<div class="portal-qr"><img src="${escapeHtml(portalQrUrl)}" alt="Scan for report status" /><span>Scan for report status</span></div>` : ""}
            <div class="signatory"><span>For ${businessName}</span><strong>Authorised signatory</strong></div>
          </footer>
        ` : `<p class="next-page">Continued on the next booking slip (page ${pageIndex + 1} of ${totalPages})</p>`}
      </main>
    `;
  }).join("");

  return `<!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>Bill ${escapeHtml(billData.visit.bill_no)}</title>
      <style>
        :root { --ink: #172033; --muted: #536275; --line: #aac4d8; --accent: #0ea5e9; --accent-soft: #e9f8ff; --danger: #c21f39; --warn: #9a6200; }
        * { box-sizing: border-box; }
        @page { size: A4 portrait; margin: 0 !important; }
        html, body { margin: 0; padding: 0; background: #edf3f1; }
        body { color: var(--ink); font-family: Arial, Helvetica, sans-serif; font-size: 11.5px; line-height: 1.3; }
        .bill-slip { width: 210mm; height: 148.5mm; padding: 5mm 8mm 4mm; background: #fff; position: relative; overflow: hidden; page-break-after: always; break-after: page; }
        .bill-slip-last { page-break-after: auto; break-after: auto; }
        .accent-rule { position: absolute; top: 0; left: 0; right: 0; height: 4mm; background: var(--accent); }
        .slip-header { min-height: 26mm; display: flex; align-items: center; justify-content: space-between; gap: 7mm; padding: 1.5mm 0 3mm; border-bottom: 1px solid var(--ink); }
        .brand-block { min-width: 0; display: flex; align-items: center; gap: 3mm; }
        .brand-mark { width: 16mm; height: 16mm; overflow: hidden; background: var(--accent-soft); color: var(--accent); display: grid; place-items: center; font-size: 21px; font-weight: 800; }
        .brand-mark img { width: 100%; height: 100%; object-fit: contain; }
        .brand-block h1 { margin: 0; color: var(--accent); font-size: 19px; line-height: 1.05; letter-spacing: -.01em; }
        .brand-block p { margin: 1px 0 0; color: var(--muted); font-size: 9px; }
        .brand-block .business-address { color: var(--ink); font-size: 10px; font-weight: 700; line-height: 1.2; }
        .slip-title { min-width: 62mm; display: flex; flex-direction: column; align-items: flex-end; text-align: right; gap: 1px; }
        .slip-title span { color: var(--accent); font-size: 8.5px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
        .slip-title strong { font-size: 14px; line-height: 1.15; text-decoration: underline; }
        .slip-title small { color: var(--muted); font-size: 8px; }
        .booking-details { display: grid; grid-template-columns: 1fr 1fr; gap: 8mm; padding: 2.5mm 0; border-bottom: 1px solid var(--line); }
        .details-column { min-width: 0; }
        .details-column p { display: grid; grid-template-columns: 29mm 1fr; gap: 1.5mm; margin: 0 0 1px; font-size: 10.5px; }
        .details-column b { font-weight: 700; }
        .details-column b::after { content: ":"; float: right; }
        .details-column span { overflow-wrap: anywhere; }
        .continued, .next-page { margin: 1.5mm 0; color: var(--muted); font-size: 8.5px; text-align: center; }
        .items-table { width: 100%; border-collapse: collapse; margin-top: 2mm; table-layout: fixed; }
        .items-table th { padding: 1.35mm 1.5mm; border: 1px solid var(--line); background: #f0f0f0; color: var(--ink); font-size: 10px; font-weight: 700; text-align: left; }
        .items-table th.serial, .items-table td.serial { width: 10mm; text-align: center; }
        .items-table th.test-code, .items-table td.test-code { width: 25mm; }
        .items-table th.amount, .items-table td.amount { width: 29mm; text-align: right; white-space: nowrap; }
        .items-table td { min-height: 7mm; padding: 1.3mm 1.5mm; border: 1px solid var(--line); vertical-align: middle; font-size: 11.2px; }
        .items-table td.service strong { font-size: 11.2px; }
        .items-table td.test-code { color: var(--muted); font-size: 9px; }
        .settlement { display: grid; grid-template-columns: 1fr 57mm; gap: 5mm; align-items: start; margin-top: 2.5mm; }
        .receipt-notes { padding-top: 1mm; }
        .receipt-notes p { margin: 0 0 1.5mm; font-size: 9.5px; }
        .receipt-notes .report-note { margin-top: 2.5mm; color: var(--muted); }
        .receipt-notes .collection-note { margin-top: 1.5mm; color: var(--ink); font-size: 10px; font-weight: 700; line-height: 1.2; }
        .totals-table { width: 100%; border-collapse: collapse; font-size: 10px; }
        .totals-table th, .totals-table td { padding: 1.1mm 1.5mm; border: 1px solid var(--line); text-align: left; }
        .totals-table td { text-align: right; white-space: nowrap; }
        .totals-table .total-row { background: var(--accent-soft); font-weight: 700; }
        .totals-table .balance.due { color: var(--danger); font-weight: 700; }
        .totals-table .balance.partial { color: var(--warn); font-weight: 700; }
        .slip-footer { display: grid; grid-template-columns: 1fr auto 46mm; gap: 5mm; align-items: end; margin-top: 2.5mm; padding-top: 2mm; border-top: 1px solid var(--ink); color: var(--muted); font-size: 8.5px; }
        .slip-footer p { margin: 1px 0 0; }
        .slip-footer strong { color: var(--accent); font-size: 9.5px; }
        .portal-qr { display: flex; align-items: center; gap: 1.5mm; max-width: 33mm; color: var(--muted); font-size: 7.5px; line-height: 1.1; }
        .portal-qr img { width: 11mm; height: 11mm; padding: .5mm; background: #fff; border: 1px solid var(--line); }
        .signatory { min-height: 10mm; padding-top: 4mm; border-bottom: 1px solid var(--ink); text-align: center; display: flex; flex-direction: column; gap: 1px; }
        .signatory span { color: var(--muted); font-size: 8px; }
        .signatory strong { color: var(--ink); font-size: 9.5px; }
        @media screen {
          .bill-slip { margin: 10mm auto; box-shadow: 0 7px 28px rgba(30, 30, 30, .16); }
          .shared-link-bill { -webkit-text-size-adjust: 100%; text-size-adjust: 100%; }
          .shared-link-bill .items-table td.service strong { font-size: 9.5px; font-weight: 600; line-height: 1.2; }
        }
        @media print { html, body { background: #fff; } .bill-slip { margin: 0; box-shadow: none; -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
      </style>
    </head>
    <body${sharedLinkView ? ' class="shared-link-bill"' : ""}>${pagesHtml}</body>
    </html>`;
}

module.exports = { buildBillHtml };
