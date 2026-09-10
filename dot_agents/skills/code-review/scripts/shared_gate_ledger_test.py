from __future__ import annotations

import argparse
import io
import json
import subprocess
import sys
import tempfile
import unittest
from contextlib import redirect_stderr
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import shared_gate_ledger


class SharedGateLedgerTest(unittest.TestCase):
    """Checks deterministic evidence extraction and completeness gates."""
    def test_decode_key_normalizes_generated_f_string_family(self) -> None:
        self.assertEqual(shared_gate_ledger._decode_key('f"segment_name_{index}"'), "segment_name_{index}")
        self.assertTrue(shared_gate_ledger._source_contains_key("segment_name_{index}", ":segment_name_4"))

    def test_search_matches_preserves_colons_and_marks_symbolic_source(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            repo = Path(temporary_directory)
            subprocess.run(["git", "init", "-q"], cwd=repo, check=True)
            subprocess.run(["git", "config", "user.email", "test@example.com"], cwd=repo, check=True)
            subprocess.run(["git", "config", "user.name", "Test"], cwd=repo, check=True)
            source = repo / "consumer.py"
            source.write_text('value = ":region:detail"\n')
            subprocess.run(["git", "add", "consumer.py"], cwd=repo, check=True)
            subprocess.run(["git", "commit", "-qm", "fixture"], cwd=repo, check=True)

            matches = shared_gate_ledger._search_matches(repo, "HEAD", ["."], "region")

        self.assertEqual(len(matches), 1)
        self.assertEqual(matches[0]["path"], "consumer.py")
        self.assertEqual(matches[0]["source"], 'value = ":region:detail"')
        self.assertEqual(matches[0]["spellings"], ["region", ":region"])
        self.assertTrue(matches[0]["symbolic"])

    def test_search_matches_reads_each_matching_line_from_the_requested_ref(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            repo = Path(temporary_directory)
            subprocess.run(["git", "init", "-q"], cwd=repo, check=True)
            subprocess.run(["git", "config", "user.email", "test@example.com"], cwd=repo, check=True)
            subprocess.run(["git", "config", "user.name", "Test"], cwd=repo, check=True)
            source = repo / "consumer.py"
            source.write_text('first = ":region"\nsecond = "region"\n')
            subprocess.run(["git", "add", "consumer.py"], cwd=repo, check=True)
            subprocess.run(["git", "commit", "-qm", "old"], cwd=repo, check=True)
            source.write_text('current = "other"\n')
            subprocess.run(["git", "commit", "-qam", "new"], cwd=repo, check=True)

            matches = shared_gate_ledger._search_matches(repo, "HEAD^", ["."], "region")

        self.assertEqual([match["line"] for match in matches], [1, 2])
        self.assertEqual([match["source"] for match in matches], ['first = ":region"', 'second = "region"'])

    def test_search_matches_marks_symbolic_prompt_as_producer_candidate(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            repo = Path(temporary_directory)
            prompts = repo / "prompts"
            prompts.mkdir()
            subprocess.run(["git", "init", "-q"], cwd=repo, check=True)
            subprocess.run(["git", "config", "user.email", "test@example.com"], cwd=repo, check=True)
            subprocess.run(["git", "config", "user.name", "Test"], cwd=repo, check=True)
            (prompts / "template.py").write_text('instruction = "Use :region"\n')
            subprocess.run(["git", "add", "."], cwd=repo, check=True)
            subprocess.run(["git", "commit", "-qm", "fixture"], cwd=repo, check=True)

            matches = shared_gate_ledger._search_matches(repo, "HEAD", ["."], "region")

        self.assertEqual(len(matches), 1)
        self.assertTrue(matches[0]["producer_candidate"])

    def test_materialize_ref_uses_requested_revision(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            repo = Path(temporary_directory) / "repo"
            output = Path(temporary_directory) / "output"
            repo.mkdir()
            output.mkdir()
            subprocess.run(["git", "init", "-q"], cwd=repo, check=True)
            subprocess.run(["git", "config", "user.email", "test@example.com"], cwd=repo, check=True)
            subprocess.run(["git", "config", "user.name", "Test"], cwd=repo, check=True)
            source = repo / "consumer.py"
            source.write_text('bindings["old"] = value\n')
            subprocess.run(["git", "add", "consumer.py"], cwd=repo, check=True)
            subprocess.run(["git", "commit", "-qm", "old"], cwd=repo, check=True)
            source.write_text('bindings["new"] = value\n')
            subprocess.run(["git", "commit", "-qam", "new"], cwd=repo, check=True)

            shared_gate_ledger._materialize_ref(repo, "HEAD^", ["consumer.py"], output)

            self.assertEqual((output / "consumer.py").read_text(), 'bindings["old"] = value\n')

    def test_validate_accepts_complete_exact_key_evidence(self) -> None:
        worksheet = self._worksheet()

        stderr = io.StringIO()
        with redirect_stderr(stderr):
            result = shared_gate_ledger.validate(
                argparse.Namespace(worksheet=io.StringIO(json.dumps(worksheet)))
            )

        self.assertEqual(result, 0)
        self.assertIn("consumer keys - searched keys = empty", stderr.getvalue())

    def test_validate_rejects_incomplete_and_wrong_key_evidence(self) -> None:
        worksheet = self._worksheet()
        worksheet["rows"]["region"]["phase"] = "before-ish"
        worksheet["searches"]["region"][0]["source"] = 'prompt = ":other"'
        worksheet["rows"]["region"]["match_dispositions"] = {"missing": "producer"}

        stderr = io.StringIO()
        with redirect_stderr(stderr):
            result = shared_gate_ledger.validate(
                argparse.Namespace(worksheet=io.StringIO(json.dumps(worksheet)))
            )

        self.assertEqual(result, 1)
        errors = stderr.getvalue()
        self.assertIn("does not contain the exact key", errors)
        self.assertIn("phase must be pre-gate, post-gate, or unresolved", errors)
        self.assertIn("dispositions reference unknown matches", errors)
        self.assertIn("symbolic match region:0 needs a disposition", errors)

    def test_validate_requires_prompt_candidates_and_producer_requirement(self) -> None:
        worksheet = self._worksheet()
        worksheet["searches"]["region"][0]["producer_candidate"] = True
        worksheet["rows"]["region"]["producer_match_ids"] = []
        worksheet["rows"]["region"]["producer_requirement"] = "mentioned"

        stderr = io.StringIO()
        with redirect_stderr(stderr):
            result = shared_gate_ledger.validate(
                argparse.Namespace(worksheet=io.StringIO(json.dumps(worksheet)))
            )

        self.assertEqual(result, 1)
        errors = stderr.getvalue()
        self.assertIn("prompt/template producer candidates missing from producer_match_ids", errors)
        self.assertIn("producer_requirement must be one of", errors)

    @staticmethod
    def _worksheet() -> dict[str, object]:
        return {
            "schema_version": 1,
            "consumer_keys": {"region": [{"rule_id": "fixture"}]},
            "searches": {
                "region": [
                    {
                        "id": "region:0",
                        "source": 'prompt = ":region"',
                        "symbolic": True,
                    }
                ]
            },
            "rows": {
                "region": {
                    "producer_evidence": "prompt contract",
                    "producer_requirement": "required",
                    "producer_match_ids": ["region:0"],
                    "phase": "pre-gate",
                    "post_gate_match_ids": [],
                    "gate_result": "accepted",
                    "downstream_consumer": "runtime binder",
                    "retry_satisfiability": "satisfiable",
                    "match_dispositions": {"region:0": "required producer"},
                }
            },
            "caller_contracts": [
                {
                    "caller": "feature",
                    "producer": "prompt",
                    "phase": "pre-gate",
                    "copy_checked": "validation copy",
                    "validation_handling": "retained",
                    "later_handling": "bound",
                    "expected_outcome": "accepted",
                }
            ],
            "transform_erasure": [],
            "transform_erasure_not_applicable": "No validation-time transformer exists.",
        }


if __name__ == "__main__":
    unittest.main()
