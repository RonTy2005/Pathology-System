const express = require("express");
const { all, get, run } = require("../db/helpers");
const { allowRoles } = require("../middleware/auth");
const { logAction } = require("../services/logService");
const { ROLES, PAYMENT_MODES } = require("../config/constants");

const salaryRouter = express.Router();

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

// Get all salary payments with filters
salaryRouter.get(
  "/",
  allowRoles(ROLES.ADMIN),
  async (req, res, next) => {
    try {
      const userId = req.query.userId ? Number(req.query.userId) : null;
      const paymentMonth = req.query.paymentMonth ? String(req.query.paymentMonth).trim() : null;
      const isPaid = req.query.isPaid !== undefined ? Number(req.query.isPaid) : null;

      let sql = `
        SELECT
          sp.id,
          sp.user_id,
          sp.payment_month,
          sp.salary_amount,
          sp.paid_amount,
          sp.is_paid,
          sp.payment_date,
          sp.payment_mode,
          sp.notes,
          sp.created_at,
          sp.updated_at,
          u.full_name,
          u.username,
          u.employment_title,
          u.active
        FROM salary_payments sp
        LEFT JOIN users u ON sp.user_id = u.id
        WHERE 1 = 1
      `;
      const params = [];

      if (userId) {
        sql += ` AND sp.user_id = ?`;
        params.push(userId);
      }

      if (paymentMonth) {
        sql += ` AND sp.payment_month = ?`;
        params.push(paymentMonth);
      }

      if (isPaid !== null) {
        sql += ` AND sp.is_paid = ?`;
        params.push(isPaid);
      }

      sql += ` ORDER BY sp.payment_month DESC, u.full_name ASC`;

      const salaryPayments = await all(sql, params);

      res.json({
        salaryPayments: salaryPayments.map((sp) => ({
          id: sp.id,
          userId: sp.user_id,
          fullName: sp.full_name,
          username: sp.username,
          employmentTitle: sp.employment_title,
          isActive: sp.active === 1,
          paymentMonth: sp.payment_month,
          salaryAmount: money(sp.salary_amount),
          paidAmount: money(sp.paid_amount),
          isPaid: sp.is_paid === 1,
          paymentDate: sp.payment_date,
          paymentMode: sp.payment_mode,
          notes: sp.notes,
          createdAt: sp.created_at,
          updatedAt: sp.updated_at,
        })),
      });
    } catch (error) {
      next(error);
    }
  }
);

// Get salary payments for a specific user
salaryRouter.get(
  "/user/:userId",
  allowRoles(ROLES.ADMIN),
  async (req, res, next) => {
    try {
      const userId = Number(req.params.userId);
      if (!Number.isFinite(userId) || userId <= 0) {
        return res.status(400).json({ message: "Invalid user ID" });
      }

      const user = await get("SELECT * FROM users WHERE id = ?", [userId]);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const salaryPayments = await all(
        `
        SELECT *
        FROM salary_payments
        WHERE user_id = ?
        ORDER BY payment_month DESC
        `,
        [userId]
      );

      res.json({
        user: {
          id: user.id,
          fullName: user.full_name,
          username: user.username,
          employmentTitle: user.employment_title,
          joiningDate: user.joining_date,
        },
        salaryPayments: salaryPayments.map((sp) => ({
          id: sp.id,
          paymentMonth: sp.payment_month,
          salaryAmount: money(sp.salary_amount),
          paidAmount: money(sp.paid_amount),
          isPaid: sp.is_paid === 1,
          paymentDate: sp.payment_date,
          paymentMode: sp.payment_mode,
          notes: sp.notes,
          createdAt: sp.created_at,
          updatedAt: sp.updated_at,
        })),
      });
    } catch (error) {
      next(error);
    }
  }
);

// Create salary payment record
salaryRouter.post(
  "/",
  allowRoles(ROLES.ADMIN),
  async (req, res, next) => {
    try {
      const userId = Number(req.body.userId);
      const paymentMonth = String(req.body.paymentMonth || "").trim();
      const salaryAmount = money(req.body.salaryAmount);

      if (!Number.isFinite(userId) || userId <= 0) {
        return res.status(400).json({ message: "Invalid user ID" });
      }

      if (!paymentMonth.match(/^\d{4}-\d{2}$/)) {
        return res
          .status(400)
          .json({ message: "Invalid payment month format. Use YYYY-MM" });
      }

      if (!Number.isFinite(salaryAmount) || salaryAmount < 0) {
        return res.status(400).json({ message: "Invalid salary amount" });
      }

      const user = await get("SELECT * FROM users WHERE id = ?", [userId]);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Check if salary record already exists
      const existing = await get(
        "SELECT * FROM salary_payments WHERE user_id = ? AND payment_month = ?",
        [userId, paymentMonth]
      );

      if (existing) {
        return res
          .status(409)
          .json({ message: "Salary record already exists for this month" });
      }

      const created = await run(
        `
        INSERT INTO salary_payments (user_id, payment_month, salary_amount, is_paid, created_by, created_at, updated_at)
        VALUES (?, ?, ?, 0, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `,
        [userId, paymentMonth, salaryAmount, req.user.id]
      );

      await logAction({
        userId: req.user.id,
        action: "salary_payment_create",
        entityType: "salary_payment",
        entityId: created.id,
        meta: { userId, paymentMonth, salaryAmount },
      });

      const record = await get(
        `
        SELECT sp.*, u.full_name
        FROM salary_payments sp
        LEFT JOIN users u ON sp.user_id = u.id
        WHERE sp.id = ?
        `,
        [created.id]
      );

      res.status(201).json({
        message: "Salary record created",
        salaryPayment: {
          id: record.id,
          userId: record.user_id,
          fullName: record.full_name,
          paymentMonth: record.payment_month,
          salaryAmount: money(record.salary_amount),
          paidAmount: money(record.paid_amount),
          isPaid: record.is_paid === 1,
          paymentDate: record.payment_date,
          paymentMode: record.payment_mode,
          notes: record.notes,
          createdAt: record.created_at,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// Mark salary as paid
salaryRouter.post(
  "/:id/mark-paid",
  allowRoles(ROLES.ADMIN),
  async (req, res, next) => {
    try {
      const salaryPaymentId = Number(req.params.id);
      const paidAmount = money(req.body.paidAmount);
      const paymentMode = String(req.body.paymentMode || "cash").trim();
      const notes = String(req.body.notes || "").trim();
      const paymentDate = req.body.paymentDate ? normalizeDate(req.body.paymentDate) : getLocalDateString();

      if (!Number.isFinite(salaryPaymentId) || salaryPaymentId <= 0) {
        return res.status(400).json({ message: "Invalid salary payment ID" });
      }

      if (!Number.isFinite(paidAmount) || paidAmount <= 0) {
        return res.status(400).json({ message: "Invalid paid amount" });
      }

      if (!PAYMENT_MODES.includes(paymentMode)) {
        return res.status(400).json({ message: "Invalid payment mode" });
      }

      const record = await get("SELECT * FROM salary_payments WHERE id = ?", [
        salaryPaymentId,
      ]);

      if (!record) {
        return res.status(404).json({ message: "Salary payment record not found" });
      }

      if (paidAmount > record.salary_amount) {
        return res.status(400).json({
          message: "Paid amount cannot exceed salary amount",
        });
      }

      const isPaid = paidAmount >= record.salary_amount ? 1 : 0;

      await run(
        `
        UPDATE salary_payments
        SET is_paid = ?, paid_amount = ?, payment_mode = ?, payment_date = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
        `,
        [isPaid, paidAmount, paymentMode, paymentDate, notes || null, salaryPaymentId]
      );

      await logAction({
        userId: req.user.id,
        action: "salary_payment_mark_paid",
        entityType: "salary_payment",
        entityId: salaryPaymentId,
        meta: { paidAmount, paymentMode, paymentDate, notes },
      });

      const updated = await get(
        `
        SELECT sp.*, u.full_name
        FROM salary_payments sp
        LEFT JOIN users u ON sp.user_id = u.id
        WHERE sp.id = ?
        `,
        [salaryPaymentId]
      );

      res.json({
        message: "Salary marked as paid",
        salaryPayment: {
          id: updated.id,
          userId: updated.user_id,
          fullName: updated.full_name,
          paymentMonth: updated.payment_month,
          salaryAmount: money(updated.salary_amount),
          paidAmount: money(updated.paid_amount),
          isPaid: updated.is_paid === 1,
          paymentDate: updated.payment_date,
          paymentMode: updated.payment_mode,
          notes: updated.notes,
          updatedAt: updated.updated_at,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// Update salary record
salaryRouter.put(
  "/:id",
  allowRoles(ROLES.ADMIN),
  async (req, res, next) => {
    try {
      const salaryPaymentId = Number(req.params.id);
      const salaryAmount = money(req.body.salaryAmount);
      const notes = String(req.body.notes || "").trim();

      if (!Number.isFinite(salaryPaymentId) || salaryPaymentId <= 0) {
        return res.status(400).json({ message: "Invalid salary payment ID" });
      }

      if (!Number.isFinite(salaryAmount) || salaryAmount < 0) {
        return res.status(400).json({ message: "Invalid salary amount" });
      }

      const record = await get("SELECT * FROM salary_payments WHERE id = ?", [
        salaryPaymentId,
      ]);

      if (!record) {
        return res.status(404).json({ message: "Salary payment record not found" });
      }

      // If salary is already marked as paid, prevent editing the amount
      if (record.is_paid && salaryAmount !== record.salary_amount) {
        return res.status(400).json({
          message: "Cannot change salary amount for paid records",
        });
      }

      await run(
        `
        UPDATE salary_payments
        SET salary_amount = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
        `,
        [salaryAmount, notes || null, salaryPaymentId]
      );

      await logAction({
        userId: req.user.id,
        action: "salary_payment_update",
        entityType: "salary_payment",
        entityId: salaryPaymentId,
        meta: { salaryAmount, notes },
      });

      const updated = await get(
        `
        SELECT sp.*, u.full_name
        FROM salary_payments sp
        LEFT JOIN users u ON sp.user_id = u.id
        WHERE sp.id = ?
        `,
        [salaryPaymentId]
      );

      res.json({
        message: "Salary record updated",
        salaryPayment: {
          id: updated.id,
          userId: updated.user_id,
          fullName: updated.full_name,
          paymentMonth: updated.payment_month,
          salaryAmount: money(updated.salary_amount),
          paidAmount: money(updated.paid_amount),
          isPaid: updated.is_paid === 1,
          paymentDate: updated.payment_date,
          paymentMode: updated.payment_mode,
          notes: updated.notes,
          updatedAt: updated.updated_at,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// Delete salary record
salaryRouter.delete(
  "/:id",
  allowRoles(ROLES.ADMIN),
  async (req, res, next) => {
    try {
      const salaryPaymentId = Number(req.params.id);

      if (!Number.isFinite(salaryPaymentId) || salaryPaymentId <= 0) {
        return res.status(400).json({ message: "Invalid salary payment ID" });
      }

      const record = await get("SELECT * FROM salary_payments WHERE id = ?", [
        salaryPaymentId,
      ]);

      if (!record) {
        return res.status(404).json({ message: "Salary payment record not found" });
      }

      if (record.is_paid) {
        return res.status(400).json({
          message: "Cannot delete paid salary records",
        });
      }

      await run("DELETE FROM salary_payments WHERE id = ?", [salaryPaymentId]);

      await logAction({
        userId: req.user.id,
        action: "salary_payment_delete",
        entityType: "salary_payment",
        entityId: salaryPaymentId,
        meta: { recordInfo: record },
      });

      res.json({ message: "Salary record deleted" });
    } catch (error) {
      next(error);
    }
  }
);

// Get salary summary for financial reports
salaryRouter.get(
  "/summary/financial",
  allowRoles(ROLES.ADMIN),
  async (req, res, next) => {
    try {
      const dateFrom = req.query.dateFrom ? String(req.query.dateFrom).trim() : null;
      const dateTo = req.query.dateTo ? String(req.query.dateTo).trim() : null;

      let sql = `
        SELECT
          COALESCE(SUM(CASE WHEN is_paid = 1 THEN salary_amount ELSE 0 END), 0) AS total_paid,
          COALESCE(SUM(CASE WHEN is_paid = 1 THEN paid_amount ELSE 0 END), 0) AS total_disbursed,
          COALESCE(SUM(CASE WHEN is_paid = 0 THEN salary_amount ELSE 0 END), 0) AS total_pending,
          COUNT(CASE WHEN is_paid = 1 THEN 1 END) AS employees_paid,
          COUNT(CASE WHEN is_paid = 0 THEN 1 END) AS employees_pending
        FROM salary_payments
        WHERE 1 = 1
      `;
      const params = [];

      if (dateFrom) {
        sql += ` AND DATE(payment_date, 'localtime') >= ?`;
        params.push(dateFrom);
      }

      if (dateTo) {
        sql += ` AND DATE(payment_date, 'localtime') <= ?`;
        params.push(dateTo);
      }

      const summary = await get(sql, params);

      res.json({
        summary: {
          totalPaid: money(summary.total_paid),
          totalDisbursed: money(summary.total_disbursed),
          totalPending: money(summary.total_pending),
          employeesPaid: summary.employees_paid,
          employeesPending: summary.employees_pending,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

module.exports = { salaryRouter };
