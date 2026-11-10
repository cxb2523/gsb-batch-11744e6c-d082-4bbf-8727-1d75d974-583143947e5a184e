"""Local-only email/password login: must stay off unless every dev condition holds."""

from jose import jwt
from pydantic import SecretStr
import pytest

from app.core.settings import get_settings

pytestmark = pytest.mark.anyio

EMAIL = "dev.user@example.com"
TEST_PASSWORD = "test-only-password"  # not a real credential; set per test via monkeypatch


@pytest.fixture
def dev_login_on(monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "environment", "development")
    monkeypatch.setattr(settings, "dev_login_password", SecretStr(TEST_PASSWORD))
    monkeypatch.setattr(settings, "backend_base_url", "http://localhost:8000")
    return settings


@pytest.fixture
async def user(mongo_db):
    await mongo_db.users.insert_one(
        {"email": EMAIL, "name": "Dev User", "user_number": 42, "role": "admin", "is_active": True}
    )


async def test_success_sets_session_cookie(api, mongo_db, user, dev_login_on):
    response = await api.post("/auth/dev-login", json={"email": "  Dev.User@example.com ", "password": TEST_PASSWORD})
    assert response.status_code == 200
    body = response.json()
    assert body["id"] == 42 and body["email"] == EMAIL and body["role"] == "admin"

    token = response.cookies.get(dev_login_on.session_cookie_name)
    assert token, "session cookie was not set"
    claims = jwt.get_unverified_claims(token)
    assert claims["email"] == EMAIL

    stored = await mongo_db.users.find_one({"email": EMAIL})
    assert stored["last_login_at"] is not None


@pytest.mark.parametrize(
    "email,password",
    [(EMAIL, "wrong-password"), ("nobody@example.com", TEST_PASSWORD)],
)
async def test_wrong_password_and_unknown_user_look_the_same(api, user, dev_login_on, email, password):
    response = await api.post("/auth/dev-login", json={"email": email, "password": password})
    assert response.status_code == 401
    assert response.json()["detail"] == "Email or password is incorrect"
    assert dev_login_on.session_cookie_name not in response.cookies


async def test_deactivated_user_rejected(api, mongo_db, dev_login_on):
    await mongo_db.users.insert_one({"email": EMAIL, "name": "Gone", "user_number": 7, "role": "user", "is_active": False})
    response = await api.post("/auth/dev-login", json={"email": EMAIL, "password": TEST_PASSWORD})
    assert response.status_code == 401


@pytest.mark.parametrize(
    "field,value",
    [
        ("dev_login_password", SecretStr("")),
        ("environment", "production"),
        ("backend_base_url", "https://grid.example.com"),
    ],
)
async def test_disabled_unless_every_condition_holds(api, user, dev_login_on, monkeypatch, field, value):
    monkeypatch.setattr(dev_login_on, field, value)
    response = await api.post("/auth/dev-login", json={"email": EMAIL, "password": TEST_PASSWORD})
    assert response.status_code == 404
    assert dev_login_on.session_cookie_name not in response.cookies
