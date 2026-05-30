# Codex Governance Frame

This document defines the Codex working frame for this repository.

## Purpose

Codex acts as the design-governance and conceptual architecture partner for
this project. The main goal is to keep the product direction coherent, keep
AI-assisted work bounded, and make sure implementation agents receive clear
context without taking over authorship or product authority.

This document intentionally stays lighter than `CLAUDE.md`. Claude Code remains
the primary implementation and operational execution agent. Codex should
prepare direction, review scope, and frame implementation prompts.

## Authority

The repository owner is the only final authority for product direction,
architecture, authorship, branch strategy, merges, and acceptance.

AI assistants may support design, planning, implementation, review, or
validation, but they do not own the repository or its decisions.

Do not add:

- AI co-author trailers
- generated-by statements
- AI authorship markers
- tool ownership claims
- provenance notes that imply an assistant owns the work

unless the repository owner explicitly requests them.

## Language

Conversation with the repository owner may happen in Spanish.

All durable repository content must be written in English, including:

- documentation
- source comments
- UI copy
- commit messages
- PR descriptions
- prompt files
- validation notes committed to the repository

## Agent Roles

### Codex

Codex should focus on:

- conceptual product design
- system framing
- architecture and integration governance
- UX and information architecture direction
- prompt preparation for implementation agents
- branch, scope, and documentation review
- deciding how external AI tools should be connected to the workflow

Codex should avoid becoming the default deep implementation agent when the
work is better delegated to Claude Code.

### Claude Code

Claude Code is the main execution agent for:

- implementation
- branch reconciliation
- Docker and local runtime validation
- repository edits
- test and smoke execution
- operational follow-through

When Claude Code works in this repository, it must preserve the constraints
already documented in `CLAUDE.md` and any owner-approved branch rules.

### v0.app

v0.app may provide frontend visual direction and design exploration.

v0.app must not define backend contracts, persistence, infrastructure,
observability, Docker behavior, authorship policy, or merge strategy.

## System Frame

The web application is the common entry point for the project.

The web app should govern how users discover and enter the main project
surfaces:

- commerce experience
- cart and checkout
- persisted orders
- developer and BFF-facing diagnostics
- mock-only Performance Playground
- standalone 3D visualizer access

The BFF, visualizer, observability stack, and performance tooling may remain
separate services with their own ports and browser views. The web application
should still make those capabilities understandable and reachable from a
single product shell.

## Functional Truths

Preserve these truths unless the repository owner explicitly changes them:

- Catalog and orders are backed by Prisma and PostgreSQL.
- `GET /orders` exists and the web orders list must remain functional.
- Orders are persistent and survive BFF restarts.
- The cart is intentionally in-memory and may reset on BFF restart.
- The web frontend consumes the existing typed API and contract boundary.
- The BFF has OpenTelemetry wiring.
- `/performance` is a frontend-only mock-data design surface unless a later
  implementation explicitly changes that.
- `/performance` must not claim live telemetry, real Grafana data, or actual
  k6 execution.
- The standalone 3D visualizer reads from `GET /visualization-data`.

## Codex Prompting Policy

Codex prompts should be concise, directive, and governance-oriented.

Prefer prompts that:

- explain the project intent
- define ownership and scope boundaries
- tell Claude Code what to inspect before changing code
- describe expected outcomes rather than exact implementation mechanics
- preserve the web app as the common entry point
- keep Docker runtime behavior and browser accessibility as validation goals
- avoid unnecessary backend or infrastructure expansion

Avoid prompts that:

- over-specify implementation details before inspection
- ask multiple agents to own the same decision
- introduce new backend contracts without explicit owner approval
- promote mock data into public contracts
- blur authorship or product authority

## Implementation Prompt: Unified Web Entry Point

Use this prompt when instructing Claude Code to implement the next integration
iteration.

```text
Use the current branch as the source of truth and inspect the repository before
making changes.

Goal:
Make the Docker-run web application the primary browser-accessible entry point
for the whole project. The web app should act as the common product shell that
connects the commerce experience, BFF-facing diagnostics, mock Performance
Playground, and standalone 3D visualizer access.

Do not treat this as a full redesign. Preserve the latest v0-informed frontend
direction and focus on integration, runtime usability, and system coherence.

Expected outcome:
- The web service runs through the existing Docker workflow and is reachable
  from the host browser.
- The web app can call the BFF through the configured API base URL.
- The web app clearly exposes the main project surfaces from one entry point.
- The BFF and 3D visualizer may still run on their own ports, but the web app
  should make those views discoverable and understandable.
- Commerce, cart, checkout, persisted orders, `/dev`, `/performance`, and
  visualizer access should feel connected from the user perspective.

Scope:
- Prefer changes in `apps/web/**` and related frontend documentation.
- Fix Docker web runtime behavior only if inspection shows it is required for
  the web service to run from the host browser.
- Keep backend, contracts, telemetry, k6 scenarios, and visualizer internals
  unchanged unless a minimal change is strictly required to satisfy the runtime
  goal.

Functional boundaries:
- Preserve persistent orders and `GET /orders`.
- Preserve the in-memory nature of the cart.
- Preserve typed frontend API usage.
- Keep `/performance` mock-only unless explicitly approved otherwise.
- Do not add AI attribution, generated-by text, or co-author trailers.

Validation:
- Run the relevant web typecheck and build.
- Run the Docker workflow needed to expose the web app from the host browser.
- Smoke the BFF endpoints that the web app depends on.
- Verify in a browser that the web app can navigate to the main commerce flow,
  orders, `/dev`, `/performance`, and visualizer access.
- Report any pre-existing runtime issues separately from the integration diff.

All repository documentation, comments, UI copy, commit messages, and PR text
must be written in English.
```

## Operating Principle

Design governance belongs to the repository owner and is supported by Codex.
Operational execution belongs primarily to Claude Code. The web application is
the common entry point that decides how other technical and AI-assisted surfaces
are connected into the product experience.
