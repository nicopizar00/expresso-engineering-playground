---
name: visualizer-artistic-certification
description: Use when Codex needs to artistically certify the Expresso 3D visualizer, Classic Expresso/Espresso cup asset, localhost:3002 standalone scene, /visualizer web embed, or web-app interactions reflected in Three.js, while leaving implementation to Claude Code.
---

# Visualizer Artistic Certification

## Overview

Use this skill for certification, review, and implementation handoff around the
Expresso 3D visualizer. Codex judges whether the visualizer meets the minimum
artistic and interaction bar. Claude Code owns implementation.

## Read First

Open only the files needed for the current request:

- `docs/ai/codex/governance.md` for Codex and Claude Code roles.
- `docs/ai/codex/current-findings.md` for active certification state.
- `docs/project-state/visualizer-domain-certification.md` for source-grounded
  visualizer findings.
- `docs/next-steps/expresso-order-counter.md` for the larger scene direction.
- `docs/next-steps/ps1-espresso-cup.md` for the WIP cup asset and approval
  checklist.
- `docs/architecture/web-entry-point.md` for `/api/bff` and `/viz` topology.
- `apps/visualizer-3d/README.md` for runtime behavior.

Inspect code when certifying:

- `apps/visualizer-3d/public/scene.js`
- `apps/web/app/visualizer/page.tsx`
- `apps/bff/src/modules/visualization/visualization.service.ts`
- `apps/bff/src/modules/visualization/visualization.controller.ts`

## Workflow

1. Confirm this is certification/review/handoff scope. Do not implement
   Three.js, web app, BFF, database, or asset changes unless the owner
   explicitly asks Codex to implement.
2. Determine the target:
   - Standalone visualizer at `http://localhost:3002`.
   - Web app visualizer embed at `http://localhost:3000/visualizer`.
   - Minimum commerce interaction reflected in the 3D scene.
3. If runtime certification is requested, start or verify the full stack with
   the documented local workflow and run `pnpm pg:smoke` when appropriate.
4. Use the in-app Browser when available for rendered visual checks. Never fake
   pixel confirmation; mark visual-only checks `SKIP` if no browser is
   available.
5. Judge the visualizer with PASS / FAIL / DRIFT / SKIP.
6. For failures, write a narrow Claude Code handoff prompt that names the failed
   gates and relevant files. Keep Codex out of implementation.

## Minimum Artistic Gate

Classic Expresso/Espresso must be visible as the business icon:

- White or off-white ceramic, not status green/amber/red.
- Square cup body and four-sided top opening.
- Clearly dark coffee fill with slight depth.
- Distinct flat vertical handle with visible gap.
- Square saucer with readable depth.
- Flat-shaded, low-poly, pixelated, limited-palette, PS1-era feel.
- Recognizable at small size from the default camera.

## Minimum Interaction Gate

The web app must produce a visible 3D reflection:

- `/visualizer` embeds `/viz/index.html` through the web app.
- A minimal commerce action from `http://localhost:3000` changes the 3D scene:
  add Espresso to cart, checkout an order, or manage order status.
- The update arrives through SSE or documented fallback.
- The visual change is understandable to a user, not just a hidden data count.

## Boundary Rules

- Preserve the web app as the browser-facing shell.
- Preserve BFF-owned data and no direct database access from Three.js.
- Preserve SSE primary updates and polling fallback.
- Keep `/performance` mock-only.
- Avoid turning the visualizer into a generic dashboard.
- Avoid realism, smooth shading, bevel-heavy shapes, subdivisions, glossy PBR
  styling, high-poly assets, or modern polished low-poly aesthetics.

## Output

Return a concise certification report:

- Verdict: certified, not certified, or blocked.
- PASS / FAIL / DRIFT / SKIP table.
- Evidence from browser/runtime when available.
- Source-level blockers only when they affect certification.
- Claude Code implementation prompt for the failed gates.
