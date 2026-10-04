# Order Temperature and Punch Data Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Punch's single-CSV output/input with a generic named-dataset produce/require contract, migrate the carts chain to it, and ship a hot/cold order temperature (web → BFF → Postgres) consumed by a new `order-status` k6 workflow fed by `place-order`, `purchase-flow`, and `purchase-flow-browser`.

**Architecture:** Punch (`vendor/punch`, own git repo) gains `spec.data` (directory, mount, `produces[]` with columns/targets, `requires[]`), a catalog that cross-validates producer↔consumer links, `[DATA <dataset>]` stdout harvesting with per-run opt-in (`--produce`), consumer preflight + `DATA_<NAME>_CSV` env injection (`--data` override), and an interactive delete prompt. Expresso's `scripts/pg/perf.py` collapses to pass-through. The BFF derives temperature from `placedAt` at read time; `GET /orders/:id/status` reads Postgres directly.

**Tech Stack:** Python 3.10+ stdlib + PyYAML (Punch, `scripts/pg`), unittest; NestJS + Prisma + Vitest (BFF); Next.js + SWR (web), Playwright (`tests/e2e`); k6 TypeScript bundled by esbuild.

**Spec:** `docs/superpowers/specs/2026-10-04-order-temperature-punch-data-design.md`

## Global Constraints

- No AI attribution in commits, PR text, or docs (no `Co-Authored-By: Claude`, no "Generated with Claude Code").
- English for all committed content. No real names, URLs, IPs, or credentials.
- `scripts/pg/` core stays standard-library-only; Punch may use its pinned PyYAML.
- Punch changes are committed inside `vendor/punch` (its own repo, do not push it); the parent repo then commits the submodule pointer bump.
- Dataset names match `^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$`; column names match `^[A-Za-z_][A-Za-z0-9_]*$`.
- Dataset host file is `<spec.data.directory>/<dataset>.csv`; container path is `<spec.data.mountedAt>/<dataset>.csv`; env name is `DATA_` + dataset upper-cased with `-`→`_` + `_CSV`.
- Record line: `[DATA <dataset>] <single-row csv payload>`, stdout only.
- `ORDER_COOL_DOWN_SECONDS` default `300`, positive integer, invalid aborts BFF startup.
- Temperature: `hot` while `now - placedAt < coolDownMs`, else `cold`; applies to every status.
- `--confirm-output-data`, `spec.outputs.csv`, `spec.inputs` are removed outright.
- TDD: every code step is preceded by a failing test.

## Review Focus

1. **Producer opted in but run produces only records for a *different* declared dataset** → the opted-in dataset has zero rows, so the workflow must fail and keep the old file (pinned in Task 3, `test_opted_in_dataset_with_zero_rows_fails_and_preserves_old_file`).
2. **`cart-fulfill-browser`'s empty middle field (`abc,,sid`)** must count as 3 columns, not be rejected (Task 3, `test_empty_field_counts_toward_column_count`).
3. **Dataset file that has only a header row** (e.g. hand-truncated) must fail consumer preflight, not run k6 against zero rows (Task 4, `test_header_only_file_fails_preflight`).
4. **`--data` path that escapes `spec.data.directory`** (e.g. `../x.csv` or `/tmp/x.csv`) must be rejected before Docker, because the container cannot see it (Task 4, `test_data_override_outside_directory_is_rejected`).
5. **Order exactly at the 5:00 boundary** returns `cold`, and an `ORDER_COOL_DOWN_SECONDS` of `0`, `-5`, `1.5`, or `abc` aborts startup (Task 7, boundary and parse tests).

---

## File Map

**Punch (`vendor/punch`)**
- Modify `src/punch/workflow.py` — `DataProduct`, `DataSpec`, `K6Workflow.data`; drop `CsvOutput`/`CsvInput`.
- Create `src/punch/catalog.py` — `WorkflowCatalog`, `load_catalog`, `CatalogError`.
- Modify `src/punch/execution.py` — `[DATA]` harvesting, `DatasetResult`, `preflight_requirements`, `resolve_data_overrides`, `data_environment`, `confirm_delete_consumed`; drop `CSV_TAG`, `confirm_output_data`.
- Modify `src/punch/__main__.py` — `run --produce/--data`, evidence `datasets`.
- Modify `src/punch/menu.py` — catalog-based annotations, per-dataset produce prompt, delete prompt.
- Tests: `tests/test_workflow.py`, `tests/test_catalog.py` (new), `tests/test_execution.py`, `tests/test_cli.py`, `tests/test_menu.py`; fixtures `tests/fixtures/data-output.yaml` (replaces `csv-output.yaml`), `tests/fixtures/data-input.yaml` (new).
- Docs: `README.md` data section.

**Expresso**
- Modify `tests/performance/k6/workflows/{cart-fulfill,cart-fulfill-browser,place-order,purchase-flow,purchase-flow-browser}.yaml`; create `order-status.yaml`.
- Modify k6 scenarios `cart-fulfill.ts`, `cart-fulfill-browser.ts`, `place-order.ts`, `purchase-flow.ts`, `purchase-flow-browser.ts`; create `scenarios/order-status/order-status.ts`; modify `config/thresholds.ts`, `package.json` build entry.
- Modify `scripts/pg/k6runner.py`, `scripts/pg/perf.py`, `scripts/pg/cli.py`, `scripts/pg/smoke.py`; tests `scripts/pg/tests/test_k6runner.py`, `test_k6_workflows.py`, `test_perf_ci_docs_contract.py`.
- Modify `infra/docker/compose.performance.yaml` (k6-browser data mount).
- Modify `packages/shared-types/src/index.ts`, `packages/contracts/src/index.ts`.
- Create `apps/bff/src/modules/orders/order-temperature.ts` + `.spec.ts`; modify `orders.service.ts`, `orders.controller.ts`, `orders.module.ts`, `orders.types.ts`, their specs.
- Modify `apps/web/src/lib/api/expresso-api.ts`, `apps/web/src/lib/api/mock-data.ts`, `apps/web/src/components/sections/OrdersSection.tsx`; `tests/e2e/fixtures/commerce-api.ts`; create `tests/e2e/tests/order-temperature.spec.ts`.
- Docs: `docs/next-steps/order-temperature.md`, `docs/next-steps/README.md`, `tests/performance/k6/README.md`, `docs/performance/orchestrator.md`, `docs/cli-reference.md`, `CLAUDE.md`.

Commands used throughout:
- Punch tests: `cd vendor/punch && python3 -m unittest discover -s tests -v`
- Orchestrator tests: `pnpm pg:test`
- BFF tests: `pnpm --filter @mini-commerce/bff exec vitest run <file>`
- k6 build/typecheck: `cd tests/performance/k6 && npm run build && npm run typecheck`

---

### Task 1: Punch workflow schema — `spec.data`

**Files:**
- Modify: `vendor/punch/src/punch/workflow.py`
- Create: `vendor/punch/tests/fixtures/data-output.yaml`, `vendor/punch/tests/fixtures/data-input.yaml`
- Delete: `vendor/punch/tests/fixtures/csv-output.yaml`
- Test: `vendor/punch/tests/test_workflow.py`

**Interfaces:**
- Produces:
  ```python
  @dataclass(frozen=True)
  class DataProduct: dataset: str; columns: tuple[str, ...]; targets: tuple[str, ...]
  @dataclass(frozen=True)
  class DataSpec:
      directory: Path; mounted_at: str
      produces: tuple[DataProduct, ...]; requires: tuple[str, ...]
      def host_path(self, dataset: str) -> Path
      def container_path(self, dataset: str) -> str
      def product(self, dataset: str) -> DataProduct | None
  def data_env_name(dataset: str) -> str   # "orders" -> "DATA_ORDERS_CSV"
  K6Workflow.data: DataSpec | None          # replaces csv_output, csv_input
  ```

- [ ] **Step 1: Create fixtures**

`vendor/punch/tests/fixtures/data-output.yaml`:
```yaml
apiVersion: punch/v1
kind: K6Workflow
metadata:
  name: data-producer
spec:
  workingDirectory: .
  compose:
    file: docker-compose.yml
    service: k6
  k6:
    script: /scripts/data-producer.js
  environment:
    forward: [BASE_URL, RUN_ID]
    required: [RUN_ID]
  data:
    directory: data
    mountedAt: /scripts/data
    produces:
      - dataset: carts
        columns: [cartId, productId, sid]
        targets: [data-consumer]
```

`vendor/punch/tests/fixtures/data-input.yaml`:
```yaml
apiVersion: punch/v1
kind: K6Workflow
metadata:
  name: data-consumer
spec:
  workingDirectory: .
  compose:
    file: docker-compose.yml
    service: k6
  k6:
    script: /scripts/data-consumer.js
  environment:
    forward: [BASE_URL]
  data:
    directory: data
    mountedAt: /scripts/data
    requires: [carts]
```

Delete `tests/fixtures/csv-output.yaml` (`git rm`).

- [ ] **Step 2: Rewrite `VALID_WORKFLOW` and add failing schema tests in `tests/test_workflow.py`**

Replace the `outputs: csv:` block of `VALID_WORKFLOW` with:
```python
VALID_WORKFLOW = """\
apiVersion: punch/v1
kind: K6Workflow
metadata:
  name: csv-fixture
spec:
  workingDirectory: .
  compose:
    file: docker-compose.yml
    service: k6
  k6:
    script: /scripts/csv-fixture.js
  environment:
    forward: [BASE_URL, RUN_ID]
    required: [RUN_ID]
  data:
    directory: data
    mountedAt: /scripts/data
    produces:
      - dataset: orders
        columns: [orderId]
        targets: [order-status]
    requires: [carts]
"""
```
Update `setUp`'s `minimal_path` replacement to strip from `"  environment:\n"` to the end of the `requires` line (replace the old `outputs` literal with the new block literal). Update `test_loads_and_resolves_a_normalized_workflow` to assert:
```python
        data = workflow.data
        self.assertEqual(data.directory, self.root / "data")
        self.assertEqual(data.mounted_at, "/scripts/data")
        self.assertEqual(data.produces[0].dataset, "orders")
        self.assertEqual(data.produces[0].columns, ("orderId",))
        self.assertEqual(data.produces[0].targets, ("order-status",))
        self.assertEqual(data.requires, ("carts",))
        self.assertEqual(data.host_path("orders"), self.root / "data" / "orders.csv")
        self.assertEqual(data.container_path("orders"), "/scripts/data/orders.csv")
        self.assertEqual(data.product("orders").columns, ("orderId",))
        self.assertIsNone(data.product("carts"))
```
Delete every existing test that references `outputs.csv`, `csv_output`, `inputs`, or `csv_input`. Add:
```python
    def test_minimal_workflow_has_no_data(self) -> None:
        self.assertIsNone(load_workflow(self.minimal_path).data)

    def test_data_env_name(self) -> None:
        from punch.workflow import data_env_name
        self.assertEqual(data_env_name("orders"), "DATA_ORDERS_CSV")
        self.assertEqual(data_env_name("cart-items"), "DATA_CART_ITEMS_CSV")

    def test_rejects_legacy_csv_output(self) -> None:
        self.assertWorkflowError(
            "unknown field spec.outputs",
            ("  data:\n", "  outputs:\n    csv:\n      path: reports/x.csv\n  data:\n"),
        )

    def test_rejects_legacy_inputs(self) -> None:
        self.assertWorkflowError(
            "unknown field spec.inputs",
            ("  data:\n", "  inputs:\n    csv:\n      path: data/x.csv\n  data:\n"),
        )

    def test_rejects_directory_escaping_working_directory(self) -> None:
        self.assertWorkflowError("escapes", ("directory: data", "directory: ../outside"))

    def test_rejects_relative_mounted_at(self) -> None:
        self.assertWorkflowError(
            "spec.data.mountedAt must be an absolute container path",
            ("mountedAt: /scripts/data", "mountedAt: scripts/data"),
        )

    def test_rejects_data_without_produces_or_requires(self) -> None:
        self.assertWorkflowError(
            "spec.data must declare produces or requires",
            (
                "    produces:\n      - dataset: orders\n        columns: [orderId]\n"
                "        targets: [order-status]\n    requires: [carts]\n",
                "",
            ),
        )

    def test_rejects_invalid_dataset_name(self) -> None:
        self.assertWorkflowError("dataset must match", ("dataset: orders", "dataset: Orders"))

    def test_rejects_duplicate_produced_dataset(self) -> None:
        self.assertWorkflowError(
            "duplicate dataset in spec.data.produces: orders",
            (
                "        targets: [order-status]\n",
                "        targets: [order-status]\n      - dataset: orders\n"
                "        columns: [orderId]\n        targets: [order-status]\n",
            ),
        )

    def test_rejects_duplicate_required_dataset(self) -> None:
        self.assertWorkflowError(
            "duplicate dataset in spec.data.requires: carts",
            ("requires: [carts]", "requires: [carts, carts]"),
        )

    def test_rejects_empty_columns(self) -> None:
        self.assertWorkflowError("columns must be a non-empty list", ("columns: [orderId]", "columns: []"))

    def test_rejects_invalid_column_name(self) -> None:
        self.assertWorkflowError("columns entries must match", ("columns: [orderId]", "columns: [order-id]"))

    def test_rejects_duplicate_column(self) -> None:
        self.assertWorkflowError("duplicate column", ("columns: [orderId]", "columns: [orderId, orderId]"))

    def test_rejects_empty_targets(self) -> None:
        self.assertWorkflowError("targets must be a non-empty list", ("targets: [order-status]", "targets: []"))

    def test_rejects_invalid_target_name(self) -> None:
        self.assertWorkflowError("targets entries must match", ("targets: [order-status]", "targets: [Order]"))

    def test_rejects_unknown_product_field(self) -> None:
        self.assertWorkflowError(
            "unknown field spec.data.produces\\[0\\].path",
            ("        targets: [order-status]\n", "        targets: [order-status]\n        path: x.csv\n"),
        )
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd vendor/punch && python3 -m unittest tests.test_workflow -v`
Expected: FAIL (`unknown field spec.data`, `ImportError: data_env_name`).

- [ ] **Step 4: Implement in `workflow.py`**

Remove `CsvOutput`, `CsvInput`, `_resolve_csv_path`, `INPUT_KEYS`, `CSV_KEYS`. Set:
```python
SPEC_KEYS = {"workingDirectory", "compose", "k6", "environment", "outputs", "data"}
OUTPUT_KEYS = {"summary"}
DATA_KEYS = {"directory", "mountedAt", "produces", "requires"}
PRODUCT_KEYS = {"dataset", "columns", "targets"}
COLUMN_PATTERN = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")


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

    def host_path(self, dataset: str) -> Path:
        return self.directory / f"{dataset}.csv"

    def container_path(self, dataset: str) -> str:
        return f"{self.mounted_at.rstrip('/')}/{dataset}.csv"

    def product(self, dataset: str) -> DataProduct | None:
        return next((p for p in self.produces if p.dataset == dataset), None)


def data_env_name(dataset: str) -> str:
    return f"DATA_{dataset.upper().replace('-', '_')}_CSV"


def _unique_names(value: Any, field: str, pattern: re.Pattern[str], kind: str) -> tuple[str, ...]:
    if not isinstance(value, list) or not value:
        raise WorkflowError(f"{field} must be a non-empty list")
    names: list[str] = []
    for item in value:
        if not isinstance(item, str) or not pattern.fullmatch(item):
            raise WorkflowError(f"{field} entries must match {pattern.pattern}")
        if item in names:
            raise WorkflowError(f"duplicate {kind} in {field}: {item}")
        names.append(item)
    return tuple(names)


def _data_spec(value: Any, working_directory: Path) -> DataSpec:
    data = _allowed_keys(value, DATA_KEYS, "spec.data")
    directory = _resolve_beneath(
        working_directory,
        _string(_required(data, "directory", "spec.data"), "spec.data.directory"),
        "spec.data.directory",
    )
    mounted_at = _string(_required(data, "mountedAt", "spec.data"), "spec.data.mountedAt")
    if not mounted_at.startswith("/"):
        raise WorkflowError("spec.data.mountedAt must be an absolute container path")
    if "produces" not in data and "requires" not in data:
        raise WorkflowError("spec.data must declare produces or requires")

    produces: list[DataProduct] = []
    raw_produces = data.get("produces", [])
    if not isinstance(raw_produces, list):
        raise WorkflowError("spec.data.produces must be a list")
    for index, raw in enumerate(raw_produces):
        field = f"spec.data.produces[{index}]"
        product = _allowed_keys(raw, PRODUCT_KEYS, field)
        dataset = _string(_required(product, "dataset", field), f"{field}.dataset")
        if not NAME_PATTERN.fullmatch(dataset):
            raise WorkflowError(f"{field}.dataset must match {NAME_PATTERN.pattern}")
        if any(p.dataset == dataset for p in produces):
            raise WorkflowError(f"duplicate dataset in spec.data.produces: {dataset}")
        produces.append(DataProduct(
            dataset=dataset,
            columns=_unique_names(_required(product, "columns", field), f"{field}.columns", COLUMN_PATTERN, "column"),
            targets=_unique_names(_required(product, "targets", field), f"{field}.targets", NAME_PATTERN, "target"),
        ))

    requires: tuple[str, ...] = ()
    if "requires" in data:
        raw_requires = data["requires"]
        if not isinstance(raw_requires, list) or not raw_requires:
            raise WorkflowError("spec.data.requires must be a non-empty list")
        seen: list[str] = []
        for item in raw_requires:
            if not isinstance(item, str) or not NAME_PATTERN.fullmatch(item):
                raise WorkflowError(f"spec.data.requires dataset must match {NAME_PATTERN.pattern}")
            if item in seen:
                raise WorkflowError(f"duplicate dataset in spec.data.requires: {item}")
            seen.append(item)
        requires = tuple(seen)

    return DataSpec(directory, mounted_at, tuple(produces), requires)
```
Note the `"dataset must match"` test hits `spec.data.produces[0].dataset must match`. In `K6Workflow` replace `csv_output`/`csv_input` with `data: DataSpec | None`. In `load_workflow` delete the `outputs.csv` and `inputs` blocks and add before `return`:
```python
    data = _data_spec(spec["data"], working_directory) if "data" in spec else None
```
and pass `data=data`.

- [ ] **Step 5: Run workflow tests to verify they pass**

Run: `cd vendor/punch && python3 -m unittest tests.test_workflow -v`
Expected: PASS. Other Punch test modules (`test_execution`, `test_cli`, `test_menu`) stay red until Tasks 3–5 migrate them. Do not commit yet: Tasks 1–5 land as one submodule commit in Task 5 Step 8, after the full Punch suite is green. Stage work at the end of each task.

- [ ] **Step 6: Stage**

```bash
cd vendor/punch && git add -A src/punch/workflow.py tests/test_workflow.py tests/fixtures
```

---

### Task 2: Punch catalog cross-validation

**Files:**
- Create: `vendor/punch/src/punch/catalog.py`
- Test: `vendor/punch/tests/test_catalog.py`

**Interfaces:**
- Consumes: `load_workflow`, `K6Workflow.data`, `DataSpec`, `WorkflowError` (Task 1).
- Produces:
  ```python
  class CatalogError(ValueError)
  @dataclass(frozen=True)
  class WorkflowCatalog:
      workflows: Mapping[str, K6Workflow]
      def producers_of(self, dataset: str) -> tuple[str, ...]   # sorted names
      def consumers_of(self, dataset: str) -> tuple[str, ...]   # sorted names
  def load_catalog(directory: Path) -> WorkflowCatalog          # all *.yaml in directory
  ```

- [ ] **Step 1: Write failing tests `tests/test_catalog.py`**

```python
from __future__ import annotations

import shutil
import sys
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from punch.catalog import CatalogError, load_catalog

FIXTURES = Path(__file__).resolve().parent / "fixtures"


class CatalogTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = TemporaryDirectory()
        self.root = Path(self.tmp.name).resolve()
        shutil.copy(FIXTURES / "docker-compose.yml", self.root / "docker-compose.yml")
        shutil.copy(FIXTURES / "data-output.yaml", self.root / "data-output.yaml")
        shutil.copy(FIXTURES / "data-input.yaml", self.root / "data-input.yaml")

    def tearDown(self) -> None:
        self.tmp.cleanup()

    def edit(self, name: str, old: str, new: str) -> None:
        path = self.root / name
        text = path.read_text(encoding="utf-8")
        self.assertIn(old, text)
        path.write_text(text.replace(old, new, 1), encoding="utf-8")

    def test_links_producers_and_consumers(self) -> None:
        catalog = load_catalog(self.root)
        self.assertEqual(catalog.producers_of("carts"), ("data-producer",))
        self.assertEqual(catalog.consumers_of("carts"), ("data-consumer",))
        self.assertEqual(catalog.producers_of("unknown"), ())

    def test_unknown_target_fails(self) -> None:
        self.edit("data-output.yaml", "targets: [data-consumer]", "targets: [ghost]")
        with self.assertRaisesRegex(CatalogError, 'data-producer targets unknown workflow "ghost"'):
            load_catalog(self.root)

    def test_target_that_does_not_require_dataset_fails(self) -> None:
        self.edit("data-input.yaml", "requires: [carts]", "requires: [other]")
        with self.assertRaisesRegex(CatalogError, 'data-consumer does not require "carts"'):
            load_catalog(self.root)

    def test_required_dataset_without_producer_fails(self) -> None:
        self.edit("data-input.yaml", "requires: [carts]", "requires: [carts, orders]")
        with self.assertRaisesRegex(CatalogError, 'data-consumer requires "orders" but no workflow produces it'):
            load_catalog(self.root)

    def test_conflicting_columns_across_producers_fail(self) -> None:
        second = (self.root / "data-output.yaml").read_text(encoding="utf-8")
        second = second.replace("name: data-producer", "name: data-producer-2")
        second = second.replace("columns: [cartId, productId, sid]", "columns: [cartId]")
        (self.root / "data-output-2.yaml").write_text(second, encoding="utf-8")
        with self.assertRaisesRegex(CatalogError, 'producers of "carts" declare different columns'):
            load_catalog(self.root)

    def test_duplicate_workflow_names_fail(self) -> None:
        shutil.copy(self.root / "data-input.yaml", self.root / "copy.yaml")
        with self.assertRaisesRegex(CatalogError, 'duplicate workflow name "data-consumer"'):
            load_catalog(self.root)

    def test_invalid_workflow_file_is_reported_with_its_name(self) -> None:
        (self.root / "broken.yaml").write_text("apiVersion: nope\n", encoding="utf-8")
        with self.assertRaisesRegex(CatalogError, "broken.yaml"):
            load_catalog(self.root)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run to verify failure**

Run: `cd vendor/punch && python3 -m unittest tests.test_catalog -v`
Expected: FAIL `ModuleNotFoundError: punch.catalog`.

- [ ] **Step 3: Implement `src/punch/catalog.py`**

```python
"""Cross-workflow data links: who produces and who requires each dataset."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Mapping

from punch.workflow import K6Workflow, WorkflowError, load_workflow


class CatalogError(ValueError):
    pass


@dataclass(frozen=True)
class WorkflowCatalog:
    workflows: Mapping[str, K6Workflow]

    def producers_of(self, dataset: str) -> tuple[str, ...]:
        return tuple(sorted(
            name for name, wf in self.workflows.items()
            if wf.data is not None and wf.data.product(dataset) is not None
        ))

    def consumers_of(self, dataset: str) -> tuple[str, ...]:
        return tuple(sorted(
            name for name, wf in self.workflows.items()
            if wf.data is not None and dataset in wf.data.requires
        ))


def load_catalog(directory: Path) -> WorkflowCatalog:
    workflows: dict[str, K6Workflow] = {}
    for path in sorted(Path(directory).glob("*.yaml")):
        try:
            workflow = load_workflow(path)
        except WorkflowError as error:
            raise CatalogError(f"{path.name}: {error}") from error
        if workflow.name in workflows:
            raise CatalogError(f'duplicate workflow name "{workflow.name}"')
        workflows[workflow.name] = workflow
    catalog = WorkflowCatalog(workflows)
    _validate(catalog)
    return catalog


def _validate(catalog: WorkflowCatalog) -> None:
    columns_by_dataset: dict[str, tuple[str, ...]] = {}
    for name, workflow in catalog.workflows.items():
        if workflow.data is None:
            continue
        for product in workflow.data.produces:
            known = columns_by_dataset.setdefault(product.dataset, product.columns)
            if known != product.columns:
                raise CatalogError(f'producers of "{product.dataset}" declare different columns')
            for target in product.targets:
                target_wf = catalog.workflows.get(target)
                if target_wf is None:
                    raise CatalogError(f'{name} targets unknown workflow "{target}"')
                if target_wf.data is None or product.dataset not in target_wf.data.requires:
                    raise CatalogError(f'{target} does not require "{product.dataset}" (targeted by {name})')
        for dataset in workflow.data.requires:
            if not catalog.producers_of(dataset):
                raise CatalogError(f'{name} requires "{dataset}" but no workflow produces it')
```

- [ ] **Step 4: Run to verify pass**

Run: `cd vendor/punch && python3 -m unittest tests.test_catalog -v`
Expected: PASS.

- [ ] **Step 5: Stage**

```bash
cd vendor/punch && git add src/punch/catalog.py tests/test_catalog.py
```

---

### Task 3: Punch producer runtime — `[DATA]` harvesting with opt-in

**Files:**
- Modify: `vendor/punch/src/punch/execution.py`
- Test: `vendor/punch/tests/test_execution.py`

**Interfaces:**
- Consumes: `K6Workflow.data`, `DataSpec.host_path`, `DataSpec.product` (Task 1).
- Produces:
  ```python
  DATA_TAG_PATTERN = re.compile(r"^\[DATA ([a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?)\] ?(.*)$")
  @dataclass(frozen=True)
  class DatasetResult: dataset: str; path: Path; record_count: int; published: bool
  @dataclass(frozen=True)
  class ExecutionResult:
      workflow_name: str; command: tuple[str, ...]; child_exit_code: int | None
      passed: bool; failure: str | None
      datasets: tuple[DatasetResult, ...] = ()
  def validate_produce(workflow: K6Workflow, produce: Sequence[str]) -> tuple[str, ...]
      # expands "all"; raises ValueError('workflow X does not produce "y"')
  def execute_workflow(workflow, *, environment, produce: Sequence[str] = (),
                       data_overrides: Mapping[str, Path] | None = None,
                       docker_run_confirmed: bool = True, stdout=None, stderr=None,
                       log_path: Path | None = None) -> ExecutionResult
  ```
  `confirm_output_data`, `CSV_TAG`, `_csv_payload`, `output_data_confirmed` are removed.

- [ ] **Step 1: Update test fixture setup and write failing producer tests**

In `ExecutionTests.setUp` replace the `csv-output.yaml` copy with `data-output.yaml` and `data-input.yaml`; set `self.workflow = load_workflow(self.root / "data-output.yaml")`, `self.consumer = load_workflow(self.root / "data-input.yaml")`, `self.carts_path = self.root / "data" / "carts.csv"`; build `self.no_csv_workflow` by stripping the `  data:` block (everything from `"  data:\n"` to end of file). Delete tests that exercise `confirm_output_data`, `[CSV]`, or `output_data_confirmed` (`test_csv_workflow_requires_confirmation_before_subprocess`, `test_interactive_confirmation_names_every_csv_destination`, `test_noninteractive_confirmation_requires_explicit_flag`, and the `[CSV]` harvesting tests at lines 179–268) and replace them with:

```python
    def run_producer(self, stdout_lines: list[str], *, produce=("carts",), exit_code: int = 0):
        env = {**self.env, "FAKE_STDOUT": "|".join(stdout_lines), "FAKE_EXIT_CODE": str(exit_code)}
        return execute_workflow(
            self.workflow, environment=env, produce=produce,
            stdout=io.StringIO(), stderr=io.StringIO(), log_path=self.log_path,
        )

    def test_opted_in_dataset_is_published_with_header(self) -> None:
        result = self.run_producer(["noise", "[DATA carts] c1,p1,s1", "[DATA carts] c2,p2,s2"])
        self.assertTrue(result.passed, result.failure)
        self.assertEqual(
            self.carts_path.read_text(encoding="utf-8"),
            "cartId,productId,sid\nc1,p1,s1\nc2,p2,s2\n",
        )
        self.assertEqual(result.datasets[0].dataset, "carts")
        self.assertEqual(result.datasets[0].record_count, 2)
        self.assertTrue(result.datasets[0].published)

    def test_not_opted_in_writes_nothing_and_passes(self) -> None:
        result = self.run_producer(["[DATA carts] c1,p1,s1"], produce=())
        self.assertTrue(result.passed, result.failure)
        self.assertFalse(self.carts_path.exists())
        self.assertEqual(result.datasets, ())

    def test_empty_field_counts_toward_column_count(self) -> None:
        result = self.run_producer(["[DATA carts] c1,,s1"])
        self.assertTrue(result.passed, result.failure)
        self.assertIn("c1,,s1\n", self.carts_path.read_text(encoding="utf-8"))

    def test_wrong_column_count_fails_and_preserves_old_file(self) -> None:
        self.carts_path.parent.mkdir(parents=True, exist_ok=True)
        self.carts_path.write_text("cartId,productId,sid\nold,old,old\n", encoding="utf-8")
        result = self.run_producer(["[DATA carts] c1,p1"])
        self.assertFalse(result.passed)
        self.assertIn('"carts" record has 2 fields, expected 3', result.failure)
        self.assertEqual(self.carts_path.read_text(encoding="utf-8"), "cartId,productId,sid\nold,old,old\n")

    def test_undeclared_dataset_tag_fails(self) -> None:
        result = self.run_producer(["[DATA ghosts] x"])
        self.assertFalse(result.passed)
        self.assertIn('undeclared dataset "ghosts"', result.failure)

    def test_undeclared_dataset_tag_fails_even_without_opt_in(self) -> None:
        result = self.run_producer(["[DATA ghosts] x"], produce=())
        self.assertFalse(result.passed)

    def test_opted_in_dataset_with_zero_rows_fails_and_preserves_old_file(self) -> None:
        self.carts_path.parent.mkdir(parents=True, exist_ok=True)
        self.carts_path.write_text("cartId,productId,sid\nold,old,old\n", encoding="utf-8")
        result = self.run_producer(["no records here"])
        self.assertFalse(result.passed)
        self.assertIn('no [DATA carts] records were produced', result.failure)
        self.assertIn("old,old,old", self.carts_path.read_text(encoding="utf-8"))

    def test_child_failure_does_not_publish(self) -> None:
        result = self.run_producer(["[DATA carts] c1,p1,s1"], exit_code=3)
        self.assertFalse(result.passed)
        self.assertEqual(result.child_exit_code, 3)
        self.assertFalse(self.carts_path.exists())
        self.assertEqual(list(self.carts_path.parent.glob("*")) if self.carts_path.parent.exists() else [], [])

    def test_stderr_records_are_never_harvested(self) -> None:
        env = {**self.env, "FAKE_STDOUT": "[DATA carts] c1,p1,s1", "FAKE_STDERR": "[DATA carts] e,e,e"}
        result = execute_workflow(self.workflow, environment=env, produce=("carts",),
                                  stdout=io.StringIO(), stderr=io.StringIO())
        self.assertTrue(result.passed, result.failure)
        self.assertNotIn("e,e,e", self.carts_path.read_text(encoding="utf-8"))

    def test_validate_produce_expands_all_and_rejects_unknown(self) -> None:
        from punch.execution import validate_produce
        self.assertEqual(validate_produce(self.workflow, ["all"]), ("carts",))
        self.assertEqual(validate_produce(self.workflow, []), ())
        with self.assertRaisesRegex(ValueError, 'data-producer does not produce "orders"'):
            validate_produce(self.workflow, ["orders"])
        with self.assertRaisesRegex(ValueError, 'does not produce "carts"'):
            validate_produce(self.no_csv_workflow, ["carts"])
```
Keep the existing interrupt/reader-error/stream tests; update any of them that passed `output_data_confirmed=` to pass `produce=("carts",)` (when they assert on CSV files) or nothing, and change `[CSV] ` payloads in their `FAKE_STDOUT` to `[DATA carts] a,b,c`, and `csv_path`/`csv_record_count` assertions to `result.datasets`.

- [ ] **Step 2: Run to verify failure**

Run: `cd vendor/punch && python3 -m unittest tests.test_execution -v`
Expected: FAIL (`unexpected keyword argument 'produce'`).

- [ ] **Step 3: Implement in `execution.py`**

Remove `CSV_TAG`, `confirm_output_data`, `_csv_payload`. Add `import re`, `from punch.workflow import DataProduct, K6Workflow`. Add:
```python
DATA_TAG_PATTERN = re.compile(r"^\[DATA ([a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?)\] ?(.*)$")


@dataclass(frozen=True)
class DatasetResult:
    dataset: str
    path: Path
    record_count: int
    published: bool


@dataclass(frozen=True)
class ExecutionResult:
    workflow_name: str
    command: tuple[str, ...]
    child_exit_code: int | None
    passed: bool
    failure: str | None
    datasets: tuple[DatasetResult, ...] = ()


def validate_produce(workflow: K6Workflow, produce: Sequence[str]) -> tuple[str, ...]:
    declared = tuple(p.dataset for p in workflow.data.produces) if workflow.data else ()
    if "all" in produce:
        return declared
    for dataset in produce:
        if dataset not in declared:
            raise ValueError(f'workflow {workflow.name} does not produce "{dataset}"')
    return tuple(dict.fromkeys(produce))


def _data_record(line: str) -> tuple[str, str] | None:
    match = DATA_TAG_PATTERN.match(line.rstrip("\r\n"))
    if match is None:
        return None
    return match.group(1), match.group(2)


def _check_payload(product: DataProduct, payload: str) -> None:
    rows = list(csv.reader([payload], strict=True))
    if len(rows) != 1:
        raise ValueError(f'"{product.dataset}" payload must contain one record')
    if len(rows[0]) != len(product.columns):
        raise ValueError(
            f'"{product.dataset}" record has {len(rows[0])} fields, expected {len(product.columns)}'
        )


class _DatasetSink:
    """Temp file beside the target; renamed into place only on success."""

    def __init__(self, product: DataProduct, path: Path) -> None:
        self.product = product
        self.path = path
        path.parent.mkdir(parents=True, exist_ok=True)
        self.handle: IO[str] | None = NamedTemporaryFile(
            mode="w", encoding="utf-8", newline="", dir=path.parent, delete=False,
            prefix=f".{product.dataset}-", suffix=".tmp",
        )
        self.temp_path = Path(self.handle.name)
        self.handle.write(",".join(product.columns) + "\n")
        self.count = 0

    def write(self, payload: str) -> None:
        assert self.handle is not None
        self.handle.write(payload + "\n")
        self.handle.flush()
        self.count += 1

    def close(self) -> None:
        if self.handle is not None:
            self.handle.close()
            self.handle = None

    def publish(self) -> None:
        self.close()
        os.replace(self.temp_path, self.path)

    def discard(self) -> None:
        self.close()
        self.temp_path.unlink(missing_ok=True)

    def result(self, published: bool) -> DatasetResult:
        return DatasetResult(self.product.dataset, self.path, self.count, published)
```
Rewrite `_result` to take `datasets: tuple[DatasetResult, ...] = ()` instead of `csv_path`/`csv_record_count`. In `execute_workflow`:
- Signature: replace `output_data_confirmed: bool` with `produce: Sequence[str] = ()` and add `data_overrides: Mapping[str, Path] | None = None` (used in Task 4; accept and ignore for now).
- After the required-env check, compute `try: opted = validate_produce(workflow, produce) except ValueError as e: return _result(..., failure=str(e))`.
- Collision check: for each opted dataset, if `log_path` collides with `workflow.data.host_path(ds)` return failure `f'data output "{ds}" collides with log path'`.
- Replace the single `csv_file` with `sinks: dict[str, _DatasetSink] = {ds: _DatasetSink(workflow.data.product(ds), workflow.data.host_path(ds)) for ds in opted}` created inside the `try`.
- Replace the stdout harvesting block with:
```python
                if stream_name == "stdout" and data_error is None:
                    record = _data_record(line)
                    if record is not None:
                        dataset, payload = record
                        product = workflow.data.product(dataset) if workflow.data else None
                        if product is None:
                            data_error = f'undeclared dataset "{dataset}"'
                        elif dataset in sinks:
                            try:
                                _check_payload(product, payload)
                            except (csv.Error, ValueError) as error:
                                data_error = str(error)
                            else:
                                sinks[dataset].write(payload)
```
  (rename `csv_error` → `data_error`, initialized `None`.)
- After the loop, failure ordering stays: reader error → non-zero exit → `data_error` (`f"invalid data output: {data_error}"`) → zero-row check: `empty = [ds for ds, s in sinks.items() if s.count == 0]` → `f"no [DATA {empty[0]}] records were produced"`.
- On success: `for sink in sinks.values(): sink.publish()`; return `datasets=tuple(s.result(True) for s in sinks.values())`.
- On every failure return: `datasets=tuple(s.result(False) for s in sinks.values())`.
- `finally`: `for sink in sinks.values(): sink.discard()` (safe after publish because `temp_path` no longer exists — `unlink(missing_ok=True)`).

- [ ] **Step 4: Run to verify pass**

Run: `cd vendor/punch && python3 -m unittest tests.test_execution -v`
Expected: PASS.

- [ ] **Step 5: Stage**

```bash
cd vendor/punch && git add src/punch/execution.py tests/test_execution.py
```

---

### Task 4: Punch consumer runtime — preflight, env injection, override, delete prompt

**Files:**
- Modify: `vendor/punch/src/punch/execution.py`
- Test: `vendor/punch/tests/test_execution.py`

**Interfaces:**
- Consumes: `WorkflowCatalog.producers_of` (Task 2), `data_env_name`, `DataSpec` (Task 1), `execute_workflow` (Task 3).
- Produces:
  ```python
  def resolve_data_overrides(workflow: K6Workflow, raw: Sequence[str]) -> dict[str, Path]
      # "orders=path" → {"orders": abs Path}; path resolved against workflow.working_directory;
      # raises ValueError for unknown dataset, bad syntax, or path outside spec.data.directory
  def required_data_paths(workflow: K6Workflow, overrides: Mapping[str, Path]) -> dict[str, Path]
  def preflight_requirements(workflow: K6Workflow, overrides: Mapping[str, Path],
                             producers_of: Callable[[str], Sequence[str]]) -> str | None
      # returns failure message or None
  def data_environment(workflow: K6Workflow, overrides: Mapping[str, Path]) -> dict[str, str]
      # {"DATA_CARTS_CSV": "/scripts/data/carts.csv"} (override mapped to container path)
  def confirm_delete_consumed(paths: Mapping[str, Path], *, stdin: IO[str], stdout: IO[str]) -> list[Path]
      # interactive only; returns the paths the user confirmed for deletion (and deletes them)
  build_compose_run_command(workflow, environment, *, container_name=None,
                            data_env: Mapping[str, str] | None = None) -> list[str]
  ```
  `execute_workflow` gains `producers_of: Callable[[str], Sequence[str]] = lambda _: ()` and runs `preflight_requirements` before Docker, injecting `data_environment` into the compose command.

- [ ] **Step 1: Write failing consumer tests**

Append to `ExecutionTests`:
```python
    def write_carts(self, body: str) -> None:
        self.carts_path.parent.mkdir(parents=True, exist_ok=True)
        self.carts_path.write_text(body, encoding="utf-8")

    def run_consumer(self, overrides=None):
        return execute_workflow(
            self.consumer, environment=self.env, data_overrides=overrides or {},
            producers_of=lambda ds: ("data-producer",),
            stdout=io.StringIO(), stderr=io.StringIO(),
        )

    def test_missing_required_file_fails_before_docker_and_names_producers(self) -> None:
        result = self.run_consumer()
        self.assertFalse(result.passed)
        self.assertIsNone(result.child_exit_code)
        self.assertEqual(
            result.failure,
            'data-consumer requires "carts"; produce it with: data-producer (--produce carts)',
        )
        self.assertFalse(self.args_path.exists())

    def test_header_only_file_fails_preflight(self) -> None:
        self.write_carts("cartId,productId,sid\n\n")
        result = self.run_consumer()
        self.assertFalse(result.passed)
        self.assertIn('requires "carts"', result.failure)
        self.assertFalse(self.args_path.exists())

    def test_present_file_injects_container_path(self) -> None:
        self.write_carts("cartId,productId,sid\nc,p,s\n")
        result = self.run_consumer()
        self.assertTrue(result.passed, result.failure)
        args = self.args_path.read_text(encoding="utf-8").splitlines()
        self.assertIn("DATA_CARTS_CSV=/scripts/data/carts.csv", args)

    def test_data_override_points_at_alternate_file(self) -> None:
        from punch.execution import resolve_data_overrides
        alt = self.root / "data" / "batch-2.csv"
        alt.parent.mkdir(parents=True, exist_ok=True)
        alt.write_text("cartId,productId,sid\nc,p,s\n", encoding="utf-8")
        overrides = resolve_data_overrides(self.consumer, ["carts=data/batch-2.csv"])
        self.assertEqual(overrides, {"carts": alt})
        result = self.run_consumer(overrides)
        self.assertTrue(result.passed, result.failure)
        self.assertIn("DATA_CARTS_CSV=/scripts/data/batch-2.csv",
                      self.args_path.read_text(encoding="utf-8").splitlines())

    def test_data_override_outside_directory_is_rejected(self) -> None:
        from punch.execution import resolve_data_overrides
        for raw in ("carts=../x.csv", "carts=/tmp/x.csv", "carts=reports/x.csv"):
            with self.subTest(raw=raw):
                with self.assertRaisesRegex(ValueError, "must be beneath spec.data.directory"):
                    resolve_data_overrides(self.consumer, [raw])

    def test_data_override_rejects_unknown_dataset_and_bad_syntax(self) -> None:
        from punch.execution import resolve_data_overrides
        with self.assertRaisesRegex(ValueError, 'data-consumer does not require "orders"'):
            resolve_data_overrides(self.consumer, ["orders=data/o.csv"])
        with self.assertRaisesRegex(ValueError, "expected <dataset>=<path>"):
            resolve_data_overrides(self.consumer, ["carts"])

    def test_delete_prompt_only_on_tty(self) -> None:
        from punch.execution import confirm_delete_consumed
        self.write_carts("cartId,productId,sid\nc,p,s\n")
        out = io.StringIO()
        self.assertEqual(confirm_delete_consumed({"carts": self.carts_path}, stdin=io.StringIO("y\n"), stdout=out), [])
        self.assertTrue(self.carts_path.exists())
        self.assertEqual(out.getvalue(), "")
        deleted = confirm_delete_consumed({"carts": self.carts_path}, stdin=TtyInput("y\n"), stdout=out)
        self.assertEqual(deleted, [self.carts_path])
        self.assertFalse(self.carts_path.exists())
        self.assertIn('Delete consumed "carts" data', out.getvalue())

    def test_delete_prompt_default_keeps_file(self) -> None:
        from punch.execution import confirm_delete_consumed
        self.write_carts("cartId,productId,sid\nc,p,s\n")
        self.assertEqual(confirm_delete_consumed({"carts": self.carts_path}, stdin=TtyInput("\n"), stdout=io.StringIO()), [])
        self.assertTrue(self.carts_path.exists())
```

- [ ] **Step 2: Run to verify failure**

Run: `cd vendor/punch && python3 -m unittest tests.test_execution -v`
Expected: FAIL (`unexpected keyword argument 'producers_of'`, `ImportError: resolve_data_overrides`).

- [ ] **Step 3: Implement**

```python
from typing import Callable
from punch.workflow import data_env_name


def resolve_data_overrides(workflow: K6Workflow, raw: Sequence[str]) -> dict[str, Path]:
    overrides: dict[str, Path] = {}
    for item in raw:
        dataset, sep, path_text = item.partition("=")
        if not sep or not dataset or not path_text:
            raise ValueError(f"invalid --data {item!r}: expected <dataset>=<path>")
        if workflow.data is None or dataset not in workflow.data.requires:
            raise ValueError(f'workflow {workflow.name} does not require "{dataset}"')
        path = (workflow.working_directory / path_text).resolve()
        directory = workflow.data.directory
        if directory not in path.parents:
            raise ValueError(f"--data {dataset} path must be beneath spec.data.directory ({directory})")
        overrides[dataset] = path
    return overrides


def required_data_paths(workflow: K6Workflow, overrides: Mapping[str, Path]) -> dict[str, Path]:
    if workflow.data is None:
        return {}
    return {ds: overrides.get(ds, workflow.data.host_path(ds)) for ds in workflow.data.requires}


def _has_data_rows(path: Path) -> bool:
    if not path.is_file():
        return False
    with path.open(encoding="utf-8") as handle:
        next(handle, None)  # header
        return any(line.strip() for line in handle)


def preflight_requirements(
    workflow: K6Workflow,
    overrides: Mapping[str, Path],
    producers_of: Callable[[str], Sequence[str]],
) -> str | None:
    for dataset, path in required_data_paths(workflow, overrides).items():
        if not _has_data_rows(path):
            producers = ", ".join(producers_of(dataset)) or "no known workflow"
            return f'{workflow.name} requires "{dataset}"; produce it with: {producers} (--produce {dataset})'
    return None


def data_environment(workflow: K6Workflow, overrides: Mapping[str, Path]) -> dict[str, str]:
    if workflow.data is None:
        return {}
    env: dict[str, str] = {}
    for dataset, path in required_data_paths(workflow, overrides).items():
        relative = path.relative_to(workflow.data.directory).as_posix()
        env[data_env_name(dataset)] = f"{workflow.data.mounted_at.rstrip('/')}/{relative}"
    return env


def confirm_delete_consumed(paths: Mapping[str, Path], *, stdin: IO[str], stdout: IO[str]) -> list[Path]:
    if not stdin.isatty():
        return []
    deleted: list[Path] = []
    for dataset, path in paths.items():
        if not path.exists():
            continue
        stdout.write(f'Delete consumed "{dataset}" data ({path})? [y/N] ')
        stdout.flush()
        if stdin.readline().strip().lower() in {"y", "yes"}:
            path.unlink()
            deleted.append(path)
    return deleted
```
`build_compose_run_command` gains `data_env: Mapping[str, str] | None = None`; after the forwarded env loop add `for name, value in (data_env or {}).items(): command.extend(["-e", f"{name}={value}"])`. In `execute_workflow`, add parameter `producers_of: Callable[[str], Sequence[str]] = lambda _dataset: ()`; after `validate_produce`, run:
```python
    overrides = dict(data_overrides or {})
    preflight_failure = preflight_requirements(workflow, overrides, producers_of)
    if preflight_failure is not None:
        return _result(workflow, command, child_exit_code=None, passed=False, failure=preflight_failure)
    data_env = data_environment(workflow, overrides)
```
and pass `data_env=data_env` to both `build_compose_run_command` calls. Place the preflight **before** the `docker_run_confirmed` check so a missing dataset is reported even when the user would decline Docker.

- [ ] **Step 4: Run to verify pass**

Run: `cd vendor/punch && python3 -m unittest tests.test_execution -v`
Expected: PASS.

- [ ] **Step 5: Stage**

```bash
cd vendor/punch && git add src/punch/execution.py tests/test_execution.py
```

---

### Task 5: Punch CLI and menu wiring

**Files:**
- Modify: `vendor/punch/src/punch/__main__.py`, `vendor/punch/src/punch/menu.py`, `vendor/punch/README.md`
- Test: `vendor/punch/tests/test_cli.py`, `vendor/punch/tests/test_menu.py`

**Interfaces:**
- Consumes: `load_catalog`, `CatalogError` (Task 2); `execute_workflow(produce=, data_overrides=, producers_of=)`, `validate_produce`, `resolve_data_overrides`, `required_data_paths`, `confirm_delete_consumed`, `DatasetResult` (Tasks 3–4).
- Produces: `punch run <selector> [--produce DATASET|all]... [--data DATASET=PATH]...`; evidence entries carry `"datasets": [{"dataset", "path", "recordCount", "published"}]` instead of `csvPath`/`csvRecordCount`; menu labels `"<stem>  [produces carts → data-consumer]"` / `"<stem>  [requires carts ← data-producer]"`.

- [ ] **Step 1: Write failing CLI tests**

In `tests/test_cli.py`, delete the CSV-specific tests (`test_csv_path_refuses_noninteractive_run_without_flag`, `test_confirm_output_data_allows_noninteractive_csv_run`, `test_csv_without_tagged_records_fails_with_punch_exit_code`, `test_invalid_csv_fails_with_punch_exit_code`, `test_csv_hardlink_to_state_artifact_is_rejected_before_writing`, `test_csv_symlink_to_workflow_log_is_rejected_before_writing`, `test_csv_collision_with_another_selected_workflow_log_is_rejected`, `test_csv_collision_with_collected_service_log_is_rejected`, `test_selected_csv_destinations_that_alias_are_rejected`, `test_evidence_records_workflow_and_csv_fields`). Switch any `csv-output.yaml` fixture copy to `data-output.yaml` + `data-input.yaml` in the same directory. Add (using the module's existing `run_cli` / fake-docker helpers — read the top of `test_cli.py` for their exact names before writing):
```python
    def test_produce_flag_publishes_dataset_noninteractively(self) -> None:
        rc = self.run_cli(["run", str(self.root / "data-output.yaml"), "--produce", "carts"],
                          fake_stdout="[DATA carts] c,p,s")
        self.assertEqual(rc, 0)
        self.assertEqual((self.root / "data" / "carts.csv").read_text(encoding="utf-8"),
                         "cartId,productId,sid\nc,p,s\n")
        evidence = self.read_evidence()
        self.assertEqual(evidence["results"][0]["datasets"],
                         [{"dataset": "carts", "path": "data/carts.csv", "recordCount": 1, "published": True}])

    def test_run_without_produce_writes_no_dataset(self) -> None:
        rc = self.run_cli(["run", str(self.root / "data-output.yaml")], fake_stdout="[DATA carts] c,p,s")
        self.assertEqual(rc, 0)
        self.assertFalse((self.root / "data" / "carts.csv").exists())

    def test_unknown_produce_dataset_fails_before_docker(self) -> None:
        rc = self.run_cli(["run", str(self.root / "data-output.yaml"), "--produce", "orders"])
        self.assertEqual(rc, 1)
        self.assertFalse(self.args_path.exists())

    def test_consumer_without_data_names_producer(self) -> None:
        stderr = io.StringIO()
        with redirect_stderr(stderr):
            rc = self.run_cli(["run", str(self.root / "data-input.yaml")])
        self.assertEqual(rc, 1)
        self.assertIn("produce it with: data-producer (--produce carts)", self.read_evidence()["results"][0]["failure"])

    def test_data_override_flag_is_forwarded(self) -> None:
        alt = self.root / "data" / "alt.csv"
        alt.parent.mkdir(parents=True, exist_ok=True)
        alt.write_text("cartId,productId,sid\nc,p,s\n", encoding="utf-8")
        rc = self.run_cli(["run", str(self.root / "data-input.yaml"), "--data", "carts=data/alt.csv"])
        self.assertEqual(rc, 0)
        self.assertIn("DATA_CARTS_CSV=/scripts/data/alt.csv", self.args_path.read_text(encoding="utf-8"))

    def test_confirm_output_data_flag_is_gone(self) -> None:
        with self.assertRaises(SystemExit):
            build_parser().parse_args(["run", "smoke", "--confirm-output-data"])

    def test_catalog_error_fails_before_docker(self) -> None:
        text = (self.root / "data-output.yaml").read_text(encoding="utf-8")
        (self.root / "data-output.yaml").write_text(text.replace("[data-consumer]", "[ghost]"), encoding="utf-8")
        rc = self.run_cli(["run", str(self.root / "data-input.yaml")])
        self.assertEqual(rc, 1)
        self.assertFalse(self.args_path.exists())
```
If `test_cli.py` lacks `run_cli(argv, fake_stdout=...)` / `read_evidence()` / `self.args_path`, add them to its test class, mirroring how the existing tests invoke `main()` with a patched `PATH` fake docker (same `FAKE_DOCKER` script as `test_execution.py`) and read `STATE_DIR / "punch-run.json"`.

- [ ] **Step 2: Write failing menu tests**

In `tests/test_menu.py` replace `test_workflow_menu_annotates_producer_and_consumer_entries`, `test_csv_workflow_prompts_for_confirmation`, `test_confirming_csv_workflow_runs_and_writes_output` with:
```python
    def test_workflow_menu_annotates_producer_and_consumer_entries(self) -> None:
        from punch.menu import _workflow_menu_labels
        labels = _workflow_menu_labels([self.root / "data-input.yaml", self.root / "data-output.yaml"], self.root)
        self.assertEqual(labels, [
            "data-input  [requires carts ← data-producer]",
            "data-output  [produces carts → data-consumer]",
        ])

    def test_producer_prompts_per_dataset_and_yes_opts_in(self) -> None:
        from punch.menu import _choose_produce
        workflow = load_workflow(self.root / "data-output.yaml")
        with patch("punch.menu._prompt", return_value="y") as prompt:
            self.assertEqual(_choose_produce(workflow), ("carts",))
        self.assertIn('Write "carts" data for data-consumer?', prompt.call_args.args[0])

    def test_producer_prompt_default_is_no(self) -> None:
        from punch.menu import _choose_produce
        workflow = load_workflow(self.root / "data-output.yaml")
        with patch("punch.menu._prompt", return_value="n"):
            self.assertEqual(_choose_produce(workflow), ())
```
Copy `data-output.yaml` / `data-input.yaml` fixtures into the menu test's temp root in its `setUp` (it already copies fixtures; replace `csv-output.yaml`).

- [ ] **Step 3: Run to verify failure**

Run: `cd vendor/punch && python3 -m unittest tests.test_cli tests.test_menu -v`
Expected: FAIL.

- [ ] **Step 4: Implement CLI (`__main__.py`)**

- Parser: remove `--confirm-output-data`; add
  ```python
  run_p.add_argument("--produce", action="append", default=[], metavar="DATASET",
                     help="Write a declared dataset (repeatable, or 'all').")
  run_p.add_argument("--data", action="append", default=[], metavar="DATASET=PATH",
                     help="Read a required dataset from PATH (beneath spec.data.directory).")
  ```
- `_evidence_result`: replace `csvPath`/`csvRecordCount` with
  ```python
        "datasets": [
            {"dataset": d.dataset, "path": str(d.path.relative_to(workflow.working_directory)),
             "recordCount": d.record_count, "published": d.published}
            for d in result.datasets
        ],
  ```
- `cmd_run`: delete the CSV collision block and the `confirm_output_data` block. For each runnable workflow, before executing:
  ```python
        try:
            catalog = load_catalog(workflow.source_path.parent)
            produce = validate_produce(workflow, args.produce) if args.selector != "all" else ()
            overrides = resolve_data_overrides(workflow, args.data) if args.selector != "all" else {}
        except (CatalogError, ValueError) as error:
            print(f"[punch] {error}", file=sys.stderr, flush=True)
            results.append(_evidence_result(workflow, ExecutionResult(workflow.name, (), None, False, str(error))))
            overall_rc = overall_rc or 1
            if not args.keep_going:
                break
            continue
        result = execute_workflow(
            workflow, environment=os.environ, produce=produce, data_overrides=overrides,
            producers_of=catalog.producers_of, log_path=LOGS_DIR / f"k6-{workflow.name}.log",
        )
  ```
  After the result: `confirm_delete_consumed(required_data_paths(workflow, overrides), stdin=sys.stdin, stdout=sys.stdout)`. Update the skipped-workflow `ExecutionResult(...)` call to the new 5-positional-arg shape.
- Imports: `from punch.catalog import CatalogError, load_catalog` and the new execution functions.

- [ ] **Step 5: Implement menu (`menu.py`)**

```python
from punch.catalog import CatalogError, WorkflowCatalog, load_catalog
from punch.execution import confirm_delete_consumed, required_data_paths


def _data_annotation(workflow: K6Workflow, catalog: WorkflowCatalog | None) -> str:
    if workflow.data is None:
        return ""
    notes = [f"produces {p.dataset} → {', '.join(p.targets)}" for p in workflow.data.produces]
    for dataset in workflow.data.requires:
        producers = ", ".join(catalog.producers_of(dataset)) if catalog else "?"
        notes.append(f"requires {dataset} ← {producers}")
    return f"  [{'; '.join(notes)}]"


def _workflow_menu_labels(paths: List[Path], workflows_dir: Path) -> List[str]:
    try:
        catalog: WorkflowCatalog | None = load_catalog(workflows_dir)
    except CatalogError:
        catalog = None
    labels = []
    for path in paths:
        try:
            labels.append(path.stem + _data_annotation(load_workflow(path), catalog))
        except WorkflowError:
            labels.append(path.stem)
    return labels


def _choose_produce(workflow: K6Workflow) -> tuple[str, ...]:
    if workflow.data is None:
        return ()
    chosen = []
    for product in workflow.data.produces:
        answer = _prompt(
            f'Write "{product.dataset}" data for {", ".join(product.targets)}? (y/N)', default="n"
        )
        if answer.lower().startswith("y"):
            chosen.append(product.dataset)
    return tuple(chosen)
```
Remove `_workflow_menu_label`, `_choose_confirm_output_data`. `_choose_workflow(paths)` becomes `_choose_workflow(paths, workflows_dir)` using `_workflow_menu_labels`. In `_run_workflow_menu`: load `catalog = load_catalog(workflows_dir)` inside `try` (on `CatalogError` print `[punch] {error}` to stderr and return 1); replace `confirmed = ...` with `produce = _choose_produce(workflow)`; call `execute_workflow(workflow, environment=environment, produce=produce, producers_of=catalog.producers_of, docker_run_confirmed=docker_run_confirmed)`; after `_report`, call `confirm_delete_consumed(required_data_paths(workflow, {}), stdin=sys.stdin, stdout=sys.stdout)`.

- [ ] **Step 6: Update Punch README**

Replace the README's CSV output/input section with a "Data contract (`spec.data`)" section containing the schema block from the spec's *Punch data contract → Schema* section, the record-line format, `--produce`/`--data` usage, the preflight message example, and the delete-prompt rule (interactive only). Remove every `--confirm-output-data` mention (`grep -n "confirm-output-data\|outputs.csv\|inputs.csv" README.md docs -r` must return nothing).

- [ ] **Step 7: Run the full Punch suite**

Run: `cd vendor/punch && python3 -m unittest discover -s tests -v`
Expected: all PASS. Then `grep -rn "csv_output\|csv_input\|confirm_output_data\|CSV_TAG" src tests` → no output.

- [ ] **Step 8: Commit in the submodule**

```bash
cd vendor/punch
git add -A src tests README.md
git commit -m "feat(data): named dataset produce/require contract

Replace spec.outputs.csv and spec.inputs.csv with spec.data: a workflow
declares produced datasets (columns + target workflows) and required
datasets. A catalog cross-validates links across a workflow directory.
[DATA <dataset>] stdout records are harvested only for datasets opted in
with --produce, validated against declared columns, and published
atomically with a header. Consumers are preflighted before Docker, get
DATA_<NAME>_CSV injected, accept --data overrides beneath the data
directory, and are offered an interactive delete prompt.
--confirm-output-data is removed."
```
Do not push.

---

### Task 6: Expresso migration — carts chain on the new contract (behavior unchanged)

**Files:**
- Modify: `tests/performance/k6/workflows/{cart-fulfill,cart-fulfill-browser,place-order}.yaml`
- Modify: `tests/performance/k6/scenarios/cart-fulfill/cart-fulfill.ts:128`, `scenarios/cart-fulfill-browser/cart-fulfill-browser.ts:85`, `scenarios/place-order/place-order.ts`
- Modify: `scripts/pg/k6runner.py`, `scripts/pg/perf.py`
- Modify: `infra/docker/compose.performance.yaml` (k6-browser volumes, ~line 117)
- Test: `scripts/pg/tests/test_k6runner.py`, `scripts/pg/tests/test_k6_workflows.py`, `scripts/pg/tests/test_perf_ci_docs_contract.py`
- Modify: `vendor/punch` (submodule pointer)

**Interfaces:**
- Consumes: Punch APIs from Tasks 1–5.
- Produces: `run_k6(workflow_name: str, args: Sequence[str] = (), *, extra_env=None, default_port: int = BFF_PORT) -> int` — parses `--produce`/`--data` from `args`; every `perf.<name>(args)` is `return run_k6("<name>", args[, default_port=WEB_PORT])`. Dataset `carts` columns `cartId,productId,sid`; k6 reads `__ENV.DATA_CARTS_CSV`.

- [ ] **Step 1: Write failing orchestrator tests**

`scripts/pg/tests/test_k6_workflows.py`: replace `expected_csv_output_path` and its assertions with:
```python
        expected_data = {
            "cart-fulfill": {"produces": {"carts": ("place-order",)}, "requires": ()},
            "cart-fulfill-browser": {"produces": {"carts": ("place-order",)}, "requires": ()},
            "place-order": {"produces": {}, "requires": ("carts",)},
        }
        ...
                if path.stem in expected_data:
                    expected = expected_data[path.stem]
                    self.assertEqual(workflow.data.directory, REPO_ROOT / "tests/performance/k6/data")
                    self.assertEqual(workflow.data.mounted_at, "/scripts/data")
                    self.assertEqual(
                        {p.dataset: p.targets for p in workflow.data.produces}, expected["produces"])
                    self.assertEqual(workflow.data.requires, expected["requires"])
                else:
                    self.assertIsNone(workflow.data)
```
and add:
```python
    def test_workflow_catalog_links_are_valid(self) -> None:
        from punch.catalog import load_catalog
        catalog = load_catalog(PERF_WORKFLOWS_DIR)
        self.assertEqual(catalog.producers_of("carts"), ("cart-fulfill", "cart-fulfill-browser"))
```
(Import `PERF_WORKFLOWS_DIR` from `pg.paths` if the module does not already.)

`scripts/pg/tests/test_k6runner.py`: delete `test_confirmation_flag_is_forwarded_to_punch`, every `_duplicate_*` test (lines ~205–250), and every place-order preflight/delete test (lines ~264–315). Replace `test_perf_commands_parse_confirmation_and_select_workflows` and `test_cli_forwards_static_perf_arguments` with:
```python
    @patch("pg.perf.run_k6", return_value=0)
    def test_perf_commands_pass_args_through(self, run_k6_mock) -> None:
        cases = [
            (perf.smoke, "smoke", {}),
            (perf.purchase_flow, "purchase-flow", {}),
            (perf.purchase_flow_browser, "purchase-flow-browser", {"default_port": WEB_PORT}),
            (perf.cart_fulfill, "cart-fulfill", {}),
            (perf.cart_fulfill_browser, "cart-fulfill-browser", {"default_port": WEB_PORT}),
            (perf.place_order, "place-order", {}),
        ]
        for command, name, kwargs in cases:
            with self.subTest(name=name):
                run_k6_mock.reset_mock()
                self.assertEqual(command(["--produce", "carts"]), 0)
                run_k6_mock.assert_called_once_with(name, ["--produce", "carts"], **kwargs)

    @patch("pg.k6runner.execute_workflow")
    def test_run_k6_forwards_produce_and_data(self, execute_mock) -> None:
        execute_mock.return_value = ExecutionResult("cart-fulfill", (), 0, True, None)
        with patch("pg.k6runner.confirm_docker_run", return_value=True):
            self.assertEqual(run_k6("cart-fulfill", ["--produce", "carts"]), 0)
        self.assertEqual(execute_mock.call_args.kwargs["produce"], ("carts",))

    def test_run_k6_rejects_undeclared_produce_before_docker(self) -> None:
        with patch("pg.k6runner.execute_workflow") as execute_mock:
            self.assertEqual(run_k6("smoke", ["--produce", "carts"]), 1)
        execute_mock.assert_not_called()

    @patch("pg.k6runner.confirm_docker_run", return_value=True)
    def test_place_order_missing_carts_fails_before_docker_and_names_producers(self, _confirm) -> None:
        out, err = StringIO(), StringIO()
        with patch("sys.stdin", StringIO()), patch("sys.stdout", out), patch("sys.stderr", err), \
             patch("punch.execution._has_data_rows", return_value=False), \
             patch("punch.execution.subprocess.Popen") as popen:
            rc = run_k6("place-order", [])
        self.assertEqual(rc, 1)
        popen.assert_not_called()
        self.assertIn("cart-fulfill, cart-fulfill-browser (--produce carts)", out.getvalue() + err.getvalue())
``` Update the `ExecutionResult(...)` constructions at ~line 90 to the 5-arg form. In the CLI forwarding test (old `test_cli_forwards_static_perf_arguments`), change `["--confirm-output-data"]` to `["--produce", "carts"]`.

`scripts/pg/tests/test_perf_ci_docs_contract.py`: line 89 `assertIn("--confirm-output-data", ...)` → `assertIn("--produce", result.stdout)`; line ~119 `assertIn("outputs.csv", ...)` → `assertIn("spec.data", documents[path])`. Keep line 76's negative assertion but change it to `"--produce"` (CI smoke must not produce data).

- [ ] **Step 2: Run to verify failure**

Run: `pnpm pg:test`
Expected: FAIL (workflows still declare `outputs.csv`; `run_k6` signature).

- [ ] **Step 3: Bump submodule pointer and migrate workflow YAML**

`git add vendor/punch` (picks up Task 5's commit).

`workflows/cart-fulfill.yaml` (and `cart-fulfill-browser.yaml`, keeping its own service/script/forward lines):
```yaml
  outputs:
    summary:
      path: tests/performance/k6/reports/cart-fulfill-summary.json
  data:
    directory: tests/performance/k6/data
    mountedAt: /scripts/data
    produces:
      - dataset: carts
        columns: [cartId, productId, sid]
        targets: [place-order]
```
(remove the `csv:` entry). `workflows/place-order.yaml`: delete the `inputs:` block, add:
```yaml
  data:
    directory: tests/performance/k6/data
    mountedAt: /scripts/data
    requires: [carts]
```

- [ ] **Step 4: Migrate k6 scripts**

- `cart-fulfill.ts:128`: `` console.log(`[DATA carts] ${cartId},${productId},${sid}`); `` and update the header comment's `[CSV]` mentions to `[DATA carts]`.
- `cart-fulfill-browser.ts:85`: `` console.log(`[DATA carts] ${cartId},,${sid}`); `` plus comment updates.
- `place-order.ts`: replace the loader with
```ts
const reservedCarts = new SharedArray<ReservedCart>("reserved-carts", () => {
  // Punch injects the container path of the required "carts" dataset
  // (see spec.data in workflows/place-order.yaml). Line 1 is the header.
  const raw = open(__ENV.DATA_CARTS_CSV);
  return raw
    .split("\n")
    .slice(1)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const [cartId, productId, sid] = line.split(",");
      return { cartId, productId, sid };
    });
});
```
and rewrite the "Data file" header comment to describe `DATA_CARTS_CSV` + header row (drop the `reports/` duplication story and the `perf.py` preflight reference — Punch preflights now).

- [ ] **Step 5: Rewrite `k6runner.run_k6` and `perf.py`**

`k6runner.py`:
```python
import argparse
from typing import Dict, Optional, Sequence

from punch.catalog import CatalogError, load_catalog
from punch.execution import (
    build_compose_run_command,
    confirm_delete_consumed,
    confirm_docker_run,
    data_environment,
    execute_workflow,
    required_data_paths,
    resolve_data_overrides,
    validate_produce,
)


def _parse_data_args(workflow_name: str, args: Sequence[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(prog=f"./dev perf:{workflow_name}")
    parser.add_argument("--produce", action="append", default=[], metavar="DATASET")
    parser.add_argument("--data", action="append", default=[], metavar="DATASET=PATH")
    return parser.parse_args(list(args))


def run_k6(
    workflow_name: str,
    args: Sequence[str] = (),
    *,
    extra_env: Optional[Dict[str, str]] = None,
    default_port: int = BFF_PORT,
) -> int:
    parsed = _parse_data_args(workflow_name, args)
    workflow_path = PERF_WORKFLOWS_DIR / f"{workflow_name}.yaml"
    try:
        catalog = load_catalog(PERF_WORKFLOWS_DIR)
        workflow = load_workflow(workflow_path)
        produce = validate_produce(workflow, parsed.produce)
        overrides = resolve_data_overrides(workflow, parsed.data)
    except (CatalogError, WorkflowError, ValueError) as error:
        fail(f"Could not prepare k6 workflow {workflow_name}: {error}")
        return 1
    # ... existing header / base_url / readiness-hint block unchanged ...
    _announce_data(workflow, catalog, produce)
    command = build_compose_run_command(
        workflow, environment, data_env=data_environment(workflow, overrides)
    )
    docker_run_confirmed = confirm_docker_run(
        command, assume_yes=bool(produce), stdin=sys.stdin, stdout=sys.stdout
    )
    result = execute_workflow(
        workflow,
        environment=environment,
        produce=produce,
        data_overrides=overrides,
        producers_of=catalog.producers_of,
        docker_run_confirmed=docker_run_confirmed,
        stdout=sys.stdout,
        stderr=sys.stderr,
        log_path=PERF_REPORTS_DIR / "logs" / f"k6-{workflow.name}.log",
    )
    print()
    confirm_delete_consumed(
        required_data_paths(workflow, overrides), stdin=sys.stdin, stdout=sys.stdout
    )
    # ... existing pass/fail reporting unchanged; on pass also:
    #     for d in result.datasets: info(f"Wrote {d.record_count} {d.dataset} rows to {d.path}")


def _announce_data(workflow, catalog, produce) -> None:
    if workflow.data is None:
        return
    for product in workflow.data.produces:
        state = "writing" if product.dataset in produce else f"not written (add --produce {product.dataset})"
        info(f"Produces {product.dataset} → {', '.join(product.targets)}: {state}")
    for dataset in workflow.data.requires:
        info(f"Requires {dataset} ← {', '.join(catalog.producers_of(dataset))}")
    print()
```
(`assume_yes=bool(produce)` preserves today's behavior where the explicit data flag also skipped the Docker prompt.) Drop the `confirm_output_data` import.

`perf.py` becomes:
```python
"""perf — named k6 workflows delegated to scripts/pg/k6runner.py.

Dataset produce/require behavior lives in each workflow's spec.data and is
handled by Punch; these commands only pick the workflow and target port.
"""

from __future__ import annotations

import shutil
from typing import Sequence

from pg.ansi import dim, fail, info, pass_, warn
from pg.k6runner import run_k6
from pg.paths import PERF_REPORTS_DIR, WEB_PORT


def smoke(args: Sequence[str]) -> int:
    return run_k6("smoke", args)


def purchase_flow(args: Sequence[str]) -> int:
    return run_k6("purchase-flow", args)


def purchase_flow_browser(args: Sequence[str]) -> int:
    return run_k6("purchase-flow-browser", args, default_port=WEB_PORT)


def cart_fulfill(args: Sequence[str]) -> int:
    return run_k6("cart-fulfill", args)


def cart_fulfill_browser(args: Sequence[str]) -> int:
    return run_k6("cart-fulfill-browser", args, default_port=WEB_PORT)


def place_order(args: Sequence[str]) -> int:
    return run_k6("place-order", args)
```
Keep `open_report()` and `clean()` exactly as they are (and whatever imports they use; remove now-unused imports such as `argparse`, `sys`, `IO`, `Path`, `PERF_DATA_DIR`, `header` only if unused).

- [ ] **Step 6: Mount data dir for k6-browser**

In `infra/docker/compose.performance.yaml`, k6-browser `volumes:` (~line 117) add `- ../../tests/performance/k6/data:/scripts/data`.

- [ ] **Step 7: Run tests and build**

Run: `pnpm pg:test && (cd tests/performance/k6 && npm run build && npm run typecheck)`
Expected: PASS; esbuild writes `dist/`.

- [ ] **Step 8: Live behavior check (carts chain unchanged)**

```bash
./dev up
docker compose -f infra/docker/compose.performance.yaml build k6
ITERATIONS=2 ./dev perf:cart-fulfill --produce carts
head -3 tests/performance/k6/data/carts.csv        # header + 2 rows
ITERATIONS=2 ./dev perf:place-order </dev/null       # passes; non-interactive keeps file
rm tests/performance/k6/data/carts.csv
./dev perf:place-order </dev/null                  # fails before Docker naming cart-fulfill, cart-fulfill-browser
```
Expected: as commented. Remove stale `tests/performance/k6/data/cart-fulfill-carts.csv` if present (it is gitignored legacy output).

- [ ] **Step 9: Commit**

```bash
git add vendor/punch tests/performance/k6/workflows tests/performance/k6/scenarios \
  scripts/pg infra/docker/compose.performance.yaml
git commit -m "refactor(perf): move carts chain to Punch dataset contract

Bump vendor/punch to the spec.data produce/require contract.
cart-fulfill(-browser) produce the carts dataset for place-order, which
reads DATA_CARTS_CSV. perf.py drops its CSV duplicate, preflight, and
delete helpers; every perf command passes --produce/--data through to
Punch. --confirm-output-data is replaced by --produce."
```

---

### Task 7: Temperature rule and contracts

**Files:**
- Create: `apps/bff/src/modules/orders/order-temperature.ts`, `apps/bff/src/modules/orders/order-temperature.spec.ts`
- Modify: `packages/shared-types/src/index.ts`, `packages/contracts/src/index.ts`

**Interfaces:**
- Produces:
  ```ts
  // shared-types
  export type OrderTemperature = "hot" | "cold";
  // contracts
  export type { OrderTemperature };
  interface Order { ...; readonly temperature: OrderTemperature; readonly coolsAt: string }
  export interface OrderStatusResponse {
    readonly orderId: string; readonly status: OrderStatus; readonly temperature: OrderTemperature;
    readonly placedAt: string; readonly coolsAt: string; readonly checkedAt: string;
  }
  // order-temperature.ts
  export const DEFAULT_COOL_DOWN_SECONDS = 300;
  export const ORDER_COOL_DOWN_MS = Symbol("ORDER_COOL_DOWN_MS");
  export function parseCoolDownSeconds(raw: string | undefined): number;
  export function temperatureOf(placedAt: Date, now: Date, coolDownMs: number): OrderTemperature;
  export function coolsAt(placedAt: Date, coolDownMs: number): Date;
  ```

- [ ] **Step 1: Write failing spec**

`order-temperature.spec.ts`:
```ts
import { describe, expect, it } from "vitest";
import {
  DEFAULT_COOL_DOWN_SECONDS,
  coolsAt,
  parseCoolDownSeconds,
  temperatureOf,
} from "./order-temperature";

const PLACED = new Date("2026-10-04T12:00:00.000Z");
const FIVE_MIN = 5 * 60 * 1000;
const at = (ms: number) => new Date(PLACED.getTime() + ms);

describe("temperatureOf", () => {
  it("is hot right after placement", () => {
    expect(temperatureOf(PLACED, at(0), FIVE_MIN)).toBe("hot");
  });
  it("is hot at 4:59.999", () => {
    expect(temperatureOf(PLACED, at(FIVE_MIN - 1), FIVE_MIN)).toBe("hot");
  });
  it("is cold exactly at the 5:00 boundary", () => {
    expect(temperatureOf(PLACED, at(FIVE_MIN), FIVE_MIN)).toBe("cold");
  });
  it("is cold after the boundary", () => {
    expect(temperatureOf(PLACED, at(FIVE_MIN + 60_000), FIVE_MIN)).toBe("cold");
  });
  it("treats a clock behind placedAt as hot", () => {
    expect(temperatureOf(PLACED, at(-1000), FIVE_MIN)).toBe("hot");
  });
});

describe("coolsAt", () => {
  it("adds the cool-down to placedAt", () => {
    expect(coolsAt(PLACED, FIVE_MIN).toISOString()).toBe("2026-10-04T12:05:00.000Z");
  });
});

describe("parseCoolDownSeconds", () => {
  it("defaults to 300 when unset or empty", () => {
    expect(parseCoolDownSeconds(undefined)).toBe(DEFAULT_COOL_DOWN_SECONDS);
    expect(parseCoolDownSeconds("")).toBe(300);
  });
  it("accepts a positive integer", () => {
    expect(parseCoolDownSeconds("20")).toBe(20);
  });
  it.each(["0", "-5", "1.5", "abc", "10s", " 7 "])("rejects %j", (raw) => {
    expect(() => parseCoolDownSeconds(raw)).toThrow(
      /ORDER_COOL_DOWN_SECONDS must be a positive integer/,
    );
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @mini-commerce/bff exec vitest run src/modules/orders/order-temperature.spec.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

`packages/shared-types/src/index.ts` after `OrderStatus`:
```ts
// Derived at read time from placedAt: an order is "hot" for the cool-down
// window after it is served (placed), then "cold". Never stored.
export type OrderTemperature = "hot" | "cold";
```
`packages/contracts/src/index.ts`: add `OrderTemperature` to the import from shared-types and the `export type { ... }` list; add to `Order`:
```ts
  readonly temperature: OrderTemperature;
  readonly coolsAt: string;
```
and after `ManageOrderResponse`:
```ts
export interface OrderStatusResponse {
  readonly orderId: string;
  readonly status: OrderStatus;
  readonly temperature: OrderTemperature;
  readonly placedAt: string;
  readonly coolsAt: string;
  // Server clock used to derive `temperature`.
  readonly checkedAt: string;
}
```
`order-temperature.ts`:
```ts
// Order temperature: "hot" for the cool-down window after placement (the
// moment the coffee is served), "cold" afterwards. Derived on read from
// placedAt — never persisted, no scheduler. See
// docs/next-steps/order-temperature.md.
import type { OrderTemperature } from "@mini-commerce/shared-types";

export const DEFAULT_COOL_DOWN_SECONDS = 300;
export const ORDER_COOL_DOWN_MS = Symbol("ORDER_COOL_DOWN_MS");

export function parseCoolDownSeconds(raw: string | undefined): number {
  if (raw === undefined || raw === "") return DEFAULT_COOL_DOWN_SECONDS;
  if (!/^[1-9]\d*$/.test(raw)) {
    throw new Error(
      `ORDER_COOL_DOWN_SECONDS must be a positive integer, got ${JSON.stringify(raw)}`,
    );
  }
  return Number(raw);
}

export function temperatureOf(
  placedAt: Date,
  now: Date,
  coolDownMs: number,
): OrderTemperature {
  return now.getTime() - placedAt.getTime() < coolDownMs ? "hot" : "cold";
}

export function coolsAt(placedAt: Date, coolDownMs: number): Date {
  return new Date(placedAt.getTime() + coolDownMs);
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter @mini-commerce/bff exec vitest run src/modules/orders/order-temperature.spec.ts`
Expected: PASS. (`pnpm typecheck` will fail until Tasks 8 and 10 add the new `Order` fields — do not commit yet; continue to Task 8.)

---

### Task 8: BFF — temperature on reads and `GET /orders/:id/status` from Postgres

**Files:**
- Modify: `apps/bff/src/modules/orders/orders.types.ts`, `orders.service.ts`, `orders.controller.ts`, `orders.module.ts`
- Test: `apps/bff/src/modules/orders/orders.service.spec.ts`, `orders.controller.spec.ts`
- Modify: any other BFF file constructing an `Order` literal (find with `grep -rn "placedAt:" apps/bff/src --include=*.ts`)

**Interfaces:**
- Consumes: `temperatureOf`, `coolsAt`, `parseCoolDownSeconds`, `ORDER_COOL_DOWN_MS`, `DEFAULT_COOL_DOWN_SECONDS` (Task 7); `OrderStatusResponse` (Task 7).
- Produces: `OrdersService.getStatus(orderId: string): Promise<OrderStatusResponse>`; `OrdersController.status(id)` at `GET /orders/:id/status`; `listAll()`/`get()` return `Order` with `temperature` + `coolsAt`.

- [ ] **Step 1: Write failing service tests** (append inside `describe("OrdersService")`)

```ts
  describe("temperature", () => {
    afterEach(() => vi.useRealTimers());

    it("get() is hot within the default 5 minutes of placedAt", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-05-14T12:04:59.000Z"));
      const order = service.get("ord_demo");
      expect(order.temperature).toBe("hot");
      expect(order.coolsAt).toBe("2026-05-14T12:05:00.000Z");
    });

    it("listAll() is cold after the cool-down", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-05-14T12:05:00.000Z"));
      expect(service.listAll()[0].temperature).toBe("cold");
    });
  });

  describe("getStatus()", () => {
    afterEach(() => vi.useRealTimers());

    it("reads Postgres directly, not the cache", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-05-14T12:01:00.000Z"));
      prisma.order.findUnique.mockResolvedValue({
        orderId: "ord_demo",
        status: "prepared",
        placedAt: new Date("2026-05-14T12:00:00.000Z"),
      });
      const res = await service.getStatus("ord_demo");
      expect(prisma.order.findUnique).toHaveBeenCalledWith({
        where: { orderId: "ord_demo" },
        select: { orderId: true, status: true, placedAt: true },
      });
      expect(res).toEqual({
        orderId: "ord_demo",
        status: "prepared", // DB value, cache still says "pending"
        temperature: "hot",
        placedAt: "2026-05-14T12:00:00.000Z",
        coolsAt: "2026-05-14T12:05:00.000Z",
        checkedAt: "2026-05-14T12:01:00.000Z",
      });
    });

    it("throws NotFoundException when the row is missing", async () => {
      prisma.order.findUnique.mockResolvedValue(null);
      await expect(service.getStatus("ord_missing")).rejects.toBeInstanceOf(NotFoundException);
    });

    it("honours an injected cool-down", async () => {
      const module = await Test.createTestingModule({
        providers: [
          OrdersService,
          { provide: PrismaService, useValue: prisma },
          { provide: DomainEventsService, useValue: makeDomainEvents() },
          { provide: CatalogService, useValue: makeCatalog() },
          { provide: ORDER_COOL_DOWN_MS, useValue: 20_000 },
        ],
      }).compile();
      const fast = module.get(OrdersService);
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-05-14T12:00:20.000Z"));
      prisma.order.findUnique.mockResolvedValue({
        orderId: "ord_demo", status: "pending", placedAt: new Date("2026-05-14T12:00:00.000Z"),
      });
      expect((await fast.getStatus("ord_demo")).temperature).toBe("cold");
    });
  });
```
Add imports: `afterEach` from vitest, `ORDER_COOL_DOWN_MS` from `./order-temperature`.

Controller spec — add `temperature: "hot", coolsAt: "2026-05-14T12:05:00.000Z"` to `DEMO_ORDER`, add `getStatus: vi.fn()` to the mock service, and:
```ts
  describe("GET /orders/:id/status", () => {
    it("delegates to OrdersService.getStatus()", async () => {
      const status = {
        orderId: "ord_demo", status: "pending", temperature: "hot",
        placedAt: "2026-05-14T12:00:00.000Z", coolsAt: "2026-05-14T12:05:00.000Z",
        checkedAt: "2026-05-14T12:01:00.000Z",
      };
      const { controller, svc } = makeController({ getStatus: vi.fn().mockResolvedValue(status) });
      await expect(controller.status("ord_demo")).resolves.toEqual(status);
      expect(svc.getStatus).toHaveBeenCalledWith("ord_demo");
    });
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @mini-commerce/bff exec vitest run src/modules/orders`
Expected: FAIL (`getStatus` not a function, `temperature` undefined).

- [ ] **Step 3: Implement**

`orders.types.ts`: import `OrderTemperature`, add `readonly temperature: OrderTemperature; readonly coolsAt: string;` to `Order`, and re-export `OrderStatusResponse` shape:
```ts
export interface OrderStatusResponse {
  readonly orderId: string;
  readonly status: OrderStatus;
  readonly temperature: OrderTemperature;
  readonly placedAt: string;
  readonly coolsAt: string;
  readonly checkedAt: string;
}
```
`orders.service.ts`:
- Keep the cache storing temperature-less records: change `toOrder` return type to `StoredOrder = Omit<Order, "temperature" | "coolsAt">` and `private cache: StoredOrder[]`. `findByClientRequestId` and `create`'s returned replay/new order go through `this.withTemperature(...)`.
- Constructor gains:
  ```ts
    @Optional()
    @Inject(ORDER_COOL_DOWN_MS)
    private readonly coolDownMs: number = DEFAULT_COOL_DOWN_SECONDS * 1000,
  ```
  (import `Inject`, `Optional` from `@nestjs/common`).
- Add:
  ```ts
  private withTemperature(order: StoredOrder, now = new Date()): Order {
    const placedAt = new Date(order.placedAt);
    return {
      ...order,
      temperature: temperatureOf(placedAt, now, this.coolDownMs),
      coolsAt: coolsAt(placedAt, this.coolDownMs).toISOString(),
    };
  }

  listAll(): ReadonlyArray<Order> {
    const now = new Date();
    return this.cache.map((o) => this.withTemperature(o, now));
  }

  get(orderId: string): Order {
    const order = this.cache.find((o) => o.orderId === orderId);
    if (!order) throw new NotFoundException(`order ${orderId} not found`);
    return this.withTemperature(order);
  }

  // Always reads Postgres (bypassing the in-memory cache) so the status
  // path exercises a real database request end to end.
  async getStatus(orderId: string): Promise<OrderStatusResponse> {
    return tracer.startActiveSpan("orders.status", async (span) => {
      try {
        span.setAttribute("order.id", orderId);
        const row = await this.prisma.order.findUnique({
          where: { orderId },
          select: { orderId: true, status: true, placedAt: true },
        });
        if (!row) throw new NotFoundException(`order ${orderId} not found`);
        const now = new Date();
        const temperature = temperatureOf(row.placedAt, now, this.coolDownMs);
        span.setAttribute("order.temperature", temperature);
        return {
          orderId: row.orderId,
          status: row.status as OrderStatus,
          temperature,
          placedAt: row.placedAt.toISOString(),
          coolsAt: coolsAt(row.placedAt, this.coolDownMs).toISOString(),
          checkedAt: now.toISOString(),
        };
      } catch (err) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: String(err) });
        throw err;
      } finally {
        span.end();
      }
    });
  }
  ```
- In `manage()`, `current` must be the stored record: replace `const current = this.get(orderId);` with a cache lookup (`const idx = this.cache.findIndex(...)`, throw `NotFoundException` when `-1`, `const current = this.cache[idx]!`) and reuse `idx` below.

`orders.controller.ts`: add (before `@Post(":id/manage")`):
```ts
  @Get(":id/status")
  status(@Param("id") id: string): Promise<OrderStatusResponse> {
    return this.orders.getStatus(id);
  }
```
`orders.module.ts`: update the header comment's public-surface list with `GET  /orders/:id/status   — temperature from Postgres (hot → cold after ORDER_COOL_DOWN_SECONDS)`, and providers:
```ts
  providers: [
    OrdersService,
    {
      provide: ORDER_COOL_DOWN_MS,
      // Throws at bootstrap on an invalid value, so a misconfigured BFF
      // fails fast instead of serving wrong temperatures.
      useFactory: () => parseCoolDownSeconds(process.env.ORDER_COOL_DOWN_SECONDS) * 1000,
    },
  ],
```
Fix any other `Order` literal the grep finds (visualization fixtures, checkout tests) by adding `temperature` and `coolsAt`, or by typing them as the stored shape when they never leave the service.

Add `ORDER_COOL_DOWN_SECONDS=300` with a one-line comment to `.env.example`, and forward it in the BFF service `environment:` of the dev compose file that defines the `bff` service (`grep -rln "DATABASE_URL" infra/docker/*.yaml`) as `ORDER_COOL_DOWN_SECONDS: ${ORDER_COOL_DOWN_SECONDS:-300}`.

- [ ] **Step 4: Run tests and typecheck**

Run: `pnpm --filter @mini-commerce/bff test && pnpm --filter @mini-commerce/bff typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/shared-types packages/contracts apps/bff .env.example infra/docker
git commit -m "feat(orders): derive hot/cold temperature, add GET /orders/:id/status

Temperature is hot until ORDER_COOL_DOWN_SECONDS (default 300) after
placedAt, then cold; computed on read, never stored. The status endpoint
reads Postgres directly so the path exercises a real database request."
```
If root `pnpm typecheck` fails only in `apps/web` (Order fields), that is resolved in Task 10; this commit gates on the BFF package.

---

### Task 9: Smoke check for `/orders/:id/status`

**Files:**
- Modify: `scripts/pg/smoke.py` (~line 122)
- Modify: `CLAUDE.md` ("15 endpoint checks" → "16"), `docs/cli-reference.md` smoke count if stated

**Interfaces:**
- Consumes: `GET /orders/:id/status` response shape (Task 8).

- [ ] **Step 1: Add the check after the `GET /orders/ord_demo` check**

```python
    def order_status() -> None:
        body = _get_json("/orders/ord_demo/status", cookie_jar=jar)
        for key in ("orderId", "status", "temperature", "placedAt", "coolsAt", "checkedAt"):
            if key not in body:
                raise AssertionError(f"missing {key}")
        if body["temperature"] not in ("hot", "cold"):
            raise AssertionError(f"unexpected temperature {body['temperature']!r}")

    results.append(_check("GET  /orders/ord_demo/status (typed temperature)", order_status))
```
Use the JSON helper the existing `viz_scene()` check uses (read `smoke.py` lines 129–160; if it inlines `pg.http` calls, mirror that exact call instead of `_get_json`).

- [ ] **Step 2: Run against a live BFF**

Run: `./dev up && ./dev smoke`
Expected: `16/16` passing, new line `GET  /orders/ord_demo/status (typed temperature)` OK.

- [ ] **Step 3: Commit**

```bash
git add scripts/pg/smoke.py CLAUDE.md docs/cli-reference.md
git commit -m "test(smoke): check typed order status temperature"
```

---

### Task 10: Web hot/cold badge with live flip

**Files:**
- Modify: `apps/web/src/lib/api/expresso-api.ts`, `apps/web/src/lib/api/mock-data.ts`, `apps/web/src/components/sections/OrdersSection.tsx`
- Modify: `tests/e2e/fixtures/commerce-api.ts`
- Create: `tests/e2e/tests/order-temperature.spec.ts`

**Interfaces:**
- Consumes: `OrderTemperature`, `OrderStatusResponse`, `Order.temperature/coolsAt` (Task 7); `GET /orders/:id/status` (Task 8).
- Produces: `expressoApi.getOrderStatus(orderId: string): Promise<OrderStatusResponse>`; DOM `data-testid="order-temperature"` with `data-temperature="hot|cold"` and text `Hot`/`Cold`.

- [ ] **Step 1: Write failing Playwright spec**

First read `tests/e2e/fixtures/commerce-api.ts` (Order type at line 37, order creation at ~182, `/orders/:id` route at ~213) and one existing spec that uses it (e.g. `tests/e2e/tests/purchase.spec.ts`) to reuse its setup helper and navigation to the orders section. Then `tests/e2e/tests/order-temperature.spec.ts`:
```ts
import { expect, test } from "@playwright/test";
import { installCommerceApi } from "../fixtures/commerce-api";

test.describe("order temperature badge", () => {
  test("a freshly placed order shows Hot in the list and detail", async ({ page }) => {
    const api = await installCommerceApi(page, { coolDownMs: 300_000 });
    const order = api.seedOrder({ placedAt: new Date().toISOString() });
    await page.goto("/");
    await page.getByTestId("home-orders").scrollIntoViewIfNeeded();
    const row = page.getByRole("button", { name: new RegExp(order.orderId) });
    await expect(row.getByTestId("order-temperature")).toHaveText("Hot");
    await row.click();
    await expect(page.getByTestId("order-temperature")).toHaveAttribute("data-temperature", "hot");
  });

  test("detail flips from Hot to Cold at coolsAt without a reload", async ({ page }) => {
    const api = await installCommerceApi(page, { coolDownMs: 3_000 });
    const order = api.seedOrder({ placedAt: new Date().toISOString() });
    await page.goto("/");
    await page.getByRole("button", { name: new RegExp(order.orderId) }).click();
    const badge = page.getByTestId("order-temperature");
    await expect(badge).toHaveText("Hot");
    await expect(badge).toHaveText("Cold", { timeout: 8_000 });
  });

  test("an old order shows Cold", async ({ page }) => {
    const api = await installCommerceApi(page, { coolDownMs: 300_000 });
    const order = api.seedOrder({ placedAt: new Date(Date.now() - 600_000).toISOString() });
    await page.goto("/");
    const row = page.getByRole("button", { name: new RegExp(order.orderId) });
    await expect(row.getByTestId("order-temperature")).toHaveText("Cold");
  });
});
```
Adjust `installCommerceApi`/`seedOrder` names to the fixture's real exported API; if the fixture has no seeding hook, add `seedOrder(partial)` that inserts into its `orders` map, and a `coolDownMs` option.

- [ ] **Step 2: Extend the e2e fixture**

In `commerce-api.ts`: add `temperature: "hot" | "cold"` and `coolsAt: string` to its `Order` type; compute them when serving (`/orders`, `/orders/:id`) from `placedAt` + `coolDownMs` (default 300_000) and `Date.now()`; add the route before the plain `/orders/:id` match:
```ts
    const statusMatch = path.match(/^\/orders\/([^/]+)\/status$/);
    if (method === "GET" && statusMatch) {
      const order = orders.get(decodeURIComponent(statusMatch[1]));
      if (!order) return fulfillJson(route, 404, { message: "Order not found" });
      const placed = Date.parse(order.placedAt);
      const now = Date.now();
      return fulfillJson(route, 200, {
        orderId: order.orderId,
        status: order.status,
        temperature: now - placed < coolDownMs ? "hot" : "cold",
        placedAt: order.placedAt,
        coolsAt: new Date(placed + coolDownMs).toISOString(),
        checkedAt: new Date(now).toISOString(),
      });
    }
```

- [ ] **Step 3: Run to verify failure**

Run: `./dev up web && pnpm --filter ./tests/e2e exec playwright test tests/order-temperature.spec.ts` (use the package name from `tests/e2e/package.json` if the filter path form is rejected)
Expected: FAIL (no `order-temperature` test id).

- [ ] **Step 4: Implement API client and mock data**

`expresso-api.ts`: import/export `OrderTemperature`, `OrderStatusResponse` from contracts; add `getOrderStatus` to `realApi`:
```ts
  getOrderStatus(orderId: string): Promise<OrderStatusResponse> {
    return request<OrderStatusResponse>("GET", `/orders/${encodeURIComponent(orderId)}/status`);
  },
```
to `mockApi`:
```ts
  async getOrderStatus(orderId: string): Promise<OrderStatusResponse> {
    await simulateLatency();
    const order = getMockOrder(orderId);
    if (!order) {
      throw new ExpressoApiError("GET", `/orders/${orderId}/status`, 404, { message: "Order not found" });
    }
    return {
      orderId: order.orderId, status: order.status, temperature: order.temperature,
      placedAt: order.placedAt, coolsAt: order.coolsAt, checkedAt: new Date().toISOString(),
    };
  },
```
and to `expressoApi`:
```ts
  getOrderStatus(orderId: string): Promise<OrderStatusResponse> {
    return isDemoMode() ? mockApi.getOrderStatus(orderId) : realApi.getOrderStatus(orderId);
  },
```
`mock-data.ts`: store mock orders without temperature (`type StoredMockOrder = Omit<Order, "temperature" | "coolsAt">`), and add
```ts
const MOCK_COOL_DOWN_MS = 5 * 60 * 1000;

function withTemperature(order: StoredMockOrder): Order {
  const placed = Date.parse(order.placedAt);
  return {
    ...order,
    temperature: Date.now() - placed < MOCK_COOL_DOWN_MS ? "hot" : "cold",
    coolsAt: new Date(placed + MOCK_COOL_DOWN_MS).toISOString(),
  };
}
```
applied in `getMockOrder` and `getAllMockOrders` on the way out.

- [ ] **Step 5: Implement the badge in `OrdersSection.tsx`**

Add `Flame`, `Snowflake` to the lucide import and `useEffect` to the React import. Add after `OrderStatusBadge`:
```tsx
const temperatureConfig: Record<
  OrderTemperature,
  { label: string; color: string; bgColor: string; icon: typeof Package }
> = {
  hot: { label: "Hot", color: "var(--warning)", bgColor: "rgba(245, 158, 11, 0.1)", icon: Flame },
  cold: { label: "Cold", color: "var(--info)", bgColor: "rgba(59, 130, 246, 0.1)", icon: Snowflake },
};

function OrderTemperatureBadge({ temperature }: { temperature: OrderTemperature }) {
  const cfg = temperatureConfig[temperature];
  const Icon = cfg.icon;
  return (
    <span
      data-testid="order-temperature"
      data-temperature={temperature}
      className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium"
      style={{ backgroundColor: cfg.bgColor, color: cfg.color }}
    >
      <Icon className="h-3 w-3" />
      {cfg.label}
    </span>
  );
}
```
In `OrderRow`, after `<OrderStatusBadge status={order.status} />`: `<OrderTemperatureBadge temperature={order.temperature} />`.

In `OrderDetailView`, add after the existing `useSWR`:
```tsx
  const { data: orderStatus, mutate: refreshStatus } = useSWR<OrderStatusResponse, Error>(
    `order-status-${orderId}`,
    () => expressoApi.getOrderStatus(orderId),
    { revalidateOnFocus: false },
  );

  // One timer at coolsAt flips the badge live; no polling.
  useEffect(() => {
    if (!orderStatus || orderStatus.temperature === "cold") return;
    const delay = Math.max(0, Date.parse(orderStatus.coolsAt) - Date.now()) + 250;
    const timer = setTimeout(() => void refreshStatus(), delay);
    return () => clearTimeout(timer);
  }, [orderStatus, refreshStatus]);
```
Hooks must sit above the early `isLoading`/`error` returns. Render `<OrderTemperatureBadge temperature={orderStatus?.temperature ?? order.temperature} />` next to the detail view's status display (find where `status.label` / `StatusIcon` are rendered and place it in the same flex row).

- [ ] **Step 6: Run e2e, typecheck, lint**

Run: `pnpm --filter ./tests/e2e exec playwright test tests/order-temperature.spec.ts && pnpm typecheck && pnpm lint && pnpm format`
Expected: 3 passed; typecheck/lint clean. Also run the full e2e suite once (`pnpm --filter ./tests/e2e exec playwright test`) to catch fixture-shape regressions.

- [ ] **Step 7: Commit**

```bash
git add apps/web tests/e2e
git commit -m "feat(web): show hot/cold order temperature badge

List rows use the order payload; the detail view reads
GET /orders/:id/status and refetches once at coolsAt so the badge flips
to cold without polling."
```

---

### Task 11: `order-status` k6 workflow and `orders` producers

**Files:**
- Create: `tests/performance/k6/scenarios/order-status/order-status.ts`, `tests/performance/k6/workflows/order-status.yaml`
- Modify: `tests/performance/k6/scenarios/{place-order,purchase-flow,purchase-flow-browser}/*.ts`, `workflows/{place-order,purchase-flow,purchase-flow-browser}.yaml`, `config/thresholds.ts`, `package.json` (build entry)
- Modify: `scripts/pg/perf.py`, `scripts/pg/cli.py` (command table), `scripts/pg/tests/test_k6_workflows.py`, `scripts/pg/tests/test_k6runner.py`

**Interfaces:**
- Consumes: `GET /orders/:id/status` (Task 8); Punch contract (Tasks 1–6).
- Produces: dataset `orders` (`orderId`) from `place-order`, `purchase-flow`, `purchase-flow-browser`, targeting `order-status`; `./dev perf:order-status` → `perf.order_status(args)`.

- [ ] **Step 1: Write failing orchestrator tests**

`test_k6_workflows.py` — extend `expected_data`:
```python
            "place-order": {"produces": {"orders": ("order-status",)}, "requires": ("carts",)},
            "purchase-flow": {"produces": {"orders": ("order-status",)}, "requires": ()},
            "purchase-flow-browser": {"produces": {"orders": ("order-status",)}, "requires": ()},
            "order-status": {"produces": {}, "requires": ("orders",)},
```
and in `test_workflow_catalog_links_are_valid` add:
```python
        self.assertEqual(
            catalog.producers_of("orders"),
            ("place-order", "purchase-flow", "purchase-flow-browser"),
        )
        self.assertEqual(catalog.consumers_of("orders"), ("order-status",))
```
`test_k6runner.py` — add `(perf.order_status, "order-status", {})` to the pass-through cases, and to the CLI forwarding test add `cli._perf_order_status([...])`.

- [ ] **Step 2: Run to verify failure**

Run: `pnpm pg:test`
Expected: FAIL (no `order-status.yaml`, no `perf.order_status`).

- [ ] **Step 3: Add producers**

YAML — add under `spec.data` (create the `data:` block for `purchase-flow*.yaml`, keep `requires: [carts]` on `place-order`):
```yaml
  data:
    directory: tests/performance/k6/data
    mountedAt: /scripts/data
    produces:
      - dataset: orders
        columns: [orderId]
        targets: [order-status]
```
`purchase-flow-browser.yaml` uses `service: k6-browser`; its data mount was added in Task 6.

k6:
- `purchase-flow.ts` and `place-order.ts`, inside the `"orders: verify persisted order"` group, after `check(...)`:
```ts
    const persisted = check(res, { /* existing two checks */ });
    // Punch harvests this only when the run opts in with --produce orders.
    if (persisted) console.log(`[DATA orders] ${orderId}`);
```
  (assign the existing `check` result to `persisted` rather than adding a second check call). Add a `[DATA orders]` line to each file's header comment under Coverage.
- `purchase-flow-browser.ts`, after the `check(orderIdText, ...)`:
```ts
    const renderedOrderId = orderIdText?.trim();
    if (renderedOrderId) console.log(`[DATA orders] ${renderedOrderId}`);
```
  Confirm the k6-browser compose service sets the same `K6_LOG_OUTPUT`/stdout env the `k6` service sets for `console.log` (compose file comment at ~line 122 says it does); if not, copy that pair.

- [ ] **Step 4: Add the consumer scenario**

`config/thresholds.ts`:
```ts
// order-status reads one DB-backed status per iteration; checks carry the
// temperature assertions.
export const orderStatusThresholds = {
  http_req_failed: ["rate<0.01"],
  http_req_duration: ["p(95)<500"],
  checks: ["rate>0.99"],
};
```
`scenarios/order-status/order-status.ts`:
```ts
// Order-status scenario — consumer of the "orders" dataset.
//
// Producers (place-order, purchase-flow, purchase-flow-browser) emit
// `[DATA orders] <orderId>` when run with --produce orders; Punch publishes
// tests/performance/k6/data/orders.csv (header `orderId`) and injects its
// container path as DATA_ORDERS_CSV here (see workflows/order-status.yaml).
//
// Each iteration reads GET /orders/:id/status — a direct Postgres read in
// the BFF — and checks the hot/cold temperature:
//   EXPECT_TEMPERATURE=auto (default): hot iff k6 now < coolsAt; rows within
//     ±2 s of coolsAt accept either value (clock skew).
//   EXPECT_TEMPERATURE=hot|cold: fixed expectation, e.g. a deliberate
//     "wait past the cool-down, then verify cold" run.
// ORDER_COOL_DOWN_SECONDS must match the BFF's value (default 300).

import http from "k6/http";
import { check, sleep } from "k6";
import { SharedArray } from "k6/data";
import exec from "k6/execution";
import { url } from "../../config/env";
import { orderStatusThresholds } from "../../config/thresholds";
import { buildSummaryOutputs } from "../../support/report";

const orderIds = new SharedArray<string>("orders", () =>
  open(__ENV.DATA_ORDERS_CSV)
    .split("\n")
    .slice(1)
    .map((line) => line.trim())
    .filter((line) => line.length > 0),
);

const VUS = Number(__ENV.VUS) || 1;
const ITERATIONS = __ENV.ITERATIONS ? Number(__ENV.ITERATIONS) : 5;
const EXPECT = (__ENV.EXPECT_TEMPERATURE || "auto").toLowerCase();
const COOL_DOWN_MS = (Number(__ENV.ORDER_COOL_DOWN_SECONDS) || 300) * 1000;
const SKEW_MS = 2000;

if (!["auto", "hot", "cold"].includes(EXPECT)) {
  throw new Error(`EXPECT_TEMPERATURE must be auto, hot, or cold; got ${EXPECT}`);
}

export const options = {
  scenarios: {
    order_status: {
      executor: "shared-iterations",
      vus: VUS,
      iterations: ITERATIONS,
      maxDuration: "5m",
    },
  },
  thresholds: orderStatusThresholds,
  tags: { suite: "mini-commerce-order-status" },
};

function expectedMatches(temperature: string, coolsAtMs: number, nowMs: number): boolean {
  if (EXPECT === "hot" || EXPECT === "cold") return temperature === EXPECT;
  if (Math.abs(nowMs - coolsAtMs) <= SKEW_MS) return temperature === "hot" || temperature === "cold";
  return temperature === (nowMs < coolsAtMs ? "hot" : "cold");
}

export default function () {
  const orderId = orderIds[exec.scenario.iterationInTest % orderIds.length];
  const res = http.get(url(`/orders/${encodeURIComponent(orderId)}/status`), {
    tags: { name: "GET /orders/:id/status" },
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: any = null;
  try {
    body = res.json();
  } catch {
    body = null;
  }
  const nowMs = Date.now();
  check(res, {
    "status 200": (r) => r.status === 200,
    "orderId matches": () => body?.orderId === orderId,
    "temperature is hot or cold": () => body?.temperature === "hot" || body?.temperature === "cold",
    "coolsAt - placedAt equals cool-down": () =>
      body !== null && Date.parse(body.coolsAt) - Date.parse(body.placedAt) === COOL_DOWN_MS,
    [`temperature matches ${EXPECT}`]: () =>
      body !== null && expectedMatches(body.temperature, Date.parse(body.coolsAt), nowMs),
  });
  sleep(0.5);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function handleSummary(data: any) {
  return buildSummaryOutputs(
    data,
    { title: "Mini-Commerce Order Status", testType: "order-status", targetUrl: url("") },
    "/scripts/reports/order-status-report.html",
    "/scripts/reports/order-status-summary.json",
  );
}
```
`workflows/order-status.yaml`:
```yaml
apiVersion: punch/v1
kind: K6Workflow
metadata:
  name: order-status
spec:
  workingDirectory: ../../../..
  compose:
    file: infra/docker/compose.performance.yaml
    service: k6
  k6:
    script: /scripts/scenarios/order-status/order-status.js
  environment:
    forward: [BASE_URL, VUS, ITERATIONS, EXPECT_TEMPERATURE, ORDER_COOL_DOWN_SECONDS]
  outputs:
    summary:
      path: tests/performance/k6/reports/order-status-summary.json
  data:
    directory: tests/performance/k6/data
    mountedAt: /scripts/data
    requires: [orders]
```
`package.json` build: append `scenarios/order-status/order-status.ts` to the esbuild entry list.

- [ ] **Step 5: Wire the command**

`perf.py`:
```python
def order_status(args: Sequence[str]) -> int:
    return run_k6("order-status", args)
```
`cli.py`: add `_perf_order_status` mirroring `_perf_place_order`, and register `"perf:order-status"` in the same command table/help listing where `perf:place-order` is registered (`grep -n "perf:place-order" scripts/pg/cli.py scripts/pg/*.py dev` to find every spot, including help text).

- [ ] **Step 6: Run tests and build**

Run: `pnpm pg:test && (cd tests/performance/k6 && npm run build && npm run typecheck)`
Expected: PASS; `dist/order-status/order-status.js` exists.

- [ ] **Step 7: Live pipeline evidence**

```bash
ORDER_COOL_DOWN_SECONDS=20 ./dev up            # BFF with a 20 s window (restart bff if already up)
docker compose -f infra/docker/compose.performance.yaml build k6 k6-browser
export ORDER_COOL_DOWN_SECONDS=20

ITERATIONS=3 ./dev perf:cart-fulfill --produce carts
ITERATIONS=3 ./dev perf:place-order --produce orders </dev/null
ITERATIONS=3 ./dev perf:order-status </dev/null                       # all checks pass (hot)
sleep 21
ITERATIONS=3 EXPECT_TEMPERATURE=cold ./dev perf:order-status </dev/null # cold

ITERATIONS=2 ./dev perf:purchase-flow --produce orders
ITERATIONS=2 EXPECT_TEMPERATURE=hot ./dev perf:order-status </dev/null

./dev up web
ITERATIONS=1 ./dev perf:purchase-flow-browser --produce orders
ITERATIONS=1 EXPECT_TEMPERATURE=hot ./dev perf:order-status </dev/null

rm tests/performance/k6/data/orders.csv
./dev perf:order-status </dev/null   # fails before Docker: requires "orders"; produce it with: place-order, purchase-flow, purchase-flow-browser (--produce orders)
```
Expected: as commented. Keep the terminal output for the PR description.

- [ ] **Step 8: Commit**

```bash
git add tests/performance/k6 scripts/pg
git commit -m "feat(perf): order-status workflow consuming produced orders

place-order, purchase-flow, and purchase-flow-browser produce the orders
dataset (orderId) for order-status, which checks GET /orders/:id/status
temperature against EXPECT_TEMPERATURE (auto|hot|cold)."
```

---

### Task 12: Documentation, next-steps record, CI verification

**Files:**
- Create: `docs/next-steps/order-temperature.md`
- Modify: `docs/next-steps/README.md`, `tests/performance/k6/README.md`, `docs/performance/orchestrator.md`, `docs/cli-reference.md`, `CLAUDE.md`
- Modify: `apps/bff/src/modules/orders/order-temperature.ts` (TODO anchor)

- [ ] **Step 1: Next-steps record**

`docs/next-steps/order-temperature.md`:
```markdown
# Order Temperature

Status: shipped (2026-10-04). Spec: `docs/superpowers/specs/2026-10-04-order-temperature-punch-data-design.md`.

An order is "served" at checkout (`placedAt`). It reports `hot` until
`ORDER_COOL_DOWN_SECONDS` (default 300) have passed, then `cold`.
Derived on read; never stored.

- BFF: `GET /orders/:id/status` reads Postgres directly.
- Web: hot/cold badge; detail view flips live at `coolsAt`.
- Perf: `order-status` consumes the `orders` dataset produced by
  `place-order`, `purchase-flow`, `purchase-flow-browser` (`--produce orders`).

## Open follow-ups

- Visualizer: represent hot vs cold cups (steam on hot) — not started.
- `order-status-browser` scenario — not started.
```
Add `// TODO(next-steps/order-temperature): visualizer hot/cold cup state.` above `temperatureOf` in `order-temperature.ts`. Add one line for this topic to `docs/next-steps/README.md`'s index in its existing format.

- [ ] **Step 2: k6 README**

In `tests/performance/k6/README.md`:
- Replace "Optional CSV output" and the CSV mechanics inside "Run cart-fulfill" / "Run cart-fulfill-browser" / "Run place-order" with one "Data pipeline (produce / require)" section: the pipeline diagram from the spec, the `spec.data` YAML block, `[DATA <dataset>]` format, `--produce <dataset>|all`, `--data <dataset>=<path>`, preflight message, delete prompt (interactive only), and the datasets table (`carts`: `cartId,productId,sid`; `orders`: `orderId`).
- Update every command example `--confirm-output-data` → `--produce carts` / `--produce orders`.
- Add "Run order-status" with the Task 11 Step 7 sequence (minus the browser part, linking to the browser section) and the `EXPECT_TEMPERATURE` / `ORDER_COOL_DOWN_SECONDS` explanation.
- Add `| scenarios/order-status/order-status.ts | workflows/order-status.yaml |` to the mapping table.
- In "Add a scenario", replace the `outputs.csv`/`inputs.csv` paragraph with: declare `spec.data.produces`/`requires`; Punch owns preflight and delete; `perf.py` stays a pass-through.

- [ ] **Step 3: Other docs**

- `docs/performance/orchestrator.md`: replace the CSV input/output section with the data contract (link the spec; state the catalog cross-validation rules).
- `docs/cli-reference.md`: add `perf:order-status`; document `--produce`, `--data`; remove `--confirm-output-data`.
- `CLAUDE.md` "Performance engineering": replace the last paragraph with: "Each performance command selects one repository-owned YAML workflow; Punch loads, validates, and runs it once through Docker Compose. Workflows declare datasets in `spec.data`; a producer writes its dataset only with `--produce <dataset>` (e.g. `./dev perf:place-order --produce orders`), and a consumer such as `order-status` fails before Docker until its dataset exists."

- [ ] **Step 4: Repo-wide checks**

```bash
grep -rn "confirm-output-data\|cart-fulfill-carts.csv\|outputs.csv\|inputs.csv\|\[CSV\]" \
  --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=reports \
  --exclude-dir=superpowers . | grep -v "^./vendor/punch/docs/history" || echo CLEAN
pnpm format && pnpm lint && pnpm typecheck && pnpm test && pnpm pg:test
(cd vendor/punch && python3 -m unittest discover -s tests)
```
Expected: `CLEAN`; all green. Any hit outside historical specs/plans must be updated.

- [ ] **Step 5: Commit and verify CI**

```bash
git add docs CLAUDE.md tests/performance/k6/README.md apps/bff/src/modules/orders/order-temperature.ts
git commit -m "docs: order temperature and Punch dataset pipeline"
git push -u origin feat/order-temperature-punch-data
gh run watch "$(gh run list --branch feat/order-temperature-punch-data --limit 1 --json databaseId -q '.[0].databaseId')"
```
Expected: CI green on a real run. Note: CI checks out `vendor/punch` from its remote; the submodule commit from Task 5 is unpushed (per repo convention), so if CI fails on submodule checkout, stop and ask the owner whether to push `vendor/punch` — do not push it unasked.
