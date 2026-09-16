"""Run repository-owned k6 workflows through Punch's public APIs."""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import Dict, Optional

from pg.ansi import fail, header, info, pass_, warn
from pg.paths import BFF_PORT, PERF_REPORTS_DIR, PERF_WORKFLOWS_DIR, WEB_PORT
from pg.ports import port_in_use

# pg.paths initializes PUNCH_SRC before these public Punch imports.
from punch.execution import (
    build_compose_run_command,
    confirm_docker_run,
    confirm_output_data,
    execute_workflow,
)
from punch.workflow import WorkflowError, load_workflow


def default_base_url(port: int = BFF_PORT) -> str:
    return os.environ.get("BASE_URL") or f"http://host.docker.internal:{port}"


def _readiness_hint(port: int) -> tuple[str, str]:
    """What's expected to be listening on `port`, and how to start it.

    purchase-flow-browser drives the web app's UI directly (port 3000);
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


def run_k6(
    workflow_name: str,
    *,
    extra_env: Optional[Dict[str, str]] = None,
    confirm_output_data_flag: bool = False,
    default_port: int = BFF_PORT,
) -> int:
    """Load and execute one named, repository-owned k6 workflow."""
    workflow_path = PERF_WORKFLOWS_DIR / f"{workflow_name}.yaml"
    try:
        workflow = load_workflow(workflow_path)
    except WorkflowError as error:
        fail(f"Could not load k6 workflow {workflow_name}: {error}")
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

    output_data_confirmed = confirm_output_data(
        [workflow],
        assume_yes=confirm_output_data_flag,
        stdin=sys.stdin,
        stdout=sys.stdout,
    )
    command = build_compose_run_command(workflow, environment)
    docker_run_confirmed = confirm_docker_run(
        command,
        assume_yes=confirm_output_data_flag,
        stdin=sys.stdin,
        stdout=sys.stdout,
    )
    result = execute_workflow(
        workflow,
        environment=environment,
        output_data_confirmed=output_data_confirmed,
        docker_run_confirmed=docker_run_confirmed,
        stdout=sys.stdout,
        stderr=sys.stderr,
        log_path=PERF_REPORTS_DIR / "logs" / f"k6-{workflow.name}.log",
    )
    print()
    if result.passed:
        pass_(f"k6 {workflow.name} completed.")
        print()
        if workflow.summary_output is not None:
            _print_metrics(workflow.summary_output.path)
        return 0

    if result.child_exit_code:
        fail(f"k6 {workflow.name} failed (exit code {result.child_exit_code}).")
        return result.child_exit_code

    fail(f"k6 {workflow.name} failed: {result.failure}")
    return 1
