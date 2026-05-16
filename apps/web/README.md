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

## Demo mode (no BFF required)

Set `NEXT_PUBLIC_DEMO_MODE=true` and the web app serves entirely from
`apps/web/src/lib/api/mock-data.ts` — no BFF, no Postgres needed. Six
scenarios are available (happy / loading / empty / error / cart-filled
/ checkout-failure), togglable via `localStorage`.

## Vercel deployment

The `feat/v0-demo` branch is the Vercel publish target. It carries a
root `vercel.json` that forces `NEXT_PUBLIC_DEMO_MODE=true` at build
time, so the deployed app runs purely on mock data. To publish:

1. Import the repo in Vercel and select the `feat/v0-demo` branch as
   the production branch.
2. Vercel auto-detects Next.js and uses the `buildCommand`,
   `outputDirectory`, and `build.env` from `vercel.json`.
3. No backend or database is provisioned for this branch — the deploy
   is a pure frontend preview.

## Next iteration TODOs

- [ ] Wire `next.config` to honor workspace packages once contracts ship types.
- [ ] Add `vitest` for component tests.
- [ ] Wire OpenTelemetry browser instrumentation placeholder.
