"""Request audit: a side-effect-free inspection of an untrusted transcription request.

The audit takes the same raw dictionary shape as
:func:`transcription_skill.request.parse_request` (illegal values included) and answers four
questions with plain, JSON-serialisable data:

1. Does the request parse, and if so what engine / model / language / audio_stream
   (normalised to its effective stream index) and ``parameters_hash`` does it carry? The hash is
   computed from the parsed parameters with an independent implementation, then cross-checked
   against :meth:`TranscribeRequest.parameters_hash`.
2. What does :class:`~transcription_skill.paths.PathPolicy` decide about the input path: which
   mode is in force, is the path accepted, and if not which error code / ``details.reason`` did
   the policy raise?
3. What does :class:`~transcription_skill.paths.OutputPolicy` decide about the optional output
   path, including the refusal to overwrite an input?
4. Which named checks passed, in a stable order, each with a human-readable reason when it did
   not.

Consistency is structural, not re-implemented: the path verdicts are taken verbatim from the
real ``PathPolicy.resolve_input`` / ``OutputPolicy.resolve_output`` calls, so the audit can
never drift from the policy it describes. The audit never starts an engine, never opens media
files (the policies only ``stat`` paths), performs no network access, never writes, and never
mutates the caller's dictionary. Illegal requests produce a degraded result with an error code
and reason instead of an exception.
"""
from __future__ import annotations

import copy
import hashlib
import json
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from .errors import TranscriptionError
from .paths import MODE_ALLOWED_ROOTS, MODE_UNRESTRICTED, OutputPolicy, PathPolicy, has_traversal
from .request import FORBIDDEN_KEYS, parse_request

# Stable order of the named checks. Each appears at most once and only when it could be evaluated.
CHECK_REQUEST_SHAPE = "request_shape"
CHECK_FORBIDDEN_KEYS = "forbidden_keys"
CHECK_PARAMETER_HASH = "parameter_hash"
CHECK_ROOT_POLICY = "root_policy"
CHECK_INPUT_TRAVERSAL = "input_path_traversal"
CHECK_INPUT_PREFIX_COLLISION = "input_path_prefix_collision"
CHECK_INPUT_AUTHORIZATION = "input_path_authorization"
CHECK_OUTPUT_TRAVERSAL = "output_path_traversal"
CHECK_OUTPUT_AUTHORIZATION = "output_path_authorization"
CHECK_OUTPUT_DOES_NOT_OVERWRITE_INPUT = "output_does_not_overwrite_input"

# Reasons the audit itself synthesises (they never come from a policy/parser error).
REASON_REQUEST_INVALID = "request_invalid"
REASON_OUTPUT_NOT_PROVIDED = "output_path_not_provided"
REASON_ROOT_POLICY_UNUSABLE = "root_policy_unusable"


@dataclass
class AuditCheck:
    """One named check. ``passed`` is the verdict; ``reason`` is None on success and a
    human-readable explanation otherwise. ``skipped`` marks a check that could not be evaluated
    (for example an input path check when the request itself failed); a skipped check is never a
    failure."""

    name: str
    passed: bool
    reason: Optional[str] = None
    skipped: bool = False

    def to_dict(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "passed": self.passed,
            "reason": self.reason,
            "skipped": self.skipped,
        }


@dataclass
class RequestVerdict:
    """Outcome of parsing the raw request. On success ``error_code`` / ``error_reason`` are None
    and the engine/model/language/audio_stream/parameters/parameters_hash fields mirror the
    parsed object; on failure the parameter fields are None and the error fields describe why."""

    ok: bool
    error_code: Optional[str] = None
    error_reason: Optional[str] = None
    engine: Optional[str] = None
    model: Optional[str] = None
    language: Optional[str] = None
    audio_stream: Optional[int] = None
    parameters: Optional[Dict[str, Any]] = None
    parameters_hash: Optional[str] = None
    hash_matches: Optional[bool] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "ok": self.ok,
            "error_code": self.error_code,
            "error_reason": self.error_reason,
            "engine": self.engine,
            "model": self.model,
            "language": self.language,
            "audio_stream": self.audio_stream,
            "parameters": copy.deepcopy(self.parameters),
            "parameters_hash": self.parameters_hash,
            "hash_matches": self.hash_matches,
        }


@dataclass
class InputPathVerdict:
    """Verbatim conclusion of ``PathPolicy.resolve_input``. ``mode`` is the policy mode in
    force, ``accepted`` mirrors whether the call returned, and on rejection ``error_code`` /
    ``reason`` are the policy's exception code and ``details.reason`` (reason may be absent for,
    e.g., FILE_NOT_FOUND)."""

    mode: str
    accepted: bool
    reason: Optional[str] = None
    error_code: Optional[str] = None
    resolved_path: Optional[str] = None
    allowed_roots: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "mode": self.mode,
            "accepted": self.accepted,
            "reason": self.reason,
            "error_code": self.error_code,
            "resolved_path": self.resolved_path,
            "allowed_roots": list(self.allowed_roots),
        }


@dataclass
class OutputPathVerdict:
    """Verbatim conclusion of ``OutputPolicy.resolve_output``. With no output path supplied the
    verdict is a skipped one (``evaluated`` False, ``writable`` False) rather than a failure."""

    mode: str
    writable: bool
    reason: Optional[str] = None
    error_code: Optional[str] = None
    resolved_path: Optional[str] = None
    allowed_roots: List[str] = field(default_factory=list)
    evaluated: bool = True

    def to_dict(self) -> Dict[str, Any]:
        return {
            "mode": self.mode,
            "writable": self.writable,
            "reason": self.reason,
            "error_code": self.error_code,
            "resolved_path": self.resolved_path,
            "allowed_roots": list(self.allowed_roots),
            "evaluated": self.evaluated,
        }


@dataclass
class AuditReport:
    """Structured result of :func:`audit_request`. ``ok`` is True only when the request parsed
    and every evaluated check passed; skipped checks do not count. The whole object round-trips
    through :func:`json.dumps`."""

    ok: bool
    request: RequestVerdict
    input_path: Optional[InputPathVerdict]
    output_path: Optional[OutputPathVerdict]
    checks: List[AuditCheck]

    def to_dict(self) -> Dict[str, Any]:
        return {
            "ok": self.ok,
            "request": self.request.to_dict(),
            "input_path": self.input_path.to_dict() if self.input_path is not None else None,
            "output_path": self.output_path.to_dict() if self.output_path is not None else None,
            "checks": [c.to_dict() for c in self.checks],
        }


# pragma: no cover - defensive, every emitted value is primitive
def _json_default(value: Any) -> Any:
    """Last-resort JSON coercion so the report never carries an exception object or reference."""
    if isinstance(value, (set, tuple)):
        return list(value)
    return repr(value)


def report_to_json(report: AuditReport, *, indent: Optional[int] = None) -> str:
    """Serialize an :class:`AuditReport` to JSON; never leaks exception objects or callables."""
    return json.dumps(
        report.to_dict(), indent=indent, ensure_ascii=False, sort_keys=True, default=_json_default
    )


def _independent_parameters_hash(parameters: Dict[str, Any]) -> str:
    """Compute the parameters hash without calling ``TranscribeRequest.parameters_hash``.

    It follows the same contract (sha256 over the key-sorted, UTF-8 encoded JSON of the
    parameter dictionary) on an independently copied mapping, so a divergence would be visible
    instead of being silently assumed away."""
    payload = json.dumps(copy.deepcopy(parameters), sort_keys=True, ensure_ascii=False)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _forbidden_keys_in(doc: Any) -> List[str]:
    """Forbidden keys present in the raw document, in document order, matched case-insensitively
    exactly as ``parse_request`` does (which also rejects unknown keys, but the forbidden-key
    rule is reported separately so callers see the security-relevant distinction)."""
    found: List[str] = []
    if isinstance(doc, dict):
        for key in doc:
            if isinstance(key, str) and key.lower() in FORBIDDEN_KEYS and key not in found:
                found.append(key)
    return found


def audit_request(
    doc: Any,
    allowed_input_roots: Optional[List[str]] = None,
    allowed_output_roots: Optional[List[str]] = None,
    output_path: Optional[str] = None,
) -> AuditReport:
    """Audit a raw request dictionary without side effects.

    Arguments:
        doc: raw request object in the ``parse_request`` shape; may contain illegal values or
            not be a dict at all. The object is never mutated (a deep copy is used internally).
        allowed_input_roots: explicit input roots. When None, roots carried by the request
            itself are used; an empty/None result keeps the historic unrestricted mode.
        allowed_output_roots: explicit output roots; None means unrestricted output mode.
        output_path: optional output destination to check against ``OutputPolicy`` and against
            the request's input (the overwrite check).

    Returns an :class:`AuditReport`; never raises for malformed input.
    """
    try:
        raw = copy.deepcopy(doc)
    except Exception as exc:  # an uncopyable object must not escape as an audit exception
        raw = None
        copy_failure: Optional[str] = (
            f"request could not be copied for inspection: {type(exc).__name__}: {exc}"
        )
    else:
        copy_failure = None
    checks: List[AuditCheck] = []

    def record(
        name: str, passed: bool, reason: Optional[str] = None, *, skipped: bool = False
    ) -> None:
        checks.append(AuditCheck(name=name, passed=passed, reason=reason, skipped=skipped))

    # --- 1. request shape -------------------------------------------------
    if copy_failure is not None:
        record(CHECK_REQUEST_SHAPE, False, copy_failure)
        forbidden: List[str] = []
    elif not isinstance(raw, dict):
        record(CHECK_REQUEST_SHAPE, False, "request must be a JSON object")
        forbidden = []
    else:
        forbidden = _forbidden_keys_in(raw)
        if forbidden:
            record(CHECK_REQUEST_SHAPE, False, f"forbidden key(s) present: {', '.join(forbidden)}")
        else:
            record(CHECK_REQUEST_SHAPE, True)

    # --- 2. forbidden command/credential keys -----------------------------
    if isinstance(raw, dict):
        if forbidden:
            record(
                CHECK_FORBIDDEN_KEYS,
                False,
                "this skill takes structured parameters, never commands or credentials: "
                + ", ".join(forbidden),
            )
        else:
            record(CHECK_FORBIDDEN_KEYS, True)
    else:
        record(
            CHECK_FORBIDDEN_KEYS,
            False,
            "request is not a JSON object, so its keys cannot be inspected",
            skipped=True,
        )

    # --- 3. parse (or degrade) -------------------------------------------
    request_obj = None
    parse_error: Optional[TranscriptionError] = None
    unexpected_error: Optional[str] = copy_failure
    if isinstance(raw, dict) and not forbidden:
        try:
            request_obj = parse_request(raw)
        except TranscriptionError as exc:
            parse_error = exc
        except Exception as exc:
            # defensive: the audit contract is "never escape with an exception"
            unexpected_error = f"{type(exc).__name__}: {exc}"

    if request_obj is not None:
        record(CHECK_PARAMETER_HASH, True)
    elif parse_error is not None:
        record(CHECK_PARAMETER_HASH, False, f"request did not parse: {parse_error.message}")
    elif unexpected_error is not None:
        record(CHECK_PARAMETER_HASH, False, f"request could not be parsed: {unexpected_error}")
    else:
        record(CHECK_PARAMETER_HASH, False, "request rejected before parsing")

    request_verdict = _build_request_verdict(request_obj, parse_error, unexpected_error)

    # --- 4. input path policy --------------------------------------------
    roots = allowed_input_roots
    if roots is None and request_obj is not None:
        roots = request_obj.allowed_input_roots

    input_verdict: Optional[InputPathVerdict] = None
    policy_error: Optional[TranscriptionError] = None
    policy: Optional[PathPolicy] = None
    try:
        policy = PathPolicy(roots)
        record(CHECK_ROOT_POLICY, True)
    except TranscriptionError as exc:
        policy_error = exc
        record(CHECK_ROOT_POLICY, False, exc.message)
    except Exception as exc:
        record(CHECK_ROOT_POLICY, False, f"{type(exc).__name__}: {exc}")

    if policy is not None and request_obj is not None:
        input_verdict = _resolve_input(policy, request_obj.input)
        _record_input_checks(record, policy, request_obj.input, input_verdict)
    elif policy is not None:
        record(CHECK_INPUT_TRAVERSAL, False, "no valid request input to check", skipped=True)
        record(
            CHECK_INPUT_PREFIX_COLLISION,
            False,
            "no valid request input to check",
            skipped=True,
        )
        record(CHECK_INPUT_AUTHORIZATION, False, "no valid request input to check", skipped=True)
        input_verdict = InputPathVerdict(
            mode=policy.mode,
            accepted=False,
            reason=REASON_REQUEST_INVALID if policy_error is None else REASON_ROOT_POLICY_UNUSABLE,
            error_code=request_verdict.error_code,
            allowed_roots=list(policy.roots),
        )
    else:
        # The policy itself could not be built (a root that is not a directory, etc.). Report the
        # mode that was requested and skip the path-level checks: no authoritative decision exists.
        mode = MODE_ALLOWED_ROOTS if roots else MODE_UNRESTRICTED
        if policy_error is not None:
            reason = policy_error.message
        else:
            reason = "input roots could not be resolved"
        input_verdict = InputPathVerdict(
            mode=mode,
            accepted=False,
            reason=REASON_ROOT_POLICY_UNUSABLE,
            error_code=policy_error.code if policy_error is not None else "INVALID_INPUT",
            allowed_roots=[],
        )
        path_checks = (
            CHECK_INPUT_TRAVERSAL,
            CHECK_INPUT_PREFIX_COLLISION,
            CHECK_INPUT_AUTHORIZATION,
        )
        for name in path_checks:
            record(name, False, reason, skipped=True)

    # --- 5. output path policy -------------------------------------------
    if output_path is None:
        output_verdict = OutputPathVerdict(
            mode=MODE_UNRESTRICTED,
            writable=False,
            reason=REASON_OUTPUT_NOT_PROVIDED,
            evaluated=False,
        )
    else:
        output_verdict = _resolve_output(allowed_output_roots, output_path, request_obj, record)

    # A failed parse is itself a verdict, never a skipped non-event: the report is not OK unless
    # the request parsed and every non-skipped check passed.
    ok = request_verdict.ok and all(c.passed for c in checks if not c.skipped)
    return AuditReport(
        ok=ok,
        request=request_verdict,
        input_path=input_verdict,
        output_path=output_verdict,
        checks=checks,
    )


def _build_request_verdict(
    request_obj: Any,
    parse_error: Optional[TranscriptionError],
    unexpected_error: Optional[str],
) -> RequestVerdict:
    if request_obj is None:
        if parse_error is not None:
            return RequestVerdict(
                ok=False, error_code=parse_error.code, error_reason=parse_error.message
            )
        return RequestVerdict(
            ok=False,
            error_code="INVALID_INPUT",
            error_reason=unexpected_error or "request could not be parsed",
        )

    parameters = request_obj.parameters()
    # Independent hash first; equality with the real object's hash is asserted as its own fact.
    own_hash = _independent_parameters_hash(parameters)
    real_hash = request_obj.parameters_hash()
    return RequestVerdict(
        ok=True,
        engine=request_obj.engine,
        model=request_obj.model,
        language=request_obj.language,
        audio_stream=parameters["audio_stream"],
        parameters=parameters,
        parameters_hash=real_hash,
        hash_matches=own_hash == real_hash,
    )


def _resolve_input(policy: PathPolicy, raw_input: str) -> InputPathVerdict:
    """Run the real policy and translate its result/exception into a verdict. Only filesystem
    metadata (stat/access) is touched -- the media file itself is never opened."""
    try:
        resolved = policy.resolve_input(raw_input)
    except TranscriptionError as exc:
        return InputPathVerdict(
            mode=policy.mode,
            accepted=False,
            reason=exc.details.get("reason"),
            error_code=exc.code,
            allowed_roots=list(policy.roots),
        )
    return InputPathVerdict(
        mode=policy.mode,
        accepted=True,
        resolved_path=resolved,
        allowed_roots=list(policy.roots),
    )


def _record_input_checks(
    record: Any,
    policy: PathPolicy,
    raw_input: str,
    verdict: InputPathVerdict,
) -> None:
    """Split the single authoritative policy decision into the named checks. Every rejected
    reason is attributed by name; a rejection whose reason belongs to a different check still
    fails the overall authorization check, so nothing is hidden."""
    if policy.roots and has_traversal(raw_input):
        if verdict.accepted or verdict.reason != "traversal":
            # Unreachable while PathPolicy keeps its current contract; makes future drift visible.
            record(
                CHECK_INPUT_TRAVERSAL,
                False,
                verdict.reason or "traversal rejected without a reason",
            )
        else:
            record(
                CHECK_INPUT_TRAVERSAL,
                False,
                "input path contains '..' and allowed roots are enforced",
            )
    else:
        record(CHECK_INPUT_TRAVERSAL, True)

    if not verdict.accepted and verdict.reason == "outside_allowed_roots":
        record(
            CHECK_INPUT_PREFIX_COLLISION,
            False,
            "input resolves outside the allowed roots; a sibling directory with a shared name "
            "prefix is not authorised (path components are compared, never string prefixes)",
        )
    else:
        record(CHECK_INPUT_PREFIX_COLLISION, True)

    if verdict.accepted:
        record(CHECK_INPUT_AUTHORIZATION, True)
    elif verdict.reason:
        record(
            CHECK_INPUT_AUTHORIZATION,
            False,
            f"{verdict.error_code}: {verdict.reason}",
        )
    else:
        record(
            CHECK_INPUT_AUTHORIZATION,
            False,
            f"{verdict.error_code}: input path was not accepted",
        )


def _resolve_output(
    allowed_output_roots: Optional[List[str]],
    output_path: str,
    request_obj: Any,
    record: Any,
) -> OutputPathVerdict:
    # Without a parsed request there is no declared input to protect: the overwrite check is
    # then skipped rather than reported as a pass, while the policy's containment rules apply.
    forbid = [request_obj.input] if request_obj is not None else None

    def record_overwrite_skip(message: str) -> None:
        if request_obj is None:
            record(CHECK_OUTPUT_DOES_NOT_OVERWRITE_INPUT, False, message, skipped=True)
        else:
            record(CHECK_OUTPUT_DOES_NOT_OVERWRITE_INPUT, True)

    try:
        policy = OutputPolicy(allowed_output_roots)
    except TranscriptionError as exc:
        for name in (
            CHECK_OUTPUT_TRAVERSAL,
            CHECK_OUTPUT_AUTHORIZATION,
            CHECK_OUTPUT_DOES_NOT_OVERWRITE_INPUT,
        ):
            record(name, False, exc.message, skipped=True)
        return OutputPathVerdict(
            mode=MODE_ALLOWED_ROOTS if allowed_output_roots else MODE_UNRESTRICTED,
            writable=False,
            reason=exc.details.get("reason") or REASON_ROOT_POLICY_UNUSABLE,
            error_code=exc.code,
            allowed_roots=[],
        )
    except Exception as exc:
        message = f"{type(exc).__name__}: {exc}"
        for name in (
            CHECK_OUTPUT_TRAVERSAL,
            CHECK_OUTPUT_AUTHORIZATION,
            CHECK_OUTPUT_DOES_NOT_OVERWRITE_INPUT,
        ):
            record(name, False, message, skipped=True)
        return OutputPathVerdict(
            mode=MODE_ALLOWED_ROOTS if allowed_output_roots else MODE_UNRESTRICTED,
            writable=False,
            reason=REASON_ROOT_POLICY_UNUSABLE,
            error_code="INVALID_INPUT",
            allowed_roots=[],
        )

    try:
        resolved = policy.resolve_output(output_path, forbid=forbid)
    except TranscriptionError as exc:
        reason = exc.details.get("reason")
        verdict = OutputPathVerdict(
            mode=policy.mode,
            writable=False,
            reason=reason,
            error_code=exc.code,
            allowed_roots=list(policy.roots),
        )
        if reason == "traversal":
            record(
                CHECK_OUTPUT_TRAVERSAL,
                False,
                "output path contains '..' and allowed output roots are enforced",
            )
        else:
            record(CHECK_OUTPUT_TRAVERSAL, True)
        if reason == "would_overwrite_input":
            record(CHECK_OUTPUT_DOES_NOT_OVERWRITE_INPUT, False, exc.message)
        else:
            record_overwrite_skip("no parsed request input to compare the output against")
        if reason in ("traversal", "would_overwrite_input"):
            record(CHECK_OUTPUT_AUTHORIZATION, True)
        else:
            record(CHECK_OUTPUT_AUTHORIZATION, False, f"{exc.code}: {exc.message}")
        return verdict

    # Accepted by the policy: the overwrite-forbid list was enforced inside resolve_output.
    if policy.roots and has_traversal(output_path):
        # Unreachable while OutputPolicy keeps its current contract; surfaces future policy drift.
        record(
            CHECK_OUTPUT_TRAVERSAL,
            False,
            "output path contains '..' and allowed output roots are enforced",
        )
    else:
        record(CHECK_OUTPUT_TRAVERSAL, True)
    record_overwrite_skip("no parsed request input to compare the output against")
    record(CHECK_OUTPUT_AUTHORIZATION, True)
    return OutputPathVerdict(
        mode=policy.mode,
        writable=True,
        resolved_path=resolved,
        allowed_roots=list(policy.roots),
    )


__all__ = [
    "AuditCheck",
    "AuditReport",
    "InputPathVerdict",
    "OutputPathVerdict",
    "RequestVerdict",
    "audit_request",
    "report_to_json",
]
