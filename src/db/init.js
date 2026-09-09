const fs = require("fs/promises");
const path = require("path");

const { all, ensureColumn, get, run } = require("./helpers");
const { switchDatabasePath, getDatabasePath } = require("./connection");
const { hashPassword } = require("../services/authService");
const { DEFAULT_BUSINESS_NAME, DEFAULT_SUPERADMIN_USERNAME, DEFAULT_SUPERADMIN_PASSWORD, PERMISSIONS, ROLES, ROLE_ACCESS_CONTROL_DEFAULTS, ROLE_PERMISSION_DEFAULTS, isAdministrativeRole } = require("../config/constants");
const { PATHOLOGY_REPORT_CATALOG } = require("./pathologyReportCatalog");
const { CBC_COMMON_PARAMETERS, CBC_REPORT_TESTS } = require("../config/cbc");
const { createPatientPortalToken } = require("../utils/patientPortal");
const { getCanonicalSchemaTargetForLegacyTest, getFallbackReportParameters } = require("../services/reportSchemaService");

function buildNow() {
  return new Date().toISOString();
}

async function createTables() {
  await run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL,
      full_name TEXT,
      employee_code TEXT,
      joining_date TEXT,
      employment_title TEXT,
      permissions TEXT,
      access_controls TEXT,
      profile_image TEXT,
      id_card_updated_at TEXT,
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await ensureColumn("users", "full_name", "TEXT");
  await ensureColumn("users", "employee_code", "TEXT");
  await ensureColumn("users", "joining_date", "TEXT");
  await ensureColumn("users", "employment_title", "TEXT");
  await ensureColumn("users", "permissions", "TEXT");
  await ensureColumn("users", "access_controls", "TEXT");
  await ensureColumn("users", "profile_image", "TEXT");
  await ensureColumn("users", "id_card_updated_at", "TEXT");
  await ensureColumn("users", "active", "INTEGER DEFAULT 1");
  await ensureColumn("users", "created_at", "TEXT");

  // Sessions are stored in the local server database so a normal server
  // restart does not force every workstation back to the login screen.
  await run(`
    CREATE TABLE IF NOT EXISTS user_sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);
  await run("CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id)");

  await run(`
    CREATE TABLE IF NOT EXISTS app_migrations (
      name TEXT PRIMARY KEY,
      applied_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS business_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      business_name TEXT NOT NULL,
      facility_type TEXT,
      address TEXT,
      phone TEXT,
      email TEXT,
      registration_no TEXT,
      patient_portal_base_url TEXT,
      business_opening_time TEXT,
      business_closing_time TEXT,
      business_logo_data_url TEXT,
      setup_completed INTEGER NOT NULL DEFAULT 0,
      subscription_expires_on TEXT,
      subscription_updated_by INTEGER,
      subscription_updated_at TEXT,
      letterhead_data_url TEXT,
      default_report_includes_letterhead INTEGER NOT NULL DEFAULT 1,
      report_header_space_mm INTEGER NOT NULL DEFAULT 0,
      report_footer_space_mm INTEGER NOT NULL DEFAULT 0,
      report_doctor_name TEXT,
      report_doctor_qualification TEXT,
      report_doctor_registration_no TEXT,
      report_doctor_signature_data_url TEXT,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await ensureColumn("business_settings", "facility_type", "TEXT");
  await ensureColumn("business_settings", "address", "TEXT");
  await ensureColumn("business_settings", "phone", "TEXT");
  await ensureColumn("business_settings", "email", "TEXT");
  await ensureColumn("business_settings", "registration_no", "TEXT");
  await ensureColumn("business_settings", "patient_portal_base_url", "TEXT");
  await ensureColumn("business_settings", "business_opening_time", "TEXT");
  await ensureColumn("business_settings", "business_closing_time", "TEXT");
  await ensureColumn("business_settings", "business_logo_data_url", "TEXT");
  await ensureColumn("business_settings", "setup_completed", "INTEGER NOT NULL DEFAULT 0");
  await ensureColumn("business_settings", "subscription_expires_on", "TEXT");
  await ensureColumn("business_settings", "subscription_updated_by", "INTEGER");
  await ensureColumn("business_settings", "subscription_updated_at", "TEXT");
  await ensureColumn("business_settings", "letterhead_data_url", "TEXT");
  await ensureColumn("business_settings", "default_report_includes_letterhead", "INTEGER NOT NULL DEFAULT 1");
  await ensureColumn("business_settings", "report_header_space_mm", "INTEGER NOT NULL DEFAULT 0");
  await ensureColumn("business_settings", "report_footer_space_mm", "INTEGER NOT NULL DEFAULT 0");
  await ensureColumn("business_settings", "report_doctor_name", "TEXT");
  await ensureColumn("business_settings", "report_doctor_qualification", "TEXT");
  await ensureColumn("business_settings", "report_doctor_registration_no", "TEXT");
  await ensureColumn("business_settings", "report_doctor_signature_data_url", "TEXT");
  await run(
    "INSERT OR IGNORE INTO business_settings (id, business_name) VALUES (1, ?)",
    [DEFAULT_BUSINESS_NAME]
  );

  await run(`
    CREATE TABLE IF NOT EXISTS doctors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT,
      specialization TEXT,
      commission_percent REAL DEFAULT 0,
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await ensureColumn("doctors", "commission_rules", "TEXT");

  await run(`
    CREATE TABLE IF NOT EXISTS patients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      patient_code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      age INTEGER,
      gender TEXT,
      phone TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS associates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      associate_code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      associate_type TEXT NOT NULL DEFAULT 'collector',
      phone TEXT,
      commission_percent REAL DEFAULT 60,
      notes TEXT,
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await ensureColumn("associates", "commission_percent", "REAL DEFAULT 0");

  await run(`
    CREATE TABLE IF NOT EXISTS tests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      code TEXT UNIQUE,
      category TEXT,
      sample_type TEXT,
      price REAL NOT NULL DEFAULT 0,
      turnaround_hours INTEGER DEFAULT 24,
      report_body TEXT,
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await ensureColumn("tests", "report_body", "TEXT");

  await run(`
    CREATE TABLE IF NOT EXISTS test_parameters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      test_id INTEGER NOT NULL,
      parameter_name TEXT NOT NULL,
      unit TEXT,
      normal_range TEXT,
      entry_mode TEXT NOT NULL DEFAULT 'manual',
      calculation_formula TEXT,
      calculation_precision INTEGER DEFAULT 2,
      display_order INTEGER DEFAULT 1,
      FOREIGN KEY (test_id) REFERENCES tests(id) ON DELETE CASCADE
    )
  `);

  await ensureColumn("test_parameters", "entry_mode", "TEXT NOT NULL DEFAULT 'manual'");
  await ensureColumn("test_parameters", "calculation_formula", "TEXT");
  await ensureColumn("test_parameters", "calculation_precision", "INTEGER DEFAULT 2");

  await run(`
    CREATE TABLE IF NOT EXISTS test_bundle_items (
      bundle_test_id INTEGER NOT NULL,
      component_test_id INTEGER NOT NULL,
      display_order INTEGER NOT NULL DEFAULT 1,
      PRIMARY KEY (bundle_test_id, component_test_id),
      FOREIGN KEY (bundle_test_id) REFERENCES tests(id) ON DELETE CASCADE,
      FOREIGN KEY (component_test_id) REFERENCES tests(id) ON DELETE CASCADE
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS visits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bill_no TEXT UNIQUE NOT NULL,
      patient_id INTEGER NOT NULL,
      doctor_id INTEGER,
      subtotal REAL NOT NULL DEFAULT 0,
      discount REAL NOT NULL DEFAULT 0,
      total REAL NOT NULL DEFAULT 0,
      amount_paid REAL NOT NULL DEFAULT 0,
      amount_due REAL NOT NULL DEFAULT 0,
      payment_mode TEXT NOT NULL,
      payment_status TEXT NOT NULL,
      associate_id INTEGER,
      associate_label TEXT,
      sample_source TEXT DEFAULT 'lab',
      patient_portal_token TEXT,
      status TEXT NOT NULL DEFAULT 'registered',
      created_by INTEGER NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (patient_id) REFERENCES patients(id),
      FOREIGN KEY (doctor_id) REFERENCES doctors(id),
      FOREIGN KEY (associate_id) REFERENCES associates(id),
      FOREIGN KEY (created_by) REFERENCES users(id)
    )
  `);

  await ensureColumn("visits", "associate_id", "INTEGER");
  await ensureColumn("visits", "associate_label", "TEXT");
  await ensureColumn("visits", "sample_source", "TEXT DEFAULT 'lab'");
  await ensureColumn("visits", "patient_portal_token", "TEXT");
  await run("CREATE UNIQUE INDEX IF NOT EXISTS idx_visits_patient_portal_token ON visits(patient_portal_token)");

  const visitsWithoutPortalToken = await all(
    "SELECT id FROM visits WHERE COALESCE(patient_portal_token, '') = ''"
  );
  for (const visit of visitsWithoutPortalToken) {
    await run("UPDATE visits SET patient_portal_token = ? WHERE id = ?", [
      createPatientPortalToken(),
      visit.id,
    ]);
  }

  await run(`
    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      expense_date TEXT NOT NULL,
      amount REAL NOT NULL,
      payment_mode TEXT NOT NULL DEFAULT 'cash',
      category TEXT,
      vendor_id INTEGER,
      paid_from TEXT DEFAULT 'reception',
      notes TEXT,
      created_by INTEGER NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (created_by) REFERENCES users(id),
      FOREIGN KEY (vendor_id) REFERENCES vendors(id)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS vendors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      contact_person TEXT,
      phone TEXT,
      category TEXT,
      notes TEXT,
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await ensureColumn("expenses", "vendor_id", "INTEGER");

  await run(`
    CREATE TABLE IF NOT EXISTS daily_account_submissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      submission_date TEXT NOT NULL,
      submitted_by INTEGER NOT NULL,
      cash_expected REAL DEFAULT 0,
      online_expected REAL DEFAULT 0,
      total_expected REAL DEFAULT 0,
      cash_counted REAL DEFAULT 0,
      online_counted REAL DEFAULT 0,
      cash_variance REAL DEFAULT 0,
      online_variance REAL DEFAULT 0,
      total_variance REAL DEFAULT 0,
      notes TEXT,
      submitted_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (submitted_by) REFERENCES users(id)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS visit_tests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      visit_id INTEGER NOT NULL,
      test_id INTEGER,
      assigned_to INTEGER,
      status TEXT NOT NULL DEFAULT 'pending',
      result_entered_at TEXT,
      finalized_at TEXT,
      FOREIGN KEY (visit_id) REFERENCES visits(id) ON DELETE CASCADE,
      FOREIGN KEY (test_id) REFERENCES tests(id),
      FOREIGN KEY (assigned_to) REFERENCES users(id)
    )
  `);

  await ensureColumn("visit_tests", "scan_done", "INTEGER DEFAULT 0");
  await ensureColumn("visit_tests", "is_outside", "INTEGER DEFAULT 0");
  await ensureColumn("visit_tests", "external_lab_name", "TEXT");
  await ensureColumn("visit_tests", "custom_test_name", "TEXT");
  await ensureColumn("visit_tests", "custom_test_price", "REAL");

  await run(`
    CREATE TABLE IF NOT EXISTS reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      visit_id INTEGER UNIQUE NOT NULL,
      report_no TEXT UNIQUE NOT NULL,
      generated_by INTEGER NOT NULL,
      generated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      finalized INTEGER DEFAULT 0,
      finalized_at TEXT,
      technician_print_count INTEGER DEFAULT 0,
      admin_print_count INTEGER DEFAULT 0,
      last_printed_by INTEGER,
      last_printed_at TEXT,
      FOREIGN KEY (visit_id) REFERENCES visits(id) ON DELETE CASCADE,
      FOREIGN KEY (generated_by) REFERENCES users(id),
      FOREIGN KEY (last_printed_by) REFERENCES users(id)
    )
  `);

  await ensureColumn("reports", "finalized_at", "TEXT");

  await run(`
    CREATE TABLE IF NOT EXISTS report_user_actions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      report_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      print_count INTEGER DEFAULT 0,
      edit_count INTEGER DEFAULT 0,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(report_id, user_id),
      FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS bill_user_actions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      visit_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      print_count INTEGER DEFAULT 0,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(visit_id, user_id),
      FOREIGN KEY (visit_id) REFERENCES visits(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      visit_test_id INTEGER NOT NULL,
      parameter_name TEXT NOT NULL,
      value TEXT,
      unit TEXT,
      normal_range TEXT,
      entry_mode TEXT NOT NULL DEFAULT 'manual',
      entered_by INTEGER NOT NULL,
      entered_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (visit_test_id) REFERENCES visit_tests(id) ON DELETE CASCADE,
      FOREIGN KEY (entered_by) REFERENCES users(id)
    )
  `);
  await ensureColumn("results", "entry_mode", "TEXT NOT NULL DEFAULT 'manual'");

  // One current uploaded document per CT/USG/MRI study. Keeping the file with
  // its visit test prevents reports from being mixed between patients.
  await run(`
    CREATE TABLE IF NOT EXISTS imaging_report_files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      visit_test_id INTEGER UNIQUE NOT NULL,
      original_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      file_data BLOB NOT NULL,
      file_size INTEGER NOT NULL,
      uploaded_by INTEGER NOT NULL,
      uploaded_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (visit_test_id) REFERENCES visit_tests(id) ON DELETE CASCADE,
      FOREIGN KEY (uploaded_by) REFERENCES users(id)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      meta TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS salary_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      payment_month TEXT NOT NULL,
      salary_amount REAL NOT NULL DEFAULT 0,
      paid_amount REAL DEFAULT 0,
      is_paid INTEGER DEFAULT 0,
      payment_date TEXT,
      payment_mode TEXT DEFAULT 'cash',
      notes TEXT,
      created_by INTEGER NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (created_by) REFERENCES users(id),
      UNIQUE(user_id, payment_month)
    )
  `);

  await ensureColumn("salary_payments", "user_id", "INTEGER NOT NULL");
  await ensureColumn("salary_payments", "payment_month", "TEXT NOT NULL");
  await ensureColumn("salary_payments", "salary_amount", "REAL NOT NULL DEFAULT 0");
  await ensureColumn("salary_payments", "paid_amount", "REAL DEFAULT 0");
  await ensureColumn("salary_payments", "is_paid", "INTEGER DEFAULT 0");
  await ensureColumn("salary_payments", "payment_date", "TEXT");
  await ensureColumn("salary_payments", "payment_mode", "TEXT DEFAULT 'cash'");
  await ensureColumn("salary_payments", "notes", "TEXT");
  await ensureColumn("salary_payments", "created_by", "INTEGER NOT NULL");
  await ensureColumn("salary_payments", "created_at", "TEXT DEFAULT CURRENT_TIMESTAMP");
  await ensureColumn("salary_payments", "updated_at", "TEXT DEFAULT CURRENT_TIMESTAMP");
 
  await run(`
    CREATE TABLE IF NOT EXISTS associate_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      associate_id INTEGER NOT NULL,
      payment_date TEXT NOT NULL,
      amount REAL NOT NULL,
      payment_mode TEXT NOT NULL DEFAULT 'cash',
      notes TEXT,
      created_by INTEGER NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (associate_id) REFERENCES associates(id) ON DELETE CASCADE,
      FOREIGN KEY (created_by) REFERENCES users(id)
    )
  `);
}

async function seedAdmin() {
  let admin = await get("SELECT * FROM users WHERE username = ?", [DEFAULT_SUPERADMIN_USERNAME]);
  const isLegacyDefaultAdmin = !admin;

  if (!admin) {
    admin = await get("SELECT * FROM users WHERE username = ?", ["admin"]);
  }

  if (!admin) {
    await run(
      `INSERT INTO users (username, password, role, full_name, employee_code, permissions, access_controls, active, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        DEFAULT_SUPERADMIN_USERNAME,
        hashPassword(DEFAULT_SUPERADMIN_PASSWORD),
        ROLES.SUPERADMIN,
        "System Super Admin",
        "EMP-ADMIN-001",
        JSON.stringify(ROLE_PERMISSION_DEFAULTS[ROLES.SUPERADMIN]),
        JSON.stringify(ROLE_ACCESS_CONTROL_DEFAULTS[ROLES.SUPERADMIN]),
        1,
        buildNow(),
      ]
    );
    return;
  }

  // Migrate installations that still use the previous default account.
  if (isLegacyDefaultAdmin) {
    await run(
      `UPDATE users
       SET username = ?, password = ?, role = ?, permissions = ?, access_controls = ?, active = 1
       WHERE id = ?`,
      [
        DEFAULT_SUPERADMIN_USERNAME,
        hashPassword(DEFAULT_SUPERADMIN_PASSWORD),
        ROLES.SUPERADMIN,
        JSON.stringify(ROLE_PERMISSION_DEFAULTS[ROLES.SUPERADMIN]),
        JSON.stringify(ROLE_ACCESS_CONTROL_DEFAULTS[ROLES.SUPERADMIN]),
        admin.id,
      ]
    );
    return;
  }

  // One-time upgrade of the established default account. Once upgraded, future
  // startups leave any later password changes untouched.
  if (admin.role !== ROLES.SUPERADMIN) {
    await run(
      "UPDATE users SET role = ?, password = ?, permissions = ?, access_controls = ? WHERE id = ?",
      [
        ROLES.SUPERADMIN,
        hashPassword(DEFAULT_SUPERADMIN_PASSWORD),
        JSON.stringify(ROLE_PERMISSION_DEFAULTS[ROLES.SUPERADMIN]),
        JSON.stringify(ROLE_ACCESS_CONTROL_DEFAULTS[ROLES.SUPERADMIN]),
        admin.id,
      ]
    );
  }

  if (!String(admin.password).includes(":")) {
    await run("UPDATE users SET password = ? WHERE id = ?", [
      hashPassword(admin.password),
      admin.id,
    ]);
  }

  if (!admin.permissions) {
    await run("UPDATE users SET permissions = ? WHERE id = ?", [
      JSON.stringify(ROLE_PERMISSION_DEFAULTS[ROLES.SUPERADMIN]),
      admin.id,
    ]);
  }

  if (!admin.access_controls) {
    await run("UPDATE users SET access_controls = ? WHERE id = ?", [
      JSON.stringify(ROLE_ACCESS_CONTROL_DEFAULTS[ROLES.SUPERADMIN]),
      admin.id,
    ]);
  }

  if (!admin.employee_code) {
    await run("UPDATE users SET employee_code = ? WHERE id = ?", ["EMP-ADMIN-001", admin.id]);
  }
}

async function seedDoctors() {
  const row = await get("SELECT COUNT(*) AS count FROM doctors");
  if (row.count > 0) {
    return;
  }

  const doctors = [
    ["Dr. Meera Sharma", "9876543210", "General Physician", 10],
    ["Dr. Arvind Rao", "9876501234", "Diabetology", 12],
    ["Dr. Kavya Nair", "9811102233", "Cardiology", 8],
  ];

  for (const doctor of doctors) {
    await run(
      `INSERT INTO doctors (name, phone, specialization, commission_percent, active, created_at)
       VALUES (?, ?, ?, ?, 1, ?)`,
      [...doctor, buildNow()]
    );
  }
}

async function seedTests() {
  const row = await get("SELECT COUNT(*) AS count FROM tests");
  if (row.count > 0) {
    return;
  }

  const tests = [
    {
      name: "Complete Blood Count",
      code: "CBC",
      category: "Hematology",
      sampleType: "Whole Blood",
      price: 350,
      turnaroundHours: 8,
      parameters: [
        ["Hemoglobin", "g/dL", "13.0 - 17.0", 1],
        ["Total WBC Count", "/cumm", "4000 - 11000", 2],
        ["Platelet Count", "cumm", "150000 - 410000", 3],
      ],
    },
    {
      name: "Fasting Blood Sugar",
      code: "FBS",
      category: "Biochemistry",
      sampleType: "Serum",
      price: 120,
      turnaroundHours: 4,
      parameters: [["Glucose", "mg/dL", "70 - 99", 1]],
    },
    {
      name: "Lipid Profile",
      code: "LIPID",
      category: "Biochemistry",
      sampleType: "Serum",
      price: 650,
      turnaroundHours: 10,
      parameters: [
        ["Total Cholesterol", "mg/dL", "< 200", 1],
        ["Triglycerides", "mg/dL", "< 150", 2],
        ["HDL Cholesterol", "mg/dL", "> 40", 3],
      ],
    },
  ];

  for (const test of tests) {
    const created = await run(
      `INSERT INTO tests (name, code, category, sample_type, price, turnaround_hours, active, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
      [
        test.name,
        test.code,
        test.category,
        test.sampleType,
        test.price,
        test.turnaroundHours,
        buildNow(),
      ]
    );

    for (const parameter of test.parameters) {
      await run(
        `INSERT INTO test_parameters (test_id, parameter_name, unit, normal_range, display_order)
         VALUES (?, ?, ?, ?, ?)`,
        [created.id, ...parameter]
      );
    }
  }
}

async function seedAssociates() {
  const row = await get("SELECT COUNT(*) AS count FROM associates");
  if (row.count > 0) {
    return;
  }

  const associates = [
    ["ASC-COL-001", "Ravi Collection Center", "collector", "9876500001", "Morning pickup route"],
    ["ASC-COL-002", "Seema Home Collection", "collector", "9876500002", "Home sample collection"],
  ];

  for (const associate of associates) {
    await run(
      `INSERT INTO associates (associate_code, name, associate_type, phone, notes, active, created_at)
       VALUES (?, ?, ?, ?, ?, 1, ?)`,
      [...associate, buildNow()]
    );
  }
}

async function seedPathologyReportCatalog() {
  for (const test of PATHOLOGY_REPORT_CATALOG) {
    const existing = await get("SELECT id FROM tests WHERE LOWER(name) = LOWER(?)", [test.name]);
    if (existing) continue;

    const created = await run(
      `INSERT INTO tests (name, code, category, sample_type, price, turnaround_hours, active, created_at)
       VALUES (?, ?, ?, ?, 0, ?, 1, ?)` ,
      [test.name, test.code, test.category, test.sampleType, test.turnaroundHours, buildNow()]
    );

    await run(
      `INSERT INTO test_parameters (test_id, parameter_name, unit, normal_range, display_order)
       VALUES (?, ?, ?, ?, 1)`,
      [created.id, "Result", "", ""]
    );
  }

  const misspelledCalcitonin = await get("SELECT id FROM tests WHERE LOWER(name) = ?", ["calsitonin"]);
  const calcitonin = await get("SELECT id FROM tests WHERE LOWER(name) = ?", ["calcitonin"]);
  if (misspelledCalcitonin && !calcitonin) {
    await run("UPDATE tests SET name = ? WHERE id = ?", ["Calcitonin", misspelledCalcitonin.id]);
  }
}

async function ensureRtPcrTestConfiguration() {
  let rtPcrTest = await get(
    "SELECT id FROM tests WHERE LOWER(name) = LOWER(?) ORDER BY id ASC LIMIT 1",
    ["RT-PCR"]
  );

  if (!rtPcrTest) {
    const created = await run(
      `INSERT INTO tests (name, code, category, sample_type, price, turnaround_hours, active, created_at)
       VALUES (?, ?, ?, ?, 0, ?, 1, ?)`,
      ["RT-PCR", "PF008", "Molecular", "Nasopharyngeal / Oropharyngeal Swab", 24, buildNow()]
    );
    rtPcrTest = { id: created.id };
  }

  await run(
    "UPDATE tests SET code = ?, category = ?, sample_type = ?, turnaround_hours = ?, active = 1 WHERE id = ?",
    ["PF008", "Molecular", "Nasopharyngeal / Oropharyngeal Swab", 24, rtPcrTest.id]
  );

  const resultParameter = await get(
    `SELECT id FROM test_parameters
     WHERE test_id = ? AND LOWER(parameter_name) = LOWER(?)
     ORDER BY display_order ASC, id ASC LIMIT 1`,
    [rtPcrTest.id, "SARS-CoV-2 (COVID-19) Qualitative"]
  ) || await get(
    `SELECT id FROM test_parameters
     WHERE test_id = ? AND LOWER(parameter_name) = LOWER(?)
     ORDER BY display_order ASC, id ASC LIMIT 1`,
    [rtPcrTest.id, "Result"]
  ) || await get(
    "SELECT id FROM test_parameters WHERE test_id = ? ORDER BY display_order ASC, id ASC LIMIT 1",
    [rtPcrTest.id]
  );

  if (resultParameter) {
    await run(
      `UPDATE test_parameters
       SET parameter_name = ?, unit = '', normal_range = '', display_order = 1
       WHERE id = ?`,
      ["SARS-CoV-2 (COVID-19) Qualitative", resultParameter.id]
    );
    return;
  }

  await run(
    `INSERT INTO test_parameters (test_id, parameter_name, unit, normal_range, display_order)
     VALUES (?, ?, '', '', 1)`,
    [rtPcrTest.id, "SARS-CoV-2 (COVID-19) Qualitative"]
  );
}

async function ensureTpmtGenotypingTestConfiguration() {
  let tpmtTest = await get(
    "SELECT id FROM tests WHERE LOWER(name) = LOWER(?) ORDER BY id ASC LIMIT 1",
    ["Thiopurine Methyltransferase (TPMT)"]
  ) || await get(
    "SELECT id FROM tests WHERE LOWER(name) = LOWER(?) ORDER BY id ASC LIMIT 1",
    ["Thiopurine Methyltransferase (TPMT) Genotyping"]
  );

  if (!tpmtTest) {
    const created = await run(
      `INSERT INTO tests (name, code, category, sample_type, price, turnaround_hours, active, created_at)
       VALUES (?, ?, ?, ?, 0, ?, 1, ?)`,
      ["Thiopurine Methyltransferase (TPMT)", "PF010", "Genetics", "Blood", 168, buildNow()]
    );
    tpmtTest = { id: created.id };
  }

  await run(
    "UPDATE tests SET name = ?, code = ?, category = ?, sample_type = ?, turnaround_hours = ?, active = 1 WHERE id = ?",
    ["Thiopurine Methyltransferase (TPMT)", "PF010", "Genetics", "Blood", 168, tpmtTest.id]
  );

  const parameters = [
    "TPMT*1 wild type",
    "TPMT*2 G238C",
    "TPMT*3A G460A and A719G",
    "TPMT*3B G460A",
    "TPMT*3C A719G",
  ];

  for (const [index, parameterName] of parameters.entries()) {
    let parameter = await get(
      `SELECT id FROM test_parameters
       WHERE test_id = ? AND LOWER(parameter_name) = LOWER(?)
       ORDER BY display_order ASC, id ASC LIMIT 1`,
      [tpmtTest.id, parameterName]
    );

    if (!parameter && index === 0) {
      parameter = await get(
        `SELECT id FROM test_parameters
         WHERE test_id = ? AND LOWER(parameter_name) = LOWER(?)
         ORDER BY display_order ASC, id ASC LIMIT 1`,
        [tpmtTest.id, "Result"]
      );
    }

    if (parameter) {
      await run(
        `UPDATE test_parameters
         SET parameter_name = ?, unit = '', normal_range = '', display_order = ?
         WHERE id = ?`,
        [parameterName, index + 1, parameter.id]
      );
      continue;
    }

    await run(
      `INSERT INTO test_parameters (test_id, parameter_name, unit, normal_range, display_order)
       VALUES (?, ?, '', '', ?)`,
      [tpmtTest.id, parameterName, index + 1]
    );
  }
}

async function ensureCysticFibrosisNewbornScreenTestConfiguration() {
  let cysticFibrosisTest = await get(
    "SELECT id FROM tests WHERE LOWER(name) = LOWER(?) ORDER BY id ASC LIMIT 1",
    ["Cystic Fibrosis (CF), Newborn, Screen"]
  );

  if (!cysticFibrosisTest) {
    const created = await run(
      `INSERT INTO tests (name, code, category, sample_type, price, turnaround_hours, active, created_at)
       VALUES (?, ?, ?, ?, 0, ?, 1, ?)`,
      ["Cystic Fibrosis (CF), Newborn, Screen", "PF066", "Newborn Screening", "Blood", 168, buildNow()]
    );
    cysticFibrosisTest = { id: created.id };
  }

  await run(
    "UPDATE tests SET code = ?, category = ?, sample_type = ?, turnaround_hours = ?, active = 1 WHERE id = ?",
    ["PF066", "Newborn Screening", "Blood", 168, cysticFibrosisTest.id]
  );

  const parameter = await get(
    `SELECT id FROM test_parameters
     WHERE test_id = ? AND LOWER(parameter_name) = LOWER(?)
     ORDER BY display_order ASC, id ASC LIMIT 1`,
    [cysticFibrosisTest.id, "Immunoreactive Trypsinogen (IRT)"]
  ) || await get(
    `SELECT id FROM test_parameters
     WHERE test_id = ? AND LOWER(parameter_name) = LOWER(?)
     ORDER BY display_order ASC, id ASC LIMIT 1`,
    [cysticFibrosisTest.id, "Result"]
  ) || await get(
    "SELECT id FROM test_parameters WHERE test_id = ? ORDER BY display_order ASC, id ASC LIMIT 1",
    [cysticFibrosisTest.id]
  );

  if (parameter) {
    await run(
      `UPDATE test_parameters
       SET parameter_name = ?, unit = ?, normal_range = ?, display_order = 1
       WHERE id = ?`,
      ["Immunoreactive Trypsinogen (IRT)", "ng/mL", "< 65.00", parameter.id]
    );
    return;
  }

  await run(
    `INSERT INTO test_parameters (test_id, parameter_name, unit, normal_range, display_order)
     VALUES (?, ?, ?, ?, 1)`,
    [cysticFibrosisTest.id, "Immunoreactive Trypsinogen (IRT)", "ng/mL", "< 65.00"]
  );
}

async function ensureKftTestConfiguration() {
  let kftTests = await all(
    `SELECT id FROM tests
     WHERE LOWER(name) IN (LOWER(?), LOWER(?), LOWER(?))
     ORDER BY id ASC`,
    [
      "Kidney Function Test (KFT)",
      "KFT/RFT (Kidney/Renal Function Test)",
      "KFT/RFT(Kidney / Renal Function Test)",
    ]
  );

  if (!kftTests.length) {
    const created = await run(
      `INSERT INTO tests (name, code, category, sample_type, price, turnaround_hours, active, created_at)
       VALUES (?, ?, ?, ?, 0, ?, 1, ?)`,
      ["Kidney Function Test (KFT)", "KFT001", "Biochemistry", "Serum", 24, buildNow()]
    );
    kftTests = [{ id: created.id }];
  }

  const parameters = [
    { name: "Urea", unit: "mg/dL", range: "13 - 43" },
    { name: "Creatinine", unit: "mg/dL", range: "0.7 - 1.3" },
    { name: "Uric Acid", unit: "mg/dL", range: "3.5 - 7.2" },
    { name: "Calcium, Total", unit: "mg/dL", range: "8.7 - 10.4" },
    { name: "Phosphorus", unit: "mg/dL", range: "2.4 - 5.1" },
    { name: "Alkaline Phosphatase (ALP)", unit: "U/L", range: "30 - 120" },
    { name: "Total Protein", unit: "g/dL", range: "5.7 - 8.2" },
    { name: "Albumin", unit: "g/dL", range: "3.2 - 4.8" },
    { name: "Sodium", unit: "mEq/L", range: "136 - 145" },
    { name: "Potassium", unit: "mEq/L", range: "3.5 - 5.1" },
    { name: "Chloride", unit: "mEq/L", range: "98 - 107" },
  ];

  for (const kftTest of kftTests) {
    await run("UPDATE tests SET sample_type = ?, active = 1 WHERE id = ?", ["Serum", kftTest.id]);

    for (const [index, definition] of parameters.entries()) {
      let parameter = await get(
        `SELECT id FROM test_parameters
         WHERE test_id = ? AND LOWER(parameter_name) = LOWER(?)
         ORDER BY display_order ASC, id ASC LIMIT 1`,
        [kftTest.id, definition.name]
      );

      if (!parameter && index === 0) {
        parameter = await get(
          `SELECT id FROM test_parameters
           WHERE test_id = ? AND LOWER(parameter_name) = LOWER(?)
           ORDER BY display_order ASC, id ASC LIMIT 1`,
          [kftTest.id, "Result"]
        );
      }

      if (parameter) {
        await run(
          `UPDATE test_parameters
           SET parameter_name = ?, unit = ?, normal_range = ?, display_order = ?
           WHERE id = ?`,
          [definition.name, definition.unit, definition.range, index + 1, parameter.id]
        );
        continue;
      }

      await run(
        `INSERT INTO test_parameters (test_id, parameter_name, unit, normal_range, display_order)
         VALUES (?, ?, ?, ?, ?)`,
        [kftTest.id, definition.name, definition.unit, definition.range, index + 1]
      );
    }
  }
}

async function ensureFactorIiTestConfiguration() {
  let factorIiTest = await get(
    "SELECT id FROM tests WHERE LOWER(name) = LOWER(?) ORDER BY id ASC LIMIT 1",
    ["Factor II"]
  );

  if (!factorIiTest) {
    const created = await run(
      `INSERT INTO tests (name, code, category, sample_type, price, turnaround_hours, active, created_at)
       VALUES (?, ?, ?, ?, 0, ?, 1, ?)`,
      ["Factor II", "PF067", "Hematology", "Plasma", 8, buildNow()]
    );
    factorIiTest = { id: created.id };
  }

  await run(
    "UPDATE tests SET code = ?, category = ?, sample_type = ?, turnaround_hours = ?, active = 1 WHERE id = ?",
    ["PF067", "Hematology", "Plasma", 8, factorIiTest.id]
  );

  const parameter = await get(
    `SELECT id FROM test_parameters
     WHERE test_id = ? AND LOWER(parameter_name) = LOWER(?)
     ORDER BY display_order ASC, id ASC LIMIT 1`,
    [factorIiTest.id, "FACTOR II, FUNCTIONAL"]
  ) || await get(
    `SELECT id FROM test_parameters
     WHERE test_id = ? AND LOWER(parameter_name) = LOWER(?)
     ORDER BY display_order ASC, id ASC LIMIT 1`,
    [factorIiTest.id, "Result"]
  ) || await get(
    "SELECT id FROM test_parameters WHERE test_id = ? ORDER BY display_order ASC, id ASC LIMIT 1",
    [factorIiTest.id]
  );

  if (parameter) {
    await run(
      `UPDATE test_parameters
       SET parameter_name = ?, unit = ?, normal_range = ?, display_order = 1
       WHERE id = ?`,
      ["FACTOR II, FUNCTIONAL", "%", "70.00 - 120.00", parameter.id]
    );
    return;
  }

  await run(
    `INSERT INTO test_parameters (test_id, parameter_name, unit, normal_range, display_order)
     VALUES (?, ?, ?, ?, 1)`,
    [factorIiTest.id, "FACTOR II, FUNCTIONAL", "%", "70.00 - 120.00"]
  );
}

async function ensureKaryotypeTestConfiguration() {
  let karyotypeTest = await get(
    "SELECT id FROM tests WHERE LOWER(name) = LOWER(?) ORDER BY id ASC LIMIT 1",
    ["Karyotype"]
  );

  if (!karyotypeTest) {
    const created = await run(
      `INSERT INTO tests (name, code, category, sample_type, price, turnaround_hours, active, created_at)
       VALUES (?, ?, ?, ?, 0, ?, 1, ?)`,
      ["Karyotype", "PF068", "Genetics", "Blood", 168, buildNow()]
    );
    karyotypeTest = { id: created.id };
  }

  await run(
    "UPDATE tests SET code = ?, category = ?, sample_type = ?, turnaround_hours = ?, active = 1 WHERE id = ?",
    ["PF068", "Genetics", "Blood", 168, karyotypeTest.id]
  );

  const parameter = await get(
    `SELECT id FROM test_parameters
     WHERE test_id = ? AND LOWER(parameter_name) = LOWER(?)
     ORDER BY display_order ASC, id ASC LIMIT 1`,
    [karyotypeTest.id, "Karyotype Result"]
  ) || await get(
    `SELECT id FROM test_parameters
     WHERE test_id = ? AND LOWER(parameter_name) = LOWER(?)
     ORDER BY display_order ASC, id ASC LIMIT 1`,
    [karyotypeTest.id, "Result"]
  ) || await get(
    "SELECT id FROM test_parameters WHERE test_id = ? ORDER BY display_order ASC, id ASC LIMIT 1",
    [karyotypeTest.id]
  );

  if (parameter) {
    await run(
      `UPDATE test_parameters
       SET parameter_name = ?, unit = '', normal_range = '', display_order = 1
       WHERE id = ?`,
      ["Karyotype Result", parameter.id]
    );
    return;
  }

  await run(
    `INSERT INTO test_parameters (test_id, parameter_name, unit, normal_range, display_order)
     VALUES (?, ?, '', '', 1)`,
    [karyotypeTest.id, "Karyotype Result"]
  );
}

async function ensureLipidProfileTestConfiguration() {
  let lipidProfiles = await all(
    "SELECT id FROM tests WHERE LOWER(name) = LOWER(?) ORDER BY id ASC",
    ["Lipid Profile"]
  );

  if (!lipidProfiles.length) {
    const created = await run(
      `INSERT INTO tests (name, code, category, sample_type, price, turnaround_hours, active, created_at)
       VALUES (?, ?, ?, ?, 0, ?, 1, ?)`,
      ["Lipid Profile", "LIPID", "Biochemistry", "Serum", 24, buildNow()]
    );
    lipidProfiles = [{ id: created.id }];
  }

  const parameters = [
    { name: "Total Cholesterol", unit: "mg/dL", range: "< 200.00" },
    { name: "Triglycerides", unit: "mg/dL", range: "< 150.00" },
    { name: "HDL Cholesterol", unit: "mg/dL", range: "> 40.00" },
    { name: "LDL Cholesterol", unit: "mg/dL", range: "< 100.00" },
    { name: "VLDL Cholesterol", unit: "mg/dL", range: "< 30.00" },
    { name: "Non-HDL Cholesterol", unit: "mg/dL", range: "< 130.00" },
  ];

  for (const lipidProfile of lipidProfiles) {
    await run(
      "UPDATE tests SET code = ?, category = ?, sample_type = ?, turnaround_hours = ?, active = 1 WHERE id = ?",
      ["LIPID", "Biochemistry", "Serum", 24, lipidProfile.id]
    );

    for (const [index, definition] of parameters.entries()) {
      let parameter = await get(
        `SELECT id FROM test_parameters
         WHERE test_id = ? AND LOWER(parameter_name) = LOWER(?)
         ORDER BY display_order ASC, id ASC LIMIT 1`,
        [lipidProfile.id, definition.name]
      );

      if (!parameter && index === 0) {
        parameter = await get(
          `SELECT id FROM test_parameters
           WHERE test_id = ? AND LOWER(parameter_name) = LOWER(?)
           ORDER BY display_order ASC, id ASC LIMIT 1`,
          [lipidProfile.id, "Result"]
        );
      }

      if (parameter) {
        await run(
          `UPDATE test_parameters
           SET parameter_name = ?, unit = ?, normal_range = ?, display_order = ?
           WHERE id = ?`,
          [definition.name, definition.unit, definition.range, index + 1, parameter.id]
        );
        continue;
      }

      await run(
        `INSERT INTO test_parameters (test_id, parameter_name, unit, normal_range, display_order)
         VALUES (?, ?, ?, ?, ?)`,
        [lipidProfile.id, definition.name, definition.unit, definition.range, index + 1]
      );
    }
  }
}

async function ensureLftTestConfiguration() {
  let lftTests = await all(
    `SELECT id FROM tests
     WHERE LOWER(name) IN (LOWER(?), LOWER(?), LOWER(?))
     ORDER BY id ASC`,
    ["Liver Function Test (LFT)", "LFT (Liver Function Test)", "LFT with GGT"]
  );

  if (!lftTests.length) {
    const created = await run(
      `INSERT INTO tests (name, code, category, sample_type, price, turnaround_hours, active, created_at)
       VALUES (?, ?, ?, ?, 0, ?, 1, ?)`,
      ["Liver Function Test (LFT)", "LFT001", "Biochemistry", "Serum", 24, buildNow()]
    );
    lftTests = [{ id: created.id }];
  }

  const parameters = [
    { name: "AST (SGOT)", aliases: ["SGOT / AST"], unit: "U/L", range: "15.00 - 40.00" },
    { name: "ALT (SGPT)", aliases: ["SGPT / ALT"], unit: "U/L", range: "10.00 - 49.00" },
    { name: "AST : ALT Ratio", aliases: ["AST:ALT Ratio", "AST ALT Ratio"], unit: "", range: "< 1.00" },
    { name: "GGTP", aliases: ["GGT", "Gamma Glutamyl Transferase"], unit: "U/L", range: "0.00 - 73.00" },
    { name: "Alkaline Phosphatase (ALP)", aliases: ["ALP (Alkaline Phosphatase)", "Alkaline Phosphatase"], unit: "U/L", range: "30.00 - 120.00" },
    { name: "Bilirubin Total", aliases: ["Total Bilirubin"], unit: "mg/dL", range: "0.30 - 1.20" },
    { name: "Bilirubin Direct", aliases: ["Direct Bilirubin"], unit: "mg/dL", range: "< 0.30" },
    { name: "Bilirubin Indirect", aliases: ["Indirect Bilirubin"], unit: "mg/dL", range: "< 1.10" },
    { name: "Total Protein", aliases: [], unit: "g/dL", range: "5.70 - 8.20" },
    { name: "Albumin", aliases: [], unit: "g/dL", range: "3.20 - 4.80" },
    { name: "Globulin", aliases: [], unit: "g/dL", range: "2.00 - 3.50" },
    { name: "A : G Ratio", aliases: ["A G Ratio", "A:G Ratio"], unit: "", range: "0.90 - 2.00" },
  ];

  for (const lftTest of lftTests) {
    await run("UPDATE tests SET sample_type = ?, active = 1 WHERE id = ?", ["Serum", lftTest.id]);

    for (const [index, definition] of parameters.entries()) {
      let parameter = null;
      for (const parameterName of [definition.name, ...definition.aliases]) {
        parameter = await get(
          `SELECT id FROM test_parameters
           WHERE test_id = ? AND LOWER(parameter_name) = LOWER(?)
           ORDER BY display_order ASC, id ASC LIMIT 1`,
          [lftTest.id, parameterName]
        );
        if (parameter) break;
      }

      if (!parameter && index === 0) {
        parameter = await get(
          `SELECT id FROM test_parameters
           WHERE test_id = ? AND LOWER(parameter_name) = LOWER(?)
           ORDER BY display_order ASC, id ASC LIMIT 1`,
          [lftTest.id, "Result"]
        );
      }

      if (parameter) {
        await run(
          `UPDATE test_parameters
           SET parameter_name = ?, unit = ?, normal_range = ?, display_order = ?
           WHERE id = ?`,
          [definition.name, definition.unit, definition.range, index + 1, parameter.id]
        );
        continue;
      }

      await run(
        `INSERT INTO test_parameters (test_id, parameter_name, unit, normal_range, display_order)
         VALUES (?, ?, ?, ?, ?)`,
        [lftTest.id, definition.name, definition.unit, definition.range, index + 1]
      );
    }
  }
}

async function ensureHba1cTestConfiguration() {
  let hba1cTests = await all(
    `SELECT id FROM tests
     WHERE LOWER(name) IN (LOWER(?), LOWER(?), LOWER(?), LOWER(?), LOWER(?))
     ORDER BY id ASC`,
    [
      "HbA1c",
      "HbA1c (Glycosylated Hemoglobin)",
      "HbA1c (Glycosylated Haemoglobin)",
      "Glycated Haemoglobin (HbA1c)",
      "Glycated Hemoglobin (HbA1c)",
    ]
  );

  if (!hba1cTests.length) {
    const created = await run(
      `INSERT INTO tests (name, code, category, sample_type, price, turnaround_hours, active, created_at)
       VALUES (?, ?, ?, ?, 0, ?, 1, ?)`,
      ["HbA1c (Glycosylated Hemoglobin)", "HBA1C001", "Biochemistry", "Blood", 24, buildNow()]
    );
    hba1cTests = [{ id: created.id }];
  }

  for (const hba1cTest of hba1cTests) {
    await run(
      "UPDATE tests SET sample_type = ?, turnaround_hours = ?, active = 1 WHERE id = ?",
      ["Blood", 24, hba1cTest.id]
    );

    const parameter = await get(
      `SELECT id FROM test_parameters
       WHERE test_id = ? AND LOWER(parameter_name) IN (LOWER(?), LOWER(?), LOWER(?), LOWER(?), LOWER(?))
       ORDER BY display_order ASC, id ASC LIMIT 1`,
      [
        hba1cTest.id,
        "Glycosylated Hemoglobin, HbA1c",
        "Glycosylated Haemoglobin, HbA1c",
        "Glycated Hemoglobin, HbA1c",
        "HbA1c",
        "Result",
      ]
    ) || await get(
      "SELECT id FROM test_parameters WHERE test_id = ? ORDER BY display_order ASC, id ASC LIMIT 1",
      [hba1cTest.id]
    );

    if (parameter) {
      await run(
        `UPDATE test_parameters
         SET parameter_name = ?, unit = ?, normal_range = ?, display_order = 1
         WHERE id = ?`,
        ["Glycosylated Hemoglobin, HbA1c", "%", "< 5.70", parameter.id]
      );
      continue;
    }

    await run(
      `INSERT INTO test_parameters (test_id, parameter_name, unit, normal_range, display_order)
       VALUES (?, ?, ?, ?, 1)`,
      [hba1cTest.id, "Glycosylated Hemoglobin, HbA1c", "%", "< 5.70"]
    );
  }
}

async function ensureSingleParameterTestConfiguration({
  names,
  createName,
  createCode,
  category,
  sampleType,
  turnaroundHours,
  parameterName,
  parameterAliases = [],
  unit,
  normalRange,
}) {
  const placeholders = names.map(() => "LOWER(?)").join(", ");
  let tests = await all(
    `SELECT id FROM tests WHERE LOWER(name) IN (${placeholders}) ORDER BY id ASC`,
    names
  );

  // A prior startup can create the test before it reaches this configuration
  // step. Reuse that record by its unique code as well, so database startup is
  // safe to rerun after an interrupted initialization.
  if (!tests.length && String(createCode || "").trim()) {
    tests = await all(
      "SELECT id FROM tests WHERE UPPER(COALESCE(code, '')) = UPPER(?) ORDER BY id ASC",
      [String(createCode).trim()]
    );
  }

  if (!tests.length) {
    const created = await run(
      `INSERT INTO tests (name, code, category, sample_type, price, turnaround_hours, active, created_at)
       VALUES (?, ?, ?, ?, 0, ?, 1, ?)`,
      [createName, createCode, category, sampleType, turnaroundHours, buildNow()]
    );
    tests = [{ id: created.id }];
  }

  for (const test of tests) {
    await run(
      "UPDATE tests SET sample_type = ?, turnaround_hours = ?, active = 1 WHERE id = ?",
      [sampleType, turnaroundHours, test.id]
    );

    const parameterNames = [parameterName, ...parameterAliases, "Result"];
    const parameterPlaceholders = parameterNames.map(() => "LOWER(?)").join(", ");
    const parameter = await get(
      `SELECT id FROM test_parameters
       WHERE test_id = ? AND LOWER(parameter_name) IN (${parameterPlaceholders})
       ORDER BY display_order ASC, id ASC LIMIT 1`,
      [test.id, ...parameterNames]
    ) || await get(
      "SELECT id FROM test_parameters WHERE test_id = ? ORDER BY display_order ASC, id ASC LIMIT 1",
      [test.id]
    );

    if (parameter) {
      await run(
        `UPDATE test_parameters
         SET parameter_name = ?, unit = ?, normal_range = ?, display_order = 1
         WHERE id = ?`,
        [parameterName, unit, normalRange, parameter.id]
      );
      continue;
    }

    await run(
      `INSERT INTO test_parameters (test_id, parameter_name, unit, normal_range, display_order)
       VALUES (?, ?, ?, ?, 1)`,
      [test.id, parameterName, unit, normalRange]
    );
  }
}

async function ensureReportTableTestConfiguration({
  names,
  createName,
  createCode,
  category,
  sampleType,
  turnaroundHours,
  parameters,
}) {
  const placeholders = names.map(() => "LOWER(?)").join(", ");
  let tests = await all(
    `SELECT id FROM tests WHERE LOWER(name) IN (${placeholders}) ORDER BY id ASC`,
    names
  );

  // See the matching safeguard in ensureSingleParameterTestConfiguration.
  // Test codes are unique, so they are the reliable fallback for a partially
  // completed or repeated database initialization.
  if (!tests.length && String(createCode || "").trim()) {
    tests = await all(
      "SELECT id FROM tests WHERE UPPER(COALESCE(code, '')) = UPPER(?) ORDER BY id ASC",
      [String(createCode).trim()]
    );
  }

  if (!tests.length) {
    const created = await run(
      `INSERT INTO tests (name, code, category, sample_type, price, turnaround_hours, active, created_at)
       VALUES (?, ?, ?, ?, 0, ?, 1, ?)`,
      [createName, createCode, category, sampleType, turnaroundHours, buildNow()]
    );
    tests = [{ id: created.id }];
  }

  for (const test of tests) {
    await run(
      "UPDATE tests SET sample_type = ?, turnaround_hours = ?, active = 1 WHERE id = ?",
      [sampleType, turnaroundHours, test.id]
    );

    for (const [index, definition] of parameters.entries()) {
      const parameterNames = [definition.name, ...(definition.aliases || [])];
      if (index === 0) parameterNames.push("Result");
      const parameterPlaceholders = parameterNames.map(() => "LOWER(?)").join(", ");
      const parameter = await get(
        `SELECT id FROM test_parameters
         WHERE test_id = ? AND LOWER(parameter_name) IN (${parameterPlaceholders})
         ORDER BY display_order ASC, id ASC LIMIT 1`,
        [test.id, ...parameterNames]
      );

      if (parameter) {
        const entryMode = definition.entryMode === "calculated" ? "calculated" : "manual";
        const formula = entryMode === "calculated" ? (definition.formula || null) : null;
        const precision = Number.isInteger(definition.precision) ? definition.precision : null;
        await run(
          `UPDATE test_parameters
           SET parameter_name = ?, unit = ?, normal_range = ?, entry_mode = ?, calculation_formula = ?, calculation_precision = ?, display_order = ?
           WHERE id = ?`,
          [definition.name, definition.unit || "", definition.normalRange || "", entryMode, formula, precision, index + 1, parameter.id]
        );
      } else {
        const entryMode = definition.entryMode === "calculated" ? "calculated" : "manual";
        const formula = entryMode === "calculated" ? (definition.formula || null) : null;
        const precision = Number.isInteger(definition.precision) ? definition.precision : null;
        await run(
          `INSERT INTO test_parameters (test_id, parameter_name, unit, normal_range, entry_mode, calculation_formula, calculation_precision, display_order)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [test.id, definition.name, definition.unit || "", definition.normalRange || "", entryMode, formula, precision, index + 1]
        );
      }
    }
  }
}

async function ensureReferencedReportTestConfigurations() {
  await ensureReportTableTestConfiguration({
    names: ["Beta 2 Glycoprotein I Panel", "Beta-2 Glycoprotein I Panel", "Beta-2 Glycoprotein I (B2GPI) Antibody"],
    createName: "Beta 2 Glycoprotein I Panel",
    createCode: "PF054",
    category: "Immunology",
    sampleType: "Serum (2 ml)",
    turnaroundHours: 24,
    parameters: [
      { name: "Beta 2 Glycoprotein IgG", aliases: ["Beta-2 Glycoprotein IgG", "B2GPI IgG"], unit: "SGU", normalRange: "< 20.00", entryMode: "manual" },
      { name: "Beta 2 Glycoprotein IgM", aliases: ["Beta-2 Glycoprotein IgM", "B2GPI IgM"], unit: "SMU", normalRange: "< 20.00", entryMode: "manual" },
      { name: "Beta 2 Glycoprotein IgA", aliases: ["Beta-2 Glycoprotein IgA", "B2GPI IgA"], unit: "SAU", normalRange: "< 20.00", entryMode: "manual" },
    ],
  });

  await ensureReportTableTestConfiguration({
    names: ["Toxoplasma Antibodies Panel", "Toxoplasma Antibody Panel", "Toxoplasma IgG IgM"],
    createName: "Toxoplasma Antibodies Panel",
    createCode: "TOXO001",
    category: "Immunology",
    sampleType: "Serum (2 ml)",
    turnaroundHours: 1,
    parameters: [
      { name: "Toxoplasma IgG", aliases: ["Toxo IgG"], unit: "IU/mL", normalRange: "< 1.60", entryMode: "manual" },
      { name: "Toxoplasma IgM", aliases: ["Toxo IgM"], unit: "Index", normalRange: "< 0.50", entryMode: "manual" },
    ],
  });

  await ensureReportTableTestConfiguration({
    names: ["Rheumatoid Factor, RA", "Rheumatoid Factor (RA)", "Rheumatoid Factor", "RF"],
    createName: "Rheumatoid Factor, RA",
    createCode: "RF001",
    category: "Immunology",
    sampleType: "Serum",
    turnaroundHours: 24,
    parameters: [
      { name: "Rheumatoid Factor, RA, Serum", aliases: ["Rheumatoid Factor", "RF"], unit: "IU/mL", normalRange: "0 - 18.00", entryMode: "manual" },
    ],
  });

  await ensureReportTableTestConfiguration({
    names: ["Antistreptolysin O, ASO Titer", "Antistreptolysin O (ASO) Titer", "ASO Titer", "ASO"],
    createName: "Antistreptolysin O, ASO Titer",
    createCode: "ASO001",
    category: "Immunology",
    sampleType: "Serum",
    turnaroundHours: 24,
    parameters: [
      { name: "Antistreptolysin O, ASO Titer, Serum", aliases: ["Antistreptolysin O", "ASO Titer", "ASO"], unit: "IU/mL", normalRange: "0 - 200.00", entryMode: "manual" },
    ],
  });

  await ensureReportTableTestConfiguration({
    names: ["High-Sensitivity C-Reactive Protein (hs-CRP)", "High Sensitivity C-Reactive Protein (hs-CRP)", "hs-CRP", "hsCRP"],
    createName: "High-Sensitivity C-Reactive Protein (hs-CRP)",
    createCode: "PF053",
    category: "Immunology",
    sampleType: "Serum (1 ml)",
    turnaroundHours: 24,
    parameters: [
      { name: "hsCRP", aliases: ["hs-CRP", "High Sensitivity C-Reactive Protein"], unit: "mg/L", normalRange: "< 1.00", entryMode: "manual" },
    ],
  });
}

async function ensureAdditionalClinicalPathologyReportTestConfigurations() {
  await ensureReportTableTestConfiguration({
    names: ["Semen Analysis - Seminogram", "Semen Analysis", "Seminogram"],
    createName: "Semen Analysis - Seminogram",
    createCode: "SEMEN001",
    category: "Clinical Pathology",
    sampleType: "Semen",
    turnaroundHours: 1,
    parameters: [
      { name: "Time of Specimen", unit: "", normalRange: "", entryMode: "manual" },
      { name: "Time of Examination", unit: "", normalRange: "", entryMode: "manual" },
      { name: "Duration of Abstinence", unit: "days", normalRange: "2 - 7", entryMode: "manual" },
      { name: "Liquefaction at 37 °C", aliases: ["Liquefaction at 37 C"], unit: "minutes", normalRange: "30 - 60", entryMode: "manual" },
      { name: "Volume", unit: "mL", normalRange: "> 1.5", entryMode: "manual" },
      { name: "Appearance", unit: "", normalRange: "", entryMode: "manual" },
      { name: "Colour", aliases: ["Color"], unit: "", normalRange: "", entryMode: "manual" },
      { name: "Viscosity", unit: "", normalRange: "", entryMode: "manual" },
      { name: "pH", unit: "", normalRange: "", entryMode: "manual" },
      { name: "Total Sperm Concentration", unit: "Million/mL", normalRange: "> 15", entryMode: "manual" },
      { name: "Percentage Motility", unit: "%", normalRange: "> 50", entryMode: "manual" },
      { name: "Grade A", unit: "%", normalRange: "Fast progressive", entryMode: "manual" },
      { name: "Grade B", unit: "%", normalRange: "Slow progressive", entryMode: "manual" },
      { name: "Grade C", unit: "%", normalRange: "Immotile", entryMode: "manual" },
      { name: "Vitality", unit: "%", normalRange: "> 58 %", entryMode: "manual" },
      { name: "Agglutination", unit: "", normalRange: "Negative", entryMode: "manual" },
      { name: "Pus Cells", unit: "/hpf", normalRange: "Nil", entryMode: "manual" },
      { name: "Red Blood Cells", unit: "/hpf", normalRange: "Nil", entryMode: "manual" },
      { name: "Epithelial Cells", unit: "/hpf", normalRange: "Nil", entryMode: "manual" },
      { name: "Normal Morphology", unit: "%", normalRange: "70 - 75", entryMode: "manual" },
      { name: "Abnormal Morphology", unit: "%", normalRange: "25 - 30", entryMode: "manual" },
      { name: "a. Head Defects", aliases: ["Head Defects"], unit: "%", normalRange: "10 - 15", entryMode: "manual" },
      { name: "b. Neck & Mid Piece", aliases: ["Neck & Mid Piece", "Neck & mid piece"], unit: "%", normalRange: "5 - 10", entryMode: "manual" },
      { name: "c. Tail Defects", aliases: ["Tail Defects"], unit: "%", normalRange: "10 - 15", entryMode: "manual" },
      { name: "Semen Fructose, Qualitative", aliases: ["Semen Fructose"], unit: "", normalRange: "", entryMode: "manual" },
    ],
  });

  await ensureReportTableTestConfiguration({
    names: ["Urine Cotinine", "Cotinine, Urine", "Cotinine Urine"],
    createName: "Urine Cotinine",
    createCode: "PF056",
    category: "Clinical Pathology",
    sampleType: "Urine",
    turnaroundHours: 24,
    parameters: [
      { name: "Cotinine, Urine", aliases: ["Urine Cotinine", "Cotinine"], unit: "ng/mL", normalRange: "Smokers 300.00 - 1300.00; Non-smoker <= 10.00", entryMode: "manual" },
    ],
  });

  await ensureReportTableTestConfiguration({
    names: ["Urine Glucose", "Glucose, Urine"],
    createName: "Urine Glucose",
    createCode: "PF055",
    category: "Clinical Pathology",
    sampleType: "Urine",
    turnaroundHours: 8,
    parameters: [
      { name: "Glucose, Urine", aliases: ["Urine Glucose", "Glucose"], unit: "", normalRange: "", entryMode: "manual" },
    ],
  });

  await ensureReportTableTestConfiguration({
    names: ["Porphyrins", "Blood Porphyrins"],
    createName: "Porphyrins",
    createCode: "PORPHY001",
    category: "Biochemistry",
    sampleType: "Blood (3 ml)",
    turnaroundHours: 4,
    parameters: [
      { name: "Total Porphyrin", unit: "mcg/dL", normalRange: "0 - 1.0", entryMode: "manual" },
      { name: "Coproporphyrin", unit: "mcg/dL", normalRange: "< 2.0", entryMode: "manual" },
      { name: "Protoporphyrin (PROTO)", aliases: ["Protoporphyrin", "PROTO"], unit: "mcg/dL", normalRange: "16.0 - 60.0", entryMode: "manual" },
      { name: "Uroporphyrin", unit: "mcg/dL", normalRange: "< 2.0", entryMode: "manual" },
    ],
  });

  await ensureReportTableTestConfiguration({
    names: ["Occult Blood Stool Examination", "Stool Examination, Occult Blood", "Occult Blood, Stool", "Occult Blood"],
    createName: "Occult Blood Stool Examination",
    createCode: "OCCULT001",
    category: "Clinical Pathology",
    sampleType: "Stool",
    turnaroundHours: 24,
    parameters: [
      { name: "Stool Examination, Occult Blood", aliases: ["Occult Blood, Stool", "Occult Blood"], unit: "", normalRange: "Absent", entryMode: "manual" },
    ],
  });

  await ensureReportTableTestConfiguration({
    names: ["Cerebrospinal Fluid (CSF) Analysis", "CSF Analysis", "Cerebrospinal Fluid Analysis"],
    createName: "Cerebrospinal Fluid (CSF) Analysis",
    createCode: "CSF001",
    category: "Clinical Pathology",
    sampleType: "CSF",
    turnaroundHours: 4,
    parameters: [
      { name: "Volume", unit: "ml", normalRange: "", entryMode: "manual" },
      { name: "Colour", aliases: ["Color"], unit: "", normalRange: "", entryMode: "manual" },
      { name: "Turbidity", unit: "", normalRange: "", entryMode: "manual" },
      { name: "Coagulum", unit: "", normalRange: "", entryMode: "manual" },
      { name: "Blood", unit: "", normalRange: "", entryMode: "manual" },
      { name: "Deposits", unit: "", normalRange: "", entryMode: "manual" },
      { name: "Glucose", unit: "mg/dL", normalRange: "40.00 - 70.00", entryMode: "manual" },
      { name: "Chloride", unit: "mEq/L", normalRange: "101.00 - 109.00", entryMode: "manual" },
      { name: "Total Protein", unit: "mg/dL", normalRange: "15.00 - 45.00", entryMode: "manual" },
      { name: "Cell Count", aliases: ["Cell count"], unit: "/mm3", normalRange: "< 4.00", entryMode: "manual" },
      { name: "Neutrophils", unit: "%", normalRange: "0.00 - 3.00", entryMode: "manual" },
      { name: "Lymphocytes", unit: "%", normalRange: "40.00 - 80.00", entryMode: "manual" },
      { name: "Eosinophils", unit: "%", normalRange: "0.00 - 1.00", entryMode: "manual" },
      { name: "Monocytes", unit: "%", normalRange: "0.00 - 2.00", entryMode: "manual" },
      { name: "Basophils", unit: "%", normalRange: "0.00", entryMode: "manual" },
      { name: "Degenerated Cells", aliases: ["Degenerated cells"], unit: "", normalRange: "", entryMode: "manual" },
      { name: "Atypical Cells", aliases: ["Atypical cells"], unit: "", normalRange: "", entryMode: "manual" },
    ],
  });

  await ensureReportTableTestConfiguration({
    names: ["Thyroid Stimulating Hormone (TSH)", "TSH (Thyroid Stimulating Hormone)", "TSH", "TSH, Serum"],
    createName: "Thyroid Stimulating Hormone (TSH)",
    createCode: "TSH001",
    category: "Endocrinology",
    sampleType: "Serum",
    turnaroundHours: 24,
    parameters: [
      { name: "TSH, Serum", aliases: ["TSH", "Thyroid Stimulating Hormone"], unit: "mU/L", normalRange: "0.40 - 4.00", entryMode: "manual" },
    ],
  });

  // The imported hormone catalogue uses these FT3/FT4/TSH names.  Give each
  // test its real report fields instead of leaving the import placeholder
  // ("Result", N/A) in place, which otherwise produces an empty report.
  await ensureReportTableTestConfiguration({
    names: ["FT4 (Free Thyroxine)", "FT4", "Free T4", "Free Thyroxine"],
    createName: "FT4 (Free Thyroxine)",
    createCode: "FT4001",
    category: "Endocrinology",
    sampleType: "Serum",
    turnaroundHours: 24,
    parameters: [
      { name: "FT4, Serum", aliases: ["FT4", "Free T4", "Free Thyroxine", "Result"], unit: "ng/dL", normalRange: "0.90 - 1.70", entryMode: "manual" },
    ],
  });

  await ensureReportTableTestConfiguration({
    names: ["FT3 (Free Tri-iodothyronine)", "FT3", "Free T3", "Free Tri-iodothyronine"],
    createName: "FT3 (Free Tri-iodothyronine)",
    createCode: "FT3001",
    category: "Endocrinology",
    sampleType: "Serum",
    turnaroundHours: 24,
    parameters: [
      { name: "FT3, Serum", aliases: ["FT3", "Free T3", "Free Tri-iodothyronine", "Result"], unit: "pg/mL", normalRange: "2.00 - 4.40", entryMode: "manual" },
    ],
  });

  await ensureReportTableTestConfiguration({
    names: ["FT3 & TSH", "FT3 and TSH"],
    createName: "FT3 & TSH",
    createCode: "FT3TSH001",
    category: "Endocrinology",
    sampleType: "Serum",
    turnaroundHours: 24,
    parameters: [
      { name: "FT3, Serum", aliases: ["FT3", "Free T3", "Free Tri-iodothyronine", "Result"], unit: "pg/mL", normalRange: "2.00 - 4.40", entryMode: "manual" },
      { name: "TSH, Serum", aliases: ["TSH", "Thyroid Stimulating Hormone"], unit: "mU/L", normalRange: "0.40 - 4.00", entryMode: "manual" },
    ],
  });

  await ensureReportTableTestConfiguration({
    names: ["FT4 & TSH", "FT4 and TSH"],
    createName: "FT4 & TSH",
    createCode: "FT4TSH001",
    category: "Endocrinology",
    sampleType: "Serum",
    turnaroundHours: 24,
    parameters: [
      { name: "FT4, Serum", aliases: ["FT4", "Free T4", "Free Thyroxine", "Result"], unit: "ng/dL", normalRange: "0.90 - 1.70", entryMode: "manual" },
      { name: "TSH, Serum", aliases: ["TSH", "Thyroid Stimulating Hormone"], unit: "mU/L", normalRange: "0.40 - 4.00", entryMode: "manual" },
    ],
  });

  await ensureReportTableTestConfiguration({
    names: ["FT3, FT4 & TSH", "FT3, FT4 and TSH"],
    createName: "FT3, FT4 & TSH",
    createCode: "FT3FT4TSH001",
    category: "Endocrinology",
    sampleType: "Serum",
    turnaroundHours: 24,
    parameters: [
      { name: "FT3, Serum", aliases: ["FT3", "Free T3", "Free Tri-iodothyronine", "Result"], unit: "pg/mL", normalRange: "2.00 - 4.40", entryMode: "manual" },
      { name: "FT4, Serum", aliases: ["FT4", "Free T4", "Free Thyroxine"], unit: "ng/dL", normalRange: "0.90 - 1.70", entryMode: "manual" },
      { name: "TSH, Serum", aliases: ["TSH", "Thyroid Stimulating Hormone"], unit: "mU/L", normalRange: "0.40 - 4.00", entryMode: "manual" },
    ],
  });

  await ensureReportTableTestConfiguration({
    names: ["Thyroid Profile", "Thyroid Function Test", "Thyroid Function Profile"],
    createName: "Thyroid Profile",
    createCode: "THYPRO001",
    category: "Endocrinology",
    sampleType: "Serum (2 ml)",
    turnaroundHours: 24,
    parameters: [
      { name: "T3, Total", aliases: ["T3 Total", "Total T3", "Triiodothyronine (T3)"], unit: "ng/dL", normalRange: "80.00 - 200.00", entryMode: "manual" },
      { name: "T4, Total", aliases: ["T4 Total", "Total T4", "Thyroxine (T4)"], unit: "mcg/dL", normalRange: "4.50 - 12.50", entryMode: "manual" },
      { name: "TSH", aliases: ["TSH, Serum", "Thyroid Stimulating Hormone"], unit: "mU/L", normalRange: "0.40 - 4.00", entryMode: "manual" },
    ],
  });

  await ensureReportTableTestConfiguration({
    names: ["Thyroid Antibody Profile", "Thyroid Antibodies", "Thyroid Antibodies Panel"],
    createName: "Thyroid Antibody Profile",
    createCode: "PF059",
    category: "Endocrinology",
    sampleType: "Serum",
    turnaroundHours: 24,
    parameters: [
      { name: "Anti - Tg, Serum", aliases: ["Anti Tg, Serum", "Anti Thyroglobulin Antibody", "Anti Tg (Anti Thyroglobulin)"], unit: "U/mL", normalRange: "< 60.00", entryMode: "manual" },
      { name: "Anti TPO, Serum", aliases: ["Anti Thyroid Peroxidase Antibody", "Anti TPO (Anti Thyroid Peroxidase)"], unit: "U/mL", normalRange: "< 60.00", entryMode: "manual" },
    ],
  });

  await ensureReportTableTestConfiguration({
    names: ["Triiodothyronine (T3), Total", "Triiodothyronine (T3) Total", "T3, Total"],
    createName: "Triiodothyronine (T3), Total",
    createCode: "T3TOTAL001",
    category: "Endocrinology",
    sampleType: "Serum",
    turnaroundHours: 24,
    parameters: [
      { name: "T3, Total, Serum", aliases: ["T3, Total", "T3 Total", "Total T3", "Triiodothyronine (T3)"], unit: "ng/dL", normalRange: "80.00 - 200.00", entryMode: "manual" },
    ],
  });

  await ensureReportTableTestConfiguration({
    names: ["Testosterone, Total", "Total Testosterone", "Testosterone"],
    createName: "Testosterone, Total",
    createCode: "TESTO001",
    category: "Endocrinology",
    sampleType: "Serum",
    turnaroundHours: 24,
    parameters: [
      { name: "Testosterone, Total", aliases: ["Total Testosterone", "Testosterone"], unit: "ng/dL", normalRange: "300.00 - 1000.00", entryMode: "manual" },
    ],
  });

  await ensureReportTableTestConfiguration({
    names: ["Progesterone", "Progesterone, Serum"],
    createName: "Progesterone",
    createCode: "PROG001",
    category: "Endocrinology",
    sampleType: "Serum",
    turnaroundHours: 24,
    parameters: [
      { name: "Progesterone, Serum", aliases: ["Progesterone"], unit: "ng/mL", normalRange: "< 0.20", entryMode: "manual" },
    ],
  });

  await ensureReportTableTestConfiguration({
    names: ["Cortisone", "Cortisone, Serum"],
    createName: "Cortisone",
    createCode: "CORTISONE001",
    category: "Endocrinology",
    sampleType: "Serum",
    turnaroundHours: 24,
    parameters: [
      { name: "Cortisone, Serum", aliases: ["Cortisone"], unit: "nmol/L", normalRange: "16.62 - 74.79", entryMode: "manual" },
    ],
  });

  await ensureReportTableTestConfiguration({
    names: ["HCG, Beta, Total, Pregnancy", "HCG, Beta, Total", "Beta HCG, Total", "Beta hCG Total"],
    createName: "HCG, Beta, Total, Pregnancy",
    createCode: "BETAHCG001",
    category: "Endocrinology",
    sampleType: "Serum",
    turnaroundHours: 24,
    parameters: [
      { name: "HCG, Beta, Total, Serum", aliases: ["HCG, Beta, Total", "Beta HCG, Total", "Beta hCG Total"], unit: "mIU/mL", normalRange: "< 5.00", entryMode: "manual" },
    ],
  });

  await ensureReportTableTestConfiguration({
    names: ["Prolactin (PRL)", "Prolactin", "Prolactin, Serum"],
    createName: "Prolactin (PRL)",
    createCode: "PRL001",
    category: "Endocrinology",
    sampleType: "Serum",
    turnaroundHours: 24,
    parameters: [
      { name: "Prolactin, Serum", aliases: ["Prolactin (PRL)", "Prolactin", "PRL"], unit: "ng/mL", normalRange: "2.10 - 17.70", entryMode: "manual" },
    ],
  });

  await ensureReportTableTestConfiguration({
    names: ["Dehydroepiandrosterone (DHEA)", "Dehydroepiandrosterone", "DHEA", "DHEA, Serum"],
    createName: "Dehydroepiandrosterone (DHEA)",
    createCode: "DHEA001",
    category: "Endocrinology",
    sampleType: "Serum",
    turnaroundHours: 24,
    parameters: [
      { name: "DHEA, Serum", aliases: ["Dehydroepiandrosterone (DHEA)", "Dehydroepiandrosterone", "DHEA"], unit: "ng/mL", normalRange: "0.52 - 5.18", entryMode: "manual" },
    ],
  });

  await ensureReportTableTestConfiguration({
    names: ["Estradiol (E2)", "Estradiol", "Estradiol, Serum"],
    createName: "Estradiol (E2)",
    createCode: "E2001",
    category: "Endocrinology",
    sampleType: "Serum",
    turnaroundHours: 24,
    parameters: [
      { name: "Estradiol (E2), Serum", aliases: ["Estradiol (E2)", "Estradiol, Serum", "Estradiol", "E2"], unit: "pg/mL", normalRange: "< 39.80", entryMode: "manual" },
    ],
  });

  await ensureReportTableTestConfiguration({
    names: ["Luteinizing Hormone (LH)", "Luteinising Hormone (LH)", "Luteinizing Hormone", "Luteinising Hormone", "LH"],
    createName: "Luteinizing Hormone (LH)",
    createCode: "PF060",
    category: "Endocrinology",
    sampleType: "Serum",
    turnaroundHours: 24,
    parameters: [
      { name: "Luteinising Hormone (LH), Serum", aliases: ["Luteinizing Hormone (LH), Serum", "Luteinising Hormone (LH)", "Luteinizing Hormone (LH)", "LH"], unit: "mIU/mL", normalRange: "1.50 - 9.30", entryMode: "manual" },
    ],
  });

  await ensureReportTableTestConfiguration({
    names: ["Follicle Stimulating Hormone (FSH)", "Follicle-Stimulating Hormone (FSH)", "FSH"],
    createName: "Follicle Stimulating Hormone (FSH)",
    createCode: "FSH001",
    category: "Endocrinology",
    sampleType: "Serum",
    turnaroundHours: 24,
    parameters: [
      { name: "Follicle Stimulating Hormone (FSH), Serum", aliases: ["Follicle-Stimulating Hormone (FSH), Serum", "Follicle Stimulating Hormone (FSH)", "Follicle-Stimulating Hormone (FSH)", "FSH"], unit: "mIU/mL", normalRange: "1.40 - 18.10", entryMode: "manual" },
    ],
  });

  await ensureReportTableTestConfiguration({
    names: ["Thyroxine (T4), Total", "Thyroxine (T4) Total", "T4, Total", "T4 Total"],
    createName: "Thyroxine (T4), Total",
    createCode: "T4TOTAL001",
    category: "Endocrinology",
    sampleType: "Serum",
    turnaroundHours: 24,
    parameters: [
      { name: "T4, Total, Serum", aliases: ["T4, Total", "T4 Total", "Total T4", "Thyroxine (T4), Total"], unit: "mcg/dL", normalRange: "4.50 - 12.50", entryMode: "manual" },
    ],
  });

  await ensureReportTableTestConfiguration({
    names: ["Calcitonin", "Calcitonin, Serum", "Calsitonin"],
    createName: "Calcitonin",
    createCode: "CALCITONIN001",
    category: "Endocrinology",
    sampleType: "Serum",
    turnaroundHours: 24,
    parameters: [
      { name: "Calcitonin, Serum", aliases: ["Calcitonin"], unit: "pg/mL", normalRange: "0.00 - 10.00", entryMode: "manual" },
    ],
  });

  await ensureReportTableTestConfiguration({
    names: ["Inhibin A", "Inhibin A, Reproductive Marker", "Inhibin A, Serum"],
    createName: "Inhibin A",
    createCode: "PF062",
    category: "Endocrinology",
    sampleType: "Serum (1 ml)",
    turnaroundHours: 24,
    parameters: [
      { name: "Inhibin A, Reproductive Marker", aliases: ["Inhibin A", "Inhibin A, Serum"], unit: "pg/mL", normalRange: "", entryMode: "manual" },
    ],
  });

  await ensureReportTableTestConfiguration({
    names: ["Inhibin B", "Inhibin B, Serum"],
    createName: "Inhibin B",
    createCode: "PF063",
    category: "Endocrinology",
    sampleType: "Serum (1 ml)",
    turnaroundHours: 48,
    parameters: [
      { name: "Inhibin B", aliases: ["Inhibin B, Serum"], unit: "pg/mL", normalRange: "151.70 - 173.90", entryMode: "manual" },
    ],
  });

  await ensureReportTableTestConfiguration({
    names: ["PAPP-A", "PAPP-A, Serum", "Pregnancy Associated Plasma Protein-A"],
    createName: "PAPP-A",
    createCode: "PF061",
    category: "Endocrinology",
    sampleType: "Serum (1 ml)",
    turnaroundHours: 24,
    parameters: [
      { name: "Weeks of Gestation", aliases: ["Gestation Weeks", "Pregnancy Weeks"], unit: "weeks", normalRange: "", entryMode: "manual" },
      { name: "PAPP-A", aliases: ["PAPP-A, Serum", "Pregnancy Associated Plasma Protein-A"], unit: "mIU/mL", normalRange: "", entryMode: "manual" },
    ],
  });

  await ensureReportTableTestConfiguration({
    names: ["Dehydroepiandrosterone Sulphate (DHEAS)", "Dehydroepiandrosterone Sulfate (DHEAS)", "DHEAS", "DHEAS, Serum"],
    createName: "Dehydroepiandrosterone Sulphate (DHEAS)",
    createCode: "DHEAS001",
    category: "Endocrinology",
    sampleType: "Serum",
    turnaroundHours: 24,
    parameters: [
      { name: "DHEAS, Serum", aliases: ["DHEAS", "Dehydroepiandrosterone Sulphate (DHEAS)", "Dehydroepiandrosterone Sulfate (DHEAS)"], unit: "µg/dL", normalRange: "167.90 - 591.90", entryMode: "manual" },
    ],
  });

  const histopathologyParameters = [
    { name: "Clinical Data", aliases: ["Clinical History"], unit: "", normalRange: "", entryMode: "manual" },
    { name: "Specimen", unit: "", normalRange: "", entryMode: "manual" },
    { name: "Diagnosis", aliases: ["Final Diagnosis"], unit: "", normalRange: "", entryMode: "manual" },
    { name: "Note", aliases: ["Comment"], unit: "", normalRange: "", entryMode: "manual" },
    { name: "Gross Description", unit: "", normalRange: "", entryMode: "manual" },
    { name: "Microscopic Description", unit: "", normalRange: "", entryMode: "manual" },
  ];

  await ensureReportTableTestConfiguration({
    names: ["Prostate Biopsy", "Histopathology Prostate Biopsy"],
    createName: "Prostate Biopsy",
    createCode: "PF057",
    category: "Histopathology",
    sampleType: "Tissue",
    turnaroundHours: 72,
    parameters: histopathologyParameters,
  });

  await ensureReportTableTestConfiguration({
    names: ["Liver Biopsy", "Histopathology Liver Biopsy"],
    createName: "Liver Biopsy",
    createCode: "PF058",
    category: "Histopathology",
    sampleType: "Tissue",
    turnaroundHours: 72,
    parameters: histopathologyParameters,
  });

  await ensureReportTableTestConfiguration({
    names: ["Histopathology Skin Biopsy", "Skin Biopsy"],
    createName: "Histopathology Skin Biopsy",
    createCode: "SKINBIO001",
    category: "Histopathology",
    sampleType: "Tissue",
    turnaroundHours: 72,
    parameters: histopathologyParameters,
  });

  await ensureReportTableTestConfiguration({
    names: ["Histopathology Colonoscopy with Polypectomy Biopsy", "Colonoscopy with Polypectomy Biopsy"],
    createName: "Histopathology Colonoscopy with Polypectomy Biopsy",
    createCode: "COLONBIO001",
    category: "Histopathology",
    sampleType: "Tissue",
    turnaroundHours: 72,
    parameters: histopathologyParameters,
  });

  const fnacParameters = [
    { name: "Specimen", unit: "", normalRange: "", entryMode: "manual" },
    { name: "Clinical History", aliases: ["Clinical Data"], unit: "", normalRange: "", entryMode: "manual" },
    { name: "Gross", aliases: ["Gross Description"], unit: "", normalRange: "", entryMode: "manual" },
    { name: "Microscopic", aliases: ["Microscopic Description"], unit: "", normalRange: "", entryMode: "manual" },
    { name: "Impression", unit: "", normalRange: "", entryMode: "manual" },
    { name: "Advised", aliases: ["Advice"], unit: "", normalRange: "", entryMode: "manual" },
    { name: "Note", unit: "", normalRange: "", entryMode: "manual" },
    { name: "Comments", aliases: ["Comment"], unit: "", normalRange: "", entryMode: "manual" },
  ];

  await ensureReportTableTestConfiguration({
    names: [
      "Fine Needle Aspiration Cytology (FNAC)",
      "Fine Needle Aspiration Cytology",
      "FNAC Breast",
      "FNAC Cervical",
      "FNAC Deep Origin",
      "FNAC Forehead",
      "FNAC Liver",
      "FNAC Mandible",
      "FNAC Neck",
      "FNAC Pancreas",
      "FNAC Smear for Reporting",
      "FNAC Subcutaneous Swelling",
      "FNAC Subcutaneus Swelling",
      "FNAC Submandibular",
      "FNAC Supraclavicular Lymph",
      "FNAC Thyroid Gland",
    ],
    createName: "Fine Needle Aspiration Cytology (FNAC)",
    createCode: "FNAC001",
    category: "Cytology",
    sampleType: "FNAC / Aspiration",
    turnaroundHours: 24,
    parameters: fnacParameters,
  });

  await ensureReportTableTestConfiguration({
    names: ["PAP Smear", "Pap Smear Examination", "Cytology, Pap Smear Examination"],
    createName: "PAP Smear",
    createCode: "PAPSMEAR001",
    category: "Cytology",
    sampleType: "ThinPrep",
    turnaroundHours: 24,
    parameters: [
      { name: "Specimen", unit: "", normalRange: "", entryMode: "manual" },
      { name: "Pap Diagnosis", aliases: ["Diagnosis"], unit: "", normalRange: "", entryMode: "manual" },
      { name: "High Risk HPV Result", aliases: ["High Risk HPV"], unit: "", normalRange: "", entryMode: "manual" },
      { name: "Chlamydia Trachomatis Results", aliases: ["Chlamydia Trachomatis"], unit: "", normalRange: "", entryMode: "manual" },
      { name: "Neisseria Gonorrhoeae Results", aliases: ["Neisseria Gonorrhoeae"], unit: "", normalRange: "", entryMode: "manual" },
      { name: "Trichomonas Vaginalis Results", aliases: ["Trichomonas Vaginalis"], unit: "", normalRange: "", entryMode: "manual" },
      { name: "Specimen Adequacy", unit: "", normalRange: "", entryMode: "manual" },
      { name: "Additional Cytologic Findings", aliases: ["Cytologic Findings"], unit: "", normalRange: "", entryMode: "manual" },
      { name: "Comments", aliases: ["Comment"], unit: "", normalRange: "", entryMode: "manual" },
    ],
  });
}

async function ensureVitaminDTestConfiguration() {
  await ensureSingleParameterTestConfiguration({
    names: ["25-OH Vitamin D", "Vitamin D Total - 25 OH", "Vitamin D, 25 - Hydroxy"],
    createName: "Vitamin D, 25 - Hydroxy",
    createCode: "VITD25OH",
    category: "Biochemistry",
    sampleType: "Serum",
    turnaroundHours: 24,
    parameterName: "Vitamin D, 25 - Hydroxy, Serum",
    parameterAliases: ["25-OH Vitamin D", "Vitamin D Total - 25 OH"],
    unit: "nmol/L",
    normalRange: "75.00 - 250.00",
  });
}

async function ensureVitaminCTestConfiguration() {
  await ensureSingleParameterTestConfiguration({
    names: ["Vitamin C", "Vitamin C (Ascorbic Acid)"],
    createName: "Vitamin C",
    createCode: "VITC",
    category: "Biochemistry",
    sampleType: "Serum",
    turnaroundHours: 24,
    parameterName: "Vitamin C, Serum",
    parameterAliases: ["Vitamin C", "Ascorbic Acid"],
    unit: "mg/dL",
    normalRange: "0.40 - 2.00",
  });
}

async function ensureVitaminB12TestConfiguration() {
  await ensureSingleParameterTestConfiguration({
    names: ["Vitamin B12", "Serum Vitamin B12 Estimation", "Vitamin B12 (Cyanocobalamin)"],
    createName: "Vitamin B12",
    createCode: "VITB12",
    category: "Biochemistry",
    sampleType: "Serum",
    turnaroundHours: 24,
    parameterName: "Vitamin B12, Serum",
    parameterAliases: ["Vitamin B12", "Serum Vitamin B12"],
    unit: "pg/mL",
    normalRange: "200.00 - 900.00",
  });
}

async function ensureRandomBloodSugarTestConfiguration() {
  await ensureSingleParameterTestConfiguration({
    names: ["Random Blood Sugar (RBS)", "Random Blood Sugar", "RBS"],
    createName: "Random Blood Sugar (RBS)",
    createCode: "RBS",
    category: "Biochemistry",
    sampleType: "Plasma",
    turnaroundHours: 4,
    parameterName: "Glucose, Random, Plasma",
    parameterAliases: ["Random Glucose", "Glucose"],
    unit: "mg/dL",
    normalRange: "70.00 - 140.00",
  });
}

async function ensureFastingBloodSugarTestConfiguration() {
  await ensureSingleParameterTestConfiguration({
    names: ["Fasting Blood Sugar", "Fasting Blood Sugar (FBS)", "FBS"],
    createName: "Fasting Blood Sugar",
    createCode: "FBS",
    category: "Biochemistry",
    sampleType: "Plasma",
    turnaroundHours: 4,
    parameterName: "Glucose, Fasting, Plasma",
    parameterAliases: ["Fasting Glucose", "Glucose"],
    unit: "mg/dL",
    normalRange: "70.00 - 100.00",
  });
}

async function ensureBTypeNatriureticPeptideTestConfiguration() {
  await ensureSingleParameterTestConfiguration({
    names: ["B-Type Natriuretic Peptide (BNP)", "BNP", "Brain Natriuretic Peptide"],
    createName: "B-Type Natriuretic Peptide (BNP)",
    createCode: "BNP",
    category: "Biochemistry",
    sampleType: "Plasma (2 ml)",
    turnaroundHours: 1,
    parameterName: "BNP (B-Type Natriuretic Peptide)",
    parameterAliases: ["BNP", "Brain Natriuretic Peptide"],
    unit: "pg/mL",
    normalRange: "< 29.40",
  });
}

async function ensureDigoxinTestConfiguration() {
  await ensureSingleParameterTestConfiguration({
    names: ["Digoxin", "Digoxin (Serum)", "Serum Digoxin"],
    createName: "Digoxin",
    createCode: "DIGOXIN",
    category: "Biochemistry",
    sampleType: "Serum",
    turnaroundHours: 24,
    parameterName: "Digoxin, Serum",
    parameterAliases: ["Serum Digoxin"],
    unit: "ng/mL",
    normalRange: "0.50 - 2.00",
  });
}

async function ensureCreatineKinaseTestConfiguration() {
  await ensureSingleParameterTestConfiguration({
    names: ["Creatine Kinase (Total CK)", "Creatine Kinase", "Total CK", "CK"],
    createName: "Creatine Kinase (Total CK)",
    createCode: "CK",
    category: "Biochemistry",
    sampleType: "Serum",
    turnaroundHours: 12,
    parameterName: "CK, Serum",
    parameterAliases: ["Creatine Kinase", "Total CK", "CK"],
    unit: "U/L",
    normalRange: "< 171.00",
  });
}

async function ensureBeta2MicroglobulinTestConfiguration() {
  await ensureSingleParameterTestConfiguration({
    names: ["Beta-2 Microglobulin", "Beta 2 Microglobulin", "B2M"],
    createName: "Beta-2 Microglobulin",
    createCode: "B2M",
    category: "Immunology",
    sampleType: "Serum (2 ml)",
    turnaroundHours: 24,
    parameterName: "Beta 2 Microglobulin",
    parameterAliases: ["Beta-2 Microglobulin", "B2M"],
    unit: "ng/mL",
    normalRange: "609.00 - 2366.00",
  });
}

async function ensureAltSgptTestConfiguration() {
  await ensureSingleParameterTestConfiguration({
    names: ["SGPT / ALT", "ALT (SGPT)", "Alanine Aminotransferase (ALT) - SGPT", "ALT"],
    createName: "SGPT / ALT",
    createCode: "ALT",
    category: "Biochemistry",
    sampleType: "Serum",
    turnaroundHours: 24,
    parameterName: "ALT (SGPT), Serum",
    parameterAliases: ["SGPT / ALT", "ALT (SGPT)", "ALT", "SGPT"],
    unit: "U/L",
    normalRange: "10.00 - 49.00",
  });
}

async function ensureDnphTestConfiguration() {
  await ensureSingleParameterTestConfiguration({
    names: ["DNPH", "2,4-DNPH", "Dinitrophenylhydrazine"],
    createName: "DNPH",
    createCode: "DNPH",
    category: "Biochemistry",
    sampleType: "Urine",
    turnaroundHours: 24,
    parameterName: "DNPH, Urine",
    parameterAliases: ["DNPH", "Dinitrophenylhydrazine"],
    unit: "",
    normalRange: "",
  });
}

async function ensurePrealbuminTestConfiguration() {
  await ensureSingleParameterTestConfiguration({
    names: ["Prealbumin", "Prealbumin (Transthyretin)", "Transthyretin"],
    createName: "Prealbumin",
    createCode: "PREALBUMIN",
    category: "Biochemistry",
    sampleType: "Serum",
    turnaroundHours: 24,
    parameterName: "Prealbumin, Serum",
    parameterAliases: ["Prealbumin", "Transthyretin"],
    unit: "mg/dL",
    normalRange: "16.00 - 30.00",
  });
}

async function ensureHaptoglobinTestConfiguration() {
  await ensureSingleParameterTestConfiguration({
    names: ["Haptoglobin", "Haptoglobin (Serum)", "Serum Haptoglobin"],
    createName: "Haptoglobin",
    createCode: "HAPTOGLOBIN",
    category: "Biochemistry",
    sampleType: "Serum",
    turnaroundHours: 24,
    parameterName: "Haptoglobin, Serum",
    parameterAliases: ["Haptoglobin", "Serum Haptoglobin"],
    unit: "mg/dL",
    normalRange: "41.00 - 165.00",
  });
}

async function ensureGramStainBacterialVaginosisTestConfiguration() {
  await ensureSingleParameterTestConfiguration({
    names: ["Gram Stain for Bacterial Vaginosis (BV)", "Bacterial Vaginosis (BV) Gram Stain", "Nugent Score"],
    createName: "Gram Stain for Bacterial Vaginosis (BV)",
    createCode: "BV",
    category: "Microbiology",
    sampleType: "Vaginal Swab",
    turnaroundHours: 24,
    parameterName: "Nugent Score",
    parameterAliases: ["Nugent Score / Manual Micro Comment", "Manual Micro Comment"],
    unit: "",
    normalRange: "0 - 3",
  });
}

async function ensureAldolaseTestConfiguration() {
  await ensureSingleParameterTestConfiguration({
    names: ["Aldolase", "Aldolase (Serum)", "Serum Aldolase"],
    createName: "Aldolase",
    createCode: "ALDOLASE",
    category: "Biochemistry",
    sampleType: "Serum",
    turnaroundHours: 24,
    parameterName: "Aldolase, Serum",
    parameterAliases: ["Aldolase", "Serum Aldolase"],
    unit: "U/L",
    normalRange: "< 7.60",
  });
}

async function ensureUrineProteinCreatinineRatioTestConfiguration() {
  let tests = await all(
    `SELECT id FROM tests
     WHERE LOWER(name) IN (LOWER(?), LOWER(?), LOWER(?))
     ORDER BY id ASC`,
    ["Urine Protein - Creatinine Ratio (UPCR)", "Urine Protein Creatinine Ratio", "UPCR"]
  );

  if (!tests.length) {
    const created = await run(
      `INSERT INTO tests (name, code, category, sample_type, price, turnaround_hours, active, created_at)
       VALUES (?, ?, ?, ?, 0, ?, 1, ?)`,
      ["Urine Protein - Creatinine Ratio (UPCR)", "UPCR", "Biochemistry", "Urine", 24, buildNow()]
    );
    tests = [{ id: created.id }];
  }

  const parameters = [
    { name: "Protein Total", aliases: ["Urine Protein", "Protein"], unit: "mg/dL", range: "< 14.00", entryMode: "manual", formula: null, precision: null },
    { name: "Creatinine", aliases: ["Urine Creatinine"], unit: "mg/dL", range: "24.00 - 392.00", entryMode: "manual", formula: null, precision: null },
    { name: "Protein Creatinine Ratio", aliases: ["Urine Protein Creatinine Ratio", "UPCR"], unit: "mg/mg", range: "< 0.20", entryMode: "calculated", formula: "{Protein Total} / {Creatinine}", precision: 2 },
  ];

  for (const test of tests) {
    await run(
      "UPDATE tests SET sample_type = ?, turnaround_hours = ?, active = 1 WHERE id = ?",
      ["Urine", 24, test.id]
    );

    for (const [index, definition] of parameters.entries()) {
      const names = [definition.name, ...definition.aliases];
      const placeholders = names.map(() => "LOWER(?)").join(", ");
      const parameter = await get(
        `SELECT id FROM test_parameters
         WHERE test_id = ? AND LOWER(parameter_name) IN (${placeholders})
         ORDER BY display_order ASC, id ASC LIMIT 1`,
        [test.id, ...names]
      ) || (index === 0 ? await get(
        "SELECT id FROM test_parameters WHERE test_id = ? AND LOWER(parameter_name) = LOWER(?) ORDER BY display_order ASC, id ASC LIMIT 1",
        [test.id, "Result"]
      ) : null);

      if (parameter) {
        await run(
          `UPDATE test_parameters
           SET parameter_name = ?, unit = ?, normal_range = ?, display_order = ?, entry_mode = ?, calculation_formula = ?, calculation_precision = ?
           WHERE id = ?`,
          [definition.name, definition.unit, definition.range, index + 1, definition.entryMode, definition.formula, definition.precision, parameter.id]
        );
        continue;
      }

      await run(
        `INSERT INTO test_parameters (test_id, parameter_name, unit, normal_range, display_order, entry_mode, calculation_formula, calculation_precision)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [test.id, definition.name, definition.unit, definition.range, index + 1, definition.entryMode, definition.formula, definition.precision]
      );
    }
  }
}

async function ensureAlbuminCreatinineRatioTestConfiguration() {
  const tests = await all(
    `SELECT id FROM tests
     WHERE LOWER(name) IN (LOWER(?), LOWER(?), LOWER(?), LOWER(?))
        OR LOWER(name) LIKE '%albumin%creatinine%ratio%'
        OR LOWER(COALESCE(code, '')) = 'acr'
     ORDER BY id ASC`,
    [
      "ACR (Albumin-Creatinine Ratio)",
      "Albumin Creatinine Ratio",
      "Urine Albumin Creatinine Ratio",
      "ACR",
    ]
  );

  const parameters = [
    { name: "Urine Albumin", aliases: ["Albumin", "Microalbumin", "Urinary Albumin", "Result"], unit: "mg/L", range: "", entryMode: "manual", formula: null, precision: null },
    { name: "Urine Creatinine", aliases: ["Creatinine", "Urinary Creatinine"], unit: "mg/dL", range: "", entryMode: "manual", formula: null, precision: null },
    { name: "Albumin Creatinine Ratio (ACR)", aliases: ["Albumin Creatinine Ratio", "ACR", "UACR"], unit: "mg/g creatinine", range: "< 30.00", entryMode: "calculated", formula: "{Urine Albumin} / {Urine Creatinine} * 100", precision: 1 },
  ];

  for (const test of tests) {
    await run(
      "UPDATE tests SET category = ?, sample_type = ?, turnaround_hours = ?, active = 1 WHERE id = ?",
      ["Biochemistry", "Spot Urine", 24, test.id]
    );

    for (const [index, definition] of parameters.entries()) {
      const names = [definition.name, ...definition.aliases];
      const placeholders = names.map(() => "LOWER(?)").join(", ");
      const parameter = await get(
        `SELECT id FROM test_parameters
         WHERE test_id = ? AND LOWER(parameter_name) IN (${placeholders})
         ORDER BY display_order ASC, id ASC LIMIT 1`,
        [test.id, ...names]
      );

      if (parameter) {
        await run(
          `UPDATE test_parameters
           SET parameter_name = ?, unit = ?, normal_range = ?, display_order = ?, entry_mode = ?, calculation_formula = ?, calculation_precision = ?
           WHERE id = ?`,
          [definition.name, definition.unit, definition.range, index + 1, definition.entryMode, definition.formula, definition.precision, parameter.id]
        );
        continue;
      }

      await run(
        `INSERT INTO test_parameters (test_id, parameter_name, unit, normal_range, display_order, entry_mode, calculation_formula, calculation_precision)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [test.id, definition.name, definition.unit, definition.range, index + 1, definition.entryMode, definition.formula, definition.precision]
      );
    }
  }
}

async function ensurePostPrandialBloodSugarTestConfiguration() {
  await ensureSingleParameterTestConfiguration({
    names: ["Glucose PP (Post Prandial)", "Post Prandial Blood Sugar (PPBS)", "Post Prandial Blood Sugar", "PPBS"],
    createName: "Post Prandial Blood Sugar (PPBS)",
    createCode: "PPBS",
    category: "Biochemistry",
    sampleType: "Plasma",
    turnaroundHours: 24,
    parameterName: "Glucose, Post Prandial, 2 Hours, Plasma",
    parameterAliases: ["Glucose PP (Post Prandial)", "Post Prandial Blood Sugar", "PPBS"],
    unit: "mg/dL",
    normalRange: "100.00 - 140.00",
  });
}

async function ensureTacrolimusTestConfiguration() {
  await ensureSingleParameterTestConfiguration({
    names: ["Tacrolimus", "Tacrolimus (Whole Blood)", "FK506"],
    createName: "Tacrolimus",
    createCode: "TACROLIMUS",
    category: "Biochemistry",
    sampleType: "Whole Blood (3 ml)",
    turnaroundHours: 24,
    parameterName: "Tacrolimus, Whole Blood",
    parameterAliases: ["Tacrolimus", "FK506"],
    unit: "mcg/L",
    normalRange: "< 10.00",
  });
}

async function ensurePhosphorusTestConfiguration() {
  await ensureSingleParameterTestConfiguration({
    names: ["Phosphorus (Serum)", "Inorganic Phosphorus (Serum)", "Phosphorus", "Phosphate"],
    createName: "Phosphorus (Serum)",
    createCode: "PHOSPHORUS",
    category: "Biochemistry",
    sampleType: "Serum",
    turnaroundHours: 24,
    parameterName: "Phosphorus, Serum",
    parameterAliases: ["Inorganic Phosphorus (Serum)", "Phosphate"],
    unit: "mg/dL",
    normalRange: "2.40 - 5.10",
  });
}

async function ensureAlkalinePhosphataseTestConfiguration() {
  await ensureSingleParameterTestConfiguration({
    names: ["ALP (Alkaline Phosphatase)", "Alkaline Phosphatase (ALP)", "Alkaline Phosphatase", "ALP"],
    createName: "ALP (Alkaline Phosphatase)",
    createCode: "ALP",
    category: "Biochemistry",
    sampleType: "Serum",
    turnaroundHours: 24,
    parameterName: "Alkaline Phosphatase, Serum",
    parameterAliases: ["Alkaline Phosphatase (ALP)", "Alkaline Phosphatase", "ALP"],
    unit: "U/L",
    normalRange: "30.00 - 120.00",
  });
}

async function ensureClotRetractionTestConfiguration() {
  await ensureSingleParameterTestConfiguration({
    names: ["Clot Retraction Test", "Clot Retraction Time", "Clot Retraction"],
    createName: "Clot Retraction Test",
    createCode: "CLOTRETRACTION",
    category: "Hematology",
    sampleType: "Whole Blood (3 ml)",
    turnaroundHours: 24,
    parameterName: "Clot Retraction Test",
    parameterAliases: ["Clot Retraction Time", "Clot Retraction"],
    unit: "%",
    normalRange: "48.00 - 64.00",
  });
}

async function ensureGroupBStrepTestConfiguration() {
  await ensureSingleParameterTestConfiguration({
    names: ["Group B Streptococcus (GBS)", "Group B Strep (GBS)", "Streptococcus Group B Antigen Detection"],
    createName: "Group B Streptococcus (GBS)",
    createCode: "GBS",
    category: "Microbiology",
    sampleType: "Cardial",
    turnaroundHours: 24,
    parameterName: "Group B Streptococcus",
    parameterAliases: ["Streptococcus Group B Antigen Detection"],
    unit: "",
    normalRange: "Negative",
  });
}

async function ensureFungusKohPreparationTestConfiguration() {
  await ensureReportTableTestConfiguration({
    names: ["KOH Preparation", "KOH Preparation for demonstration of fungus", "Fungus Routine, KOH Preparation"],
    createName: "Fungus Routine, KOH Preparation",
    createCode: "KOH",
    category: "Microbiology",
    sampleType: "Skin/Nail",
    turnaroundHours: 24,
    parameters: [
      { name: "Type of Specimen", aliases: ["Specimen Type", "Specimen"] },
      { name: "Yeast Cells" },
      { name: "Yeast Cells Grade" },
      { name: "Pseudohyphae" },
      { name: "Pseudohyphae Grade" },
      { name: "Fungal Spores" },
      { name: "Fungal Spores Grade" },
      { name: "Fungal Hyphae" },
      { name: "Fungal Hyphae Grade" },
      { name: "Others" },
      { name: "Others Grade" },
      { name: "Impression" },
    ],
  });
}

async function ensureSputumAfbTestConfiguration() {
  await ensureReportTableTestConfiguration({
    names: ["Sputum AFB Stain", "Sputum Examination, AFB", "Sputum AFB Examination"],
    createName: "Sputum Examination, AFB",
    createCode: "SPUTUMAFB",
    category: "Microbiology",
    sampleType: "Sputum",
    turnaroundHours: 24,
    parameters: [
      { name: "Type of Specimen", aliases: ["Specimen Type", "Specimen"] },
      { name: "Auramine Result" },
      { name: "Auramine Grade" },
      { name: "Ziehl Neelsen Result", aliases: ["Ziehl-Neelsen Result"] },
      { name: "Ziehl Neelsen Grade", aliases: ["Ziehl-Neelsen Grade"] },
    ],
  });

  await ensureReportTableTestConfiguration({
    names: [
      "AFB Culture & Sensitivity",
      "AFB Culture and Sensitivity",
      "AFB Culture & Sensitivity (Bactec method)",
      "AFB Culture and Sensitivity (Bactec Method)",
    ],
    createName: "AFB Culture & Sensitivity",
    createCode: "AFBCULTURESENS",
    category: "Microbiology",
    sampleType: "Sputum/Pus",
    turnaroundHours: 1008,
    parameters: [
      { name: "AFB Culture Result", aliases: ["Culture Result", "AFB Culture", "Result"], normalRange: "No growth" },
      { name: "Organism Isolated", aliases: ["Organism", "Isolate"] },
      { name: "Drug Sensitivity", aliases: ["Drug Susceptibility", "Sensitivity", "Susceptibility"] },
      { name: "Comments", aliases: ["Comment", "Remarks"] },
    ],
  });
}

async function ensureStoolCultureTestConfiguration() {
  await ensureReportTableTestConfiguration({
    names: ["Stool Culture", "Stool Culture & Sensitivity"],
    createName: "Stool Culture",
    createCode: "STOOLCULTURE",
    category: "Microbiology",
    sampleType: "Stool",
    turnaroundHours: 120,
    parameters: [
      { name: "Culture, Stool", aliases: ["Culture Result", "Stool Culture"] , normalRange: "Absent" },
      { name: "Comments" },
    ],
  });
}

async function ensureUrineCultureTestConfiguration() {
  await ensureReportTableTestConfiguration({
    names: ["Urine Culture", "Urine Culture & Sensitivity"],
    createName: "Urine Culture",
    createCode: "URINECULTURE",
    category: "Microbiology",
    sampleType: "Urine",
    turnaroundHours: 168,
    parameters: [
      { name: "Culture, Urine", aliases: ["Culture Result", "Urine Culture"], normalRange: "Absent" },
      { name: "Comments" },
    ],
  });
}

async function ensureMalariaParasiteIdentificationTestConfiguration() {
  await ensureSingleParameterTestConfiguration({
    names: ["MP (Malaria Parasites) Conce Method", "MP (Malaria Parasites) Thick & Thin", "Malaria Parasite Identification"],
    createName: "Malaria Parasite Identification",
    createCode: "MALARIAMP",
    category: "Microbiology",
    sampleType: "Blood (2 ml)",
    turnaroundHours: 1,
    parameterName: "Malaria Parasite Identification",
    parameterAliases: ["MP (Malaria Parasites)", "Malaria Parasite", "MP"],
    unit: "",
    normalRange: "No MP seen in smears examined",
  });
}

async function ensureMycobacteriumCombinedPanelTestConfiguration() {
  await ensureReportTableTestConfiguration({
    names: ["Mycobacterial Panel", "Mycobacterium Combined Panel - TB (Combine)", "Mycobacterium Combined Panel"],
    createName: "Mycobacterium Combined Panel - TB (Combine)",
    createCode: "MYCOBACTERIUM",
    category: "Microbiology",
    sampleType: "Sputum",
    turnaroundHours: 72,
    parameters: [
      { name: "Type of Specimen", aliases: ["Specimen Type", "Specimen"] },
      { name: "Mycobacterium tuberculosis Complex", aliases: ["MTB Complex", "Mycobacterium Tuberculosis Complex"], normalRange: "Not Detected" },
      { name: "Non tuberculous Mycobacteria", aliases: ["Non-tuberculous Mycobacteria", "NTM"], normalRange: "Not Detected" },
    ],
  });
}

async function ensureOvaAndParasiteTestConfiguration() {
  await ensureReportTableTestConfiguration({
    names: ["Ova and Parasite Examination", "Ova and Parasite Test", "Ova & Parasite Test"],
    createName: "Ova and Parasite Test",
    createCode: "OVAPARASITE",
    category: "Microbiology",
    sampleType: "Stool (5 g)",
    turnaroundHours: 4,
    parameters: [
      { name: "Type of Specimen", aliases: ["Specimen Type", "Specimen"] },
      { name: "Cryptosporidium spp", normalRange: "Negative" },
      { name: "OVA, Cryptosporidium spp", normalRange: "Negative" },
      { name: "LARVA, Cryptosporidium spp", normalRange: "Negative" },
      { name: "OTHER, Cryptosporidium spp", normalRange: "Negative" },
      { name: "Cyclospora spp", normalRange: "Negative" },
      { name: "OVA, Cyclospora spp", normalRange: "Negative" },
      { name: "LARVA, Cyclospora spp", normalRange: "Negative" },
      { name: "OTHER, Cyclospora spp", normalRange: "Negative" },
      { name: "Isospora spp", aliases: ["Cystoisospora spp"], normalRange: "Negative" },
      { name: "Microsporidia spp", normalRange: "Negative" },
      { name: "Strongyloides stercoralis larvae", aliases: ["Strongyloides stercoralis"], normalRange: "Negative" },
    ],
  });
}

async function ensureTripleMarkerTestConfiguration() {
  await ensureReportTableTestConfiguration({
    names: ["Triple Marker", "Triple Screening Diagnosis", "Maternal Serum Triple Marker"],
    createName: "Triple Marker",
    createCode: "TRIPLEMARKER",
    category: "Tumor Markers",
    sampleType: "Maternal Serum",
    turnaroundHours: 24,
    parameters: [
      { name: "HCG", aliases: ["hCG", "Human Chorionic Gonadotropin"], unit: "mIU/mL" },
      { name: "AFP", aliases: ["Alpha Feto Protein"], unit: "ng/mL" },
      { name: "Estriol, Free", aliases: ["Free Estriol", "Estriol Free", "E3"], unit: "ng/mL" },
    ],
  });
}

async function ensureDoubleMarkerTestConfiguration() {
  await ensureReportTableTestConfiguration({
    names: ["Double Marker", "Dual Marker", "Maternal Serum Dual Marker"],
    createName: "Double Marker",
    createCode: "DOUBLEMARKER",
    category: "Tumor Markers",
    sampleType: "Maternal Serum",
    turnaroundHours: 24,
    parameters: [
      { name: "Beta HCG Free", aliases: ["Free Beta HCG", "Free ß-hCG", "Beta hCG"], unit: "ng/mL" },
      { name: "PAPP-A", aliases: ["PAPP A", "Pregnancy Associated Plasma Protein A"], unit: "mIU/mL" },
    ],
  });
}

async function ensurePax8TestConfiguration() {
  await ensureSingleParameterTestConfiguration({
    names: ["PAX8", "Pax 8", "PAX 8"],
    createName: "Pax 8",
    createCode: "PAX8",
    category: "Tumor Markers",
    sampleType: "Serum (1 ml)",
    turnaroundHours: 24,
    parameterName: "PAX 8",
    parameterAliases: ["PAX8", "Pax 8", "Result"],
    unit: "",
    normalRange: "Negative",
  });
}

async function ensureGalectin3TestConfiguration() {
  await ensureSingleParameterTestConfiguration({
    names: ["Galectin-3", "Galectin 3"],
    createName: "Galectin-3",
    createCode: "GALECTIN3",
    category: "Tumor Markers",
    sampleType: "Serum (1 ml)",
    turnaroundHours: 48,
    parameterName: "Galectin-3",
    parameterAliases: ["Galectin 3", "Result"],
    unit: "ng/mL",
    normalRange: "< 22.10",
  });
}

async function ensureHer2TestConfiguration() {
  await ensureReportTableTestConfiguration({
    names: ["HER2", "HER2 (ERBB2) Amplification", "HER2 FISH"],
    createName: "HER2 (ERBB2) Amplification",
    createCode: "HER2",
    category: "Tumor Markers",
    sampleType: "Formalin fixed paraffin embedded tissue block",
    turnaroundHours: 72,
    parameters: [
      { name: "Specimen", aliases: ["Sample Type", "Result"] },
      { name: "Block No.", aliases: ["Block Number", "Block no"] },
      { name: "Fixation Time", aliases: ["Fixation"], unit: "hours" },
      { name: "Clinical Indication", aliases: ["Indication"] },
      { name: "Cells Counted", aliases: ["Cells Count"], unit: "cells" },
      { name: "Total HER2 Signals", aliases: ["Total Her2 Signals", "HER2 Signals"] },
      { name: "Total CEP17 Signals", aliases: ["Total Cep17 Signals", "CEP17 Signals"] },
      { name: "HER2 Signals Mean per Cell", aliases: ["HER2 Mean per Cell", "Her2 signals mean per cell"], entryMode: "calculated", formula: "{Total HER2 Signals} / {Cells Counted}", precision: 2 },
      { name: "CEP17 Signals Mean per Cell", aliases: ["CEP17 Mean per Cell", "Cep17 signals mean per cell"], entryMode: "calculated", formula: "{Total CEP17 Signals} / {Cells Counted}", precision: 2 },
      { name: "HER2/neu:CEP17 Ratio", aliases: ["Her2/neu:CEP17 ratio", "HER2 CEP17 Ratio"], entryMode: "calculated", formula: "{Total HER2 Signals} / {Total CEP17 Signals}", precision: 2 },
      { name: "Interpretation", aliases: ["HER2 Interpretation"] },
    ],
  });
}

async function ensureDcpTestConfiguration() {
  await ensureSingleParameterTestConfiguration({
    names: ["Des-Gamma Carboxy Prothrombin (DCP)", "DCP", "PIVKA II"],
    createName: "Des-Gamma Carboxy Prothrombin (DCP)",
    createCode: "DCP",
    category: "Tumor Markers",
    sampleType: "Serum (3 ml)",
    turnaroundHours: 4,
    parameterName: "Des-Gamma Carboxy Prothrombin (DCP)",
    parameterAliases: ["DCP", "PIVKA II", "Result"],
    unit: "mAU/mL",
    normalRange: "< 40.00",
  });
}

async function ensureAfpTumorMarkerTestConfiguration() {
  await ensureSingleParameterTestConfiguration({
    names: ["AFP (Alpha Feto Protein)", "AFP, Tumor Marker", "AFP (Alpha Fetoprotein) Tumor Marker"],
    createName: "AFP (Alpha Fetoprotein), Tumor Marker",
    createCode: "AFPTUMOR",
    category: "Tumor Markers",
    sampleType: "Serum",
    turnaroundHours: 24,
    parameterName: "AFP, Tumor Marker, Serum",
    parameterAliases: ["AFP", "Alpha Feto Protein", "Result"],
    unit: "ng/dL",
    normalRange: "200.00 - 400.00",
  });
}

async function ensureCa199TestConfiguration() {
  await ensureSingleParameterTestConfiguration({
    names: ["CA 19.9", "CA 19-9", "CA 19-9 (Pancreatic Cancer Marker)"],
    createName: "CA 19-9 (Pancreatic Cancer Marker)",
    createCode: "CA199",
    category: "Tumor Markers",
    sampleType: "Serum",
    turnaroundHours: 24,
    parameterName: "CA 19-9, Serum",
    parameterAliases: ["CA 19.9", "CA19-9", "Result"],
    unit: "U/mL",
    normalRange: "< 37.00",
  });
}

async function ensureCa153TestConfiguration() {
  await ensureSingleParameterTestConfiguration({
    names: ["CA 15.3", "CA 15-3", "CA 15-3 (Breast Cancer Marker)"],
    createName: "CA 15-3 (Breast Cancer Marker)",
    createCode: "CA153",
    category: "Tumor Markers",
    sampleType: "Serum",
    turnaroundHours: 24,
    parameterName: "CA 15-3, Serum",
    parameterAliases: ["CA 15.3", "CA15-3", "Result"],
    unit: "U/mL",
    normalRange: "< 30.00",
  });
}

async function ensureCa125TestConfiguration() {
  await ensureSingleParameterTestConfiguration({
    names: ["CA 125", "CA 125 (Ovarian Cancer Marker)"],
    createName: "CA 125 (Ovarian Cancer Marker)",
    createCode: "CA125",
    category: "Tumor Markers",
    sampleType: "Serum",
    turnaroundHours: 24,
    parameterName: "CA 125, Serum",
    parameterAliases: ["CA125", "Result"],
    unit: "U/mL",
    normalRange: "< 35.00",
  });
}

async function ensureTroponinITestConfiguration() {
  await ensureSingleParameterTestConfiguration({
    names: ["Troponin - I", "Troponin I", "Troponin I, High Sensitive"],
    createName: "Troponin - I, High Sensitive",
    createCode: "TROPONINI",
    category: "Cardiology",
    sampleType: "Serum",
    turnaroundHours: 1,
    parameterName: "Troponin - I, High Sensitive, Serum",
    parameterAliases: ["Troponin I", "Troponin-I", "Result"],
    unit: "pg/mL",
    normalRange: "< 26.20",
  });
}

async function ensureTroponinTTestConfiguration() {
  await ensureSingleParameterTestConfiguration({
    names: ["Troponin - T", "Troponin T", "Troponin T, High Sensitive"],
    createName: "Troponin - T, High Sensitive",
    createCode: "TROPONINT",
    category: "Cardiology",
    sampleType: "Serum",
    turnaroundHours: 1,
    parameterName: "Troponin - T, High Sensitive, Serum",
    parameterAliases: ["Troponin T", "Troponin-T", "Result"],
    unit: "pg/mL",
    normalRange: "< 14.00",
  });
}

async function ensureDengueNs1TestConfiguration() {
  await ensureSingleParameterTestConfiguration({
    names: ["Dengue Fever Antigen, NS1", "Dengue Fever Antigen NS1", "Dengue NS1 Antigen"],
    createName: "Dengue Fever Antigen, NS1",
    createCode: "DENGUENS1",
    category: "Serology",
    sampleType: "Serum",
    turnaroundHours: 8,
    parameterName: "Dengue Fever Antigen, NS1, EIA, Serum",
    parameterAliases: ["Dengue NS1", "NS1 Antigen", "Result"],
    unit: "Index",
    normalRange: "< 0.90",
  });
}

async function ensureDengueIggTestConfiguration() {
  await ensureSingleParameterTestConfiguration({
    names: ["Dengue Fever Antibody, IgG", "Dengue Antibody IgG", "Dengue IgG", "Dengue IgG Antibody"],
    createName: "Dengue Fever Antibody, IgG",
    createCode: "DENGUEIGG",
    category: "Serology",
    sampleType: "Serum",
    turnaroundHours: 8,
    parameterName: "Dengue Fever Antibody, IgG, Serum",
    parameterAliases: ["Dengue IgG", "Dengue Antibody IgG", "Result"],
    unit: "Index",
    normalRange: "< 1.80",
  });
}

async function ensureDengueIgmTestConfiguration() {
  await ensureSingleParameterTestConfiguration({
    names: ["Dengue Fever Antibody, IgM", "Dengue Antibody IgM", "Dengue IgM", "Dengue IgM Antibody"],
    createName: "Dengue Fever Antibody, IgM",
    createCode: "DENGUEIGM",
    category: "Serology",
    sampleType: "Serum",
    turnaroundHours: 8,
    parameterName: "Dengue Fever Antibody, IgM, Serum",
    parameterAliases: ["Dengue IgM", "Dengue Antibody IgM", "Result"],
    unit: "Index",
    normalRange: "< 0.90",
  });
}

async function ensureRastTestConfiguration() {
  await ensureSingleParameterTestConfiguration({
    names: ["Radioallergosorbent (RAST) Test", "Radioallergosorbent (RAST)", "RAST Test", "Immunoglobulin E"],
    createName: "Radioallergosorbent (RAST) Test",
    createCode: "RAST",
    category: "Immunology",
    sampleType: "Serum",
    turnaroundHours: 24,
    parameterName: "Immunoglobulin IgE, Serum",
    parameterAliases: ["Total IgE", "Immunoglobulin E", "IgE", "Result"],
    unit: "kUA/L",
    normalRange: "< 64.00",
  });
}

async function ensureWidalTestConfiguration() {
  await ensureReportTableTestConfiguration({
    names: ["Widal Test, Slide", "Widal Slide Agglutination Test", "Widal Test Slide"],
    createName: "Widal Slide Agglutination Test",
    createCode: "WIDALSLIDE",
    category: "Serology",
    sampleType: "Serum",
    turnaroundHours: 8,
    parameters: [
      { name: "Salmonella typhi O (TO)", aliases: ["S. typhi O", "TO"], unit: "Titre", normalRange: "> 1:80" },
      { name: "Salmonella typhi H (TH)", aliases: ["S. typhi H", "TH"], unit: "Titre", normalRange: "> 1:160" },
      { name: "Salmonella paratyphi A, H (AH)", aliases: ["S. paratyphi A H", "AH"], unit: "Titre", normalRange: "> 1:320" },
      { name: "Salmonella paratyphi B, H (BH)", aliases: ["S. paratyphi B H", "BH"], unit: "Titre", normalRange: "> 1:320" },
    ],
  });
}

async function ensureCrpTestConfiguration() {
  await ensureSingleParameterTestConfiguration({
    names: ["CRP (C-Reactive Protein) Test", "C-Reactive Protein (CRP)", "C-Reactive Protein", "CRP"],
    createName: "C-Reactive Protein (CRP)",
    createCode: "CRP",
    category: "Immunology",
    sampleType: "Serum",
    turnaroundHours: 8,
    parameterName: "C-Reactive Protein",
    parameterAliases: ["CRP", "C Reactive Protein", "Result"],
    unit: "mg/dL",
    normalRange: "0.0 - 5.0",
  });
}

async function ensureTyphidotTestConfiguration() {
  await ensureSingleParameterTestConfiguration({
    names: ["Typhi Dot IgG & IgM", "Typhidot Test", "Typhidot", "Typhidot IgG"],
    createName: "Typhidot",
    createCode: "TYPHIDOT",
    category: "Serology",
    sampleType: "Serum",
    turnaroundHours: 8,
    parameterName: "TYPHIDOT / SALMONELLA TYPHI, IgG",
    parameterAliases: ["Typhidot", "Typhi Dot", "Typhi Dot IgG & IgM", "Salmonella typhi"],
    unit: "Result",
    normalRange: "Non-Reactive",
  });
}

async function ensureVdrlTestConfiguration() {
  await ensureSingleParameterTestConfiguration({
    names: ["VDRL", "RPR TEST", "VDRL (RPR) Test", "VDRL (RPR)", "VDRL Test", "RPR"],
    createName: "VDRL (RPR)",
    createCode: "VDRLRPR",
    category: "Serology",
    sampleType: "Serum",
    turnaroundHours: 8,
    parameterName: "VDRL (RPR), SERUM",
    parameterAliases: ["VDRL", "RPR", "VDRL (RPR)"],
    unit: "Result",
    normalRange: "Non-Reactive",
  });
}

async function ensureHavIggTestConfiguration() {
  await ensureSingleParameterTestConfiguration({
    names: ["Hepatitis A Virus (HAV) IgG", "Anti HAV (Hepatitis A Virus)", "Hepatitis A Antibody (Anti-HAV) IgG", "Anti HAV IgG"],
    createName: "Hepatitis A Antibody (Anti-HAV), IgG, Serum",
    createCode: "HAVIGG",
    category: "Serology",
    sampleType: "Serum",
    turnaroundHours: 24,
    parameterName: "Anti HAV, IgG, SERUM",
    parameterAliases: ["Anti HAV IgG", "HAV IgG", "Hepatitis A IgG", "Result"],
    unit: "Index",
    normalRange: "< 1.00",
  });
}

async function ensureHavIgmTestConfiguration() {
  await ensureSingleParameterTestConfiguration({
    names: ["Hepatitis A Virus (HAV) IgM", "Hepatitis A Antibody (Anti-HAV) IgM", "Anti HAV IgM"],
    createName: "Hepatitis A Antibody (Anti-HAV), IgM, Serum",
    createCode: "HAVIGM",
    category: "Serology",
    sampleType: "Serum",
    turnaroundHours: 24,
    parameterName: "Anti HAV, IgM, SERUM",
    parameterAliases: ["Anti HAV IgM", "HAV IgM", "Hepatitis A IgM", "Result"],
    unit: "Index",
    normalRange: "< 0.80",
  });
}

async function ensureHcvRapidScreeningTestConfiguration() {
  await ensureSingleParameterTestConfiguration({
    names: ["HCV Rapid Card Test", "Anti HCV Antibody", "Hepatitis C Virus (HCV) Rapid Screening Test", "HCV Rapid Screening Test", "Hepatitis C Virus (HCV) Test", "HCV Test"],
    createName: "Hepatitis C Virus (HCV) Rapid Screening Test",
    createCode: "HCVRAPID",
    category: "Serology",
    sampleType: "Serum",
    turnaroundHours: 24,
    parameterName: "HCV RAPID SCREENING TEST, SERUM",
    parameterAliases: ["HCV Rapid", "HCV Antibody", "Anti HCV", "Result"],
    unit: "Result",
    normalRange: "Non-Reactive",
  });
}

async function ensureHbsAgTestConfiguration() {
  await ensureSingleParameterTestConfiguration({
    names: ["Hepatitis B Surface Antigen (HBsAg)", "HBsAg", "HBsAg Test", "Hepatitis B Surface Antigen Test"],
    createName: "Hepatitis B Surface Antigen (HBsAg)",
    createCode: "HBSAG",
    category: "Serology",
    sampleType: "Serum",
    turnaroundHours: 24,
    parameterName: "HBsAg, SERUM",
    parameterAliases: ["HBsAg", "Hepatitis B Surface Antigen", "Result"],
    unit: "",
    normalRange: "Reactive / Non Reactive",
  });
}

async function ensureAntiHbcIgmTestConfiguration() {
  await ensureSingleParameterTestConfiguration({
    names: ["Hepatitis B Core Antibody (Anti-HBc) IgM", "Hepatitis B Core Antibody (Anti-HBc), IgM", "Anti-HBc IgM", "Anti HBc IgM"],
    createName: "Hepatitis B Core Antibody (Anti-HBc), IgM",
    createCode: "ANTIHBCIGM",
    category: "Serology",
    sampleType: "Serum",
    turnaroundHours: 24,
    parameterName: "Anti- HBc, IgM, SERUM",
    parameterAliases: ["Anti-HBc IgM", "Anti HBc IgM", "Hepatitis B Core Antibody IgM", "Result"],
    unit: "Index",
    normalRange: "< 1.00",
  });
}

async function ensureHepatitisBProfileTestConfiguration() {
  await ensureReportTableTestConfiguration({
    names: ["Hepatitis B Profile", "HBV Profile", "Hepatitis B Viral Profile"],
    createName: "Hepatitis B Profile",
    createCode: "HEPBPROFILE",
    category: "Serology",
    sampleType: "Serum",
    turnaroundHours: 24,
    parameters: [
      { name: "Hepatitis B Surface Antigen (HBsAg), Quantitative", aliases: ["HBsAg Quantitative", "HBsAg"], unit: "IU/mL", normalRange: "< 0.05" },
      { name: "Hepatitis B Surface Antibody (Anti-HBs)", aliases: ["Anti-HBs", "HBsAb"], unit: "mIU/mL", normalRange: "< 10.00" },
      { name: "Hepatitis B Core Antibody (Anti- HBc), IgM", aliases: ["Anti-HBc IgM", "Anti HBc IgM"], unit: "Index", normalRange: "< 1.00" },
      { name: "Hepatitis B Core Antibody (Anti- HBc), Total", aliases: ["Anti-HBc Total", "Anti HBc Total"], unit: "Index", normalRange: "< 1.00" },
      { name: "Hepatitis Be Antigen (HBeAg)", aliases: ["HBeAg", "Hepatitis B e Antigen"], unit: "Index", normalRange: "< 1.00" },
      { name: "Hepatitis Be Antibody (Anti-HBe)", aliases: ["Anti-HBe", "HBeAb"], unit: "Index", normalRange: "> 1.00" },
    ],
  });
}

async function ensureMantouxTestConfiguration() {
  await ensureReportTableTestConfiguration({
    names: ["Mantoux Test", "Mantoux Test (Tuberculin Skin Test)", "Tuberculin Skin Test"],
    createName: "Mantoux Test (Tuberculin Skin Test)",
    createCode: "MANTOUX",
    category: "Serology",
    sampleType: "Skin",
    turnaroundHours: 48,
    parameters: [
      { name: "Tuberculin Dose", aliases: ["Dose"], unit: "", normalRange: "0.1 mL of 1 TU PPD" },
      { name: "Induration (mm)", aliases: ["Induration", "Induration Size"], unit: "mm", normalRange: "" },
      { name: "Result after 48 hours", aliases: ["Mantoux Result", "Result"], unit: "", normalRange: "See interpretation table" },
    ],
  });
}

async function ensureHiv12ScreeningTestConfiguration() {
  await ensureReportTableTestConfiguration({
    names: ["HIV 1 & 2 Antibodies Screening Test, Serum", "HIV 1 & 2 Antibodies Screening Test", "HIV 1 and 2 Antibodies", "HIV 1/2 Antibodies"],
    createName: "HIV 1 & 2 Antibodies Screening Test, Serum",
    createCode: "HIV12SCREEN",
    category: "Serology",
    sampleType: "Serum",
    turnaroundHours: 24,
    parameters: [
      { name: "Final Result", aliases: ["HIV Final Result"], unit: "", normalRange: "" },
      { name: "Method 1 Index Value", aliases: ["Index Value", "HIV 1 / 2 & P 24 Combo Index"], unit: "Index", normalRange: "< 1.00" },
      { name: "Method 1 Result", aliases: ["Method 1 HIV Result"], unit: "", normalRange: "", entryMode: "calculated", formula: "IF({Method 1 Index Value} >= 1, \"Positive\", \"Negative\")", precision: 0 },
      { name: "Method 2 Result", aliases: ["HIV 1 / 2 by Immunochromatography", "Method 2 HIV Result"], unit: "", normalRange: "" },
      { name: "HIV 1", aliases: ["Method 3 HIV 1"], unit: "", normalRange: "" },
      { name: "HIV 2", aliases: ["Method 3 HIV 2"], unit: "", normalRange: "" },
    ],
  });
}

async function ensureAntiCcpTestConfiguration() {
  await ensureSingleParameterTestConfiguration({
    names: ["Anti Cyclic-Citrullinated-Peptide (Anti CCP)", "Anti CCP", "Anti-CCP", "Cyclic Citrullinated Peptide"],
    createName: "Anti Cyclic-Citrullinated-Peptide (Anti CCP)",
    createCode: "ANTICCP",
    category: "Immunology",
    sampleType: "Serum",
    turnaroundHours: 24,
    parameterName: "ANTI CCP (CYCLIC CITRULLINATED PEPTIDE), SERUM",
    parameterAliases: ["Anti CCP", "Anti-CCP", "Cyclic Citrullinated Peptide", "Result"],
    unit: "U/mL",
    normalRange: "< 5.00",
  });
}

async function ensureImmunoglobulinIggTestConfiguration() {
  await ensureSingleParameterTestConfiguration({
    names: ["Immunoglobulin IgG", "Immunoglobulin G", "IgG"],
    createName: "Immunoglobulin IgG",
    createCode: "IMMUNOGLOBULINIGG",
    category: "Immunology",
    sampleType: "Serum",
    turnaroundHours: 24,
    parameterName: "IMMUNOGLOBULIN IgG, SERUM",
    parameterAliases: ["Immunoglobulin G", "IgG", "Result"],
    unit: "mg/dL",
    normalRange: "700.00 - 1600.00",
  });
}

async function ensureImmunoglobulinIgeTestConfiguration() {
  await ensureSingleParameterTestConfiguration({
    names: ["Immunoglobulin IgE", "Immunoglobulin E", "IgE"],
    createName: "Immunoglobulin IgE",
    createCode: "IMMUNOGLOBULINIGE",
    category: "Immunology",
    sampleType: "Serum",
    turnaroundHours: 24,
    parameterName: "IMMUNOGLOBULIN IgE, SERUM",
    parameterAliases: ["Immunoglobulin E", "IgE", "Result"],
    unit: "kUA/L",
    normalRange: "< 64.00",
  });
}

async function ensureImmunoglobulinIgmTestConfiguration() {
  await ensureSingleParameterTestConfiguration({
    names: ["Immunoglobulin IgM", "Immunoglobulin M", "IgM"],
    createName: "Immunoglobulin IgM",
    createCode: "IMMUNOGLOBULINIGM",
    category: "Immunology",
    sampleType: "Serum",
    turnaroundHours: 24,
    parameterName: "IMMUNOGLOBULIN IgM, SERUM",
    parameterAliases: ["Immunoglobulin M", "IgM", "Result"],
    unit: "mg/dL",
    normalRange: "40.00 - 230.00",
  });
}

async function ensureImmunoglobulinIgaTestConfiguration() {
  await ensureSingleParameterTestConfiguration({
    names: ["Immunoglobulin IgA", "Immunoglobulin A", "IgA"],
    createName: "Immunoglobulin IgA",
    createCode: "IMMUNOGLOBULINIGA",
    category: "Immunology",
    sampleType: "Serum",
    turnaroundHours: 24,
    parameterName: "IMMUNOGLOBULIN IgA, SERUM",
    parameterAliases: ["Immunoglobulin A", "IgA", "Result"],
    unit: "mg/dL",
    normalRange: "70.00 - 400.00",
  });
}

async function ensureAntiBTitreTestConfiguration() {
  await ensureSingleParameterTestConfiguration({
    names: ["Anti B Titre, IgG", "Anti B Titer, IgG", "Anti-B Titre", "Anti B Titre"],
    createName: "Anti B Titre, IgG",
    createCode: "ANTIBTITRE",
    category: "Immunohematology",
    sampleType: "Serum (2 ml)",
    turnaroundHours: 24,
    parameterName: "ANTI B TITRE, IgG",
    parameterAliases: ["Anti B Titer, IgG", "Anti-B Titre", "Anti B Titre", "Result"],
    unit: "Titre",
    normalRange: "1:1 - 1:256",
  });
}

async function ensureAntiATitreTestConfiguration() {
  await ensureSingleParameterTestConfiguration({
    names: ["Anti A Titre, IgM", "Anti A Titer, IgM", "Anti-A Titre", "Anti A Titre"],
    createName: "Anti A Titre, IgM",
    createCode: "ANTIATITRE",
    category: "Immunohematology",
    sampleType: "Serum (2 ml)",
    turnaroundHours: 24,
    parameterName: "ANTI A TITRE, IgM",
    parameterAliases: ["Anti A Titer, IgM", "Anti-A Titre", "Anti A Titre", "Result"],
    unit: "Titre",
    normalRange: "1:2 - 1:1024",
  });
}

async function ensureDustAllergyTestConfiguration() {
  await ensureSingleParameterTestConfiguration({
    names: ["Dust Allergy", "Allergy, House Dust, IgE", "House Dust Allergy", "Dust Allergy Test"],
    createName: "Dust Allergy",
    createCode: "DUSTALLERGY",
    category: "Immunology",
    sampleType: "Serum (1 ml)",
    turnaroundHours: 24,
    parameterName: "ALLERGY, HOUSE DUST, IgE",
    parameterAliases: ["House Dust IgE", "Dust Allergy", "House Dust Allergy", "Result"],
    unit: "kUA/L",
    normalRange: "< 0.35",
  });
}

async function ensureDengueFeverPanelTestConfiguration() {
  await ensureReportTableTestConfiguration({
    names: ["Dengue Fever Panel", "Dengue Panel", "Dengue Fever Antibody Panel"],
    createName: "Dengue Fever Panel",
    createCode: "DENGUEPANEL",
    category: "Serology",
    sampleType: "Serum (2 ml)",
    turnaroundHours: 24,
    parameters: [
      { name: "DENGUE FEVER ANTIBODY, IgG", aliases: ["Dengue IgG", "Dengue Fever Antibody IgG"], unit: "Index", normalRange: "1.80 - 2.20" },
      { name: "DENGUE FEVER ANTIBODY, IgM", aliases: ["Dengue IgM", "Dengue Fever Antibody IgM"], unit: "Index", normalRange: "0.90 - 1.10" },
    ],
  });
}

async function ensureG6PdTestConfiguration() {
  await ensureSingleParameterTestConfiguration({
    names: ["Glucose-6-phosphate dehydrogenase (G-6-PD)", "G-6-PD", "G6PD", "Glucose 6 Phosphate Dehydrogenase"],
    createName: "Glucose-6-phosphate dehydrogenase (G-6-PD)",
    createCode: "G6PD",
    category: "Hematology",
    sampleType: "Whole Blood",
    turnaroundHours: 24,
    parameterName: "G-6-PD, NEWBORN SCREEN, WHOLE BLOOD",
    parameterAliases: ["G-6-PD", "G6PD", "Glucose-6-phosphate dehydrogenase", "Result"],
    unit: "mIU/mL",
    normalRange: "1.50 - 9.30",
  });
}

async function ensureAntiHbsTestConfiguration() {
  await ensureSingleParameterTestConfiguration({
    names: ["Hepatitis B Surface Antibody (Anti-HBs)", "Anti-HBs", "Anti HBs", "HBsAb"],
    createName: "Hepatitis B Surface Antibody (Anti-HBs)",
    createCode: "ANTIHBS",
    category: "Serology",
    sampleType: "Serum",
    turnaroundHours: 24,
    parameterName: "Anti- HBs, SERUM",
    parameterAliases: ["Anti-HBs", "Anti HBs", "HBsAb", "Result"],
    unit: "mIU/mL",
    normalRange: "< 10.00",
  });
}

async function ensureGangliosideGm1IggTestConfiguration() {
  await ensureSingleParameterTestConfiguration({
    names: ["Ganglioside GM1 Antibody, IgG", "Ganglioside GM1 Antibody IgG", "GM1 Antibody IgG"],
    createName: "Ganglioside GM1 Antibody, IgG",
    createCode: "GANGLIOSIDEGM1IGG",
    category: "Immunology",
    sampleType: "Serum (1 ml)",
    turnaroundHours: 120,
    parameterName: "Ganglioside GM1 Antibody IgG",
    parameterAliases: ["Ganglioside GM1 Antibody, IgG", "GM1 Antibody IgG", "Result"],
    unit: "",
    normalRange: "Negative",
  });
}

async function ensureGangliosideGm1IgmTestConfiguration() {
  await ensureSingleParameterTestConfiguration({
    names: ["Ganglioside GM1 Antibody, IgM", "Ganglioside GM1 Antibody IgM", "GM1 Antibody IgM"],
    createName: "Ganglioside GM1 Antibody, IgM",
    createCode: "GANGLIOSIDEGM1IGM",
    category: "Immunology",
    sampleType: "Serum (1 ml)",
    turnaroundHours: 120,
    parameterName: "Ganglioside GM1 Antibody IgM",
    parameterAliases: ["Ganglioside GM1 Antibody, IgM", "GM1 Antibody IgM", "Result"],
    unit: "",
    normalRange: "Negative",
  });
}

async function ensureGangliosideGd1aIggTestConfiguration() {
  await ensureSingleParameterTestConfiguration({
    names: ["Ganglioside GD1a Antibody, IgG", "Ganglioside GD1a Antibody IgG", "GD1a Antibody IgG"],
    createName: "Ganglioside GD1a Antibody, IgG",
    createCode: "GANGLIOSIDEGD1AIGG",
    category: "Immunology",
    sampleType: "Serum (1 ml)",
    turnaroundHours: 120,
    parameterName: "Ganglioside GD1a Antibody IgG",
    parameterAliases: ["Ganglioside GD1a Antibody, IgG", "GD1a Antibody IgG", "Result"],
    unit: "",
    normalRange: "Negative",
  });
}

async function ensureGangliosideGd1aIgmTestConfiguration() {
  await ensureSingleParameterTestConfiguration({
    names: ["Ganglioside GD1a Antibody, IgM", "Ganglioside GD1a Antibody IgM", "GD1a Antibody IgM"],
    createName: "Ganglioside GD1a Antibody, IgM",
    createCode: "GANGLIOSIDEGD1AIGM",
    category: "Immunology",
    sampleType: "Serum (1 ml)",
    turnaroundHours: 120,
    parameterName: "Ganglioside GD1a Antibody IgM",
    parameterAliases: ["Ganglioside GD1a Antibody, IgM", "GD1a Antibody IgM", "Result"],
    unit: "",
    normalRange: "Negative",
  });
}

async function ensureGangliosideGd1bIggTestConfiguration() {
  await ensureSingleParameterTestConfiguration({
    names: ["Ganglioside GD1b Antibody, IgG", "Ganglioside GD1b Antibody IgG", "GD1b Antibody IgG"],
    createName: "Ganglioside GD1b Antibody, IgG",
    createCode: "GANGLIOSIDEGD1BIGG",
    category: "Immunology",
    sampleType: "Serum (1 ml)",
    turnaroundHours: 120,
    parameterName: "Ganglioside GD1b Antibody IgG",
    parameterAliases: ["Ganglioside GD1b Antibody, IgG", "GD1b Antibody IgG", "Result"],
    unit: "",
    normalRange: "Negative",
  });
}

async function ensureGangliosideGq1bIggTestConfiguration() {
  await ensureSingleParameterTestConfiguration({
    names: ["Ganglioside GQ1b Antibody, IgG", "Ganglioside GQ1b Antibody IgG", "GQ1b Antibody IgG"],
    createName: "Ganglioside GQ1b Antibody, IgG",
    createCode: "GANGLIOSIDEGQ1BIGG",
    category: "Immunology",
    sampleType: "Serum (1 ml)",
    turnaroundHours: 120,
    parameterName: "GANGLIOSIDE GQ1b ANTIBODY, IgG",
    parameterAliases: ["Ganglioside GQ1b Antibody, IgG", "GQ1b Antibody IgG", "Result"],
    unit: "Titre",
    normalRange: "< 1:100",
  });
}

async function ensureAntiHistoneAntibodiesTestConfiguration() {
  await ensureSingleParameterTestConfiguration({
    names: ["Anti-Histone Antibodies", "Anti Histone Antibodies", "Histone Antibodies"],
    createName: "Anti-Histone Antibodies",
    createCode: "ANTIHISTONE",
    category: "Immunology",
    sampleType: "Serum (1 ml)",
    turnaroundHours: 24,
    parameterName: "ANTI-HISTONE ANTIBODIES",
    parameterAliases: ["Anti Histone Antibodies", "Histone Antibodies", "Result"],
    unit: "Units",
    normalRange: "< 1.00",
  });
}

async function ensureRibosomePAntibodiesTestConfiguration() {
  await ensureSingleParameterTestConfiguration({
    names: ["Ribosome P Antibodies", "Ribosome P Antibodies, IgG", "Ribosomal P Antibodies"],
    createName: "Ribosome P Antibodies",
    createCode: "RIBOSOMEP",
    category: "Immunology",
    sampleType: "Serum (1 ml)",
    turnaroundHours: 24,
    parameterName: "Ribosome P Antibodies, IgG",
    parameterAliases: ["Ribosome P Antibodies", "Ribosomal P Antibodies", "Result"],
    unit: "U",
    normalRange: "< 1.0",
  });
}

async function ensureVitaminETestConfiguration() {
  await ensureSingleParameterTestConfiguration({
    names: ["Vitamin E", "Vitamin E (Tocopherol)", "Vitamin E Tocopherol"],
    createName: "Vitamin E (Tocopherol)",
    createCode: "VITE",
    category: "Biochemistry",
    sampleType: "Serum",
    turnaroundHours: 1,
    parameterName: "Vitamin E (Tocopherol)",
    parameterAliases: ["Vitamin E", "Tocopherol"],
    unit: "mg/L",
    normalRange: "5.00 - 18.00",
  });
}

async function ensureVitaminB9TestConfiguration() {
  let vitaminB9Tests = await all(
    `SELECT id FROM tests
     WHERE LOWER(name) IN (LOWER(?), LOWER(?), LOWER(?), LOWER(?))
     ORDER BY id ASC`,
    ["Folic Acid", "Folate", "Vitamin B9", "Vitamin B9 (Folic Acid / Folate)"]
  );

  if (!vitaminB9Tests.length) {
    const created = await run(
      `INSERT INTO tests (name, code, category, sample_type, price, turnaround_hours, active, created_at)
       VALUES (?, ?, ?, ?, 0, ?, 1, ?)`,
      ["Vitamin B9 (Folic Acid / Folate)", "VITB9", "Biochemistry", "Serum", 24, buildNow()]
    );
    vitaminB9Tests = [{ id: created.id }];
  }

  const parameters = [
    { name: "Folate, Serum", aliases: ["Folate Serum", "Folic Acid"], unit: "ng/mL", range: "> 5.38" },
    { name: "Folate, RBC", aliases: ["RBC Folate", "Folate RBC"], unit: "ng/mL", range: "280.00 - 791.00" },
  ];

  for (const vitaminB9Test of vitaminB9Tests) {
    await run(
      "UPDATE tests SET sample_type = ?, turnaround_hours = ?, active = 1 WHERE id = ?",
      ["Serum", 24, vitaminB9Test.id]
    );

    for (const [index, definition] of parameters.entries()) {
      let parameter = null;
      for (const parameterName of [definition.name, ...definition.aliases]) {
        parameter = await get(
          `SELECT id FROM test_parameters
           WHERE test_id = ? AND LOWER(parameter_name) = LOWER(?)
           ORDER BY display_order ASC, id ASC LIMIT 1`,
          [vitaminB9Test.id, parameterName]
        );
        if (parameter) break;
      }

      if (!parameter && index === 0) {
        parameter = await get(
          `SELECT id FROM test_parameters
           WHERE test_id = ? AND LOWER(parameter_name) = LOWER(?)
           ORDER BY display_order ASC, id ASC LIMIT 1`,
          [vitaminB9Test.id, "Result"]
        );
      }

      if (parameter) {
        await run(
          `UPDATE test_parameters
           SET parameter_name = ?, unit = ?, normal_range = ?, display_order = ?
           WHERE id = ?`,
          [definition.name, definition.unit, definition.range, index + 1, parameter.id]
        );
        continue;
      }

      await run(
        `INSERT INTO test_parameters (test_id, parameter_name, unit, normal_range, display_order)
         VALUES (?, ?, ?, ?, ?)`,
        [vitaminB9Test.id, definition.name, definition.unit, definition.range, index + 1]
      );
    }
  }
}

async function ensureVitaminKTestConfiguration() {
  await ensureSingleParameterTestConfiguration({
    names: ["Vitamin K", "Vitamin K1", "Vitamin K1 (Phylloquinone)"],
    createName: "Vitamin K",
    createCode: "VITK",
    category: "Biochemistry",
    sampleType: "Serum",
    turnaroundHours: 24,
    parameterName: "Vitamin K1, Serum",
    parameterAliases: ["Vitamin K", "Vitamin K1", "Phylloquinone"],
    unit: "ng/mL",
    normalRange: "0.20 - 3.20",
  });
}

async function ensureLdlCholesterolTestConfiguration() {
  await ensureSingleParameterTestConfiguration({
    names: ["LDL - Cholesterol", "LDL Cholesterol", "Low Density Lipoprotein Cholesterol"],
    createName: "LDL Cholesterol",
    createCode: "LDL",
    category: "Biochemistry",
    sampleType: "Serum",
    turnaroundHours: 24,
    parameterName: "LDL Cholesterol",
    parameterAliases: ["LDL-C", "Low Density Lipoprotein Cholesterol"],
    unit: "mg/dL",
    normalRange: "< 100.00",
  });
}

async function ensureHdlCholesterolTestConfiguration() {
  await ensureSingleParameterTestConfiguration({
    names: ["HDL - Cholesterol", "HDL Cholesterol", "High Density Lipoprotein Cholesterol"],
    createName: "HDL Cholesterol",
    createCode: "HDL",
    category: "Biochemistry",
    sampleType: "Serum",
    turnaroundHours: 24,
    parameterName: "HDL Cholesterol",
    parameterAliases: ["HDL-C", "High Density Lipoprotein Cholesterol"],
    unit: "mg/dL",
    normalRange: "> 40.00",
  });
}

async function ensureIndirectBilirubinTestConfiguration() {
  await ensureSingleParameterTestConfiguration({
    names: ["Indirect Bilirubin", "Bilirubin, Indirect", "Bilirubin Indirect"],
    createName: "Indirect Bilirubin",
    createCode: "BILIND",
    category: "Biochemistry",
    sampleType: "Serum",
    turnaroundHours: 8,
    parameterName: "Bilirubin, Indirect, Serum",
    parameterAliases: ["Bilirubin Indirect", "Indirect Bilirubin"],
    unit: "mg/dL",
    normalRange: "< 1.10",
  });
}

async function ensureCalciumTestConfiguration() {
  await ensureSingleParameterTestConfiguration({
    names: ["Calcium", "Calcium (Serum)", "Serum Calcium"],
    createName: "Calcium",
    createCode: "CALCIUM",
    category: "Biochemistry",
    sampleType: "Serum",
    turnaroundHours: 24,
    parameterName: "Calcium, Serum",
    parameterAliases: ["Calcium", "Serum Calcium", "Total Calcium"],
    unit: "mg/dL",
    normalRange: "8.6 - 10.2",
  });
}

async function ensureFerritinTestConfiguration() {
  await ensureSingleParameterTestConfiguration({
    names: ["Ferritin", "Ferritin (Serum)", "Serum Ferritin"],
    createName: "Ferritin",
    createCode: "FERRITIN",
    category: "Biochemistry",
    sampleType: "Serum",
    turnaroundHours: 24,
    parameterName: "Ferritin, Serum",
    parameterAliases: ["Ferritin", "Serum Ferritin"],
    unit: "ng/mL",
    normalRange: "22.00 - 322.00",
  });
}

async function ensureCPeptideTestConfiguration() {
  await ensureSingleParameterTestConfiguration({
    names: ["C-Peptide Level", "C-Peptide Fasting", "C Peptide Fasting", "C-Peptide"],
    createName: "C-Peptide Fasting",
    createCode: "CPEPTIDE",
    category: "Hormones",
    sampleType: "Serum",
    turnaroundHours: 24,
    parameterName: "C-Peptide Fasting, Serum",
    parameterAliases: ["C-Peptide", "C Peptide", "C-Peptide Level"],
    unit: "ng/mL",
    normalRange: "0.50 - 2.00",
  });
}

async function ensureVldlCholesterolTestConfiguration() {
  await ensureSingleParameterTestConfiguration({
    names: ["VLDL-Cholesterol", "VLDL Cholesterol", "Very Low Density Lipoprotein Cholesterol"],
    createName: "VLDL Cholesterol",
    createCode: "VLDL",
    category: "Biochemistry",
    sampleType: "Serum",
    turnaroundHours: 24,
    parameterName: "VLDL Cholesterol",
    parameterAliases: ["VLDL-C", "Very Low Density Lipoprotein Cholesterol"],
    unit: "mg/dL",
    normalRange: "2.00 - 30.00",
  });
}

async function ensureComprehensiveMetabolicPanelTestConfiguration() {
  let cmpTests = await all(
    `SELECT id FROM tests
     WHERE LOWER(name) IN (LOWER(?), LOWER(?), LOWER(?))
     ORDER BY id ASC`,
    ["Comprehensive Metabolic Panel (CMP)", "Comprehensive Metabolic Panel", "CMP"]
  );

  if (!cmpTests.length) {
    const created = await run(
      `INSERT INTO tests (name, code, category, sample_type, price, turnaround_hours, active, created_at)
       VALUES (?, ?, ?, ?, 0, ?, 1, ?)`,
      ["Comprehensive Metabolic Panel (CMP)", "CMP", "Biochemistry", "Serum", 24, buildNow()]
    );
    cmpTests = [{ id: created.id }];
  }

  const parameters = [
    { name: "AST (SGOT)", aliases: ["SGOT / AST"], unit: "U/L", range: "15.00 - 40.00" },
    { name: "ALT (SGPT)", aliases: ["SGPT / ALT"], unit: "U/L", range: "10.00 - 49.00" },
    { name: "Alkaline Phosphatase (ALP)", aliases: ["ALP (Alkaline Phosphatase)", "Alkaline Phosphatase"], unit: "U/L", range: "30.00 - 120.00" },
    { name: "Bilirubin Total", aliases: ["Total Bilirubin"], unit: "mg/dL", range: "0.30 - 1.20" },
    { name: "Total Protein", aliases: [], unit: "g/dL", range: "5.70 - 8.20" },
    { name: "Albumin", aliases: [], unit: "g/dL", range: "3.20 - 4.80" },
    { name: "GFR", aliases: ["eGFR", "Estimated GFR"], unit: "mL/min/1.73 m²", range: "> 60.00" },
    { name: "Glucose, Fasting", aliases: ["Fasting Glucose", "Glucose Fasting"], unit: "mg/dL", range: "70.00 - 99.00" },
    { name: "Sodium", aliases: [], unit: "mmol/L", range: "135.00 - 145.00" },
    { name: "Potassium", aliases: [], unit: "mmol/L", range: "3.50 - 5.00" },
    { name: "Calcium", aliases: ["Calcium, Serum", "Total Calcium"], unit: "mg/dL", range: "8.50 - 10.50" },
    { name: "BUN", aliases: ["Blood Urea Nitrogen"], unit: "mg/dL", range: "7.00 - 20.00" },
    { name: "Creatinine", aliases: [], unit: "mg/dL", range: "0.60 - 1.30" },
  ];

  for (const cmpTest of cmpTests) {
    await run(
      "UPDATE tests SET sample_type = ?, turnaround_hours = ?, active = 1 WHERE id = ?",
      ["Serum", 24, cmpTest.id]
    );

    for (const [index, definition] of parameters.entries()) {
      let parameter = null;
      for (const parameterName of [definition.name, ...definition.aliases]) {
        parameter = await get(
          `SELECT id FROM test_parameters
           WHERE test_id = ? AND LOWER(parameter_name) = LOWER(?)
           ORDER BY display_order ASC, id ASC LIMIT 1`,
          [cmpTest.id, parameterName]
        );
        if (parameter) break;
      }

      if (!parameter && index === 0) {
        parameter = await get(
          `SELECT id FROM test_parameters
           WHERE test_id = ? AND LOWER(parameter_name) = LOWER(?)
           ORDER BY display_order ASC, id ASC LIMIT 1`,
          [cmpTest.id, "Result"]
        );
      }

      if (parameter) {
        await run(
          `UPDATE test_parameters
           SET parameter_name = ?, unit = ?, normal_range = ?, display_order = ?
           WHERE id = ?`,
          [definition.name, definition.unit, definition.range, index + 1, parameter.id]
        );
        continue;
      }

      await run(
        `INSERT INTO test_parameters (test_id, parameter_name, unit, normal_range, display_order)
         VALUES (?, ?, ?, ?, ?)`,
        [cmpTest.id, definition.name, definition.unit, definition.range, index + 1]
      );
    }
  }
}

async function ensureElectrolyteProfileTestConfiguration() {
  let electrolyteTests = await all(
    `SELECT id FROM tests
     WHERE LOWER(name) IN (LOWER(?), LOWER(?), LOWER(?))
     ORDER BY id ASC`,
    ["Electrolyte Profile", "Electrolytes", "Serum Electrolytes"]
  );

  if (!electrolyteTests.length) {
    const created = await run(
      `INSERT INTO tests (name, code, category, sample_type, price, turnaround_hours, active, created_at)
       VALUES (?, ?, ?, ?, 0, ?, 1, ?)`,
      ["Electrolytes", "ELECTROLYTES", "Biochemistry", "Serum", 24, buildNow()]
    );
    electrolyteTests = [{ id: created.id }];
  }

  const parameters = [
    { name: "Sodium", unit: "mEq/L", range: "136.00 - 145.00" },
    { name: "Potassium", unit: "mEq/L", range: "3.50 - 5.10" },
    { name: "Chloride", unit: "mEq/L", range: "98.00 - 107.00" },
    { name: "Bicarbonate", unit: "mEq/L", range: "22.00 - 28.00" },
    { name: "Calcium", unit: "mg/dL", range: "8.6 - 10.2" },
    { name: "Magnesium", unit: "mg/dL", range: "1.8 - 2.3" },
  ];

  for (const electrolyteTest of electrolyteTests) {
    await run(
      "UPDATE tests SET sample_type = ?, turnaround_hours = ?, active = 1 WHERE id = ?",
      ["Serum", 24, electrolyteTest.id]
    );

    for (const [index, definition] of parameters.entries()) {
      let parameter = await get(
        `SELECT id FROM test_parameters
         WHERE test_id = ? AND LOWER(parameter_name) = LOWER(?)
         ORDER BY display_order ASC, id ASC LIMIT 1`,
        [electrolyteTest.id, definition.name]
      );

      if (!parameter && index === 0) {
        parameter = await get(
          `SELECT id FROM test_parameters
           WHERE test_id = ? AND LOWER(parameter_name) = LOWER(?)
           ORDER BY display_order ASC, id ASC LIMIT 1`,
          [electrolyteTest.id, "Result"]
        );
      }

      if (parameter) {
        await run(
          `UPDATE test_parameters
           SET parameter_name = ?, unit = ?, normal_range = ?, display_order = ?
           WHERE id = ?`,
          [definition.name, definition.unit, definition.range, index + 1, parameter.id]
        );
        continue;
      }

      await run(
        `INSERT INTO test_parameters (test_id, parameter_name, unit, normal_range, display_order)
         VALUES (?, ?, ?, ?, ?)`,
        [electrolyteTest.id, definition.name, definition.unit, definition.range, index + 1]
      );
    }
  }
}

async function ensurePotassiumTestConfiguration() {
  await ensureSingleParameterTestConfiguration({
    names: ["Potassium(Serum)", "Potassium (Serum)", "Potassium, Serum", "Serum Potassium"],
    createName: "Potassium (Serum)",
    createCode: "POTASSIUM",
    category: "Biochemistry",
    sampleType: "Serum",
    turnaroundHours: 24,
    parameterName: "Potassium, Serum",
    parameterAliases: ["Potassium", "Serum Potassium"],
    unit: "mEq/L",
    normalRange: "3.5 - 5.2",
  });
}

async function ensureAstSgotTestConfiguration() {
  await ensureSingleParameterTestConfiguration({
    names: ["SGOT / AST", "AST (SGOT)", "Aspartate Aminotransferase (AST) - SGOT"],
    createName: "SGOT / AST",
    createCode: "AST",
    category: "Biochemistry",
    sampleType: "Serum",
    turnaroundHours: 24,
    parameterName: "AST (SGOT), Serum",
    parameterAliases: ["AST (SGOT)", "SGOT", "AST"],
    unit: "U/L",
    normalRange: "10.00 - 40.00",
  });
}

async function ensureGlobulinTestConfiguration() {
  await ensureSingleParameterTestConfiguration({
    names: ["Globulin", "Globulin (Serum)", "Serum Globulin"],
    createName: "Globulin",
    createCode: "GLOBULIN",
    category: "Biochemistry",
    sampleType: "Serum",
    turnaroundHours: 24,
    parameterName: "Globulin, Serum",
    parameterAliases: ["Globulin", "Serum Globulin"],
    unit: "g/dL",
    normalRange: "2.00 - 3.50",
  });
}

async function ensureAlbuminTestConfiguration() {
  await ensureSingleParameterTestConfiguration({
    names: ["Albumin", "Albumin (Serum)", "Serum Albumin"],
    createName: "Albumin",
    createCode: "ALBUMIN",
    category: "Biochemistry",
    sampleType: "Serum",
    turnaroundHours: 24,
    parameterName: "Albumin, Serum",
    parameterAliases: ["Albumin", "Serum Albumin"],
    unit: "g/dL",
    normalRange: "3.40 - 5.40",
  });
}

async function ensureBunTestConfiguration() {
  await ensureSingleParameterTestConfiguration({
    names: ["BUN (Blood Urea Nitrogen)", "Blood Urea Nitrogen (BUN)", "BUN"],
    createName: "BUN (Blood Urea Nitrogen)",
    createCode: "BUN",
    category: "Biochemistry",
    sampleType: "Serum",
    turnaroundHours: 24,
    parameterName: "Blood Urea Nitrogen (BUN)",
    parameterAliases: ["BUN", "Blood Urea Nitrogen", "Urea Nitrogen"],
    unit: "mg/dL",
    normalRange: "7.00 - 20.00",
  });
}

async function ensureSodiumTestConfiguration() {
  await ensureSingleParameterTestConfiguration({
    names: ["Sodium (Serum)", "Sodium, Serum", "Serum Sodium", "Sodium"],
    createName: "Sodium (Serum)",
    createCode: "SODIUM",
    category: "Biochemistry",
    sampleType: "Serum",
    turnaroundHours: 24,
    parameterName: "Sodium, Serum",
    parameterAliases: ["Sodium", "Serum Sodium"],
    unit: "mEq/L",
    normalRange: "136.00 - 145.00",
  });
}

async function ensureIronTestConfiguration() {
  await ensureSingleParameterTestConfiguration({
    names: ["Iron", "Iron (Serum)", "Serum Iron"],
    createName: "Iron",
    createCode: "IRON",
    category: "Biochemistry",
    sampleType: "Serum",
    turnaroundHours: 24,
    parameterName: "Iron, Serum",
    parameterAliases: ["Iron", "Serum Iron"],
    unit: "mcg/dL",
    normalRange: "50.00 - 170.00",
  });
}

async function ensureLacticAcidTestConfiguration() {
  await ensureSingleParameterTestConfiguration({
    names: ["Lactic Acid (Lactate)", "Lactic Acid", "Lactate", "Lactate (Plasma)"],
    createName: "Lactic Acid (Lactate)",
    createCode: "LACTATE",
    category: "Biochemistry",
    sampleType: "Plasma",
    turnaroundHours: 24,
    parameterName: "Lactate, Plasma",
    parameterAliases: ["Lactic Acid", "Lactate"],
    unit: "mg/dL",
    normalRange: "4.5 - 19.8",
  });
}

async function ensureMagnesiumTestConfiguration() {
  await ensureSingleParameterTestConfiguration({
    names: ["Magnesium", "Magnesium (Serum)", "Serum Magnesium"],
    createName: "Magnesium",
    createCode: "MAGNESIUM",
    category: "Biochemistry",
    sampleType: "Serum",
    turnaroundHours: 24,
    parameterName: "Magnesium, Serum",
    parameterAliases: ["Magnesium", "Serum Magnesium"],
    unit: "mg/dL",
    normalRange: "1.70 - 2.20",
  });
}

async function ensureLipaseTestConfiguration() {
  await ensureSingleParameterTestConfiguration({
    names: ["Lipase", "Lipase (Serum)", "Serum Lipase"],
    createName: "Lipase",
    createCode: "LIPASE",
    category: "Biochemistry",
    sampleType: "Serum",
    turnaroundHours: 24,
    parameterName: "Lipase, Serum",
    parameterAliases: ["Lipase", "Serum Lipase"],
    unit: "U/L",
    normalRange: "< 67.00",
  });
}

async function ensureAmylaseTestConfiguration() {
  await ensureSingleParameterTestConfiguration({
    names: ["Amylase", "Amylase (Serum)", "Serum Amylase"],
    createName: "Amylase",
    createCode: "AMYLASE",
    category: "Biochemistry",
    sampleType: "Serum",
    turnaroundHours: 24,
    parameterName: "Amylase, Serum",
    parameterAliases: ["Amylase", "Serum Amylase"],
    unit: "U/L",
    normalRange: "28.00 - 100.00",
  });
}

async function ensureGgtTestConfiguration() {
  await ensureSingleParameterTestConfiguration({
    names: ["Gamma Glutamyl Transferase (GGT)", "Gamma-Glutamyl Transferase (GGT)", "GGT", "GGTP", "Gamma Glutamyl Transferase"],
    createName: "Gamma Glutamyl Transferase (GGT)",
    createCode: "GGT",
    category: "Biochemistry",
    sampleType: "Serum",
    turnaroundHours: 24,
    parameterName: "Gamma-Glutamyl Transferase (GGT), Serum",
    parameterAliases: ["GGT", "GGTP", "Gamma Glutamyl Transferase"],
    unit: "U/L",
    normalRange: "12.00 - 18.00",
  });
}

async function ensureChlorideTestConfiguration() {
  await ensureSingleParameterTestConfiguration({
    names: ["Chloride (Serum)", "Chloride, Serum", "Serum Chloride", "Chloride"],
    createName: "Chloride (Serum)",
    createCode: "CHLORIDE",
    category: "Biochemistry",
    sampleType: "Serum",
    turnaroundHours: 24,
    parameterName: "Chloride, Serum",
    parameterAliases: ["Chloride", "Serum Chloride"],
    unit: "mEq/L",
    normalRange: "98.00 - 107.00",
  });
}

async function ensureCreatinineTestConfiguration() {
  await ensureSingleParameterTestConfiguration({
    names: ["Creatinine", "Creatinine (Serum)", "Serum Creatinine"],
    createName: "Creatinine (Serum)",
    createCode: "CREATININE",
    category: "Biochemistry",
    sampleType: "Serum",
    turnaroundHours: 24,
    parameterName: "Creatinine, Serum",
    parameterAliases: ["Creatinine", "Serum Creatinine"],
    unit: "mg/dL",
    normalRange: "0.55 - 1.02",
  });
}

async function ensureIonizedCalciumTestConfiguration() {
  await ensureSingleParameterTestConfiguration({
    names: ["Ionized Calcium (iCalcium)", "iCalcium", "Ionized Calcium", "Calcium, Ionized"],
    createName: "Ionized Calcium (iCalcium)",
    createCode: "ICALCIUM",
    category: "Biochemistry",
    sampleType: "Serum",
    turnaroundHours: 24,
    parameterName: "iCalcium, Serum",
    parameterAliases: ["Ionized Calcium", "Calcium, Ionized", "iCalcium", "Serum iCalcium"],
    unit: "mmol/L",
    normalRange: "1.16 - 1.32",
  });
}

async function ensureFlecainideTestConfiguration() {
  await ensureSingleParameterTestConfiguration({
    names: ["Flecainide", "Flecainide (Serum)", "Serum Flecainide"],
    createName: "Flecainide",
    createCode: "FLECAINIDE",
    category: "Therapeutic Drug Monitoring",
    sampleType: "Serum",
    turnaroundHours: 48,
    parameterName: "Flecainide",
    parameterAliases: ["Flecainide, Serum", "Serum Flecainide"],
    unit: "µg/mL",
    normalRange: "0.2 - 1.0",
  });
}

async function ensurePhenobarbitalTestConfiguration() {
  await ensureSingleParameterTestConfiguration({
    names: ["Phenobarbital", "Phenobarbitone", "Phenobarbitole", "Phenobarbital (Serum)", "Phenobarbitone (Serum)", "Phenobarbitole (Serum)"],
    createName: "Phenobarbital",
    createCode: "PHENOBARBITAL",
    category: "Therapeutic Drug Monitoring",
    sampleType: "Serum",
    turnaroundHours: 24,
    parameterName: "Phenobarbitone",
    parameterAliases: ["Phenobarbital", "Phenobarbitone", "Phenobarbitole", "Phenobarbitone, Serum", "Phenobarbitole, Serum", "Phenobarbital, Serum"],
    unit: "µg/mL",
    normalRange: "15.00 - 40.00",
  });
}

async function ensureKetoneBodyTestConfiguration() {
  await ensureSingleParameterTestConfiguration({
    names: ["Ketone Body (Beta Hydroxybutyrate)", "Ketone Body", "Beta Hydroxybutyrate", "Beta-Hydroxybutyrate"],
    createName: "Ketone Body (Beta Hydroxybutyrate)",
    createCode: "KETONE_BODY",
    category: "Biochemistry",
    sampleType: "Serum",
    turnaroundHours: 24,
    parameterName: "Ketone Body (Beta Hydroxybutyrate), Serum",
    parameterAliases: ["Beta Hydroxybutyrate", "Beta-Hydroxybutyrate", "Ketone Body"],
    unit: "mmol/L",
    normalRange: "0.02 - 0.27",
  });
}

async function ensureUricAcidTestConfiguration() {
  await ensureSingleParameterTestConfiguration({
    names: ["Uric Acid", "Uric Acid (Serum)", "Serum Uric Acid"],
    createName: "Uric Acid",
    createCode: "URIC_ACID",
    category: "Biochemistry",
    sampleType: "Serum",
    turnaroundHours: 24,
    parameterName: "Uric Acid, Serum",
    parameterAliases: ["Uric Acid", "Serum Uric Acid"],
    unit: "mg/dL",
    normalRange: "3.50 - 7.20",
  });
}

async function ensureTibcTestConfiguration() {
  await ensureSingleParameterTestConfiguration({
    names: ["Total Iron Binding Capacity (TIBC)", "TIBC (Total Iron Binding Capacity)", "TIBC"],
    createName: "Total Iron Binding Capacity (TIBC)",
    createCode: "TIBC",
    category: "Biochemistry",
    sampleType: "Serum",
    turnaroundHours: 24,
    parameterName: "Total Iron Binding Capacity (TIBC)",
    parameterAliases: ["TIBC", "Total Iron Binding Capacity"],
    unit: "mcg/dL",
    normalRange: "250.00 - 450.00",
  });
}

async function ensureSerumOsmolalityTestConfiguration() {
  await ensureSingleParameterTestConfiguration({
    names: ["Serum Osmolality", "Osmolality, Serum", "Osmolality (Serum)"],
    createName: "Serum Osmolality",
    createCode: "OSMOLALITY",
    category: "Biochemistry",
    sampleType: "Serum",
    turnaroundHours: 4,
    parameterName: "Osmolality",
    parameterAliases: ["Serum Osmolality", "Osmolality, Serum"],
    unit: "mOsm/kgH2O",
    normalRange: "278.00 - 298.00",
  });
}

async function ensureCreatinine24HourUrineTestConfiguration() {
  let tests = await all(
    `SELECT id FROM tests
     WHERE LOWER(name) IN (LOWER(?), LOWER(?), LOWER(?), LOWER(?))
     ORDER BY id ASC`,
    [
      "Creatinine (24 hrs. urine)",
      "Creatinine, 24-Hour Urine",
      "Creatinine 24 Hour Urine",
      "Creatinine, 24 Hour Urine",
    ]
  );

  if (!tests.length) {
    const created = await run(
      `INSERT INTO tests (name, code, category, sample_type, price, turnaround_hours, active, created_at)
       VALUES (?, ?, ?, ?, 0, ?, 1, ?)`,
      ["Creatinine, 24-Hour Urine", "CREATININE_24H_URINE", "Chemistry", "Urine", 24, buildNow()]
    );
    tests = [{ id: created.id }];
  }

  const parameters = [
    { name: "Creatinine, 24 Hour", unit: "mg/kg/day", range: "14.00 - 26.00" },
    { name: "Total Urine Volume", unit: "mL/day", range: "800.00 - 1800.00" },
    { name: "Body Weight", unit: "kg", range: "" },
  ];

  for (const test of tests) {
    await run(
      "UPDATE tests SET category = ?, sample_type = ?, turnaround_hours = ?, active = 1 WHERE id = ?",
      ["Chemistry", "Urine", 24, test.id]
    );

    for (const [index, definition] of parameters.entries()) {
      let parameter = await get(
        `SELECT id FROM test_parameters
         WHERE test_id = ? AND LOWER(parameter_name) = LOWER(?)
         ORDER BY display_order ASC, id ASC LIMIT 1`,
        [test.id, definition.name]
      );

      if (!parameter && index === 0) {
        parameter = await get(
          `SELECT id FROM test_parameters
           WHERE test_id = ? AND LOWER(parameter_name) = LOWER(?)
           ORDER BY display_order ASC, id ASC LIMIT 1`,
          [test.id, "Result"]
        );
      }

      if (parameter) {
        await run(
          `UPDATE test_parameters
           SET parameter_name = ?, unit = ?, normal_range = ?, display_order = ?
           WHERE id = ?`,
          [definition.name, definition.unit, definition.range, index + 1, parameter.id]
        );
        continue;
      }

      await run(
        `INSERT INTO test_parameters (test_id, parameter_name, unit, normal_range, display_order)
         VALUES (?, ?, ?, ?, ?)`,
        [test.id, definition.name, definition.unit, definition.range, index + 1]
      );
    }
  }
}

async function ensureArterialBloodGasTestConfiguration() {
  let tests = await all(
    `SELECT id FROM tests
     WHERE LOWER(name) IN (LOWER(?), LOWER(?), LOWER(?), LOWER(?))
     ORDER BY id ASC`,
    [
      "Blood Gas Analysis, Arterial",
      "Arterial Blood Gas Analysis",
      "Arterial Blood Gas",
      "ABG",
    ]
  );

  if (!tests.length) {
    const created = await run(
      `INSERT INTO tests (name, code, category, sample_type, price, turnaround_hours, active, created_at)
       VALUES (?, ?, ?, ?, 0, ?, 1, ?)`,
      ["Blood Gas Analysis, Arterial", "ABG", "Biochemistry", "Arterial Blood", 4, buildNow()]
    );
    tests = [{ id: created.id }];
  }

  const parameters = [
    { name: "pH", aliases: ["pH", "PH", "Result"], unit: "", range: "7.35 - 7.45" },
    { name: "PCO2", aliases: ["PCO2", "pCO2", "PCO₂"], unit: "mmHg", range: "35.00 - 45.00" },
    { name: "Bicarbonate (HCO3)", aliases: ["Bicarbonate (HCO3)", "BICARBONATE (HCO3)", "HCO3"], unit: "mEq/L", range: "21.00 - 28.00" },
    { name: "Total CO2 Contents (TCO2)", aliases: ["Total CO2 Contents (TCO2)", "TOTAL CO2 CONTENTS (TCO2)", "TCO2"], unit: "mmol/L", range: "23.00 - 27.00" },
    { name: "Standard Bicarbonate (SBC)", aliases: ["Standard Bicarbonate (SBC)", "STANDARD BICARBONATE (SBC)", "SBC"], unit: "mEq/L", range: "22.00 - 26.00" },
    { name: "Base Excess", aliases: ["Base Excess", "BASE EXCESS"], unit: "mEq/L", range: "-2.00 - 3.00" },
    { name: "PO2", aliases: ["PO2", "pO2", "PO₂"], unit: "mmHg", range: "83.00 - 108.00" },
    { name: "Oxygen Saturation Capacity", aliases: ["Oxygen Saturation Capacity", "OXYGEN SATURATION CAPACITY", "Oxygen Saturation"], unit: "%", range: "95.00 - 98.00" },
    { name: "Base Excess - Extracellular Fluid", aliases: ["Base Excess - Extracellular Fluid", "BASE EXCESS - EXTRACELLULAR FLUID", "Base Excess ECF"], unit: "mEq/L", range: "<0.02" },
    { name: "Hemoglobin", aliases: ["Hemoglobin", "HEMOGLOBIN", "Hb"], unit: "g/dL", range: "13.00 - 18.00" },
  ];

  for (const test of tests) {
    await run(
      "UPDATE tests SET category = ?, sample_type = ?, turnaround_hours = ?, active = 1 WHERE id = ?",
      ["Biochemistry", "Arterial Blood", 4, test.id]
    );

    for (const [index, definition] of parameters.entries()) {
      const placeholders = definition.aliases.map(() => "LOWER(?)").join(", ");
      const parameter = await get(
        `SELECT id FROM test_parameters
         WHERE test_id = ? AND LOWER(parameter_name) IN (${placeholders})
         ORDER BY display_order ASC, id ASC LIMIT 1`,
        [test.id, ...definition.aliases]
      );

      if (parameter) {
        await run(
          `UPDATE test_parameters
           SET parameter_name = ?, unit = ?, normal_range = ?, display_order = ?
           WHERE id = ?`,
          [definition.name, definition.unit, definition.range, index + 1, parameter.id]
        );
        continue;
      }

      await run(
        `INSERT INTO test_parameters (test_id, parameter_name, unit, normal_range, display_order)
         VALUES (?, ?, ?, ?, ?)`,
        [test.id, definition.name, definition.unit, definition.range, index + 1]
      );
    }
  }
}

async function ensureManganeseBloodTestConfiguration() {
  await ensureSingleParameterTestConfiguration({
    names: ["Manganese, Blood", "Manganese Blood", "Blood Manganese"],
    createName: "Manganese, Blood",
    createCode: "MANGANESE",
    category: "Biochemistry",
    sampleType: "Blood",
    turnaroundHours: 24,
    parameterName: "Manganese",
    parameterAliases: ["Blood Manganese"],
    unit: "µg/L",
    normalRange: "4.20 - 16.50",
  });
}

async function ensureSeleniumSerumTestConfiguration() {
  await ensureSingleParameterTestConfiguration({
    names: ["Selenium, Serum", "Serum Selenium", "Selenium"],
    createName: "Selenium, Serum",
    createCode: "SELENIUM",
    category: "Biochemistry",
    sampleType: "Serum",
    turnaroundHours: 4,
    parameterName: "Selenium",
    parameterAliases: ["Serum Selenium"],
    unit: "µg/L",
    normalRange: "23.00 - 190.00",
  });
}

async function ensureCbcParameters(testId, parameters) {
  for (const [index, parameter] of parameters.entries()) {
    const existing = await get(
      "SELECT id FROM test_parameters WHERE test_id = ? AND LOWER(parameter_name) = LOWER(?)",
      [testId, parameter.parameterName]
    );
    if (existing) continue;

    await run(
      `INSERT INTO test_parameters (
         test_id, parameter_name, unit, normal_range,
         entry_mode, calculation_formula, calculation_precision, display_order
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        testId,
        parameter.parameterName,
        parameter.unit,
        parameter.normalRange,
        parameter.entryMode === "calculated" ? "calculated" : "manual",
        parameter.entryMode === "calculated" ? (parameter.formula || null) : null,
        Number.isInteger(parameter.precision) ? parameter.precision : 2,
        index + 1,
      ]
    );
  }
}

async function applyOneTimeMigration(name, work) {
  const applied = await get("SELECT name FROM app_migrations WHERE name = ?", [name]);
  if (applied) return;

  await work();
  await run("INSERT INTO app_migrations (name) VALUES (?)", [name]);
}

async function repairImportedLegacyReportSchemas() {
  const testsWithoutParameters = await all(`
    SELECT t.id, t.name, t.sample_type
    FROM tests t
    WHERE LOWER(TRIM(COALESCE(t.category, ''))) = 'imported legacy catalogue'
      AND NOT EXISTS (
        SELECT 1 FROM test_parameters parameter
        WHERE parameter.test_id = t.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM test_bundle_items item
        WHERE item.bundle_test_id = t.id
      )
    ORDER BY t.id ASC
  `);
  const canonicalSchemaCache = new Map();

  for (const test of testsWithoutParameters) {
    const canonicalName = getCanonicalSchemaTargetForLegacyTest(test.name);
    let parameters = [];

    if (canonicalName) {
      if (!canonicalSchemaCache.has(canonicalName)) {
        const canonicalTest = await get(
          `SELECT id
           FROM tests
           WHERE LOWER(name) = LOWER(?)
             AND LOWER(TRIM(COALESCE(category, ''))) <> 'imported legacy catalogue'
           ORDER BY id ASC
           LIMIT 1`,
          [canonicalName]
        );
        const canonicalParameters = canonicalTest
          ? await all(
            `SELECT parameter_name, unit, normal_range, entry_mode, calculation_formula, calculation_precision
             FROM test_parameters
             WHERE test_id = ?
             ORDER BY display_order ASC, id ASC`,
            [canonicalTest.id]
          )
          : [];
        canonicalSchemaCache.set(canonicalName, canonicalParameters);
      }
      parameters = canonicalSchemaCache.get(canonicalName);
    }

    if (!parameters.length) {
      parameters = getFallbackReportParameters(test).map((parameter) => ({
        parameter_name: parameter.parameterName,
        unit: parameter.unit,
        normal_range: parameter.normalRange,
        entry_mode: parameter.entryMode,
        calculation_formula: parameter.calculationFormula,
        calculation_precision: parameter.calculationPrecision,
      }));
    }

    for (const [index, parameter] of parameters.entries()) {
      await run(
        `INSERT INTO test_parameters (
           test_id, parameter_name, unit, normal_range,
           entry_mode, calculation_formula, calculation_precision, display_order
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          test.id,
          parameter.parameter_name,
          parameter.unit || "",
          parameter.normal_range || "",
          parameter.entry_mode === "calculated" ? "calculated" : "manual",
          parameter.entry_mode === "calculated" ? (parameter.calculation_formula || null) : null,
          Number.isInteger(parameter.calculation_precision) ? parameter.calculation_precision : 2,
          index + 1,
        ]
      );
    }
  }
}

async function upgradeCbcCalculationDefaults() {
  const cbcTests = await all(
    "SELECT id FROM tests WHERE LOWER(name) LIKE '%complete blood count%' OR LOWER(code) = 'cbc'"
  );
  const expectedCalculations = new Map([
    ["MCV (Mean Corpuscular Volume)", { formula: "{PCV (Packed Cell Volume)} * 10 / {Erythrocytes}", precision: 2 }],
    ["MCH (Mean Corpuscular Haemoglobin)", { formula: "{Hb(Haemoglobin)} * 10 / {Erythrocytes}", precision: 1 }],
    ["MCHC (Mean Corpuscular Hb. Concentration)", { formula: "{Hb(Haemoglobin)} * 100 / {PCV (Packed Cell Volume)}", precision: 1 }],
    ["Absolute Neutrophils", { formula: "{Leukocytes} * {Neutrophils} / 100", precision: 0 }],
    ["Absolute Lymphocytes", { formula: "{Leukocytes} * {Lymphocytes} / 100", precision: 0 }],
    ["Absolute Eosinophils", { formula: "{Leukocytes} * {Eosinophils} / 100", precision: 0 }],
    ["Absolute Monocytes", { formula: "{Leukocytes} * {Monocytes} / 100", precision: 0 }],
    ["Absolute Basophils", { formula: "{Leukocytes} * {Basophils} / 100", precision: 0 }],
  ]);
  const legacyPcvFormula = "{erythrocytes} * {mcv (mean corpuscular volume)} / 10";

  for (const test of cbcTests) {
    for (const [parameterName, calculation] of expectedCalculations) {
      await run(
        `UPDATE test_parameters
         SET entry_mode = 'calculated', calculation_formula = ?, calculation_precision = ?
         WHERE test_id = ? AND LOWER(parameter_name) = LOWER(?)
           AND (calculation_formula IS NULL OR calculation_formula = '')`,
        [calculation.formula, calculation.precision, test.id, parameterName]
      );
    }

    const pcv = await get(
      `SELECT id, calculation_formula FROM test_parameters
       WHERE test_id = ? AND LOWER(parameter_name) = LOWER(?)`,
      [test.id, "PCV (Packed Cell Volume)"]
    );
    if (pcv && String(pcv.calculation_formula || "").trim().toLowerCase() === legacyPcvFormula) {
      await run(
        `UPDATE test_parameters
         SET entry_mode = 'manual', calculation_formula = NULL, calculation_precision = 2
         WHERE id = ?`,
        [pcv.id]
      );
    }
  }
}

function normalizeCbcParameterName(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function getCbcDefinitionsForTest(testName) {
  const normalizedName = String(testName || "").toLowerCase();
  const matchingVariant = CBC_REPORT_TESTS.find((test) => test.name.toLowerCase() === normalizedName);
  return matchingVariant ? matchingVariant.parameters : CBC_COMMON_PARAMETERS;
}

async function normalizeCbcCatalogParameters() {
  const cbcTests = await all(
    "SELECT id, name FROM tests WHERE LOWER(name) LIKE '%complete blood count%' OR LOWER(code) = 'cbc'"
  );

  for (const test of cbcTests) {
    const definitions = getCbcDefinitionsForTest(test.name);
    const catalogParameters = await all(
      "SELECT id, parameter_name FROM test_parameters WHERE test_id = ? ORDER BY display_order ASC, id ASC",
      [test.id]
    );

    for (const [index, definition] of definitions.entries()) {
      const acceptedNames = new Set(
        [definition.parameterName, definition.label, ...(definition.aliases || [])]
          .map(normalizeCbcParameterName)
      );
      const matches = catalogParameters.filter((parameter) =>
        acceptedNames.has(normalizeCbcParameterName(parameter.parameter_name))
      );
      const canonical = matches.find((parameter) =>
        normalizeCbcParameterName(parameter.parameter_name) === normalizeCbcParameterName(definition.parameterName)
      ) || matches[0];
      const entryMode = definition.entryMode === "calculated" ? "calculated" : "manual";
      const formula = entryMode === "calculated" ? (definition.formula || null) : null;
      const precision = Number.isInteger(definition.precision) ? definition.precision : 2;

      if (canonical) {
        await run(
          `UPDATE test_parameters
           SET parameter_name = ?, unit = ?, normal_range = ?, entry_mode = ?,
               calculation_formula = ?, calculation_precision = ?, display_order = ?
           WHERE id = ?`,
          [
            definition.parameterName,
            definition.unit || "",
            definition.normalRange || "",
            entryMode,
            formula,
            precision,
            index + 1,
            canonical.id,
          ]
        );

        for (const duplicate of matches) {
          if (duplicate.id !== canonical.id) {
            await run("DELETE FROM test_parameters WHERE id = ?", [duplicate.id]);
          }
        }
      } else {
        await run(
          `INSERT INTO test_parameters (
             test_id, parameter_name, unit, normal_range,
             entry_mode, calculation_formula, calculation_precision, display_order
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            test.id,
            definition.parameterName,
            definition.unit || "",
            definition.normalRange || "",
            entryMode,
            formula,
            precision,
            index + 1,
          ]
        );
      }
    }
  }
}

async function seedCbcReportTests() {
  let standardCbc = await get(
    "SELECT id FROM tests WHERE LOWER(name) = LOWER(?) OR LOWER(code) = LOWER(?) ORDER BY id ASC LIMIT 1",
    ["Complete Blood Count", "CBC"]
  );
  if (!standardCbc) {
    const created = await run(
      `INSERT INTO tests (name, code, category, sample_type, price, turnaround_hours, active, created_at)
       VALUES (?, ?, ?, ?, 0, ?, 1, ?)`,
      ["Complete Blood Count", "CBC", "Hematology", "Whole Blood", 8, buildNow()]
    );
    standardCbc = { id: created.id };
  }
  await ensureCbcParameters(standardCbc.id, CBC_COMMON_PARAMETERS);

  for (const test of CBC_REPORT_TESTS) {
    let existing = await get("SELECT id FROM tests WHERE LOWER(name) = LOWER(?)", [test.name]);
    if (!existing) {
      const created = await run(
        `INSERT INTO tests (name, code, category, sample_type, price, turnaround_hours, active, created_at)
         VALUES (?, ?, ?, ?, 0, ?, 1, ?)`,
        [test.name, test.code, test.category, test.sampleType, test.turnaroundHours, buildNow()]
      );
      existing = { id: created.id };
    }

    await ensureCbcParameters(existing.id, test.parameters);
  }
}

async function configureDefaultCalculatedParameters() {
  const definitions = [
    {
      testNamePattern: "%liver function test%",
      parameters: [
        { names: ["Bilirubin Indirect"], formula: "{Bilirubin Total} - {Bilirubin Direct}", precision: 2 },
        { names: ["Globulin"], formula: "{Total Protein} - {Albumin}", precision: 2 },
        { names: ["A : G Ratio", "A G Ratio", "A:G Ratio"], formula: "{Albumin} / {Globulin}", precision: 2 },
      ],
    },
    {
      testNamePattern: "%prothrombin time%",
      parameters: [
        { names: ["Prothrombin Ratio (PR)"], formula: "{Patient value} / {Mean Normal Prothrombin Time (PT)}", precision: 2 },
        { names: ["International Normalized Ratio (INR)"], formula: "{Patient value} / {Mean Normal Prothrombin Time (PT)}", precision: 2 },
      ],
    },
  ];

  for (const definition of definitions) {
    const tests = await all(
      "SELECT id FROM tests WHERE LOWER(name) LIKE LOWER(?)",
      [definition.testNamePattern]
    );

    for (const test of tests) {
      for (const parameterDefinition of definition.parameters) {
        for (const parameterName of parameterDefinition.names) {
          const parameter = await get(
            `SELECT id, calculation_formula
             FROM test_parameters
             WHERE test_id = ? AND LOWER(parameter_name) = LOWER(?)
             ORDER BY display_order ASC, id ASC LIMIT 1`,
            [test.id, parameterName]
          );

          if (!parameter || parameter.calculation_formula) continue;

          await run(
            `UPDATE test_parameters
             SET entry_mode = 'calculated', calculation_formula = ?, calculation_precision = ?
             WHERE id = ?`,
            [parameterDefinition.formula, parameterDefinition.precision, parameter.id]
          );
          break;
        }
      }
    }
  }
}

async function ensureAbsoluteNeutrophilCountTestConfiguration() {
  let ancTest = await get(
    "SELECT id FROM tests WHERE LOWER(name) = LOWER(?) ORDER BY id ASC LIMIT 1",
    ["ANC (Absolute Neutrophil Count)"]
  ) || await get(
    "SELECT id FROM tests WHERE LOWER(name) = LOWER(?) ORDER BY id ASC LIMIT 1",
    ["Absolute Neutrophils Count"]
  ) || await get(
    "SELECT id FROM tests WHERE LOWER(name) = LOWER(?) ORDER BY id ASC LIMIT 1",
    ["Absolute Neutrophil Count"]
  );

  if (!ancTest) {
    const created = await run(
      `INSERT INTO tests (name, code, category, sample_type, price, turnaround_hours, active, created_at)
       VALUES (?, ?, ?, ?, 0, ?, 1, ?)`,
      ["ANC (Absolute Neutrophil Count)", "ANC4706", "Hematology", "Blood", 1, buildNow()]
    );
    ancTest = { id: created.id };
  }

  await run(
    `UPDATE tests
     SET name = ?, code = ?, category = ?, sample_type = ?, turnaround_hours = ?, active = 1
     WHERE id = ?`,
    ["ANC (Absolute Neutrophil Count)", "ANC4706", "Hematology", "Blood", 1, ancTest.id]
  );

  const ancParameter = await get(
    `SELECT id FROM test_parameters
     WHERE test_id = ? AND LOWER(parameter_name) = LOWER(?)
     ORDER BY display_order ASC, id ASC LIMIT 1`,
    [ancTest.id, "ABSOLUTE NEUTROPHIL COUNT"]
  ) || await get(
    "SELECT id FROM test_parameters WHERE test_id = ? ORDER BY display_order ASC, id ASC LIMIT 1",
    [ancTest.id]
  );

  if (ancParameter) {
    await run(
      `UPDATE test_parameters
       SET parameter_name = ?, unit = ?, normal_range = ?, display_order = 1
       WHERE id = ?`,
      ["ABSOLUTE NEUTROPHIL COUNT", "thou/mm3", "2.00 - 7.00", ancParameter.id]
    );
  } else {
    await run(
      `INSERT INTO test_parameters (test_id, parameter_name, unit, normal_range, display_order)
       VALUES (?, ?, ?, ?, 1)`,
      [ancTest.id, "ABSOLUTE NEUTROPHIL COUNT", "thou/mm3", "2.00 - 7.00"]
    );
  }

  let apcTest = await get(
    "SELECT id FROM tests WHERE LOWER(name) = LOWER(?) ORDER BY id ASC LIMIT 1",
    ["APC (Absolute Polymorphs Count)"]
  );

  if (!apcTest) {
    const created = await run(
      `INSERT INTO tests (name, code, category, sample_type, price, turnaround_hours, active, created_at)
       VALUES (?, ?, ?, ?, 0, ?, 1, ?)`,
      ["APC (Absolute Polymorphs Count)", "APC4706", "Hematology", "Blood", 24, buildNow()]
    );
    apcTest = { id: created.id };
  }

  const apcParameter = await get(
    `SELECT id FROM test_parameters
     WHERE test_id = ? AND LOWER(parameter_name) = LOWER(?)
     ORDER BY display_order ASC, id ASC LIMIT 1`,
    [apcTest.id, "ABSOLUTE POLYMORPHS COUNT (APC)"]
  ) || await get(
    "SELECT id FROM test_parameters WHERE test_id = ? ORDER BY display_order ASC, id ASC LIMIT 1",
    [apcTest.id]
  );

  if (apcParameter) {
    await run(
      `UPDATE test_parameters
       SET parameter_name = ?, unit = ?, normal_range = ?, display_order = 1
       WHERE id = ?`,
      ["ABSOLUTE POLYMORPHS COUNT (APC)", "cells/mcL", "1500 - 7500", apcParameter.id]
    );
  } else {
    await run(
      `INSERT INTO test_parameters (test_id, parameter_name, unit, normal_range, display_order)
       VALUES (?, ?, ?, ?, 1)`,
      [apcTest.id, "ABSOLUTE POLYMORPHS COUNT (APC)", "cells/mcL", "1500 - 7500"]
    );
  }
}

async function ensureAbsoluteCountTestConfigurations() {
  const definitions = [
    {
      name: "Absolute Lymphocyte Count (ALC)",
      aliases: ["Absolute Lymphocyte Count", "Absolute Lymphocytes Count"],
      code: "ABS6622",
      parameterName: "ABSOLUTE LYMPHOCYTE COUNT (ALC)",
      parameterSearch: "%lymphocyte%",
      normalRange: "1300 - 3500",
    },
    {
      name: "Absolute Eosinophil Count (AEC)",
      aliases: ["Absolute Eosinophil Count", "Absolute Eosinophils Count"],
      code: "ABS5177",
      parameterName: "ABSOLUTE EOSINOPHIL COUNT (AEC)",
      parameterSearch: "%eosinophil%",
      normalRange: "0 - 500",
    },
    {
      name: "Absolute Monocyte Count (AMC)",
      aliases: ["Absolute Monocyte Count", "Absolute Monocytes Count"],
      code: "AMC1005",
      parameterName: "ABSOLUTE MONOCYTE COUNT (AMC)",
      parameterSearch: "%monocyte%",
      normalRange: "200 - 950",
    },
    {
      name: "Absolute Basophil Count (ABC)",
      aliases: ["Absolute Basophil Count", "Absolute Basophils Count"],
      code: "ABC1004",
      parameterName: "ABSOLUTE BASOPHIL COUNT (ABC)",
      parameterSearch: "%basophil%",
      normalRange: "0 - 300",
    },
  ];

  for (const definition of definitions) {
    const matchingNames = [definition.name, ...definition.aliases];
    const placeholders = matchingNames.map(() => "LOWER(?)").join(", ");
    let test = await get(
      `SELECT id FROM tests
       WHERE LOWER(name) IN (${placeholders})
       ORDER BY id ASC LIMIT 1`,
      matchingNames
    );

    if (!test) {
      const created = await run(
        `INSERT INTO tests (name, code, category, sample_type, price, turnaround_hours, active, created_at)
         VALUES (?, ?, ?, ?, 0, ?, 1, ?)`,
        [definition.name, definition.code, "Hematology", "Blood", 24, buildNow()]
      );
      test = { id: created.id };
    }

    await run(
      `UPDATE tests
       SET name = ?, code = ?, category = ?, sample_type = ?, turnaround_hours = ?, active = 1
       WHERE id = ?`,
      [definition.name, definition.code, "Hematology", "Blood", 24, test.id]
    );

    const parameter = await get(
      `SELECT id FROM test_parameters
       WHERE test_id = ? AND LOWER(parameter_name) LIKE ?
       ORDER BY display_order ASC, id ASC LIMIT 1`,
      [test.id, definition.parameterSearch]
    ) || await get(
      "SELECT id FROM test_parameters WHERE test_id = ? ORDER BY display_order ASC, id ASC LIMIT 1",
      [test.id]
    );

    if (parameter) {
      await run(
        `UPDATE test_parameters
         SET parameter_name = ?, unit = ?, normal_range = ?, display_order = 1
         WHERE id = ?`,
        [definition.parameterName, "cells/mcL", definition.normalRange, parameter.id]
      );
      continue;
    }

    await run(
      `INSERT INTO test_parameters (test_id, parameter_name, unit, normal_range, display_order)
       VALUES (?, ?, ?, ?, 1)`,
      [test.id, definition.parameterName, "cells/mcL", definition.normalRange]
    );
  }
}

async function ensureEsrTestConfiguration() {
  const aliases = [
    "ESR (Erythrocyte Sedimentation Rate)",
    "Erythrocyte Sedimentation Rate",
    "ESR",
  ];
  const placeholders = aliases.map(() => "LOWER(?)").join(", ");
  let test = await get(
    `SELECT id FROM tests
     WHERE LOWER(name) IN (${placeholders})
     ORDER BY id ASC LIMIT 1`,
    aliases
  );

  if (!test) {
    const created = await run(
      `INSERT INTO tests (name, code, category, sample_type, price, turnaround_hours, active, created_at)
       VALUES (?, ?, ?, ?, 0, ?, 1, ?)`,
      ["ESR (Erythrocyte Sedimentation Rate)", "ESR7260", "Hematology", "Blood", 24, buildNow()]
    );
    test = { id: created.id };
  }

  await run(
    `UPDATE tests
     SET name = ?, code = ?, category = ?, sample_type = ?, turnaround_hours = ?, active = 1
     WHERE id = ?`,
    ["ESR (Erythrocyte Sedimentation Rate)", "ESR7260", "Hematology", "Blood", 24, test.id]
  );

  const parameter = await get(
    `SELECT id FROM test_parameters
     WHERE test_id = ? AND LOWER(parameter_name) = LOWER(?)
     ORDER BY display_order ASC, id ASC LIMIT 1`,
    [test.id, "ESR"]
  ) || await get(
    "SELECT id FROM test_parameters WHERE test_id = ? ORDER BY display_order ASC, id ASC LIMIT 1",
    [test.id]
  );

  if (parameter) {
    await run(
      `UPDATE test_parameters
       SET parameter_name = ?, unit = ?, normal_range = ?, display_order = 1
       WHERE id = ?`,
      ["ESR", "mm/hr", "0 - 15", parameter.id]
    );
    return;
  }

  await run(
    `INSERT INTO test_parameters (test_id, parameter_name, unit, normal_range, display_order)
     VALUES (?, ?, ?, ?, 1)`,
    [test.id, "ESR", "mm/hr", "0 - 15"]
  );
}

async function ensureIndividualHematologyReportTestConfigurations() {
  const definitions = [
    {
      name: "Prothrombin Time Studies",
      aliases: ["Prothrombin Time with INR", "Prothrombin Time (PT)", "Prothrombin Time", "PT"],
      code: "PTM1097",
      sampleType: "Citrated plasma",
      parameters: [
        { name: "Mean Normal Prothrombin Time (PT)", aliases: ["Mean Normal PT"], unit: "Sec", normalRange: "" },
        { name: "Patient value", aliases: ["Patient Value", "Prothrombin Time"], unit: "Sec", normalRange: "9.60 - 11.70" },
        { name: "Prothrombin Ratio (PR)", aliases: ["Prothrombin Ratio", "PR"], unit: "", normalRange: "" },
        { name: "International Normalized Ratio (INR)", aliases: ["International Normalised Ratio (INR)", "INR"], unit: "", normalRange: "0.90 - 1.10" },
      ],
    },
    {
      name: "Direct Coombs Test",
      aliases: ["Coombs Test, Direct, Serum", "Direct Antiglobulin Test", "DAT"],
      code: "DCT1006",
      sampleType: "EDTA Whole Blood",
      parameters: [
        { name: "COOMBS TEST, DIRECT, SERUM", aliases: ["Direct Coombs Test", "Result"], unit: "", normalRange: "" },
      ],
    },
    {
      name: "Indirect Coombs Test",
      aliases: ["Coombs Test, Indirect, Serum", "Indirect Antiglobulin Test", "ICT"],
      code: "ICT1008",
      sampleType: "Serum",
      parameters: [
        { name: "Result", aliases: ["COOMBS TEST, INDIRECT, SERUM", "Indirect Coombs Test"], unit: "", normalRange: "" },
        { name: "Titre", aliases: ["Titer"], unit: "", normalRange: "" },
      ],
    },
    {
      name: "Fibrinogen",
      aliases: ["Fibrinogen, Clotting Activity"],
      code: "FIB1007",
      sampleType: "Citrated plasma",
      parameters: [
        { name: "FIBRINOGEN, CLOTTING ACTIVITY", aliases: ["Fibrinogen"], unit: "mg/dL", normalRange: "200.00 - 400.00" },
      ],
    },
    {
      name: "Reticulocyte Count",
      aliases: ["RETICULOCYTE COUNT", "Reticulocyte Count (%)"],
      code: "RETIC",
      sampleType: "Whole Blood",
      parameters: [
        { name: "RETICULOCYTE COUNT", aliases: ["Reticulocyte Count"], unit: "%", normalRange: "0.5 - 2.5" },
      ],
    },
    {
      name: "Activated partial thromboplastin time, APTT",
      aliases: ["APTT", "APTT (Activated Partial Thromboplastin Time)", "Activated Partial Thromboplastin Time (APTT)"],
      code: "APTT1098",
      sampleType: "Citrated plasma",
      parameters: [
        { name: "Patient Value", aliases: ["APTT Patient Value"], unit: "Sec", normalRange: "23.70 - 33.00" },
        { name: "Control Value", aliases: ["APTT Control Value"], unit: "Sec", normalRange: "" },
      ],
    },
    {
      name: "Differential Leucocyte Count (DLC)",
      aliases: ["DLC", "Differential Leucocyte Count", "Differential Leukocyte Count"],
      code: "DLC1003",
      sampleType: "Blood",
      parameters: [
        { name: "Neutrophils", aliases: ["Neutrophil"], unit: "%", normalRange: "50 - 62" },
        { name: "Lymphocytes", aliases: ["Lymphocyte"], unit: "%", normalRange: "20 - 40" },
        { name: "Eosinophils", aliases: ["Eosinophil"], unit: "%", normalRange: "00 - 06" },
        { name: "Monocytes", aliases: ["Monocyte"], unit: "%", normalRange: "00 - 10" },
        { name: "Basophils", aliases: ["Basophil"], unit: "%", normalRange: "00 - 02" },
      ],
    },
    {
      name: "Total Leucocyte Count (TLC / TC / WBC)",
      aliases: ["Total Leucocyte Count (TLC)", "Total Leukocyte Count (TLC)", "TLC", "TC", "WBC", "WBC Count", "Total WBC Count", "White Blood Cell Count"],
      code: "TLC",
      sampleType: "Blood",
      parameters: [
        { name: "TOTAL LEUCOCYTE COUNT (TLC)", aliases: ["TLC", "TC", "WBC", "WBC Count", "Total WBC Count", "Total Leukocyte Count"], unit: "cumm", normalRange: "4000-11000" },
      ],
    },
    {
      name: "Red Blood Cell (RBC) Count",
      aliases: ["RBC", "RBC Count", "Red Blood Cell Count"],
      code: "RBC",
      sampleType: "Blood",
      parameters: [
        { name: "Total RBC Count", aliases: ["RBC Count", "Erythrocytes"], unit: "mill/cumm", normalRange: "4.5 - 5.5" },
      ],
    },
    {
      name: "Hematocrit (HCT / PCV)",
      aliases: ["Hematocrit (HCT)", "Haematocrit (HCT)", "HCT", "PCV", "Packed Cell Volume (PCV)", "Hematocrit", "Haematocrit"],
      code: "HCT",
      sampleType: "Blood",
      parameters: [
        {
          name: "HCT / PCV",
          aliases: ["HCT", "PCV", "Hematocrit (HCT)", "Haematocrit (HCT)", "Packed Cell Volume (PCV)", "Hematocrit", "Haematocrit"],
          unit: "%",
          normalRange: "40 - 50",
        },
      ],
    },
    {
      name: "Mean Platelet Volume (MPV)",
      aliases: ["MPV", "Mean Platelet Volume"],
      code: "MPV",
      sampleType: "Whole Blood",
      parameters: [
        { name: "Mean Platelet Volume (MPV)", aliases: ["MPV", "Result"], unit: "fL", normalRange: "6.50 - 12.00", entryMode: "manual" },
      ],
    },
    {
      name: "Mean Corpuscular Volume (MCV)",
      aliases: ["MCV", "Mean Corpuscular Volume"],
      code: "MCV",
      sampleType: "Blood",
      parameters: [
        { name: "Hematocrit (HCT / PCV)", aliases: ["HCT", "PCV", "Hematocrit", "Haematocrit", "Packed Cell Volume"], unit: "%", normalRange: "", entryMode: "manual" },
        { name: "Red Blood Cell (RBC) Count", aliases: ["RBC", "RBC Count", "Total RBC Count", "Erythrocytes"], unit: "mill/cumm", normalRange: "", entryMode: "manual" },
        { name: "Mean Corpuscular Volume (MCV)", aliases: ["MCV"], unit: "fL", normalRange: "83.00 - 101.00", entryMode: "calculated", formula: "{Hematocrit (HCT / PCV)} * 10 / {Red Blood Cell (RBC) Count}", precision: 2 },
      ],
    },
    {
      name: "Mean Corpuscular Hemoglobin (MCH)",
      aliases: ["MCH", "Mean Corpuscular Haemoglobin", "Mean Corpuscular Hemoglobin"],
      code: "MCH",
      sampleType: "Blood",
      parameters: [
        { name: "Hemoglobin (Hb)", aliases: ["Hb", "Hb(Haemoglobin)", "Hemoglobin", "Haemoglobin"], unit: "g/dL", normalRange: "", entryMode: "manual" },
        { name: "Red Blood Cell (RBC) Count", aliases: ["RBC", "RBC Count", "Total RBC Count", "Erythrocytes"], unit: "mill/cumm", normalRange: "", entryMode: "manual" },
        { name: "Mean Corpuscular Hemoglobin (MCH)", aliases: ["MCH", "Mean Corpuscular Haemoglobin"], unit: "pg", normalRange: "27.0 - 32.0", entryMode: "calculated", formula: "{Hemoglobin (Hb)} * 10 / {Red Blood Cell (RBC) Count}", precision: 1 },
      ],
    },
    {
      name: "Mean Corpuscular Hemoglobin Concentration (MCHC)",
      aliases: ["MCHC", "Mean Corpuscular Hb. Concentration"],
      code: "MCHC",
      sampleType: "Blood",
      parameters: [
        { name: "Hemoglobin (Hb)", aliases: ["Hb", "Hb(Haemoglobin)", "Hemoglobin", "Haemoglobin"], unit: "g/dL", normalRange: "", entryMode: "manual" },
        { name: "Hematocrit (HCT / PCV)", aliases: ["HCT", "PCV", "Hematocrit", "Haematocrit", "Packed Cell Volume"], unit: "%", normalRange: "", entryMode: "manual" },
        { name: "MCHC", aliases: ["Mean Corpuscular Hemoglobin Concentration", "Mean Corpuscular Hb. Concentration"], unit: "g/dL", normalRange: "32.5 - 34.5", entryMode: "calculated", formula: "{Hemoglobin (Hb)} * 100 / {Hematocrit (HCT / PCV)}", precision: 1 },
      ],
    },
    {
      name: "Platelet Count",
      aliases: ["Platelets Count", "Platelet Cell Count"],
      code: "PLT1001",
      sampleType: "Blood",
      parameters: [
        { name: "Platelet Count", aliases: ["PLATELET COUNT", "Platelets"], unit: "cumm", normalRange: "150000 - 410000" },
      ],
    },
    {
      name: "TORCH Profile",
      aliases: ["TORCH Panel", "TORCH Profile, IgG & IgM", "TORCH PANEL, IgG & IgM, SERUM"],
      code: "TORCH",
      category: "Serology",
      sampleType: "Serum",
      parameters: [
        { name: "Toxoplasma IgG", aliases: ["Toxo IgG"], unit: "IU/mL", normalRange: "< 7.20" },
        { name: "Toxoplasma IgM", aliases: ["Toxo IgM"], unit: "AU/mL", normalRange: "< 10.00" },
        { name: "Rubella IgG", aliases: [], unit: "IU/mL", normalRange: "< 7.00" },
        { name: "Rubella IgM", aliases: [], unit: "AU/mL", normalRange: "< 20.00" },
        { name: "Cytomegalovirus IgG", aliases: ["CMV IgG"], unit: "U/mL", normalRange: "< 12.00" },
        { name: "Cytomegalovirus IgM", aliases: ["CMV IgM"], unit: "U/mL", normalRange: "< 18.00" },
        { name: "Herpes simplex virus 1+2 IgG", aliases: ["HSV 1+2 IgG", "HSV IgG"], unit: "Index", normalRange: "< 0.90" },
        { name: "Herpes simplex virus 1+2 IgM", aliases: ["HSV 1+2 IgM", "HSV IgM"], unit: "Index", normalRange: "< 0.90" },
      ],
    },
    {
      name: "Tumour Necrosis Factor (TNF), Alpha",
      aliases: ["Tumor Necrosis Factor (TNF), Alpha", "TNF Alpha", "TNF-α"],
      code: "TNFA",
      category: "Immunology",
      sampleType: "Plasma (1 ml)",
      parameters: [
        { name: "TUMOUR NECROSIS FACTOR (TNF), ALPHA", aliases: ["TNF Alpha", "TNF-α", "Tumor Necrosis Factor Alpha"], unit: "pg/mL", normalRange: "< = 2.80" },
      ],
    },
    {
      name: "Hb(Haemoglobin)",
      aliases: ["Hemoglobin (Hb)", "Haemoglobin (Hb)", "Hemoglobin", "Haemoglobin"],
      code: "HBX3289",
      sampleType: "Blood",
      parameters: [
        { name: "Hemoglobin (Hb)", aliases: ["Hemoglobin", "Haemoglobin", "Hb"], unit: "g/dL", normalRange: "13.5 - 17.5" },
      ],
    },
  ];

  for (const definition of definitions) {
    const matchingNames = [definition.name, ...definition.aliases];
    const namePlaceholders = matchingNames.map(() => "LOWER(?)").join(", ");
    let test = await get(
      `SELECT id FROM tests
       WHERE LOWER(name) IN (${namePlaceholders})
       ORDER BY id ASC LIMIT 1`,
      matchingNames
    );

    if (!test) {
      const created = await run(
        `INSERT INTO tests (name, code, category, sample_type, price, turnaround_hours, active, created_at)
         VALUES (?, ?, ?, ?, 0, ?, 1, ?)`,
        [definition.name, definition.code, definition.category || "Hematology", definition.sampleType, 24, buildNow()]
      );
      test = { id: created.id };
    }

    await run(
      `UPDATE tests
       SET name = ?, code = ?, category = ?, sample_type = ?, turnaround_hours = ?, active = 1
       WHERE id = ?`,
      [definition.name, definition.code, definition.category || "Hematology", definition.sampleType, 24, test.id]
    );

    for (const [index, parameterDefinition] of definition.parameters.entries()) {
      const parameterNames = [parameterDefinition.name, ...(parameterDefinition.aliases || [])];
      const parameterPlaceholders = parameterNames.map(() => "LOWER(?)").join(", ");
      let parameter = await get(
        `SELECT id FROM test_parameters
         WHERE test_id = ? AND LOWER(parameter_name) IN (${parameterPlaceholders})
         ORDER BY display_order ASC, id ASC LIMIT 1`,
        [test.id, ...parameterNames]
      );

      if (!parameter && index === 0) {
        parameter = await get(
          "SELECT id FROM test_parameters WHERE test_id = ? ORDER BY display_order ASC, id ASC LIMIT 1",
          [test.id]
        );
      }

      if (parameter) {
        const entryMode = parameterDefinition.entryMode === "calculated" ? "calculated" : "manual";
        const formula = entryMode === "calculated" ? (parameterDefinition.formula || null) : null;
        const precision = Number.isInteger(parameterDefinition.precision) ? parameterDefinition.precision : 2;
        await run(
          `UPDATE test_parameters
           SET parameter_name = ?, unit = ?, normal_range = ?, entry_mode = ?, calculation_formula = ?, calculation_precision = ?, display_order = ?
           WHERE id = ?`,
          [parameterDefinition.name, parameterDefinition.unit, parameterDefinition.normalRange, entryMode, formula, precision, index + 1, parameter.id]
        );
        continue;
      }

      const entryMode = parameterDefinition.entryMode === "calculated" ? "calculated" : "manual";
      const formula = entryMode === "calculated" ? (parameterDefinition.formula || null) : null;
      const precision = Number.isInteger(parameterDefinition.precision) ? parameterDefinition.precision : 2;
      await run(
        `INSERT INTO test_parameters (
           test_id, parameter_name, unit, normal_range,
           entry_mode, calculation_formula, calculation_precision, display_order
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [test.id, parameterDefinition.name, parameterDefinition.unit, parameterDefinition.normalRange, entryMode, formula, precision, index + 1]
      );
    }
  }
}

async function ensureHbTlcDlcEsrProfileBundle() {
  const profileName = "Hb + TLC/TC/WBC + DLC + ESR Profile";
  let profile = await get(
    "SELECT id FROM tests WHERE LOWER(name) = LOWER(?) OR LOWER(code) = LOWER(?) ORDER BY id ASC LIMIT 1",
    [profileName, "HBTLCDLCESR"]
  );

  if (!profile) {
    const created = await run(
      `INSERT INTO tests (name, code, category, sample_type, price, turnaround_hours, active, created_at)
       VALUES (?, ?, ?, ?, 0, ?, 1, ?)`,
      [profileName, "HBTLCDLCESR", "Profile", "Whole Blood", 24, buildNow()]
    );
    profile = { id: created.id };
  }

  await run(
    `UPDATE tests
     SET name = ?, code = ?, category = ?, sample_type = ?, turnaround_hours = ?, active = 1
     WHERE id = ?`,
    [profileName, "HBTLCDLCESR", "Profile", "Whole Blood", 24, profile.id]
  );

  const componentNames = [
    "Hb(Haemoglobin)",
    "Total Leucocyte Count (TLC / TC / WBC)",
    "Differential Leucocyte Count (DLC)",
    "ESR (Erythrocyte Sedimentation Rate)",
  ];

  for (const [index, componentName] of componentNames.entries()) {
    const component = await get(
      "SELECT id FROM tests WHERE LOWER(name) = LOWER(?) AND active = 1 ORDER BY id ASC LIMIT 1",
      [componentName]
    );
    if (!component) {
      throw new Error(`Unable to configure ${profileName}: missing component ${componentName}`);
    }

    await run(
      `INSERT INTO test_bundle_items (bundle_test_id, component_test_id, display_order)
       VALUES (?, ?, ?)
       ON CONFLICT(bundle_test_id, component_test_id) DO UPDATE SET display_order = excluded.display_order`,
      [profile.id, component.id, index + 1]
    );
  }
}

async function ensureBloodGroupTestConfiguration() {
  let bloodGroupTest = await get(
    "SELECT id FROM tests WHERE LOWER(name) = LOWER(?) ORDER BY id ASC LIMIT 1",
    ["Blood Group"]
  ) || await get(
    "SELECT id FROM tests WHERE LOWER(name) = LOWER(?) ORDER BY id ASC LIMIT 1",
    ["Blood Group ABO & Rh (D) factor"]
  );

  if (!bloodGroupTest) {
    const created = await run(
      `INSERT INTO tests (name, code, category, sample_type, price, turnaround_hours, active, created_at)
       VALUES (?, ?, ?, ?, 0, ?, 1, ?)`,
      ["Blood Group", "BLO6578", "Hematology", "Blood", 1, buildNow()]
    );
    bloodGroupTest = { id: created.id };
  }

  await run(
    `UPDATE tests
     SET name = ?, code = ?, category = ?, sample_type = ?, turnaround_hours = ?, active = 1
     WHERE id = ?`,
    ["Blood Group", "BLO6578", "Hematology", "Blood", 1, bloodGroupTest.id]
  );

  const aboGroup = await get(
    `SELECT id FROM test_parameters
     WHERE test_id = ? AND LOWER(parameter_name) LIKE ?
     ORDER BY display_order ASC, id ASC LIMIT 1`,
    [bloodGroupTest.id, "%abo%"]
  ) || await get(
    "SELECT id FROM test_parameters WHERE test_id = ? ORDER BY display_order ASC, id ASC LIMIT 1",
    [bloodGroupTest.id]
  );

  if (aboGroup) {
    await run(
      `UPDATE test_parameters
       SET parameter_name = ?, unit = ?, normal_range = ?, display_order = 1
       WHERE id = ?`,
      ["ABO Group", "", "", aboGroup.id]
    );
  } else {
    await run(
      `INSERT INTO test_parameters (test_id, parameter_name, unit, normal_range, display_order)
       VALUES (?, ?, ?, ?, 1)`,
      [bloodGroupTest.id, "ABO Group", "", ""]
    );
  }

  const rhFactor = await get(
    `SELECT id FROM test_parameters
     WHERE test_id = ? AND LOWER(parameter_name) LIKE ?
     ORDER BY display_order ASC, id ASC LIMIT 1`,
    [bloodGroupTest.id, "%rh%"]
  );

  if (rhFactor) {
    await run(
      `UPDATE test_parameters
       SET parameter_name = ?, unit = ?, normal_range = ?, display_order = 2
       WHERE id = ?`,
      ["Rh Factor", "", "", rhFactor.id]
    );
  } else {
    await run(
      `INSERT INTO test_parameters (test_id, parameter_name, unit, normal_range, display_order)
       VALUES (?, ?, ?, ?, 2)`,
      [bloodGroupTest.id, "Rh Factor", "", ""]
    );
  }
}

async function ensureDDimerTestConfiguration() {
  let dDimerTest = await get(
    "SELECT id FROM tests WHERE LOWER(name) = LOWER(?) ORDER BY id ASC LIMIT 1",
    ["D-Dimer"]
  ) || await get(
    "SELECT id FROM tests WHERE LOWER(name) = LOWER(?) ORDER BY id ASC LIMIT 1",
    ["D DIMER TEST"]
  );

  if (!dDimerTest) {
    const created = await run(
      `INSERT INTO tests (name, code, category, sample_type, price, turnaround_hours, active, created_at)
       VALUES (?, ?, ?, ?, 0, ?, 1, ?)`,
      ["D-Dimer", "DXD1113", "Hematology", "Citrated Plasma", 24, buildNow()]
    );
    dDimerTest = { id: created.id };
  }

  await run(
    `UPDATE tests
     SET name = ?, code = ?, category = ?, sample_type = ?, active = 1
     WHERE id = ?`,
    ["D-Dimer", "DXD1113", "Hematology", "Citrated Plasma", dDimerTest.id]
  );

  const dDimerParameter = await get(
    `SELECT id FROM test_parameters
     WHERE test_id = ? AND LOWER(parameter_name) LIKE ?
     ORDER BY display_order ASC, id ASC LIMIT 1`,
    [dDimerTest.id, "%dimer%"]
  ) || await get(
    "SELECT id FROM test_parameters WHERE test_id = ? ORDER BY display_order ASC, id ASC LIMIT 1",
    [dDimerTest.id]
  );

  if (dDimerParameter) {
    await run(
      `UPDATE test_parameters
       SET parameter_name = ?, unit = ?, normal_range = ?, display_order = 1
       WHERE id = ?`,
      ["D-DIMER, QUANTITATIVE", "mg/mL DDU", "< 243.00", dDimerParameter.id]
    );
  } else {
    await run(
      `INSERT INTO test_parameters (test_id, parameter_name, unit, normal_range, display_order)
       VALUES (?, ?, ?, ?, 1)`,
      [dDimerTest.id, "D-DIMER, QUANTITATIVE", "mg/mL DDU", "< 243.00"]
    );
  }
}

async function ensureSickleCellMutationAnalysisTestConfiguration() {
  let sickleCellMutationTest = await get(
    "SELECT id FROM tests WHERE LOWER(name) = LOWER(?) ORDER BY id ASC LIMIT 1",
    ["Sickle Cell Anemia Mutation Analysis"]
  );

  if (!sickleCellMutationTest) {
    const created = await run(
      `INSERT INTO tests (name, code, category, sample_type, price, turnaround_hours, active, created_at)
       VALUES (?, ?, ?, ?, 0, ?, 1, ?)`,
      ["Sickle Cell Anemia Mutation Analysis", "SCM4706", "Molecular Genetics", "Blood", 72, buildNow()]
    );
    sickleCellMutationTest = { id: created.id };
  }

  await run(
    `UPDATE tests
     SET name = ?, code = ?, category = ?, sample_type = ?, turnaround_hours = ?, active = 1
     WHERE id = ?`,
    ["Sickle Cell Anemia Mutation Analysis", "SCM4706", "Molecular Genetics", "Blood", 72, sickleCellMutationTest.id]
  );

  const mutationParameter = await get(
    `SELECT id FROM test_parameters
     WHERE test_id = ? AND LOWER(parameter_name) LIKE ?
     ORDER BY display_order ASC, id ASC LIMIT 1`,
    [sickleCellMutationTest.id, "%mutation%"]
  ) || await get(
    "SELECT id FROM test_parameters WHERE test_id = ? ORDER BY display_order ASC, id ASC LIMIT 1",
    [sickleCellMutationTest.id]
  );

  if (mutationParameter) {
    await run(
      `UPDATE test_parameters
       SET parameter_name = ?, unit = ?, normal_range = ?, display_order = 1
       WHERE id = ?`,
      ["SICKLE CELL ANEMIA MUTATION ANALYSIS", "", "Negative", mutationParameter.id]
    );
  } else {
    await run(
      `INSERT INTO test_parameters (test_id, parameter_name, unit, normal_range, display_order)
       VALUES (?, ?, ?, ?, 1)`,
      [sickleCellMutationTest.id, "SICKLE CELL ANEMIA MUTATION ANALYSIS", "", "Negative"]
    );
  }
}

async function ensureClottingTimeTestConfiguration() {
  const clottingTimeTest = await get(
    "SELECT id FROM tests WHERE LOWER(name) = LOWER(?) ORDER BY id ASC LIMIT 1",
    ["CT (Clotting Time)"]
  );
  if (!clottingTimeTest) return;

  await run(
    "UPDATE tests SET sample_type = ? WHERE id = ?",
    ["Whole Blood", clottingTimeTest.id]
  );

  const parameter = await get(
    "SELECT id FROM test_parameters WHERE test_id = ? ORDER BY display_order ASC, id ASC LIMIT 1",
    [clottingTimeTest.id]
  );
  if (parameter) {
    await run(
      `UPDATE test_parameters
       SET parameter_name = ?, unit = ?, normal_range = ?, display_order = 1
       WHERE id = ?`,
      ["CLOTTING TIME (CT)", "minutes", "3 - 10", parameter.id]
    );
    return;
  }

  await run(
    `INSERT INTO test_parameters (test_id, parameter_name, unit, normal_range, display_order)
     VALUES (?, ?, ?, ?, 1)`,
    [clottingTimeTest.id, "CLOTTING TIME (CT)", "minutes", "3 - 10"]
  );
}

async function ensureBleedingTimeTestConfiguration() {
  let bleedingTimeTest = await get(
    "SELECT id FROM tests WHERE LOWER(name) = LOWER(?) ORDER BY id ASC LIMIT 1",
    ["BT (Bleeding Time)"]
  ) || await get(
    "SELECT id FROM tests WHERE LOWER(name) = LOWER(?) ORDER BY id ASC LIMIT 1",
    ["Bleeding Time (BT)"]
  );

  if (!bleedingTimeTest) {
    const created = await run(
      `INSERT INTO tests (name, code, category, sample_type, price, turnaround_hours, active, created_at)
       VALUES (?, ?, ?, ?, 0, ?, 1, ?)`,
      ["BT (Bleeding Time)", "BTX4184", "Hematology", "Whole Blood", 1, buildNow()]
    );
    bleedingTimeTest = { id: created.id };
  }

  await run(
    "UPDATE tests SET sample_type = ?, turnaround_hours = ? WHERE id = ?",
    ["Whole Blood", 1, bleedingTimeTest.id]
  );

  const parameter = await get(
    `SELECT id FROM test_parameters
     WHERE test_id = ? AND LOWER(parameter_name) = LOWER(?)
     ORDER BY display_order ASC, id ASC LIMIT 1`,
    [bleedingTimeTest.id, "BLEEDING TIME (BT)"]
  ) || await get(
    "SELECT id FROM test_parameters WHERE test_id = ? ORDER BY display_order ASC, id ASC LIMIT 1",
    [bleedingTimeTest.id]
  );

  if (parameter) {
    await run(
      `UPDATE test_parameters
       SET parameter_name = ?, unit = ?, normal_range = ?, display_order = 1
       WHERE id = ?`,
      ["BLEEDING TIME (BT)", "minutes", "2 - 7", parameter.id]
    );
    return;
  }

  await run(
    `INSERT INTO test_parameters (test_id, parameter_name, unit, normal_range, display_order)
     VALUES (?, ?, ?, ?, 1)`,
    [bleedingTimeTest.id, "BLEEDING TIME (BT)", "minutes", "2 - 7"]
  );
}

async function ensureCoagulationProfileTestConfiguration() {
  let coagulationProfile = await get(
    "SELECT id FROM tests WHERE LOWER(name) = LOWER(?) ORDER BY id ASC LIMIT 1",
    ["Coagulation Profile"]
  );

  if (!coagulationProfile) {
    const created = await run(
      `INSERT INTO tests (name, code, category, sample_type, price, turnaround_hours, active, created_at)
       VALUES (?, ?, ?, ?, 0, ?, 1, ?)`,
      ["Coagulation Profile", "COA4658", "Hematology", "Citrated Plasma", 24, buildNow()]
    );
    coagulationProfile = { id: created.id };
  }

  await run(
    "UPDATE tests SET sample_type = ?, turnaround_hours = ? WHERE id = ?",
    ["Citrated Plasma", 24, coagulationProfile.id]
  );

  const parameters = [
    { name: "BLEEDING TIME (BT)", unit: "min.", range: "3 - 10" },
    { name: "CLOTTING TIME (CT)", unit: "min.", range: "2 - 7" },
    { name: "PROTHROMBIN TIME (PT)", unit: "sec.", range: "10.3 - 12.8" },
    { name: "ACTIVATED PARTIAL THROMBOPLASTIN TIME (APTT)", unit: "sec.", range: "25 - 37" },
  ];

  for (const [index, definition] of parameters.entries()) {
    let parameter = await get(
      `SELECT id FROM test_parameters
       WHERE test_id = ? AND LOWER(parameter_name) = LOWER(?)
       ORDER BY display_order ASC, id ASC LIMIT 1`,
      [coagulationProfile.id, definition.name]
    );

    if (!parameter && index === 0) {
      parameter = await get(
        `SELECT id FROM test_parameters
         WHERE test_id = ? AND LOWER(parameter_name) = LOWER(?)
         ORDER BY display_order ASC, id ASC LIMIT 1`,
        [coagulationProfile.id, "Result"]
      );
    }

    if (parameter) {
      await run(
        `UPDATE test_parameters
         SET parameter_name = ?, unit = ?, normal_range = ?, display_order = ?
         WHERE id = ?`,
        [definition.name, definition.unit, definition.range, index + 1, parameter.id]
      );
      continue;
    }

    await run(
      `INSERT INTO test_parameters (test_id, parameter_name, unit, normal_range, display_order)
       VALUES (?, ?, ?, ?, ?)`,
      [coagulationProfile.id, definition.name, definition.unit, definition.range, index + 1]
    );
  }
}

async function ensureFactorVTestConfiguration() {
  let factorVTests = await all(
    `SELECT id FROM tests
     WHERE LOWER(name) = LOWER(?) OR LOWER(name) = LOWER(?)
     ORDER BY id ASC`,
    ["Factor V", "Factor V Deficiency"]
  );

  if (!factorVTests.length) {
    const created = await run(
      `INSERT INTO tests (name, code, category, sample_type, price, turnaround_hours, active, created_at)
       VALUES (?, ?, ?, ?, 0, ?, 1, ?)`,
      ["Factor V", "FV4706", "Hematology", "Plasma", 8, buildNow()]
    );
    factorVTests = [{ id: created.id }];
  }

  for (const factorVTest of factorVTests) {
    await run(
      "UPDATE tests SET sample_type = ?, turnaround_hours = ?, active = 1 WHERE id = ?",
      ["Plasma", 8, factorVTest.id]
    );

    const parameter = await get(
      `SELECT id FROM test_parameters
       WHERE test_id = ? AND LOWER(parameter_name) = LOWER(?)
       ORDER BY display_order ASC, id ASC LIMIT 1`,
      [factorVTest.id, "FACTOR V, FUNCTIONAL"]
    ) || await get(
      "SELECT id FROM test_parameters WHERE test_id = ? ORDER BY display_order ASC, id ASC LIMIT 1",
      [factorVTest.id]
    );

    if (parameter) {
      await run(
        `UPDATE test_parameters
         SET parameter_name = ?, unit = ?, normal_range = ?, display_order = 1
         WHERE id = ?`,
        ["FACTOR V, FUNCTIONAL", "%", "70.00 - 120.00", parameter.id]
      );
      continue;
    }

    await run(
      `INSERT INTO test_parameters (test_id, parameter_name, unit, normal_range, display_order)
       VALUES (?, ?, ?, ?, 1)`,
      [factorVTest.id, "FACTOR V, FUNCTIONAL", "%", "70.00 - 120.00"]
    );
  }
}

async function ensureFactorViiTestConfiguration() {
  let factorViiTests = await all(
    `SELECT id FROM tests
     WHERE LOWER(name) LIKE ? AND LOWER(name) NOT LIKE ?
     ORDER BY id ASC`,
    ["factor vii%", "factor viii%"]
  );

  if (!factorViiTests.length) {
    const created = await run(
      `INSERT INTO tests (name, code, category, sample_type, price, turnaround_hours, active, created_at)
       VALUES (?, ?, ?, ?, 0, ?, 1, ?)`,
      ["Factor VII", "FVII4706", "Hematology", "Plasma", 8, buildNow()]
    );
    factorViiTests = [{ id: created.id }];
  }

  for (const factorViiTest of factorViiTests) {
    await run(
      "UPDATE tests SET sample_type = ?, turnaround_hours = ? WHERE id = ?",
      ["Plasma", 8, factorViiTest.id]
    );

    const parameter = await get(
      `SELECT id FROM test_parameters
       WHERE test_id = ? AND LOWER(parameter_name) = LOWER(?)
       ORDER BY display_order ASC, id ASC LIMIT 1`,
      [factorViiTest.id, "FACTOR VII, FUNCTIONAL"]
    ) || await get(
      "SELECT id FROM test_parameters WHERE test_id = ? ORDER BY display_order ASC, id ASC LIMIT 1",
      [factorViiTest.id]
    );

    if (parameter) {
      await run(
        `UPDATE test_parameters
         SET parameter_name = ?, unit = ?, normal_range = ?, display_order = 1
         WHERE id = ?`,
        ["FACTOR VII, FUNCTIONAL", "%", "70.00 - 120.00", parameter.id]
      );
      continue;
    }

    await run(
      `INSERT INTO test_parameters (test_id, parameter_name, unit, normal_range, display_order)
       VALUES (?, ?, ?, ?, 1)`,
      [factorViiTest.id, "FACTOR VII, FUNCTIONAL", "%", "70.00 - 120.00"]
    );
  }
}

async function ensureFactorIxTestConfiguration() {
  let factorIxTests = await all(
    `SELECT id FROM tests
     WHERE LOWER(name) LIKE ?
     ORDER BY id ASC`,
    ["factor ix%"]
  );

  if (!factorIxTests.length) {
    const created = await run(
      `INSERT INTO tests (name, code, category, sample_type, price, turnaround_hours, active, created_at)
       VALUES (?, ?, ?, ?, 0, ?, 1, ?)`,
      ["Factor IX", "FIX4706", "Hematology", "Plasma", 8, buildNow()]
    );
    factorIxTests = [{ id: created.id }];
  }

  for (const factorIxTest of factorIxTests) {
    await run(
      "UPDATE tests SET sample_type = ?, turnaround_hours = ?, active = 1 WHERE id = ?",
      ["Plasma", 8, factorIxTest.id]
    );

    const parameter = await get(
      `SELECT id FROM test_parameters
       WHERE test_id = ? AND LOWER(parameter_name) = LOWER(?)
       ORDER BY display_order ASC, id ASC LIMIT 1`,
      [factorIxTest.id, "FACTOR IX, FUNCTIONAL"]
    ) || await get(
      "SELECT id FROM test_parameters WHERE test_id = ? ORDER BY display_order ASC, id ASC LIMIT 1",
      [factorIxTest.id]
    );

    if (parameter) {
      await run(
        `UPDATE test_parameters
         SET parameter_name = ?, unit = ?, normal_range = ?, display_order = 1
         WHERE id = ?`,
        ["FACTOR IX, FUNCTIONAL", "%", "70.00 - 120.00", parameter.id]
      );
      continue;
    }

    await run(
      `INSERT INTO test_parameters (test_id, parameter_name, unit, normal_range, display_order)
       VALUES (?, ?, ?, ?, 1)`,
      [factorIxTest.id, "FACTOR IX, FUNCTIONAL", "%", "70.00 - 120.00"]
    );
  }
}

async function ensureFactorXiTestConfiguration() {
  let factorXiTests = await all(
    `SELECT id FROM tests
     WHERE LOWER(name) LIKE ? AND LOWER(name) NOT LIKE ? AND LOWER(name) NOT LIKE ?
     ORDER BY id ASC`,
    ["factor xi%", "factor xii%", "factor xiii%"]
  );

  if (!factorXiTests.length) {
    const created = await run(
      `INSERT INTO tests (name, code, category, sample_type, price, turnaround_hours, active, created_at)
       VALUES (?, ?, ?, ?, 0, ?, 1, ?)`,
      ["Factor XI", "FXI4706", "Hematology", "Plasma", 8, buildNow()]
    );
    factorXiTests = [{ id: created.id }];
  }

  for (const factorXiTest of factorXiTests) {
    await run(
      "UPDATE tests SET sample_type = ?, turnaround_hours = ? WHERE id = ?",
      ["Plasma", 8, factorXiTest.id]
    );

    const parameter = await get(
      `SELECT id FROM test_parameters
       WHERE test_id = ? AND LOWER(parameter_name) = LOWER(?)
       ORDER BY display_order ASC, id ASC LIMIT 1`,
      [factorXiTest.id, "FACTOR XI, FUNCTIONAL"]
    ) || await get(
      "SELECT id FROM test_parameters WHERE test_id = ? ORDER BY display_order ASC, id ASC LIMIT 1",
      [factorXiTest.id]
    );

    if (parameter) {
      await run(
        `UPDATE test_parameters
         SET parameter_name = ?, unit = ?, normal_range = ?, display_order = 1
         WHERE id = ?`,
        ["FACTOR XI, FUNCTIONAL", "%", "70.00 - 120.00", parameter.id]
      );
      continue;
    }

    await run(
      `INSERT INTO test_parameters (test_id, parameter_name, unit, normal_range, display_order)
       VALUES (?, ?, ?, ?, 1)`,
      [factorXiTest.id, "FACTOR XI, FUNCTIONAL", "%", "70.00 - 120.00"]
    );
  }
}

async function ensureFactorXTestConfiguration() {
  let factorXTests = await all(
    `SELECT id FROM tests
     WHERE LOWER(name) LIKE ? AND LOWER(name) NOT LIKE ? AND LOWER(name) NOT LIKE ? AND LOWER(name) NOT LIKE ?
     ORDER BY id ASC`,
    ["factor x%", "factor xi%", "factor xii%", "factor xiii%"]
  );

  if (!factorXTests.length) {
    const created = await run(
      `INSERT INTO tests (name, code, category, sample_type, price, turnaround_hours, active, created_at)
       VALUES (?, ?, ?, ?, 0, ?, 1, ?)`,
      ["Factor X", "FX4706", "Hematology", "Plasma", 8, buildNow()]
    );
    factorXTests = [{ id: created.id }];
  }

  for (const factorXTest of factorXTests) {
    await run(
      "UPDATE tests SET sample_type = ?, turnaround_hours = ? WHERE id = ?",
      ["Plasma", 8, factorXTest.id]
    );

    const parameter = await get(
      `SELECT id FROM test_parameters
       WHERE test_id = ? AND LOWER(parameter_name) = LOWER(?)
       ORDER BY display_order ASC, id ASC LIMIT 1`,
      [factorXTest.id, "FACTOR X, FUNCTIONAL"]
    ) || await get(
      "SELECT id FROM test_parameters WHERE test_id = ? ORDER BY display_order ASC, id ASC LIMIT 1",
      [factorXTest.id]
    );

    if (parameter) {
      await run(
        `UPDATE test_parameters
         SET parameter_name = ?, unit = ?, normal_range = ?, display_order = 1
         WHERE id = ?`,
        ["FACTOR X, FUNCTIONAL", "%", "70.00 - 120.00", parameter.id]
      );
      continue;
    }

    await run(
      `INSERT INTO test_parameters (test_id, parameter_name, unit, normal_range, display_order)
       VALUES (?, ?, ?, ?, 1)`,
      [factorXTest.id, "FACTOR X, FUNCTIONAL", "%", "70.00 - 120.00"]
    );
  }
}

async function ensureFactorViiiTestConfiguration() {
  let factorViiiTest = await get(
    "SELECT id FROM tests WHERE LOWER(name) = LOWER(?) ORDER BY id ASC LIMIT 1",
    ["Factor VIII (Antihemophilic Factor A)"]
  );
  if (!factorViiiTest) {
    const created = await run(
      `INSERT INTO tests (name, code, category, sample_type, price, turnaround_hours, active, created_at)
       VALUES (?, ?, ?, ?, 0, ?, 1, ?)`,
      ["Factor VIII (Antihemophilic Factor A)", "PF065", "Hematology", "Plasma", 8, buildNow()]
    );
    factorViiiTest = { id: created.id };
  }

  await run(
    "UPDATE tests SET sample_type = ?, turnaround_hours = ? WHERE id = ?",
    ["Plasma", 8, factorViiiTest.id]
  );

  const parameter = await get(
    `SELECT id FROM test_parameters
     WHERE test_id = ? AND LOWER(parameter_name) = LOWER(?)
     ORDER BY display_order ASC, id ASC LIMIT 1`,
    [factorViiiTest.id, "FACTOR VIII, FUNCTIONAL / ACTIVITY (FVIII:C)"]
  ) || await get(
    "SELECT id FROM test_parameters WHERE test_id = ? ORDER BY display_order ASC, id ASC LIMIT 1",
    [factorViiiTest.id]
  );

  if (parameter) {
    await run(
      `UPDATE test_parameters
       SET parameter_name = ?, unit = ?, normal_range = ?, display_order = 1
       WHERE id = ?`,
      ["FACTOR VIII, FUNCTIONAL / ACTIVITY (FVIII:C)", "%", "50.00 - 150.00", parameter.id]
    );
    return;
  }

  await run(
    `INSERT INTO test_parameters (test_id, parameter_name, unit, normal_range, display_order)
     VALUES (?, ?, ?, ?, 1)`,
    [factorViiiTest.id, "FACTOR VIII, FUNCTIONAL / ACTIVITY (FVIII:C)", "%", "50.00 - 150.00"]
  );
}

async function ensureFactorXiiAndXiiiTestConfigurations() {
  const configurations = [
    {
      name: "Factor XII Deficiency",
      code: "PF003",
      parameterName: "FACTOR XII, FUNCTIONAL",
      unit: "%",
      normalRange: "70.00 - 120.00",
    },
    {
      name: "Factor XIII Deficiency",
      code: "PF004",
      parameterName: "FACTOR XIII, FUNCTIONAL, QUALITATIVE",
      unit: "",
      normalRange: "",
    },
  ];

  for (const configuration of configurations) {
    let test = await get(
      "SELECT id FROM tests WHERE LOWER(name) = LOWER(?) ORDER BY id ASC LIMIT 1",
      [configuration.name]
    );
    if (!test) {
      const created = await run(
        `INSERT INTO tests (name, code, category, sample_type, price, turnaround_hours, active, created_at)
         VALUES (?, ?, ?, ?, 0, ?, 1, ?)`,
        [configuration.name, configuration.code, "Hematology", "Plasma", 8, buildNow()]
      );
      test = { id: created.id };
    }

    await run(
      "UPDATE tests SET sample_type = ?, turnaround_hours = ? WHERE id = ?",
      ["Plasma", 8, test.id]
    );

    const parameter = await get(
      `SELECT id FROM test_parameters
       WHERE test_id = ? AND LOWER(parameter_name) = LOWER(?)
       ORDER BY display_order ASC, id ASC LIMIT 1`,
      [test.id, configuration.parameterName]
    ) || await get(
      "SELECT id FROM test_parameters WHERE test_id = ? ORDER BY display_order ASC, id ASC LIMIT 1",
      [test.id]
    );

    if (parameter) {
      await run(
        `UPDATE test_parameters
         SET parameter_name = ?, unit = ?, normal_range = ?, display_order = 1
         WHERE id = ?`,
        [configuration.parameterName, configuration.unit, configuration.normalRange, parameter.id]
      );
      continue;
    }

    await run(
      `INSERT INTO test_parameters (test_id, parameter_name, unit, normal_range, display_order)
       VALUES (?, ?, ?, ?, 1)`,
      [test.id, configuration.parameterName, configuration.unit, configuration.normalRange]
    );
  }
}

async function ensurePeripheralBloodSmearTestConfiguration() {
  let peripheralSmearTest = await get(
    "SELECT id FROM tests WHERE LOWER(name) = LOWER(?) ORDER BY id ASC LIMIT 1",
    ["Peripheral Blood Smear Examination"]
  ) || await get(
    "SELECT id FROM tests WHERE LOWER(name) = LOWER(?) ORDER BY id ASC LIMIT 1",
    ["Peripheral Smear"]
  );

  if (!peripheralSmearTest) {
    const created = await run(
      `INSERT INTO tests (name, code, category, sample_type, price, turnaround_hours, active, created_at)
       VALUES (?, ?, ?, ?, 0, ?, 1, ?)`,
      ["Peripheral Blood Smear Examination", "PBS001", "Hematology", "Blood", 24, buildNow()]
    );
    peripheralSmearTest = { id: created.id };
  }

  await run(
    "UPDATE tests SET name = ?, sample_type = ? WHERE id = ?",
    ["Peripheral Blood Smear Examination", "Blood", peripheralSmearTest.id]
  );

  const parameterDefinitions = [
    { name: "RBC Morphology", order: 1 },
    { name: "WBC Morphology", order: 2 },
    { name: "Platelets", order: 3 },
  ];

  for (const definition of parameterDefinitions) {
    let parameter = await get(
      `SELECT id FROM test_parameters
       WHERE test_id = ? AND LOWER(parameter_name) = LOWER(?)
       ORDER BY display_order ASC, id ASC LIMIT 1`,
      [peripheralSmearTest.id, definition.name]
    );

    if (!parameter && definition.order === 1) {
      parameter = await get(
        `SELECT id FROM test_parameters
         WHERE test_id = ? AND LOWER(parameter_name) = LOWER(?)
         ORDER BY display_order ASC, id ASC LIMIT 1`,
        [peripheralSmearTest.id, "Result"]
      );
    }

    if (parameter) {
      await run(
        `UPDATE test_parameters
         SET parameter_name = ?, unit = '', normal_range = '', display_order = ?
         WHERE id = ?`,
        [definition.name, definition.order, parameter.id]
      );
      continue;
    }

    await run(
      `INSERT INTO test_parameters (test_id, parameter_name, unit, normal_range, display_order)
       VALUES (?, ?, '', '', ?)`,
      [peripheralSmearTest.id, definition.name, definition.order]
    );
  }
}

async function ensureUserDefaults() {
  const users = await all("SELECT id, role, permissions, access_controls, employee_code FROM users");

  for (const user of users) {
    let permissions = ROLE_PERMISSION_DEFAULTS[user.role] || [];

    if (!user.permissions) {
      await run("UPDATE users SET permissions = ? WHERE id = ?", [
        JSON.stringify(permissions),
        user.id,
      ]);
    } else {
      try {
        const parsedPermissions = JSON.parse(user.permissions);
        if (Array.isArray(parsedPermissions)) {
          permissions = parsedPermissions;
        }
      } catch (_error) {
        permissions = ROLE_PERMISSION_DEFAULTS[user.role] || [];
      }
    }

    if (isAdministrativeRole(user.role) && !permissions.includes(PERMISSIONS.DELETE_PATIENTS)) {
      permissions = Array.from(new Set([...permissions, PERMISSIONS.DELETE_PATIENTS]));
      await run("UPDATE users SET permissions = ? WHERE id = ?", [
        JSON.stringify(permissions),
        user.id,
      ]);
    }

    if (isAdministrativeRole(user.role) && !permissions.includes(PERMISSIONS.SHARE_WHATSAPP_PDF)) {
      permissions = Array.from(new Set([...permissions, PERMISSIONS.SHARE_WHATSAPP_PDF]));
      await run("UPDATE users SET permissions = ? WHERE id = ?", [
        JSON.stringify(permissions),
        user.id,
      ]);
    }

    if (!user.employee_code) {
      await run("UPDATE users SET employee_code = ? WHERE id = ?", [
        `EMP-${String(user.role || "staff").slice(0, 3).toUpperCase()}-${String(user.id).padStart(3, "0")}`,
        user.id,
      ]);
    }

    if (!user.access_controls) {
      await run("UPDATE users SET access_controls = ? WHERE id = ?", [
        JSON.stringify(ROLE_ACCESS_CONTROL_DEFAULTS[user.role] || {}),
        user.id,
      ]);
    }
  }

  // Ensure CT Scan technician role is respected in permissions if missing
  await run(`
    UPDATE users 
    SET permissions = ?, access_controls = ?
    WHERE role = ? AND (permissions IS NULL OR access_controls IS NULL)
  `, [
    JSON.stringify(ROLE_PERMISSION_DEFAULTS[ROLES.CT_TECHNICIAN]),
    JSON.stringify(ROLE_ACCESS_CONTROL_DEFAULTS[ROLES.CT_TECHNICIAN]),
    ROLES.CT_TECHNICIAN
  ]);
}

async function initializeDatabase() {
  try {
    await createTables();
    await seedAdmin();
    await seedDoctors();
    await seedTests();
    await seedAssociates();
    await seedPathologyReportCatalog();
    await ensureReferencedReportTestConfigurations();
    await ensureAdditionalClinicalPathologyReportTestConfigurations();
    await ensureRtPcrTestConfiguration();
    await ensureTpmtGenotypingTestConfiguration();
    await ensureCysticFibrosisNewbornScreenTestConfiguration();
    await ensureKftTestConfiguration();
    await ensureFactorIiTestConfiguration();
    await ensureKaryotypeTestConfiguration();
    await ensureLipidProfileTestConfiguration();
    await ensureLftTestConfiguration();
    await ensureHba1cTestConfiguration();
    await ensureVitaminDTestConfiguration();
    await ensureVitaminCTestConfiguration();
    await ensureVitaminB12TestConfiguration();
    await ensureRandomBloodSugarTestConfiguration();
    await ensureFastingBloodSugarTestConfiguration();
    await ensureBTypeNatriureticPeptideTestConfiguration();
    await ensureDigoxinTestConfiguration();
    await ensureCreatineKinaseTestConfiguration();
    await ensureBeta2MicroglobulinTestConfiguration();
    await ensureAltSgptTestConfiguration();
    await ensureDnphTestConfiguration();
    await ensurePrealbuminTestConfiguration();
    await ensureHaptoglobinTestConfiguration();
    await ensureGramStainBacterialVaginosisTestConfiguration();
    await ensureAldolaseTestConfiguration();
    await ensureUrineProteinCreatinineRatioTestConfiguration();
    await ensureAlbuminCreatinineRatioTestConfiguration();
    await ensurePostPrandialBloodSugarTestConfiguration();
    await ensureTacrolimusTestConfiguration();
    await ensurePhosphorusTestConfiguration();
    await ensureAlkalinePhosphataseTestConfiguration();
    await ensureClotRetractionTestConfiguration();
    await ensureGroupBStrepTestConfiguration();
    await ensureFungusKohPreparationTestConfiguration();
    await ensureSputumAfbTestConfiguration();
    await ensureStoolCultureTestConfiguration();
    await ensureUrineCultureTestConfiguration();
    await ensureMalariaParasiteIdentificationTestConfiguration();
    await ensureMycobacteriumCombinedPanelTestConfiguration();
    await ensureOvaAndParasiteTestConfiguration();
    await ensureTripleMarkerTestConfiguration();
    await ensureDoubleMarkerTestConfiguration();
    await ensurePax8TestConfiguration();
    await ensureGalectin3TestConfiguration();
    await ensureHer2TestConfiguration();
    await ensureDcpTestConfiguration();
    await ensureAfpTumorMarkerTestConfiguration();
    await ensureCa199TestConfiguration();
    await ensureCa153TestConfiguration();
    await ensureCa125TestConfiguration();
    await ensureTroponinITestConfiguration();
    await ensureTroponinTTestConfiguration();
    await ensureDengueNs1TestConfiguration();
    await ensureDengueIggTestConfiguration();
    await ensureDengueIgmTestConfiguration();
    await ensureRastTestConfiguration();
    await ensureWidalTestConfiguration();
    await ensureCrpTestConfiguration();
    await ensureTyphidotTestConfiguration();
    await ensureVdrlTestConfiguration();
    await ensureHavIggTestConfiguration();
    await ensureHavIgmTestConfiguration();
    await ensureHcvRapidScreeningTestConfiguration();
    await ensureHbsAgTestConfiguration();
    await ensureAntiHbcIgmTestConfiguration();
    await ensureHepatitisBProfileTestConfiguration();
    await ensureMantouxTestConfiguration();
    await ensureHiv12ScreeningTestConfiguration();
    await ensureAntiCcpTestConfiguration();
    await ensureImmunoglobulinIggTestConfiguration();
    await ensureImmunoglobulinIgeTestConfiguration();
    await ensureImmunoglobulinIgmTestConfiguration();
    await ensureImmunoglobulinIgaTestConfiguration();
    await ensureAntiBTitreTestConfiguration();
    await ensureAntiATitreTestConfiguration();
    await ensureDustAllergyTestConfiguration();
    await ensureDengueFeverPanelTestConfiguration();
    await ensureG6PdTestConfiguration();
    await ensureAntiHbsTestConfiguration();
    await ensureGangliosideGm1IggTestConfiguration();
    await ensureGangliosideGm1IgmTestConfiguration();
    await ensureGangliosideGd1aIggTestConfiguration();
    await ensureGangliosideGd1aIgmTestConfiguration();
    await ensureGangliosideGd1bIggTestConfiguration();
    await ensureGangliosideGq1bIggTestConfiguration();
    await ensureAntiHistoneAntibodiesTestConfiguration();
    await ensureRibosomePAntibodiesTestConfiguration();
    await ensureVitaminETestConfiguration();
    await ensureVitaminB9TestConfiguration();
    await ensureVitaminKTestConfiguration();
    await ensureLdlCholesterolTestConfiguration();
    await ensureHdlCholesterolTestConfiguration();
    await ensureIndirectBilirubinTestConfiguration();
    await ensureCalciumTestConfiguration();
    await ensureFerritinTestConfiguration();
    await ensureCPeptideTestConfiguration();
    await ensureVldlCholesterolTestConfiguration();
    await ensureComprehensiveMetabolicPanelTestConfiguration();
    await ensureElectrolyteProfileTestConfiguration();
    await ensurePotassiumTestConfiguration();
    await ensureAstSgotTestConfiguration();
    await ensureGlobulinTestConfiguration();
    await ensureAlbuminTestConfiguration();
    await ensureBunTestConfiguration();
    await ensureSodiumTestConfiguration();
    await ensureIronTestConfiguration();
    await ensureLacticAcidTestConfiguration();
    await ensureMagnesiumTestConfiguration();
    await ensureLipaseTestConfiguration();
    await ensureAmylaseTestConfiguration();
    await ensureGgtTestConfiguration();
    await ensureChlorideTestConfiguration();
    await ensureCreatinineTestConfiguration();
    await ensureIonizedCalciumTestConfiguration();
    await ensureFlecainideTestConfiguration();
    await ensurePhenobarbitalTestConfiguration();
    await ensureKetoneBodyTestConfiguration();
    await ensureUricAcidTestConfiguration();
    await ensureTibcTestConfiguration();
    await ensureSerumOsmolalityTestConfiguration();
    await ensureCreatinine24HourUrineTestConfiguration();
    await ensureArterialBloodGasTestConfiguration();
    await ensureManganeseBloodTestConfiguration();
    await ensureSeleniumSerumTestConfiguration();
    await seedCbcReportTests();
    await applyOneTimeMigration("cbc-calculation-defaults-v2", upgradeCbcCalculationDefaults);
    await applyOneTimeMigration("cbc-catalog-normalization-v3", normalizeCbcCatalogParameters);
    await ensureAbsoluteNeutrophilCountTestConfiguration();
    await ensureAbsoluteCountTestConfigurations();
    await ensureEsrTestConfiguration();
    await ensureIndividualHematologyReportTestConfigurations();
    await ensureHbTlcDlcEsrProfileBundle();
    await ensureBloodGroupTestConfiguration();
    await ensureDDimerTestConfiguration();
    await ensureSickleCellMutationAnalysisTestConfiguration();
    await ensureClottingTimeTestConfiguration();
    await ensureBleedingTimeTestConfiguration();
    await ensureCoagulationProfileTestConfiguration();
    await ensureFactorVTestConfiguration();
    await ensureFactorViiTestConfiguration();
    await ensureFactorIxTestConfiguration();
    await ensureFactorXTestConfiguration();
    await ensureFactorXiTestConfiguration();
    await ensureFactorViiiTestConfiguration();
    await ensureFactorXiiAndXiiiTestConfigurations();
    await ensurePeripheralBloodSmearTestConfiguration();
    await configureDefaultCalculatedParameters();
    await applyOneTimeMigration("legacy-report-schema-repair-v1", repairImportedLegacyReportSchemas);
    await ensureUserDefaults();
  } catch (error) {
    if (error.code !== "SQLITE_IOERR") {
      throw error;
    }

    await recoverCorruptDatabase();
    await createTables();
    await seedAdmin();
    await seedDoctors();
    await seedTests();
    await seedAssociates();
    await seedPathologyReportCatalog();
    await ensureReferencedReportTestConfigurations();
    await ensureAdditionalClinicalPathologyReportTestConfigurations();
    await ensureRtPcrTestConfiguration();
    await ensureTpmtGenotypingTestConfiguration();
    await ensureCysticFibrosisNewbornScreenTestConfiguration();
    await ensureKftTestConfiguration();
    await ensureFactorIiTestConfiguration();
    await ensureKaryotypeTestConfiguration();
    await ensureLipidProfileTestConfiguration();
    await ensureLftTestConfiguration();
    await ensureHba1cTestConfiguration();
    await ensureVitaminDTestConfiguration();
    await ensureVitaminCTestConfiguration();
    await ensureVitaminB12TestConfiguration();
    await ensureRandomBloodSugarTestConfiguration();
    await ensureFastingBloodSugarTestConfiguration();
    await ensureBTypeNatriureticPeptideTestConfiguration();
    await ensureDigoxinTestConfiguration();
    await ensureCreatineKinaseTestConfiguration();
    await ensureBeta2MicroglobulinTestConfiguration();
    await ensureAltSgptTestConfiguration();
    await ensureDnphTestConfiguration();
    await ensurePrealbuminTestConfiguration();
    await ensureHaptoglobinTestConfiguration();
    await ensureGramStainBacterialVaginosisTestConfiguration();
    await ensureAldolaseTestConfiguration();
    await ensureUrineProteinCreatinineRatioTestConfiguration();
    await ensureAlbuminCreatinineRatioTestConfiguration();
    await ensurePostPrandialBloodSugarTestConfiguration();
    await ensureTacrolimusTestConfiguration();
    await ensurePhosphorusTestConfiguration();
    await ensureAlkalinePhosphataseTestConfiguration();
    await ensureClotRetractionTestConfiguration();
    await ensureGroupBStrepTestConfiguration();
    await ensureFungusKohPreparationTestConfiguration();
    await ensureSputumAfbTestConfiguration();
    await ensureStoolCultureTestConfiguration();
    await ensureUrineCultureTestConfiguration();
    await ensureMalariaParasiteIdentificationTestConfiguration();
    await ensureMycobacteriumCombinedPanelTestConfiguration();
    await ensureOvaAndParasiteTestConfiguration();
    await ensureTripleMarkerTestConfiguration();
    await ensureDoubleMarkerTestConfiguration();
    await ensurePax8TestConfiguration();
    await ensureGalectin3TestConfiguration();
    await ensureHer2TestConfiguration();
    await ensureDcpTestConfiguration();
    await ensureAfpTumorMarkerTestConfiguration();
    await ensureCa199TestConfiguration();
    await ensureCa153TestConfiguration();
    await ensureCa125TestConfiguration();
    await ensureTroponinITestConfiguration();
    await ensureTroponinTTestConfiguration();
    await ensureDengueNs1TestConfiguration();
    await ensureDengueIggTestConfiguration();
    await ensureDengueIgmTestConfiguration();
    await ensureRastTestConfiguration();
    await ensureWidalTestConfiguration();
      await ensureCrpTestConfiguration();
      await ensureTyphidotTestConfiguration();
      await ensureVdrlTestConfiguration();
      await ensureHavIggTestConfiguration();
      await ensureHavIgmTestConfiguration();
      await ensureHcvRapidScreeningTestConfiguration();
      await ensureHbsAgTestConfiguration();
      await ensureAntiHbcIgmTestConfiguration();
      await ensureHepatitisBProfileTestConfiguration();
      await ensureMantouxTestConfiguration();
      await ensureHiv12ScreeningTestConfiguration();
      await ensureAntiCcpTestConfiguration();
      await ensureImmunoglobulinIggTestConfiguration();
      await ensureImmunoglobulinIgeTestConfiguration();
      await ensureImmunoglobulinIgmTestConfiguration();
      await ensureImmunoglobulinIgaTestConfiguration();
      await ensureAntiBTitreTestConfiguration();
      await ensureAntiATitreTestConfiguration();
      await ensureDustAllergyTestConfiguration();
      await ensureDengueFeverPanelTestConfiguration();
      await ensureG6PdTestConfiguration();
      await ensureAntiHbsTestConfiguration();
      await ensureGangliosideGm1IggTestConfiguration();
      await ensureGangliosideGm1IgmTestConfiguration();
      await ensureGangliosideGd1aIggTestConfiguration();
      await ensureGangliosideGd1aIgmTestConfiguration();
      await ensureGangliosideGd1bIggTestConfiguration();
      await ensureGangliosideGq1bIggTestConfiguration();
      await ensureAntiHistoneAntibodiesTestConfiguration();
      await ensureRibosomePAntibodiesTestConfiguration();
    await ensureVitaminETestConfiguration();
    await ensureVitaminB9TestConfiguration();
    await ensureVitaminKTestConfiguration();
    await ensureLdlCholesterolTestConfiguration();
    await ensureHdlCholesterolTestConfiguration();
    await ensureIndirectBilirubinTestConfiguration();
    await ensureCalciumTestConfiguration();
    await ensureFerritinTestConfiguration();
    await ensureCPeptideTestConfiguration();
    await ensureVldlCholesterolTestConfiguration();
    await ensureComprehensiveMetabolicPanelTestConfiguration();
    await ensureElectrolyteProfileTestConfiguration();
    await ensurePotassiumTestConfiguration();
    await ensureAstSgotTestConfiguration();
    await ensureGlobulinTestConfiguration();
    await ensureAlbuminTestConfiguration();
    await ensureBunTestConfiguration();
    await ensureSodiumTestConfiguration();
    await ensureIronTestConfiguration();
    await ensureLacticAcidTestConfiguration();
    await ensureMagnesiumTestConfiguration();
    await ensureLipaseTestConfiguration();
    await ensureAmylaseTestConfiguration();
    await ensureGgtTestConfiguration();
    await ensureChlorideTestConfiguration();
    await ensureCreatinineTestConfiguration();
    await ensureIonizedCalciumTestConfiguration();
    await ensureFlecainideTestConfiguration();
    await ensurePhenobarbitalTestConfiguration();
    await ensureKetoneBodyTestConfiguration();
    await ensureUricAcidTestConfiguration();
    await ensureTibcTestConfiguration();
    await ensureSerumOsmolalityTestConfiguration();
    await ensureCreatinine24HourUrineTestConfiguration();
    await ensureArterialBloodGasTestConfiguration();
    await ensureManganeseBloodTestConfiguration();
    await ensureSeleniumSerumTestConfiguration();
    await seedCbcReportTests();
    await applyOneTimeMigration("cbc-calculation-defaults-v2", upgradeCbcCalculationDefaults);
    await applyOneTimeMigration("cbc-catalog-normalization-v3", normalizeCbcCatalogParameters);
    await ensureAbsoluteNeutrophilCountTestConfiguration();
    await ensureAbsoluteCountTestConfigurations();
    await ensureEsrTestConfiguration();
    await ensureIndividualHematologyReportTestConfigurations();
    await ensureHbTlcDlcEsrProfileBundle();
    await ensureBloodGroupTestConfiguration();
    await ensureDDimerTestConfiguration();
    await ensureSickleCellMutationAnalysisTestConfiguration();
    await ensureClottingTimeTestConfiguration();
    await ensureBleedingTimeTestConfiguration();
    await ensureCoagulationProfileTestConfiguration();
    await ensureFactorVTestConfiguration();
    await ensureFactorViiTestConfiguration();
    await ensureFactorIxTestConfiguration();
    await ensureFactorXTestConfiguration();
    await ensureFactorXiTestConfiguration();
    await ensureFactorViiiTestConfiguration();
    await ensureFactorXiiAndXiiiTestConfigurations();
    await ensurePeripheralBloodSmearTestConfiguration();
    await configureDefaultCalculatedParameters();
    await applyOneTimeMigration("legacy-report-schema-repair-v1", repairImportedLegacyReportSchemas);
    await ensureUserDefaults();
  }
}

async function recoverCorruptDatabase() {
  const databasePath = getDatabasePath();
  const ext = path.extname(databasePath);
  const name = path.basename(databasePath, ext);
  const dir = path.dirname(databasePath);
  const timestamp = new Date().toISOString().replaceAll(":", "-");
  const recoveredPath = path.join(dir, `${name}.recovered-${timestamp}${ext}`);
  await switchDatabasePath(recoveredPath);
  await fs.writeFile(recoveredPath, "");
}

if (require.main === module) {
  initializeDatabase()
    .then(() => {
      console.log("Database initialization complete.");
      process.exit(0);
    })
    .catch((error) => {
      console.error("Database initialization failed:", error);
      process.exit(1);
    });
}

module.exports = { initializeDatabase };
