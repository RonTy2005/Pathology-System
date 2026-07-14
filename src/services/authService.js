const crypto = require("crypto");
const { get } = require("../db/helpers");
const { PERMISSIONS, ROLE_ACCESS_CONTROL_DEFAULTS, ROLE_PERMISSION_DEFAULTS } = require("../config/constants");

const sessions = new Map();
const KNOWN_PERMISSIONS = new Set(Object.values(PERMISSIONS));

function normalizePermissions(role, rawPermissions) {
  const defaultPermissions = ROLE_PERMISSION_DEFAULTS[role] || [];
  if (rawPermissions === undefined || rawPermissions === null || rawPermissions === "") {
    return defaultPermissions;
  }

  try {
    const parsed = Array.isArray(rawPermissions) ? rawPermissions : JSON.parse(rawPermissions);
    if (!Array.isArray(parsed)) {
      return defaultPermissions;
    }

    return Array.from(new Set(parsed.filter((permission) => KNOWN_PERMISSIONS.has(permission))));
  } catch (_error) {
    return defaultPermissions;
  }
}

function normalizeAccessControls(role, rawAccessControls) {
  const defaults = ROLE_ACCESS_CONTROL_DEFAULTS[role] || {};

  if (!rawAccessControls) {
    return defaults;
  }

  try {
    const parsed = typeof rawAccessControls === "string" ? JSON.parse(rawAccessControls) : rawAccessControls;
    return { ...defaults, ...parsed };
  } catch (_error) {
    return defaults;
  }
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, "sha512").toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, storedHash) {
  if (!storedHash || !storedHash.includes(":")) {
    return password === storedHash;
  }

  const [salt, originalHash] = storedHash.split(":");
  const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, "sha512").toString("hex");
  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(originalHash));
}

function createSession(user) {
  const token = crypto.randomBytes(32).toString("hex");
  const permissions = normalizePermissions(user.role, user.permissions);
  const accessControls = normalizeAccessControls(user.role, user.access_controls);
  sessions.set(token, {
    token,
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
      fullName: user.full_name,
      permissions,
      accessControls,
    },
    createdAt: Date.now(),
  });
  return token;
}

function getSession(token) {
  return sessions.get(token);
}

function destroySession(token) {
  sessions.delete(token);
}

async function authenticate(username, password) {
  const user = await get(
    `SELECT id, username, password, role, full_name, permissions, access_controls, active
     FROM users
     WHERE username = ?`,
    [username]
  );

  if (!user || !user.active) {
    return null;
  }

  if (!verifyPassword(password, user.password)) {
    return null;
  }

  return user;
}

module.exports = {
  authenticate,
  createSession,
  destroySession,
  getSession,
  hashPassword,
  normalizePermissions,
  normalizeAccessControls,
};
