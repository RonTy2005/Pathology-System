// Offline visual regression renderer for generated report HTML, using the
// same Chromium print engine shipped with the desktop app. Run with Electron.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { app, BrowserWindow, session } = require('electron');
const directory = path.resolve(process.argv[2] || 'tmp/report-design/current');
app.setPath('userData', path.join(directory, '.renderer'));
app.whenReady().then(async () => {
  // Synthetic fixtures do not need the external QR/barcode services.
  session.defaultSession.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (_details, callback) => callback({ cancel: true }));
  const win = new BrowserWindow({ show: false, width: 850, height: 1200, webPreferences: { offscreen: true, contextIsolation: true, nodeIntegration: false } });
  for (const filename of fs.readdirSync(directory).filter(name => name.endsWith('.html'))) {
    await win.loadFile(path.join(directory, filename));
    const pdf = await win.webContents.printToPDF({ pageSize: 'A4', printBackground: true, preferCSSPageSize: true, margins: { top: 0, bottom: 0, left: 0, right: 0 } });
    fs.writeFileSync(path.join(directory, filename.replace(/\.html$/, '.pdf')), pdf);
    const checks = await win.webContents.executeJavaScript(`(() => {
      const cells = [...document.querySelectorAll('.results-table > tbody > tr > td')]
        .filter(c => !/sample-row|section|heading-row/.test(c.parentElement.className));
      const narratives = [...document.querySelectorAll('.narrative-finding > div, .histopathology-content, .cytology-report-table td')];
      return { resultCells: cells.length, smallestResultFont: cells.length ? Math.min(...cells.map(c => parseFloat(getComputedStyle(c).fontSize))) : null,
        narrativeFont: narratives.length ? Math.min(...narratives.map(c => parseFloat(getComputedStyle(c).fontSize))) : null,
        reportCount: document.querySelectorAll('.report-page-cell > .report-heading').length,
        findingsCount: document.querySelectorAll('.report-page-cell > .report-findings').length,
        horizontalOverflow: document.documentElement.scrollWidth > Math.max(850, document.body.clientWidth) + 2 };
    })()`);
    assert.equal(checks.horizontalOverflow, false, `${filename}: report overflows A4 width`);
    assert.ok(checks.smallestResultFont === null || checks.smallestResultFont >= 14, `${filename}: result text is too small`);
    assert.ok(checks.narrativeFont === null || checks.narrativeFont >= 14, `${filename}: narrative results are too small`);
    assert.ok(checks.reportCount > 0 && checks.reportCount === checks.findingsCount, `${filename}: malformed report layout`);
    console.log(filename, JSON.stringify(checks));
  }
  win.destroy();
  app.quit();
}).catch(error => { console.error(error); app.exit(1); });
