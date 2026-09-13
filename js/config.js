/*
 * config.js — sets window.API_BASE_URL for a real public deployment
 * (e.g. this frontend hosted on Vercel). Must load BEFORE
 * js/api/apiClient.js on every page.
 *
 * Local dev (opened via http://localhost:* or http://127.0.0.1:*, as
 * npm run dev does) needs nothing here — apiClient.js already
 * auto-targets http://<same-host>:3000 in that case. This file only
 * matters once the frontend is hosted somewhere else (a real domain,
 * Vercel, Netlify, etc.), where there is no "same host" backend to
 * guess — you must fill in the real backend URL below after you
 * deploy it.
 */

(function () {
  const isLocalDev = ["localhost", "127.0.0.1"].includes(window.location.hostname);
  if (isLocalDev) return; // apiClient.js handles this case itself

  // ---- Fill this in once your backend is deployed and reachable ----
  // Example: "https://skillhouse-api.onrender.com"
  const PRODUCTION_API_BASE_URL = "https://skillhouse-cf9w.onrender.com";

  if (PRODUCTION_API_BASE_URL) {
    window.API_BASE_URL = PRODUCTION_API_BASE_URL;
  } else {
    console.warn(
      "[Skillhouse] This site is hosted at " + window.location.origin +
      " but js/config.js has no backend URL configured yet, so API calls will fail. " +
      "Deploy backend/server.js somewhere public, then set PRODUCTION_API_BASE_URL in js/config.js to that URL."
    );
  }
})();
