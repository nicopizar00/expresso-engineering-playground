# k6-ts-docker

A clean proof-of-concept for running k6 performance tests written in TypeScript, packaged in Docker, and executed in CI.

## Goal

Demonstrate a maintainable, end-to-end performance testing pipeline that is easy to read, extend, and reason about.

## Quick start

Requires only Docker — no Node, no k6 on the host.

```bash
./bin/build        # Build images (bundles TypeScript internally)
./bin/test-smoke   # Run smoke test; results appear in reports/
./bin/clean        # Tear down containers and locally-built images
```

## Execution chain

Every change preserves this linear pipeline:

```
TypeScript source  →  esbuild  →  Docker image  →  k6 run  →  reports
```

If a change doesn't fit this flow, discuss it first.

## What's where

| Path | Purpose |
|------|---------|
| `src/tests/` | k6 test scenarios (TypeScript) |
| `dist/` | Bundled, k6-ready JavaScript |
| `docker/Dockerfile` | Builds the runtime image |
| `reports/` | Test output (JSON, summaries) |
| `docs/` | Architecture, how-tos, AI context |

## Next steps

See [`docs/roadmap-track-a-performance-gate.md`](docs/roadmap-track-a-performance-gate.md) for the planned evolution toward a service-owned performance gate.

See `CLAUDE.md` for contribution rules.
