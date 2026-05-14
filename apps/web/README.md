# apps/web

Placeholder for the **Next.js** web application of the fictional travel
booking platform.

## Responsibility

- Public-facing trip search, booking, and order management UI.
- Consumes the BFF in [`apps/bff`](../bff/README.md).
- Imports shared types from `@travel-playground/shared-types` and contract
  definitions from `@travel-playground/contracts`.

## Status

Not implemented yet. This iteration only reserves the workspace.

## Next iteration TODOs

- [ ] Initialize Next.js (App Router) with TypeScript.
- [ ] Wire `next.config` to honor workspace packages.
- [ ] Add a minimal `/trips` route as a smoke target for E2E.
- [ ] Wire OpenTelemetry browser instrumentation placeholder.
- [ ] Add `vitest` for component tests.
