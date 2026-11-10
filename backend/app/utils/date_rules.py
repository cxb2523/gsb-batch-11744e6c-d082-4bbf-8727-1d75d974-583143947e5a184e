"""Server-side validation for ticket due/start dates.

These rules used to live only in the browser (CreateIssueModal), so the API
accepted values the UI rejects — a due date in the past, a due date before the
start date, or a missing due date on a non-epic. This module is the single home
for the rules; the ticket/subtask handlers call it so the logic is not duplicated.

Two kinds of rule:

* **Invariant** — a due date must not fall before its start date. This is always
  wrong, so it is enforced on every write path (including CSV import).
* **Workflow** — a due date can't be set in the past, and a non-epic needs a due
  date. (A start date may be backdated: work can have begun before it was logged.)
  These apply to interactive create/update only; the import path may legitimately
  bring in historical or overdue tickets and is exempt.

Messages are kept identical to the frontend so the API errors read the same.
"""

from __future__ import annotations

from datetime import date, datetime

MSG_DUE_REQUIRED = "Due date is required"
MSG_DUE_IN_PAST = "Due date cannot be in the past"
MSG_DUE_BEFORE_START = "Due date cannot be before the start date"


def to_date(value) -> date | None:
    """Coerce a due/start value to a calendar date.

    Tickets store these as datetimes, subtasks as ``YYYY-MM-DD`` strings, and the
    DB hands back datetimes — accept all three and compare at day granularity, which
    is what a due date means.
    """
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    if isinstance(value, str):
        s = value.strip()
        if not s:
            return None
        try:
            return date.fromisoformat(s[:10])
        except ValueError:
            return None
    return None


def same_date(a, b) -> bool:
    """Whether two due/start values point at the same calendar day (or are both unset)."""
    return to_date(a) == to_date(b)


def due_before_start_error(due_value, start_value) -> str | None:
    """Invariant check: reject a due date that precedes its start date."""
    d, s = to_date(due_value), to_date(start_value)
    if d is not None and s is not None and d < s:
        return MSG_DUE_BEFORE_START
    return None


def not_in_past_error(due_value, *, today: date | None = None) -> str | None:
    """Workflow check: reject a due date set in the past.

    A start date is intentionally not checked — work can have begun before it was
    logged, so backdating it is allowed. Callers pass only the value actually being
    set, so an unchanged historical due date that has merely slipped into the past is
    never re-rejected.
    """
    today = today or date.today()
    d = to_date(due_value)
    if d is not None and d < today:
        return MSG_DUE_IN_PAST
    return None
