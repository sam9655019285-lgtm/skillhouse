/*
 * services/jobDataService.js — Phase 13 spec points 6, 9, 10, 25, 29.
 *
 * The one place that decides WHICH provider answers a request:
 *   DEMO_MODE=true             -> MockProvider only
 *   DEMO_MODE=false            -> LinkedIn (if approved) -> Job Market
 *                                  API -> MockProvider, in that order,
 *                                  falling through on any failure
 * Every result is cached; if a live fetch fails, the last successful
 * cached response is served with refreshStatus explaining why.
 */

const cache = require("./cacheService");
const normalizer = require("./dataNormalizer");
const linkedinService = require("./linkedinService");
const jobMarketProvider = require("../providers/jobMarketProvider");
const mockProvider = require("../providers/mockProvider");
const logger = require("../utils/logger");
const skillAliases = require("../data/skillAliases.json");

const CACHE_KEY = "jobs";

function isDemoMode() {
  return String(process.env.DEMO_MODE || "true").toLowerCase() === "true";
}

function providerChain(userId) {
  if (isDemoMode()) return [{ name: "mock", fetch: mockProvider.fetchJobs, label: mockProvider.label }];
  return [
    // LinkedIn is per-user: only attempted when the request comes from
    // a logged-in user who has connected their own LinkedIn account
    // (see routes/linkedin.js, db/linkedinTokens.js). Anonymous
    // requests skip straight to the keyless Job Market API.
    { name: "linkedin", fetch: () => linkedinService.fetchJobs(userId), label: "LinkedIn API" },
    { name: "job_market_api", fetch: jobMarketProvider.fetchJobs, label: jobMarketProvider.label },
    { name: "mock", fetch: mockProvider.fetchJobs, label: mockProvider.label },
  ];
}

// Tries each provider in order; the first one that succeeds wins.
// This IS the fallback chain from spec point 6/29 — mock is always
// the last resort so the site never has nothing to show.
async function fetchFromProviders(userId) {
  const attempts = [];
  for (const provider of providerChain(userId)) {
    const result = await provider.fetch();
    attempts.push({ provider: provider.name, ok: result.ok, reason: result.reason || null });
    if (result.ok) {
      return { provider: provider.name, label: provider.label, result, attempts };
    }
    logger.info(`Provider ${provider.name} unavailable (${result.reason || "unknown"}); trying next.`);
  }
  return { provider: null, label: null, result: null, attempts };
}

async function getJobs({ forceRefresh = false, userId = null } = {}) {
  if (!forceRefresh) {
    const fresh = cache.getFresh(CACHE_KEY);
    if (fresh) {
      return { jobs: fresh.data, source: fresh.source, refreshStatus: "CACHED", fetchedAt: fresh.fetchedAt, error: null };
    }
  }

  const { provider, label, result, attempts } = await fetchFromProviders(userId);

  if (!provider) {
    // Every provider failed (including mock, which should be
    // essentially impossible) — fall back to the last known-good
    // cache entry no matter how old, per spec point 10/25.
    const stale = cache.getStale(CACHE_KEY);
    if (stale) {
      return { jobs: stale.data, source: stale.source, refreshStatus: "STALE_FALLBACK", fetchedAt: stale.fetchedAt, error: "All providers unavailable; showing cached data.", attempts };
    }
    return { jobs: [], source: null, refreshStatus: "ERROR", fetchedAt: null, error: "All providers unavailable and no cached data exists yet.", attempts };
  }

  const fetchedAt = new Date();
  const normalized = normalizer.normalizeJobs(result.jobs, {
    source: provider, sourceLabel: label, fetchedAt,
  });
  cache.set(CACHE_KEY, normalized, provider);

  return { jobs: normalized, source: provider, refreshStatus: "REFRESHED", fetchedAt, error: null, attempts };
}

// ---- Skill demand (a simple summary for the API response itself —
// the frontend dashboards reuse the existing Phase 9 engine on the
// normalized jobs this endpoint returns, rather than trusting a
// second ranking computed here; see js/live-industry.js). ----
function canonicalSkill(name) {
  for (const [canonical, aliases] of Object.entries(skillAliases)) {
    if (aliases.some((a) => a.toLowerCase() === name.toLowerCase())) return canonical;
  }
  return name;
}

function computeSkillDemand(jobs) {
  const counts = {};
  for (const job of jobs) {
    for (const skill of job.skills || []) {
      const canonical = canonicalSkill(skill);
      counts[canonical] = (counts[canonical] || 0) + 1;
    }
  }
  const total = jobs.length || 1;
  return Object.entries(counts)
    .map(([skill, count]) => ({ skill, count, demandPercent: Math.round((count / total) * 100) }))
    .sort((a, b) => b.count - a.count);
}

module.exports = { getJobs, computeSkillDemand, isDemoMode, providerChain };
