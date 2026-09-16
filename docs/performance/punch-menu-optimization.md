# Punch interactive-menu optimization (2026-09-16)

Punch's `menu` command now uses [simple-term-menu](https://github.com/IngoMeyer441/simple-term-menu)
1.6.6 for its top-level action, sorted workflow list, and `BASE_URL` target
selection. It remains a picker over the same YAML validation and one-workflow
Compose execution path; free-text URLs, CSV consent, and Docker confirmation
retain their existing prompts.

## Observed improvement

| Menu-specific implementation | Before (`vendor/punch` at `a568a59`) | After |
| --- | ---: | ---: |
| Hand-written numeric selection call sites | 3 | 0 |
| Hand-written invalid-choice retry loops | 2 | 0 |
| Shared library-backed selection points | 0 | 1 |

The workflow list gains built-in arrow/`j`/`k` navigation and `/` search;
Escape or `q` cancels without starting a workflow run. A second workflow can
be chosen directly without typing and validating its list number. These are interaction
and maintenance improvements, **not a measured runtime or latency gain**.
The change adds a pinned host dependency; it does not claim to reduce the
total size of `menu.py`, since cancellation and missing-terminal handling
are now explicit.

## Lines-of-code estimate for the planned menu

This counts physical lines in Punch's `src/punch/menu.py`, including blank lines,
but excludes tests, documentation, dependency source, and workflow/business
logic. It compares the installed library with the former inline numeric-prompt
style, not with a feature-equivalent custom terminal UI.

| Scope | Calculation | Net Punch menu lines saved |
| --- | ---: | ---: |
| Implemented menu, measured against `a568a59` | `170 old - 180 current` | **-10** (10 more lines today) |
| Four additional list-selection contexts, if each repeats an inline numeric menu | `4 x (8-12 native - 2-4 library)` | 16-40 gross, estimated |
| Same four contexts after today's 10-line overhead | `16-40 - 10` | **6-30 net**, estimated |
| Central illustration | `4 x (10 native - 3 library) - 10` | **18 net**, not a measured result |
| Likely reuse: two workflow choices call the existing picker, leaving two new lists | `2 x (8-12 native - 2-4 library) - 10` | **-2 to 10 net**; central value `2 x 7 - 10 = 4` |

The four assumed contexts are: choosing a target for harvested CSV data,
choosing a producer when required data is absent, choosing a load approach,
and choosing a monitoring action or component. They are *selection contexts*,
not a promise of four new functions: producer and target choices may reuse the
workflow picker. The 8-12 native lines per context approximate the former
validated workflow/top-level menus (printing numbered entries, reading a
choice, checking its range, and retrying); the 2-4 library lines cover creating
an entry list, calling the existing `_select` adapter, and mapping the result.
The old two-option `BASE_URL` prompt was shorter because it did **not** reject
invalid choices, so it is not the validation baseline.

This is an upper-side comparison against *repeating* the old inline pattern.
A reasonable native-Python implementation would instead extract one reusable
numeric-picker helper with range validation and a Back/Cancel response. After
that helper exists, each additional list also takes only a few caller lines;
the library may save **zero** menu lines, or remain larger because of its
dependency and terminal-error handling. The practical planning estimate is
therefore **about 0 net lines saved** against a shared native picker, or
**about 4 net lines** if the old inline style continues for the two genuinely
new lists. The 18-line figure is a deliberately less likely no-reuse scenario,
not the forecast. The root `bin/punch` wrapper also grew from 29 to 38 lines,
but that diff mixes dependency preflight with the separate optional-build
behavior, so it cannot honestly be charged entirely to the menu library.

The library handles cursor movement, list selection, search, and a cancel
signal; it also offers previews and status bars that are not yet used here.
It does **not** replace validation of workflow eligibility or available data,
CSV parsing, iteration calculations, typed VU/duration/default input, or
confirmation policy. Punch must still reject invalid numeric load values,
handle empty eligible-workflow lists, and decide whether to re-prompt or
return on bad input. Escape/`q` currently exits the menu; interpreting cancel
as **Back to previous menu** and preserving earlier answers will still require
Punch navigation code. A native menu can also offer Back/Cancel through its
shared helper, so no lines are credited to the library for that behavior.
Likewise, no speculative savings for future previews or search are included:
a feature-equivalent custom terminal UI would be larger than numeric prompts,
but there is no repository implementation from which to measure its size.

To reproduce the implementation counts, compare `git -C vendor/punch show
a568a59:src/punch/menu.py` with `vendor/punch/src/punch/menu.py`: count calls
to `_prompt("Pick`, `while True` selection loops, and `TerminalMenu(...)`
selection points. The menu tests exercise sorted selection, cancellations at
all three menu levels, missing terminal, CSV consent, URL forwarding, and
single-workflow execution. For the real-terminal smoke check, run
`PYTHONPATH=vendor/punch/src python3 -m punch menu tests/performance/k6/workflows`
after installing requirements. Escape at the top-level menu returned 0 and
printed `[punch] menu canceled.`; choosing Monitoring setup with Down and
Enter returned 0 and printed its existing not-implemented message. Neither
case launched a workflow. The separate `./bin/punch` wrapper offers an
optional image build *before* opening the menu: No skips the build but keeps
the picker open; Yes builds before selection. Canceling after Yes cannot undo
that already completed build. Without a terminal, the wrapper exits before
either build or menu selection.

## Compatibility and rollback

Install the pinned requirements in a virtual environment (see the
[CLI reference](../cli-reference.md)) before launching `punch menu`. The menu
now needs an interactive stdin and a
controlling terminal; without them (or a supported `TERM`) it returns an error
rather than a terminal traceback. Automation
should use `punch run` or `./dev perf:*` to select a workflow without a menu.
The dependency does not change workflow YAML, reports, or Compose commands.
Rollback is to restore the previous `vendor/punch` revision and reinstall its
requirements; no data conversion or artifact migration is needed.
