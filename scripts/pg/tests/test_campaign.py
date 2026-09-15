from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from pg.campaign import (  # noqa: E402
    DEFAULT_DESCRIPTOR,
    build_k6_options,
    preflight,
    resolve_use_case,
    run,
)

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

    def test_rejects_missing_required_field(self) -> None:
        descriptor = {
            "runId": "test-run",
            "useCases": [{"id": "commerce.catalog-browse", "version": 1}],
            "durationSeconds": 10,
        }
        errors = preflight(descriptor, CATALOG)
        self.assertEqual(len(errors), 1)
        self.assertIn("weight", errors[0])

    def test_rejects_duplicate_use_case_selection(self) -> None:
        descriptor = {
            "runId": "test-run",
            "useCases": [
                {"id": "commerce.catalog-browse", "version": 1, "weight": 2},
                {"id": "commerce.catalog-browse", "version": 1, "weight": 3},
            ],
            "durationSeconds": 10,
        }
        errors = preflight(descriptor, CATALOG)
        self.assertEqual(len(errors), 1)
        self.assertIn("commerce.catalog-browse", errors[0])

    def test_rejects_use_case_with_no_wired_adapter(self) -> None:
        catalog = {
            "useCases": CATALOG["useCases"] + [{
                "id": "commerce.unmapped",
                "version": 1,
                "status": "active",
                "adapter": "k6.unmapped",
                "concurrency": {"safe": True},
            }],
        }
        descriptor = {
            "runId": "test-run",
            "useCases": [{"id": "commerce.unmapped", "version": 1, "weight": 1}],
            "durationSeconds": 10,
        }
        errors = preflight(descriptor, catalog)
        self.assertEqual(len(errors), 1)
        self.assertIn("commerce.unmapped", errors[0])


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
        self.assertIn(
            "workflow_iteration_success{scenario:commerce_purchase}",
            options["thresholds"],
        )
        self.assertIn("iterations{scenario:commerce_purchase}", options["thresholds"])


class CampaignRunTests(unittest.TestCase):
    @patch("pg.campaign.run_k6", return_value=0)
    def test_run_selects_campaign_workflow_and_forwards_generated_values(self, run_k6_mock) -> None:
        rc = run([str(DEFAULT_DESCRIPTOR)])
        self.assertEqual(rc, 0)
        args, kwargs = run_k6_mock.call_args
        self.assertEqual(args[0], "campaign")
        self.assertIn("CAMPAIGN_JSON", kwargs["extra_env"])


if __name__ == "__main__":
    unittest.main()
