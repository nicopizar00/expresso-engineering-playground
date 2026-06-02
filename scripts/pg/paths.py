"""Filesystem and port constants resolved once at import time.

The repo root is derived from this file's location: scripts/pg/paths.py
sits three levels deep, so .parent.parent.parent is the root. Any other
piece of the package that needs paths or port defaults should import from
here so there's a single place to override.
"""

from __future__ import annotations

import os
from pathlib import Path

from pg.env import load_root_env

REPO_ROOT: Path = Path(__file__).resolve().parent.parent.parent
ENV_PATH: Path = REPO_ROOT / ".env"
ENV_EXAMPLE_PATH: Path = REPO_ROOT / ".env.example"

# Loaded eagerly so every command sees the same environment. The function
# is idempotent — duplicate calls do nothing.
ENV_BOOTSTRAPPED: bool = load_root_env(ENV_PATH, ENV_EXAMPLE_PATH)

COMPOSE_FILE: Path = REPO_ROOT / "infra" / "docker" / "compose.yaml"
COMPOSE_DEV_FILE: Path = REPO_ROOT / "infra" / "docker" / "compose.dev.yaml"
COMPOSE_PERF_FILE: Path = REPO_ROOT / "infra" / "docker" / "compose.performance.yaml"
PERF_REPORTS_DIR: Path = REPO_ROOT / "tests" / "performance" / "k6" / "reports"


def _port(name: str, default: int) -> int:
    raw = os.environ.get(name)
    if not raw:
        return default
    try:
        return int(raw)
    except ValueError:
        return default


BFF_PORT: int = _port("BFF_PORT", 3001)
WEB_PORT: int = _port("WEB_PORT", 3000)
VIZ_PORT: int = _port("VIZ_PORT", 3002)
STUDIO_PORT: int = _port("STUDIO_PORT", 5555)
GRAFANA_PORT: int = _port("GRAFANA_PORT", 3030)
PROMETHEUS_PORT: int = _port("PROMETHEUS_PORT", 9090)
TEMPO_PORT: int = _port("TEMPO_PORT", 3200)

API_BASE: str = f"http://localhost:{BFF_PORT}"
