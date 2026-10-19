"""Run repository-owned k6 jobs through Punch's public APIs."""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Dict, Optional, Sequence, Tuple

from pg.ansi import fail, header, info, pass_, warn
from pg.paths import (
    BFF_PORT,
    PERF_JOBS_DIR,
    PERF_OPTIONS_DIR,
    PERF_REPORTS_DIR,
    WEB_PORT,
)
from pg.ports import port_in_use

# pg.paths initializes PUNCH_SRC before these public Punch imports.
from punch.catalog import CatalogError, JobCatalog, load_catalog
from punch.execution import (
    ExecutionResult,
    build_compose_run_command,
    confirm_delete_consumed,
    confirm_docker_run,
    data_environment,
    execute_job,
    required_data_paths,
    resolve_data_args,
    validate_produce,
)
from punch.job import JobError, K6Job, load_job, read_k6_config


def default_base_url(port: int = BFF_PORT) -> str:
    return os.environ.get("BASE_URL") or f"http://host.docker.internal:{port}"


def _readiness_hint(port: int) -> tuple[str, str]:
    """What's expected to be listening on `port`, and how to start it.

    browser-purchase drives the web app's UI directly (port 3000);
    every other job calls the BFF (port 3001).
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


def _parse_data_args(job_name: str, args: Sequence[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(prog=f"./dev perf:{job_name}")
    parser.add_argument(
        "--produce", action="append", default=[], metavar="DATASET",
        help="Write a declared dataset (repeatable, or 'all').",
    )
    parser.add_argument(
        "--data", action="append", default=[], metavar="DATASET=PATH|default",
        help="Read a dataset from PATH (beneath the job's data directory), or "
             "'default' to skip an optional dataset and use the scenario's built-in data.",
    )
    parser.add_argument(
        "--config", default=None, metavar="PRESET|PATH",
        help="k6 options JSON for `k6 run --config`: a preset name from "
             "tests/performance/k6/options/ or a file path (default: the job's "
             "spec.k6.config).",
    )
    return parser.parse_args(list(args))


def resolve_config(value: Optional[str]) -> Optional[Path]:
    """A preset name (options/<name>.json) or a path to a k6 options JSON."""
    if value is None:
        return None
    path = Path(value)
    if not path.is_file() and (PERF_OPTIONS_DIR / f"{value}.json").is_file():
        path = PERF_OPTIONS_DIR / f"{value}.json"
    read_k6_config(path)
    return path.resolve()


def _announce_data(
    job: K6Job, catalog: JobCatalog, produce: Sequence[str]
) -> None:
    if job.data is None:
        return
    for product in job.data.produces:
        state = (
            f"writing {product.dataset}.csv"
            if product.dataset in produce
            else f"not written (add --produce {product.dataset})"
        )
        info(f"Produces {product.dataset} → {', '.join(product.targets)}: {state}")
    for dataset in job.data.requires:
        info(f"Requires {dataset} ← {', '.join(catalog.producers_of(dataset))}")
    print()


def run_k6(
    job_name: str,
    args: Sequence[str] = (),
    *,
    extra_env: Optional[Dict[str, str]] = None,
    default_port: int = BFF_PORT,
) -> int:
    """Load and execute one named, repository-owned k6 job."""
    exit_code, _result = execute_k6(
        job_name, args, extra_env=extra_env, default_port=default_port
    )
    return exit_code


def execute_k6(
    job_name: str,
    args: Sequence[str] = (),
    *,
    extra_env: Optional[Dict[str, str]] = None,
    default_port: int = BFF_PORT,
    interactive: bool = True,
) -> Tuple[int, Optional[ExecutionResult]]:
    """run_k6 plus Punch's execution result (None when the job, its
    arguments, or its config could not be loaded).

    `interactive=False` never prompts: no Docker confirmation and no offer to
    delete consumed data, which a later workflow step may still read.
    """
    parsed = _parse_data_args(job_name, args)
    job_path = PERF_JOBS_DIR / f"{job_name}.yaml"
    try:
        job = load_job(job_path)
        catalog = load_catalog(PERF_JOBS_DIR)
        produce = validate_produce(job, parsed.produce)
        overrides, choices = resolve_data_args(job, parsed.data)
        config = resolve_config(parsed.config) or job.k6_config
    except (JobError, CatalogError, ValueError) as error:
        fail(f"Could not prepare k6 job {job_name}: {error}")
        return 1, None

    header(f"Punch orchestrator — {job.name} (k6)")
    base_url = default_base_url(default_port)
    environment = {**os.environ, "BASE_URL": base_url, **(extra_env or {})}

    info(f"Target  : {base_url}")
    info(f"Scenario: {job.k6_script}")
    info(f"Config  : {config.name if config is not None else 'script options'}")
    print()

    if (
        ("localhost" in base_url or "host.docker.internal" in base_url)
        and not port_in_use(default_port)
    ):
        label, start_cmd = _readiness_hint(default_port)
        warn(f"{label} does not appear to be listening on :{default_port}. Start it with: {start_cmd}")
        print()

    _announce_data(job, catalog, produce)
    command = build_compose_run_command(
        job,
        environment,
        data_env=data_environment(job, overrides, choices),
        config=config,
    )
    # An explicit --produce is already a deliberate, scripted choice, so it
    # also skips the Docker prompt.
    docker_run_confirmed = confirm_docker_run(
        command,
        assume_yes=bool(produce) or not interactive,
        stdin=sys.stdin,
        stdout=sys.stdout,
    )
    result = execute_job(
        job,
        environment=environment,
        produce=produce,
        data_overrides=overrides,
        optional_choices=choices,
        producers_of=catalog.producers_of,
        docker_run_confirmed=docker_run_confirmed,
        stdout=sys.stdout,
        stderr=sys.stderr,
        log_path=PERF_REPORTS_DIR / "logs" / f"k6-{job.name}.log",
        config=config,
    )
    print()
    if result.child_exit_code is not None and interactive:
        confirm_delete_consumed(
            required_data_paths(job, overrides), stdin=sys.stdin, stdout=sys.stdout
        )
    if result.passed:
        pass_(f"k6 {job.name} completed.")
        for dataset in result.datasets:
            info(f"Wrote {dataset.record_count} {dataset.dataset} rows to {dataset.path}")
        print()
        if job.summary_output is not None:
            _print_metrics(job.summary_output.path)
        return 0, result

    if result.child_exit_code:
        fail(f"k6 {job.name} failed (exit code {result.child_exit_code}).")
        return result.child_exit_code, result

    fail(f"k6 {job.name} failed: {result.failure}")
    return 1, result
