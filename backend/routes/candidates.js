/*
 * routes/candidates.js — Industry Candidate Discovery (Step 14).
 * GET /api/industry/candidates + GET /api/industry/candidates/:id.
 * Thin route layer over services/candidateSearchService.js. Only
 * role "Industry" may use these; the candidate id must refer to a
 * Student user (enforced in the service, not trusted from the URL
 * beyond that lookup).
 */

const candidateSearchService = require("../services/candidateSearchService");

function requireIndustry(ctx) {
  if (!ctx.user) return { status: 401, body: { error: "Not authenticated." } };
  if (ctx.user.role !== "Industry") return { status: 403, body: { error: "Only industry accounts can access this endpoint." } };
  return null;
}

function searchCandidates(req, res, ctx) {
  const authError = requireIndustry(ctx);
  if (authError) return ctx.sendJson(authError.status, authError.body);

  const { skill, proficiency, department, hasProjects, hasAssessment, search } = ctx.query;
  const candidates = candidateSearchService.searchCandidates({ skill, proficiency, department, hasProjects, hasAssessment, search });
  ctx.sendJson(200, { candidates });
}

function getCandidateDetail(req, res, ctx) {
  const authError = requireIndustry(ctx);
  if (authError) return ctx.sendJson(authError.status, authError.body);

  const candidateId = Number(ctx.params.candidateId);
  if (!Number.isInteger(candidateId) || candidateId <= 0) return ctx.sendJson(400, { error: "Invalid candidate id." });

  const candidate = candidateSearchService.getCandidateDetail(candidateId);
  if (!candidate) return ctx.sendJson(404, { error: "Candidate not found." });
  ctx.sendJson(200, { candidate });
}

module.exports = { searchCandidates, getCandidateDetail };
