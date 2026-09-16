"""perf — named k6 workflows delegated to scripts/pg/k6runner.py."""

from __future__ import annotations

import argparse
import shutil
import sys
from pathlib import Path
from typing import IO, Sequence

from pg.ansi import dim, fail, header, info, pass_, warn
from pg.k6runner import run_k6
from pg.paths import PERF_DATA_DIR, PERF_REPORTS_DIR, WEB_PORT

# Rows are plain `cartId,productId,sid`, no header — see cart-fulfill.ts's
# console.log and _csv_payload in vendor/punch/src/punch/execution.py.
CART_FULFILL_CSV_NAME = "cart-fulfill-carts.csv"


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


def cart_fulfill(args: Sequence[str]) -> int:
    header("cart-fulfill produces data")
    info("Reserves carts, stops before checkout; each cart emitted as a [CSV] record.")
    info("Target workflows (consume these cart ids):")
    info("  place-order — ./dev perf:place-order")
    result = run_k6(
        "cart-fulfill",
        confirm_output_data_flag=_confirm_output_data(args, "perf:cart-fulfill"),
    )
    if result == 0:
        _duplicate_cart_fulfill_csv()
    return result


def _duplicate_cart_fulfill_csv() -> None:
    """Keep reports/ (Punch's declared evidence record) untouched; place-order
    reads a separate duplicate under data/ instead — see the design note in
    scenarios/place-order/place-order.ts."""
    source = PERF_REPORTS_DIR / CART_FULFILL_CSV_NAME
    if not source.exists():
        return
    PERF_DATA_DIR.mkdir(parents=True, exist_ok=True)
    destination = PERF_DATA_DIR / CART_FULFILL_CSV_NAME
    shutil.copyfile(source, destination)
    info(f"Duplicated to {destination} for place-order to consume.")


def place_order(args: Sequence[str]) -> int:
    data_path = PERF_DATA_DIR / CART_FULFILL_CSV_NAME
    if not _has_csv_data(data_path):
        fail(
            f"No cart data at {data_path}. "
            "Run ./dev perf:cart-fulfill --confirm-output-data first."
        )
        return 1

    result = run_k6(
        "place-order",
        confirm_output_data_flag=_confirm_output_data(args, "perf:place-order"),
    )

    if data_path.exists():
        if _confirm_delete_data(data_path, stdin=sys.stdin, stdout=sys.stdout):
            data_path.unlink()
            pass_(f"Deleted {data_path}.")
        else:
            info(f"Kept {data_path}. Re-run ./dev perf:cart-fulfill to refresh it.")

    return result


def _has_csv_data(path: Path) -> bool:
    if not path.is_file():
        return False
    return any(line.strip() for line in path.read_text(encoding="utf-8").splitlines())


def _confirm_delete_data(path: Path, *, stdin: IO[str], stdout: IO[str]) -> bool:
    """Only a real interactive terminal is asked; non-interactive runs never
    delete on their own, matching Punch's confirm_docker_run/confirm_output_data
    pattern in vendor/punch/src/punch/execution.py."""
    if not stdin.isatty():
        return False
    stdout.write(f"Delete consumed cart data ({path})? [y/N] ")
    stdout.flush()
    return stdin.readline().strip().lower() in {"y", "yes"}


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
