const assert = require('node:assert/strict');
const { app, BrowserWindow } = require('electron');
const { buildReportHtml } = require('../src/utils/reportFormatter');
const { buildBillHtml } = require('../src/utils/billFormatter');
const { sampleReport } = require('./audit-report-content.cjs');
const { sampleBill } = require('./bill-layout-fixture.cjs');
const { spawnSync } = require('node:child_process');

async function main() {
  await app.whenReady();
  const window = new BrowserWindow({ show: false, width: 1000, height: 1200, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, partition: 'qr-offline-verification' } });
  let networkRequests = 0;
  window.webContents.session.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (_details, callback) => {
    networkRequests += 1;
    callback({ cancel: true });
  });
  const reportUrl = 'https://reports.example.invalid/api/patient-reports/synthetic-token/report';
  const sampleUrl = 'https://reports.example.invalid/api/patient-reports/sample/test/245/report';
  const portalUrl = 'http://192.168.1.50:3000/report-status.html?token=synthetic-token';
  const verifyDecoding = process.argv.includes('--decode');
  const base = sampleReport({ name: 'Complete Blood Count (CBC)', parameters: [] });
  const documents = [
    ['patient-report', buildReportHtml({ ...base, digitalReportUrl: reportUrl }), reportUrl],
    ['sample-report', buildReportHtml({ ...base, digitalReportUrl: sampleUrl }), sampleUrl],
    ['multiple-reports', buildReportHtml({ ...base, digitalReportUrl: reportUrl, tests: [base.tests[0], { name: 'Liver Function Test (LFT)', parameters: [] }] }), reportUrl],
    ['patient-bill', buildBillHtml({ ...sampleBill(6), patientPortalUrl: portalUrl }), portalUrl],
  ];
  try {
    for (const [kind, html, expectedUrl] of documents) {
      await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
      const result = await window.webContents.executeJavaScript(`(async () => {
        const images = Array.from(document.querySelectorAll('.qr-img, .portal-qr img'));
        await Promise.all(images.map(image => image.decode()));
        return { count: images.length, allLoaded: images.every(image => image.complete && image.naturalWidth > 0 && image.naturalHeight > 0), allEmbedded: images.every(image => image.src.startsWith('data:image/svg+xml;base64,')), pngs: ${verifyDecoding} ? images.map(image => {
          const canvas = document.createElement('canvas'); canvas.width = canvas.height = 600;
          const context = canvas.getContext('2d'); context.fillStyle = 'white'; context.fillRect(0, 0, 600, 600); context.drawImage(image, 0, 0, 600, 600);
          return canvas.toDataURL('image/png').split(',')[1];
        }) : [] };
      })()`);
      assert.ok(result.count > 0, kind);
      assert.equal(result.allLoaded, true, kind);
      assert.equal(result.allEmbedded, true, kind);
      if (verifyDecoding) {
        const decoder = spawnSync('python', ['-c', 'import sys,json,base64,cv2,numpy as np; images=json.load(sys.stdin); print(json.dumps([cv2.QRCodeDetector().detectAndDecode(cv2.imdecode(np.frombuffer(base64.b64decode(image),dtype=np.uint8),cv2.IMREAD_COLOR))[0] for image in images]))'], { input: JSON.stringify(result.pngs), encoding: 'utf8', windowsHide: true, timeout: 15000 });
        assert.equal(decoder.status, 0, decoder.stderr || 'Python with OpenCV is required for --decode');
        const decoded = JSON.parse(decoder.stdout);
        assert.ok(decoded.every(url => url === expectedUrl), `${kind}: decoded QR must open the intended link`);
        result.decodedCorrectly = true;
      }
      delete result.pngs;
      process.stdout.write(`${JSON.stringify({ kind, ...result })}\n`);
    }
    assert.equal(networkRequests, 0, 'QR rendering must not request internet resources');
    process.stdout.write('PASS: all QR images load with HTTP/HTTPS blocked; zero network requests.\n');
  } finally {
    window.destroy();
    app.quit();
  }
}

main().catch(error => { console.error(error); app.exit(1); });
