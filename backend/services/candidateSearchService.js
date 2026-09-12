/*
 * services/candidateSearchService.js — Industry Candidate Discovery
 * (Step 14). Aggregate/public-safe only — never returns password
 * hashes, session tokens, LinkedIn tokens, or email (the existing
 * mock candidate UI in js/industry.js/js/analytics-engine.js never
 * displayed candidate email either, so this doesn't introduce a new
 * exposure).
 *
 * Reuses rather than duplicates:
 *   - backend/services/skillGapService.js (Step 7: canonicalSkillName,
 *     classifyGap, getCurrentSkillProfile, jobRoleRequirements — for
 *     the deterministic readiness classification)
 *   - backend/db/database.js shared `db` connection (same direct-SQL
 *     aggregate pattern as Steps 12/13, since this is a cross-student
 *     discovery concern the per-user db/*.js modules were never meant
 *     to expose)
 */

const { db } = require("../db/database");
const skillGapService = require("./skillGapService");

function buildRequiredSkillBar() {
  const bar = new Map();
  for (const requirements of Object.values(skillGapService.jobRoleRequirements)) {
    for (const [skill, req] of Object.entries(requirements)) {
      bar.set(skill, Math.max(bar.get(skill) || 0, req.required_score));
    }
  }
  return bar;
}

// Same deterministic rule as Step 12's institution readiness
// classification, reused rather than reinvented for candidate
// discovery: Ready (assessed, zero Major Gaps, meets 3+ skills),
// Developing (some evidence, 1-3 Major Gaps), else Needs Improvement.
function classifyReadiness(userId, hasAssessment) {
  const requiredBar = buildRequiredSkillBar();
  const { profile } = skillGapService.getCurrentSkillProfile(userId);
  let majorGapCount = 0, metRequirementCount = 0;
  for (const [skill, requiredLevel] of requiredBar.entries()) {
    const current = profile[skill] || 0;
    const severity = skillGapService.classifyGap(Math.max(requiredLevel - current, 0));
    if (severity === "Major Gap") majorGapCount++;
    if (severity === "Meets Requirement") metRequirementCount++;
  }
  const hasSkills = Object.keys(profile).length > 0;
  if (hasAssessment && majorGapCount === 0 && metRequirementCount >= 3) return "Ready";
  if ((hasSkills || hasAssessment) && majorGapCount >= 1 && majorGapCount <= 3) return "Developing";
  return "Needs Improvement";
}

function loadCandidateBase() {
  return db.prepare(
    `SELECT u.id AS id, u.name AS name, p.department AS department
     FROM users u
     LEFT JOIN student_profiles p ON p.user_id = u.id
     WHERE u.role = 'Student'
     ORDER BY u.name`
  ).all();
}

function loadSkillsFor(userId) {
  return db.prepare("SELECT skill_name AS skillName, proficiency FROM student_skills WHERE user_id = ? ORDER BY skill_name").all(userId);
}

function loadProjectsFor(userId) {
  return db.prepare("SELECT id, title, description, technologies, project_url AS projectUrl FROM student_projects WHERE user_id = ? ORDER BY created_at DESC").all(userId);
}

function loadLatestAssessment(userId) {
  const row = db.prepare("SELECT id, score, completed_at AS completedAt FROM assessments WHERE student_user_id = ? ORDER BY completed_at DESC LIMIT 1").get(userId);
  return row || null;
}

function matchesSearch(term, candidate, skills, projects) {
  const t = term.toLowerCase();
  if (candidate.name && candidate.name.toLowerCase().includes(t)) return true;
  if (candidate.department && candidate.department.toLowerCase().includes(t)) return true;
  if (skills.some((s) => s.skillName.toLowerCase().includes(t))) return true;
  if (projects.some((p) => (p.title || "").toLowerCase().includes(t))) return true;
  return false;
}

// A. Candidate discovery — returns safe summaries only.
function searchCandidates({ skill, proficiency, department, hasProjects, hasAssessment, search } = {}) {
  const skillCanonical = skill ? skillGapService.canonicalSkillName(skill) : null;
  const base = loadCandidateBase();

  const results = [];
  for (const candidate of base) {
    if (department && (candidate.department || "").toLowerCase() !== department.toLowerCase()) continue;

    const skills = loadSkillsFor(candidate.id);
    const projects = loadProjectsFor(candidate.id);
    const assessment = loadLatestAssessment(candidate.id);
    const projectCount = projects.length;
    const assessmentCompleted = !!assessment;

    if (skillCanonical) {
      const match = skills.find((s) => skillGapService.canonicalSkillName(s.skillName) === skillCanonical);
      if (!match) continue;
      if (proficiency && match.proficiency !== proficiency) continue;
    } else if (proficiency) {
      if (!skills.some((s) => s.proficiency === proficiency)) continue;
    }

    if (hasProjects === "true" && projectCount === 0) continue;
    if (hasProjects === "false" && projectCount > 0) continue;
    if (hasAssessment === "true" && !assessmentCompleted) continue;
    if (hasAssessment === "false" && assessmentCompleted) continue;

    if (search && !matchesSearch(search, candidate, skills, projects)) continue;

    results.push({
      id: candidate.id,
      name: candidate.name,
      department: candidate.department || null,
      skills: skills.map((s) => ({ skillName: s.skillName, proficiency: s.proficiency })),
      projectCount,
      assessmentCompleted,
      assessmentScore: assessment ? assessment.score : null,
    });
  }
  return results;
}

// C. Candidate detail — full safe profile for one student.
// Returns null if the id doesn't refer to a Student user.
function getCandidateDetail(candidateId) {
  const user = db.prepare("SELECT id, name FROM users WHERE id = ? AND role = 'Student'").get(candidateId);
  if (!user) return null;

  const profile = db.prepare("SELECT department, college, year, bio, location FROM student_profiles WHERE user_id = ?").get(candidateId) || {};
  const skills = loadSkillsFor(candidateId);
  const projects = loadProjectsFor(candidateId);
  const latestAssessment = loadLatestAssessment(candidateId);
  const assessmentSkillScores = latestAssessment
    ? db.prepare("SELECT skill_name AS skillName, score FROM skill_assessment_results WHERE assessment_id = ?").all(latestAssessment.id)
    : [];

  const readiness = classifyReadiness(candidateId, !!latestAssessment);

  return {
    id: user.id,
    name: user.name,
    department: profile.department || null,
    college: profile.college || null,
    year: profile.year || null,
    bio: profile.bio || null,
    location: profile.location || null,
    skills: skills.map((s) => ({ skillName: s.skillName, proficiency: s.proficiency })),
    projects: projects.map((p) => ({ id: p.id, title: p.title, description: p.description, technologies: p.technologies, projectUrl: p.projectUrl })),
    assessment: latestAssessment
      ? { completed: true, score: latestAssessment.score, completedAt: latestAssessment.completedAt, skillScores: assessmentSkillScores }
      : { completed: false, score: null, completedAt: null, skillScores: [] },
    readiness,
  };
}

module.exports = { searchCandidates, getCandidateDetail };
