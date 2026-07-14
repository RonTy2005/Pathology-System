const express = require("express");
const { all, get, run } = require("../db/helpers");
const { allowPermissions, allowRoles } = require("../middleware/auth");
const { logAction } = require("../services/logService");
const { ACCESS_CONTROLS, PERMISSIONS, ROLES } = require("../config/constants");

const associateRouter = express.Router();

associateRouter.get("/", async (req, res, next) => {
  try {
    const query = `%${req.query.query || ""}%`;
    const includeInactive = req.user.role === ROLES.ADMIN && req.query.includeInactive === "1";
    const associates = await all(
      `
      SELECT *
      FROM associates
      WHERE (? = 1 OR active = 1)
        AND (
          name LIKE ?
          OR associate_code LIKE ?
          OR COALESCE(phone, '') LIKE ?
          OR COALESCE(notes, '') LIKE ?
        )
      ORDER BY name ASC
      `,
      [includeInactive ? 1 : 0, query, query, query, query]
    );

    res.json({
      associates,
      directOption: {
        associate_code: "DIRECT",
        name: "Direct at lab",
        associate_type: "direct",
      },
    });
  } catch (error) {
    next(error);
  }
});

associateRouter.post("/", async (req, res, next) => {
    try {
      if (!req.user.accessControls?.[ACCESS_CONTROLS.ADD_ASSOCIATE]) {
        return res.status(403).json({ message: "Associate entry is disabled for this user" });
      }

      const { name, associateType, phone, notes, commissionPercent } = req.body;
      let { associateCode } = req.body;

      if (!associateCode) {
        const latest = await get(`SELECT id FROM associates ORDER BY id DESC LIMIT 1`);
        const nextId = (latest?.id || 0) + 1;
        associateCode = `ASC-${String(nextId).padStart(4, "0")}`;
      }
      const created = await run(
        `INSERT INTO associates (associate_code, name, associate_type, phone, commission_percent, notes, active, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP)`,
        [associateCode, name, associateType || "collector", phone || null, Number(commissionPercent || 0), notes || null]
      );
      const associate = await get("SELECT * FROM associates WHERE id = ?", [created.id]);

      await logAction({
        userId: req.user.id,
        action: "associate_create",
        entityType: "associate",
        entityId: created.id,
        meta: { name, associateCode },
      });

      res.status(201).json({ associate });
    } catch (error) {
      if (error.message.includes("UNIQUE")) {
        return res.status(400).json({ message: "Associate code already exists" });
      }
      next(error);
    }
  }
);

associateRouter.patch(
  "/:id",
  allowRoles(ROLES.ADMIN, ROLES.MANAGER),
  allowPermissions(PERMISSIONS.MANAGE_ASSOCIATES),
  async (req, res, next) => {
    try {
      await run(
        `UPDATE associates
         SET associate_code = COALESCE(?, associate_code),
             name = COALESCE(?, name),
             associate_type = COALESCE(?, associate_type),
             phone = ?,
             commission_percent = COALESCE(?, commission_percent),
             notes = ?,
             active = COALESCE(?, active)
         WHERE id = ?`,
        [
          req.body.associateCode || null,
          req.body.name,
          req.body.associateType,
          req.body.phone || null,
          Object.prototype.hasOwnProperty.call(req.body, "commissionPercent") ? Number(req.body.commissionPercent || 0) : null,
          req.body.notes || null,
          req.body.active,
          req.params.id,
        ]
      );

      await logAction({
        userId: req.user.id,
        action: "associate_update",
        entityType: "associate",
        entityId: req.params.id,
        meta: req.body,
      });

      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  }
);

associateRouter.delete("/:id", allowRoles(ROLES.ADMIN, ROLES.MANAGER), allowPermissions(PERMISSIONS.MANAGE_ASSOCIATES), async (req, res, next) => {
  try {
    const associateId = parseInt(req.params.id);
    const assoc = await get("SELECT * FROM associates WHERE id = ?", [associateId]);
    if (!assoc) {
      return res.status(404).json({ message: "Associate not found" });
    }

    await run("DELETE FROM associates WHERE id = ?", [associateId]);

    await logAction({
      userId: req.user.id,
      action: "associate_delete",
      entityType: "associate",
      entityId: associateId,
      meta: { name: assoc.name, code: assoc.associate_code },
    });

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

associateRouter.get("/:id/ledger", allowRoles(ROLES.ADMIN, ROLES.MANAGER), async (req, res, next) => {
  try {
    const associateId = req.params.id;
    const bills = await all(
      `
      SELECT 
        v.id, 
        v.bill_no, 
        v.created_at, 
        v.total, 
        v.subtotal,
        v.discount,
        a.commission_percent,
        ROUND(v.total * (100 - a.commission_percent) / 100, 2) AS lab_share
      FROM visits v
      JOIN associates a ON a.id = v.associate_id
      WHERE v.associate_id = ?
      ORDER BY v.created_at DESC
      `,
      [associateId]
    );

    const payments = await all(
      `
      SELECT p.*, u.full_name AS collector_name
      FROM associate_payments p
      LEFT JOIN users u ON u.id = p.created_by
      WHERE p.associate_id = ?
      ORDER BY p.payment_date DESC, p.id DESC
      `,
      [associateId]
    );

    const totalLabShare = bills.reduce((sum, b) => sum + b.lab_share, 0);
    const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);

    res.json({
      bills,
      payments,
      summary: {
        totalLabShare,
        totalPaid,
        balance: totalLabShare - totalPaid
      }
    });
  } catch (error) {
    next(error);
  }
});

associateRouter.post("/:id/payments", allowRoles(ROLES.ADMIN, ROLES.MANAGER), async (req, res, next) => {
  try {
    const { amount, paymentDate, paymentMode, notes } = req.body;
    const associateId = req.params.id;

    const created = await run(
      `INSERT INTO associate_payments (associate_id, payment_date, amount, payment_mode, notes, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [associateId, paymentDate, amount, paymentMode || 'cash', notes || null, req.user.id]
    );

    await logAction({
      userId: req.user.id,
      action: "associate_payment",
      entityType: "associate",
      entityId: associateId,
      meta: { amount, paymentDate },
    });

    res.status(201).json({ id: created.id });
  } catch (error) {
    next(error);
  }
});

module.exports = { associateRouter };
