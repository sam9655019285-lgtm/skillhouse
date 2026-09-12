/*
 * services/industryDemandService.js — Industry Skill Demand Analytics.
 *
 * Reuses the existing job pipeline end to end rather than duplicating
 * it:
 *   backend/services/jobDataService.js  — provider fallback + caching
 *     (mock/LinkedIn/Job Market API — see providerChain()), already
 *     caches via backend/services/cacheService.js, so this service
 *     adds no second cache.
 *   jobDataService.computeSkillDemand() — already counts skill
 *     occurrences across normalized jobs AND already normalizes skill
 *     names via backend/data/skillAliases.json (canonicalSkill()) —
 *     reused as-is, not reimplemented here.
 *
 * This module only adds two things on top of that existing count:
 *   1. A demand-level label, using the exact count thresholds already
 *      used client-side in js/live-industry.js (line ~168) and
 *      js/app-student.js (industryDemandLevel): >=4 High, >=2 Medium,
 *      >=1 Low. Reused rather than inventing new thresholds.
 *   2. Related job roles per skill, from
 *      backend/data/jobRoleRequirements.json (the same required-skill
 *      config Step 7's Skill-Gap engine already uses) — not fabricated
 *      from free-text job titles, which have no reliable mapping to
 *      the project's 6 defined roles.
 */

const jobDataService = require("./jobDataService");
const jobRoleRequirements = require("../data/jobRoleRequirements.json");

function classifyDemandLevel(count) {
  if (count >= 4) return "High Demand";
  if (count >= 2) return "Medium Demand";
  if (count >= 1) return "Low Demand";
  return "No Demand";
}

function relatedRolesForSkill(skillName) {
  const roles = [];
  for (const [role, requirements] of Object.entries(jobRoleRequirements)) {
    if (Object.prototype.hasOwnProperty.call(requirements, skillName)) roles.push(role);
  }
  return roles;
}

async function getIndustrySkillDemand({ userId = null, forceRefresh = false } = {}) {
  const { jobs, source, refreshStatus, fetchedAt } = await jobDataService.getJobs({ userId, forceRefresh });
  const demand = jobDataService.computeSkillDemand(jobs); // [{skill, count, demandPercent}] — already alias-normalized & sorted desc

  const skills = demand.map((d) => ({
    skillName: d.skill,
    demandCount: d.count,
    demandPercentage: d.demandPercent,
    demandLevel: classifyDemandLevel(d.count),
    relatedRoles: relatedRolesForSkill(d.skill),
  }));

  return {
    generatedAt: new Date().toISOString(),
    totalJobsAnalyzed: jobs.length,
    skills,
    meta: { source, refreshStatus, fetchedAt },
  };
}

module.exports = { getIndustrySkillDemand, classifyDemandLevel, relatedRolesForSkill };
