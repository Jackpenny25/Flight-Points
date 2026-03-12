
Dont commit yourself as it confuses me.
## Flight-Points Copilot Instructions

Please frequently update when you learn new things about the project or make decisions. This file is intended to be a single source of truth for how to work on the project, and it should be updated as the project evolves.

Always test using `npm run build` and `npm run server` at the end of any large changes. If you break something, fix it immediately. Unlwess it is broken on purpose.

## Project Stack
- **Frontend**: React + TypeScript + Vite + Tailwind CSS + shadcn/ui components
- **Backend**: Express.js (TypeScript, run with tsx) at `server/server.ts`
- **Database**: PostgreSQL on the server, accessed via `DATABASE_URL` in `.env.local`
- **Auth**: JWT-based with bcrypt passwords. Roles: `snco`, `pointgiver`, `staff`, `cadet`, `presentation`
- **Hosting**: flightpoints.uk via Cloudflare Tunnel. Local server with auto-deploy.
- Do **not** use Supabase.

## Deployment
- Workflow: edit locally, commit & push; server auto-deploys (checks every 2 min via `auto-deploy.ps1` Scheduled Task).
- Manual deploy: `Deploy.bat` (requires admin for service restart).
- Auto-deploy setup: run `setup-auto-deploy.ps1` as Administrator on server.
- `.env.local` must contain `DATABASE_URL`, `JWT_SECRET`, and `ADMIN_PIN` (6 digits).

### Server & Cloudflare Tunnel Automation
Use `start-server-and-tunnel.ps1` to run both `npm run server` and `cloudflared tunnel` with auto-restart:
- **Run manually:** `.\start-server-and-tunnel.ps1` in PowerShell (repo root)
- **Run on server startup:** Register as Scheduled Task (Administrator PowerShell): 
  ```powershell
  $TaskName = "Flight-Points_Server_Tunnel"
  $ScriptPath = "C:\Users\Admin\...\Flight-Points\start-server-and-tunnel.ps1"
  $Action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$ScriptPath`""
  $Trigger = New-ScheduledTaskTrigger -AtStartup
  Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -RunLevel Highest
  ```
- **Logs:** Both services log to `C:\inetpub\wwwroot\Flight-Points\Logs\Server` and `Logs\Tunnel` with timestamps
- **Monitor:** Tail logs in PowerShell: `Get-Content -Path "C:\inetpub\wwwroot\Flight-Points\Logs\Server\*.log" -Tail 20`
- **Stop:** Press Ctrl+C in the PowerShell window; gracefully shuts down both services
- **Important:** `npm run server` is the API process (Express backend). If this task is running, the API is running.

### What Should Restart Automatically
- **Server reboot:** Scheduled Task `Flight-Points_Server_Tunnel` starts both API server and Cloudflare tunnel.
- **API crash while script is running:** `start-server-and-tunnel.ps1` auto-restarts API.
- **Tunnel crash while script is running:** `start-server-and-tunnel.ps1` auto-restarts tunnel.
- **Auto-deploy checker:** separate Scheduled Task for `auto-deploy.ps1` should also be enabled.
- **Backups:** separate Scheduled Task `FlightPoints-Weekly-Backup` runs Sundays at 03:00.

Startup verification commands:
```powershell
Get-ScheduledTask -TaskName "Flight-Points_Server_Tunnel","FlightPoints-Weekly-Backup"
Get-ScheduledTaskInfo -TaskName "Flight-Points_Server_Tunnel"
Get-ScheduledTaskInfo -TaskName "FlightPoints-Weekly-Backup"
```

### Centralized Log Locations
All Flight-Points logs go to `C:\inetpub\wwwroot\Flight-Points\Logs\`:
- **Server** (`\Logs\Server\`): Express.js server output (started by start-server-and-tunnel.ps1)
- **Server errors** (`\Logs\Server\server-errors-YYYY-MM-DD.log`): global 5xx error log entries from `server/server.ts`
- **Tunnel** (`\Logs\Tunnel\`): Cloudflare tunnel output (started by start-server-and-tunnel.ps1)
- **Deploy** (`\Logs\Deploy\`): auto-deploy.ps1 logs (deployment checks, git pull, build output)
- **Backup** (`\Logs\Backup\`): server-backup.ps1 logs (database and file backup operations)

Monitor all logs: `Get-ChildItem "C:\inetpub\wwwroot\Flight-Points\Logs\**\*.log" | Sort-Object LastWriteTime -Descending | Select-Object -First 20 FullName,LastWriteTime`

### Test Website Error Alerting
Use this safe admin-only endpoint to test email + error file logging:
1. Get a fresh JWT token for an `snco` or `admin` account:
  ```powershell
  $loginBody = @{ email = "<username>@flightpoints.local"; password = "<password>" } | ConvertTo-Json
  $token = (Invoke-RestMethod -Method Post -Uri "http://localhost:3001/api/auth/login" -ContentType "application/json" -Body $loginBody).token
  ```
2. Send test request:
  ```powershell
  Invoke-RestMethod -Method Post -Uri "http://localhost:3001/api/test-error-alert" -Headers @{ Authorization = "Bearer $token" }
  ```
3. Expected result: HTTP 500 response, email alert sent, and entry appended to `\Logs\Server\server-errors-YYYY-MM-DD.log`.

### Deploy failure email alerts (server setup)
Use this exact checklist on the Windows server where `auto-deploy.ps1` runs:

1. Open the repo root `.env.local` on the server and add:
  - `SMTP_TO=your-email@domain.com`
  - `SMTP_FROM=alerts@your-domain.com`
  - `SMTP_SERVER=smtp.your-provider.com`
  - `SMTP_PORT=587`
  - `SMTP_USER=your-smtp-username`
  - `SMTP_PASS=your-smtp-password-or-app-password`
2. Restart the scheduled auto-deploy task (or reboot server) so the script reloads env values.
3. Confirm task is running under an account that can read `.env.local` and write to `data/deploy-status.json`.
4. Confirm outbound SMTP is allowed from the server (firewall/network).
5. Trigger a test failure safely:
  - Temporarily introduce a known build error locally, commit, push.
  - Wait for auto-deploy cycle.
  - Verify you receive email and `data/deploy-status.json` shows `"status": "failed"`.
  - Revert/fix immediately and push again.
6. Verify recovery:
  - Ensure a subsequent successful deploy updates `data/deploy-status.json` to `"status": "success"`.
  - In the app Integrity tab, confirm the red deploy failure alert disappears after success.

### Email alert troubleshooting
- No email and no log entry: verify Scheduled Task is running and script path is correct.
- Log says "Email alerting not configured": check `SMTP_TO`, `SMTP_FROM`, `SMTP_SERVER` are set and not blank.
- SMTP auth error: use an app password (not normal mailbox password) where required.
- TLS/connection error: verify `SMTP_PORT` and SSL policy of your provider.
- Integrity tab still red after fix: check timestamp and status in `data/deploy-status.json`; ensure latest deploy completed successfully.

## Core Working Rules
- The user has database access via DBeaver.
- Prefer doing as much as possible without human input; ask only when needed.
- Clearly state when the user needs to do a manual step.
- Use the VS Code terminal (PowerShell) for commands.
- You have permission to make repo file changes without asking first.
- `LOCAL_MODE` / `localApiShim.ts` / `localStore.ts` have been removed — all data goes through the live API. Do not re-introduce local storage mode.
- Deleted dead files: `src/app/setupFetch.ts`, `src/utils/localApiShim.ts`, `src/utils/localStore.ts`, `src/app/components/RoleChangePanel.tsx`, `src/app/components/AdminPinManager.tsx`, `src/app/components/DownloadCsvButton.tsx`, `src/app/components/downloadCsvUtil.ts`.
- CSV export functionality has been fully removed. Do not re-introduce CSV downloads.

## Database & API Architecture
- Generic CRUD: `GET/POST/PUT/DELETE /api/data/:type` with `typeConfig` mapping.
- CRUD endpoints return **flat arrays** via `res.json(mapRowsToClient(...))`, NOT wrapped objects.
- Components must use `Array.isArray(data) ? data : []` when consuming generic endpoints.
- Type aliases: `cadets`, `points`, `attendance`, `attendancebulks`/`attendance_bulks`, `rewards`.
- `mapToDb(type, body)` converts camelCase to snake_case; `mapToClient(type, row)` does reverse.
- Dedicated endpoints: `/api/points` (POST), `/api/my-points` (GET), `/api/leaderboards`, `/api/presentation-stats`, `/api/attendance/reports`, `/api/integrity-check`, `/api/reward-suggestions`, `/api/tickets`, `/api/notifications` (stub).

## Tables
- `cadets` — id, name, flight, rank, is_nco, created_at, updated_at
- `points` — id, cadet_name, date, flight, reason, points, type, given_by, created_at, updated_at
- `attendance` — id, cadet_name, date, flight, status (enum), submitted_by, bulk_id, created_at
- `attendance_bulks` — id, date, flight_filter, total_records, total_present, submitted_by, created_at
- `rewards` — id, title, how_to_win, prize, ends_at, winner_name, status, created_by, created_at, updated_at
- `reward_suggestions` — id, title, description, suggested_by, suggested_by_name, suggested_at
- `reward_votes` — id, suggestion_id, user_id, created_at (UNIQUE on suggestion_id+user_id)
- `app_users` — id, email, name, role, password_hash, cadet_id (FK to cadets), created_by, created_at
- `tickets` — id, title, description, created_by, created_at, status, priority, updated_at, assigned_to, type, category, evidence_url, comments (JSONB)

## Role Permissions
| Role | Access |
|------|--------|
| `snco` (Flight Point Lead) | Full access: admin mode, cadets, reports, attendance, points, presentations, accounts |
| `pointgiver` | Give points (own flight only), mark attendance |
| `staff` | Give points (any flight), NO attendance, no admin |
| `cadet` | Leaderboards, rewards, tickets, my points |
| `presentation` | Presentation tab only |

## Auth & Accounts
- Self-signup removed. Admins (snco) create accounts in the "Accounts" tab.
- Usernames stored as `{username}@flightpoints.local` in `email` column. Login accepts just username.
- Passwords: Word-Word-Number format (e.g. Eagle-Bravo-47).
- `app_users.cadet_id` links to `cadets.id`. JWT includes `cadetId` and `flight` from linked cadet.
- Admin PIN is env-based (6 digits in `.env.local`), verified server-side, restricted to snco.
- Dashboard logo click (snco) opens PIN dialog; correct PIN activates admin mode (logo switches to logo-black.jpg).

## Points Rules
- `POST /api/points` — roles: snco, admin, staff, pointgiver.
- Pointgivers can only give points to cadets in their own flight (server-enforced).
- NCOs (`is_nco = true`) and HQ/Staff cadets (`flight = 'hq'`) cannot receive points (server-enforced).
- PointsManager auto-detects flight from entered names with real-time validation.

## LATEST PROJECT NOTES (2026-03-09)
- Added `server-backup.ps1` at repo root for server-side backups with editable source paths in-script.
- Backup paths should be configured directly in `$BackupSources`; output location in `$BackupRoot`.
- `server-backup.ps1` now supports PostgreSQL dumps from root `.env.local` (`DATABASE_URL`) and 30-day cleanup.
- Added `install-backup-task.ps1` to register/update a Windows Scheduled Task for Sunday automatic backups.
- **Attendance Save Scope** (2026-03-07): In `AttendanceManager`, **Save All** now always saves all non-HQ cadets in the current flight filter; it no longer limits submission to `selectedIds`. `selectedIds` is only for bulk status actions (Mark Selected Present/Clear Selected).
- **Attendance Defaults & Session Editing** (2026-03-07): New bulk attendance statuses now default to **absent** to reduce accidental presents. In the Recent Attendance panel, sessions can be expanded to view per-cadet statuses and SNCOs can edit each saved record (present/absent) inline.
- **Auto-Deploy Lock Hardening** (2026-03-07): `auto-deploy.ps1` now enforces a single running instance via a global mutex, handles stale `.git/index.lock` files safely, and aborts deployment steps on command failures instead of continuing. `setup-auto-deploy.ps1` now sets scheduled task `-MultipleInstances IgnoreNew`.
- **Security Hardening** (2026-03-09):
  - `helmet` added for HTTP security headers (X-Frame-Options, X-Content-Type-Options, etc.)
  - `JWT_SECRET` no longer has a fallback default — server refuses to start if not set or equals 'changeme'
  - `VITE_ADMIN_PIN` fallback removed from server — only `ADMIN_PIN` env var is read to prevent client-side leakage
  - PIN verify endpoint rate-limited (5 attempts per 15 minutes) to prevent brute force
  - `GET /api/data/:type` and `GET /api/data/:type/:id` now require authentication (previously open to anyone)
  - Attendance data leak fixed — cadets only see their own records via proper auth middleware instead of fragile try/catch fallback
  - File upload (`POST /api/upload`) now requires authentication, validates MIME type (JPEG/PNG/GIF/WebP/PDF/TXT), enforces 5 MB limit, uses randomized filenames
  - `POST /api/upload/ticket-evidence` alias added to match client-side `api.uploadTicketEvidence` endpoint
  - `express.json()` limited to 1 MB to prevent request body abuse
- **Deploy Email Alerting** (2026-03-09): `auto-deploy.ps1` now writes `data/deploy-status.json` on success/failure and sends email on deploy failure via SMTP (configured via `SMTP_TO`, `SMTP_FROM`, `SMTP_SERVER`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` in `.env.local`).
- **Deploy Status in Integrity Tab** (2026-03-09): `GET /api/integrity-check` and `/api/integrity-check/count` now include Deployment category. If the last deploy failed, a prominent pulsing red banner appears at the top of the Integrity tab and the tab badge count increases.
- **Usage Rate Limiting** (2026-03-10): 
  - Daily limits enforceable on attendance bulk submission and points giving:
    - `pointgiver` / `staff`: 1 attendance report + 20 points/day
    - `snco` / `admin`: 5 attendance reports + 30 points/day
  - Limits checked before processing requests; on violation, returns HTTP 429 + email alert to admins
  - Infrastructure: `checkAttendanceLimit()`, `checkPointsLimit()`, `incrementAttendanceCount()`, `incrementPointsCount()` in `server/server.ts`
  - Usage tracker resets daily based on `getToday()` ISO date string
  - `notifyAdminOfLimitReached()` sends email when user hits limit
- **Global Error Alert Handler** (2026-03-10): 
  - Global Express error handler now catches all 5xx errors and sends email alerts to admins
  - Prevents exposure of stack traces to client in production; development mode includes error details
  - Email alert includes: timestamp, status code, endpoint, user, IP, first 10 lines of stack trace
  - Error handler registered after all routes and before server start

---

## Cadets
- Sorted alphabetically (A to Z) within each flight.
- HQ members in separate "Staff / HQ Flight" section. Rank shown in blue.
- NCO toggle (shield icon) on each card with amber highlight and "NCO" badge.
- `formatFlight('hq')` returns "Staff / HQ Flight".

## Attendance
- AttendanceManager uses bulk submission. Data parsing uses `Array.isArray()` guards.
- Attendance summary endpoint: `/api/attendance/reports`.

## Rewards
- Three categories: Active, Claimed (winner set), Previous/Expired (past `ends_at`).
- Status: `active` to `claimed` when winner saved. Badge: green/amber/grey.
- Winner input has cadet name autocomplete (partial matching).
- Suggestion and voting system: any role except snco can suggest; all can vote (toggle).
- **Reward Suggestions Moderation** (2026-03-04): Suggestions start as `pending` and only SNOs can see them. SNOs can **Approve** (moves to `approved` status and becomes visible to others for voting) or **Reject** (deletes suggestion). Approved suggestions appear with vote counts. Only approved suggestions can be voted on and create rewards.
- `ensureRewardsSchema()` auto-creates columns/tables on first use (no manual migration needed).
- Endpoints: `GET/POST /api/reward-suggestions` (with status filtering), `POST /:id/vote`, `DELETE /:id`, `PUT /:id/moderate` (SNO only).

## Presentation Mode
- 9 PowerPoint-style slides with dark slate/gold/green theme.
- Auto-advance 15s, data refresh 30s. Controls auto-hide after 3s.
- Slides: Flight Summary, Top Cadets + Flight of Month, Leaderboard, Rising Cadets, Flight Race, Weekly Comparison, Attendance Streaks, Recent Activity, Rewards.
- `presentation` role users see only this tab.

## Cloudflare & DBeaver
- For DBeaver via Cloudflare Tunnel: `cloudflared access tcp --hostname db.flightpoints.uk --url localhost:6543`, then connect DBeaver to localhost:6543.
- Ingress catch-all must be the last rule.
- `cloudflared` 2026.x: pass `--config` before subcommands.

## Integrity Checks
- `GET /api/integrity-check` runs comprehensive database validation checks grouped by category.
- DataIntegrity.tsx displays results with pass/warning/fail badges and category grouping.
- Checks cover: referential integrity, duplicates, orphaned records, account linking, schema validation, data quality, and more.
- Duplicate points and multiple attendance records per day are informational (`pass`) and are excluded from `/api/integrity-check/count` badge totals.

## Tab Notification Badges (2026-03-04)
- Badges show on tabs when there are important updates/issues to review.
- **Tickets** (SNOs/Admins): Red badge shows count of open tickets
- **Accounts** (SNOs, in admin mode): Red badge shows count of pending signups
- **Integrity** (SNOs/Admins): Red badge shows count of data integrity issues (failures + warnings)
- **Rewards** (All roles): Red badge shows count of active/unclaimed rewards
- **Points** (Point givers/SNOs): Red badge shows count of recently added points (last 24 hours, by others)
- Poll interval: 120 seconds (2 minutes) for all badge counts
- API endpoints: `/api/integrity-check/count`, `/api/rewards/active-count`, `/api/points/recent-count`