"""Worklog (Time Tracking) API endpoints."""

from typing import Annotated, List, Optional
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo import ReturnDocument

from ..db.mongo import get_mongo_db
from ..core.security import get_current_user, CurrentUser
from ..schemas.worklogs import (
    WorklogCreate,
    WorklogUpdate,
    WorklogOut,
    TimeEstimateUpdate,
    TimeTrackingSummary,
)


router = APIRouter(prefix="/projects", tags=["worklogs"])


# ========== Helper Functions ==========

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
    """Get user information by user_id."""
    users_collection = db["users"]
    user = await users_collection.find_one({"user_number": user_id})
    if not user:
        return {"id": user_id, "name": "Unknown User", "email": "unknown@example.com"}
    return {
        "id": user_id,
        "name": user.get("name", "Unknown"),
        "email": user.get("email", "unknown@example.com")
    }


async def get_user_info_by_email(db: AsyncIOMotorDatabase, email: Optional[str]) -> Optional[dict]:
    """Get user information by email; returns a minimal stub if user is missing."""
    if not email:
        return None
    user = await db["users"].find_one({"email": email})
    if not user:
        local = email.split("@")[0] if "@" in email else email
        return {"id": None, "email": email, "name": local}
    return {
        "id": user.get("user_number"),
        "email": email,
        "name": user.get("name") or (email.split("@")[0] if "@" in email else email),
    }


async def _resolve_author(db: AsyncIOMotorDatabase, doc: dict) -> Optional[dict]:
    """Prefer author_email, fall back to legacy author_id."""
    email = doc.get("author_email")
    if email:
        return await get_user_info_by_email(db, email)
    legacy_id = doc.get("author_id")
    if legacy_id:
        return await get_user_info(db, legacy_id)
    return None


async def get_ticket_key(db: AsyncIOMotorDatabase, ticket_id: int) -> str:
    """Get ticket key by ticket_id."""
    tickets_collection = db["tickets"]
    ticket = await tickets_collection.find_one({"ticket_number": ticket_id})
    return ticket.get("key", f"TICKET-{ticket_id}") if ticket else f"TICKET-{ticket_id}"


async def verify_issue_access(
    project_id: int,
    issue_id: int,
    db: AsyncIOMotorDatabase,
) -> dict:
    """Verify that the issue exists and belongs to the project."""
    tickets_collection = db["tickets"]

    ticket = await tickets_collection.find_one({
        "ticket_number": issue_id,
        "project_id": project_id
    })

    if not ticket:
        raise HTTPException(status_code=404, detail="Issue not found")

    return ticket


# ========== Worklog CRUD Endpoints ==========

@router.post("/{project_id}/issues/{issue_id}/worklogs", response_model=WorklogOut, status_code=status.HTTP_201_CREATED)
async def log_work(
    project_id: int,
    issue_id: int,
    worklog_in: WorklogCreate,
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    """Log work on an issue."""
    # Verify access
    await verify_project_access(project_id, current_user.email, db, current_user.role, user_id=current_user.id)
    ticket = await verify_issue_access(project_id, issue_id, db)

    worklogs_collection = db["worklogs"]
    tickets_collection = db["tickets"]
    counters_collection = db["counters"]

    # Generate worklog ID
    counter = await counters_collection.find_one_and_update(
        {"_id": "worklogs"},
        {"$inc": {"seq": 1}},
        upsert=True,
        return_document=ReturnDocument.AFTER,
    )
    worklog_number = int(counter.get("seq", 1))

    # Create worklog
    worklog_doc = {
        "worklog_number": worklog_number,
        "issue_id": issue_id,
        "project_id": project_id,
        "time_spent_seconds": worklog_in.time_spent_seconds,
        "started_at": worklog_in.started_at,
        "description": worklog_in.description,
        "author_email": current_user.email,
        "created_at": datetime.now(timezone.utc),
    }

    await worklogs_collection.insert_one(worklog_doc)

    # Update ticket time tracking
    current_time_spent = ticket.get("time_spent_seconds", 0)
    new_time_spent = current_time_spent + worklog_in.time_spent_seconds

    update_data = {
        "time_spent_seconds": new_time_spent,
        "updated_at": datetime.now(timezone.utc),
    }

    # Handle estimate adjustment
    if worklog_in.adjust_estimate == "auto":
        # Auto: reduce remaining by time spent
        current_remaining = ticket.get("remaining_estimate_seconds", 0)
        new_remaining = max(0, current_remaining - worklog_in.time_spent_seconds)
        update_data["remaining_estimate_seconds"] = new_remaining
    elif worklog_in.adjust_estimate == "manual" and worklog_in.new_remaining_seconds is not None:
        # Manual: set new remaining
        update_data["remaining_estimate_seconds"] = worklog_in.new_remaining_seconds
    # else: leave - don't change remaining

    await tickets_collection.update_one(
        {"ticket_number": issue_id},
        {"$set": update_data}
    )

    # Get user info for response
    author = await get_user_info_by_email(db, current_user.email)
    issue_key = ticket.get("key", f"TICKET-{issue_id}")

    return WorklogOut(
        id=worklog_number,
        issue_id=issue_id,
        issue_key=issue_key,
        time_spent_seconds=worklog_in.time_spent_seconds,
        started_at=worklog_in.started_at,
        description=worklog_in.description,
        author=author,
        created_at=worklog_doc["created_at"],
    )


@router.get("/{project_id}/issues/{issue_id}/worklogs", response_model=List[WorklogOut])
async def list_issue_worklogs(
    project_id: int,
    issue_id: int,
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    """Get all worklogs for an issue."""
    await verify_project_access(project_id, current_user.email, db, current_user.role, user_id=current_user.id)
    await verify_issue_access(project_id, issue_id, db)

    worklogs_collection = db["worklogs"]

    worklogs = await worklogs_collection.find(
        {"issue_id": issue_id}
    ).sort("started_at", -1).to_list(length=None)

    result = []
    for w in worklogs:
        author = await _resolve_author(db, w)
        issue_key = await get_ticket_key(db, issue_id)

        result.append(WorklogOut(
            id=w.get("worklog_number"),
            issue_id=issue_id,
            issue_key=issue_key,
            time_spent_seconds=w.get("time_spent_seconds"),
            started_at=w.get("started_at"),
            description=w.get("description"),
            author=author,
            created_at=w.get("created_at"),
            updated_at=w.get("updated_at"),
        ))

    return result


@router.put("/{project_id}/worklogs/{worklog_id}", response_model=WorklogOut)
async def update_worklog(
    project_id: int,
    worklog_id: int,
    worklog_update: WorklogUpdate,
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    """Update a worklog (only author or admin can update)."""
    await verify_project_access(project_id, current_user.email, db, current_user.role, user_id=current_user.id)

    worklogs_collection = db["worklogs"]
    tickets_collection = db["tickets"]

    # Get worklog
    worklog = await worklogs_collection.find_one({
        "worklog_number": worklog_id,
        "project_id": project_id
    })

    if not worklog:
        raise HTTPException(status_code=404, detail="Worklog not found")

    # Check permission (prefer author_email, fall back to legacy author_id)
    author_email = worklog.get("author_email")
    is_author = (
        author_email == current_user.email
        if author_email
        else worklog.get("author_id") == current_user.id
    )
    if not is_author and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="You can only edit your own worklogs")

    # Build update dict
    update_data = {}
    old_time_spent = worklog.get("time_spent_seconds")

    if worklog_update.time_spent_seconds is not None:
        update_data["time_spent_seconds"] = worklog_update.time_spent_seconds
    if worklog_update.started_at is not None:
        update_data["started_at"] = worklog_update.started_at
    if worklog_update.description is not None:
        update_data["description"] = worklog_update.description

    update_data["updated_at"] = datetime.now(timezone.utc)

    # Update worklog
    updated_worklog = await worklogs_collection.find_one_and_update(
        {"worklog_number": worklog_id},
        {"$set": update_data},
        return_document=ReturnDocument.AFTER,
    )

    # If time spent changed, update ticket
    if worklog_update.time_spent_seconds is not None and worklog_update.time_spent_seconds != old_time_spent:
        issue_id = worklog.get("issue_id")
        ticket = await tickets_collection.find_one({"ticket_number": issue_id})

        if ticket:
            # Recalculate total time spent
            all_worklogs = await worklogs_collection.find({"issue_id": issue_id}).to_list(length=None)
            total_time_spent = sum(w.get("time_spent_seconds", 0) for w in all_worklogs)

            ticket_update = {
                "time_spent_seconds": total_time_spent,
                "updated_at": datetime.now(timezone.utc),
            }

            # Handle estimate adjustment if provided
            if worklog_update.adjust_estimate == "manual" and worklog_update.new_remaining_seconds is not None:
                ticket_update["remaining_estimate_seconds"] = worklog_update.new_remaining_seconds

            await tickets_collection.update_one(
                {"ticket_number": issue_id},
                {"$set": ticket_update}
            )

    # Get user info for response
    author = await _resolve_author(db, updated_worklog)
    issue_key = await get_ticket_key(db, updated_worklog.get("issue_id"))

    return WorklogOut(
        id=worklog_id,
        issue_id=updated_worklog.get("issue_id"),
        issue_key=issue_key,
        time_spent_seconds=updated_worklog.get("time_spent_seconds"),
        started_at=updated_worklog.get("started_at"),
        description=updated_worklog.get("description"),
        author=author,
        created_at=updated_worklog.get("created_at"),
        updated_at=updated_worklog.get("updated_at"),
    )


@router.delete("/{project_id}/worklogs/{worklog_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_worklog(
    project_id: int,
    worklog_id: int,
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    """Delete a worklog (only author or admin can delete)."""
    await verify_project_access(project_id, current_user.email, db, current_user.role, user_id=current_user.id)

    worklogs_collection = db["worklogs"]
    tickets_collection = db["tickets"]

    # Get worklog
    worklog = await worklogs_collection.find_one({
        "worklog_number": worklog_id,
        "project_id": project_id
    })

    if not worklog:
        raise HTTPException(status_code=404, detail="Worklog not found")

    # Check permission (prefer author_email, fall back to legacy author_id)
    author_email = worklog.get("author_email")
    is_author = (
        author_email == current_user.email
        if author_email
        else worklog.get("author_id") == current_user.id
    )
    if not is_author and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="You can only delete your own worklogs")

    # Delete worklog
    await worklogs_collection.delete_one({"worklog_number": worklog_id})

    # Update ticket time tracking
    issue_id = worklog.get("issue_id")
    all_worklogs = await worklogs_collection.find({"issue_id": issue_id}).to_list(length=None)
    total_time_spent = sum(w.get("time_spent_seconds", 0) for w in all_worklogs)

    await tickets_collection.update_one(
        {"ticket_number": issue_id},
        {"$set": {
            "time_spent_seconds": total_time_spent,
            "updated_at": datetime.now(timezone.utc),
        }}
    )


# ========== Time Estimation Endpoints ==========

@router.put("/{project_id}/issues/{issue_id}/estimate", response_model=TimeTrackingSummary)
async def update_time_estimate(
    project_id: int,
    issue_id: int,
    estimate_update: TimeEstimateUpdate,
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    """Update time estimates for an issue."""
    await verify_project_access(project_id, current_user.email, db, current_user.role, user_id=current_user.id)
    ticket = await verify_issue_access(project_id, issue_id, db)

    tickets_collection = db["tickets"]

    # Build update dict
    update_data = {}
    if estimate_update.original_estimate_seconds is not None:
        update_data["original_estimate_seconds"] = estimate_update.original_estimate_seconds
    if estimate_update.remaining_estimate_seconds is not None:
        update_data["remaining_estimate_seconds"] = estimate_update.remaining_estimate_seconds

    update_data["updated_at"] = datetime.now(timezone.utc)

    # Update ticket
    updated_ticket = await tickets_collection.find_one_and_update(
        {"ticket_number": issue_id, "project_id": project_id},
        {"$set": update_data},
        return_document=ReturnDocument.AFTER,
    )

    # Get worklog count
    worklogs_collection = db["worklogs"]
    worklogs_count = await worklogs_collection.count_documents({"issue_id": issue_id})

    return TimeTrackingSummary(
        original_estimate_seconds=updated_ticket.get("original_estimate_seconds", 0),
        time_spent_seconds=updated_ticket.get("time_spent_seconds", 0),
        remaining_estimate_seconds=updated_ticket.get("remaining_estimate_seconds", 0),
        worklogs_count=worklogs_count,
    )


@router.get("/{project_id}/issues/{issue_id}/time-tracking", response_model=TimeTrackingSummary)
async def get_time_tracking_summary(
    project_id: int,
    issue_id: int,
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    """Get time tracking summary for an issue."""
    await verify_project_access(project_id, current_user.email, db, current_user.role, user_id=current_user.id)
    ticket = await verify_issue_access(project_id, issue_id, db)

    # Get worklog count
    worklogs_collection = db["worklogs"]
    worklogs_count = await worklogs_collection.count_documents({"issue_id": issue_id})

    return TimeTrackingSummary(
        original_estimate_seconds=ticket.get("original_estimate_seconds", 0),
        time_spent_seconds=ticket.get("time_spent_seconds", 0),
        remaining_estimate_seconds=ticket.get("remaining_estimate_seconds", 0),
        worklogs_count=worklogs_count,
    )
