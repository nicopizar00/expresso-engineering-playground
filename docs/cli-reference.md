# CLI reference

The playground ships three parallel CLIs. They cover the same operations
with different host prerequisites — pick the one that matches what you
have installed.

| CLI            | Host prerequisites          | Best for                                        |
| -------------- | --------------------------- | ----------------------------------------------- |
| `./dev`        | Docker + Python ≥ 3.9       | The README walkthrough. Zero Node on the host.  |
| `pnpm pg:*`    | + Node ≥ 20 + pnpm 9        | Contributors already running pnpm.              |
| `task`         | + `go-task` (Homebrew)      | Optional convenience wrapper over `pnpm pg:*`.  |

**Note:** This repo uses a git submodule (`vendor/punch/`) for shared
performance-testing tooling. After cloning, initialize it with `git submodule
update --init --recursive` before running `./dev perf:*` commands. Core
`scripts/pg/` remains standard-library-only; performance commands load
Punch's pinned PyYAML dependency, while its interactive menu also needs
`simple-term-menu`. Install both from Punch's requirements:

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
| Endpoint smoke test (13 checks + SSE) | `./dev smoke`  | `pnpm pg:smoke`         | `task smoke`        |
| Seed database                 | `./dev seed`          | `pnpm pg:seed`          | `task seed`         |
| Stop services                 | `./dev down`          | `pnpm pg:down`          | `task down`         |
| Restart                       | `./dev restart`       | `pnpm pg:restart`       | `task restart`      |
| Print local URLs              | `./dev open`          | `pnpm pg:open`          | `task open`         |
| Python orchestrator tests     | —                     | `pnpm pg:test`          | `task pg:test`      |
| k6 smoke (Docker k6)          | `./dev perf:smoke`    | `pnpm pg:perf:smoke`    | `task perf:smoke`   |
| k6 purchase-flow (search → cart → checkout, `VUS`/`DURATION` env) | `./dev perf:purchase-flow` | `pnpm pg:perf:purchase-flow` | `task perf:purchase-flow` |
| k6 purchase-flow driven by a real browser (Chromium via k6/browser, web app UI — not the BFF directly), `VUS`/`ITERATIONS` env | `./dev perf:purchase-flow-browser` | `pnpm pg:perf:purchase-flow-browser` | `task perf:purchase-flow-browser` |
| k6 cart-fulfill (search → add to cart, stops before checkout, emits `[CSV]` cart ids), `VUS`/`DURATION`/`ITERATIONS` env, needs `--confirm-output-data` non-interactively | `./dev perf:cart-fulfill` | `pnpm pg:perf:cart-fulfill` | `task perf:cart-fulfill` |
| k6 cart-fulfill driven by a real browser (Chromium via k6/browser, web app UI), stops before Place Order, emits `[CSV]` cart ids to the same file as cart-fulfill, `VUS`/`ITERATIONS` env, needs `--confirm-output-data` non-interactively | `./dev perf:cart-fulfill-browser` | `pnpm pg:perf:cart-fulfill-browser` | `task perf:cart-fulfill-browser` |
| k6 place-order (checks out carts reserved by cart-fulfill or cart-fulfill-browser via `data/cart-fulfill-carts.csv`, verifies order + visualizer), `VUS`/`ITERATIONS` env, fails fast if no cart data | `./dev perf:place-order` | `pnpm pg:perf:place-order` | `task perf:place-order` |
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
| Trace a BFF request via Tempo | `./dev hack trace GET /catalog/products` (needs `up obs`) |

Each `perf:*` command selects one repository-owned YAML workflow. Punch
loads, validates, confirms any declared data output, confirms the Docker
Compose run itself (interactive terminals only — CI proceeds automatically),
then performs exactly one Docker Compose run, printing the k6 metrics from
`outputs.summary` on success. Do not replace that path with an ad-hoc Compose
command except while debugging the container itself; that is an escape hatch,
not the supported workflow path.

`cart-fulfill` and `cart-fulfill-browser` declare `outputs.csv`. Add
`--confirm-output-data` for a non-interactive invocation; interactive runs ask
for confirmation before Compose starts.

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

- Following the README walkthrough → `./dev`.
- Contributing patches that touch host-side scripts → `pnpm pg:*`.
- Power user with `brew install go-task` → `task` (it just shells out
  to `pnpm pg:*`, so the prerequisites are the same as that path).
