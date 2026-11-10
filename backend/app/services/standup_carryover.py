"""Start each day from the previous working day's board.

The first time a day's board is opened, each person's most recent earlier board
is copied in — normally the previous working day (Friday feeds Monday), but if a
day was skipped (a holiday, a day off) it reaches back to the last day that had
anything on it, up to LOOKBACK_DAYS:

- Yesterday ("Since Friday") gets everything that was on the previous Today, in
  any status. What you planned is what you report on.
- Today gets only the work that is still going: tickets Ready to Pick or In
  Progress, and adhoc tasks not yet Done. In Review, Testing and Done count as
  finished and stay behind.
- Blockers carry over as they were, tickets and notes alike.

Tickets that have been archived or deleted since are left behind everywhere.

The copy is made once per person per day and is a real copy: removing or adding
afterwards only affects that day, and the day is never re-seeded (so a person who
clears a column keeps it clear). Every copy write is an idempotent upsert, and a
copy that fails partway releases the day again, so the next load finishes it
instead of leaving a half-filled board marked as done.
"""

import asyncio
from datetime import date, datetime, timedelta, timezone
from typing import Dict, List, Optional

from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo import ReturnDocument, UpdateOne
from pymongo.errors import BulkWriteError, DuplicateKeyError

from ..db.queries import NOT_ARCHIVED
from .status_category import categorize_status, is_backlog

SEEDS = "standup_day_seeds"
TODAY_ITEMS = "standup_today_items"
ADDED_ITEMS = "standup_added_items"
BLOCKER_NOTES = "standup_blocker_notes"
TASKS = "standup_tasks"

# How far back to look for someone's last board when days were skipped.
LOOKBACK_DAYS = 14
DUPLICATE_KEY = 11000


def still_going(status_name: Optional[str]) -> bool:
    """Ready to Pick or In Progress: work that belongs on the next day's Today.

    Review, testing and done are finished from the developer's side; blocked
    work lives in Blockers; Backlog was never really planned.
    """
    if is_backlog(status_name):
        return False
    return categorize_status(status_name) in ("todo", "in_progress")


async def _upsert_all(collection, operations: List[UpdateOne]) -> None:
    """Apply upserts; an entry that already exists is fine, anything else is a real failure."""
    if not operations:
        return
    try:
        await collection.bulk_write(operations, ordered=False)
    except BulkWriteError as error:
        if any(item.get("code") != DUPLICATE_KEY for item in error.details.get("writeErrors", [])):
            raise


async def _last_board_day(db: AsyncIOMotorDatabase, emails: List[str], day: date) -> Dict[str, str]:
    """Each person's most recent day, before `day`, that had anything on their board."""
    window = {"$lt": day.isoformat(), "$gte": (day - timedelta(days=LOOKBACK_DAYS)).isoformat()}
    sources = [
        (TODAY_ITEMS, {"kind": "pin"}),
        (ADDED_ITEMS, {"section": "blockers"}),
        (TASKS, {"section": "today"}),
        (BLOCKER_NOTES, {}),
    ]
    results = await asyncio.gather(*(
        db[name].aggregate([
            {"$match": {"email": {"$in": emails}, "date": window, **extra}},
            {"$group": {"_id": "$email", "last": {"$max": "$date"}}},
        ]).to_list(length=None)
        for name, extra in sources
    ))
    latest: Dict[str, str] = {}
    for rows in results:
        for row in rows:
            if row["last"] > latest.get(row["_id"], ""):
                latest[row["_id"]] = row["last"]
    return latest


async def carry_over_previous_day(db: AsyncIOMotorDatabase, standup_date: date, emails: List[str]) -> None:
    """Seed `standup_date` from each person's last board, for anyone not seeded yet."""
    if not emails:
        return

    day = standup_date.isoformat()
    seeded = {doc["email"] async for doc in db[SEEDS].find({"email": {"$in": emails}, "date": day}, {"_id": 0, "email": 1})}
    pending = [email for email in emails if email not in seeded]
    if not pending:
        return

    now = datetime.now(timezone.utc)
    source_of = await _last_board_day(db, pending, standup_date)

    # Claim the day first: if two requests race, only one copies.
    claimed = []
    for email in pending:
        try:
            await db[SEEDS].insert_one({"email": email, "date": day, "source_date": source_of.get(email), "created_at": now})
            claimed.append(email)
        except DuplicateKeyError:
            continue
    to_copy = [email for email in claimed if email in source_of]
    if not to_copy:
        return  # nothing on any earlier board: they start empty, and that is final

    try:
        await _copy(db, day, {email: source_of[email] for email in to_copy}, now)
    except Exception:
        # Release the claim so the next load finishes the copy; every write above is an upsert,
        # so whatever did land is not duplicated.
        await db[SEEDS].delete_many({"email": {"$in": to_copy}, "date": day})
        raise


async def _copy(db: AsyncIOMotorDatabase, day: str, source_of: Dict[str, str], now: datetime) -> None:
    from_each = {"$or": [{"email": email, "date": source} for email, source in source_of.items()]}

    source_pins, source_tasks, source_blockers, source_notes = await asyncio.gather(
        db[TODAY_ITEMS].find({**from_each, "kind": "pin"}, {"_id": 0, "email": 1, "date": 1, "ticket_id": 1, "project_id": 1}).to_list(length=None),
        db[TASKS].find({**from_each, "section": "today"}).to_list(length=None),
        db[ADDED_ITEMS].find({**from_each, "section": "blockers"}, {"_id": 0, "email": 1, "date": 1, "ticket_id": 1, "project_id": 1}).to_list(length=None),
        db[BLOCKER_NOTES].find(from_each).to_list(length=None),
    )

    # Current status decides whether a planned ticket is still going; archived and
    # deleted tickets are simply not found, so they are never copied.
    ticket_status: Dict[int, Optional[str]] = {}
    source_ticket_ids = list({item["ticket_id"] for item in (*source_pins, *source_blockers)})
    if source_ticket_ids:
        tickets = await db["tickets"].find(
            {"ticket_number": {"$in": source_ticket_ids}, **NOT_ARCHIVED},
            {"_id": 0, "ticket_number": 1, "status_id": 1},
        ).to_list(length=None)
        names = {
            s["status_number"]: s.get("name")
            async for s in db["ticket_statuses"].find(
                {"status_number": {"$in": list({t["status_id"] for t in tickets if t.get("status_id") is not None})}},
                {"_id": 0, "status_number": 1, "name": 1},
            )
        }
        ticket_status = {t["ticket_number"]: names.get(t.get("status_id")) for t in tickets}

    def carried(item: dict, extra: dict) -> dict:
        return {"$setOnInsert": {"created_by": None, "created_at": now, "carried_from_date": item["date"]}, **extra}

    # Yesterday: everything that was planned, whatever happened to it.
    await _upsert_all(db[ADDED_ITEMS], [
        UpdateOne(
            {"email": pin["email"], "date": day, "section": "yesterday", "ticket_id": pin["ticket_id"]},
            carried(pin, {"$set": {"project_id": pin.get("project_id"), "updated_at": now}}),
            upsert=True,
        )
        for pin in source_pins
        if pin["ticket_id"] in ticket_status
    ])

    # Today: only what is still Ready to Pick or In Progress.
    await _upsert_all(db[TODAY_ITEMS], [
        UpdateOne(
            {"email": pin["email"], "date": day, "ticket_id": pin["ticket_id"]},
            carried(pin, {"$set": {"kind": "pin", "project_id": pin.get("project_id"), "updated_at": now}}),
            upsert=True,
        )
        for pin in source_pins
        if pin["ticket_id"] in ticket_status and still_going(ticket_status[pin["ticket_id"]])
    ])

    # Blockers: as they were.
    await _upsert_all(db[ADDED_ITEMS], [
        UpdateOne(
            {"email": item["email"], "date": day, "section": "blockers", "ticket_id": item["ticket_id"]},
            carried(item, {"$set": {"project_id": item.get("project_id"), "updated_at": now}}),
            upsert=True,
        )
        for item in source_blockers
        if item["ticket_id"] in ticket_status
    ])
    await _upsert_all(db[BLOCKER_NOTES], [
        UpdateOne(
            {"email": note["email"], "date": day, "carried_from": str(note["_id"])},
            {"$setOnInsert": {
                "text": note["text"], "created_by": note.get("created_by"),
                "created_at": now, "carried_from_date": note["date"],
            }},
            upsert=True,
        )
        for note in source_notes
    ])

    # Adhoc tasks: all of them into Yesterday; the unfinished ones on into Today,
    # linked to their Yesterday copy so the two show as the same work.
    for task in source_tasks:
        status_value = task.get("status") or "todo"
        report = await db[TASKS].find_one_and_update(
            {"email": task["email"], "date": day, "section": "yesterday", "copied_from": str(task["_id"])},
            {"$setOnInsert": {
                "text": task["text"], "status": status_value, "created_by": task.get("created_by"),
                "created_at": now, "updated_at": now,
            }},
            upsert=True,
            return_document=ReturnDocument.AFTER,
        )
        if status_value == "done":
            continue
        # Carried to today by hand on the source day: that copy already is today's.
        if await db[TASKS].count_documents({"carried_from": str(task["_id"]), "date": day}, limit=1):
            continue
        try:
            await db[TASKS].insert_one({
                "email": task["email"], "date": day, "section": "today", "text": task["text"],
                "status": status_value, "carried_from": str(report["_id"]),
                "created_by": task.get("created_by"), "created_at": now, "updated_at": now,
            })
        except DuplicateKeyError:
            continue  # already copied on an earlier attempt
