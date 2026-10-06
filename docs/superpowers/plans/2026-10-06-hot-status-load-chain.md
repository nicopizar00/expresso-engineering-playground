# Hot-Status Load Chain Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Three chained k6 workflows (`purchase-registered` → `login` →
`hot-status`) that load-test `GET /account/hot-status`, with Punch gaining
optional datasets so `login` can fall back to the seeded demo users.

**Architecture:** Punch (`vendor/punch`, its own git repo) gets
`spec.data.optional`: used when the file has rows, skipped otherwise. This
repo adds three TypeScript k6 scenarios, three workflow YAMLs, `./dev perf:*`
commands, and docs. Data flows through the git-ignored
`tests/performance/k6/data/` as `owned-orders` and `auth-tokens` CSVs.

**Tech Stack:** Python 3 stdlib + PyYAML (Punch, `scripts/pg`), k6 0.54
TypeScript bundled by esbuild, Docker Compose.

**Spec:** `docs/superpowers/specs/2026-10-06-hot-status-load-chain-design.md`

## Global Constraints

- No AI attribution in commits or docs. English only. Demo data stays
  fictional (`@example.test`).
- Demo users (mirror `apps/bff/prisma/seed.ts`): `ana, ben, dario, elena,
felix, gia, hugo, iris, jonas, kira, leo, mila`; email
  `<username>@example.test`; password `espresso-demo`.
- Datasets: `owned-orders` columns `[orderId, username, email]`;
  `auth-tokens` columns `[username, authToken]`. Never a password in a
  dataset.
- New thresholds for all three workflows: `http_req_failed: ["rate<0.10"]`,
  `checks: ["rate>0.90"]`, `http_req_duration: ["p(90)<1000"]`
  (purchase-registered, login) and `["p(90)<500"]` (hot-status). Existing
  thresholds unchanged.
- Default load: 5 iterations; `DURATION` (where forwarded) switches to
  `constant-vus`.
- Punch commits stay local in `vendor/punch`. Pushing Punch and the outer
  repo happens only at merge time with the owner's OK, Punch first.
- Punch test command (from `vendor/punch`):
  `PYTHONPATH=src python3 -m unittest discover -s tests -p 'test_*.py'`.
  Baseline: 115 tests, 1 pre-existing error (`test_menu` cannot import
  `simple_term_menu` on the local Python). That error is out of scope.
- Every outer commit passes `pnpm lint`, `pnpm format`, `pnpm typecheck`,
  `pnpm pg:test`.

## Review Focus

1. **Optional dataset file exists but is header-only** — expected: treated as
   absent (no env var, Punch note), not passed to k6 as an empty pool. Pinned
   in Task 2 (`test_optional_header_only_is_absent`).
2. **`--data` override for an optional dataset pointing at an empty file** —
   expected: same as absent; never a crash. Pinned in Task 2.
3. **Login fed an `owned-orders.csv` with duplicate usernames** — expected:
   each iteration logs in again (new session), no dedupe error. Covered by
   design (`i % length`); verified in the Task 6 live run.
4. **`USERS` env containing blanks or trailing commas** (`"ana, ,ben,"`) —
   expected: blanks dropped, never an empty username sent. Pinned in Task 3
   (`parseUsers`).
5. **Login response without an `auth` cookie** (e.g. 401) — expected: check
   fails, no `[DATA auth-tokens]` row printed. Covered by the guarded emit in
   Task 4.

---

### Task 1: Punch — parse `spec.data.optional`

**Files (all under `vendor/punch/`):**

- Modify: `src/punch/workflow.py` (`DATA_KEYS`, `DataSpec`, `_data_spec`)
- Modify: `tests/test_workflow.py`

**Interfaces:**

- Produces: `DataSpec.optional: tuple[str, ...]` (default `()`), parsed from
  `spec.data.optional`.

- [ ] **Step 1: Write failing tests**

In `tests/test_workflow.py`, replace `test_rejects_data_without_produces_or_requires`
with:

```python
    def test_rejects_data_without_produces_requires_or_optional(self) -> None:
        self.assertWorkflowError(
            "spec.data must declare produces, requires, or optional",
            (
                "    produces:\n      - dataset: orders\n        columns: [orderId]\n"
                "        targets: [order-status]\n    requires: [carts]\n",
                "",
            ),
        )
```

and add after `test_rejects_duplicate_required_dataset`:

```python
    def test_parses_optional_datasets(self) -> None:
        self.write_workflow(
            self.workflow_path,
            ("    requires: [carts]\n", "    requires: [carts]\n    optional: [orders-in, extra]\n"),
        )
        workflow = load_workflow(self.workflow_path)
        self.assertEqual(workflow.data.optional, ("orders-in", "extra"))
        self.assertEqual(workflow.data.requires, ("carts",))

    def test_optional_alone_is_enough(self) -> None:
        self.write_workflow(
            self.workflow_path,
            (
                "    produces:\n      - dataset: orders\n        columns: [orderId]\n"
                "        targets: [order-status]\n    requires: [carts]\n",
                "    optional: [carts]\n",
            ),
        )
        workflow = load_workflow(self.workflow_path)
        self.assertEqual(workflow.data.optional, ("carts",))
        self.assertEqual(workflow.data.requires, ())
        self.assertEqual(workflow.data.produces, ())

    def test_optional_defaults_to_empty(self) -> None:
        self.assertEqual(load_workflow(self.workflow_path).data.optional, ())

    def test_rejects_empty_optional(self) -> None:
        self.assertWorkflowError(
            "spec.data.optional must be a non-empty list",
            ("    requires: [carts]\n", "    requires: [carts]\n    optional: []\n"),
        )

    def test_rejects_invalid_optional_dataset_name(self) -> None:
        self.assertWorkflowError(
            "optional dataset must match",
            ("    requires: [carts]\n", "    requires: [carts]\n    optional: [Bad]\n"),
        )

    def test_rejects_duplicate_optional_dataset(self) -> None:
        self.assertWorkflowError(
            "duplicate dataset in spec.data.optional: extra",
            ("    requires: [carts]\n", "    requires: [carts]\n    optional: [extra, extra]\n"),
        )

    def test_rejects_dataset_both_required_and_optional(self) -> None:
        self.assertWorkflowError(
            "dataset carts is both required and optional",
            ("    requires: [carts]\n", "    requires: [carts]\n    optional: [carts]\n"),
        )
```

(`write_workflow(path, (old, new))` is the existing helper behind
`assertWorkflowError`; confirm its signature in the file before use and adapt
the call if it differs.)

- [ ] **Step 2: Run to verify failure**

Run (from `vendor/punch`): `PYTHONPATH=src python3 -m unittest tests.test_workflow`
Expected: FAIL — `unknown field spec.data.optional` / attribute `optional` missing.

- [ ] **Step 3: Implement**

In `src/punch/workflow.py`:

```python
@dataclass(frozen=True)
class DataSpec:
    directory: Path
    mounted_at: str
    produces: tuple[DataProduct, ...]
    requires: tuple[str, ...]
    # Datasets used when their file has rows, skipped otherwise.
    optional: tuple[str, ...] = ()
```

`DATA_KEYS = {"directory", "mountedAt", "produces", "requires", "optional"}`

Add a helper above `_data_spec`:

```python
def _dataset_list(data: dict[str, Any], key: str) -> list[str]:
    if key not in data:
        return []
    raw = data[key]
    if not isinstance(raw, list) or not raw:
        raise WorkflowError(f"spec.data.{key} must be a non-empty list")
    names: list[str] = []
    for item in raw:
        if not isinstance(item, str) or not NAME_PATTERN.fullmatch(item):
            raise WorkflowError(f"spec.data.{key} dataset must match {NAME_PATTERN.pattern}")
        if item in names:
            raise WorkflowError(f"duplicate dataset in spec.data.{key}: {item}")
        names.append(item)
    return names
```

In `_data_spec`: change the guard to

```python
    if not any(key in data for key in ("produces", "requires", "optional")):
        raise WorkflowError("spec.data must declare produces, requires, or optional")
```

replace the whole `requires` block with

```python
    requires = _dataset_list(data, "requires")
    optional = _dataset_list(data, "optional")
    for dataset in optional:
        if dataset in requires:
            raise WorkflowError(f"dataset {dataset} is both required and optional")

    return DataSpec(directory, mounted_at, tuple(produces), tuple(requires), tuple(optional))
```

The existing error texts `spec.data.requires must be a non-empty list`,
`spec.data.requires dataset must match`, and
`duplicate dataset in spec.data.requires: carts` are preserved by the helper.

- [ ] **Step 4: Run**

Run: `PYTHONPATH=src python3 -m unittest tests.test_workflow`
Expected: all pass.
Then the full suite: `PYTHONPATH=src python3 -m unittest discover -s tests -p 'test_*.py'`
Expected: only the pre-existing `test_menu` import error.

- [ ] **Step 5: Commit (inside `vendor/punch`)**

```bash
git -C vendor/punch add src/punch/workflow.py tests/test_workflow.py
git -C vendor/punch commit -m "feat(data): parse optional datasets in spec.data"
```

---

### Task 2: Punch — run, catalog, and docs for optional datasets

**Files (under `vendor/punch/`):**

- Modify: `src/punch/execution.py`, `src/punch/catalog.py`,
  `src/punch/__main__.py`, `src/punch/menu.py`
- Modify: `tests/test_execution.py`, `tests/test_catalog.py`
- Modify: `README.md` (data section), `CHANGELOG.md`
- Outer repo: `vendor/punch` submodule pointer

**Interfaces:**

- Consumes: `DataSpec.optional` (Task 1).
- Produces (in `punch.execution`):
  - `optional_data_paths(workflow, overrides) -> dict[str, Path]`
  - `used_data_paths(workflow, overrides) -> dict[str, Path]` — required plus
    optional datasets whose file has data rows
  - `absent_optional_datasets(workflow, overrides) -> tuple[str, ...]`
  - `data_environment` now injects `used_data_paths`.
- Produces (catalog): `consumers_of` includes optional consumers; targets may
  name optional consumers.

- [ ] **Step 1: Failing execution tests**

In `tests/test_execution.py`, add to `ExecutionTests.setUp` (after
`self.consumer = ...`):

```python
        consumer_text = (self.root / "data-input.yaml").read_text(encoding="utf-8")
        (self.root / "data-optional.yaml").write_text(
            consumer_text.replace("name: data-consumer", "name: data-optional").replace(
                "requires: [carts]", "optional: [carts]"
            ),
            encoding="utf-8",
        )
        self.optional_consumer = load_workflow(self.root / "data-optional.yaml")
```

Add tests:

```python
    def run_optional(self, overrides=None):
        out = io.StringIO()
        result = execute_workflow(
            self.optional_consumer,
            environment=self.env,
            data_overrides=overrides or {},
            stdout=out,
            stderr=io.StringIO(),
        )
        return result, out.getvalue()

    def test_optional_missing_file_runs_without_env_and_prints_note(self) -> None:
        result, out = self.run_optional()
        self.assertTrue(result.passed, result.failure)
        args = self.args_path.read_text(encoding="utf-8").splitlines()
        self.assertFalse(any(a.startswith("DATA_CARTS_CSV=") for a in args))
        self.assertIn(
            '[punch] optional dataset "carts" not present — scenario uses its default', out
        )

    def test_optional_header_only_is_absent(self) -> None:
        self.write_carts("cartId,productId,sid\n\n")
        result, out = self.run_optional()
        self.assertTrue(result.passed, result.failure)
        args = self.args_path.read_text(encoding="utf-8").splitlines()
        self.assertFalse(any(a.startswith("DATA_CARTS_CSV=") for a in args))
        self.assertIn('optional dataset "carts" not present', out)

    def test_optional_present_file_injects_container_path(self) -> None:
        self.write_carts("cartId,productId,sid\nc,p,s\n")
        result, out = self.run_optional()
        self.assertTrue(result.passed, result.failure)
        self.assertIn(
            "DATA_CARTS_CSV=/scripts/data/carts.csv",
            self.args_path.read_text(encoding="utf-8").splitlines(),
        )
        self.assertNotIn("optional dataset", out)

    def test_optional_override_is_accepted_and_empty_override_is_absent(self) -> None:
        from punch.execution import resolve_data_overrides
        alt = self.root / "data" / "alt.csv"
        alt.parent.mkdir(parents=True, exist_ok=True)
        alt.write_text("cartId,productId,sid\nc,p,s\n", encoding="utf-8")
        overrides = resolve_data_overrides(self.optional_consumer, ["carts=data/alt.csv"])
        result, _ = self.run_optional(overrides)
        self.assertTrue(result.passed, result.failure)
        self.assertIn(
            "DATA_CARTS_CSV=/scripts/data/alt.csv",
            self.args_path.read_text(encoding="utf-8").splitlines(),
        )
        alt.write_text("cartId,productId,sid\n", encoding="utf-8")
        result, out = self.run_optional(overrides)
        self.assertTrue(result.passed, result.failure)
        self.assertIn('optional dataset "carts" not present', out)

    def test_used_data_paths_covers_required_and_present_optional(self) -> None:
        from punch.execution import used_data_paths
        self.assertEqual(used_data_paths(self.optional_consumer, {}), {})
        self.write_carts("cartId,productId,sid\nc,p,s\n")
        self.assertEqual(used_data_paths(self.optional_consumer, {}), {"carts": self.carts_path})
        self.assertEqual(used_data_paths(self.consumer, {}), {"carts": self.carts_path})
```

- [ ] **Step 2: Failing catalog tests**

In `tests/test_catalog.py` add:

```python
    def test_target_may_name_an_optional_consumer(self) -> None:
        self.edit("data-input.yaml", "requires: [carts]", "optional: [carts]")
        catalog = load_catalog(self.root)
        self.assertEqual(catalog.consumers_of("carts"), ("data-consumer",))

    def test_optional_dataset_without_producer_is_allowed(self) -> None:
        self.edit("data-input.yaml", "requires: [carts]", "requires: [carts]\n    optional: [extras]")
        catalog = load_catalog(self.root)
        self.assertEqual(catalog.producers_of("extras"), ())
```

- [ ] **Step 3: Run to verify failure**

Run: `PYTHONPATH=src python3 -m unittest tests.test_execution tests.test_catalog`
Expected: the new tests FAIL (no note printed, `DATA_CARTS_CSV` missing,
`used_data_paths` missing, catalog "does not require").

- [ ] **Step 4: Implement execution**

In `src/punch/execution.py`:

- `resolve_data_overrides`: change the dataset check to

```python
        if workflow.data is None or (
            dataset not in workflow.data.requires and dataset not in workflow.data.optional
        ):
            raise ValueError(f'workflow {workflow.name} does not require "{dataset}"')
```

- After `_has_data_rows`, add:

```python
def optional_data_paths(
    workflow: K6Workflow, overrides: Mapping[str, Path]
) -> dict[str, Path]:
    if workflow.data is None:
        return {}
    return {
        dataset: overrides.get(dataset, workflow.data.host_path(dataset))
        for dataset in workflow.data.optional
    }


def used_data_paths(workflow: K6Workflow, overrides: Mapping[str, Path]) -> dict[str, Path]:
    """Required datasets plus optional ones whose file has data rows."""
    used = required_data_paths(workflow, overrides)
    for dataset, path in optional_data_paths(workflow, overrides).items():
        if _has_data_rows(path):
            used[dataset] = path
    return used


def absent_optional_datasets(
    workflow: K6Workflow, overrides: Mapping[str, Path]
) -> tuple[str, ...]:
    return tuple(
        dataset
        for dataset, path in optional_data_paths(workflow, overrides).items()
        if not _has_data_rows(path)
    )
```

- `data_environment`: docstring "Container paths of every used dataset,
  keyed DATA\_<NAME>\_CSV." and iterate `used_data_paths(workflow, overrides)`
  instead of `required_data_paths(...)`.
- In `execute_workflow`, right after
  `errors = stderr if stderr is not None else sys.stderr`:

```python
    for dataset in absent_optional_datasets(workflow, overrides):
        output.write(
            f'[punch] optional dataset "{dataset}" not present — scenario uses its default\n'
        )
```

- In `src/punch/__main__.py` and `src/punch/menu.py`: import
  `used_data_paths` and pass `used_data_paths(workflow, overrides)` /
  `used_data_paths(workflow, {})` to `confirm_delete_consumed` instead of
  `required_data_paths(...)`. Drop the `required_data_paths` import where it
  becomes unused.

- [ ] **Step 5: Implement catalog**

In `src/punch/catalog.py`:

```python
    def consumers_of(self, dataset: str) -> tuple[str, ...]:
        return tuple(sorted(
            name for name, workflow in self.workflows.items()
            if workflow.data is not None
            and (dataset in workflow.data.requires or dataset in workflow.data.optional)
        ))
```

and in `_validate` the target check becomes

```python
                if target_workflow.data is None or (
                    product.dataset not in target_workflow.data.requires
                    and product.dataset not in target_workflow.data.optional
                ):
```

(the producer-less check stays on `requires` only, so optional datasets
without a producer are allowed).

- [ ] **Step 6: Docs**

`README.md`, data section: add `optional: [extras]` under `requires: [carts]`
in the YAML sample, and this bullet after the consumer bullet:

```markdown
- An optional dataset (`optional: [...]`) is used when its file has at least
  one row: Punch injects `DATA_<DATASET>_CSV` as for a required one. When the
  file is missing or header-only, the variable is left unset, the run
  continues, and Punch prints
  `[punch] optional dataset "<name>" not present — scenario uses its default`.
  `--data` and the delete prompt work the same; a producer's `targets` may
  name an optional consumer, and an optional dataset needs no producer.
```

Change "each target exists and requires the dataset" to "each target exists
and requires or optionally consumes the dataset".

`CHANGELOG.md` under `## [Unreleased]`:

```markdown
- Optional datasets: `spec.data.optional` lists datasets a workflow uses when
  present and skips otherwise.
```

- [ ] **Step 7: Run**

Run: `PYTHONPATH=src python3 -m unittest discover -s tests -p 'test_*.py'`
Expected: all pass except the pre-existing `test_menu` import error.

- [ ] **Step 8: Commit in Punch, then bump the pointer**

```bash
git -C vendor/punch add -A src tests README.md CHANGELOG.md
git -C vendor/punch commit -m "feat(data): optional datasets in execution, catalog, and docs"
git add vendor/punch
git commit -m "chore: bump punch for optional datasets"
pnpm pg:test
```

Expected: `pnpm pg:test` OK (outer tests load the bumped Punch). Do not push
either repo.

---

### Task 3: `purchase-registered` scenario and workflow

**Files:**

- Create: `tests/performance/k6/support/demo-users.ts`
- Modify: `tests/performance/k6/config/thresholds.ts`
- Create: `tests/performance/k6/scenarios/purchase-registered/purchase-registered.ts`
- Create: `tests/performance/k6/workflows/purchase-registered.yaml`
- Modify: `tests/performance/k6/package.json` (build entry)
- Modify: `scripts/pg/perf.py`, `scripts/pg/cli.py`, `package.json`, `Taskfile.yml`
- Modify: `scripts/pg/tests/test_k6_workflows.py`, `scripts/pg/tests/test_k6runner.py`

**Interfaces:**

- Produces: `DEMO_USERS: readonly string[]`, `demoUserEmail(username): string`,
  `parseUsers(raw: string | undefined): string[]` from `support/demo-users.ts`;
  `purchaseRegisteredThresholds`, `loginThresholds`, `hotStatusThresholds`
  from `config/thresholds.ts`; dataset `owned-orders` targeting `login`.

- [ ] **Step 1: Failing pg tests**

In `scripts/pg/tests/test_k6_workflows.py`:

- add `"purchase-registered"` to `expected_names`;
  `"purchase-registered": "k6"` to `expected_compose_service`;
  `"purchase-registered": ["BASE_URL", "VUS", "DURATION", "ITERATIONS", "USERS"]`
  to `expected_environment_forward`;
  `"purchase-registered": {"produces": {"owned-orders": ("login",)}, "requires": ()}`
  to `expected_data`.
- Replace `self.assertEqual(len(workflow_paths), 7)` with
  `self.assertEqual(len(workflow_paths), len(expected_names))`.
- After `self.assertEqual(workflow.data.requires, expected["requires"])` add
  `self.assertEqual(workflow.data.optional, expected.get("optional", ()))`.

In `scripts/pg/tests/test_k6runner.py`: add
`(perf.purchase_registered, "purchase-registered", {})` to the cases, and
`"purchase_registered"` to `names`.

**Expected intermediate state (Tasks 3–4):** Punch's catalog validates every
`targets` link, and `targets` must be non-empty, so `owned-orders → login`
cannot pass until Task 4 adds `login.yaml` (and `auth-tokens → hot-status`
until Task 5). Between Tasks 3 and 5 the only allowed `pnpm pg:test`
failures are `targets unknown workflow "login"` / `"hot-status"`. Task 5
restores a fully green suite; record this in the ledger as a ruling.

- [ ] **Step 2: Run to verify failure**

Run: `pnpm pg:test 2>&1 | tail -8`
Expected: FAIL — `purchase-registered` missing, `perf.purchase_registered`
missing.

- [ ] **Step 3: Shared users and thresholds**

`tests/performance/k6/support/demo-users.ts`:

```ts
// Seeded demo users — mirror of apps/bff/prisma/seed.ts. All share the
// password `espresso-demo` (DEMO_PASSWORD in the login scenario).
export const DEMO_USERS: readonly string[] = [
  "ana",
  "ben",
  "dario",
  "elena",
  "felix",
  "gia",
  "hugo",
  "iris",
  "jonas",
  "kira",
  "leo",
  "mila",
];

export function demoUserEmail(username: string): string {
  return `${username}@example.test`;
}

// USERS=ana,ben narrows the pool; blanks are dropped; empty → all demo users.
export function parseUsers(raw: string | undefined): string[] {
  const picked = (raw ?? "")
    .split(",")
    .map((u) => u.trim().toLowerCase())
    .filter((u) => u.length > 0);
  return picked.length > 0 ? picked : [...DEMO_USERS];
}
```

Append to `tests/performance/k6/config/thresholds.ts`:

```ts
// Hot-status load chain (purchase-registered → login → hot-status): looser
// gates than the purchase flow — up to 10% failures, p90 latency.
export const purchaseRegisteredThresholds = {
  http_req_failed: ["rate<0.10"],
  http_req_duration: ["p(90)<1000"],
  checks: ["rate>0.90"],
};

// One scrypt verification per login.
export const loginThresholds = {
  http_req_failed: ["rate<0.10"],
  http_req_duration: ["p(90)<1000"],
  checks: ["rate>0.90"],
};

export const hotStatusThresholds = {
  http_req_failed: ["rate<0.10"],
  http_req_duration: ["p(90)<500"],
  checks: ["rate>0.90"],
};
```

- [ ] **Step 4: Scenario**

`tests/performance/k6/scenarios/purchase-registered/purchase-registered.ts`:

```ts
// Purchase-registered scenario — first link of the hot-status load chain.
//
// Places one anonymous order per iteration FOR a seeded demo user
// (orderFor: {type: "user", recipient}), verifies the persisted owner, and
// emits `[DATA owned-orders] <orderId>,<username>,<email>`. With
// `--produce owned-orders` Punch publishes those rows; `login` consumes them
// as an optional dataset.
//
// Users: support/demo-users.ts (round-robin by iteration); USERS=ana,ben
// narrows the pool. Each iteration clears its cookie jar so it gets a fresh
// cart session (`sid`) and never inherits an occupied cart.
//
// Coverage:
//   POST /cart/items   — add prod_espresso
//   POST /checkout     — orderFor another user
//   GET  /orders/:id   — owner is {username}

import http from "k6/http";
import { check, group, sleep } from "k6";
import exec from "k6/execution";
import { url } from "../../config/env";
import { purchaseRegisteredThresholds } from "../../config/thresholds";
import { demoUserEmail, parseUsers } from "../../support/demo-users";
import { buildSummaryOutputs } from "../../support/report";

// @types/k6 doesn't declare k6's global `console`; needed for [DATA] rows.
declare const console: { log: (message: string) => void };

const USERS = parseUsers(__ENV.USERS);
const VUS = Number(__ENV.VUS) || 1;
const DURATION = __ENV.DURATION || "30s";
const ITERATIONS = __ENV.ITERATIONS
  ? Number(__ENV.ITERATIONS)
  : __ENV.DURATION
    ? undefined
    : 5;

const scenario = ITERATIONS
  ? {
      executor: "shared-iterations",
      vus: VUS,
      iterations: ITERATIONS,
      maxDuration: "5m",
    }
  : { executor: "constant-vus", vus: VUS, duration: DURATION };

export const options = {
  scenarios: { purchase_registered: scenario },
  thresholds: purchaseRegisteredThresholds,
  tags: { suite: "mini-commerce-purchase-registered" },
};

const JSON_HEADERS = { "Content-Type": "application/json" };

export default function () {
  const username = USERS[exec.scenario.iterationInTest % USERS.length];
  let cartId: string | undefined;
  let orderId: string | undefined;
  http.cookieJar().clear(url("/"));

  group("cart: add item", () => {
    const res = http.post(
      url("/cart/items"),
      JSON.stringify({ productId: "prod_espresso", quantity: 1 }),
      { headers: JSON_HEADERS },
    );
    const ok = check(res, { "cart add 201": (r) => r.status === 201 });
    if (ok) cartId = res.json("cartId") as string | undefined;
  });

  group("checkout: order for user", () => {
    if (!cartId) return;
    const res = http.post(
      url("/checkout"),
      JSON.stringify({
        cartId,
        orderFor: { type: "user", recipient: username },
      }),
      { headers: JSON_HEADERS },
    );
    const ok = check(res, {
      "checkout 201": (r) => r.status === 201,
      "checkout returns orderId": (r) => {
        try {
          return typeof r.json("orderId") === "string";
        } catch {
          return false;
        }
      },
    });
    if (ok) orderId = res.json("orderId") as string;
  });

  group("orders: verify owner", () => {
    if (!orderId) return;
    const res = http.get(url(`/orders/${orderId}`));
    const owned = check(res, {
      "order 200": (r) => r.status === 200,
      "order owned by user": (r) => {
        try {
          return (
            (r.json("owner") as { username?: string } | null)?.username ===
            username
          );
        } catch {
          return false;
        }
      },
    });
    if (owned) {
      console.log(
        `[DATA owned-orders] ${orderId},${username},${demoUserEmail(username)}`,
      );
    }
  });

  sleep(1);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function handleSummary(data: any) {
  const meta = {
    title: "Mini-Commerce Purchase Registered",
    testType: "purchase-registered",
    targetUrl: url(""),
  };
  return buildSummaryOutputs(
    data,
    meta,
    "/scripts/reports/purchase-registered-report.html",
    "/scripts/reports/purchase-registered-summary.json",
  );
}
```

(`CheckoutDto.cartId` is required — it proves the caller holds the
reservation — so the cart-add response's `cartId` is sent with checkout.)

- [ ] **Step 5: Workflow and wiring**

`tests/performance/k6/workflows/purchase-registered.yaml`:

```yaml
apiVersion: punch/v1
kind: K6Workflow
metadata:
  name: purchase-registered
spec:
  workingDirectory: ../../../..
  compose:
    file: infra/docker/compose.performance.yaml
    service: k6
  k6:
    script: /scripts/scenarios/purchase-registered/purchase-registered.js
  environment:
    forward: [BASE_URL, VUS, DURATION, ITERATIONS, USERS]
  outputs:
    summary:
      path: tests/performance/k6/reports/purchase-registered-summary.json
  data:
    directory: tests/performance/k6/data
    mountedAt: /scripts/data
    produces:
      - dataset: owned-orders
        columns: [orderId, username, email]
        targets: [login]
```

- `tests/performance/k6/package.json` build: append
  `scenarios/purchase-registered/purchase-registered.ts` to the esbuild entry
  list (before `--bundle`).
- `scripts/pg/perf.py` after `order_status`:

```python
def purchase_registered(args: Sequence[str]) -> int:
    return run_k6("purchase-registered", args)
```

- `scripts/pg/cli.py`: add `_perf_purchase_registered` (same shape as
  `_perf_order_status`) and `"perf:purchase-registered": _perf_purchase_registered,`
  after the `perf:order-status` entry.
- Root `package.json`: `"pg:perf:purchase-registered": "./dev perf:purchase-registered",`
  after `pg:perf:order-status`.
- `Taskfile.yml` after `perf:order-status`:

```yaml
perf:purchase-registered:
  desc: k6 purchase-registered profile in Docker (orders for seeded demo users; produces owned-orders)
  cmds:
    - pnpm pg:perf:purchase-registered
```

- [ ] **Step 6: Run**

Run: `pnpm --filter @mini-commerce/k6-scenarios build && pnpm typecheck && pnpm lint && pnpm format`
Expected: pass; `dist/purchase-registered/purchase-registered.js` exists.
`pnpm pg:test 2>&1 | tail -8` — Expected: failures limited to the catalog
link `targets unknown workflow "login"` (see Step 1).

- [ ] **Step 7: Commit**

```bash
git add tests/performance/k6 scripts/pg package.json Taskfile.yml
git commit -m "feat(perf): purchase-registered workflow producing owned-orders"
```

---

### Task 4: `login` scenario and workflow

**Files:**

- Create: `tests/performance/k6/scenarios/login/login.ts`
- Create: `tests/performance/k6/workflows/login.yaml`
- Modify: k6 `package.json` build, `scripts/pg/perf.py`, `scripts/pg/cli.py`,
  root `package.json`, `Taskfile.yml`, both pg test files

**Interfaces:**

- Consumes: `DEMO_USERS` (Task 3), `loginThresholds` (Task 3), optional
  dataset support (Task 2), `owned-orders` (Task 3).
- Produces: dataset `auth-tokens` `[username, authToken]` targeting
  `hot-status`.

- [ ] **Step 1: Failing pg tests**

`test_k6_workflows.py`: add `"login"` to names; `"login": "k6"`;
`"login": ["BASE_URL", "VUS", "ITERATIONS", "DEMO_PASSWORD"]`;
`"login": {"produces": {"auth-tokens": ("hot-status",)}, "requires": (), "optional": ("owned-orders",)}`.
In `K6WorkflowCatalogTests.test_workflow_catalog_links_are_valid` add:

```python
        self.assertEqual(catalog.producers_of("owned-orders"), ("purchase-registered",))
        self.assertEqual(catalog.consumers_of("owned-orders"), ("login",))
```

`test_k6runner.py`: add `(perf.login, "login", {})` and `"login"` to names.

The catalog will now reject `auth-tokens` → `hot-status` until Task 5; same
ruling as Task 3: the remaining expected pg failure is
`targets unknown workflow "hot-status"`.

- [ ] **Step 2: Run to verify failure**

Run: `pnpm pg:test 2>&1 | tail -8`
Expected: FAIL on missing `login` workflow / `perf.login`.

- [ ] **Step 3: Scenario**

`tests/performance/k6/scenarios/login/login.ts`:

```ts
// Login scenario — second link of the hot-status load chain.
//
// Source of users (Punch optional dataset, spec.data.optional):
//   - owned-orders present (DATA_OWNED_ORDERS_CSV set) → the owners of
//     orders a purchase-registered run placed (username column);
//   - absent → the seeded demo users (support/demo-users.ts).
// Each iteration clears its cookie jar, logs in (a new AuthSession row each
// time), and emits `[DATA auth-tokens] <username>,<token>` from the `auth`
// cookie. The password never enters a dataset: DEMO_PASSWORD, default
// `espresso-demo`.

import http from "k6/http";
import { check, group, sleep } from "k6";
import { SharedArray } from "k6/data";
import exec from "k6/execution";
import { url } from "../../config/env";
import { loginThresholds } from "../../config/thresholds";
import { DEMO_USERS } from "../../support/demo-users";
import { buildSummaryOutputs } from "../../support/report";

declare const console: { log: (message: string) => void };

const users = new SharedArray<string>("login-users", () => {
  const path = __ENV.DATA_OWNED_ORDERS_CSV;
  if (!path) return [...DEMO_USERS];
  return open(path)
    .split("\n")
    .slice(1)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => line.split(",")[1])
    .filter((username) => Boolean(username));
});

const PASSWORD = __ENV.DEMO_PASSWORD || "espresso-demo";
const VUS = Number(__ENV.VUS) || 1;
const ITERATIONS = __ENV.ITERATIONS ? Number(__ENV.ITERATIONS) : 5;

export const options = {
  scenarios: {
    login: {
      executor: "shared-iterations",
      vus: VUS,
      iterations: ITERATIONS,
      maxDuration: "5m",
    },
  },
  thresholds: loginThresholds,
  tags: { suite: "mini-commerce-login" },
};

const JSON_HEADERS = { "Content-Type": "application/json" };

export default function () {
  const username = users[exec.scenario.iterationInTest % users.length];
  http.cookieJar().clear(url("/"));

  group("auth: login", () => {
    const res = http.post(
      url("/auth/login"),
      JSON.stringify({ identifier: username, password: PASSWORD }),
      { headers: JSON_HEADERS },
    );
    const token = res.cookies.auth?.[0]?.value;
    const ok = check(res, {
      "login 200": (r) => r.status === 200,
      "login returns the user": (r) => {
        try {
          return r.json("username") === username;
        } catch {
          return false;
        }
      },
      "login sets auth cookie": () => Boolean(token),
    });
    if (ok && token) console.log(`[DATA auth-tokens] ${username},${token}`);
  });

  sleep(1);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function handleSummary(data: any) {
  const meta = {
    title: "Mini-Commerce Login",
    testType: "login",
    targetUrl: url(""),
  };
  return buildSummaryOutputs(
    data,
    meta,
    "/scripts/reports/login-report.html",
    "/scripts/reports/login-summary.json",
  );
}
```

- [ ] **Step 4: Workflow and wiring**

`tests/performance/k6/workflows/login.yaml`:

```yaml
apiVersion: punch/v1
kind: K6Workflow
metadata:
  name: login
spec:
  workingDirectory: ../../../..
  compose:
    file: infra/docker/compose.performance.yaml
    service: k6
  k6:
    script: /scripts/scenarios/login/login.js
  environment:
    forward: [BASE_URL, VUS, ITERATIONS, DEMO_PASSWORD]
  outputs:
    summary:
      path: tests/performance/k6/reports/login-summary.json
  data:
    directory: tests/performance/k6/data
    mountedAt: /scripts/data
    produces:
      - dataset: auth-tokens
        columns: [username, authToken]
        targets: [hot-status]
    optional: [owned-orders]
```

Wiring: build entry `scenarios/login/login.ts`; `perf.login` →
`run_k6("login", args)`; `_perf_login` + `"perf:login"`;
`"pg:perf:login": "./dev perf:login"`; Taskfile:

```yaml
perf:login:
  desc: k6 login profile in Docker (owners of owned-orders, else seeded demo users; produces auth-tokens)
  cmds:
    - pnpm pg:perf:login
```

- [ ] **Step 5: Run**

`pnpm --filter @mini-commerce/k6-scenarios build && pnpm typecheck && pnpm lint && pnpm format`
Expected: pass. `pnpm pg:test` — only the `hot-status` target link fails.

- [ ] **Step 6: Commit**

```bash
git add tests/performance/k6 scripts/pg package.json Taskfile.yml
git commit -m "feat(perf): login workflow with optional owned-orders fallback"
```

---

### Task 5: `hot-status` scenario and workflow

**Files:**

- Create: `tests/performance/k6/scenarios/hot-status/hot-status.ts`
- Create: `tests/performance/k6/workflows/hot-status.yaml`
- Modify: k6 `package.json` build, `scripts/pg/perf.py`, `scripts/pg/cli.py`,
  root `package.json`, `Taskfile.yml`, both pg test files

**Interfaces:**

- Consumes: `auth-tokens` (Task 4), `hotStatusThresholds` (Task 3).

- [ ] **Step 1: Failing pg tests**

`test_k6_workflows.py`: add `"hot-status"`; `"hot-status": "k6"`;
`"hot-status": ["BASE_URL", "VUS", "DURATION", "ITERATIONS"]`;
`"hot-status": {"produces": {}, "requires": ("auth-tokens",)}`. Catalog test:

```python
        self.assertEqual(catalog.producers_of("auth-tokens"), ("login",))
        self.assertEqual(catalog.consumers_of("auth-tokens"), ("hot-status",))
```

`test_k6runner.py`: `(perf.hot_status, "hot-status", {})` and `"hot_status"`.

- [ ] **Step 2: Run to verify failure**

Run: `pnpm pg:test 2>&1 | tail -8` — Expected: FAIL on missing `hot-status`.

- [ ] **Step 3: Scenario**

`tests/performance/k6/scenarios/hot-status/hot-status.ts`:

```ts
// Hot-status scenario — last link of the hot-status load chain.
//
// Requires the auth-tokens dataset (produced by `login --produce
// auth-tokens`). Each iteration sends one token as the `auth` cookie to
// GET /account/hot-status and checks the response shape only — orders cool
// after ORDER_COOL_DOWN_SECONDS, so hotCount may legitimately be 0.
//
// Load: ITERATIONS (default 5, shared-iterations) or DURATION (constant-vus
// soak). Tokens are reusable and the endpoint is read-only.

import http from "k6/http";
import { check, sleep } from "k6";
import { SharedArray } from "k6/data";
import exec from "k6/execution";
import { url } from "../../config/env";
import { hotStatusThresholds } from "../../config/thresholds";
import { buildSummaryOutputs } from "../../support/report";

interface TokenRow {
  username: string;
  token: string;
}

const tokens = new SharedArray<TokenRow>("auth-tokens", () =>
  open(__ENV.DATA_AUTH_TOKENS_CSV)
    .split("\n")
    .slice(1)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const [username, token] = line.split(",");
      return { username, token };
    }),
);

const VUS = Number(__ENV.VUS) || 1;
const DURATION = __ENV.DURATION || "30s";
const ITERATIONS = __ENV.ITERATIONS
  ? Number(__ENV.ITERATIONS)
  : __ENV.DURATION
    ? undefined
    : 5;

const scenario = ITERATIONS
  ? {
      executor: "shared-iterations",
      vus: VUS,
      iterations: ITERATIONS,
      maxDuration: "5m",
    }
  : { executor: "constant-vus", vus: VUS, duration: DURATION };

export const options = {
  scenarios: { hot_status: scenario },
  thresholds: hotStatusThresholds,
  tags: { suite: "mini-commerce-hot-status" },
};

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

export default function () {
  const row = tokens[exec.scenario.iterationInTest % tokens.length];
  http.cookieJar().set(url("/"), "auth", row.token);
  const res = http.get(url("/account/hot-status"));
  let body: {
    hotCount?: unknown;
    nextCoolsAt?: unknown;
    serverTime?: unknown;
  } = {};
  try {
    body = res.json() as typeof body;
  } catch {
    body = {};
  }
  check(res, {
    "hot-status 200": (r) => r.status === 200,
    "hotCount is a non-negative integer": () =>
      Number.isInteger(body.hotCount) && (body.hotCount as number) >= 0,
    "nextCoolsAt null exactly when hotCount is 0": () =>
      body.hotCount === 0
        ? body.nextCoolsAt === null
        : typeof body.nextCoolsAt === "string" && ISO.test(body.nextCoolsAt),
    "serverTime is ISO": () =>
      typeof body.serverTime === "string" && ISO.test(body.serverTime),
  });
  sleep(1);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function handleSummary(data: any) {
  const meta = {
    title: "Mini-Commerce Hot Status",
    testType: "hot-status",
    targetUrl: url(""),
  };
  return buildSummaryOutputs(
    data,
    meta,
    "/scripts/reports/hot-status-report.html",
    "/scripts/reports/hot-status-summary.json",
  );
}
```

- [ ] **Step 4: Workflow and wiring**

`tests/performance/k6/workflows/hot-status.yaml`:

```yaml
apiVersion: punch/v1
kind: K6Workflow
metadata:
  name: hot-status
spec:
  workingDirectory: ../../../..
  compose:
    file: infra/docker/compose.performance.yaml
    service: k6
  k6:
    script: /scripts/scenarios/hot-status/hot-status.js
  environment:
    forward: [BASE_URL, VUS, DURATION, ITERATIONS]
  outputs:
    summary:
      path: tests/performance/k6/reports/hot-status-summary.json
  data:
    directory: tests/performance/k6/data
    mountedAt: /scripts/data
    requires: [auth-tokens]
```

Wiring: build entry `scenarios/hot-status/hot-status.ts`; `perf.hot_status`
→ `run_k6("hot-status", args)`; `_perf_hot_status` + `"perf:hot-status"`;
`"pg:perf:hot-status": "./dev perf:hot-status"`; Taskfile:

```yaml
perf:hot-status:
  desc: k6 hot-status profile in Docker (GET /account/hot-status with auth-tokens from login)
  cmds:
    - pnpm pg:perf:hot-status
```

- [ ] **Step 5: Run**

`pnpm --filter @mini-commerce/k6-scenarios build && pnpm typecheck && pnpm lint && pnpm format && pnpm pg:test`
Expected: all pass, pg suite fully green again.

- [ ] **Step 6: Commit**

```bash
git add tests/performance/k6 scripts/pg package.json Taskfile.yml
git commit -m "feat(perf): hot-status workflow driven by auth-tokens"
```

---

### Task 6: Docs and live chain verification

**Files:**

- Modify: `tests/performance/k6/README.md` (new pipeline section after
  "place-order / purchase-flow(-browser) → order-status")
- Modify: `docs/cli-reference.md` (three rows after the order-status row)
- Modify: `docs/performance/orchestrator.md` (forwarded-env paragraph and the
  dataset table)
- Modify: `docs/architecture/orchestrator-python.md` (perf commands row)
- Modify: `docs/next-steps/hot-status.md` (load chain: shipped)

- [ ] **Step 1: README pipeline section**

Add to `tests/performance/k6/README.md`:

````markdown
### purchase-registered → login → hot-status

Load-tests `GET /account/hot-status` with real login tokens.

```bash
./dev perf:purchase-registered --produce owned-orders   # orders for seeded demo users
./dev perf:login --produce auth-tokens                  # log in their owners
./dev perf:hot-status                                    # poll with those tokens
```

- `purchase-registered` checks out anonymously with
  `orderFor: {type: "user", recipient}` for the seeded demo users
  (round-robin; `USERS=ana,ben` narrows) and emits `owned-orders`
  `[orderId, username, email]` for verified orders.
- `login` declares `owned-orders` as **optional** (`spec.data.optional`). With
  the file present it logs in those owners; without it Punch prints
  `optional dataset "owned-orders" not present` and the scenario logs in the
  12 demo users. Password: `DEMO_PASSWORD` (default `espresso-demo`); it never
  enters a dataset. Emits `auth-tokens` `[username, authToken]`.
- `hot-status` requires `auth-tokens` and checks response shape only
  (`hotCount` may be 0 once orders cool). `ITERATIONS` or `DURATION`.
- Thresholds for all three: `http_req_failed` < 10%, checks > 90%,
  p(90) < 1000 ms (500 ms for hot-status).
````

- [ ] **Step 2: Other docs**

- `docs/cli-reference.md`: three table rows, same column layout as the
  `order-status` row:
  - `k6 purchase-registered (anonymous orders for seeded demo users, produces owned-orders with --produce owned-orders), VUS/DURATION/ITERATIONS/USERS env` | `./dev perf:purchase-registered` | `pnpm pg:perf:purchase-registered` | `task perf:purchase-registered`
  - `k6 login (owners of owned-orders when present, else seeded demo users; produces auth-tokens with --produce auth-tokens), VUS/ITERATIONS/DEMO_PASSWORD env` | `./dev perf:login` | `pnpm pg:perf:login` | `task perf:login`
  - `k6 hot-status (GET /account/hot-status per auth-tokens row; shape checks), VUS/DURATION/ITERATIONS env, fails before Docker if auth-tokens is missing` | `./dev perf:hot-status` | `pnpm pg:perf:hot-status` | `task perf:hot-status`
- `docs/performance/orchestrator.md`: dataset table rows
  `| owned-orders | orderId, username, email | purchase-registered | login (optional) |`
  and `| auth-tokens | username, authToken | login | hot-status |`; one sentence
  after the table: "An optional dataset (`spec.data.optional`) is used when its
  file has rows and skipped otherwise; `login` falls back to the seeded demo
  users." Add the three workflows to the forwarded-environment paragraph.
- `docs/architecture/orchestrator-python.md`: append
  `/ perf:purchase-registered / perf:login / perf:hot-status` to the perf
  command list cell and one clause describing the chain.
- `docs/next-steps/hot-status.md`: replace the "Punch hot-status load chain"
  follow-up bullet with a "Load chain (shipped 2026-10-06)" bullet pointing at
  the README section; keep the SSE follow-up.

- [ ] **Step 3: Live chain**

With the stack up (`./dev up`) and the k6 image built
(`docker compose -f infra/docker/compose.performance.yaml build k6`):

```bash
rm -f tests/performance/k6/data/owned-orders.csv tests/performance/k6/data/auth-tokens.csv
./dev perf:purchase-registered --produce owned-orders
./dev perf:login --produce auth-tokens
./dev perf:hot-status
rm tests/performance/k6/data/owned-orders.csv
./dev perf:login --produce auth-tokens
```

Expected: each run passes its thresholds; `owned-orders.csv` and
`auth-tokens.csv` have 5 rows each after the first two runs; the last run
prints `optional dataset "owned-orders" not present — scenario uses its
default` and still produces 5 `auth-tokens` rows for demo users. Run
non-interactively (or answer "N") so consumed files are kept between steps.

- [ ] **Step 4: Gate and commit**

Run: `pnpm lint && pnpm format && pnpm typecheck && pnpm test && pnpm pg:test && ./dev smoke`
Expected: all pass (smoke 21/21).

```bash
git add tests/performance/k6/README.md docs
git commit -m "docs(perf): hot-status load chain and optional datasets"
```
