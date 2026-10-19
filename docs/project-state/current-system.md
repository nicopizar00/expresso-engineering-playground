# Current system

> Status: Reviewed against HEAD 800ac16 by a fresh reader.

Expresso is a local-first mini-commerce playground with three application
runtimes: a Next.js web app, a NestJS backend-for-frontend (BFF), and a static
Three.js visualizer. PostgreSQL owns durable commerce and identity data. The
BFF keeps carts and several read caches in process memory.

Source anchors: `apps/web/app/page.tsx`, `apps/bff/src/app.module.ts`,
`apps/visualizer-3d/public/scene.js`, `apps/visualizer-3d/public/transport.js`,
`apps/bff/src/modules/checkout/checkout.service.ts`,
`apps/bff/src/modules/orders/orders.service.ts`,
`apps/bff/src/modules/cart/cart.service.ts`, `apps/bff/prisma/seed.ts`,
`apps/bff/src/core/session/session.service.ts`,
`apps/bff/src/core/auth/auth-session.service.ts`,
`apps/web/src/lib/api/expresso-api.ts`,
`apps/web/src/components/sections/PerformanceSection.tsx`,
`apps/bff/src/modules/assets/assets.service.ts`,
`apps/bff/src/modules/visualization/visualization.service.ts`,
`apps/bff/src/modules/health/health.service.ts`, `apps/bff/src/common/telemetry.ts`,
`infra/docker/compose.yaml`, `infra/k8s/kustomization.yaml`,
`infra/k8s/perf/punch/kustomization.yaml`, `infra/argocd/applications/`,
`vercel.json`, `scripts/pg/perf.py`, `scripts/pg/k8s_perf.py`,
`infra/observability/otel-collector-config.yaml`, and `tests/performance/k6/jobs/`.

This page owns the system summary. HTTP contracts live in the
[system reference](../reference/README.md), and implementation mechanisms live
in the [architecture index](../architecture/README.md).

## System boundary

The web app is the main browser entry point. Its only application route is
`/`; the `?tab=` query parameter selects the Catalog, Orders, Performance, or
API section without adding server routes.

| Runtime    | Default host address    | Responsibility                                                                                         |
| ---------- | ----------------------- | ------------------------------------------------------------------------------------------------------ |
| Web        | `http://localhost:3000` | User interface, same-origin BFF proxy, visualizer proxy, and frontend demo mode                        |
| BFF        | `http://localhost:3001` | HTTP contracts, session carts, authentication, checkout, orders, assets, and visualization projections |
| Visualizer | `http://localhost:3002` | Static 3D scene that consumes visualization snapshots and events                                       |

The browser normally reaches the BFF through `/api/bff/*` and the embedded
visualizer through `/viz/*`. The standalone visualizer reaches the BFF at its
configured API base. The [container map](../architecture/containers.md) owns
the complete Compose service and profile inventory.

## Product behavior

| Area                | Current behavior                                                                                                                                                   | Durable state                                  |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------- |
| Catalog             | The public API lists products and reads one product by ID. Seeding retains one product named Cup of Coffee.                                                        | PostgreSQL, then a BFF read cache              |
| Cart                | Each anonymous `sid` session can hold one product with quantity `1`. Update and removal requests for an existing item return a conflict.                           | BFF process memory                             |
| Authentication      | Registration and login create a database-backed `auth` session. Logout removes the presented session.                                                              | PostgreSQL and an HTTP-only cookie             |
| Checkout            | Checkout validates the cart reservation, optionally deduplicates by idempotency key, creates an order, and clears the cart. It performs no payment.                | PostgreSQL plus BFF read indexes               |
| Orders              | Callers can list all orders, list the anonymous session's orders, read an order, or read its temperature. Signed-in users have account order and hot-status views. | PostgreSQL plus a BFF list cache               |
| Assets              | Asset configuration and primary 3D model references load at BFF startup. A public refresh endpoint reloads those caches.                                           | PostgreSQL plus BFF caches                     |
| Visualization       | The BFF returns a full scene snapshot and an SSE stream. The scene carries all products, the 10 most recent orders, aggregate order counts, and asset metadata.    | Derived from BFF caches                        |
| Performance section | The web app animates local mock metrics and scenarios. It does not start k6 or read Grafana data.                                                                  | Browser process memory                         |
| API section         | The web app exposes developer controls and API diagnostics.                                                                                                        | Browser and BFF state, depending on the action |

The cart reservation lasts one hour. Expiration is checked when that cart is
accessed, so no background timer or scheduled job removes expired carts.
Restarting the BFF removes all carts.

Checkout accepts an optional `orderFor` choice. A signed-in caller can order
for self, any caller can create a guest order, and a caller can name a user by
normalized username or email. The recipient does not need to be registered at
checkout time.

Order temperature is derived from `placedAt`. An order remains hot for
`ORDER_COOL_DOWN_SECONDS`, which defaults to 300 seconds, and then reads as
cold. No scheduled process changes stored rows.

## Browser and session behavior

The BFF uses two independent cookies. The `sid` cookie identifies an anonymous
cart and session-owned orders. The `auth` cookie contains a random sign-in
token whose SHA-256 hash is stored in PostgreSQL.

Signing in does not replace or clear the anonymous cart. Signing out removes
the presented authentication session and leaves the cart unchanged. Expired
authentication rows are removed when their token is presented; no periodic
session sweep runs.

Frontend demo mode replaces BFF calls with local fixtures. A public build-time
setting can force the mode, and the browser can store a local override. The
performance section uses separate local mock data regardless of demo mode.

## Checkout and visualization flow

The cart issues a UUID reservation when the caller adds the one allowed item.
Checkout requires that UUID and rejects an empty, expired, or mismatched cart.
An optional UUID idempotency key returns the first order created for that key,
including after the original checkout cleared the cart.

A successful checkout writes the order and its lines in one database call,
clears the session cart, and emits an in-process domain change. The
visualization SSE endpoint coalesces nearby changes and sends a complete
snapshot after each event.

The visualizer opens SSE directly and receives its initial snapshot on that stream. If the stream
fails, it falls back to snapshot polling and retries the stream every five
seconds. The embedded web view also sends the current cart selection to the
visualizer with same-origin browser messaging.

The [process guide](../architecture/processes.md) traces checkout,
visualization refresh, and performance execution across their boundaries.

## State consistency

The catalog, order list, asset configuration, and primary model references are
cached in the BFF. Startup populates these caches from PostgreSQL. Normal BFF
writes update the relevant cache before emitting visualization changes.

Direct database writes bypass domain events and most caches. Account-order and
hot-status and individual order-status queries read PostgreSQL directly, while the general order list and
visualization projection read the order cache. Asset refresh reloads only the
asset caches and emits no visualization event. Browser reloads and snapshot
requests do not reload the catalog or order caches; those require a BFF restart.

The health endpoint reports BFF process status and uptime. Its database check
is always `skipped`, so container readiness does not prove that PostgreSQL is
reachable after startup.

## Runtime topologies

The local Compose core contains PostgreSQL, the BFF, and the OpenTelemetry
Collector. Optional profiles add the web app, visualizer, Prisma Studio, or the
Tempo, Prometheus, and Grafana observability stack.

The minikube application deployment contains PostgreSQL, the BFF, web app,
visualizer, and collector. A separate performance base installs Argo
Workflows, SeaweedFS as an S3-compatible artifact store, and nine thin
WorkflowTemplates, one per Punch job. The setup command separately enables minikube's registry
addon when it builds performance images.

Argo CD has two Applications. One syncs the performance platform, and the
other syncs the application overlay with a post-sync performance smoke run.
The repository also contains a web-only Vercel configuration; the CI workflow
does not deploy it.

## Observability and performance

The BFF starts OpenTelemetry instrumentation only when
`OTEL_EXPORTER_OTLP_ENDPOINT` is set. It configures Node auto-instrumentation
and an OTLP HTTP trace exporter; order creation and status reads add manual spans.
The local collector forwards traces to
Tempo and exposes metrics for Prometheus when those optional services run.

Performance tests are separate from the web performance section. Nine
repository-owned job definitions select k6 HTTP or browser scenarios.
Punch runs them through Docker Compose or submits them to Argo Workflows on
Kubernetes.

Local performance runs write datasets and reports under the test tree.
Kubernetes runs store datasets and run artifacts in the configured S3 bucket.
The [performance orchestrator guide](../performance/orchestrator.md) owns the
job and dataset contract.

## Deliberate limits and exposed quirks

- The catalog has no public create route even though an internal create method
  exists.
- Cart state is local to one BFF process and has no shared store. Checkout
  awaits persistence without locking the reservation, so concurrent requests
  with different or missing idempotency keys can create multiple orders.
- Idempotency keys are global rather than scoped to a session or account.
  Replay occurs before recipient and cart validation and echoes the requesting
  cart ID rather than a stored reservation ID.
- The anonymous session accepts any nonempty presented `sid` without checking
  its format or a server-side session registry.
- Cart responses carry a fixed `updatedAt` value rather than the mutation time.
- Checkout records an order without contacting a payment provider.
- The `POST /assets/refresh` route has no authentication guard.
- Authentication has no registration or login rate limit.
- No queue consumer, message broker, or scheduled application job is wired.
- Prisma Studio writes directly to PostgreSQL and bypasses BFF events.
- The visualizer loads Three.js from a public module CDN at browser runtime.
- The Punch source is a pinned Git submodule and is outside the parent commit's
  file tree.

Potential defects and documentation conflicts are recorded in
[findings.md](../findings.md). Evidence gaps are recorded in
[unknowns.md](../unknowns.md).
