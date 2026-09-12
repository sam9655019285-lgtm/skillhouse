/*
 * services/problemStatementService.js — Industry Problem Statements &
 * Collaboration (Step 17). Reuses rather than duplicates:
 *   - backend/services/skillGapService.js (canonicalSkillName, for
 *     normalizing required/preferred skills — same alias system as
 *     every prior step)
 *   - backend/services/opportunityMatchingService.js (Step 10) — a
 *     problem statement's {domain, requiredSkills, preferredSkills}
 *     is opportunity-shaped enough to feed calculateMatch() directly;
 *     computed on the fly, never stored as an opportunity row
 *   - backend/services/candidateSearchService.js (Step 14) — the
 *     "safe student info" an Industry sees per participant is exactly
 *     Step 14's candidate detail, reused as-is
 */

const problemStatementsDb = require("../db/problemStatements");
const skillGapService = require("./skillGapService");
const opportunityMatchingService = require("./opportunityMatchingService");
const candidateSearchService = require("./candidateSearchService");

const STATUSES = ["Open", "In Progress", "Completed", "Closed"];
const PARTICIPANT_STATUSES = ["Interested", "Shortlisted", "Accepted", "Rejected", "Completed"];

// Deterministic, no invented states — a participant can only move
// forward along this chain, or be Rejected from any non-terminal state.
const ALLOWED_TRANSITIONS = {
  Interested: ["Shortlisted", "Rejected"],
  Shortlisted: ["Accepted", "Rejected"],
  Accepted: ["Completed", "Rejected"],
  Rejected: [],
  Completed: [],
};

function canonicalize(skills) {
  return (skills || []).map((s) => skillGapService.canonicalSkillName(s));
}

function toClientShape(row) {
  return {
    id: row.id,
    industryId: row.industry_id,
    title: row.title,
    description: row.description,
    problemCategory: row.problem_category,
    domain: row.domain,
    industryContext: row.industry_context,
    expectedOutcome: row.expected_outcome,
    requiredSkills: problemStatementsDb.parseSkillsField(row.required_skills),
    preferredSkills: problemStatementsDb.parseSkillsField(row.preferred_skills),
    teamSize: row.team_size,
    mode: row.mode,
    duration: row.duration,
    status: row.status,
    deadline: row.deadline,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toMatchable(row) {
  return {
    id: row.id, domain: row.domain || null,
    requiredSkills: problemStatementsDb.parseSkillsField(row.required_skills),
    preferredSkills: problemStatementsDb.parseSkillsField(row.preferred_skills),
  };
}

function listProblems({ status } = {}) {
  return problemStatementsDb.list({ status }).map(toClientShape);
}

function getProblem(id) {
  const row = problemStatementsDb.findById(id);
  return row ? toClientShape(row) : null;
}

function createProblem(industryId, fields) {
  const created = problemStatementsDb.create(industryId, {
    ...fields,
    requiredSkills: canonicalize(fields.requiredSkills),
    preferredSkills: canonicalize(fields.preferredSkills),
  });
  return toClientShape(created);
}

function updateProblem(industryId, id, fields) {
  const patch = { ...fields };
  if (fields.requiredSkills !== undefined) patch.requiredSkills = canonicalize(fields.requiredSkills);
  if (fields.preferredSkills !== undefined) patch.preferredSkills = canonicalize(fields.preferredSkills);
  const updated = problemStatementsDb.update(industryId, id, patch);
  return updated ? toClientShape(updated) : null;
}

function deleteProblem(industryId, id) {
  const result = problemStatementsDb.remove(industryId, id);
  return result && result.changes > 0;
}

// ---- Student: express interest ----
function expressInterest(studentId, problemId, message) {
  const row = problemStatementsDb.findById(problemId);
  if (!row) return { error: "not_found" };
  if (row.status !== "Open") return { error: "not_open" };
  if (row.deadline && new Date(row.deadline).getTime() < Date.now()) return { error: "deadline_passed" };
  if (problemStatementsDb.findParticipation(problemId, studentId)) return { error: "duplicate" };
  const participant = problemStatementsDb.addParticipant(problemId, studentId, message ?? null);
  return { participant };
}

function getStudentParticipation(studentId) {
  return problemStatementsDb.listByStudentId(studentId).map((p) => {
    const problem = problemStatementsDb.findById(p.problem_statement_id);
    return {
      id: p.id, problemStatementId: p.problem_statement_id, status: p.status, message: p.message,
      createdAt: p.created_at, updatedAt: p.updated_at,
      problemTitle: problem ? problem.title : null,
    };
  });
}

// ---- Industry: participants (reuses Step 10 matching + Step 14 candidate detail) ----
function listParticipants(industryId, problemId) {
  const row = problemStatementsDb.findById(problemId);
  if (!row || row.industry_id !== industryId) return null;
  const matchable = toMatchable(row);
  const participants = problemStatementsDb.listParticipants(problemId);
  return participants.map((p) => {
    const match = opportunityMatchingService.calculateMatch(p.student_id, matchable, null);
    const detail = candidateSearchService.getCandidateDetail(p.student_id);
    return {
      participantId: p.id, status: p.status, message: p.message, createdAt: p.created_at, updatedAt: p.updated_at,
      student: detail ? {
        id: detail.id, name: detail.name, department: detail.department, college: detail.college,
        year: detail.year, skills: detail.skills, projects: detail.projects, readiness: detail.readiness,
      } : { id: p.student_id, name: p.student_name },
      match: { matchScore: match.matchScore, matchLevel: match.matchLevel, matchedSkills: match.matchedSkills, missingSkills: match.missingSkills },
    };
  });
}

function updateParticipantStatus(industryId, problemId, participantId, newStatus) {
  const row = problemStatementsDb.findById(problemId);
  if (!row || row.industry_id !== industryId) return { error: "not_found" };
  const participant = problemStatementsDb.findParticipantById(participantId);
  if (!participant || participant.problem_statement_id !== problemId) return { error: "not_found" };
  const allowed = ALLOWED_TRANSITIONS[participant.status] || [];
  if (!allowed.includes(newStatus)) return { error: "invalid_transition", allowed };
  const updated = problemStatementsDb.updateParticipantStatus(participantId, newStatus);
  return { participant: updated };
}

module.exports = {
  STATUSES, PARTICIPANT_STATUSES,
  listProblems, getProblem, createProblem, updateProblem, deleteProblem,
  expressInterest, getStudentParticipation, listParticipants, updateParticipantStatus,
};
