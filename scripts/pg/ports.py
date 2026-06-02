"""Port-state helpers used by doctor + up to detect collisions and explain
who holds the port. Mirrors playground.mjs:865-878 + ./dev:58."""

from __future__ import annotations

import socket
import subprocess
from typing import Optional


def port_in_use(port: int, host: str = "127.0.0.1", timeout: float = 0.5) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(timeout)
        try:
            sock.connect((host, port))
            return True
        except OSError:
            return False


def pid_on_port(port: int) -> Optional[str]:
    """Best-effort PID lookup via lsof. Returns None on macOS without lsof
    or when nothing is bound."""
    try:
        result = subprocess.run(
            ["lsof", "-ti", f":{port}"],
            check=False,
            capture_output=True,
            text=True,
            timeout=2.0,
        )
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return None
    pid = result.stdout.strip().splitlines()
    return pid[0] if pid else None
