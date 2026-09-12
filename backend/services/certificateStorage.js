/*
 * services/certificateStorage.js — saves uploaded certificate files to
 * disk (backend/data/uploads/certifications/<userId>/<uuid>.<ext>),
 * never as blobs in SQLite (backend/db/database.js only stores the
 * relative path). Files arrive from the frontend as a base64 data URL
 * in the JSON body (see backend/utils/body.js readJsonBody's maxBytes
 * override for certifications) — this project has no multipart parser
 * and stays dependency-free on purpose (see server.js).
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const UPLOAD_ROOT = path.join(__dirname, "..", "data", "uploads", "certifications");
const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5MB

const ALLOWED_MIME_EXT = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "application/pdf": "pdf",
};

function parseDataUrl(dataUrl) {
  if (typeof dataUrl !== "string") return null;
  const match = /^data:([^;,]+);base64,([a-zA-Z0-9+/=]+)$/.exec(dataUrl.trim());
  if (!match) return null;
  return { mime: match[1].toLowerCase(), base64: match[2] };
}

// Returns { relativePath, mime, size } on success, or { error } on
// failure — callers should respond 400 with `error` and save nothing.
function saveCertificateFile(userId, dataUrl) {
  const parsed = parseDataUrl(dataUrl);
  if (!parsed) return { error: "Invalid certificate file data." };

  const ext = ALLOWED_MIME_EXT[parsed.mime];
  if (!ext) return { error: "Only JPG, PNG, and PDF certificate files are allowed." };

  let buffer;
  try {
    buffer = Buffer.from(parsed.base64, "base64");
  } catch {
    return { error: "Invalid certificate file data." };
  }
  if (buffer.length === 0) return { error: "The uploaded certificate file is empty." };
  if (buffer.length > MAX_FILE_BYTES) return { error: "Certificate file must be 5MB or smaller." };

  const userDir = path.join(UPLOAD_ROOT, String(userId));
  fs.mkdirSync(userDir, { recursive: true });
  const fileName = `${crypto.randomUUID()}.${ext}`;
  fs.writeFileSync(path.join(userDir, fileName), buffer);

  return { relativePath: path.join(String(userId), fileName), mime: parsed.mime, size: buffer.length };
}

// Best-effort; a missing file (already deleted, or never existed) is
// not an error the caller needs to know about.
function deleteCertificateFile(relativePath) {
  if (!relativePath) return;
  fs.rm(absolutePath(relativePath), { force: true }, () => {});
}

function absolutePath(relativePath) {
  return path.join(UPLOAD_ROOT, relativePath);
}

module.exports = { saveCertificateFile, deleteCertificateFile, absolutePath, MAX_FILE_BYTES, ALLOWED_MIME_EXT };
