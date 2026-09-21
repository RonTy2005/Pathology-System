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
  const anemiaPreview = process.argv.includes("--anemia-preview");
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
  const paginationParameters = Array.from({ length: 55 }, (_value, index) => ({
    parameter_name: `Pagination QA Parameter ${String(index + 1).padStart(2, "0")}`,
    value: String(100 + index),
    unit: "unit",
    normal_range: "Reference interval",
  }));
  const anemiaScreeningParameters = [
    ["Haemoglobin (Hb)", "14", "g/dL", "Male: 13.5 - 17.5; Female: 12.0 - 15.5"],
    ["Red Blood Cell (RBC) Count", "5", "mill/cumm", "Male: 4.5 - 5.9; Female: 4.1 - 5.1"],
    ["Hematocrit (HCT / PCV)", "41", "%", "Male: 41 - 53; Female: 36 - 46"],
    ["Mean Corpuscular Volume (MCV)", "80", "fL", "80 - 100"],
    ["Mean Corpuscular Haemoglobin (MCH)", "27", "pg", "27 - 32"],
    ["Mean Corpuscular Haemoglobin Concentration (MCHC)", "32", "g/dL", "32 - 36"],
    ["Red Cell Distribution Width (RDW-CV)", "11.5", "%", "11.5 - 14.5"],
    ["Total Leucocyte Count (TLC)", "7,000", "cells/cumm", "4,000 - 11,000"],
    ["Platelet Count", "250,000", "cells/cumm", "150,000 - 450,000"],
    ["Serum Iron", "50", "mcg/dL", "Male: 50 - 150; Female: 35 - 145"],
    ["Total Iron Binding Capacity (TIBC)", "250", "mcg/dL", "250 - 400"],
    ["Transferrin Saturation", "14", "%", "14 - 50"],
    ["Ferritin, Serum", "22", "ng/mL", "22 - 322"],
    ["Screening Findings", "Normal", "", ""],
    ["Comments", "Normal", "", ""],
  ].map(([parameter_name, value, unit, normal_range]) => ({ parameter_name, value, unit, normal_range }));
  const tests = anemiaPreview
    ? [{
        name: "AnemiaScreeningProfile",
        category: "Imported legacy catalogue",
        sample_type: "EDTA Whole Blood and Serum",
        parameters: anemiaScreeningParameters,
      }]
    : [
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
        {
          name: "Extended Laboratory Profile - Pagination QA",
          category: "Quality Assurance",
          sample_type: "Serum",
          parameters: paginationParameters,
        },
      ];
  const html = buildReportHtml({
    patient: { id: "QA-001", name: "SAMPLE PATIENT", age: 35, gender: "Female" },
    visit: { bill_no: "QA-BILL-001", created_at: "2026-09-20T09:30:00Z" },
    report: { report_no: "QA-REPORT-001", finalized_at: "2026-09-20T10:00:00Z" },
    doctor: { name: "Dr. Referrer", specialization: "Medicine" },
    tests,
    embeddedPreview: anemiaPreview,
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
  const outputStem = anemiaPreview ? "anemia-screening-pagination-qa" : "report-whatsapp-letterhead-qa";
  const htmlPath = path.join(outputDirectory, `${outputStem}.html`);
  const pdfPath = path.join(outputDirectory, `${outputStem}.pdf`);
  await fs.mkdir(outputDirectory, { recursive: true });
  await fs.writeFile(htmlPath, html, "utf8");

  const window = new BrowserWindow({ show: false, width: 794, height: 1123, webPreferences: { sandbox: true } });
  try {
    await window.loadFile(htmlPath);
    await window.webContents.executeJavaScript("document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve(true)");
    await window.webContents.executeJavaScript("window.__labReportPaginationPromise || Promise.resolve(true)");
    const pageLayout = await window.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.report-generated-page')).map((page) => {
      const content = page.querySelector('.report-generated-content');
      return {
        hasLetterhead: Boolean(page.querySelector('.letterhead-background')),
        clientHeight: content ? content.clientHeight : 0,
        scrollHeight: content ? content.scrollHeight : 0,
      };
    })`);
    process.stdout.write(`${JSON.stringify(pageLayout)}\n`);
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
