/*
 * services/dataNormalizer.js — Phase 13 spec points 8 and 11.
 *
 * Converts whatever shape a provider returns into one common job
 * record, and classifies freshness (LIVE/RECENT/STALE/MOCK/ERROR) so
 * the frontend never has to know which provider a record came from.
 */

function freshnessThresholds() {
  return {
    liveMinutes: Number(process.env.FRESHNESS_LIVE_MINUTES || 10),
    recentMinutes: Number(process.env.FRESHNESS_RECENT_MINUTES || 60),
  };
}

// status ignores age entirely for mock data — mock is always labeled
// MOCK, never LIVE/RECENT/STALE, so it can never be mistaken for real
// data (Phase 13 spec point 29: "Never label mock data as LIVE").
function classifyFreshness(sourceUpdatedAt, sourceType) {
  if (sourceType === "mock") return "MOCK";
  if (!sourceUpdatedAt) return "STALE";

  const { liveMinutes, recentMinutes } = freshnessThresholds();
  const ageMinutes = (Date.now() - new Date(sourceUpdatedAt).getTime()) / 60000;
  if (ageMinutes < 0) return "RECENT"; // clock skew guard
  if (ageMinutes < liveMinutes) return "LIVE";
  if (ageMinutes < recentMinutes) return "RECENT";
  return "STALE";
}

// One common job shape every provider's raw response gets mapped to.
// `source` is a short machine key ("linkedin" | "job_market_api" |
// "mock"); `sourceLabel` is what the frontend prints.
function normalizeJob(raw, { source, sourceLabel, fetchedAt }) {
  return {
    id: String(raw.id),
    title: raw.title || "Untitled Role",
    company: raw.company || "Unknown Company",
    location: raw.location || "Not specified",
    employmentType: raw.employmentType || "Not specified",
    skills: Array.isArray(raw.skills) ? raw.skills : [],
    industry: raw.industry || null,
    url: raw.url || null,
    source,
    sourceLabel,
    sourceUpdatedAt: raw.sourceUpdatedAt || null,
    fetchedAt,
    freshness: classifyFreshness(raw.sourceUpdatedAt, source),
  };
}

function normalizeJobs(rawJobs, meta) {
  return (rawJobs || []).map((raw) => normalizeJob(raw, meta));
}

module.exports = { normalizeJob, normalizeJobs, classifyFreshness, freshnessThresholds };
