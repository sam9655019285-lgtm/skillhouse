/*
 * utils/passwords.js — password hashing using Node's built-in
 * crypto.scrypt (no bcrypt/argon2 dependency needed — keeps the
 * backend at zero npm dependencies). scrypt is a slow, salted KDF
 * suitable for password storage, unlike the old frontend's plain
 * SHA-256 (see js/auth.js history).
 */

const crypto = require("crypto");

const KEY_LEN = 64;

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, KEY_LEN).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = (stored || "").split(":");
  if (!salt || !hash) return false;
  const candidate = crypto.scryptSync(password, salt, KEY_LEN);
  const expected = Buffer.from(hash, "hex");
  if (candidate.length !== expected.length) return false;
  return crypto.timingSafeEqual(candidate, expected);
}

module.exports = { hashPassword, verifyPassword };
