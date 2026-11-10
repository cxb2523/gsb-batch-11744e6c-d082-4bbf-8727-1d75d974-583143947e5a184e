"""Settings API endpoints for project configuration and management."""

from typing import Annotated, List, Optional
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo import ReturnDocument

from ...db.mongo import get_mongo_db
from ...core.security import get_current_user, CurrentUser, require_admin, require_project_admin
from ...services.status_category import categorize_status
from ...schemas.settings import (
  ProjectSettingsUpdate,
  ProjectSettingsOut,
  ProjectArchiveRequest,
  WorkflowStatusCreate,
  WorkflowStatusUpdate,
  WorkflowStatusOut,
  WorkflowStatusReorderRequest,
  LabelCreate,
  LabelUpdate,
  LabelOut,
  ProjectMemberAdd,
  ProjectMemberBulkAdd,
  ProjectMemberInvite,
  ProjectMemberUpdate,
  ProjectMemberOut,
  AssignableUser,
  NotificationPreferencesUpdate,
  NotificationPreferencesOut,
  NotificationOut,
)


from ._shared import *  # noqa: F401,F403

async def _require_project_member(
    db: AsyncIOMotorDatabase, project_id: int, current_user: CurrentUser
) -> None:
    """Allow global admins and active members of the project; 403 otherwise.

    Keeps the member picker and @mention list from being a whole-org directory that
    any logged-in user can read (SEC-07).
    """
    if current_user.role == "admin":
        return
    or_clauses: list = [{"user_email": current_user.email}]
    if current_user.id is not None:
        or_clauses.append({"user_id": current_user.id})
    member = await db["project_members"].find_one({
        "project_id": project_id,
        "$or": or_clauses,
        "$and": [{"$or": [{"active": True}, {"active": {"$exists": False}}]}],
    })
    if not member:
        raise HTTPException(status_code=403, detail="You don't have access to this project")


async def _list_assignable_users(
    db: AsyncIOMotorDatabase, project_id: Optional[int]
) -> list[dict]:
    """Active users who can be added to a project.

    Global admins are always excluded: they already have access to every
    project, so adding them as explicit members is redundant and confusing.
    When `project_id` is given, users already on that project (by id or email,
    including pending invites) are also excluded.
    """
    exclude_ids: set = set()
    exclude_emails: set = set()
    if project_id is not None:
        existing = await db["project_members"].find(
            {"project_id": project_id}
        ).to_list(length=None)
        for m in existing:
            if m.get("user_id"):
                exclude_ids.add(m["user_id"])
            email = m.get("email") or m.get("user_email")
            if email:
                exclude_emails.add(email)

    # role != "admin" drops global admins; is_active handles deactivated users.
    users = await db["users"].find(
        {"is_active": {"$ne": False}, "role": {"$ne": "admin"}},
        {"user_number": 1, "name": 1, "email": 1, "designation": 1},
    ).to_list(length=None)

    available = []
    for u in users:
        # Use `get(...) or default` rather than `get(key, default)`: a key that
        # exists but holds null (common for imported/partially-seeded docs)
        # returns None from the two-arg form, which then crashes the sort or
        # fails response validation. Records with no user_number are unusable
        # for the picker, so skip them instead of 500-ing the whole list.
        email = u.get("email") or ""
        user_number = u.get("user_number")
        if not email or user_number is None:
            continue
        if email in exclude_emails or user_number in exclude_ids:
            continue
        available.append({
            "user_id": user_number,
            "name": u.get("name") or "",
            "email": email,
            "designation": u.get("designation") or "",
        })

    available.sort(key=lambda x: x["name"].lower())
    return available


@router.get("/assignable-users", response_model=List[AssignableUser])
async def list_assignable_users(
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
    project_id: Optional[int] = Query(
        None, description="Exclude users already on this project"
    ),
):
    """Users that can be added to a project, for the member picker.

    Used both when creating a project (no `project_id`) and from an existing
    project's members screen (`project_id` set). Global admins are excluded.
    When a project is given, only its members (or a global admin) may list users.
    """
    if project_id is not None:
        await _require_project_member(db, project_id, current_user)
    return await _list_assignable_users(db, project_id)


@router.get("/{project_id}/members/available")
async def get_available_users(
    project_id: int,
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    """Return active, non-global-admin users not already in this project."""
    await _require_project_member(db, project_id, current_user)
    return await _list_assignable_users(db, project_id)


# ========== Project Members Endpoints ==========

@router.get("/{project_id}/members", response_model=List[ProjectMemberOut])
async def get_project_members(
    project_id: int,
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    """Get all members of a project, including pending invitations."""
    from datetime import datetime, timezone
    members_collection = db["project_members"]
    projects_collection = db["projects"]
    users_collection = db["users"]
    tickets_collection = db["tickets"]

    project = await projects_collection.find_one({"project_number": project_id})
    owner_email = project.get("owner") if project else None

    # Return all members (both active and inactive/pending)
    members = await members_collection.find({
        "project_id": project_id
    }).to_list(length=None)

    # Ensure the project owner is included even if not in project_members
    member_emails = {m.get("user_email") for m in members if m.get("user_email")}
    if owner_email and owner_email not in member_emails:
        members.append({
            "user_email": owner_email,
            "role": "admin",
            "active": True,
            "joined_at": project.get("created_at"),
        })

    # Aggregate assignee_email → ticket count for this project (open + done)
    assignee_counts: dict[str, int] = {}
    pipeline = [
        {"$match": {"project_id": project_id, "assignee_email": {"$ne": None}}},
        {"$group": {"_id": "$assignee_email", "n": {"$sum": 1}}},
    ]
    async for row in tickets_collection.aggregate(pipeline):
        if row.get("_id"):
            assignee_counts[row["_id"]] = int(row["n"])

    # Most-recent updated_at per assignee for "last active"
    last_active_map: dict[str, datetime] = {}
    async for t in tickets_collection.find(
        {"project_id": project_id, "assignee_email": {"$ne": None}},
        {"assignee_email": 1, "updated_at": 1, "created_at": 1},
    ):
        ae = t.get("assignee_email")
        ts = t.get("updated_at") or t.get("created_at")
        if not ae or not isinstance(ts, datetime):
            continue
        prev = last_active_map.get(ae)
        if prev is None or ts > prev:
            last_active_map[ae] = ts

    def _user_to_initials(name: str) -> str:
        parts = [p[0].upper() for p in (name or "").split() if p]
        return "".join(parts[:2]) or (name[:2].upper() if name else "??")

    result = []
    for member in members:
        # Resolve identity. Prefer user_email; fall back to legacy `email`;
        # fall back to user_id → users lookup. Only the truly-unknown case
        # ends up as Pending.
        user_email = member.get("user_email") or member.get("email")
        user_id = member.get("user_id")
        user_doc = None
        if user_email:
            user_doc = await users_collection.find_one({"email": user_email})
        elif user_id:
            user_doc = await users_collection.find_one({"user_number": user_id})
            if user_doc:
                user_email = user_doc.get("email")

        active = bool(member.get("active", True))

        if user_doc is None and not user_email:
            # Truly pending — invite created but no user identity at all
            result.append({
                "user_id": 0,
                "email": "pending@unknown",
                "name": "Pending invite",
                "role": member.get("role"),
                "joined_at": member.get("invited_at") or member.get("joined_at") or datetime.now(timezone.utc),
                "active": False,
            })
            continue

        resolved_id = (user_doc.get("user_number") if user_doc else None) or user_id or 0
        resolved_name = (user_doc.get("name") if user_doc else None) or (user_email.split("@")[0] if user_email else "Unknown")
        resolved_email = user_email or "unknown@unknown"
        is_global_admin = (user_doc.get("role") if user_doc else None) == "admin"

        result.append({
            "user_id": int(resolved_id),
            "email": resolved_email,
            "name": resolved_name,
            "role": member.get("role"),
            "joined_at": member.get("joined_at") or member.get("invited_at") or datetime.now(timezone.utc),
            "active": active,
            "assigned_issues": assignee_counts.get(resolved_email, 0),
            "last_active": last_active_map.get(resolved_email).isoformat() if last_active_map.get(resolved_email) else None,
            "initials": _user_to_initials(resolved_name),
            "is_global_admin": is_global_admin,
            "implicit": False,
        })

    # Inject global admins as implicit members. They already have access to every
    # project through the access-check layer, so listing them here keeps the
    # members screen consistent with reality without materializing project_members
    # rows (which would have to be backfilled/synced on promotion & demotion).
    # Computed live from role == "admin", so it stays correct automatically.
    present_emails = {r["email"] for r in result if r.get("email")}
    global_admins = await users_collection.find(
        {"role": "admin", "is_active": {"$ne": False}},
        {"user_number": 1, "name": 1, "email": 1, "created_at": 1},
    ).to_list(length=None)
    for ga in global_admins:
        email = ga.get("email")
        if not email or email in present_emails:
            continue
        name = ga.get("name") or email.split("@")[0]
        joined_at = ga.get("created_at") or (project.get("created_at") if project else None) or datetime.now(timezone.utc)
        result.append({
            "user_id": int(ga.get("user_number") or 0),
            "email": email,
            "name": name,
            "role": "admin",
            "joined_at": joined_at,
            "active": True,
            "assigned_issues": assignee_counts.get(email, 0),
            "last_active": last_active_map.get(email).isoformat() if last_active_map.get(email) else None,
            "initials": _user_to_initials(name),
            "is_global_admin": True,
            "implicit": True,
        })

    return result


@router.post("/{project_id}/members", response_model=ProjectMemberOut, status_code=status.HTTP_201_CREATED)
async def add_project_member(
    project_id: int,
    member_in: ProjectMemberAdd,
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
    current_user: Annotated[CurrentUser, Depends(require_project_admin)],
):
    """Add a member to a project (project admin or global admin only)."""
    members_collection = db["project_members"]

    # Check if member already exists
    existing = await members_collection.find_one({
        "project_id": project_id,
        "user_id": member_in.user_id
    })
    if existing:
        raise HTTPException(status_code=400, detail="User is already a member of this project")

    # Verify user exists
    user_info = await get_user_info(db, member_in.user_id)
    if user_info.get("email") == "unknown@example.com":
        raise HTTPException(status_code=404, detail="User not found")

    # Add member
    member_doc = {
        "project_id": project_id,
        "user_id": member_in.user_id,
        "role": member_in.role,
        "active": True,
        "joined_at": datetime.now(timezone.utc),
    }

    await members_collection.insert_one(member_doc)

    return {
        "user_id": member_in.user_id,
        "email": user_info.get("email"),
        "name": user_info.get("name"),
        "role": member_in.role,
        "joined_at": member_doc["joined_at"],
        "active": True,
    }


@router.post("/{project_id}/members/bulk", response_model=List[ProjectMemberOut], status_code=status.HTTP_201_CREATED)
async def add_project_members_bulk(
    project_id: int,
    payload: ProjectMemberBulkAdd,
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
    current_user: Annotated[CurrentUser, Depends(require_project_admin)],
):
    """Add several members at once, each with a project role (project admin or
    global admin only).

    The role here is a *project* role (admin/member/viewer); it never changes a
    user's global role. Global admins, users already on the project, and
    duplicate or unknown ids are skipped silently, so the picker can send a
    whole selection without pre-filtering.
    """
    members_collection = db["project_members"]
    users_collection = db["users"]

    global_admin_docs = await users_collection.find(
        {"role": "admin"}, {"user_number": 1}
    ).to_list(length=None)
    global_admin_ids = {u.get("user_number") for u in global_admin_docs}

    existing = await members_collection.find(
        {"project_id": project_id}, {"user_id": 1}
    ).to_list(length=None)
    existing_ids = {m.get("user_id") for m in existing if m.get("user_id")}

    added = []
    seen: set = set()
    now = datetime.now(timezone.utc)
    for item in payload.members:
        user_id = item.user_id
        if user_id in seen or user_id in existing_ids or user_id in global_admin_ids:
            continue
        seen.add(user_id)

        user_info = await get_user_info(db, user_id)
        if user_info.get("email") == "unknown@example.com":
            continue  # unknown user id

        member_doc = {
            "project_id": project_id,
            "user_id": user_id,
            "user_email": user_info.get("email"),
            "role": item.role,
            "active": True,
            "joined_at": now,
        }
        await members_collection.insert_one(member_doc)
        added.append({
            "user_id": user_id,
            "email": user_info.get("email"),
            "name": user_info.get("name"),
            "role": item.role,
            "joined_at": now,
            "active": True,
        })

    return added


@router.post("/{project_id}/members/invite", response_model=ProjectMemberOut, status_code=status.HTTP_201_CREATED)
async def invite_project_member(
    project_id: int,
    invite_in: ProjectMemberInvite,
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
    current_user: Annotated[CurrentUser, Depends(require_project_admin)],
):
    """Invite a member to a project by email (project admin or global admin only). Member will be created in inactive state."""
    members_collection = db["project_members"]
    users_collection = db["users"]

    # Check if member with this email already exists for this project
    existing = await members_collection.find_one({
        "project_id": project_id,
        "email": invite_in.email
    })
    if existing:
        # If they exist but are inactive, reactivate them
        if existing.get("active") == False:
            updated_member = await members_collection.find_one_and_update(
                {"project_id": project_id, "email": invite_in.email},
                {"$set": {"active": True, "role": invite_in.role, "reactivated_at": datetime.now(timezone.utc)}},
                return_document=ReturnDocument.AFTER,
            )
            # Get user info if they have signed in before
            user_id = updated_member.get("user_id")
            if user_id:
                user_info = await get_user_info(db, user_id)
                # Project membership never changes a user's global role (SEC-04).
            else:
                user_info = {"name": "Pending", "email": invite_in.email}

            return {
                "user_id": user_id or 0,
                "email": invite_in.email,
                "name": user_info.get("name"),
                "role": invite_in.role,
                "joined_at": updated_member.get("joined_at"),
                "active": True,
            }
        else:
            raise HTTPException(status_code=400, detail="User is already a member of this project")

    # Project membership never changes a user's global role (SEC-04): no users.role write here.

    # Add member in inactive state (will be activated when they sign in)
    member_doc = {
        "project_id": project_id,
        "email": invite_in.email,
        "user_id": None,  # Will be set when user signs in
        "role": invite_in.role,
        "active": False,
        "invited_at": datetime.now(timezone.utc),
        "joined_at": None,  # Will be set when user signs in
    }

    await members_collection.insert_one(member_doc)

    return {
        "user_id": 0,  # Placeholder since user hasn't signed in yet
        "email": invite_in.email,
        "name": "Pending",
        "role": invite_in.role,
        "joined_at": member_doc["invited_at"],
        "active": False,
    }


@router.put("/{project_id}/members/{user_id}", response_model=ProjectMemberOut)
async def update_project_member(
    project_id: int,
    user_id: int,
    member_update: ProjectMemberUpdate,
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
    current_user: Annotated[CurrentUser, Depends(require_project_admin)],
):
    """Update a member's role (project admin or global admin only)."""
    members_collection = db["project_members"]

    # Fetch target's current role before modifying anything.
    target_member = await members_collection.find_one({"project_id": project_id, "user_id": user_id})
    if not target_member:
        raise HTTPException(status_code=404, detail="Member not found")

    # Turf-war protection: only a global admin can change another project admin's role.
    # A project admin may only self-demote (change their own role).
    if target_member.get("role") == "admin" and current_user.role != "admin":
        if current_user.id != user_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only a global admin can change another project admin's role",
            )

    updated_member = await members_collection.find_one_and_update(
        {"project_id": project_id, "user_id": user_id},
        {"$set": {"role": member_update.role, "updated_at": datetime.now(timezone.utc)}},
        return_document=ReturnDocument.AFTER,
    )

    user_info = await get_user_info(db, user_id)

    return {
        "user_id": user_id,
        "email": user_info.get("email"),
        "name": user_info.get("name"),
        "role": updated_member.get("role"),
        "joined_at": updated_member.get("joined_at"),
        "active": updated_member.get("active", True),
    }


@router.delete("/{project_id}/members/by-email/{email}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_pending_member_by_email(
    project_id: int,
    email: str,
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
    current_user: Annotated[CurrentUser, Depends(require_project_admin)],
):
    """Remove a member matched by email (project admin or global admin only).

    Tries the strict pending shape first (invite-only row, no user_id, inactive).
    Falls back to email/user_email on real members so the endpoint stays useful
    when the frontend mis-routes a real member here (e.g. stale user_id=0 state).
    """
    project = await db["projects"].find_one({"project_number": project_id})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Block owner removal regardless of which endpoint was called.
    owner_email = project.get("owner_email") or project.get("owner")
    if owner_email and owner_email == email:
        raise HTTPException(status_code=400, detail="Cannot remove project owner")

    members_collection = db["project_members"]

    # Try the strict pending shape first.
    result = await members_collection.delete_one(
        {"project_id": project_id, "email": email, "user_id": None, "active": False}
    )
    if result.deleted_count:
        return

    # Fall back: any row in this project matching by email or user_email.
    result = await members_collection.delete_one(
        {
            "project_id": project_id,
            "$or": [{"email": email}, {"user_email": email}],
        }
    )
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Member not found")


@router.delete("/{project_id}/members/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_project_member(
    project_id: int,
    user_id: int,
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
    current_user: Annotated[CurrentUser, Depends(require_project_admin)],
):
    """Remove a member from a project (project admin or global admin only). Hard-delete the row so the
    member fully disappears from the listing. (Previous behavior was soft-delete
    via active=False, which surprised users into thinking deletion didn't work.)
    """
    project = await db["projects"].find_one({"project_number": project_id})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Prevent removing project owner — check both legacy owner_id and owner_email
    users_collection = db["users"]
    owner_email = project.get("owner_email") or project.get("owner")
    owner_id = project.get("owner_id")
    if owner_id == user_id:
        raise HTTPException(status_code=400, detail="Cannot remove project owner")
    if owner_email:
        target_user = await users_collection.find_one({"user_number": user_id})
        if target_user and target_user.get("email") == owner_email:
            raise HTTPException(status_code=400, detail="Cannot remove project owner")

    members_collection = db["project_members"]

    # Locate the member by user_id OR by their email (back-compat for migrated rows)
    target_user = await users_collection.find_one({"user_number": user_id})
    target_email = target_user.get("email") if target_user else None

    # Global admins are listed on every project via implicit access; removing them
    # here is meaningless (there may be no project_members row, and they'd keep
    # access anyway). Reject with a clear message instead of a confusing 404.
    if target_user and target_user.get("role") == "admin":
        raise HTTPException(
            status_code=400,
            detail="Global admins have access to every project and can't be removed here. "
                   "Change their role in User Management to remove that access.",
        )
    query: dict = {"project_id": project_id}
    if target_email:
        query["$or"] = [{"user_id": user_id}, {"user_email": target_email}]
    else:
        query["user_id"] = user_id

    result = await members_collection.delete_one(query)
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Member not found")


# ========== Notifications Endpoints ==========

