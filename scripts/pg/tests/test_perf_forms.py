from __future__ import annotations

import sys
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from pg import cli  # noqa: E402
from pg.paths import PERF_JOBS_DIR  # noqa: E402
from pg.perf_workflow import parse_steps, plan_workflow, shapes  # noqa: E402
from pg.perf_forms import (  # noqa: E402
    CUSTOM_PREFIX,
    FormsError,
    custom_profiles,
    option_blocks,
    paths,
    profile_load,
    profiles,
    workflow_label,
    workflows,
    render,
    standalone,
)
from pg.perf_spec import CUSTOM, PRESET, PRESET_LABELS  # noqa: E402
from punch.catalog import load_catalog  # noqa: E402

CATALOG = load_catalog(PERF_JOBS_DIR)
STANDALONE = [
    "browser-cart",
    "browser-purchase",
    "http-auth-login",
    "http-cart",
    "http-purchase",
    "http-purchase-registered",
]
WORKFLOWS = [
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
PRESET_PROFILES = ["1 journey", "5 journeys", "1 user for 5 minutes", "5 users for 5 minutes"]


def fake_catalog(spec: dict) -> SimpleNamespace:
    """name -> (produces {dataset: [targets]}, requires, optional)."""
    jobs = {}
    for name, (produces, requires, optional) in spec.items():
        jobs[name] = SimpleNamespace(data=SimpleNamespace(
            produces=[SimpleNamespace(dataset=d, targets=tuple(t)) for d, t in produces.items()],
            requires=tuple(requires),
            optional=tuple(optional),
        ))
    return SimpleNamespace(jobs=jobs)


class DerivationTests(unittest.TestCase):
    def test_the_current_catalog_offers_six_standalone_jobs(self) -> None:
        self.assertEqual(standalone(CATALOG), STANDALONE)

    def test_the_current_catalog_offers_nine_workflows_that_all_plan(self) -> None:
        kept, dropped = workflows(CATALOG)
        self.assertEqual(kept, WORKFLOWS)
        self.assertEqual(dropped, [])
        for workflow in kept:
            with self.subTest(workflow=workflow):
                self.assertEqual(plan_workflow(parse_steps(workflow), CATALOG).errors, [])

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

    def test_workflow_labels_use_an_ascii_arrow(self) -> None:
        self.assertEqual(workflow_label(("http-cart", "http-orders")), "http-cart -> http-orders")


class ProfileTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary_directory = TemporaryDirectory()
        self.options = Path(self.temporary_directory.name)

    def tearDown(self) -> None:
        self.temporary_directory.cleanup()

    def write(self, relative: str) -> None:
        path = self.options / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text("{}", encoding="utf-8")

    def test_the_committed_options_offer_four_presets_then_the_custom_config(self) -> None:
        self.assertEqual(profiles(), [*PRESET_PROFILES, "Custom: custom/status-regression.json"])

    def test_preset_labels_cover_every_preset_and_never_look_custom(self) -> None:
        labels = [label for label, _ in PRESET_LABELS]
        self.assertEqual(labels, PRESET_PROFILES)
        self.assertEqual(sorted(stem for _, stem in PRESET_LABELS), sorted(shapes()[1:]))
        self.assertEqual([label for label in labels if label.startswith(CUSTOM_PREFIX)], [])

    def test_custom_profiles_are_every_json_file_beneath_custom_sorted_by_path(self) -> None:
        for relative in (
            "custom/zeta.json", "custom/nested/alpha.json", "custom/beta.json",
            "custom/notes.txt", "1-iteration.json",
        ):
            self.write(relative)
        (self.options / "custom" / "folder.json").mkdir()
        self.assertEqual(
            custom_profiles(self.options),
            [
                "Custom: custom/beta.json",
                "Custom: custom/nested/alpha.json",
                "Custom: custom/zeta.json",
            ],
        )
        self.assertEqual(
            profiles(self.options), [*PRESET_PROFILES, *custom_profiles(self.options)]
        )

    def test_without_a_custom_directory_only_the_presets_are_offered(self) -> None:
        self.write("1-iteration.json")
        self.assertEqual(custom_profiles(self.options), [])
        self.assertEqual(profiles(self.options), PRESET_PROFILES)

    def test_a_profile_label_maps_to_a_preset_or_a_custom_path(self) -> None:
        self.write("custom/x.json")
        self.assertEqual(profile_load("1 journey", self.options), (PRESET, "1-iteration"))
        self.assertEqual(profile_load("5 users for 5 minutes", self.options), (PRESET, "5-vu-5m"))
        self.assertEqual(
            profile_load("Custom: custom/x.json", self.options), (CUSTOM, "custom/x.json")
        )

    def test_anything_the_profile_list_does_not_offer_maps_to_nothing(self) -> None:
        self.write("custom/x.json")
        self.write("1-iteration.json")
        for label in (
            "Custom: 1-iteration.json",
            "Custom: custom/missing.json",
            "Custom: custom/../custom/x.json",
            "Custom:custom/x.json",
            "custom/x.json",
            "1-iteration",
            "1 Journey",
            "Auto (data-size producer; default otherwise)",
            "Custom config",
            "",
        ):
            with self.subTest(label=label):
                self.assertIsNone(profile_load(label, self.options))


class RenderTests(unittest.TestCase):
    TEXT = (
        "on:\n"
        "  workflow_dispatch:\n"
        "    inputs:\n"
        "      job:\n"
        "        options:\n"
        "          # BEGIN perf:forms jobs\n"
        "          - stale\n"
        "          # END perf:forms jobs\n"
        "      profile:\n"
        "        options:\n"
        "          # BEGIN perf:forms profiles\n"
        "          # END perf:forms profiles\n"
    )

    def test_only_the_marked_blocks_change(self) -> None:
        blocks = {"jobs": ["a", "b c"], "profiles": ["1 journey"]}
        rendered = render(self.TEXT, blocks)
        self.assertEqual(
            rendered,
            self.TEXT.replace("          - stale\n", '          - "a"\n          - "b c"\n').replace(
                "          # BEGIN perf:forms profiles\n",
                '          # BEGIN perf:forms profiles\n          - "1 journey"\n',
            ),
        )
        self.assertEqual(render(rendered, blocks), rendered)

    def test_an_unknown_block_or_a_file_without_blocks_is_an_error(self) -> None:
        with self.assertRaisesRegex(FormsError, "unknown generated block 'profiles'"):
            render(self.TEXT, {"jobs": []})
        with self.assertRaisesRegex(FormsError, "no '# BEGIN perf:forms <id>' block"):
            render("on: push\n", {"jobs": []})

    def test_option_blocks_name_the_three_lists(self) -> None:
        blocks, dropped = option_blocks(CATALOG)
        self.assertEqual(dropped, [])
        self.assertEqual(
            blocks,
            {
                "jobs": STANDALONE,
                "workflows": [workflow_label(r) for r in WORKFLOWS],
                "profiles": profiles(),
            },
        )

    def test_the_command_is_registered(self) -> None:
        self.assertIn("perf:forms", cli.COMMANDS)


if __name__ == "__main__":
    unittest.main()
