const { PERMISSIONS, ROLES } = require("../config/constants");
const { getSession } = require("../services/authService");

function authRequired(req, res, next) {
  const header = req.headers.authorization || "";
  let token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token && req.query.token) {
    token = req.query.token;
  }

  if (!token) {
    return res.status(401).json({ message: "Authentication required" });
  }

  const session = getSession(token);
  if (!session) {
    return res.status(401).json({ message: "Invalid or expired session" });
  }

  req.user = session.user;
  req.token = token;
  next();
}

function allowRoles(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
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
  allowRoles,
  allowPermissions,
  allowAnyPermission,
  hasPermission,
  PERMISSIONS,
};
