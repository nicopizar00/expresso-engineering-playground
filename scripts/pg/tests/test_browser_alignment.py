from __future__ import annotations

import re
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
SCENARIOS = REPO_ROOT / "tests" / "performance" / "k6" / "scenarios"

# Outcome checks a browser scenario shares with its http pair, in step order.
# HTTP status checks ("catalog 200", "checkout 201", ...) stay http-only:
# k6 0.54's browser module cannot observe network responses.
SHARED = {
    ("http-cart", "browser-cart"): [
        "catalog has items",
        "cart contains added item",
    ],
    ("http-purchase", "browser-purchase"): [
        "catalog has items",
        "cart contains added item",
        "checkout returns orderId",
        "visualizer ok after order",
    ],
}
CHECK_NAME = re.compile(r'^\s*"([^"]+)":\s*\(', re.MULTILINE)
CARTS_ROW = re.compile(r"\[DATA carts\] ([^`]*)`")


def source(name: str) -> str:
    return (SCENARIOS / name / f"{name}.ts").read_text(encoding="utf-8")


def check_names(name: str) -> list[str]:
    return CHECK_NAME.findall(source(name))


class BrowserAlignmentTests(unittest.TestCase):
    def test_browser_checks_are_exactly_the_shared_outcomes_in_order(self) -> None:
        for (_http, browser), shared in SHARED.items():
            with self.subTest(browser=browser):
                self.assertEqual(check_names(browser), shared)

    def test_http_scenarios_carry_every_shared_outcome_in_the_same_order(self) -> None:
        for (http, _browser), shared in SHARED.items():
            with self.subTest(http=http):
                names = check_names(http)
                self.assertEqual([n for n in names if n in shared], shared)

    def test_cart_rows_have_no_empty_field(self) -> None:
        """http-orders posts every carts row; an empty productId (browser-cart's
        old `${cartId},,${sid}`) breaks the pair."""
        for name in ("http-cart", "browser-cart"):
            with self.subTest(name=name):
                [template] = CARTS_ROW.findall(source(name))
                fields = template.split(",")
                self.assertEqual(len(fields), 3, template)
                self.assertTrue(all(f.strip() for f in fields), template)

    def test_browser_cart_fails_its_check_when_it_cannot_emit_a_row(self) -> None:
        """A stale web image without data-product-id must fail a check, not
        silently drop the carts row at 100% checks."""
        src = source("browser-cart")
        predicate = src[src.index('"cart contains added item"'):src.index("});", src.index('"cart contains added item"'))]
        self.assertIn("productId", predicate)

    def test_browser_catalog_check_can_fail(self) -> None:
        """A bare waitForSelector throws before "catalog has items" runs, so
        the check could only ever pass; the wait must be caught."""
        for name in ("browser-cart", "browser-purchase"):
            with self.subTest(name=name):
                src = source(name)
                step = src[src.index("// step: catalog: browse"):src.index("// step: cart: add item")]
                self.assertNotRegex(
                    step, r'await page\.waitForSelector\(\s*\'\[data-testid="product-add-button"\]\'[^;]*\);'
                )
                self.assertIn('"catalog has items"', step)

    def test_browser_visualizer_check_requires_connected(self) -> None:
        """"Loading" is not "ok after order"; only the Connected badge is."""
        src = source("browser-purchase")
        check = src[src.index('"visualizer ok after order"'):]
        check = check[:check.index("});")]
        self.assertIn('"Connected"', check)
        self.assertNotIn('!== "Error"', check)

    def test_docs_describe_the_full_browser_carts_row(self) -> None:
        for doc in ("docs/performance/orchestrator.md", "tests/performance/k6/README.md"):
            with self.subTest(doc=doc):
                text = (REPO_ROOT / doc).read_text(encoding="utf-8")
                self.assertNotIn("<cartId>,,<sid>", text)
                self.assertNotIn("leaves `productId` blank", text)
                self.assertNotIn("productId is left blank", text)

    def test_browser_steps_follow_the_http_group_order(self) -> None:
        for (http, browser) in SHARED:
            with self.subTest(browser=browser):
                groups = re.findall(r'group\("([^"]+)"', source(http))
                steps = re.findall(r"// step: (.+)$", source(browser), re.MULTILINE)
                self.assertTrue(steps)
                self.assertEqual([g for g in groups if g in steps], steps)


if __name__ == "__main__":
    unittest.main()
