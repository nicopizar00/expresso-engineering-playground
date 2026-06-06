---
name: expresso-performance-orchestrator
description: Use when designing, extending, or debugging the repo's Python-first k6 Docker performance orchestration layer (scripts/pg/perf.py + infra/docker/compose.performance.yaml + tests/performance/k6/). Owns scenario wiring, Docker invocation, BASE_URL resolution, and report capture.
---

# Expresso — Performance Orchestrator

The repo runs k6 through Docker, orchestrated by a small Python module. This
skill is the operating guide for evolving that layer.

## Architecture in one paragraph

`./dev perf:<scenario>` → `python3 -m pg` → `scripts/pg/perf.py` →
`docker compose -f infra/docker/compose.performance.yaml run --rm k6 run …`
→ `grafana/k6:0.54.0` container mounts `tests/performance/k6/` at `/scripts`
and writes a summary JSON to `tests/performance/k6/reports/`. The default
target is `BASE_URL=http://host.docker.internal:${BFF_PORT}`, overridable
inline. An opt-in `k6-otel` service exports OTLP metrics into the main stack's
`otel-collector` when the `obs` profile is up.

## Read first

- `docs/performance/orchestrator.md` — design intent, invariants, evolution
  rules. **Canonical home for this capability.**
- `docs/performance/validation.md` — where evidence is captured and how it is
  reviewed.
- `scripts/pg/perf.py` — the orchestrator entry points (`smoke`,
  `checkout_flow`, `read_heavy`, `open_report`, `clean`).
- `infra/docker/compose.performance.yaml` — `k6` and `k6-otel` service
  definitions; comments document the host-gateway and external network.
- `tests/performance/k6/README.md` — scenario library overview and `BASE_URL`
  contract.
- `tests/performance/k6/config/thresholds.js` — shared, named threshold sets.
- `tests/performance/k6/scenarios/<profile>/<name>.js` — one file per
  scenario; new profiles follow the same shape.

## Invariants (do not break)

1. **k6 runs in Docker.** No host install of k6 is required to execute
   `./dev perf:*`. Host installs are an optional escape hatch documented in
   the k6 README, not a code path.
2. **Python owns orchestration.** Bash files in `scripts/` and `./dev` are
   thin trampolines. New orchestration goes into `scripts/pg/perf.py`
   (or a sibling module inside `scripts/pg/`).
3. **Compose file stays separate.** `compose.performance.yaml` is its own
   file so a perf run never mutates the main stack lifecycle.
4. **`BASE_URL` is the single target knob.** Scenarios read it via
   `config/env.js`; the orchestrator resolves the default; CLI overrides win.
5. **Reports land in `tests/performance/k6/reports/`** and are gitignored
   except for `.gitkeep`. Summary filenames are stable per scenario so
   diffing across runs is easy.
6. **No secrets, no real URLs, no real user data** in scenarios, configs,
   or seed fixtures.

## Workflow

1. Identify the change shape: new scenario, new threshold, new entry point,
   new Compose service, new report sink.
2. For a **new scenario**:
   - Create `tests/performance/k6/scenarios/<profile>/<name>.js`.
   - Import `url()` from `config/env.js` and named thresholds from
     `config/thresholds.js` (or add a named set there if reused).
   - Add a `<name>()` function in `scripts/pg/perf.py` reusing
     `_run_scenario`.
   - Register it in `scripts/pg/cli.py` under `perf:<name>`.
   - Update `package.json` and `Taskfile.yml` pass-throughs if the user-facing
     entry points are expected there.
   - Document it in `tests/performance/k6/README.md` and the
     orchestrator design doc.
3. For a **threshold change**: edit `config/thresholds.js`, justify the
   new bound in the design doc, and re-run the affected scenarios to capture
   evidence.
4. For a **Compose change**: edit `compose.performance.yaml`, keep the
   `k6` and `k6-otel` symmetry, document network/host-gateway implications.
5. Always run the orchestrator unit tests after touching `scripts/pg/perf.py`:
   `pnpm pg:test`.

## Output

State, in order:

- Files changed and why.
- Updated user-facing command (`./dev perf:<name>` or equivalent).
- Validation evidence: orchestrator unit tests, a real run against the live
  BFF, and the summary file path under `reports/`.
- Any new doc anchors in `docs/performance/`.

## Don'ts

- Do not introduce a second k6 entry path (host script, Makefile target,
  shell wrapper). Everything routes through `./dev` / `pnpm pg:*` / `task`.
- Do not add a host dependency on `k6`, `node`, or `python` packages beyond
  the existing stdlib-only constraint.
- Do not write CI workflows here; document the design and leave CI wiring
  to a follow-up unless the change is one line in the existing `ci.yml`.
- Do not encode environment-specific URLs, hostnames, or credentials.
