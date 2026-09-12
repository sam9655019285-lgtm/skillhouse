/*
 * routes/certifications.js — student certification endpoints, backed
 * by backend/db/certifications.js (student_certifications +
 * certification_skills) and backend/services/certificateStorage.js
 * (the actual file on disk). Only the authenticated student can ever
 * read/write/delete their own certifications or fetch their own
 * certificate file — user_id always comes from the session, never
 * from the request body or URL (same pattern as routes/projects.js
 * and routes/studentSkills.js).
 */

const fs = require("fs");
const certifications = require("../db/certifications");
const skills = require("../db/skills");
const { readJsonBody } = require("../utils/body");
const { saveCertificateFile, deleteCertificateFile, absolutePath } = require("../services/certificateStorage");

// A base64 data URL inflates the original file size by ~33% — 8MB of
// JSON body comfortably covers the 5MB file cap (certificateStorage.js)
// plus the other form fields.
const CERT_BODY_MAX_BYTES = 8 * 1024 * 1024;

const MAX_NAME_LENGTH = 150;
const MAX_ORG_LENGTH = 150;
const MAX_URL_LENGTH = 500;
const MAX_SKILLS_PER_CERT = 20;
const MAX_SKILL_NAME_LENGTH = 60;

function requireStudent(ctx) {
  if (!ctx.user) return { status: 401, body: { error: "Not authenticated." } };
  if (ctx.user.role !== "Student") return { status: 403, body: { error: "Only students can access this endpoint." } };
  return null;
}

function toClientShape(row, skillNames) {
  return {
    id: row.id,
    name: row.name,
    organization: row.organization,
    issueDate: row.issue_date,
    certificateUrl: row.certificate_url,
    hasFile: !!row.file_path,
    fileType: row.file_type,
    fileName: row.file_original_name,
    fileUrl: row.file_path ? `/api/student/certifications/${row.id}/file` : null,
    skills: skillNames || [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Returns a cleaned, de-duplicated (case-insensitive) array of skill
// name strings, or null if the input is malformed.
function sanitizeSkillNames(rawList) {
  if (rawList === undefined || rawList === null) return [];
  if (!Array.isArray(rawList) || rawList.length > MAX_SKILLS_PER_CERT) return null;
  const cleaned = [];
  const seen = new Set();
  for (const entry of rawList) {
    if (typeof entry !== "string") return null;
    const trimmed = entry.trim();
    if (!trimmed || trimmed.length > MAX_SKILL_NAME_LENGTH) return null;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    cleaned.push(trimmed);
  }
  return cleaned;
}

// Returns an error message string, or null if the fields are valid.
// `partial` allows PUT to omit fields it isn't changing.
function validateFields({ name, organization, issueDate, certificateUrl }, { partial } = {}) {
  if (!partial || name !== undefined) {
    if (typeof name !== "string" || !name.trim()) return "Certificate name is required.";
    if (name.length > MAX_NAME_LENGTH) return `Certificate name must be ${MAX_NAME_LENGTH} characters or fewer.`;
  }
  if (organization !== undefined && organization !== null && organization !== "") {
    if (typeof organization !== "string" || organization.length > MAX_ORG_LENGTH) return `Organization must be ${MAX_ORG_LENGTH} characters or fewer.`;
  }
  if (issueDate !== undefined && issueDate !== null && issueDate !== "") {
    if (typeof issueDate !== "string" || Number.isNaN(Date.parse(issueDate))) return "Issue date is invalid.";
  }
  if (certificateUrl !== undefined && certificateUrl !== null && certificateUrl !== "") {
    if (typeof certificateUrl !== "string" || certificateUrl.length > MAX_URL_LENGTH) return `Certificate URL must be ${MAX_URL_LENGTH} characters or fewer.`;
    try { new URL(certificateUrl); } catch { return "Certificate URL must be a valid URL."; }
  }
  return null;
}

function listCertifications(req, res, ctx) {
  const authError = requireStudent(ctx);
  if (authError) return ctx.sendJson(authError.status, authError.body);
  const rows = certifications.listByUserId(ctx.user.id);
  ctx.sendJson(200, { certifications: rows.map((row) => toClientShape(row, certifications.listSkillNames(row.id))) });
}

async function createCertification(req, res, ctx) {
  const authError = requireStudent(ctx);
  if (authError) return ctx.sendJson(authError.status, authError.body);

  let body;
  try {
    body = await readJsonBody(req, CERT_BODY_MAX_BYTES);
  } catch (err) {
    return ctx.sendJson(err.statusCode || 400, { error: err.message });
  }

  const fieldError = validateFields(body);
  if (fieldError) return ctx.sendJson(400, { error: fieldError });

  const skillNames = sanitizeSkillNames(body.skills);
  if (skillNames === null) return ctx.sendJson(400, { error: "Invalid skills list." });

  let fileInfo = null;
  if (body.fileData) {
    fileInfo = saveCertificateFile(ctx.user.id, body.fileData);
    if (fileInfo.error) return ctx.sendJson(400, { error: fileInfo.error });
  }

  const created = certifications.create(ctx.user.id, {
    name: body.name.trim(),
    organization: body.organization ? body.organization.trim() : null,
    issueDate: body.issueDate || null,
    certificateUrl: body.certificateUrl || null,
    filePath: fileInfo ? fileInfo.relativePath : null,
    fileType: fileInfo ? fileInfo.mime : null,
    fileOriginalName: fileInfo && body.fileName ? String(body.fileName).slice(0, 200) : null,
  });

  if (skillNames.length) {
    certifications.replaceSkills(created.id, skillNames);
    for (const skillName of skillNames) skills.ensureExists(ctx.user.id, skillName, "technical");
  }

  ctx.sendJson(201, { certification: toClientShape(created, skillNames) });
}

async function updateCertification(req, res, ctx) {
  const authError = requireStudent(ctx);
  if (authError) return ctx.sendJson(authError.status, authError.body);

  const certId = Number(ctx.params.certificationId);
  if (!Number.isInteger(certId) || certId <= 0) return ctx.sendJson(400, { error: "Invalid certification id." });

  const existing = certifications.findById(certId);
  if (!existing || existing.user_id !== ctx.user.id) return ctx.sendJson(404, { error: "Certification not found." });

  let body;
  try {
    body = await readJsonBody(req, CERT_BODY_MAX_BYTES);
  } catch (err) {
    return ctx.sendJson(err.statusCode || 400, { error: err.message });
  }

  const fieldError = validateFields(body, { partial: true });
  if (fieldError) return ctx.sendJson(400, { error: fieldError });

  let skillNames;
  if (body.skills !== undefined) {
    skillNames = sanitizeSkillNames(body.skills);
    if (skillNames === null) return ctx.sendJson(400, { error: "Invalid skills list." });
  }

  let fileInfo = null;
  if (body.fileData) {
    fileInfo = saveCertificateFile(ctx.user.id, body.fileData);
    if (fileInfo.error) return ctx.sendJson(400, { error: fileInfo.error });
  }

  const updated = certifications.update(ctx.user.id, certId, {
    name: body.name !== undefined ? body.name.trim() : undefined,
    organization: body.organization !== undefined ? (body.organization ? body.organization.trim() : null) : undefined,
    issueDate: body.issueDate !== undefined ? (body.issueDate || null) : undefined,
    certificateUrl: body.certificateUrl !== undefined ? (body.certificateUrl || null) : undefined,
    filePath: fileInfo ? fileInfo.relativePath : undefined,
    fileType: fileInfo ? fileInfo.mime : undefined,
    fileOriginalName: fileInfo ? (body.fileName ? String(body.fileName).slice(0, 200) : null) : undefined,
  });

  // Only delete the old file once the new one is safely saved and the
  // row is updated to point at it — never leave a cert pointing at a
  // file that no longer exists.
  if (fileInfo && existing.file_path) deleteCertificateFile(existing.file_path);

  if (skillNames !== undefined) {
    certifications.replaceSkills(certId, skillNames);
    for (const skillName of skillNames) skills.ensureExists(ctx.user.id, skillName, "technical");
  }

  ctx.sendJson(200, { certification: toClientShape(updated, certifications.listSkillNames(certId)) });
}

function deleteCertification(req, res, ctx) {
  const authError = requireStudent(ctx);
  if (authError) return ctx.sendJson(authError.status, authError.body);

  const certId = Number(ctx.params.certificationId);
  if (!Number.isInteger(certId) || certId <= 0) return ctx.sendJson(400, { error: "Invalid certification id." });

  const existing = certifications.findById(certId);
  if (!existing || existing.user_id !== ctx.user.id) return ctx.sendJson(404, { error: "Certification not found." });

  const linkedSkills = certifications.listSkillNames(certId);
  const removed = certifications.remove(ctx.user.id, certId);
  if (!removed) return ctx.sendJson(404, { error: "Certification not found." });

  if (removed.file_path) deleteCertificateFile(removed.file_path);

  // A skill only disappears from My Skills if (a) no other
  // certification still claims it, AND (b) it exists purely because a
  // certificate created it — i.e. it was never manually added.
  for (const skillName of linkedSkills) {
    if (certifications.countOtherCertsForSkill(ctx.user.id, skillName, certId) > 0) continue;
    if (!skills.isCertificationSourced(ctx.user.id, skillName)) continue;
    const row = skills.findByName(ctx.user.id, skillName);
    if (row) skills.remove(ctx.user.id, row.id);
  }

  ctx.sendJson(200, { ok: true });
}

function getCertificationFile(req, res, ctx) {
  const authError = requireStudent(ctx);
  if (authError) return ctx.sendJson(authError.status, authError.body);

  const certId = Number(ctx.params.certificationId);
  if (!Number.isInteger(certId) || certId <= 0) return ctx.sendJson(400, { error: "Invalid certification id." });

  const existing = certifications.findById(certId);
  // A 404 here (never 403) avoids confirming to a probing client
  // whether a given certification id belongs to someone else.
  if (!existing || existing.user_id !== ctx.user.id || !existing.file_path) {
    return ctx.sendJson(404, { error: "Certificate file not found." });
  }

  fs.readFile(absolutePath(existing.file_path), (err, data) => {
    if (err) return ctx.sendJson(404, { error: "Certificate file not found." });
    const safeName = (existing.file_original_name || "certificate").replace(/[^\w.\-]+/g, "_");
    res.writeHead(200, {
      "Content-Type": existing.file_type || "application/octet-stream",
      "Content-Disposition": `inline; filename="${safeName}"`,
      "Cache-Control": "private, max-age=0, no-cache",
    });
    res.end(data);
  });
}

module.exports = { listCertifications, createCertification, updateCertification, deleteCertification, getCertificationFile };
