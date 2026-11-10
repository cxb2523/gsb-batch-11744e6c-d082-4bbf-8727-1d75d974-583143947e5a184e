"""Forced / voluntary password change (POST /auth/change-password)."""

import pytest

from app.core.security import CurrentUser
from app.core.passwords import verify_password

pytestmark = pytest.mark.anyio


async def _create_and_act_as(api, email, password="temp-pass-123"):
    r = await api.post("/admin/users", json={"name": "U", "email": email, "password": password})
    assert r.status_code == 201, r.text
    uid = r.json()["user_id"]
    api.state["user"] = CurrentUser(user_id=uid, email=email, name="U", role="user")


async def test_change_password_clears_flag_and_rehashes(api, mongo_db):
    await _create_and_act_as(api, "c@example.com")
    r = await api.post("/auth/change-password",
                       json={"current_password": "temp-pass-123", "new_password": "brand-new-pass"})
    assert r.status_code == 200, r.text
    assert r.json()["must_change_password"] is False

    doc = await mongo_db.users.find_one({"email": "c@example.com"})
    assert doc["must_change_password"] is False
    assert verify_password("brand-new-pass", doc["password_hash"])
    assert not verify_password("temp-pass-123", doc["password_hash"])  # old temp no longer works


async def test_wrong_current_is_401(api, mongo_db):
    await _create_and_act_as(api, "c2@example.com")
    r = await api.post("/auth/change-password",
                       json={"current_password": "wrong", "new_password": "brand-new-pass"})
    assert r.status_code == 401


async def test_new_same_as_current_is_400(api, mongo_db):
    await _create_and_act_as(api, "c3@example.com")
    r = await api.post("/auth/change-password",
                       json={"current_password": "temp-pass-123", "new_password": "temp-pass-123"})
    assert r.status_code == 400


async def test_new_too_short_is_422(api, mongo_db):
    await _create_and_act_as(api, "c4@example.com")
    r = await api.post("/auth/change-password",
                       json={"current_password": "temp-pass-123", "new_password": "short"})
    assert r.status_code == 422
