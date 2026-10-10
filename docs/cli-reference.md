# CLI reference

The playground ships three parallel CLIs. They cover the same operations
with different host prerequisites — pick the one that matches what you
have installed.

| CLI            | Host prerequisites          | Best for                                        |
| -------------- | --------------------------- | ----------------------------------------------- |
| `./dev`        | Docker + Python ≥ 3.9       | The local walkthrough. Zero Node on the host.   |
| `pnpm pg:*`    | + Node ≥ 20 + pnpm 9        | Contributors already running pnpm.              |
| `task`         | + `go-task` (Homebrew)      | Optional convenience wrapper over `pnpm pg:*`.  |

**Note:** This repo uses a git submodule (`vendor/punch/`) for shared
performance-testing tooling. After cloning, initialize it with `git submodule
update --init --recursive` before running `./dev perf:*` commands. Core
`scripts/pg/` remains standard-library-only; performance commands load
Punch's pinned PyYAML dependency, while its interactive menu also needs
`simple-term-menu` and `rich`. Install them from Punch's requirements:

```bash
python3 -m venv .cache/punch-venv
. .cache/punch-venv/bin/activate
python3 -m pip install -r vendor/punch/requirements.txt
```

The virtual environment works with externally managed Python installations,
including Homebrew. In a new shell, reactivate it or launch the menu with
`PATH=".cache/punch-venv/bin:$PATH" ./bin/punch`. The launcher checks for
these dependencies before offering the optional image build.

Build the image separately before a fresh or changed performance run:

```bash
docker compose -f infra/docker/compose.performance.yaml build k6
```

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
| Endpoint smoke test (23 checks + SSE) | `./dev smoke`  | `pnpm pg:smoke`         | `task smoke`        |
| Seed database                 | `./dev seed`          | `pnpm pg:seed`          | `task seed`         |
| Stop services                 | `./dev down`          | `pnpm pg:down`          | `task down`         |
| Restart                       | `./dev restart`       | `pnpm pg:restart`       | `task restart`      |
| Print local URLs              | `./dev open`          | `pnpm pg:open`          | `task open`         |
| Python orchestrator tests     | —                     | `pnpm pg:test`          | `task pg:test`      |
| k6 http-purchase (search → cart → checkout; load shape via `--config <preset\|path>`, default 5 iterations; CI runs `--config 1-iteration`) | `./dev perf:http-purchase` | `pnpm pg:perf:http-purchase` | `task perf:http-purchase` |
| k6 http-purchase driven by a real browser (Chromium via k6/browser, web app UI — not the BFF directly); `--config` needs a `*-browser` preset | `./dev perf:browser-purchase` | `pnpm pg:perf:browser-purchase` | `task perf:browser-purchase` |
| k6 http-cart (search → add to cart, stops before checkout, emits `[DATA carts]` rows), writes `data/carts.csv` only with `--produce carts` | `./dev perf:http-cart` | `pnpm pg:perf:http-cart` | `task perf:http-cart` |
| k6 http-cart driven by a real browser (Chromium via k6/browser, web app UI), stops before Place Order, emits `[DATA carts]` rows into the same `carts` dataset, writes it only with `--produce carts` | `./dev perf:browser-cart` | `pnpm pg:perf:browser-cart` | `task perf:browser-cart` |
| k6 http-orders (checks out carts reserved by http-cart or browser-cart via the `carts` dataset, verifies order + visualizer), fails before Docker if `carts` is missing; `--data carts=<path>` reads another file | `./dev perf:http-orders` | `pnpm pg:perf:http-orders` | `task perf:http-orders` |
| k6 http-orders-status (reads `GET /orders/:id/status` for each row of the `orders` dataset produced by http-orders / http-purchase / browser-purchase with `--produce orders`), `EXPECT_TEMPERATURE` (`auto`\|`hot`\|`cold`)/`ORDER_COOL_DOWN_SECONDS` env, fails before Docker if `orders` is missing | `./dev perf:http-orders-status` | `pnpm pg:perf:http-orders-status` | `task perf:http-orders-status` |
| k6 http-purchase-registered (anonymous orders for seeded demo users; produces `owned-orders` with `--produce owned-orders`), `USERS` env | `./dev perf:http-purchase-registered` | `pnpm pg:perf:http-purchase-registered` | `task perf:http-purchase-registered` |
| k6 http-auth-login (owners of `owned-orders` when present, else the seeded demo users; produces `auth-tokens` with `--produce auth-tokens`), `DEMO_PASSWORD` env | `./dev perf:http-auth-login` | `pnpm pg:perf:http-auth-login` | `task perf:http-auth-login` |
| k6 http-me-hot-status (`GET /me/hot-status` per `auth-tokens` row; shape checks), fails before Docker if `auth-tokens` is missing | `./dev perf:http-me-hot-status` | `pnpm pg:perf:http-me-hot-status` | `task perf:http-me-hot-status` |
| Open k6 HTML report           | `./dev perf:open-report` | `pnpm pg:perf:open-report` | `task perf:open-report` |
| Clear k6 reports              | `./dev perf:clean`    | `pnpm pg:perf:clean`    | `task perf:clean`   |
| Interactive k6 workflow picker | `./bin/punch` | — | — |

### Debugging (`hack`)

Daily-driver affordances over the live container stack. Require the relevant
profiles up. See [`architecture/orchestrator-python.md`](architecture/orchestrator-python.md#pg-hack).

| Goal | Command |
|---|---|
| Shell into a service | `./dev hack exec <svc>` (e.g. `bff`, `web`, `postgres`) |
| Diff container env vs root `.env` | `./dev hack env <svc>` |
| One-shot SQL against postgres | `./dev hack sql --query 'SELECT count(*) FROM "Product";'` |
| Trace a BFF request via Tempo | `./dev hack trace GET /products` (needs `up obs`) |

Each `perf:*` command selects one repository-owned YAML workflow. Punch
loads, validates, preflights any required dataset, confirms the Docker
Compose run itself (interactive terminals only — CI proceeds automatically),
then performs exactly one Docker Compose run, printing the k6 metrics from
`outputs.summary` on success. Do not replace that path with an ad-hoc Compose
command except while debugging the container itself; that is an escape hatch,
not the supported workflow path.

Workflows that produce a dataset (`spec.data.produces`) write it only when
the run passes `--produce <dataset>` (or `--produce all`), e.g.
`./dev perf:http-cart --produce carts`; an explicit `--produce` also skips
the Docker prompt. Consumers fail before Docker until their datasets exist and
accept `--data <dataset>=<path>` for an alternate file under
`tests/performance/k6/data/`.

`./bin/punch` first offers to run `docker compose build k6 k6-browser` (both
images, since the menu can select either service and hasn't picked a
workflow yet at that point). Answering No skips only the build and still
opens the interactive menu; answering Yes builds before workflow selection.
The menu picks and runs exactly one
workflow per invocation (no "run another?" loop). The launcher requires a
terminal and does not build when one is unavailable; use `./dev perf:*` for
non-interactive runs.

## Defaults

- `BFF_PORT=3001`, `WEB_PORT=3000`, `VIZ_PORT=3002`, `POSTGRES` on `5432`.
- All three CLIs honour the same env vars from the root `.env`.
- `compose.yaml` uses `${VAR:-default}` so the stack runs without a
  `.env` file (`./dev up` works on a clean clone). `./dev doctor` and
  `pnpm pg:doctor` still surface `.env` as a recommendation; create it
  with `cp .env.example .env`.

## Picking a CLI

- Following the [local walkthrough](local-development.md) → `./dev`.
- Contributing patches that touch host-side scripts → `pnpm pg:*`.
- Power user with `brew install go-task` → `task` (it just shells out
  to `pnpm pg:*`, so the prerequisites are the same as that path).
