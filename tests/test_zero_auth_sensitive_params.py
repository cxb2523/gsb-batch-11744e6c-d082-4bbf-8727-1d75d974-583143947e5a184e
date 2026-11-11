"""Zero-auth grading: sensitive input-parameter evidence dimension.

Covers grade_zero_auth_response in mcp_authscan.scanner with locally built
fake response objects (no network): write-verb tool names, required sensitive
params, non-required sensitive params, and malformed inputSchema shapes.
"""
import pytest

from mcp_authscan.scanner import RiskLevel, grade_zero_auth_response

pytestmark = pytest.mark.timeout(30)

DISCLAIMER = "body not inspected for record-level data"


class _Resp:
    """Minimal stand-in for a requests.Response: only .json() is used."""

    def __init__(self, doc):
        self._doc = doc

    def json(self):
        return self._doc


def _grade(doc):
    return grade_zero_auth_response(_Resp(doc))


def _tools_payload(tools):
    return {"result": {"tools": tools}}


def test_write_verb_tool_is_critical_and_notes_sensitive_params():
    doc = _tools_payload([{
        "name": "delete_record",
        "inputSchema": {
            "type": "object",
            "properties": {"path": {"type": "string"}},
            "required": ["path"],
        },
    }])
    level, basis = _grade(doc)
    assert level is RiskLevel.CRITICAL
    assert "delete" in basis
    assert "'path'" in basis
    assert "required" in basis
    assert DISCLAIMER in basis


def test_write_verb_tool_without_sensitive_params_says_none_observed():
    doc = _tools_payload([{"name": "run_report", "inputSchema": {"properties": {}}}])
    level, basis = _grade(doc)
    assert level is RiskLevel.CRITICAL
    assert "no sensitive input parameters observed" in basis
    assert DISCLAIMER in basis


def test_required_sensitive_param_is_high_and_names_param():
    doc = _tools_payload([{
        "name": "fetch_data",
        "inputSchema": {
            "properties": {"query": {"type": "string"}, "limit": {"type": "integer"}},
            "required": ["query"],
        },
    }])
    level, basis = _grade(doc)
    assert level is RiskLevel.HIGH
    assert "'query'" in basis
    assert "declared as required" in basis
    assert DISCLAIMER in basis


def test_optional_sensitive_param_is_high_and_notes_not_required():
    doc = _tools_payload([{
        "name": "fetch_data",
        "input_schema": {  # fallback key when inputSchema is absent
            "properties": {"url": {"type": "string"}},
        },
    }])
    level, basis = _grade(doc)
    assert level is RiskLevel.HIGH
    assert "'url'" in basis
    assert "present but not required" in basis
    assert DISCLAIMER in basis


def test_tools_without_sensitive_params_stay_high():
    doc = _tools_payload([{"name": "list_items"}, {"name": "get_status"}])
    level, basis = _grade(doc)
    assert level is RiskLevel.HIGH
    assert "none with a write" in basis
    assert DISCLAIMER in basis


@pytest.mark.parametrize("tool", [
    {"name": "fetch_data", "inputSchema": "not-a-dict"},
    {"name": "fetch_data", "inputSchema": ["query"]},
    {"name": "fetch_data", "inputSchema": {"properties": ["query"]}},
    {"name": "fetch_data", "inputSchema": {"properties": {"query": {}}, "required": "query"}},
    {"name": "fetch_data", "inputSchema": {"properties": {"query": {}}, "required": [1, None]}},
    {"name": 12345, "inputSchema": {"properties": {"cmd": {}}, "required": ["cmd"]}},
])
def test_malformed_schema_does_not_raise_and_stays_high(tool):
    level, basis = _grade(_tools_payload([tool]))
    assert level is RiskLevel.HIGH
    assert DISCLAIMER in basis


@pytest.mark.parametrize("tools", [
    "not-a-list",
    42,
    [{"name": "x"}, "not-a-dict", None, 7],
])
def test_malformed_tools_shape_is_robust(tools):
    level, basis = _grade(_tools_payload(tools))
    if isinstance(tools, list) and tools:
        # non-dict elements are skipped; remaining tools carry no write verb
        assert level is RiskLevel.HIGH
    else:
        assert level is RiskLevel.MEDIUM
    assert DISCLAIMER in basis


def test_unparseable_body_is_medium():
    class _BadResp:
        def json(self):
            raise ValueError("no json")

    level, basis = grade_zero_auth_response(_BadResp())
    assert level is RiskLevel.MEDIUM
    assert "did not parse" in basis
    assert DISCLAIMER in basis
