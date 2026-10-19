"""Each Kubernetes thin template mirrors its Punch job YAML.

infra/k8s/perf/punch/jobs/<id>.yaml runs Punch's generic punch-k6-run
template with the facts of tests/performance/k6/jobs/<id>.yaml. The
cluster never reads the Punch YAML, so this test is what keeps them equal.
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

import yaml

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from pg.paths import K8S_DIR, PERF_JOBS_DIR, PERF_OPTIONS_DIR  # noqa: E402
from punch.catalog import load_catalog  # noqa: E402
from punch.job import load_job  # noqa: E402

PUNCH_DIR = K8S_DIR / "perf" / "punch"
THIN_DIR = PUNCH_DIR / "jobs"
BASE_URLS = {
    "k6": "http://bff.mini-commerce.svc.cluster.local:3001",
    "k6-browser": "http://web.mini-commerce.svc.cluster.local:3000",
}
PASSED_THROUGH = {
    "config": "{{workflow.parameters.config}}",
    "base-url": "{{workflow.parameters.base-url}}",
    "extra-env": "{{workflow.parameters.extra-env}}",
    "produce": "{{workflow.parameters.produce}}",
}


def _load(path: Path) -> dict:
    return yaml.safe_load(path.read_text(encoding="utf-8"))


def _named(items: list) -> dict:
    return {item["name"]: item.get("value") for item in items}


class ThinTemplateParityTests(unittest.TestCase):
    def test_one_thin_template_per_punch_job(self) -> None:
        punch = {path.stem for path in PERF_JOBS_DIR.glob("*.yaml")}
        thin = {path.stem for path in THIN_DIR.glob("*.yaml")}
        self.assertEqual(thin, punch)

    def test_kustomization_lists_every_thin_template(self) -> None:
        resources = _load(PUNCH_DIR / "kustomization.yaml")["resources"]
        listed = {r for r in resources if r.startswith("jobs/")}
        self.assertEqual(listed, {f"jobs/{p.name}" for p in THIN_DIR.glob("*.yaml")})

    def test_options_configmap_carries_every_preset(self) -> None:
        generators = _load(PUNCH_DIR / "kustomization.yaml")["configMapGenerator"]
        options = next(g for g in generators if g["name"] == "punch-k6-options")
        self.assertEqual(
            {Path(f).name for f in options["files"]},
            {p.name for p in PERF_OPTIONS_DIR.glob("*.json")},
        )

    def test_thin_templates_match_their_punch_job(self) -> None:
        catalog = load_catalog(PERF_JOBS_DIR)
        for path in sorted(PERF_JOBS_DIR.glob("*.yaml")):
            job = load_job(path)
            with self.subTest(job=job.name):
                thin = _load(THIN_DIR / path.name)
                self.assertEqual(thin["kind"], "WorkflowTemplate")
                self.assertEqual(thin["metadata"]["name"], job.name)
                spec = thin["spec"]
                main = next(t for t in spec["templates"] if t["name"] == spec["entrypoint"])
                [[step]] = main["steps"]
                self.assertEqual(
                    step["templateRef"],
                    {"name": "punch-k6-run", "template": job.compose_service},
                )
                requires = job.data.requires if job.data else ()
                produces = job.data.produces if job.data else ()
                self.assertEqual(
                    _named(spec["arguments"]["parameters"]),
                    {
                        "config": job.k6_config.stem,
                        "produce": "",
                        "base-url": BASE_URLS[job.compose_service],
                        "extra-env": "",
                    },
                )
                self.assertEqual(
                    _named(step["arguments"]["parameters"]),
                    {
                        "job": job.name,
                        "script": job.k6_script,
                        "forward": " ".join(
                            name for name in job.forward_environment if name != "BASE_URL"
                        ),
                        "requires": " ".join(requires),
                        "requires-hint": " ".join(
                            f"{dataset}={','.join(catalog.producers_of(dataset))}"
                            for dataset in requires
                        ),
                        "produces": " ".join(
                            f"{product.dataset}={','.join(product.columns)}"
                            for product in produces
                        ),
                        **PASSED_THROUGH,
                    },
                )


if __name__ == "__main__":
    unittest.main()
