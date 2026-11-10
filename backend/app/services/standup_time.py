"""Calendar helpers for the daily standup, all in IST.

The standup runs on Indian working days, so "yesterday" is the previous working
day in Asia/Kolkata, not the previous UTC calendar day — a UTC day would start
"yesterday" at 05:30 IST and drop the evening's work into the wrong column.

Windows are half-open [start, end) and returned as timezone-aware UTC, which is
what Mongo stores. The Mongo client is not tz-aware, so every datetime read back
must go through `to_aware_utc` before it is compared with these bounds.
"""

from datetime import date, datetime, time, timedelta, timezone
from typing import Any, Optional, Tuple
from zoneinfo import ZoneInfo

IST = ZoneInfo("Asia/Kolkata")

# Monday=0 ... Sunday=6
_SATURDAY = 5
_SUNDAY = 6


def ist_now() -> datetime:
    return datetime.now(IST)


def ist_today() -> date:
    return ist_now().date()


def is_weekend(day: date) -> bool:
    return day.weekday() in (_SATURDAY, _SUNDAY)


def previous_working_day(day: date) -> date:
    """The working day before `day`: Monday, Saturday and Sunday all look back to Friday."""
    candidate = day - timedelta(days=1)
    while is_weekend(candidate):
        candidate -= timedelta(days=1)
    return candidate


def next_working_day(day: date) -> date:
    candidate = day + timedelta(days=1)
    while is_weekend(candidate):
        candidate += timedelta(days=1)
    return candidate


def ist_day_start_utc(day: date) -> datetime:
    """00:00 IST on `day`, expressed as an aware UTC datetime."""
    return datetime.combine(day, time.min, tzinfo=IST).astimezone(timezone.utc)


def yesterday_window(standup_date: date) -> Tuple[datetime, datetime]:
    """[start of previous working day, start of standup day) in UTC.

    On a Monday this spans Friday 00:00 to Monday 00:00 IST, so anything done over
    the weekend is still reported rather than silently falling between days.
    """
    return ist_day_start_utc(previous_working_day(standup_date)), ist_day_start_utc(standup_date)


def to_aware_utc(value: Any) -> Optional[datetime]:
    """Normalise a stored timestamp to an aware UTC datetime, or None if unreadable.

    Mongo returns naive datetimes that are already UTC; legacy rows sometimes hold
    ISO strings. Naive values are stamped as UTC, never interpreted as local time.
    """
    if value is None:
        return None
    if isinstance(value, datetime):
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)
    if isinstance(value, str):
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None
        return to_aware_utc(parsed)
    return None


def to_ist_date(value: Any) -> Optional[date]:
    """The IST calendar date of a stored timestamp or date string (used for due dates)."""
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    if isinstance(value, str) and len(value) == 10:
        try:
            return date.fromisoformat(value)
        except ValueError:
            return None
    aware = to_aware_utc(value)
    return aware.astimezone(IST).date() if aware else None


def parse_standup_date(raw: Optional[str]) -> date:
    """Parse a YYYY-MM-DD query value; raises ValueError on a malformed value."""
    if not raw:
        return ist_today()
    return date.fromisoformat(raw)
