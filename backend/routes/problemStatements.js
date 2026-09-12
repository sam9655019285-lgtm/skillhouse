/*
 * routes/problemStatements.js — Industry Problem Statements &
 * Collaboration (Step 17). industry_id/student_id always come from
 * the authenticated session (ctx.user.id) — never from the client.
 */

const problemStatementService = require("../services/problemStatementService");
const notificationService = require("../services/notificationService");
const { readJsonBody } = require("../utils/body");

const MAX_TITLE_LENGTH = 200;
const MAX_TEXT_LENGTH = 3000;
const MAX_SHORT_FIELD_LENGTH = 200;
const MAX_SKILLS = 30;
const MAX_SKILL_LENGTH = 100;
const MAX_MESSAGE_LENGTH = 2000;

function requireAuthenticated(ctx) {
  if (!ctx.user) return { status: 401, body: { error: "Not authenticated." } };
  return null;
}
function requireRole(ctx, role) {
  const authError = requireAuthenticated(ctx);
  if (authError) return authError;
  if (ctx.user.role !== role) return { status: 403, body: { error: `Only ${role.toLowerCase()} accounts can do this.` } };
  return null;
}

function validateSkillsArray(value, fieldName) {
  if (value === undefined) return null;
  if (!Array.isArray(value)) return `${fieldName} must be an array of strings.`;
  if (value.length > MAX_SKILLS) return `${fieldName} must have ${MAX_SKILLS} entries or fewer.`;
  for (const s of value) {
    if (typeof s !== "string" || !s.trim() || s.length > MAX_SKILL_LENGTH) return `${fieldName} entries must be non-empty text of ${MAX_SKILL_LENGTH} characters or fewer.`;
  }
  return null;
}
function validateShortField(value, fieldName, maxLength = MAX_SHORT_FIELD_LENGTH) {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" || value.length > maxLength) return `${fieldName} must be text of ${maxLength} characters or fewer.`;
  return null;
}

function validateCreateFields(body) {
  if (typeof body.title !== "string" || !body.title.trim() || body.title.length > MAX_TITLE_LENGTH) return `Title must be non-empty text of ${MAX_TITLE_LENGTH} characters or fewer.`;
  if (typeof body.description !== "string" || !body.description.trim() || body.description.length > MAX_TEXT_LENGTH) return `Description must be non-empty text of ${MAX_TEXT_LENGTH} characters or fewer.`;
  const skillsError = validateSkillsArray(body.requiredSkills, "requiredSkills");
  if (skillsError) return skillsError;
  if (!Array.isArray(body.requiredSkills) || !body.requiredSkills.length) return "At least one required skill is needed.";
  if (body.teamSize !== undefined && body.teamSize !== null && (!Number.isInteger(body.teamSize) || body.teamSize <= 0)) return "teamSize must be a positive integer.";
  if (body.deadline !== undefined && body.deadline !== null && Number.isNaN(new Date(body.deadline).getTime())) return "deadline must be a valid date.";
  return (
    validateSkillsArray(body.preferredSkills, "preferredSkills") ||
    validateShortField(body.problemCategory, "problemCategory") ||
    validateShortField(body.domain, "domain") ||
    validateShortField(body.mode, "mode") ||
    validateShortField(body.duration, "duration") ||
    validateShortField(body.industryContext, "industryContext", MAX_TEXT_LENGTH) ||
    validateShortField(body.expectedOutcome, "expectedOutcome", MAX_TEXT_LENGTH) ||
    null
  );
}

function validateUpdateFields(body) {
  if (body.title !== undefined && (typeof body.title !== "string" || !body.title.trim() || body.title.length > MAX_TITLE_LENGTH)) return `Title must be non-empty text of ${MAX_TITLE_LENGTH} characters or fewer.`;
  if (body.description !== undefined && (typeof body.description !== "string" || !body.description.trim() || body.description.length > MAX_TEXT_LENGTH)) return `Description must be non-empty text of ${MAX_TEXT_LENGTH} characters or fewer.`;
  if (body.status !== undefined && !problemStatementService.STATUSES.includes(body.status)) return `status must be one of: ${problemStatementService.STATUSES.join(", ")}.`;
  if (body.teamSize !== undefined && body.teamSize !== null && (!Number.isInteger(body.teamSize) || body.teamSize <= 0)) return "teamSize must be a positive integer.";
  if (body.deadline !== undefined && body.deadline !== null && Number.isNaN(new Date(body.deadline).getTime())) return "deadline must be a valid date.";
  return validateSkillsArray(body.requiredSkills, "requiredSkills") || validateSkillsArray(body.preferredSkills, "preferredSkills") || null;
}

function listProblems(req, res, ctx) {
  const authError = requireAuthenticated(ctx);
  if (authError) return ctx.sendJson(authError.status, authError.body);
  ctx.sendJson(200, { problemStatements: problemStatementService.listProblems() });
}

function getProblem(req, res, ctx) {
  const authError = requireAuthenticated(ctx);
  if (authError) return ctx.sendJson(authError.status, authError.body);
  const id = Number(ctx.params.problemId);
  if (!Number.isInteger(id) || id <= 0) return ctx.sendJson(400, { error: "Invalid problem statement id." });
  const problem = problemStatementService.getProblem(id);
  if (!problem) return ctx.sendJson(404, { error: "Problem statement not found." });
  ctx.sendJson(200, { problemStatement: problem });
}

async function createProblem(req, res, ctx) {
  const authError = requireRole(ctx, "Industry");
  if (authError) return ctx.sendJson(authError.status, authError.body);
  let body;
  try { body = await readJsonBody(req); } catch (err) { return ctx.sendJson(err.statusCode || 400, { error: err.message }); }
  const err = validateCreateFields(body);
  if (err) return ctx.sendJson(400, { error: err });
  const problem = problemStatementService.createProblem(ctx.user.id, body);
  ctx.sendJson(201, { problemStatement: problem });
}

async function updateProblem(req, res, ctx) {
  const authError = requireRole(ctx, "Industry");
  if (authError) return ctx.sendJson(authError.status, authError.body);
  const id = Number(ctx.params.problemId);
  if (!Number.isInteger(id) || id <= 0) return ctx.sendJson(400, { error: "Invalid problem statement id." });
  let body;
  try { body = await readJsonBody(req); } catch (err) { return ctx.sendJson(err.statusCode || 400, { error: err.message }); }
  const err = validateUpdateFields(body);
  if (err) return ctx.sendJson(400, { error: err });
  const problem = problemStatementService.updateProblem(ctx.user.id, id, body);
  if (!problem) return ctx.sendJson(404, { error: "Problem statement not found." });
  ctx.sendJson(200, { problemStatement: problem });
}

function deleteProblem(req, res, ctx) {
  const authError = requireRole(ctx, "Industry");
  if (authError) return ctx.sendJson(authError.status, authError.body);
  const id = Number(ctx.params.problemId);
  if (!Number.isInteger(id) || id <= 0) return ctx.sendJson(400, { error: "Invalid problem statement id." });
  const ok = problemStatementService.deleteProblem(ctx.user.id, id);
  if (!ok) return ctx.sendJson(404, { error: "Problem statement not found." });
  ctx.sendJson(200, { ok: true });
}

async function expressInterest(req, res, ctx) {
  const authError = requireRole(ctx, "Student");
  if (authError) return ctx.sendJson(authError.status, authError.body);
  const id = Number(ctx.params.problemId);
  if (!Number.isInteger(id) || id <= 0) return ctx.sendJson(400, { error: "Invalid problem statement id." });
  let body = {};
  try { body = await readJsonBody(req); } catch (err) { return ctx.sendJson(err.statusCode || 400, { error: err.message }); }
  const message = body.message;
  if (message !== undefined && message !== null && (typeof message !== "string" || message.length > MAX_MESSAGE_LENGTH)) {
    return ctx.sendJson(400, { error: `message must be text of ${MAX_MESSAGE_LENGTH} characters or fewer.` });
  }
  const result = problemStatementService.expressInterest(ctx.user.id, id, message ?? null);
  if (result.error === "not_found") return ctx.sendJson(404, { error: "Problem statement not found." });
  if (result.error === "not_open") return ctx.sendJson(400, { error: "This problem statement is not open for interest." });
  if (result.error === "deadline_passed") return ctx.sendJson(400, { error: "The deadline for this problem statement has passed." });
  if (result.error === "duplicate") return ctx.sendJson(409, { error: "You have already expressed interest in this problem statement." });

  try {
    const problem = problemStatementService.getProblem(id);
    if (problem) {
      notificationService.notify(problem.industryId, {
        type: "PROBLEM_INTEREST", title: "New Interest in Your Problem Statement",
        message: `A student expressed interest in "${problem.title}".`,
        entityType: "problem_statement", entityId: id,
      });
    }
  } catch { /* notification failure must never affect the interest response */ }

  ctx.sendJson(201, { participant: { id: result.participant.id, problemStatementId: result.participant.problem_statement_id, status: result.participant.status } });
}

function getStudentParticipation(req, res, ctx) {
  const authError = requireRole(ctx, "Student");
  if (authError) return ctx.sendJson(authError.status, authError.body);
  ctx.sendJson(200, { participation: problemStatementService.getStudentParticipation(ctx.user.id) });
}

function listParticipants(req, res, ctx) {
  const authError = requireRole(ctx, "Industry");
  if (authError) return ctx.sendJson(authError.status, authError.body);
  const id = Number(ctx.params.problemId);
  if (!Number.isInteger(id) || id <= 0) return ctx.sendJson(400, { error: "Invalid problem statement id." });
  const participants = problemStatementService.listParticipants(ctx.user.id, id);
  if (!participants) return ctx.sendJson(404, { error: "Problem statement not found." });
  ctx.sendJson(200, { participants });
}

async function updateParticipantStatus(req, res, ctx) {
  const authError = requireRole(ctx, "Industry");
  if (authError) return ctx.sendJson(authError.status, authError.body);
  const problemId = Number(ctx.params.problemId);
  const participantId = Number(ctx.params.participantId);
  if (!Number.isInteger(problemId) || problemId <= 0 || !Number.isInteger(participantId) || participantId <= 0) {
    return ctx.sendJson(400, { error: "Invalid problem statement or participant id." });
  }
  let body;
  try { body = await readJsonBody(req); } catch (err) { return ctx.sendJson(err.statusCode || 400, { error: err.message }); }
  if (!problemStatementService.PARTICIPANT_STATUSES.includes(body.status)) {
    return ctx.sendJson(400, { error: `status must be one of: ${problemStatementService.PARTICIPANT_STATUSES.join(", ")}.` });
  }
  const result = problemStatementService.updateParticipantStatus(ctx.user.id, problemId, participantId, body.status);
  if (result.error === "not_found") return ctx.sendJson(404, { error: "Problem statement or participant not found." });
  if (result.error === "invalid_transition") return ctx.sendJson(400, { error: `Cannot transition to ${body.status} from the participant's current status. Allowed: ${result.allowed.join(", ") || "none (terminal state)"}.` });

  try {
    const problem = problemStatementService.getProblem(problemId);
    if (problem) {
      notificationService.notify(result.participant.student_id, {
        type: "PROBLEM_PARTICIPANT_STATUS", title: `Your participation was ${body.status.toLowerCase()}`,
        message: `Your participation in "${problem.title}" is now ${body.status}.`,
        entityType: "problem_statement", entityId: problemId,
      });
    }
  } catch { /* notification failure must never affect the status-update response */ }

  ctx.sendJson(200, { participant: { id: result.participant.id, status: result.participant.status } });
}

module.exports = {
  listProblems, getProblem, createProblem, updateProblem, deleteProblem,
  expressInterest, getStudentParticipation, listParticipants, updateParticipantStatus,
};
