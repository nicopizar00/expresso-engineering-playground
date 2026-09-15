from __future__ import annotations

import re
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[3]
CHECKOUT_DTO = REPO_ROOT / "apps" / "bff" / "src" / "modules" / "checkout" / "checkout.dto.ts"
CHECKOUT_SCENARIOS = (
    REPO_ROOT / "tests" / "performance" / "k6" / "scenarios" / "smoke" / "smoke.ts",
    REPO_ROOT
    / "tests"
    / "performance"
    / "k6"
    / "scenarios"
    / "checkout-flow"
    / "checkout-flow.ts",
    REPO_ROOT / "tests" / "performance" / "k6" / "scenarios" / "campaign" / "purchase.ts",
)


class K6CheckoutContractTests(unittest.TestCase):
    def test_anonymous_checkout_scenarios_match_the_checkout_dto(self) -> None:
        dto = CHECKOUT_DTO.read_text(encoding="utf-8")
        self.assertIn("@IsOptional()", dto)
        self.assertIn("@IsUUID()", dto)
        self.assertRegex(dto, r"idempotencyKey\?: string;")
        self.assertNotIn("customerName", dto)

        checkout_payload = re.compile(
            r'http\.post\(\s*url\("/checkout"\),\s*JSON\.stringify\((\{[^)]*\})\)',
            re.DOTALL,
        )
        for scenario in CHECKOUT_SCENARIOS:
            with self.subTest(scenario=scenario.relative_to(REPO_ROOT)):
                payload = checkout_payload.search(scenario.read_text(encoding="utf-8"))
                self.assertIsNotNone(payload)
                self.assertEqual(payload.group(1), "{}")


if __name__ == "__main__":
    unittest.main()
