#!/usr/bin/env bash
# Bring up the full playground stack: app + visualizer.
# Does NOT include the k6 performance runner — that lives in a separate
# compose file (infra/docker/compose.performance.yaml) and is invoked
# on-demand by pnpm pg:perf:smoke.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="${ROOT}/infra/docker/compose.yaml"

echo "→ Starting full stack (infra + visualizer)..."
# Explicit service list — see scripts/app-up.sh for why `bff` is excluded
# until its Dockerfile is wired in a follow-up iteration.
docker compose -f "${COMPOSE_FILE}" --profile visualizer up -d \
    postgres otel-collector visualizer-3d

# Readiness probe for the visualizer only. Postgres has its own healthcheck
# in compose.yaml and the BFF runs on the host (separate lifecycle), so we
# don't poll either of them here.
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
echo "    Visualizer ${VIZ_BASE}"
echo "    BFF        run on the host with: pnpm pg:dev  (→ http://localhost:3001)"
