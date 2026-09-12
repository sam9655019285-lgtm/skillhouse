/*
 * services/skillGapService.js — Student Skill-Gap Analysis Engine.
 *
 * A backend-authoritative port of js/engine.js's `SkillGap` module
 * (analyzeSkillGap / getCurrentSkillProfile / canonicalSkillName),
 * reusing the exact same 0-100 proficiency scale, gap thresholds, and
 * priority thresholds the frontend already established — no new
 * scale was invented for this step.
 *
 * Inputs (all authoritative, never trusted from the client):
 *   - backend/db/skills.js        student_skills (manually declared)
 *   - backend/db/assessments.js   assessments + skill_assessment_results
 *   - backend/data/jobRoleRequirements.json (mirrors js/data.js JOB_ROLES)
 *   - backend/data/skillAliases.json (already existed — reused as-is)
 */

const skillsDb = require("../db/skills");
const assessmentsDb = require("../db/assessments");
const jobRoleRequirements = require("../data/jobRoleRequirements.json");
const skillAliases = require("../data/skillAliases.json");

// Same scale as js/data.js DATA.DECLARED_PROFICIENCY_SCORES.
const DECLARED_PROFICIENCY_SCORES = { Beginner: 40, Intermediate: 60, Advanced: 85 };

// Same thresholds as js/engine.js SkillGap.GAP_THRESHOLDS / PRIORITY_THRESHOLDS.
const GAP_THRESHOLDS = [[31, "Major Gap"], [16, "Moderate Gap"], [1, "Minor Gap"], [0, "Meets Requirement"]];
const PRIORITY_THRESHOLDS = [[40, "High"], [15, "Medium"], [0, "Low"]];

function canonicalSkillName(skillName) {
  for (const [canonical, aliasList] of Object.entries(skillAliases)) {
    if (aliasList.includes(skillName)) return canonical;
  }
  return skillName;
}

function classifyGap(gap) {
  for (const [threshold, status] of GAP_THRESHOLDS) if (gap >= threshold) return status;
  return "Meets Requirement";
}

function classifyPriority(gap, importance) {
  const score = Math.round(gap * importance);
  for (const [threshold, level] of PRIORITY_THRESHOLDS) if (score >= threshold) return { score, level };
  return { score, level: "Low" };
}

function getAvailableRoles() {
  return Object.keys(jobRoleRequirements);
}

// CURRENT SKILL DETERMINATION RULE (documented per Step 7 instructions):
// manually declared skills (student_skills, Beginner/Intermediate/Advanced
// -> 40/60/85) are the baseline; the student's LATEST completed
// assessment's per-skill scores then override the declared value for
// any skill it covers. This is the exact rule js/engine.js's
// getCurrentSkillProfile() already used client-side
// (`{ ...declared, ...assessed }`) — preserved here rather than
// inventing a different priority rule. Declared skills are never
// modified by this — this only affects what this endpoint reports.
function getCurrentSkillProfile(userId) {
  const declared = {};
  for (const row of skillsDb.listByUserId(userId)) {
    const score = DECLARED_PROFICIENCY_SCORES[row.proficiency];
    if (score !== undefined) declared[canonicalSkillName(row.skill_name)] = score;
  }

  const assessed = {};
  const history = assessmentsDb.listByStudentUserId(userId); // ordered by completed_at DESC
  if (history.length > 0) {
    const latest = history[0];
    for (const r of assessmentsDb.getSkillResults(latest.id)) {
      assessed[canonicalSkillName(r.skill_name)] = r.score;
    }
  }

  return { profile: { ...declared, ...assessed }, declaredSkills: declared, assessedSkills: assessed };
}

function readinessScore(skillEntries) {
  if (!skillEntries.length) return 0;
  const contributions = skillEntries.map((s) => (s.requiredLevel > 0 ? Math.min((s.currentLevel / s.requiredLevel) * 100, 100) : 100));
  return Math.round(contributions.reduce((a, b) => a + b, 0) / contributions.length);
}

// Returns null if targetRole isn't a known role (no requirement data).
function calculateSkillGap(userId, targetRole) {
  const requirements = jobRoleRequirements[targetRole];
  if (!requirements) return null;

  const { profile, assessedSkills } = getCurrentSkillProfile(userId);

  const skills = [];
  let strongSkills = 0, gapSkills = 0, highPriorityGaps = 0;
  const priorityGaps = [];

  for (const [skillName, req] of Object.entries(requirements)) {
    const requiredLevel = req.required_score;
    const importance = req.importance !== undefined ? req.importance : 1.0;
    const hasAssessed = Object.prototype.hasOwnProperty.call(assessedSkills, skillName);
    const hasData = Object.prototype.hasOwnProperty.call(profile, skillName);
    const currentLevel = profile[skillName] || 0;
    const gap = Math.max(requiredLevel - currentLevel, 0);
    const severity = classifyGap(gap);
    const source = hasAssessed ? "assessment" : hasData ? "manual" : "none";

    if (severity === "Meets Requirement") strongSkills++;
    else {
      gapSkills++;
      const priority = classifyPriority(gap, importance);
      if (priority.level === "High") highPriorityGaps++;
      priorityGaps.push({ skillName, gap, priorityScore: priority.score, priorityLevel: priority.level });
    }

    skills.push({ skillName, currentLevel, requiredLevel, gap, severity, source });
  }

  priorityGaps.sort((a, b) => b.priorityScore - a.priorityScore);

  return {
    targetRole,
    readinessScore: readinessScore(skills),
    summary: { totalSkills: skills.length, strongSkills, gapSkills, highPriorityGaps },
    skills,
    priorityGaps,
  };
}

module.exports = {
  calculateSkillGap, getAvailableRoles, canonicalSkillName, getCurrentSkillProfile,
  classifyGap, DECLARED_PROFICIENCY_SCORES, jobRoleRequirements,
};
