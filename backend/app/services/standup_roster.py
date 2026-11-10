"""Who is in the daily standup.

The roster is configured by an admin. Until one saves it, all active users in the
organisation are shown — so the standup always reflects the real team without any
hardcoded names.
"""

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import List, Optional

from motor.motor_asyncio import AsyncIOMotorDatabase

SETTINGS_COLLECTION = "standup_settings"
SETTINGS_ID = "default"


@dataclass
class Roster:
    emails: List[str]
    is_default: bool
    updated_at: Optional[datetime] = None
    updated_by: Optional[str] = None


def normalize_email(value: str) -> str:
    return value.strip().lower()


async def get_roster(db: AsyncIOMotorDatabase) -> Roster:
    doc = await db[SETTINGS_COLLECTION].find_one({"_id": SETTINGS_ID})
    if not doc or "roster" not in doc:
        active_users = await db["users"].find(
            {"is_active": {"$ne": False}},
            {"_id": 0, "email": 1, "name": 1},
        ).to_list(length=None)
        emails = sorted(
            [u["email"].strip().lower() for u in active_users if u.get("email")],
            key=lambda e: e,
        )
        return Roster(emails=emails, is_default=True)

    entries = sorted(doc.get("roster") or [], key=lambda entry: entry.get("position", 0))
    emails = [normalize_email(entry["email"]) for entry in entries if entry.get("email")]
    return Roster(
        emails=emails,
        is_default=False,
        updated_at=doc.get("updated_at"),
        updated_by=doc.get("updated_by"),
    )


async def save_roster(db: AsyncIOMotorDatabase, emails: List[str], updated_by: str) -> Roster:
    """Replace the roster. `emails` must already be validated, normalised and de-duplicated."""
    now = datetime.now(timezone.utc)
    await db[SETTINGS_COLLECTION].update_one(
        {"_id": SETTINGS_ID},
        {"$set": {
            "roster": [{"email": email, "position": index} for index, email in enumerate(emails)],
            "updated_at": now,
            "updated_by": updated_by,
        }},
        upsert=True,
    )
    return Roster(emails=list(emails), is_default=False, updated_at=now, updated_by=updated_by)
