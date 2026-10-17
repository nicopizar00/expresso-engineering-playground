"""perf:chain — run repository k6 workflows in order; a step's datasets feed
the steps after it.

    ./dev perf:chain <workflow>[:<shape>] [<workflow>[:<shape>] ...] [--plan]
    ./dev perf:chain --spec <spec.json> [--plan]

The whole chain is planned before Docker starts; then each step runs through
the same Punch path as `./dev perf:<workflow>` (pg.k6runner.execute_k6). A
load is `auto`, a preset stem from tests/performance/k6/options/, or (from
`--spec`) a custom k6 options JSON beneath that directory. A step whose data a
later step reads is sized for that reader with Punch's size_producer when its
load is `auto` (resolved from the last step back); any other `auto` step keeps
its workflow's spec.k6.config. Browser workflows run a preset's `-browser`
variant, and every browser step's resolved config must stay within
MAX_BROWSER_VUS. `none` marks an empty step; empty steps may only trail.

A step reads each dataset from the latest earlier step that writes it. Only
those writers run with --produce, and an optional dataset that no earlier step
writes uses the scenario's built-in data, so a chain never reads a file left
by an earlier run. The chain stops at the first failed step. Evidence lands
in tests/performance/k6/reports/chain/: chain.json, summary.md (rendered from
it by render_summary), and each step's log, k6 summary, and HTML report.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Tuple

from pg.ansi import bold, fail, header, info, pass_, warn
from pg.k6runner import execute_k6
from pg.perf_spec import (
    AUTO,
    CUSTOM,
    PRESET,
    SpecError,
    StepRequest,
    custom_config_path,
    load_spec,
    preset_name,
)
from pg.paths import (
    BFF_PORT,
    PERF_OPTIONS_DIR,
    PERF_REPORTS_DIR,
    PERF_WORKFLOWS_DIR,
    REPO_ROOT,
)
from pg.workflows import WORKFLOWS

# pg.paths initializes PUNCH_SRC before these public Punch imports.
from punch.catalog import CatalogError, WorkflowCatalog, load_catalog
from punch.execution import DEFAULT_DATA, ExecutionResult
from punch.sizing import SizingError, SizingPlan, rows_needed, size_producer, sizing_evidence
from punch.workflow import K6Workflow, WorkflowError, read_k6_config

EMPTY = "none"
BROWSER_SERVICE = "k6-browser"
BROWSER_SUFFIX = "-browser"
# Starting cap for a sized browser step: one Chromium per vCPU of a 4-vCPU
# GitHub-hosted runner that also runs the app. Not measured yet.
MAX_BROWSER_VUS = 4
FIXED_VU_EXECUTORS = ("shared-iterations", "per-vu-iterations", "constant-vus")
ARRIVAL_RATE_EXECUTORS = ("constant-arrival-rate", "ramping-arrival-rate")
CHAIN_REPORTS_DIR = PERF_REPORTS_DIR / "chain"
METRIC_KEYS = ("totalRequests", "errorRate", "p90Ms", "checkPassRate", "durationMs")
OUTCOME_HEADINGS = {
    "passed": "Passed", "failed": "Failed", "rejected": "Rejected", "planned": "Planned",
}
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


def shapes(options_dir: Path = PERF_OPTIONS_DIR) -> Tuple[str, ...]:
    """`auto` plus every preset stem that is not a browser variant."""
    presets = sorted(
        path.stem for path in options_dir.glob("*.json") if not path.stem.endswith(BROWSER_SUFFIX)
    )
    return (AUTO, *presets)


def browser_shapes(options_dir: Path = PERF_OPTIONS_DIR) -> Tuple[str, ...]:
    """Shapes with a `-browser` preset, the only ones a browser step can run."""
    return tuple(
        shape for shape in shapes(options_dir)[1:]
        if (options_dir / f"{shape}{BROWSER_SUFFIX}.json").is_file()
    )


def _count(number: int, noun: str) -> str:
    return f"{number} {noun}" if number == 1 else f"{number} {noun}s"


def _and(items: Sequence[str]) -> str:
    return items[0] if len(items) == 1 else f"{', '.join(items[:-1])} and {items[-1]}"


def parse_steps(raw: Sequence[str]) -> List[StepRequest]:
    """`<workflow>[:<shape>]` items as step requests; the shape defaults to auto."""
    steps: List[StepRequest] = []
    for item in raw:
        workflow, _, shape = item.partition(":")
        workflow, shape = workflow.strip(), shape.strip() or AUTO
        steps.append(
            StepRequest(workflow) if shape == AUTO else StepRequest(workflow, PRESET, shape)
        )
    return steps


@dataclass
class Step:
    number: int
    workflow: K6Workflow
    # auto, a preset stem, or "custom"
    shape: str
    # The custom config's path beneath tests/performance/k6/options/
    custom: Optional[str] = None
    # The preset or spec.k6.config file; None when sized or when the workflow has none.
    config_path: Optional[Path] = None
    # The k6 options this step runs with (a sized step's generated config).
    config: Dict[str, Any] = field(default_factory=dict)
    sizing: Optional[SizingPlan] = None
    sized_for: Optional[int] = None
    produce: List[str] = field(default_factory=list)
    # dataset -> number of the step that writes it
    reads: Dict[str, int] = field(default_factory=dict)
    # optional datasets left on the scenario's built-in data
    defaults: List[str] = field(default_factory=list)
    # dataset -> numbers of the later steps that read it from this step
    readers: Dict[str, List[int]] = field(default_factory=dict)
    # dataset -> rows its first reader reads, when estimable
    rows_needed: Dict[str, int] = field(default_factory=dict)
    resolved: bool = False

    @property
    def name(self) -> str:
        return self.workflow.name

    @property
    def browser(self) -> bool:
        return self.workflow.compose_service == BROWSER_SERVICE

    def shape_label(self) -> str:
        if self.shape == CUSTOM:
            return f"custom: {self.custom}"
        if self.shape != AUTO:
            return preset_name(self.shape, self.config_path.stem if self.config_path else None)
        if not self.resolved:
            return self.shape
        if self.sizing is not None:
            return (
                f"auto: sized for step {self.sized_for} "
                f"({_count(self.sizing.iterations, 'iteration')}, {_count(self.sizing.vus, 'VU')})"
            )
        config = self.config_path.stem if self.config_path is not None else "script options"
        return f"auto: {config}"

    def data_label(self) -> str:
        parts = [f"reads {dataset} from step {writer}" for dataset, writer in self.reads.items()]
        parts += [f"{dataset}: built-in default" for dataset in self.defaults]
        parts += [f"writes {dataset}" for dataset in self.produce]
        return "; ".join(parts) or "none"

    def run_args(self, sized_config: Optional[Path] = None) -> List[str]:
        """The `./dev perf:<workflow>` arguments for this step."""
        args: List[str] = []
        if sized_config is not None:
            args += ["--config", str(sized_config)]
        elif self.shape == CUSTOM and self.config_path is not None:
            args += ["--config", str(self.config_path)]
        elif self.shape != AUTO and self.config_path is not None:
            args += ["--config", self.config_path.stem]
        for dataset in self.produce:
            args += ["--produce", dataset]
        for dataset in self.defaults:
            args += ["--data", f"{dataset}={DEFAULT_DATA}"]
        return args


@dataclass
class Plan:
    steps: List[Step]
    errors: List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)
    # The workflows the run asked for, in order, including any the plan rejected.
    requested: List[str] = field(default_factory=list)


def _preset_path(workflow: K6Workflow, shape: str, options_dir: Path) -> Optional[Path]:
    if workflow.compose_service != BROWSER_SERVICE:
        return options_dir / f"{shape}.json"
    path = options_dir / f"{shape}{BROWSER_SUFFIX}.json"
    return path if path.is_file() else None


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
                    f"step {number} {name}: a browser workflow has no "
                    f"{preset_name(entry.value)} preset; use auto or one of: "
                    f"{', '.join(preset_name(shape) for shape in browser_shapes(options_dir))}"
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


def _link_data(catalog: WorkflowCatalog, plan: Plan) -> None:
    """Point each read at the latest earlier writer; writers produce only what is read."""
    writers: Dict[str, Step] = {}
    for step in plan.steps:
        data = step.workflow.data
        if data is None:
            continue
        for dataset in data.requires:
            writer = writers.get(dataset)
            if writer is None:
                producers = " or ".join(catalog.producers_of(dataset)) or "a producer"
                plan.errors.append(
                    f"step {step.number} {step.name} reads {dataset}; no earlier step writes it. "
                    f"Put {producers} before step {step.number}"
                )
                continue
            step.reads[dataset] = writer.number
            writer.readers.setdefault(dataset, []).append(step.number)
        for dataset in data.optional:
            writer = writers.get(dataset)
            if writer is None:
                step.defaults.append(dataset)
                continue
            step.reads[dataset] = writer.number
            writer.readers.setdefault(dataset, []).append(step.number)
        for product in data.produces:
            writers[product.dataset] = step
    for step in plan.steps:
        data = step.workflow.data
        if data is None:
            continue
        step.produce = [p.dataset for p in data.produces if p.dataset in step.readers]
        for dataset, readers in step.readers.items():
            if len(readers) > 1:
                plan.warnings.append(
                    f"steps {_and([str(n) for n in readers])} read {dataset} "
                    f"from step {step.number}; its rows are reused"
                )


def _sizing_reader(step: Step, by_number: Dict[int, Step]) -> Optional[Step]:
    """The first later step that reads this step's data and is one of its targets."""
    data = step.workflow.data
    candidates: List[Step] = []
    for dataset, readers in step.readers.items():
        product = data.product(dataset) if data is not None else None
        targets = product.targets if product is not None else ()
        candidates += [by_number[n] for n in readers if by_number[n].name in targets]
    return min(candidates, key=lambda reader: reader.number, default=None)


def _resolve_configs(catalog: WorkflowCatalog, plan: Plan) -> None:
    """Resolve each step's k6 options from the last step back, sizing auto writers."""
    by_number = {step.number: step for step in plan.steps}
    for step in reversed(plan.steps):
        step.resolved = True
        if step.shape != AUTO:
            continue  # read when the step was selected
        reader = _sizing_reader(step, by_number)
        if reader is not None:
            preset = reader.config_path.stem if reader.config_path is not None else None
            try:
                sizing = size_producer(
                    step.workflow, reader.name, catalog, reader.config, preset=preset
                )
            except SizingError as error:
                plan.warnings.append(
                    f"step {step.number} {step.name}: not sized for step {reader.number} "
                    f"({error}); it runs its default config"
                )
            else:
                step.sizing, step.sized_for, step.config = sizing, reader.number, dict(sizing.config)
                if step.browser and sizing.vus > MAX_BROWSER_VUS:
                    plan.errors.append(
                        f"step {step.number} {step.name}: sized for step {reader.number} "
                        f"{reader.name} at {reader.shape_label()}, it needs {sizing.vus} browser "
                        f"VUs; the cap is {MAX_BROWSER_VUS}. Pick a smaller load for step "
                        f"{reader.number}"
                    )
                continue
        step.config_path = step.workflow.k6_config
        step.config = read_k6_config(step.config_path) if step.config_path is not None else {}
    for step in plan.steps:
        for dataset, readers in step.readers.items():
            reader = by_number[readers[0]]
            try:
                step.rows_needed[dataset] = rows_needed(reader.workflow, reader.config)
            except SizingError:
                pass


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


def _runs_chromium(config: Dict[str, Any]) -> bool:
    """k6/browser needs options.browser.type on every scenario; top-level
    shortcuts (vus, iterations, stages) have nowhere to set it."""
    scenarios = config.get("scenarios")
    if not isinstance(scenarios, dict) or not scenarios:
        return False
    for scenario in scenarios.values():
        options = scenario.get("options") if isinstance(scenario, dict) else None
        browser = options.get("browser") if isinstance(options, dict) else None
        if not isinstance(browser, dict) or not isinstance(browser.get("type"), str):
            return False
    return True


def _check_browser_vus(plan: Plan) -> None:
    """Every browser step's resolved config runs Chromium within MAX_BROWSER_VUS."""
    for step in plan.steps:
        if not step.browser or step.sizing is not None:
            continue  # a sized step was checked when it was sized
        if step.shape == CUSTOM and not _runs_chromium(step.config):
            plan.errors.append(
                f"step {step.number} {step.name}: {step.shape_label()} must set "
                "options.browser.type on every scenario; see "
                "tests/performance/k6/options/1-iteration-browser.json"
            )
            continue
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


def plan_chain(
    entries: Sequence[StepRequest],
    catalog: WorkflowCatalog,
    options_dir: Path = PERF_OPTIONS_DIR,
) -> Plan:
    """Validate and size a chain of step requests without running it."""
    plan = Plan(
        steps=[], requested=[entry.workflow for entry in entries if entry.workflow != EMPTY]
    )
    _select_steps(entries, catalog, options_dir, plan)
    if not plan.errors:
        _link_data(catalog, plan)
    if not plan.errors:
        _resolve_configs(catalog, plan)
        _check_browser_vus(plan)
    return plan


@dataclass
class StepRecord:
    step: Step
    status: str  # passed | failed | skipped
    exit_code: Optional[int] = None
    failure: Optional[str] = None
    rows: Dict[str, int] = field(default_factory=dict)
    metrics: Dict[str, Any] = field(default_factory=dict)
    # The k6 summary's threshold results ({metric, expression, ok}) and emitted metric names.
    thresholds: List[Dict[str, Any]] = field(default_factory=list)
    emitted: Optional[List[str]] = None
    # The copied k6 summary (relative to the repository root when inside it); None if none.
    summary: Optional[str] = None
    seconds: float = 0.0


def _relative(path: Path) -> str:
    try:
        return path.resolve().relative_to(REPO_ROOT).as_posix()
    except ValueError:
        return str(path)


def _fresh(path: Path, started: float) -> bool:
    # One second of slack for file systems with coarse timestamps.
    return path.is_file() and path.stat().st_mtime >= started - 1


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


def _record(step: Step, code: int, result: Optional[ExecutionResult]) -> StepRecord:
    record = StepRecord(step, "passed" if code == 0 else "failed", exit_code=code)
    if result is not None:
        record.exit_code = result.child_exit_code if result.child_exit_code is not None else code
        record.failure = result.failure
        record.rows = {dataset.dataset: dataset.record_count for dataset in result.datasets}
    elif code != 0:
        record.failure = "could not prepare the workflow"
    return record


def _shortfall(record: StepRecord, plan: Plan) -> None:
    step = record.step
    for dataset, needed in step.rows_needed.items():
        rows = record.rows.get(dataset, 0)
        if rows < needed:
            reader = step.readers[dataset][0]
            message = (
                f"step {step.number} {step.name} wrote {_count(rows, dataset + ' row')}; "
                f"step {reader} reads {needed}, so rows repeat"
            )
            plan.warnings.append(message)
            warn(message)


def run_chain(plan: Plan, reports_dir: Path = CHAIN_REPORTS_DIR) -> int:
    """Run every planned step in order; stop at the first failure."""
    records: List[StepRecord] = []
    exit_code = 0
    total = len(plan.steps)
    for step in plan.steps:
        if exit_code != 0:
            records.append(StepRecord(step, "skipped"))
            continue
        sized_config = None
        if step.sizing is not None:
            reports_dir.mkdir(parents=True, exist_ok=True)
            sized_config = reports_dir / f"step-{step.number}-{step.name}.k6-config.json"
            sized_config.write_text(json.dumps(step.config, indent=2) + "\n", encoding="utf-8")
        args = step.run_args(sized_config)
        header(f"Chain step {step.number}/{total}: {step.name}")
        info(f"Same as: ./dev perf:{step.name} {' '.join(args)}".rstrip())
        print()
        started = time.time()
        code, result = execute_k6(
            step.name, args, default_port=WORKFLOWS.get(step.name, BFF_PORT), interactive=False
        )
        record = _record(step, code, result)
        record.seconds = round(time.time() - started, 1)
        _collect_evidence(record, started, reports_dir)
        if record.status == "passed":
            _shortfall(record, plan)
        records.append(record)
        exit_code = code
    write_evidence(plan, records, reports_dir)
    print()
    if exit_code == 0:
        pass_(f"Chain passed: {total} step{'' if total == 1 else 's'}.")
    else:
        failed = next(record for record in records if record.status == "failed")
        fail(f"Chain failed at step {failed.step.number} {failed.step.name}.")
    info(f"Evidence: {_relative(reports_dir)}/")
    print()
    return exit_code


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
    names = evidence.get("sequence") or [step["workflow"] for step in steps]
    sequence = " → ".join(names) or "no workflow"
    heading = OUTCOME_HEADINGS[outcome]
    failed = next((step for step in steps if step.get("status") == "failed"), None)
    if outcome == "failed" and failed is not None:
        heading += f" at step {failed['step']} {failed['workflow']}"
    lines = [f"## {heading}: {_md(sequence)}", ""]
    if notes:
        lines += [*[f"- {note}" for note in notes], ""]
    if steps:
        lines += [
            "| Step | Workflow | Load | Data | Status | Duration | Requests | Errors | p90 "
            "| Checks | Thresholds |",
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


def annotate(errors: Sequence[str], warnings: Sequence[str], title: str) -> None:
    """GitHub Actions annotations, so a rejected run shows on the run page."""
    if os.environ.get("GITHUB_ACTIONS") != "true":
        return
    for level, messages in (("error", errors), ("warning", warnings)):
        for message in messages:
            escaped = message.replace("%", "%25").replace("\r", "%0D").replace("\n", "%0A")
            print(f"::{level} title={title}::{escaped}")


def _print_plan(plan: Plan) -> None:
    header("Punch chain plan")
    for step in plan.steps:
        info(f"step {step.number}  {bold(step.name)}  {step.shape_label()}  ({step.data_label()})")
    for message in plan.warnings:
        warn(message)
    for message in plan.errors:
        fail(message)
    print()


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
