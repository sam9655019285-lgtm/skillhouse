/*
 * db/sessions.js — server-side session store backing the
 * HTTP-only session cookie. Replaces the old client-only
 * sessionStorage "current user" as the actual authorization
 * boundary (see js/auth.js).
 */

const crypto = require("crypto");
const { db } = require("./database");

const SESSION_TTL_DAYS = Number(process.env.SESSION_TTL_DAYS || 7);

function create(userId) {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
  db.prepare("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)")
    .run(token, userId, expiresAt);
  return { token, expiresAt };
}

function findUserByToken(token) {
  if (!token) return null;
  const row = db.prepare(
    `SELECT u.* FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token = ? AND s.expires_at > datetime('now')`
  ).get(token);
  return row || null;
}

function destroy(token) {
  if (!token) return;
  db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
}

function pruneExpired() {
  db.prepare("DELETE FROM sessions WHERE expires_at <= datetime('now')").run();
}

module.exports = { create, findUserByToken, destroy, pruneExpired, SESSION_TTL_DAYS };
