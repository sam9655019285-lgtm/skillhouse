/*
 * js/assistant/assistantWidget.js — floating round button + chat panel,
 * injected on every page that includes this script (see each *.html's
 * closing </body> for the include). Talks to AssistantClient for data;
 * this file only owns DOM/rendering/animation.
 */

(function () {
  const WELCOME_MESSAGE = "Hi! I'm your AI Assistant. I can help you find jobs and internships, explain skills or courses, or answer questions about using this site. What would you like to know?";
  const HISTORY_LIMIT = 6;

  let panelEl, messagesEl, inputEl, sendBtn, launcherEl;
  let open = false;
  let sending = false;
  let history = []; // [{role, content}], most recent last

  function escapeHtml(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function timeNow() {
    return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  function buildDom() {
    launcherEl = document.createElement("button");
    launcherEl.className = "ai-assistant-launcher";
    launcherEl.setAttribute("aria-label", "Open AI Assistant");
    launcherEl.innerHTML = `
      <span class="ai-unread-dot"></span>
      <span class="ai-launcher-icon">💬</span>
      <span class="ai-launcher-label">AI</span>
    `;
    launcherEl.onclick = toggle;

    panelEl = document.createElement("div");
    panelEl.className = "ai-assistant-panel";
    panelEl.innerHTML = `
      <div class="ai-assistant-header">
        <div>
          <div class="ai-header-title">AI Assistant</div>
          <div class="ai-header-sub">Jobs, skills &amp; help — online</div>
        </div>
        <button class="ai-close-btn" aria-label="Close">✕</button>
      </div>
      <div class="ai-assistant-messages"></div>
      <div class="ai-assistant-inputbar">
        <textarea rows="1" placeholder="Ask about jobs, skills, or the site..." maxlength="600"></textarea>
        <button type="button">Send</button>
      </div>
    `;

    document.body.appendChild(panelEl);
    document.body.appendChild(launcherEl);

    messagesEl = panelEl.querySelector(".ai-assistant-messages");
    inputEl = panelEl.querySelector("textarea");
    sendBtn = panelEl.querySelector(".ai-assistant-inputbar button");
    panelEl.querySelector(".ai-close-btn").onclick = () => setOpen(false);

    sendBtn.onclick = handleSend;
    inputEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    });
    inputEl.addEventListener("input", () => {
      inputEl.style.height = "auto";
      inputEl.style.height = Math.min(inputEl.scrollHeight, 70) + "px";
    });
  }

  function setOpen(next) {
    open = next;
    panelEl.classList.toggle("open", open);
    launcherEl.classList.remove("has-unread");
    if (open) {
      if (!messagesEl.childElementCount) addMessage("assistant", WELCOME_MESSAGE);
      setTimeout(() => inputEl.focus(), 150);
    }
  }

  function toggle() { setOpen(!open); }

  function addMessage(role, text) {
    const row = document.createElement("div");
    row.className = `ai-msg ai-msg-${role}`;
    row.innerHTML = `<div class="ai-msg-bubble"></div><div class="ai-msg-time"></div>`;
    row.querySelector(".ai-msg-bubble").textContent = text;
    row.querySelector(".ai-msg-time").textContent = timeNow();
    messagesEl.appendChild(row);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return row;
  }

  function addOpportunityCards(opportunities) {
    if (!opportunities || !opportunities.length) return;
    const wrap = document.createElement("div");
    wrap.className = "ai-msg ai-msg-assistant";
    wrap.style.maxWidth = "100%";
    wrap.innerHTML = opportunities.map((o) => `
      <div class="ai-opp-card">
        <div class="ai-opp-title">${escapeHtml(o.title)}</div>
        <div class="ai-opp-sub">${escapeHtml(o.company)} &middot; ${escapeHtml(o.type || "")}</div>
        <div class="ai-opp-skills">Skills: ${escapeHtml((o.required_skills || []).slice(0, 4).join(", ") || "—")}</div>
        <button type="button" class="ai-opp-view-btn" data-id="${escapeHtml(o.id)}">View Opportunity</button>
      </div>
    `).join("");
    messagesEl.appendChild(wrap);
    wrap.querySelectorAll(".ai-opp-view-btn").forEach((btn) => {
      btn.onclick = () => {
        const id = Number(btn.dataset.id);
        setOpen(false);
        AssistantClient.openOpportunity(id);
      };
    });
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function addCompanyCards(companies) {
    if (!companies || !companies.length) return;
    const wrap = document.createElement("div");
    wrap.className = "ai-msg ai-msg-assistant";
    wrap.style.maxWidth = "100%";
    wrap.innerHTML = companies.map((c) => `
      <div class="ai-opp-card">
        <div class="ai-opp-title">${escapeHtml(c.name)}</div>
        <div class="ai-opp-sub">${escapeHtml((c.domains || []).join(", "))}</div>
        <div class="ai-opp-sub">📍 ${escapeHtml((c.locations || []).join(" • ") || "Location not specified")}</div>
        <div class="ai-opp-sub">💰 ${escapeHtml((c.stipends || []).join(" • ") || "Salary not disclosed")}</div>
        <div class="ai-opp-skills">${c.jobs || 0} job(s) &middot; ${c.internships || 0} internship(s) &middot; Skills: ${escapeHtml((c.skills || []).slice(0, 4).join(", ") || "—")}</div>
        <button type="button" class="ai-opp-view-btn ai-company-view-btn" data-company="${escapeHtml(c.name)}">View Company</button>
      </div>
    `).join("");
    messagesEl.appendChild(wrap);
    wrap.querySelectorAll(".ai-company-view-btn").forEach((btn) => {
      btn.onclick = () => {
        setOpen(false);
        AssistantClient.openCompany(btn.dataset.company);
      };
    });
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function addTypingIndicator() {
    const row = document.createElement("div");
    row.className = "ai-msg ai-msg-assistant";
    row.id = "ai-typing-row";
    row.innerHTML = `<div class="ai-msg-bubble"><span class="ai-typing-dots"><span></span><span></span><span></span></span></div>`;
    messagesEl.appendChild(row);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function removeTypingIndicator() {
    const row = document.getElementById("ai-typing-row");
    if (row) row.remove();
  }

  async function handleSend() {
    const text = inputEl.value.trim();
    if (!text || sending) return;
    inputEl.value = "";
    inputEl.style.height = "auto";
    sending = true;
    sendBtn.disabled = true;

    addMessage("user", text);
    history.push({ role: "user", content: text });
    history = history.slice(-HISTORY_LIMIT);

    addTypingIndicator();
    const result = await AssistantClient.sendMessage(text, history);
    removeTypingIndicator();

    addMessage("assistant", result.reply);
    history.push({ role: "assistant", content: result.reply });
    history = history.slice(-HISTORY_LIMIT);
    addOpportunityCards(result.opportunities);
    addCompanyCards(result.companies);

    sending = false;
    sendBtn.disabled = false;
    inputEl.focus();
  }

  function init() {
    if (document.querySelector(".ai-assistant-launcher")) return; // already initialized
    buildDom();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
