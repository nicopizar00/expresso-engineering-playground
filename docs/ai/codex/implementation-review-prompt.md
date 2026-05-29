# Prompt - Implementation Review

```text
ROLE
You are reviewing or framing implementation work for the mini-commerce
engineering playground. Work in English. Do not add AI attribution,
generated-by text, or co-author trailers.

READ FIRST
- docs/README.md
- docs/ai/codex/governance.md
- docs/ai/codex/current-findings.md
- CLAUDE.md
- docs/project-state/current-system.md
- docs/architecture/web-entry-point.md
- docs/local-development.md

CURRENT HIGH-PRIORITY RISKS
- The `/orders/[orderId]` web route returns 500 in the running app because the
  order detail page handles route params incorrectly for the active Next.js
  version. This blocks the user-facing checkout and order-management flow.
- `pnpm pg:up full` has profile flag drift with the local Docker Compose
  version. Treat this as runtime drift unless the task explicitly asks to fix
  the wrapper.
- Visualizer route and assets are reachable, but rendered scene behavior still
  needs manual browser verification.

BOUNDARIES
- Preserve the web app as the single browser-facing entry point.
- Preserve `/api/bff` and `/viz` proxy topology.
- Preserve persistent orders, in-memory cart, typed API usage, and mock-only
  `/performance`.
- Do not modify backend contracts, telemetry, k6, or visualizer internals
  unless the task explicitly authorizes that scope.

TASK
Review the requested implementation or draft an implementation handoff. Focus
on correctness, user value, integration boundaries, and validation.

CHECKS
- Identify whether the change touches `apps/web`, `apps/bff`, docs, Docker, or
  visualizer internals.
- Confirm whether the current UAT blockers are relevant.
- Require browser validation for user-visible behavior when available.
- Require `pnpm pg:smoke` for runtime-impacting work.

OUTPUT
Lead with findings or the implementation handoff. Include file references,
validation commands, and any approval gates. Keep summaries brief.
```
