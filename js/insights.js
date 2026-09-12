/*
 * insights.js — rendering layer shared by academician.html and
 * institution.html, built on top of analytics-engine.js's pure
 * functions (Phase 9 metrics, Phase 10 curriculum intelligence and
 * collaboration engine). Ported from modules/analytics/dashboard.py,
 * modules/collaboration/dashboard.py, modules/analytics/trends.py,
 * modules/analytics/training.py, modules/collaboration/training_planner.py.
 */

const Insights = (() => {
  function skillDemandSupplyTable(limit = 10) {
    const demand = AnalyticsMetrics.calculateSkillDemand();
    const supply = AnalyticsMetrics.calculateSkillSupply();
    const supplyDemand = AnalyticsMetrics.calculateSupplyDemand(demand, supply);
    const rows = Object.entries(supplyDemand).slice(0, limit);
    if (!rows.length) return UI.emptyState("No opportunity/student data available yet.");
    return `<table style="width:100%;border-collapse:collapse;font-size:.87rem;">
      <thead><tr style="text-align:left;border-bottom:2px solid var(--gray-200);">
        <th style="padding:6px;">Skill</th><th style="padding:6px;">Demand</th><th style="padding:6px;">Supply</th><th style="padding:6px;">Ratio</th><th style="padding:6px;">Category</th>
      </tr></thead>
      <tbody>${rows.map(([skill, v]) => `<tr style="border-bottom:1px solid var(--gray-100);">
        <td style="padding:6px;">${UI.escapeHtml(skill)}</td><td style="padding:6px;">${v.demand}</td><td style="padding:6px;">${v.supply}</td>
        <td style="padding:6px;">${v.ratio === null ? "—" : v.ratio}</td>
        <td style="padding:6px;">${UI.badge(v.category, v.category === "Balanced" || v.category === "High Supply" ? "green" : v.category === "Moderate Shortage" ? "amber" : "red")}</td>
      </tr>`).join("")}</tbody></table>`;
  }

  function skillGapAnalyticsList(limit = 8) {
    const gaps = AnalyticsMetrics.calculateSkillGaps();
    const rows = Object.entries(gaps).slice(0, limit);
    if (!rows.length) return UI.emptyState("No student skill-gap data available yet (students need a recognized target role).");
    return rows.map(([skill, v]) => `<div class="skill-bar-row">
      <div class="skill-bar-label"><span>${UI.escapeHtml(skill)}</span><span>${v.missing_count} students missing · ${v.gap_total} total gap points</span></div>
      ${UI.progressBar(Math.min(100, v.missing_count * 12), "amber")}
    </div>`).join("");
  }

  function skillPriorityList(limit = 8) {
    const priority = AnalyticsMetrics.calculateSkillPriority();
    const rows = Object.entries(priority).slice(0, limit);
    if (!rows.length) return UI.emptyState("No priority data available yet.");
    return rows.map(([skill, v], i) => `<div class="card">
      <div class="card-row"><div class="card-title">${i + 1}. ${UI.escapeHtml(skill)}</div><span class="badge badge-primary">Priority ${v.priority_score}</span></div>
      <div class="muted" style="font-size:.82rem;">Demand ${v.demand_score} · Gap ${v.gap_score} · Shortage ${v.shortage_score}</div>
    </div>`).join("");
  }

  function renderSkillAnalytics(container, title = "Skill Gaps & Industry Demand") {
    container.innerHTML = UI.sectionHeader(title, "Rule-based analytics — Phase 9. No machine learning is used.") +
      `<div class="grid grid-2">
        <div><h4>Demand vs Supply</h4>${skillDemandSupplyTable()}</div>
        <div><h4>Student Skill Priority</h4>${skillPriorityList(6)}</div>
      </div>
      <hr class="divider">
      <h4>Skill Gaps Across Tracked Students</h4>
      ${skillGapAnalyticsList()}`;
  }

  function renderCurriculum(container) {
    const alignment = CurriculumIntelligence.calculateCurriculumAlignment();
    const recommendations = CurriculumIntelligence.getAcademicRecommendations(8);
    const coverage = CurriculumIntelligence.calculateCurriculumCoverage();

    container.innerHTML = UI.sectionHeader("Curriculum Intelligence", "Transparent prototype indicator — not an official measurement.") +
      UI.metricRow([
        ["Alignment Score", `${alignment.alignment_score}%`],
        ["Demand-Weighted Coverage", `${alignment.demand_weighted_coverage}%`],
        ["Supply Adequacy", `${alignment.supply_adequacy}%`],
        ["Gap Health", `${alignment.gap_health}%`],
      ]) +
      `<hr class="divider">` +
      UI.sectionHeader("Academic Recommendations", "Ranked by Academic Skill Priority Score") +
      recommendations.map((r) => `<div class="card">
        <div class="card-row"><div class="card-title">${UI.escapeHtml(r.skill)}</div>${UI.badge(r.category, r.category.startsWith("Critical") ? "red" : r.category.startsWith("High") ? "amber" : "gray")}</div>
        <div class="muted" style="font-size:.82rem;">Demand: ${r.demand_level} · Supply: ${r.supply_level} · Coverage: ${r.coverage_level}</div>
        <p style="font-size:.86rem;margin-top:6px;">${UI.escapeHtml(r.recommendation)}</p>
      </div>`).join("") +
      `<hr class="divider">` +
      UI.sectionHeader("Curriculum Skill Coverage") +
      `<div class="grid grid-2">${Object.entries(coverage).slice(0, 10).map(([skill, v]) => `<div class="skill-bar-row"><div class="skill-bar-label"><span>${UI.escapeHtml(skill)}</span><span>${v.course_count} course(s)</span></div>${UI.progressBar(v.coverage_score, UI.progressColorForScore(v.coverage_score))}</div>`).join("")}</div>`;
  }

  function renderTraining(container) {
    const priority = AnalyticsMetrics.calculateSkillPriority();
    const rows = Object.entries(priority).slice(0, 10);
    container.innerHTML = UI.sectionHeader("Training Priorities", "Highest-priority skills for training programs, ranked by demand, student gap, and shortage.");
    if (!rows.length) { container.innerHTML += UI.emptyState("No priority data available yet."); return; }
    container.innerHTML += rows.map(([skill, v], i) => `
      <div class="card">
        <div class="card-row"><div class="card-title">${i + 1}. ${UI.escapeHtml(skill)}</div><span class="badge badge-primary">Score ${v.priority_score}</span></div>
        ${UI.progressBar(v.priority_score, UI.progressColorForScore(v.priority_score))}
        <div class="muted" style="font-size:.82rem;">Demand ${v.demand_score} · Gap ${v.gap_score} · Shortage ${v.shortage_score}</div>
      </div>`).join("");
  }

  function renderCollaboration(container) {
    const scores = CollaborationEngine.calculateAllCollaborationScores();
    container.innerHTML = UI.sectionHeader("Industry Collaboration Opportunities", "Companies ranked by collaboration potential — rule-based, not AI-scored.");
    if (!scores.length) { container.innerHTML += UI.emptyState("No industry opportunity data available yet to compute collaboration scores."); return; }
    container.innerHTML += scores.map((s) => `
      <div class="card">
        <div class="card-row"><div class="card-title">${UI.escapeHtml(s.company)}</div>${UI.badge(s.category, UI.matchBadgeKind(s.category))}</div>
        ${UI.progressBar(s.collaboration_score, UI.progressColorForScore(s.collaboration_score))}
        <p style="font-size:.85rem;">${UI.escapeHtml(s.reason)}</p>
        <div class="muted" style="font-size:.8rem;">Demand ${s.demand_relevance} · Gap ${s.gap_relevance} · Curriculum ${s.curriculum_relevance} · Activity ${s.activity}</div>
        <div style="margin-top:6px;">${s.recommended_collaboration_types.map((t) => UI.badge(t, "primary")).join(" ")}</div>
      </div>`).join("");
  }

  function renderDepartmentInsights(container) {
    const depts = DepartmentDomain.calculateDepartmentAnalytics();
    container.innerHTML = UI.sectionHeader("Department-Level Insights");
    if (!depts) { container.innerHTML += UI.emptyState("No department data available yet."); return; }
    container.innerHTML += Object.entries(depts).map(([dept, v]) => `
      <div class="card">
        <div class="card-title">${UI.escapeHtml(dept)}</div>
        <div class="muted" style="font-size:.82rem;">${v.student_count} student(s) tracked</div>
        ${v.top_gaps.length ? `<div style="margin-top:6px;">${v.top_gaps.map((g) => UI.badge(`${g.skill} (${g.missing_count})`, "amber")).join(" ")}</div>` : `<div class="muted">No notable skill gaps.</div>`}
      </div>`).join("");
  }

  function renderReports(container) {
    const students = AnalyticsData.getStudentPopulation();
    const opportunities = AnalyticsData.getOpportunityCatalog();
    const applications = AnalyticsData.getApplicationCatalog();
    const alignment = CurriculumIntelligence.calculateCurriculumAlignment();
    const collabScores = CollaborationEngine.calculateAllCollaborationScores();

    container.innerHTML = UI.sectionHeader("Institution Reports", "A snapshot summary across all tracked data.") +
      UI.metricRow([
        ["Tracked Students", students.length], ["Opportunities", opportunities.length],
        ["Applications", applications.length], ["Curriculum Alignment", `${alignment.alignment_score}%`],
      ]) +
      UI.sectionHeader("Top Collaboration Candidates") +
      (collabScores.length ? collabScores.slice(0, 5).map((s) => `<div>${UI.escapeHtml(s.company)} — ${s.collaboration_score}% (${UI.escapeHtml(s.category)})</div>`).join("") : UI.emptyState("No collaboration data yet."));
  }

  return { renderSkillAnalytics, renderCurriculum, renderTraining, renderCollaboration, renderDepartmentInsights, renderReports };
})();
