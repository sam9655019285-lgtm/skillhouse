/*
 * js/assistant/assistantClient.js — talks to the backend AI Assistant
 * endpoint (POST /api/assistant/chat) and gathers the context it needs
 * (logged-in user's profile/skills, and the real opportunity catalog)
 * from the modules that already own that data — Auth, Storage,
 * Opportunities (js/opportunities.js) — instead of duplicating it.
 *
 * No API key ever lives here: this file only ever talks to our own
 * backend via ApiClient's BASE_URL, exactly like every other
 * ApiClient.* call in the app.
 */

const AssistantClient = (() => {
  function currentProfileSkills() {
    // Only Student pages load Storage's technical_skills/soft_skills
    // and SkillGap; guard every lookup so this works on any page.
    try {
      const technical = Storage.get("technical_skills", {});
      const soft = Storage.get("soft_skills", {});
      return [...Object.keys(technical || {}), ...Object.keys(soft || {})];
    } catch (e) {
      return [];
    }
  }

  function currentProfileMeta() {
    try {
      const profile = Storage.get("student_profile", {});
      return {
        targetRole: profile.target_job_role || null,
        branch: profile.branch || profile.department || null,
        department: profile.department || null,
      };
    } catch (e) {
      return { targetRole: null, branch: null, department: null };
    }
  }

  function currentOpportunities() {
    try {
      if (typeof Opportunities === "undefined") return [];
      return Opportunities.loadOpportunities().map((o) => ({
        id: o.id, title: o.title, company: o.company, type: o.type, domain: o.domain,
        location: o.location, mode: o.mode, experience: o.experience,
        required_skills: o.required_skills, preferred_skills: o.preferred_skills,
        status: o.status || "Active",
      }));
    } catch (e) {
      return [];
    }
  }

  // Real companies derived from the actual opportunity catalog (see
  // js/recommendations.js) — never fabricated. Empty when the
  // student's department has no matching real data yet.
  function currentCompanies() {
    try {
      if (typeof Recommendations === "undefined") return [];
      return Recommendations.relevantCompanies().map((c) => ({
        name: c.name, domains: c.domains, locations: c.locations, stipends: c.stipends,
        jobs: c.jobs, internships: c.internships, skills: c.skills,
        description: (c.description || "").slice(0, 200),
      }));
    } catch (e) {
      return [];
    }
  }

  // Department-recommended skills the student doesn't have yet (see
  // js/departments.js) — general career guidance, not opportunity data.
  function currentSkillGaps() {
    try {
      if (typeof Recommendations === "undefined") return { have: [], missing: [] };
      return Recommendations.skillGaps();
    } catch (e) {
      return { have: [], missing: [] };
    }
  }

  // Real course/learning-resource recommendations from js/learning.js —
  // the same ranking shown on the "Recommended For You" tab, never a
  // separate/duplicated list. Empty when the assessment hasn't been
  // completed yet (Learning requires it before it will rank anything).
  function currentLearningRecommendations() {
    try {
      if (typeof Learning === "undefined" || !Storage.get("assessment_result", null)) return [];
      const resources = Learning.loadLearningResources();
      const ctx = Learning.buildRecommendationContext();
      return Learning.getRecommendations(resources, ctx, 6).map(([resource, relevance]) => ({
        id: resource.id, title: resource.title, provider: resource.provider, level: resource.level,
        domain: resource.domain, duration: resource.duration, cost: resource.cost,
        skills: resource.skills, match_score: relevance.match_score, reason: relevance.reason,
        has_video: !!Learning.getResourceVideo(resource),
      }));
    } catch (e) {
      return [];
    }
  }

  function currentDepartmentDomains() {
    try {
      const department = Storage.get("student_profile", {}).department || "";
      if (typeof Departments === "undefined") return [];
      return Departments.domainsFor(department);
    } catch (e) {
      return [];
    }
  }

  function buildContext() {
    const user = (typeof Auth !== "undefined") ? Auth.getCurrentUser() : null;
    const skillGaps = currentSkillGaps();
    return {
      role: user ? user.role : null,
      profile: {
        skills: currentProfileSkills(),
        ...currentProfileMeta(),
        recommendedSkills: skillGaps.missing,
        skillsAlreadyHave: skillGaps.have,
        departmentDomains: currentDepartmentDomains(),
      },
      opportunities: currentOpportunities(),
      companies: currentCompanies(),
      learningRecommendations: currentLearningRecommendations(),
    };
  }

  async function sendMessage(message, history) {
    if (typeof ApiClient === "undefined") {
      return { ok: false, reply: "Sorry, I'm unable to connect right now. Please try again later.", opportunities: [] };
    }
    const result = await ApiClient.assistantChat(message, history, buildContext()).catch(() => null);

    if (!result || !result.ok) {
      return { ok: false, reply: "Sorry, I'm unable to connect right now. Please try again later.", opportunities: [], companies: [] };
    }
    return { ok: true, reply: result.data.reply, opportunities: result.data.opportunities || [], companies: result.data.companies || [] };
  }

  // Navigates to and opens a given opportunity, reusing the exact same
  // pattern the opportunity cards already use (Storage + Navigation).
  function openOpportunity(id) {
    try {
      Storage.set("selected_opportunity_id", id);
      if (typeof Navigation !== "undefined") Navigation.activateTab("opportunities");
    } catch (e) { /* not on a page with opportunities — nothing to do */ }
  }

  // Companies aren't a separate entity in the data model — they're
  // derived from opportunities (see Recommendations.relevantCompanies).
  // "Viewing" one means jumping to Opportunities pre-filtered by name,
  // reusing the same prefill mechanism as the dashboard's company cards.
  function openCompany(name) {
    try {
      Storage.set("opp-search-prefill", name);
      if (typeof Navigation !== "undefined") Navigation.activateTab("opportunities");
    } catch (e) { /* not on a page with opportunities — nothing to do */ }
  }

  return { sendMessage, openOpportunity, openCompany, buildContext, currentLearningRecommendations };
})();
