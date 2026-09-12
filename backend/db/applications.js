/*
 * db/applications.js — SQLite-backed applications store, linking a
 * student user to an opportunity. Reused/extended in Step 9 to back
 * the real Applications workflow (see routes/applications.js),
 * replacing the localStorage "applications" list in js/opportunities.js.
 */

const { db } = require("./database");

function findById(id) {
  return db.prepare("SELECT * FROM applications WHERE id = ?").get(id);
}

function listByStudentUserId(studentUserId) {
  return db.prepare("SELECT * FROM applications WHERE student_user_id = ? ORDER BY created_at DESC").all(studentUserId);
}

function listByOpportunityId(opportunityId) {
  return db.prepare("SELECT * FROM applications WHERE opportunity_id = ? ORDER BY created_at DESC").all(opportunityId);
}

// The existing project already defines a status vocabulary
// (js/data.js DATA.APPLICATION_STATUSES) — "Applied" is the initial
// state a student's application starts in, reused here instead of the
// column's original 'submitted' default (which predates this
// vocabulary and was never actually used until Step 9).
const INITIAL_STATUS = "Applied";

function create(studentUserId, opportunityId, { coverMessage } = {}) {
  const result = db.prepare(
    `INSERT INTO applications (student_user_id, opportunity_id, status, cover_message)
     VALUES (?, ?, ?, ?)`
  ).run(studentUserId, opportunityId, INITIAL_STATUS, coverMessage ?? null);
  return findById(Number(result.lastInsertRowid));
}

function setStatus(applicationId, status) {
  db.prepare("UPDATE applications SET status = ?, updated_at = datetime('now') WHERE id = ?")
    .run(status, applicationId);
  return findById(applicationId);
}

// Joins applications -> users for the Industry "view applicants" flow.
// Only the columns the existing UI needs are selected — never
// password_hash or any other users column.
function listApplicantsForOpportunity(opportunityId) {
  return db.prepare(
    `SELECT a.id, a.opportunity_id, a.status, a.cover_message, a.created_at, a.updated_at,
            u.id AS student_id, u.name AS student_name, u.email AS student_email
     FROM applications a
     JOIN users u ON u.id = a.student_user_id
     WHERE a.opportunity_id = ?
     ORDER BY a.created_at DESC`
  ).all(opportunityId);
}

// True when this student has ever applied to one of this industry
// user's opportunities (covers both regular Opportunities and Industry
// Live Projects — Step 16 reuses the same `opportunities`/`applications`
// tables for those, see backend/services/industryProjectService.js).
// Used by backend/routes/resume.js to gate industry access to a
// student's resume on a real, existing relationship — never "any
// industry user can view any student".
function existsBetweenStudentAndIndustry(studentUserId, industryUserId) {
  const row = db.prepare(
    `SELECT 1 FROM applications a
     JOIN opportunities o ON o.id = a.opportunity_id
     WHERE a.student_user_id = ? AND o.industry_user_id = ?
     LIMIT 1`
  ).get(studentUserId, industryUserId);
  return !!row;
}

module.exports = {
  findById, listByStudentUserId, listByOpportunityId, create, setStatus, listApplicantsForOpportunity, INITIAL_STATUS,
  existsBetweenStudentAndIndustry,
};
