"""Admin-provisioned user creation (POST /admin/users)."""

import pytest

from app.core.security import CurrentUser
from app.core.passwords import verify_password

pytestmark = pytest.mark.anyio

PLAIN = CurrentUser(user_id=2, email="bob@example.com", name="Bob", role="user")


async def test_admin_creates_user_with_hashed_password(api, mongo_db):
    # api defaults to an admin user.
    resp = await api.post("/admin/users", json={
        "name": "New Hire",
        "email": "New.Hire@Example.com",
        "password": "temp-pass-123",
        "role": "user",
        "department": "Engineering",
    })
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["email"] == "new.hire@example.com"      # normalized to lowercase
    assert body["role"] == "user" and body["is_active"] is True
    assert body["user_id"]

    doc = await mongo_db.users.find_one({"email": "new.hire@example.com"})
    assert doc["must_change_password"] is True
    assert doc["password_hash"] and doc["password_hash"] != "temp-pass-123"  # never plaintext
    assert verify_password("temp-pass-123", doc["password_hash"])
    assert verify_password("wrong", doc["password_hash"]) is False


async def test_duplicate_email_is_409(api, mongo_db):
    payload = {"name": "A", "email": "dup@example.com", "password": "temp-pass-123"}
    assert (await api.post("/admin/users", json=payload)).status_code == 201
    dupe = await api.post("/admin/users", json={**payload, "name": "B", "email": "DUP@example.com"})
    assert dupe.status_code == 409


async def test_non_admin_forbidden(api, mongo_db):
    api.state["user"] = PLAIN
    resp = await api.post("/admin/users", json={
        "name": "X", "email": "x@example.com", "password": "temp-pass-123",
    })
    assert resp.status_code == 403


async def test_short_password_rejected(api, mongo_db):
    resp = await api.post("/admin/users", json={
        "name": "X", "email": "y@example.com", "password": "short",
    })
    assert resp.status_code == 422
