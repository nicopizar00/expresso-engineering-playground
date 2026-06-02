"""Wrapper around `docker compose` that always passes -f and handles
profile flags correctly (profiles are global flags BEFORE the subcommand,
not after — some compose versions reject the trailing form). See
playground.mjs:851 for the same workaround.
"""

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path
from typing import Iterable, List, Optional, Sequence

from pg.paths import COMPOSE_DEV_FILE, COMPOSE_FILE


def _flatten_profiles(profiles: Optional[Iterable[str]]) -> List[str]:
    if not profiles:
        return []
    flags: List[str] = []
    for name in profiles:
        flags.extend(["--profile", name])
    return flags


def base_cmd(
    *,
    profiles: Optional[Iterable[str]] = None,
    extra_files: Optional[Sequence[Path]] = None,
) -> List[str]:
    cmd = ["docker", "compose"]
    cmd.extend(_flatten_profiles(profiles))
    cmd.extend(["-f", str(COMPOSE_FILE)])
    for path in extra_files or ():
        cmd.extend(["-f", str(path)])
    return cmd


def run(
    args: Sequence[str],
    *,
    profiles: Optional[Iterable[str]] = None,
    extra_files: Optional[Sequence[Path]] = None,
    check: bool = True,
) -> int:
    cmd = base_cmd(profiles=profiles, extra_files=extra_files) + list(args)
    result = subprocess.run(cmd, check=False)
    if check and result.returncode != 0:
        raise SystemExit(result.returncode)
    return result.returncode


def capture(
    args: Sequence[str],
    *,
    profiles: Optional[Iterable[str]] = None,
    extra_files: Optional[Sequence[Path]] = None,
) -> subprocess.CompletedProcess:
    cmd = base_cmd(profiles=profiles, extra_files=extra_files) + list(args)
    return subprocess.run(cmd, capture_output=True, text=True, check=False)


def run_bff_dev(args: Sequence[str], *, check: bool = True) -> int:
    """One-off BFF container using the dev-stage image. Mirrors
    `compose_run_bff_dev` in ./dev:66."""
    cmd = (
        base_cmd(extra_files=[COMPOSE_DEV_FILE])
        + ["run", "--rm", "--no-deps", "bff"]
        + list(args)
    )
    result = subprocess.run(cmd, check=False)
    if check and result.returncode != 0:
        raise SystemExit(result.returncode)
    return result.returncode


def docker_available() -> bool:
    if not shutil.which("docker"):
        return False
    info = subprocess.run(
        ["docker", "info"], capture_output=True, text=True, check=False
    )
    return info.returncode == 0


def compose_available() -> bool:
    if not shutil.which("docker"):
        return False
    ver = subprocess.run(
        ["docker", "compose", "version"],
        capture_output=True,
        text=True,
        check=False,
    )
    return ver.returncode == 0
