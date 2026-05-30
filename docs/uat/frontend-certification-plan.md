# Frontend Certification Report

## Status

- **Phase:** implemented and certified.
- **Owner approval:** granted in the implementation request for
  `feature/governance-uat-decision`.
- **Current branch inspected:** `feature/governance-uat-decision`.
- **Frontend base inspected:** `origin/main` / current `apps/web`, which match.
- **Codex line inspected:** `origin/refactor/domain-events-seam` and
  `origin/docs/codex-governance-workflow`.
- **Implementation branch:** `feature/governance-uat-decision`.
- **Direct-browser UAT evidence:** `/var/folders/w_/hv3j3k7s4ys08m15tsyjlmk80000gn/T/expresso-uat-1780110093392`.

This report reconciles the codex-governed UX/a11y improvements and E2E suite
back onto the canonical `origin/main` frontend redesign. It preserves the
dark/teal product UI while adding the approved behavior, certification harness,
and real-stack browser evidence.

## Inspection Summary

- `apps/web` on the current branch is byte-equivalent to `origin/main`; it is
  the canonical dark/teal redesign and must be preserved.
- The codex line changes `apps/web` broadly and also adds the Playwright E2E
  harness. The test suite is coupled to that codex frontend's names, utility
  classes, routes, and component structure.
- The codex line includes targeted UX/a11y fixes worth porting selectively:
  shared dialog accessibility behavior, reduced-motion gating, actionable cart
  quantity/remove controls, inline add-to-cart errors, removal of raw product
  IDs from cart rows, and a `/viz/index.html` visualizer embedding model with a
  timeout fallback.
- ADR-0004 classifies the earlier React #418/#423 hydration errors as an
  environmental browser-extension artifact. The console-error gate should run
  in a clean browser context.
- Current `tests/e2e` on `main` is a placeholder package. The functional E2E
  suite exists only on the codex line.

## Implemented Changes

- Added shared dialog behavior (`useDialogA11y`) for focus entry, focus trap,
  Escape close, focus restore, and body scroll lock in Quick View and Cart
  Drawer.
- Added user-facing add-to-cart failure alerts without app console errors.
- Wired real cart `PATCH`/`DELETE` actions through `CartProvider`, the drawer,
  and the cart page; normal shopper cart rows no longer expose raw product IDs.
- Added reduced-motion handling so modal/drawer and hitbox assertions settle
  cleanly in automation.
- Moved browser API traffic to the same-origin `/api/bff` proxy and embedded the
  visualizer through `/viz/index.html`; Docker build/runtime config now provides
  internal BFF/visualizer rewrite targets.
- Added the Playwright E2E certification harness in `tests/e2e/**`, including
  typecheck, `certify`, mocked BFF flows, visualizer embed coverage, mobile shell
  coverage, focus-restore assertions, and clean-console checks.
- Made the standalone visualizer SSE-first with polling fallback, reload
  reconnection, and visibility-aware connection handling.
- Fixed `pnpm pg:up full` Compose profile drift by passing profile names through
  the existing Compose helper.

## Feature and Surface Inventory

| Surface | User flows | Governance functional truth | Current behavior on `main` |
| --- | --- | --- | --- |
| Catalog `/` | Browse products, filter categories, inspect cards, add products, open quick view. | Catalog is backed by Prisma/PostgreSQL through the typed BFF API when demo mode is off. | Canonical teal redesign renders product cards and filters. Quick view is available, but add-to-cart failures only log to console. Card quick-view affordance differs from codex tests. |
| Product Quick View | Open from product visual/title, close via button/backdrop/Escape, adjust quantity, add to cart, recover from errors. | Modal must preserve commerce flow and be keyboard usable. | Has Escape close and body scroll lock, but no focus trap/focus restore; no inline add-to-cart error. Dialog styling belongs to main and should stay. |
| Cart Drawer | Open from header, inspect line items, adjust quantity, remove item, see subtotal, proceed to checkout, close via Escape/backdrop/button. | Cart is intentionally in-memory and may reset on BFF restart; UI must expose real cart state. | Drawer exists and slides in, but quantity/remove controls are disabled and raw `productId` is visible. Escape and scroll lock exist but focus restore/focus trap are missing. |
| Cart Page `/cart` | Review full cart, totals, continue shopping, proceed to checkout, update/remove lines. | Same in-memory cart truth as drawer. | Full-page cart displays items and totals, but raw `productId` is visible and line CRUD is not exposed. |
| Checkout `/checkout` | Confirm order summary, enter name, place order, handle network/API failure without losing cart context. | Checkout creates a persistent order and drains cart after success. | Checkout form and error alert exist. Needs certification that failure leaves cart context intact. |
| Orders `/orders` | List orders, search/lookup by ID, open order detail. | `GET /orders` exists; orders are persistent and survive BFF restarts. | Orders list uses `GET /orders`, shows persisted-copy framing, and links to details. |
| Order Detail `/orders/[orderId]` | View order details, line items, status, manage actions, reload persistence. | Order status management must preserve backend contracts. | Uses `useParams` and SWR. Manage actions support `update_status`, `mark_prepared`, and `cancel`. Needs full E2E coverage against real and mocked data. |
| Dev Diagnostics `/dev` | Toggle demo mode, inspect API matrix, exercise BFF calls, cart update/remove card. | Web app exposes BFF-facing diagnostics without changing contracts. | Rich redesigned dev page exists. Need verify/update cart mutation cards if PATCH/DELETE are available after backend changes. |
| Demo Mode | Enable/disable mock mode, choose scenarios, explore loading/empty/error/cart-filled/checkout-fail. | Demo mode is explicit and must not be confused with real BFF mode. | Demo controls exist in shell and `/dev`; E2E/UAT must clear localStorage and keep demo off unless specifically testing demo. |
| Performance `/performance` | Start/stop mock scenarios, inspect service cards/KPIs, pause animations. | Mock-only design surface; must not claim live telemetry, real Grafana data, or actual k6 runs. | Main already labels the page as simulated/mock and has mock-only notices. Certify copy and interactions. |
| 3D Visualizer `/visualizer` | Embedded visualizer iframe, reload, standalone link, status badge, live update observation. | Standalone visualizer reads `GET /visualization-data`; web shell should make it reachable and coherent. | Main embeds `NEXT_PUBLIC_VISUALIZER_URL` directly and can show Not Configured. Codex line embeds same-origin `/viz/index.html` and explains proxy topology. Owner should approve whether main adopts same-origin embed. |
| Global Shell | Header nav, active states, HealthBadge, cart count, mobile menu, footer. | Web app is the common product entry point. | Main has teal/dark shell, header nav, HealthBadge, mobile menu, footer, and cart count. Mobile hitboxes and active-state assertions need certification. |

## Divergence Reconciliation Map

| Codex improvement | Present on `main`? | Decision | Rationale / owner call |
| --- | --- | --- | --- |
| `useDialogA11y` shared hook: Escape, focus trap, focus restore, scroll lock. | Partially. Quick view and drawer handle Escape/scroll lock locally; no focus trap/restore. | Re-apply onto main design. | This is behavioral/a11y hardening, not a visual redesign. Port the hook and wire it into Quick View and Cart Drawer while preserving main's DOM structure and styling. |
| Reduced-motion gating for animations. | Not consistently. Main has transition/animation classes without a clear test-level reduced-motion contract. | Re-apply narrowly. | Gate drawer/modal/loader entrance animations under `prefers-reduced-motion` and configure Playwright with `contextOptions.reducedMotion = "reduce"` so hitbox tests measure settled layout. |
| Drawer slide-in animation. | Yes, main uses `animate-slideInRight`. | Already covered, but stabilize. | Preserve main's animation. Add reduced-motion behavior and visual actionability tests instead of replacing styling. |
| Inline add-to-cart error feedback. | No. Main logs add failures to console in `ProductCard` and `ProductQuickView`. | Re-apply. | User-facing mutation failure is required for realistic recovery. Add scoped `role="alert"` copy that does not change backend contracts or cart state. |
| Remove raw `productId` from cart rows. | No. Drawer and cart page display `item.productId`. | Re-apply. | Raw IDs are implementation details and violate the requested UX. Keep product names, quantity, price, and totals; omit raw IDs unless placed behind developer-only diagnostics. |
| Cart quantity +/- and remove actions. | No in main UI. Controls are disabled in drawer; cart page has no row controls. Codex line wires PATCH/DELETE. | Re-apply if backend contracts are present on the target branch. | The owner request names cart CRUD as a governed frontend surface. If the target branch includes `PATCH /cart/items/:itemId` and `DELETE /cart/items/:itemId`, expose them in `CartProvider`, drawer, and cart page. If not, flag as owner/backend sequencing. |
| Visualizer load-timeout fix. | Partial. Main has a timeout that does not transition out of loading. | Re-apply. | Avoid infinite spinner; timeout should lead to actionable error/retry/standalone surface. |
| Same-origin `/viz/index.html` iframe. | No. Main uses `NEXT_PUBLIC_VISUALIZER_URL` directly. | Owner product call. Recommended: re-apply same-origin embed. | Governance says web is the common shell and browser traffic should feel connected. Same-origin `/viz/index.html` also preserves visualizer relative assets. This affects deployment assumptions, so owner approval should be explicit. |
| E2E harness and visual hitbox helpers. | No. Main `tests/e2e` scripts are placeholders. | Re-apply, retargeted to main. | Bring over Playwright config, certify wrapper, page objects, and visual helpers, but update selectors and expected copy to main's accessible names. Do not import generated reports/results. |

## Test Matrix

| Surface / flow | Test type | Selector strategy | Data strategy |
| --- | --- | --- | --- |
| Catalog render and filters | Playwright E2E and visual-integrity checks | `getByRole("heading")`, `getByRole("tab")`, scoped product cards by role/text; avoid style selectors. | Mocked `/api/bff/catalog/products` for deterministic E2E; real BFF in UAT. |
| Product Quick View | Playwright E2E, a11y assertions, visual hitbox checks | Product visual needs a stable accessible button name such as `View details for <name>` or a retargeted locator tied to main's "Quick view <name>" button. Dialog by `role="dialog"` and `aria-labelledby`. | Mock cart/product APIs for E2E failure/success; real BFF in UAT. |
| Add-to-cart failure feedback | Playwright negative E2E | Scoped `role="alert"` inside product card/dialog. | Mock `POST /cart/items` failure; keep cart count unchanged. |
| Cart Drawer CRUD | Playwright E2E, a11y assertions, visual hitbox checks | Drawer by `role="dialog"` with stable label; controls by role/name scoped to row. | Mock GET/POST/PATCH/DELETE cart endpoints; real BFF UAT. |
| Cart Page CRUD | Playwright E2E | Row-scoped product name; quantity and remove controls by accessible names. | Mock cart endpoints; real BFF UAT. |
| Checkout happy path | Playwright E2E and UAT | Input by label `Your Name`; submit by role/name; order detail by heading/status. | Mock checkout/order APIs for deterministic E2E; real BFF for UAT. |
| Checkout network failure | Playwright negative E2E | Alert by role; assert URL/cart context remain stable. | Abort or fulfill `POST /checkout` with network/error response. |
| Orders list/detail/manage | Playwright E2E | Orders list rows by order ID/customer; actions by role/name. | Mock `GET /orders`, `GET /orders/:id`, `POST /orders/:id/manage`; real BFF UAT verifies persistence. |
| Dev diagnostics | Playwright smoke E2E and manual UAT | Buttons/cards by visible endpoint labels and stable headings. | Real BFF UAT preferred; optional mocked E2E for demo mode only. |
| Demo mode | Playwright targeted E2E | Toggle by role/name; scenario buttons by visible labels. | LocalStorage controlled explicitly; demo mode off by default in all other tests. |
| Performance | Playwright copy/interaction E2E | Headings, mock badges, scenario buttons, animation toggle by role/name. | Local mock adapter only; assert no live telemetry/Grafana/k6 claims. |
| Visualizer embed | Playwright E2E plus real UAT | Iframe by title, status badge text, Reload/Open Standalone by role/name. | Mock `/viz/index.html` in hermetic E2E; real visualizer container in UAT. |
| Visualizer SSE update | Manual clean-browser UAT plus optional Playwright real-stack certification | Status/count in iframe and `/visualization-updates` event observation. | Real BFF, real Postgres, real visualizer; no mocks. |
| Header/mobile shell | Playwright responsive and visual-integrity checks | Navigation landmarks by `aria-label`, links by names used in main (`3D View`, `Developer` if retained). | Mock API health/cart for E2E; real BFF UAT. |
| CSS/hitbox integrity | Playwright visual-integrity helper | Bounding boxes, center-clicks, `elementFromPoint`, viewport overflow checks. | Mock BFF for determinism; reduced motion. |

## E2E Retargeting Plan

1. **Create a frontend certification branch after owner approval.**
   Recommended branch: `codex/frontend-certification-main`.
2. **Bring over the E2E harness without artifacts.**
   Copy/adapt from the codex line:
   - `tests/e2e/playwright.config.ts`
   - `tests/e2e/scripts/certify-e2e.mjs`
   - `tests/e2e/tsconfig.json`
   - `tests/e2e/pages/**`
   - `tests/e2e/fixtures/visual-ui.ts`
   - `tests/e2e/tests/**`
   - package scripts/dependencies needed by `@mini-commerce/e2e`
   Do not add `playwright-report/` or `test-results/` artifacts.
3. **Retarget selectors to main's accessible surface.**
   - Header names on main are `Catalog`, `Orders`, `Performance`, `3D View`,
     and `Developer`, not codex's shorter `3D` / `API`.
   - Main product cards currently expose `Quick view <name>` only on the hover
     button; if the whole visual remains clickable, give it a stable accessible
     role/name rather than relying on a `div` click target.
   - Main cart drawer is labelled `Shopping Cart`; tests should not assume the
     codex label `Cart` unless UI copy is deliberately changed.
4. **Keep deterministic browser defaults.**
   - `contextOptions: { reducedMotion: "reduce" }`
   - clean browser context per test
   - `localStorage.removeItem("expresso_demo_mode")` in non-demo specs
   - `E2E_BASE_URL` default isolated from any stale Docker app, preferably
     `http://localhost:3100` for Next dev E2E.
5. **Separate hermetic E2E from real-stack UAT.**
   - Hermetic E2E mocks `/api/bff/**` and `/viz/index.html`.
   - Real-stack UAT runs after Docker image rebuild with real BFF/Postgres/
     visualizer and demo mode off.
6. **Preserve the visual testing intent, not brittle implementation details.**
   Use `expectVisualActionable`, `clickVisualCenter`, `expectCenterHits`,
   viewport overflow checks, and CSS utility contract checks where main still
   uses manual utilities. Update the contract to main's utility vocabulary
   rather than forcing codex CSS names wholesale.
7. **Add a clean-console collector.**
   E2E and UAT certification should fail on uncaught page errors and console
   errors in a clean browser. ADR-0004 allows classifying extension-injected
   hydration noise as environmental only when the clean-browser pass is green.

## Minimal UX Navigation Certification

The certification script should extend `tests/e2e/scripts/certify-e2e.mjs` or
wrap it with a clear command, for example:

```bash
pnpm --filter @mini-commerce/e2e certify
```

For real-stack UAT:

```bash
docker compose -f infra/docker/compose.yaml build web bff visualizer-3d
pnpm pg:up full
pnpm pg:smoke
```

Must-pass checklist:

1. Landing on `/` renders real seeded products with demo mode off and no
   uncaught console errors.
2. Header navigation reaches `/orders`, `/performance`, `/visualizer`, `/dev`,
   and returns to catalog; active states are correct.
3. Core purchase flow succeeds: catalog -> quick view -> add to cart -> cart
   drawer -> checkout -> order detail -> order appears in `/orders` -> status
   manage action updates visible status.
4. Visualizer loads with the real iframe connected and observes a live update
   after an order/cart mutation through `/visualization-updates`.
5. HealthBadge shows API online against the real BFF.
6. Mobile viewport keeps header controls in viewport and mobile menu navigates.
7. Quick View and Cart Drawer close on Escape, restore focus to their triggers,
   trap focus while open, expose `role="dialog"`, `aria-modal="true"`, and labels.
8. `/performance` remains mock-only and does not claim live telemetry, real
   Grafana data, or actual k6 runs.
9. No uncaught console errors occur in clean-browser certification.

Pass criteria:

- All Playwright E2E specs pass.
- All visual-integrity assertions pass without `force: true`.
- Real-stack UAT passes the checklist with screenshots, console log capture,
  and an SSE update observation.
- Validation gates below pass before PR creation.

## Implementation Scope After Approval

Approved implementation should be limited to:

- frontend a11y/UX reconciliation in `apps/web/**`
- Playwright E2E harness and specs in `tests/e2e/**`
- certification documentation in `docs/uat/**`
- minimal `.gitignore` updates for generated Playwright artifacts if needed

Do not change backend contracts, telemetry, k6, or visualizer internals unless
the owner explicitly expands scope.

## Validation Gates

Required gates:

```bash
pnpm typecheck
pnpm build
pnpm test
pnpm --filter @mini-commerce/e2e certify
docker compose -f infra/docker/compose.yaml build web bff
pnpm pg:up full
pnpm pg:smoke
```

Then run clean-browser UAT with:

- incognito/extension-free browser or Playwright Chromium
- demo mode off
- real BFF/Postgres/visualizer
- screenshots for each checklist item
- console and page-error capture
- explicit SSE update observation

Actual results on 2026-05-29:

- `pnpm --filter @mini-commerce/web typecheck` — passed.
- `pnpm --filter @mini-commerce/e2e certify` — passed after full-stack restart;
  3 Playwright specs.
- `pnpm typecheck` — passed; 10/10 Turbo tasks.
- `pnpm build` — passed; 5/5 Turbo tasks.
- `pnpm test` — passed; 7/7 Turbo tasks and BFF unit tests were 68/68.
- `docker compose -f infra/docker/compose.yaml build web bff visualizer-3d` —
  passed.
- `pnpm pg:up full` — passed; no `unknown flag: --profile`.
- `pnpm pg:smoke` — passed; 10/10 smoke checks including
  `GET /visualization-updates (SSE)`.
- Direct in-app browser UAT against `http://localhost:3000` — passed. Covered
  catalog/filtering, Quick View, cart drawer CRUD, cart page CRUD, checkout,
  order status management, order list/not-found, mock-only performance copy,
  `/viz/index.html` visualizer embed, mobile menu navigation, and clean app
  console capture. Created order `ord_077`.
- Direct in-app browser visualizer reactivity — passed. With `/visualizer` open,
  a current-stack BFF checkout mutation created order `ord_084` and the iframe
  status changed from `live (sse) · 93 items` to `live (sse) · 94 items`.
  Screenshot:
  `/var/folders/w_/hv3j3k7s4ys08m15tsyjlmk80000gn/T/expresso-uat-1780110093392/09-visualizer-sse-reactivity-current-stack.png`.

## PR Plan

- **PR:** `#11` (`feature/governance-uat-decision` -> `main`)
- **Branch:** `feature/governance-uat-decision`
- **Base:** `main`
- **Title:** `Domain-events backend decoupling + governance docs (ADR-0004)`
- **Added frontend scope:** preserve main's canonical teal/dark redesign; port
  approved a11y/UX fixes; expose cart CRUD; add same-origin BFF/visualizer
  proxying; make the visualizer live via SSE-first updates; add certification
  report and E2E harness.
- **PR body must include:**
  - reconciliation summary
  - validation gates and results
  - UAT checklist results and evidence paths
  - explicit note that `/performance` is mock-only
  - explicit note that owner merges
- **PR review:** complete a diff review before handoff; implementation agent
  must not merge.

No commit messages or PR body should include AI co-author trailers, generated-by
statements, Claude/Anthropic attribution, or assistant ownership language.

## Risks and Open Questions for Owner

1. **E2E default port:** should `@mini-commerce/e2e` default to `localhost:3100`
   to avoid stale Docker reuse, or should certification always require an
   explicit `E2E_BASE_URL`?
2. **Component tests:** should Phase 2 add lightweight component/a11y tests for
   `useDialogA11y`, or keep all new test investment in Playwright?
3. **Performance copy:** main already says simulated/mock data. Owner should
   confirm whether "Simulated Data" is strong enough, or whether every primary
   viewport should say "Mock Only".
4. **ADR-0004 operationalization:** should manual UAT docs be updated in this PR
   to require clean browser context whenever console-error gates are used?

## Approval Gate

Resolved by the implementation request for `feature/governance-uat-decision`:
same-origin visualizer embed, cart CRUD exposure, branch/base strategy, and the
test matrix were implemented and certified in this pass.
