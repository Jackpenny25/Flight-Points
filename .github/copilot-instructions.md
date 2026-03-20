
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

**Last Updated:** 2026-03-20 (NSSM root cause found and fixed; site restored)

- Date: 2026-03-20 (RESOLVED)
   Chat summary: Root cause of port 3001 unreachable was NSSM configured to launch `npm.ps1` (a PowerShell script) directly. NSSM uses CreateProcess which cannot execute .ps1 or .cmd files. Fixed by setting Application=cmd.exe and AppParameters="/c npm run server". Also set AppEnvironmentExtra to inject the correct PATH (nodejs dir + npm global) for the LocalSystem account. Server now starts successfully on port 3001.
   Files touched: `server/server.ts` (startup diagnostics helped confirm it), NSSM service config on server (not in repo), `server-backup.ps1`
   Behavior/decision changes:
     - NSSM service "flight-points" now configured as:
        - Application: C:\Windows\System32\cmd.exe
        - AppParameters: /c npm run server
        - AppDirectory: C:\inetpub\wwwroot\Flight-Points\Code\Flight-Points
        - AppEnvironmentExtra: PATH=C:\Program Files\nodejs;C:\Users\Admin\AppData\Roaming\npm;C:\Windows\System32;C:\Windows
        - AppStdout/AppStderr: C:\inetpub\wwwroot\Flight-Points\Logs\Server\nssm-stdout.log
     - IMPORTANT: If the service ever needs to be recreated, use cmd.exe as the binary, NOT npm.ps1/npm.cmd
     - Project is installed at: C:\inetpub\wwwroot\Flight-Points\Code\Flight-Points (subfolder under Code)
     - Backup works correctly — .dump files are binary format, not corrupted; confirmed pg_dump path: C:\Program Files\PostgreSQL\18\bin\pg_dump.exe
     - server-backup.ps1 now logs pg_dump output, exit code, and file size after backup
   Validation performed:
     - netstat confirmed TCP 0.0.0.0:3001 and [::]:3001 LISTENING (PID 5640)
     - nssm-stdout.log showed clean startup: [startup] diagnostics + "Server running on http://localhost:3001"
     - backup ran successfully: flight-points-db-20260320-171921.dump
   Risks or follow-up:
     - The AppEnvironmentExtra PATH only includes a minimal set. If future tools (e.g. git hooks, tsx) need additional paths, add them to the AppEnvironmentExtra.
     - The scheduled task "Flight-Points_Server_Tunnel" (state: Ready, not Running) is apparently NOT required for the API server — NSSM handles it. The scheduled task likely handles the Cloudflare tunnel only. Verify this and document clearly.
     - CORS "Not allowed by CORS" errors appeared in nssm-stdout.log — these came from something hitting the API from an unlisted origin immediately after startup (probably the scheduled task's tunnel health check hitting localhost directly, which has no Origin header... actually the error suggests an Origin header was present). May want to investigate what is generating those requests.
   Suggested context destinations: `20-operations-runbook.md`, `60-open-items-and-handover.md`