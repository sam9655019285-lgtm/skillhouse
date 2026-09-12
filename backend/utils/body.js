/*
 * utils/body.js — minimal JSON request-body reader for Node's
 * built-in http module (no body-parser/express needed).
 */

const MAX_BODY_BYTES = 1024 * 1024; // 1MB — plenty for auth payloads, prevents unbounded buffering

// `maxBytes` lets a specific route (e.g. certificate upload, which
// carries a base64-encoded file) raise the cap above the 1MB default
// without loosening it for every other endpoint.
function readJsonBody(req, maxBytes = MAX_BODY_BYTES) {
  return new Promise((resolve, reject) => {
    let received = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      received += chunk.length;
      if (received > maxBytes) {
        reject(Object.assign(new Error("Request body too large"), { statusCode: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf-8")));
      } catch {
        reject(Object.assign(new Error("Invalid JSON body"), { statusCode: 400 }));
      }
    });
    req.on("error", reject);
  });
}

module.exports = { readJsonBody };
