#!/usr/bin/env bash
# Shim — delegates to pnpm pg:up core.
set -euo pipefail
exec pnpm pg:up core
