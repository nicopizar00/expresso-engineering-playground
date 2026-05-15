#!/usr/bin/env bash
# Bring up the core app stack: postgres + otel-collector + bff.
#
# The BFF runs in its own container with a healthcheck; --wait blocks
# until postgres and bff report healthy. Use scripts/full-up.sh to also
# start the visualizer-3d container.
#
# For watch-mode development of the BFF code, `pnpm pg:dev` remains the
# recommended inner loop (this script runs the compiled image, not a
# nest --watch process).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="${ROOT}/infra/docker/compose.yaml"

echo "→ Starting app stack (postgres, otel-collector, bff)..."
docker compose -f "${COMPOSE_FILE}" up -d --wait postgres otel-collector bff
echo "✓ App stack is up."
echo "    Postgres :5432"
echo "    OTLP     :4317 / :4318"
echo "    BFF      http://localhost:3001  (health: /health)"
