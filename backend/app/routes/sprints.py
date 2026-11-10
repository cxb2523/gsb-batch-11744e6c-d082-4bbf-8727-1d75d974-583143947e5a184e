"""Sprint API endpoints for Agile sprint management."""

import logging
from typing import Annotated, List, Optional
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

from fastapi import APIRouter, Depends, HTTPException, Query, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo import ReturnDocument

from ..db.mongo import get_mongo_db
from ..db.queries import NOT_ARCHIVED
from ..core.security import get_current_user, require_project_admin, CurrentUser
from ..schemas.sprints import (
    SprintCreate,
    SprintComplete,
    SprintUpdate,
    SprintStart,
    SprintDatesUpdate,
    SprintOut,
    SprintState,
    SprintCapacityOut,
    SprintIssueAssignment,
)


router = APIRouter(prefix="/projects", tags=["sprints"])


# ========== Helper Functions ==========

def _as_utc(value: datetime) -> datetime:
    """Return a tz-aware UTC datetime so stored (possibly naive) dates compare safely."""
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value


async def verify_project_access(
    project_id: int,
    user_email: str,
    db: AsyncIOMotorDatabase,
    user_role: str = "user",
    user_id: Optional[int] = None,
) -> None:
    """Verify that the user has access to the project (is an active member or admin). Raises 403 if not."""
    # Admins have access to all projects
    if user_role == "admin":
        return

    members_collection = db["project_members"]

    or_clauses: list = [{"user_email": user_email}]
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
        "email": user.get("email", "unknown@example.com"),
        "initials": "".join([n[0].upper() for n in user.get("name", "U U").split()[:2]])
    }


# ========== Sprint CRUD Endpoints ==========

@router.post("/{project_id}/sprints", response_model=SprintOut, status_code=status.HTTP_201_CREATED)
async def create_sprint(
    project_id: int,
    sprint_in: SprintCreate,
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    """Create a new sprint."""
    # Verify user has access to this project
    await verify_project_access(project_id, current_user.email, db, current_user.role, user_id=current_user.id)

    sprints_collection = db["sprints"]
    counters_collection = db["counters"]

    # Verify project exists
    projects_collection = db["projects"]
    project = await projects_collection.find_one({"project_number": project_id})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Generate sprint number
    counter = await counters_collection.find_one_and_update(
        {"_id": f"sprints_{project_id}"},
        {"$inc": {"seq": 1}},
        upsert=True,
        return_document=ReturnDocument.AFTER,
    )
    sprint_number = int(counter.get("seq", 1))

    # Create sprint document
    sprint_doc = {
        "sprint_number": sprint_number,
        "project_id": project_id,
        "name": sprint_in.name,
        "goal": sprint_in.goal,
        "state": SprintState.FUTURE,
        "start_date": sprint_in.start_date,
        "end_date": sprint_in.end_date,
        "completed_at": None,
        "created_by_email": current_user.email,
        "created_at": datetime.now(timezone.utc),
        "updated_at": None,
    }

    await sprints_collection.insert_one(sprint_doc)

    return {
        "id": sprint_number,
        "project_id": project_id,
        "name": sprint_in.name,
        "goal": sprint_in.goal,
        "state": SprintState.FUTURE,
        "start_date": sprint_in.start_date,
        "end_date": sprint_in.end_date,
        "completed_at": None,
        "created_at": sprint_doc["created_at"],
        "updated_at": None,
    }


@router.get("/{project_id}/sprints", response_model=List[SprintOut])
async def list_sprints(
    project_id: int,
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
    state: Optional[SprintState] = Query(None, description="Filter by sprint state"),
):
    """Get all sprints for a project with optional state filter."""
    # Verify user has access to this project
    await verify_project_access(project_id, current_user.email, db, current_user.role, user_id=current_user.id)

    sprints_collection = db["sprints"]

    # Build query
    query = {"project_id": project_id}
    if state:
        query["state"] = state

    # Fetch sprints, sorted by creation date (newest first)
    sprints = await sprints_collection.find(query).sort("created_at", -1).to_list(length=None)

    result = []
    for sprint in sprints:
        sprint_number = sprint.get("sprint_number")
        if sprint_number is None:
            continue

        result.append({
            "id": sprint_number,
            "project_id": project_id,
            "name": sprint.get("name"),
            "goal": sprint.get("goal"),
            "state": sprint.get("state", SprintState.FUTURE),
            "start_date": sprint.get("start_date"),
            "end_date": sprint.get("end_date"),
            "completed_at": sprint.get("completed_at"),
            "created_at": sprint.get("created_at"),
            "updated_at": sprint.get("updated_at"),
        })

    return result


@router.get("/{project_id}/sprints/{sprint_id}", response_model=SprintOut)
async def get_sprint(
    project_id: int,
    sprint_id: int,
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    """Get a specific sprint by ID."""
    # Verify user has access to this project
    await verify_project_access(project_id, current_user.email, db, current_user.role, user_id=current_user.id)

    sprints_collection = db["sprints"]

    sprint = await sprints_collection.find_one({
        "sprint_number": sprint_id,
        "project_id": project_id
    })

    if not sprint:
        raise HTTPException(status_code=404, detail="Sprint not found")

    return {
        "id": sprint.get("sprint_number"),
        "project_id": project_id,
        "name": sprint.get("name"),
        "goal": sprint.get("goal"),
        "state": sprint.get("state", SprintState.FUTURE),
        "start_date": sprint.get("start_date"),
        "end_date": sprint.get("end_date"),
        "completed_at": sprint.get("completed_at"),
        "created_at": sprint.get("created_at"),
        "updated_at": sprint.get("updated_at"),
    }


@router.put("/{project_id}/sprints/{sprint_id}", response_model=SprintOut)
async def update_sprint(
    project_id: int,
    sprint_id: int,
    sprint_update: SprintUpdate,
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    """Update a sprint."""
    # Verify user has access to this project
    await verify_project_access(project_id, current_user.email, db, current_user.role, user_id=current_user.id)

    sprints_collection = db["sprints"]

    # Verify sprint exists
    sprint = await sprints_collection.find_one({
        "sprint_number": sprint_id,
        "project_id": project_id
    })
    if not sprint:
        raise HTTPException(status_code=404, detail="Sprint not found")

    # Build update dict
    update_data = {}
    if sprint_update.name is not None:
        update_data["name"] = sprint_update.name
    if sprint_update.goal is not None:
        update_data["goal"] = sprint_update.goal
    if sprint_update.start_date is not None:
        update_data["start_date"] = sprint_update.start_date
    if sprint_update.end_date is not None:
        update_data["end_date"] = sprint_update.end_date

    update_data["updated_at"] = datetime.now(timezone.utc)

    # Update sprint
    updated_sprint = await sprints_collection.find_one_and_update(
        {"sprint_number": sprint_id, "project_id": project_id},
        {"$set": update_data},
        return_document=ReturnDocument.AFTER,
    )

    return {
        "id": sprint_id,
        "project_id": project_id,
        "name": updated_sprint.get("name"),
        "goal": updated_sprint.get("goal"),
        "state": updated_sprint.get("state", SprintState.FUTURE),
        "start_date": updated_sprint.get("start_date"),
        "end_date": updated_sprint.get("end_date"),
        "completed_at": updated_sprint.get("completed_at"),
        "created_at": updated_sprint.get("created_at"),
        "updated_at": updated_sprint.get("updated_at"),
    }


@router.delete("/{project_id}/sprints/{sprint_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_sprint(
    project_id: int,
    sprint_id: int,
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    """Delete a sprint. Only allowed if sprint is empty (no issues)."""
    # Verify user has access to this project
    await verify_project_access(project_id, current_user.email, db, current_user.role, user_id=current_user.id)

    sprints_collection = db["sprints"]
    tickets_collection = db["tickets"]

    # Verify sprint exists
    sprint = await sprints_collection.find_one({
        "sprint_number": sprint_id,
        "project_id": project_id
    })
    if not sprint:
        raise HTTPException(status_code=404, detail="Sprint not found")

    # Check if sprint has any issues
    issue_count = await tickets_collection.count_documents({
        "project_id": project_id,
        "sprint_id": sprint_id
    })

    if issue_count > 0:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot delete sprint with {issue_count} issue(s). Remove all issues first."
        )

    # Delete sprint
    await sprints_collection.delete_one({
        "sprint_number": sprint_id,
        "project_id": project_id
    })


# ========== Sprint State Management ==========

@router.post("/{project_id}/sprints/{sprint_id}/start", response_model=SprintOut)
async def start_sprint(
    project_id: int,
    sprint_id: int,
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
    payload: Optional[SprintStart] = None,
):
    """Start a sprint (state: future → active)."""
    # Verify user has access to this project
    await verify_project_access(project_id, current_user.email, db, current_user.role, user_id=current_user.id)

    sprints_collection = db["sprints"]

    # Verify sprint exists and is in future state
    sprint = await sprints_collection.find_one({
        "sprint_number": sprint_id,
        "project_id": project_id
    })
    if not sprint:
        raise HTTPException(status_code=404, detail="Sprint not found")

    if sprint.get("state") != SprintState.FUTURE:
        raise HTTPException(
            status_code=400,
            detail=f"Sprint is already {sprint.get('state')}. Only future sprints can be started."
        )

    # A project may run several active sprints at once (e.g. separate backend,
    # design and mobile tracks), so there is no single-active-sprint limit.

    # Start sprint
    now = datetime.now(timezone.utc)
    payload = payload or SprintStart()

    # Activation always stamps the start date as "now". The start date is NOT
    # taken from the client or from any value planned on a draft sprint: letting
    # someone start a sprint with a past start date would fabricate burndown and
    # velocity history ("time travel"). Future/draft sprints may hold tentative
    # dates, but going live resets the start to the real moment it began.
    start_date = now
    end_date = payload.end_date or sprint.get("end_date")

    # A sprint is time-boxed, so an end date is mandatory to start one (velocity,
    # burndown and retrospectives all depend on a defined window).
    if end_date is None:
        raise HTTPException(
            status_code=400,
            detail="An end date is required to start a sprint.",
        )

    # Compare with consistent tzinfo (stored dates may be naive) and reject an
    # end that is not strictly after the start (i.e. in the past, since start=now).
    if _as_utc(end_date) <= _as_utc(start_date):
        raise HTTPException(
            status_code=400,
            detail="Sprint end date must be after today.",
        )

    update_data = {
        "state": SprintState.ACTIVE,
        "updated_at": now,
        "start_date": start_date,
        "end_date": end_date,
    }

    updated_sprint = await sprints_collection.find_one_and_update(
        {"sprint_number": sprint_id, "project_id": project_id},
        {"$set": update_data},
        return_document=ReturnDocument.AFTER,
    )

    # Move the sprint's backlog/todo tickets to "Ready to Pick" so they are
    # ready to be picked up once the sprint starts.
    statuses_collection = db["ticket_statuses"]
    tickets_collection = db["tickets"]

    project_statuses = await statuses_collection.find(
        {"project_id": project_id}
    ).to_list(length=None)

    ready_to_pick_id = None
    backlog_like_ids = []
    for project_status in project_statuses:
        status_name = (project_status.get("name") or "").strip().lower()
        status_number = project_status.get("status_number")
        if status_number is None:
            continue
        if status_name == "ready to pick":
            ready_to_pick_id = status_number
        elif any(keyword in status_name for keyword in ("backlog", "to do", "todo", "open", "new")):
            backlog_like_ids.append(status_number)

    if ready_to_pick_id is not None and backlog_like_ids:
        result = await tickets_collection.update_many(
            {
                "project_id": project_id,
                "sprint_id": sprint_id,
                "status_id": {"$in": backlog_like_ids},
            },
            {
                "$set": {
                    "status_id": ready_to_pick_id,
                    "updated_at": now,
                }
            },
        )
        if result.modified_count:
            logger.info(
                "Sprint %s started in project %s: moved %s ticket(s) to 'Ready to Pick'",
                sprint_id, project_id, result.modified_count,
            )

    return {
        "id": sprint_id,
        "project_id": project_id,
        "name": updated_sprint.get("name"),
        "goal": updated_sprint.get("goal"),
        "state": updated_sprint.get("state"),
        "start_date": updated_sprint.get("start_date"),
        "end_date": updated_sprint.get("end_date"),
        "completed_at": updated_sprint.get("completed_at"),
        "created_at": updated_sprint.get("created_at"),
        "updated_at": updated_sprint.get("updated_at"),
    }


@router.patch("/{project_id}/sprints/{sprint_id}/dates", response_model=SprintOut)
async def update_sprint_dates(
    project_id: int,
    sprint_id: int,
    dates: SprintDatesUpdate,
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
    # Admin-only: global admins or an admin on this project. Non-admins are
    # rejected with 403 before any change is made.
    current_user: Annotated[CurrentUser, Depends(require_project_admin)],
):
    """Change a sprint's end date (extend it, or fix one that is wrong/missing).

    Guarded so the time-box stays meaningful: only admins may do it, the start
    date is never editable here (it is locked at activation), the new end date
    must be in the future and strictly after the sprint's start date, and a
    completed sprint cannot be re-dated.
    """
    sprints_collection = db["sprints"]

    sprint = await sprints_collection.find_one({
        "sprint_number": sprint_id,
        "project_id": project_id,
    })
    if not sprint:
        raise HTTPException(status_code=404, detail="Sprint not found")

    if sprint.get("state") == SprintState.CLOSED:
        raise HTTPException(
            status_code=400,
            detail="A completed sprint's dates can't be changed.",
        )

    now = datetime.now(timezone.utc)
    new_end = _as_utc(dates.end_date)

    # Can't move a sprint's end into the past — that would rewrite history. Ending
    # a sprint early is done with "Complete Sprint", not by shrinking the window.
    if new_end <= now:
        raise HTTPException(
            status_code=400,
            detail="The end date must be in the future.",
        )

    start_date = sprint.get("start_date")
    if start_date is not None and new_end <= _as_utc(start_date):
        raise HTTPException(
            status_code=400,
            detail="The end date must be after the start date.",
        )

    updated_sprint = await sprints_collection.find_one_and_update(
        {"sprint_number": sprint_id, "project_id": project_id},
        {"$set": {"end_date": dates.end_date, "updated_at": now}},
        return_document=ReturnDocument.AFTER,
    )

    return {
        "id": sprint_id,
        "project_id": project_id,
        "name": updated_sprint.get("name"),
        "goal": updated_sprint.get("goal"),
        "state": updated_sprint.get("state"),
        "start_date": updated_sprint.get("start_date"),
        "end_date": updated_sprint.get("end_date"),
        "completed_at": updated_sprint.get("completed_at"),
        "created_at": updated_sprint.get("created_at"),
        "updated_at": updated_sprint.get("updated_at"),
    }


@router.post("/{project_id}/sprints/{sprint_id}/complete", response_model=SprintOut)
async def complete_sprint(
    project_id: int,
    sprint_id: int,
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
    payload: Optional[SprintComplete] = None,
):
    """Complete a sprint (state: active → closed).

    Incomplete issues are moved to the backlog by default, or to the sprint
    specified by payload.move_to_sprint_id.
    """
    # Verify user has access to this project
    await verify_project_access(project_id, current_user.email, db, current_user.role, user_id=current_user.id)

    sprints_collection = db["sprints"]
    tickets_collection = db["tickets"]
    statuses_collection = db["ticket_statuses"]

    # Verify sprint exists and is active
    sprint = await sprints_collection.find_one({
        "sprint_number": sprint_id,
        "project_id": project_id
    })
    if not sprint:
        raise HTTPException(status_code=404, detail="Sprint not found")

    if sprint.get("state") != SprintState.ACTIVE:
        raise HTTPException(
            status_code=400,
            detail=f"Sprint is {sprint.get('state')}. Only active sprints can be completed."
        )

    # Validate target sprint for incomplete issues (if provided)
    move_to_sprint_id = payload.move_to_sprint_id if payload else None
    if move_to_sprint_id is not None:
        if move_to_sprint_id == sprint_id:
            raise HTTPException(
                status_code=400,
                detail="Cannot move incomplete issues to the sprint being completed"
            )
        target_sprint = await sprints_collection.find_one({
            "sprint_number": move_to_sprint_id,
            "project_id": project_id
        })
        if not target_sprint:
            raise HTTPException(status_code=404, detail="Target sprint not found")
        if target_sprint.get("state") == SprintState.CLOSED:
            raise HTTPException(
                status_code=400,
                detail="Cannot move incomplete issues to a closed sprint"
            )

    # Get all "Done" statuses for this project
    done_statuses = await statuses_collection.find({
        "project_id": project_id,
        "name": {"$in": ["Done", "Closed", "Completed"]}
    }).to_list(length=None)
    done_status_ids = {s.get("status_number") for s in done_statuses}

    # Snapshot committed/completed points before unfinished issues leave the
    # sprint, so the velocity report can still see what was committed.
    sprint_issues = await tickets_collection.find({
        "project_id": project_id,
        "sprint_id": sprint_id,
        **NOT_ARCHIVED
    }).to_list(length=None)
    committed_points = sum(issue.get("story_points") or 0 for issue in sprint_issues)
    completed_points = sum(
        issue.get("story_points") or 0
        for issue in sprint_issues
        if issue.get("status_id") in done_status_ids
    )

    incomplete_query = {
        "project_id": project_id,
        "sprint_id": sprint_id,
        "status_id": {"$nin": list(done_status_ids)}
    }

    if move_to_sprint_id is not None:
        # Move incomplete issues to the chosen sprint
        await tickets_collection.update_many(
            incomplete_query,
            {
                "$set": {
                    "sprint_id": move_to_sprint_id,
                    "updated_at": datetime.now(timezone.utc)
                }
            }
        )
    else:
        # Move incomplete issues back to backlog (remove sprint_id)
        await tickets_collection.update_many(
            incomplete_query,
            {
                "$unset": {"sprint_id": ""},
                "$set": {"updated_at": datetime.now(timezone.utc)}
            }
        )

    # Complete sprint
    now = datetime.now(timezone.utc)
    updated_sprint = await sprints_collection.find_one_and_update(
        {"sprint_number": sprint_id, "project_id": project_id},
        {
            "$set": {
                "state": SprintState.CLOSED,
                "completed_at": now,
                "updated_at": now,
                "committed_points": committed_points,
                "completed_points": completed_points,
            }
        },
        return_document=ReturnDocument.AFTER,
    )

    return {
        "id": sprint_id,
        "project_id": project_id,
        "name": updated_sprint.get("name"),
        "goal": updated_sprint.get("goal"),
        "state": updated_sprint.get("state"),
        "start_date": updated_sprint.get("start_date"),
        "end_date": updated_sprint.get("end_date"),
        "completed_at": updated_sprint.get("completed_at"),
        "created_at": updated_sprint.get("created_at"),
        "updated_at": updated_sprint.get("updated_at"),
    }


# ========== Sprint Planning Endpoints ==========

@router.post("/{project_id}/sprints/{sprint_id}/issues", status_code=status.HTTP_200_OK)
async def add_issues_to_sprint(
    project_id: int,
    sprint_id: int,
    assignment: SprintIssueAssignment,
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    """Add issues to a sprint."""
    # Verify user has access to this project
    await verify_project_access(project_id, current_user.email, db, current_user.role, user_id=current_user.id)

    sprints_collection = db["sprints"]
    tickets_collection = db["tickets"]

    # Verify sprint exists
    sprint = await sprints_collection.find_one({
        "sprint_number": sprint_id,
        "project_id": project_id
    })
    if not sprint:
        raise HTTPException(status_code=404, detail="Sprint not found")

    # Cannot add issues to closed sprint
    if sprint.get("state") == SprintState.CLOSED:
        raise HTTPException(status_code=400, detail="Cannot add issues to a closed sprint")

    # Update issues to add sprint_id
    result = await tickets_collection.update_many(
        {
            "project_id": project_id,
            "ticket_number": {"$in": assignment.issue_ids}
        },
        {
            "$set": {
                "sprint_id": sprint_id,
                "updated_at": datetime.now(timezone.utc)
            }
        }
    )

    return {
        "success": True,
        "sprint_id": sprint_id,
        "issues_added": result.modified_count
    }


@router.delete("/{project_id}/sprints/{sprint_id}/issues/{issue_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_issue_from_sprint(
    project_id: int,
    sprint_id: int,
    issue_id: int,
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    """Remove an issue from a sprint."""
    # Verify user has access to this project
    await verify_project_access(project_id, current_user.email, db, current_user.role, user_id=current_user.id)

    tickets_collection = db["tickets"]

    # Verify issue exists and is in this sprint
    issue = await tickets_collection.find_one({
        "ticket_number": issue_id,
        "project_id": project_id,
        "sprint_id": sprint_id
    })

    if not issue:
        raise HTTPException(status_code=404, detail="Issue not found in this sprint")

    # Remove sprint_id from issue
    await tickets_collection.update_one(
        {
            "ticket_number": issue_id,
            "project_id": project_id
        },
        {
            "$unset": {"sprint_id": ""},
            "$set": {"updated_at": datetime.now(timezone.utc)}
        }
    )


@router.get("/{project_id}/sprints/{sprint_id}/capacity", response_model=SprintCapacityOut)
async def get_sprint_capacity(
    project_id: int,
    sprint_id: int,
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    """Get sprint capacity (story points and issue counts)."""
    # Verify user has access to this project
    await verify_project_access(project_id, current_user.email, db, current_user.role, user_id=current_user.id)

    sprints_collection = db["sprints"]
    tickets_collection = db["tickets"]
    statuses_collection = db["ticket_statuses"]

    # Verify sprint exists
    sprint = await sprints_collection.find_one({
        "sprint_number": sprint_id,
        "project_id": project_id
    })
    if not sprint:
        raise HTTPException(status_code=404, detail="Sprint not found")

    # Get all done statuses
    done_statuses = await statuses_collection.find({
        "project_id": project_id,
        "name": {"$in": ["Done", "Closed", "Completed"]}
    }).to_list(length=None)
    done_status_ids = {s.get("status_number") for s in done_statuses}

    # Get all issues in this sprint (archived ones don't count toward capacity)
    issues = await tickets_collection.find({
        "project_id": project_id,
        "sprint_id": sprint_id,
        **NOT_ARCHIVED
    }).to_list(length=None)

    # Calculate metrics
    total_story_points = 0
    completed_story_points = 0
    total_issues = len(issues)
    completed_issues = 0

    for issue in issues:
        story_points = issue.get("story_points", 0) or 0
        total_story_points += story_points

        if issue.get("status_id") in done_status_ids:
            completed_story_points += story_points
            completed_issues += 1

    remaining_story_points = total_story_points - completed_story_points
    remaining_issues = total_issues - completed_issues

    # Calculate progress percentage
    progress_percentage = (
        (completed_story_points / total_story_points * 100)
        if total_story_points > 0
        else 0.0
    )

    # Calculate days remaining
    days_remaining = None
    if sprint.get("end_date"):
        end_date = sprint.get("end_date")
        # Ensure end_date is timezone-aware
        if end_date.tzinfo is None:
            end_date = end_date.replace(tzinfo=timezone.utc)
        now = datetime.now(timezone.utc)
        if end_date > now:
            delta = end_date - now
            days_remaining = delta.days

    return {
        "sprint_id": sprint_id,
        "total_story_points": total_story_points,
        "completed_story_points": completed_story_points,
        "remaining_story_points": remaining_story_points,
        "total_issues": total_issues,
        "completed_issues": completed_issues,
        "remaining_issues": remaining_issues,
        "days_remaining": days_remaining,
        "progress_percentage": round(progress_percentage, 1),
    }
