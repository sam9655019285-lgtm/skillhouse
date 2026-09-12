/*
 * routes/industryProjects.js — Industry Live Projects (Step 16).
 * Thin route layer over services/industryProjectService.js.
 * industry_user_id/student_id always come from the session
 * (ctx.user.id) — never from the client.
 */

const industryProjectService = require("../services/industryProjectService");
const notificationService = require("../services/notificationService");
const { readJsonBody } = require("../utils/body");

const MAX_TITLE_LENGTH = 200;
const MAX_TEXT_LENGTH = 2000;
const MAX_SKILLS = 30;
const MAX_SKILL_LENGTH = 100;
const MAX_COVER_MESSAGE_LENGTH = 2000;

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

function validateCreateFields(body) {
  if (typeof body.title !== "string" || !body.title.trim() || body.title.length > MAX_TITLE_LENGTH) return `Title must be non-empty text of ${MAX_TITLE_LENGTH} characters or fewer.`;
  if (typeof body.description !== "string" || !body.description.trim() || body.description.length > MAX_TEXT_LENGTH) return `Description must be non-empty text of ${MAX_TEXT_LENGTH} characters or fewer.`;
  const skillsError = validateSkillsArray(body.requiredSkills, "requiredSkills");
  if (skillsError) return skillsError;
  if (!Array.isArray(body.requiredSkills) || !body.requiredSkills.length) return "At least one required skill is needed.";
  const preferredError = validateSkillsArray(body.preferredSkills, "preferredSkills");
  if (preferredError) return preferredError;
  if (body.capacity !== undefined && body.capacity !== null && (!Number.isInteger(body.capacity) || body.capacity <= 0)) return "capacity must be a positive integer.";
  if (body.deadline !== undefined && body.deadline !== null && Number.isNaN(new Date(body.deadline).getTime())) return "deadline must be a valid date.";
  return null;
}

function validateUpdateFields(body) {
  if (body.title !== undefined && (typeof body.title !== "string" || !body.title.trim() || body.title.length > MAX_TITLE_LENGTH)) return `Title must be non-empty text of ${MAX_TITLE_LENGTH} characters or fewer.`;
  if (body.description !== undefined && (typeof body.description !== "string" || !body.description.trim() || body.description.length > MAX_TEXT_LENGTH)) return `Description must be non-empty text of ${MAX_TEXT_LENGTH} characters or fewer.`;
  if (body.status !== undefined && !industryProjectService.PROJECT_STATUSES.includes(body.status)) return `status must be one of: ${industryProjectService.PROJECT_STATUSES.join(", ")}.`;
  const skillsError = validateSkillsArray(body.requiredSkills, "requiredSkills") || validateSkillsArray(body.preferredSkills, "preferredSkills");
  if (skillsError) return skillsError;
  if (body.capacity !== undefined && body.capacity !== null && (!Number.isInteger(body.capacity) || body.capacity <= 0)) return "capacity must be a positive integer.";
  if (body.deadline !== undefined && body.deadline !== null && Number.isNaN(new Date(body.deadline).getTime())) return "deadline must be a valid date.";
  return null;
}

function listProjects(req, res, ctx) {
  const authError = requireAuthenticated(ctx);
  if (authError) return ctx.sendJson(authError.status, authError.body);
  ctx.sendJson(200, { projects: industryProjectService.listProjects() });
}

function getProject(req, res, ctx) {
  const authError = requireAuthenticated(ctx);
  if (authError) return ctx.sendJson(authError.status, authError.body);
  const id = Number(ctx.params.projectId);
  if (!Number.isInteger(id) || id <= 0) return ctx.sendJson(400, { error: "Invalid project id." });
  const project = industryProjectService.getProject(id);
  if (!project) return ctx.sendJson(404, { error: "Project not found." });
  ctx.sendJson(200, { project });
}

async function createProject(req, res, ctx) {
  const authError = requireRole(ctx, "Industry");
  if (authError) return ctx.sendJson(authError.status, authError.body);
  let body;
  try { body = await readJsonBody(req); } catch (err) { return ctx.sendJson(err.statusCode || 400, { error: err.message }); }
  const err = validateCreateFields(body);
  if (err) return ctx.sendJson(400, { error: err });
  const project = industryProjectService.createProject(ctx.user.id, {
    title: body.title, description: body.description, requiredSkills: body.requiredSkills,
    preferredSkills: body.preferredSkills ?? [], domain: body.domain ?? null, mode: body.mode ?? null,
    duration: body.duration ?? null, company: body.company ?? ctx.user.name,
    capacity: body.capacity ?? null, deadline: body.deadline ?? null,
  });
  ctx.sendJson(201, { project });
}

async function updateProject(req, res, ctx) {
  const authError = requireRole(ctx, "Industry");
  if (authError) return ctx.sendJson(authError.status, authError.body);
  const id = Number(ctx.params.projectId);
  if (!Number.isInteger(id) || id <= 0) return ctx.sendJson(400, { error: "Invalid project id." });
  let body;
  try { body = await readJsonBody(req); } catch (err) { return ctx.sendJson(err.statusCode || 400, { error: err.message }); }
  const err = validateUpdateFields(body);
  if (err) return ctx.sendJson(400, { error: err });
  const project = industryProjectService.updateProject(ctx.user.id, id, body);
  if (!project) return ctx.sendJson(404, { error: "Project not found." });
  ctx.sendJson(200, { project });
}

function deleteProject(req, res, ctx) {
  const authError = requireRole(ctx, "Industry");
  if (authError) return ctx.sendJson(authError.status, authError.body);
  const id = Number(ctx.params.projectId);
  if (!Number.isInteger(id) || id <= 0) return ctx.sendJson(400, { error: "Invalid project id." });
  const result = industryProjectService.deleteProject(ctx.user.id, id);
  if (result.error) return ctx.sendJson(404, { error: "Project not found." });
  ctx.sendJson(200, { ok: true });
}

async function applyToProject(req, res, ctx) {
  const authError = requireRole(ctx, "Student");
  if (authError) return ctx.sendJson(authError.status, authError.body);
  const id = Number(ctx.params.projectId);
  if (!Number.isInteger(id) || id <= 0) return ctx.sendJson(400, { error: "Invalid project id." });

  let body = {};
  try { body = await readJsonBody(req); } catch (err) { return ctx.sendJson(err.statusCode || 400, { error: err.message }); }
  const coverMessage = body.coverMessage;
  if (coverMessage !== undefined && coverMessage !== null && (typeof coverMessage !== "string" || coverMessage.length > MAX_COVER_MESSAGE_LENGTH)) {
    return ctx.sendJson(400, { error: `coverMessage must be text of ${MAX_COVER_MESSAGE_LENGTH} characters or fewer.` });
  }

  const result = industryProjectService.applyToProject(ctx.user.id, id, coverMessage ?? null);
  if (result.error === "not_found") return ctx.sendJson(404, { error: "Project not found." });
  if (result.error === "not_open") return ctx.sendJson(400, { error: "This project is not accepting applications." });
  if (result.error === "deadline_passed") return ctx.sendJson(400, { error: "The application deadline for this project has passed." });
  if (result.error === "capacity_full") return ctx.sendJson(400, { error: "This project has reached its applicant capacity." });
  if (result.error === "duplicate") return ctx.sendJson(409, { error: "You have already applied to this project." });

  try {
    const project = industryProjectService.getProject(id);
    if (project) {
      notificationService.notify(project.industryUserId, {
        type: "LIVE_PROJECT_RECEIVED", title: "New Live Project Application",
        message: `A student applied to "${project.title}".`,
        entityType: "industry_project", entityId: id,
      });
    }
  } catch { /* notification failure must never affect the application response */ }

  ctx.sendJson(201, { application: { id: result.application.id, opportunityId: result.application.opportunity_id, status: result.application.status } });
}

function listApplicants(req, res, ctx) {
  const authError = requireRole(ctx, "Industry");
  if (authError) return ctx.sendJson(authError.status, authError.body);
  const id = Number(ctx.params.projectId);
  if (!Number.isInteger(id) || id <= 0) return ctx.sendJson(400, { error: "Invalid project id." });
  const applicants = industryProjectService.listApplicants(ctx.user.id, id);
  if (!applicants) return ctx.sendJson(404, { error: "Project not found." });
  ctx.sendJson(200, { applicants });
}

async function updateApplicantStatus(req, res, ctx) {
  const authError = requireRole(ctx, "Industry");
  if (authError) return ctx.sendJson(authError.status, authError.body);
  const projectId = Number(ctx.params.projectId);
  const applicationId = Number(ctx.params.applicationId);
  if (!Number.isInteger(projectId) || projectId <= 0 || !Number.isInteger(applicationId) || applicationId <= 0) {
    return ctx.sendJson(400, { error: "Invalid project or application id." });
  }
  let body;
  try { body = await readJsonBody(req); } catch (err) { return ctx.sendJson(err.statusCode || 400, { error: err.message }); }
  if (!industryProjectService.APPLICATION_STATUSES.includes(body.status)) {
    return ctx.sendJson(400, { error: `status must be one of: ${industryProjectService.APPLICATION_STATUSES.join(", ")}.` });
  }
  const result = industryProjectService.updateApplicantStatus(ctx.user.id, projectId, applicationId, body.status);
  if (result.error === "not_found") return ctx.sendJson(404, { error: "Project or application not found." });

  try {
    const project = industryProjectService.getProject(projectId);
    if (project) {
      notificationService.notify(result.application.student_user_id, {
        type: "LIVE_PROJECT_STATUS", title: `Your live project application was ${body.status.toLowerCase()}`,
        message: `Your application to "${project.title}" is now ${body.status}.`,
        entityType: "industry_project", entityId: projectId,
      });
    }
  } catch { /* notification failure must never affect the status-update response */ }

  ctx.sendJson(200, { application: { id: result.application.id, opportunityId: result.application.opportunity_id, status: result.application.status } });
}

module.exports = { listProjects, getProject, createProject, updateProject, deleteProject, applyToProject, listApplicants, updateApplicantStatus };
