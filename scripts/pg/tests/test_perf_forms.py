from __future__ import annotations

import sys
import unittest
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from pg import cli  # noqa: E402
from pg.paths import PERF_WORKFLOWS_DIR  # noqa: E402
from pg.perf_chain import parse_steps, plan_chain, shapes  # noqa: E402
from pg.perf_forms import (  # noqa: E402
    LOAD_LABELS,
    FormsError,
    load_mode,
    option_blocks,
    paths,
    recipes,
    render,
    sequence_label,
    standalone,
)
from pg.perf_spec import AUTO, CUSTOM, PRESET  # noqa: E402
from punch.catalog import load_catalog  # noqa: E402

CATALOG = load_catalog(PERF_WORKFLOWS_DIR)
STANDALONE = [
    "browser-cart",
    "browser-purchase",
    "http-auth-login",
    "http-cart",
    "http-purchase",
    "http-purchase-registered",
]
RECIPES = [
    ("browser-cart", "http-orders"),
    ("browser-cart", "http-orders", "http-orders-status"),
    ("browser-purchase", "http-orders-status"),
    ("http-auth-login", "http-me-hot-status"),
    ("http-cart", "http-orders"),
    ("http-cart", "http-orders", "http-orders-status"),
    ("http-purchase", "http-orders-status"),
    ("http-purchase-registered", "http-auth-login"),
    ("http-purchase-registered", "http-auth-login", "http-me-hot-status"),
]


def fake_catalog(spec: dict) -> SimpleNamespace:
    """name -> (produces {dataset: [targets]}, requires, optional)."""
    workflows = {}
    for name, (produces, requires, optional) in spec.items():
        workflows[name] = SimpleNamespace(data=SimpleNamespace(
            produces=[SimpleNamespace(dataset=d, targets=tuple(t)) for d, t in produces.items()],
            requires=tuple(requires),
            optional=tuple(optional),
        ))
    return SimpleNamespace(workflows=workflows)


class DerivationTests(unittest.TestCase):
    def test_the_current_catalog_offers_six_standalone_workflows(self) -> None:
        self.assertEqual(standalone(CATALOG), STANDALONE)

    def test_the_current_catalog_offers_nine_recipes_that_all_plan(self) -> None:
        kept, dropped = recipes(CATALOG)
        self.assertEqual(kept, RECIPES)
        self.assertEqual(dropped, [])
        for recipe in kept:
            with self.subTest(recipe=recipe):
                self.assertEqual(plan_chain(parse_steps(recipe), CATALOG).errors, [])

    def test_paths_are_acyclic_unique_and_bounded(self) -> None:
        catalog = fake_catalog({
            "a": ({"x": ["b"], "x2": ["b"]}, [], []),
            "b": ({"y": ["c"]}, ["x", "x2"], ["z"]),
            "c": ({"z": ["b", "d"]}, ["y"], []),
            "d": ({"w": ["e"]}, ["z"], []),
            "e": ({}, ["w"], []),
        })
        self.assertEqual(standalone(catalog), ["a"])
        self.assertEqual(paths(catalog), [("a", "b"), ("a", "b", "c"), ("a", "b", "c", "d")])

    def test_a_link_needs_the_target_to_declare_the_dataset(self) -> None:
        catalog = fake_catalog({
            "a": ({"x": ["b", "c"]}, [], []),
            "b": ({}, ["x"], []),
            "c": ({}, [], []),
        })
        self.assertEqual(paths(catalog), [("a", "b")])

    def test_load_labels_cover_auto_custom_and_every_preset(self) -> None:
        values = [value for _, value in LOAD_LABELS]
        self.assertEqual(len(set(label for label, _ in LOAD_LABELS)), len(LOAD_LABELS))
        self.assertEqual(set(values) - {AUTO, CUSTOM}, set(shapes()[1:]))
        self.assertEqual(load_mode("1 journey"), (PRESET, "1-iteration"))
        self.assertEqual(load_mode("Auto (data-size producer; default otherwise)"), (AUTO, None))
        self.assertEqual(load_mode("Custom config"), (CUSTOM, None))
        self.assertIsNone(load_mode("5-vu-5m"))

    def test_sequence_labels_use_an_ascii_arrow(self) -> None:
        self.assertEqual(sequence_label(("http-cart", "http-orders")), "http-cart -> http-orders")


class RenderTests(unittest.TestCase):
    TEXT = (
        "on:\n"
        "  workflow_dispatch:\n"
        "    inputs:\n"
        "      workflow:\n"
        "        options:\n"
        "          # BEGIN perf:forms workflows\n"
        "          - stale\n"
        "          # END perf:forms workflows\n"
        "      load:\n"
        "        options:\n"
        "          # BEGIN perf:forms loads\n"
        "          # END perf:forms loads\n"
    )

    def test_only_the_marked_blocks_change(self) -> None:
        blocks = {"workflows": ["a", "b c"], "loads": ["1 journey"]}
        rendered = render(self.TEXT, blocks)
        self.assertEqual(
            rendered,
            self.TEXT.replace("          - stale\n", '          - "a"\n          - "b c"\n').replace(
                "          # BEGIN perf:forms loads\n",
                '          # BEGIN perf:forms loads\n          - "1 journey"\n',
            ),
        )
        self.assertEqual(render(rendered, blocks), rendered)

    def test_an_unknown_block_or_a_file_without_blocks_is_an_error(self) -> None:
        with self.assertRaisesRegex(FormsError, "unknown generated block 'loads'"):
            render(self.TEXT, {"workflows": []})
        with self.assertRaisesRegex(FormsError, "no '# BEGIN perf:forms <id>' block"):
            render("on: push\n", {"workflows": []})

    def test_option_blocks_name_the_three_lists(self) -> None:
        blocks, dropped = option_blocks(CATALOG)
        self.assertEqual(dropped, [])
        self.assertEqual(blocks["workflows"], STANDALONE)
        self.assertEqual(blocks["sequences"], [sequence_label(r) for r in RECIPES])
        self.assertEqual(blocks["loads"], [label for label, _ in LOAD_LABELS])

    def test_the_command_is_registered(self) -> None:
        self.assertIn("perf:forms", cli.COMMANDS)


if __name__ == "__main__":
    unittest.main()
