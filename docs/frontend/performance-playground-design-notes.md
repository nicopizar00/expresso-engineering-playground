# Performance Playground Design Notes

## Purpose

The Performance Playground is a frontend experience designed to visually communicate system behavior under concurrent web service requests. It shows "the system breathing under load" — not a traditional monitoring dashboard or complex observability interface.

## Design Principle

**Simple, elegant, understandable.**

The goal is to help reviewers and stakeholders understand how concurrent service requests affect the Expresso Engineering Playground system, without requiring deep infrastructure knowledge.

## Route

- **URL:** `/performance`
- **Name:** Performance Playground
- **Navigation:** Listed between Orders and 3D Visualizer (engineering flow, not commerce flow)

## Visual Model

### KPI Strip
A compact horizontal strip showing key metrics:
- Virtual Users
- Requests/sec
- p95 Latency
- Error Rate
- Success Rate
- Active Scenario

### Service Activity Cards
Six cards representing system services:
- **BFF Gateway** - Entry point for all traffic
- **Catalog** - Product browsing
- **Cart** - Shopping cart operations
- **Checkout** - Order placement
- **Orders** - Order lookup and management
- **Persistence** - Database layer

Each card shows:
- Current activity (req/s)
- p95 latency
- Error rate
- Active connections
- Health state (Healthy/Degraded/Critical/Idle)
- Pressure bar visualization

### Request Flow Diagram
A clean 2D visualization showing:
```
Users → BFF Gateway → [Services] → Persistence
```
- Animated dots represent request flow
- Connection lines show traffic volume
- Service cards show per-service metrics

### Scenario Selector
Six deterministic mock scenarios:
1. **Browsing Load** (low) - Catalog views, light cart activity
2. **Checkout Spike** (high) - Flash sale simulation
3. **Mixed User Journey** (medium) - Realistic user mix
4. **Catalog Stress** (stress) - Heavy read load
5. **Order Lookup Pressure** (medium) - Post-promotion order checks
6. **Error Injection** (low) - Degraded state simulation

Each scenario shows:
- Description
- Virtual users count
- Request rate
- Duration
- Intensity level
- Affected services

## Mock Scenarios

All data is deterministic and mock-driven. Scenarios are defined in:
```
src/lib/performance/mock-performance-data.ts
```

| Scenario | VUs | req/s | Duration | Intensity | Affected Services |
|----------|-----|-------|----------|-----------|-------------------|
| Browsing Load | 25 | 150 | 120s | Low | Catalog, BFF |
| Checkout Spike | 100 | 450 | 60s | High | Checkout, Cart, Orders, Persistence, BFF |
| Mixed User Journey | 50 | 280 | 180s | Medium | Catalog, Cart, Checkout, Orders, BFF |
| Catalog Stress | 200 | 800 | 90s | Stress | Catalog, BFF, Persistence |
| Order Lookup Pressure | 75 | 320 | 120s | Medium | Orders, BFF, Persistence |
| Error Injection | 30 | 100 | 60s | Low | All services |

## Future k6 Integration

The adapter layer is designed for future k6 integration:

### Expected Data Source
```bash
k6 run --out json=report.json scenario.js
```

### k6 JSON Summary Format
```json
{
  "metrics": {
    "http_req_duration": { "avg": 45.2, "p(95)": 120.5 },
    "http_reqs": { "count": 15000, "rate": 250.0 },
    "http_req_failed": { "rate": 0.02 }
  }
}
```

### Integration Points
- `src/lib/performance/performance-adapter.ts` - Main adapter interface
- `TODO(api-wire)` comments mark integration points

## Future Grafana Integration

### Expected Data Source
```
GET /api/datasources/proxy/:id/api/v1/query_range
```

With PromQL queries for service metrics.

### Dashboard Links
Future versions will link directly to Grafana dashboards for:
- Service health overview
- Request latency histograms
- Error rate trends
- Resource utilization

## What Is NOT Implemented

Intentionally excluded from Design Pass 1:

1. **Real k6 execution** - No actual load testing
2. **Grafana embedding** - No iframe dashboards
3. **Real trace visualization** - No distributed tracing
4. **Service mesh topology** - No complex network maps
5. **Historical data** - No time-series storage
6. **Alerting** - No thresholds or notifications
7. **3D load visualization** - Reserved for future visualizer integration

## Architecture Boundaries Preserved

- No backend changes
- No new API endpoints
- No authentication
- No real payment flows
- No CI/CD integration
- No production observability
- No direct Grafana integration
- No real k6 execution
- 3D Visualizer remains standalone
- Demo/mock system preserved
- All existing routes preserved

## Component Structure

```
apps/web/
├── app/
│   └── performance/
│       └── page.tsx           # Main page component
├── src/
│   ├── components/
│   │   └── performance/
│   │       ├── ServiceActivityCard.tsx
│   │       ├── ScenarioSelector.tsx
│   │       ├── KPIStrip.tsx
│   │       ├── RequestFlowDiagram.tsx
│   │       └── FutureIntegrationPanel.tsx
│   └── lib/
│       └── performance/
│           ├── mock-performance-data.ts
│           └── performance-adapter.ts
```

## Accessibility

- All buttons have clear labels
- Scenario cards are keyboard accessible
- Status indicators use both color and text
- Loading/empty/error states are screen-reader friendly
- Animated elements are decorative, not essential
- Mobile layout is usable

## TODO Comments

Standard TODO markers for future work:
```typescript
// TODO(v0-export): Component ready for repository integration
// TODO(api-wire): Replace mock performance adapter
// TODO(state): Replace local scenario playback state
// TODO(types): Replace mock types with shared contracts
// TODO(error-handling): Connect real data error handling
```

## Risks and Follow-up

1. **Mock data fidelity** - Current scenarios are illustrative; real k6 output may differ
2. **Animation performance** - Many animated elements may impact low-end devices
3. **Metric accuracy** - Visual representations are simplified approximations
4. **Integration complexity** - Real k6/Grafana integration will require additional work
5. **State management** - Current polling approach may not scale to real-time data

## Visual Design

Consistent with the existing Expresso app:
- Warm coffee-shop identity
- Dark theme with espresso accents
- Clean card layouts
- Minimal dashboard feel
- Developer-friendly but approachable
- High readability and spacing
- Responsive design

## Testing Checklist

- [ ] Page loads without errors
- [ ] All scenarios can be started/stopped
- [ ] Service cards update when scenario runs
- [ ] Request flow diagram animates correctly
- [ ] KPI strip reflects active scenario
- [ ] Mobile layout is usable
- [ ] Keyboard navigation works
- [ ] Screen reader announces status changes
