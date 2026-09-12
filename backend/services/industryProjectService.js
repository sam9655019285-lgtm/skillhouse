/*
 * services/industryProjectService.js — Industry Live Projects
 * (Step 16). Reuses rather than duplicates:
 *   - backend/db/opportunities.js  (a "live project" is simply an
 *     opportunities row with opportunity_type = 'Industry Project' —
 *     js/data.js's OPPORTUNITY_TYPES already lists this as a
 *     recognized type. Same CRUD, same ownership checks, same table.)
 *   - backend/db/applications.js   (same applications table/workflow
 *     as Step 9 — a project application IS an opportunity application)
 *   - backend/services/opportunityMatchingService.js (Step 10, used
 *     unchanged since a project row is opportunity-shaped)
 *
 * PROJECT_STATUSES intentionally differs from routes/opportunities.js's
 * own Active/Closed vocabulary — "Open" is this module's equivalent of
 * "Active" (same underlying value, different label the task asked
 * for), plus "In Progress"/"Completed" as project-specific states.
 * Regular (non-project) opportunities are entirely unaffected — they
 * still only ever use Active/Closed via routes/opportunities.js.
 */

const opportunities = require("../db/opportunities");
const applications = require("../db/applications");
const opportunityMatchingService = require("./opportunityMatchingService");

const PROJECT_TYPE = "Industry Project";
const PROJECT_STATUSES = ["Open", "In Progress", "Completed", "Closed"];
const APPLICATION_STATUSES = ["Applied", "Under Review", "Shortlisted", "Rejected", "Accepted", "Completed"];

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
    domain: row.domain || null,
    mode: row.mode || null,
    duration: row.duration || null,
    requiredSkills: parseSkillsField(row.required_skills),
    preferredSkills: parseSkillsField(row.preferred_skills),
    capacity: row.capacity !== null && row.capacity !== undefined ? row.capacity : null,
    status: row.status,
    deadline: row.deadline || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function isProjectRow(row) {
  return !!row && row.opportunity_type === PROJECT_TYPE;
}

function toMatchable(row) {
  return { id: row.id, domain: row.domain || null, requiredSkills: parseSkillsField(row.required_skills), preferredSkills: parseSkillsField(row.preferred_skills) };
}

// ---- A. Listing ----
function listProjects() {
  return opportunities.listAll().filter((r) => r.opportunity_type === PROJECT_TYPE).map(toClientShape);
}

function getProject(id) {
  const row = opportunities.findById(id);
  if (!isProjectRow(row)) return null;
  return toClientShape(row);
}

function findProjectRow(id) {
  const row = opportunities.findById(id);
  return isProjectRow(row) ? row : null;
}

function createProject(industryUserId, fields) {
  const created = opportunities.create(industryUserId, {
    title: fields.title, description: fields.description, opportunityType: PROJECT_TYPE,
    requiredSkills: fields.requiredSkills, domain: fields.domain ?? null, mode: fields.mode ?? null,
    duration: fields.duration ?? null, preferredSkills: fields.preferredSkills ?? [],
    company: fields.company ?? null, capacity: fields.capacity ?? null, deadline: fields.deadline ?? null,
    initialStatus: "Open",
  });
  return toClientShape(created);
}

function updateProject(industryUserId, projectId, fields) {
  const existing = findProjectRow(projectId);
  if (!existing || existing.industry_user_id !== industryUserId) return null;
  const updated = opportunities.update(industryUserId, projectId, {
    title: fields.title, description: fields.description, requiredSkills: fields.requiredSkills,
    domain: fields.domain, mode: fields.mode, duration: fields.duration, preferredSkills: fields.preferredSkills,
    status: fields.status, capacity: fields.capacity, deadline: fields.deadline,
  });
  return updated ? toClientShape(updated) : null;
}

function deleteProject(industryUserId, projectId) {
  const existing = findProjectRow(projectId);
  if (!existing || existing.industry_user_id !== industryUserId) return { error: "not_found" };
  const result = opportunities.remove(industryUserId, projectId);
  return result && result.changes > 0 ? { ok: true } : { error: "not_found" };
}

// ---- B. Application (reuses db/applications.js as-is) ----
function applyToProject(studentId, projectId, coverMessage) {
  const row = findProjectRow(projectId);
  if (!row) return { error: "not_found" };
  if (row.status !== "Open") return { error: "not_open" };
  if (row.deadline && new Date(row.deadline).getTime() < Date.now()) return { error: "deadline_passed" };
  if (row.capacity !== null && row.capacity !== undefined) {
    const currentCount = applications.listByOpportunityId(projectId).length;
    if (currentCount >= row.capacity) return { error: "capacity_full" };
  }
  try {
    const created = applications.create(studentId, projectId, { coverMessage });
    return { application: created };
  } catch (err) {
    if (String(err.message || "").includes("UNIQUE")) return { error: "duplicate" };
    throw err;
  }
}

function listApplicants(industryUserId, projectId) {
  const row = findProjectRow(projectId);
  if (!row || row.industry_user_id !== industryUserId) return null;
  const rows = applications.listApplicantsForOpportunity(projectId);
  const matchable = toMatchable(row);
  return rows.map((r) => {
    const match = opportunityMatchingService.calculateMatch(r.student_id, matchable, null);
    return {
      applicationId: r.id, status: r.status, coverMessage: r.cover_message,
      appliedAt: r.created_at, updatedAt: r.updated_at,
      studentId: r.student_id, studentName: r.student_name, studentEmail: r.student_email,
      match: { matchScore: match.matchScore, matchLevel: match.matchLevel, matchedSkills: match.matchedSkills, missingSkills: match.missingSkills },
    };
  });
}

function updateApplicantStatus(industryUserId, projectId, applicationId, status) {
  const row = findProjectRow(projectId);
  if (!row || row.industry_user_id !== industryUserId) return { error: "not_found" };
  const application = applications.findById(applicationId);
  if (!application || application.opportunity_id !== projectId) return { error: "not_found" };
  const updated = applications.setStatus(applicationId, status);
  return { application: updated };
}

// ---- C. Matching (student-facing, reuses Step 10 as-is) ----
function getStudentMatch(studentId, projectId, targetRole) {
  const row = findProjectRow(projectId);
  if (!row) return null;
  return opportunityMatchingService.calculateMatch(studentId, toMatchable(row), targetRole || null);
}

module.exports = {
  PROJECT_TYPE, PROJECT_STATUSES, APPLICATION_STATUSES,
  listProjects, getProject, createProject, updateProject, deleteProject,
  applyToProject, listApplicants, updateApplicantStatus, getStudentMatch,
};
