"""Tests for the side-effect-free request auditor (transcription_skill.audit).

Everything runs against a self-made temporary directory tree and a minimal WAV produced with the
standard library: no network, no credentials, no GPU, no ffmpeg, no engine startup. The auditor's
verdicts are cross-checked against the real PathPolicy / OutputPolicy / parse_request objects rather
than against restated expectations, so a drift between the audit and the policy fails here.
"""
from __future__ import annotations

import copy
import json
import math
import os
import shutil
import struct
import sys
import tempfile
import unittest
import wave
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "src"))
sys.path.insert(0, str(ROOT / "tests"))

from transcription_skill.audit import (  # noqa: E402
    CHECK_FORBIDDEN_KEYS,
    CHECK_INPUT_AUTHORIZATION,
    CHECK_INPUT_PREFIX_COLLISION,
    CHECK_INPUT_TRAVERSAL,
    CHECK_OUTPUT_DOES_NOT_OVERWRITE_INPUT,
    CHECK_PARAMETER_HASH,
    CHECK_REQUEST_SHAPE,
    CHECK_ROOT_POLICY,
    AuditReport,
    audit_request,
    report_to_json,
)
from transcription_skill.errors import TranscriptionError  # noqa: E402
from transcription_skill.paths import MODE_ALLOWED_ROOTS, MODE_UNRESTRICTED, OutputPolicy, PathPolicy  # noqa: E402
from transcription_skill.request import parse_request  # noqa: E402


def make_wav(path: str, seconds: float = 1.0, rate: int = 8000) -> None:
    """Write a tiny valid mono PCM WAV (a quiet 220 Hz tone) using only the standard library."""
    with wave.open(path, "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(rate)
        frames = bytearray()
        total = int(rate * seconds)
        for i in range(total):
            frames += struct.pack("<h", int(6000 * math.sin(2 * math.pi * 220.0 * i / rate)))
        wav.writeframes(bytes(frames))


class AuditTestBase(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = os.path.realpath(tempfile.mkdtemp(prefix="ts_audit_"))
        self.root = os.path.join(self.tmp, "media")
        self.evil = os.path.join(self.tmp, "media_evil")          # prefix-collision sibling of root
        self.outside = os.path.join(self.tmp, "outside")
        self.out_root = os.path.join(self.tmp, "deliver")
        for d in (os.path.join(self.root, "sub"), self.evil, self.outside, self.out_root):
            os.makedirs(d)
        self.wav = os.path.join(self.root, "a.wav")
        self.deep = os.path.join(self.root, "sub", "b.wav")
        self.evil_wav = os.path.join(self.evil, "a.wav")
        self.secret = os.path.join(self.outside, "secret.wav")
        for p in (self.wav, self.deep, self.evil_wav, self.secret):
            make_wav(p)
        self.cwd = os.getcwd()

    def tearDown(self) -> None:
        os.chdir(self.cwd)
        shutil.rmtree(self.tmp, ignore_errors=True)

    def base_doc(self, **overrides) -> dict:
        doc = {"input": self.wav, "engine": "faster_whisper", "model": "base", "language": "ja"}
        doc.update(overrides)
        return doc

    def check_by_name(self, report: AuditReport, name: str):
        matches = [c for c in report.checks if c.name == name]
        self.assertEqual(len(matches), 1, name)
        return matches[0]

    def assert_policy_match_input(self, raw_input: str, roots, report: AuditReport) -> None:
        """The audit's input verdict must equal the real PathPolicy decision, code and reason included."""
        policy = PathPolicy(list(roots) if roots else None)
        try:
            resolved = policy.resolve_input(raw_input)
        except TranscriptionError as exc:
            self.assertFalse(report.input_path.accepted)
            self.assertEqual(report.input_path.error_code, exc.code)
            self.assertEqual(report.input_path.reason, exc.details.get("reason"))
            self.assertIsNone(report.input_path.resolved_path)
        else:
            self.assertTrue(report.input_path.accepted, report.input_path.reason)
            self.assertEqual(report.input_path.resolved_path, resolved)
            self.assertIsNone(report.input_path.error_code)
            self.assertIsNone(report.input_path.reason)

    def assert_policy_match_output(self, raw_output: str, roots, forbid, report: AuditReport) -> None:
        policy = OutputPolicy(list(roots) if roots else None)
        try:
            resolved = policy.resolve_output(raw_output, forbid=forbid)
        except TranscriptionError as exc:
            self.assertFalse(report.output_path.writable)
            self.assertEqual(report.output_path.error_code, exc.code)
            self.assertEqual(report.output_path.reason, exc.details.get("reason"))
        else:
            self.assertTrue(report.output_path.writable, report.output_path.reason)
            self.assertEqual(report.output_path.resolved_path, resolved)


class HappyPathAuditTests(AuditTestBase):
    def test_legal_request_inside_root_passes_every_check(self):
        out = os.path.join(self.out_root, "a.srt")
        doc = self.base_doc()
        report = audit_request(doc, allowed_input_roots=[self.root], allowed_output_roots=[self.out_root], output_path=out)

        self.assertIsInstance(report, AuditReport)
        self.assertTrue(report.ok)
        self.assertTrue(report.request.ok)
        self.assertEqual(report.input_path.mode, MODE_ALLOWED_ROOTS)
        self.assertTrue(report.input_path.accepted)
        self.assertEqual(report.input_path.resolved_path, self.wav)
        self.assertEqual(report.input_path.allowed_roots, [self.root])
        self.assertTrue(report.output_path.writable)
        self.assertEqual(report.output_path.resolved_path, out)
        # checks are ordered, unique and all green
        names = [c.name for c in report.checks]
        self.assertEqual(names, list(dict.fromkeys(names)))
        self.assertTrue(all(c.passed and c.reason is None and not c.skipped for c in report.checks))
        # the report is plain JSON data with no exception/callable leakage
        encoded = report_to_json(report)
        decoded = json.loads(encoded)
        self.assertEqual(decoded, report.to_dict())

    def test_audit_fields_match_parse_request_and_real_parameters_hash(self):
        doc = self.base_doc(word_timestamps=True, beam_size=3, temperature=0.2, vad_filter=True,
                            initial_prompt="hint", audio_stream=1)
        report = audit_request(doc, allowed_input_roots=[self.root])
        real = parse_request(copy.deepcopy(doc))

        self.assertTrue(report.ok)
        self.assertEqual(report.request.engine, real.engine)
        self.assertEqual(report.request.model, real.model)
        self.assertEqual(report.request.language, real.language)
        self.assertEqual(report.request.audio_stream, real.audio_stream)
        self.assertEqual(report.request.parameters, real.parameters())
        # exact, character-for-character sha256 identity with the production object
        self.assertEqual(report.request.parameters_hash, real.parameters_hash())
        self.assertRegex(report.request.parameters_hash, r"^[0-9a-f]{64}$")
        # and the independently computed hash agrees, so the check is not vacuous
        self.assertTrue(report.request.hash_matches)
        hash_check = self.check_by_name(report, CHECK_PARAMETER_HASH)
        self.assertTrue(hash_check.passed)

    def test_defaults_match_parse_request_when_fields_omitted(self):
        doc = {"input": self.wav}
        report = audit_request(doc, allowed_input_roots=[self.root])
        real = parse_request({"input": self.wav})
        self.assertTrue(report.ok)
        self.assertEqual(report.request.engine, real.engine)
        self.assertEqual(report.request.model, real.model)
        self.assertEqual(report.request.language, real.language)                      # None = auto-detect
        self.assertEqual(report.request.audio_stream, 0)                              # normalised
        self.assertEqual(report.request.parameters_hash, real.parameters_hash())

    def test_unrestricted_mode_keeps_historic_behaviour(self):
        report = audit_request({"input": self.secret})                 # no roots anywhere
        self.assertTrue(report.ok)
        self.assertEqual(report.input_path.mode, MODE_UNRESTRICTED)
        self.assertTrue(report.input_path.accepted)
        self.assertEqual(report.input_path.resolved_path, self.secret)
        self.assert_policy_match_input(self.secret, None, report)

    def test_request_embedded_roots_are_used_when_no_explicit_roots(self):
        doc = self.base_doc(allowed_input_roots=[self.root])
        report = audit_request(doc)
        self.assertTrue(report.ok)
        self.assertEqual(report.input_path.mode, MODE_ALLOWED_ROOTS)
        self.assertEqual(report.input_path.allowed_roots, [self.root])

    def test_explicit_roots_take_precedence_over_request_roots(self):
        doc = self.base_doc(allowed_input_roots=[self.outside])
        report = audit_request(doc, allowed_input_roots=[self.root])
        self.assertTrue(report.ok)
        self.assertEqual(report.input_path.allowed_roots, [self.root])

    def test_deep_nested_input_and_relative_input(self):
        report = audit_request({"input": self.deep}, allowed_input_roots=[self.root])
        self.assertTrue(report.ok)
        self.assertEqual(report.input_path.resolved_path, self.deep)
        os.chdir(self.root)
        report_rel = audit_request({"input": os.path.join("sub", "b.wav")}, allowed_input_roots=[self.root])
        self.assertTrue(report_rel.ok)
        self.assertEqual(report_rel.input_path.resolved_path, self.deep)

    def test_verdicts_match_real_policy_for_a_whole_sweep_of_paths(self):
        """For every interesting input path, the audit's (accepted, error_code, reason, resolved) tuple
        must be identical to what PathPolicy.resolve_input itself produces."""
        candidates = [
            self.wav, self.deep, self.evil_wav, self.secret, self.root,
            os.path.join(self.root, "missing.wav"),
            os.path.join(self.root, "..", "media", "a.wav"),
            os.path.join(self.root, "sub", "..", "a.wav"),
            os.path.join(self.tmp, "mediafile.wav"),
        ]
        for raw in candidates:
            report = audit_request({"input": raw}, allowed_input_roots=[self.root])
            self.assert_policy_match_input(raw, [self.root], report)
            # unrestricted mode must agree with an unrestricted policy as well
            if os.path.isfile(raw):
                report_unrestricted = audit_request({"input": raw})
                self.assert_policy_match_input(raw, None, report_unrestricted)

    def test_output_verdicts_match_real_output_policy_for_a_sweep(self):
        candidates = [
            os.path.join(self.out_root, "a.srt"),
            os.path.join(self.outside, "a.srt"),
            os.path.join(self.out_root, "..", "deliver", "a.srt"),
            self.wav,                                                  # would overwrite the input
            os.path.join(self.out_root, "nodir", "a.srt"),            # parent missing
        ]
        for raw in candidates:
            report = audit_request({"input": self.wav}, allowed_input_roots=[self.root],
                                   allowed_output_roots=[self.out_root], output_path=raw)
            self.assert_policy_match_output(raw, [self.out_root], [self.wav], report)


class NegativePathAuditTests(AuditTestBase):
    def test_parent_traversal_rejected_with_same_code_and_reason_as_policy(self):
        raw = os.path.join(self.root, "..", "media", "a.wav")
        report = audit_request({"input": raw}, allowed_input_roots=[self.root])
        self.assertFalse(report.ok)
        self.assertEqual(report.input_path.error_code, "INVALID_INPUT")
        self.assertEqual(report.input_path.reason, "traversal")
        trav = self.check_by_name(report, CHECK_INPUT_TRAVERSAL)
        self.assertFalse(trav.passed)
        self.assertIsNotNone(trav.reason)
        self.assert_policy_match_input(raw, [self.root], report)

    def test_traversal_that_would_land_outside_is_rejected_too(self):
        os.chdir(os.path.join(self.root, "sub"))
        raw = os.path.join("..", "..", "outside", "secret.wav")
        report = audit_request({"input": raw}, allowed_input_roots=[self.root])
        self.assertEqual((report.input_path.error_code, report.input_path.reason), ("INVALID_INPUT", "traversal"))
        self.assertFalse(self.check_by_name(report, CHECK_INPUT_TRAVERSAL).passed)
        self.assert_policy_match_input(raw, [self.root], report)

    def test_traversal_allowed_in_unrestricted_mode_like_the_policy(self):
        os.chdir(os.path.join(self.root, "sub"))
        raw = os.path.join("..", "a.wav")
        report = audit_request({"input": raw})
        self.assertTrue(report.ok)
        self.assertEqual(report.input_path.mode, MODE_UNRESTRICTED)
        self.assertTrue(report.input_path.accepted)
        self.assert_policy_match_input(raw, None, report)

    def test_prefix_collision_sibling_rejected_like_policy(self):
        report = audit_request({"input": self.evil_wav}, allowed_input_roots=[self.root])
        self.assertFalse(report.ok)
        self.assertEqual((report.input_path.error_code, report.input_path.reason),
                         ("INVALID_INPUT", "outside_allowed_roots"))
        collision = self.check_by_name(report, CHECK_INPUT_PREFIX_COLLISION)
        self.assertFalse(collision.passed)
        self.assertIsNotNone(collision.reason)
        auth = self.check_by_name(report, CHECK_INPUT_AUTHORIZATION)
        self.assertFalse(auth.passed)
        self.assert_policy_match_input(self.evil_wav, [self.root], report)

    def test_sibling_with_shared_prefix_in_its_name(self):
        sibling = os.path.join(self.tmp, "mediafile.wav")
        make_wav(sibling)
        report = audit_request({"input": sibling}, allowed_input_roots=[self.root])
        self.assertEqual(report.input_path.reason, "outside_allowed_roots")
        self.assertFalse(self.check_by_name(report, CHECK_INPUT_PREFIX_COLLISION).passed)
        self.assert_policy_match_input(sibling, [self.root], report)

    def test_outside_root_rejected_with_same_code_and_reason_as_policy(self):
        report = audit_request({"input": self.secret}, allowed_input_roots=[self.root])
        self.assertEqual((report.input_path.error_code, report.input_path.reason),
                         ("INVALID_INPUT", "outside_allowed_roots"))
        self.assert_policy_match_input(self.secret, [self.root], report)

    def test_missing_file_and_directory_inputs_match_policy(self):
        missing = os.path.join(self.root, "missing.wav")
        report = audit_request({"input": missing}, allowed_input_roots=[self.root])
        self.assertFalse(report.ok)
        self.assertEqual(report.input_path.error_code, "FILE_NOT_FOUND")
        self.assert_policy_match_input(missing, [self.root], report)

        report_dir = audit_request({"input": self.root}, allowed_input_roots=[self.root])
        self.assertEqual((report_dir.input_path.error_code, report_dir.input_path.reason),
                         ("INVALID_INPUT", "not_regular_file"))
        self.assert_policy_match_input(self.root, [self.root], report_dir)

    def test_forbidden_command_keys_fail_named_check(self):
        for key in ("command", "argv", "shell", "cmd", "exec", "args"):
            report = audit_request({"input": self.wav, key: "anything"}, allowed_input_roots=[self.root])
            self.assertFalse(report.ok, key)
            check = self.check_by_name(report, CHECK_FORBIDDEN_KEYS)
            self.assertFalse(check.passed)
            self.assertIn(key, check.reason)
            shape = self.check_by_name(report, CHECK_REQUEST_SHAPE)
            self.assertFalse(shape.passed)
            self.assertEqual(report.request.error_code, "INVALID_INPUT")
            # nothing resembling a path decision is claimed when the request itself is illegal
            self.assertFalse(report.input_path.accepted)

    def test_case_insensitive_forbidden_key(self):
        report = audit_request({"input": self.wav, "SHELL": True}, allowed_input_roots=[self.root])
        self.assertFalse(report.ok)
        self.assertFalse(self.check_by_name(report, CHECK_FORBIDDEN_KEYS).passed)

    def test_output_cannot_overwrite_input(self):
        report = audit_request({"input": self.wav}, allowed_input_roots=[self.root],
                               allowed_output_roots=[self.root], output_path=self.wav)
        self.assertFalse(report.ok)
        self.assertEqual((report.output_path.error_code, report.output_path.reason),
                         ("INVALID_INPUT", "would_overwrite_input"))
        overwrite = self.check_by_name(report, CHECK_OUTPUT_DOES_NOT_OVERWRITE_INPUT)
        self.assertFalse(overwrite.passed)
        self.assert_policy_match_output(self.wav, [self.root], [self.wav], report)

    def test_output_traversal_and_outside_root_match_policy(self):
        trav = os.path.join(self.root, "..", "deliver", "x.srt")
        report = audit_request({"input": self.wav}, allowed_input_roots=[self.root],
                               allowed_output_roots=[self.out_root], output_path=trav)
        self.assertEqual(report.output_path.reason, "traversal")
        self.assert_policy_match_output(trav, [self.out_root], [self.wav], report)

        outside = os.path.join(self.outside, "x.srt")
        report2 = audit_request({"input": self.wav}, allowed_input_roots=[self.root],
                                allowed_output_roots=[self.out_root], output_path=outside)
        self.assertEqual(report2.output_path.reason, "outside_allowed_roots")
        self.assert_policy_match_output(outside, [self.out_root], [self.wav], report2)

    def test_bad_root_directory_is_reported_not_raised(self):
        report = audit_request({"input": self.wav}, allowed_input_roots=[self.wav])   # a file, not a dir
        self.assertFalse(report.ok)
        root_check = self.check_by_name(report, CHECK_ROOT_POLICY)
        self.assertFalse(root_check.passed)
        self.assertEqual(report.input_path.reason, "root_policy_unusable")

    def test_symlink_escape_matches_policy_when_symlinks_are_available(self):
        link = os.path.join(self.root, "link_out.wav")
        try:
            os.symlink(self.secret, link)
        except (OSError, NotImplementedError):
            self.skipTest("symlinks cannot be created by this user on this OS")
        report = audit_request({"input": link}, allowed_input_roots=[self.root])
        self.assertEqual((report.input_path.error_code, report.input_path.reason),
                         ("INVALID_INPUT", "symlink_escape"))
        self.assert_policy_match_input(link, [self.root], report)
        self.assertFalse(self.check_by_name(report, CHECK_INPUT_AUTHORIZATION).passed)


class BoundaryAndDegradedAuditTests(AuditTestBase):
    def test_omitted_audio_stream_and_explicit_zero_share_parameters_hash(self):
        omitted = audit_request({"input": self.wav, "language": "en"}, allowed_input_roots=[self.root])
        explicit = audit_request({"input": self.wav, "language": "en", "audio_stream": 0},
                                 allowed_input_roots=[self.root])
        self.assertTrue(omitted.ok and explicit.ok)
        self.assertEqual(omitted.request.audio_stream, 0)
        self.assertEqual(explicit.request.audio_stream, 0)
        self.assertEqual(omitted.request.parameters_hash, explicit.request.parameters_hash)
        # and both equal the hashes of the real parsed objects, character for character
        self.assertEqual(omitted.request.parameters_hash,
                         parse_request({"input": self.wav, "language": "en"}).parameters_hash())
        self.assertEqual(explicit.request.parameters_hash,
                         parse_request({"input": self.wav, "language": "en", "audio_stream": 0}).parameters_hash())

    def test_vocabulary_only_appears_when_given_and_hash_still_matches(self):
        without = audit_request({"input": self.wav}, allowed_input_roots=[self.root])
        with_vocab = audit_request({"input": self.wav, "vocabulary": {"心房細動": ["しんぼうさいどう"]}},
                                  allowed_input_roots=[self.root])
        self.assertTrue(with_vocab.ok)
        self.assertNotIn("vocabulary", without.request.parameters)
        self.assertIn("vocabulary", with_vocab.request.parameters)
        self.assertNotEqual(without.request.parameters_hash, with_vocab.request.parameters_hash)
        real = parse_request({"input": self.wav, "vocabulary": {"心房細動": ["しんぼうさいどう"]}})
        self.assertEqual(with_vocab.request.parameters_hash, real.parameters_hash())

    def test_degraded_result_for_empty_input(self):
        report = audit_request({}, allowed_input_roots=[self.root])
        self._assert_degraded(report)
        self.assertEqual(report.request.error_reason, "'input' must be a non-empty path string")

    def test_degraded_result_for_non_iso_language(self):
        report = audit_request({"input": self.wav, "language": "xxxx"}, allowed_input_roots=[self.root])
        self._assert_degraded(report)
        self.assertIn("ISO 639", report.request.error_reason)

    def test_degraded_result_for_unknown_budget_key(self):
        report = audit_request({"input": self.wav, "budget": {"mystery": 12}}, allowed_input_roots=[self.root])
        self._assert_degraded(report)
        self.assertIn("budget", report.request.error_reason)

    def test_degraded_result_for_wrong_types_and_non_dict(self):
        for bad in (["not", "a", "dict"], None, 42, "string",
                    {"input": self.wav, "audio_stream": -1},
                    {"input": self.wav, "beam_size": 99},
                    {"input": self.wav, "temperature": 5.0},
                    {"input": 3}):
            report = audit_request(bad, allowed_input_roots=[self.root])
            self._assert_degraded(report, raw=bad)
            # the degraded report still serialises and keeps its check list ordered
            json.loads(report_to_json(report))
            names = [c.name for c in report.checks]
            self.assertEqual(names, list(dict.fromkeys(names)))

    def _assert_degraded(self, report: AuditReport, raw=None) -> None:
        self.assertIsInstance(report, AuditReport)
        self.assertFalse(report.ok)
        self.assertFalse(report.request.ok)
        self.assertEqual(report.request.error_code, "INVALID_INPUT")
        self.assertTrue(report.request.error_reason)
        self.assertIsNone(report.request.parameters_hash)
        self.assertIsNone(report.request.engine)
        self.assertIsNone(report.request.audio_stream)
        # the failed parse is a hard failure; inapplicable path checks are explicitly skipped
        hash_check = self.check_by_name(report, CHECK_PARAMETER_HASH)
        self.assertFalse(hash_check.passed and not hash_check.skipped)
        for check in report.checks:
            if check.name in ("input_path_traversal", "input_path_prefix_collision", "input_path_authorization",
                              "output_path_traversal", "output_path_authorization", "output_does_not_overwrite_input"):
                self.assertTrue(check.skipped or not check.passed, check.name)
        # JSON-safe, no exception objects/callables
        decoded = json.loads(report_to_json(report))
        self.assertFalse(decoded["ok"])

    def test_input_dict_is_never_mutated(self):
        doc = self.base_doc(audio_stream=2, vocabulary={"a": ["b"]}, budget={"timeout": 3.0})
        snapshot = copy.deepcopy(doc)
        audit_request(doc, allowed_input_roots=[self.root], output_path=os.path.join(self.out_root, "x.srt"))
        self.assertEqual(doc, snapshot)

    def test_no_output_path_is_a_skipped_verdict_not_a_failure(self):
        report = audit_request({"input": self.wav}, allowed_input_roots=[self.root])
        self.assertTrue(report.ok)
        self.assertFalse(report.output_path.evaluated)
        self.assertFalse(report.output_path.writable)
        self.assertEqual(report.output_path.reason, "output_path_not_provided")

    def test_full_report_is_json_serialisable_with_only_primitive_data(self):
        report = audit_request(self.base_doc(), allowed_input_roots=[self.root],
                               output_path=os.path.join(self.out_root, "a.srt"))
        text = report_to_json(report, indent=2)
        decoded = json.loads(text)
        # spot-check the structural contract the auditor promises
        self.assertEqual(set(decoded), {"ok", "request", "input_path", "output_path", "checks"})
        for check in decoded["checks"]:
            self.assertEqual(set(check), {"name", "passed", "reason", "skipped"})
        # no exception type names or function markers leaked into the payload
        self.assertNotIn("Traceback", text)
        self.assertNotIn("at 0x", text)


if __name__ == "__main__":
    unittest.main(verbosity=2)
