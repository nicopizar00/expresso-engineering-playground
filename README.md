# Mini Commerce Engineering Playground

A small, runnable mini-commerce store (catalog → cart → checkout → orders →
3D visualizer) used as a sandbox for software engineering, testing,
observability, and performance practices. Today it is a modular monolith
(NestJS BFF + Next.js web + Three.js visualizer on Postgres); Phase 3 extracts
modules into services.

## Prerequisites

- **Docker** with Compose v2 (Docker Desktop on macOS; Docker Engine + the
  Compose plugin on Linux).
- **Python ≥ 3.9** on `PATH` (runs the `./dev` orchestrator).
- **jq** (optional, for the curl examples).

Node and pnpm are only needed for host-mode development — see
[`docs/local-development.md`](./docs/local-development.md#host-mode-node--pnpm).

## Quick start

```bash
cp .env.example .env                     # gitignored local config
git submodule update --init --recursive  # vendor/punch performance tooling
./dev doctor                             # check Docker, Python, ports
./dev up                                 # postgres + otel-collector + bff (migrate + seed)
./dev smoke                              # hit every BFF endpoint + one SSE frame
```

Expected final line:

```
All 23 smoke checks passed.
```

Add more of the stack with `./dev up web`, `./dev up viz`, `./dev up obs`, or
`./dev up full`. Stop with `./dev down`.

| URL                     | Service                             | Started by     |
| ----------------------- | ----------------------------------- | -------------- |
| <http://localhost:3000> | Web app (single-page shell)         | `./dev up web` |
| <http://localhost:3001> | BFF API (`/health`, `/products`, …) | `./dev up`     |
| <http://localhost:3002> | 3D visualizer (standalone)          | `./dev up viz` |
| <http://localhost:3030> | Grafana (admin/admin)               | `./dev up obs` |

## Performance testing with Punch

Load tests are k6 scenarios run by **Punch**, a workflow orchestrator vendored
as a git submodule at `vendor/punch/`. Each `./dev perf:<workflow>` picks one
YAML workflow; Punch validates it, plans its data, and runs it once through
Docker Compose. Punch needs its pinned Python dependency and the k6 image:

```bash
python3 -m pip install -r vendor/punch/requirements.txt
docker compose -f infra/docker/compose.performance.yaml build k6
./dev perf:http-purchase --config 1-iteration
```

Start from the [Punch integration and documentation index](./docs/architecture/punch-implementation.md):
how Expresso uses Punch, plus links to Punch's Reference Architecture and
Implementation Guide, README, specs, and validation contract. Expresso-side
workflows and datasets: [`docs/performance/orchestrator.md`](./docs/performance/orchestrator.md).

## Repository layout

```
apps/
  bff/             NestJS API
  web/             Next.js 14 App Router frontend
  visualizer-3d/   Static Three.js scene served via nginx
packages/          Shared TypeScript libraries
tests/             Cross-app suites (integration, contract, e2e, performance)
infra/             Docker Compose stacks + observability configs
scripts/pg/        Python orchestrator package (driven by ./dev)
vendor/punch/      Punch performance-workflow engine (git submodule)
docs/              Documentation hub
```

## Where to go next

- [`docs/local-development.md`](./docs/local-development.md) — full
  walkthrough (curl tour, web app, visualizer, hot reload, k6, teardown) and
  troubleshooting.
- [`docs/cli-reference.md`](./docs/cli-reference.md) — every `./dev`,
  `pnpm pg:*`, and `task` command side by side.
- [`docs/architecture/punch-implementation.md`](./docs/architecture/punch-implementation.md)
  — Punch integration and documentation index.
- [`docs/README.md`](./docs/README.md) — documentation hub.
- [`CLAUDE.md`](./CLAUDE.md) — Claude Code project guide.
