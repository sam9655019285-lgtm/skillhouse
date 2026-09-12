/*
 * db/certifications.js — SQLite-backed student certifications store
 * (student_certifications) plus the certification <-> skill_name
 * many-to-many link (certification_skills). See backend/routes/
 * certifications.js for how deleting a certification only removes a
 * My Skills entry when no other certification still backs it and it
 * wasn't added manually.
 */

const { db } = require("./database");

function listByUserId(userId) {
  return db.prepare("SELECT * FROM student_certifications WHERE user_id = ? ORDER BY created_at DESC").all(userId);
}

function findById(id) {
  return db.prepare("SELECT * FROM student_certifications WHERE id = ?").get(id);
}

function create(userId, { name, organization, issueDate, certificateUrl, filePath, fileType, fileOriginalName } = {}) {
  const result = db.prepare(
    `INSERT INTO student_certifications (user_id, name, organization, issue_date, certificate_url, file_path, file_type, file_original_name)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(userId, name, organization ?? null, issueDate ?? null, certificateUrl ?? null, filePath ?? null, fileType ?? null, fileOriginalName ?? null);
  return findById(Number(result.lastInsertRowid));
}

// Only fields explicitly present in `fields` (not `undefined`) are
// changed — lets the route omit file_path/file_type/file_original_name
// entirely when the student didn't replace the file on this edit.
function update(userId, certId, fields = {}) {
  const existing = findById(certId);
  if (!existing || existing.user_id !== userId) return null;
  const merged = {
    name: fields.name !== undefined ? fields.name : existing.name,
    organization: fields.organization !== undefined ? fields.organization : existing.organization,
    issue_date: fields.issueDate !== undefined ? fields.issueDate : existing.issue_date,
    certificate_url: fields.certificateUrl !== undefined ? fields.certificateUrl : existing.certificate_url,
    file_path: fields.filePath !== undefined ? fields.filePath : existing.file_path,
    file_type: fields.fileType !== undefined ? fields.fileType : existing.file_type,
    file_original_name: fields.fileOriginalName !== undefined ? fields.fileOriginalName : existing.file_original_name,
  };
  db.prepare(
    `UPDATE student_certifications SET
       name = ?, organization = ?, issue_date = ?, certificate_url = ?,
       file_path = ?, file_type = ?, file_original_name = ?, updated_at = datetime('now')
     WHERE id = ? AND user_id = ?`
  ).run(merged.name, merged.organization, merged.issue_date, merged.certificate_url,
    merged.file_path, merged.file_type, merged.file_original_name, certId, userId);
  return findById(certId);
}

// Returns the deleted row (so the caller can clean up its file and
// skill links) or null if it didn't exist / wasn't this user's.
function remove(userId, certId) {
  const existing = findById(certId);
  if (!existing || existing.user_id !== userId) return null;
  db.prepare("DELETE FROM student_certifications WHERE id = ? AND user_id = ?").run(certId, userId);
  return existing;
}

function listSkillNames(certId) {
  return db.prepare("SELECT skill_name FROM certification_skills WHERE certification_id = ?").all(certId).map((r) => r.skill_name);
}

function replaceSkills(certId, skillNames) {
  db.prepare("DELETE FROM certification_skills WHERE certification_id = ?").run(certId);
  const insert = db.prepare("INSERT OR IGNORE INTO certification_skills (certification_id, skill_name) VALUES (?, ?)");
  for (const name of skillNames) insert.run(certId, name);
}

// How many OTHER certifications belonging to this user still claim
// this skill name — used on delete to decide whether the My Skills
// entry should be removed along with the certification.
function countOtherCertsForSkill(userId, skillName, excludingCertId) {
  const row = db.prepare(
    `SELECT COUNT(*) AS cnt FROM certification_skills cs
     JOIN student_certifications c ON c.id = cs.certification_id
     WHERE c.user_id = ? AND cs.skill_name = ? AND cs.certification_id != ?`
  ).get(userId, skillName, excludingCertId);
  return row.cnt;
}

// Every certification (name only) that currently claims this skill —
// shown in My Skills as "which certification supports this skill".
function listCertNamesForSkill(userId, skillName) {
  return db.prepare(
    `SELECT c.name FROM certification_skills cs
     JOIN student_certifications c ON c.id = cs.certification_id
     WHERE c.user_id = ? AND cs.skill_name = ?
     ORDER BY c.created_at`
  ).all(userId, skillName).map((r) => r.name);
}

module.exports = {
  listByUserId, findById, create, update, remove,
  listSkillNames, replaceSkills, countOtherCertsForSkill, listCertNamesForSkill,
};
