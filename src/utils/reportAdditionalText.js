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
  const contentStart = html.search(/<div\b[^>]*class=["'][^"']*\bmain-content\b[^"']*["'][^>]*>/i);
  const marker = html.indexOf("<!-- supplemental-report-content -->", contentStart);
  if (contentStart < 0 || marker < 0) return html;

  // Additional test rows belong in the existing result grid, not in a second
  // report table. Locate the final results table before the template notes.
  const tags = /<\/?table\b[^>]*>/gi;
  tags.lastIndex = contentStart;
  const tables = [];
  let resultTable = null;
  let tag;
  while ((tag = tags.exec(html)) && tag.index < marker) {
    if (/^<\/table/i.test(tag[0])) {
      const table = tables.pop();
      if (table?.isResultsTable) {
        resultTable = { ...table, closeStart: tag.index, closeEnd: tags.lastIndex };
      }
    } else {
      tables.push({
        openEnd: tags.lastIndex,
        isResultsTable: /\bclass=["'][^"']*\bresults-table\b[^"']*["']/i.test(tag[0]),
      });
    }
  }
  let output = html;
  if (rows.length && resultTable) {
    const tableBody = html.slice(resultTable.openEnd, resultTable.closeStart);
    const closeBodyIndex = tableBody.lastIndexOf("</tbody>");
    if (closeBodyIndex >= 0) {
      const rowMarkup = rows.map((row) => `<tr data-additional-report-row><td>${escapeAdditionalReportHtml(row.investigation)}</td><td>${escapeAdditionalReportHtml(row.result)}</td><td>${escapeAdditionalReportHtml(row.referenceValue)}</td><td>${escapeAdditionalReportHtml(row.unit)}</td></tr>`).join("");
      const insertion = resultTable.openEnd + closeBodyIndex;
      output = html.slice(0, insertion) + rowMarkup + html.slice(insertion);
    }
  }

  // Every existing report format has a results table. This compact fallback
  // keeps data visible for any future narrative-only template without adding a
  // titled secondary table.
  const rowFallbackMarkup = rows.length && output === html
    ? `<div class="additional-report-inline-rows" data-additional-report-rows>${rows.map((row) => `<div data-additional-report-row><span>${escapeAdditionalReportHtml(row.investigation)}</span><span>${escapeAdditionalReportHtml(row.result)}</span><span>${escapeAdditionalReportHtml(row.referenceValue)}</span><span>${escapeAdditionalReportHtml(row.unit)}</span></div>`).join("")}</div>`
    : "";
  if (textMarkup || rowFallbackMarkup) {
    let insertion = resultTable
      ? resultTable.closeEnd + (output.length - html.length)
      : marker;
    if (!resultTable || output === html) {
      const narrative = output.slice(contentStart, insertion);
    const notes = /<(?:div|section)\b[^>]*class=["'][^"']*\b[\w-]*notes\b[^"']*["'][^>]*>/i.exec(narrative);
    if (notes) insertion = contentStart + notes.index;
    }
    output = output.slice(0, insertion) + rowFallbackMarkup + textMarkup + output.slice(insertion);
  }
  return output;
}

module.exports = { appendAdditionalReportText, parseAdditionalReportRows };
