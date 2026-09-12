/*
 * learning.js — Phase 6, ported from modules/student/learning.py.
 */

const Learning = (() => {
  const CATEGORY_ORDER = ["Highly Recommended", "Recommended", "Useful", "Not Priority"];
  const RECOMMENDATION_LIMIT = 6;

  function loadLearningResources() { return DATA.LEARNING_RESOURCES; }
  function getResourceById(resources, id) { return resources.find((r) => r.id === id) || null; }

  function searchResources(resources, query) {
    const q = (query || "").trim().toLowerCase();
    if (!q) return resources;
    return resources.filter((r) => [r.title, r.provider, r.domain, ...r.skills].some((v) => v.toLowerCase().includes(q)));
  }

  function filterResources(resources, filters) {
    let results = resources;
    const map = { type: "type", domain: "domain", level: "level", mode: "mode", cost: "cost" };
    for (const [k, field] of Object.entries(map)) {
      const val = filters[k];
      if (val && val !== "All") results = results.filter((r) => r[field] === val);
    }
    return results;
  }

  function getEffectiveTargetRole() {
    const knownRoles = Object.keys(DATA.ROLE_DOMAIN_RECOMMENDATIONS);
    const skillGapRole = Storage.get("skill_gap_target_role", null);
    const profile = Storage.get("student_profile", {});
    return SkillGap.getEffectiveTargetRole(knownRoles, skillGapRole, profile.target_job_role || "");
  }

  function getCurrentSkillGapNames() {
    const analysis = Storage.get("skill_gap_analysis", null);
    if (!analysis) return [];
    return (analysis.priority_gaps || []).map((g) => g.skill);
  }

  // Builds the single context object every scoring/recommendation call
  // needs, read once from Storage/Departments/DATA so ranking stays
  // consistent everywhere it's used (dashboard, recommendations tab,
  // AI Assistant).
  function buildRecommendationContext() {
    const profile = Storage.get("student_profile", {});
    const analysis = Storage.get("skill_gap_analysis", null);
    const skillGapNames = [];
    const priorityGapMap = {};
    if (analysis) {
      for (const g of analysis.priority_gaps || []) {
        const canon = SkillGap.canonicalSkillName(g.skill);
        skillGapNames.push(canon);
        priorityGapMap[canon] = g.priority_score;
      }
    }
    const targetRole = getEffectiveTargetRole();
    const departmentDomains = (typeof Departments !== "undefined" && profile.department) ? Departments.domainsFor(profile.department) : [];
    return {
      currentProfile: currentProfile(),
      skillGapNames,
      priorityGapMap,
      targetRole,
      targetDomains: DATA.ROLE_DOMAIN_RECOMMENDATIONS[targetRole] || [],
      departmentDomains,
      department: profile.department || "",
      careerInterestsText: (profile.career_interests || "").toLowerCase(),
    };
  }

  // Numeric 0-100 match score from actual profile/assessment/department
  // data only — never a random or placeholder number. Priority order
  // (highest weight first) follows: skill-gap match > target-role/job
  // domain match > department match > career-interest match > existing
  // skill reinforcement.
  function calculateMatchScore(resource, ctx) {
    const resourceSkills = resource.skills.map(SkillGap.canonicalSkillName);
    const reasons = [];
    let score = 0;

    const matchedGapSkills = resourceSkills.filter((s) => ctx.skillGapNames.includes(s));
    if (matchedGapSkills.length) {
      const avgPriority = matchedGapSkills.reduce((sum, s) => sum + (ctx.priorityGapMap[s] || 50), 0) / matchedGapSkills.length;
      score += Math.min(55, 25 + (avgPriority / 100) * 30);
      reasons.push(`addresses your skill gap${matchedGapSkills.length > 1 ? "s" : ""} in ${matchedGapSkills.join(", ")}`);
    }

    const domainRelevant = ctx.targetDomains.includes(resource.domain);
    if (domainRelevant) {
      score += 20;
      reasons.push(ctx.targetRole ? `is in a domain (${resource.domain}) relevant to your target role, ${ctx.targetRole}` : `is in your target domain (${resource.domain})`);
    }

    const departmentRelevant = ctx.departmentDomains.includes(resource.domain);
    if (departmentRelevant) {
      score += 15;
      reasons.push(`is relevant to your department${ctx.department ? ` (${ctx.department})` : ""}`);
    }

    const interestMatch = ctx.careerInterestsText && resourceSkills.some((s) => ctx.careerInterestsText.includes(s.toLowerCase()));
    if (interestMatch) {
      score += 10;
      reasons.push("aligns with your stated career interests");
    }

    const matchedExistingSkills = resourceSkills.filter((s) => Object.prototype.hasOwnProperty.call(ctx.currentProfile, s));
    if (!matchedGapSkills.length && matchedExistingSkills.length) {
      score += 5;
      reasons.push("builds on skills you already have");
    }

    return {
      score: Math.max(0, Math.min(100, Math.round(score))),
      reasons, matchedGapSkills, matchedExistingSkills, domainRelevant, departmentRelevant,
    };
  }

  function calculateLearningRelevance(resource, ctx) {
    const { score, reasons, matchedGapSkills } = calculateMatchScore(resource, ctx);
    let category;
    if (score >= 75) category = "Highly Recommended";
    else if (score >= 50) category = "Recommended";
    else if (score >= 25) category = "Useful";
    else category = "Not Priority";
    const reason = reasons.length ? `Recommended because it ${reasons.join(", and ")}.` : "Not currently a priority based on your profile.";
    return { category, match_score: score, matched_gap_skills: matchedGapSkills, matched_gap_count: matchedGapSkills.length, reason, reasons };
  }

  function getRecommendations(resources, ctx, limit) {
    const scored = [];
    for (const resource of resources) {
      const relevance = calculateLearningRelevance(resource, ctx);
      if (relevance.category !== "Not Priority") scored.push([resource, relevance]);
    }
    scored.sort((a, b) => b[1].match_score - a[1].match_score);
    return limit ? scored.slice(0, limit) : scored;
  }

  function countRecommendedResources(resources, ctx) {
    return resources.filter((r) => calculateLearningRelevance(r, ctx).match_score >= 50).length;
  }

  function getSkillGapResources(skillName, resources, limit) {
    const canonicalTarget = SkillGap.canonicalSkillName(skillName);
    const matches = resources.filter((r) => r.skills.some((s) => SkillGap.canonicalSkillName(s) === canonicalTarget));
    return limit ? matches.slice(0, limit) : matches;
  }

  // ---- YouTube video (each course points at one specific, verified
  // video — never a search URL; see js/data.js's LEARNING_RESOURCES
  // comment for the fields a resource may carry) ----
  const YOUTUBE_ID_RE = /^[a-zA-Z0-9_-]{11}$/;

  function extractYoutubeVideoId(input) {
    if (!input) return null;
    const trimmed = String(input).trim();
    if (YOUTUBE_ID_RE.test(trimmed)) return trimmed;
    let url;
    try { url = new URL(trimmed); } catch { return null; }
    const host = url.hostname.replace(/^www\.|^m\.|^music\./, "");
    if (host === "youtu.be") {
      const id = url.pathname.slice(1).split("/")[0];
      return YOUTUBE_ID_RE.test(id) ? id : null;
    }
    if (host === "youtube.com") {
      if (url.pathname === "/watch") {
        const id = url.searchParams.get("v");
        return id && YOUTUBE_ID_RE.test(id) ? id : null;
      }
      const embedMatch = url.pathname.match(/^\/(embed|shorts)\/([^/]+)/);
      if (embedMatch) return YOUTUBE_ID_RE.test(embedMatch[2]) ? embedMatch[2] : null;
    }
    return null;
  }

  function isValidYoutubeUrl(input) { return extractYoutubeVideoId(input) !== null; }

  function normalizeYoutubeUrl(input) {
    const id = extractYoutubeVideoId(input);
    return id ? `https://www.youtube.com/watch?v=${id}` : null;
  }

  // Returns { id, url, embedUrl, thumbnail, channel } for a resource with
  // a verified video assigned, or null if none is available yet — never
  // fabricates a video or falls back to a search URL.
  function getResourceVideo(resource) {
    const id = resource.youtube_video_id && YOUTUBE_ID_RE.test(resource.youtube_video_id)
      ? resource.youtube_video_id
      : extractYoutubeVideoId(resource.youtube_video_url);
    if (!id) return null;
    return {
      id,
      url: normalizeYoutubeUrl(resource.youtube_video_url) || `https://www.youtube.com/watch?v=${id}`,
      embedUrl: `https://www.youtube-nocookie.com/embed/${id}`,
      thumbnail: resource.youtube_thumbnail || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
      channel: resource.youtube_channel_name || null,
    };
  }

  // ---- Save / progress (session-only) ----
  function isSavedResource(id) { return Storage.get("saved_learning_resources", []).includes(id); }
  function saveResource(id) {
    const list = Storage.get("saved_learning_resources", []);
    if (!list.includes(id)) { list.push(id); Storage.set("saved_learning_resources", list); }
  }
  function removeSavedResource(id) {
    Storage.set("saved_learning_resources", Storage.get("saved_learning_resources", []).filter((x) => x !== id));
  }
  function findProgressEntry(id) {
    return Storage.get("learning_progress", []).find((e) => e.resource_id === id) || null;
  }
  function getLearningStatus(id) {
    const entry = findProgressEntry(id);
    if (entry) return entry.status;
    if (isSavedResource(id)) return "Saved";
    return null;
  }
  function today() { return new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }); }
  function startResource(id) {
    if (findProgressEntry(id)) return;
    const progress = Storage.get("learning_progress", []);
    progress.push({ resource_id: id, status: "Started", started_date: today(), completed_date: null });
    Storage.set("learning_progress", progress);
  }
  function completeResource(id) {
    const progress = Storage.get("learning_progress", []);
    const entry = progress.find((e) => e.resource_id === id);
    if (!entry) progress.push({ resource_id: id, status: "Completed", started_date: today(), completed_date: today() });
    else { entry.status = "Completed"; entry.completed_date = today(); }
    Storage.set("learning_progress", progress);
  }
  function getMyLearningOverview() {
    const resources = loadLearningResources();
    const ids = new Set(Storage.get("saved_learning_resources", []));
    for (const e of Storage.get("learning_progress", [])) ids.add(e.resource_id);
    const overview = [];
    for (const id of ids) {
      const resource = getResourceById(resources, id);
      if (!resource) continue;
      const entry = findProgressEntry(id);
      overview.push({
        resource_id: id, title: resource.title,
        status: entry ? entry.status : "Saved",
        started_date: entry ? entry.started_date : null,
        completed_date: entry ? entry.completed_date : null,
      });
    }
    return overview;
  }

  function currentProfile() {
    return SkillGap.getCurrentSkillProfile(Storage.get("technical_skills", {}), Storage.get("soft_skills", {}), Storage.get("assessment_result", null));
  }

  // ---- Rendering ----
  function renderBrowse(container) {
    const resources = loadLearningResources();
    container.innerHTML = `
      ${UI.sectionHeader("Learning & Skill Development", "Browse courses, certifications, tutorials, workshops, training programs, and projects.")}
      <div class="search-row"><input type="text" id="lr-search" placeholder="Search by title, provider, skill, or domain"></div>
      <div class="filters-row">
        <select id="lr-type"><option value="All">All Types</option>${UI.selectOptions(DATA.RESOURCE_TYPES, "All", false)}</select>
        <select id="lr-domain"><option value="All">All Domains</option>${UI.selectOptions(DATA.LR_DOMAINS, "All", false)}</select>
        <select id="lr-level"><option value="All">All Levels</option>${UI.selectOptions(DATA.LEVELS, "All", false)}</select>
        <select id="lr-mode"><option value="All">All Modes</option>${UI.selectOptions(DATA.MODES, "All", false)}</select>
        <select id="lr-cost"><option value="All">All Costs</option>${UI.selectOptions(DATA.COSTS, "All", false)}</select>
      </div>
      <hr class="divider">
      <div id="lr-count" class="muted" style="margin-bottom:8px;"></div>
      <div class="grid grid-auto" id="lr-results"></div>`;

    const rerender = () => {
      const q = document.getElementById("lr-search").value;
      const filters = {
        type: document.getElementById("lr-type").value, domain: document.getElementById("lr-domain").value,
        level: document.getElementById("lr-level").value, mode: document.getElementById("lr-mode").value, cost: document.getElementById("lr-cost").value,
      };
      let results = searchResources(resources, q);
      results = filterResources(results, filters);
      document.getElementById("lr-count").textContent = `${results.length} resource${results.length === 1 ? "" : "s"} found`;
      const grid = document.getElementById("lr-results");
      grid.innerHTML = results.length ? results.map((r) => UI.learningCard(r)).join("") : UI.emptyState("No resources match your search and filters.");
      grid.querySelectorAll(".view-res-btn").forEach((btn) => btn.onclick = () => { Storage.set("selected_learning_resource", Number(btn.dataset.id)); renderSection(container); });
    };
    ["lr-search", "lr-type", "lr-domain", "lr-level", "lr-mode", "lr-cost"].forEach((id) => {
      document.getElementById(id).addEventListener("input", rerender);
      document.getElementById(id).addEventListener("change", rerender);
    });
    rerender();
  }

  function statusLabel(status) {
    if (status === "Completed") return "Completed ✓";
    if (status === "Started") return "Learning in progress";
    if (status === "Saved") return "Saved";
    return null;
  }

  function whyThisCourseHtml(resource) {
    const assessmentResult = Storage.get("assessment_result", null);
    if (!assessmentResult) return "";
    const ctx = buildRecommendationContext();
    const relevance = calculateLearningRelevance(resource, ctx);
    if (!relevance.reasons.length) return "";
    const points = [];
    for (const skill of relevance.matched_gap_skills) {
      points.push(`Your ${UI.escapeHtml(skill)} skill is currently a gap area`);
    }
    if (ctx.targetDomains.includes(resource.domain)) points.push(`${UI.escapeHtml(resource.domain)} is relevant to your target role${ctx.targetRole ? ` (${UI.escapeHtml(ctx.targetRole)})` : ""}`);
    if (ctx.departmentDomains.includes(resource.domain)) points.push(`Relevant to your department${ctx.department ? ` (${UI.escapeHtml(ctx.department)})` : ""}`);
    points.push(`This course covers ${UI.escapeHtml(resource.skills.join(", "))}`);
    return `
      <hr class="divider">
      ${UI.sectionHeader("💡 Why this course?")}
      <ul class="why-course-list">${points.map((p) => `<li>✓ ${p}</li>`).join("")}</ul>
      <p class="muted" style="font-size:.82rem;">${UI.escapeHtml(relevance.reason)}</p>`;
  }

  function videoSectionHtml(resource) {
    const video = getResourceVideo(resource);
    if (!video) {
      return `${UI.sectionHeader("▶ Course Video")}<p class="muted">Learning video not available yet.</p>`;
    }
    return `
      ${UI.sectionHeader("▶ Course Video")}
      <div class="video-embed-wrap">
        <iframe src="${UI.escapeHtml(video.embedUrl)}" title="${UI.escapeHtml(resource.title)}" frameborder="0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen
          loading="lazy" style="width:100%;aspect-ratio:16/9;border-radius:8px;"
          onerror="this.closest('.video-embed-wrap').innerHTML='<p class=&quot;muted&quot;>This video can\\'t be embedded — use Watch on YouTube below.</p>'"></iframe>
      </div>
      ${video.channel ? `<p class="muted" style="font-size:.8rem;">Channel: ${UI.escapeHtml(video.channel)}</p>` : ""}`;
  }

  function renderDetail(container, resource) {
    const status = getLearningStatus(resource.id);
    const video = getResourceVideo(resource);
    container.innerHTML = `
      <button class="back-link" id="lr-back">← Back to Learning</button>
      <h2>${UI.escapeHtml(resource.title)}</h2>
      <p><strong>${UI.escapeHtml(resource.provider)}</strong> • ${UI.escapeHtml(resource.type)} • ${UI.escapeHtml(resource.level)}</p>
      <div class="grid grid-3">
        <div><strong>Domain:</strong> ${UI.escapeHtml(resource.domain)}</div>
        <div><strong>Duration:</strong> ${UI.escapeHtml(resource.duration)}</div>
        <div><strong>Mode:</strong> ${UI.escapeHtml(resource.mode)} · <strong>Cost:</strong> ${UI.escapeHtml(resource.cost)}</div>
      </div>
      <hr class="divider">
      ${UI.sectionHeader("Description")}<p>${UI.escapeHtml(resource.description)}</p>
      ${UI.sectionHeader("Skills Covered")}<div>${UI.skillTags(resource.skills)}</div>
      <hr class="divider">
      ${videoSectionHtml(resource)}
      ${whyThisCourseHtml(resource)}
      <hr class="divider">
      ${UI.sectionHeader("Your Status")}
      <p>${status ? UI.badge(statusLabel(status), status === "Completed" ? "green" : status === "Started" ? "primary" : "amber") : `<span class="muted">Not started yet.</span>`}</p>
      <div class="btn-row">
        <button class="btn" id="lr-save-btn">${isSavedResource(resource.id) ? "Remove from Saved" : "Save Resource"}</button>
        <button class="btn btn-primary" id="lr-start-btn" ${(!video || status === "Started" || status === "Completed") ? "disabled" : ""} title="${!video ? "No learning video assigned to this course yet" : ""}">▶ Start Learning</button>
        ${video ? `<button class="btn" id="lr-watch-btn">Watch on YouTube</button>` : ""}
        <button class="btn btn-success" id="lr-complete-btn" ${status === "Completed" ? "disabled" : ""}>Mark Completed</button>
      </div>`;

    document.getElementById("lr-back").onclick = () => { Storage.set("selected_learning_resource", null); renderSection(container); };
    document.getElementById("lr-save-btn").onclick = () => { isSavedResource(resource.id) ? removeSavedResource(resource.id) : saveResource(resource.id); renderDetail(container, resource); };
    document.getElementById("lr-start-btn").onclick = () => {
      startResource(resource.id);
      if (video) window.open(video.url, "_blank", "noopener,noreferrer");
      UI.toast(video ? "Opening the course video…" : "Marked as in progress", "success");
      renderDetail(container, resource);
    };
    const watchBtn = document.getElementById("lr-watch-btn");
    if (watchBtn) watchBtn.onclick = () => window.open(video.url, "_blank", "noopener,noreferrer");
    document.getElementById("lr-complete-btn").onclick = () => { completeResource(resource.id); UI.toast("Marked as Completed", "success"); renderDetail(container, resource); };
  }

  function renderSection(container) {
    const resources = loadLearningResources();
    const selectedId = Storage.get("selected_learning_resource", null);
    if (selectedId !== null) {
      const resource = getResourceById(resources, selectedId);
      if (!resource) { Storage.set("selected_learning_resource", null); renderBrowse(container); return; }
      renderDetail(container, resource);
      return;
    }
    renderBrowse(container);
  }

  function renderRecommendations(container) {
    const assessmentResult = Storage.get("assessment_result", null);
    if (!assessmentResult) {
      container.innerHTML = UI.sectionHeader("Recommended For You", "A simple, transparent recommendation list — not an AI score.") +
        `<div class="auth-error" style="background:var(--primary-light);color:var(--primary-dark);">Complete your Skill Assessment (and Skill Gap Analysis) to get recommendations tailored to your skill gaps.</div>`;
      return;
    }
    const resources = loadLearningResources();
    const ctx = buildRecommendationContext();

    let html = UI.sectionHeader("🎯 Recommended Learning", "Ranked from your skill assessment, skill gaps, department, and target role — not a random list.");
    html += ctx.targetRole ? `<p><strong>Your Target Role:</strong> ${UI.escapeHtml(ctx.targetRole)}</p>` : `<p class="muted">Set a Target Job Role in My Profile to also get domain-based recommendations.</p>`;
    html += ctx.skillGapNames.length ? `<p><strong>Your Top Skill Gaps:</strong> ${ctx.skillGapNames.slice(0, 5).map(UI.escapeHtml).join(", ")}</p>` : `<div class="auth-error" style="background:var(--primary-light);color:var(--primary-dark);">No skill-gap information is available yet. Run a Skill Gap Analysis to sharpen these recommendations.</div>`;
    html += `<hr class="divider">`;

    const recommendations = getRecommendations(resources, ctx, RECOMMENDATION_LIMIT);
    if (!recommendations.length) {
      html += `<p class="muted">No strongly relevant resources found yet — browse all resources in the tab above.</p>`;
    } else {
      html += `<div class="grid grid-auto">` + recommendations.map(([resource, relevance]) => UI.learningCard(resource, { relevance })).join("") + `</div>`;
    }
    html += `<div id="backend-priority-skills"></div>`;
    container.innerHTML = html;
    container.querySelectorAll(".view-res-btn").forEach((btn) => btn.onclick = () => { Storage.set("selected_learning_resource", Number(btn.dataset.id)); Navigation.activateTab("learning"); });
    container.querySelectorAll(".start-res-btn").forEach((btn) => btn.onclick = () => {
      const id = Number(btn.dataset.id);
      const resource = getResourceById(resources, id);
      startResource(id);
      const video = getResourceVideo(resource);
      if (video) window.open(video.url, "_blank", "noopener,noreferrer");
      UI.toast(video ? "Opening the course video…" : "Marked as in progress", "success");
    });

    // Step 11: real backend-verified priority skills (SQLite skills +
    // assessment + live industry demand, not the localStorage profile
    // the course list above uses) — appended additively; the existing
    // course-recommendation list above is left completely unchanged.
    renderBackendPrioritySkills(container, ctx.targetRole);
  }

  function priorityBadgeKind(priority) { return priority === "High" ? "red" : priority === "Medium" ? "amber" : "gray"; }

  function renderBackendPrioritySkills(container, targetRole) {
    if (typeof ApiClient === "undefined") return;
    ApiClient.getLearningRecommendations(targetRole || undefined).then((res) => {
      const el = document.getElementById("backend-priority-skills");
      if (!el || !res.ok) return;
      const recs = res.data.recommendations || [];
      if (!recs.length) return;
      el.innerHTML = `
        <hr class="divider">
        ${UI.sectionHeader("📌 Priority Skills to Learn Next", "From your saved skills/assessment data and live industry demand.")}
        ${recs.slice(0, 5).map((r) => `
          <div class="card">
            <div class="card-row"><div class="card-title">${UI.escapeHtml(r.skillName)}</div>${UI.badge(`${r.priority} Priority`, priorityBadgeKind(r.priority))}</div>
            <p class="muted" style="font-size:.82rem;">${UI.escapeHtml(r.reason)}</p>
            ${r.resources.length ? `<ul class="list-clean" style="font-size:.85rem;">${r.resources.map((res2) => `<li>• ${UI.escapeHtml(res2.title)} (${UI.escapeHtml(res2.level)})</li>`).join("")}</ul>` : `<p class="muted" style="font-size:.8rem;">No matching course in the catalog yet for this skill.</p>`}
          </div>`).join("")}
      `;
    }).catch(() => { /* backend unavailable — the course list above still stands */ });
  }

  function renderSaved(container) {
    const resources = loadLearningResources();
    const savedIds = Storage.get("saved_learning_resources", []);
    container.innerHTML = UI.sectionHeader("Saved Resources") + `<div id="saved-lr-list" class="grid grid-auto"></div>`;
    const el = document.getElementById("saved-lr-list");
    if (!savedIds.length) { el.innerHTML = UI.emptyState("You haven't saved any learning resources yet."); return; }
    el.innerHTML = resources.filter((r) => savedIds.includes(r.id)).map((r) => UI.learningCard(r)).join("");
    el.querySelectorAll(".view-res-btn").forEach((btn) => btn.onclick = () => { Storage.set("selected_learning_resource", Number(btn.dataset.id)); Navigation.activateTab("learning"); });
  }

  function renderMyLearning(container) {
    const overview = getMyLearningOverview();
    container.innerHTML = UI.sectionHeader("My Learning");
    if (!overview.length) { container.innerHTML += UI.emptyState("Nothing saved or started yet."); return; }
    container.innerHTML += overview.map((item) => `
      <div class="card">
        <div class="card-row"><div class="card-title">${UI.escapeHtml(item.title)}</div>${UI.badge(statusLabel(item.status), item.status === "Completed" ? "green" : item.status === "Started" ? "primary" : "amber")}</div>
        ${item.started_date ? `<div class="muted" style="font-size:.82rem;">Started: ${UI.escapeHtml(item.started_date)}${item.completed_date ? ` · Completed: ${UI.escapeHtml(item.completed_date)}` : ""}</div>` : ""}
      </div>`).join("");
  }

  function renderDashboardSummary(container) {
    const resources = loadLearningResources();
    const ctx = buildRecommendationContext();
    const recommendedCount = countRecommendedResources(resources, ctx);
    const savedCount = Storage.get("saved_learning_resources", []).length;
    const progress = Storage.get("learning_progress", []);
    const completedCount = progress.filter((p) => p.status === "Completed").length;

    container.innerHTML = UI.sectionHeader("Learning & Skill Development") +
      UI.metricRow([["📚 Resources", resources.length], ["⭐ Saved", savedCount], ["🎯 Recommended", recommendedCount], ["✅ Completed", completedCount]]) +
      `<p class="muted">Open the <strong>Learning & Skill Development</strong> tab to browse and start learning.</p>`;
  }

  return {
    loadLearningResources, getResourceById, getEffectiveTargetRole, getCurrentSkillGapNames,
    buildRecommendationContext, calculateMatchScore, calculateLearningRelevance, getRecommendations,
    getSkillGapResources, currentProfile, getResourceVideo, extractYoutubeVideoId, isValidYoutubeUrl, normalizeYoutubeUrl,
    getLearningStatus, statusLabel,
    renderSection, renderRecommendations, renderSaved, renderMyLearning, renderDashboardSummary,
  };
})();
