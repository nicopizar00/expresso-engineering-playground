# Track A: Docker First Performance Gate

## Current baseline

The project already has a working Docker First pipeline:

- Docker Compose starts a local API service (`docker/api.Dockerfile`).
- k6 runs in Docker against that API (`docker/k6.Dockerfile`).
- GitHub Actions executes the build → API health check → k6 run → artifact upload flow.
- `bin/` scripts (`build`, `test-smoke`, `clean`) are the local Docker First interface — the host requires only Docker.

The execution chain is:

```
TypeScript source  →  esbuild  →  Docker image  →  k6 run  →  reports (JSON / summary)
```

## Track A target

Evolve this POC into a **service-owned performance gate**: a focused, portable validation tool that a single service team can own, run in CI, and interpret without infrastructure expertise.

Not a framework. Not a dashboarding solution. A gate.

## Evolution stages

Each stage is a small, reviewable PR. No stage should be skipped to accelerate a later one.

### Stage 1 — Lightweight HTML report via `handleSummary`

Add a `handleSummary` export to the smoke test that produces a self-contained HTML file alongside the existing JSON output. No new dependencies; k6 supports this natively.

### Stage 2 — Upload HTML report as GitHub Actions artifact

Extend the workflow to upload the HTML report as a named artifact. Reviewers and stakeholders can download and open it without cloning the repo.

### Stage 3 — Basic thresholds

Add k6 `thresholds` for:
- HTTP status success rate
- Error rate
- p95 response latency

The gate fails the CI job if thresholds are breached. This is the first time the pipeline provides a binary pass/fail signal.

### Stage 4 — Mock or fixture-fed API behavior

Add a simple fixture or mock mode to the local API so k6 tests can validate specific response shapes without relying on live data or external services.

### Stage 5 — Endpoint-level smoke tests

Expand `src/tests/` with individual smoke checks per endpoint. Each check is minimal: one virtual user, one request, one assertion. The goal is coverage breadth, not load.

### Stage 6 — Mini end-to-end flow

Add a scenario that chains 2–3 endpoints in sequence (e.g. create → read → delete). This validates that the API behaves correctly across a realistic usage path, not just in isolation.

### Stage 7 — `workflow_dispatch` execution profiles

Add `workflow_dispatch` inputs to the GitHub Actions workflow so operators can trigger runs with named profiles (e.g. `smoke`, `light-load`) without editing code. Profiles map to different VU counts and durations.

### Stage 8 — Reusable GitHub Actions Performance Gate (deferred)

Only after stages 1–7 are stable and proven across multiple scenarios: evolve the project into a reusable GitHub Actions-based performance gate that other repositories and teams can consume.

See [GitHub Action Direction](#github-action-direction) below for the planned evolution path and the explicit prerequisites that must be met first. Do not begin Stage 8 work without meeting all prerequisites listed there.

## Non-goals (for now)

- No Grafana integration.
- No claim to replace Gatling.
- No reusable framework or shared library — the long-term target is a focused reusable workflow, not a general-purpose testing platform.
- No complex scenario orchestration.
- No advanced dashboarding.
- No production-like sustained load testing.

## GitHub Action Direction

The long-term value of this project is a **Docker First k6 Performance Gate** that other service teams can consume without owning the pipeline internals. The most realistic distribution model is GitHub Actions.

This project is currently a POC. Its most valuable future distribution model is a reusable GitHub Actions workflow. The realistic next step is not to publish an action, but to mature the gate through Stages 1–7 first, then expose it as a reusable workflow.

### Evolution path

Reuse should evolve in three steps, each gated on real adoption need:

1. **Reusable workflow** (`workflow_call`) — Add `on: workflow_call:` inputs to the existing `k6.yml`. This is the lowest-friction starting point: it requires no new file types and callers invoke it from their own workflows with a single `uses:` line. Start here.

2. **Composite action** (`action.yml`) — Only if callers need to embed the gate as a step inside a larger workflow (e.g., alongside deploy steps). This requires a new `action.yml` at the repo root. Do not do this speculatively.

3. **Published Marketplace Action** — Only if external teams outside the organization need to discover and consume the gate. This adds versioned releases and a public interface contract. Do not do this without real external adoption.

### Do not implement yet

The following are intentionally deferred until Stage 8 conditions are met:

- `action.yml` — does not exist and should not be created before Stage 8.
- Marketplace publishing — no release tags, no public action listing.
- Broad input parameterization — do not add inputs until a second real caller defines what it needs.
- Multi-caller support — do not design for hypothetical consumers.

### Prerequisites before reuse

Before any reuse work begins, all of the following must be true:

1. **Stage 3 thresholds are implemented** — without a binary pass/fail signal, there is nothing worth reusing.
2. **The test script path is no longer hardcoded** — `docker/k6.Dockerfile` and `docker-compose.yml` must accept a configurable script path rather than the current hardcoded `smoke.js`.
3. **A minimal input/output contract is defined** — at minimum: base URL, script path, and exit code semantics.
4. **HTML and JSON report artifacts are stable** — both report types upload reliably as named artifacts (Stages 1–2).
5. **`workflow_dispatch` profiles exist** — the named execution profiles from Stage 7 provide the template for what the reusable interface should expose.

## k6 vs Gatling: positioning note

k6 fits here as a **lightweight DevOps performance automation layer**. It is easy to embed in a Docker First CI/CD pipeline, produces portable evidence (JSON, HTML), and requires no JVM or separate infrastructure. It is well-suited for per-PR smoke gates and on-demand validation runs.

Gatling remains stronger for rich out-of-the-box reporting, complex simulation workflows, and teams that need a full performance testing platform rather than a CI gate.

These tools solve different problems. This project is firmly in k6's lane.

## Recommended next implementation PR

**Stage 1:** Add `handleSummary` to the smoke test to produce an HTML report, and extend the GitHub Actions workflow to upload it as an artifact (Stage 2 follows immediately since it is a one-line workflow addition).

This is the highest-value, lowest-risk first step: it makes test results reviewable without any new dependencies or architectural changes.
