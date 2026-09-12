/*
 * services/cacheService.js — Phase 13 spec point 10.
 *
 * A tiny in-memory cache (no Redis/DB dependency, per "don't
 * overengineer" — point 36). Keeps the last SUCCESSFUL response per
 * key so the dashboards keep working during an API outage, per point
 * 10/25: "use last successful cached response ... clearly display
 * 'Showing cached data'".
 */

const logger = require("../utils/logger");

const store = new Map();
// store[key] = { data, fetchedAt (Date), expiresAt (Date), source, isFallback }

function ttlMinutes() {
  return Number(process.env.CACHE_TTL_MINUTES || 5);
}

function set(key, data, source) {
  const now = new Date();
  store.set(key, {
    data,
    source,
    fetchedAt: now,
    expiresAt: new Date(now.getTime() + ttlMinutes() * 60 * 1000),
  });
  logger.debug(`cache SET ${key} (source=${source}, ttl=${ttlMinutes()}m)`);
}

function getFresh(key) {
  const entry = store.get(key);
  if (!entry) return null;
  if (new Date() > entry.expiresAt) return null; // expired — caller should refetch
  return entry;
}

// Returns the last successful entry regardless of expiry — used as a
// fallback when a live fetch fails (point 10/25).
function getStale(key) {
  return store.get(key) || null;
}

function healthStatus() {
  return {
    healthy: true,
    keys: Array.from(store.keys()),
    entries: Array.from(store.entries()).map(([key, v]) => ({
      key, source: v.source, fetchedAt: v.fetchedAt, expiresAt: v.expiresAt,
    })),
  };
}

module.exports = { set, getFresh, getStale, healthStatus, ttlMinutes };
