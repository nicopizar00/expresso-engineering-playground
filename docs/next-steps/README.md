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

1. **OpenTelemetry SDK** — wire the OTel SDK in `apps/bff/src/common/telemetry.ts`
   (currently a no-op placeholder). Add span instrumentation to at least one
   domain service. Required before k6 → Grafana dashboard work begins.

2. **k6 scenario library** — add `checkout-flow.js` and `read-heavy.js` scenarios
   under `tests/performance/k6/`. See `docs/project-state/k6-readiness.md` for
   the canonical skeleton and readiness checklist.

3. More coming — iterate as Phase 2 stabilizes.

## Done

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
