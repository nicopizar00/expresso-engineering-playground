# Documentation Hub

Single entry point for the mini-commerce engineering playground documentation.
This is the **hub**; every area below is a **spoke**. Start here, then follow
the one spoke that matches your task.

- Governance frame (conceptual / scope authority): [`../CODEX.md`](../CODEX.md)
- Execution frame (operational / build rules): [`../CLAUDE.md`](../CLAUDE.md)

## Read first

| If you want to… | Go to |
|---|---|
| Understand the live system (features + UX state) | [project-state/current-system.md](project-state/current-system.md) |
| Run the stack locally | [local-development.md](local-development.md) |
| Understand how the web app reaches the other services | [architecture/web-entry-point.md](architecture/web-entry-point.md) |
| Know which CLI command does what | [cli-reference.md](cli-reference.md) |

## Current system at a glance

- The **web app** (`http://localhost:3000`) is the single browser-facing entry
  point. The browser only ever talks to the web app.
- The web **server** proxies to the other containers over the internal Docker
  network: `/api/bff/*` → BFF, `/viz/*` → 3D visualizer.
- Catalog and orders are persisted (Prisma/PostgreSQL). Orders survive BFF
  restarts. The cart is intentionally in-memory and supports full CRUD.
- `/performance` is a mock-only design surface — no live telemetry, Grafana, or
  k6 data.
- Detailed, authoritative state lives in
  [project-state/current-system.md](project-state/current-system.md).

## Map (hub → spokes)

| Area | Index / key doc | Purpose |
|---|---|---|
| Current state | [project-state/current-system.md](project-state/current-system.md) | Authoritative snapshot of features and UX state |
| Current state | [project-state/frontend-wiring-status.md](project-state/frontend-wiring-status.md) | Backend surface and frontend wiring constraints |
| Architecture | [architecture/README.md](architecture/README.md) | Architecture index (current state) |
| Architecture | [architecture/web-entry-point.md](architecture/web-entry-point.md) | Web app as entry point + internal service proxy |
| Decisions | [adr/README.md](adr/README.md) | Architecture Decision Records (why we got here) |
| Local dev | [local-development.md](local-development.md) | Run, validate, and tear down the stack |
| CLI | [cli-reference.md](cli-reference.md) | `./dev` and `pnpm pg:*` command reference |
| Roadmap | [next-steps/README.md](next-steps/README.md) | Open threads and completed iterations |
| Quality | [quality-strategy/README.md](quality-strategy/README.md) | Testing and quality-gate strategy |
| Lifecycle | [lifecycle/README.md](lifecycle/README.md) | Build/run lifecycle notes |
| Frontend | [frontend/integration-readiness-summary.md](frontend/integration-readiness-summary.md) | Frontend integration rules and readiness |
| UAT | [uat/walkthrough-uat.md](uat/walkthrough-uat.md) | Manual acceptance walkthrough |

## Authoring rules

- All durable content is written in English.
- No real company, product, service names, URLs, IPs, or credentials.
- No AI attribution, generated-by text, or co-author trailers.
- "Current state" docs (`project-state/`, `architecture/`) describe what *is*;
  ADRs describe *why*. When a decision changes, update both.
