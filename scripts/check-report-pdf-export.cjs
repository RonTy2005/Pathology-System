const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const { app, BrowserWindow } = require('electron');
const { buildReportHtml } = require('../src/utils/reportFormatter');
const { createReportPdfHandler } = require('../desktop/reportPdf');
app.on('window-all-closed', () => {});

function fixture() {
  return {
    patient: { id: 'QA', name: 'PDF EXPORT QA PATIENT', age: 35, gender: 'Male' },
    visit: { bill_no: 'PDF-QA-001', created_at: '2026-10-13T08:00:00Z' },
    report: { report_no: 'PDF-QA-REPORT', finalized_at: '2026-10-13T09:00:00Z' },
    tests: [{ name: 'Total Protein', parameters: [{ parameter_name: 'Total Protein, Serum', value: '7.2', unit: 'g/dL', normal_range: '6.0 - 8.0' }], additional_report_text: 'ADVICE QA: Repeat only if clinically indicated.' }],
    businessName: 'QA DIAGNOSTIC CENTRE', reportHeaderSpaceMm: 38, reportFooterSpaceMm: 20,
    letterheadDataUrl: `data:image/svg+xml;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="794" height="1123"><rect width="794" height="1123" fill="white"/><text x="100" y="65" font-size="28" fill="teal">QA LETTERHEAD</text></svg>').toString('base64')}`,
    digitalReportUrl: 'https://example.invalid/synthetic-report',
  };
}

async function main() {
  await app.whenReady();
  const output = path.resolve(__dirname, '../tmp/pdfs/export-regression');
  await fs.mkdir(output, { recursive: true });
  const data = fixture();
  for (const plain of [false, true]) {
    const filePath = path.join(output, plain ? 'desktop-plain.pdf' : 'desktop-letterhead.pdf');
    const handler = createReportPdfHandler({ BrowserWindow, fs, path, app, getParentWindow: () => null,
      dialog: { showSaveDialog: async () => ({ canceled: false, filePath }) } });
    await handler({}, { html: buildReportHtml({ ...data, letterheadDataUrl: plain ? null : data.letterheadDataUrl }), fileName: path.basename(filePath) });
    console.log(JSON.stringify({ kind: 'desktop', plain, filePath, bytes: (await fs.stat(filePath)).size }));
  }
  if (!process.argv.includes('--desktop-only')) {
    const response = await fetch('https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js');
    assert.equal(response.ok, true, 'Browser PDF library must be available for this regression check');
    const library = await response.text();
    const source = await fs.readFile(path.resolve(__dirname, '../frontend/scripts/common.js'), 'utf8');
    const appStyles = await fs.readFile(path.resolve(__dirname, '../frontend/styles/app.css'), 'utf8');
    const exportFunction = source.slice(source.indexOf('async function saveBrowserReportPdf('), source.indexOf('\nfunction downloadReportPdf('));
    const window = new BrowserWindow({ show: false, width: 1000, height: 1200, webPreferences: { sandbox: true, backgroundThrottling: false } });
    try {
      await window.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(`<!DOCTYPE html><html><head><style>${appStyles}</style></head><body><div class="app-shell"><aside class="sidebar">QA WORKSPACE</aside><main class="main-content">QA DOWNLOAD</main></div></body></html>`));
      await window.webContents.executeJavaScript(library + '\n;void 0;');
      await window.webContents.executeJavaScript(`
        window.hasPermission = () => true; window.isPathologyTest = () => true; window.getUser = () => ({ role: 'admin' });
        window.alert = message => { window.__exportError = message; };
        window.open = url => { window.__shareUrl = url; };
        window.API = { request: async url => url.includes('format=html') ? window.__reportHtml : url.includes('report-contact') ? { patientPhone: '9999999999', reportUrl: 'https://example.invalid/synthetic-report' } : { visit: { bill_no: 'PDF-QA-001', patient_name: 'PDF EXPORT QA PATIENT', total_amount: 0, amount_paid: 0, phone: '9999999999' }, tests: [{ name: 'Total Protein' }] } };
        html2pdf.Worker.prototype.toPdf = (function(original) { return function() { return original.call(this).then(function() { this.prop.pdf.save = function() { window.__pdfPages = this.getNumberOfPages(); const bytes = new Uint8Array(this.output('arraybuffer')); let binary = ''; bytes.forEach(byte => binary += String.fromCharCode(byte)); window.__exportPdf = btoa(binary); }; }); }; })(html2pdf.Worker.prototype.toPdf);
        ${exportFunction}
        void 0;
      `);
      const longData = { ...data, tests: [
        { name: 'QA LONG PROFILE', parameters: Array.from({ length: 260 }, (_, i) => ({ parameter_name: `QA Analyte ${i + 1}`, value: String(i + 1), normal_range: '1 - 500', unit: 'QA' })) },
        ...data.tests,
      ] };
      for (const item of [
        { name: 'browser-letterhead', data, share: false, minimumPages: 1 },
        { name: 'browser-plain', data: { ...data, letterheadDataUrl: null }, share: false, minimumPages: 1 },
        { name: 'browser-whatsapp-multipage', data: longData, share: true, minimumPages: 8 },
      ]) {
        await window.webContents.executeJavaScript(`window.__reportHtml = ${JSON.stringify(buildReportHtml(item.data))}; window.__exportPdf = null; window.__exportError = null; window.__shareUrl = null; void 0;`);
        await window.webContents.executeJavaScript(`shareAndDownloadReport(1, ${Boolean(item.data.letterheadDataUrl)}, ${item.share})`);
        const result = await window.webContents.executeJavaScript('({pdf: window.__exportPdf, error: window.__exportError, pages: window.__pdfPages, shareUrl: window.__shareUrl})');
        assert.ok(!result.error, result.error);
        assert.ok(result.pdf, 'Browser export must produce a PDF');
        assert.ok(result.pages >= item.minimumPages, 'PDF must retain every measured report page');
        if (item.share) assert.match(result.shareUrl, /^https:\/\/wa.me\/919999999999/);
        else assert.equal(result.shareUrl, null, 'Download must not open WhatsApp');
        const filePath = path.join(output, `${item.name}.pdf`);
        const bytes = Buffer.from(result.pdf, 'base64');
        await fs.writeFile(filePath, bytes);
        console.log(JSON.stringify({ kind: item.name, filePath, pages: result.pages, bytes: bytes.length }));
      }
    } finally { window.destroy(); }
  }
  app.quit();
}
const timeout = setTimeout(() => { console.error('PDF export regression check timed out'); app.exit(1); }, 45000);
main().then(() => clearTimeout(timeout)).catch(error => { console.error(error); app.exit(1); });
