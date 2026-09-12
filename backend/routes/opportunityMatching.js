/*
 * routes/opportunityMatching.js — GET /api/student/opportunities/:id/match
 * and GET /api/student/opportunities/matches. Thin route layer over
 * services/opportunityMatchingService.js — the authenticated
 * student's id always comes from the session (ctx.user.id), never
 * from a query/body parameter, so a student can only ever compute
 * their own match.
 */

const opportunities = require("../db/opportunities");
const skillGapService = require("../services/skillGapService");
const matchingService = require("../services/opportunityMatchingService");

function requireStudent(ctx) {
  if (!ctx.user) return { status: 401, body: { error: "Not authenticated." } };
  if (ctx.user.role !== "Student") return { status: 403, body: { error: "Only students can access this endpoint." } };
  return null;
}

function parseSkillsField(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function toMatchableOpportunity(row) {
  return {
    id: row.id,
    domain: row.domain || null,
    requiredSkills: parseSkillsField(row.required_skills),
    preferredSkills: parseSkillsField(row.preferred_skills),
  };
}

function resolveTargetRole(ctx) {
  const availableRoles = skillGapService.getAvailableRoles();
  const requested = ctx.query.role;
  return requested && availableRoles.includes(requested) ? requested : null;
}

function getMatch(req, res, ctx) {
  const authError = requireStudent(ctx);
  if (authError) return ctx.sendJson(authError.status, authError.body);

  const opportunityId = Number(ctx.params.opportunityId);
  if (!Number.isInteger(opportunityId) || opportunityId <= 0) return ctx.sendJson(400, { error: "Invalid opportunity id." });

  const row = opportunities.findById(opportunityId);
  if (!row) return ctx.sendJson(404, { error: "Opportunity not found." });

  const targetRole = resolveTargetRole(ctx);
  const result = matchingService.calculateMatch(ctx.user.id, toMatchableOpportunity(row), targetRole);
  ctx.sendJson(200, result);
}

// Optional ranked-list endpoint — reuses the same GET /api/opportunities
// data source (backend/db/opportunities.js listAll()), no second catalog.
function getRankedMatches(req, res, ctx) {
  const authError = requireStudent(ctx);
  if (authError) return ctx.sendJson(authError.status, authError.body);

  const targetRole = resolveTargetRole(ctx);
  const rows = opportunities.listAll({ status: "Active" }).map(toMatchableOpportunity);
  const results = matchingService.calculateMatches(ctx.user.id, rows, targetRole);
  ctx.sendJson(200, { matches: results });
}

module.exports = { getMatch, getRankedMatches };
