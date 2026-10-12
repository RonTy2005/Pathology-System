const assert = require('node:assert/strict');
const { test } = require('node:test');
const { buildQrCodeDataUrl } = require('../src/utils/qrCode');
const { getPatientPortalQrUrl } = require('../src/utils/patientPortal');
const { buildReportHtml } = require('../src/utils/reportFormatter');
const { buildBillHtml } = require('../src/utils/billFormatter');
const { sampleReport } = require('./audit-report-content.cjs');
const { sampleBill } = require('./bill-layout-fixture.cjs');

const imageSource = html => html.match(/<img src="([^"]+)" class="qr-img"/)?.[1];

test('local QR generator embeds a complete square image with a white quiet zone', () => {
  const payloads = [
    'https://reports.example.invalid/api/patient-reports/synthetic-token/report?visitTestId=12&testId=9',
    'https://reports.example.invalid/api/patient-reports/sample/test/245/report',
    'http://192.168.1.50:3000/report-status.html?token=synthetic-token',
    'SAMPLE-001-SAMPLE PATIENT',
  ];
  for (const payload of payloads) {
    const src = buildQrCodeDataUrl(payload);
    assert.match(src, /^data:image\/svg\+xml;base64,/);
    const svg = Buffer.from(src.split(',')[1], 'base64').toString('utf8');
    const dimensions = svg.match(/viewBox="0 0 (\d+) (\d+)"/);
    assert.ok(dimensions);
    assert.equal(dimensions[1], dimensions[2]);
    assert.match(svg, /fill="#FFFFFF"/);
    assert.match(svg, /<path/);
    assert.doesNotMatch(svg, /<image|\bhref=|\burl\(/);
    assert.equal(getPatientPortalQrUrl(payload), src);
    assert.equal(buildQrCodeDataUrl(payload), src);
  }
  assert.equal(buildQrCodeDataUrl(''), '');
  assert.equal(buildQrCodeDataUrl(null), '');
});

test('patient reports, sample previews and all report pages use the correct embedded QR', () => {
  const reportUrl = 'https://reports.example.invalid/api/patient-reports/synthetic-token/report';
  const sampleUrl = 'https://reports.example.invalid/api/patient-reports/sample/test/245/report';
  const entry = { name: 'Complete Blood Count (CBC)', parameters: [] };
  const report = { ...sampleReport(entry), digitalReportUrl: reportUrl };
  const plain = buildReportHtml(report);
  const padded = buildReportHtml({ ...report, letterheadDataUrl: 'data:image/png;base64,YQ==' });
  assert.equal(imageSource(plain), buildQrCodeDataUrl(reportUrl));
  assert.equal(imageSource(padded), imageSource(plain));
  assert.equal(imageSource(buildReportHtml({ ...report, digitalReportUrl: sampleUrl })), buildQrCodeDataUrl(sampleUrl));
  const multi = buildReportHtml({ ...report, tests: [entry, { name: 'Liver Function Test (LFT)', parameters: [] }] });
  const sources = Array.from(multi.matchAll(/<img src="([^"]+)" class="qr-img"/g), match => match[1]);
  assert.equal(sources.length, 2);
  assert.ok(sources.every(src => src === buildQrCodeDataUrl(reportUrl)));
  assert.doesNotMatch(plain + padded + multi, /api\.qrserver\.com/);
});

test('bill QR embeds its existing patient portal link in the receipt footer', () => {
  const portalUrl = 'http://192.168.1.50:3000/report-status.html?token=synthetic-token';
  const bill = { ...sampleBill(6), patientPortalUrl: portalUrl };
  const html = buildBillHtml(bill);
  const sources = Array.from(html.matchAll(/<div class="portal-qr"><img src="([^"]+)"/g), match => match[1]);
  assert.equal(sources.length, 1);
  assert.ok(sources.every(src => src === buildQrCodeDataUrl(portalUrl)));
  assert.doesNotMatch(html, /api\.qrserver\.com/);
  assert.doesNotMatch(buildBillHtml(sampleBill(1)), /<div class="portal-qr">/);
});
