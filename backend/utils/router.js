/*
 * utils/router.js — a tiny path/method router for Node's built-in
 * http module, just enough to replace Express for this project (no
 * external dependency required — see server.js).
 */

function createRouter() {
  const routes = []; // { method, pattern: RegExp, keys: [], handler }

  function register(method, path, handler) {
    const keys = [];
    const pattern = new RegExp(
      "^" + path.replace(/:[^/]+/g, (m) => { keys.push(m.slice(1)); return "([^/]+)"; }) + "/?$"
    );
    routes.push({ method, pattern, keys, handler });
  }

  return {
    get: (path, handler) => register("GET", path, handler),
    post: (path, handler) => register("POST", path, handler),
    put: (path, handler) => register("PUT", path, handler),
    delete: (path, handler) => register("DELETE", path, handler),
    match(method, pathname) {
      for (const route of routes) {
        if (route.method !== method) continue;
        const m = route.pattern.exec(pathname);
        if (!m) continue;
        const params = {};
        route.keys.forEach((key, i) => { params[key] = m[i + 1]; });
        return { handler: route.handler, params };
      }
      return null;
    },
  };
}

module.exports = { createRouter };
