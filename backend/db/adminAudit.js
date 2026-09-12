/*
 * db/adminAudit.js — SQLite-backed admin audit log (Step 19).
 * Parameterized SQL only; never stores passwords/tokens — `details`
 * is a short human-readable string built by the caller, not raw
 * request/response data.
 */

const { db } = require("./database");

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 50;

function record(adminId, { action, entityType, entityId, details }) {
  db.prepare(
    `INSERT INTO admin_audit_logs (admin_id, action, entity_type, entity_id, details)
     VALUES (?, ?, ?, ?, ?)`
  ).run(adminId, action, entityType ?? null, entityId ?? null, details ?? null);
}

// `limit` is always clamped server-side — never trusts an arbitrary
// client-supplied value beyond MAX_LIMIT.
function list({ limit = DEFAULT_LIMIT } = {}) {
  const safeLimit = Math.min(Math.max(1, Number(limit) || DEFAULT_LIMIT), MAX_LIMIT);
  return db.prepare("SELECT * FROM admin_audit_logs ORDER BY created_at DESC LIMIT ?").all(safeLimit);
}

module.exports = { record, list, MAX_LIMIT };
