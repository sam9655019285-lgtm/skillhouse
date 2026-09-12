/*
 * db/problemStatements.js — SQLite-backed Industry Problem Statements
 * + participation (Step 17). All statements use parameterized SQL
 * only; ownership is enforced by every mutating function requiring
 * the owning industry's id and filtering on it.
 */

const { db } = require("./database");

function parseSkillsField(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function findById(id) {
  return db.prepare("SELECT * FROM industry_problem_statements WHERE id = ?").get(id);
}

function list({ status } = {}) {
  if (status) {
    return db.prepare("SELECT * FROM industry_problem_statements WHERE status = ? ORDER BY created_at DESC").all(status);
  }
  return db.prepare("SELECT * FROM industry_problem_statements ORDER BY created_at DESC").all();
}

function listByIndustryId(industryId) {
  return db.prepare("SELECT * FROM industry_problem_statements WHERE industry_id = ? ORDER BY created_at DESC").all(industryId);
}

function create(industryId, fields) {
  const result = db.prepare(
    `INSERT INTO industry_problem_statements
       (industry_id, title, description, problem_category, domain, industry_context, expected_outcome,
        required_skills, preferred_skills, team_size, mode, duration, status, deadline)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Open', ?)`
  ).run(
    industryId, fields.title, fields.description ?? null, fields.problemCategory ?? null, fields.domain ?? null,
    fields.industryContext ?? null, fields.expectedOutcome ?? null,
    JSON.stringify(fields.requiredSkills || []), JSON.stringify(fields.preferredSkills || []),
    fields.teamSize ?? null, fields.mode ?? null, fields.duration ?? null, fields.deadline ?? null
  );
  return findById(Number(result.lastInsertRowid));
}

function update(industryId, id, fields) {
  const existing = findById(id);
  if (!existing || existing.industry_id !== industryId) return null;
  db.prepare(
    `UPDATE industry_problem_statements SET
       title = ?, description = ?, problem_category = ?, domain = ?, industry_context = ?, expected_outcome = ?,
       required_skills = ?, preferred_skills = ?, team_size = ?, mode = ?, duration = ?, status = ?, deadline = ?,
       updated_at = datetime('now')
     WHERE id = ? AND industry_id = ?`
  ).run(
    fields.title ?? existing.title, fields.description ?? existing.description,
    fields.problemCategory ?? existing.problem_category, fields.domain ?? existing.domain,
    fields.industryContext ?? existing.industry_context, fields.expectedOutcome ?? existing.expected_outcome,
    fields.requiredSkills !== undefined ? JSON.stringify(fields.requiredSkills) : existing.required_skills,
    fields.preferredSkills !== undefined ? JSON.stringify(fields.preferredSkills) : existing.preferred_skills,
    fields.teamSize !== undefined ? fields.teamSize : existing.team_size,
    fields.mode ?? existing.mode, fields.duration ?? existing.duration,
    fields.status ?? existing.status,
    fields.deadline !== undefined ? fields.deadline : existing.deadline,
    id, industryId
  );
  return findById(id);
}

function remove(industryId, id) {
  return db.prepare("DELETE FROM industry_problem_statements WHERE id = ? AND industry_id = ?").run(id, industryId);
}

// ---- Participation ----
function findParticipantById(id) {
  return db.prepare("SELECT * FROM problem_statement_participants WHERE id = ?").get(id);
}

function findParticipation(problemStatementId, studentId) {
  return db.prepare("SELECT * FROM problem_statement_participants WHERE problem_statement_id = ? AND student_id = ?").get(problemStatementId, studentId);
}

function addParticipant(problemStatementId, studentId, message) {
  const result = db.prepare(
    "INSERT INTO problem_statement_participants (problem_statement_id, student_id, message) VALUES (?, ?, ?)"
  ).run(problemStatementId, studentId, message ?? null);
  return findParticipantById(Number(result.lastInsertRowid));
}

function listParticipants(problemStatementId) {
  return db.prepare(
    `SELECT p.id, p.problem_statement_id, p.status, p.message, p.created_at, p.updated_at,
            u.id AS student_id, u.name AS student_name, u.email AS student_email
     FROM problem_statement_participants p
     JOIN users u ON u.id = p.student_id
     WHERE p.problem_statement_id = ?
     ORDER BY p.created_at DESC`
  ).all(problemStatementId);
}

function listByStudentId(studentId) {
  return db.prepare("SELECT * FROM problem_statement_participants WHERE student_id = ? ORDER BY created_at DESC").all(studentId);
}

function updateParticipantStatus(id, status) {
  db.prepare("UPDATE problem_statement_participants SET status = ?, updated_at = datetime('now') WHERE id = ?").run(status, id);
  return findParticipantById(id);
}

module.exports = {
  findById, list, listByIndustryId, create, update, remove, parseSkillsField,
  findParticipantById, findParticipation, addParticipant, listParticipants, listByStudentId, updateParticipantStatus,
};
