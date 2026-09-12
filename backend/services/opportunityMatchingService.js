/*
 * services/opportunityMatchingService.js — Smart Opportunity Matching
 * Engine (Step 10). A backend-authoritative port of js/engine.js's
 * `Matcher` module (Phase 7) — that IS the project's existing matching
 * logic (weights required_skill=0.50, preferred_skill=0.10,
 * role_relevance=0.25, skill_gap_relevance=0.15; match categories
 * "Excellent Match" >=80, "Strong Match" >=65, "Moderate Match" >=50,
 * else "Low Match"). Reused verbatim rather than the task's suggested
 * 50/25/15/10 breakdown, per the instruction to check for and reuse
 * an existing weighting/threshold system before inventing a new one.
 *
 * Inputs are all authoritative, never trusted from the client:
 *   - backend/services/skillGapService.js  getCurrentSkillProfile()
 *     (student_skills + latest assessment, same declared-then-assessed
 *     -override rule as Step 7 — not duplicated here)
 *   - backend/services/skillGapService.js  calculateSkillGap()
 *     (Step 7's own gap engine, reused for the skill-gap-relevance
 *     component and for explaining missing/weak skills)
 *   - backend/db/opportunities.js          the opportunity's own
 *     required_skills / preferred_skills / domain
 *   - backend/data/skillAliases.json (via skillGapService.canonicalSkillName)
 *   - backend/data/roleDomainRelevance.json (mirrors js/data.js
 *     DATA.ROLE_DOMAIN_RELEVANCE and engine.js Matcher.ROLE_PRIMARY_DOMAIN)
 */

const skillGapService = require("./skillGapService");
const roleDomainRelevance = require("../data/roleDomainRelevance.json");

const MATCH_WEIGHTS = { requiredSkill: 0.50, preferredSkill: 0.10, roleRelevance: 0.25, skillGapRelevance: 0.15 };
const ROLE_RELEVANCE_SCORE = { High: 100, Medium: 60, Low: 20, "Not Set": 0 };
const SKILL_GAP_RELEVANCE_THRESHOLDS = [[66, "High"], [33, "Medium"], [1, "Low"], [0, "None"]];
const SKILL_GAP_RELEVANCE_FALLBACK_SCORE = 50;
const MATCH_CATEGORY_THRESHOLDS = [[80, "Excellent Match"], [65, "Strong Match"], [50, "Moderate Match"], [0, "Low Match"]];
// Below this current-proficiency score, a "matched" skill is reported
// as weak rather than solid — reusing the existing declared-proficiency
// scale's "Intermediate" boundary (js/data.js DATA.DECLARED_PROFICIENCY_SCORES.Intermediate = 60)
// rather than inventing a new cutoff.
const WEAK_SKILL_THRESHOLD = 60;

function canonicalSkillName(name) {
  return skillGapService.canonicalSkillName(name);
}

function calculateRequiredSkillAlignment(currentProfile, requiredSkills) {
  if (!requiredSkills.length) return { score: 100, matchedCount: 0, total: 0 };
  let matchedCount = 0, totalProficiency = 0;
  for (const skill of requiredSkills) {
    const canonical = canonicalSkillName(skill);
    const proficiency = currentProfile[canonical] || 0;
    totalProficiency += proficiency;
    if (Object.prototype.hasOwnProperty.call(currentProfile, canonical)) matchedCount++;
  }
  return { score: Math.round(totalProficiency / requiredSkills.length), matchedCount, total: requiredSkills.length };
}

function calculatePreferredSkillAlignment(currentProfile, preferredSkills) {
  if (!preferredSkills.length) return { score: 100, matchedCount: 0, total: 0 };
  const matchedCount = preferredSkills.filter((s) => Object.prototype.hasOwnProperty.call(currentProfile, canonicalSkillName(s))).length;
  return { score: Math.round((matchedCount / preferredSkills.length) * 100), matchedCount, total: preferredSkills.length };
}

function calculateRoleRelevance(targetRole, opportunityDomain) {
  if (!targetRole) return { level: "Not Set", score: ROLE_RELEVANCE_SCORE["Not Set"] };
  const primaryDomain = roleDomainRelevance.primaryDomain[targetRole];
  const relatedDomains = roleDomainRelevance.relatedDomains[targetRole] || [];
  let level;
  if (opportunityDomain && opportunityDomain === primaryDomain) level = "High";
  else if (opportunityDomain && relatedDomains.includes(opportunityDomain)) level = "Medium";
  else level = "Low";
  return { level, score: ROLE_RELEVANCE_SCORE[level] };
}

function classifySkillGapRelevance(score) {
  for (const [threshold, level] of SKILL_GAP_RELEVANCE_THRESHOLDS) if (score >= threshold) return level;
  return "None";
}

function calculateSkillGapRelevance(requiredSkills, skillGapNames) {
  if (!skillGapNames.length) {
    return { level: "Not Available", score: SKILL_GAP_RELEVANCE_FALLBACK_SCORE, matchedGaps: [], coverageText: "N/A" };
  }
  const canonicalRequired = new Set(requiredSkills.map((s) => canonicalSkillName(s)));
  const matchedGaps = skillGapNames.filter((g) => canonicalRequired.has(g));
  const score = Math.round((matchedGaps.length / skillGapNames.length) * 100);
  return { level: classifySkillGapRelevance(score), score, matchedGaps, coverageText: `${matchedGaps.length}/${skillGapNames.length}` };
}

function getMatchCategory(score) {
  for (const [threshold, category] of MATCH_CATEGORY_THRESHOLDS) if (score >= threshold) return category;
  return "Low Match";
}

// Classifies each required skill into matched / weak / missing, and
// each preferred skill into matched or not — this is what the student
// actually sees in the response (matchedSkills/missingSkills/weakSkills),
// separate from (but consistent with) the weighted score above.
function classifySkillLists(currentProfile, requiredSkills, preferredSkills) {
  const matchedSkills = [], weakSkills = [], missingSkills = [];
  for (const skill of requiredSkills) {
    const canonical = canonicalSkillName(skill);
    if (!Object.prototype.hasOwnProperty.call(currentProfile, canonical)) { missingSkills.push(skill); continue; }
    if (currentProfile[canonical] < WEAK_SKILL_THRESHOLD) weakSkills.push(skill);
    else matchedSkills.push(skill);
  }
  const preferredSkillsMatched = preferredSkills.filter((s) => Object.prototype.hasOwnProperty.call(currentProfile, canonicalSkillName(s)));
  return { matchedSkills, weakSkills, missingSkills, preferredSkillsMatched };
}

function generateReasons(opportunity, requiredResult, preferredResult, roleResult, skillGapResult) {
  const reasons = [];
  if (requiredResult.total > 0) {
    if (requiredResult.matchedCount === requiredResult.total) reasons.push("All required skills match");
    else if (requiredResult.matchedCount > 0) reasons.push(`${requiredResult.matchedCount}/${requiredResult.total} required skills match`);
  } else {
    reasons.push("This opportunity lists no required skills, so skill coverage can't be strongly assessed.");
  }
  if (roleResult.level === "High") reasons.push(`Target role matches this opportunity's domain (${opportunity.domain || "not specified"})`);
  else if (roleResult.level === "Medium") reasons.push(`Opportunity domain (${opportunity.domain || "not specified"}) is related to your target role`);
  if (skillGapResult.matchedGaps.length) {
    const n = skillGapResult.matchedGaps.length;
    reasons.push(n === 1 ? `Addresses your ${skillGapResult.matchedGaps[0]} skill gap` : `Addresses ${n} of your skill gaps: ${skillGapResult.matchedGaps.join(", ")}`);
  }
  if (preferredResult.total > 0 && preferredResult.matchedCount > 0) reasons.push(`${preferredResult.matchedCount}/${preferredResult.total} preferred skills match`);
  if (!reasons.length) reasons.push("Limited alignment with your current profile — still worth reviewing the full details.");
  return reasons;
}

// Informational only (see explanation.assessmentScore) — the average
// of the student's latest-assessment scores for whichever required
// skills actually came from that assessment (Step 7's `source` field).
// Not a separately weighted component: assessment scores already feed
// into currentProfile via getCurrentSkillProfile's declared-then-
// assessed-override rule, so weighting it again would double-count it.
function computeAssessmentScoreInfo(assessedSkills, requiredSkills) {
  const scores = [];
  for (const skill of requiredSkills) {
    const canonical = canonicalSkillName(skill);
    if (Object.prototype.hasOwnProperty.call(assessedSkills, canonical)) scores.push(assessedSkills[canonical]);
  }
  if (!scores.length) return null; // no assessment data available for this opportunity's skills
  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
}

// Computes the match for one opportunity given an already-fetched
// profile/skillGapNames (see calculateMatches below, which fetches
// the student's profile and skill-gap once and reuses it across every
// opportunity, rather than re-querying the database per opportunity).
function calculateMatchWithProfile(profile, assessedSkills, skillGapNames, opportunity, targetRole) {
  const requiredSkills = opportunity.requiredSkills || [];
  const preferredSkills = opportunity.preferredSkills || [];

  const requiredResult = calculateRequiredSkillAlignment(profile, requiredSkills);
  const preferredResult = calculatePreferredSkillAlignment(profile, preferredSkills);
  const roleResult = calculateRoleRelevance(targetRole, opportunity.domain);
  const skillGapResult = calculateSkillGapRelevance(requiredSkills, skillGapNames);

  const overallScore = Math.round(
    requiredResult.score * MATCH_WEIGHTS.requiredSkill +
    preferredResult.score * MATCH_WEIGHTS.preferredSkill +
    roleResult.score * MATCH_WEIGHTS.roleRelevance +
    skillGapResult.score * MATCH_WEIGHTS.skillGapRelevance
  );
  const matchScore = Math.max(0, Math.min(100, overallScore));

  const { matchedSkills, weakSkills, missingSkills, preferredSkillsMatched } = classifySkillLists(profile, requiredSkills, preferredSkills);
  const assessmentScore = computeAssessmentScoreInfo(assessedSkills, requiredSkills);
  const reasons = generateReasons(opportunity, requiredResult, preferredResult, roleResult, skillGapResult);

  return {
    opportunityId: opportunity.id,
    matchScore,
    matchLevel: getMatchCategory(matchScore),
    matchedSkills,
    missingSkills,
    weakSkills,
    preferredSkillsMatched,
    explanation: {
      requiredSkillCoverage: requiredResult.total > 0 ? Math.round((requiredResult.matchedCount / requiredResult.total) * 100) : 100,
      proficiencyScore: requiredResult.score,
      assessmentScore,
      assessmentAvailable: assessmentScore !== null,
      preferredSkillScore: preferredResult.score,
      roleRelevance: roleResult,
      skillGapRelevance: { level: skillGapResult.level, score: skillGapResult.score, coverage: skillGapResult.coverageText },
      reasons,
    },
    targetRoleUsed: targetRole || null,
  };
}

// opportunity: {id, domain, requiredSkills, preferredSkills} — already
// parsed to arrays by the caller (see routes/opportunityMatching.js).
function calculateMatch(userId, opportunity, targetRole) {
  const { profile, assessedSkills } = skillGapService.getCurrentSkillProfile(userId);
  let skillGapNames = [];
  if (targetRole) {
    const gapResult = skillGapService.calculateSkillGap(userId, targetRole);
    if (gapResult) skillGapNames = gapResult.priorityGaps.map((g) => g.skillName);
  }
  return calculateMatchWithProfile(profile, assessedSkills, skillGapNames, opportunity, targetRole);
}

// Batch version for the optional ranked-list endpoint — fetches the
// student's profile and skill-gap ONCE, then reuses it across every
// opportunity, instead of re-querying the database per opportunity.
function calculateMatches(userId, opportunityList, targetRole) {
  const { profile, assessedSkills } = skillGapService.getCurrentSkillProfile(userId);
  let skillGapNames = [];
  if (targetRole) {
    const gapResult = skillGapService.calculateSkillGap(userId, targetRole);
    if (gapResult) skillGapNames = gapResult.priorityGaps.map((g) => g.skillName);
  }
  return opportunityList
    .map((opportunity) => calculateMatchWithProfile(profile, assessedSkills, skillGapNames, opportunity, targetRole))
    .sort((a, b) => b.matchScore - a.matchScore);
}

module.exports = { calculateMatch, calculateMatches, getMatchCategory, calculateRequiredSkillAlignment, calculatePreferredSkillAlignment };
