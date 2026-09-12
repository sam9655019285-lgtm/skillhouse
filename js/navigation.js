/*
 * navigation.js — replaces components/sidebar.py + the Streamlit
 * st.tabs() pattern used throughout pages/*.py.
 */

const Navigation = (() => {
  const NAV_ITEMS = {
    Student: [
      ["dashboard", "Dashboard"], ["profile", "My Profile"], ["skills", "My Skills"],
      ["certifications", "Certifications"], ["resume", "My Resume"],
      ["portfolio", "Portfolio"], ["assessment", "Skill Assessment"], ["skillgap", "Skill Gap Analysis"],
      ["opportunities", "Industry Opportunities"], ["saved-opps", "Saved Opportunities"], ["applications", "My Applications"],
      ["learning", "Learning & Skill Development"], ["recommended-learning", "Recommended For You"],
      ["saved-learning", "Saved Resources"], ["my-learning", "My Learning"],
      ["smart-recommendations", "Smart Recommendations"], ["mentorship", "Mentorship"],
      ["live-projects", "Live Projects"], ["problem-statements", "Problem Statements"],
    ],
    Industry: [
      ["dashboard", "Dashboard"], ["company-profile", "Industry Profile"], ["post-opportunity", "Post New Opportunity"],
      ["my-opportunities", "My Opportunities"], ["applications-received", "Applications Received"],
      ["shortlisted", "Shortlisted Candidates"], ["candidate-search", "Candidate Search"],
      ["real-candidates", "Student Database Search"],
      ["talent-discovery", "Talent Discovery"], ["industry-analytics", "Industry Analytics"],
      ["live-projects", "Live Projects"], ["problem-statements", "Problem Statements"],
    ],
    Academician: [
      ["dashboard", "Dashboard"], ["skill-analytics", "Skill Gaps & Demand"],
      ["curriculum", "Curriculum Intelligence"], ["live-alignment", "Live Industry Alignment"],
      ["training", "Training Priorities"], ["collaboration", "Industry Collaboration"],
      ["mentorship-requests", "Mentorship Requests"], ["problem-statements", "Industry Problem Statements"],
    ],
    Admin: [
      ["dashboard", "Admin Dashboard"], ["overview", "Platform Overview"],
      ["users", "User Management"], ["content", "Platform Content"],
      ["health", "Platform Health"], ["audit", "Audit Log"],
    ],
    Institution: [
      ["dashboard", "Overall Analytics"], ["live-demand", "Live Industry Demand"],
      ["curriculum", "Curriculum Alignment"], ["training", "Training Priorities"],
      ["collaboration", "Collaboration Opportunities"], ["reports", "Reports"],
    ],
  };

  function renderShell(role) {
    Storage.ensureAllInitialized();
    const user = Auth.getCurrentUser();

    document.getElementById("sidebar-toggle")?.remove();
    const toggle = document.createElement("button");
    toggle.id = "sidebar-toggle";
    toggle.className = "sidebar-toggle";
    toggle.innerHTML = "☰";
    toggle.onclick = () => document.querySelector(".sidebar").classList.toggle("open");
    document.body.appendChild(toggle);

    const sidebar = document.getElementById("sidebar");
    const items = NAV_ITEMS[role] || [];
    sidebar.innerHTML = `
      <div class="brand">🎓 Skillhouse</div>
      <div class="brand-caption">Connecting students, industry, and institutions</div>
      <hr>
      <div class="account-card">
        <div class="name">${UI.escapeHtml(user.name)}</div>
        <div class="muted" style="font-size:.78rem;">${UI.escapeHtml(user.email)}</div>
        <span class="role-badge">${UI.escapeHtml(user.role)}</span>
        <button class="btn btn-block logout-btn" id="logout-btn">Logout</button>
      </div>
      <hr>
      <ul class="nav-list" id="nav-list">
        ${items.map(([id, label]) => `<li><button class="nav-link" data-tab="${id}">${UI.escapeHtml(label)}</button></li>`).join("")}
      </ul>
      <hr>
      <div class="brand-caption">Phase 11 — Authentication & Role-Based Access Control.</div>
      <a href="api-status.html" style="font-size:.76rem;color:#a5b4fc;">⚙ API status</a>
    `;

    document.getElementById("logout-btn").onclick = () => {
      Auth.logoutUser();
      window.location.href = "login.html";
    };

    sidebar.querySelectorAll(".nav-link").forEach((btn) => {
      btn.onclick = () => {
        activateTab(btn.dataset.tab);
        if (window.innerWidth <= 720) sidebar.classList.remove("open");
      };
    });

    if (typeof Notifications !== "undefined") Notifications.mountFloatingBell();
  }

  function activateTab(tabId) {
    document.querySelectorAll(".nav-link").forEach((b) => b.classList.toggle("active", b.dataset.tab === tabId));
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.toggle("active", p.id === `panel-${tabId}`));
    window.dispatchEvent(new CustomEvent("tab-activated", { detail: { tabId } }));
    window.scrollTo(0, 0);
  }

  return { renderShell, activateTab };
})();
