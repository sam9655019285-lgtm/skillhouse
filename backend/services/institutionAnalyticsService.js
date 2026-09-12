/*
 * services/institutionAnalyticsService.js — Institution Analytics
 * (Step 12). Aggregate-only, deterministic, no ML. Reuses rather than
 * duplicates:
 *   - backend/services/skillGapService.js   (canonicalSkillName,
 *     getCurrentSkillProfile, classifyGap, DECLARED_PROFICIENCY_SCORES,
 *     jobRoleRequirements — Step 7's own logic/data)
 *   - backend/services/industryDemandService.js (Step 8's own demand
 *     calculation)
 *   - backend/data/skillAliases.json (via canonicalSkillName)
 *
 * Cross-student aggregate SQL is done directly against the shared
 * `db` connection (backend/db/database.js) rather than through the
 * per-user db/*.js modules, since those are intentionally scoped to
 * one user's own data — aggregating across every student is a
 * distinct, institution-only concern that those modules were never
 * meant to expose. No new tables, no new database.
 */

const { db } = require("../db/database");
const skillGapService = require("./skillGapService");
const industryDemandService = require("./industryDemandService");

function getStudentIds() {
  return db.prepare("SELECT id FROM users WHERE role = 'Student'").all().map((r) => r.id);
}

// The union of every skill any of the 6 defined job roles requires,
// each pinned to the HARDEST bar any role sets for it (max required_score
// across roles) — a single deterministic reference bar for aggregate
// gap analysis, reusing Step 7's own requirement data rather than
// inventing a separate one.
function buildRequiredSkillBar() {
  const bar = new Map();
  for (const requirements of Object.values(skillGapService.jobRoleRequirements)) {
    for (const [skill, req] of Object.entries(requirements)) {
      bar.set(skill, Math.max(bar.get(skill) || 0, req.required_score));
    }
  }
  return bar;
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

// ---- A. Student Overview ----
function computeStudentOverview() {
  const totalStudents = db.prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'Student'").get().c;
  const studentsWithProfiles = db.prepare("SELECT COUNT(DISTINCT user_id) AS c FROM student_profiles").get().c;
  const studentsWithSkills = db.prepare("SELECT COUNT(DISTINCT user_id) AS c FROM student_skills").get().c;
  const studentsWithAssessments = db.prepare("SELECT COUNT(DISTINCT student_user_id) AS c FROM assessments").get().c;
  const studentsWithProjects = db.prepare("SELECT COUNT(DISTINCT user_id) AS c FROM student_projects").get().c;
  return { totalStudents, studentsWithProfiles, studentsWithSkills, studentsWithAssessments, studentsWithProjects };
}

// ---- B. Skill Overview ----
function computeSkillOverview() {
  const rows = db.prepare("SELECT skill_name, proficiency FROM student_skills").all();
  const studentCountBySkill = new Map();
  const scoreSumBySkill = new Map();
  const scoreCountBySkill = new Map();
  const proficiencyDistribution = { Beginner: 0, Intermediate: 0, Advanced: 0 };

  for (const row of rows) {
    const canonical = skillGapService.canonicalSkillName(row.skill_name);
    studentCountBySkill.set(canonical, (studentCountBySkill.get(canonical) || 0) + 1);
    const score = skillGapService.DECLARED_PROFICIENCY_SCORES[row.proficiency];
    if (score !== undefined) {
      scoreSumBySkill.set(canonical, (scoreSumBySkill.get(canonical) || 0) + score);
      scoreCountBySkill.set(canonical, (scoreCountBySkill.get(canonical) || 0) + 1);
      proficiencyDistribution[row.proficiency] = (proficiencyDistribution[row.proficiency] || 0) + 1;
    }
  }

  const mostCommonSkills = [...studentCountBySkill.entries()]
    .sort((a, b) => b[1] - a[1]).slice(0, 10)
    .map(([skillName, studentCount]) => ({ skillName, studentCount }));

  const averageProficiencyBySkill = [...scoreSumBySkill.entries()]
    .map(([skillName, sum]) => ({ skillName, averageScore: Math.round(sum / scoreCountBySkill.get(skillName)) }))
    .sort((a, b) => b.averageScore - a.averageScore).slice(0, 10);

  // Top skill gaps across every tracked student, against the shared
  // requirement bar above — counts how many students have a Major or
  // Moderate gap in each skill, using Step 7's own classifyGap().
  const requiredBar = buildRequiredSkillBar();
  const affectedCount = new Map();
  const totalGapPoints = new Map();
  for (const userId of getStudentIds()) {
    const { profile } = skillGapService.getCurrentSkillProfile(userId);
    for (const [skill, requiredLevel] of requiredBar.entries()) {
      const current = profile[skill] || 0;
      const gap = Math.max(requiredLevel - current, 0);
      const severity = skillGapService.classifyGap(gap);
      if (severity === "Major Gap" || severity === "Moderate Gap") {
        affectedCount.set(skill, (affectedCount.get(skill) || 0) + 1);
        totalGapPoints.set(skill, (totalGapPoints.get(skill) || 0) + gap);
      }
    }
  }
  const topSkillGaps = [...affectedCount.entries()]
    .sort((a, b) => b[1] - a[1]).slice(0, 10)
    .map(([skillName, studentsAffected]) => ({ skillName, studentsAffected, totalGapPoints: totalGapPoints.get(skillName) }));

  return { mostCommonSkills, averageProficiencyBySkill, proficiencyDistribution, topSkillGaps };
}

// ---- C. Assessment Overview ----
function computeAssessmentOverview() {
  const summary = db.prepare("SELECT COUNT(*) AS c, AVG(score) AS avg FROM assessments").get();
  const completedAssessments = summary.c;
  const averageScore = summary.avg !== null ? Math.round(summary.avg) : null;

  const scoreDistribution = { "0-39": 0, "40-59": 0, "60-79": 0, "80-100": 0 };
  for (const row of db.prepare("SELECT score FROM assessments").all()) {
    if (row.score >= 80) scoreDistribution["80-100"]++;
    else if (row.score >= 60) scoreDistribution["60-79"]++;
    else if (row.score >= 40) scoreDistribution["40-59"]++;
    else scoreDistribution["0-39"]++;
  }

  const categoryPerformance = db.prepare(
    "SELECT skill_name, AVG(score) AS avg, COUNT(*) AS c FROM skill_assessment_results GROUP BY skill_name ORDER BY avg DESC"
  ).all().map((r) => ({ category: r.skill_name, averageScore: Math.round(r.avg), sampleCount: r.c }));

  return { completedAssessments, averageScore, scoreDistribution, categoryPerformance };
}

// ---- D. Industry Alignment (reuses Step 8 as-is) ----
async function computeIndustryAlignment() {
  const demandResult = await industryDemandService.getIndustrySkillDemand({});
  const totalStudents = getStudentIds().length;

  const coverageByCanonicalSkill = new Map();
  for (const row of db.prepare("SELECT DISTINCT user_id, skill_name FROM student_skills").all()) {
    const canonical = skillGapService.canonicalSkillName(row.skill_name);
    if (!coverageByCanonicalSkill.has(canonical)) coverageByCanonicalSkill.set(canonical, new Set());
    coverageByCanonicalSkill.get(canonical).add(row.user_id);
  }

  const alignmentRows = demandResult.skills.map((d) => {
    const coveredStudents = coverageByCanonicalSkill.has(d.skillName) ? coverageByCanonicalSkill.get(d.skillName).size : 0;
    const coveragePercent = totalStudents > 0 ? Math.round((coveredStudents / totalStudents) * 100) : 0;
    return { skillName: d.skillName, demandLevel: d.demandLevel, studentsWithSkill: coveredStudents, coveragePercent };
  });

  const highDemandSkills = alignmentRows.filter((r) => r.demandLevel === "High Demand").sort((a, b) => a.coveragePercent - b.coveragePercent);
  const highDemandLowCoverage = highDemandSkills.filter((r) => r.coveragePercent < 50);
  const overallAlignmentPercent = highDemandSkills.length
    ? Math.round(highDemandSkills.reduce((sum, r) => sum + r.coveragePercent, 0) / highDemandSkills.length)
    : null; // null (not 0) when there's no high-demand data to measure against — never fabricated

  return { highDemandSkills, highDemandLowCoverage, overallAlignmentPercent };
}

// ---- E. Opportunity Overview (reuses Step 9 tables as-is) ----
function computeOpportunityOverview() {
  const totalOpportunities = db.prepare("SELECT COUNT(*) AS c FROM opportunities").get().c;
  const activeOpportunities = db.prepare("SELECT COUNT(*) AS c FROM opportunities WHERE status = 'Active'").get().c;
  const opportunitiesByType = db.prepare("SELECT opportunity_type AS type, COUNT(*) AS c FROM opportunities GROUP BY opportunity_type")
    .all().map((r) => ({ type: r.type || "Not specified", count: r.c }));
  const opportunitiesByDomain = db.prepare("SELECT domain, COUNT(*) AS c FROM opportunities GROUP BY domain")
    .all().map((r) => ({ domain: r.domain || "Not specified", count: r.c }));

  const totalApplications = db.prepare("SELECT COUNT(*) AS c FROM applications").get().c;
  const applicationStatusDistribution = db.prepare("SELECT status, COUNT(*) AS c FROM applications GROUP BY status")
    .all().map((r) => ({ status: r.status, count: r.c }));

  const skillCounts = new Map();
  for (const row of db.prepare("SELECT required_skills, preferred_skills FROM opportunities").all()) {
    for (const skill of [...parseSkillsField(row.required_skills), ...parseSkillsField(row.preferred_skills)]) {
      const canonical = skillGapService.canonicalSkillName(skill);
      skillCounts.set(canonical, (skillCounts.get(canonical) || 0) + 1);
    }
  }
  const mostRequestedSkills = [...skillCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)
    .map(([skillName, count]) => ({ skillName, count }));

  return { totalOpportunities, activeOpportunities, opportunitiesByType, opportunitiesByDomain, totalApplications, applicationStatusDistribution, mostRequestedSkills };
}

// ---- F. Student Readiness ----
// DETERMINISTIC RULE (no ML/score fabrication) per student, using only
// real database evidence:
//   Ready              — has completed at least one assessment AND has
//                         zero "Major Gap" skills AND meets the
//                         requirement bar on 3+ skills.
//   Developing         — has at least one skill or assessment on record
//                         AND has between 1 and 3 "Major Gap" skills
//                         (inclusive) — some evidence, moderate gaps.
//   Needs Improvement  — everyone else: no skill/assessment evidence
//                         at all, or more than 3 "Major Gap" skills.
// "Major Gap"/"Meets Requirement" come from Step 7's own classifyGap(),
// against the same shared requirement bar used for topSkillGaps above.
function computeReadiness() {
  const requiredBar = buildRequiredSkillBar();
  const distribution = { Ready: 0, Developing: 0, "Needs Improvement": 0 };

  for (const userId of getStudentIds()) {
    const hasAssessment = db.prepare("SELECT COUNT(*) AS c FROM assessments WHERE student_user_id = ?").get(userId).c > 0;
    const hasSkills = db.prepare("SELECT COUNT(*) AS c FROM student_skills WHERE user_id = ?").get(userId).c > 0;
    const { profile } = skillGapService.getCurrentSkillProfile(userId);

    let majorGapCount = 0, metRequirementCount = 0;
    for (const [skill, requiredLevel] of requiredBar.entries()) {
      const current = profile[skill] || 0;
      const severity = skillGapService.classifyGap(Math.max(requiredLevel - current, 0));
      if (severity === "Major Gap") majorGapCount++;
      if (severity === "Meets Requirement") metRequirementCount++;
    }

    let level;
    if (hasAssessment && majorGapCount === 0 && metRequirementCount >= 3) level = "Ready";
    else if ((hasSkills || hasAssessment) && majorGapCount >= 1 && majorGapCount <= 3) level = "Developing";
    else level = "Needs Improvement";
    distribution[level]++;
  }

  return { distribution, totalClassified: getStudentIds().length };
}

async function getInstitutionAnalytics() {
  return {
    generatedAt: new Date().toISOString(),
    overview: computeStudentOverview(),
    skills: computeSkillOverview(),
    assessments: computeAssessmentOverview(),
    industryAlignment: await computeIndustryAlignment(),
    opportunities: computeOpportunityOverview(),
    readiness: computeReadiness(),
  };
}

module.exports = { getInstitutionAnalytics };
