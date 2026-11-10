"""Single source of truth for ticket/issue priority values.

The app standardises on four priorities — Urgent, High, Medium, Low. Older data (and
some integrations) used a parallel P0/P1/P2 scale; those are normalized on write and by
the one-off migration (migrate_normalize_priorities.py):

    p0 -> urgent, p1 -> high, p2 -> medium

Anything unrecognised falls back to "medium".
"""

from typing import Optional

# Canonical values, ordered most → least severe.
PRIORITIES = ["urgent", "high", "medium", "low"]

# Severity rank for sorting (lower = more severe).
PRIORITY_RANK = {p: i for i, p in enumerate(PRIORITIES)}

# Legacy / alias values mapped onto the canonical scale.
LEGACY_PRIORITY_MAP = {
    "p0": "urgent",
    "p1": "high",
    "p2": "medium",
    "highest": "urgent",
    "critical": "urgent",
    "normal": "medium",
}

DEFAULT_PRIORITY = "medium"


def normalize_priority(value: Optional[str]) -> Optional[str]:
    """Coerce any incoming priority to a canonical value.

    Returns None for None/empty (callers decide whether to apply a default), maps legacy
    aliases, and falls back to DEFAULT_PRIORITY for anything unrecognised.
    """
    if value is None:
        return None
    v = str(value).strip().lower()
    if not v:
        return None
    if v in PRIORITY_RANK:
        return v
    return LEGACY_PRIORITY_MAP.get(v, DEFAULT_PRIORITY)
