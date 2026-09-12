/*
 * routes/resume.js — AI-Powered Resume Builder endpoints, backed by
 * backend/db/resumes.js (student_resumes) and backend/services/
 * resumeBuilderService.js (which assembles the resume purely from the
 * student's real skills/certifications/projects/assessment records —
 * see that file's header for the no-fabrication design).
 *
 * Three audiences:
 *  - The owning student: generate a draft, save/update it, read it back.
 *  - Industry users: read a student's resume ONLY if the student set
 *    visibility to 'industry' AND a real application links that
 *    student to one of this industry user's opportunities/projects
 *    (db/applications.js existsBetweenStudentAndIndustry) — enforced
 *    here in the backend, not just hidden in the UI.
 *  - Nobody else. A student can never read another student's resume.
 */

const resumes = require("../db/resumes");
const applications = require("../db/applications");
const resumeBuilder = require("../services/resumeBuilderService");
const { readJsonBody } = require("../utils/body");

const MAX_TARGET_ROLE_LENGTH = 100;
const MAX_SUMMARY_LENGTH = 2000;
const MAX_TEXT_INPUT_LENGTH = 6000; // raw experience/achievements textarea before line-splitting
const ALLOWED_TEMPLATES = ["modern", "classic", "compact"];
const ALLOWED_VISIBILITY = ["private", "industry"];

function requireStudent(ctx) {
  if (!ctx.user) return { status: 401, body: { error: "Not authenticated." } };
  if (ctx.user.role !== "Student") return { status: 403, body: { error: "Only students can access this endpoint." } };
  return null;
}

function requireIndustry(ctx) {
  if (!ctx.user) return { status: 401, body: { error: "Not authenticated." } };
  if (ctx.user.role !== "Industry") return { status: 403, body: { error: "Only industry accounts can access this endpoint." } };
  return null;
}

function toClientShape(row) {
  if (!row) return null;
  return {
    targetRole: row.target_role,
    template: row.template,
    visibility: row.visibility,
    summary: row.summary,
    content: row.content,
    aiGenerated: !!row.ai_generated,
    updatedAt: row.updated_at,
  };
}

// The resume the student is editing/saving — everything but the
// content of `content` is deterministic; the free-form editable
// bullet lists live in `content` exactly as the frontend sends them.
function validateSaveBody(body) {
  if (body.targetRole !== undefined && body.targetRole !== null) {
    if (typeof body.targetRole !== "string" || body.targetRole.length > MAX_TARGET_ROLE_LENGTH) return "Target role is invalid.";
  }
  if (body.template !== undefined && !ALLOWED_TEMPLATES.includes(body.template)) return "Invalid resume template.";
  if (body.visibility !== undefined && !ALLOWED_VISIBILITY.includes(body.visibility)) return "Invalid visibility setting.";
  if (body.summary !== undefined && body.summary !== null) {
    if (typeof body.summary !== "string" || body.summary.length > MAX_SUMMARY_LENGTH) return `Summary must be ${MAX_SUMMARY_LENGTH} characters or fewer.`;
  }
  if (body.content !== undefined && (typeof body.content !== "object" || body.content === null || Array.isArray(body.content))) {
    return "Resume content is invalid.";
  }
  return null;
}

// ---- Student: generate a draft (not persisted) ----------------------------
async function generateResume(req, res, ctx) {
  const authError = requireStudent(ctx);
  if (authError) return ctx.sendJson(authError.status, authError.body);

  let body;
  try {
    body = await readJsonBody(req);
  } catch (err) {
    return ctx.sendJson(err.statusCode || 400, { error: err.message });
  }

  const profile = body.profile && typeof body.profile === "object" ? body.profile : {};
  if (typeof profile.experienceText === "string" && profile.experienceText.length > MAX_TEXT_INPUT_LENGTH) {
    return ctx.sendJson(400, { error: "Experience text is too long." });
  }
  if (typeof profile.achievementsText === "string" && profile.achievementsText.length > MAX_TEXT_INPUT_LENGTH) {
    return ctx.sendJson(400, { error: "Achievements text is too long." });
  }

  try {
    const draft = await resumeBuilder.buildDraft(ctx.user.id, profile);
    ctx.sendJson(200, { draft });
  } catch (err) {
    ctx.logger.error("Resume generation failed:", err.message);
    ctx.sendJson(500, { error: "Could not generate the resume draft." });
  }
}

// ---- Student: read their own saved resume ----------------------------
function getMyResume(req, res, ctx) {
  const authError = requireStudent(ctx);
  if (authError) return ctx.sendJson(authError.status, authError.body);
  const row = resumes.findByUserId(ctx.user.id);
  ctx.sendJson(200, { resume: toClientShape(row) });
}

// ---- Student: save/update the reviewed & edited resume ----------------------------
async function saveMyResume(req, res, ctx) {
  const authError = requireStudent(ctx);
  if (authError) return ctx.sendJson(authError.status, authError.body);

  let body;
  try {
    body = await readJsonBody(req);
  } catch (err) {
    return ctx.sendJson(err.statusCode || 400, { error: err.message });
  }

  const fieldError = validateSaveBody(body);
  if (fieldError) return ctx.sendJson(400, { error: fieldError });

  const saved = resumes.upsert(ctx.user.id, {
    targetRole: body.targetRole !== undefined ? body.targetRole : undefined,
    template: body.template,
    visibility: body.visibility,
    summary: body.summary !== undefined ? body.summary : undefined,
    content: body.content,
    aiGenerated: body.aiGenerated,
  });
  ctx.sendJson(200, { resume: toClientShape(saved) });
}

// ---- Industry: read an authorized student's resume ----------------------------
function getResumeForIndustry(req, res, ctx) {
  const authError = requireIndustry(ctx);
  if (authError) return ctx.sendJson(authError.status, authError.body);

  const studentId = Number(ctx.params.studentId);
  if (!Number.isInteger(studentId) || studentId <= 0) return ctx.sendJson(400, { error: "Invalid student id." });

  // A 404 either way (private resume vs. no connection vs. no resume)
  // — never distinguish these to the caller, so probing can't be used
  // to learn anything about a student who never applied to this
  // industry user.
  if (!applications.existsBetweenStudentAndIndustry(studentId, ctx.user.id)) {
    return ctx.sendJson(404, { error: "Resume not available." });
  }

  const row = resumes.findByUserId(studentId);
  if (!row || row.visibility !== "industry") {
    return ctx.sendJson(404, { error: "Resume not available." });
  }

  ctx.sendJson(200, { resume: toClientShape(row) });
}

module.exports = { generateResume, getMyResume, saveMyResume, getResumeForIndustry };
