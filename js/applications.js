/*
 * applications.js — Phase 8, ported from modules/industry/applications.py.
 * Unifies seed applications (mock roster) with the live student's
 * real Phase 5 applications ("self") into one read/write view.
 */

const Applications = (() => {
  function getAllCandidateApplications() {
    const applications = [];
    const seedApps = Storage.get("industry_seed_applications", JSON.parse(JSON.stringify(DATA.SEED_APPLICATIONS)));

    for (const seedApp of seedApps) {
      const candidate = Candidates.getCandidateById(null, seedApp.candidate_id);
      applications.push({
        id: `seed-${seedApp.id}`, candidate_id: seedApp.candidate_id,
        candidate_name: candidate ? candidate.name : "Unknown Candidate",
        opportunity_id: seedApp.opportunity_id, status: seedApp.status, applied_date: seedApp.applied_date,
      });
    }

    const selfCandidate = Candidates.getCandidateById(null, "self");
    if (selfCandidate) {
      for (const app of Storage.get("applications", [])) {
        applications.push({
          id: `self-${app.opportunity_id}`, candidate_id: "self", candidate_name: selfCandidate.name,
          opportunity_id: app.opportunity_id, status: app.status, applied_date: app.applied_date,
        });
      }
    }
    return applications;
  }

  function getApplicationsForOpportunity(opportunityId) {
    return getAllCandidateApplications().filter((a) => a.opportunity_id === opportunityId);
  }

  function countApplicationsForOpportunity(opportunityId) {
    return getApplicationsForOpportunity(opportunityId).length;
  }

  function updateApplicationStatus(applicationId, newStatus) {
    if (applicationId.startsWith("self-")) {
      const opportunityId = Number(applicationId.split("-")[1]);
      const apps = Storage.get("applications", []);
      const app = apps.find((a) => a.opportunity_id === opportunityId);
      if (app) { app.status = newStatus; Storage.set("applications", apps); }
    } else if (applicationId.startsWith("seed-")) {
      const seedId = Number(applicationId.split("-")[1]);
      const seedApps = Storage.get("industry_seed_applications", []);
      const app = seedApps.find((a) => a.id === seedId);
      if (app) { app.status = newStatus; Storage.set("industry_seed_applications", seedApps); }
    }
  }

  function shortlistApplication(id) { updateApplicationStatus(id, "Shortlisted"); }
  function rejectApplication(id) { updateApplicationStatus(id, "Rejected"); }
  function getShortlistedCandidates() { return getAllCandidateApplications().filter((a) => a.status === "Shortlisted"); }

  // Routes a status-change click to the real backend (id "real-<applicationId>")
  // or the existing mock updateApplicationStatus (id "self-"/"seed-"),
  // then re-renders either way.
  function applyStatusChange(id, status, toastLabel, container) {
    if (id.startsWith("real-")) {
      const applicationId = Number(id.split("-")[1]);
      updateRealApplicationStatus(applicationId, status, (ok, error) => {
        if (ok) { UI.toast(toastLabel, status === "Rejected" ? "info" : "success"); renderReceived(container); }
        else UI.toast(error || "Could not update application status.", "warning");
      });
      return;
    }
    updateApplicationStatus(id, status);
    UI.toast(toastLabel, status === "Rejected" ? "info" : "success");
    renderReceived(container);
  }

  // ---- Step 9: real applicants for this Industry user's own real
  // (backend) opportunities. Appended alongside the existing mock
  // roster below rather than replacing it — the mock system also
  // powers the unrelated Candidates/matching demo, which stays as-is.
  function loadRealApplicantsSync(opportunities, onDone) {
    if (typeof ApiClient === "undefined") { onDone([]); return; }
    const user = Auth.getCurrentUser();
    const myRealOpps = opportunities.filter((o) => Opportunities.isBackendOpportunityId(o.id) && o.industryUserId === (user && user.id));
    if (!myRealOpps.length) { onDone([]); return; }
    let remaining = myRealOpps.length;
    const results = [];
    myRealOpps.forEach((opp) => {
      ApiClient.getIndustryApplicants(Opportunities.toDbId(opp.id)).then((res) => {
        if (res.ok) {
          for (const a of res.data.applicants) {
            results.push({
              id: `real-${a.applicationId}`, candidate_id: `real-student-${a.studentId}`, candidate_name: a.studentName,
              opportunity_id: opp.id, status: a.status, applied_date: (a.appliedAt || "").slice(0, 10), _dbId: a.applicationId,
            });
          }
        }
      }).catch(() => null).finally(() => { remaining--; if (remaining === 0) onDone(results); });
    });
  }

  function updateRealApplicationStatus(applicationId, newStatus, onDone) {
    if (typeof ApiClient === "undefined") { onDone(false); return; }
    ApiClient.updateApplicationStatus(applicationId, newStatus).then((res) => onDone(res.ok, res.error)).catch(() => onDone(false));
  }

  // ---- Rendering ----
  function renderReceived(container) {
    const opportunities = Opportunities.loadOpportunities();
    const titles = Object.fromEntries(opportunities.map((o) => [o.id, o.title]));

    loadRealApplicantsSync(opportunities, (realApplications) => {
      const applications = [...realApplications, ...getAllCandidateApplications()];
      renderReceivedList(container, applications, opportunities, titles);
    });
  }

  function renderReceivedList(container, applications, opportunities, titles) {
    container.innerHTML = UI.sectionHeader("Applications Received");
    if (!applications.length) { container.innerHTML += UI.emptyState("No applications yet."); return; }

    container.innerHTML += `
      <div class="filters-row">
        <select id="app-opp-filter"><option value="All">All Opportunities</option>${opportunities.map((o) => `<option>${UI.escapeHtml(o.title)}</option>`).join("")}</select>
        <select id="app-status-filter"><option value="All">All Statuses</option>${UI.selectOptions(DATA.APPLICATION_STATUSES, "All", false)}</select>
      </div>
      <div id="app-received-list"></div>`;

    const rerender = () => {
      const oppFilter = document.getElementById("app-opp-filter").value;
      const statusFilter = document.getElementById("app-status-filter").value;
      const list = document.getElementById("app-received-list");
      const filtered = applications.filter((a) => {
        const title = titles[a.opportunity_id] || "Unknown Opportunity";
        if (oppFilter !== "All" && title !== oppFilter) return false;
        if (statusFilter !== "All" && a.status !== statusFilter) return false;
        return true;
      });
      list.innerHTML = filtered.map((app) => {
        const isReal = app.id.startsWith("real-");
        const opp = opportunities.find((o) => o.id === app.opportunity_id);
        const match = (!isReal && opp) ? Candidates.computeCandidateMatch(Candidates.getCandidateById(null, app.candidate_id), opp) : null;
        return `<div class="card">
          <div class="card-title">${UI.escapeHtml(titles[app.opportunity_id] || "Unknown Opportunity")}</div>
          <div>Candidate: ${UI.escapeHtml(app.candidate_name)}</div>
          ${match ? `<div>Skill Match: ${match.match_score}%</div>` : ""}
          <div>Status: ${UI.badge(app.status, app.status === "Shortlisted" ? "green" : app.status === "Rejected" ? "red" : "primary")}</div>
          <div class="muted" style="font-size:.8rem;">Applied: ${UI.escapeHtml(app.applied_date)}</div>
          <div class="btn-row" style="margin-top:8px;">
            ${isReal ? `<button class="btn btn-sm view-resume-btn" data-student-id="${app.candidate_id.replace("real-student-", "")}">View Resume</button>` : `<button class="btn btn-sm view-cand-btn" data-id="${app.candidate_id}">View Candidate</button>`}
            <button class="btn btn-success btn-sm shortlist-btn" data-id="${app.id}">Shortlist</button>
            <button class="btn btn-danger btn-sm reject-btn" data-id="${app.id}">Reject</button>
          </div>
        </div>`;
      }).join("") || UI.emptyState("No applications match these filters.");

      list.querySelectorAll(".view-cand-btn").forEach((btn) => btn.onclick = () => { const id = btn.dataset.id === "self" ? "self" : Number(btn.dataset.id); Storage.set("selected_candidate", id); Navigation.activateTab("candidate-search"); });
      list.querySelectorAll(".view-resume-btn").forEach((btn) => btn.onclick = () => { if (typeof Resume !== "undefined") Resume.openIndustryView(Number(btn.dataset.studentId)); });
      list.querySelectorAll(".shortlist-btn").forEach((btn) => btn.onclick = () => applyStatusChange(btn.dataset.id, "Shortlisted", "Shortlisted", container));
      list.querySelectorAll(".reject-btn").forEach((btn) => btn.onclick = () => applyStatusChange(btn.dataset.id, "Rejected", "Rejected", container));
    };

    document.getElementById("app-opp-filter").addEventListener("change", rerender);
    document.getElementById("app-status-filter").addEventListener("change", rerender);
    rerender();
  }

  function renderShortlisted(container) {
    const shortlisted = getShortlistedCandidates();
    const opportunities = Opportunities.loadOpportunities();
    const titles = Object.fromEntries(opportunities.map((o) => [o.id, o.title]));

    container.innerHTML = UI.sectionHeader("Shortlisted Candidates");
    if (!shortlisted.length) { container.innerHTML += UI.emptyState("No candidates have been shortlisted yet."); return; }

    container.innerHTML += shortlisted.map((app) => {
      const opp = opportunities.find((o) => o.id === app.opportunity_id);
      const match = opp ? Candidates.computeCandidateMatch(Candidates.getCandidateById(null, app.candidate_id), opp) : null;
      return `<div class="card">
        <div class="card-title">${UI.escapeHtml(app.candidate_name)}</div>
        <div>Opportunity: ${UI.escapeHtml(titles[app.opportunity_id] || "Unknown Opportunity")}</div>
        ${match ? `<div>Match Score: ${match.match_score}%</div>` : ""}
        <div>Status: ${UI.badge(app.status, "green")}</div>
        <button class="btn btn-sm view-cand-btn" data-id="${app.candidate_id}" style="margin-top:8px;">View Candidate</button>
      </div>`;
    }).join("");

    container.querySelectorAll(".view-cand-btn").forEach((btn) => btn.onclick = () => { const id = btn.dataset.id === "self" ? "self" : Number(btn.dataset.id); Storage.set("selected_candidate", id); Navigation.activateTab("candidate-search"); });
  }

  return { getAllCandidateApplications, getApplicationsForOpportunity, countApplicationsForOpportunity, shortlistApplication, rejectApplication, getShortlistedCandidates, renderReceived, renderShortlisted };
})();
