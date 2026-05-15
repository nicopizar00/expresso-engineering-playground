#!/bin/sh
# Materialise runtime config into a tiny JS shim consumed by scene.js.
# nginx runs every executable in /docker-entrypoint.d/ before starting,
# so this happens once per container start.
set -eu

API_BASE_URL="${VIZ_API_BASE_URL:-http://localhost:3001}"

cat > /usr/share/nginx/html/config.js <<EOF
// Generated at container start by docker-entrypoint.sh. Do not edit.
window.__VIZ_CONFIG__ = Object.freeze({
  apiBaseUrl: "${API_BASE_URL}"
});
EOF
