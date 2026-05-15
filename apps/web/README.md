# apps/web

Next.js web application for the mini-commerce engineering playground.

## Responsibility

- Simple, utilitarian playground UI for interacting with the BFF endpoints.
- Consumes the BFF in [`apps/bff`](../bff/README.md).
- Imports shared types from `@mini-commerce/shared-types` and contract
  definitions from `@mini-commerce/contracts` (once the contracts package
  ships types).

## Status

Runnable as a developer playground. Visual polish is intentionally not a
goal; the UI prioritizes manual interaction and validation of BFF endpoints.

## Run locally

```bash
pnpm pg:dev
```

Then open http://localhost:3000.

## Next iteration TODOs

- [ ] Wire `next.config` to honor workspace packages once contracts ship types.
- [ ] Add `vitest` for component tests.
- [ ] Wire OpenTelemetry browser instrumentation placeholder.
