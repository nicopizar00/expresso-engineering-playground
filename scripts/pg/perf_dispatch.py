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
from pg.perf_chain import (
    BROWSER_SERVICE,
    CHAIN_REPORTS_DIR,
    RUNNER_WARNING,
    annotate,
    render_summary,
)
from pg.perf_forms import load_mode, recipes, sequence_label, standalone
from pg.perf_spec import (
    CUSTOM,
    CUSTOM_LABEL,
    LOAD_LABELS,
    MAX_STEPS,
    SpecError,
    StepRequest,
    custom_config_path,
    write_spec,
)

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
    chain_dir: Optional[Path] = None,
) -> int:
    """Start a fresh dispatch record, keep the form values, and write spec.json.
    Evidence from an earlier dispatch or chain in this checkout is removed first,
    so finalize never reports a run this dispatch did not start."""
    shutil.rmtree(dispatch_dir, ignore_errors=True)
    shutil.rmtree(chain_dir or CHAIN_REPORTS_DIR, ignore_errors=True)
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
    browser = any(
        catalog.workflows[step.workflow].compose_service == BROWSER_SERVICE for step in steps
    )
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
                f"step {step['step']} {step['workflow']} passed but left no k6 summary "
                "in the evidence"
            )
    return problems


def _status(
    record: Dict[str, Any], chain: Optional[Dict[str, Any]], job: str
) -> Tuple[str, List[str]]:
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
    record: Dict[str, Any],
    request: Mapping[str, str],
    chain: Optional[Dict[str, Any]],
    status: str,
) -> str:
    notes: List[str] = list(record.get("problems") or [])
    if status == "cancelled":
        notes.insert(0, "The run was cancelled.")
    elif status == "failed" and record.get("stage") == "execute" and chain is None:
        notes.append(
            "The job stopped during the execute stage before the chain wrote its result; "
            "files from steps that ran are under `chain/step-<n>-<workflow>/`."
        )
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
        + "\nRun:\n\n"
        + f"- Ref: `{event.get('ref')}` at `{event.get('sha')}`\n"
        + f"- Actor: @{record.get('actor')}\n"
        + f"- Stage reached: {record.get('stage')}\n"
    )


def finalize(
    environ: Mapping[str, str],
    dispatch_dir: Path = DISPATCH_DIR,
    chain_dir: Optional[Path] = None,
) -> int:
    """Set dispatch.json's final status and write summary.md. Exits 1 only when the
    job would otherwise pass without evidence; an already failed job stays failed."""
    chain_dir = chain_dir or CHAIN_REPORTS_DIR
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
            text = "## Failed" + heading[len("## Passed"):] + "\n\n" \
                + "- The evidence artifact was not uploaded.\n" + rest
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
        description="The GitHub Actions boundary of a Punch run "
                    "(.github/workflows/_perf-execute.yml).",
    )
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--stage", choices=STAGES, help="Record the stage the job reached.")
    mode.add_argument(
        "--finalize", action="store_true", help="Set the final status; write the job summary."
    )
    mode.add_argument(
        "--publish", action="store_true", help="Append the job summary and artifact link."
    )
    parsed = parser.parse_args(list(args))
    if parsed.stage:
        return stage(parsed.stage)
    if parsed.finalize:
        return finalize(os.environ)
    if parsed.publish:
        return publish(os.environ)
    return dispatch(os.environ)
