"""Daily standup: a cross-project board of what each person did yesterday and is on today.

Visibility is deliberately not scoped by project membership — the standup is a
team call and every logged-in user sees every project's tickets here. Changing
who is *in* the standup is admin-only.
"""

import logging
import re
from datetime import date, datetime, timedelta, timezone
from typing import Annotated, List, Optional, Tuple

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError

from ..core.security import CurrentUser, get_current_user, require_admin
from ..db.mongo import get_mongo_db
from ..db.queries import NOT_ARCHIVED
from ..schemas.standup import (
    AddedItemIn,
    AddedItemOut,
    AddedSection,
    BlockerNote,
    BlockerNoteIn,
    MoveIn,
    MoveOut,
    PersonTicketOption,
    PickerSection,
    RosterIn,
    RosterMember,
    RosterOut,
    StandupBoard,
    StandupTask,
    TaskIn,
    TaskPatch,
    TodayItemIn,
    TodayItemOut,
)
from ..services.standup_board import build_board
from ..services.standup_carryover import carry_over_previous_day
from ..services.standup_export import build_work_export
from ..services.standup_roster import get_roster, normalize_email, save_roster
from ..services.standup_time import is_weekend, ist_today, next_working_day, parse_standup_date

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/standup", tags=["standup"])

TODAY_ITEMS = "standup_today_items"
ADDED_ITEMS = "standup_added_items"
BLOCKER_NOTES = "standup_blocker_notes"
TASKS = "standup_tasks"
MAX_PAST_DAYS = 60
MAX_NOTES_PER_PERSON_DAY = 20
MAX_TASKS_PER_PERSON_DAY = 50
# The pickers filter client-side, so return everything a person realistically has assigned.
PICKER_LIMIT = 500
PICKER_SCAN = 2000


def _require_editable_date(value: date, current_user: CurrentUser) -> None:
    """Past standups are a record, so people may only change today and the next working day.

    The next working day is open so work can be carried forward over a weekend.
    Admins may also correct the last MAX_PAST_DAYS days.
    """
    today = ist_today()
    earliest = today - timedelta(days=MAX_PAST_DAYS) if current_user.role == "admin" else today
    if value > next_working_day(today) or value < earliest:
        detail = "Date is outside the editable range" if current_user.role == "admin" else "Past standups can't be changed"
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)


def _validate_date(raw: Optional[str]) -> date:
    try:
        standup_date = parse_standup_date(raw)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid date, expected YYYY-MM-DD") from None
    if standup_date > ist_today():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Standup date cannot be in the future")
    return standup_date


def _require_can_edit(current_user: CurrentUser, email: str) -> None:
    """A board belongs to its person: only they or an admin may change it.

    Reading stays open to everyone — the whole team watches the board during the
    call — but every write below is owner-or-admin.
    """
    if current_user.role == "admin" or normalize_email(current_user.email) == email:
        return
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Only this person or an admin can change their standup",
    )


async def _require_roster_member(db: AsyncIOMotorDatabase, email: str) -> str:
    normalized = normalize_email(email)
    roster = await get_roster(db)
    if normalized not in roster.emails:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"{normalized} is not in the standup",
        )
    return normalized


async def _load_ticket(db: AsyncIOMotorDatabase, ticket_id: int) -> Tuple[dict, Optional[str]]:
    """A non-archived ticket and its status name, or 404."""
    ticket = await db["tickets"].find_one(
        {"ticket_number": ticket_id, **NOT_ARCHIVED}, {"_id": 0, "ticket_number": 1, "project_id": 1, "status_id": 1}
    )
    if not ticket:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found")
    status_doc = None
    if ticket.get("status_id") is not None:
        status_doc = await db["ticket_statuses"].find_one({"status_number": ticket["status_id"]}, {"_id": 0, "name": 1})
    return ticket, (status_doc or {}).get("name")


# ---------- board ----------

@router.get("/board", response_model=StandupBoard, response_model_by_alias=True)
async def get_board(
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
    date_param: Annotated[Optional[str],Query(alias="date",description="Standup date, YYYY-MM-DD (IST). Defaults to today.",),] = None
):
    standup_date = _validate_date(date_param)
    roster = await get_roster(db)
    # Today's board starts as a copy of the previous working day's, once, on first open.
    if standup_date == ist_today() and not is_weekend(standup_date):
        try:
            await carry_over_previous_day(db, standup_date, roster.emails)
        except Exception:  # noqa: BLE001 — never block the board; the copy is retried on the next load
            logger.exception("standup: carry-over for %s failed; it will be retried", standup_date)
    return await build_board(
        db, standup_date, roster,
        is_admin=current_user.role == "admin",
        viewer_email=normalize_email(current_user.email),
    )


# ---------- today: pin / hide ----------

@router.put("/today", response_model=TodayItemOut)
async def set_today_item(
    payload: TodayItemIn,
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    """Add a ticket to someone's today (also how carry forward lands on the next day). Idempotent.

    Anyone may do this for anyone in the standup — the presenter edits plans live
    during the call — and who made the change is recorded.
    """
    _require_editable_date(payload.date, current_user)
    email = await _require_roster_member(db, payload.email)
    _require_can_edit(current_user, email)
    ticket, _ = await _load_ticket(db, payload.ticket_id)

    now = datetime.now(timezone.utc)
    await db[TODAY_ITEMS].update_one(
        {"email": email, "date": payload.date.isoformat(), "ticket_id": payload.ticket_id},
        {
            # kind is always "pin"; kept so rows written before the board went manual-only still read the same.
            "$set": {"kind": "pin", "project_id": ticket["project_id"], "created_by": current_user.email, "updated_at": now},
            "$setOnInsert": {"created_at": now},
        },
        upsert=True,
    )
    return TodayItemOut(email=email, date=payload.date, ticket_id=payload.ticket_id)


@router.delete("/today", status_code=status.HTTP_204_NO_CONTENT)
async def remove_today_item(
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
    email: Annotated[str, Query(min_length=3, max_length=254)],
    date_param: Annotated[date, Query(alias="date")],
    ticket_id: Annotated[int, Query(ge=1)],
):
    """Take a ticket off someone's today. Removing something that is not there is not an error."""
    owner = normalize_email(email)
    _require_can_edit(current_user, owner)
    _require_editable_date(date_param, current_user)
    await db[TODAY_ITEMS].delete_one({"email": owner, "date": date_param.isoformat(), "ticket_id": ticket_id})
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---------- moving a card between Yesterday and Today ----------

COLUMN_NAME = {"yesterday": "Yesterday", "today": "Today"}


@router.post("/move", response_model=MoveOut)
async def move_card(
    payload: MoveIn,
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    """Move a ticket or adhoc task from one of Yesterday / Today to the other.

    The card leaves its column; it is never duplicated. If the other column already
    has it — the same ticket, or the linked copy of the same task — that is a 409.
    """
    _require_editable_date(payload.date, current_user)
    email = await _require_roster_member(db, payload.email)
    _require_can_edit(current_user, email)
    day = payload.date.isoformat()
    source = "today" if payload.to == "yesterday" else "yesterday"
    now = datetime.now(timezone.utc)

    if payload.kind == "ticket":
        ticket_id = payload.ticket_id
        where_today = {"email": email, "date": day, "ticket_id": ticket_id, "kind": "pin"}
        where_yesterday = {"email": email, "date": day, "section": "yesterday", "ticket_id": ticket_id}
        in_today = await db[TODAY_ITEMS].find_one(where_today)
        in_yesterday = await db[ADDED_ITEMS].find_one(where_yesterday)
        source_doc = in_today if source == "today" else in_yesterday
        if not source_doc:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"That ticket isn't in {COLUMN_NAME[source]}")
        if in_today if payload.to == "today" else in_yesterday:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Already in {COLUMN_NAME[payload.to]}")

        carry = {"created_by": current_user.email, "created_at": now, "updated_at": now, "project_id": source_doc.get("project_id")}
        if payload.to == "today":
            await db[TODAY_ITEMS].update_one(
                {"email": email, "date": day, "ticket_id": ticket_id}, {"$set": {"kind": "pin", **carry}}, upsert=True,
            )
            await db[ADDED_ITEMS].delete_one(where_yesterday)
        else:
            await db[ADDED_ITEMS].update_one(where_yesterday, {"$set": carry}, upsert=True)
            await db[TODAY_ITEMS].delete_one(where_today)
        return MoveOut(to=payload.to)

    object_id = _task_object_id(payload.task_id)
    task = await db[TASKS].find_one({"_id": object_id, "email": email, "date": day})
    if not task or task.get("section") != source:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"That task isn't in {COLUMN_NAME[source]}")
    # Its linked copy (carried one way or the other) already sitting in the target column.
    linked = [value for value in (task.get("carried_from"), task.get("copied_from")) if value]
    twin = await db[TASKS].find_one({
        "email": email, "date": day, "section": payload.to,
        "$or": [{"carried_from": payload.task_id}, {"copied_from": payload.task_id},
                *([{"_id": ObjectId(value)} for value in linked if ObjectId.is_valid(value)])],
    })
    if twin:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Already in {COLUMN_NAME[payload.to]}")
    await db[TASKS].update_one({"_id": object_id}, {"$set": {"section": payload.to, "updated_at": now}})
    return MoveOut(to=payload.to)


# ---------- tickets added by hand: yesterday, blockers ----------

@router.put("/items/{section}", response_model=AddedItemOut)
async def add_ticket_item(
    section: AddedSection,
    payload: AddedItemIn,
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    """Add a ticket to someone's yesterday or blockers. Idempotent.

    Stored against the standup date and kept apart from today's entries, so one
    ticket can sit in several columns.
    """
    _require_editable_date(payload.date, current_user)
    email = await _require_roster_member(db, payload.email)
    _require_can_edit(current_user, email)
    ticket, _ = await _load_ticket(db, payload.ticket_id)

    now = datetime.now(timezone.utc)
    await db[ADDED_ITEMS].update_one(
        {"email": email, "date": payload.date.isoformat(), "section": section, "ticket_id": payload.ticket_id},
        {
            "$set": {"project_id": ticket["project_id"], "updated_at": now},
            "$setOnInsert": {"created_by": current_user.email, "created_at": now},
        },
        upsert=True,
    )
    return AddedItemOut(email=email, date=payload.date, section=section, ticket_id=payload.ticket_id)


@router.delete("/items/{section}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_ticket_item(
    section: AddedSection,
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
    email: Annotated[str, Query(min_length=3, max_length=254)],
    date_param: Annotated[date, Query(alias="date")],
    ticket_id: Annotated[int, Query(ge=1)],
):
    """Take a ticket off someone's yesterday or blockers. Idempotent."""
    owner = normalize_email(email)
    _require_can_edit(current_user, owner)
    _require_editable_date(date_param, current_user)
    await db[ADDED_ITEMS].delete_one(
        {"email": owner, "date": date_param.isoformat(), "section": section, "ticket_id": ticket_id}
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---------- blocker notes ----------

@router.post("/blockers", response_model=BlockerNote, status_code=status.HTTP_201_CREATED)
async def add_blocker_note(
    payload: BlockerNoteIn,
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    """Record a free-text blocker for a person on a standup date."""
    _require_editable_date(payload.date, current_user)
    email = await _require_roster_member(db, payload.email)
    _require_can_edit(current_user, email)
    day = payload.date.isoformat()

    # Not a hard guarantee under concurrent posts; it only stops runaway input.
    if await db[BLOCKER_NOTES].count_documents({"email": email, "date": day}) >= MAX_NOTES_PER_PERSON_DAY:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Too many blockers for one day")

    now = datetime.now(timezone.utc)
    result = await db[BLOCKER_NOTES].insert_one(
        {"email": email, "date": day, "text": payload.text, "created_by": current_user.email, "created_at": now}
    )
    return BlockerNote(id=str(result.inserted_id), text=payload.text, created_by=current_user.email, created_at=now)


@router.delete("/blockers/{note_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_blocker_note(
    note_id: str,
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    """Delete a blocker note. Deleting one that is already gone is not an error."""
    try:
        object_id = ObjectId(note_id)
    except InvalidId:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Blocker not found") from None
    note = await db[BLOCKER_NOTES].find_one({"_id": object_id}, {"email": 1, "date": 1})
    if note:
        _require_can_edit(current_user, note["email"])
        _require_editable_date(date.fromisoformat(note["date"]), current_user)
        await db[BLOCKER_NOTES].delete_one({"_id": object_id})
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---------- plain-text tasks ----------


def _task_object_id(task_id: str) -> ObjectId:
    try:
        return ObjectId(task_id)
    except InvalidId:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found") from None


def _task_out(doc: dict, carried_forward: bool = False) -> StandupTask:
    return StandupTask(
        id=str(doc["_id"]), section=doc["section"], text=doc["text"], status=doc.get("status") or "todo",
        created_by=doc.get("created_by"), created_at=doc["created_at"],
        carried_from=doc.get("carried_from"), carried_forward=carried_forward,
    )


@router.post("/tasks", response_model=StandupTask, status_code=status.HTTP_201_CREATED)
async def add_task(
    payload: TaskIn,
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    """Record plain-text work under someone's yesterday or today."""
    _require_editable_date(payload.date, current_user)
    email = await _require_roster_member(db, payload.email)
    _require_can_edit(current_user, email)
    day = payload.date.isoformat()
    if await db[TASKS].count_documents({"email": email, "date": day}) >= MAX_TASKS_PER_PERSON_DAY:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Too many tasks for one day")

    now = datetime.now(timezone.utc)
    doc = {
        "email": email, "date": day, "section": payload.section, "text": payload.text, "status": payload.status,
        "created_by": current_user.email, "created_at": now, "updated_at": now,
    }
    result = await db[TASKS].insert_one(doc)
    return _task_out({**doc, "_id": result.inserted_id})


@router.patch("/tasks/{task_id}", response_model=StandupTask)
async def update_task(
    task_id: str,
    payload: TaskPatch,
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    """Change a task's text or status."""
    changes = payload.model_dump(exclude_none=True)
    if not changes:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Nothing to update")
    object_id = _task_object_id(task_id)
    existing = await db[TASKS].find_one({"_id": object_id}, {"date": 1, "email": 1})
    if not existing:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
    _require_can_edit(current_user, existing["email"])
    _require_editable_date(date.fromisoformat(existing["date"]), current_user)

    doc = await db[TASKS].find_one_and_update(
        {"_id": object_id},
        {"$set": {**changes, "updated_at": datetime.now(timezone.utc)}},
        return_document=ReturnDocument.AFTER,
    )
    if not doc:  # deleted between the read and the write
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
    carried = await db[TASKS].count_documents({"carried_from": task_id}, limit=1) > 0
    return _task_out(doc, carried_forward=carried)


@router.delete("/tasks/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_task(
    task_id: str,
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    """Delete a task. Its forward copy, if any, is kept. Idempotent."""
    object_id = _task_object_id(task_id)
    task = await db[TASKS].find_one({"_id": object_id}, {"email": 1, "date": 1})
    if task:
        _require_can_edit(current_user, task["email"])
        _require_editable_date(date.fromisoformat(task["date"]), current_user)
        await db[TASKS].delete_one({"_id": object_id})
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/tasks/{task_id}/carry-forward", response_model=StandupTask)
async def carry_task_forward(
    task_id: str,
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    """Copy an unfinished task onward and return the copy. Repeating it returns the same copy.

    Yesterday's task moves to today on the same standup; today's task moves to the
    next working day's today.
    """
    source = await db[TASKS].find_one({"_id": _task_object_id(task_id)})
    if not source:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
    _require_can_edit(current_user, source["email"])
    if source.get("status") == "done":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Done tasks can't be carried forward")

    source_date = date.fromisoformat(source["date"])
    target_date = source_date if source["section"] == "yesterday" else next_working_day(source_date)
    _require_editable_date(target_date, current_user)

    existing = await db[TASKS].find_one({"carried_from": task_id})
    if existing:
        return _task_out(existing)

    now = datetime.now(timezone.utc)
    doc = {
        "email": source["email"], "date": target_date.isoformat(), "section": "today", "text": source["text"],
        "status": source.get("status") or "todo", "carried_from": task_id,
        "created_by": current_user.email, "created_at": now, "updated_at": now,
    }
    try:
        result = await db[TASKS].insert_one(doc)
    except DuplicateKeyError:  # a concurrent carry forward won
        return _task_out(await db[TASKS].find_one({"carried_from": task_id}))
    return _task_out({**doc, "_id": result.inserted_id})


# ---------- ticket search for the pickers ----------

@router.get("/tickets", response_model=List[PersonTicketOption])
async def search_person_tickets(
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
    email: Annotated[str, Query(min_length=3, max_length=254)],
    q: Annotated[str, Query(max_length=100)] = "",
    section: PickerSection = "yesterday",
):
    """Tickets assigned to a person, across every project, for the add pickers.

    Every status is offered, Backlog included: people arrange their own board and
    a missing ticket is more confusing than an odd one. Archived tickets are left
    out. `section` only affects ordering: yesterday lists the most recently
    updated first, the others the newest tickets first.
    """
    person = await _require_roster_member(db, email)
    user = await db["users"].find_one({"email": person}, {"_id": 0, "user_number": 1})

    assignee_match: list = [{"assignee_email": person}]
    if user and user.get("user_number") is not None:
        assignee_match.append({"assignee_email": {"$in": [None, ""]}, "assignee_id": user["user_number"]})

    query: dict = {"$and": [{"$or": assignee_match}, NOT_ARCHIVED]}
    term = q.strip()
    if term:
        pattern = re.escape(term)
        query["$and"].append({"$or": [
            {"title": {"$regex": pattern, "$options": "i"}},
            {"key": {"$regex": pattern, "$options": "i"}},
        ]})

    tickets = await db["tickets"].find(
        query, {"_id": 0, "ticket_number": 1, "project_id": 1, "key": 1, "title": 1, "type": 1, "status_id": 1},
    ).sort("updated_at" if section == "yesterday" else "ticket_number", -1).to_list(length=PICKER_SCAN)

    status_ids = list({t.get("status_id") for t in tickets if t.get("status_id") is not None})
    names = {
        s["status_number"]: s["name"]
        async for s in db["ticket_statuses"].find({"status_number": {"$in": status_ids}}, {"_id": 0, "status_number": 1, "name": 1})
    }

    options = []
    for ticket in tickets:
        status_name = names.get(ticket.get("status_id"))
        options.append(PersonTicketOption(
            id=ticket["ticket_number"], project_id=ticket["project_id"], key=ticket.get("key") or "",
            title=ticket.get("title") or "", type=ticket.get("type"), status_name=status_name,
        ))
        if len(options) >= PICKER_LIMIT:
            break
    return options


# ---------- export ----------

XLSX_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


@router.get("/export")
async def export_work(
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
    email: Annotated[str, Query(min_length=3, max_length=254)],
    start: Annotated[Optional[date], Query(alias="from")] = None,
    end: Annotated[Optional[date], Query(alias="to")] = None,
):
    """Everything this person has had on the standup, as a workbook.

    Owner-or-admin like the writes: a person's standup history is their own
    record, for a work summary, an appraisal or a resume.
    """
    person = normalize_email(email)
    _require_can_edit(current_user, person)
    if start and end and start > end:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="The start date is after the end date")

    user = await db["users"].find_one({"email": person}, {"_id": 0, "name": 1})
    name = (user or {}).get("name") or person.split("@")[0]
    content = await build_work_export(db, person, name, start=start, end=end)

    slug = "".join(char if char.isalnum() else "-" for char in name.lower()).strip("-") or "standup"
    filename = f"standup-work-{slug}-{ist_today().isoformat()}.xlsx"
    return Response(
        content=content,
        media_type=XLSX_MEDIA_TYPE,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ---------- roster ----------

async def _roster_members(db: AsyncIOMotorDatabase, emails: List[str]) -> List[RosterMember]:
    users = {
        u["email"].lower(): u
        async for u in db["users"].find(
            {"email": {"$in": emails}},
            {"_id": 0, "email": 1, "name": 1, "role": 1, "profile_photo": 1, "is_active": 1},
        )
    }
    members = []
    for email in emails:
        user = users.get(email)
        members.append(RosterMember(
            email=email,
            name=(user or {}).get("name") or email.split("@")[0],
            photo=(user or {}).get("profile_photo"),
            role=(user or {}).get("role"),
            has_account=user is not None,
            is_active=(user or {}).get("is_active", True) is not False,
        ))
    return members


@router.get("/roster", response_model=RosterOut)
async def get_standup_roster(
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    roster = await get_roster(db)
    return RosterOut(
        members=await _roster_members(db, roster.emails),
        is_default=roster.is_default,
        updated_at=roster.updated_at,
        updated_by=roster.updated_by,
    )


@router.get("/roster/candidates", response_model=List[RosterMember])
async def get_roster_candidates(
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
    current_user: Annotated[CurrentUser, Depends(require_admin)],
):
    """Everyone who can be added: all active users in the organisation."""
    users = await db["users"].find(
        {"is_active": {"$ne": False}},
        {"_id": 0, "email": 1, "name": 1, "role": 1, "profile_photo": 1},
    ).to_list(length=None)

    seen = set()
    candidates = []
    for user in users:
        email = (user.get("email") or "").strip().lower()
        if not email or email in seen:
            continue
        seen.add(email)
        candidates.append(RosterMember(
            email=email, name=user.get("name") or email.split("@")[0],
            photo=user.get("profile_photo"), role=user.get("role"),
        ))

    return sorted(candidates, key=lambda member: member.name.lower())


@router.put("/roster", response_model=RosterOut)
async def update_standup_roster(
    payload: RosterIn,
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
    current_user: Annotated[CurrentUser, Depends(require_admin)],
):
    """Replace the roster. List order is presentation order."""
    emails: List[str] = []
    for raw in payload.emails:
        email = normalize_email(raw)
        if email and email not in emails:
            emails.append(email)

    known = {
        u["email"].lower()
        async for u in db["users"].find({"email": {"$in": emails}}, {"_id": 0, "email": 1})
    }
    unknown = [email for email in emails if email not in known]
    if unknown:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown people: {', '.join(unknown)}",
        )

    roster = await save_roster(db, emails, updated_by=current_user.email)
    return RosterOut(
        members=await _roster_members(db, roster.emails),
        is_default=False,
        updated_at=roster.updated_at,
        updated_by=roster.updated_by,
    )
