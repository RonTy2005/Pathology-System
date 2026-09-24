const { all } = require("./helpers");
const { pad, buildDateStamp, buildDailyPrefix, buildSequenceId } = require("../utils/id");

const ALLOWED_COLUMNS = {
  patients: new Set(["patient_code"]),
  visits: new Set(["bill_no"]),
  reports: new Set(["report_no"]),
};

function assertAllowedIdentifier(table, column) {
  if (!ALLOWED_COLUMNS[table]?.has(column)) {
    throw new Error(`Unsupported sequence target: ${table}.${column}`);
  }
}

function parseSequenceNumber(value, dailyPrefix) {
  const text = String(value || "");
  const expectedPrefix = `${dailyPrefix}-`;

  if (!text.startsWith(expectedPrefix)) {
    return 0;
  }

  const parsed = Number(text.slice(expectedPrefix.length));
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
}

async function nextDailySequenceId(prefix, table, column) {
  assertAllowedIdentifier(table, column);

  const dailyPrefix = buildDailyPrefix(prefix);
  const rows = await all(
    `SELECT ${column} AS value FROM ${table} WHERE ${column} LIKE ?`,
    [`${dailyPrefix}-%`]
  );
  const highest = rows.reduce(
    (max, row) => Math.max(max, parseSequenceNumber(row.value, dailyPrefix)),
    0
  );

  return buildSequenceId(prefix, highest + 1);
}

async function nextDailyPatientCode(date = new Date()) {
  const dateStamp = buildDateStamp(date);
  const rows = await all(
    `SELECT patient_code AS value FROM patients
     WHERE patient_code LIKE ? OR patient_code LIKE ?`,
    [`${dateStamp}-%`, `PAT-${dateStamp}-%`]
  );
  const highest = rows.reduce((max, row) => {
    const value = String(row.value || "");
    const match = value.match(new RegExp(`^(?:PAT-)?${dateStamp}-(\\d+)$`));
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);

  return `${dateStamp}-${pad(highest + 1)}`;
}

module.exports = {
  nextDailySequenceId,
  nextDailyPatientCode,
};
