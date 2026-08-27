const { getPatientPortalQrUrl } = require("./patientPortal");

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
  return `${day}/${month}/${year} · ${String(hours).padStart(2, "0")}:${minutes} ${ampm}`;
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

function buildBillHtml(billData) {
  const settings = billData.businessSettings || {};
  const businessName = escapeHtml(settings.businessName || billData.businessName || "Your Diagnostic Centre");
  const facilityType = escapeHtml(settings.facilityType || "Diagnostic services");
  const address = escapeHtml(settings.address || "");
  const phone = escapeHtml(settings.phone || "");
  const email = escapeHtml(settings.email || "");
  const registrationNo = escapeHtml(settings.registrationNo || "");
  const logoDataUrl = /^data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/]+={0,2}$/i.test(String(settings.businessLogoDataUrl || ""))
    ? String(settings.businessLogoDataUrl)
    : "";
  const contactDetails = [phone && `+91 ${phone}`, email].filter(Boolean).join("  ·  ");
  const portalUrl = String(billData.patientPortalUrl || "");
  const portalQrUrl = portalUrl ? getPatientPortalQrUrl(portalUrl) : "";
  const tests = billData.tests || [];
  const testsPerPage = 9;
  const totalPages = Math.max(1, Math.ceil(tests.length / testsPerPage));
  const doctorName = billData.doctor ? escapeHtml(billData.doctor.name) : "Not specified";
  const doctorSpecialization = billData.doctor?.specialization ? ` · ${escapeHtml(billData.doctor.specialization)}` : "";
  const associateName = escapeHtml(billData.visit.associate_label || "Direct at facility");
  const sampleSource = String(billData.visit.sample_source || "lab").toLowerCase() === "associate"
    ? "Collected through associate"
    : "Collected at facility";
  const payment = paymentSummary(billData.visit);

  const pagesHtml = Array.from({ length: totalPages }, (_, pageIndex) => {
    const firstPage = pageIndex === 0;
    const lastPage = pageIndex === totalPages - 1;
    const pageTests = tests.slice(pageIndex * testsPerPage, (pageIndex + 1) * testsPerPage);
    const testRows = pageTests.map((test, testIndex) => `
      <tr>
        <td class="serial">${pageIndex * testsPerPage + testIndex + 1}</td>
        <td>
          <strong>${escapeHtml(test.name)}</strong>
          ${test.code ? `<span class="test-code">${escapeHtml(test.code)}</span>` : ""}
        </td>
        <td class="amount">₹ ${money(test.price)}</td>
      </tr>
    `).join("");
    const fillerRows = Array.from(
      { length: Math.max(0, testsPerPage - pageTests.length) },
      () => '<tr class="filler"><td></td><td></td><td></td></tr>'
    ).join("");

    return `
      <main class="receipt${lastPage ? " receipt-last" : ""}">
        <section class="brand-row">
          <div class="brand-mark">${logoDataUrl ? `<img src="${logoDataUrl}" alt="${businessName} logo" />` : `<span>${businessName.slice(0, 1)}</span>`}</div>
          <div class="brand-details">
            <div class="eyebrow">${facilityType}</div>
            <h1>${businessName}</h1>
            ${address ? `<p>${address}</p>` : ""}
            ${contactDetails ? `<p>${contactDetails}</p>` : ""}
            ${registrationNo ? `<p class="registration">Registration no. ${registrationNo}</p>` : ""}
          </div>
          <div class="receipt-identification">
            <span class="copy-label">PATIENT COPY</span>
            <span class="receipt-label">Bill / Receipt</span>
            <strong>${escapeHtml(billData.visit.bill_no)}</strong>
            <span>${formatDateTime(billData.visit.created_at)}</span>
          </div>
        </section>

        <section class="patient-strip">
          <div class="patient-main">
            <span class="section-label">Patient</span>
            <h2>${escapeHtml(billData.patient.name)}</h2>
            <p>${escapeHtml(billData.patient.age || "-")} years · ${escapeHtml(billData.patient.gender || "-")} · ${escapeHtml(billData.patient.phone || "No phone number")}</p>
          </div>
          <div class="patient-detail">
            <span class="section-label">Referred by</span>
            <strong>${doctorName}</strong><span>${doctorSpecialization.replace(" · ", "")}</span>
          </div>
          <div class="patient-detail">
            <span class="section-label">Collection</span>
            <strong>${sampleSource}</strong><span>${associateName}</span>
          </div>
          ${portalQrUrl ? `
            <div class="portal-qr">
              <img src="${escapeHtml(portalQrUrl)}" alt="Scan to check report status" />
              <span>Scan for report status</span>
            </div>
          ` : ""}
        </section>

        ${!firstPage ? `<p class="continued">Bill ${escapeHtml(billData.visit.bill_no)} · continued · page ${pageIndex + 1} of ${totalPages}</p>` : ""}

        <table class="items-table">
          <thead>
            <tr><th class="serial">#</th><th>Investigation / service</th><th class="amount">Amount</th></tr>
          </thead>
          <tbody>${testRows}${fillerRows}</tbody>
        </table>

        ${lastPage ? `
          <section class="settlement">
            <div class="amount-words">
              <span class="section-label">Amount received in words</span>
              <p>Rupees ${numberToWords(billData.visit.amount_paid)}</p>
              <small>Payment mode: ${escapeHtml(String(billData.visit.payment_mode || "Not recorded").replace(/\b\w/g, (letter) => letter.toUpperCase()))}</small>
            </div>
            <div class="totals-card">
              <div><span>Subtotal</span><strong>₹ ${money(billData.visit.subtotal)}</strong></div>
              <div><span>Discount</span><strong>− ₹ ${money(billData.visit.discount)}</strong></div>
              <div class="grand-total"><span>Total payable</span><strong>₹ ${money(billData.visit.total)}</strong></div>
              <div><span>Amount received</span><strong>₹ ${money(billData.visit.amount_paid)}</strong></div>
              <div class="due-row ${payment.tone}"><span>Balance due</span><strong>₹ ${money(billData.visit.amount_due)}</strong></div>
              <div class="payment-state ${payment.tone}">${payment.label}</div>
            </div>
          </section>

          <footer class="receipt-footer">
            <div>
              <strong>Thank you for choosing ${businessName}.</strong>
              <p>Please retain this receipt. Reports are released only after the required payment and technical verification.</p>
            </div>
            <div class="signatory">
              <span>Prepared by ${escapeHtml(billData.visit.creator_name || billData.visit.creator_username || "Admin")}</span>
              <strong>Authorised signatory</strong>
            </div>
          </footer>
        ` : `<p class="next-page">Continued on next page · ${pageIndex + 1} of ${totalPages}</p>`}
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
        :root { --ink: #18312d; --muted: #61736f; --line: #d7e3df; --accent: #087b68; --accent-soft: #e7f6f1; --danger: #b42318; --warn: #a15c00; }
        * { box-sizing: border-box; }
        @page { size: A4 portrait; margin: 0 !important; }
        html, body { margin: 0; padding: 0; background: #edf3f1; }
        body { color: var(--ink); font-family: "Segoe UI", "Aptos", Arial, sans-serif; font-size: 10px; line-height: 1.35; }
        .receipt { width: 210mm; min-height: 148.5mm; padding: 8.5mm 10mm 7mm; background: #fff; position: relative; overflow: hidden; page-break-after: always; border-bottom: 1px dashed #a9bdb7; }
        .receipt::before { content: ""; position: absolute; inset: 0 auto 0 0; width: 4mm; background: var(--accent); }
        .receipt-last { page-break-after: auto; }
        .brand-row { min-height: 27mm; display: grid; grid-template-columns: 19mm 1fr 48mm; align-items: center; gap: 4mm; padding: 0 0 4.5mm; border-bottom: 2px solid var(--accent); }
        .brand-mark { width: 17mm; height: 17mm; border-radius: 5mm; overflow: hidden; background: var(--accent-soft); color: var(--accent); display: grid; place-items: center; font-size: 22px; font-weight: 800; }
        .brand-mark img { width: 100%; height: 100%; object-fit: contain; }
        .eyebrow, .section-label { display: block; color: var(--accent); font-size: 8px; font-weight: 800; letter-spacing: .09em; text-transform: uppercase; }
        .brand-details h1 { margin: 1px 0; color: var(--ink); font-size: 18px; line-height: 1.1; letter-spacing: -.02em; }
        .brand-details p { margin: 1px 0; color: var(--muted); font-size: 8.5px; }
        .brand-details .registration { font-size: 7.5px; }
        .receipt-identification { text-align: right; display: flex; flex-direction: column; align-items: flex-end; gap: 1px; color: var(--muted); font-size: 8px; }
        .receipt-identification strong { color: var(--ink); font-size: 13px; letter-spacing: .02em; }
        .copy-label { padding: 2px 5px; border-radius: 10px; background: var(--accent-soft); color: var(--accent); font-size: 7px; font-weight: 800; letter-spacing: .08em; }
        .receipt-label { color: var(--ink); font-size: 9px; font-weight: 700; text-transform: uppercase; }
        .patient-strip { display: grid; grid-template-columns: 1.55fr 1.1fr 1.15fr auto; gap: 3.5mm; align-items: center; padding: 4mm 0; border-bottom: 1px solid var(--line); }
        .patient-main h2 { margin: 1px 0; font-size: 14px; line-height: 1.1; }
        .patient-main p, .patient-detail span { margin: 0; color: var(--muted); font-size: 8.5px; }
        .patient-detail { min-width: 0; display: flex; flex-direction: column; gap: 1px; }
        .patient-detail strong { font-size: 9.5px; overflow-wrap: anywhere; }
        .portal-qr { min-width: 18mm; max-width: 20mm; display: flex; flex-direction: column; align-items: center; text-align: center; color: var(--muted); font-size: 6.5px; line-height: 1.15; }
        .portal-qr img { width: 17mm; height: 17mm; padding: 1mm; background: #fff; border: 1px solid var(--ink); }
        .continued, .next-page { margin: 3mm 0 2mm; color: var(--muted); font-size: 8px; text-align: center; }
        .items-table { width: 100%; border-collapse: collapse; margin-top: 3mm; table-layout: fixed; }
        .items-table th { padding: 2.4mm 2mm; background: var(--ink); color: #fff; font-size: 8px; font-weight: 700; letter-spacing: .04em; text-align: left; text-transform: uppercase; }
        .items-table th.serial, .items-table td.serial { width: 10mm; text-align: center; }
        .items-table th.amount, .items-table td.amount { width: 35mm; text-align: right; white-space: nowrap; }
        .items-table td { height: 5.5mm; padding: 1.6mm 2mm; border-bottom: 1px solid var(--line); vertical-align: middle; }
        .items-table tbody tr:nth-child(even) { background: #f7faf9; }
        .items-table td strong { font-size: 9.5px; }
        .test-code { margin-left: 1.5mm; color: var(--muted); font-size: 7px; }
        .items-table .filler td { height: 5.5mm; color: transparent; }
        .settlement { display: grid; grid-template-columns: 1fr 67mm; gap: 7mm; align-items: end; margin-top: 4.5mm; }
        .amount-words { align-self: stretch; padding: 3mm; border-left: 2px solid var(--accent); background: #f7faf9; }
        .amount-words p { margin: 2px 0 4px; font-size: 9px; font-weight: 700; }
        .amount-words small { color: var(--muted); font-size: 7.5px; }
        .totals-card { border: 1px solid var(--line); border-radius: 2mm; overflow: hidden; }
        .totals-card > div:not(.payment-state) { display: flex; justify-content: space-between; gap: 5mm; padding: 1.5mm 3mm; border-bottom: 1px solid var(--line); }
        .totals-card .grand-total { padding-top: 2mm; padding-bottom: 2mm; background: var(--accent-soft); font-size: 10px; }
        .totals-card .grand-total strong { font-size: 12px; }
        .totals-card .due-row.due strong { color: var(--danger); }
        .totals-card .due-row.partial strong { color: var(--warn); }
        .payment-state { padding: 1.4mm 3mm; color: #fff; background: var(--accent); text-align: center; font-size: 8px; font-weight: 800; letter-spacing: .08em; }
        .payment-state.partial { background: var(--warn); }
        .payment-state.due { background: var(--danger); }
        .receipt-footer { display: flex; justify-content: space-between; gap: 6mm; margin-top: 4mm; padding-top: 3mm; border-top: 1px solid var(--line); color: var(--muted); font-size: 7.5px; }
        .receipt-footer p { margin: 1px 0; max-width: 100mm; }
        .receipt-footer strong { color: var(--ink); }
        .signatory { min-width: 50mm; padding-top: 7mm; border-bottom: 1px solid var(--ink); text-align: center; display: flex; flex-direction: column; gap: 1px; }
        .signatory span { color: var(--muted); font-size: 7px; }
        .signatory strong { font-size: 8px; }
        @media screen { .receipt { margin: 10mm auto; box-shadow: 0 7px 28px rgba(21, 55, 46, .15); } }
        @media print { html, body { background: #fff; } .receipt { margin: 0; box-shadow: none; border-bottom: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
      </style>
    </head>
    <body>${pagesHtml}</body>
    </html>`;
}

module.exports = { buildBillHtml };
