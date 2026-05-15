# AI Context

This file helps AI assistants understand the project philosophy and constraints.

## Read this first

1. `CLAUDE.md` — Rules for all changes.
2. This file — Why the project is shaped the way it is.
3. `architecture.md` — Folder map and execution chain.
4. `how-to-run.md` — Commands to build and run.

## Philosophy

**Docker First.** Docker is the primary interface. The host requires only Docker. npm, Node, and esbuild run inside the Docker build stage — they are implementation details, not user-facing tools. Do not add host-side prerequisites.

**Small, reviewable, linear.** The execution chain is strictly: TypeScript → bundle (inside Docker) → k6 image → run → report. Every change should fit this flow. Do not add parallel paths, shortcuts, or hidden steps.

**No premature abstraction.** Three similar lines are better than a clever helper. If adding a helper, confirm it's needed for a third real use case.

**No unnecessary dependencies.** Every dependency must earn its place. Standard library or a few lines of code suffice? Use those.

**AI-friendly.** File names, directory layout, and scripts are self-describing. Avoid hidden conventions.

## Constraints

- **k6 runtime limitation** — k6 cannot require Node modules. Tests must be bundled to a single ES module. esbuild handles this inside the Docker build stage.
- **Execution chain is sacred** — Do not shortcut, branch, or skip steps. The chain is: source → bundle (in builder stage) → k6 image → execution → reports.
- **docker-compose.yml is the run interface** — Dockerfile has no CMD. The compose `command:` is the single source of truth for how k6 is invoked.
- **No abstractions ahead of use** — Wait for the third real scenario before extracting a helper.

## Before adding anything

Ask:
- Does it fit the execution chain?
- Is it necessary, or does code/stdlib suffice?
- Is it a premature abstraction?
- Does the structure in `CLAUDE.md` have room for it?

If uncertain, ask before implementing.

## Common tasks

**Adding a test scenario:** Create `src/tests/mytest.ts`. Follow k6 conventions (see `smoke.ts`). Add a build script entry in `package.json`. Update the Dockerfile `COPY` and compose `command:` or add a new compose service.

**Changing the bundler:** Only if esbuild stops working. Document the decision in this file. Ensure single-bundle-file output is preserved.

**Adding a dependency:** Justify in a comment in `package.json`. Consider whether it's truly necessary.

**Changing the Docker image:** Document in `docs/architecture.md` why. The image must run the bundled script unchanged. Keep the k6 version pinned (`grafana/k6:x.y.z` in Dockerfile).

## Decision log

- **esbuild as bundler** — Lightweight, fast, minimal config. Single-file output matches k6's needs.
- **Multi-stage Dockerfile** — Builder stage (Node/esbuild) + runner stage (grafana/k6). Host needs only Docker.
- **Docker Compose as run interface** — Defines the full run command (flags, output path, volume). Dockerfile has no CMD to avoid ambiguity.
- **k6 image pinned to explicit version** — `grafana/k6:latest` is unpinned and risks silent breakage. Pin to a specific release; update intentionally.
- **No GitHub Actions yet** — CI workflow is a separate task to avoid scope creep. Will be added when tests are stable.
