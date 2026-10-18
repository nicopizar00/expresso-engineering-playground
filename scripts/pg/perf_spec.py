"""The versioned run spec: what `perf:dispatch` writes and `perf:workflow --spec` runs.

A spec lists the active steps of one run, in order. Each step names a catalog
job and one load:

    {"mode": "auto"}                               sized for its reader, else the job's config
    {"mode": "preset", "value": "5-vu-5m"}         tests/performance/k6/options/<value>.json
    {"mode": "custom", "path": "custom/x.json"}    a committed JSON beneath that directory

The GitHub forms name each preset by a profile label (PRESET_LABELS);
messages name a preset by its label and its file, so both the forms and the
CLI recognize it.

Stdlib-only: this module checks shape and paths, not the catalog. pg.perf_workflow
checks jobs, data links, presets, sizing, and the browser VU cap.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from typing import Any, Dict, List, Optional, Sequence, Tuple

from pg.paths import PERF_OPTIONS_DIR

SPEC_VERSION = 2
MAX_STEPS = 4
AUTO = "auto"
PRESET = "preset"
CUSTOM = "custom"
LOAD_MODES = (AUTO, PRESET, CUSTOM)
_LOAD_KEYS = {AUTO: {"mode"}, PRESET: {"mode", "value"}, CUSTOM: {"mode", "path"}}
OPTIONS_LABEL = "tests/performance/k6/options/"
# GitHub form profile label -> preset stem; pg.perf_forms adds one
# `Custom: <path>` profile per committed custom config.
PRESET_LABELS: Tuple[Tuple[str, str], ...] = (
    ("1 journey", "1-iteration"),
    ("5 journeys", "5-iterations"),
    ("1 user for 5 minutes", "1-vu-5m"),
    ("5 users for 5 minutes", "5-vu-5m"),
)
_PRESET_LABELS = {value: label for label, value in PRESET_LABELS}


class SpecError(ValueError):
    pass


@dataclass(frozen=True)
class StepRequest:
    """One requested step before planning: a job name and its load."""

    job: str
    mode: str = AUTO
    # The preset stem (preset) or the path beneath the options directory (custom).
    value: Optional[str] = None

    def to_json(self) -> Dict[str, Any]:
        load: Dict[str, Any] = {"mode": self.mode}
        if self.mode == PRESET:
            load["value"] = self.value
        elif self.mode == CUSTOM:
            load["path"] = self.value
        return {"job": self.job, "load": load}


def preset_name(stem: str, file: Optional[str] = None) -> str:
    """A preset as `<form label> (<file stem>)`; the file defaults to the stem."""
    label = _PRESET_LABELS.get(stem)
    return f"{label} ({file or stem})" if label else file or stem


def spec_document(steps: Sequence[StepRequest]) -> Dict[str, Any]:
    return {"version": SPEC_VERSION, "steps": [step.to_json() for step in steps]}


def _parse_step(number: int, step: Any) -> StepRequest:
    where = f"step {number}"
    if not isinstance(step, dict) or set(step) != {"job", "load"}:
        raise SpecError(f"{where} must be an object with exactly job and load")
    job, load = step["job"], step["load"]
    if not isinstance(job, str) or not job:
        raise SpecError(f"{where}: job must be a non-empty string")
    if not isinstance(load, dict):
        raise SpecError(f"{where}: load must be an object")
    mode = load.get("mode")
    expected = _LOAD_KEYS.get(mode) if isinstance(mode, str) else None
    if expected is None:
        raise SpecError(f"{where}: load mode must be one of {', '.join(LOAD_MODES)}")
    if set(load) != expected:
        article = "an" if mode == AUTO else "a"
        raise SpecError(
            f"{where}: {article} {mode} load takes exactly {', '.join(sorted(expected))}"
        )
    value = load.get("value", load.get("path"))
    if mode != AUTO and (not isinstance(value, str) or not value):
        raise SpecError(f"{where}: a {mode} load needs a non-empty string")
    return StepRequest(job, mode, value)


def parse_spec(document: Any) -> List[StepRequest]:
    """The step requests of a spec document; SpecError on any deviation."""
    if not isinstance(document, dict):
        raise SpecError("a spec must be a JSON object")
    extra = set(document) - {"version", "steps"}
    if extra:
        raise SpecError(f"unknown spec keys: {', '.join(sorted(extra))}")
    version = document.get("version")
    if version == 1:
        raise SpecError(
            'spec version 1 is no longer read: set "version": 2 and rename each '
            'step\'s "workflow" to "job"'
        )
    if version != SPEC_VERSION:
        raise SpecError(f"spec version must be {SPEC_VERSION}")
    steps = document.get("steps")
    if not isinstance(steps, list) or not 1 <= len(steps) <= MAX_STEPS:
        raise SpecError(f"a spec needs 1 to {MAX_STEPS} steps")
    return [_parse_step(number, step) for number, step in enumerate(steps, start=1)]


def load_spec(path: Path) -> List[StepRequest]:
    try:
        document = json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, ValueError) as error:
        raise SpecError(f"could not read {path}: {error}") from error
    return parse_spec(document)


def write_spec(path: Path, steps: Sequence[StepRequest]) -> None:
    """Write the spec once: an existing file is an error; the result is read-only."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("x", encoding="utf-8") as handle:
        handle.write(json.dumps(spec_document(steps), indent=2) + "\n")
    path.chmod(0o444)


def custom_config_path(raw: str, options_dir: Path = PERF_OPTIONS_DIR) -> Path:
    """The committed k6 options JSON that `raw` names beneath the options directory."""
    if not raw:
        raise SpecError(f"a custom config needs a JSON path relative to {OPTIONS_LABEL}")
    relative = PurePosixPath(raw)
    if "\\" in raw or relative.is_absolute():
        raise SpecError(f"custom config {raw!r} must be a path relative to {OPTIONS_LABEL}")
    if ".." in relative.parts:
        raise SpecError(f"custom config {raw!r} must not contain '..'")
    if relative.suffix != ".json":
        raise SpecError(f"custom config {raw!r} must be a .json file")
    root = options_dir.resolve()
    path = (root / raw).resolve()
    if root not in path.parents:
        raise SpecError(f"custom config {raw!r} resolves outside {OPTIONS_LABEL}")
    if not path.is_file():
        raise SpecError(f"custom config {raw!r} does not exist beneath {OPTIONS_LABEL}")
    return path
