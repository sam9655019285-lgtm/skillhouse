/*
 * services/learningRecommendationService.js — Personalized Learning
 * Recommendations (Step 11). Combines, without duplicating any of
 * them:
 *   - Step 7 skillGapService (student_skills + latest assessment,
 *     role-based gap severity — reused verbatim)
 *   - Step 8 industryDemandService (live job-market skill demand —
 *     reused verbatim)
 *   - backend/data/learningResources.json (the existing 28-resource
 *     catalog from js/data.js DATA.LEARNING_RESOURCES, mirrored with
 *     only the fields needed for matching/display — not a new catalog)
 *   - backend/data/skillAliases.json (via skillGapService.canonicalSkillName)
 *
 * Priority rules (documented per your instruction — no existing
 * system combines skill-gap severity with industry demand, so this
 * is new logic, using the exact table you specified):
 *   Major gap    + High/Medium demand  -> High
 *   Major gap    + Low/No demand       -> Medium
 *   Moderate gap + High demand         -> High
 *   Moderate gap + Medium demand       -> Medium
 *   Moderate gap + Low/No demand       -> Low
 *   Minor gap    + any demand          -> Low
 * "Meets Requirement" skills are never recommended (see TEST 3).
 */

const skillGapService = require("./skillGapService");
const industryDemandService = require("./industryDemandService");
const opportunitiesDb = require("../db/opportunities");
const learningResources = require("../data/learningResources.json");

const MAX_RESOURCES_PER_SKILL = 3;
// Same "weak skill" bar Step 10 already established (below the
// existing declared-proficiency "Intermediate" value of 60) — reused
// here for the opportunity-context path, which has no per-skill
// required_score to compute a real numeric gap against.
const WEAK_SKILL_THRESHOLD = 60;

function canonicalSkillName(name) {
  return skillGapService.canonicalSkillName(name);
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

function demandLevelFor(skillName, demandBySkill) {
  const canonical = canonicalSkillName(skillName);
  const entry = demandBySkill.get(canonical);
  return entry ? entry.demandLevel : "No Demand";
}

function priorityFor(gapSeverity, demandLevel) {
  const highDemand = demandLevel === "High Demand";
  const mediumDemand = demandLevel === "Medium Demand";
  if (gapSeverity === "Major Gap") return highDemand || mediumDemand ? "High" : "Medium";
  if (gapSeverity === "Moderate Gap") {
    if (highDemand) return "High";
    if (mediumDemand) return "Medium";
    return "Low";
  }
  return "Low"; // Minor Gap
}

function resourcesForSkill(skillName) {
  const canonical = canonicalSkillName(skillName);
  return learningResources
    .filter((r) => r.skills.some((s) => canonicalSkillName(s) === canonical))
    .slice(0, MAX_RESOURCES_PER_SKILL)
    .map((r) => ({ id: r.id, title: r.title, level: r.level, duration: r.duration, resourceType: r.resourceType, url: r.url }));
}

function reasonFor(gapSeverity, demandLevel) {
  const gapText = gapSeverity === "Major Gap" ? "Major skill gap" : gapSeverity === "Moderate Gap" ? "Moderate skill gap" : "Minor skill gap";
  return demandLevel !== "No Demand" ? `${gapText} + ${demandLevel} in the current job market.` : `${gapText}.`;
}

function priorityRank(p) { return p === "High" ? 3 : p === "Medium" ? 2 : 1; }

function buildDemandLookup(userId) {
  return industryDemandService.getIndustrySkillDemand({ userId }).then((result) => {
    const map = new Map();
    for (const s of result.skills) map.set(s.skillName, s);
    return map;
  });
}

// Role-based path: reuses Step 7's calculateSkillGap() result directly
// — no second gap algorithm. Skips "Meets Requirement" skills.
function roleBasedCandidates(userId, targetRole) {
  const gapResult = skillGapService.calculateSkillGap(userId, targetRole);
  if (!gapResult) return [];
  return gapResult.skills
    .filter((s) => s.severity !== "Meets Requirement")
    .map((s) => ({ skillName: s.skillName, gap: s.gap, gapSeverity: s.severity }));
}

// Opportunity-context path: opportunities have no per-skill required
// proficiency (just a flat skill list — see backend/db/opportunities.js),
// so severity here is presence-based rather than numeric: a required
// skill the student doesn't have at all is "Major Gap"; one they have
// but below the existing weak-skill bar is "Moderate Gap"; a missing
// preferred skill is "Minor Gap" (lower priority than a missing
// required skill). Never recommends skills the opportunity doesn't ask for.
function opportunityBasedCandidates(userId, opportunityId) {
  const row = opportunitiesDb.findById(opportunityId);
  if (!row) return null; // caller distinguishes null (not found) from [] (no gaps)
  const required = parseSkillsField(row.required_skills);
  const preferred = parseSkillsField(row.preferred_skills);
  const { profile } = skillGapService.getCurrentSkillProfile(userId);

  const candidates = [];
  const seen = new Set();
  const consider = (skillName, isRequired) => {
    const canonical = canonicalSkillName(skillName);
    if (seen.has(canonical)) return;
    seen.add(canonical);
    const currentLevel = profile[canonical];
    if (currentLevel === undefined) {
      candidates.push({ skillName, gap: null, gapSeverity: isRequired ? "Major Gap" : "Minor Gap" });
    } else if (currentLevel < WEAK_SKILL_THRESHOLD) {
      candidates.push({ skillName, gap: WEAK_SKILL_THRESHOLD - currentLevel, gapSeverity: "Moderate Gap" });
    } // else the student already meets this skill — no recommendation (TEST 3)
  };
  required.forEach((s) => consider(s, true));
  preferred.forEach((s) => consider(s, false));
  return candidates;
}

// Fallback path used when neither role nor opportunityId is given:
// the student's own existing skill gaps (against the same default
// role Step 7/10 already fall back to) plus whatever industry demand
// is available — never forces a role selection.
function defaultCandidates(userId) {
  const availableRoles = skillGapService.getAvailableRoles();
  if (!availableRoles.length) return { targetRole: null, candidates: [] };
  const targetRole = availableRoles[0];
  return { targetRole, candidates: roleBasedCandidates(userId, targetRole) };
}

async function getRecommendations(userId, { role, opportunityId } = {}) {
  let targetRole = null;
  let candidates;
  let opportunityNotFound = false;

  if (opportunityId) {
    candidates = opportunityBasedCandidates(userId, opportunityId);
    if (candidates === null) { opportunityNotFound = true; candidates = []; }
  } else if (role && skillGapService.getAvailableRoles().includes(role)) {
    targetRole = role;
    candidates = roleBasedCandidates(userId, role);
  } else {
    const fallback = defaultCandidates(userId);
    targetRole = fallback.targetRole;
    candidates = fallback.candidates;
  }

  const demandBySkill = await buildDemandLookup(userId);

  const recommendations = candidates.map((c) => {
    const demandLevel = demandLevelFor(c.skillName, demandBySkill);
    const priority = priorityFor(c.gapSeverity, demandLevel);
    return {
      skillName: c.skillName,
      priority,
      reason: reasonFor(c.gapSeverity, demandLevel),
      gap: c.gap,
      gapSeverity: c.gapSeverity,
      industryDemand: demandLevel,
      resources: resourcesForSkill(c.skillName),
    };
  });

  recommendations.sort((a, b) => priorityRank(b.priority) - priorityRank(a.priority) || (b.gap || 0) - (a.gap || 0));

  return { targetRole, opportunityId: opportunityId || null, opportunityNotFound, recommendations };
}

module.exports = { getRecommendations };
