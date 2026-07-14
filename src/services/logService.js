const { run } = require("../db/helpers");

async function logAction({ userId, action, entityType, entityId, meta }) {
  await run(
    `INSERT INTO logs (user_id, action, entity_type, entity_id, meta, created_at)
     VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    [userId || null, action, entityType, entityId ? String(entityId) : null, meta ? JSON.stringify(meta) : null]
  );
}

module.exports = { logAction };
