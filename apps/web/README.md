# apps/web

Next.js web application for the mini-commerce engineering playground.

## Responsibility

- Multi-page storefront and developer playground UI for interacting with the
  BFF endpoints.
- Consumes the BFF in [`apps/bff`](../bff/README.md).
- Consumes canonical HTTP wire types from `@mini-commerce/contracts` through
  the centralized `src/lib/api/expresso-api.ts` client.

## Status

Runnable with routes for catalog, cart, checkout, persisted order list and
detail, a standalone 3D visualizer embed, and `/dev` diagnostics. Demo mode
routes the API client to deterministic frontend fixtures when the BFF is not
running.

## Run locally

```bash
pnpm pg:dev
```

Then open http://localhost:3000.

## Data boundaries

- Real mode reads and mutates data through the BFF only.
- Catalog and orders persist through the BFF; cart resets when the BFF process
  restarts.
- Demo mode is browser-local validation data and must not be presented as
  persisted or live service state.

## Next iteration TODOs

- [ ] Add `vitest` for component tests.
- [ ] Wire OpenTelemetry browser instrumentation placeholder.
