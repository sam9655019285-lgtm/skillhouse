/*
 * storage.js — replaces Streamlit's st.session_state.
 *
 * Everything the Python app kept in st.session_state now lives in
 * localStorage, namespaced per logged-in user (by user_id) so two
 * demo accounts in the same browser never see each other's data
 * (Phase 12 — user data linking / data isolation).
 *
 * Mirrors utils/session_state.py's initialize_student_data() /
 * initialize_industry_data(): every getter below returns a sensible
 * default the first time it's called, and never overwrites existing
 * data. Nothing here duplicates a getter/setter that already exists.
 */

const Storage = (() => {
  function userScope() {
    const user = Auth.getCurrentUser();
    return user ? `u${user.id}` : "anon";
  }

  function fullKey(key) {
    return `aisb:${userScope()}:${key}`;
  }

  function get(key, fallback) {
    try {
      const raw = localStorage.getItem(fullKey(key));
      if (raw === null || raw === undefined) return fallback;
      return JSON.parse(raw);
    } catch (e) {
      // Corrupted localStorage data (Phase spec point 28) — never crash the page.
      console.warn("Storage.get: corrupted value for", key, e);
      return fallback;
    }
  }

  function set(key, value) {
    try {
      localStorage.setItem(fullKey(key), JSON.stringify(value));
      return true;
    } catch (e) {
      console.error("Storage.set failed for", key, e);
      return false;
    }
  }

  function ensure(key, defaultValue) {
    const existing = get(key, undefined);
    if (existing === undefined) {
      set(key, defaultValue);
      return defaultValue;
    }
    return existing;
  }

  // ------------------------------------------------------------------
  // Users now live server-side in SQLite (backend/db/users.js) behind
  // an httpOnly session cookie — see js/auth.js and js/api/apiClient.js.
  // There is no local user store anymore.
  // ------------------------------------------------------------------
  // Student session data (Phase 2-7) — same shape/keys/defaults as
  // utils/session_state.py:initialize_student_data()
  // ------------------------------------------------------------------
  function initStudentData() {
    ensure("student_profile", {});
    ensure("technical_skills", {});
    ensure("soft_skills", {});
    ensure("projects", []);
    ensure("certifications", []);
    ensure("assessment_started", false);
    ensure("assessment_current_index", 0);
    ensure("assessment_answers", {});
    ensure("assessment_attempt", 0);
    ensure("assessment_result", null);
    ensure("skill_gap_target_role", null);
    ensure("skill_gap_analysis", null);
    ensure("saved_opportunities", []);
    ensure("saved_companies", []);
    ensure("applications", []);
    ensure("selected_opportunity_id", null);
    ensure("saved_learning_resources", []);
    ensure("learning_progress", []);
    ensure("selected_learning_resource", null);
    ensure("match_results", null);
    ensure("selected_recommendation", null);
  }

  // ------------------------------------------------------------------
  // Industry session data (Phase 8) — mirrors initialize_industry_data()
  // ------------------------------------------------------------------
  function initIndustryData() {
    ensure("industry_profile", {});
    ensure("industry_opportunities", []);
    // Deep copy of the seed applications so Shortlist/Reject actions
    // don't mutate the shared DATA constant.
    ensure("industry_seed_applications", JSON.parse(JSON.stringify(DATA.SEED_APPLICATIONS)));
    ensure("selected_industry_opportunity", null);
    ensure("selected_candidate", null);
  }

  // Generic convenience get/set that also ensures the section this
  // key belongs to has been initialized (so pages can be visited in
  // any order — mirrors modules/analytics/data.py's _ensure_data_initialized()).
  function ensureAllInitialized() {
    initStudentData();
    initIndustryData();
  }

  return {
    get, set, ensure,
    initStudentData, initIndustryData, ensureAllInitialized,
  };
})();
