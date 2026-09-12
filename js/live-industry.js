/*
 * js/live-industry.js — Phase 13.
 *
 * Fetches normalized job data from OUR backend (js/api/apiClient.js)
 * and feeds it into the EXISTING Phase 9 analytics engine
 * (AnalyticsMetrics.calculateSkillDemand, from analytics-engine.js)
 * rather than computing a second, independent ranking — spec point 12
 * explicitly asks for this reuse. Phase 10's CurriculumIntelligence is
 * reused the same way for the Academician "live alignment" view.
 *
 * This file also owns the freshness/auto-refresh UI pieces shared by
 * every dashboard (spec points 8, 9, 28).
 */

const LiveIndustry = (() => {
  const REFRESH_INTERVAL_MS = 5 * 60 * 1000; // spec point 9 default: 5 minutes
  let state = { jobs: [], meta: null, loading: false, lastError: null };
  let refreshTimer = null;
  const listeners = new Set();

  function onUpdate(fn) { listeners.add(fn); return () => listeners.delete(fn); }
  function notify() { listeners.forEach((fn) => fn(state)); }

  async function refresh(force = false) {
    state = { ...state, loading: true };
    notify();

    const result = await ApiClient.getJobs(force);
    if (!result.ok) {
      state = { ...state, loading: false, lastError: result.error };
      notify();
      return state;
    }

    state = { jobs: result.data.jobs, meta: result.data.meta, loading: false, lastError: null };
    notify();
    return state;
  }

  function startAutoRefresh(intervalMs = REFRESH_INTERVAL_MS) {
    stopAutoRefresh();
    refreshTimer = setInterval(() => refresh(false), intervalMs);
  }
  function stopAutoRefresh() {
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = null;
  }

  // ---- Bridge into the EXISTING Phase 9 engine — no second engine ----
  // AnalyticsMetrics.calculateSkillDemand() just needs objects shaped
  // like { required_skills, preferred_skills }; live jobs map onto
  // that with zero new counting logic.
  function toOpportunityShape(jobs) {
    return jobs.map((j) => ({ required_skills: j.skills || [], preferred_skills: [], domain: j.industry }));
  }

  function liveSkillDemand() {
    return AnalyticsMetrics.calculateSkillDemand(toOpportunityShape(state.jobs));
  }

  // ---- Freshness / status UI (spec points 8, 28) ----
  function overallFreshness() {
    if (!state.jobs.length) return state.lastError ? "ERROR" : "MOCK";
    const order = { ERROR: 0, STALE: 1, MOCK: 2, RECENT: 3, LIVE: 4 };
    // "Worst" (lowest) freshness across all jobs represents the batch honestly.
    return state.jobs.reduce((worst, j) => (order[j.freshness] < order[worst] ? j.freshness : worst), "LIVE");
  }

  function freshnessDotClass(freshness) {
    return { LIVE: "green", RECENT: "primary", STALE: "amber", MOCK: "gray", ERROR: "red" }[freshness] || "gray";
  }

  function timeAgo(dateStr) {
    if (!dateStr) return "unknown";
    const diffMs = Date.now() - new Date(dateStr).getTime();
    const mins = Math.max(0, Math.round(diffMs / 60000));
    if (mins < 1) return "just now";
    if (mins === 1) return "1 minute ago";
    if (mins < 60) return `${mins} minutes ago`;
    const hrs = Math.round(mins / 60);
    return hrs === 1 ? "1 hour ago" : `${hrs} hours ago`;
  }

  function freshnessBanner() {
    if (state.loading && !state.jobs.length) {
      return `<div class="card"><p class="muted">🔄 Loading live industry data…</p></div>`;
    }
    if (state.lastError && !state.jobs.length) {
      return `<div class="card"><p>⚠ Live industry data is temporarily unavailable.</p><p class="muted" style="font-size:.82rem;">${UI.escapeHtml(state.lastError)}</p></div>`;
    }
    const freshness = overallFreshness();
    const meta = state.meta || {};
    const sourceLabel = state.jobs[0]?.sourceLabel || (meta.source === "mock" ? "Demo Data" : meta.source || "Unknown");
    const stale = meta.refreshStatus === "STALE_FALLBACK";

    return `<div class="card">
      <div class="card-row">
        <div><span class="badge badge-${freshnessDotClass(freshness)}">● ${freshness}</span> <strong style="margin-left:6px;">${UI.escapeHtml(sourceLabel)}</strong></div>
        <button class="btn btn-sm" id="live-refresh-btn">${state.loading ? "🔄 Updating…" : "🔄 Refresh"}</button>
      </div>
      <p class="muted" style="font-size:.82rem;margin-top:6px;">Updated ${timeAgo(meta.fetchedAt)}${stale ? " — showing cached data, source temporarily unavailable." : ""}</p>
      ${state.lastError ? `<p style="font-size:.82rem;color:var(--red);">⚠ ${UI.escapeHtml(state.lastError)} Showing last available data.</p>` : ""}
    </div>`;
  }

  function wireRefreshButton(container, rerenderFn) {
    const btn = container.querySelector("#live-refresh-btn");
    if (btn) btn.onclick = async () => { await refresh(true); rerenderFn(); };
  }

  // ---- Phase 17 — Industry-facing live dashboard ----
  function renderIndustryLiveSection(container) {
    const demand = liveSkillDemand();
    const topSkills = Object.entries(demand).slice(0, 8);
    const roles = [...new Set(state.jobs.map((j) => j.title))];
    const internshipCount = state.jobs.filter((j) => (j.employmentType || "").toLowerCase().includes("intern")).length;

    container.innerHTML = freshnessBanner() +
      UI.metricRow([
        ["Total Opportunities", state.jobs.length],
        ["Active Industries", new Set(state.jobs.map((j) => j.industry).filter(Boolean)).size],
        ["Top Roles Tracked", roles.length],
        ["Internship Demand", internshipCount],
      ]) +
      UI.sectionHeader("Top Skills In Demand (Live)") +
      (topSkills.length ? topSkills.map(([skill, v]) => `<div class="skill-bar-row"><div class="skill-bar-label"><span>${UI.escapeHtml(skill)}</span><span>${v.total} listing(s)</span></div>${UI.progressBar(Math.min(100, v.total * 10), "primary")}</div>`).join("") : UI.emptyState("No live data yet."));

    wireRefreshButton(container, () => renderIndustryLiveSection(container));
  }

  // ---- Phase 18 — Student "Current Industry Demand" widget ----
  function renderStudentDemandWidget(container) {
    const demand = liveSkillDemand();
    const topSkills = Object.entries(demand).slice(0, 8).map(([skill]) => skill);
    const profile = SkillGap.getCurrentSkillProfile(
      Storage.get("technical_skills", {}), Storage.get("soft_skills", {}), Storage.get("assessment_result", null)
    );

    container.innerHTML = freshnessBanner() + UI.sectionHeader("📈 Current Industry Demand", "Live skills employers are asking for right now, compared against your own profile.");
    if (!topSkills.length) {
      container.innerHTML += UI.emptyState("No live data yet.");
    } else {
      container.innerHTML += topSkills.map((skill) => {
        const canonical = SkillGap.canonicalSkillName(skill);
        const has = Object.prototype.hasOwnProperty.call(profile, canonical);
        const score = profile[canonical];
        const icon = !has ? "🔴" : score >= 70 ? "🟢" : "🟡";
        return `<div>${icon} ${UI.escapeHtml(skill)}${has ? ` <span class="muted">(you: ${score}%)</span>` : ` <span class="muted">(not in your profile yet)</span>`}</div>`;
      }).join("");
    }
    wireRefreshButton(container, () => renderStudentDemandWidget(container));
  }

  // ---- Phase 19 — Academician "Live Industry-Curriculum Alignment" ----
  function renderAcademicianLiveAlignment(container) {
    const demand = liveSkillDemand();
    const coverage = CurriculumIntelligence.calculateCurriculumCoverage();
    const coverageByCanonical = {};
    for (const [skill, v] of Object.entries(coverage)) coverageByCanonical[AnalyticsData.normalizeSkill(skill)] = v;

    const rows = Object.entries(demand).slice(0, 10);
    container.innerHTML = freshnessBanner() + UI.sectionHeader("Live Industry–Curriculum Alignment", "Comparing what employers are asking for right now against current curriculum coverage.");
    if (!rows.length) { container.innerHTML += UI.emptyState("No live data yet."); return; }

    container.innerHTML += `<table style="width:100%;border-collapse:collapse;font-size:.87rem;">
      <thead><tr style="text-align:left;border-bottom:2px solid var(--gray-200);"><th style="padding:6px;">Skill</th><th style="padding:6px;">Industry Demand</th><th style="padding:6px;">Curriculum Coverage</th></tr></thead>
      <tbody>${rows.map(([skill, v]) => {
        const demandLevel = v.total >= 4 ? "High" : v.total >= 2 ? "Medium" : "Low";
        const canonical = AnalyticsData.normalizeSkill(skill);
        const coverageStats = coverageByCanonical[canonical];
        const coverageLevel = !coverageStats ? "Low" : coverageStats.coverage_score >= 70 ? "High" : coverageStats.coverage_score >= 40 ? "Medium" : "Low";
        return `<tr style="border-bottom:1px solid var(--gray-100);">
          <td style="padding:6px;">${UI.escapeHtml(skill)}</td>
          <td style="padding:6px;">${UI.badge(demandLevel, demandLevel === "High" ? "red" : demandLevel === "Medium" ? "amber" : "gray")}</td>
          <td style="padding:6px;">${UI.badge(coverageLevel, coverageLevel === "High" ? "green" : coverageLevel === "Medium" ? "amber" : "red")}</td>
        </tr>`;
      }).join("")}</tbody></table>`;
    wireRefreshButton(container, () => renderAcademicianLiveAlignment(container));
  }

  // ---- Phase 20 — Institution live section with filters ----
  function renderInstitutionLiveSection(container) {
    const allJobs = state.jobs;
    const locations = [...new Set(allJobs.map((j) => j.location).filter(Boolean))].sort();
    const industries = [...new Set(allJobs.map((j) => j.industry).filter(Boolean))].sort();
    const allSkills = [...new Set(allJobs.flatMap((j) => j.skills || []))].sort();

    container.innerHTML = freshnessBanner() + UI.sectionHeader("Live Industry Demand — Institution View") + `
      <div class="filters-row">
        <select id="li-inst-location"><option value="All">All Locations</option>${UI.selectOptions(locations, "All", false)}</select>
        <select id="li-inst-industry"><option value="All">All Industries</option>${UI.selectOptions(industries, "All", false)}</select>
        <select id="li-inst-skill"><option value="All">All Skills</option>${UI.selectOptions(allSkills, "All", false)}</select>
      </div>
      <div id="li-inst-results"></div>`;

    const rerenderResults = () => {
      const loc = document.getElementById("li-inst-location").value;
      const ind = document.getElementById("li-inst-industry").value;
      const skill = document.getElementById("li-inst-skill").value;
      let filtered = allJobs;
      if (loc !== "All") filtered = filtered.filter((j) => j.location === loc);
      if (ind !== "All") filtered = filtered.filter((j) => j.industry === ind);
      if (skill !== "All") filtered = filtered.filter((j) => (j.skills || []).includes(skill));

      const demand = AnalyticsMetrics.calculateSkillDemand(toOpportunityShape(filtered));
      const resultsEl = document.getElementById("li-inst-results");
      resultsEl.innerHTML = UI.metricRow([["Matching Opportunities", filtered.length]]) +
        Object.entries(demand).slice(0, 10).map(([s, v]) => `<div class="skill-bar-row"><div class="skill-bar-label"><span>${UI.escapeHtml(s)}</span><span>${v.total}</span></div>${UI.progressBar(Math.min(100, v.total * 10))}</div>`).join("");
    };
    ["li-inst-location", "li-inst-industry", "li-inst-skill"].forEach((id) => document.getElementById(id).addEventListener("change", rerenderResults));
    rerenderResults();
    wireRefreshButton(container, () => renderInstitutionLiveSection(container));
  }

  return {
    refresh, startAutoRefresh, stopAutoRefresh, onUpdate,
    liveSkillDemand, freshnessBanner, timeAgo, overallFreshness,
    renderIndustryLiveSection, renderStudentDemandWidget, renderAcademicianLiveAlignment, renderInstitutionLiveSection,
    getState: () => state,
  };
})();
