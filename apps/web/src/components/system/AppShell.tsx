'use client';

/**
 * AppShell - Main application layout wrapper
 *
 * Provides consistent navigation, header, footer, and cart drawer across all pages.
 * Redesigned with a sleek, professional dark theme inspired by Vercel's dashboard.
 */

import { ReactNode, useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Coffee,
  ShoppingCart,
  Package,
  Activity,
  Menu,
  X,
  FlaskConical,
  Box,
  Gauge,
  Terminal,
  ChevronRight,
} from 'lucide-react';
import { useCart } from '@/components/cart/CartProvider';
import { HealthBadge } from './HealthBadge';
import { CartDrawer } from '@/components/cart/CartDrawer';
import { getDemoModeStatus, setDemoMode } from '@/lib/api/expresso-api';

const navLinks = [
  { href: '/', label: 'Catalog', icon: Coffee, description: 'Browse products' },
  { href: '/orders', label: 'Orders', icon: Package, description: 'View order history' },
  { href: '/performance', label: 'Performance', icon: Gauge, description: 'Mock load scenarios' },
  { href: '/visualizer', label: '3D View', icon: Box, description: '3D visualizer' },
  { href: '/dev', label: 'Developer', icon: Terminal, description: 'API debugging' },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { itemCount } = useCart();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [isDemoMode, setIsDemoMode] = useState(false);

  useEffect(() => {
    setIsDemoMode(getDemoModeStatus());
  }, []);

  function handleToggleDemoMode() {
    setDemoMode(!isDemoMode);
  }

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  return (
    <div className="min-h-screen flex flex-col">
      {/* Demo mode banner */}
      {isDemoMode && (
        <div
          className="py-2 px-4 text-center text-xs font-medium flex items-center justify-center gap-2"
          style={{
            backgroundColor: 'rgba(245, 158, 11, 0.15)',
            color: 'var(--warning)',
            borderBottom: '1px solid rgba(245, 158, 11, 0.2)',
          }}
          role="status"
        >
          <FlaskConical className="h-3.5 w-3.5" />
          <span>Demo Mode Active - Using mock data</span>
          <button
            onClick={handleToggleDemoMode}
            className="ml-2 px-2 py-0.5 rounded text-xs font-medium transition-colors"
            style={{
              backgroundColor: 'rgba(245, 158, 11, 0.2)',
              color: 'var(--warning)',
            }}
          >
            Disable
          </button>
        </div>
      )}

      {/* Header */}
      <header
        className="sticky top-0 z-50 border-b"
        style={{
          backgroundColor: 'rgba(10, 10, 10, 0.8)',
          backdropFilter: 'blur(12px)',
          borderColor: 'var(--border)',
        }}
      >
        <div className="container">
          <div className="flex items-center justify-between h-14">
            {/* Logo */}
            <Link
              href="/"
              className="flex items-center gap-2.5 font-semibold transition-opacity hover:opacity-80"
              style={{ color: 'var(--foreground)' }}
            >
              <div
                className="flex items-center justify-center w-8 h-8 rounded-lg"
                style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)' }}
              >
                <Coffee className="h-4 w-4" />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-base font-semibold">Expresso</span>
                <span
                  className="hidden sm:inline-flex items-center px-2 py-0.5 text-[10px] font-medium rounded uppercase tracking-wider"
                  style={{
                    backgroundColor: 'var(--secondary)',
                    color: 'var(--muted-foreground)',
                  }}
                >
                  Playground
                </span>
              </div>
            </Link>

            {/* Desktop Nav */}
            <nav
              className="hidden md:flex items-center gap-1"
              role="navigation"
              aria-label="Main"
            >
              {navLinks.map((link) => {
                const isActive =
                  pathname === link.href ||
                  (link.href !== '/' && pathname.startsWith(link.href));
                const Icon = link.icon;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-all duration-150"
                    style={{
                      backgroundColor: isActive ? 'var(--secondary)' : 'transparent',
                      color: isActive ? 'var(--foreground)' : 'var(--muted-foreground)',
                    }}
                    aria-current={isActive ? 'page' : undefined}
                  >
                    <Icon className="h-4 w-4" />
                    <span>{link.label}</span>
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
                  className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all duration-150"
                  style={{
                    backgroundColor: 'transparent',
                    color: 'var(--muted-foreground)',
                    border: '1px solid var(--border)',
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
                onClick={() => setCartOpen(true)}
                className="relative flex items-center justify-center w-9 h-9 rounded-md transition-all duration-150"
                style={{
                  backgroundColor: itemCount > 0 ? 'var(--primary)' : 'var(--secondary)',
                  color: itemCount > 0 ? 'var(--primary-foreground)' : 'var(--foreground)',
                }}
                aria-label={`Shopping cart with ${itemCount} items`}
              >
                <ShoppingCart className="h-4 w-4" />
                {itemCount > 0 && (
                  <span
                    className="absolute -top-1 -right-1 flex items-center justify-center h-4 min-w-[1rem] px-1 text-[10px] font-bold rounded-full"
                    style={{
                      backgroundColor: 'var(--destructive)',
                      color: 'var(--destructive-foreground)',
                    }}
                  >
                    {itemCount > 99 ? '99' : itemCount}
                  </span>
                )}
              </button>

              {/* Mobile menu button */}
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="md:hidden flex items-center justify-center w-9 h-9 rounded-md transition-colors"
                style={{
                  backgroundColor: 'var(--secondary)',
                  color: 'var(--foreground)',
                }}
                aria-label="Toggle menu"
                aria-expanded={mobileMenuOpen}
              >
                {mobileMenuOpen ? (
                  <X className="h-4 w-4" />
                ) : (
                  <Menu className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>

          {/* Mobile Nav */}
          {mobileMenuOpen && (
            <nav
              className="md:hidden py-4 border-t animate-slideDown"
              style={{ borderColor: 'var(--border)' }}
              role="navigation"
              aria-label="Mobile"
            >
              <div className="flex flex-col gap-1">
                {navLinks.map((link) => {
                  const isActive =
                    pathname === link.href ||
                    (link.href !== '/' && pathname.startsWith(link.href));
                  const Icon = link.icon;
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      className="flex items-center justify-between px-3 py-3 rounded-lg transition-all"
                      style={{
                        backgroundColor: isActive ? 'var(--secondary)' : 'transparent',
                        color: isActive ? 'var(--foreground)' : 'var(--muted-foreground)',
                      }}
                      aria-current={isActive ? 'page' : undefined}
                    >
                      <div className="flex items-center gap-3">
                        <Icon className="h-4 w-4" />
                        <div>
                          <div className="font-medium text-sm">{link.label}</div>
                          <div className="text-xs opacity-70">{link.description}</div>
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 opacity-40" />
                    </Link>
                  );
                })}

                {/* Demo mode toggle in mobile menu */}
                <div className="mt-3 pt-3 border-t" style={{ borderColor: 'var(--border)' }}>
                  <button
                    onClick={handleToggleDemoMode}
                    className="w-full flex items-center justify-between px-3 py-3 rounded-lg transition-all"
                    style={{
                      backgroundColor: isDemoMode ? 'rgba(245, 158, 11, 0.1)' : 'var(--secondary)',
                      color: isDemoMode ? 'var(--warning)' : 'var(--muted-foreground)',
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <FlaskConical className="h-4 w-4" />
                      <div>
                        <div className="font-medium text-sm">
                          {isDemoMode ? 'Demo Mode Active' : 'Enable Demo Mode'}
                        </div>
                        <div className="text-xs opacity-70">
                          {isDemoMode ? 'Click to disable' : 'Explore without backend'}
                        </div>
                      </div>
                    </div>
                    <div
                      className="w-8 h-5 rounded-full relative transition-colors"
                      style={{
                        backgroundColor: isDemoMode ? 'var(--warning)' : 'var(--muted)',
                      }}
                    >
                      <div
                        className="absolute top-0.5 w-4 h-4 rounded-full transition-all"
                        style={{
                          backgroundColor: 'var(--foreground)',
                          left: isDemoMode ? '14px' : '2px',
                        }}
                      />
                    </div>
                  </button>
                </div>
              </div>
            </nav>
          )}
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1">{children}</main>

      {/* Footer */}
      <footer
        className="border-t"
        style={{
          backgroundColor: 'var(--card)',
          borderColor: 'var(--border)',
        }}
      >
        <div className="container py-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div
                className="flex items-center justify-center w-6 h-6 rounded"
                style={{ backgroundColor: 'var(--secondary)' }}
              >
                <Coffee className="h-3 w-3" style={{ color: 'var(--primary)' }} />
              </div>
              <span className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
                Expresso Engineering Playground
              </span>
            </div>
            <div className="flex items-center gap-4 text-xs" style={{ color: 'var(--muted-foreground)' }}>
              <Link
                href="/dev"
                className="transition-colors hover:opacity-80"
                style={{ color: 'var(--muted-foreground)' }}
              >
                API Debug
              </Link>
              <span style={{ color: 'var(--border)' }}>|</span>
              <Link
                href="/performance"
                className="transition-colors hover:opacity-80"
                style={{ color: 'var(--muted-foreground)' }}
              >
                Performance
              </Link>
              <span style={{ color: 'var(--border)' }}>|</span>
              <span>v1.0</span>
            </div>
          </div>
        </div>
      </footer>

      {/* Cart Drawer */}
      <CartDrawer open={cartOpen} onClose={() => setCartOpen(false)} />
    </div>
  );
}
