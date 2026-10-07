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
./dev perf:http-purchase
```

`./dev perf:*` selects one YAML file in `workflows/`. Punch loads and validates
it, then issues one Compose run. It streams stdout and stderr independently to
the terminal and `reports/logs/`, while each scenario retains its existing
HTML/JSON summary output in `reports/`. Do not substitute a direct Compose
command in normal use; it is a debugging escape hatch, not the owned path.

Set a different target without changing a workflow:

```bash
BASE_URL=https://perf.example.test ./dev perf:http-purchase
```

`http-purchase` also forwards `VUS`, `DURATION`, and `ITERATIONS`, so its load
shape is configurable without editing YAML:

```bash
VUS=5 DURATION=1m ./dev perf:http-purchase       # constant VUs for a time budget
ITERATIONS=5 ./dev perf:http-purchase            # fixed run count instead of a time budget
```

`VUS` defaults to `1`. With neither `DURATION` nor `ITERATIONS` set, `ITERATIONS`
defaults to `5` (`shared-iterations`) — a fixed op count, environment
independent, unlike a `DURATION`-based soak whose throughput (and therefore
op count) varies with how fast the target environment is. Set `DURATION`
explicitly to switch to a constant-VU time budget instead; `ITERATIONS`
takes precedence over `DURATION` whenever both are set. The BFF cart is
keyed by session (the `sid` cookie), and k6 gives each VU its own cookie
jar, so raising `VUS` is safe — concurrent VUs land on distinct carts, not a
shared one.

Common combinations are saved as presets in [`options/`](options/); export one
with `jq` before running:

```bash
export $(jq -r 'to_entries[] | "\(.key)=\(.value)"' options/5-vu-5m.json)
./dev perf:http-purchase
```

`./dev perf:*` stays non-interactive and never opens the picker. Punch's
interactive menu (`PYTHONPATH=vendor/punch/src python3 -m punch menu
tests/performance/k6/workflows`) is a separate entry point: after picking a
workflow and a `BASE_URL` target, it offers to load one of these same
`options/*.json` presets — skip it to fall back to the shell environment.
The step is only shown for a workflow that forwards a name besides
`BASE_URL` (e.g. `http-purchase`), and only when `options/`
holds at least one preset. Every preset is offered to every such workflow
regardless of which vars it forwards — a var the workflow doesn't forward
is dropped, same as setting it directly in the shell. The menu's cursor
defaults to `5-iterations`, matching the scenarios' own default.

## Run the browser variant

`browser-purchase` mirrors `http-purchase`'s journey but drives the web
app's real UI with Chromium (`k6/browser`) instead of calling the BFF over
HTTP — same add-to-cart → http-orders → land-on-the-new-order path, exercised
through clicks and DOM reads. It targets the **web app** (`WEB_PORT`, 3000),
not the BFF (3001) that every other workflow targets, and it builds a
separate image (`infra/docker/k6-browser.Dockerfile`, service `k6-browser`)
layered on Grafana's official Chromium-bundled `grafana/k6:0.54.0-with-browser`
tag — the plain `k6` image stays bare:

```bash
./dev up web
docker compose -f infra/docker/compose.performance.yaml build k6-browser
./dev perf:browser-purchase
```

Each VU is a full Chromium instance, so this stays iteration-count based
rather than `http-purchase`'s time-based soak — a `DURATION`-based default
here would silently multiply browser sessions. It defaults to 5 runs
(`VUS=1 ITERATIONS=5`), same fixed-count default as every other scenario;
set `ITERATIONS` explicitly for a different count (e.g.
[`options/1-iteration-browser.json`](options/1-iteration-browser.json) for
a single run). It forwards `VUS`/`ITERATIONS` only, not `DURATION`. Its report
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

## Data pipeline (produce / require)

Workflows hand data to each other through named datasets declared in each
workflow's `spec.data` (full contract: [`docs/performance/orchestrator.md`](../../../docs/performance/orchestrator.md#data-pipeline-specdata)):

```text
http-cart ─────────┐
browser-cart ─┴─carts──▶ http-orders ──┐
http-purchase ─────────────────────────────────┼─orders──▶ http-orders-status
browser-purchase ─────────────────────────┘
```

- A producer prints `[DATA <dataset>] <csv payload>` on stdout. Punch writes
  `data/<dataset>.csv` (gitignored, header row from the declared columns)
  **only** when the run opts in with `--produce <dataset>` (or
  `--produce all`), and publishes it atomically after a successful run. A
  zero-row run, a malformed row, or a failed process fails the workflow and
  keeps the previous file.
- A consumer fails before Docker when a required dataset is missing or has no
  rows, naming the workflows that produce it. Punch injects the container path
  as `DATA_<DATASET>_CSV`; `--data <dataset>=<path>` reads an alternate file
  under `data/`. After the run, an interactive terminal is asked whether to
  delete each consumed file; non-interactive runs keep it.

| Dataset | Columns | Producers | Consumers |
| --- | --- | --- | --- |
| `carts` | `cartId,productId,sid` | `http-cart`, `browser-cart` | `http-orders` |
| `orders` | `orderId` | `http-orders`, `http-purchase`, `browser-purchase` | `http-orders-status` |

### http-cart / browser-cart → http-orders

`http-cart` mirrors `http-purchase`'s pre-checkout steps (browse → add to
cart → view cart) but stops before `POST /orders` and emits each reserved
cart as `[DATA carts] <cartId>,<productId>,<sid>`. `sid` is the session cookie
the BFF minted for that cart — the cart is looked up by session, not by
`cartId` alone (see `cart.service.ts`), so `http-orders` replays it via
`http.cookieJar().set(...)` before checkout. `http-orders` then completes
`POST /orders` per row and verifies the order and the visualizer feed.

```bash
./dev perf:http-cart --produce carts      # writes data/carts.csv
./dev perf:http-orders                       # consumes it
```

`http-cart` forwards `VUS`/`DURATION`/`ITERATIONS` like `http-purchase`
(use `ITERATIONS=20` for a fixed batch). `http-orders` forwards
`VUS`/`ITERATIONS` only — a fixed cart pool doesn't fit a time-based soak;
`ITERATIONS` defaults to `5`, and a count above the pool size wraps around and
re-attempts already-placed carts (those checks fail, they don't crash).

`browser-cart` is the browser-driven twin: it drives the web app with
Chromium, stops before "Place Order", and emits
`[DATA carts] <cartId>,<productId>,<sid>` into the same dataset. `cartId` is
read from `CartCheckoutPanel.tsx`'s `data-cart-id` attribute and `productId`
from the add button's `data-product-id` (k6's browser module cannot intercept
responses), so its rows match `http-cart`'s columns.

```bash
./dev up web
docker compose -f infra/docker/compose.performance.yaml build k6-browser
./dev perf:browser-cart --produce carts
./dev perf:http-orders
```

### http-orders / http-purchase(-browser) → http-orders-status

An order is "served" at checkout and reports `hot` until
`ORDER_COOL_DOWN_SECONDS` (BFF default 300) have passed, then `cold`. Each
complete purchase workflow emits `[DATA orders] <orderId>` once it verified
the order (`browser-purchase` reads the id from the rendered orders
section). `http-orders-status` reads `GET /orders/:id/status` — a direct Postgres
read in the BFF — per row and checks the temperature:

- `EXPECT_TEMPERATURE=auto` (default): `hot` while k6's clock is before
  `coolsAt`, `cold` after; rows within ±2 s of `coolsAt` accept either.
- `EXPECT_TEMPERATURE=hot` / `cold`: a fixed expectation.

`ORDER_COOL_DOWN_SECONDS` is forwarded so the scenario can also check
`coolsAt - placedAt`; it must match the BFF's value. To exercise the hot →
cold flip without waiting five minutes, start the BFF with a short window
(60 s leaves room for Docker start-up; 20 s is too tight):

```bash
ORDER_COOL_DOWN_SECONDS=60 ./dev up
export ORDER_COOL_DOWN_SECONDS=60

./dev perf:http-cart --produce carts
./dev perf:http-orders --produce orders                 # or perf:http-purchase(-browser) --produce orders
EXPECT_TEMPERATURE=hot ./dev perf:http-orders-status
# ...wait past the 60 s window...
EXPECT_TEMPERATURE=cold ./dev perf:http-orders-status
```

It forwards `VUS`/`ITERATIONS` (default 5 iterations; rows are reused
round-robin when `ITERATIONS` exceeds the dataset size — the reads are
idempotent).

### http-purchase-registered → http-auth-login → http-me-hot-status

Load-tests `GET /me/hot-status` with real login tokens.

```bash
./dev perf:http-purchase-registered --produce owned-orders   # orders for seeded demo users
./dev perf:http-auth-login --produce auth-tokens                  # log in their owners
./dev perf:http-me-hot-status                                    # poll with those tokens
```

- `http-purchase-registered` checks out anonymously with
  `orderFor: {type: "user", recipient}` for the seeded demo users
  (round-robin; `USERS=ana,ben` narrows) and emits `owned-orders`
  `[orderId, username, email]` for verified orders.
- `http-auth-login` declares `owned-orders` as **optional** (`spec.data.optional`). With
  the file present it logs in those owners; without it Punch prints
  `optional dataset "owned-orders" not present` and the scenario logs in the
  12 demo users. Password: `DEMO_PASSWORD` (default `espresso-demo`); it never
  enters a dataset. Emits `auth-tokens` `[username, authToken]`.
- `http-me-hot-status` requires `auth-tokens` and checks response shape only
  (`hotCount` may be 0 once orders cool). `ITERATIONS` or `DURATION`.
- Thresholds for all three: `http_req_failed` < 10%, checks > 90%,
  p(90) < 1000 ms (500 ms for http-me-hot-status).

## Reports and current-run evidence

The report volume has this stable layout:

```text
reports/
  <id>-report.html / <id>-summary.json         # scenario HTML/JSON output
  logs/k6-<id>.log                             # selected workflow stdout/stderr
```

Inspect or remove those generated files with:

```bash
./dev perf:open-report
./dev perf:clean
```

Existing dataset, HTML, or JSON files are **not current-run evidence**: a file
may predate the selected workflow. Use the Punch execution result and its
matching stdout/stderr log as the current-run evidence record; the result
identifies the selected workflow and reports its exit/pass state and the row
count of any dataset it wrote.

The current mappings are:

| TypeScript build entry                                           | YAML workflow                             |
| ---------------------------------------------------------------- | ----------------------------------------- |
| `scenarios/browser-cart/browser-cart.ts`                         | `workflows/browser-cart.yaml`             |
| `scenarios/browser-purchase/browser-purchase.ts`                 | `workflows/browser-purchase.yaml`         |
| `scenarios/http-auth-login/http-auth-login.ts`                   | `workflows/http-auth-login.yaml`          |
| `scenarios/http-cart/http-cart.ts`                               | `workflows/http-cart.yaml`                |
| `scenarios/http-me-hot-status/http-me-hot-status.ts`             | `workflows/http-me-hot-status.yaml`       |
| `scenarios/http-orders/http-orders.ts`                           | `workflows/http-orders.yaml`              |
| `scenarios/http-orders-status/http-orders-status.ts`             | `workflows/http-orders-status.yaml`       |
| `scenarios/http-purchase/http-purchase.ts`                       | `workflows/http-purchase.yaml`            |
| `scenarios/http-purchase-registered/http-purchase-registered.ts` | `workflows/http-purchase-registered.yaml` |

`http-purchase` is the one full load/perf workflow: it mimics the web app
exactly (catalog list → add to cart → cart view → checkout → verify order →
verify visualizer feed), with no `GET /products/:id` hop since the
web catalog grid never calls it. `http-cart` and `http-orders` split that
same journey into a pair — reserve, then checkout — passing reserved cart ids
between them as the `carts` dataset; see "Data pipeline" above.

## Add a scenario

Add the scenario source, add one TypeScript build entry, then add exactly one
matching `workflows/<name>.yaml`. The workflow supplies the Compose file,
service, container script, permitted environment, and optional `spec.data`
(`produces` with columns and targets, and/or `requires`); do not put an
additional script-path branch in `scripts/pg/perf.py`. Punch owns the whole
data lifecycle — opt-in, preflight, path injection, delete prompt — so a new
`perf.py` function stays a one-line pass-through to `run_k6`.

Update the relevant command/docs and run `pnpm pg:test`. Build explicitly and
execute the workflow locally before relying on CI. Keep thresholds named in
`config/thresholds.ts` and retain the existing report shape.

## Host k6 debugging escape hatch

For a local experiment, bundle first and use a host k6 binary against the
compiled output. This bypasses the repository YAML workflow and is therefore
not the supported or CI path:

```bash
cd tests/performance/k6 && npm ci && npm run build
BASE_URL=http://localhost:3001 k6 run dist/http-purchase/http-purchase.js
```
