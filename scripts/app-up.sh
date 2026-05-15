#!/usr/bin/env bash
# Bring up the core app infrastructure: postgres + otel-collector.
#
# Scope note: in this iteration the BFF Dockerfile is not yet wired into the
# default startup path — its workspace-aware build is being addressed in a
# separate iteration. Today the BFF still runs on the host via `pnpm pg:dev`.
# The compose.yaml `bff` service stays defined so the design intent is
# visible, but it is not started here.
#
# Use scripts/full-up.sh to also start the visualizer-3d container.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="${ROOT}/infra/docker/compose.yaml"

echo "→ Starting app infrastructure (postgres, otel-collector)..."
docker compose -f "${COMPOSE_FILE}" up -d postgres otel-collector
echo "✓ Infrastructure is up."
echo "    Postgres on :5432, OTLP on :4317/:4318"
echo "    Start the BFF on the host: pnpm pg:dev  (until apps/bff/Dockerfile lands)"
