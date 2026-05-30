# UAT Remediation

> Source: manual UAT run captured in [`../uat/web-app-uat.md`](../uat/web-app-uat.md)
> and [`../ai/codex/current-findings.md`](../ai/codex/current-findings.md).
> Created 2026-05-29. Confirmed against the running stack and source.

## Confirmed pending items

| ID | Confirmation |
|---|---|
| R1 | `GET http://localhost:3000/orders/ord_demo` → **500** (reproduced). BFF `GET /orders/ord_demo` → 200, so the failure is in the web route. |
| R2 | `GET http://localhost:3000/orders/does-not-exist` → **500** (reproduced). BFF returns a correct **404** for the same id; the web route crashes before handling it. |
| R3 | `pnpm pg:up full` migrates and seeds, then fails with `unknown flag: --profile` on some Docker Compose versions. `./dev up full` (bash) is unaffected. |
| R4 | Browser-only checks (header/footer nav, cart-drawer pixels, Demo Mode scenarios, `/dev` cards, 3D scene paint/color/reload) were not verified — no browser automation surface in the UAT run. |

**Root causes**

- R1 + R2 share one cause: `apps/web/app/orders/[orderId]/page.tsx` uses the
  Next.js 15 async-params API (`params: Promise<…>` + `use(params)`), but the
  app runs on Next.js 14 (`next@^14.2.0`), where `params` is a plain object.
  `React.use()` on a non-thenable throws during render → 500, before any fetch.
  Fixing param handling renders the detail page **and** lets the existing
  `PageErrorState` show the graceful not-found state for unknown ids.
- R3: `scripts/playground.mjs` spreads `--profile` flags *after* the `up`
  subcommand. Some Compose versions only accept `--profile` as a global flag
  before the subcommand. The `compose(args, { profiles })` helper already places
  it correctly; the `up` path bypasses it.

## Remediation tracks

- **Critical user-flow blockers (P0):** R1, R2.
- **Runtime / developer-workflow drift (P1):** R3.
- **Manual browser verification gaps (P2):** R4.
- **Optional visualizer follow-ups (P3):** R5 (see below).

## Tracker

| ID | UAT source | Problem | User impact | Likely cause | Proposed fix | Files | Estimate | Confidence | Risk | Validation | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|
| R1 | web-app-uat.md (order detail) | `/orders/:id` returns 500 | Cannot view an order; checkout confirmation + status management unreachable | Next 15 async-params (`use(params)`) on a Next 14 app | Use Next 14 plain `params` (`params.orderId`, drop `use`) | `apps/web/app/orders/[orderId]/page.tsx` | XS (≈0.5h) | High | Low | curl `/orders/ord_demo` → 200; manual render; `pnpm typecheck`/`build` | done |
| R2 | web-app-uat.md (invalid order) | `/orders/<bad-id>` returns 500 | No graceful not-found; looks broken | Same as R1 (crash before fetch) | Fixed by R1; BFF 404 → existing `PageErrorState` | same as R1 | — (folded into R1) | High | Low | curl `/orders/does-not-exist` → 200 with not-found UI | done |
| R3 | current-findings.md (runtime drift) | `pnpm pg:up full` fails: `unknown flag: --profile` | Documented dev workflow broken on some Compose versions | `--profile` placed after `up` subcommand | Pass profiles via `compose(args, { profiles })` (global flag) | `scripts/playground.mjs` | XS (≈0.5h) | High | Low | `pnpm pg:up full` starts web+viz; no flag error | done |
| R4 | web-app-uat.md (SKIP rows) | Browser-only UX not verified | Visual confidence gap, not a known break | No browser automation in UAT run | Manual browser pass (now unblocked by R1) or wire a browser tool | n/a (manual) | M (≈half-day manual) | Medium | Low | Human walkthrough per web-app-uat.md §nav/cart/3D | pending |
| R5 | current-findings.md (visualizer) | 3D scene did not reflect live domain state without manual reload | Visualizer felt frozen after web-app mutations | Embedded viz was pull-once with manual reload; no auto-poll | Interval polling (2 s) with in-flight guard, hidden-tab pause, reload resets timer | `apps/visualizer-3d/public/scene.js`, `index.html`, `README.md` | S | High | Low | Mutate domain → scene updates ≤2 s; smoke; zero anchors | done |

## Prioritized implementation order

1. **R1 (+R2)** — P0, one minimal frontend change, unblocks the whole order journey.
2. **R3** — P1, one-line routing change through an existing helper.
3. **R5** — P3, owner-approved and done (visualizer interval polling).
4. **R4** — P2, manual browser walkthrough (now possible because R1 is fixed).

## Approval gates

- R1, R2, R3 touch only a frontend page and a dev script — no backend
  contracts, telemetry, k6, or visualizer internals. No gate.
- R5 changed visualizer internals (`scene.js`) — the owner approved this scope
  on 2026-05-29; backend contracts and the `/visualization-data` shape were not
  touched.

## Validation commands

```bash
pnpm typecheck
pnpm build
pnpm pg:up full              # expect web + visualizer up, no --profile error
pnpm pg:smoke                # expect 12/12
curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/orders/ord_demo        # expect 200
curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/orders/does-not-exist  # expect 200 (graceful not-found UI)
```

## Validation results (2026-05-29, after fixes)

- R1: `apps/web/app/orders/[orderId]/page.tsx` now uses Next 14 plain `params`
  (removed `use(params)` / `Promise` typing). `/orders/ord_demo` → **200**; SSR
  HTML is the app shell + "Loading order" (no server crash); the client fetches
  `/api/bff/orders/ord_demo` (200) and renders the detail.
- R2: `/orders/does-not-exist` → **200**; the client fetch returns 404 and the
  existing `PageErrorState` renders the graceful "Order not found" state.
- R3: `scripts/playground.mjs` now passes profile **names** through
  `compose(args, { profiles })`. `pnpm pg:up full` started bff + web + visualizer
  with no `unknown flag: --profile` error.
- Gates: `pnpm --filter @mini-commerce/web typecheck` and `build` pass;
  `pnpm pg:smoke` → 12/12.
- R5: `apps/visualizer-3d/public/scene.js` now polls `/visualization-data` every
  2 s (in-flight guard, hidden-tab pause, reload resets timer; HUD shows
  `polling…`/`live`/`error`/`offline`). All 5 next-steps anchors removed; the
  `/visualization-data` contract is unchanged.
- R4 (manual browser pass) remains open.

