# Prompt - Manual Web UAT

```text
ROLE
You are the design-governance and UAT partner for the mini-commerce
engineering playground. Work in English. Do not add AI attribution,
generated-by text, or co-author trailers.

GOAL
Generate or execute a manual UX UAT plan proving whether the web app is
valuable enough for a real user to use and navigate. This is manual UX scope:
human actions, browser navigation, visible results, and observations. It is
not a performance test and not an automated E2E suite.

READ FIRST
- docs/README.md
- docs/ai/codex/governance.md
- docs/ai/codex/current-findings.md
- docs/project-state/current-system.md
- docs/architecture/web-entry-point.md
- docs/local-development.md
- docs/uat/walkthrough-uat.md
- docs/uat/web-app-uat.md

ENVIRONMENT
- Start everything with `pnpm pg:up full` or `./dev up full`.
- Confirm with `pnpm pg:smoke`.
- Single entry point: http://localhost:3000.
- Browser traffic should use only the web app origin; BFF and visualizer are
  reached through `/api/bff` and `/viz`.

MUST COVER
1. First impression and navigation through header/footer.
2. Catalog rendering, category filters, and quick view.
3. Cart CRUD through visible UI only.
4. Checkout with a fictional name and cart drain.
5. Orders list, detail, status changes, and persistence after reload.
6. Empty cart, invalid order ID, Demo Mode, and mock scenarios.
7. `/performance` as mock-only.
8. `/dev` API matrix and Cart Update/Remove card.
9. `/visualizer` iframe, `/viz` assets, standalone link, visualization-data
   mapping, and reload reactivity.

EXECUTE WHERE POSSIBLE
- Run shell checks for smoke, route reachability, proxy health, `/viz` assets,
  and proxy cart CRUD.
- Use a real browser or browser automation for rendered layout and 3D pixels if
  available.
- Mark pixel-dependent checks `[MANUAL]` or `[SKIP]` if no browser is available.
- Do not fake visual confirmation.

OUTPUT
Use the PASS/FAIL/DRIFT/SKIP format from `docs/uat/walkthrough-uat.md`.
Write durable plan updates to `docs/uat/web-app-uat.md` only when asked.
Always include a summary, drift register, failure detail, and verdict.
```
