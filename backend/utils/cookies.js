/*
 * utils/cookies.js — minimal Cookie/Set-Cookie handling (no
 * "cookie" npm package needed).
 */

function parseCookies(req) {
  const header = req.headers.cookie;
  const out = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (key) out[key] = decodeURIComponent(value);
  }
  return out;
}

// sameSite: "Lax" works for local dev (frontend/backend share the
// "localhost" site even on different ports) but browsers refuse to
// send a Lax cookie back on a cross-SITE fetch — e.g. a frontend on
// vercel.app calling a backend on a different domain. For that setup,
// set SESSION_COOKIE_SAMESITE=None in the backend's environment (see
// routes/auth.js) — browsers require Secure whenever SameSite=None,
// so this forces it on regardless of NODE_ENV.
function serializeCookie(name, value, { maxAgeSeconds, secure = false, sameSite = "Lax" } = {}) {
  const forceSecure = secure || sameSite === "None";
  const parts = [`${name}=${encodeURIComponent(value)}`, "Path=/", "HttpOnly", `SameSite=${sameSite}`];
  if (typeof maxAgeSeconds === "number") parts.push(`Max-Age=${maxAgeSeconds}`);
  if (forceSecure) parts.push("Secure");
  return parts.join("; ");
}

function clearCookie(name, { secure = false, sameSite = "Lax" } = {}) {
  return serializeCookie(name, "", { maxAgeSeconds: 0, secure, sameSite });
}

module.exports = { parseCookies, serializeCookie, clearCookie };
