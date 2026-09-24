const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const { buildDateStamp } = require("../src/utils/id");
const { nextDailyPatientCode } = require("../src/db/sequences");
const connection = require("../src/db/connection");
const { get, run } = require("../src/db/helpers");

test("new patient IDs use today's date and continue the daily patient number", async () => {
  await connection.switchDatabasePath(":memory:");
  try {
    await run("CREATE TABLE patients (id INTEGER PRIMARY KEY, patient_code TEXT UNIQUE NOT NULL)");
    const day = new Date(2026, 8, 24);
    assert.equal(buildDateStamp(day), "20260924");
    assert.equal(await nextDailyPatientCode(day), "20260924-0001");

    await run("INSERT INTO patients (patient_code) VALUES (?)", ["PAT-20260924-0001"]);
    await run("INSERT INTO patients (patient_code) VALUES (?)", ["PAT-20260924-0002"]);
    assert.equal(await nextDailyPatientCode(day), "20260924-0003");

    await run("INSERT INTO patients (patient_code) VALUES (?)", ["20260924-0003"]);
    await run("INSERT INTO patients (patient_code) VALUES (?)", ["PAT-20260923-0099"]);
    assert.equal(await nextDailyPatientCode(day), "20260924-0004");
    assert.equal(await nextDailyPatientCode(new Date(2026, 8, 25)), "20260925-0001");
    assert.equal((await get("SELECT patient_code FROM patients WHERE id = 1")).patient_code, "PAT-20260924-0001");
  } finally {
    await connection.switchDatabasePath(":memory:");
  }
});

test("both registration paths use the same date-first patient code", () => {
  for (const route of ["patientRoutes.js", "visitRoutes.js"]) {
    const source = fs.readFileSync(path.join(__dirname, "../src/routes", route), "utf8");
    assert.match(source, /await nextDailyPatientCode\(\)/, route);
    assert.doesNotMatch(source, /nextDailySequenceId\("PAT"/, route);
  }
});
