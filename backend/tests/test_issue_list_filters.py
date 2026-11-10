"""The server-side filters on the ticket and epic lists.

These replace filtering the browser used to do over a full download of the
project's tickets, so what matters is that each filter narrows to exactly what
the screen used to compute, and that filters combine rather than overwrite one
another — several of them need their own $or, which a single query object
cannot hold twice.
"""

from datetime import datetime, timedelta, timezone

import pytest

pytestmark = pytest.mark.anyio

PROJECT = 1
BACKLOG, IN_PROGRESS, DONE = 101, 102, 103

ALICE = {"user_number": 11, "email": "alice@example.com", "name": "Alice Nguyen", "role": "member"}
BEN = {"user_number": 12, "email": "ben@example.com", "name": "Ben Carter", "role": "member"}


async def seed(db):
    await db.projects.insert_one({"project_number": PROJECT, "key": "WEB", "name": "Website"})
    await db.ticket_statuses.insert_many([
        {"status_number": BACKLOG, "project_id": PROJECT, "name": "Backlog", "color": "#94a3b8", "position": 1},
        {"status_number": IN_PROGRESS, "project_id": PROJECT, "name": "In Progress", "color": "#3b82f6", "position": 2},
        {"status_number": DONE, "project_id": PROJECT, "name": "Done", "color": "#22c55e", "position": 3},
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
        "assignee_email": ALICE["email"],
        "reporter_email": BEN["email"],
        "labels": [],
        "epic_id": None,
        "parent_id": None,
        "sprint_id": None,
        "created_at": datetime.now(timezone.utc) - timedelta(minutes=number),
    }
    doc.update(overrides)
    await db.tickets.insert_one(doc)
    return doc


async def ids(api, **params):
    resp = await api.get(f"/projects/{PROJECT}/tickets", params=params)
    assert resp.status_code == 200, resp.text
    return sorted(t["id"] for t in resp.json())


async def test_epic_filter_returns_only_that_epics_tickets(api, mongo_db):
    await seed(mongo_db)
    await add_ticket(mongo_db, 1, epic_id=500)
    await add_ticket(mongo_db, 2, epic_id=500)
    await add_ticket(mongo_db, 3, epic_id=501)
    await add_ticket(mongo_db, 4)

    assert await ids(api, epic_id=500) == [1, 2]


async def test_sprint_filter_and_backlog_filter_are_complements(api, mongo_db):
    await seed(mongo_db)
    await add_ticket(mongo_db, 1, sprint_id=7)
    await add_ticket(mongo_db, 2, sprint_id=8)
    await add_ticket(mongo_db, 3)

    assert await ids(api, sprint_id=7) == [1]
    assert await ids(api, no_sprint="true") == [3]


async def test_no_sprint_covers_documents_written_before_the_field_existed(api, mongo_db):
    await seed(mongo_db)
    await add_ticket(mongo_db, 1, sprint_id=7)
    legacy = await add_ticket(mongo_db, 2)
    await mongo_db.tickets.update_one({"ticket_number": legacy["ticket_number"]}, {"$unset": {"sprint_id": ""}})

    assert await ids(api, no_sprint="true") == [2]


async def test_type_priority_and_label_filters(api, mongo_db):
    await seed(mongo_db)
    await add_ticket(mongo_db, 1, type="bug", priority="high", labels=["frontend", "regression"])
    await add_ticket(mongo_db, 2, type="story", priority="low", labels=["backend"])

    assert await ids(api, type="bug") == [1]
    assert await ids(api, priority="low") == [2]
    assert await ids(api, label="regression") == [1]
    assert await ids(api, label="nobody-uses-this") == []


async def test_search_matches_key_and_title(api, mongo_db):
    await seed(mongo_db)
    await add_ticket(mongo_db, 1, title="Fix the login flow")
    await add_ticket(mongo_db, 2, title="Document the API")

    assert await ids(api, q="login") == [1]
    assert await ids(api, q="WEB-2") == [2]
    # Case-insensitive, like the board's own matching.
    assert await ids(api, q="LOGIN") == [1]


async def test_search_matches_assignee_name(api, mongo_db):
    """The name is on the user, not the ticket, so this is the interesting one."""
    await seed(mongo_db)
    await add_ticket(mongo_db, 1, assignee_email=ALICE["email"], title="Something")
    await add_ticket(mongo_db, 2, assignee_email=BEN["email"], title="Other")

    assert await ids(api, q="Carter") == [2]


async def test_search_treats_its_input_as_text_not_a_pattern(api, mongo_db):
    await seed(mongo_db)
    await add_ticket(mongo_db, 1, title="Rename a.b.c")
    await add_ticket(mongo_db, 2, title="Rename axbxc")

    # "." would match any character if the input were used as a regex.
    assert await ids(api, q="a.b.c") == [1]


async def test_search_for_nothing_returns_everything(api, mongo_db):
    await seed(mongo_db)
    await add_ticket(mongo_db, 1)
    await add_ticket(mongo_db, 2)

    assert await ids(api, q="") == [1, 2]
    assert await ids(api, q="   ") == [1, 2]


async def test_search_combines_with_the_subtask_exclusion(api, mongo_db):
    """Both need an $or of their own; neither may swallow the other."""
    await seed(mongo_db)
    await add_ticket(mongo_db, 1, title="login parent")
    await add_ticket(mongo_db, 2, title="login child", parent_id=1)
    await add_ticket(mongo_db, 3, title="unrelated")

    assert await ids(api, q="login") == [1]
    assert await ids(api, q="login", include_subtasks="true") == [1, 2]


async def test_search_combines_with_the_backlog_filter(api, mongo_db):
    await seed(mongo_db)
    await add_ticket(mongo_db, 1, title="login", sprint_id=7)
    await add_ticket(mongo_db, 2, title="login")
    await add_ticket(mongo_db, 3, title="other")

    assert await ids(api, q="login", no_sprint="true") == [2]


async def test_filters_stack_rather_than_replace_each_other(api, mongo_db):
    await seed(mongo_db)
    await add_ticket(mongo_db, 1, type="bug", priority="high", epic_id=500, sprint_id=7)
    await add_ticket(mongo_db, 2, type="bug", priority="low", epic_id=500, sprint_id=7)
    await add_ticket(mongo_db, 3, type="task", priority="high", epic_id=500, sprint_id=7)

    assert await ids(api, type="bug", priority="high", epic_id=500, sprint_id=7) == [1]


async def test_filters_still_exclude_archived_by_default(api, mongo_db):
    await seed(mongo_db)
    await add_ticket(mongo_db, 1, epic_id=500)
    await add_ticket(mongo_db, 2, epic_id=500, archived=True)

    assert await ids(api, epic_id=500) == [1]
    assert await ids(api, epic_id=500, include_archived="true") == [1, 2]


async def test_no_filters_returns_the_whole_project(api, mongo_db):
    """The callers that haven't moved over must see exactly what they saw before."""
    await seed(mongo_db)
    await add_ticket(mongo_db, 1, sprint_id=7)
    await add_ticket(mongo_db, 2, epic_id=500)
    await add_ticket(mongo_db, 3)

    assert await ids(api) == [1, 2, 3]


async def test_epic_search_matches_key_and_title(api, mongo_db):
    await seed(mongo_db)
    for number, position, title in ((100, 1, "Checkout rewrite"), (101, 2, "Search revamp")):
        await mongo_db.tickets.insert_one({
            "ticket_number": number,
            "project_id": PROJECT,
            "key": f"WEB-E{position}",
            "title": title,
            "type": "epic",
            "status_id": IN_PROGRESS,
            "epic_position": position,
            "created_at": datetime.now(timezone.utc),
        })

    found = (await api.get(f"/projects/{PROJECT}/epics", params={"q": "checkout"})).json()
    by_key = (await api.get(f"/projects/{PROJECT}/epics", params={"q": "WEB-E2"})).json()
    everything = (await api.get(f"/projects/{PROJECT}/epics")).json()

    assert [e["id"] for e in found] == [100]
    assert [e["id"] for e in by_key] == [101]
    assert [e["id"] for e in everything] == [100, 101]


async def test_types_filter_accepts_several_at_once(api, mongo_db):
    """The pickers need "anything but an epic", which one `type=` cannot express."""
    await seed(mongo_db)
    await add_ticket(mongo_db, 1, type="task")
    await add_ticket(mongo_db, 2, type="bug")
    await add_ticket(mongo_db, 3, type="epic")

    resp = await api.get(f"/projects/{PROJECT}/tickets", params=[("types", "task"), ("types", "bug")])
    assert resp.status_code == 200, resp.text

    assert sorted(t["id"] for t in resp.json()) == [1, 2]


async def test_a_single_type_still_wins_over_the_list(api, mongo_db):
    await seed(mongo_db)
    await add_ticket(mongo_db, 1, type="task")
    await add_ticket(mongo_db, 2, type="bug")

    resp = await api.get(
        f"/projects/{PROJECT}/tickets",
        params=[("type", "bug"), ("types", "task"), ("types", "bug")],
    )

    assert [t["id"] for t in resp.json()] == [2]
