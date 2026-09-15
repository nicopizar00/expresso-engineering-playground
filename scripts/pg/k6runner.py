"""Run repository-owned k6 workflows through Punch's public APIs."""

from __future__ import annotations

import os
import sys
from typing import Dict, Optional

from pg.ansi import fail, header, info, pass_, warn
from pg.paths import BFF_PORT, PERF_REPORTS_DIR, PERF_WORKFLOWS_DIR
from pg.ports import port_in_use

# pg.paths initializes PUNCH_SRC before these public Punch imports.
from punch.execution import confirm_output_data, execute_workflow
from punch.workflow import WorkflowError, load_workflow


def default_base_url() -> str:
    return os.environ.get("BASE_URL") or f"http://host.docker.internal:{BFF_PORT}"


def run_k6(
    workflow_name: str,
    *,
    extra_env: Optional[Dict[str, str]] = None,
    confirm_output_data_flag: bool = False,
) -> int:
    """Load and execute one named, repository-owned k6 workflow."""
    workflow_path = PERF_WORKFLOWS_DIR / f"{workflow_name}.yaml"
    try:
        workflow = load_workflow(workflow_path)
    except WorkflowError as error:
        fail(f"Could not load k6 workflow {workflow_name}: {error}")
        return 1

    header(f"Performance {workflow.name} (k6)")
    base_url = default_base_url()
    environment = {**os.environ, "BASE_URL": base_url, **(extra_env or {})}

    info(f"Target  : {base_url}")
    info(f"Scenario: {workflow.k6_script}")
    print()

    if (
        ("localhost" in base_url or "host.docker.internal" in base_url)
        and not port_in_use(BFF_PORT)
    ):
        warn(f"BFF does not appear to be listening on :{BFF_PORT}. Start it with: ./dev up")
        print()

    output_data_confirmed = confirm_output_data(
        [workflow],
        assume_yes=confirm_output_data_flag,
        stdin=sys.stdin,
        stdout=sys.stdout,
    )
    result = execute_workflow(
        workflow,
        environment=environment,
        output_data_confirmed=output_data_confirmed,
        stdout=sys.stdout,
        stderr=sys.stderr,
        log_path=PERF_REPORTS_DIR / "logs" / f"k6-{workflow.name}.log",
    )
    print()
    if result.passed:
        pass_(f"k6 {workflow.name} completed.")
        print()
        return 0

    if result.child_exit_code is not None:
        fail(f"k6 {workflow.name} failed (exit code {result.child_exit_code}).")
        return result.child_exit_code

    fail(f"k6 {workflow.name} failed: {result.failure}")
    return 1
