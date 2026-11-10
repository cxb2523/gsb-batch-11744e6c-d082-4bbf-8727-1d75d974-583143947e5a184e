"""Single-use CSRF nonces for provider OAuth flows.

The `state` parameter exists to prove a callback belongs to a flow this server
started. Passing the project id through it proved nothing: it is a small
sequential integer, so anyone could call the callback with a code from their own
workspace and a guessed id and have that workspace connected to the project —
no session required, overwriting whatever was connected before.

A nonce is minted only on the admin-gated connect route, stored with the project
it belongs to, and consumed atomically on the way back so it works exactly once.
The project id is then read from the stored record, never from the query string.
"""

import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

from motor.motor_asyncio import AsyncIOMotorDatabase

COLLECTION = "oauth_states"

# Long enough to finish a consent screen, short enough that an abandoned attempt
# does not stay usable. Expiry is enforced here and swept by a TTL index.
TTL_MINUTES = 10


async def issue(db: AsyncIOMotorDatabase, provider: str, project_id: int, user_id: int) -> str:
    """Mint and store a nonce for one connect attempt, and return it."""
    state = secrets.token_urlsafe(32)
    now = datetime.now(timezone.utc)
    await db[COLLECTION].insert_one({
        "state": state,
        "provider": provider,
        "project_id": project_id,
        "user_id": user_id,
        "created_at": now,
        "expires_at": now + timedelta(minutes=TTL_MINUTES),
    })
    return state


async def consume(db: AsyncIOMotorDatabase, provider: str, state: str) -> Optional[dict]:
    """Atomically take a nonce, returning its record.

    Returns None when the state is empty, unknown, already used, issued for a
    different provider, or expired. The delete and the read are one operation, so
    two concurrent callbacks cannot both succeed on the same nonce.
    """
    if not state:
        return None
    record = await db[COLLECTION].find_one_and_delete({"state": state, "provider": provider})
    if not record:
        return None

    expires_at = record.get("expires_at")
    if isinstance(expires_at, datetime):
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if expires_at < datetime.now(timezone.utc):
            return None
    return record
