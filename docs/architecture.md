# Architecture

## Execution chain

```
TypeScript source  →  esbuild  →  Docker image  →  k6 execution  →  reports
```

This linear flow is preserved by every change. Do not add branches or shortcuts.

## Folder map

| Path | Responsibility |
|------|-----------------|
| `src/tests/` | k6 test scenarios authored in TypeScript. One file per scenario (e.g., `smoke.ts`, `stress.ts`). |
| `dist/` | Bundler output — single ES module consumed by k6. Gitignored. |
| `docker/Dockerfile` | Builds the k6 runner image from `grafana/k6`. Copies the bundle and runs it. |
| `reports/` | JSON and summary output from k6 runs. Gitignored. CI uploads these as artifacts. |
| `docs/` | AI-friendly documentation: architecture, how-tos, decision log. |

## Tech stack

- **k6** — Load testing runtime (executes bundled JS).
- **TypeScript** — Authoring tests with types and editor support.
- **esbuild** — Bundles TypeScript to a single ES module k6 can run. Runs inside the Docker build stage; not required on the host.
- **Docker** — Primary interface. Multi-stage build handles bundling and execution. Host requires only Docker.
- **GitHub Actions** — CI entrypoint (planned): runs `docker compose build` + `docker compose run`, uploads reports.

## Current state

- ✓ TypeScript + esbuild build working (inside Docker build stage)
- ✓ Multi-stage Dockerfile: Node builder → grafana/k6 runner
- ✓ One smoke test example (`src/tests/smoke.ts`)
- ✓ Reports written to mounted `reports/` volume
- ⏳ GitHub Actions workflow (planned)
- ⏳ Report collection and artifact upload (planned)

## Why this shape

- **Docker First** — The host requires only Docker. Bundling (Node/esbuild) runs in a builder stage; execution runs in grafana/k6. Local and CI runs are identical.
- **No Node module deps in tests** — k6 runs in its own runtime, cannot require Node packages. esbuild handles the bundle.
- **Single bundle file** — Keeps Docker image simple and k6 execution straightforward.
- **docker-compose.yml is the source of truth for how to run** — The Dockerfile has no CMD; compose defines the full run command including output flags and volume paths.
