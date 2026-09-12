/*
 * notifications.js — Step 18, shared notification bell/popup for
 * Student/Industry/Academician dashboards (backend/routes/notifications.js).
 * Loads on dashboard open (per Step 18's "avoid aggressive polling"
 * guidance) — no WebSockets, no timer-based polling. Mounted once as a
 * floating top-right bell by Navigation.renderShell.
 */

const Notifications = (() => {
  // Maps a notification's type to the existing tab it's about — no
  // new pages, just jumps to where the relevant feature already lives.
  function typeToTab(type) {
    switch (type) {
      case "APPLICATION_STATUS": return "applications";
      case "APPLICATION_RECEIVED": return "applications-received";
      case "LIVE_PROJECT_STATUS": return "live-projects";
      case "LIVE_PROJECT_RECEIVED": return "live-projects";
      case "PROBLEM_INTEREST": return "problem-statements";
      case "PROBLEM_PARTICIPANT_STATUS": return "problem-statements";
      case "MENTORSHIP_REQUEST": return "mentorship-requests";
      case "MENTORSHIP_STATUS": return "mentorship";
      default: return null;
    }
  }

  function itemHtml(n) {
    return `
      <div class="card notif-item" data-id="${n.id}" data-type="${n.type}" style="cursor:pointer;${n.isRead ? "" : "border-left:3px solid var(--primary,#3b82f6);"}">
        <div class="card-row"><div class="card-title" style="font-size:.88rem;">${UI.escapeHtml(n.title)}</div>${!n.isRead ? UI.badge("New", "primary") : ""}</div>
        ${n.message ? `<p class="muted" style="font-size:.8rem;margin:4px 0;">${UI.escapeHtml(n.message)}</p>` : ""}
        <div class="muted" style="font-size:.74rem;">${UI.escapeHtml((n.createdAt || "").slice(0, 16))}</div>
      </div>`;
  }

  let bellBtn = null, badgeEl = null, popupEl = null, bodyEl = null, mounted = false;

  function updateBadge(count) {
    if (!badgeEl) return;
    if (count > 0) {
      badgeEl.textContent = count > 99 ? "99+" : String(count);
      badgeEl.style.display = "flex";
    } else {
      badgeEl.style.display = "none";
    }
  }

  function renderBody() {
    if (typeof ApiClient === "undefined" || !bodyEl) return;
    bodyEl.innerHTML = `<p class="muted">Loading notifications…</p>`;
    ApiClient.getNotifications().then((res) => {
      if (!res.ok) { bodyEl.innerHTML = `<p class="muted">Couldn't load notifications.</p>`; return; }
      const notifications = res.data.notifications || [];
      const unreadCount = notifications.filter((n) => !n.isRead).length;
      updateBadge(unreadCount);

      bodyEl.innerHTML = `
        ${notifications.length ? `<div class="card-row" style="margin-bottom:8px;"><span class="muted" style="font-size:.78rem;">${notifications.length} total</span><button class="btn btn-sm" id="notif-mark-all-btn">Mark All Read</button></div>` : ""}
        <div id="notif-list">${notifications.length ? notifications.slice(0, 10).map(itemHtml).join("") : UI.emptyState("No notifications yet.")}</div>
      `;

      const markAllBtn = bodyEl.querySelector("#notif-mark-all-btn");
      if (markAllBtn) markAllBtn.onclick = () => ApiClient.markAllNotificationsRead().then(renderBody).catch(() => {});

      bodyEl.querySelectorAll(".notif-item").forEach((el) => el.onclick = () => {
        const id = Number(el.dataset.id);
        const tab = typeToTab(el.dataset.type);
        ApiClient.markNotificationRead(id).then(() => {
          closePopup();
          if (tab && typeof Navigation !== "undefined") Navigation.activateTab(tab);
          renderBody();
        }).catch(() => {});
      });
    }).catch(() => { bodyEl.innerHTML = `<p class="muted">Couldn't load notifications.</p>`; });
  }

  function refreshBadge() {
    if (typeof ApiClient === "undefined" || !badgeEl) return;
    ApiClient.getUnreadNotificationCount().then((res) => {
      if (res.ok) updateBadge(res.data.unreadCount || 0);
    }).catch(() => {});
  }

  function openPopup() {
    popupEl.classList.add("open");
    renderBody();
  }
  function closePopup() {
    popupEl.classList.remove("open");
  }
  function togglePopup() {
    if (popupEl.classList.contains("open")) closePopup();
    else openPopup();
  }

  function mountFloatingBell() {
    if (mounted) { refreshBadge(); return; }
    if (typeof ApiClient === "undefined") return;
    mounted = true;

    bellBtn = document.createElement("button");
    bellBtn.id = "notif-bell-btn";
    bellBtn.className = "notif-bell-btn";
    bellBtn.type = "button";
    bellBtn.setAttribute("aria-label", "Notifications");
    bellBtn.innerHTML = `🔔<span class="notif-badge" id="notif-badge" style="display:none;"></span>`;
    document.body.appendChild(bellBtn);
    badgeEl = bellBtn.querySelector("#notif-badge");

    popupEl = document.createElement("div");
    popupEl.id = "notif-popup";
    popupEl.className = "notif-popup";
    popupEl.innerHTML = `
      <div class="notif-popup-header">
        <span>🔔 Notifications</span>
        <button type="button" class="notif-popup-close" id="notif-popup-close" aria-label="Close notifications">×</button>
      </div>
      <div class="notif-popup-body" id="notif-popup-body"></div>
    `;
    document.body.appendChild(popupEl);
    bodyEl = popupEl.querySelector("#notif-popup-body");

    bellBtn.onclick = (e) => { e.stopPropagation(); togglePopup(); };
    popupEl.querySelector("#notif-popup-close").onclick = () => closePopup();
    popupEl.onclick = (e) => e.stopPropagation();
    document.addEventListener("click", closePopup);
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") closePopup(); });

    refreshBadge();
  }

  return { mountFloatingBell };
})();
