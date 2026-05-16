# `components/cart`

v0.app-generated cart UI plus the hand-wired cart context.

Planned components:
- `CartProvider` + `useCart()` hook — hand-wired, owns refresh/state.
- `CartDrawer` (v0) — slide-over panel listing items, totals, checkout CTA.
- `CartLineItem` (v0).

Rules:
- The provider is the only place that calls `expressoApi.getCart()` and
  `expressoApi.addCartItem(...)`.
- v0 components receive everything via props or `useCart()`.
