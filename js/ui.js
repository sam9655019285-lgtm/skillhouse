/*
 * ui.js — reusable rendering helpers, replacing the Streamlit
 * components/*.py card/section helpers (cards.py, opportunity_cards.py,
 * learning_cards.py, candidate_cards.py, auth_ui.py).
 *
 * Every function returns/injects plain HTML. No framework — vanilla
 * DOM + template strings (Phase spec point 27, "reusable components").
 */

const UI = (() => {
  function escapeHtml(str) {
    if (str === null || str === undefined) return "";
    return String(str)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function toast(message, type = "info") {
    let container = document.getElementById("toast-container");
    if (!container) {
      container = document.createElement("div");
      container.id = "toast-container";
      document.body.appendChild(container);
    }
    const el = document.createElement("div");
    el.className = `toast toast-${type}`;
    el.textContent = message;
    container.appendChild(el);
    setTimeout(() => el.remove(), 3200);
  }

  function metricRow(items) {
    // items: [[label, value], ...]
    return `<div class="metric-row">${items.map(([label, value]) => `
      <div class="metric"><div class="label">${escapeHtml(label)}</div><div class="value">${escapeHtml(value)}</div></div>
    `).join("")}</div>`;
  }

  function sectionHeader(title, sub) {
    return `<div class="section-header"><h3>${escapeHtml(title)}</h3>${sub ? `<div class="sub">${escapeHtml(sub)}</div>` : ""}</div>`;
  }

  function progressBar(percent, colorClass = "") {
    const p = Math.max(0, Math.min(100, percent));
    return `<div class="progress-wrap"><div class="progress-bar ${colorClass}" style="width:${p}%"></div></div>`;
  }

  function progressColorForScore(score) {
    if (score >= 70) return "green";
    if (score >= 40) return "amber";
    return "red";
  }

  function skillBar(name, score) {
    return `
      <div class="skill-bar-row">
        <div class="skill-bar-label"><span>${escapeHtml(name)}</span><span>${score}%</span></div>
        ${progressBar(score, progressColorForScore(score))}
      </div>`;
  }

  function badge(text, kind = "gray") {
    return `<span class="badge badge-${kind}">${escapeHtml(text)}</span>`;
  }

  function matchBadgeKind(category) {
    if (category === "Excellent Match" || category === "Strong Potential" || category === "Excellent Collaboration Potential") return "green";
    if (category === "Strong Match" || category === "Moderate Potential") return "primary";
    if (category === "Moderate Match") return "amber";
    return "gray";
  }

  function gapStatusKind(status) {
    if (status === "Meets Requirement") return "green";
    if (status === "Major Gap") return "red";
    return "amber";
  }

  function skillTags(skills) {
    if (!skills || !skills.length) return `<span class="muted">None listed.</span>`;
    return skills.map((s) => `<span class="skill-tag">${escapeHtml(s)}</span>`).join("");
  }

  function opportunityCard(opp, opts = {}) {
    const closed = (opp.status || "Active") === "Closed";
    return `
      <div class="card" data-opp-id="${opp.id}">
        <div class="card-row">
          <div class="card-title">${escapeHtml(opp.title)}</div>
          ${closed ? badge("Closed", "red") : badge(opp.type, "primary")}
        </div>
        <div class="card-sub">${escapeHtml(opp.company)} • ${escapeHtml(opp.location)} • ${escapeHtml(opp.mode)}</div>
        <div style="font-size:.85rem;margin-bottom:8px;">${escapeHtml(opp.duration)} · ${escapeHtml(opp.stipend)}</div>
        <div>${skillTags(opp.required_skills.slice(0, 4))}</div>
        <div class="btn-row" style="margin-top:10px;">
          <button class="btn btn-primary btn-sm view-opp-btn" data-id="${opp.id}">View Details</button>
          ${opts.showSave ? `<button class="btn btn-sm save-opp-btn" data-id="${opp.id}">${opts.isSaved ? "★ Saved" : "☆ Save"}</button>` : ""}
        </div>
      </div>`;
  }

  // Simple inline "no thumbnail" illustration — never claims to be the
  // real course/provider image, just a neutral placeholder.
  const DEFAULT_LEARNING_THUMB = "data:image/svg+xml;utf8," + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="160" viewBox="0 0 320 160"><rect width="320" height="160" fill="#e2e8f0"/><path d="M120 60l60 30-60 30z" fill="#94a3b8"/></svg>`
  );

  function learningThumbnail(res) {
    if (res.course_image) return res.course_image;
    if (typeof Learning !== "undefined") {
      const video = Learning.getResourceVideo(res);
      if (video) return video.thumbnail;
    }
    return DEFAULT_LEARNING_THUMB;
  }

  function learningCard(res, opts = {}) {
    const relevance = opts.relevance;
    const hasVideo = typeof Learning !== "undefined" && !!Learning.getResourceVideo(res);
    return `
      <div class="card" data-res-id="${res.id}">
        <img src="${escapeHtml(learningThumbnail(res))}" alt="" style="width:100%;border-radius:6px;margin-bottom:8px;aspect-ratio:2/1;object-fit:cover;">
        <div class="card-row">
          <div class="card-title">${escapeHtml(res.title)}</div>
          ${badge(res.cost, res.cost === "Free" ? "green" : "amber")}
        </div>
        <div class="card-sub">${escapeHtml(res.provider)} • ${escapeHtml(res.type)} • ${escapeHtml(res.level)}</div>
        <div style="font-size:.85rem;margin-bottom:8px;">${escapeHtml(res.domain)} · ${escapeHtml(res.duration)} · ${escapeHtml(res.mode)}</div>
        <div>${skillTags(res.skills)}</div>
        ${relevance ? `<div style="margin-top:8px;">🎯 ${badge(`${relevance.match_score}% Match`, relevance.match_score >= 75 ? "green" : relevance.match_score >= 50 ? "primary" : "amber")}</div>
        <p class="muted" style="font-size:.8rem;margin-top:4px;"><strong>Recommended because:</strong> ${escapeHtml(relevance.reasons[0] ? relevance.reasons[0].charAt(0).toUpperCase() + relevance.reasons[0].slice(1) : relevance.reason)}</p>` : ""}
        <div class="btn-row" style="margin-top:10px;">
          <button class="btn btn-primary btn-sm view-res-btn" data-id="${res.id}">View Course</button>
          ${hasVideo ? `<button class="btn btn-sm start-res-btn" data-id="${res.id}">▶ Start Learning</button>` : ""}
        </div>
      </div>`;
  }

  function candidateCard(candidate) {
    const topSkills = Object.keys(candidate.skill_profile || {}).slice(0, 4);
    return `
      <div class="card" data-cand-id="${candidate.id}">
        <div class="card-title">${escapeHtml(candidate.name)}</div>
        <div class="card-sub">${escapeHtml(candidate.target_role || "Target role not set")}${candidate.department ? " • " + escapeHtml(candidate.department) : ""}</div>
        <div>${skillTags(topSkills)}</div>
        <div class="btn-row" style="margin-top:10px;">
          <button class="btn btn-primary btn-sm view-cand-btn" data-id="${candidate.id}">View Profile</button>
        </div>
      </div>`;
  }

  function selectOptions(options, selected, includeAll = true, allLabel = "All") {
    const opts = includeAll ? [allLabel, ...options] : options;
    return opts.map((o) => `<option value="${escapeHtml(o)}" ${o === selected ? "selected" : ""}>${escapeHtml(o)}</option>`).join("");
  }

  function confirmModal(message, onConfirm) {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.innerHTML = `
      <div class="modal-box">
        <p>${escapeHtml(message)}</p>
        <div class="btn-row" style="justify-content:flex-end;">
          <button class="btn" id="modal-cancel">Cancel</button>
          <button class="btn btn-danger" id="modal-confirm">Confirm</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector("#modal-cancel").onclick = () => overlay.remove();
    overlay.querySelector("#modal-confirm").onclick = () => { overlay.remove(); onConfirm(); };
  }

  function emptyState(text) {
    return `<div class="empty-state">${escapeHtml(text)}</div>`;
  }

  return {
    escapeHtml, toast, metricRow, sectionHeader, progressBar, progressColorForScore,
    skillBar, badge, matchBadgeKind, gapStatusKind, skillTags,
    opportunityCard, learningCard, candidateCard, selectOptions, confirmModal, emptyState,
  };
})();
