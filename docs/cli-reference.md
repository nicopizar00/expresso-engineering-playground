# CLI reference

The playground ships three parallel CLIs. They cover the same operations
with different host prerequisites — pick the one that matches what you
have installed.

| CLI            | Host prerequisites          | Best for                                        |
| -------------- | --------------------------- | ----------------------------------------------- |
| `./dev`        | Docker Desktop / Engine     | The README walkthrough. Zero Node on the host.  |
| `pnpm pg:*`    | Node ≥ 20 + pnpm 9 + Docker | Contributors already running pnpm.              |
| `task`         | `go-task` (Homebrew)        | Optional convenience wrapper over `pnpm pg:*`.  |

`./dev` runs every Node command (Prisma migrate, seed) inside the BFF
dev-stage container. `pnpm pg:*` invokes those same commands on the host.
The behavior is identical; the host footprint is not.

## Command matrix

| Goal                          | `./dev` (Docker-only) | `pnpm pg:*`             | `task` wrapper      |
| ----------------------------- | --------------------- | ----------------------- | ------------------- |
| Validate prerequisites        | `./dev doctor`        | `pnpm pg:doctor`        | `task doctor`       |
| Start core stack              | `./dev up`            | `pnpm pg:up`            | `task up`           |
| Start + web app               | `./dev up web`        | `pnpm pg:up web`        | `task up:web`       |
| Start + visualizer            | `./dev up viz`        | `pnpm pg:up viz`        | `task up:viz`       |
| Start everything              | `./dev up full`       | `pnpm pg:up full`       | `task up:full`      |
| Hot-reload dev (compose watch)| `./dev dev`           | `pnpm pg:dev`           | `task dev`          |
| Hot-reload dev on host        | — (host only)         | `pnpm pg:dev:host`      | `task dev:host`     |
| Service status                | `./dev status`        | `pnpm pg:status`        | `task status`       |
| Follow logs                   | `./dev logs`          | `pnpm pg:logs`          | `task logs`         |
| Endpoint smoke test           | `./dev smoke`         | `pnpm pg:smoke`         | `task smoke`        |
| Seed database                 | `./dev seed`          | `pnpm pg:seed`          | `task seed`         |
| Stop services                 | `./dev down`          | `pnpm pg:down`          | `task down`         |
| Restart                       | `./dev restart`       | `pnpm pg:restart`       | `task restart`      |
| Print local URLs              | `./dev open`          | `pnpm pg:open`          | `task open`         |
| k6 smoke (Docker k6)          | `./dev perf:smoke`    | `pnpm pg:perf:smoke`    | `task perf:smoke`   |
| k6 checkout-flow              | —                     | `pnpm pg:perf:checkout-flow` | `task perf:checkout-flow` |
| k6 read-heavy                 | —                     | `pnpm pg:perf:read-heavy`    | `task perf:read-heavy`    |
| Clear k6 reports              | `./dev perf:clean`    | `pnpm pg:perf:clean`    | `task perf:clean`   |

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
