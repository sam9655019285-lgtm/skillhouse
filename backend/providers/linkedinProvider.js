/*
 * providers/linkedinProvider.js — Phase 13 spec points 5 & 22.
 *
 * IMPORTANT: this file does NOT scrape LinkedIn, does NOT use
 * unofficial endpoints, and does NOT bypass authentication. It is a
 * ready-to-configure client for LinkedIn's own official REST APIs
 * (accessed only through an approved LinkedIn API product + OAuth 2.0
 * access token that YOU obtain through LinkedIn's developer portal).
 *
 * The access token is no longer a single app-wide value in .env — it
 * is obtained per user via the OAuth redirect flow in routes/linkedin.js
 * and persisted per user in SQLite (db/linkedinTokens.js). Every call
 * below needs a userId and returns a clear "not approved / not
 * configured" result if that user hasn't connected LinkedIn — never a
 * fake or fabricated LinkedIn response.
 *
 * LinkedIn does not grant unrestricted access to jobs, member
 * profiles, skills, companies, or recruiter data — only whatever your
 * specific approved API product covers. Update `JOBS_ENDPOINT` below
 * once you know the exact endpoint your approved product exposes;
 * it's left unset on purpose rather than guessed.
 */

const logger = require("../utils/logger");
const linkedinTokens = require("../db/linkedinTokens");

const NAME = "linkedin";
const LABEL = "LinkedIn API";

// Left blank intentionally — fill in only once you have an approved
// LinkedIn API product's documented endpoint. Never invent one.
const JOBS_ENDPOINT = process.env.LINKEDIN_JOBS_ENDPOINT || "";

function isAppConfigured() {
  return !!(process.env.LINKEDIN_CLIENT_ID && process.env.LINKEDIN_CLIENT_SECRET);
}

function isConfigured(userId) {
  if (!isAppConfigured() || !userId) return false;
  return !!linkedinTokens.findByUserId(userId);
}

function isApproved(userId) {
  // Being "configured" (having a per-user token) is necessary but not
  // sufficient — you also need an approved product + a known
  // endpoint for that product. Both must be true before this
  // provider will ever attempt a real request.
  return isConfigured(userId) && !!JOBS_ENDPOINT;
}

async function authorizedRequest(path, token, { timeoutMs = 8000, retries = 1 } = {}) {
  let lastError = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(path, {
        headers: {
          Authorization: `Bearer ${token}`,
          "LinkedIn-Version": "202401",
          "X-Restli-Protocol-Version": "2.0.0",
        },
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (res.status === 401 || res.status === 403) {
        return { ok: false, reason: "auth_failed", detail: "Access token expired, invalid, or lacks the required scope." };
      }
      if (res.status === 429) {
        return { ok: false, reason: "rate_limited", detail: "LinkedIn API rate limit reached." };
      }
      if (!res.ok) {
        return { ok: false, reason: "api_error", detail: `LinkedIn API responded with status ${res.status}.` };
      }

      const data = await res.json();
      return { ok: true, data };
    } catch (err) {
      clearTimeout(timer);
      lastError = err;
      logger.warn(`linkedinProvider request attempt ${attempt + 1} failed: ${err.message}`);
    }
  }
  return { ok: false, reason: err_reason(lastError), detail: lastError ? lastError.message : "Unknown error" };
}

function err_reason(err) {
  if (!err) return "unknown";
  if (err.name === "AbortError") return "timeout";
  return "network_error";
}

async function fetchJobs(userId) {
  if (!isConfigured(userId)) {
    return { ok: false, reason: "not_configured", detail: "LinkedIn integration not available: user has not connected LinkedIn, or app client id/secret is not configured." };
  }
  if (!isApproved(userId)) {
    return { ok: false, reason: "not_approved", detail: "LinkedIn integration not approved: no approved API product/endpoint configured for this app yet." };
  }

  const { access_token } = linkedinTokens.findByUserId(userId);
  const result = await authorizedRequest(JOBS_ENDPOINT, access_token);
  if (!result.ok) return result;

  // Real mapping would translate LinkedIn's own job-posting response
  // shape into our common job shape here. Left as a clearly-marked
  // stub since we have no approved product/response shape to map yet
  // — this function is never reached until JOBS_ENDPOINT is set.
  return { ok: true, jobs: [], sourceUpdatedAt: new Date().toISOString() };
}

function status(userId) {
  if (!isAppConfigured()) return { name: NAME, label: LABEL, configured: false, status: "Not Configured" };
  if (!userId) return { name: NAME, label: LABEL, configured: true, status: "Not Configured", detail: "No user connected." };
  if (!isConfigured(userId)) return { name: NAME, label: LABEL, configured: true, status: "Not Configured", detail: "User has not connected LinkedIn." };
  if (!isApproved(userId)) return { name: NAME, label: LABEL, configured: true, status: "Not Approved" };
  return { name: NAME, label: LABEL, configured: true, status: "Connected" };
}

module.exports = { name: NAME, label: LABEL, fetchJobs, status, isConfigured, isApproved, isAppConfigured };
