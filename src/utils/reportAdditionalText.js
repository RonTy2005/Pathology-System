function appendAdditionalReportText(html, tests = []) {
  if (tests.length !== 1) return html;
  const text = String(tests[0]?.additional_report_text || "");
  if (!text.trim()) return html;
  const escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  const markup = `<section class="additional-report-text" data-additional-report-text><p>${escaped}</p></section>`;
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

module.exports = { appendAdditionalReportText };
