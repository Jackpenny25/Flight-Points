

## Flight-Points Copilot Instructions

Please frequently update when you learn new things about the project or make decisions. This file is intended to be a single source of truth for how to work on the project, and it should be updated as the project evolves.

Always test using `npm run build` at the end of any large changes. If you break something, fix it immediately.

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

## Core Working Rules
- The user has database access via DBeaver.
- Prefer doing as much as possible without human input; ask only when needed.
- Clearly state when the user needs to do a manual step.
- Use the VS Code terminal (PowerShell) for commands.
- You have permission to make repo file changes without asking first.
- `LOCAL_MODE` / `localApiShim.ts` / `localStore.ts` have been removed — all data goes through the live API. Do not re-introduce local storage mode.
- Deleted dead files: `src/app/setupFetch.ts`, `src/utils/localApiShim.ts`, `src/utils/localStore.ts`, `src/app/components/RoleChangePanel.tsx`, `src/app/components/AdminPinManager.tsx`.

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

## LATEST PROJECT NOTES (2026-03-01)
- Added `server-backup.ps1` at repo root for server-side backups with editable source paths in-script.
- Backup paths should be configured directly in `$BackupSources`; output location in `$BackupRoot`.
- `server-backup.ps1` now supports PostgreSQL dumps from root `.env.local` (`DATABASE_URL`) and 30-day cleanup.
- Added `install-backup-task.ps1` to register/update a Windows Scheduled Task for Sunday automatic backups.

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
- `ensureRewardsSchema()` auto-creates columns/tables on first use (no manual migration needed).
- Endpoints: `GET/POST /api/reward-suggestions`, `POST /:id/vote`, `DELETE /:id`.

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