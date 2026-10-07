"""Run repository-owned k6 workflows through Punch's public APIs."""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Dict, Optional, Sequence

from pg.ansi import fail, header, info, pass_, warn
from pg.paths import BFF_PORT, PERF_REPORTS_DIR, PERF_WORKFLOWS_DIR, WEB_PORT
from pg.ports import port_in_use

# pg.paths initializes PUNCH_SRC before these public Punch imports.
from punch.catalog import CatalogError, WorkflowCatalog, load_catalog
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
from punch.workflow import K6Workflow, WorkflowError, load_workflow


def default_base_url(port: int = BFF_PORT) -> str:
    return os.environ.get("BASE_URL") or f"http://host.docker.internal:{port}"


def _readiness_hint(port: int) -> tuple[str, str]:
    """What's expected to be listening on `port`, and how to start it.

    browser-purchase drives the web app's UI directly (port 3000);
    every other workflow calls the BFF (port 3001).
    """
    if port == WEB_PORT:
        return "web app", "./dev up web"
    return "BFF", "./dev up"


def _print_metrics(summary_path: Path) -> None:
    """Print the k6 summary this repo's test scripts write via handleSummary()."""
    if not summary_path.exists():
        return
    try:
        summary = json.loads(summary_path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return

    header("k6 metrics")
    info(f"Requests     : {summary.get('totalRequests', '?')}")
    info(f"Error rate   : {summary.get('errorRate', 0) * 100:.2f}%")
    info(f"p90 duration : {summary.get('p90Ms', 0):.1f} ms")
    info(f"Check pass   : {summary.get('checkPassRate', 0) * 100:.2f}%")
    info(f"Duration     : {summary.get('durationMs', 0) / 1000:.1f}s")
    print()


def _parse_data_args(workflow_name: str, args: Sequence[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(prog=f"./dev perf:{workflow_name}")
    parser.add_argument(
        "--produce", action="append", default=[], metavar="DATASET",
        help="Write a declared dataset (repeatable, or 'all').",
    )
    parser.add_argument(
        "--data", action="append", default=[], metavar="DATASET=PATH",
        help="Read a required dataset from PATH (beneath the workflow's data directory).",
    )
    return parser.parse_args(list(args))


def _announce_data(
    workflow: K6Workflow, catalog: WorkflowCatalog, produce: Sequence[str]
) -> None:
    if workflow.data is None:
        return
    for product in workflow.data.produces:
        state = (
            f"writing {product.dataset}.csv"
            if product.dataset in produce
            else f"not written (add --produce {product.dataset})"
        )
        info(f"Produces {product.dataset} → {', '.join(product.targets)}: {state}")
    for dataset in workflow.data.requires:
        info(f"Requires {dataset} ← {', '.join(catalog.producers_of(dataset))}")
    print()


def run_k6(
    workflow_name: str,
    args: Sequence[str] = (),
    *,
    extra_env: Optional[Dict[str, str]] = None,
    default_port: int = BFF_PORT,
) -> int:
    """Load and execute one named, repository-owned k6 workflow."""
    parsed = _parse_data_args(workflow_name, args)
    workflow_path = PERF_WORKFLOWS_DIR / f"{workflow_name}.yaml"
    try:
        workflow = load_workflow(workflow_path)
        catalog = load_catalog(PERF_WORKFLOWS_DIR)
        produce = validate_produce(workflow, parsed.produce)
        overrides = resolve_data_overrides(workflow, parsed.data)
    except (WorkflowError, CatalogError, ValueError) as error:
        fail(f"Could not prepare k6 workflow {workflow_name}: {error}")
        return 1

    header(f"Punch orchestrator — {workflow.name} (k6)")
    base_url = default_base_url(default_port)
    environment = {**os.environ, "BASE_URL": base_url, **(extra_env or {})}

    info(f"Target  : {base_url}")
    info(f"Scenario: {workflow.k6_script}")
    print()

    if (
        ("localhost" in base_url or "host.docker.internal" in base_url)
        and not port_in_use(default_port)
    ):
        label, start_cmd = _readiness_hint(default_port)
        warn(f"{label} does not appear to be listening on :{default_port}. Start it with: {start_cmd}")
        print()

    _announce_data(workflow, catalog, produce)
    command = build_compose_run_command(
        workflow, environment, data_env=data_environment(workflow, overrides)
    )
    # An explicit --produce is already a deliberate, scripted choice, so it
    # also skips the Docker prompt.
    docker_run_confirmed = confirm_docker_run(
        command,
        assume_yes=bool(produce),
        stdin=sys.stdin,
        stdout=sys.stdout,
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
    if result.child_exit_code is not None:
        confirm_delete_consumed(
            required_data_paths(workflow, overrides), stdin=sys.stdin, stdout=sys.stdout
        )
    if result.passed:
        pass_(f"k6 {workflow.name} completed.")
        for dataset in result.datasets:
            info(f"Wrote {dataset.record_count} {dataset.dataset} rows to {dataset.path}")
        print()
        if workflow.summary_output is not None:
            _print_metrics(workflow.summary_output.path)
        return 0

    if result.child_exit_code:
        fail(f"k6 {workflow.name} failed (exit code {result.child_exit_code}).")
        return result.child_exit_code

    fail(f"k6 {workflow.name} failed: {result.failure}")
    return 1
