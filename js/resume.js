/*
 * resume.js — AI-Powered Resume Builder (Student "My Resume" tab) and
 * the read-only resume view Industry users see (backend/routes/
 * resume.js, backend/services/resumeBuilderService.js).
 *
 * The backend assembles every factual section (skills, certifications,
 * projects, assessment) straight from the database for the logged-in
 * student — this file only sends along the "profile" fields that live
 * in the frontend's localStorage-backed profile (name/target role/
 * degree/bio/etc. — see js/app-student.js renderProfileTab) plus
 * whatever the student typed into the Experience/Achievements boxes.
 * Nothing here invents a skill, project, certification, or score.
 *
 * "Download PDF" uses the browser's native print-to-PDF (no external
 * PDF library exists in this project) — see css/resume.css's
 * @media print rule, which hides everything except .resume-print-area.
 */

const Resume = (() => {
  const TARGET_ROLES = [
    "Biotechnology Intern", "Research Assistant", "Quality Control Intern", "Bioinformatics Intern",
    "Software Development Intern", "Data Analyst Intern", "Machine Learning Intern", "Web Developer Intern",
  ];
  const TEMPLATES = [["modern", "Modern"], ["classic", "Classic"], ["compact", "Compact"]];

  function getLocalProfile() {
    return (typeof Storage !== "undefined") ? Storage.get("student_profile", {}) : {};
  }

  function buildProfilePayload(overrides = {}) {
    const p = getLocalProfile();
    const user = (typeof Auth !== "undefined") ? Auth.getCurrentUser() : null;
    return {
      name: p.full_name || (user && user.name) || "",
      email: p.email || (user && user.email) || "",
      targetRole: overrides.targetRole !== undefined ? overrides.targetRole : (p.target_job_role || ""),
      degree: p.degree || "",
      careerInterests: p.career_interests || "",
      college: p.college_name || "",
      department: p.department || "",
      year: p.current_year || "",
      bio: p.bio || "",
      phone: p.phone_number || "",
      location: p.location || "",
      experienceText: overrides.experienceText !== undefined ? overrides.experienceText : "",
      achievementsText: overrides.achievementsText !== undefined ? overrides.achievementsText : "",
    };
  }

  // Normalizes either a freshly generated draft ({facts, summary,
  // projectBullets, ...}) or a previously saved resume ({content:{facts,...},
  // summary, targetRole, template, visibility, aiGenerated}) into one
  // editable in-memory shape the editor works with.
  function stateFromDraft(draft, { targetRole, template = "modern", visibility = "private" } = {}) {
    return {
      targetRole: targetRole || draft.facts.targetRole || "",
      template,
      visibility,
      summary: draft.summary,
      aiGenerated: draft.aiGenerated,
      facts: draft.facts,
      projectBullets: draft.projectBullets,
      experienceBullets: draft.experienceBullets,
      achievementBullets: draft.achievementBullets,
    };
  }

  function stateFromSaved(resume) {
    const content = resume.content || {};
    return {
      targetRole: resume.targetRole || "",
      template: resume.template || "modern",
      visibility: resume.visibility || "private",
      summary: resume.summary || "",
      aiGenerated: resume.aiGenerated,
      facts: content.facts || { technicalSkills: [], softSkills: [], certifications: [], projects: [], assessment: null },
      projectBullets: content.projectBullets || [],
      experienceBullets: content.experienceBullets || [],
      achievementBullets: content.achievementBullets || [],
    };
  }

  // ---- Read-only resume markup (used both in the student's live
  // preview and in the Industry view modal) ----------------------------
  function resumeMarkup(state) {
    const f = state.facts || {};
    const contactBits = [f.email, f.phone, f.location].filter(Boolean).map((s) => UI.escapeHtml(s)).join(" &middot; ");
    return `
      <div class="resume-doc">
        <div class="resume-doc-header">
          <div class="resume-doc-name">${UI.escapeHtml(f.name || "Your Name")}</div>
          ${state.targetRole ? `<div class="resume-doc-role">${UI.escapeHtml(state.targetRole)}</div>` : ""}
          ${contactBits ? `<div class="resume-doc-contact">${contactBits}</div>` : ""}
        </div>

        ${state.summary ? `<section class="resume-doc-section"><h4>Professional Summary</h4><p>${UI.escapeHtml(state.summary)}</p></section>` : ""}

        <section class="resume-doc-section">
          <h4>Education</h4>
          <p>${[f.degree, f.college].filter(Boolean).map((s) => UI.escapeHtml(s)).join(", ") || "Not specified"}${f.department ? ` — ${UI.escapeHtml(f.department)}` : ""}${f.year ? ` (${UI.escapeHtml(f.year)})` : ""}</p>
        </section>

        ${f.technicalSkills && f.technicalSkills.length ? `<section class="resume-doc-section"><h4>Technical Skills</h4><div class="resume-doc-tags">${f.technicalSkills.map((s) => `<span class="resume-doc-tag">${UI.escapeHtml(s.name)}${s.proficiency ? ` (${UI.escapeHtml(s.proficiency)})` : ""}</span>`).join("")}</div></section>` : ""}

        ${f.softSkills && f.softSkills.length ? `<section class="resume-doc-section"><h4>Soft Skills</h4><div class="resume-doc-tags">${f.softSkills.map((s) => `<span class="resume-doc-tag">${UI.escapeHtml(s.name)}</span>`).join("")}</div></section>` : ""}

        ${f.projects && f.projects.length ? `<section class="resume-doc-section"><h4>Projects</h4>${f.projects.map((p, i) => `
          <div class="resume-doc-item">
            <div class="resume-doc-item-title">${UI.escapeHtml(p.title)}${p.technologies ? ` <span class="muted">(${UI.escapeHtml(p.technologies)})</span>` : ""}</div>
            <p>${UI.escapeHtml((state.projectBullets && state.projectBullets[i]) || p.description || "")}</p>
            ${p.projectUrl ? `<a href="${UI.escapeHtml(p.projectUrl)}" target="_blank" rel="noopener">${UI.escapeHtml(p.projectUrl)}</a>` : ""}
          </div>`).join("")}</section>` : ""}

        ${f.certifications && f.certifications.length ? `<section class="resume-doc-section"><h4>Certifications</h4>${f.certifications.map((c) => `
          <div class="resume-doc-item">
            <div class="resume-doc-item-title">${UI.escapeHtml(c.name)}${c.organization ? ` — ${UI.escapeHtml(c.organization)}` : ""}</div>
            <p class="muted">${[c.issueDate, c.skills && c.skills.length ? `Skills: ${c.skills.join(", ")}` : ""].filter(Boolean).map((s) => UI.escapeHtml(s)).join(" &middot; ")}</p>
          </div>`).join("")}</section>` : ""}

        ${state.experienceBullets && state.experienceBullets.length ? `<section class="resume-doc-section"><h4>Internships / Experience</h4><ul>${state.experienceBullets.map((b) => `<li>${UI.escapeHtml(b)}</li>`).join("")}</ul></section>` : ""}

        ${state.achievementBullets && state.achievementBullets.length ? `<section class="resume-doc-section"><h4>Achievements &amp; Activities</h4><ul>${state.achievementBullets.map((b) => `<li>${UI.escapeHtml(b)}</li>`).join("")}</ul></section>` : ""}

        ${f.assessment ? `<section class="resume-doc-section"><h4>Skill Assessment</h4><p>Overall score: ${UI.escapeHtml(String(f.assessment.overallScore))}%</p></section>` : ""}
      </div>`;
  }

  function updatePreview(state) {
    const el = document.getElementById("resume-preview");
    if (!el) return;
    el.className = `resume-preview resume-print-area resume-template-${state.template}`;
    el.innerHTML = resumeMarkup(state);
  }

  // ---- Student builder --------------------------------------------------

  function renderGenerateForm(container, savedResume) {
    container.innerHTML = `
      ${UI.sectionHeader("My Resume", "Build an AI-assisted, ATS-friendly resume from your real Skillhouse profile — nothing is invented.")}
      <div class="card">
        <h4 style="margin-top:0;">Generate Your Resume</h4>
        <p class="muted" style="font-size:.85rem;">We'll pull in your profile, My Skills, Certifications, Portfolio projects, and latest Skill Assessment automatically. Add any internships/experience or achievements below (optional) — only what you write here is included.</p>
        <label>Target Role</label>
        <select id="gen-role-select">${UI.selectOptions(TARGET_ROLES, null, true, "Custom / Other")}</select>
        <input type="text" id="gen-role-custom" placeholder="Or type a custom target role (e.g. Bioinformatics Intern)">
        <label>Internships / Work Experience (one per line, optional)</label>
        <textarea id="gen-experience" rows="3" placeholder="e.g. Summer Research Intern, XYZ Biotech Labs — assisted with sample analysis and data logging (Jun-Jul 2025)"></textarea>
        <label>Achievements / Activities (one per line, optional)</label>
        <textarea id="gen-achievements" rows="3" placeholder="e.g. Winner, Inter-college Hackathon 2025"></textarea>
        <button class="btn btn-primary" id="gen-btn" style="margin-top:12px;">✨ Generate Resume</button>
      </div>
    `;

    document.getElementById("gen-btn").onclick = () => {
      const roleSelect = document.getElementById("gen-role-select").value;
      const roleCustom = document.getElementById("gen-role-custom").value.trim();
      const targetRole = roleCustom || (roleSelect === "Custom / Other" ? "" : roleSelect);
      const experienceText = document.getElementById("gen-experience").value;
      const achievementsText = document.getElementById("gen-achievements").value;

      const btn = document.getElementById("gen-btn");
      btn.disabled = true;
      btn.textContent = "Generating…";

      const profile = buildProfilePayload({ targetRole, experienceText, achievementsText });
      ApiClient.generateResumeDraft(profile).then((res) => {
        btn.disabled = false;
        btn.textContent = "✨ Generate Resume";
        if (!res.ok) { UI.toast(res.error || "Could not generate resume.", "warning"); return; }
        const state = stateFromDraft(res.data.draft, { targetRole, template: savedResume ? savedResume.template : "modern", visibility: savedResume ? savedResume.visibility : "private" });
        renderEditor(container, state);
      }).catch(() => { btn.disabled = false; btn.textContent = "✨ Generate Resume"; UI.toast("Could not reach the backend API.", "warning"); });
    };
  }

  function renderEditor(container, state) {
    container.innerHTML = `
      ${UI.sectionHeader("My Resume", "Review and edit your AI-assisted resume, then save it.")}
      <div class="resume-toolbar">
        <div class="resume-toolbar-field">
          <label>Target Role</label>
          <select id="resume-role-select">${UI.selectOptions(TARGET_ROLES, TARGET_ROLES.includes(state.targetRole) ? state.targetRole : null, true, "Custom / Other")}</select>
          <input type="text" id="resume-role-custom" placeholder="Custom target role" value="${!TARGET_ROLES.includes(state.targetRole) ? UI.escapeHtml(state.targetRole || "") : ""}">
        </div>
        <div class="resume-toolbar-field">
          <label>Template</label>
          <select id="resume-template-select">${TEMPLATES.map(([v, l]) => `<option value="${v}" ${state.template === v ? "selected" : ""}>${l}</option>`).join("")}</select>
        </div>
        <div class="resume-toolbar-field">
          <label>Visibility</label>
          <select id="resume-visibility-select">
            <option value="private" ${state.visibility === "private" ? "selected" : ""}>Private</option>
            <option value="industry" ${state.visibility === "industry" ? "selected" : ""}>Visible to Industry</option>
          </select>
        </div>
      </div>

      <div class="btn-row" style="margin:12px 0;flex-wrap:wrap;">
        <button class="btn" id="resume-regen-btn">🔄 Regenerate Summary for This Role</button>
        <button class="btn btn-primary" id="resume-save-btn">💾 Save Resume</button>
        <button class="btn" id="resume-download-btn">⬇ Download as PDF</button>
      </div>
      <div class="muted" style="font-size:.78rem;margin-bottom:10px;">
        ${state.aiGenerated ? "✨ Summary written by AI from your real data." : "Auto-formatted from your profile (no AI provider configured on this server)."}
      </div>

      <div class="grid grid-2 resume-editor-grid">
        <div>
          <h4>Edit Content</h4>
          <label>Professional Summary</label>
          <textarea id="resume-summary-input" rows="5">${UI.escapeHtml(state.summary || "")}</textarea>

          <label>Internships / Experience (one per line)</label>
          <textarea id="resume-experience-input" rows="3">${UI.escapeHtml((state.experienceBullets || []).join("\n"))}</textarea>

          <label>Achievements / Activities (one per line)</label>
          <textarea id="resume-achievements-input" rows="3">${UI.escapeHtml((state.achievementBullets || []).join("\n"))}</textarea>

          ${state.facts.projects && state.facts.projects.length ? `
          <label>Project Highlights</label>
          <div id="resume-project-inputs">
            ${state.facts.projects.map((p, i) => `
              <div class="card" style="margin-bottom:8px;padding:10px 12px;">
                <div class="card-title" style="font-size:.85rem;">${UI.escapeHtml(p.title)}</div>
                <textarea class="resume-project-bullet-input" data-i="${i}" rows="2">${UI.escapeHtml((state.projectBullets && state.projectBullets[i]) || "")}</textarea>
              </div>`).join("")}
          </div>` : `<p class="muted" style="font-size:.82rem;">No portfolio projects yet — add some in the Portfolio tab and regenerate.</p>`}
        </div>

        <div>
          <h4>Preview</h4>
          <div id="resume-preview"></div>
        </div>
      </div>
    `;

    updatePreview(state);

    function syncStateFromInputs() {
      state.summary = document.getElementById("resume-summary-input").value;
      state.experienceBullets = document.getElementById("resume-experience-input").value.split("\n").map((s) => s.trim()).filter(Boolean);
      state.achievementBullets = document.getElementById("resume-achievements-input").value.split("\n").map((s) => s.trim()).filter(Boolean);
      document.querySelectorAll(".resume-project-bullet-input").forEach((el) => {
        state.projectBullets[Number(el.dataset.i)] = el.value;
      });
      state.template = document.getElementById("resume-template-select").value;
      state.visibility = document.getElementById("resume-visibility-select").value;
      const roleSelect = document.getElementById("resume-role-select").value;
      const roleCustom = document.getElementById("resume-role-custom").value.trim();
      state.targetRole = roleCustom || (roleSelect === "Custom / Other" ? "" : roleSelect);
      updatePreview(state);
    }

    container.querySelectorAll("#resume-summary-input, #resume-experience-input, #resume-achievements-input, .resume-project-bullet-input, #resume-template-select, #resume-role-select, #resume-role-custom")
      .forEach((el) => el.addEventListener("input", syncStateFromInputs));

    document.getElementById("resume-regen-btn").onclick = () => {
      syncStateFromInputs();
      const btn = document.getElementById("resume-regen-btn");
      btn.disabled = true;
      btn.textContent = "Regenerating…";
      const profile = buildProfilePayload({
        targetRole: state.targetRole,
        experienceText: (state.experienceBullets || []).join("\n"),
        achievementsText: (state.achievementBullets || []).join("\n"),
      });
      ApiClient.generateResumeDraft(profile).then((res) => {
        btn.disabled = false;
        btn.textContent = "🔄 Regenerate Summary for This Role";
        if (!res.ok) { UI.toast(res.error || "Could not regenerate.", "warning"); return; }
        const newState = stateFromDraft(res.data.draft, { targetRole: state.targetRole, template: state.template, visibility: state.visibility });
        // Keep any manual edits to bullets the student already made where the underlying facts didn't change size.
        renderEditor(container, newState);
        UI.toast("Summary regenerated for this role.", "success");
      }).catch(() => { btn.disabled = false; btn.textContent = "🔄 Regenerate Summary for This Role"; UI.toast("Could not reach the backend API.", "warning"); });
    };

    document.getElementById("resume-save-btn").onclick = () => {
      syncStateFromInputs();
      const btn = document.getElementById("resume-save-btn");
      btn.disabled = true;
      btn.textContent = "Saving…";
      ApiClient.saveMyResume({
        targetRole: state.targetRole,
        template: state.template,
        visibility: state.visibility,
        summary: state.summary,
        aiGenerated: state.aiGenerated,
        content: {
          facts: state.facts,
          projectBullets: state.projectBullets,
          experienceBullets: state.experienceBullets,
          achievementBullets: state.achievementBullets,
        },
      }).then((res) => {
        btn.disabled = false;
        btn.textContent = "💾 Save Resume";
        if (!res.ok) { UI.toast(res.error || "Could not save resume.", "warning"); return; }
        UI.toast("Resume saved.", "success");
      }).catch(() => { btn.disabled = false; btn.textContent = "💾 Save Resume"; UI.toast("Could not reach the backend API.", "warning"); });
    };

    document.getElementById("resume-download-btn").onclick = () => {
      syncStateFromInputs();
      window.print();
    };
  }

  function renderSection(container) {
    if (typeof ApiClient === "undefined") { container.innerHTML = UI.emptyState("Backend unavailable."); return; }
    container.innerHTML = `<p class="muted">Loading your resume…</p>`;
    ApiClient.getMyResume().then((res) => {
      if (res.ok && res.data.resume) {
        renderEditor(container, stateFromSaved(res.data.resume));
      } else {
        renderGenerateForm(container, res.ok ? res.data.resume : null);
      }
    }).catch(() => { renderGenerateForm(container, null); });
  }

  // ---- Industry: read-only resume view ----------------------------------

  function openIndustryView(studentId) {
    if (typeof ApiClient === "undefined") return;
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.innerHTML = `<div class="modal-box resume-view-modal"><p class="muted">Loading resume…</p></div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });

    ApiClient.getStudentResumeForIndustry(studentId).then((res) => {
      const box = overlay.querySelector(".modal-box");
      if (!res.ok || !res.data.resume) {
        box.innerHTML = `
          ${UI.emptyState("This student's resume is private or not available to you yet.")}
          <div class="btn-row" style="justify-content:flex-end;"><button class="btn" id="resume-view-close">Close</button></div>`;
        box.querySelector("#resume-view-close").onclick = () => overlay.remove();
        return;
      }
      const state = stateFromSaved(res.data.resume);
      box.innerHTML = `
        <div class="btn-row" style="justify-content:space-between;align-items:center;margin-bottom:10px;">
          <h3 style="margin:0;">Student Resume</h3>
          <div class="btn-row">
            <button class="btn btn-sm" id="resume-view-download">⬇ Download PDF</button>
            <button class="btn btn-sm" id="resume-view-close">Close</button>
          </div>
        </div>
        <div id="resume-preview"></div>
      `;
      updatePreview(state);
      box.querySelector("#resume-view-close").onclick = () => overlay.remove();
      box.querySelector("#resume-view-download").onclick = () => window.print();
    }).catch(() => {
      overlay.querySelector(".modal-box").innerHTML = UI.emptyState("Could not reach the backend API.");
    });
  }

  return { renderSection, openIndustryView };
})();
