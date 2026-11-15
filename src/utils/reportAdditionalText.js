function escapeAdditionalReportHtml(value = "") {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function parseAdditionalReportRows(value) {
  let rows = value;
  if (typeof rows === "string") {
    try {
      rows = JSON.parse(rows);
    } catch {
      rows = [];
    }
  }
  if (!Array.isArray(rows)) return [];
  return rows.slice(0, 50).map((row) => ({
    investigation: String(row?.investigation ?? ""),
    result: String(row?.result ?? ""),
    referenceValue: String(row?.referenceValue ?? ""),
    unit: String(row?.unit ?? ""),
  })).filter((row) => Object.values(row).some((field) => field.trim()));
}

function appendAdditionalReportText(html, tests = []) {
  if (tests.length !== 1) return html;
  const test = tests[0] || {};
  const text = String(test.additional_report_text || "");
  const rows = parseAdditionalReportRows(test.additional_report_rows_json);
  if (!text.trim() && !rows.length) return html;
  const textMarkup = text.trim()
    ? `<section class="additional-report-text" data-additional-report-text><p>${escapeAdditionalReportHtml(text)}</p></section>`
    : "";
  const rowsMarkup = rows.length
    ? `<section class="additional-report-rows" data-additional-report-rows><div class="additional-report-rows-title">Additional Test Details</div><table><thead><tr><th>Investigation</th><th>Result</th><th>Reference Value</th><th>Unit</th></tr></thead><tbody>${rows.map((row) => `<tr><td>${escapeAdditionalReportHtml(row.investigation)}</td><td>${escapeAdditionalReportHtml(row.result)}</td><td>${escapeAdditionalReportHtml(row.referenceValue)}</td><td>${escapeAdditionalReportHtml(row.unit)}</td></tr>`).join("")}</tbody></table></section>`
    : "";
  const markup = rowsMarkup + textMarkup;
  const contentStart = html.search(/<div\b[^>]*class=["'][^"']*\bmain-content\b[^"']*["'][^>]*>/i);
  const marker = html.indexOf("<!-- supplemental-report-content -->", contentStart);
  if (contentStart < 0 || marker < 0) return html;

  // Locate the end of the last results table, including any nested tables,
  // before the report's explanatory notes. No template content is rewritten.
  const tags = /<\/?table\b[^>]*>/gi;
  tags.lastIndex = contentStart;
  let depth = 0;
  let resultDepth = null;
  let insertion = marker;
  let foundResultsTable = false;
  let tag;
  while ((tag = tags.exec(html)) && tag.index < marker) {
    if (/^<\/table/i.test(tag[0])) {
      if (resultDepth === depth) {
        insertion = tags.lastIndex;
        foundResultsTable = true;
        resultDepth = null;
      }
      depth -= 1;
    } else {
      depth += 1;
      if (resultDepth === null && /\bclass=["'][^"']*\bresults-table\b[^"']*["']/i.test(tag[0])) resultDepth = depth;
    }
  }
  if (!foundResultsTable) {
    const narrative = html.slice(contentStart, marker);
    const notes = /<(?:div|section)\b[^>]*class=["'][^"']*\b[\w-]*notes\b[^"']*["'][^>]*>/i.exec(narrative);
    if (notes) insertion = contentStart + notes.index;
  }
  return html.slice(0, insertion) + markup + html.slice(insertion);
}

module.exports = { appendAdditionalReportText, parseAdditionalReportRows };
