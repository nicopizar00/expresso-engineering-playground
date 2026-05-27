# Frontend Integration Readiness Summary

**Date:** 2026-05-27
**Status:** Ready for demo, integration-aligned

---

## 1. Routes/Screens

| Route | Component | Description |
|-------|-----------|-------------|
| `/` | `app/page.tsx` | Product catalog with category filtering |
| `/cart` | `app/cart/page.tsx` | Full cart view with checkout navigation |
| `/checkout` | `app/checkout/page.tsx` | Order placement with customer name input |
| `/orders` | `app/orders/page.tsx` | Persisted order list and detail navigation |
| `/orders/[orderId]` | `app/orders/[orderId]/page.tsx` | Order detail and management actions |
| `/visualizer` | `app/visualizer/page.tsx` | 3D visualizer integration page |
| `/performance` | `app/performance/page.tsx` | Simulated performance design surface with visible mock-data disclosure |
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

### Performance Components (`src/components/performance/`)
- `KPIStrip.tsx` - Simulated KPI display
- `ServiceActivityCard.tsx` - Mock service activity cards
- `RequestFlowDiagram.tsx` - Simulated request-flow presentation
- `ScenarioSelector.tsx` - Deterministic scenario controls
- `FutureIntegrationPanel.tsx` - Boundary disclosure and potential adapter notes

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
| GET | `/orders` | `orders.controller.ts` | VERIFIED |
| GET | `/visualization-data` | `visualization.controller.ts` | VERIFIED |

### Missing Endpoints (UI has workarounds)

| Method | Endpoint | UI Behavior |
|--------|----------|-------------|
| DELETE | `/cart/items/:id` | Buttons disabled with tooltip |
| PATCH | `/cart/items/:id` | Buttons disabled with tooltip |

---

## 4. Mock/Demo Mode Dependencies

### Demo Mode Toggle
- Enable via `NEXT_PUBLIC_DEMO_MODE=true` or localStorage toggle
- Banner displayed when active
- All API calls routed to mock implementations

### Mock Data (`src/lib/api/mock-data.ts`)
- 7 sample products (drinks, food, accessories)
- In-memory cart state with add operations
- In-memory order storage with status transitions
- Mock health report

### Local State
- Cart items accumulate in mock state (client-side only)
- Orders stored in Map (resets on page refresh)
- Demo mode preference in localStorage

### Performance Fixtures (`src/lib/performance/`)
- `/performance` uses deterministic scenario data independent of demo-mode API fixtures.
- Its adapter makes no BFF, k6, Grafana, or telemetry requests.
- Its presentation types stay local and do not extend `@mini-commerce/contracts`.

---

## 5. Assumptions Requiring Confirmation

### BFF Contract Alignment
- [ ] **Cart session strategy** - The BFF is currently single-user and
  in-memory; define future session ownership before multi-user behavior.
- [x] **Money format** - `amountMinor` is integer cents in shared contracts.
- [x] **Order listing** - `GET /orders` returns persisted orders.

### Missing Features (intentionally excluded)
- [ ] **Authentication** - No user login/registration implemented
- [ ] **Product images** - Using category icons as placeholders
- [ ] **Cart item updates** - No PATCH/DELETE endpoints exist
- [ ] **Search/pagination** - Products load all at once

### Type Synchronization
- [x] The web API client consumes `@mini-commerce/contracts`.
- [ ] The BFF still maintains local response interfaces; decide future
  provider-side contract enforcement.

---

## 6. Performance Playground Boundary

| Concern | Integrated Behavior |
|---------|---------------------|
| Data source | Deterministic frontend fixtures only |
| Runtime APIs | None added or consumed |
| Public contracts | No performance wire types added |
| Existing k6 scenarios | Remain runnable separately; not displayed by this page |
| Observable metrics | Potential later adapter work only |
| Validation | Manual UAT catalog in `apps/web/tests/uat/performance-playground.spec.ts` |

## 7. 3D Visualizer Integration

### Integrated Files

| File | Change |
|------|--------|
| `app/visualizer/page.tsx` | Visualizer integration page with iframe embed |
| `src/components/system/AppShell.tsx` | Includes the "3D" navigation link |
| `.env.example` | Documents `NEXT_PUBLIC_VISUALIZER_URL` |

### Deployment Expectations

The visualizer-3d is a **separate static artifact**:
- Deployed via nginx:alpine container (`apps/visualizer-3d/`)
- Docker-first: `./scripts/visualizer-up.sh` for local dev
- No npm/pnpm build step required - pure static files

### Environment Variable

```bash
# Required for iframe embedding
NEXT_PUBLIC_VISUALIZER_URL=http://localhost:3002

# Port 3002 is confirmed in ./dev script: VIZ_PORT="${VIZ_PORT:-3002}"
# Docker maps internal nginx port 80 → host port 3002

# Per-environment values:
# - Local: http://localhost:3002 (confirmed)
# - Staging: https://visualizer.staging.example.com (to be configured)
# - Production: https://visualizer.example.com (to be configured)
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

### Deployment & Embedding Risks

| Risk | Description | Mitigation |
|------|-------------|------------|
| **Environment URL mismatch** | NEXT_PUBLIC_VISUALIZER_URL must be set per environment. No default fallback in production. | Document required env vars in deployment runbook. Fail loudly if not set. |
| **X-Frame-Options / CSP** | Visualizer nginx may set headers blocking iframe embedding. | Ensure visualizer nginx config does not include `X-Frame-Options: DENY` or restrictive `frame-ancestors` CSP. |
| **HTTP/HTTPS mixed content** | If web app is HTTPS and visualizer URL is HTTP, browsers block the iframe. | Always deploy visualizer behind HTTPS in staging/prod. Local dev (localhost) is exempt. |
| **Docker/local port mismatch** | Local port 3002 is confirmed in `./dev` script. If user runs visualizer differently, embedding fails silently. | Document `./scripts/visualizer-up.sh` as canonical local start command. |
| **Iframe load failure detection** | Browser iframe `onerror` does not fire for HTTP 4xx/5xx or CORS blocks. | UI shows loading state; user can manually retry or open externally. Consider adding timeout-based "may have failed" hint. |

---

## 8. Frontend File Map

### Files to Export

```
apps/web/
├── app/
│   ├── globals.css          # Design tokens, animations
│   ├── layout.tsx           # Root layout with providers
│   ├── page.tsx             # Catalog page
│   ├── cart/page.tsx        # Cart page
│   ├── checkout/page.tsx    # Checkout page
│   ├── orders/page.tsx      # Persisted orders list page
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

### Performance Design Files

- `app/performance/page.tsx` - Mock-only route entry point.
- `src/components/performance/` - Scenario, KPI, service and disclosure UI.
- `src/lib/performance/` - Local deterministic fixture and adapter layer.
- `tests/uat/performance-playground.spec.ts` - Manual validation catalog.

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
