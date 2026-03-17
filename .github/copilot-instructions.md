
Dont commit yourself as it confuses me.

---

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

**Tables:** cadets, points, attendance, attendance_bulks, rewards, reward_suggestions, reward_votes, app_users, tickets, revision_history (auto-created).

---

## Auth & Accounts

- **Signup:** Removed. SNOs create in "Accounts" tab.
- **Login:** Username only (stored as `{username}@flightpoints.local`).
- **Passwords:** Two words + 2-digit number, no separators (e.g., `EagleBolt47`).
- **Admin PIN:** 6 digits, env `ADMIN_PIN`, verified server-side only.
- **JWT tokens:** 7 days. Includes cadetId + flight from linked cadet.

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

**Last Updated:** 2026-03-17 (Phase 2 complete)