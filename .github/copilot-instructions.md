

## Flight-Points Copilot Instructions

Please frequently update when you learn new things about the project or make decisions. This file is intended to be a single source of truth for how to work on the project, and it should be updated as the project evolves. The more detailed and up-to-date this file is, the better you can assist with code changes and other tasks.

Always test using npm run build and anything else at the end of any large changes that you do, to make sure you haven't broken anything. If you break something, fix it immediately before doing anything else.

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
- Typical workflow: edit code on local machine, commit & push; the server auto-deploys via scheduled task.
- Manual deploy is also available via `Deploy.bat` (requires admin for service restart).
- **Auto-deploy system**: `auto-deploy.ps1` runs as a Windows Scheduled Task (`FlightPoints-AutoDeploy`) under SYSTEM. It checks every 2 minutes for new commits on `main`, and if found: git pull, npm install, npm build, restart `flight-points` service. Logs to `auto-deploy.log`.
- To set up auto-deploy on a new server: run `setup-auto-deploy.ps1` as Administrator.
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

LATEST PROJECT NOTES (2026-02-27 - NCO support & cadets sorting):
- Cadets table now has an `is_nco` BOOLEAN column (default FALSE). Migration: `20260227_add_nco_to_cadets.sql` — must be run in DBeaver.
- NCOs cannot receive points. Enforced at three levels:
  1. Server: `POST /api/points` checks `is_nco` and rejects with 403.
  2. Server: generic `POST /api/data/points` also checks `is_nco`.
  3. Client: PointsManager name validation marks NCOs with red indicator and adds them to the invalid list.
- CadetsManager now shows an NCO toggle button (shield icon) on each cadet card. When toggled on, the card gets an amber highlight and "NCO" badge.
- Cadets are now sorted alphabetically (A-Z) within each flight column and in the HQ section.
- Server typeConfig for cadets changed orderBy from `created_at DESC` to `name ASC`.
- `isNco` is mapped to `is_nco` in the cadets typeConfig columns.

LATEST PROJECT NOTES (2026-02-27 - HQ/Staff points blocking & auto-deploy):
- Staff/HQ flight cadets (`flight = 'hq'`) cannot receive points. Enforced at three levels:
  1. Server: `POST /api/points` checks flight and rejects HQ cadets with 403.
  2. Server: generic `POST /api/data/points` also checks flight for HQ.
  3. Client: PointsManager marks HQ cadets with red indicator "Staff/HQ — cannot receive points".
- `ResolvedName` interface has both `isNco` and `isHq` fields. `isNco` is set to `true` for both NCOs and HQ cadets (to reuse the same exclusion logic). `isHq` is tracked separately for correct UI label.
- Auto-deploy system added: `auto-deploy.ps1` (runs as Scheduled Task), `setup-auto-deploy.ps1` (one-time setup on server). Checks every 2 min for new commits, deploys if found.

LATEST PROJECT NOTES (2026-02-27 - presentation mode rebuild):
- PresentationMode.tsx completely rewritten with 9 professional PowerPoint-style slides using dark slate/gold/green theme:
  1. Flight Points Summary (dark bg, flight totals table + winning cadet/flight tables)
  2. Top Cadets & Flight of the Month (combined: gold/silver/bronze podium at top with 1st place tallest, flight-of-the-month cards below)
  3. Complete Leaderboard (dark bg, single table or 2-col if >20 cadets)
  4. Rising Stars (top point earners this week — bar chart style)
  5. The Flight Race (horizontal bar chart comparing flights — sorted by most points at top)
  6. Weekly Comparison (table: this week vs last week with ▲/▼ arrows)
  7. Attendance Streaks (consecutive parade nights bar chart)
  8. Recent Points Activity (last 10 entries)
  9. Rewards (from database, table of active rewards)
- Global dark theme: dark slate (#2d3a45) background, gold (#FFD700) headings and accents, green (#22c55e) for positive changes, slate header bg (#3d4f5f) for tables.
- Podium: 1st place centre tallest (280px), 2nd left (220px), 3rd right (180px). Display order is 2nd-1st-3rd.
- Flight Race bars sorted by most points at top, least at bottom (descending).
- Flight of the Month merged into the Top Cadets slide as compact card row below the podium.
- PresentationEditor.tsx simplified to a clean launch page with "Start Presentation" button, slide list, and keyboard controls reference.
- Dashboard `presentation` tab now shows PresentationEditor (previously showed broken lucide-react Presentation icon). Old `presentationeditor` tab removed.
- Server `/api/leaderboards` now returns `detailedLeaderboard` array with per-cadet `flightPoints`, `attendancePoints`, `totalPoints` breakdown (uses subquery to get cadet's flight from cadets table).
- Server `/api/presentation-stats` endpoint provides: risingStars (top 10 this week), thisWeekFlights, lastWeekFlights, attendanceStreaks (consecutive present records), flightOfTheMonth (monthly winners).
- Presentation uses cornflower blue (#5b9bd5) headers, light blue (#dceaf6) alternating rows, dark (#3d4f5f) background for leaderboard/flight race/flight of the month slides.
- Flight colors defined: 1=red, 2=blue, 3=green, 4=orange, hq=purple.
- All presentation styles use inline CSSProperties for complete isolation from app styles.
- Controls: bottom bar with prev/pause/next, navigation dots, slide counter, close button. Keyboard: arrows, space, escape.
- Control bar auto-hides after 3 seconds of mouse inactivity, reappears on mouse movement (smooth translateY transition).
- Auto-advance every 15 seconds, data refresh every 30 seconds. SLIDE_COUNT = 9.
- PPTable: dark themed with slate header (#3d4f5f), gold header text, alternating semi-transparent rows.
- Leaderboard slide uses a single centred table by default; only splits into two columns when more than 20 cadets.
- Slide 1 (Flight Points): larger font (28px), reduced gap (48px), wider max-width (1400px) for better space usage.
- Recent Points slide shows last 10 entries with 22px font for good fit.
- Rewards slide shows 24px font for table text.
- PPTable non-compact padding increased to 14px 18px for better spacing.
- `Presentation.tsx` (old static data view) still exists but is no longer imported/used in Dashboard.

LATEST PROJECT NOTES (2026-02-28 - presentation role & slide tweaks):
- New role: `presentation` — user sees ONLY the Presentation tab (no leaderboards, points, cadets, etc.).
- Role permissions updated:
  - presentation: presentation tab only. No admin, no points, no attendance, no cadets.
  - snco (Flight Point Lead): keeps full access including presentation tab (in admin-unlocked mode).
- TopNav shows a single "Presentation" pill for presentation-role users.
- Dashboard defaults to `presentation` tab for presentation-role users.
- "Presentation" role added to both role dropdowns in AdminSignups: create account and existing account role editor.
- Cadets who already have an account are automatically excluded from the "Select Cadet" dropdown when creating a new account (existing behaviour, now documented).
- Server `/api/presentation-stats` now also returns `risingCadets` (top 10 earners this calendar month) alongside `risingStars` (weekly).
- Slide 4 renamed from "Rising Stars" to "Rising Cadets", now shows monthly top earners. 4th+ place bars changed from green to cornflower blue (#6495ED).
- Slide 1 (Flight Points): tables scaled up — title 64px, section headings 40px, table text 34px, max-width 1500px, content starts from top.
- Slide 2 (Top Cadets): podium moved up and enlarged — 1st=340px, 2nd=260px, 3rd=210px, medals 96px, names 28px, podium columns 190px wide.

LATEST PROJECT NOTES (2026-02-28 - rewards improvements):
- **Winner save bug fixed**: The `rewards` table now has `winner_name` (VARCHAR) and `status` (VARCHAR, default 'active') columns. Migration: `20260228_reward_suggestions_and_winner.sql`.
- `typeConfig` for rewards now maps `winnerName` → `winner_name` and `status` → `status`.
- When saving a winner (via "Save winner" button or Edit dialog), the reward's status is set to `'claimed'`, moving it out of active rewards.
- Rewards are now categorised into three sections: Active, Claimed (amber header), and Previous/Expired.
- Status badge shows: Active (green), Claimed (amber), Expired (grey).
- **Cadet name matching for winners**: Winner input fields now have autocomplete dropdown that matches cadet names from the cadets table (same partial-match logic as PointsManager). Works in both inline "Save winner" and Edit dialog.
- **Reward Suggestions & Voting system**: New `reward_suggestions` and `reward_votes` tables.
  - Any logged-in user except snco can suggest a reward (title + optional description).
  - All users can vote (toggle) on suggestions. Each user gets one vote per suggestion.
  - Suggestions are ordered by vote count (highest first).
  - Each suggestion shows: title, description, who suggested it, when, and vote count.
  - The suggester or snco can delete a suggestion.
  - UI: purple/indigo gradient header card in the Rewards tab, between Active Rewards and Claimed Rewards.
- Server endpoints added: `GET/POST /api/reward-suggestions`, `POST /api/reward-suggestions/:id/vote`, `DELETE /api/reward-suggestions/:id`.
- API methods added: `getRewardSuggestions()`, `createRewardSuggestion()`, `voteRewardSuggestion()`, `deleteRewardSuggestion()`.
- Migration must be run in DBeaver: `migrations/20260228_reward_suggestions_and_winner.sql`.