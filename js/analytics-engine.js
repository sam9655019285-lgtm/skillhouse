/*
 * analytics-engine.js — pure computation ported from:
 *   modules/industry/candidates.py     (candidate roster + gap/match reuse)
 *   modules/analytics/data.py          (shared data access + normalize_skill)
 *   modules/analytics/metrics.py       (Phase 9 core skill analytics)
 *   modules/collaboration/curriculum_intelligence.py (Phase 10)
 *   modules/collaboration/collaboration_engine.py    (Phase 10)
 *   modules/analytics/department_domain.py            (department/domain analytics)
 *
 * Every function takes plain data in and returns plain data out, same
 * as the Python originals — no localStorage reads happen inside this
 * file except through the small getStudentPopulation() bridge, which
 * mirrors modules/analytics/data.py's role of joining Phase 8's mock
 * roster with the live session's own candidate.
 */

const Candidates = (() => {
  const KNOWN_ROLES = Object.keys(DATA.JOB_ROLES);

  // Builds a candidate record for whoever is using the Student side
  // of this browser (their user_id), from their real data. Returns
  // null if they haven't entered anything yet.
  function getSelfCandidate() {
    const technicalSkills = Storage.get("technical_skills", {});
    const softSkills = Storage.get("soft_skills", {});
    const assessmentResult = Storage.get("assessment_result", null);
    const currentProfile = SkillGap.getCurrentSkillProfile(technicalSkills, softSkills, assessmentResult);

    const studentProfile = Storage.get("student_profile", {});
    const skillGapTargetRole = Storage.get("skill_gap_target_role", null);
    const targetRole = SkillGap.getEffectiveTargetRole(KNOWN_ROLES, skillGapTargetRole, studentProfile.target_job_role || "");

    if (!Object.keys(currentProfile).length && !targetRole) return null;

    return {
      id: "self",
      name: (studentProfile.full_name || "").trim() || "You (Current Student)",
      target_role: targetRole,
      domain: null,
      department: (studentProfile.department || "").trim(),
      skill_profile: currentProfile,
      certifications: Storage.get("certifications", []),
      projects: Storage.get("projects", []),
    };
  }

  function getAllCandidates() {
    const candidates = JSON.parse(JSON.stringify(DATA.CANDIDATES));
    const self = getSelfCandidate();
    if (self) candidates.push(self);
    return candidates;
  }

  function getCandidateById(candidates, candidateId) {
    if (candidateId === "self") return getSelfCandidate();
    return DATA.CANDIDATES.find((c) => c.id === candidateId) || null;
  }

  // Mirrors compute_candidate_skill_gap(): reuses the Phase 4 engine
  // for both the live "self" candidate and the mock roster.
  function computeCandidateSkillGap(candidate) {
    const targetRole = candidate.target_role;
    if (!targetRole || !DATA.JOB_ROLES[targetRole]) return null;

    if (candidate.id === "self") {
      const saved = Storage.get("skill_gap_analysis", null);
      if (saved && saved.target_role === targetRole) return saved;
      return SkillGap.analyzeSkillGap(targetRole, candidate.skill_profile);
    }
    return SkillGap.analyzeSkillGap(targetRole, candidate.skill_profile);
  }

  function getCandidateSkillGapNames(candidate) {
    const gapResult = computeCandidateSkillGap(candidate);
    if (!gapResult) return [];
    return gapResult.priority_gaps.map((g) => g.skill);
  }

  function computeCandidateMatch(candidate, opportunity) {
    const skillGapNames = getCandidateSkillGapNames(candidate);
    return Matcher.computeMatch(opportunity, candidate.skill_profile, candidate.target_role, skillGapNames);
  }

  function rankCandidatesForOpportunity(opportunity, candidates, limit) {
    candidates = candidates || getAllCandidates();
    const results = [];
    for (const candidate of candidates) {
      const matchResult = computeCandidateMatch(candidate, opportunity);
      if (matchResult) {
        matchResult.candidate_id = candidate.id;
        matchResult.candidate_name = candidate.name;
        results.push(matchResult);
      }
    }
    results.sort((a, b) => b.match_score - a.match_score);
    return limit ? results.slice(0, limit) : results;
  }

  return { KNOWN_ROLES, getSelfCandidate, getAllCandidates, getCandidateById, computeCandidateSkillGap, getCandidateSkillGapNames, computeCandidateMatch, rankCandidatesForOpportunity };
})();

// ============================================================
// Shared data access (modules/analytics/data.py)
// ============================================================
const AnalyticsData = (() => {
  function normalizeSkill(skillName) {
    return SkillGap.canonicalSkillName((skillName || "").trim());
  }
  function getStudentPopulation() {
    return Candidates.getAllCandidates();
  }
  function getOpportunityCatalog() {
    return Opportunities.loadOpportunities();
  }
  function getApplicationCatalog() {
    return Applications.getAllCandidateApplications();
  }
  function getLearningCatalog() {
    return DATA.LEARNING_RESOURCES;
  }
  function studentsWithTargetRole() {
    return getStudentPopulation().filter((s) => s.target_role in DATA.JOB_ROLES);
  }
  function candidateGapResult(student) {
    return Candidates.computeCandidateSkillGap(student);
  }
  return { normalizeSkill, getStudentPopulation, getOpportunityCatalog, getApplicationCatalog, getLearningCatalog, studentsWithTargetRole, candidateGapResult };
})();

// ============================================================
// Phase 9 — core skill analytics (modules/analytics/metrics.py)
// ============================================================
const AnalyticsMetrics = (() => {
  const SUPPLY_DEMAND_THRESHOLDS = [[1.5, "High Supply"], [0.75, "Balanced"], [0.3, "Moderate Shortage"], [0.0, "High Shortage"]];
  const PRIORITY_WEIGHTS = { demand: 0.50, gap: 0.30, shortage: 0.20 };

  function calculateSkillDemand(opportunities) {
    opportunities = opportunities || AnalyticsData.getOpportunityCatalog();
    const requiredCounts = {}, preferredCounts = {}, displayNames = {};
    for (const opp of opportunities) {
      for (const skill of opp.required_skills || []) {
        const c = AnalyticsData.normalizeSkill(skill);
        requiredCounts[c] = (requiredCounts[c] || 0) + 1;
        if (!(c in displayNames)) displayNames[c] = skill;
      }
      for (const skill of opp.preferred_skills || []) {
        const c = AnalyticsData.normalizeSkill(skill);
        preferredCounts[c] = (preferredCounts[c] || 0) + 1;
        if (!(c in displayNames)) displayNames[c] = skill;
      }
    }
    const allSkills = new Set([...Object.keys(requiredCounts), ...Object.keys(preferredCounts)]);
    const result = {};
    for (const canonical of allSkills) {
      const req = requiredCounts[canonical] || 0, pref = preferredCounts[canonical] || 0;
      result[displayNames[canonical]] = { required: req, preferred: pref, total: req + pref };
    }
    return sortByDesc(result, (v) => v.total);
  }

  function calculateSkillSupply(students) {
    students = students || AnalyticsData.getStudentPopulation();
    const counts = {}, scoreTotals = {}, displayNames = {};
    for (const student of students) {
      for (const [skill, score] of Object.entries(student.skill_profile || {})) {
        const c = AnalyticsData.normalizeSkill(skill);
        counts[c] = (counts[c] || 0) + 1;
        scoreTotals[c] = (scoreTotals[c] || 0) + (score || 0);
        if (!(c in displayNames)) displayNames[c] = skill;
      }
    }
    const result = {};
    for (const [canonical, count] of Object.entries(counts)) {
      result[displayNames[canonical]] = { students: count, avg_proficiency: count ? Math.round(scoreTotals[canonical] / count) : 0 };
    }
    return sortByDesc(result, (v) => v.students);
  }

  function calculateSkillGaps(students) {
    students = students || AnalyticsData.studentsWithTargetRole();
    const missingCounts = {}, gapTotals = {};
    for (const student of students) {
      const gapResult = AnalyticsData.candidateGapResult(student);
      if (!gapResult) continue;
      for (const g of gapResult.priority_gaps) {
        missingCounts[g.skill] = (missingCounts[g.skill] || 0) + 1;
        gapTotals[g.skill] = (gapTotals[g.skill] || 0) + g.gap;
      }
    }
    const result = {};
    for (const [skill, count] of Object.entries(missingCounts)) {
      result[skill] = { missing_count: count, gap_total: gapTotals[skill] };
    }
    return sortByDesc(result, (v) => v.missing_count);
  }

  function classifySupplyDemand(ratio) {
    for (const [threshold, label] of SUPPLY_DEMAND_THRESHOLDS) if (ratio >= threshold) return label;
    return "High Shortage";
  }

  function calculateSupplyDemand(demand, supply) {
    demand = demand || calculateSkillDemand();
    supply = supply || calculateSkillSupply();
    const allSkills = new Set([...Object.keys(demand), ...Object.keys(supply)]);
    const result = {};
    for (const skill of allSkills) {
      const demandCount = (demand[skill] || {}).total || 0;
      const supplyCount = (supply[skill] || {}).students || 0;
      let ratio = null, category;
      if (demandCount === 0) { category = "No Industry Demand"; }
      else { ratio = Math.round((supplyCount / demandCount) * 100) / 100; category = classifySupplyDemand(ratio); }
      result[skill] = { demand: demandCount, supply: supplyCount, ratio, category };
    }
    return sortByDesc(result, (v) => v.demand);
  }

  function calculateSkillPriority(demand, supply, gaps) {
    demand = demand || calculateSkillDemand();
    supply = supply || calculateSkillSupply();
    const supplyDemand = calculateSupplyDemand(demand, supply);
    gaps = gaps || calculateSkillGaps();

    const maxDemand = Math.max(0, ...Object.values(demand).map((v) => v.total)) || 1;
    const maxGap = Math.max(0, ...Object.values(gaps).map((v) => v.missing_count)) || 1;

    const allSkills = new Set([...Object.keys(demand), ...Object.keys(gaps)]);
    const result = {};
    for (const skill of allSkills) {
      const demandScore = ((demand[skill] || {}).total || 0) / maxDemand * 100;
      const gapScore = ((gaps[skill] || {}).missing_count || 0) / maxGap * 100;
      const sd = supplyDemand[skill];
      const shortageScore = (!sd || sd.ratio === null) ? 0 : Math.max(0, 1 - Math.min(sd.ratio, 1)) * 100;

      const priorityScore = Math.round(demandScore * PRIORITY_WEIGHTS.demand + gapScore * PRIORITY_WEIGHTS.gap + shortageScore * PRIORITY_WEIGHTS.shortage);
      result[skill] = { priority_score: priorityScore, demand_score: Math.round(demandScore), gap_score: Math.round(gapScore), shortage_score: Math.round(shortageScore) };
    }
    return sortByDesc(result, (v) => v.priority_score);
  }

  return { calculateSkillDemand, calculateSkillSupply, calculateSkillGaps, calculateSupplyDemand, calculateSkillPriority };
})();

// small shared helper: sort an object's entries by a numeric key, descending
function sortByDesc(obj, keyFn) {
  return Object.fromEntries(Object.entries(obj).sort((a, b) => keyFn(b[1]) - keyFn(a[1])));
}

// ============================================================
// Phase 10 — Curriculum Intelligence (modules/collaboration/curriculum_intelligence.py)
// ============================================================
const CurriculumIntelligence = (() => {
  const LEVEL_THRESHOLDS = [[70, "High"], [40, "Medium"], [15, "Low"], [0, "Very Low"]];
  const ACADEMIC_PRIORITY_WEIGHTS = { demand: 0.40, gap: 0.30, shortage: 0.20, coverage_deficiency: 0.10 };
  const ACADEMIC_PRIORITY_CATEGORIES = [[80, "Critical Priority"], [65, "High Priority"], [50, "Medium Priority"], [0, "Low Priority"]];

  function bucketLevel(score) {
    for (const [threshold, label] of LEVEL_THRESHOLDS) if (score >= threshold) return label;
    return "Very Low";
  }
  function classifyAcademicPriority(score) {
    for (const [threshold, label] of ACADEMIC_PRIORITY_CATEGORIES) if (score >= threshold) return label;
    return "Low Priority";
  }

  function calculateCurriculumCoverage(courses) {
    courses = courses || DATA.COURSES;
    const courseCounts = {}, courseNames = {}, displayNames = {};
    for (const course of courses) {
      for (const skill of course.skills_covered || []) {
        const c = AnalyticsData.normalizeSkill(skill);
        courseCounts[c] = (courseCounts[c] || 0) + 1;
        (courseNames[c] = courseNames[c] || []).push(course.course_name);
        if (!(c in displayNames)) displayNames[c] = skill;
      }
    }
    const maxCount = Math.max(0, ...Object.values(courseCounts)) || 1;
    const result = {};
    for (const [canonical, count] of Object.entries(courseCounts)) {
      result[displayNames[canonical]] = { course_count: count, courses: courseNames[canonical], coverage_score: Math.round((count / maxCount) * 100) };
    }
    return sortByDesc(result, (v) => v.course_count);
  }

  function calculateCurriculumAlignment() {
    const demand = AnalyticsMetrics.calculateSkillDemand();
    const supply = AnalyticsMetrics.calculateSkillSupply();
    const priority = AnalyticsMetrics.calculateSkillPriority(demand, supply);
    const coverage = calculateCurriculumCoverage();
    const coverageByCanonical = {};
    for (const [skill, v] of Object.entries(coverage)) coverageByCanonical[AnalyticsData.normalizeSkill(skill)] = v;

    const totalDemand = Object.values(demand).reduce((s, v) => s + v.total, 0) || 1;
    let weightedCovered = 0, weightedSupply = 0, weightedGapHealth = 0, weightedCoverageDepth = 0;
    const perSkill = {};
    const maxStudents = AnalyticsData.getStudentPopulation().length || 1;

    for (const [skill, demandStats] of Object.entries(demand)) {
      const canonical = AnalyticsData.normalizeSkill(skill);
      const weight = demandStats.total / totalDemand;
      const coverageStats = coverageByCanonical[canonical];
      const covered = coverageStats ? 1 : 0;
      const coverageDepthScore = coverageStats ? coverageStats.coverage_score : 0;

      const skillPriority = priority[skill] || { demand_score: 0, gap_score: 0 };
      const supplyCount = (supply[skill] || {}).students || 0;
      const supplyAdequacyScore = Math.round((supplyCount / maxStudents) * 100);
      const gapHealthScore = 100 - (skillPriority.gap_score || 0);

      weightedCovered += weight * (covered * 100);
      weightedSupply += weight * supplyAdequacyScore;
      weightedGapHealth += weight * gapHealthScore;
      weightedCoverageDepth += weight * coverageDepthScore;

      perSkill[skill] = { demand_score: skillPriority.demand_score || 0, supply_adequacy: supplyAdequacyScore, gap_health: gapHealthScore, coverage_score: coverageDepthScore, covered_by_curriculum: !!covered };
    }

    const demandWeightedCoverage = Math.round(weightedCovered);
    const supplyAdequacy = Math.round(weightedSupply);
    const gapHealth = Math.round(weightedGapHealth);
    const coverageDepth = Math.round(weightedCoverageDepth);
    const alignmentScore = Math.round((demandWeightedCoverage + supplyAdequacy + gapHealth + coverageDepth) / 4);

    return { alignment_score: alignmentScore, demand_weighted_coverage: demandWeightedCoverage, supply_adequacy: supplyAdequacy, gap_health: gapHealth, coverage_depth: coverageDepth, skills: perSkill };
  }

  function calculateAcademicPriorityScore() {
    const priority = AnalyticsMetrics.calculateSkillPriority();
    const coverage = calculateCurriculumCoverage();
    const coverageByCanonical = {};
    for (const [skill, v] of Object.entries(coverage)) coverageByCanonical[AnalyticsData.normalizeSkill(skill)] = v;

    const result = {};
    for (const [skill, scores] of Object.entries(priority)) {
      const coverageStats = coverageByCanonical[AnalyticsData.normalizeSkill(skill)];
      const coverageScore = coverageStats ? coverageStats.coverage_score : 0;
      const coverageDeficiencyScore = 100 - coverageScore;
      const academicPriorityScore = Math.round(
        scores.demand_score * ACADEMIC_PRIORITY_WEIGHTS.demand +
        scores.gap_score * ACADEMIC_PRIORITY_WEIGHTS.gap +
        scores.shortage_score * ACADEMIC_PRIORITY_WEIGHTS.shortage +
        coverageDeficiencyScore * ACADEMIC_PRIORITY_WEIGHTS.coverage_deficiency
      );
      result[skill] = { academic_priority_score: academicPriorityScore, category: classifyAcademicPriority(academicPriorityScore), demand_score: scores.demand_score, gap_score: scores.gap_score, shortage_score: scores.shortage_score, coverage_deficiency_score: coverageDeficiencyScore };
    }
    return sortByDesc(result, (v) => v.academic_priority_score);
  }

  function getAcademicRecommendation(demandScore, supplyScore, coverageScore) {
    const demandLevel = bucketLevel(demandScore), supplyLevel = bucketLevel(supplyScore), coverageLevel = bucketLevel(coverageScore);
    const low = ["Low", "Very Low"];
    if (demandLevel === "High" && low.includes(supplyLevel) && low.includes(coverageLevel)) return "Increase curriculum/training coverage for this skill.";
    if (demandLevel === "High" && supplyLevel === "Medium" && coverageLevel === "Medium") return "Strengthen practical training and industry projects.";
    if (demandLevel === "High" && supplyLevel === "High" && coverageLevel === "High") return "Maintain current curriculum coverage and provide advanced projects.";
    if (low.includes(demandLevel) && supplyLevel === "High") return "Do not prioritize additional curriculum expansion at this stage.";
    return "Monitor this skill's demand and supply trends; no immediate curriculum action needed.";
  }

  function getAcademicRecommendations(limit = 8) {
    const academicPriority = calculateAcademicPriorityScore();
    const alignment = calculateCurriculumAlignment();
    const recs = [];
    for (const [skill, scores] of Object.entries(academicPriority).slice(0, limit)) {
      const skillAlignment = alignment.skills[skill] || {};
      const supplyScore = skillAlignment.supply_adequacy || 0;
      const coverageScore = skillAlignment.coverage_score || 0;
      recs.push({
        skill, academic_priority_score: scores.academic_priority_score, category: scores.category,
        demand_level: bucketLevel(scores.demand_score), supply_level: bucketLevel(supplyScore), coverage_level: bucketLevel(coverageScore),
        recommendation: getAcademicRecommendation(scores.demand_score, supplyScore, coverageScore),
      });
    }
    return recs;
  }

  return { bucketLevel, classifyAcademicPriority, calculateCurriculumCoverage, calculateCurriculumAlignment, calculateAcademicPriorityScore, getAcademicRecommendation, getAcademicRecommendations };
})();

// ============================================================
// Phase 10 — Collaboration Engine (modules/collaboration/collaboration_engine.py)
// ============================================================
const CollaborationEngine = (() => {
  const COLLABORATION_WEIGHTS = { demand_relevance: 0.40, gap_relevance: 0.30, curriculum_relevance: 0.20, activity: 0.10 };
  const COLLABORATION_CATEGORIES = [[80, "Excellent Collaboration Potential"], [65, "Strong Potential"], [50, "Moderate Potential"], [0, "Low Potential"]];
  const TYPE_TO_COLLABORATION = { Internship: "Internship Program", Job: "Placement Training", "Industry Project": "Industry Project Collaboration", "Training Program": "Industry Workshop" };
  const GAP_SEVERITY_THRESHOLD = 60;
  const CURRICULUM_DEFICIENCY_THRESHOLD = 60;

  function classifyCollaboration(score) {
    for (const [threshold, label] of COLLABORATION_CATEGORIES) if (score >= threshold) return label;
    return "Low Potential";
  }

  function getCompaniesWithOpportunities(opportunities) {
    opportunities = opportunities || AnalyticsData.getOpportunityCatalog();
    const byCompany = {};
    for (const opp of opportunities) {
      (byCompany[opp.company] = byCompany[opp.company] || []).push(opp);
    }
    return byCompany;
  }

  function getCompanyRequiredSkills(companyOpportunities) {
    const required = {};
    for (const opp of companyOpportunities) {
      for (const skill of opp.required_skills || []) {
        const c = AnalyticsData.normalizeSkill(skill);
        if (!(c in required)) required[c] = skill;
      }
    }
    return required;
  }

  function recommendCollaborationTypes(companyOpportunities, gapRelevance, curriculumRelevance) {
    const postedTypes = new Set(companyOpportunities.map((o) => o.type));
    const types = [];
    for (const postedType of postedTypes) {
      const mapped = TYPE_TO_COLLABORATION[postedType];
      if (mapped && !types.includes(mapped)) types.push(mapped);
    }
    if (gapRelevance >= GAP_SEVERITY_THRESHOLD && !types.includes("Student Training")) types.push("Student Training");
    if (curriculumRelevance >= CURRICULUM_DEFICIENCY_THRESHOLD && !types.includes("Curriculum Consultation")) types.push("Curriculum Consultation");
    if (!types.length) types.push("Guest Lecture");
    return types;
  }

  function calculateCollaborationScore(company, companyOpportunities, priority, coverage, maxOpportunityCount) {
    priority = priority || AnalyticsMetrics.calculateSkillPriority();
    coverage = coverage || CurriculumIntelligence.calculateCurriculumCoverage();
    const coverageByCanonical = {};
    for (const [skill, v] of Object.entries(coverage)) coverageByCanonical[AnalyticsData.normalizeSkill(skill)] = v;

    const requiredSkills = getCompanyRequiredSkills(companyOpportunities);
    if (!Object.keys(requiredSkills).length) return null;

    const demandScores = [], gapScores = [], deficiencyScores = [];
    for (const [canonical, displayName] of Object.entries(requiredSkills)) {
      const skillPriority = priority[displayName];
      demandScores.push(skillPriority ? skillPriority.demand_score : 0);
      gapScores.push(skillPriority ? skillPriority.gap_score : 0);
      const coverageStats = coverageByCanonical[canonical];
      const coverageScore = coverageStats ? coverageStats.coverage_score : 0;
      deficiencyScores.push(100 - coverageScore);
    }
    const avg = (arr) => Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
    const demandRelevance = avg(demandScores), gapRelevance = avg(gapScores), curriculumRelevance = avg(deficiencyScores);
    const activity = Math.round((companyOpportunities.length / maxOpportunityCount) * 100);

    const collaborationScore = Math.round(
      demandRelevance * COLLABORATION_WEIGHTS.demand_relevance +
      gapRelevance * COLLABORATION_WEIGHTS.gap_relevance +
      curriculumRelevance * COLLABORATION_WEIGHTS.curriculum_relevance +
      activity * COLLABORATION_WEIGHTS.activity
    );

    const topRelevantSkills = Object.values(requiredSkills)
      .sort((a, b) => ((priority[b] || {}).gap_score || 0) - ((priority[a] || {}).gap_score || 0))
      .slice(0, 2);

    const reason = topRelevantSkills.length
      ? `${company} requires ${topRelevantSkills.join(" and ")}, where students currently show significant gaps.`
      : `${company}'s required skills are already well-supplied and covered by the curriculum.`;

    return {
      company, collaboration_score: collaborationScore, category: classifyCollaboration(collaborationScore),
      demand_relevance: demandRelevance, gap_relevance: gapRelevance, curriculum_relevance: curriculumRelevance, activity,
      required_skills: Object.values(requiredSkills), reason,
      recommended_collaboration_types: recommendCollaborationTypes(companyOpportunities, gapRelevance, curriculumRelevance),
    };
  }

  function calculateAllCollaborationScores(opportunities) {
    const companies = getCompaniesWithOpportunities(opportunities);
    if (!Object.keys(companies).length) return [];
    const priority = AnalyticsMetrics.calculateSkillPriority();
    const coverage = CurriculumIntelligence.calculateCurriculumCoverage();
    const maxOpportunityCount = Math.max(1, ...Object.values(companies).map((v) => v.length));

    const scores = [];
    for (const [company, companyOpportunities] of Object.entries(companies)) {
      const score = calculateCollaborationScore(company, companyOpportunities, priority, coverage, maxOpportunityCount);
      if (score) scores.push(score);
    }
    return scores.sort((a, b) => b.collaboration_score - a.collaboration_score);
  }

  return { calculateAllCollaborationScores, calculateCollaborationScore };
})();

// ============================================================
// Department / domain analytics (modules/analytics/department_domain.py)
// ============================================================
const DepartmentDomain = (() => {
  function calculateDepartmentAnalytics() {
    const students = AnalyticsData.getStudentPopulation().filter((s) => (s.department || "").trim());
    if (!students.length) return null;

    const byDept = {};
    for (const s of students) (byDept[s.department] = byDept[s.department] || []).push(s);

    const result = {};
    for (const [dept, deptStudents] of Object.entries(byDept)) {
      const withRole = deptStudents.filter((s) => s.target_role in DATA.JOB_ROLES);
      const gaps = AnalyticsMetrics.calculateSkillGaps(withRole);
      const topGaps = Object.entries(gaps).slice(0, 5).map(([skill, v]) => ({ skill, ...v }));
      result[dept] = { student_count: deptStudents.length, top_gaps: topGaps };
    }
    return Object.fromEntries(Object.entries(result).sort((a, b) => b[1].student_count - a[1].student_count));
  }

  function calculateDomainAnalytics() {
    const opportunities = AnalyticsData.getOpportunityCatalog();
    const byDomain = {};
    for (const o of opportunities) (byDomain[o.domain] = byDomain[o.domain] || []).push(o);
    const result = {};
    for (const [domain, opps] of Object.entries(byDomain)) {
      result[domain] = { opportunity_count: opps.length, active_count: opps.filter((o) => (o.status || "Active") === "Active").length };
    }
    return Object.fromEntries(Object.entries(result).sort((a, b) => b[1].opportunity_count - a[1].opportunity_count));
  }

  return { calculateDepartmentAnalytics, calculateDomainAnalytics };
})();
