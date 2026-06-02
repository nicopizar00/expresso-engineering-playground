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

1. **[UAT remediation](uat-remediation.md)** — *manual browser pass remaining*
   - Code blockers (order-detail 500, invalid-order 500, `pnpm pg:up full`
     `--profile` drift) are fixed and validated.
   - Remaining: R4 — a human/browser walkthrough of header/footer nav,
     cart-drawer pixels, Demo Mode scenarios, and `/dev` cards (now unblocked).
2. **[Expresso Order Counter](expresso-order-counter.md)** — *visualizer domain
   and art-direction evolution*
   - Turns the current "Hello Room" technical visualizer into a minimal
     coffee-shop order-counter scene.
   - Starts with Classic Expresso as the first domain-specific low-poly asset.
   - Requires semantic visualization data, recent-order focus, and aggregate
     history before broader arcade-world expansion.
3. **[PS1 Espresso Cup](ps1-espresso-cup.md)** — *Classic Expresso/Espresso
   asset certification*
   - WIP / beta implementation exists in `apps/visualizer-3d/public/scene.js`.
   - Pending artistic approval for ceramic color, saucer depth, coffee
     visibility, handle readability, scale, and icon-size clarity.

## Done

✅ **Observability — Tempo + Prometheus + Grafana minimum** — *shipped under
   `./dev up obs`*
   - `otel-collector` swapped to `otel-contrib:0.110.0`; traces fan out to
     Tempo, metrics to a Prometheus exporter scraped by Prometheus
   - Grafana 11.3 with pre-provisioned datasources and `BFF Overview` dashboard
   - `./dev hack trace` queries Tempo via its HTTP API
   - Topology: [`../architecture/observability.md`](../architecture/observability.md)
   - Remaining follow-ups (Loki, BFF metrics reader, alert rules):
     [observability-grafana.md](observability-grafana.md)

✅ **Python orchestrator** — *replaces `scripts/playground.mjs`*
   - Stdlib-only Python package at `scripts/pg/`
   - `./dev` is now a bash trampoline to `python3 -m pg`; `pnpm pg:*` and
     `task` chain into the same dispatcher
   - Adds `pg hack {exec,env,sql,trace}` debugging affordances
   - 13-check smoke (with SSE frame) replaces the previous 12-check version
   - CI adds a `python` job (ruff + unittest) and `lint-docker` (hadolint)
   - Doc: [`../architecture/orchestrator-python.md`](../architecture/orchestrator-python.md)
   - Original thread (kept for history): [orchestrator.md](orchestrator.md)

✅ **Visualizer reactivity** — *SSE primary, polling fallback shipped*
   - 3D scene connects to `GET /visualization-updates` and receives a full
     snapshot on connect and after domain mutations.
   - Falls back to polling `GET /visualization-data` every 2 s when SSE is
     unavailable.
   - In-flight guard, hidden-tab pause, focus reconnect, and reload-triggered
     reconnect are implemented.
   - HUD status includes `live (sse) · N items`, `live · N items`, `polling…`,
     `error · <reason>`, and `offline · N mock items`; source anchors removed.
   - Spec + variants: [visualizer-reactivity.md](visualizer-reactivity.md)

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
