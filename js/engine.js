/*
 * engine.js — pure computation, no DOM, no storage reads/writes
 * except where explicitly noted. Faithful line-for-line port of:
 *   modules/student/assessment.py   (scoring logic only)
 *   modules/student/skill_gap.py    (Phase 4 engine)
 *   modules/matching/opportunity_matcher.py (Phase 7 engine)
 *
 * Every threshold/weight constant below is copied exactly from the
 * Python source so results are identical to the original app.
 */

// ============================================================
// Phase 3 — Assessment scoring (data/assessment_questions.py + assessment.py)
// ============================================================
const Assessment = (() => {
  const PROFICIENCY_THRESHOLDS = [
    [80, "Advanced"], [60, "Intermediate"], [40, "Beginner"], [0, "Needs Improvement"],
  ];
  const STRENGTH_THRESHOLD = 80;

  function getProficiencyLevel(score) {
    for (const [threshold, level] of PROFICIENCY_THRESHOLDS) {
      if (score >= threshold) return level;
    }
    return "Needs Improvement";
  }

  function calculateOverallScore(answers) {
    const questions = DATA.ASSESSMENT_QUESTIONS;
    if (!questions.length) return 0;
    const correct = questions.filter((q) => answers[q.id] === q.answer).length;
    return Math.round((correct / questions.length) * 100);
  }

  function calculateSkillScores(answers) {
    const questions = DATA.ASSESSMENT_QUESTIONS;
    const categories = [...new Set(questions.map((q) => q.category))].sort();
    const scores = {};
    for (const category of categories) {
      const qs = questions.filter((q) => q.category === category);
      const correct = qs.filter((q) => answers[q.id] === q.answer).length;
      scores[category] = Math.round((correct / qs.length) * 100);
    }
    return scores;
  }

  function getStrengthsAndWeaknesses(skillScores) {
    const sorted = Object.entries(skillScores).sort((a, b) => b[1] - a[1]);
    const strengths = sorted.filter(([, s]) => s >= STRENGTH_THRESHOLD);
    const improve = sorted.filter(([, s]) => s < STRENGTH_THRESHOLD).sort((a, b) => a[1] - b[1]);
    return { strengths, areasToImprove: improve };
  }

  function scoreAssessment(answers) {
    const overallScore = calculateOverallScore(answers);
    const skillScores = calculateSkillScores(answers);
    const { strengths, areasToImprove } = getStrengthsAndWeaknesses(skillScores);
    return {
      overall_score: overallScore,
      overall_level: getProficiencyLevel(overallScore),
      skill_scores: skillScores,
      strengths,
      areas_to_improve: areasToImprove,
      total_questions: DATA.ASSESSMENT_QUESTIONS.length,
      completed: true,
    };
  }

  return { getProficiencyLevel, calculateOverallScore, calculateSkillScores, getStrengthsAndWeaknesses, scoreAssessment };
})();

// ============================================================
// Phase 4 — Skill Gap Engine (modules/student/skill_gap.py)
// ============================================================
const SkillGap = (() => {
  const GAP_THRESHOLDS = [[31, "Major Gap"], [16, "Moderate Gap"], [1, "Minor Gap"], [0, "Meets Requirement"]];
  const PRIORITY_THRESHOLDS = [[40, "High"], [15, "Medium"], [0, "Low"]];
  const STATUS_EMOJI = {
    "Meets Requirement": "\uD83D\uDFE2", "Minor Gap": "\uD83D\uDFE1",
    "Moderate Gap": "\uD83D\uDFE1", "Major Gap": "\uD83D\uDD34",
  };

  function canonicalSkillName(skillName) {
    for (const [canonical, aliases] of Object.entries(DATA.SKILL_ALIASES)) {
      if (aliases.includes(skillName)) return canonical;
    }
    return skillName;
  }

  // Builds the combined skill profile from declared skills (Phase 2)
  // + assessment result (Phase 3). Assessment scores win when both exist.
  function getCurrentSkillProfile(technicalSkills, softSkills, assessmentResult) {
    const declared = {};
    for (const [skill, level] of Object.entries({ ...technicalSkills, ...softSkills })) {
      declared[canonicalSkillName(skill)] = DATA.DECLARED_PROFICIENCY_SCORES[level] || 0;
    }
    const assessed = {};
    if (assessmentResult) {
      for (const [skill, score] of Object.entries(assessmentResult.skill_scores || {})) {
        assessed[canonicalSkillName(skill)] = score;
      }
    }
    return { ...declared, ...assessed };
  }

  function getRoleRequirements(targetRole) {
    return DATA.JOB_ROLES[targetRole] || {};
  }

  function calculateSkillGapValue(current, required) {
    return Math.max(required - current, 0);
  }

  function classifyGap(gap) {
    for (const [threshold, status] of GAP_THRESHOLDS) {
      if (gap >= threshold) return status;
    }
    return "Meets Requirement";
  }

  function calculatePriority(gap, importance) {
    const score = Math.round(gap * importance);
    let level = "Low";
    for (const [threshold, l] of PRIORITY_THRESHOLDS) {
      if (score >= threshold) { level = l; break; }
    }
    return [score, level];
  }

  function calculateReadinessScore(skillsResult) {
    const values = Object.values(skillsResult);
    if (!values.length) return 0;
    const contributions = values.map((d) => (d.required > 0 ? Math.min((d.current / d.required) * 100, 100) : 100));
    return Math.round(contributions.reduce((a, b) => a + b, 0) / contributions.length);
  }

  // Full analysis, mirrors analyze_skill_gap(). currentProfile is
  // already the combined Phase 2+3 profile from getCurrentSkillProfile().
  function analyzeSkillGap(targetRole, currentProfile) {
    const requirements = getRoleRequirements(targetRole);
    if (!Object.keys(requirements).length) return null;

    const skillsResult = {};
    const priorityGaps = [];

    for (const [skillName, req] of Object.entries(requirements)) {
      const requiredScore = req.required_score;
      const importance = req.importance !== undefined ? req.importance : 1.0;
      const hasData = Object.prototype.hasOwnProperty.call(currentProfile, skillName);
      const currentScore = currentProfile[skillName] || 0;

      const gap = calculateSkillGapValue(currentScore, requiredScore);
      const status = classifyGap(gap);
      skillsResult[skillName] = { current: currentScore, required: requiredScore, gap, status, has_data: hasData };

      if (gap > 0) {
        const [priorityScore, priorityLevel] = calculatePriority(gap, importance);
        priorityGaps.push({ skill: skillName, gap, priority_score: priorityScore, priority_level: priorityLevel });
      }
    }
    priorityGaps.sort((a, b) => b.priority_score - a.priority_score);

    return {
      target_role: targetRole,
      readiness_score: calculateReadinessScore(skillsResult),
      skills: skillsResult,
      priority_gaps: priorityGaps,
    };
  }

  // Shared target-role lookup used by Phases 5/6/7.
  function matchProfileRole(profileTargetRole, roleNames) {
    const normalized = (profileTargetRole || "").trim().toLowerCase();
    if (!normalized) return null;
    return roleNames.find((r) => r.toLowerCase() === normalized) || null;
  }

  function getEffectiveTargetRole(knownRoles, skillGapTargetRole, profileTargetJobRole) {
    if (skillGapTargetRole && knownRoles.includes(skillGapTargetRole)) return skillGapTargetRole;
    return matchProfileRole(profileTargetJobRole, knownRoles);
  }

  return {
    canonicalSkillName, getCurrentSkillProfile, getRoleRequirements,
    calculateSkillGapValue, classifyGap, calculatePriority, calculateReadinessScore,
    analyzeSkillGap, matchProfileRole, getEffectiveTargetRole, STATUS_EMOJI,
  };
})();

// ============================================================
// Phase 7 — Smart Opportunity Matching Engine (modules/matching/opportunity_matcher.py)
// ============================================================
const Matcher = (() => {
  const MATCH_WEIGHTS = { required_skill: 0.50, preferred_skill: 0.10, role_relevance: 0.25, skill_gap_relevance: 0.15 };
  const ROLE_PRIMARY_DOMAIN = {
    "Data Scientist": "Data Science", "Data Analyst": "Data Analytics",
    "Machine Learning Engineer": "Machine Learning", "AI Engineer": "AI",
    "Python Developer": "Python Development", "Software Developer": "Software Development",
  };
  const ROLE_RELEVANCE_SCORE = { High: 100, Medium: 60, Low: 20, "Not Set": 0 };
  const SKILL_GAP_RELEVANCE_THRESHOLDS = [[66, "High"], [33, "Medium"], [1, "Low"], [0, "None"]];
  const MATCH_CATEGORY_THRESHOLDS = [[80, "Excellent Match"], [65, "Strong Match"], [50, "Moderate Match"], [0, "Low Match"]];
  const SKILL_GAP_RELEVANCE_FALLBACK_SCORE = 50;

  function calculateRequiredSkillAlignment(currentProfile, requiredSkills) {
    if (!requiredSkills.length) return { score: 100, matched_count: 0, total: 0 };
    let matchedCount = 0, totalProficiency = 0;
    for (const skill of requiredSkills) {
      const canonical = SkillGap.canonicalSkillName(skill);
      const proficiency = currentProfile[canonical] || 0;
      totalProficiency += proficiency;
      if (Object.prototype.hasOwnProperty.call(currentProfile, canonical)) matchedCount++;
    }
    return { score: Math.round(totalProficiency / requiredSkills.length), matched_count: matchedCount, total: requiredSkills.length };
  }

  function calculatePreferredSkillAlignment(currentProfile, preferredSkills) {
    if (!preferredSkills.length) return { score: 100, matched_count: 0, total: 0 };
    const matchedCount = preferredSkills.filter((s) => Object.prototype.hasOwnProperty.call(currentProfile, SkillGap.canonicalSkillName(s))).length;
    return { score: Math.round((matchedCount / preferredSkills.length) * 100), matched_count: matchedCount, total: preferredSkills.length };
  }

  function calculateRoleRelevance(targetRole, opportunityDomain) {
    if (!targetRole) return { level: "Not Set", score: ROLE_RELEVANCE_SCORE["Not Set"] };
    const primaryDomain = ROLE_PRIMARY_DOMAIN[targetRole];
    const relatedDomains = DATA.ROLE_DOMAIN_RELEVANCE[targetRole] || [];
    let level;
    if (opportunityDomain === primaryDomain) level = "High";
    else if (relatedDomains.includes(opportunityDomain)) level = "Medium";
    else level = "Low";
    return { level, score: ROLE_RELEVANCE_SCORE[level] };
  }

  function classifySkillGapRelevance(score) {
    for (const [threshold, level] of SKILL_GAP_RELEVANCE_THRESHOLDS) if (score >= threshold) return level;
    return "None";
  }

  function calculateSkillGapRelevance(requiredSkills, skillGapNames) {
    if (!skillGapNames.length) {
      return { level: "Not Available", score: SKILL_GAP_RELEVANCE_FALLBACK_SCORE, matched_gaps: [], coverage_text: "N/A" };
    }
    const canonicalRequired = new Set(requiredSkills.map((s) => SkillGap.canonicalSkillName(s)));
    const matchedGaps = skillGapNames.filter((g) => canonicalRequired.has(g));
    const score = Math.round((matchedGaps.length / skillGapNames.length) * 100);
    return { level: classifySkillGapRelevance(score), score, matched_gaps: matchedGaps, coverage_text: `${matchedGaps.length}/${skillGapNames.length}` };
  }

  function calculateOverallMatch(requiredScore, preferredScore, roleScore, skillGapScore) {
    return Math.round(
      requiredScore * MATCH_WEIGHTS.required_skill +
      preferredScore * MATCH_WEIGHTS.preferred_skill +
      roleScore * MATCH_WEIGHTS.role_relevance +
      skillGapScore * MATCH_WEIGHTS.skill_gap_relevance
    );
  }

  function getMatchCategory(score) {
    for (const [threshold, category] of MATCH_CATEGORY_THRESHOLDS) if (score >= threshold) return category;
    return "Low Match";
  }

  function generateMatchExplanation(opportunity, currentProfile, requiredResult, preferredResult, roleResult, skillGapResult) {
    const reasons = [];
    const improvements = [];

    if (requiredResult.total > 0) {
      if (requiredResult.matched_count === requiredResult.total) reasons.push("All required skills match");
      else if (requiredResult.matched_count > 0) reasons.push(`${requiredResult.matched_count}/${requiredResult.total} required skills match`);
    }
    if (roleResult.level === "High") reasons.push(`Target role matches this opportunity's domain (${opportunity.domain})`);
    else if (roleResult.level === "Medium") reasons.push(`Opportunity domain (${opportunity.domain}) is related to your target role`);

    if (skillGapResult.matched_gaps.length) {
      const n = skillGapResult.matched_gaps.length;
      reasons.push(n === 1
        ? `Addresses your ${skillGapResult.matched_gaps[0]} skill gap`
        : `Addresses ${n} of your skill gaps: ${skillGapResult.matched_gaps.join(", ")}`);
    }
    if (preferredResult.total > 0 && preferredResult.matched_count > 0) {
      reasons.push(`${preferredResult.matched_count}/${preferredResult.total} preferred skills match`);
    }
    if (!reasons.length) reasons.push("Limited alignment with your current profile — still worth reviewing the full details");

    for (const skill of opportunity.required_skills) {
      const canonical = SkillGap.canonicalSkillName(skill);
      if (!Object.prototype.hasOwnProperty.call(currentProfile, canonical)) improvements.push(skill);
    }
    for (const skill of opportunity.preferred_skills) {
      const canonical = SkillGap.canonicalSkillName(skill);
      if (!Object.prototype.hasOwnProperty.call(currentProfile, canonical) && !improvements.includes(skill)) improvements.push(skill);
    }
    return { reasons, improvements };
  }

  function computeMatch(opportunity, currentProfile, targetRole, skillGapNames) {
    const requiredResult = calculateRequiredSkillAlignment(currentProfile, opportunity.required_skills);
    const preferredResult = calculatePreferredSkillAlignment(currentProfile, opportunity.preferred_skills);
    const roleResult = calculateRoleRelevance(targetRole, opportunity.domain);
    const skillGapResult = calculateSkillGapRelevance(opportunity.required_skills, skillGapNames);

    const overallScore = calculateOverallMatch(requiredResult.score, preferredResult.score, roleResult.score, skillGapResult.score);
    const matchCategory = getMatchCategory(overallScore);
    const explanation = generateMatchExplanation(opportunity, currentProfile, requiredResult, preferredResult, roleResult, skillGapResult);

    return {
      opportunity_id: opportunity.id,
      match_score: overallScore,
      match_category: matchCategory,
      skill_alignment: requiredResult.score,
      preferred_alignment: preferredResult.score,
      role_relevance: roleResult.level,
      skill_gap_coverage: skillGapResult.coverage_text,
      skill_gap_matched_count: skillGapResult.matched_gaps.length,
      reasons: explanation.reasons,
      improvements: explanation.improvements,
    };
  }

  function rankOpportunities(opportunities, currentProfile, targetRole, skillGapNames) {
    const results = opportunities.map((o) => computeMatch(o, currentProfile, targetRole, skillGapNames));
    results.sort((a, b) => b.match_score - a.match_score);
    return results;
  }

  function getRecommendedOpportunities(opportunities, currentProfile, targetRole, skillGapNames, limit = 5) {
    return rankOpportunities(opportunities, currentProfile, targetRole, skillGapNames).slice(0, limit);
  }

  return { computeMatch, rankOpportunities, getRecommendedOpportunities, calculateRoleRelevance, ROLE_PRIMARY_DOMAIN };
})();
