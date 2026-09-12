/*
 * js/recommendations.js — Department-based Recommended Companies /
 * Jobs / Internships / Skills sections for the Student Dashboard.
 *
 * Real data only: every company/job/internship card below is built
 * directly from Opportunities.loadOpportunities() (DATA.OPPORTUNITIES
 * + any industry-posted opportunities) — never fabricated. Departments
 * with no matching real data (see js/departments.js DEPARTMENT_DOMAINS)
 * correctly render an empty state instead of invented listings. Fields
 * the data model simply doesn't have (company logo, salary structure,
 * founded year, company size, website, application URL) are never
 * invented — cards show "Not specified" / a generic placeholder logo
 * instead. "Skills You Should Learn" uses js/departments.js's
 * reference skill lists, which are general career guidance, not
 * opportunity data.
 */

const Recommendations = (() => {
  function studentSkillSet() {
    const technical = Storage.get("technical_skills", {});
    const soft = Storage.get("soft_skills", {});
    return new Set([...Object.keys(technical || {}), ...Object.keys(soft || {})].map((s) => s.toLowerCase()));
  }

  function getDepartment() {
    const profile = Storage.get("student_profile", {});
    return profile.department || "";
  }

  // ---- Bookmark / save company (mirrors Opportunities.saveOpportunity) ----

  function savedCompanies() {
    return Storage.get("saved_companies", []);
  }
  function isCompanySaved(name) {
    return savedCompanies().includes(name);
  }
  function toggleSavedCompany(name) {
    const list = savedCompanies();
    const idx = list.indexOf(name);
    if (idx === -1) list.push(name); else list.splice(idx, 1);
    Storage.set("saved_companies", list);
    return list.includes(name);
  }

  // ---- Matching (simple, transparent — Department -> Skills -> Education -> Interests) ----

  function matchOpportunity(opportunity, department, skillSet, profile) {
    const domains = Departments.domainsFor(department);
    const deptMatch = domains.length > 0 && domains.includes(opportunity.domain);

    const requiredSkills = opportunity.required_skills || [];
    const skillHits = requiredSkills.filter((s) => skillSet.has(String(s).toLowerCase())).length;
    const skillFraction = requiredSkills.length ? skillHits / requiredSkills.length : 0;

    const eduMatch = !!(profile.degree || profile.current_year);

    const interests = (profile.career_interests || "").toLowerCase();
    const interestMatch = interests && (
      interests.includes((opportunity.domain || "").toLowerCase()) ||
      requiredSkills.some((s) => interests.includes(String(s).toLowerCase()))
    );

    const percent = Math.round(
      (deptMatch ? 40 : 0) + skillFraction * 35 + (eduMatch ? 15 : 0) + (interestMatch ? 10 : 0)
    );

    return { percent: Math.min(100, percent), deptMatch, skillMatch: skillHits > 0, eduMatch, interestMatch };
  }

  // Same weighting as matchOpportunity, applied to a company's
  // aggregated domains/skills rather than a single opportunity — reuses
  // the identical algorithm instead of introducing a second one.
  function matchCompany(company, department, skillSet, profile) {
    const domains = Departments.domainsFor(department);
    const deptMatch = domains.length > 0 && company.domains.some((d) => domains.includes(d));

    const skillHits = company.skills.filter((s) => skillSet.has(String(s).toLowerCase())).length;
    const skillFraction = company.skills.length ? skillHits / company.skills.length : 0;

    const eduMatch = !!(profile.degree || profile.current_year);

    const interests = (profile.career_interests || "").toLowerCase();
    const interestMatch = interests && (
      company.domains.some((d) => interests.includes(d.toLowerCase())) ||
      company.skills.some((s) => interests.includes(String(s).toLowerCase()))
    );

    const percent = Math.round(
      (deptMatch ? 40 : 0) + skillFraction * 35 + (eduMatch ? 15 : 0) + (interestMatch ? 10 : 0)
    );

    return { percent: Math.min(100, percent), deptMatch, skillMatch: skillHits > 0, eduMatch, interestMatch };
  }

  function matchesQuery(o, query) {
    if (!query) return true;
    const q = query.toLowerCase();
    const haystack = [o.title, o.company, o.domain, o.location, ...(o.required_skills || []), ...(o.preferred_skills || [])].join(" ").toLowerCase();
    return haystack.includes(q);
  }

  // Best-effort numeric value extracted from a stipend/salary string,
  // used only to sort by "Highest Salary" — the original text is
  // always what's actually displayed, never a computed number.
  function parseSalaryValue(text) {
    if (!text) return 0;
    const matches = String(text).match(/[\d,]{3,}/g);
    if (!matches) return 0;
    return Math.max(...matches.map((m) => parseInt(m.replace(/,/g, ""), 10) || 0));
  }

  function relevantOpportunities(type, filters = {}) {
    const department = filters.department !== undefined ? filters.department : getDepartment();
    const skillSet = studentSkillSet();
    const profile = Storage.get("student_profile", {});
    const domains = Departments.domainsFor(department);

    let all = Opportunities.loadOpportunities().filter((o) => (o.status || "Active") === "Active" && o.type === type);
    if (filters.location) all = all.filter((o) => o.location === filters.location);
    if (filters.query) all = all.filter((o) => matchesQuery(o, filters.query));

    const scored = all.map((o) => ({ opportunity: o, match: matchOpportunity(o, department, skillSet, profile) }));

    // Without a recognized department (or one with no mapped real
    // domains), fall back to pure skill-based relevance so the
    // sections aren't empty just because the department field is new.
    const relevant = domains.length
      ? scored.filter((s) => s.match.deptMatch || s.match.skillMatch)
      : scored.filter((s) => s.match.skillMatch);

    const pool = relevant.length ? relevant : scored.filter((s) => s.match.percent > 0 || filters.query || filters.location);
    return pool.sort((a, b) => b.match.percent - a.match.percent).slice(0, 6);
  }

  // Builds enriched company profiles from real opportunity data only.
  // Every field either comes straight from an opportunity (location,
  // stipend text, skills, description) or is left as "Not specified" /
  // an empty array — nothing here is invented.
  function relevantCompanies(filters = {}) {
    const department = filters.department !== undefined ? filters.department : getDepartment();
    const domains = Departments.domainsFor(department);
    const skillSet = studentSkillSet();
    const profile = Storage.get("student_profile", {});

    let all = Opportunities.loadOpportunities().filter((o) => (o.status || "Active") === "Active");
    if (filters.location) all = all.filter((o) => o.location === filters.location);
    if (filters.query) all = all.filter((o) => matchesQuery(o, filters.query));
    let pool = domains.length ? all.filter((o) => domains.includes(o.domain)) : all;

    const byCompany = new Map();
    for (const o of pool) {
      if (!byCompany.has(o.company)) {
        byCompany.set(o.company, {
          name: o.company, domains: new Set(), locations: new Set(), stipends: new Set(),
          jobs: 0, internships: 0, skills: new Set(), description: "", opportunityIds: [],
        });
      }
      const entry = byCompany.get(o.company);
      entry.domains.add(o.domain);
      if (o.location) entry.locations.add(o.location);
      if (o.stipend) entry.stipends.add(o.stipend);
      if (o.type === "Job") entry.jobs++;
      if (o.type === "Internship") entry.internships++;
      (o.required_skills || []).forEach((s) => entry.skills.add(s));
      if (!entry.description && o.description) entry.description = o.description;
      entry.opportunityIds.push(o.id);
    }

    let companies = [...byCompany.values()].map((c) => {
      const company = {
        name: c.name,
        domains: [...c.domains],
        locations: [...c.locations],
        stipends: [...c.stipends],
        jobs: c.jobs,
        internships: c.internships,
        skills: [...c.skills],
        description: c.description || "",
        opportunityIds: c.opportunityIds,
      };
      company.match = matchCompany(company, department, skillSet, profile);
      company.salaryValue = Math.max(0, ...company.stipends.map(parseSalaryValue));
      return company;
    });

    if (filters.industry) companies = companies.filter((c) => c.domains.includes(filters.industry));
    if (filters.internshipOnly) companies = companies.filter((c) => c.internships > 0);
    if (filters.jobsOnly) companies = companies.filter((c) => c.jobs > 0);

    const sortBy = filters.sortBy || "match";
    companies.sort((a, b) => {
      if (sortBy === "salary") return b.salaryValue - a.salaryValue;
      if (sortBy === "opportunities") return (b.jobs + b.internships) - (a.jobs + a.internships);
      if (sortBy === "location") return (a.locations[0] || "").localeCompare(b.locations[0] || "");
      return b.match.percent - a.match.percent;
    });

    return companies.slice(0, 6);
  }

  function skillGaps() {
    const department = getDepartment();
    const deptSkills = Departments.skillsFor(department);
    const skillSet = studentSkillSet();
    const have = deptSkills.filter((s) => skillSet.has(s.toLowerCase()));
    const missing = deptSkills.filter((s) => !skillSet.has(s.toLowerCase()));
    return { have, missing };
  }

  // ---- Rendering ----

  function matchBadge(percent) {
    const cls = percent >= 70 ? "green" : percent >= 40 ? "amber" : "gray";
    return `<span class="rec-match-badge rec-match-${cls}">🎯 ${percent}% Match</span>`;
  }

  function opportunityCard(entry) {
    const o = entry.opportunity, m = entry.match;
    return `
      <div class="rec-card">
        <div class="rec-card-title">${UI.escapeHtml(o.title)}</div>
        <div class="rec-card-sub">${UI.escapeHtml(o.company)} &middot; ${UI.escapeHtml(o.location)} &middot; ${UI.escapeHtml(o.type)}</div>
        <div class="rec-card-skills">${(o.required_skills || []).slice(0, 5).map((s) => `<span class="rec-skill-chip">${UI.escapeHtml(s)}</span>`).join("")}</div>
        <div class="rec-card-flags">
          ${m.deptMatch ? "Department Match: ✓ " : ""}${m.skillMatch ? "Skill Match: ✓ " : ""}${m.eduMatch ? "Education Match: ✓" : ""}
        </div>
        ${matchBadge(m.percent)}
        <button type="button" class="btn btn-sm btn-primary rec-view-btn" data-id="${o.id}">View Opportunity</button>
      </div>`;
  }

  function companyLogoPlaceholder(name) {
    const initials = (name || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("");
    // Deterministic (not random) color per company name, so the same
    // company always gets the same placeholder — never presented as a real logo.
    const hue = [...name].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 360, 0);
    return `<div class="rec-logo-placeholder" style="background:hsl(${hue},55%,88%);color:hsl(${hue},45%,32%);" aria-label="${UI.escapeHtml(name)} logo placeholder">${UI.escapeHtml(initials || "?")}</div>`;
  }

  function formatSalary(company) {
    if (!company.stipends.length) return "Salary not disclosed";
    return company.stipends.join(" • ");
  }

  function formatLocations(company) {
    if (!company.locations.length) return "Location not specified";
    return company.locations.join(" • ");
  }

  function companyCard(c, department) {
    const saved = isCompanySaved(c.name);
    const deptRelevant = department && Departments.domainsFor(department).some((d) => c.domains.includes(d));
    return `
      <div class="rec-card rec-company-card">
        <button type="button" class="rec-bookmark-btn ${saved ? "saved" : ""}" data-company="${UI.escapeHtml(c.name)}" aria-label="${saved ? "Remove bookmark" : "Save company"}" title="${saved ? "Saved ✓" : "Save company"}">${saved ? "🔖" : "🔖"}</button>
        ${companyLogoPlaceholder(c.name)}
        <div class="rec-card-title">${UI.escapeHtml(c.name)}</div>
        <div class="rec-card-sub">${c.domains.length ? UI.escapeHtml(c.domains.join(" / ")) : "Industry not specified"}</div>
        <div class="rec-card-sub">📍 ${UI.escapeHtml(formatLocations(c))}</div>
        <div class="rec-card-sub">💰 ${UI.escapeHtml(formatSalary(c))}</div>
        <div class="rec-card-flags">
          ${c.jobs ? `💼 ${c.jobs} Job Opening${c.jobs === 1 ? "" : "s"}` : "💼 No current job openings"}<br>
          ${c.internships ? `🎓 ${c.internships} Internship${c.internships === 1 ? "" : "s"}` : "🎓 No current internships"}
        </div>
        ${c.skills.length ? `<div class="rec-card-skills">${c.skills.slice(0, 6).map((s) => `<span class="rec-skill-chip">${UI.escapeHtml(s)}</span>`).join("")}</div>` : ""}
        ${deptRelevant ? `<div class="rec-dept-relevant">✓ Relevant for ${UI.escapeHtml(department)}</div>` : ""}
        ${matchBadge(c.match.percent)}
        ${c.description ? `<p class="rec-card-desc">${UI.escapeHtml(c.description.slice(0, 140))}${c.description.length > 140 ? "…" : ""}</p>` : ""}
        <button type="button" class="btn btn-sm btn-primary rec-view-company-btn" data-company="${UI.escapeHtml(c.name)}">View Details</button>
      </div>`;
  }

  function skillSection(department) {
    const { have, missing } = skillGaps();
    if (!Departments.skillsFor(department).length) {
      return `<p class="muted">Set your department in My Profile to get personalized skill suggestions.</p>`;
    }
    return `
      ${have.length ? `<p><strong>Your skills:</strong> ${have.map((s) => `${UI.escapeHtml(s)} ✓`).join(", ")}</p>` : ""}
      ${missing.length
        ? `<p><strong>Recommended skills:</strong></p><div class="rec-card-skills">${missing.map((s) => `<span class="rec-skill-chip rec-skill-missing">${UI.escapeHtml(s)}</span>`).join("")}</div>`
        : `<p class="muted">You already have every core skill typically recommended for this department. 🎉</p>`}
    `;
  }

  // ---- Company Detail modal ----

  function closeModal() {
    const overlay = document.getElementById("rec-company-modal");
    if (overlay) overlay.remove();
  }

  function openCompanyDetail(company) {
    closeModal();
    const allOpps = Opportunities.loadOpportunities();
    const companyOpps = allOpps.filter((o) => company.opportunityIds.includes(o.id));
    const jobs = companyOpps.filter((o) => o.type === "Job");
    const internships = companyOpps.filter((o) => o.type === "Internship");
    const others = companyOpps.filter((o) => o.type !== "Job" && o.type !== "Internship");
    const m = company.match;

    const oppRow = (o) => `
      <div class="rec-modal-opp">
        <div class="rec-card-title" style="font-size:.9rem;">${UI.escapeHtml(o.title)}</div>
        <div class="rec-card-sub">${UI.escapeHtml(o.location)} &middot; ${UI.escapeHtml(o.type)} &middot; ${UI.escapeHtml(o.experience || "")}</div>
        <div class="rec-card-sub">💰 ${UI.escapeHtml(o.stipend || "Not specified")}</div>
        <div class="rec-card-skills">${(o.required_skills || []).map((s) => `<span class="rec-skill-chip">${UI.escapeHtml(s)}</span>`).join("")}</div>
        <button type="button" class="btn btn-sm rec-modal-view-opp" data-id="${o.id}">View Opportunity</button>
      </div>`;

    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.id = "rec-company-modal";
    overlay.innerHTML = `
      <div class="modal-box rec-modal-box">
        <button type="button" class="rec-modal-close" aria-label="Close">✕</button>
        <div class="rec-modal-header">
          ${companyLogoPlaceholder(company.name)}
          <div>
            <h3 style="margin:0;">${UI.escapeHtml(company.name)}</h3>
            <div class="muted">${company.domains.length ? UI.escapeHtml(company.domains.join(" / ")) : "Industry not specified"}</div>
          </div>
        </div>
        <div class="rec-card-sub">📍 ${UI.escapeHtml(formatLocations(company))}</div>
        ${company.description ? `<p>${UI.escapeHtml(company.description)}</p>` : `<p class="muted">No description available yet.</p>`}
        <hr class="divider">
        ${UI.sectionHeader("Your Match", `${m.percent}% overall`)}
        ${matchBadge(m.percent)}
        <ul class="list-clean" style="margin-top:8px;">
          <li>${m.deptMatch ? "✓" : "—"} Department match</li>
          <li>${m.skillMatch ? "✓" : "—"} Skill match</li>
          <li>${m.eduMatch ? "✓" : "—"} Education match</li>
        </ul>
        <hr class="divider">
        ${UI.sectionHeader("Skills", "Required across this company's current opportunities")}
        <div class="rec-card-skills">${company.skills.length ? company.skills.map((s) => `<span class="rec-skill-chip">${UI.escapeHtml(s)}</span>`).join("") : `<span class="muted">Not specified</span>`}</div>
        <hr class="divider">
        ${UI.sectionHeader("Jobs")}
        ${jobs.length ? jobs.map(oppRow).join("") : `<p class="muted">No current job openings.</p>`}
        ${UI.sectionHeader("Internships")}
        ${internships.length ? internships.map(oppRow).join("") : `<p class="muted">No current internships.</p>`}
        ${others.length ? UI.sectionHeader("Other Opportunities") + others.map(oppRow).join("") : ""}
      </div>`;

    document.body.appendChild(overlay);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) closeModal(); });
    overlay.querySelector(".rec-modal-close").onclick = closeModal;
    overlay.querySelectorAll(".rec-modal-view-opp").forEach((btn) => btn.onclick = () => {
      closeModal();
      Storage.set("selected_opportunity_id", Number(btn.dataset.id));
      Navigation.activateTab("opportunities");
    });
  }

  function wireCardButtons(container, companiesById) {
    container.querySelectorAll(".rec-view-btn").forEach((btn) => btn.onclick = () => {
      Storage.set("selected_opportunity_id", Number(btn.dataset.id));
      Navigation.activateTab("opportunities");
    });
    container.querySelectorAll(".rec-view-company-btn").forEach((btn) => btn.onclick = () => {
      const company = companiesById.get(btn.dataset.company);
      if (company) openCompanyDetail(company);
    });
    container.querySelectorAll(".rec-bookmark-btn").forEach((btn) => btn.onclick = () => {
      const saved = toggleSavedCompany(btn.dataset.company);
      btn.classList.toggle("saved", saved);
      btn.title = saved ? "Saved ✓" : "Save company";
      UI.toast(saved ? "Company saved" : "Removed from saved companies", "success");
    });
  }

  function renderDashboardSection(container) {
    const department = getDepartment();
    const roleSuggestions = Departments.roleSuggestionsFor(department);
    const companyCategories = Departments.companyCategoriesFor(department);
    const allDomains = DATA.OPP_DOMAINS;

    container.innerHTML = `
      <hr class="divider">
      <div class="rec-dept-banner">
        <div>
          <strong>Department:</strong> ${department ? UI.escapeHtml(department) : `<span class="muted">Not set — add it in My Profile for tailored recommendations.</span>`}
        </div>
        ${roleSuggestions.length ? `<div class="muted" style="font-size:.82rem;margin-top:4px;">Typical roles in this field: ${roleSuggestions.join(", ")}</div>` : ""}
      </div>

      <div class="rec-filter-bar">
        <input type="text" id="rec-search" placeholder="Search jobs, companies or internships...">
        <select id="rec-dept-filter"><option value="">All Departments</option>${UI.selectOptions(Departments.DEPARTMENTS, department, false)}</select>
        <select id="rec-location-filter"><option value="">All Locations</option>${UI.selectOptions(DATA.LOCATIONS, "", false)}</select>
      </div>

      ${UI.sectionHeader("🏢 Recommended Companies")}
      ${companyCategories.length ? `<div class="muted" style="font-size:.82rem;margin-bottom:8px;">Relevant industry categories: ${companyCategories.join(", ")}</div>` : ""}
      <div class="rec-filter-bar">
        <select id="rec-company-sort">
          <option value="match">Sort by: Best Match</option>
          <option value="salary">Sort by: Highest Salary</option>
          <option value="opportunities">Sort by: Most Opportunities</option>
          <option value="location">Sort by: Location</option>
        </select>
        <select id="rec-company-industry"><option value="">All Industries</option>${UI.selectOptions(allDomains, "", false)}</select>
        <label style="display:flex;align-items:center;gap:4px;font-weight:400;"><input type="checkbox" id="rec-company-internship-only"> Internship Available</label>
        <label style="display:flex;align-items:center;gap:4px;font-weight:400;"><input type="checkbox" id="rec-company-jobs-only"> Jobs Available</label>
      </div>
      <div class="rec-grid" id="rec-companies"></div>

      ${UI.sectionHeader("💼 Recommended Jobs")}
      <div class="rec-grid" id="rec-jobs"></div>

      ${UI.sectionHeader("🎓 Recommended Internships")}
      <div class="rec-grid" id="rec-internships"></div>

      ${UI.sectionHeader("🧠 Skills You Should Learn")}
      <div id="rec-skills"></div>
    `;

    function refresh() {
      const filters = {
        query: document.getElementById("rec-search").value.trim(),
        department: document.getElementById("rec-dept-filter").value,
        location: document.getElementById("rec-location-filter").value,
      };
      const effectiveDept = filters.department !== undefined && filters.department !== "" ? filters.department : department;

      const companyFilters = {
        ...filters,
        sortBy: document.getElementById("rec-company-sort").value,
        industry: document.getElementById("rec-company-industry").value,
        internshipOnly: document.getElementById("rec-company-internship-only").checked,
        jobsOnly: document.getElementById("rec-company-jobs-only").checked,
      };

      const companies = relevantCompanies(companyFilters);
      const companiesById = new Map(companies.map((c) => [c.name, c]));
      const companiesEl = document.getElementById("rec-companies");
      companiesEl.innerHTML = companies.length ? companies.map((c) => companyCard(c, effectiveDept)).join("") : UI.emptyState("No matching opportunities are available yet.");
      wireCardButtons(companiesEl, companiesById);

      const jobs = relevantOpportunities("Job", filters);
      const jobsEl = document.getElementById("rec-jobs");
      jobsEl.innerHTML = jobs.length ? jobs.map(opportunityCard).join("") : UI.emptyState("No matching opportunities are available yet.");
      wireCardButtons(jobsEl, companiesById);

      const internships = relevantOpportunities("Internship", filters);
      const internshipsEl = document.getElementById("rec-internships");
      internshipsEl.innerHTML = internships.length ? internships.map(opportunityCard).join("") : UI.emptyState("No matching opportunities are available yet.");
      wireCardButtons(internshipsEl, companiesById);
    }

    ["rec-search", "rec-dept-filter", "rec-location-filter", "rec-company-sort", "rec-company-industry", "rec-company-internship-only", "rec-company-jobs-only"].forEach((id) => {
      document.getElementById(id).addEventListener("input", refresh);
      document.getElementById(id).addEventListener("change", refresh);
    });

    document.getElementById("rec-skills").innerHTML = skillSection(department);
    refresh();
  }

  return {
    getDepartment, relevantOpportunities, relevantCompanies, skillGaps,
    matchOpportunity, matchCompany, renderDashboardSection,
    isCompanySaved, toggleSavedCompany,
  };
})();
