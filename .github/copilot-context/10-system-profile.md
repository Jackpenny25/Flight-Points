# System Profile

## Core stack
- Frontend: React + TypeScript + Vite + Tailwind + shadcn/ui
- Backend: Express + TypeScript in server/server.ts
- Database: PostgreSQL via DATABASE_URL in .env.local
- Auth: JWT (7d), bcrypt, role-based access
- Hosting: Windows Server + Cloudflare Tunnel + domain flightpoints.uk
- Dependency updates: Dependabot monthly, grouped updates, low PR cap

## Roles
- snco: full admin features
- pointgiver: points for own flight + attendance actions
- staff: points across flights, no attendance admin
- cadet: self views (points/leaderboards/rewards/tickets)
- presentation: presentation tab only

## Auth/account model
- Signup removed; accounts created by SNOs in app
- Login input is username; stored internally as {username}@flightpoints.local
- Password convention: two words + 2 digits, no separators (example EagleBolt47)
- Admin PIN: server-side only from ADMIN_PIN env var

## Critical env vars
- DATABASE_URL
- JWT_SECRET
- ADMIN_PIN
- SMTP_TO, SMTP_FROM, SMTP_SERVER, SMTP_PORT, SMTP_USER, SMTP_PASS (alerts)

## Repo safety
- No secrets in repo or context files
- Keep all credentials/env values out of markdown and code comments

## High-level architecture notes
- Generic CRUD route family: /api/data/:type
- Dedicated domain routes for points, attendance reports, rewards, integrity, tickets, health
- mapToDb/mapToClient perform naming conversion (camelCase <-> snake_case)
- All data is API-backed only (no local storage mode)

## Known removed/deprecated items
- setupFetch.ts
- localApiShim.ts
- localStore.ts
- RoleChangePanel.tsx
- AdminPinManager.tsx
- DownloadCsvButton.tsx
- downloadCsvUtil.ts
- CSV export intentionally removed
