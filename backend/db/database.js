/*
 * db/database.js — SQLite persistence for users, sessions, and
 * per-user LinkedIn OAuth tokens.
 *
 * Uses Node's built-in `node:sqlite` (stable since Node 22.5) so the
 * backend stays dependency-free — no better-sqlite3/sqlite3 install
 * required. See backend/package.json "engines" for the minimum
 * Node version this requires.
 */

const path = require("path");
const fs = require("fs");
const { DatabaseSync } = require("node:sqlite");

const DB_PATH = process.env.DB_PATH || path.join(__dirname, "..", "data", "app.db");
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec("PRAGMA foreign_keys = ON;");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT NOT NULL,
    email         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role          TEXT NOT NULL,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token      TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);

  CREATE TABLE IF NOT EXISTS linkedin_tokens (
    user_id       INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    access_token  TEXT NOT NULL,
    refresh_token TEXT,
    scope         TEXT,
    expires_at    TEXT,
    connected_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS linkedin_oauth_state (
    state      TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- ---- Student profile (one row per student user) ----
  CREATE TABLE IF NOT EXISTS student_profiles (
    user_id      INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    phone        TEXT,
    college      TEXT,
    department   TEXT,
    year         TEXT,
    bio          TEXT,
    location     TEXT,
    resume_url   TEXT,
    created_at   TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- ---- Student skills (many rows per student) ----
  CREATE TABLE IF NOT EXISTS student_skills (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    skill_name    TEXT NOT NULL,
    category      TEXT,
    proficiency   TEXT,
    years_experience REAL,
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (user_id, skill_name)
  );
  CREATE INDEX IF NOT EXISTS idx_student_skills_user_id ON student_skills(user_id);

  -- ---- Student projects (many rows per student) ----
  CREATE TABLE IF NOT EXISTS student_projects (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title        TEXT NOT NULL,
    description  TEXT,
    technologies TEXT,
    project_url  TEXT,
    created_at   TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_student_projects_user_id ON student_projects(user_id);

  -- ---- Opportunities posted by industry users ----
  CREATE TABLE IF NOT EXISTS opportunities (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    industry_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title            TEXT NOT NULL,
    description      TEXT,
    opportunity_type TEXT,
    required_skills  TEXT,
    location         TEXT,
    duration         TEXT,
    stipend          TEXT,
    status           TEXT NOT NULL DEFAULT 'open',
    created_at       TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_opportunities_industry_user_id ON opportunities(industry_user_id);
  CREATE INDEX IF NOT EXISTS idx_opportunities_status ON opportunities(status);

  -- ---- Student applications to opportunities ----
  CREATE TABLE IF NOT EXISTS applications (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    student_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    opportunity_id  INTEGER NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
    status          TEXT NOT NULL DEFAULT 'submitted',
    cover_message   TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (student_user_id, opportunity_id)
  );
  CREATE INDEX IF NOT EXISTS idx_applications_student_user_id ON applications(student_user_id);
  CREATE INDEX IF NOT EXISTS idx_applications_opportunity_id ON applications(opportunity_id);

  -- ---- Learning progress per student, per resource ----
  CREATE TABLE IF NOT EXISTS learning_progress (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    student_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    resource_id     TEXT NOT NULL,
    progress        INTEGER NOT NULL DEFAULT 0,
    completed       INTEGER NOT NULL DEFAULT 0,
    started_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
    completed_at    TEXT,
    UNIQUE (student_user_id, resource_id)
  );
  CREATE INDEX IF NOT EXISTS idx_learning_progress_student_user_id ON learning_progress(student_user_id);

  -- ---- Assessments taken by a student ----
  CREATE TABLE IF NOT EXISTS assessments (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    student_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    assessment_type TEXT,
    score           REAL,
    completed_at    TEXT NOT NULL DEFAULT (datetime('now')),
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_assessments_student_user_id ON assessments(student_user_id);

  -- ---- Per-skill results belonging to one assessment ----
  CREATE TABLE IF NOT EXISTS skill_assessment_results (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    assessment_id INTEGER NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
    skill_name    TEXT NOT NULL,
    score         REAL,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_skill_assessment_results_assessment_id ON skill_assessment_results(assessment_id);
`);

// ---- Step 9: additive columns on `opportunities` ----
// The existing frontend opportunity browse/detail/matching UI
// (js/opportunities.js, js/industry.js) reads domain/mode/experience/
// preferred_skills/company on every opportunity — without these,
// real backend-created opportunities would render with blank/undefined
// fields in that unchanged UI. Added via idempotent ALTER TABLE (safe
// to run on every startup, no data loss, no new table) rather than at
// CREATE TABLE time, since the table may already exist from Step 2.
function columnExists(table, column) {
  return db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === column);
}
for (const [column, ddlType] of [
  ["domain", "TEXT"], ["mode", "TEXT"], ["experience", "TEXT"],
  ["preferred_skills", "TEXT"], ["company", "TEXT"],
]) {
  if (!columnExists("opportunities", column)) {
    db.exec(`ALTER TABLE opportunities ADD COLUMN ${column} ${ddlType}`);
  }
}

// ---- Step 16: additive columns on `opportunities` for Industry Live
// Projects (opportunity_type = 'Industry Project'). No new table —
// see backend/services/industryProjectService.js for why reusing
// `opportunities`/`applications` is safe here. `capacity`/`deadline`
// are the only genuinely new concepts; both nullable so every
// existing (non-project) opportunity row is unaffected.
for (const [column, ddlType] of [["capacity", "INTEGER"], ["deadline", "TEXT"]]) {
  if (!columnExists("opportunities", column)) {
    db.exec(`ALTER TABLE opportunities ADD COLUMN ${column} ${ddlType}`);
  }
}

// ---- Step 15: mentorship requests (Student <-> Academician) ----
// A new table (none of this existed before) — no duplication of
// user/profile data, just the relationship + status.
db.exec(`
  CREATE TABLE IF NOT EXISTS mentorship_requests (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    academician_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status         TEXT NOT NULL DEFAULT 'Pending',
    message        TEXT,
    created_at     TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_mentorship_requests_student_id ON mentorship_requests(student_id);
  CREATE INDEX IF NOT EXISTS idx_mentorship_requests_academician_id ON mentorship_requests(academician_id);
`);

// ---- Step 17: Industry Problem Statements + participation ----
// New tables: problem statements have problem_category/industry_context/
// expected_outcome/team_size, none of which have any analog on
// `opportunities` (unlike Step 16's Live Projects, which fit that
// table exactly) — bolting them on would conflate two different
// first-class concepts in one table. Participation can't safely reuse
// `applications` either: applications.opportunity_id is NOT NULL with
// a hard foreign key to opportunities(id), so repointing it at a
// second parent table would weaken an existing constraint relied on
// by Steps 9/16. Hence two new tables, as this step's fallback path
// anticipated.
db.exec(`
  CREATE TABLE IF NOT EXISTS industry_problem_statements (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    industry_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title             TEXT NOT NULL,
    description       TEXT,
    problem_category  TEXT,
    domain            TEXT,
    industry_context  TEXT,
    expected_outcome  TEXT,
    required_skills   TEXT,
    preferred_skills  TEXT,
    team_size         INTEGER,
    mode              TEXT,
    duration          TEXT,
    status            TEXT NOT NULL DEFAULT 'Open',
    deadline          TEXT,
    created_at        TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_problem_statements_industry_id ON industry_problem_statements(industry_id);
  CREATE INDEX IF NOT EXISTS idx_problem_statements_status ON industry_problem_statements(status);

  CREATE TABLE IF NOT EXISTS problem_statement_participants (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    problem_statement_id  INTEGER NOT NULL REFERENCES industry_problem_statements(id) ON DELETE CASCADE,
    student_id            INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status                TEXT NOT NULL DEFAULT 'Interested',
    message               TEXT,
    created_at            TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at            TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (problem_statement_id, student_id)
  );
  CREATE INDEX IF NOT EXISTS idx_psp_problem_statement_id ON problem_statement_participants(problem_statement_id);
  CREATE INDEX IF NOT EXISTS idx_psp_student_id ON problem_statement_participants(student_id);
`);

// ---- Step 18: notifications ----
// A new table (no notification system existed before). One row per
// event; entity_type/entity_id are a loose pointer (no FK — the
// pointed-at row can legitimately be deleted later, e.g. an
// opportunity/project/problem statement removed by its owner, and a
// notification about it should still be readable as history).
db.exec(`
  CREATE TABLE IF NOT EXISTS notifications (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type         TEXT NOT NULL,
    title        TEXT NOT NULL,
    message      TEXT,
    entity_type  TEXT,
    entity_id    INTEGER,
    is_read      INTEGER NOT NULL DEFAULT 0,
    created_at   TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
  CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);
  CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at);
`);

// ---- Step 19: Admin / Platform Management ----
// `status` is additive/nullable-with-default so every existing user
// row is unaffected; no CHECK constraint (SQLite's `role` column
// already has none) — enforcement happens in application code, same
// as the existing role vocabulary.
if (!columnExists("users", "status")) {
  db.exec("ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'Active'");
}

// New table — no admin/audit system existed before this step.
db.exec(`
  CREATE TABLE IF NOT EXISTS admin_audit_logs (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    admin_id     INTEGER NOT NULL REFERENCES users(id),
    action       TEXT NOT NULL,
    entity_type  TEXT,
    entity_id    INTEGER,
    details      TEXT,
    created_at   TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_admin_id ON admin_audit_logs(admin_id);
  CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_created_at ON admin_audit_logs(created_at);
`);

// ---- Certifications + skill provenance ----
// `source` on student_skills tells a certification-cleanup delete
// apart from a manually-added skill: 'certification' means the row
// was created solely because a certificate claimed that skill, so it
// is safe to remove when the last certification backing it is
// deleted; anything else (including every pre-existing row, backed
// into 'manual' by this ALTER's DEFAULT) must never be auto-removed.
// See backend/routes/certifications.js deleteCertification.
if (!columnExists("student_skills", "source")) {
  db.exec("ALTER TABLE student_skills ADD COLUMN source TEXT NOT NULL DEFAULT 'manual'");
}

// New tables — certificates are stored on disk (backend/services/
// certificateStorage.js), never as blobs in SQLite; only the file's
// relative path is kept here. certification_skills is the many-to-many
// link between one certification and the skill names it demonstrates.
db.exec(`
  CREATE TABLE IF NOT EXISTS student_certifications (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id             INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name                TEXT NOT NULL,
    organization        TEXT,
    issue_date          TEXT,
    certificate_url     TEXT,
    file_path           TEXT,
    file_type           TEXT,
    file_original_name  TEXT,
    created_at          TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_student_certifications_user_id ON student_certifications(user_id);

  CREATE TABLE IF NOT EXISTS certification_skills (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    certification_id  INTEGER NOT NULL REFERENCES student_certifications(id) ON DELETE CASCADE,
    skill_name        TEXT NOT NULL,
    created_at        TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (certification_id, skill_name)
  );
  CREATE INDEX IF NOT EXISTS idx_certification_skills_certification_id ON certification_skills(certification_id);
  CREATE INDEX IF NOT EXISTS idx_certification_skills_skill_name ON certification_skills(skill_name);
`);

// ---- AI-Powered Resume Builder ----
// One resume per student (UNIQUE user_id) — "Save Resume" always
// replaces the student's single resume rather than versioning it,
// matching how the frontend always edits "my resume" as one document.
// `content_json` holds the editable sections (projects/experience/
// achievements bullets, etc.) as a JSON-stringified object — the same
// established pattern as opportunities.required_skills/preferred_skills
// — because these are free-form, student-edited lists with no need for
// their own relational table. `visibility` gates backend/routes/
// resume.js's industry-facing endpoint; 'private' is the default so a
// resume is never visible to Industry until the student opts in.
db.exec(`
  CREATE TABLE IF NOT EXISTS student_resumes (
    user_id       INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    target_role   TEXT,
    template      TEXT NOT NULL DEFAULT 'modern',
    visibility    TEXT NOT NULL DEFAULT 'private',
    summary       TEXT,
    content_json  TEXT NOT NULL DEFAULT '{}',
    ai_generated  INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

module.exports = { db, DB_PATH };
