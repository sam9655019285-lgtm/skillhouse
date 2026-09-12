/*
 * routes/industryData.js — Phase 13 spec points 12-14, 22.
 *   GET /api/industry/trends
 *   GET /api/industry/status
 */

const jobDataService = require("../services/jobDataService");
const linkedinService = require("../services/linkedinService");
const jobMarketProvider = require("../providers/jobMarketProvider");
const mockProvider = require("../providers/mockProvider");
const cache = require("../services/cacheService");

async function getTrends(req, res, ctx) {
  try {
    const userId = ctx.user ? ctx.user.id : null;
    const { jobs, source, refreshStatus, fetchedAt, error } = await jobDataService.getJobs({ userId });
    const skillDemand = jobDataService.computeSkillDemand(jobs);

    // Growth trends require a historical baseline we don't have yet in
    // this lightweight in-memory cache — spec point 14 explicitly
    // forbids fabricating percentages, so we say so plainly instead.
    const trends = {
      topSkills: skillDemand.slice(0, 10),
      growth: "Trend unavailable — collecting baseline data.",
    };

    ctx.sendJson(200, {
      trends,
      totalOpportunities: jobs.length,
      activeIndustries: [...new Set(jobs.map((j) => j.industry).filter(Boolean))],
      meta: { source, refreshStatus, fetchedAt, error },
    });
  } catch (err) {
    ctx.logger.error("GET /api/industry/trends failed:", err.message);
    ctx.sendJson(500, { error: "Internal error while computing trends." });
  }
}

function getStatus(req, res, ctx) {
  const userId = ctx.user ? ctx.user.id : null;
  ctx.sendJson(200, {
    demoMode: jobDataService.isDemoMode(),
    providers: {
      linkedin: linkedinService.getStatus(userId),
      jobMarketApi: jobMarketProvider.status(),
      mock: mockProvider.status(),
    },
    cache: cache.healthStatus(),
  });
}

module.exports = { getTrends, getStatus };
