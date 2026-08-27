const { get, run } = require("../db/helpers");

const SUBSCRIPTION_TIME_ZONE = "Asia/Kolkata";

function getTodayInSubscriptionTimeZone() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SUBSCRIPTION_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function normalizeExpiryDate(value) {
  const date = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;

  const [year, month, day] = date.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) {
    return null;
  }
  return date;
}

function daysBetween(startDate, endDate) {
  const start = Date.parse(`${startDate}T00:00:00Z`);
  const end = Date.parse(`${endDate}T00:00:00Z`);
  return Math.round((end - start) / 86_400_000);
}

function buildSubscriptionStatus(expiresOn) {
  const today = getTodayInSubscriptionTimeZone();
  const normalizedExpiry = normalizeExpiryDate(expiresOn);
  const configured = Boolean(normalizedExpiry);
  const daysRemaining = configured ? daysBetween(today, normalizedExpiry) : null;
  const active = configured && daysRemaining >= 0;

  return {
    configured,
    active,
    expiresOn: normalizedExpiry,
    today,
    daysRemaining: active ? daysRemaining : 0,
    status: active ? (daysRemaining === 0 ? "expires_today" : "active") : "expired",
  };
}

async function getSubscriptionStatus() {
  const settings = await get(
    `SELECT subscription_expires_on, subscription_updated_at
     FROM business_settings
     WHERE id = 1`
  );
  return {
    ...buildSubscriptionStatus(settings?.subscription_expires_on),
    updatedAt: settings?.subscription_updated_at || null,
  };
}

async function updateSubscriptionExpiry(expiresOn, userId) {
  const normalizedExpiry = normalizeExpiryDate(expiresOn);
  const today = getTodayInSubscriptionTimeZone();
  if (!normalizedExpiry || normalizedExpiry < today) {
    const error = new Error("Choose an expiry date of today or later.");
    error.statusCode = 400;
    throw error;
  }

  await run(
    `UPDATE business_settings
     SET subscription_expires_on = ?, subscription_updated_by = ?, subscription_updated_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
     WHERE id = 1`,
    [normalizedExpiry, userId]
  );

  return getSubscriptionStatus();
}

module.exports = {
  getTodayInSubscriptionTimeZone,
  normalizeExpiryDate,
  buildSubscriptionStatus,
  getSubscriptionStatus,
  updateSubscriptionExpiry,
};
