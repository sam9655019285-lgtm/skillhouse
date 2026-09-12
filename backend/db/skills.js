/*
 * db/skills.js — SQLite-backed student skills store (many rows per
 * student user). Foundation for eventually replacing the localStorage
 * "skills" list in js/storage.js.
 */

const { db } = require("./database");

function listByUserId(userId) {
  return db.prepare("SELECT * FROM student_skills WHERE user_id = ? ORDER BY skill_name").all(userId);
}

// Used by the My Skills "full replace" PUT (backend/routes/
// studentSkills.js) — a brand-new row is always tagged 'manual' here
// (the student typed/picked it themselves); on conflict the UPDATE
// deliberately leaves `source` untouched so a skill a certificate
// created stays 'certification'-sourced even if it's re-sent as part
// of the student's full skill list (see deleteCertification's cleanup
// logic in routes/certifications.js, which relies on that).
function upsert(userId, { skillName, category, proficiency, yearsExperience } = {}) {
  db.prepare(
    `INSERT INTO student_skills (user_id, skill_name, category, proficiency, years_experience, source)
     VALUES (?, ?, ?, ?, ?, 'manual')
     ON CONFLICT(user_id, skill_name) DO UPDATE SET
       category = excluded.category,
       proficiency = excluded.proficiency,
       years_experience = excluded.years_experience,
       updated_at = datetime('now')`
  ).run(userId, skillName, category, proficiency, yearsExperience);
  return db.prepare("SELECT * FROM student_skills WHERE user_id = ? AND skill_name = ?").get(userId, skillName);
}

// Adds a skill only if the student doesn't already have it — never
// overwrites an existing row's category/proficiency/source. Used when
// a certification is saved with tagged skills (routes/certifications.js)
// so an existing manually-tracked skill is never demoted or altered.
function ensureExists(userId, skillName, category) {
  const existing = findByName(userId, skillName);
  if (existing) return existing;
  db.prepare(
    `INSERT INTO student_skills (user_id, skill_name, category, proficiency, source)
     VALUES (?, ?, ?, NULL, 'certification')`
  ).run(userId, skillName, category || "technical");
  return findByName(userId, skillName);
}

function findByName(userId, skillName) {
  return db.prepare("SELECT * FROM student_skills WHERE user_id = ? AND skill_name = ?").get(userId, skillName);
}

// A skill is safe to auto-delete on certification removal only when
// it exists solely because a certificate created it. Missing/legacy
// rows are treated as manual (never auto-deleted).
function isCertificationSourced(userId, skillName) {
  const row = findByName(userId, skillName);
  return !!row && row.source === "certification";
}

function findById(id) {
  return db.prepare("SELECT * FROM student_skills WHERE id = ?").get(id);
}

// Returns the underlying run() result ({changes, lastInsertRowid}) so
// callers can tell "deleted" apart from "no such skill for this user"
// (changes === 0) without a separate existence check.
function remove(userId, skillId) {
  return db.prepare("DELETE FROM student_skills WHERE id = ? AND user_id = ?").run(skillId, userId);
}

module.exports = { listByUserId, upsert, remove, findById, ensureExists, findByName, isCertificationSourced };
