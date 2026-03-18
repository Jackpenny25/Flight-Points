# Usage Rules

This context pack is for exceptional cases only.

Use this pack when:
- A task spans deployment + backend + frontend + infra decisions.
- The main instruction file lacks detail for historical behavior.
- A handover requires full operational context.

Do not use this pack when:
- Making small UI fixes or straightforward endpoint changes.
- The answer is already in .github/copilot-instructions.md.
- You only need one command or one endpoint reference.

Read strategy:
- Start with INDEX.md and only open the minimum files needed.
- Stop reading once required detail is found.
- Prefer file-level summaries over full historical timelines if time is limited.
- Read 60-open-items-and-handover.md early when debugging production issues.

Authoring strategy:
- Add only durable facts (not temporary debug notes).
- Keep bullets short and operational.

Latest durable addition (2026-03-18):
- Account access is now configurable per user (tab visibility + action permissions), and this should be treated as the source-of-truth behavior over role-only assumptions.
