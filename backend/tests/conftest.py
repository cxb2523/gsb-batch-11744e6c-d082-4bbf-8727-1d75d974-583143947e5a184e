"""Shared fixtures for backend tests.

Tests run against a real MongoDB (the one in backend/.env) but in a throwaway
database per test, which is dropped afterwards. The app's own Mongo client is a
module-level singleton bound to the first event loop it sees, so each test gets
its own client and overrides `get_mongo_db` instead of sharing that one.
"""

import uuid

import httpx
import pytest
from motor.motor_asyncio import AsyncIOMotorClient


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.fixture
async def mongo_db():
    from app.core.settings import get_settings

    settings = get_settings()
    client = AsyncIOMotorClient(settings.mongodb_uri, serverSelectionTimeoutMS=3000)
    name = f"grid_test_{uuid.uuid4().hex[:12]}"
    db = client[name]
    try:
        await client.admin.command("ping")
    except Exception as exc:  # the database is not up: skip loudly rather than fail cryptically
        client.close()
        pytest.skip(f"MongoDB not reachable at {settings.mongodb_uri}: {exc}")
    try:
        yield db
    finally:
        await client.drop_database(name)
        client.close()


@pytest.fixture
async def api(mongo_db):
    """An httpx client bound to the app, using the throwaway database."""
    from app.core.security import CurrentUser, get_current_user
    from app.db.mongo import get_mongo_db
    from app.main import app

    async def _db():
        yield mongo_db

    state = {"user": CurrentUser(user_id=1, email="admin@example.com", name="Admin", role="admin")}
    app.dependency_overrides[get_mongo_db] = _db
    app.dependency_overrides[get_current_user] = lambda: state["user"]

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        client.state = state  # tests switch users by assigning client.state["user"]
        yield client

    app.dependency_overrides.clear()

