const assert = require("node:assert/strict");
const { app, BrowserWindow } = require("electron");
const { getCbcParameters } = require("../src/config/cbc");
const { buildReportHtml } = require("../src/utils/reportFormatter");

app.on("window-all-closed", () => {});

function dataUrl(svg) {
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

async function main() {
  await app.whenReady();
  const window = new BrowserWindow({ show: false, width: 794, height: 1123, webPreferences: { sandbox: true } });
  try {
    const parameters = getCbcParameters("absolute").map((definition, index) => ({
      parameter_name: definition.parameterName,
      value: String(index + 1),
      unit: definition.unit,
      normal_range: definition.normalRange,
      entry_mode: definition.entryMode,
    }));
    const html = buildReportHtml({
      patient: { id: "QA-001", name: "Sample Patient", age: 35, gender: "Female" },
      visit: { bill_no: "CBC-ABS-QA", created_at: "2026-10-30T09:30:00Z" },
      report: { report_no: "CBC-ABS-RPT", finalized_at: "2026-10-30T10:00:00Z" },
      doctor: { name: "Dr. Referrer" },
      tests: [{ name: "Complete Blood Count (CBC) with Absolute Count", sample_type: "EDTA Whole Blood", parameters }],
      reportHeaderSpaceMm: 44,
      reportFooterSpaceMm: 20,
      reportDoctorName: "Dr. Reporting Pathologist",
      reportDoctorQualification: "MD (Pathology)",
      reportDoctorSignatureDataUrl: dataUrl('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="65"><path d="M10 45 L55 12 L90 48 L190 20" fill="none" stroke="black" stroke-width="3"/></svg>'),
    });
    await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    const layout = await window.webContents.executeJavaScript(`(async () => {
      await window.__labReportPaginationPromise;
      return Array.from(document.querySelectorAll('.report-generated-page')).map((page) => {
        const content = page.querySelector('.report-generated-content');
        return { clientHeight: content.clientHeight, scrollHeight: content.scrollHeight };
      });
    })()`);
    assert.equal(layout.length, 1, "CBC with Absolute Count must occupy one A4 page");
    assert.ok(layout[0].scrollHeight <= layout[0].clientHeight, "The compact CBC page must not be clipped");
    console.log(JSON.stringify({ pages: layout.length, ...layout[0] }));
  } finally {
    window.destroy();
    app.quit();
  }
}

main().catch((error) => {
  console.error(error);
  app.exit(1);
});
