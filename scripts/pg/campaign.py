"""campaign — catalog-driven k6 campaigns. Sibling to perf.py: same
Docker/report conventions, own preflight against use-cases/catalog.json
(SPEC-006 concurrency safety). Thresholds are generated here rather than in
config/thresholds.js because they depend on which use cases a given
campaign descriptor selects — there is no static set to name ahead of time.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List, Optional

from pg.paths import REPO_ROOT

CATALOG_PATH = REPO_ROOT / "use-cases" / "catalog.json"
DEFAULT_DESCRIPTOR = (
    REPO_ROOT / "tests" / "performance" / "k6" / "campaigns" / "morning-rush.json"
)

EXEC_MAP: Dict[str, str] = {
    "k6.catalog-browse": "catalogBrowse",
    "k6.order-lookup": "orderLookup",
    "k6.purchase": "purchase",
}


def load_json(path: Path) -> Dict[str, Any]:
    with path.open("r", encoding="utf-8") as fh:
        return json.load(fh)


def resolve_use_case(
    catalog: Dict[str, Any], use_case_id: str, version: int
) -> Optional[Dict[str, Any]]:
    for entry in catalog.get("useCases", []):
        if entry["id"] == use_case_id and entry["version"] == version:
            return entry
    return None


def preflight(descriptor: Dict[str, Any], catalog: Dict[str, Any]) -> List[str]:
    errors: List[str] = []
    if "runId" not in descriptor:
        errors.append("descriptor missing required field: runId")
    if "durationSeconds" not in descriptor:
        errors.append("descriptor missing required field: durationSeconds")
    seen: set = set()
    for selection in descriptor.get("useCases", []):
        missing = [f for f in ("id", "version", "weight") if selection.get(f) is None]
        if missing:
            errors.append(f"use case selection missing required field(s): {', '.join(missing)}")
            continue
        use_case_id = selection["id"]
        version = selection["version"]
        weight = selection["weight"]
        key = (use_case_id, version)
        if key in seen:
            errors.append(f"duplicate use-case selection: {use_case_id}@{version}")
            continue
        seen.add(key)
        entry = resolve_use_case(catalog, use_case_id, version)
        if entry is None:
            errors.append(f"unknown use case: {use_case_id}@{version}")
            continue
        if entry.get("status") == "deprecated":
            errors.append(f"deprecated use case: {use_case_id}@{version}")
            continue
        if entry["adapter"] not in EXEC_MAP:
            errors.append(
                f"no campaign adapter wired for: {use_case_id} (adapter {entry['adapter']})"
            )
            continue
        concurrency = entry.get("concurrency", {})
        max_vus = concurrency.get("maxVirtualUsers")
        if not concurrency.get("safe", True) and max_vus is not None and weight > max_vus:
            errors.append(
                f"{use_case_id} requests {weight} VUs but its concurrency limit is "
                f"maxVirtualUsers={max_vus}"
            )
    return errors


def _scenario_name(use_case_id: str) -> str:
    return use_case_id.replace(".", "_").replace("-", "_")


def build_k6_options(descriptor: Dict[str, Any], catalog: Dict[str, Any]) -> Dict[str, Any]:
    scenarios: Dict[str, Any] = {}
    thresholds: Dict[str, Any] = {"http_req_failed": ["rate<0.05"]}
    for selection in descriptor["useCases"]:
        entry = resolve_use_case(catalog, selection["id"], selection["version"])
        name = _scenario_name(selection["id"])
        scenarios[name] = {
            "executor": "constant-vus",
            "vus": selection["weight"],
            "duration": f"{descriptor['durationSeconds']}s",
            "exec": EXEC_MAP[entry["adapter"]],
            "tags": {
                "use_case": entry["id"],
                "use_case_version": str(entry["version"]),
            },
        }
        # Referencing the scenario-scoped submetric forces k6 to include it in
        # --summary-export, which is how RUN-004's per-use-case counts surface.
        thresholds[f"checks{{scenario:{name}}}"] = ["rate>0.5"]
    return {"scenarios": scenarios, "thresholds": thresholds}
