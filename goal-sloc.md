# Repository Simplification Record

## Baseline

- Tracked raw lines: 57,408.
- Selected maintained-code raw lines (`ts`, `tsx`, `js`, `mjs`, `py`, `css`, `html`, `sh`): 22,932.
- Documentation raw lines: 21,893.
- Completed implementation-plan lines: 13,543 across eight files.
- Detected duplicated lines: 692 across maintained code and tests.

## Milestones

| Milestone           | Result                                                                                       | Verification                                                                                |
| ------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Completed plans     | Removed 13,543 lines across eight shipped implementation plans; specifications preserved     | Specification deletion scan empty                                                           |
| Backend cleanup     | Removed two empty modules, four unused direct dependencies, and stale placeholder references | Strict TypeScript, 117 BFF tests, and BFF build passed                                      |
| Frontend cleanup    | Removed unused UI and adapter implementations and narrowed internal-only exports             | Web/BFF TypeScript, web lint, and four frontend-certification tests passed                  |
| Formatting boundary | Added one shared generated-output ignore policy                                              | Root format and focused BFF/web Prettier checks passed with build trees present             |
| Playwright fixture  | Replaced five private commerce mocks with one typed fixture                                  | E2E TypeScript/lint passed; 19 selected tests passed and one documented mobile test skipped |

## Final audit

- Tracked raw lines: 43,968, down 13,440 from 57,408 (23.41%).
- Selected maintained-code raw lines: 21,952, down 980 from 22,932
  (4.27%).
- Documentation raw lines: 9,604, down 12,289 from 21,893 (56.13%).
  The completed-plan deletion itself is the fixed 13,543-line reduction;
  retained architecture updates, this record, and the new approved design spec
  account for the difference between that gross deletion and the net docs
  result.
- Detected duplicated lines: 367, down 325 from 692 (46.97%). The repeated
  commerce route/state clones are gone; the remaining candidates include
  contract shapes, one product-data pair, production geometry/UI blocks, and
  excluded k6 scenarios.
- Structural share of removed lines: 100%. Cosmetic share: 0%. Every deletion
  was completed-plan removal, dead-code/dependency removal, or de-duplication;
  there was no standalone comment trimming, whitespace removal, line packing,
  or formatter-driven reduction.

Fresh passing verification:

- `pnpm lint` (zero errors; existing warnings remain), `pnpm format`,
  `pnpm typecheck`, `pnpm build`, and `pnpm test`.
- Direct BFF Vitest: 117 tests passed.
- `pnpm pg:test`: 48 tests passed.
- Affected Playwright suite: 19 tests passed and one documented mobile test was
  skipped.
- Docker-backed `./dev smoke`: all 15 checks passed.
- Docker-backed integration suite: 3 tests passed.

The complete Playwright command also exposed six failures in the pre-existing
`visualizer-interaction.spec.ts` and passed 21 tests with one skip. Running
that spec from untouched `main` on an isolated port reproduced the identical
six failures and one pass, proving they are not a cleanup regression. Fixing
them would require changing visualizer product behavior or its assertions,
which this approved behavior-preserving pass explicitly excludes.

Stop condition: remaining reduction candidates are the excluded
production-component and k6 refactors, so this pass does not expand into them.
