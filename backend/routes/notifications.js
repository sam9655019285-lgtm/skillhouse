/*
 * routes/notifications.js — GET/PUT endpoints for a user's own
 * notifications (Step 18). ctx.user.id always determines identity —
 * never a client-supplied user_id. Any authenticated role may use
 * these (notifications are per-user, not per-role).
 */

const notificationService = require("../services/notificationService");

function requireAuthenticated(ctx) {
  if (!ctx.user) return { status: 401, body: { error: "Not authenticated." } };
  return null;
}

function listNotifications(req, res, ctx) {
  const authError = requireAuthenticated(ctx);
  if (authError) return ctx.sendJson(authError.status, authError.body);
  ctx.sendJson(200, { notifications: notificationService.listForUser(ctx.user.id) });
}

function getUnreadCount(req, res, ctx) {
  const authError = requireAuthenticated(ctx);
  if (authError) return ctx.sendJson(authError.status, authError.body);
  ctx.sendJson(200, { unreadCount: notificationService.getUnreadCount(ctx.user.id) });
}

function getNotification(req, res, ctx) {
  const authError = requireAuthenticated(ctx);
  if (authError) return ctx.sendJson(authError.status, authError.body);
  const id = Number(ctx.params.notificationId);
  if (!Number.isInteger(id) || id <= 0) return ctx.sendJson(400, { error: "Invalid notification id." });
  const notification = notificationService.getOwnNotification(ctx.user.id, id);
  if (!notification) return ctx.sendJson(404, { error: "Notification not found." });
  ctx.sendJson(200, { notification });
}

function markRead(req, res, ctx) {
  const authError = requireAuthenticated(ctx);
  if (authError) return ctx.sendJson(authError.status, authError.body);
  const id = Number(ctx.params.notificationId);
  if (!Number.isInteger(id) || id <= 0) return ctx.sendJson(400, { error: "Invalid notification id." });
  const notification = notificationService.markRead(ctx.user.id, id);
  if (!notification) return ctx.sendJson(404, { error: "Notification not found." });
  ctx.sendJson(200, { notification });
}

function markAllRead(req, res, ctx) {
  const authError = requireAuthenticated(ctx);
  if (authError) return ctx.sendJson(authError.status, authError.body);
  notificationService.markAllRead(ctx.user.id);
  ctx.sendJson(200, { ok: true });
}

module.exports = { listNotifications, getUnreadCount, getNotification, markRead, markAllRead };
