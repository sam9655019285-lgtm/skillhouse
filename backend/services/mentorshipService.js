/*
 * services/mentorshipService.js — Mentorship & Faculty Guidance
 * (Step 15). Reuses rather than duplicates:
 *   - backend/services/skillGapService.js (Step 7 — gap severity)
 *   - backend/services/learningRecommendationService.js (Step 11)
 *   - backend/services/candidateSearchService.js (Step 14 — the
 *     "safe student development view" an academician sees is exactly
 *     Step 14's candidate detail, reused as-is, not reimplemented)
 *
 * MENTOR DISCOVERY NOTE: there is no academician-profile table in the
 * schema (student_profiles is student-only) and no reliable
 * department/skill field for Academician users anywhere in the
 * database. Per your instruction not to invent mentor data, mentor
 * summaries here are strictly {id, name} — nothing else is claimed.
 */

const { db } = require("../db/database");
const mentorshipDb = require("../db/mentorship");
const skillGapService = require("./skillGapService");
const learningRecommendationService = require("./learningRecommendationService");
const candidateSearchService = require("./candidateSearchService");

// ---- A. Mentor discovery ----
function getAvailableMentors() {
  return db.prepare("SELECT id, name FROM users WHERE role = 'Academician' ORDER BY name").all();
}

// ---- B. Student mentorship needs (reuses Step 7 + Step 11 as-is) ----
async function getStudentNeeds(studentId, { role } = {}) {
  const availableRoles = skillGapService.getAvailableRoles();
  const targetRole = role && availableRoles.includes(role) ? role : availableRoles[0];
  if (!targetRole) {
    return { targetRole: null, majorGaps: [], moderateGaps: [], minorGaps: [], prioritySkills: [], learningRecommendations: [] };
  }

  const gapResult = skillGapService.calculateSkillGap(studentId, targetRole);
  const majorGaps = [], moderateGaps = [], minorGaps = [];
  if (gapResult) {
    for (const s of gapResult.skills) {
      if (s.severity === "Major Gap") majorGaps.push(s.skillName);
      else if (s.severity === "Moderate Gap") moderateGaps.push(s.skillName);
      else if (s.severity === "Minor Gap") minorGaps.push(s.skillName);
    }
  }
  const prioritySkills = gapResult ? gapResult.priorityGaps.slice(0, 5).map((g) => g.skillName) : [];

  const recResult = await learningRecommendationService.getRecommendations(studentId, { role: targetRole });

  return {
    targetRole,
    majorGaps, moderateGaps, minorGaps, prioritySkills,
    learningRecommendations: recResult.recommendations,
  };
}

// ---- C. Mentor suitability — intentionally not implemented: no
// reliable academician skill/department data exists to match against
// (see file header). Kept simple per your instruction rather than
// inventing mentor attributes.

// ---- Request workflow ----
function createRequest(studentId, academicianId, message) {
  const academician = db.prepare("SELECT id FROM users WHERE id = ? AND role = 'Academician'").get(academicianId);
  if (!academician) return { error: "not_found" };
  if (mentorshipDb.findActiveRequest(studentId, academicianId)) return { error: "duplicate" };
  return { request: mentorshipDb.createRequest(studentId, academicianId, message) };
}

// Student Development View for an academician looking at one request —
// reuses Step 14's candidate detail (skills/projects/assessment/
// readiness) plus Step 7's major-gap/priority-skill summary. Not a
// new algorithm.
async function getStudentDevelopmentView(studentId) {
  const detail = candidateSearchService.getCandidateDetail(studentId);
  if (!detail) return null;
  const needs = await getStudentNeeds(studentId);
  return { ...detail, majorGaps: needs.majorGaps, prioritySkills: needs.prioritySkills };
}

module.exports = { getAvailableMentors, getStudentNeeds, createRequest, getStudentDevelopmentView };
