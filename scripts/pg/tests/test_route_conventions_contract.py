from __future__ import annotations

import re
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[3]
SMOKE = REPO_ROOT / "scripts" / "pg" / "smoke.py"


class SmokeDocsContractTests(unittest.TestCase):
    def test_smoke_sample_output_matches_the_real_check_count(self) -> None:
        """Docs that show a smoke run must state the count smoke.py actually prints."""
        total = SMOKE.read_text(encoding="utf-8").count("results.append(_check(")
        for doc in ("README.md", "docs/local-development.md"):
            text = (REPO_ROOT / doc).read_text(encoding="utf-8")
            counts = re.findall(r"All (\d+) smoke checks passed\.", text)
            self.assertTrue(counts, doc)
            self.assertEqual({str(total)}, set(counts), doc)


if __name__ == "__main__":
    unittest.main()
