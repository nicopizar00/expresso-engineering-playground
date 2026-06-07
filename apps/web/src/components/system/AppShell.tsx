"use client";

/**
 * AppShell - Main application layout wrapper
 *
 * Provides consistent navigation, header, footer, and cart drawer across all pages.
 * Includes demo mode toggle for frontend exploration without backend.
 */

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
  Box,
  Gauge,
  Database,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useCart } from "@/components/cart/CartProvider";
import { HealthBadge } from "./HealthBadge";
import { CartDrawer } from "@/components/cart/CartDrawer";
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
  { href: "/visualizer", label: "3D", icon: Box },
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

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { itemCount, isCartDrawerOpen, openCartDrawer, closeCartDrawer } =
    useCart();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isDemoMode, setIsDemoMode] = useState(false);

  // Check demo mode status on mount (client-side only)
  useEffect(() => {
    setIsDemoMode(getDemoModeStatus());
  }, []);

  function handleToggleDemoMode() {
    setDemoMode(!isDemoMode);
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Demo mode banner */}
      {isDemoMode && (
        <div
          className="py-2 px-4 text-center text-xs font-medium"
          style={{
            backgroundColor: "var(--warning)",
            color: "var(--warning-foreground)",
          }}
          role="status"
        >
          <FlaskConical className="inline h-3 w-3 mr-1" />
          Demo Mode - Using mock data. Backend not required.
          <button
            onClick={handleToggleDemoMode}
            className="ml-2 underline hover:no-underline"
          >
            Disable
          </button>
        </div>
      )}

      {/* Header */}
      <header
        className="sticky top-0 z-50 border-b"
        style={{
          backgroundColor: "var(--card)",
          borderColor: "var(--border)",
        }}
      >
        <div className="container">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
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

            {/* Desktop Nav */}
            <nav
              className="hidden md:flex items-center gap-1"
              role="navigation"
              aria-label="Main"
            >
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
            </nav>

            {/* Right side actions */}
            <div className="flex items-center gap-2">
              {/* Demo mode toggle (when not in demo mode) */}
              {!isDemoMode && (
                <button
                  onClick={handleToggleDemoMode}
                  className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors"
                  style={{
                    backgroundColor: "var(--secondary)",
                    color: "var(--muted-foreground)",
                  }}
                  title="Enable demo mode to explore without backend"
                >
                  <FlaskConical className="h-3.5 w-3.5" />
                  <span>Demo</span>
                </button>
              )}

              <HealthBadge />

              {/* Cart button */}
              <button
                onClick={openCartDrawer}
                className="relative flex items-center justify-center w-10 h-10 rounded-md transition-colors"
                style={{
                  backgroundColor: "var(--secondary)",
                  color: "var(--foreground)",
                }}
                aria-label={`Shopping cart with ${itemCount} items`}
              >
                <ShoppingCart className="h-5 w-5" />
                {itemCount > 0 && (
                  <span
                    className="absolute -top-1 -right-1 flex items-center justify-center h-5 min-w-[1.25rem] px-1 text-xs font-semibold rounded-full"
                    style={{
                      backgroundColor: "var(--primary)",
                      color: "var(--primary-foreground)",
                    }}
                  >
                    {itemCount > 99 ? "99+" : itemCount}
                  </span>
                )}
              </button>

              {/* Mobile menu button */}
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="md:hidden flex items-center justify-center w-10 h-10 rounded-md transition-colors"
                style={{
                  backgroundColor: "var(--secondary)",
                  color: "var(--foreground)",
                }}
                aria-label="Toggle menu"
                aria-expanded={mobileMenuOpen}
              >
                {mobileMenuOpen ? (
                  <X className="h-5 w-5" />
                ) : (
                  <Menu className="h-5 w-5" />
                )}
              </button>
            </div>
          </div>

          {/* Mobile Nav */}
          {mobileMenuOpen && (
            <nav
              className="md:hidden py-4 border-t animate-fadeIn"
              style={{ borderColor: "var(--border)" }}
              role="navigation"
              aria-label="Mobile"
            >
              <div className="flex flex-col gap-1">
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

                {/* Demo mode toggle in mobile menu */}
                <button
                  onClick={handleToggleDemoMode}
                  className="flex items-center gap-3 px-3 py-2.5 min-h-10 rounded-md text-sm font-medium transition-colors mt-2 border-t pt-4"
                  style={{
                    backgroundColor: isDemoMode
                      ? "var(--warning)"
                      : "var(--secondary)",
                    color: isDemoMode
                      ? "var(--warning-foreground)"
                      : "var(--muted-foreground)",
                    borderColor: "var(--border)",
                  }}
                >
                  <FlaskConical className="h-4 w-4" />
                  {isDemoMode ? "Disable Demo Mode" : "Enable Demo Mode"}
                </button>
              </div>
            </nav>
          )}
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1">{children}</main>

      {/* Footer */}
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
              <span style={{ color: "var(--foreground)" }}>Mini Commerce</span>
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

      {/* Cart Drawer */}
      <CartDrawer open={isCartDrawerOpen} onClose={closeCartDrawer} />
    </div>
  );
}
