# k6 scenario library

This folder owns the mini-commerce BFF scenarios, their TypeScript build
entries, repository workflow YAML, and generated HTML/JSON reports. It uses
the pinned Punch submodule for shared report helpers and the generic workflow
runtime; Punch does not own Expresso's HTTP contracts.

## Run a workflow

Start the BFF, initialize Punch, install its pinned dependency, and build the
image separately:

```bash
git submodule update --init --recursive
python3 -m pip install -r vendor/punch/requirements.txt
./dev up
docker compose -f infra/docker/compose.performance.yaml build k6
./dev perf:smoke
```

`./dev perf:*` selects one YAML file in `workflows/`. Punch loads and validates
it, then issues one Compose run. It streams stdout and stderr independently to
the terminal and `reports/logs/`, while each scenario retains its existing
HTML/JSON summary output in `reports/`. Do not substitute a direct Compose
command in normal use; it is a debugging escape hatch, not the owned path.

Set a different target without changing a workflow:

```bash
BASE_URL=https://perf.example.test ./dev perf:smoke
```

`purchase-flow` also forwards `VUS`, `DURATION`, and `ITERATIONS`, so its load
shape is configurable without editing YAML:

```bash
VUS=5 DURATION=1m ./dev perf:purchase-flow       # constant VUs for a time budget
ITERATIONS=5 ./dev perf:purchase-flow            # fixed run count instead of a time budget
```

`VUS` defaults to `1`, `DURATION` to `30s`. `ITERATIONS` is unset by default;
when set it switches the scenario to a fixed iteration count (`shared-iterations`)
and takes precedence over `DURATION`. The BFF cart is keyed by session (the
`sid` cookie), and k6 gives each VU its own cookie jar, so raising `VUS` is
safe — concurrent VUs land on distinct carts, not a shared one.

Common combinations are saved as presets in [`options/`](options/); export one
with `jq` before running:

```bash
export $(jq -r 'to_entries[] | "\(.key)=\(.value)"' options/5-vu-5m.json)
./dev perf:purchase-flow
```

## Run the browser variant

`purchase-flow-browser` mirrors `purchase-flow`'s journey but drives the web
app's real UI with Chromium (`k6/browser`) instead of calling the BFF over
HTTP — same add-to-cart → place-order → land-on-the-new-order path, exercised
through clicks and DOM reads. It targets the **web app** (`WEB_PORT`, 3000),
not the BFF (3001) that every other workflow targets, and it builds a
separate image (`infra/docker/k6-browser.Dockerfile`, service `k6-browser`)
layered on Grafana's official Chromium-bundled `grafana/k6:0.54.0-with-browser`
tag — the plain `k6` image stays bare:

```bash
./dev up web
docker compose -f infra/docker/compose.performance.yaml build k6-browser
./dev perf:purchase-flow-browser
```

Each VU is a full Chromium instance, so it defaults to one run
(`VUS=1 ITERATIONS=1`, [`options/1-iteration-browser.json`](options/1-iteration-browser.json))
rather than `purchase-flow`'s time-based soak — set `ITERATIONS` explicitly
to run more. It forwards `VUS`/`ITERATIONS` only, not `DURATION`. Its report
still uses the shared HTML/JSON helpers, but no `k6/http` calls happen in a
browser test, so every `http_req_*` metric is absent — `checks` is the only
meaningful signal there, and it drives the real `passed` verdict (both the
HTML report's PASS/FAIL badge and the JSON summary's `passed` field read it
correctly via k6's threshold results). The two helpers default an *absent*
`http_req_failed` differently, though: the HTML report reads it as `0%`
(clean), but the JSON summary's own `errorRate` field reads it as `1` (looks
like 100% failure) — a pre-existing quirk in the shared report helper
(`vendor/punch/src/tests/support/report.ts`), not something specific to this
scenario. Read `passed`/`checkPassRate`, not `errorRate`, from the JSON
summary for this workflow.

## Run cart-fulfill

`cart-fulfill` mirrors `purchase-flow`'s pre-checkout steps (browse → add to
cart → view cart) but stops before `POST /checkout` — it never places an
order. Each iteration that successfully creates a cart emits one stdout
record instead:

```text
[CSV] <cartId>,<productId>,<sid>
```

`sid` is the session cookie the BFF minted for that cart — required because
the BFF's cart is looked up by session, not by `cartId` alone (see
`cart.service.ts`'s `Map<sessionId, SessionCart>`); `place-order` replays it
via `http.cookieJar().set(...)` so its checkout lands in the session that
actually owns the cart, instead of its own run's fresh one.

It is the first workflow to declare `spec.outputs.csv.path`
(`reports/cart-fulfill-carts.csv`), so it needs confirmation before writing
that file. Interactively you're prompted; non-interactively pass
`--confirm-output-data`:

```bash
./dev perf:cart-fulfill --confirm-output-data
```

It forwards `VUS`/`DURATION`/`ITERATIONS` exactly like `purchase-flow` — use
`ITERATIONS` to generate a fixed batch of carts (e.g. `ITERATIONS=20`) rather
than a time-based soak. A zero-record run, malformed `[CSV]` payload, or a
failed process fails the workflow and leaves any previous
`cart-fulfill-carts.csv` untouched (see "Optional CSV output" below).

On a successful run, `./dev perf:cart-fulfill` also duplicates
`reports/cart-fulfill-carts.csv` to `data/cart-fulfill-carts.csv` — a
separate, gitignored folder for data a *later* workflow consumes (`reports/`
stays evidence-only and untouched). `place-order` below reads that duplicate.

## Run place-order

`place-order` is `cart-fulfill`'s pair: it checks out the carts `cart-fulfill`
reserved instead of creating its own. Its scenario loads
`data/cart-fulfill-carts.csv` into a k6 `SharedArray` at init time (one row
per cart, read-only, shared across VUs) and, for each iteration, completes
`POST /checkout` for one row, then verifies the order and the visualizer feed
— purchase-flow's post-checkout steps, unchanged.

```bash
./dev perf:cart-fulfill --confirm-output-data   # produces data/cart-fulfill-carts.csv
./dev perf:place-order                          # consumes it
```

It forwards `VUS`/`ITERATIONS` only, no `DURATION` — a fixed cart pool
doesn't fit a time-based soak. `ITERATIONS` defaults to the row count (each
cart checked out exactly once); set it lower to consume a subset, or higher
to wrap around and re-attempt already-placed orders (those checks fail, they
don't crash the run).

It fails fast, before Docker starts, if `data/cart-fulfill-carts.csv` is
missing or empty — run `perf:cart-fulfill` first. After the run finishes
(pass or fail), it asks — on a real interactive terminal only — whether to
delete that data file; a non-interactive run leaves it in place.

## Reports and current-run evidence

The report volume has this stable layout:

```text
reports/
  smoke-report.html / smoke-summary.json       # scenario HTML/JSON output
  logs/k6-smoke.log                            # selected workflow stdout/stderr
```

Inspect or remove those generated files with:

```bash
./dev perf:open-report
./dev perf:clean
```

Existing CSV, HTML, or JSON files are **not current-run evidence**: a file
may predate the selected workflow. Use the Punch execution result and its
matching stdout/stderr log as the current-run evidence record; the result
identifies the selected workflow and reports its exit/pass state and any CSV
record count.

The current mappings are:

| TypeScript build entry                     | YAML workflow                  |
| ------------------------------------------ | ------------------------------ |
| `scenarios/smoke/smoke.ts`                 | `workflows/smoke.yaml`         |
| `scenarios/purchase-flow/purchase-flow.ts` | `workflows/purchase-flow.yaml` |
| `scenarios/purchase-flow-browser/purchase-flow-browser.ts` | `workflows/purchase-flow-browser.yaml` |
| `scenarios/cart-fulfill/cart-fulfill.ts` | `workflows/cart-fulfill.yaml` |
| `scenarios/place-order/place-order.ts` | `workflows/place-order.yaml` |

`purchase-flow` is the one full load/perf workflow: it mimics the web app
exactly (catalog list → add to cart → cart view → checkout → verify order →
verify visualizer feed), with no `GET /catalog/products/:id` hop since the
web catalog grid never calls it. `cart-fulfill` and `place-order` split that
same journey into a pair — reserve, then checkout — passing reserved cart ids
between them as CSV; see "Run cart-fulfill" and "Run place-order" above.

`load` and `stress` are old, unwired placeholders; they are neither build
entries nor workflows.

## Optional CSV output

`cart-fulfill` is the only workflow that declares `outputs.csv` today. Any
other future workflow can declare `spec.outputs.csv.path` only when its data
output is intentional.

- A candidate record is exactly one stdout line beginning `[CSV]`; Punch strips
  that prefix and parses its payload as strict CSV. Stderr is log-only and is
  never harvested.
- Interactive runs request confirmation before Compose starts. For a
  non-interactive CSV-declared run, pass `--confirm-output-data`. The flag is
  not needed by `smoke`, `purchase-flow`, or `purchase-flow-browser`.
- Zero valid records, malformed tagged data, process failure, or preflight
  failure fails the workflow. Punch stages valid records beside the target and
  publishes them atomically only after a successful run, preserving any
  previously published file on failure.

## Add a scenario

Add the scenario source, add one TypeScript build entry, then add exactly one
matching `workflows/<name>.yaml`. The workflow supplies the Compose file,
service, container script, permitted environment, and optional `outputs.csv`;
do not put an additional script-path branch in `scripts/pg/perf.py`. A
workflow-specific *input* preflight or postflight step (e.g. `place-order`'s
missing-data check and delete prompt) does belong in its `perf.py` function,
though — Punch's workflow schema has no concept of input data, only declared
output.

Update the relevant command/docs and run `pnpm pg:test`. Build explicitly and
execute the workflow locally before relying on CI. Keep thresholds named in
`config/thresholds.ts` and retain the existing report shape.

## Host k6 debugging escape hatch

For a local experiment, bundle first and use a host k6 binary against the
compiled output. This bypasses the repository YAML workflow and is therefore
not the supported or CI path:

```bash
cd tests/performance/k6 && npm ci && npm run build
BASE_URL=http://localhost:3001 k6 run dist/smoke/smoke.js
```
