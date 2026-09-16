# Browser-capable variant of k6.Dockerfile — identical build stage, but the
# runtime stage is grafana/k6's official "-with-browser" tag instead of the
# bare image. That tag ships Chromium and sets K6_BROWSER_HEADLESS=true /
# K6_BROWSER_ARGS=no-sandbox by default, so no manual apk/Chromium wiring is
# needed here. Kept as a separate Dockerfile (not a build arg on
# k6.Dockerfile) so the plain `k6` service's image stays small and doesn't
# carry a browser it never launches.
#
# Build context is the repo root (see compose.performance.yaml) — same
# reasoning as k6.Dockerfile.
FROM node:lts-alpine AS builder
WORKDIR /build
COPY tests/performance/k6/package.json tests/performance/k6/package-lock.json ./tests/performance/k6/
RUN cd tests/performance/k6 && npm ci
COPY tests/performance/k6/tsconfig.json ./tests/performance/k6/
COPY tests/performance/k6/support/ ./tests/performance/k6/support/
COPY tests/performance/k6/config/ ./tests/performance/k6/config/
COPY tests/performance/k6/scenarios/ ./tests/performance/k6/scenarios/
COPY vendor/punch/src/tests/support/ ./vendor/punch/src/tests/support/
WORKDIR /build/tests/performance/k6
RUN npm run build

FROM grafana/k6:0.54.0-with-browser
COPY --from=builder /build/tests/performance/k6/dist/ /scripts/scenarios/
COPY --chmod=755 scripts/k6-wrapper.sh /scripts/k6-wrapper.sh
COPY --chmod=755 infra/docker/entrypoint.sh /usr/local/bin/entrypoint.sh
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
