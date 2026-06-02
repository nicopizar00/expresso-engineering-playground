"""open — print local URLs. Module is suffixed `_cmd` because `open` is a
Python builtin and we'd shadow it otherwise.
"""

from __future__ import annotations

from pg.ansi import dim, green, header
from pg.paths import (
    BFF_PORT,
    GRAFANA_PORT,
    PROMETHEUS_PORT,
    STUDIO_PORT,
    TEMPO_PORT,
    VIZ_PORT,
    WEB_PORT,
)


def run() -> int:
    header("Local URLs")
    print(f"  Web app             {green(f'http://localhost:{WEB_PORT}')}  (entry point — links every surface)")
    print(f"  BFF / API           {green(f'http://localhost:{BFF_PORT}')}")
    print(f"  Health endpoint     {green(f'http://localhost:{BFF_PORT}/health')}")
    print(f"  3D Visualizer       {green(f'http://localhost:{VIZ_PORT}')}  (needs 'up viz' or 'up full')")
    print(f"  Prisma Studio       {green(f'http://localhost:{STUDIO_PORT}')}  (needs 'up admin' or 'up full' — direct DB, no events)")
    print(f"  Grafana             {green(f'http://localhost:{GRAFANA_PORT}')}  (needs 'up obs' or 'up full')")
    print(f"  Prometheus          {green(f'http://localhost:{PROMETHEUS_PORT}')}  (needs 'up obs' or 'up full')")
    print(f"  Tempo (HTTP API)    {green(f'http://localhost:{TEMPO_PORT}')}  (needs 'up obs' or 'up full')")
    print(f"  OTLP HTTP           {dim('http://localhost:4318')}  (otel-collector)")
    print(f"  OTLP gRPC           {dim('http://localhost:4317')}  (otel-collector)")
    print()
    print(dim("See docs/local-development.md for full setup instructions."))
    print()
    return 0
