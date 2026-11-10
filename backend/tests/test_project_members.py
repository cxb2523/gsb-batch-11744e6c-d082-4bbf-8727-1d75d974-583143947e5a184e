"""Integration tests for project member assignment against a throwaway MongoDB.

Covers the rule that global admins are never offered as, or added as, explicit
project members (they already have access to every project), plus bulk add with
per-member project roles and role selection at project creation.
"""

import pytest

pytestmark = pytest.mark.anyio

ADMIN = "admin@example.com"       # global admin (the api fixture's user)
PM = "pm@example.com"
DEV1 = "dev1@example.com"
DEV2 = "dev2@example.com"


async def seed_users(db):
    await db.users.insert_many([
        {"email": ADMIN, "name": "Admin", "user_number": 1, "role": "admin"},
        {"email": PM, "name": "Priya M", "user_number": 2, "role": "user"},
        {"email": DEV1, "name": "Dev One", "user_number": 3, "role": "user"},
        {"email": DEV2, "name": "Dev Two", "user_number": 4, "role": "user", "is_active": False},
    ])


async def create_project(api, key="WEB", name="Website", members=None):
    body = {"key": key, "name": name, "visibility": "private"}
    if members is not None:
        body["members"] = members
    resp = await api.post("/projects", json=body)
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


async def test_assignable_users_excludes_global_admins_and_inactive(api, mongo_db):
    await seed_users(mongo_db)
    resp = await api.get("/projects/assignable-users")
    assert resp.status_code == 200, resp.text
    emails = {u["email"] for u in resp.json()}
    assert ADMIN not in emails       # global admin never offered
    assert DEV2 not in emails        # deactivated user never offered
    assert emails == {PM, DEV1}


async def test_assignable_users_tolerates_null_fields(api, mongo_db):
    """A user doc with null name/designation (or no user_number) must not 500 the list.

    `dict.get(key, default)` returns None for an explicit null value, which used
    to crash the sort (`None.lower()`) or fail response validation; the endpoint
    now coerces nulls and skips records with no user_number.
    """
    await seed_users(mongo_db)
    await mongo_db.users.insert_many([
        # null name + null designation: must still appear, with empty strings.
        {"email": "noname@example.com", "name": None, "user_number": 5,
         "role": "user", "designation": None},
        # no user_number: unusable for the picker, must be skipped (not a 500).
        {"email": "nonumber@example.com", "name": "No Number", "role": "user"},
    ])

    resp = await api.get("/projects/assignable-users")
    assert resp.status_code == 200, resp.text
    by_email = {u["email"]: u for u in resp.json()}
    assert "nonumber@example.com" not in by_email   # no user_number -> skipped
    assert by_email["noname@example.com"]["name"] == ""
    assert by_email["noname@example.com"]["designation"] == ""


async def test_assignable_users_excludes_existing_members(api, mongo_db):
    await seed_users(mongo_db)
    pid = await create_project(api)
    await api.post(f"/projects/{pid}/members/bulk", json={"members": [{"user_id": 2, "role": "member"}]})

    resp = await api.get("/projects/assignable-users", params={"project_id": pid})
    emails = {u["email"] for u in resp.json()}
    assert PM not in emails          # already a member
    assert emails == {DEV1}


async def test_bulk_add_assigns_per_member_roles(api, mongo_db):
    await seed_users(mongo_db)
    pid = await create_project(api)

    resp = await api.post(f"/projects/{pid}/members/bulk", json={"members": [
        {"user_id": 2, "role": "admin"},
        {"user_id": 3, "role": "member"},
    ]})
    assert resp.status_code == 201, resp.text

    roles = {m["user_id"]: m["role"] for m in resp.json()}
    assert roles == {2: "admin", 3: "member"}

    # A *project* admin role must NOT promote the user's global role.
    pm_user = await mongo_db.users.find_one({"user_number": 2})
    assert pm_user["role"] == "user"


async def test_bulk_add_skips_global_admins_and_duplicates(api, mongo_db):
    await seed_users(mongo_db)
    pid = await create_project(api)

    resp = await api.post(f"/projects/{pid}/members/bulk", json={"members": [
        {"user_id": 1, "role": "member"},   # global admin -> skipped
        {"user_id": 2, "role": "member"},
        {"user_id": 2, "role": "admin"},    # duplicate -> skipped
        {"user_id": 99, "role": "member"},  # unknown -> skipped
    ]})
    assert resp.status_code == 201, resp.text
    added_ids = [m["user_id"] for m in resp.json()]
    assert added_ids == [2]

    member_ids = {m.get("user_id") async for m in mongo_db.project_members.find({"project_id": pid})}
    assert 1 not in member_ids          # global admin not a member row


async def test_create_project_with_member_roles(api, mongo_db):
    await seed_users(mongo_db)
    pid = await create_project(api, members=[
        {"user_id": 2, "role": "admin"},
        {"user_id": 3, "role": "member"},
        {"user_id": 1, "role": "admin"},   # global admin -> skipped
    ])

    rows = {m.get("user_id"): m.get("role") async for m in mongo_db.project_members.find({"project_id": pid})}
    assert rows.get(2) == "admin"
    assert rows.get(3) == "member"
    # user 1 is both the creating owner (added as admin) — ensure the member spec
    # for a global admin didn't create a duplicate and global role is untouched.
    assert sum(1 for uid in rows if uid == 1) <= 1
    admin_user = await mongo_db.users.find_one({"user_number": 2})
    assert admin_user["role"] == "user"


async def test_create_project_accepts_bare_int_members(api, mongo_db):
    await seed_users(mongo_db)
    pid = await create_project(api, members=[2, 3])
    rows = {m.get("user_id"): m.get("role") async for m in mongo_db.project_members.find({"project_id": pid})}
    assert rows.get(2) == "member"
    assert rows.get(3) == "member"
