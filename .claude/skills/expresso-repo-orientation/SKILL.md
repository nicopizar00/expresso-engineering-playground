---
name: expresso-repo-orientation
description: Use at the start of any non-trivial Claude Code session in this repo. Builds a fast, accurate mental model of the apps, packages, infra, scripts, tests, current phase, and active work threads — without rereading the whole tree.
---

# Expresso — Repository Orientation

## When to use

Use this skill when a session is starting cold (a new chat, a context
compaction, or a hand-off) and you need to ground yourself before editing
anything. Skip it for one-shot edits on a known file.

## Read first (in this order, stop when you have enough)

1. `CLAUDE.md` — durable working agreements + pointers.
2. `docs/ai/claude/playbook.md` — execution discipline (decision points,
   validation matrix, visualizer guardrails).
3. `docs/architecture/containers.md` — canonical container map + ports.
4. `docs/architecture/bff-modules.md` — BFF module pattern + dependency rules.
5. `docs/next-steps/README.md` — open work threads, priority order.
6. `docs/cli-reference.md` — `./dev`, `pnpm pg:*`, and `task` matrix.

Do not re-read these if they were already loaded earlier in the conversation.

## Workflow

1. Confirm the **phase**: Phase 2 is wrapping up (Prisma+Postgres orders,
   OTel, Python orchestrator, observability, SSE visualizer, perf scenarios).
   Phase 3 plans service extraction.
2. Confirm the **active feature**: visualizer evolution to "Expresso Order
   Counter" — see `docs/next-steps/expresso-order-counter.md`. Classic
   Espresso cup is the first domain asset; art rules in
   `docs/visualizer/art-direction.md`.
3. Identify **boundary the task crosses**:
   - BFF endpoint or contract → `apps/bff/src/modules/<domain>/`, module
     rules in `docs/architecture/bff-modules.md`, run `./dev smoke`.
   - Web → `apps/web/`; browser-only entry point; proxies `/api/bff/*` and
     `/viz/*`.
   - Visualizer scene → `apps/visualizer-3d/public/scene.js`; **hard rule**:
     edit only `ESPRESSO_CFG` and `buildEspressoGroup`; never touch
     `buildSquareFrustum`, `makePsxTexture`, `clearGroup`, or the SSE wiring.
   - Orchestrator (`./dev` / `pnpm pg:*` / `task`) → `scripts/pg/`.
   - Performance → `tests/performance/k6/` + `scripts/pg/perf.py` +
     `infra/docker/compose.performance.yaml`.
   - Observability → `infra/observability/`, `otel-collector`, Tempo,
     Prometheus, Grafana on `obs` profile.
4. State a short orientation summary to the user (3–6 lines) and the
   smallest validation chain you'll run for the task at hand.

## Output

A short orientation note that includes:

- Phase + active feature name.
- The files / modules the upcoming task will touch.
- The validation row from the playbook matrix you will run before reporting
  done.
- Any open `docs/next-steps/<topic>.md` that supersedes the bare request.

## Don'ts

- Do not dump full file contents back to the user — pointers only.
- Do not restate the container or module rules; link to the canonical doc.
- Do not bypass `docs/next-steps/` if the request matches an open thread.
