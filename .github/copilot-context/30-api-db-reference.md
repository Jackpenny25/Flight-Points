# API and Database Reference

## API patterns
- Generic CRUD: GET/POST/PUT/DELETE /api/data/:type
- Generic responses are flat arrays (not wrapped objects)
- Client-side guard pattern: Array.isArray(data) ? data : []

## Key dedicated endpoints
- /api/points
- /api/my-points
- /api/leaderboards
- /api/presentation-stats
- /api/attendance/reports
- /api/integrity-check
- /api/integrity-check/count
- /api/reward-suggestions
- /api/rewards/active-count
- /api/points/recent-count
- /api/tickets
- /api/health
- /api/upload
- /api/upload/ticket-evidence
- /api/admin/verify-pin
- /api/revision-history/:type/:id
- /api/test-error-alert (admin test path)

## Data mapping
- mapToDb(type, body): camelCase -> snake_case
- mapToClient(type, row): snake_case -> camelCase

## Main tables
- cadets: people roster + rank + flight + is_nco
- points: points awarded records
- attendance: per-cadet attendance entries
- attendance_bulks: batch attendance metadata
- rewards: reward lifecycle data
- reward_suggestions: suggestion queue
- reward_votes: votes per suggestion
- app_users: login identities, role links, and per-user `permissions` (JSONB overrides)
- tickets: issue tracking and evidence link
- revision_history: immutable change audit trail

## Account access management (2026-03-18)
- List/manage accounts endpoint includes permissions payload:
  - GET `/api/auth/users`
  - PUT `/api/auth/users/:id` supports `permissions` updates
- Effective permissions are role defaults merged with account overrides.
- Server-side enforcement now checks permission actions for key write paths (points, attendance, account management), not just role labels.

## Revision history columns of interest
- record_type, record_id, action, changed_by, changed_at
- changed_by_role
- changed_fields
- change_summary
- before_data, after_data

## Revision logging coverage
- Logged now:
  - PUT /api/data/:type/:id
  - DELETE /api/data/:type/:id
  - POST /api/points
  - PUT /api/attendance/:id/status

## Operator pitfall
- TypeScript snippets for endpoints belong in server code, not SQL tools (DBeaver) or raw PowerShell.
