/*
 * db/assessments.js — SQLite-backed skill assessment store: one
 * `assessments` row per attempt, with `skill_assessment_results` rows
 * for the individual per-skill scores within it. Foundation for
 * eventually replacing the localStorage assessment state used by
 * js/engine.js's Assessment module.
 */

const { db } = require("./database");

function findById(id) {
  return db.prepare("SELECT * FROM assessments WHERE id = ?").get(id);
}

function listByStudentUserId(studentUserId) {
  return db.prepare("SELECT * FROM assessments WHERE student_user_id = ? ORDER BY completed_at DESC").all(studentUserId);
}

function getSkillResults(assessmentId) {
  return db.prepare("SELECT * FROM skill_assessment_results WHERE assessment_id = ?").all(assessmentId);
}

function create(studentUserId, { assessmentType, score, skillResults } = {}) {
  const result = db.prepare(
    `INSERT INTO assessments (student_user_id, assessment_type, score) VALUES (?, ?, ?)`
  ).run(studentUserId, assessmentType, score);
  const assessmentId = Number(result.lastInsertRowid);

  if (Array.isArray(skillResults)) {
    const insertResult = db.prepare(
      "INSERT INTO skill_assessment_results (assessment_id, skill_name, score) VALUES (?, ?, ?)"
    );
    for (const r of skillResults) {
      insertResult.run(assessmentId, r.skillName, r.score);
    }
  }

  return { ...findById(assessmentId), skillResults: getSkillResults(assessmentId) };
}

module.exports = { findById, listByStudentUserId, getSkillResults, create };
