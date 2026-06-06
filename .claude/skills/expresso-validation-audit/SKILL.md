---
name: expresso-validation-audit
description: Use before reporting a change "done" to confirm the right validation row was run. Maps change scope to the narrowest applicable check from the playbook matrix, captures evidence, and flags anything skipped.
---

# Expresso — Validation Audit

## When to use

At the end of any non-trivial change, before saying "done", and before
asking the owner to merge. Skip for typos and one-line doc edits.

## Read first

- `docs/ai/claude/playbook.md#validation-matrix` — the row-by-row rule.
- `CLAUDE.md#build--test--check` — quick command list.
- `docs/cli-reference.md` — `./dev`, `pnpm pg:*`, `task` matrix.

## Workflow

1. Classify the change into one of the matrix rows:

   | Change scope | Required |
   |---|---|
   | One file, no public API change | `pnpm --filter <pkg> test` |
   | Cross-package or new public API | `pnpm typecheck` + `pnpm test` |
   | BFF endpoint added or shape changed | + `./dev smoke` |
   | Compose / `scripts/pg/` change | + `pnpm pg:test` + `./dev doctor` |
   | UI change | + open the page in a browser |
   | Performance scenario / orchestrator change | + the affected `./dev perf:<name>` run + `pnpm pg:test` |
   | Anything touching CI | `pnpm lint` + `pnpm format` + impacted job locally |

2. Run the row. Capture:
   - Exit codes.
   - The summary line (e.g. `All 13 smoke checks passed`,
     `Tests: 84 passed`).
   - The artifact path if one was generated
     (`tests/performance/k6/reports/<name>-summary.json`).
3. For UI changes, take a screenshot or annotate which page was opened
   and the interaction performed. Browser checks are not skippable for UI.
4. For performance changes, compare key metrics from the new summary to the
   previous one; flag regressions explicitly.
5. If a required check can't be run (no Docker, no network, env mismatch),
   **say so explicitly** in the report. Do not infer success from types.

## Output

A short audit block:

- Change-scope row.
- Each command run, exit code, and one-line summary.
- Evidence paths (smoke output, perf summary, screenshot).
- Anything skipped, with the reason.
- A `ready-to-merge` / `needs-follow-up` verdict.

## Don'ts

- Do not run the most expensive row by default; pick the narrowest
  applicable one.
- Do not claim CI will catch it — local validation is the gate for "done".
- Do not paste full command output back; one summary line per check.
