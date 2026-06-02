"""down / reset / restart. Mirror playground.mjs:572 and ./dev:216."""

from __future__ import annotations

from typing import Sequence

from pg import compose, up
from pg.ansi import bold, header, info, pass_, yellow

_ALL_PROFILES = ["web", "viz", "admin", "obs"]


def down() -> int:
    header("Stopping services...")
    compose.run(["down"], profiles=_ALL_PROFILES, check=False)
    print()
    pass_("Services stopped.")
    print()
    return 0


def reset() -> int:
    header("Resetting local environment...")
    print(yellow("This stops all containers. Postgres data volumes are preserved."))
    print(
        "  To also remove volumes (destructive): docker compose "
        + " ".join(f"--profile {p}" for p in _ALL_PROFILES)
        + " -f infra/docker/compose.yaml down -v"
    )
    print()
    compose.run(["down"], profiles=_ALL_PROFILES, check=False)
    print()
    pass_("All containers stopped.")
    info(f"Run {bold('./dev up')} to bring infrastructure back up.")
    print()
    return 0


def restart(args: Sequence[str]) -> int:
    target = args[0] if args else "full"
    header(f"Restarting local app stack ({target})...")
    compose.run(["down"], profiles=_ALL_PROFILES, check=False)
    pass_("Services stopped")
    print()
    return up.run([target])
