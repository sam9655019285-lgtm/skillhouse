/*
 * js/api/apiClient.js — Phase 13 spec point 27, extended for
 * server-side auth (SQLite-backed users/sessions).
 *
 * The ONLY place in the frontend that knows the backend's URL. Talks
 * exclusively to our own backend (never LinkedIn or any other
 * external API directly), and never holds an API key, secret, or
 * access token — those live only in the backend (SQLite for LinkedIn
 * tokens, backend/.env for the app-level client id/secret).
 *
 * All requests use credentials: "include" so the httpOnly session
 * cookie set by /api/auth/login is sent on every call.
 */

const ApiClient = (() => {
  // Change this if your backend runs somewhere other than port 3000.
  //
  // The host below deliberately follows whatever host the page itself
  // was loaded from (localhost vs 127.0.0.1) rather than always saying
  // "localhost". Browsers treat "localhost" and "127.0.0.1" as
  // different sites for cookies — if the frontend is opened at
  // 127.0.0.1:5500 (Live Server's default) but this always pointed at
  // http://localhost:3000, the httpOnly session cookie set by
  // /api/auth/login would never be sent back on later requests (wrong
  // site), and every page would silently look logged-out. Matching the
  // page's own hostname keeps frontend and backend on the same site.
  const DEFAULT_HOST = ["localhost", "127.0.0.1"].includes(window.location.hostname)
    ? window.location.hostname
    : "localhost";
  const BASE_URL = window.API_BASE_URL || `http://${DEFAULT_HOST}:3000`;
  const REQUEST_TIMEOUT_MS = 8000;

  async function request(path, { method = "GET", body, timeoutMs = REQUEST_TIMEOUT_MS } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`${BASE_URL}${path}`, {
        method,
        credentials: "include",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
      clearTimeout(timer);
      let data = null;
      try { data = await res.json(); } catch { /* no/invalid JSON body */ }
      if (!res.ok) return { ok: false, status: res.status, error: (data && data.error) || `Backend responded with status ${res.status}.` };
      return { ok: true, status: res.status, data };
    } catch (err) {
      clearTimeout(timer);
      let reason;
      if (err.name === "AbortError") {
        reason = "The request timed out.";
      } else if (window.location.protocol === "file:") {
        // Opening an .html file directly (file://) sends `Origin: null`,
        // which the backend's CORS check correctly refuses — this is
        // the most common cause of this error. See README.md "Quick
        // Start": run `npm run dev` and open the printed http:// URL
        // instead of double-clicking the file.
        reason = "Could not reach the backend API. This page was opened directly from a file (file://), which the backend blocks for security. Run \"npm run dev\" from the project folder and open the http://127.0.0.1:5500 link it prints instead.";
      } else {
        reason = "Could not reach the backend API. Make sure the backend server is running — run \"npm run dev\" (or \"npm start\") from the project folder.";
      }
      return { ok: false, error: reason };
    }
  }

  const getJson = (path, opts) => request(path, opts);

  function getJobs(forceRefresh = false) {
    return getJson(`/api/jobs${forceRefresh ? "?refresh=true" : ""}`);
  }
  function getSkillDemand() {
    return getJson("/api/skills/demand");
  }
  function getIndustryTrends() {
    return getJson("/api/industry/trends");
  }
  function getApiStatus() {
    return getJson("/api/industry/status");
  }

  // ---- Auth ----
  function register(name, email, password, confirmPassword, role) {
    return request("/api/auth/register", { method: "POST", body: { name, email, password, confirmPassword, role } });
  }
  function login(email, password) {
    return request("/api/auth/login", { method: "POST", body: { email, password } });
  }
  function logout() {
    return request("/api/auth/logout", { method: "POST" });
  }
  function me() {
    return request("/api/auth/me");
  }

  // ---- Student profile (backend/routes/profile.js) ----
  function getProfile() {
    return getJson("/api/profile");
  }
  function updateProfile(profile) {
    return request("/api/profile", { method: "PUT", body: profile });
  }

  // ---- Student skills (backend/routes/studentSkills.js) ----
  function getStudentSkills() {
    return getJson("/api/student/skills");
  }
  function updateStudentSkills(skillsList) {
    return request("/api/student/skills", { method: "PUT", body: { skills: skillsList } });
  }
  function deleteStudentSkill(skillId) {
    return request(`/api/student/skills/${skillId}`, { method: "DELETE" });
  }

  // ---- Student projects (backend/routes/projects.js) ----
  function getStudentProjects() {
    return getJson("/api/student/projects");
  }
  function createStudentProject(project) {
    return request("/api/student/projects", { method: "POST", body: project });
  }
  function updateStudentProject(projectId, project) {
    return request(`/api/student/projects/${projectId}`, { method: "PUT", body: project });
  }
  function deleteStudentProject(projectId) {
    return request(`/api/student/projects/${projectId}`, { method: "DELETE" });
  }

  // ---- Student assessments (backend/routes/assessments.js) ----
  function getStudentAssessments() {
    return getJson("/api/student/assessments");
  }
  function getStudentAssessment(assessmentId) {
    return getJson(`/api/student/assessments/${assessmentId}`);
  }
  function submitStudentAssessment(assessment) {
    return request("/api/student/assessments", { method: "POST", body: assessment });
  }

  // ---- Student certifications (backend/routes/certifications.js) ----
  function getCertifications() {
    return getJson("/api/student/certifications");
  }
  function createCertification(data) {
    return request("/api/student/certifications", { method: "POST", body: data, timeoutMs: 20000 });
  }
  function updateCertification(id, data) {
    return request(`/api/student/certifications/${id}`, { method: "PUT", body: data, timeoutMs: 20000 });
  }
  function deleteCertification(id) {
    return request(`/api/student/certifications/${id}`, { method: "DELETE" });
  }
  function certificationFileUrl(id) {
    return `${BASE_URL}/api/student/certifications/${id}/file`;
  }

  // ---- Student skill-gap analysis (backend/routes/skillGap.js) ----
  function getStudentSkillGap(role) {
    return getJson(`/api/student/skill-gap${role ? `?role=${encodeURIComponent(role)}` : ""}`);
  }

  // ---- Industry skill demand analytics (backend/routes/industrySkillDemand.js) ----
  function getIndustrySkillDemand() {
    return getJson("/api/industry/skill-demand");
  }

  // ---- Opportunities (backend/routes/opportunities.js) ----
  function getOpportunities() {
    return getJson("/api/opportunities");
  }
  function getOpportunity(id) {
    return getJson(`/api/opportunities/${id}`);
  }
  function createOpportunity(data) {
    return request("/api/opportunities", { method: "POST", body: data });
  }
  function updateOpportunity(id, data) {
    return request(`/api/opportunities/${id}`, { method: "PUT", body: data });
  }
  function deleteOpportunity(id) {
    return request(`/api/opportunities/${id}`, { method: "DELETE" });
  }

  // ---- Applications (backend/routes/applications.js) ----
  function applyToOpportunity(id, data) {
    return request(`/api/opportunities/${id}/apply`, { method: "POST", body: data || {} });
  }
  function getStudentApplications() {
    return getJson("/api/student/applications");
  }
  function getStudentApplication(id) {
    return getJson(`/api/student/applications/${id}`);
  }
  function getIndustryApplicants(opportunityId) {
    return getJson(`/api/opportunities/${opportunityId}/applicants`);
  }
  function updateApplicationStatus(applicationId, status) {
    return request(`/api/industry/applications/${applicationId}/status`, { method: "PUT", body: { status } });
  }

  // ---- Opportunity matching (backend/routes/opportunityMatching.js) ----
  function getOpportunityMatch(opportunityId, role) {
    return getJson(`/api/student/opportunities/${opportunityId}/match${role ? `?role=${encodeURIComponent(role)}` : ""}`);
  }
  function getRankedOpportunityMatches(role) {
    return getJson(`/api/student/opportunities/matches${role ? `?role=${encodeURIComponent(role)}` : ""}`);
  }

  // ---- Learning recommendations (backend/routes/learningRecommendations.js) ----
  function getLearningRecommendations(role, opportunityId) {
    const params = [];
    if (role) params.push(`role=${encodeURIComponent(role)}`);
    if (opportunityId) params.push(`opportunityId=${encodeURIComponent(opportunityId)}`);
    return getJson(`/api/student/learning-recommendations${params.length ? `?${params.join("&")}` : ""}`);
  }

  // ---- Institution analytics (backend/routes/institutionAnalytics.js) ----
  function getInstitutionAnalytics() {
    return getJson("/api/institution/analytics");
  }

  // ---- Academician analytics (backend/routes/academicianAnalytics.js) ----
  function getAcademicianAnalytics(department) {
    return getJson(`/api/academician/analytics${department ? `?department=${encodeURIComponent(department)}` : ""}`);
  }

  // ---- Industry candidate discovery (backend/routes/candidates.js) ----
  function searchCandidates(filters = {}) {
    const params = Object.entries(filters).filter(([, v]) => v !== undefined && v !== null && v !== "")
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
    return getJson(`/api/industry/candidates${params.length ? `?${params.join("&")}` : ""}`);
  }
  function getCandidateDetail(candidateId) {
    return getJson(`/api/industry/candidates/${candidateId}`);
  }

  // ---- Mentorship (backend/routes/mentorship.js) ----
  function getMentors() {
    return getJson("/api/mentorship/mentors");
  }
  function createMentorshipRequest(academicianId, message) {
    return request("/api/mentorship/requests", { method: "POST", body: { academicianId, message } });
  }
  function getStudentMentorshipRequests() {
    return getJson("/api/mentorship/student/requests");
  }
  function getAcademicianMentorshipRequests() {
    return getJson("/api/mentorship/academician/requests");
  }
  function updateMentorshipStatus(requestId, status) {
    return request(`/api/mentorship/requests/${requestId}/status`, { method: "PUT", body: { status } });
  }
  function cancelMentorshipRequest(requestId) {
    return request(`/api/mentorship/requests/${requestId}/cancel`, { method: "PUT" });
  }
  function getStudentMentorshipNeeds(role) {
    return getJson(`/api/mentorship/student/needs${role ? `?role=${encodeURIComponent(role)}` : ""}`);
  }

  // ---- Industry Live Projects (backend/routes/industryProjects.js) ----
  function getLiveProjects() {
    return getJson("/api/industry-projects");
  }
  function getLiveProject(id) {
    return getJson(`/api/industry-projects/${id}`);
  }
  function createLiveProject(data) {
    return request("/api/industry-projects", { method: "POST", body: data });
  }
  function updateLiveProject(id, data) {
    return request(`/api/industry-projects/${id}`, { method: "PUT", body: data });
  }
  function deleteLiveProject(id) {
    return request(`/api/industry-projects/${id}`, { method: "DELETE" });
  }
  function applyToLiveProject(id, data) {
    return request(`/api/industry-projects/${id}/apply`, { method: "POST", body: data || {} });
  }
  function getLiveProjectApplicants(id) {
    return getJson(`/api/industry-projects/${id}/applicants`);
  }
  function updateLiveProjectApplicantStatus(projectId, applicationId, status) {
    return request(`/api/industry-projects/${projectId}/applicants/${applicationId}/status`, { method: "PUT", body: { status } });
  }

  // ---- Industry Problem Statements (backend/routes/problemStatements.js) ----
  function getProblemStatements() {
    return getJson("/api/problem-statements");
  }
  function getProblemStatement(id) {
    return getJson(`/api/problem-statements/${id}`);
  }
  function createProblemStatement(data) {
    return request("/api/problem-statements", { method: "POST", body: data });
  }
  function updateProblemStatement(id, data) {
    return request(`/api/problem-statements/${id}`, { method: "PUT", body: data });
  }
  function deleteProblemStatement(id) {
    return request(`/api/problem-statements/${id}`, { method: "DELETE" });
  }
  function expressProblemStatementInterest(id, message) {
    return request(`/api/problem-statements/${id}/interest`, { method: "POST", body: { message } });
  }
  function getStudentProblemStatementParticipation() {
    return getJson("/api/student/problem-statements");
  }
  function getProblemStatementParticipants(id) {
    return getJson(`/api/problem-statements/${id}/participants`);
  }
  function updateProblemStatementParticipantStatus(problemId, participantId, status) {
    return request(`/api/problem-statements/${problemId}/participants/${participantId}/status`, { method: "PUT", body: { status } });
  }

  // ---- Notifications (backend/routes/notifications.js) ----
  function getNotifications() {
    return getJson("/api/notifications");
  }
  function getUnreadNotificationCount() {
    return getJson("/api/notifications/unread-count");
  }
  function getNotification(id) {
    return getJson(`/api/notifications/${id}`);
  }
  function markNotificationRead(id) {
    return request(`/api/notifications/${id}/read`, { method: "PUT" });
  }
  function markAllNotificationsRead() {
    return request("/api/notifications/read-all", { method: "PUT" });
  }

  // ---- Admin (backend/routes/admin.js) ----
  function getAdminOverview() {
    return getJson("/api/admin/overview");
  }
  function getAdminUsers(filters = {}) {
    const params = Object.entries(filters).filter(([, v]) => v !== undefined && v !== null && v !== "")
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
    return getJson(`/api/admin/users${params.length ? `?${params.join("&")}` : ""}`);
  }
  function getAdminUser(id) {
    return getJson(`/api/admin/users/${id}`);
  }
  function updateAdminUserStatus(id, status) {
    return request(`/api/admin/users/${id}/status`, { method: "PUT", body: { status } });
  }
  function getAdminContent(type) {
    return getJson(`/api/admin/content?type=${encodeURIComponent(type)}`);
  }
  function updateAdminContentStatus(type, id, status) {
    return request(`/api/admin/content/${type}/${id}/status`, { method: "PUT", body: { status } });
  }
  function getAdminAudit(limit) {
    return getJson(`/api/admin/audit${limit ? `?limit=${encodeURIComponent(limit)}` : ""}`);
  }

  // ---- AI Assistant (backend proxies the external LLM call, if any —
  // see backend/routes/assistant.js / services/assistantService.js) ----
  function assistantChat(message, history, context) {
    return request("/api/assistant/chat", { method: "POST", body: { message, history, context }, timeoutMs: 15000 });
  }

  // ---- AI Resume Builder (backend/routes/resume.js) ----
  function generateResumeDraft(profile) {
    return request("/api/student/resume/generate", { method: "POST", body: { profile }, timeoutMs: 20000 });
  }
  function getMyResume() {
    return getJson("/api/student/resume");
  }
  function saveMyResume(data) {
    return request("/api/student/resume", { method: "PUT", body: data });
  }
  function getStudentResumeForIndustry(studentId) {
    return getJson(`/api/industry/students/${studentId}/resume`);
  }

  // ---- LinkedIn (per-user OAuth connection) ----
  function linkedinConnectUrl() {
    return `${BASE_URL}/api/linkedin/connect`;
  }
  function getLinkedinStatus() {
    return getJson("/api/linkedin/status");
  }
  function disconnectLinkedin() {
    return request("/api/linkedin/disconnect", { method: "POST" });
  }

  return {
    BASE_URL, getJobs, getSkillDemand, getIndustryTrends, getApiStatus,
    register, login, logout, me,
    getProfile, updateProfile,
    getStudentSkills, updateStudentSkills, deleteStudentSkill,
    getCertifications, createCertification, updateCertification, deleteCertification, certificationFileUrl,
    getStudentProjects, createStudentProject, updateStudentProject, deleteStudentProject,
    getStudentAssessments, getStudentAssessment, submitStudentAssessment,
    getStudentSkillGap,
    getIndustrySkillDemand,
    getOpportunities, getOpportunity, createOpportunity, updateOpportunity, deleteOpportunity,
    applyToOpportunity, getStudentApplications, getStudentApplication,
    getIndustryApplicants, updateApplicationStatus,
    getOpportunityMatch, getRankedOpportunityMatches, getLearningRecommendations,
    getInstitutionAnalytics, getAcademicianAnalytics,
    searchCandidates, getCandidateDetail,
    getMentors, createMentorshipRequest, getStudentMentorshipRequests, getAcademicianMentorshipRequests,
    updateMentorshipStatus, cancelMentorshipRequest, getStudentMentorshipNeeds,
    getLiveProjects, getLiveProject, createLiveProject, updateLiveProject, deleteLiveProject,
    applyToLiveProject, getLiveProjectApplicants, updateLiveProjectApplicantStatus,
    getProblemStatements, getProblemStatement, createProblemStatement, updateProblemStatement, deleteProblemStatement,
    expressProblemStatementInterest, getStudentProblemStatementParticipation,
    getProblemStatementParticipants, updateProblemStatementParticipantStatus,
    getNotifications, getUnreadNotificationCount, getNotification, markNotificationRead, markAllNotificationsRead,
    getAdminOverview, getAdminUsers, getAdminUser, updateAdminUserStatus, getAdminContent, updateAdminContentStatus, getAdminAudit,
    generateResumeDraft, getMyResume, saveMyResume, getStudentResumeForIndustry,
    linkedinConnectUrl, getLinkedinStatus, disconnectLinkedin,
    assistantChat,
  };
})();
