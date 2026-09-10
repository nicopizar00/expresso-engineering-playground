# Homepage Visualizer Stage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `/` into a single fixed-viewport stage — 3D visualizer as the
largest, permanently-visible element (not a side rail), catalog + cart +
checkout all in the first view, no page-level scrolling. Every other route
keeps today's sticky-rail layout untouched.

**Architecture:** `AppShell` branches on `pathname === "/"` to stop
rendering the persistent visualizer rail + footer on home only. The home
page becomes its own 3-zone CSS grid (visualizer stage on top, catalog +
a new `CartCheckoutPanel` sidebar below) that fills the flex remainder
under the header. `CartCheckoutPanel` is extracted from the existing
`/checkout` page so the same cart-summary-plus-submit logic renders both
standalone (full page) and inline (homepage sidebar).

**Tech Stack:** Next.js (App Router) client components, hand-rolled utility
CSS in `apps/web/app/globals.css` (not Tailwind — a look-alike subset is
defined directly in that file), SWR for data fetching, Playwright for e2e.

**Spec:** [docs/superpowers/specs/2026-09-10-homepage-visualizer-stage-design.md](../specs/2026-09-10-homepage-visualizer-stage-design.md)

## Global Constraints

- Scope is `/` only. `/orders`, `/orders/[orderId]`, `/checkout` (direct
  visit), `/cart`, `/dev`, `/performance` must render exactly as they do
  today — same rail, same footer.
- No responsive/mobile design for the new stage. Browser-only, desktop
  viewport. Do not add media queries or a mobile fallback for `.home-stage*`.
- "No scrolling" means **truly zero scroll anywhere** on `/` — panels use
  `overflow: hidden`, not `overflow: auto`. This is acceptable because the
  catalog is contractually capped at one product (CUP-001); it is a known,
  accepted limitation if the catalog ever grows (see spec Non-goals).
- Reuse `ProductCatalogGrid`, `ProductCard`, `CartDrawer`, the header cart
  icon, and `scene.js` exactly as they are today — no internal changes to
  any of them.
- No backend changes. No changes to `CUP-001` enforcement.
- `pnpm --filter @mini-commerce/web typecheck` and `pnpm --filter
  @mini-commerce/web lint` must be green after every task.

---

## Task 1: AppShell route-conditional layout

**Files:**
- Modify: `apps/web/src/components/system/AppShell.tsx:64-383`
- Modify: `apps/web/app/globals.css:1134-1136`

**Interfaces:**
- Consumes: `usePathname()` (already imported in this file, `next/navigation`).
- Produces: a `.shell-content-full` CSS class. No new exports — this is an
  internal rendering change to `AppShell`. Task 3's `page.tsx` relies on the
  *absence* of `VisualizerPanel`/footer on `/` that this task creates.

- [ ] **Step 1: Add the `isHome` branch to `AppShell`**

  In `apps/web/src/components/system/AppShell.tsx`, find:

  ```tsx
  export function AppShell({ children }: { children: ReactNode }) {
    const pathname = usePathname();
    const { itemCount, isCartDrawerOpen, openCartDrawer, closeCartDrawer } =
      useCart();
  ```

  Replace with:

  ```tsx
  export function AppShell({ children }: { children: ReactNode }) {
    const pathname = usePathname();
    const isHome = pathname === "/";
    const { itemCount, isCartDrawerOpen, openCartDrawer, closeCartDrawer } =
      useCart();
  ```

- [ ] **Step 2: Branch the body — drop the rail on home**

  Find:

  ```tsx
      {/* Body: content column + persistent visualizer rail. Whatever the
          shopper does — browse, cart, checkout, orders — the live order
          counter stays in view. */}
      <div className="shell-body">
        <main className="shell-content">{children}</main>
        <VisualizerPanel />
      </div>
  ```

  Replace with:

  ```tsx
      {/* Body: on the homepage the page itself owns a full-bleed visualizer
          stage (see apps/web/app/page.tsx) — no persistent rail there. Every
          other route keeps the content column + sticky visualizer rail so
          the live order counter stays in view while browsing/checking out/
          reviewing orders. */}
      {isHome ? (
        <main className="shell-content-full">{children}</main>
      ) : (
        <div className="shell-body">
          <main className="shell-content">{children}</main>
          <VisualizerPanel />
        </div>
      )}
  ```

- [ ] **Step 3: Drop the footer on home**

  Find:

  ```tsx
      {/* Footer */}
      <footer
        className="border-t py-6"
  ```

  Replace with:

  ```tsx
      {/* Footer — hidden on home; the stage layout has no room for it and
          no page scroll to reach it anyway. */}
      {!isHome && (
      <footer
        className="border-t py-6"
  ```

  Then find the footer's closing tag:

  ```tsx
        </div>
      </footer>

      {/* Cart Drawer */}
  ```

  Replace with:

  ```tsx
        </div>
      </footer>
      )}

      {/* Cart Drawer */}
  ```

- [ ] **Step 4: Add `.shell-content-full` to `globals.css`**

  Find:

  ```css
  .shell-content {
    min-width: 0;
  }
  ```

  Replace with:

  ```css
  .shell-content {
    min-width: 0;
  }

  /* Used only on `/`: AppShell renders this instead of `.shell-body` +
     VisualizerPanel when there is no rail (the home page owns its own
     full-bleed visualizer stage). Mirrors `.shell-body`'s flex-fill so the
     page grid below it can size off 100% with no hardcoded vh math. */
  .shell-content-full {
    flex: 1 1 auto;
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
  ```

- [ ] **Step 5: Typecheck and lint**

  Run: `pnpm --filter @mini-commerce/web typecheck && pnpm --filter @mini-commerce/web lint`
  Expected: both PASS with no errors.

- [ ] **Step 6: Manual browser verification**

  Run `./dev up web`, then in the browser:
  - Load `/`: no visualizer rail, no footer. The catalog + old sticky cart
    bar still render (now full width, no rail beside them) — **the
    visualizer is intentionally absent on `/` at this checkpoint**; that's
    expected and gets fixed in Task 3, not a regression to chase now.
  - Load `/orders`: sticky visualizer rail and footer still present,
    unchanged.

- [ ] **Step 7: Targeted regression check**

  Run: `pnpm --filter @mini-commerce/e2e exec playwright test -g "certifies dialog focus restore"`
  Expected: PASS (this test asserts the rail is still visible on
  `/performance`, proving non-home routes are unaffected).

  Note for the record (do not chase these now — Task 4 fixes them): any
  test asserting `getByTestId("viz-panel")` or the visualizer iframe while
  on `/` — e.g. `homepage-workspace.spec.ts`'s "renders catalog and
  embedded visualizer side by side", `visual-integrity.spec.ts`'s "keeps
  the CSS utility contract..." and "opens cart drawer... reaches
  checkout" — now fails, because `/` has no rail and (until Task 3) no
  visualizer at all. This is expected from this task onward until Task 4
  rewrites those assertions.

- [ ] **Step 8: Commit**

  ```bash
  git add apps/web/src/components/system/AppShell.tsx apps/web/app/globals.css
  git commit -m "feat(web): stop rendering the visualizer rail and footer on the homepage"
  ```

---

## Task 2: `CartCheckoutPanel` component + `/checkout` rewire

**Files:**
- Create: `apps/web/src/components/cart/CartCheckoutPanel.tsx`
- Modify: `apps/web/app/checkout/page.tsx` (full rewrite)
- Modify: `apps/web/src/components/cart/README.md`

**Interfaces:**
- Consumes: `useCart(): CartViewModel` from `./CartProvider` (fields used:
  `cart`, `isLoading`, `isEmpty`, `formattedTotal`, `refreshCart`);
  `expressoApi.checkout(input: CheckoutInput): Promise<CheckoutResponse>`,
  `ExpressoApiError`, `formatMoney(amountMinor: number, currency: string):
  string` from `@/lib/api/expresso-api`.
- Produces: `CartCheckoutPanel({ variant?: 'page' | 'sidebar' }): JSX.Element`
  (named export). Task 3 renders `<CartCheckoutPanel variant="sidebar" />`
  in the new home page.

- [ ] **Step 1: Create `CartCheckoutPanel`**

  Create `apps/web/src/components/cart/CartCheckoutPanel.tsx`:

  ```tsx
  "use client";

  /**
   * CartCheckoutPanel - Cart summary + place-order submission
   *
   * Shared by the standalone /checkout page (variant="page", which
   * pre-guards loading/empty with its own full-page states before
   * rendering this) and the homepage's always-visible sidebar
   * (variant="sidebar", which has no such guard — this component's own
   * loading/empty branches are what render there).
   */

  import { useState } from "react";
  import { useRouter } from "next/navigation";
  import {
    ShoppingBag,
    Loader2,
    AlertTriangle,
    CheckCircle2,
  } from "lucide-react";
  import { useCart } from "./CartProvider";
  import {
    expressoApi,
    ExpressoApiError,
    formatMoney,
  } from "@/lib/api/expresso-api";

  interface CartCheckoutPanelProps {
    /**
     * 'page'    — roomier cards, used standalone on /checkout.
     * 'sidebar' — compact column, used in the homepage stage strip.
     */
    variant?: "page" | "sidebar";
  }

  export function CartCheckoutPanel({
    variant = "sidebar",
  }: CartCheckoutPanelProps) {
    const router = useRouter();
    const { cart, isLoading, isEmpty, formattedTotal, refreshCart } = useCart();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function handleSubmit(e: React.FormEvent) {
      e.preventDefault();
      if (isSubmitting) return;

      setIsSubmitting(true);
      setError(null);

      try {
        const result = await expressoApi.checkout({});
        refreshCart();
        router.push(`/orders/${result.orderId}`);
      } catch (err) {
        if (err instanceof ExpressoApiError) {
          if (err.status === 400) {
            setError(
              "Invalid checkout request. Please check your cart and try again.",
            );
          } else if (err.status === 409) {
            setError(
              "Checkout conflict. Your cart may have been modified. Please refresh and try again.",
            );
          } else {
            setError(`Checkout failed: ${err.message}`);
          }
        } else {
          setError("An unexpected error occurred. Please try again.");
        }
      } finally {
        setIsSubmitting(false);
      }
    }

    if (isLoading) {
      return (
        <div
          className="flex items-center justify-center py-8"
          data-testid="cart-checkout-panel"
        >
          <Loader2
            className="h-5 w-5 animate-spin"
            style={{ color: "var(--muted-foreground)" }}
          />
        </div>
      );
    }

    if (isEmpty) {
      return (
        <div
          className="rounded-lg border p-4 text-sm"
          style={{
            borderColor: "var(--border)",
            color: "var(--muted-foreground)",
          }}
          data-testid="cart-checkout-panel"
        >
          Cart is empty — add the product to get started.
        </div>
      );
    }

    const cardPadding = variant === "page" ? "p-5" : "p-3";
    const headerPadding = variant === "page" ? "px-5 py-4" : "px-3 py-2";
    const cardClass =
      variant === "page"
        ? "rounded-xl border overflow-hidden"
        : "rounded-lg border overflow-hidden";

    return (
      <div
        className={variant === "page" ? "space-y-6" : "space-y-3"}
        data-testid="cart-checkout-panel"
      >
        {/* Order summary card */}
        <div
          className={cardClass}
          style={{ backgroundColor: "var(--card)", borderColor: "var(--border)" }}
        >
          <div
            className={`flex items-center gap-2 ${headerPadding} border-b`}
            style={{ borderColor: "var(--border)" }}
          >
            <ShoppingBag className="h-4 w-4" style={{ color: "var(--primary)" }} />
            <h2 className="font-medium text-sm" style={{ color: "var(--foreground)" }}>
              Order Summary
            </h2>
            <span
              className="ml-auto px-2 py-0.5 text-xs font-medium rounded-full"
              style={{
                backgroundColor: "var(--secondary)",
                color: "var(--muted-foreground)",
              }}
            >
              {cart?.itemCount} items
            </span>
          </div>

          <div className={cardPadding}>
            <ul className="divide-y" style={{ borderColor: "var(--border)" }}>
              {cart?.items.map((item) => (
                <li
                  key={item.itemId}
                  className="py-3 flex justify-between first:pt-0 last:pb-0"
                >
                  <div>
                    <p
                      className="font-medium text-sm"
                      style={{ color: "var(--foreground)" }}
                    >
                      {item.name}
                    </p>
                    <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                      Qty: {item.quantity}
                    </p>
                  </div>
                  <p
                    className="font-medium text-sm font-mono"
                    style={{ color: "var(--foreground)" }}
                  >
                    {formatMoney(item.lineTotal.amountMinor, item.lineTotal.currency)}
                  </p>
                </li>
              ))}
            </ul>

            <div
              className="flex justify-between pt-4 mt-4 border-t"
              style={{ borderColor: "var(--border)" }}
            >
              <span className="font-medium" style={{ color: "var(--foreground)" }}>
                Total
              </span>
              <span className="font-semibold font-mono" style={{ color: "var(--foreground)" }}>
                {formattedTotal}
              </span>
            </div>
          </div>
        </div>

        {/* Checkout form */}
        <form
          onSubmit={handleSubmit}
          className={cardClass}
          style={{ backgroundColor: "var(--card)", borderColor: "var(--border)" }}
        >
          <div className={`${cardPadding} space-y-3`}>
            {error && (
              <div
                className="flex items-start gap-3 p-4 rounded-lg"
                style={{
                  backgroundColor: "rgba(239, 68, 68, 0.1)",
                  border: "1px solid rgba(239, 68, 68, 0.2)",
                }}
                role="alert"
              >
                <AlertTriangle
                  className="h-4 w-4 mt-0.5 shrink-0"
                  style={{ color: "var(--destructive)" }}
                />
                <p className="text-sm" style={{ color: "var(--destructive)" }}>
                  {error}
                </p>
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center justify-center gap-2 w-full px-4 py-3 rounded-lg text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                backgroundColor: "var(--primary)",
                color: "var(--primary-foreground)",
              }}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  Place Order
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    );
  }
  ```

  This is a verbatim port of `/checkout`'s existing order-summary-card and
  form JSX (same classes, same copy, same error branching) parameterized by
  `variant` for padding/card-size only — the `'page'` variant renders
  pixel-identical output to what `/checkout` renders today.

- [ ] **Step 2: Rewrite `/checkout` to use it**

  Replace the entire contents of `apps/web/app/checkout/page.tsx` with:

  ```tsx
  'use client';

  /**
   * Checkout Page - Order placement flow
   *
   * Standalone destination for direct links/bookmarks. Cart summary and
   * submit logic live in CartCheckoutPanel, shared with the homepage's
   * always-visible sidebar (see apps/web/app/page.tsx).
   */

  import { ArrowLeft, CreditCard, Shield } from 'lucide-react';
  import Link from 'next/link';
  import { useCart } from '@/components/cart/CartProvider';
  import { CartCheckoutPanel } from '@/components/cart/CartCheckoutPanel';
  import { EmptyState } from '@/components/system/EmptyState';
  import { PageLoadingState } from '@/components/system/LoadingSkeleton';

  export default function CheckoutPage() {
    const { isLoading, isEmpty } = useCart();

    if (isLoading) {
      return (
        <div className="container py-8">
          <PageLoadingState message="Loading checkout..." />
        </div>
      );
    }

    if (isEmpty) {
      return (
        <div className="container py-8">
          <EmptyState
            variant="cart"
            title="Your cart is empty"
            description="Add some products to your cart before checking out."
            action={{
              label: 'Browse Products',
              href: '/',
            }}
          />
        </div>
      );
    }

    return (
      <div className="container py-8 max-w-2xl">
        <Link
          href="/cart"
          className="inline-flex items-center gap-2 text-sm font-medium mb-6 transition-colors"
          style={{ color: 'var(--muted-foreground)' }}
        >
          <ArrowLeft className="h-4 w-4" />
          Back to cart
        </Link>

        <div className="flex items-center gap-3 mb-8">
          <div
            className="flex items-center justify-center w-10 h-10 rounded-lg"
            style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)' }}
          >
            <CreditCard className="h-5 w-5" />
          </div>
          <div>
            <h1
              className="text-2xl font-semibold tracking-tight"
              style={{ color: 'var(--foreground)' }}
            >
              Checkout
            </h1>
            <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
              Complete your order
            </p>
          </div>
        </div>

        <div className="space-y-6">
          <CartCheckoutPanel variant="page" />

          <div
            className="flex items-start gap-3 p-4 rounded-xl"
            style={{ backgroundColor: 'var(--secondary)' }}
          >
            <Shield className="h-4 w-4 mt-0.5 shrink-0" style={{ color: 'var(--primary)' }} />
            <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
              This is a playground environment. No real payment is processed. Orders
              are persisted to PostgreSQL and survive BFF restarts.
            </p>
          </div>
        </div>
      </div>
    );
  }
  ```

- [ ] **Step 3: Update the cart components README**

  In `apps/web/src/components/cart/README.md`, find:

  ```markdown
  Current components:
  - `CartProvider` + `useCart()` hook — owns refresh/state.
  - `CartDrawer` — slide-over panel listing items, totals, and checkout CTA.
  ```

  Replace with:

  ```markdown
  Current components:
  - `CartProvider` + `useCart()` hook — owns refresh/state.
  - `CartDrawer` — slide-over panel listing items, totals, and checkout CTA.
  - `CartCheckoutPanel` — cart summary + place-order submit. Used standalone
    on `/checkout` (`variant="page"`) and inline in the homepage stage
    (`variant="sidebar"`).
  ```

- [ ] **Step 4: Typecheck and lint**

  Run: `pnpm --filter @mini-commerce/web typecheck && pnpm --filter @mini-commerce/web lint`
  Expected: both PASS.

- [ ] **Step 5: Manual browser verification**

  With `./dev up web` running:
  - Add the product from `/`, open the cart drawer, click "Proceed to
    Checkout" → confirm `/checkout` looks identical to before (back link,
    header, order summary card, Place Order button), submitting redirects
    to `/orders/:id`.
  - Visit `/checkout` directly with an empty cart → confirm the illustrated
    empty state still renders.

- [ ] **Step 6: Regression check against the checkout flow**

  Run:
  ```bash
  pnpm --filter @mini-commerce/e2e exec playwright test -g "places an order and manages status"
  pnpm --filter @mini-commerce/e2e exec playwright test -g "certifies catalog, cart CRUD, checkout"
  ```
  Expected: both PASS. Neither test asserts anything about the visualizer
  rail — they only exercise add → drawer → checkout → place order → order
  page, which this task must not change.

- [ ] **Step 7: Commit**

  ```bash
  git add apps/web/src/components/cart/CartCheckoutPanel.tsx apps/web/app/checkout/page.tsx apps/web/src/components/cart/README.md
  git commit -m "refactor(web): extract CartCheckoutPanel from the checkout page"
  ```

---

## Task 3: Home page stage layout

**Files:**
- Modify: `apps/web/src/components/visualizer/VisualizerEmbed.tsx`
- Modify: `apps/web/app/page.tsx` (full rewrite)
- Modify: `apps/web/app/globals.css:1072-1096` (replace the "Home workspace" block)
- Delete: `apps/web/src/components/cart/InlineCartSummary.tsx` (orphaned —
  verified via repo-wide grep that `page.tsx` is its only caller; deleted
  by this task's rewrite of that file)

**Interfaces:**
- Consumes: `CartCheckoutPanel` (Task 2), `ProductCatalogGrid` (unchanged,
  `apps/web/src/components/catalog/ProductCatalogGrid.tsx`), `VisualizerEmbed`.
- Produces: `VisualizerEmbed`'s new `fill?: boolean` prop (additive; every
  existing call site keeps using `aspectRatio` and is unaffected); CSS
  classes `.home-stage`, `.home-stage-viz`, `.home-stage-strip`,
  `.home-stage-catalog`, `.home-stage-cart`.

- [ ] **Step 1: Add `fill` mode to `VisualizerEmbed`**

  In `apps/web/src/components/visualizer/VisualizerEmbed.tsx`, find:

  ```tsx
    /**
     * Compact header buttons. Defaults to the value of `embed`. Homepage uses
     * tight 25-ish px controls, the standalone /visualizer page uses the
     * roomier 32+ px controls the visual-integrity suite expects.
     */
    compact?: boolean;
  }
  ```

  Replace with:

  ```tsx
    /**
     * Compact header buttons. Defaults to the value of `embed`. Homepage uses
     * tight 25-ish px controls, the standalone /visualizer page uses the
     * roomier 32+ px controls the visual-integrity suite expects.
     */
    compact?: boolean;
    /**
     * When true, fills the parent's height (flex-1) instead of sizing via
     * `aspectRatio`. Used by the homepage stage, whose visualizer occupies a
     * grid row rather than a fixed-ratio box. Rail/other usage keeps
     * `aspectRatio` and is unaffected.
     */
    fill?: boolean;
  }
  ```

  Find:

  ```tsx
  export function VisualizerEmbed({
    embed = false,
    aspectRatio = "16 / 10",
    className,
    showHeader = true,
    title = "Hello Room Scene",
    compact,
  }: VisualizerEmbedProps) {
  ```

  Replace with:

  ```tsx
  export function VisualizerEmbed({
    embed = false,
    aspectRatio = "16 / 10",
    className,
    showHeader = true,
    title = "Hello Room Scene",
    compact,
    fill = false,
  }: VisualizerEmbedProps) {
  ```

  Find:

  ```tsx
      <div
        className={`rounded-lg border overflow-hidden ${className ?? ""}`}
        style={{
          backgroundColor: "var(--card)",
          borderColor: "var(--border)",
        }}
        data-testid="visualizer-embed"
      >
  ```

  Replace with:

  ```tsx
      <div
        className={`rounded-lg border overflow-hidden ${fill ? "flex flex-col flex-1" : ""} ${className ?? ""}`}
        style={{
          backgroundColor: "var(--card)",
          borderColor: "var(--border)",
        }}
        data-testid="visualizer-embed"
      >
  ```

  Find:

  ```tsx
      <div className="relative" style={{ aspectRatio }}>
  ```

  Replace with:

  ```tsx
      <div
        className={`relative ${fill ? "flex-1" : ""}`}
        style={fill ? undefined : { aspectRatio }}
      >
  ```

- [ ] **Step 2: Replace the "Home workspace" CSS block**

  In `apps/web/app/globals.css`, find the block starting at the comment
  `/* Home workspace — catalog + sticky cart bar. ... */` through the end
  of the `@media (min-width: 1024px) { .home-rail-sticky { display: none; } }`
  rule (this is everything currently between the `.sr-only` rule above it
  and the "App shell — persistent visualizer rail" comment below it):

  ```css
  /* ------------------------------------------------------------------ */
  /* Home workspace — catalog + sticky cart bar. The 3D visualizer is no  */
  /* longer embedded per-page: AppShell renders it as a persistent rail   */
  /* across every route (see the shell/viz-panel section below).         */
  /* ------------------------------------------------------------------ */

  .home-workspace {
    min-width: 0;
  }

  /* The sticky cart bar sits above the mobile visualizer pull-tab; on desktop
     the header cart button plus the always-visible rail are enough, so it's
     hidden there. */
  .home-rail-sticky {
    display: block;
  }
  .home-rail-sticky [data-testid="inline-cart-summary"] {
    bottom: var(--viz-tab-h, 0px);
  }

  @media (min-width: 1024px) {
    .home-rail-sticky {
      display: none;
    }
  }
  ```

  Replace with:

  ```css
  /* ------------------------------------------------------------------ */
  /* Home stage — the 3D visualizer is this page's main content, not a   */
  /* side rail (every other route still gets the rail — see the app-shell */
  /* section below). Fixed viewport: no page-level scrolling, ever.       */
  /* ------------------------------------------------------------------ */

  .home-stage {
    flex: 1 1 auto;
    min-height: 0;
    display: grid;
    grid-template-rows: minmax(0, 3fr) minmax(0, 2fr);
    width: 100%;
    overflow: hidden;
  }

  .home-stage-viz {
    display: flex;
    flex-direction: column;
    min-height: 0;
    min-width: 0;
    padding: 1rem 1rem 0.5rem;
  }

  .home-stage-strip {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 380px;
    gap: 1rem;
    min-height: 0;
    padding: 0.5rem 1rem 1rem;
  }

  .home-stage-catalog,
  .home-stage-cart {
    min-height: 0;
    min-width: 0;
    overflow: hidden;
  }
  ```

  Also delete the three utility rules that only `InlineCartSummary.tsx`
  and the old `page.tsx` used (now both gone): find and remove each of
  these from `globals.css` (they sit in the "A few additional utilities"
  block right after the section you just replaced):

  ```css
  .pb-24 {
    padding-bottom: 6rem;
  }
  .inset-x-0 {
    left: 0;
    right: 0;
  }
  .backdrop-blur {
    backdrop-filter: blur(8px);
  }
  ```

  Leave `.shrink-0` in that same block alone — it is used elsewhere.

- [ ] **Step 3: Delete `InlineCartSummary.tsx`**

  ```bash
  git rm apps/web/src/components/cart/InlineCartSummary.tsx
  ```

- [ ] **Step 4: Rewrite the home page**

  Replace the entire contents of `apps/web/app/page.tsx` with:

  ```tsx
  "use client";

  import useSWR from "swr";
  import { expressoApi, ProductsResponse } from "@/lib/api/expresso-api";
  import { ProductCatalogGrid } from "@/components/catalog/ProductCatalogGrid";
  import { CatalogGridSkeleton } from "@/components/system/LoadingSkeleton";
  import { PageErrorState } from "@/components/system/ErrorBanner";
  import { EmptyState } from "@/components/system/EmptyState";
  import { CartCheckoutPanel } from "@/components/cart/CartCheckoutPanel";
  import { VisualizerEmbed } from "@/components/visualizer/VisualizerEmbed";
  import { Sparkles } from "lucide-react";

  async function fetchProducts(): Promise<ProductsResponse> {
    return expressoApi.getProducts();
  }

  export default function HomeWorkspace() {
    const { data, error, isLoading, mutate } = useSWR<ProductsResponse, Error>(
      "products",
      fetchProducts,
      { revalidateOnFocus: false },
    );

    const productCount = data?.items.length ?? 0;

    return (
      <div className="home-stage">
        <section className="home-stage-viz" aria-label="3D order counter">
          <VisualizerEmbed embed fill compact={false} title="Order counter" />
        </section>

        <div className="home-stage-strip">
          <section
            className="home-stage-catalog"
            aria-label="Product catalog"
            data-testid="home-catalog"
          >
            <header className="flex items-center justify-between gap-3 mb-3">
              <div className="min-w-0">
                <h1
                  className="text-lg font-semibold tracking-tight"
                  style={{ color: "var(--foreground)" }}
                >
                  Catalog
                </h1>
                <p
                  className="text-xs"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  Browse, add, and watch the counter react.
                </p>
              </div>
              {productCount > 0 && (
                <span
                  className="hidden sm:inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-medium"
                  style={{
                    backgroundColor: "var(--secondary)",
                    color: "var(--muted-foreground)",
                  }}
                  data-testid="home-product-count"
                >
                  <Sparkles
                    className="h-3 w-3"
                    style={{ color: "var(--primary)" }}
                  />
                  {productCount} products
                </span>
              )}
            </header>

            {isLoading ? (
              <CatalogGridSkeleton count={6} />
            ) : error ? (
              <PageErrorState
                title="Failed to load products"
                message={
                  error.message ||
                  "Could not connect to the BFF. Try enabling Demo Mode or make sure it is running on port 3001."
                }
                onRetry={() => mutate()}
              />
            ) : !data || data.items.length === 0 ? (
              <EmptyState
                variant="products"
                action={{ label: "Refresh", onClick: () => mutate() }}
              />
            ) : (
              <ProductCatalogGrid products={data.items} />
            )}
          </section>

          <aside className="home-stage-cart" aria-label="Cart and checkout">
            <CartCheckoutPanel variant="sidebar" />
          </aside>
        </div>
      </div>
    );
  }
  ```

- [ ] **Step 5: Typecheck and lint**

  Run: `pnpm --filter @mini-commerce/web typecheck && pnpm --filter @mini-commerce/web lint`
  Expected: both PASS. (Typecheck will catch it immediately if any other
  file still imports the now-deleted `InlineCartSummary`.)

- [ ] **Step 6: Manual browser verification**

  With `./dev up web` running, load `/`:
  - No page-level scrollbar at a normal desktop window size.
  - The 3D visualizer stage is the largest element on the page, full width,
    across the top.
  - Catalog (bottom-left) and cart/checkout (bottom-right, ~380px) are both
    visible without scrolling.
  - Add the product: the sidebar cart panel updates live, no navigation.
  - Click Place Order: redirects to `/orders/:id`.
  - Load `/orders` and `/dev`: confirm the rail layout there is still
    exactly as before (this task did not touch `AppShell`).
  - If the catalog header or cart panel look visually cramped in the
    ~40%-height strip, small padding/font-size tweaks here are expected
    polish, not a new task.

- [ ] **Step 7: Commit**

  ```bash
  git add apps/web/src/components/visualizer/VisualizerEmbed.tsx apps/web/app/page.tsx apps/web/app/globals.css apps/web/src/components/cart/InlineCartSummary.tsx
  git commit -m "feat(web): make the homepage a fixed-viewport stage around the 3D visualizer"
  ```

---

## Task 4: Align the e2e suite with the new homepage

**Files:**
- Modify: `tests/e2e/tests/homepage-workspace.spec.ts`
- Modify: `tests/e2e/tests/visual-integrity.spec.ts`

**Interfaces:**
- Consumes: `data-testid="home-catalog"` (still present, now on
  `.home-stage-catalog`), `data-testid="cart-checkout-panel"` (new, from
  `CartCheckoutPanel`), `data-testid="visualizer-iframe"` /
  `data-testid="visualizer-embed"` (unchanged, still rendered by
  `VisualizerEmbed` in fill mode). `data-testid="viz-panel"` no longer
  exists on `/` (it still exists on every other route, unaffected).

- [ ] **Step 1: Rewrite the homepage/visualizer geometry test**

  In `tests/e2e/tests/homepage-workspace.spec.ts`, find the whole test:

  ```tsx
    test("renders catalog and embedded visualizer side by side", async ({
      page,
    }) => {
      await installHomeMocks(page);
      await page.goto("/");

      await expect(page.getByTestId("home-catalog")).toBeVisible();
      await expect(page.getByTestId("viz-panel")).toBeVisible();

      const iframe = page.getByTestId("visualizer-iframe");
      await expect(iframe).toBeVisible();
      await expect(iframe).toHaveAttribute("src", /\/viz\/index\.html\?embed=1$/);

      const catalogBox = await page.getByTestId("home-catalog").boundingBox();
      const railBox = await page.getByTestId("viz-panel").boundingBox();
      expect(catalogBox).not.toBeNull();
      expect(railBox).not.toBeNull();
      expect(
        railBox!.x,
        "visualizer rail should sit to the right of the catalog on desktop",
      ).toBeGreaterThan(catalogBox!.x + 200);

      await expectIframeCanvasPainted(page, iframe);

      await page.screenshot({
        path: "test-results/home-desktop-1440x900.png",
        fullPage: false,
      });
    });
  ```

  Replace with:

  ```tsx
    test("renders catalog, cart/checkout, and the visualizer stage together", async ({
      page,
    }) => {
      await installHomeMocks(page);
      await page.goto("/");

      await expect(page.getByTestId("home-catalog")).toBeVisible();

      const iframe = page.getByTestId("visualizer-iframe");
      await expect(iframe).toBeVisible();
      await expect(iframe).toHaveAttribute("src", /\/viz\/index\.html\?embed=1$/);

      const catalogBox = await page.getByTestId("home-catalog").boundingBox();
      const vizBox = await page.getByTestId("visualizer-embed").boundingBox();
      expect(catalogBox).not.toBeNull();
      expect(vizBox).not.toBeNull();
      expect(
        vizBox!.y,
        "visualizer stage should sit above the catalog, not beside it",
      ).toBeLessThan(catalogBox!.y);
      expect(
        vizBox!.width,
        "visualizer stage should be the widest element on the page",
      ).toBeGreaterThan(catalogBox!.width);

      await expect(page.getByTestId("cart-checkout-panel")).toBeVisible();

      await expectIframeCanvasPainted(page, iframe);

      const { scrollHeight, clientHeight } = await page.evaluate(() => ({
        scrollHeight: document.documentElement.scrollHeight,
        clientHeight: document.documentElement.clientHeight,
      }));
      expect(
        scrollHeight,
        "homepage must not require page scrolling at this viewport",
      ).toBeLessThanOrEqual(clientHeight + 1);

      await page.screenshot({
        path: "test-results/home-desktop-1440x900.png",
        fullPage: false,
      });
    });
  ```

- [ ] **Step 2: Delete the tablet and mobile describe blocks**

  These asserted the rail's responsive collapse (pull-tab, bottom drawer,
  sticky mobile cart bar), none of which exists on `/` anymore — the stage
  layout is desktop-only by design (see spec Non-goals). Delete both
  blocks entirely:

  ```tsx
  test.describe("homepage workspace - tablet", () => {
    test.use({ viewport: { width: 1024, height: 768 } });

    test("layout stays inside the viewport with the rail above the catalog", async ({
      page,
    }) => {
      await installHomeMocks(page);
      await page.goto("/");

      const iframe = page.getByTestId("visualizer-iframe");
      await expect(iframe).toBeVisible();

      await page.screenshot({
        path: "test-results/home-tablet-1024x768.png",
        fullPage: false,
      });
    });
  });

  test.describe("homepage workspace - mobile", () => {
    test.use({
      hasTouch: true,
      isMobile: true,
      viewport: { width: 390, height: 844 },
    });

    test("shows visualizer, sticky cart appears after add, checkout link works", async ({
      page,
    }) => {
      await installHomeMocks(page);
      await page.goto("/");

      const iframe = page.getByTestId("visualizer-iframe");
      await expect(iframe).toBeVisible();
      const iframeBox = await iframe.boundingBox();
      expect(iframeBox).not.toBeNull();
      expect(
        iframeBox!.width,
        "mobile iframe should fill almost the whole width",
      ).toBeGreaterThan(300);

      // Sticky bar should not render while the cart is empty.
      await expect(
        page.locator('.home-rail-sticky [data-testid="inline-cart-summary"]'),
      ).toHaveCount(0);

      await page
        .getByRole("button", { name: `Add ${productUnderTest.name} to cart` })
        .first()
        .click();

      const sticky = page.locator(
        '.home-rail-sticky [data-testid="inline-cart-summary"]',
      );
      await expect(sticky).toBeVisible();
      await expect(sticky.getByTestId("inline-cart-count")).toHaveText("1");

      await page.screenshot({
        path: "test-results/home-mobile-390x844.png",
        fullPage: false,
      });

      await sticky.getByTestId("inline-cart-checkout").click();
      await expect(page).toHaveURL(/\/checkout$/);
    });
  });
  ```

  Delete them with no replacement — there is no home-specific mobile/tablet
  behavior left to assert. (The rail's own responsive collapse on *other*
  routes is unchanged and untested here either before or after this plan;
  it was never covered by a home-page spec.)

- [ ] **Step 3: Fix the two `visual-integrity.spec.ts` assertions on `/`**

  Find:

  ```tsx
      await expect(page.getByTestId("viz-panel")).toBeVisible();

      await clickVisualCenter(
  ```

  Replace with:

  ```tsx
      await expect(page.getByTestId("visualizer-embed")).toBeVisible();

      await clickVisualCenter(
  ```

  Find:

  ```tsx
      const drawerBox = await drawer.boundingBox();
      const vizBox = await page.getByTestId("viz-panel").boundingBox();
      expect(drawerBox).not.toBeNull();
      expect(vizBox).not.toBeNull();
      expect(
        drawerBox!.y,
        "drawer must sit below the sticky header",
      ).toBeGreaterThan(40);
      expect(
        drawerBox!.x + drawerBox!.width,
        "drawer must not overlap the persistent visualizer rail",
      ).toBeLessThanOrEqual(vizBox!.x + 1);
  ```

  Replace with:

  ```tsx
      const drawerBox = await drawer.boundingBox();
      expect(drawerBox).not.toBeNull();
      expect(
        drawerBox!.y,
        "drawer must sit below the sticky header",
      ).toBeGreaterThan(40);
  ```

  (There is no rail on `/` anymore for the drawer to avoid overlapping —
  the "must not overlap" assertion has nothing left to check.)

  Find the test title referencing "rail" for accuracy:

  ```tsx
    test("renders the persistent visualizer rail with a mocked iframe document", async ({
  ```

  Replace with:

  ```tsx
    test("renders the visualizer stage with a mocked iframe document", async ({
  ```

- [ ] **Step 4: Typecheck and lint the e2e package**

  Run: `pnpm --filter @mini-commerce/e2e typecheck && pnpm --filter @mini-commerce/e2e lint`
  Expected: both PASS.

- [ ] **Step 5: Run the full e2e suite**

  Run: `pnpm --filter @mini-commerce/e2e test:e2e`
  Expected: all tests PASS, including every test touched in Tasks 1-3's
  "known-red" notes.

- [ ] **Step 6: Commit**

  ```bash
  git add tests/e2e/tests/homepage-workspace.spec.ts tests/e2e/tests/visual-integrity.spec.ts
  git commit -m "test(e2e): align homepage specs with the visualizer-stage layout"
  ```

---

## Definition of Done

- `/` renders catalog, live cart/checkout, and the 3D visualizer
  simultaneously in one viewport at a normal desktop browser size, with no
  page-level scrollbar.
- The visualizer on `/` is the largest single element on the page and is
  never hidden or collapsed behind a toggle/drawer.
- Adding a product and placing an order both complete without leaving `/`
  (except the existing, intentional post-checkout redirect to the order
  page).
- `/orders`, `/checkout` (direct visit), `/cart`, `/dev`, `/performance`
  are visually unchanged — still the sticky rail layout.
- `pnpm --filter @mini-commerce/web typecheck`, `pnpm --filter
  @mini-commerce/web lint`, and the full `pnpm --filter @mini-commerce/e2e
  test:e2e` suite are all green.
