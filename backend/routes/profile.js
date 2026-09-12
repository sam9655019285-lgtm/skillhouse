/*
 * routes/profile.js — student profile endpoints, backed by
 * backend/db/profiles.js (SQLite `student_profiles` table). Only the
 * authenticated user's own profile is ever readable/writable, and
 * only for role "Student" (see js/app-student.js for the frontend
 * side of this).
 */

const profiles = require("../db/profiles");
const { readJsonBody } = require("../utils/body");

const MAX_TEXT_LENGTH = 500;
const MAX_BIO_LENGTH = 2000;

function requireStudent(ctx) {
  if (!ctx.user) return { error: { status: 401, body: { error: "Not authenticated." } } };
  if (ctx.user.role !== "Student") return { error: { status: 403, body: { error: "Only students can access this endpoint." } } };
  return { error: null };
}

function emptyProfile() {
  return { phone: null, college: null, department: null, year: null, bio: null, location: null, resumeUrl: null };
}

function toClientShape(row) {
  if (!row) return emptyProfile();
  return {
    phone: row.phone, college: row.college, department: row.department, year: row.year,
    bio: row.bio, location: row.location, resumeUrl: row.resume_url,
  };
}

function validateField(name, value, maxLength) {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") return `${name} must be text.`;
  if (value.length > maxLength) return `${name} must be ${maxLength} characters or fewer.`;
  return null;
}

function getProfile(req, res, ctx) {
  const { error } = requireStudent(ctx);
  if (error) return ctx.sendJson(error.status, error.body);
  const row = profiles.findByUserId(ctx.user.id);
  ctx.sendJson(200, { profile: toClientShape(row) });
}

async function updateProfile(req, res, ctx) {
  const { error } = requireStudent(ctx);
  if (error) return ctx.sendJson(error.status, error.body);

  let body;
  try {
    body = await readJsonBody(req);
  } catch (err) {
    return ctx.sendJson(err.statusCode || 400, { error: err.message });
  }

  const { phone, college, department, year, bio, location, resumeUrl } = body;
  const rawFields = { phone, college, department, year, bio, location, resumeUrl };
  // node:sqlite bind params must be null, not undefined, for fields the client omitted.
  const fields = Object.fromEntries(Object.entries(rawFields).map(([k, v]) => [k, v === undefined ? null : v]));

  const errors = [
    validateField("phone", phone, MAX_TEXT_LENGTH),
    validateField("college", college, MAX_TEXT_LENGTH),
    validateField("department", department, MAX_TEXT_LENGTH),
    validateField("year", year, MAX_TEXT_LENGTH),
    validateField("bio", bio, MAX_BIO_LENGTH),
    validateField("location", location, MAX_TEXT_LENGTH),
    validateField("resumeUrl", resumeUrl, MAX_TEXT_LENGTH),
  ].filter(Boolean);
  if (errors.length) return ctx.sendJson(400, { error: errors[0] });

  const saved = profiles.upsert(ctx.user.id, fields);
  ctx.sendJson(200, { profile: toClientShape(saved) });
}

module.exports = { getProfile, updateProfile };
