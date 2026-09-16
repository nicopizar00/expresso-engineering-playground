#!/usr/bin/env python3
"""Interactive picker for repository-owned k6 workflows.

Standalone entry point: run directly with `python3 scripts/pg/perf_menu.py`
(or `./scripts/pg/perf_menu.py`). Not wired into `pg.cli`'s dispatch table —
this is a picker on top of the same run_k6/campaign machinery `./dev perf:*`
already uses, not a replacement for those commands.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path
from typing import List, Optional

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from pg import campaign  # noqa: E402
from pg.ansi import header, info  # noqa: E402
from pg.k6runner import default_base_url, run_k6  # noqa: E402
from pg.paths import PERF_WORKFLOWS_DIR  # noqa: E402


def discover_workflows() -> List[str]:
    return sorted(p.stem for p in PERF_WORKFLOWS_DIR.glob("*.yaml"))


def build_campaign_argv(
    *, descriptor_path: Optional[str], confirm_output_data: bool
) -> List[str]:
    argv: List[str] = []
    if descriptor_path:
        argv.append(descriptor_path)
    if confirm_output_data:
        argv.append("--confirm-output-data")
    return argv


def run_selection(
    workflow_name: str,
    *,
    base_url: str,
    confirm_output_data: bool,
    descriptor_path: Optional[str] = None,
) -> int:
    os.environ["BASE_URL"] = base_url
    if workflow_name == "campaign":
        return campaign.run(
            build_campaign_argv(
                descriptor_path=descriptor_path, confirm_output_data=confirm_output_data
            )
        )
    return run_k6(workflow_name, confirm_output_data_flag=confirm_output_data)


def _prompt(question: str, default: Optional[str] = None) -> str:
    suffix = f" [{default}]" if default else ""
    answer = input(f"{question}{suffix}: ").strip()
    return answer or (default or "")


def _choose_workflow(workflows: List[str]) -> str:
    header("Available k6 workflows")
    for index, name in enumerate(workflows, start=1):
        info(f"{index}) {name}")
    print()
    while True:
        choice = _prompt("Pick a workflow number", default="1")
        try:
            selected = workflows[int(choice) - 1]
        except (ValueError, IndexError):
            print("Invalid choice, try again.")
            continue
        return selected


def _choose_base_url() -> str:
    default_url = default_base_url()
    print()
    print(f"1) Default ({default_url})")
    print("2) Custom URL")
    choice = _prompt("Pick an environment", default="1")
    if choice == "2":
        return _prompt("Enter BASE_URL", default=default_url)
    return default_url


def _choose_confirm_output_data() -> bool:
    answer = _prompt("Confirm output-data export if the workflow requests it? (y/N)", default="n")
    return answer.lower().startswith("y")


def _choose_campaign_descriptor() -> Optional[str]:
    answer = _prompt(
        "Campaign descriptor path (blank = default morning-rush.json)", default=""
    )
    return answer or None


def main() -> int:
    workflows = discover_workflows()
    if not workflows:
        print(f"No workflow YAMLs found under {PERF_WORKFLOWS_DIR}.")
        return 1

    while True:
        workflow_name = _choose_workflow(workflows)
        base_url = _choose_base_url()
        confirm_output_data = _choose_confirm_output_data()
        descriptor_path = (
            _choose_campaign_descriptor() if workflow_name == "campaign" else None
        )

        print()
        rc = run_selection(
            workflow_name,
            base_url=base_url,
            confirm_output_data=confirm_output_data,
            descriptor_path=descriptor_path,
        )
        print()

        again = _prompt("Run another workflow? (y/N)", default="n")
        if not again.lower().startswith("y"):
            return rc


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        print()
        raise SystemExit(130)
