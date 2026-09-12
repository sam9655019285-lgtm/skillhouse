/*
 * routes/linkedin.js — LinkedIn OAuth 2.0 authorization-code flow,
 * per user (Phase 13 follow-up). Replaces the old single, app-wide
 * LINKEDIN_ACCESS_TOKEN in .env: each logged-in user connects their
 * own LinkedIn account here, and their token is stored in SQLite
 * (db/linkedinTokens.js), never returned to the frontend.
 *
 * This implements the redirect/exchange mechanics only. LinkedIn
 * itself will still reject the exchange/API calls until this app has
 * an approved API product for whatever scopes/endpoint you need — see
 * providers/linkedinProvider.js and README.md "LinkedIn integration".
 */

const crypto = require("crypto");
const linkedinTokens = require("../db/linkedinTokens");
const logger = require("../utils/logger");

const AUTHORIZE_URL = "https://www.linkedin.com/oauth/v2/authorization";
const TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken";
const DEFAULT_SCOPE = process.env.LINKEDIN_SCOPE || "openid profile email";

function redirectUri() {
  return process.env.LINKEDIN_REDIRECT_URI || `http://localhost:${process.env.PORT || 3000}/api/linkedin/callback`;
}

function frontendUrl() {
  return process.env.FRONTEND_URL || "http://localhost:5500";
}

function isAppConfigured() {
  return !!(process.env.LINKEDIN_CLIENT_ID && process.env.LINKEDIN_CLIENT_SECRET);
}

function connect(req, res, ctx) {
  if (!ctx.user) return ctx.sendJson(401, { error: "Not authenticated." });
  if (!isAppConfigured()) {
    return ctx.sendJson(503, { error: "LinkedIn integration not configured: set LINKEDIN_CLIENT_ID/LINKEDIN_CLIENT_SECRET in backend/.env first." });
  }

  const state = crypto.randomBytes(24).toString("hex");
  linkedinTokens.createState(state, ctx.user.id);

  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", process.env.LINKEDIN_CLIENT_ID);
  url.searchParams.set("redirect_uri", redirectUri());
  url.searchParams.set("state", state);
  url.searchParams.set("scope", DEFAULT_SCOPE);

  res.writeHead(302, { Location: url.toString() });
  res.end();
}

async function callback(req, res, ctx) {
  const { code, state, error, error_description } = ctx.query;

  if (error) {
    logger.warn(`LinkedIn OAuth callback error: ${error} — ${error_description || ""}`);
    res.writeHead(302, { Location: `${frontendUrl()}/api-status.html?linkedin=error` });
    return res.end();
  }
  if (!code || !state) {
    res.writeHead(302, { Location: `${frontendUrl()}/api-status.html?linkedin=error` });
    return res.end();
  }

  const stateRow = linkedinTokens.consumeState(state);
  if (!stateRow) {
    logger.warn("LinkedIn OAuth callback: unknown or expired state (possible CSRF attempt or timeout).");
    res.writeHead(302, { Location: `${frontendUrl()}/api-status.html?linkedin=error` });
    return res.end();
  }

  try {
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri(),
      client_id: process.env.LINKEDIN_CLIENT_ID,
      client_secret: process.env.LINKEDIN_CLIENT_SECRET,
    });

    const tokenRes = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    const tokenData = await tokenRes.json();

    if (!tokenRes.ok || !tokenData.access_token) {
      logger.warn(`LinkedIn token exchange failed: ${tokenRes.status} ${JSON.stringify(tokenData)}`);
      res.writeHead(302, { Location: `${frontendUrl()}/api-status.html?linkedin=error` });
      return res.end();
    }

    const expiresAt = tokenData.expires_in
      ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
      : null;

    linkedinTokens.upsert(stateRow.user_id, {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token || null,
      scope: tokenData.scope || DEFAULT_SCOPE,
      expiresAt,
    });

    res.writeHead(302, { Location: `${frontendUrl()}/api-status.html?linkedin=connected` });
    res.end();
  } catch (err) {
    logger.error("LinkedIn token exchange threw:", err.message);
    res.writeHead(302, { Location: `${frontendUrl()}/api-status.html?linkedin=error` });
    res.end();
  }
}

function status(req, res, ctx) {
  if (!ctx.user) return ctx.sendJson(401, { error: "Not authenticated." });
  const row = linkedinTokens.findByUserId(ctx.user.id);
  if (!row) {
    return ctx.sendJson(200, { connected: false, appConfigured: isAppConfigured() });
  }
  // Never return the token itself — only metadata about the connection.
  ctx.sendJson(200, {
    connected: true,
    appConfigured: isAppConfigured(),
    connectedAt: row.connected_at,
    expiresAt: row.expires_at,
    scope: row.scope,
  });
}

function disconnect(req, res, ctx) {
  if (!ctx.user) return ctx.sendJson(401, { error: "Not authenticated." });
  linkedinTokens.remove(ctx.user.id);
  ctx.sendJson(200, { ok: true });
}

module.exports = { connect, callback, status, disconnect };
