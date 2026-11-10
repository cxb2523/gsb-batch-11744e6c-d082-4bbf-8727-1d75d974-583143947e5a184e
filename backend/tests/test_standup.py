"""Integration tests for the daily standup API against a throwaway MongoDB database."""

import json
from datetime import date, datetime, time, timedelta, timezone

import pytest

from app.core.security import CurrentUser
from app.services.standup_time import IST, ist_today

pytestmark = pytest.mark.anyio

TUESDAY = date(2026, 9, 15)   # window: Monday 2026-09-14
MONDAY = date(2026, 9, 14)    # window: Friday 2026-09-11 .. Monday 00:00

ASHA = "asha@example.com"
RAVI = "ravi@example.com"
MEERA = "meera@example.com"
GONE = "gone@example.com"          # deactivated, still on the saved roster
OUTSIDER = "outsider@example.com"  # not on the roster
TWIN = "aaa.twin@example.com"      # shares Ravi's user_number and sorts first alphabetically

STATUS = {"Backlog": 101, "Ready to Pick": 102, "In Progress": 103, "Blocked": 104, "Testing": 105, "Done": 106}


def ist(day: date, hour: int, minute: int = 0) -> datetime:
    """IST wall time stored as naive UTC, the way the app writes it."""
    return datetime.combine(day, time(hour, minute), tzinfo=IST).astimezone(timezone.utc).replace(tzinfo=None)


async def seed(db):
    await db.users.insert_many([
        {"email": ASHA, "name": "Asha Rao", "user_number": 1, "role": "user",
         "google_oauth_tokens": {"access_token": "secret-token"}},
        {"email": RAVI, "name": "Ravi Iyer", "user_number": 2, "role": "user"},
        {"email": TWIN, "name": "Twin", "user_number": 2, "role": "user"},
        {"email": MEERA, "name": "Meera Shah", "user_number": 3, "role": "user"},
        {"email": GONE, "name": "Gone Person", "user_number": 4, "role": "user", "is_active": False},
        {"email": OUTSIDER, "name": "Outsider", "user_number": 5, "role": "user"},
    ])
    await db.projects.insert_many([
        {"project_number": 1, "key": "WEB", "name": "Website"},
        {"project_number": 2, "key": "APP", "name": "Mobile"},
    ])
    await db.ticket_statuses.insert_many([
        {"status_number": number, "project_id": 1, "name": name, "color": "#000", "position": i}
        for i, (name, number) in enumerate(STATUS.items())
    ])
    await db.sprints.insert_one({"sprint_number": 1, "project_id": 1, "state": "active", "name": "S1"})
    await db.standup_settings.insert_one({
        "_id": "default",
        "roster": [{"email": e, "position": i} for i, e in enumerate([ASHA, RAVI, MEERA, GONE])],
    })

    def ticket(n, key, title, status, assignee, **extra):
        return {"ticket_number": n, "project_id": extra.pop("project_id", 1), "key": key, "title": title,
                "type": "task", "priority": extra.pop("priority", "medium"), "status_id": STATUS[status],
                "assignee_email": assignee, "reporter_email": assignee, "created_at": ist(date(2026, 9, 1), 10),
                **extra}

    await db.tickets.insert_many([
        ticket(10, "WEB-10", "Checkout form", "Testing", ASHA),
        ticket(11, "WEB-11", "Payment retry", "Done", ASHA),
        ticket(12, "WEB-12", "Cart badge", "In Progress", ASHA, due_date=ist(date(2026, 9, 10), 18)),
        ticket(13, "WEB-13", "Parent epic-ish story", "In Progress", RAVI),
        ticket(14, "WEB-14", "Child subtask", "In Progress", RAVI, parent_id=13, type="subtask"),
        ticket(15, "WEB-15", "Waiting on API", "Blocked", RAVI),
        ticket(16, "WEB-16", "Backlog idea", "Backlog", MEERA),
        ticket(17, "WEB-17", "Sprint high prio", "Ready to Pick", MEERA, sprint_id=1, priority="high"),
        ticket(18, "WEB-18", "Sprint low prio", "Ready to Pick", MEERA, sprint_id=1, priority="low"),
        ticket(19, "WEB-19", "Archived one", "In Progress", ASHA, archived=True),
        ticket(20, "WEB-20", "Outsider work", "In Progress", OUTSIDER),
        ticket(21, "APP-1", "Deleted project ticket", "In Progress", ASHA, project_id=99),
        ticket(22, "WEB-22", "Friday fix", "In Progress", MEERA),
    ])

    monday = date(2026, 9, 14)
    await db.ticket_history.insert_many([
        # PUT-style pair for one change -> one transition
        {"ticket_id": 10, "field_name": "status_id", "old_value": "103", "new_value": "105", "changed_by": 1, "changed_at": ist(monday, 10)},
        {"ticket_id": 10, "field_name": "status", "old_value": "In Progress", "new_value": "Testing", "changed_by": 1, "changed_at": ist(monday, 10)},
        # board drag: id row only
        {"ticket_id": 11, "field_name": "status_id", "old_value": "105", "new_value": "106", "changed_by": 1, "changed_at": ist(monday, 0, 0)},
        # a minute before the window -> excluded
        {"ticket_id": 12, "field_name": "status_id", "old_value": "102", "new_value": "103", "changed_by": 1, "changed_at": ist(date(2026, 9, 13), 23, 59)},
        # shared user_number 2 must resolve to the roster member Ravi, not the alphabetically-first twin
        {"ticket_id": 14, "field_name": "status_id", "old_value": "102", "new_value": "103", "changed_by": 2, "changed_at": ist(monday, 15)},
        # an untracked field must not create an empty row
        {"ticket_id": 13, "field_name": "watchers", "old_value": None, "new_value": "x", "changed_by": 2, "changed_at": ist(monday, 16)},
        # moved twice in the window
        {"ticket_id": 13, "field_name": "status_id", "old_value": "101", "new_value": "102", "changed_by": 2, "changed_at": ist(monday, 11)},
        {"ticket_id": 13, "field_name": "status_id", "old_value": "102", "new_value": "103", "changed_by": 2, "changed_at": ist(monday, 17)},
        # when WEB-15 became blocked
        {"ticket_id": 15, "field_name": "status_id", "old_value": "103", "new_value": "104", "changed_by": 2, "changed_at": ist(date(2026, 9, 10), 12)},
        # Friday work, only visible on Monday's standup
        {"ticket_id": 22, "field_name": "status_id", "old_value": "102", "new_value": "103", "changed_by": 3, "changed_at": ist(date(2026, 9, 11), 14)},
        # an edit alone is not work, and Backlog never shows
        {"ticket_id": 16, "field_name": "priority", "old_value": "low", "new_value": "medium", "changed_by": 3, "changed_at": ist(date(2026, 9, 11), 15)},
        # outsider activity must never show
        {"ticket_id": 20, "field_name": "status_id", "old_value": "102", "new_value": "103", "changed_by": 5, "changed_at": ist(monday, 12)},
        # activity on a ticket whose project no longer exists
        {"ticket_id": 21, "field_name": "status_id", "old_value": "102", "new_value": "103", "changed_by": 1, "changed_at": ist(monday, 12)},
    ])
    await db.ticket_comments.insert_many([
        {"ticket_id": 13, "project_id": 1, "author_email": RAVI, "content": "on it", "created_at": ist(monday, 12)},
        {"ticket_id": 13, "author_email": RAVI, "content": "[AI Agent] no project_id", "created_at": ist(monday, 13)},
        {"ticket_id": 13, "author_email": None, "text": "automation", "created_at": ist(monday, 14)},
    ])
    await db.worklogs.insert_many([
        # started in the window, logged the next morning
        {"worklog_number": 1, "issue_id": 12, "project_id": 1, "author_email": ASHA, "time_spent_seconds": 5400,
         "started_at": ist(monday, 11), "created_at": ist(date(2026, 9, 15), 9)},
    ])


def person(board, email):
    return next((p for p in board["people"] if p["email"] == email), None)


def keys(rows):
    return [row["key"] for row in rows]


async def test_board_is_empty_until_people_add_things(api, mongo_db):
    await seed(mongo_db)  # plenty of ticket history, comments, worklogs and assigned tickets
    board = (await api.get("/standup/board", params={"date": TUESDAY.isoformat()})).json()

    assert board["yesterday_window"]["since_label"] == "Yesterday"
    assert [p["email"] for p in board["people"]] == [ASHA, RAVI, MEERA]  # roster order, deactivated dropped
    for p in board["people"]:
        assert p["yesterday"] == {"items": [], "tasks": []}
        assert p["today"] == {"items": [], "tasks": []}
        assert p["blockers"] == [] and p["blocker_notes"] == []
        assert p["health"] == "no_update"
    assert board["summary"]["updated"] == 0 and board["summary"]["blockers"] == 0

    monday = (await api.get("/standup/board", params={"date": MONDAY.isoformat()})).json()
    assert monday["yesterday_window"]["since_label"] == "Since Friday"


async def test_added_tickets_show_live_ticket_state(api, mongo_db):
    await seed(mongo_db)
    day = TUESDAY.isoformat()
    assert (await api.put("/standup/items/yesterday", json={"email": RAVI, "date": day, "ticket_id": 14})).status_code == 200
    assert (await api.put("/standup/items/blockers", json={"email": RAVI, "date": day, "ticket_id": 15})).status_code == 200
    assert (await api.put("/standup/today", json={"email": RAVI, "date": day, "ticket_id": 13})).status_code == 200

    ravi = person((await api.get("/standup/board", params={"date": day})).json(), RAVI)
    assert keys(ravi["yesterday"]["items"]) == ["WEB-14"]
    assert ravi["yesterday"]["items"][0]["parent"]["key"] == "WEB-13"
    assert keys(ravi["today"]["items"]) == ["WEB-13"]
    assert keys(ravi["blockers"]) == ["WEB-15"]
    assert ravi["health"] == "blocked" and ravi["counts"]["blockers"] == 1

    # a status change on the ticket shows on the next load
    await mongo_db.tickets.update_one({"ticket_number": 14}, {"$set": {"status_id": STATUS["Done"]}})
    ravi = person((await api.get("/standup/board", params={"date": day})).json(), RAVI)
    assert ravi["yesterday"]["items"][0]["status"]["name"] == "Done" and ravi["counts"]["completed"] == 1

    # entries belong to their date
    other = person((await api.get("/standup/board", params={"date": MONDAY.isoformat()})).json(), RAVI)
    assert other["yesterday"]["items"] == [] and other["blockers"] == []


async def test_board_never_leaks_private_user_fields(api, mongo_db):
    await seed(mongo_db)
    body = (await api.get("/standup/board", params={"date": TUESDAY.isoformat()})).text
    assert "google_oauth_tokens" not in body
    assert "secret-token" not in body


@pytest.mark.parametrize("value", ["16-09-2026", "not-a-date"])
async def test_board_rejects_bad_dates(api, mongo_db, value):
    response = await api.get("/standup/board", params={"date": value})
    assert response.status_code == 400


async def test_board_rejects_future_dates(api, mongo_db):
    response = await api.get("/standup/board", params={"date": (ist_today() + timedelta(days=2)).isoformat()})
    assert response.status_code == 400


async def test_empty_saved_roster_returns_no_people(api, mongo_db):
    await mongo_db.standup_settings.insert_one({"_id": "default", "roster": []})
    board = (await api.get("/standup/board", params={"date": TUESDAY.isoformat()})).json()
    assert board["people"] == []
    assert board["roster_is_default"] is False


async def test_default_roster_used_until_saved(api, mongo_db):
    # With no saved roster, the default is every active user, sorted by email.
    await mongo_db.users.insert_many([
        {"email": RAVI, "name": "Ravi Iyer", "user_number": 2, "role": "user"},
        {"email": ASHA, "name": "Asha Rao", "user_number": 3, "role": "user"},
    ])
    roster = (await api.get("/standup/roster")).json()
    assert roster["is_default"] is True
    emails = [m["email"] for m in roster["members"]]
    assert ASHA in emails and RAVI in emails
    assert emails == sorted(emails)
    assert all(m["has_account"] for m in roster["members"])


async def test_today_add_is_idempotent_and_delete_is_idempotent(api, mongo_db):
    await seed(mongo_db)
    today = ist_today().isoformat()
    body = {"email": MEERA, "date": today, "ticket_id": 17}

    assert (await api.put("/standup/today", json=body)).status_code == 200
    assert (await api.put("/standup/today", json=body)).status_code == 200
    docs = await mongo_db.standup_today_items.find({"email": MEERA, "date": today, "ticket_id": 17}).to_list(None)
    assert len(docs) == 1

    params = {"email": MEERA, "date": today, "ticket_id": 17}
    assert (await api.delete("/standup/today", params=params)).status_code == 204
    assert (await api.delete("/standup/today", params=params)).status_code == 204


async def test_pin_validation(api, mongo_db):
    await seed(mongo_db)
    today = ist_today().isoformat()
    not_on_roster = await api.put("/standup/today", json={"email": OUTSIDER, "date": today, "ticket_id": 20})
    assert not_on_roster.status_code == 422
    missing_ticket = await api.put("/standup/today", json={"email": MEERA, "date": today, "ticket_id": 99999})
    assert missing_ticket.status_code == 404
    archived = await api.put("/standup/today", json={"email": ASHA, "date": today, "ticket_id": 19})
    assert archived.status_code == 404
    too_old = await api.put("/standup/today", json={"email": MEERA, "date": "2020-01-01", "ticket_id": 17})
    assert too_old.status_code == 400


async def test_yesterday_add_and_remove(api, mongo_db):
    await seed(mongo_db)
    day = TUESDAY.isoformat()
    for ticket_id in (22, 22, 11):
        response = await api.put("/standup/items/yesterday", json={"email": MEERA, "date": day, "ticket_id": ticket_id})
        assert response.status_code == 200, response.text
    assert await mongo_db.standup_added_items.count_documents({"email": MEERA, "date": day, "section": "yesterday"}) == 2

    meera = person((await api.get("/standup/board", params={"date": day})).json(), MEERA)
    assert keys(meera["yesterday"]["items"]) == ["WEB-22", "WEB-11"]
    assert meera["yesterday"]["items"][0]["added_by"] == "admin@example.com"
    assert meera["counts"]["completed"] == 1 and meera["counts"]["worked_on"] == 1
    assert meera["health"] == "ok"

    params = {"email": MEERA, "date": day, "ticket_id": 22}
    assert (await api.delete("/standup/items/yesterday", params=params)).status_code == 204
    assert (await api.delete("/standup/items/yesterday", params=params)).status_code == 204
    meera = person((await api.get("/standup/board", params={"date": day})).json(), MEERA)
    assert keys(meera["yesterday"]["items"]) == ["WEB-11"]


async def test_yesterday_add_validation(api, mongo_db):
    await seed(mongo_db)
    day = TUESDAY.isoformat()
    assert (await api.put("/standup/items/yesterday", json={"email": OUTSIDER, "date": day, "ticket_id": 20})).status_code == 422
    assert (await api.put("/standup/items/yesterday", json={"email": ASHA, "date": day, "ticket_id": 19})).status_code == 404
    assert (await api.put("/standup/items/yesterday", json={"email": ASHA, "date": day, "ticket_id": 99999})).status_code == 404
    assert (await api.put("/standup/items/yesterday", json={"email": ASHA, "date": "2020-01-01", "ticket_id": 10})).status_code == 400
    # any status can be added, Backlog included
    assert (await api.put("/standup/items/yesterday", json={"email": MEERA, "date": day, "ticket_id": 16})).status_code == 200


async def test_blocker_tickets_added_by_hand(api, mongo_db):
    await seed(mongo_db)
    day = TUESDAY.isoformat()
    # WEB-17 isn't in a blocked status; WEB-15 already is (Ravi)
    assert (await api.put("/standup/items/blockers", json={"email": MEERA, "date": day, "ticket_id": 17})).status_code == 200
    assert (await api.put("/standup/items/blockers", json={"email": RAVI, "date": day, "ticket_id": 15})).status_code == 200
    assert (await api.put("/standup/items/blockers", json={"email": MEERA, "date": day, "ticket_id": 17})).status_code == 200
    assert (await api.put("/standup/items/tomorrow", json={"email": MEERA, "date": day, "ticket_id": 17})).status_code == 422

    board = (await api.get("/standup/board", params={"date": day})).json()
    meera, ravi = person(board, MEERA), person(board, RAVI)
    assert [r["key"] for r in meera["blockers"]] == ["WEB-17"] and meera["blockers"][0]["added_by"]
    assert meera["health"] == "blocked" and meera["counts"]["blockers"] == 1
    assert [r["key"] for r in ravi["blockers"]] == ["WEB-15"]  # not duplicated
    # adding to blockers does not add to yesterday
    assert meera["yesterday"]["items"] == []

    params = {"email": MEERA, "date": day, "ticket_id": 17}
    assert (await api.delete("/standup/items/blockers", params=params)).status_code == 204
    board = (await api.get("/standup/board", params={"date": day})).json()
    assert person(board, MEERA)["blockers"] == []


async def test_blocker_notes_lifecycle(api, mongo_db):
    await seed(mongo_db)
    day = TUESDAY.isoformat()
    created = await api.post("/standup/blockers", json={"email": MEERA, "date": day, "text": "  Waiting on design sign-off  "})
    assert created.status_code == 201, created.text
    note = created.json()
    assert note["text"] == "Waiting on design sign-off" and note["created_by"] == "admin@example.com"

    board = (await api.get("/standup/board", params={"date": day})).json()
    meera = {p["email"]: p for p in board["people"]}[MEERA]
    assert [n["text"] for n in meera["blocker_notes"]] == ["Waiting on design sign-off"]
    assert meera["health"] == "blocked" and meera["counts"]["blockers"] == 1
    assert board["summary"]["blockers"] == 1

    other_day = (await api.get("/standup/board", params={"date": MONDAY.isoformat()})).json()
    assert {p["email"]: p for p in other_day["people"]}[MEERA]["blocker_notes"] == []

    assert (await api.delete(f"/standup/blockers/{note['id']}")).status_code == 204
    assert (await api.delete(f"/standup/blockers/{note['id']}")).status_code == 204
    assert (await api.delete("/standup/blockers/not-an-id")).status_code == 404
    assert await mongo_db.standup_blocker_notes.count_documents({}) == 0


async def test_blocker_note_validation(api, mongo_db):
    await seed(mongo_db)
    day = TUESDAY.isoformat()
    assert (await api.post("/standup/blockers", json={"email": MEERA, "date": day, "text": "   "})).status_code == 422
    assert (await api.post("/standup/blockers", json={"email": MEERA, "date": day, "text": "x" * 501})).status_code == 422
    assert (await api.post("/standup/blockers", json={"email": OUTSIDER, "date": day, "text": "nope"})).status_code == 422
    assert (await api.post("/standup/blockers", json={"email": MEERA, "date": "2020-01-01", "text": "old"})).status_code == 400
    for _ in range(20):
        assert (await api.post("/standup/blockers", json={"email": MEERA, "date": day, "text": "b"})).status_code == 201
    assert (await api.post("/standup/blockers", json={"email": MEERA, "date": day, "text": "one more"})).status_code == 400


async def test_tasks_crud_and_board_counts(api, mongo_db):
    await seed(mongo_db)
    day = ist_today().isoformat()

    done = await api.post("/standup/tasks", json={"email": MEERA, "date": day, "section": "yesterday", "text": " Vendor call ", "status": "done"})
    assert done.status_code == 201, done.text
    assert done.json()["text"] == "Vendor call"
    wip = (await api.post("/standup/tasks", json={"email": MEERA, "date": day, "section": "yesterday", "text": "Infra doc"})).json()
    assert wip["status"] == "todo"
    plan = (await api.post("/standup/tasks", json={"email": MEERA, "date": day, "section": "today", "text": "Client demo prep", "status": "in_progress"})).json()

    board = (await api.get("/standup/board")).json()
    meera = person(board, MEERA)
    assert [t["text"] for t in meera["yesterday"]["tasks"]] == ["Vendor call", "Infra doc"]
    assert [t["text"] for t in meera["today"]["tasks"]] == ["Client demo prep"]
    assert meera["counts"]["completed"] == 1 and meera["counts"]["worked_on"] == 1
    assert meera["health"] != "no_update"

    patched = await api.patch(f"/standup/tasks/{wip['id']}", json={"status": "in_progress", "text": "Infra doc v2"})
    assert patched.status_code == 200 and patched.json()["status"] == "in_progress" and patched.json()["text"] == "Infra doc v2"
    assert (await api.patch(f"/standup/tasks/{wip['id']}", json={})).status_code == 400
    assert (await api.patch(f"/standup/tasks/{wip['id']}", json={"status": "shipped"})).status_code == 422
    assert (await api.patch(f"/standup/tasks/{wip['id']}", json={"text": "  "})).status_code == 422
    assert (await api.patch("/standup/tasks/000000000000000000000000", json={"status": "done"})).status_code == 404

    assert (await api.delete(f"/standup/tasks/{plan['id']}")).status_code == 204
    assert (await api.delete(f"/standup/tasks/{plan['id']}")).status_code == 204
    assert (await api.delete("/standup/tasks/nope")).status_code == 404


async def test_task_validation(api, mongo_db):
    await seed(mongo_db)
    day = ist_today().isoformat()
    base = {"email": MEERA, "date": day, "section": "today", "text": "x"}
    assert (await api.post("/standup/tasks", json={**base, "text": "  "})).status_code == 422
    assert (await api.post("/standup/tasks", json={**base, "section": "tomorrow"})).status_code == 422
    assert (await api.post("/standup/tasks", json={**base, "text": "x" * 501})).status_code == 422
    assert (await api.post("/standup/tasks", json={**base, "email": OUTSIDER})).status_code == 422
    assert (await api.post("/standup/tasks", json={**base, "date": "2020-01-01"})).status_code == 400


async def test_task_carry_forward(api, mongo_db):
    from app.services.standup_time import next_working_day

    await seed(mongo_db)
    today = ist_today()
    day = today.isoformat()

    yesterday_task = (await api.post("/standup/tasks", json={"email": MEERA, "date": day, "section": "yesterday", "text": "Half-done migration", "status": "in_progress"})).json()
    carried = await api.post(f"/standup/tasks/{yesterday_task['id']}/carry-forward")
    assert carried.status_code == 200, carried.text
    copy = carried.json()
    assert copy["section"] == "today" and copy["status"] == "in_progress" and copy["carried_from"] == yesterday_task["id"]
    again = (await api.post(f"/standup/tasks/{yesterday_task['id']}/carry-forward")).json()
    assert again["id"] == copy["id"]  # idempotent
    assert await mongo_db.standup_tasks.count_documents({"carried_from": yesterday_task["id"]}) == 1

    # today's task lands on the next working day
    onward = (await api.post(f"/standup/tasks/{copy['id']}/carry-forward")).json()
    doc = await mongo_db.standup_tasks.find_one({"carried_from": copy["id"]})
    assert doc["date"] == next_working_day(today).isoformat() and onward["section"] == "today"

    board = (await api.get("/standup/board")).json()
    assert board["carry_forward_date"] == next_working_day(today).isoformat()
    meera = person(board, MEERA)
    assert meera["yesterday"]["tasks"][0]["carried_forward"] is True
    assert meera["today"]["tasks"][0]["carried_forward"] is True

    done = (await api.post("/standup/tasks", json={"email": MEERA, "date": day, "section": "today", "text": "Shipped", "status": "done"})).json()
    assert (await api.post(f"/standup/tasks/{done['id']}/carry-forward")).status_code == 400


async def test_ticket_carry_forward_pins_next_working_day(api, mongo_db):
    from app.services.standup_time import next_working_day

    await seed(mongo_db)
    today = ist_today()
    target = next_working_day(today).isoformat()
    for ticket_id in (10, 12):
        assert (await api.put("/standup/today", json={"email": ASHA, "date": today.isoformat(), "ticket_id": ticket_id})).status_code == 200
    response = await api.put("/standup/today", json={"email": ASHA, "date": target, "ticket_id": 10})
    assert response.status_code == 200, response.text
    too_far = next_working_day(next_working_day(today)).isoformat()
    assert (await api.put("/standup/today", json={"email": ASHA, "date": too_far, "ticket_id": 10})).status_code == 400

    board = (await api.get("/standup/board")).json()
    rows = {r["id"]: r for r in person(board, ASHA)["today"]["items"]}
    assert rows[10]["carried_forward"] is True
    assert all(not r["carried_forward"] for tid, r in rows.items() if tid != 10)


async def test_finished_work_reports_in_yesterday_but_does_not_return_to_today(api, mongo_db):
    from app.services.standup_time import previous_working_day

    await seed(mongo_db)
    today = ist_today()
    previous = previous_working_day(today).isoformat()
    # Asha planned: WEB-10 (Testing), WEB-11 (Done), WEB-12 (In Progress), WEB-15 is Ravi's so use 13 for Ravi
    for ticket_id in (10, 11, 12):
        await mongo_db.standup_today_items.insert_one(
            {"email": ASHA, "date": previous, "ticket_id": ticket_id, "project_id": 1, "kind": "pin",
             "created_by": ASHA, "created_at": ist(TUESDAY, 9)}
        )
    await mongo_db.standup_today_items.insert_one(
        {"email": RAVI, "date": previous, "ticket_id": 15, "project_id": 1, "kind": "pin", "created_by": RAVI, "created_at": ist(TUESDAY, 9)}
    )

    board = (await api.get("/standup/board")).json()
    asha, ravi = person(board, ASHA), person(board, RAVI)
    assert set(keys(asha["yesterday"]["items"])) == {"WEB-10", "WEB-11", "WEB-12"}   # all reported on
    assert keys(asha["today"]["items"]) == ["WEB-12"]                                # only in-progress continues
    assert keys(ravi["yesterday"]["items"]) == ["WEB-15"]                            # blocked: reported,
    assert ravi["today"]["items"] == []                                              # but not planned again


async def test_archived_and_deleted_tickets_drop_off_the_board(api, mongo_db):
    from app.services.standup_time import previous_working_day

    await seed(mongo_db)
    today = ist_today()
    day = today.isoformat()
    for ticket_id in (12, 13):
        assert (await api.put("/standup/today", json={"email": ASHA if ticket_id == 12 else RAVI, "date": day, "ticket_id": ticket_id})).status_code == 200
    assert (await api.put("/standup/items/blockers", json={"email": RAVI, "date": day, "ticket_id": 15})).status_code == 200

    await mongo_db.tickets.update_one({"ticket_number": 12}, {"$set": {"archived": True}})   # archived
    await mongo_db.tickets.delete_one({"ticket_number": 15})                                 # deleted

    board = (await api.get("/standup/board")).json()
    assert person(board, ASHA)["today"]["items"] == []
    assert keys(person(board, RAVI)["today"]["items"]) == ["WEB-13"]
    assert person(board, RAVI)["blockers"] == []

    # and the next day's carry-over does not bring them back
    await mongo_db.standup_today_items.insert_one(
        {"email": MEERA, "date": previous_working_day(today).isoformat(), "ticket_id": 12, "project_id": 1,
         "kind": "pin", "created_by": MEERA, "created_at": ist(TUESDAY, 9)}
    )
    await mongo_db.standup_day_seeds.delete_many({"email": MEERA})
    meera = person((await api.get("/standup/board")).json(), MEERA)
    assert meera["yesterday"]["items"] == [] and meera["today"]["items"] == []
    assert await mongo_db.standup_added_items.count_documents({"email": MEERA, "ticket_id": 12}) == 0


async def test_carry_over_reaches_past_skipped_days(api, mongo_db):
    """A holiday or a day nobody opened must not break the chain."""
    await seed(mongo_db)
    today = ist_today()
    last_seen = (today - timedelta(days=6)).isoformat()   # nothing since then
    await mongo_db.standup_today_items.insert_one(
        {"email": MEERA, "date": last_seen, "ticket_id": 17, "project_id": 1, "kind": "pin",
         "created_by": MEERA, "created_at": ist(TUESDAY, 9)}
    )
    meera = person((await api.get("/standup/board")).json(), MEERA)
    assert keys(meera["today"]["items"]) == ["WEB-17"]
    assert meera["today"]["items"][0]["carried_from_date"] == last_seen
    seed_doc = await mongo_db.standup_day_seeds.find_one({"email": MEERA, "date": today.isoformat()})
    assert seed_doc["source_date"] == last_seen

    # nothing within the lookback window: start empty
    await mongo_db.standup_today_items.insert_one(
        {"email": RAVI, "date": (today - timedelta(days=30)).isoformat(), "ticket_id": 13, "project_id": 1,
         "kind": "pin", "created_by": RAVI, "created_at": ist(TUESDAY, 9)}
    )
    await mongo_db.standup_day_seeds.delete_many({"email": RAVI})
    assert person((await api.get("/standup/board")).json(), RAVI)["today"]["items"] == []


async def test_failed_carry_over_is_retried_not_lost(api, mongo_db, monkeypatch):
    from app.services import standup_carryover
    from app.services.standup_time import previous_working_day

    await seed(mongo_db)
    today = ist_today()
    await mongo_db.standup_today_items.insert_one(
        {"email": MEERA, "date": previous_working_day(today).isoformat(), "ticket_id": 17, "project_id": 1,
         "kind": "pin", "created_by": MEERA, "created_at": ist(TUESDAY, 9)}
    )
    real_copy = standup_carryover._copy

    async def flaky(*args, **kwargs):
        raise RuntimeError("database blip")

    monkeypatch.setattr(standup_carryover, "_copy", flaky)
    first = await api.get("/standup/board")
    assert first.status_code == 200                                   # the board still loads
    assert person(first.json(), MEERA)["today"]["items"] == []
    assert await mongo_db.standup_day_seeds.count_documents({"email": MEERA}) == 0   # claim released

    monkeypatch.setattr(standup_carryover, "_copy", real_copy)
    second = person((await api.get("/standup/board")).json(), MEERA)
    assert keys(second["today"]["items"]) == ["WEB-17"]                # finished on the next load
    third = person((await api.get("/standup/board")).json(), MEERA)
    assert keys(third["today"]["items"]) == ["WEB-17"]                 # and not duplicated


async def test_past_standups_are_locked_except_for_admins(api, mongo_db):
    await seed(mongo_db)
    past = (ist_today() - timedelta(days=1)).isoformat()

    api.state["user"] = CurrentUser(user_id=3, email=MEERA, name="Meera", role="user")
    locked = await api.put("/standup/today", json={"email": MEERA, "date": past, "ticket_id": 17})
    assert locked.status_code == 400 and "Past" in locked.json()["detail"]
    assert (await api.delete("/standup/today", params={"email": MEERA, "date": past, "ticket_id": 17})).status_code == 400
    assert (await api.post("/standup/tasks", json={"email": MEERA, "date": past, "section": "today", "text": "x"})).status_code == 400

    # an admin may correct recent history
    api.state["user"] = CurrentUser(user_id=1, email="admin@example.com", name="Admin", role="admin")
    assert (await api.put("/standup/today", json={"email": MEERA, "date": past, "ticket_id": 17})).status_code == 200
    task = (await api.post("/standup/tasks", json={"email": MEERA, "date": past, "section": "today", "text": "fix"})).json()

    # ...and Meera still can't delete it
    api.state["user"] = CurrentUser(user_id=3, email=MEERA, name="Meera", role="user")
    assert (await api.delete(f"/standup/tasks/{task['id']}")).status_code == 400


async def test_export_counts_a_carried_task_as_one_piece_of_work(api, mongo_db):
    from io import BytesIO

    from openpyxl import load_workbook

    from app.services.standup_time import previous_working_day

    await seed(mongo_db)
    previous = previous_working_day(ist_today()).isoformat()
    await mongo_db.standup_tasks.insert_one(
        {"email": MEERA, "date": previous, "section": "today", "text": "Long migration", "status": "in_progress",
         "created_by": MEERA, "created_at": ist(TUESDAY, 9)}
    )
    await api.get("/standup/board")   # carry-over copies it into Yesterday and Today

    book = load_workbook(BytesIO((await api.get("/standup/export", params={"email": MEERA})).content))
    rows = [row for row in list(book["Work Summary"].values)[1:] if row[2] == "Long migration"]
    assert len(rows) == 1
    assert rows[0][8] == 2 and rows[0][6] == previous   # two standup days, starting the previous one


async def test_move_cards_between_yesterday_and_today(api, mongo_db):
    await seed(mongo_db)
    day = ist_today().isoformat()
    move = lambda **body: api.post("/standup/move", json={"email": MEERA, "date": day, **body})  # noqa: E731

    await api.put("/standup/items/yesterday", json={"email": MEERA, "date": day, "ticket_id": 17})
    # yesterday -> today moves it, never copies it
    assert (await move(kind="ticket", ticket_id=17, to="today")).status_code == 200
    meera = person((await api.get("/standup/board")).json(), MEERA)
    assert keys(meera["today"]["items"]) == ["WEB-17"] and meera["yesterday"]["items"] == []
    # and back again
    assert (await move(kind="ticket", ticket_id=17, to="yesterday")).status_code == 200
    meera = person((await api.get("/standup/board")).json(), MEERA)
    assert keys(meera["yesterday"]["items"]) == ["WEB-17"] and meera["today"]["items"] == []

    # already in the other column: refused, nothing changes
    await api.put("/standup/today", json={"email": MEERA, "date": day, "ticket_id": 17})
    duplicate = await move(kind="ticket", ticket_id=17, to="today")
    assert duplicate.status_code == 409 and duplicate.json()["detail"] == "Already in Today"
    # not in the source column
    assert (await move(kind="ticket", ticket_id=18, to="today")).status_code == 404

    # adhoc tasks move by changing column
    task = (await api.post("/standup/tasks", json={"email": MEERA, "date": day, "section": "yesterday", "text": "Vendor call"})).json()
    assert (await move(kind="task", task_id=task["id"], to="today")).status_code == 200
    meera = person((await api.get("/standup/board")).json(), MEERA)
    assert [t["text"] for t in meera["today"]["tasks"]] == ["Vendor call"] and meera["yesterday"]["tasks"] == []
    # a task whose linked copy is already in the target can't be dropped there
    carried = (await api.post(f"/standup/tasks/{task['id']}/carry-forward")).json()   # today -> next working day
    assert carried["id"]
    linked = (await api.post("/standup/tasks", json={"email": MEERA, "date": day, "section": "yesterday", "text": "Shared"})).json()
    copy = (await api.post(f"/standup/tasks/{linked['id']}/carry-forward")).json()     # yesterday -> today copy
    assert (await move(kind="task", task_id=linked["id"], to="today")).status_code == 409
    assert (await move(kind="task", task_id=copy["id"], to="yesterday")).status_code == 409

    # validation and permissions
    assert (await move(kind="ticket", to="today")).status_code == 422
    api.state["user"] = CurrentUser(user_id=2, email=RAVI, name="Ravi", role="user")
    assert (await move(kind="ticket", ticket_id=17, to="yesterday")).status_code == 403


async def test_today_accepts_every_status(api, mongo_db):
    await seed(mongo_db)
    today = ist_today().isoformat()
    for email, ticket_id in [(MEERA, 16), (RAVI, 15), (ASHA, 11)]:   # Backlog, Blocked, Done
        response = await api.put("/standup/today", json={"email": email, "date": today, "ticket_id": ticket_id})
        assert response.status_code == 200, response.text
    assert keys(person((await api.get("/standup/board")).json(), MEERA)["today"]["items"]) == ["WEB-16"]


async def test_today_carries_over_from_the_previous_working_day(api, mongo_db):
    from app.services.standup_time import previous_working_day

    await seed(mongo_db)
    today = ist_today()
    yesterday = previous_working_day(today).isoformat()
    # what Meera had planned on the previous working day
    await mongo_db.standup_today_items.insert_many([
        {"email": MEERA, "date": yesterday, "ticket_id": 17, "project_id": 1, "kind": "pin", "created_by": MEERA, "created_at": ist(TUESDAY, 9)},
        {"email": MEERA, "date": yesterday, "ticket_id": 18, "project_id": 1, "kind": "pin", "created_by": MEERA, "created_at": ist(TUESDAY, 9)},
    ])
    await mongo_db.standup_added_items.insert_one(
        {"email": MEERA, "date": yesterday, "section": "blockers", "ticket_id": 16, "project_id": 1,
         "created_by": MEERA, "created_at": ist(TUESDAY, 9)}
    )
    await mongo_db.standup_blocker_notes.insert_one(
        {"email": MEERA, "date": yesterday, "text": "Still waiting on the vendor", "created_by": MEERA, "created_at": ist(TUESDAY, 9)}
    )
    await mongo_db.standup_tasks.insert_many([
        {"email": MEERA, "date": yesterday, "section": "today", "text": "Finish migration", "status": "in_progress",
         "created_by": MEERA, "created_at": ist(TUESDAY, 9)},
        {"email": MEERA, "date": yesterday, "section": "today", "text": "Shipped already", "status": "done",
         "created_by": MEERA, "created_at": ist(TUESDAY, 9)},
        {"email": MEERA, "date": yesterday, "section": "yesterday", "text": "Not today's plan", "status": "todo",
         "created_by": MEERA, "created_at": ist(TUESDAY, 9)},
    ])

    meera = person((await api.get("/standup/board")).json(), MEERA)
    # Since-yesterday: everything that was planned, in any status
    assert set(keys(meera["yesterday"]["items"])) == {"WEB-17", "WEB-18"}
    assert {t["text"] for t in meera["yesterday"]["tasks"]} == {"Finish migration", "Shipped already"}
    # Today: only what's still Ready to Pick / In Progress, and tasks not yet done
    assert keys(meera["today"]["items"]) == ["WEB-17", "WEB-18"]
    assert all(r["carried_from_date"] == yesterday for r in meera["today"]["items"])
    assert [t["text"] for t in meera["today"]["tasks"]] == ["Finish migration"]
    # the task in both columns is linked: today's copy points at yesterday's
    finish_y = next(t for t in meera["yesterday"]["tasks"] if t["text"] == "Finish migration")
    assert meera["today"]["tasks"][0]["carried_from"] == finish_y["id"]
    # blockers carry over too, tickets and notes alike
    assert keys(meera["blockers"]) == ["WEB-16"]
    assert meera["blockers"][0]["carried_from_date"] == yesterday
    assert [n["text"] for n in meera["blocker_notes"]] == ["Still waiting on the vendor"]
    assert meera["blocker_notes"][0]["carried_from_date"] == yesterday

    # the copy is editable and the day is never seeded twice
    params = {"email": MEERA, "date": today.isoformat(), "ticket_id": 17}
    assert (await api.delete("/standup/today", params=params)).status_code == 204
    meera = person((await api.get("/standup/board")).json(), MEERA)
    assert keys(meera["today"]["items"]) == ["WEB-18"]
    assert await mongo_db.standup_day_seeds.count_documents({"email": MEERA, "date": today.isoformat()}) == 1

    # someone with nothing planned yesterday still starts empty
    assert person((await api.get("/standup/board")).json(), ASHA)["today"]["items"] == []


async def test_only_the_person_or_an_admin_can_change_a_board(api, mongo_db):
    await seed(mongo_db)
    day = ist_today().isoformat()

    # admin sets Meera up: allowed
    assert (await api.put("/standup/today", json={"email": MEERA, "date": day, "ticket_id": 17})).status_code == 200
    note = (await api.post("/standup/blockers", json={"email": MEERA, "date": day, "text": "admin note"})).json()
    task = (await api.post("/standup/tasks", json={"email": MEERA, "date": day, "section": "today", "text": "admin task"})).json()

    # Ravi, an ordinary user, may not touch Meera's board
    api.state["user"] = CurrentUser(user_id=2, email=RAVI, name="Ravi", role="user")
    forbidden = await api.put("/standup/today", json={"email": MEERA, "date": day, "ticket_id": 18})
    assert forbidden.status_code == 403 and "admin" in forbidden.json()["detail"]
    assert (await api.delete("/standup/today", params={"email": MEERA, "date": day, "ticket_id": 17})).status_code == 403
    assert (await api.put("/standup/items/yesterday", json={"email": MEERA, "date": day, "ticket_id": 13})).status_code == 403
    assert (await api.delete("/standup/items/yesterday", params={"email": MEERA, "date": day, "ticket_id": 13})).status_code == 403
    assert (await api.post("/standup/blockers", json={"email": MEERA, "date": day, "text": "nope"})).status_code == 403
    assert (await api.delete(f"/standup/blockers/{note['id']}")).status_code == 403
    assert (await api.post("/standup/tasks", json={"email": MEERA, "date": day, "section": "today", "text": "nope"})).status_code == 403
    assert (await api.patch(f"/standup/tasks/{task['id']}", json={"status": "done"})).status_code == 403
    assert (await api.delete(f"/standup/tasks/{task['id']}")).status_code == 403
    assert (await api.post(f"/standup/tasks/{task['id']}/carry-forward")).status_code == 403

    # nothing of Meera's changed, and reading is still allowed
    board = (await api.get("/standup/board")).json()
    meera = person(board, MEERA)
    assert keys(meera["today"]["items"]) == ["WEB-17"] and len(meera["blocker_notes"]) == 1
    assert meera["can_edit"] is False and person(board, RAVI)["can_edit"] is True

    # Ravi can change his own
    assert (await api.put("/standup/today", json={"email": RAVI, "date": day, "ticket_id": 13})).status_code == 200

    # an admin sees every board as editable
    api.state["user"] = CurrentUser(user_id=1, email="admin@example.com", name="Admin", role="admin")
    assert all(p["can_edit"] for p in (await api.get("/standup/board")).json()["people"])


async def test_work_export_workbook(api, mongo_db):
    from io import BytesIO

    from openpyxl import load_workbook

    await seed(mongo_db)
    day = ist_today().isoformat()
    await api.put("/standup/items/yesterday", json={"email": MEERA, "date": day, "ticket_id": 17})
    await api.put("/standup/today", json={"email": MEERA, "date": day, "ticket_id": 17})   # same ticket, both columns
    await api.put("/standup/items/blockers", json={"email": MEERA, "date": day, "ticket_id": 18})
    await api.post("/standup/tasks", json={"email": MEERA, "date": day, "section": "yesterday", "text": "Vendor call", "status": "done"})

    response = await api.get("/standup/export", params={"email": MEERA})
    assert response.status_code == 200, response.text
    assert response.headers["content-type"].startswith("application/vnd.openxmlformats")
    assert "standup-work-meera-shah-" in response.headers["content-disposition"]

    book = load_workbook(BytesIO(response.content))
    assert book.sheetnames == ["Work Summary", "Daily Log", "About"]

    summary = list(book["Work Summary"].values)
    assert summary[0][:3] == ("Type", "Key", "Title")
    rows = {row[1] or row[2]: row for row in summary[1:]}
    assert set(rows) == {"WEB-17", "WEB-18", "Vendor call"}
    web17 = rows["WEB-17"]
    assert web17[4] == "Ready to Pick" and web17[8] == 1          # current status, days on standup
    assert (web17[9], web17[10]) == ("Yes", "Yes") and not web17[11]  # worked on + planned, not blocked
    assert rows["WEB-18"][11] == "Yes"                            # blocker
    assert rows["Vendor call"][0] == "Adhoc Task"

    log = list(book["Daily Log"].values)
    assert len(log) == 5                                          # header + 4 entries
    assert {row[1] for row in log[1:]} == {"Worked on", "Planned", "Blocker"}

    # date filtering and validation
    empty = await api.get("/standup/export", params={"email": MEERA, "from": "2020-01-01", "to": "2020-01-31"})
    assert len(list(load_workbook(BytesIO(empty.content))["Work Summary"].values)) == 1
    assert (await api.get("/standup/export", params={"email": MEERA, "from": "2026-02-01", "to": "2026-01-01"})).status_code == 400

    # someone else's history is private
    api.state["user"] = CurrentUser(user_id=2, email=RAVI, name="Ravi", role="user")
    assert (await api.get("/standup/export", params={"email": MEERA})).status_code == 403
    assert (await api.get("/standup/export", params={"email": RAVI})).status_code == 200


async def test_roster_update_is_admin_only_and_validated(api, mongo_db):
    await seed(mongo_db)

    api.state["user"] = CurrentUser(user_id=3, email=MEERA, name="Meera", role="user")
    assert (await api.put("/standup/roster", json={"emails": [ASHA]})).status_code == 403
    assert (await api.get("/standup/roster/candidates")).status_code == 403

    api.state["user"] = CurrentUser(user_id=1, email="admin@example.com", name="Admin", role="admin")
    unknown = await api.put("/standup/roster", json={"emails": [ASHA, "nobody@example.com"]})
    assert unknown.status_code == 400 and "nobody@example.com" in unknown.json()["detail"]

    saved = await api.put("/standup/roster", json={"emails": [" Ravi@example.com ", ASHA, RAVI, MEERA]})
    assert saved.status_code == 200, saved.text
    members = saved.json()["members"]
    assert [m["email"] for m in members] == [RAVI, ASHA, MEERA]  # normalised, de-duplicated, ordered
    assert members[2]["has_account"] is True                     # roster members must be known users

    board = (await api.get("/standup/board", params={"date": TUESDAY.isoformat()})).json()
    assert [p["email"] for p in board["people"]] == [RAVI, ASHA, MEERA]


async def test_person_ticket_search(api, mongo_db):
    await seed(mongo_db)
    results = (await api.get("/standup/tickets", params={"email": MEERA, "q": "sprint"})).json()
    assert {r["key"] for r in results} == {"WEB-17", "WEB-18"}
    everything = {r["key"] for r in (await api.get("/standup/tickets", params={"email": ASHA})).json()}
    assert {"WEB-10", "WEB-11", "WEB-12"} <= everything    # every status, done included
    assert "WEB-19" not in everything                      # archived excluded
    assert "WEB-20" not in everything                      # someone else's ticket
    for section in ("yesterday", "today", "blockers"):
        offered = {r["key"] for r in (await api.get("/standup/tickets", params={"email": MEERA, "section": section})).json()}
        assert offered == {"WEB-16", "WEB-17", "WEB-18", "WEB-22"}, section   # Backlog offered everywhere
    regex_chars = await api.get("/standup/tickets", params={"email": MEERA, "q": "(.*"})
    assert regex_chars.status_code == 200


async def test_requires_authentication(mongo_db):
    import httpx
    from app.main import app

    app.dependency_overrides.clear()
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        assert (await client.get("/standup/board")).status_code == 401


async def test_json_serialises_window_aliases():
    from app.schemas.standup import StandupWindow

    window = StandupWindow(start=datetime(2026, 9, 14, tzinfo=timezone.utc), end=datetime(2026, 9, 15, tzinfo=timezone.utc),
                           label="Mon, Sep 14", since_label="Yesterday")
    dumped = json.loads(window.model_dump_json(by_alias=True))
    assert "from" in dumped and "to" in dumped
