/*
 * routes/admin.js — Admin / Platform Management (Step 19). Every
 * handler requires ctx.user.role === "Admin"; ctx.user.id is the only
 * source of the acting admin's identity (audit logs, self-suspension
 * guard) — never a client-supplied id.
 */

const adminService = require("../services/adminService");
const { readJsonBody } = require("../utils/body");

const CONTENT_TYPES = ["opportunity", "live-project", "problem-statement"];

function requireAdmin(ctx) {
  if (!ctx.user) return { status: 401, body: { error: "Not authenticated." } };
  if (ctx.user.role !== "Admin") return { status: 403, body: { error: "Only admin accounts can access this endpoint." } };
  return null;
}

function getOverview(req, res, ctx) {
  const authError = requireAdmin(ctx);
  if (authError) return ctx.sendJson(authError.status, authError.body);
  ctx.sendJson(200, adminService.getOverview());
}

function listUsers(req, res, ctx) {
  const authError = requireAdmin(ctx);
  if (authError) return ctx.sendJson(authError.status, authError.body);
  const { role, search, status } = ctx.query;
  ctx.sendJson(200, { users: adminService.listUsers({ role, search, status }) });
}

function getUser(req, res, ctx) {
  const authError = requireAdmin(ctx);
  if (authError) return ctx.sendJson(authError.status, authError.body);
  const id = Number(ctx.params.userId);
  if (!Number.isInteger(id) || id <= 0) return ctx.sendJson(400, { error: "Invalid user id." });
  const user = adminService.getUserDetail(id);
  if (!user) return ctx.sendJson(404, { error: "User not found." });
  ctx.sendJson(200, { user });
}

async function updateUserStatus(req, res, ctx) {
  const authError = requireAdmin(ctx);
  if (authError) return ctx.sendJson(authError.status, authError.body);
  const id = Number(ctx.params.userId);
  if (!Number.isInteger(id) || id <= 0) return ctx.sendJson(400, { error: "Invalid user id." });
  let body;
  try { body = await readJsonBody(req); } catch (err) { return ctx.sendJson(err.statusCode || 400, { error: err.message }); }
  if (!adminService.USER_STATUSES.includes(body.status)) {
    return ctx.sendJson(400, { error: `status must be one of: ${adminService.USER_STATUSES.join(", ")}.` });
  }
  const result = adminService.updateUserStatus(ctx.user.id, id, body.status);
  if (result.error === "not_found") return ctx.sendJson(404, { error: "User not found." });
  if (result.error === "cannot_modify_self") return ctx.sendJson(400, { error: "You cannot change your own account status." });
  ctx.sendJson(200, { user: result.user });
}

function listContent(req, res, ctx) {
  const authError = requireAdmin(ctx);
  if (authError) return ctx.sendJson(authError.status, authError.body);
  const type = ctx.query.type;
  if (!CONTENT_TYPES.includes(type)) return ctx.sendJson(400, { error: `type must be one of: ${CONTENT_TYPES.join(", ")}.` });
  ctx.sendJson(200, { content: adminService.listContent(type) });
}

async function moderateContent(req, res, ctx) {
  const authError = requireAdmin(ctx);
  if (authError) return ctx.sendJson(authError.status, authError.body);
  const type = ctx.params.contentType;
  if (!CONTENT_TYPES.includes(type)) return ctx.sendJson(400, { error: `type must be one of: ${CONTENT_TYPES.join(", ")}.` });
  const id = Number(ctx.params.contentId);
  if (!Number.isInteger(id) || id <= 0) return ctx.sendJson(400, { error: "Invalid content id." });
  let body;
  try { body = await readJsonBody(req); } catch (err) { return ctx.sendJson(err.statusCode || 400, { error: err.message }); }
  const result = adminService.moderateContent(ctx.user.id, type, id, body.status);
  if (result.error === "not_found") return ctx.sendJson(404, { error: "Content not found." });
  if (result.error === "invalid_status") return ctx.sendJson(400, { error: `status must be one of: ${adminService.CONTENT_STATUSES[type].join(", ")}.` });
  ctx.sendJson(200, { ok: true });
}

function getAudit(req, res, ctx) {
  const authError = requireAdmin(ctx);
  if (authError) return ctx.sendJson(authError.status, authError.body);
  ctx.sendJson(200, { audit: adminService.getAuditLog({ limit: ctx.query.limit }) });
}

module.exports = { getOverview, listUsers, getUser, updateUserStatus, listContent, moderateContent, getAudit };
