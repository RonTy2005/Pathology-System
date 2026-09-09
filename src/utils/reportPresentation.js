/**
 * Shared print and preview presentation. Kept separate from the clinical
 * templates so every report family receives the same readability fixes.
 * No result values, reference intervals or interpretation rules live here.
 */
const REPORT_PRESENTATION_CSS = `
  :root {
    --report-ink: #192c3d;
    --report-muted: #526372;
    --report-accent: #196d78;
    --report-rule: #dce4e9;
    --report-tint: #f2f6f8;
  }
  body { color: var(--report-ink); line-height: 1.4; }
  .main-content { box-sizing: border-box; }
  .report-page-layout { width: 100%; border-collapse: collapse; table-layout: fixed; }
  .report-page-cell { padding: 0; vertical-align: top; }
  .report-page-spacer { display: none; }
  .main-content .header-table {
    table-layout: fixed;
    border: 0;
    border-top: 3px solid var(--report-accent);
    border-bottom: 1px solid var(--report-rule);
    margin: 0 0 12px;
  }
  .main-content .header-table td { padding: 12px 10px; border-color: var(--report-rule); }
  .main-content .header-table td:first-child { padding-left: 0; }
  .main-content .header-table td:last-child { padding-right: 0; }
  .patient-name { font-size: 19px; font-weight: 700; line-height: 1.2; margin-bottom: 7px; overflow-wrap: anywhere; }
  .info-row { color: var(--report-muted); font-size: 12px; line-height: 1.45; margin: 1px 0; }
  .info-label { display: inline-block; min-width: 35px; }
  .collection-heading { color: var(--report-muted); font-size: 10px; line-height: 1.3; letter-spacing: .8px; text-transform: uppercase; }
  .collection-location { font-size: 12px; line-height: 1.4; min-height: 0; overflow-wrap: anywhere; }
  .referral-row { margin-top: 8px; font-size: 11px; line-height: 1.4; overflow-wrap: anywhere; }
  .qr-frame { border: 0; padding: 2px; margin-top: 2px; width: 60px; height: 60px; flex-shrink: 0; }
  .qr-img { width: 60px; height: 60px; }
  .date-row { font-size: 10px; line-height: 1.5; white-space: normal; }
  .date-row strong { color: var(--report-muted); font-weight: 500; }
  .report-accession { font-size: 11px; font-weight: 650; margin-bottom: 5px; overflow-wrap: anywhere; }
  .report-heading { margin: 0 0 10px; break-inside: avoid; break-after: avoid; }
  .report-heading-meta { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 5px; }
  .report-department { color: var(--report-accent); font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.1px; }
  .report-preview-label { font-size: 10px; font-weight: 650; letter-spacing: .5px; color: var(--report-muted); border: 1px solid var(--report-rule); padding: 2px 7px; border-radius: 3px; }
  .main-content .test-title { margin: 0; text-align: left; font-size: 19px; line-height: 1.25; font-weight: 700; text-decoration: none; text-transform: none; letter-spacing: .15px; }
  .report-specimen { margin-top: 6px; font-size: 11px; color: var(--report-muted); }
  .report-specimen strong { color: var(--report-ink); font-weight: 600; }
  .report-findings { min-width: 0; }
  .report-findings table { max-width: 100%; border-collapse: collapse; }
  .report-findings table.results-table { width: 100%; table-layout: fixed; margin: 0 0 14px; border: 0; }
  .report-findings table.results-table > thead > tr > th {
    padding: 8px 9px !important;
    border: 0;
    border-bottom: 1px solid #b9cbd3;
    color: var(--report-ink);
    background: var(--report-tint);
    font-size: 12px !important;
    line-height: 1.3 !important;
    font-weight: 650;
    text-align: left;
    overflow-wrap: anywhere;
  }
  .report-findings table.results-table > tbody > tr > td {
    padding: 5px 9px !important;
    border: 0;
    border-bottom: 1px solid var(--report-rule);
    font-size: 14px !important;
    line-height: 1.35 !important;
    vertical-align: top;
    overflow-wrap: anywhere;
    white-space: normal;
    font-variant-numeric: tabular-nums;
  }
  .report-findings table.results-table > tbody > tr > td:nth-child(2):not([colspan]) {
    font-size: 15px !important;
    font-weight: 650 !important;
    background: #f8fafb;
  }
  .report-findings table.results-table > tbody > tr > td:first-child { font-weight: 500; }
  .report-findings table.results-table > tbody > tr > td:nth-child(n+3) { color: #415466; }
  .report-findings table.results-table strong { font-weight: 650; }
  .report-findings table.results-table > tbody > tr[class*="section"] > td,
  .report-findings table.results-table > tbody > tr[class*="heading-row"] > td,
  .report-findings table.results-table .group-header {
    font-size: 11px !important;
    letter-spacing: .45px;
    font-weight: 700;
    color: var(--report-accent);
    background: var(--report-tint);
    padding-top: 7px !important;
    padding-bottom: 7px !important;
    break-after: avoid;
  }
  .report-findings table.results-table > tbody > tr[class*="sample-row"] > td,
  .report-findings table.results-table > tbody > tr[class*="sample-row"] > td:nth-child(2):not([colspan]) {
    font-size: 11px !important;
    color: var(--report-muted);
    background: white;
    font-weight: 400 !important;
    padding-top: 6px !important;
    padding-bottom: 6px !important;
  }
  .report-findings [class$="-method"], .report-findings .method-note {
    font-size: 10px !important;
    font-weight: 400;
    line-height: 1.3;
    color: var(--report-muted);
    margin-top: 1px;
    text-transform: none;
    letter-spacing: 0;
    white-space: normal;
  }
  .report-findings span[class*="-status"] {
    display: inline-block;
    font-size: 10px !important;
    line-height: 1.25;
    font-weight: 700;
    margin-left: 5px;
    padding: 1px 4px;
    border: 1px solid currentColor;
    border-radius: 3px;
    white-space: normal;
    vertical-align: baseline;
  }
  .report-findings .high-val { color: #aa3030; }
  .report-findings .low-val { color: #245f9a; }
  .report-findings .normal-val { color: #216654; }
  .report-findings .equivocal-val { color: #845812; }
  /* Dense panels retain readable type; spacing, not font size, is reduced. */
  .report-findings table.cbc-table > tbody > tr > td,
  .report-findings table.semen-analysis-table > tbody > tr > td,
  .report-findings table.csf-analysis-table > tbody > tr > td {
    padding-top: 3px !important;
    padding-bottom: 3px !important;
  }
  .report-findings table.cbc-table > thead > tr > th:first-child { width: 36% !important; }
  .report-findings table.cbc-table > thead > tr > th:last-child { width: 14% !important; }
  .report-findings table:not(.results-table) { margin: 8px 0 12px; font-size: 11px; line-height: 1.4; }
  .report-findings table:not(.results-table) th,
  .report-findings table:not(.results-table) td {
    padding: 6px 8px;
    border: 1px solid var(--report-rule);
    font-size: inherit;
    line-height: inherit;
    overflow-wrap: anywhere;
  }
  .report-findings table:not(.results-table) th { background: var(--report-tint); color: var(--report-ink); font-weight: 650; text-transform: none; }
  .report-findings [class$="-notes"],
  .report-findings [class*="-notes "],
  .report-findings .report-notes,
  .report-findings .cbc-clinical-note {
    color: #405363;
    font-size: 10.5px;
    line-height: 1.45;
    margin: 10px 0;
  }
  .report-findings p, .report-findings li { text-align: left; line-height: 1.45; }
  .report-findings p { margin: 5px 0 8px; }
  .report-findings li { margin-bottom: 3px; }
  .report-findings ol, .report-findings ul { padding-left: 18px; }
  .report-findings .report-note-heading,
  .report-findings .single-analyte-heading,
  .report-findings .hba1c-interpretation-heading {
    color: var(--report-ink); font-size: 11px; font-weight: 700; margin: 12px 0 5px; break-after: avoid;
  }
  /* Narrative and microbiology bodies are results, not explanatory notes. */
  .report-findings .cytology-report-body,
  .report-findings .histopathology-report-body { margin: 0; font-size: 14px; line-height: 1.5; }
  .report-findings table.cytology-report-table,
  .report-findings table.histopathology-meta-table,
  .report-findings table.micro-exam-table,
  .report-findings table.mantoux-result-table,
  .report-findings table.hiv-screening-table { width: 100%; font-size: 14px; line-height: 1.45; }
  .report-findings table.cytology-report-table th,
  .report-findings table.histopathology-meta-table th { width: 24%; font-size: 11px; }
  .report-findings table.cytology-report-table td,
  .report-findings table.histopathology-meta-table td { white-space: pre-line; padding: 10px; }
  .report-findings .histopathology-section,
  .report-findings .cytology-field { margin: 15px 0; padding-top: 9px; border-top: 1px solid var(--report-rule); }
  .report-findings .histopathology-heading,
  .report-findings .cytology-field > strong { color: var(--report-accent); font-size: 11px; letter-spacing: .6px; margin-bottom: 6px; break-after: avoid; }
  .report-findings .histopathology-content { text-align: left; }
  .report-findings .histopathology-diagnosis { font-weight: 650; }
  .narrative-finding { border-bottom: 1px solid var(--report-rule); padding: 12px 0; }
  .narrative-finding h2 { font-size: 11px; font-weight: 700; color: var(--report-accent); letter-spacing: .5px; text-transform: uppercase; margin: 0 0 7px; break-after: avoid; }
  .narrative-finding > div { font-size: 14px; line-height: 1.5; overflow-wrap: anywhere; }
  .report-findings .micro-investigation,
  .report-findings .micro-specimen,
  .report-findings .micro-note { font-size: 14px; line-height: 1.5; margin: 9px 0; }
  .report-findings .cytology-comments { font-size: 10.5px; line-height: 1.45; }
  .report-findings .custom-report-body { border: 0; border-left: 3px solid #96b8bf; background: #f8fafb; margin: 14px 0; padding: 10px 12px; break-inside: auto; page-break-inside: auto; }
  .report-findings .custom-report-body-title { color: var(--report-accent); font-size: 10px; letter-spacing: .6px; }
  .report-findings table.results-table td[colspan],
  .report-findings .entered-result-text { white-space: pre-line; }
  .main-content .report-footer { border-top: 1px solid var(--report-rule); color: var(--report-muted); font-size: 10px; padding-top: 8px; margin-top: 12px; break-inside: avoid; }
  .main-content .signature-wrapper { padding: 10px 0 6px; break-inside: avoid; }
  .main-content .signature-section { text-align: right; width: 220px; }
  .main-content .sig-image { margin-left: auto; margin-right: 0; max-height: 70px; object-fit: contain; }
  .main-content .doc-name { color: var(--report-ink); font-size: 13px; line-height: 1.4; }
  .main-content .doc-detail { color: var(--report-muted); font-size: 10px; line-height: 1.4; }
  .report-findings thead { display: table-header-group; }
  .report-findings tr { break-inside: avoid; }
  .report-findings tr[class*="section"] { break-after: avoid; page-break-after: avoid; }
  @media print {
    .main-content, .multi-report-page .main-content { height: auto !important; min-height: 0 !important; padding: 0 !important; }
    .multi-report .multi-report-page { padding: 0 10mm !important; }
    body:not(.multi-report) { padding: 0 10mm; }
    .report-page-layout > .report-page-spacer { display: table-header-group; }
    .report-page-layout > tfoot.report-page-spacer { display: table-footer-group; }
    .report-page-spacer td { padding: 0; border: 0; }
    .report-page-layout > thead > tr > td { height: var(--report-header-space); }
    .report-page-layout > tfoot > tr > td { height: var(--report-footer-space); }
    .report-page-layout > tbody > .report-page-row,
    .report-page-cell { break-inside: auto; page-break-inside: auto; }
    .report-page-layout > tbody { break-inside: auto; }
    .report-findings { display: block; }
    .report-findings *, .header-table, .report-heading { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .report-findings table, .report-findings tbody { break-inside: auto; }
    .report-findings p { orphans: 3; widows: 3; }
  }
`;

module.exports = { REPORT_PRESENTATION_CSS };
