/*
 * db/opportunities.js — SQLite-backed opportunities store, posted by
 * industry users. Reused/extended in Step 9 to back the real
 * Opportunities workflow (see routes/opportunities.js), replacing the
 * localStorage "industry_opportunities" key in js/industry.js.
 *
 * `required_skills` / `preferred_skills` are stored as JSON-stringified
 * arrays (the column was already free-form TEXT with nothing written
 * to it before this step, so no legacy format to preserve).
 */

const { db } = require("./database");

function listAll({ status } = {}) {
  if (status) {
    return db.prepare("SELECT * FROM opportunities WHERE status = ? ORDER BY created_at DESC").all(status);
  }
  return db.prepare("SELECT * FROM opportunities ORDER BY created_at DESC").all();
}

function listByIndustryUserId(industryUserId) {
  return db.prepare("SELECT * FROM opportunities WHERE industry_user_id = ? ORDER BY created_at DESC").all(industryUserId);
}

function findById(id) {
  return db.prepare("SELECT * FROM opportunities WHERE id = ?").get(id);
}

function create(industryUserId, {
  title, description, opportunityType, requiredSkills,
  location = null, duration = null, stipend = null,
  domain = null, mode = null, experience = null, preferredSkills, company = null,
  capacity = null, deadline = null, initialStatus = "Active",
} = {}) {
  const result = db.prepare(
    `INSERT INTO opportunities
       (industry_user_id, title, description, opportunity_type, required_skills, location, duration, stipend,
        domain, mode, experience, preferred_skills, company, status, capacity, deadline)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    industryUserId, title, description, opportunityType,
    JSON.stringify(requiredSkills || []), location, duration, stipend,
    domain, mode, experience, JSON.stringify(preferredSkills || []), company,
    initialStatus, capacity, deadline
  );
  return findById(Number(result.lastInsertRowid));
}

function update(industryUserId, opportunityId, fields = {}) {
  const existing = findById(opportunityId);
  if (!existing || existing.industry_user_id !== industryUserId) return null;
  const {
    title, description, opportunityType, requiredSkills, location, duration, stipend, status,
    domain, mode, experience, preferredSkills, company, capacity, deadline,
  } = fields;
  db.prepare(
    `UPDATE opportunities SET
       title = ?, description = ?, opportunity_type = ?, required_skills = ?,
       location = ?, duration = ?, stipend = ?, status = ?,
       domain = ?, mode = ?, experience = ?, preferred_skills = ?, company = ?,
       capacity = ?, deadline = ?,
       updated_at = datetime('now')
     WHERE id = ? AND industry_user_id = ?`
  ).run(
    title ?? existing.title, description ?? existing.description,
    opportunityType ?? existing.opportunity_type,
    requiredSkills !== undefined ? JSON.stringify(requiredSkills) : existing.required_skills,
    location ?? existing.location, duration ?? existing.duration, stipend ?? existing.stipend,
    status ?? existing.status,
    domain ?? existing.domain, mode ?? existing.mode, experience ?? existing.experience,
    preferredSkills !== undefined ? JSON.stringify(preferredSkills) : existing.preferred_skills,
    company ?? existing.company,
    capacity !== undefined ? capacity : existing.capacity,
    deadline !== undefined ? deadline : existing.deadline,
    opportunityId, industryUserId
  );
  return findById(opportunityId);
}

function setStatus(industryUserId, opportunityId, status) {
  const existing = findById(opportunityId);
  if (!existing || existing.industry_user_id !== industryUserId) return null;
  db.prepare("UPDATE opportunities SET status = ?, updated_at = datetime('now') WHERE id = ? AND industry_user_id = ?")
    .run(status, opportunityId, industryUserId);
  return findById(opportunityId);
}

// Returns the run() result ({changes,...}) so the caller can tell
// "deleted" apart from "no such opportunity for this user" (same
// pattern as db/skills.js and db/projects.js remove()).
function remove(industryUserId, opportunityId) {
  return db.prepare("DELETE FROM opportunities WHERE id = ? AND industry_user_id = ?").run(opportunityId, industryUserId);
}

module.exports = { listAll, listByIndustryUserId, findById, create, update, setStatus, remove };
