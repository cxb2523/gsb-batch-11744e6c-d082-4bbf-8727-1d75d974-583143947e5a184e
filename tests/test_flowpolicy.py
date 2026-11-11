"""Unit and end-to-end tests for the shared flow-decision policy (flowpolicy + taint sinks).

Every sample is a self-contained local source string: no network access, no credentials, no
third-party packages are required.
"""

from __future__ import annotations

import ast
from pathlib import Path

import pytest

from agent_latch.flowpolicy import (
    LABEL_ALLOWLIST,
    LABEL_PARTIAL,
    LABEL_UNVALIDATED,
    LABEL_VALIDATION_GUARD,
    LABEL_VALIDATOR_CALL,
    ArgumentVerdict,
    FlowDecision,
    ScopeInfo,
    classify_argument,
    evaluate_arguments,
    flatten_text_parts,
)
from agent_latch.rules import scan_project
from agent_latch.taint import (
    analyze_untrusted_flows,
    find_untrusted_memory_writes,
    find_untrusted_prompt_flows,
)


def _scope(source: str, function: str | None = None, sink_line: int | None = None) -> tuple[ast.Module, ScopeInfo]:
    tree = ast.parse(source)
    if function is None:
        nodes = list(tree.body)
    else:
        target = next(
            node
            for node in tree.body
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name == function
        )
        nodes = list(ast.walk(target))
    if sink_line is None:
        sink_line = max(getattr(node, "lineno", 0) for node in nodes)
    return tree, ScopeInfo(nodes, sink_line)


def _call_argument(tree: ast.Module, method: str, position: int = 0) -> ast.AST:
    call = next(
        node
        for node in ast.walk(tree)
        if isinstance(node, ast.Call)
        and isinstance(node.func, ast.Attribute)
        and node.func.attr == method
        and len(node.args) > position
    )
    return call.args[position]


# --------------------------------------------------------------------- form 1: validator call


def test_validator_call_wrapping_argument_is_sanitised() -> None:
    source = (
        "def store(vector_store, page):\n"
        "    vector_store.add_documents([sanitize_documents(page)])\n"
    )
    tree, scope = _scope(source, "store")
    argument = _call_argument(tree, "add_documents")

    verdict = classify_argument(argument, scope)

    assert verdict == ArgumentVerdict(True, LABEL_VALIDATOR_CALL)


def test_dict_argument_with_validated_value_is_sanitised() -> None:
    source = (
        "def remember(memory, page):\n"
        "    memory.save_context({'input': 'note'}, {'output': clean_text(page)})\n"
    )
    tree, scope = _scope(source, "remember")
    argument = _call_argument(tree, "save_context", position=1)

    verdict = classify_argument(argument, scope)

    assert verdict.sanitised and verdict.label == LABEL_VALIDATOR_CALL


# -------------------------------------------------------------- form 2: explicit comparison guard


def test_terminating_validation_guard_is_sanitised() -> None:
    source = (
        "def remember(vector_store, page):\n"
        "    if not is_safe(page):\n"
        "        raise ValueError('unsafe content')\n"
        "    vector_store.add_documents([page])\n"
    )
    tree, scope = _scope(source, "remember")
    argument = _call_argument(tree, "add_documents")

    verdict = classify_argument(argument, scope)

    assert verdict == ArgumentVerdict(True, LABEL_VALIDATION_GUARD)


def test_assert_guard_is_sanitised() -> None:
    source = (
        "def remember(vector_store, page):\n"
        "    assert validate_payload(page)\n"
        "    vector_store.add_documents([page])\n"
    )
    tree, scope = _scope(source, "remember")
    argument = _call_argument(tree, "add_documents")

    verdict = classify_argument(argument, scope)

    assert verdict.sanitised and verdict.label == LABEL_VALIDATION_GUARD


# ------------------------------------------------------------- form 3: allowlist membership check


def test_inline_allowlist_membership_is_sanitised() -> None:
    tree, scope = _scope(
        "def pick(kind):\n"
        "    memory.put(kind if kind in ALLOWED_KINDS else 'default')\n",
        "pick",
    )
    argument = _call_argument(tree, "put")

    verdict = classify_argument(argument, scope)

    assert verdict == ArgumentVerdict(True, LABEL_ALLOWLIST)


def test_terminating_allowlist_guard_is_sanitised() -> None:
    source = (
        "ALLOWED = {'note', 'summary'}\n"
        "def remember(memory, kind, page):\n"
        "    if kind not in ALLOWED:\n"
        "        return\n"
        "    memory.remember(kind, page)\n"
    )
    tree, scope = _scope(source, "remember")
    argument = _call_argument(tree, "remember")

    verdict = classify_argument(argument, scope)

    assert verdict.sanitised and verdict.label == LABEL_ALLOWLIST


# ------------------------------------------------------------ aggregate: partial / none sanitised


def test_partially_sanitised_arguments_keep_a_distinct_label() -> None:
    source = (
        "def remember(memory, page, note):\n"
        "    memory.add_texts(sanitize_documents(page), note)\n"
    )
    tree, scope = _scope(source, "remember")
    call = next(
        node
        for node in ast.walk(tree)
        if isinstance(node, ast.Call)
        and isinstance(node.func, ast.Attribute)
        and node.func.attr == "add_texts"
    )

    decision = evaluate_arguments(call.args, scope)

    assert isinstance(decision, FlowDecision)
    assert decision.sanitised is False
    assert decision.label == LABEL_PARTIAL
    assert [verdict.sanitised for verdict in decision.verdicts] == [True, False]


def test_partial_sanitisation_inside_one_container_is_detected_at_part_level() -> None:
    source = (
        "def remember(memory, page, note):\n"
        "    memory.add_texts([sanitize_documents(page), note])\n"
    )
    tree, scope = _scope(source, "remember")
    call = next(
        node
        for node in ast.walk(tree)
        if isinstance(node, ast.Call)
        and isinstance(node.func, ast.Attribute)
        and node.func.attr == "add_texts"
    )
    parts = [part for argument in call.args for part in flatten_text_parts(argument)]

    decision = evaluate_arguments(parts, scope)

    assert decision.sanitised is False and decision.label == LABEL_PARTIAL


def test_fully_unvalidated_arguments_are_reported_as_unvalidated() -> None:
    source = (
        "def remember(memory, page, note):\n"
        "    memory.add_texts([page, note])\n"
    )
    tree, scope = _scope(source, "remember")
    call = next(
        node
        for node in ast.walk(tree)
        if isinstance(node, ast.Call)
        and isinstance(node.func, ast.Attribute)
        and node.func.attr == "add_texts"
    )

    decision = evaluate_arguments(call.args, scope)

    assert decision.sanitised is False
    assert decision.label == LABEL_UNVALIDATED
    assert all(verdict.label == LABEL_UNVALIDATED for verdict in decision.verdicts)


# --------------------------------------------- looks sanitised but ineffective: discarded results


def test_discarded_validator_result_is_not_sanitisation() -> None:
    source = (
        "def remember(vector_store, page):\n"
        "    sanitize_documents(page)\n"
        "    vector_store.add_documents([page])\n"
    )
    tree, scope = _scope(source, "remember")
    argument = _call_argument(tree, "add_documents")

    verdict = classify_argument(argument, scope)

    assert verdict == ArgumentVerdict(False, LABEL_UNVALIDATED)


def test_discarded_predicate_result_is_not_sanitisation() -> None:
    source = (
        "def remember(vector_store, page):\n"
        "    is_safe(page)\n"
        "    vector_store.add_documents([page])\n"
    )
    tree, scope = _scope(source, "remember")
    argument = _call_argument(tree, "add_documents")

    verdict = classify_argument(argument, scope)

    assert verdict.sanitised is False


def test_non_terminating_guard_does_not_protect_the_sink() -> None:
    source = (
        "def remember(vector_store, page):\n"
        "    if is_safe(page):\n"
        "        log('ok')\n"
        "    vector_store.add_documents([page])\n"
    )
    tree, scope = _scope(source, "remember")
    argument = _call_argument(tree, "add_documents")

    verdict = classify_argument(argument, scope)

    assert verdict.sanitised is False


def test_guard_after_the_sink_does_not_protect_it() -> None:
    source = (
        "def remember(vector_store, page):\n"
        "    vector_store.add_documents([page])\n"
        "    if not is_safe(page):\n"
        "        raise ValueError('too late')\n"
    )
    tree, _ = _scope(source, "remember", sink_line=2)
    argument = _call_argument(tree, "add_documents")
    scope = ScopeInfo(
        [node for node in ast.walk(tree) if getattr(node, "lineno", 0) < 2],
        2,
    )

    verdict = classify_argument(argument, scope)

    assert verdict.sanitised is False


def test_sanitised_result_reassigned_then_used_in_fstring_is_sanitised() -> None:
    source = (
        "def remember(memory, page):\n"
        "    safe = sanitize_documents(page)\n"
        "    memory.add_texts([f'note: {safe}'])\n"
    )
    tree, base = _scope(source, "remember")
    argument = _call_argument(tree, "add_texts")
    scope = ScopeInfo(base.nodes, base.sink_lineno, frozenset({"safe"}))

    verdict = classify_argument(argument, scope)

    assert verdict.sanitised and verdict.label == LABEL_VALIDATOR_CALL


def test_mixing_sanitised_and_raw_names_in_one_expression_is_unvalidated() -> None:
    source = (
        "def remember(memory, page, extra):\n"
        "    safe = sanitize_documents(page)\n"
        "    memory.add_texts([f'{safe} {extra}'])\n"
    )
    tree, base = _scope(source, "remember")
    argument = _call_argument(tree, "add_texts")
    scope = ScopeInfo(base.nodes, base.sink_lineno, frozenset({"safe"}))

    verdict = classify_argument(argument, scope)

    assert verdict.sanitised is False


def test_allowlist_guard_protects_fstring_use() -> None:
    source = (
        "def remember(memory, kind):\n"
        "    if kind not in SAFE_KINDS:\n"
        "        raise ValueError('blocked')\n"
        "    memory.remember(f'kind={kind}')\n"
    )
    tree, scope = _scope(source, "remember")
    argument = _call_argument(tree, "remember")

    verdict = classify_argument(argument, scope)

    assert verdict.sanitised and verdict.label == LABEL_ALLOWLIST


# --------------------------------------------------------------------------- end-to-end via taint


_E2E_SOURCE = (
    "from langchain_community.document_loaders import WebBaseLoader\n"
    "def ingest_unchecked(vector_store, url):\n"
    "    docs = WebBaseLoader(url).load()\n"
    "    vector_store.add_documents(docs)\n"
    "def ingest_cleaned(vector_store, url):\n"
    "    docs = WebBaseLoader(url).load()\n"
    "    vector_store.add_documents(sanitize_documents(docs))\n"
    "def ingest_guarded(vector_store, url):\n"
    "    docs = WebBaseLoader(url).load()\n"
    "    if not is_safe(docs):\n"
    "        raise ValueError('blocked')\n"
    "    vector_store.add_documents(docs)\n"
    "def ingest_partial(vector_store, url):\n"
    "    docs = WebBaseLoader(url).load()\n"
    "    meta = WebBaseLoader(url).load()\n"
    "    vector_store.add_documents([sanitize_documents(docs), meta])\n"
)


def test_webbaseloader_to_vector_store_e2e_labels() -> None:
    tree = ast.parse(_E2E_SOURCE)

    flows = find_untrusted_memory_writes(tree)

    assert [(flow.line, flow.label) for flow in flows] == [
        (4, LABEL_UNVALIDATED),
        (16, LABEL_PARTIAL),
    ]
    assert all(flow.sink == "vector_store.add_documents()" for flow in flows)


def test_analyze_and_prompt_entry_points_share_the_policy() -> None:
    tree = ast.parse(_E2E_SOURCE)

    analyzed = analyze_untrusted_flows(tree)

    assert analyzed.memories == find_untrusted_memory_writes(tree)
    # The guarded and cleaned ingests are fully mitigated, so no prompt flow appears either when
    # the same values reach a message sink.
    prompt_tree = ast.parse(
        "from langchain_community.document_loaders import WebBaseLoader\n"
        "def build(url):\n"
        "    docs = WebBaseLoader(url).load()\n"
        "    safe = sanitize_documents(docs)\n"
        "    return [HumanMessage(content=safe)]\n"
    )
    assert find_untrusted_prompt_flows(prompt_tree) == []
    # ... while an unmitigated message still fires, and the literal-tag fallback stays intact.
    raw_tree = ast.parse(
        "from langchain_community.document_loaders import WebBaseLoader\n"
        "def build(url):\n"
        "    docs = WebBaseLoader(url).load()\n"
        "    return [HumanMessage(content=docs)]\n"
        "def fenced(url):\n"
        "    docs = WebBaseLoader(url).load()\n"
        "    return [HumanMessage(content=f'<page>{docs}</page>')]\n"
    )
    raw_flows = find_untrusted_prompt_flows(raw_tree)
    assert [flow.line for flow in raw_flows] == [4]


def test_scan_project_reports_one_unvalidated_and_one_partial_write(tmp_path: Path) -> None:
    (tmp_path / "agent.py").write_text(_E2E_SOURCE, encoding="utf-8")

    findings = [item for item in scan_project(tmp_path) if item.rule_id == "ALR13-S01"]

    assert [item.line for item in findings] == [4, 16]
    assert LABEL_UNVALIDATED in findings[0].evidence
    assert LABEL_PARTIAL in findings[1].evidence


def test_discarded_validation_call_still_flagged_end_to_end() -> None:
    tree = ast.parse(
        "import requests\n"
        "def remember(memory, url):\n"
        "    page = requests.get(url).text\n"
        "    validate_memory_entry(page)\n"
        "    memory.save_context({'input': 'note'}, {'output': page})\n"
    )

    [flow] = find_untrusted_memory_writes(tree)

    assert flow.label == LABEL_UNVALIDATED


def test_public_entry_point_signatures_and_return_types_unchanged() -> None:
    tree = ast.parse("x = 1\n")
    assert analyze_untrusted_flows(tree).prompts == []
    assert analyze_untrusted_flows(tree).memories == []
    assert find_untrusted_prompt_flows(tree) == []
    assert find_untrusted_memory_writes(tree) == []


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-v"]))
