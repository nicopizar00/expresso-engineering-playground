"""perf:dispatch — the GitHub Actions boundary of a Punch run (_perf-execute.yml).

    ./dev perf:dispatch               record the form values (PERF_*) and write spec.json
    ./dev perf:dispatch --stage NAME  record how far the GitHub job got (plan, stack, images, execute)
    ./dev perf:dispatch --finalize    set the final status and write the GitHub job summary
    ./dev perf:dispatch --publish     append the GitHub job summary and artifact link to GITHUB_STEP_SUMMARY

Form values arrive as environment variables, never as script text. The
normalizer re-derives the form choices from the catalog and the options
directory (pg.perf_forms), so a stale form or an API dispatch cannot run what
the checked-out commit does not offer. It writes the versioned spec
(pg.perf_spec) that `perf:workflow --spec` plans and then runs unchanged: the
workload is the last step's load. With data sizing on, every earlier step is
auto, so the planner sizes it for the step that reads its data; with it off,
every step runs the workload. Evidence lands in
tests/performance/k6/reports/dispatch/: request.json (the four form values as
received), spec.json (written once, read-only), dispatch.json (run metadata,
stage, status), summary.md (the GitHub job summary), and Compose diagnostics when the
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
from pg.paths import PERF_JOBS_DIR, PERF_OPTIONS_DIR, PERF_REPORTS_DIR, repo_path
from pg.perf_forms import parse_workload, standalone, workflow_label, workflows, workloads
from pg.perf_spec import CUSTOM, SpecError, StepRequest, custom_config_path, write_spec
from pg.perf_workflow import (
    BROWSER_SERVICE,
    RUNNER_WARNING,
    WORKFLOW_REPORTS_DIR,
    annotate,
    render_summary,
)

# pg.paths initializes PUNCH_SRC before these public Punch imports.
from punch.catalog import CatalogError, JobCatalog, load_catalog
from punch.job import JobError

DISPATCH_DIR = PERF_REPORTS_DIR / "dispatch"
KINDS = ("job", "workflow")
INPUTS: Tuple[str, ...] = ("kind", "selection", "workload", "sizing")
SIZING = {"true": True, "false": False}
STAGES = ("plan", "stack", "images", "execute")
TITLE = "Punch dispatch"


def env_name(input_name: str) -> str:
    """The environment variable that carries one _perf-execute.yml input."""
    return "PERF_" + input_name.upper().replace("-", "_")


def read_request(environ: Mapping[str, str]) -> Dict[str, str]:
    return {name: environ.get(env_name(name), "") for name in INPUTS}


# --- normalize ---------------------------------------------------------------


def _job(selection: str, catalog: JobCatalog, errors: List[str]) -> List[str]:
    offered = standalone(catalog)
    if selection in offered:
        return [selection]
    job = catalog.jobs.get(selection)
    if job is not None and job.data is not None and job.data.requires:
        needs = "; ".join(
            f"{dataset} from {' or '.join(catalog.producers_of(dataset))}"
            for dataset in job.data.requires
        )
        errors.append(
            f"{selection} reads data an earlier step writes ({needs}); run it from perf-workflow.yml"
        )
    else:
        errors.append(f"unknown job {selection!r}; use one of: {', '.join(offered)}")
    return []


def _workflow(
    selection: str, catalog: JobCatalog, options_dir: Path, errors: List[str]
) -> List[str]:
    kept, _dropped = workflows(catalog, options_dir)
    offered = {workflow_label(path): list(path) for path in kept}
    if selection in offered:
        return offered[selection]
    errors.append(f"unknown or stale workflow {selection!r}; use one of: {', '.join(offered)}")
    return []


def _workload(label: str, options_dir: Path, errors: List[str]) -> Optional[Tuple[str, str]]:
    """The (mode, value) load an offered workload label names; custom paths re-checked."""
    load = parse_workload(label, options_dir)
    if load is None:
        errors.append(
            f"unknown or stale workload {label!r}; use one of: {', '.join(workloads(options_dir))}"
        )
        return None
    mode, value = load
    if mode == CUSTOM:
        try:
            custom_config_path(value, options_dir)
        except SpecError as error:
            errors.append(f"workload {label!r}: {error}")
            return None
    return load


def _sizing(raw: str, errors: List[str]) -> bool:
    """The form's data sizing checkbox, as GitHub renders a boolean input."""
    if raw not in SIZING:
        errors.append(f"data sizing {raw!r} must be true or false")
        return False
    return SIZING[raw]


def normalize(
    request: Mapping[str, str], catalog: JobCatalog, options_dir: Path = PERF_OPTIONS_DIR
) -> Tuple[List[StepRequest], List[str]]:
    """The step requests a form submission asks for, or the reasons it cannot run.
    The workload is the last step's load. Every earlier step is auto (sized for
    its reader) with data sizing on, and runs the workload too with it off."""
    errors: List[str] = []
    kind, selection = request.get("kind", ""), request.get("selection", "")
    if kind == "job":
        names = _job(selection, catalog, errors)
    elif kind == "workflow":
        names = _workflow(selection, catalog, options_dir, errors)
    else:
        errors.append(f"unknown kind {kind!r}; use {' or '.join(KINDS)}")
        names = []
    target = _workload(request.get("workload", ""), options_dir, errors)
    sizing = _sizing(request.get("sizing", ""), errors)
    if errors or target is None:
        return [], errors
    mode, value = target
    earlier = [
        StepRequest(name) if sizing else StepRequest(name, mode, value) for name in names[:-1]
    ]
    return earlier + [StepRequest(names[-1], mode, value)], []


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
    """Bounded booleans for later GitHub workflow steps (GITHUB_OUTPUT)."""
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
    workflow_dir: Optional[Path] = None,
) -> int:
    """Start a fresh dispatch record, keep the form values, and write spec.json.
    Evidence from an earlier dispatch or workflow in this checkout is removed first,
    so finalize never reports a run this dispatch did not start."""
    shutil.rmtree(dispatch_dir, ignore_errors=True)
    shutil.rmtree(workflow_dir or WORKFLOW_REPORTS_DIR, ignore_errors=True)
    dispatch_dir.mkdir(parents=True)
    record = _metadata(environ, "normalize")
    _write_json(dispatch_dir / "dispatch.json", record)
    request = read_request(environ)
    _write_json(dispatch_dir / "request.json", request)
    try:
        catalog = load_catalog(PERF_JOBS_DIR)
        steps, errors = normalize(request, catalog, options_dir)
    except (CatalogError, JobError) as error:
        steps, errors = [], [f"could not load the job catalog: {error}"]
    if errors:
        record["errors"] = errors
        _write_json(dispatch_dir / "dispatch.json", record)
        header("Punch dispatch rejected")
        for message in errors:
            fail(message)
        annotate(errors, [], TITLE)
        return 1
    write_spec(dispatch_dir / "spec.json", steps)
    browser = any(catalog.jobs[step.job].compose_service == BROWSER_SERVICE for step in steps)
    _output(environ, browser=browser)
    header("Punch dispatch")
    for number, step in enumerate(steps, start=1):
        info(f"step {number}  {step.job}  {json.dumps(step.to_json()['load'])}")
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


def _missing_evidence(workflow: Dict[str, Any]) -> List[str]:
    problems = []
    for step in workflow.get("steps", []):
        if step.get("status") != "passed":
            continue
        summary = step.get("summary")
        if not summary or not repo_path(summary).is_file():
            problems.append(
                f"step {step['step']} {step['job']} passed but left no k6 summary "
                "in the evidence"
            )
    return problems


def _status(
    record: Dict[str, Any], workflow: Optional[Dict[str, Any]], job_status: str
) -> Tuple[str, List[str]]:
    if record.get("errors") or (workflow is not None and workflow.get("errors")):
        return "rejected", []
    if job_status == "cancelled":
        return "cancelled", []
    if workflow is None or workflow.get("passed") is not True:
        return "failed", []
    problems = _missing_evidence(workflow)
    return ("failed" if problems or job_status != "success" else "passed"), problems


def _selection(request: Mapping[str, str]) -> str:
    raw = (request.get("selection") or "no selection").replace("`", "")[:120]
    return f"`{raw}`"


def _job_summary(
    record: Dict[str, Any],
    request: Mapping[str, str],
    workflow: Optional[Dict[str, Any]],
    status: str,
) -> str:
    notes: List[str] = list(record.get("problems") or [])
    if status == "cancelled":
        notes.insert(0, "The run was cancelled.")
    elif status == "failed" and record.get("stage") == "execute" and workflow is None:
        notes.append(
            "The GitHub job stopped during the execute stage before the Punch workflow wrote "
            "its evidence (`workflow.json`); files from steps that ran are under "
            "`workflow/step-<n>-<job>/`."
        )
    elif status == "failed" and (workflow is None or workflow.get("passed") is None):
        notes.append(
            f"The GitHub job stopped at the {record.get('stage')} stage before any step ran."
        )
    evidence = workflow or {
        "outcome": "rejected",
        "jobs": [_selection(request)],
        "steps": [],
        "errors": record.get("errors") or [],
        "warnings": [],
    }
    outcome = status if status in ("passed", "rejected") else "failed"
    text = render_summary(evidence, outcome=outcome, notes=notes, runner_warning=True)
    event = record.get("event") or {}
    return (
        text
        + "\nRun:\n\n"
        + f"- Ref: `{event.get('ref')}` at `{event.get('sha')}`\n"
        + f"- Actor: @{record.get('actor')}\n"
        + f"- Stage reached: {record.get('stage')}\n"
    )


def finalize(
    environ: Mapping[str, str],
    dispatch_dir: Path = DISPATCH_DIR,
    workflow_dir: Optional[Path] = None,
) -> int:
    """Set dispatch.json's final status and write summary.md. Exits 1 only when the
    GitHub job would otherwise pass without evidence; an already failed GitHub job
    stays failed."""
    workflow_dir = workflow_dir or WORKFLOW_REPORTS_DIR
    dispatch_dir.mkdir(parents=True, exist_ok=True)
    path = dispatch_dir / "dispatch.json"
    record = _read_json(path) or _metadata(environ, "setup")
    request = _read_json(dispatch_dir / "request.json") or read_request(environ)
    workflow = _read_json(workflow_dir / "workflow.json")
    job_status = environ.get("PERF_JOB_STATUS", "success")
    status, problems = _status(record, workflow, job_status)
    record.update(status=status, problems=problems)
    _write_json(path, record)
    (dispatch_dir / "summary.md").write_text(
        _job_summary(record, request, workflow, status), encoding="utf-8"
    )
    for problem in problems:
        fail(problem)
    annotate(problems, [], TITLE)
    info(f"Punch run {status}; stage reached: {record.get('stage')}")
    return 1 if status != "passed" and job_status == "success" else 0


def publish(environ: Mapping[str, str], dispatch_dir: Path = DISPATCH_DIR) -> int:
    """Append the GitHub job summary and the uploaded artifact's link and digest."""
    record = _read_json(dispatch_dir / "dispatch.json") or {}
    summary = dispatch_dir / "summary.md"
    text = (
        summary.read_text(encoding="utf-8")
        if summary.is_file()
        else f"## Failed: no job summary was written\n\n{RUNNER_WARNING}\n\n"
    )
    url, digest = environ.get("PERF_ARTIFACT_URL", ""), environ.get("PERF_ARTIFACT_DIGEST", "")
    if url:
        name = record.get("artifact") or "evidence"
        text += f"- Artifact: [{name}]({url}), SHA-256 `{digest}`\n"
    else:
        # A run without its evidence is not a passed run.
        if text.startswith("## Passed"):
            heading, _, rest = text.partition("\n")
            text = (
                "## Failed"
                + heading[len("## Passed") :]
                + "\n\n"
                + "- The evidence artifact was not uploaded.\n"
                + rest
            )
        text += "- Artifact: not uploaded; the GitHub job log is the only evidence\n"
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
        description="The GitHub Actions boundary of a Punch run "
        "(.github/workflows/_perf-execute.yml).",
    )
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--stage", choices=STAGES, help="Record the stage the GitHub job reached.")
    mode.add_argument(
        "--finalize",
        action="store_true",
        help="Set the final status; write the GitHub job summary.",
    )
    mode.add_argument(
        "--publish", action="store_true", help="Append the GitHub job summary and artifact link."
    )
    parsed = parser.parse_args(list(args))
    if parsed.stage:
        return stage(parsed.stage)
    if parsed.finalize:
        return finalize(os.environ)
    if parsed.publish:
        return publish(os.environ)
    return dispatch(os.environ)
