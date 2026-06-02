"""Dispatch layer. Argparse-based to avoid third-party deps, but
sub-command dispatch is hand-rolled because the legacy CLI uses colon
names (perf:smoke etc.) that argparse subparsers refuse.
"""

from __future__ import annotations

from typing import Callable, Dict, List, Sequence

from pg.ansi import bold, dim

# Lazy import command modules so a syntax error in one doesn't break --help.
def _doctor(_a: Sequence[str]) -> int:
    from pg import doctor
    return doctor.run()


def _up(args: Sequence[str]) -> int:
    from pg import up
    return up.run(args)


def _down(_a: Sequence[str]) -> int:
    from pg import down
    return down.down()


def _reset(_a: Sequence[str]) -> int:
    from pg import down
    return down.reset()


def _restart(args: Sequence[str]) -> int:
    from pg import down
    return down.restart(args)


def _dev(_a: Sequence[str]) -> int:
    from pg import dev
    return dev.watch()


def _dev_host(_a: Sequence[str]) -> int:
    from pg import dev
    return dev.host()


def _smoke(_a: Sequence[str]) -> int:
    from pg import smoke
    return smoke.run()


def _seed(_a: Sequence[str]) -> int:
    from pg import seed
    return seed.run()


def _status(_a: Sequence[str]) -> int:
    from pg import status
    return status.run()


def _logs(_a: Sequence[str]) -> int:
    from pg import logs
    return logs.run()


def _open(_a: Sequence[str]) -> int:
    from pg import open_cmd
    return open_cmd.run()


def _perf_smoke(_a: Sequence[str]) -> int:
    from pg import perf
    return perf.smoke()


def _perf_checkout(_a: Sequence[str]) -> int:
    from pg import perf
    return perf.checkout_flow()


def _perf_read_heavy(_a: Sequence[str]) -> int:
    from pg import perf
    return perf.read_heavy()


def _perf_open_report(_a: Sequence[str]) -> int:
    from pg import perf
    return perf.open_report()


def _perf_clean(_a: Sequence[str]) -> int:
    from pg import perf
    return perf.clean()


def _hack(args: Sequence[str]) -> int:
    # Slice C lands the hack sub-app — until then, point users at the plan.
    try:
        from pg import hack  # type: ignore
    except ImportError:
        print(dim("./dev hack — not yet wired (Slice C). See plan."))
        return 1
    return hack.dispatch(args)


COMMANDS: Dict[str, Callable[[Sequence[str]], int]] = {
    "doctor": _doctor,
    "up": _up,
    "down": _down,
    "reset": _reset,
    "restart": _restart,
    "dev": _dev,
    "dev:host": _dev_host,
    "smoke": _smoke,
    "seed": _seed,
    "status": _status,
    "logs": _logs,
    "open": _open,
    "perf:smoke": _perf_smoke,
    "perf:checkout-flow": _perf_checkout,
    "perf:read-heavy": _perf_read_heavy,
    "perf:open-report": _perf_open_report,
    "perf:clean": _perf_clean,
    "hack": _hack,
}


def _usage() -> None:
    print()
    print(bold("dev — Docker-first developer CLI (Python)"))
    print()
    print("Requires: Docker Desktop  |  Python ≥ 3.9 on PATH.")
    print()
    print(f"Usage: {bold('./dev <command> [args]')}")
    print()
    print("Commands:")
    for name in COMMANDS:
        print(f"  ./dev {bold(name)}")
    print()


def main(argv: List[str]) -> int:
    if not argv:
        _usage()
        return 0
    command = argv[0]
    if command in ("-h", "--help", "help"):
        _usage()
        return 0
    handler = COMMANDS.get(command)
    if not handler:
        _usage()
        return 1
    try:
        return handler(argv[1:])
    except KeyboardInterrupt:
        return 130
