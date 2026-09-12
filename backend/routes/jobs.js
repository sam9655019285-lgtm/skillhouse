/*
 * routes/jobs.js — Phase 13 spec point 7: GET /api/jobs
 * Handler signature: (req, res, ctx) where ctx = { query, sendJson, logger }
 */

const jobDataService = require("../services/jobDataService");

async function getJobs(req, res, ctx) {
  try {
    const forceRefresh = ctx.query.refresh === "true";
    const userId = ctx.user ? ctx.user.id : null;
    const { jobs, source, refreshStatus, fetchedAt, error } = await jobDataService.getJobs({ forceRefresh, userId });
    ctx.sendJson(200, { jobs, meta: { source, refreshStatus, fetchedAt, error, count: jobs.length } });
  } catch (err) {
    ctx.logger.error("GET /api/jobs failed:", err.message);
    ctx.sendJson(500, { jobs: [], meta: { error: "Internal error while fetching jobs." } });
  }
}

module.exports = { getJobs };
