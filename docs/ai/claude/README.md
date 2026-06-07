# Claude — Lane Index

> Entry point for sessions that use **Claude** (chat) or **Claude Code** (CLI
> / API tool-use) on this repo.

## Read in this order

1. [`playbook.md`](playbook.md) — execution rules, validation matrix, working
   agreements.
2. [`../tooling-efficiency.md`](../tooling-efficiency.md) — subagent choice,
   parallel calls, cache pacing, memory rules.
3. [`../codex/governance.md`](../codex/governance.md) — shared scope and
   authority frame (Codex owns it; Claude obeys it).
4. The architecture spoke for the area you're editing:
   - [`../../architecture/bff-modules.md`](../../architecture/bff-modules.md)
   - [`../../architecture/containers.md`](../../architecture/containers.md)
   - [`../../architecture/observability.md`](../../architecture/observability.md)
   - [`../../architecture/web-entry-point.md`](../../architecture/web-entry-point.md)
   - [`../../architecture/orchestrator-python.md`](../../architecture/orchestrator-python.md)

## Prompt shape

Long-form prompts for specific Claude Code tasks follow the
**ROLE / GOAL / READ FIRST / CONFIRM IN CODE / DESIGN / VALIDATE** shape and
link to architecture spokes instead of inlining facts.

## When NOT to use Claude

See the decision tree in [`../README.md`](../README.md). Tasks that are pure
conceptual framing or scope questions belong to **Codex**; the work flows
back to Claude Code once direction is set.
