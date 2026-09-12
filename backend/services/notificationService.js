/*
 * services/notificationService.js — centralized notification creation
 * (Step 18). Every existing workflow (applications, live projects,
 * problem statements, mentorship) calls `notify()` here instead of
 * writing its own notification-insert logic — no duplication across
 * routes.
 *
 * EVENT RULE (per your instruction): callers must only invoke
 * `notify()` AFTER their underlying database operation has already
 * succeeded — this module never performs or reverses the triggering
 * operation itself, and a failure inside `notify()` is caught by
 * every caller so it can never corrupt the operation that already
 * committed. See the try/catch wrapping in each route for how this
 * is honored.
 */

const notificationsDb = require("../db/notifications");

const TYPES = [
  "APPLICATION_STATUS", "APPLICATION_RECEIVED",
  "LIVE_PROJECT_STATUS", "LIVE_PROJECT_RECEIVED",
  "PROBLEM_INTEREST", "PROBLEM_PARTICIPANT_STATUS",
  "MENTORSHIP_REQUEST", "MENTORSHIP_STATUS",
  "ACCOUNT_STATUS", "CONTENT_MODERATED", // Step 19: admin moderation events
];

function toClientShape(row) {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    message: row.message,
    entityType: row.entity_type,
    entityId: row.entity_id,
    isRead: !!row.is_read,
    createdAt: row.created_at,
  };
}

// Duplicate-prevention (Step 18 rule 20): skips creating a second,
// identical notification for the same user/type/entity/title — e.g. a
// retried or repeated identical status update. Not over-engineered:
// only guards the exact same event being reported twice, not
// legitimately different events on the same entity (a Shortlist
// notification and a later Accept notification both survive).
function notify(userId, { type, title, message, entityType, entityId }) {
  if (notificationsDb.findExisting(userId, { type, entityType, entityId, title })) return null;
  return toClientShape(notificationsDb.create(userId, { type, title, message, entityType, entityId }));
}

function listForUser(userId) {
  return notificationsDb.listForUser(userId).map(toClientShape);
}

function getUnreadCount(userId) {
  return notificationsDb.countUnread(userId);
}

function getOwnNotification(userId, id) {
  const row = notificationsDb.findById(id);
  if (!row || row.user_id !== userId) return null;
  return toClientShape(row);
}

function markRead(userId, id) {
  const row = notificationsDb.markRead(userId, id);
  return row ? toClientShape(row) : null;
}

function markAllRead(userId) {
  return notificationsDb.markAllRead(userId);
}

module.exports = { TYPES, notify, listForUser, getUnreadCount, getOwnNotification, markRead, markAllRead };
