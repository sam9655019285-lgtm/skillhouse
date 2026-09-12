/*
 * db/learning.js — SQLite-backed learning progress store, per student
 * per resource. Foundation for eventually replacing the localStorage
 * learning-progress tracking in js/learning.js. `resource_id` matches
 * whatever id the frontend's learning-resource catalog (js/data.js)
 * already uses, so no resources table is needed here.
 */

const { db } = require("./database");

function listByStudentUserId(studentUserId) {
  return db.prepare("SELECT * FROM learning_progress WHERE student_user_id = ? ORDER BY updated_at DESC").all(studentUserId);
}

function upsert(studentUserId, resourceId, { progress, completed } = {}) {
  const isCompleted = completed ? 1 : 0;
  db.prepare(
    `INSERT INTO learning_progress (student_user_id, resource_id, progress, completed, completed_at)
     VALUES (?, ?, ?, ?, CASE WHEN ? = 1 THEN datetime('now') ELSE NULL END)
     ON CONFLICT(student_user_id, resource_id) DO UPDATE SET
       progress = excluded.progress,
       completed = excluded.completed,
       completed_at = CASE WHEN excluded.completed = 1 THEN datetime('now') ELSE learning_progress.completed_at END,
       updated_at = datetime('now')`
  ).run(studentUserId, resourceId, progress ?? 0, isCompleted, isCompleted);
  return db.prepare("SELECT * FROM learning_progress WHERE student_user_id = ? AND resource_id = ?")
    .get(studentUserId, resourceId);
}

module.exports = { listByStudentUserId, upsert };
