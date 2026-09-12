/*
 * providers/mockProvider.js — Phase 13 spec point 6 & 29.
 *
 * Implements the same provider interface (fetchJobs) as every other
 * provider. Used directly when DEMO_MODE=true, and automatically as
 * the fallback when a real provider is unconfigured or fails, so the
 * site always has something to show.
 *
 * Every record this returns is explicitly source: "mock" — never
 * mislabeled as live data (see dataNormalizer.classifyFreshness).
 */

const mockJobs = require("../data/mockJobs.json");
const logger = require("../utils/logger");

const NAME = "mock";
const LABEL = "Demo Data";

async function fetchJobs() {
  logger.debug("mockProvider.fetchJobs()");
  // Mock data has no external "last updated" timestamp — it's bundled
  // with the app, not fetched, so sourceUpdatedAt stays null and the
  // normalizer classifies it as MOCK regardless of age.
  return {
    ok: true,
    jobs: mockJobs,
    sourceUpdatedAt: null,
  };
}

function status() {
  return { name: NAME, label: LABEL, configured: true, status: "Connected" };
}

module.exports = { name: NAME, label: LABEL, fetchJobs, status };
