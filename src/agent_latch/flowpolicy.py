"""Reusable flow-decision policy for deciding whether untrusted data is sanitised.

The taint engine (:mod:`agent_latch.taint`) only tracks *where* untrusted data flows; this
module decides whether a value reaching a sink has been genuinely validated or sanitised.
Both the message sink (AG003) and the memory/vector-store sink (ALR13-S01) share the same
policy, so sanitiser semantics cannot drift between them.

Three mitigation shapes are recognised:

1. ``validator-call`` -- the value is produced by a call whose name matches the validation
   regex (``validate``/``sanitise``/``filter``/``clean`` ...). A validation call whose result
   is discarded is *not* mitigation: the sanitised value never reaches the sink.
2. ``validation-guard`` -- the value is checked before use and the check aborts the flow when
   it fails, e.g. ``if not is_safe(x): raise`` or ``assert is_safe(x)``. A guard that falls
   through (``if is_safe(x): ...`` with no else / no raise) does not protect the sink.
3. ``allowlist-membership`` -- the value is proven to belong to a whitelist set, either inline
   (``x in ALLOWED_TYPES``) or in a terminating guard (``if x not in ALLOWED: raise``).

Everything here is a pure function of the argument AST nodes and the enclosing scope: no
analysis state, I/O or execution of the scanned code.
"""

from __future__ import annotations

import ast
import re
from dataclasses import dataclass

# A value passed through a validating or sanitising helper is treated as mitigated.
VALIDATION_NAME = re.compile(r"(?i)validat|saniti|sanitiz|sanitise|filter|clean")
# Predicate-style checks (is_safe(x), check_allowed(x)) only count when their result drives
# a guard, since calling them as statements has no effect on the value.
GUARD_PREDICATE = re.compile(r"(?i)^(is_|has_|check|verify|ensure|allow|permit|guard)")
# Names that look like whitelists / allowlists.
_ALLOWLIST_NAME = re.compile(r"(?i)allow|white|safe|permit|valid|trusted")
_TERMINATORS = (ast.Raise, ast.Return)

# Verdict labels. ``unvalidated`` keeps the historical memory-sink wording.
LABEL_UNVALIDATED = "unvalidated"
LABEL_PARTIAL = "partially-validated"
LABEL_VALIDATOR_CALL = "validator-call"
LABEL_VALIDATION_GUARD = "validation-guard"
LABEL_ALLOWLIST = "allowlist-membership"


@dataclass(frozen=True)
class ScopeInfo:
    """Static context in which a sink call is checked.

    ``nodes`` are the statements of the enclosing scope (excluding nested function bodies),
    in source order; ``sink_lineno`` is the line of the sink call so only earlier guards can
    protect it; ``sanitised_names`` are variables whose current value is the result of a
    validator call (``safe = sanitize(x)``).
    """

    nodes: list[ast.AST]
    sink_lineno: int
    sanitised_names: frozenset[str] = frozenset()


@dataclass(frozen=True)
class ArgumentVerdict:
    """Whether one text-bearing value is sanitised, and why."""

    sanitised: bool
    label: str


@dataclass(frozen=True)
class FlowDecision:
    """Aggregate verdict for every text-bearing argument of one sink call."""

    sanitised: bool
    label: str
    verdicts: tuple[ArgumentVerdict, ...]


def _dotted(node: ast.AST | None) -> str:
    if isinstance(node, ast.Name):
        return node.id
    if isinstance(node, ast.Attribute):
        base = _dotted(node.value)
        return f"{base}.{node.attr}" if base else node.attr
    return ""


def _call_name(node: ast.AST) -> str:
    return _dotted(node.func) if isinstance(node, ast.Call) else ""


def _names(node: ast.AST) -> set[str]:
    return {part.id for part in ast.walk(node) if isinstance(part, ast.Name)}


def _checked_names(expr: ast.AST) -> set[str]:
    """Variables a guard actually constrains: a predicate's arguments, not its function name."""
    if isinstance(expr, ast.Call):
        result = {
            name
            for argument in (*expr.args, *(keyword.value for keyword in expr.keywords))
            for name in _names(argument)
        }
        return result or _names(expr)
    return _names(expr)


def _is_validator_call(node: ast.AST) -> bool:
    return isinstance(node, ast.Call) and bool(VALIDATION_NAME.search(_call_name(node)))


def _is_predicate_call(node: ast.AST) -> bool:
    if not isinstance(node, ast.Call):
        return False
    name = _call_name(node).rsplit(".", 1)[-1]
    return bool(name) and (bool(VALIDATION_NAME.search(name)) or bool(GUARD_PREDICATE.match(name)))


def _is_allowlist_name(node: ast.AST) -> bool:
    if isinstance(node, ast.Name):
        return bool(_ALLOWLIST_NAME.search(node.id))
    if isinstance(node, ast.Attribute):
        return bool(_ALLOWLIST_NAME.search(node.attr))
    return False


def _membership(test: ast.AST) -> tuple[ast.AST, ast.AST] | None:
    """``x in ALLOWED`` / ``x not in ALLOWED`` as (member expression, container expression)."""
    if not isinstance(test, ast.Compare) or len(test.ops) != 1 or len(test.comparators) != 1:
        return None
    if not isinstance(test.ops[0], (ast.In, ast.NotIn)):
        return None
    container = test.comparators[0]
    return test.left, container if _is_allowlist_name(container) else None


def _terminates(body: list[ast.stmt]) -> bool:
    """Whether a branch leaves the scope (raise/return) instead of falling through."""
    return any(isinstance(stmt, _TERMINATORS) for stmt in body)


def _atoms(test: ast.AST, positive: bool) -> list[tuple[bool, str, ast.AST]]:
    """Flatten a boolean test into (polarity, label, checked expression) atoms."""
    if isinstance(test, ast.BoolOp) and isinstance(test.op, ast.And):
        return [atom for value in test.values for atom in _atoms(value, positive)]
    if isinstance(test, ast.BoolOp) and isinstance(test.op, ast.Or):
        return [atom for value in test.values for atom in _atoms(value, positive)]
    if isinstance(test, ast.UnaryOp) and isinstance(test.op, ast.Not):
        return _atoms(test.operand, not positive)
    if _is_predicate_call(test):
        return [(positive, LABEL_VALIDATION_GUARD, test)]
    if isinstance(test, ast.Compare) and len(test.ops) == 1 and len(test.comparators) == 1:
        op = test.ops[0]
        if isinstance(op, (ast.In, ast.NotIn)):
            container = test.comparators[0]
            if _is_allowlist_name(container):
                # ``x not in ALLOWED`` is a negative check that needs a terminating branch.
                return [(positive ^ isinstance(op, ast.NotIn), LABEL_ALLOWLIST, test.left)]
        # is_safe(x) == False / is_safe(x) is None -> a failed check, polarity flipped.
        comparator = test.comparators[0]
        if _is_predicate_call(test.left) and isinstance(comparator, ast.Constant):
            flipped = comparator.value in (False, None)
            return [(positive ^ flipped, LABEL_VALIDATION_GUARD, test.left)]
    return []


def _guards(scope: ScopeInfo) -> list[tuple[set[str], str]]:
    """Guards established before the sink line: protected name set and the mitigation label."""
    guards: list[tuple[set[str], str]] = []
    for node in scope.nodes:
        line = getattr(node, "lineno", 0)
        if line and line >= scope.sink_lineno:
            break
        if isinstance(node, ast.Assert) and node.test is not None:
            for positive, label, expr in _atoms(node.test, True):
                if positive:
                    guards.append((_checked_names(expr), label))
        elif isinstance(node, ast.If):
            atoms = _atoms(node.test, True)
            if not atoms:
                continue
            negative = [atom for atom in atoms if not atom[0]]
            positive = [atom for atom in atoms if atom[0]]
            # ``if <bad case>: raise/return`` -- the rest of the scope only runs when safe.
            if negative and _terminates(node.body):
                for _, label, expr in negative:
                    guards.append((_checked_names(expr), label))
            # ``if <safe case>: ... raise/return inside`` -- unsafe values still flow on, so no.
            elif positive and _terminates(node.body) and not node.orelse:
                continue
            elif positive and node.orelse and _terminates(node.orelse):
                for _, label, expr in positive:
                    guards.append((_checked_names(expr), label))
    return guards


def flatten_text_parts(argument: ast.AST) -> list[ast.AST]:
    """Text-bearing sub-expressions of one sink argument.

    Container literals (lists, tuples, sets, dicts) are unpacked so that a dict argument such
    as ``{'output': page}`` is judged on its values rather than as an opaque blob.
    """
    if isinstance(argument, ast.Starred):
        return flatten_text_parts(argument.value)
    if isinstance(argument, (ast.List, ast.Tuple, ast.Set)):
        return [part for element in argument.elts for part in flatten_text_parts(element)]
    if isinstance(argument, ast.Dict):
        return [
            part
            for value in argument.values
            for part in (flatten_text_parts(value) if value is not None else [])
        ]
    return [argument]


def _inline_verdict(expr: ast.AST, scope: ScopeInfo) -> ArgumentVerdict | None:
    """Mitigation visible inside the expression itself (forms 1 and the inline form of 3)."""
    # A variable that holds the result of an earlier validator call (safe = sanitize(x)).
    if (
        isinstance(expr, (ast.Name, ast.Attribute))
        and _dotted(expr) in scope.sanitised_names
    ):
        return ArgumentVerdict(True, LABEL_VALIDATOR_CALL)
    for node in ast.walk(expr):
        if _is_validator_call(node):
            return ArgumentVerdict(True, LABEL_VALIDATOR_CALL)
        member = _membership(node)
        if member is not None and member[1] is not None:
            return ArgumentVerdict(True, LABEL_ALLOWLIST)
    return None


def classify_argument(argument: ast.AST, scope: ScopeInfo) -> ArgumentVerdict:
    """Pure verdict for one sink argument: sanitised or not, with a short evidence label."""
    labels: set[str] = set()
    for expr in flatten_text_parts(argument):
        inline = _inline_verdict(expr, scope)
        if inline is not None:
            labels.add(inline.label)
            continue
        referenced = _names(expr)
        # Every variable the expression reads holds an earlier validator result.
        if referenced and referenced.issubset(scope.sanitised_names):
            labels.add(LABEL_VALIDATOR_CALL)
            continue
        for guard_names, label in _guards(scope):
            if guard_names and guard_names.issubset(referenced):
                labels.add(label)
                break
        else:
            return ArgumentVerdict(False, LABEL_UNVALIDATED)
    label = next(iter(labels)) if len(labels) == 1 else LABEL_VALIDATOR_CALL
    return ArgumentVerdict(True, label)


def evaluate_arguments(arguments: list[ast.AST], scope: ScopeInfo) -> FlowDecision:
    """Evaluate every text-bearing argument of a sink call.

    All sanitised -> the flow is fully mitigated; none sanitised -> ``unvalidated``; a mix ->
    still reportable but labelled ``partially-validated``.
    """
    verdicts = tuple(classify_argument(argument, scope) for argument in arguments)
    if not verdicts:
        return FlowDecision(True, LABEL_VALIDATOR_CALL, verdicts)
    sanitised = [verdict for verdict in verdicts if verdict.sanitised]
    if len(sanitised) == len(verdicts):
        labels = {verdict.label for verdict in verdicts}
        label = next(iter(labels)) if len(labels) == 1 else LABEL_VALIDATOR_CALL
        return FlowDecision(True, label, verdicts)
    label = LABEL_PARTIAL if sanitised else LABEL_UNVALIDATED
    return FlowDecision(False, label, verdicts)
