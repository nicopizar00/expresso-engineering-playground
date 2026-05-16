# Frontend Readiness Tasks

> Tracking document for frontend stabilization and repository integration.
> Updated: 2025-01

## Overview

This document tracks the readiness status of frontend components, API integrations, and upcoming work. It is designed to help reviewers understand what is complete, what is prototype-only, and what dependencies exist.

**Mock catalog:** 7 products (Espresso, Latte, Water, Cookie, Sandwich, Notebook, Backpack)

**Mock scenarios:** happy, loading, empty, error, cart-filled, checkout-failure

**Visualizer states:** Controlled by `NEXT_PUBLIC_VISUALIZER_URL` env var (not mock scenarios)

---

## 1. Foundation

| Task | Status | Purpose | Assumption | Dependency | Next Action |
|------|--------|---------|------------|------------|-------------|
| App shell layout | Done | Consistent navigation and chrome | Current nav structure is stable | None | Export to repository |
| Design tokens (CSS variables) | Done | Theming support | Tokens match design system | Confirm final palette | Review with design team |
| Route structure | Done | Page organization | Current routes are final | None | Document in README |
| TypeScript config | Done | Type checking | Path alias `@/` is preferred | None | None |
| Demo mode toggle | Done | Backend-free exploration | Toggle remains dev-only | None | None |

---

## 2. API Integration

| Task | Status | Purpose | Assumption | Dependency | Next Action |
|------|--------|---------|------------|------------|-------------|
| GET /health | Done | Health monitoring | Endpoint is stable | BFF running | None |
| GET /catalog/products | Done | Product listing | Response shape is final | BFF running | None |
| GET /catalog/products/:id | Done | Product detail | Response shape is final | BFF running | None |
| GET /cart | Done | Cart retrieval | Session/cookie strategy TBD | BFF cart module | Confirm session handling |
| POST /cart/items | Done | Add to cart | Session/cookie strategy TBD | BFF cart module | Confirm session handling |
| POST /checkout | Done | Place order | Customer name only | BFF checkout module | Add payment fields later |
| GET /orders/:id | Done | Order lookup | Response shape is final | BFF orders module | None |
| POST /orders/:id/manage | Done | Order management | Actions: cancel, update_status, mark_prepared | BFF orders module | None |
| DELETE /cart/items/:id | Blocked | Remove cart item | Not in BFF | BFF endpoint needed | Request BFF implementation |
| PATCH /cart/items/:id | Blocked | Update quantity | Not in BFF | BFF endpoint needed | Request BFF implementation |
| GET /orders | Blocked | Order listing | Not in BFF | BFF endpoint needed | Request BFF implementation |

---

## 3. State Management

| Task | Status | Purpose | Assumption | Dependency | Next Action |
|------|--------|---------|------------|------------|-------------|
| Cart context | Done | Client-side cart state | Local state is prototype-only | None | TODO(state): Replace with BFF session |
| Demo mode state | Done | Toggle mock/real API | localStorage toggle is acceptable | None | None |
| Mock scenario state | Done | Test different UI states | Module-level state is acceptable for demo | None | None |
| Product cache | Todo | Reduce API calls | SWR or similar | None | Add SWR hooks |
| Order cache | Todo | Reduce API calls | SWR or similar | None | Add SWR hooks |

---

## 4. UX Polish

| Task | Status | Purpose | Assumption | Dependency | Next Action |
|------|--------|---------|------------|------------|-------------|
| Loading skeletons | Done | Visual feedback | Current design is acceptable | None | None |
| Empty states | Done | Guidance when no data | Current design is acceptable | None | None |
| Error states | Done | Error recovery | Current design is acceptable | None | None |
| Toast notifications | Todo | Action feedback | None | None | Add toast component |
| Form validation | Todo | Input validation | Zod or similar | None | Add validation layer |
| Optimistic updates | Todo | Faster perceived performance | Cart is primary target | None | Add after state refactor |

---

## 5. Design System

| Task | Status | Purpose | Assumption | Dependency | Next Action |
|------|--------|---------|------------|------------|-------------|
| Color tokens | Done | Theming | Warm coffee palette | Design approval | None |
| Typography scale | Done | Consistent text | System font stack | Design approval | None |
| Spacing scale | Done | Consistent layout | Tailwind defaults | None | None |
| Component library | Ready | Reusable UI | Components are standalone | None | Export to shared package |
| Dark mode | Todo | User preference | Not required for MVP | Design tokens ready | Add theme toggle |

---

## 6. Accessibility

| Task | Status | Purpose | Assumption | Dependency | Next Action |
|------|--------|---------|------------|------------|-------------|
| Semantic HTML | Done | Screen reader support | Current markup is acceptable | None | Audit with axe |
| ARIA labels | Done | Screen reader support | Current labels are acceptable | None | Audit with axe |
| Keyboard navigation | Done | Non-mouse users | Focus management is acceptable | None | Test with keyboard-only |
| Focus management | Todo | Modal/drawer focus | None | None | Add focus trap to drawer |
| Color contrast | Ready | Visual accessibility | Current contrast passes WCAG AA | None | Verify with contrast checker |

---

## 7. Error Handling

| Task | Status | Purpose | Assumption | Dependency | Next Action |
|------|--------|---------|------------|------------|-------------|
| API error display | Done | User feedback | Current error banner is acceptable | None | None |
| Network error retry | Done | Recovery | Manual retry button is acceptable | None | Add automatic retry |
| Form error display | Todo | Validation feedback | None | Form validation | Add error states to forms |
| Global error boundary | Todo | Crash recovery | None | None | Add ErrorBoundary component |
| Error logging | Todo | Debugging | None | Observability decision | Placeholder only |

---

## 8. 3D Visualizer Integration

| Task | Status | Purpose | Assumption | Dependency | Next Action |
|------|--------|---------|------------|------------|-------------|
| Iframe embed | Done | Visualizer preview | NEXT_PUBLIC_VISUALIZER_URL set | Visualizer deployed | None |
| External link | Done | Open visualizer | URL is stable | Visualizer deployed | None |
| URL missing state | Done | Configuration guidance | Clear instructions shown | None | None |
| Load error state | Done | Graceful failure | Retry available | None | Add timeout detection |
| Architecture docs | Done | Developer understanding | Standalone app remains separate | None | None |

---

## 9. Performance (Placeholder)

| Task | Status | Purpose | Assumption | Dependency | Next Action |
|------|--------|---------|------------|------------|-------------|
| Bundle analysis | Todo | Size optimization | None | None | Add @next/bundle-analyzer |
| Image optimization | Todo | Load time | Next.js Image is available | None | Convert img to Image |
| Code splitting | Ready | Load time | Next.js handles automatically | None | None |
| Lighthouse audit | Todo | Performance baseline | None | None | Run audit |

---

## 10. Observability (Placeholder)

| Task | Status | Purpose | Assumption | Dependency | Next Action |
|------|--------|---------|------------|------------|-------------|
| Error tracking | Todo | Production debugging | None | Service decision | Integrate Sentry or similar |
| Analytics | Todo | Usage insights | None | Service decision | Integrate PostHog or similar |
| Performance monitoring | Todo | Production performance | None | Service decision | Integrate Vercel Analytics |

---

## 11. Repository Export Tasks

| Task | Status | Purpose | Assumption | Dependency | Next Action |
|------|--------|---------|------------|------------|-------------|
| Remove v0-specific comments | Todo | Clean export | Comments are marked with TODO(v0-export) | None | Search and clean |
| Type import from contracts | Todo | Type safety | @mini-commerce/contracts exists | Package published | Update imports |
| Environment variable docs | Done | Deployment | .env.example is complete | None | None |
| Component export | Ready | Shared library | Components are standalone | None | Copy to shared package |
| Integration summary | Done | Handoff documentation | Summary is accurate | None | Keep updated |

---

## Summary

**Ready for demo:** Catalog, cart, checkout, orders, health, visualizer embed, mock scenarios.

**Demo-only (BFF missing):** Cart item removal, cart quantity update, order listing.

**Intentionally not implemented:** Authentication, payments, analytics, observability, CI/CD.

**Key assumptions to confirm:**
1. Cart session strategy (cookies vs headers vs local state)
2. Type package promotion from BFF to shared contracts
3. Visualizer deployment URL per environment
4. Design system approval

---

*Last updated by v0 frontend stabilization pass.*
