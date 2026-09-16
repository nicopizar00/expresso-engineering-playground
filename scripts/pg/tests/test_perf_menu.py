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
        self.assertEqual(names, sorted(["purchase-flow", "smoke"]))


class RunSelectionTests(unittest.TestCase):
    @patch("pg.perf_menu.run_k6", return_value=0)
    def test_workflow_delegates_to_run_k6(self, run_k6_mock) -> None:
        rc = perf_menu.run_selection(
            "smoke", base_url="http://localhost:3001", confirm_output_data=True
        )
        self.assertEqual(rc, 0)
        run_k6_mock.assert_called_once_with("smoke", confirm_output_data_flag=True)

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
