

## Flight-Points Copilot Instructions

## Core Working Rules
- Do not use Supabase. This project uses a PostgreSQL database on a server.
- The user has database access and can make DB changes in DBeaver.
- Keep this file frequently updated with new project notes and decisions as changes happen.
- Prefer doing as much as possible without human input; ask for clarification when needed.
- Be explicit when uncertain or when more info is required.
- Clearly state when the user needs to do a manual step.
- Explain things in simple terms and say exactly what to do and where.
- Use the VS Code built-in terminal (normally PowerShell) for commands.
- You have permission to make repo file changes without asking first.

## Deployment and Environment Context
- The website runs on a local server the user can access over wireless.
- Typical workflow: edit code on local machine, then use `Deploy.bat` to pull latest code to server and restart services.
- Backend should load environment values from `.env.local` (not `.env.example`).
- App DB credentials are expected in project root `.env.local` via `DATABASE_URL`.
- PostgreSQL local server SSL mode should be non-SSL unless explicitly required (`PGSSLMODE=disable`).

## Auth and Admin Notes
- Admin PIN is env-based and must be exactly 6 digits in `.env.local`.
- Admin PIN verification is server-side and restricted to lead roles.

## Cloudflare / DB Tunnel Notes
- `db.flightpoints.uk` currently resolves to Cloudflare IPs; direct TCP to `5432/5433` from local PC may fail.
- For remote DB access in DBeaver, use Cloudflare TCP access locally:
	- Run `cloudflared access tcp --hostname db.flightpoints.uk --url localhost:6543`
	- Keep it running and connect DBeaver to `localhost:6543`
- In PowerShell, run local executable as `.\cloudflared.exe` unless folder is in PATH.
- Some installs place binary at `C:\Program Files (x86)\cloudflared\cloudflared.exe`.
- For cloudflared `2026.x`, pass config before subcommands:
	- `cloudflared tunnel --config <file> ingress validate`
	- `cloudflared tunnel --config <file> run <tunnel-id>`
- Ingress rule ordering matters:
	- Only one catch-all rule (missing hostname/path)
	- Catch-all must be final rule
	- Earlier catch-all blocks later hostname rules like `db.flightpoints.uk`

## Migration / Audit Notes (Current)
- Project is local/server-first with PostgreSQL and `.env.local`.
- Removed legacy GitHub Pages deployment workflow to prevent accidental cloud deploys.
- Removed GitHub Pages-specific metadata/comments from `package.json` and `vite.config.ts`.
- Privacy policy text should describe providers generically (not GitHub Pages) and not mention RAF or Biggin Hill.

---

## Legacy Quick Reference (Condensed, may be outdated)
- Context: RAF Cadet Squadron flight-points system at `https://flightpoints.uk`, full-stack app with PostgreSQL backend.
- Legacy stack: Node.js + Express + TypeScript backend; React 18 + TypeScript + Vite frontend; JWT + `bcrypt`; Cloudflare proxy/tunnel.
- Legacy DB tables: `app_users`, `cadets`, `points`, `attendance`, `attendance_bulks`, `rewards`, `admin_pins`, `signup_codes`, `tickets`.
- Legacy API shape: auth endpoints under `/api/auth/*`, CRUD under `/api/data/:type`, reports (`/api/leaderboards`, `/api/attendance/reports`, `/api/integrity-check`), and `/api/admin/*`.
- Legacy auth/security snapshot: role-based access (`snco/staff/cadet`), rate limiting, CORS restricted to `flightpoints.uk`, JWT expiry noted inconsistently (`7d` and `24h`).
- Legacy operations snapshot: PostgreSQL + tunnel + API generally auto-start; manual fallback run command is `cd Flight-Points && npm run server`.
- Legacy maintenance commands: `Get-Service postgresql-x64-18`, `npm run build`, `Get-Process cloudflared`, `pg_dump -h localhost -U postgres -d flightpoints > backup.sql`.
- Legacy limitations: remote DB access may require Cloudflare TCP tunnel or remote desktop; no automated email/SMS; responsive web app (no native mobile app).
- Treat current `.env.local` and active server/runtime configuration as authoritative over all legacy items.

## Update Protocol
- When new project details are confirmed, add them to this file in the most relevant section and keep wording concise.
- Add date-stamped entries for time-sensitive items using `LATEST PROJECT NOTES (YYYY-MM-DD)` with clear bullets.
- Keep current/authoritative notes above legacy notes, and mark uncertain or older information as legacy.