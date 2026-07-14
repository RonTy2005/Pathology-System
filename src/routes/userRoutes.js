const express = require("express");
const { all, get, run } = require("../db/helpers");
const { allowPermissions, allowRoles } = require("../middleware/auth");
const { hashPassword, normalizeAccessControls, normalizePermissions } = require("../services/authService");
const { logAction } = require("../services/logService");
const { PERMISSIONS, ROLES } = require("../config/constants");

const userRouter = express.Router();

function isProtectedDefaultAdmin(user) {
  return user?.username === "admin";
}

function canRecoverUserCredentials(user) {
  return isProtectedDefaultAdmin(user);
}

userRouter.use(allowRoles(ROLES.ADMIN));
userRouter.use(allowPermissions(PERMISSIONS.MANAGE_USERS));

userRouter.get("/", async (_req, res, next) => {
  try {
    const users = await all(
`SELECT id, username, role, full_name, employee_code, joining_date, employment_title, permissions, access_controls, profile_image, id_card_updated_at, active, created_at
       FROM users
       ORDER BY created_at DESC`
    );
    res.json({
      users: users.map((user) => ({
        id: user.id,
        username: user.username,
        role: user.role,
        full_name: user.full_name,
        employee_code: user.employee_code,
        joining_date: user.joining_date,
        employment_title: user.employment_title,
        permissions: normalizePermissions(user.role, user.permissions),
        access_controls: normalizeAccessControls(user.role, user.access_controls),
        hasProfileImage: Boolean(user.profile_image),
        id_card_updated_at: user.id_card_updated_at,
        active: user.active,
        created_at: user.created_at,
        is_protected_system_admin: isProtectedDefaultAdmin(user),
      })),
    });
  } catch (error) {
    next(error);
  }
});

userRouter.get("/:id", async (req, res, next) => {
  try {
    const user = await get(
      `SELECT id, username, role, full_name, employee_code, joining_date, employment_title, permissions, access_controls, profile_image, id_card_updated_at, active, created_at
       FROM users
       WHERE id = ?`,
      [req.params.id]
    );

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({
      user: {
        ...user,
        permissions: normalizePermissions(user.role, user.permissions),
        access_controls: normalizeAccessControls(user.role, user.access_controls),
        is_protected_system_admin: isProtectedDefaultAdmin(user),
      },
    });
  } catch (error) {
    next(error);
  }
});

userRouter.post("/", async (req, res, next) => {
  try {
    const { username, password, role, fullName, joiningDate, employmentTitle, permissions, accessControls, profileImage } = req.body;
    let { employeeCode } = req.body;
    
    if (!employeeCode) {
      const latest = await get(`SELECT id FROM users ORDER BY id DESC LIMIT 1`);
      const nextId = (latest?.id || 0) + 1;
      employeeCode = `EMP-${String(nextId).padStart(4, "0")}`;
    }

    const normalizedPermissions = normalizePermissions(role, permissions);
    const normalizedAccessControls = normalizeAccessControls(role, accessControls);
    const created = await run(
      `INSERT INTO users (username, password, role, full_name, employee_code, joining_date, employment_title, permissions, access_controls, profile_image, id_card_updated_at, active, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP)`,
      [
        username,
        hashPassword(password),
        role,
        fullName || username,
        employeeCode || null,
        joiningDate || null,
        employmentTitle || null,
        JSON.stringify(normalizedPermissions),
        JSON.stringify(normalizedAccessControls),
        profileImage || null,
        profileImage ? new Date().toISOString() : null,
      ]
    );
    const user = await get(
      `SELECT id, username, role, full_name, employee_code, joining_date, employment_title, permissions, access_controls, profile_image, id_card_updated_at, active, created_at
       FROM users
       WHERE id = ?`,
      [created.id]
    );

    await logAction({
      userId: req.user.id,
      action: "user_created",
      entityType: "user",
      entityId: created.id,
      meta: { username, role, fullName },
    });

    res.status(201).json({
      user: {
        ...user,
        permissions: normalizePermissions(user.role, user.permissions),
        access_controls: normalizeAccessControls(user.role, user.access_controls),
      },
    });
  } catch (error) {
    if (error.message.includes("UNIQUE")) {
      res.status(400).json({ message: "Username already exists" });
      return;
    }
    next(error);
  }
});

userRouter.patch("/:id", async (req, res, next) => {
  try {
    const current = await get("SELECT * FROM users WHERE id = ?", [req.params.id]);
    if (!current) {
      return res.status(404).json({ message: "User not found" });
    }

    if (isProtectedDefaultAdmin(current)) {
      return res.status(400).json({ message: 'Protected system administrator account "admin" cannot be edited' });
    }

    const role = req.body.role || current.role;
    const permissions = normalizePermissions(role, req.body.permissions ?? current.permissions);
    const accessControls = normalizeAccessControls(role, req.body.accessControls ?? current.access_controls);
    const profileImage = Object.prototype.hasOwnProperty.call(req.body, "profileImage")
      ? req.body.profileImage
      : current.profile_image;
    const nextUsername = Object.prototype.hasOwnProperty.call(req.body, "username") && canRecoverUserCredentials(req.user)
      ? req.body.username
      : current.username;
    const nextPassword = req.body.password && canRecoverUserCredentials(req.user)
      ? hashPassword(req.body.password)
      : current.password;

    await run(
      `UPDATE users
       SET username = ?,
           password = ?,
           full_name = COALESCE(?, full_name),
           employee_code = COALESCE(?, employee_code),
           joining_date = COALESCE(?, joining_date),
           employment_title = COALESCE(?, employment_title),
           role = COALESCE(?, role),
           permissions = ?,
           access_controls = ?,
           profile_image = ?,
           id_card_updated_at = ?,
           active = COALESCE(?, active)
       WHERE id = ?`,
      [
        nextUsername,
        nextPassword,
        req.body.fullName || null,
        req.body.employeeCode || null,
        req.body.joiningDate || null,
        req.body.employmentTitle || null,
        req.body.role,
        JSON.stringify(permissions),
        JSON.stringify(accessControls),
        profileImage || null,
        Object.prototype.hasOwnProperty.call(req.body, "profileImage") ? new Date().toISOString() : current.id_card_updated_at,
        req.body.active,
        req.params.id,
      ]
    );

    await logAction({
      userId: req.user.id,
      action: "user_updated",
      entityType: "user",
      entityId: req.params.id,
      meta: { ...req.body, password: req.body.password ? "[REDACTED]" : undefined },
    });

    res.json({ ok: true });
  } catch (error) {
    if (error.message.includes("UNIQUE")) {
      return res.status(400).json({ message: "Username already exists" });
    }
    next(error);
  }
});

userRouter.delete("/:id", async (req, res, next) => {
  try {
    const userId = parseInt(req.params.id);
    const userToDelete = await get("SELECT * FROM users WHERE id = ?", [userId]);
    if (!userToDelete) {
      return res.status(404).json({ message: "Employee not found" });
    }

    if (isProtectedDefaultAdmin(userToDelete)) {
      return res.status(400).json({ message: 'Protected system administrator account "admin" cannot be deleted' });
    }

    if (userToDelete.id === req.user.id) {
      return res.status(400).json({ message: "Cannot delete your own account" });
    }

    // Perform permanent deletion. 
    // We disable foreign keys temporarily so that we can delete users who have created records (bills, logs, etc.).
    // The system uses LEFT JOINs for user lookups, so historical records will simply show 'N/A' or 'Deleted User' instead of crashing.
    await run("PRAGMA foreign_keys = OFF");
    await run("DELETE FROM users WHERE id = ?", [userId]);
    await run("PRAGMA foreign_keys = ON");

    await logAction({
      userId: req.user.id,
      action: "user_deleted",
      entityType: "user",
      entityId: userId,
      meta: { username: userToDelete.username },
    });

    res.json({ ok: true, message: "Employee deleted permanently" });
  } catch (error) {
    next(error);
  }
});

module.exports = { userRouter };
