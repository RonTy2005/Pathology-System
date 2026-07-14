const express = require("express");
const fs = require("fs/promises");
const path = require("path");

const { allowRoles } = require("../middleware/auth");
const { getDatabasePath } = require("../db/connection");
const { logAction } = require("../services/logService");
const { ROLES } = require("../config/constants");

const backupRouter = express.Router();

backupRouter.post("/", allowRoles(ROLES.ADMIN), async (req, res, next) => {
  try {
    const backupDir = path.join(process.cwd(), "backups");
    await fs.mkdir(backupDir, { recursive: true });

    const timestamp = new Date().toISOString().replaceAll(":", "-");
    const backupFile = path.join(backupDir, `lab-lms-${timestamp}.db`);
    await fs.copyFile(getDatabasePath(), backupFile);

    await logAction({
      userId: req.user.id,
      action: "database_backup",
      entityType: "backup",
      entityId: path.basename(backupFile),
    });

    res.json({ ok: true, backupFile });
  } catch (error) {
    next(error);
  }
});

module.exports = { backupRouter };
