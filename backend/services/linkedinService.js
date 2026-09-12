/*
 * services/linkedinService.js — Phase 13 spec point 5.
 *
 * Thin public-facing wrapper other services import instead of
 * reaching into providers/linkedinProvider.js directly, so the OAuth
 * token handling / retry / timeout / status logic has exactly one
 * home (providers/linkedinProvider.js) and nothing duplicates it.
 */

const linkedinProvider = require("../providers/linkedinProvider");
const logger = require("../utils/logger");

async function fetchJobs(userId) {
  const result = await linkedinProvider.fetchJobs(userId);
  if (!result.ok) {
    logger.info(`LinkedIn fetchJobs unavailable: ${result.reason} — ${result.detail}`);
  }
  return result;
}

function getStatus(userId) {
  return linkedinProvider.status(userId);
}

module.exports = { fetchJobs, getStatus };
