# Builds this repo's own k6 TypeScript scenarios. Mirrors punch's own
# docker/k6.Dockerfile build pattern exactly (node:lts-alpine esbuild
# builder -> grafana/k6 runtime). A build-arg'd version of punch's own
# Dockerfile was considered and rejected in favor of this small,
# repo-owned copy — see docs/specs/punch-submodule-integration.md INT-005.
#
# Build context is the repo root (see compose.performance.yaml) so both
# this repo's scenario sources and the punch submodule's shared report
# helper are available, at their real repo-relative paths, matching what
# the source files' relative imports expect both here and on a local
# checkout.
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

FROM grafana/k6:0.54.0
COPY --from=builder /build/tests/performance/k6/dist/ /scripts/scenarios/
COPY --chmod=755 scripts/k6-wrapper.sh /scripts/k6-wrapper.sh
COPY --chmod=755 infra/docker/entrypoint.sh /usr/local/bin/entrypoint.sh
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
