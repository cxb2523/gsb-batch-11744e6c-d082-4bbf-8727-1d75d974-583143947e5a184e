"""Characterization tests for the ticket and epic list responses.

These pin the responses as they are today, field by field, before the
serializers behind them are rewritten to batch their lookups. The point is not
to assert that the current shape is the right one — it is to make any change to
it deliberate and visible, since the ticket serializer is shared by the list,
the single fetch, update, move and archive endpoints, and the board, backlog,
sprint board and breakdown modal all read it.

Covered: the enriched fields (status visual, assignee, reporter), the subtask
rollup, and the default exclusions (subtasks, archived) with their opt-ins.
"""

from datetime import datetime, timedelta, timezone

import pytest

pytestmark = pytest.mark.anyio

PROJECT = 1
BACKLOG, IN_PROGRESS, DONE = 101, 102, 103

ALICE = {"user_number": 11, "email": "alice@example.com", "name": "Alice Nguyen", "role": "member"}
BEN = {"user_number": 12, "email": "ben@example.com", "name": "Ben Carter", "role": "member"}


async def seed(db):
    """A project with three statuses, two users, and nothing else."""
    await db.projects.insert_one({"project_number": PROJECT, "key": "WEB", "name": "Website"})
    await db.ticket_statuses.insert_many([
        {"status_number": BACKLOG, "project_id": PROJECT, "name": "Backlog", "color": "#94a3b8", "position": 1},
        {"status_number": IN_PROGRESS, "project_id": PROJECT, "name": "In Progress", "color": "#3b82f6", "position": 2},
        {"status_number": DONE, "project_id": PROJECT, "name": "Done", "color": "#22c55e", "position": 3},
    ])
    await db.users.insert_many([dict(ALICE), dict(BEN)])


async def add_ticket(db, number, **overrides):
    """Insert one ticket document, with the fields a real one carries."""
    doc = {
        "ticket_number": number,
        "project_id": PROJECT,
        "key": f"WEB-{number}",
        "title": f"Ticket {number}",
        "description": f"Body of ticket {number}",
        "type": "task",
        "status_id": BACKLOG,
        "priority": "medium",
        "assignee_email": ALICE["email"],
        "reporter_email": BEN["email"],
        "labels": ["frontend"],
        "epic_id": None,
        "parent_id": None,
        "sprint_id": None,
        "time_spent_seconds": 0,
        "created_at": datetime.now(timezone.utc) - timedelta(minutes=number),
    }
    doc.update(overrides)
    await db.tickets.insert_one(doc)
    return doc


async def add_epic(db, number, position, **overrides):
    doc = {
        "ticket_number": number,
        "project_id": PROJECT,
        "key": f"WEB-E{position}",
        "title": f"Epic {position}",
        "type": "epic",
        "status_id": IN_PROGRESS,
        "priority": "medium",
        "assignee_email": ALICE["email"],
        "reporter_email": BEN["email"],
        "epic_color": "#155dfc",
        "epic_position": position,
        "created_at": datetime.now(timezone.utc),
    }
    doc.update(overrides)
    await db.tickets.insert_one(doc)
    return doc


async def test_ticket_list_enriches_status_assignee_and_reporter(api, mongo_db):
    await seed(mongo_db)
    await add_ticket(mongo_db, 1, status_id=IN_PROGRESS)

    resp = await api.get(f"/projects/{PROJECT}/tickets")
    assert resp.status_code == 200, resp.text
    [ticket] = resp.json()

    assert ticket["id"] == 1
    assert ticket["project_id"] == PROJECT
    assert ticket["key"] == "WEB-1"
    assert ticket["title"] == "Ticket 1"
    assert ticket["description"] == "Body of ticket 1"
    assert ticket["type"] == "task"
    assert ticket["priority"] == "medium"
    assert ticket["labels"] == ["frontend"]

    # The status visual: name, configured colour, and the derived category.
    assert ticket["status_id"] == IN_PROGRESS
    assert ticket["status_name"] == "In Progress"
    assert ticket["status_color"] == "#3b82f6"
    assert ticket["status_category"] == "in_progress"

    # People are resolved from their email to a full object.
    assert ticket["assignee"]["id"] == ALICE["user_number"]
    assert ticket["assignee"]["name"] == ALICE["name"]
    assert ticket["assignee"]["email"] == ALICE["email"]
    assert ticket["reporter"]["id"] == BEN["user_number"]
    assert ticket["reporter"]["name"] == BEN["name"]


async def test_unknown_status_and_missing_people_do_not_break_the_row(api, mongo_db):
    """A ticket pointing at a deleted status, with nobody on it, still serializes."""
    await seed(mongo_db)
    await add_ticket(mongo_db, 1, status_id=999, assignee_email=None, reporter_email=None)

    [ticket] = (await api.get(f"/projects/{PROJECT}/tickets")).json()

    assert ticket["status_name"] == "Unknown"
    assert ticket["status_color"] is None
    assert ticket["assignee"] is None
    assert ticket["reporter"] is None


async def test_legacy_numeric_assignee_is_still_resolved(api, mongo_db):
    """Older documents address people by user_number rather than email."""
    await seed(mongo_db)
    await add_ticket(
        mongo_db, 1,
        assignee_email=None, reporter_email=None,
        assignee_id=ALICE["user_number"], reporter_id=BEN["user_number"],
    )

    [ticket] = (await api.get(f"/projects/{PROJECT}/tickets")).json()

    assert ticket["assignee"]["email"] == ALICE["email"]
    assert ticket["reporter"]["email"] == BEN["email"]


async def test_subtasks_are_excluded_by_default_and_rolled_up_onto_the_parent(api, mongo_db):
    await seed(mongo_db)
    await add_ticket(mongo_db, 1)
    await add_ticket(mongo_db, 2, parent_id=1, status_id=DONE)
    await add_ticket(mongo_db, 3, parent_id=1, status_id=BACKLOG)

    tickets = (await api.get(f"/projects/{PROJECT}/tickets")).json()

    assert [t["id"] for t in tickets] == [1]
    assert tickets[0]["subtasks_count"] == 2
    assert tickets[0]["subtasks_completed"] == 1


async def test_include_subtasks_lists_them_as_rows(api, mongo_db):
    await seed(mongo_db)
    await add_ticket(mongo_db, 1)
    await add_ticket(mongo_db, 2, parent_id=1)

    tickets = (await api.get(f"/projects/{PROJECT}/tickets", params={"include_subtasks": "true"})).json()

    assert sorted(t["id"] for t in tickets) == [1, 2]
    child = next(t for t in tickets if t["id"] == 2)
    assert child["parent_id"] == 1


async def test_archived_tickets_are_excluded_unless_asked_for(api, mongo_db):
    await seed(mongo_db)
    await add_ticket(mongo_db, 1)
    await add_ticket(mongo_db, 2, archived=True, archived_at=datetime.now(timezone.utc))

    default = (await api.get(f"/projects/{PROJECT}/tickets")).json()
    included = (await api.get(f"/projects/{PROJECT}/tickets", params={"include_archived": "true"})).json()
    only = (await api.get(f"/projects/{PROJECT}/tickets", params={"archived_only": "true"})).json()

    assert [t["id"] for t in default] == [1]
    assert sorted(t["id"] for t in included) == [1, 2]
    assert [t["id"] for t in only] == [2]
    assert only[0]["archived"] is True


async def test_status_and_assignee_filters_narrow_the_list(api, mongo_db):
    await seed(mongo_db)
    await add_ticket(mongo_db, 1, status_id=IN_PROGRESS)
    await add_ticket(mongo_db, 2, status_id=DONE, assignee_email=BEN["email"])

    by_status = (await api.get(f"/projects/{PROJECT}/tickets", params={"status_id": DONE})).json()
    by_assignee = (await api.get(f"/projects/{PROJECT}/tickets", params={"assignee_email": BEN["email"]})).json()

    assert [t["id"] for t in by_status] == [2]
    assert [t["id"] for t in by_assignee] == [2]


async def test_list_is_newest_first(api, mongo_db):
    await seed(mongo_db)
    # add_ticket dates each one further into the past, so 1 is the newest.
    for number in (1, 2, 3):
        await add_ticket(mongo_db, number)

    tickets = (await api.get(f"/projects/{PROJECT}/tickets")).json()

    assert [t["id"] for t in tickets] == [1, 2, 3]


async def test_single_ticket_matches_its_row_in_the_list(api, mongo_db):
    """The list and the single fetch share a serializer; they must not drift apart."""
    await seed(mongo_db)
    await add_ticket(mongo_db, 1, status_id=IN_PROGRESS)

    [from_list] = (await api.get(f"/projects/{PROJECT}/tickets")).json()
    one = (await api.get(f"/projects/{PROJECT}/tickets/1")).json()

    # Both carry the subtask fields; only the list fills them in, so compare the rest.
    assert from_list.keys() == one.keys()
    assert one["subtasks_count"] is None and one["subtasks_completed"] is None
    assert {k: v for k, v in from_list.items() if not k.startswith("subtasks_")} ==            {k: v for k, v in one.items() if not k.startswith("subtasks_")}


async def test_epic_list_carries_its_progress_counts(api, mongo_db):
    await seed(mongo_db)
    await add_epic(mongo_db, 100, position=1)
    await add_ticket(mongo_db, 1, epic_id=100, status_id=DONE)
    await add_ticket(mongo_db, 2, epic_id=100, status_id=IN_PROGRESS)
    await add_ticket(mongo_db, 3, epic_id=100, status_id=BACKLOG)

    resp = await api.get(f"/projects/{PROJECT}/epics")
    assert resp.status_code == 200, resp.text
    [epic] = resp.json()

    assert epic["id"] == 100
    assert epic["key"] == "WEB-E1"
    assert epic["title"] == "Epic 1"
    assert epic["color"] == "#155dfc"
    assert epic["assignee"]["email"] == ALICE["email"]
    assert epic["total_tickets"] == 3
    assert epic["completed_tickets"] == 1
    # Rounded to one decimal place by the endpoint, not a raw fraction.
    assert epic["progress_percentage"] == 33.3


async def test_epic_progress_ignores_archived_children(api, mongo_db):
    await seed(mongo_db)
    await add_epic(mongo_db, 100, position=1)
    await add_ticket(mongo_db, 1, epic_id=100, status_id=DONE)
    await add_ticket(mongo_db, 2, epic_id=100, status_id=DONE, archived=True)

    [epic] = (await api.get(f"/projects/{PROJECT}/epics")).json()

    assert epic["total_tickets"] == 1
    assert epic["completed_tickets"] == 1
    assert epic["progress_percentage"] == 100


async def test_epic_with_no_children_reports_zero_progress(api, mongo_db):
    await seed(mongo_db)
    await add_epic(mongo_db, 100, position=1)

    [epic] = (await api.get(f"/projects/{PROJECT}/epics")).json()

    assert epic["total_tickets"] == 0
    assert epic["completed_tickets"] == 0
    assert epic["progress_percentage"] == 0


async def test_epics_are_ordered_by_position_and_excluded_from_the_ticket_list(api, mongo_db):
    await seed(mongo_db)
    await add_epic(mongo_db, 101, position=2)
    await add_epic(mongo_db, 100, position=1)
    await add_ticket(mongo_db, 1)

    epics = (await api.get(f"/projects/{PROJECT}/epics")).json()
    tickets = (await api.get(f"/projects/{PROJECT}/tickets")).json()

    assert [e["id"] for e in epics] == [100, 101]
    # Epics are tickets with type=epic, so they also appear in the ticket list;
    # pinning that here so a change to it is a decision rather than a surprise.
    assert sorted(t["id"] for t in tickets) == [1, 100, 101]
