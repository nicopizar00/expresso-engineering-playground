# Performance Form Simplification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cut `perf-run.yml` to two inputs (workflow, profile) and `perf-chain.yml` to two inputs (recipe, target profile); the profile becomes the last step's load and every earlier step stays `auto`.

**Architecture:** `scripts/pg/perf_forms.py` gains one generated profile list: the four preset labels, then `Custom: <path>` for every JSON file beneath `tests/performance/k6/options/custom/`. `scripts/pg/perf_dispatch.py` reads three form values (`kind`, `selection`, `profile`), re-derives the workflows, recipes, and profiles from the checked-out commit, and writes the unchanged version 1 `spec.json` with automatic steps followed by one target step. `_perf-execute.yml` takes those three string inputs; planning, execution, evidence, and the runner job stay as they are.

**Tech Stack:** Python 3.9+ stdlib (`scripts/pg`), PyYAML (tests), Punch public APIs (`punch.catalog`), GitHub Actions (`workflow_dispatch`, `workflow_call`), Prettier 3 (Markdown and YAML), ruff 0.7.4.

**Spec:** [`docs/superpowers/specs/2026-10-17-performance-form-simplification-design.md`](../specs/2026-10-17-performance-form-simplification-design.md)

## Global Constraints

- No AI attribution anywhere: no `Co-Authored-By: Claude`, no "Generated with Claude Code", in commits, PR bodies, or docs. The repo `CLAUDE.md` overrides the harness attribution reminder.
- Committed content is English. No secrets. Load the `technical-writing` skill before editing any Markdown in Task 1, Task 3, or Task 5.
- Work on branch `feat/perf-form-profiles` (create it from `main` before Task 1). Never stage anything under `vendor/punch`.
- Each user-facing GitHub performance form has two inputs: `perf-run.yml` has exactly `workflow` and `profile`; `perf-chain.yml` has exactly `recipe` and `target-profile`.
- `_perf-execute.yml` accepts exactly `kind`, `selection`, and `profile`, in that order, each `type: string`, `required: true`. The dispatcher reads them from `PERF_KIND`, `PERF_SELECTION`, and `PERF_PROFILE`. Form values never appear inside generated shell commands or `run:` text.
- Built-in profile labels and spec loads, exactly: `1 journey` → `{"mode": "preset", "value": "1-iteration"}`, `5 journeys` → `{"mode": "preset", "value": "5-iterations"}`, `1 user for 5 minutes` → `{"mode": "preset", "value": "1-vu-5m"}`, `5 users for 5 minutes` → `{"mode": "preset", "value": "5-vu-5m"}`.
- Custom profiles: every `.json` file beneath `tests/performance/k6/options/custom/`, recursively, rendered as `Custom: <path>` with `<path>` relative to `tests/performance/k6/options/` (for example `Custom: custom/status-regression.json`), sorted by `<path>`, listed after the four built-ins. The label maps to `{"mode": "custom", "path": "<path>"}`.
- Defaults: `perf-run.yml` profile `1 journey`; `perf-chain.yml` target profile `5 journeys`; `perf-run.yml` workflow `http-purchase` and `perf-chain.yml` recipe `http-cart -> http-orders` stay as they are.
- `Recipe` replaces `Sequence` as the field name. Recipe option values stay the ordered workflow IDs joined by ` -> ` (space, hyphen, greater-than, space).
- The chain form does not expose `Auto`. The selected profile always applies to the last workflow; every earlier step gets `{"mode": "auto"}`.
- `scripts/pg/perf_spec.py` version 1, `./dev perf:chain <workflow>[:<shape>] ...`, and `./dev perf:chain --spec <path>` stay unchanged, including per-step `auto`, `preset`, and `custom` loads.
- `request.json` records the three received form values and nothing else.
- Python code must run on 3.9 and 3.11: `from __future__ import annotations`, `typing.List/Dict/Optional/Tuple`, no `match`, no same-quote nesting inside f-strings.
- Outward actions need the user's explicit OK at that step: any `git push`, any merge to `main`, any `gh workflow run`.
- Temporary files go in `$SCRATCH` (the session scratchpad directory), never `/tmp` directly.
- Python tests: `(cd scripts && python3 -m unittest discover -s pg/tests -p 'test_*.py' 2>&1 | tail -3)`; baseline before Task 1 is `Ran 242 tests`, `OK`. Lint: `uvx ruff@0.7.4 check scripts/pg` (CI pins `ruff==0.7.4`; ruff is not installed globally).
- `docs/performance/orchestrator.md` fails `prettier --check` before this work, in sections this plan does not touch. Never run `prettier --write` on it; Task 3 checks only its own hunks. `docs/next-steps/perf-run-ux.md` and the three workflow files pass `prettier --check` before this work and must still pass after it.

## Review Focus

1. **A three-step browser recipe whose target profile pushes the first producer above the 4-VU cap** (`browser-cart -> http-orders -> http-orders-status` with `1 user for 5 minutes`): the operator can change only the target, so the rejection must say "Pick a smaller load for step 3", not step 2 (an `auto` step the form cannot set). Today it says step 2. Test: Task 1 (`test_a_browser_producer_over_the_cap_names_the_step_whose_load_sets_its_size`).
2. **An API dispatch that sends an old-form label, an internal preset stem, or a recased, padded, or empty label** (`Auto (data-size producer; default otherwise)`, `Custom config`, `5-vu-5m`, `1 Journey`, ` 1 journey`, `""`): rejected before Docker as an unknown profile naming the offered profiles, never mapped. Test: Task 3 (`test_an_old_label_an_internal_value_or_a_recased_label_is_not_a_profile`).
3. **A `Custom:` label for a file the form does not offer** (`Custom: 1-iteration.json`, `Custom: custom/missing.json`, `Custom: custom/../1-iteration.json`, `Custom:custom/status-regression.json`), **or a listed custom file that is a symlink escaping the options directory**: the first group is an unknown profile and never reaches the filesystem; the symlink is listed by discovery but rejected with "resolves outside". Tests: Task 2 (`test_anything_the_profile_list_does_not_offer_maps_to_nothing`), Task 3 (`test_a_custom_label_for_a_file_the_form_does_not_offer_is_not_resolved`, `test_a_listed_custom_profile_that_escapes_through_a_symlink_is_rejected`).
4. **A `custom/` directory holding non-JSON files, nested folders, or a directory named `*.json`, or no `custom/` directory at all**: discovery lists only JSON files at any depth, sorted by path; with no directory the list is the four presets and `perf:forms` does not crash. Test: Task 2 (`test_custom_profiles_are_every_json_file_beneath_custom_sorted_by_path`, `test_without_a_custom_directory_only_the_presets_are_offered`).
5. **A profile the static form offers but the planner refuses** (`browser-cart` with `Custom: custom/status-regression.json`, which has no browser options; `browser-cart` with `5 users for 5 minutes`; `browser-purchase -> http-orders-status` with `5 users for 5 minutes`): normalization accepts it and the planner rejects it before Docker, naming the step and resolved load. Test: Task 3 (`test_a_profile_the_planner_refuses_passes_normalization_and_fails_the_plan`).

---

## File Structure

| File | Responsibility | Task |
| --- | --- | --- |
| `scripts/pg/perf_chain.py` (modify) | Browser cap rejection names the step whose load sets the producer's size | 1 |
| `scripts/pg/tests/test_perf_chain.py` (modify) | Pins that message for a three-step recipe | 1 |
| `scripts/pg/perf_spec.py` (modify) | `PRESET_LABELS` (Task 2); drops `LOAD_LABELS` and `CUSTOM_LABEL` (Task 3) | 2, 3 |
| `scripts/pg/perf_forms.py` (modify) | `custom_profiles`, `profiles`, `profile_load` (Task 2); `recipe_label`, `recipes`/`profiles` blocks, no `load_mode` (Task 3) | 2, 3 |
| `scripts/pg/tests/test_perf_forms.py` (modify) | Profile discovery, label mapping, block names | 2, 3 |
| `scripts/pg/perf_dispatch.py` (modify) | Three inputs; target-only normalization | 3 |
| `scripts/pg/tests/test_perf_dispatch.py` (modify) | Normalization and dispatch evidence for the three-input contract | 3 |
| `.github/workflows/perf-run.yml` (modify) | `workflow` + generated `profile` | 3 |
| `.github/workflows/perf-chain.yml` (modify) | `recipe` + generated `target-profile` | 3 |
| `.github/workflows/_perf-execute.yml` (modify) | `kind`, `selection`, `profile` inputs; three `PERF_*` env values | 3 |
| `scripts/pg/tests/test_perf_github_workflows.py` (modify) | Pins both two-input forms and the three-input reusable contract | 3 |
| `docs/performance/orchestrator.md` (modify) | Chain cap bullet (Task 1); GitHub Actions section (Task 3) | 1, 3 |
| `docs/next-steps/perf-run-ux.md` (modify) | Descriptive form and evidence sections (Task 3); verification record (Task 5) | 3, 5 |

`docs/cli-reference.md`, `CLAUDE.md`, and `tests/performance/k6/README.md` mention the forms only by name and need no change; Task 3 Step 11 proves it with a grep.

---

### Task 1: Name the step whose load sets a browser producer's size

The spec keeps the planner authoritative for browser caps. With target-only forms, a three-step browser recipe that breaks the cap today tells the operator to change step 2, which is `auto` and not on the form. This task points the message at the first step down the reader chain that is not itself sized. Two-step messages do not change.

**Files:**
- Modify: `scripts/pg/perf_chain.py:313-358` (`_sizing_reader`, `_resolve_configs`)
- Test: `scripts/pg/tests/test_perf_chain.py` (class `PlanTests`, after `test_a_sized_browser_step_over_the_cap_is_rejected`)
- Modify: `docs/performance/orchestrator.md` (section "Chains (`perf:chain`)", the "A sized browser step needs at most 4 VUs" bullet)

**Interfaces:**
- Consumes: `Step.sizing` (`Optional[SizingPlan]`), `Step.sized_for` (`Optional[int]`), `Step.number` (`int`) from `scripts/pg/perf_chain.py`.
- Produces: private helper `_load_owner(reader: Step, by_number: Dict[int, Step]) -> Step`. No public interface changes.

- [ ] **Step 1: Write the failing test**

Add to `PlanTests` in `scripts/pg/tests/test_perf_chain.py`, directly after `test_a_sized_browser_step_over_the_cap_is_rejected`:

```python
    def test_a_browser_producer_over_the_cap_names_the_step_whose_load_sets_its_size(self) -> None:
        # Step 2 is auto and sized for step 3, so only step 3's load can shrink step 1.
        result = plan("browser-cart", "http-orders", "http-orders-status:1-vu-5m")
        self.assertEqual(
            result.errors,
            [
                "step 1 browser-cart: sized for step 2 http-orders at auto: sized for step 3 "
                "(575 iterations, 3 VUs), it needs 7 browser VUs; the cap is 4. Pick a smaller "
                "load for step 3"
            ],
        )
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `(cd scripts && python3 -m unittest discover -s pg/tests -p 'test_perf_chain.py' -k names_the_step_whose_load 2>&1 | tail -8)`
Expected: FAIL; the actual message ends `Pick a smaller load for step 2`.

- [ ] **Step 3: Write the implementation**

In `scripts/pg/perf_chain.py`, add this function directly after `_sizing_reader`:

```python
def _load_owner(reader: Step, by_number: Dict[int, Step]) -> Step:
    """The step whose load sets `reader`'s size: the reader itself, or, when it was
    sized too, the step it was sized for, followed until a step that was not."""
    while reader.sizing is not None and reader.sized_for is not None:
        reader = by_number[reader.sized_for]
    return reader
```

In `_resolve_configs`, replace:

```python
                if step.browser and sizing.vus > MAX_BROWSER_VUS:
                    plan.errors.append(
                        f"step {step.number} {step.name}: sized for step {reader.number} "
                        f"{reader.name} at {reader.shape_label()}, it needs {sizing.vus} browser "
                        f"VUs; the cap is {MAX_BROWSER_VUS}. Pick a smaller load for step "
                        f"{reader.number}"
                    )
```

with:

```python
                if step.browser and sizing.vus > MAX_BROWSER_VUS:
                    owner = _load_owner(reader, by_number)
                    plan.errors.append(
                        f"step {step.number} {step.name}: sized for step {reader.number} "
                        f"{reader.name} at {reader.shape_label()}, it needs {sizing.vus} browser "
                        f"VUs; the cap is {MAX_BROWSER_VUS}. Pick a smaller load for step "
                        f"{owner.number}"
                    )
```

Resolution runs from the last step back, so `reader.sizing` and `reader.sized_for` are already set when a writer is sized; `sized_for` always names a later step, so the loop ends.

- [ ] **Step 4: Run the planner tests**

Run: `(cd scripts && python3 -m unittest discover -s pg/tests -p 'test_perf_chain.py' 2>&1 | tail -3)`
Expected: `OK`. `test_a_sized_browser_step_over_the_cap_is_rejected` still passes: in a two-step chain the reader is a preset step, so the message keeps `step 2`.

- [ ] **Step 5: Update the chain rule in the docs**

In `docs/performance/orchestrator.md`, section "Chains (`perf:chain`)", replace:

```markdown
- A sized browser step needs at most 4 VUs, or the plan fails and asks for a
  smaller load on the reading step. The cap is a starting value for a
  4-vCPU runner that also runs the app; it is not measured.
```

with:

```markdown
- A sized browser step needs at most 4 VUs, or the plan fails and asks for a
  smaller load on the step that sets its size: its reader, or, when that
  reader is sized too, the first step down the chain of readers that is not.
  The cap is a starting value for a 4-vCPU runner that also runs the app; it
  is not measured.
```

- [ ] **Step 6: Run the full suite and lint**

Run: `(cd scripts && python3 -m unittest discover -s pg/tests -p 'test_*.py' 2>&1 | tail -3) && uvx ruff@0.7.4 check scripts/pg`
Expected: `Ran 243 tests`, `OK`; `All checks passed!`

- [ ] **Step 7: Commit**

```bash
git add scripts/pg/perf_chain.py scripts/pg/tests/test_perf_chain.py docs/performance/orchestrator.md
git commit -m "fix(perf): point a browser cap rejection at the step whose load sets the size"
```

---

### Task 2: Derive the profile list from presets and committed custom configs

Adds the profile derivation beside the current per-step labels. Nothing calls it yet; Task 3 switches the forms and the dispatcher to it and removes the old labels.

**Files:**
- Modify: `scripts/pg/perf_spec.py:33-44`
- Modify: `scripts/pg/perf_forms.py` (imports at line 28; new constants after `SEQUENCE_SEPARATOR`; new functions after `load_mode`)
- Test: `scripts/pg/tests/test_perf_forms.py`

**Interfaces:**
- Consumes: `PERF_OPTIONS_DIR` (`Path`) from `pg.paths`; `PRESET`, `CUSTOM` (`str`) from `pg.perf_spec`; `shapes(options_dir) -> Tuple[str, ...]` from `pg.perf_chain` (tests only).
- Produces:
  - `pg.perf_spec.PRESET_LABELS: Tuple[Tuple[str, str], ...]`, (label, preset stem) for the four built-ins, in form order.
  - `pg.perf_forms.CUSTOM_PREFIX = "Custom: "`, `pg.perf_forms.CUSTOM_DIR = "custom"`.
  - `pg.perf_forms.custom_profiles(options_dir: Path = PERF_OPTIONS_DIR) -> List[str]`
  - `pg.perf_forms.profiles(options_dir: Path = PERF_OPTIONS_DIR) -> List[str]`
  - `pg.perf_forms.profile_load(label: str, options_dir: Path = PERF_OPTIONS_DIR) -> Optional[Tuple[str, str]]`, returning `(PRESET, stem)`, `(CUSTOM, path)`, or `None`.

- [ ] **Step 1: Write the failing tests**

In `scripts/pg/tests/test_perf_forms.py`:

Add `from tempfile import TemporaryDirectory` after `from pathlib import Path`.

Replace the `pg.perf_forms` and `pg.perf_spec` imports with:

```python
from pg.perf_forms import (  # noqa: E402
    CUSTOM_PREFIX,
    LOAD_LABELS,
    FormsError,
    custom_profiles,
    load_mode,
    option_blocks,
    paths,
    profile_load,
    profiles,
    recipes,
    render,
    sequence_label,
    standalone,
)
from pg.perf_spec import AUTO, CUSTOM, PRESET, PRESET_LABELS  # noqa: E402
```

Add this constant after `RECIPES`:

```python
PRESET_PROFILES = ["1 journey", "5 journeys", "1 user for 5 minutes", "5 users for 5 minutes"]
```

Add this class before `class RenderTests`:

```python
class ProfileTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary_directory = TemporaryDirectory()
        self.options = Path(self.temporary_directory.name)

    def tearDown(self) -> None:
        self.temporary_directory.cleanup()

    def write(self, relative: str) -> None:
        path = self.options / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text("{}", encoding="utf-8")

    def test_the_committed_options_offer_four_presets_then_the_custom_config(self) -> None:
        self.assertEqual(profiles(), [*PRESET_PROFILES, "Custom: custom/status-regression.json"])

    def test_preset_labels_cover_every_preset_and_never_look_custom(self) -> None:
        labels = [label for label, _ in PRESET_LABELS]
        self.assertEqual(labels, PRESET_PROFILES)
        self.assertEqual(sorted(stem for _, stem in PRESET_LABELS), sorted(shapes()[1:]))
        self.assertEqual([label for label in labels if label.startswith(CUSTOM_PREFIX)], [])

    def test_custom_profiles_are_every_json_file_beneath_custom_sorted_by_path(self) -> None:
        for relative in (
            "custom/zeta.json", "custom/nested/alpha.json", "custom/beta.json",
            "custom/notes.txt", "1-iteration.json",
        ):
            self.write(relative)
        (self.options / "custom" / "folder.json").mkdir()
        self.assertEqual(
            custom_profiles(self.options),
            [
                "Custom: custom/beta.json",
                "Custom: custom/nested/alpha.json",
                "Custom: custom/zeta.json",
            ],
        )
        self.assertEqual(
            profiles(self.options), [*PRESET_PROFILES, *custom_profiles(self.options)]
        )

    def test_without_a_custom_directory_only_the_presets_are_offered(self) -> None:
        self.write("1-iteration.json")
        self.assertEqual(custom_profiles(self.options), [])
        self.assertEqual(profiles(self.options), PRESET_PROFILES)

    def test_a_profile_label_maps_to_a_preset_or_a_custom_path(self) -> None:
        self.write("custom/x.json")
        self.assertEqual(profile_load("1 journey", self.options), (PRESET, "1-iteration"))
        self.assertEqual(profile_load("5 users for 5 minutes", self.options), (PRESET, "5-vu-5m"))
        self.assertEqual(
            profile_load("Custom: custom/x.json", self.options), (CUSTOM, "custom/x.json")
        )

    def test_anything_the_profile_list_does_not_offer_maps_to_nothing(self) -> None:
        self.write("custom/x.json")
        self.write("1-iteration.json")
        for label in (
            "Custom: 1-iteration.json",
            "Custom: custom/missing.json",
            "Custom: custom/../custom/x.json",
            "Custom:custom/x.json",
            "custom/x.json",
            "1-iteration",
            "1 Journey",
            "Auto (data-size producer; default otherwise)",
            "Custom config",
            "",
        ):
            with self.subTest(label=label):
                self.assertIsNone(profile_load(label, self.options))
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `(cd scripts && python3 -m unittest discover -s pg/tests -p 'test_perf_forms.py' 2>&1 | tail -8)`
Expected: FAIL with `ImportError: cannot import name 'CUSTOM_PREFIX' from 'pg.perf_forms'`.

- [ ] **Step 3: Add `PRESET_LABELS` to the spec module**

In `scripts/pg/perf_spec.py`, replace lines 33-44:

```python
OPTIONS_LABEL = "tests/performance/k6/options/"
CUSTOM_LABEL = "Custom config"
# Form label -> internal load value; every value but auto and custom is a preset stem.
LOAD_LABELS: Tuple[Tuple[str, str], ...] = (
    ("Auto (data-size producer; default otherwise)", AUTO),
    ("1 journey", "1-iteration"),
    ("5 journeys", "5-iterations"),
    ("1 user for 5 minutes", "1-vu-5m"),
    ("5 users for 5 minutes", "5-vu-5m"),
    (CUSTOM_LABEL, CUSTOM),
)
_PRESET_LABELS = {value: label for label, value in LOAD_LABELS if value not in (AUTO, CUSTOM)}
```

with:

```python
OPTIONS_LABEL = "tests/performance/k6/options/"
# GitHub form profile label -> preset stem; pg.perf_forms adds one
# `Custom: <path>` profile per committed custom config.
PRESET_LABELS: Tuple[Tuple[str, str], ...] = (
    ("1 journey", "1-iteration"),
    ("5 journeys", "5-iterations"),
    ("1 user for 5 minutes", "1-vu-5m"),
    ("5 users for 5 minutes", "5-vu-5m"),
)
CUSTOM_LABEL = "Custom config"
# Form label -> internal load value; every value but auto and custom is a preset stem.
LOAD_LABELS: Tuple[Tuple[str, str], ...] = (
    ("Auto (data-size producer; default otherwise)", AUTO),
    *PRESET_LABELS,
    (CUSTOM_LABEL, CUSTOM),
)
_PRESET_LABELS = {value: label for label, value in PRESET_LABELS}
```

`preset_name` reads `_PRESET_LABELS` and keeps its output.

- [ ] **Step 4: Add the profile functions**

In `scripts/pg/perf_forms.py`, replace the `pg.perf_spec` import:

```python
from pg.perf_spec import AUTO, CUSTOM, LOAD_LABELS, MAX_STEPS, PRESET, StepRequest
```

with:

```python
from pg.perf_spec import AUTO, CUSTOM, LOAD_LABELS, MAX_STEPS, PRESET, PRESET_LABELS, StepRequest
```

Add after `SEQUENCE_SEPARATOR = " -> "`:

```python
CUSTOM_PREFIX = "Custom: "
CUSTOM_DIR = "custom"
```

Add after `load_mode`:

```python
def custom_profiles(options_dir: Path = PERF_OPTIONS_DIR) -> List[str]:
    """`Custom: <path>` for every JSON file beneath options/custom/, at any depth,
    sorted by its path relative to the options directory."""
    root = options_dir / CUSTOM_DIR
    if not root.is_dir():
        return []
    found = sorted(
        path.relative_to(options_dir).as_posix()
        for path in root.rglob("*.json")
        if path.is_file()
    )
    return [CUSTOM_PREFIX + path for path in found]


def profiles(options_dir: Path = PERF_OPTIONS_DIR) -> List[str]:
    """The profile choices: the preset labels, then the committed custom configs."""
    return [label for label, _ in PRESET_LABELS] + custom_profiles(options_dir)


def profile_load(label: str, options_dir: Path = PERF_OPTIONS_DIR) -> Optional[Tuple[str, str]]:
    """(preset, stem) or (custom, path) for an offered profile label; None for any other string."""
    for known, stem in PRESET_LABELS:
        if label == known:
            return PRESET, stem
    if label in custom_profiles(options_dir):
        return CUSTOM, label[len(CUSTOM_PREFIX):]
    return None
```

Discovery decides only what the form offers. `custom_config_path` and the planner stay authoritative for containment, existence, JSON shape, and browser rules, so a symlink in `custom/` is listed here and rejected in Task 3.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `(cd scripts && python3 -m unittest discover -s pg/tests -p 'test_perf_forms.py' 2>&1 | tail -3)`
Expected: `OK`.

- [ ] **Step 6: Run the full suite and lint**

Run: `(cd scripts && python3 -m unittest discover -s pg/tests -p 'test_*.py' 2>&1 | tail -3) && uvx ruff@0.7.4 check scripts/pg`
Expected: `Ran 249 tests`, `OK`; `All checks passed!`

- [ ] **Step 7: Commit**

```bash
git add scripts/pg/perf_spec.py scripts/pg/perf_forms.py scripts/pg/tests/test_perf_forms.py
git commit -m "feat(perf): derive form profiles from presets and committed custom configs"
```

---

### Task 3: Switch the GitHub forms to a recipe and one target profile

One commit changes the forms, the reusable workflow, the dispatcher, the tests, and every document that describes ten form values or per-step GitHub loads. The spec requires the documentation change in the same implementation commit.

**Files:**
- Modify: `scripts/pg/perf_spec.py` (docstring lines 10-11; delete `CUSTOM_LABEL` and `LOAD_LABELS`)
- Modify: `scripts/pg/perf_forms.py` (docstring, imports, `load_mode`, `SEQUENCE_SEPARATOR`, `sequence_label`, `recipes`, `option_blocks`, `run`)
- Modify: `scripts/pg/perf_dispatch.py` (docstring, imports, `INPUTS`, `_chain`, `_step`, `normalize`)
- Modify: `.github/workflows/perf-run.yml`, `.github/workflows/perf-chain.yml`, `.github/workflows/_perf-execute.yml`
- Test: `scripts/pg/tests/test_perf_forms.py`, `scripts/pg/tests/test_perf_dispatch.py`, `scripts/pg/tests/test_perf_github_workflows.py`
- Modify: `docs/performance/orchestrator.md` (section "GitHub Actions (`perf-run` and `perf-chain`)")
- Modify: `docs/next-steps/perf-run-ux.md`

**Interfaces:**
- Consumes (Task 2): `PRESET_LABELS`, `CUSTOM_PREFIX`, `custom_profiles`, `profiles(options_dir) -> List[str]`, `profile_load(label, options_dir) -> Optional[Tuple[str, str]]`. Existing: `custom_config_path(raw, options_dir) -> Path` (raises `SpecError`), `StepRequest(workflow, mode=AUTO, value=None)`, `recipes(catalog, options_dir) -> Tuple[List[Tuple[str, ...]], List[str]]`, `plan_chain(entries, catalog, options_dir=PERF_OPTIONS_DIR) -> Plan`.
- Produces:
  - `pg.perf_forms.RECIPE_SEPARATOR = " -> "` and `pg.perf_forms.recipe_label(path: Sequence[str]) -> str` (replace `SEQUENCE_SEPARATOR` and `sequence_label`).
  - `pg.perf_forms.option_blocks(catalog, options_dir=PERF_OPTIONS_DIR)` returns blocks `{"workflows", "recipes", "profiles"}`.
  - `pg.perf_dispatch.INPUTS == ("kind", "selection", "profile")`.
  - `pg.perf_dispatch.normalize(request, catalog, options_dir=PERF_OPTIONS_DIR) -> Tuple[List[StepRequest], List[str]]`: automatic steps, then the target step with the profile's load.
  - Removed: `pg.perf_spec.LOAD_LABELS`, `pg.perf_spec.CUSTOM_LABEL`, `pg.perf_forms.load_mode`, `pg.perf_forms.sequence_label`, `pg.perf_forms.SEQUENCE_SEPARATOR`, `pg.perf_dispatch._step`.

- [ ] **Step 1: Update the forms tests**

In `scripts/pg/tests/test_perf_forms.py`:

Replace the `pg.perf_forms` and `pg.perf_spec` imports with:

```python
from pg.perf_forms import (  # noqa: E402
    CUSTOM_PREFIX,
    FormsError,
    custom_profiles,
    option_blocks,
    paths,
    profile_load,
    profiles,
    recipe_label,
    recipes,
    render,
    standalone,
)
from pg.perf_spec import CUSTOM, PRESET, PRESET_LABELS  # noqa: E402
```

Delete `test_load_labels_cover_auto_custom_and_every_preset`; `test_preset_labels_cover_every_preset_and_never_look_custom` (Task 2) replaces it.

Replace `test_sequence_labels_use_an_ascii_arrow` with:

```python
    def test_recipe_labels_use_an_ascii_arrow(self) -> None:
        self.assertEqual(recipe_label(("http-cart", "http-orders")), "http-cart -> http-orders")
```

In `RenderTests`, replace `TEXT` and the two tests that use it with:

```python
    TEXT = (
        "on:\n"
        "  workflow_dispatch:\n"
        "    inputs:\n"
        "      workflow:\n"
        "        options:\n"
        "          # BEGIN perf:forms workflows\n"
        "          - stale\n"
        "          # END perf:forms workflows\n"
        "      profile:\n"
        "        options:\n"
        "          # BEGIN perf:forms profiles\n"
        "          # END perf:forms profiles\n"
    )

    def test_only_the_marked_blocks_change(self) -> None:
        blocks = {"workflows": ["a", "b c"], "profiles": ["1 journey"]}
        rendered = render(self.TEXT, blocks)
        self.assertEqual(
            rendered,
            self.TEXT.replace("          - stale\n", '          - "a"\n          - "b c"\n').replace(
                "          # BEGIN perf:forms profiles\n",
                '          # BEGIN perf:forms profiles\n          - "1 journey"\n',
            ),
        )
        self.assertEqual(render(rendered, blocks), rendered)

    def test_an_unknown_block_or_a_file_without_blocks_is_an_error(self) -> None:
        with self.assertRaisesRegex(FormsError, "unknown generated block 'profiles'"):
            render(self.TEXT, {"workflows": []})
        with self.assertRaisesRegex(FormsError, "no '# BEGIN perf:forms <id>' block"):
            render("on: push\n", {"workflows": []})
```

Replace `test_option_blocks_name_the_three_lists` with:

```python
    def test_option_blocks_name_the_three_lists(self) -> None:
        blocks, dropped = option_blocks(CATALOG)
        self.assertEqual(dropped, [])
        self.assertEqual(
            blocks,
            {
                "workflows": STANDALONE,
                "recipes": [recipe_label(r) for r in RECIPES],
                "profiles": profiles(),
            },
        )
```

- [ ] **Step 2: Update the dispatcher tests**

In `scripts/pg/tests/test_perf_dispatch.py`:

Add `import os` after `import json`.

Replace the `pg.perf_spec` import with:

```python
from pg.perf_spec import PRESET, StepRequest, spec_document  # noqa: E402
```

Replace `AUTO_LABEL = ...` and the `request` helper with:

```python
PRESETS_OFFERED = "use one of: 1 journey, 5 journeys, 1 user for 5 minutes, 5 users for 5 minutes"
STATUS_RECIPE = "http-cart -> http-orders -> http-orders-status"
STATUS_PROFILE = "Custom: custom/status-regression.json"


def request(kind: str, selection: str, profile: str) -> dict:
    return {"kind": kind, "selection": selection, "profile": profile}
```

Keep `environ` as it is. Replace the whole `NormalizeTests` class with:

```python
class NormalizeTests(unittest.TestCase):
    def test_the_three_inputs_travel_as_upper_snake_case_env(self) -> None:
        self.assertEqual(INPUTS, ("kind", "selection", "profile"))
        self.assertEqual(
            [env_name(name) for name in INPUTS], ["PERF_KIND", "PERF_SELECTION", "PERF_PROFILE"]
        )

    def test_a_single_run_gives_its_only_step_the_profile(self) -> None:
        steps, errors = normalize(request("single", "http-purchase", "1 journey"), CATALOG)
        self.assertEqual(errors, [])
        self.assertEqual(
            spec_document(steps)["steps"],
            [{"workflow": "http-purchase", "load": {"mode": "preset", "value": "1-iteration"}}],
        )

    def test_a_two_step_recipe_gives_the_profile_to_the_target_only(self) -> None:
        steps, errors = normalize(
            request("chain", "http-cart -> http-orders", "5 users for 5 minutes"), CATALOG
        )
        self.assertEqual(errors, [])
        self.assertEqual(
            spec_document(steps)["steps"],
            [
                {"workflow": "http-cart", "load": {"mode": "auto"}},
                {"workflow": "http-orders", "load": {"mode": "preset", "value": "5-vu-5m"}},
            ],
        )

    def test_a_three_step_recipe_with_a_custom_profile_writes_two_auto_producers(self) -> None:
        steps, errors = normalize(request("chain", STATUS_RECIPE, STATUS_PROFILE), CATALOG)
        self.assertEqual(errors, [])
        self.assertEqual(
            spec_document(steps),
            {
                "version": 1,
                "steps": [
                    {"workflow": "http-cart", "load": {"mode": "auto"}},
                    {"workflow": "http-orders", "load": {"mode": "auto"}},
                    {
                        "workflow": "http-orders-status",
                        "load": {"mode": "custom", "path": "custom/status-regression.json"},
                    },
                ],
            },
        )

    def test_a_custom_target_profile_sizes_both_producers_when_planned(self) -> None:
        steps, _ = normalize(request("chain", STATUS_RECIPE, STATUS_PROFILE), CATALOG)
        result = plan_chain(steps, CATALOG)
        self.assertEqual(result.errors, [])
        cart, orders, _status = result.steps
        # 2 VUs x 10 per-VU iterations = 20 rows; +15% margin = 23; cart: 23 x 1.15 -> 27.
        self.assertEqual((orders.sizing.iterations, orders.sized_for), (23, 3))
        self.assertEqual((cart.sizing.iterations, cart.sized_for), (27, 2))

    def test_a_single_run_of_a_consumer_names_its_producers(self) -> None:
        _steps, errors = normalize(request("single", "http-orders", "1 journey"), CATALOG)
        self.assertEqual(
            errors,
            ["http-orders reads data an earlier step writes (carts from browser-cart or "
             "http-cart); run it from perf-chain.yml"],
        )

    def test_an_unknown_or_stale_recipe_is_rejected(self) -> None:
        steps, errors = normalize(
            request("chain", "http-orders -> http-cart", "5 journeys"), CATALOG
        )
        self.assertEqual(steps, [])
        self.assertEqual(len(errors), 1)
        self.assertRegex(
            errors[0], r"^unknown or stale recipe 'http-orders -> http-cart'; use one of: "
        )

    def test_an_old_label_an_internal_value_or_a_recased_label_is_not_a_profile(self) -> None:
        for label in (
            "Auto (data-size producer; default otherwise)",
            "Custom config",
            "5-vu-5m",
            "1 Journey",
            " 1 journey",
            "",
        ):
            with self.subTest(label=label):
                steps, errors = normalize(request("single", "http-purchase", label), CATALOG)
                self.assertEqual(steps, [])
                self.assertEqual(len(errors), 1)
                self.assertTrue(
                    errors[0].startswith(f"unknown or stale profile {label!r}; {PRESETS_OFFERED}"),
                    errors[0],
                )

    def test_a_custom_label_for_a_file_the_form_does_not_offer_is_not_resolved(self) -> None:
        for label in (
            "Custom: 1-iteration.json",
            "Custom: custom/missing.json",
            "Custom: custom/../1-iteration.json",
            "Custom:custom/status-regression.json",
        ):
            with self.subTest(label=label):
                steps, errors = normalize(request("single", "http-purchase", label), CATALOG)
                self.assertEqual(steps, [])
                self.assertEqual(len(errors), 1)
                self.assertTrue(
                    errors[0].startswith(f"unknown or stale profile {label!r}; {PRESETS_OFFERED}"),
                    errors[0],
                )

    def test_a_listed_custom_profile_that_escapes_through_a_symlink_is_rejected(self) -> None:
        with TemporaryDirectory() as temporary:
            root = Path(temporary)
            options = root / "options"
            (options / "custom").mkdir(parents=True)
            (root / "outside.json").write_text("{}", encoding="utf-8")
            os.symlink(root / "outside.json", options / "custom" / "link.json")
            steps, errors = normalize(
                request("single", "http-purchase", "Custom: custom/link.json"), CATALOG, options
            )
        self.assertEqual(steps, [])
        self.assertEqual(
            errors,
            ["profile 'Custom: custom/link.json': custom config 'custom/link.json' resolves "
             "outside tests/performance/k6/options/"],
        )

    def test_selection_and_profile_errors_are_reported_together(self) -> None:
        _steps, errors = normalize(request("single", "nope", "nope"), CATALOG)
        self.assertEqual(len(errors), 2)
        self.assertTrue(errors[0].startswith("unknown workflow 'nope'"), errors[0])
        self.assertTrue(errors[1].startswith("unknown or stale profile 'nope'"), errors[1])

    def test_an_unknown_kind_is_rejected(self) -> None:
        _steps, errors = normalize(request("graph", "http-purchase", "1 journey"), CATALOG)
        self.assertEqual(errors, ["unknown kind 'graph'; use single or chain"])

    def test_a_profile_the_planner_refuses_passes_normalization_and_fails_the_plan(self) -> None:
        cases = {
            ("single", "browser-cart", STATUS_PROFILE):
                "step 1 browser-cart: custom: custom/status-regression.json must set "
                "options.browser.type on every scenario",
            ("single", "browser-cart", "5 users for 5 minutes"):
                "step 1 browser-cart: a browser workflow has no 5 users for 5 minutes "
                "(5-vu-5m) preset",
            ("chain", "browser-purchase -> http-orders-status", "5 users for 5 minutes"):
                "step 1 browser-purchase: sized for step 2 http-orders-status at 5 users for "
                "5 minutes (5-vu-5m), it needs 81 browser VUs; the cap is 4",
        }
        for (kind, selection, profile), message in cases.items():
            with self.subTest(selection=selection, profile=profile):
                steps, errors = normalize(request(kind, selection, profile), CATALOG)
                self.assertEqual(errors, [])
                plan_errors = plan_chain(steps, CATALOG).errors
                self.assertEqual(len(plan_errors), 1)
                self.assertTrue(plan_errors[0].startswith(message), plan_errors[0])
```

In `DispatchTests`, make these replacements and leave every other test as it is:

1. In `dispatch_single`: `values = request("single", "http-purchase", "1 journey")`.
2. Replace `test_a_valid_dispatch_writes_request_spec_record_and_outputs` with:

```python
    def test_a_valid_dispatch_writes_request_spec_record_and_outputs(self) -> None:
        values = request("chain", "browser-cart -> http-orders", "1 journey")
        # A leftover per-step value is not one of the three inputs and must not be copied.
        env = environ(values, GITHUB_OUTPUT=str(self.output), PERF_LOAD_1="old-form-value")
        code = perf_dispatch.dispatch(env, self.dir)
        self.assertEqual(code, 0)
        self.assertEqual(self.read("request.json"), values)
        self.assertEqual(
            self.read("spec.json"),
            spec_document(
                [StepRequest("browser-cart"), StepRequest("http-orders", PRESET, "1-iteration")]
            ),
        )
        self.assertEqual((self.dir / "spec.json").stat().st_mode & 0o222, 0)
        record = self.read("dispatch.json")
        self.assertEqual(
            set(record),
            {"version", "event", "actor", "run", "artifact", "runner", "stage", "status",
             "errors", "problems"},
        )
        self.assertEqual(record["artifact"], "perf-42-1")
        self.assertEqual(
            record["event"],
            {"name": "workflow_dispatch", "ref": "refs/heads/main", "sha": "abc123"},
        )
        self.assertEqual((record["stage"], record["status"]), ("normalize", None))
        self.assertEqual(self.output.read_text(encoding="utf-8"), "browser=true\n")
        for path in self.dir.iterdir():
            text = path.read_text(encoding="utf-8")
            self.assertNotIn("do-not-copy", text)
            self.assertNotIn("old-form-value", text)
```

3. In `test_a_rejected_dispatch_writes_no_spec_and_annotates`: `values = request("chain", "nope", "5 journeys")`; the regex becomes `r"^unknown or stale recipe 'nope'"`; the stdout assertion becomes `"::error title=Punch dispatch::unknown or stale recipe"`.
4. In `test_a_new_dispatch_never_keeps_an_earlier_spec`: `bad = request("single", "http-purchase", "nope")`.
5. In `test_a_new_dispatch_clears_chain_evidence_from_an_earlier_run`: `bad = request("single", "http-orders", "1 journey")`.
6. In the `finalize` helper: `env = environ(request("single", "http-purchase", "1 journey"), PERF_JOB_STATUS=job)`.
7. In `test_a_rejected_dispatch_finalizes_as_rejected`: `perf_dispatch.dispatch(environ(request("single", "nope", "1 journey")), self.dir)`.
8. In `test_finalize_reads_the_chain_directory_that_dispatch_clears`: `env = environ(request("single", "http-purchase", "1 journey"), PERF_JOB_STATUS="failure")`.
9. Add after `test_stage_records_how_far_the_job_got`:

```python
    def test_an_unknown_profile_is_rejected_before_docker_and_recorded(self) -> None:
        values = request("chain", "http-cart -> http-orders", "Custom config")
        self.assertEqual(perf_dispatch.dispatch(environ(values), self.dir), 1)
        self.assertFalse((self.dir / "spec.json").exists())
        self.assertEqual(self.read("request.json"), values)
        self.assertRegex(
            self.read("dispatch.json")["errors"][0], r"^unknown or stale profile 'Custom config'"
        )
        self.assertEqual(self.finalize("failure"), 0)
        self.assertEqual(self.read("dispatch.json")["status"], "rejected")
        self.assertTrue(self.summary().startswith("## Rejected: `http-cart -> http-orders`"))
        self.assertIn("unknown or stale profile 'Custom config'", self.summary())
```

- [ ] **Step 3: Update the workflow contract tests**

In `scripts/pg/tests/test_perf_github_workflows.py`:

Replace the `pg.perf_forms` import and the module constants with:

```python
from pg.perf_forms import (  # noqa: E402
    FORM_FILES,
    option_blocks,
    profiles,
    recipe_label,
    recipes,
    render,
    standalone,
)
from punch.catalog import load_catalog  # noqa: E402

CATALOG = load_catalog(PERF_WORKFLOWS_DIR)
WORKFLOWS = REPO_ROOT / ".github" / "workflows"
EXECUTE = "./.github/workflows/_perf-execute.yml"
```

(`LABELS` and `AUTO_LABEL` are gone.) In `FormTests`, keep `test_the_old_form_is_gone` and `test_committed_forms_match_the_catalog`, and replace the other two tests with:

```python
    def test_the_single_form_has_a_workflow_and_a_profile(self) -> None:
        form = load("perf-run.yml")
        # PyYAML reads the bare `on` key as the boolean True.
        self.assertEqual(list(form[True]), ["workflow_dispatch"])
        inputs = form[True]["workflow_dispatch"]["inputs"]
        self.assertEqual(list(inputs), ["workflow", "profile"])
        self.assertEqual(inputs["workflow"]["options"], standalone(CATALOG))
        self.assertIn(inputs["workflow"]["default"], inputs["workflow"]["options"])
        self.assertEqual(inputs["profile"]["type"], "choice")
        self.assertEqual(inputs["profile"]["options"], profiles())
        self.assertEqual(inputs["profile"]["default"], "1 journey")
        for name in ("github.actor", "inputs.workflow", "inputs.profile"):
            self.assertIn(name, form["run-name"])
        self.assertEqual(form["permissions"], {"contents": "read"})
        job = form["jobs"]["run"]
        self.assertEqual(job["uses"], EXECUTE)
        self.assertEqual(job["with"], {
            "kind": "single",
            "selection": expression("inputs.workflow"),
            "profile": expression("inputs.profile"),
        })

    def test_the_chain_form_has_a_recipe_and_a_target_profile(self) -> None:
        form = load("perf-chain.yml")
        self.assertEqual(list(form[True]), ["workflow_dispatch"])
        inputs = form[True]["workflow_dispatch"]["inputs"]
        self.assertEqual(list(inputs), ["recipe", "target-profile"])
        kept, _ = recipes(CATALOG)
        self.assertEqual(inputs["recipe"]["options"], [recipe_label(path) for path in kept])
        self.assertIn(inputs["recipe"]["default"], inputs["recipe"]["options"])
        target = inputs["target-profile"]
        self.assertEqual(target["type"], "choice")
        self.assertEqual(target["options"], profiles())
        self.assertEqual([o for o in target["options"] if o.startswith("Auto")], [])
        self.assertEqual(target["default"], "5 journeys")
        for name in ("github.actor", "inputs.recipe", "inputs.target-profile"):
            self.assertIn(name, form["run-name"])
        self.assertEqual(form["permissions"], {"contents": "read"})
        job = form["jobs"]["run"]
        self.assertEqual(job["uses"], EXECUTE)
        self.assertEqual(job["with"], {
            "kind": "chain",
            "selection": expression("inputs.recipe"),
            "profile": expression("inputs.target-profile"),
        })
```

In `ExecuteTests`, replace `test_it_is_callable_only_with_the_ten_string_inputs` and `test_form_values_reach_the_dispatcher_only_as_environment_data` with the following, and leave the other tests as they are:

```python
    def test_it_is_callable_only_with_the_three_string_inputs(self) -> None:
        self.assertEqual(list(self.workflow[True]), ["workflow_call"])
        inputs = self.workflow[True]["workflow_call"]["inputs"]
        self.assertEqual(list(inputs), ["kind", "selection", "profile"])
        self.assertEqual(list(inputs), list(INPUTS))
        for name, spec in inputs.items():
            with self.subTest(input=name):
                self.assertEqual(spec["type"], "string")
                self.assertTrue(spec["required"])

    def test_form_values_reach_the_dispatcher_only_as_environment_data(self) -> None:
        step = self.step("Normalize the form values")
        self.assertEqual(step["run"], "./dev perf:dispatch")
        self.assertEqual(step["env"], {
            **{env_name(name): expression(f"inputs.{name}") for name in INPUTS},
            "PERF_RUNNER_LABEL": "ubuntu-latest",
        })
        for each in self.steps:
            with self.subTest(step=each.get("name")):
                self.assertNotIn("${{", each.get("run", ""), "inputs must reach run: through env")
                self.assertNotIn("eval", each.get("run", ""))
```

- [ ] **Step 4: Run the three test modules to verify they fail**

Run: `(cd scripts && for m in test_perf_forms test_perf_dispatch test_perf_github_workflows; do python3 -m unittest discover -s pg/tests -p "$m.py" 2>&1 | tail -2; done)`
Expected: each FAILS; the forms and workflow modules with `ImportError: cannot import name 'recipe_label'`, the dispatcher module with failing `NormalizeTests` (for example `INPUTS` still has ten names).

- [ ] **Step 5: Remove the per-step labels from the spec module**

In `scripts/pg/perf_spec.py`, delete these lines (added in Task 2 beside `PRESET_LABELS`):

```python
CUSTOM_LABEL = "Custom config"
# Form label -> internal load value; every value but auto and custom is a preset stem.
LOAD_LABELS: Tuple[Tuple[str, str], ...] = (
    ("Auto (data-size producer; default otherwise)", AUTO),
    *PRESET_LABELS,
    (CUSTOM_LABEL, CUSTOM),
)
```

In the module docstring, replace:

```
The GitHub forms name each load by a label (LOAD_LABELS); messages name a
preset by its label and its file, so both the forms and the CLI recognize it.
```

with:

```
The GitHub forms name each preset by a profile label (PRESET_LABELS);
messages name a preset by its label and its file, so both the forms and the
CLI recognize it.
```

- [ ] **Step 6: Switch the forms module to recipes and profiles**

In `scripts/pg/perf_forms.py`:

Replace the module docstring with:

```python
"""perf:forms — the GitHub perf forms' option lists, derived from the workflow catalog.

    ./dev perf:forms --write   rewrite the generated option blocks
    ./dev perf:forms --check   fail when a block differs from the catalog

perf-run.yml offers every workflow that requires no dataset (an optional
dataset does not count). perf-chain.yml offers every recipe: an acyclic path
of two to four workflows that starts at one of those, where each link is a
dataset the producer writes for that consumer (named in its targets) and the
consumer requires or reads optionally, and that perf:chain plans with every
step on auto. Both forms offer the same profiles: the preset labels, then
`Custom: <path>` for every JSON file beneath tests/performance/k6/options/custom/.
Only the lines between `# BEGIN perf:forms <id>` and `# END perf:forms <id>`
change. perf:dispatch derives the same lists at run time, so a stale form or an
API dispatch cannot run what the checked-out commit does not offer.
"""
```

Replace the `pg.perf_spec` import with:

```python
from pg.perf_spec import CUSTOM, MAX_STEPS, PRESET, PRESET_LABELS, StepRequest
```

Replace `SEQUENCE_SEPARATOR = " -> "` with `RECIPE_SEPARATOR = " -> "`.

Delete `load_mode` entirely.

Replace `sequence_label` with:

```python
def recipe_label(path: Sequence[str]) -> str:
    return RECIPE_SEPARATOR.join(path)
```

In `recipes`, replace `sequence_label(path)` with `recipe_label(path)`.

Replace `option_blocks` with:

```python
def option_blocks(
    catalog: WorkflowCatalog, options_dir: Path = PERF_OPTIONS_DIR
) -> Tuple[Dict[str, List[str]], List[str]]:
    """Generated block id -> its options, and the recipes left out with why."""
    kept, dropped = recipes(catalog, options_dir)
    blocks = {
        "workflows": standalone(catalog),
        "recipes": [recipe_label(path) for path in kept],
        "profiles": profiles(options_dir),
    }
    return blocks, dropped
```

At the end of `run`, replace:

```python
    info(f"{len(blocks['workflows'])} standalone workflows, {len(blocks['sequences'])} recipes.")
    return 0
```

with:

```python
    info(f"{len(blocks['workflows'])} standalone workflows, {len(blocks['recipes'])} recipes.")
    info(f"Profiles: {', '.join(blocks['profiles'])}")
    return 0
```

- [ ] **Step 7: Switch the dispatcher to three inputs and a target profile**

In `scripts/pg/perf_dispatch.py`:

Replace the module docstring with:

```python
"""perf:dispatch — the GitHub Actions boundary of a Punch run (_perf-execute.yml).

    ./dev perf:dispatch               record the form values (PERF_*) and write spec.json
    ./dev perf:dispatch --stage NAME  record how far the job got (plan, stack, images, execute)
    ./dev perf:dispatch --finalize    set the final status and write the job summary
    ./dev perf:dispatch --publish     append the job summary and artifact link to GITHUB_STEP_SUMMARY

Form values arrive as environment variables, never as script text. The
normalizer re-derives the form choices from the catalog and the options
directory (pg.perf_forms), so a stale form or an API dispatch cannot run what
the checked-out commit does not offer. It writes the versioned spec
(pg.perf_spec) that `perf:chain --spec` plans and then runs unchanged: the
profile is the last step's load, and every earlier step is auto, so the
planner sizes it for the step that reads its data. Evidence lands in
tests/performance/k6/reports/dispatch/: request.json (the three form values as
received), spec.json (written once, read-only), dispatch.json (run metadata,
stage, status), summary.md (the job summary), and Compose diagnostics when the
stack fails to start. No other environment value is copied.
"""
```

Replace the `pg.perf_forms` and `pg.perf_spec` imports with:

```python
from pg.perf_forms import profile_load, profiles, recipe_label, recipes, standalone
from pg.perf_spec import CUSTOM, SpecError, StepRequest, custom_config_path, write_spec
```

Replace the `INPUTS` assignment with:

```python
INPUTS: Tuple[str, ...] = ("kind", "selection", "profile")
```

Replace `_chain`, `_step`, and `normalize` (everything from `def _chain(` up to the `# --- records ---` comment) with:

```python
def _chain(
    selection: str, catalog: WorkflowCatalog, options_dir: Path, errors: List[str]
) -> List[str]:
    kept, _dropped = recipes(catalog, options_dir)
    offered = {recipe_label(path): list(path) for path in kept}
    if selection in offered:
        return offered[selection]
    errors.append(f"unknown or stale recipe {selection!r}; use one of: {', '.join(offered)}")
    return []


def _profile(label: str, options_dir: Path, errors: List[str]) -> Optional[Tuple[str, str]]:
    """The (mode, value) load an offered profile label names; custom paths re-checked."""
    load = profile_load(label, options_dir)
    if load is None:
        errors.append(
            f"unknown or stale profile {label!r}; use one of: {', '.join(profiles(options_dir))}"
        )
        return None
    mode, value = load
    if mode == CUSTOM:
        try:
            custom_config_path(value, options_dir)
        except SpecError as error:
            errors.append(f"profile {label!r}: {error}")
            return None
    return load


def normalize(
    request: Mapping[str, str], catalog: WorkflowCatalog, options_dir: Path = PERF_OPTIONS_DIR
) -> Tuple[List[StepRequest], List[str]]:
    """The step requests a form submission asks for, or the reasons it cannot run.
    The profile is the last step's load; every earlier step is auto."""
    errors: List[str] = []
    kind, selection = request.get("kind", ""), request.get("selection", "")
    if kind == "single":
        names = _single(selection, catalog, errors)
    elif kind == "chain":
        names = _chain(selection, catalog, options_dir, errors)
    else:
        errors.append(f"unknown kind {kind!r}; use {' or '.join(KINDS)}")
        names = []
    target = _profile(request.get("profile", ""), options_dir, errors)
    if errors or target is None:
        return [], errors
    mode, value = target
    return [StepRequest(name) for name in names[:-1]] + [StepRequest(names[-1], mode, value)], []
```

`_single`, `dispatch`, `stage`, `finalize`, and `publish` do not change.

- [ ] **Step 8: Rewrite the two forms and the reusable workflow's contract**

Replace `.github/workflows/perf-run.yml` with:

```yaml
name: Punch performance — single

# Run one Punch workflow that reads no earlier step's data, at one profile,
# against the Expresso stack on this runner. ./dev perf:forms --write
# generates the marked option blocks from the workflow catalog and the
# committed k6 options; _perf-execute.yml validates, runs, and records the run:
# docs/performance/orchestrator.md#github-actions-perf-run-and-perf-chain.

run-name: "perf-run: ${{ inputs.workflow }} (${{ inputs.profile }}) by @${{ github.actor }}"

on:
  workflow_dispatch:
    inputs:
      workflow:
        description: Workflow
        type: choice
        default: http-purchase
        options:
          # BEGIN perf:forms workflows
          # END perf:forms workflows
      profile:
        description: Profile (browser workflows run the -browser preset and refuse the 5-minute profiles)
        type: choice
        default: 1 journey
        options:
          # BEGIN perf:forms profiles
          # END perf:forms profiles

permissions:
  contents: read

jobs:
  run:
    name: Punch run
    uses: ./.github/workflows/_perf-execute.yml
    with:
      kind: single
      selection: ${{ inputs.workflow }}
      profile: ${{ inputs.profile }}
```

Replace `.github/workflows/perf-chain.yml` with:

```yaml
name: Punch performance — chain

# Run one producer/consumer recipe against the Expresso stack on this runner;
# each step reads the datasets earlier steps wrote. The target profile is the
# last step's load; every earlier step is sized for the step that reads its
# data. The recipe list holds only recipes the catalog links and perf:chain
# plans: ./dev perf:forms --write generates the marked option blocks.
# _perf-execute.yml validates, runs, and records the run:
# docs/performance/orchestrator.md#github-actions-perf-run-and-perf-chain.

run-name: "perf-chain: ${{ inputs.recipe }} (${{ inputs.target-profile }}) by @${{ github.actor }}"

on:
  workflow_dispatch:
    inputs:
      recipe:
        description: Recipe
        type: choice
        default: http-cart -> http-orders
        options:
          # BEGIN perf:forms recipes
          # END perf:forms recipes
      target-profile:
        description: Target profile, the last step's load (earlier steps are sized for it; a browser producer above 4 VUs is refused)
        type: choice
        default: 5 journeys
        options:
          # BEGIN perf:forms profiles
          # END perf:forms profiles

permissions:
  contents: read

jobs:
  run:
    name: Punch chain
    uses: ./.github/workflows/_perf-execute.yml
    with:
      kind: chain
      selection: ${{ inputs.recipe }}
      profile: ${{ inputs.target-profile }}
```

Descriptions stay plain YAML scalars without `: `; a colon followed by a space would end the scalar.

In `.github/workflows/_perf-execute.yml`, replace the whole `inputs:` mapping under `workflow_call:` (from `kind:` through the `config-4:` block) with:

```yaml
      kind:
        description: single or chain
        type: string
        required: true
      selection:
        description: The workflow (single) or recipe label (chain)
        type: string
        required: true
      profile:
        description: The profile label; the dispatcher applies it to the last step
        type: string
        required: true
```

In the same file's "Normalize the form values" step, replace the `env:` mapping with:

```yaml
        env:
          # Form values reach Python as data, never as script text.
          PERF_KIND: ${{ inputs.kind }}
          PERF_SELECTION: ${{ inputs.selection }}
          PERF_PROFILE: ${{ inputs.profile }}
          PERF_RUNNER_LABEL: ubuntu-latest
```

Generate the option blocks:

Run: `./dev perf:forms --write`
Expected: `Rewrote perf-run.yml, perf-chain.yml.`, then `6 standalone workflows, 9 recipes.` and `Profiles: 1 journey, 5 journeys, 1 user for 5 minutes, 5 users for 5 minutes, Custom: custom/status-regression.json`.

Run: `git diff .github/workflows/perf-run.yml .github/workflows/perf-chain.yml | grep '^+ *- "'`
Expected: the six workflows (`browser-cart` … `http-purchase-registered`) in `perf-run.yml`, the nine recipes in `perf-chain.yml`, and the five profiles once in each file, all double-quoted.

- [ ] **Step 9: Run the three modules, then the full suite and lint**

Run: `(cd scripts && for m in test_perf_forms test_perf_dispatch test_perf_github_workflows test_perf_spec test_perf_chain; do python3 -m unittest discover -s pg/tests -p "$m.py" 2>&1 | tail -1; done)`
Expected: five lines of `OK`. `test_perf_spec` and `test_perf_chain` pass unchanged (the per-step CLI and version 1 spec contract).

Run: `(cd scripts && python3 -m unittest discover -s pg/tests -p 'test_*.py' 2>&1 | tail -3) && uvx ruff@0.7.4 check scripts/pg && ./dev perf:forms --check`
Expected: `Ran 253 tests`, `OK` (249, minus the deleted load-label test, plus four net `NormalizeTests` and one `DispatchTests`); `All checks passed!`; `The perf forms match the catalog.`

- [ ] **Step 10: Update the GitHub Actions section of `orchestrator.md`**

In `docs/performance/orchestrator.md`, section "GitHub Actions (`perf-run` and `perf-chain`)":

Replace the form table with:

```markdown
| Workflow file    | Title in the Actions tab     | Inputs                 | Runs                                                                      |
| ---------------- | ---------------------------- | ---------------------- | ------------------------------------------------------------------------- |
| `perf-run.yml`   | `Punch performance — single` | Workflow, profile      | One workflow that requires no dataset                                     |
| `perf-chain.yml` | `Punch performance — chain`  | Recipe, target profile | One recipe: a producer and the consumers that read its data, 2 to 4 steps |
```

Replace `The workflow and sequence lists come from the catalog.` with `The workflow and recipe lists come from the catalog.`

Replace everything from the line that starts `| Load label` through the line that ends `the sequence's last workflow are ignored.` with:

```markdown
The target profile is the last step's load. Every earlier step runs `auto`,
so the planner sizes it for the step that reads its data, resolving from the
last step back. `perf-run` applies its profile to its only step. The forms
have no per-step load; `./dev perf:chain` and a version 1 spec file
(`--spec`) keep per-step control.

| Profile                                         | Load                                                                         |
| ----------------------------------------------- | ---------------------------------------------------------------------------- |
| `1 journey`, `5 journeys`                       | Presets `1-iteration`, `5-iterations`; browser steps run the `-browser` ones |
| `1 user for 5 minutes`, `5 users for 5 minutes` | Presets `1-vu-5m`, `5-vu-5m`; refused for browser steps                      |
| `Custom: <path>`                                | The committed k6 options JSON at `<path>`                                    |

`perf:forms` lists the four presets, then one `Custom: <path>` profile for
each `.json` file beneath `tests/performance/k6/options/custom/`, at any
depth, sorted by `<path>`, which is relative to
`tests/performance/k6/options/` (for example
`Custom: custom/status-regression.json`). `perf-run` defaults to `1 journey`
and `perf-chain` to `5 journeys`. Every profile is offered for every choice,
so the planner rejects, before Docker, a 5-minute profile on a browser
workflow, a custom config without browser options on a browser workflow, and
a target profile that would size a browser producer above 4 VUs. A custom
profile's path passes the same rules as a spec path: absolute paths, `..`,
non-JSON files, missing files, and paths that resolve outside
`tests/performance/k6/options/` are rejected. A browser step's custom config
must declare `scenarios` and set `options.browser.type` on each one, as
`tests/performance/k6/options/1-iteration-browser.json` does.
```

Replace:

```markdown
`./dev perf:dispatch` is the boundary. It reads the form values from
environment variables, derives the lists from the catalog again (so an API
dispatch cannot run a sequence the form does not offer), and writes
`tests/performance/k6/reports/dispatch/`:

- `request.json`: the ten form values as received;
```

with:

```markdown
`./dev perf:dispatch` is the boundary. It reads the three form values
(`kind`, `selection`, `profile`) from environment variables, derives the
workflow, recipe, and profile lists from the checked-out commit again (so an
API dispatch cannot run a recipe or profile the form does not offer), makes
every step but the last `auto`, gives the last step the profile's load, and
writes `tests/performance/k6/reports/dispatch/`:

- `request.json`: the three form values as received;
```

Check the section's formatting without restyling the rest of the file:

Run: `npx --no-install prettier docs/performance/orchestrator.md | diff docs/performance/orchestrator.md - | grep -E '^[0-9]'`
Expected: hunk line numbers only outside the "GitHub Actions" section (before Task 3 they are `91,100c91,100`, `116,117c116,117`, `122c122`, and others in earlier sections). If a hunk falls inside the section, align that table or paragraph by hand to match Prettier's output and re-run.

- [ ] **Step 11: Update the descriptive sections of `perf-run-ux.md`**

Load the `technical-writing` skill first. In `docs/next-steps/perf-run-ux.md`, make these edits; dated measurement tables stay as they are, because they record what ran at a pinned commit.

1. Replace the status paragraph:

```markdown
Status: open. Chains run locally and on demand from GitHub Actions. The
GitHub Actions design below is implemented and verified on GitHub on
2026-10-17 (Expresso `a8f7460`, Punch `3e7141f`). Local setup and the start
page still need decisions.
```

with:

```markdown
Status: open. Chains run locally and on demand from GitHub Actions. The
GitHub Actions design below is implemented; its two-input forms are not yet
verified on GitHub. Local setup and the start page still need decisions.
```

2. In the "What is built" table, row "GitHub Actions, `perf-run` and `perf-chain` forms", replace the cell text

```text
One standalone workflow, or one of nine catalog recipes with a load per step (`Auto`, a preset, or a committed custom config)
```

with

```text
One standalone workflow, or one of nine catalog recipes, at one profile for the last step (a preset or a committed custom config); earlier steps are sized automatically
```

3. In the "GitHub Actions design" table, replace `Select one complete valid producer/consumer recipe and configure each active step` with `Select one complete valid producer/consumer recipe and the profile for its last step`.

4. Replace `The chain form therefore selects an already valid complete sequence.` with `The chain form therefore selects an already valid complete recipe.`

5. In "What the forms look like", replace everything from `The single-run form contains three inputs:` through the paragraph that ends `accepting executable or inline JSON from the form.` with:

````markdown
The single-run form contains two inputs:

```text
Run workflow: Punch performance — single
Use workflow from: [ main                         v ]

Workflow          [ http-purchase                 v ]
Profile           [ 1 journey                     v ]

                                             [ Run workflow ]
```

The chain form contains two inputs: one recipe and the profile for its last
step.

```text
Run workflow: Punch performance — chain
Use workflow from: [ main                                           v ]

Recipe            [ http-cart -> http-orders -> http-orders-status v ]
Target profile    [ 5 journeys                                     v ]

                                                  [ Run workflow ]
```

Both forms use `run-name` so the Actions list shows the selected workflow or
recipe, the profile, and the initiating actor. Human-readable profiles are
translated to stable internal loads at the form boundary:

| Profile                 | Internal load                                 |
| ----------------------- | --------------------------------------------- |
| `1 journey`             | `{"mode": "preset", "value": "1-iteration"}`  |
| `5 journeys`            | `{"mode": "preset", "value": "5-iterations"}` |
| `1 user for 5 minutes`  | `{"mode": "preset", "value": "1-vu-5m"}`      |
| `5 users for 5 minutes` | `{"mode": "preset", "value": "5-vu-5m"}`      |
| `Custom: <path>`        | `{"mode": "custom", "path": "<path>"}`        |

The profile always applies to the last workflow. Every earlier step is
automatic: when it produces data for a later step, the planner sizes it for
the first compatible reader, resolving from the end of the chain; otherwise it
uses the workflow's default k6 config. A custom target config participates in
sizing the earlier producers. A different load for an intermediate step needs
`./dev perf:chain` or a committed version 1 spec.

Browser workflows transparently map supported presets to their `-browser`
variant. A duration preset with no browser variant is rejected during
planning. The static form cannot hide incompatible profiles after a workflow
or recipe is selected, so the planner is the authority. After resolving any
browser load, including a custom config or a size derived from the target
profile, the planner must be able to calculate its peak VUs and reject a value
above the current cap of 4.

Custom profiles are committed JSON objects beneath
`tests/performance/k6/options/custom/`. `./dev perf:forms` lists each one as
`Custom: <path>`, with `<path>` relative to `tests/performance/k6/options/`.
The normalizer accepts only a profile it lists for the checked-out commit, and
the path rules still reject absolute paths, `..`, non-JSON files, missing
files, and paths outside the options directory. The form takes no free-text
path or inline JSON, which keeps a run reproducible from its selected Git ref.
````

6. In "Catalog-derived choices", insert this paragraph directly before the paragraph that starts `The form is convenience, not a security boundary.`:

```markdown
The same command writes the profile list into both forms: the four presets,
then one `Custom: <path>` entry per committed JSON file beneath
`tests/performance/k6/options/custom/`.
```

7. In "Normalized execution contract", replace the first paragraph and its JSON block (from `Both forms call` through the closing ```` ``` ```` of the JSON) with:

````markdown
Both forms call `_perf-execute.yml` with the same three inputs: `kind`,
`selection`, and `profile`. A repository command reads those values from
environment variables, resolves the selection to one workflow or an ordered
recipe, makes every step automatic, and replaces the last step's load with
the profile. The result is one versioned JSON document; a single run is the
same document with one step. The recipe
`http-cart -> http-orders -> http-orders-status` with the profile
`Custom: custom/status-regression.json` produces:

```json
{
  "version": 1,
  "steps": [
    { "workflow": "http-cart", "load": { "mode": "auto" } },
    { "workflow": "http-orders", "load": { "mode": "auto" } },
    {
      "workflow": "http-orders-status",
      "load": { "mode": "custom", "path": "custom/status-regression.json" }
    }
  ]
}
```
````

8. In "Result and evidence contract", replace

```markdown
- `request.json`: the form values received by the reusable workflow;
```

with

```markdown
- `request.json`: the three form values received by the reusable workflow;
```

9. In the "Failure behavior" table, replace three first-column cells and one result cell:
   - `Unknown or stale sequence` becomes `Unknown or stale recipe or profile`.
   - `Invalid preset or browser load` becomes `Profile a browser workflow cannot run`.
   - `Browser load exceeds the VU cap` becomes `Browser load, its own or sized for the target, exceeds the VU cap`, and its result `Reject before Docker; identify the resolved config and peak VUs` becomes `Reject before Docker; identify the resolved config, peak VUs, and the step whose load to lower`.

10. In "Alternatives rejected", add this bullet after the bullet that starts `Independent workflow dropdowns`:

```markdown
- A load and a custom-config path for each of four steps in the chain form
  showed unused fields for shorter recipes and asked the operator to know the
  planner's steps. One target profile keeps producer sizing; `./dev
  perf:chain` and a version 1 spec keep per-step control. See the
  [form simplification design](../superpowers/specs/2026-10-17-performance-form-simplification-design.md).
```

11. In "Design acceptance conditions", replace items 3 and 4 with:

```markdown
3. The last step accepts a preset or committed custom profile, every earlier
   step is sized automatically, and a custom target config sizes the earlier
   producers.
4. An invalid recipe or profile submitted through the API is rejected before
   Docker, even though it never appeared in the UI.
```

Format and check:

Run: `npx --no-install prettier --write docs/next-steps/perf-run-ux.md && npx --no-install prettier --check docs/next-steps/perf-run-ux.md .github/workflows/perf-run.yml .github/workflows/perf-chain.yml .github/workflows/_perf-execute.yml`
Expected: `All matched files use Prettier code style!` (`perf-run-ux.md` was Prettier-clean before this task, so `--write` only realigns the edited tables.)

Run: `grep -n -E '—|–| -- ' docs/next-steps/perf-run-ux.md | grep -v 'Punch performance —'`
Expected: no line added by this task (pre-existing lines may appear; compare with `git diff -U0 docs/next-steps/perf-run-ux.md | grep '^+' | grep -E '—|–| -- ' | grep -v 'Punch performance —'`, which must print nothing).

Prove no other current document describes the old contract:

Run: `grep -rn -E 'ten form values|ten (reusable )?inputs|step[1-4]-(load|config)|load-[1-4]|config-[1-4]|Custom config|Auto \(data-size|LOAD_LABELS|CUSTOM_LABEL|sequence_label|load_mode|perf:forms (loads|sequences)' scripts .github docs/performance docs/next-steps docs/cli-reference.md CLAUDE.md tests/performance/k6/README.md`
Expected: matches only in tests that feed old labels on purpose (`test_perf_dispatch.py`, `test_perf_forms.py`); none in code, workflows, or docs.

- [ ] **Step 12: Commit**

```bash
git add scripts/pg/perf_spec.py scripts/pg/perf_forms.py scripts/pg/perf_dispatch.py \
  scripts/pg/tests/test_perf_forms.py scripts/pg/tests/test_perf_dispatch.py \
  scripts/pg/tests/test_perf_github_workflows.py \
  .github/workflows/perf-run.yml .github/workflows/perf-chain.yml .github/workflows/_perf-execute.yml \
  docs/performance/orchestrator.md docs/next-steps/perf-run-ux.md
git commit -m "feat(perf): take a recipe and one target profile in the GitHub forms"
```

---

### Task 4: Local rehearsal of the reusable job

Proves the command sequence `_perf-execute.yml` runs works with the new contract, before anything is pushed. No file changes unless a defect is found; fix it in the owning task's files, with a test, and commit separately.

**Files:** none.

**Interfaces:**
- Consumes: `./dev perf:dispatch` reading `PERF_KIND`, `PERF_SELECTION`, `PERF_PROFILE`; `./dev perf:chain --spec <path> [--plan]`.

- [ ] **Step 1: Rehearse an unknown profile** (no Docker)

```bash
SCRATCH=<session scratchpad directory>
env PERF_KIND=chain PERF_SELECTION="http-cart -> http-orders" \
  PERF_PROFILE="Auto (data-size producer; default otherwise)" \
  GITHUB_RUN_ID=1 GITHUB_RUN_ATTEMPT=1 GITHUB_OUTPUT="$SCRATCH/out" ./dev perf:dispatch; echo "exit $?"
env PERF_JOB_STATUS=failure ./dev perf:dispatch --finalize; echo "exit $?"
env GITHUB_STEP_SUMMARY="$SCRATCH/step-summary.md" ./dev perf:dispatch --publish; echo "exit $?"
cat tests/performance/k6/reports/dispatch/request.json tests/performance/k6/reports/dispatch/dispatch.json "$SCRATCH/step-summary.md"
```

Expected: dispatch exit 1 with `unknown or stale profile 'Auto (data-size producer; default otherwise)'; use one of: 1 journey, 5 journeys, 1 user for 5 minutes, 5 users for 5 minutes, Custom: custom/status-regression.json`; `request.json` holds exactly `kind`, `selection`, `profile`; finalize exit 0 with status `rejected`; publish exit 1 (no artifact URL); the summary starts `## Rejected: `http-cart -> http-orders`` and carries the runner warning.

- [ ] **Step 2: Rehearse a target profile that breaks the browser cap** (no Docker)

```bash
env PERF_KIND=chain PERF_SELECTION="browser-cart -> http-orders -> http-orders-status" \
  PERF_PROFILE="1 user for 5 minutes" ./dev perf:dispatch \
  && ./dev perf:chain --spec tests/performance/k6/reports/dispatch/spec.json --plan; echo "exit $?"
```

Expected: dispatch exit 0 with steps `auto`, `auto`, `{"mode": "preset", "value": "1-vu-5m"}`; plan exit 1 with `step 1 browser-cart: sized for step 2 http-orders at auto: sized for step 3 (575 iterations, 3 VUs), it needs 7 browser VUs; the cap is 4. Pick a smaller load for step 3`.

- [ ] **Step 3: Rehearse the three-step chain with a custom target profile**

Requires Docker Desktop running.

```bash
export PERF_KIND=chain PERF_SELECTION="http-cart -> http-orders -> http-orders-status" \
  PERF_PROFILE="Custom: custom/status-regression.json" \
  GITHUB_RUN_ID=2 GITHUB_RUN_ATTEMPT=1 GITHUB_SHA="$(git rev-parse HEAD)" \
  GITHUB_REF="refs/heads/$(git branch --show-current)"
./dev perf:dispatch && cat tests/performance/k6/reports/dispatch/spec.json \
  && ./dev perf:dispatch --stage plan && ./dev perf:chain --spec tests/performance/k6/reports/dispatch/spec.json --plan \
  && ./dev perf:dispatch --stage stack && ./dev up \
  && ./dev perf:dispatch --stage images && docker compose -f infra/docker/compose.performance.yaml build k6 \
  && ./dev perf:dispatch --stage execute && ./dev perf:chain --spec tests/performance/k6/reports/dispatch/spec.json
PERF_JOB_STATUS=success ./dev perf:dispatch --finalize; echo "finalize $?"
GITHUB_STEP_SUMMARY="$SCRATCH/chain-summary.md" PERF_ARTIFACT_URL=https://example.invalid/a PERF_ARTIFACT_DIGEST=0 ./dev perf:dispatch --publish
cat "$SCRATCH/chain-summary.md"
./dev down
unset PERF_KIND PERF_SELECTION PERF_PROFILE GITHUB_RUN_ID GITHUB_RUN_ATTEMPT GITHUB_SHA GITHUB_REF
```

Expected: `spec.json` matches the spec's example (two `auto` steps, one custom target); the plan sizes `http-cart` to 27 iterations for step 2 and `http-orders` to 23 for step 3; all three steps pass; finalize exit 0 with status `passed`; the summary has three rows whose load cells read `auto: sized for step 2 (27 iterations, …)`, `auto: sized for step 3 (23 iterations, …)`, and `custom: custom/status-regression.json`, plus the threshold list and the ref and SHA lines.

- [ ] **Step 4: Full verification gate**

```bash
(cd scripts && python3 -m unittest discover -s pg/tests -p 'test_*.py' 2>&1 | tail -3)
uvx ruff@0.7.4 check scripts/pg
./dev perf:forms --check
npx --no-install prettier --check docs/next-steps/perf-run-ux.md .github/workflows/perf-run.yml .github/workflows/perf-chain.yml .github/workflows/_perf-execute.yml
git status --short
```

Expected: `Ran 253 tests`, `OK`; `All checks passed!`; `The perf forms match the catalog.` with `6 standalone workflows, 9 recipes.` and the five profiles; Prettier clean; `git status` clean (reports are gitignored).

---

### Task 5: Review, merge, and verify on GitHub

**Ask the user before each outward action in this task.**

**Files:**
- Modify: `docs/next-steps/perf-run-ux.md` (status paragraph and measured runs)

- [ ] **Step 1: Request a whole-branch review** with superpowers:requesting-code-review against `main`. Fix findings with tests in the owning task's files; re-run Task 4 Step 4.

- [ ] **Step 2: With the user's OK, push the branch and try a branch dispatch**

```bash
git push -u origin feat/perf-form-profiles
gh workflow run perf-run.yml --ref feat/perf-form-profiles -f workflow=http-purchase -f profile="1 journey"
```

Both form files already exist on `main`, so `--ref` may run the branch's definitions. If GitHub rejects the new inputs (HTTP 422, for example `Unexpected inputs provided`), do not retry from the branch: go to Step 3 and dispatch from `main` after the merge. Otherwise set `REF=feat/perf-form-profiles` for Step 4 and merge after Step 4 passes.

- [ ] **Step 3: With the user's OK, merge to `main` and push**

```bash
git switch main && git merge --no-ff feat/perf-form-profiles -m "Merge branch 'feat/perf-form-profiles'"
git log origin/main..HEAD -- vendor/punch   # must print nothing: Punch is not bumped
git push origin main
gh run watch "$(gh run list --workflow ci.yml --branch main --limit 1 --json databaseId -q '.[0].databaseId')"
```

Expected: CI green, including the Python job's tests and ruff.

- [ ] **Step 4: With the user's OK, dispatch the acceptance runs**

```bash
REF=${REF:-main}
gh workflow run perf-run.yml --ref "$REF" -f workflow=http-purchase -f profile="1 journey"
gh workflow run perf-chain.yml --ref "$REF" -f recipe="http-cart -> http-orders -> http-orders-status" -f target-profile="Custom: custom/status-regression.json"
gh workflow run perf-chain.yml --ref "$REF" -f recipe="browser-purchase -> http-orders-status" -f target-profile="5 users for 5 minutes"
gh workflow run perf-chain.yml --ref "$REF" -f recipe="http-cart -> http-orders" -f target-profile="Auto (data-size producer; default otherwise)"   # not an option: record GitHub's response
```

Skip the first command if Step 2 already ran it from the branch. For each run, `gh run watch <id>`, then read the job summary. Download the two passing runs' artifacts with `gh run download <id> -D "$SCRATCH/run-<id>"`. Check:

1. `gh workflow view perf-run.yml --ref "$REF" --yaml` and the same for `perf-chain.yml` show exactly two inputs each, the five profiles, and `5 journeys` as the chain default.
2. The single run and the three-step chain pass; the chain's load cells show both producers `auto: sized for step …` and the target `custom: custom/status-regression.json`.
3. `dispatch/request.json` in each artifact holds exactly `kind`, `selection`, and `profile`.
4. Apart from `request.json`, each artifact's file tree matches a pre-change run of the same kind: compare `find "$SCRATCH/run-<id>" -type f | sed 's|.*/run-[0-9]*/||' | sort` with the same listing of an artifact from a run at `a8f7460` (find one with `gh run list --workflow perf-chain.yml --limit 20`; artifacts are kept for 90 days by default).
5. `browser-purchase -> http-orders-status` at `5 users for 5 minutes` is `Rejected` before the stack starts, with `it needs 81 browser VUs; the cap is 4`.
6. The `Auto` profile request is rejected before Docker: by GitHub's choice validation (HTTP 422) or by `perf:dispatch` (`Rejected` summary). Record which; `test_an_old_label_an_internal_value_or_a_recased_label_is_not_a_profile` covers the normalizer either way.
7. Each summary carries the runner warning and ends with the artifact link and SHA-256 digest.

If Step 2 dispatched from the branch, run Step 3 now.

- [ ] **Step 5: Record the evidence**

Load the `technical-writing` skill. In `docs/next-steps/perf-run-ux.md`:
- Replace the status paragraph's second sentence (`The GitHub Actions design below is implemented; its two-input forms are not yet verified on GitHub.`) with the following, filling the date, the merge SHA, and the output of `git rev-parse --short HEAD:vendor/punch`:

```markdown
The GitHub Actions design below is implemented and verified on GitHub on
<date> (Expresso `<merge SHA>`, Punch `<punch SHA>`).
```

- Add a table after the 2026-10-17 measured table, introduced by the line below, with the same columns (Form run, Job time, Stack start, Run) and one row per Step 4 run, including the rejected ones:

```markdown
Measured on GitHub on <date> with the two-input forms (`<merge SHA>`):
```

Run: `npx --no-install prettier --write docs/next-steps/perf-run-ux.md && npx --no-install prettier --check docs/next-steps/perf-run-ux.md`

```bash
git add docs/next-steps/perf-run-ux.md
git commit -m "docs(next-steps): record the two-input perf forms' GitHub verification"
```

With the user's OK, push `main`.
