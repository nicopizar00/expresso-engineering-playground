# Hot-Status Load Chain Design

## Status

Approved in conversation on 2026-10-06 (dataset flow, Punch optional
datasets). The in-repo wiring section (section B) was not presented
separately and is approved through this written-spec review.

## Problem

`GET /account/hot-status` (see
[`2026-10-05-hot-status-banner-design.md`](2026-10-05-hot-status-banner-design.md))
was built polled so Punch could load-test it, but no workflow drives it yet.
Driving it needs live `auth` tokens for users who own orders, which means a
chain: place orders for registered users, log those users in, then poll with
their tokens.

Login is the edge case of Punch's producer/consumer model: it can consume the
owners of orders a previous workflow placed, or stand alone on the seeded demo
users. Punch today only has `requires`, which fails preflight when the
dataset is missing, so one workflow cannot serve both.

## Goals

- Three chained k6 workflows: `purchase-registered` → `login` →
  `hot-status`, linked through Punch datasets.
- Purchase output is enriched: each verified order row carries its owner.
- `login` uses the enriched orders when they exist and falls back to the
  seeded demo users when they do not, as one workflow.
- Punch gains optional datasets to make that fallback first-class.
- `hot-status` applies load to `GET /account/hot-status` with real tokens.

## Non-goals

- Registering users during load tests. The seeded demo users are the pool.
- Asserting that coffees are hot. `hot-status` checks response shape only.
- Changing `place-order`, `purchase-flow`, or `order-status` (their `orders`
  dataset stays `[orderId]`; their orders are guest orders with no owner).
- SSE load (`xk6-sse`). Still a follow-up.

## Decisions

| Topic                       | Decision                                                                                                                                                            |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| User source                 | The 12 seeded demo users (`ana` … `mila`, `<username>@example.test`, password `espresso-demo`).                                                                     |
| How purchase targets a user | Anonymous checkout with `orderFor: {type: "user", recipient: <username>}`. No login in purchase.                                                                    |
| Purchase output             | Dataset `owned-orders`, columns `[orderId, username, email]`, one row per verified order.                                                                           |
| Login input                 | `owned-orders` as an **optional** dataset; falls back to the built-in demo-user list.                                                                               |
| Login output                | Dataset `auth-tokens`, columns `[username, authToken]`.                                                                                                             |
| hot-status assertions       | Shape only.                                                                                                                                                         |
| Thresholds                  | All three workflows: failed requests under 10% (`rate<0.10`), latency at the 90th percentile (`p(90)`), checks above 90%. Existing workflows keep their thresholds. |
| Password in datasets        | Never. Login reads `DEMO_PASSWORD` (default `espresso-demo`).                                                                                                       |
| Process                     | One spec and plan for both repos; Punch change committed in `vendor/punch`, pushed to its remote before the submodule pointer bump.                                 |

## Data flow

```
./dev perf:purchase-registered --produce owned-orders
        │  owned-orders.csv  [orderId, username, email]
        ▼  (optional)
./dev perf:login --produce auth-tokens
        │  auth-tokens.csv   [username, authToken]
        ▼  (required)
./dev perf:hot-status
```

Without a prior purchase run, `./dev perf:login --produce auth-tokens` logs
in the demo users instead. All datasets live in the git-ignored
`tests/performance/k6/data/`.

## A. Punch: optional datasets (`vendor/punch`)

### Schema (`src/punch/workflow.py`)

```yaml
spec:
  data:
    requires: [...] # unchanged: must have rows, preflight fails otherwise
    optional: [owned-orders] # new: used when it has rows, skipped otherwise
```

- `spec.data.optional`: non-empty list of dataset names matching the
  existing name pattern.
- `DATA_KEYS` gains `optional`. `spec.data` must declare at least one of
  `produces`, `requires`, `optional`.
- A dataset may not be both required and optional.
- The data model gains `optional: tuple[str, ...]` (default empty).

### Execution (`src/punch/execution.py`)

- Preflight is unchanged for `requires`. An optional dataset without rows
  never fails; Punch prints
  `[punch] optional dataset "<name>" not present — scenario uses its default`.
- `data_environment` sets `DATA_<NAME>_CSV` for every required dataset and
  for each optional dataset whose file has data rows. Unset means "absent".
- `--data <optional>=<path>` is accepted with the same "beneath
  `spec.data.directory`" rule.
- The post-run "Delete consumed data?" prompt includes optional datasets that
  were used.

### Catalog (`src/punch/catalog.py`)

- A producer's `targets` may name a workflow that lists the dataset as
  required or optional.
- An optional dataset with no producer is allowed (only usable via `--data`);
  a required one with no producer stays an error.

### Tests and docs

- Unit tests for each rule above: parsing (valid, empty list, overlap,
  optional-only), preflight note, env present/absent/empty, catalog targets
  and producer-less optional.
- Punch `README.md` data-contract section and a `CHANGELOG.md` entry.

## B. This repo

### Shared demo users

`tests/performance/k6/support/demo-users.ts` exports the 12 seeded usernames
and `demoUserEmail(username)` (`<username>@example.test`). It mirrors
`apps/bff/prisma/seed.ts`; a comment points there.

### `purchase-registered`

- Scenario `scenarios/purchase-registered/purchase-registered.ts`; workflow
  `workflows/purchase-registered.yaml`.
- Each iteration clears its cookie jar (fresh `sid`), picks username
  `users[iterationInTest % users.length]`, adds `prod_espresso`, checks out
  with `orderFor: {type: "user", recipient: username}`, then reads
  `GET /orders/:id` and checks `owner` equals `{username}`.
- Only a verified order prints `[DATA owned-orders] <orderId>,<username>,<email>`.
- `USERS=ana,ben` overrides the pool (comma-separated usernames).
- Env forwarded: `BASE_URL, VUS, DURATION, ITERATIONS, USERS`. Default
  5 iterations. New `purchaseRegisteredThresholds`: `http_req_failed rate<0.10`,
  `http_req_duration p(90)<1000`, `checks rate>0.90`.
- `spec.data.produces: [{dataset: owned-orders, columns: [orderId, username, email], targets: [login]}]`.

### `login`

- Scenario `scenarios/login/login.ts`; workflow `workflows/login.yaml`.
- `spec.data.optional: [owned-orders]`;
  `produces: [{dataset: auth-tokens, columns: [username, authToken], targets: [hot-status]}]`.
- Source: when `DATA_OWNED_ORDERS_CSV` is set, the usernames column of that
  file; otherwise the demo-user list. Iteration `i` uses entry
  `i % length`; duplicates are fine.
- Each iteration clears its cookie jar, posts
  `/auth/login {identifier: username, password: DEMO_PASSWORD}`, checks 200
  and `body.username === username`, reads the `auth` cookie from
  `res.cookies`, and prints `[DATA auth-tokens] <username>,<token>`.
- Env forwarded: `BASE_URL, VUS, ITERATIONS, DEMO_PASSWORD`. Default
  5 iterations. New `loginThresholds`: `http_req_failed rate<0.10`,
  `http_req_duration p(90)<1000` (scrypt per login), `checks rate>0.90`.

### `hot-status`

- Scenario `scenarios/hot-status/hot-status.ts`; workflow
  `workflows/hot-status.yaml`; `spec.data.requires: [auth-tokens]`.
- Iteration `i` sets cookie `auth=<token>` from row `i % rows`, then
  `GET /account/hot-status`.
- Checks: 200; `hotCount` integer ≥ 0; `nextCoolsAt` null or ISO string,
  null exactly when `hotCount` is 0; `serverTime` ISO string.
- Env forwarded: `BASE_URL, VUS, DURATION, ITERATIONS`. Default
  5 iterations; `DURATION` switches to a constant-VU soak.
  New `hotStatusThresholds`: `http_req_failed rate<0.10`,
  `http_req_duration p(90)<500`, `checks rate>0.90`.

### Wiring

- `tests/performance/k6/package.json` build entries for the three scenarios.
- `scripts/pg/perf.py` + `scripts/pg/cli.py`: `perf:purchase-registered`,
  `perf:login`, `perf:hot-status`.
- Root `package.json` `pg:perf:*` aliases and `Taskfile.yml` tasks.
- `scripts/pg/tests/test_k6_workflows.py` expected names, compose services
  and forwarded env; `scripts/pg/tests/test_k6runner.py` command mapping.
- Docs: `tests/performance/k6/README.md` (new "purchase-registered → login →
  hot-status" pipeline section, including the optional-dataset fallback),
  `docs/cli-reference.md`, `docs/performance/orchestrator.md`,
  `docs/architecture/orchestrator-python.md`, and
  `docs/next-steps/hot-status.md` (the load-chain follow-up becomes shipped).

### Submodule pointer

The outer repo bumps `vendor/punch` only after the Punch commits are pushed
to Punch's remote (otherwise CI checkout fails with "not our ref"). Both
pushes happen at merge time with the owner's OK.

## Testing

- Punch unit tests (above), run with Punch's own test command.
- `pnpm pg:test` with the updated workflow and runner tests.
- `pnpm --filter @mini-commerce/k6-scenarios build` (esbuild) and repo
  typecheck/lint/format.
- Live chain against the local stack, each run once with 5 iterations:
  `perf:purchase-registered --produce owned-orders` → `perf:login --produce
auth-tokens` → `perf:hot-status`, all thresholds passing; then
  `perf:login --produce auth-tokens` with `owned-orders.csv` removed, proving
  the demo-user fallback and the Punch note.

## Known gaps

- Repeated purchase runs keep adding orders to the same 12 users.
- Each login iteration leaves an `AuthSession` row (no sweep yet; see
  `docs/next-steps/login.md`).
- `auth-tokens.csv` holds live session tokens in a git-ignored local file.
