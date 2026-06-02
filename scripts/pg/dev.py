"""dev — docker compose watch (containerised HMR) and dev:host (turbo on host).

Mirrors playground.mjs:293 and ./dev:238."""

from __future__ import annotations

import shutil
import subprocess

from pg.ansi import bold, dim, fail, header
from pg.paths import COMPOSE_DEV_FILE, COMPOSE_FILE


def watch() -> int:
    header("Starting dev stack (docker compose watch)...")
    print(dim("Tip: run ./dev up first so Postgres is healthy and migrations are applied."))
    print(dim("Ctrl+C to stop."))
    print()
    cmd = [
        "docker",
        "compose",
        "-f", str(COMPOSE_FILE),
        "-f", str(COMPOSE_DEV_FILE),
        "--profile", "web",
        "--profile", "viz",
        "watch",
    ]
    result = subprocess.run(cmd, check=False)
    return result.returncode


def host() -> int:
    """turbo run dev on the host. Escape hatch — requires pnpm installed."""
    if not shutil.which("pnpm"):
        fail("pnpm not found on host. Install pnpm 9 or use ./dev dev instead.")
        return 1
    header("Starting development applications (host mode)...")
    print(dim("Tip: run ./dev up core first to ensure Postgres is available."))
    print(dim("Ctrl+C to stop all processes."))
    print()
    return subprocess.run(["pnpm", "turbo", "run", "dev"], check=False).returncode
