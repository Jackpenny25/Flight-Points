# Copilot Context Index

Purpose: Extended handover context for complex tasks.
Do not read this by default. Open only when normal instructions are insufficient.

## Fast Load Order (cheap -> deep)
1. 00-usage.md
2. 10-system-profile.md
3. 60-open-items-and-handover.md
4. 20-operations-runbook.md
5. 30-api-db-reference.md
6. 40-security-history-and-decisions.md
7. 50-feature-behavior.md

## What each file contains
- 00-usage.md: Rules for when to open this pack.
- 10-system-profile.md: Stack, hosting, env, roles, high-level architecture.
- 20-operations-runbook.md: Deploy, monitoring, alerts, scheduled tasks, troubleshooting.
- 30-api-db-reference.md: API patterns, key endpoints, table map.
- 40-security-history-and-decisions.md: Security hardening and rationale timeline.
- 50-feature-behavior.md: Product behavior details by module.
- 60-open-items-and-handover.md: Remaining server-side actions and validation checklist.

## Maintenance
- Keep concise; append only important facts.
- Prefer updating existing sections over adding new files.
- Never include secrets, credentials, or private tokens.
