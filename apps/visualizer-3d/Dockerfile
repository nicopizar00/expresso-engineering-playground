# Static container for the visualizer-3d module.
#
# Deliberate non-goals:
#   - No Node build step. The browser loads Three.js via importmap (ESM).
#   - No bundler. The public/ directory is the deployable artifact.
#   - No application server. nginx:alpine serves static files only.
#
# Runtime config (VIZ_API_BASE_URL) is materialised into /usr/share/nginx/
# html/config.js at container start by docker-entrypoint.sh, so the same
# image can target localhost in dev or a remote BFF in CI without a rebuild.

FROM nginx:1.27-alpine

WORKDIR /usr/share/nginx/html

COPY public/ ./
COPY docker-entrypoint.sh /docker-entrypoint.d/40-write-config.sh
RUN chmod +x /docker-entrypoint.d/40-write-config.sh

EXPOSE 80
