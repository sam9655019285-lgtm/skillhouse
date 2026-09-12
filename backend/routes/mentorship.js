/*
 * routes/mentorship.js — Mentorship & Faculty Guidance (Step 15).
 * student_id/academician_id always come from the authenticated
 * session (ctx.user.id) — never from the request body/URL beyond the
 * academician being requested, which is validated server-side.
 */

const mentorshipDb = require("../db/mentorship");
const mentorshipService = require("../services/mentorshipService");
const notificationService = require("../services/notificationService");
const { readJsonBody } = require("../utils/body");

const MAX_MESSAGE_LENGTH = 2000;

function requireRole(ctx, role) {
  if (!ctx.user) return { status: 401, body: { error: "Not authenticated." } };
  if (ctx.user.role !== role) return { status: 403, body: { error: `Only ${role.toLowerCase()} accounts can do this.` } };
  return null;
}

function toClientShape(row) {
  return {
    id: row.id,
    studentId: row.student_id,
    academicianId: row.academician_id,
    status: row.status,
    message: row.message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ---- Student: discover mentors ----
function getMentors(req, res, ctx) {
  const authError = requireRole(ctx, "Student");
  if (authError) return ctx.sendJson(authError.status, authError.body);
  ctx.sendJson(200, { mentors: mentorshipService.getAvailableMentors() });
}

// ---- Student: create a mentorship request ----
async function createRequest(req, res, ctx) {
  const authError = requireRole(ctx, "Student");
  if (authError) return ctx.sendJson(authError.status, authError.body);

  let body;
  try {
    body = await readJsonBody(req);
  } catch (err) {
    return ctx.sendJson(err.statusCode || 400, { error: err.message });
  }

  const academicianId = Number(body.academicianId);
  if (!Number.isInteger(academicianId) || academicianId <= 0) return ctx.sendJson(400, { error: "Invalid academicianId." });
  const message = body.message;
  if (message !== undefined && message !== null && (typeof message !== "string" || message.length > MAX_MESSAGE_LENGTH)) {
    return ctx.sendJson(400, { error: `message must be text of ${MAX_MESSAGE_LENGTH} characters or fewer.` });
  }

  const result = mentorshipService.createRequest(ctx.user.id, academicianId, message ?? null);
  if (result.error === "not_found") return ctx.sendJson(404, { error: "Academician not found." });
  if (result.error === "duplicate") return ctx.sendJson(409, { error: "You already have an active request with this academician." });

  try {
    notificationService.notify(academicianId, {
      type: "MENTORSHIP_REQUEST", title: "New Mentorship Request",
      message: "A student has requested your mentorship.",
      entityType: "mentorship_request", entityId: result.request.id,
    });
  } catch { /* notification failure must never affect the request response */ }

  ctx.sendJson(201, { request: toClientShape(result.request) });
}

// ---- Student: view own requests ----
function getStudentRequests(req, res, ctx) {
  const authError = requireRole(ctx, "Student");
  if (authError) return ctx.sendJson(authError.status, authError.body);
  const rows = mentorshipDb.getStudentRequests(ctx.user.id);
  ctx.sendJson(200, { requests: rows.map(toClientShape) });
}

// ---- Academician: view incoming requests ----
async function getAcademicianRequests(req, res, ctx) {
  const authError = requireRole(ctx, "Academician");
  if (authError) return ctx.sendJson(authError.status, authError.body);
  const rows = mentorshipDb.getAcademicianRequests(ctx.user.id);
  const shaped = [];
  for (const row of rows) {
    const development = await mentorshipService.getStudentDevelopmentView(row.student_id);
    shaped.push({ ...toClientShape(row), student: development });
  }
  ctx.sendJson(200, { requests: shaped });
}

// ---- Academician: accept/reject/complete a request they own ----
async function updateRequestStatus(req, res, ctx) {
  const authError = requireRole(ctx, "Academician");
  if (authError) return ctx.sendJson(authError.status, authError.body);

  const requestId = Number(ctx.params.requestId);
  if (!Number.isInteger(requestId) || requestId <= 0) return ctx.sendJson(400, { error: "Invalid request id." });

  let body;
  try {
    body = await readJsonBody(req);
  } catch (err) {
    return ctx.sendJson(err.statusCode || 400, { error: err.message });
  }
  const allowed = ["Accepted", "Rejected", "Completed"];
  if (!allowed.includes(body.status)) return ctx.sendJson(400, { error: `status must be one of: ${allowed.join(", ")}.` });

  const updated = mentorshipDb.updateRequestStatus(ctx.user.id, requestId, body.status);
  if (!updated) return ctx.sendJson(404, { error: "Mentorship request not found." });

  try {
    notificationService.notify(updated.student_id, {
      type: "MENTORSHIP_STATUS", title: `Your mentorship request was ${body.status.toLowerCase()}`,
      message: `Your mentorship request is now ${body.status}.`,
      entityType: "mentorship_request", entityId: requestId,
    });
  } catch { /* notification failure must never affect the status-update response */ }

  ctx.sendJson(200, { request: toClientShape(updated) });
}

// ---- Student: cancel their own request ----
function cancelRequest(req, res, ctx) {
  const authError = requireRole(ctx, "Student");
  if (authError) return ctx.sendJson(authError.status, authError.body);

  const requestId = Number(ctx.params.requestId);
  if (!Number.isInteger(requestId) || requestId <= 0) return ctx.sendJson(400, { error: "Invalid request id." });

  const updated = mentorshipDb.cancelRequest(ctx.user.id, requestId);
  if (!updated) return ctx.sendJson(404, { error: "Mentorship request not found." });
  ctx.sendJson(200, { request: toClientShape(updated) });
}

// ---- Student: own development needs (reuses Steps 7 + 11) ----
async function getStudentNeeds(req, res, ctx) {
  const authError = requireRole(ctx, "Student");
  if (authError) return ctx.sendJson(authError.status, authError.body);
  const result = await mentorshipService.getStudentNeeds(ctx.user.id, { role: ctx.query.role || null });
  ctx.sendJson(200, result);
}

module.exports = {
  getMentors, createRequest, getStudentRequests, getAcademicianRequests,
  updateRequestStatus, cancelRequest, getStudentNeeds,
};
