"""Pure tests for the standup calendar and status categorizer."""

from datetime import date, datetime, timezone

import pytest

from app.services.standup_time import (
    IST,
    is_weekend,
    parse_standup_date,
    previous_working_day,
    to_aware_utc,
    to_ist_date,
    yesterday_window,
)
from app.services.status_category import categorize_status


# 2026-09-14 is a Monday.
@pytest.mark.parametrize(
    "day, expected",
    [
        (date(2026, 9, 14), date(2026, 9, 11)),  # Monday -> Friday
        (date(2026, 9, 15), date(2026, 9, 14)),  # Tuesday -> Monday
        (date(2026, 9, 16), date(2026, 9, 15)),
        (date(2026, 9, 17), date(2026, 9, 16)),
        (date(2026, 9, 18), date(2026, 9, 17)),  # Friday -> Thursday
        (date(2026, 9, 19), date(2026, 9, 18)),  # Saturday -> Friday
        (date(2026, 9, 20), date(2026, 9, 18)),  # Sunday -> Friday
    ],
)
def test_previous_working_day(day, expected):
    assert previous_working_day(day) == expected


def test_weekend_detection():
    assert is_weekend(date(2026, 9, 19))
    assert is_weekend(date(2026, 9, 20))
    assert not is_weekend(date(2026, 9, 18))


def test_window_is_ist_midnight_to_midnight():
    start, end = yesterday_window(date(2026, 9, 16))
    # 00:00 IST is 18:30 UTC the evening before.
    assert start == datetime(2026, 9, 14, 18, 30, tzinfo=timezone.utc)
    assert end == datetime(2026, 9, 15, 18, 30, tzinfo=timezone.utc)


def test_monday_window_covers_the_weekend():
    start, end = yesterday_window(date(2026, 9, 14))
    assert start.astimezone(IST).date() == date(2026, 9, 11)
    assert end.astimezone(IST).date() == date(2026, 9, 14)


def test_naive_datetimes_are_read_as_utc():
    naive = datetime(2026, 9, 15, 12, 0)
    assert to_aware_utc(naive) == datetime(2026, 9, 15, 12, 0, tzinfo=timezone.utc)


def test_iso_strings_and_garbage():
    assert to_aware_utc("2026-09-15T12:00:00Z") == datetime(2026, 9, 15, 12, 0, tzinfo=timezone.utc)
    assert to_aware_utc("not a date") is None
    assert to_aware_utc(None) is None
    assert to_aware_utc(12345) is None


def test_ist_date_of_a_late_utc_timestamp_rolls_forward():
    # 20:00 UTC is 01:30 IST the next day.
    assert to_ist_date(datetime(2026, 9, 15, 20, 0)) == date(2026, 9, 16)
    assert to_ist_date("2026-09-15") == date(2026, 9, 15)


def test_parse_standup_date_rejects_malformed():
    assert parse_standup_date("2026-09-16") == date(2026, 9, 16)
    with pytest.raises(ValueError):
        parse_standup_date("16-09-2026")


@pytest.mark.parametrize(
    "name, expected",
    [
        ("Backlog", "todo"),
        ("Ready to Pick", "todo"),
        ("In Progress", "in_progress"),
        ("Blocked", "blocked"),
        ("Testing", "in_review"),
        ("Done", "done"),
        ("QA", "in_review"),
        ("Code Review", "in_review"),
        ("On Hold", "blocked"),
        ("Closed", "done"),
        (None, "todo"),
        ("Ship it", "todo"),
    ],
)
def test_categorize_status(name, expected):
    assert categorize_status(name) == expected


@pytest.mark.parametrize(
    "day,previous,following",
    [
        (date(2026, 9, 14), date(2026, 9, 11), date(2026, 9, 15)),  # Monday looks back to Friday
        (date(2026, 9, 18), date(2026, 9, 17), date(2026, 9, 21)),  # Friday carries to Monday
        (date(2026, 9, 19), date(2026, 9, 18), date(2026, 9, 21)),  # Saturday: Friday either side
        (date(2026, 9, 20), date(2026, 9, 18), date(2026, 9, 21)),  # Sunday likewise
    ],
)
def test_weekends_are_holidays(day, previous, following):
    from app.services.standup_time import is_weekend, next_working_day, previous_working_day

    assert previous_working_day(day) == previous
    assert next_working_day(day) == following
    assert is_weekend(day) is (day.weekday() >= 5)


def test_standup_dates_follow_ist_not_the_server_clock():
    """22:00 UTC is already the next day in IST (+05:30), which is the day the standup runs."""
    from datetime import datetime, timezone

    from app.services.standup_time import IST, ist_day_start_utc, to_ist_date, yesterday_window

    late_utc = datetime(2026, 9, 17, 22, 0, tzinfo=timezone.utc)
    assert late_utc.astimezone(IST).date() == date(2026, 9, 18)
    assert to_ist_date(late_utc) == date(2026, 9, 18)

    start, end = yesterday_window(date(2026, 9, 18))
    assert start == ist_day_start_utc(date(2026, 9, 17))   # 17th 00:00 IST = 16th 18:30 UTC
    assert end == ist_day_start_utc(date(2026, 9, 18))
    assert start.isoformat() == "2026-09-16T18:30:00+00:00"
