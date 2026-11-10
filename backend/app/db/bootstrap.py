"""Everything a database needs before the app can usefully serve a request.

Two callers, one definition:

  * ``app.main``'s lifespan hook runs :func:`sync_user_counter` and
    :func:`ensure_indexes` on every boot, so a long-running install picks up
    anything added since it was last started.
  * ``scripts/init_db.py`` runs :func:`bootstrap` against a database the app has
    never started on, and additionally creates the first global admin.

Every function here is idempotent: running it twice changes nothing the first
run did not already do. That is what lets the setup script be re-run after a
failure, and what lets the app call the same code on each boot.
"""

import logging
from datetime import datetime, timezone
from typing import Optional

from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo import ReturnDocument

from ..core.passwords import hash_password
from .indexes import ensure_indexes

logger = logging.getLogger(__name__)

# The app is single-organization; this is the id every settings lookup uses.
ORGANIZATION_ID = 1


async def sync_user_counter(db: AsyncIOMotorDatabase) -> int:
  """Advance the users counter to max(user_number). Returns the counter value.

  Prevents new signups from colliding with manually-seeded or imported users
  whose user_number values were assigned outside the counter. Only ever moves
  the counter forward.
  """
  pipeline = [{"$group": {"_id": None, "max": {"$max": "$user_number"}}}]
  result = await db["users"].aggregate(pipeline).to_list(1)
  max_num: int = (result[0].get("max") if result else 0) or 0

  if max_num > 0:
    await db["counters"].update_one(
      {"_id": "users", "seq": {"$lt": max_num}},
      {"$set": {"seq": max_num}},
      upsert=False,
    )
    # The counter document may not exist at all yet.
    await db["counters"].update_one(
      {"_id": "users"},
      {"$setOnInsert": {"seq": max_num}},
      upsert=True,
    )
    logger.info("users counter synced to %d", max_num)

  counter = await db["counters"].find_one({"_id": "users"})
  return int((counter or {}).get("seq", 0))


async def ensure_master_data(db: AsyncIOMotorDatabase) -> bool:
  """Create the organization settings document. True if it was created now.

  The API creates this lazily on first read, so an install works without it;
  seeding it up front just means the first admin to open settings is not also
  the one who creates them. Existing values are never overwritten.

  Ticket statuses, types and workflows are deliberately *not* seeded here:
  they are per-project and created by ``seed_default_statuses`` when a project
  is created, not install-wide.
  """
  result = await db["organization_settings"].update_one(
    {"organization_id": ORGANIZATION_ID},
    {
      "$setOnInsert": {
        "organization_id": ORGANIZATION_ID,
        "created_at": datetime.now(timezone.utc),
        "updated_at": None,
      }
    },
    upsert=True,
  )
  return result.upserted_id is not None


async def ensure_admin(
  db: AsyncIOMotorDatabase,
  email: str,
  password: str,
  name: str = "Administrator",
  reset_password: bool = False,
) -> str:
  """Create (or repair) the first global admin. Returns what it did.

  A global admin is simply a user with ``role == "admin"`` — there is no
  separate flag. ``must_change_password`` is False: this account's password was
  chosen by the person running setup, not generated for them, so there is
  nothing to force them to replace.

  Idempotent, and deliberately conservative about an account that already
  exists: it is promoted to admin and reactivated if needed, but its password is
  left alone unless ``reset_password`` is set. Re-running setup must never
  silently change the credentials someone is already signing in with.

  Returns one of "created", "updated" or "unchanged".
  """
  email = email.strip().lower()
  users = db["users"]
  existing = await users.find_one({"email": email})

  if existing:
    changes = {}
    if existing.get("role") != "admin":
      changes["role"] = "admin"
    if not existing.get("is_active", True):
      changes["is_active"] = True
    if reset_password:
      changes["password_hash"] = hash_password(password)
      changes["must_change_password"] = False
    if not changes:
      logger.info("admin %s already present; nothing to change", email)
      return "unchanged"
    await users.update_one({"email": email}, {"$set": changes})
    logger.info("admin %s updated (%s)", email, ", ".join(sorted(changes)))
    return "updated"

  counter = await db["counters"].find_one_and_update(
    {"_id": "users"},
    {"$inc": {"seq": 1}},
    upsert=True,
    return_document=ReturnDocument.AFTER,
  )
  doc = {
    "email": email,
    "name": name.strip() or "Administrator",
    "role": "admin",
    "department": None,
    "designation": None,
    "user_number": int(counter.get("seq", 1)),
    "is_active": True,
    "created_at": datetime.now(timezone.utc),
    "last_login_at": None,
    "password_hash": hash_password(password),
    "must_change_password": False,
  }
  await users.insert_one(doc)
  logger.info("admin %s created as user_number %d", email, doc["user_number"])
  return "created"


async def bootstrap(
  db: AsyncIOMotorDatabase,
  admin_email: Optional[str] = None,
  admin_password: Optional[str] = None,
  admin_name: str = "Administrator",
  reset_password: bool = False,
) -> dict:
  """Index, seed and (optionally) create the first admin, in that order.

  Indexes come first so the unique constraint on users.email is already in
  place when the admin is inserted. Returns a summary for the caller to print.
  """
  summary: dict = {}
  summary["indexes"] = await ensure_indexes(db)
  await sync_user_counter(db)
  summary["master_data"] = "created" if await ensure_master_data(db) else "unchanged"

  if admin_email and admin_password:
    summary["admin"] = await ensure_admin(
      db, admin_email, admin_password, admin_name, reset_password
    )
  else:
    summary["admin"] = "skipped"

  # Read the counter last: creating the admin above advances it, and a caller
  # printing a pre-admin value would report 0 on a database that now has one user.
  counter = await db["counters"].find_one({"_id": "users"})
  summary["counter"] = int((counter or {}).get("seq", 0))
  return summary
