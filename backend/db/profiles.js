/*
 * db/profiles.js — SQLite-backed student profile store (one row per
 * student user). Foundation for eventually replacing the localStorage
 * "profile" fields in js/storage.js.
 */

const { db } = require("./database");

function findByUserId(userId) {
  return db.prepare("SELECT * FROM student_profiles WHERE user_id = ?").get(userId);
}

function upsert(userId, { phone, college, department, year, bio, location, resumeUrl } = {}) {
  const existing = findByUserId(userId);
  if (existing) {
    db.prepare(
      `UPDATE student_profiles SET
         phone = ?, college = ?, department = ?, year = ?, bio = ?, location = ?, resume_url = ?,
         updated_at = datetime('now')
       WHERE user_id = ?`
    ).run(phone ?? existing.phone, college ?? existing.college, department ?? existing.department,
      year ?? existing.year, bio ?? existing.bio, location ?? existing.location,
      resumeUrl ?? existing.resume_url, userId);
  } else {
    db.prepare(
      `INSERT INTO student_profiles (user_id, phone, college, department, year, bio, location, resume_url)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(userId, phone, college, department, year, bio, location, resumeUrl);
  }
  return findByUserId(userId);
}

module.exports = { findByUserId, upsert };
