"""perf — k6 scenarios via docker compose, built on scripts/pg/k6runner.py
(itself built on punch's subprocess-streaming primitive). Mirrors
playground.mjs:628 and ./dev:375.
"""

from __future__ import annotations

import shutil

from pg.ansi import dim, header, info, pass_, warn
from pg.k6runner import run_k6
from pg.paths import PERF_REPORTS_DIR


def smoke() -> int:
    return run_k6("smoke", "scenarios/smoke/smoke.js", summary_filename="smoke-summary.json")


def checkout_flow() -> int:
    return run_k6(
        "checkout-flow",
        "scenarios/checkout-flow/checkout-flow.js",
        summary_filename="checkout-flow-summary.json",
    )


def read_heavy() -> int:
    return run_k6(
        "read-heavy",
        "scenarios/read-heavy/read-heavy.js",
        summary_filename="read-heavy-summary.json",
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
