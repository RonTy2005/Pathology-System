const crypto = require("crypto");
const { get, run } = require("../db/helpers");
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

    const permissions = new Set(parsed.filter((permission) => KNOWN_PERMISSIONS.has(permission)));
    if (permissions.has(PERMISSIONS.DOWNLOAD_REPORTS) || permissions.has(PERMISSIONS.SHARE_WHATSAPP_PDF)) {
      permissions.add(PERMISSIONS.VIEW_REPORTS);
    }
    return Array.from(permissions);
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

function buildSession(token, user, createdAt = Date.now()) {
  const permissions = normalizePermissions(user.role, user.permissions);
  const accessControls = normalizeAccessControls(user.role, user.access_controls);
  return {
    token,
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
      fullName: user.full_name,
      permissions,
      accessControls,
    },
    createdAt,
  };
}

async function createSession(user) {
  const token = crypto.randomBytes(32).toString("hex");
  const session = buildSession(token, user);
  await run(
    "INSERT INTO user_sessions (token, user_id) VALUES (?, ?)",
    [token, user.id]
  );
  sessions.set(token, session);
  return token;
}

async function getSession(token) {
  const cached = sessions.get(token);
  if (cached) return cached;

  const stored = await get(
    `SELECT s.token, s.created_at, u.id, u.username, u.role, u.full_name, u.permissions, u.access_controls
     FROM user_sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token = ? AND u.active = 1`,
    [token]
  );
  if (!stored) return null;

  const createdAt = Date.parse(stored.created_at || "") || Date.now();
  const session = buildSession(token, stored, createdAt);
  sessions.set(token, session);
  return session;
}

async function destroySession(token) {
  sessions.delete(token);
  await run("DELETE FROM user_sessions WHERE token = ?", [token]);
}

async function invalidateUserSessions(userId) {
  for (const [token, session] of sessions.entries()) {
    if (Number(session.user?.id) === Number(userId)) {
      sessions.delete(token);
    }
  }
  await run("DELETE FROM user_sessions WHERE user_id = ?", [userId]);
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
  invalidateUserSessions,
  getSession,
  hashPassword,
  normalizePermissions,
  normalizeAccessControls,
};
