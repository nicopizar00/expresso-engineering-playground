# Single-Page App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse the app to one route (`/`). Orders, Performance, and API
Debug become in-page sections switched from the header nav; the 3D
visualizer stays mounted and pinned across all of them; `/cart` and
`/checkout` are deleted as redundant.

**Architecture:** A new `SectionProvider` (one `useSearchParams()` call
site, wrapped in one `<Suspense>` at the root layout) is the single source
of truth for which section is active, read via a `useSection()` hook by
both `AppShell` (nav highlighting + switching) and `page.tsx` (which
section's content to render in the strip). Orders/Performance/API Debug
move from their own `page.tsx` files into plain components under
`apps/web/src/components/sections/`, logic unchanged except where a route
dependency (a URL param, a `router.push`) becomes a prop or callback.

**Tech Stack:** Next.js 14.2 App Router (client components throughout —
this app has no static/server-rendered pages), React state + URL search
params for section switching, `next/navigation`'s `useSearchParams` /
`useRouter`.

**Spec:** [docs/superpowers/specs/2026-09-11-single-page-app-design.md](../specs/2026-09-11-single-page-app-design.md)

## Global Constraints

- Exactly one route survives: `/`. `/cart`, `/checkout`, `/orders`,
  `/orders/[orderId]`, `/dev`, `/performance` are all deleted.
- Every section's existing functionality carries over unchanged — same
  API calls, same copy, same error/loading states. This is a relocation,
  not a rewrite.
- The 3D visualizer instance in `page.tsx` must never remount when
  switching sections — no section switch may cause `AppShell` or
  `page.tsx`'s `VisualizerEmbed` to unmount.
- Non-catalog sections (Orders, Performance, API Debug) get the strip's
  full width (no cart column) and scroll normally (`overflow-y: auto`).
  The Catalog section's zero-scroll behavior is unchanged. The visualizer
  stage itself never scrolls, regardless of section.
- Next.js 14.2 requires any component calling `useSearchParams()` to sit
  under a `<Suspense>` boundary or `next build` fails. There must be
  exactly one `useSearchParams()` call site (inside `SectionProvider`) and
  exactly one `<Suspense>` boundary (in `app/layout.tsx`, wrapping
  everything that needs section state) — not one per consumer.
- `pnpm typecheck` and `pnpm lint` must be green after every task.

---

## Task 1: `SectionProvider` + `AppShell` becomes a section switcher

**Files:**
- Create: `apps/web/src/components/system/SectionProvider.tsx`
- Modify: `apps/web/app/layout.tsx`
- Modify: `apps/web/src/components/system/AppShell.tsx`

**Interfaces:**
- Produces: `SectionId = "catalog" | "orders" | "performance" | "dev"`,
  `SectionProvider` (wraps children, no props), `useSection(): { section:
  SectionId; setSection: (id: SectionId) => void }` — both exported from
  `apps/web/src/components/system/SectionProvider.tsx`. Task 4's
  `page.tsx` consumes this hook directly; do not change its name or
  return shape without updating this plan.
- Consumes: `next/navigation`'s `useSearchParams`, `useRouter`.

- [ ] **Step 1: Create `SectionProvider`**

  Create `apps/web/src/components/system/SectionProvider.tsx`:

  ```tsx
  "use client";

  /**
   * SectionProvider - single source of truth for which app section is showing
   *
   * The whole app is one route (`/`); "navigation" between Catalog, Orders,
   * Performance, and API Debug is a client-side section switch, not a page
   * load. The active section lives in the `?tab=` query param so refresh,
   * back/forward, and copy-pasting the URL all still work.
   */

  import {
    createContext,
    useCallback,
    useContext,
    useMemo,
    ReactNode,
  } from "react";
  import { useRouter, useSearchParams } from "next/navigation";

  export type SectionId = "catalog" | "orders" | "performance" | "dev";

  const SECTION_IDS: readonly SectionId[] = [
    "catalog",
    "orders",
    "performance",
    "dev",
  ];

  interface SectionContextValue {
    section: SectionId;
    setSection: (id: SectionId) => void;
  }

  const SectionContext = createContext<SectionContextValue | null>(null);

  function isSectionId(value: string | null): value is SectionId {
    return value !== null && (SECTION_IDS as readonly string[]).includes(value);
  }

  export function SectionProvider({ children }: { children: ReactNode }) {
    const router = useRouter();
    const searchParams = useSearchParams();

    const tabParam = searchParams.get("tab");
    const section: SectionId = isSectionId(tabParam) ? tabParam : "catalog";

    const setSection = useCallback(
      (id: SectionId) => {
        router.push(`/?tab=${id}`);
      },
      [router],
    );

    const value = useMemo(
      () => ({ section, setSection }),
      [section, setSection],
    );

    return (
      <SectionContext.Provider value={value}>
        {children}
      </SectionContext.Provider>
    );
  }

  export function useSection(): SectionContextValue {
    const ctx = useContext(SectionContext);
    if (!ctx) {
      throw new Error("useSection must be used within a SectionProvider");
    }
    return ctx;
  }
  ```

- [ ] **Step 2: Wrap the app in `SectionProvider` + one `Suspense`**

  In `apps/web/app/layout.tsx`, find:

  ```tsx
  import type { Metadata, Viewport } from 'next';
  import './globals.css';
  import { AppShell } from '@/components/system/AppShell';
  import { CartProvider } from '@/components/cart/CartProvider';
  ```

  Replace with:

  ```tsx
  import type { Metadata, Viewport } from 'next';
  import { Suspense } from 'react';
  import './globals.css';
  import { AppShell } from '@/components/system/AppShell';
  import { CartProvider } from '@/components/cart/CartProvider';
  import { SectionProvider } from '@/components/system/SectionProvider';
  ```

  Find:

  ```tsx
      <body>
        <CartProvider>
          <AppShell>{children}</AppShell>
        </CartProvider>
      </body>
  ```

  Replace with:

  ```tsx
      <body>
        <CartProvider>
          <Suspense fallback={null}>
            <SectionProvider>
              <AppShell>{children}</AppShell>
            </SectionProvider>
          </Suspense>
        </CartProvider>
      </body>
  ```

- [ ] **Step 3: `AppShell` becomes a permanent single-page shell**

  In `apps/web/src/components/system/AppShell.tsx`:

  Find the imports and `navLinks`:

  ```tsx
  import { ReactNode, useState, useEffect } from "react";

  import Link from "next/link";
  import { usePathname } from "next/navigation";
  import {
    Coffee,
    ShoppingCart,
    Package,
    Activity,
    Menu,
    X,
    ExternalLink,
    FlaskConical,
    Gauge,
    Database,
  } from "lucide-react";
  import type { LucideIcon } from "lucide-react";
  import { useCart } from "@/components/cart/CartProvider";
  import { HealthBadge } from "./HealthBadge";
  import { CartDrawer } from "@/components/cart/CartDrawer";
  import { VisualizerPanel } from "@/components/visualizer/VisualizerPanel";
  import { getDemoModeStatus, setDemoMode } from "@/lib/api/expresso-api";

  type NavLink = {
    href: string;
    label: string;
    icon: LucideIcon;
    // When true, render as <a target="_blank"> instead of next/link. Used for
    // links that point outside the web app (e.g. the Prisma Studio admin GUI).
    external?: boolean;
  };

  // The Prisma Studio admin link is only rendered when NEXT_PUBLIC_PRISMA_STUDIO_URL
  // is set. Studio writes directly to Postgres — it bypasses DomainEventsModule,
  // so the SSE visualizer won't react to edits made there until a reload.
  const PRISMA_STUDIO_URL = process.env.NEXT_PUBLIC_PRISMA_STUDIO_URL;

  const navLinks: NavLink[] = [
    { href: "/", label: "Catalog", icon: Coffee },
    { href: "/orders", label: "Orders", icon: Package },
    { href: "/performance", label: "Performance", icon: Gauge },
    { href: "/dev", label: "API", icon: Activity },
    ...(PRISMA_STUDIO_URL
      ? [
          {
            href: PRISMA_STUDIO_URL,
            label: "Admin",
            icon: Database,
            external: true,
          } as NavLink,
        ]
      : []),
  ];
  ```

  Replace with:

  ```tsx
  import { ReactNode, useState, useEffect } from "react";

  import {
    Coffee,
    ShoppingCart,
    Package,
    Activity,
    Menu,
    X,
    ExternalLink,
    FlaskConical,
    Gauge,
    Database,
  } from "lucide-react";
  import type { LucideIcon } from "lucide-react";
  import { useCart } from "@/components/cart/CartProvider";
  import { HealthBadge } from "./HealthBadge";
  import { CartDrawer } from "@/components/cart/CartDrawer";
  import { getDemoModeStatus, setDemoMode } from "@/lib/api/expresso-api";
  import { useSection, type SectionId } from "./SectionProvider";

  type NavLink =
    | { section: SectionId; label: string; icon: LucideIcon }
    | { href: string; label: string; icon: LucideIcon; external: true };

  // The Prisma Studio admin link is only rendered when NEXT_PUBLIC_PRISMA_STUDIO_URL
  // is set. Studio writes directly to Postgres — it bypasses DomainEventsModule,
  // so the SSE visualizer won't react to edits made there until a reload. It is
  // the one nav entry that stays a real external link — it points outside this
  // single-page app entirely.
  const PRISMA_STUDIO_URL = process.env.NEXT_PUBLIC_PRISMA_STUDIO_URL;

  const navLinks: NavLink[] = [
    { section: "catalog", label: "Catalog", icon: Coffee },
    { section: "orders", label: "Orders", icon: Package },
    { section: "performance", label: "Performance", icon: Gauge },
    { section: "dev", label: "API", icon: Activity },
    ...(PRISMA_STUDIO_URL
      ? [
          {
            href: PRISMA_STUDIO_URL,
            label: "Admin",
            icon: Database,
            external: true,
          } as NavLink,
        ]
      : []),
  ];
  ```

  Find:

  ```tsx
  export function AppShell({ children }: { children: ReactNode }) {
    const pathname = usePathname();
    const isHome = pathname === "/";
    const { itemCount, isCartDrawerOpen, openCartDrawer, closeCartDrawer } =
      useCart();
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [isDemoMode, setIsDemoMode] = useState(false);
  ```

  Replace with:

  ```tsx
  export function AppShell({ children }: { children: ReactNode }) {
    const { section, setSection } = useSection();
    const { itemCount, isCartDrawerOpen, openCartDrawer, closeCartDrawer } =
      useCart();
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [isDemoMode, setIsDemoMode] = useState(false);
  ```

  Find:

  ```tsx
    return (
      <div
        className={`min-h-screen flex flex-col${isHome ? " home-shell-root" : ""}`}
      >
  ```

  Replace with:

  ```tsx
    return (
      <div className="min-h-screen flex flex-col home-shell-root">
  ```

  Find the logo link:

  ```tsx
              <Link
                href="/"
                className="flex items-center gap-2 font-semibold text-lg transition-opacity hover:opacity-80"
                style={{ color: "var(--foreground)" }}
              >
                <Coffee className="h-5 w-5" style={{ color: "var(--primary)" }} />
                <span>Expresso</span>
                <span
                  className="hidden sm:inline text-xs font-normal px-2 py-0.5 rounded-full ml-1"
                  style={{
                    backgroundColor: "var(--secondary)",
                    color: "var(--muted-foreground)",
                  }}
                >
                  Playground
                </span>
              </Link>
  ```

  Replace with:

  ```tsx
              <button
                type="button"
                onClick={() => setSection("catalog")}
                className="flex items-center gap-2 font-semibold text-lg transition-opacity hover:opacity-80"
                style={{ color: "var(--foreground)" }}
              >
                <Coffee className="h-5 w-5" style={{ color: "var(--primary)" }} />
                <span>Expresso</span>
                <span
                  className="hidden sm:inline text-xs font-normal px-2 py-0.5 rounded-full ml-1"
                  style={{
                    backgroundColor: "var(--secondary)",
                    color: "var(--muted-foreground)",
                  }}
                >
                  Playground
                </span>
              </button>
  ```

  Find the desktop nav's `navLinks.map` (inside `<nav className="hidden md:flex ...">`):

  ```tsx
              {navLinks.map((link) => {
                const Icon = link.icon;
                if (link.external) {
                  // External links (e.g. Prisma Studio) open in a new tab and
                  // never participate in the active-route highlight.
                  return (
                    <a
                      key={link.href}
                      href={link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors"
                      style={{
                        backgroundColor: "transparent",
                        color: "var(--muted-foreground)",
                      }}
                      title="Direct DB · bypasses domain events"
                    >
                      <Icon className="h-4 w-4" />
                      {link.label}
                      <ExternalLink className="h-3 w-3 opacity-60" />
                    </a>
                  );
                }
                const isActive =
                  pathname === link.href ||
                  (link.href !== "/" && pathname.startsWith(link.href));
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors"
                    style={{
                      backgroundColor: isActive
                        ? "var(--secondary)"
                        : "transparent",
                      color: isActive
                        ? "var(--foreground)"
                        : "var(--muted-foreground)",
                    }}
                    aria-current={isActive ? "page" : undefined}
                  >
                    <Icon className="h-4 w-4" />
                    {link.label}
                  </Link>
                );
              })}
  ```

  Replace with:

  ```tsx
              {navLinks.map((link) => {
                const Icon = link.icon;
                if ("external" in link) {
                  // External links (e.g. Prisma Studio) open in a new tab and
                  // never participate in the active-section highlight.
                  return (
                    <a
                      key={link.href}
                      href={link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors"
                      style={{
                        backgroundColor: "transparent",
                        color: "var(--muted-foreground)",
                      }}
                      title="Direct DB · bypasses domain events"
                    >
                      <Icon className="h-4 w-4" />
                      {link.label}
                      <ExternalLink className="h-3 w-3 opacity-60" />
                    </a>
                  );
                }
                const isActive = section === link.section;
                return (
                  <button
                    key={link.section}
                    type="button"
                    onClick={() => setSection(link.section)}
                    className="flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors"
                    style={{
                      backgroundColor: isActive
                        ? "var(--secondary)"
                        : "transparent",
                      color: isActive
                        ? "var(--foreground)"
                        : "var(--muted-foreground)",
                    }}
                    aria-current={isActive ? "page" : undefined}
                  >
                    <Icon className="h-4 w-4" />
                    {link.label}
                  </button>
                );
              })}
  ```

  Find the mobile nav's `navLinks.map` (inside `<nav className="md:hidden ...">`) — same shape, same transformation:

  ```tsx
                {navLinks.map((link) => {
                  const Icon = link.icon;
                  if (link.external) {
                    return (
                      <a
                        key={link.href}
                        href={link.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => setMobileMenuOpen(false)}
                        className="flex items-center gap-3 px-3 py-2.5 min-h-10 rounded-md text-sm font-medium transition-colors"
                        style={{
                          backgroundColor: "transparent",
                          color: "var(--muted-foreground)",
                        }}
                      >
                        <Icon className="h-4 w-4" />
                        <span className="flex-1">{link.label}</span>
                        <ExternalLink className="h-3.5 w-3.5 opacity-60" />
                      </a>
                    );
                  }
                  const isActive =
                    pathname === link.href ||
                    (link.href !== "/" && pathname.startsWith(link.href));
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      onClick={() => setMobileMenuOpen(false)}
                      className="flex items-center gap-3 px-3 py-2.5 min-h-10 rounded-md text-sm font-medium transition-colors"
                      style={{
                        backgroundColor: isActive
                          ? "var(--secondary)"
                          : "transparent",
                        color: isActive
                          ? "var(--foreground)"
                          : "var(--muted-foreground)",
                      }}
                      aria-current={isActive ? "page" : undefined}
                    >
                      <Icon className="h-4 w-4" />
                      {link.label}
                    </Link>
                  );
                })}
  ```

  Replace with:

  ```tsx
                {navLinks.map((link) => {
                  const Icon = link.icon;
                  if ("external" in link) {
                    return (
                      <a
                        key={link.href}
                        href={link.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => setMobileMenuOpen(false)}
                        className="flex items-center gap-3 px-3 py-2.5 min-h-10 rounded-md text-sm font-medium transition-colors"
                        style={{
                          backgroundColor: "transparent",
                          color: "var(--muted-foreground)",
                        }}
                      >
                        <Icon className="h-4 w-4" />
                        <span className="flex-1">{link.label}</span>
                        <ExternalLink className="h-3.5 w-3.5 opacity-60" />
                      </a>
                    );
                  }
                  const isActive = section === link.section;
                  return (
                    <button
                      key={link.section}
                      type="button"
                      onClick={() => {
                        setSection(link.section);
                        setMobileMenuOpen(false);
                      }}
                      className="flex items-center gap-3 px-3 py-2.5 min-h-10 rounded-md text-sm font-medium transition-colors"
                      style={{
                        backgroundColor: isActive
                          ? "var(--secondary)"
                          : "transparent",
                        color: isActive
                          ? "var(--foreground)"
                          : "var(--muted-foreground)",
                      }}
                      aria-current={isActive ? "page" : undefined}
                    >
                      <Icon className="h-4 w-4" />
                      {link.label}
                    </button>
                  );
                })}
  ```

  Find the body/footer section:

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

        {/* Footer — hidden on home; the stage layout has no room for it and
            no page scroll to reach it anyway. */}
        {!isHome && (
          <footer
            className="border-t py-6"
            style={{
              backgroundColor: "var(--card)",
              borderColor: "var(--border)",
            }}
          >
            <div className="container">
              <div
                className="flex flex-col sm:flex-row items-center justify-between gap-4 text-sm"
                style={{ color: "var(--muted-foreground)" }}
              >
                <p>
                  Engineering Playground
                  <span className="mx-2">·</span>
                  <span style={{ color: "var(--foreground)" }}>
                    Mini Commerce
                  </span>
                </p>
                <div className="flex items-center gap-4">
                  <a
                    href="https://github.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 transition-colors hover:opacity-80"
                    style={{ color: "var(--muted-foreground)" }}
                  >
                    <ExternalLink className="h-4 w-4" />
                    <span>Source</span>
                  </a>
                  <Link
                    href="/dev"
                    className="transition-colors hover:opacity-80"
                    style={{ color: "var(--muted-foreground)" }}
                  >
                    API Debug
                  </Link>
                </div>
              </div>
            </div>
          </footer>
        )}
  ```

  Replace with:

  ```tsx
        {/* Body: the page owns a full-bleed visualizer stage (see
            apps/web/app/page.tsx) pinned above whichever section is active.
            There is no other route and no footer — the stage layout has no
            room for one and no page scroll to reach it anyway. */}
        <main className="shell-content-full">{children}</main>
  ```

- [ ] **Step 4: Typecheck and lint**

  Run: `pnpm --filter @mini-commerce/web typecheck && pnpm --filter @mini-commerce/web lint`
  Expected: both PASS. `VisualizerPanel` is now unused in this file (its
  import was removed in Step 3) — do not remove the `VisualizerPanel.tsx`
  file itself yet, that happens in Task 5 alongside its CSS.

- [ ] **Step 5: Manual browser verification**

  Run `./dev up full` (needs the visualizer container too), then in the
  browser: confirm the header nav still highlights "Catalog" as active by
  default, clicking "Orders"/"Performance"/"API" updates the URL to
  `/?tab=orders` etc. without a full page reload (check the Network tab —
  no document navigation, only the client-side re-render), and the section
  content shown is still whatever `page.tsx` renders today for that
  `?tab=` value (it won't actually render section-specific content yet —
  that's Task 4 — confirm only that clicking nav updates the URL/active
  state and doesn't break the existing catalog view).

- [ ] **Step 6: Commit**

  ```bash
  git add apps/web/src/components/system/SectionProvider.tsx apps/web/app/layout.tsx apps/web/src/components/system/AppShell.tsx
  git commit -m "feat(web): make AppShell a section switcher instead of a route nav"
  ```

---

## Task 2: Extract Orders, Performance, and API Debug into section components

**Files:**
- Create: `apps/web/src/components/sections/OrdersSection.tsx`
- Create: `apps/web/src/components/sections/PerformanceSection.tsx`
- Create: `apps/web/src/components/sections/DevSection.tsx`
- Read only (do not modify — Task 6 deletes these): `apps/web/app/orders/page.tsx`,
  `apps/web/app/orders/[orderId]/page.tsx`, `apps/web/app/performance/page.tsx`,
  `apps/web/app/dev/page.tsx`

**Interfaces:**
- Produces: `OrdersSection({ initialOrderId }: { initialOrderId?: string | null }): JSX.Element`
  (see Step 3's code — `initialOrderId` is required for Task 4's "place an
  order → land on its detail view" flow, do not drop it), `PerformanceSection(): JSX.Element`
  (no props), `DevSection({ onOpenOrders }: { onOpenOrders: () => void }): JSX.Element`.
  Task 4's `page.tsx` imports and renders all three.

- [ ] **Step 1: `PerformanceSection` — near-verbatim move**

  Read `apps/web/app/performance/page.tsx` in full. Create
  `apps/web/src/components/sections/PerformanceSection.tsx` with the exact
  same content, with exactly these two changes:
  1. `export default function PerformancePage()` becomes
     `export function PerformanceSection()` (named export, no default).
  2. The outermost returned `<div className="container py-8">` becomes
     `<div className="home-stage-section-inner">` (the `container` class's
     1200px-cap + centered-column behavior doesn't fit a strip panel; the
     new class is added in Task 5's CSS pass — until then this class has no
     rule and the div is unstyled, which is fine, it's not rendered
     anywhere until Task 4).

  Every other line — `LoadingState`, `ErrorState`, the KPI strip, the
  service cards, the scenario selector, all imports — is unchanged. This
  file has zero route dependencies today (no params, no `router` calls),
  so nothing else needs to change.

- [ ] **Step 2: `DevSection` — near-verbatim move, one link becomes a callback**

  Read `apps/web/app/dev/page.tsx` in full. Create
  `apps/web/src/components/sections/DevSection.tsx` with the same content,
  with these changes:
  1. `export default function DevPage()` becomes
     `export function DevSection({ onOpenOrders }: { onOpenOrders: () => void })`.
  2. The outermost returned wrapper div gets the same `container py-8` →
     `home-stage-section-inner` swap as Step 1.
  3. Inside `DemoGuidePanel`, find the sample-order link:
     ```tsx
     <a href={`/orders/${sampleOrderId}`} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium" style={{ backgroundColor: 'var(--secondary)', color: 'var(--foreground)' }}>
       <Package className="h-3 w-3" /> Sample Order
     </a>
     ```
     Replace with:
     ```tsx
     <button type="button" onClick={onOpenOrders} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium" style={{ backgroundColor: 'var(--secondary)', color: 'var(--foreground)' }}>
       <Package className="h-3 w-3" /> Sample Order
     </button>
     ```
     `DemoGuidePanel` needs `onOpenOrders` threaded to it as a prop from
     `DevSection` (it's currently called with no props inside `DevPage`'s
     JSX — find that call site and pass `onOpenOrders={onOpenOrders}`
     through, and add the prop to `DemoGuidePanel`'s own signature).
     `sampleOrderId` itself (from `getSampleOrderId()`) is unrelated to this
     change and stays exactly as-is.

  Every other card (`HealthCard`, `CatalogCard`, `AddToCartCard`,
  `ViewCartCard`, `CartMutateCard`, `CheckoutCard`, `OrderLookupCard`,
  `OrderManageCard`, `ReadinessPanel`, `PerformanceInfoPanel`) has zero
  route dependencies and moves unchanged.

- [ ] **Step 3: `OrdersSection` — merges the list and detail pages**

  Read both `apps/web/app/orders/page.tsx` and
  `apps/web/app/orders/[orderId]/page.tsx` in full. Create
  `apps/web/src/components/sections/OrdersSection.tsx`:

  ```tsx
  'use client';

  /**
   * OrdersSection - list all persisted orders, look up by ID, view/manage one
   *
   * Merges the former /orders (list + lookup) and /orders/[orderId] (detail +
   * management) routes into one component with internal selection state —
   * there is no longer a route to carry the selected order id, so it lives
   * here instead.
   */

  import { useState } from 'react';
  import useSWR from 'swr';
  import {
    Search,
    Package,
    ArrowLeft,
    ArrowRight,
    AlertTriangle,
    Clock,
    CheckCircle,
    XCircle,
    Database,
    ChefHat,
    RefreshCw,
    Loader2,
  } from 'lucide-react';
  import {
    expressoApi,
    Order,
    OrderStatus,
    OrdersResponse,
    ManageOrderInput,
    ExpressoApiError,
    formatMoney,
  } from '@/lib/api/expresso-api';
  import { PageLoadingState } from '@/components/system/LoadingSkeleton';
  import { PageErrorState } from '@/components/system/ErrorBanner';

  // Status badge config — combines the list page's and detail page's
  // near-identical copies of this into one.
  const statusConfig: Record<OrderStatus, { label: string; color: string; bgColor: string; icon: typeof Package }> = {
    pending: { label: 'Pending', color: 'var(--warning)', bgColor: 'rgba(245, 158, 11, 0.1)', icon: Clock },
    preparing: { label: 'Preparing', color: 'var(--info)', bgColor: 'rgba(59, 130, 246, 0.1)', icon: ChefHat },
    prepared: { label: 'Prepared', color: 'var(--success)', bgColor: 'rgba(34, 197, 94, 0.1)', icon: CheckCircle },
    cancelled: { label: 'Cancelled', color: 'var(--destructive)', bgColor: 'rgba(239, 68, 68, 0.1)', icon: XCircle },
  };

  function OrderStatusBadge({ status }: { status: OrderStatus }) {
    const cfg = statusConfig[status] ?? statusConfig.pending;
    const Icon = cfg.icon;
    return (
      <span
        className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium"
        style={{ backgroundColor: cfg.bgColor, color: cfg.color }}
      >
        <Icon className="h-3 w-3" />
        {cfg.label}
      </span>
    );
  }

  interface OrdersListProps {
    onSelect: (orderId: string) => void;
  }

  function OrderRow({ order, onSelect }: { order: Order; onSelect: (orderId: string) => void }) {
    return (
      <button
        type="button"
        onClick={() => onSelect(order.orderId)}
        className="w-full flex items-center justify-between p-4 transition-colors hover:opacity-90 text-left"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <p className="font-mono text-sm font-medium" style={{ color: 'var(--foreground)' }}>
              {order.orderId}
            </p>
            <OrderStatusBadge status={order.status} />
          </div>
          <p className="text-xs truncate" style={{ color: 'var(--muted-foreground)' }}>
            {new Date(order.placedAt).toLocaleString()}
          </p>
        </div>
        <div className="flex items-center gap-4 ml-4 shrink-0">
          <span className="text-sm font-semibold font-mono" style={{ color: 'var(--foreground)' }}>
            {formatMoney(order.total.amountMinor, order.total.currency)}
          </span>
          <ArrowRight className="h-4 w-4" style={{ color: 'var(--muted-foreground)' }} />
        </div>
      </button>
    );
  }

  function OrdersList({ onSelect }: OrdersListProps) {
    const { data, error, isLoading } = useSWR<OrdersResponse, Error>(
      'orders',
      () => expressoApi.getOrders(),
      { revalidateOnFocus: false, shouldRetryOnError: false },
    );

    if (isLoading) return <PageLoadingState message="Loading orders..." />;

    if (error) {
      return (
        <div className="flex items-start gap-3 p-4 rounded-lg" style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)' }} role="alert">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" style={{ color: 'var(--destructive)' }} />
          <div>
            <p className="text-sm font-medium" style={{ color: 'var(--destructive)' }}>Could not load orders</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>{error.message}</p>
          </div>
        </div>
      );
    }

    const orders = data?.items ?? [];

    if (orders.length === 0) {
      return (
        <div className="text-center py-12">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: 'var(--secondary)' }}>
            <Package className="h-6 w-6" style={{ color: 'var(--muted-foreground)' }} />
          </div>
          <p className="text-sm font-medium mb-1" style={{ color: 'var(--foreground)' }}>No orders yet</p>
          <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>Orders will appear here after checkout</p>
        </div>
      );
    }

    return (
      <div>
        {orders.map((order) => (
          <OrderRow key={order.orderId} order={order} onSelect={onSelect} />
        ))}
      </div>
    );
  }

  function OrdersListView({ onSelect }: { onSelect: (orderId: string) => void }) {
    const [orderId, setOrderId] = useState('');
    const [error, setError] = useState<string | null>(null);

    function handleSubmit(e: React.FormEvent) {
      e.preventDefault();
      if (!orderId.trim()) {
        setError('Please enter an order ID');
        return;
      }
      setError(null);
      onSelect(orderId.trim());
    }

    return (
      <div className="home-stage-section-inner max-w-3xl">
        <div className="flex items-center gap-3 mb-8">
          <div className="flex items-center justify-center w-10 h-10 rounded-lg" style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)' }}>
            <Package className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight" style={{ color: 'var(--foreground)' }}>Orders</h1>
            <div className="flex items-center gap-2 mt-0.5">
              <Database className="h-3 w-3" style={{ color: 'var(--success)' }} />
              <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>Persisted to PostgreSQL</p>
            </div>
          </div>
        </div>

        <div className="grid gap-6">
          <div className="rounded-xl border overflow-hidden" style={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)' }}>
            <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: 'var(--border)' }}>
              <span className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>All Orders</span>
            </div>
            <OrdersList onSelect={onSelect} />
          </div>

          <form onSubmit={handleSubmit} className="rounded-xl border overflow-hidden" style={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)' }}>
            <div className="px-4 py-3 border-b flex items-center gap-2" style={{ borderColor: 'var(--border)' }}>
              <Search className="h-4 w-4" style={{ color: 'var(--primary)' }} />
              <span className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>Look Up Order</span>
            </div>
            <div className="p-4 space-y-4">
              {error && (
                <div className="flex items-start gap-2 p-3 rounded-lg" style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)' }} role="alert">
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" style={{ color: 'var(--destructive)' }} />
                  <p className="text-sm" style={{ color: 'var(--destructive)' }}>{error}</p>
                </div>
              )}
              <div>
                <label htmlFor="orderId" className="block text-sm font-medium mb-2" style={{ color: 'var(--foreground)' }}>Order ID</label>
                <div className="relative">
                  <input
                    type="text"
                    id="orderId"
                    value={orderId}
                    onChange={(e) => { setOrderId(e.target.value); setError(null); }}
                    placeholder="e.g., ord_001"
                    className="w-full px-4 py-3 pl-10 rounded-lg border text-sm font-mono transition-colors"
                    style={{ backgroundColor: 'var(--background)', borderColor: 'var(--border)', color: 'var(--foreground)' }}
                  />
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: 'var(--muted-foreground)' }} />
                </div>
              </div>
              <button type="submit" className="flex items-center justify-center gap-2 w-full px-4 py-3 rounded-lg text-sm font-medium transition-colors" style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)' }}>
                <span>Go to Order</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  async function fetchOrder(orderId: string): Promise<Order> {
    return expressoApi.getOrderById(orderId);
  }

  function OrderDetailView({ orderId, onBack }: { orderId: string; onBack: () => void }) {
    const { data: order, error, isLoading, mutate } = useSWR<Order, Error>(
      `order-${orderId}`,
      () => fetchOrder(orderId),
      { revalidateOnFocus: false },
    );

    if (isLoading) {
      return <div className="home-stage-section-inner"><PageLoadingState message="Loading order..." /></div>;
    }

    if (error || !order) {
      return (
        <div className="home-stage-section-inner">
          <PageErrorState
            title="Order not found"
            message={error ? `Could not find order ${orderId}. Verify the order ID and try again.` : 'The order could not be loaded.'}
            onRetry={() => mutate()}
          />
        </div>
      );
    }

    const status = statusConfig[order.status]!;
    const StatusIcon = status.icon;

    return (
      <div className="home-stage-section-inner max-w-2xl">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-sm font-medium mb-6 transition-colors hover:opacity-80"
          style={{ color: 'var(--muted-foreground)' }}
        >
          <ArrowLeft className="h-4 w-4" />
          Back to orders
        </button>

        {order.status === 'pending' && (
          <div className="flex items-center gap-3 p-4 rounded-lg mb-6" style={{ backgroundColor: 'rgba(34, 197, 94, 0.1)' }} role="alert">
            <CheckCircle className="h-5 w-5 flex-shrink-0" style={{ color: 'var(--success)' }} />
            <div>
              <p className="font-medium text-sm" style={{ color: 'var(--foreground)' }}>Order placed successfully!</p>
              <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>Your order has been received and is being processed.</p>
            </div>
          </div>
        )}

        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--foreground)' }}>Order Details</h1>
            <p className="font-mono text-sm mt-1" style={{ color: 'var(--muted-foreground)' }}>{order.orderId}</p>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full" style={{ backgroundColor: status.bg }}>
            <StatusIcon className="h-4 w-4" style={{ color: status.color }} />
            <span className="text-sm font-medium" style={{ color: status.color }}>{status.label}</span>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-lg border p-6" style={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)' }}>
            <h2 className="font-semibold text-lg mb-4" style={{ color: 'var(--foreground)' }}>Order Information</h2>
            <dl className="grid sm:grid-cols-2 gap-4 text-sm">
              <div>
                <dt style={{ color: 'var(--muted-foreground)' }}>Placed At</dt>
                <dd className="font-medium mt-0.5" style={{ color: 'var(--foreground)' }}>{new Date(order.placedAt).toLocaleString()}</dd>
              </div>
              <div>
                <dt style={{ color: 'var(--muted-foreground)' }}>Last Updated</dt>
                <dd className="font-medium mt-0.5" style={{ color: 'var(--foreground)' }}>{new Date(order.updatedAt).toLocaleString()}</dd>
              </div>
              <div>
                <dt style={{ color: 'var(--muted-foreground)' }}>Total</dt>
                <dd className="font-bold mt-0.5" style={{ color: 'var(--foreground)' }}>{formatMoney(order.total.amountMinor, order.total.currency)}</dd>
              </div>
            </dl>
          </div>

          <div className="rounded-lg border p-6" style={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)' }}>
            <h2 className="font-semibold text-lg mb-4" style={{ color: 'var(--foreground)' }}>Order Items</h2>
            <ul className="divide-y" style={{ borderColor: 'var(--border)' }}>
              {order.lines.map((line, i) => (
                <li key={i} className="py-3 flex justify-between">
                  <div>
                    <p className="font-medium text-sm" style={{ color: 'var(--foreground)' }}>{line.name}</p>
                    <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                      {line.quantity} x {formatMoney(line.unitPrice.amountMinor, line.unitPrice.currency)}
                    </p>
                  </div>
                  <p className="font-medium text-sm" style={{ color: 'var(--foreground)' }}>
                    {formatMoney(line.lineTotal.amountMinor, line.lineTotal.currency)}
                  </p>
                </li>
              ))}
            </ul>
          </div>

          {order.status !== 'cancelled' && (
            <OrderManagePanel order={order} onUpdate={() => mutate()} />
          )}

          <p className="text-xs text-center" style={{ color: 'var(--muted-foreground)' }}>
            Orders are persisted to PostgreSQL and survive BFF restarts.
          </p>
        </div>
      </div>
    );
  }

  function OrderManagePanel({ order, onUpdate }: { order: Order; onUpdate: () => void }) {
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function handleAction(input: ManageOrderInput) {
      setIsLoading(true);
      setError(null);
      try {
        await expressoApi.manageOrder(order.orderId, input);
        onUpdate();
      } catch (err) {
        if (err instanceof ExpressoApiError) {
          setError(`Action failed: ${err.message}`);
        } else {
          setError('An unexpected error occurred.');
        }
      } finally {
        setIsLoading(false);
      }
    }

    const actions: { label: string; input: ManageOrderInput; variant: 'primary' | 'secondary' | 'danger' }[] = [];

    if (order.status === 'pending') {
      actions.push({ label: 'Start Preparing', input: { action: 'update_status', nextStatus: 'preparing' }, variant: 'primary' });
      actions.push({ label: 'Cancel Order', input: { action: 'cancel', reason: 'User requested' }, variant: 'danger' });
    } else if (order.status === 'preparing') {
      actions.push({ label: 'Mark as Prepared', input: { action: 'mark_prepared' }, variant: 'primary' });
      actions.push({ label: 'Cancel Order', input: { action: 'cancel', reason: 'User requested' }, variant: 'danger' });
    }

    if (actions.length === 0) return null;

    const variantStyles = {
      primary: { backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)' },
      secondary: { backgroundColor: 'var(--secondary)', color: 'var(--foreground)' },
      danger: { backgroundColor: 'rgba(239, 68, 68, 0.1)', color: 'var(--destructive)' },
    };

    return (
      <div className="rounded-lg border p-6" style={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)' }}>
        <h2 className="font-semibold text-lg mb-4" style={{ color: 'var(--foreground)' }}>Order Actions</h2>
        {error && (
          <div className="flex items-start gap-2 p-3 rounded-md mb-4" style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', color: 'var(--destructive)' }} role="alert">
            <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <p className="text-sm">{error}</p>
          </div>
        )}
        <div className="flex flex-wrap gap-3">
          {actions.map(({ label, input, variant }) => (
            <button
              key={label}
              onClick={() => handleAction(input)}
              disabled={isLoading}
              className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors disabled:opacity-50"
              style={variantStyles[variant]}
            >
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : variant === 'danger' ? <XCircle className="h-4 w-4" /> : <RefreshCw className="h-4 w-4" />}
              {label}
            </button>
          ))}
        </div>
        <p className="text-xs mt-4" style={{ color: 'var(--muted-foreground)' }}>
          These actions simulate order management operations. In a real system, these would be restricted to authorized staff.
        </p>
      </div>
    );
  }

  export function OrdersSection({ initialOrderId }: { initialOrderId?: string | null }) {
    const [selectedOrderId, setSelectedOrderId] = useState<string | null>(initialOrderId ?? null);

    if (selectedOrderId) {
      return <OrderDetailView orderId={selectedOrderId} onBack={() => setSelectedOrderId(null)} />;
    }
    return <OrdersListView onSelect={setSelectedOrderId} />;
  }
  ```

  This is a straightforward merge: `OrdersListView` is the old
  `orders/page.tsx` body with `router.push`/`<Link>` replaced by
  `onSelect`/`onBack` callbacks; `OrderDetailView` is the old
  `orders/[orderId]/page.tsx` body with `params.orderId` replaced by an
  `orderId` prop and its "Continue shopping" link replaced by a "Back to
  orders" button; `OrderManagePanel` is copied verbatim (it already took
  `order` as a prop, no route dependency existed).

- [ ] **Step 4: Typecheck and lint**

  Run: `pnpm --filter @mini-commerce/web typecheck && pnpm --filter @mini-commerce/web lint`
  Expected: both PASS. These three files aren't imported anywhere yet
  (Task 4 wires them in), so this only checks they compile standalone —
  don't be surprised if lint flags `home-stage-section-inner` as an
  unrecognized class name if your linter checks CSS class existence (this
  repo's ESLint config does not; only `pnpm typecheck`/`tsc` and
  `eslint` for JS/TS are relevant here).

- [ ] **Step 5: Commit**

  ```bash
  git add apps/web/src/components/sections/OrdersSection.tsx apps/web/src/components/sections/PerformanceSection.tsx apps/web/src/components/sections/DevSection.tsx
  git commit -m "feat(web): extract Orders, Performance, and API Debug into section components"
  ```

---

## Task 3: Simplify `CartCheckoutPanel` for a single caller

**Files:**
- Modify: `apps/web/src/components/cart/CartCheckoutPanel.tsx`

**Interfaces:**
- Produces: `CartCheckoutPanel({ onOrderPlaced }: { onOrderPlaced: (orderId: string) => void }): JSX.Element`
  — the `variant` prop is removed entirely (only one caller remains after
  `/checkout` is deleted). Task 4's `page.tsx` calls
  `<CartCheckoutPanel onOrderPlaced={handleOrderPlaced} />`.

- [ ] **Step 1: Drop the `variant` prop, add `onOrderPlaced`**

  In `apps/web/src/components/cart/CartCheckoutPanel.tsx`, find:

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
  ```

  Replace with:

  ```tsx
  "use client";

  /**
   * CartCheckoutPanel - Cart summary + place-order submission
   *
   * Renders inline in the homepage's always-visible cart column. On
   * success, hands the new order id to the caller instead of navigating —
   * there is no longer a route to navigate to; the caller (page.tsx)
   * switches the Orders section to show it.
   */

  import { useState } from "react";
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
    onOrderPlaced: (orderId: string) => void;
  }

  export function CartCheckoutPanel({ onOrderPlaced }: CartCheckoutPanelProps) {
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
        onOrderPlaced(result.orderId);
      } catch (err) {
  ```

- [ ] **Step 2: Drop the `variant`-conditional styling**

  Find:

  ```tsx
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
  ```

  Replace with:

  ```tsx
    const cardPadding = "p-3";
    const headerPadding = "px-3 py-2";
    const cardClass = "rounded-lg border overflow-hidden";

    return (
      <div className="space-y-3" data-testid="cart-checkout-panel">
  ```

  The rest of the file (the order-summary card, the form, the error
  display, the submit button) references `cardPadding`/`headerPadding`/
  `cardClass` and needs no further changes — those variables just stop
  varying.

- [ ] **Step 3: Typecheck and lint**

  Run: `pnpm --filter @mini-commerce/web typecheck && pnpm --filter @mini-commerce/web lint`
  Expected: `tsc` will fail here until Task 4 updates `page.tsx`'s call
  site to match the new props (it currently passes `variant="sidebar"`,
  which no longer exists, and doesn't pass the now-required
  `onOrderPlaced`). That failure is expected and fine — this task's job is
  the component itself; confirm the failure is exactly "Property
  'variant' does not exist" / "Property 'onOrderPlaced' is missing" and
  nothing else, then proceed. Task 4 makes the whole app typecheck clean
  again.

- [ ] **Step 4: Commit**

  ```bash
  git add apps/web/src/components/cart/CartCheckoutPanel.tsx
  git commit -m "refactor(web): drop CartCheckoutPanel's page variant, add onOrderPlaced callback"
  ```

---

## Task 4: Rewrite `page.tsx` to switch sections

**Files:**
- Modify: `apps/web/app/page.tsx` (full rewrite)
- Modify: `apps/web/app/globals.css` (add three new rules this task's JSX
  depends on — see Step 2. Task 5 later deletes the now-dead rail/viz-panel
  CSS from this same file; that deletion doesn't touch anything this task
  adds and can run before or after this task with no conflict)

**Interfaces:**
- Consumes: `useSection()` from Task 1, `OrdersSection`/`PerformanceSection`/`DevSection`
  from Task 2, `CartCheckoutPanel({ onOrderPlaced })` from Task 3.
- Produces: the wired-up single page, plus CSS classes `.home-stage-strip--full`,
  `.home-stage-section`, `.home-stage-section-inner` that Task 2's already-written
  section components and this task's own JSX both reference by name — Task 5
  must not reintroduce or rename these. Nothing downstream depends on this
  file's internals beyond what it already renders (`data-testid`s stay the
  same for the catalog section, per Task 7's e2e work).

- [ ] **Step 1: Rewrite `page.tsx`**

  Replace the entire contents of `apps/web/app/page.tsx` with:

  ```tsx
  "use client";

  import { useCallback, useState } from "react";
  import useSWR from "swr";
  import { expressoApi, ProductsResponse } from "@/lib/api/expresso-api";
  import { ProductCatalogGrid } from "@/components/catalog/ProductCatalogGrid";
  import { CatalogGridSkeleton } from "@/components/system/LoadingSkeleton";
  import { PageErrorState } from "@/components/system/ErrorBanner";
  import { EmptyState } from "@/components/system/EmptyState";
  import { CartCheckoutPanel } from "@/components/cart/CartCheckoutPanel";
  import { VisualizerEmbed } from "@/components/visualizer/VisualizerEmbed";
  import { OrdersSection } from "@/components/sections/OrdersSection";
  import { PerformanceSection } from "@/components/sections/PerformanceSection";
  import { DevSection } from "@/components/sections/DevSection";
  import { useSection } from "@/components/system/SectionProvider";
  import { Sparkles } from "lucide-react";

  async function fetchProducts(): Promise<ProductsResponse> {
    return expressoApi.getProducts();
  }

  export default function HomeWorkspace() {
    const { section, setSection } = useSection();
    const [justPlacedOrderId, setJustPlacedOrderId] = useState<string | null>(null);

    const { data, error, isLoading, mutate } = useSWR<ProductsResponse, Error>(
      "products",
      fetchProducts,
      { revalidateOnFocus: false },
    );

    const productCount = data?.items.length ?? 0;

    const handleOrderPlaced = useCallback(
      (orderId: string) => {
        setJustPlacedOrderId(orderId);
        setSection("orders");
      },
      [setSection],
    );

    return (
      <div className="home-stage">
        <section className="home-stage-viz" aria-label="3D order counter">
          <VisualizerEmbed embed fill compact={false} title="Order counter" />
        </section>

        <div
          className={`home-stage-strip${section !== "catalog" ? " home-stage-strip--full" : ""}`}
        >
          {section === "catalog" && (
            <>
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
                <CartCheckoutPanel onOrderPlaced={handleOrderPlaced} />
              </aside>
            </>
          )}

          {section === "orders" && (
            <div className="home-stage-section" data-testid="home-orders">
              <OrdersSection initialOrderId={justPlacedOrderId} />
            </div>
          )}

          {section === "performance" && (
            <div className="home-stage-section" data-testid="home-performance">
              <PerformanceSection />
            </div>
          )}

          {section === "dev" && (
            <div className="home-stage-section" data-testid="home-dev">
              <DevSection onOpenOrders={() => setSection("orders")} />
            </div>
          )}
        </div>
      </div>
    );
  }
  ```

  Note: `justPlacedOrderId` is intentionally not reset after `OrdersSection`
  consumes it — if the shopper later switches away from Orders and back,
  `OrdersSection` remounts (it's conditionally rendered, not
  display:none'd) and would re-select the same just-placed order every
  time. This is acceptable for this app's scope (single anonymous cart,
  one order at a time is the common case) — flagged here, not silently
  accepted, in case a future session wants "remember I navigated away from
  that order" behavior instead.

- [ ] **Step 2: Add the CSS this page's JSX depends on**

  In `apps/web/app/globals.css`, find:

  ```css
  .home-stage-strip {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 380px;
    gap: 1rem;
    min-height: 0;
    padding: 0.5rem 1rem 1rem;
  }

  .home-stage-catalog {
  ```

  Replace with:

  ```css
  .home-stage-strip {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 380px;
    gap: 1rem;
    min-height: 0;
    padding: 0.5rem 1rem 1rem;
  }

  /* Orders/Performance/API Debug span the full strip width instead of
     sharing it with a cart column — there is nothing to check out while
     looking at them — and scroll normally instead of the catalog pane's
     constrained layout. */
  .home-stage-strip--full {
    grid-template-columns: minmax(0, 1fr);
  }

  .home-stage-section {
    min-height: 0;
    min-width: 0;
    overflow-y: auto;
  }

  /* Matches `.container`'s max-width/centering for content moved out of a
     former full page route (Orders/Performance/API Debug) into a strip
     panel, without `.container`'s 1200px cap fighting the panel's own
     (usually narrower) width. */
  .home-stage-section-inner {
    padding: 1.5rem;
  }

  .home-stage-catalog {
  ```

- [ ] **Step 3: Typecheck and lint**

  Run: `pnpm --filter @mini-commerce/web typecheck && pnpm --filter @mini-commerce/web lint`
  Expected: both PASS now — this is the task that resolves Task 3's
  expected interim failure.

- [ ] **Step 4: Manual browser verification**

  With `./dev up full` running:
  - Load `/`: Catalog section shows exactly as before (product, cart
    panel, visualizer stage).
  - Click "Orders" in the header: strip switches to the orders list (full
    width, no cart column), visualizer stage stays visible and does not
    reload (watch the iframe — no flash/reload). Click an order: detail
    view replaces the list in the same panel. Click "Back to orders":
    returns to the list.
  - Click "Performance": strip shows the performance dashboard, scrolls if
    taller than the panel. Click "API": same for the dev/API debug cards.
    In API Debug, find the Demo Guide's "Sample Order" button and confirm
    it switches to Orders.
  - Add the product from Catalog, place the order: confirm the app
    switches to Orders and shows that order's detail view directly (the
    "Order placed successfully!" banner should show, since it's freshly
    `pending`).
  - Confirm the visualizer connects/renders throughout all of the above —
    it should never show a loading flash after the first load, since it's
    one instance for the whole session now.

- [ ] **Step 5: Commit**

  ```bash
  git add apps/web/app/page.tsx apps/web/app/globals.css
  git commit -m "feat(web): switch page.tsx between Catalog/Orders/Performance/API sections"
  ```

---

## Task 5: Delete the rail/route-era CSS

**Files:**
- Modify: `apps/web/app/globals.css`

**Interfaces:**
- Produces: `.home-stage-strip--full` and `.home-stage-section` (consumed
  by Task 4's `page.tsx`, already written and committed by the time this
  task runs — this task's new classes must match those exact names).

- [ ] **Step 1: Delete the `--viz-rail-w` custom property**

  Find (near the top of the file, inside the `:root { ... }` block):

  ```css
    /* Persistent visualizer rail width. 0 on narrow viewports (viz collapses
       to a bottom drawer instead of a side column); set on the desktop
       breakpoint below. Consumed by the cart panel so it never sits behind
       the rail. */
    --viz-rail-w: 0px;
  }
  ```

  Replace with:

  ```css
  }
  ```

  (This removes the property and its comment; the `:root { ... }` block's
  closing brace stays, now closing on whatever property was above it.)

- [ ] **Step 2: Replace the "Home stage" section header comment**

  Find:

  ```css
  /* ------------------------------------------------------------------ */
  /* Home stage — the 3D visualizer is this page's main content, not a   */
  /* side rail (every other route still gets the rail — see the app-shell */
  /* section below). Fixed viewport: no page-level scrolling, ever.       */
  /* ------------------------------------------------------------------ */
  ```

  Replace with:

  ```css
  /* ------------------------------------------------------------------ */
  /* Home stage — the 3D visualizer is this page's main content, pinned  */
  /* above every section (Catalog, Orders, Performance, API Debug — see  */
  /* apps/web/app/page.tsx's section switch). Fixed viewport: no         */
  /* page-level scrolling, ever. Non-catalog sections scroll internally  */
  /* in the strip below; the stage itself never does.                    */
  /* ------------------------------------------------------------------ */
  ```

- [ ] **Step 3: Delete the whole "App shell — persistent visualizer rail" block down through `.viz-bezel-caption`'s media query**

  (Task 4 already added `.home-stage-strip--full`/`.home-stage-section`/
  `.home-stage-section-inner` earlier in this same file — this step
  doesn't touch those, only the separate rail/viz-panel region below them.)

  Find (this is everything from the section-header comment through the
  `@media (min-width: 1024px) { .viz-panel {...} .viz-pull-tab {...} }`
  block — a large contiguous region):

  ```css
  /* ------------------------------------------------------------------ */
  /* App shell — persistent visualizer rail                              */
  /*                                                                      */
  /* The 3D visualizer is global chrome, not page content: AppShell wraps */
  /* {children} and a VisualizerPanel in a two-column grid so whatever    */
  /* the shopper does (browse, cart, checkout, orders) stays next to the  */
  /* live order counter. Below 1024px there's no room for a side column, */
  /* so the panel collapses to a bottom drawer with a pull-tab instead.   */
  /* The one exception is the homepage: it has no rail at all, since it   */
  /* renders its own full-bleed visualizer stage instead (see the "Home   */
  /* stage" section above and apps/web/app/page.tsx).                    */
  /* ------------------------------------------------------------------ */

  :root {
    --viz-tab-h: 2.75rem;
  }

  .shell-body {
    flex: 1 1 auto;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    min-height: 0;
  }

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

  /* Caps the shell root to the viewport height on home only, so
     .shell-content-full/.home-stage's flex:1 1 auto + min-height:0 chain
     has an actual definite height to shrink into instead of growing to
     fit content. `.min-h-screen` alone is a floor, not a ceiling, and
     does not prevent the page from growing taller than the viewport —
     which is exactly what "no scroll on /" must prevent. `overflow:
     hidden` clips content that still doesn't fit after shrinking, per
     the "truly zero scroll anywhere" requirement — every other route
     still uses plain `.min-h-screen` unmodified and scrolls normally,
     as intended.
  */
  .home-shell-root {
    height: 100vh;
    overflow: hidden;
    /* The persistent rail's width variable doesn't apply here — the
       homepage has no rail — but CartDrawer's backdrop/panel position off
       it regardless (they don't know which route they're on). Zeroing it
       here keeps the drawer correctly full-width/edge-anchored on `/`
       without touching CartDrawer.tsx itself. */
    --viz-rail-w: 0px;
  }

  @media (min-width: 1024px) {
    .shell-body {
      grid-template-columns: minmax(0, 1fr) 420px;
    }
    :root {
      --viz-rail-w: 420px;
    }
  }

  .viz-panel {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 45;
    max-height: 85vh;
    overflow-y: auto;
    background: var(--card);
    transform: translateY(calc(100% - var(--viz-tab-h)));
    transition: transform 0.3s ease;
  }
  .viz-panel.is-open {
    transform: translateY(0);
  }

  @media (prefers-reduced-motion: reduce) {
    .viz-panel {
      transition: none;
    }
  }

  .viz-pull-tab {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    width: 100%;
    height: var(--viz-tab-h);
    border: 0;
    border-top: 4px solid var(--brass);
    background: var(--barrel);
    color: var(--crema);
    font-family: "Fraunces", Georgia, serif;
    font-weight: 500;
    font-size: 0.875rem;
    cursor: pointer;
  }

  .viz-pull-handle {
    display: block;
    width: 2.5rem;
    height: 3px;
    background: var(--brass);
  }

  .viz-bezel {
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    position: relative;
  }

  .viz-bezel::before,
  .viz-bezel::after {
    content: "";
    position: absolute;
    top: 0.5rem;
    width: 6px;
    height: 6px;
    background: var(--brass);
  }
  .viz-bezel::before {
    left: 0.5rem;
  }
  .viz-bezel::after {
    right: 0.5rem;
  }

  .viz-bezel-caption {
    font-size: 0.8125rem;
    color: var(--muted-foreground);
    line-height: 1.5;
  }

  @media (min-width: 1024px) {
    .viz-panel {
      position: sticky;
      top: 5rem;
      left: auto;
      right: auto;
      bottom: auto;
      max-height: calc(100vh - 6rem);
      transform: none !important;
      border-top: 0;
      border-left: 4px solid var(--brass);
    }
    .viz-pull-tab {
      display: none;
    }
  }
  ```

  Replace with:

  ```css
  /* ------------------------------------------------------------------ */
  /* App shell root — the whole app is one page now: this is just the    */
  /* shell's layout container (header, then the full-bleed home stage    */
  /* above), capped to the viewport with no page-level scroll.           */
  /* ------------------------------------------------------------------ */

  .shell-content-full {
    flex: 1 1 auto;
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }

  /* Caps the shell root to the viewport height, so
     .shell-content-full/.home-stage's flex:1 1 auto + min-height:0 chain
     has an actual definite height to shrink into instead of growing to
     fit content. `.min-h-screen` alone is a floor, not a ceiling, and
     does not prevent the page from growing taller than the viewport —
     which is exactly what "no page scroll" must prevent. `overflow:
     hidden` clips content that still doesn't fit after shrinking.
  */
  .home-shell-root {
    height: 100vh;
    overflow: hidden;
  }
  ```

- [ ] **Step 4: Simplify the cart panel's positioning**

  Find:

  ```css
  /* ------------------------------------------------------------------ */
  /* Cart panel — reframed as a receipt printing out from the header cart */
  /* button rather than a full-height slab over the right edge, so it     */
  /* never covers the persistent visualizer rail on desktop.              */
  /* ------------------------------------------------------------------ */

  .cart-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    bottom: 0;
    right: var(--viz-rail-w);
    z-index: 48;
  }

  .cart-panel {
    position: fixed;
    top: 4.5rem;
    right: calc(var(--viz-rail-w) + 1rem);
    left: 1rem;
  ```

  Replace with:

  ```css
  /* ------------------------------------------------------------------ */
  /* Cart panel — a receipt printing out from the header cart button.    */
  /* ------------------------------------------------------------------ */

  .cart-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    bottom: 0;
    right: 0;
    z-index: 48;
  }

  .cart-panel {
    position: fixed;
    top: 4.5rem;
    right: 1rem;
    left: 1rem;
  ```

  Everything after this (`z-index: 49; width: auto; max-width: 26rem;
  margin-left: auto; max-height: calc(100vh - 6rem); display: flex;
  flex-direction: column; border-left: 4px solid var(--brass); }`) is
  unchanged — only the `right` value on both rules loses its
  `var(--viz-rail-w)` term.

- [ ] **Step 5: Delete `VisualizerPanel.tsx`**

  It has no remaining callers after Task 1 removed its import from
  `AppShell.tsx`.

  ```bash
  git rm apps/web/src/components/visualizer/VisualizerPanel.tsx
  ```

- [ ] **Step 6: Typecheck and lint**

  Run: `pnpm --filter @mini-commerce/web typecheck && pnpm --filter @mini-commerce/web lint`
  Expected: both PASS. Typecheck will fail if `VisualizerPanel.tsx` still
  has a live import anywhere — grep for `VisualizerPanel` across
  `apps/web/src` first if it does, to find what still references it,
  rather than guessing.

- [ ] **Step 7: Manual browser verification**

  With `./dev up full` running: repeat Task 4 Step 4's checks (all four
  sections reachable, visualizer never remounts) and additionally confirm
  the cart drawer opens correctly positioned (right edge of the viewport,
  not offset by a phantom rail width) from every section, not just
  Catalog.

- [ ] **Step 8: Commit**

  ```bash
  git add apps/web/app/globals.css apps/web/src/components/visualizer/VisualizerPanel.tsx
  git commit -m "fix(web): delete the rail-era CSS and VisualizerPanel now that every route is gone"
  ```

---

## Task 6: Delete the old route files

**Files:**
- Delete: `apps/web/app/cart/`, `apps/web/app/checkout/`, `apps/web/app/orders/`,
  `apps/web/app/dev/`, `apps/web/app/performance/` (entire directories)

**Interfaces:** None — this task only removes files nothing else imports
by this point in the plan (Tasks 2-5 already extracted or replaced
everything these directories contained).

- [ ] **Step 1: Confirm nothing still imports from these paths**

  ```bash
  grep -rn "app/cart\|app/checkout\|app/orders\|app/dev\|app/performance" apps/web/src apps/web/app --include="*.tsx" --include="*.ts" | grep -v "apps/web/app/cart/\|apps/web/app/checkout/\|apps/web/app/orders/\|apps/web/app/dev/\|apps/web/app/performance/"
  ```

  Expected: no output (any import of these route directories, from
  outside the directories themselves, would be a problem — there should be
  none, since routes aren't importable modules to begin with and nothing
  in this plan created such an import). If this finds something, stop and
  report it rather than deleting.

- [ ] **Step 2: Delete the directories**

  ```bash
  git rm -r apps/web/app/cart apps/web/app/checkout apps/web/app/orders apps/web/app/dev apps/web/app/performance
  ```

- [ ] **Step 3: Typecheck and lint**

  Run: `pnpm --filter @mini-commerce/web typecheck && pnpm --filter @mini-commerce/web lint`
  Expected: both PASS.

- [ ] **Step 4: Manual browser verification**

  With `./dev up full` running: visit `http://localhost:3000/orders`,
  `/dev`, `/performance`, `/cart`, `/checkout` directly in the browser —
  each should now 404 (Next.js's default not-found page). Confirm `/`
  itself still works with all four sections reachable via nav.

- [ ] **Step 5: Commit**

  ```bash
  git commit -m "feat(web): delete /cart, /checkout, /orders, /dev, /performance routes"
  ```

---

## Task 7: Align the e2e suite with the single-page app

**Files:**
- Modify: `tests/e2e/tests/frontend-certification.spec.ts`
- Modify: `tests/e2e/tests/checkout-happy-path.spec.ts`
- Modify: `tests/e2e/tests/purchase.spec.ts`
- Modify: `tests/e2e/tests/visual-integrity.spec.ts`
- Modify (check, may not need changes): `tests/e2e/tests/homepage-workspace.spec.ts`,
  `tests/e2e/tests/session-isolation.spec.ts`

**Interfaces:**
- Consumes: `data-testid="home-catalog"` (unchanged), `data-testid="home-orders"`,
  `data-testid="home-performance"`, `data-testid="home-dev"` (new, added
  by Task 4 — one per non-catalog section, on the wrapping
  `.home-stage-section` div), the header nav's buttons (no longer
  `<Link>`s — `getByRole("link", ...)` queries against nav items become
  `getByRole("button", ...)`).

- [ ] **Step 1: Grep for every reference to a deleted route, fresh**

  Run this yourself before touching any file — do not trust the list
  below as exhaustive, the same way the previous plan's e2e task
  under-scoped itself by trusting an incomplete list:

  ```bash
  grep -rn "goto(['\"]\/orders\|goto(['\"]\/dev\|goto(['\"]\/performance\|goto(['\"]\/checkout\|goto(['\"]\/cart\|toHaveURL(/\\\\\/orders\|toHaveURL(/\\\\\/checkout\|toHaveURL(/\\\\\/dev\|toHaveURL(/\\\\\/performance\|toHaveURL(/\\\\\/cart\|getByRole(['\"]link['\"], *{ *name: *['\"]Orders\|getByRole(['\"]link['\"], *{ *name: *['\"]Performance\|getByRole(['\"]link['\"], *{ *name: *['\"]API" tests/e2e/tests/*.spec.ts
  ```

  At the time this plan was written, this surfaced 13 hits across
  `frontend-certification.spec.ts`, `checkout-happy-path.spec.ts`,
  `purchase.spec.ts`, and `visual-integrity.spec.ts` — every one of them a
  `toHaveURL` assertion expecting a real navigation to a route that no
  longer exists (`/checkout`, `/orders/:id`, `/dev`, `/performance`,
  `/orders`). None of those specific 13 lines are reproduced verbatim
  here — read each one in its actual surrounding test to understand what
  the test is actually verifying before changing it (a `toHaveURL`
  assertion after clicking "Proceed to Checkout" is checking "checkout UI
  appeared", not "a navigation happened" — the navigation was never the
  point).

- [ ] **Step 2: Apply the general replacement pattern**

  For each hit, the underlying shape is the same: something that used to
  be "click a link/button, then assert the URL changed" becomes "click a
  button, then assert the section's content appeared" — e.g.:

  Before (illustrative — match this shape, not this exact code, in each
  real test):
  ```tsx
  await cartDrawer.getByRole('link', { name: /Proceed to Checkout/ }).click();
  await expect(page).toHaveURL(/\/checkout$/);
  await expect(page.getByText('Classic Espresso')).toBeVisible();
  ```

  After: checkout is already inline on `/` since the prior redesign — the
  "Proceed to Checkout" click inside `CartDrawer` still exists (`CartDrawer`
  is unchanged by this plan) and still closes the drawer, but there is no
  longer a `/checkout` URL to land on; the shopper is just looking at the
  same page's cart panel. Replace the `toHaveURL` assertion with a direct
  check that the cart panel shows the expected content:
  ```tsx
  await cartDrawer.getByRole('link', { name: /Proceed to Checkout/ }).click();
  await expect(page.getByTestId('cart-checkout-panel')).toContainText('Classic Espresso');
  ```

  For navigations to `/orders/:id` after placing an order, replace the
  `toHaveURL` check with an assertion on `data-testid="home-orders"` and
  the order-detail content inside it (heading, order id, success banner —
  whatever that specific test already asserts right after the URL check,
  keep those, just drop the URL check or replace it with confirming
  `home-orders` is what's showing).

  For tests that navigate to `/orders`, `/dev`, or `/performance` via
  `page.goto(...)` directly, replace with `page.goto('/')` followed by
  clicking the corresponding nav button (`page.getByRole('button', { name:
  'Orders' })` etc. — nav items are buttons now, not links, per Task 1),
  then assert on the matching `data-testid` (`home-orders`/`home-dev`/
  `home-performance`) instead of the URL.

  For tests that click a nav `<Link>` and assert `toHaveURL`, replace with
  clicking the nav button and asserting the corresponding `data-testid`
  section is visible instead.

- [ ] **Step 3: Check `homepage-workspace.spec.ts` and `session-isolation.spec.ts`**

  Read both fully. Neither is expected to need changes (neither navigates
  to a deleted route), but confirm this directly rather than assuming —
  `homepage-workspace.spec.ts` in particular has needed unanticipated
  fixes twice already in this codebase's history.

- [ ] **Step 4: Typecheck and lint**

  Run: `pnpm --filter @mini-commerce/e2e typecheck && pnpm --filter @mini-commerce/e2e lint`
  Expected: both PASS.

- [ ] **Step 5: Run the full suite**

  Run: `pnpm --filter @mini-commerce/e2e exec playwright test --reporter=list`
  Fix whatever fails, following the same "read the real failure, don't
  guess" discipline as every other task in this plan and its predecessor.
  Report the final pass/skip/fail counts in your report — do not claim
  green without pasting the actual numbers.

- [ ] **Step 6: Commit**

  ```bash
  git add tests/e2e/tests/
  git commit -m "test(e2e): align the suite with the single-page app"
  ```

---

## Definition of Done

- Exactly one route exists: `/`. `/cart`, `/checkout`, `/orders`,
  `/orders/[orderId]`, `/dev`, `/performance` return 404.
- All four sections (Catalog, Orders, Performance, API Debug) are reachable
  from the header nav and render their existing functionality unchanged.
- The 3D visualizer never remounts while switching between sections —
  confirmed manually (iframe doesn't flash/reload) and ideally by the new
  e2e check the design doc calls out (not required by this plan, since the
  design doc flagged it as "worth adding," not "must add" — add it if
  Task 7 has room, otherwise note it as a follow-up).
- Placing an order from Catalog lands on that order's detail view under
  Orders without a full page navigation.
- `AppShell.tsx` has no route/`pathname` logic left — navigation state
  comes entirely from `useSection()`.
- `VisualizerPanel.tsx` and its supporting CSS (`.shell-body`, `.viz-panel*`,
  `.viz-bezel*`, `--viz-rail-w` and every consumer of it) are deleted.
- `pnpm typecheck`, `pnpm lint`, and the full e2e suite are green.
