/*
 * db/linkedinTokens.js — per-user LinkedIn OAuth token storage.
 * Replaces the old single, app-wide LINKEDIN_ACCESS_TOKEN in .env —
 * each user connects their own LinkedIn account and their token is
 * persisted here, keyed by user id, never sent back to the frontend.
 */

const { db } = require("./database");

function upsert(userId, { accessToken, refreshToken = null, scope = null, expiresAt = null }) {
  db.prepare(`
    INSERT INTO linkedin_tokens (user_id, access_token, refresh_token, scope, expires_at, connected_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(user_id) DO UPDATE SET
      access_token = excluded.access_token,
      refresh_token = excluded.refresh_token,
      scope = excluded.scope,
      expires_at = excluded.expires_at,
      connected_at = datetime('now')
  `).run(userId, accessToken, refreshToken, scope, expiresAt);
}

function findByUserId(userId) {
  return db.prepare("SELECT * FROM linkedin_tokens WHERE user_id = ?").get(userId) || null;
}

function remove(userId) {
  db.prepare("DELETE FROM linkedin_tokens WHERE user_id = ?").run(userId);
}

// ---- OAuth "state" (CSRF protection for the redirect flow) ----
function createState(state, userId) {
  db.prepare("INSERT INTO linkedin_oauth_state (state, user_id) VALUES (?, ?)").run(state, userId);
}

function consumeState(state) {
  const row = db.prepare(
    "SELECT * FROM linkedin_oauth_state WHERE state = ? AND created_at > datetime('now', '-10 minutes')"
  ).get(state);
  db.prepare("DELETE FROM linkedin_oauth_state WHERE state = ?").run(state);
  return row || null;
}

module.exports = { upsert, findByUserId, remove, createState, consumeState };
