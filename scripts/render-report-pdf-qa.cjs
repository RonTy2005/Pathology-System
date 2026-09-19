const fs = require("fs/promises");
const path = require("path");
const { app, BrowserWindow } = require("electron");
const { buildReportHtml } = require("../src/utils/reportFormatter");
const { getPrintToPdfOptions } = require("../desktop/reportPdf");

function svgDataUrl(svg) {
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

async function main() {
  await app.whenReady();
  const pad = svgDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="794" height="1123" viewBox="0 0 794 1123">
    <rect width="794" height="1123" fill="white"/>
    <rect width="794" height="152" fill="#eaf6f4"/>
    <rect y="0" width="794" height="12" fill="#0f766e"/>
    <text x="397" y="67" text-anchor="middle" font-family="Arial" font-size="30" font-weight="700" fill="#0f4f48">WE CARE DIAGNOSTICS</text>
    <text x="397" y="100" text-anchor="middle" font-family="Arial" font-size="16" fill="#334155">Synthetic letterhead used for PDF layout verification</text>
    <line x1="38" y1="137" x2="756" y2="137" stroke="#0f766e" stroke-width="2"/>
    <rect y="1050" width="794" height="73" fill="#eaf6f4"/>
    <line x1="38" y1="1062" x2="756" y2="1062" stroke="#0f766e" stroke-width="2"/>
    <text x="397" y="1097" text-anchor="middle" font-family="Arial" font-size="13" fill="#334155">Verified laboratory report footer</text>
  </svg>`);
  const signature = svgDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="420" height="120" viewBox="0 0 420 120">
    <rect width="420" height="120" fill="white" fill-opacity="0"/>
    <path d="M20 82 C90 8,110 108,168 42 S250 104,312 38 S350 82,400 35" fill="none" stroke="#1a237e" stroke-width="6"/>
  </svg>`);
  const html = buildReportHtml({
    patient: { id: "QA-001", name: "SAMPLE PATIENT", age: 35, gender: "Female" },
    visit: { bill_no: "QA-BILL-001", created_at: "2026-09-20T09:30:00Z" },
    report: { report_no: "QA-REPORT-001", finalized_at: "2026-09-20T10:00:00Z" },
    doctor: { name: "Dr. Referrer", specialization: "Medicine" },
    tests: [
      {
        name: "Complete Blood Count (CBC)",
        category: "Hematology",
        sample_type: "EDTA Blood",
        parameters: [
          { parameter_name: "Hemoglobin", value: "13.2", unit: "g/dL", normal_range: "12.0 - 15.0" },
          { parameter_name: "Total Leukocyte Count", value: "7,600", unit: "/cumm", normal_range: "4,000 - 11,000" },
          { parameter_name: "Platelet Count", value: "2.45", unit: "lakh/cumm", normal_range: "1.5 - 4.5" },
          { parameter_name: "Neutrophils", value: "58", unit: "%", normal_range: "40 - 80" },
          { parameter_name: "Lymphocytes", value: "34", unit: "%", normal_range: "20 - 40" },
        ],
      },
      {
        name: "FT4 & TSH",
        category: "Endocrinology",
        sample_type: "Serum",
        parameters: [
          { parameter_name: "FT4, Serum", value: "1.24", unit: "ng/dL", normal_range: "0.93 - 1.70" },
          { parameter_name: "TSH, Serum", value: "2.18", unit: "mIU/L", normal_range: "0.27 - 4.20" },
        ],
      },
    ],
    businessName: "We Care Diagnostics",
    digitalReportUrl: "https://reports.wecarediagnostics.in/sample",
    letterheadDataUrl: pad,
    reportHeaderSpaceMm: 44,
    reportFooterSpaceMm: 20,
    reportDoctorName: "Dr. Sample Pathologist",
    reportDoctorQualification: "MBBS, MD (Pathology)",
    reportDoctorRegistrationNo: "QA-12345",
    reportDoctorSignatureDataUrl: signature,
  });

  const outputDirectory = path.resolve(__dirname, "../tmp/pdfs");
  const htmlPath = path.join(outputDirectory, "report-whatsapp-letterhead-qa.html");
  const pdfPath = path.join(outputDirectory, "report-whatsapp-letterhead-qa.pdf");
  await fs.mkdir(outputDirectory, { recursive: true });
  await fs.writeFile(htmlPath, html, "utf8");

  const window = new BrowserWindow({ show: false, width: 794, height: 1123, webPreferences: { sandbox: true } });
  try {
    await window.loadFile(htmlPath);
    await window.webContents.executeJavaScript("document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve(true)");
    const pdf = await window.webContents.printToPDF(getPrintToPdfOptions());
    await fs.writeFile(pdfPath, pdf);
    process.stdout.write(`${pdfPath}\n`);
  } finally {
    window.destroy();
    app.quit();
  }
}

main().catch((error) => {
  console.error(error);
  app.quit();
  process.exitCode = 1;
});
