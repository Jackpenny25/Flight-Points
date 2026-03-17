# Open Items and Handover

## High-priority server item
1. Add revision logging for point creation
- Route: POST /api/points
- Goal: full audit trail parity with updates/deletes
- Suggested call: recordRevision('points', newId, 'create', userId, null, createdPoint)

## Optional server enhancements
2. Expand /api/health checks
- Add revision_history table presence check
- Add JWT_SECRET sanity check
- Add SMTP connectivity check if SMTP configured
- Add tunnel process/status check if practical

3. Validate alerting path end-to-end
- Test endpoint: POST /api/test-error-alert
- Expected: 500 response + SMTP alert + server error log entry

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
