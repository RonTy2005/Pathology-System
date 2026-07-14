const fs = require("fs/promises");
const path = require("path");

const { all, ensureColumn, get, run } = require("./helpers");
const { switchDatabasePath, getDatabasePath } = require("./connection");
const { hashPassword } = require("../services/authService");
const { PERMISSIONS, ROLES, ROLE_ACCESS_CONTROL_DEFAULTS, ROLE_PERMISSION_DEFAULTS } = require("../config/constants");

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
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS test_parameters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      test_id INTEGER NOT NULL,
      parameter_name TEXT NOT NULL,
      unit TEXT,
      normal_range TEXT,
      display_order INTEGER DEFAULT 1,
      FOREIGN KEY (test_id) REFERENCES tests(id) ON DELETE CASCADE
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
      entered_by INTEGER NOT NULL,
      entered_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (visit_test_id) REFERENCES visit_tests(id) ON DELETE CASCADE,
      FOREIGN KEY (entered_by) REFERENCES users(id)
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
  const admin = await get("SELECT * FROM users WHERE username = ?", ["admin"]);

  if (!admin) {
    await run(
      `INSERT INTO users (username, password, role, full_name, employee_code, permissions, access_controls, active, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        "admin",
        hashPassword("admin123"),
        ROLES.ADMIN,
        "System Admin",
        "EMP-ADMIN-001",
        JSON.stringify(ROLE_PERMISSION_DEFAULTS[ROLES.ADMIN]),
        JSON.stringify(ROLE_ACCESS_CONTROL_DEFAULTS[ROLES.ADMIN]),
        1,
        buildNow(),
      ]
    );
    return;
  }

  if (!String(admin.password).includes(":")) {
    await run("UPDATE users SET password = ? WHERE id = ?", [
      hashPassword(admin.password),
      admin.id,
    ]);
  }

  if (!admin.permissions) {
    await run("UPDATE users SET permissions = ? WHERE id = ?", [
      JSON.stringify(ROLE_PERMISSION_DEFAULTS[ROLES.ADMIN]),
      admin.id,
    ]);
  }

  if (!admin.access_controls) {
    await run("UPDATE users SET access_controls = ? WHERE id = ?", [
      JSON.stringify(ROLE_ACCESS_CONTROL_DEFAULTS[ROLES.ADMIN]),
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

    if (user.role === ROLES.ADMIN && !permissions.includes(PERMISSIONS.DELETE_PATIENTS)) {
      permissions = Array.from(new Set([...permissions, PERMISSIONS.DELETE_PATIENTS]));
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
