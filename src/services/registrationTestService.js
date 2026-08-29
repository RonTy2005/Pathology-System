const { get, run } = require("../db/helpers");

function createValidationError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function normalizeNewTestName(value) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, 160);
}

function normalizeNewTestPrice(value) {
  const price = Number(value);
  return Number.isFinite(price) && price >= 0 && price <= 1000000 ? price : null;
}

async function findOrCreateRegistrationTest({ name, price }) {
  const normalizedName = normalizeNewTestName(name);
  const normalizedPrice = normalizeNewTestPrice(price);

  if (normalizedName.length < 2) {
    throw createValidationError("Enter a test name with at least 2 characters.");
  }
  if (normalizedPrice === null) {
    throw createValidationError("Enter a valid test price.");
  }

  let test = await get(
    "SELECT * FROM tests WHERE LOWER(name) = LOWER(?) ORDER BY id ASC LIMIT 1",
    [normalizedName]
  );
  if (test) {
    if (!test.active) {
      await run("UPDATE tests SET active = 1 WHERE id = ?", [test.id]);
      test = await get("SELECT * FROM tests WHERE id = ?", [test.id]);
    }
    return { test, created: false };
  }

  try {
    const created = await run(
      `INSERT INTO tests (name, code, category, sample_type, price, turnaround_hours, active, created_at)
       VALUES (?, NULL, 'Newly Added', NULL, ?, 24, 1, CURRENT_TIMESTAMP)`,
      [normalizedName, normalizedPrice]
    );
    test = await get("SELECT * FROM tests WHERE id = ?", [created.id]);
    return { test, created: true };
  } catch (error) {
    // A matching test may have been added by a second registration at the same
    // moment. Reuse it rather than creating a duplicate or failing the visit.
    if (!/UNIQUE/i.test(String(error.message || ""))) throw error;
    test = await get(
      "SELECT * FROM tests WHERE LOWER(name) = LOWER(?) ORDER BY id ASC LIMIT 1",
      [normalizedName]
    );
    if (!test) throw error;
    return { test, created: false };
  }
}

async function materializeRegistrationTests(testConfigs = []) {
  const resolvedConfigs = [];
  const createdTests = [];

  for (const config of testConfigs) {
    if (!config?.isCustom) {
      resolvedConfigs.push(config);
      continue;
    }

    const { test, created } = await findOrCreateRegistrationTest({
      name: config.customName ?? config.name,
      price: config.customPrice ?? config.price,
    });
    if (created) createdTests.push(test);
    resolvedConfigs.push({
      ...config,
      id: test.id,
      isCustom: false,
      isOutside: Boolean(config.isOutside),
    });
  }

  return { testConfigs: resolvedConfigs, createdTests };
}

module.exports = {
  findOrCreateRegistrationTest,
  materializeRegistrationTests,
  normalizeNewTestName,
  normalizeNewTestPrice,
};
