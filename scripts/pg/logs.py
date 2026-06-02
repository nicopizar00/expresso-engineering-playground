"""logs — stream docker compose logs. Ctrl+C to stop."""

from __future__ import annotations

import subprocess

from pg.ansi import dim, header
from pg.paths import COMPOSE_FILE


def run() -> int:
    header("Docker Compose logs")
    print(dim("Streaming (Ctrl+C to stop)..."))
    print()
    return subprocess.run(
        ["docker", "compose", "-f", str(COMPOSE_FILE), "logs", "--follow"],
        check=False,
    ).returncode
