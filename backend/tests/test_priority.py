"""Unit tests for priority normalization (the shared source of truth)."""

from app.core.priority import normalize_priority, PRIORITIES, PRIORITY_RANK


def test_canonical_values_pass_through():
    for p in PRIORITIES:
        assert normalize_priority(p) == p
        assert normalize_priority(p.upper()) == p


def test_legacy_p_scale_maps():
    assert normalize_priority("p0") == "urgent"
    assert normalize_priority("p1") == "high"
    assert normalize_priority("p2") == "medium"
    assert normalize_priority("P2") == "medium"


def test_aliases_and_unknown():
    assert normalize_priority("critical") == "urgent"
    assert normalize_priority("highest") == "urgent"
    assert normalize_priority("normal") == "medium"
    assert normalize_priority("whatever") == "medium"  # unknown -> default


def test_empty_is_none():
    assert normalize_priority(None) is None
    assert normalize_priority("") is None
    assert normalize_priority("   ") is None


def test_rank_is_severity_ordered():
    assert PRIORITY_RANK["urgent"] < PRIORITY_RANK["high"] < PRIORITY_RANK["medium"] < PRIORITY_RANK["low"]
