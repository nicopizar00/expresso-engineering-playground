# Documentation findings

These findings record source behavior at HEAD `800ac16` that may be defective or misleading.
They are working notes for the repository owner. The documentation campaign
does not classify severity or change implementation.

- `apps/bff/src/modules/health/health.service.ts:15`: the comment defers the
  database probe until persistence exists, but the BFF uses Prisma and the
  endpoint still returns `checks.db: "skipped"` at line 25. Container health
  checks therefore prove process response only. Intent is unknown.
- `apps/bff/src/modules/assets/assets.controller.ts:8`: the route is described
  as an admin cache refresh, but lines 10-14 register it without an
  authentication or authorization guard. Intent is unknown.
- `apps/bff/src/modules/catalog/catalog.service.ts:55`: the service implements
  catalog creation and emits a visualization event, but the controller exposes
  only list and lookup routes at
  `apps/bff/src/modules/catalog/catalog.controller.ts:9`. A reference search
  found no production caller for creation outside this service. Intent is
  unknown.
- `tests/contract/package.json:7`: the contract-test command prints a TODO and
  exits successfully. The CI contract job invokes that command at
  `.github/workflows/ci.yml:193`, so the job does not perform provider or
  consumer verification.
- `.github/workflows/ci.yml:195`: the E2E smoke job prints a TODO at line 203.
  It does not start the stack or run Playwright.
- `tests/performance/k6/.env.example:23`: `REPORT_OUTPUT` is presented as a
  report destination, but no maintained first-party runtime reads it. Report
  paths come from the orchestrator and job definitions.
- `apps/web/src/components/cart/CartCheckoutPanel.tsx:74`: the customer-facing
  checkout request omits the optional idempotency key supported by the shared
  contract. A transport retry from this UI cannot request replay protection.
  Intent is unknown.
- `apps/bff/src/modules/checkout/checkout.service.ts:37`: replay resolves a
  global idempotency key before checking the requesting session's cart or
  recipient. It echoes the request's cart ID rather than a stored reservation
  ID. Intent is unknown.
- `apps/bff/src/modules/checkout/checkout.service.ts:80`: checkout awaits
  order persistence before clearing the cart at line 88, without locking the
  reservation. Concurrent requests with different or absent idempotency keys
  can create multiple orders from one reservation. This is inferred from the
  interleaving allowed by the source; no concurrent execution was reproduced.
- `infra/docker/compose.dev.yaml:48`: the web watch configuration syncs the
  app directory and rebuilds on its package manifest. It defines no sync rule
  for web component source or public assets. Intent is unknown.
