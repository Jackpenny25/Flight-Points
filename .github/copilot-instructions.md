

## Flight-Points Copilot Instructions

Please frequently update when you learn new things about the project or make decisions. This file is intended to be a single source of truth for how to work on the project, and it should be updated as the project evolves. The more detailed and up-to-date this file is, the better you can assist with code changes and other tasks.

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
- Use Deploy.bat to pull latest code and restart the Flight-Points service on the server.
- DBeaver timeout check: db.flightpoints.uk currently resolves to Cloudflare IPs and direct TCP to 5432/5433 from local PC fails.
- If using Cloudflare Tunnel for Postgres, connect DBeaver to localhost via cloudflared access tcp; direct host:port to db.flightpoints.uk may timeout.
- Cloudflared ingress rule order matters: the catch-all fallback (service: http_status:404) must be the final rule, otherwise later hostnames (like db.flightpoints.uk) will never match.
- In PowerShell, run local executables from current folder with .\cloudflared.exe (not cloudflared) unless the folder is added to PATH.
- Any cloudflared ingress rule missing hostname/path is a catch-all; only one catch-all should exist and it must be the last rule.
- For cloudflared 2026.x, pass --config before subcommands: `cloudflared tunnel --config <file> ingress validate` and `cloudflared tunnel --config <file> run <tunnel-id>`.
- To use `cloudflared access tcp` from a local PC, cloudflared must be installed on that local PC (or run via full path to cloudflared.exe if not in PATH).
- On some Windows installs via winget, cloudflared may be at C:\Program Files (x86)\cloudflared\cloudflared.exe; use full path or open a new PowerShell session to refresh PATH.
- `cloudflared access tcp --hostname db.flightpoints.uk --url localhost:6543` is expected to stay running and show `Start Websocket listener`; in DBeaver, connect to localhost:6543 while it runs.
- Local PC test confirmed listener on localhost:6543 (TcpTestSucceeded=True) while cloudflared access tcp is running.
- App database credentials are configured in the project root .env.local via DATABASE_URL (backend loads .env.local).

LATEST PROJECT NOTES (2026-02-23 - migration audit):
- Project stack is local/server-first: PostgreSQL on server, backend reads .env.local, and deployment is performed with Deploy.bat on the local/squadron server.
- Removed legacy GitHub Pages deployment workflow from the repo to avoid accidental cloud deploys.
- Removed GitHub Pages-specific metadata/comment references from package.json and vite.config.ts.
- Privacy policy text should describe server/infrastructure providers generically (not GitHub Pages) and must not mention RAF or Biggin Hill.

LATEST PROJECT NOTES (2026-02-26 - role and cadets updates):
- Dashboard logo (logo.png) is always visible for logged-in users. Clicking it as a Flight Point Lead (snco) opens PIN dialog; after correct PIN, logo switches to logo-black.jpg and admin mode is active.
- Download CSV tab has been removed from the UI (TopNav and Dashboard).
- Role permissions:
  - snco (Flight Point Lead): full access including admin mode, cadets, reports, attendance, points, presentations.
  - pointgiver: can give points and mark attendance.
  - staff: same as pointgiver — can give points BUT cannot mark attendance, cannot access admin features.
  - cadet: leaderboards, rewards, tickets, my points.
- TopNav now has a separate `canMarkAttendance` prop (distinct from `canGivePoints`) to control attendance tab visibility.
- Cadets table has a `rank` column (VARCHAR, added via migration 20260226_add_rank_to_cadets.sql). Run this migration in DBeaver.
- Staff/HQ Flight members are stored in the cadets table with `flight = 'hq'` and an optional `rank` field (e.g. "Fg Off", "Flt Lt").
- In CadetsManager, HQ members display in a separate "Staff / HQ Flight" section beneath the numbered flights. Rank is shown in blue before their name.
- `formatFlight('hq')` returns "Staff / HQ Flight".
- When adding a cadet, selecting "Staff / HQ Flight" as the flight reveals a rank input field.
- Edit dialog also shows rank field when flight is 'hq'.
- HQ members are not drag-droppable between flights (they stay in the HQ section).
- Account names should match the cadets entry name for points/attendance linking (rank is stored separately, not prefixed into the name column).

LATEST PROJECT NOTES (2026-02-26 - admin account creation):
- Self-signup flow has been REMOVED. Cadets can no longer create their own accounts via the login page.
- The login page now shows only a sign-in form (username + password). No signup tab.
- Accounts are created by admins (snco role) in the "Accounts" tab (formerly "Signups").
- The Accounts tab has two sections:
  1. "Create Account" — admin selects a cadet from the cadets table dropdown (grouped by flight), picks a role, and clicks Create. The system generates a username (lowercase name with dots, e.g. john.smith) and a secure memorable password (Word-Word-Number format, e.g. Eagle-Bravo-47). Credentials are shown once with copy buttons.
  2. "Existing Accounts" — searchable table of all accounts showing name, username, role. Each row has: role selector with Save button, "New Password" button (generates a fresh password and displays it), and Delete button.
- Usernames are stored as `{username}@flightpoints.local` in the `email` column of `app_users`. Login supports entering just the username part.
- `app_users` table has new columns: `created_by TEXT` and `cadet_id UUID REFERENCES cadets(id) ON DELETE SET NULL`.
- Migration file: `migrations/20260226_admin_account_creation.sql` — must be run in DBeaver.
- Password word list and generation logic are in server/server.ts (PASSWORD_WORDS array, generatePassword(), generateUsername() functions).
- Server endpoints: POST /api/admin/create-account, POST /api/admin/reset-account-password, DELETE /api/auth/users/:id, POST /api/auth/lookup-email.
- Old signup system removed: no more join codes, signup_requests, signup_codes, pending approvals, or request-signup endpoint.
- TopNav tab renamed from "Signups" to "Accounts".

LATEST PROJECT NOTES (2026-02-27 - points tab improvements):
- Points giving now uses a dedicated `POST /api/points` endpoint (not the generic `/api/data/points`). Allowed roles: snco, admin, staff, pointgiver.
- Pointgivers (`pointgiver` role) can ONLY give points to cadets in their own flight. Enforced server-side and shown in the UI.
- Staff (`staff`) and Flight Point Lead (`snco`) can give points to any cadet in any flight.
- JWT now includes `cadetId` and `flight` fields (looked up from linked cadet record at login time). Stored in `user_metadata` on the client.
- Users must re-login after deploying this change to get the new JWT with flight info.
- PointsManager form now has numbered steps: Step 1 (names), Step 2 (flight — auto-detected), Step 3 (type), Step 4 (points), Step 5 (reason).
- Flight is auto-detected from entered cadet names. If all cadets are in one flight, it shows that flight with a green tick. If cadets span multiple flights, it shows badges for each flight. The manual dropdown is only shown as fallback when no names are matched yet.
- Each cadet's points are submitted with their own flight (not a single selected flight for all).
- Name confirmation: as names are typed, a matched cadets list shows below the textarea with green ticks for found names, amber warnings for ambiguous, red for not found, and red for flight-restricted (pointgivers only).
- Accounts tab: usernames can now be edited inline (pencil icon). Server validates uniqueness. Delete button is now a red "Delete" button with text. Username preview shown when creating accounts.
- `api.createPoint()` now calls `/api/points` instead of `/api/data/points`.