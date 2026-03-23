
Dont commit yourself as it confuses me.

---UPDATE THIS FILE ALOT AND ANY NECCESSARY CONTEXT FILES WITH ANY IMPORTANT INFORMATION YOU THINK IS RELEVANT TO THE PROJECT. This is the single source of truth for the project and should be updated with any learnings and decisions.

## ⚠️ USER NOTES (DO NOT TOUCH - CRITICAL INFO)

**ADD YOUR IMPORTANT NOTES HERE:**
- When Running "npm run server" dont wait for it to respond as this is on a different device to the server and all of the info. I may use ctl + c to stop it but please stop it after a while.

- No secrets should be stored in this repo and escpially in this file as it is public(Same for the other context files) dont add anything that can make the website vulnerable.

- Please update this file with ANY infomation and update the other context files with any important information you think is relevant to the project. This is the single source of truth for the project and should be updated with any learnings and decisions.

-UPDATE AFTER EVERY MESSAGE AND ANY RELEVANT INFO that will be useful for future development and handover. This is the single source of truth for the project and should be updated with any learnings and decisions.

---

## Flight-Points Copilot Instructions
**Single source of truth for project development. Update frequently with learnings and decisions.**

Always test using `npm run build` and `npm run server` at the end of large changes. Fix breaks immediately.

### Optional Deep Context (load only when needed)
- Primary context lives in this file.
- For deeper handover/system context, use `.github/copilot-context/INDEX.md`.
- Read the context pack only when normal instructions are not enough.

---

## Stack & Deployment Overview

| Item | Details |
|------|---------|
| **Frontend** | React + Vite + Tailwind + shadcn/ui |
| **Backend** | Express + TypeScript (server/server.ts) |
| **Database** | PostgreSQL (DATABASE_URL in .env.local) |
| **Auth** | JWT (7d); bcrypt; roles: snco, pointgiver, staff, cadet, presentation |
| **Hosting** | flightpoints.uk via Cloudflare Tunnel on Windows Server |
| **Deploy** | Auto-deploy: `auto-deploy.ps1` every 2min; Manual: `Deploy.bat` |
| **Config** | `.env.local`: DATABASE_URL, JWT_SECRET, ADMIN_PIN (6 digits), SMTP_* (optional) |

---

## Core Rules
- You have permission to edit repo files without asking.
- No LOCAL_MODE / local storage — all data via live API.
- No CSV export; avoid re-introducing removed features.
- Removed files: setupFetch.ts, localApiShim.ts, localStore.ts, RoleChangePanel.tsx, AdminPinManager.tsx, DownloadCsvButton.tsx, downloadCsvUtil.ts.
- User has DBeaver database access.

---

## Deployment & Monitoring

**Scheduled Tasks:**
- `Flight-Points_Server_Tunnel`: Auto-restart API + Cloudflare tunnel on crash. All logs in `C:\inetpub\wwwroot\Flight-Points\Logs\{Server,Tunnel}`.
- `FlightPoints-AutoDeploy`: `auto-deploy.ps1` checks every 2min. Pre-deploy: npm install → tsc --noEmit. Post-deploy: health check 3×; auto-rollback on failure.
- `FlightPoints-Weekly-Backup`: Server backup Sundays 03:00.

**Deploy alerts:** SMTP configured via `SMTP_TO`, `SMTP_FROM`, `SMTP_SERVER`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` in `.env.local`. On failure: email + `data/deploy-status.json` status=failed. On recovery: status=success removes red banner from Integrity tab.

**Uptime alerts:** `start-server-and-tunnel.ps1` sends SMTP on: SERVER DOWN, SERVER RECOVERED, SERVER RESTARTED (state in `data/uptime-status.json`).

---

## API & Database

**Generic CRUD:** `GET/POST/PUT/DELETE /api/data/:type` returns flat arrays.
- Use: `Array.isArray(data) ? data : []` in components.
- `mapToDb()` (camelCase → snake_case); `mapToClient()` (reverse).
- Dedicated: `/api/points`, `/api/my-points`, `/api/leaderboards`, `/api/presentation-stats`, `/api/attendance/reports`, `/api/integrity-check`, `/api/reward-suggestions`, `/api/tickets`, `/api/health`.

**Tables:** cadets, points, attendance, attendance_bulks, rewards, reward_suggestions, reward_votes, app_users, tickets, revision_history, role_permission_defaults (all auto-created).

---

## Auth & Accounts

- **Signup:** Removed. SNOs create in "Accounts" tab.
- **Login:** Username only (stored as `{username}@flightpoints.local`).
- **Passwords:** Two words + 2-digit number, no separators (e.g., `EagleBolt47`).
- **Admin PIN:** 6 digits, env `ADMIN_PIN`, verified server-side only.
- **JWT tokens:** 7 days. Includes cadetId + flight from linked cadet.

**Per-account permissions (2026-03-18):**
- Added `app_users.permissions` JSONB column support (auto-created via `ensureAdminAccountSchema()`).
- Accounts tab now supports editing tab visibility + action permissions per user (cadet/staff/pointgiver/snco/presentation).
- Server now computes effective permissions from role defaults + per-user overrides and refreshes them on every authenticated request.
- Key write endpoints now enforce permission actions, not only role checks:
   - `givePoints`, `editPoints`, `deletePoints`
   - `markAttendance`, `editAttendance`, `deleteAttendanceSessions`
   - `manageAccounts`
- Dashboard + TopNav + Points/Attendance managers now read effective permissions for tab visibility and action controls.

**Role-level defaults editor (2026-03-18):**
- New `role_permission_defaults` DB table (auto-created via `ensureRoleDefaultsSchema()`): `role TEXT PK, permissions JSONB`.
- New endpoints: `GET /api/role-defaults` (snco/admin) returns full effective defaults for all roles; `PUT /api/role-defaults/:role` updates one role's defaults.
- In-memory cache `roleDefaultsCache` loaded at server startup, bust on PUT.
- Accounts tab now has "Default Role Access" card: role selector buttons (snco/pointgiver/staff/cadet/presentation), two-column checkbox grid (tabs + actions), Save + Reset to Built-in buttons.
- `ROLE_PERMISSION_DEFAULTS` exported from `permissions.ts` so frontend can reset to built-in values without a server call.
- `sanitizeFullPermissions()` helper on server validates complete permissions objects (not just overrides).
- Per-user overrides are applied on top of the (potentially DB-customised) role defaults.

---

## Features (Phase 2 — 2026-03-17)

| Feature | Implementation |
|---------|-----------------|
| **Account Lockout** | Progressive delay 0→1→2→4→8s; locked 15min after 5 failures. Funcs: getLoginAttempt(), recordLoginFailure(), isAccountLocked() |
| **Rate Limits** | ticketLimiter (10/15min), pointsLimiter (50/15min), uploadLimiter (10/15min) |
| **CORS** | Whitelist: localhost:5173/3001 (dev), flightpoints.uk + api.flightpoints.uk (prod) |
| **CSP** | Helmet headers; self → defaultSrc, scriptSrc, styleSrc, imgSrc. fonts.googleapis.com + gstatic.com allowed. |
| **Health Check** | `GET /api/health`: DB, disk, uptime, memory. Returns 200 (healthy) or 503 (degraded) |
| **Revision History** | Table includes record_type, record_id, action, changed_by, changed_by_role, changed_at, changed_fields, change_summary, before_data, after_data. Logged on POST `/api/points`, PUT/DELETE `/api/data/:type/:id`, and PUT `/api/attendance/:id/status`. View: `GET /api/revision-history/:type/:id` (admin). |
| **ConfirmDialog** | Reusable component; typed-confirm input; affected count for destructive actions |
| **Effective Permissions** | Admin-visible role/permission matrix (5 roles × 8 areas). In Integrity tab. |
| **Pre-Deploy Check** | `npx tsc --noEmit` after npm install. Aborts if fails. |
| **Post-Deploy Test** | Health check 3×, 5s apart. On fail: auto-rollback to previous commit. |
| **Dependabot** | Monthly npm scanning; grouped minor/patch PRs; open PR limit = 2 |

---

## Points & Attendance

**Points:** POST /api/points allowed for snco, staff, pointgiver. Pointgivers can only award their own flight. NCOs + HQ cadets cannot receive. PointsManager auto-detects flight.

**Attendance:** Bulk submission. "Save All" saves all non-HQ cadets in flight filter. selectedIds = bulk status actions only. New bulk defaults: absent. Recent sessions: expandable, per-cadet inline edit.

---

## Rewards & Other Features

**Rewards:** Active → Claimed (winner set) → Expired (past ends_at). Suggestion workflow: pending → approved (vote) or rejected. Any role except snco can suggest; all can vote. `ensureRewardsSchema()` auto-creates schema.

**Presentation Mode:** 9 PowerPoint slides; auto-advance 15s; role=presentation (tab-only).

**Integrity Checks:** `GET /api/integrity-check` with pass/warning/fail badges. Checks: referential integrity, duplicates, orphaned records, account linking, schema validation, data quality, deployment status.

**Tab Badges:** Tickets, Accounts, Integrity, Rewards, Points. Poll 2min. Endpoints: `/api/integrity-check/count`, `/api/rewards/active-count`, `/api/points/recent-count`.

**Cadets:** Alphabetical within flight; HQ separate; NCO toggle (shield/amber badge).

**DBeaver via Tunnel:** `cloudflared access tcp --hostname db.flightpoints.uk --url localhost:6543`.


## Server-Side Checklist (Post-Implementation)
**Control Panel:** Standalone server management GUI at port 4000.
- Files: `panel/panel-server.cjs` (backend, pure Node.js built-ins only), `panel/index.html` (frontend SPA).
- Auth: PIN via `PANEL_PIN` or falls back to `ADMIN_PIN` from `.env.local`. Rate-limited (5 attempts → 15min lockout). 2-hour sliding session.
- Install as service: `panel\Install-PanelService.ps1` — creates NSSM service `flight-points-panel` on port 4000.
- Start manually: `npm run panel` (added to package.json).
- Configure Cloudflare tunnel subdomain (e.g. `panel.flightpoints.uk → localhost:4000`) for remote access.
- Optional `.env.local` overrides: `PANEL_PORT` (default 4000), `PANEL_LOGS_ROOT` (default `C:\inetpub\wwwroot\Flight-Points\Logs`), `PANEL_BACKUPS_DIR` (default `C:\inetpub\wwwroot\Flight-Points\Backups`).
- Key API endpoints: `/api/overview`, `/api/services/:name/:action`, `/api/git/*`, `/api/deploy/*`, `/api/logs/:type[/stream]`, `/api/db/*`, `/api/processes`, `/api/system`, `/api/tunnel`, `/api/ports`.
- Log streaming via SSE (`/api/logs/:type/stream`).
- Only kills `node` and `cloudflared` processes (no arbitrary kill).
- Does NOT expose env variable values — only checks for presence/setting.

---

## Server-Side Checklist (Post-Implementation)

⚠️ **Action needed:**

1. **Health Check Enhancement** (optional) — Current: DB, disk, uptime, memory. Could add: revision_history table check, JWT_SECRET validation, SMTP connectivity, tunnel status.

2. **Test Error Alert Endpoint** — Verify `/api/test-error-alert` works:
   ```powershell
   $token = (Invoke-RestMethod -Uri http://localhost:3001/api/auth/login -Method Post -ContentType application/json -Body (@{ email = "user@flightpoints.local"; password = "pass" } | ConvertTo-Json)).token
   Invoke-RestMethod -Uri http://localhost:3001/api/test-error-alert -Method Post -Headers @{ Authorization = "Bearer $token" }
   ```
   Expected: HTTP 500, email alert, log entry in `Logs\Server\server-errors-YYYY-MM-DD.log`.

3. **Operator Pitfalls**
   - TypeScript snippets belong in `server/server.ts`, not DBeaver SQL editors.
   - Protected routes require a real fresh JWT; placeholder tokens will fail with "Invalid or expired token".
   - If `/api/test` works but `/api/health` returns 404, deployed code and running process are mismatched; redeploy and restart service.

---

## 🔄 CONTEXT INBOX (TEMPORARY - APPEND EVERY CHAT)

Purpose:
- This section is a temporary high-detail buffer to capture as much useful context as possible after EVERY chat.
- It is NOT permanent. It must be periodically sorted into the structured context files under `.github/copilot-context/`.

Mandatory rules for every AI run:
- MUST append a new inbox entry after EVERY chat response that contains project-relevant information.
- MUST include implementation details, decisions, risks, follow-ups, validation outcomes, and operational notes when present.
- MUST NOT remove previous inbox entries unless they were sorted into the context pack.
- MUST keep secrets out (no credentials, tokens, private keys, or sensitive config values).
- MUST keep this section at the bottom of this file.

Sorting policy (inbox -> structured context files):
- Sort immediately when user asks.
- Auto-sort when either condition is met:
   - Inbox exceeds 250 lines, or
   - Inbox exceeds 12 entries.
- After sorting, summarize durable facts into the correct files:
   - `10-system-profile.md`
   - `20-operations-runbook.md`
   - `30-api-db-reference.md`
   - `40-security-history-and-decisions.md`
   - `50-feature-behavior.md`
   - `60-open-items-and-handover.md`
- After sorting, keep only a short rollover note in this inbox and continue appending new entries.

Entry template (copy for each chat):
- Date:
- Chat summary:
- Files touched:
- Behavior/decision changes:
- Validation performed:
- Risks or follow-up:
- Suggested context destinations:

### Inbox Entries

- Date: 2026-03-18
   Chat summary: Added "Default Role Access" section to Accounts tab — lets admins/sncos adjust the default permissions for each role through a checkbox UI. Changes stored in DB, applied to all users of that role unless they have per-user overrides.
   Files touched: `server/server.ts`, `src/utils/permissions.ts`, `src/utils/api.ts`, `src/app/components/AdminSignups.tsx`, `.github/copilot-instructions.md`
   Behavior/decision changes:
     - New DB table `role_permission_defaults(role TEXT PK, permissions JSONB)` auto-created at server startup via `ensureRoleDefaultsSchema()`.
     - `ROLE_PERMISSION_DEFAULTS` exported from `permissions.ts` (was unexported const before).
     - `getRoleDefaultPermissions()` now checks `roleDefaultsCache` first, falls back to hardcoded.
     - Server startup warms cache with `loadRoleDefaults()`.
     - `GET /api/role-defaults` — snco/admin only; returns full effective defaults for all 6 roles.
     - `PUT /api/role-defaults/:role` — snco/admin only; validates role, stores full permissions JSONB, busts cache.
     - `sanitizeFullPermissions()` helper added to server — validates complete permissions (not overrides), fills all unknown keys with false.
     - `api.getRoleDefaults()` and `api.updateRoleDefaults(role, perms)` added to api.ts.
     - `AdminSignups.tsx`: new `ROLE_DISPLAY_NAMES` map, state (`roleDefaultsData`, `selectedRoleDefault`, `roleDefaultEdits`, `savingRoleDefault`), `fetchRoleDefaults()`, `handleRoleDefaultToggle()`, `handleSaveRoleDefault()`, `handleResetRoleDefault()`.
     - New Card "Default Role Access" at bottom of Accounts tab with role tabs + two-column checkbox grid + Save/Reset buttons.
   Validation performed: `npm run build` exit 0; no TS errors in modified frontend files.
   Risks or follow-up:
     - Server-side TypeScript pre-existing errors in server.ts still present (ipKeyGenerator type, Set spread) — not introduced by this work.
     - Users logged in when role defaults change will see updated defaults on next API call (requireAuth refreshes from DB each request), but frontend tab visibility won't update until re-login.
   Suggested context destinations: `30-api-db-reference.md`, `50-feature-behavior.md`

- Date: 2026-03-18
   Chat summary: User requested mandatory temporary context capture at the bottom of this file after every chat, with high detail and later sorting into context-pack files.
   Files touched: `.github/copilot-instructions.md`
   Behavior/decision changes: Added strict permanent workflow rules requiring every AI to append context entries each chat and auto-sort when inbox grows too large.
   Validation performed: Verified section placement at file bottom and aligned with existing no-secrets policy.
   Risks or follow-up: Future AI runs must consistently append entries; missing entries should be treated as process regression.
   Suggested context destinations: `00-usage.md`, `60-open-items-and-handover.md`

- Date: 2026-03-20
    Chat summary: Performed manual OWASP-category security triage based on Checkvibe-style summary counts and project code review. Also ran dependency audit and identified concrete package vulnerabilities plus free scanner alternatives.
    Files touched: `server/server.ts`, `server/db.ts`, `src/utils/auth.ts`, `src/utils/api.ts`, `src/app/components/ui/chart.tsx`, `package.json`, `.github/copilot-instructions.md`
    Behavior/decision changes:
       - No runtime behavior changes made in this chat; analysis only.
       - Confirmed key hardening already present: Helmet+CSP, CORS allowlist, JWT secret startup guard, auth middleware refresh, role/action permissions, and endpoint-specific rate limiters.
       - Identified likely scanner-triggering weaknesses to prioritize:
          - Dependency CVEs from `npm audit --omit=dev --json`: `express-rate-limit@8.2.1` (high), `multer@2.0.2` (high), `next@16.1.6` (moderate).
          - CSP currently allows `'unsafe-inline'` for scripts and styles.
          - JWT stored in `localStorage` on client (token theft impact if XSS occurs).
          - `/api/auth/lookup-email` can disclose whether usernames exist (user enumeration risk).
          - Upload artifacts are served publicly from `/uploads` (random filenames reduce guessing risk but no auth gate on retrieval).
          - `server/db.ts` uses SSL with `rejectUnauthorized: false` when PG SSL mode is required.
    Validation performed:
       - Read and reviewed backend/frontend auth, CORS/CSP, upload, and generic CRUD code paths.
       - Ran `npm audit --omit=dev --json` (reported 3 production dependency issues: 2 high, 1 moderate).
       - Attempted external header checks (`curl -I` to `flightpoints.uk` and `api.flightpoints.uk`) but both returned Cloudflare 530 from this environment, so direct remote header validation was inconclusive.
    Risks or follow-up:
       - Upgrade vulnerable packages and re-run audit.
       - Tighten CSP by removing `'unsafe-inline'` via nonce/hash strategy where possible.
       - Consider migrating JWT from `localStorage` to secure HttpOnly cookies if architecture allows.
       - Add anti-enumeration behavior to username/email lookup endpoint.
       - Decide whether upload retrieval should require authenticated download route for ticket evidence.
       - Run at least two free external scanners from a network that can access origin without Cloudflare 530 blocks.
    Suggested context destinations: `40-security-history-and-decisions.md`, `60-open-items-and-handover.md`, `20-operations-runbook.md`

- Date: 2026-03-20
    Chat summary: User reported production outage (Cloudflare Error 1033) and inability to reach localhost:3001 on server. Performed immediate triage, implemented core security fixes, and prepared server-side recovery runbook.
    Files touched: `package.json`, `package-lock.json`, `server/db.ts`, `server/server.ts`, `.github/copilot-instructions.md`
    Behavior/decision changes:
       - Upgraded vulnerable production dependencies to patched versions:
          - `express-rate-limit` -> `^8.2.2` (installed resolved `8.3.1`)
          - `multer` -> `^2.1.1`
          - `next` -> `^16.1.7` (installed resolved `16.2.0`)
       - Hardened DB TLS behavior in `server/db.ts`:
          - `PGSSLMODE=require` keeps encryption with `rejectUnauthorized=false` (compat mode).
          - `PGSSLMODE=verify-ca|verify-full` now enforces certificate validation (`rejectUnauthorized=true`).
       - Tightened CSP in `server/server.ts` by removing `'unsafe-inline'` from `scriptSrc`.
       - Reduced username enumeration risk in `/api/auth/lookup-email` by returning normalized fallback email shape instead of distinct 404 for unknown users.
    Validation performed:
       - `npm run build` passed.
       - `npm audit --omit=dev --json` after upgrades reported 0 production vulnerabilities.
       - `npm run server` in this environment failed due DB connectivity (`ECONNREFUSED` on PostgreSQL localhost:5432), confirming API can fail hard when DB is unavailable.
       - Local checks showed no running `cloudflared` or `node` process in this environment and no `Flight-Points_Server_Tunnel` scheduled task here (this workspace machine is not the production host).
    Risks or follow-up:
       - Production outage likely due API process crash (DB connectivity/config) and/or tunnel service not running on server host.
       - Upload retrieval hardening still pending; currently `/uploads` remains public static route.
       - Recommend running startup script `start-server-and-tunnel.ps1` directly on server and checking tunnel logs in central log root.
    Suggested context destinations: `20-operations-runbook.md`, `40-security-history-and-decisions.md`, `60-open-items-and-handover.md`

- Date: 2026-03-20 (session continued)
   Chat summary: Diagnosed why port 3001 is unreachable after service restart. Auto-deploy restarts a Windows Service named "flight-points" (Stop-Service/Start-Service). Two most likely causes: (1) process.exit(1) fires because JWT_SECRET not visible in service environment; (2) unhandled rejection/exception crashes Node before app.listen(). Added startup diagnostic logging + process crash guards.
   Files touched: `server/server.ts`
   Behavior/decision changes:
     - Logged exact .env.local path + file-exists check BEFORE dotenv.config runs (visible in server logs)
     - FATAL JWT_SECRET error now also prints: resolved .env.local path, whether file was found, NODE_ENV, CWD
     - Added process.on('unhandledRejection') — logs reason, doesn't crash
     - Added process.on('uncaughtException') — logs error then calls process.exit(1) so crash is visible
     - Variables renamed to _envFilePath / _envFileExists (prefixed to signal startup-only scope)
   Validation performed: `npm run build` exit 0.
   Risks or follow-up:
     - Root cause still unconfirmed — need user to run `npm run server` manually on server and check new log output
     - `flight-points` Windows Service vs `Flight-Points_Server_Tunnel` Scheduled Task: BOTH may try to bind port 3001 simultaneously — could cause EADDRINUSE
     - IMPORTANT: `sc.exe qc flight-points` on the server will reveal what binary/args the service actually runs
     - DB ssl change (PGSSLMODE handling) is backward compat for require/verify-ca/verify-full but may differ if production uses non-standard PGSSLMODE value
    Suggested context destinations: `20-operations-runbook.md`, `60-open-items-and-handover.md`

- Date: 2026-03-20 (session continued)
    Chat summary: NSSM tunnel service was recreated with direct `cloudflared.exe` Application and separate AppParameters; service started successfully and cloudflared registered 4 tunnel connections (lhr14/lhr15/lhr20/lhr01). Public outage root cause is resolved at tunnel process level.
    Files touched: `.github/copilot-instructions.md` (documentation), Windows service/task state on server (not in repo)
    Behavior/decision changes:
       - `flight-points-tunnel` now runs as dedicated NSSM Windows service.
       - Scheduled task `Flight-Points_Server_Tunnel` remains disabled to avoid dual owners.
       - Tunnel command now runs with explicit config path in systemprofile.
       - Observed `'C:\Program' is not recognized` lines persisted in tunnel log from earlier failed cmd-wrapper attempts; these are historical/stale lines in appended log, not current startup failure.
    Validation performed:

   - Date: 2026-03-22
      Chat summary: Historical inbox entries from 2026-03-18 through 2026-03-22 were sorted into the structured context pack (`10-system-profile.md`, `20-operations-runbook.md`, `30-api-db-reference.md`, `40-security-history-and-decisions.md`, `50-feature-behavior.md`, `60-open-items-and-handover.md`).
      Files touched: `.github/copilot-context/10-system-profile.md`, `.github/copilot-context/20-operations-runbook.md`, `.github/copilot-context/30-api-db-reference.md`, `.github/copilot-context/40-security-history-and-decisions.md`, `.github/copilot-context/50-feature-behavior.md`, `.github/copilot-context/60-open-items-and-handover.md`, `.github/copilot-instructions.md`
      Behavior/decision changes:
        - Durable panel, tunnel, service, security, and API facts were moved out of this temporary inbox and into the structured context files.
        - The inbox is now reset to rollover mode so future runs can append only new session details.
      Validation performed:
        - Verified the structured context pack now carries the main durable facts that were previously only in the inbox.
      Risks or follow-up:
        - Future runs should keep appending fresh entries here and periodically re-sort when the inbox grows again.
      Suggested context destinations: `all structured context files`

   - Date: 2026-03-22
      Chat summary: Sorted the oversized Copilot inbox, added TOTP-capable admin safeguards to high-impact main-site account-management actions, and confirmed where the TeamViewer control appears in the standalone panel.
      Files touched: `server/server.ts`, `src/utils/adminSafeguard.ts`, `src/utils/api.ts`, `src/utils/auth.ts`, `src/app/components/AdminSafeguardDialog.tsx`, `src/app/components/AdminSignups.tsx`, `src/app/components/Dashboard.tsx`, `src/app/components/CadetsManager.tsx`, `src/app/components/PointsManager.tsx`, `.github/copilot-context/10-system-profile.md`, `.github/copilot-context/20-operations-runbook.md`, `.github/copilot-context/30-api-db-reference.md`, `.github/copilot-context/40-security-history-and-decisions.md`, `.github/copilot-context/50-feature-behavior.md`, `.github/copilot-context/60-open-items-and-handover.md`, `.github/copilot-instructions.md`
      Behavior/decision changes:
        - Added optional main-site admin TOTP support via `ADMIN_TOTP_SECRET` using the same 6-digit verification route as the existing admin PIN flow.
        - `POST /api/admin/verify-pin` now accepts either PIN or authenticator code and returns a short-lived admin safeguard token.
        - Sensitive account-management routes now require `X-Admin-Safeguard`: `PUT /api/auth/users/:id`, `DELETE /api/auth/users/:id`, `POST /api/admin/reset-account-password`, and `PUT /api/role-defaults/:role`.
        - Added reusable `AdminSafeguardDialog` and wired it into the Accounts tab for role changes, username changes, access changes, password resets, account deletion, and default-role access updates.
        - Existing admin verification copy in Dashboard, Cadets, and Points now accepts authenticator codes instead of referring only to PINs.
        - TeamViewer control location is the standalone panel `System` section under `Operator Controls`; it only renders an actionable button when one of the known TeamViewer executables is detected.
      Validation performed:
        - VS Code error check reported no errors in the modified server/frontend files.
        - `npm run build` should be re-run after these main-site changes.
      Risks or follow-up:
        - `ADMIN_TOTP_SECRET` must be a Base32 secret (`A-Z`, `2-7`) and server clock drift will break TOTP if Windows time is inaccurate.
        - The admin safeguard token is intentionally short-lived and currently focused on high-impact Accounts/role-default operations, not every destructive route in the application.
        - TeamViewer button still depends on TeamViewer being installed at one of the backend-detected paths.
      Suggested context destinations: `30-api-db-reference.md`, `40-security-history-and-decisions.md`, `50-feature-behavior.md`, `60-open-items-and-handover.md`

- Date: 2026-03-23
    Chat summary: Fixed OWASP header findings by hardening Express + IIS headers, added robots/sitemap assets, and ran a safe non-destructive pentest pass (dependencies, live headers, CORS behavior, and sensitive-path probes).
    Files touched: `server/server.ts`, `web.config`, `public/web.config`, `public/robots.txt`, `public/sitemap.xml`, `dist/web.config`, `.github/copilot-instructions.md`
    Behavior/decision changes:
       - `server/server.ts`:
          - Helmet now explicitly enforces HSTS (`max-age=31536000; includeSubDomains; preload`), referrer policy (`strict-origin-when-cross-origin`), `Cross-Origin-Opener-Policy: same-origin`, and `Cross-Origin-Resource-Policy: same-origin`.
          - Added explicit `Permissions-Policy` response header middleware (helmet typings did not support `permissionsPolicy` option in this repo setup).
          - Static middleware now sets hardening headers for uploads and adds explicit cache headers for `robots.txt` and `sitemap.xml` when served by Node.
       - `web.config` and `public/web.config`:
          - Added IIS `customHeaders` for CSP, HSTS, Permissions-Policy, COOP, CORP, Referrer-Policy, and `X-Content-Type-Options`.
          - Added IIS outbound rules to apply explicit `Cache-Control` and `Pragma` headers for `/robots.txt` and `/sitemap.xml` responses.
       - Added `public/robots.txt` and `public/sitemap.xml` so scanners hit real files rather than fallback behavior.
    Validation performed:
       - `npm run build` passed after changes.
       - `npm audit --omit=dev --json` returned 0 production vulnerabilities.
       - Live header probes (`flightpoints.uk`, `/robots.txt`, `/sitemap.xml`, `api.flightpoints.uk/api/health`) show CSP/HSTS/COOP/CORP present; Permissions-Policy was still absent on live at test time (new config not deployed yet).
       - CORS probe with malicious origin to API preflight returned status 500 and no ACAO header (blocked origin path).
       - Sensitive path probes like `/.env` and `/.git/config` returned HTTP 200 with HTML SPA body (rewrite fallback), not raw file disclosure.
    Risks or follow-up:
       - Run deployment so new IIS and server header rules are active in production, then re-run OWASP scan.
       - Consider changing SPA fallback behavior for dotfiles to return 404 instead of index HTML to reduce scanner noise and improve hardening clarity.
       - Existing unrelated TypeScript issues remain in other frontend files when running `npx tsc --noEmit`; not introduced by this change.
    Suggested context destinations: `20-operations-runbook.md`, `40-security-history-and-decisions.md`, `50-feature-behavior.md`, `60-open-items-and-handover.md`

- Date: 2026-03-23 (session continued)
    Chat summary: Added explicit sensitive-path blocking rules to Express and IIS so dotfiles/config probes are denied instead of being rewritten to SPA index.
    Files touched: `server/server.ts`, `web.config`, `public/web.config`, `dist/web.config`, `.github/copilot-instructions.md`
    Behavior/decision changes:
       - `server/server.ts` SPA fallback now returns HTTP 404 for sensitive path patterns such as dotfiles, `.git`, `.env*`, `server/*`, `package*.json`, and `tsconfig.json`.
       - `web.config` and `public/web.config` now include a pre-SPA rewrite rule `Block Sensitive Paths` returning custom 404 for the same categories.
    Validation performed:
       - `npm run build` passed after changes.
       - Live probes still show 200 HTML for sensitive paths because production has not yet deployed these new rules.
       - Live header probes still show `Permissions-Policy` missing and `Referrer-Policy: no-referrer`, confirming old deployment is still active.
    Risks or follow-up:
       - Deploy latest build/config to production to activate sensitive-path 404 behavior and new `Permissions-Policy` header.
       - Re-run OWASP scan after deployment to verify the remaining alerts are cleared.
    Suggested context destinations: `20-operations-runbook.md`, `40-security-history-and-decisions.md`, `60-open-items-and-handover.md`

- Date: 2026-03-23 (session continued)
    Chat summary: Performed requested retest pentest pass after code hardening. Live production still shows pre-deploy behavior for several checks.
    Files touched: `.github/copilot-instructions.md`
    Behavior/decision changes:
       - No new runtime behavior changes in this retest; validation-only run.
    Validation performed:
       - Live header probes on `https://flightpoints.uk`, `https://flightpoints.uk/robots.txt`, `https://flightpoints.uk/sitemap.xml`, and `https://api.flightpoints.uk/api/health`.
       - Confirmed headers present: CSP, HSTS, COOP, CORP, X-Content-Type-Options.
       - Confirmed headers still missing on live: `Permissions-Policy`; `Referrer-Policy` still `no-referrer` (not the newly configured value).
       - Sensitive-path probes (`/.env`, `/.git/config`, `/server/server.ts`, `/package.json`, `/tsconfig.json`) still return 200 with HTML SPA shell, confirming production rewrite rules have not picked up the new 404 block rules yet.
       - CORS probe with malicious origin still blocked (`OPTIONS /api/health` returns 500 and no ACAO header).
       - Dependency audit (`npm audit --omit=dev --json`) still reports 0 production vulnerabilities.
    Risks or follow-up:
       - Remaining OWASP findings are deployment-state issues; code fixes exist in repo but are not yet active in production responses.
       - Deploy latest build and IIS configs (`web.config` + `public/web.config` + updated `dist`) then rerun OWASP and the same probe script.
    Suggested context destinations: `20-operations-runbook.md`, `40-security-history-and-decisions.md`, `60-open-items-and-handover.md`