from __future__ import annotations

import re
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[3]
CHECKOUT_DTO = REPO_ROOT / "apps" / "bff" / "src" / "modules" / "checkout" / "checkout.dto.ts"
SCENARIOS_DIR = REPO_ROOT / "tests" / "performance" / "k6" / "scenarios"


class K6CheckoutContractTests(unittest.TestCase):
    def test_anonymous_checkout_scenarios_match_the_checkout_dto(self) -> None:
        dto = CHECKOUT_DTO.read_text(encoding="utf-8")
        self.assertIn("@IsOptional()", dto)
        self.assertIn("@IsUUID()", dto)
        self.assertRegex(dto, r"idempotencyKey\?: string;")
        self.assertNotIn("customerName", dto)

        checkout_request = re.compile(
            r'http\.post\(\s*url\(["\']/checkout["\']\),\s*JSON\.stringify\((\{[^)]*\})\)',
            re.DOTALL,
        )
        checkout_scenarios = []
        for scenario in SCENARIOS_DIR.rglob("*"):
            if scenario.suffix not in {".js", ".ts"}:
                continue
            payloads = checkout_request.findall(scenario.read_text(encoding="utf-8"))
            if payloads:
                checkout_scenarios.append((scenario, payloads))

        self.assertTrue(checkout_scenarios)
        for scenario, payloads in checkout_scenarios:
            with self.subTest(scenario=scenario.relative_to(REPO_ROOT)):
                self.assertEqual(payloads, ["{}"] * len(payloads))


if __name__ == "__main__":
    unittest.main()
