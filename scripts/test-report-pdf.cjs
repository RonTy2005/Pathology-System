const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const {
  createReportPdfHandler,
  getPrintToPdfOptions,
  normalizePdfFileName,
  prepareReportHtml,
} = require("../desktop/reportPdf");

test("desktop report PDFs use native A4 printing with backgrounds and no margins", () => {
  assert.deepEqual(getPrintToPdfOptions(), {
    landscape: false,
    displayHeaderFooter: false,
    printBackground: true,
    scale: 1,
    pageSize: "A4",
    margins: { top: 0, bottom: 0, left: 0, right: 0 },
    preferCSSPageSize: true,
  });
});

test("report PDF input is validated, made inert and given a safe filename", () => {
  const html = '<!DOCTYPE html><html><body><main>Report</main><script>window.print()</script></body></html>';
  assert.doesNotMatch(prepareReportHtml(html), /<script/i);
  assert.throws(() => prepareReportHtml("<div>not a report</div>"), /invalid/i);
  assert.equal(normalizePdfFileName('Report: A/B*?'), "Report_ A_B__.pdf");
});

test("desktop handler waits for the report, prints it, saves it and cleans up", async () => {
  const calls = [];
  class FakeWindow {
    constructor(options) {
      calls.push(["window", options]);
      this.webContents = {
        setWindowOpenHandler: (handler) => calls.push(["window-open", handler().action]),
        executeJavaScript: async () => calls.push(["assets-ready"]),
        printToPDF: async (options) => {
          calls.push(["print", options]);
          return Buffer.from("pdf-data");
        },
      };
    }
    async loadFile(file) { calls.push(["load", file]); }
    isDestroyed() { return false; }
    destroy() { calls.push(["destroy"]); }
  }
  const fakeFs = {
    mkdtemp: async (prefix) => { calls.push(["mkdtemp", prefix]); return "C:\\Temp\\labshield-report-qa"; },
    writeFile: async (file, data) => calls.push(["write", file, Buffer.isBuffer(data) ? data.toString() : data]),
    rm: async (directory, options) => calls.push(["cleanup", directory, options]),
  };
  const handler = createReportPdfHandler({
    BrowserWindow: FakeWindow,
    dialog: { showSaveDialog: async () => ({ canceled: false, filePath: "C:\\Reports\\Report.pdf" }) },
    fs: fakeFs,
    path: path.win32,
    app: { getPath: (name) => name === "downloads" ? "C:\\Downloads" : "C:\\Temp" },
    getParentWindow: () => ({ id: "main" }),
  });
  const result = await handler({}, {
    html: "<!DOCTYPE html><html><body><main>Complete report</main></body></html>",
    fileName: "Report.pdf",
  });
  assert.deepEqual(result, { canceled: false, filePath: "C:\\Reports\\Report.pdf" });
  assert.ok(calls.some(([name]) => name === "assets-ready"));
  assert.ok(calls.some(([name, options]) => name === "print" && options.pageSize === "A4"));
  assert.ok(calls.some(([name, file, data]) => name === "write" && file.endsWith("Report.pdf") && data === "pdf-data"));
  assert.ok(calls.some(([name]) => name === "cleanup"));
});

test("browser fallback carries report head styles into the cloned PDF body", () => {
  const source = fs.readFileSync(path.join(__dirname, "../frontend/scripts/common.js"), "utf8");
  const routes = fs.readFileSync(path.join(__dirname, "../src/routes/visitRoutes.js"), "utf8");
  assert.match(source, /iframeDoc\.head\.querySelectorAll\("style"\)/);
  assert.match(source, /iframeDoc\.body\.insertBefore\(style\.cloneNode\(true\)/);
  assert.match(source, /format=html&pdf=1/);
  assert.match(source, /window\.labLmsDesktop\?\.saveReportPdf/);
  assert.match(routes, /pdfMode\s*\?\s*canDownloadReportPdf/);
  assert.match(routes, /readOnlyView:\s*!printMode\s*&&\s*!pdfMode/);
});
