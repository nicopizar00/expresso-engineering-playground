# Workflow Naming Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename every k6 workflow to `<channel>-<resource>[-<sub>]` after the spec A routes, delete `smoke`/`load`/`stress`, align the two browser scenarios with their `http-*` pairs, and trim the Punch menu to `Name │ Description │ In │ Out`.

**Architecture:** One string per workflow drives everything: YAML stem = `metadata.name` = scenario dir = scenario file = report file = `./dev perf:<id>`. A new stdlib-only registry (`scripts/pg/workflows.py`) replaces ten hand-written `perf.*`/`cli._perf_*` pairs, and contract tests pin the registry against the YAML directory. The Punch menu change lands in `vendor/punch` first and is pushed to Punch's remote before the submodule pointer is bumped.

**Tech Stack:** Python stdlib + PyYAML (`scripts/pg`, Punch), k6 0.54 (+ `k6/browser`), esbuild, Docker Compose, GitHub Actions.

**Spec:** [`docs/superpowers/specs/2026-10-06-workflow-naming-design.md`](../specs/2026-10-06-workflow-naming-design.md) — depends on spec A (PR #19, branch `feat/rest-route-conventions`); this branch is cut from it.

## Global Constraints

- Name map, descriptions, data chain, and menu render are exactly the spec's tables.
- Datasets (`carts`, `orders`, `owned-orders`, `auth-tokens`), their columns, and thresholds are unchanged. `targets:` stays in YAML, rewritten to the new IDs.
- Old `./dev perf:*` commands are removed, with no aliases. `./dev smoke` (`scripts/pg/smoke.py`) stays.
- CI k6 gate: `VUS=1 ITERATIONS=1 ./dev perf:http-purchase`, with no `--produce`.
- Dated specs, plans, and ADRs keep their old names (`docs/superpowers/**`, `docs/adr/**`).
- Committed content in English; no real names, URLs, IPs, or credentials; no AI attribution in commits.
- **Spec amendment, for approval at plan review:** k6 0.54's browser module exposes no response events (`page.on('response')`/`waitForResponse` do not exist; the existing scenario says so). So "assert the network response the UI triggers" is not possible. Instead:
  - Browser scenarios share the **outcome** check names with their `http-*` pair and assert them from the DOM.
  - HTTP status checks (`catalog 200`, `cart add 201`, …) stay HTTP-only.
  - Both share the step order, written as `// step: <group name>` markers in the browser files, because `group()` does not accept async callbacks in k6 0.54.

## Review Focus

1. A renamed scenario that still writes `/scripts/reports/<old-id>-summary.json` makes Punch print no metrics after a run, and no test notices. Pinned in Task 2 (the coverage test checks each scenario's own `handleSummary` paths).
2. `browser-cart` emits an empty `productId` today (`${cartId},,${sid}`), so its rows do not match `http-cart`'s columns, and `http-orders` would post a cart with no known product. Pinned in Task 6 (contract test: no empty CSV field in either `[DATA carts]` template).
3. `./dev --help` must keep working without Punch's Python dependencies installed. If `cli.py` builds the perf commands by importing `pg.perf` (which pulls in `punch`/`yaml`), help breaks on a fresh checkout. Pinned in Task 3 (`pg.workflows` must be stdlib-only; test imports it with `punch` and `yaml` blocked).
4. The `k6-otel` compose service runs `smoke.js` directly. Deleting `smoke` without repointing it leaves a service that fails at start. Pinned in Task 4 (a test parses `compose.performance.yaml` and checks that every `/scripts/scenarios/...` path exists as a workflow script).
5. A blanket replace of `login`, `hot-status`, or `order-status` would corrupt unrelated text (`POST /auth/login`, `GET /me/hot-status`, the web app's `order-status-${id}` SWR key, "place-order submission"). Task 2 renames those three by explicit file list only, and the Task 8 gate greps old IDs with word context.

---

## File map

| Area                  | Files                                                                                                                                                                                                                                                                                           |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Punch menu            | `vendor/punch/src/punch/menu.py`, `vendor/punch/tests/test_menu.py`                                                                                                                                                                                                                             |
| Workflows + scenarios | `tests/performance/k6/workflows/*.yaml` (renamed, `smoke.yaml` deleted), `tests/performance/k6/scenarios/*` (renamed, `smoke/`, `load/`, `stress/` deleted), `tests/performance/k6/package.json`, `tests/performance/k6/config/thresholds.ts`                                                   |
| CLI                   | `scripts/pg/workflows.py` (new), `scripts/pg/perf.py`, `scripts/pg/cli.py`, `package.json`, `Taskfile.yml`                                                                                                                                                                                      |
| Docker                | `scripts/k6-wrapper.sh`, `infra/docker/compose.performance.yaml`, `bin/punch` (comment)                                                                                                                                                                                                         |
| CI                    | `.github/workflows/ci.yml`                                                                                                                                                                                                                                                                      |
| Browser alignment     | `tests/performance/k6/scenarios/browser-{cart,purchase}/*.ts`, `tests/performance/k6/scenarios/http-purchase/http-purchase.ts` (shared check rename), `tests/performance/k6/scenarios/http-orders/http-orders.ts` (same), `apps/web/src/components/catalog/ProductCard.tsx` (`data-product-id`) |
| Tests                 | `scripts/pg/tests/test_k6_workflows.py`, `test_k6runner.py`, `test_k6_wrapper.py`, `test_perf_ci_docs_contract.py`, `test_k6_checkout_contract.py`, new `test_browser_alignment.py`                                                                                                             |
| Docs                  | Task 8 list                                                                                                                                                                                                                                                                                     |

Rename map used throughout (old → new):

```
cart-fulfill-browser   → browser-cart
cart-fulfill           → http-cart
place-order            → http-orders
order-status           → http-orders-status
login                  → http-auth-login
hot-status             → http-me-hot-status
purchase-flow-browser  → browser-purchase
purchase-flow          → http-purchase
purchase-registered    → http-purchase-registered
smoke                  → (deleted)
```

---

### Task 1: Punch menu — `Name │ Description │ In │ Out`

**Files:**

- Modify: `vendor/punch/src/punch/menu.py:72-125`
- Modify: `vendor/punch/tests/test_menu.py:275-325`

**Interfaces:**

- Produces: `_required_input(workflow) -> str` (no catalog argument) and `_generated_output(workflow) -> str` (dataset names only). Headers become `("Name", "Description", "In", "Out")`.

Run every Punch command from `vendor/punch`. Punch's test interpreter is the repo venv: `PY=../../.cache/punch-venv/bin/python3`, because system Python lacks `rich`.

- [ ] **Step 1: Update the menu tests (failing)**

In `test_workflow_table_rows_are_the_selectable_entries`, replace the assertions after `rows, title = calls[1]`:

```python
        rows, title = calls[1]
        for header in ("Name", "Description", "In", "Out"):
            self.assertIn(header, title)
        self.assertNotIn("Required Input", title)
        self.assertIn("Fills carts.", rows[0])
        self.assertIn("carts", rows[0])
        self.assertNotIn("→", rows[0])
        self.assertNotIn("place-order", rows[0])
        self.assertIn("carts", rows[1])
        self.assertNotIn("←", rows[1])
        self.assertEqual(rows[2].split()[0], "smoke")
        self.assertNotIn("Fills carts.", output.getvalue())
```

In `test_workflow_table_rows_fit_an_80_column_terminal`, change the column tuple to `("Name", "Description", "In", "Out")`.

Add a test after it:

```python
    def test_workflow_table_marks_optional_inputs(self) -> None:
        self.write_workflow("producer", produces={"owned-orders": ["consumer"]})
        self.write_workflow("other", produces={"carts": ["consumer"]})
        self.write_workflow("consumer", requires=["carts"], optional=["owned-orders"])
        calls: list[tuple[list[str], str]] = []
        results = [_SelectedMenu(0), _SelectedMenu(None)]

        def fake_terminal_menu(entries, *, title, cursor_index=0):
            calls.append((entries, title))
            return results[len(calls) - 1]

        with patch("sys.stdin", _ConfirmedTerminal()):
            with patch("shutil.get_terminal_size", return_value=os.terminal_size((160, 24))):
                with patch("punch.menu.TerminalMenu", side_effect=fake_terminal_menu):
                    rc = run_menu(self.root)

        self.assertEqual(rc, 0)
        rows, _title = calls[1]
        consumer = next(row for row in rows if row.startswith("consumer"))
        self.assertIn("carts, owned-orders?", consumer)
```

`write_workflow` (line 87) has no `optional=` keyword yet. Add one: put `optional: list[str] | None = None,` after `requires` in the signature, change the guard to `if produces or requires or optional:`, and after the `requires` line add:

```python
            if optional:
                data += f"    optional: [{', '.join(optional)}]\n"
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `$PY -m unittest tests.test_menu -v 2>&1 | tail -20`
Expected: FAIL. `Name` is missing from the title, `→`/`←` are present, and the optional marker is missing.

- [ ] **Step 3: Implement**

In `menu.py`, replace `_required_input`, `_generated_output`, and the catalog lookup in `_workflow_menu_rows`:

```python
def _required_input(workflow: K6Workflow) -> str:
    if workflow.data is None:
        return "—"
    names = [*workflow.data.requires, *(f"{d}?" for d in workflow.data.optional)]
    return ", ".join(names) or "—"


def _generated_output(workflow: K6Workflow) -> str:
    if workflow.data is None or not workflow.data.produces:
        return "—"
    return ", ".join(product.dataset for product in workflow.data.produces)
```

In `_workflow_menu_rows`: delete the `try: catalog = load_catalog(...)` block, set `headers = ("Name", "Description", "In", "Out")`, and call `_required_input(workflow)`. Drop the `CatalogError`, `WorkflowCatalog`, or `load_catalog` imports only where nothing else in the file uses them. `load_catalog`/`CatalogError` are still used at line ~324.

- [ ] **Step 4: Run Punch's full suite**

Run: `$PY -m unittest discover -s tests 2>&1 | tail -3`
Expected: `OK` (the baseline is 166 tests; now 167).

- [ ] **Step 5: Commit in Punch, push, bump the pointer**

```bash
cd vendor/punch
git add src/punch/menu.py tests/test_menu.py
git commit -m "feat(menu): show dataset names only, mark optional inputs"
git push origin main
cd ../..
git add vendor/punch
git commit -m "chore: bump punch for the compact workflow table"
```

---

### Task 2: Rename workflows and scenarios; delete smoke/load/stress

**Files:**

- Modify: `scripts/pg/tests/test_k6_workflows.py`
- Rename (`git mv`): every pair in the rename map, for both `tests/performance/k6/workflows/<id>.yaml` and `tests/performance/k6/scenarios/<id>/<id>.ts`
- Delete: `workflows/smoke.yaml`, `scenarios/smoke/`, `scenarios/load/`, `scenarios/stress/`
- Modify: every renamed YAML (`metadata.name`, `metadata.description`, `k6.script`, `outputs.summary.path`, `targets`), every renamed scenario (`handleSummary` meta and paths, `options.scenarios` key, `tags.suite`, header comment), `tests/performance/k6/package.json` (`build`), `tests/performance/k6/config/thresholds.ts` (drop `smokeThresholds`, `loadThresholds`, `stressThresholds`)

**Interfaces:**

- Produces: nine YAMLs whose stem = `metadata.name` = scenario dir = scenario file stem. Report paths `tests/performance/k6/reports/<id>-summary.json`.

- [ ] **Step 1: Rewrite the coverage test (failing)**

In `test_k6_workflows.py`, replace the four expectation dicts and the catalog test with:

```python
        expected_names = {
            "browser-cart",
            "browser-purchase",
            "http-auth-login",
            "http-cart",
            "http-me-hot-status",
            "http-orders",
            "http-orders-status",
            "http-purchase",
            "http-purchase-registered",
        }
        expected_compose_service = {
            name: ("k6-browser" if name.startswith("browser-") else "k6")
            for name in expected_names
        }
        expected_environment_forward = {
            "browser-cart": ["BASE_URL", "VUS", "ITERATIONS"],
            "browser-purchase": ["BASE_URL", "VUS", "ITERATIONS"],
            "http-auth-login": ["BASE_URL", "VUS", "ITERATIONS", "DEMO_PASSWORD"],
            "http-cart": ["BASE_URL", "VUS", "DURATION", "ITERATIONS"],
            "http-me-hot-status": ["BASE_URL", "VUS", "DURATION", "ITERATIONS"],
            "http-orders": ["BASE_URL", "VUS", "ITERATIONS"],
            "http-orders-status": [
                "BASE_URL",
                "VUS",
                "ITERATIONS",
                "EXPECT_TEMPERATURE",
                "ORDER_COOL_DOWN_SECONDS",
            ],
            "http-purchase": ["BASE_URL", "VUS", "DURATION", "ITERATIONS"],
            "http-purchase-registered": ["BASE_URL", "VUS", "DURATION", "ITERATIONS", "USERS"],
        }
        expected_data = {
            "http-cart": {"produces": {"carts": ("http-orders",)}, "requires": ()},
            "browser-cart": {"produces": {"carts": ("http-orders",)}, "requires": ()},
            "http-orders": {"produces": {"orders": ("http-orders-status",)}, "requires": ("carts",)},
            "http-purchase": {"produces": {"orders": ("http-orders-status",)}, "requires": ()},
            "browser-purchase": {"produces": {"orders": ("http-orders-status",)}, "requires": ()},
            "http-orders-status": {"produces": {}, "requires": ("orders",)},
            "http-purchase-registered": {
                "produces": {"owned-orders": ("http-auth-login",)},
                "requires": (),
            },
            "http-auth-login": {
                "produces": {"auth-tokens": ("http-me-hot-status",)},
                "requires": (),
                "optional": ("owned-orders",),
            },
            "http-me-hot-status": {"produces": {}, "requires": ("auth-tokens",)},
        }
        expected_description = {
            "http-cart": "Reserve carts, no checkout",
            "browser-cart": "Reserve carts in Chromium",
            "http-orders": "Create orders from carts",
            "http-orders-status": "Read order status",
            "http-auth-login": "Log in, capture tokens",
            "http-me-hot-status": "Poll hot-status banner",
            "http-purchase": "Full purchase journey",
            "browser-purchase": "Full purchase in Chromium",
            "http-purchase-registered": "Purchase as demo users",
        }
```

Inside the per-workflow `subTest` loop, add:

```python
                self.assertEqual(
                    workflow.k6_script, f"/scripts/scenarios/{path.stem}/{path.stem}.js"
                )
                self.assertEqual(workflow.description, expected_description[path.stem])
                self.assertTrue(3 <= len(workflow.description.split()) <= 5)
                scenario_source = (
                    REPO_ROOT / "tests/performance/k6/scenarios" / path.stem / f"{path.stem}.ts"
                ).read_text(encoding="utf-8")
                # Review Focus 1: the scenario's own handleSummary must write the
                # report the YAML points Punch at.
                self.assertIn(f'"/scripts/reports/{path.stem}-summary.json"', scenario_source)
                self.assertIn(f'"/scripts/reports/{path.stem}-report.html"', scenario_source)
```

After the loop, add:

```python
        scenarios_dir = REPO_ROOT / "tests/performance/k6/scenarios"
        self.assertEqual(
            {p.name for p in scenarios_dir.iterdir() if p.is_dir()}, expected_names
        )
```

Replace `test_workflow_catalog_links_are_valid`'s assertions with:

```python
        self.assertEqual(catalog.producers_of("carts"), ("browser-cart", "http-cart"))
        self.assertEqual(catalog.consumers_of("carts"), ("http-orders",))
        self.assertEqual(
            catalog.producers_of("orders"),
            ("browser-purchase", "http-orders", "http-purchase"),
        )
        self.assertEqual(catalog.consumers_of("orders"), ("http-orders-status",))
        self.assertEqual(catalog.producers_of("owned-orders"), ("http-purchase-registered",))
        self.assertEqual(catalog.consumers_of("owned-orders"), ("http-auth-login",))
        self.assertEqual(catalog.producers_of("auth-tokens"), ("http-auth-login",))
        self.assertEqual(catalog.consumers_of("auth-tokens"), ("http-me-hot-status",))
```

(Catalog order is file-sort order, so `browser-*` comes before `http-*`.)

If `K6Workflow` exposes the description under a different attribute than `description`, use the one `menu.py:120` reads (`workflow.description`).

- [ ] **Step 2: Run it to make sure it fails**

Run: `cd scripts && python3 -m unittest pg.tests.test_k6_workflows -v 2>&1 | tail -15; cd ..`
Expected: FAIL on the names set (the old stems are found).

- [ ] **Step 3: Move files**

```bash
cd tests/performance/k6
mv_pair() {
  git mv "workflows/$1.yaml" "workflows/$2.yaml"
  git mv "scenarios/$1" "scenarios/$2"
  git mv "scenarios/$2/$1.ts" "scenarios/$2/$2.ts"
}
mv_pair cart-fulfill-browser browser-cart
mv_pair cart-fulfill http-cart
mv_pair place-order http-orders
mv_pair order-status http-orders-status
mv_pair login http-auth-login
mv_pair hot-status http-me-hot-status
mv_pair purchase-flow-browser browser-purchase
mv_pair purchase-flow http-purchase
mv_pair purchase-registered http-purchase-registered
git rm -q -r workflows/smoke.yaml scenarios/smoke scenarios/load scenarios/stress
cd ../../..
```

- [ ] **Step 4: Rewrite references inside the perf tree**

This replace runs only on files under `tests/performance/k6/` (Review Focus 5). Longest names go first, so `cart-fulfill-browser` is replaced before `cart-fulfill`:

```bash
python3 - <<'EOF'
import pathlib, re
root = pathlib.Path("tests/performance/k6")
files = [p for p in root.rglob("*") if p.is_file() and p.suffix in {".ts", ".yaml", ".json"}
         and "node_modules" not in p.parts and "dist" not in p.parts and "reports" not in p.parts]
pairs = [
    ("cart-fulfill-browser", "browser-cart"), ("cart_fulfill_browser", "browser_cart"),
    ("purchase-flow-browser", "browser-purchase"), ("purchase_flow_browser", "browser_purchase"),
    ("purchase-registered", "http-purchase-registered"), ("purchase_registered", "http_purchase_registered"),
    ("cart-fulfill", "http-cart"), ("cart_fulfill", "http_cart"),
    ("place-order", "http-orders"), ("place_order", "http_orders"),
    ("purchase-flow", "http-purchase"), ("purchase_flow", "http_purchase"),
    ("order-status", "http-orders-status"), ("order_status", "http_orders_status"),
]
for p in files:
    s = o = p.read_text(encoding="utf-8")
    for a, b in pairs:
        s = re.sub(rf'(?<![\w-]){re.escape(a)}(?![\w])', b, s)
    if s != o:
        p.write_text(s, encoding="utf-8"); print(p)
EOF
```

`login` and `hot-status` are ordinary words in route text (`POST /auth/login`, `/me/hot-status`, the check `"login 200"`), so they are rewritten as exact workflow-ID tokens only:

```bash
python3 - <<'PY'
import pathlib
edits = {
    "tests/performance/k6/workflows/http-auth-login.yaml": [
        ("name: login", "name: http-auth-login"),
        ("/scripts/scenarios/login/login.js", "/scripts/scenarios/http-auth-login/http-auth-login.js"),
        ("reports/login-summary.json", "reports/http-auth-login-summary.json"),
        ("targets: [hot-status]", "targets: [http-me-hot-status]"),
    ],
    "tests/performance/k6/workflows/http-me-hot-status.yaml": [
        ("name: hot-status", "name: http-me-hot-status"),
        ("/scripts/scenarios/hot-status/hot-status.js", "/scripts/scenarios/http-me-hot-status/http-me-hot-status.js"),
        ("reports/hot-status-summary.json", "reports/http-me-hot-status-summary.json"),
    ],
    "tests/performance/k6/workflows/http-purchase-registered.yaml": [
        ("targets: [login]", "targets: [http-auth-login]"),
    ],
    "tests/performance/k6/scenarios/http-auth-login/http-auth-login.ts": [
        ('tags: { suite: "mini-commerce-login" }', 'tags: { suite: "mini-commerce-http-auth-login" }'),
        ('testType: "login"', 'testType: "http-auth-login"'),
        ('"/scripts/reports/login-report.html"', '"/scripts/reports/http-auth-login-report.html"'),
        ('"/scripts/reports/login-summary.json"', '"/scripts/reports/http-auth-login-summary.json"'),
    ],
    "tests/performance/k6/scenarios/http-me-hot-status/http-me-hot-status.ts": [
        ("scenarios: { hot_status: scenario }", "scenarios: { http_me_hot_status: scenario }"),
        ('tags: { suite: "mini-commerce-hot-status" }', 'tags: { suite: "mini-commerce-http-me-hot-status" }'),
        ('testType: "hot-status"', 'testType: "http-me-hot-status"'),
        ('"/scripts/reports/hot-status-report.html"', '"/scripts/reports/http-me-hot-status-report.html"'),
        ('"/scripts/reports/hot-status-summary.json"', '"/scripts/reports/http-me-hot-status-summary.json"'),
    ],
}
for path, pairs in edits.items():
    p = pathlib.Path(path); s = p.read_text(encoding="utf-8")
    for a, b in pairs:
        assert a in s, (path, a); s = s.replace(a, b)
    p.write_text(s, encoding="utf-8")
PY
```

`http-auth-login.ts`'s `options.scenarios` block (line ~40) uses a multi-line key. Rename that key to `http_auth_login` by hand. Leave `group("auth: login")`, `url("/auth/login")`, the `"login …"` check names, and `SharedArray("login-users")` as they are; they describe the route, not the workflow.

Then read `git diff tests/performance/k6` and fix by hand:

- `metadata.description` in each YAML: set to the spec table text exactly (`expected_description` above).
- `config/thresholds.ts`: delete `smokeThresholds`, `loadThresholds`, `stressThresholds`. Update the line-30 and line-45 comments to the new IDs.
- `package.json` `build`: the list of entries must be exactly the nine `scenarios/<id>/<id>.ts` files.

- [ ] **Step 5: Verify**

Run: `cd scripts && python3 -m unittest pg.tests.test_k6_workflows -v 2>&1 | tail -5; cd .. && (cd tests/performance/k6 && npm run -s typecheck && npm run -s build | tail -3)`
Expected: PASS. Typecheck is clean, and the build lists nine `dist/<id>/<id>.js` files.

`test_k6runner`/`test_k6_wrapper`/`test_perf_ci_docs_contract` will still fail; Tasks 3–5 fix them.

- [ ] **Step 6: Commit**

```bash
git add -A tests/performance/k6 scripts/pg/tests/test_k6_workflows.py
git commit -m "feat(perf): name workflows <channel>-<resource>"
```

---

### Task 3: Workflow registry drives `perf` and `./dev perf:*`

**Files:**

- Create: `scripts/pg/workflows.py`
- Modify: `scripts/pg/perf.py` (replace the ten wrappers with `run`)
- Modify: `scripts/pg/cli.py` (replace the ten `_perf_*` functions and `COMMANDS` entries; fix the usage hint)
- Modify: `scripts/pg/tests/test_k6runner.py:127-171`, `scripts/pg/tests/test_k6runner.py:62-123` (old IDs in `run_k6` calls)
- Modify: `package.json:19,35-44`, `Taskfile.yml:117-165`

**Interfaces:**

- Produces: `pg.workflows.WORKFLOWS: dict[str, int]` (ID → default target port), `pg.perf.run(name: str, args: Sequence[str]) -> int`, and `cli.COMMANDS["perf:<id>"]` for each ID.

- [ ] **Step 1: Write the failing tests**

Replace `PerfAndCliCompatibilityTests` in `test_k6runner.py` with:

```python
class WorkflowRegistryTests(unittest.TestCase):
    def test_registry_matches_the_workflow_directory(self) -> None:
        from pg.paths import PERF_WORKFLOWS_DIR
        from pg.workflows import WORKFLOWS

        self.assertEqual(
            set(WORKFLOWS), {p.stem for p in PERF_WORKFLOWS_DIR.glob("*.yaml")}
        )

    def test_browser_workflows_default_to_the_web_port(self) -> None:
        from pg.paths import BFF_PORT, WEB_PORT
        from pg.workflows import WORKFLOWS

        for name, port in WORKFLOWS.items():
            with self.subTest(name=name):
                self.assertEqual(port, WEB_PORT if name.startswith("browser-") else BFF_PORT)

    def test_registry_imports_without_punch_or_yaml(self) -> None:
        """./dev --help must work before Punch's requirements are installed."""
        code = (
            "import sys; sys.modules['yaml'] = None; sys.modules['punch'] = None; "
            "sys.path.insert(0, 'scripts'); import pg.workflows, pg.cli"
        )
        result = subprocess.run(
            [sys.executable, "-c", code], cwd=REPO_ROOT, capture_output=True, text=True
        )
        self.assertEqual(result.returncode, 0, result.stderr)

    @patch("pg.perf.run_k6", return_value=0)
    def test_perf_run_passes_args_and_port(self, run_k6_mock) -> None:
        from pg.workflows import WORKFLOWS

        for name, port in WORKFLOWS.items():
            with self.subTest(name=name):
                run_k6_mock.reset_mock()
                self.assertEqual(perf.run(name, ["--produce", "carts"]), 0)
                run_k6_mock.assert_called_once_with(
                    name, ["--produce", "carts"], default_port=port
                )

    @patch("pg.perf.run", return_value=0)
    def test_cli_exposes_exactly_one_perf_command_per_workflow(self, run_mock) -> None:
        from pg.workflows import WORKFLOWS

        perf_commands = {
            c for c in cli.COMMANDS
            if c.startswith("perf:") and c not in ("perf:open-report", "perf:clean")
        }
        self.assertEqual(perf_commands, {f"perf:{name}" for name in WORKFLOWS})
        for name in WORKFLOWS:
            run_mock.reset_mock()
            self.assertEqual(cli.COMMANDS[f"perf:{name}"](["--produce", "carts"]), 0)
            run_mock.assert_called_once_with(name, ["--produce", "carts"])
```

Add `import subprocess` next to `import sys`, and `from pg.paths import REPO_ROOT  # noqa: E402` next to the existing `from pg import cli, perf` import (the file already imports `sys`).

In the same file's earlier tests (lines 62-123), change the workflow names to:

- `"smoke"` → `"http-purchase"` (and `/scripts/scenarios/smoke/smoke.js` → `/scripts/scenarios/http-purchase/http-purchase.js`)
- `"cart-fulfill"` → `"http-cart"`
- `("cart-fulfill", "cart-fulfill-browser")` → `("browser-cart", "http-cart")`
- `"place-order"` → `"http-orders"`
- the producers message `"cart-fulfill, cart-fulfill-browser (--produce carts)"` → `"browser-cart, http-cart (--produce carts)"`
- `test_place_order_missing_carts_…` → `test_http_orders_missing_carts_…`

One test calls `run_k6("smoke", ["--produce", "carts"])` and expects `1` because smoke produces nothing. Point it at `http-orders-status`, which also produces nothing.

- [ ] **Step 2: Run them to make sure they fail**

Run: `cd scripts && python3 -m unittest pg.tests.test_k6runner -v 2>&1 | tail -15; cd ..`
Expected: FAIL/ERROR with `No module named 'pg.workflows'`.

- [ ] **Step 3: Implement**

`scripts/pg/workflows.py`:

```python
"""Repository-owned k6 workflow IDs and the port each one targets by default.

Stdlib-only on purpose: cli.py builds `./dev perf:<id>` from this table at
import time, and `./dev --help` must work before Punch's requirements are
installed. IDs are the YAML stems in tests/performance/k6/workflows/
(test_k6runner pins the two together). browser-* workflows drive the web
app's UI; every other workflow calls the BFF.
"""

from __future__ import annotations

from typing import Dict

from pg.paths import BFF_PORT, WEB_PORT

WORKFLOWS: Dict[str, int] = {
    "browser-cart": WEB_PORT,
    "browser-purchase": WEB_PORT,
    "http-auth-login": BFF_PORT,
    "http-cart": BFF_PORT,
    "http-me-hot-status": BFF_PORT,
    "http-orders": BFF_PORT,
    "http-orders-status": BFF_PORT,
    "http-purchase": BFF_PORT,
    "http-purchase-registered": BFF_PORT,
}
```

In `perf.py`, delete `smoke` … `hot_status` (lines 18-55) and add:

```python
def run(name: str, args: Sequence[str]) -> int:
    return run_k6(name, args, default_port=WORKFLOWS[name])
```

Fix the imports (`from pg.workflows import WORKFLOWS`; drop `WEB_PORT` if unused). In `open_report`, change the two `./dev perf:smoke` hints to `./dev perf:http-purchase` and the `jq` example to `http-purchase-summary.json`. Update the module docstring's first line to `"""perf — repository-owned k6 workflows (pg.workflows) delegated to k6runner."""`.

In `cli.py`, delete the ten `_perf_<name>` functions and their `COMMANDS` lines, and add:

```python
def _perf(name: str) -> Callable[[Sequence[str]], int]:
    def run(args: Sequence[str]) -> int:
        from pg import perf
        return perf.run(name, args)
    return run
```

In `COMMANDS`, at the place where the perf entries were:

```python
    **{f"perf:{name}": _perf(name) for name in WORKFLOWS},
    "perf:open-report": _perf_open_report,
    "perf:clean": _perf_clean,
```

Add `from pg.workflows import WORKFLOWS` next to the `pg.ansi` import. Usage line: `(e.g. perf:http-cart --produce carts)`. Docstring line 3: `(perf:http-purchase etc.)`.

`package.json`: replace lines 35-44 with one `pg:perf:<id>` script per ID (`"pg:perf:http-cart": "./dev perf:http-cart"`, …, nine entries in the registry's order). Delete `pg:perf:smoke`, and change `test:perf:smoke` to `"test:perf": "VUS=1 ITERATIONS=1 ./dev perf:http-purchase"`.

`Taskfile.yml`: replace the `perf:smoke` … `perf:hot-status` tasks with one `perf:<id>` task per ID. Each `desc` is the spec description, and each command is `pnpm pg:perf:<id>`.

- [ ] **Step 4: Run them to make sure they pass**

Run: `cd scripts && python3 -m unittest pg.tests.test_k6runner pg.tests.test_k6_workflows -v 2>&1 | tail -5; cd .. && ./dev --help | grep perf:`
Expected: PASS, and help lists the nine `perf:<id>` commands plus `perf:open-report` and `perf:clean`, with no old IDs.

- [ ] **Step 5: Commit**

```bash
git add scripts/pg/workflows.py scripts/pg/perf.py scripts/pg/cli.py scripts/pg/tests/test_k6runner.py package.json Taskfile.yml
git commit -m "refactor(perf): one workflow registry behind ./dev perf:<id>"
```

---

### Task 4: Docker wiring — wrapper and compose

**Files:**

- Modify: `scripts/k6-wrapper.sh:16-30`
- Modify: `scripts/pg/tests/test_k6_wrapper.py:48-127`
- Modify: `infra/docker/compose.performance.yaml:14,18,32,49,57,79-91,105`
- Modify: `bin/punch:41` (comment)
- Create test in: `scripts/pg/tests/test_k6_workflows.py` (compose paths)

**Interfaces:**

- Consumes: Task 2's scenario paths.

- [ ] **Step 1: Write the failing tests**

In `test_k6_wrapper.py`, change the scenario cases:

- `test_scenario_smoke_replaces_positional_script_arg` → `test_scenario_replaces_positional_script_arg`, with `scenario="http-purchase"` and expected `["run", "/scripts/scenarios/http-purchase/http-purchase.js"]`
- `purchase-flow` → `http-purchase`
- `purchase-flow-browser` → `browser-purchase`
- `cart-fulfill` → `http-cart`
- `cart-fulfill-browser` → `browser-cart`
- `test_scenario_with_no_positional_args_defaults_to_run`: `scenario="http-purchase"`, with the http-purchase path

Pass-through tests that only use `/scripts/scenarios/smoke/smoke.js` as an opaque argument switch to `/scripts/scenarios/http-purchase/http-purchase.js`. Add:

```python
    def test_scenario_http_orders_maps_to_its_script(self) -> None:
        with TemporaryDirectory() as tmp:
            result = self._run_wrapper(["run", "/scripts/scenarios/ignored/ignored.js"], scenario="http-orders", tmp_dir=Path(tmp))
            self.assertEqual(result.returncode, 0, result.stderr)
            captured = result.captured_args_path.read_text(encoding="utf-8").splitlines()
            self.assertEqual(captured, ["run", "/scripts/scenarios/http-orders/http-orders.js"])

    def test_retired_smoke_scenario_is_unknown(self) -> None:
        with TemporaryDirectory() as tmp:
            result = self._run_wrapper([], scenario="smoke", tmp_dir=Path(tmp))
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("unknown SCENARIO", result.stderr)
```

These use the file's existing helper `self._run_wrapper(...)` (line 24) and its `result.captured_args_path`.

In `test_k6_workflows.py`, add (Review Focus 4):

```python
class ComposeScriptPathTests(unittest.TestCase):
    def test_every_compose_scenario_path_is_a_workflow_script(self) -> None:
        compose = (REPO_ROOT / "infra/docker/compose.performance.yaml").read_text(encoding="utf-8")
        scripts = {load_workflow(p).k6_script for p in PERF_WORKFLOWS_DIR.glob("*.yaml")}
        referenced = set(re.findall(r"/scripts/scenarios/[\w-]+/[\w-]+\.js", compose))
        self.assertTrue(referenced)
        self.assertLessEqual(referenced, scripts)
```

Add `import re` to the imports at the top of `test_k6_workflows.py`; it currently imports `json`, `sys`, `unittest`, and `yaml`.

- [ ] **Step 2: Run them to make sure they fail**

Run: `cd scripts && python3 -m unittest pg.tests.test_k6_wrapper pg.tests.test_k6_workflows 2>&1 | tail -4; cd ..`
Expected: FAIL. `unknown SCENARIO 'http-purchase'` appears, and compose references `smoke/smoke.js`.

- [ ] **Step 3: Implement**

`k6-wrapper.sh` `resolve_script`:

```sh
resolve_script() {
  case "$1" in
    http-purchase|browser-purchase|http-cart|browser-cart|http-orders)
      echo "${SCRIPTS_DIR}/$1/$1.js" ;;
    *) return 1 ;;
  esac
}
```

The error message's `expected:` list becomes `http-purchase, browser-purchase, http-cart, browser-cart, http-orders`.

`compose.performance.yaml`:

- Header examples (lines 14, 18, 32): `pnpm pg:perf:http-purchase`, `run /scripts/scenarios/http-purchase/http-purchase.js`, `BASE_URL=https://perf.example pnpm pg:perf:http-purchase`
- Line 49: `place-order's SharedArray sees cart-fulfill's` → `http-orders' SharedArray sees http-cart's`
- Line 57: `cart-fulfill's` → `http-cart's`
- `k6-otel` comment and `command`: `run --out experimental-opentelemetry /scripts/scenarios/http-purchase/http-purchase.js`, plus the comment text `pg:perf:http-purchase`
- Line 105: `Browser-driven variant of http-purchase`

`bin/punch:41`: `browser-purchase/browser-cart`.

- [ ] **Step 4: Run them to make sure they pass**

Run: `cd scripts && python3 -m unittest pg.tests.test_k6_wrapper pg.tests.test_k6_workflows 2>&1 | tail -3; cd ..; docker compose -f infra/docker/compose.performance.yaml config -q && echo compose-ok`
Expected: `OK`, `compose-ok`.

- [ ] **Step 5: Commit**

```bash
git add scripts/k6-wrapper.sh scripts/pg/tests/test_k6_wrapper.py scripts/pg/tests/test_k6_workflows.py infra/docker/compose.performance.yaml bin/punch
git commit -m "feat(perf): k6 wrapper and compose follow the new workflow ids"
```

---

### Task 5: CI k6 gate

**Files:**

- Modify: `.github/workflows/ci.yml:209-212`
- Modify: `scripts/pg/tests/test_perf_ci_docs_contract.py:30-76,135`
- Modify: `docs/ai/claude-code-operating-protocol.md` (the "CI smoke workflow" phrase)

**Interfaces:**

- Consumes: `./dev perf:http-purchase` from Task 3.

- [ ] **Step 1: Update the contract test (failing)**

Rename `test_performance_ci_builds_then_selects_the_smoke_workflow` → `test_performance_ci_builds_then_selects_the_purchase_workflow`. Its `run_workflow` step becomes:

```python
        run_workflow = step_index(
            {
                "name": "Run k6 purchase workflow",
                "env": {
                    "BASE_URL": "http://host.docker.internal:3001",
                    "VUS": "1",
                    "ITERATIONS": "1",
                },
                "run": "./dev perf:http-purchase",
            }
        )
```

The count assertion becomes `sum(step.get("run") == "./dev perf:http-purchase" for step in steps) == 1`. Line 135 becomes `self.assertIn("CI k6 gate", documents["docs/ai/claude-code-operating-protocol.md"])`.

- [ ] **Step 2: Run it to make sure it fails**

Run: `cd scripts && python3 -m unittest pg.tests.test_perf_ci_docs_contract 2>&1 | tail -4; cd ..`
Expected: FAIL (`ValueError: ... is not in list`).

- [ ] **Step 3: Implement**

`ci.yml` step:

```yaml
- name: Run k6 purchase workflow
  env:
    BASE_URL: http://host.docker.internal:3001
    VUS: "1"
    ITERATIONS: "1"
  run: ./dev perf:http-purchase
```

Keep the job id `perf-smoke` and its name `Performance smoke (k6)`, so required-check names on the branch protection do not change.

In `claude-code-operating-protocol.md`, replace "CI smoke workflow" with "CI k6 gate" (and any `perf:smoke` near it with `perf:http-purchase`).

- [ ] **Step 4: Run it to make sure it passes**

Run: `pnpm pg:test 2>&1 | grep -E "^Ran|^OK|^FAILED"`
Expected: `OK`.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/ci.yml scripts/pg/tests/test_perf_ci_docs_contract.py docs/ai/claude-code-operating-protocol.md
git commit -m "ci(perf): gate on one http-purchase iteration"
```

---

### Task 6: Browser alignment

**Files:**

- Create: `scripts/pg/tests/test_browser_alignment.py`
- Modify: `tests/performance/k6/scenarios/browser-cart/browser-cart.ts`
- Modify: `tests/performance/k6/scenarios/browser-purchase/browser-purchase.ts`
- Modify: `tests/performance/k6/scenarios/http-purchase/http-purchase.ts`, `tests/performance/k6/scenarios/http-orders/http-orders.ts` (shared visualizer check name)
- Modify: `apps/web/src/components/catalog/ProductCard.tsx:191` (`data-product-id`)

**Interfaces:**

- Produces: the shared outcome check vocabulary below. The browser `[DATA carts]` row has the same three non-empty columns as `http-cart`.

Shared outcome checks (the amendment in Global Constraints):

| Pair                                 | Shared check names, in step order                                                                        |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| `http-cart` / `browser-cart`         | `catalog has items`, `cart contains added item`                                                          |
| `http-purchase` / `browser-purchase` | `catalog has items`, `cart contains added item`, `checkout returns orderId`, `visualizer ok after order` |

`http-purchase` and `http-orders` rename their `order sphere present` check to `visualizer ok after order`; the predicate is unchanged. HTTP-only checks (`catalog 200`, `cart add 201`, `cart 200`, `checkout 201`, `order 200`, `order id matches`, `visualization 200`) stay.

- [ ] **Step 1: Write the failing test**

`scripts/pg/tests/test_browser_alignment.py`:

```python
from __future__ import annotations

import re
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
SCENARIOS = REPO_ROOT / "tests" / "performance" / "k6" / "scenarios"

SHARED = {
    ("http-cart", "browser-cart"): [
        "catalog has items",
        "cart contains added item",
    ],
    ("http-purchase", "browser-purchase"): [
        "catalog has items",
        "cart contains added item",
        "checkout returns orderId",
        "visualizer ok after order",
    ],
}
CHECK_NAME = re.compile(r'^\s*"([^"]+)":\s*\(', re.MULTILINE)
CARTS_ROW = re.compile(r"\[DATA carts\] ([^`]*)`")


def source(name: str) -> str:
    return (SCENARIOS / name / f"{name}.ts").read_text(encoding="utf-8")


def check_names(name: str) -> list[str]:
    return CHECK_NAME.findall(source(name))


class BrowserAlignmentTests(unittest.TestCase):
    def test_browser_checks_are_exactly_the_shared_outcomes_in_order(self) -> None:
        for (http, browser), shared in SHARED.items():
            with self.subTest(browser=browser):
                self.assertEqual(check_names(browser), shared)

    def test_http_scenarios_carry_every_shared_outcome_in_the_same_order(self) -> None:
        for (http, _browser), shared in SHARED.items():
            with self.subTest(http=http):
                names = check_names(http)
                self.assertEqual([n for n in names if n in shared], shared)

    def test_cart_rows_have_no_empty_field(self) -> None:
        """Review Focus 2: http-orders posts every carts row; an empty
        productId (browser-cart's old `${cartId},,${sid}`) breaks the pair."""
        for name in ("http-cart", "browser-cart"):
            with self.subTest(name=name):
                [template] = CARTS_ROW.findall(source(name))
                fields = template.split(",")
                self.assertEqual(len(fields), 3, template)
                self.assertTrue(all(f.strip() for f in fields), template)

    def test_browser_steps_follow_the_http_group_order(self) -> None:
        for (http, browser) in SHARED:
            with self.subTest(browser=browser):
                groups = re.findall(r'group\("([^"]+)"', source(http))
                steps = re.findall(r"// step: (.+)$", source(browser), re.MULTILINE)
                self.assertEqual([g for g in groups if g in steps], steps)
                self.assertTrue(steps)
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `cd scripts && python3 -m unittest pg.tests.test_browser_alignment -v 2>&1 | tail -12; cd ..`
Expected: FAIL. The browser check names are the old ones (`cart id rendered on the checkout panel`, …), the `browser-cart` row has an empty field, there are no `// step:` markers, and the HTTP scenarios lack `visualizer ok after order`.

- [ ] **Step 3: Web hook for productId**

`ProductCard.tsx:191`: on the add button, next to `data-testid="product-add-button"`, add `data-product-id={product.productId}`. Line 70 already uses `product.productId` for the same add call.

- [ ] **Step 4: Rewrite `browser-cart.ts` default function**

```ts
export default async function () {
  const page = await browser.newPage();

  try {
    // step: catalog: browse
    await page.goto(BASE_URL, { waitUntil: "networkidle" });
    await page.waitForSelector('[data-testid="product-add-button"]', {
      state: "visible",
    });
    const addButtons = await page.$$('[data-testid="product-add-button"]');
    check(addButtons, {
      "catalog has items": (b) => b.length > 0,
    });

    // step: cart: add item
    const productId = await page.getAttribute(
      '[data-testid="product-add-button"]',
      "data-product-id",
    );
    const label = await page.getAttribute(
      '[data-testid="product-add-button"]',
      "aria-label",
    );
    const productName = label?.replace(/^Add /, "").replace(/ to cart$/, "");
    await page.click('[data-testid="product-add-button"]');

    // step: cart: view
    await page.waitForSelector(
      '[data-testid="cart-checkout-panel"] button[type="submit"]',
      { state: "visible" },
    );
    const panelText = await page.textContent(
      '[data-testid="cart-checkout-panel"]',
    );
    const cartId = await page.getAttribute(
      '[data-testid="cart-checkout-panel"]',
      "data-cart-id",
    );
    const inCart = check(panelText, {
      "cart contains added item": (t) =>
        typeof t === "string" &&
        !!productName &&
        t.includes(productName) &&
        typeof cartId === "string" &&
        cartId.length > 0,
    });

    // step: cart: fulfill
    if (inCart && productId) {
      const cookies = await page.context().cookies();
      const sid = cookies.find((cookie) => cookie.name === "sid")?.value;
      if (sid) {
        console.log(`[DATA carts] ${cartId},${productId},${sid}`);
      }
    }
  } finally {
    await page.close();
  }
}
```

Update the header comment's `[DATA carts]` line to `cartId,productId,sid`, and the note about why `productId` was empty, so it says it now comes from `data-product-id`.

- [ ] **Step 5: Rewrite `browser-purchase.ts` default function**

```ts
export default async function () {
  const page = await browser.newPage();

  try {
    // step: catalog: browse
    await page.goto(BASE_URL, { waitUntil: "networkidle" });
    await page.waitForSelector('[data-testid="product-add-button"]', {
      state: "visible",
    });
    const addButtons = await page.$$('[data-testid="product-add-button"]');
    check(addButtons, {
      "catalog has items": (b) => b.length > 0,
    });

    // step: cart: add item
    const label = await page.getAttribute(
      '[data-testid="product-add-button"]',
      "aria-label",
    );
    const productName = label?.replace(/^Add /, "").replace(/ to cart$/, "");
    await page.click('[data-testid="product-add-button"]');

    // step: cart: view
    await page.waitForSelector(
      '[data-testid="cart-checkout-panel"] button[type="submit"]',
      { state: "visible" },
    );
    const panelText = await page.textContent(
      '[data-testid="cart-checkout-panel"]',
    );
    check(panelText, {
      "cart contains added item": (t) =>
        typeof t === "string" && !!productName && t.includes(productName),
    });

    // step: checkout
    await page.click(
      '[data-testid="cart-checkout-panel"] button[type="submit"]',
    );
    await page.waitForSelector('[data-testid="home-orders"]', {
      state: "visible",
      timeout: 10000,
    });
    const orderIdText = await page.textContent(
      '[data-testid="home-orders"] p.font-mono',
    );
    check(orderIdText, {
      "checkout returns orderId": (t) =>
        typeof t === "string" && t.trim().length > 0,
    });
    // k6's browser module can't read the checkout response, so the "orders"
    // dataset row comes from the rendered order id (written by Punch only
    // with --produce orders).
    const renderedOrderId = orderIdText?.trim();
    if (renderedOrderId) console.log(`[DATA orders] ${renderedOrderId}`);

    // step: visualization: order sphere present
    const vizStatus = await page.textContent(
      '[data-testid="visualizer-status"]',
    );
    check(vizStatus, {
      "visualizer ok after order": (t) => t !== "Error",
    });
  } finally {
    await page.close();
  }
}
```

In `http-purchase.ts` and `http-orders.ts`, rename the check key `"order sphere present"` → `"visualizer ok after order"`. The predicate stays the same. Keep each group name exactly as it is (`visualization: order sphere present`); the browser step marker matches it.

- [ ] **Step 6: Run tests and build**

Run: `cd scripts && python3 -m unittest pg.tests.test_browser_alignment -v 2>&1 | tail -6; cd .. && (cd tests/performance/k6 && npm run -s typecheck && npm run -s build >/dev/null && echo build-ok) && pnpm --filter @mini-commerce/web typecheck && pnpm --filter @mini-commerce/web lint`
Expected: 4 tests OK, `build-ok`, and web typecheck/lint clean.

- [ ] **Step 7: Live run of both browser workflows and their HTTP pairs**

The stack must run this branch's code. Rebuild the web image so `data-product-id` ships, then rebuild both k6 images:

```bash
docker compose -f infra/docker/compose.yaml --profile full up -d --build web
docker compose -f infra/docker/compose.performance.yaml build k6 k6-browser
BASE_URL=http://host.docker.internal:3000 VUS=1 ITERATIONS=1 ./dev perf:browser-cart --produce carts
BASE_URL=http://host.docker.internal:3001 VUS=1 ITERATIONS=1 ./dev perf:http-orders --produce orders
BASE_URL=http://host.docker.internal:3000 VUS=1 ITERATIONS=1 ./dev perf:browser-purchase
BASE_URL=http://host.docker.internal:3001 VUS=1 ITERATIONS=1 ./dev perf:http-purchase
head -3 tests/performance/k6/data/carts.csv
```

Expected: every run exits 0 with checks at 100%. The `carts.csv` row has three non-empty fields, and `http-orders` consumed the browser-made cart. If any `--produce`/consume step prompts for CSV consent, answer it.

- [ ] **Step 8: Commit**

```bash
git add scripts/pg/tests/test_browser_alignment.py tests/performance/k6/scenarios apps/web/src/components/catalog/ProductCard.tsx
git commit -m "feat(perf): browser scenarios share their http pair's outcome checks"
```

---

### Task 7: Run the two data chains end to end

**Files:** none changed unless a run fails.

- [ ] **Step 1: Chain A — carts → orders → status**

```bash
export BASE_URL=http://host.docker.internal:3001 VUS=1 ITERATIONS=2
./dev perf:http-cart --produce carts
./dev perf:http-orders --produce orders
./dev perf:http-orders-status
```

Expected: all three exit 0. The second command consumes `carts.csv`, and the third reads `orders.csv`.

- [ ] **Step 2: Chain B — owned-orders → auth-tokens → hot-status**

```bash
./dev perf:http-purchase-registered --produce owned-orders
./dev perf:http-auth-login --produce auth-tokens
./dev perf:http-me-hot-status
unset BASE_URL VUS ITERATIONS
```

Expected: all three exit 0.

- [ ] **Step 3: Menu render**

Run `./bin/punch` in a terminal with at least 120 columns. Compare the table above the selector with the spec's target render, then press `q`.
Expected: nine rows, `Name │ Description │ In │ Out`, `http-auth-login` showing `owned-orders?`, and no `←`/`→`.

(If no interactive terminal is available, print the rows with `PYTHONPATH=vendor/punch/src .cache/punch-venv/bin/python3 -c "from pathlib import Path; from punch import menu; menu._terminal_columns=lambda:160; d=Path('tests/performance/k6/workflows'); r,h=menu._workflow_menu_rows(sorted(d.glob('*.yaml')),d); print(h); print('\n'.join(r))"` and compare those instead.)

---

### Task 8: Live docs sweep + old-ID gate

**Files:**

- Modify: `README.md`, `CLAUDE.md`, `docs/cli-reference.md`, `docs/architecture/orchestrator-python.md`, `docs/performance/orchestrator.md`, `docs/performance/punch-menu-optimization.md`, `docs/quality-strategy/README.md`, `docs/specs/punch-submodule-integration.md`, `docs/specs/synchronized-single-cup-order-visualizer-and-live-rain.md`, `docs/uat/walkthrough-uat.md`, `docs/next-steps/{README,hot-status,order-temperature}.md`, `tests/performance/k6/README.md`, `apps/visualizer-3d/README.md`, `infra/docker/compose.yaml:48` (comment), `.gitignore:159` (comment)
- Not touched: `docs/superpowers/**`, `docs/adr/**`, and web code that says "place-order submission" or uses the `order-status-${id}` SWR key

- [ ] **Step 1: Rewrite workflow references**

Apply the rename map in each file listed, reading each hit in context: `./dev perf:<old>`, `pnpm pg:perf:<old>`, `task perf:<old>`, scenario paths, and prose naming a workflow.

- `./dev perf:smoke` becomes `VUS=1 ITERATIONS=1 ./dev perf:http-purchase`. That includes CLAUDE.md's fresh-checkout line "Run from a fresh checkout" and its `--produce` example `./dev perf:http-cart --produce carts`.
- Remove sections that document `load`/`stress` (the k6 README's "old, unwired placeholders" paragraph).
- `docs/performance/punch-menu-optimization.md`: the column description becomes **Name**, **Description**, **In** (`requires`, then `optional` marked `?`), **Out** (`produces` dataset names). Add one line saying producer and target lists left the table in this change.

- [ ] **Step 2: Old-ID gate**

```bash
git grep -nE '\b(cart-fulfill(-browser)?|place-order|purchase-flow(-browser)?|perf:smoke|perf:login|perf:hot-status|perf:order-status|perf:purchase-registered|pg:perf:smoke|scenarios/(smoke|load|stress|login|hot-status|order-status)/)\b' \
  -- . ':!docs/superpowers' ':!docs/adr' ':!vendor' \
  | grep -vE 'place-order submission|place-order submit|CartCheckoutPanel' \
  | grep -vE '(^|[^-])purchase-registered'
git grep -nE '(^|[^-])purchase-registered' -- . ':!docs/superpowers' ':!docs/adr' ':!vendor'
```

Expected: both print nothing. Fix every hit. The web wording "place-order submission" (`CartCheckoutPanel.tsx`, `apps/web/src/components/cart/README.md`) describes the UI action and stays.

- [ ] **Step 3: Format and commit**

Run: `pnpm format`
Expected: clean.

```bash
git add -A README.md CLAUDE.md docs tests/performance/k6/README.md apps/visualizer-3d/README.md infra/docker/compose.yaml .gitignore
git commit -m "docs: workflow ids across live docs"
```

---

### Task 9: Verification and CI

- [ ] **Step 1: Repo gates**

Run: `pnpm typecheck && pnpm lint && pnpm format && pnpm test && pnpm pg:test`
Then from `vendor/punch`: `../../.cache/punch-venv/bin/python3 -m unittest discover -s tests 2>&1 | tail -2`
Expected: all green.

- [ ] **Step 2: Live gates**

```bash
./dev smoke
BASE_URL=http://host.docker.internal:3001 VUS=1 ITERATIONS=1 ./dev perf:http-purchase
```

Expected: `All 23 smoke checks passed.` and k6 checks at 100%.

- [ ] **Step 3: Push and watch CI**

If PR #19 has merged by now, rebase this branch on `main` first (`git fetch && git rebase origin/main`), and re-run Step 1 after the rebase.

```bash
git push -u origin feat/workflow-naming
gh run watch "$(gh run list --branch feat/workflow-naming --limit 1 --json databaseId -q '.[0].databaseId')" --exit-status
```

Expected: every job is green, including `Performance smoke (k6)` running `./dev perf:http-purchase`.

- [ ] **Step 4: Project memory**

After merge, update the memory notes that name old workflows: `project_live_workflow_traffic_campaign_runner.md` (smoke and purchase-flow) and `project_purchase_flow_per_session_vus.md` (purchase-flow → http-purchase). Leave the meaning of each note as it is.
