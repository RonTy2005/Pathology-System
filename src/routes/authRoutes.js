const express = require("express");
const { authenticate, createSession, destroySession, getSession } = require("../services/authService");
const { authRequired } = require("../middleware/auth");
const { logAction } = require("../services/logService");
const { isBusinessSetupComplete } = require("../services/businessSettingsService");
const { getSubscriptionStatus } = require("../services/subscriptionService");
const { ROLES } = require("../config/constants");

const authRouter = express.Router();

authRouter.post("/login", async (req, res, next) => {
  try {
    const { username, password } = req.body;
    const user = await authenticate(username, password);

    if (!user) {
      return res.status(401).json({ message: "Invalid username or password" });
    }

    const subscription = await getSubscriptionStatus();
    if (!subscription.active && user.role !== ROLES.SUPERADMIN) {
      return res.status(423).json({
        message: "This application subscription has expired. Please contact the Super Admin to renew it.",
        code: "SUBSCRIPTION_EXPIRED",
      });
    }

    const token = await createSession(user);
    await logAction({
      userId: user.id,
      action: "login",
      entityType: "session",
      entityId: token.slice(0, 12),
      meta: { username: user.username },
    });

    const session = await getSession(token);
    const setupRequired = user.role === ROLES.SUPERADMIN && !(await isBusinessSetupComplete());

    res.json({
      token,
      user: session.user,
      setupRequired,
      subscription,
      subscriptionExpired: !subscription.active,
    });
  } catch (error) {
    next(error);
  }
});

authRouter.get("/me", authRequired, async (req, res) => {
  res.json({ user: req.user });
});

authRouter.post("/logout", authRequired, async (req, res, next) => {
  try {
    await logAction({
      userId: req.user.id,
      action: "logout",
      entityType: "session",
      entityId: req.token.slice(0, 12),
    });
    await destroySession(req.token);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

module.exports = { authRouter };
