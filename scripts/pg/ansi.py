"""Tiny ANSI helpers. Degrade gracefully when NO_COLOR is set or stdout
is not a TTY — same rules as scripts/playground.mjs and ./dev."""

from __future__ import annotations

import os
import sys


def _use_color() -> bool:
    if os.environ.get("NO_COLOR"):
        return False
    return sys.stdout.isatty()


_USE = _use_color()


def _wrap(code: str, text: str) -> str:
    if not _USE:
        return text
    return f"\033[{code}m{text}\033[0m"


def green(text: str) -> str:  return _wrap("32", text)
def red(text: str) -> str:    return _wrap("31", text)
def yellow(text: str) -> str: return _wrap("33", text)
def bold(text: str) -> str:   return _wrap("1", text)
def dim(text: str) -> str:    return _wrap("2", text)


def pass_(label: str) -> None:
    print(f"  {green('✓')} {label}")


def fail(label: str) -> None:
    print(f"  {red('✗')} {label}")


def warn(label: str) -> None:
    print(f"  {yellow('!')} {label}")


def info(label: str) -> None:
    print(f"  {dim('→')} {label}")


def header(text: str) -> None:
    print()
    print(bold(text))
    print()
