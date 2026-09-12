/*
 * opportunities.js — Phase 5, ported from modules/student/opportunities.py.
 * Business logic + rendering for the student-facing opportunity portal.
 */

const Opportunities = (() => {
  const RECOMMENDED_ALIGNMENT_THRESHOLD = 50;

  // ---- Step 9: real backend-backed opportunities ----
  // Real (Industry-posted, SQLite-authoritative) opportunities are
  // fetched from GET /api/opportunities and cached here; mock seed ids
  // are 1-20 (js/data.js), so a large offset keeps the two id spaces
  // from ever colliding when merged into one array for the existing
  // UI (selection, saved-opportunity lists, applications) to keep
  // working unchanged.
  const BACKEND_ID_OFFSET = 100000;
  const isBackendOpportunityId = (id) => id >= BACKEND_ID_OFFSET;
  const toDbId = (id) => id - BACKEND_ID_OFFSET;

  function mapBackendOpportunity(row) {
    return {
      id: BACKEND_ID_OFFSET + row.id, _dbId: row.id, industryUserId: row.industryUserId,
      title: row.title, company: row.company || "", type: row.type || "Not specified",
      domain: row.domain || "General", location: row.location || "Not specified",
      mode: row.mode || "Not specified", duration: row.duration || "Not specified",
      stipend: row.stipend || "Not specified", experience: row.experience || "Not specified",
      required_skills: row.skills || [], preferred_skills: row.preferredSkills || [],
      description: row.description || "", status: row.status || "Active",
      created_date: (row.createdAt || "").slice(0, 10),
    };
  }

  // Fetches the real opportunity list in the background and caches it
  // for loadOpportunities() to merge in — same "render from cache,
  // sync in background" pattern used since Step 3. `onDone` (optional)
  // re-renders whatever's currently on screen once fresh data lands.
  function syncOpportunitiesFromBackend(onDone) {
    if (typeof ApiClient === "undefined") return;
    ApiClient.getOpportunities().then((res) => {
      if (!res.ok) return;
      const mapped = (res.data.opportunities || []).map(mapBackendOpportunity);
      Storage.set("backend_opportunities_cache", mapped);
      if (typeof onDone === "function") onDone();
    }).catch(() => { /* offline — cached/mock data remains the fallback */ });
  }

  // ---- Data loading (student's own catalog = seed + real backend opportunities) ----
  function loadOpportunities() {
    const backendOpportunities = Storage.get("backend_opportunities_cache", []);
    return [...DATA.OPPORTUNITIES, ...backendOpportunities];
  }

  function getOpportunityById(opportunities, id) {
    return opportunities.find((o) => o.id === id) || null;
  }

  function searchOpportunities(opportunities, query) {
    const q = (query || "").trim().toLowerCase();
    if (!q) return opportunities;
    return opportunities.filter((o) => {
      const haystack = [o.title, o.company, o.domain, ...o.required_skills, ...o.preferred_skills];
      return haystack.some((v) => v.toLowerCase().includes(q));
    });
  }

  function filterOpportunities(opportunities, filters) {
    let results = opportunities;
    const map = { type: "type", domain: "domain", location: "location", mode: "mode", experience: "experience" };
    for (const [filterName, field] of Object.entries(map)) {
      const val = filters[filterName];
      if (val && val !== "All") results = results.filter((o) => o[field] === val);
    }
    return results;
  }

  function calculateSkillAlignment(currentProfile, requiredSkills) {
    if (!requiredSkills.length) return 100;
    const matched = requiredSkills.filter((s) => Object.prototype.hasOwnProperty.call(currentProfile, SkillGap.canonicalSkillName(s))).length;
    return Math.round((matched / requiredSkills.length) * 100);
  }

  function getMissingSkills(currentProfile, requiredSkills, preferredSkills) {
    const skillsHave = [], skillsNeed = [];
    for (const s of requiredSkills) {
      (Object.prototype.hasOwnProperty.call(currentProfile, SkillGap.canonicalSkillName(s)) ? skillsHave : skillsNeed).push(s);
    }
    const preferredMissing = preferredSkills.filter((s) => !Object.prototype.hasOwnProperty.call(currentProfile, SkillGap.canonicalSkillName(s)));
    return { skills_have: skillsHave, skills_need: skillsNeed, preferred_missing: preferredMissing };
  }

  function getEffectiveTargetRole() {
    const knownRoles = Object.keys(DATA.ROLE_DOMAIN_RELEVANCE);
    const skillGapRole = Storage.get("skill_gap_target_role", null);
    const profile = Storage.get("student_profile", {});
    return SkillGap.getEffectiveTargetRole(knownRoles, skillGapRole, profile.target_job_role || "");
  }

  function calculateRoleRelevance(targetRole, domain) {
    if (!targetRole) return "Not Set";
    const relevant = DATA.ROLE_DOMAIN_RELEVANCE[targetRole] || [];
    return relevant.includes(domain) ? "High" : "Low";
  }

  function countRecommended(opportunities, currentProfile) {
    return opportunities.filter((o) => calculateSkillAlignment(currentProfile, o.required_skills) >= RECOMMENDED_ALIGNMENT_THRESHOLD).length;
  }

  // ---- Save / Apply (session-only) ----
  function isSaved(id) { return Storage.get("saved_opportunities", []).includes(id); }
  function saveOpportunity(id) {
    const list = Storage.get("saved_opportunities", []);
    if (!list.includes(id)) { list.push(id); Storage.set("saved_opportunities", list); }
  }
  function removeSavedOpportunity(id) {
    let list = Storage.get("saved_opportunities", []);
    list = list.filter((x) => x !== id);
    Storage.set("saved_opportunities", list);
  }
  function getApplicationStatus(id) {
    const apps = Storage.get("applications", []);
    const found = apps.find((a) => a.opportunity_id === id);
    return found ? found.status : null;
  }
  // Real (backend) opportunities apply through POST /api/opportunities/:id/apply
  // so the application is persisted in SQLite and visible to the real
  // Industry account that posted it; mock seed opportunities (ids < the
  // backend offset) keep the original local-only "apply" simulation
  // since they aren't tied to any real Industry account.
  function applyToOpportunity(id, { onDone } = {}) {
    if (getApplicationStatus(id) !== null) return;
    if (!isBackendOpportunityId(id)) {
      const apps = Storage.get("applications", []);
      apps.push({ opportunity_id: id, status: "Applied", applied_date: formatToday() });
      Storage.set("applications", apps);
      if (onDone) onDone(true);
      return;
    }
    if (typeof ApiClient === "undefined") {
      if (onDone) onDone(false, "Backend unavailable — could not submit application.");
      return;
    }
    ApiClient.applyToOpportunity(toDbId(id), {}).then((res) => {
      if (!res.ok) { if (onDone) onDone(false, res.error || "Could not submit application."); return; }
      const apps = Storage.get("applications", []);
      apps.push({ opportunity_id: id, status: res.data.application.status, applied_date: formatToday(), _dbId: res.data.application.id });
      Storage.set("applications", apps);
      if (onDone) onDone(true);
    }).catch(() => { if (onDone) onDone(false, "Could not reach the backend API."); });
  }
  function getApplications() {
    return [...Storage.get("applications", [])].reverse();
  }
  function formatToday() {
    return new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  }

  // One-time-per-open background refresh: the database is authoritative
  // for status changes an Industry user makes (e.g. Shortlisted), so
  // this pulls the student's real applications and updates the matching
  // local entries in place — renderApplications() itself is unchanged.
  function syncApplicationsFromBackend(onDone) {
    if (typeof ApiClient === "undefined") return;
    ApiClient.getStudentApplications().then((res) => {
      if (!res.ok) return;
      const apps = Storage.get("applications", []);
      for (const row of res.data.applications || []) {
        const localOppId = BACKEND_ID_OFFSET + row.opportunityId;
        const existing = apps.find((a) => a.opportunity_id === localOppId);
        if (existing) { existing.status = row.status; existing._dbId = row.id; }
        else apps.push({ opportunity_id: localOppId, status: row.status, applied_date: (row.appliedAt || "").slice(0, 10), _dbId: row.id });
      }
      Storage.set("applications", apps);
      if (typeof onDone === "function") onDone();
    }).catch(() => { /* offline — local cache remains the fallback */ });
  }

  function currentProfile() {
    return SkillGap.getCurrentSkillProfile(
      Storage.get("technical_skills", {}), Storage.get("soft_skills", {}), Storage.get("assessment_result", null)
    );
  }

  // ---- Rendering ----
  function renderBrowse(container) {
    const allOpps = loadOpportunities().filter((o) => (o.status || "Active") === "Active");
    const prefill = Storage.get("opp-search-prefill", "");
    if (prefill) Storage.set("opp-search-prefill", "");

    container.innerHTML = `
      ${UI.sectionHeader("Industry Opportunities", "Browse internships, jobs, industry projects, and training programs.")}
      <div class="search-row"><input type="text" id="opp-search" placeholder="Search by title, company, skill, or domain" value="${UI.escapeHtml(prefill)}"></div>
      <div class="filters-row">
        <select id="opp-type"><option value="All">All Types</option>${UI.selectOptions(DATA.OPPORTUNITY_TYPES, "All", false)}</select>
        <select id="opp-domain"><option value="All">All Domains</option>${UI.selectOptions(DATA.OPP_DOMAINS, "All", false)}</select>
        <select id="opp-location"><option value="All">All Locations</option>${UI.selectOptions(DATA.LOCATIONS, "All", false)}</select>
        <select id="opp-mode"><option value="All">All Modes</option>${UI.selectOptions(DATA.WORK_MODES, "All", false)}</select>
        <select id="opp-exp"><option value="All">All Experience</option>${UI.selectOptions(DATA.EXPERIENCE_LEVELS, "All", false)}</select>
      </div>
      <hr class="divider">
      <div id="opp-count" class="muted" style="margin-bottom:8px;"></div>
      <div class="grid grid-auto" id="opp-results"></div>
    `;

    const rerender = () => {
      const q = document.getElementById("opp-search").value;
      const filters = {
        type: document.getElementById("opp-type").value,
        domain: document.getElementById("opp-domain").value,
        location: document.getElementById("opp-location").value,
        mode: document.getElementById("opp-mode").value,
        experience: document.getElementById("opp-exp").value,
      };
      let results = searchOpportunities(allOpps, q);
      results = filterOpportunities(results, filters);
      document.getElementById("opp-count").textContent = `${results.length} opportunit${results.length === 1 ? "y" : "ies"} found`;
      const grid = document.getElementById("opp-results");
      grid.innerHTML = results.length ? results.map((o) => UI.opportunityCard(o, { showSave: true, isSaved: isSaved(o.id) })).join("") : UI.emptyState("No opportunities match your search and filters. Try broadening them.");
      grid.querySelectorAll(".view-opp-btn").forEach((btn) => btn.onclick = () => { Storage.set("selected_opportunity_id", Number(btn.dataset.id)); renderSection(container); });
      grid.querySelectorAll(".save-opp-btn").forEach((btn) => btn.onclick = () => {
        const id = Number(btn.dataset.id);
        isSaved(id) ? removeSavedOpportunity(id) : saveOpportunity(id);
        UI.toast(isSaved(id) ? "Saved" : "Removed from saved", "success");
        rerender();
      });
    };

    ["opp-search", "opp-type", "opp-domain", "opp-location", "opp-mode", "opp-exp"].forEach((id) => {
      document.getElementById(id).addEventListener("input", rerender);
      document.getElementById(id).addEventListener("change", rerender);
    });
    rerender();
  }

  function renderDetail(container, opportunity) {
    const opportunities = loadOpportunities();
    const profile = currentProfile();
    const alignment = calculateSkillAlignment(profile, opportunity.required_skills);
    const targetRole = getEffectiveTargetRole();
    const roleRelevance = calculateRoleRelevance(targetRole, opportunity.domain);
    const missing = getMissingSkills(profile, opportunity.required_skills, opportunity.preferred_skills);
    const skillGapNames = (Storage.get("skill_gap_analysis", null)?.priority_gaps || []).map((g) => g.skill);
    const matchResult = Matcher.computeMatch(opportunity, profile, targetRole, skillGapNames);
    const appStatus = getApplicationStatus(opportunity.id);

    container.innerHTML = `
      <button class="back-link" id="opp-back">← Back to Opportunities</button>
      <h2>${UI.escapeHtml(opportunity.title)}</h2>
      <p><strong>${UI.escapeHtml(opportunity.company)}</strong></p>
      ${(opportunity.status || "Active") === "Closed" ? `<div class="auth-error">This opportunity is now closed. You can still view its details.</div>` : ""}
      <div class="grid grid-3">
        <div><strong>Type:</strong> ${UI.escapeHtml(opportunity.type)}<br><strong>Domain:</strong> ${UI.escapeHtml(opportunity.domain)}</div>
        <div><strong>Location:</strong> ${UI.escapeHtml(opportunity.location)}<br><strong>Work Mode:</strong> ${UI.escapeHtml(opportunity.mode)}</div>
        <div><strong>Duration:</strong> ${UI.escapeHtml(opportunity.duration)}<br><strong>Experience:</strong> ${UI.escapeHtml(opportunity.experience)}</div>
      </div>
      <p><strong>Stipend/Salary:</strong> ${UI.escapeHtml(opportunity.stipend)}</p>
      <hr class="divider">
      ${UI.sectionHeader("Description")}
      <p>${UI.escapeHtml(opportunity.description)}</p>
      <hr class="divider">
      <div class="grid grid-2">
        <div>${UI.sectionHeader("Required Skills")}<ul class="list-clean">${opportunity.required_skills.map((s) => `<li>• ${UI.escapeHtml(s)}</li>`).join("")}</ul></div>
        <div>${UI.sectionHeader("Preferred Skills")}<ul class="list-clean">${opportunity.preferred_skills.length ? opportunity.preferred_skills.map((s) => `<li>• ${UI.escapeHtml(s)}</li>`).join("") : '<li class="muted">None listed.</li>'}</ul></div>
      </div>
      <hr class="divider">
      ${UI.sectionHeader("Student Alignment", "A basic, transparent indicator — not the final matching engine.")}
      <p><strong>Skill Alignment: ${alignment}%</strong></p>
      ${UI.progressBar(alignment, UI.progressColorForScore(alignment))}
      <p><strong>Role Relevance:</strong> ${roleRelevance}${targetRole ? ` <span class="muted">(based on target role: ${UI.escapeHtml(targetRole)})</span>` : ""}</p>
      ${!targetRole ? `<p class="muted">Set a Target Job Role in My Profile, or run a Skill Gap Analysis, to see role relevance.</p>` : ""}
      <div class="grid grid-3">
        <div>${UI.sectionHeader("Skills You Have")}${missing.skills_have.length ? missing.skills_have.map((s) => `<div>🟢 ${UI.escapeHtml(s)}</div>`).join("") : `<span class="muted">None of the required skills yet.</span>`}</div>
        <div>${UI.sectionHeader("Skills You Need")}${missing.skills_need.length ? missing.skills_need.map((s) => `<div>🔴 ${UI.escapeHtml(s)}</div>`).join("") : `<span class="muted">You meet all required skills!</span>`}</div>
        <div>${UI.sectionHeader("Preferred Skills You Don't Have")}${missing.preferred_missing.length ? missing.preferred_missing.map((s) => `<div>🟡 ${UI.escapeHtml(s)}</div>`).join("") : `<span class="muted">None — you're covered.</span>`}</div>
      </div>
      <hr class="divider">
      ${UI.sectionHeader("Smart Match Summary", "From the Phase 7 matching engine.")}
      <p><strong>${matchResult.match_score}% — ${matchResult.match_category}</strong></p>
      ${UI.progressBar(matchResult.match_score, UI.progressColorForScore(matchResult.match_score))}
      <ul class="list-clean">${matchResult.reasons.map((r) => `<li>✓ ${UI.escapeHtml(r)}</li>`).join("")}</ul>
      <div id="backend-match-info"></div>
      <hr class="divider">
      ${UI.sectionHeader("Actions")}
      <div class="btn-row">
        <button class="btn" id="opp-save-btn">${isSaved(opportunity.id) ? "Remove from Saved" : "Save Opportunity"}</button>
        ${appStatus ? `<span class="badge badge-primary">Application Status: ${UI.escapeHtml(appStatus)}</span>` : `<button class="btn btn-primary" id="opp-apply-btn">Apply</button>`}
      </div>
    `;

    document.getElementById("opp-back").onclick = () => { Storage.set("selected_opportunity_id", null); renderSection(container); };
    document.getElementById("opp-save-btn").onclick = () => {
      isSaved(opportunity.id) ? removeSavedOpportunity(opportunity.id) : saveOpportunity(opportunity.id);
      renderDetail(container, opportunity);
    };
    // Step 10: real backend-verified match (SQLite skills + assessments,
    // not the localStorage profile the "Smart Match Summary" above
    // uses) — appended additively for real (backend) opportunities
    // only; the existing Smart Match Summary above is left unchanged.
    if (opportunity._dbId) renderBackendMatchInfo(container, opportunity);

    const applyBtn = document.getElementById("opp-apply-btn");
    if (applyBtn) applyBtn.onclick = () => {
      applyBtn.disabled = true;
      applyToOpportunity(opportunity.id, {
        onDone: (ok, error) => {
          if (ok) { UI.toast("Application submitted!", "success"); renderDetail(container, opportunity); }
          else { UI.toast(error || "Could not submit application.", "warning"); applyBtn.disabled = false; }
        },
      });
    };
  }

  // Fetches Step 10's backend-verified match score (real SQLite
  // skills/assessment data, never localStorage) and fills in the
  // additive #backend-match-info placeholder left by renderDetail —
  // silently does nothing if the backend is unavailable, so it never
  // breaks the page.
  function renderBackendMatchInfo(container, opportunity) {
    if (typeof ApiClient === "undefined") return;
    const targetRole = getEffectiveTargetRole();
    ApiClient.getOpportunityMatch(opportunity._dbId, targetRole || undefined).then((res) => {
      const el = document.getElementById("backend-match-info");
      if (!el || !res.ok) return;
      const m = res.data;
      el.innerHTML = `
        <hr class="divider" style="margin:10px 0;">
        <p class="muted" style="font-size:.85rem;">Backend-verified match (from your saved skills/assessment data): <strong>${m.matchScore}% — ${UI.escapeHtml(m.matchLevel)}</strong></p>
        ${m.weakSkills.length ? `<p class="muted" style="font-size:.82rem;">⚠ Weak: ${m.weakSkills.map(UI.escapeHtml).join(", ")}</p>` : ""}
        ${m.missingSkills.length ? `<p class="muted" style="font-size:.82rem;">✗ Missing: ${m.missingSkills.map(UI.escapeHtml).join(", ")}</p>` : ""}
      `;
    }).catch(() => { /* backend unavailable — the local Smart Match Summary above still stands */ });
  }

  function renderSection(container) {
    const opportunities = loadOpportunities();
    const selectedId = Storage.get("selected_opportunity_id", null);
    if (selectedId !== null) {
      const opp = getOpportunityById(opportunities, selectedId);
      if (!opp) { Storage.set("selected_opportunity_id", null); renderBrowse(container); return; }
      renderDetail(container, opp);
      return;
    }
    renderBrowse(container);
    syncOpportunitiesFromBackend(() => {
      // Only re-render if the student hasn't navigated away/selected
      // something else while the background fetch was in flight.
      if (Storage.get("selected_opportunity_id", null) === null) renderBrowse(container);
    });
  }

  function renderSaved(container) {
    const opportunities = loadOpportunities();
    const savedIds = Storage.get("saved_opportunities", []);
    container.innerHTML = UI.sectionHeader("Saved Opportunities") + `<div id="saved-list" class="grid grid-auto"></div>`;
    const listEl = document.getElementById("saved-list");
    if (!savedIds.length) { listEl.innerHTML = UI.emptyState("You haven't saved any opportunities yet."); return; }
    const saved = opportunities.filter((o) => savedIds.includes(o.id));
    listEl.innerHTML = saved.map((o) => UI.opportunityCard(o, { showSave: true, isSaved: true })).join("");
    listEl.querySelectorAll(".view-opp-btn").forEach((btn) => btn.onclick = () => { Storage.set("selected_opportunity_id", Number(btn.dataset.id)); Navigation.activateTab("opportunities"); });
    listEl.querySelectorAll(".save-opp-btn").forEach((btn) => btn.onclick = () => { removeSavedOpportunity(Number(btn.dataset.id)); renderSaved(container); });
  }

  function renderApplications(container) {
    syncApplicationsFromBackend(() => renderApplications(container));
    const applications = getApplications();
    container.innerHTML = UI.sectionHeader("My Applications");
    if (!applications.length) { container.innerHTML += UI.emptyState("You haven't applied to any opportunities yet."); return; }
    const opportunities = loadOpportunities();
    container.innerHTML += applications.map((app) => {
      const opp = getOpportunityById(opportunities, app.opportunity_id);
      return `<div class="card">
        ${opp ? `<div class="card-title">${UI.escapeHtml(opp.title)}</div><div class="card-sub">${UI.escapeHtml(opp.company)}</div>` : `<div class="muted">This opportunity is no longer available.</div>`}
        <div>Applied: ${UI.escapeHtml(app.applied_date)}</div>
        <div>Status: ${UI.badge(app.status, app.status === "Shortlisted" ? "green" : app.status === "Rejected" ? "red" : "primary")}</div>
      </div>`;
    }).join("");
  }

  function renderDashboardSummary(container) {
    syncOpportunitiesFromBackend(() => renderDashboardSummary(container));
    const opportunities = loadOpportunities();
    const profile = currentProfile();
    const totalCount = opportunities.length;
    const savedCount = Storage.get("saved_opportunities", []).length;
    const appliedCount = Storage.get("applications", []).length;
    const recommendedCount = countRecommended(opportunities, profile);

    container.innerHTML = UI.sectionHeader("Industry Opportunities") +
      UI.metricRow([["🔎 Available", totalCount], ["⭐ Saved", savedCount], ["📨 Applied", appliedCount], ["🎯 Recommended", recommendedCount]]) +
      `<p class="muted">Open the <strong>Industry Opportunities</strong> tab to browse, save, and apply.</p>` +
      `<div class="grid grid-3">${opportunities.slice(0, 3).map((o) => UI.opportunityCard(o)).join("")}</div>`;

    container.querySelectorAll(".view-opp-btn").forEach((btn) => btn.onclick = () => { Storage.set("selected_opportunity_id", Number(btn.dataset.id)); Navigation.activateTab("opportunities"); });
  }

  return {
    loadOpportunities, getOpportunityById, calculateSkillAlignment, getEffectiveTargetRole,
    getApplicationStatus, getApplications, currentProfile,
    renderSection, renderSaved, renderApplications, renderDashboardSummary,
    syncOpportunitiesFromBackend, syncApplicationsFromBackend,
    isBackendOpportunityId, toDbId, BACKEND_ID_OFFSET,
    getAllCandidateApplicationsBridge: null, // set later to avoid circular init order issues
  };
})();
