# CLI reference

The playground ships three parallel CLIs. They cover the same operations
with different host prerequisites — pick the one that matches what you
have installed.

| CLI            | Host prerequisites          | Best for                                        |
| -------------- | --------------------------- | ----------------------------------------------- |
| `./dev`        | Docker + Python ≥ 3.9       | The README walkthrough. Zero Node on the host.  |
| `pnpm pg:*`    | + Node ≥ 20 + pnpm 9        | Contributors already running pnpm.              |
| `task`         | + `go-task` (Homebrew)      | Optional convenience wrapper over `pnpm pg:*`.  |

All three converge on `python3 -m pg` under the hood. Prisma migrate and seed
run inside the BFF dev-stage container — no host Node/Prisma needed even on the
`pnpm pg:*` path. See [`architecture/orchestrator-python.md`](architecture/orchestrator-python.md)
for the dispatch diagram.

## Command matrix

| Goal                          | `./dev` (Docker-only) | `pnpm pg:*`             | `task` wrapper      |
| ----------------------------- | --------------------- | ----------------------- | ------------------- |
| Validate prerequisites        | `./dev doctor`        | `pnpm pg:doctor`        | `task doctor`       |
| Start core stack              | `./dev up`            | `pnpm pg:up`            | `task up`           |
| Start + web app               | `./dev up web`        | `pnpm pg:up web`        | `task up:web`       |
| Start + visualizer            | `./dev up viz`        | `pnpm pg:up viz`        | `task up:viz`       |
| Start + Prisma Studio         | `./dev up admin`      | `pnpm pg:up admin`      | `task up:admin`     |
| Start + observability         | `./dev up obs`        | `pnpm pg:up obs`        | `task up:obs`       |
| Start everything              | `./dev up full`       | `pnpm pg:up full`       | `task up:full`      |
| Hot-reload dev (compose watch)| `./dev dev`           | `pnpm pg:dev`           | `task dev`          |
| Hot-reload dev on host        | — (host only)         | `pnpm pg:dev:host`      | `task dev:host`     |
| Service status                | `./dev status`        | `pnpm pg:status`        | `task status`       |
| Follow logs                   | `./dev logs`          | `pnpm pg:logs`          | `task logs`         |
| Endpoint smoke test (13 checks + SSE) | `./dev smoke`  | `pnpm pg:smoke`         | `task smoke`        |
| Seed database                 | `./dev seed`          | `pnpm pg:seed`          | `task seed`         |
| Stop services                 | `./dev down`          | `pnpm pg:down`          | `task down`         |
| Restart                       | `./dev restart`       | `pnpm pg:restart`       | `task restart`      |
| Print local URLs              | `./dev open`          | `pnpm pg:open`          | `task open`         |
| Python orchestrator tests     | —                     | `pnpm pg:test`          | `task pg:test`      |
| k6 smoke (Docker k6)          | `./dev perf:smoke`    | `pnpm pg:perf:smoke`    | `task perf:smoke`   |
| k6 checkout-flow              | —                     | `pnpm pg:perf:checkout-flow` | `task perf:checkout-flow` |
| k6 read-heavy                 | —                     | `pnpm pg:perf:read-heavy`    | `task perf:read-heavy`    |
| Open k6 HTML report           | `./dev perf:open-report` | `pnpm pg:perf:open-report` | `task perf:open-report` |
| Clear k6 reports              | `./dev perf:clean`    | `pnpm pg:perf:clean`    | `task perf:clean`   |

### Debugging (`hack`)

Daily-driver affordances over the live container stack. Require the relevant
profiles up. See [`architecture/orchestrator-python.md`](architecture/orchestrator-python.md#pg-hack).

| Goal | Command |
|---|---|
| Shell into a service | `./dev hack exec <svc>` (e.g. `bff`, `web`, `postgres`) |
| Diff container env vs root `.env` | `./dev hack env <svc>` |
| One-shot SQL against postgres | `./dev hack sql --query 'SELECT count(*) FROM "Product";'` |
| Trace a BFF request via Tempo | `./dev hack trace GET /catalog/products` (needs `up obs`) |

`./dev` does not yet expose `perf:checkout-flow` or `perf:read-heavy` —
use the `pnpm pg:*` equivalents, or invoke the k6 container directly:

```bash
docker compose -f infra/docker/compose.performance.yaml run --rm \
  -e BASE_URL=http://host.docker.internal:3001 \
  k6 run /scripts/scenarios/checkout-flow/checkout-flow.js
```

## Defaults

- `BFF_PORT=3001`, `WEB_PORT=3000`, `VIZ_PORT=3002`, `POSTGRES` on `5432`.
- All three CLIs honour the same env vars from the root `.env`.
- `compose.yaml` uses `${VAR:-default}` so the stack runs without a
  `.env` file (`./dev up` works on a clean clone). `./dev doctor` and
  `pnpm pg:doctor` still surface `.env` as a recommendation; create it
  with `cp .env.example .env`.

## Picking a CLI

- Following the README walkthrough → `./dev`.
- Contributing patches that touch host-side scripts → `pnpm pg:*`.
- Power user with `brew install go-task` → `task` (it just shells out
  to `pnpm pg:*`, so the prerequisites are the same as that path).
