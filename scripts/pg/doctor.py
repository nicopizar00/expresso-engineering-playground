"""Doctor — validate Node, pnpm, Docker, .env. Mirrors playground.mjs:111
and ./dev:74. The Python rewrite drops the host-side Node/pnpm checks for
the Docker-first flow but keeps them as informational so the same tool
serves both paths.
"""

from __future__ import annotations

import shutil
import subprocess
import sys

from pg.ansi import bold, fail, green, header, info, pass_, red, warn
from pg.compose import compose_available, docker_available
from pg.paths import BFF_PORT, ENV_BOOTSTRAPPED, ENV_PATH, WEB_PORT
from pg.ports import port_in_use


def _capture(cmd: list[str]) -> str | None:
    try:
        out = subprocess.run(cmd, capture_output=True, text=True, check=False)
    except FileNotFoundError:
        return None
    if out.returncode != 0:
        return None
    return out.stdout.strip()


def run() -> int:
    header("Playground Doctor")
    ok = True

    # Python (we're already inside it, but useful to print).
    pass_(f"Python {sys.version.split()[0]}")

    # Docker.
    if shutil.which("docker"):
        ver = _capture(["docker", "--version"]) or "docker --version failed"
        if docker_available():
            pass_(ver)
        else:
            fail("Docker found but not responding — is Docker Desktop running?")
            ok = False
    else:
        fail("docker not found — install Docker Desktop")
        ok = False

    if compose_available():
        ver = _capture(["docker", "compose", "version"]) or "docker compose"
        pass_(ver)
    else:
        fail("docker compose not available — update Docker Desktop to 4.x+")
        ok = False

    # Optional host tooling.
    if shutil.which("pnpm"):
        ver = _capture(["pnpm", "--version"]) or "pnpm"
        pass_(f"pnpm {ver} (host)")
    else:
        info("pnpm not installed on host — fine for ./dev (Docker-first)")

    if shutil.which("node"):
        ver = _capture(["node", "--version"]) or "node"
        pass_(f"Node {ver} (host)")
    else:
        info("node not installed on host — fine for ./dev (Docker-first)")

    # .env file.
    if ENV_PATH.exists():
        if ENV_BOOTSTRAPPED:
            pass_(".env created from .env.example")
        else:
            pass_(".env exists")
    else:
        fail(".env not found and .env.example missing — restore .env.example")
        ok = False

    # Port snapshot — informational.
    print()
    if port_in_use(BFF_PORT):
        pass_(f"Port {BFF_PORT} (BFF) responding — service is running")
    else:
        info(f"Port {BFF_PORT} (BFF) not in use — run ./dev up to start")

    if port_in_use(WEB_PORT):
        pass_(f"Port {WEB_PORT} (web) responding — service is running")
    else:
        info(f"Port {WEB_PORT} (web) not in use — run ./dev up web to start")

    print()
    if ok:
        print(green("All required prerequisites are available."))
        print()
        return 0
    print(red("Some prerequisites are missing — resolve the issues above."))
    print()
    return 1
