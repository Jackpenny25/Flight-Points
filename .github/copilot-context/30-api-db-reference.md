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
- app_users: login identities and role links
- tickets: issue tracking and evidence link
- revision_history: immutable change audit trail

## Revision logging coverage
- Logged now:
  - PUT /api/data/:type/:id
  - DELETE /api/data/:type/:id
  - PUT /api/attendance/:id/status
- Not yet logged:
  - POST /api/points create (recommended next)
