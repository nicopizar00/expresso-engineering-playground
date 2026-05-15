#!/usr/bin/env bash
# Bring up the full playground stack: app (postgres + otel-collector + bff)
# plus the visualizer-3d container.
#
# Does NOT include the k6 performance runner — that lives in a separate
# compose file (infra/docker/compose.performance.yaml) and is invoked
# on-demand by pnpm pg:perf:smoke.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="${ROOT}/infra/docker/compose.yaml"

echo "→ Starting full stack (app + visualizer)..."
# postgres and bff have compose healthchecks; --wait blocks until they
# report healthy. visualizer-3d has no healthcheck, so we poll it below.
docker compose -f "${COMPOSE_FILE}" --profile visualizer up -d --wait \
    postgres otel-collector bff visualizer-3d

VIZ_BASE="http://localhost:3002"
ready=0
for _ in $(seq 1 15); do
    if curl -sf -o /dev/null "${VIZ_BASE}/" \
        && curl -sf -o /dev/null "${VIZ_BASE}/config.js"; then
        ready=1
        break
    fi
    sleep 1
done

if [ "${ready}" -ne 1 ]; then
    echo "✗ Visualizer did not respond at ${VIZ_BASE}/ within 15s." >&2
    echo "  Inspect logs: docker compose -f ${COMPOSE_FILE} logs visualizer-3d" >&2
    exit 1
fi

echo ""
echo "✓ Full stack is up."
echo "    Postgres   :5432"
echo "    OTLP       :4317 / :4318"
echo "    BFF        http://localhost:3001  (health: /health)"
echo "    Visualizer ${VIZ_BASE}"
