const fs = require("fs/promises");
const path = require("path");
const { app, BrowserWindow } = require("electron");
const { buildBillHtml } = require("../src/utils/billFormatter");
const { sampleBill } = require("./bill-layout-fixture.cjs");

async function main() {
  await app.whenReady();
  const window = new BrowserWindow({ show: false, webPreferences: { sandbox: true } });
  try {
    const html = buildBillHtml(sampleBill(5));
    await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    const pdf = await window.webContents.printToPDF({
      pageSize: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      margins: { marginType: "none" },
    });
    const output = path.resolve(__dirname, "../tmp/pdfs/bill-half-a4-layout-qa.pdf");
    await fs.mkdir(path.dirname(output), { recursive: true });
    await fs.writeFile(output, pdf);
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
