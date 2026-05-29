---
name: mini-commerce-governance
description: Use when Codex needs to frame design-governance, architecture scope, implementation handoff prompts, UX direction, or repo-specific AI workflow decisions for the mini-commerce engineering playground.
---

# Mini Commerce Governance

## Overview

Use this skill to keep Codex work bounded to repository governance: product
framing, architecture scope, prompt preparation, UX direction, and handoff
review. Do not use it as a reason to bypass `CLAUDE.md` when implementation or
runtime execution is the actual task.

## Read First

Open only the files needed for the request:

- `docs/ai/codex/governance.md` for authority, role, and scope rules.
- `docs/ai/codex/current-findings.md` for active UAT and runtime findings.
- `docs/project-state/current-system.md` for authoritative features and UX
  state.
- `docs/architecture/web-entry-point.md` for `/api/bff` and `/viz` topology.
- `CLAUDE.md` when creating implementation handoff prompts.

Use `references/source-map.md` for a compact list of source files and common
decision points.

## Workflow

1. Identify whether the user wants governance, prompt writing, review, or
   implementation.
2. If implementation is requested, keep the response as a handoff or scoped
   review unless the user explicitly asks Codex to edit.
3. Preserve the web app as the single browser-facing entry point.
4. Preserve persistent orders, in-memory cart, typed frontend API use, and
   mock-only `/performance`.
5. Do not introduce backend contracts, telemetry changes, k6 scope, or
   visualizer internals without explicit owner approval.
6. Include the current UAT blockers when they affect the requested work:
   `/orders/[orderId]` route failure, Compose profile drift, and unverified
   3D pixels.

## Output

Prefer concise, directive output:

- State the decision or recommendation first.
- Name the files to inspect or edit.
- Define scope boundaries and approval gates.
- Include validation commands and browser checks.
- Avoid AI attribution, generated-by text, and co-author trailers.
