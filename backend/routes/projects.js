/*
 * routes/projects.js — student project endpoints, backed by
 * backend/db/projects.js (SQLite `student_projects` table). Only the
 * authenticated student can ever read/create/update/delete their own
 * projects — user_id always comes from the session, never from the
 * request body or URL (see js/app-student.js renderPortfolioTab for
 * the frontend side).
 */

const projects = require("../db/projects");
const { readJsonBody } = require("../utils/body");

const MAX_TITLE_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 2000;
const MAX_TECHNOLOGIES_LENGTH = 500;
const MAX_URL_LENGTH = 500;

function requireStudent(ctx) {
  if (!ctx.user) return { status: 401, body: { error: "Not authenticated." } };
  if (ctx.user.role !== "Student") return { status: 403, body: { error: "Only students can access this endpoint." } };
  return null;
}

function toClientShape(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    technologies: row.technologies,
    projectUrl: row.project_url,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Returns an error message string, or null if the fields are valid.
// `partial` allows PUT to omit fields it isn't changing.
function validateFields({ title, description, technologies, projectUrl }, { partial } = {}) {
  if (!partial || title !== undefined) {
    if (typeof title !== "string" || !title.trim()) return "Project title is required.";
    if (title.length > MAX_TITLE_LENGTH) return `Project title must be ${MAX_TITLE_LENGTH} characters or fewer.`;
  }
  if (description !== undefined && description !== null) {
    if (typeof description !== "string" || description.length > MAX_DESCRIPTION_LENGTH) return `Project description must be ${MAX_DESCRIPTION_LENGTH} characters or fewer.`;
  }
  if (technologies !== undefined && technologies !== null) {
    if (typeof technologies !== "string" || technologies.length > MAX_TECHNOLOGIES_LENGTH) return `Technologies must be ${MAX_TECHNOLOGIES_LENGTH} characters or fewer.`;
  }
  if (projectUrl !== undefined && projectUrl !== null) {
    if (typeof projectUrl !== "string" || projectUrl.length > MAX_URL_LENGTH) return `Project link must be ${MAX_URL_LENGTH} characters or fewer.`;
  }
  return null;
}

function listProjects(req, res, ctx) {
  const authError = requireStudent(ctx);
  if (authError) return ctx.sendJson(authError.status, authError.body);
  const rows = projects.listByUserId(ctx.user.id);
  ctx.sendJson(200, { projects: rows.map(toClientShape) });
}

async function createProject(req, res, ctx) {
  const authError = requireStudent(ctx);
  if (authError) return ctx.sendJson(authError.status, authError.body);

  let body;
  try {
    body = await readJsonBody(req);
  } catch (err) {
    return ctx.sendJson(err.statusCode || 400, { error: err.message });
  }

  const err = validateFields(body);
  if (err) return ctx.sendJson(400, { error: err });

  const { title, description, technologies, projectUrl } = body;
  const created = projects.create(ctx.user.id, {
    title,
    description: description ?? null,
    technologies: technologies ?? null,
    projectUrl: projectUrl ?? null,
  });
  ctx.sendJson(201, { project: toClientShape(created) });
}

async function updateProject(req, res, ctx) {
  const authError = requireStudent(ctx);
  if (authError) return ctx.sendJson(authError.status, authError.body);

  const projectId = Number(ctx.params.projectId);
  if (!Number.isInteger(projectId) || projectId <= 0) return ctx.sendJson(400, { error: "Invalid project id." });

  let body;
  try {
    body = await readJsonBody(req);
  } catch (err) {
    return ctx.sendJson(err.statusCode || 400, { error: err.message });
  }

  const err = validateFields(body, { partial: true });
  if (err) return ctx.sendJson(400, { error: err });

  const { title, description, technologies, projectUrl } = body;
  const updated = projects.update(ctx.user.id, projectId, { title, description, technologies, projectUrl });
  if (!updated) return ctx.sendJson(404, { error: "Project not found." });
  ctx.sendJson(200, { project: toClientShape(updated) });
}

function deleteProject(req, res, ctx) {
  const authError = requireStudent(ctx);
  if (authError) return ctx.sendJson(authError.status, authError.body);

  const projectId = Number(ctx.params.projectId);
  if (!Number.isInteger(projectId) || projectId <= 0) return ctx.sendJson(400, { error: "Invalid project id." });

  const result = projects.remove(ctx.user.id, projectId);
  if (!result || result.changes === 0) return ctx.sendJson(404, { error: "Project not found." });
  ctx.sendJson(200, { ok: true });
}

module.exports = { listProjects, createProject, updateProject, deleteProject };
