"""perf — named k6 workflows delegated to scripts/pg/k6runner.py."""

from __future__ import annotations

import argparse
import shutil
from typing import Sequence

from pg.ansi import dim, header, info, pass_, warn
from pg.k6runner import run_k6
from pg.paths import PERF_REPORTS_DIR, WEB_PORT


def _confirm_output_data(args: Sequence[str], command: str) -> bool:
    parser = argparse.ArgumentParser(prog=f"./dev {command}")
    parser.add_argument("--confirm-output-data", action="store_true")
    return parser.parse_args(args).confirm_output_data


def smoke(args: Sequence[str]) -> int:
    return run_k6("smoke", confirm_output_data_flag=_confirm_output_data(args, "perf:smoke"))


def purchase_flow(args: Sequence[str]) -> int:
    return run_k6(
        "purchase-flow",
        confirm_output_data_flag=_confirm_output_data(args, "perf:purchase-flow"),
    )


def purchase_flow_browser(args: Sequence[str]) -> int:
    return run_k6(
        "purchase-flow-browser",
        confirm_output_data_flag=_confirm_output_data(args, "perf:purchase-flow-browser"),
        default_port=WEB_PORT,
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
