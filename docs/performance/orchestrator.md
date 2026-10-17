# Performance Orchestrator

The repository-owned performance layer selects k6 workflows; Punch owns the
generic workflow engine. This is the canonical design for `./dev perf:*`,
`tests/performance/k6/workflows/`, and CI's k6 gate (one `http-purchase` iteration and one
three-step chain).

## Prerequisites and ownership

Core `scripts/pg/` uses only the Python standard library. The performance
commands are the deliberate exception at their dependency boundary: they load
Punch's public YAML API, which requires the pinned dependency installed from
the initialized submodule.

```bash
git submodule update --init --recursive
python3 -m venv .cache/punch-venv
. .cache/punch-venv/bin/activate
python3 -m pip install -r vendor/punch/requirements.txt
docker compose -f infra/docker/compose.performance.yaml build k6
```

Expresso owns its TypeScript scenarios (BFF-targeting and, for
browser-purchase/browser-cart, web-app-targeting), their build
entries, and the workflow YAML files. Punch owns YAML loading and validation,
the `spec.data` dataset contract (produce opt-in, harvesting, atomic
publication, consumer preflight, container path injection), Compose command
construction, and stream handling. The adapter in `scripts/pg/k6runner.py`
only selects a named repository workflow, passes `--produce`/`--data`
through, and presents its result; `scripts/pg/perf.py` holds no
dataset-specific code.

## Execution path

```text
./dev perf:* -> repository YAML -> Punch load/validate/confirm ->
one docker compose run -> stdout/stderr log + existing HTML/JSON + opted-in datasets
```

For a selected workflow, Punch constructs exactly one explicit `docker compose
--project-directory ... -f ... run --rm k6 k6 run ...` command. Building the
image, starting the BFF, collecting logs, and cleanup are separate operations.
CI therefore builds the `k6` image first, then invokes `./dev perf:http-purchase` and
`./dev perf:chain`; it does not recreate the Compose command in workflow YAML.

The baked image contains compiled scenario code. Existing scenario
`handleSummary` behavior continues to write the HTML and JSON reports under
`tests/performance/k6/reports/`; Punch also records the selected run's stdout
and stderr log in `reports/logs/`.

Existing CSV, HTML, or JSON files are **not current-run evidence**: they can
belong to an earlier run. The Punch execution result (selected workflow, child
exit status, pass/failure state, and dataset row counts when applicable) together with
the matching stdout/stderr log is the current-run evidence record. Inspect
that result and record before treating generated artifacts as evidence.

## Repository workflow mapping

There are nine YAML files, exactly one for every TypeScript k6 build entry.
All nine select `infra/docker/compose.performance.yaml` and forward
`BASE_URL`. `http-orders-status` also forwards `EXPECT_TEMPERATURE`
(`auto`|`hot`|`cold`) and `ORDER_COOL_DOWN_SECONDS` (must match the BFF's);
the hot-status load chain adds `USERS` (`http-purchase-registered`) and
`DEMO_PASSWORD` (`http-auth-login`), all on service `k6`.

### Load shape (`k6 run --config`)

No load shape travels as an environment variable. Each workflow names a
native k6 options JSON in `spec.k6.config` —
`tests/performance/k6/options/5-iterations.json` (1 VU, 5 shared iterations,
5m `maxDuration`), or `5-iterations-browser.json` for `browser-purchase` and
`browser-cart`, whose scenario must also set `options.browser.type:
chromium`. Punch bind-mounts the selected file read-only at
`/punch/k6-config.json` and appends `--config /punch/k6-config.json` to
`k6 run`. `./dev perf:<id> --config <preset|path>` replaces the default for one
run: a bare name resolves to `tests/performance/k6/options/<name>.json`,
anything else is a JSON path. The scenarios export only `thresholds` and
`tags` — in k6, script `options` outrank `--config`, so an exported
`scenarios`/`vus`/`iterations`/`duration` would silently win. A
contract test (`scripts/pg/tests/test_k6_workflows.py`) enforces both sides.

`http-purchase`, `http-cart`, `http-orders`, and `http-orders-status` select service
`k6` (bare `grafana/k6` image, the BFF as target). `browser-purchase`
and `browser-cart` select service `k6-browser` instead — a separate
image
([`infra/docker/k6-browser.Dockerfile`](../../infra/docker/k6-browser.Dockerfile),
layered on Grafana's official `-with-browser` Chromium-bundled tag) and a
different target (the web app, not the BFF) — see
[`tests/performance/k6/README.md`](../../tests/performance/k6/README.md#run-the-browser-variant).

| Build entry | Workflow YAML | Container script |
| --- | --- | --- |
| `scenarios/browser-cart/browser-cart.ts` | `workflows/browser-cart.yaml` | `/scripts/scenarios/browser-cart/browser-cart.js` |
| `scenarios/browser-purchase/browser-purchase.ts` | `workflows/browser-purchase.yaml` | `/scripts/scenarios/browser-purchase/browser-purchase.js` |
| `scenarios/http-auth-login/http-auth-login.ts` | `workflows/http-auth-login.yaml` | `/scripts/scenarios/http-auth-login/http-auth-login.js` |
| `scenarios/http-cart/http-cart.ts` | `workflows/http-cart.yaml` | `/scripts/scenarios/http-cart/http-cart.js` |
| `scenarios/http-me-hot-status/http-me-hot-status.ts` | `workflows/http-me-hot-status.yaml` | `/scripts/scenarios/http-me-hot-status/http-me-hot-status.js` |
| `scenarios/http-orders/http-orders.ts` | `workflows/http-orders.yaml` | `/scripts/scenarios/http-orders/http-orders.js` |
| `scenarios/http-orders-status/http-orders-status.ts` | `workflows/http-orders-status.yaml` | `/scripts/scenarios/http-orders-status/http-orders-status.js` |
| `scenarios/http-purchase/http-purchase.ts` | `workflows/http-purchase.yaml` | `/scripts/scenarios/http-purchase/http-purchase.js` |
| `scenarios/http-purchase-registered/http-purchase-registered.ts` | `workflows/http-purchase-registered.yaml` | `/scripts/scenarios/http-purchase-registered/http-purchase-registered.js` |

Each ID is the same string everywhere: YAML stem, `metadata.name`, scenario
directory and file, report file, and `./dev perf:<id>`. Do not add a second workflow for a build entry or add an ad-hoc
script path to `perf.py`.

## Data pipeline (`spec.data`)

Workflows hand data to each other through named datasets. A workflow
declares what it produces (with columns and the target workflows that consume
it) and what it requires:

```yaml
spec:
  data:
    directory: tests/performance/k6/data   # host dir (gitignored)
    mountedAt: /scripts/data               # same dir inside k6 / k6-browser
    produces:
      - dataset: carts
        columns: [cartId, productId, sid]
        targets: [http-orders]
    requires: [carts]                      # consumer side
```

- **Producing.** A scenario prints `[DATA <dataset>] <csv payload>` on stdout.
  Punch writes those rows to `<directory>/<dataset>.csv` (header from
  `columns`) **only when the run opts in** with `--produce <dataset>` (or
  `--produce all`); without it the lines stay in the log and no file is
  written. Each row must match the declared column count; stderr is never
  harvested.
- **Atomic publication.** Rows go to a same-directory temporary file that
  atomically replaces the destination only after a successful process exit
  with at least one valid row. A zero-row run, a malformed or undeclared
  record, or a failed process fails the workflow and leaves the previous file
  untouched.
- **Consuming.** Before Docker starts, every required dataset file must exist
  with at least one row, or the run fails naming its producers (e.g.
  `http-orders requires "carts"; produce it with: http-cart,
  browser-cart (--produce carts)`). Punch injects
  `DATA_<DATASET>_CSV=<container path>`; `--data <dataset>=<path>` reads an
  alternate file beneath `directory`, and `--data <dataset>=default` leaves an
  optional dataset on the scenario's built-in data. After the run, an interactive terminal is
  asked whether to delete each consumed file; non-interactive runs keep it.
- **Links are checked.** All workflow YAMLs in `workflows/` form one catalog:
  every target must exist and require the dataset, every required dataset
  must have a producer, and producers of one dataset must declare identical
  columns. A broken link fails before Docker.

Current datasets:

| Dataset | Columns | Producers | Consumers |
| --- | --- | --- | --- |
| `carts` | `cartId,productId,sid` | `http-cart`, `browser-cart` | `http-orders` |
| `orders` | `orderId` | `http-orders`, `http-purchase`, `browser-purchase` | `http-orders-status` |
| `owned-orders` | `orderId,username,email` | `http-purchase-registered` | `http-auth-login` (optional) |
| `auth-tokens` | `username,authToken` | `http-auth-login` | `http-me-hot-status` |

An optional dataset (`spec.data.optional`) is used when its file has rows and
skipped otherwise; `http-auth-login` falls back to the seeded demo users.

`carts` carries the BFF session cookie `sid` because the cart is
session-scoped; `http-orders` replays it via `http.cookieJar().set(...)`
before checkout. `browser-cart` reads `productId` from the add button's
`data-product-id`, so its rows carry the same three columns. `orders`
rows are emitted only after the producer verified the order; the browser
producer reads the id from the rendered orders section, since k6's browser
module cannot read the checkout response. `http-orders-status` reads
`GET /orders/:id/status` (a direct Postgres read in the BFF) per row and checks
the hot/cold temperature.

### Sizing for a target (`spec.sizing`)

A workflow may declare `spec.sizing` (`iterationSeconds`, `maxSeconds`,
`margin`). Punch sizes a producer for a target in its `produces[].targets`:
rows needed come from the target's k6 config (`iterations` for
`shared-iterations`, or `vus` × `duration` / `iterationSeconds` for a
`constant-vus` soak), and the producer runs a generated copy of its own
config with `⌈rows × (1 + margin)⌉` shared iterations and enough VUs to fit
`maxSeconds`, still in one Compose run. Entry points: the menu's
`Size for a target workflow` mode and `punch run --size-for <target>
[--config <target config>]`.
Contract: `vendor/punch/docs/specs/spec-target-data-sizing.md`.

## Chains (`perf:chain`)

`./dev perf:chain` runs workflows in order as one command; each step reads the
datasets that earlier steps wrote. The `perf-run` and `perf-chain` GitHub
workflows run the same planner on demand against the stack on their runner
([GitHub Actions](#github-actions-perf-run-and-perf-chain)). CI's
`perf-smoke` job runs `http-cart`, `http-orders`, and `http-orders-status` as
a chain on pushes and pull requests to `main`.

```bash
./dev perf:chain http-cart http-orders:5-vu-5m       # http-cart sized for http-orders
./dev perf:chain --plan browser-cart http-orders     # validate and size, no Docker
./dev perf:chain --plan --spec tests/performance/k6/reports/dispatch/spec.json   # a spec from perf:dispatch
```

A step is `<workflow>[:<shape>]`. The shape is a preset stem from
`tests/performance/k6/options/` or `auto`, the default. The whole chain is
planned before Docker starts (`scripts/pg/perf_chain.py`):

- Steps fill from step 1; `none` marks an empty step and may only trail. A
  gap fails the plan.
- A step reads each required dataset from the latest earlier step that
  writes it. With no earlier writer the plan fails and names the producers.
- Only a writer whose dataset a later step reads runs with `--produce`.
- An optional dataset that no earlier step writes uses the scenario's
  built-in data (`--data <dataset>=default`).
- `auto` sizes a writer for the first later step that reads its data and is
  one of its `targets`, resolving from the last step back; any other `auto`
  step runs its `spec.k6.config`. When Punch cannot size a pair, the plan
  warns and keeps the workflow's config.
- A browser step runs the preset's `-browser` variant; a shape without one
  (`1-vu-5m`, `5-vu-5m`) fails the plan.
- A sized browser step needs at most 4 VUs, or the plan fails and asks for a
  smaller shape on the reading step. The cap is a starting value for a
  4-vCPU runner that also runs the app; it is not measured.
- Every other browser step's resolved config (preset, custom, or the
  workflow's own) must also peak at 4 VUs or fewer. The planner sums the
  scenarios' peak VUs as if they ran at once, and rejects a config whose peak
  it cannot calculate.
- `--spec <path>` reads the steps from a versioned spec file instead of the
  arguments; a relative path is read from the repository root. A spec step's
  load is `auto`, a preset, or a custom k6 options JSON beneath
  `tests/performance/k6/options/`. `scripts/pg/perf_spec.py` defines the
  format and the path rules.

Because every dataset a step reads was written earlier in the same chain or
comes from the built-in default, a chain never reads a file left by an
earlier run. Steps run non-interactively: no Docker prompt and no offer to
delete consumed data. The chain stops at the first failed step. A writer that
wrote fewer rows than its reader reads prints a warning, and the reader
repeats rows.

`tests/performance/k6/reports/chain/` holds the chain's evidence record,
`chain.json` (each step's plan, status, exit code, rows written, sizing, k6
summary metrics, each threshold's expression and result, and the metrics k6
emitted), `summary.md` (rendered from `chain.json`), each sized step's
generated k6 config, and `step-<n>-<workflow>/` with the log, JSON summary,
and HTML report each step wrote during this run. The summary shows a metric
k6 did not emit as "not emitted", not as zero.

## GitHub Actions (`perf-run` and `perf-chain`)

Two manual forms in the Actions tab run Punch workflows against the Expresso
stack on one GitHub-hosted runner. Both call `_perf-execute.yml`, which
validates the form values, plans before Docker, runs that exact plan, and
uploads one artifact.

| Workflow file    | Inputs                                                     | Runs                                                                      |
| ---------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------- |
| `perf-run.yml`   | Workflow, load, custom config                              | One workflow that requires no dataset                                     |
| `perf-chain.yml` | Sequence, then a load and a custom config for steps 1 to 4 | One recipe: a producer and the consumers that read its data, 2 to 4 steps |

The workflow and sequence lists come from the catalog. A recipe is an acyclic
path of two to four workflows that starts at a workflow requiring no dataset,
where each link is a dataset the producer writes for that consumer (named in
its `targets`) and the consumer requires or reads optionally, and that
`perf:chain` plans with every step on `auto`. `./dev perf:forms --write`
rewrites the generated option blocks; `--check` fails when they differ from
the catalog, and the Python tests run the same check.

| Load label                                      | Meaning                                                                  |
| ----------------------------------------------- | ------------------------------------------------------------------------ |
| `Auto (data-size producer; default otherwise)`  | `auto`: sized for the step that reads its data, else `spec.k6.config`    |
| `1 journey`, `5 journeys`                       | Presets `1-iteration`, `5-iterations`; browser steps run `-browser` ones |
| `1 user for 5 minutes`, `5 users for 5 minutes` | Presets `1-vu-5m`, `5-vu-5m`; refused for browser steps                  |
| `Custom config`                                 | The committed JSON at the step's custom config path                      |

A custom config path is relative to `tests/performance/k6/options/`, for
example `custom/status-regression.json`. Absolute paths, `..`, non-JSON
files, missing files, and paths that resolve outside that directory are
rejected, as is `Custom config` without a path or a path with any other
load. A browser step's custom config must declare `scenarios` and set
`options.browser.type` on each one, as
`tests/performance/k6/options/1-iteration-browser.json` does. Step slots past
the sequence's last workflow are ignored.

`./dev perf:dispatch` is the boundary. It reads the form values from
environment variables, derives the lists from the catalog again (so an API
dispatch cannot run a sequence the form does not offer), and writes
`tests/performance/k6/reports/dispatch/`:

- `request.json`: the ten form values as received;
- `spec.json`: the normalized spec, written once and read-only, which both
  `perf:chain --spec --plan` and `perf:chain --spec` read;
- `dispatch.json`: event ref and commit SHA, actor, run id and attempt,
  artifact name, runner label, the stage reached, and the final status
  (`passed`, `failed`, `rejected`, or `cancelled`);
- `summary.md`: the job summary;
- `compose-ps.txt` and `compose-logs.txt` when `./dev up` fails, and
  `k6-build.log`.

A new dispatch first removes `dispatch/` and `chain/`, so its record and chain
evidence never mix with an earlier run's. A chain copies only the logs and
summaries its own steps wrote. The job rebuilds the k6 images every
run, so it never executes scenarios baked into an older image. With
`if: always()`, `--finalize` sets the status, and fails a job that would
otherwise pass while a passed step left no k6 summary. The whole `reports/`
directory is uploaded once as `perf-<run id>-<attempt>`; the job summary then
gets the artifact's URL and SHA-256 digest. The summary starts with `Passed`,
`Failed`, or `Rejected`, shows one row per step (load, data, status,
duration, requests, error rate, p90, checks, threshold gate), lists every
threshold expression and result, and always says:

> The app and k6 share one GitHub-hosted runner. Use these results for
> regression evidence, not capacity claims. Compare only runs with the same
> workload, test data, and environment.

## Summary output and Docker Compose confirmation

All nine bundled workflows declare `spec.outputs.summary.path`, pointing at the
JSON file each scenario's `handleSummary()` already writes (e.g.
`tests/performance/k6/reports/http-purchase-summary.json`). Unlike a dataset,
this is read-only and needs no opt-in flag — after a passing run,
any `./dev perf:<id>` and `./bin/punch`'s interactive
menu print its `totalRequests`, `errorRate`, `p90Ms`, `checkPassRate`, and
`durationMs` fields. The file also lists every threshold k6 evaluated
(`thresholds`: metric, expression, `ok`) and the metric names k6 emitted
(`emittedMetrics`), both added by `tests/performance/k6/support/report.ts`.

Before Docker Compose runs (which may build images), the workflow runner prints
a "Punch orchestrator" banner and asks for confirmation — but only on a real
interactive terminal; CI and other non-interactive workflow runs proceed
automatically. The separate `./bin/punch` menu requires a terminal and exits
before any build if one is unavailable. Before opening its menu, it offers an optional
`docker compose build k6 k6-browser` step (both images, since the menu can
select either service before a workflow is picked): Yes builds, while No
skips the build and continues to workflow selection. The interactive menu (`punch menu`) runs
exactly one workflow per invocation and exits — no "run another?" loop.
Its terminal picker supports arrow keys, `j`/`k`, and `/` search; Escape or
`q` cancels before running a workflow. After the `BASE_URL` target, it also
offers one of `tests/performance/k6/options/*.json` — the same
presets [`options/`](../../tests/performance/k6/options) `./dev perf:<id>
--config <name>` accepts — as the run's `k6 run --config`; the first entry
keeps the workflow's own `spec.k6.config`. The step is skipped only when no
preset exists. The menu itself is Punch's; see
[`vendor/punch/README.md`](../../vendor/punch/README.md).

## Extending a scenario

1. Add the TypeScript scenario and one entry to
   `tests/performance/k6/package.json`'s `build` script.
2. Add exactly one matching YAML file in `tests/performance/k6/workflows/`.
   Its name must match the build-entry mapping and its paths must remain within
   the repository working directory.
3. Add the user-facing selector only if a new command is intended, then update
   the command documentation and the workflow-coverage test.
4. Run `pnpm pg:test`, build the image explicitly, and run the selected
   workflow. Capture threshold evidence in the change description.

Thresholds stay named in `tests/performance/k6/config/thresholds.ts`; campaign
thresholds remain generated from the validated campaign descriptor. Direct
Compose commands are debugging escape hatches only, not an alternative
consumer execution path.

## Kubernetes runtime

The same nine workflows also run natively on Kubernetes: `./dev
perf:<id> --runtime k8s` submits the matching thin template in
`infra/k8s/perf/punch/workflows/` to Argo Workflows (no Python in the
cluster; datasets and evidence in S3). The invariants below describe the
compose runtime. Guide: [`k8s-runtime.md`](k8s-runtime.md).

## Invariants

1. k6 runs in Docker; no host k6 install is required for `./dev perf:*`.
2. One selected YAML workflow results in one Compose run.
3. `BASE_URL` is the target knob and only declared environment names are
   forwarded.
4. HTML/JSON reports remain stable; datasets are opt-in (`--produce`),
   stdout-only, column-checked, and atomic.
5. No secrets or personal user data belong in scenarios, fixtures, or logs.

## Related

- [`validation.md`](validation.md) — performance validation evidence rules.
- [`../architecture/orchestrator-python.md`](../architecture/orchestrator-python.md)
  — Python CLI architecture.
- [`../architecture/punch-implementation.md`](../architecture/punch-implementation.md)
  — Punch boundary and index of Punch's docs.
- [`../../tests/performance/k6/README.md`](../../tests/performance/k6/README.md)
  — scenario library and usage.
- [`k8s-runtime.md`](k8s-runtime.md) — Punch on Kubernetes (Argo Workflows, Argo CD).
