"""status — render running container state for every profile we know about.
Mirrors ./dev:249 (the bash version) more than playground.mjs:526 because
we want to see exited services from the web/viz/admin/obs profiles too.
"""

from __future__ import annotations

from pg import compose
from pg.ansi import header, info, warn

_ALL_PROFILES = ["web", "viz", "admin", "obs"]


def run() -> int:
    header("Service Status")
    listing = compose.capture(["ps", "-a"], profiles=_ALL_PROFILES)
    if listing.returncode != 0:
        warn("Could not reach Docker. Is Docker Desktop running?")
        print()
        return 0
    output = listing.stdout.strip()
    if not output:
        info("No services running. Run ./dev up to start.")
    else:
        print(output)
    print()
    return 0
