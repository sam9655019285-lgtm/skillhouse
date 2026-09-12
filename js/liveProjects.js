/*
 * liveProjects.js — Step 16, student-facing browse/detail/apply for
 * Industry Live Projects (backend/routes/industryProjects.js). Real
 * backend data only — no mock catalog, unlike js/opportunities.js's
 * mock-seed-plus-real-backend blend, since live projects never
 * existed as mock data to begin with.
 */

const LiveProjects = (() => {
  function statusBadgeKind(status) {
    return status === "Open" ? "green" : status === "In Progress" ? "primary" : status === "Completed" ? "gray" : "red";
  }

  function renderBrowse(container) {
    container.innerHTML = `<p class="muted">Loading live projects…</p>`;
    if (typeof ApiClient === "undefined") return;
    ApiClient.getLiveProjects().then((res) => {
      if (!res.ok) { container.innerHTML = UI.emptyState(res.error || "Could not load live projects."); return; }
      const projects = res.data.projects;

      container.innerHTML = UI.sectionHeader("Live Projects", "Real industry projects — apply directly, no mock data.") + `
        <div class="search-row"><input type="text" id="lp-search" placeholder="Search by title or skill"></div>
        <div class="filters-row">
          <select id="lp-domain"><option value="All">All Domains</option>${UI.selectOptions([...new Set(projects.map((p) => p.domain).filter(Boolean))].sort(), "All", false)}</select>
          <select id="lp-mode"><option value="All">All Modes</option>${UI.selectOptions([...new Set(projects.map((p) => p.mode).filter(Boolean))].sort(), "All", false)}</select>
          <input type="text" id="lp-skill" placeholder="Skill (e.g. Python)">
        </div>
        <div id="lp-count" class="muted" style="margin-bottom:8px;"></div>
        <div class="grid grid-auto" id="lp-results"></div>`;

      const rerender = () => {
        const q = document.getElementById("lp-search").value.trim().toLowerCase();
        const domain = document.getElementById("lp-domain").value;
        const mode = document.getElementById("lp-mode").value;
        const skill = document.getElementById("lp-skill").value.trim().toLowerCase();
        let results = projects;
        if (q) results = results.filter((p) => p.title.toLowerCase().includes(q) || p.requiredSkills.some((s) => s.toLowerCase().includes(q)));
        if (domain !== "All") results = results.filter((p) => p.domain === domain);
        if (mode !== "All") results = results.filter((p) => p.mode === mode);
        if (skill) results = results.filter((p) => [...p.requiredSkills, ...p.preferredSkills].some((s) => s.toLowerCase().includes(skill)));

        document.getElementById("lp-count").textContent = `${results.length} project${results.length === 1 ? "" : "s"} found`;
        const grid = document.getElementById("lp-results");
        grid.innerHTML = results.length ? results.map((p) => `
          <div class="card">
            <div class="card-row"><div class="card-title">${UI.escapeHtml(p.title)}</div>${UI.badge(p.status, statusBadgeKind(p.status))}</div>
            <div class="card-sub">${p.domain ? UI.escapeHtml(p.domain) : ""}${p.mode ? ` · ${UI.escapeHtml(p.mode)}` : ""}${p.duration ? ` · ${UI.escapeHtml(p.duration)}` : ""}</div>
            <div style="margin:6px 0;">${p.requiredSkills.slice(0, 4).map((s) => UI.badge(s, "primary")).join(" ")}</div>
            ${p.deadline ? `<div class="muted" style="font-size:.8rem;">Deadline: ${UI.escapeHtml(p.deadline)}</div>` : ""}
            <button class="btn btn-sm view-lp-btn" data-id="${p.id}" style="margin-top:8px;">View Details</button>
          </div>`).join("") : UI.emptyState("No live projects match your search and filters.");
        grid.querySelectorAll(".view-lp-btn").forEach((btn) => btn.onclick = () => { Storage.set("selected_live_project", Number(btn.dataset.id)); renderSection(container); });
      };
      ["lp-search", "lp-domain", "lp-mode", "lp-skill"].forEach((id) => {
        document.getElementById(id).addEventListener("input", rerender);
        document.getElementById(id).addEventListener("change", rerender);
      });
      rerender();
    }).catch(() => { container.innerHTML = UI.emptyState("Could not reach the backend API."); });
  }

  function renderDetail(container, projectId) {
    container.innerHTML = `<p class="muted">Loading project…</p>`;
    ApiClient.getLiveProject(projectId).then((res) => {
      if (!res.ok) { container.innerHTML = UI.emptyState(res.error || "This project is no longer available."); return; }
      const p = res.data.project;
      container.innerHTML = `
        <button class="back-link" id="lp-back">← Back to Live Projects</button>
        <h2>${UI.escapeHtml(p.title)}</h2>
        <div>${UI.badge(p.status, statusBadgeKind(p.status))}</div>
        <div class="grid grid-3" style="margin-top:8px;">
          <div><strong>Domain:</strong> ${p.domain ? UI.escapeHtml(p.domain) : "Not specified"}</div>
          <div><strong>Mode:</strong> ${p.mode ? UI.escapeHtml(p.mode) : "Not specified"}</div>
          <div><strong>Duration:</strong> ${p.duration ? UI.escapeHtml(p.duration) : "Not specified"}</div>
        </div>
        ${p.deadline ? `<p><strong>Deadline:</strong> ${UI.escapeHtml(p.deadline)}</p>` : ""}
        <hr class="divider">
        ${UI.sectionHeader("Description")}<p>${UI.escapeHtml(p.description)}</p>
        <div class="grid grid-2">
          <div>${UI.sectionHeader("Required Skills")}<ul class="list-clean">${p.requiredSkills.map((s) => `<li>• ${UI.escapeHtml(s)}</li>`).join("")}</ul></div>
          <div>${UI.sectionHeader("Preferred Skills")}<ul class="list-clean">${p.preferredSkills.length ? p.preferredSkills.map((s) => `<li>• ${UI.escapeHtml(s)}</li>`).join("") : '<li class="muted">None listed.</li>'}</ul></div>
        </div>
        <div id="lp-match"></div>
        <hr class="divider">
        <div id="lp-apply-area"></div>
      `;
      document.getElementById("lp-back").onclick = () => { Storage.set("selected_live_project", null); renderSection(container); };

      ApiClient.getStudentApplications().then((appsRes) => {
        const applied = appsRes.ok && appsRes.data.applications.some((a) => a.opportunityId === projectId);
        const applyArea = document.getElementById("lp-apply-area");
        if (applied) {
          applyArea.innerHTML = `<span class="badge badge-primary">You have already applied to this project.</span>`;
        } else if (p.status !== "Open") {
          applyArea.innerHTML = `<span class="muted">This project is not currently accepting applications.</span>`;
        } else {
          applyArea.innerHTML = `<button class="btn btn-primary" id="lp-apply-btn">Apply</button>`;
          document.getElementById("lp-apply-btn").onclick = () => {
            document.getElementById("lp-apply-btn").disabled = true;
            ApiClient.applyToLiveProject(projectId, {}).then((res2) => {
              if (res2.ok) { UI.toast("Application submitted!", "success"); renderDetail(container, projectId); }
              else { UI.toast(res2.error || "Could not submit application.", "warning"); document.getElementById("lp-apply-btn").disabled = false; }
            }).catch(() => UI.toast("Could not reach the backend API.", "warning"));
          };
        }
      });
    }).catch(() => { container.innerHTML = UI.emptyState("Could not reach the backend API."); });
  }

  function renderSection(container) {
    const selectedId = Storage.get("selected_live_project", null);
    if (selectedId !== null) { renderDetail(container, selectedId); return; }
    renderBrowse(container);
  }

  return { renderSection };
})();
