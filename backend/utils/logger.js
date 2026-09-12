/*
 * utils/logger.js — tiny leveled logger. No external dependency
 * (this is a college project — keep it simple, per Phase 13 spec
 * point 36). Never logs secret values, only whether they're set.
 */

const isProd = () => (process.env.NODE_ENV || "development") === "production";

function timestamp() {
  return new Date().toISOString();
}

function log(level, ...args) {
  const line = `[${timestamp()}] [${level}]`;
  if (level === "ERROR") console.error(line, ...args);
  else if (level === "WARN") console.warn(line, ...args);
  else console.log(line, ...args);
}

module.exports = {
  info: (...args) => log("INFO", ...args),
  warn: (...args) => log("WARN", ...args),
  error: (...args) => log("ERROR", ...args),
  debug: (...args) => { if (!isProd()) log("DEBUG", ...args); },
  isProd,
};
