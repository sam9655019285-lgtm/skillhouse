/*
 * services/adminService.js — Admin / Platform Management (Step 19).
 * Reuses the shared `db` connection directly for cross-user aggregate
 * queries, same architecture as Steps 12/13's analytics services —
 * this is a distinct platform-wide concern the per-user db/*.js
 * modules were never meant to expose. Reuses Step 18's
 * notificationService for the two moderation notifications, and
 * db/adminAudit.js for action logging. No duplicate analytics engine.
 *
 * EMAIL EXPOSURE NOTE: the bulk user list never returns email. The
 * single-user detail view does — justified because an Admin
 * legitimately needs to identify/contact a specific account during
 * moderation (e.g. confirming identity before suspending), and this
 * codebase already treats student email as visible to a
 * legitimately-privileged actor in an analogous case (Step 9's
 * applicant view exposes `studentEmail` to the opportunity's owner).
 * Never exposed: password, password_hash, session tokens, LinkedIn tokens.
 */

const { db } = require("../db/database");
const adminAuditDb = require("../db/adminAudit");
const notificationService = require("./notificationService");

const PROJECT_TYPE = "Industry Project"; // same sentinel Step 16 uses
const USER_STATUSES = ["Active", "Suspended"];
const CONTENT_STATUSES = {
  opportunity: ["Active", "Closed"],
  "live-project": ["Open", "In Progress", "Completed", "Closed"],
  "problem-statement": ["Open", "In Progress", "Completed", "Closed"],
};

// ---- Overview (real DB counts only) ----
function getOverview() {
  const usersByRole = db.prepare("SELECT role, COUNT(*) AS c FROM users GROUP BY role").all()
    .reduce((acc, r) => ({ ...acc, [r.role]: r.c }), {});
  const totalUsers = db.prepare("SELECT COUNT(*) AS c FROM users").get().c;

  const studentsWithProfiles = db.prepare("SELECT COUNT(DISTINCT user_id) AS c FROM student_profiles").get().c;
  const studentsWithSkills = db.prepare("SELECT COUNT(DISTINCT user_id) AS c FROM student_skills").get().c;
  const totalSkillRecords = db.prepare("SELECT COUNT(*) AS c FROM student_skills").get().c;

  const assessmentSummary = db.prepare("SELECT COUNT(*) AS c, AVG(score) AS avg FROM assessments").get();

  const totalOpportunities = db.prepare("SELECT COUNT(*) AS c FROM opportunities WHERE opportunity_type != ? OR opportunity_type IS NULL").get(PROJECT_TYPE).c;
  const activeOpportunities = db.prepare("SELECT COUNT(*) AS c FROM opportunities WHERE (opportunity_type != ? OR opportunity_type IS NULL) AND status = 'Active'").get(PROJECT_TYPE).c;
  const totalLiveProjects = db.prepare("SELECT COUNT(*) AS c FROM opportunities WHERE opportunity_type = ?").get(PROJECT_TYPE).c;
  const openLiveProjects = db.prepare("SELECT COUNT(*) AS c FROM opportunities WHERE opportunity_type = ? AND status = 'Open'").get(PROJECT_TYPE).c;

  const totalProblemStatements = db.prepare("SELECT COUNT(*) AS c FROM industry_problem_statements").get().c;
  const openProblemStatements = db.prepare("SELECT COUNT(*) AS c FROM industry_problem_statements WHERE status = 'Open'").get().c;

  const totalApplications = db.prepare("SELECT COUNT(*) AS c FROM applications").get().c;
  const applicationStatusDistribution = db.prepare("SELECT status, COUNT(*) AS c FROM applications GROUP BY status")
    .all().map((r) => ({ status: r.status, count: r.c }));

  const totalMentorshipRequests = db.prepare("SELECT COUNT(*) AS c FROM mentorship_requests").get().c;
  const pendingMentorshipRequests = db.prepare("SELECT COUNT(*) AS c FROM mentorship_requests WHERE status = 'Pending'").get().c;
  const acceptedMentorshipRequests = db.prepare("SELECT COUNT(*) AS c FROM mentorship_requests WHERE status = 'Accepted'").get().c;

  const totalNotifications = db.prepare("SELECT COUNT(*) AS c FROM notifications").get().c;
  const unreadNotifications = db.prepare("SELECT COUNT(*) AS c FROM notifications WHERE is_read = 0").get().c;

  return {
    generatedAt: new Date().toISOString(),
    users: {
      total: totalUsers,
      students: usersByRole.Student || 0, industries: usersByRole.Industry || 0,
      academicians: usersByRole.Academician || 0, institutions: usersByRole.Institution || 0,
      admins: usersByRole.Admin || 0,
    },
    profiles: { studentsWithProfiles, studentsWithoutProfiles: (usersByRole.Student || 0) - studentsWithProfiles },
    skills: { studentsWithSkills, totalSkillRecords },
    assessments: { completed: assessmentSummary.c, averageScore: assessmentSummary.avg !== null ? Math.round(assessmentSummary.avg) : null },
    opportunities: { total: totalOpportunities, active: activeOpportunities },
    liveProjects: { total: totalLiveProjects, open: openLiveProjects },
    problemStatements: { total: totalProblemStatements, open: openProblemStatements },
    applications: { total: totalApplications, statusDistribution: applicationStatusDistribution },
    mentorship: { total: totalMentorshipRequests, pending: pendingMentorshipRequests, accepted: acceptedMentorshipRequests },
    notifications: { total: totalNotifications, unread: unreadNotifications },
  };
}

// ---- User management ----
function listUsers({ role, search, status } = {}) {
  const clauses = [];
  const params = [];
  if (role) { clauses.push("role = ?"); params.push(role); }
  if (status) { clauses.push("status = ?"); params.push(status); }
  if (search) { clauses.push("name LIKE ?"); params.push(`%${search}%`); }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const rows = db.prepare(`SELECT id, name, role, status, created_at FROM users ${where} ORDER BY created_at DESC`).all(...params);

  // Profile-completeness is cheap enough to compute per row here (admin
  // lists are not expected to be huge in this project's scale).
  return rows.map((u) => {
    let profileComplete = null;
    if (u.role === "Student") {
      profileComplete = !!db.prepare("SELECT 1 FROM student_profiles WHERE user_id = ?").get(u.id);
    }
    return { id: u.id, name: u.name, role: u.role, status: u.status, createdAt: u.created_at, profileComplete };
  });
}

function getUserDetail(id) {
  const user = db.prepare("SELECT id, name, email, role, status, created_at FROM users WHERE id = ?").get(id);
  if (!user) return null;
  const base = { id: user.id, name: user.name, email: user.email, role: user.role, status: user.status, createdAt: user.created_at };

  if (user.role === "Student") {
    const profile = db.prepare("SELECT department, college, year FROM student_profiles WHERE user_id = ?").get(id) || {};
    return {
      ...base,
      department: profile.department || null, college: profile.college || null, year: profile.year || null,
      skillsCount: db.prepare("SELECT COUNT(*) AS c FROM student_skills WHERE user_id = ?").get(id).c,
      projectsCount: db.prepare("SELECT COUNT(*) AS c FROM student_projects WHERE user_id = ?").get(id).c,
      assessmentsCount: db.prepare("SELECT COUNT(*) AS c FROM assessments WHERE student_user_id = ?").get(id).c,
      applicationsCount: db.prepare("SELECT COUNT(*) AS c FROM applications WHERE student_user_id = ?").get(id).c,
    };
  }
  if (user.role === "Industry") {
    return {
      ...base,
      opportunitiesCount: db.prepare("SELECT COUNT(*) AS c FROM opportunities WHERE industry_user_id = ? AND (opportunity_type != ? OR opportunity_type IS NULL)").get(id, PROJECT_TYPE).c,
      liveProjectsCount: db.prepare("SELECT COUNT(*) AS c FROM opportunities WHERE industry_user_id = ? AND opportunity_type = ?").get(id, PROJECT_TYPE).c,
      problemStatementsCount: db.prepare("SELECT COUNT(*) AS c FROM industry_problem_statements WHERE industry_id = ?").get(id).c,
      applicationsReceivedCount: db.prepare(
        "SELECT COUNT(*) AS c FROM applications a JOIN opportunities o ON o.id = a.opportunity_id WHERE o.industry_user_id = ?"
      ).get(id).c,
    };
  }
  if (user.role === "Academician") {
    return { ...base, mentorshipRequestsCount: db.prepare("SELECT COUNT(*) AS c FROM mentorship_requests WHERE academician_id = ?").get(id).c };
  }
  // Institution/Admin: base info only — Institution has no owned
  // entities in this schema (its dashboard is aggregate-analytics
  // only, per Step 12's own findings); nothing further to add safely.
  return base;
}

function updateUserStatus(adminId, targetUserId, newStatus) {
  if (!USER_STATUSES.includes(newStatus)) return { error: "invalid_status" };
  if (targetUserId === adminId) return { error: "cannot_modify_self" };
  const target = db.prepare("SELECT id, name, status FROM users WHERE id = ?").get(targetUserId);
  if (!target) return { error: "not_found" };

  db.prepare("UPDATE users SET status = ? WHERE id = ?").run(newStatus, targetUserId);

  adminAuditDb.record(adminId, {
    action: newStatus === "Suspended" ? "USER_SUSPENDED" : "USER_ACTIVATED",
    entityType: "user", entityId: targetUserId, details: `${target.name} -> ${newStatus}`,
  });

  try {
    if (newStatus === "Suspended") {
      notificationService.notify(targetUserId, {
        type: "ACCOUNT_STATUS", title: "Your account has been suspended",
        message: "An administrator has suspended your account. Contact support if you believe this is a mistake.",
        entityType: "user", entityId: targetUserId,
      });
    } else {
      notificationService.notify(targetUserId, {
        type: "ACCOUNT_STATUS", title: "Your account has been reactivated",
        message: "An administrator has reactivated your account.",
        entityType: "user", entityId: targetUserId,
      });
    }
  } catch { /* notification failure must never affect the moderation action */ }

  return { user: { id: targetUserId, status: newStatus } };
}

// ---- Content moderation ----
function listContent(type) {
  if (type === "opportunity") {
    return db.prepare(
      `SELECT o.id, o.title, o.status, o.created_at, u.name AS owner_name
       FROM opportunities o JOIN users u ON u.id = o.industry_user_id
       WHERE o.opportunity_type != ? OR o.opportunity_type IS NULL ORDER BY o.created_at DESC`
    ).all(PROJECT_TYPE).map(toContentShape);
  }
  if (type === "live-project") {
    return db.prepare(
      `SELECT o.id, o.title, o.status, o.created_at, u.name AS owner_name
       FROM opportunities o JOIN users u ON u.id = o.industry_user_id
       WHERE o.opportunity_type = ? ORDER BY o.created_at DESC`
    ).all(PROJECT_TYPE).map(toContentShape);
  }
  if (type === "problem-statement") {
    return db.prepare(
      `SELECT p.id, p.title, p.status, p.created_at, u.name AS owner_name
       FROM industry_problem_statements p JOIN users u ON u.id = p.industry_id
       ORDER BY p.created_at DESC`
    ).all().map(toContentShape);
  }
  return null;
}

function toContentShape(row) {
  return { id: row.id, title: row.title, status: row.status, createdAt: row.created_at, ownerName: row.owner_name };
}

// Moderation bypasses the normal ownership check (that's the explicit
// admin permission this step grants) but still only ever sets the
// same `status` column/vocabulary the owner's own routes use — no
// second moderation flag, no new state machine.
function moderateContent(adminId, type, id, newStatus) {
  const allowed = CONTENT_STATUSES[type];
  if (!allowed) return { error: "invalid_type" };
  if (!allowed.includes(newStatus)) return { error: "invalid_status" };

  let table, ownerColumn, ownerId, title;
  if (type === "opportunity" || type === "live-project") {
    const row = db.prepare("SELECT * FROM opportunities WHERE id = ?").get(id);
    const isProject = row && row.opportunity_type === PROJECT_TYPE;
    if (!row || (type === "live-project") !== isProject) return { error: "not_found" };
    table = "opportunities"; ownerId = row.industry_user_id; title = row.title;
  } else {
    const row = db.prepare("SELECT * FROM industry_problem_statements WHERE id = ?").get(id);
    if (!row) return { error: "not_found" };
    table = "industry_problem_statements"; ownerId = row.industry_id; title = row.title;
  }

  db.prepare(`UPDATE ${table} SET status = ?, updated_at = datetime('now') WHERE id = ?`).run(newStatus, id);

  const actionMap = { opportunity: "OPPORTUNITY_CLOSED", "live-project": "LIVE_PROJECT_CLOSED", "problem-statement": "PROBLEM_STATEMENT_CLOSED" };
  adminAuditDb.record(adminId, {
    action: newStatus === "Closed" ? actionMap[type] : `${actionMap[type].replace("_CLOSED", "")}_STATUS_CHANGED`,
    entityType: type, entityId: id, details: `"${title}" -> ${newStatus}`,
  });

  try {
    notificationService.notify(ownerId, {
      type: "CONTENT_MODERATED", title: `Your ${type.replace("-", " ")} status was changed by an administrator`,
      message: `"${title}" is now ${newStatus}.`,
      entityType: type, entityId: id,
    });
  } catch { /* notification failure must never affect the moderation action */ }

  return { ok: true };
}

// ---- Audit ----
function getAuditLog({ limit } = {}) {
  return adminAuditDb.list({ limit }).map((row) => ({
    id: row.id, adminId: row.admin_id, action: row.action,
    entityType: row.entity_type, entityId: row.entity_id, details: row.details, createdAt: row.created_at,
  }));
}

module.exports = {
  USER_STATUSES, CONTENT_STATUSES,
  getOverview, listUsers, getUserDetail, updateUserStatus,
  listContent, moderateContent, getAuditLog,
};
