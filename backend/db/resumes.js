/*
 * db/resumes.js — SQLite-backed student resume store (one row per
 * student user, see student_resumes in backend/db/database.js).
 * `content_json` is parsed/stringified here so callers (backend/
 * routes/resume.js) always work with a plain object.
 */

const { db } = require("./database");

function parseRow(row) {
  if (!row) return null;
  let content = {};
  try { content = JSON.parse(row.content_json || "{}"); } catch { content = {}; }
  return { ...row, content };
}

function findByUserId(userId) {
  return parseRow(db.prepare("SELECT * FROM student_resumes WHERE user_id = ?").get(userId));
}

function upsert(userId, { targetRole, template, visibility, summary, content, aiGenerated } = {}) {
  const existing = db.prepare("SELECT * FROM student_resumes WHERE user_id = ?").get(userId);
  const contentJson = JSON.stringify(content ?? (existing ? JSON.parse(existing.content_json || "{}") : {}));
  if (existing) {
    db.prepare(
      `UPDATE student_resumes SET
         target_role = ?, template = ?, visibility = ?, summary = ?, content_json = ?,
         ai_generated = ?, updated_at = datetime('now')
       WHERE user_id = ?`
    ).run(
      targetRole !== undefined ? targetRole : existing.target_role,
      template || existing.template,
      visibility || existing.visibility,
      summary !== undefined ? summary : existing.summary,
      contentJson,
      aiGenerated !== undefined ? (aiGenerated ? 1 : 0) : existing.ai_generated,
      userId
    );
  } else {
    db.prepare(
      `INSERT INTO student_resumes (user_id, target_role, template, visibility, summary, content_json, ai_generated)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(userId, targetRole || null, template || "modern", visibility || "private", summary || null, contentJson, aiGenerated ? 1 : 0);
  }
  return findByUserId(userId);
}

function setVisibility(userId, visibility) {
  const existing = db.prepare("SELECT * FROM student_resumes WHERE user_id = ?").get(userId);
  if (!existing) return null;
  db.prepare("UPDATE student_resumes SET visibility = ?, updated_at = datetime('now') WHERE user_id = ?").run(visibility, userId);
  return findByUserId(userId);
}

module.exports = { findByUserId, upsert, setVisibility };
