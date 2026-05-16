#!/usr/bin/env bash
# Shim — delegates to pnpm pg:up viz.
set -euo pipefail
exec pnpm pg:up viz
