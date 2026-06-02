"""Root .env loading + auto-bootstrap from .env.example.

Mirrors the behaviour of scripts/playground.mjs lines 20-35: if .env is
missing but .env.example exists, copy it. Then parse key=value lines into
os.environ, preferring values already present (so callers can still
override via the shell).
"""

from __future__ import annotations

import os
import re
import shutil
from pathlib import Path

_LINE_RE = re.compile(r"^([A-Z0-9_]+)=(.*)$")


def load_root_env(env_path: Path, example_path: Path) -> bool:
    """Load env_path into os.environ; bootstrap from example if missing.

    Returns True iff env_path was just created from example_path.
    """
    bootstrapped = False
    if not env_path.exists() and example_path.exists():
        try:
            shutil.copyfile(example_path, env_path)
            bootstrapped = True
        except OSError:
            # Surface the failure on the first variable lookup instead of
            # crashing import-time — matches the JS implementation.
            return False

    if not env_path.exists():
        return bootstrapped

    try:
        text = env_path.read_text(encoding="utf-8")
    except OSError:
        return bootstrapped

    for line in text.splitlines():
        match = _LINE_RE.match(line)
        if not match:
            continue
        key, value = match.group(1), match.group(2)
        # Existing env wins so users can override per-shell.
        if key not in os.environ:
            os.environ[key] = value

    return bootstrapped
