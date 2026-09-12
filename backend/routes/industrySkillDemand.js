/*
 * routes/industrySkillDemand.js — GET /api/industry/skill-demand.
 * Thin route layer over services/industryDemandService.js. Aggregate
 * market data, not user-specific data — any authenticated role
 * (Student/Industry/Academician/Institution) may read it, but an
 * anonymous request is rejected (least-privilege: login required,
 * no role restriction beyond that).
 */

const industryDemandService = require("../services/industryDemandService");

async function getSkillDemand(req, res, ctx) {
  if (!ctx.user) return ctx.sendJson(401, { error: "Not authenticated." });

  try {
    const userId = ctx.user.id;
    const forceRefresh = ctx.query.refresh === "true";
    const result = await industryDemandService.getIndustrySkillDemand({ userId, forceRefresh });
    ctx.sendJson(200, result);
  } catch (err) {
    ctx.logger.error("GET /api/industry/skill-demand failed:", err.message);
    ctx.sendJson(500, { error: "Internal error while computing industry skill demand." });
  }
}

module.exports = { getSkillDemand };
