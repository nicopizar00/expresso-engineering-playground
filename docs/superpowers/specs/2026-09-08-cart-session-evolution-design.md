# Cart/Session Evolution — Design

Status: Proposed

Related:

- [CLAUDE.md](../../../CLAUDE.md) — Phase 2 status line: "Open: cart/session
  evolution."
- [Synchronized Single-Cup Order Visualizer and Live Order Rain](../../specs/synchronized-single-cup-order-visualizer-and-live-rain.md)
  — CUP-003 (interactive-selection contract) depends on this: with a global
  cart there is only ever one possible selection system-wide, so "which
  session's selection is the hero" cannot be asked until sessions exist.
  This document does **not** design the selection contract or hero logic —
  that stays a separate, later brainstorm once this ships.

## Purpose

`CartService` today is a single global in-memory cart shared by every
browser that hits the BFF (`CART_ID = "cart_demo"`, one process-wide array).
That was an intentional simplification for the P0 single-cup work, but it
means two real browsers cannot shop independently — the second one always
collides with whatever the first one is doing, via the same-cart 409s.

This changes `CartService` (and the request path that reaches it) so each
browser gets its own cart, identified by a session cookie, while leaving
everything that is legitimately shared — placed orders, product inventory —
exactly as global as it is today.

## Non-goals

- The interactive-selection contract, foreground hero, or rain rendering
  (CUP-003 through CUP-007). This document unblocks that work; it does not
  do it.
- Multi-instance/horizontal BFF scaling. Sessions live in one process's
  memory, same as the cart does today — this is a session-scoping change,
  not a session-persistence change.
- Authentication or user accounts. A session identifies a browser, not a
  person. Checkout stays anonymous (CUP-002, unaffected).
- Changing how `Product.inventory` is decremented or how the CAS guard
  works. Inventory is a real shared resource across sessions and is
  untouched.
- k6 scenario changes. k6 does not carry cookies between requests by
  default (no `http.CookieJar()` configured in any current scenario), so
  every k6 HTTP call already lands in a fresh, empty session under this
  design. That is an accepted, known consequence — k6 stays fully
  hands-off per the repo's boundary (k6 capabilities belong to a separate
  performance-tooling repo; see the CUP-009 backlog item for the eventual
  fix). `./dev smoke` is different — it lives in this repo and is in
  scope; see "Tooling impact" below.

## Architecture

```mermaid
sequenceDiagram
    participant Browser
    participant Web as web (Next.js proxy)
    participant BFF
    participant Session as SessionService
    participant Cart as CartService (Map)

    Browser->>Web: POST /api/bff/cart/items (no sid cookie yet)
    Web->>BFF: rewrite, cookie forwarded as-is (none)
    BFF->>Session: resolveSessionId(req, res)
    Session-->>BFF: new sid, Set-Cookie: sid=...; HttpOnly; SameSite=Lax
    BFF->>Cart: add(sid, payload)
    Cart-->>BFF: cart snapshot (this session's)
    BFF-->>Web: 201 + Set-Cookie
    Web-->>Browser: 201 + Set-Cookie (same-origin, passes through)

    Note over Browser,Web: subsequent requests carry the cookie automatically
    Browser->>Web: POST /api/bff/checkout (sid cookie present)
    Web->>BFF: rewrite, cookie forwarded
    BFF->>Session: resolveSessionId(req, res)
    Session-->>BFF: existing sid
    BFF->>Cart: currentItems(sid) / clear(sid)
```

### Session identity & transport

- New `SessionService` in `apps/bff/src/core/session/` (alongside the
  existing `core/domain-events/` pattern — cross-cutting infrastructure,
  not a domain module).
- `resolveSessionId(req: Request, res: Response): string`:
  - Reads the `sid` cookie from the incoming request.
  - If present and non-empty, returns it as-is (no validation beyond
    "non-empty string" — this is identity, not authentication).
  - If absent, generates one (`randomUUID()`), sets it via
    `res.cookie('sid', id, { httpOnly: true, sameSite: 'lax', path: '/',
    secure: process.env.NODE_ENV === 'production' })`, and returns it.
    `path: '/'` is required, not a narrower prefix like `/api/bff` — the
    BFF only ever sees its own bare route paths (`/cart/items`,
    `/checkout`), never the `/api/bff` prefix (Next.js's rewrite strips it
    before the request reaches the BFF), so a `Set-Cookie` Path attribute
    the BFF writes is only ever expressed in that bare-path space. The
    browser (via the proxy, same-origin) and direct callers like
    `scripts/pg/smoke.py` or k6 (hitting `:3001` with those same bare
    paths) each store this cookie against their own distinct origin/host —
    there is no cross-contamination — but both need `path: '/'` to match
    correctly against their own view of the request path.
- `secure` is conditional on `NODE_ENV` because local dev runs over plain
  HTTP through the Next.js proxy; a hardcoded `secure: true` would silently
  break cookie delivery in `./dev up web`.
- No expiry is set on the cookie itself (session cookie, cleared when the
  browser closes) — matches the existing "resets on BFF restart" spirit;
  nothing here claims durability beyond a single browsing session.
- `CartController` and `CheckoutController` each call
  `this.session.resolveSessionId(req, res)` at the top of every handler and
  pass the resulting `sessionId` down to the service call. This requires
  those controllers to gain `@Req() req: Request` and `@Res({ passthrough:
  true }) res: Response` parameters (NestJS's passthrough mode keeps the
  existing return-value-as-response-body pattern intact — only the cookie
  header rides along).

### `CartService` — per-session state

- `private items: CartItem[]` (plus `nextItemSeq`, `lastChangedEpoch`)
  becomes `private carts: Map<string, SessionCart>` where
  `SessionCart = { items: CartItem[]; nextItemSeq: number;
  lastChangedEpoch: number }`.
- A private `getOrCreate(sessionId: string): SessionCart` helper
  centralizes the "look up or lazily initialize" logic every method needs.
- `add`, `get`, `updateQuantity`, `remove`, `clear`, `currentItems`,
  `lastChangedAt` all gain a leading `sessionId: string` parameter. The
  CUP-001 invariant logic inside each method (reject second add, reject
  mutate/remove once occupied) is otherwise **unchanged** — it now just
  reads/writes `this.carts.get(sessionId)` instead of `this.items`
  directly.
- `updatedAt` (the frozen `"2026-05-14T12:00:00.000Z"` timestamp smoke/
  contract tests assert on) stays a per-service constant, not per-session —
  no test currently varies it, and there's no requirement to change that.

### `CheckoutService`, `OrdersService`, inventory — unchanged in shape

- `CheckoutService.checkout()` calls `this.cart.currentItems(sessionId)`
  and `this.cart.clear(sessionId)` instead of the no-arg versions.
  Everything else in that method (idempotent replay, the
  `ConflictException` → clear-cart-on-inventory-exhaustion path added
  earlier) is untouched — `sessionId` only changes which cart is read.
- `OrdersService.create()` is not touched at all. Orders are created,
  stored, and listed exactly as today — they are not session-scoped,
  because placed orders are meant to be visible to everyone (the always-on
  rain in CUP-006 reads *all* placed orders, not "this session's orders").
- `Product.inventory` and its CAS decrement in `OrdersService.create()`'s
  transaction are untouched — inventory is a real cross-session shared
  resource and this document does not change how it's guarded.

### `VisualizationService`

- `cartItems()`/`toSceneCart()` currently call `this.cart.get()` (no-arg).
  Once `CartService.get()` requires a `sessionId`, this call site has
  nothing to resolve one from — `VisualizationService` has no request
  context (it's driven by an SSE/poll loop, not a per-request call).
- Resolution: `VisualizationService` stops rendering "the cart" as a scene
  item entirely. This is not a new decision forced awkwardly by this
  change — CUP-005 already requires the eventual hero to come only from
  the interactive-selection signal, not from raw cart state, so the
  generic cart marker was already going to be retired by the P1 visualizer
  work. This document just moves that retirement earlier, since "which
  session's cart" has no answer without a request. `cartItems()` and
  `toSceneCart()` are deleted; the `scene.cart` field becomes permanently
  `null` until CUP-004/005 defines its replacement.

## Data flow: a full anonymous purchase, two independent browsers

1. Browser A visits `/`, no `sid` cookie. First `POST /cart/items` call:
   BFF mints `sid=A`, cookie set, cart A gets one Cup of Coffee.
2. Browser B (different machine, or the same developer's second tab in a
   different browser/incognito context) visits `/`, no `sid` cookie of its
   own. Its `POST /cart/items` call: BFF mints `sid=B`, cart B gets one Cup
   of Coffee. **This now succeeds** — today, with a global cart, it would
   409 because cart A already holds the one allowed cup.
3. Browser A checks out: `POST /checkout` resolves `sid=A`, reads cart A,
   creates the order, clears cart A. Cart B is untouched.
4. Browser B checks out independently, whenever it wants: same flow,
   `sid=B`, its own cart, its own order.
5. Both orders are globally visible via `GET /orders` and (later, once
   CUP-006 lands) both feed the same always-on rain layer.

## Error handling

- No cookie, no session: every session-scoped method call transparently
  creates one via `getOrCreate` — there is no "session not found" error
  path. A brand-new session always starts with an empty cart, which is
  already a valid, handled state (empty-cart 400 on checkout, same as
  today).
- Cookie present but referring to a session this process never created
  (e.g., BFF restarted, or the cookie is forged/stale): treated
  identically to "no session" — `getOrCreate` lazily initializes an empty
  cart under that id. This matches the existing "cart resets on BFF
  restart" behavior; no new failure mode is introduced.
- Multiple concurrent requests for the *same* `sessionId` (e.g., a
  double-click): the existing synchronous-method argument for atomicity
  (documented in `CartService.add()`'s comment — no `await` between the
  invariant check and the mutation) is unaffected by keying on `sessionId`;
  each call still runs to completion within one synchronous turn of the
  event loop before any other call for that same session can interleave.

## Testing

- `CartService`/`CheckoutService` unit specs: every existing test's calls
  gain an explicit `sessionId` argument (a fixed constant like
  `"sid_test"` is enough — no test needs *different* sessions to interact,
  except one new test proving isolation).
- New test: two different `sessionId`s can each independently hold one cup
  at the same time (`cart.add("sid_a", ...)` and `cart.add("sid_b", ...)`
  both succeed; each session's `get()` shows only its own item).
- New test: `SessionService.resolveSessionId` — generates and sets a cookie
  when absent, returns the existing value unchanged when present, never
  mutates an existing cookie.
- `VisualizationService` spec: the `cartItems()`/`toSceneCart()` tests are
  removed (the methods no longer exist); `scene.cart` assertions update to
  expect `null` unconditionally.
- e2e (Playwright): every current spec mocks `/api/bff/*` inline and never
  reaches the real BFF, so none of them exercise real cookie behavior
  today and none need functional changes for this alone. Add one new,
  small e2e spec (or extend an existing one) that runs against the *real*
  BFF (no route mocking) and asserts: add → checkout → order succeeds in
  one browser context, and a second, separate browser context (a fresh
  Playwright `browser.newContext()`, which gets its own cookie jar) can
  add its own cup while the first context's cart is still occupied.

## Tooling impact

- `scripts/pg/smoke.py`'s HTTP helper (`scripts/pg/http.py`) currently
  makes independent requests with no cookie persistence. Once sessions
  exist, the multi-step sequence (`POST /cart/items` → `PATCH` → `DELETE`
  → `POST /checkout`) needs to reuse one session across all of it, or each
  call lands in its own fresh empty cart and every check after the first
  add fails. Fix: give `request_json` an optional shared
  `http.cookiejar.CookieJar` (or equivalent manual `Set-Cookie` capture/
  replay) that `smoke.py` constructs once and threads through the whole
  run.
- `./dev perf:smoke` / k6: explicitly not fixed here (Non-goals). k6's
  existing scenarios will see every request land in a fresh session; this
  compounds with the already-known customerName/quantity breakage from the
  single-cup P0 work. Both are CUP-009's problem, not this document's.

## Definition of done

- Two independent browser contexts (or two curl sessions with distinct
  cookie jars) can each hold and check out their own Cup of Coffee
  concurrently, with neither seeing a 409 from the other's cart.
- A session with no cookie always starts from a clean, valid empty-cart
  state — no error path, no special-casing visible to callers.
- Orders and inventory remain globally visible/shared exactly as before —
  `GET /orders` still lists every order regardless of which session placed
  it.
- `./dev smoke` passes end-to-end with a session-aware request helper.
- BFF unit suite, typecheck, and lint are green with `sessionId` threaded
  through `CartService`/`CheckoutService`.
