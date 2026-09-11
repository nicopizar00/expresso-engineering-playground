# Single-Page App — Design

Status: Proposed

Related:

- [docs/superpowers/specs/2026-09-10-homepage-visualizer-stage-design.md](2026-09-10-homepage-visualizer-stage-design.md)
  — the immediately preceding redesign. This document builds directly on
  its `.home-stage` (visualizer) / `.home-stage-strip` (catalog + cart)
  layout and reuses it as the shell for every section, not just Catalog.

## Purpose

Today the app is six routes: `/` (catalog + cart + checkout, per the prior
redesign), `/cart`, `/checkout`, `/orders`, `/orders/[orderId]`, `/dev`,
`/performance`. This collapses all of it into one route, `/`. The header
nav stops linking to routes and becomes a section switcher; the 3D
visualizer stage stays pinned across every section (not just Catalog); the
strip below it swaps between Catalog+Cart, Orders, Performance, and API
Debug depending on which section is active.

## Non-goals

- **Redesigning any section's internals.** Orders, Performance, and API
  Debug are relocated, not rebuilt — their existing components, state,
  data-fetching, and copy carry over unchanged except where a route
  dependency (a URL param, a `router.push`) has to become a prop or
  callback because the route it depended on no longer exists.
- **Preserving zero-scroll outside Catalog.** The prior redesign's "truly
  zero scroll" rule was specific to the Catalog section's fixed-viewport
  stage. Orders (list + detail), Performance (a 3-column dashboard with
  live-updating cards), and API Debug (a grid of independent request
  cards) are content-heavy tools that were never designed for a fixed
  height slice — their panel scrolls normally when its content doesn't
  fit. The visualizer stage above them stays fixed-height regardless.
- **`CartDrawer` (the slide-over).** Unaffected — it is UI chrome, not a
  route, and nothing about this change touches it.
- **The BFF, or any API contract.** Every section keeps calling the same
  endpoints through the same `expressoApi` client it does today.
- **Mobile/responsive redesign of the new tab switcher.** Follows the
  existing desktop-only scope already established for the stage layout.

## Architecture

### Routing: one page, tab state in the query string

`apps/web/app/page.tsx` becomes the only real page. A `SectionId` union
(`'catalog' | 'orders' | 'performance' | 'dev'`) is read from
`useSearchParams().get('tab')` (default `'catalog'` when absent or
unrecognized) and drives which section renders in the strip. Switching
sections calls `router.push('/?tab=orders')` (a shallow same-route
navigation — Next.js does not remount `AppShell` or the visualizer for a
search-param-only change, so the pinned visualizer instance and its SSE
connection survive every section switch). This keeps the URL meaningful
(refresh, back-button, and copy-paste-the-link all work) while staying a
single page.

`AppShell.tsx` loses its `isHome` branch entirely — since every route is
now `/`, `isHome` is always true. Concretely:

- The root div's className drops the `isHome ? " home-shell-root" : ""`
  ternary — `home-shell-root` is now unconditional.
- The body always renders `<main className="shell-content-full">{children}</main>`
  — the `shell-body` / `VisualizerPanel` branch is deleted, not just
  unreached.
- The footer's `{!isHome && (...)}` wrapper is deleted along with the
  footer itself — it never rendered once `isHome` was permanent, and its
  only two links (an external "Source" link, and "API Debug" pointing at
  the now-gone `/dev` route) are redundant with the header nav's own API
  tab.
- `navLinks`' `href` values stop being routes; each entry gets a
  `SectionId` instead (see "Nav becomes a section switcher" below).

**Deleted as dead code, not just deleted as routes:** `VisualizerPanel.tsx`
(the component), and CSS rules that existed only to support it —
`.shell-body`, `.viz-panel`, `.viz-pull-tab`, `.viz-bezel*`, `.cart-backdrop`
/`.cart-panel`'s `--viz-rail-w` offset math (the rail it was offsetting for
no longer exists anywhere), and `--viz-rail-w` itself. `CartDrawer`'s
backdrop/panel go back to simple full-viewport positioning since there is
no rail to avoid, on any route, ever.

### Nav becomes a section switcher

```tsx
type SectionId = "catalog" | "orders" | "performance" | "dev";

type NavLink =
  | { section: SectionId; label: string; icon: LucideIcon }
  | { href: string; label: string; icon: LucideIcon; external: true }; // Admin only

const navLinks: NavLink[] = [
  { section: "catalog", label: "Catalog", icon: Coffee },
  { section: "orders", label: "Orders", icon: Package },
  { section: "performance", label: "Performance", icon: Gauge },
  { section: "dev", label: "API", icon: Activity },
  ...(PRISMA_STUDIO_URL ? [{ href: PRISMA_STUDIO_URL, label: "Admin", icon: Database, external: true }] : []),
];
```

The external Admin link (Prisma Studio) is the one nav entry that stays a
real link — it points outside the app entirely and was never part of this
single-page surface. Every other entry becomes a button that calls
`router.push(`/?tab=${section}`)`; "active" highlighting compares the
current `SectionId` instead of `pathname`. The logo's `<Link href="/">`
becomes a button that resets to `?tab=catalog` (equivalent behavior,
different mechanism).

### The strip: four sections, one component each

`page.tsx`'s `.home-stage-strip` currently always renders `ProductCatalogGrid`
+ `CartCheckoutPanel`. It now switches on `SectionId`:

```
catalog     → unchanged: ProductCatalogGrid | CartCheckoutPanel (two columns, zero-scroll, exactly as today)
orders      → OrdersSection (new, full-width, scrolls)
performance → PerformanceSection (new, full-width, scrolls)
dev         → DevSection (new, full-width, scrolls)
```

Non-catalog sections span the strip's full width (no cart column — there
is nothing to check out while looking at Orders/Performance/API Debug) and
use `overflow-y: auto` instead of the catalog pane's constrained layout,
matching the Non-goals note above.

### Section components: relocated, not rebuilt

Each existing page becomes a component under
`apps/web/src/components/sections/`, with the minimum change needed to
drop its route dependency:

- **`OrdersSection.tsx`** ← `apps/web/app/orders/page.tsx` +
  `apps/web/app/orders/[orderId]/page.tsx`. The two pages merge into one
  component with internal state: `const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null)`.
  `null` renders the existing list + lookup-form view (`OrderRow`'s
  `<Link href={...}>` becomes `<button onClick={() => setSelectedOrderId(order.orderId)}>`,
  same for the lookup form's `router.push`). A non-null id renders the
  existing detail view (`OrderPage`'s body), with its own `"Continue
  shopping"` back-link changed to a `"Back to orders"` button that calls
  `setSelectedOrderId(null)`, and its `params.orderId` becomes the
  `selectedOrderId` prop instead. `OrderManagePanel` is untouched — it
  already took `order` as a prop, not a route param.
- **`PerformanceSection.tsx`** ← `apps/web/app/performance/page.tsx`,
  body unchanged (it already had zero route dependencies — no params, no
  `router` calls). Only the outer `<div className="container py-8">`
  wrapper changes to fit the strip instead of a full page.
- **`DevSection.tsx`** ← `apps/web/app/dev/page.tsx`, same treatment —
  the whole card grid (Health, Catalog, Add to Cart, Checkout, Order
  Lookup/Manage, Demo Guide, Readiness, Performance Info) has zero route
  dependencies today and moves verbatim under a new outer wrapper. One
  reference needs updating: `DemoGuidePanel`'s sample-order link
  (`<a href={`/orders/${sampleOrderId}`}>`) becomes a button that pushes
  `/?tab=orders` (jumping to the Orders section is the closest equivalent
  to "open this order" without deep-linking into `OrdersSection`'s
  internal selection state — landing on the list with the sample order
  visible is an acceptable, honest substitute for a route that no longer
  exists).

### Checkout's post-order navigation

`CartCheckoutPanel.tsx` currently does `router.push(\`/orders/${result.orderId}\`)`
on successful checkout — a real page navigation to a route that no longer
exists. It becomes a callback prop:

```tsx
interface CartCheckoutPanelProps {
  variant?: "page" | "sidebar";
  onOrderPlaced?: (orderId: string) => void;
}
```

`page.tsx` passes `onOrderPlaced={(orderId) => { setSection("orders"); orderIdToOpenRef.current = orderId; }}`
(or equivalent) so placing an order switches to the Orders tab with that
order pre-selected, matching the "success banner for fresh orders" UX the
detail view already has today (`order.status === 'pending'` shows "Order
placed successfully!" — unchanged).

### `CartCheckoutPanel`'s `variant="page"` becomes dead code

`/checkout` is deleted as a route (redundant since the prior redesign made
checkout always-visible on `/`; this redesign removes the last possible
reason to visit it directly). `CartCheckoutPanel` is called exactly once
now, `variant="sidebar"`, from `page.tsx`. The `variant` prop, the `"page"`
branch's padding/card-size values, and the prop's `"page" | "sidebar"`
union all get deleted — this is real dead code once `/checkout` is gone,
not a hypothetical.

### Routes deleted

`apps/web/app/cart/`, `apps/web/app/checkout/`, `apps/web/app/orders/`,
`apps/web/app/dev/`, `apps/web/app/performance/` — all removed. `/cart` and
`/checkout` have no replacement (their functionality has lived inline on
`/` since the prior redesign); `/orders`, `/dev`, `/performance` are
replaced by the `OrdersSection` / `DevSection` / `PerformanceSection`
components described above.

## Data flow: placing an order, then checking on it

1. Shopper is on Catalog (`?tab=catalog`, or no query string). Adds the
   product, clicks Place Order in `CartCheckoutPanel`.
2. `expressoApi.checkout({})` succeeds. `onOrderPlaced(orderId)` fires:
   `page.tsx` sets section state to `orders` (via `router.push('/?tab=orders')`)
   and records the new order's id for `OrdersSection` to pre-select.
3. `OrdersSection` mounts (or re-renders) with `selectedOrderId` already
   set to the new order — renders the detail view directly, showing the
   existing "Order placed successfully!" banner (unchanged condition:
   `order.status === 'pending'`).
4. Shopper clicks "Back to orders" — `selectedOrderId` clears, the list
   view (still showing the same order) renders instead.
5. Shopper clicks the Catalog tab — `router.push('/?tab=catalog')`. The
   visualizer, mounted once by `page.tsx` outside the section switch,
   never remounted through any of this.

## Error handling

- **Unrecognized `?tab=` value** (a typo'd or stale bookmark): falls back
  to `catalog`, same as no query string at all — no error state needed,
  matches how the prior redesign's zero-scroll page already treats
  Catalog as the default.
- **Deep link into a specific order** (e.g. sharing `/?tab=orders`): lands
  on the Orders list, not a specific order — this design does not add a
  second query param for the selected order id. Anyone wanting a specific
  order still uses the existing "Look Up Order" form. Flagged as a
  deliberate scope cut, not an oversight: adding `?tab=orders&order=ord_1`
  is a small, obvious follow-up if it's ever wanted.
- **Section components' own error/loading states** (failed fetch, empty
  list, etc.): unchanged — each one already handles its own
  loading/error/empty rendering today and none of that logic depends on
  being inside a route.

## Testing

- e2e specs that currently `page.goto('/orders')`, `page.goto('/dev')`,
  `page.goto('/performance')`, `page.goto('/checkout')`, or
  `page.goto('/cart')` need rewriting to `page.goto('/')` followed by a
  tab click (or `page.goto('/?tab=orders')` directly, which works
  identically since the app reads the same query param on load). This
  touches `frontend-certification.spec.ts`, `checkout-happy-path.spec.ts`,
  `purchase.spec.ts`, and `visual-integrity.spec.ts` at minimum — an
  implementation plan should grep every spec file for these five paths
  rather than trust this list, the same way the prior redesign's plan
  under-scoped its own e2e pass on the first attempt.
- New coverage worth adding: a test that switches Catalog → Orders →
  Performance → API → Catalog and asserts the visualizer iframe's `src`
  attribute (or a stable identity marker) never changes — proving the
  single-instance-across-sections claim this whole design rests on,
  something no existing test currently checks because no existing test
  needed to.

## Definition of done

- Exactly one route exists under `apps/web/app/`: `/`.
- All four sections (Catalog, Orders, Performance, API Debug) are reachable
  from the header nav, render their existing functionality unchanged, and
  the 3D visualizer stays visible and mounted (same iframe instance) while
  switching between all of them.
- Placing an order from Catalog lands on that order's detail view under
  the Orders tab without a full page navigation.
- `/cart`, `/checkout`, `/orders`, `/orders/[id]`, `/dev`, `/performance`
  no longer exist as routes.
- `AppShell.tsx` has no `isHome` conditional; `VisualizerPanel.tsx` and its
  supporting CSS (`.shell-body`, `.viz-panel*`, `.viz-bezel*`,
  `--viz-rail-w` and its consumers) are deleted.
- `pnpm typecheck`, `pnpm lint`, and the full e2e suite are green.
