from __future__ import annotations

import json
import re
import sys
import unittest
from pathlib import Path

import yaml

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from pg.paths import PERF_WORKFLOWS_DIR, REPO_ROOT  # noqa: E402
from punch.workflow import load_workflow  # noqa: E402


class K6WorkflowCoverageTests(unittest.TestCase):
    def test_workflows_cover_every_typescript_build_entry_once(self) -> None:
        package = json.loads(
            (REPO_ROOT / "tests" / "performance" / "k6" / "package.json").read_text(
                encoding="utf-8"
            )
        )
        build_entries = [
            token for token in package["scripts"]["build"].split() if token.endswith(".ts")
        ]
        expected_scripts = {
            "/scripts/scenarios/" + str(Path(entry).relative_to("scenarios").with_suffix(".js"))
            for entry in build_entries
        }
        workflow_paths = sorted(PERF_WORKFLOWS_DIR.glob("*.yaml"))
        workflows = [load_workflow(path) for path in workflow_paths]

        expected_names = {
            "browser-cart",
            "browser-purchase",
            "http-auth-login",
            "http-cart",
            "http-me-hot-status",
            "http-orders",
            "http-orders-status",
            "http-purchase",
            "http-purchase-registered",
        }
        expected_compose_service = {
            name: ("k6-browser" if name.startswith("browser-") else "k6")
            for name in expected_names
        }
        expected_environment_forward = {
            "browser-cart": ["BASE_URL", "VUS", "ITERATIONS"],
            "browser-purchase": ["BASE_URL", "VUS", "ITERATIONS"],
            "http-auth-login": ["BASE_URL", "VUS", "ITERATIONS", "DEMO_PASSWORD"],
            "http-cart": ["BASE_URL", "VUS", "DURATION", "ITERATIONS"],
            "http-me-hot-status": ["BASE_URL", "VUS", "DURATION", "ITERATIONS"],
            "http-orders": ["BASE_URL", "VUS", "ITERATIONS"],
            "http-orders-status": [
                "BASE_URL",
                "VUS",
                "ITERATIONS",
                "EXPECT_TEMPERATURE",
                "ORDER_COOL_DOWN_SECONDS",
            ],
            "http-purchase": ["BASE_URL", "VUS", "DURATION", "ITERATIONS"],
            "http-purchase-registered": ["BASE_URL", "VUS", "DURATION", "ITERATIONS", "USERS"],
        }
        expected_data = {
            "http-cart": {"produces": {"carts": ("http-orders",)}, "requires": ()},
            "browser-cart": {"produces": {"carts": ("http-orders",)}, "requires": ()},
            "http-orders": {"produces": {"orders": ("http-orders-status",)}, "requires": ("carts",)},
            "http-purchase": {"produces": {"orders": ("http-orders-status",)}, "requires": ()},
            "browser-purchase": {"produces": {"orders": ("http-orders-status",)}, "requires": ()},
            "http-orders-status": {"produces": {}, "requires": ("orders",)},
            "http-purchase-registered": {
                "produces": {"owned-orders": ("http-auth-login",)},
                "requires": (),
            },
            "http-auth-login": {
                "produces": {"auth-tokens": ("http-me-hot-status",)},
                "requires": (),
                "optional": ("owned-orders",),
            },
            "http-me-hot-status": {"produces": {}, "requires": ("auth-tokens",)},
        }
        expected_description = {
            "http-cart": "Reserve carts, no checkout",
            "browser-cart": "Reserve carts in Chromium",
            "http-orders": "Create orders from carts",
            "http-orders-status": "Read order status",
            "http-auth-login": "Log in, capture tokens",
            "http-me-hot-status": "Poll hot-status banner",
            "http-purchase": "Full purchase journey",
            "browser-purchase": "Full purchase in Chromium",
            "http-purchase-registered": "Purchase as demo users",
        }
        self.assertEqual(len(workflow_paths), len(expected_names))
        self.assertEqual({path.stem for path in workflow_paths}, expected_names)
        self.assertEqual({workflow.k6_script for workflow in workflows}, expected_scripts)
        self.assertEqual(len({workflow.name for workflow in workflows}), len(workflows))
        for path, workflow in zip(workflow_paths, workflows):
            with self.subTest(workflow=path.stem):
                document = yaml.safe_load(path.read_text(encoding="utf-8"))
                self.assertEqual(workflow.name, path.stem)
                self.assertEqual(
                    workflow.k6_script, f"/scripts/scenarios/{path.stem}/{path.stem}.js"
                )
                self.assertEqual(workflow.description, expected_description[path.stem])
                self.assertTrue(3 <= len(workflow.description.split()) <= 5)
                scenario_source = (
                    REPO_ROOT / "tests/performance/k6/scenarios" / path.stem / f"{path.stem}.ts"
                ).read_text(encoding="utf-8")
                # The scenario's own handleSummary must write the report the
                # YAML points Punch at, or Punch prints no metrics.
                self.assertIn(f'"/scripts/reports/{path.stem}-summary.json"', scenario_source)
                self.assertIn(f'"/scripts/reports/{path.stem}-report.html"', scenario_source)
                self.assertIn(f'suite: "mini-commerce-{path.stem}"', scenario_source)
                self.assertEqual(
                    document["spec"]["compose"],
                    {
                        "file": "infra/docker/compose.performance.yaml",
                        "service": expected_compose_service[path.stem],
                    },
                )
                self.assertEqual(workflow.working_directory, REPO_ROOT)
                self.assertEqual(
                    workflow.compose_file,
                    REPO_ROOT / "infra" / "docker" / "compose.performance.yaml",
                )
                self.assertEqual(workflow.compose_service, expected_compose_service[path.stem])
                if path.stem in expected_data:
                    expected = expected_data[path.stem]
                    self.assertEqual(workflow.data.directory, REPO_ROOT / "tests/performance/k6/data")
                    self.assertEqual(workflow.data.mounted_at, "/scripts/data")
                    self.assertEqual(
                        {product.dataset: product.targets for product in workflow.data.produces},
                        expected["produces"],
                    )
                    self.assertEqual(workflow.data.requires, expected["requires"])
                    self.assertEqual(workflow.data.optional, expected.get("optional", ()))
                else:
                    self.assertIsNone(workflow.data)
                self.assertEqual(
                    document["spec"]["outputs"]["summary"]["path"],
                    f"tests/performance/k6/reports/{path.stem}-summary.json",
                )
                self.assertEqual(
                    workflow.summary_output.path,
                    REPO_ROOT / "tests" / "performance" / "k6" / "reports" / f"{path.stem}-summary.json",
                )
                self.assertEqual(
                    document["spec"]["environment"],
                    {"forward": expected_environment_forward[path.stem]},
                )

        scenarios_dir = REPO_ROOT / "tests/performance/k6/scenarios"
        self.assertEqual(
            {p.name for p in scenarios_dir.iterdir() if p.is_dir()}, expected_names
        )


class ComposeScriptPathTests(unittest.TestCase):
    def test_every_compose_scenario_path_is_a_workflow_script(self) -> None:
        compose = (REPO_ROOT / "infra/docker/compose.performance.yaml").read_text(encoding="utf-8")
        scripts = {load_workflow(p).k6_script for p in PERF_WORKFLOWS_DIR.glob("*.yaml")}
        referenced = set(re.findall(r"/scripts/scenarios/[\w-]+/[\w-]+\.js", compose))
        self.assertTrue(referenced)
        self.assertLessEqual(referenced, scripts)


class K6WorkflowCatalogTests(unittest.TestCase):
    def test_workflow_catalog_links_are_valid(self) -> None:
        from punch.catalog import load_catalog

        catalog = load_catalog(PERF_WORKFLOWS_DIR)
        self.assertEqual(catalog.producers_of("carts"), ("browser-cart", "http-cart"))
        self.assertEqual(catalog.consumers_of("carts"), ("http-orders",))
        self.assertEqual(
            catalog.producers_of("orders"),
            ("browser-purchase", "http-orders", "http-purchase"),
        )
        self.assertEqual(catalog.consumers_of("orders"), ("http-orders-status",))
        self.assertEqual(catalog.producers_of("owned-orders"), ("http-purchase-registered",))
        self.assertEqual(catalog.consumers_of("owned-orders"), ("http-auth-login",))
        self.assertEqual(catalog.producers_of("auth-tokens"), ("http-auth-login",))
        self.assertEqual(catalog.consumers_of("auth-tokens"), ("http-me-hot-status",))
