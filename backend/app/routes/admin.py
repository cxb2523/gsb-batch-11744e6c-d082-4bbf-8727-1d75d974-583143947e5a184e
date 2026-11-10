"""Admin-only endpoints for team management and oversight."""

import re
from typing import Annotated, List, Optional
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo import ReturnDocument

from ..db.mongo import get_mongo_db
from ..core.security import get_current_user, CurrentUser, require_admin, invalidate_role_cache
from ..core.passwords import hash_password
from pydantic import BaseModel, Field


router = APIRouter(prefix="/admin", tags=["admin"])


class MemberTicket(BaseModel):
    """Ticket assigned to a member."""
    id: int
    project_id: int
    project_name: str
    key: str
    title: str
    priority: Optional[str]
    due_date: Optional[str]
    status: Optional[str]


class TeamMemberView(BaseModel):
    """A team member row. Tickets are loaded lazily when the card is expanded."""
    user_id: int
    user_name: str
    user_email: str
    ticket_count: int


class TeamViewSummary(BaseModel):
    """Aggregate counts over the whole filtered set (not just the current page)."""
    total_members: int
    total_tickets: int
    overdue_tickets: int


class StatusOption(BaseModel):
    id: int
    name: str


class MemberOption(BaseModel):
    id: int
    name: str


class TeamViewFilterOptions(BaseModel):
    """Values available to populate the filter dropdowns, scoped to accessible projects."""
    priorities: List[str]
    statuses: List[StatusOption]
    members: List[MemberOption]


class TeamViewResponse(BaseModel):
    """Paginated members (each carrying its first page of tickets) + summary + filter options."""
    items: List[TeamMemberView]
    total: int           # total members matching the filters
    limit: int
    offset: int
    has_more: bool
    summary: TeamViewSummary
    filter_options: TeamViewFilterOptions


class MemberTicketsResponse(BaseModel):
    """One member's tickets, paginated (used by the per-card 'Load more')."""
    items: List[MemberTicket]
    total: int
    limit: int
    offset: int
    has_more: bool


# Default page sizes for the two levels of pagination.
MEMBER_PAGE_DEFAULT = 10
TICKETS_PAGE_DEFAULT = 20

# Only the fields the Team View actually renders — keeps payloads small.
_TICKET_PROJECTION = {
    "_id": 0, "ticket_number": 1, "project_id": 1, "key": 1,
    "title": 1, "priority": 1, "due_date": 1, "status_id": 1,
}

# Sorts no-due-date tickets last.
_FAR_FUTURE = datetime(9999, 12, 31, tzinfo=timezone.utc)

# Coerce a mixed-type due_date (BSON date OR ISO string) into a comparable date.
# due_date is stored inconsistently across tickets, so Mongo range matching needs this.
_DUE_COERCE = {
    "$cond": [
        {"$eq": [{"$type": "$due_date"}, "date"]},
        "$due_date",
        {"$dateFromString": {"dateString": {"$toString": "$due_date"}, "onError": None, "onNull": None}},
    ]
}


async def _accessible_project_ids(db, current_user) -> List[int]:
    """project_numbers the current user may see (all for admins; their memberships otherwise)."""
    if current_user.role == "admin":
        projects = await db["projects"].find({}, {"project_number": 1}).to_list(length=None)
        return [p["project_number"] for p in projects if p.get("project_number")]
    memberships = await db["project_members"].find(
        {"user_id": current_user.id, "$or": [{"active": True}, {"active": {"$exists": False}}]},
        {"project_id": 1},
    ).to_list(length=None)
    return [m["project_id"] for m in memberships if m.get("project_id")]


async def _project_map(db, project_ids: List[int]) -> dict:
    cur = db["projects"].find({"project_number": {"$in": project_ids}}, {"project_number": 1, "name": 1})
    return {p["project_number"]: p.get("name", "Unknown") for p in await cur.to_list(length=None) if p.get("project_number")}


async def _status_map(db) -> dict:
    cur = db["ticket_statuses"].find({}, {"status_number": 1, "name": 1})
    return {s["status_number"]: s.get("name", "Unknown") for s in await cur.to_list(length=None) if s.get("status_number")}


# Sortable columns -> the ticket field (or computed field) to sort by.
_SORT_FIELDS = {
    "ticket": "key",
    "title": "title",
    "priority": "_priority_rank",
    "due": "_due_sort",
    "project": "_project_name",
    "status": "_status_name",
}

# Rank priorities by severity (not alphabetically) for sorting. Legacy p0/p1/p2 are
# ranked alongside their canonical equivalents in case any linger pre-migration.
_PRIORITY_RANK_SWITCH = {
    "$switch": {
        "branches": [
            {"case": {"$in": ["$priority", ["urgent", "p0"]]}, "then": 0},
            {"case": {"$in": ["$priority", ["high", "p1"]]}, "then": 1},
            {"case": {"$in": ["$priority", ["medium", "p2"]]}, "then": 2},
            {"case": {"$eq": ["$priority", "low"]}, "then": 3},
        ],
        "default": 99,  # unknown / no priority sorts last
    }
}


async def _common_clauses(db, accessible_ids, project_id, priority, status_id, search) -> List[dict]:
    """Filter clauses shared by both endpoints — everything except the assignee/member constraint.

    Search now matches ticket key/title OR the assignee's name (resolved to emails/ids), and we
    always exclude tickets assigned to deactivated users.
    """
    clauses: List[dict] = []
    clauses.append({"project_id": project_id} if project_id is not None else {"project_id": {"$in": accessible_ids}})
    if priority:
        clauses.append({"priority": priority})
    if status_id is not None:
        clauses.append({"status_id": status_id})

    search_clause = await _search_clause(db, search)
    if search_clause:
        clauses.append(search_clause)

    inactive_clause = await _inactive_exclusion(db)
    if inactive_clause:
        clauses.append(inactive_clause)

    return clauses


async def _inactive_exclusion(db) -> Optional[dict]:
    """A clause excluding tickets assigned to deactivated users (by email or legacy id)."""
    inactive = await db["users"].find({"is_active": False}, {"email": 1, "user_number": 1}).to_list(length=None)
    emails = [u["email"] for u in inactive if u.get("email")]
    ids = [u["user_number"] for u in inactive if u.get("user_number") is not None]
    nor: List[dict] = []
    if emails:
        nor.append({"assignee_email": {"$in": emails}})
    if ids:
        nor.append({"assignee_id": {"$in": ids}})
    return {"$nor": nor} if nor else None


async def _search_clause(db, search: Optional[str]) -> Optional[dict]:
    """Match ticket key/title, or any ticket assigned to a member whose name matches `search`."""
    if not search or not search.strip():
        return None
    rx = {"$regex": re.escape(search.strip()), "$options": "i"}
    ors: List[dict] = [{"key": rx}, {"title": rx}]
    matched = await db["users"].find({"name": rx}, {"email": 1, "user_number": 1}).to_list(length=None)
    emails = [u["email"] for u in matched if u.get("email")]
    ids = [u["user_number"] for u in matched if u.get("user_number") is not None]
    if emails:
        ors.append({"assignee_email": {"$in": emails}})
    if ids:
        ors.append({"assignee_id": {"$in": ids}})
    return {"$or": ors}


def _member_clause(member_email: Optional[str], member_id: Optional[int]) -> dict:
    """Match tickets assigned to one specific member (by modern email or legacy numeric id)."""
    mem_or: List[dict] = []
    if member_email:
        mem_or.append({"assignee_email": member_email})
    if member_id is not None:
        mem_or.append({"assignee_id": member_id})
    # If the member can't be identified, match nothing rather than everything.
    return {"$or": mem_or} if mem_or else {"ticket_number": {"$exists": False}}


def _any_assignee_clause() -> dict:
    return {"$or": [
        {"assignee_email": {"$exists": True, "$ne": None}},
        {"assignee_id": {"$exists": True, "$ne": None}},
    ]}


def _due_stages(due: Optional[str]) -> List[dict]:
    """Aggregation stages that filter by the due-date bucket, normalizing mixed types first."""
    if not due or due == "all":
        return []
    now = datetime.now(timezone.utc)
    today = datetime(now.year, now.month, now.day, tzinfo=timezone.utc)
    tomorrow = today + timedelta(days=1)
    week = today + timedelta(days=7)
    if due == "overdue":
        match = {"_due": {"$ne": None, "$lt": today}}
    elif due == "dueToday":
        match = {"_due": {"$gte": today, "$lt": tomorrow}}
    elif due == "dueSoon":
        match = {"_due": {"$gte": tomorrow, "$lt": week}}
    elif due == "noDueDate":
        match = {"_due": None}
    else:
        return []
    return [{"$addFields": {"_due": _DUE_COERCE}}, {"$match": match}]


def _to_member_ticket(t: dict, project_map: dict, status_map: dict) -> MemberTicket:
    due = t.get("due_date")
    due_str = due.isoformat() if isinstance(due, datetime) else (due if isinstance(due, str) else None)
    pid = t.get("project_id")
    sid = t.get("status_id")
    return MemberTicket(
        id=t.get("ticket_number"),
        project_id=pid,
        project_name=project_map.get(pid, f"Project {pid}"),
        key=t.get("key", ""),
        title=t.get("title", ""),
        priority=t.get("priority"),
        due_date=due_str,
        status=status_map.get(sid) if sid else None,
    )


async def _member_tickets_page(db, common_clauses, member_email, member_id, due,
                               project_map, status_map, limit, offset,
                               sort: str = "due", order: str = "asc"):
    """One member's tickets, filtered + sorted + paginated. Returns (items, total)."""
    tickets = db["tickets"]
    match = {"$and": list(common_clauses) + [_member_clause(member_email, member_id)]}
    due_stages = _due_stages(due)

    count_res = await tickets.aggregate([{"$match": match}, *due_stages, {"$count": "n"}]).to_list(length=1)
    total = count_res[0]["n"] if count_res else 0

    sort_key = _SORT_FIELDS.get(sort, "_due_sort")
    direction = -1 if order == "desc" else 1

    stages: List[dict] = [{"$match": match}, *due_stages,
                          {"$addFields": {"_due_sort": {"$ifNull": [_DUE_COERCE, _FAR_FUTURE]}}}]
    # Sorting by the project/status *name* (what the column shows) needs a lookup.
    if sort_key == "_priority_rank":
        stages.append({"$addFields": {"_priority_rank": _PRIORITY_RANK_SWITCH}})
    elif sort_key == "_project_name":
        stages.append({"$lookup": {"from": "projects", "localField": "project_id",
                                   "foreignField": "project_number", "as": "_p"}})
        stages.append({"$addFields": {"_project_name": {"$toLower": {"$ifNull": [{"$arrayElemAt": ["$_p.name", 0]}, ""]}}}})
    elif sort_key == "_status_name":
        stages.append({"$lookup": {"from": "ticket_statuses", "localField": "status_id",
                                   "foreignField": "status_number", "as": "_s"}})
        stages.append({"$addFields": {"_status_name": {"$toLower": {"$ifNull": [{"$arrayElemAt": ["$_s.name", 0]}, ""]}}}})
    stages.append({"$sort": {sort_key: direction, "ticket_number": 1}})
    stages.append({"$skip": offset})
    stages.append({"$limit": limit})
    stages.append({"$project": _TICKET_PROJECTION})

    page = await tickets.aggregate(stages, collation={"locale": "en", "strength": 2}).to_list(length=None)
    items = [_to_member_ticket(d, project_map, status_map) for d in page]
    return items, total


@router.get("/team-view", response_model=TeamViewResponse)
async def get_team_view(
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
    limit: int = Query(MEMBER_PAGE_DEFAULT, ge=1, le=50, description="Members per page"),
    offset: int = Query(0, ge=0, description="Member offset for pagination"),
    search: Optional[str] = Query(None, description="Match ticket key or title (case-insensitive)"),
    member_id: Optional[int] = Query(None, description="Limit to a single member (user_number)"),
    project_id: Optional[int] = Query(None, description="Limit to a single project (project_number)"),
    priority: Optional[str] = Query(None, description="Exact priority value, e.g. 'high'"),
    status_id: Optional[int] = Query(None, description="status_number to filter by"),
    due: Optional[str] = Query(None, description="all|overdue|dueToday|dueSoon|noDueDate"),
):
    """Members (paginated) with their ticket counts, in projects the user can access.

    Tickets themselves are loaded lazily per member (see the per-member endpoint). All filtering,
    grouping and pagination happen in Mongo; the response also carries filtered summary stats and
    the values needed to populate the filter dropdowns. Deactivated users are excluded throughout.
    """
    tickets = db["tickets"]
    users = db["users"]

    empty = TeamViewResponse(
        items=[], total=0, limit=limit, offset=offset, has_more=False,
        summary=TeamViewSummary(total_members=0, total_tickets=0, overdue_tickets=0),
        filter_options=TeamViewFilterOptions(priorities=[], statuses=[], members=[]),
    )

    accessible = await _accessible_project_ids(db, current_user)
    if not accessible:
        return empty
    # A project filter outside the user's access yields nothing.
    if project_id is not None and project_id not in accessible:
        return empty

    project_map = await _project_map(db, accessible)
    status_map = await _status_map(db)

    # Resolve the member filter's email so we can match email- or id-keyed tickets.
    member_email = None
    if member_id is not None:
        u = await users.find_one({"user_number": member_id}, {"email": 1})
        member_email = u.get("email") if u else None

    common_clauses = await _common_clauses(db, accessible, project_id, priority, status_id, search)
    member_scope = _member_clause(member_email, member_id) if member_id is not None else _any_assignee_clause()
    members_match = {"$and": common_clauses + [member_scope]}
    due_stages = _due_stages(due)

    # --- Members page: collapse tickets -> assignees, resolve to users, sort, paginate. ---
    # Group by raw assignee key FIRST (few groups) so the user lookup runs per-assignee, not per-ticket.
    members_pipeline = [
        {"$match": members_match},
        *due_stages,
        {"$addFields": {"_akey": {"$ifNull": ["$assignee_email", {"$concat": ["id:", {"$toString": "$assignee_id"}]}]}}},
        {"$group": {"_id": "$_akey", "ticket_count": {"$sum": 1},
                    "assignee_email": {"$first": "$assignee_email"}, "assignee_id": {"$first": "$assignee_id"}}},
        {"$lookup": {"from": "users", "localField": "assignee_email", "foreignField": "email", "as": "_u"}},
        {"$addFields": {"_member_id": {"$ifNull": ["$assignee_id", {"$arrayElemAt": ["$_u.user_number", 0]}]}}},
        {"$match": {"_member_id": {"$ne": None}}},
        # Re-group in case a member had some tickets by email and some by legacy id.
        {"$group": {"_id": "$_member_id", "ticket_count": {"$sum": "$ticket_count"}}},
        {"$lookup": {"from": "users", "localField": "_id", "foreignField": "user_number", "as": "_mu"}},
        {"$match": {"_mu": {"$ne": []}}},
        {"$addFields": {"user_name": {"$arrayElemAt": ["$_mu.name", 0]},
                        "user_email": {"$arrayElemAt": ["$_mu.email", 0]}}},
        {"$sort": {"user_name": 1, "_id": 1}},
        {"$facet": {
            "meta": [{"$group": {"_id": None, "total_members": {"$sum": 1},
                                 "total_tickets": {"$sum": "$ticket_count"}}}],
            "page": [{"$skip": offset}, {"$limit": limit},
                     {"$project": {"_id": 1, "ticket_count": 1, "user_name": 1, "user_email": 1}}],
        }},
    ]
    agg = await tickets.aggregate(members_pipeline, collation={"locale": "en", "strength": 2}).to_list(length=1)
    facet = agg[0] if agg else {"meta": [], "page": []}
    meta = facet["meta"][0] if facet.get("meta") else {}
    total_members = meta.get("total_members", 0)
    total_tickets = meta.get("total_tickets", 0)
    page_members = facet.get("page", [])

    # --- Overdue count over the current (non-due) filter scope. ---
    overdue_res = await tickets.aggregate(
        [{"$match": members_match}, *_due_stages("overdue"), {"$count": "n"}]
    ).to_list(length=1)
    overdue_tickets = overdue_res[0]["n"] if overdue_res else 0

    # --- Member rows (tickets load lazily on expand). ---
    items = [
        TeamMemberView(
            user_id=m["_id"],
            user_name=m.get("user_name", "Unknown"),
            user_email=m.get("user_email", "") or "",
            ticket_count=m.get("ticket_count", 0),
        )
        for m in page_members
    ]

    # --- Filter dropdown options over the accessible scope (independent of selective filters). ---
    scope_clauses: List[dict] = [{"project_id": {"$in": accessible}}, _any_assignee_clause()]
    inactive_clause = await _inactive_exclusion(db)
    if inactive_clause:
        scope_clauses.append(inactive_clause)
    scope_match = {"$and": scope_clauses}
    priorities = sorted([p for p in await tickets.distinct("priority", scope_match) if p])
    scope_status_ids = await tickets.distinct("status_id", scope_match)
    statuses = sorted(
        [StatusOption(id=sid, name=status_map.get(sid, f"Status {sid}")) for sid in scope_status_ids if sid],
        key=lambda s: s.name.lower(),
    )
    # Member options: distinct assignees in scope, resolved to users in bulk (no N+1).
    scope_emails = [e for e in await tickets.distinct("assignee_email", scope_match) if e]
    scope_ids = [i for i in await tickets.distinct("assignee_id", scope_match) if i is not None]
    member_ids = set(scope_ids)
    if scope_emails:
        by_email = await users.find(
            {"email": {"$in": scope_emails}}, {"user_number": 1}
        ).to_list(length=None)
        member_ids.update(u["user_number"] for u in by_email if u.get("user_number"))
    members = []
    if member_ids:
        member_users = await users.find(
            {"user_number": {"$in": list(member_ids)}}, {"user_number": 1, "name": 1}
        ).to_list(length=None)
        members = sorted(
            [MemberOption(id=u["user_number"], name=u.get("name", "Unknown")) for u in member_users],
            key=lambda m: m.name.lower(),
        )

    return TeamViewResponse(
        items=items,
        total=total_members,
        limit=limit,
        offset=offset,
        has_more=offset + limit < total_members,
        summary=TeamViewSummary(
            total_members=total_members,
            total_tickets=total_tickets,
            overdue_tickets=overdue_tickets,
        ),
        filter_options=TeamViewFilterOptions(priorities=priorities, statuses=statuses, members=members),
    )


@router.get("/team-view/members/{member_id}/tickets", response_model=MemberTicketsResponse)
async def get_member_tickets(
    member_id: int,
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
    limit: int = Query(TICKETS_PAGE_DEFAULT, ge=1, le=100),
    offset: int = Query(0, ge=0),
    search: Optional[str] = Query(None),
    project_id: Optional[int] = Query(None),
    priority: Optional[str] = Query(None),
    status_id: Optional[int] = Query(None),
    due: Optional[str] = Query(None),
    sort: str = Query("due", description="ticket|title|project|priority|status|due"),
    order: str = Query("asc", description="asc|desc"),
):
    """One member's assigned tickets, sorted + paginated — backs expand and 'Load more'."""
    empty = MemberTicketsResponse(items=[], total=0, limit=limit, offset=offset, has_more=False)

    accessible = await _accessible_project_ids(db, current_user)
    if not accessible:
        return empty
    if project_id is not None and project_id not in accessible:
        return empty

    project_map = await _project_map(db, accessible)
    status_map = await _status_map(db)

    u = await db["users"].find_one({"user_number": member_id}, {"email": 1})
    member_email = u.get("email") if u else None

    sort = sort if sort in _SORT_FIELDS else "due"
    order = "desc" if order == "desc" else "asc"

    common_clauses = await _common_clauses(db, accessible, project_id, priority, status_id, search)
    items, total = await _member_tickets_page(
        db, common_clauses, member_email, member_id, due, project_map, status_map, limit, offset,
        sort=sort, order=order,
    )
    return MemberTicketsResponse(
        items=items, total=total, limit=limit, offset=offset, has_more=offset + limit < total,
    )


# ========== User Management ==========

class UserUpdateRequest(BaseModel):
    """Request to update user details."""
    is_active: Optional[bool] = None


class UserOut(BaseModel):
    """User information output. Email is the unique identifier."""
    email: str  # Primary unique identifier
    name: str
    user_id: int  # Legacy field, may have duplicates
    role: str
    designation: Optional[str]
    department: Optional[str]
    is_active: bool
    created_at: datetime


@router.get("/users", response_model=List[UserOut])
async def list_all_users(
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
    current_user: Annotated[CurrentUser, Depends(require_admin)],
):
    """Get all users with their details (admin only)."""
    users_collection = db["users"]

    # Get all users
    all_users = await users_collection.find({}).to_list(length=None)

    result: List[UserOut] = []
    for user in all_users:
        result.append(
            UserOut(
                email=user.get("email", ""),  # Primary identifier
                name=user.get("name", "Unknown"),
                user_id=user.get("user_number"),  # Legacy field
                role=user.get("role", "user"),
                designation=user.get("designation"),
                department=user.get("department"),
                is_active=user.get("is_active", True),  # Default to True for existing users
                created_at=user.get("created_at", datetime.now(timezone.utc)),
            )
        )

    # Sort by name
    result.sort(key=lambda u: u.name.lower())

    return result


class CreateUserRequest(BaseModel):
    """Admin-provisioned user. The admin sets a temporary password the user must change."""
    name: str = Field(..., min_length=1, max_length=120)
    email: str = Field(..., min_length=3, max_length=254)
    password: str = Field(..., min_length=8, max_length=200)
    role: str = Field("user", pattern="^(user|admin)$")
    department: Optional[str] = None
    designation: Optional[str] = None


@router.post("/users", response_model=UserOut, status_code=status.HTTP_201_CREATED)
async def create_user(
    payload: CreateUserRequest,
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
    current_user: Annotated[CurrentUser, Depends(require_admin)],
):
    """Create a user with a temporary password (admin only).

    Mirrors what Google OAuth creates (counter-assigned user_number, role, timestamps) but
    adds a bcrypt password_hash and must_change_password=True, so the user is forced to set
    their own password on first login. No Google tokens.
    """
    users_collection = db["users"]
    email = payload.email.strip().lower()

    if await users_collection.find_one({"email": email}):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="A user with this email already exists")

    counter = await db["counters"].find_one_and_update(
        {"_id": "users"},
        {"$inc": {"seq": 1}},
        upsert=True,
        return_document=ReturnDocument.AFTER,
    )
    user_number = int(counter.get("seq", 1))

    now = datetime.now(timezone.utc)
    doc = {
        "email": email,
        "name": payload.name.strip(),
        "role": payload.role,
        "department": payload.department,
        "designation": payload.designation,
        "user_number": user_number,
        "is_active": True,
        "created_at": now,
        "last_login_at": None,
        "password_hash": hash_password(payload.password),
        "must_change_password": True,
    }
    try:
        await users_collection.insert_one(doc)
    except Exception:
        # Unique index race (two admins, same email at once).
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="A user with this email already exists")

    return UserOut(
        email=email,
        name=doc["name"],
        user_id=user_number,
        role=doc["role"],
        designation=doc["designation"],
        department=doc["department"],
        is_active=True,
        created_at=now,
    )


@router.put("/users/{email}")
async def update_user(
    email: str,
    update_data: UserUpdateRequest,
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
    current_user: Annotated[CurrentUser, Depends(require_admin)],
):
    """Update user details - active status (admin only). Uses email as identifier."""
    users_collection = db["users"]

    # Build update dict
    update_dict = {}
    if update_data.is_active is not None:
        update_dict["is_active"] = update_data.is_active

    if not update_dict:
        return {"success": True, "message": "No changes to apply"}

    # Update user by email (unique identifier)
    result = await users_collection.update_one(
        {"email": email},
        {"$set": update_dict}
    )

    if result.matched_count == 0:
        return {"success": False, "message": "User not found"}

    # If active status changed, drop this user's cached role so the change is instant
    # rather than lagging up to role_cache_ttl_seconds (see core.security._live_role).
    if "is_active" in update_dict:
        target = await users_collection.find_one({"email": email}, {"user_number": 1})
        if target and target.get("user_number") is not None:
            invalidate_role_cache(int(target["user_number"]))

    return {"success": True, "message": "User updated successfully", "updated_fields": list(update_dict.keys())}
