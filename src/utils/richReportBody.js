const MAX_REPORT_BODY_LENGTH = 8000;
const RICH_REPORT_BODY_PREFIX = "[[LABSHIELD_RICH]]";

const ALLOWED_TAGS = new Set([
  "p", "br", "strong", "b", "em", "i", "u", "ul", "ol", "li",
  "table", "thead", "tbody", "tr", "th", "td",
]);
const VOID_TAGS = new Set(["br"]);
const RICH_TAG_PATTERN = /<\/?(?:p|br|strong|b|em|i|u|ul|ol|li|table|thead|tbody|tr|th|td)\b[^>]*>/i;

function isRichReportBody(value) {
  const body = String(value || "");
  return body.startsWith(RICH_REPORT_BODY_PREFIX)
    && RICH_TAG_PATTERN.test(body.slice(RICH_REPORT_BODY_PREFIX.length));
}

// Catalogue descriptions are stored as an intentionally small, attribute-free HTML subset.
// Keeping the allow-list this narrow lets reports render rich text without allowing scripts,
// external media, links, event handlers, or arbitrary document styling.
function sanitizeRichReportBody(value) {
  const raw = String(value || "").trim().slice(0, MAX_REPORT_BODY_LENGTH);
  if (!raw || !raw.startsWith(RICH_REPORT_BODY_PREFIX)) return raw;
  const source = raw.slice(RICH_REPORT_BODY_PREFIX.length).trim();
  if (!source || !RICH_TAG_PATTERN.test(source)) return "";

  const withoutUnsafeBlocks = source
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(?:script|style|iframe|object|embed|svg|math)\b[^>]*>[\s\S]*?<\/(?:script|style|iframe|object|embed|svg|math)>/gi, "")
    .replace(/<\/?(?:script|style|iframe|object|embed|svg|math)[^>]*>/gi, "");

  const sanitizeTag = (tag) => {
    const match = tag.match(/^<\s*(\/)?\s*([a-z0-9]+)\b[^>]*>$/i);
    if (!match) return "";

    const closing = Boolean(match[1]);
    let name = match[2].toLowerCase();
    if (!ALLOWED_TAGS.has(name)) return "";
    if (name === "b") name = "strong";
    if (name === "i") name = "em";
    if (VOID_TAGS.has(name)) return "<br />";
    return closing ? `</${name}>` : `<${name}>`;
  };

  const escapeText = (text) => String(text).replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  const tagPattern = /<\/?[a-z][^>]*>/gi;
  let safe = "";
  let position = 0;
  let match;
  while ((match = tagPattern.exec(withoutUnsafeBlocks))) {
    safe += escapeText(withoutUnsafeBlocks.slice(position, match.index));
    safe += sanitizeTag(match[0]);
    position = match.index + match[0].length;
  }
  safe += escapeText(withoutUnsafeBlocks.slice(position));
  const normalized = safe.trim();
  return normalized ? `${RICH_REPORT_BODY_PREFIX}${normalized}`.slice(0, MAX_REPORT_BODY_LENGTH) : "";
}

module.exports = {
  MAX_REPORT_BODY_LENGTH,
  RICH_REPORT_BODY_PREFIX,
  isRichReportBody,
  sanitizeRichReportBody,
};
