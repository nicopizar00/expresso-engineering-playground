# UAT - Web App Value and Navigation

Manual user acceptance test for the mini-commerce web app as the single
browser entry point.

This plan validates whether a real user can understand, navigate, and complete
the commerce workflow from `http://localhost:3000`. It is manual UX coverage:
human actions, clicks, typing, navigation, and browser observations. It is not
a performance test and not an automated E2E suite.

## Scope

- Entry point: `http://localhost:3000`.
- Browser route coverage: `/`, `/cart`, `/checkout`, `/orders`,
  `/orders/:orderId`, `/visualizer`, `/performance`, `/dev`.
- Same-origin service access from the web app: `/api/bff/*` and `/viz/*`.
- Functional truths:
  - Orders persist in PostgreSQL.
  - Cart is in-memory and resets on BFF restart.
  - `/performance` is mock-only and must not imply live telemetry.
  - The visualizer reads `GET /visualization-data`.
  - Contracts, telemetry, and k6 are outside this UAT.

## Status Format

Use the same reporting format as `docs/uat/walkthrough-uat.md`:

```text
[PASS]  step-N - <one-line summary>
[FAIL]  step-N - expected <X>, got <Y>
[DRIFT] step-N - <observation>
[SKIP]  step-N - <reason>
```

At the end of a run, print:

```text
Summary: <P> passed / <F> failed / <D> drifted / <S> skipped
Runtime: <hh:mm:ss>
```

Then include:

- Drift register: every `[DRIFT]` line with a one-sentence recommendation.
- Failure detail: every `[FAIL]` with exact command or browser action,
  expected result, and actual result.

## Preconditions

- Repo cloned and the runner's `$PWD` is the repo root.
- Docker Desktop or Docker Engine is running.
- Start the full stack:

  ```bash
  pnpm pg:up full
  ```

  If the wrapper fails before all services are up, record the failure as
  `[DRIFT]` and use the documented equivalent only to continue the UAT:

  ```bash
  docker compose --profile web --profile viz -f infra/docker/compose.yaml up -d --wait bff web visualizer-3d
  ```

- Confirm the BFF smoke:

  ```bash
  pnpm pg:smoke
  ```

- Open only the web app in the primary browser: `http://localhost:3000`.
- Test data:
  - Fictional checkout name: `Web UAT Customer`.
  - Invalid order ID: `does-not-exist`.
  - Existing seeded order ID: `ord_demo`.

## Journey 1 - First Impression and Navigation

### WEB-UAT-01 - Landing Page and Primary Shell

Preconditions:

- Full stack is running.
- Demo Mode is off unless this case explicitly asks for it.

Manual steps:

1. Open `http://localhost:3000/`.
2. [MANUAL] Observe the first viewport.
3. Click the Expresso logo.
4. Click each header destination: Catalog, Orders, Performance, 3D, API.
5. Use the browser Back button or the header to return to Catalog after each
   destination.
6. Click the cart icon in the header.
7. Close the cart drawer.

Expected user-visible result:

- The app clearly presents itself as the Expresso mini-commerce playground.
- The header stays visible and offers Catalog, Orders, Performance, 3D, API,
  Demo, health, and cart controls.
- The cart opens as a drawer from the header and can be closed.
- No route dead-ends the user.

Pass criterion:

- Every header destination loads without a 5xx page, the cart drawer opens and
  closes, and a user can return to Catalog from each surface.

### WEB-UAT-02 - Footer Navigation and No Dead Ends

Preconditions:

- Full stack is running.

Manual steps:

1. Open Catalog.
2. Scroll to the footer.
3. Click `API Debug`.
4. Return to Catalog from the header.
5. Visit Orders, Performance, 3D, and API from the header.
6. On each route, scroll to the footer and confirm the footer is present.
7. Record `[DRIFT]` if the footer is expected to provide all main-route links
   but only provides a subset.

Expected user-visible result:

- Footer remains present across the app.
- Footer `API Debug` reaches `/dev`.
- Header navigation is enough to recover from every route.

Pass criterion:

- Footer links that exist are live, and no page leaves the user without a clear
  path to continue.

## Journey 2 - Catalog Browsing

### WEB-UAT-03 - Products Render and Category Filter Works

Preconditions:

- Full stack is running.
- Demo Mode is off.

Manual steps:

1. Open Catalog.
2. [MANUAL] Confirm the catalog grid renders products.
3. Click `Drinks`.
4. Click `Food`.
5. Click `Accessories`.
6. Click `All`.

Expected user-visible result:

- Products appear as cards with name, description, price, inventory, category
  marker, and Add action.
- Category tabs update the visible cards and their count badges.
- `All` restores the full product list.

Pass criterion:

- A non-technical user can browse and filter products without using the API or
  developer console.

### WEB-UAT-04 - Quick View Opens and Can Add to Cart

Preconditions:

- Catalog is loaded.

Manual steps:

1. Click a product card image or product title.
2. [MANUAL] Confirm a quick-view dialog opens.
3. Increase the quantity once.
4. Decrease the quantity once.
5. Click `Add to Cart`.
6. Wait for the dialog to close.
7. Confirm the cart count in the header increases.

Expected user-visible result:

- Dialog includes product name, SKU, description, price, inventory, quantity
  controls, and Add to Cart.
- Quantity cannot go below 1 or above the product inventory or 20.
- Add to Cart gives visible feedback and updates the cart count.

Pass criterion:

- Quick view supports product inspection and a successful add-to-cart action.

## Journey 3 - Cart CRUD Through the UI

### WEB-UAT-05 - Add From Catalog and Review in Cart Drawer

Preconditions:

- Full stack is running.
- Cart starts empty or the current cart state is documented.

Manual steps:

1. Open Catalog.
2. Click Add on one in-stock product.
3. Click the header cart icon.
4. [MANUAL] Confirm the cart drawer lists the added product.
5. Click Increase quantity.
6. Click Decrease quantity.
7. Click Remove.
8. Close the drawer.

Expected user-visible result:

- Cart drawer shows line name, product ID, quantity controls, line total,
  subtotal, checkout link, and in-memory cart notice.
- Quantity updates live.
- Removing the last item returns the drawer to the empty-cart state.

Pass criterion:

- Add, read, update, and delete all work from visible UI controls without curl.

### WEB-UAT-06 - Cart Page CRUD and Quantity Clamps

Preconditions:

- Add one product to cart from Catalog.

Manual steps:

1. Open `/cart` from the browser location bar or cart workflow.
2. [MANUAL] Confirm the cart page lists the current line and order summary.
3. Click Increase quantity until the quantity reaches 20.
4. Confirm the Increase control is disabled at 20.
5. Click Decrease quantity until the quantity reaches 1.
6. Confirm the Decrease control is disabled at 1.
7. Click Remove.

Expected user-visible result:

- Cart page and header cart count update as quantity changes.
- Total and item count update live.
- Quantity is clamped to 1-20.
- Removing the last item returns the page to an empty-cart state with a Browse
  Products action.

Pass criterion:

- The full-page cart provides reliable CRUD and clear totals.

## Journey 4 - Checkout

### WEB-UAT-07 - Place an Order and Drain Cart

Preconditions:

- Add at least one product to cart.

Manual steps:

1. Open the cart drawer or `/cart`.
2. Click `Proceed to Checkout`.
3. Type `Web UAT Customer` into `Your Name`.
4. Click `Place Order`.
5. Observe the destination after submission.
6. Open the cart drawer.

Expected user-visible result:

- Checkout shows order summary and customer name form.
- Successful submission creates an order and navigates to its detail page.
- Cart count returns to 0 and the drawer/page shows empty-cart state.

Pass criterion:

- A user can place an order with a fictional name and see confirmation without
  leaving the web app.

## Journey 5 - Orders

### WEB-UAT-08 - New Order Appears, Detail Opens, Status Persists

Preconditions:

- WEB-UAT-07 has created a new order.

Manual steps:

1. Open `/orders`.
2. Find the order for `Web UAT Customer`.
3. Click the order row.
4. [MANUAL] Confirm the detail page shows customer, placed time, total, line
   items, status badge, and actions.
5. Click `Start Preparing`.
6. Refresh the browser page.
7. Confirm the status remains `Preparing`.
8. If status is `Preparing`, click `Mark as Prepared`.
9. Refresh again.

Expected user-visible result:

- Orders list includes the new persisted order.
- Detail page opens from the list.
- Status actions update the visible status.
- Updated status survives browser reload.

Pass criterion:

- A user can find, open, manage, and reload a persisted order through the UI.

## Journey 6 - Resilience and Explorable States

### WEB-UAT-09 - Empty Cart and Invalid Order ID

Preconditions:

- Cart is empty.

Manual steps:

1. Open `/cart`.
2. [MANUAL] Confirm the empty-cart state explains what to do next.
3. Click `Browse Products`.
4. Open `/orders/does-not-exist`.
5. [MANUAL] Confirm the app shows a graceful order-not-found state.

Expected user-visible result:

- Empty cart is helpful and recoverable.
- Invalid order ID shows an app-level not-found state, not a generic 500 page.

Pass criterion:

- Failure and empty states guide the user back into the product.

### WEB-UAT-10 - Demo Mode Toggle and Mock Scenarios

Preconditions:

- Full stack may be running or stopped; this case must be explorable without
  the backend once Demo Mode is enabled.

Manual steps:

1. Click the header `Demo` control.
2. Confirm the Demo Mode banner appears.
3. Open `/dev`.
4. In Demo Guide, select `Loading State`.
5. Return to Catalog and confirm loading UI is visible briefly.
6. Return to `/dev`, select `Empty State`, then open Catalog and Orders.
7. Return to `/dev`, select `API Error`, then open Catalog.
8. Return to `/dev`, select `Cart Filled`, then open Cart.
9. Return to `/dev`, select `Checkout Fail`, then attempt checkout.
10. Disable Demo Mode from the banner.

Expected user-visible result:

- Demo Mode is clearly labeled and persists through reloads until disabled.
- Loading, empty, error, cart-filled, and checkout-failure scenarios are visible
  and recoverable.
- The user can explore the UI without a live backend.

Pass criterion:

- Demo Mode enables reliable UX exploration with accurate scenario labels.

## Journey 7 - Performance Playground

### WEB-UAT-11 - Mock-Only Performance Surface

Preconditions:

- Full stack is running, but live telemetry is not required.

Manual steps:

1. Open `/performance`.
2. [MANUAL] Confirm the page is labeled `Mock Data`.
3. Start each available scenario from the selector.
4. Stop the scenario.
5. Toggle animations on and off.
6. [MANUAL] Confirm no copy implies live Grafana, live k6, or live telemetry.

Expected user-visible result:

- The page presents simulated load scenarios for design validation.
- KPI and service cards animate only as a local mock surface.
- Future integration copy is clearly framed as planned, not active.

Pass criterion:

- A user understands the page as useful mock exploration, not production
  monitoring.

## Journey 8 - Developer Console

### WEB-UAT-12 - API Matrix and Cart Update/Remove Card

Preconditions:

- Full stack is running.
- Demo Mode is off for real proxy checks, unless explicitly testing mock mode.

Manual steps:

1. Open `/dev`.
2. Click `GET /health`.
3. Click `GET /catalog/products`.
4. Use `Cart - Add Item` to add a product.
5. Copy the returned `itemId` from the response body.
6. Paste the `itemId` into `Cart - Update / Remove`.
7. Set quantity to 3.
8. Click `PATCH /cart/items/:id`.
9. Click `DELETE /cart/items/:id`.
10. Click `GET /cart`.

Expected user-visible result:

- API debug cards show OK/error response boxes.
- Cart Update/Remove card can mutate a real cart line by item ID.
- Final cart response no longer includes the removed line.

Pass criterion:

- A developer can inspect and mutate the main BFF surfaces from `/dev`.

## Journey 9 - 3D Visualizer

### WEB-UAT-13 - Embedded Scene, Standalone Link, and Domain Mapping

Preconditions:

- Full stack is running with the visualizer profile.
- `http://localhost:3000/viz/index.html` returns 200.
- `http://localhost:3000/viz/scene.js` returns 200.

Manual steps:

1. Open `/visualizer`.
2. Inspect the iframe element in browser dev tools.
3. Confirm the iframe `src` is `/viz/index.html`.
4. [MANUAL] Confirm the scene paints a white room with product/order/cart
   objects and a `live · N objects` status.
5. Click `Open Standalone`.
6. Confirm the standalone tab opens `http://localhost:3002`.
7. Confirm `GET /visualization-data` contains:
   - Catalog products with `type: "cube"` and source `catalog`.
   - Orders with `type: "sphere"` and source `orders`.
   - Cart with `type: "marker"` and source `cart`.
8. [MANUAL] Confirm visible colors match status mapping:
   - `ok` -> green.
   - `warn` -> orange.
   - `error` -> red.
   - `idle` -> gray.

Expected user-visible result:

- Visualizer is embedded through `/viz/index.html`, not a direct iframe to
  `:3002`.
- Standalone link still opens the host visualizer.
- Scene status says `live · N objects` when the BFF data feed succeeds; it
  says `offline · N mock objects` only when the BFF fetch fails.
- Products, orders, and cart are all represented.

Pass criterion:

- The 3D page helps a user understand the current domain state without the web
  app owning Three.js internals.

### WEB-UAT-14 - Visualizer Reactivity After Domain Changes

Preconditions:

- WEB-UAT-13 is passing.

Manual steps:

1. Open `/visualizer` and note the `live · N objects` count.
2. Return to Catalog.
3. Add one item to cart.
4. Return to `/visualizer`.
5. Click `Reload`.
6. [MANUAL] Confirm the cart marker remains present and reflects a non-empty
   cart state.
7. Complete checkout with `Web UAT Customer`.
8. Return to `/visualizer`.
9. Click `Reload`.
10. [MANUAL] Confirm the item count increases and a new order object appears.

Expected user-visible result:

- Reloading the embedded visualizer refreshes from current BFF domain state.
- Cart and orders changes made through the web app are reflected in the scene.

Pass criterion:

- The visualizer is not stale after an explicit reload or reopening `/viz`.

## Execution Log - 2026-05-29

Environment:

- Stack target requested: `pnpm pg:up full`.
- Browser automation: unavailable. The in-app browser registry returned no
  browser, and the Playwright CLI was not installed in the workspace.
- Pixel-dependent checks are therefore not claimed as executed.

Results:

```text
[DRIFT] env-1 - `pnpm pg:up full` migrated and seeded, then failed with `unknown flag: --profile`; direct Docker Compose profile invocation was used to continue.
[PASS]  env-2 - Direct Compose equivalent started bff, web, visualizer-3d, postgres, and otel-collector as healthy.
[PASS]  smoke-1 - `pnpm pg:smoke` passed all 12 smoke checks.
[PASS]  proxy-1 - `curl http://localhost:3000/api/bff/health` returned 200.
[PASS]  proxy-2 - `/api/bff/orders/ord_demo` returned 200 and `/api/bff/orders/does-not-exist` returned 404.
[PASS]  route-1 - `/` returned 200.
[PASS]  route-2 - `/cart` returned 200.
[PASS]  route-3 - `/checkout` returned 200.
[PASS]  route-4 - `/orders` returned 200.
[FAIL]  route-5 - `/orders/ord_demo` returned 500; expected an order detail page.
[FAIL]  route-6 - `/orders/does-not-exist` returned 500; expected graceful order-not-found UI.
[PASS]  route-7 - `/visualizer` returned 200.
[PASS]  route-8 - `/performance` returned 200.
[PASS]  route-9 - `/dev` returned 200.
[PASS]  viz-1 - `/viz/index.html` and `/viz/scene.js` returned 200 through the web proxy.
[PASS]  viz-2 - Standalone visualizer assets at `http://localhost:3002/` and `/scene.js` returned 200.
[PASS]  viz-3 - `/api/bff/visualization-data` returned 76 items: 7 catalog, 68 orders, 1 cart.
[PASS]  cart-1 - Proxy cart CRUD worked: POST added `ci_001`, PATCH set quantity 3, DELETE removed it.
[PASS]  checkout-orders-1 - Proxy checkout created `ord_067`, drained cart to 0, and order status persisted as `preparing` after manage + reload.
[SKIP]  manual-1 - Header/footer click navigation was not browser-executed because no browser automation surface was available.
[SKIP]  manual-2 - Rendered layout and cart drawer pixels were not verified because no browser automation surface was available.
[SKIP]  manual-3 - Demo Mode scenario pixels were not verified because no browser automation surface was available.
[SKIP]  manual-4 - `/dev` card interactions were not browser-executed because no browser automation surface was available.
[SKIP]  manual-5 - 3D scene painting, color coding, and reload reactivity were not visually verified because no browser automation surface was available.
```

Summary: 16 passed / 2 failed / 1 drifted / 5 skipped

Runtime: not measured end-to-end; shell execution ran during the 2026-05-29
session after full-stack startup.

## Drift Register

- `[DRIFT] env-1`: `pnpm pg:up full` fails on this Docker Compose version
  because `targetToProfiles()` returns literal `--profile` flags and `up()`
  passes them after the `up` subcommand. Recommendation: return profile names
  from `targetToProfiles()` and pass them through the existing `compose(...,
  { profiles })` helper, or otherwise place profile flags before `up`.

Resolution update on 2026-05-29:

- `[RESOLVED] env-1`: `scripts/playground.mjs` now returns profile names from
  `targetToProfiles()` and passes them through `compose(..., { profiles })`, so
  Docker Compose receives `--profile` before the `up` subcommand.
- `pnpm pg:up full` passed on this machine with bff, web, visualizer-3d,
  postgres, and otel-collector healthy; it no longer fails with
  `unknown flag: --profile`.
- `pnpm pg:smoke` passed 10/10 checks, including the SSE
  `/visualization-updates` smoke check.


## Failure Detail

### route-5 - Order Detail Route Returns 500

Command:

```bash
curl -s -o /dev/null -w '/orders/ord_demo %{http_code}\n' http://localhost:3000/orders/ord_demo
```

Expected:

- HTTP 200 and an order detail UI for `ord_demo`.

Actual:

- HTTP 500.
- Web container log:

  ```text
  Error: An unsupported type was passed to use(): [object Object]
  ```

Likely cause:

- `apps/web/app/orders/[orderId]/page.tsx` types `params` as a Promise and
  calls `use(params)`. The running app is Next.js 14.2, where route `params`
  are passed as a plain object for this page shape.

User impact:

- Checkout success redirects to `/orders/:orderId`, so a successful order
  leaves the user on a 500 page instead of confirmation.
- Users cannot open seeded or newly created order detail pages.
- Order status management UI is inaccessible.

Recommendation:

- Fix the web order detail page parameter handling for Next.js 14 before
  considering the commerce journey accepted.

### route-6 - Invalid Order ID Route Returns 500

Command:

```bash
curl -s -o /dev/null -w '/orders/does-not-exist %{http_code}\n' http://localhost:3000/orders/does-not-exist
```

Expected:

- HTTP 200 or 404 with a user-visible "Order not found" state.

Actual:

- HTTP 500 with the same `use(params)` error as route-5.

User impact:

- The resilience journey fails because invalid IDs show an app crash instead
  of a recoverable not-found state.

Recommendation:

- Fix the order detail route first; then rerun WEB-UAT-08 and WEB-UAT-09.

## Visualizer Findings and Recommendation

Observed from code and shell probes:

- `/visualizer` returns 200.
- The embed source is `/viz/index.html`.
- `/viz/index.html`, `/viz/scene.js`, and `/viz/config.js` are reachable
  through the web app.
- The standalone visualizer at `http://localhost:3002` returns 200.
- `/viz/config.js` configures the visualizer's data base URL as
  `http://localhost:3001`, matching the documented current-state note that the
  visualizer's own browser fetch still targets the host BFF.
- `scene.js` maps:
  - `cube` to box geometry.
  - `sphere` to sphere geometry.
  - `marker` to cone geometry.
  - `ok`, `warn`, `error`, `idle` to green, orange, red, and gray.
- `visualization-data` currently contains real domain state: 7 catalog items,
  68 order items, and 1 cart marker.

Recommendation:

- No embed-only wire-up was changed. The proxy and assets are reachable, and
  the data feed is populated.
- A human should still execute WEB-UAT-13 and WEB-UAT-14 in a real browser to
  verify pixels, color coding, and reload behavior.
- If strict same-origin data fetch is required for the embedded scene, the
  minimal future wire-up is to give the embedded visualizer a proxy-relative
  API base such as `/api/bff` while preserving the standalone `:3002` path.

## Verdict

The app is partially valuable and navigable today: Catalog, cart backend CRUD,
checkout backend persistence, orders list, `/performance`, `/dev`, and
visualizer proxy/assets are present and reachable.

It is not yet acceptable as a complete user-facing commerce flow because the
order detail route returns 500. That breaks checkout confirmation, order detail
navigation, order status management, and invalid-order resilience.

Top blockers:

1. Fix `/orders/[orderId]` route parameter handling so detail pages render.
2. Rerun the checkout and orders journeys manually in a browser after that fix.
3. Visually verify the 3D scene and reload behavior in a real browser.
