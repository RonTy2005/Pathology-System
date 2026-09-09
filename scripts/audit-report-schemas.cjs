const path = require("path");
const sqlite3 = require("sqlite3").verbose();
const { buildReportHtml } = require("../src/utils/reportFormatter");
const { isBillingOnlyTest } = require('../frontend/scripts/reportEligibility');

const suppliedDatabasePath = process.argv[2];
const dataDirectory = process.env.LAB_LMS_DATA_DIR || process.cwd();
const databasePath = path.resolve(suppliedDatabasePath || path.join(dataDirectory, "lab-lms.db"));
const db = new sqlite3.Database(databasePath, sqlite3.OPEN_READONLY);

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (error, rows) => (error ? reject(error) : resolve(rows)));
  });
}

function classifyRenderedReport(test) {
  const html = buildReportHtml({
    patient: { id: "AUDIT", name: "Sample Patient", age: "30", gender: "Male" },
    visit: { bill_no: "AUDIT-001", created_at: "2026-09-09T00:00:00.000Z", sample_source: "lab" },
    report: { finalized_at: "2026-09-09T00:00:00.000Z" },
    doctor: { name: "Self" },
    businessName: "Audit Laboratory",
    isPreview: true,
    tests: [{ ...test, parameters: [] }],
  });

  return /<table class="results-table">[\s\S]*?<tbody>\s*<\/tbody>/i.test(html)
    ? "blank generic result body"
    : "specialised template without entry schema";
}

async function main() {
  const tests = await all(`
    SELECT
      t.id,
      t.name,
      t.category,
      t.sample_type,
      EXISTS (SELECT 1 FROM test_parameters parameter WHERE parameter.test_id = t.id) AS has_parameters,
      EXISTS (SELECT 1 FROM test_bundle_items item WHERE item.bundle_test_id = t.id) AS is_bundle
    FROM tests t
    WHERE t.active = 1
    ORDER BY t.category, t.name
  `);
  const missingSchemas = tests
    .filter((test) => !isBillingOnlyTest(test) && !test.has_parameters && !test.is_bundle)
    .map((test) => ({ ...test, issue: classifyRenderedReport(test) }));
  const categorySummary = new Map();

  for (const test of missingSchemas) {
    const key = `${test.category || "Uncategorised"} / ${test.issue}`;
    categorySummary.set(key, (categorySummary.get(key) || 0) + 1);
  }

  console.log(`Database: ${databasePath}`);
  console.table([
    { metric: "Active tests", count: tests.length },
    { metric: "Billing only (no report required)", count: tests.filter(isBillingOnlyTest).length },
    { metric: "Tests with result parameters", count: tests.filter((test) => test.has_parameters).length },
    { metric: "Bundles", count: tests.filter((test) => test.is_bundle).length },
    { metric: "Reports with missing result schema", count: missingSchemas.length },
  ]);
  console.table([...categorySummary.entries()].map(([scope, count]) => ({ scope, count })));

  if (missingSchemas.length) {
    console.table(missingSchemas.map((test) => ({ id: test.id, name: test.name, category: test.category, issue: test.issue })));
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.close());
