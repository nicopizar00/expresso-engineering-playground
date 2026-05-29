---
name: manual-web-uat
description: Use when Codex needs to generate, update, or execute a manual browser-focused UX UAT plan for the mini-commerce web app, including PASS/FAIL/DRIFT/SKIP reporting, route/proxy shell checks, and visualizer validation.
---

# Manual Web UAT

## Overview

Use this skill for manual UX acceptance work around the web app. The goal is to
prove whether a real user can navigate and use the app from
`http://localhost:3000`.

## Read First

Open only the needed files:

- `docs/uat/web-app-uat.md` for the current plan and execution format.
- `docs/uat/walkthrough-uat.md` for PASS/FAIL/DRIFT/SKIP conventions.
- `docs/project-state/current-system.md` for authoritative features and UX
  state.
- `docs/architecture/web-entry-point.md` for `/api/bff` and `/viz` proxy
  topology.
- `docs/local-development.md` for startup and smoke commands.
- `docs/ai/codex/current-findings.md` for active blockers.

Use `references/web-uat-source-map.md` for shell probes, browser scope, and
known findings.

## Workflow

1. Confirm the UAT is manual UX scope, not load testing or automated E2E.
2. Start the full stack with `pnpm pg:up full` or record drift and use the
   documented equivalent if the wrapper fails.
3. Run `pnpm pg:smoke` and record 12/12 or exact failure detail.
4. Probe route reachability, `/api/bff/health`, `/viz/index.html`,
   `/viz/scene.js`, and cart CRUD through `/api/bff`.
5. Use a real browser for visible layout, cart drawer, Demo Mode, `/dev`
   cards, and 3D scene pixels when available.
6. Mark visual checks `[MANUAL]` or `[SKIP]` when no browser is available.
   Never fake rendered-pixel confirmation.
7. Record results with PASS/FAIL/DRIFT/SKIP, summary, drift register, failure
   detail, and verdict.

## Required User Journeys

- First impression and navigation.
- Catalog browsing, filters, and quick view.
- Cart CRUD through UI controls.
- Checkout and cart drain.
- Orders list, detail, status management, and persistence.
- Empty cart, invalid order ID, Demo Mode, and mock scenarios.
- Mock-only Performance Playground.
- Developer console API matrix and Cart Update/Remove card.
- 3D visualizer embed, standalone link, data mapping, color/status mapping,
  and reload reactivity.

## Output

When asked to update the durable plan, edit `docs/uat/web-app-uat.md`.
Otherwise, report results in the conversation using the same status format.
Always include top blockers and a short value/navigability verdict.
