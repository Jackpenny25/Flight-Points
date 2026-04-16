
Dont commit yourself as it confuses me.

---UPDATE THIS FILE ALOT AND ANY NECCESSARY CONTEXT FILES WITH ANY IMPORTANT INFORMATION YOU THINK IS RELEVANT TO THE PROJECT. This is the single source of truth for the project and should be updated with any learnings and decisions.

## ⚠️ USER NOTES (DO NOT TOUCH - CRITICAL INFO)

**ADD YOUR IMPORTANT NOTES HERE:**
- When Running "npm run server" dont wait for it to respond as this is on a different device to the server and all of the info. I may use ctl + c to stop it but please stop it after a while.

- No secrets should be stored in this repo and escpially in this file as it is public(Same for the other context files) dont add anything that can make the website vulnerable.

- Please update this file with ANY infomation and update the other context files with any important information you think is relevant to the project. This is the single source of truth for the project and should be updated with any learnings and decisions.  

-When I ask you to sort through the inbox and move important information to the context files please do so and make sure to update this file with any important information you think is relevant to the project. This is the single source of truth for the project and should be updated with any learnings and decisions and please always consider adding features to the integrity tab and the panel which can make it easier for the handover and the control of the system. Also please update the privacy policy with any new features that may have privacy implications.

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
- Auth: TOTP via `PANEL_TOTP_SECRET` (or fallback `ADMIN_TOTP_SECRET`) plus long backup code (`ADMIN_BACKUP_CODE`). Rate-limited lockout and 2-hour sliding session.
- Install as service: `panel\Install-PanelService.ps1` — creates NSSM service `flight-points-panel` on port 4000.
- Start manually: `npm run panel` (added to package.json).
- Configure Cloudflare tunnel subdomain (e.g. `panel.flightpoints.uk → localhost:4000`) for remote access.
- Optional `.env.local` overrides: `PANEL_PORT` (default 4000), `PANEL_LOGS_ROOT` (default `C:\inetpub\wwwroot\Flight-Points\Logs`), `PANEL_BACKUPS_DIR` (default `C:\inetpub\wwwroot\Flight-Points\Backups`).
- Key API endpoints: `/api/overview`, `/api/services/:name/:action`, `/api/git/*`, `/api/deploy/*`, `/api/logs/:type[/stream]`, `/api/db/*`, `/api/processes`, `/api/system`, `/api/tunnel`, `/api/ports`, `/api/commands/catalog`, `/api/commands/run`.
- Log streaming via SSE (`/api/logs/:type/stream`).
- Only kills `node` and `cloudflared` processes (no arbitrary kill).
- Does NOT expose env variable values — only checks for presence/setting.
- Command Center tab includes a large editable command library (service/deploy/network/logs/SQL/ops), copy-to-clipboard workflow, and PowerShell output capture directly in panel UI.

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

- Date: 2026-03-23
   Chat summary: Fixed 5 broken features in `panel/panel-server.cjs` that were visible in panel screenshots.
   Files touched: `panel/panel-server.cjs`
   Behavior/decision changes:
     1. **execSync added to require**: `const { exec, execSync } = require('child_process')` — needed for dynamic tool discovery.
     2. **TOOL_CANDIDATES expanded**: Added user-level Git paths (`%HOMEDIR%\AppData\Local\Programs\Git\cmd\git.exe`), Scoop, Chocolatey, and nvm paths for git/node/npm/npx so NSSM service context finds them even without system PATH entries.
     3. **RESOLVED_TOOLS dynamic fallback**: After static path scan, now calls `where.exe <tool>` via `execSync` as a fallback. Startup console log shows which paths resolved (or "NOT FOUND") to help diagnose NSSM PATH issues.
     4. **`ps()` now injects PANEL_EXEC_ENV**: Added `env: PANEL_EXEC_ENV` to the exec call inside `ps()`. Previously only `shell()` had it; PS scripts calling tools (e.g. cloudflared scripts) had no augmented PATH.
     5. **Cloudflared process detection**: `getTunnelSummary()` now checks `Get-Process -Name cloudflared,cloudflared-windows-amd64` to cover both process name variants used by different cloudflared builds.
     6. **`flight-points-panel` added to service queries**: Both `getServicesMap()` and `handleServices()` now include the panel service in the PS `foreach` loop so the panel shows its own status.
   Validation performed: `npm run build` exit 0; `node --check panel/panel-server.cjs` no errors.
   Risks or follow-up:
     - If git is installed in a completely custom path not covered by hardcoded candidates AND `where.exe git` fails under NSSM service PATH, git will still show "NOT FOUND". User should check startup log `[panel] Tool resolution:` line to diagnose.
     - NSSM service needs to be restarted to pick up the new panel-server.cjs code.
     - Consider adding PANEL_GIT_PATH env variable override for custom git installs.
   Suggested context destinations: `20-operations-runbook.md`, `50-feature-behavior.md`

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

- Date: 2026-03-23
   Chat summary: Created a slide-by-slide PowerPoint outline for introducing Flight Points to cadets. Covers aim, structure, points, leaderboard, rewards, attendance, tickets, accounts, roles, and key rules. Also includes AI tool recommendations.
   Files touched: `docs/cadet-intro-presentation.md`
   Behavior/decision changes: No code changes. New documentation artefact only.
   Validation performed: File created successfully.
   Risks or follow-up: Squadron branding/colours and cadet photos need to be added before presenting. SNCO should review Key Rules slide before use.
   Suggested context destinations: None — this is a one-off presentation resource.
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

   - Date: 2026-04-08
       Chat summary: Added a full panel Command Center so the standalone panel can stay separate from the main website and be used to recover/restart the main services remotely with many prebuilt copy/run commands.
       Files touched: `panel/panel-server.cjs`, `panel/index.html`, `.github/copilot-context/50-feature-behavior.md`, `.github/copilot-context/20-operations-runbook.md`, `.github/copilot-instructions.md`
       Behavior/decision changes:
          - Confirmed architecture: panel is a separate service (`flight-points-panel` on port 4000) and can run even when `flight-points` API is down.
          - Added command catalog API: `GET /api/commands/catalog` with grouped command packs and metadata.
          - Added command runner API: `POST /api/commands/run` executes PowerShell on the server host, returning stdout/stderr, exit code, timeout, and duration.
          - Added elevation-aware execution checks: commands marked `requiresElevation` now verify if panel service account is admin before running; non-elevated contexts get explicit guidance.
          - Added new panel sidebar tab `Command Center` with search/filter, command cards, `Use`, `Copy`, and `Run` actions.
          - Added editable command textarea and output terminal so operators can tweak commands (including SQL templates) before execution.
          - Added many built-in commands across service control, git/deploy, health/network, logs/events, SQL helpers, and ops toolbox.
       Validation performed:
          - `node --check panel/panel-server.cjs` passed.
          - `npm run build` passed.
       Risks or follow-up:
          - Some commands (service restart, reboot, IIS reset) require elevated service account; if panel service runs under a non-admin account they will fail by design.
          - SQL templates are provided as editable snippets; direct SQL execution still depends on available tooling (`psql` or DBeaver/manual copy).
          - For always-on remote recovery, ensure NSSM recovery options for `flight-points-panel` are configured to auto-restart on failure.
       Suggested context destinations: `20-operations-runbook.md`, `50-feature-behavior.md`, `60-open-items-and-handover.md`

   - Date: 2026-04-08
       Chat summary: User reported Command Center showing "Loading" with no command cards. Added explicit UI error rendering for command-catalog failures and likely stale-service guidance.
       Files touched: `panel/index.html`, `.github/copilot-instructions.md`
       Behavior/decision changes:
          - `loadCommandCenter()` now writes a visible card-level error message and reason when `/api/commands/catalog` is unavailable.
          - UI now instructs operator to restart `flight-points-panel` when frontend is newer than running backend.
       Validation performed:
          - VS Code error scan for `panel/index.html` reported no errors.
       Risks or follow-up:
          - User still needs to restart panel service on the server host for backend route changes to take effect.
       Suggested context destinations: `20-operations-runbook.md`, `50-feature-behavior.md`

   - Date: 2026-04-08
       Chat summary: Investigated persistent "commands not found" report and confirmed dual panel backend files exist; only one includes Command Center routes.
       Files touched: `.github/copilot-instructions.md`
       Behavior/decision changes:
          - Verified command catalog definitions live in `panel/panel-server.cjs` (`COMMAND_LIBRARY` + `/api/commands/catalog` + `/api/commands/run`).
          - Verified legacy `panel/panel-server.js` does not contain those routes and still uses old PIN-based auth flow.
          - Verified installer `panel/Install-PanelService.ps1` targets `panel/panel-server.cjs` by default.
       Validation performed:
          - Source search across `panel/` for `COMMAND_LIBRARY` and `/api/commands/catalog`.
       Risks or follow-up:
          - If production service was manually configured to run `panel-server.js`, Command Center will always show Not found until service config points to `panel-server.cjs`.
       Suggested context destinations: `20-operations-runbook.md`, `60-open-items-and-handover.md`

- Date: 2026-04-10
    Chat summary: Created a ready-to-present slide-by-slide speaker notes draft introducing the reward scheme, including what it is, how points and rewards work, account sign-up/onboarding flow, permissions, security/fairness controls, and FAQs.
    Files touched: `docs/reward-scheme-powerpoint-notes.md`, `.github/copilot-instructions.md`
    Behavior/decision changes:
       - Added a new documentation artifact with 12 suggested slides and detailed speaker notes.
       - Included content aligned with current platform behavior: no self-signup, role-based access, points awarding boundaries, reward lifecycle, and suggestion/vote workflow.
       - Added optional presenter prompts for cadet-only vs staff-focused delivery.
    Validation performed:
       - Confirmed notes content aligns with current project instructions context for rewards/account flow.
    Risks or follow-up:
       - Slide deck visuals are not generated yet; this is a script/notes file for manual import into PowerPoint.
       - If local policy wording differs by squadron, minor wording customization may be needed before delivery.
    Suggested context destinations: `50-feature-behavior.md`, `60-open-items-and-handover.md`

- Date: 2026-04-10
    Chat summary: Condensed and refined the reward scheme presentation notes to a tighter script targeted to approximately 1,000 words while preserving all core sections (what it is, how it works, account setup, permissions, fairness, and FAQs).
    Files touched: `docs/reward-scheme-powerpoint-notes.md`, `.github/copilot-instructions.md`
    Behavior/decision changes:
       - Rewrote all 12 slide speaker-note sections with clearer, denser phrasing and stronger presenter flow.
       - Preserved existing structure and scope while improving practical delivery language for cadet and staff audiences.
       - Kept optional presenter prompts and adjusted timing guidance to match the revised script density.
    Validation performed:
       - Measured updated file word count using PowerShell (`Measure-Object -Word`) to confirm it is close to requested size.
    Risks or follow-up:
       - Exact spoken duration still depends on presenter pace and amount of ad-libbed examples.
       - If required, a cadet-only cut-down or staff-briefing variant can be derived from this baseline.
    Suggested context destinations: `50-feature-behavior.md`, `60-open-items-and-handover.md`

- Date: 2026-04-10
    Chat summary: User requested the reward scheme notes be reduced to under 1,000 words; completed a full concise rewrite while preserving all 12 slides and required sections.
    Files touched: `docs/reward-scheme-powerpoint-notes.md`, `.github/copilot-instructions.md`
    Behavior/decision changes:
       - Replaced the previous expanded draft with a shorter script that still covers scheme purpose, points flow, rewards lifecycle, sign-up/account process, permissions, controls, cadet participation, FAQ, and closing call to action.
       - Simplified language for clearer delivery and easier timing control during live presentation.
    Validation performed:
       - Measured final word count with PowerShell (`Measure-Object -Word`) and confirmed it is below 1,000 words.
    Risks or follow-up:
       - Further shortening may remove useful delivery context; if needed, produce a separate quick-brief variant rather than trimming this baseline further.
    Suggested context destinations: `50-feature-behavior.md`, `60-open-items-and-handover.md`

- Date: 2026-04-10
    Chat summary: User requested a much shorter notes script capped below 1,000 characters; replaced the full speaker notes with an ultra-compact slide-by-slide summary.
    Files touched: `docs/reward-scheme-powerpoint-notes.md`, `.github/copilot-instructions.md`
    Behavior/decision changes:
       - Rewrote the notes into 12 compact slide lines (S1-S12) covering what it is, how points/rewards work, signup, permissions, controls, participation, FAQ, and close.
       - Removed verbose wording and optional presenter prompts to meet strict character limits.
    Validation performed:
       - Measured exact character length in PowerShell with string `.Length` and confirmed total content is 911 characters.
    Risks or follow-up:
       - This format is intentionally terse and may be too brief for longer spoken delivery without ad-lib.
       - If needed, create two versions: ultra-compact (<=1000 chars) and presenter-expanded (~800-1000 words).
    Suggested context destinations: `50-feature-behavior.md`, `60-open-items-and-handover.md`

- Date: 2026-04-16
    Chat summary: Fixed tab badge notification behavior. Badges that require action (tickets, integrity) now only show counts for actionable items. Informational badges (rewards, points) now clear when the user visits the tab.
    Files touched: `server/server.ts`, `src/app/components/Dashboard.tsx`, `src/app/components/TicketsAdmin.tsx`
    Behavior/decision changes:
       - `/api/tickets/count` now filters `WHERE status = 'open'` instead of counting all tickets. Badge only shows open (unactioned) tickets.
       - Integrity badge unchanged — already correct (shows failures/warnings requiring fixes).
       - Rewards and Points badges now clear instantly when user clicks into those tabs (informational, view-only).
       - `TicketsAdmin` now accepts `onTicketAction` callback prop; Dashboard passes a callback that re-fetches ticket count immediately after approve/reject, so badge updates without waiting for 2-minute poll.
    Validation performed:
       - `npm run build` passed successfully.
    Risks or follow-up:
       - Rewards/points badges will reappear on next 2-minute poll if new data exists — this is intentional (new unviewed info).
       - If a ticket has a NULL status (legacy data), it won't be counted by the new query. Consider running `UPDATE tickets SET status = 'open' WHERE status IS NULL` if legacy rows exist.
    Suggested context destinations: `50-feature-behavior.md`, `30-api-db-reference.md`
