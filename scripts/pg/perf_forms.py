"""perf:forms — the GitHub perf forms' option lists, derived from the catalog and custom configs.

    ./dev perf:forms --write   rewrite the generated option blocks
    ./dev perf:forms --check   fail when a block differs from the derived lists

perf-job.yml offers every job that requires no dataset (an optional
dataset does not count). perf-workflow.yml offers every workflow: an acyclic path
of two to four jobs that starts at one of those, where each link is a
dataset the producer writes for that consumer (named in its targets) and the
consumer requires or reads optionally, and that perf:workflow plans with every
step on auto. Both forms offer the same workloads (k6's term for how much
traffic a test applies and in which pattern): the preset labels, then
`Custom: <path>` for every JSON file beneath tests/performance/k6/options/custom/.
Only the lines between `# BEGIN perf:forms <id>` and `# END perf:forms <id>`
change. perf:dispatch derives the same lists at run time, so a stale form or an
API dispatch cannot run what the checked-out commit does not offer.
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Dict, List, Optional, Sequence, Tuple

from pg.ansi import fail, info, pass_, warn
from pg.paths import PERF_JOBS_DIR, PERF_OPTIONS_DIR, REPO_ROOT
from pg.perf_spec import CUSTOM, MAX_STEPS, PRESET, PRESET_LABELS, StepRequest
from pg.perf_workflow import plan_workflow

# pg.paths initializes PUNCH_SRC before these public Punch imports.
from punch.catalog import CatalogError, JobCatalog, load_catalog
from punch.job import JobError

FORM_FILES = (
    REPO_ROOT / ".github" / "workflows" / "perf-job.yml",
    REPO_ROOT / ".github" / "workflows" / "perf-workflow.yml",
)
WORKFLOW_SEPARATOR = " -> "
CUSTOM_PREFIX = "Custom: "
CUSTOM_DIR = "custom"
BLOCK = re.compile(
    r"^(?P<indent>[ \t]*)# BEGIN perf:forms (?P<id>[\w-]+)\n"
    r"(?P<body>.*?)"
    r"^(?P=indent)# END perf:forms (?P=id)\n",
    re.MULTILINE | re.DOTALL,
)


class FormsError(ValueError):
    pass


def custom_workloads(options_dir: Path = PERF_OPTIONS_DIR) -> List[str]:
    """`Custom: <path>` for every JSON file beneath options/custom/, at any depth,
    sorted by its path relative to the options directory."""
    root = options_dir / CUSTOM_DIR
    if not root.is_dir():
        return []
    found = sorted(
        path.relative_to(options_dir).as_posix() for path in root.rglob("*.json") if path.is_file()
    )
    return [CUSTOM_PREFIX + path for path in found]


def workloads(options_dir: Path = PERF_OPTIONS_DIR) -> List[str]:
    """The workload choices: the preset labels, then the committed custom configs."""
    return [label for label, _ in PRESET_LABELS] + custom_workloads(options_dir)


def parse_workload(label: str, options_dir: Path = PERF_OPTIONS_DIR) -> Optional[Tuple[str, str]]:
    """(preset, stem) or (custom, path) for an offered workload label; None for any other string."""
    for known, stem in PRESET_LABELS:
        if label == known:
            return PRESET, stem
    if label in custom_workloads(options_dir):
        return CUSTOM, label[len(CUSTOM_PREFIX) :]
    return None


def standalone(catalog: JobCatalog) -> List[str]:
    """Jobs that need no earlier step: no required dataset."""
    return sorted(
        name for name, job in catalog.jobs.items() if job.data is None or not job.data.requires
    )


def links(catalog: JobCatalog) -> Dict[str, List[str]]:
    """producer -> the consumers it writes a dataset for, each consumer once."""
    result: Dict[str, List[str]] = {}
    for name, job in catalog.jobs.items():
        if job.data is None:
            continue
        for product in job.data.produces:
            for target in product.targets:
                consumer = catalog.jobs[target].data
                if consumer is None:
                    continue
                if product.dataset in consumer.requires or product.dataset in consumer.optional:
                    if target not in result.setdefault(name, []):
                        result[name].append(target)
    return {name: sorted(consumers) for name, consumers in result.items()}


def paths(catalog: JobCatalog, max_steps: int = MAX_STEPS) -> List[Tuple[str, ...]]:
    """Every acyclic link path of 2..max_steps jobs from a standalone job."""
    graph = links(catalog)
    found = set()

    def walk(path: Tuple[str, ...]) -> None:
        if len(path) >= 2:
            found.add(path)
        if len(path) == max_steps:
            return
        for consumer in graph.get(path[-1], []):
            if consumer not in path:
                walk(path + (consumer,))

    for start in standalone(catalog):
        walk((start,))
    return sorted(found)


def workflow_label(path: Sequence[str]) -> str:
    return WORKFLOW_SEPARATOR.join(path)


def workflows(
    catalog: JobCatalog, options_dir: Path = PERF_OPTIONS_DIR
) -> Tuple[List[Tuple[str, ...]], List[str]]:
    """Paths that plan with every step on auto, and why any other path was left out."""
    kept: List[Tuple[str, ...]] = []
    dropped: List[str] = []
    for path in paths(catalog):
        plan = plan_workflow([StepRequest(name) for name in path], catalog, options_dir)
        if plan.errors:
            dropped.append(f"{workflow_label(path)}: {'; '.join(plan.errors)}")
        else:
            kept.append(path)
    return kept, dropped


def option_blocks(
    catalog: JobCatalog, options_dir: Path = PERF_OPTIONS_DIR
) -> Tuple[Dict[str, List[str]], List[str]]:
    """Generated block id -> its options, and the workflows left out with why."""
    kept, dropped = workflows(catalog, options_dir)
    blocks = {
        "jobs": standalone(catalog),
        "workflows": [workflow_label(path) for path in kept],
        "workloads": workloads(options_dir),
    }
    return blocks, dropped


def render(text: str, blocks: Dict[str, List[str]], source: str = "form") -> str:
    """`text` with every marked block's options replaced; the markers stay."""
    found: List[str] = []

    def replace(match: "re.Match[str]") -> str:
        block, indent = match.group("id"), match.group("indent")
        if block not in blocks:
            raise FormsError(f"{source}: unknown generated block {block!r}")
        found.append(block)
        # JSON strings are valid double-quoted YAML scalars.
        options = "".join(f"{indent}- {json.dumps(option)}\n" for option in blocks[block])
        return f"{indent}# BEGIN perf:forms {block}\n{options}{indent}# END perf:forms {block}\n"

    result = BLOCK.sub(replace, text)
    if not found:
        raise FormsError(f"{source}: no '# BEGIN perf:forms <id>' block")
    return result


def run(args: Sequence[str]) -> int:
    parser = argparse.ArgumentParser(
        prog="./dev perf:forms",
        description="Derive the GitHub perf forms' option lists from the job catalog "
        "and the custom configs.",
    )
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--write", action="store_true", help="Rewrite the generated option blocks.")
    mode.add_argument(
        "--check", action="store_true", help="Fail when a block differs from the derived lists."
    )
    parsed = parser.parse_args(list(args))
    stale: List[Path] = []
    try:
        blocks, dropped = option_blocks(load_catalog(PERF_JOBS_DIR))
        for path in FORM_FILES:
            text = path.read_text(encoding="utf-8")
            rendered = render(text, blocks, path.name)
            if rendered != text:
                stale.append(path)
                if parsed.write:
                    path.write_text(rendered, encoding="utf-8")
    except (CatalogError, JobError, FormsError, OSError) as error:
        fail(f"Could not derive the perf forms: {error}")
        return 1
    for message in dropped:
        warn(f"Not offered (fails to plan on auto): {message}")
    names = ", ".join(path.name for path in stale)
    if parsed.check and stale:
        fail(f"{names} differ from the catalog and custom configs; run ./dev perf:forms --write")
        return 1
    if parsed.write and stale:
        pass_(f"Rewrote {names}.")
    else:
        pass_("The perf forms match the catalog and custom configs.")
    info(f"{len(blocks['jobs'])} standalone jobs, {len(blocks['workflows'])} workflows.")
    info(f"Workloads: {', '.join(blocks['workloads'])}")
    return 0
