#!/usr/bin/env bash
# Shim — delegates to pnpm pg:up full.
set -euo pipefail
exec pnpm pg:up full
