/*
 * app-student.js — page controller for student.html.
 * Wires Phases 1-7 (profile, skills, portfolio, assessment, skill
 * gap, opportunities, learning, smart recommendations) into the tab
 * shell built by navigation.js.
 */

const TECHNICAL_SKILL_OPTIONS = ["Python", "Java", "C++", "SQL", "Machine Learning", "Data Analysis", "Git", "Cloud"];
const SOFT_SKILL_OPTIONS = ["Communication", "Problem Solving", "Leadership", "Teamwork", "Time Management"];
const PROFICIENCY_LEVELS = ["Beginner", "Intermediate", "Advanced"];

document.addEventListener("DOMContentLoaded", () => {
  if (!Auth.requireRole(["Student"])) return;
  Storage.initStudentData();
  Navigation.renderShell("Student");
  buildPanels();
  window.addEventListener("tab-activated", (e) => onTabActivated(e.detail.tabId));
  Navigation.activateTab("dashboard");

  // Phase 13 — live industry data. Fetch once, auto-refresh every 5
  // minutes, and re-render the dashboard's live widget whenever new
  // data arrives if the student is currently looking at it.
  let currentTab = "dashboard";
  window.addEventListener("tab-activated", (e) => { currentTab = e.detail.tabId; });
  LiveIndustry.onUpdate(() => {
    if (currentTab === "dashboard") {
      const widget = document.getElementById("dash-industry-demand");
      if (widget) LiveIndustry.renderStudentDemandWidget(widget);
      // The Industry Skill Gap card's "Industry Demand"/"Top Industry
      // Skills" sections are built from this same live data — refresh
      // wasn't done yet on first paint, so re-render it too now that
      // real data has arrived (see renderDashboardGapCard).
      renderDashboardGapCard();
    }
  });
  LiveIndustry.refresh();
  LiveIndustry.startAutoRefresh();
});

function buildPanels() {
  const main = document.getElementById("main-content");
  const tabs = [
    "dashboard", "profile", "skills", "certifications", "resume", "portfolio", "assessment", "skillgap",
    "opportunities", "saved-opps", "applications", "learning", "recommended-learning",
    "saved-learning", "my-learning", "smart-recommendations", "mentorship", "live-projects", "problem-statements",
  ];
  main.innerHTML = tabs.map((id) => `<div class="tab-panel" id="panel-${id}"><div id="content-${id}"></div></div>`).join("");
}

function onTabActivated(tabId) {
  const el = document.getElementById(`content-${tabId}`);
  if (!el) return;
  switch (tabId) {
    case "dashboard": renderDashboard(el); break;
    case "profile": renderProfileTab(el); break;
    case "skills": renderSkillsTab(el); break;
    case "certifications": Certifications.renderSection(el); break;
    case "resume": Resume.renderSection(el); break;
    case "portfolio": renderPortfolioTab(el); break;
    case "assessment": renderAssessmentTab(el); break;
    case "skillgap": renderSkillGapTab(el); break;
    case "opportunities": Opportunities.renderSection(el); break;
    case "saved-opps": Opportunities.renderSaved(el); break;
    case "applications": Opportunities.renderApplications(el); break;
    case "learning": Learning.renderSection(el); break;
    case "recommended-learning": Learning.renderRecommendations(el); break;
    case "saved-learning": Learning.renderSaved(el); break;
    case "my-learning": Learning.renderMyLearning(el); break;
    case "smart-recommendations": renderSmartRecommendations(el); break;
    case "mentorship": renderMentorshipTab(el); break;
    case "live-projects": Storage.set("selected_live_project", null); LiveProjects.renderSection(el); break;
    case "problem-statements": Storage.set("selected_problem_statement", null); ProblemStatements.renderSection(el, { allowInterest: true }); break;
  }
}

// ============================================================
// Step 15 — Mentorship (backend-backed: backend/routes/mentorship.js)
// ============================================================
function mentorshipStatusBadgeKind(status) {
  return status === "Accepted" ? "green" : status === "Rejected" || status === "Cancelled" ? "red" : status === "Completed" ? "primary" : "amber";
}

function renderMentorshipTab(container) {
  if (typeof ApiClient === "undefined") { container.innerHTML = UI.emptyState("Backend unavailable."); return; }
  container.innerHTML = `<p class="muted">Loading mentorship information…</p>`;

  Promise.all([ApiClient.getMentors(), ApiClient.getStudentMentorshipRequests(), ApiClient.getStudentMentorshipNeeds()]).then(([mentorsRes, requestsRes, needsRes]) => {
    const mentors = mentorsRes.ok ? mentorsRes.data.mentors : [];
    const requests = requestsRes.ok ? requestsRes.data.requests : [];
    const needs = needsRes.ok ? needsRes.data : null;
    const requestedAcademicianIds = new Set(requests.filter((r) => r.status === "Pending" || r.status === "Accepted").map((r) => r.academicianId));

    container.innerHTML = `
      ${UI.sectionHeader("Mentorship", "Connect with faculty mentors for guidance on your skill development.")}
      <div class="grid grid-2">
        <div>
          <h4>Available Academicians</h4>
          <div id="mentor-list">${mentors.length ? mentors.map((m) => `
            <div class="card">
              <div class="card-title">${UI.escapeHtml(m.name)}</div>
              <button class="btn btn-sm btn-primary request-mentor-btn" data-id="${m.id}" ${requestedAcademicianIds.has(m.id) ? "disabled" : ""}>
                ${requestedAcademicianIds.has(m.id) ? "Request Pending/Active" : "Request Mentorship"}
              </button>
            </div>`).join("") : UI.emptyState("No academicians are available yet.")}</div>
        </div>
        <div>
          <h4>My Mentorship Requests</h4>
          <div id="mentor-requests">${requests.length ? requests.map((r) => `
            <div class="card">
              <div class="card-row"><div class="card-title">Academician #${r.academicianId}</div>${UI.badge(r.status, mentorshipStatusBadgeKind(r.status))}</div>
              ${r.message ? `<p class="muted" style="font-size:.85rem;">${UI.escapeHtml(r.message)}</p>` : ""}
              <div class="muted" style="font-size:.8rem;">Requested: ${UI.escapeHtml((r.createdAt || "").slice(0, 10))}</div>
              ${r.status === "Pending" ? `<button class="btn btn-sm btn-danger cancel-request-btn" data-id="${r.id}" style="margin-top:6px;">Cancel</button>` : ""}
            </div>`).join("") : UI.emptyState("You haven't requested mentorship yet.")}</div>
        </div>
      </div>
      <hr class="divider">
      ${UI.sectionHeader("My Development Needs", "From your real skill-gap analysis and learning recommendations — not invented.")}
      <div id="mentor-needs"></div>
    `;

    if (needs) {
      const needsEl = document.getElementById("mentor-needs");
      needsEl.innerHTML = `
        ${needs.targetRole ? `<p><strong>Target Role:</strong> ${UI.escapeHtml(needs.targetRole)}</p>` : ""}
        <div class="grid grid-3">
          <div><strong>Major Gaps</strong>${needs.majorGaps.length ? needs.majorGaps.map((s) => `<div>🔴 ${UI.escapeHtml(s)}</div>`).join("") : `<div class="muted">None</div>`}</div>
          <div><strong>Moderate Gaps</strong>${needs.moderateGaps.length ? needs.moderateGaps.map((s) => `<div>🟡 ${UI.escapeHtml(s)}</div>`).join("") : `<div class="muted">None</div>`}</div>
          <div><strong>Priority Skills</strong>${needs.prioritySkills.length ? needs.prioritySkills.map((s) => `<div>⭐ ${UI.escapeHtml(s)}</div>`).join("") : `<div class="muted">None</div>`}</div>
        </div>
        <hr class="divider">
        <strong>Recommended Learning</strong>
        ${needs.learningRecommendations.length ? needs.learningRecommendations.slice(0, 4).map((r) => `<div class="card"><div class="card-title">${UI.escapeHtml(r.skillName)}</div><p class="muted" style="font-size:.82rem;">${UI.escapeHtml(r.reason)}</p></div>`).join("") : `<p class="muted">No recommendations yet.</p>`}
      `;
    }

    container.querySelectorAll(".request-mentor-btn").forEach((btn) => btn.onclick = () => {
      btn.disabled = true;
      ApiClient.createMentorshipRequest(Number(btn.dataset.id), "").then((res) => {
        if (res.ok) { UI.toast("Mentorship requested!", "success"); renderMentorshipTab(container); }
        else { UI.toast(res.error || "Could not send request.", "warning"); btn.disabled = false; }
      }).catch(() => { UI.toast("Could not reach the backend API.", "warning"); btn.disabled = false; });
    });
    container.querySelectorAll(".cancel-request-btn").forEach((btn) => btn.onclick = () => {
      ApiClient.cancelMentorshipRequest(Number(btn.dataset.id)).then((res) => {
        if (res.ok) { UI.toast("Request cancelled.", "success"); renderMentorshipTab(container); }
        else UI.toast(res.error || "Could not cancel request.", "warning");
      }).catch(() => UI.toast("Could not reach the backend API.", "warning"));
    });
  }).catch(() => { container.innerHTML = UI.emptyState("Could not reach the backend API for mentorship."); });
}

// ============================================================
// Dashboard (Phase 1 + summary cards from every phase)
// ============================================================
function getProfileCompletionPercentage() {
  const profile = Storage.get("student_profile", {});
  const personal = !!profile.full_name && !!profile.email;
  const academic = !!profile.college_name && !!profile.degree;
  const career = !!profile.target_job_role;
  const tech = Object.keys(Storage.get("technical_skills", {})).length > 0;
  const soft = Object.keys(Storage.get("soft_skills", {})).length > 0;
  const projects = Storage.get("projects", []).length > 0;
  const done = [personal, academic, career, tech, soft, projects].filter(Boolean).length;
  return Math.round((done / 6) * 100);
}

function motivationMessage(completion) {
  if (completion >= 90) return { headline: "Excellent! 🎉", sub: "Your profile is almost complete." };
  if (completion >= 70) return { headline: "Great progress! 🚀", sub: "You're almost there." };
  if (completion >= 40) return { headline: "Keep going! 💪", sub: "Complete your profile to unlock more opportunities." };
  return { headline: "Let's get started! 🌱", sub: "Complete your profile to discover better opportunities." };
}

function motivationBannerHtml(completion) {
  const { headline, sub } = motivationMessage(completion);
  return `
    <div class="motivation-banner">
      <img class="motivation-mascot" src="assets/mascot.png" alt="" aria-hidden="true">
      <div class="motivation-text">
        <div class="headline">${UI.escapeHtml(headline)}</div>
        <div class="sub">${UI.escapeHtml(sub)}</div>
      </div>
    </div>`;
}

function renderDashboard(container) {
  const user = Auth.getCurrentUser();
  const completion = getProfileCompletionPercentage();
  const assessmentResult = Storage.get("assessment_result", null);
  const gapAnalysis = Storage.get("skill_gap_analysis", null);

  container.innerHTML = `
    <div class="page-header"><h1>Academia–Industry Collaboration</h1><p>Welcome back, ${UI.escapeHtml(user.name)}. Here's your snapshot.</p></div>
    ${UI.sectionHeader("Profile Completion")}
    ${UI.progressBar(completion, UI.progressColorForScore(completion))}
    <p class="muted">${completion}% complete</p>
    ${motivationBannerHtml(completion)}
    <hr class="divider">
    <div class="grid grid-2">
      <div class="card">${UI.sectionHeader("Skill Assessment")}${assessmentResult
        ? UI.metricRow([["Overall Score", `${assessmentResult.overall_score}%`], ["Proficiency", assessmentResult.overall_level]]) + renderSkillAssessmentExtras(assessmentResult)
        : `<p class="muted">Not completed yet. Open the Skill Assessment tab above to take it.</p>`}</div>
      <div class="card" id="dash-gap-card"></div>
    </div>
    <div id="dash-opps"></div>
    <div id="dash-learning"></div>
    <hr class="divider">
    <div id="dash-industry-demand"></div>
    <div id="dash-recommendations"></div>
  `;

  renderDashboardGapCard();

  Opportunities.renderDashboardSummary(document.getElementById("dash-opps"));
  Learning.renderDashboardSummary(document.getElementById("dash-learning"));
  LiveIndustry.renderStudentDemandWidget(document.getElementById("dash-industry-demand"));
  Recommendations.renderDashboardSection(document.getElementById("dash-recommendations"));

  const viewCoursesBtn = document.getElementById("dash-view-courses-btn");
  if (viewCoursesBtn) viewCoursesBtn.onclick = () => Navigation.activateTab("recommended-learning");
  const viewAssessmentBtn = document.getElementById("dash-view-assessment-btn");
  if (viewAssessmentBtn) viewAssessmentBtn.onclick = () => Navigation.activateTab("assessment");
}

// Renders the "Industry Skill Gap" dashboard card from the latest
// Storage + LiveIndustry data. Pulled out of renderDashboard so it can
// also be re-run when live industry data finishes loading after the
// dashboard's first paint (see the LiveIndustry.onUpdate hook above) —
// without this, the card would be stuck showing "Data not available"
// forever if it rendered before the initial live-data fetch resolved.
function renderDashboardGapCard() {
  const gapCard = document.getElementById("dash-gap-card");
  if (!gapCard) return;
  const assessmentResult = Storage.get("assessment_result", null);
  const gapAnalysis = Storage.get("skill_gap_analysis", null);
  gapCard.innerHTML = UI.sectionHeader("Industry Skill Gap");
  if (!assessmentResult) {
    gapCard.innerHTML += `<p class="muted">Complete your Skill Assessment to generate your Industry Skill Gap Analysis.</p>`;
  } else {
    gapCard.innerHTML += renderIndustrySkillGapExtras(assessmentResult, gapAnalysis);
  }
  const viewGapBtn = document.getElementById("dash-view-gap-btn");
  if (viewGapBtn) viewGapBtn.onclick = () => Navigation.activateTab("skillgap");
}

// Demand level bucketing shared by the industry-gap dashboard card —
// same thresholds already used for live-industry demand elsewhere
// (see js/live-industry.js renderAcademicianLiveAlignment).
function industryDemandLevel(total) {
  if (total >= 4) return "High";
  if (total >= 2) return "Medium";
  if (total >= 1) return "Low";
  return null;
}
function levelBadgeKind(level) {
  return level === "High" ? "red" : level === "Medium" ? "amber" : level === "Low" ? "gray" : "gray";
}
function priorityRank(level) { return level === "High" ? 3 : level === "Medium" ? 2 : level === "Low" ? 1 : 0; }

// Combines the student's own assessed score (via Assessment's existing
// Beginner/Intermediate/Advanced thresholds) with real live industry
// demand for that skill into a single High/Medium/Low gap label — never
// a random or invented value; returns null when demand data is missing.
function combineGapLevel(assessedScore, demandLevel) {
  if (!demandLevel) return null;
  const yourLevel = Assessment.getProficiencyLevel(assessedScore);
  const weak = yourLevel === "Beginner" || yourLevel === "Needs Improvement";
  const mid = yourLevel === "Intermediate";
  if (demandLevel === "High") return weak ? "High" : mid ? "Medium" : "Low";
  if (demandLevel === "Medium") return weak ? "Medium" : "Low";
  return "Low";
}

// Fills the previously-empty space in the Industry Skill Gap dashboard
// card. Reuses Skill Gap Analysis (SkillGap/js/app-student.js
// renderSkillGapTab) when a target role has been analyzed, and reuses
// the existing live industry-demand data (LiveIndustry.liveSkillDemand,
// already powering the "Current Industry Demand" widget) for the
// demand/comparison sections — no second skill-gap or demand system.
function renderIndustrySkillGapExtras(assessmentResult, gapAnalysis) {
  const liveDemand = (typeof LiveIndustry !== "undefined") ? LiveIndustry.liveSkillDemand() : {};
  const hasLiveDemand = Object.keys(liveDemand).length > 0;
  const demandByCanonical = {};
  for (const [name, v] of Object.entries(liveDemand)) demandByCanonical[SkillGap.canonicalSkillName(name)] = { name, total: v.total };

  // ---- Top metrics (mirrors the Skill Assessment card's 2-metric row) ----
  let topMetricsHtml;
  if (gapAnalysis) {
    topMetricsHtml = UI.metricRow([["Overall Gap", `${100 - gapAnalysis.readiness_score}%`], ["Industry Readiness", `${gapAnalysis.readiness_score}%`]]) +
      `<p class="muted" style="font-size:.8rem;margin-top:-8px;">Target Role: ${UI.escapeHtml(gapAnalysis.target_role)}</p>`;
  } else {
    topMetricsHtml = `<p class="muted">Set a Target Job Role in the Skill Gap Analysis tab to see your Overall Gap and Industry Readiness.</p>`;
  }

  // ---- Industry Demand (overall, for the student's assessed skills) ----
  const assessedSkills = Object.keys(assessmentResult.skill_scores || {});
  const relevantSkills = gapAnalysis ? Object.keys(gapAnalysis.skills) : assessedSkills;
  let overallDemandLevel = null;
  if (hasLiveDemand) {
    const totals = relevantSkills.map((s) => demandByCanonical[SkillGap.canonicalSkillName(s)]?.total || 0).filter((t) => t > 0);
    if (totals.length) overallDemandLevel = industryDemandLevel(totals.reduce((a, b) => a + b, 0) / totals.length);
  }
  const demandHtml = `<p style="margin:6px 0;">${overallDemandLevel ? `Industry Demand: ${UI.badge(overallDemandLevel.toUpperCase(), levelBadgeKind(overallDemandLevel))}` : `<span class="muted">Data not available.</span>`}</p>`;

  // ---- Top Industry Skills (top 3, real live-demand counts only) ----
  const topSkillsHtml = hasLiveDemand
    ? Object.entries(liveDemand).sort((a, b) => b[1].total - a[1].total).slice(0, 3).map(([name, v]) => {
        const level = industryDemandLevel(v.total);
        return `<div class="skill-bar-row"><div class="skill-bar-label"><span>${UI.escapeHtml(name)}</span>${UI.badge(`${level} Demand`, levelBadgeKind(level))}</div>${UI.progressBar(Math.min(100, v.total * 20), levelBadgeKind(level) === "red" ? "red" : levelBadgeKind(level) === "amber" ? "amber" : "green")}</div>`;
      }).join("")
    : `<p class="muted">Data not available.</p>`;

  // ---- Your Skills vs Industry (top 3 lowest-assessed skills) ----
  const comparisonSkills = Object.entries(assessmentResult.skill_scores || {}).sort((a, b) => a[1] - b[1]).slice(0, 3);
  const comparisonHtml = comparisonSkills.length ? comparisonSkills.map(([skill, score]) => {
    const yourLevel = Assessment.getProficiencyLevel(score);
    const demandEntry = demandByCanonical[SkillGap.canonicalSkillName(skill)];
    const demandLevel = demandEntry ? industryDemandLevel(demandEntry.total) : null;
    const gapLevel = combineGapLevel(score, demandLevel);
    return `<p style="font-size:.82rem;margin:4px 0;"><strong>${UI.escapeHtml(skill)}</strong> — Your Level: ${UI.escapeHtml(yourLevel)} · Industry: ${demandLevel ? UI.escapeHtml(demandLevel) : "Not tracked"} · Gap: ${gapLevel ? UI.badge(gapLevel, levelBadgeKind(gapLevel)) : "—"}</p>`;
  }).join("") : `<p class="muted">Complete your Skill Assessment to see this comparison.</p>`;

  // ---- Priority Skills to Improve ----
  let priorityList = [];
  if (gapAnalysis && gapAnalysis.priority_gaps.length) {
    priorityList = gapAnalysis.priority_gaps.slice(0, 4).map((g) => ({ skill: g.skill, level: g.priority_level }));
  } else if (hasLiveDemand) {
    priorityList = comparisonSkills.map(([skill, score]) => {
      const demandEntry = demandByCanonical[SkillGap.canonicalSkillName(skill)];
      const demandLevel = demandEntry ? industryDemandLevel(demandEntry.total) : null;
      return { skill, level: combineGapLevel(score, demandLevel) };
    }).filter((p) => p.level).sort((a, b) => priorityRank(b.level) - priorityRank(a.level)).slice(0, 4);
  }
  const priorityHtml = priorityList.length
    ? `<ol style="padding-left:18px;margin:6px 0;">${priorityList.map((p) => `<li style="font-size:.85rem;margin-bottom:4px;">${UI.escapeHtml(p.skill)} — ${UI.badge(`${p.level} Priority`, levelBadgeKind(p.level))}</li>`).join("")}</ol>`
    : `<p class="muted">Not enough data yet to prioritize — complete your Skill Assessment and set a Target Role.</p>`;

  // ---- Recommended Action ----
  const actionText = priorityList.length
    ? `<p style="font-size:.85rem;margin:6px 0;">Focus on ${priorityList.slice(0, 2).map((p) => UI.escapeHtml(p.skill)).join(" and ")} to improve your industry readiness.</p>`
    : "";

  return `
    <hr class="divider" style="margin:14px 0;">
    ${topMetricsHtml}
    <hr class="divider" style="margin:14px 0;">
    ${UI.sectionHeader("📈 Industry Demand")}
    ${demandHtml}
    ${UI.sectionHeader("🔥 Top Industry Skills")}
    ${topSkillsHtml}
    <hr class="divider" style="margin:14px 0;">
    ${UI.sectionHeader("📊 Your Skills vs Industry")}
    ${comparisonHtml}
    <hr class="divider" style="margin:14px 0;">
    ${UI.sectionHeader("🎯 Priority Skills to Improve")}
    ${priorityHtml}
    <hr class="divider" style="margin:14px 0;">
    ${UI.sectionHeader("🚀 Recommended Action")}
    ${actionText}
    <button class="btn btn-primary btn-sm" id="dash-view-gap-btn">View Skill Gap Analysis</button>`;
}

// Fills the previously-empty space in the Skill Assessment dashboard
// card with a per-skill breakdown, focus areas, and a course
// recommendation — all derived from the student's real assessment_result
// (Storage/engine.js Assessment), never hardcoded or invented.
function renderSkillAssessmentExtras(assessmentResult) {
  const skillScores = assessmentResult.skill_scores || {};
  const skillEntries = Object.entries(skillScores).sort((a, b) => a[1] - b[1]);
  const proficiencyBadgeKind = (score) => (score >= 80 ? "green" : score >= 60 ? "primary" : score >= 40 ? "amber" : "red");

  const breakdownHtml = skillEntries.length ? skillEntries.map(([skill, score]) => `
    <div class="skill-bar-row">
      <div class="skill-bar-label"><span>${UI.escapeHtml(skill)}</span><span>${score}% ${UI.badge(Assessment.getProficiencyLevel(score), proficiencyBadgeKind(score))}</span></div>
      ${UI.progressBar(score, UI.progressColorForScore(score))}
    </div>`).join("") : "";

  const focusAreas = (assessmentResult.areas_to_improve || []).slice(0, 3);
  const focusHtml = focusAreas.length ? `
    <div style="margin-top:10px;">
      <strong>🎯 Focus Areas</strong>
      <div style="margin:6px 0;">${focusAreas.map(([skill]) => UI.badge(skill, "amber")).join(" ")}</div>
      <p class="muted" style="font-size:.8rem;">These skills need improvement based on your assessment.</p>
    </div>` : `<p class="muted" style="margin-top:10px;font-size:.85rem;">No major focus areas — nice work across the board.</p>`;

  let actionHtml = "";
  if (focusAreas.length) {
    const [topSkill, topScore] = focusAreas[0];
    const level = Assessment.getProficiencyLevel(topScore).toLowerCase();
    actionHtml = `
      <div style="margin-top:10px;">
        <strong>📚 Recommended Action</strong>
        <p style="font-size:.85rem;margin:6px 0;">Improve your ${UI.escapeHtml(topSkill)} skills first. A ${UI.escapeHtml(level)}-level ${UI.escapeHtml(topSkill)} course is recommended for you.</p>
        <div class="btn-row">
          <button class="btn btn-primary btn-sm" id="dash-view-courses-btn">View Recommended Courses</button>
          <button class="btn btn-sm" id="dash-view-assessment-btn">View Assessment</button>
        </div>
      </div>`;
  }

  if (!skillEntries.length) return "";
  return `
    <hr class="divider" style="margin:14px 0;">
    ${UI.sectionHeader("Skill Breakdown")}
    ${breakdownHtml}
    ${focusHtml}
    ${actionHtml}`;
}

// ============================================================
// Phase 2 — Profile
// ============================================================
function renderProfileTab(container) {
  const p = Storage.get("student_profile", {});
  container.innerHTML = `
    <h3>My Profile</h3>
    <form id="profile-form">
      <fieldset><legend>Personal Information</legend>
        <label>Full Name</label><input type="text" id="pf-name" value="${UI.escapeHtml(p.full_name || "")}">
        <label>Email</label><input type="text" id="pf-email" value="${UI.escapeHtml(p.email || "")}">
        <label>Phone Number</label><input type="text" id="pf-phone" value="${UI.escapeHtml(p.phone_number || "")}">
        <label>Location</label><input type="text" id="pf-location" value="${UI.escapeHtml(p.location || "")}">
      </fieldset>
      <fieldset><legend>Academic Information</legend>
        <label>College/Institution</label><input type="text" id="pf-college" value="${UI.escapeHtml(p.college_name || "")}">
        <label>Degree</label><input type="text" id="pf-degree" value="${UI.escapeHtml(p.degree || "")}">
        <label>Department</label><select id="pf-department">${UI.selectOptions(Departments.DEPARTMENTS, p.department || "", true, "Select Department")}</select>
        <label>Current Year</label><select id="pf-year">${UI.selectOptions(["1st Year", "2nd Year", "3rd Year", "4th Year"], p.current_year, false)}</select>
        <label>CGPA</label><input type="number" id="pf-cgpa" min="0" max="10" step="0.01" value="${p.cgpa || 0}">
      </fieldset>
      <fieldset><legend>Career Information</legend>
        <label>Career Interests</label><input type="text" id="pf-interests" value="${UI.escapeHtml(p.career_interests || "")}" placeholder="Example: Data Science, Web Development, Cloud Computing">
        <label>Target Job Role</label><input type="text" id="pf-target-role" value="${UI.escapeHtml(p.target_job_role || "")}">
        <label>Preferred Industry</label><input type="text" id="pf-industry" value="${UI.escapeHtml(p.preferred_industry || "")}">
      </fieldset>
      <button type="submit" class="btn btn-primary">Save Profile</button>
    </form>`;

  document.getElementById("profile-form").onsubmit = (e) => {
    e.preventDefault();
    const updated = {
      full_name: document.getElementById("pf-name").value, email: document.getElementById("pf-email").value,
      phone_number: document.getElementById("pf-phone").value, location: document.getElementById("pf-location").value,
      college_name: document.getElementById("pf-college").value, degree: document.getElementById("pf-degree").value,
      department: document.getElementById("pf-department").value, current_year: document.getElementById("pf-year").value,
      cgpa: parseFloat(document.getElementById("pf-cgpa").value) || 0,
      career_interests: document.getElementById("pf-interests").value, target_job_role: document.getElementById("pf-target-role").value,
      preferred_industry: document.getElementById("pf-industry").value,
    };
    Storage.set("student_profile", updated);
    syncProfileToBackend(updated, { showToast: true });
  };

  syncProfileFromBackend(p);
}

// ------------------------------------------------------------------
// Backend sync for the subset of profile fields backend/db/profiles.js
// currently persists (phone/college/department/year/location — see
// backend/routes/profile.js). Everything else in `student_profile`
// (name/email/degree/cgpa/career interests/target role/industry)
// stays localStorage-only for now; this does not change the visible
// form or its fields.
// ------------------------------------------------------------------
function mappedBackendFields(localProfile) {
  return {
    phone: localProfile.phone_number || null,
    college: localProfile.college_name || null,
    department: localProfile.department || null,
    year: localProfile.current_year || null,
    location: localProfile.location || null,
  };
}

function applyBackendFieldsToLocalProfile(localProfile, backendProfile) {
  return {
    ...localProfile,
    phone_number: backendProfile.phone ?? localProfile.phone_number,
    college_name: backendProfile.college ?? localProfile.college_name,
    department: backendProfile.department ?? localProfile.department,
    current_year: backendProfile.year ?? localProfile.current_year,
    location: backendProfile.location ?? localProfile.location,
  };
}

function reflectProfileFieldsInForm(localProfile) {
  const setVal = (id, value) => { const el = document.getElementById(id); if (el) el.value = value || ""; };
  setVal("pf-phone", localProfile.phone_number);
  setVal("pf-college", localProfile.college_name);
  setVal("pf-department", localProfile.department);
  setVal("pf-year", localProfile.current_year);
  setVal("pf-location", localProfile.location);
}

// Fetch the authoritative database profile once the tab has already
// rendered from localStorage, so the page never feels broken/slow
// while offline. If the database already has a profile, it wins and
// updates both localStorage and the visible form. If the database is
// still empty, migrate whatever useful local data exists — once.
function syncProfileFromBackend(localProfile) {
  if (typeof ApiClient === "undefined") return;
  ApiClient.getProfile().then((res) => {
    if (!res.ok) return; // unauthenticated / backend unavailable — keep using localStorage only
    const backend = res.data && res.data.profile;
    if (!backend) return;
    const backendHasData = backend.phone || backend.college || backend.department || backend.year || backend.location;
    if (backendHasData) {
      const merged = applyBackendFieldsToLocalProfile(localProfile, backend);
      Storage.set("student_profile", merged);
      reflectProfileFieldsInForm(merged);
    } else {
      maybeMigrateLocalProfile(localProfile);
    }
  }).catch(() => { /* offline — localStorage remains the fallback */ });
}

// One-time migration: only runs while the database profile is still
// empty and only if there's actual local data worth migrating. A flag
// in localStorage prevents this from ever re-running and overwriting
// a database profile with stale local data afterwards.
function maybeMigrateLocalProfile(localProfile) {
  if (Storage.get("profile_migrated_v1", false)) return;
  const fields = mappedBackendFields(localProfile);
  const hasLocalData = Object.values(fields).some(Boolean);
  if (!hasLocalData) return;
  syncProfileToBackend(localProfile, { showToast: false, markMigrated: true });
}

function syncProfileToBackend(localProfile, { showToast = false, markMigrated = false } = {}) {
  if (typeof ApiClient === "undefined") {
    if (showToast) UI.toast("Profile saved locally (backend unavailable).", "warning");
    return;
  }
  ApiClient.updateProfile(mappedBackendFields(localProfile)).then((res) => {
    if (res.ok) {
      if (markMigrated) Storage.set("profile_migrated_v1", true);
      if (showToast) UI.toast("Profile saved successfully!", "success");
    } else if (showToast) {
      UI.toast(res.error || "Could not save to the server — your changes are saved locally.", "warning");
    }
  }).catch(() => {
    if (showToast) UI.toast("Could not reach the backend API — your changes are saved locally.", "warning");
  });
}

// ============================================================
// Phase 2 — Skills
// ============================================================
function renderSkillsTab(container) {
  container.innerHTML = `
    <h3>My Skills</h3>
    <h4>Technical Skills</h4>
    <form id="add-tech-skill-form" class="grid grid-3" style="align-items:end;">
      <div><label>Skill</label><select id="tech-skill-select">${UI.selectOptions(TECHNICAL_SKILL_OPTIONS, null, false)}</select></div>
      <div><label>Proficiency</label><select id="tech-skill-level">${UI.selectOptions(PROFICIENCY_LEVELS, null, false)}</select></div>
      <div><button type="submit" class="btn btn-primary" style="margin-bottom:14px;">Add Skill</button></div>
    </form>
    <div id="tech-skill-list"></div>
    <hr class="divider">
    <h4>Soft Skills</h4>
    <form id="add-soft-skill-form" class="grid grid-3" style="align-items:end;">
      <div><label>Skill</label><select id="soft-skill-select">${UI.selectOptions(SOFT_SKILL_OPTIONS, null, false)}</select></div>
      <div><label>Proficiency</label><select id="soft-skill-level">${UI.selectOptions(PROFICIENCY_LEVELS, null, false)}</select></div>
      <div><button type="submit" class="btn btn-primary" style="margin-bottom:14px;">Add Skill</button></div>
    </form>
    <div id="soft-skill-list"></div>`;

  // category -> localStorage key, matching backend/db/skills.js "category"
  // values used for student_skills rows (see syncSkillsToBackend below).
  const CATEGORY_KEY = { technical: "technical_skills", soft: "soft_skills" };

  // Cache of skillName -> backend row id, populated whenever a GET/PUT
  // response from /api/student/skills is received, so a later single
  // DELETE can target the right row without the UI needing its own id.
  let skillIdCache = {};
  // skillName -> certification names that tag it (backend/routes/
  // studentSkills.js includes this on every GET/PUT response) — shown
  // in renderList so a student can see which certificate backs a skill.
  let skillCertMap = {};
  const skillCacheKey = (category, name) => `${category}::${name}`;
  function updateSkillIdCache(rows) {
    skillIdCache = {};
    skillCertMap = {};
    rows.forEach((r) => {
      skillIdCache[skillCacheKey(r.category, r.skillName)] = r.id;
      skillCertMap[r.skillName] = r.certifications || [];
    });
  }

  function buildSkillsPayload() {
    const payload = [];
    for (const [category, key] of Object.entries(CATEGORY_KEY)) {
      const skillsObj = Storage.get(key, {});
      for (const [name, level] of Object.entries(skillsObj)) {
        payload.push({ skillName: name, category, proficiency: level });
      }
    }
    return payload;
  }

  function renderList(key, listElId) {
    const category = key === CATEGORY_KEY.technical ? "technical" : "soft";
    const skills = Storage.get(key, {});
    const el = document.getElementById(listElId);
    const entries = Object.entries(skills);
    el.innerHTML = entries.length ? entries.map(([name, level]) => {
      const certs = skillCertMap[name] || [];
      return `
      <div class="card-row card" style="padding:10px 14px;">
        <span>${UI.escapeHtml(name)}${certs.length ? `<div class="muted" style="font-size:.72rem;">🎓 Supported by: ${certs.map((c) => UI.escapeHtml(c)).join(", ")}</div>` : ""}</span>
        <span>${UI.escapeHtml(level || "Certified")}</span>
        <button class="btn btn-sm btn-danger remove-skill-btn" data-skill="${UI.escapeHtml(name)}">Remove</button>
      </div>`;
    }).join("") : `<p class="muted">No skills added yet.</p>`;
    el.querySelectorAll(".remove-skill-btn").forEach((btn) => btn.onclick = () => {
      const s = Storage.get(key, {});
      const name = btn.dataset.skill;
      delete s[name];
      Storage.set(key, s);
      renderList(key, listElId);
      deleteSkillFromBackend(category, name);
    });
  }

  // Sends the full current technical+soft skill set to the backend
  // (PUT replaces the student's stored skills with exactly this list —
  // see backend/routes/studentSkills.js). Never lets a backend failure
  // touch the localStorage data that's already been saved.
  function syncSkillsToBackend({ markMigrated = false } = {}) {
    if (typeof ApiClient === "undefined") return;
    ApiClient.updateStudentSkills(buildSkillsPayload()).then((res) => {
      if (res.ok) {
        updateSkillIdCache(res.data.skills || []);
        if (markMigrated) Storage.set("skills_migrated_v1", true);
      } else {
        UI.toast(res.error || "Could not save skills to the server — saved locally only.", "warning");
      }
    }).catch(() => UI.toast("Could not reach the backend API — skills saved locally only.", "warning"));
  }

  function deleteSkillFromBackend(category, name) {
    if (typeof ApiClient === "undefined") return;
    const id = skillIdCache[skillCacheKey(category, name)];
    if (!id) { syncSkillsToBackend(); return; } // never synced yet — just resync the reduced set
    ApiClient.deleteStudentSkill(id).then((res) => {
      if (res.ok) delete skillIdCache[skillCacheKey(category, name)];
      else UI.toast(res.error || "Could not delete from the server — removed locally only.", "warning");
    }).catch(() => UI.toast("Could not reach the backend API — removed locally only.", "warning"));
  }

  // Fetch the authoritative database skills once the tab has already
  // rendered from localStorage. If the database already has skills,
  // it wins (localStorage + visible lists are overwritten to match).
  // If the database is empty, migrate whatever local skills exist —
  // once — using the same flag pattern as the Step 3 profile migration.
  function syncSkillsFromBackend() {
    if (typeof ApiClient === "undefined") return;
    ApiClient.getStudentSkills().then((res) => {
      if (!res.ok) return;
      const rows = res.data.skills || [];
      updateSkillIdCache(rows);
      if (rows.length > 0) {
        const technical = {}, soft = {};
        rows.forEach((r) => {
          if (r.category === "soft") soft[r.skillName] = r.proficiency;
          else technical[r.skillName] = r.proficiency;
        });
        Storage.set("technical_skills", technical);
        Storage.set("soft_skills", soft);
        if (document.getElementById("tech-skill-list")) renderList("technical_skills", "tech-skill-list");
        if (document.getElementById("soft-skill-list")) renderList("soft_skills", "soft-skill-list");
      } else if (!Storage.get("skills_migrated_v1", false)) {
        const payload = buildSkillsPayload();
        if (payload.length) syncSkillsToBackend({ markMigrated: true });
      }
    }).catch(() => { /* offline — localStorage remains the fallback */ });
  }

  document.getElementById("add-tech-skill-form").onsubmit = (e) => {
    e.preventDefault();
    const s = Storage.get("technical_skills", {});
    s[document.getElementById("tech-skill-select").value] = document.getElementById("tech-skill-level").value;
    Storage.set("technical_skills", s);
    UI.toast("Skill added", "success");
    renderList("technical_skills", "tech-skill-list");
    syncSkillsToBackend();
  };
  document.getElementById("add-soft-skill-form").onsubmit = (e) => {
    e.preventDefault();
    const s = Storage.get("soft_skills", {});
    s[document.getElementById("soft-skill-select").value] = document.getElementById("soft-skill-level").value;
    Storage.set("soft_skills", s);
    UI.toast("Skill added", "success");
    renderList("soft_skills", "soft-skill-list");
    syncSkillsToBackend();
  };

  renderList("technical_skills", "tech-skill-list");
  renderList("soft_skills", "soft-skill-list");
  syncSkillsFromBackend();
}

// ============================================================
// Phase 2 — Portfolio (projects & certifications)
// ============================================================
function renderPortfolioTab(container) {
  container.innerHTML = `
    <h3>Portfolio</h3>
    <h4>Projects</h4>
    <form id="add-project-form">
      <label>Project Name</label><input type="text" id="proj-name">
      <label>Short Description</label><textarea id="proj-desc"></textarea>
      <label>Technologies Used</label><input type="text" id="proj-tech" placeholder="Example: Python, Streamlit, SQL">
      <label>Project Link</label><input type="text" id="proj-link">
      <button type="submit" class="btn btn-primary">Add Project</button>
    </form>
    <div id="project-list"></div>
    <hr class="divider">
    <h4>Certifications</h4>
    <form id="add-cert-form">
      <label>Certification Name</label><input type="text" id="cert-name">
      <label>Issuing Organization</label><input type="text" id="cert-org">
      <label>Completion Year</label><input type="number" id="cert-year" min="2000" max="2100" value="2024">
      <label>Certificate Link</label><input type="text" id="cert-link">
      <button type="submit" class="btn btn-primary">Add Certification</button>
    </form>
    <div id="cert-list"></div>`;

  function renderProjects() {
    const projects = Storage.get("projects", []);
    const el = document.getElementById("project-list");
    el.innerHTML = projects.length ? projects.map((p, i) => `
      <div class="card">
        <div class="card-title">${UI.escapeHtml(p.project_name)}</div>
        <p>${UI.escapeHtml(p.project_description)}</p>
        ${p.technologies_used ? `<p><strong>Technologies:</strong> ${UI.escapeHtml(p.technologies_used)}</p>` : ""}
        ${p.project_link ? `<p><strong>Link:</strong> ${UI.escapeHtml(p.project_link)}</p>` : ""}
        <button class="btn btn-sm btn-danger remove-proj-btn" data-idx="${i}">Remove Project</button>
      </div>`).join("") : `<p class="muted">No projects added yet.</p>`;
    el.querySelectorAll(".remove-proj-btn").forEach((btn) => btn.onclick = () => {
      const list = Storage.get("projects", []);
      const [removed] = list.splice(Number(btn.dataset.idx), 1);
      Storage.set("projects", list);
      renderProjects();
      deleteProjectFromBackend(removed);
    });
  }

  // ------------------------------------------------------------------
  // Backend sync for Projects. Each project object gets a hidden
  // `_dbId` field once it's synced to backend/db/projects.js, used to
  // target the right row on delete — it's never rendered, so the
  // visible card markup above is unchanged.
  // ------------------------------------------------------------------
  function projectPayload(p) {
    return {
      title: p.project_name,
      description: p.project_description || null,
      technologies: p.technologies_used || null,
      projectUrl: p.project_link || null,
    };
  }

  function createProjectOnBackend(project, localIndex) {
    if (typeof ApiClient === "undefined") return;
    ApiClient.createStudentProject(projectPayload(project)).then((res) => {
      if (res.ok) {
        const list = Storage.get("projects", []);
        if (list[localIndex] && list[localIndex].project_name === project.project_name) {
          list[localIndex]._dbId = res.data.project.id;
          Storage.set("projects", list);
        }
      } else {
        UI.toast(res.error || "Could not save project to the server — saved locally only.", "warning");
      }
    }).catch(() => UI.toast("Could not reach the backend API — project saved locally only.", "warning"));
  }

  function deleteProjectFromBackend(project) {
    if (typeof ApiClient === "undefined" || !project || !project._dbId) return; // never synced — nothing to delete server-side
    ApiClient.deleteStudentProject(project._dbId).then((res) => {
      if (!res.ok) UI.toast(res.error || "Could not delete from the server — removed locally only.", "warning");
    }).catch(() => UI.toast("Could not reach the backend API — removed locally only.", "warning"));
  }

  // Fetch the authoritative database projects once the tab has already
  // rendered from localStorage. If the database already has projects,
  // it wins (localStorage + the visible list are overwritten to
  // match). If the database is empty, migrate whatever local projects
  // exist — once — using the same flag pattern as Steps 3/4.
  function syncProjectsFromBackend() {
    if (typeof ApiClient === "undefined") return;
    ApiClient.getStudentProjects().then((res) => {
      if (!res.ok) return;
      const rows = res.data.projects || [];
      if (rows.length > 0) {
        const mapped = rows.map((r) => ({
          project_name: r.title, project_description: r.description || "",
          technologies_used: r.technologies || "", project_link: r.projectUrl || "",
          _dbId: r.id,
        }));
        Storage.set("projects", mapped);
        if (document.getElementById("project-list")) renderProjects();
      } else if (!Storage.get("projects_migrated_v1", false)) {
        const local = Storage.get("projects", []);
        if (local.length) migrateLocalProjects(local);
      }
    }).catch(() => { /* offline — localStorage remains the fallback */ });
  }

  function migrateLocalProjects(localProjects) {
    if (typeof ApiClient === "undefined") return;
    let remaining = localProjects.length;
    localProjects.forEach((p, idx) => {
      ApiClient.createStudentProject(projectPayload(p)).then((res) => {
        if (res.ok) {
          const list = Storage.get("projects", []);
          if (list[idx]) { list[idx]._dbId = res.data.project.id; Storage.set("projects", list); }
        }
      }).catch(() => { /* migration is best-effort; local data is untouched either way */ })
        .finally(() => { remaining--; if (remaining === 0) Storage.set("projects_migrated_v1", true); });
    });
  }
  function renderCerts() {
    const certs = Storage.get("certifications", []);
    const el = document.getElementById("cert-list");
    el.innerHTML = certs.length ? certs.map((c, i) => `
      <div class="card">
        <div class="card-title">${UI.escapeHtml(c.certification_name)}</div>
        ${c.issuing_organization ? `<p><strong>Issued by:</strong> ${UI.escapeHtml(c.issuing_organization)}</p>` : ""}
        <p><strong>Completion Year:</strong> ${c.completion_year}</p>
        ${c.certificate_link ? `<p><strong>Link:</strong> ${UI.escapeHtml(c.certificate_link)}</p>` : ""}
        <button class="btn btn-sm btn-danger remove-cert-btn" data-idx="${i}">Remove Certification</button>
      </div>`).join("") : `<p class="muted">No certifications added yet.</p>`;
    el.querySelectorAll(".remove-cert-btn").forEach((btn) => btn.onclick = () => {
      const list = Storage.get("certifications", []);
      list.splice(Number(btn.dataset.idx), 1);
      Storage.set("certifications", list);
      renderCerts();
    });
  }

  document.getElementById("add-project-form").onsubmit = (e) => {
    e.preventDefault();
    const name = document.getElementById("proj-name").value;
    if (!name.trim()) { UI.toast("Please enter a project name before adding.", "warning"); return; }
    const list = Storage.get("projects", []);
    const newProject = { project_name: name, project_description: document.getElementById("proj-desc").value, technologies_used: document.getElementById("proj-tech").value, project_link: document.getElementById("proj-link").value };
    list.push(newProject);
    Storage.set("projects", list);
    UI.toast(`Added project: ${name}`, "success");
    e.target.reset();
    renderProjects();
    createProjectOnBackend(newProject, list.length - 1);
  };
  document.getElementById("add-cert-form").onsubmit = (e) => {
    e.preventDefault();
    const name = document.getElementById("cert-name").value;
    if (!name.trim()) { UI.toast("Please enter a certification name before adding.", "warning"); return; }
    const list = Storage.get("certifications", []);
    list.push({ certification_name: name, issuing_organization: document.getElementById("cert-org").value, completion_year: Number(document.getElementById("cert-year").value), certificate_link: document.getElementById("cert-link").value });
    Storage.set("certifications", list);
    UI.toast(`Added certification: ${name}`, "success");
    e.target.reset();
    renderCerts();
  };

  renderProjects();
  renderCerts();
  syncProjectsFromBackend();
}

// ============================================================
// Phase 3 — Skill Assessment
// ============================================================
function renderAssessmentTab(container) {
  const questions = DATA.ASSESSMENT_QUESTIONS;
  if (!questions.length) { container.innerHTML = UI.emptyState("No assessment questions are available yet."); return; }

  if (Storage.get("assessment_started", false)) { renderQuestionFlow(container); return; }
  const result = Storage.get("assessment_result", null);
  if (result) { renderAssessmentResults(container); return; }
  renderAssessmentIntro(container);
  // No local result yet (fresh browser/device) — try restoring the
  // student's latest completed assessment from the database before
  // falling back to the "not completed yet" intro screen staying put.
  syncAssessmentFromBackend(container);
}

// ------------------------------------------------------------------
// Backend sync for the Skill Assessment. The frontend still scores
// instantly with Assessment.scoreAssessment() for the UI (unchanged
// behavior) — this only persists/restores results via
// backend/routes/assessments.js, which independently recomputes the
// score from the submitted answers rather than trusting a score sent
// by the browser.
// ------------------------------------------------------------------
let assessmentSyncInFlight = false;

function restoreAssessmentResultFromBackendRow(row) {
  const skillScores = row.skillScores || {};
  const { strengths, areasToImprove } = Assessment.getStrengthsAndWeaknesses(skillScores);
  return {
    overall_score: row.score,
    overall_level: Assessment.getProficiencyLevel(row.score),
    skill_scores: skillScores,
    strengths,
    areas_to_improve: areasToImprove,
    total_questions: DATA.ASSESSMENT_QUESTIONS.length,
    completed: true,
  };
}

// Submits the raw answers (never a pre-computed score) so the backend
// can independently score and persist the attempt. `markMigrated`
// silences the failure toast for the one-time legacy migration path,
// where a warning would be confusing since nothing the student just
// did failed — they're simply not yet synced.
function submitAssessmentToBackend(answers, { markMigrated = false } = {}) {
  if (typeof ApiClient === "undefined") {
    if (!markMigrated) UI.toast("Could not reach the backend API — result saved locally only.", "warning");
    return;
  }
  ApiClient.submitStudentAssessment({ answers }).then((res) => {
    if (res.ok) {
      if (markMigrated) Storage.set("assessments_migrated_v1", true);
    } else if (!markMigrated) {
      UI.toast(res.error || "Could not save the assessment to the server — result saved locally only.", "warning");
    }
  }).catch(() => {
    if (!markMigrated) UI.toast("Could not reach the backend API — result saved locally only.", "warning");
  });
}

// One-time migration: only runs while there's no local assessment
// result to show (see renderAssessmentTab) and the database has no
// history yet. Only migrates the last completed attempt's real
// answers — never fabricates data if the stored answers don't line up
// with the current question set.
function maybeMigrateLocalAssessment() {
  if (typeof ApiClient === "undefined") return;
  if (Storage.get("assessments_migrated_v1", false)) return;
  const answers = Storage.get("assessment_answers", {});
  const knownIds = new Set(DATA.ASSESSMENT_QUESTIONS.map((q) => String(q.id)));
  const hasUsableAnswers = Object.keys(answers).some((qid) => knownIds.has(String(qid)));
  if (!hasUsableAnswers) return;
  submitAssessmentToBackend(answers, { markMigrated: true });
}

// Fetches the student's assessment history once, only when there's no
// local result to display yet. If the database already has one, it
// wins — localStorage is restored from it and the tab re-renders to
// show the existing results view. Otherwise, falls back to migrating
// whatever legacy local answers exist.
function syncAssessmentFromBackend(container) {
  if (assessmentSyncInFlight || typeof ApiClient === "undefined") return;
  assessmentSyncInFlight = true;
  ApiClient.getStudentAssessments().then((res) => {
    if (!res.ok) return;
    const history = res.data.assessments || [];
    if (history.length > 0) {
      Storage.set("assessment_result", restoreAssessmentResultFromBackendRow(history[0]));
      Storage.set("assessments_migrated_v1", true);
      const el = document.getElementById("content-assessment");
      if (el) renderAssessmentTab(el);
    } else {
      maybeMigrateLocalAssessment();
    }
  }).catch(() => { /* offline — localStorage remains the fallback */ })
    .finally(() => { assessmentSyncInFlight = false; });
}

function renderAssessmentIntro(container) {
  const questions = DATA.ASSESSMENT_QUESTIONS;
  const categories = Object.keys(DATA.CATEGORY_GROUPS);
  const estMinutes = Math.max(1, Math.round(questions.length * 0.75));
  container.innerHTML = `
    <h3>Skill Assessment</h3>
    <p>This assessment evaluates your current technical and soft skills and helps identify your strengths and areas for improvement.</p>
    ${UI.metricRow([["Questions", questions.length], ["Categories", categories.length], ["Est. Time", `~${estMinutes} min`]])}
    <p class="muted">Categories covered: ${categories.join(", ")}</p>
    ${Storage.get("assessment_result", null) ? `<div class="auth-error" style="background:var(--primary-light);color:var(--primary-dark);">You've already completed this assessment once. Starting again will let you retake it.</div>` : ""}
    <button class="btn btn-primary" id="start-assessment-btn">Start Assessment</button>`;
  document.getElementById("start-assessment-btn").onclick = () => {
    Storage.set("assessment_answers", {});
    Storage.set("assessment_current_index", 0);
    Storage.set("assessment_attempt", (Storage.get("assessment_attempt", 0) || 0) + 1);
    Storage.set("assessment_started", true);
    renderAssessmentTab(container);
  };
}

function renderQuestionFlow(container) {
  const questions = DATA.ASSESSMENT_QUESTIONS;
  let index = Math.max(0, Math.min(Storage.get("assessment_current_index", 0), questions.length - 1));
  Storage.set("assessment_current_index", index);
  const question = questions[index];
  const answers = Storage.get("assessment_answers", {});
  const previousAnswer = answers[question.id];

  container.innerHTML = `
    <p class="muted">Question ${index + 1} / ${questions.length}</p>
    ${UI.progressBar(((index + 1) / questions.length) * 100)}
    <p><strong>Category:</strong> ${UI.escapeHtml(question.category)} &nbsp;•&nbsp; <strong>Difficulty:</strong> ${UI.escapeHtml(question.difficulty)}</p>
    <h4>${UI.escapeHtml(question.question)}</h4>
    <div id="assessment-options">${question.options.map((opt, i) => `
      <label style="display:flex;align-items:center;gap:8px;font-weight:400;margin-bottom:8px;">
        <input type="radio" name="assessment-opt" value="${UI.escapeHtml(opt)}" ${previousAnswer === opt ? "checked" : ""}> ${UI.escapeHtml(opt)}
      </label>`).join("")}</div>
    <hr class="divider">
    <div class="btn-row">
      <button class="btn" id="assessment-prev" ${index === 0 ? "disabled" : ""}>Previous</button>
      <button class="btn" id="assessment-next" ${index === questions.length - 1 ? "disabled" : ""}>Next</button>
      <button class="btn btn-primary" id="assessment-finish">Finish Assessment</button>
    </div>`;

  container.querySelectorAll('input[name="assessment-opt"]').forEach((input) => input.onchange = () => {
    const a = Storage.get("assessment_answers", {});
    a[question.id] = input.value;
    Storage.set("assessment_answers", a);
  });
  document.getElementById("assessment-prev").onclick = () => { Storage.set("assessment_current_index", index - 1); renderQuestionFlow(container); };
  document.getElementById("assessment-next").onclick = () => { Storage.set("assessment_current_index", index + 1); renderQuestionFlow(container); };
  document.getElementById("assessment-finish").onclick = () => {
    const finalAnswers = Storage.get("assessment_answers", {});
    const unanswered = questions.filter((q) => !(q.id in finalAnswers)).length;
    if (unanswered > 0) { UI.toast(`You have ${unanswered} unanswered question(s). Please answer every question before finishing.`, "warning"); return; }
    const result = Assessment.scoreAssessment(finalAnswers);
    Storage.set("assessment_result", result);
    Storage.set("assessment_started", false);
    renderAssessmentTab(document.getElementById("content-assessment"));
    submitAssessmentToBackend(finalAnswers);
  };
}

function renderAssessmentResults(container) {
  const result = Storage.get("assessment_result");
  container.innerHTML = `
    <h3>Assessment Complete</h3>
    ${UI.metricRow([["Overall Score", `${result.overall_score}%`], ["Proficiency", result.overall_level], ["Skills Assessed", Object.keys(result.skill_scores).length]])}
    <hr class="divider">
    ${UI.sectionHeader("Skill Profile")}
    ${Object.entries(result.skill_scores).map(([name, score]) => `${UI.skillBar(name, score)}<p class="muted" style="margin-top:-8px;">${Assessment.getProficiencyLevel(score)}</p>`).join("")}
    <hr class="divider">
    <div class="grid grid-2">
      <div>${UI.sectionHeader("Strong Areas")}${result.strengths.length ? result.strengths.map(([n, s]) => `<div>🟢 ${UI.escapeHtml(n)} — ${s}%</div>`).join("") : `<span class="muted">No standout strengths yet — keep practicing!</span>`}</div>
      <div>${UI.sectionHeader("Areas to Improve")}${result.areas_to_improve.length ? result.areas_to_improve.map(([n, s]) => `<div>${s < 60 ? "🔴" : "🟡"} ${UI.escapeHtml(n)} — ${s}%</div>`).join("") : `<span class="muted">No weak areas identified — great work!</span>`}</div>
    </div>
    <hr class="divider">
    <button class="btn" id="retake-assessment-btn">Retake Assessment</button>`;
  document.getElementById("retake-assessment-btn").onclick = () => {
    Storage.set("assessment_answers", {});
    Storage.set("assessment_current_index", 0);
    Storage.set("assessment_attempt", (Storage.get("assessment_attempt", 0) || 0) + 1);
    Storage.set("assessment_started", true);
    renderAssessmentTab(container);
  };
}

// ============================================================
// Phase 4 — Skill Gap Analysis (backend/routes/skillGap.js is now the
// authoritative source — see backend/services/skillGapService.js. It
// reuses the exact same gap/priority thresholds and 0-100 proficiency
// scale as SkillGap in engine.js, so this is a pure reshape of the
// API response into the shape renderGapResults() already expects —
// no gap-math is duplicated here.)
// ============================================================
function mapSkillGapResponseToAnalysis(data) {
  const skills = {};
  (data.skills || []).forEach((s) => {
    skills[s.skillName] = { current: s.currentLevel, required: s.requiredLevel, gap: s.gap, status: s.severity, has_data: s.source !== "none" };
  });
  const priority_gaps = (data.priorityGaps || []).map((p) => ({ skill: p.skillName, gap: p.gap, priority_score: p.priorityScore, priority_level: p.priorityLevel }));
  return { target_role: data.targetRole, readiness_score: data.readinessScore, skills, priority_gaps };
}

function renderSkillGapTab(container) {
  const roleNames = Object.keys(DATA.JOB_ROLES);
  container.innerHTML = `
    <h3>Skill Gap Analysis</h3>
    <p class="muted">An industry-alignment indicator based on defined skill requirements — not an official employment prediction.</p>
    <div id="skillgap-body"></div>`;
  const body = document.getElementById("skillgap-body");
  const assessmentResult = Storage.get("assessment_result", null);
  if (!assessmentResult) {
    body.innerHTML = `<div class="auth-error" style="background:var(--primary-light);color:var(--primary-dark);">Complete your Skill Assessment to generate your Industry Skill Gap Analysis.</div>`;
    return;
  }

  const profile = Storage.get("student_profile", {});
  const savedTargetRole = Storage.get("skill_gap_target_role", null);
  const matchedFromProfile = SkillGap.matchProfileRole(profile.target_job_role || "", roleNames);
  const defaultRole = matchedFromProfile || (roleNames.includes(savedTargetRole) ? savedTargetRole : roleNames[0]);

  body.innerHTML = `
    <label>Select Target Career</label>
    <select id="sg-role-select">${UI.selectOptions(roleNames, defaultRole, false)}</select>
    <button class="btn btn-primary" id="sg-analyze-btn">Analyze Skill Gap</button>
    <div id="sg-results" style="margin-top:16px;"></div>`;

  Storage.set("skill_gap_target_role", defaultRole);
  document.getElementById("sg-role-select").onchange = (e) => Storage.set("skill_gap_target_role", e.target.value);

  document.getElementById("sg-analyze-btn").onclick = () => {
    const role = document.getElementById("sg-role-select").value;
    if (typeof ApiClient === "undefined") {
      UI.toast("Backend unavailable — cannot run Skill Gap Analysis right now.", "warning");
      return;
    }
    ApiClient.getStudentSkillGap(role).then((res) => {
      if (!res.ok) {
        UI.toast(res.error || "Could not load Skill Gap Analysis from the server.", "warning");
        return;
      }
      Storage.set("skill_gap_analysis", mapSkillGapResponseToAnalysis(res.data));
      renderGapResults();
    }).catch(() => UI.toast("Could not reach the backend API — Skill Gap Analysis unavailable.", "warning"));
  };

  function renderGapResults() {
    const analysis = Storage.get("skill_gap_analysis", null);
    const resultsEl = document.getElementById("sg-results");
    if (!analysis) { resultsEl.innerHTML = `<p class="muted">Select a target role and click Analyze Skill Gap to see your results.</p>`; return; }
    if (analysis.target_role !== document.getElementById("sg-role-select").value) {
      resultsEl.innerHTML = `<p class="muted">Target role changed — click Analyze Skill Gap to refresh your results.</p>`;
      return;
    }
    const meets = Object.entries(analysis.skills).filter(([, d]) => d.gap === 0).map(([n]) => n);
    const withGaps = Object.entries(analysis.skills).filter(([, d]) => d.gap > 0);

    resultsEl.innerHTML = UI.metricRow([["Target Role", analysis.target_role], ["Industry Readiness", `${analysis.readiness_score}%`]]) +
      `<hr class="divider"><div class="grid grid-2">
        <div>${UI.sectionHeader("Skills Meeting Requirement")}${meets.length ? meets.map((n) => `<div>🟢 ${UI.escapeHtml(n)}</div>`).join("") : `<span class="muted">None yet.</span>`}</div>
        <div>${UI.sectionHeader("Skills With Gaps")}${withGaps.length ? withGaps.map(([n, d]) => `<div>${SkillGap.STATUS_EMOJI[d.status] || ""} ${UI.escapeHtml(n)}</div>`).join("") : `<span class="muted">None — great alignment!</span>`}</div>
      </div><hr class="divider">` +
      UI.sectionHeader("Skill Analysis") +
      Object.entries(analysis.skills).map(([name, d]) => `
        <div class="card">
          <div class="card-title">${UI.escapeHtml(name)}${!d.has_data ? ` <span class="muted" style="font-weight:400;">(no data yet — treated as 0)</span>` : ""}</div>
          <div>${d.current} / ${d.required}</div>
          <div>${SkillGap.STATUS_EMOJI[d.status] || ""} ${UI.badge(d.status, UI.gapStatusKind(d.status))}</div>
        </div>`).join("") +
      `<hr class="divider">` + UI.sectionHeader("Your Priority Skill Gaps") +
      (analysis.priority_gaps.length
        ? `<ol>${analysis.priority_gaps.map((g) => `<li><strong>${UI.escapeHtml(g.skill)}</strong> — Gap: ${g.gap} points — Priority: ${UI.escapeHtml(g.priority_level)}</li>`).join("")}</ol>`
        : `<div class="auth-success">No significant skill gaps for this role. Great alignment!</div>`);
  }

  if (savedTargetRole === defaultRole) renderGapResults();
  else document.getElementById("sg-results").innerHTML = `<p class="muted">Select a target role and click Analyze Skill Gap to see your results.</p>`;
}

// ============================================================
// Phase 7 — Smart Recommendations
// ============================================================
function renderSmartRecommendations(container) {
  const knownRoles = Object.keys(DATA.JOB_ROLES);
  const targetRole = SkillGap.getEffectiveTargetRole(knownRoles, Storage.get("skill_gap_target_role", null), (Storage.get("student_profile", {}).target_job_role || ""));
  const profile = Opportunities.currentProfile();
  const gapAnalysis = Storage.get("skill_gap_analysis", null);
  const skillGapNames = gapAnalysis ? gapAnalysis.priority_gaps.map((g) => g.skill) : [];
  const opportunities = Opportunities.loadOpportunities().filter((o) => (o.status || "Active") === "Active");

  container.innerHTML = UI.sectionHeader("Smart Recommendations", "A transparent, rule-based engine combining skill alignment, role relevance, and your current skill gaps.");

  if (!targetRole) {
    container.innerHTML += `<div class="auth-error" style="background:var(--primary-light);color:var(--primary-dark);">Set a Target Job Role in My Profile (or run a Skill Gap Analysis) to unlock personalized recommendations.</div>`;
    return;
  }

  const ranked = Matcher.getRecommendedOpportunities(opportunities, profile, targetRole, skillGapNames, 5);
  container.innerHTML += `<p><strong>Target Role:</strong> ${UI.escapeHtml(targetRole)}</p><hr class="divider">` +
    UI.sectionHeader("Top Matching Opportunities") +
    (ranked.length ? ranked.map((r) => {
      const opp = opportunities.find((o) => o.id === r.opportunity_id);
      return `<div class="card">
        <div class="card-row"><div class="card-title">${UI.escapeHtml(opp.title)}</div>${UI.badge(r.match_category, UI.matchBadgeKind(r.match_category))}</div>
        <div class="card-sub">${UI.escapeHtml(opp.company)}</div>
        ${UI.progressBar(r.match_score, UI.progressColorForScore(r.match_score))}
        <p style="font-size:.85rem;">Match Score: <strong>${r.match_score}%</strong> · Skill Alignment: ${r.skill_alignment}% · Role Relevance: ${r.role_relevance}</p>
        <ul class="list-clean" style="font-size:.84rem;">${r.reasons.map((reason) => `<li>✓ ${UI.escapeHtml(reason)}</li>`).join("")}</ul>
        <button class="btn btn-primary btn-sm view-opp-btn" data-id="${opp.id}">View Details</button>
      </div>`;
    }).join("") : UI.emptyState("No opportunities available yet."));

  container.querySelectorAll(".view-opp-btn").forEach((btn) => btn.onclick = () => { Storage.set("selected_opportunity_id", Number(btn.dataset.id)); Navigation.activateTab("opportunities"); });
}
