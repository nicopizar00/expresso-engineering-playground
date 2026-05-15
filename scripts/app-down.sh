#!/usr/bin/env bash
# Stop the core app stack. Leaves volumes in place.
# To wipe Postgres data: docker compose -f infra/docker/compose.yaml down -v
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="${ROOT}/infra/docker/compose.yaml"

echo "→ Stopping app infrastructure..."
docker compose -f "${COMPOSE_FILE}" stop postgres otel-collector
echo "✓ Infrastructure stopped."
