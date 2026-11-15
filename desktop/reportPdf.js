const MAX_REPORT_HTML_BYTES = 50 * 1024 * 1024;
const { REPORT_PAGINATION_SCRIPT } = require("../src/utils/reportPagination");

// Chromium can print SVG data URLs inconsistently on some Windows PDF paths.
// Convert them in the isolated PDF document to high-resolution PNGs before
// printing, so QR codes and other embedded vector artwork remain scan-ready.
const RASTERIZE_EMBEDDED_SVG_IMAGES_SCRIPT = `
  (async () => {
    const images = Array.from(document.images).filter((image) => image.src.startsWith("data:image/svg+xml"));
    for (const image of images) {
      await image.decode().catch(() => {});
      const bounds = image.getBoundingClientRect();
      if (!bounds.width || !bounds.height) continue;
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.ceil(bounds.width * 6));
      canvas.height = Math.max(1, Math.ceil(bounds.height * 6));
      const context = canvas.getContext("2d");
      context.fillStyle = "#fff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      image.src = canvas.toDataURL("image/png");
      await image.decode().catch(() => {});
    }
    return true;
  })()
`;

function normalizePdfFileName(value) {
  const name = String(value || "LabShield_Report.pdf")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .replace(/[. ]+$/g, "")
    .slice(0, 180) || "LabShield_Report.pdf";
  return name.toLowerCase().endsWith(".pdf") ? name : `${name}.pdf`;
}

function prepareReportHtml(value) {
  const html = String(value || "");
  if (!/^\s*<!doctype html>/i.test(html) || !/<body[\s>]/i.test(html)) {
    throw new Error("The report document is invalid.");
  }
  if (Buffer.byteLength(html, "utf8") > MAX_REPORT_HTML_BYTES) {
    throw new Error("The report is too large to create a PDF.");
  }

  // Generated report scripts only provide on-screen controls. Removing them
  // keeps the isolated PDF window inert and prevents print prompts.
  return html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
}

function getPrintToPdfOptions() {
  return {
    landscape: false,
    displayHeaderFooter: false,
    printBackground: true,
    scale: 1,
    pageSize: "A4",
    margins: { top: 0, bottom: 0, left: 0, right: 0 },
    preferCSSPageSize: true,
  };
}

function createReportPdfHandler({ BrowserWindow, dialog, fs, path, app, getParentWindow }) {
  return async function saveReportPdf(_event, payload = {}) {
    const reportHtml = prepareReportHtml(payload.html);
    const fileName = normalizePdfFileName(payload.fileName);
    const parentWindow = getParentWindow();
    const defaultPath = path.join(app.getPath("downloads"), fileName);
    const choice = await dialog.showSaveDialog(parentWindow, {
      title: payload.kind === "bill" ? "Save laboratory bill PDF" : "Save laboratory report PDF",
      defaultPath,
      filters: [{ name: "PDF document", extensions: ["pdf"] }],
      properties: ["showOverwriteConfirmation", "createDirectory"],
    });
    if (choice.canceled || !choice.filePath) return { canceled: true };

    const temporaryDirectory = await fs.mkdtemp(path.join(app.getPath("temp"), "labshield-report-"));
    const htmlPath = path.join(temporaryDirectory, "report.html");
    let pdfWindow;
    try {
      await fs.writeFile(htmlPath, reportHtml, "utf8");
      pdfWindow = new BrowserWindow({
        show: false,
        width: 794,
        height: 1123,
        webPreferences: {
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
        },
      });
      pdfWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
      await pdfWindow.loadFile(htmlPath);
      await pdfWindow.webContents.executeJavaScript(`
        Promise.race([
          Promise.all([
            document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve(),
            ...Array.from(document.images).map((image) => image.complete
              ? Promise.resolve()
              : new Promise((resolve) => {
                  image.addEventListener("load", resolve, { once: true });
                  image.addEventListener("error", resolve, { once: true });
                }))
          ]),
          new Promise((resolve) => setTimeout(resolve, 5000))
        ]).then(() => true)
      `);
      await pdfWindow.webContents.executeJavaScript(REPORT_PAGINATION_SCRIPT);
      await pdfWindow.webContents.executeJavaScript(RASTERIZE_EMBEDDED_SVG_IMAGES_SCRIPT);
      const pdf = await pdfWindow.webContents.printToPDF(getPrintToPdfOptions());
      await fs.writeFile(choice.filePath, pdf);
      return { canceled: false, filePath: choice.filePath };
    } finally {
      if (pdfWindow && !pdfWindow.isDestroyed()) pdfWindow.destroy();
      await fs.rm(temporaryDirectory, { recursive: true, force: true }).catch(() => {});
    }
  };
}

module.exports = {
  MAX_REPORT_HTML_BYTES,
  RASTERIZE_EMBEDDED_SVG_IMAGES_SCRIPT,
  createReportPdfHandler,
  getPrintToPdfOptions,
  normalizePdfFileName,
  prepareReportHtml,
};
