from __future__ import annotations

import os
import sys
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from pg.perf_spec import (  # noqa: E402
    AUTO,
    CUSTOM,
    PRESET,
    SpecError,
    StepRequest,
    custom_config_path,
    load_spec,
    parse_spec,
    preset_name,
    spec_document,
    write_spec,
)


class CustomConfigPathTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary_directory = TemporaryDirectory()
        self.root = Path(self.temporary_directory.name)
        self.options = self.root / "options"
        (self.options / "custom").mkdir(parents=True)
        (self.options / "custom" / "ok.json").write_text("{}", encoding="utf-8")
        (self.options / "custom" / "notes.txt").write_text("x", encoding="utf-8")
        (self.root / "outside.json").write_text("{}", encoding="utf-8")

    def tearDown(self) -> None:
        self.temporary_directory.cleanup()

    def reject(self, raw: str, message: str) -> None:
        with self.assertRaises(SpecError) as caught:
            custom_config_path(raw, self.options)
        self.assertIn(message, str(caught.exception))

    def test_a_committed_json_beneath_the_options_directory_resolves(self) -> None:
        self.assertEqual(
            custom_config_path("custom/ok.json", self.options),
            (self.options / "custom" / "ok.json").resolve(),
        )

    def test_unsafe_or_missing_paths_are_rejected(self) -> None:
        self.reject("", "needs a JSON path relative to tests/performance/k6/options/")
        self.reject("/etc/passwd.json", "must be a path relative to")
        self.reject("custom\\ok.json", "must be a path relative to")
        self.reject("../outside.json", "must not contain '..'")
        self.reject("custom/../custom/ok.json", "must not contain '..'")
        self.reject("custom/notes.txt", "must be a .json file")
        self.reject("custom/missing.json", "does not exist beneath")

    def test_a_symlink_that_escapes_the_options_directory_is_rejected(self) -> None:
        os.symlink(self.root / "outside.json", self.options / "custom" / "link.json")
        self.reject("custom/link.json", "resolves outside tests/performance/k6/options/")


class PresetNameTests(unittest.TestCase):
    def test_a_preset_reads_as_its_form_label_then_its_file(self) -> None:
        self.assertEqual(preset_name("1-iteration"), "1 journey (1-iteration)")
        self.assertEqual(preset_name("5-vu-5m"), "5 users for 5 minutes (5-vu-5m)")
        self.assertEqual(
            preset_name("1-iteration", "1-iteration-browser"), "1 journey (1-iteration-browser)"
        )

    def test_a_preset_without_a_form_label_keeps_its_stem(self) -> None:
        self.assertEqual(preset_name("9-vu-1h"), "9-vu-1h")


class SpecDocumentTests(unittest.TestCase):
    STEPS = [
        StepRequest("http-cart"),
        StepRequest("http-orders", PRESET, "5-vu-5m"),
        StepRequest("http-orders-status", CUSTOM, "custom/status-regression.json"),
    ]

    def test_the_document_matches_the_versioned_contract(self) -> None:
        self.assertEqual(
            spec_document(self.STEPS),
            {
                "version": 2,
                "steps": [
                    {"job": "http-cart", "load": {"mode": "auto"}},
                    {"job": "http-orders", "load": {"mode": "preset", "value": "5-vu-5m"}},
                    {
                        "job": "http-orders-status",
                        "load": {"mode": "custom", "path": "custom/status-regression.json"},
                    },
                ],
            },
        )
        self.assertEqual(parse_spec(spec_document(self.STEPS)), self.STEPS)

    def test_a_version_1_spec_names_the_rename(self) -> None:
        document = {"version": 1, "steps": [{"workflow": "http-cart", "load": {"mode": "auto"}}]}
        with self.assertRaises(SpecError) as caught:
            parse_spec(document)
        self.assertEqual(
            str(caught.exception),
            'spec version 1 is no longer read: set "version": 2 and rename each '
            'step\'s "workflow" to "job"',
        )

    def test_a_version_2_spec_names_each_step_job(self) -> None:
        self.assertEqual(
            spec_document([StepRequest("http-cart")]),
            {"version": 2, "steps": [{"job": "http-cart", "load": {"mode": "auto"}}]},
        )

    def test_malformed_documents_are_rejected(self) -> None:
        good = {"job": "http-cart", "load": {"mode": AUTO}}

        def one(load) -> dict:
            return {"version": 2, "steps": [{"job": "x", "load": load}]}

        cases = [
            ("a spec must be a JSON object", []),
            ("unknown spec keys: extra", {"version": 2, "steps": [good], "extra": 1}),
            ("spec version must be 2", {"version": 3, "steps": [good]}),
            ("a spec needs 1 to 4 steps", {"version": 2, "steps": []}),
            ("a spec needs 1 to 4 steps", {"version": 2, "steps": [good] * 5}),
            ("exactly job and load", {"version": 2, "steps": [{"job": "x"}]}),
            (
                "job must be a non-empty string",
                {"version": 2, "steps": [{"job": "", "load": {"mode": AUTO}}]},
            ),
            ("load mode must be one of auto, preset, custom", one({"mode": "fast"})),
            ("a preset load takes exactly mode, value", one({"mode": PRESET})),
            ("an auto load takes exactly mode", one({"mode": AUTO, "path": "a.json"})),
            ("a custom load needs a non-empty string", one({"mode": CUSTOM, "path": 3})),
        ]
        for message, document in cases:
            with self.subTest(message=message, document=document):
                with self.assertRaises(SpecError) as caught:
                    parse_spec(document)
                self.assertIn(message, str(caught.exception))

    def test_write_spec_writes_once_and_read_only(self) -> None:
        with TemporaryDirectory() as directory:
            path = Path(directory) / "dispatch" / "spec.json"
            write_spec(path, self.STEPS)
            self.assertEqual(load_spec(path), self.STEPS)
            self.assertEqual(path.stat().st_mode & 0o222, 0)
            with self.assertRaises(FileExistsError):
                write_spec(path, self.STEPS)

    def test_an_unreadable_spec_is_a_spec_error(self) -> None:
        with TemporaryDirectory() as directory:
            path = Path(directory) / "spec.json"
            path.write_text("{not json", encoding="utf-8")
            with self.assertRaises(SpecError):
                load_spec(path)
            with self.assertRaises(SpecError):
                load_spec(Path(directory) / "missing.json")


if __name__ == "__main__":
    unittest.main()
