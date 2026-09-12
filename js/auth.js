/*
 * auth.js — Phase 11 authentication, now backed by the Node backend
 * + SQLite (backend/routes/auth.js, backend/db/users.js) instead of
 * localStorage.
 *
 * Passwords are hashed and verified entirely server-side (scrypt);
 * the browser never sees a password hash. The actual login session
 * is an HTTP-only cookie the browser can't read or forge — see
 * REPOSITORY_ANALYSIS.md "High: Browser-side authentication is not
 * an access-control boundary", which this replaces.
 *
 * getCurrentUser()/isLoggedIn()/requireRole() stay SYNCHRONOUS (most
 * of the app calls them that way — storage.js's per-user namespacing
 * in particular). They read a small non-secret cache of the logged-in
 * user's id/name/email/role from sessionStorage, populated on login
 * and refreshed on page load. That cache is a UI convenience only —
 * it grants no access by itself, because every backend request is
 * authorized by the httpOnly session cookie, not by anything read
 * from here. requireRole() also verifies the session with the
 * backend in the background and forces logout if it's no longer
 * valid (expired, or storage was tampered with).
 */

const VALID_ROLES = ["Student", "Industry", "Academician", "Institution"];

const Auth = (() => {
  let _currentUser = null; // cached in-memory mirror of sessionStorage

  function cacheUser(user) {
    _currentUser = user;
    if (user) sessionStorage.setItem("aisb:currentUser", JSON.stringify(user));
    else sessionStorage.removeItem("aisb:currentUser");
  }

  // --------------------------------------------------------------
  // Registration — POST /api/auth/register
  // --------------------------------------------------------------
  async function registerUser(name, email, password, confirmPassword, role) {
    if (!(password && confirmPassword && password === confirmPassword)) {
      // Fail fast client-side for a nicer error message; the backend
      // re-validates everything regardless (never trust the client).
      if (password !== confirmPassword) return { success: false, message: "Passwords do not match." };
    }
    if (!VALID_ROLES.includes(role)) {
      return { success: false, message: "Please select a valid role." };
    }

    const result = await ApiClient.register(name, email, password, confirmPassword, role);
    if (!result.ok) return { success: false, message: result.error };
    cacheUser(result.data.user);
    return { success: true, message: "Account created successfully." };
  }

  // --------------------------------------------------------------
  // Login — POST /api/auth/login
  // --------------------------------------------------------------
  async function authenticateUser(email, password) {
    if (!email || !password) {
      return { user: null, error: "Please enter both email and password." };
    }
    const result = await ApiClient.login(email, password);
    if (!result.ok) return { user: null, error: result.error };
    return { user: result.data.user, error: null };
  }

  // --------------------------------------------------------------
  // Session (sessionStorage cache + backend httpOnly cookie)
  // --------------------------------------------------------------
  function loginUser(user) {
    cacheUser(user);

    // Phase 11 spec point 13: link the account to the existing Phase
    // 2 student_profile / Phase 8 industry_profile — only fills
    // fields that are still empty.
    if (user.role === "Student") {
      Storage.initStudentData();
      const profile = Storage.get("student_profile", {});
      if (!profile.full_name) profile.full_name = user.name || "";
      if (!profile.email) profile.email = user.email || "";
      Storage.set("student_profile", profile);
    } else if (user.role === "Industry") {
      Storage.initIndustryData();
      const profile = Storage.get("industry_profile", {});
      if (!profile.contact_email) profile.contact_email = user.email || "";
      Storage.set("industry_profile", profile);
    }
  }

  function logoutUser() {
    cacheUser(null);
    // Fire-and-forget: invalidate the session cookie server-side too.
    // Not awaited so existing synchronous call sites keep working.
    ApiClient.logout().catch(() => {});
  }

  function getCurrentUser() {
    if (_currentUser) return _currentUser;
    try {
      const raw = sessionStorage.getItem("aisb:currentUser");
      _currentUser = raw ? JSON.parse(raw) : null;
    } catch (e) {
      _currentUser = null;
    }
    return _currentUser;
  }

  function isLoggedIn() {
    return !!getCurrentUser();
  }

  // Background check against the real session (httpOnly cookie). Only
  // forces a logout on a confirmed 401 (session really doesn't exist
  // server-side) — NOT on a network error, timeout, or unreachable
  // backend, which must never log the user out or they'd be bounced
  // back to login.html any time the backend blips. Not awaited by
  // callers — keeps requireRole() synchronous.
  async function verifySessionInBackground() {
    const result = await ApiClient.me();
    if (!result.ok) {
      if (result.status === 401) {
        cacheUser(null);
        if (!location.pathname.endsWith("login.html")) window.location.href = "login.html";
      }
      return;
    }
    if (!_currentUser || _currentUser.id !== result.data.user.id) {
      cacheUser(result.data.user);
    }
  }

  // --------------------------------------------------------------
  // Page protection (Phase 11 spec point 8 / navigation.js uses these)
  // --------------------------------------------------------------
  function requireLogin() {
    if (!isLoggedIn()) {
      window.location.href = "login.html";
      return false;
    }
    verifySessionInBackground();
    return true;
  }

  function requireRole(allowedRoles) {
    if (!requireLogin()) return false;
    const user = getCurrentUser();
    if (!allowedRoles.includes(user.role)) {
      alert("Access denied.");
      window.location.href = roleDashboardUrl(user.role);
      return false;
    }
    return true;
  }

  function roleDashboardUrl(role) {
    switch (role) {
      case "Student": return "student.html";
      case "Industry": return "industry.html";
      case "Academician": return "academician.html";
      case "Institution": return "institution.html";
      case "Admin": return "admin.html";
      default: return "login.html";
    }
  }

  return {
    registerUser, authenticateUser,
    loginUser, logoutUser, getCurrentUser, isLoggedIn,
    requireLogin, requireRole, roleDashboardUrl,
  };
})();
