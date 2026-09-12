/*
 * db/seed.js — seeds the same four demo accounts the old localStorage
 * version shipped with (js/data.js USERS_SEED), but hashed server-side
 * with scrypt instead of the browser's SHA-256. Runs once: only
 * inserts anything if the users table is empty.
 */

const users = require("./users");
const { hashPassword } = require("../utils/passwords");
const logger = require("../utils/logger");

const DEMO_USERS = [
  { name: "Aditi Sharma", email: "student@demo.com", password: "student123", role: "Student" },
  { name: "TechNova Recruiting", email: "industry@demo.com", password: "industry123", role: "Industry" },
  { name: "Dr. Rajesh Kumar", email: "academician@demo.com", password: "academician123", role: "Academician" },
  { name: "Sunrise Institute Admin", email: "institution@demo.com", password: "institution123", role: "Institution" },
  // Step 19: Admin is never self-registerable via /api/auth/register
  // (VALID_ROLES there deliberately excludes it) — explicitly
  // provisioned here instead, the same way every other demo account is.
  { name: "Platform Admin", email: "admin@demo.com", password: "admin123", role: "Admin" },
];

function seedDemoUsersIfEmpty() {
  // Step 19 note: this used to bail out entirely once student@demo.com
  // existed (the original 4-account seed). That would have silently
  // skipped ever creating the new admin@demo.com account on a database
  // that already had the original 4 — so each demo user is now checked
  // individually and only the ones missing are created, still a no-op
  // once everything's present.
  let createdAny = false;
  for (const demo of DEMO_USERS) {
    if (users.findByEmail(demo.email)) continue;
    users.create({
      name: demo.name,
      email: demo.email,
      passwordHash: hashPassword(demo.password),
      role: demo.role,
    });
    createdAny = true;
  }
  if (createdAny) {
    logger.info("Seeded demo accounts (student@demo.com / industry@demo.com / academician@demo.com / institution@demo.com / admin@demo.com).");
  }
}

module.exports = { seedDemoUsersIfEmpty };
