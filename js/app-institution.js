/*
 * app-institution.js — page controller for institution.html (Phase 9/10).
 */
document.addEventListener("DOMContentLoaded", () => {
  if (!Auth.requireRole(["Institution"])) return;
  Storage.ensureAllInitialized();
  Navigation.renderShell("Institution");
  buildPanels();
  window.addEventListener("tab-activated", (e) => onTabActivated(e.detail.tabId));
  Navigation.activateTab("dashboard");

  let currentTab = "dashboard";
  window.addEventListener("tab-activated", (e) => { currentTab = e.detail.tabId; });
  LiveIndustry.onUpdate(() => {
    if (currentTab === "live-demand") {
      const el = document.getElementById("content-live-demand");
      if (el) LiveIndustry.renderInstitutionLiveSection(el);
    }
  });
  LiveIndustry.refresh();
  LiveIndustry.startAutoRefresh();
});

function buildPanels() {
  const main = document.getElementById("main-content");
  const tabs = ["dashboard", "live-demand", "curriculum", "training", "collaboration", "reports"];
  main.innerHTML = tabs.map((id) => `<div class="tab-panel" id="panel-${id}"><div id="content-${id}"></div></div>`).join("");
}

function onTabActivated(tabId) {
  const el = document.getElementById(`content-${tabId}`);
  if (!el) return;
  switch (tabId) {
    case "dashboard": renderInstitutionDashboard(el); break;
    case "live-demand": LiveIndustry.renderInstitutionLiveSection(el); break;
    case "curriculum": Insights.renderCurriculum(el); break;
    case "training": Insights.renderTraining(el); break;
    case "collaboration": Insights.renderCollaboration(el); break;
    case "reports": Insights.renderReports(el); break;
  }
}

function renderInstitutionDashboard(container) {
  const user = Auth.getCurrentUser();
  container.innerHTML = `<div class="page-header"><h1>Welcome, ${UI.escapeHtml(user.name)}</h1><p>Overall analytics across every tracked skill, student, and industry partner.</p></div><div id="inst-real-analytics"></div><div id="inst-overview"></div>`;
  Insights.renderSkillAnalytics(document.getElementById("inst-overview"), "Overall Skill Demand & Supply Analytics");
  renderRealInstitutionAnalytics(document.getElementById("inst-real-analytics"));
}

// Step 12: real backend-backed institution analytics (SQLite students/
// skills/assessments/opportunities/applications), appended additively
// above the existing (mock-data) Insights.renderSkillAnalytics panel —
// that shared panel is also used by the Academician dashboard and is
// left completely unchanged. Reuses the same UI components (metricRow/
// badge/progressBar/sectionHeader/emptyState) already used everywhere
// else in the app — no new visual design.
function readinessBadgeKind(level) {
  return level === "Ready" ? "green" : level === "Developing" ? "amber" : "red";
}

function renderRealInstitutionAnalytics(container) {
  if (typeof ApiClient === "undefined") return;
  container.innerHTML = `<p class="muted">Loading real institution analytics…</p>`;
  ApiClient.getInstitutionAnalytics().then((res) => {
    if (!res.ok) { container.innerHTML = `<p class="muted">Could not load institution analytics from the server.</p>`; return; }
    const a = res.data;

    const topGap = a.skills.topSkillGaps[0];
    const topRequested = a.opportunities.mostRequestedSkills[0];
    const lowCoverage = a.industryAlignment.highDemandLowCoverage[0];
    const readinessEntries = Object.entries(a.readiness.distribution);
    const readinessTotal = a.readiness.totalClassified || 1;

    container.innerHTML = `
      ${UI.sectionHeader("📊 Academia–Industry Insights", "Current snapshot from real student, skill, assessment, opportunity, and application data — not a historical trend.")}
      ${UI.metricRow([
        ["Total Students", a.overview.totalStudents],
        ["With Skills on File", a.overview.studentsWithSkills],
        ["Completed Assessment", a.overview.studentsWithAssessments],
        ["Active Opportunities", a.opportunities.activeOpportunities],
      ])}
      <div class="grid grid-2" style="margin-top:10px;">
        <div>
          <h4>Top Skill Gaps (institution-wide)</h4>
          ${a.skills.topSkillGaps.length ? a.skills.topSkillGaps.slice(0, 6).map((g) => `
            <div class="skill-bar-row"><div class="skill-bar-label"><span>${UI.escapeHtml(g.skillName)}</span><span>${g.studentsAffected}/${a.overview.totalStudents} students</span></div>
            ${UI.progressBar(a.overview.totalStudents ? Math.round((g.studentsAffected / a.overview.totalStudents) * 100) : 0, "amber")}</div>`).join("") : UI.emptyState("No skill-gap data available yet.")}
        </div>
        <div>
          <h4>High Industry Demand vs Student Coverage</h4>
          ${a.industryAlignment.highDemandSkills.length ? a.industryAlignment.highDemandSkills.slice(0, 6).map((s) => `
            <div class="skill-bar-row"><div class="skill-bar-label"><span>${UI.escapeHtml(s.skillName)}</span><span>${s.coveragePercent}% of students</span></div>
            ${UI.progressBar(s.coveragePercent, s.coveragePercent < 50 ? "red" : "green")}</div>`).join("") : UI.emptyState("No industry demand data available yet.")}
        </div>
      </div>
      <hr class="divider">
      <h4>Student Readiness (current snapshot)</h4>
      <div class="btn-row" style="flex-wrap:wrap;">
        ${readinessEntries.map(([level, count]) => UI.badge(`${level}: ${count} (${Math.round((count / readinessTotal) * 100)}%)`, readinessBadgeKind(level))).join(" ")}
      </div>
      <hr class="divider">
      <h4>Key Insights</h4>
      <ul class="list-clean">
        ${lowCoverage ? `<li>⚠ High industry demand, low student coverage: <strong>${UI.escapeHtml(lowCoverage.skillName)}</strong> (${lowCoverage.coveragePercent}% of students have it).</li>` : ""}
        ${topGap ? `<li>🔴 Most common skill gap: <strong>${UI.escapeHtml(topGap.skillName)}</strong> (${topGap.studentsAffected} students affected).</li>` : ""}
        ${topRequested ? `<li>📌 Most requested opportunity skill: <strong>${UI.escapeHtml(topRequested.skillName)}</strong> (${topRequested.count} opportunities).</li>` : ""}
        ${!lowCoverage && !topGap && !topRequested ? `<li class="muted">Not enough real data yet to surface insights — as students and opportunities are added, this section will populate automatically.</li>` : ""}
      </ul>
      <hr class="divider">`;
  }).catch(() => { container.innerHTML = `<p class="muted">Could not reach the backend API for institution analytics.</p>`; });
}
