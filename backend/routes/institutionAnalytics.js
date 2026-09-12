/*
 * routes/institutionAnalytics.js — GET /api/institution/analytics.
 * Thin route layer over services/institutionAnalyticsService.js.
 * Aggregate-only institution-wide data — the authenticated user's
 * identity (ctx.user.id/role) only ever gates access; it never scopes
 * the query, since this endpoint intentionally reports across every
 * student, not just the requester's own data. No userId/institutionId
 * is ever accepted from the client.
 */

const institutionAnalyticsService = require("../services/institutionAnalyticsService");

function requireInstitution(ctx) {
  if (!ctx.user) return { status: 401, body: { error: "Not authenticated." } };
  if (ctx.user.role !== "Institution") return { status: 403, body: { error: "Only institution accounts can access this endpoint." } };
  return null;
}

async function getAnalytics(req, res, ctx) {
  const authError = requireInstitution(ctx);
  if (authError) return ctx.sendJson(authError.status, authError.body);

  try {
    const result = await institutionAnalyticsService.getInstitutionAnalytics();
    ctx.sendJson(200, result);
  } catch (err) {
    ctx.logger.error("GET /api/institution/analytics failed:", err.message);
    ctx.sendJson(500, { error: "Internal error while computing institution analytics." });
  }
}

module.exports = { getAnalytics };
