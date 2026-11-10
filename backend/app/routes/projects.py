from typing import Annotated, List, Optional
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo import ReturnDocument

from ..db.mongo import get_mongo_db
from ..schemas.projects import ProjectCreate, ProjectOut, TicketCreate, TicketOut
from ..core.security import get_current_user, CurrentUser, require_admin


router = APIRouter(prefix="/projects", tags=["projects"])

# Overdue is measured against the local (IST) calendar day, mirroring the status report.
IST = ZoneInfo("Asia/Kolkata")


# The workflow in the order work actually moves. "In Review" is code complete but
# not yet verified or deployed. "Blocked" sits last: it is an exception, not a stage.
DEFAULT_STATUSES = [
  {"name": "Backlog",       "color": "#94a3b8"},
  {"name": "Ready to Pick", "color": "#3b82f6"},
  {"name": "In Progress",   "color": "#f59e0b"},
  {"name": "In Review",     "color": "#14b8a6"},
  {"name": "Testing",       "color": "#8b5cf6"},
  {"name": "Done",          "color": "#10b981"},
  {"name": "Blocked",       "color": "#ef4444"},
]


async def seed_default_statuses(db: AsyncIOMotorDatabase, project_id: int) -> None:
  """Insert the mandated workflow statuses for a project:
  Backlog → Ready to Pick → In Progress → In Review → Testing → Done → Blocked.

  Idempotent — skips any status whose name already exists for the project.
  """
  statuses_collection = db["ticket_statuses"]
  counters_collection = db["counters"]
  now = datetime.now(timezone.utc)

  for position, status_def in enumerate(DEFAULT_STATUSES):
    existing = await statuses_collection.find_one({
      "project_id": project_id,
      "name": status_def["name"],
    })
    if existing:
      continue

    counter = await counters_collection.find_one_and_update(
      {"_id": "ticket_statuses"},
      {"$inc": {"seq": 1}},
      upsert=True,
      return_document=ReturnDocument.AFTER,
    )
    status_number = int(counter.get("seq", 1))

    await statuses_collection.insert_one({
      "status_number": status_number,
      "project_id": project_id,
      "name": status_def["name"],
      "color": status_def["color"],
      "position": position,
      "created_at": now,
    })


async def get_next_project_number(db: AsyncIOMotorDatabase) -> int:
    """Get next project number, ensuring counter is synced with actual max in DB."""
    counters = db["counters"]
    projects = db["projects"]

    # Find the current max project_number in the DB
    pipeline = [{"$group": {"_id": None, "max_num": {"$max": "$project_number"}}}]
    result = await projects.aggregate(pipeline).to_list(1)
    max_existing = result[0]["max_num"] if result and result[0].get("max_num") else 0

    # Ensure counter is at least as high as max existing, then increment
    counter = await counters.find_one_and_update(
        {"_id": "projects"},
        [{"$set": {"seq": {"$max": [{"$add": [{"$ifNull": ["$seq", 0]}, 1]}, max_existing + 1]}}}],
        upsert=True,
        return_document=ReturnDocument.AFTER,
    )
    return int(counter["seq"])


async def verify_project_access(
  project_id: int,
  user_id: int,
  db: AsyncIOMotorDatabase,
  user_role: str = "user",
  user_email: Optional[str] = None,
) -> bool:
  """Verify that the user has access to the project (is an active member or admin).

  Membership is matched by `user_email` (primary) or legacy `user_id` (back-compat).
  The `$or` is kept permanently — `project_members` rows may be inserted by either
  shape, and matching both keeps access checks robust against partial migrations.
  """
  # Admins have access to all projects
  if user_role == "admin":
    return True

  members_collection = db["project_members"]

  or_clauses: list = []
  if user_email is not None:
    or_clauses.append({"user_email": user_email})
  or_clauses.append({"user_id": user_id})

  member = await members_collection.find_one({
    "project_id": project_id,
    "$or": or_clauses,
    "$and": [
      {"$or": [{"active": True}, {"active": {"$exists": False}}]},
    ],
  })

  return member is not None


@router.get("", response_model=List[ProjectOut])
async def list_projects(
  db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
  current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
  projects_collection = db["projects"]
  users_collection = db["users"]
  members_collection = db["project_members"]

  # The requesting user's role per project, keyed by project_id. A global admin is an
  # admin everywhere (same rule as require_project_admin), so that branch needs no
  # lookup; for everyone else the membership rows fetched below already carry it.
  role_by_pid: dict = {}

  # Admins see all projects
  if current_user.role == "admin":
    projects = await projects_collection.find().to_list(length=None)
  else:
    # Members are stored by numeric user_id (== users.user_number); fall back to email for legacy rows.
    user_memberships = await members_collection.find({
      "$and": [
        {"$or": [{"user_id": current_user.id}, {"user_email": current_user.email}]},
        {"$or": [{"active": True}, {"active": {"$exists": False}}]},
      ]
    }).to_list(length=None)

    accessible_project_ids = [m.get("project_id") for m in user_memberships if m.get("project_id") is not None]

    # "admin" on any row wins, so duplicate membership rows can't downgrade access.
    for m in user_memberships:
      pid = m.get("project_id")
      if pid is None:
        continue
      role = m.get("role") or "member"
      if role_by_pid.get(pid) != "admin":
        role_by_pid[pid] = role

    if not accessible_project_ids:
      return []

    # Project rows use `project_number` (legacy) or `project_id`; match either.
    projects = await projects_collection.find({
      "$or": [
        {"project_id": {"$in": accessible_project_ids}},
        {"project_number": {"$in": accessible_project_ids}},
      ]
    }).to_list(length=None)

  # ---- Per-project ticket metrics (total + overdue) --------------------------
  # Batched across all projects (a handful of queries total) rather than one query
  # per project, so this scales with the number of projects, not tickets.
  tickets_collection = db["tickets"]
  statuses_collection = db["ticket_statuses"]

  project_ids = [
    (p.get("project_id") or p.get("project_number"))
    for p in projects
  ]
  project_ids = [pid for pid in project_ids if pid is not None]

  total_by_pid: dict = {}
  overdue_by_pid: dict = {}
  epic_total_by_pid: dict = {}
  epic_overdue_by_pid: dict = {}
  last_activity_by_pid: dict = {}

  if project_ids:
    # Latest ticket touch per project, so the UI can sort by recent activity and let
    # dormant projects fall to the bottom. Legacy rows may carry no updated_at, so the
    # ticket's created_at stands in for it.
    async for row in tickets_collection.aggregate([
      {"$match": {"project_id": {"$in": project_ids}}},
      {"$group": {
        "_id": "$project_id",
        "last": {"$max": {"$ifNull": ["$updated_at", "$created_at"]}},
      }},
    ]):
      if row.get("last") is not None:
        last_activity_by_pid[row["_id"]] = row["last"]

    # Total tickets per project
    async for row in tickets_collection.aggregate([
      {"$match": {"project_id": {"$in": project_ids}}},
      {"$group": {"_id": "$project_id", "count": {"$sum": 1}}},
    ]):
      total_by_pid[row["_id"]] = row["count"]

    # Total epics per project (epics live in the tickets collection as type="epic").
    async for row in tickets_collection.aggregate([
      {"$match": {"project_id": {"$in": project_ids}, "type": "epic"}},
      {"$group": {"_id": "$project_id", "count": {"$sum": 1}}},
    ]):
      epic_total_by_pid[row["_id"]] = row["count"]

    # "Done" statuses are matched by name per project (same rule as the status report),
    # since each project can have its own workflow.
    done_ids_by_pid: dict = {}
    done_names_by_pid: dict = {}
    async for st in statuses_collection.find({"project_id": {"$in": project_ids}}):
      name = st.get("name") or ""
      lname = name.lower()
      if "done" in lname or "completed" in lname or "closed" in lname:
        pid = st.get("project_id")
        if st.get("status_number") is not None:
          done_ids_by_pid.setdefault(pid, set()).add(st.get("status_number"))
        done_names_by_pid.setdefault(pid, set()).add(name)

    # Overdue = due before today (IST) and not in a done status.
    now_ist = datetime.now(IST)
    today_start = now_ist.replace(hour=0, minute=0, second=0, microsecond=0)
    async for tk in tickets_collection.find(
      {
        "project_id": {"$in": project_ids},
        "due_date": {"$exists": True, "$ne": None, "$lt": today_start},
      },
      {"project_id": 1, "status_id": 1, "status": 1, "type": 1},
    ):
      pid = tk.get("project_id")
      if tk.get("status_id") in done_ids_by_pid.get(pid, set()):
        continue
      if tk.get("status") in done_names_by_pid.get(pid, set()):
        continue
      overdue_by_pid[pid] = overdue_by_pid.get(pid, 0) + 1
      if tk.get("type") == "epic":
        epic_overdue_by_pid[pid] = epic_overdue_by_pid.get(pid, 0) + 1

  result = []
  for project in projects:
    project_id = project.get("project_id") or project.get("project_number")

    # Owner can be stored as numeric `owner_id` (== users.user_number) or as `owner` email string.
    owner_id = project.get("owner_id")
    owner_email = project.get("owner")
    owner = None
    if owner_id is not None:
      owner = await users_collection.find_one({"user_number": owner_id})
    if owner is None and owner_email:
      owner = await users_collection.find_one({"email": owner_email})

    owner_info = {
      "id": (owner.get("user_number") if owner else None) or owner_id or 0,
      "name": owner.get("name") if owner else "Unknown",
      "email": (owner.get("email") if owner else owner_email) or "unknown@example.com",
    }

    member_count = await members_collection.count_documents({
      "project_id": project_id,
      "$or": [
        {"active": True},
        {"active": {"$exists": False}}
      ]
    })

    result.append({
      "id": project_id,
      "key": project.get("key"),
      "name": project.get("name"),
      "description": project.get("description", ""),
      "visibility": project.get("visibility", "private"),
      "status": project.get("status", "active"),
      "created_at": project.get("created_at"),
      "deadline": project.get("deadline"),
      "owner": owner_info,
      "member_count": member_count,
      "ticket_count": total_by_pid.get(project_id, 0),
      "overdue_count": overdue_by_pid.get(project_id, 0),
      "epic_count": epic_total_by_pid.get(project_id, 0),
      "epic_overdue_count": epic_overdue_by_pid.get(project_id, 0),
      # Falls back to the project's own timestamps when it has no tickets yet.
      "last_activity_at": (
        last_activity_by_pid.get(project_id)
        or project.get("updated_at")
        or project.get("created_at")
      ),
      "my_role": "admin" if current_user.role == "admin" else role_by_pid.get(project_id, "member"),
    })

  return result


@router.post("", response_model=ProjectOut, status_code=status.HTTP_201_CREATED)
async def create_project(
  project_in: ProjectCreate,
  db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
  current_user: Annotated[CurrentUser, Depends(require_admin)],
):
  projects_collection = db["projects"]
  counters_collection = db["counters"]

  # Check if key already exists
  existing = await projects_collection.find_one({"key": project_in.key})
  if existing:
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Project key already exists")

  # Generate a numeric project id (synced with actual max in DB)
  project_number = await get_next_project_number(db)

  # Create project document
  now = datetime.now(timezone.utc)
  project_doc = {
    "project_number": project_number,
    "key": project_in.key,
    "name": project_in.name,
    "description": project_in.description or "",
    "visibility": project_in.visibility,
    "status": "active",
    "owner_id": current_user.id,
    "created_at": now,
    "deadline": project_in.deadline,
  }

  await projects_collection.insert_one(project_doc)

  # Seed default workflow statuses so issues can be created right away
  await seed_default_statuses(db, project_number)

  # Record the owner as an admin member — unless they are a global admin, who
  # already has access to every project and is never added as an explicit member
  # row (same rule the additional-members loop below applies). Access for global
  # admins comes from their global role (see verify_project_access), not a row.
  members_collection = db["project_members"]
  users_collection = db["users"]
  member_count = 0
  if current_user.role != "admin":
    await members_collection.insert_one({
      "project_id": project_number,
      "user_id": current_user.id,
      "user_email": current_user.email,
      "role": "admin",
      "active": True,
      "joined_at": now,
    })
    member_count = 1

  # Add additional members if provided
  if project_in.members:
    # Global admins already have access to every project, so never add them as
    # explicit members (keeps the member list clean and avoids a dual identity).
    global_admin_docs = await users_collection.find(
      {"role": "admin"}, {"user_number": 1}
    ).to_list(length=None)
    global_admin_ids = {u.get("user_number") for u in global_admin_docs}

    seen = {current_user.id}
    for spec in project_in.members:
      # Each entry is a bare user id (-> "member") or a {user_id, role} object.
      if isinstance(spec, int):
        user_id, role = spec, "member"
      else:
        user_id, role = spec.user_id, spec.role

      if user_id in seen or user_id in global_admin_ids:
        continue
      seen.add(user_id)

      member_user = await users_collection.find_one({"user_number": user_id})
      if not member_user:
        continue

      member_doc = {
        "project_id": project_number,
        "user_id": user_id,
        "user_email": member_user.get("email"),
        "role": role,
        "active": True,
        "joined_at": now,
      }
      await members_collection.insert_one(member_doc)
      member_count += 1

  return {
    "id": project_number,
    "key": project_in.key,
    "name": project_in.name,
    "description": project_in.description or "",
    "visibility": project_in.visibility,
    "created_at": project_doc["created_at"],
    "owner": {
      "id": current_user.id,
      "name": current_user.name,
      "email": current_user.email,
    },
    "member_count": member_count,
  }


# TODO: Convert ticket endpoints to MongoDB
# @router.get("/{project_id}/tickets", response_model=List[TicketOut])
# async def list_tickets(...)

# @router.post("/{project_id}/tickets", response_model=TicketOut, status_code=status.HTTP_201_CREATED)
# async def create_ticket(...)

# @router.post("/tickets/{ticket_id}/move", response_model=TicketOut)
# async def move_ticket(...)


