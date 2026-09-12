/*
 * db/notifications.js — SQLite-backed notifications (Step 18). All
 * statements are parameterized; ownership is enforced by every
 * per-user function requiring the owning user's id.
 */

const { db } = require("./database");

function create(userId, { type, title, message, entityType, entityId }) {
  const result = db.prepare(
    `INSERT INTO notifications (user_id, type, title, message, entity_type, entity_id)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(userId, type, title, message ?? null, entityType ?? null, entityId ?? null);
  return findById(Number(result.lastInsertRowid));
}

function findById(id) {
  return db.prepare("SELECT * FROM notifications WHERE id = ?").get(id);
}

function listForUser(userId, { limit = 50 } = {}) {
  return db.prepare("SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT ?").all(userId, limit);
}

function countUnread(userId) {
  return db.prepare("SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND is_read = 0").get(userId).c;
}

// Only marks read if owned by this user; returns null otherwise.
function markRead(userId, id) {
  const existing = findById(id);
  if (!existing || existing.user_id !== userId) return null;
  db.prepare("UPDATE notifications SET is_read = 1 WHERE id = ?").run(id);
  return findById(id);
}

function markAllRead(userId) {
  db.prepare("UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0").run(userId);
  return { ok: true };
}

// Idempotency guard for Step 18's duplicate-prevention rule: is there
// already a notification for this exact event (same user/type/entity/
// title)? Used so a retried or repeated identical status update never
// produces a second, redundant notification.
function findExisting(userId, { type, entityType, entityId, title }) {
  return db.prepare(
    `SELECT * FROM notifications
     WHERE user_id = ? AND type = ? AND entity_type = ? AND entity_id = ? AND title = ?
     LIMIT 1`
  ).get(userId, type, entityType ?? null, entityId ?? null, title);
}

module.exports = { create, findById, listForUser, countUnread, markRead, markAllRead, findExisting };
