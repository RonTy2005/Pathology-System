const { PERMISSIONS, ROLES, isAdministrativeRole } = require("../config/constants");
const { getSession } = require("../services/authService");
const { getSubscriptionStatus } = require("../services/subscriptionService");

async function authRequired(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    let token = header.startsWith("Bearer ") ? header.slice(7) : null;

    if (!token && req.query.token) {
      token = req.query.token;
    }

    if (!token) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const session = await getSession(token);
    if (!session) {
      return res.status(401).json({ message: "Invalid or expired session" });
    }

    req.user = session.user;
    req.token = token;
    return next();
  } catch (error) {
    return next(error);
  }
}

async function requireActiveSubscription(_req, res, next) {
  try {
    const subscription = await getSubscriptionStatus();
    if (!subscription.active) {
      return res.status(423).json({
        message: "The application subscription has expired. Please contact the Super Admin to renew it.",
        code: "SUBSCRIPTION_EXPIRED",
        subscription,
      });
    }
    next();
  } catch (error) {
    next(error);
  }
}

function allowRoles(...roles) {
  return (req, res, next) => {
    const hasRole = req.user && (
      roles.includes(req.user.role)
      || (roles.includes(ROLES.ADMIN) && isAdministrativeRole(req.user.role))
    );

    if (!hasRole) {
      return res.status(403).json({ message: "Permission denied" });
    }
    next();
  };
}

function hasPermission(user, permission) {
  if (!user) {
    return false;
  }

  return Array.isArray(user.permissions) && user.permissions.includes(permission);
}

function allowPermissions(...permissions) {
  return (req, res, next) => {
    const allowed = permissions.every((permission) => hasPermission(req.user, permission));
    if (!allowed) {
      return res.status(403).json({ message: "Permission denied for this action" });
    }
    next();
  };
}

function allowAnyPermission(...permissions) {
  return (req, res, next) => {
    const allowed = permissions.some((permission) => hasPermission(req.user, permission));
    if (!allowed) {
      return res.status(403).json({ message: "Permission denied for this action" });
    }
    next();
  };
}

module.exports = {
  authRequired,
  requireActiveSubscription,
  allowRoles,
  allowPermissions,
  allowAnyPermission,
  hasPermission,
  PERMISSIONS,
};
