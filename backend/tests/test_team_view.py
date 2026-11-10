"""Integration tests for the admin Team View endpoints against a throwaway MongoDB.

Covers the two-level pagination (members, and tickets within a member), server-side
filtering, filtered summary stats, legacy email/id assignee resolution, and the
mixed-type (datetime OR ISO string) due_date normalization used by the `due` filter.
"""

from datetime import datetime

import pytest

pytestmark = pytest.mark.anyio

ALICE = "alice@example.com"
BOB = "bob@example.com"
CAROL = "carol@example.com"

IN_PROGRESS = 201
DONE = 202


async def seed(db):
    await db.users.insert_many([
        {"email": ALICE, "name": "Alice A", "user_number": 1, "role": "user"},
        {"email": BOB, "name": "Bob B", "user_number": 2, "role": "user"},
        {"email": CAROL, "name": "Carol C", "user_number": 3, "role": "user"},
    ])
    await db.projects.insert_many([
        {"project_number": 1, "key": "WEB", "name": "Website"},
        {"project_number": 2, "key": "APP", "name": "Mobile"},
    ])
    await db.ticket_statuses.insert_many([
        {"status_number": IN_PROGRESS, "name": "In Progress"},
        {"status_number": DONE, "name": "Done"},
    ])

    tickets = []

    # Alice: 25 tickets (> one ticket page), assigned by email.
    for i in range(25):
        n = 100 + i
        t = {
            "ticket_number": n, "project_id": 1, "key": f"WEB-{n}", "title": f"Alice task {i}",
            "priority": "high" if i < 5 else "medium",
            "status_id": DONE if i >= 23 else IN_PROGRESS,
            "assignee_email": ALICE,
        }
        if i == 0:
            t["due_date"] = datetime(2000, 1, 1)      # overdue, stored as a BSON date
        elif i == 1:
            t["due_date"] = "2000-01-02"              # overdue, stored as an ISO string
        elif i == 2:
            t["due_date"] = datetime(2999, 1, 1)      # far future -> not overdue
        tickets.append(t)

    # Bob: 3 tickets — two by legacy numeric id, one by email. Must resolve to ONE member.
    tickets.append({"ticket_number": 200, "project_id": 1, "key": "WEB-200", "title": "Bob id task 1",
                    "priority": "high", "status_id": IN_PROGRESS, "assignee_id": 2})
    tickets.append({"ticket_number": 201, "project_id": 1, "key": "WEB-201", "title": "Bob id task 2",
                    "priority": "medium", "status_id": IN_PROGRESS, "assignee_id": 2})
    tickets.append({"ticket_number": 202, "project_id": 1, "key": "WEB-202", "title": "Bob email task",
                    "priority": "medium", "status_id": IN_PROGRESS, "assignee_email": BOB})

    # Carol: 2 tickets by email.
    for i, n in enumerate((300, 301)):
        tickets.append({"ticket_number": n, "project_id": 1, "key": f"WEB-{n}", "title": f"Carol task {i}",
                        "priority": "low", "status_id": DONE, "assignee_email": CAROL})

    await db.tickets.insert_many(tickets)


async def test_member_pagination_and_summary(api, mongo_db):
    await seed(mongo_db)

    r = await api.get("/admin/team-view?limit=2&offset=0")
    assert r.status_code == 200
    body = r.json()

    # 3 members total, 2 on this page, more to come.
    assert body["total"] == 3
    assert body["has_more"] is True
    assert len(body["items"]) == 2

    # Sorted by name: Alice, Bob.
    assert [m["user_name"] for m in body["items"]] == ["Alice A", "Bob B"]

    # Summary is over the whole filtered set, not just the page.
    assert body["summary"]["total_members"] == 3
    assert body["summary"]["total_tickets"] == 30  # 25 + 3 + 2
    assert body["summary"]["overdue_tickets"] == 2  # both of Alice's past-due, mixed types

    # Alice has 25 tickets (tickets themselves load lazily, not embedded here).
    alice = body["items"][0]
    assert alice["ticket_count"] == 25
    assert "tickets" not in alice

    # Bob's email + legacy-id tickets collapse into a single member with count 3.
    bob = body["items"][1]
    assert bob["ticket_count"] == 3

    # Filter options are populated.
    opts = body["filter_options"]
    assert len(opts["members"]) == 3
    assert "high" in opts["priorities"]
    assert {s["name"] for s in opts["statuses"]} == {"In Progress", "Done"}


async def test_member_ticket_second_page(api, mongo_db):
    await seed(mongo_db)

    r = await api.get("/admin/team-view/members/1/tickets?offset=20&limit=20")
    assert r.status_code == 200
    body = r.json()
    assert body["total"] == 25
    assert len(body["items"]) == 5   # 25 - 20
    assert body["has_more"] is False


async def test_filter_by_member(api, mongo_db):
    await seed(mongo_db)

    r = await api.get("/admin/team-view?member_id=2")
    body = r.json()
    assert body["total"] == 1
    assert body["items"][0]["user_name"] == "Bob B"
    assert body["items"][0]["ticket_count"] == 3


async def test_filter_by_priority(api, mongo_db):
    await seed(mongo_db)

    r = await api.get("/admin/team-view?priority=high")
    body = r.json()
    # Alice's 5 high + Bob's 1 high = 6 tickets across 2 members.
    assert body["summary"]["total_tickets"] == 6
    assert body["summary"]["total_members"] == 2


async def test_filter_by_status(api, mongo_db):
    await seed(mongo_db)

    r = await api.get(f"/admin/team-view?status_id={DONE}")
    body = r.json()
    # Alice's 2 Done + Carol's 2 Done = 4 across 2 members.
    assert body["summary"]["total_tickets"] == 4
    assert body["summary"]["total_members"] == 2


async def test_due_filter_normalizes_mixed_types(api, mongo_db):
    await seed(mongo_db)

    r = await api.get("/admin/team-view?due=overdue")
    body = r.json()
    # Only Alice's two past-due tickets qualify — one stored as a date, one as a string.
    assert body["summary"]["total_members"] == 1
    assert body["summary"]["total_tickets"] == 2
    assert body["items"][0]["ticket_count"] == 2


async def test_search_by_member_name(api, mongo_db):
    await seed(mongo_db)

    # "Carol C" matches Carol's name but none of the ticket titles ("Carol task N").
    r = await api.get("/admin/team-view", params={"search": "Carol C"})
    body = r.json()
    assert body["total"] == 1
    assert body["items"][0]["user_name"] == "Carol C"
    assert body["items"][0]["ticket_count"] == 2


async def test_inactive_member_excluded(api, mongo_db):
    await seed(mongo_db)
    # A deactivated ex-employee with assigned tickets.
    await mongo_db.users.insert_one({"email": "dave@example.com", "name": "Dave D", "user_number": 4,
                                     "role": "user", "is_active": False})
    await mongo_db.tickets.insert_many([
        {"ticket_number": 400 + i, "project_id": 1, "key": f"WEB-{400 + i}", "title": f"Dave task {i}",
         "priority": "high", "status_id": IN_PROGRESS, "assignee_email": "dave@example.com"}
        for i in range(3)
    ])

    body = (await api.get("/admin/team-view")).json()
    # Dave must not appear, and his 3 tickets must not inflate the totals.
    assert body["summary"]["total_members"] == 3
    assert body["summary"]["total_tickets"] == 30
    assert "Dave D" not in [m["user_name"] for m in body["items"]]
    assert "Dave D" not in [m["name"] for m in body["filter_options"]["members"]]


async def test_member_tickets_sort(api, mongo_db):
    await seed(mongo_db)

    asc = (await api.get("/admin/team-view/members/1/tickets?sort=ticket&order=asc&limit=5")).json()
    assert [t["key"] for t in asc["items"]] == ["WEB-100", "WEB-101", "WEB-102", "WEB-103", "WEB-104"]

    desc = (await api.get("/admin/team-view/members/1/tickets?sort=ticket&order=desc&limit=3")).json()
    assert [t["key"] for t in desc["items"]] == ["WEB-124", "WEB-123", "WEB-122"]


async def test_member_tickets_priority_sort_is_by_severity(api, mongo_db):
    await seed(mongo_db)  # Alice: 5 'high' then 20 'medium'

    # Ascending by severity: all 'high' come before any 'medium' (NOT alphabetical).
    asc = (await api.get("/admin/team-view/members/1/tickets?sort=priority&order=asc&limit=6")).json()
    prios = [t["priority"] for t in asc["items"]]
    assert prios == ["high"] * 5 + ["medium"]

    # Descending flips it — least severe first.
    desc = (await api.get("/admin/team-view/members/1/tickets?sort=priority&order=desc&limit=1")).json()
    assert desc["items"][0]["priority"] == "medium"
