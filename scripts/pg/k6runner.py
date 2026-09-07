"""Shared k6-via-Docker invocation helper for perf.py and campaign.py,
built on punch's subprocess-streaming primitive rather than a separately
maintained equivalent. See docs/specs/punch-submodule-integration.md
INT-002.

`_stream` is imported from punch's own module (not a published, versioned
API — it's a leading-underscore internal helper). This is an intentional,
accepted coupling to punch's internals for now; if punch's maintainers
later expose a stable public equivalent, switch to that instead.
"""

from __future__ import annotations

import os
from typing import Dict, Optional

# pg.paths must be imported before punch.__main__: importing it is what
# inserts vendor/punch/src onto sys.path (see the PUNCH_SRC bootstrap in
# pg/paths.py), which is what makes `punch` importable at all.
from pg.ansi import fail, header, info, pass_, warn
from pg.paths import BFF_PORT, COMPOSE_PERF_FILE, PERF_REPORTS_DIR
from pg.ports import port_in_use

# Reused primitive from punch's internals; see the module docstring above
# for why this leading-underscore import is an intentional, accepted coupling.
from punch.__main__ import _stream


def default_base_url() -> str:
    return os.environ.get("BASE_URL") or f"http://host.docker.internal:{BFF_PORT}"


def run_k6(
    label: str,
    script_path: str,
    *,
    summary_filename: Optional[str] = None,
    extra_env: Optional[Dict[str, str]] = None,
) -> int:
    """Run one k6 scenario via docker compose, streaming output through
    punch's primitive. If summary_filename is given, passes --summary-export
    (for scenarios that don't yet have their own handleSummary); omit it
    once a scenario defines handleSummary, since k6 ignores --summary-export
    when handleSummary is present.
    """
    header(f"Performance {label} (k6)")
    base_url = default_base_url()
    summary_on_host = PERF_REPORTS_DIR / summary_filename if summary_filename else None

    info(f"Target  : {base_url}")
    info(f"Scenario: {script_path}")
    if summary_on_host:
        info(f"Summary : {summary_on_host}")
    print()

    if (
        ("localhost" in base_url or "host.docker.internal" in base_url)
        and not port_in_use(BFF_PORT)
    ):
        warn(f"BFF does not appear to be listening on :{BFF_PORT}. Start it with: ./dev up")
        print()

    env_args = ["-e", f"BASE_URL={base_url}"]
    for key, value in (extra_env or {}).items():
        env_args += ["-e", f"{key}={value}"]

    run_args = ["run"]
    if summary_filename:
        run_args += ["--summary-export", f"/scripts/reports/{summary_filename}"]
    run_args.append(f"/scripts/{script_path}")

    cmd = [
        "docker", "compose", "-f", str(COMPOSE_PERF_FILE),
        "run", "--rm", *env_args, "k6", *run_args,
    ]
    returncode = _stream(cmd)
    print()
    if returncode == 0:
        pass_(f"k6 {label} completed.")
        if summary_on_host:
            info(f"Summary written to {summary_on_host}")
        print()
        return 0
    fail(f"k6 {label} failed (exit code {returncode}).")
    return returncode
