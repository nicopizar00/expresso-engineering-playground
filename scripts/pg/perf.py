"""perf — k6 scenarios via docker compose. Mirrors playground.mjs:628 and
./dev:375. One generic runner + four named entry points so the user-facing
commands stay terse.
"""

from __future__ import annotations

import os
import shutil
import subprocess
from pathlib import Path

from pg.ansi import bold, dim, fail, header, info, pass_, warn
from pg.paths import BFF_PORT, COMPOSE_PERF_FILE, PERF_REPORTS_DIR
from pg.ports import port_in_use


def _default_base_url() -> str:
    return os.environ.get("BASE_URL") or f"http://host.docker.internal:{BFF_PORT}"


def _run_scenario(scenario_label: str, scenario_path: str, summary_filename: str) -> int:
    header(f"Performance {scenario_label} (k6)")
    base_url = _default_base_url()
    summary_in_container = f"/scripts/reports/{summary_filename}"
    summary_on_host = PERF_REPORTS_DIR / summary_filename

    info(f"Target  : {base_url}")
    info(f"Scenario: {scenario_path}")
    info(f"Summary : {summary_on_host.relative_to(Path.cwd()) if summary_on_host.is_relative_to(Path.cwd()) else summary_on_host}")
    print()

    if (
        ("localhost" in base_url or "host.docker.internal" in base_url)
        and not port_in_use(BFF_PORT)
    ):
        warn(f"BFF does not appear to be listening on :{BFF_PORT}. Start it with: ./dev up")
        print()

    cmd = [
        "docker", "compose", "-f", str(COMPOSE_PERF_FILE),
        "run", "--rm", "-e", f"BASE_URL={base_url}", "k6",
        "run", "--summary-export", summary_in_container,
        f"/scripts/{scenario_path}",
    ]
    result = subprocess.run(cmd, check=False)
    print()
    if result.returncode == 0:
        pass_(f"k6 {scenario_label} completed.")
        info(f"Summary written to {summary_on_host}")
        print()
        return 0
    fail(f"k6 {scenario_label} failed (exit code {result.returncode}).")
    return result.returncode


def smoke() -> int:
    return _run_scenario("smoke", "scenarios/smoke/smoke.js", "smoke-summary.json")


def checkout_flow() -> int:
    return _run_scenario(
        "checkout-flow",
        "scenarios/checkout-flow/checkout-flow.js",
        "checkout-flow-summary.json",
    )


def read_heavy() -> int:
    return _run_scenario(
        "read-heavy",
        "scenarios/read-heavy/read-heavy.js",
        "read-heavy-summary.json",
    )


def open_report() -> int:
    header("Latest k6 report")
    if not PERF_REPORTS_DIR.exists():
        warn(f"{PERF_REPORTS_DIR} does not exist yet — run ./dev perf:smoke first.")
        return 0
    entries = sorted(
        e for e in PERF_REPORTS_DIR.iterdir() if not e.name.startswith(".")
    )
    if not entries:
        warn("No reports found — run ./dev perf:smoke first.")
        return 0
    for entry in entries:
        info(str(entry))
    print()
    print(dim("Tip: pipe a JSON summary through jq to inspect thresholds, e.g.:"))
    print(dim(f"  jq '.metrics.http_req_duration' {PERF_REPORTS_DIR}/smoke-summary.json"))
    print()
    return 0


def clean() -> int:
    header("Cleaning k6 reports")
    if not PERF_REPORTS_DIR.exists():
        info(f"{PERF_REPORTS_DIR} does not exist — nothing to clean.")
        return 0
    removed = 0
    for entry in PERF_REPORTS_DIR.iterdir():
        if entry.name == ".gitkeep":
            continue
        if entry.is_dir():
            shutil.rmtree(entry)
        else:
            entry.unlink()
        removed += 1
    pass_(f"Removed {removed} report artifact{'' if removed == 1 else 's'}.")
    print()
    return 0
