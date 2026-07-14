const express = require("express");
const { all, get, run } = require("../db/helpers");
const { allowPermissions, allowRoles } = require("../middleware/auth");
const { logAction } = require("../services/logService");
const { ACCESS_CONTROLS, PERMISSIONS, ROLES } = require("../config/constants");

const doctorRouter = express.Router();

doctorRouter.get("/search", async (req, res, next) => {
  try {
    const rawQuery = String(req.query.q || req.query.query || "").trim();

    if (!rawQuery) {
      res.json({ doctors: [] });
      return;
    }

    const query = `%${rawQuery}%`;
    const normalizedQuery = `%${rawQuery.replace(/\./g, "")}%`;
    const compactQuery = `%${rawQuery.replace(/[.\s]/g, "")}%`;
    const prefixQuery = `${rawQuery}%`;
    const normalizedPrefixQuery = `${rawQuery.replace(/\./g, "")}%`;
    const compactPrefixQuery = `${rawQuery.replace(/[.\s]/g, "")}%`;
    const doctors = await all(
      `
      SELECT id, name, phone, specialization, commission_percent, commission_rules
      FROM doctors
      WHERE active = 1
        AND (
          name LIKE ?
          OR REPLACE(name, '.', '') LIKE ?
          OR REPLACE(REPLACE(REPLACE(name, '.', ''), ' ', ''), char(9), '') LIKE ?
          OR COALESCE(phone, '') LIKE ?
          OR COALESCE(specialization, '') LIKE ?
        )
      ORDER BY
        CASE
          WHEN name LIKE ?
            OR REPLACE(name, '.', '') LIKE ?
            OR REPLACE(REPLACE(REPLACE(name, '.', ''), ' ', ''), char(9), '') LIKE ?
          THEN 0
          ELSE 1
        END,
        name ASC
      LIMIT 10
      `,
      [
        query,
        normalizedQuery,
        compactQuery,
        query,
        query,
        prefixQuery,
        normalizedPrefixQuery,
        compactPrefixQuery,
      ]
    );

    res.json({ doctors });
  } catch (error) {
    next(error);
  }
});

doctorRouter.get("/", async (req, res, next) => {
  try {
    const query = `%${req.query.query || ""}%`;
    const doctors = await all(
      `
      SELECT
        d.*,
        COUNT(DISTINCT v.id) AS referred_patients,
        COALESCE(SUM(v.total), 0) AS revenue_generated,
        ROUND(COALESCE(SUM(v.total), 0) * d.commission_percent / 100, 2) AS commission_amount
      FROM doctors d
      LEFT JOIN visits v ON v.doctor_id = d.id
      WHERE d.active = 1
        AND (d.name LIKE ? OR COALESCE(d.phone, '') LIKE ? OR COALESCE(d.specialization, '') LIKE ?)
      GROUP BY d.id
      ORDER BY d.name ASC
      `,
      [query, query, query]
    );
    res.json({ doctors });
  } catch (error) {
    next(error);
  }
});

doctorRouter.post("/", async (req, res, next) => {
  try {
    if (!req.user.accessControls?.[ACCESS_CONTROLS.ADD_DOCTOR] && !req.body.isAutoCreate) {
      return res.status(403).json({ message: "Doctor entry is disabled for this user" });
    }

    const { name, phone, specialization, commissionPercent, commissionRules } = req.body;
    const created = await run(
      `INSERT INTO doctors (name, phone, specialization, commission_percent, commission_rules, active, created_at)
       VALUES (?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP)`,
      [name, phone, specialization, commissionPercent || 0, commissionRules || null]
    );
    const doctor = await get("SELECT * FROM doctors WHERE id = ?", [created.id]);

    await logAction({
      userId: req.user.id,
      action: "doctor_create",
      entityType: "doctor",
      entityId: created.id,
      meta: { name },
    });

    res.status(201).json({ doctor });
  } catch (error) {
    next(error);
  }
});

doctorRouter.put("/:id", allowRoles(ROLES.ADMIN, ROLES.MANAGER), allowPermissions(PERMISSIONS.MANAGE_DOCTORS), async (req, res, next) => {
  try {
    const { name, phone, specialization, commissionPercent, commissionRules, active } = req.body;
    await run(
      `UPDATE doctors
       SET name = ?, phone = ?, specialization = ?, commission_percent = ?, commission_rules = ?, active = ?
       WHERE id = ?`,
      [name, phone, specialization, commissionPercent || 0, commissionRules || null, active ? 1 : 0, req.params.id]
    );

    await logAction({
      userId: req.user.id,
      action: "doctor_update",
      entityType: "doctor",
      entityId: req.params.id,
      meta: req.body,
    });

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

doctorRouter.delete("/:id", allowRoles(ROLES.ADMIN, ROLES.MANAGER), allowPermissions(PERMISSIONS.MANAGE_DOCTORS), async (req, res, next) => {
  try {
    const doctorId = parseInt(req.params.id);
    const doctor = await get("SELECT * FROM doctors WHERE id = ?", [doctorId]);
    if (!doctor) {
      return res.status(404).json({ message: "Doctor not found" });
    }

    await run("DELETE FROM doctors WHERE id = ?", [doctorId]);

    await logAction({
      userId: req.user.id,
      action: "doctor_delete",
      entityType: "doctor",
      entityId: doctorId,
      meta: { name: doctor.name },
    });

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

module.exports = { doctorRouter };
