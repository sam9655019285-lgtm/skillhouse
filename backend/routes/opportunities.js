/*
 * routes/opportunities.js — real Opportunities CRUD, backed by
 * backend/db/opportunities.js. Any authenticated role may browse
 * (least-privilege: login required, no role restriction beyond that,
 * matching Step 8's industry/skill-demand endpoint); only role
 * "Industry" may create/edit/delete, and only their own rows —
 * industry_user_id always comes from the session, never the request.
 */

const opportunities = require("../db/opportunities");
const { readJsonBody } = require("../utils/body");

const MAX_TITLE_LENGTH = 200;
const MAX_TEXT_LENGTH = 2000;
const MAX_SHORT_FIELD_LENGTH = 200;
const MAX_SKILLS = 30;
const MAX_SKILL_LENGTH = 100;
const VALID_STATUSES = ["Active", "Closed"];

function requireAuthenticated(ctx) {
  if (!ctx.user) return { status: 401, body: { error: "Not authenticated." } };
  return null;
}

function requireIndustry(ctx) {
  const authError = requireAuthenticated(ctx);
  if (authError) return authError;
  if (ctx.user.role !== "Industry") return { status: 403, body: { error: "Only industry accounts can do this." } };
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

function toClientShape(row) {
  return {
    id: row.id,
    industryUserId: row.industry_user_id,
    title: row.title,
    description: row.description,
    type: row.opportunity_type,
    company: row.company,
    domain: row.domain,
    location: row.location,
    mode: row.mode,
    duration: row.duration,
    experience: row.experience,
    stipend: row.stipend,
    skills: parseSkillsField(row.required_skills),
    preferredSkills: parseSkillsField(row.preferred_skills),
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
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
  if (typeof body.title !== "string" || !body.title.trim()) return "Title cannot be empty.";
  if (body.title.length > MAX_TITLE_LENGTH) return `Title must be ${MAX_TITLE_LENGTH} characters or fewer.`;
  if (typeof body.description !== "string" || !body.description.trim()) return "Description cannot be empty.";
  if (body.description.length > MAX_TEXT_LENGTH) return `Description must be ${MAX_TEXT_LENGTH} characters or fewer.`;
  const skillsError = validateSkillsArray(body.skills, "skills");
  if (skillsError) return skillsError;
  if (!Array.isArray(body.skills) || !body.skills.length) return "At least one required skill is needed.";
  return (
    validateSkillsArray(body.preferredSkills, "preferredSkills") ||
    validateShortField(body.type, "type") ||
    validateShortField(body.company, "company") ||
    validateShortField(body.domain, "domain") ||
    validateShortField(body.location, "location") ||
    validateShortField(body.mode, "mode") ||
    validateShortField(body.duration, "duration") ||
    validateShortField(body.experience, "experience") ||
    validateShortField(body.stipend, "stipend") ||
    null
  );
}

function validateUpdateFields(body) {
  if (body.title !== undefined && (typeof body.title !== "string" || !body.title.trim() || body.title.length > MAX_TITLE_LENGTH)) {
    return `Title must be non-empty text of ${MAX_TITLE_LENGTH} characters or fewer.`;
  }
  if (body.description !== undefined && (typeof body.description !== "string" || !body.description.trim() || body.description.length > MAX_TEXT_LENGTH)) {
    return `Description must be non-empty text of ${MAX_TEXT_LENGTH} characters or fewer.`;
  }
  if (body.status !== undefined && !VALID_STATUSES.includes(body.status)) {
    return `status must be one of: ${VALID_STATUSES.join(", ")}.`;
  }
  return (
    validateSkillsArray(body.skills, "skills") ||
    validateSkillsArray(body.preferredSkills, "preferredSkills") ||
    validateShortField(body.type, "type") ||
    validateShortField(body.company, "company") ||
    validateShortField(body.domain, "domain") ||
    validateShortField(body.location, "location") ||
    validateShortField(body.mode, "mode") ||
    validateShortField(body.duration, "duration") ||
    validateShortField(body.experience, "experience") ||
    validateShortField(body.stipend, "stipend") ||
    null
  );
}

function listOpportunities(req, res, ctx) {
  const authError = requireAuthenticated(ctx);
  if (authError) return ctx.sendJson(authError.status, authError.body);
  const rows = opportunities.listAll();
  ctx.sendJson(200, { opportunities: rows.map(toClientShape) });
}

function getOpportunity(req, res, ctx) {
  const authError = requireAuthenticated(ctx);
  if (authError) return ctx.sendJson(authError.status, authError.body);
  const id = Number(ctx.params.opportunityId);
  if (!Number.isInteger(id) || id <= 0) return ctx.sendJson(400, { error: "Invalid opportunity id." });
  const row = opportunities.findById(id);
  if (!row) return ctx.sendJson(404, { error: "Opportunity not found." });
  ctx.sendJson(200, { opportunity: toClientShape(row) });
}

async function createOpportunity(req, res, ctx) {
  const authError = requireIndustry(ctx);
  if (authError) return ctx.sendJson(authError.status, authError.body);

  let body;
  try {
    body = await readJsonBody(req);
  } catch (err) {
    return ctx.sendJson(err.statusCode || 400, { error: err.message });
  }

  const err = validateCreateFields(body);
  if (err) return ctx.sendJson(400, { error: err });

  const created = opportunities.create(ctx.user.id, {
    title: body.title, description: body.description, opportunityType: body.type ?? null,
    requiredSkills: body.skills, location: body.location ?? null, duration: body.duration ?? null,
    stipend: body.stipend ?? null, domain: body.domain ?? null, mode: body.mode ?? null,
    experience: body.experience ?? null, preferredSkills: body.preferredSkills ?? [],
    company: body.company ?? ctx.user.name,
  });
  ctx.sendJson(201, { opportunity: toClientShape(created) });
}

async function updateOpportunity(req, res, ctx) {
  const authError = requireIndustry(ctx);
  if (authError) return ctx.sendJson(authError.status, authError.body);

  const id = Number(ctx.params.opportunityId);
  if (!Number.isInteger(id) || id <= 0) return ctx.sendJson(400, { error: "Invalid opportunity id." });

  let body;
  try {
    body = await readJsonBody(req);
  } catch (err) {
    return ctx.sendJson(err.statusCode || 400, { error: err.message });
  }

  const err = validateUpdateFields(body);
  if (err) return ctx.sendJson(400, { error: err });

  const updated = opportunities.update(ctx.user.id, id, {
    title: body.title, description: body.description, opportunityType: body.type,
    requiredSkills: body.skills, location: body.location, duration: body.duration,
    stipend: body.stipend, status: body.status, domain: body.domain, mode: body.mode,
    experience: body.experience, preferredSkills: body.preferredSkills, company: body.company,
  });
  if (!updated) return ctx.sendJson(404, { error: "Opportunity not found." });
  ctx.sendJson(200, { opportunity: toClientShape(updated) });
}

function deleteOpportunity(req, res, ctx) {
  const authError = requireIndustry(ctx);
  if (authError) return ctx.sendJson(authError.status, authError.body);

  const id = Number(ctx.params.opportunityId);
  if (!Number.isInteger(id) || id <= 0) return ctx.sendJson(400, { error: "Invalid opportunity id." });

  const result = opportunities.remove(ctx.user.id, id);
  if (!result || result.changes === 0) return ctx.sendJson(404, { error: "Opportunity not found." });
  ctx.sendJson(200, { ok: true });
}

module.exports = { listOpportunities, getOpportunity, createOpportunity, updateOpportunity, deleteOpportunity };
