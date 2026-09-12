/*
 * serve-frontend.js — zero-dependency static file server for the
 * Skillhouse frontend (plain HTML/CSS/vanilla JS, no build step).
 *
 * Why this exists: opening index.html/login.html by double-clicking it
 * (file:// protocol) is the single most common cause of "Could not
 * reach the backend API" on this project. On file://, the browser
 * sends `Origin: null` on every request, which backend/server.js's
 * CORS check correctly refuses (accepting it would let any local HTML
 * file make credentialed requests to your account) — so the fetch is
 * blocked and js/api/apiClient.js reports a generic connection
 * failure, indistinguishable from "the backend isn't running."
 * Serving over real http://127.0.0.1 avoids this entirely.
 *
 * Serves the PARENT directory of this project (not this folder
 * itself) on port 5500 by default, so the site is reachable at
 * http://127.0.0.1:5500/academia_industry_portal/... — this matches
 * backend/.env's existing FRONTEND_URL used for the LinkedIn OAuth
 * redirect. Override the port with the PORT env var if 5500 is busy.
 */

const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.FRONTEND_PORT || process.env.PORT) || 5500;
const ROOT = path.resolve(__dirname, ".."); // parent of this project folder

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".pdf": "application/pdf",
};

function safeJoin(root, urlPath) {
  const decoded = decodeURIComponent(urlPath.split("?")[0]);
  const resolved = path.normalize(path.join(root, decoded));
  // Never allow a request to escape ROOT via "..".
  if (!resolved.startsWith(root)) return null;
  return resolved;
}

const server = http.createServer((req, res) => {
  let filePath = safeJoin(ROOT, req.url);
  if (!filePath) { res.writeHead(400); res.end("Bad request"); return; }

  fs.stat(filePath, (err, stats) => {
    if (!err && stats.isDirectory()) filePath = path.join(filePath, "index.html");

    fs.readFile(filePath, (readErr, data) => {
      if (readErr) {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("404 Not Found");
        return;
      }
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, { "Content-Type": MIME_TYPES[ext] || "application/octet-stream" });
      res.end(data);
    });
  });
});

const MAX_PORT_ATTEMPTS = 10;

function listen(port, attemptsLeft) {
  server.listen(port, "127.0.0.1");
  server.once("listening", () => {
    const projectFolder = path.basename(__dirname);
    console.log(`Skillhouse frontend serving http://127.0.0.1:${port}/`);
    console.log(`Open: http://127.0.0.1:${port}/${projectFolder}/login.html`);
    if (port !== PORT) {
      console.log(`(Port ${PORT} was already in use — e.g. by VS Code Live Server — so this picked ${port} instead. Set FRONTEND_PORT to force a specific port.)`);
    }
  });
  server.once("error", (err) => {
    if (err.code === "EADDRINUSE" && attemptsLeft > 0) {
      listen(port + 1, attemptsLeft - 1);
    } else {
      console.error(`Could not start the frontend server: ${err.message}`);
      process.exitCode = 1;
    }
  });
}

listen(PORT, MAX_PORT_ATTEMPTS);

module.exports = server;
