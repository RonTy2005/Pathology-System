const express = require("express");
const { all, get } = require("../db/helpers");
const { allowRoles } = require("../middleware/auth");
const { ROLES } = require("../config/constants");

const dashboardRouter = express.Router();

function buildDateFilter({ dateFrom, dateTo }, column = "v.created_at") {
  const params = [];
  let sql = "1 = 1";

  if (dateFrom) {
    sql += ` AND DATE(${column}, 'localtime') >= ?`;
    params.push(dateFrom);
  }

  if (dateTo) {
    sql += ` AND DATE(${column}, 'localtime') <= ?`;
    params.push(dateTo);
  }

  return { sql, params };
}

function parseOptionalPositiveNumber(value, label) {
  if (value == null || value === "") {
    return null;
  }

  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue <= 0) {
    const error = new Error(`Invalid ${label}`);
    error.statusCode = 400;
    throw error;
  }

  return numberValue;
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function sendCsv(res, filename, rows) {
  const csv = rows.map((row) => row.map(csvCell).join(",")).join("\n");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(csv);
}

function normalizeCommissionCategory(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");
}

function getServiceCommissionCategory(row) {
  const category = normalizeCommissionCategory(row.category);
  const sampleType = normalizeCommissionCategory(row.sampleType);
  const description = normalizeCommissionCategory(
    [row.category, row.custom_test_name, row.catalogTestName].filter(Boolean).join(" ")
  );

  if (category === "CT SCAN" || /\bCT\b|COMPUTED TOMOGRAPHY/.test(description)) {
    return "CT Scan";
  }
  if (category === "MRI" || /\bMRI\b|MAGNETIC RESONANCE/.test(description)) {
    return "MRI";
  }

  const bloodCategoryTerms = [
    "HEMATOLOGY",
    "HAEMATOLOGY",
    "BIOCHEMISTRY",
    "SEROLOGY",
    "HORMONE",
    "ELECTROLYTE",
    "ENDOCRINOLOGY",
    "IMMUNOLOGY",
    "CHEMISTRY",
    "CLINICAL PATHOLOGY",
    "PATHOLOGY",
  ];
  if (sampleType.includes("BLOOD") || bloodCategoryTerms.some((term) => category.includes(term))) {
    return "Blood";
  }

  return null;
}

function getCommissionRule(rules, row) {
  const category = normalizeCommissionCategory(row.category || "General");
  const ruleEntries = Object.entries(rules || {});
  const exactCategoryRule = ruleEntries.find(([ruleCategory]) => normalizeCommissionCategory(ruleCategory) === category);
  if (exactCategoryRule) {
    return exactCategoryRule[1];
  }

  const serviceCategory = getServiceCommissionCategory(row);
  const serviceRule = ruleEntries.find(
    ([ruleCategory]) => normalizeCommissionCategory(ruleCategory) === normalizeCommissionCategory(serviceCategory)
  );
  return serviceRule ? serviceRule[1] : null;
}

async function getDetailedDoctorCommissions(dateFilter) {
  const rows = await all(
    `
    SELECT
      d.id AS doctorId,
      d.name AS doctorName,
      d.phone,
      d.specialization,
      d.commission_percent,
      d.commission_rules,
      v.id AS visitId,
      v.status AS visitStatus,
      v.amount_due AS visitDue,
      v.subtotal AS visitSubtotal,
      v.total AS visitTotal,
      vt.custom_test_price,
      vt.custom_test_name,
      t.price AS catalogPrice,
      t.name AS catalogTestName,
      t.category,
      t.sample_type AS sampleType
    FROM doctors d
    JOIN visits v ON v.doctor_id = d.id
    LEFT JOIN visit_tests vt ON vt.visit_id = v.id
    LEFT JOIN tests t ON t.id = vt.test_id
    WHERE ${dateFilter.sql}
    ORDER BY d.name ASC, v.created_at DESC
    `,
    dateFilter.params
  );

  const doctorCommissionsMap = {};

  rows.forEach((row) => {
    if (!doctorCommissionsMap[row.doctorId]) {
      doctorCommissionsMap[row.doctorId] = {
        id: row.doctorId,
        name: row.doctorName,
        phone: row.phone,
        specialization: row.specialization,
        commission_percent: row.commission_percent,
        totalSales: 0,
        visitCount: 0,
        commissionAmount: 0,
        dueReportCount: 0,
        dueReportAmount: 0,
        dueReportCommissionAmount: 0,
        _processedVisits: new Set(),
      };
    }

    const d = doctorCommissionsMap[row.doctorId];
    if (!d._processedVisits.has(row.visitId)) {
      d.totalSales += row.visitTotal;
      d.visitCount += 1;
      if (row.visitStatus === "reported" && row.visitDue > 0) {
        d.dueReportCount += 1;
        d.dueReportAmount += row.visitDue;
      }
      d._processedVisits.add(row.visitId);
    }

    let rules = {};
    try {
      rules = JSON.parse(row.commission_rules || "{}");
    } catch (e) {}

    const rule = getCommissionRule(rules, row);
    const price = row.custom_test_price || row.catalogPrice || 0;
    const ratio = row.visitSubtotal > 0 ? row.visitTotal / row.visitSubtotal : 1;
    const netPrice = price * ratio;

    let comm = 0;
    if (rule) {
      if (rule.type === "percent") {
        comm = (netPrice * rule.value) / 100;
      } else if (rule.type === "fixed") {
        comm = rule.value;
      }
    } else {
      comm = (netPrice * (d.commission_percent || 0)) / 100;
    }

    d.commissionAmount += comm;
    if (row.visitStatus === "reported" && row.visitDue > 0) {
      d.dueReportCommissionAmount += comm;
    }
  });

  return Object.values(doctorCommissionsMap).map((d) => {
    delete d._processedVisits;
    d.commissionAmount = Math.round(d.commissionAmount * 100) / 100;
    d.dueReportCommissionAmount = Math.round(d.dueReportCommissionAmount * 100) / 100;
    return d;
  });
}

async function getDetailedDoctorVisitCommissions(dateFilter, doctorId = null) {
  let idFilter = "";
  const params = [...dateFilter.params];
  if (doctorId) {
    idFilter = " AND d.id = ?";
    params.push(doctorId);
  }

  const rows = await all(
    `
    SELECT
      DATE(v.created_at, 'localtime') AS visitDate,
      v.bill_no,
      p.name AS patient_name,
      d.name AS party_name,
      d.commission_percent,
      d.commission_rules,
      v.id AS visitId,
      v.status,
      v.amount_due,
      v.subtotal,
      v.total,
      vt.custom_test_price,
      vt.custom_test_name,
      t.price AS catalogPrice,
      t.name AS catalogTestName,
      t.category,
      t.sample_type AS sampleType
    FROM visits v
    JOIN patients p ON p.id = v.patient_id
    JOIN doctors d ON d.id = v.doctor_id
    LEFT JOIN visit_tests vt ON vt.visit_id = v.id
    LEFT JOIN tests t ON t.id = vt.test_id
    WHERE ${dateFilter.sql}${idFilter}
    ORDER BY v.created_at ASC
    `,
    params
  );

  const visitsMap = {};
  rows.forEach((row) => {
    if (!visitsMap[row.visitId]) {
      visitsMap[row.visitId] = {
        visitDate: row.visitDate,
        bill_no: row.bill_no,
        patient_name: row.patient_name,
        party_name: row.party_name,
        total: row.total,
        amount_due: row.amount_due,
        status: row.status,
        commission_percent: row.commission_percent,
        commissionAmount: 0,
        rules: {},
        subtotal: row.subtotal,
      };
      try {
        visitsMap[row.visitId].rules = JSON.parse(row.commission_rules || "{}");
      } catch (e) {}
    }

    const v = visitsMap[row.visitId];
    const rule = getCommissionRule(v.rules, row);
    const price = row.custom_test_price || row.catalogPrice || 0;
    const ratio = v.subtotal > 0 ? v.total / v.subtotal : 1;
    const netPrice = price * ratio;

    let comm = 0;
    if (rule) {
      if (rule.type === "percent") {
        comm = (netPrice * rule.value) / 100;
      } else {
        comm = rule.value;
      }
    } else {
      comm = (netPrice * (v.commission_percent || 0)) / 100;
    }
    v.commissionAmount += comm;
  });

  return Object.values(visitsMap).map((v) => {
    v.commissionAmount = Math.round(v.commissionAmount * 100) / 100;
    return v;
  });
}

dashboardRouter.get("/overview", async (_req, res, next) => {
  try {
    const counts = {
      patientsToday: await get(
        `SELECT COUNT(*) AS count FROM visits WHERE date(created_at, 'localtime') = date('now', 'localtime')`
      ),
      pendingReports: await get(`SELECT COUNT(*) AS count FROM visits WHERE status != 'reported'`),
      dueAmount: await get(`SELECT COALESCE(SUM(amount_due), 0) AS amount FROM visits`),
      activeDoctors: await get(`SELECT COUNT(*) AS count FROM doctors WHERE active = 1`),
    };

    const recentLogs = await all(
      `
      SELECT l.created_at, l.action, l.entity_type, l.entity_id, u.full_name
      FROM logs l
      LEFT JOIN users u ON u.id = l.user_id
      ORDER BY l.created_at DESC
      LIMIT 8
      `
    );

    res.json({
      overview: {
        patientsToday: counts.patientsToday.count,
        pendingReports: counts.pendingReports.count,
        dueAmount: counts.dueAmount.amount,
        activeDoctors: counts.activeDoctors.count,
      },
      recentLogs,
    });
  } catch (error) {
    next(error);
  }
});

dashboardRouter.get("/charts", allowRoles(ROLES.ADMIN, ROLES.MANAGER), async (req, res, next) => {
  try {
    // 1. Sales trend for last 15 days
    const salesTrend = await all(`
      WITH RECURSIVE dates(date) AS (
        SELECT date('now', 'localtime', '-14 days')
        UNION ALL
        SELECT date(date, '+1 day') FROM dates WHERE date < date('now', 'localtime')
      )
      SELECT 
        d.date,
        COALESCE(SUM(v.amount_paid), 0) AS daily_sales
      FROM dates d
      LEFT JOIN visits v ON DATE(v.created_at, 'localtime') = d.date AND COALESCE(v.sample_source, 'lab') = 'lab'
      GROUP BY d.date
      ORDER BY d.date ASC
    `);

    // 2. Revenue breakdown (Current Month)
    const breakdown = await get(`
      SELECT 
        COALESCE(SUM(CASE WHEN v.payment_mode = 'cash' THEN v.amount_paid ELSE 0 END), 0) AS cash,
        COALESCE(SUM(CASE WHEN v.payment_mode != 'cash' THEN v.amount_paid ELSE 0 END), 0) AS online,
        (
          SELECT COALESCE(SUM(CAST(json_extract(l.meta, '$.amount') AS REAL)), 0)
          FROM logs l
          JOIN visits v2 ON l.entity_id = v2.id
          WHERE l.action = 'payment_collected'
            AND DATE(l.created_at, 'localtime') >= DATE('now', 'localtime', 'start of month')
            AND DATE(v2.created_at, 'localtime') < DATE(l.created_at, 'localtime')
        ) AS dues_cleared
      FROM visits v
      WHERE DATE(v.created_at, 'localtime') >= DATE('now', 'localtime', 'start of month')
        AND COALESCE(v.sample_source, 'lab') = 'lab'
    `);

    // 3. Top Expense Categories (Current Month)
    const topExpenses = await all(`
      SELECT category, SUM(amount) AS total
      FROM expenses
      WHERE expense_date >= DATE('now', 'localtime', 'start of month')
      GROUP BY category
      ORDER BY total DESC
      LIMIT 5
    `);

    res.json({
      salesTrend,
      revenueBreakdown: {
        cash: breakdown.cash,
        online: breakdown.online,
        duesCleared: breakdown.dues_cleared
      },
      topExpenses
    });
  } catch (error) {
    next(error);
  }
});

dashboardRouter.get("/financials", allowRoles(ROLES.ADMIN, ROLES.MANAGER), async (req, res, next) => {
  try {
    const dateFilter = buildDateFilter(req.query);
    const sales = await get(
      `
      SELECT
        COUNT(*) AS visitCount,
        COALESCE(SUM(v.total), 0) AS totalSales,
        COALESCE(SUM(v.amount_paid), 0) AS totalPaid,
        COALESCE(SUM(v.amount_due), 0) AS totalDue,
        COUNT(CASE WHEN v.status = 'reported' AND COALESCE(v.amount_due, 0) > 0 THEN 1 END) AS dueReportCount,
        COALESCE(SUM(CASE WHEN v.status = 'reported' AND COALESCE(v.amount_due, 0) > 0 THEN v.amount_due ELSE 0 END), 0) AS dueReportAmount,
        COALESCE(SUM(CASE WHEN v.associate_id IS NULL THEN v.total ELSE 0 END), 0) AS directSales,
        COUNT(CASE WHEN v.associate_id IS NULL THEN 1 END) AS directVisits,
        COALESCE(SUM(CASE WHEN v.associate_id IS NOT NULL THEN v.total ELSE 0 END), 0) AS associateSales,
        COUNT(CASE WHEN v.associate_id IS NOT NULL THEN 1 END) AS associateVisits
      FROM visits v
      WHERE ${dateFilter.sql}
      `,
      dateFilter.params
    );

    const doctorCommissions = await getDetailedDoctorCommissions(dateFilter);

    const associateCommissions = await all(
      `
      SELECT
        a.id,
        a.associate_code,
        a.name,
        a.associate_type,
        a.phone,
        a.commission_percent,
        COUNT(v.id) AS visitCount,
        COALESCE(SUM(v.total), 0) AS totalSales,
        ROUND(COALESCE(SUM(v.total), 0) * a.commission_percent / 100, 2) AS commissionAmount
      FROM associates a
      JOIN visits v ON v.associate_id = a.id
      WHERE ${dateFilter.sql}
      GROUP BY a.id
      ORDER BY commissionAmount DESC, a.name ASC
      `,
      dateFilter.params
    );

    res.json({ sales, doctorCommissions, associateCommissions });
  } catch (error) {
    next(error);
  }
});

dashboardRouter.get("/due-reports", allowRoles(ROLES.ADMIN, ROLES.MANAGER), async (req, res, next) => {
  try {
    const dateFilter = buildDateFilter(req.query);
    const doctorId = parseOptionalPositiveNumber(req.query.doctorId, "doctor");
    const dueReportFilter = `${dateFilter.sql} AND COALESCE(v.amount_due, 0) > 0`;
    const params = [...dateFilter.params];
    let doctorFilter = "";

    if (doctorId) {
      doctorFilter = " AND d.id = ?";
      params.push(doctorId);
    }

    const doctorCommissions = await getDetailedDoctorCommissions(dateFilter);
    const commissionOnDueReports = doctorCommissions.reduce((sum, d) => sum + d.dueReportCommissionAmount, 0);

    const summary = await get(
      `
      SELECT
        COUNT(v.id) AS dueReportCount,
        COALESCE(SUM(v.total), 0) AS totalSales,
        COALESCE(SUM(v.amount_due), 0) AS totalDue
      FROM visits v
      JOIN patients p ON p.id = v.patient_id
      LEFT JOIN doctors d ON d.id = v.doctor_id
      WHERE ${dueReportFilter}${doctorFilter}
      `,
      params
    );
    summary.commissionOnDueReports = commissionOnDueReports;

    const reports = await all(
      `
      SELECT
        v.id,
        v.bill_no,
        DATE(v.created_at, 'localtime') AS visitDate,
        v.created_at,
        v.total,
        v.amount_paid,
        v.amount_due,
        v.payment_status,
        v.status,
        p.patient_code,
        p.name AS patient_name,
        p.phone,
        d.id AS doctor_id,
        d.name AS doctor_name,
        d.commission_percent,
        r.report_no,
        r.finalized_at,
        r.technician_print_count,
        r.admin_print_count,
        ROUND(v.total * COALESCE(d.commission_percent, 0) / 100, 2) AS commissionAmount,
        GROUP_CONCAT(DISTINCT COALESCE(vt.custom_test_name, t.name)) AS tests
      FROM visits v
      JOIN patients p ON p.id = v.patient_id
      LEFT JOIN doctors d ON d.id = v.doctor_id
      LEFT JOIN reports r ON r.visit_id = v.id
      LEFT JOIN visit_tests vt ON vt.visit_id = v.id
      LEFT JOIN tests t ON t.id = vt.test_id
      WHERE ${dueReportFilter}${doctorFilter}
      GROUP BY v.id
      ORDER BY v.created_at DESC
      LIMIT 200
      `,
      params
    );

    res.json({ summary, reports });
  } catch (error) {
    next(error);
  }
});

dashboardRouter.get("/commission-report", allowRoles(ROLES.ADMIN, ROLES.MANAGER), async (req, res, next) => {
  try {
    const type = req.query.type === "associate" ? "associate" : "doctor";
    const dateFilter = buildDateFilter(req.query);
    const id = parseOptionalPositiveNumber(req.query.id, type);
    const rows = [
      [
        "Date",
        "Bill/Registration No",
        "Patient",
        type === "associate" ? "Associate" : "Doctor",
        "Total",
        "Amount Due",
        "Report Status",
        "Commission %",
        "Commission Amount",
        "Ready Report With Due",
      ],
    ];

    let data;
    if (type === "associate") {
      const params = [...dateFilter.params];
      let idFilter = "";
      if (id) {
        idFilter = " AND a.id = ?";
        params.push(id);
      }

      data = await all(
        `
        SELECT
          DATE(v.created_at, 'localtime') AS visitDate,
          v.bill_no,
          p.name AS patient_name,
          a.name AS party_name,
          v.total,
          v.amount_due,
          v.status,
          a.commission_percent,
          ROUND(v.total * a.commission_percent / 100, 2) AS commissionAmount
        FROM visits v
        JOIN patients p ON p.id = v.patient_id
        JOIN associates a ON a.id = v.associate_id
        WHERE ${dateFilter.sql}${idFilter}
        ORDER BY v.created_at ASC
        `,
        params
      );
    } else {
      data = await getDetailedDoctorVisitCommissions(dateFilter, id);
    }

    let totalSales = 0;
    let totalDue = 0;
    let totalCommission = 0;
    data.forEach((item) => {
      totalSales += Number(item.total || 0);
      totalDue += Number(item.amount_due || 0);
      totalCommission += Number(item.commissionAmount || 0);
      rows.push([
        item.visitDate,
        item.bill_no,
        item.patient_name,
        item.party_name,
        Number(item.total || 0).toFixed(2),
        Number(item.amount_due || 0).toFixed(2),
        item.status,
        Number(item.commission_percent || 0).toFixed(2),
        Number(item.commissionAmount || 0).toFixed(2),
        item.status === "reported" && Number(item.amount_due || 0) > 0 ? "Yes" : "No",
      ]);
    });

    rows.push([]);
    rows.push(["", "", "", "Totals", totalSales.toFixed(2), totalDue.toFixed(2), "", "", totalCommission.toFixed(2), ""]);

    const from = req.query.dateFrom || "start";
    const to = req.query.dateTo || "today";
    sendCsv(res, `${type}-commission-${from}-to-${to}.csv`, rows);
  } catch (error) {
    next(error);
  }
});

dashboardRouter.get("/patient-data-csv", allowRoles(ROLES.ADMIN, ROLES.MANAGER), async (req, res, next) => {
  try {
    const dateFilter = buildDateFilter(req.query);
    const rows = [
      [
        "Bill No",
        "Date",
        "Patient Code",
        "Patient Name",
        "Age",
        "Gender",
        "Phone",
        "Referred By",
        "Tests",
        "Subtotal",
        "Discount",
        "Total",
        "Paid",
        "Due",
        "Status",
        "Payment Mode",
      ],
    ];

    const data = await all(
      `
      SELECT 
        v.id,
        v.bill_no,
        DATE(v.created_at, 'localtime') AS visitDate,
        p.patient_code,
        p.name AS patient_name,
        p.age,
        p.gender,
        p.phone,
        d.name AS doctor_name,
        v.subtotal,
        v.discount,
        v.total,
        v.amount_paid,
        v.amount_due,
        v.status,
        v.payment_mode,
        (SELECT GROUP_CONCAT(COALESCE(vt.custom_test_name, t.name), ', ') 
         FROM visit_tests vt 
         LEFT JOIN tests t ON t.id = vt.test_id 
         WHERE vt.visit_id = v.id) AS tests
      FROM visits v
      JOIN patients p ON v.patient_id = p.id
      LEFT JOIN doctors d ON v.doctor_id = d.id
      WHERE ${dateFilter.sql}
      ORDER BY v.created_at DESC
      `,
      dateFilter.params
    );

    data.forEach((item) => {
      rows.push([
        item.bill_no,
        item.visitDate,
        item.patient_code,
        item.patient_name,
        item.age,
        item.gender,
        item.phone,
        item.doctor_name || "Self",
        item.tests || "-",
        item.subtotal,
        item.discount,
        item.total,
        item.amount_paid,
        item.amount_due,
        item.status,
        item.payment_mode,
      ]);
    });

    const from = req.query.dateFrom || "start";
    const to = req.query.dateTo || "today";
    sendCsv(res, `patient-data-${from}-to-${to}.csv`, rows);
  } catch (error) {
    next(error);
  }
});

module.exports = { dashboardRouter };
