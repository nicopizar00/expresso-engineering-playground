# CLAUDE.md

Guidance for Claude Code (claude.ai/code) when working in this repository.

This file is the **entry pointer** for a Claude Code session. The full
playbook lives at [`docs/ai/claude/playbook.md`](docs/ai/claude/playbook.md);
the cross-assistant frame lives at [`docs/ai/README.md`](docs/ai/README.md).
Read those before non-trivial work.

## Working agreements (durable)

- **No AI attribution.** Never add `Co-Authored-By: Claude`,
  `Generated with Claude Code`, or any other Claude/Anthropic marker to
  commits, PR descriptions, or generated docs.
- **English** for committed content. Conversation with the owner may be
  Spanish.
- **No real names, URLs, IPs, or credentials** in committed content. The
  domain is fictional.

## What this repo is

An engineering playground for a fictional mini-commerce store (catalog →
cart → checkout → orders → 3D visualizer). A modular monolith today; Phase 3
extracts modules into services. Container inventory lives in
[`docs/architecture/containers.md`](docs/architecture/containers.md); BFF
module pattern in
[`docs/architecture/bff-modules.md`](docs/architecture/bff-modules.md).

## Commands

### Developer loop

```bash
cp .env.example .env

./dev up            # postgres + otel-collector + bff (auto-migrate + seed)
./dev up web        # + Next.js
./dev up obs        # + Tempo + Prometheus + Grafana
./dev up full       # everything
./dev dev           # docker compose watch (BFF + web hot reload)
./dev smoke         # 15 endpoint checks (typed scene shape + SSE frame)
./dev down          # stop
```

Full CLI matrix (with `pnpm pg:*` and `task` equivalents and the `hack`
debugging affordances) lives in
[`docs/cli-reference.md`](docs/cli-reference.md). Orchestrator internals are
documented in
[`docs/architecture/orchestrator-python.md`](docs/architecture/orchestrator-python.md).

### Build / test / check

```bash
pnpm build          # turbo run build (all packages)
pnpm test           # turbo run test (Vitest across packages)
pnpm typecheck      # turbo run typecheck (tsc --noEmit)
pnpm lint           # ESLint flat config (gates CI)
pnpm format         # Prettier (gates CI)
pnpm pg:test        # Python orchestrator unittest suite
```

### Single app / single test

```bash
pnpm --filter @mini-commerce/bff test
pnpm --filter @mini-commerce/bff test:watch
pnpm --filter @mini-commerce/bff exec vitest run path/to/file.spec.ts
pnpm --filter @mini-commerce/web dev
```

## Architecture pointers

| For | Read |
|---|---|
| Container map across compose profiles | [`docs/architecture/containers.md`](docs/architecture/containers.md) |
| BFF module pattern, dependency rules, invariants | [`docs/architecture/bff-modules.md`](docs/architecture/bff-modules.md) |
| Browser → web → BFF/visualizer proxy | [`docs/architecture/web-entry-point.md`](docs/architecture/web-entry-point.md) |
| OTel pipeline | [`docs/architecture/observability.md`](docs/architecture/observability.md) |
| Local orchestrator (`./dev` / `pnpm pg:*` / `task`) | [`docs/architecture/orchestrator-python.md`](docs/architecture/orchestrator-python.md) |

## Phase context

- **Phase 1** (shipped): NestJS modular monolith.
- **Phase 2** (in progress, ~done): Prisma+Postgres persistence, OpenTelemetry,
  unified Python orchestrator, observability stack, SSE for the visualizer,
  shared HTTP contracts, per-session carts.
- **Phase 3** (planned): Extract modules into services, expand contract
  enforcement, replace in-process events with a broker.

## Next-steps workflow

- Each open thread has a self-contained `.md` under `docs/next-steps/`.
- Anchor source TODOs with `TODO(next-steps/<topic>)` so `grep` finds them.
- To pick the next iteration, read
  [`docs/next-steps/README.md`](docs/next-steps/README.md), then use
  `EnterPlanMode` to design before editing.

## 3D Visualizer (active feature)

`apps/visualizer-3d/public/` is a static ESM module graph. `scene.js` is a
thin orchestrator; per-concern code lives in `materials.js`, `geometry/`,
`objects/`, `layout/`, `transport.js`, and `fallback.js`. Working agreements
and the module map are in
[`docs/ai/claude/playbook.md`](docs/ai/claude/playbook.md#3d-visualizer-active-feature);
art rules in [`docs/visualizer/art-direction.md`](docs/visualizer/art-direction.md);
Classic Espresso cup record in
[`docs/next-steps/ps1-espresso-cup.md`](docs/next-steps/ps1-espresso-cup.md).

New domain assets: add a `docs/next-steps/<topic>.md`, then follow the
`buildEspressoGroup` + `ESPRESSO_CFG` pattern in `objects/espresso-cup.js`
and dispatch from `layout/render.js` (or the relevant scene-mesh factory).

## Claude Code

Claude Code is the primary AI implementation environment for this phase.
The full operating protocol lives at
[`docs/ai/claude-code-operating-protocol.md`](docs/ai/claude-code-operating-protocol.md);
project-local settings remain under `.claude/`. The repository does not ship
custom Claude Code skills, commands, or agents.

## Performance engineering

The Python-first k6 Docker layer is the repo's native performance
orchestration capability.

- Design + invariants: [`docs/performance/orchestrator.md`](docs/performance/orchestrator.md)
- Validation evidence rules: [`docs/performance/validation.md`](docs/performance/validation.md)
- Scenario library: [`tests/performance/k6/README.md`](tests/performance/k6/README.md)
- Run from a fresh checkout: `./dev perf:smoke`

Core `scripts/pg/` stays standard-library-only. Performance commands load the
public Punch workflow engine, so initialize the submodule and install its
pinned dependency before the first `./dev perf:*` command:

```bash
git submodule update --init --recursive
python3 -m pip install -r vendor/punch/requirements.txt
docker compose -f infra/docker/compose.performance.yaml build k6
```

Each performance command selects one repository-owned YAML workflow; Punch
loads, validates, and runs it once through Docker Compose. Current workflows
do not declare CSV output. If a future workflow declares `outputs.csv`, a
non-interactive invocation must explicitly include `--confirm-output-data`.

## Out of scope for this phase

VS Code + GitHub Copilot Chat configuration (instructions files, prompt
files, Copilot-specific skills) is **deferred to a future track**. The
existing `.github/copilot-instructions.md` stays as a tiny pointer; no
Copilot-specific work happens here. See the Roadmap section in
[`docs/ai/claude-code-operating-protocol.md`](docs/ai/claude-code-operating-protocol.md#roadmap).

## Tooling efficiency

Subagent choice, parallel tool calls, `/loop` cadence, memory rules:
[`docs/ai/tooling-efficiency.md`](docs/ai/tooling-efficiency.md).
