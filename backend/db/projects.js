/*
 * db/projects.js — SQLite-backed student projects store (many rows
 * per student user). Foundation for eventually replacing the
 * localStorage "projects" list in js/storage.js.
 */

const { db } = require("./database");

function listByUserId(userId) {
  return db.prepare("SELECT * FROM student_projects WHERE user_id = ? ORDER BY created_at DESC").all(userId);
}

function findById(id) {
  return db.prepare("SELECT * FROM student_projects WHERE id = ?").get(id);
}

function create(userId, { title, description, technologies, projectUrl } = {}) {
  const result = db.prepare(
    `INSERT INTO student_projects (user_id, title, description, technologies, project_url)
     VALUES (?, ?, ?, ?, ?)`
  ).run(userId, title, description, technologies, projectUrl);
  return findById(Number(result.lastInsertRowid));
}

function update(userId, projectId, { title, description, technologies, projectUrl } = {}) {
  const existing = findById(projectId);
  if (!existing || existing.user_id !== userId) return null;
  db.prepare(
    `UPDATE student_projects SET
       title = ?, description = ?, technologies = ?, project_url = ?, updated_at = datetime('now')
     WHERE id = ? AND user_id = ?`
  ).run(title ?? existing.title, description ?? existing.description,
    technologies ?? existing.technologies, projectUrl ?? existing.project_url, projectId, userId);
  return findById(projectId);
}

// Returns the underlying run() result ({changes, ...}) so callers can
// tell "deleted" apart from "no such project for this user" without a
// separate existence check (same pattern as db/skills.js remove()).
function remove(userId, projectId) {
  return db.prepare("DELETE FROM student_projects WHERE id = ? AND user_id = ?").run(projectId, userId);
}

module.exports = { listByUserId, findById, create, update, remove };
