from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from pg import perf_menu  # noqa: E402


class DiscoverWorkflowsTests(unittest.TestCase):
    def test_discovers_and_sorts_all_workflow_yamls(self) -> None:
        names = perf_menu.discover_workflows()
        self.assertEqual(
            names,
            sorted(
                [
                    "campaign",
                    "catalog-browse",
                    "checkout-flow",
                    "order-lookup",
                    "purchase",
                    "read-heavy",
                    "smoke",
                ]
            ),
        )


class BuildCampaignArgvTests(unittest.TestCase):
    def test_default_descriptor_and_no_confirmation(self) -> None:
        argv = perf_menu.build_campaign_argv(descriptor_path=None, confirm_output_data=False)
        self.assertEqual(argv, [])

    def test_custom_descriptor_and_confirmation(self) -> None:
        argv = perf_menu.build_campaign_argv(
            descriptor_path="tests/performance/k6/campaigns/morning-rush.json",
            confirm_output_data=True,
        )
        self.assertEqual(
            argv,
            [
                "tests/performance/k6/campaigns/morning-rush.json",
                "--confirm-output-data",
            ],
        )


class RunSelectionTests(unittest.TestCase):
    @patch("pg.perf_menu.run_k6", return_value=0)
    def test_non_campaign_workflow_delegates_to_run_k6(self, run_k6_mock) -> None:
        rc = perf_menu.run_selection(
            "smoke", base_url="http://localhost:3001", confirm_output_data=True
        )
        self.assertEqual(rc, 0)
        run_k6_mock.assert_called_once_with("smoke", confirm_output_data_flag=True)

    @patch("pg.perf_menu.campaign.run", return_value=0)
    def test_campaign_workflow_delegates_to_campaign_run(self, campaign_run_mock) -> None:
        rc = perf_menu.run_selection(
            "campaign",
            base_url="http://localhost:3001",
            confirm_output_data=False,
            descriptor_path="custom.json",
        )
        self.assertEqual(rc, 0)
        campaign_run_mock.assert_called_once_with(["custom.json"])

    @patch("pg.perf_menu.run_k6", return_value=0)
    def test_base_url_is_exported_before_running(self, run_k6_mock) -> None:
        import os

        with patch.dict(os.environ, {}, clear=False):
            perf_menu.run_selection(
                "smoke", base_url="http://example.test:9999", confirm_output_data=False
            )
            self.assertEqual(os.environ["BASE_URL"], "http://example.test:9999")


if __name__ == "__main__":
    unittest.main()
