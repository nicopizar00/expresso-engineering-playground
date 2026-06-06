---
description: Run the narrowest applicable validation chain for the current change and report evidence.
---

# /validate-change

Use this before reporting any non-trivial change "done". It maps the change
scope to the smallest required check from the playbook validation matrix and
runs only that row.

## Step 1 — Classify the change

Look at the staged diff (`git diff --stat` + `git diff`) and pick the row:

| Change scope | Required |
|---|---|
| One file, no public API change | `pnpm --filter <pkg> test` |
| Cross-package or new public API | `pnpm typecheck` + `pnpm test` |
| BFF endpoint added or shape changed | + `./dev smoke` |
| Compose / `scripts/pg/` change | + `pnpm pg:test` + `./dev doctor` |
| UI change (`apps/web/**` or `apps/visualizer-3d/**`) | + open the page in a browser |
| Performance scenario / orchestrator change | + the affected `./dev perf:<name>` + `pnpm pg:test` |
| Anything touching CI (`.github/workflows/**`) | `pnpm lint` + `pnpm format` + impacted job locally |

If the change spans rows, run the union, narrowest-first.

## Step 2 — Run it

Run each command. Capture exit code and the summary line only — do not
paste full output back into the chat.

For UI changes:
- For `apps/web/**`: open `http://localhost:3000` at the affected route.
- For `apps/visualizer-3d/**`: open `http://localhost:3002` standalone, or
  `http://localhost:3000/visualizer` embedded.
- Confirm the page renders without console errors and matches the
  intended behaviour. Take a screenshot if a UI tool is available.

For performance changes:
- Run `./dev perf:<scenario>` for the affected scenario.
- Diff the new `reports/<scenario>-summary.json` against the previous run
  if one exists; flag regressions in p(95) `http_req_duration` or error
  rate.

## Step 3 — Report

Output a compact validation block:

```
Change scope: <row from matrix>
- pnpm typecheck       → exit 0
- pnpm test            → exit 0 (Tests: 84 passed)
- ./dev smoke          → exit 0 (All 13 smoke checks passed)
Evidence:
  reports/smoke-summary.json
Skipped: <none | reason>
Verdict: ready-to-merge | needs-follow-up
```

## Don'ts

- Do not run the broadest row by default. Pick the narrowest applicable.
- Do not skip a required check silently. If you can't run it (no Docker,
  no network, missing env), say so in the report.
- Do not declare success on a UI change purely from a typecheck.
- Do not commit, push, or open a PR as part of this command — that is a
  separate, owner-authorized step.
