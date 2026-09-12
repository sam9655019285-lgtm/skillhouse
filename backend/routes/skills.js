/*
 * routes/skills.js — Phase 13 spec points 12-13.
 *   GET /api/skills/demand
 *   GET /api/skills/aliases
 */

const jobDataService = require("../services/jobDataService");
const skillAliases = require("../data/skillAliases.json");

async function getDemand(req, res, ctx) {
  try {
    const { jobs, source, refreshStatus, fetchedAt } = await jobDataService.getJobs({});
    const demand = jobDataService.computeSkillDemand(jobs);
    ctx.sendJson(200, { demand, meta: { source, refreshStatus, fetchedAt, basedOnJobs: jobs.length } });
  } catch (err) {
    ctx.logger.error("GET /api/skills/demand failed:", err.message);
    ctx.sendJson(500, { demand: [], meta: { error: "Internal error while computing skill demand." } });
  }
}

function getAliases(req, res, ctx) {
  ctx.sendJson(200, { aliases: skillAliases });
}

module.exports = { getDemand, getAliases };
