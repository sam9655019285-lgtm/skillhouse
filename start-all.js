/*
 * start-all.js — the one command to run after opening this project
 * (including after a Windows restart): starts the backend API
 * (backend/server.js) and the frontend static server
 * (serve-frontend.js) together, prefixes their output so you can tell
 * them apart in one terminal, and shuts both down on Ctrl+C.
 *
 * This does NOT make Windows launch anything automatically on boot —
 * see README.md "Quick Start" for what this does and does not do.
 * Zero new dependencies: uses only Node's built-in child_process.
 */

const { spawn } = require("child_process");
const path = require("path");

function run(label, command, args) {
  // No shell here on purpose: we're launching node.exe directly (not a
  // shell builtin), and on Windows `shell: true` breaks as soon as
  // `process.execPath` contains a space (e.g. "C:\Program Files\nodejs\
  // node.exe") because spawn concatenates args into one command-line
  // string without quoting them.
  const child = spawn(command, args, { cwd: __dirname });

  child.stdout.on("data", (chunk) => {
    chunk.toString().split("\n").filter(Boolean).forEach((line) => console.log(`[${label}] ${line}`));
  });
  child.stderr.on("data", (chunk) => {
    chunk.toString().split("\n").filter(Boolean).forEach((line) => console.error(`[${label}] ${line}`));
  });
  child.on("exit", (code, signal) => {
    console.log(`[${label}] exited (code=${code}, signal=${signal})`);
  });

  return child;
}

console.log("Starting Skillhouse — backend API + frontend static server...\n");

const backend = run("backend", process.execPath, [path.join("backend", "server.js")]);
const frontend = run("frontend", process.execPath, [path.join(__dirname, "serve-frontend.js")]);

function shutdown() {
  console.log("\nShutting down...");
  backend.kill();
  frontend.kill();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
