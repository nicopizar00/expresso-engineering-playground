"""perf:chain — run repository k6 workflows in order; a step's datasets feed
the steps after it.

    ./dev perf:chain <workflow>[:<shape>] [<workflow>[:<shape>] ...] [--plan]

The whole chain is planned before Docker starts; then each step runs through
the same Punch path as `./dev perf:<workflow>` (pg.k6runner.execute_k6). A
shape is a preset stem from tests/performance/k6/options/ or `auto`: a step
whose data a later step reads is sized for that reader with Punch's
size_producer (resolved from the last step back); any other step keeps its
workflow's spec.k6.config. Browser workflows run the preset's `-browser`
variant. `none` marks an empty step (the GitHub form's unused slots); empty
steps may only trail.

A step reads each dataset from the latest earlier step that writes it. Only
those writers run with --produce, and an optional dataset that no earlier step
writes uses the scenario's built-in data, so a chain never reads a file left
by an earlier run. The chain stops at the first failed step. Evidence lands
in tests/performance/k6/reports/chain/: chain.json, summary.md, and each
step's log and k6 summary.
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

AUTO = "auto"
EMPTY = "none"
BROWSER_SERVICE = "k6-browser"
BROWSER_SUFFIX = "-browser"
# Starting cap for a sized browser step: one Chromium per vCPU of a 4-vCPU
# GitHub-hosted runner that also runs the app. Not measured yet.
MAX_BROWSER_VUS = 4
CHAIN_REPORTS_DIR = PERF_REPORTS_DIR / "chain"
METRIC_KEYS = ("totalRequests", "errorRate", "p90Ms", "checkPassRate", "durationMs")


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


def parse_steps(raw: Sequence[str]) -> List[Tuple[str, str]]:
    """`<workflow>[:<shape>]` items as (workflow, shape); the shape defaults to auto."""
    steps: List[Tuple[str, str]] = []
    for item in raw:
        workflow, _, shape = item.partition(":")
        steps.append((workflow.strip(), shape.strip() or AUTO))
    return steps


@dataclass
class Step:
    number: int
    workflow: K6Workflow
    shape: str
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
        if not self.resolved:
            return self.shape
        if self.sizing is not None:
            return (
                f"auto: sized for step {self.sized_for} "
                f"({_count(self.sizing.iterations, 'iteration')}, {_count(self.sizing.vus, 'VU')})"
            )
        config = self.config_path.stem if self.config_path is not None else "script options"
        return f"auto: {config}" if self.shape == AUTO else config

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


def _preset_path(workflow: K6Workflow, shape: str, options_dir: Path) -> Optional[Path]:
    if workflow.compose_service != BROWSER_SERVICE:
        return options_dir / f"{shape}.json"
    path = options_dir / f"{shape}{BROWSER_SUFFIX}.json"
    return path if path.is_file() else None


def _select_steps(
    entries: Sequence[Tuple[str, str]], catalog: WorkflowCatalog, options_dir: Path, plan: Plan
) -> None:
    """Check names, shapes, and gaps; fill plan.steps with the non-empty steps."""
    known_shapes = shapes(options_dir)
    last = max((index for index, (name, _) in enumerate(entries) if name != EMPTY), default=-1)
    if last < 0:
        plan.errors.append("no workflow selected; step 1 needs one")
        return
    for index, (name, shape) in enumerate(entries):
        number = index + 1
        if index > last:
            if shape != AUTO:
                plan.warnings.append(f"step {number} is empty; its shape {shape} is ignored")
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
        if shape not in known_shapes:
            plan.errors.append(
                f"step {number} {name}: unknown shape {shape!r}; "
                f"use one of: {', '.join(known_shapes)}"
            )
            continue
        step = Step(number, workflow, shape)
        if shape != AUTO:
            step.config_path = _preset_path(workflow, shape, options_dir)
            if step.config_path is None:
                plan.errors.append(
                    f"step {number} {name}: a browser workflow has no {shape} preset; "
                    f"use auto or one of: {', '.join(browser_shapes(options_dir))}"
                )
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
            assert step.config_path is not None
            step.config = read_k6_config(step.config_path)
            continue
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
                        f"{reader.name} ({reader.shape_label()}) it needs {sizing.vus} browser "
                        f"VUs; the cap is {MAX_BROWSER_VUS}. Pick a smaller shape for step "
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


def plan_chain(
    entries: Sequence[Tuple[str, str]],
    catalog: WorkflowCatalog,
    options_dir: Path = PERF_OPTIONS_DIR,
) -> Plan:
    """Validate and size a chain of (workflow, shape) entries without running it."""
    plan = Plan(steps=[])
    _select_steps(entries, catalog, options_dir, plan)
    if not plan.errors:
        _link_data(catalog, plan)
    if not plan.errors:
        _resolve_configs(catalog, plan)
    return plan


@dataclass
class StepRecord:
    step: Step
    status: str  # passed | failed | skipped
    exit_code: Optional[int] = None
    failure: Optional[str] = None
    rows: Dict[str, int] = field(default_factory=dict)
    metrics: Dict[str, Any] = field(default_factory=dict)
    seconds: float = 0.0


def _relative(path: Path) -> str:
    try:
        return path.resolve().relative_to(REPO_ROOT).as_posix()
    except ValueError:
        return str(path)


def _fresh(path: Path, started: float) -> bool:
    # One second of slack for file systems with coarse timestamps.
    return path.is_file() and path.stat().st_mtime >= started - 1


def _collect_evidence(step: Step, started: float, reports_dir: Path) -> Dict[str, Any]:
    """Copy this step's log and k6 summary into the chain directory; return its metrics."""
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
        return {}
    try:
        values = json.loads(summary.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}
    return {key: values[key] for key in METRIC_KEYS if key in values}


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
        record.metrics = _collect_evidence(step, started, reports_dir)
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


def _metrics_text(metrics: Dict[str, Any]) -> str:
    parts = []
    if "totalRequests" in metrics:
        parts.append(_count(metrics["totalRequests"], "request"))
    if "errorRate" in metrics:
        parts.append(f"errors {metrics['errorRate'] * 100:.2f}%")
    if "p90Ms" in metrics:
        parts.append(f"p90 {metrics['p90Ms']:.0f} ms")
    if "checkPassRate" in metrics:
        parts.append(f"checks {metrics['checkPassRate'] * 100:.2f}%")
    return ", ".join(parts)


def _result_text(record: Optional[StepRecord], planned: str) -> str:
    if record is None:
        return planned
    if record.status == "skipped":
        return "skipped: an earlier step failed"
    parts = [_count(rows, f"{dataset} row") for dataset, rows in record.rows.items()]
    metrics = _metrics_text(record.metrics)
    if metrics:
        parts.append(metrics)
    detail = "; ".join(parts)
    if record.status == "failed":
        reason = record.failure or f"exit code {record.exit_code}"
        return f"**failed**: {reason}" + (f"; {detail}" if detail else "")
    return "passed" + (f": {detail}" if detail else "")


def summary_markdown(plan: Plan, records: Optional[List[StepRecord]], title: str) -> str:
    by_step = {record.step.number: record for record in records or []}
    planned = "rejected" if plan.errors else "planned"
    lines = [f"## {title}", ""]
    if plan.steps:
        lines += [
            "| Step | Workflow | Shape | Data | Result |",
            "| --- | --- | --- | --- | --- |",
        ]
        for step in plan.steps:
            lines.append(
                f"| {step.number} | `{step.name}` | {step.shape_label()} | "
                f"{step.data_label()} | {_result_text(by_step.get(step.number), planned)} |"
            )
        lines.append("")
    if plan.errors:
        lines += ["Errors:", "", *[f"- {error}" for error in plan.errors], ""]
    if plan.warnings:
        lines += ["Warnings:", "", *[f"- {message}" for message in plan.warnings], ""]
    return "\n".join(lines)


def _step_evidence(step: Step, record: Optional[StepRecord]) -> Dict[str, Any]:
    entry: Dict[str, Any] = {
        "step": step.number,
        "workflow": step.name,
        "shape": step.shape,
        "config": step.shape_label(),
        "k6Config": step.config,
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
            seconds=record.seconds,
        )
        if step.sizing is not None and record.status != "skipped":
            entry["sizing"] = sizing_evidence(step.sizing, record.rows)
    return entry


def write_evidence(plan: Plan, records: Optional[List[StepRecord]], reports_dir: Path) -> None:
    """chain.json (the chain's evidence record) and summary.md (the job summary)."""
    by_step = {record.step.number: record for record in records or []}
    if records is None:
        title = "Punch chain rejected" if plan.errors else "Punch chain plan"
        passed = None
    else:
        failed = next((r for r in records if r.status == "failed"), None)
        passed = failed is None
        title = (
            "Punch chain passed"
            if passed
            else f"Punch chain failed at step {failed.step.number} {failed.step.name}"
        )
    reports_dir.mkdir(parents=True, exist_ok=True)
    evidence = {
        "passed": passed,
        "steps": [_step_evidence(step, by_step.get(step.number)) for step in plan.steps],
        "errors": plan.errors,
        "warnings": plan.warnings,
    }
    (reports_dir / "chain.json").write_text(json.dumps(evidence, indent=2) + "\n", encoding="utf-8")
    (reports_dir / "summary.md").write_text(
        summary_markdown(plan, records, title), encoding="utf-8"
    )


def _annotate(plan: Plan) -> None:
    """GitHub Actions annotations, so a rejected plan shows on the run page."""
    if os.environ.get("GITHUB_ACTIONS") != "true":
        return
    for level, messages in (("error", plan.errors), ("warning", plan.warnings)):
        for message in messages:
            escaped = message.replace("%", "%25").replace("\r", "%0D").replace("\n", "%0A")
            print(f"::{level} title=Punch chain::{escaped}")


def _print_plan(plan: Plan) -> None:
    header("Punch chain plan")
    for step in plan.steps:
        info(f"step {step.number}  {bold(step.name)}  {step.shape_label()}  ({step.data_label()})")
    for message in plan.warnings:
        warn(message)
    for message in plan.errors:
        fail(message)
    print()


def run(args: Sequence[str]) -> int:
    parser = argparse.ArgumentParser(
        prog="./dev perf:chain",
        description="Run k6 workflows in order; each step's datasets feed the steps after it.",
    )
    parser.add_argument(
        "steps", nargs="+", metavar="WORKFLOW[:SHAPE]",
        help=f"A workflow and its shape ({', '.join(shapes())}; default auto). "
             f"'{EMPTY}' marks an empty trailing step.",
    )
    parser.add_argument(
        "--plan", action="store_true",
        help="Validate and size the chain, write its summary, and stop before Docker.",
    )
    parsed = parser.parse_args(list(args))
    try:
        catalog = load_catalog(PERF_WORKFLOWS_DIR)
        plan = plan_chain(parse_steps(parsed.steps), catalog)
    except (CatalogError, WorkflowError) as error:
        fail(f"Could not plan the chain: {error}")
        return 1
    shutil.rmtree(CHAIN_REPORTS_DIR, ignore_errors=True)
    _print_plan(plan)
    _annotate(plan)
    if plan.errors or parsed.plan:
        write_evidence(plan, None, CHAIN_REPORTS_DIR)
        return 1 if plan.errors else 0
    return run_chain(plan)
