# How to Run

## Prerequisites

- Docker only. No Node, no k6 on the host.

## Local execution

### 1. Build the images

```bash
./bin/build
```

This runs a two-stage Docker build:
1. **Builder stage** — installs Node dependencies and runs esbuild inside a `node:lts-alpine` container, producing `dist/smoke.js`.
2. **Runner stage** — copies the bundle into the `grafana/k6` image. No Node in the final image.

### 2. Run the smoke test

```bash
./bin/test-smoke
```

Builds images if needed, starts the API, waits for it to be healthy, then runs k6. Results are written to `reports/smoke.json` via the mounted volume. The script exits with k6's exit code.

### 3. Clean up

```bash
./bin/clean
```

Stops containers and removes locally-built images. Run this before a clean rebuild.

## Adding a new test

1. Create `src/tests/mytest.ts` following k6 patterns (see `smoke.ts`).
2. Add a build script entry to `package.json` for the new file.
3. Update the Dockerfile `COPY` and `docker-compose.yml` `command:` for the new script, or create a separate compose service.

## Troubleshooting

- **Docker build fails** — Check that `src/tests/smoke.ts` and `tsconfig.json` are present. The builder stage runs `npm run build` internally.
- **Test fails** — The container runs the bundled JS. Rebuild after any source change with `./bin/build`, or just re-run `./bin/test-smoke` (it rebuilds automatically).
- **reports/ is empty** — Ensure the `reports/` directory exists on the host (it is gitignored but created automatically by Docker volume mount on first run).
