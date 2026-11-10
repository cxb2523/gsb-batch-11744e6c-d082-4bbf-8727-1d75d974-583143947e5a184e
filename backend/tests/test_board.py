"""The board endpoint: grouping, per-column counts, and continuing one column.

What matters here is that a column's slice and its total are both right — the
slice is what people see, the total is what the column header claims, and the
two come from different branches of the same aggregation. The other theme is
equivalence: grouping and filtering now happen in the database, and must select
exactly what the browser used to select from a full download.
"""

from datetime import datetime, timedelta, timezone

import pytest

pytestmark = pytest.mark.anyio

PROJECT = 1
BACKLOG, IN_PROGRESS, DONE = 101, 102, 103
BASE = datetime(2026, 1, 1, 12, 0, 0, tzinfo=timezone.utc)

ALICE = {"user_number": 11, "email": "alice@example.com", "name": "Alice Nguyen", "role": "member"}
BEN = {"user_number": 12, "email": "ben@example.com", "name": "Ben Carter", "role": "member"}


async def seed(db):
    await db.projects.insert_one({"project_number": PROJECT, "key": "WEB", "name": "Website"})
    await db.ticket_statuses.insert_many([
        {"status_number": BACKLOG, "project_id": PROJECT, "name": "Backlog", "position": 1},
        {"status_number": IN_PROGRESS, "project_id": PROJECT, "name": "In Progress", "position": 2},
        {"status_number": DONE, "project_id": PROJECT, "name": "Done", "position": 3},
    ])
    await db.users.insert_many([dict(ALICE), dict(BEN)])


async def add_ticket(db, number, **overrides):
    doc = {
        "ticket_number": number,
        "project_id": PROJECT,
        "key": f"WEB-{number}",
        "title": f"Ticket {number}",
        "type": "task",
        "status_id": BACKLOG,
        "priority": "medium",
        "assignee_email": None,
        "reporter_email": BEN["email"],
        "labels": [],
        "epic_id": None,
        "parent_id": None,
        "sprint_id": None,
        "created_at": BASE + timedelta(minutes=number),
    }
    doc.update(overrides)
    await db.tickets.insert_one(doc)
    return doc


async def board(api, **params):
    resp = await api.get(f"/projects/{PROJECT}/board", params=params)
    assert resp.status_code == 200, resp.text
    return resp.json()


def columns(body):
    """{column key: [ticket ids]}, which is what the board renders."""
    return {c["key"]: [t["id"] for t in c["items"]] for c in body["columns"]}


def totals(body):
    return {c["key"]: c["total"] for c in body["columns"]}


async def test_groups_by_status_by_default(api, mongo_db):
    await seed(mongo_db)
    await add_ticket(mongo_db, 1, status_id=BACKLOG)
    await add_ticket(mongo_db, 2, status_id=IN_PROGRESS)
    await add_ticket(mongo_db, 3, status_id=IN_PROGRESS)

    body = await board(api)

    assert body["group_by"] == "status"
    assert columns(body) == {str(BACKLOG): [1], str(IN_PROGRESS): [3, 2]}


async def test_cards_are_newest_first_within_a_column(api, mongo_db):
    await seed(mongo_db)
    for number in (1, 2, 3, 4):
        await add_ticket(mongo_db, number, status_id=BACKLOG)

    body = await board(api)

    assert columns(body)[str(BACKLOG)] == [4, 3, 2, 1]


async def test_column_total_counts_the_whole_column_not_the_slice(api, mongo_db):
    await seed(mongo_db)
    for number in range(1, 13):
        await add_ticket(mongo_db, number, status_id=BACKLOG)

    body = await board(api, column_limit=5)

    assert len(columns(body)[str(BACKLOG)]) == 5
    assert totals(body)[str(BACKLOG)] == 12


async def test_a_full_column_offers_a_cursor_and_a_short_one_does_not(api, mongo_db):
    await seed(mongo_db)
    for number in range(1, 8):
        await add_ticket(mongo_db, number, status_id=BACKLOG)
    await add_ticket(mongo_db, 50, status_id=DONE)

    body = await board(api, column_limit=5)
    by_key = {c["key"]: c for c in body["columns"]}

    assert by_key[str(BACKLOG)]["next_cursor"]
    assert by_key[str(DONE)]["next_cursor"] is None


async def test_a_column_exactly_filled_offers_no_cursor(api, mongo_db):
    """The off-by-one: five cards at a limit of five is not "more"."""
    await seed(mongo_db)
    for number in range(1, 6):
        await add_ticket(mongo_db, number, status_id=BACKLOG)

    [column] = (await board(api, column_limit=5))["columns"]

    assert len(column["items"]) == 5
    assert column["next_cursor"] is None


async def test_a_columns_cursor_continues_that_column_through_the_ticket_list(api, mongo_db):
    """Load more: the board hands back a cursor the flat list understands."""
    await seed(mongo_db)
    for number in range(1, 13):
        await add_ticket(mongo_db, number, status_id=BACKLOG)

    [column] = (await board(api, column_limit=5))["columns"]
    assert [t["id"] for t in column["items"]] == [12, 11, 10, 9, 8]

    resp = await api.get(
        f"/projects/{PROJECT}/tickets",
        params={"status_id": BACKLOG, "limit": 5, "cursor": column["next_cursor"]},
    )
    assert resp.status_code == 200, resp.text

    assert [t["id"] for t in resp.json()["items"]] == [7, 6, 5, 4, 3]


async def test_groups_by_assignee_putting_unassigned_in_its_own_column(api, mongo_db):
    await seed(mongo_db)
    await add_ticket(mongo_db, 1, assignee_email=ALICE["email"])
    await add_ticket(mongo_db, 2, assignee_email=BEN["email"])
    await add_ticket(mongo_db, 3)

    body = await board(api, group_by="assignee")

    assert columns(body) == {"11": [1], "12": [2], "unassigned": [3]}


async def test_one_person_is_one_column_however_the_ticket_references_them(api, mongo_db):
    """Older tickets carry a numeric assignee; both forms are the same person."""
    await seed(mongo_db)
    await add_ticket(mongo_db, 1, assignee_email=ALICE["email"])
    await add_ticket(mongo_db, 2, assignee_email=None, assignee_id=ALICE["user_number"])

    body = await board(api, group_by="assignee")

    assert columns(body) == {"11": [2, 1]}
    assert totals(body) == {"11": 2}


async def test_an_address_with_no_user_behind_it_still_lands_somewhere(api, mongo_db):
    """A deleted user must not make their cards vanish from the board."""
    await seed(mongo_db)
    await add_ticket(mongo_db, 1, assignee_email="ghost@example.com")

    body = await board(api, group_by="assignee")

    assert columns(body) == {"unassigned": [1]}


async def test_groups_by_epic_and_priority(api, mongo_db):
    await seed(mongo_db)
    await add_ticket(mongo_db, 1, epic_id=500, priority="high")
    await add_ticket(mongo_db, 2, priority="low")

    by_epic = await board(api, group_by="epic")
    by_priority = await board(api, group_by="priority")

    assert columns(by_epic) == {"500": [1], "no-epic": [2]}
    assert columns(by_priority) == {"high": [1], "low": [2]}


async def test_filters_narrow_every_column(api, mongo_db):
    await seed(mongo_db)
    await add_ticket(mongo_db, 1, status_id=BACKLOG, type="bug")
    await add_ticket(mongo_db, 2, status_id=BACKLOG, type="task")
    await add_ticket(mongo_db, 3, status_id=IN_PROGRESS, type="bug")

    body = await board(api, type="bug")

    assert columns(body) == {str(BACKLOG): [1], str(IN_PROGRESS): [3]}
    assert totals(body) == {str(BACKLOG): 1, str(IN_PROGRESS): 1}


async def test_search_applies_across_columns_not_within_a_page(api, mongo_db):
    """The reason this endpoint exists: a match three columns over is still found."""
    await seed(mongo_db)
    await add_ticket(mongo_db, 1, status_id=BACKLOG, title="Fix the login flow")
    await add_ticket(mongo_db, 2, status_id=IN_PROGRESS, title="Unrelated work")
    await add_ticket(mongo_db, 3, status_id=DONE, title="Login redirect")

    body = await board(api, q="login")

    assert columns(body) == {str(BACKLOG): [1], str(DONE): [3]}


async def test_search_by_assignee_name_works_here_too(api, mongo_db):
    await seed(mongo_db)
    await add_ticket(mongo_db, 1, assignee_email=ALICE["email"])
    await add_ticket(mongo_db, 2, assignee_email=BEN["email"])

    body = await board(api, q="Carter")

    assert columns(body) == {str(BACKLOG): [2]}


async def test_subtasks_are_not_cards_but_are_counted_on_their_parent(api, mongo_db):
    await seed(mongo_db)
    await add_ticket(mongo_db, 1)
    await add_ticket(mongo_db, 2, parent_id=1, status_id=DONE)
    await add_ticket(mongo_db, 3, parent_id=1)

    [column] = (await board(api))["columns"]

    assert [t["id"] for t in column["items"]] == [1]
    assert column["items"][0]["subtasks_count"] == 2
    assert column["items"][0]["subtasks_completed"] == 1


async def test_archived_cards_are_hidden_unless_asked_for(api, mongo_db):
    await seed(mongo_db)
    await add_ticket(mongo_db, 1)
    await add_ticket(mongo_db, 2, archived=True)

    assert columns(await board(api)) == {str(BACKLOG): [1]}
    assert columns(await board(api, include_archived="true")) == {str(BACKLOG): [2, 1]}


async def test_empty_columns_are_absent_rather_than_returned_empty(api, mongo_db):
    await seed(mongo_db)
    await add_ticket(mongo_db, 1, status_id=BACKLOG)

    body = await board(api)

    assert [c["key"] for c in body["columns"]] == [str(BACKLOG)]


async def test_a_board_with_no_tickets_returns_no_columns(api, mongo_db):
    await seed(mongo_db)

    body = await board(api)

    assert body["columns"] == []


async def test_cards_carry_the_same_fields_the_ticket_list_gives_them(api, mongo_db):
    """The board and the list must not drift into two different card shapes."""
    await seed(mongo_db)
    await add_ticket(mongo_db, 1, status_id=IN_PROGRESS, assignee_email=ALICE["email"])

    [from_list] = (await api.get(f"/projects/{PROJECT}/tickets")).json()
    [column] = (await board(api))["columns"]

    assert column["items"][0] == from_list


async def test_an_unknown_grouping_is_rejected(api, mongo_db):
    await seed(mongo_db)

    resp = await api.get(f"/projects/{PROJECT}/board", params={"group_by": "colour"})

    assert resp.status_code == 422


async def test_filtering_by_assignee_id_matches_filtering_by_address(api, mongo_db):
    """The board holds people by id; it shouldn't have to resolve them itself."""
    await seed(mongo_db)
    await add_ticket(mongo_db, 1, assignee_email=ALICE["email"])
    await add_ticket(mongo_db, 2, assignee_email=BEN["email"])

    by_id = await board(api, assignee_id=ALICE["user_number"])
    by_email = await board(api, assignee_email=ALICE["email"])

    assert columns(by_id) == columns(by_email) == {str(BACKLOG): [1]}


async def test_filtering_by_an_assignee_who_does_not_exist_matches_nothing(api, mongo_db):
    """Not 'everyone' - an unresolvable filter must not silently widen the board."""
    await seed(mongo_db)
    await add_ticket(mongo_db, 1, assignee_email=ALICE["email"])

    body = await board(api, assignee_id=9999)

    assert body["columns"] == []
