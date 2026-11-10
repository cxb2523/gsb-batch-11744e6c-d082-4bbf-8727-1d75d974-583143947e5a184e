"""Email/password login (POST /auth/login) for admin-provisioned accounts."""

import pytest

pytestmark = pytest.mark.anyio


async def _create(api, email, password="temp-pass-123"):
    r = await api.post("/admin/users", json={"name": "U", "email": email, "password": password})
    assert r.status_code == 201, r.text


async def test_login_success_flags_must_change(api, mongo_db):
    await _create(api, "u@example.com")
    r = await api.post("/auth/login", json={"email": "U@example.com", "password": "temp-pass-123"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["email"] == "u@example.com"            # normalized
    assert body["must_change_password"] is True        # admin-created temp password


async def test_login_wrong_password_is_401(api, mongo_db):
    await _create(api, "w@example.com")
    r = await api.post("/auth/login", json={"email": "w@example.com", "password": "nope"})
    assert r.status_code == 401


async def test_oauth_only_user_cannot_password_login(api, mongo_db):
    # A Google-created user has no password_hash.
    await mongo_db.users.insert_one(
        {"email": "g@example.com", "name": "G", "role": "user", "user_number": 555, "is_active": True}
    )
    r = await api.post("/auth/login", json={"email": "g@example.com", "password": "anything"})
    assert r.status_code == 401


async def test_inactive_user_cannot_login(api, mongo_db):
    await _create(api, "i@example.com")
    await mongo_db.users.update_one({"email": "i@example.com"}, {"$set": {"is_active": False}})
    r = await api.post("/auth/login", json={"email": "i@example.com", "password": "temp-pass-123"})
    assert r.status_code == 401
