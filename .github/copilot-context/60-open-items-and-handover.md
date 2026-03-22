# Open Items and Handover

## Current state (2026-03-17)
- Point creation revision logging is implemented
- Health endpoint is implemented and verified
- Auto-deploy pre-check and smoke-check pipeline is implemented

## Current state update (2026-03-18)
- Per-account permission overrides implemented end-to-end:
	- Accounts UI can edit per-user tabs/actions
	- Server computes effective permissions and refreshes on auth requests
	- Points/attendance/account-management key routes enforce permission actions
	- Dashboard/TopNav/PointsManager/AttendanceManager consume effective permissions

## Current state update (2026-03-22)
- Control panel is publicly reachable at `https://panel.flightpoints.uk`.
- Control panel runtime is `panel/panel-server.cjs` and should remain the service target.
- Main website now supports optional TOTP-backed admin safeguards for the highest-impact account-management actions.

## Optional server enhancements
1. Expand /api/health checks
- Add revision_history table presence check
- Add JWT_SECRET sanity check
- Add SMTP connectivity check if SMTP configured
- Add tunnel process/status check if practical

2. Validate alerting path end-to-end
- Test endpoint: POST /api/test-error-alert
- Expected: 500 response + SMTP alert + server error log entry

3. Add a SQL view for readable audits (optional)
- Suggested view: revision_history_readable
- Include: changed_at, record_type, record_id, action, changed_by, changed_by_role, changed_fields, change_summary

4. Tighten file-access model for uploads (optional)
- Uploaded ticket evidence is still publicly served from `/uploads`.
- Consider moving retrieval behind an authenticated route if the evidence should not be world-readable.

5. Improve admin safeguard ergonomics (optional)
- If needed later, allow the safeguard token to stay valid briefly across multiple account-management edits rather than prompting for every guarded action.
- Consider adding QR provisioning or setup guidance for `ADMIN_TOTP_SECRET` similar to the panel documentation.

## Common pitfalls
- Do not run TypeScript snippets in DBeaver/SQL editor
- Do not use placeholder tokens for protected API tests
- If /api/test works but /api/health returns 404, deploy code mismatch is likely
- Do not place any hostname after the catch-all `http_status:404` ingress rule in the Cloudflare tunnel config.
- Do not point NSSM directly at `npm.ps1` for service startup.

## Operational assumptions to preserve
- No local-storage data mode
- No CSV export restoration
- Keep role restrictions server-enforced
- Keep deployment safety gates enabled

## Handover checklist for new contributor
- Read .github/copilot-instructions.md first
- Read .github/copilot-context/INDEX.md only if more detail is needed
- Run npm run build after major changes
- Run npm run server after major changes
- Verify no regression in auth, points restrictions, and attendance save scope
- Verify per-account permission overrides by changing a test user and confirming both UI visibility and backend enforcement
