#!/usr/bin/env bash
# Stop the full playground stack (app + visualizer). Leaves volumes intact.
# To wipe Postgres data:
#   docker compose -f infra/docker/compose.yaml --profile visualizer down -v
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="${ROOT}/infra/docker/compose.yaml"

echo "→ Stopping full stack..."
docker compose -f "${COMPOSE_FILE}" --profile visualizer down
echo "✓ Full stack stopped."
