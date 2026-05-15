# k6-ts-docker

A small, maintainable proof-of-concept for running k6 performance tests written
in TypeScript, packaged in Docker, and executed via GitHub Actions.

## Purpose

Demonstrate a clean, end-to-end pipeline for performance testing that is easy
for both humans and AI coding assistants to read, extend, and reason about.

Long-term goal: evolve into a reusable GitHub Actions-based performance gate
that other service teams can consume without owning the pipeline internals. See
`docs/roadmap-track-a-performance-gate.md` for the planned evolution path.

## Execution chain

The project follows a single, linear pipeline. Every change should preserve it:

    TypeScript source  →  bundle (single JS file)  →  Docker image  →
    k6 execution       →  reports (JSON / summary)

If a proposed change does not fit this chain, stop and discuss before adding it.

## Tech stack

- **k6** — load testing runtime (executes the bundled JS).
- **TypeScript** — author tests with types and editor support.
- **esbuild** — bundles TypeScript to a single ES module consumable by k6 (k6
  does not run Node modules directly). Runs inside the Docker build stage; not
  required on the host.
- **Docker** — reproducible execution environment based on the official
  `grafana/k6` image.
- **GitHub Actions** — runs the Docker image on push / PR / manual dispatch and
  uploads reports as artifacts.

## Intended project structure

    .
    ├── CLAUDE.md              # this file — rules for humans and AI
    ├── README.md              # quickstart for humans
    ├── package.json           # TypeScript + bundler deps only
    ├── tsconfig.json
    ├── src/
    │   ├── api/              # minimal local Node HTTP service that k6 targets
    │   └── tests/             # one file per scenario (e.g. smoke.ts)
    ├── dist/                  # bundled k6-ready JS (gitignored)
    ├── reports/               # k6 output (gitignored)
    ├── docker/
    │   ├── api.Dockerfile     # builds the local API service image
    │   └── k6.Dockerfile      # builds image that runs the bundle
    └── .github/
        └── workflows/
            └── k6.yml         # CI entrypoint

Anything not listed here needs justification before being added.

## Rules

1. **Docker First.** Docker is the primary interface for building, running, and
   validating the project. The host requires only Docker — no Node, no k6, no
   other runtimes. `npm`/bundler invocations happen inside the Docker build
   stage and are implementation details, not user-facing commands.
2. **Small, reviewable steps.** Each change should be understandable in one
   sitting. Prefer multiple small PRs over one large one.
3. **No unnecessary dependencies.** Every dependency must earn its place. If
   the standard library or a few lines of code suffice, use those.
4. **No premature abstraction.** Three similar lines are better than a clever
   helper. Wait for the third real use case before extracting.
5. **Preserve the execution chain.** Source → bundle → image → run → report.
   Don't shortcut or branch it.
6. **AI-friendly.** File names, directory layout, and scripts should be
   self-describing. Avoid hidden conventions.
7. **Don't implement ahead of the plan.** Follow the agreed step list; flag
   anything that requires going beyond it.

## Common commands

- `./bin/build` — build images (bundles TypeScript internally).
- `./bin/test-smoke` — build if needed, start the API, run the smoke test; results appear in `reports/`.
- `./bin/clean` — tear down containers and remove locally-built images.

## For AI assistants

- Read this file first.
- Before adding files, dependencies, or abstractions, confirm they fit the
  execution chain and the structure above.
- Propose changes in small, reviewable steps. Do not implement a full feature
  in one pass unless explicitly asked.
- When in doubt, ask.
