"""Dispatch layer. Argparse-based to avoid third-party deps, but
sub-command dispatch is hand-rolled because the legacy CLI uses colon
names (perf:http-purchase etc.) that argparse subparsers refuse.
"""

from __future__ import annotations

from typing import Callable, Dict, List, Sequence

from pg.ansi import bold, dim, fail
from pg.jobs import JOBS

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


def _k8s_up(args: Sequence[str]) -> int:
    from pg import k8s
    return k8s.up(args)


def _k8s_forward(_a: Sequence[str]) -> int:
    from pg import k8s
    return k8s.forward()


def _k8s_status(_a: Sequence[str]) -> int:
    from pg import k8s
    return k8s.status()


def _k8s_down(_a: Sequence[str]) -> int:
    from pg import k8s
    return k8s.down()


def _k8s_perf_up(args: Sequence[str]) -> int:
    from pg import k8s_perf
    return k8s_perf.up(args)


def _argocd_up(args: Sequence[str]) -> int:
    from pg import argocd
    return argocd.up(args)


def _perf(name: str) -> Callable[[Sequence[str]], int]:
    def run(args: Sequence[str]) -> int:
        from pg import perf
        return perf.run(name, args)
    return run


def _perf_workflow(args: Sequence[str]) -> int:
    from pg import perf_workflow
    return perf_workflow.run(args)


def _perf_forms(args: Sequence[str]) -> int:
    from pg import perf_forms
    return perf_forms.run(args)


def _perf_dispatch(args: Sequence[str]) -> int:
    from pg import perf_dispatch
    return perf_dispatch.run(args)


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
    "k8s:up": _k8s_up,
    "k8s:forward": _k8s_forward,
    "k8s:status": _k8s_status,
    "k8s:down": _k8s_down,
    "k8s:perf:up": _k8s_perf_up,
    "argocd:up": _argocd_up,
    **{f"perf:{name}": _perf(name) for name in JOBS},
    "perf:workflow": _perf_workflow,
    "perf:forms": _perf_forms,
    "perf:dispatch": _perf_dispatch,
    "perf:open-report": _perf_open_report,
    "perf:clean": _perf_clean,
    "hack": _hack,
}

# Old command names that fail with their replacement instead of the usage text.
RENAMED: Dict[str, str] = {"perf:chain": "perf:workflow"}


def _usage() -> None:
    print()
    print(bold("dev — Docker-first developer CLI (Python)"))
    print()
    print("Requires: Docker Desktop  |  Python ≥ 3.9 on PATH.")
    print("Performance commands additionally require Punch's pinned dependency:")
    print("  python3 -m pip install -r vendor/punch/requirements.txt")
    print("Data-producing jobs write their dataset only with --produce <dataset> (e.g. perf:http-cart --produce carts).")
    print("perf:* take their k6 load shape from --config <preset|path> (e.g. perf:http-purchase --config 5-vu-5m).")
    print("perf:* --runtime k8s runs the job on Argo Workflows (after ./dev k8s:perf:up).")
    print("perf:workflow <job>[:<shape>] ... runs jobs in order; each step's data feeds the next (e.g. perf:workflow http-cart http-orders:5-vu-5m).")
    print("perf:workflow --spec <spec.json> runs a spec written by perf:dispatch (the GitHub perf forms' boundary).")
    print("perf:forms --write|--check derives the perf-job/perf-workflow GitHub form options from the catalog and custom configs.")
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
        if command in RENAMED:
            fail(f"{command} was renamed to {RENAMED[command]}")
            return 1
        _usage()
        return 1
    try:
        return handler(argv[1:])
    except KeyboardInterrupt:
        return 130
