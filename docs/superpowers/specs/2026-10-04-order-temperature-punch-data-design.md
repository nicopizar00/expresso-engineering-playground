# Order Temperature and Punch Data Contract Design

## Status

Approved in conversation on 2026-10-04 (sections 1–4). Pending written-spec
review.

## Problem

Two needs land together:

1. **Product.** After an order is placed (the coffee is served), the order must
   report a temperature: `hot` for the first 5 minutes, `cold` afterwards. The
   value must be reachable through web → BFF → a real PostgreSQL read.
2. **Performance orchestration (primary goal).** A new k6 workflow,
   `order-status`, must consume orders produced by any complete purchase
   workflow. Today Punch's producer/consumer link is half hard-coded: a single
   `outputs.csv` per workflow, `inputs.csv` as menu-only metadata, and
   per-workflow preflight, copy, and delete branches in `scripts/pg/perf.py`.
   That does not scale to a second dataset or a workflow that both consumes and
   produces data.

## Goals

- Any workflow may declare that it **requires** one or more named datasets.
- Any workflow may declare that it **produces** one or more named datasets,
  each with explicit target workflows; the user opts in per run.
- Punch owns the whole data lifecycle generically: tagged-stdout harvesting,
  column validation, atomic publish, consumer preflight, container path
  injection, optional post-run delete. `perf.py` carries no dataset-specific
  code.
- `place-order`, `purchase-flow`, and `purchase-flow-browser` produce
  `orders` targeting `order-status`; `order-status` requires `orders`.
- The existing carts chain (`cart-fulfill`, `cart-fulfill-browser` →
  `place-order`) migrates to the same model with unchanged behavior.
- Order temperature is derived at read time from `placedAt`; no scheduler, no
  stored temperature, no DB migration.

## Non-goals

- A `served` order status or any change to the status lifecycle. "Served" is
  defined as the moment of checkout (`placedAt`).
- Chained execution (producer + consumer in one command).
- An `order-status-browser` scenario.
- Multiple files per dataset or dataset versioning.
- Keeping the legacy `spec.outputs.csv` / `spec.inputs.csv` keys or the
  `--confirm-output-data` flag. The repository owns every workflow; there is no
  compatibility window.

## Decisions

| Topic | Decision |
|---|---|
| Hot clock start | `Order.placedAt` (served at checkout) |
| Cool-down | `ORDER_COOL_DOWN_SECONDS`, default `300`, positive integer, read once at BFF startup; invalid value aborts startup |
| Temperature rule | `hot` while `now - placedAt < coolDown`; `cold` at and after the boundary; applies to every status including `cancelled` |
| Real DB request | `GET /orders/:id/status` reads Postgres directly, bypassing `OrdersService`'s in-memory cache |
| `orders` columns | `orderId` only (browser producers can supply it from the URL; consumers fetch the rest from the BFF) |
| `carts` columns | `cartId,productId,sid` (unchanged payload; header row now added) |
| Link declaration | Producer declares `targets`; consumer declares only dataset names; Punch derives the producer list and cross-validates |
| Dataset file | `<spec.data.directory>/<dataset>.csv`, one file per dataset, last successful opted-in run wins |
| Opt-in | `--produce <dataset>` (repeatable) or `--produce all`; menu asks per dataset. No opt-in means no file and no failure |

## Pipeline

```text
cart-fulfill ─────────┐
cart-fulfill-browser ─┴─carts──▶ place-order ──┐
purchase-flow ─────────────────────────────────┼─orders──▶ order-status
purchase-flow-browser ─────────────────────────┘
```

1. User runs a producer with `--produce orders` (or answers yes in the menu).
2. On a passing run with ≥1 valid record, Punch atomically publishes
   `tests/performance/k6/data/orders.csv` with a header row.
3. `./dev perf:order-status`: Punch preflights `orders.csv` (exists, ≥1 data
   row), injects `DATA_ORDERS_CSV`, runs k6.
4. Each iteration reads one `orderId`, calls `GET /orders/:id/status`, checks
   the temperature.
5. Interactive terminals are asked whether to delete each consumed dataset;
   non-interactive runs keep it.

## Punch data contract

### Schema

`spec.data` replaces `spec.outputs.csv` and `spec.inputs.csv`.
`spec.outputs.summary` is unchanged.

```yaml
spec:
  data:
    directory: tests/performance/k6/data   # host path, beneath workingDirectory
    mountedAt: /scripts/data               # absolute container path of the same directory
    produces:
      - dataset: orders
        columns: [orderId]
        targets: [order-status]
    requires: [orders]
```

Validation rules (`workflow.py`):

- `spec.data` is optional. When present, `directory` and `mountedAt` are
  required; `directory` must resolve beneath `spec.workingDirectory`;
  `mountedAt` must be absolute.
- `produces` and `requires` are each optional, but `spec.data` with neither is
  an error.
- Dataset names match `^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$` (same as
  workflow names) and are unique within `produces` and within `requires`.
- `columns` is a non-empty list of unique strings matching
  `^[A-Za-z_][A-Za-z0-9_]*$`.
- `targets` is a non-empty list of unique workflow names.
- The legacy keys `outputs.csv` and `inputs` are rejected as unknown fields.

New dataclasses replace `CsvOutput`/`CsvInput`:

```python
@dataclass(frozen=True)
class DataProduct:
    dataset: str
    columns: tuple[str, ...]
    targets: tuple[str, ...]

@dataclass(frozen=True)
class DataSpec:
    directory: Path
    mounted_at: str
    produces: tuple[DataProduct, ...]
    requires: tuple[str, ...]

    def host_path(self, dataset: str) -> Path: ...       # directory / f"{dataset}.csv"
    def container_path(self, dataset: str) -> str: ...   # f"{mounted_at}/{dataset}.csv"
```

`K6Workflow.data: DataSpec | None` replaces `csv_output` and `csv_input`.

### Catalog cross-validation

A new `load_catalog(directory) -> WorkflowCatalog` loads every workflow YAML in
a directory and checks the links:

- every `targets` entry names a workflow in the catalog;
- each target `requires` that dataset;
- every dataset that is produced by more than one workflow has identical
  `columns` across producers;
- every required dataset has at least one producer.

The catalog exposes `producers_of(dataset) -> tuple[str, ...]`. Running a single
workflow loads its catalog (the directory containing the workflow file) so
preflight messages can name producers; a catalog error fails the run before
Docker starts.

### Producer runtime

- Record line format on stdout: `[DATA <dataset>] <csv payload>`. Stderr is
  never harvested.
- Opt-in set = datasets named by `--produce` (or all declared ones for
  `--produce all`). Naming an undeclared dataset in `--produce` fails before
  Docker starts.
- For each opted-in dataset Punch opens a temp file beside the target, writes
  the header (`columns` joined by commas), and streams validated payloads to it.
- Each payload is parsed as strict single-row CSV; its field count must equal
  `len(columns)`.
- A `[DATA x]` line for a dataset the workflow does not declare is a hard
  error. A line for a declared but not opted-in dataset is logged only.
- Publish is atomic (rename) per dataset, only when the k6 process passes and
  that dataset has ≥1 record and no malformed record. Otherwise the temp file
  is removed, any previously published file is untouched, and the workflow
  fails.
- `--confirm-output-data` is removed; `--produce` is the acknowledgement.
- `ExecutionResult` replaces `csv_path`/`csv_record_count` with
  `datasets: tuple[DatasetResult, ...]` (`dataset`, `path`, `record_count`,
  `published`). The JSON result printed by Punch lists them.

### Consumer runtime

- Preflight, before Docker starts, for each required dataset: the resolved
  file must exist and contain at least one non-blank line after the header.
  Failure message names the dataset and its producers, e.g.
  `order-status requires "orders"; produce it with: place-order, purchase-flow, purchase-flow-browser (--produce orders)`.
- `--data <dataset>=<path>` overrides one required dataset's file for this run.
  The path must resolve beneath `spec.data.directory` (so the container mount
  still reaches it); it is preflighted the same way.
- Punch adds `-e DATA_<DATASET>=<container path>` to the Compose run, where
  `<DATASET>` is the dataset name upper-cased with `-` → `_`, suffixed `_CSV`
  (`orders` → `DATA_ORDERS_CSV`).
- After the run (pass or fail), on an interactive TTY only, Punch asks per
  required dataset: `Delete consumed "orders" data (<path>)? [y/N]`.
  Non-interactive runs never delete.

### Menu

- Entry annotations: `[produces orders → order-status]`,
  `[requires orders ← place-order, purchase-flow, purchase-flow-browser]`.
- After picking a producer, one y/N prompt per produced dataset naming its
  targets; yes adds it to the opt-in set.

### Compose

`infra/docker/compose.performance.yaml` already mounts
`tests/performance/k6/data` at `/scripts/data` for the `k6` service. Add the
same mount to `k6-browser` so any browser workflow can declare `requires`
(producers alone do not need it, since Punch harvests stdout on the host).

### Expresso orchestrator (`scripts/pg/perf.py`)

Every `perf:*` command becomes a thin pass-through:
`run_k6(name, args, default_port=...)`, where `args` forwards `--produce` and
`--data` to Punch. Removed: `CART_FULFILL_CSV_NAME`,
`_duplicate_cart_fulfill_csv`, `_has_csv_data`, `_confirm_delete_data`,
`_confirm_output_data`, and the `reports/ → data/` duplication. New command:
`perf:order-status`.

## Product: order temperature

### Shared rule

`apps/bff/src/modules/orders/order-temperature.ts`:

```ts
export function temperatureOf(
  placedAt: Date,
  now: Date,
  coolDownMs: number,
): OrderTemperature; // "hot" while now - placedAt < coolDownMs, else "cold"

export function coolsAt(placedAt: Date, coolDownMs: number): Date;

export function parseCoolDownSeconds(raw: string | undefined): number;
// undefined → 300; non-positive-integer → throws
```

The parsed value is provided once through a Nest provider in `OrdersModule`.

### Contracts

- `packages/shared-types`: `export type OrderTemperature = "hot" | "cold";`
- `packages/contracts`: re-export it; `Order` gains
  `temperature: OrderTemperature` and `coolsAt: string` (ISO);
  new `OrderStatusResponse { orderId, status, temperature, placedAt, coolsAt, checkedAt }`.
- `Order.temperature`/`coolsAt` are computed in the read path
  (`listAll`, `get`) from cached `placedAt`; they are never stored.

### BFF endpoint

`GET /orders/:id/status` → `OrdersService.getStatus(id)`:

- `prisma.order.findUnique({ where: { orderId }, select: { orderId: true, status: true, placedAt: true } })`
  — always Postgres, never the cache.
- Missing row → `404 NotFoundException`.
- OTel span `orders.status` with `order.id` and `order.temperature`.
- `checkedAt` is the server `now` used for the computation.

### Web

`apps/web/src/components/sections/OrdersSection.tsx` and `expressoApi`:

- Hot/cold badge beside the status pill in list rows and the detail view.
- Detail view fetches `GET /orders/:id/status` via the existing web → BFF
  proxy, then schedules one timeout at `coolsAt` to refetch, so the badge
  flips live without polling. Timeout is cleared on unmount/selection change.

### Smoke

`./dev smoke` adds a typed-shape check for `GET /orders/:id/status`
(15 → 16 checks).

## k6 scenarios

### order-status (new)

`tests/performance/k6/scenarios/order-status/order-status.ts`,
`workflows/order-status.yaml`:

- Init: load `__ENV.DATA_ORDERS_CSV` into a `SharedArray`, drop the header.
- Iteration `i` uses row `i % n`; `GET /orders/:id/status`.
- Checks: status 200; `orderId` matches; `temperature ∈ {hot, cold}`;
  `coolsAt - placedAt` equals `ORDER_COOL_DOWN_SECONDS` (forwarded, default
  300); temperature matches `EXPECT_TEMPERATURE`:
  - `auto` (default): expected = `hot` if k6 `now < coolsAt` else `cold`;
    rows within ±2 s of `coolsAt` accept either value.
  - `hot` / `cold`: fixed expectation.
- Forwards `BASE_URL, VUS, ITERATIONS, EXPECT_TEMPERATURE, ORDER_COOL_DOWN_SECONDS`.
  Default `VUS=1 ITERATIONS=5`.
- Thresholds named in `config/thresholds.ts`.
- `spec.data.requires: [orders]`.

### Producers

| Workflow | Requires | Produces | Record |
|---|---|---|---|
| `cart-fulfill` | — | `carts` → `place-order` | `[DATA carts] <cartId>,<productId>,<sid>` |
| `cart-fulfill-browser` | — | `carts` → `place-order` | `[DATA carts] <cartId>,,<sid>` |
| `place-order` | `carts` | `orders` → `order-status` | `[DATA orders] <orderId>` after order verified |
| `purchase-flow` | — | `orders` → `order-status` | same |
| `purchase-flow-browser` | — | `orders` → `order-status` | same; `orderId` read from the rendered `[data-testid="home-orders"] p.font-mono` text |

`place-order.ts` reads `__ENV.DATA_CARTS_CSV` and skips the header row.

## Testing

TDD in every layer: write the failing test first.

- **Punch** (`vendor/punch/tests`): schema parsing and rejection cases;
  catalog cross-validation; `[DATA]` routing, column count, undeclared dataset,
  opt-in on/off, header, atomic publish and preserve-on-failure; consumer
  preflight messages; `DATA_X_CSV` injection; `--data` override bounds; menu
  annotations and per-dataset prompt.
- **Orchestrator** (`scripts/pg/tests`): workflow YAML contract tests and docs
  contract updated; `perf.py` pass-through tests; deleted-helper tests removed.
  `pnpm pg:test` green.
- **BFF** (Vitest): `order-temperature.spec.ts` (4:59 hot, 5:00 cold, 5:01
  cold; env parsing); `orders.service.spec.ts` (`getStatus` hits Prisma, not
  cache; 404); `orders.controller.spec.ts` (route).
- **Web**: badge renders hot and cold.
- **End-to-end evidence**, with the BFF started at
  `ORDER_COOL_DOWN_SECONDS=20`:
  1. `./dev perf:cart-fulfill --produce carts` → `./dev perf:place-order --produce orders` → `./dev perf:order-status` (hot).
  2. Wait 20 s → `EXPECT_TEMPERATURE=cold ./dev perf:order-status`.
  3. Repeat step 1's consumer with `purchase-flow` and `purchase-flow-browser` as producers.
  4. `./dev smoke` 16/16.
  5. Push and watch a real CI run before declaring done.

## Documentation

- `docs/next-steps/order-temperature.md` with
  `TODO(next-steps/order-temperature)` anchors in source.
- `tests/performance/k6/README.md`: replace the CSV sections with a
  "Data pipeline (produce / require)" section; add `order-status`; update the
  mapping table.
- `docs/performance/orchestrator.md`: data contract.
- `docs/cli-reference.md`: `--produce`, `--data`, `perf:order-status`; remove
  `--confirm-output-data`.
- `CLAUDE.md`: performance note switches from `--confirm-output-data` to
  `--produce`.
- Punch submodule README/docs.

## Delivery order

Separate commits per layer; each step green before the next.

1. Punch data contract + migration of the carts chain (behavior unchanged).
   Submodule commits, then pointer bump.
2. BFF temperature rule, `/orders/:id/status`, contracts.
3. Web badge.
4. `order-status` scenario + `orders` producers + smoke check.
5. Docs.
