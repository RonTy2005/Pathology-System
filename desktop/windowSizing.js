function positiveNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function getInitialWindowBounds(
  workAreaSize = {},
  {
    preferredWidth = 1320,
    preferredHeight = 860,
    compactWidth = 900,
    compactHeight = 700,
  } = {}
) {
  const workWidth = positiveNumber(workAreaSize.width, preferredWidth + 32);
  const workHeight = positiveNumber(workAreaSize.height, preferredHeight + 32);
  const compact = workWidth <= compactWidth || workHeight <= compactHeight;
  const margin = compact ? 12 : 32;
  const availableWidth = Math.max(320, Math.floor(workWidth - margin));
  const availableHeight = Math.max(400, Math.floor(workHeight - margin));

  return {
    width: Math.min(preferredWidth, availableWidth),
    height: Math.min(preferredHeight, availableHeight),
    minWidth: Math.min(520, availableWidth),
    minHeight: Math.min(440, availableHeight),
  };
}

module.exports = { getInitialWindowBounds };
