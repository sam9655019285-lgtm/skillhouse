/*
 * app-academician.js — page controller for academician.html (Phase 9/10).
 */
document.addEventListener("DOMContentLoaded", () => {
  if (!Auth.requireRole(["Academician"])) return;
  Storage.ensureAllInitialized();
  Navigation.renderShell("Academician");
  buildPanels();
  window.addEventListener("tab-activated", (e) => onTabActivated(e.detail.tabId));
  Navigation.activateTab("dashboard");

  let currentTab = "dashboard";
  window.addEventListener("tab-activated", (e) => { currentTab = e.detail.tabId; });
  LiveIndustry.onUpdate(() => {
    if (currentTab === "live-alignment") {
      const el = document.getElementById("content-live-alignment");
      if (el) LiveIndustry.renderAcademicianLiveAlignment(el);
    }
  });
  LiveIndustry.refresh();
  LiveIndustry.startAutoRefresh();
});

function buildPanels() {
  const main = document.getElementById("main-content");
  const tabs = ["dashboard", "skill-analytics", "curriculum", "live-alignment", "training", "collaboration", "mentorship-requests", "problem-statements"];
  main.innerHTML = tabs.map((id) => `<div class="tab-panel" id="panel-${id}"><div id="content-${id}"></div></div>`).join("");
}

function onTabActivated(tabId) {
  const el = document.getElementById(`content-${tabId}`);
  if (!el) return;
  switch (tabId) {
    case "dashboard": renderAcademicianDashboard(el); break;
    case "skill-analytics": Insights.renderSkillAnalytics(el, "Industry Demand & Student Skill Gaps"); break;
    case "curriculum": Insights.renderCurriculum(el); break;
    case "live-alignment": LiveIndustry.renderAcademicianLiveAlignment(el); break;
    case "training": Insights.renderTraining(el); break;
    case "collaboration": Insights.renderCollaboration(el); break;
    case "mentorship-requests": renderMentorshipRequestsTab(el); break;
    case "problem-statements": Storage.set("selected_problem_statement", null); ProblemStatements.renderSection(el, { allowInterest: false }); break;
  }
}

// ============================================================
// Step 15 — Mentorship Requests (backend-backed)
// ============================================================
function mentorshipStatusBadgeKind(status) {
  return status === "Accepted" ? "green" : status === "Rejected" ? "red" : status === "Completed" ? "primary" : "amber";
}

function renderMentorshipRequestsTab(container) {
  if (typeof ApiClient === "undefined") { container.innerHTML = UI.emptyState("Backend unavailable."); return; }
  container.innerHTML = `<p class="muted">Loading mentorship requests…</p>`;

  ApiClient.getAcademicianMentorshipRequests().then((res) => {
    if (!res.ok) { container.innerHTML = UI.emptyState(res.error || "Could not load mentorship requests."); return; }
    const requests = res.data.requests;
    container.innerHTML = UI.sectionHeader("Mentorship Requests", "Students requesting your guidance, with their real skill-development context.");
    if (!requests.length) { container.innerHTML += UI.emptyState("No mentorship requests yet."); return; }

    container.innerHTML += requests.map((r) => {
      const s = r.student;
      return `<div class="card">
        <div class="card-row"><div class="card-title">${s ? UI.escapeHtml(s.name) : `Student #${r.studentId}`}</div>${UI.badge(r.status, mentorshipStatusBadgeKind(r.status))}</div>
        ${s && s.department ? `<div class="muted" style="font-size:.82rem;">Department: ${UI.escapeHtml(s.department)}</div>` : ""}
        ${r.message ? `<p style="font-size:.85rem;">"${UI.escapeHtml(r.message)}"</p>` : ""}
        ${s ? `<div class="muted" style="font-size:.82rem;">Major skill gaps: ${s.majorGaps.length}${s.majorGaps.length ? ` (${s.majorGaps.slice(0, 4).map(UI.escapeHtml).join(", ")})` : ""}</div>
        <div class="muted" style="font-size:.82rem;">Top development skills: ${s.prioritySkills.length ? s.prioritySkills.slice(0, 4).map(UI.escapeHtml).join(", ") : "—"}</div>` : ""}
        ${r.status === "Pending" ? `
          <div class="btn-row" style="margin-top:8px;">
            <button class="btn btn-success btn-sm accept-request-btn" data-id="${r.id}">Accept</button>
            <button class="btn btn-danger btn-sm reject-request-btn" data-id="${r.id}">Reject</button>
          </div>` : ""}
        ${r.status === "Accepted" ? `<button class="btn btn-sm complete-request-btn" data-id="${r.id}" style="margin-top:8px;">Mark Completed</button>` : ""}
      </div>`;
    }).join("");

    const updateStatus = (id, status) => {
      ApiClient.updateMentorshipStatus(id, status).then((res2) => {
        if (res2.ok) { UI.toast(`Request ${status.toLowerCase()}.`, status === "Rejected" ? "info" : "success"); renderMentorshipRequestsTab(container); }
        else UI.toast(res2.error || "Could not update request.", "warning");
      }).catch(() => UI.toast("Could not reach the backend API.", "warning"));
    };
    container.querySelectorAll(".accept-request-btn").forEach((btn) => btn.onclick = () => updateStatus(Number(btn.dataset.id), "Accepted"));
    container.querySelectorAll(".reject-request-btn").forEach((btn) => btn.onclick = () => updateStatus(Number(btn.dataset.id), "Rejected"));
    container.querySelectorAll(".complete-request-btn").forEach((btn) => btn.onclick = () => updateStatus(Number(btn.dataset.id), "Completed"));
  }).catch(() => { container.innerHTML = UI.emptyState("Could not reach the backend API for mentorship requests."); });
}

function renderAcademicianDashboard(container) {
  const user = Auth.getCurrentUser();
  const alignment = CurriculumIntelligence.calculateCurriculumAlignment();
  const priority = AnalyticsMetrics.calculateSkillPriority();
  const topSkill = Object.keys(priority)[0];
  const collab = CollaborationEngine.calculateAllCollaborationScores();

  container.innerHTML = `
    <div class="page-header"><h1>Welcome, ${UI.escapeHtml(user.name)}</h1><p>Academic insights across industry demand, student skill gaps, and curriculum alignment.</p></div>
    ${UI.metricRow([
      ["Curriculum Alignment", `${alignment.alignment_score}%`],
      ["Top Priority Skill", topSkill || "—"],
      ["Collaboration Candidates", collab.length],
      ["Tracked Students", AnalyticsData.getStudentPopulation().length],
    ])}
    <div id="acad-real-analytics"></div>
    <div id="dash-dept"></div>
  `;
  Insights.renderDepartmentInsights(document.getElementById("dash-dept"));
  renderRealAcademicianAnalytics(document.getElementById("acad-real-analytics"));
}

// Step 13: real backend-backed academician analytics (SQLite students/
// skills/assessments/skill-gaps/industry demand), appended additively
// above the existing (mock-data) department-insights panel — that
// panel and the metrics above are left completely unchanged. Reuses
// the same UI components already used everywhere else in the app.
function renderRealAcademicianAnalytics(container) {
  if (typeof ApiClient === "undefined") return;
  container.innerHTML = `<p class="muted">Loading real student/skill analytics…</p>`;
  ApiClient.getAcademicianAnalytics().then((res) => {
    if (!res.ok) { container.innerHTML = `<p class="muted">Could not load academician analytics from the server.</p>`; return; }
    const a = res.data;
    const weakest = a.assessments.weakestCategories[0];

    container.innerHTML = `
      <hr class="divider">
      ${UI.sectionHeader("📈 Real Student Skill Development", "Current snapshot from real student, skill, and assessment data — not a historical trend.")}
      ${UI.metricRow([
        ["Total Students", a.overview.totalStudents],
        ["With Skills on File", a.overview.studentsWithSkills],
        ["Assessment Participation", `${a.assessments.participation.participationPercent}%`],
        ["Average Assessment Score", a.assessments.averageScore !== null ? `${a.assessments.averageScore}%` : "—"],
      ])}
      <div class="grid grid-2" style="margin-top:10px;">
        <div>
          <h4>Top Student Skills</h4>
          ${a.skills.mostCommonSkills.length ? a.skills.mostCommonSkills.slice(0, 6).map((s) => `
            <div class="skill-bar-row"><div class="skill-bar-label"><span>${UI.escapeHtml(s.skillName)}</span><span>${s.studentCount} student(s)</span></div>
            ${UI.progressBar(Math.min(100, s.studentCount * 10), "primary")}</div>`).join("") : UI.emptyState("No student skill data yet.")}
        </div>
        <div>
          <h4>Major Skill Gaps (most affected)</h4>
          ${a.skillGaps.mostAffectedSkills.length ? a.skillGaps.mostAffectedSkills.slice(0, 6).map((g) => `
            <div class="skill-bar-row"><div class="skill-bar-label"><span>${UI.escapeHtml(g.skillName)}</span><span>${g.studentsAffected} affected</span></div>
            ${UI.progressBar(Math.min(100, g.studentsAffected * 10), "red")}</div>`).join("") : UI.emptyState("No skill-gap data yet.")}
        </div>
      </div>
      ${weakest ? `<p class="muted" style="font-size:.85rem;margin-top:8px;">Weakest assessment category: <strong>${UI.escapeHtml(weakest.category)}</strong> (avg ${weakest.averageScore}%).</p>` : ""}
      <hr class="divider">
      ${UI.sectionHeader("🎓 Faculty Skill Development Insights", "Deterministic, generated from the real numbers above — not AI-generated.")}
      ${a.insights.length ? `<ul class="list-clean">${a.insights.map((i) => `<li>✓ ${UI.escapeHtml(i)}</li>`).join("")}</ul>` : UI.emptyState("Not enough real data yet to generate insights.")}
    `;
  }).catch(() => { container.innerHTML = `<p class="muted">Could not reach the backend API for academician analytics.</p>`; });
}
