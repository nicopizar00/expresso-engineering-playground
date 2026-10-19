"""perf — repository-owned k6 jobs (pg.jobs) delegated to k6runner.

Dataset produce/require behavior lives in each job's spec.data and is
handled by Punch; these commands only pick the job and target port.
`--produce <dataset>`, `--data <dataset>=<path>`, and `--config <preset|path>`
(the k6 options JSON for `k6 run --config`) pass straight through.
`--runtime k8s` runs the same job on Argo Workflows instead (pg.k8s_perf).
"""

from __future__ import annotations

import shutil
from typing import List, Sequence, Tuple

from pg.ansi import dim, fail, header, info, pass_, warn
from pg.jobs import JOBS
from pg.k6runner import run_k6
from pg.paths import PERF_REPORTS_DIR

RUNTIMES = ("compose", "k8s")


def split_runtime(args: Sequence[str]) -> Tuple[str, List[str]]:
    """Pull `--runtime <compose|k8s>` out of a perf command's arguments."""
    runtime = "compose"
    rest: List[str] = []
    items = list(args)
    while items:
        arg = items.pop(0)
        if arg == "--runtime" and items:
            runtime = items.pop(0)
        elif arg.startswith("--runtime="):
            runtime = arg.split("=", 1)[1]
        else:
            rest.append(arg)
    if runtime not in RUNTIMES:
        raise ValueError(f"unknown runtime '{runtime}' (use: {', '.join(RUNTIMES)})")
    return runtime, rest


def run(name: str, args: Sequence[str]) -> int:
    try:
        runtime, rest = split_runtime(args)
    except ValueError as error:
        fail(str(error))
        return 1
    if runtime == "k8s":
        from pg import k8s_perf
        return k8s_perf.run_job(name, rest)
    return run_k6(name, rest, default_port=JOBS[name])


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
