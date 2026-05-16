# Frontend Wiring Status

Snapshot of where the mini-commerce / Expresso playground stands before the next
frontend iteration (v0.app-driven UI). This document is the input to
[`docs/frontend/v0-wiring-plan.md`](../frontend/v0-wiring-plan.md).

> Captured on 2026-05-15 from branch `feat/wb-app-orchestration`.

---

## 1. Current state summary

- The BFF (`apps/bff`, NestJS, port 3001) exposes nine working endpoints and
  is reachable from the Next.js web app (`apps/web`, port 3000).
- Catalog is **Prisma-backed** against Postgres. Cart is **in-memory** (single
  user, resets on BFF restart — intentional Phase 1 contract). Orders are
  **in-memory** today; persistence is the next open thread
  (`docs/next-steps/orders-persistence.md`).
- The web app already calls the real BFF from a single client page
  (`apps/web/app/page.tsx`): seven utilitarian "cards", one per endpoint.
  There is **no mock data** in the frontend — everything goes through HTTP.
- The dev loop works end-to-end: `./dev up` (or `pnpm pg:up`) brings up
  Postgres + OTel + BFF; `./dev up web` (or `pnpm pg:up web`) adds the Next.js
  container. `pnpm pg:smoke` validates all nine endpoints.

## 2. Branch comparison summary

| Branch | Position vs `main` | What it carries | Notes |
|---|---|---|---|
| `main` (local `6b2ab05`) | base | Bootstrap + persistence + k6 wire + Taskfile + Prisma init migration | Local `main` is 2 commits ahead of `origin/main` (`cff96ed`) — not yet pushed. |
| `feat/wb-app-orchestration` (`9eb882a`) | **+1 ahead of `main`** | Adds `./dev` — a Docker-only CLI that removes the Node-on-host requirement. | Currently checked out. Working tree clean. |
| `origin/feat/bootstrap-engineering-playground` (`573c371`) | merged via PR #12 | Original BFF skeleton + persistence MVP. | Already absorbed into `main`. Do not branch off this. |
| `origin/feat/k6-test-wire` (`0272941`) | merged via PR #13 | k6 subtree + perf smoke profile + ADR-0003. | Already absorbed into `main`. Not a base candidate. |

> **Discrepancy flag:** the prompt described "two additional branches more
> up to date than main". In practice only **one** branch
> (`feat/wb-app-orchestration`) is currently ahead. The other two were
> integrated into `main` via merge commits visible in
> `git log --oneline --decorate --graph --all`. Calling this out so the
> mental model and the repo agree.

## 3. Backend readiness summary

All nine endpoints below are implemented, validated, and exercised by
`pnpm pg:smoke`:

| Method + path | Module | Persistence | Status |
|---|---|---|---|
| `GET /health` | `health` | n/a | Stable. `db` check is `skipped` until Prisma ping lands. |
| `GET /catalog/products` | `catalog` | Prisma → Postgres | Stable. |
| `GET /catalog/products/:id` | `catalog` | Prisma → Postgres | Stable. Throws `404` on miss. |
| `POST /catalog/products` | `catalog` | Prisma → Postgres | Stable. Validated by `class-validator`. |
| `GET /cart` | `cart` | In-memory | Stable. Single cart, resets on BFF restart. |
| `POST /cart/items` | `cart` | In-memory | Stable. `quantity` ∈ [1,20]. Returns full `Cart` (201). |
| `POST /checkout` | `checkout` | n/a (cart→order) | Stable. Drains cart, creates order. Idempotency key optional. |
| `GET /orders/:id` | `orders` | **In-memory** | Stable. **Resets on BFF restart** — see `docs/next-steps/orders-persistence.md`. |
| `POST /orders/:id/manage` | `orders` | In-memory | Stable. Actions: `cancel`, `update_status`, `mark_prepared`. |
| `GET /visualization-data` | `visualization` | Read-only aggregator | Stable. Used by `apps/visualizer-3d`. |

Cross-cutting:
- Global `ValidationPipe` (whitelist + transform).
- `HttpExceptionFilter` for normalized error shape.
- CORS enabled for `*` in dev (`CORS_ORIGIN` env var to restrict).
- OTel SDK is a no-op placeholder (`apps/bff/src/common/telemetry.ts`).

## 4. Frontend readiness summary

- **Entry point:** `apps/web/app/page.tsx` — a single client component
  containing seven helper components (`HealthCard`, `CatalogCard`,
  `AddToCartCard`, `ViewCartCard`, `CheckoutCard`, `OrderLookupCard`,
  `OrderManageCard`).
- **Routing:** Next.js App Router. Only one route (`/`). No `apps/web/src/`
  directory yet (tsconfig already lists `src/**/*` in `include`).
- **State:** local component state per card, plus one lifted `products`
  state in `PlaygroundPage`. No shared cart context, no SWR/React Query,
  no router-driven flow.
- **Styling:** hand-rolled `globals.css` design tokens. Solid baseline but
  not a design system.
- **Env config:** `NEXT_PUBLIC_API_BASE_URL` read inline at the top of
  `page.tsx`, default `http://localhost:3001`. Sourced from root `.env`
  (template at root `.env.example`).
- **Types:** an inline `Product` type is duplicated in the page; nothing
  is imported from `@mini-commerce/shared-types` or
  `@mini-commerce/contracts`.
- **Tests:** none for the web app (`test` script is a TODO).

## 5. Known integration gaps

1. No centralized API client — every card builds its own `fetch(...)`.
   Future v0.app components must not call `fetch` directly.
2. No shared TypeScript types between BFF responses and the web app —
   `Product` is duplicated; cart/order/checkout/health responses are typed
   as `unknown`.
3. No router-driven flow (catalog → product detail → cart → checkout →
   order confirmation). All actions happen on `/` against opaque
   identifiers the user types in.
4. No loading skeletons, empty states, or recoverable error UX — just
   `loading: true` and a JSON dump.
5. No cart-state propagation: adding to cart in one card does not refresh
   the cart view; checkout does not navigate to an order page.
6. No place to host adapters between wire-format DTOs and UI view models.
7. Orders in-memory means a checkout's `orderId` becomes a 404 on BFF
   restart — the UI does not surface this lifecycle constraint.

## 6. Recommended base branch for frontend work

**`feat/wb-app-orchestration`** is the right base:

- It is the only branch ahead of `main` and carries the Docker-only
  `./dev` CLI, which removes Node-on-host as a prereq for contributors
  picking up frontend work.
- All persistence and BFF capability from the merged feature branches is
  already present in `main` (and therefore in this branch).
- Working tree is clean — branching off is safe right now.

Do **not** branch off `origin/feat/bootstrap-engineering-playground` or
`origin/feat/k6-test-wire`: they are historical and behind `main`.

## 7. Recommended next branch name

```
feat/web-v0-wiring-prep
```

Rationale: this iteration is *preparation* for the v0.app-driven UI, not
the UI itself. Keep the verb "prep" in the name so the follow-up
(`feat/web-v0-wiring-impl` or similar) has a clear handoff line.

## 8. Suggested order of implementation

1. **Land this iteration** — scaffolding + docs + TODO breadcrumbs (this
   PR).
2. **Extract a typed API client** (`apps/web/src/lib/api/expresso-api.ts`)
   covering exactly the nine BFF endpoints. Wire `page.tsx` to use it.
3. **Promote wire-format types** into `@mini-commerce/contracts` (start
   with `Product`, `Cart`, `Order`, `CheckoutResponse`). Replace the
   inline `Product` in `page.tsx`.
4. **Add a cart context** so add-to-cart and view-cart stay in sync.
5. **Generate v0.app components** for: product catalog grid, product
   detail panel, cart drawer, checkout form, order confirmation. Drop
   them in `apps/web/src/components/<domain>/` and call the API client
   via view-model adapters — never let v0 components own DTOs.
6. **Introduce routes** (`/catalog`, `/catalog/[productId]`, `/cart`,
   `/checkout`, `/orders/[orderId]`) and migrate the playground cards
   into a `/dev` debug page so they remain useful.
7. **Defer order persistence** until `docs/next-steps/orders-persistence.md`
   is implemented; until then surface the in-memory caveat in the order
   confirmation screen.
8. **Defer k6 wiring** — explicitly out of scope for this iteration
   (`tests/performance/k6/` smoke profile remains the only runnable one).

## 9. Risks and things not to touch yet

- **Do not** rewrite the BFF; the routes and DTOs are the contract.
- **Do not** delete the existing `apps/web/app/page.tsx` — it is the only
  thing that proves end-to-end connectivity. Keep it functional until the
  v0.app screens replace it card-by-card.
- **Do not** merge branches automatically or force-checkout — work was
  done in `feat/wb-app-orchestration` and the user authors all commits.
- **Do not** switch persistence behaviour for cart or orders — the
  in-memory contract is intentional for Phase 1.
- **Do not** add credentials, internal URLs, or company-specific data to
  any new file.
- **Do not** add heavy dependencies (state libs, UI kits) before the v0.app
  output is reviewed — v0 will bring its own.
- **Do not** connect k6 in this iteration.

## 10. TODO list for v0.app wiring

Order is suggested, not prescriptive. Each item is one PR-sized unit.

- [ ] **API client** — finish `apps/web/src/lib/api/expresso-api.ts`,
  point `page.tsx` at it, remove inline `fetch` calls.
- [ ] **Shared response types** — move `Product`, `Cart`, `Order`,
  `CheckoutResponse`, `HealthReport`, `VisualizationItem` into
  `@mini-commerce/contracts` (or re-export from `@mini-commerce/shared-types`),
  consume them from the web app.
- [ ] **View-model adapters** — `apps/web/src/lib/view-models/` with
  per-domain mappers (e.g. `productListVM`, `cartVM`, `orderVM`). No v0
  component imports a BFF type directly.
- [ ] **Cart context** — `apps/web/src/components/cart/CartProvider.tsx`
  with `useCart()` hook. Refreshes on add / checkout.
- [ ] **System UI** — `HealthBadge`, `ApiErrorBanner`, `LoadingSkeleton`
  in `apps/web/src/components/system/`.
- [ ] **v0 catalog** — generate `ProductCatalogGrid` and
  `ProductDetailPanel`; integrate via `productListVM` / `productDetailVM`.
- [ ] **v0 cart drawer** — `CartDrawer` opening from header, fed by
  `useCart()`.
- [ ] **v0 checkout** — `CheckoutForm` with `customerName` + optional
  `idempotencyKey`; surface 201 → navigate to `/orders/[orderId]`.
- [ ] **v0 order screens** — `OrderSummary` + `OrderManagePanel` (actions:
  `cancel`, `update_status`, `mark_prepared`).
- [ ] **Routes** — introduce `/catalog`, `/catalog/[productId]`,
  `/cart`, `/checkout`, `/orders/[orderId]`; move existing cards to
  `/dev`.
- [ ] **Error/loading UX** — replace JSON dumps with real states.
- [ ] **Smoke check** — add a tiny Playwright spec under `tests/e2e/`
  that walks browse → add → checkout → view order (deferred until route
  flow lands).

Once every item is ticked, the v0.app-driven UI is fully wired and the
playground card grid can be retired (or kept under `/dev` for debugging).
