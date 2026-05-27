# `components/cart`

Cart UI plus the hand-wired cart context.

Current components:
- `CartProvider` + `useCart()` hook — owns refresh/state.
- `CartDrawer` — slide-over panel listing items, totals, and checkout CTA.

Rules:
- The provider is the only place that calls `expressoApi.getCart()` and
  `expressoApi.addCartItem(...)`.
- Presentation components receive everything via props or `useCart()`.
- Cart state is transient in the real BFF; orders created through checkout
  persist separately.
