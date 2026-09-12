/*
 * services/academicianAnalyticsService.js — Academician/Faculty
 * Analytics (Step 13). Aggregate-only, deterministic, no ML. Mirrors
 * the structure of Step 12's institutionAnalyticsService.js (same
 * reuse-not-duplicate approach) but adds:
 *   - explicit Major/Moderate/Minor gap severity counts (not just a
 *     top-N list)
 *   - weakest/strongest assessment categories
 *   - deterministic "Faculty Action Insights" text, generated only
 *     from the actual computed numbers below (no LLM)
 *   - an optional `department` filter (see DEPARTMENT SUPPORT note)
 *
 * Reuses rather than duplicates:
 *   - backend/services/skillGapService.js   (Step 7)
 *   - backend/services/industryDemandService.js (Step 8)
 *
 * DEPARTMENT SUPPORT: backend/db/database.js's `student_profiles`
 * table has a real `department` column (Step 3), populated whenever a
 * student saves their profile via the existing Department dropdown
 * (js/data.js/Departments.DEPARTMENTS on the frontend) — so filtering
 * by it is reliable rather than invented. Not every student has saved
 * a profile yet, so `department`-filtered analytics only ever cover
 * students who have. No schema change was made for this.
 */

const { db } = require("../db/database");
const skillGapService = require("./skillGapService");
const industryDemandService = require("./industryDemandService");

function getStudentIds(department) {
  if (department) {
    return db.prepare(
      `SELECT u.id FROM users u
       JOIN student_profiles p ON p.user_id = u.id
       WHERE u.role = 'Student' AND p.department = ?`
    ).all(department).map((r) => r.id);
  }
  return db.prepare("SELECT id FROM users WHERE role = 'Student'").all().map((r) => r.id);
}

// Same shared "hardest bar" concept as Step 12 — the union of every
// skill any of the 6 defined job roles requires, pinned to the highest
// required_score any role sets for it.
function buildRequiredSkillBar() {
  const bar = new Map();
  for (const requirements of Object.values(skillGapService.jobRoleRequirements)) {
    for (const [skill, req] of Object.entries(requirements)) {
      bar.set(skill, Math.max(bar.get(skill) || 0, req.required_score));
    }
  }
  return bar;
}

function inClause(ids) {
  return ids.length ? ids.map(() => "?").join(",") : "NULL"; // "NULL" makes an empty IN-list match nothing, never everything
}

// ---- A. Student Development Overview ----
function computeOverview(studentIds) {
  const totalStudents = studentIds.length;
  if (!totalStudents) return { totalStudents: 0, studentsWithProfiles: 0, studentsWithSkills: 0, studentsWithAssessments: 0, studentsWithProjects: 0 };
  const placeholders = inClause(studentIds);
  const studentsWithProfiles = db.prepare(`SELECT COUNT(DISTINCT user_id) AS c FROM student_profiles WHERE user_id IN (${placeholders})`).get(...studentIds).c;
  const studentsWithSkills = db.prepare(`SELECT COUNT(DISTINCT user_id) AS c FROM student_skills WHERE user_id IN (${placeholders})`).get(...studentIds).c;
  const studentsWithAssessments = db.prepare(`SELECT COUNT(DISTINCT student_user_id) AS c FROM assessments WHERE student_user_id IN (${placeholders})`).get(...studentIds).c;
  const studentsWithProjects = db.prepare(`SELECT COUNT(DISTINCT user_id) AS c FROM student_projects WHERE user_id IN (${placeholders})`).get(...studentIds).c;
  return { totalStudents, studentsWithProfiles, studentsWithSkills, studentsWithAssessments, studentsWithProjects };
}

// ---- B. Skill Development ----
function computeSkillDevelopment(studentIds) {
  if (!studentIds.length) {
    return { mostCommonSkills: [], averageProficiencyBySkill: [], proficiencyDistribution: { Beginner: 0, Intermediate: 0, Advanced: 0 }, importantSkillLevels: [] };
  }
  const placeholders = inClause(studentIds);
  const rows = db.prepare(`SELECT skill_name, proficiency FROM student_skills WHERE user_id IN (${placeholders})`).all(...studentIds);

  const studentCountBySkill = new Map();
  const scoreSumBySkill = new Map();
  const scoreCountBySkill = new Map();
  const levelCountBySkill = new Map(); // skill -> {Beginner,Intermediate,Advanced}
  const proficiencyDistribution = { Beginner: 0, Intermediate: 0, Advanced: 0 };

  for (const row of rows) {
    const canonical = skillGapService.canonicalSkillName(row.skill_name);
    studentCountBySkill.set(canonical, (studentCountBySkill.get(canonical) || 0) + 1);
    const score = skillGapService.DECLARED_PROFICIENCY_SCORES[row.proficiency];
    if (score !== undefined) {
      scoreSumBySkill.set(canonical, (scoreSumBySkill.get(canonical) || 0) + score);
      scoreCountBySkill.set(canonical, (scoreCountBySkill.get(canonical) || 0) + 1);
      proficiencyDistribution[row.proficiency] = (proficiencyDistribution[row.proficiency] || 0) + 1;
      if (!levelCountBySkill.has(canonical)) levelCountBySkill.set(canonical, { Beginner: 0, Intermediate: 0, Advanced: 0 });
      levelCountBySkill.get(canonical)[row.proficiency]++;
    }
  }

  const mostCommonSkills = [...studentCountBySkill.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)
    .map(([skillName, studentCount]) => ({ skillName, studentCount }));

  const averageProficiencyBySkill = [...scoreSumBySkill.entries()]
    .map(([skillName, sum]) => ({ skillName, averageScore: Math.round(sum / scoreCountBySkill.get(skillName)) }))
    .sort((a, b) => b.averageScore - a.averageScore).slice(0, 10);

  // "Important" skills = the ones most students actually declared —
  // showing their Beginner/Intermediate/Advanced split, per your ask
  // for "number of students at each level for important skills".
  const importantSkillLevels = mostCommonSkills.slice(0, 6).map(({ skillName }) => ({ skillName, levels: levelCountBySkill.get(skillName) }));

  return { mostCommonSkills, averageProficiencyBySkill, proficiencyDistribution, importantSkillLevels };
}

// ---- C. Assessment Performance ----
function computeAssessmentPerformance(studentIds) {
  if (!studentIds.length) {
    return { participation: { studentsAssessed: 0, totalStudents: 0, participationPercent: 0 }, averageScore: null, scoreDistribution: { "0-39": 0, "40-59": 0, "60-79": 0, "80-100": 0 }, weakestCategories: [], strongestCategories: [] };
  }
  const placeholders = inClause(studentIds);
  const studentsAssessed = db.prepare(`SELECT COUNT(DISTINCT student_user_id) AS c FROM assessments WHERE student_user_id IN (${placeholders})`).get(...studentIds).c;
  const participationPercent = Math.round((studentsAssessed / studentIds.length) * 100);

  const summary = db.prepare(`SELECT AVG(score) AS avg FROM assessments WHERE student_user_id IN (${placeholders})`).get(...studentIds);
  const averageScore = summary.avg !== null ? Math.round(summary.avg) : null;

  const scoreDistribution = { "0-39": 0, "40-59": 0, "60-79": 0, "80-100": 0 };
  for (const row of db.prepare(`SELECT score FROM assessments WHERE student_user_id IN (${placeholders})`).all(...studentIds)) {
    if (row.score >= 80) scoreDistribution["80-100"]++;
    else if (row.score >= 60) scoreDistribution["60-79"]++;
    else if (row.score >= 40) scoreDistribution["40-59"]++;
    else scoreDistribution["0-39"]++;
  }

  const categoryPerformance = db.prepare(
    `SELECT r.skill_name AS category, AVG(r.score) AS avg, COUNT(*) AS c
     FROM skill_assessment_results r
     JOIN assessments a ON a.id = r.assessment_id
     WHERE a.student_user_id IN (${placeholders})
     GROUP BY r.skill_name ORDER BY avg ASC`
  ).all(...studentIds).map((r) => ({ category: r.category, averageScore: Math.round(r.avg), sampleCount: r.c }));

  return {
    participation: { studentsAssessed, totalStudents: studentIds.length, participationPercent },
    averageScore,
    scoreDistribution,
    weakestCategories: categoryPerformance.slice(0, 5),
    strongestCategories: [...categoryPerformance].reverse().slice(0, 5),
  };
}

// ---- D. Skill-Gap Support (reuses Step 7 as-is) ----
function computeSkillGapSupport(studentIds) {
  const requiredBar = buildRequiredSkillBar();
  const severityCounts = { "Major Gap": 0, "Moderate Gap": 0, "Minor Gap": 0 };
  const affectedCount = new Map();
  const totalGapPoints = new Map();

  for (const userId of studentIds) {
    const { profile } = skillGapService.getCurrentSkillProfile(userId);
    for (const [skill, requiredLevel] of requiredBar.entries()) {
      const current = profile[skill] || 0;
      const gap = Math.max(requiredLevel - current, 0);
      const severity = skillGapService.classifyGap(gap);
      if (severity === "Meets Requirement") continue;
      severityCounts[severity]++;
      affectedCount.set(skill, (affectedCount.get(skill) || 0) + 1);
      totalGapPoints.set(skill, (totalGapPoints.get(skill) || 0) + gap);
    }
  }

  const mostAffectedSkills = [...affectedCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)
    .map(([skillName, studentsAffected]) => ({ skillName, studentsAffected, totalGapPoints: totalGapPoints.get(skillName) }));

  return { severityCounts, mostAffectedSkills };
}

// ---- E. Industry Alignment (reuses Step 8 as-is) ----
async function computeIndustryAlignment(studentIds) {
  const demandResult = await industryDemandService.getIndustrySkillDemand({});
  const totalStudents = studentIds.length;

  const coverageByCanonicalSkill = new Map();
  if (totalStudents) {
    const placeholders = inClause(studentIds);
    for (const row of db.prepare(`SELECT DISTINCT user_id, skill_name FROM student_skills WHERE user_id IN (${placeholders})`).all(...studentIds)) {
      const canonical = skillGapService.canonicalSkillName(row.skill_name);
      if (!coverageByCanonicalSkill.has(canonical)) coverageByCanonicalSkill.set(canonical, new Set());
      coverageByCanonicalSkill.get(canonical).add(row.user_id);
    }
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
    : null;

  return { highDemandSkills, highDemandLowCoverage, overallAlignmentPercent };
}

// ---- F. Faculty Action Insights — deterministic text from the exact
// numbers computed above; no LLM, no invented claims. Skipped entirely
// (rather than fabricated) when there isn't enough real data to say
// something meaningful.
function buildInsights({ overview, skillDevelopment, assessmentPerformance, skillGapSupport, industryAlignment }) {
  const insights = [];

  if (overview.totalStudents > 0) {
    const pct = Math.round((overview.studentsWithAssessments / overview.totalStudents) * 100);
    insights.push(`Only ${pct}% of students have completed an assessment (${overview.studentsWithAssessments}/${overview.totalStudents}).`);
  }

  if (skillDevelopment.mostCommonSkills.length) {
    const top = skillDevelopment.mostCommonSkills[0];
    insights.push(`${top.skillName} is the most common student skill (${top.studentCount} student(s)).`);
  }

  if (skillGapSupport.mostAffectedSkills.length) {
    const top = skillGapSupport.mostAffectedSkills[0];
    insights.push(`Many students have a major/moderate gap in ${top.skillName} (${top.studentsAffected} student(s) affected).`);
  }

  if (industryAlignment.highDemandLowCoverage.length) {
    const top = industryAlignment.highDemandLowCoverage[0];
    insights.push(`${top.skillName} is highly demanded by industry but only ${top.coveragePercent}% of students have it.`);
  }

  if (assessmentPerformance.weakestCategories.length) {
    const weakest = assessmentPerformance.weakestCategories[0];
    insights.push(`Assessment performance is weakest in ${weakest.category} (average ${weakest.averageScore}%).`);
  }

  return insights.slice(0, 5);
}

async function getAcademicianAnalytics({ department = null } = {}) {
  const studentIds = getStudentIds(department);
  const overview = computeOverview(studentIds);
  const skillDevelopment = computeSkillDevelopment(studentIds);
  const assessmentPerformance = computeAssessmentPerformance(studentIds);
  const skillGapSupport = computeSkillGapSupport(studentIds);
  const industryAlignment = await computeIndustryAlignment(studentIds);
  const insights = buildInsights({ overview, skillDevelopment, assessmentPerformance, skillGapSupport, industryAlignment });

  return {
    generatedAt: new Date().toISOString(),
    department: department || null,
    overview,
    skills: skillDevelopment,
    assessments: assessmentPerformance,
    skillGaps: skillGapSupport,
    industryAlignment,
    insights,
  };
}

module.exports = { getAcademicianAnalytics };
