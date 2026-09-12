/*
 * routes/applications.js — real Applications workflow, backed by
 * backend/db/applications.js + backend/db/opportunities.js.
 * student_user_id/industry ownership are always derived from the
 * session — never accepted from the client.
 *
 * Status vocabulary reused as-is from js/data.js DATA.APPLICATION_STATUSES
 * ("Applied", "Under Review", "Shortlisted", "Rejected") rather than
 * inventing a new one.
 */

const applications = require("../db/applications");
const opportunities = require("../db/opportunities");
const opportunityMatchingService = require("../services/opportunityMatchingService");
const notificationService = require("../services/notificationService");
const { readJsonBody } = require("../utils/body");

const MAX_COVER_MESSAGE_LENGTH = 2000;
const VALID_STATUSES = ["Applied", "Under Review", "Shortlisted", "Rejected"];

function requireRole(ctx, role) {
  if (!ctx.user) return { status: 401, body: { error: "Not authenticated." } };
  if (ctx.user.role !== role) return { status: 403, body: { error: `Only ${role.toLowerCase()} accounts can do this.` } };
  return null;
}

function toClientShape(row, opportunityRow) {
  return {
    id: row.id,
    opportunityId: row.opportunity_id,
    status: row.status,
    coverMessage: row.cover_message,
    appliedAt: row.created_at,
    updatedAt: row.updated_at,
    opportunityTitle: opportunityRow ? opportunityRow.title : null,
    company: opportunityRow ? opportunityRow.company : null,
  };
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

// Step 14: enriches an applicant row with Step 10's own matching
// service (reused as-is, no second matching algorithm) so an Industry
// user can see how well each applicant fits the opportunity they
// applied to.
function toApplicantShape(row, opportunityRow) {
  let match = null;
  if (opportunityRow) {
    const matchable = {
      id: opportunityRow.id,
      domain: opportunityRow.domain || null,
      requiredSkills: parseSkillsField(opportunityRow.required_skills),
      preferredSkills: parseSkillsField(opportunityRow.preferred_skills),
    };
    const result = opportunityMatchingService.calculateMatch(row.student_id, matchable, null);
    match = { matchScore: result.matchScore, matchLevel: result.matchLevel, matchedSkills: result.matchedSkills, missingSkills: result.missingSkills };
  }
  return {
    applicationId: row.id,
    match,
    status: row.status,
    coverMessage: row.cover_message,
    appliedAt: row.created_at,
    updatedAt: row.updated_at,
    studentId: row.student_id,
    studentName: row.student_name,
    studentEmail: row.student_email,
  };
}

// ---- Student: apply to an opportunity ----
async function applyToOpportunity(req, res, ctx) {
  const authError = requireRole(ctx, "Student");
  if (authError) return ctx.sendJson(authError.status, authError.body);

  const opportunityId = Number(ctx.params.opportunityId);
  if (!Number.isInteger(opportunityId) || opportunityId <= 0) return ctx.sendJson(400, { error: "Invalid opportunity id." });

  const opportunity = opportunities.findById(opportunityId);
  if (!opportunity) return ctx.sendJson(404, { error: "Opportunity not found." });
  if (opportunity.status !== "Active") return ctx.sendJson(400, { error: "This opportunity is not accepting applications." });

  let body = {};
  try {
    body = await readJsonBody(req);
  } catch (err) {
    return ctx.sendJson(err.statusCode || 400, { error: err.message });
  }
  const coverMessage = body.coverMessage;
  if (coverMessage !== undefined && coverMessage !== null && (typeof coverMessage !== "string" || coverMessage.length > MAX_COVER_MESSAGE_LENGTH)) {
    return ctx.sendJson(400, { error: `coverMessage must be text of ${MAX_COVER_MESSAGE_LENGTH} characters or fewer.` });
  }

  let created;
  try {
    created = applications.create(ctx.user.id, opportunityId, { coverMessage: coverMessage ?? null });
  } catch (err) {
    // UNIQUE(student_user_id, opportunity_id) violation — already applied.
    if (String(err.message || "").includes("UNIQUE")) {
      return ctx.sendJson(409, { error: "You have already applied to this opportunity." });
    }
    throw err;
  }

  // Notification only after the application row is committed — a
  // failure here never undoes or blocks the successful application.
  try {
    notificationService.notify(opportunity.industry_user_id, {
      type: "APPLICATION_RECEIVED", title: "New Application Received",
      message: `A student applied to "${opportunity.title}".`,
      entityType: "opportunity", entityId: opportunityId,
    });
  } catch { /* notification failure must never affect the application response */ }

  ctx.sendJson(201, { application: toClientShape(created, opportunity) });
}

// ---- Student: view own applications ----
function listMyApplications(req, res, ctx) {
  const authError = requireRole(ctx, "Student");
  if (authError) return ctx.sendJson(authError.status, authError.body);
  const rows = applications.listByStudentUserId(ctx.user.id);
  const shaped = rows.map((row) => toClientShape(row, opportunities.findById(row.opportunity_id)));
  ctx.sendJson(200, { applications: shaped });
}

function getMyApplication(req, res, ctx) {
  const authError = requireRole(ctx, "Student");
  if (authError) return ctx.sendJson(authError.status, authError.body);
  const id = Number(ctx.params.applicationId);
  if (!Number.isInteger(id) || id <= 0) return ctx.sendJson(400, { error: "Invalid application id." });
  const row = applications.findById(id);
  if (!row || row.student_user_id !== ctx.user.id) return ctx.sendJson(404, { error: "Application not found." });
  ctx.sendJson(200, { application: toClientShape(row, opportunities.findById(row.opportunity_id)) });
}

// ---- Industry: view applicants for one of their own opportunities ----
function listApplicants(req, res, ctx) {
  const authError = requireRole(ctx, "Industry");
  if (authError) return ctx.sendJson(authError.status, authError.body);

  const opportunityId = Number(ctx.params.opportunityId);
  if (!Number.isInteger(opportunityId) || opportunityId <= 0) return ctx.sendJson(400, { error: "Invalid opportunity id." });

  const opportunity = opportunities.findById(opportunityId);
  if (!opportunity || opportunity.industry_user_id !== ctx.user.id) return ctx.sendJson(404, { error: "Opportunity not found." });

  const rows = applications.listApplicantsForOpportunity(opportunityId);
  ctx.sendJson(200, { applicants: rows.map((row) => toApplicantShape(row, opportunity)) });
}

// ---- Industry: update an applicant's status on their own opportunity ----
async function updateApplicationStatus(req, res, ctx) {
  const authError = requireRole(ctx, "Industry");
  if (authError) return ctx.sendJson(authError.status, authError.body);

  const applicationId = Number(ctx.params.applicationId);
  if (!Number.isInteger(applicationId) || applicationId <= 0) return ctx.sendJson(400, { error: "Invalid application id." });

  const application = applications.findById(applicationId);
  if (!application) return ctx.sendJson(404, { error: "Application not found." });
  const opportunity = opportunities.findById(application.opportunity_id);
  if (!opportunity || opportunity.industry_user_id !== ctx.user.id) return ctx.sendJson(404, { error: "Application not found." });

  let body;
  try {
    body = await readJsonBody(req);
  } catch (err) {
    return ctx.sendJson(err.statusCode || 400, { error: err.message });
  }
  if (!VALID_STATUSES.includes(body.status)) {
    return ctx.sendJson(400, { error: `status must be one of: ${VALID_STATUSES.join(", ")}.` });
  }

  const updated = applications.setStatus(applicationId, body.status);

  try {
    notificationService.notify(application.student_user_id, {
      type: "APPLICATION_STATUS", title: `Your application was ${body.status.toLowerCase()}`,
      message: `Your application to "${opportunity.title}" is now ${body.status}.`,
      entityType: "opportunity", entityId: opportunity.id,
    });
  } catch { /* notification failure must never affect the status-update response */ }

  ctx.sendJson(200, { application: toClientShape(updated, opportunity) });
}

module.exports = {
  applyToOpportunity, listMyApplications, getMyApplication,
  listApplicants, updateApplicationStatus,
};
