"""Cursor paging on the ticket and epic lists.

The interesting cases are the ones an offset-based pager gets wrong: rows
sharing a sort key, and the collection changing underneath someone who is
part-way through. Both are checked here, because both fail silently — a
duplicated or skipped row looks like ordinary data.
"""

from datetime import datetime, timedelta, timezone

import pytest

pytestmark = pytest.mark.anyio

PROJECT = 1
BACKLOG = 101
BASE = datetime(2026, 1, 1, 12, 0, 0, tzinfo=timezone.utc)


async def seed(db):
    await db.projects.insert_one({"project_number": PROJECT, "key": "WEB", "name": "Website"})
    await db.ticket_statuses.insert_one(
        {"status_number": BACKLOG, "project_id": PROJECT, "name": "Backlog", "position": 1}
    )


async def add_ticket(db, number, created_at=None, **overrides):
    doc = {
        "ticket_number": number,
        "project_id": PROJECT,
        "key": f"WEB-{number}",
        "title": f"Ticket {number}",
        "type": "task",
        "status_id": BACKLOG,
        "priority": "medium",
        "labels": [],
        "epic_id": None,
        "parent_id": None,
        "sprint_id": None,
        # Distinct by default, newest first means highest number first.
        "created_at": created_at or (BASE + timedelta(minutes=number)),
    }
    doc.update(overrides)
    await db.tickets.insert_one(doc)
    return doc


async def add_epic(db, number, position):
    await db.tickets.insert_one({
        "ticket_number": number,
        "project_id": PROJECT,
        "key": f"WEB-E{position}",
        "title": f"Epic {position}",
        "type": "epic",
        "status_id": BACKLOG,
        "epic_position": position,
        "created_at": BASE,
    })


async def page(api, path=f"/projects/{PROJECT}/tickets", **params):
    resp = await api.get(path, params=params)
    assert resp.status_code == 200, resp.text
    return resp.json()


async def walk(api, path=f"/projects/{PROJECT}/tickets", **params):
    """Follow every page, returning the ids in the order they arrived."""
    seen = []
    cursor = None
    for _ in range(50):  # a bound, so a cursor that never advances fails loudly
        body = await page(api, path, **params, **({"cursor": cursor} if cursor else {}))
        seen.extend(item["id"] for item in body["items"])
        cursor = body["next_cursor"]
        if not cursor:
            return seen
    raise AssertionError("paging did not terminate")


async def test_without_limit_the_response_is_still_a_bare_list(api, mongo_db):
    """The contract every existing caller depends on."""
    await seed(mongo_db)
    await add_ticket(mongo_db, 1)

    body = (await api.get(f"/projects/{PROJECT}/tickets")).json()

    assert isinstance(body, list)
    assert body[0]["id"] == 1


async def test_limit_returns_a_page_envelope(api, mongo_db):
    await seed(mongo_db)
    for number in range(1, 6):
        await add_ticket(mongo_db, number)

    body = await page(api, limit=2)

    assert [t["id"] for t in body["items"]] == [5, 4]
    assert body["total"] == 5
    assert body["next_cursor"]


async def test_paging_visits_every_row_exactly_once(api, mongo_db):
    await seed(mongo_db)
    for number in range(1, 24):
        await add_ticket(mongo_db, number)

    seen = await walk(api, limit=5)

    assert seen == sorted(range(1, 24), reverse=True)
    assert len(seen) == len(set(seen))


async def test_last_page_has_no_cursor(api, mongo_db):
    await seed(mongo_db)
    for number in (1, 2, 3, 4):
        await add_ticket(mongo_db, number)

    first = await page(api, limit=2)
    second = await page(api, limit=2, cursor=first["next_cursor"])

    assert [t["id"] for t in second["items"]] == [2, 1]
    assert second["next_cursor"] is None


async def test_a_page_that_exactly_empties_the_list_has_no_cursor(api, mongo_db):
    """The off-by-one: 4 rows at 2 per page must not offer a third, empty page."""
    await seed(mongo_db)
    for number in (1, 2, 3, 4):
        await add_ticket(mongo_db, number)

    body = await page(api, limit=4)

    assert len(body["items"]) == 4
    assert body["next_cursor"] is None


async def test_rows_sharing_a_timestamp_are_not_duplicated_or_skipped(api, mongo_db):
    """Where sorting on the date alone breaks: every row created in one instant."""
    await seed(mongo_db)
    same_moment = BASE
    for number in range(1, 11):
        await add_ticket(mongo_db, number, created_at=same_moment)

    seen = await walk(api, limit=3)

    assert seen == sorted(range(1, 11), reverse=True)
    assert len(seen) == len(set(seen))


async def test_a_row_inserted_mid_walk_does_not_shift_the_rest(api, mongo_db):
    """An offset pager would re-show a row here; a cursor is anchored to a position."""
    await seed(mongo_db)
    for number in range(1, 7):
        await add_ticket(mongo_db, number)

    first = await page(api, limit=2)
    assert [t["id"] for t in first["items"]] == [6, 5]

    # A new newest ticket arrives, which under an offset would push row 4 into
    # the slot the second page is about to read, showing it twice.
    await add_ticket(mongo_db, 99)

    second = await page(api, limit=2, cursor=first["next_cursor"])

    assert [t["id"] for t in second["items"]] == [4, 3]


async def test_total_counts_the_filtered_set_not_the_page(api, mongo_db):
    await seed(mongo_db)
    for number in range(1, 8):
        await add_ticket(mongo_db, number, epic_id=500 if number <= 4 else None)

    body = await page(api, limit=2, epic_id=500)

    assert len(body["items"]) == 2
    assert body["total"] == 4


async def test_filters_hold_across_pages(api, mongo_db):
    await seed(mongo_db)
    for number in range(1, 11):
        await add_ticket(mongo_db, number, type="bug" if number % 2 else "task")

    seen = await walk(api, limit=2, type="bug")

    assert seen == [9, 7, 5, 3, 1]


async def test_an_unreadable_cursor_starts_over_rather_than_failing(api, mongo_db):
    await seed(mongo_db)
    for number in (1, 2, 3):
        await add_ticket(mongo_db, number)

    body = await page(api, limit=2, cursor="not-a-real-cursor")

    assert [t["id"] for t in body["items"]] == [3, 2]


async def test_no_epic_and_parent_id_filters(api, mongo_db):
    await seed(mongo_db)
    await add_ticket(mongo_db, 1, epic_id=500)
    await add_ticket(mongo_db, 2)
    await add_ticket(mongo_db, 3, parent_id=1)

    no_epic = await page(api, limit=10, no_epic="true")
    children = await page(api, limit=10, parent_id=1, include_subtasks="true")

    assert [t["id"] for t in no_epic["items"]] == [2]
    assert [t["id"] for t in children["items"]] == [3]


async def test_epics_page_in_board_order(api, mongo_db):
    await seed(mongo_db)
    for number, position in ((100, 1), (101, 2), (102, 3), (103, 4), (104, 5)):
        await add_epic(mongo_db, number, position)

    seen = await walk(api, path=f"/projects/{PROJECT}/epics", limit=2)

    assert seen == [100, 101, 102, 103, 104]


async def test_epics_sharing_a_position_still_page_cleanly(api, mongo_db):
    """epic_position is editable and not unique, so it cannot order a page alone."""
    await seed(mongo_db)
    for number in (100, 101, 102, 103):
        await add_epic(mongo_db, number, position=1)

    seen = await walk(api, path=f"/projects/{PROJECT}/epics", limit=2)

    assert seen == [100, 101, 102, 103]


async def test_epic_list_without_limit_is_still_a_bare_list(api, mongo_db):
    await seed(mongo_db)
    await add_epic(mongo_db, 100, position=1)

    body = (await api.get(f"/projects/{PROJECT}/epics")).json()

    assert isinstance(body, list)
    assert body[0]["id"] == 100
