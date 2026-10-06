from __future__ import annotations

import re
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[3]
CHECKOUT_DTO = REPO_ROOT / "apps" / "bff" / "src" / "modules" / "checkout" / "checkout.dto.ts"
SCENARIOS_DIR = REPO_ROOT / "tests" / "performance" / "k6" / "scenarios"


# cartId is a required cart-reservation identifier, not a human identity
# field — CUP-002 only forbids the latter (customerName and friends) from perf
# checkout calls. orderFor (nested type/recipient) carries a username or email
# identifier, never a human name — allowed since the login amendment;
# purchase-registered uses it to place orders for seeded demo users.
FIELD_PATTERN = re.compile(r"(\w+)\s*:")
ORDER_FOR_PATTERN = re.compile(r"orderFor\s*:\s*\{([^{}]*)\}")
TOP_LEVEL_FIELDS = {"cartId", "idempotencyKey", "orderFor"}
ORDER_FOR_FIELDS = {"type", "recipient"}


def disallowed_fields(payload: str) -> set[str]:
    """Checkout fields outside the CUP-002 allowlist. type/recipient are only
    allowed inside orderFor; shorthand properties ({ cartId }) count too."""
    bad: set[str] = set()
    for inner in ORDER_FOR_PATTERN.findall(payload):
        bad |= set(FIELD_PATTERN.findall(inner)) - ORDER_FOR_FIELDS
    top = ORDER_FOR_PATTERN.sub("orderFor: null", payload).strip()
    if top.startswith("{") and top.endswith("}"):
        top = top[1:-1]
    for part in top.split(","):
        key = part.split(":", 1)[0].strip()
        if key and key not in TOP_LEVEL_FIELDS:
            bad.add(key)
    return bad


class K6CheckoutContractTests(unittest.TestCase):
    def test_disallowed_fields_scopes_type_and_recipient_to_order_for(self) -> None:
        ok = '{ cartId, orderFor: { type: "user", recipient: username } }'
        self.assertEqual(disallowed_fields(ok), set())
        self.assertEqual(disallowed_fields("{ cartId: cartId, idempotencyKey: k }"), set())
        self.assertEqual(
            disallowed_fields('{ cartId: c, recipient: "Ana Perez" }'), {"recipient"}
        )
        self.assertEqual(disallowed_fields('{ cartId: c, type: "user" }'), {"type"})
        self.assertEqual(
            disallowed_fields('{ cartId: c, orderFor: { type: "user", name: "Ana" } }'),
            {"name"},
        )
        self.assertEqual(disallowed_fields("{ cartId, customerName }"), {"customerName"})

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
                for payload in payloads:
                    bad = disallowed_fields(payload)
                    self.assertEqual(
                        bad, set(), f"unexpected checkout field(s) {bad} in {payload!r}"
                    )


if __name__ == "__main__":
    unittest.main()
