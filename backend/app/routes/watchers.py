"""Watchers API endpoints."""

import logging
from typing import List, Optional
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from ..db.mongo import get_mongo_db
from ..core.security import get_current_user, CurrentUser
from ..schemas.watchers import WatcherAdd, WatcherOut

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/projects", tags=["watchers"])


async def verify_project_access(
    project_id: int,
    user_email: str,
    db: AsyncIOMotorDatabase,
    user_role: str = "user",
    user_id: Optional[int] = None,
) -> None:
    """Verify that the user has access to the project."""
    if user_role == "admin":
        return

    members_collection = db["project_members"]
    or_clauses = [{"user_email": user_email}]
    if user_id is not None:
        or_clauses.append({"user_id": user_id})
    member = await members_collection.find_one({
        "project_id": project_id,
        "$or": or_clauses,
        "$and": [{"$or": [{"active": True}, {"active": {"$exists": False}}]}],
    })

    if not member:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have access to this project"
        )


async def get_user_info(db: AsyncIOMotorDatabase, user_id: int) -> dict:
    """Get user information."""
    users_collection = db["users"]
    user = await users_collection.find_one({"user_number": user_id})
    if not user:
        return {
            "id": user_id,
            "name": "Unknown User",
            "email": "unknown@example.com",
            "initials": "UU"
        }
    return {
        "id": user_id,
        "name": user.get("name", "Unknown"),
        "email": user.get("email", "unknown@example.com"),
        "initials": "".join([n[0].upper() for n in user.get("name", "U U").split()[:2]])
    }


async def get_user_info_by_email(db: AsyncIOMotorDatabase, email: Optional[str]) -> Optional[dict]:
    """Get user information by email."""
    if not email:
        return None
    user = await db["users"].find_one({"email": email})
    if not user:
        local = email.split("@")[0] if "@" in email else email
        return {
            "id": None,
            "name": local,
            "email": email,
            "initials": (local[:2] or "U U").upper(),
        }
    name = user.get("name") or email.split("@")[0]
    return {
        "id": user.get("user_number"),
        "name": name,
        "email": email,
        "initials": "".join([n[0].upper() for n in (name or "U U").split()[:2]]),
    }


def _watcher_match(email: str, user_id: Optional[int]) -> dict:
    """Build an $or query matching either user_email or legacy user_id on a watcher doc."""
    clauses: list = [{"user_email": email}]
    if user_id is not None:
        clauses.append({"user_id": user_id})
    return {"$or": clauses}


async def ensure_watcher(
    db: AsyncIOMotorDatabase,
    project_id: int,
    issue_id: int,
    email: Optional[str],
    added_by_email: str,
) -> None:
    """Add `email` as a watcher on an issue if not already watching.

    Idempotent and safe to call freely — used to auto-subscribe the creator and
    each new assignee so the watcher list only grows. Does nothing when `email`
    is falsy.
    """
    if not email:
        return

    watchers_collection = db["issue_watchers"]

    # Resolve legacy user_id so we match either representation of the same person.
    user = await db["users"].find_one({"email": email})
    user_id = user.get("user_number") if user else None

    existing = await watchers_collection.find_one({
        "issue_id": issue_id,
        **_watcher_match(email, user_id),
    })
    if existing:
        return

    await watchers_collection.insert_one({
        "issue_id": issue_id,
        "project_id": project_id,
        "user_email": email,
        "added_by_email": added_by_email,
        "added_at": datetime.now(timezone.utc),
    })


@router.post("/{project_id}/issues/{issue_id}/watchers", response_model=WatcherOut, status_code=status.HTTP_201_CREATED)
async def add_watcher(
    project_id: int,
    issue_id: int,
    watcher: WatcherAdd,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_mongo_db),
):
    """Add a watcher to an issue."""
    await verify_project_access(project_id, current_user.email, db, current_user.role, user_id=current_user.id)

    tickets_collection = db["tickets"]
    watchers_collection = db["issue_watchers"]

    # Verify issue exists
    issue = await tickets_collection.find_one({
        "ticket_number": issue_id,
        "project_id": project_id
    })

    if not issue:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Issue not found"
        )

    target_email = str(watcher.user_email)
    # Check if already watching (match either email or legacy id for the same person)
    target_user = await db["users"].find_one({"email": target_email})
    target_user_id = target_user.get("user_number") if target_user else None
    existing = await watchers_collection.find_one({
        "issue_id": issue_id,
        **_watcher_match(target_email, target_user_id),
    })

    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="User is already watching this issue"
        )

    # Get user info
    user_info = await get_user_info_by_email(db, target_email)

    # Add watcher
    now = datetime.now(timezone.utc)
    watcher_doc = {
        "issue_id": issue_id,
        "project_id": project_id,
        "user_email": target_email,
        "added_by_email": current_user.email,
        "added_at": now
    }

    await watchers_collection.insert_one(watcher_doc)

    # Log activity
    history_collection = db["ticket_history"]
    await history_collection.insert_one({
        "ticket_id": issue_id,
        "project_id": project_id,
        "user_email": current_user.email,
        "action": "watcher_added",
        "changes": [{
            "field": "watchers",
            "old_value": None,
            "new_value": user_info["name"]
        }],
        "timestamp": now
    })

    return WatcherOut(
        user_email=target_email,
        name=user_info["name"],
        initials=user_info["initials"],
        added_at=now,
        user_id=target_user_id,
    )


@router.get("/{project_id}/issues/{issue_id}/watchers", response_model=List[WatcherOut])
async def list_watchers(
    project_id: int,
    issue_id: int,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_mongo_db),
):
    """List watchers for an issue."""
    await verify_project_access(project_id, current_user.email, db, current_user.role, user_id=current_user.id)

    tickets_collection = db["tickets"]
    watchers_collection = db["issue_watchers"]

    # Verify issue exists
    issue = await tickets_collection.find_one({
        "ticket_number": issue_id,
        "project_id": project_id
    })

    if not issue:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Issue not found"
        )

    # Get watchers
    watchers = await watchers_collection.find({
        "issue_id": issue_id
    }).to_list(length=None)

    result = []
    for w in watchers:
        email = w.get("user_email")
        if email:
            user_info = await get_user_info_by_email(db, email)
        else:
            user_info = await get_user_info(db, w.get("user_id"))
            email = user_info.get("email")
        result.append(WatcherOut(
            user_email=email,
            name=user_info["name"],
            initials=user_info["initials"],
            added_at=w["added_at"],
            user_id=user_info.get("id"),
        ))

    return result


@router.delete("/{project_id}/issues/{issue_id}/watchers/{user_email}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_watcher(
    project_id: int,
    issue_id: int,
    user_email: str,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_mongo_db),
):
    """Remove a watcher from an issue (by email).

    You may only remove yourself (opt out). Removing other people is reserved for
    admins — regular members can add/keep watchers but cannot unwatch on their behalf.
    """
    await verify_project_access(project_id, current_user.email, db, current_user.role, user_id=current_user.id)

    if user_email != current_user.email and current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only stop watching for yourself, not remove other watchers",
        )

    watchers_collection = db["issue_watchers"]

    # Get user info before deletion
    user_info = await get_user_info_by_email(db, user_email)
    legacy_user = await db["users"].find_one({"email": user_email})
    legacy_user_id = legacy_user.get("user_number") if legacy_user else None

    # Remove watcher
    result = await watchers_collection.delete_one({
        "issue_id": issue_id,
        **_watcher_match(user_email, legacy_user_id),
    })

    if result.deleted_count == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Watcher not found"
        )

    # Log activity
    history_collection = db["ticket_history"]
    await history_collection.insert_one({
        "ticket_id": issue_id,
        "project_id": project_id,
        "user_email": current_user.email,
        "action": "watcher_removed",
        "changes": [{
            "field": "watchers",
            "old_value": user_info["name"] if user_info else user_email,
            "new_value": None
        }],
        "timestamp": datetime.now(timezone.utc)
    })

    return None


@router.post("/{project_id}/issues/{issue_id}/watch", status_code=status.HTTP_201_CREATED)
async def watch_issue(
    project_id: int,
    issue_id: int,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_mongo_db),
):
    """Start watching an issue (current user)."""
    await verify_project_access(project_id, current_user.email, db, current_user.role, user_id=current_user.id)

    tickets_collection = db["tickets"]
    watchers_collection = db["issue_watchers"]

    # Verify issue exists
    issue = await tickets_collection.find_one({
        "ticket_number": issue_id,
        "project_id": project_id
    })

    if not issue:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Issue not found"
        )

    # Check if already watching (match either email or legacy id)
    existing = await watchers_collection.find_one({
        "issue_id": issue_id,
        **_watcher_match(current_user.email, current_user.id),
    })

    if existing:
        return {"success": True, "message": "Already watching"}

    # Add watcher
    now = datetime.now(timezone.utc)
    watcher_doc = {
        "issue_id": issue_id,
        "project_id": project_id,
        "user_email": current_user.email,
        "added_by_email": current_user.email,
        "added_at": now
    }

    await watchers_collection.insert_one(watcher_doc)

    # Log activity
    history_collection = db["ticket_history"]
    user_info = await get_user_info_by_email(db, current_user.email)
    await history_collection.insert_one({
        "ticket_id": issue_id,
        "project_id": project_id,
        "user_email": current_user.email,
        "action": "started_watching",
        "changes": [{
            "field": "watchers",
            "old_value": None,
            "new_value": user_info["name"]
        }],
        "timestamp": now
    })

    return {"success": True, "message": "Started watching"}


@router.delete("/{project_id}/issues/{issue_id}/watch", status_code=status.HTTP_204_NO_CONTENT)
async def unwatch_issue(
    project_id: int,
    issue_id: int,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_mongo_db),
):
    """Stop watching an issue (current user)."""
    await verify_project_access(project_id, current_user.email, db, current_user.role, user_id=current_user.id)

    watchers_collection = db["issue_watchers"]

    # Remove watcher (match either email or legacy id)
    result = await watchers_collection.delete_one({
        "issue_id": issue_id,
        **_watcher_match(current_user.email, current_user.id),
    })

    if result.deleted_count == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="You are not watching this issue"
        )

    # Log activity
    history_collection = db["ticket_history"]
    user_info = await get_user_info_by_email(db, current_user.email)
    await history_collection.insert_one({
        "ticket_id": issue_id,
        "project_id": project_id,
        "user_email": current_user.email,
        "action": "stopped_watching",
        "changes": [{
            "field": "watchers",
            "old_value": user_info["name"],
            "new_value": None
        }],
        "timestamp": datetime.now(timezone.utc)
    })

    return None
