/*
 * providers/jobMarketProvider.js — Phase 13 spec points 5-7.
 *
 * A real, publicly documented, keyless job-listings API (Remotive:
 * https://remotive.com/api-documentation) — legally available data,
 * no scraping, no bypassed auth, no secret required. This is the
 * "other legal job/data API" the spec allows using when LinkedIn
 * access isn't approved.
 *
 * If the request fails for any reason (offline sandbox, DNS/network
 * restrictions, provider outage, malformed response), this cleanly
 * reports failure so jobDataService can fall back to MockProvider —
 * it never throws up through the route handler.
 */

const logger = require("../utils/logger");

const NAME = "job_market_api";
const LABEL = "Job Market API (Remotive)";
const BASE_URL = process.env.JOB_MARKET_API_BASE_URL || "https://remotive.com/api/remote-jobs";
const REQUEST_TIMEOUT_MS = 8000;

// A short, curated search so a demo run doesn't pull thousands of
// unrelated listings (Phase 13 spec point 33 — no unnecessary bulk
// downloads).
const SEARCH_CATEGORY = "software-dev";
const RESULT_LIMIT = 20;

function extractSkillsFromText(text) {
  if (!text) return [];
  const KNOWN_SKILLS = [
    "Python", "Java", "SQL", "JavaScript", "React", "Node.js", "Machine Learning",
    "Data Analysis", "Statistics", "Git", "Cloud", "AWS", "Docker", "Communication",
    "Problem Solving", "Bioinformatics", "Cybersecurity", "DevOps", "C++",
  ];
  const found = new Set();
  const haystack = text.toLowerCase();
  for (const skill of KNOWN_SKILLS) {
    if (haystack.includes(skill.toLowerCase())) found.add(skill);
  }
  return Array.from(found);
}

async function fetchJobs() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const url = `${BASE_URL}?category=${encodeURIComponent(SEARCH_CATEGORY)}&limit=${RESULT_LIMIT}`;

  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);

    if (res.status === 429) return { ok: false, reason: "rate_limited", detail: "Job Market API rate limit reached." };
    if (!res.ok) return { ok: false, reason: "api_error", detail: `Job Market API responded with status ${res.status}.` };

    let payload;
    try {
      payload = await res.json();
    } catch (parseErr) {
      return { ok: false, reason: "invalid_response", detail: "Job Market API returned malformed JSON." };
    }

    const rawJobs = Array.isArray(payload.jobs) ? payload.jobs : [];
    if (!rawJobs.length) return { ok: false, reason: "empty_response", detail: "Job Market API returned no jobs." };

    const jobs = rawJobs.map((j) => ({
      id: `jm_${j.id}`,
      title: j.title,
      company: j.company_name,
      location: j.candidate_required_location || "Remote",
      employmentType: j.job_type || "Not specified",
      skills: extractSkillsFromText(`${j.title} ${j.description || ""}`),
      industry: j.category || null,
      url: j.url || null,
      sourceUpdatedAt: j.publication_date || null,
    }));

    return { ok: true, jobs, sourceUpdatedAt: new Date().toISOString() };
  } catch (err) {
    clearTimeout(timer);
    const reason = err.name === "AbortError" ? "timeout" : "network_error";
    logger.warn(`jobMarketProvider.fetchJobs failed (${reason}): ${err.message}`);
    return { ok: false, reason, detail: err.message };
  }
}

function status() {
  return { name: NAME, label: LABEL, configured: true, status: "Connected (verified on next request)" };
}

module.exports = { name: NAME, label: LABEL, fetchJobs, status };
