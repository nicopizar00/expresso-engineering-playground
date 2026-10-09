"""perf — repository-owned k6 workflows (pg.workflows) delegated to k6runner.

Dataset produce/require behavior lives in each workflow's spec.data and is
handled by Punch; these commands only pick the workflow and target port.
`--produce <dataset>`, `--data <dataset>=<path>`, and `--config <preset|path>`
(the k6 options JSON for `k6 run --config`) pass straight through.
"""

from __future__ import annotations

import shutil
from typing import Sequence

from pg.ansi import dim, header, info, pass_, warn
from pg.k6runner import run_k6
from pg.paths import PERF_REPORTS_DIR
from pg.workflows import WORKFLOWS


def run(name: str, args: Sequence[str]) -> int:
    return run_k6(name, args, default_port=WORKFLOWS[name])


def open_report() -> int:
    header("Latest k6 report")
    if not PERF_REPORTS_DIR.exists():
        warn(f"{PERF_REPORTS_DIR} does not exist yet — run ./dev perf:http-purchase first.")
        return 0
    entries = sorted(
        e for e in PERF_REPORTS_DIR.iterdir() if not e.name.startswith(".")
    )
    if not entries:
        warn("No reports found — run ./dev perf:http-purchase first.")
        return 0
    for entry in entries:
        info(str(entry))
    print()
    print(dim("Tip: pipe a JSON summary through jq to inspect thresholds, e.g.:"))
    print(dim(f"  jq '.metrics.http_req_duration' {PERF_REPORTS_DIR}/http-purchase-summary.json"))
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
