"""Integration tests for project lifecycle tracking."""

from datetime import date, datetime, timedelta, timezone

import pytest

from app.core.security import CurrentUser

pytestmark = pytest.mark.anyio

PROJECT = 1
OTHER_PROJECT = 2
MEMBER = "dev@example.com"
OUTSIDER = "outsider@example.com"


async def seed(db):
    await db.users.insert_many([
        {"email": MEMBER, "name": "Dev Kumar", "user_number": 11, "role": "user"},
        {"email": OUTSIDER, "name": "Outsider", "user_number": 12, "role": "user"},
    ])
    await db.projects.insert_many([
        {"project_number": PROJECT, "key": "DEMO", "name": "Demo Platform"},
        {"project_number": OTHER_PROJECT, "key": "SCR", "name": "Scribe"},
    ])
    await db.project_members.insert_one(
        {"project_id": PROJECT, "user_id": 11, "user_email": MEMBER, "role": "member", "active": True}
    )
    await db.ticket_statuses.insert_many([
        {"status_number": 1, "project_id": PROJECT, "name": "In Progress", "position": 2},
        {"status_number": 2, "project_id": PROJECT, "name": "Done", "position": 5},
    ])
    await db.tickets.insert_many([
        {"ticket_number": 501, "project_id": PROJECT, "key": "DEMO-1", "title": "CSV import parser", "status_id": 1},
        {"ticket_number": 502, "project_id": PROJECT, "key": "DEMO-2", "title": "CSV rate mapping", "status_id": 2},
        {"ticket_number": 503, "project_id": PROJECT, "key": "DEMO-3", "title": "Archived work", "status_id": 1, "archived": True},
        {"ticket_number": 601, "project_id": OTHER_PROJECT, "key": "SCR-1", "title": "Elsewhere", "status_id": 1},
    ])


def as_member(api):
    api.state["user"] = CurrentUser(user_id=11, email=MEMBER, name="Dev Kumar", role="user")


def stage(board, key):
    return next(item for item in board["stages"] if item["key"] == key)


async def test_lifecycle_starts_from_the_company_flow(api, mongo_db):
    await seed(mongo_db)
    as_member(api)

    response = await api.get(f"/projects/{PROJECT}/lifecycle")
    assert response.status_code == 200, response.text
    board = response.json()

    assert [item["key"] for item in board["stages"]] == [
        "prd_received", "product_prd", "design", "design_review", "design_approval", "dev_handoff",
        "dev_review", "scoping", "module_development", "uat_deployment", "prod_deployment", "delivery",
    ]
    assert [item["codename"] for item in board["stages"]][:4] == ["Signal", "Blueprint", "Canvas", "Calibrate"]
    assert {item["key"] for item in board["stages"] if item["is_milestone"]} == {
        "design_approval", "dev_handoff", "uat_deployment", "prod_deployment", "delivery",
    }
    assert all(item["state"] == "not_started" for item in board["stages"])
    assert board["project_name"] == "Demo Platform" and board["project_key"] == "DEMO"
    assert board["current_stage"] is None
    assert board["summary"] == {
        "total_days": 0, "stages_done": 0, "stages_total": 12,
        "modules_done": 0, "modules_total": 0, "started_on": None, "delivered_on": None,
    }
    # created once, not on every read
    await api.get(f"/projects/{PROJECT}/lifecycle")
    assert await mongo_db.project_lifecycles.count_documents({"project_id": PROJECT}) == 1


async def test_new_company_stages_reach_projects_still_on_the_default_flow(api, mongo_db):
    await seed(mongo_db)
    as_member(api)
    await api.get(f"/projects/{PROJECT}/lifecycle")

    # a lifecycle saved before deployment stages existed
    await mongo_db.project_lifecycles.update_one(
        {"project_id": PROJECT},
        {"$set": {"stages": [s for s in (await mongo_db.project_lifecycles.find_one({"project_id": PROJECT}))["stages"]
                             if s["key"] not in ("uat_deployment", "prod_deployment")]}},
    )
    board = (await api.get(f"/projects/{PROJECT}/lifecycle")).json()
    assert [item["key"] for item in board["stages"]][-3:] == ["uat_deployment", "prod_deployment", "delivery"]
    assert board["stages"][0]["name"] == "Requirement Intake"   # wording refreshed with the company flow
    assert [item["position"] for item in board["stages"]] == list(range(len(board["stages"])))

    # a project that tailored its own flow is left exactly as it is
    await api.put(f"/projects/{PROJECT}/lifecycle/flow", json={"stages": [{"name": "Only This"}]})
    board = (await api.get(f"/projects/{PROJECT}/lifecycle")).json()
    assert [item["name"] for item in board["stages"]] == ["Only This"]


async def test_moving_stages_records_dates_days_and_who(api, mongo_db):
    await seed(mongo_db)
    as_member(api)
    url = f"/projects/{PROJECT}/lifecycle/stages"

    board = (await api.patch(f"{url}/prd_received", json={"state": "done"})).json()
    assert stage(board, "prd_received")["state"] == "done"
    assert stage(board, "prd_received")["started_at"] and stage(board, "prd_received")["completed_at"]

    board = (await api.patch(f"{url}/design", json={"state": "in_progress"})).json()
    assert board["current_stage"] == "design"
    assert board["summary"]["stages_done"] == 1 and board["summary"]["started_on"] == date.today().isoformat()

    # a stage that has been running for three days reports three days
    three_days_ago = datetime.now(timezone.utc) - timedelta(days=3, hours=1)
    await mongo_db.project_lifecycles.update_one(
        {"project_id": PROJECT, "stages.key": "design"}, {"$set": {"stages.$.started_at": three_days_ago}},
    )
    board = (await api.get(f"/projects/{PROJECT}/lifecycle")).json()
    assert stage(board, "design")["days"] == 3

    # finishing banks the time; reopening keeps it
    board = (await api.patch(f"{url}/design", json={"state": "done"})).json()
    assert stage(board, "design")["days"] == 3
    board = (await api.patch(f"{url}/design", json={"state": "in_progress"})).json()
    assert stage(board, "design")["days"] == 3 and stage(board, "design")["completed_at"] is None

    activity = (await api.get(f"/projects/{PROJECT}/lifecycle/activity")).json()
    moves = [event for event in activity if event["action"] == "stage_moved"]
    assert [(event["stage_key"], event["old_value"], event["new_value"]) for event in moves][:2] == [
        ("design", "done", "in_progress"), ("design", "in_progress", "done"),
    ]
    assert moves[0]["actor"] == MEMBER and moves[0]["actor_name"] == "Dev Kumar"


async def test_stage_people_target_date_and_notes(api, mongo_db):
    await seed(mongo_db)
    as_member(api)
    url = f"/projects/{PROJECT}/lifecycle/stages/design"
    overdue = (date.today() - timedelta(days=2)).isoformat()

    board = (await api.patch(url, json={
        "assignees": [" DEV@example.com ", "outsider@example.com", "dev@example.com"],
        "target_date": overdue,
        "note": "Figma link in a doc",
    })).json()
    design = stage(board, "design")
    # normalised, de-duplicated, and in the order they were picked
    assert [person["email"] for person in design["assignees"]] == [MEMBER, OUTSIDER]
    assert design["assignees"][0]["name"] == "Dev Kumar"
    assert design["target_date"] == overdue and design["note"] == "Figma link in a doc"
    assert design["is_overdue"] is True                      # past its date and not finished

    # an address nobody owns is refused rather than quietly stored
    typo = await api.patch(url, json={"assignees": ["nobody@example.com"]})
    assert typo.status_code == 422 and "nobody@example.com" in typo.json()["detail"]

    board = (await api.patch(url, json={"state": "done"})).json()
    assert stage(board, "design")["is_overdue"] is False     # finished, so no longer chased

    board = (await api.patch(url, json={"clear": ["assignees", "target_date"]})).json()
    assert stage(board, "design")["assignees"] == [] and stage(board, "design")["target_date"] is None
    assert stage(board, "design")["note"] == "Figma link in a doc"   # untouched fields stay

    assert (await api.patch(f"/projects/{PROJECT}/lifecycle/stages/nope", json={"state": "done"})).status_code == 404


async def test_a_stage_written_before_multiple_people_keeps_its_owner(api, mongo_db):
    await seed(mongo_db)
    as_member(api)
    await api.get(f"/projects/{PROJECT}/lifecycle")
    await mongo_db.project_lifecycles.update_one(
        {"project_id": PROJECT, "stages.key": "design"},
        {"$set": {"stages.$.owner_email": MEMBER}, "$unset": {"stages.$.assignees": ""}},
    )

    board = (await api.get(f"/projects/{PROJECT}/lifecycle")).json()
    assert [person["email"] for person in stage(board, "design")["assignees"]] == [MEMBER]


async def test_flow_can_be_tailored_without_losing_history(api, mongo_db):
    await seed(mongo_db)
    as_member(api)
    await api.patch(f"/projects/{PROJECT}/lifecycle/stages/design", json={"state": "done"})

    flow = [
        {"key": "prd_received", "name": "PRD / DPR Received"},
        {"key": "design", "name": "Design & Prototype", "team": "Design"},   # renamed, same stage
        {"name": "Client Demo", "team": "Product"},                          # new
    ]
    board = (await api.put(f"/projects/{PROJECT}/lifecycle/flow", json={"stages": flow})).json()
    assert [item["name"] for item in board["stages"]] == ["PRD / DPR Received", "Design & Prototype", "Client Demo"]
    assert [item["position"] for item in board["stages"]] == [0, 1, 2]
    assert stage(board, "design")["state"] == "done"            # history kept through the rename
    assert stage(board, "design")["team"] == "Design"
    assert stage(board, "client_demo")["state"] == "not_started"

    activity = (await api.get(f"/projects/{PROJECT}/lifecycle/activity")).json()
    flow_event = next(event for event in activity if event["action"] == "flow_updated")
    assert "Removed:" in (flow_event["note"] or "")
    assert (await api.put(f"/projects/{PROJECT}/lifecycle/flow", json={"stages": []})).status_code == 422


async def test_module_checklist(api, mongo_db):
    await seed(mongo_db)
    as_member(api)
    url = f"/projects/{PROJECT}/lifecycle/modules"
    yesterday = (date.today() - timedelta(days=1)).isoformat()

    first = (await api.post(url, json={"name": " Demo creation ", "assignees": [MEMBER], "deadline": yesterday})).json()
    assert first["modules"][0]["name"] == "Demo creation"
    assert [person["name"] for person in first["modules"][0]["assignees"]] == ["Dev Kumar"]
    assert first["modules"][0]["is_overdue"] is True
    second = (await api.post(url, json={"name": "CSV import"})).json()
    assert [module["position"] for module in second["modules"]] == [0, 1]
    assert second["summary"]["modules_total"] == 2

    module_id = second["modules"][0]["id"]
    # a module can be carried by more than one person, checked the same way a stage is
    board = (await api.patch(f"{url}/{module_id}", json={"assignees": [" DEV@example.com ", OUTSIDER, MEMBER]})).json()
    assert [person["email"] for person in board["modules"][0]["assignees"]] == [MEMBER, OUTSIDER]
    assert (await api.patch(f"{url}/{module_id}", json={"assignees": ["ghost@example.com"]})).status_code == 422
    board = (await api.patch(f"{url}/{module_id}", json={"clear": ["assignees"]})).json()
    assert board["modules"][0]["assignees"] == []

    board = (await api.patch(f"{url}/{module_id}", json={"done": True})).json()
    assert board["modules"][0]["done"] is True and board["modules"][0]["done_at"]
    assert board["modules"][0]["is_overdue"] is False          # done, so not chased
    assert board["summary"]["modules_done"] == 1

    ids = [module["id"] for module in board["modules"]]
    board = (await api.put(f"{url}/order", json={"module_ids": list(reversed(ids))})).json()
    assert [module["id"] for module in board["modules"]] == list(reversed(ids))

    board = (await api.delete(f"{url}/{module_id}")).json()
    assert [module["id"] for module in board["modules"]] == [ids[1]]
    assert (await api.patch(f"{url}/99999", json={"done": True})).status_code == 404
    assert (await api.post(url, json={"name": "   "})).status_code == 422

    actions = {event["action"] for event in (await api.get(f"/projects/{PROJECT}/lifecycle/activity")).json()}
    assert {"module_added", "module_done", "module_removed"} <= actions


async def test_only_project_members_can_see_or_change_it(api, mongo_db):
    await seed(mongo_db)
    api.state["user"] = CurrentUser(user_id=12, email=OUTSIDER, name="Outsider", role="user")
    assert (await api.get(f"/projects/{PROJECT}/lifecycle")).status_code == 403
    assert (await api.patch(f"/projects/{PROJECT}/lifecycle/stages/design", json={"state": "done"})).status_code == 403
    assert (await api.post(f"/projects/{PROJECT}/lifecycle/modules", json={"name": "nope"})).status_code == 403
    assert (await api.get(f"/projects/{PROJECT}/lifecycle/activity")).status_code == 403

    # a global admin reaches every project, and an unknown project is still a 404
    api.state["user"] = CurrentUser(user_id=1, email="admin@example.com", name="Admin", role="admin")
    assert (await api.get(f"/projects/{OTHER_PROJECT}/lifecycle")).status_code == 200
    assert (await api.get("/projects/9999/lifecycle")).status_code == 404


async def test_each_project_tracks_its_own_lifecycle(api, mongo_db):
    await seed(mongo_db)
    api.state["user"] = CurrentUser(user_id=1, email="admin@example.com", name="Admin", role="admin")

    await api.patch(f"/projects/{PROJECT}/lifecycle/stages/design", json={"state": "in_progress"})
    await api.post(f"/projects/{PROJECT}/lifecycle/modules", json={"name": "Demo creation"})

    other = (await api.get(f"/projects/{OTHER_PROJECT}/lifecycle")).json()
    assert other["current_stage"] is None and other["modules"] == []
    assert (await api.get(f"/projects/{OTHER_PROJECT}/lifecycle/activity")).json() == []


async def test_advance_finishes_one_stage_and_starts_the_next(api, mongo_db):
    await seed(mongo_db)
    as_member(api)
    url = f"/projects/{PROJECT}/lifecycle"
    await api.patch(f"{url}/stages/prd_received", json={"state": "in_progress"})

    board = (await api.post(f"{url}/advance", json={"stage_key": "prd_received"})).json()
    assert stage(board, "prd_received")["state"] == "done"
    assert stage(board, "product_prd")["state"] == "in_progress"
    assert board["current_stage"] == "product_prd"

    # both halves of the move are in the trail, as if they had been made by hand
    activity = (await api.get(f"{url}/activity")).json()
    moves = [(event["stage_key"], event["new_value"]) for event in activity if event["action"] == "stage_moved"]
    assert ("product_prd", "in_progress") in moves and ("prd_received", "done") in moves

    # the next stage may be further along than the very next one
    await api.patch(f"{url}/stages/design", json={"state": "skipped"})
    board = (await api.post(f"{url}/advance", json={"stage_key": "product_prd"})).json()
    assert stage(board, "design")["state"] == "skipped"
    assert stage(board, "design_review")["state"] == "in_progress"


async def test_advance_refuses_a_stale_or_unknown_stage(api, mongo_db):
    await seed(mongo_db)
    as_member(api)
    url = f"/projects/{PROJECT}/lifecycle"

    assert (await api.post(f"{url}/advance", json={"stage_key": "nope"})).status_code == 404

    await api.patch(f"{url}/stages/prd_received", json={"state": "done"})
    stale = await api.post(f"{url}/advance", json={"stage_key": "prd_received"})
    assert stale.status_code == 409
    assert "already been finished" in stale.json()["detail"]


async def test_advancing_the_last_stage_delivers_the_project(api, mongo_db):
    await seed(mongo_db)
    as_member(api)
    url = f"/projects/{PROJECT}/lifecycle"
    for item in (await api.get(url)).json()["stages"][:-1]:
        await api.patch(f"{url}/stages/{item['key']}", json={"state": "done"})

    board = (await api.post(f"{url}/advance", json={"stage_key": "delivery"})).json()
    assert all(item["state"] == "done" for item in board["stages"])
    assert board["summary"]["delivered_on"] == date.today().isoformat()


async def test_stage_remarks_are_appended_and_only_removed_by_their_author(api, mongo_db):
    await seed(mongo_db)
    as_member(api)
    url = f"/projects/{PROJECT}/lifecycle/stages/design"

    detail = (await api.post(f"{url}/remarks", json={"body": "  Client wants the CSV step split  "})).json()
    assert detail["remarks"][0]["body"] == "Client wants the CSV step split"
    assert detail["remarks"][0]["author_name"] == "Dev Kumar"
    await api.post(f"{url}/remarks", json={"body": "Second pass agreed"})

    # newest first, and neither remark overwrote the other
    detail = (await api.get(f"{url}/details")).json()
    assert [remark["body"] for remark in detail["remarks"]] == ["Second pass agreed", "Client wants the CSV step split"]
    assert (await api.post(f"{url}/remarks", json={"body": "   "})).status_code == 422

    # the count reaches the board, so a card can show there is something to read
    board = (await api.get(f"/projects/{PROJECT}/lifecycle")).json()
    assert stage(board, "design")["remark_count"] == 2

    mine = detail["remarks"][0]["id"]
    api.state["user"] = CurrentUser(user_id=12, email=OUTSIDER, name="Outsider", role="user")
    await mongo_db.project_members.insert_one(
        {"project_id": PROJECT, "user_id": 12, "user_email": OUTSIDER, "role": "member", "active": True}
    )
    assert (await api.delete(f"{url}/remarks/{mine}")).status_code == 403     # not theirs

    as_member(api)
    detail = (await api.delete(f"{url}/remarks/{mine}")).json()
    assert [remark["body"] for remark in detail["remarks"]] == ["Client wants the CSV step split"]
    assert (await api.delete(f"{url}/remarks/99999")).status_code == 404


async def test_stage_links_and_files(api, mongo_db):
    await seed(mongo_db)
    as_member(api)
    url = f"/projects/{PROJECT}/lifecycle/stages/design"

    detail = (await api.post(f"{url}/links", json={"url": "https://figma.com/file/abc", "label": "Demo flows"})).json()
    assert detail["attachments"][0]["kind"] == "link"
    assert detail["attachments"][0]["label"] == "Demo flows"
    assert (await api.post(f"{url}/links", json={"url": "figma.com/file/abc"})).status_code == 422

    detail = (await api.post(
        f"{url}/files", files={"file": ("brief.pdf", b"%PDF-1.4 sample brief", "application/pdf")},
    )).json()
    stored = detail["attachments"][0]
    assert stored["kind"] == "file" and stored["label"] == "brief.pdf" and stored["size_bytes"] == 21

    # what is not a document or an image is refused before anything is written
    assert (await api.post(
        f"{url}/files", files={"file": ("run.sh", b"#!/bin/sh", "application/x-sh")},
    )).status_code == 415

    download = await api.get(f"{url}/attachments/{stored['id']}/download")
    assert download.status_code == 200 and download.content == b"%PDF-1.4 sample brief"

    board = (await api.get(f"/projects/{PROJECT}/lifecycle")).json()
    assert stage(board, "design")["attachment_count"] == 2

    detail = (await api.delete(f"{url}/attachments/{stored['id']}")).json()
    assert [row["kind"] for row in detail["attachments"]] == ["link"]
    assert (await api.get(f"{url}/attachments/{stored['id']}/download")).status_code == 404


async def test_stage_remarks_and_files_are_closed_to_outsiders(api, mongo_db):
    await seed(mongo_db)
    api.state["user"] = CurrentUser(user_id=12, email=OUTSIDER, name="Outsider", role="user")
    url = f"/projects/{PROJECT}/lifecycle/stages/design"

    assert (await api.get(f"{url}/details")).status_code == 403
    assert (await api.post(f"{url}/remarks", json={"body": "nope"})).status_code == 403
    assert (await api.post(f"{url}/links", json={"url": "https://example.com"})).status_code == 403
    assert (await api.post(f"{url}/files", files={"file": ("a.pdf", b"x", "application/pdf")})).status_code == 403
    assert (await api.get(f"{url}/attachments/1/download")).status_code == 403

    as_member(api)
    assert (await api.get(f"/projects/{PROJECT}/lifecycle/stages/nope/details")).status_code == 404


async def test_build_keeps_frontend_and_backend_apart(api, mongo_db):
    await seed(mongo_db)
    as_member(api)
    board = (await api.get(f"/projects/{PROJECT}/lifecycle")).json()
    assert stage(board, "module_development")["tracks"] == ["Frontend", "Backend"]
    assert stage(board, "design")["tracks"] == []            # a single thread of work

    url = f"/projects/{PROJECT}/lifecycle/stages/module_development"
    await api.post(f"{url}/remarks", json={"body": "Demo form validation done", "track": "Frontend"})
    await api.post(f"{url}/remarks", json={"body": "CSV import endpoint is slow", "track": "Backend"})
    await api.post(f"{url}/links", json={"url": "https://figma.com/x", "label": "Screens", "track": "frontend"})

    detail = (await api.get(f"{url}/details")).json()
    assert {remark["body"]: remark["track"] for remark in detail["remarks"]} == {
        "Demo form validation done": "Frontend",
        "CSV import endpoint is slow": "Backend",
    }
    # the track is matched however it was typed, and stored the way the stage spells it
    assert detail["attachments"][0]["track"] == "Frontend"

    # a stream the stage does not run is refused, as is one on a stage with no streams
    assert (await api.post(f"{url}/remarks", json={"body": "x", "track": "Mobile"})).status_code == 422
    design = f"/projects/{PROJECT}/lifecycle/stages/design"
    assert (await api.post(f"{design}/remarks", json={"body": "x", "track": "Frontend"})).status_code == 422

    # a file carries its stream through the multipart form
    detail = (await api.post(
        f"{url}/files",
        files={"file": ("api.pdf", b"%PDF-1.4 spec", "application/pdf")},
        data={"track": "Backend"},
    )).json()
    assert next(row for row in detail["attachments"] if row["label"] == "api.pdf")["track"] == "Backend"


async def test_uploads_that_could_run_as_script_are_refused(api, mongo_db):
    await seed(mongo_db)
    as_member(api)
    url = f"/projects/{PROJECT}/lifecycle/stages/design"

    svg = await api.post(f"{url}/files", files={"file": ("logo.svg", b"<svg onload=alert(1)>", "image/svg+xml")})
    assert svg.status_code == 415 and "SVG" in svg.json()["detail"]

    # what a browser can show safely is shown in place; the rest is saved
    detail = (await api.post(f"{url}/files", files={"file": ("brief.pdf", b"%PDF-1.4", "application/pdf")})).json()
    shown = await api.get(f"{url}/attachments/{detail['attachments'][0]['id']}/download")
    assert shown.headers["content-disposition"].startswith("inline")
    assert shown.headers["x-content-type-options"] == "nosniff"

    # A real .docx is a ZIP container (PK\x03\x04 signature); it must be accepted
    # and served as a download, not refused for looking like a plain zip.
    detail = (await api.post(
        f"{url}/files",
        files={"file": ("plan.docx", b"PK\x03\x04 docx bytes", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")},
    )).json()
    saved = await api.get(f"{url}/attachments/{detail['attachments'][0]['id']}/download")
    assert saved.headers["content-disposition"].startswith("attachment")


async def test_backfilling_a_stage_that_ran_before_it_was_tracked(api, mongo_db):
    await seed(mongo_db)
    as_member(api)
    url = f"/projects/{PROJECT}/lifecycle/stages/design"
    began = (date.today() - timedelta(days=20)).isoformat()
    ended = (date.today() - timedelta(days=6)).isoformat()

    # a stage that ran before anyone opened this page: its dates are the truth,
    # and the day count is rebuilt from them rather than from a clock nobody ran
    board = (await api.patch(url, json={"state": "done", "started_at": began, "completed_at": ended})).json()
    design = stage(board, "design")
    assert design["started_at"][:10] == began and design["completed_at"][:10] == ended
    assert design["days"] == 14

    # correcting one date corrects the count with it
    board = (await api.patch(url, json={"completed_at": (date.today() - timedelta(days=1)).isoformat()})).json()
    assert stage(board, "design")["days"] == 19

    # a stage still running counts from the start date that was entered
    board = (await api.patch(url, json={"state": "in_progress", "clear": ["completed_at"]})).json()
    board = (await api.patch(url, json={"started_at": began})).json()
    assert stage(board, "design")["days"] == 20 and stage(board, "design")["completed_at"] is None

    backwards = await api.patch(url, json={"started_at": ended, "completed_at": began})
    assert backwards.status_code == 422 and "before it started" in backwards.json()["detail"]

    ahead = await api.patch(url, json={"started_at": (date.today() + timedelta(days=3)).isoformat()})
    assert ahead.status_code == 422 and "future" in ahead.json()["detail"]

    board = (await api.patch(url, json={"clear": ["started_at"]})).json()
    assert stage(board, "design")["started_at"] is None and stage(board, "design")["days"] == 0

    trail = (await api.get(f"/projects/{PROJECT}/lifecycle/activity")).json()
    assert {event["field"] for event in trail if event["action"] == "stage_updated"} >= {"started_at", "completed_at"}


async def test_a_file_the_browser_cannot_name_is_typed_by_its_extension(api, mongo_db):
    await seed(mongo_db)
    as_member(api)
    url = f"/projects/{PROJECT}/lifecycle/stages/design"

    # Chrome and Safari disagree about Markdown, and often send nothing useful
    for sent in ("", "application/octet-stream", "text/x-markdown"):
        detail = (await api.post(f"{url}/files", files={"file": ("notes.md", b"# Notes", sent)})).json()
        assert detail["attachments"][0]["content_type"] == "text/markdown"

    # an extension nobody asked for stays unknown, and unknown is still refused
    assert (await api.post(
        f"{url}/files", files={"file": ("payload.svg", b"<svg/>", "application/octet-stream")},
    )).status_code == 415
    assert (await api.post(
        f"{url}/files", files={"file": ("run.sh", b"#!/bin/sh", "application/octet-stream")},
    )).status_code == 415


async def test_a_module_written_before_multiple_people_keeps_its_owner(api, mongo_db):
    await seed(mongo_db)
    as_member(api)
    url = f"/projects/{PROJECT}/lifecycle/modules"
    created = (await api.post(url, json={"name": "CSV import"})).json()
    module_id = created["modules"][0]["id"]

    await mongo_db.project_modules.update_one(
        {"project_id": PROJECT, "module_number": module_id},
        {"$set": {"owner_email": MEMBER}, "$unset": {"assignees": ""}},
    )
    board = (await api.get(f"/projects/{PROJECT}/lifecycle")).json()
    assert [person["email"] for person in board["modules"][0]["assignees"]] == [MEMBER]

    # renaming is just another field, and leaves the people alone
    board = (await api.patch(f"{url}/{module_id}", json={"name": "CSV import and mapping"})).json()
    assert board["modules"][0]["name"] == "CSV import and mapping"
    assert [person["email"] for person in board["modules"][0]["assignees"]] == [MEMBER]


async def test_a_module_is_finished_when_its_tickets_are(api, mongo_db):
    await seed(mongo_db)
    as_member(api)
    url = f"/projects/{PROJECT}/lifecycle/modules"
    created = (await api.post(url, json={"name": "CSV import"})).json()
    module_id = created["modules"][0]["id"]

    # with nothing linked the tick box still speaks for the module
    assert created["modules"][0]["done_from_tickets"] is False
    board = (await api.patch(f"{url}/{module_id}", json={"done": True})).json()
    assert board["modules"][0]["done"] is True

    board = (await api.put(f"{url}/{module_id}/tickets", json={"ticket_ids": [501, 502, 501]})).json()
    module = board["modules"][0]
    assert [ticket["key"] for ticket in module["tickets"]] == ["DEMO-1", "DEMO-2"]   # de-duplicated
    assert module["tickets_done"] == 1 and module["tickets_total"] == 2 and module["done_from_tickets"] is True
    # it was ticked by hand a moment ago, but one ticket is still open, so it is not done
    assert module["done"] is False
    assert board["summary"]["modules_done"] == 0

    # and the tick box is no longer the answer
    refused = await api.patch(f"{url}/{module_id}", json={"done": True})
    assert refused.status_code == 422 and "tickets decide" in refused.json()["detail"]

    # close the last ticket and the module closes with it, with no one touching it
    await mongo_db.tickets.update_one({"ticket_number": 501}, {"$set": {"status_id": 2}})
    board = (await api.get(f"/projects/{PROJECT}/lifecycle")).json()
    assert board["modules"][0]["done"] is True and board["modules"][0]["tickets_done"] == 2
    assert board["summary"]["modules_done"] == 1

    # work that no longer exists cannot be counted, and cannot be linked
    await mongo_db.tickets.update_one({"ticket_number": 502}, {"$set": {"archived": True}})
    board = (await api.get(f"/projects/{PROJECT}/lifecycle")).json()
    assert [ticket["key"] for ticket in board["modules"][0]["tickets"]] == ["DEMO-1"]

    for bad in ([503], [601], [9999]):
        assert (await api.put(f"{url}/{module_id}/tickets", json={"ticket_ids": bad})).status_code == 422

    # unlinking hands the module back to whoever is ticking the boxes
    board = (await api.put(f"{url}/{module_id}/tickets", json={"ticket_ids": []})).json()
    assert board["modules"][0]["done_from_tickets"] is False
    assert (await api.patch(f"{url}/{module_id}", json={"done": True})).status_code == 200


async def test_the_ticket_picker_searches_this_project_only(api, mongo_db):
    await seed(mongo_db)
    as_member(api)
    url = f"/projects/{PROJECT}/lifecycle/tickets"

    everything = (await api.get(url)).json()
    assert {ticket["key"] for ticket in everything} == {"DEMO-1", "DEMO-2"}   # archived and other projects excluded
    assert next(t for t in everything if t["key"] == "DEMO-2")["done"] is True

    assert [t["key"] for t in (await api.get(f"{url}?q=rate")).json()] == ["DEMO-2"]
    assert [t["key"] for t in (await api.get(f"{url}?q=DEMO-1")).json()] == ["DEMO-1"]
    # a search box is not a place to accept a regular expression
    assert (await api.get(f"{url}?q=.*")).json() == []

    api.state["user"] = CurrentUser(user_id=12, email=OUTSIDER, name="Outsider", role="user")
    assert (await api.get(url)).status_code == 403


async def test_days_move_with_the_indian_calendar_not_with_24_hour_blocks(api, mongo_db):
    await seed(mongo_db)
    as_member(api)
    url = f"/projects/{PROJECT}/lifecycle"
    await api.patch(f"{url}/stages/design", json={"state": "in_progress"})

    from app.services.standup_time import IST, ist_now

    async def started(at):
        await mongo_db.project_lifecycles.update_one(
            {"project_id": PROJECT, "stages.key": "design"}, {"$set": {"stages.$.started_at": at}},
        )
        board = (await api.get(url)).json()
        return stage(board, "design")["days"]

    now_ist = ist_now()
    # started two hours ago: still today, so nothing has been spent yet
    assert await started((now_ist - timedelta(hours=2)).astimezone(timezone.utc)) == 0

    # started at 11pm last night: seven hours old, but a day has turned, so it is day one
    last_night = (now_ist - timedelta(days=1)).replace(hour=23, minute=0, second=0, microsecond=0, tzinfo=IST)
    assert await started(last_night.astimezone(timezone.utc)) == 1

    # and three midnights back is three days, whatever the hour
    three_back = (now_ist - timedelta(days=3)).replace(hour=1, minute=30, second=0, microsecond=0, tzinfo=IST)
    assert await started(three_back.astimezone(timezone.utc)) == 3


async def test_days_banked_before_the_calendar_rule_are_kept(api, mongo_db):
    await seed(mongo_db)
    as_member(api)
    await api.get(f"/projects/{PROJECT}/lifecycle")

    # a finished stage recorded when time was banked in seconds
    await mongo_db.project_lifecycles.update_one(
        {"project_id": PROJECT, "stages.key": "design"},
        {"$set": {"stages.$.state": "done", "stages.$.elapsed_seconds": 5 * 86400 + 3600},
         "$unset": {"stages.$.elapsed_days": ""}},
    )
    board = (await api.get(f"/projects/{PROJECT}/lifecycle")).json()
    assert stage(board, "design")["days"] == 5


async def test_a_module_counts_the_subtasks_under_its_tickets(api, mongo_db):
    await seed(mongo_db)
    as_member(api)
    await mongo_db.tickets.insert_many([
        {"ticket_number": 511, "project_id": PROJECT, "key": "DEMO-11", "title": "Parse rates", "status_id": 2, "parent_id": 501},
        {"ticket_number": 512, "project_id": PROJECT, "key": "DEMO-12", "title": "Map columns", "status_id": 1, "parent_id": 501},
    ])
    url = f"/projects/{PROJECT}/lifecycle/modules"
    created = (await api.post(url, json={"name": "CSV import"})).json()
    module_id = created["modules"][0]["id"]

    # DEMO-1 is in progress with two subtasks, one of them done; DEMO-2 is done
    board = (await api.put(f"{url}/{module_id}/tickets", json={"ticket_ids": [501, 502]})).json()
    module = board["modules"][0]
    parent = next(t for t in module["tickets"] if t["key"] == "DEMO-1")
    assert [s["key"] for s in parent["subtickets"]] == ["DEMO-11", "DEMO-12"]
    assert module["tickets_total"] == 4 and module["tickets_done"] == 2    # DEMO-2 and DEMO-11
    assert module["done"] is False

    # an open subtask alone keeps the module open, even with both tickets closed
    await mongo_db.tickets.update_one({"ticket_number": 501}, {"$set": {"status_id": 2}})
    board = (await api.get(f"/projects/{PROJECT}/lifecycle")).json()
    assert board["modules"][0]["tickets_done"] == 3 and board["modules"][0]["done"] is False

    await mongo_db.tickets.update_one({"ticket_number": 512}, {"$set": {"status_id": 2}})
    board = (await api.get(f"/projects/{PROJECT}/lifecycle")).json()
    assert board["modules"][0]["tickets_done"] == 4 and board["modules"][0]["done"] is True


async def test_active_lifecycles_lists_projects_that_are_moving(api, mongo_db):
    await seed(mongo_db)
    as_member(api)
    url = "/projects/lifecycle/active"

    # a lifecycle nobody has started yet is not "moving"
    await api.get(f"/projects/{PROJECT}/lifecycle")
    assert (await api.get(url)).json()["project_ids"] == []

    await api.patch(f"/projects/{PROJECT}/lifecycle/stages/design", json={"state": "in_progress"})
    assert (await api.get(url)).json()["project_ids"] == [PROJECT]

    # once every stage is finished it stops being in flight
    board = (await api.get(f"/projects/{PROJECT}/lifecycle")).json()
    for item in board["stages"]:
        await api.patch(f"/projects/{PROJECT}/lifecycle/stages/{item['key']}", json={"state": "done"})
    assert (await api.get(url)).json()["project_ids"] == []
