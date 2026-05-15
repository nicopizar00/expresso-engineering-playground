#!/usr/bin/env bash
# Stop only the visualizer-3d service.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="${ROOT}/infra/docker/compose.yaml"

echo "→ Stopping visualizer-3d..."
docker compose -f "${COMPOSE_FILE}" --profile visualizer stop visualizer-3d
echo "✓ Visualizer stopped."
