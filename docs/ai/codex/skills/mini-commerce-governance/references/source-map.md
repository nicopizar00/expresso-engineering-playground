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
- `docs/architecture/web-entry-point.md` - web app as entry point and proxy
  topology.
- `docs/local-development.md` - stack startup, URLs, smoke checks.
- `docs/uat/web-app-uat.md` - manual UX UAT plan and latest execution log.

## Current Findings

- Order detail route currently returns 500 in the running web app.
- `pnpm pg:up full` has Docker Compose profile flag drift in the tested
  environment.
- Visualizer proxy/assets/data are reachable, but rendered pixels still need a
  real browser pass.

## Common Boundaries

- Prefer frontend and docs work for product-shell integration changes.
- Do not change backend contracts, telemetry, k6, or visualizer internals
  unless explicitly approved.
- Keep `/performance` mock-only.
- Keep orders persistent and cart in-memory.
