# Frontend Integration Readiness Summary

**Date:** January 2025  
**Status:** Ready for demo, integration-aligned

---

## 1. Routes/Screens

| Route | Component | Description |
|-------|-----------|-------------|
| `/` | `app/page.tsx` | Product catalog with category filtering |
| `/cart` | `app/cart/page.tsx` | Full cart view with checkout navigation |
| `/checkout` | `app/checkout/page.tsx` | Order placement with customer name input |
| `/orders` | `app/orders/page.tsx` | Order lookup by ID (no list endpoint) |
| `/orders/[orderId]` | `app/orders/[orderId]/page.tsx` | Order detail and management actions |
| `/visualizer` | `app/visualizer/page.tsx` | 3D visualizer integration page |
| `/dev` | `app/dev/page.tsx` | API debug/testing interface |

---

## 2. Reusable Components

### System Components (`src/components/system/`)
- `AppShell.tsx` - Main layout wrapper with nav, footer, demo mode toggle
- `HealthBadge.tsx` - Real-time API health indicator
- `LoadingSkeleton.tsx` - Loading states (spinner, page, catalog grid)
- `EmptyState.tsx` - Empty state displays (cart, products, orders)
- `ErrorBanner.tsx` - Error states with retry actions

### Cart Components (`src/components/cart/`)
- `CartProvider.tsx` - Global cart state via React Context + SWR
- `CartDrawer.tsx` - Slide-over cart panel

### Catalog Components (`src/components/catalog/`)
- `ProductCard.tsx` - Individual product display with add-to-cart
- `ProductCatalogGrid.tsx` - Filterable product grid
- `ProductQuickView.tsx` - Product detail modal

---

## 3. API Calls (Real vs Mock)

### Verified BFF Endpoints (Real API)

| Method | Endpoint | Controller | Status |
|--------|----------|------------|--------|
| GET | `/health` | `health.controller.ts` | VERIFIED |
| GET | `/catalog/products` | `catalog.controller.ts` | VERIFIED |
| GET | `/catalog/products/:id` | `catalog.controller.ts` | VERIFIED |
| GET | `/cart` | `cart.controller.ts` | VERIFIED |
| POST | `/cart/items` | `cart.controller.ts` | VERIFIED |
| POST | `/checkout` | `checkout.controller.ts` | VERIFIED |
| GET | `/orders/:id` | `orders.controller.ts` | VERIFIED |
| POST | `/orders/:id/manage` | `orders.controller.ts` | VERIFIED |
| GET | `/visualization-data` | `visualization.controller.ts` | VERIFIED |

### Missing Endpoints (UI has workarounds)

| Method | Endpoint | UI Behavior |
|--------|----------|-------------|
| DELETE | `/cart/items/:id` | Buttons disabled with tooltip |
| PATCH | `/cart/items/:id` | Buttons disabled with tooltip |
| GET | `/orders` | Manual ID lookup page |

---

## 4. Mock/Demo Mode Dependencies

### Demo Mode Toggle
- Enable via `NEXT_PUBLIC_DEMO_MODE=true` or localStorage toggle
- Banner displayed when active
- All API calls routed to mock implementations

### Mock Data (`src/lib/api/mock-data.ts`)
- 10 sample products (drinks, food, accessories)
- In-memory cart state with add operations
- In-memory order storage with status transitions
- Mock health report

### Local State
- Cart items accumulate in mock state (client-side only)
- Orders stored in Map (resets on page refresh)
- Demo mode preference in localStorage

---

## 5. Assumptions Requiring Confirmation

### BFF Contract Alignment
- [ ] **Cart session strategy** - BFF uses cookies/headers for cart identification?
- [ ] **Product IDs** - Format matches `prod_*` pattern used in mocks?
- [ ] **Money format** - amountMinor is always cents (integer)?
- [ ] **Order status transitions** - Allowed: pending→preparing→prepared, any→cancelled?

### Missing Features (intentionally excluded)
- [ ] **Authentication** - No user login/registration implemented
- [ ] **Product images** - Using category icons as placeholders
- [ ] **Cart item updates** - No PATCH/DELETE endpoints exist
- [ ] **Order listing** - No GET /orders endpoint exists
- [ ] **Search/pagination** - Products load all at once

### Type Synchronization
- [ ] Types duplicated from BFF modules - should import from `@mini-commerce/contracts`?
- [ ] `Money` type matches `@mini-commerce/shared-types`?

---

## 6. 3D Visualizer Integration

### Files Created/Modified

| File | Change |
|------|--------|
| `app/visualizer/page.tsx` | NEW - Visualizer integration page with iframe embed |
| `src/components/system/AppShell.tsx` | MODIFIED - Added "3D" nav link |
| `.env.example` | MODIFIED - Added NEXT_PUBLIC_VISUALIZER_URL |

### Deployment Expectations

The visualizer-3d is a **separate static artifact**:
- Deployed via nginx:alpine container (`apps/visualizer-3d/`)
- Docker-first: `./scripts/visualizer-up.sh` for local dev
- No npm/pnpm build step required - pure static files

### Environment Variable

```bash
# Required for iframe embedding
NEXT_PUBLIC_VISUALIZER_URL=http://localhost:3002

# Per-environment values:
# - Local: http://localhost:3002
# - Staging: https://visualizer.staging.example.com
# - Production: https://visualizer.example.com
```

### BFF Endpoint Used by Visualizer

```
GET /visualization-data
```

- Defined in `apps/bff/src/modules/visualization/visualization.controller.ts`
- Returns `VisualizationDataResponse` with scene items
- Visualizer has built-in fallback mock data if BFF unreachable

### What Is NOT Integrated

| Feature | Reason |
|---------|--------|
| React Three Fiber | visualizer uses vanilla Three.js |
| Scene.js in Next.js | visualizer is separate artifact |
| 3D controls in React | visualizer owns its own UI |
| Visualization data transform | BFF owns the DTO shape |
| WebGL context sharing | Iframe boundary intentional |

### Pre-Merge Risks

1. **CORS** - Verify visualizer allows iframe embedding from web app origin
2. **URL mismatch** - Environment variable must match actual deployment URL
3. **BFF availability** - Visualizer degrades gracefully but shows mock data notice

---

## 7. Export Checklist (v0 → Repository)

### Files to Export

```
apps/web/
├── app/
│   ├── globals.css          # Design tokens, animations
│   ├── layout.tsx           # Root layout with providers
│   ├── page.tsx             # Catalog page
│   ├── cart/page.tsx        # Cart page
│   ├── checkout/page.tsx    # Checkout page
│   ├── orders/page.tsx      # Order lookup page
│   ├── orders/[orderId]/page.tsx  # Order detail page
│   ├── visualizer/page.tsx  # 3D Visualizer integration
│   └── dev/page.tsx         # API debug page
├── src/
│   ├── lib/api/
│   │   ├── expresso-api.ts  # API client with demo mode
│   │   └── mock-data.ts     # Mock data fixtures
│   └── components/
│       ├── system/          # All system components
│       ├── cart/            # All cart components
│       └── catalog/         # All catalog components
├── .env.example             # Environment variable template
└── tsconfig.json            # Path alias: @/* → src/*
```

### TODO Comments Reference

Search for these markers to find integration points:

- `TODO(api-wire)` - Pending BFF endpoint implementation
- `TODO(state)` - State management improvements
- `TODO(types)` - Type imports from contracts package
- `TODO(error-handling)` - Error handling improvements
- `TODO(v0-export)` - Export/refactoring suggestions

---

## Quick Start

```bash
# With BFF running
cd apps/web
pnpm dev

# Without BFF (demo mode)
NEXT_PUBLIC_DEMO_MODE=true pnpm dev

# Or enable via UI
# Click "Demo" button in header

# With 3D Visualizer
./scripts/visualizer-up.sh  # In another terminal
# Set NEXT_PUBLIC_VISUALIZER_URL=http://localhost:3002
```
