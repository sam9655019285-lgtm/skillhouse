/*
 * routes/learningRecommendations.js — GET /api/student/learning-recommendations.
 * Thin route layer over services/learningRecommendationService.js.
 * The authenticated student's id always comes from the session
 * (ctx.user.id) — never accepts student_id/student_user_id from the
 * client.
 */

const learningRecommendationService = require("../services/learningRecommendationService");

function requireStudent(ctx) {
  if (!ctx.user) return { status: 401, body: { error: "Not authenticated." } };
  if (ctx.user.role !== "Student") return { status: 403, body: { error: "Only students can access this endpoint." } };
  return null;
}

async function getRecommendations(req, res, ctx) {
  const authError = requireStudent(ctx);
  if (authError) return ctx.sendJson(authError.status, authError.body);

  const opportunityId = ctx.query.opportunityId ? Number(ctx.query.opportunityId) : null;
  if (ctx.query.opportunityId && (!Number.isInteger(opportunityId) || opportunityId <= 0)) {
    return ctx.sendJson(400, { error: "Invalid opportunityId." });
  }

  try {
    const result = await learningRecommendationService.getRecommendations(ctx.user.id, {
      role: ctx.query.role || null,
      opportunityId,
    });
    if (result.opportunityNotFound) return ctx.sendJson(404, { error: "Opportunity not found." });
    ctx.sendJson(200, result);
  } catch (err) {
    ctx.logger.error("GET /api/student/learning-recommendations failed:", err.message);
    ctx.sendJson(500, { error: "Internal error while computing learning recommendations." });
  }
}

module.exports = { getRecommendations };
