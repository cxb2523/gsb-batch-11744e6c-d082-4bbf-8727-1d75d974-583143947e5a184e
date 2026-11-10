import re

from fastapi import APIRouter, Depends, HTTPException, Query, status
from typing import List, Optional, Union
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorDatabase

from ..core.security import get_current_user, CurrentUser
from ..db.mongo import get_mongo_db
from ..db.queries import NOT_ARCHIVED
from ..schemas.epic import (
    EpicCreate,
    EpicUpdate,
    EpicResponse,
    EpicWithStats,
    EpicListItem,
    EpicPage,
    UserInfo
)
from .tickets import decode_cursor, encode_cursor

router = APIRouter()


# Epics live in the `tickets` collection with `type="epic"`. This module
# exposes them via the dedicated /projects/{id}/epics API so the frontend
# Epics page works against the same canonical data as `epic_id` references
# from regular tickets (which point at the epic's `ticket_number`).
EPIC_TYPE = "epic"


# Map incoming EpicCreate/EpicUpdate status strings to the mandated 6-status
# board. Anything unknown falls back to "Backlog".
_EPIC_STATUS_TO_BOARD_NAME = {
    "planned": "Backlog",
    "backlog": "Backlog",
    "in_progress": "In Progress",
    "in-progress": "In Progress",
    "inprogress": "In Progress",
    "blocked": "Blocked",
    "testing": "Testing",
    "qa": "Testing",
    "in_review": "Testing",
    "in-review": "Testing",
    "completed": "Done",
    "done": "Done",
    "cancelled": "Done",
    "ready_to_pick": "Ready to Pick",
    "ready-to-pick": "Ready to Pick",
    "ready to pick": "Ready to Pick",
}


# Inverse map for the API response: ticket_statuses.name → API status string.
_BOARD_NAME_TO_EPIC_STATUS = {
    "backlog": "planned",
    "ready to pick": "planned",
    "in progress": "in_progress",
    "blocked": "in_progress",
    "testing": "in_progress",
    "done": "completed",
}


# ========== Helper Functions ==========

async def verify_project_access(
    project_id: int,
    current_user: CurrentUser,
    db: AsyncIOMotorDatabase,
    min_role: str = "viewer"
) -> dict:
    """Verify that the current user has access to the project."""
    projects_collection = db["projects"]

    project = await projects_collection.find_one({"project_number": project_id})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    if current_user.role == "admin":
        return project

    if project.get("owner_id") == current_user.id:
        return project

    members_collection = db["project_members"]
    member = await members_collection.find_one({
        "project_id": project_id,
        "$or": [
            {"user_email": current_user.email},
            {"user_id": current_user.id},
        ],
        "active": True
    })

    if not member:
        raise HTTPException(status_code=403, detail="Access denied")

    member_role = member.get("role", "viewer")
    role_hierarchy = {"viewer": 0, "member": 1, "admin": 2}

    if role_hierarchy.get(member_role, 0) < role_hierarchy.get(min_role, 0):
        raise HTTPException(
            status_code=403,
            detail=f"{min_role.capitalize()} privileges required"
        )

    return project


async def get_user_info(db: AsyncIOMotorDatabase, user_id: int) -> Optional[UserInfo]:
    """Get user information by user_number (legacy)."""
    if not user_id:
        return None

    users_collection = db["users"]
    user = await users_collection.find_one({"user_number": user_id})

    if not user:
        return None

    name = user.get("name", user.get("email", "Unknown"))
    initials = "".join([part[0].upper() for part in name.split()][:2])

    return UserInfo(
        id=user_id,
        name=name,
        email=user.get("email", ""),
        initials=initials
    )


async def get_user_info_by_email(db: AsyncIOMotorDatabase, email: Optional[str]) -> Optional[UserInfo]:
    """Resolve user info from email. Returns None if email is falsy."""
    if not email:
        return None
    user = await db["users"].find_one({"email": email})
    if not user:
        local = email.split("@")[0] if "@" in email else email
        return UserInfo(
            id=0,
            name=local,
            email=email,
            initials=(local[:2] or "U U").upper(),
        )
    name = user.get("name") or email.split("@")[0]
    initials = "".join([part[0].upper() for part in (name or "U U").split()][:2])
    return UserInfo(
        id=user.get("user_number") or 0,
        name=name,
        email=email,
        initials=initials,
    )


async def _resolve_assignee(db: AsyncIOMotorDatabase, doc: dict) -> Optional[UserInfo]:
    """Resolve assignee preferring `assignee_email`, with `assignee_id` fallback."""
    email = doc.get("assignee_email")
    if email:
        return await get_user_info_by_email(db, email)
    legacy_id = doc.get("assignee_id")
    if legacy_id:
        return await get_user_info(db, legacy_id)
    return None


async def _user_number_to_email(db: AsyncIOMotorDatabase, user_number: Optional[int]) -> Optional[str]:
    """Resolve a legacy `user_number` to the user's email."""
    if not user_number:
        return None
    user = await db["users"].find_one({"user_number": user_number})
    return user.get("email") if user else None


async def _board_status_name(db: AsyncIOMotorDatabase, project_id: int, status_id: Optional[int]) -> str:
    """Return the human-readable name of a `ticket_statuses` row (or 'Backlog' on miss)."""
    if not status_id:
        return "Backlog"
    s = await db["ticket_statuses"].find_one({"status_number": status_id, "project_id": project_id})
    return (s.get("name") if s else None) or "Backlog"


async def _resolve_status_id_for_epic(db: AsyncIOMotorDatabase, project_id: int, status_str: Optional[str]) -> int:
    """Map an EpicCreate/Update `status` string to a `ticket_statuses.status_number`.

    Falls back to the project's "Backlog" status, then to its first status.
    """
    target_name = _EPIC_STATUS_TO_BOARD_NAME.get((status_str or "").strip().lower(), "Backlog")
    statuses = db["ticket_statuses"]
    s = await statuses.find_one({"project_id": project_id, "name": target_name})
    if s:
        return int(s["status_number"])
    s = await statuses.find_one({"project_id": project_id, "name": "Backlog"})
    if s:
        return int(s["status_number"])
    s = await statuses.find_one({"project_id": project_id}, sort=[("position", 1)])
    if not s:
        raise HTTPException(status_code=500, detail="No statuses defined for project")
    return int(s["status_number"])


def _api_status_from_board_name(board_name: str) -> str:
    """Convert a board status name into the API/epic status enum string."""
    return _BOARD_NAME_TO_EPIC_STATUS.get((board_name or "").strip().lower(), "planned")


async def _allocate_ticket_number(db: AsyncIOMotorDatabase) -> int:
    """Allocate the next `ticket_number`, syncing the counter with actual max in DB."""
    pipeline = [{"$group": {"_id": None, "max_num": {"$max": "$ticket_number"}}}]
    res = await db["tickets"].aggregate(pipeline).to_list(1)
    max_existing = res[0]["max_num"] if res and res[0].get("max_num") else 0
    counter = await db["counters"].find_one_and_update(
        {"_id": "tickets"},
        [{"$set": {"seq": {"$max": [{"$add": [{"$ifNull": ["$seq", 0]}, 1]}, max_existing + 1]}}}],
        upsert=True,
        return_document=True,
    )
    return int(counter["seq"])


async def _next_epic_key_seq(db: AsyncIOMotorDatabase, project_id: int, project_key: str) -> int:
    """Allocate the next epic key sequence for {PROJECT}-E{N}, synced with existing max."""
    import re
    prefix = f"{project_key}-E"
    max_seq = 0
    async for ticket in db["tickets"].find(
        {"project_id": project_id, "type": EPIC_TYPE, "key": {"$regex": f"^{re.escape(prefix)}\\d+$"}},
        {"key": 1},
    ):
        key = ticket.get("key", "")
        try:
            n = int(key[len(prefix):])
            if n > max_seq:
                max_seq = n
        except (ValueError, IndexError):
            pass
    counter = await db["counters"].find_one_and_update(
        {"_id": f"epic_key_{project_id}"},
        [{"$set": {"seq": {"$max": [{"$add": [{"$ifNull": ["$seq", 0]}, 1]}, max_seq + 1]}}}],
        upsert=True,
        return_document=True,
    )
    return int(counter["seq"])


_DONE_STATUS_NAMES = ("done", "completed")
_IN_PROGRESS_STATUS_NAMES = ("in progress", "blocked", "testing", "in review")

_EMPTY_EPIC_STATS = {
    "total_tickets": 0,
    "completed_tickets": 0,
    "in_progress_tickets": 0,
    "todo_tickets": 0,
    "progress_percentage": 0,
}


async def epic_stats_many(db: AsyncIOMotorDatabase, epic_ids: List[int]) -> dict:
    """Progress counts for several epics at once, keyed by epic id.

    Two queries whatever the number of epics. The previous shape — read every
    child document of an epic, then query the status collection once per child —
    cost a listing of 20 epics over 400 round trips and read the full body of
    every ticket under them, all to produce two integers per epic.

    Children are counted per (epic, status) by the database; only the status
    names come back here, so the tickets themselves are never loaded.
    """
    if not epic_ids:
        return {}

    rows = await db["tickets"].aggregate([
        {"$match": {"epic_id": {"$in": epic_ids}, "type": {"$ne": EPIC_TYPE}, **NOT_ARCHIVED}},
        {"$group": {"_id": {"epic_id": "$epic_id", "status_id": "$status_id"}, "count": {"$sum": 1}}},
    ]).to_list(length=None)

    status_ids = {r["_id"].get("status_id") for r in rows if r["_id"].get("status_id")}
    status_names: dict = {}
    if status_ids:
        async for status_doc in db["ticket_statuses"].find({"status_number": {"$in": list(status_ids)}}):
            status_names[status_doc["status_number"]] = (status_doc.get("name") or "").strip().lower()

    stats = {epic_id: dict(_EMPTY_EPIC_STATS) for epic_id in epic_ids}
    for row in rows:
        epic_id = row["_id"].get("epic_id")
        entry = stats.get(epic_id)
        if entry is None:
            continue
        count = row["count"]
        entry["total_tickets"] += count

        # A child with no status, or one pointing at a status that no longer
        # exists, counts toward the total but lands in neither bucket — as before.
        status_id = row["_id"].get("status_id")
        name = status_names.get(status_id) if status_id else None
        if name in _DONE_STATUS_NAMES:
            entry["completed_tickets"] += count
        elif name in _IN_PROGRESS_STATUS_NAMES:
            entry["in_progress_tickets"] += count

    for entry in stats.values():
        total = entry["total_tickets"]
        entry["todo_tickets"] = total - entry["completed_tickets"] - entry["in_progress_tickets"]
        entry["progress_percentage"] = round(
            (entry["completed_tickets"] / total * 100) if total > 0 else 0, 1
        )
    return stats


async def get_epic_stats(epic_ticket_number: int, db: AsyncIOMotorDatabase) -> dict:
    """Calculate ticket statistics for one epic (referenced by its ticket_number)."""
    stats = await epic_stats_many(db, [epic_ticket_number])
    return stats.get(epic_ticket_number, dict(_EMPTY_EPIC_STATS))


def _epic_list_item(
    epic: dict,
    stats: dict,
    assignee: Optional[UserInfo],
    board_name: str,
) -> EpicListItem:
    """Build an EpicListItem from an epic doc and its already-resolved pieces."""
    return EpicListItem(
        id=int(epic["ticket_number"]),
        key=epic.get("key") or "",
        title=epic.get("title") or "",
        status=_api_status_from_board_name(board_name),
        color=epic.get("epic_color") or epic.get("color") or "#155dfc",
        assignee_id=assignee.id if assignee else None,
        assignee=assignee,
        due_date=epic.get("due_date"),
        total_tickets=stats["total_tickets"],
        completed_tickets=stats["completed_tickets"],
        progress_percentage=stats["progress_percentage"],
    )


async def _epic_list_items(db: AsyncIOMotorDatabase, project_id: int, epics: List[dict]) -> List[EpicListItem]:
    """Serialize a page of epics, resolving their shared pieces once.

    Every epic needs progress counts, an assignee and a status name. Resolved per
    epic that was four round trips each; here it is a fixed handful for the whole
    list, with the counts coming from epic_stats_many.
    """
    if not epics:
        return []

    stats = await epic_stats_many(db, [int(e["ticket_number"]) for e in epics])

    # The project's statuses, for the board name each epic reports.
    status_names: dict = {}
    async for status_doc in db["ticket_statuses"].find({"project_id": project_id}):
        status_names[status_doc["status_number"]] = status_doc.get("name")

    emails = {e["assignee_email"] for e in epics if e.get("assignee_email")}
    numbers = {e["assignee_id"] for e in epics if not e.get("assignee_email") and e.get("assignee_id")}
    users_by_email: dict = {}
    users_by_number: dict = {}
    if emails or numbers:
        query: dict = {"$or": []}
        if emails:
            query["$or"].append({"email": {"$in": list(emails)}})
        if numbers:
            query["$or"].append({"user_number": {"$in": list(numbers)}})
        async for user in db["users"].find(query):
            if user.get("email"):
                users_by_email[user["email"]] = user
            if user.get("user_number") is not None:
                users_by_number[user["user_number"]] = user

    def _assignee(epic: dict) -> Optional[UserInfo]:
        """Mirrors _resolve_assignee and the two get_user_info helpers it calls."""
        email = epic.get("assignee_email")
        if email:
            user = users_by_email.get(email)
            if not user:
                local = email.split("@")[0] if "@" in email else email
                return UserInfo(id=0, name=local, email=email, initials=(local[:2] or "U U").upper())
            name = user.get("name") or email.split("@")[0]
            return UserInfo(
                id=user.get("user_number") or 0,
                name=name,
                email=email,
                initials="".join([part[0].upper() for part in (name or "U U").split()][:2]),
            )
        legacy_id = epic.get("assignee_id")
        if not legacy_id:
            return None
        user = users_by_number.get(legacy_id)
        if not user:
            return None
        name = user.get("name") or "Unknown"
        return UserInfo(
            id=legacy_id,
            name=name,
            email=user.get("email", ""),
            initials="".join([part[0].upper() for part in (name or "U U").split()][:2]),
        )

    return [
        _epic_list_item(
            epic,
            stats.get(int(epic["ticket_number"]), dict(_EMPTY_EPIC_STATS)),
            _assignee(epic),
            status_names.get(epic.get("status_id")) or "Backlog",
        )
        for epic in epics
    ]


async def _epic_doc_to_response(db: AsyncIOMotorDatabase, epic: dict) -> EpicResponse:
    """Build an EpicResponse from a tickets-collection epic doc."""
    assignee = await _resolve_assignee(db, epic)
    board_name = await _board_status_name(db, int(epic["project_id"]), epic.get("status_id"))
    created_by = epic.get("legacy_created_by") or epic.get("created_by") or 0
    if not created_by and epic.get("reporter_email"):
        u = await db["users"].find_one({"email": epic["reporter_email"]})
        if u:
            created_by = int(u.get("user_number") or 0)

    return EpicResponse(
        id=int(epic["ticket_number"]),
        project_id=int(epic["project_id"]),
        key=epic.get("key") or "",
        title=epic.get("title") or "",
        description=epic.get("description"),
        status=_api_status_from_board_name(board_name),
        assignee_id=assignee.id if assignee else None,
        assignee=assignee,
        due_date=epic.get("due_date"),
        start_date=epic.get("start_date"),
        color=epic.get("epic_color") or epic.get("color") or "#155dfc",
        position=int(epic.get("epic_position") or 0),
        created_at=epic.get("created_at") or datetime.now(timezone.utc),
        updated_at=epic.get("updated_at"),
        created_by=int(created_by),
    )


# ========== API Endpoints ==========

@router.get("/projects/{project_id}/epics", response_model=Union[EpicPage, List[EpicListItem]])
async def list_epics(
    project_id: int,
    status: Optional[str] = None,
    assignee_id: Optional[int] = None,
    assignee_email: Optional[str] = None,
    q: Optional[str] = None,
    limit: Optional[int] = Query(None, ge=1, le=200),
    cursor: Optional[str] = None,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_mongo_db)
):
    """List a project's epics (stored as tickets with type=epic), optionally filtered.

    `q` matches the key or title, the same pair the Epics page matched in the
    browser; the other filters are unchanged.

    Passing `limit` returns an EpicPage instead of a bare list. Epics sort by their
    board position rather than by date, so the cursor carries that position with the
    epic's own number behind it - positions are editable and not guaranteed distinct,
    and without the tiebreak two epics sharing one would straddle a page boundary.
    """
    await verify_project_access(project_id, current_user, db)

    query: dict = {"project_id": project_id, "type": EPIC_TYPE}

    if status:
        board_name = _EPIC_STATUS_TO_BOARD_NAME.get(status.strip().lower())
        if board_name:
            s = await db["ticket_statuses"].find_one({"project_id": project_id, "name": board_name})
            if s:
                query["status_id"] = int(s["status_number"])

    if assignee_email is None and assignee_id:
        assignee_email = await _user_number_to_email(db, assignee_id)
    if assignee_email:
        query["assignee_email"] = assignee_email

    if q and q.strip():
        # Escaped: a search is for the text typed, not for a pattern.
        pattern = {"$regex": re.escape(q.strip()), "$options": "i"}
        query["$or"] = [{"key": pattern}, {"title": pattern}]

    tickets_collection = db["tickets"]
    query.update(NOT_ARCHIVED)

    total = await tickets_collection.count_documents(query) if limit else 0

    page_query = query
    if limit and cursor:
        parts = decode_cursor(cursor, 2)
        if parts:
            raw_position, raw_number = parts
            position = int(raw_position or 0)
            number = int(raw_number)
            page_query = dict(query)
            page_query["$and"] = [{
                "$or": [
                    {"epic_position": {"$gt": position}},
                    {"epic_position": position, "ticket_number": {"$gt": number}},
                ]
            }]

    finder = tickets_collection.find(page_query).sort([("epic_position", 1), ("ticket_number", 1)])
    if limit:
        # One extra row, to tell whether a further page exists.
        finder = finder.limit(limit + 1)
    epics = await finder.to_list(length=None)

    has_more = bool(limit) and len(epics) > limit
    if has_more:
        epics = epics[:limit]

    items = await _epic_list_items(db, project_id, epics)
    if not limit:
        return items

    next_cursor = None
    if has_more and epics:
        last = epics[-1]
        next_cursor = encode_cursor([last.get("epic_position") or 0, last.get("ticket_number")])
    return {"items": items, "next_cursor": next_cursor, "total": total}


@router.get("/projects/{project_id}/epics/{epic_id}", response_model=EpicWithStats)
async def get_epic(
    project_id: int,
    epic_id: int,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_mongo_db)
):
    """Get epic details with ticket statistics."""
    await verify_project_access(project_id, current_user, db)

    epic = await db["tickets"].find_one({
        "project_id": project_id,
        "type": EPIC_TYPE,
        "ticket_number": epic_id,
    })

    if not epic:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Epic not found")

    base = await _epic_doc_to_response(db, epic)
    stats = await get_epic_stats(epic_id, db)
    return EpicWithStats(**base.model_dump(), **stats)


@router.post("/projects/{project_id}/epics", response_model=EpicResponse, status_code=status.HTTP_201_CREATED)
async def create_epic(
    project_id: int,
    epic_data: EpicCreate,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_mongo_db)
):
    """Create a new epic (inserted into tickets with type=epic)."""
    project = await verify_project_access(project_id, current_user, db, min_role="member")

    # Allocate ticket_number (the epic's id) and its key
    ticket_number = await _allocate_ticket_number(db)
    epic_seq = await _next_epic_key_seq(db, project_id, project["key"])
    epic_key = f"{project['key']}-E{epic_seq}"

    # Resolve assignee
    assignee_email = await _user_number_to_email(db, epic_data.assignee_id)

    # Resolve status_id from the epic-status string
    status_id = await _resolve_status_id_for_epic(db, project_id, epic_data.status)

    # Compute next epic_position
    max_pos_doc = await db["tickets"].find_one(
        {"project_id": project_id, "type": EPIC_TYPE},
        sort=[("epic_position", -1)],
    )
    next_position = int((max_pos_doc or {}).get("epic_position") or 0) + 1

    now = datetime.now(timezone.utc)
    epic_doc = {
        "ticket_number": ticket_number,
        "project_id": project_id,
        "key": epic_key,
        "title": epic_data.title,
        "description": epic_data.description,
        "type": EPIC_TYPE,
        "status_id": status_id,
        "priority": "medium",
        "assignee_email": assignee_email,
        "reporter_email": current_user.email,
        "due_date": epic_data.due_date,
        "start_date": epic_data.start_date,
        "labels": [],
        "epic_id": None,
        "parent_id": None,
        "sprint_id": None,
        "story_points": None,
        "original_estimate_seconds": None,
        "time_spent_seconds": 0,
        "remaining_estimate_seconds": None,
        "epic_color": epic_data.color or "#155dfc",
        "epic_position": next_position,
        "created_at": now,
        "updated_at": None,
        "legacy_created_by": current_user.id,
    }

    await db["tickets"].insert_one(epic_doc)
    return await _epic_doc_to_response(db, epic_doc)


@router.put("/projects/{project_id}/epics/{epic_id}", response_model=EpicResponse)
async def update_epic(
    project_id: int,
    epic_id: int,
    epic_data: EpicUpdate,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_mongo_db)
):
    """Update an epic (stored as a ticket with type=epic)."""
    await verify_project_access(project_id, current_user, db, min_role="member")

    tickets = db["tickets"]
    epic = await tickets.find_one({
        "project_id": project_id,
        "type": EPIC_TYPE,
        "ticket_number": epic_id,
    })
    if not epic:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Epic not found")

    incoming = epic_data.model_dump(exclude_unset=True)
    update_data: dict = {}

    if "title" in incoming:
        update_data["title"] = incoming["title"]
    if "description" in incoming:
        update_data["description"] = incoming["description"]
    if "due_date" in incoming:
        update_data["due_date"] = incoming["due_date"]
    if "start_date" in incoming:
        update_data["start_date"] = incoming["start_date"]
    if "color" in incoming and incoming["color"]:
        update_data["epic_color"] = incoming["color"]
    if "position" in incoming and incoming["position"] is not None:
        update_data["epic_position"] = incoming["position"]
    if "assignee_id" in incoming:
        update_data["assignee_email"] = await _user_number_to_email(db, incoming["assignee_id"])
    if "status" in incoming and incoming["status"] is not None:
        update_data["status_id"] = await _resolve_status_id_for_epic(db, project_id, incoming["status"])

        # An epic may only enter a Done status when all of its (non-archived) child tickets
        # are done. This mirrors the frontend guard, but enforced server-side so it can't be
        # bypassed via a direct API call. Each child in turn required a merge request link or
        # a comment to reach Done, so a completed epic transitively carries that evidence.
        # Only fires on an actual transition INTO Done, so re-saving a done epic isn't blocked.
        DONE_NAMES = {"done", "completed", "closed"}
        target_name = await _board_status_name(db, project_id, update_data["status_id"])
        old_name = await _board_status_name(db, project_id, epic.get("status_id"))
        if target_name.strip().lower() in DONE_NAMES and old_name.strip().lower() not in DONE_NAMES:
            stats = await get_epic_stats(int(epic["ticket_number"]), db)
            remaining = stats["total_tickets"] - stats["completed_tickets"]
            if remaining > 0:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"This epic can't be marked as Done yet. "
                        f"{remaining} of its {stats['total_tickets']} tickets "
                        f"{'is' if remaining == 1 else 'are'} still not done. "
                        f"Finish those tickets first, then try again."
                    ),
                )

    if update_data:
        update_data["updated_at"] = datetime.now(timezone.utc)
        updated = await tickets.find_one_and_update(
            {"project_id": project_id, "type": EPIC_TYPE, "ticket_number": epic_id},
            {"$set": update_data},
            return_document=True,
        )
        if updated:
            return await _epic_doc_to_response(db, updated)

    return await _epic_doc_to_response(db, epic)


@router.delete("/projects/{project_id}/epics/{epic_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_epic(
    project_id: int,
    epic_id: int,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_mongo_db)
):
    """Delete an epic (admin only). Tickets that referenced it are unlinked, not deleted."""
    await verify_project_access(project_id, current_user, db, min_role="admin")

    tickets = db["tickets"]
    epic = await tickets.find_one({
        "project_id": project_id,
        "type": EPIC_TYPE,
        "ticket_number": epic_id,
    })
    if not epic:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Epic not found")

    # Unlink child tickets
    await tickets.update_many(
        {"project_id": project_id, "epic_id": epic_id, "type": {"$ne": EPIC_TYPE}},
        {"$unset": {"epic_id": ""}},
    )

    await tickets.delete_one({"project_id": project_id, "type": EPIC_TYPE, "ticket_number": epic_id})


@router.post("/projects/{project_id}/epics/reorder")
async def reorder_epics(
    project_id: int,
    epic_ids: List[int],
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_mongo_db)
):
    """Reorder epics by updating their `epic_position`."""
    await verify_project_access(project_id, current_user, db, min_role="member")

    tickets = db["tickets"]
    for position, ticket_number in enumerate(epic_ids):
        await tickets.update_one(
            {"project_id": project_id, "type": EPIC_TYPE, "ticket_number": ticket_number},
            {"$set": {"epic_position": position}},
        )

    return {"message": "Epics reordered successfully"}
