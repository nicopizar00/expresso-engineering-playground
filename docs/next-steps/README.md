# Next Steps

Open threads of work for this repo. Each file is self-contained — a future
session (human or Claude Code) can read one and have everything needed to
pick up the thread.

Anchors live in source code as `// TODO(next-steps/<topic>)` or
`# TODO(next-steps/<topic>)` comments. Find them all with:

```bash
grep -rn "next-steps/" --include='*.ts' --include='*.prisma' --include='*.mjs' --include='*.yaml' .
```

The count next to each entry below is the number of source anchors today.
When the count drops to zero, the topic is done.

## Open threads (priority order)

1. **[Visualizer reactivity](visualizer-reactivity.md)** — *5 anchors in source*
   - Promote the 3D visualizer from manual-reload to interval polling
     so browser mutations show up in 3D without clicking **Reload data**.
   - State document captures the polling spec plus future SSE /
     WebSocket variants for later iterations.
   - Anchors live in `*.js` / `*.html` — run
     `grep -rn "next-steps/visualizer-reactivity" apps/visualizer-3d/`
     (the default grep recipe only scans `*.ts`, `*.prisma`, `*.mjs`,
     `*.yaml`).

## Done

✅ **Unified web entry point** — *web app as the single browser-facing shell*
   - Containerized Next.js standalone server runs from Docker and is reachable
     at `http://localhost:3000` (fixed the monorepo standalone entrypoint path)
   - Browser talks only to the web app; the web server proxies `/api/bff/*` to
     the BFF and `/viz/*` to the visualizer over the internal Docker network
   - Cart gained full CRUD: `PATCH` / `DELETE /cart/items/:itemId`, wired into
     the cart drawer and `/cart` page (in-memory cart preserved)
   - State + topology: [../project-state/current-system.md](../project-state/current-system.md),
     [../architecture/web-entry-point.md](../architecture/web-entry-point.md)

✅ **OpenTelemetry SDK** — *wired in `feat/otel-sdk`*
   - `initTelemetry()` initializes NodeSDK + OTLP HTTP exporter
   - Auto-instrumentations: HTTP, Express, pg (fs disabled)
   - Resource attributes: `service.name=bff`, `service.version`, `deployment.environment`
   - Manual spans on `orders.create` and `orders.manage` with domain attributes
   - No-ops when `OTEL_EXPORTER_OTLP_ENDPOINT` is unset

✅ **k6 scenario library** — *added in `feat/k6-scenarios`*
   - `scenarios/checkout-flow/checkout-flow.js` — 1 VU write path, asserts real persisted orderId
   - `scenarios/read-heavy/read-heavy.js` — 30 VU ramping, all GET endpoints, baseline latency
   - `config/thresholds.js` extended with `checkoutFlowThresholds` + `readHeavyThresholds`
   - `pnpm pg:perf:checkout-flow` and `pnpm pg:perf:read-heavy` commands wired

✅ **[Orders persistence](orders-persistence.md)** — *0 anchors remaining*
   - `Order` + `OrderLine` Prisma models added to schema
   - Migration `20260516022844_init_orders` applied
   - `OrdersService` uses Prisma + warm sync cache via `OnModuleInit`
   - `listAll()` / `get()` remain synchronous (cache reads)
   - `create()` / `manage()` are async (write to DB, mutate cache)
   - `CheckoutService.checkout()` awaits `orders.create()`
   - `seed.ts` seeds `ord_demo` order
   - `GET /orders` list endpoint added; orders visible from browser without knowing ID
   - `orders.service.spec.ts` + `orders.controller.spec.ts` cover all paths

✅ **[Orchestrator wire-up](orchestrator.md)** — *0 anchors remaining*
   - Root `.env` centralizes all config (POSTGRES_USER, BFF_PORT, WEB_PORT, etc.)
   - `pnpm pg:up [core|web|viz|full]` with target profiles
   - `pnpm pg:dev` → docker compose watch (hot-reload for bff + web)
   - `pnpm pg:status` shows service health
   - Containerized web app + Dockerfile (Next.js standalone)
   - Auto-run `prisma migrate deploy` + `prisma db seed` on `pg:up`
   - Shell scripts shimmed to `pnpm pg:*` delegation
   - Development: `pnpm pg:dev:host` escape hatch for turbo run dev on host
