/*
 * routes/academicianAnalytics.js — GET /api/academician/analytics.
 * Thin route layer over services/academicianAnalyticsService.js.
 * Aggregate-only academic-wide data — ctx.user.role only gates access;
 * it never scopes the query (this endpoint intentionally reports
 * across every student, not just the requester's own data). No
 * userId is ever accepted from the client to bypass this.
 */

const academicianAnalyticsService = require("../services/academicianAnalyticsService");

function requireAcademician(ctx) {
  if (!ctx.user) return { status: 401, body: { error: "Not authenticated." } };
  if (ctx.user.role !== "Academician") return { status: 403, body: { error: "Only academician accounts can access this endpoint." } };
  return null;
}

async function getAnalytics(req, res, ctx) {
  const authError = requireAcademician(ctx);
  if (authError) return ctx.sendJson(authError.status, authError.body);

  const department = ctx.query.department || null;

  try {
    const result = await academicianAnalyticsService.getAcademicianAnalytics({ department });
    ctx.sendJson(200, result);
  } catch (err) {
    ctx.logger.error("GET /api/academician/analytics failed:", err.message);
    ctx.sendJson(500, { error: "Internal error while computing academician analytics." });
  }
}

module.exports = { getAnalytics };
