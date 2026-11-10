"""Map a workflow status name onto a small, fixed set of categories.

Statuses carry no category field, so every surface that needs "is this done?" has
been matching names by hand, each with a different keyword list. This is the one
used by the standup board. It is deliberately pure: callers pass a name, get a
category, and always display the raw name — a custom status that lands in the
wrong bucket is never misreported, only mis-sorted.
"""

from typing import Literal, Optional

StatusCategory = Literal["done", "blocked", "in_review", "in_progress", "todo"]

_DONE_NAMES = {"done", "completed", "complete", "closed", "resolved", "released", "shipped"}
_BLOCKED_HINTS = ("block", "on hold", "waiting", "stuck")
_REVIEW_HINTS = ("test", "qa", "review", "verify", "uat", "staging")
_PROGRESS_HINTS = ("progress", "doing", "develop", "active", "working", "wip")


def categorize_status(name: Optional[str]) -> StatusCategory:
    """Return the category for a status name; unknown names are treated as not started."""
    normalized = (name or "").strip().lower()
    if normalized in _DONE_NAMES or normalized.startswith("done"):
        return "done"
    if any(hint in normalized for hint in _BLOCKED_HINTS):
        return "blocked"
    if any(hint in normalized for hint in _REVIEW_HINTS):
        return "in_review"
    if any(hint in normalized for hint in _PROGRESS_HINTS):
        return "in_progress"
    return "todo"


def is_backlog(name: Optional[str]) -> bool:
    """Backlog is "not started and not planned" — kept out of the standup entirely."""
    return "backlog" in (name or "").strip().lower()
