/*
 * certifications.js — Student "Certifications" tab (backend/routes/
 * certifications.js). Lets a student upload a certificate (JPG/PNG/
 * PDF, sent to the backend as a base64 data URL — see
 * backend/services/certificateStorage.js for why there's no
 * multipart parser here), tag the skills it demonstrates, and manage
 * saved certifications as cards. Tagged skills are also pushed into
 * the student's My Skills list (js/app-student.js renderSkillsTab)
 * via the backend, which tracks whether a skill exists only because
 * of a certification so deleting one doesn't wipe out a skill still
 * backed by another certification or added by hand.
 */

const Certifications = (() => {
  const MAX_FILE_BYTES = 5 * 1024 * 1024;
  const ALLOWED_TYPES = ["image/jpeg", "image/jpg", "image/png", "application/pdf"];

  function fetchExistingSkillNames() {
    if (typeof ApiClient === "undefined") return Promise.resolve([]);
    return ApiClient.getStudentSkills()
      .then((res) => (res.ok ? (res.data.skills || []).map((s) => s.skillName) : []))
      .catch(() => []);
  }

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  function certPreviewHtml(cert) {
    if (!cert.hasFile) return `<div class="cert-thumb cert-thumb-empty">No file uploaded</div>`;
    const url = ApiClient.certificationFileUrl(cert.id);
    if (cert.fileType === "application/pdf") {
      return `<a class="cert-thumb cert-thumb-pdf" href="${url}" target="_blank" rel="noopener">📄<span>View PDF</span></a>`;
    }
    return `<a href="${url}" target="_blank" rel="noopener"><img class="cert-thumb" src="${url}" alt="${UI.escapeHtml(cert.name)} certificate"></a>`;
  }

  function certCardHtml(cert) {
    return `
      <div class="card cert-card" data-id="${cert.id}">
        <div class="cert-card-media">${certPreviewHtml(cert)}</div>
        <div class="cert-card-body">
          <div class="card-title">${UI.escapeHtml(cert.name)}</div>
          <div class="card-sub">${UI.escapeHtml(cert.organization || "Organization not specified")}${cert.issueDate ? " • " + UI.escapeHtml(cert.issueDate) : ""}</div>
          ${cert.certificateUrl ? `<a href="${UI.escapeHtml(cert.certificateUrl)}" target="_blank" rel="noopener" class="muted" style="font-size:.78rem;">Certificate link ↗</a>` : ""}
          <div class="cert-skills">${cert.skills.length ? cert.skills.map((s) => UI.badge(s, "primary")).join("") : `<span class="muted" style="font-size:.78rem;">No skills tagged</span>`}</div>
          <div class="btn-row" style="margin-top:10px;">
            <button class="btn btn-sm cert-edit-btn" data-id="${cert.id}">Edit</button>
            <button class="btn btn-sm btn-danger cert-delete-btn" data-id="${cert.id}">Delete</button>
          </div>
        </div>
      </div>`;
  }

  function renderSection(container) {
    if (typeof ApiClient === "undefined") { container.innerHTML = UI.emptyState("Backend unavailable."); return; }

    container.innerHTML = `
      ${UI.sectionHeader("Certifications", "Upload your certificates and tag the skills they demonstrate — they'll also show up in My Skills.")}
      <div class="btn-row" style="margin-bottom:14px;"><button class="btn btn-primary" id="cert-add-btn">+ Upload Certificate</button></div>
      <div id="cert-list" class="grid grid-3"></div>
    `;

    function load() {
      const listEl = document.getElementById("cert-list");
      if (!listEl) return;
      listEl.innerHTML = `<p class="muted">Loading certifications…</p>`;
      ApiClient.getCertifications().then((res) => {
        if (!res.ok) { listEl.innerHTML = UI.emptyState(res.error || "Could not load certifications."); return; }
        const certs = res.data.certifications || [];
        listEl.innerHTML = certs.length
          ? certs.map(certCardHtml).join("")
          : UI.emptyState("No certifications added yet. Upload your first certificate to get started.");

        listEl.querySelectorAll(".cert-edit-btn").forEach((btn) => btn.onclick = () => {
          const cert = certs.find((c) => c.id === Number(btn.dataset.id));
          if (cert) openForm(cert, load);
        });
        listEl.querySelectorAll(".cert-delete-btn").forEach((btn) => btn.onclick = () => {
          UI.confirmModal("Delete this certification? Any skill tagged only by this certificate will also be removed from My Skills.", () => {
            ApiClient.deleteCertification(Number(btn.dataset.id)).then((r) => {
              if (r.ok) { UI.toast("Certification deleted.", "success"); load(); }
              else UI.toast(r.error || "Could not delete certification.", "warning");
            }).catch(() => UI.toast("Could not reach the backend API.", "warning"));
          });
        });
      }).catch(() => { listEl.innerHTML = UI.emptyState("Could not reach the backend API."); });
    }

    document.getElementById("cert-add-btn").onclick = () => openForm(null, load);
    load();
  }

  function openForm(cert, onSaved) {
    const isEdit = !!cert;
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.innerHTML = `
      <div class="modal-box cert-modal-box">
        <h3 style="margin-top:0;">${isEdit ? "Edit Certification" : "Upload Certificate"}</h3>

        <label>Certificate Name</label>
        <input type="text" id="cert-name" value="${UI.escapeHtml(cert ? cert.name : "")}" placeholder="e.g. Python Programming Certificate">

        <label>Issuing Organization</label>
        <input type="text" id="cert-org" value="${UI.escapeHtml(cert ? (cert.organization || "") : "")}" placeholder="e.g. Coursera, NPTEL, Google">

        <label>Issue Date</label>
        <input type="date" id="cert-date" value="${UI.escapeHtml(cert ? (cert.issueDate || "") : "")}">

        <label>Certificate URL (optional)</label>
        <input type="url" id="cert-url" value="${UI.escapeHtml(cert ? (cert.certificateUrl || "") : "")}" placeholder="https://...">

        <label>Certificate File — JPG, PNG, or PDF (max 5MB)</label>
        <input type="file" id="cert-file" accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf">
        <div id="cert-file-preview" class="cert-file-preview">${isEdit && cert.hasFile ? `<div class="muted" style="font-size:.8rem;">Current file: ${UI.escapeHtml(cert.fileName || "certificate")} — choose a new file to replace it.</div>` : ""}</div>

        <label>Skills demonstrated by this certificate</label>
        <div id="cert-existing-skills" class="cert-skill-picker"><span class="muted" style="font-size:.8rem;">Loading your skills…</span></div>
        <div class="cert-skill-add-row">
          <input type="text" id="cert-new-skill" placeholder="Add a new skill (e.g. Python)">
          <button type="button" class="btn btn-sm" id="cert-new-skill-btn">Add Skill</button>
        </div>
        <div id="cert-custom-skills" class="cert-skill-chips"></div>

        <div id="cert-form-error"></div>
        <div class="btn-row" style="justify-content:flex-end;margin-top:16px;">
          <button type="button" class="btn" id="cert-cancel-btn">Cancel</button>
          <button type="button" class="btn btn-primary" id="cert-save-btn">${isEdit ? "Save Changes" : "Save Certification"}</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    const initialSkills = cert ? cert.skills.slice() : [];
    const customSkills = [];
    let selectedFile = null;

    fetchExistingSkillNames().then((names) => {
      const merged = Array.from(new Set([...names, ...initialSkills]));
      const pickerEl = document.getElementById("cert-existing-skills");
      if (!pickerEl) return; // form may have been closed already
      pickerEl.innerHTML = merged.length
        ? merged.map((name) => `
          <label class="cert-skill-option">
            <input type="checkbox" value="${UI.escapeHtml(name)}" ${initialSkills.includes(name) ? "checked" : ""}>
            ${UI.escapeHtml(name)}
          </label>`).join("")
        : `<span class="muted" style="font-size:.8rem;">No existing skills yet — add a new one below.</span>`;
    });

    function isNameTaken(name) {
      const lower = name.toLowerCase();
      const inChips = customSkills.some((s) => s.toLowerCase() === lower);
      const inExisting = Array.from(overlay.querySelectorAll("#cert-existing-skills input[type=checkbox]"))
        .some((cb) => cb.value.toLowerCase() === lower);
      return inChips || inExisting;
    }

    function renderCustomChips() {
      const el = document.getElementById("cert-custom-skills");
      el.innerHTML = customSkills.map((s, i) => `<span class="badge badge-primary cert-chip">${UI.escapeHtml(s)} <button type="button" class="cert-chip-remove" data-i="${i}" aria-label="Remove ${UI.escapeHtml(s)}">×</button></span>`).join("");
      el.querySelectorAll(".cert-chip-remove").forEach((btn) => btn.onclick = () => {
        customSkills.splice(Number(btn.dataset.i), 1);
        renderCustomChips();
      });
    }

    document.getElementById("cert-new-skill-btn").onclick = () => {
      const input = document.getElementById("cert-new-skill");
      const val = input.value.trim();
      if (!val) return;
      if (!isNameTaken(val)) { customSkills.push(val); renderCustomChips(); }
      input.value = "";
      input.focus();
    };
    document.getElementById("cert-new-skill").addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); document.getElementById("cert-new-skill-btn").click(); }
    });

    document.getElementById("cert-file").addEventListener("change", (e) => {
      const file = e.target.files[0];
      const previewEl = document.getElementById("cert-file-preview");
      const errEl = document.getElementById("cert-form-error");
      errEl.innerHTML = "";
      if (!file) { selectedFile = null; return; }
      if (!ALLOWED_TYPES.includes(file.type)) {
        errEl.innerHTML = `<div class="auth-error">Only JPG, PNG, and PDF files are allowed.</div>`;
        e.target.value = ""; selectedFile = null; return;
      }
      if (file.size > MAX_FILE_BYTES) {
        errEl.innerHTML = `<div class="auth-error">File must be 5MB or smaller.</div>`;
        e.target.value = ""; selectedFile = null; return;
      }
      selectedFile = file;
      if (file.type === "application/pdf") {
        previewEl.innerHTML = `<div class="muted" style="font-size:.8rem;">📄 ${UI.escapeHtml(file.name)} selected.</div>`;
      } else {
        previewEl.innerHTML = `<img src="${URL.createObjectURL(file)}" class="cert-thumb" alt="Certificate preview">`;
      }
    });

    document.getElementById("cert-cancel-btn").onclick = () => overlay.remove();
    overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });

    document.getElementById("cert-save-btn").onclick = async () => {
      const errEl = document.getElementById("cert-form-error");
      errEl.innerHTML = "";
      const name = document.getElementById("cert-name").value.trim();
      if (!name) { errEl.innerHTML = `<div class="auth-error">Certificate name is required.</div>`; return; }

      const certUrl = document.getElementById("cert-url").value.trim();
      if (certUrl) {
        try { new URL(certUrl); } catch { errEl.innerHTML = `<div class="auth-error">Certificate URL must be a valid URL.</div>`; return; }
      }

      const checkedSkills = Array.from(overlay.querySelectorAll("#cert-existing-skills input[type=checkbox]:checked")).map((cb) => cb.value);
      const allSkills = Array.from(new Set([...checkedSkills, ...customSkills]));

      const payload = {
        name,
        organization: document.getElementById("cert-org").value.trim() || null,
        issueDate: document.getElementById("cert-date").value || null,
        certificateUrl: certUrl || null,
        skills: allSkills,
      };

      const saveBtn = document.getElementById("cert-save-btn");
      saveBtn.disabled = true;
      saveBtn.textContent = "Saving…";

      try {
        if (selectedFile) {
          payload.fileData = await fileToDataUrl(selectedFile);
          payload.fileName = selectedFile.name;
        }
        const result = isEdit
          ? await ApiClient.updateCertification(cert.id, payload)
          : await ApiClient.createCertification(payload);

        if (!result.ok) {
          errEl.innerHTML = `<div class="auth-error">${UI.escapeHtml(result.error || "Could not save certification.")}</div>`;
          saveBtn.disabled = false;
          saveBtn.textContent = isEdit ? "Save Changes" : "Save Certification";
          return;
        }
        UI.toast(isEdit ? "Certification updated." : "Certification saved.", "success");
        overlay.remove();
        if (onSaved) onSaved();
      } catch (err) {
        errEl.innerHTML = `<div class="auth-error">Could not reach the backend API.</div>`;
        saveBtn.disabled = false;
        saveBtn.textContent = isEdit ? "Save Changes" : "Save Certification";
      }
    };

    renderCustomChips();
  }

  return { renderSection };
})();
