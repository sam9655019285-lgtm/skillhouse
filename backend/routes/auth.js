/*
 * routes/auth.js — server-side authentication backed by SQLite.
 *
 * Replaces the old browser-only auth (js/auth.js used to hash
 * passwords with SHA-256 in the browser and store the whole user
 * table, including hashes, in localStorage — see REPOSITORY_ANALYSIS.md
 * "High: Browser-side authentication is not an access-control
 * boundary"). Passwords are now verified server-side with scrypt and
 * never leave the backend; the session lives in an HTTP-only cookie.
 */

const users = require("../db/users");
const sessions = require("../db/sessions");
const { hashPassword, verifyPassword } = require("../utils/passwords");
const { readJsonBody } = require("../utils/body");
const { serializeCookie, clearCookie } = require("../utils/cookies");

const VALID_ROLES = ["Student", "Industry", "Academician", "Institution"];
const SESSION_COOKIE = "aisb_session";

function isSecure() {
  return (process.env.NODE_ENV || "development") === "production";
}

// "Lax" (default) works whenever the frontend and backend share the
// same site (e.g. localhost:5500 + localhost:3000 in local dev). Set
// SESSION_COOKIE_SAMESITE=None in the backend's environment only when
// the frontend is hosted on a different domain (e.g. Vercel) than the
// backend — see utils/cookies.js.
function sameSite() {
  return process.env.SESSION_COOKIE_SAMESITE || "Lax";
}

function setSessionCookie(res, token) {
  res.setHeader("Set-Cookie", serializeCookie(SESSION_COOKIE, token, {
    maxAgeSeconds: sessions.SESSION_TTL_DAYS * 24 * 60 * 60,
    secure: isSecure(),
    sameSite: sameSite(),
  }));
}

async function register(req, res, ctx) {
  let body;
  try {
    body = await readJsonBody(req);
  } catch (err) {
    return ctx.sendJson(err.statusCode || 400, { error: err.message });
  }
  let { name, email, password, confirmPassword, role } = body;
  name = (name || "").trim();
  email = (email || "").trim().toLowerCase();

  if (!name || !email || !password || !confirmPassword) {
    return ctx.sendJson(400, { error: "Please fill in all fields." });
  }
  if (!VALID_ROLES.includes(role)) {
    return ctx.sendJson(400, { error: "Please select a valid role." });
  }
  if (password !== confirmPassword) {
    return ctx.sendJson(400, { error: "Passwords do not match." });
  }
  if (password.length < 6) {
    return ctx.sendJson(400, { error: "Password must be at least 6 characters long." });
  }
  if (users.findByEmail(email)) {
    return ctx.sendJson(409, { error: "An account with this email already exists." });
  }

  const user = users.create({ name, email, passwordHash: hashPassword(password), role });
  const { token } = sessions.create(user.id);
  setSessionCookie(res, token);
  ctx.sendJson(201, { user: users.toPublicUser(user) });
}

async function login(req, res, ctx) {
  let body;
  try {
    body = await readJsonBody(req);
  } catch (err) {
    return ctx.sendJson(err.statusCode || 400, { error: err.message });
  }
  const { email, password } = body;
  if (!email || !password) {
    return ctx.sendJson(400, { error: "Please enter both email and password." });
  }

  const user = users.findByEmail(email);
  if (!user || !verifyPassword(password, user.password_hash)) {
    return ctx.sendJson(401, { error: "Incorrect email or password." });
  }

  const { token } = sessions.create(user.id);
  setSessionCookie(res, token);
  ctx.sendJson(200, { user: users.toPublicUser(user) });
}

function logout(req, res, ctx) {
  if (ctx.sessionToken) sessions.destroy(ctx.sessionToken);
  res.setHeader("Set-Cookie", clearCookie(SESSION_COOKIE, { secure: isSecure(), sameSite: sameSite() }));
  ctx.sendJson(200, { ok: true });
}

function me(req, res, ctx) {
  if (!ctx.user) return ctx.sendJson(401, { error: "Not authenticated." });
  ctx.sendJson(200, { user: users.toPublicUser(ctx.user) });
}

module.exports = { register, login, logout, me, SESSION_COOKIE };
