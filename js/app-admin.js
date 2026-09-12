/*
 * app-admin.js — page controller for admin.html (Step 19). Real
 * backend data only (backend/routes/admin.js) — no mock engines.
 */
document.addEventListener("DOMContentLoaded", () => {
  if (!Auth.requireRole(["Admin"])) return;
  Navigation.renderShell("Admin");
  buildPanels();
  window.addEventListener("tab-activated", (e) => onTabActivated(e.detail.tabId));
  Navigation.activateTab("dashboard");
});

function buildPanels() {
  const main = document.getElementById("main-content");
  const tabs = ["dashboard", "overview", "users", "content", "health", "audit"];
  main.innerHTML = tabs.map((id) => `<div class="tab-panel" id="panel-${id}"><div id="content-${id}"></div></div>`).join("");
}

function onTabActivated(tabId) {
  const el = document.getElementById(`content-${tabId}`);
  if (!el) return;
  switch (tabId) {
    case "dashboard": renderAdminDashboard(el); break;
    case "overview": renderPlatformOverview(el); break;
    case "users": Storage.set("admin_selected_user", null); renderUserManagement(el); break;
    case "content": renderPlatformContent(el); break;
    case "health": renderPlatformHealth(el); break;
    case "audit": renderAuditLog(el); break;
  }
}

function statusBadgeKind(status) {
  return status === "Active" || status === "Open" ? "green" : status === "Suspended" || status === "Closed" ? "red" : status === "In Progress" ? "primary" : "gray";
}

// ============================================================
// Dashboard — small welcome + top-line metrics
// ============================================================
function renderAdminDashboard(container) {
  const user = Auth.getCurrentUser();
  container.innerHTML = `<div class="page-header"><h1>Welcome, ${UI.escapeHtml(user.name)}</h1><p>Platform-wide monitoring and moderation.</p></div><div id="admin-dash-metrics"></div>`;
  if (typeof ApiClient === "undefined") return;
  ApiClient.getAdminOverview().then((res) => {
    const el = document.getElementById("admin-dash-metrics");
    if (!res.ok) { el.innerHTML = UI.emptyState(res.error || "Could not load platform overview."); return; }
    const o = res.data;
    el.innerHTML = UI.metricRow([
      ["Total Users", o.users.total], ["Opportunities", o.opportunities.total],
      ["Live Projects", o.liveProjects.total], ["Problem Statements", o.problemStatements.total],
    ]);
  }).catch(() => { document.getElementById("admin-dash-metrics").innerHTML = UI.emptyState("Could not reach the backend API."); });
}

// ============================================================
// Platform Overview — full real metrics
// ============================================================
function renderPlatformOverview(container) {
  container.innerHTML = `<p class="muted">Loading platform overview…</p>`;
  ApiClient.getAdminOverview().then((res) => {
    if (!res.ok) { container.innerHTML = UI.emptyState(res.error || "Could not load platform overview."); return; }
    const o = res.data;
    container.innerHTML = `
      ${UI.sectionHeader("Platform Overview", "Real database counts — generated " + UI.escapeHtml((o.generatedAt || "").slice(0, 16)))}
      <h4>Users</h4>
      ${UI.metricRow([["Total", o.users.total], ["Students", o.users.students], ["Industries", o.users.industries], ["Academicians", o.users.academicians], ["Institutions", o.users.institutions], ["Admins", o.users.admins]])}
      <hr class="divider">
      <h4>Profiles &amp; Skills</h4>
      ${UI.metricRow([["Students w/ Profiles", o.profiles.studentsWithProfiles], ["Students w/o Profiles", o.profiles.studentsWithoutProfiles], ["Students w/ Skills", o.skills.studentsWithSkills], ["Total Skill Records", o.skills.totalSkillRecords]])}
      <hr class="divider">
      <h4>Assessments</h4>
      ${UI.metricRow([["Completed", o.assessments.completed], ["Average Score", o.assessments.averageScore !== null ? `${o.assessments.averageScore}%` : "—"]])}
      <hr class="divider">
      <h4>Opportunities &amp; Live Projects</h4>
      ${UI.metricRow([["Opportunities", o.opportunities.total], ["Active", o.opportunities.active], ["Live Projects", o.liveProjects.total], ["Open", o.liveProjects.open]])}
      <hr class="divider">
      <h4>Problem Statements</h4>
      ${UI.metricRow([["Total", o.problemStatements.total], ["Open", o.problemStatements.open]])}
      <hr class="divider">
      <h4>Applications</h4>
      ${UI.metricRow([["Total", o.applications.total]])}
      <div style="margin-top:6px;">${o.applications.statusDistribution.map((s) => UI.badge(`${s.status}: ${s.count}`, "gray")).join(" ")}</div>
      <hr class="divider">
      <h4>Mentorship</h4>
      ${UI.metricRow([["Total Requests", o.mentorship.total], ["Pending", o.mentorship.pending], ["Accepted", o.mentorship.accepted]])}
      <hr class="divider">
      <h4>Notifications</h4>
      ${UI.metricRow([["Total", o.notifications.total], ["Unread", o.notifications.unread]])}
    `;
  }).catch(() => { container.innerHTML = UI.emptyState("Could not reach the backend API."); });
}

// ============================================================
// User Management
// ============================================================
function renderUserManagement(container) {
  const selectedId = Storage.get("admin_selected_user", null);
  if (selectedId !== null) { renderUserDetail(container, selectedId); return; }

  container.innerHTML = `<p class="muted">Loading users…</p>`;
  ApiClient.getAdminUsers().then((res) => {
    if (!res.ok) { container.innerHTML = UI.emptyState(res.error || "Could not load users."); return; }
    const allUsers = res.data.users;

    container.innerHTML = UI.sectionHeader("User Management") + `
      <div class="search-row"><input type="text" id="au-search" placeholder="Search by name"></div>
      <div class="filters-row">
        <select id="au-role"><option value="">All Roles</option>${UI.selectOptions(["Student", "Industry", "Academician", "Institution", "Admin"], "", false)}</select>
        <select id="au-status"><option value="">All Statuses</option>${UI.selectOptions(["Active", "Suspended"], "", false)}</select>
      </div>
      <div id="au-count" class="muted" style="margin-bottom:8px;"></div>
      <div id="au-list"></div>`;

    const rerender = () => {
      const role = document.getElementById("au-role").value;
      const status = document.getElementById("au-status").value;
      const search = document.getElementById("au-search").value.trim();
      const filters = {};
      if (role) filters.role = role;
      if (status) filters.status = status;
      if (search) filters.search = search;
      ApiClient.getAdminUsers(filters).then((res2) => {
        if (!res2.ok) return;
        const users = res2.data.users;
        document.getElementById("au-count").textContent = `${users.length} user${users.length === 1 ? "" : "s"} found`;
        document.getElementById("au-list").innerHTML = users.length ? users.map((u) => `
          <div class="card">
            <div class="card-row"><div class="card-title">${UI.escapeHtml(u.name)}</div>${UI.badge(u.status, statusBadgeKind(u.status))}</div>
            <div class="muted" style="font-size:.82rem;">${UI.escapeHtml(u.role)} · Joined ${UI.escapeHtml((u.createdAt || "").slice(0, 10))}${u.profileComplete !== null ? ` · Profile: ${u.profileComplete ? "Complete" : "Incomplete"}` : ""}</div>
            <div class="btn-row" style="margin-top:6px;">
              <button class="btn btn-sm view-user-btn" data-id="${u.id}">View</button>
              ${u.status === "Active" ? `<button class="btn btn-sm btn-danger suspend-user-btn" data-id="${u.id}">Suspend</button>` : `<button class="btn btn-sm btn-success activate-user-btn" data-id="${u.id}">Activate</button>`}
            </div>
          </div>`).join("") : UI.emptyState("No users match your search and filters.");
        document.getElementById("au-list").querySelectorAll(".view-user-btn").forEach((btn) => btn.onclick = () => { Storage.set("admin_selected_user", Number(btn.dataset.id)); renderUserManagement(container); });
        document.getElementById("au-list").querySelectorAll(".suspend-user-btn").forEach((btn) => btn.onclick = () => updateStatus(Number(btn.dataset.id), "Suspended"));
        document.getElementById("au-list").querySelectorAll(".activate-user-btn").forEach((btn) => btn.onclick = () => updateStatus(Number(btn.dataset.id), "Active"));
      });
    };
    const updateStatus = (id, status) => {
      ApiClient.updateAdminUserStatus(id, status).then((res3) => {
        if (res3.ok) { UI.toast(`User ${status.toLowerCase()}.`, status === "Suspended" ? "info" : "success"); rerender(); }
        else UI.toast(res3.error || "Could not update user status.", "warning");
      }).catch(() => UI.toast("Could not reach the backend API.", "warning"));
    };
    ["au-search", "au-role", "au-status"].forEach((id) => {
      document.getElementById(id).addEventListener("input", rerender);
      document.getElementById(id).addEventListener("change", rerender);
    });
    rerender();
  }).catch(() => { container.innerHTML = UI.emptyState("Could not reach the backend API."); });
}

function renderUserDetail(container, userId) {
  container.innerHTML = `<p class="muted">Loading user…</p>`;
  ApiClient.getAdminUser(userId).then((res) => {
    if (!res.ok) { container.innerHTML = UI.emptyState(res.error || "User not found."); return; }
    const u = res.data.user;
    const extraFields = Object.entries(u).filter(([k]) => !["id", "name", "email", "role", "status", "createdAt"].includes(k));
    container.innerHTML = `
      <button class="back-link" id="au-back">← Back to User Management</button>
      <h2>${UI.escapeHtml(u.name)}</h2>
      <div>${UI.badge(u.status, statusBadgeKind(u.status))} ${UI.badge(u.role, "primary")}</div>
      <p><strong>Email:</strong> ${UI.escapeHtml(u.email)}</p>
      <p class="muted">Joined ${UI.escapeHtml((u.createdAt || "").slice(0, 10))}</p>
      <hr class="divider">
      <div class="grid grid-2">${extraFields.map(([k, v]) => `<div><strong>${UI.escapeHtml(k)}:</strong> ${UI.escapeHtml(v === null || v === undefined ? "—" : String(v))}</div>`).join("")}</div>
      <hr class="divider">
      <div class="btn-row">
        ${u.status === "Active" ? `<button class="btn btn-danger" id="au-suspend-btn">Suspend User</button>` : `<button class="btn btn-success" id="au-activate-btn">Activate User</button>`}
      </div>
    `;
    document.getElementById("au-back").onclick = () => { Storage.set("admin_selected_user", null); renderUserManagement(container); };
    const suspendBtn = document.getElementById("au-suspend-btn");
    if (suspendBtn) suspendBtn.onclick = () => ApiClient.updateAdminUserStatus(userId, "Suspended").then((res2) => {
      if (res2.ok) { UI.toast("User suspended.", "info"); renderUserDetail(container, userId); }
      else UI.toast(res2.error || "Could not suspend user.", "warning");
    });
    const activateBtn = document.getElementById("au-activate-btn");
    if (activateBtn) activateBtn.onclick = () => ApiClient.updateAdminUserStatus(userId, "Active").then((res2) => {
      if (res2.ok) { UI.toast("User activated.", "success"); renderUserDetail(container, userId); }
      else UI.toast(res2.error || "Could not activate user.", "warning");
    });
  }).catch(() => { container.innerHTML = UI.emptyState("Could not reach the backend API."); });
}

// ============================================================
// Platform Content moderation
// ============================================================
const CONTENT_TYPE_LABELS = { opportunity: "Opportunities", "live-project": "Live Projects", "problem-statement": "Problem Statements" };
const CONTENT_TYPE_STATUSES = { opportunity: ["Active", "Closed"], "live-project": ["Open", "In Progress", "Completed", "Closed"], "problem-statement": ["Open", "In Progress", "Completed", "Closed"] };

function renderPlatformContent(container) {
  container.innerHTML = UI.sectionHeader("Platform Content", "Moderate opportunities, live projects, and problem statements.") + `
    <div class="filters-row"><select id="pc-type">${UI.selectOptions(Object.keys(CONTENT_TYPE_LABELS).map((k) => CONTENT_TYPE_LABELS[k]), CONTENT_TYPE_LABELS.opportunity, false)}</select></div>
    <div id="pc-list"></div>`;
  const typeSelect = document.getElementById("pc-type");
  const labelToType = Object.fromEntries(Object.entries(CONTENT_TYPE_LABELS).map(([k, v]) => [v, k]));

  const rerender = () => {
    const type = labelToType[typeSelect.value];
    const listEl = document.getElementById("pc-list");
    listEl.innerHTML = `<p class="muted">Loading…</p>`;
    ApiClient.getAdminContent(type).then((res) => {
      if (!res.ok) { listEl.innerHTML = UI.emptyState(res.error || "Could not load content."); return; }
      const items = res.data.content;
      listEl.innerHTML = items.length ? items.map((c) => `
        <div class="card">
          <div class="card-row"><div class="card-title">${UI.escapeHtml(c.title)}</div>${UI.badge(c.status, statusBadgeKind(c.status))}</div>
          <div class="muted" style="font-size:.82rem;">Owner: ${UI.escapeHtml(c.ownerName)} · Created ${UI.escapeHtml((c.createdAt || "").slice(0, 10))}</div>
          <div class="btn-row" style="margin-top:6px;">
            ${(CONTENT_TYPE_STATUSES[type] || []).filter((s) => s !== c.status).map((s) => `<button class="btn btn-sm ${s === "Closed" ? "btn-danger" : ""} pc-status-btn" data-id="${c.id}" data-status="${s}">${s}</button>`).join(" ")}
          </div>
        </div>`).join("") : UI.emptyState("No content of this type yet.");
      listEl.querySelectorAll(".pc-status-btn").forEach((btn) => btn.onclick = () => {
        ApiClient.updateAdminContentStatus(type, Number(btn.dataset.id), btn.dataset.status).then((res2) => {
          if (res2.ok) { UI.toast(`Status updated to ${btn.dataset.status}.`, "success"); rerender(); }
          else UI.toast(res2.error || "Could not update status.", "warning");
        }).catch(() => UI.toast("Could not reach the backend API.", "warning"));
      });
    }).catch(() => { listEl.innerHTML = UI.emptyState("Could not reach the backend API."); });
  };
  typeSelect.addEventListener("change", rerender);
  rerender();
}

// ============================================================
// Platform Health — data snapshot, not server monitoring
// ============================================================
function renderPlatformHealth(container) {
  container.innerHTML = `<p class="muted">Loading platform health…</p>`;
  ApiClient.getAdminOverview().then((res) => {
    if (!res.ok) { container.innerHTML = UI.emptyState(res.error || "Could not load platform health."); return; }
    const o = res.data;
    container.innerHTML = UI.sectionHeader("Platform Health", "A real data snapshot — not server/uptime monitoring.") +
      UI.metricRow([
        ["Total Users", o.users.total], ["Total Opportunities", o.opportunities.total],
        ["Total Live Projects", o.liveProjects.total], ["Total Problem Statements", o.problemStatements.total],
      ]) +
      UI.metricRow([
        ["Total Applications", o.applications.total], ["Pending Mentorship", o.mentorship.pending],
        ["Unread Notifications", o.notifications.unread], ["Admins", o.users.admins],
      ]);
  }).catch(() => { container.innerHTML = UI.emptyState("Could not reach the backend API."); });
}

// ============================================================
// Audit Log
// ============================================================
function renderAuditLog(container) {
  container.innerHTML = `<p class="muted">Loading audit log…</p>`;
  ApiClient.getAdminAudit(50).then((res) => {
    if (!res.ok) { container.innerHTML = UI.emptyState(res.error || "Could not load the audit log."); return; }
    const entries = res.data.audit;
    container.innerHTML = UI.sectionHeader("Audit Log", "Recent administrative actions.");
    if (!entries.length) { container.innerHTML += UI.emptyState("No administrative actions recorded yet."); return; }
    container.innerHTML += entries.map((e) => `
      <div class="card">
        <div class="card-row"><div class="card-title" style="font-size:.9rem;">${UI.escapeHtml(e.action)}</div><span class="muted" style="font-size:.78rem;">${UI.escapeHtml((e.createdAt || "").slice(0, 16))}</span></div>
        ${e.details ? `<p class="muted" style="font-size:.82rem;">${UI.escapeHtml(e.details)}</p>` : ""}
        <div class="muted" style="font-size:.78rem;">Admin #${e.adminId}${e.entityType ? ` · ${UI.escapeHtml(e.entityType)} #${e.entityId}` : ""}</div>
      </div>`).join("");
  }).catch(() => { container.innerHTML = UI.emptyState("Could not reach the backend API."); });
}
