function pad(number, size = 4) {
  return String(number).padStart(size, "0");
}

function buildDailyPrefix(prefix) {
  const date = new Date();
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${prefix}-${yyyy}${mm}${dd}`;
}

function buildSequenceId(prefix, numericId) {
  return `${buildDailyPrefix(prefix)}-${pad(numericId)}`;
}

module.exports = {
  pad,
  buildDailyPrefix,
  buildSequenceId,
};
