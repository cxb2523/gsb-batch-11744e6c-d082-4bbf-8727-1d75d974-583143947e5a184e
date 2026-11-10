"""Tests for the structured 'create project from spreadsheet' import."""

import io

import openpyxl
import pytest

from app.routes import project_import as P

pytestmark = pytest.mark.anyio

PARSE = "/api/projects/import/parse"
COMMIT = "/api/projects/import/commit"


# --------------------------------------------------------------------------
# Unit: column mapping, type/status defaults, assignee resolution
# --------------------------------------------------------------------------

def test_columns_auto_map_by_alias():
    f2h, cols = P._map_columns(["Summary", "Owner", "Deadline", "Importance", "State", "Extra"])
    assert f2h["title"] == "Summary"
    assert f2h["assignee"] == "Owner"
    assert f2h["due_date"] == "Deadline"
    assert f2h["priority"] == "Importance"
    assert f2h["status"] == "State"
    assert cols[-1].field is None  # unmapped column reported, not dropped silently


def test_type_defaults_to_task_and_maps_synonyms():
    assert P._normalise_type("") == "task"
    assert P._normalise_type("defect") == "bug"
    assert P._normalise_type("Story") == "story"


def test_status_maps_to_default_workflow():
    assert P._map_status_name("in progress") == "In Progress"
    assert P._map_status_name("closed") == "Done"
    assert P._map_status_name("") == "Backlog"


def test_assignee_resolution_prefers_email_and_flags_ambiguity():
    by_email = {"alex.taylor@acme.com": ("alex.taylor@acme.com", 1)}
    by_name = {"alex taylor": [("alex.taylor@acme.com", 1)], "chris p": [("c1@x.com", 4), ("c2@x.com", 5)]}
    assert P._resolve_assignee("alex.taylor@acme.com", by_email, by_name)[2] == "matched"
    assert P._resolve_assignee("Alex Taylor", by_email, by_name)[:2] == ("alex.taylor@acme.com", 1)
    assert P._resolve_assignee("chris p", by_email, by_name)[2] == "ambiguous"
    assert P._resolve_assignee("nobody", by_email, by_name)[2] == "unmatched"


# --------------------------------------------------------------------------
# Endpoints
# --------------------------------------------------------------------------

@pytest.fixture
async def directory(mongo_db):
    """Two users in the directory for assignee matching."""
    await mongo_db.users.insert_many([
        {"user_number": 2, "email": "sam@acme.com", "name": "Sam Rivers", "is_active": True},
        {"user_number": 3, "email": "jamie@acme.com", "name": "Jamie Lee", "is_active": True},
    ])
    yield mongo_db


async def test_parse_maps_columns_and_resolves_assignees(api, directory):
    csv = (
        "Summary,Owner,Deadline,Importance,State\n"
        "Fix login,sam@acme.com,2026-11-01,High,In Progress\n"
        "Add export,ghost@nowhere.com,,Low,\n"
    ).encode()
    resp = await api.post(PARSE, files={"file": ("tasks.csv", csv, "text/csv")})
    assert resp.status_code == 200, resp.text
    body = resp.json()

    assert body["row_count"] == 2
    first = body["rows"][0]
    assert first["title"] == "Fix login"
    assert first["assignee_email"] == "sam@acme.com"
    assert first["status_name"] == "In Progress"
    assert first["priority"] == "high"
    # matched user is offered as a project member; the unknown email is not
    assert body["member_user_ids"] == [2]
    states = {a["source"]: a["status"] for a in body["assignees"]}
    assert states["sam@acme.com"] == "matched"
    assert states["ghost@nowhere.com"] == "unmatched"


async def test_parse_rejects_non_spreadsheet(api):
    resp = await api.post(PARSE, files={"file": ("notes.pdf", b"%PDF-1.4 stuff", "application/pdf")})
    assert resp.status_code == 400
    assert "spreadsheet" in resp.json()["detail"].lower()


async def test_commit_creates_project_tickets_and_members(api, directory):
    payload = {
        "project_name": "Imported Project",
        "project_key": "imp",
        "rows": [
            {"ref": 0, "title": "Fix login", "type": "bug", "status_name": "In Progress",
             "priority": "high", "assignee_email": "sam@acme.com", "due_date": "2026-11-01T00:00:00Z",
             "labels": ["auth"], "story_points": 3},
            {"ref": 1, "title": "Undated task", "type": "task"},  # no due date -> allowed here
        ],
        "member_user_ids": [2],
    }
    resp = await api.post(COMMIT, json=payload)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["created_count"] == 2 and body["failed_count"] == 0
    pid = body["project_id"]
    assert body["project_key"] == "IMP"

    # project + default statuses created
    project = await directory.projects.find_one({"project_number": pid})
    assert project and project["name"] == "Imported Project"
    statuses = await directory.ticket_statuses.find({"project_id": pid}).to_list(None)
    assert {s["name"] for s in statuses} >= {"Backlog", "In Progress", "Done"}

    # tickets created, undated one allowed, status mapped, assignee set
    tickets = await directory.tickets.find({"project_id": pid}).sort("ticket_number", 1).to_list(None)
    assert len(tickets) == 2
    by_title = {t["title"]: t for t in tickets}
    assert by_title["Undated task"].get("due_date") is None
    in_prog = next(s["status_number"] for s in statuses if s["name"] == "In Progress")
    assert by_title["Fix login"]["status_id"] == in_prog
    assert by_title["Fix login"]["assignee_email"] == "sam@acme.com"

    # matched directory user added as a member
    members = await directory.project_members.find({"project_id": pid}).to_list(None)
    assert any(m.get("user_id") == 2 for m in members)


async def test_template_downloads_and_round_trips(api):
    resp = await api.get("/api/projects/import/template")
    assert resp.status_code == 200
    assert resp.headers["content-disposition"].startswith("attachment")
    # The template we hand out must parse cleanly through our own reader.
    from app.utils.spreadsheet import read_table
    headers, rows = read_table(resp.content, "xlsx")
    assert headers == P.TEMPLATE_COLUMNS and len(rows) == len(P.TEMPLATE_EXAMPLES)


async def test_commit_rejects_duplicate_key(api):
    await api_project(api, "DUP")
    resp = await api.post(COMMIT, json={
        "project_name": "Another", "project_key": "DUP",
        "rows": [{"ref": 0, "title": "x", "type": "task"}],
    })
    assert resp.status_code == 400
    assert "already exists" in resp.json()["detail"].lower()


async def api_project(api, key):
    resp = await api.post(COMMIT, json={
        "project_name": f"Project {key}", "project_key": key,
        "rows": [{"ref": 0, "title": "seed", "type": "task"}],
    })
    assert resp.status_code == 200, resp.text
    return resp.json()
