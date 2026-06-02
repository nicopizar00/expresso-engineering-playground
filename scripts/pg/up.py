"""up — start local infrastructure. Mirrors playground.mjs:199 and ./dev:129.

Target → profile + service mapping is the single source of truth here. Add
`obs` once Slice B lands; until then it raises.
"""

from __future__ import annotations

import time
from typing import List, Sequence

from pg import compose
from pg.ansi import bold, fail, header, info, pass_, warn
from pg.paths import BFF_PORT, ENV_BOOTSTRAPPED, STUDIO_PORT, VIZ_PORT, WEB_PORT
from pg.ports import pid_on_port, port_in_use

VALID_TARGETS = ("core", "web", "viz", "admin", "obs", "full")


def _parse(args: Sequence[str]) -> tuple[str, bool]:
    target = "core"
    fresh = False
    for arg in args:
        if arg == "--fresh":
            fresh = True
        elif arg in VALID_TARGETS:
            target = arg
        elif arg:
            fail(f"Unknown argument '{arg}'. Use: {' | '.join(VALID_TARGETS)} [--fresh]")
            raise SystemExit(1)
    return target, fresh


def _profiles_for(target: str) -> List[str]:
    profiles: List[str] = []
    if target in ("web", "full"):
        profiles.append("web")
    if target in ("viz", "full"):
        profiles.append("viz")
    if target in ("admin", "full"):
        profiles.append("admin")
    if target in ("obs", "full"):
        profiles.append("obs")
    return profiles


def _extra_services(target: str) -> List[str]:
    extra: List[str] = []
    if target in ("web", "full"):
        extra.append("web")
    if target in ("viz", "full"):
        extra.append("visualizer-3d")
    if target in ("admin", "full"):
        extra.append("prisma-studio")
    if target in ("obs", "full"):
        extra.extend(["tempo", "prometheus", "grafana"])
    return extra


def run(args: Sequence[str]) -> int:
    target, fresh = _parse(args)

    if fresh:
        header(f"Fresh start ({target}) — dropping postgres volume...")
        warn("This will delete all database data (catalog, orders). Cart is in-memory.")
        compose.run(
            ["down", "-v", "--remove-orphans"],
            profiles=["web", "viz", "admin", "obs"],
            check=False,
        )
        pass_("Volumes removed")
        print()

    header(f"Starting local app stack ({target})...")

    if ENV_BOOTSTRAPPED:
        pass_(".env created from .env.example")

    # Port collision pre-flight (additive: only error on foreign holders).
    if port_in_use(BFF_PORT):
        own = compose.capture(["ps", "--services", "--filter", "status=running"])
        if "bff" in (own.stdout or "").splitlines():
            info(f"Port {BFF_PORT} held by our bff container — reconciling in place")
        else:
            warn(f"Port {BFF_PORT} is in use — stopping existing services...")
            compose.run(["down"], profiles=["web", "viz", "admin", "obs"], check=False)
            time.sleep(1.5)
            if port_in_use(BFF_PORT):
                pid = pid_on_port(BFF_PORT)
                fail(
                    f"Port {BFF_PORT} still occupied"
                    + (f" (PID {pid})" if pid else "")
                    + " after stopping Docker services."
                )
                info(f"Kill the non-Docker process: kill {pid or '<PID>'}")
                return 1
            pass_(f"Port {BFF_PORT} is free")

    # 1. Always-on dependencies.
    compose.run(["up", "-d", "--wait", "postgres", "otel-collector"])
    pass_("Postgres is healthy")

    # 2. Migrations + seed via a dev-stage one-off container so the host
    #    does not need pnpm/Prisma installed.
    info("Running prisma migrate deploy...")
    compose.run_bff_dev(
        ["pnpm", "--filter", "@mini-commerce/bff", "exec", "prisma", "migrate", "deploy"]
    )
    pass_("Schema is up to date")

    info("Running prisma db seed...")
    compose.run_bff_dev(
        ["pnpm", "--filter", "@mini-commerce/bff", "exec", "prisma", "db", "seed"]
    )
    pass_("Seed complete")

    # 3. BFF + any profiled services for the requested target.
    profiles = _profiles_for(target)
    extra = _extra_services(target)
    compose.run(["up", "-d", "--wait", "bff", *extra], profiles=profiles)

    print()
    pass_(f"BFF is running on http://localhost:{BFF_PORT}")
    if "web" in extra:
        pass_(f"Web is running on http://localhost:{WEB_PORT}")
    if "visualizer-3d" in extra:
        pass_(f"Visualizer is running on http://localhost:{VIZ_PORT}")
    if "prisma-studio" in extra:
        pass_(f"Prisma Studio is running on http://localhost:{STUDIO_PORT}")
    if "grafana" in extra:
        # Grafana port is provisioned by pg.paths.GRAFANA_PORT.
        from pg.paths import GRAFANA_PORT
        pass_(f"Grafana is running on http://localhost:{GRAFANA_PORT}")
    print()
    info(f"Run {bold('./dev dev')} for hot-reload (docker compose watch)")
    info(f"Run {bold('./dev status')} to check service health")
    print()
    return 0
