/*
 * server.js — Phase 13 backend entry point.
 *
 * Zero external dependencies on purpose (Node's built-in `http` only)
 * so `npm install` has nothing that can fail or go stale, and the
 * whole backend is easy to read end-to-end for a college project. See
 * README.md "Phase 13" for setup and how this talks to
 * js/api/apiClient.js.
 */

const http = require("http");
const { URL } = require("url");

const { loadEnv } = require("./utils/env");
loadEnv();

const logger = require("./utils/logger");
const { createRouter } = require("./utils/router");
const { parseCookies } = require("./utils/cookies");
const sessions = require("./db/sessions");
const { seedDemoUsersIfEmpty } = require("./db/seed");
seedDemoUsersIfEmpty();
const jobsRoute = require("./routes/jobs");
const industryDataRoute = require("./routes/industryData");
const skillsRoute = require("./routes/skills");
const authRoute = require("./routes/auth");
const profileRoute = require("./routes/profile");
const studentSkillsRoute = require("./routes/studentSkills");
const certificationsRoute = require("./routes/certifications");
const projectsRoute = require("./routes/projects");
const assessmentsRoute = require("./routes/assessments");
const skillGapRoute = require("./routes/skillGap");
const industrySkillDemandRoute = require("./routes/industrySkillDemand");
const opportunitiesRoute = require("./routes/opportunities");
const applicationsRoute = require("./routes/applications");
const opportunityMatchingRoute = require("./routes/opportunityMatching");
const learningRecommendationsRoute = require("./routes/learningRecommendations");
const institutionAnalyticsRoute = require("./routes/institutionAnalytics");
const academicianAnalyticsRoute = require("./routes/academicianAnalytics");
const candidatesRoute = require("./routes/candidates");
const mentorshipRoute = require("./routes/mentorship");
const industryProjectsRoute = require("./routes/industryProjects");
const problemStatementsRoute = require("./routes/problemStatements");
const notificationsRoute = require("./routes/notifications");
const adminRoute = require("./routes/admin");
const linkedinRoute = require("./routes/linkedin");
const assistantRoute = require("./routes/assistant");
const resumeRoute = require("./routes/resume");

const PORT = process.env.PORT || 3000;
// ---- CORS: any localhost/127.0.0.1 origin is allowed in development
// (this is a local dev API with no secrets reachable from the
// frontend anyway — see backend/README notes). Set CORS_ORIGIN to a
// comma-separated list to lock this down for a real deployment.
const configuredOrigins = (process.env.CORS_ORIGIN || "")
  .split(",").map((o) => o.trim()).filter(Boolean);

function isAllowedOrigin(origin) {
  if (!origin) return true; // non-browser tools (curl, etc.)
  if (configuredOrigins.includes(origin)) return true;
  if ((process.env.NODE_ENV || "development") !== "production") {
    try {
      const { hostname } = new URL(origin);
      if (hostname === "localhost" || hostname === "127.0.0.1") return true;
    } catch { /* fall through to deny */ }
  }
  return false;
}

const router = createRouter();
router.get("/", (req, res, ctx) => ctx.sendJson(200, {
  name: "Academia-Industry Portal API", status: "running",
  demoMode: String(process.env.DEMO_MODE || "true") === "true",
}));
router.get("/api/jobs", jobsRoute.getJobs);
router.get("/api/industry/trends", industryDataRoute.getTrends);
router.get("/api/industry/status", industryDataRoute.getStatus);
router.get("/api/industry/skill-demand", industrySkillDemandRoute.getSkillDemand);
router.get("/api/skills/demand", skillsRoute.getDemand);
router.get("/api/skills/aliases", skillsRoute.getAliases);

router.post("/api/auth/register", authRoute.register);
router.post("/api/auth/login", authRoute.login);
router.post("/api/auth/logout", authRoute.logout);
router.get("/api/auth/me", authRoute.me);

router.get("/api/profile", profileRoute.getProfile);
router.put("/api/profile", profileRoute.updateProfile);

router.get("/api/student/skills", studentSkillsRoute.getSkills);
router.put("/api/student/skills", studentSkillsRoute.updateSkills);
router.delete("/api/student/skills/:skillId", studentSkillsRoute.deleteSkill);

router.get("/api/student/certifications", certificationsRoute.listCertifications);
router.post("/api/student/certifications", certificationsRoute.createCertification);
router.put("/api/student/certifications/:certificationId", certificationsRoute.updateCertification);
router.delete("/api/student/certifications/:certificationId", certificationsRoute.deleteCertification);
router.get("/api/student/certifications/:certificationId/file", certificationsRoute.getCertificationFile);

router.get("/api/student/projects", projectsRoute.listProjects);
router.post("/api/student/projects", projectsRoute.createProject);
router.put("/api/student/projects/:projectId", projectsRoute.updateProject);
router.delete("/api/student/projects/:projectId", projectsRoute.deleteProject);

router.get("/api/student/assessments", assessmentsRoute.listAssessments);
router.get("/api/student/assessments/:assessmentId", assessmentsRoute.getAssessment);
router.post("/api/student/assessments", assessmentsRoute.createAssessment);

router.get("/api/student/skill-gap", skillGapRoute.getSkillGap);

router.get("/api/opportunities", opportunitiesRoute.listOpportunities);
router.post("/api/opportunities", opportunitiesRoute.createOpportunity);
router.get("/api/opportunities/:opportunityId", opportunitiesRoute.getOpportunity);
router.put("/api/opportunities/:opportunityId", opportunitiesRoute.updateOpportunity);
router.delete("/api/opportunities/:opportunityId", opportunitiesRoute.deleteOpportunity);

router.post("/api/opportunities/:opportunityId/apply", applicationsRoute.applyToOpportunity);
router.get("/api/opportunities/:opportunityId/applicants", applicationsRoute.listApplicants);
router.get("/api/student/applications", applicationsRoute.listMyApplications);
router.get("/api/student/applications/:applicationId", applicationsRoute.getMyApplication);
router.put("/api/industry/applications/:applicationId/status", applicationsRoute.updateApplicationStatus);

router.get("/api/student/opportunities/matches", opportunityMatchingRoute.getRankedMatches);
router.get("/api/student/opportunities/:opportunityId/match", opportunityMatchingRoute.getMatch);

router.get("/api/student/learning-recommendations", learningRecommendationsRoute.getRecommendations);

router.get("/api/institution/analytics", institutionAnalyticsRoute.getAnalytics);

router.get("/api/academician/analytics", academicianAnalyticsRoute.getAnalytics);

router.get("/api/industry/candidates", candidatesRoute.searchCandidates);
router.get("/api/industry/candidates/:candidateId", candidatesRoute.getCandidateDetail);

router.get("/api/mentorship/mentors", mentorshipRoute.getMentors);
router.post("/api/mentorship/requests", mentorshipRoute.createRequest);
router.get("/api/mentorship/student/requests", mentorshipRoute.getStudentRequests);
router.get("/api/mentorship/academician/requests", mentorshipRoute.getAcademicianRequests);
router.put("/api/mentorship/requests/:requestId/status", mentorshipRoute.updateRequestStatus);
router.put("/api/mentorship/requests/:requestId/cancel", mentorshipRoute.cancelRequest);
router.get("/api/mentorship/student/needs", mentorshipRoute.getStudentNeeds);

router.get("/api/industry-projects", industryProjectsRoute.listProjects);
router.post("/api/industry-projects", industryProjectsRoute.createProject);
router.get("/api/industry-projects/:projectId", industryProjectsRoute.getProject);
router.put("/api/industry-projects/:projectId", industryProjectsRoute.updateProject);
router.delete("/api/industry-projects/:projectId", industryProjectsRoute.deleteProject);
router.post("/api/industry-projects/:projectId/apply", industryProjectsRoute.applyToProject);
router.get("/api/industry-projects/:projectId/applicants", industryProjectsRoute.listApplicants);
router.put("/api/industry-projects/:projectId/applicants/:applicationId/status", industryProjectsRoute.updateApplicantStatus);

router.get("/api/problem-statements", problemStatementsRoute.listProblems);
router.post("/api/problem-statements", problemStatementsRoute.createProblem);
router.get("/api/problem-statements/:problemId", problemStatementsRoute.getProblem);
router.put("/api/problem-statements/:problemId", problemStatementsRoute.updateProblem);
router.delete("/api/problem-statements/:problemId", problemStatementsRoute.deleteProblem);
router.post("/api/problem-statements/:problemId/interest", problemStatementsRoute.expressInterest);
router.get("/api/problem-statements/:problemId/participants", problemStatementsRoute.listParticipants);
router.put("/api/problem-statements/:problemId/participants/:participantId/status", problemStatementsRoute.updateParticipantStatus);
router.get("/api/student/problem-statements", problemStatementsRoute.getStudentParticipation);

router.get("/api/notifications", notificationsRoute.listNotifications);
router.get("/api/notifications/unread-count", notificationsRoute.getUnreadCount);
router.get("/api/notifications/:notificationId", notificationsRoute.getNotification);
router.put("/api/notifications/:notificationId/read", notificationsRoute.markRead);
router.put("/api/notifications/read-all", notificationsRoute.markAllRead);

router.get("/api/admin/overview", adminRoute.getOverview);
router.get("/api/admin/users", adminRoute.listUsers);
router.get("/api/admin/users/:userId", adminRoute.getUser);
router.put("/api/admin/users/:userId/status", adminRoute.updateUserStatus);
router.get("/api/admin/content", adminRoute.listContent);
router.put("/api/admin/content/:contentType/:contentId/status", adminRoute.moderateContent);
router.get("/api/admin/audit", adminRoute.getAudit);

router.get("/api/linkedin/connect", linkedinRoute.connect);
router.get("/api/linkedin/callback", linkedinRoute.callback);
router.get("/api/linkedin/status", linkedinRoute.status);
router.post("/api/linkedin/disconnect", linkedinRoute.disconnect);

router.post("/api/assistant/chat", assistantRoute.chat);

router.post("/api/student/resume/generate", resumeRoute.generateResume);
router.get("/api/student/resume", resumeRoute.getMyResume);
router.put("/api/student/resume", resumeRoute.saveMyResume);
router.get("/api/industry/students/:studentId/resume", resumeRoute.getResumeForIndustry);

const server = http.createServer(async (req, res) => {
  // Step 20: minimal, safe security headers — no middleware dependency.
  // CSP is deliberately omitted: this API only ever returns JSON, never
  // HTML, so there's no markup for a CSP to protect and adding one
  // risks breaking something for no benefit.
  res.setHeader("X-Content-Type-Options", "nosniff");

  const origin = req.headers.origin;
  if (isAllowedOrigin(origin)) {
    // A specific origin (never "*") is required for the browser to
    // accept credentialed (cookie-carrying) requests.
    if (origin) res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  } else {
    logger.warn(`Blocked CORS request from origin: ${origin}`);
  }
  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

  const url = new URL(req.url, `http://${req.headers.host}`);
  const query = Object.fromEntries(url.searchParams.entries());

  const cookies = parseCookies(req);
  const sessionToken = cookies["aisb_session"] || null;
  const sessionUser = sessionToken ? sessions.findUserByToken(sessionToken) : null;

  logger.debug(`${req.method} ${url.pathname}`);
  const match = router.match(req.method, url.pathname);

  const ctx = {
    query,
    params: match ? match.params : {},
    logger,
    sessionToken,
    user: sessionUser,
    sendJson(status, body) {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(body));
    },
  };

  if (!match) { ctx.sendJson(404, { error: "Not found" }); return; }

  // Step 19: a suspended user's session is still valid (findUserByToken
  // doesn't check status), but they must lose normal authenticated API
  // access — logout stays reachable so they can clear their own
  // session; every other route is blocked with a plain, safe message
  // that reveals nothing about why beyond the fact of suspension.
  if (sessionUser && sessionUser.status === "Suspended" && url.pathname !== "/" && match.handler !== authRoute.logout) {
    ctx.sendJson(403, { error: "Account suspended." });
    return;
  }

  try {
    await match.handler(req, res, ctx);
  } catch (err) {
    logger.error("Unhandled error:", err.message);
    const isProd = (process.env.NODE_ENV || "development") === "production";
    ctx.sendJson(500, { error: "Internal server error", detail: isProd ? undefined : err.message });
  }
});

server.listen(PORT, () => {
  logger.info(`Academia-Industry Portal API listening on http://localhost:${PORT}`);
  logger.info(`Demo mode: ${String(process.env.DEMO_MODE || "true") === "true" ? "ON (mock data)" : "OFF (live providers)"}`);
  logger.info(`Allowed CORS origins: any localhost/127.0.0.1 origin (dev)${configuredOrigins.length ? `, plus: ${configuredOrigins.join(", ")}` : ""}`);
  sessions.pruneExpired();
});

// Sweep expired sessions periodically so the table doesn't grow unbounded.
setInterval(() => sessions.pruneExpired(), 60 * 60 * 1000).unref();

module.exports = server;
