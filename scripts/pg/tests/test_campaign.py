from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from pg.campaign import build_k6_options, preflight, resolve_use_case  # noqa: E402

CATALOG = {
    "catalogVersion": 1,
    "useCases": [
        {
            "id": "commerce.catalog-browse",
            "version": 1,
            "status": "active",
            "adapter": "k6.catalog-browse",
            "concurrency": {"safe": True},
        },
        {
            "id": "commerce.purchase",
            "version": 1,
            "status": "active",
            "adapter": "k6.purchase",
            "concurrency": {"safe": False, "maxVirtualUsers": 1},
        },
        {
            "id": "commerce.cart-edit",
            "version": 1,
            "status": "deprecated",
            "adapter": "k6.cart-edit",
            "concurrency": {"safe": False, "maxVirtualUsers": 1},
        },
    ],
}


class ResolveUseCaseTests(unittest.TestCase):
    def test_finds_matching_id_and_version(self) -> None:
        entry = resolve_use_case(CATALOG, "commerce.purchase", 1)
        self.assertIsNotNone(entry)
        self.assertEqual(entry["adapter"], "k6.purchase")

    def test_returns_none_for_unknown_id(self) -> None:
        self.assertIsNone(resolve_use_case(CATALOG, "commerce.nonexistent", 1))


class PreflightTests(unittest.TestCase):
    def test_accepts_valid_descriptor(self) -> None:
        descriptor = {
            "runId": "test-run",
            "useCases": [{"id": "commerce.catalog-browse", "version": 1, "weight": 3}],
            "durationSeconds": 10,
        }
        self.assertEqual(preflight(descriptor, CATALOG), [])

    def test_rejects_unknown_use_case(self) -> None:
        descriptor = {
            "runId": "test-run",
            "useCases": [{"id": "commerce.nonexistent", "version": 1, "weight": 1}],
            "durationSeconds": 10,
        }
        errors = preflight(descriptor, CATALOG)
        self.assertEqual(len(errors), 1)
        self.assertIn("commerce.nonexistent", errors[0])

    def test_rejects_deprecated_use_case(self) -> None:
        descriptor = {
            "runId": "test-run",
            "useCases": [{"id": "commerce.cart-edit", "version": 1, "weight": 1}],
            "durationSeconds": 10,
        }
        errors = preflight(descriptor, CATALOG)
        self.assertEqual(len(errors), 1)
        self.assertIn("deprecated", errors[0])

    def test_rejects_concurrency_violation(self) -> None:
        descriptor = {
            "runId": "test-run",
            "useCases": [{"id": "commerce.purchase", "version": 1, "weight": 2}],
            "durationSeconds": 10,
        }
        errors = preflight(descriptor, CATALOG)
        self.assertEqual(len(errors), 1)
        self.assertIn("maxVirtualUsers=1", errors[0])

    def test_accepts_purchase_at_its_limit(self) -> None:
        descriptor = {
            "runId": "test-run",
            "useCases": [{"id": "commerce.purchase", "version": 1, "weight": 1}],
            "durationSeconds": 10,
        }
        self.assertEqual(preflight(descriptor, CATALOG), [])


class BuildK6OptionsTests(unittest.TestCase):
    def test_generates_one_scenario_per_use_case_with_thresholds(self) -> None:
        descriptor = {
            "runId": "test-run",
            "useCases": [
                {"id": "commerce.catalog-browse", "version": 1, "weight": 3},
                {"id": "commerce.purchase", "version": 1, "weight": 1},
            ],
            "durationSeconds": 30,
        }
        options = build_k6_options(descriptor, CATALOG)
        self.assertEqual(
            set(options["scenarios"].keys()),
            {"commerce_catalog_browse", "commerce_purchase"},
        )
        browse = options["scenarios"]["commerce_catalog_browse"]
        self.assertEqual(browse["executor"], "constant-vus")
        self.assertEqual(browse["vus"], 3)
        self.assertEqual(browse["duration"], "30s")
        self.assertEqual(browse["exec"], "catalogBrowse")
        self.assertIn("checks{scenario:commerce_purchase}", options["thresholds"])


if __name__ == "__main__":
    unittest.main()
