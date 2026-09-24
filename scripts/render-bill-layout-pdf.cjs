const fs = require("fs/promises");
const path = require("path");
const { app, BrowserWindow } = require("electron");
const { getPrintToPdfOptions, prepareReportHtml } = require("../desktop/reportPdf");
const { buildBillHtml } = require("../src/utils/billFormatter");
const { REPORT_PAGINATION_SCRIPT } = require("../src/utils/reportPagination");
const { sampleBill } = require("./bill-layout-fixture.cjs");

async function main() {
  await app.whenReady();
  const window = new BrowserWindow({ show: false, width: 794, height: 1123, webPreferences: { sandbox: true } });
  try {
    const html = prepareReportHtml(buildBillHtml(sampleBill(5)));
    await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    await window.webContents.executeJavaScript(REPORT_PAGINATION_SCRIPT);
    const pdf = await window.webContents.printToPDF(getPrintToPdfOptions());
    const output = path.resolve(__dirname, "../tmp/pdfs/bill-half-a4-layout-qa.pdf");
    await fs.mkdir(path.dirname(output), { recursive: true });
    await fs.writeFile(output, pdf);
    // Also capture the printed half-page geometry for visual QA on systems
    // without Poppler's pdftoppm binary.
    await window.webContents.insertCSS("@media screen { html, body { background: #fff !important; } .bill-slip { margin: 0 !important; box-shadow: none !important; } }");
    const preview = await window.webContents.capturePage({ x: 0, y: 0, width: 794, height: 562 });
    await fs.writeFile(path.resolve(__dirname, "../tmp/pdfs/bill-half-a4-layout-qa.png"), preview.toPNG());
    process.stdout.write(`${output}\n`);
  } finally {
    window.destroy();
    app.quit();
  }
}

main().catch(error => {
  console.error(error);
  app.quit();
  process.exitCode = 1;
});
