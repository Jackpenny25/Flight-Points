# Security History and Decisions

## Baseline hardening (2026-03-09)
- Helmet enabled for HTTP headers
- JWT_SECRET fallback removed; server requires valid secret
- ADMIN_PIN server-only validation (no client pin secret usage)
- PIN verify endpoint rate-limited (5/15min)
- Generic read endpoints protected by auth where previously open
- Attendance access corrected to enforce identity restrictions
- Upload endpoints require auth; MIME + size constraints; randomized filenames
- express.json body limit reduced to 1MB

## Account and abuse controls (2026-03-17)
- Login lockout with progressive delays
  - Delay sequence: 0s, 1s, 2s, 4s, 8s
  - Lock period: 15 minutes after 5 failed attempts
- Endpoint rate limits added
  - tickets: 10 per 15 min
  - points: 50 per 15 min
  - uploads: 10 per 15 min

## Authorization hardening (2026-03-18)
- Added per-account permissions in `app_users.permissions` JSONB.
- Auth middleware now refreshes effective permissions from database on authenticated requests.
- Key write routes now enforce action permissions (points/attendance/account management), reducing reliance on static role checks.

## Browser security policy
- CORS allowlist only
  - Dev: localhost:5173, localhost:3001
  - Prod: flightpoints.uk, api.flightpoints.uk
- CSP via Helmet configured with restricted defaults and allowed font/image/connect sources

## Security follow-up and hardening (2026-03-20)
- Upgraded production dependencies after audit findings:
  - `express-rate-limit`
  - `multer`
  - `next`
- `npm audit --omit=dev` was reduced to zero production vulnerabilities after the dependency upgrade pass.
- `/api/auth/lookup-email` was changed to return a normalized fallback shape rather than a distinct not-found response, reducing username enumeration value.
- PostgreSQL SSL handling in `server/db.ts` now distinguishes between compatibility mode (`PGSSLMODE=require`) and certificate-verifying modes (`verify-ca` / `verify-full`).
- Remaining open security concern: uploaded evidence files are still served from a public static path and may need an authenticated download model later.

## Analytics CSP exception
- Cloudflare Insights was explicitly allowed with a narrow script source and hash-based inline allowance rather than reopening broad inline script execution.

## Admin safeguard second factor (2026-03-22)
- Optional `ADMIN_TOTP_SECRET` now enables authenticator-code verification for high-impact admin actions in the main website.
- High-impact account-management and role-default changes now require a short-lived server-issued safeguard token, not only a client-side UI flag.
- Existing PIN-based admin unlock remains available as a backup path when TOTP is not configured.

## Integrity and auditing
- revision_history table auto-created
- recordRevision used for create/update/delete and attendance status updates
- revision history now includes readable metadata: changed_by_role, changed_fields, change_summary
- admin endpoint to inspect revision history by type/id

## Deploy safety controls
- Pre-deploy typecheck gate (npx tsc --noEmit)
- Post-deploy health smoke test (3 attempts)
- Auto rollback to previous commit on smoke failure

## Dependency update noise control
- Dependabot changed to monthly checks
- Open PR cap reduced to 2
