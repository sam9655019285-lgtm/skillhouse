/*
 * db/mentorship.js — SQLite-backed mentorship requests store
 * (Step 15). Ownership is enforced by every function taking the
 * owning user's id as a required parameter and filtering on it —
 * callers (routes) never trust an id from the client alone.
 */

const { db } = require("./database");

const VALID_STATUSES = ["Pending", "Accepted", "Rejected", "Completed", "Cancelled"];
const ACTIVE_STATUSES = ["Pending", "Accepted"];

function findById(id) {
  return db.prepare("SELECT * FROM mentorship_requests WHERE id = ?").get(id);
}

// Duplicate-protection lookup: an active (Pending/Accepted) request
// already linking this student to this academician.
function findActiveRequest(studentId, academicianId) {
  const placeholders = ACTIVE_STATUSES.map(() => "?").join(",");
  return db.prepare(
    `SELECT * FROM mentorship_requests WHERE student_id = ? AND academician_id = ? AND status IN (${placeholders})`
  ).get(studentId, academicianId, ...ACTIVE_STATUSES);
}

function createRequest(studentId, academicianId, message) {
  const result = db.prepare(
    "INSERT INTO mentorship_requests (student_id, academician_id, message) VALUES (?, ?, ?)"
  ).run(studentId, academicianId, message ?? null);
  return findById(Number(result.lastInsertRowid));
}

function getStudentRequests(studentId) {
  return db.prepare("SELECT * FROM mentorship_requests WHERE student_id = ? ORDER BY created_at DESC").all(studentId);
}

function getAcademicianRequests(academicianId) {
  return db.prepare("SELECT * FROM mentorship_requests WHERE academician_id = ? ORDER BY created_at DESC").all(academicianId);
}

// Only updates if the request belongs to this academician; returns
// null otherwise (caller reports 404, never confirms existence to a
// non-owner).
function updateRequestStatus(academicianId, requestId, status) {
  const existing = findById(requestId);
  if (!existing || existing.academician_id !== academicianId) return null;
  db.prepare("UPDATE mentorship_requests SET status = ?, updated_at = datetime('now') WHERE id = ?").run(status, requestId);
  return findById(requestId);
}

// Only cancels if the request belongs to this student.
function cancelRequest(studentId, requestId) {
  const existing = findById(requestId);
  if (!existing || existing.student_id !== studentId) return null;
  db.prepare("UPDATE mentorship_requests SET status = 'Cancelled', updated_at = datetime('now') WHERE id = ?").run(requestId);
  return findById(requestId);
}

module.exports = {
  createRequest, getStudentRequests, getAcademicianRequests, getRequestById: findById,
  updateRequestStatus, cancelRequest, findActiveRequest, VALID_STATUSES,
};
