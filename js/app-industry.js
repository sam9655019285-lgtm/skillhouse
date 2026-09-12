/*
 * app-industry.js — page controller for industry.html (Phase 8).
 */
document.addEventListener("DOMContentLoaded", () => {
  if (!Auth.requireRole(["Industry"])) return;
  Storage.initStudentData(); // Talent Discovery/candidates read the "self" student bridge too
  Storage.initIndustryData();
  Navigation.renderShell("Industry");
  buildPanels();
  Opportunities.syncOpportunitiesFromBackend();
  window.addEventListener("tab-activated", (e) => onTabActivated(e.detail.tabId));
  Navigation.activateTab("dashboard");

  // Phase 13 — live industry data for the Industry Analytics tab.
  let currentTab = "dashboard";
  window.addEventListener("tab-activated", (e) => { currentTab = e.detail.tabId; });
  LiveIndustry.onUpdate(() => {
    if (currentTab === "industry-analytics") {
      const el = document.getElementById("content-industry-analytics");
      if (el) Industry.renderIndustryAnalytics(el);
    }
  });
  LiveIndustry.refresh();
  LiveIndustry.startAutoRefresh();
});

function buildPanels() {
  const main = document.getElementById("main-content");
  const tabs = ["dashboard", "company-profile", "post-opportunity", "my-opportunities", "applications-received", "shortlisted", "candidate-search", "real-candidates", "talent-discovery", "industry-analytics", "live-projects", "problem-statements"];
  main.innerHTML = tabs.map((id) => `<div class="tab-panel" id="panel-${id}"><div id="content-${id}"></div></div>`).join("");
}

function onTabActivated(tabId) {
  const el = document.getElementById(`content-${tabId}`);
  if (!el) return;
  switch (tabId) {
    case "dashboard": Industry.renderDashboard(el); break;
    case "company-profile": Industry.renderProfile(el); break;
    case "post-opportunity": Industry.renderPostForm(el); break;
    case "my-opportunities": Storage.set("selected_industry_opportunity", null); Industry.renderMyOpportunities(el); break;
    case "applications-received": Applications.renderReceived(el); break;
    case "shortlisted": Applications.renderShortlisted(el); break;
    case "candidate-search": Storage.set("selected_candidate", null); Industry.renderCandidateSearch(el); break;
    case "real-candidates": Storage.set("selected_real_candidate", null); Industry.renderRealCandidateSearch(el); break;
    case "live-projects": Storage.set("selected_industry_live_project", null); Industry.renderLiveProjects(el); break;
    case "problem-statements": Storage.set("selected_industry_problem_statement", null); Industry.renderProblemStatements(el); break;
    case "talent-discovery": Industry.renderTalentDiscovery(el); break;
    case "industry-analytics": Industry.renderIndustryAnalytics(el); break;
  }
}
