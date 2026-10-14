const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const {
  createReportPdfHandler,
  getPrintToPdfOptions,
  normalizePdfFileName,
  prepareReportHtml,
} = require("../desktop/reportPdf");
const { buildReportHtml } = require("../src/utils/reportFormatter");

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

test("browser fallback carries report head styles into the cloned PDF document", () => {
  const source = fs.readFileSync(path.join(__dirname, "../frontend/scripts/common.js"), "utf8");
  const routes = fs.readFileSync(path.join(__dirname, "../src/routes/visitRoutes.js"), "utf8");
  assert.match(source, /iframeDoc\.head\.querySelectorAll\("style"\)/);
  assert.match(source, /clonedDoc\.head\.appendChild\(style\)/);
  assert.match(source, /format=html&pdf=1/);
  assert.match(source, /window\.labLmsDesktop\?\.saveReportPdf/);
  assert.match(routes, /pdfMode\s*\?\s*canDownloadReportPdf/);
  assert.match(routes, /readOnlyView:\s*!printMode\s*&&\s*!pdfMode/);
});

function browserPdfFixture({ pageCount = 2, blank = false } = {}) {
  const calls = [];
  let ready = false;
  let pdfPages = 1;
  const pdf = {
    getNumberOfPages: () => pdfPages,
    deletePage: () => { pdfPages--; },
    addPage: () => { pdfPages++; },
    addImage: (...args) => calls.push(["image", ...args]),
    save: filename => calls.push(["save", filename]),
  };
  const pages = Array.from({ length: pageCount }, () => ({
    getBoundingClientRect: () => ({ width: 794, height: 1123 }),
    querySelector: selector => selector === ".report-generated-content" ? ({ textContent: "Test result 7.2", getBoundingClientRect: () => ({ height: 800 }) }) : null,
  }));
  const doc = {
    defaultView: { __labReportPaginationPromise: Promise.resolve().then(() => { ready = true; }) },
    head: { querySelectorAll: () => [{ textContent: ".report-generated-page { width:210mm; }" }] },
    querySelectorAll: selector => {
      assert.ok(ready, "Must wait for pagination before capturing pages");
      return selector === ".report-generated-page" ? pages : [];
    },
  };
  const html2pdf = () => {
    const canvas = {
      width: 1588, height: 2246,
      getContext: () => ({ getImageData: () => ({ data: blank ? [255, 255, 255, 255] : [0, 0, 0, 255] }), fillRect: () => {}, save: () => {}, restore: () => {}, setTransform: () => {} }),
      toDataURL: () => "data:image/jpeg;base64,QA",
    };
    const worker = {
      from: source => { assert.ok(pages.includes(source)); calls.push(["capture", source]); return worker; },
      set: options => {
        assert.equal(options.html2canvas.x, 0);
        assert.equal(options.html2canvas.y, 0);
        assert.equal(options.pagebreak.mode.length, 0);
        options.html2canvas.onclone({
          createElement: () => ({}),
          querySelector: () => null,
          querySelectorAll: () => [],
          head: { appendChild: style => { assert.match(style.textContent, /width:210mm/); assert.match(style.textContent, /html2pdf__container/); } },
        });
        return worker;
      },
      toCanvas: () => worker,
      get: async key => key === "canvas" ? canvas : pdf,
      toPdf: async () => { pdfPages = 2; calls.push(["create-pdf"]); },
    };
    return worker;
  };
  const source = fs.readFileSync(path.join(__dirname, "../frontend/scripts/common.js"), "utf8");
  const helper = source.slice(source.indexOf("async function saveBrowserReportPdf("), source.indexOf("\nasync function shareAndDownloadReport("));
  const save = vm.runInNewContext(helper + "\nsaveBrowserReportPdf", { html2pdf });
  return { save, doc, calls, pdf };
}

test("browser exports each measured A4 page separately without extra rounding pages", async () => {
  const { save, doc, calls, pdf } = browserPdfFixture();
  await save(doc, { filename: "QA.pdf", html2canvas: { scale: 2 } });
  assert.equal(calls.filter(([kind]) => kind === "capture").length, 2);
  assert.equal(calls.filter(([kind]) => kind === "create-pdf").length, 1);
  assert.equal(pdf.getNumberOfPages(), 2);
  assert.deepEqual(calls.find(([kind]) => kind === "image").slice(2), ["JPEG", 0, 0, 210, 297]);
  assert.deepEqual(calls.at(-1), ["save", "QA.pdf"]);
});

test("browser refuses a blank canvas instead of saving or sharing an empty PDF", async () => {
  const { save, doc, calls } = browserPdfFixture({ blank: true });
  await assert.rejects(save(doc, { filename: "QA.pdf" }), /could not be rendered/);
  assert.ok(!calls.some(([kind]) => kind === "save" || kind === "create-pdf"));
});

test("browser refuses a report that has no generated pages", async () => {
  const { save, doc, calls } = browserPdfFixture({ pageCount: 0 });
  await assert.rejects(save(doc, { filename: "QA.pdf" }), /pages are not ready/);
  assert.equal(calls.length, 0);
});

test("report barcode is embedded and identical with or without letterhead", () => {
  const base = {
    patient: { id: 1, name: "Barcode Patient", age: 32, gender: "Female" },
    visit: { bill_no: "BILL-20260925-001", created_at: "2026-09-25T09:00:00Z" },
    report: { report_no: "REPORT-001", finalized_at: "2026-09-25T10:00:00Z" },
    doctor: { name: "Self" },
    tests: [{ name: "Barcode Test", parameters: [{ parameter_name: "Result", value: "Normal" }] }],
    reportHeaderSpaceMm: 44,
  };
  const withLetterhead = buildReportHtml({ ...base, letterheadDataUrl: "data:image/png;base64,YQ==" });
  const withoutLetterhead = buildReportHtml({ ...base, letterheadDataUrl: null });
  const barcode = (html) => html.match(/<img src="(data:image\/svg\+xml;base64,[^"]+)" class="barcode-img"/)?.[1];
  assert.ok(barcode(withLetterhead));
  assert.equal(barcode(withLetterhead), barcode(withoutLetterhead));
  assert.doesNotMatch(withoutLetterhead, /bwipjs-api\.metafloor\.com/);
  const svg = Buffer.from(barcode(withoutLetterhead).split(",")[1], "base64").toString("utf8");
  assert.match(svg, /<svg viewBox=/);
  assert.match(svg, /<path[^>]+stroke=/);
  assert.match(withoutLetterhead, /class="header-barcode"/);
  assert.match(withoutLetterhead, /\.report-pagination-header-space\s*\{\s*height:\s*44mm;/);
});

test("overflow pages repeat the letterhead and preserve its configured spacing", () => {
  const reportHtml = buildReportHtml({
    patient: { id: "QA-1", name: "Pagination Patient", age: 40, gender: "Female" },
    visit: { bill_no: "QA-1", created_at: "2026-09-22T09:00:00Z" },
    report: { report_no: "QA-1", finalized_at: "2026-09-22T10:00:00Z" },
    doctor: { name: "Self" },
    tests: [
      { name: "Pagination Profile A", parameters: [{ parameter_name: "Result A", value: "1" }] },
      { name: "Pagination Profile B", parameters: [{ parameter_name: "Result B", value: "2" }] },
    ],
    letterheadDataUrl: "data:image/png;base64,YQ==",
    reportHeaderSpaceMm: 44,
    reportFooterSpaceMm: 20,
  });

  assert.match(reportHtml, /\.report-pagination-header-space\s*\{\s*height:\s*44mm;/);
  assert.match(reportHtml, /\.report-pagination-footer-space\s*\{\s*height:\s*20mm;/);
  assert.match(reportHtml, /<table class="report-pagination-table report-pagination-source" role="presentation">/);
  assert.match(reportHtml, /data-report-pagination="true"/);
  assert.match(reportHtml, /body\.multi-report > \.multi-report-print-letterhead\s*\{[\s\S]*?display:\s*block;[\s\S]*?position:\s*fixed;/);
  assert.match(reportHtml, /class="letterhead-background multi-report-print-letterhead"/);
  assert.match(reportHtml, /\.multi-report-page \.letterhead-background\s*\{\s*display:\s*none;/);
});

test("the AnemiaScreeningProfile preview is covered by the measured-page QA fixture", () => {
  const qaSource = fs.readFileSync(path.join(__dirname, "render-report-pdf-qa.cjs"), "utf8");
  assert.match(qaSource, /process\.argv\.includes\("--anemia-preview"\)/);
  assert.match(qaSource, /name:\s*"AnemiaScreeningProfile"/);
  assert.match(qaSource, /embeddedPreview:\s*anemiaPreview/);
  assert.match(qaSource, /window\.__labReportPaginationPromise/);
  assert.match(qaSource, /scrollHeight:\s*content \? content\.scrollHeight/);
});
