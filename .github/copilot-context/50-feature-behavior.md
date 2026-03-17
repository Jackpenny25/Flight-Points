# Feature Behavior Notes

## Points
- Allowed award roles: snco, staff, pointgiver
- pointgiver can only award own flight
- NCO and HQ cadets are blocked from receiving points
- PointsManager auto-detects and validates flight

## Attendance
- Bulk submission model in AttendanceManager
- Save All saves all non-HQ cadets in selected flight
- selectedIds are for bulk state operations only
- New bulk defaults to absent
- Recent sessions support expansion and inline status edits

## Rewards
- Reward states: active -> claimed -> expired
- Suggestion states: pending -> approved/rejected
- Any role except snco can suggest
- Voting available when suggestion is approved
- ensureRewardsSchema auto-creates required schema on demand

## Presentation mode
- Dedicated presentation role and tab-only access
- 9-slide rotation with auto-advance

## Integrity and badges
- Integrity endpoint groups checks and severities
- Badge polling every 2 minutes
- Badge sources: tickets, accounts, integrity, rewards, points recent count

## Revision history readability
- Audit rows are intended to show who changed what, not only before/after JSON blobs
- Preferred review fields: changed_by, changed_by_role, action, changed_fields, change_summary, changed_at

## Cadets UI behavior
- Alphabetical ordering within flights
- HQ displayed separately
- NCO visual indicator enabled
