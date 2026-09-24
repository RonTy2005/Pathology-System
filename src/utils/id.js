function pad(number, size = 4) {
  return String(number).padStart(size, "0");
}

function buildDateStamp(date = new Date()) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}${mm}${dd}`;
}

function buildDailyPrefix(prefix) {
  return `${prefix}-${buildDateStamp()}`;
}

function buildSequenceId(prefix, numericId) {
  return `${buildDailyPrefix(prefix)}-${pad(numericId)}`;
}

module.exports = {
  pad,
  buildDateStamp,
  buildDailyPrefix,
  buildSequenceId,
};
