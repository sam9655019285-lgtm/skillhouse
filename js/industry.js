/*
 * industry.js — Phase 8, ported from modules/industry/profile.py,
 * modules/industry/opportunities.py, modules/industry/candidates.py.
 */

const Industry = (() => {
  // ---------------- Profile ----------------
  function hasIndustryProfile() { return !!(Storage.get("industry_profile", {}).company_name); }
  function getCompanyName() { return Storage.get("industry_profile", {}).company_name || "Your Company"; }

  function renderProfile(container) {
    const profile = Storage.get("industry_profile", {});
    container.innerHTML = UI.sectionHeader("Industry Profile", "Basic company information used across the Industry portal.") + `
      <form id="industry-profile-form">
        <label>Company Name</label><input type="text" id="ip-name" value="${UI.escapeHtml(profile.company_name || "")}">
        <label>Industry Domain</label><select id="ip-domain">${UI.selectOptions(DATA.OPP_DOMAINS, profile.domain, false)}</select>
        <label>Company Description</label><textarea id="ip-desc">${UI.escapeHtml(profile.description || "")}</textarea>
        <label>Location</label><select id="ip-location">${UI.selectOptions(DATA.LOCATIONS, profile.location, false)}</select>
        <label>Website</label><input type="text" id="ip-website" value="${UI.escapeHtml(profile.website || "")}">
        <label>Contact Email</label><input type="text" id="ip-email" value="${UI.escapeHtml(profile.contact_email || "")}">
        <label>Company Size</label><select id="ip-size">${UI.selectOptions(DATA.COMPANY_SIZES, profile.company_size, false)}</select>
        <button type="submit" class="btn btn-primary">Save Profile</button>
      </form>`;
    document.getElementById("industry-profile-form").onsubmit = (e) => {
      e.preventDefault();
      const name = document.getElementById("ip-name").value.trim();
      if (!name) { UI.toast("Company Name cannot be empty.", "error"); return; }
      Storage.set("industry_profile", {
        company_name: name, domain: document.getElementById("ip-domain").value,
        description: document.getElementById("ip-desc").value.trim(), location: document.getElementById("ip-location").value,
        website: document.getElementById("ip-website").value.trim(), contact_email: document.getElementById("ip-email").value.trim(),
        company_size: document.getElementById("ip-size").value,
      });
      UI.toast("Industry profile saved.", "success");
      renderProfile(container);
    };
  }

  // ---------------- Opportunity CRUD ----------------
  // Step 9: real opportunities are created/edited/closed/reopened
  // through the backend (SQLite `opportunities` table via
  // backend/routes/opportunities.js) instead of the localStorage
  // "industry_opportunities" key, which is now legacy/migrated-away-from
  // (see migrateLocalOpportunities below). The mock DATA.OPPORTUNITIES
  // seed catalog is left untouched for continuity/demo purposes — it
  // isn't owned by any real Industry account, so it's not part of the
  // migration; findOpportunityMutable's seed branch is preserved as-is.
  function parseSkillList(text) { return text.split(",").map((s) => s.trim()).filter(Boolean); }
  function validateOpportunityFields(title, domain, description, requiredSkillsText) {
    const errors = [];
    if (!title.trim()) errors.push("Title cannot be empty.");
    if (!domain) errors.push("Domain must be selected.");
    if (!description.trim()) errors.push("Description should not be empty.");
    if (!parseSkillList(requiredSkillsText).length) errors.push("Required skills should contain at least one skill.");
    return errors;
  }

  function opportunityPayload(fields) {
    return {
      title: fields.title.trim(), type: fields.type, domain: fields.domain, location: fields.location, mode: fields.mode,
      duration: fields.duration.trim() || "Not specified", stipend: fields.stipend.trim() || "Not specified",
      experience: fields.experience, skills: parseSkillList(fields.requiredSkillsText),
      preferredSkills: parseSkillList(fields.preferredSkillsText), description: fields.description.trim(),
      company: getCompanyName(),
    };
  }

  // Creates on the backend; onDone(ok, error) reports the result so
  // the caller can update the UI (never fabricates a local-only
  // opportunity for a real post — if the backend save fails, nothing
  // is created, and the student-facing catalog stays accurate).
  function createOpportunity(fields, onDone) {
    if (typeof ApiClient === "undefined") { onDone(false, "Backend unavailable — could not post opportunity."); return; }
    ApiClient.createOpportunity(opportunityPayload(fields)).then((res) => {
      if (!res.ok) { onDone(false, res.error || "Could not post opportunity."); return; }
      Opportunities.syncOpportunitiesFromBackend();
      onDone(true, null, res.data.opportunity);
    }).catch(() => onDone(false, "Could not reach the backend API."));
  }

  function findOpportunityMutable(id) {
    const seedIdx = DATA.OPPORTUNITIES.findIndex((o) => o.id === id);
    if (seedIdx !== -1) return { list: DATA.OPPORTUNITIES, idx: seedIdx, persist: false };
    return null; // real opportunities are no longer mutated via a local array — see updateOpportunity/closeOpportunity/reopenOpportunity
  }

  // Updates a real (backend) opportunity; falls back to the old local
  // mutation only for mock seed items (id < Opportunities.BACKEND_ID_OFFSET),
  // preserving that existing demo behavior unchanged.
  function updateOpportunity(id, updates, onDone) {
    if (!Opportunities.isBackendOpportunityId(id)) {
      const found = findOpportunityMutable(id);
      if (found) Object.assign(found.list[found.idx], updates);
      if (onDone) onDone(true);
      return;
    }
    if (typeof ApiClient === "undefined") { if (onDone) onDone(false, "Backend unavailable — could not save changes."); return; }
    const payload = {};
    if (updates.title !== undefined) payload.title = updates.title;
    if (updates.description !== undefined) payload.description = updates.description;
    if (updates.location !== undefined) payload.location = updates.location;
    if (updates.mode !== undefined) payload.mode = updates.mode;
    if (updates.duration !== undefined) payload.duration = updates.duration;
    if (updates.stipend !== undefined) payload.stipend = updates.stipend;
    if (updates.experience !== undefined) payload.experience = updates.experience;
    if (updates.required_skills !== undefined) payload.skills = updates.required_skills;
    if (updates.preferred_skills !== undefined) payload.preferredSkills = updates.preferred_skills;
    if (updates.status !== undefined) payload.status = updates.status;
    ApiClient.updateOpportunity(Opportunities.toDbId(id), payload).then((res) => {
      if (!res.ok) { if (onDone) onDone(false, res.error || "Could not save changes."); return; }
      Opportunities.syncOpportunitiesFromBackend(() => { if (onDone) onDone(true); });
    }).catch(() => { if (onDone) onDone(false, "Could not reach the backend API."); });
  }
  function closeOpportunity(id, onDone) { updateOpportunity(id, { status: "Closed" }, onDone); }
  function reopenOpportunity(id, onDone) { updateOpportunity(id, { status: "Active" }, onDone); }

  // One-time migration: any opportunity this Industry user posted
  // before Step 9 (stored only in localStorage["industry_opportunities"])
  // is submitted to the real backend so it becomes visible to every
  // student, not just this browser. Safe to call on every dashboard
  // load — guarded by opportunities_migrated_v1 so it only ever runs once.
  function migrateLocalOpportunities() {
    if (typeof ApiClient === "undefined") return;
    if (Storage.get("opportunities_migrated_v1", false)) return;
    const legacy = Storage.get("industry_opportunities", []);
    if (!legacy.length) { Storage.set("opportunities_migrated_v1", true); return; }
    let remaining = legacy.length;
    legacy.forEach((o) => {
      ApiClient.createOpportunity({
        title: o.title, type: o.type, domain: o.domain, location: o.location, mode: o.mode,
        duration: o.duration, stipend: o.stipend, experience: o.experience,
        skills: o.required_skills || [], preferredSkills: o.preferred_skills || [],
        description: o.description, company: o.company || getCompanyName(),
      }).catch(() => null).finally(() => {
        remaining--;
        if (remaining === 0) { Storage.set("opportunities_migrated_v1", true); Opportunities.syncOpportunitiesFromBackend(); }
      });
    });
  }

  function renderPostForm(container) {
    if (!hasIndustryProfile()) {
      container.innerHTML = UI.sectionHeader("Post New Opportunity") + `<div class="auth-error" style="background:var(--primary-light);color:var(--primary-dark);">Complete your Industry Profile (Company Name) before posting an opportunity.</div>`;
      return;
    }
    container.innerHTML = UI.sectionHeader("Post New Opportunity") + `
      <form id="post-opp-form">
        <label>Opportunity Title</label><input type="text" id="po-title">
        <div class="grid grid-2">
          <div><label>Opportunity Type</label><select id="po-type">${UI.selectOptions(DATA.OPPORTUNITY_TYPES, null, false)}</select></div>
          <div><label>Domain</label><select id="po-domain">${UI.selectOptions(DATA.OPP_DOMAINS, null, false)}</select></div>
          <div><label>Location</label><select id="po-location">${UI.selectOptions(DATA.LOCATIONS, null, false)}</select></div>
          <div><label>Work Mode</label><select id="po-mode">${UI.selectOptions(DATA.WORK_MODES, null, false)}</select></div>
        </div>
        <label>Duration</label><input type="text" id="po-duration" placeholder="e.g. 6 Months">
        <label>Stipend/Salary</label><input type="text" id="po-stipend" placeholder="e.g. ₹15,000/month">
        <label>Experience Level</label><select id="po-experience">${UI.selectOptions(DATA.EXPERIENCE_LEVELS, null, false)}</select>
        <label>Description</label><textarea id="po-description"></textarea>
        <label>Required Skills (comma-separated)</label><input type="text" id="po-required" placeholder="Python, SQL, Statistics">
        <label>Preferred Skills (comma-separated)</label><input type="text" id="po-preferred" placeholder="Git, Power BI">
        <button type="submit" class="btn btn-primary">Post Opportunity</button>
      </form>`;
    document.getElementById("post-opp-form").onsubmit = (e) => {
      e.preventDefault();
      const title = document.getElementById("po-title").value, domain = document.getElementById("po-domain").value;
      const description = document.getElementById("po-description").value, required = document.getElementById("po-required").value;
      const errors = validateOpportunityFields(title, domain, description, required);
      if (errors.length) { errors.forEach((err) => UI.toast(err, "error")); return; }
      const submitBtn = e.target.querySelector('button[type="submit"]');
      submitBtn.disabled = true;
      createOpportunity({
        title, type: document.getElementById("po-type").value, domain,
        location: document.getElementById("po-location").value, mode: document.getElementById("po-mode").value,
        duration: document.getElementById("po-duration").value, stipend: document.getElementById("po-stipend").value,
        experience: document.getElementById("po-experience").value, description,
        requiredSkillsText: required, preferredSkillsText: document.getElementById("po-preferred").value,
      }, (ok, error, opportunity) => {
        submitBtn.disabled = false;
        if (ok) { UI.toast(`Opportunity posted (ID ${opportunity.id}). See it in My Opportunities.`, "success"); e.target.reset(); }
        else UI.toast(error || "Could not post opportunity.", "warning");
      });
    };
  }

  // Mock seed opportunities are kept visible here for demo continuity
  // (unowned by any real account); real opportunities are filtered
  // down to the ones this authenticated Industry user actually owns —
  // never another Industry account's postings.
  function myOpportunities() {
    const user = Auth.getCurrentUser();
    return Opportunities.loadOpportunities().filter((o) => !Opportunities.isBackendOpportunityId(o.id) || o.industryUserId === (user && user.id));
  }

  function renderMyOpportunities(container) {
    migrateLocalOpportunities();
    Opportunities.syncOpportunitiesFromBackend(() => {
      if (Storage.get("selected_industry_opportunity", null) === null) renderMyOpportunities(container);
    });
    const opportunities = myOpportunities();
    if (!opportunities.length) { container.innerHTML = UI.sectionHeader("My Opportunities") + UI.emptyState("No opportunities yet. Post one in Post New Opportunity."); return; }

    const selectedId = Storage.get("selected_industry_opportunity", null);
    if (selectedId !== null) {
      const opp = Opportunities.getOpportunityById(opportunities, selectedId);
      if (!opp) { Storage.set("selected_industry_opportunity", null); renderMyOpportunities(container); return; }
      renderManageView(container, opp);
      return;
    }

    container.innerHTML = UI.sectionHeader("My Opportunities") + opportunities.map((o) => `
      <div class="card">
        <div class="card-title">${UI.escapeHtml(o.title)}</div>
        <div class="card-sub">${UI.escapeHtml(o.type)} • ${UI.escapeHtml(o.domain)} • ${UI.escapeHtml(o.location)}</div>
        <div>Applications: ${Applications.countApplicationsForOpportunity(o.id)}</div>
        <div>Status: ${UI.badge(o.status || "Active", (o.status || "Active") === "Active" ? "green" : "red")}</div>
        ${o.created_date ? `<div class="muted" style="font-size:.8rem;">Created: ${UI.escapeHtml(o.created_date)}</div>` : ""}
        <button class="btn btn-primary btn-sm manage-opp-btn" data-id="${o.id}" style="margin-top:8px;">Manage</button>
      </div>`).join("");

    container.querySelectorAll(".manage-opp-btn").forEach((btn) => btn.onclick = () => { Storage.set("selected_industry_opportunity", Number(btn.dataset.id)); renderMyOpportunities(container); });
  }

  function renderManageView(container, opportunity) {
    container.innerHTML = `
      <button class="back-link" id="my-opp-back">← Back to My Opportunities</button>
      <h2>${UI.escapeHtml(opportunity.title)}</h2>
      <p><strong>Status:</strong> ${UI.escapeHtml(opportunity.status || "Active")}</p>
      <p>Applications received: ${Applications.countApplicationsForOpportunity(opportunity.id)}</p>
      <div class="btn-row" style="margin-bottom:16px;">
        ${(opportunity.status || "Active") === "Active"
          ? `<button class="btn btn-danger" id="close-opp-btn">Close Opportunity</button>`
          : `<button class="btn btn-success" id="reopen-opp-btn">Reopen Opportunity</button>`}
      </div>
      <hr class="divider">
      ${UI.sectionHeader("Edit Opportunity")}
      <form id="edit-opp-form">
        <label>Title</label><input type="text" id="eo-title" value="${UI.escapeHtml(opportunity.title)}">
        <label>Description</label><textarea id="eo-description">${UI.escapeHtml(opportunity.description)}</textarea>
        <div class="grid grid-2">
          <div><label>Location</label><select id="eo-location">${UI.selectOptions(DATA.LOCATIONS, opportunity.location, false)}</select></div>
          <div><label>Work Mode</label><select id="eo-mode">${UI.selectOptions(DATA.WORK_MODES, opportunity.mode, false)}</select></div>
        </div>
        <label>Duration</label><input type="text" id="eo-duration" value="${UI.escapeHtml(opportunity.duration)}">
        <label>Stipend/Salary</label><input type="text" id="eo-stipend" value="${UI.escapeHtml(opportunity.stipend)}">
        <label>Experience</label><select id="eo-experience">${UI.selectOptions(DATA.EXPERIENCE_LEVELS, opportunity.experience, false)}</select>
        <label>Required Skills (comma-separated)</label><input type="text" id="eo-required" value="${UI.escapeHtml(opportunity.required_skills.join(", "))}">
        <label>Preferred Skills (comma-separated)</label><input type="text" id="eo-preferred" value="${UI.escapeHtml(opportunity.preferred_skills.join(", "))}">
        <button type="submit" class="btn btn-primary">Save Changes</button>
      </form>`;

    document.getElementById("my-opp-back").onclick = () => { Storage.set("selected_industry_opportunity", null); renderMyOpportunities(container); };
    document.getElementById("close-opp-btn")?.addEventListener("click", () => {
      closeOpportunity(opportunity.id, (ok, error) => {
        if (ok) renderManageView(container, Opportunities.getOpportunityById(myOpportunities(), opportunity.id) || opportunity);
        else UI.toast(error || "Could not close opportunity.", "warning");
      });
    });
    document.getElementById("reopen-opp-btn")?.addEventListener("click", () => {
      reopenOpportunity(opportunity.id, (ok, error) => {
        if (ok) renderManageView(container, Opportunities.getOpportunityById(myOpportunities(), opportunity.id) || opportunity);
        else UI.toast(error || "Could not reopen opportunity.", "warning");
      });
    });
    document.getElementById("edit-opp-form").onsubmit = (e) => {
      e.preventDefault();
      const title = document.getElementById("eo-title").value, description = document.getElementById("eo-description").value, required = document.getElementById("eo-required").value;
      const errors = validateOpportunityFields(title, opportunity.domain, description, required);
      if (errors.length) { errors.forEach((err) => UI.toast(err, "error")); return; }
      updateOpportunity(opportunity.id, {
        title: title.trim(), description: description.trim(), location: document.getElementById("eo-location").value,
        mode: document.getElementById("eo-mode").value, duration: document.getElementById("eo-duration").value.trim(),
        stipend: document.getElementById("eo-stipend").value.trim(), experience: document.getElementById("eo-experience").value,
        required_skills: parseSkillList(required), preferred_skills: parseSkillList(document.getElementById("eo-preferred").value),
      }, (ok, error) => {
        if (ok) {
          UI.toast("Opportunity updated.", "success");
          renderManageView(container, Opportunities.getOpportunityById(myOpportunities(), opportunity.id) || opportunity);
        } else UI.toast(error || "Could not update opportunity.", "warning");
      });
    };
  }

  // ---------------- Candidate search & profile ----------------
  function renderCandidateSearch(container) {
    const selectedId = Storage.get("selected_candidate", null);
    if (selectedId !== null) { renderCandidateProfile(container, selectedId); return; }

    const candidates = Candidates.getAllCandidates();
    container.innerHTML = UI.sectionHeader("Candidate Search") + `
      <div class="search-row"><input type="text" id="cand-search" placeholder="Search by name, skill, or target role"></div>
      <div class="filters-row">
        <select id="cand-role-filter"><option value="All">All Roles</option>${UI.selectOptions(Candidates.KNOWN_ROLES, "All", false)}</select>
        <select id="cand-skill-filter"><option value="All">All Skills</option>${UI.selectOptions([...new Set(candidates.flatMap((c) => Object.keys(c.skill_profile)))].sort(), "All", false)}</select>
        <select id="cand-domain-filter"><option value="All">All Domains</option>${UI.selectOptions(DATA.OPP_DOMAINS, "All", false)}</select>
      </div>
      <div id="cand-count" class="muted" style="margin-bottom:8px;"></div>
      <div class="grid grid-auto" id="cand-results"></div>`;

    const rerender = () => {
      const q = (document.getElementById("cand-search").value || "").trim().toLowerCase();
      const roleFilter = document.getElementById("cand-role-filter").value;
      const skillFilter = document.getElementById("cand-skill-filter").value;
      const domainFilter = document.getElementById("cand-domain-filter").value;
      let results = candidates;
      if (q) results = results.filter((c) => [c.name, c.target_role || "", c.domain || "", ...Object.keys(c.skill_profile)].some((v) => v.toLowerCase().includes(q)));
      if (roleFilter !== "All") results = results.filter((c) => c.target_role === roleFilter);
      if (skillFilter !== "All") results = results.filter((c) => skillFilter in c.skill_profile);
      if (domainFilter !== "All") results = results.filter((c) => c.domain === domainFilter);

      document.getElementById("cand-count").textContent = `${results.length} candidate${results.length === 1 ? "" : "s"} found`;
      const grid = document.getElementById("cand-results");
      grid.innerHTML = results.length ? results.map((c) => UI.candidateCard(c)).join("") : UI.emptyState("No candidates match your search and filters.");
      grid.querySelectorAll(".view-cand-btn").forEach((btn) => btn.onclick = () => { const id = btn.dataset.id === "self" ? "self" : Number(btn.dataset.id); Storage.set("selected_candidate", id); renderCandidateSearch(container); });
    };
    ["cand-search", "cand-role-filter", "cand-skill-filter", "cand-domain-filter"].forEach((id) => {
      document.getElementById(id).addEventListener("input", rerender);
      document.getElementById(id).addEventListener("change", rerender);
    });
    rerender();
  }

  function certificationNames(certifications) {
    return (certifications || []).map((c) => (typeof c === "object" ? c.certification_name || "Untitled Certification" : c));
  }

  function renderCandidateProfile(container, candidateId) {
    const candidate = Candidates.getCandidateById(null, candidateId);
    if (!candidate) { container.innerHTML = UI.emptyState("This candidate's profile is no longer available."); return; }

    const gapResult = Candidates.computeCandidateSkillGap(candidate);
    container.innerHTML = `
      <button class="back-link" id="cand-back">← Back</button>
      <h2>${UI.escapeHtml(candidate.name)}</h2>
      <p><strong>Target Career:</strong> ${UI.escapeHtml(candidate.target_role || "Not set")}</p>
      <hr class="divider">
      ${UI.sectionHeader("Skills & Proficiency")}
      ${Object.keys(candidate.skill_profile).length ? Object.entries(candidate.skill_profile).map(([s, v]) => UI.skillBar(s, v)).join("") : `<span class="muted">No skill data available for this candidate yet.</span>`}
      <hr class="divider">
      ${UI.sectionHeader("Certifications")}
      ${certificationNames(candidate.certifications).length ? `<ul class="list-clean">${certificationNames(candidate.certifications).map((n) => `<li>• ${UI.escapeHtml(n)}</li>`).join("")}</ul>` : `<span class="muted">No certifications listed.</span>`}
      <hr class="divider">
      ${UI.sectionHeader("Portfolio")}
      ${(candidate.projects && candidate.projects.length) ? `<ul class="list-clean">${candidate.projects.map((p) => `<li>• ${UI.escapeHtml(p.project_name || "Untitled Project")}</li>`).join("")}</ul>`
        : candidate.portfolio_project_count ? `<p>${candidate.portfolio_project_count} project(s) listed.</p>` : `<span class="muted">No portfolio projects listed.</span>`}
      <hr class="divider">
      ${UI.sectionHeader("Skill Gaps")}
      ${!gapResult ? `<span class="muted">No skill-gap data available for this candidate's target role.</span>` : `
        <p>Readiness for ${UI.escapeHtml(gapResult.target_role)}: ${gapResult.readiness_score}%</p>
        ${gapResult.priority_gaps.length ? gapResult.priority_gaps.map((g) => `<div>✗ ${UI.escapeHtml(g.skill)} (gap: ${g.gap} points)</div>`).join("") : `<div class="auth-success">No significant skill gaps for this role.</div>`}
      `}`;
    document.getElementById("cand-back").onclick = () => { Storage.set("selected_candidate", null); Navigation.activateTab("candidate-search"); };
  }

  // ---------------- Step 14: real backend-backed Student Database Search ----------------
  // Separate from the mock Candidate Search/Talent Discovery above,
  // which stay unchanged since other features (Applications Received's
  // "View Candidate" button, Talent Discovery ranking) still depend on
  // them. This is the real SQLite-backed candidate discovery workflow.
  function readinessBadgeKind(level) { return level === "Ready" ? "green" : level === "Developing" ? "amber" : "red"; }

  function renderRealCandidateSearch(container) {
    const selectedId = Storage.get("selected_real_candidate", null);
    if (selectedId !== null) { renderRealCandidateProfile(container, selectedId); return; }

    container.innerHTML = UI.sectionHeader("Student Database Search", "Real students from the database — skills, projects, and assessments.") + `
      <div class="search-row"><input type="text" id="rc-search" placeholder="Search by name, department, skill, or project title"></div>
      <div class="filters-row">
        <input type="text" id="rc-skill" placeholder="Skill (e.g. Python)">
        <input type="text" id="rc-department" placeholder="Department (e.g. CSE)">
        <select id="rc-proficiency"><option value="">Any Proficiency</option>${UI.selectOptions(["Beginner", "Intermediate", "Advanced"], "", false)}</select>
        <label style="display:flex;align-items:center;gap:4px;font-weight:400;"><input type="checkbox" id="rc-has-projects"> Has Projects</label>
        <label style="display:flex;align-items:center;gap:4px;font-weight:400;"><input type="checkbox" id="rc-has-assessment"> Completed Assessment</label>
      </div>
      <div id="rc-count" class="muted" style="margin-bottom:8px;"></div>
      <div class="grid grid-auto" id="rc-results"></div>`;

    const rerender = () => {
      if (typeof ApiClient === "undefined") return;
      const filters = {
        search: document.getElementById("rc-search").value.trim() || undefined,
        skill: document.getElementById("rc-skill").value.trim() || undefined,
        department: document.getElementById("rc-department").value.trim() || undefined,
        proficiency: document.getElementById("rc-proficiency").value || undefined,
        hasProjects: document.getElementById("rc-has-projects").checked ? "true" : undefined,
        hasAssessment: document.getElementById("rc-has-assessment").checked ? "true" : undefined,
      };
      const grid = document.getElementById("rc-results");
      grid.innerHTML = `<p class="muted">Searching…</p>`;
      ApiClient.searchCandidates(filters).then((res) => {
        if (!res.ok) { grid.innerHTML = UI.emptyState(res.error || "Could not load candidates from the server."); return; }
        const results = res.data.candidates;
        document.getElementById("rc-count").textContent = `${results.length} student${results.length === 1 ? "" : "s"} found`;
        grid.innerHTML = results.length ? results.map((c) => `
          <div class="card">
            <div class="card-row"><div class="card-title">${UI.escapeHtml(c.name)}</div>${c.department ? UI.badge(c.department, "gray") : ""}</div>
            <div class="muted" style="font-size:.82rem;">${c.skills.length} skill(s) · ${c.projectCount} project(s) · ${c.assessmentCompleted ? `Assessed (${c.assessmentScore}%)` : "Not assessed"}</div>
            <div style="margin-top:6px;">${c.skills.slice(0, 5).map((s) => UI.badge(`${s.skillName} · ${s.proficiency}`, "primary")).join(" ")}</div>
            <button class="btn btn-sm view-real-cand-btn" data-id="${c.id}" style="margin-top:8px;">View Profile</button>
          </div>`).join("") : UI.emptyState("No students match your search and filters.");
        grid.querySelectorAll(".view-real-cand-btn").forEach((btn) => btn.onclick = () => { Storage.set("selected_real_candidate", Number(btn.dataset.id)); renderRealCandidateSearch(container); });
      }).catch(() => { grid.innerHTML = UI.emptyState("Could not reach the backend API."); });
    };
    ["rc-search", "rc-skill", "rc-department", "rc-proficiency"].forEach((id) => {
      document.getElementById(id).addEventListener("input", rerender);
      document.getElementById(id).addEventListener("change", rerender);
    });
    ["rc-has-projects", "rc-has-assessment"].forEach((id) => document.getElementById(id).addEventListener("change", rerender));
    rerender();
  }

  function renderRealCandidateProfile(container, candidateId) {
    container.innerHTML = `<p class="muted">Loading student profile…</p>`;
    if (typeof ApiClient === "undefined") return;
    ApiClient.getCandidateDetail(candidateId).then((res) => {
      if (!res.ok) { container.innerHTML = UI.emptyState(res.error || "This student's profile is no longer available."); return; }
      const c = res.data.candidate;
      container.innerHTML = `
        <button class="back-link" id="rc-back">← Back to Student Database Search</button>
        <h2>${UI.escapeHtml(c.name)}</h2>
        <p>${c.department ? `<strong>Department:</strong> ${UI.escapeHtml(c.department)}` : ""}${c.year ? ` · ${UI.escapeHtml(c.year)}` : ""}${c.college ? ` · ${UI.escapeHtml(c.college)}` : ""}</p>
        ${c.location ? `<p class="muted">${UI.escapeHtml(c.location)}</p>` : ""}
        <div style="margin:8px 0;">${UI.badge(`Readiness: ${c.readiness}`, readinessBadgeKind(c.readiness))}</div>
        <hr class="divider">
        ${UI.sectionHeader("Skills & Proficiency")}
        ${c.skills.length ? c.skills.map((s) => `<div class="skill-bar-row"><div class="skill-bar-label"><span>${UI.escapeHtml(s.skillName)}</span><span>${UI.escapeHtml(s.proficiency)}</span></div></div>`).join("") : `<span class="muted">No skill data available for this student yet.</span>`}
        <hr class="divider">
        ${UI.sectionHeader("Projects")}
        ${c.projects.length ? c.projects.map((p) => `<div class="card"><div class="card-title">${UI.escapeHtml(p.title)}</div>${p.description ? `<p>${UI.escapeHtml(p.description)}</p>` : ""}${p.technologies ? `<p class="muted" style="font-size:.82rem;"><strong>Technologies:</strong> ${UI.escapeHtml(p.technologies)}</p>` : ""}</div>`).join("") : `<span class="muted">No projects listed.</span>`}
        <hr class="divider">
        ${UI.sectionHeader("Assessment Summary")}
        ${c.assessment.completed
          ? UI.metricRow([["Overall Score", `${c.assessment.score}%`], ["Skills Assessed", c.assessment.skillScores.length]]) +
            c.assessment.skillScores.slice(0, 6).map((s) => `<div>${UI.skillBar(s.skillName, s.score)}</div>`).join("")
          : `<span class="muted">This student has not completed an assessment yet.</span>`}
      `;
      document.getElementById("rc-back").onclick = () => { Storage.set("selected_real_candidate", null); Navigation.activateTab("real-candidates"); };
    }).catch(() => { container.innerHTML = UI.emptyState("Could not reach the backend API."); });
  }

  // ---------------- Step 16: Industry Live Projects (real backend) ----------------
  function liveProjectStatusBadgeKind(status) {
    return status === "Open" ? "green" : status === "In Progress" ? "primary" : status === "Completed" ? "gray" : "red";
  }

  function renderLiveProjects(container) {
    const selectedId = Storage.get("selected_industry_live_project", null);
    if (selectedId !== null) { renderLiveProjectManage(container, selectedId); return; }

    container.innerHTML = `<p class="muted">Loading your live projects…</p>`;
    if (typeof ApiClient === "undefined") return;
    ApiClient.getLiveProjects().then((res) => {
      if (!res.ok) { container.innerHTML = UI.emptyState(res.error || "Could not load live projects."); return; }
      const user = Auth.getCurrentUser();
      const mine = res.data.projects.filter((p) => p.industryUserId === (user && user.id));

      container.innerHTML = UI.sectionHeader("Live Projects", "Post real industry projects for students to apply to.") + `
        <button class="btn btn-primary" id="lp-new-btn" style="margin-bottom:12px;">+ Post New Live Project</button>
        <div id="lp-form-area"></div>
        <div id="lp-list">${mine.length ? mine.map((p) => `
          <div class="card">
            <div class="card-row"><div class="card-title">${UI.escapeHtml(p.title)}</div>${UI.badge(p.status, liveProjectStatusBadgeKind(p.status))}</div>
            <div class="card-sub">${p.domain ? UI.escapeHtml(p.domain) : ""}${p.capacity ? ` · Capacity: ${p.capacity}` : ""}</div>
            <button class="btn btn-sm manage-lp-btn" data-id="${p.id}" style="margin-top:8px;">Manage</button>
          </div>`).join("") : UI.emptyState("No live projects posted yet.")}</div>`;

      document.getElementById("lp-new-btn").onclick = () => renderLiveProjectForm(document.getElementById("lp-form-area"), null, () => renderLiveProjects(container));
      container.querySelectorAll(".manage-lp-btn").forEach((btn) => btn.onclick = () => { Storage.set("selected_industry_live_project", Number(btn.dataset.id)); renderLiveProjects(container); });
    }).catch(() => { container.innerHTML = UI.emptyState("Could not reach the backend API."); });
  }

  function renderLiveProjectForm(container, existing, onDone) {
    const p = existing || {};
    container.innerHTML = `
      <hr class="divider">
      ${UI.sectionHeader(existing ? "Edit Live Project" : "Post New Live Project")}
      <form id="lp-form">
        <label>Title</label><input type="text" id="lpf-title" value="${UI.escapeHtml(p.title || "")}">
        <label>Description</label><textarea id="lpf-description">${UI.escapeHtml(p.description || "")}</textarea>
        <div class="grid grid-2">
          <div><label>Domain</label><input type="text" id="lpf-domain" value="${UI.escapeHtml(p.domain || "")}"></div>
          <div><label>Mode</label><select id="lpf-mode">${UI.selectOptions(DATA.WORK_MODES, p.mode || "", true, "Select Mode")}</select></div>
        </div>
        <label>Duration</label><input type="text" id="lpf-duration" value="${UI.escapeHtml(p.duration || "")}" placeholder="e.g. 2 Months">
        <label>Required Skills (comma-separated)</label><input type="text" id="lpf-required" value="${UI.escapeHtml((p.requiredSkills || []).join(", "))}">
        <label>Preferred Skills (comma-separated)</label><input type="text" id="lpf-preferred" value="${UI.escapeHtml((p.preferredSkills || []).join(", "))}">
        <div class="grid grid-2">
          <div><label>Capacity (optional)</label><input type="number" id="lpf-capacity" min="1" value="${p.capacity || ""}"></div>
          <div><label>Deadline (optional)</label><input type="date" id="lpf-deadline" value="${p.deadline ? p.deadline.slice(0, 10) : ""}"></div>
        </div>
        <button type="submit" class="btn btn-primary">${existing ? "Save Changes" : "Post Project"}</button>
      </form>`;

    document.getElementById("lp-form").onsubmit = (e) => {
      e.preventDefault();
      const requiredSkills = parseSkillList(document.getElementById("lpf-required").value);
      if (!requiredSkills.length) { UI.toast("At least one required skill is needed.", "error"); return; }
      const fields = {
        title: document.getElementById("lpf-title").value.trim(),
        description: document.getElementById("lpf-description").value.trim(),
        domain: document.getElementById("lpf-domain").value.trim() || null,
        mode: document.getElementById("lpf-mode").value || null,
        duration: document.getElementById("lpf-duration").value.trim() || null,
        requiredSkills, preferredSkills: parseSkillList(document.getElementById("lpf-preferred").value),
        capacity: document.getElementById("lpf-capacity").value ? Number(document.getElementById("lpf-capacity").value) : null,
        deadline: document.getElementById("lpf-deadline").value || null,
      };
      const apiCall = existing ? ApiClient.updateLiveProject(existing.id, fields) : ApiClient.createLiveProject(fields);
      apiCall.then((res) => {
        if (res.ok) { UI.toast(existing ? "Project updated." : "Project posted.", "success"); onDone(); }
        else UI.toast(res.error || "Could not save project.", "warning");
      }).catch(() => UI.toast("Could not reach the backend API.", "warning"));
    };
  }

  function renderLiveProjectManage(container, projectId) {
    container.innerHTML = `<p class="muted">Loading project…</p>`;
    Promise.all([ApiClient.getLiveProject(projectId), ApiClient.getLiveProjectApplicants(projectId)]).then(([projRes, appsRes]) => {
      if (!projRes.ok) { container.innerHTML = UI.emptyState(projRes.error || "Project not found."); return; }
      const p = projRes.data.project;
      const applicants = appsRes.ok ? appsRes.data.applicants : [];

      container.innerHTML = `
        <button class="back-link" id="lp-back">← Back to Live Projects</button>
        <h2>${UI.escapeHtml(p.title)}</h2>
        <div>${UI.badge(p.status, liveProjectStatusBadgeKind(p.status))}</div>
        <div class="btn-row" style="margin:8px 0;">
          <button class="btn btn-sm edit-lp-btn">Edit</button>
          <button class="btn btn-sm btn-danger delete-lp-btn">Delete</button>
          ${p.status === "Open" ? `<button class="btn btn-sm status-lp-btn" data-status="In Progress">Mark In Progress</button>` : ""}
          ${p.status === "In Progress" ? `<button class="btn btn-sm status-lp-btn" data-status="Completed">Mark Completed</button>` : ""}
          ${p.status !== "Closed" ? `<button class="btn btn-sm btn-danger status-lp-btn" data-status="Closed">Close</button>` : ""}
        </div>
        <div id="lp-edit-area"></div>
        <hr class="divider">
        ${UI.sectionHeader("Applicants", "Real students, with Step 10's matching engine reused for each one.")}
        <div id="lp-applicants">${applicants.length ? applicants.map((a) => `
          <div class="card">
            <div class="card-row"><div class="card-title">${UI.escapeHtml(a.studentName)}</div>${UI.badge(a.status, a.status === "Shortlisted" || a.status === "Accepted" ? "green" : a.status === "Rejected" ? "red" : "primary")}</div>
            <div class="muted" style="font-size:.82rem;">Match: ${a.match.matchScore}% — ${UI.escapeHtml(a.match.matchLevel)}</div>
            ${a.coverMessage ? `<p style="font-size:.85rem;">"${UI.escapeHtml(a.coverMessage)}"</p>` : ""}
            <div class="btn-row" style="margin-top:6px;">
              <button class="btn btn-success btn-sm applicant-status-btn" data-id="${a.applicationId}" data-status="Shortlisted">Shortlist</button>
              <button class="btn btn-danger btn-sm applicant-status-btn" data-id="${a.applicationId}" data-status="Rejected">Reject</button>
              <button class="btn btn-sm applicant-status-btn" data-id="${a.applicationId}" data-status="Accepted">Accept</button>
            </div>
          </div>`).join("") : UI.emptyState("No applicants yet.")}</div>
      `;

      document.getElementById("lp-back").onclick = () => { Storage.set("selected_industry_live_project", null); renderLiveProjects(container); };
      document.getElementById("edit-lp-btn").onclick = () => renderLiveProjectForm(document.getElementById("lp-edit-area"), p, () => renderLiveProjectManage(container, projectId));
      document.getElementById("delete-lp-btn").onclick = () => {
        if (!confirm("Delete this live project? This cannot be undone.")) return;
        ApiClient.deleteLiveProject(projectId).then((res) => {
          if (res.ok) { UI.toast("Project deleted.", "success"); Storage.set("selected_industry_live_project", null); renderLiveProjects(container); }
          else UI.toast(res.error || "Could not delete project.", "warning");
        }).catch(() => UI.toast("Could not reach the backend API.", "warning"));
      };
      container.querySelectorAll(".status-lp-btn").forEach((btn) => btn.onclick = () => {
        ApiClient.updateLiveProject(projectId, { status: btn.dataset.status }).then((res) => {
          if (res.ok) renderLiveProjectManage(container, projectId);
          else UI.toast(res.error || "Could not update status.", "warning");
        }).catch(() => UI.toast("Could not reach the backend API.", "warning"));
      });
      container.querySelectorAll(".applicant-status-btn").forEach((btn) => btn.onclick = () => {
        ApiClient.updateLiveProjectApplicantStatus(projectId, Number(btn.dataset.id), btn.dataset.status).then((res) => {
          if (res.ok) { UI.toast(`Applicant ${btn.dataset.status.toLowerCase()}.`, "success"); renderLiveProjectManage(container, projectId); }
          else UI.toast(res.error || "Could not update applicant status.", "warning");
        }).catch(() => UI.toast("Could not reach the backend API.", "warning"));
      });
    }).catch(() => { container.innerHTML = UI.emptyState("Could not reach the backend API."); });
  }

  // ---------------- Step 17: Industry Problem Statements ----------------
  function psStatusBadgeKind(status) {
    return status === "Open" ? "green" : status === "In Progress" ? "primary" : status === "Completed" ? "gray" : "red";
  }
  function psParticipantBadgeKind(status) {
    return status === "Accepted" || status === "Completed" ? "green" : status === "Shortlisted" ? "primary" : status === "Rejected" ? "red" : "amber";
  }

  function renderProblemStatements(container) {
    const selectedId = Storage.get("selected_industry_problem_statement", null);
    if (selectedId !== null) { renderProblemStatementManage(container, selectedId); return; }

    container.innerHTML = `<p class="muted">Loading your problem statements…</p>`;
    if (typeof ApiClient === "undefined") return;
    ApiClient.getProblemStatements().then((res) => {
      if (!res.ok) { container.innerHTML = UI.emptyState(res.error || "Could not load problem statements."); return; }
      const user = Auth.getCurrentUser();
      const mine = res.data.problemStatements.filter((p) => p.industryId === (user && user.id));

      container.innerHTML = UI.sectionHeader("Industry Problem Statements", "Publish real-world challenges for students and faculty to collaborate on.") + `
        <button class="btn btn-primary" id="ps-new-btn" style="margin-bottom:12px;">+ Publish New Problem Statement</button>
        <div id="ps-form-area"></div>
        <div id="ps-list">${mine.length ? mine.map((p) => `
          <div class="card">
            <div class="card-row"><div class="card-title">${UI.escapeHtml(p.title)}</div>${UI.badge(p.status, psStatusBadgeKind(p.status))}</div>
            <div class="card-sub">${p.domain ? UI.escapeHtml(p.domain) : ""}${p.problemCategory ? ` · ${UI.escapeHtml(p.problemCategory)}` : ""}</div>
            <button class="btn btn-sm manage-ps-btn" data-id="${p.id}" style="margin-top:8px;">Manage</button>
          </div>`).join("") : UI.emptyState("No problem statements published yet.")}</div>`;

      document.getElementById("ps-new-btn").onclick = () => renderProblemStatementForm(document.getElementById("ps-form-area"), null, () => renderProblemStatements(container));
      container.querySelectorAll(".manage-ps-btn").forEach((btn) => btn.onclick = () => { Storage.set("selected_industry_problem_statement", Number(btn.dataset.id)); renderProblemStatements(container); });
    }).catch(() => { container.innerHTML = UI.emptyState("Could not reach the backend API."); });
  }

  function renderProblemStatementForm(container, existing, onDone) {
    const p = existing || {};
    container.innerHTML = `
      <hr class="divider">
      ${UI.sectionHeader(existing ? "Edit Problem Statement" : "Publish New Problem Statement")}
      <form id="ps-form">
        <label>Title</label><input type="text" id="psf-title" value="${UI.escapeHtml(p.title || "")}">
        <label>Description (the problem)</label><textarea id="psf-description">${UI.escapeHtml(p.description || "")}</textarea>
        <label>Industry Context</label><textarea id="psf-context">${UI.escapeHtml(p.industryContext || "")}</textarea>
        <label>Expected Outcome</label><textarea id="psf-outcome">${UI.escapeHtml(p.expectedOutcome || "")}</textarea>
        <div class="grid grid-2">
          <div><label>Problem Category</label><input type="text" id="psf-category" value="${UI.escapeHtml(p.problemCategory || "")}" placeholder="e.g. Data Science"></div>
          <div><label>Domain</label><input type="text" id="psf-domain" value="${UI.escapeHtml(p.domain || "")}" placeholder="e.g. Manufacturing"></div>
        </div>
        <div class="grid grid-2">
          <div><label>Mode</label><select id="psf-mode">${UI.selectOptions(DATA.WORK_MODES, p.mode || "", true, "Select Mode")}</select></div>
          <div><label>Duration</label><input type="text" id="psf-duration" value="${UI.escapeHtml(p.duration || "")}" placeholder="e.g. 3 Months"></div>
        </div>
        <label>Required Skills (comma-separated)</label><input type="text" id="psf-required" value="${UI.escapeHtml((p.requiredSkills || []).join(", "))}">
        <label>Preferred Skills (comma-separated)</label><input type="text" id="psf-preferred" value="${UI.escapeHtml((p.preferredSkills || []).join(", "))}">
        <div class="grid grid-2">
          <div><label>Team Size (optional)</label><input type="number" id="psf-teamsize" min="1" value="${p.teamSize || ""}"></div>
          <div><label>Deadline (optional)</label><input type="date" id="psf-deadline" value="${p.deadline ? p.deadline.slice(0, 10) : ""}"></div>
        </div>
        <button type="submit" class="btn btn-primary">${existing ? "Save Changes" : "Publish"}</button>
      </form>`;

    document.getElementById("ps-form").onsubmit = (e) => {
      e.preventDefault();
      const requiredSkills = parseSkillList(document.getElementById("psf-required").value);
      if (!requiredSkills.length) { UI.toast("At least one required skill is needed.", "error"); return; }
      const fields = {
        title: document.getElementById("psf-title").value.trim(),
        description: document.getElementById("psf-description").value.trim(),
        industryContext: document.getElementById("psf-context").value.trim() || null,
        expectedOutcome: document.getElementById("psf-outcome").value.trim() || null,
        problemCategory: document.getElementById("psf-category").value.trim() || null,
        domain: document.getElementById("psf-domain").value.trim() || null,
        mode: document.getElementById("psf-mode").value || null,
        duration: document.getElementById("psf-duration").value.trim() || null,
        requiredSkills, preferredSkills: parseSkillList(document.getElementById("psf-preferred").value),
        teamSize: document.getElementById("psf-teamsize").value ? Number(document.getElementById("psf-teamsize").value) : null,
        deadline: document.getElementById("psf-deadline").value || null,
      };
      const apiCall = existing ? ApiClient.updateProblemStatement(existing.id, fields) : ApiClient.createProblemStatement(fields);
      apiCall.then((res) => {
        if (res.ok) { UI.toast(existing ? "Problem statement updated." : "Problem statement published.", "success"); onDone(); }
        else UI.toast(res.error || "Could not save problem statement.", "warning");
      }).catch(() => UI.toast("Could not reach the backend API.", "warning"));
    };
  }

  function renderProblemStatementManage(container, problemId) {
    container.innerHTML = `<p class="muted">Loading problem statement…</p>`;
    Promise.all([ApiClient.getProblemStatement(problemId), ApiClient.getProblemStatementParticipants(problemId)]).then(([probRes, partRes]) => {
      if (!probRes.ok) { container.innerHTML = UI.emptyState(probRes.error || "Problem statement not found."); return; }
      const p = probRes.data.problemStatement;
      const participants = partRes.ok ? partRes.data.participants : [];

      container.innerHTML = `
        <button class="back-link" id="ps-back">← Back to Problem Statements</button>
        <h2>${UI.escapeHtml(p.title)}</h2>
        <div>${UI.badge(p.status, psStatusBadgeKind(p.status))}</div>
        <div class="btn-row" style="margin:8px 0;">
          <button class="btn btn-sm edit-ps-btn">Edit</button>
          <button class="btn btn-sm btn-danger delete-ps-btn">Delete</button>
          ${p.status === "Open" ? `<button class="btn btn-sm status-ps-btn" data-status="In Progress">Mark In Progress</button>` : ""}
          ${p.status === "In Progress" ? `<button class="btn btn-sm status-ps-btn" data-status="Completed">Mark Completed</button>` : ""}
          ${p.status !== "Closed" ? `<button class="btn btn-sm btn-danger status-ps-btn" data-status="Closed">Close</button>` : ""}
        </div>
        <div id="ps-edit-area"></div>
        <hr class="divider">
        ${UI.sectionHeader("Participants", "Real students who expressed interest — with Step 10's matching engine and Step 14's candidate profile reused for each one.")}
        <div id="ps-participants">${participants.length ? participants.map((pt) => `
          <div class="card">
            <div class="card-row"><div class="card-title">${UI.escapeHtml(pt.student.name)}</div>${UI.badge(pt.status, psParticipantBadgeKind(pt.status))}</div>
            <div class="muted" style="font-size:.82rem;">${pt.student.department ? UI.escapeHtml(pt.student.department) : ""}${pt.student.college ? ` · ${UI.escapeHtml(pt.student.college)}` : ""}${pt.student.year ? ` · ${UI.escapeHtml(pt.student.year)}` : ""}</div>
            <div class="muted" style="font-size:.82rem;">Match: ${pt.match.matchScore}% — ${UI.escapeHtml(pt.match.matchLevel)} · Readiness: ${UI.escapeHtml(pt.student.readiness || "—")}</div>
            ${pt.message ? `<p style="font-size:.85rem;">"${UI.escapeHtml(pt.message)}"</p>` : ""}
            <div style="margin:6px 0;">${(pt.student.skills || []).slice(0, 5).map((s) => UI.badge(`${s.skillName} · ${s.proficiency}`, "primary")).join(" ")}</div>
            <div class="btn-row participant-actions" data-id="${pt.participantId}" data-current="${pt.status}"></div>
          </div>`).join("") : UI.emptyState("No participants yet.")}</div>
      `;

      document.getElementById("ps-back").onclick = () => { Storage.set("selected_industry_problem_statement", null); renderProblemStatements(container); };
      document.getElementById("edit-ps-btn").onclick = () => renderProblemStatementForm(document.getElementById("ps-edit-area"), p, () => renderProblemStatementManage(container, problemId));
      document.getElementById("delete-ps-btn").onclick = () => {
        if (!confirm("Delete this problem statement? This cannot be undone.")) return;
        ApiClient.deleteProblemStatement(problemId).then((res) => {
          if (res.ok) { UI.toast("Problem statement deleted.", "success"); Storage.set("selected_industry_problem_statement", null); renderProblemStatements(container); }
          else UI.toast(res.error || "Could not delete problem statement.", "warning");
        }).catch(() => UI.toast("Could not reach the backend API.", "warning"));
      };
      container.querySelectorAll(".status-ps-btn").forEach((btn) => btn.onclick = () => {
        ApiClient.updateProblemStatement(problemId, { status: btn.dataset.status }).then((res) => {
          if (res.ok) renderProblemStatementManage(container, problemId);
          else UI.toast(res.error || "Could not update status.", "warning");
        }).catch(() => UI.toast("Could not reach the backend API.", "warning"));
      });

      // Only offer valid next transitions per the backend's own rules
      // (Interested->Shortlisted/Rejected, Shortlisted->Accepted/Rejected,
      // Accepted->Completed/Rejected) — never invented client-side.
      const nextStatusOptions = { Interested: ["Shortlisted", "Rejected"], Shortlisted: ["Accepted", "Rejected"], Accepted: ["Completed", "Rejected"], Rejected: [], Completed: [] };
      container.querySelectorAll(".participant-actions").forEach((el) => {
        const options = nextStatusOptions[el.dataset.current] || [];
        el.innerHTML = options.map((s) => `<button class="btn btn-sm ${s === "Rejected" ? "btn-danger" : s === "Accepted" || s === "Completed" ? "btn-success" : ""} ps-participant-status-btn" data-id="${el.dataset.id}" data-status="${s}">${s}</button>`).join(" ");
        el.querySelectorAll(".ps-participant-status-btn").forEach((btn) => btn.onclick = () => {
          ApiClient.updateProblemStatementParticipantStatus(problemId, Number(btn.dataset.id), btn.dataset.status).then((res) => {
            if (res.ok) { UI.toast(`Participant ${btn.dataset.status.toLowerCase()}.`, "success"); renderProblemStatementManage(container, problemId); }
            else UI.toast(res.error || "Could not update participant status.", "warning");
          }).catch(() => UI.toast("Could not reach the backend API.", "warning"));
        });
      });
    }).catch(() => { container.innerHTML = UI.emptyState("Could not reach the backend API."); });
  }

  // ---------------- Talent discovery ----------------
  function renderTalentDiscovery(container) {
    const opportunities = myOpportunities();
    if (!opportunities.length) { container.innerHTML = UI.sectionHeader("Talent Discovery") + UI.emptyState("Post an opportunity first to discover matching candidates."); return; }

    container.innerHTML = UI.sectionHeader("Talent Discovery", "Candidates ranked against one of your opportunities, using the same matching engine students see.") +
      `<select id="td-opp-select">${opportunities.map((o) => `<option value="${o.id}">${UI.escapeHtml(o.title)}</option>`).join("")}</select>
      <div id="td-results"></div>`;

    const rerender = () => {
      const oppId = Number(document.getElementById("td-opp-select").value);
      const opportunity = opportunities.find((o) => o.id === oppId);
      const ranked = Candidates.rankCandidatesForOpportunity(opportunity, null, 5);
      const resultsEl = document.getElementById("td-results");
      if (!ranked.length) { resultsEl.innerHTML = UI.emptyState("No candidates available to rank yet."); return; }
      resultsEl.innerHTML = UI.sectionHeader(`Top Candidates for ${opportunity.title}`) + ranked.map((r, i) => `
        <div class="card">
          <div class="card-title">${i + 1}. ${UI.escapeHtml(r.candidate_name)} — ${r.match_score}%</div>
          ${r.reasons.map((reason) => `<div class="muted" style="font-size:.82rem;">✓ ${UI.escapeHtml(reason)}</div>`).join("")}
          <button class="btn btn-primary btn-sm view-cand-btn" data-id="${r.candidate_id}" style="margin-top:8px;">View Candidate</button>
        </div>`).join("");
      resultsEl.querySelectorAll(".view-cand-btn").forEach((btn) => btn.onclick = () => { const id = btn.dataset.id === "self" ? "self" : Number(btn.dataset.id); Storage.set("selected_candidate", id); Navigation.activateTab("candidate-search"); });
    };
    document.getElementById("td-opp-select").addEventListener("change", rerender);
    rerender();
  }

  // ---------------- Industry analytics (Phase 8 summary + Phase 13 live data) ----------------
  function renderIndustryAnalytics(container) {
    const opportunities = myOpportunities();
    const applications = Applications.getAllCandidateApplications();
    const active = opportunities.filter((o) => (o.status || "Active") === "Active").length;
    const shortlisted = applications.filter((a) => a.status === "Shortlisted").length;

    const demand = AnalyticsMetrics.calculateSkillDemand(opportunities);
    const topSkills = Object.entries(demand).slice(0, 8);

    container.innerHTML = `<div id="ia-live"></div>` +
      UI.sectionHeader("Industry Analytics", "Your own posted opportunities and applications.") +
      UI.metricRow([["Opportunities Posted", opportunities.length], ["Active", active], ["Applications", applications.length], ["Shortlisted", shortlisted]]) +
      UI.sectionHeader("Top Skills in Demand (Your Opportunities' Market)") +
      topSkills.map(([skill, v]) => `<div>${UI.skillBar(skill, Math.min(100, v.total * 10))}<div class="muted" style="font-size:.78rem;margin-top:-6px;">${v.total} opportunities (required: ${v.required}, preferred: ${v.preferred})</div></div>`).join("");

    LiveIndustry.renderIndustryLiveSection(document.getElementById("ia-live"));
  }

  // ---------------- Dashboard ----------------
  function renderDashboard(container) {
    const opportunities = myOpportunities();
    const applications = Applications.getAllCandidateApplications();
    const active = opportunities.filter((o) => (o.status || "Active") === "Active").length;
    const shortlisted = applications.filter((a) => a.status === "Shortlisted").length;

    container.innerHTML = `
      <div class="page-header"><h1>Welcome, ${UI.escapeHtml(getCompanyName())}</h1><p>Your recruiting activity at a glance.</p></div>
      ${UI.metricRow([["Opportunities Posted", opportunities.length], ["Active Opportunities", active], ["Applications Received", applications.length], ["Shortlisted", shortlisted]])}
      <div class="grid grid-2">
        <div class="card"><div class="card-title">Post a New Opportunity</div><p class="muted">Reach students actively browsing internships and jobs.</p><button class="btn btn-primary btn-sm" id="dash-post-btn">Post Opportunity</button></div>
        <div class="card"><div class="card-title">Discover Talent</div><p class="muted">Rank candidates against your open roles using the shared matching engine.</p><button class="btn btn-primary btn-sm" id="dash-discover-btn">Open Talent Discovery</button></div>
      </div>
      <div id="dash-real-candidate-stats"></div>`;
    document.getElementById("dash-post-btn").onclick = () => Navigation.activateTab("post-opportunity");
    document.getElementById("dash-discover-btn").onclick = () => Navigation.activateTab("talent-discovery");
    renderRealCandidatePoolStats(document.getElementById("dash-real-candidate-stats"));
  }

  // Step 14: real candidate-pool size from the database, appended
  // additively below the existing (mock-derived) metrics above.
  function renderRealCandidatePoolStats(container) {
    if (typeof ApiClient === "undefined") return;
    ApiClient.searchCandidates({}).then((res) => {
      if (!res.ok) return;
      const all = res.data.candidates;
      const withSkills = all.filter((c) => c.skills.length > 0).length;
      const withProjects = all.filter((c) => c.projectCount > 0).length;
      const withAssessment = all.filter((c) => c.assessmentCompleted).length;
      container.innerHTML = `
        <hr class="divider">
        ${UI.sectionHeader("Real Student Candidate Pool", "From the Student Database Search tab — live counts from the database.")}
        ${UI.metricRow([["Total Students", all.length], ["With Skills Listed", withSkills], ["With Projects", withProjects], ["Completed Assessment", withAssessment]])}`;
    }).catch(() => { /* backend unavailable — the metrics above still stand */ });
  }

  return {
    hasIndustryProfile, getCompanyName, renderProfile, renderPostForm, renderMyOpportunities,
    renderCandidateSearch, renderRealCandidateSearch, renderTalentDiscovery, renderIndustryAnalytics, renderDashboard,
    renderLiveProjects, renderProblemStatements,
  };
})();
