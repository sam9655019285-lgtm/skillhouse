/*
 * problemStatements.js — Step 17, browse/detail/interest for Industry
 * Problem Statements (backend/routes/problemStatements.js). Shared by
 * student.html (full access incl. Express Interest) and
 * academician.html (browse/view-only — no participation table entry
 * for academicians, per the architecture inspection in Step 17).
 * Real backend data only, no mock catalog.
 */

const ProblemStatements = (() => {
  function statusBadgeKind(status) {
    return status === "Open" ? "green" : status === "In Progress" ? "primary" : status === "Completed" ? "gray" : "red";
  }

  function renderBrowse(container, { allowInterest }) {
    container.innerHTML = `<p class="muted">Loading problem statements…</p>`;
    if (typeof ApiClient === "undefined") return;
    ApiClient.getProblemStatements().then((res) => {
      if (!res.ok) { container.innerHTML = UI.emptyState(res.error || "Could not load problem statements."); return; }
      const problems = res.data.problemStatements;

      container.innerHTML = UI.sectionHeader("Industry Problem Statements", "Real-world challenges published by industry partners — not a job listing.") + `
        <div class="search-row"><input type="text" id="ps-search" placeholder="Search by title or skill"></div>
        <div class="filters-row">
          <select id="ps-domain"><option value="All">All Domains</option>${UI.selectOptions([...new Set(problems.map((p) => p.domain).filter(Boolean))].sort(), "All", false)}</select>
          <select id="ps-category"><option value="All">All Categories</option>${UI.selectOptions([...new Set(problems.map((p) => p.problemCategory).filter(Boolean))].sort(), "All", false)}</select>
          <select id="ps-mode"><option value="All">All Modes</option>${UI.selectOptions([...new Set(problems.map((p) => p.mode).filter(Boolean))].sort(), "All", false)}</select>
          <input type="text" id="ps-skill" placeholder="Skill (e.g. Python)">
        </div>
        <div id="ps-count" class="muted" style="margin-bottom:8px;"></div>
        <div class="grid grid-auto" id="ps-results"></div>
        ${allowInterest ? `<hr class="divider"><div id="ps-my-participation"></div>` : ""}`;

      if (allowInterest) renderMyParticipation(document.getElementById("ps-my-participation"));

      const rerender = () => {
        const q = document.getElementById("ps-search").value.trim().toLowerCase();
        const domain = document.getElementById("ps-domain").value;
        const category = document.getElementById("ps-category").value;
        const mode = document.getElementById("ps-mode").value;
        const skill = document.getElementById("ps-skill").value.trim().toLowerCase();
        let results = problems;
        if (q) results = results.filter((p) => p.title.toLowerCase().includes(q) || p.requiredSkills.some((s) => s.toLowerCase().includes(q)));
        if (domain !== "All") results = results.filter((p) => p.domain === domain);
        if (category !== "All") results = results.filter((p) => p.problemCategory === category);
        if (mode !== "All") results = results.filter((p) => p.mode === mode);
        if (skill) results = results.filter((p) => [...p.requiredSkills, ...p.preferredSkills].some((s) => s.toLowerCase().includes(skill)));

        document.getElementById("ps-count").textContent = `${results.length} problem statement${results.length === 1 ? "" : "s"} found`;
        const grid = document.getElementById("ps-results");
        grid.innerHTML = results.length ? results.map((p) => `
          <div class="card">
            <div class="card-row"><div class="card-title">${UI.escapeHtml(p.title)}</div>${UI.badge(p.status, statusBadgeKind(p.status))}</div>
            <div class="card-sub">${p.domain ? UI.escapeHtml(p.domain) : ""}${p.problemCategory ? ` · ${UI.escapeHtml(p.problemCategory)}` : ""}</div>
            <div style="margin:6px 0;">${p.requiredSkills.slice(0, 4).map((s) => UI.badge(s, "primary")).join(" ")}</div>
            ${p.deadline ? `<div class="muted" style="font-size:.8rem;">Deadline: ${UI.escapeHtml(p.deadline)}</div>` : ""}
            <button class="btn btn-sm view-ps-btn" data-id="${p.id}" style="margin-top:8px;">View Details</button>
          </div>`).join("") : UI.emptyState("No problem statements match your search and filters.");
        grid.querySelectorAll(".view-ps-btn").forEach((btn) => btn.onclick = () => { Storage.set("selected_problem_statement", Number(btn.dataset.id)); renderSection(container, { allowInterest }); });
      };
      ["ps-search", "ps-domain", "ps-category", "ps-mode", "ps-skill"].forEach((id) => {
        document.getElementById(id).addEventListener("input", rerender);
        document.getElementById(id).addEventListener("change", rerender);
      });
      rerender();
    }).catch(() => { container.innerHTML = UI.emptyState("Could not reach the backend API."); });
  }

  function renderDetail(container, problemId, { allowInterest }) {
    container.innerHTML = `<p class="muted">Loading problem statement…</p>`;
    ApiClient.getProblemStatement(problemId).then((res) => {
      if (!res.ok) { container.innerHTML = UI.emptyState(res.error || "This problem statement is no longer available."); return; }
      const p = res.data.problemStatement;
      container.innerHTML = `
        <button class="back-link" id="ps-back">← Back to Problem Statements</button>
        <h2>${UI.escapeHtml(p.title)}</h2>
        <div>${UI.badge(p.status, statusBadgeKind(p.status))}</div>
        <div class="grid grid-3" style="margin-top:8px;">
          <div><strong>Domain:</strong> ${p.domain ? UI.escapeHtml(p.domain) : "Not specified"}</div>
          <div><strong>Category:</strong> ${p.problemCategory ? UI.escapeHtml(p.problemCategory) : "Not specified"}</div>
          <div><strong>Team Size:</strong> ${p.teamSize || "Not specified"}</div>
        </div>
        <div class="grid grid-3">
          <div><strong>Mode:</strong> ${p.mode ? UI.escapeHtml(p.mode) : "Not specified"}</div>
          <div><strong>Duration:</strong> ${p.duration ? UI.escapeHtml(p.duration) : "Not specified"}</div>
          <div>${p.deadline ? `<strong>Deadline:</strong> ${UI.escapeHtml(p.deadline)}` : ""}</div>
        </div>
        <hr class="divider">
        ${UI.sectionHeader("The Problem")}<p>${UI.escapeHtml(p.description)}</p>
        ${p.industryContext ? `${UI.sectionHeader("Industry Context")}<p>${UI.escapeHtml(p.industryContext)}</p>` : ""}
        ${p.expectedOutcome ? `${UI.sectionHeader("Expected Outcome")}<p>${UI.escapeHtml(p.expectedOutcome)}</p>` : ""}
        <div class="grid grid-2">
          <div>${UI.sectionHeader("Required Skills")}<ul class="list-clean">${p.requiredSkills.map((s) => `<li>• ${UI.escapeHtml(s)}</li>`).join("")}</ul></div>
          <div>${UI.sectionHeader("Preferred Skills")}<ul class="list-clean">${p.preferredSkills.length ? p.preferredSkills.map((s) => `<li>• ${UI.escapeHtml(s)}</li>`).join("") : '<li class="muted">None listed.</li>'}</ul></div>
        </div>
        <hr class="divider">
        <div id="ps-interest-area"></div>
      `;
      document.getElementById("ps-back").onclick = () => { Storage.set("selected_problem_statement", null); renderSection(container, { allowInterest }); };

      const interestArea = document.getElementById("ps-interest-area");
      if (!allowInterest) { interestArea.innerHTML = ""; return; }

      ApiClient.getStudentProblemStatementParticipation().then((partRes) => {
        const existing = partRes.ok ? partRes.data.participation.find((x) => x.problemStatementId === problemId) : null;
        if (existing) {
          interestArea.innerHTML = `<span class="badge badge-primary">Participation Status: ${UI.escapeHtml(existing.status)}</span>`;
        } else if (p.status !== "Open") {
          interestArea.innerHTML = `<span class="muted">This problem statement is not currently open for interest.</span>`;
        } else {
          interestArea.innerHTML = `<button class="btn btn-primary" id="ps-interest-btn">Express Interest</button>`;
          document.getElementById("ps-interest-btn").onclick = () => {
            document.getElementById("ps-interest-btn").disabled = true;
            ApiClient.expressProblemStatementInterest(problemId, "").then((res2) => {
              if (res2.ok) { UI.toast("Interest submitted!", "success"); renderDetail(container, problemId, { allowInterest }); }
              else { UI.toast(res2.error || "Could not submit interest.", "warning"); document.getElementById("ps-interest-btn").disabled = false; }
            }).catch(() => UI.toast("Could not reach the backend API.", "warning"));
          };
        }
      });
    }).catch(() => { container.innerHTML = UI.emptyState("Could not reach the backend API."); });
  }

  function renderSection(container, { allowInterest = false } = {}) {
    const selectedId = Storage.get("selected_problem_statement", null);
    if (selectedId !== null) { renderDetail(container, selectedId, { allowInterest }); return; }
    renderBrowse(container, { allowInterest });
  }

  function renderMyParticipation(container) {
    container.innerHTML = `<p class="muted">Loading your participation…</p>`;
    ApiClient.getStudentProblemStatementParticipation().then((res) => {
      if (!res.ok) { container.innerHTML = UI.emptyState(res.error || "Could not load participation."); return; }
      const rows = res.data.participation;
      container.innerHTML = UI.sectionHeader("My Problem Statement Participation");
      if (!rows.length) { container.innerHTML += UI.emptyState("You haven't expressed interest in any problem statement yet."); return; }
      container.innerHTML += rows.map((r) => `
        <div class="card">
          <div class="card-row"><div class="card-title">${UI.escapeHtml(r.problemTitle || "Problem statement no longer available")}</div>${UI.badge(r.status, statusBadgeKind(r.status === "Interested" ? "Open" : r.status))}</div>
          <div class="muted" style="font-size:.8rem;">Submitted: ${UI.escapeHtml((r.createdAt || "").slice(0, 10))}</div>
        </div>`).join("");
    }).catch(() => { container.innerHTML = UI.emptyState("Could not reach the backend API."); });
  }

  return { renderSection, renderMyParticipation };
})();
