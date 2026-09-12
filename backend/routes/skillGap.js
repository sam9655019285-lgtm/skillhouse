/*
 * routes/skillGap.js — GET /api/student/skill-gap. Thin route layer
 * over services/skillGapService.js — the authenticated student's id
 * always comes from the session (ctx.user.id), never from the query
 * string or body, so a student can only ever see their own gap
 * analysis.
 */

const skillGapService = require("../services/skillGapService");

function requireStudent(ctx) {
  if (!ctx.user) return { status: 401, body: { error: "Not authenticated." } };
  if (ctx.user.role !== "Student") return { status: 403, body: { error: "Only students can access this endpoint." } };
  return null;
}

function getSkillGap(req, res, ctx) {
  const authError = requireStudent(ctx);
  if (authError) return ctx.sendJson(authError.status, authError.body);

  const availableRoles = skillGapService.getAvailableRoles();
  const requestedRole = ctx.query.role;
  const targetRole = requestedRole && availableRoles.includes(requestedRole) ? requestedRole : availableRoles[0];

  const result = skillGapService.calculateSkillGap(ctx.user.id, targetRole);
  if (!result) return ctx.sendJson(404, { error: "No requirement data for the requested role." });

  ctx.sendJson(200, { availableRoles, ...result });
}

module.exports = { getSkillGap };
