#!/usr/bin/env bash
# Bring up only the visualizer-3d service. Useful when the app stack is
# already running (or when targeting a remote BFF via VIZ_API_BASE_URL).
#
# Override the BFF target without rebuilding:
#   VIZ_API_BASE_URL=https://staging.example ./scripts/visualizer-up.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="${ROOT}/infra/docker/compose.yaml"

echo "→ Starting visualizer-3d..."
docker compose -f "${COMPOSE_FILE}" --profile visualizer up -d visualizer-3d

# Readiness probe. nginx usually answers within a couple of seconds; we give
# it up to ~15s before declaring the container unhealthy. The BFF has its own
# lifecycle (host-side `pnpm pg:dev` today) and is deliberately not polled.
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

echo "✓ Visualizer is up on ${VIZ_BASE}"
