# Punch GitHub Forms Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the four-dropdown `perf.yml` form with `perf-run.yml` (one standalone workflow) and `perf-chain.yml` (one catalog-derived recipe), both delegating to one reusable `_perf-execute.yml` that validates, plans, runs, and uploads one immutable evidence artifact.

**Architecture:** Three new `scripts/pg` modules carry all logic so YAML stays declarative: `perf_spec` (the versioned `spec.json` and custom-config path rules), `perf_forms` (derives standalone workflows and recipes from the catalog and rewrites marked option blocks), and `perf_dispatch` (the Actions boundary: normalize form values from env into `spec.json`, record stages, finalize status, publish the job summary). `perf_chain` gains custom loads, a peak-browser-VU check for every browser step, `--spec`, per-threshold evidence, and one data-driven summary renderer that both `perf:chain` and `perf:dispatch` use. The k6 summary JSON gains `thresholds` and `emittedMetrics` in Expresso's `support/report.ts` wrapper; Punch is not changed.

**Tech Stack:** Python 3.9+ stdlib (`scripts/pg`), PyYAML (tests; Punch dependency), Punch public APIs (`punch.catalog`, `punch.sizing`, `punch.workflow`), GitHub Actions (`workflow_dispatch`, `workflow_call`, `actions/checkout@v4`, `actions/setup-python@v5`, `actions/upload-artifact@v4`), k6 `0.54.0` images, TypeScript + esbuild + `node:test` (Node 20).

**Spec:** [`docs/next-steps/perf-run-ux.md`](../../next-steps/perf-run-ux.md#github-actions-design), section "GitHub Actions design" (lines 64–385).

## Global Constraints

- No AI attribution anywhere: no `Co-Authored-By: Claude`, no "Generated with Claude Code", in commits, PR bodies, or docs (repo `CLAUDE.md` overrides the harness attribution reminder).
- Committed content is English. No secrets. Load the `technical-writing` skill before Task 7.
- Compose on a GitHub-hosted runner only. Kubernetes, AWS, schedules, arbitrary graph editing, and capacity testing are out of scope.
- `perf-run.yml` and `perf-chain.yml` trigger on `workflow_dispatch` only; `_perf-execute.yml` on `workflow_call` only. `perf.yml` is deleted. CI's `perf-smoke` job is unchanged.
- At most 25 form inputs; the chain form has exactly 9 (`sequence`, `step<n>-load`, `step<n>-config` for n = 1..4); the single form has exactly 3 (`workflow`, `load`, `config`).
- `_perf-execute.yml` inputs, exactly and in order: `kind`, `selection`, `load-1`, `config-1`, `load-2`, `config-2`, `load-3`, `config-3`, `load-4`, `config-4`, all `type: string`.
- Load labels, exactly: `Auto (data-size producer; default otherwise)` → `auto`, `1 journey` → `1-iteration`, `5 journeys` → `5-iterations`, `1 user for 5 minutes` → `1-vu-5m`, `5 users for 5 minutes` → `5-vu-5m`, `Custom config` → `custom`.
- Sequence labels join workflow names with ` -> ` (space, hyphen, greater-than, space).
- Spec document: `{"version": 1, "steps": [{"workflow": ..., "load": {"mode": "auto"} | {"mode": "preset", "value": ...} | {"mode": "custom", "path": ...}}]}`, 1–4 steps.
- Custom configs: committed JSON objects beneath `tests/performance/k6/options/`, path relative to it; reject absolute paths, `..`, non-`.json`, missing files, anything resolving outside the directory; reject `Custom config` with an empty path and a path given with any other load; ignore inactive slots.
- Browser VU cap stays `MAX_BROWSER_VUS = 4`, applied to every browser step after its load resolves (preset, custom, auto default, or sized).
- No step builds a shell command string, calls `eval`, or expands `${{ inputs.* }}` inside `run:`; form values reach Python through `env:`.
- `_perf-execute.yml`: one `ubuntu-latest` job, `permissions: contents: read`, `timeout-minutes: 60`, recursive submodules, Python `3.11` with `cache: pip` keyed on `vendor/punch/requirements.txt`, artifact `perf-${{ github.run_id }}-${{ github.run_attempt }}` with `if-no-files-found: error`.
- The runner warning, verbatim, in every GitHub job summary:
  `> The app and k6 share one GitHub-hosted runner. Use these results for` / `> regression evidence, not capacity claims. Compare only runs with the same` / `> workload, test data, and environment.`
- `./dev` runs Python from `scripts/`; any repository path a command takes on the command line (`--spec`) is resolved against `REPO_ROOT` when relative.
- Python code must run on 3.9 (local `./dev` floor) and 3.11 (CI): `from __future__ import annotations`, `typing.List/Dict/Optional`, no `match`, no same-quote nesting inside f-strings.
- `vendor/punch` is not modified. Never stage anything under `vendor/punch`.
- Outward actions need the user's explicit OK at that step: any `git push`, any merge to `main`, any `gh workflow run`.
- Temporary files go in `$SCRATCH` (the session scratchpad directory), never `/tmp` directly.
- Python tests: `cd scripts && python3 -m unittest discover -s pg/tests -p 'test_*.py'` (baseline before Task 1: 170 tests, OK). Lint: `ruff check scripts/pg` (CI pins `ruff==0.7.4`).

## Review Focus

1. **A custom config path that is a symlink inside `options/` pointing outside it** — a reader expects it rejected exactly like `../x.json`, not followed. Test: Task 2 (`test_a_symlink_that_escapes_the_options_directory_is_rejected`).
2. **An API dispatch that sends the internal load value (`5-vu-5m`) or a differently cased label instead of the form label** — expected: rejected before Docker, naming the six accepted labels, never silently mapped. Test: Task 5 (`test_an_internal_load_value_or_a_recased_label_is_rejected_naming_the_labels`).
3. **A browser step with a custom config that ramps (`ramping-vus` stages or top-level `stages`) above 4 VUs** — expected: rejected with the peak VU count, not just flat `vus` checked. Test: Task 2 (`test_a_ramping_custom_browser_config_over_the_cap_is_rejected_with_its_peak`).
4. **A second dispatch in the same checkout after an earlier one** (local rehearsal, or a rejected re-run) — expected: no `spec.json`, `request.json`, or diagnostics from the earlier dispatch survive into the new evidence. Test: Task 5 (`test_a_new_dispatch_never_keeps_an_earlier_spec`).
5. **The job is cancelled mid-run** — expected: `dispatch.json` says `cancelled`, the summary heading is `Failed` with a cancellation note, and finalize adds no misleading "evidence missing" error. Test: Task 5 (`test_a_cancelled_job_is_recorded_as_cancelled_without_evidence_errors`).

---

## File Structure

| File | Responsibility | Task |
| --- | --- | --- |
| `tests/performance/k6/support/report.ts` (modify) | Adds `thresholds` and `emittedMetrics` to every scenario's JSON summary | 1 |
| `tests/performance/k6/tests/summary-output.test.mjs` (modify) | Pins the new JSON fields | 1 |
| `tests/performance/k6/package.json` (modify) | `npm test` runs the `node:test` suite | 1 |
| `.github/workflows/ci.yml` (modify) | Lint job also runs `npm test` for the k6 package | 1 |
| `scripts/pg/perf_spec.py` (create) | `StepRequest`, spec document read/write, custom-config path rules | 2 |
| `scripts/pg/perf_chain.py` (modify) | Custom loads, `peak_vus`, browser cap for every step, `--spec`, threshold evidence, `render_summary`, `annotate` | 2, 3 |
| `tests/performance/k6/options/custom/status-regression.json` (create) | Committed example custom config (2 VUs × 10 iterations) | 2 |
| `scripts/pg/tests/test_perf_spec.py` (create) | Spec and path-rule tests | 2 |
| `scripts/pg/tests/test_perf_chain.py` (modify) | Load, peak-VU, `--spec`, and summary tests; old `perf.yml` form tests removed | 2, 3, 6 |
| `scripts/pg/perf_forms.py` (create) | Standalone list, recipe derivation, load labels, generated-block render, `./dev perf:forms` | 4 |
| `scripts/pg/tests/test_perf_forms.py` (create) | Derivation, bound/cycle/duplicate, render tests | 4 |
| `scripts/pg/perf_dispatch.py` (create) | `./dev perf:dispatch` normalize / `--stage` / `--finalize` / `--publish` | 5 |
| `scripts/pg/tests/test_perf_dispatch.py` (create) | Dispatch boundary tests | 5 |
| `scripts/pg/cli.py` (modify) | Registers `perf:forms` and `perf:dispatch`; usage lines | 4, 5 |
| `.github/workflows/perf-run.yml` (create) | Single-run form | 6 |
| `.github/workflows/perf-chain.yml` (create) | Chain form | 6 |
| `.github/workflows/_perf-execute.yml` (create) | Reusable execution job | 6 |
| `.github/workflows/perf.yml` (delete) | Replaced | 6 |
| `scripts/pg/tests/test_perf_github_workflows.py` (create) | YAML contract tests for the three workflows | 6 |
| `docs/performance/orchestrator.md`, `docs/cli-reference.md`, `tests/performance/k6/README.md`, `CLAUDE.md`, `docs/next-steps/perf-run-ux.md` (modify) | Docs | 7, 9 |

Evidence layout produced by a GitHub run (all under `tests/performance/k6/reports/`, uploaded whole):

```text
dispatch/request.json      form values as received (the ten inputs only)
dispatch/spec.json         normalized spec, written once, mode 0444
dispatch/dispatch.json     event name/ref/sha, actor, run id/attempt, artifact, runner, stage, status, errors, problems
dispatch/summary.md        the job summary (without the artifact link)
dispatch/compose-ps.txt    only when ./dev up fails
dispatch/compose-logs.txt  only when ./dev up fails
dispatch/k6-build.log      k6 image build output
chain/chain.json           resolved steps, data links, configs, thresholds, status, timings
chain/summary.md           chain summary (local and GitHub)
chain/step-<n>-<workflow>/ k6 log, JSON summary, HTML report
chain/step-<n>-<workflow>.k6-config.json  generated producer config
```

---

### Task 1: k6 summaries record every threshold and the metrics k6 emitted

**Files:**
- Modify: `tests/performance/k6/support/report.ts`
- Modify: `tests/performance/k6/tests/summary-output.test.mjs`
- Modify: `tests/performance/k6/package.json`
- Modify: `.github/workflows/ci.yml:57`

**Interfaces:**
- Consumes: Punch `buildSummaryJson(data, meta)` (unchanged; keeps `passed`, `totalRequests`, `errorRate`, `p90Ms`, `checkPassRate`, `durationMs`).
- Produces: every scenario's `<id>-summary.json` gains `thresholds: {metric: string, expression: string, ok: boolean}[]` (sorted by metric, then expression) and `emittedMetrics: string[]` (sorted metric names k6 reported). Task 3 reads both.

- [ ] **Step 0: Branch and commit the spec**

```bash
git switch -c feat/perf-github-forms
git add docs/next-steps/perf-run-ux.md docs/superpowers/plans/2026-10-17-perf-github-forms.md
git commit -m "docs(perf): design the perf-run and perf-chain GitHub forms"
```

- [ ] **Step 1: Write the failing test** — append to `tests/performance/k6/tests/summary-output.test.mjs`:

```js
test("the JSON summary records every threshold result and the metrics k6 emitted", () => {
  const data = {
    ...summaryData,
    metrics: {
      ...summaryData.metrics,
      http_req_failed: {
        type: "rate",
        contains: "default",
        values: { rate: 0, passes: 0, fails: 4 },
        thresholds: { "rate<0.01": { ok: true } },
      },
      http_req_duration: {
        type: "trend",
        contains: "time",
        values: { "p(90)": 1200, "p(95)": 1500 },
        thresholds: { "p(95)<1000": { ok: false } },
      },
    },
  };
  const outputs = report.buildSummaryOutputs(data, meta, "/r/x.html", "/r/x.json");
  const json = JSON.parse(outputs["/r/x.json"]);

  assert.deepEqual(json.thresholds, [
    { metric: "http_req_duration", expression: "p(95)<1000", ok: false },
    { metric: "http_req_failed", expression: "rate<0.01", ok: true },
  ]);
  assert.equal(json.passed, false);
  assert.deepEqual(json.emittedMetrics, [
    "http_req_duration",
    "http_req_failed",
    "iterations",
  ]);
});

test("a run without thresholds records an empty list, not a missing field", () => {
  const outputs = report.buildSummaryOutputs(summaryData, meta, "/r/y.html", "/r/y.json");
  const json = JSON.parse(outputs["/r/y.json"]);
  assert.deepEqual(json.thresholds, []);
  assert.deepEqual(json.emittedMetrics, ["iterations"]);
});
```

- [ ] **Step 2: Add the test script and run it to verify it fails**

In `tests/performance/k6/package.json`, add to `"scripts"` after `"typecheck"`:

```json
    "test": "node --test tests/*.test.mjs"
```

Run: `cd tests/performance/k6 && npm test`
Expected: FAIL — `json.thresholds` is `undefined`.

- [ ] **Step 3: Implement** — replace `buildSummaryOutputs` in `tests/performance/k6/support/report.ts` and add the helper above it:

```ts
export interface ThresholdResult {
  metric: string;
  expression: string;
  ok: boolean;
}

// Every threshold k6 evaluated, so a reader sees which gate held or failed
// without re-deriving it from the aggregate `passed`.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function thresholdResults(data: any): ThresholdResult[] {
  const results: ThresholdResult[] = [];
  for (const [metric, value] of Object.entries(data.metrics ?? {})) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const thresholds = (value as any)?.thresholds ?? {};
    for (const [expression, result] of Object.entries(thresholds)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ok = (result as any)?.ok;
      if (typeof ok === "boolean") results.push({ metric, expression, ok });
    }
  }
  return results.sort(
    (a, b) =>
      a.metric.localeCompare(b.metric) ||
      a.expression.localeCompare(b.expression),
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildSummaryOutputs(
  data: any,
  meta: ReportMeta,
  htmlPath: string,
  jsonPath: string,
): Record<string, string> {
  // emittedMetrics lets a reader tell "not emitted" from a zero value:
  // Punch's summary defaults a missing error rate to 1 and p90 to 0.
  const summary = {
    ...buildSummaryJson(data, meta),
    thresholds: thresholdResults(data),
    emittedMetrics: Object.keys(data.metrics ?? {}).sort(),
  };
  return {
    stdout: textSummary(data, { indent: " ", enableColors: false }),
    [htmlPath]: buildHtml(data, meta),
    [jsonPath]: JSON.stringify(summary, null, 2),
  };
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `cd tests/performance/k6 && npm test && npm run typecheck && npm run build`
Expected: 5 tests pass; typecheck clean; esbuild writes `dist/`.

- [ ] **Step 5: Gate it in CI** — in `.github/workflows/ci.yml` lint job, replace

```yaml
      - run: cd tests/performance/k6 && npm ci && npm run typecheck
```

with

```yaml
      - run: cd tests/performance/k6 && npm ci && npm run typecheck && npm test
```

- [ ] **Step 6: Commit**

```bash
git add tests/performance/k6/support/report.ts tests/performance/k6/tests/summary-output.test.mjs tests/performance/k6/package.json .github/workflows/ci.yml
git commit -m "feat(k6): record each threshold result and the emitted metrics in summaries"
```

---

### Task 2: Spec document, custom loads, and the browser VU cap for every step

**Files:**
- Create: `scripts/pg/perf_spec.py`
- Create: `tests/performance/k6/options/custom/status-regression.json`
- Create: `scripts/pg/tests/test_perf_spec.py`
- Modify: `scripts/pg/perf_chain.py` (imports, `parse_steps`, `Step`, `Plan`, `_select_steps`, `_resolve_configs`, `plan_chain`, new `peak_vus` and `_check_browser_vus`)
- Modify: `scripts/pg/tests/test_perf_chain.py`

**Interfaces:**
- Consumes: `punch.workflow.read_k6_config(path) -> dict` (raises `WorkflowError`), `punch.sizing.size_producer`.
- Produces:
  - `pg.perf_spec`: `SPEC_VERSION = 1`, `MAX_STEPS = 4`, `AUTO = "auto"`, `PRESET = "preset"`, `CUSTOM = "custom"`, `LOAD_MODES`, `OPTIONS_LABEL`, `class SpecError(ValueError)`, `@dataclass(frozen=True) StepRequest(workflow: str, mode: str = AUTO, value: Optional[str] = None)` with `.to_json() -> dict`, `spec_document(steps) -> dict`, `parse_spec(document) -> List[StepRequest]`, `load_spec(path: Path) -> List[StepRequest]`, `write_spec(path: Path, steps) -> None`, `custom_config_path(raw: str, options_dir: Path = PERF_OPTIONS_DIR) -> Path`.
  - `pg.perf_chain`: `parse_steps(raw) -> List[StepRequest]`; `plan_chain(entries: Sequence[StepRequest], catalog, options_dir=PERF_OPTIONS_DIR) -> Plan`; `Plan.requested: List[str]`; `Step.custom: Optional[str]` (and `Step.shape == "custom"` for custom loads); `peak_vus(config: dict) -> int` (raises `ValueError`).

- [ ] **Step 1: Write the failing spec tests** — create `scripts/pg/tests/test_perf_spec.py`:

```python
from __future__ import annotations

import os
import sys
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from pg.perf_spec import (  # noqa: E402
    AUTO,
    CUSTOM,
    PRESET,
    SpecError,
    StepRequest,
    custom_config_path,
    load_spec,
    parse_spec,
    spec_document,
    write_spec,
)


class CustomConfigPathTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary_directory = TemporaryDirectory()
        self.root = Path(self.temporary_directory.name)
        self.options = self.root / "options"
        (self.options / "custom").mkdir(parents=True)
        (self.options / "custom" / "ok.json").write_text("{}", encoding="utf-8")
        (self.options / "custom" / "notes.txt").write_text("x", encoding="utf-8")
        (self.root / "outside.json").write_text("{}", encoding="utf-8")

    def tearDown(self) -> None:
        self.temporary_directory.cleanup()

    def reject(self, raw: str, message: str) -> None:
        with self.assertRaises(SpecError) as caught:
            custom_config_path(raw, self.options)
        self.assertIn(message, str(caught.exception))

    def test_a_committed_json_beneath_the_options_directory_resolves(self) -> None:
        self.assertEqual(
            custom_config_path("custom/ok.json", self.options),
            (self.options / "custom" / "ok.json").resolve(),
        )

    def test_unsafe_or_missing_paths_are_rejected(self) -> None:
        self.reject("", "needs a JSON path relative to tests/performance/k6/options/")
        self.reject("/etc/passwd.json", "must be a path relative to")
        self.reject("custom\\ok.json", "must be a path relative to")
        self.reject("../outside.json", "must not contain '..'")
        self.reject("custom/../custom/ok.json", "must not contain '..'")
        self.reject("custom/notes.txt", "must be a .json file")
        self.reject("custom/missing.json", "does not exist beneath")

    def test_a_symlink_that_escapes_the_options_directory_is_rejected(self) -> None:
        os.symlink(self.root / "outside.json", self.options / "custom" / "link.json")
        self.reject("custom/link.json", "resolves outside tests/performance/k6/options/")


class SpecDocumentTests(unittest.TestCase):
    STEPS = [
        StepRequest("http-cart"),
        StepRequest("http-orders", PRESET, "5-vu-5m"),
        StepRequest("http-orders-status", CUSTOM, "custom/status-regression.json"),
    ]

    def test_the_document_matches_the_versioned_contract(self) -> None:
        self.assertEqual(
            spec_document(self.STEPS),
            {
                "version": 1,
                "steps": [
                    {"workflow": "http-cart", "load": {"mode": "auto"}},
                    {"workflow": "http-orders", "load": {"mode": "preset", "value": "5-vu-5m"}},
                    {
                        "workflow": "http-orders-status",
                        "load": {"mode": "custom", "path": "custom/status-regression.json"},
                    },
                ],
            },
        )
        self.assertEqual(parse_spec(spec_document(self.STEPS)), self.STEPS)

    def test_malformed_documents_are_rejected(self) -> None:
        good = {"workflow": "http-cart", "load": {"mode": AUTO}}

        def one(load) -> dict:
            return {"version": 1, "steps": [{"workflow": "x", "load": load}]}

        cases = [
            ("a spec must be a JSON object", []),
            ("unknown spec keys: extra", {"version": 1, "steps": [good], "extra": 1}),
            ("spec version must be 1", {"version": 2, "steps": [good]}),
            ("a spec needs 1 to 4 steps", {"version": 1, "steps": []}),
            ("a spec needs 1 to 4 steps", {"version": 1, "steps": [good] * 5}),
            ("exactly workflow and load", {"version": 1, "steps": [{"workflow": "x"}]}),
            ("workflow must be a non-empty string",
             {"version": 1, "steps": [{"workflow": "", "load": {"mode": AUTO}}]}),
            ("load mode must be one of auto, preset, custom", one({"mode": "fast"})),
            ("a preset load takes exactly mode, value", one({"mode": PRESET})),
            ("an auto load takes exactly mode", one({"mode": AUTO, "path": "a.json"})),
            ("a custom load needs a non-empty string", one({"mode": CUSTOM, "path": 3})),
        ]
        for message, document in cases:
            with self.subTest(message=message, document=document):
                with self.assertRaises(SpecError) as caught:
                    parse_spec(document)
                self.assertIn(message, str(caught.exception))

    def test_write_spec_writes_once_and_read_only(self) -> None:
        with TemporaryDirectory() as directory:
            path = Path(directory) / "dispatch" / "spec.json"
            write_spec(path, self.STEPS)
            self.assertEqual(load_spec(path), self.STEPS)
            self.assertEqual(path.stat().st_mode & 0o222, 0)
            with self.assertRaises(FileExistsError):
                write_spec(path, self.STEPS)

    def test_an_unreadable_spec_is_a_spec_error(self) -> None:
        with TemporaryDirectory() as directory:
            path = Path(directory) / "spec.json"
            path.write_text("{not json", encoding="utf-8")
            with self.assertRaises(SpecError):
                load_spec(path)
            with self.assertRaises(SpecError):
                load_spec(Path(directory) / "missing.json")


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run to verify failure**

Run: `cd scripts && python3 -m unittest pg.tests.test_perf_spec -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'pg.perf_spec'`.

- [ ] **Step 3: Create `scripts/pg/perf_spec.py`**

```python
"""The versioned run spec: what `perf:dispatch` writes and `perf:chain --spec` runs.

A spec lists the active steps of one run, in order. Each step names a catalog
workflow and one load:

    {"mode": "auto"}                               sized for its reader, else the workflow's config
    {"mode": "preset", "value": "5-vu-5m"}         tests/performance/k6/options/<value>.json
    {"mode": "custom", "path": "custom/x.json"}    a committed JSON beneath that directory

Stdlib-only: this module checks shape and paths, not the catalog. pg.perf_chain
checks workflows, data links, presets, sizing, and the browser VU cap.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from typing import Any, Dict, List, Optional, Sequence

from pg.paths import PERF_OPTIONS_DIR

SPEC_VERSION = 1
MAX_STEPS = 4
AUTO = "auto"
PRESET = "preset"
CUSTOM = "custom"
LOAD_MODES = (AUTO, PRESET, CUSTOM)
_LOAD_KEYS = {AUTO: {"mode"}, PRESET: {"mode", "value"}, CUSTOM: {"mode", "path"}}
OPTIONS_LABEL = "tests/performance/k6/options/"


class SpecError(ValueError):
    pass


@dataclass(frozen=True)
class StepRequest:
    """One requested step before planning: a workflow name and its load."""

    workflow: str
    mode: str = AUTO
    # The preset stem (preset) or the path beneath the options directory (custom).
    value: Optional[str] = None

    def to_json(self) -> Dict[str, Any]:
        load: Dict[str, Any] = {"mode": self.mode}
        if self.mode == PRESET:
            load["value"] = self.value
        elif self.mode == CUSTOM:
            load["path"] = self.value
        return {"workflow": self.workflow, "load": load}


def spec_document(steps: Sequence[StepRequest]) -> Dict[str, Any]:
    return {"version": SPEC_VERSION, "steps": [step.to_json() for step in steps]}


def _parse_step(number: int, step: Any) -> StepRequest:
    where = f"step {number}"
    if not isinstance(step, dict) or set(step) != {"workflow", "load"}:
        raise SpecError(f"{where} must be an object with exactly workflow and load")
    workflow, load = step["workflow"], step["load"]
    if not isinstance(workflow, str) or not workflow:
        raise SpecError(f"{where}: workflow must be a non-empty string")
    if not isinstance(load, dict):
        raise SpecError(f"{where}: load must be an object")
    mode = load.get("mode")
    expected = _LOAD_KEYS.get(mode) if isinstance(mode, str) else None
    if expected is None:
        raise SpecError(f"{where}: load mode must be one of {', '.join(LOAD_MODES)}")
    if set(load) != expected:
        article = "an" if mode == AUTO else "a"
        raise SpecError(f"{where}: {article} {mode} load takes exactly {', '.join(sorted(expected))}")
    value = load.get("value", load.get("path"))
    if mode != AUTO and (not isinstance(value, str) or not value):
        raise SpecError(f"{where}: a {mode} load needs a non-empty string")
    return StepRequest(workflow, mode, value)


def parse_spec(document: Any) -> List[StepRequest]:
    """The step requests of a spec document; SpecError on any deviation."""
    if not isinstance(document, dict):
        raise SpecError("a spec must be a JSON object")
    extra = set(document) - {"version", "steps"}
    if extra:
        raise SpecError(f"unknown spec keys: {', '.join(sorted(extra))}")
    if document.get("version") != SPEC_VERSION:
        raise SpecError(f"spec version must be {SPEC_VERSION}")
    steps = document.get("steps")
    if not isinstance(steps, list) or not 1 <= len(steps) <= MAX_STEPS:
        raise SpecError(f"a spec needs 1 to {MAX_STEPS} steps")
    return [_parse_step(number, step) for number, step in enumerate(steps, start=1)]


def load_spec(path: Path) -> List[StepRequest]:
    try:
        document = json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, ValueError) as error:
        raise SpecError(f"could not read {path}: {error}") from error
    return parse_spec(document)


def write_spec(path: Path, steps: Sequence[StepRequest]) -> None:
    """Write the spec once: an existing file is an error; the result is read-only."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("x", encoding="utf-8") as handle:
        handle.write(json.dumps(spec_document(steps), indent=2) + "\n")
    path.chmod(0o444)


def custom_config_path(raw: str, options_dir: Path = PERF_OPTIONS_DIR) -> Path:
    """The committed k6 options JSON that `raw` names beneath the options directory."""
    if not raw:
        raise SpecError(f"a custom config needs a JSON path relative to {OPTIONS_LABEL}")
    relative = PurePosixPath(raw)
    if "\\" in raw or relative.is_absolute():
        raise SpecError(f"custom config {raw!r} must be a path relative to {OPTIONS_LABEL}")
    if ".." in relative.parts:
        raise SpecError(f"custom config {raw!r} must not contain '..'")
    if relative.suffix != ".json":
        raise SpecError(f"custom config {raw!r} must be a .json file")
    root = options_dir.resolve()
    path = (root / raw).resolve()
    if root not in path.parents:
        raise SpecError(f"custom config {raw!r} resolves outside {OPTIONS_LABEL}")
    if not path.is_file():
        raise SpecError(f"custom config {raw!r} does not exist beneath {OPTIONS_LABEL}")
    return path
```

- [ ] **Step 4: Run spec tests**

Run: `cd scripts && python3 -m unittest pg.tests.test_perf_spec -v`
Expected: PASS (5 tests).

- [ ] **Step 5: Add the committed example custom config** — create `tests/performance/k6/options/custom/status-regression.json`:

```json
{
  "scenarios": {
    "default": {
      "executor": "per-vu-iterations",
      "vus": 2,
      "iterations": 10,
      "maxDuration": "5m"
    }
  }
}
```

`shapes()` globs `options/*.json` only, so `custom/` never becomes a preset.

- [ ] **Step 6: Write the failing planner tests** — in `scripts/pg/tests/test_perf_chain.py`:

Change the import block to:

```python
from pg.perf_chain import (  # noqa: E402
    MAX_BROWSER_VUS,
    parse_steps,
    peak_vus,
    plan_chain,
    run_chain,
    shapes,
)
from pg.perf_spec import CUSTOM, PRESET, StepRequest  # noqa: E402
```

Replace `test_a_step_defaults_to_auto` with:

```python
    def test_a_step_defaults_to_auto(self) -> None:
        self.assertEqual(
            parse_steps(["http-cart", "http-orders:5-vu-5m"]),
            [StepRequest("http-cart"), StepRequest("http-orders", PRESET, "5-vu-5m")],
        )
```

Add a new class after `PlanTests`:

```python
STATUS_REGRESSION = "custom/status-regression.json"


class LoadTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary_directory = TemporaryDirectory()
        self.options = Path(self.temporary_directory.name)
        (self.options / "custom").mkdir()

    def tearDown(self) -> None:
        self.temporary_directory.cleanup()

    def custom(self, name: str, config) -> str:
        path = self.options / "custom" / name
        path.write_text(config if isinstance(config, str) else json.dumps(config), encoding="utf-8")
        return f"custom/{name}"

    def test_a_custom_reader_config_sizes_the_earlier_auto_producers(self) -> None:
        result = plan_chain(
            [
                StepRequest("http-cart"),
                StepRequest("http-orders"),
                StepRequest("http-orders-status", CUSTOM, STATUS_REGRESSION),
            ],
            CATALOG,
        )
        self.assertEqual(result.errors, [])
        cart, orders, status = result.steps
        # 2 VUs × 10 per-VU iterations = 20 rows; +15% margin = 23; cart: 23 × 1.15 → 27.
        self.assertEqual((orders.sizing.iterations, orders.sized_for), (23, 3))
        self.assertEqual(cart.sizing.iterations, 27)
        self.assertEqual(status.shape, CUSTOM)
        self.assertEqual(status.shape_label(), f"custom: {STATUS_REGRESSION}")
        self.assertEqual(
            status.run_args(),
            ["--config", str((PERF_OPTIONS_DIR / STATUS_REGRESSION).resolve())],
        )
        self.assertEqual(result.requested, ["http-cart", "http-orders", "http-orders-status"])

    def test_an_unsafe_or_invalid_custom_config_is_a_plan_error(self) -> None:
        escape = plan_chain([StepRequest("http-cart", CUSTOM, "../x.json")], CATALOG, self.options)
        self.assertEqual(escape.errors, ["step 1 http-cart: custom config '../x.json' must not contain '..'"])
        broken = self.custom("broken.json", "{nope")
        invalid = plan_chain([StepRequest("http-cart", CUSTOM, broken)], CATALOG, self.options)
        self.assertRegex(invalid.errors[0], r"^step 1 http-cart: could not read k6 config ")
        array = self.custom("array.json", [])
        not_object = plan_chain([StepRequest("http-cart", CUSTOM, array)], CATALOG, self.options)
        self.assertRegex(not_object.errors[0], r"must be a JSON object$")

    def test_a_custom_browser_config_over_the_cap_is_rejected(self) -> None:
        big = self.custom("big.json", {"scenarios": {"default": {
            "executor": "shared-iterations", "vus": 6, "iterations": 6,
            "options": {"browser": {"type": "chromium"}},
        }}})
        result = plan_chain([StepRequest("browser-cart", CUSTOM, big)], CATALOG, self.options)
        self.assertEqual(
            result.errors,
            [f"step 1 browser-cart: custom: {big} runs up to 6 browser VUs; the cap is {MAX_BROWSER_VUS}"],
        )

    def test_a_ramping_custom_browser_config_over_the_cap_is_rejected_with_its_peak(self) -> None:
        ramping = self.custom("ramp.json", {"scenarios": {"default": {
            "executor": "ramping-vus", "startVUs": 1,
            "stages": [{"duration": "30s", "target": 3}, {"duration": "30s", "target": 8}],
        }}})
        shortcut = self.custom("stages.json", {"stages": [{"duration": "1m", "target": 5}]})
        for path, peak in ((ramping, 8), (shortcut, 5)):
            with self.subTest(path=path):
                result = plan_chain([StepRequest("browser-purchase", CUSTOM, path)], CATALOG, self.options)
                self.assertEqual(len(result.errors), 1)
                self.assertIn(f"runs up to {peak} browser VUs; the cap is 4", result.errors[0])

    def test_a_browser_config_whose_peak_cannot_be_calculated_is_rejected(self) -> None:
        odd = self.custom("odd.json", {"scenarios": {"default": {"executor": "externally-controlled"}}})
        result = plan_chain([StepRequest("browser-cart", CUSTOM, odd)], CATALOG, self.options)
        self.assertEqual(len(result.errors), 1)
        self.assertIn("cannot tell how many browser VUs", result.errors[0])
        self.assertIn('uses executor "externally-controlled"', result.errors[0])

    def test_a_protocol_step_is_never_checked_against_the_browser_cap(self) -> None:
        big = self.custom("big-http.json", {"vus": 50, "duration": "1m"})
        self.assertEqual(plan_chain([StepRequest("http-purchase", CUSTOM, big)], CATALOG, self.options).errors, [])

    def test_an_unknown_preset_from_a_spec_is_rejected_like_an_unknown_shape(self) -> None:
        result = plan_chain([StepRequest("http-cart", PRESET, "auto")], CATALOG)
        self.assertRegex(result.errors[0], r"^step 1 http-cart: unknown shape 'auto'")


class PeakVusTests(unittest.TestCase):
    def test_peak_vus_per_executor_and_shortcut(self) -> None:
        cases = [
            ({}, 1),
            ({"vus": 3, "duration": "1m"}, 3),
            ({"iterations": 9}, 1),
            ({"vus": 2, "stages": [{"duration": "1m", "target": 6}]}, 6),
            ({"scenarios": {"a": {"executor": "shared-iterations", "vus": 2, "iterations": 4}}}, 2),
            ({"scenarios": {"a": {"executor": "per-vu-iterations", "iterations": 4}}}, 1),
            ({"scenarios": {"a": {"executor": "constant-vus", "vus": 4, "duration": "1m"}}}, 4),
            ({"scenarios": {"a": {"executor": "ramping-vus", "stages": [{"duration": "1m", "target": 0}]}}}, 1),
            ({"scenarios": {"a": {"executor": "constant-arrival-rate", "preAllocatedVUs": 2, "maxVUs": 7}}}, 7),
            ({"scenarios": {"a": {"executor": "ramping-arrival-rate", "preAllocatedVUs": 3}}}, 3),
            ({"scenarios": {
                "a": {"executor": "constant-vus", "vus": 2, "duration": "1m"},
                "b": {"executor": "shared-iterations", "vus": 3, "iterations": 3},
            }}, 5),
        ]
        for config, expected in cases:
            with self.subTest(config=config):
                self.assertEqual(peak_vus(config), expected)

    def test_unreadable_vu_counts_raise(self) -> None:
        for config in (
            {"vus": True},
            {"vus": "4"},
            {"scenarios": {}},
            {"scenarios": {"a": "x"}},
            {"scenarios": {"a": {"executor": "ramping-vus"}}},
            {"scenarios": {"a": {"executor": "constant-arrival-rate"}}},
            {"stages": []},
        ):
            with self.subTest(config=config):
                with self.assertRaises(ValueError):
                    peak_vus(config)
```

- [ ] **Step 7: Run to verify failure**

Run: `cd scripts && python3 -m unittest pg.tests.test_perf_chain -v`
Expected: ImportError (`peak_vus`), then failures once it exists.

- [ ] **Step 8: Implement in `scripts/pg/perf_chain.py`**

8a. Imports: delete `AUTO = "auto"`, and add after `from pg.k6runner import execute_k6`:

```python
from pg.perf_spec import AUTO, CUSTOM, PRESET, SpecError, StepRequest, custom_config_path
```

(Task 3 adds `load_spec` to this import when `--spec` uses it; importing it now would fail ruff's F401.)

8b. Below `MAX_BROWSER_VUS`, add:

```python
FIXED_VU_EXECUTORS = ("shared-iterations", "per-vu-iterations", "constant-vus")
ARRIVAL_RATE_EXECUTORS = ("constant-arrival-rate", "ramping-arrival-rate")
```

8c. Replace `parse_steps`:

```python
def parse_steps(raw: Sequence[str]) -> List[StepRequest]:
    """`<workflow>[:<shape>]` items as step requests; the shape defaults to auto."""
    steps: List[StepRequest] = []
    for item in raw:
        workflow, _, shape = item.partition(":")
        workflow, shape = workflow.strip(), shape.strip() or AUTO
        steps.append(StepRequest(workflow) if shape == AUTO else StepRequest(workflow, PRESET, shape))
    return steps
```

8d. In `Step`, change the `shape` comment and add `custom` after `shape`:

```python
    number: int
    workflow: K6Workflow
    # auto, a preset stem, or "custom"
    shape: str
    # The custom config's path beneath tests/performance/k6/options/
    custom: Optional[str] = None
```

In `Step.shape_label`, insert as the first statement:

```python
        if self.shape == CUSTOM:
            return f"custom: {self.custom}"
```

In `Step.run_args`, replace the `elif self.shape != AUTO ...` branch with:

```python
        elif self.shape == CUSTOM and self.config_path is not None:
            args += ["--config", str(self.config_path)]
        elif self.shape != AUTO and self.config_path is not None:
            args += ["--config", self.config_path.stem]
```

8e. In `Plan`, add the last field:

```python
    # The workflows the run asked for, in order, including any the plan rejected.
    requested: List[str] = field(default_factory=list)
```

8f. Replace `_select_steps`:

```python
def _select_steps(
    entries: Sequence[StepRequest], catalog: WorkflowCatalog, options_dir: Path, plan: Plan
) -> None:
    """Check names, loads, and gaps; fill plan.steps with the non-empty steps."""
    presets = shapes(options_dir)[1:]
    last = max(
        (index for index, entry in enumerate(entries) if entry.workflow != EMPTY), default=-1
    )
    if last < 0:
        plan.errors.append("no workflow selected; step 1 needs one")
        return
    for index, entry in enumerate(entries):
        number, name = index + 1, entry.workflow
        if index > last:
            if entry.mode != AUTO:
                plan.warnings.append(f"step {number} is empty; its shape {entry.value} is ignored")
            continue
        if name == EMPTY:
            plan.errors.append(
                f"step {number} is empty but step {last + 1} is set; "
                "fill steps from step 1 without gaps"
            )
            continue
        workflow = catalog.workflows.get(name)
        if workflow is None:
            plan.errors.append(
                f"step {number}: unknown workflow {name!r}; "
                f"known: {', '.join(sorted(catalog.workflows))}"
            )
            continue
        if entry.mode == PRESET and entry.value not in presets:
            plan.errors.append(
                f"step {number} {name}: unknown shape {entry.value!r}; "
                f"use one of: {', '.join(shapes(options_dir))}"
            )
            continue
        step = Step(number, workflow, entry.value if entry.mode == PRESET else entry.mode)
        if entry.mode == PRESET:
            step.config_path = _preset_path(workflow, entry.value, options_dir)
            if step.config_path is None:
                plan.errors.append(
                    f"step {number} {name}: a browser workflow has no {entry.value} preset; "
                    f"use auto or one of: {', '.join(browser_shapes(options_dir))}"
                )
                continue
        elif entry.mode == CUSTOM:
            step.custom = entry.value
            try:
                step.config_path = custom_config_path(entry.value or "", options_dir)
            except SpecError as error:
                plan.errors.append(f"step {number} {name}: {error}")
                continue
        if entry.mode != AUTO:
            try:
                step.config = read_k6_config(step.config_path)
            except WorkflowError as error:
                plan.errors.append(f"step {number} {name}: {error}")
                continue
        plan.steps.append(step)
```

8g. In `_resolve_configs`, replace

```python
        if step.shape != AUTO:
            assert step.config_path is not None
            step.config = read_k6_config(step.config_path)
            continue
```

with

```python
        if step.shape != AUTO:
            continue  # read when the step was selected
```

8h. Add after `_resolve_configs`:

```python
def _whole(source: Dict[str, Any], key: str, default: Optional[int] = None) -> int:
    value = source.get(key, default)
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        raise ValueError(f"{key} must be a whole number")
    return value


def _stages_peak(stages: Any, start: int) -> int:
    if not isinstance(stages, list) or not stages:
        raise ValueError("stages must be a non-empty list")
    if not all(isinstance(stage, dict) for stage in stages):
        raise ValueError("each stage must be an object")
    return max([start, *(_whole(stage, "target") for stage in stages)])


def _scenario_peak(name: str, scenario: Any) -> int:
    if not isinstance(scenario, dict):
        raise ValueError(f"scenario {name} must be an object")
    executor = scenario.get("executor")
    if executor in FIXED_VU_EXECUTORS:
        return _whole(scenario, "vus", 1)
    if executor == "ramping-vus":
        return _stages_peak(scenario.get("stages"), _whole(scenario, "startVUs", 1))
    if executor in ARRIVAL_RATE_EXECUTORS:
        return _whole(scenario, "maxVUs" if "maxVUs" in scenario else "preAllocatedVUs")
    raise ValueError(f"scenario {name} uses executor {json.dumps(executor)}")


def peak_vus(config: Dict[str, Any]) -> int:
    """The most VUs `config` can run at once; scenarios count as if concurrent."""
    scenarios = config.get("scenarios")
    if scenarios is not None:
        if not isinstance(scenarios, dict) or not scenarios:
            raise ValueError("scenarios must be a non-empty object")
        return sum(_scenario_peak(name, scenario) for name, scenario in scenarios.items())
    if "stages" in config:
        return _stages_peak(config["stages"], _whole(config, "vus", 1))
    return _whole(config, "vus", 1)


def _check_browser_vus(plan: Plan) -> None:
    """Every browser step's resolved config stays within MAX_BROWSER_VUS."""
    for step in plan.steps:
        if not step.browser or step.sizing is not None:
            continue  # a sized step was checked when it was sized
        try:
            peak = peak_vus(step.config)
        except ValueError as error:
            plan.errors.append(
                f"step {step.number} {step.name}: cannot tell how many browser VUs "
                f"{step.shape_label()} runs ({error}); the cap is {MAX_BROWSER_VUS}"
            )
            continue
        if peak > MAX_BROWSER_VUS:
            plan.errors.append(
                f"step {step.number} {step.name}: {step.shape_label()} runs up to {peak} "
                f"browser VUs; the cap is {MAX_BROWSER_VUS}"
            )
```

8i. Replace `plan_chain`:

```python
def plan_chain(
    entries: Sequence[StepRequest],
    catalog: WorkflowCatalog,
    options_dir: Path = PERF_OPTIONS_DIR,
) -> Plan:
    """Validate and size a chain of step requests without running it."""
    plan = Plan(steps=[], requested=[entry.workflow for entry in entries if entry.workflow != EMPTY])
    _select_steps(entries, catalog, options_dir, plan)
    if not plan.errors:
        _link_data(catalog, plan)
    if not plan.errors:
        _resolve_configs(catalog, plan)
        _check_browser_vus(plan)
    return plan
```

8j. Update the module docstring's second paragraph to: "A load is `auto`, a preset stem from tests/performance/k6/options/, or (from `--spec`) a custom k6 options JSON beneath that directory. A step whose data a later step reads is sized for that reader with Punch's size_producer when its load is `auto` (resolved from the last step back); any other `auto` step keeps its workflow's spec.k6.config. Browser workflows run a preset's `-browser` variant, and every browser step's resolved config must stay within MAX_BROWSER_VUS."

- [ ] **Step 9: Run the full Python suite and ruff**

Run: `cd scripts && python3 -m unittest discover -s pg/tests -p 'test_*.py' 2>&1 | tail -3 && cd .. && ruff check scripts/pg`
Expected: all tests pass (170 + new); ruff clean. `test_a_sized_browser_step_over_the_cap_is_rejected` still yields exactly one error (sized steps skip `_check_browser_vus`).

- [ ] **Step 10: Commit**

```bash
git add scripts/pg/perf_spec.py scripts/pg/perf_chain.py scripts/pg/tests/test_perf_spec.py scripts/pg/tests/test_perf_chain.py tests/performance/k6/options/custom/status-regression.json
git commit -m "feat(perf): accept custom k6 configs and cap every browser step's peak VUs"
```

---

### Task 3: `perf:chain --spec`, threshold evidence, and one summary renderer

**Files:**
- Modify: `scripts/pg/perf_chain.py` (`StepRecord`, `_collect_evidence`, `run_chain`, evidence/summary functions, `annotate`, `run`)
- Modify: `scripts/pg/tests/test_perf_chain.py`
- Modify: `scripts/pg/cli.py` (usage line)

**Interfaces:**
- Consumes: Task 1 summary fields `thresholds`, `emittedMetrics`; Task 2 `load_spec`, `SpecError`, `Plan.requested`.
- Produces (used by Task 5):
  - `chain.json`: `{"outcome": "passed"|"failed"|"rejected"|"planned", "passed": bool|None, "sequence": [names], "steps": [...], "errors": [...], "warnings": [...]}`; each step adds `customConfig`, `data`, and after a run `thresholds`, `emittedMetrics`, `summary` (path of the copied k6 summary, relative to `REPO_ROOT` when inside it).
  - `render_summary(evidence: dict, *, outcome: Optional[str] = None, notes: Sequence[str] = (), runner_warning: bool = False) -> str` — starts with `## Passed|Failed|Rejected|Planned...`, ends with a `### Details` section.
  - `RUNNER_WARNING: str`, `annotate(errors, warnings, title: str) -> None`, `CHAIN_REPORTS_DIR`, `BROWSER_SERVICE`.
  - `./dev perf:chain --spec PATH [--plan]` (relative `PATH` read from `REPO_ROOT`).

- [ ] **Step 1: Write failing tests** — in `scripts/pg/tests/test_perf_chain.py`:

Add imports: `import dataclasses`, and `from pg.perf_chain import RUNNER_WARNING, render_summary` (extend the existing import), `from pg.perf_spec import spec_document` (extend), `from punch.workflow import SummaryOutput`.

Update three existing assertions in `RunTests`:

```python
        self.assertIn(
            "## Failed at step 2 http-orders: http-cart → http-orders → http-orders-status", summary
        )
        self.assertIn("skipped: an earlier step failed", summary)
```

```python
        self.assertIn(
            "## Planned: http-cart → http-orders",
            (self.reports / "summary.md").read_text(encoding="utf-8"),
        )
```

```python
        self.assertIn(
            "## Rejected: http-orders → http-cart",
            (self.reports / "summary.md").read_text(encoding="utf-8"),
        )
```

Add tests to `RunTests`:

```python
    def summary_writer(self, chain, summaries: dict):
        """Point each step's k6 summary at a temp file the fake k6 run writes."""
        for step in chain.steps:
            path = Path(self.temporary_directory.name) / f"{step.name}-summary.json"
            step.workflow = dataclasses.replace(step.workflow, summary_output=SummaryOutput(path))

        def execute(name, _args, **_kwargs):
            step = next(s for s in chain.steps if s.name == name)
            payload = summaries[name]
            step.workflow.summary_output.path.write_text(json.dumps(payload), encoding="utf-8")
            return (0 if payload["passed"] else 99), _result(name, payload["passed"])

        return execute

    @patch("pg.perf_chain.execute_k6")
    def test_threshold_results_and_emitted_metrics_reach_the_evidence(self, execute) -> None:
        chain = plan("http-purchase")
        execute.side_effect = self.summary_writer(chain, {"http-purchase": {
            "passed": False, "totalRequests": 12, "errorRate": 0, "p90Ms": 1200.4,
            "checkPassRate": 1, "durationMs": 9000,
            "thresholds": [
                {"metric": "http_req_duration", "expression": "p(95)<1000", "ok": False},
                {"metric": "http_req_failed", "expression": "rate<0.01", "ok": True},
            ],
            "emittedMetrics": ["checks", "http_req_duration", "http_req_failed", "http_reqs"],
        }})

        self.assertEqual(run_chain(chain, self.reports), 99)

        [step] = self.evidence()["steps"]
        self.assertEqual(step["thresholds"][0]["expression"], "p(95)<1000")
        self.assertTrue(step["summary"].endswith("step-1-http-purchase/http-purchase-summary.json"))
        summary = (self.reports / "summary.md").read_text(encoding="utf-8")
        self.assertIn("| 12 | 0.00% | 1200 ms | 100.00% | failed: `http_req_duration` p(95)<1000 |", summary)
        self.assertIn("- Step 1 `http-purchase`: `http_req_duration` p(95)<1000 failed", summary)
        self.assertIn("- Step 1 `http-purchase`: `http_req_failed` rate<0.01 held", summary)

    @patch("pg.perf_chain.execute_k6")
    def test_metrics_k6_did_not_emit_read_not_emitted_not_zero(self, execute) -> None:
        chain = plan("browser-cart:1-iteration")
        execute.side_effect = self.summary_writer(chain, {"browser-cart": {
            "passed": True, "totalRequests": 0, "errorRate": 1, "p90Ms": 0,
            "checkPassRate": 1, "durationMs": 3000,
            "thresholds": [{"metric": "checks", "expression": "rate>0.95", "ok": True}],
            "emittedMetrics": ["checks", "iterations"],
        }})
        self.assertEqual(run_chain(chain, self.reports), 0)
        summary = (self.reports / "summary.md").read_text(encoding="utf-8")
        self.assertIn("| not emitted | not emitted | not emitted | 100.00% | held (1) |", summary)

    def test_the_runner_warning_appears_only_when_asked(self) -> None:
        evidence = {"outcome": "planned", "sequence": ["http-purchase"], "steps": [], "errors": [], "warnings": []}
        self.assertNotIn(RUNNER_WARNING, render_summary(evidence))
        self.assertIn(RUNNER_WARNING, render_summary(evidence, runner_warning=True))
        self.assertTrue(
            render_summary(evidence).endswith("### Details\n\n- No thresholds evaluated and no warnings.\n")
        )

    @patch("pg.perf_chain.execute_k6")
    def test_a_spec_file_plans_the_same_steps_as_positional_arguments(self, execute) -> None:
        spec = Path(self.temporary_directory.name) / "spec.json"
        spec.write_text(json.dumps(spec_document(parse_steps(["http-cart", "http-orders:5-vu-5m"]))), encoding="utf-8")
        with patch("pg.perf_chain.CHAIN_REPORTS_DIR", self.reports):
            self.assertEqual(perf_chain.run(["--plan", "--spec", str(spec)]), 0)
        execute.assert_not_called()
        steps = self.evidence()["steps"]
        self.assertEqual([s["workflow"] for s in steps], ["http-cart", "http-orders"])
        self.assertEqual(steps[0]["config"], "auto: sized for step 2 (1569 iterations, 7 VUs)")

    @patch("pg.perf_chain.execute_k6")
    def test_an_invalid_spec_is_rejected_with_evidence(self, execute) -> None:
        spec = Path(self.temporary_directory.name) / "spec.json"
        spec.write_text(json.dumps({"version": 9, "steps": []}), encoding="utf-8")
        with patch("pg.perf_chain.CHAIN_REPORTS_DIR", self.reports):
            self.assertEqual(perf_chain.run(["--spec", str(spec)]), 1)
        execute.assert_not_called()
        evidence = self.evidence()
        self.assertEqual(evidence["outcome"], "rejected")
        self.assertRegex(evidence["errors"][0], r"^spec .*spec\.json: spec version must be 1$")

    def test_a_relative_spec_path_is_read_from_the_repository_root(self) -> None:
        self.assertEqual(
            perf_chain._spec_path("tests/performance/k6/reports/dispatch/spec.json"),
            REPO_ROOT / "tests/performance/k6/reports/dispatch/spec.json",
        )
        self.assertEqual(perf_chain._spec_path("/abs/spec.json"), Path("/abs/spec.json"))

    def test_steps_and_spec_are_mutually_exclusive(self) -> None:
        with patch("sys.stderr", StringIO()):
            for args in (["--spec", "x.json", "http-cart"], []):
                with self.subTest(args=args), self.assertRaises(SystemExit) as caught:
                    perf_chain.run(args)
                self.assertEqual(caught.exception.code, 2)
```

- [ ] **Step 2: Run to verify failure**

Run: `cd scripts && python3 -m unittest pg.tests.test_perf_chain -v`
Expected: FAIL (ImportError on `RUNNER_WARNING`/`render_summary`, then heading mismatches).

- [ ] **Step 3: Implement in `scripts/pg/perf_chain.py`**

3a. Extend the Task 2 import to `from pg.perf_spec import AUTO, CUSTOM, PRESET, SpecError, StepRequest, custom_config_path, load_spec`. Constants below `METRIC_KEYS`:

```python
OUTCOME_HEADINGS = {"passed": "Passed", "failed": "Failed", "rejected": "Rejected", "planned": "Planned"}
RUNNER_WARNING = (
    "> The app and k6 share one GitHub-hosted runner. Use these results for\n"
    "> regression evidence, not capacity claims. Compare only runs with the same\n"
    "> workload, test data, and environment."
)
# k6 metric names behind each summary column; a browser run reports browser_http_*.
REQUEST_METRICS = ("http_reqs", "browser_http_req_failed")
ERROR_METRICS = ("http_req_failed", "browser_http_req_failed")
LATENCY_METRICS = ("http_req_duration", "browser_http_req_duration")
CHECK_METRICS = ("checks",)
```

3b. `StepRecord` — add before `seconds`:

```python
    # The k6 summary's threshold results ({metric, expression, ok}) and emitted metric names.
    thresholds: List[Dict[str, Any]] = field(default_factory=list)
    emitted: Optional[List[str]] = None
    # The copied k6 summary (relative to the repository root when inside it); None if none was written.
    summary: Optional[str] = None
```

3c. Replace `_collect_evidence`:

```python
def _collect_evidence(record: StepRecord, started: float, reports_dir: Path) -> None:
    """Copy the step's log, k6 summary, and HTML report into the chain directory,
    then read the summary's metrics, threshold results, and emitted metric names."""
    step = record.step
    target = reports_dir / f"step-{step.number}-{step.name}"
    sources = [PERF_REPORTS_DIR / "logs" / f"k6-{step.name}.log"]
    summary = step.workflow.summary_output.path if step.workflow.summary_output else None
    if summary is not None:
        sources += [summary, summary.with_name(f"{step.name}-report.html")]
    for source in sources:
        if _fresh(source, started):
            target.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, target / source.name)
    if summary is None or not _fresh(summary, started):
        return
    try:
        values = json.loads(summary.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return
    if not isinstance(values, dict):
        return
    record.summary = _relative(target / summary.name)
    record.metrics = {key: values[key] for key in METRIC_KEYS if key in values}
    record.thresholds = [item for item in values.get("thresholds", []) if isinstance(item, dict)]
    emitted = values.get("emittedMetrics")
    record.emitted = [str(name) for name in emitted] if isinstance(emitted, list) else None
```

3d. In `run_chain`, replace `record.metrics = _collect_evidence(step, started, reports_dir)` with `_collect_evidence(record, started, reports_dir)`.

3e. Delete `_metrics_text`, `_result_text`, and `summary_markdown`. Add:

```python
def _md(text: Any) -> str:
    """Table-safe text: a pipe would end the cell."""
    return str(text).replace("|", "\\|").replace("\n", " ")


def _ran(step: Dict[str, Any]) -> bool:
    return step.get("status") in ("passed", "failed")


def _metric_cell(step: Dict[str, Any], key: str, names: Sequence[str], text) -> str:
    if not _ran(step):
        return "—"
    if not step.get("summary"):
        return "no summary"
    emitted, metrics = step.get("emittedMetrics"), step.get("metrics") or {}
    if key not in metrics or (emitted is not None and not any(n in emitted for n in names)):
        return "not emitted"
    return text(metrics[key])


def _gate_cell(step: Dict[str, Any]) -> str:
    if not _ran(step):
        return "—"
    if not step.get("summary"):
        return "no summary"
    thresholds = step.get("thresholds") or []
    if not thresholds:
        return "none defined"
    failed = [item for item in thresholds if not item.get("ok")]
    if failed:
        return "failed: " + ", ".join(
            f"`{_md(item.get('metric'))}` {_md(item.get('expression'))}" for item in failed
        )
    return f"held ({len(thresholds)})"


def _status_cell(step: Dict[str, Any], outcome: str) -> str:
    status = step.get("status")
    if status is None:
        return "rejected" if outcome == "rejected" else "planned"
    if status == "skipped":
        return "skipped: an earlier step failed"
    if status == "failed":
        reason = step.get("failure") or "exit code {}".format(step.get("exitCode"))
        return f"**failed**: {_md(reason)}"
    return "passed"


def _data_cell(step: Dict[str, Any]) -> str:
    rows = step.get("rows") or {}
    written = [_count(count, f"{dataset} row") for dataset, count in rows.items()]
    return _md("; ".join([step.get("data") or "none", *written]))


def _step_row(step: Dict[str, Any], outcome: str) -> str:
    cells = [
        str(step["step"]),
        f"`{step['workflow']}`",
        _md(step.get("config", "")),
        _data_cell(step),
        _status_cell(step, outcome),
        "{:.1f} s".format(step.get("seconds", 0.0)) if _ran(step) else "—",
        _metric_cell(step, "totalRequests", REQUEST_METRICS, lambda v: f"{v:,}"),
        _metric_cell(step, "errorRate", ERROR_METRICS, lambda v: f"{v * 100:.2f}%"),
        _metric_cell(step, "p90Ms", LATENCY_METRICS, lambda v: f"{v:.0f} ms"),
        _metric_cell(step, "checkPassRate", CHECK_METRICS, lambda v: f"{v * 100:.2f}%"),
        _gate_cell(step),
    ]
    return "| " + " | ".join(cells) + " |"


def _details(evidence: Dict[str, Any]) -> List[str]:
    lines: List[str] = []
    thresholds = [
        f"- Step {step['step']} `{step['workflow']}`: `{item.get('metric')}` "
        f"{item.get('expression')} {'held' if item.get('ok') else 'failed'}"
        for step in evidence.get("steps", [])
        for item in step.get("thresholds") or []
    ]
    if thresholds:
        lines += ["Thresholds:", "", *thresholds, ""]
    warnings = evidence.get("warnings") or []
    if warnings:
        lines += ["Warnings:", "", *[f"- {message}" for message in warnings], ""]
    return lines or ["- No thresholds evaluated and no warnings.", ""]


def render_summary(
    evidence: Dict[str, Any],
    *,
    outcome: Optional[str] = None,
    notes: Sequence[str] = (),
    runner_warning: bool = False,
) -> str:
    """Markdown for a chain evidence record (chain.json): the heading names the
    outcome, one row per step, then errors, the runner warning, and details."""
    outcome = outcome or evidence["outcome"]
    steps = evidence.get("steps", [])
    sequence = " → ".join(evidence.get("sequence") or [s["workflow"] for s in steps]) or "no workflow"
    heading = OUTCOME_HEADINGS[outcome]
    failed = next((step for step in steps if step.get("status") == "failed"), None)
    if outcome == "failed" and failed is not None:
        heading += f" at step {failed['step']} {failed['workflow']}"
    lines = [f"## {heading}: {_md(sequence)}", ""]
    if notes:
        lines += [*[f"- {note}" for note in notes], ""]
    if steps:
        lines += [
            "| Step | Workflow | Load | Data | Status | Duration | Requests | Errors | p90 | Checks | Thresholds |",
            "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
            *[_step_row(step, outcome) for step in steps],
            "",
        ]
    errors = evidence.get("errors") or []
    if errors:
        lines += ["Errors:", "", *[f"- {error}" for error in errors], ""]
    if runner_warning:
        lines += [RUNNER_WARNING, ""]
    lines += ["### Details", "", *_details(evidence)]
    return "\n".join(lines)
```

3f. Replace `_step_evidence` and `write_evidence`:

```python
def _step_evidence(step: Step, record: Optional[StepRecord]) -> Dict[str, Any]:
    entry: Dict[str, Any] = {
        "step": step.number,
        "workflow": step.name,
        "shape": step.shape,
        "customConfig": step.custom,
        "config": step.shape_label(),
        "k6Config": step.config,
        "data": step.data_label(),
        "produce": step.produce,
        "reads": step.reads,
        "defaults": step.defaults,
    }
    if record is not None:
        entry.update(
            status=record.status,
            exitCode=record.exit_code,
            failure=record.failure,
            rows=record.rows,
            metrics=record.metrics,
            thresholds=record.thresholds,
            emittedMetrics=record.emitted,
            summary=record.summary,
            seconds=record.seconds,
        )
        if step.sizing is not None and record.status != "skipped":
            entry["sizing"] = sizing_evidence(step.sizing, record.rows)
    return entry


def _outcome(plan: Plan, records: Optional[List[StepRecord]]) -> str:
    if plan.errors:
        return "rejected"
    if records is None:
        return "planned"
    return "failed" if any(record.status == "failed" for record in records) else "passed"


def write_evidence(plan: Plan, records: Optional[List[StepRecord]], reports_dir: Path) -> None:
    """chain.json (the chain's evidence record) and summary.md (rendered from it)."""
    by_step = {record.step.number: record for record in records or []}
    outcome = _outcome(plan, records)
    evidence = {
        "outcome": outcome,
        "passed": None if records is None else outcome == "passed",
        "sequence": plan.requested,
        "steps": [_step_evidence(step, by_step.get(step.number)) for step in plan.steps],
        "errors": plan.errors,
        "warnings": plan.warnings,
    }
    reports_dir.mkdir(parents=True, exist_ok=True)
    (reports_dir / "chain.json").write_text(json.dumps(evidence, indent=2) + "\n", encoding="utf-8")
    (reports_dir / "summary.md").write_text(
        render_summary(evidence, runner_warning=os.environ.get("GITHUB_ACTIONS") == "true"),
        encoding="utf-8",
    )
```

3g. Replace `_annotate` with a public helper and update its call in `run` to `annotate(plan.errors, plan.warnings, "Punch chain")`:

```python
def annotate(errors: Sequence[str], warnings: Sequence[str], title: str) -> None:
    """GitHub Actions annotations, so a rejected run shows on the run page."""
    if os.environ.get("GITHUB_ACTIONS") != "true":
        return
    for level, messages in (("error", errors), ("warning", warnings)):
        for message in messages:
            escaped = message.replace("%", "%25").replace("\r", "%0D").replace("\n", "%0A")
            print(f"::{level} title={title}::{escaped}")
```

3h. Replace `run` and add helpers above it:

```python
def _spec_path(raw: str) -> Path:
    """`./dev` runs from scripts/, so a relative spec path is read from the repository root."""
    path = Path(raw)
    return path if path.is_absolute() else REPO_ROOT / path


def _plan_spec(path: Path, catalog: WorkflowCatalog) -> Plan:
    try:
        entries = load_spec(path)
    except SpecError as error:
        return Plan(steps=[], errors=[f"spec {_relative(path)}: {error}"])
    return plan_chain(entries, catalog)


def run(args: Sequence[str]) -> int:
    parser = argparse.ArgumentParser(
        prog="./dev perf:chain",
        description="Run k6 workflows in order; each step's datasets feed the steps after it.",
    )
    parser.add_argument(
        "steps", nargs="*", metavar="WORKFLOW[:SHAPE]",
        help=f"A workflow and its shape ({', '.join(shapes())}; default auto). "
             f"'{EMPTY}' marks an empty trailing step.",
    )
    parser.add_argument(
        "--spec", metavar="PATH",
        help="Plan and run a spec.json (what perf:dispatch writes) instead of positional "
             "steps; a relative PATH is read from the repository root.",
    )
    parser.add_argument(
        "--plan", action="store_true",
        help="Validate and size the chain, write its summary, and stop before Docker.",
    )
    parsed = parser.parse_args(list(args))
    if parsed.spec and parsed.steps:
        parser.error("--spec replaces positional steps; give one or the other")
    if not parsed.spec and not parsed.steps:
        parser.error("give at least one WORKFLOW[:SHAPE], or --spec PATH")
    try:
        catalog = load_catalog(PERF_WORKFLOWS_DIR)
        if parsed.spec:
            plan = _plan_spec(_spec_path(parsed.spec), catalog)
        else:
            plan = plan_chain(parse_steps(parsed.steps), catalog)
    except (CatalogError, WorkflowError) as error:
        fail(f"Could not plan the chain: {error}")
        return 1
    shutil.rmtree(CHAIN_REPORTS_DIR, ignore_errors=True)
    _print_plan(plan)
    annotate(plan.errors, plan.warnings, "Punch chain")
    if plan.errors or parsed.plan:
        write_evidence(plan, None, CHAIN_REPORTS_DIR)
        return 1 if plan.errors else 0
    return run_chain(plan)
```

3i. Update the module docstring usage line to `./dev perf:chain <workflow>[:<shape>] [<workflow>[:<shape>] ...] [--plan]` plus a second line `./dev perf:chain --spec <spec.json> [--plan]`, and the evidence sentence to "Evidence lands in tests/performance/k6/reports/chain/: chain.json, summary.md (rendered from it by render_summary), and each step's log, k6 summary, and HTML report."

3j. In `scripts/pg/cli.py` `_usage`, after the `perf:chain` line add:

```python
    print("perf:chain --spec <spec.json> runs a spec written by perf:dispatch (the GitHub perf forms' boundary).")
```

- [ ] **Step 4: Run the suite and ruff**

Run: `cd scripts && python3 -m unittest discover -s pg/tests -p 'test_*.py' 2>&1 | tail -3 && cd .. && ruff check scripts/pg`
Expected: all pass; ruff clean. `DispatchFormTests` (old `perf.yml`) still pass: the file is untouched until Task 6.

- [ ] **Step 5: Commit**

```bash
git add scripts/pg/perf_chain.py scripts/pg/tests/test_perf_chain.py scripts/pg/cli.py
git commit -m "feat(perf): run a spec file and report each threshold in the chain summary"
```

---

### Task 4: Catalog-derived form choices and `./dev perf:forms`

**Files:**
- Create: `scripts/pg/perf_forms.py`
- Create: `scripts/pg/tests/test_perf_forms.py`
- Modify: `scripts/pg/cli.py` (register `perf:forms`)

**Interfaces:**
- Consumes: `plan_chain`, `shapes` (Task 2), `StepRequest`, `AUTO`, `CUSTOM`, `PRESET`, `MAX_STEPS`.
- Produces (used by Tasks 5 and 6): `FORM_FILES: Tuple[Path, Path]` (perf-run.yml, perf-chain.yml), `SEQUENCE_SEPARATOR = " -> "`, `CUSTOM_LABEL = "Custom config"`, `LOAD_LABELS: Tuple[Tuple[str, str], ...]`, `class FormsError(ValueError)`, `load_mode(label: str) -> Optional[Tuple[str, Optional[str]]]` (returns `(AUTO, None)`, `(PRESET, stem)`, `(CUSTOM, None)`, or `None`), `standalone(catalog) -> List[str]`, `links(catalog) -> Dict[str, List[str]]`, `paths(catalog, max_steps=MAX_STEPS) -> List[Tuple[str, ...]]`, `recipes(catalog, options_dir=PERF_OPTIONS_DIR) -> Tuple[List[Tuple[str, ...]], List[str]]` (kept, dropped messages), `sequence_label(path) -> str`, `option_blocks(catalog, options_dir=...) -> Tuple[Dict[str, List[str]], List[str]]` (block id → options; ids `workflows`, `sequences`, `loads`), `render(text: str, blocks, source="form") -> str`, `run(args) -> int`.

- [ ] **Step 1: Write the failing tests** — create `scripts/pg/tests/test_perf_forms.py`:

```python
from __future__ import annotations

import sys
import unittest
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from pg import cli  # noqa: E402
from pg.paths import PERF_WORKFLOWS_DIR  # noqa: E402
from pg.perf_chain import parse_steps, plan_chain, shapes  # noqa: E402
from pg.perf_forms import (  # noqa: E402
    LOAD_LABELS,
    FormsError,
    load_mode,
    option_blocks,
    paths,
    recipes,
    render,
    sequence_label,
    standalone,
)
from pg.perf_spec import AUTO, CUSTOM, PRESET  # noqa: E402
from punch.catalog import load_catalog  # noqa: E402

CATALOG = load_catalog(PERF_WORKFLOWS_DIR)
STANDALONE = [
    "browser-cart",
    "browser-purchase",
    "http-auth-login",
    "http-cart",
    "http-purchase",
    "http-purchase-registered",
]
RECIPES = [
    ("browser-cart", "http-orders"),
    ("browser-cart", "http-orders", "http-orders-status"),
    ("browser-purchase", "http-orders-status"),
    ("http-auth-login", "http-me-hot-status"),
    ("http-cart", "http-orders"),
    ("http-cart", "http-orders", "http-orders-status"),
    ("http-purchase", "http-orders-status"),
    ("http-purchase-registered", "http-auth-login"),
    ("http-purchase-registered", "http-auth-login", "http-me-hot-status"),
]


def fake_catalog(spec: dict) -> SimpleNamespace:
    """name -> (produces {dataset: [targets]}, requires, optional)."""
    workflows = {}
    for name, (produces, requires, optional) in spec.items():
        workflows[name] = SimpleNamespace(data=SimpleNamespace(
            produces=[SimpleNamespace(dataset=d, targets=tuple(t)) for d, t in produces.items()],
            requires=tuple(requires),
            optional=tuple(optional),
        ))
    return SimpleNamespace(workflows=workflows)


class DerivationTests(unittest.TestCase):
    def test_the_current_catalog_offers_six_standalone_workflows(self) -> None:
        self.assertEqual(standalone(CATALOG), STANDALONE)

    def test_the_current_catalog_offers_nine_recipes_that_all_plan(self) -> None:
        kept, dropped = recipes(CATALOG)
        self.assertEqual(kept, RECIPES)
        self.assertEqual(dropped, [])
        for recipe in kept:
            with self.subTest(recipe=recipe):
                self.assertEqual(plan_chain(parse_steps(recipe), CATALOG).errors, [])

    def test_paths_are_acyclic_unique_and_bounded(self) -> None:
        catalog = fake_catalog({
            "a": ({"x": ["b"], "x2": ["b"]}, [], []),
            "b": ({"y": ["c"]}, ["x", "x2"], ["z"]),
            "c": ({"z": ["b", "d"]}, ["y"], []),
            "d": ({"w": ["e"]}, ["z"], []),
            "e": ({}, ["w"], []),
        })
        self.assertEqual(standalone(catalog), ["a"])
        self.assertEqual(paths(catalog), [("a", "b"), ("a", "b", "c"), ("a", "b", "c", "d")])

    def test_a_link_needs_the_target_to_declare_the_dataset(self) -> None:
        catalog = fake_catalog({
            "a": ({"x": ["b", "c"]}, [], []),
            "b": ({}, ["x"], []),
            "c": ({}, [], []),
        })
        self.assertEqual(paths(catalog), [("a", "b")])

    def test_load_labels_cover_auto_custom_and_every_preset(self) -> None:
        values = [value for _, value in LOAD_LABELS]
        self.assertEqual(len(set(label for label, _ in LOAD_LABELS)), len(LOAD_LABELS))
        self.assertEqual(set(values) - {AUTO, CUSTOM}, set(shapes()[1:]))
        self.assertEqual(load_mode("1 journey"), (PRESET, "1-iteration"))
        self.assertEqual(load_mode("Auto (data-size producer; default otherwise)"), (AUTO, None))
        self.assertEqual(load_mode("Custom config"), (CUSTOM, None))
        self.assertIsNone(load_mode("5-vu-5m"))

    def test_sequence_labels_use_an_ascii_arrow(self) -> None:
        self.assertEqual(sequence_label(("http-cart", "http-orders")), "http-cart -> http-orders")


class RenderTests(unittest.TestCase):
    TEXT = (
        "on:\n"
        "  workflow_dispatch:\n"
        "    inputs:\n"
        "      workflow:\n"
        "        options:\n"
        "          # BEGIN perf:forms workflows\n"
        "          - stale\n"
        "          # END perf:forms workflows\n"
        "      load:\n"
        "        options:\n"
        "          # BEGIN perf:forms loads\n"
        "          # END perf:forms loads\n"
    )

    def test_only_the_marked_blocks_change(self) -> None:
        rendered = render(self.TEXT, {"workflows": ["a", "b c"], "loads": ["1 journey"]})
        self.assertEqual(
            rendered,
            self.TEXT.replace("          - stale\n", '          - "a"\n          - "b c"\n').replace(
                "          # BEGIN perf:forms loads\n",
                '          # BEGIN perf:forms loads\n          - "1 journey"\n',
            ),
        )
        self.assertEqual(render(rendered, {"workflows": ["a", "b c"], "loads": ["1 journey"]}), rendered)

    def test_an_unknown_block_or_a_file_without_blocks_is_an_error(self) -> None:
        with self.assertRaisesRegex(FormsError, "unknown generated block 'loads'"):
            render(self.TEXT, {"workflows": []})
        with self.assertRaisesRegex(FormsError, "no '# BEGIN perf:forms <id>' block"):
            render("on: push\n", {"workflows": []})

    def test_option_blocks_name_the_three_lists(self) -> None:
        blocks, dropped = option_blocks(CATALOG)
        self.assertEqual(dropped, [])
        self.assertEqual(blocks["workflows"], STANDALONE)
        self.assertEqual(blocks["sequences"], [sequence_label(r) for r in RECIPES])
        self.assertEqual(blocks["loads"], [label for label, _ in LOAD_LABELS])

    def test_the_command_is_registered(self) -> None:
        self.assertIn("perf:forms", cli.COMMANDS)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run to verify failure**

Run: `cd scripts && python3 -m unittest pg.tests.test_perf_forms -v`
Expected: FAIL — `No module named 'pg.perf_forms'`.

- [ ] **Step 3: Create `scripts/pg/perf_forms.py`**

```python
"""perf:forms — the GitHub perf forms' option lists, derived from the workflow catalog.

    ./dev perf:forms --write   rewrite the generated option blocks
    ./dev perf:forms --check   fail when a block differs from the catalog

perf-run.yml offers every workflow that requires no dataset (an optional
dataset does not count). perf-chain.yml offers every recipe: an acyclic path
of two to four workflows that starts at one of those, where each link is a
dataset the producer writes for that consumer (named in its targets) and the
consumer requires or reads optionally, and that perf:chain plans with every
step on auto. Only the lines between `# BEGIN perf:forms <id>` and
`# END perf:forms <id>` change. perf:dispatch derives the same lists at run
time, so a stale form or an API dispatch cannot run what the catalog does not
offer.
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Dict, List, Optional, Sequence, Tuple

from pg.ansi import fail, info, pass_, warn
from pg.paths import PERF_OPTIONS_DIR, PERF_WORKFLOWS_DIR, REPO_ROOT
from pg.perf_chain import plan_chain
from pg.perf_spec import AUTO, CUSTOM, MAX_STEPS, PRESET, StepRequest

# pg.paths initializes PUNCH_SRC before these public Punch imports.
from punch.catalog import CatalogError, WorkflowCatalog, load_catalog
from punch.workflow import WorkflowError

FORM_FILES = (
    REPO_ROOT / ".github" / "workflows" / "perf-run.yml",
    REPO_ROOT / ".github" / "workflows" / "perf-chain.yml",
)
SEQUENCE_SEPARATOR = " -> "
CUSTOM_LABEL = "Custom config"
# Form label -> internal load value; every value but auto and custom is a preset stem.
LOAD_LABELS: Tuple[Tuple[str, str], ...] = (
    ("Auto (data-size producer; default otherwise)", AUTO),
    ("1 journey", "1-iteration"),
    ("5 journeys", "5-iterations"),
    ("1 user for 5 minutes", "1-vu-5m"),
    ("5 users for 5 minutes", "5-vu-5m"),
    (CUSTOM_LABEL, CUSTOM),
)
BLOCK = re.compile(
    r"^(?P<indent>[ \t]*)# BEGIN perf:forms (?P<id>[\w-]+)\n"
    r"(?P<body>.*?)"
    r"^(?P=indent)# END perf:forms (?P=id)\n",
    re.MULTILINE | re.DOTALL,
)


class FormsError(ValueError):
    pass


def load_mode(label: str) -> Optional[Tuple[str, Optional[str]]]:
    """(mode, preset stem) for a form load label; None for any other string."""
    for known, value in LOAD_LABELS:
        if label == known:
            return (value, None) if value in (AUTO, CUSTOM) else (PRESET, value)
    return None


def standalone(catalog: WorkflowCatalog) -> List[str]:
    """Workflows that need no earlier step: no required dataset."""
    return sorted(
        name for name, workflow in catalog.workflows.items()
        if workflow.data is None or not workflow.data.requires
    )


def links(catalog: WorkflowCatalog) -> Dict[str, List[str]]:
    """producer -> the consumers it writes a dataset for, each consumer once."""
    result: Dict[str, List[str]] = {}
    for name, workflow in catalog.workflows.items():
        if workflow.data is None:
            continue
        for product in workflow.data.produces:
            for target in product.targets:
                consumer = catalog.workflows[target].data
                if consumer is None:
                    continue
                if product.dataset in consumer.requires or product.dataset in consumer.optional:
                    if target not in result.setdefault(name, []):
                        result[name].append(target)
    return {name: sorted(consumers) for name, consumers in result.items()}


def paths(catalog: WorkflowCatalog, max_steps: int = MAX_STEPS) -> List[Tuple[str, ...]]:
    """Every acyclic link path of 2..max_steps workflows from a standalone workflow."""
    graph = links(catalog)
    found = set()

    def walk(path: Tuple[str, ...]) -> None:
        if len(path) >= 2:
            found.add(path)
        if len(path) == max_steps:
            return
        for consumer in graph.get(path[-1], []):
            if consumer not in path:
                walk(path + (consumer,))

    for start in standalone(catalog):
        walk((start,))
    return sorted(found)


def sequence_label(path: Sequence[str]) -> str:
    return SEQUENCE_SEPARATOR.join(path)


def recipes(
    catalog: WorkflowCatalog, options_dir: Path = PERF_OPTIONS_DIR
) -> Tuple[List[Tuple[str, ...]], List[str]]:
    """Paths that plan with every step on auto, and why any other path was left out."""
    kept: List[Tuple[str, ...]] = []
    dropped: List[str] = []
    for path in paths(catalog):
        plan = plan_chain([StepRequest(name) for name in path], catalog, options_dir)
        if plan.errors:
            dropped.append(f"{sequence_label(path)}: {'; '.join(plan.errors)}")
        else:
            kept.append(path)
    return kept, dropped


def option_blocks(
    catalog: WorkflowCatalog, options_dir: Path = PERF_OPTIONS_DIR
) -> Tuple[Dict[str, List[str]], List[str]]:
    kept, dropped = recipes(catalog, options_dir)
    blocks = {
        "workflows": standalone(catalog),
        "sequences": [sequence_label(path) for path in kept],
        "loads": [label for label, _ in LOAD_LABELS],
    }
    return blocks, dropped


def render(text: str, blocks: Dict[str, List[str]], source: str = "form") -> str:
    """`text` with every marked block's options replaced; the markers stay."""
    found: List[str] = []

    def replace(match: "re.Match[str]") -> str:
        block, indent = match.group("id"), match.group("indent")
        if block not in blocks:
            raise FormsError(f"{source}: unknown generated block {block!r}")
        found.append(block)
        # JSON strings are valid double-quoted YAML scalars.
        options = "".join(f"{indent}- {json.dumps(option)}\n" for option in blocks[block])
        return f"{indent}# BEGIN perf:forms {block}\n{options}{indent}# END perf:forms {block}\n"

    result = BLOCK.sub(replace, text)
    if not found:
        raise FormsError(f"{source}: no '# BEGIN perf:forms <id>' block")
    return result


def run(args: Sequence[str]) -> int:
    parser = argparse.ArgumentParser(
        prog="./dev perf:forms",
        description="Derive the GitHub perf forms' option lists from the workflow catalog.",
    )
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--write", action="store_true", help="Rewrite the generated option blocks.")
    mode.add_argument("--check", action="store_true", help="Fail when a block differs from the catalog.")
    parsed = parser.parse_args(list(args))
    stale: List[Path] = []
    try:
        blocks, dropped = option_blocks(load_catalog(PERF_WORKFLOWS_DIR))
        for path in FORM_FILES:
            text = path.read_text(encoding="utf-8")
            rendered = render(text, blocks, path.name)
            if rendered != text:
                stale.append(path)
                if parsed.write:
                    path.write_text(rendered, encoding="utf-8")
    except (CatalogError, WorkflowError, FormsError, OSError) as error:
        fail(f"Could not derive the perf forms: {error}")
        return 1
    for message in dropped:
        warn(f"Not offered (fails to plan on auto): {message}")
    names = ", ".join(path.name for path in stale)
    if parsed.check and stale:
        fail(f"{names} differ from the catalog; run ./dev perf:forms --write")
        return 1
    if parsed.write and stale:
        pass_(f"Rewrote {names}.")
    else:
        pass_("The perf forms match the catalog.")
    info(f"{len(blocks['workflows'])} standalone workflows, {len(blocks['sequences'])} recipes.")
    return 0
```

- [ ] **Step 4: Register the command** — in `scripts/pg/cli.py` add after `_perf_chain`:

```python
def _perf_forms(args: Sequence[str]) -> int:
    from pg import perf_forms
    return perf_forms.run(args)
```

and in `COMMANDS` after `"perf:chain": _perf_chain,`:

```python
    "perf:forms": _perf_forms,
```

In `_usage`, add after the `perf:chain --spec` line:

```python
    print("perf:forms --write|--check derives the perf-run/perf-chain GitHub form options from the catalog.")
```

- [ ] **Step 5: Run tests and ruff**

Run: `cd scripts && python3 -m unittest pg.tests.test_perf_forms -v && cd .. && ruff check scripts/pg`
Expected: PASS (10 tests); ruff clean. (`./dev perf:forms --check` fails until Task 6 creates the files — expected.)

- [ ] **Step 6: Commit**

```bash
git add scripts/pg/perf_forms.py scripts/pg/tests/test_perf_forms.py scripts/pg/cli.py
git commit -m "feat(perf): derive the GitHub form choices from the workflow catalog"
```

---

### Task 5: `./dev perf:dispatch`, the Actions boundary

**Files:**
- Create: `scripts/pg/perf_dispatch.py`
- Create: `scripts/pg/tests/test_perf_dispatch.py`
- Modify: `scripts/pg/cli.py` (register `perf:dispatch`)

**Interfaces:**
- Consumes: `perf_forms.standalone/recipes/sequence_label/load_mode/LOAD_LABELS/CUSTOM_LABEL`; `perf_spec.StepRequest/CUSTOM/SpecError/custom_config_path/write_spec`; `perf_chain.render_summary/annotate/CHAIN_REPORTS_DIR/BROWSER_SERVICE`.
- Produces (used by Task 6): `INPUTS` (the ten input names, in order), `env_name(input_name) -> str` (`load-1` → `PERF_LOAD_1`), `DISPATCH_DIR`, `STAGES = ("plan", "stack", "images", "execute")`, `normalize(request, catalog, options_dir=...) -> Tuple[List[StepRequest], List[str]]`, `dispatch(environ, dispatch_dir=DISPATCH_DIR, options_dir=PERF_OPTIONS_DIR) -> int`, `stage(name, dispatch_dir=DISPATCH_DIR) -> int`, `finalize(environ, dispatch_dir=DISPATCH_DIR, chain_dir=CHAIN_REPORTS_DIR) -> int`, `publish(environ, dispatch_dir=DISPATCH_DIR) -> int`, `run(args) -> int`. Environment read: `PERF_KIND`, `PERF_SELECTION`, `PERF_LOAD_<n>`, `PERF_CONFIG_<n>`, `PERF_RUNNER_LABEL`, `PERF_JOB_STATUS`, `PERF_ARTIFACT_URL`, `PERF_ARTIFACT_DIGEST`, `GITHUB_EVENT_NAME`, `GITHUB_REF`, `GITHUB_SHA`, `GITHUB_ACTOR`, `GITHUB_RUN_ID`, `GITHUB_RUN_ATTEMPT`, `GITHUB_OUTPUT`, `GITHUB_STEP_SUMMARY`.

- [ ] **Step 1: Write the failing tests** — create `scripts/pg/tests/test_perf_dispatch.py`:

```python
from __future__ import annotations

import json
import sys
import unittest
from io import StringIO
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from pg import cli, perf_dispatch  # noqa: E402
from pg.paths import PERF_WORKFLOWS_DIR  # noqa: E402
from pg.perf_chain import StepRecord, parse_steps, plan_chain, write_evidence  # noqa: E402
from pg.perf_dispatch import INPUTS, env_name, normalize  # noqa: E402
from pg.perf_spec import CUSTOM, PRESET, StepRequest, spec_document  # noqa: E402
from punch.catalog import load_catalog  # noqa: E402

CATALOG = load_catalog(PERF_WORKFLOWS_DIR)
AUTO_LABEL = "Auto (data-size producer; default otherwise)"


def request(kind: str, selection: str, *slots) -> dict:
    values = {name: "" for name in INPUTS}
    values.update(kind=kind, selection=selection)
    for number, (load, config) in enumerate(slots, start=1):
        values[f"load-{number}"], values[f"config-{number}"] = load, config
    return values


def environ(values: dict, **extra: str) -> dict:
    env = {env_name(name): value for name, value in values.items()}
    env.update(
        GITHUB_EVENT_NAME="workflow_dispatch", GITHUB_REF="refs/heads/main", GITHUB_SHA="abc123",
        GITHUB_ACTOR="octo", GITHUB_RUN_ID="42", GITHUB_RUN_ATTEMPT="1",
        PERF_RUNNER_LABEL="ubuntu-latest", SECRET_TOKEN="do-not-copy",
    )
    env.update(extra)
    return env


class NormalizeTests(unittest.TestCase):
    def test_env_names_are_upper_snake_case(self) -> None:
        self.assertEqual(env_name("load-1"), "PERF_LOAD_1")
        self.assertEqual(len(INPUTS), 10)

    def test_a_single_run_fills_only_the_first_slot(self) -> None:
        steps, errors = normalize(
            request("single", "http-purchase", ("1 journey", ""), ("garbage", "x.txt")), CATALOG
        )
        self.assertEqual(errors, [])
        self.assertEqual(steps, [StepRequest("http-purchase", PRESET, "1-iteration")])

    def test_a_single_run_of_a_consumer_names_its_producers(self) -> None:
        _steps, errors = normalize(request("single", "http-orders", ("1 journey", "")), CATALOG)
        self.assertEqual(
            errors,
            ["http-orders reads data an earlier step writes (carts from browser-cart or http-cart); "
             "run it from perf-chain.yml"],
        )

    def test_a_chain_translates_labels_into_the_spec_contract(self) -> None:
        steps, errors = normalize(
            request(
                "chain", "http-cart -> http-orders -> http-orders-status",
                (AUTO_LABEL, ""), ("5 users for 5 minutes", ""),
                ("Custom config", "custom/status-regression.json"), ("Custom config", ""),
            ),
            CATALOG,
        )
        self.assertEqual(errors, [])  # slot 4 is inactive: its empty custom path is ignored
        self.assertEqual(
            spec_document(steps)["steps"],
            [
                {"workflow": "http-cart", "load": {"mode": "auto"}},
                {"workflow": "http-orders", "load": {"mode": "preset", "value": "5-vu-5m"}},
                {"workflow": "http-orders-status",
                 "load": {"mode": "custom", "path": "custom/status-regression.json"}},
            ],
        )

    def test_an_unknown_or_stale_sequence_is_rejected(self) -> None:
        steps, errors = normalize(request("chain", "http-orders -> http-cart", (AUTO_LABEL, "")), CATALOG)
        self.assertEqual(steps, [])
        self.assertRegex(errors[0], r"^unknown or stale sequence 'http-orders -> http-cart'; use one of: ")

    def test_an_internal_load_value_or_a_recased_label_is_rejected_naming_the_labels(self) -> None:
        for label in ("5-vu-5m", "1 Journey", " 1 journey"):
            with self.subTest(label=label):
                _steps, errors = normalize(request("single", "http-purchase", (label, "")), CATALOG)
                self.assertEqual(len(errors), 1)
                self.assertIn(f"unknown load {label!r}", errors[0])
                self.assertIn("1 journey, 5 journeys", errors[0])

    def test_custom_path_rules_apply_to_active_slots(self) -> None:
        cases = {
            ("Custom config", ""): "needs a JSON path relative to",
            ("Custom config", "../workflows/http-cart.yaml"): "must not contain '..'",
            ("1 journey", "custom/status-regression.json"):
                "a custom config path was given with load '1 journey'",
        }
        for slot, message in cases.items():
            with self.subTest(slot=slot):
                _steps, errors = normalize(request("single", "http-purchase", slot), CATALOG)
                self.assertEqual(len(errors), 1)
                self.assertIn(message, errors[0])

    def test_an_unknown_kind_is_rejected(self) -> None:
        _steps, errors = normalize(request("graph", "http-purchase", ("1 journey", "")), CATALOG)
        self.assertEqual(errors, ["unknown kind 'graph'; use single or chain"])


class DispatchTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary_directory = TemporaryDirectory()
        self.root = Path(self.temporary_directory.name)
        self.dir = self.root / "dispatch"
        self.chain = self.root / "chain"
        self.output = self.root / "github-output"
        self.step_summary = self.root / "step-summary.md"
        self.out = patch("sys.stdout", StringIO())
        self.out.start()

    def tearDown(self) -> None:
        self.out.stop()
        self.temporary_directory.cleanup()

    def read(self, name: str) -> dict:
        return json.loads((self.dir / name).read_text(encoding="utf-8"))

    def test_a_valid_dispatch_writes_request_spec_record_and_outputs(self) -> None:
        values = request("chain", "browser-cart -> http-orders", (AUTO_LABEL, ""), ("1 journey", ""))
        code = perf_dispatch.dispatch(environ(values, GITHUB_OUTPUT=str(self.output)), self.dir)
        self.assertEqual(code, 0)
        self.assertEqual(self.read("request.json"), values)
        self.assertEqual(
            self.read("spec.json"),
            spec_document([StepRequest("browser-cart"), StepRequest("http-orders", PRESET, "1-iteration")]),
        )
        self.assertEqual((self.dir / "spec.json").stat().st_mode & 0o222, 0)
        record = self.read("dispatch.json")
        self.assertEqual(
            set(record),
            {"version", "event", "actor", "run", "artifact", "runner", "stage", "status", "errors", "problems"},
        )
        self.assertEqual(record["artifact"], "perf-42-1")
        self.assertEqual(record["event"], {"name": "workflow_dispatch", "ref": "refs/heads/main", "sha": "abc123"})
        self.assertEqual((record["stage"], record["status"]), ("normalize", None))
        self.assertEqual(self.output.read_text(encoding="utf-8"), "browser=true\n")
        for path in self.dir.iterdir():
            self.assertNotIn("do-not-copy", path.read_text(encoding="utf-8"))

    def test_a_rejected_dispatch_writes_no_spec_and_annotates(self) -> None:
        values = request("chain", "nope", (AUTO_LABEL, ""))
        env = environ(values, GITHUB_ACTIONS="true", GITHUB_OUTPUT=str(self.output))
        with patch.dict("os.environ", {"GITHUB_ACTIONS": "true"}):
            self.assertEqual(perf_dispatch.dispatch(env, self.dir), 1)
        self.assertFalse((self.dir / "spec.json").exists())
        self.assertRegex(self.read("dispatch.json")["errors"][0], r"^unknown or stale sequence 'nope'")
        self.assertIn("::error title=Punch dispatch::unknown or stale sequence", sys.stdout.getvalue())
        self.assertFalse(self.output.exists())

    def test_a_new_dispatch_never_keeps_an_earlier_spec(self) -> None:
        good = request("single", "http-purchase", ("1 journey", ""))
        self.assertEqual(perf_dispatch.dispatch(environ(good), self.dir), 0)
        (self.dir / "compose-logs.txt").write_text("old", encoding="utf-8")
        bad = request("single", "http-purchase", ("nope", ""))
        self.assertEqual(perf_dispatch.dispatch(environ(bad), self.dir), 1)
        self.assertEqual(sorted(p.name for p in self.dir.iterdir()), ["dispatch.json", "request.json"])

    def test_stage_records_how_far_the_job_got(self) -> None:
        perf_dispatch.dispatch(environ(request("single", "http-purchase", ("1 journey", ""))), self.dir)
        self.assertEqual(perf_dispatch.stage("stack", self.dir), 0)
        self.assertEqual(self.read("dispatch.json")["stage"], "stack")
        self.assertEqual(perf_dispatch.stage("teleport", self.dir), 1)

    # --- finalize -------------------------------------------------------------

    def chain_evidence(self, passed: bool, with_summary: bool = True) -> None:
        plan = plan_chain(parse_steps(["http-purchase"]), CATALOG)
        summary = self.root / "http-purchase-summary.json"
        if with_summary:
            summary.write_text("{}", encoding="utf-8")
        record = StepRecord(
            plan.steps[0], "passed" if passed else "failed", exit_code=0 if passed else 99,
            summary=str(summary), seconds=1.0,
        )
        write_evidence(plan, [record], self.chain)

    def finalize(self, job: str) -> int:
        env = environ(request("single", "http-purchase", ("1 journey", "")), PERF_JOB_STATUS=job)
        return perf_dispatch.finalize(env, self.dir, self.chain)

    def summary(self) -> str:
        return (self.dir / "summary.md").read_text(encoding="utf-8")

    def test_a_rejected_dispatch_finalizes_as_rejected(self) -> None:
        perf_dispatch.dispatch(environ(request("single", "nope", ("1 journey", ""))), self.dir)
        self.assertEqual(self.finalize("failure"), 0)
        self.assertEqual(self.read("dispatch.json")["status"], "rejected")
        self.assertTrue(self.summary().startswith("## Rejected: `nope`"))
        self.assertIn("unknown workflow 'nope'", self.summary())
        self.assertIn("> The app and k6 share one GitHub-hosted runner.", self.summary())

    def test_a_passed_chain_with_evidence_finalizes_as_passed(self) -> None:
        perf_dispatch.dispatch(environ(request("single", "http-purchase", ("1 journey", ""))), self.dir)
        self.chain_evidence(passed=True)
        self.assertEqual(self.finalize("success"), 0)
        self.assertEqual(self.read("dispatch.json")["status"], "passed")
        self.assertTrue(self.summary().startswith("## Passed: http-purchase"))
        self.assertIn("- Ref: `refs/heads/main` at `abc123`", self.summary())

    def test_a_passed_step_without_a_k6_summary_fails_the_job(self) -> None:
        perf_dispatch.dispatch(environ(request("single", "http-purchase", ("1 journey", ""))), self.dir)
        self.chain_evidence(passed=True, with_summary=False)
        self.assertEqual(self.finalize("success"), 1)
        record = self.read("dispatch.json")
        self.assertEqual(record["status"], "failed")
        self.assertEqual(record["problems"], ["step 1 http-purchase passed but left no k6 summary in the evidence"])
        self.assertTrue(self.summary().startswith("## Failed: http-purchase"))

    def test_a_cancelled_job_is_recorded_as_cancelled_without_evidence_errors(self) -> None:
        perf_dispatch.dispatch(environ(request("single", "http-purchase", ("1 journey", ""))), self.dir)
        perf_dispatch.stage("execute", self.dir)
        self.assertEqual(self.finalize("cancelled"), 0)
        record = self.read("dispatch.json")
        self.assertEqual((record["status"], record["problems"]), ("cancelled", []))
        # No chain.json yet, so the heading quotes the form's selection.
        self.assertTrue(self.summary().startswith("## Failed: `http-purchase`"))
        self.assertIn("- The run was cancelled.", self.summary())

    def test_a_stack_failure_after_planning_says_where_the_job_stopped(self) -> None:
        perf_dispatch.dispatch(environ(request("single", "http-purchase", ("1 journey", ""))), self.dir)
        write_evidence(plan_chain(parse_steps(["http-purchase"]), CATALOG), None, self.chain)
        perf_dispatch.stage("stack", self.dir)
        self.assertEqual(self.finalize("failure"), 0)
        self.assertEqual(self.read("dispatch.json")["status"], "failed")
        self.assertIn("- The job stopped at the stack stage before any step ran.", self.summary())

    def test_a_job_that_failed_before_dispatch_still_gets_a_record(self) -> None:
        self.assertEqual(self.finalize("failure"), 0)
        record = self.read("dispatch.json")
        self.assertEqual((record["stage"], record["status"]), ("setup", "failed"))

    # --- publish --------------------------------------------------------------

    def test_publish_appends_the_summary_and_artifact_link(self) -> None:
        perf_dispatch.dispatch(environ(request("single", "http-purchase", ("1 journey", ""))), self.dir)
        self.chain_evidence(passed=True)
        self.finalize("success")
        env = environ({}, GITHUB_STEP_SUMMARY=str(self.step_summary),
                      PERF_ARTIFACT_URL="https://github.com/o/r/actions/runs/42/artifacts/7",
                      PERF_ARTIFACT_DIGEST="deadbeef")
        self.assertEqual(perf_dispatch.publish(env, self.dir), 0)
        text = self.step_summary.read_text(encoding="utf-8")
        self.assertTrue(text.startswith("## Passed: http-purchase"))
        self.assertIn(
            "- Artifact: [perf-42-1](https://github.com/o/r/actions/runs/42/artifacts/7), SHA-256 `deadbeef`",
            text,
        )

    def test_publish_without_an_artifact_fails(self) -> None:
        env = environ({}, GITHUB_STEP_SUMMARY=str(self.step_summary))
        self.assertEqual(perf_dispatch.publish(env, self.dir), 1)
        self.assertIn("- Artifact: not uploaded", self.step_summary.read_text(encoding="utf-8"))

    def test_the_command_is_registered(self) -> None:
        self.assertIn("perf:dispatch", cli.COMMANDS)


class CustomStepTests(unittest.TestCase):
    def test_custom_requests_keep_the_form_path(self) -> None:
        steps, _ = normalize(
            request("single", "http-purchase", ("Custom config", "custom/status-regression.json")), CATALOG
        )
        self.assertEqual(steps, [StepRequest("http-purchase", CUSTOM, "custom/status-regression.json")])


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run to verify failure**

Run: `cd scripts && python3 -m unittest pg.tests.test_perf_dispatch -v`
Expected: FAIL — `No module named 'pg.perf_dispatch'`.

- [ ] **Step 3: Create `scripts/pg/perf_dispatch.py`**

```python
"""perf:dispatch — the GitHub Actions boundary of a Punch run (_perf-execute.yml).

    ./dev perf:dispatch               record the form values (PERF_*) and write spec.json
    ./dev perf:dispatch --stage NAME  record how far the job got (plan, stack, images, execute)
    ./dev perf:dispatch --finalize    set the final status and write the job summary
    ./dev perf:dispatch --publish     append the job summary and artifact link to GITHUB_STEP_SUMMARY

Form values arrive as environment variables, never as script text. The
normalizer re-derives the form choices from the catalog (pg.perf_forms), so a
stale form or an API dispatch cannot run what the catalog does not offer, and
translates the form's load labels into the versioned spec (pg.perf_spec) that
`perf:chain --spec` plans and then runs unchanged. Evidence lands in
tests/performance/k6/reports/dispatch/: request.json (the ten form values as
received), spec.json (written once, read-only), dispatch.json (run metadata,
stage, status), summary.md (the job summary), and Compose diagnostics when the
stack fails to start. No other environment value is copied.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
from pathlib import Path
from typing import Any, Dict, List, Mapping, Optional, Sequence, Tuple

from pg.ansi import fail, header, info, pass_
from pg.paths import PERF_OPTIONS_DIR, PERF_REPORTS_DIR, PERF_WORKFLOWS_DIR, REPO_ROOT
from pg.perf_chain import BROWSER_SERVICE, CHAIN_REPORTS_DIR, annotate, render_summary
from pg.perf_forms import CUSTOM_LABEL, LOAD_LABELS, load_mode, recipes, sequence_label, standalone
from pg.perf_spec import CUSTOM, MAX_STEPS, SpecError, StepRequest, custom_config_path, write_spec

# pg.paths initializes PUNCH_SRC before these public Punch imports.
from punch.catalog import CatalogError, WorkflowCatalog, load_catalog
from punch.workflow import WorkflowError

DISPATCH_DIR = PERF_REPORTS_DIR / "dispatch"
KINDS = ("single", "chain")
INPUTS: Tuple[str, ...] = (
    "kind",
    "selection",
    *[f"{field}-{number}" for number in range(1, MAX_STEPS + 1) for field in ("load", "config")],
)
STAGES = ("plan", "stack", "images", "execute")
TITLE = "Punch dispatch"


def env_name(input_name: str) -> str:
    """The environment variable that carries one _perf-execute.yml input."""
    return "PERF_" + input_name.upper().replace("-", "_")


def read_request(environ: Mapping[str, str]) -> Dict[str, str]:
    return {name: environ.get(env_name(name), "") for name in INPUTS}


# --- normalize ---------------------------------------------------------------


def _single(selection: str, catalog: WorkflowCatalog, errors: List[str]) -> List[str]:
    offered = standalone(catalog)
    if selection in offered:
        return [selection]
    workflow = catalog.workflows.get(selection)
    if workflow is not None and workflow.data is not None and workflow.data.requires:
        needs = "; ".join(
            f"{dataset} from {' or '.join(catalog.producers_of(dataset))}"
            for dataset in workflow.data.requires
        )
        errors.append(
            f"{selection} reads data an earlier step writes ({needs}); run it from perf-chain.yml"
        )
    else:
        errors.append(f"unknown workflow {selection!r}; use one of: {', '.join(offered)}")
    return []


def _chain(
    selection: str, catalog: WorkflowCatalog, options_dir: Path, errors: List[str]
) -> List[str]:
    kept, _dropped = recipes(catalog, options_dir)
    offered = {sequence_label(path): list(path) for path in kept}
    if selection in offered:
        return offered[selection]
    errors.append(f"unknown or stale sequence {selection!r}; use one of: {', '.join(offered)}")
    return []


def _step(
    number: int, workflow: str, label: str, path: str, options_dir: Path, errors: List[str]
) -> Optional[StepRequest]:
    where = f"step {number} {workflow}"
    mode = load_mode(label)
    if mode is None:
        labels = ", ".join(known for known, _ in LOAD_LABELS)
        errors.append(f"{where}: unknown load {label!r}; use one of: {labels}")
        return None
    kind, preset = mode
    if kind != CUSTOM:
        if path:
            errors.append(
                f"{where}: a custom config path was given with load {label!r}; "
                f"choose {CUSTOM_LABEL!r} or clear the path"
            )
            return None
        return StepRequest(workflow, kind, preset)
    try:
        custom_config_path(path, options_dir)
    except SpecError as error:
        errors.append(f"{where}: {error}")
        return None
    return StepRequest(workflow, CUSTOM, path)


def normalize(
    request: Mapping[str, str], catalog: WorkflowCatalog, options_dir: Path = PERF_OPTIONS_DIR
) -> Tuple[List[StepRequest], List[str]]:
    """The step requests a form submission asks for, or the reasons it cannot run.
    Slots past the selected workflow or sequence are inactive and ignored."""
    errors: List[str] = []
    kind, selection = request.get("kind", ""), request.get("selection", "")
    if kind == "single":
        names = _single(selection, catalog, errors)
    elif kind == "chain":
        names = _chain(selection, catalog, options_dir, errors)
    else:
        errors.append(f"unknown kind {kind!r}; use {' or '.join(KINDS)}")
        names = []
    steps: List[StepRequest] = []
    for number, name in enumerate(names, start=1):
        step = _step(
            number, name, request.get(f"load-{number}", ""), request.get(f"config-{number}", ""),
            options_dir, errors,
        )
        if step is not None:
            steps.append(step)
    return ([] if errors else steps), errors


# --- records -----------------------------------------------------------------


def _read_json(path: Path) -> Optional[Dict[str, Any]]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    return value if isinstance(value, dict) else None


def _write_json(path: Path, value: Any) -> None:
    path.write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")


def _metadata(environ: Mapping[str, str], stage_name: str) -> Dict[str, Any]:
    run_id, attempt = environ.get("GITHUB_RUN_ID"), environ.get("GITHUB_RUN_ATTEMPT")
    return {
        "version": 1,
        "event": {
            "name": environ.get("GITHUB_EVENT_NAME"),
            "ref": environ.get("GITHUB_REF"),
            "sha": environ.get("GITHUB_SHA"),
        },
        "actor": environ.get("GITHUB_ACTOR"),
        "run": {"id": run_id, "attempt": attempt},
        "artifact": f"perf-{run_id}-{attempt}" if run_id and attempt else None,
        "runner": environ.get("PERF_RUNNER_LABEL"),
        "stage": stage_name,
        "status": None,
        "errors": [],
        "problems": [],
    }


def _output(environ: Mapping[str, str], **values: bool) -> None:
    """Bounded booleans for later workflow steps (GITHUB_OUTPUT)."""
    target = environ.get("GITHUB_OUTPUT")
    if not target:
        return
    with open(target, "a", encoding="utf-8") as handle:
        for key, value in values.items():
            handle.write(f"{key}={'true' if value else 'false'}\n")


def dispatch(
    environ: Mapping[str, str],
    dispatch_dir: Path = DISPATCH_DIR,
    options_dir: Path = PERF_OPTIONS_DIR,
) -> int:
    """Start a fresh dispatch record, keep the form values, and write spec.json."""
    shutil.rmtree(dispatch_dir, ignore_errors=True)
    dispatch_dir.mkdir(parents=True)
    record = _metadata(environ, "normalize")
    _write_json(dispatch_dir / "dispatch.json", record)
    request = read_request(environ)
    _write_json(dispatch_dir / "request.json", request)
    try:
        catalog = load_catalog(PERF_WORKFLOWS_DIR)
        steps, errors = normalize(request, catalog, options_dir)
    except (CatalogError, WorkflowError) as error:
        steps, errors = [], [f"could not load the workflow catalog: {error}"]
    if errors:
        record["errors"] = errors
        _write_json(dispatch_dir / "dispatch.json", record)
        header("Punch dispatch rejected")
        for message in errors:
            fail(message)
        annotate(errors, [], TITLE)
        return 1
    write_spec(dispatch_dir / "spec.json", steps)
    browser = any(catalog.workflows[step.workflow].compose_service == BROWSER_SERVICE for step in steps)
    _output(environ, browser=browser)
    header("Punch dispatch")
    for number, step in enumerate(steps, start=1):
        info(f"step {number}  {step.workflow}  {json.dumps(step.to_json()['load'])}")
    pass_(f"Wrote {dispatch_dir / 'spec.json'}")
    return 0


def stage(name: str, dispatch_dir: Path = DISPATCH_DIR) -> int:
    if name not in STAGES:
        fail(f"unknown stage {name!r}; use one of: {', '.join(STAGES)}")
        return 1
    path = dispatch_dir / "dispatch.json"
    record = _read_json(path)
    if record is None:
        fail(f"{path} is missing; run ./dev perf:dispatch first")
        return 1
    record["stage"] = name
    _write_json(path, record)
    return 0


# --- finalize and publish ----------------------------------------------------


def _evidence_path(raw: str) -> Path:
    path = Path(raw)
    return path if path.is_absolute() else REPO_ROOT / path


def _missing_evidence(chain: Dict[str, Any]) -> List[str]:
    problems = []
    for step in chain.get("steps", []):
        if step.get("status") != "passed":
            continue
        summary = step.get("summary")
        if not summary or not _evidence_path(summary).is_file():
            problems.append(
                f"step {step['step']} {step['workflow']} passed but left no k6 summary in the evidence"
            )
    return problems


def _status(record: Dict[str, Any], chain: Optional[Dict[str, Any]], job: str) -> Tuple[str, List[str]]:
    if record.get("errors") or (chain is not None and chain.get("errors")):
        return "rejected", []
    if job == "cancelled":
        return "cancelled", []
    if chain is None or chain.get("passed") is not True:
        return "failed", []
    problems = _missing_evidence(chain)
    return ("failed" if problems or job != "success" else "passed"), problems


def _selection(request: Mapping[str, str]) -> str:
    raw = (request.get("selection") or "no selection").replace("`", "")[:120]
    return f"`{raw}`"


def _job_summary(
    record: Dict[str, Any], request: Mapping[str, str], chain: Optional[Dict[str, Any]], status: str
) -> str:
    notes: List[str] = list(record.get("problems") or [])
    if status == "cancelled":
        notes.insert(0, "The run was cancelled.")
    elif status == "failed" and (chain is None or chain.get("passed") is None):
        notes.append(f"The job stopped at the {record.get('stage')} stage before any step ran.")
    evidence = chain or {
        "outcome": "rejected",
        "sequence": [_selection(request)],
        "steps": [],
        "errors": record.get("errors") or [],
        "warnings": [],
    }
    outcome = status if status in ("passed", "rejected") else "failed"
    text = render_summary(evidence, outcome=outcome, notes=notes, runner_warning=True)
    event = record.get("event") or {}
    return (
        text
        + f"- Ref: `{event.get('ref')}` at `{event.get('sha')}`\n"
        + f"- Actor: @{record.get('actor')}\n"
        + f"- Stage reached: {record.get('stage')}\n"
    )


def finalize(
    environ: Mapping[str, str],
    dispatch_dir: Path = DISPATCH_DIR,
    chain_dir: Path = CHAIN_REPORTS_DIR,
) -> int:
    """Set dispatch.json's final status and write summary.md. Exits 1 only when the
    job would otherwise pass without evidence; an already failed job stays failed."""
    dispatch_dir.mkdir(parents=True, exist_ok=True)
    path = dispatch_dir / "dispatch.json"
    record = _read_json(path) or _metadata(environ, "setup")
    request = _read_json(dispatch_dir / "request.json") or read_request(environ)
    chain = _read_json(chain_dir / "chain.json")
    job = environ.get("PERF_JOB_STATUS", "success")
    status, problems = _status(record, chain, job)
    record.update(status=status, problems=problems)
    _write_json(path, record)
    (dispatch_dir / "summary.md").write_text(
        _job_summary(record, request, chain, status), encoding="utf-8"
    )
    for problem in problems:
        fail(problem)
    annotate(problems, [], TITLE)
    info(f"Punch run {status}; stage reached: {record.get('stage')}")
    return 1 if status != "passed" and job == "success" else 0


def publish(environ: Mapping[str, str], dispatch_dir: Path = DISPATCH_DIR) -> int:
    """Append the job summary and the uploaded artifact's link and digest."""
    record = _read_json(dispatch_dir / "dispatch.json") or {}
    summary = dispatch_dir / "summary.md"
    text = summary.read_text(encoding="utf-8") if summary.is_file() else "## Failed: no job summary was written\n\n"
    url, digest = environ.get("PERF_ARTIFACT_URL", ""), environ.get("PERF_ARTIFACT_DIGEST", "")
    if url:
        text += f"- Artifact: [{record.get('artifact') or 'evidence'}]({url}), SHA-256 `{digest}`\n"
    else:
        text += "- Artifact: not uploaded; the job log is the only evidence\n"
    target = environ.get("GITHUB_STEP_SUMMARY")
    if target:
        with open(target, "a", encoding="utf-8") as handle:
            handle.write(text)
    else:
        print(text)
    if not url:
        fail("The evidence artifact was not uploaded.")
        return 1
    return 0


def run(args: Sequence[str]) -> int:
    parser = argparse.ArgumentParser(
        prog="./dev perf:dispatch",
        description="The GitHub Actions boundary of a Punch run (.github/workflows/_perf-execute.yml).",
    )
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--stage", choices=STAGES, help="Record the stage the job reached.")
    mode.add_argument("--finalize", action="store_true", help="Set the final status; write the job summary.")
    mode.add_argument("--publish", action="store_true", help="Append the job summary and artifact link.")
    parsed = parser.parse_args(list(args))
    if parsed.stage:
        return stage(parsed.stage)
    if parsed.finalize:
        return finalize(os.environ)
    if parsed.publish:
        return publish(os.environ)
    return dispatch(os.environ)
```

Notes for the implementer:
- `annotate` reads `os.environ["GITHUB_ACTIONS"]` itself (not `environ`), so the rejection test patches `os.environ`.
- The `--stage` argparse `choices` rejects unknown names with exit 2 before `stage()`; `stage()` keeps its own check for direct callers.
- The rejected-dispatch heading wraps the selection in backticks and truncates it to 120 characters; form text never reaches the summary unquoted.

- [ ] **Step 4: Register the command** — in `scripts/pg/cli.py` add after `_perf_forms`:

```python
def _perf_dispatch(args: Sequence[str]) -> int:
    from pg import perf_dispatch
    return perf_dispatch.run(args)
```

and in `COMMANDS` after `"perf:forms": _perf_forms,`:

```python
    "perf:dispatch": _perf_dispatch,
```

- [ ] **Step 5: Run the suite and ruff**

Run: `cd scripts && python3 -m unittest discover -s pg/tests -p 'test_*.py' 2>&1 | tail -3 && cd .. && ruff check scripts/pg`
Expected: all pass; ruff clean.

- [ ] **Step 6: Commit**

```bash
git add scripts/pg/perf_dispatch.py scripts/pg/tests/test_perf_dispatch.py scripts/pg/cli.py
git commit -m "feat(perf): normalize GitHub form values into a spec and record the run"
```

---

### Task 6: The three GitHub workflows

**Files:**
- Create: `.github/workflows/perf-run.yml`, `.github/workflows/perf-chain.yml`, `.github/workflows/_perf-execute.yml`
- Delete: `.github/workflows/perf.yml`
- Create: `scripts/pg/tests/test_perf_github_workflows.py`
- Modify: `scripts/pg/tests/test_perf_chain.py` (delete `DispatchFormTests` and the now-unused `yaml`/`REPO_ROOT` imports if ruff flags them)

**Interfaces:**
- Consumes: `perf_forms.FORM_FILES/option_blocks/render/recipes/sequence_label/standalone/LOAD_LABELS`; `perf_dispatch.INPUTS/env_name`.
- Produces: the forms users dispatch; the reusable job contract.

- [ ] **Step 1: Write the failing contract tests** — create `scripts/pg/tests/test_perf_github_workflows.py`:

```python
from __future__ import annotations

import sys
import unittest
from pathlib import Path

import yaml

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from pg.paths import PERF_WORKFLOWS_DIR, REPO_ROOT  # noqa: E402
from pg.perf_dispatch import INPUTS, env_name  # noqa: E402
from pg.perf_forms import (  # noqa: E402
    FORM_FILES,
    LOAD_LABELS,
    option_blocks,
    recipes,
    render,
    sequence_label,
    standalone,
)
from punch.catalog import load_catalog  # noqa: E402

CATALOG = load_catalog(PERF_WORKFLOWS_DIR)
WORKFLOWS = REPO_ROOT / ".github" / "workflows"
EXECUTE = "./.github/workflows/_perf-execute.yml"
LABELS = [label for label, _ in LOAD_LABELS]
AUTO_LABEL = LABELS[0]


def load(name: str) -> dict:
    return yaml.safe_load((WORKFLOWS / name).read_text(encoding="utf-8"))


def expression(name: str) -> str:
    return "${{ " + name + " }}"


class FormTests(unittest.TestCase):
    def test_the_old_form_is_gone(self) -> None:
        self.assertFalse((WORKFLOWS / "perf.yml").exists())

    def test_committed_forms_match_the_catalog(self) -> None:
        blocks, _ = option_blocks(CATALOG)
        for path in FORM_FILES:
            with self.subTest(path=path.name):
                text = path.read_text(encoding="utf-8")
                self.assertEqual(render(text, blocks, path.name), text, "run ./dev perf:forms --write")

    def test_the_single_form_offers_standalone_workflows_and_every_load(self) -> None:
        form = load("perf-run.yml")
        # PyYAML reads the bare `on` key as the boolean True.
        self.assertEqual(list(form[True]), ["workflow_dispatch"])
        inputs = form[True]["workflow_dispatch"]["inputs"]
        self.assertEqual(list(inputs), ["workflow", "load", "config"])
        self.assertEqual(inputs["workflow"]["options"], standalone(CATALOG))
        self.assertIn(inputs["workflow"]["default"], inputs["workflow"]["options"])
        self.assertEqual(inputs["load"]["options"], LABELS)
        self.assertEqual(inputs["load"]["default"], "1 journey")
        self.assertEqual(inputs["config"]["type"], "string")
        self.assertIn("github.actor", form["run-name"])
        self.assertIn("inputs.workflow", form["run-name"])
        self.assertEqual(form["permissions"], {"contents": "read"})
        job = form["jobs"]["run"]
        self.assertEqual(job["uses"], EXECUTE)
        self.assertEqual(job["with"], {
            "kind": "single",
            "selection": expression("inputs.workflow"),
            "load-1": expression("inputs.load"),
            "config-1": expression("inputs.config"),
        })

    def test_the_chain_form_offers_recipes_and_four_step_slots(self) -> None:
        form = load("perf-chain.yml")
        self.assertEqual(list(form[True]), ["workflow_dispatch"])
        inputs = form[True]["workflow_dispatch"]["inputs"]
        slots = [f"step{n}-{field}" for n in range(1, 5) for field in ("load", "config")]
        self.assertEqual(list(inputs), ["sequence", *slots])
        kept, _ = recipes(CATALOG)
        self.assertEqual(inputs["sequence"]["options"], [sequence_label(path) for path in kept])
        self.assertIn(inputs["sequence"]["default"], inputs["sequence"]["options"])
        for n in range(1, 5):
            with self.subTest(step=n):
                self.assertEqual(inputs[f"step{n}-load"]["options"], LABELS)
                self.assertEqual(inputs[f"step{n}-load"]["default"], AUTO_LABEL)
                self.assertEqual(inputs[f"step{n}-config"]["type"], "string")
        self.assertIn("github.actor", form["run-name"])
        self.assertIn("inputs.sequence", form["run-name"])
        job = form["jobs"]["run"]
        self.assertEqual(job["uses"], EXECUTE)
        expected = {"kind": "chain", "selection": expression("inputs.sequence")}
        for n in range(1, 5):
            expected[f"load-{n}"] = expression(f"inputs.step{n}-load")
            expected[f"config-{n}"] = expression(f"inputs.step{n}-config")
        self.assertEqual(job["with"], expected)


class ExecuteTests(unittest.TestCase):
    def setUp(self) -> None:
        self.workflow = load("_perf-execute.yml")
        self.job = self.workflow["jobs"]["execute"]
        self.steps = self.job["steps"]

    def step(self, name: str) -> dict:
        return next(step for step in self.steps if step.get("name") == name)

    def index(self, name: str) -> int:
        return self.steps.index(self.step(name))

    def test_it_is_callable_only_with_the_ten_string_inputs(self) -> None:
        self.assertEqual(list(self.workflow[True]), ["workflow_call"])
        inputs = self.workflow[True]["workflow_call"]["inputs"]
        self.assertEqual(list(inputs), list(INPUTS))
        for name, spec in inputs.items():
            with self.subTest(input=name):
                self.assertEqual(spec["type"], "string")
        self.assertTrue(inputs["kind"]["required"])
        self.assertTrue(inputs["selection"]["required"])

    def test_one_read_only_job_bounded_to_an_hour(self) -> None:
        self.assertEqual(list(self.workflow["jobs"]), ["execute"])
        self.assertEqual(self.workflow["permissions"], {"contents": "read"})
        self.assertEqual(self.job["permissions"], {"contents": "read"})
        self.assertEqual(self.job["timeout-minutes"], 60)
        self.assertEqual(self.job["runs-on"], "ubuntu-latest")
        self.assertEqual(self.workflow["defaults"], {"run": {"shell": "bash"}})

    def test_checkout_and_python_setup(self) -> None:
        self.assertEqual(self.steps[0], {"uses": "actions/checkout@v4", "with": {"submodules": "recursive"}})
        self.assertEqual(self.steps[1], {"uses": "actions/setup-python@v5", "with": {
            "python-version": "3.11", "cache": "pip",
            "cache-dependency-path": "vendor/punch/requirements.txt",
        }})

    def test_form_values_reach_the_dispatcher_only_as_environment_data(self) -> None:
        step = self.step("Normalize the form values")
        self.assertEqual(step["run"], "./dev perf:dispatch")
        for name in INPUTS:
            self.assertEqual(step["env"][env_name(name)], expression(f"inputs.{name}"))
        for each in self.steps:
            with self.subTest(step=each.get("name")):
                self.assertNotIn("${{", each.get("run", ""), "inputs must reach run: through env")
                self.assertNotIn("eval", each.get("run", ""))

    def test_the_plan_runs_before_the_stack_and_execution_runs_the_same_spec(self) -> None:
        order = [
            "Normalize the form values", "Plan the run", "Start the stack",
            "Build the k6 images", "Let k6 write its reports", "Run the plan",
        ]
        self.assertEqual([self.index(name) for name in order], sorted(self.index(name) for name in order))
        self.assertIn('./dev perf:chain --spec "$SPEC" --plan', self.step("Plan the run")["run"])
        self.assertIn('./dev perf:chain --spec "$SPEC"\n', self.step("Run the plan")["run"] + "\n")
        self.assertEqual(self.job["env"]["SPEC"], "tests/performance/k6/reports/dispatch/spec.json")
        self.assertIn("compose.performance.yaml build", self.step("Build the k6 images")["run"])
        self.assertEqual(self.step("Let k6 write its reports")["run"], "chmod a+w tests/performance/k6/reports")

    def test_stack_failure_keeps_compose_diagnostics(self) -> None:
        run = self.step("Start the stack")["run"]
        self.assertIn('"$DISPATCH_DIR/compose-ps.txt"', run)
        self.assertIn("logs --tail=200", run)
        self.assertIn('"$DISPATCH_DIR/compose-logs.txt"', run)

    def test_evidence_steps_always_run_and_upload_once(self) -> None:
        order = ["Finalize the dispatch record", "Upload evidence", "Job summary", "Tear down the stack"]
        indexes = [self.index(name) for name in order]
        self.assertEqual(indexes, sorted(indexes))
        self.assertEqual(indexes[-1], len(self.steps) - 1)
        for name in order:
            self.assertEqual(self.step(name)["if"], "always()")
        uploads = [s for s in self.steps if s.get("uses", "").startswith("actions/upload-artifact")]
        self.assertEqual(len(uploads), 1)
        self.assertEqual(uploads[0]["uses"], "actions/upload-artifact@v4")
        self.assertEqual(uploads[0]["with"], {
            "name": "perf-${{ github.run_id }}-${{ github.run_attempt }}",
            "path": "tests/performance/k6/reports/",
            "if-no-files-found": "error",
        })
        self.assertEqual(self.step("Finalize the dispatch record")["env"], {"PERF_JOB_STATUS": "${{ job.status }}"})
        self.assertEqual(self.step("Job summary")["env"], {
            "PERF_ARTIFACT_URL": "${{ steps.upload.outputs.artifact-url }}",
            "PERF_ARTIFACT_DIGEST": "${{ steps.upload.outputs.artifact-digest }}",
        })
        self.assertIn("::warning", self.step("Tear down the stack")["run"])


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run to verify failure**

Run: `cd scripts && python3 -m unittest pg.tests.test_perf_github_workflows -v`
Expected: FAIL — `perf.yml` exists; the new files do not.

- [ ] **Step 3: Create `.github/workflows/_perf-execute.yml`**

```yaml
name: Punch performance — execute

# Shared by perf-run.yml and perf-chain.yml; callable only through
# workflow_call. Normalizes the form values into spec.json, plans it before
# Docker, starts the stack on this runner, runs exactly that spec, and uploads
# one artifact of evidence:
# docs/performance/orchestrator.md#github-actions-perf-run-and-perf-chain.
# scripts/pg/tests/test_perf_github_workflows.py pins this contract.

on:
  workflow_call:
    inputs:
      kind:
        description: single or chain
        type: string
        required: true
      selection:
        description: The workflow (single) or sequence label (chain)
        type: string
        required: true
      load-1:
        type: string
        required: false
        default: ""
      config-1:
        type: string
        required: false
        default: ""
      load-2:
        type: string
        required: false
        default: ""
      config-2:
        type: string
        required: false
        default: ""
      load-3:
        type: string
        required: false
        default: ""
      config-3:
        type: string
        required: false
        default: ""
      load-4:
        type: string
        required: false
        default: ""
      config-4:
        type: string
        required: false
        default: ""

permissions:
  contents: read

defaults:
  run:
    shell: bash

jobs:
  execute:
    name: Punch
    runs-on: ubuntu-latest
    timeout-minutes: 60
    permissions:
      contents: read
    env:
      DISPATCH_DIR: tests/performance/k6/reports/dispatch
      SPEC: tests/performance/k6/reports/dispatch/spec.json
    steps:
      - uses: actions/checkout@v4
        with:
          submodules: recursive
      - uses: actions/setup-python@v5
        with:
          python-version: "3.11"
          cache: pip
          cache-dependency-path: vendor/punch/requirements.txt
      - name: Install Punch dependencies
        run: python -m pip install --quiet -r vendor/punch/requirements.txt
      - name: Normalize the form values
        id: dispatch
        env:
          # Form values reach Python as data, never as script text.
          PERF_KIND: ${{ inputs.kind }}
          PERF_SELECTION: ${{ inputs.selection }}
          PERF_LOAD_1: ${{ inputs.load-1 }}
          PERF_CONFIG_1: ${{ inputs.config-1 }}
          PERF_LOAD_2: ${{ inputs.load-2 }}
          PERF_CONFIG_2: ${{ inputs.config-2 }}
          PERF_LOAD_3: ${{ inputs.load-3 }}
          PERF_CONFIG_3: ${{ inputs.config-3 }}
          PERF_LOAD_4: ${{ inputs.load-4 }}
          PERF_CONFIG_4: ${{ inputs.config-4 }}
          PERF_RUNNER_LABEL: ubuntu-latest
        run: ./dev perf:dispatch
      - name: Plan the run
        # Fails in seconds, before the stack starts, on an impossible run.
        run: |
          ./dev perf:dispatch --stage plan
          ./dev perf:chain --spec "$SPEC" --plan
      - name: Start the stack
        env:
          TARGET: ${{ steps.dispatch.outputs.browser == 'true' && 'web' || '' }}
        run: |
          ./dev perf:dispatch --stage stack
          ./dev up ${TARGET:+"$TARGET"} || {
            echo "::error title=Punch stack::./dev up failed; Compose diagnostics are in the artifact"
            docker compose -f infra/docker/compose.yaml ps 2>&1 | tee "$DISPATCH_DIR/compose-ps.txt"
            docker compose -f infra/docker/compose.yaml logs --tail=200 2>&1 | tee "$DISPATCH_DIR/compose-logs.txt"
            exit 1
          }
      - name: Build the k6 images
        # Rebuilt every run, so k6 never runs scenarios baked into an older image.
        env:
          SERVICES: ${{ steps.dispatch.outputs.browser == 'true' && 'k6 k6-browser' || 'k6' }}
        run: |
          ./dev perf:dispatch --stage images
          read -ra services <<< "$SERVICES"
          docker compose -f infra/docker/compose.performance.yaml build "${services[@]}" 2>&1 | tee "$DISPATCH_DIR/k6-build.log"
      - name: Let k6 write its reports
        # k6 runs as uid 12345 in its container; the checkout belongs to the
        # runner user, so handleSummary() could not write here.
        run: chmod a+w tests/performance/k6/reports
      - name: Run the plan
        run: |
          ./dev perf:dispatch --stage execute
          ./dev perf:chain --spec "$SPEC"
      - name: Finalize the dispatch record
        if: always()
        env:
          PERF_JOB_STATUS: ${{ job.status }}
        run: ./dev perf:dispatch --finalize
      - name: Upload evidence
        id: upload
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: perf-${{ github.run_id }}-${{ github.run_attempt }}
          path: tests/performance/k6/reports/
          if-no-files-found: error
      - name: Job summary
        # The artifact URL and digest exist only after the upload, so they go
        # in the job summary, not inside the artifact.
        if: always()
        env:
          PERF_ARTIFACT_URL: ${{ steps.upload.outputs.artifact-url }}
          PERF_ARTIFACT_DIGEST: ${{ steps.upload.outputs.artifact-digest }}
        run: ./dev perf:dispatch --publish
      - name: Tear down the stack
        if: always()
        run: ./dev down || echo "::warning title=Punch teardown::./dev down failed; the run's result stands"
```

- [ ] **Step 4: Create `.github/workflows/perf-run.yml`** (blocks filled by Step 6; write them empty)

```yaml
name: Punch performance — single

# Run one Punch workflow that reads no earlier step's data, against the
# Expresso stack on this runner. ./dev perf:forms --write generates the marked
# option blocks from the workflow catalog; _perf-execute.yml validates, runs,
# and records the run:
# docs/performance/orchestrator.md#github-actions-perf-run-and-perf-chain.

run-name: "perf-run: ${{ inputs.workflow }} (${{ inputs.load }}) by @${{ github.actor }}"

on:
  workflow_dispatch:
    inputs:
      workflow:
        description: Workflow
        type: choice
        default: http-purchase
        options:
          # BEGIN perf:forms workflows
          # END perf:forms workflows
      load:
        description: Load (browser workflows run the -browser preset and refuse the 5-minute loads)
        type: choice
        default: 1 journey
        options:
          # BEGIN perf:forms loads
          # END perf:forms loads
      config:
        description: Custom config, a JSON path relative to tests/performance/k6/options/ (only with Custom config)
        type: string
        required: false
        default: ""

permissions:
  contents: read

jobs:
  run:
    name: Punch run
    uses: ./.github/workflows/_perf-execute.yml
    with:
      kind: single
      selection: ${{ inputs.workflow }}
      load-1: ${{ inputs.load }}
      config-1: ${{ inputs.config }}
```

- [ ] **Step 5: Create `.github/workflows/perf-chain.yml`**

```yaml
name: Punch performance — chain

# Run one producer/consumer recipe against the Expresso stack on this runner;
# each step reads the datasets earlier steps wrote. The sequence list holds only
# recipes the catalog links and perf:chain plans: ./dev perf:forms --write
# generates the marked option blocks. Steps past the sequence's last workflow
# are ignored. _perf-execute.yml validates, runs, and records the run:
# docs/performance/orchestrator.md#github-actions-perf-run-and-perf-chain.

run-name: "perf-chain: ${{ inputs.sequence }} by @${{ github.actor }}"

on:
  workflow_dispatch:
    inputs:
      sequence:
        description: Sequence
        type: choice
        default: http-cart -> http-orders
        options:
          # BEGIN perf:forms sequences
          # END perf:forms sequences
      step1-load:
        description: Step 1 load (Auto sizes a producer for the step that reads its data; browser steps refuse the 5-minute loads)
        type: choice
        default: Auto (data-size producer; default otherwise)
        options:
          # BEGIN perf:forms loads
          # END perf:forms loads
      step1-config:
        description: Step 1 custom config (path relative to tests/performance/k6/options/)
        type: string
        required: false
        default: ""
      step2-load:
        description: Step 2 load
        type: choice
        default: Auto (data-size producer; default otherwise)
        options:
          # BEGIN perf:forms loads
          # END perf:forms loads
      step2-config:
        description: Step 2 custom config
        type: string
        required: false
        default: ""
      step3-load:
        description: Step 3 load (ignored for two-step sequences)
        type: choice
        default: Auto (data-size producer; default otherwise)
        options:
          # BEGIN perf:forms loads
          # END perf:forms loads
      step3-config:
        description: Step 3 custom config
        type: string
        required: false
        default: ""
      step4-load:
        description: Step 4 load (ignored unless the sequence has four steps)
        type: choice
        default: Auto (data-size producer; default otherwise)
        options:
          # BEGIN perf:forms loads
          # END perf:forms loads
      step4-config:
        description: Step 4 custom config
        type: string
        required: false
        default: ""

permissions:
  contents: read

jobs:
  run:
    name: Punch chain
    uses: ./.github/workflows/_perf-execute.yml
    with:
      kind: chain
      selection: ${{ inputs.sequence }}
      load-1: ${{ inputs.step1-load }}
      config-1: ${{ inputs.step1-config }}
      load-2: ${{ inputs.step2-load }}
      config-2: ${{ inputs.step2-config }}
      load-3: ${{ inputs.step3-load }}
      config-3: ${{ inputs.step3-config }}
      load-4: ${{ inputs.step4-load }}
      config-4: ${{ inputs.step4-config }}
```

- [ ] **Step 6: Generate the option blocks, delete the old form, remove the old tests**

```bash
./dev perf:forms --write
./dev perf:forms --check
git rm .github/workflows/perf.yml
```

Expected: `--write` reports `Rewrote perf-run.yml, perf-chain.yml.`; `--check` reports `The perf forms match the catalog.` and `6 standalone workflows, 9 recipes.`

Delete the `DispatchFormTests` class from `scripts/pg/tests/test_perf_chain.py`; remove `import yaml` and `REPO_ROOT` from its imports if nothing else uses them.

Inspect `git diff .github/workflows/perf-run.yml`: each block holds quoted options such as `- "browser-cart"` and `- "1 journey"`.

- [ ] **Step 7: Run the suite, ruff, and Prettier on the YAML**

Run: `cd scripts && python3 -m unittest discover -s pg/tests -p 'test_*.py' 2>&1 | tail -3 && cd .. && ruff check scripts/pg && npx --no-install prettier --check .github/workflows/perf-run.yml .github/workflows/perf-chain.yml .github/workflows/_perf-execute.yml`
Expected: all pass. If Prettier reports style differences, run `npx --no-install prettier --write` on the three files, then `./dev perf:forms --check` again (must still match; if Prettier rewrote quoting inside a block, adjust `render` to emit the same style and its test).

- [ ] **Step 8: Lint the workflows with actionlint**

Run: `actionlint .github/workflows/*.yml` if installed; otherwise `docker run --rm -v "$PWD:/repo" -w /repo rhysd/actionlint:1.7.7 -color .github/workflows/*.yml`.
Expected: no errors. (shellcheck findings inside `run:` must be fixed or justified inline.)

- [ ] **Step 9: Commit**

```bash
git add .github/workflows/perf-run.yml .github/workflows/perf-chain.yml .github/workflows/_perf-execute.yml scripts/pg/tests/test_perf_github_workflows.py scripts/pg/tests/test_perf_chain.py
git commit -m "feat(ci): replace the perf form with perf-run and perf-chain over one reusable job"
```

---

### Task 7: Documentation

Load the `technical-writing` skill first.

**Files:**
- Modify: `docs/performance/orchestrator.md` (chain paragraph at lines 187–191; new section after the chain section, before `## Summary output and Docker Compose confirmation`)
- Modify: `docs/cli-reference.md` (line 5 count, `./dev` table rows after `perf:chain`, line 58 count, line 68 paragraph, flags table `--spec` row)
- Modify: `tests/performance/k6/README.md` (lines 268–269, reports layout block)
- Modify: `CLAUDE.md` (line 124)
- Modify: `docs/next-steps/perf-run-ux.md` (status paragraph, "What is built" GitHub row)

**Interfaces:** none (prose). The test `test_perf_ci_docs_contract.py` must still pass: keep `[DATA`, `spec.data`, `atomic`, `not current-run evidence`, `execution result`, `evidence record` in `orchestrator.md` and the k6 README.

- [ ] **Step 1: `docs/performance/orchestrator.md`** — replace lines 187–191

```markdown
`./dev perf:chain` runs workflows in order as one command; each step reads the
datasets that earlier steps wrote. The `perf` GitHub workflow
(`.github/workflows/perf.yml`) runs the same command on demand against the
stack on its runner, with up to four steps picked in the Actions form. CI's
`perf-smoke` job runs `http-cart`, `http-orders`, and `http-orders-status` as
a chain on pushes and pull requests to `main`.
```

with

```markdown
`./dev perf:chain` runs workflows in order as one command; each step reads the
datasets that earlier steps wrote. The `perf-run` and `perf-chain` GitHub
workflows run the same planner on demand against the stack on their runner
([GitHub Actions](#github-actions-perf-run-and-perf-chain)). CI's `perf-smoke`
job runs `http-cart`, `http-orders`, and `http-orders-status` as a chain on
pushes and pull requests to `main`.
```

Add `./dev perf:chain --spec tests/performance/k6/reports/dispatch/spec.json --plan   # a spec from perf:dispatch` to the bash block, and after the "A sized browser step needs at most 4 VUs" bullet add:

```markdown
- Every other browser step's resolved config (preset, custom, or the
  workflow's own) must also peak at 4 VUs or fewer. The planner sums the
  scenarios' peak VUs as if they ran at once and rejects a config whose peak
  it cannot calculate.
- `--spec <path>` reads the steps from a versioned spec file instead of the
  arguments (a relative path is read from the repository root). A spec step's
  load is `auto`, a preset, or a custom k6 options JSON beneath
  `tests/performance/k6/options/`; `scripts/pg/perf_spec.py` defines the
  format and the path rules.
```

Replace the paragraph starting "`tests/performance/k6/reports/chain/` holds" with:

```markdown
`tests/performance/k6/reports/chain/` holds the chain's evidence record,
`chain.json` (each step's plan, status, exit code, rows written, sizing, k6
summary metrics, each threshold's expression and result, and the metrics k6
emitted), `summary.md` (rendered from `chain.json`), each sized step's
generated k6 config, and `step-<n>-<workflow>/` with the log, JSON summary,
and HTML report each step wrote during this run. The summary shows a metric k6
did not emit as "not emitted", not as zero.
```

Insert before `## Summary output and Docker Compose confirmation`:

```markdown
## GitHub Actions (`perf-run` and `perf-chain`)

Two manual forms in the Actions tab run Punch workflows against the Expresso
stack on one GitHub-hosted runner. Both call `_perf-execute.yml`, which
validates the form values, plans before Docker, runs that exact plan, and
uploads one artifact.

| Form                                | Inputs                                                     | Runs                                                                    |
| ----------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------- |
| Punch performance — single (`perf-run.yml`)  | Workflow, load, custom config                     | One workflow that requires no dataset                                   |
| Punch performance — chain (`perf-chain.yml`) | Sequence, then a load and custom config per step  | One recipe: a producer and the consumers that read its data, 2–4 steps |

The workflow and sequence lists come from the catalog. A recipe is an acyclic
path of two to four workflows that starts at a workflow requiring no dataset,
where each link is a dataset the producer writes for that consumer (named in
its `targets`) and the consumer requires or reads optionally, and that
`perf:chain` plans with every step on `auto`. `./dev perf:forms --write`
rewrites the generated option blocks; `--check` fails when they differ from
the catalog, and the Python tests run the same check.

| Load label                                     | Meaning                                                                  |
| ---------------------------------------------- | ------------------------------------------------------------------------ |
| `Auto (data-size producer; default otherwise)` | `auto`: sized for the step that reads its data, else `spec.k6.config`    |
| `1 journey`, `5 journeys`                      | Presets `1-iteration`, `5-iterations` (`-browser` variants for browser)  |
| `1 user for 5 minutes`, `5 users for 5 minutes`| Presets `1-vu-5m`, `5-vu-5m`; refused for browser steps                  |
| `Custom config`                                | The committed JSON at the custom config path                             |

A custom config path is relative to `tests/performance/k6/options/`, for
example `custom/status-regression.json`. Absolute paths, `..`, non-JSON
files, missing files, and paths that resolve outside that directory are
rejected, as is `Custom config` without a path or a path with any other
load. Step slots past the sequence's last workflow are ignored.

`./dev perf:dispatch` is the boundary: it reads the form values from
environment variables, re-derives the lists from the catalog (so an API
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

The job rebuilds the k6 images every run, so a run never executes scenarios
baked into an older image. After the stack and image steps, `--finalize`
sets the status, and fails a job that would otherwise pass while a passed
step left no k6 summary. The whole `reports/` directory is uploaded once as
`perf-<run id>-<attempt>`; the job summary then gets the artifact's URL and
SHA-256 digest. The summary starts with `Passed`, `Failed`, or `Rejected`,
shows one row per step (load, data, status, duration, requests, error rate,
p90, checks, threshold gate), lists every threshold expression and result,
and always says:

> The app and k6 share one GitHub-hosted runner. Use these results for
> regression evidence, not capacity claims. Compare only runs with the same
> workload, test data, and environment.
```

Run `npx --no-install prettier --write docs/performance/orchestrator.md` afterwards so the tables align (the file is not under a Prettier gate, but its tables are kept formatted).

- [ ] **Step 2: `docs/cli-reference.md`**

- Line 5: `31 commands` → `33 commands`; `` `perf:chain`; `perf:open-report`; `` → `` `perf:chain`; `perf:forms`; `perf:dispatch`; `perf:open-report`; ``.
- Line 53 `perf:chain` usage cell: `` `./dev perf:chain <workflow>[:<shape>] ... [--plan]` `` → `` `./dev perf:chain <workflow>[:<shape>] ... \| --spec PATH [--plan]` ``.
- After the `perf:chain` row add:

```markdown
| `perf:forms`                    | Derive the GitHub `perf-run`/`perf-chain` form options from the catalog; `--check` fails on drift.         | `./dev perf:forms --write\|--check`                      |
| `perf:dispatch`                 | GitHub Actions boundary: normalize form values (env) into `spec.json`, record stages, finalize, publish.    | `./dev perf:dispatch [--stage NAME\|--finalize\|--publish]` |
```

- Line 58: `This table has 31 entries: 18 fixed commands, nine workflow-generated commands, `perf:chain`, two report commands, and `hack`.` → `This table has 33 entries: 18 fixed commands, nine workflow-generated commands, `perf:chain`, `perf:forms`, `perf:dispatch`, two report commands, and `hack`.`
- Line 68: append `` `--spec PATH` reads the steps from a versioned spec file instead (a relative path is read from the repository root; see [`performance/orchestrator.md`](performance/orchestrator.md#github-actions-perf-run-and-perf-chain)). ``
- Flags table: after the `--plan` row add a `--spec` row in the same column layout: flag `` `--spec` ``; applies to `` `perf:chain`; takes a path. Read the steps from a spec file (what `perf:dispatch` writes). Relative paths are read from the repository root. Not combinable with positional steps. ``; default `Off.`; repeatable `No.`; example `` `./dev perf:chain --spec tests/performance/k6/reports/dispatch/spec.json --plan` ``.

Run `npx --no-install prettier --write docs/cli-reference.md`.

- [ ] **Step 3: `tests/performance/k6/README.md`** — replace "On GitHub, the `perf` workflow runs the same command from the Actions tab." with "On GitHub, the `perf-run` and `perf-chain` workflows run single workflows and chains from the Actions tab." In the reports layout block add after the `chain/` line:

```text
  dispatch/                                    # GitHub run record (request.json, spec.json, dispatch.json, summary.md)
```

- [ ] **Step 4: `CLAUDE.md` line 124** — replace "the `perf` GitHub workflow runs it on demand" with "the `perf-run` and `perf-chain` GitHub workflows run single workflows and chains on demand". Point the link at `docs/performance/orchestrator.md#github-actions-perf-run-and-perf-chain`.

- [ ] **Step 5: `docs/next-steps/perf-run-ux.md`** — status paragraph: "Status: open. The GitHub Actions design below is implemented on branch `feat/perf-github-forms` (`perf-run.yml`, `perf-chain.yml`, `_perf-execute.yml`); live verification on GitHub is pending. Local setup and the start page still need decisions." In "What is built", replace the `GitHub Actions, perf workflow` row with:

```markdown
| GitHub Actions, `perf-run` and `perf-chain` forms                      | One standalone workflow, or one of nine catalog recipes with a load per step (`Auto`, presets, or a committed custom config) | The GitHub runner (app and k6 on one 4-vCPU VM)                 | Job summary with per-threshold results; artifact `perf-<run id>-<attempt>`     |
```

Run `npx --no-install prettier --write docs/next-steps/perf-run-ux.md`.

- [ ] **Step 6: Verify docs contracts and anchors**

Run: `cd scripts && python3 -m unittest pg.tests.test_perf_ci_docs_contract -v && cd .. && grep -rn "perf\.yml\|perf-chain-<run\|the \`perf\` GitHub\|the \`perf\` workflow" --exclude-dir=node_modules --exclude-dir=vendor --exclude-dir=.git . | grep -v docs/superpowers`
Expected: tests pass; grep prints nothing except the historical record in `perf-run-ux.md`'s measured table (if any). Confirm the anchor `#github-actions-perf-run-and-perf-chain` matches the new heading (GitHub slug of `GitHub Actions (`perf-run` and `perf-chain`)`).

- [ ] **Step 7: Commit**

```bash
git add docs/performance/orchestrator.md docs/cli-reference.md tests/performance/k6/README.md CLAUDE.md docs/next-steps/perf-run-ux.md
git commit -m "docs(perf): document the perf-run and perf-chain GitHub forms"
```

---

### Task 8: Local rehearsal of the reusable job

Proves the command sequence `_perf-execute.yml` runs works end to end on Docker before anything is pushed. No file changes unless a defect is found (fix it in the owning task's files, with a test, and commit separately).

- [ ] **Step 1: Rehearse a rejection** (no Docker)

```bash
SCRATCH=<session scratchpad>
env PERF_KIND=chain PERF_SELECTION="http-orders -> http-cart" PERF_LOAD_1="1 journey" \
  GITHUB_RUN_ID=1 GITHUB_RUN_ATTEMPT=1 GITHUB_OUTPUT="$SCRATCH/out" ./dev perf:dispatch; echo "exit $?"
env PERF_JOB_STATUS=failure ./dev perf:dispatch --finalize; echo "exit $?"
env GITHUB_STEP_SUMMARY="$SCRATCH/step-summary.md" ./dev perf:dispatch --publish; echo "exit $?"
cat tests/performance/k6/reports/dispatch/dispatch.json "$SCRATCH/step-summary.md"
```

Expected: dispatch exit 1 with `unknown or stale sequence`; finalize exit 0, status `rejected`; publish exit 1 (no artifact URL), summary starts `## Rejected:` and contains the runner warning.

- [ ] **Step 2: Rehearse the three-step chain with a custom consumer config**

Requires Docker Desktop running.

```bash
export PERF_KIND=chain PERF_SELECTION="http-cart -> http-orders -> http-orders-status" \
  PERF_LOAD_1="Auto (data-size producer; default otherwise)" PERF_LOAD_2="Auto (data-size producer; default otherwise)" \
  PERF_LOAD_3="Custom config" PERF_CONFIG_3=custom/status-regression.json \
  GITHUB_RUN_ID=2 GITHUB_RUN_ATTEMPT=1 GITHUB_SHA="$(git rev-parse HEAD)" GITHUB_REF=refs/heads/feat/perf-github-forms
./dev perf:dispatch && ./dev perf:dispatch --stage plan && ./dev perf:chain --spec tests/performance/k6/reports/dispatch/spec.json --plan \
  && ./dev perf:dispatch --stage stack && ./dev up \
  && ./dev perf:dispatch --stage images && docker compose -f infra/docker/compose.performance.yaml build k6 \
  && ./dev perf:dispatch --stage execute && ./dev perf:chain --spec tests/performance/k6/reports/dispatch/spec.json
PERF_JOB_STATUS=success ./dev perf:dispatch --finalize; echo "finalize $?"
GITHUB_STEP_SUMMARY="$SCRATCH/chain-summary.md" PERF_ARTIFACT_URL=https://example.invalid/a PERF_ARTIFACT_DIGEST=0 ./dev perf:dispatch --publish
cat "$SCRATCH/chain-summary.md"; jq '.steps[] | {workflow, status, thresholds}' tests/performance/k6/reports/chain/chain.json
./dev down
```

Expected: plan sizes `http-orders` for 23 iterations and `http-cart` for 27; all three steps pass; finalize exit 0, status `passed`; the summary has three rows with numeric metrics and `held (3)` gates, a threshold details list, and the ref/SHA lines. Record job time.

- [ ] **Step 3: Rehearse a browser single run's cap rejection**

```bash
cat > tests/performance/k6/options/custom/zz-rehearsal-browser.json <<'EOF'
{"scenarios": {"default": {"executor": "ramping-vus", "stages": [{"duration": "10s", "target": 6}], "options": {"browser": {"type": "chromium"}}}}}
EOF
env PERF_KIND=single PERF_SELECTION=browser-cart PERF_LOAD_1="Custom config" PERF_CONFIG_1=custom/zz-rehearsal-browser.json ./dev perf:dispatch \
  && ./dev perf:chain --spec tests/performance/k6/reports/dispatch/spec.json --plan; echo "exit $?"
rm tests/performance/k6/options/custom/zz-rehearsal-browser.json
```

Expected: dispatch exit 0 (`browser=true` would be emitted); plan exit 1 with `custom: custom/zz-rehearsal-browser.json runs up to 6 browser VUs; the cap is 4`. The rehearsal file is removed and never committed.

- [ ] **Step 4: Full verification gate**

Run: `cd scripts && python3 -m unittest discover -s pg/tests -p 'test_*.py' 2>&1 | tail -3 && cd .. && ruff check scripts/pg && (cd tests/performance/k6 && npm test && npm run typecheck) && ./dev perf:forms --check && git status --short`
Expected: everything passes; `git status` clean (reports are gitignored).

---

### Task 9: Merge and verify on GitHub

**Ask the user before each outward action in this task.** A `workflow_dispatch` workflow must exist on the default branch before it appears in the Actions UI or accepts `gh workflow run`, so live verification follows the merge.

- [ ] **Step 1: Request a whole-branch review** (superpowers:requesting-code-review), fix findings with tests, re-run Task 8 Step 4.

- [ ] **Step 2: With the user's OK, merge to `main` and push**

```bash
git switch main && git merge --no-ff feat/perf-github-forms -m "Merge branch 'feat/perf-github-forms'"
git log origin/main..HEAD -- vendor/punch   # must print nothing: Punch is not bumped
git push origin main
gh run watch "$(gh run list --workflow ci.yml --branch main --limit 1 --json databaseId -q '.[0].databaseId')"
```

Expected: CI green, including the lint job's `npm test` and the Python job's new tests.

- [ ] **Step 3: With the user's OK, dispatch the acceptance runs**

```bash
gh workflow run perf-run.yml -f workflow=http-purchase -f load="1 journey"
gh workflow run perf-chain.yml -f sequence="http-cart -> http-orders" -f step2-load="5 users for 5 minutes"
gh workflow run perf-chain.yml -f sequence="http-cart -> http-orders -> http-orders-status" -f step3-load="Custom config" -f step3-config=custom/status-regression.json
gh workflow run perf-chain.yml -f sequence="browser-cart -> http-orders -> http-orders-status"
gh workflow run perf-chain.yml -f sequence="http-purchase-registered -> http-auth-login -> http-me-hot-status"
gh workflow run perf-chain.yml -f sequence="http-orders -> http-cart"   # not an option: record GitHub's response
```

For each run: `gh run watch <id>`, then `gh run view <id>` and the job summary page. Check against the design acceptance conditions:

1. Six workflows and nine sequences appear in the forms (screenshot or `gh workflow view`).
2. The one-step, two-step, and each three-step run complete without YAML edits.
3. The custom consumer config sized the earlier producers (step 1 and 2 load cells show `auto: sized for step …`).
4. The invalid sequence is rejected before Docker — by GitHub's choice validation (HTTP 422 from `gh workflow run`) or by `perf:dispatch` (`Rejected` summary). Record which; the unit test `test_an_unknown_or_stale_sequence_is_rejected` covers the normalizer either way.
5. The artifact contains `dispatch/spec.json` identical to what both `perf:chain` steps logged.
6. Threshold rows appear by expression in the summary.
7. Each summary ends with the artifact link and SHA-256 digest.
8. Each summary carries the runner warning.

- [ ] **Step 4: Record the evidence** — in `docs/next-steps/perf-run-ux.md`: set the status to "implemented and verified on GitHub on <date>" with the merge SHA, add the measured runs (job time, stack start, chain time) to the measured table, and strike the friction items the forms resolved (run titles, bare-name form, partial results, the capacity disclaimer, stale k6 images on GitHub). Commit `docs(next-steps): record the perf forms' GitHub verification` and, with the user's OK, push.
