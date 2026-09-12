# Skillhouse — Academia–Industry Collaboration Portal

A platform connecting Students, Industry recruiters, Academicians (faculty),
Institutions, and platform Admins around real skill development, industry
opportunities, live projects, problem statements, and mentorship.

## Quick Start (run this every time — including after a Windows restart)

```
npm run dev
```

This starts **both** the backend API and a frontend static server in one
terminal, then prints the URL to open (e.g.
`http://127.0.0.1:5500/academia_industry_portal/login.html`). Press
`Ctrl+C` in that terminal to stop both.

**Why you need to run this every time:** this is a local development setup,
not an installed application or a Windows service — nothing here makes
Windows launch it automatically on boot or sign-in. Closing the terminal (or
restarting/shutting down Windows) stops both processes, and the site will
show **"Could not reach the backend API"** until you run `npm run dev`
again. If you want it to start automatically on login, see "Optional: Auto-Start
on Windows Login" near the bottom — that part is optional, manual to set up,
and not something this project configures for you.

**Do not open `login.html`/`index.html` by double-clicking it.** That opens
it as a `file://` page, which the backend's CORS protection correctly
rejects (accepting `file://` would let any local HTML file make authenticated
requests using your session) — this is the single most common cause of
"Could not reach the backend API." Always use the `http://127.0.0.1:5500/...`
URL that `npm run dev` prints.

## 1. Project Overview

Students build a real profile (skills, projects, assessments), see a
deterministic skill-gap analysis against real industry demand, browse and
apply to opportunities/live projects/problem statements, get rule-based
learning recommendations, and request faculty mentorship. Industry users
post opportunities/live projects/problem statements, discover candidates,
and review applicants with a transparent match score. Academicians and
Institutions see real aggregate analytics across the student population.
Admins monitor and moderate the platform. No AI/ML is used anywhere — every
score, match, and recommendation is a documented, deterministic formula.

## 2. Architecture

```
Frontend (static HTML/CSS/vanilla JS, no build step, no framework)
   |
   ↓  js/api/apiClient.js  (the ONLY place that knows the backend's URL;
   ↓                        holds no secrets, never calls a third party directly)
Backend — backend/server.js (Node.js, built-in `http` module, zero npm dependencies)
   |
   ├── routes/      thin HTTP handlers — auth, ownership/role checks, validation
   ├── services/     business logic (skill-gap, matching, analytics, notifications, admin…)
   ├── db/           parameterized SQL against the shared SQLite connection
   └── providers/    external job-data sources (LinkedIn OAuth scaffold, Remotive, mock)
         ↓
   SQLite — backend/data/app.db (via Node's built-in `node:sqlite`)
```

Every dashboard (Student/Industry/Academician/Institution/Admin) follows the
same pattern: render instantly from a local cache, fetch the real backend
data in the background, then update in place — the backend/SQLite is always
the authoritative source once loaded.

## 3. Requirements

- **Node.js 22.5+** (required for the built-in `node:sqlite` module — check
  with `node -v`).
- A way to serve static files for the frontend (VS Code Live Server, `python
  -m http.server`, or any static host) — the frontend has no build step.
- No database server to install — SQLite is a single file, created
  automatically on first run.

## 4. Installation

```
git clone <this repo>
cd academia_industry_portal
```

No `npm install` is required for the backend (`backend/package.json`
declares zero dependencies on purpose). The root `package.json` also
declares zero dependencies — it exists only for the `npm start` convenience
script.

## 5. Environment Setup

```
cd backend
cp .env.example .env
```

Edit `backend/.env` as needed — see the variable table below. **Never commit
`.env`** (it's git-ignored) and never put real secrets in `.env.example`.

| Variable | Purpose |
|---|---|
| `PORT` | Backend port (default `3000`). |
| `CORS_ORIGIN` | Comma-separated extra allowed origins beyond localhost. In production, also set `NODE_ENV=production` so *only* this list (and no auto-allowed localhost) is trusted. |
| `DEMO_MODE` | `true` → always serve bundled mock job data. `false` → try LinkedIn (if a user has connected one), then the Job Market API, then fall back to mock. |
| `LINKEDIN_CLIENT_ID` / `LINKEDIN_CLIENT_SECRET` | Your own LinkedIn OAuth app credentials, from an **approved LinkedIn API product**. Leave blank to skip LinkedIn entirely — the system degrades to the next provider automatically. |
| `LINKEDIN_REDIRECT_URI` | Your LinkedIn app's registered OAuth callback URL. |
| `FRONTEND_URL` | Where the browser app is served from — used only for the post-OAuth redirect. |
| `SESSION_TTL_DAYS` | How many days a login session stays valid (default 7). |
| `DB_PATH` | Optional override for the SQLite file location (defaults to `backend/data/app.db`). |
| `JOB_MARKET_API_BASE_URL` | Defaults to Remotive's public, keyless job-listings API. |
| `FRESHNESS_LIVE_MINUTES` / `FRESHNESS_RECENT_MINUTES` | Job-data freshness thresholds shown in the UI. |
| `CACHE_TTL_MINUTES` | How long a successful job-data fetch is cached before refetching. |
| `NODE_ENV` | `production` disables verbose error detail in API responses and stops auto-allowing all `localhost`/`127.0.0.1` CORS origins — set this in any real deployment. |
| `ASSISTANT_LLM_API_KEY` / `ASSISTANT_LLM_MODEL` | Optional — the floating assistant chatbot works fully without these using its built-in FAQ/matching logic; set only to have an LLM phrase its replies more naturally. |

## 6. Database Setup

Nothing to do manually — on first backend start, `backend/db/database.js`
creates `backend/data/app.db` (SQLite) and every table via idempotent
`CREATE TABLE IF NOT EXISTS`/`ALTER TABLE` statements, and
`backend/db/seed.js` seeds five demo accounts (see below) if they don't
already exist. **Do not commit `backend/data/app.db`** — it's git-ignored
and is meant to be a local/deployment runtime artifact, never shipped from
the repository.

## 7. Backend Start

**Recommended:** `npm run dev` from the project root (see Quick Start above)
starts this and the frontend together. To start only the backend:

```
cd backend
npm start            # or: node server.js
# or, from the project root:
npm start
```

Listens on `http://localhost:3000` by default. Development mode
auto-allows any `http://localhost:*` or `http://127.0.0.1:*` origin
(covers Live Server, `python -m http.server`, etc. regardless of port).

**Health check:** `GET http://localhost:3000/` returns
`{"name": "...", "status": "running", "demoMode": ...}` when the backend is
up — open that URL directly in a browser, or visit the in-app "⚙ API
status" page (bottom of the sidebar, requires being logged in) for a fuller
provider/cache health view.

## 8. Frontend Start

**Recommended:** `npm run dev` from the project root (see Quick Start above)
starts a zero-dependency static server (`serve-frontend.js`) for the
frontend alongside the backend, serving this project's **parent** folder on
port 5500 — matching `FRONTEND_URL` in `backend/.env` (used for the
LinkedIn OAuth redirect), so nothing else needs to change if you were
already using Live Server on the same port/path.

Other ways to serve the frontend (only the frontend — you must still start
the backend separately with one of the commands above):

- **VS Code:** install "Live Server" → right-click `index.html` → "Open
  with Live Server".
- **Any other static server:**
  ```
  python3 -m http.server 8000
  ```
  then visit `http://localhost:8000/`.

**Never open `index.html`/`login.html` by double-clicking it** (`file://`)
— see the Quick Start section above for why this reliably breaks login.

`index.html` redirects to `login.html`, or straight to your role's
dashboard if you're already logged in.

## 9. Demo Accounts — DEVELOPMENT ONLY

Seeded automatically on first backend start. **Never use these credentials
in a real deployment** — rotate/remove them before going live.

| Role | Email | Password |
|---|---|---|
| Student | student@demo.com | student123 |
| Industry | industry@demo.com | industry123 |
| Academician | academician@demo.com | academician123 |
| Institution | institution@demo.com | institution123 |
| Admin | admin@demo.com | admin123 |

You can also register a new Student/Industry/Academician/Institution
account from `register.html`. **Admin is deliberately not
self-registerable** — it can only be provisioned server-side (e.g. via
`backend/db/seed.js` or a direct database insert), never through the public
registration form, so nobody can grant themselves platform-admin access.

## 10. Roles

| Role | Can do |
|---|---|
| **Student** | Profile, skills, projects, assessments, skill-gap analysis, browse/apply to opportunities & live projects & problem statements, opportunity match scores, learning recommendations, request mentorship, notifications. |
| **Industry** | Post/manage opportunities, live projects, and problem statements; review applicants/participants with real match scores; discover candidates from the real student database. |
| **Academician** | Real aggregate student/skill/assessment analytics, faculty-generated insights, browse problem statements, manage incoming mentorship requests. |
| **Institution** | Real aggregate institution-wide analytics (students, skills, assessments, industry alignment, opportunities, readiness distribution). |
| **Admin** | Platform overview, user management (search/filter/suspend/activate), content moderation (opportunities/live projects/problem statements), audit log. |

## 11. Main Features

- Real, database-backed Student Profile / Skills / Projects / Assessments
  (server-side recomputed, never trusting a client-submitted score).
- Deterministic Skill-Gap Analysis against configurable job-role
  requirements, reused everywhere a "current skill level" is needed.
- Real-time Industry Skill Demand (LinkedIn → public Job Market API → mock
  fallback chain, never mislabeling mock data as live).
- Opportunities, Live Projects, and Problem Statements — full post → browse
  → apply/express-interest → review → status workflow, each with proper
  ownership checks.
- Smart Opportunity Matching — one shared, documented weighted formula
  (Required 0.50 / Preferred 0.10 / Role Relevance 0.25 / Skill-Gap
  Relevance 0.15) reused across every matching surface, never duplicated.
- Rule-based Learning Recommendations combining skill gap + live industry
  demand.
- Institution/Academician Analytics — real aggregate SQL, deterministic
  Student Readiness classification, zero fabricated metrics.
- Industry Candidate Discovery — real student search/filter, never a mock
  candidate roster.
- Mentorship — Student ↔ Academician request/accept/reject/complete
  workflow.
- Notifications — real event-driven notifications (application/status
  changes, live-project/problem-statement/mentorship events, admin
  moderation), with duplicate-event protection.
- Admin platform management — real metrics, user suspension, content
  moderation, audit log.

## 12. API Overview

All endpoints are under `/api/`. A representative sample (see
`backend/server.js` for the full route table):

| Area | Endpoints |
|---|---|
| Auth | `POST /api/auth/register`, `/login`, `/logout`, `GET /api/auth/me` |
| Student | `/api/profile`, `/api/student/skills`, `/api/student/projects`, `/api/student/assessments`, `/api/student/skill-gap`, `/api/student/learning-recommendations` |
| Opportunities | `/api/opportunities`, `/api/opportunities/:id/apply`, `/api/opportunities/:id/applicants`, `/api/industry/applications/:id/status` |
| Matching | `/api/student/opportunities/:id/match`, `/api/student/opportunities/matches` |
| Live Projects | `/api/industry-projects`, `/api/industry-projects/:id/apply`, `.../applicants` |
| Problem Statements | `/api/problem-statements`, `.../interest`, `.../participants` |
| Mentorship | `/api/mentorship/mentors`, `/api/mentorship/requests`, `/api/mentorship/student/needs` |
| Analytics | `/api/institution/analytics`, `/api/academician/analytics`, `/api/industry/skill-demand` |
| Candidates | `/api/industry/candidates`, `/api/industry/candidates/:id` |
| Notifications | `/api/notifications`, `/api/notifications/unread-count`, `.../:id/read` |
| Admin | `/api/admin/overview`, `/api/admin/users`, `/api/admin/content`, `/api/admin/audit` |
| Live job data | `/api/jobs`, `/api/skills/demand`, `/api/industry/trends`, `/api/industry/status` |

Every endpoint enforces authentication via an `HttpOnly` session cookie and
role/ownership checks server-side — the frontend never determines access.

## 13. Deployment Notes

- **Do not deploy `backend/data/app.db` from the repository.** Let the
  backend create a fresh database on the target server (or provision a real
  one via `DB_PATH`) — the file in your local working copy is
  development/test data only, and is git-ignored precisely so it's never
  shipped.
- **Never point a static file server at the whole project root** in
  production — only serve the frontend files (root-level `.html`, `css/`,
  `js/`, `assets/`). Serving `backend/` alongside the frontend would put
  `backend/.env` and `backend/data/app.db` inside the static server's
  document root; the Node API itself never serves static files at all, so
  this risk only exists if you choose a static server that also happens to
  be pointed at the project root.
- **Set the frontend's API base URL explicitly in production.**
  `js/api/apiClient.js` auto-targets `http://<page-host>:3000` only when
  the page is opened via `localhost`/`127.0.0.1`; anywhere else it needs
  `window.API_BASE_URL` set (e.g. a small inline `<script>` before
  `apiClient.js` loads, or templated at deploy time) to point at your real
  API domain — it is **not** hardcoded to `localhost` in a way that would
  silently work in production, but it also won't silently guess your
  production domain, by design.
- **Set `NODE_ENV=production`** on the server so CORS stops
  auto-trusting any localhost origin (only `CORS_ORIGIN` is trusted) and
  error responses stop including internal `err.message` detail.
- **Set `CORS_ORIGIN`** to your real frontend origin(s).
- Recommended simplest realistic setup: frontend as a static site (Nginx,
  Netlify, GitHub Pages, etc.) + backend as a small long-running Node
  process (systemd service, Docker container, or PaaS) with a persistent
  volume for `backend/data/app.db` + `backend/.env` supplied via the host's
  secret/environment mechanism, not committed.

## 14. Optional: Auto-Start on Windows Login

This is **not configured by this project** and I have not set it up or
tested it in your environment — do this only if you specifically want the
site available immediately after signing into Windows, without opening a
terminal yourself:

1. Create a file `start-skillhouse.bat` anywhere convenient, containing:
   ```
   @echo off
   cd /d "C:\path\to\academia_industry_portal"
   call npm run dev
   ```
2. Press `Win+R`, type `shell:startup`, press Enter — this opens your
   Windows user's Startup folder.
3. Place a shortcut to `start-skillhouse.bat` in that folder.

Windows will then run it (opening a visible terminal window) the next time
you sign in. Closing that terminal window still stops both servers, same as
running `npm run dev` manually. This is a per-user, per-machine convenience
— it is not a Windows service, won't survive a "different user" login, and
isn't something to rely on for a real deployment (see Deployment Notes
below for that).

## 15. Security Notes

- Passwords are hashed with `crypto.scryptSync` (random salt,
  `timingSafeEqual` comparison) — never stored or logged in plaintext,
  never returned in any API response.
- Sessions are random 256-bit tokens stored server-side in SQLite (not
  JWTs), delivered via an `HttpOnly`, `SameSite=Lax` cookie (`Secure` in
  production) — the browser can never read or forge it. Sessions expire
  after `SESSION_TTL_DAYS` and are swept hourly; logout deletes the session
  row immediately.
- Suspended accounts (Admin → User Management) are blocked from all
  authenticated API access (`403 Account suspended`) the moment their
  session is next used, without needing to invalidate the session itself.
- All SQL uses parameterized queries (`db.prepare(...).run(params)`) —
  no string-concatenated user input reaches SQL anywhere in the codebase.
- All user-generated text is HTML-escaped at render time
  (`UI.escapeHtml`) before insertion into the DOM.
- CORS never uses a wildcard origin; a specific origin is always required
  for credentialed (cookie-bearing) requests.
- `Admin` is never self-registerable through the public API.
- `.env`, `backend/data/*.db*`, and `backend/*.log` are git-ignored.
- If you rotate/replace the LinkedIn OAuth credentials in `.env`, do so
  through LinkedIn's developer portal directly — this application never
  stores or exposes that secret to the frontend.
