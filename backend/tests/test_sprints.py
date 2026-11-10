"""Integration tests for sprint lifecycle against a throwaway MongoDB database.

Focus: a project may run several active sprints at once (parallel team tracks),
and completing one must not disturb the others. Also covers the velocity
snapshot taken at completion.
"""

from datetime import datetime, timedelta, timezone

import pytest

pytestmark = pytest.mark.anyio

PROJECT = 1
STATUS = {"Backlog": 101, "In Progress": 102, "Done": 103}


async def seed(db):
    await db.projects.insert_one({"project_number": PROJECT, "key": "WEB", "name": "Website"})
    await db.ticket_statuses.insert_many([
        {"status_number": number, "project_id": PROJECT, "name": name, "position": i}
        for i, (name, number) in enumerate(STATUS.items())
    ])


async def make_sprint(api, name):
    """Create a sprint via the API and return its id (sprint_number).

    A sprint needs a (future) end date to be started — see the date-governance
    rule in start_sprint — so seed one here.
    """
    end_date = (datetime.now(timezone.utc) + timedelta(days=14)).isoformat()
    resp = await api.post(
        f"/projects/{PROJECT}/sprints", json={"name": name, "end_date": end_date}
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


async def add_ticket(db, ticket_number, sprint_id, status, story_points):
    await db.tickets.insert_one({
        "ticket_number": ticket_number,
        "project_id": PROJECT,
        "key": f"WEB-{ticket_number}",
        "title": f"Ticket {ticket_number}",
        "type": "task",
        "priority": "medium",
        "status_id": STATUS[status],
        "sprint_id": sprint_id,
        "story_points": story_points,
        "created_at": datetime.now(timezone.utc),
    })


async def test_multiple_sprints_can_be_active_at_once(api, mongo_db):
    await seed(mongo_db)
    backend = await make_sprint(api, "Backend Sprint")
    design = await make_sprint(api, "Design Sprint")

    assert (await api.post(f"/projects/{PROJECT}/sprints/{backend}/start")).status_code == 200
    # Second start must NOT be blocked by the first being active.
    resp = await api.post(f"/projects/{PROJECT}/sprints/{design}/start")
    assert resp.status_code == 200, resp.text

    active = (await api.get(f"/projects/{PROJECT}/sprints", params={"state": "active"})).json()
    assert {s["id"] for s in active} == {backend, design}


async def test_completing_one_sprint_leaves_the_other_active(api, mongo_db):
    await seed(mongo_db)
    backend = await make_sprint(api, "Backend Sprint")
    design = await make_sprint(api, "Design Sprint")
    await api.post(f"/projects/{PROJECT}/sprints/{backend}/start")
    await api.post(f"/projects/{PROJECT}/sprints/{design}/start")

    assert (await api.post(f"/projects/{PROJECT}/sprints/{backend}/complete")).status_code == 200

    active = (await api.get(f"/projects/{PROJECT}/sprints", params={"state": "active"})).json()
    assert [s["id"] for s in active] == [design]
    closed = (await api.get(f"/projects/{PROJECT}/sprints", params={"state": "closed"})).json()
    assert [s["id"] for s in closed] == [backend]


async def test_complete_moves_incomplete_issues_to_another_active_sprint(api, mongo_db):
    await seed(mongo_db)
    backend = await make_sprint(api, "Backend Sprint")
    design = await make_sprint(api, "Design Sprint")
    await api.post(f"/projects/{PROJECT}/sprints/{backend}/start")
    await api.post(f"/projects/{PROJECT}/sprints/{design}/start")
    await add_ticket(mongo_db, 1, backend, "Done", 3)
    await add_ticket(mongo_db, 2, backend, "In Progress", 5)  # incomplete

    resp = await api.post(
        f"/projects/{PROJECT}/sprints/{backend}/complete",
        json={"move_to_sprint_id": design},
    )
    assert resp.status_code == 200, resp.text

    moved = await mongo_db.tickets.find_one({"ticket_number": 2})
    assert moved["sprint_id"] == design
    done = await mongo_db.tickets.find_one({"ticket_number": 1})
    assert done["sprint_id"] == backend  # finished work stays with its sprint


async def test_capacity_is_independent_per_sprint(api, mongo_db):
    await seed(mongo_db)
    backend = await make_sprint(api, "Backend Sprint")
    design = await make_sprint(api, "Design Sprint")
    await add_ticket(mongo_db, 1, backend, "Done", 3)
    await add_ticket(mongo_db, 2, backend, "In Progress", 5)
    await add_ticket(mongo_db, 3, design, "Done", 8)

    cap_backend = (await api.get(f"/projects/{PROJECT}/sprints/{backend}/capacity")).json()
    cap_design = (await api.get(f"/projects/{PROJECT}/sprints/{design}/capacity")).json()

    assert cap_backend["total_story_points"] == 8
    assert cap_backend["completed_story_points"] == 3
    assert cap_design["total_story_points"] == 8
    assert cap_design["completed_story_points"] == 8


async def test_velocity_uses_snapshot_from_completion(api, mongo_db):
    await seed(mongo_db)
    sprint = await make_sprint(api, "Sprint 1")
    await api.post(f"/projects/{PROJECT}/sprints/{sprint}/start")
    await add_ticket(mongo_db, 1, sprint, "Done", 3)
    await add_ticket(mongo_db, 2, sprint, "In Progress", 5)  # incomplete -> moved to backlog

    await api.post(f"/projects/{PROJECT}/sprints/{sprint}/complete")

    # The incomplete ticket left the sprint, but velocity still reflects what
    # was committed (8) and completed (3) at the moment of completion.
    velocity = (await api.get(f"/projects/{PROJECT}/reports/velocity")).json()
    assert len(velocity["sprints"]) == 1
    point = velocity["sprints"][0]
    assert point["committed"] == 8
    assert point["completed"] == 3
