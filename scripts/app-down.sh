#!/usr/bin/env bash
# Shim — delegates to pnpm pg:down.
set -euo pipefail
exec pnpm pg:down
