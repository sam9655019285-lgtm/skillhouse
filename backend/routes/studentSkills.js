/*
 * routes/studentSkills.js — student skills endpoints, backed by
 * backend/db/skills.js (SQLite `student_skills` table). Only the
 * authenticated student can ever read/write/delete their own skills —
 * user_id always comes from the session, never from the request body
 * or URL (see js/app-student.js renderSkillsTab for the frontend side).
 */

const skills = require("../db/skills");
const certifications = require("../db/certifications");
const { readJsonBody } = require("../utils/body");

const MAX_NAME_LENGTH = 100;
const MAX_CATEGORY_LENGTH = 50;
const MAX_PROFICIENCY_LENGTH = 50;
const MAX_YEARS_EXPERIENCE = 60;

function requireStudent(ctx) {
  if (!ctx.user) return { status: 401, body: { error: "Not authenticated." } };
  if (ctx.user.role !== "Student") return { status: 403, body: { error: "Only students can access this endpoint." } };
  return null;
}

function toClientShape(row, userId) {
  return {
    id: row.id,
    skillName: row.skill_name,
    category: row.category,
    proficiency: row.proficiency,
    yearsExperience: row.years_experience,
    // Which certification(s) demonstrate this skill, if any — see
    // backend/db/certifications.js listCertNamesForSkill and
    // js/app-student.js renderSkillsTab's renderList for the "🎓 ..."
    // annotation this powers in My Skills.
    certifications: certifications.listCertNamesForSkill(userId, row.skill_name),
  };
}

// Returns an error message string, or null if the entry is valid.
function validateSkillEntry(entry, index) {
  if (!entry || typeof entry !== "object") return `Skill at position ${index} is malformed.`;
  const { skillName, category, proficiency, yearsExperience } = entry;
  if (typeof skillName !== "string" || !skillName.trim()) return `Skill at position ${index} is missing a name.`;
  if (skillName.length > MAX_NAME_LENGTH) return `Skill name must be ${MAX_NAME_LENGTH} characters or fewer.`;
  if (category !== undefined && category !== null) {
    if (typeof category !== "string" || category.length > MAX_CATEGORY_LENGTH) return `Skill category must be text of ${MAX_CATEGORY_LENGTH} characters or fewer.`;
  }
  if (proficiency !== undefined && proficiency !== null) {
    if (typeof proficiency !== "string" || proficiency.length > MAX_PROFICIENCY_LENGTH) return `Skill proficiency must be text of ${MAX_PROFICIENCY_LENGTH} characters or fewer.`;
  }
  if (yearsExperience !== undefined && yearsExperience !== null) {
    if (typeof yearsExperience !== "number" || Number.isNaN(yearsExperience) || yearsExperience < 0 || yearsExperience > MAX_YEARS_EXPERIENCE) {
      return `Skill years of experience must be a number between 0 and ${MAX_YEARS_EXPERIENCE}.`;
    }
  }
  return null;
}

function getSkills(req, res, ctx) {
  const authError = requireStudent(ctx);
  if (authError) return ctx.sendJson(authError.status, authError.body);
  const rows = skills.listByUserId(ctx.user.id);
  ctx.sendJson(200, { skills: rows.map((row) => toClientShape(row, ctx.user.id)) });
}

// Full replace: the authenticated student's skill set becomes exactly
// what's in the request body — anything already saved but missing
// from this list is removed, everything present is upserted. This
// matches how the frontend always sends its complete current
// technical+soft skill set on every add/edit/remove (see
// js/app-student.js buildSkillsPayload / syncSkillsToBackend).
async function updateSkills(req, res, ctx) {
  const authError = requireStudent(ctx);
  if (authError) return ctx.sendJson(authError.status, authError.body);

  let body;
  try {
    body = await readJsonBody(req);
  } catch (err) {
    return ctx.sendJson(err.statusCode || 400, { error: err.message });
  }

  const incoming = body.skills;
  if (!Array.isArray(incoming)) return ctx.sendJson(400, { error: "Expected a 'skills' array." });

  for (let i = 0; i < incoming.length; i++) {
    const err = validateSkillEntry(incoming[i], i);
    if (err) return ctx.sendJson(400, { error: err });
  }

  const userId = ctx.user.id; // never trust a user_id from the request
  const incomingNames = new Set(incoming.map((s) => s.skillName));
  const existing = skills.listByUserId(userId);
  for (const row of existing) {
    if (!incomingNames.has(row.skill_name)) skills.remove(userId, row.id);
  }
  for (const entry of incoming) {
    skills.upsert(userId, {
      skillName: entry.skillName,
      category: entry.category ?? null,
      proficiency: entry.proficiency ?? null,
      yearsExperience: entry.yearsExperience ?? null,
    });
  }

  ctx.sendJson(200, { skills: skills.listByUserId(userId).map((row) => toClientShape(row, userId)) });
}

function deleteSkill(req, res, ctx) {
  const authError = requireStudent(ctx);
  if (authError) return ctx.sendJson(authError.status, authError.body);

  const skillId = Number(ctx.params.skillId);
  if (!Number.isInteger(skillId) || skillId <= 0) return ctx.sendJson(400, { error: "Invalid skill id." });

  const result = skills.remove(ctx.user.id, skillId);
  if (!result || result.changes === 0) {
    return ctx.sendJson(404, { error: "Skill not found." });
  }
  ctx.sendJson(200, { ok: true });
}

module.exports = { getSkills, updateSkills, deleteSkill };
