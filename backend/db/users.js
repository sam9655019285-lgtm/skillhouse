/*
 * db/users.js — SQLite-backed user store. Replaces the old
 * frontend localStorage "users" table (js/storage.js getUsers/
 * saveUsers, now removed) as the single source of truth for accounts.
 */

const { db } = require("./database");

function toPublicUser(row) {
  if (!row) return null;
  const { password_hash, ...rest } = row;
  return rest;
}

function findByEmail(email) {
  const stmt = db.prepare("SELECT * FROM users WHERE email = ?");
  return stmt.get((email || "").trim().toLowerCase());
}

function findById(id) {
  const stmt = db.prepare("SELECT * FROM users WHERE id = ?");
  return stmt.get(id);
}

function create({ name, email, passwordHash, role }) {
  const stmt = db.prepare(
    "INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)"
  );
  const result = stmt.run(name, (email || "").trim().toLowerCase(), passwordHash, role);
  return findById(Number(result.lastInsertRowid));
}

module.exports = { findByEmail, findById, create, toPublicUser };
