# Mini-Commerce Governance Source Map

Use this reference only when a governance or handoff task needs source
orientation.

## Core Docs

- `docs/ai/codex/governance.md` - Codex role, authority, scope, prompting
  policy, and functional truths.
- `CLAUDE.md` - execution-agent rules, commands, architecture, and validation.
- `docs/README.md` - documentation hub.
- `docs/project-state/current-system.md` - authoritative current features and
  UX state.
- `docs/project-state/visualizer-domain-certification.md` - source-grounded
  visualizer domain/art findings and certification risks.
- `docs/next-steps/ps1-espresso-cup.md` - WIP Classic Expresso/Espresso asset
  approval checklist.
- `docs/next-steps/expresso-order-counter.md` - broader visualizer scene
  direction and Claude Code handoff.
- `docs/architecture/web-entry-point.md` - web app as entry point and proxy
  topology.
- `docs/local-development.md` - stack startup, URLs, smoke checks.
- `docs/uat/web-app-uat.md` - manual UX UAT plan and latest execution log.

## Current Findings

- Old order-detail and Compose profile blockers are recorded as done in
  `docs/next-steps/uat-remediation.md`.
- Active certification focus: Classic Expresso/Espresso visual approval and
  minimum web-app interaction reflected in the 3D visualizer.
- Rendered pixels still need a real browser pass before artistic certification.

## Common Boundaries

- Prefer frontend and docs work for product-shell integration changes.
- Do not change backend contracts, telemetry, k6, or visualizer internals
  unless explicitly approved.
- Leave Three.js implementation to Claude Code during certification work.
- Keep `/performance` mock-only.
- Keep orders persistent and cart in-memory.
