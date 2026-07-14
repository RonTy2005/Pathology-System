const express = require("express");
const { all, get, run } = require("../db/helpers");
const { allowRoles } = require("../middleware/auth");
const { logAction } = require("../services/logService");
const { PAYMENT_MODES, ROLES } = require("../config/constants");

const accountRouter = express.Router();

function getLocalDateString() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

function normalizeDate(value) {
  const text = String(value || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : getLocalDateString();
}

function money(value) {
  return Number(value || 0);
}

async function getDailyAccounts(date) {
  const sales = await get(
    `
    SELECT
      COUNT(*) AS billCount,
      COALESCE(SUM(amount_paid), 0) AS total,
      COALESCE(SUM(CASE WHEN payment_mode = 'cash' THEN amount_paid ELSE 0 END), 0) AS cash,
      COALESCE(SUM(CASE WHEN payment_mode != 'cash' THEN amount_paid ELSE 0 END), 0) AS online,
      COALESCE(SUM(amount_paid), 0) AS initialPaid,
      COALESCE(SUM(CASE WHEN payment_mode = 'cash' THEN amount_paid ELSE 0 END), 0) AS initialCash,
      COALESCE(SUM(CASE WHEN payment_mode != 'cash' THEN amount_paid ELSE 0 END), 0) AS initialOnline
    FROM visits
    WHERE DATE(created_at, 'localtime') = ?
      AND COALESCE(sample_source, 'lab') = 'lab'
    `,
    [date]
  );

  const duesCleared = await get(
    `
    WITH due_payments AS (
      SELECT
        CAST(json_extract(l.meta, '$.amount') AS REAL) AS amount,
        COALESCE(json_extract(l.meta, '$.mode'), 'cash') AS paymentMode
      FROM logs l
      JOIN visits v ON l.entity_id = v.id
      WHERE l.action = 'payment_collected'
        AND DATE(l.created_at, 'localtime') = ?
        AND DATE(v.created_at, 'localtime') < ?
        AND COALESCE(v.sample_source, 'lab') = 'lab'
    )
    SELECT
      COALESCE(SUM(amount), 0) AS total,
      COALESCE(SUM(CASE WHEN paymentMode = 'cash' THEN amount ELSE 0 END), 0) AS cash,
      COALESCE(SUM(CASE WHEN paymentMode != 'cash' THEN amount ELSE 0 END), 0) AS online
    FROM due_payments
    `,
    [date, date]
  );

  const expenses = await get(
    `
    SELECT
      COALESCE(SUM(amount), 0) AS total,
      COALESCE(SUM(CASE WHEN payment_mode = 'cash' THEN amount ELSE 0 END), 0) AS cash,
      COALESCE(SUM(CASE WHEN payment_mode != 'cash' THEN amount ELSE 0 END), 0) AS online
    FROM expenses
    WHERE expense_date = ?
    `,
    [date]
  );

  const expenseRows = await all(
    `
    SELECT e.id, e.expense_date, e.amount, e.payment_mode, e.category, e.notes, e.created_at, u.full_name, u.username, v.name AS vendor_name
    FROM expenses e
    LEFT JOIN users u ON u.id = e.created_by
    LEFT JOIN vendors v ON v.id = e.vendor_id
    WHERE e.expense_date = ?
    ORDER BY e.created_at DESC, e.id DESC
    `,
    [date]
  );

  const refunds = await get(
    `
    SELECT
      COALESCE(SUM(amount), 0) AS total,
      COALESCE(SUM(CASE WHEN payment_mode = 'cash' THEN amount ELSE 0 END), 0) AS cash,
      COALESCE(SUM(CASE WHEN payment_mode != 'cash' THEN amount ELSE 0 END), 0) AS online
    FROM expenses
    WHERE expense_date = ? AND (category = 'Patient Refund' OR category = 'Refund')
    `,
    [date]
  );

  return {
    date,
    sales: {
      billCount: money(sales.billCount),
      total: money(sales.total) - money(refunds.total),
      cash: money(sales.cash) - money(refunds.cash),
      online: money(sales.online) - money(refunds.online),
      initialPaid: money(sales.initialPaid),
      initialCash: money(sales.initialCash),
      initialOnline: money(sales.initialOnline),
      refunds: money(refunds.total)
    },
    duesCleared: {
      total: money(duesCleared.total),
      cash: money(duesCleared.cash),
      online: money(duesCleared.online),
    },
    expenses: {
      total: money(expenses.total),
      cash: money(expenses.cash),
      online: money(expenses.online),
    },
    expected: {
      total: (money(sales.total) - money(refunds.total)) + money(duesCleared.total) - (money(expenses.total) - money(refunds.total)),
      cash: (money(sales.cash) - money(refunds.cash)) + money(duesCleared.cash) - (money(expenses.cash) - money(refunds.cash)),
      online: (money(sales.online) - money(refunds.online)) + money(duesCleared.online) - (money(expenses.online) - money(refunds.online)),
    },
    expenseRows,
  };
}

accountRouter.get("/daily", allowRoles(ROLES.ADMIN, ROLES.RECEPTIONIST), async (req, res, next) => {
  try {
    const date = normalizeDate(req.query.date);
    res.json(await getDailyAccounts(date));
  } catch (error) {
    next(error);
  }
});

accountRouter.post("/expenses", allowRoles(ROLES.ADMIN, ROLES.RECEPTIONIST), async (req, res, next) => {
  try {
    const expenseDate = normalizeDate(req.body.expenseDate);
    const amount = Number(req.body.amount);
    const paymentMode = String(req.body.paymentMode || "cash").trim();
    const category = String(req.body.category || "").trim();
    const vendorId = req.body.vendorId ? Number(req.body.vendorId) : null;
    const paidFrom = String(req.body.paidFrom || "reception").trim();
    const notes = String(req.body.notes || "").trim();

    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ message: "Enter a valid expense amount" });
    }

    if (!PAYMENT_MODES.includes(paymentMode)) {
      return res.status(400).json({ message: "Invalid payment mode" });
    }

    const created = await run(
      `
      INSERT INTO expenses (expense_date, amount, payment_mode, category, vendor_id, paid_from, notes, created_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `,
      [expenseDate, amount, paymentMode, category || null, vendorId, paidFrom, notes || null, req.user.id]
    );

    await logAction({
      userId: req.user.id,
      action: "expense_create",
      entityType: "expense",
      entityId: created.id,
      meta: { expenseDate, amount, paymentMode, category, vendorId, paidFrom, notes },
    });

    const expense = await get("SELECT * FROM expenses WHERE id = ?", [created.id]);
    res.status(201).json({ expense, accounts: await getDailyAccounts(expenseDate) });
  } catch (error) {
    next(error);
  }
});

accountRouter.get("/expenses", allowRoles(ROLES.ADMIN, ROLES.MANAGER), async (req, res, next) => {
  try {
    const category = String(req.query.category || "").trim();
    const dateFrom = req.query.dateFrom ? String(req.query.dateFrom).trim() : null;
    const dateTo = req.query.dateTo ? String(req.query.dateTo).trim() : null;

    let sql = `
      SELECT
        e.id,
        e.expense_date,
        e.amount,
        e.payment_mode,
        e.category,
        e.notes,
        e.created_at,
        u.full_name,
        u.username
      FROM expenses e
      LEFT JOIN users u ON u.id = e.created_by
      WHERE 1=1
    `;
    const params = [];

    if (category) {
      sql += " AND LOWER(COALESCE(e.category, '')) LIKE LOWER(?)";
      params.push(`%${category}%`);
    }

    if (dateFrom) {
      sql += " AND e.expense_date >= ?";
      params.push(dateFrom);
    }

    if (dateTo) {
      sql += " AND e.expense_date <= ?";
      params.push(dateTo);
    }

    sql += " ORDER BY e.expense_date DESC, e.created_at DESC LIMIT 500";

    const expenses = await all(sql, params);

    const totalRow = await get(
      `SELECT
         COALESCE(SUM(amount), 0) AS total,
         COALESCE(SUM(CASE WHEN payment_mode = 'cash' THEN amount ELSE 0 END), 0) AS cash,
         COALESCE(SUM(CASE WHEN payment_mode != 'cash' THEN amount ELSE 0 END), 0) AS online,
         COUNT(*) AS count
       FROM expenses e
       WHERE 1=1
         ${category ? "AND LOWER(COALESCE(e.category, '')) LIKE LOWER(?)" : ""}
         ${dateFrom ? "AND e.expense_date >= ?" : ""}
         ${dateTo ? "AND e.expense_date <= ?" : ""}`,
      [...(category ? [`%${category}%`] : []), ...(dateFrom ? [dateFrom] : []), ...(dateTo ? [dateTo] : [])]
    );

    res.json({ expenses, summary: totalRow });
  } catch (error) {
    next(error);
  }
});

accountRouter.delete("/expenses/:id", allowRoles(ROLES.ADMIN, ROLES.RECEPTIONIST), async (req, res, next) => {
  try {
    const expense = await get("SELECT * FROM expenses WHERE id = ?", [req.params.id]);
    if (!expense) {
      return res.status(404).json({ message: "Expense not found" });
    }

    await run("DELETE FROM expenses WHERE id = ?", [req.params.id]);
    await logAction({
      userId: req.user.id,
      action: "expense_delete",
      entityType: "expense",
      entityId: req.params.id,
      meta: expense,
    });

    res.json({ ok: true, accounts: await getDailyAccounts(expense.expense_date) });
  } catch (error) {
    next(error);
  }
});

accountRouter.post("/submit", allowRoles(ROLES.ADMIN, ROLES.RECEPTIONIST), async (req, res, next) => {
  try {
    const {
      submissionDate,
      cashExpected,
      onlineExpected,
      totalExpected,
      cashCounted,
      onlineCounted,
      cashVariance,
      onlineVariance,
      totalVariance,
      notes,
    } = req.body;

    const date = normalizeDate(submissionDate);

    const created = await run(
      `INSERT INTO daily_account_submissions
        (submission_date, submitted_by, cash_expected, online_expected, total_expected,
         cash_counted, online_counted, cash_variance, online_variance, total_variance, notes, submitted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [
        date,
        req.user.id,
        Number(cashExpected || 0),
        Number(onlineExpected || 0),
        Number(totalExpected || 0),
        Number(cashCounted || 0),
        Number(onlineCounted || 0),
        Number(cashVariance || 0),
        Number(onlineVariance || 0),
        Number(totalVariance || 0),
        notes || null,
      ]
    );

    await logAction({
      userId: req.user.id,
      action: "account_submitted",
      entityType: "daily_account_submission",
      entityId: created.id,
      meta: { date, totalExpected, totalVariance },
    });

    const submission = await get(
      `SELECT s.*, u.full_name, u.username, u.employment_title
       FROM daily_account_submissions s
       JOIN users u ON u.id = s.submitted_by
       WHERE s.id = ?`,
      [created.id]
    );

    res.status(201).json({ submission });
  } catch (error) {
    next(error);
  }
});

accountRouter.get("/submissions", allowRoles(ROLES.ADMIN, ROLES.MANAGER), async (req, res, next) => {
  try {
    const dateFrom = normalizeDate(req.query.dateFrom);
    const dateTo = normalizeDate(req.query.dateTo);

    const submissions = await all(
      `SELECT
         s.id,
         s.submission_date,
         s.cash_expected,
         s.online_expected,
         s.total_expected,
         s.cash_counted,
         s.online_counted,
         s.cash_variance,
         s.online_variance,
         s.total_variance,
         s.notes,
         s.submitted_at,
         u.full_name,
         u.username,
         u.employment_title
       FROM daily_account_submissions s
       JOIN users u ON u.id = s.submitted_by
       WHERE s.submission_date >= ? AND s.submission_date <= ?
       ORDER BY s.submitted_at DESC`,
      [dateFrom, dateTo]
    );

    res.json({ submissions });
  } catch (error) {
    next(error);
  }
});

// ── Vendor Management ──────────────────────────────────────────────────────

accountRouter.get("/vendors", allowRoles(ROLES.ADMIN, ROLES.MANAGER, ROLES.RECEPTIONIST), async (req, res, next) => {
  try {
    const vendors = await all("SELECT * FROM vendors WHERE active = 1 ORDER BY name ASC");
    res.json({ vendors });
  } catch (error) { next(error); }
});

accountRouter.post("/vendors", allowRoles(ROLES.ADMIN, ROLES.MANAGER), async (req, res, next) => {
  try {
    const { name, contactPerson, phone, category, notes } = req.body;
    if (!name?.trim()) return res.status(400).json({ message: "Vendor name is required" });
    const created = await run(
      `INSERT INTO vendors (name, contact_person, phone, category, notes, active, created_at)
       VALUES (?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP)`,
      [name.trim(), contactPerson?.trim() || null, phone?.trim() || null, category?.trim() || null, notes?.trim() || null]
    );
    const vendor = await get("SELECT * FROM vendors WHERE id = ?", [created.id]);
    res.status(201).json({ vendor });
  } catch (error) { next(error); }
});

accountRouter.patch("/vendors/:id", allowRoles(ROLES.ADMIN, ROLES.MANAGER), async (req, res, next) => {
  try {
    const { name, contactPerson, phone, category, notes } = req.body;
    await run(
      `UPDATE vendors SET name = ?, contact_person = ?, phone = ?, category = ?, notes = ? WHERE id = ?`,
      [name?.trim(), contactPerson?.trim() || null, phone?.trim() || null, category?.trim() || null, notes?.trim() || null, req.params.id]
    );
    const vendor = await get("SELECT * FROM vendors WHERE id = ?", [req.params.id]);
    res.json({ vendor });
  } catch (error) { next(error); }
});

accountRouter.delete("/vendors/:id", allowRoles(ROLES.ADMIN, ROLES.MANAGER), async (req, res, next) => {
  try {
    await run("UPDATE vendors SET active = 0 WHERE id = ?", [req.params.id]);
    res.json({ ok: true });
  } catch (error) { next(error); }
});

// ── Financial Report ──────────────────────────────────────────────────────

accountRouter.get("/financial-report", allowRoles(ROLES.ADMIN, ROLES.MANAGER), async (req, res, next) => {
  try {
    const dateFrom = normalizeDate(req.query.dateFrom);
    const dateTo = normalizeDate(req.query.dateTo);

    const sales = await get(
      `SELECT COALESCE(SUM(amount_paid), 0) AS total,
              COALESCE(SUM(CASE WHEN payment_mode = 'cash' THEN amount_paid ELSE 0 END), 0) AS cash,
              COALESCE(SUM(CASE WHEN payment_mode != 'cash' THEN amount_paid ELSE 0 END), 0) AS online,
              COUNT(*) AS billCount
       FROM visits
       WHERE DATE(created_at, 'localtime') >= ? AND DATE(created_at, 'localtime') <= ?
         AND COALESCE(sample_source, 'lab') = 'lab'`,
      [dateFrom, dateTo]
    );

    const dues = await get(
      `WITH dp AS (
         SELECT CAST(json_extract(l.meta, '$.amount') AS REAL) AS amount,
                COALESCE(json_extract(l.meta, '$.mode'), 'cash') AS mode
         FROM logs l JOIN visits v ON l.entity_id = v.id
         WHERE l.action = 'payment_collected'
           AND DATE(l.created_at, 'localtime') >= ? AND DATE(l.created_at, 'localtime') <= ?
           AND DATE(v.created_at, 'localtime') < ?
           AND COALESCE(v.sample_source, 'lab') = 'lab'
       )
       SELECT COALESCE(SUM(amount), 0) AS total,
              COALESCE(SUM(CASE WHEN mode = 'cash' THEN amount ELSE 0 END), 0) AS cash,
              COALESCE(SUM(CASE WHEN mode != 'cash' THEN amount ELSE 0 END), 0) AS online
       FROM dp`,
      [dateFrom, dateTo, dateFrom]
    );

    const expenseRows = await all(
      `SELECT e.*, v.name AS vendor_name
       FROM expenses e LEFT JOIN vendors v ON v.id = e.vendor_id
       WHERE e.expense_date >= ? AND e.expense_date <= ?
       ORDER BY e.expense_date ASC`,
      [dateFrom, dateTo]
    );

    // Add salary payments as expenses
    const salaryRows = await all(
      `SELECT 
         sp.id,
         sp.payment_month AS expense_date,
         sp.paid_amount AS amount,
         sp.payment_mode,
         'Salary' AS category,
         NULL AS vendor_id,
         'office' AS paid_from,
         u.full_name AS vendor_name,
         sp.notes,
         sp.payment_date AS created_at
       FROM salary_payments sp
       LEFT JOIN users u ON sp.user_id = u.id
       WHERE sp.is_paid = 1
         AND DATE(sp.payment_date, 'localtime') >= ? AND DATE(sp.payment_date, 'localtime') <= ?
       ORDER BY sp.payment_date ASC`,
      [dateFrom, dateTo]
    );

    const allExpenses = [...expenseRows, ...salaryRows];

    const expenseTotal = allExpenses.reduce((s, e) => s + Number(e.amount), 0);
    const expenseCash = allExpenses.filter(e => e.payment_mode === 'cash').reduce((s, e) => s + Number(e.amount), 0);
    const expenseOnline = allExpenses.filter(e => e.payment_mode !== 'cash').reduce((s, e) => s + Number(e.amount), 0);

    const byCategory = {};
    for (const e of allExpenses) {
      const cat = e.category || "General";
      if (!byCategory[cat]) byCategory[cat] = { total: 0, cash: 0, online: 0 };
      byCategory[cat].total += Number(e.amount);
      if (e.payment_mode === 'cash') byCategory[cat].cash += Number(e.amount);
      else byCategory[cat].online += Number(e.amount);
    }

    const byVendor = {};
    for (const e of allExpenses) {
      if (!e.vendor_id && !e.vendor_name) continue;
      const vname = e.vendor_name || (e.vendor_id ? `Vendor #${e.vendor_id}` : "—");
      if (!byVendor[vname]) byVendor[vname] = 0;
      byVendor[vname] += Number(e.amount);
    }

    const refunds = expenseRows.filter(e => (e.category || "").toLowerCase().includes("refund")).reduce((s, e) => s + Number(e.amount), 0);

    const bySource = { reception: 0, office: 0, bank: 0, other: 0 };
    for (const e of allExpenses) {
      const src = (e.paid_from || "reception").toLowerCase();
      if (bySource.hasOwnProperty(src)) bySource[src] += Number(e.amount);
      else bySource.other += Number(e.amount);
    }

    const outstandingDues = await get(
      `SELECT COALESCE(SUM(amount_due), 0) AS total FROM visits
       WHERE DATE(created_at, 'localtime') >= ? AND DATE(created_at, 'localtime') <= ?
         AND COALESCE(sample_source, 'lab') = 'lab'`,
      [dateFrom, dateTo]
    );

    const totalCollected = Number(sales.total) + Number(dues.total);
    const grossSales = Number(sales.total) + Number(outstandingDues.total);
    const netRevenue = totalCollected - expenseTotal;

    res.json({
      dateFrom, dateTo,
      sales: { ...sales, refunds },
      duesCleared: dues,
      totalCollected,
      grossSales,
      expenses: { 
        total: expenseTotal, 
        cash: expenseCash, 
        online: expenseOnline, 
        byCategory, 
        byVendor, 
        bySource,
        rows: allExpenses 
      },
      netRevenue,
      outstandingDues: outstandingDues.total,
    });
  } catch (error) { next(error); }
});

accountRouter.get("/financial-report/download", allowRoles(ROLES.ADMIN, ROLES.MANAGER), async (req, res, next) => {
  try {
    const dateFrom = normalizeDate(req.query.dateFrom);
    const dateTo = normalizeDate(req.query.dateTo);

    const dailyRows = await all(
      `SELECT
         DATE(v.created_at, 'localtime') AS day,
         COALESCE(SUM(v.amount_paid), 0) AS sales,
         COUNT(v.id) AS bills
       FROM visits v
       WHERE DATE(v.created_at, 'localtime') >= ? AND DATE(v.created_at, 'localtime') <= ?
         AND COALESCE(v.sample_source, 'lab') = 'lab'
       GROUP BY day ORDER BY day ASC`,
      [dateFrom, dateTo]
    );

    const dailyExpenses = await all(
      `SELECT expense_date AS day, COALESCE(SUM(amount), 0) AS expenses
       FROM expenses WHERE expense_date >= ? AND expense_date <= ?
       GROUP BY day ORDER BY day ASC`,
      [dateFrom, dateTo]
    );

    const expMap = {};
    for (const row of dailyExpenses) expMap[row.day] = Number(row.expenses);

    const allDays = [...new Set([...dailyRows.map(r => r.day), ...dailyExpenses.map(r => r.day)])].sort();

    const salesMap = {};
    for (const row of dailyRows) salesMap[row.day] = { sales: Number(row.sales), bills: row.bills };

    let csvLines = ["Date,Bills,Sales (₹),Expenses (₹),Net Revenue (₹)"];
    let totalSales = 0, totalExpenses = 0, totalBills = 0;

    for (const day of allDays) {
      const s = salesMap[day] || { sales: 0, bills: 0 };
      const exp = expMap[day] || 0;
      const net = s.sales - exp;
      totalSales += s.sales;
      totalExpenses += exp;
      totalBills += s.bills;
      csvLines.push(`${day},${s.bills},${s.sales.toFixed(2)},${exp.toFixed(2)},${net.toFixed(2)}`);
    }

    csvLines.push("");
    csvLines.push(`TOTAL,${totalBills},${totalSales.toFixed(2)},${totalExpenses.toFixed(2)},${(totalSales - totalExpenses).toFixed(2)}`);

    const expenseBreakdown = await all(
      `SELECT COALESCE(category, 'General') AS category, COALESCE(SUM(amount), 0) AS total
       FROM expenses WHERE expense_date >= ? AND expense_date <= ?
       GROUP BY category ORDER BY total DESC`,
      [dateFrom, dateTo]
    );
    csvLines.push("");
    csvLines.push("Expense Category Breakdown");
    csvLines.push("Category,Total (₹)");
    for (const row of expenseBreakdown) {
      csvLines.push(`"${row.category}",${Number(row.total).toFixed(2)}`);
    }

    const vendorBreakdown = await all(
      `SELECT COALESCE(v.name, 'Unlinked') AS vendor, COALESCE(SUM(e.amount), 0) AS total
       FROM expenses e LEFT JOIN vendors v ON v.id = e.vendor_id
       WHERE e.expense_date >= ? AND e.expense_date <= ? AND e.vendor_id IS NOT NULL
       GROUP BY vendor ORDER BY total DESC`,
      [dateFrom, dateTo]
    );
    if (vendorBreakdown.length) {
      csvLines.push("");
      csvLines.push("Vendor-wise Expense Breakdown");
      csvLines.push("Vendor,Total (₹)");
      for (const row of vendorBreakdown) {
        csvLines.push(`"${row.vendor}",${Number(row.total).toFixed(2)}`);
      }
    }

    const filename = `financial-report-${dateFrom}-to-${dateTo}.csv`;
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(csvLines.join("\r\n"));
  } catch (error) { next(error); }
});

module.exports = { accountRouter };
