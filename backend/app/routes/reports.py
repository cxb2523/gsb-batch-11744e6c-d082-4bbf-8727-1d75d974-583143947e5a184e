"""Reports API endpoints for analytics and charts."""

import logging
from typing import Annotated, Optional
from datetime import datetime, date, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from ..db.mongo import get_mongo_db
from ..core.security import get_current_user, CurrentUser
from ..schemas.sprints import SprintState
from ..schemas.reports import (
    BurndownChartResponse, BurndownDataPoint,
    VelocityChartResponse, VelocityDataPoint,
    SprintReportResponse, SprintReportIssue,
)


logger = logging.getLogger(__name__)
router = APIRouter(prefix="/projects", tags=["reports"])


async def verify_project_access(
    project_id: int,
    user_id: int,
    db: AsyncIOMotorDatabase,
    user_role: str = "user",
) -> None:
    """Verify that the user has access to the project."""
    if user_role == "admin":
        return

    members_collection = db["project_members"]
    member = await members_collection.find_one({
        "project_id": project_id,
        "user_id": user_id,
        "$or": [
            {"active": True},
            {"active": {"$exists": False}}
        ]
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
    }


async def get_user_info_by_email(db: AsyncIOMotorDatabase, email: Optional[str]) -> Optional[dict]:
    """Get user information by email."""
    if not email:
        return None
    user = await db["users"].find_one({"email": email})
    if not user:
        local = email.split("@")[0] if "@" in email else email
        return {"id": None, "name": local, "email": email}
    return {
        "id": user.get("user_number"),
        "name": user.get("name", email.split("@")[0]),
        "email": email,
    }


async def get_status_name(db: AsyncIOMotorDatabase, status_id: int) -> str:
    """Get status name by status_id."""
    statuses_collection = db["ticket_statuses"]
    status = await statuses_collection.find_one({"status_number": status_id})
    return status.get("name", "Unknown") if status else "Unknown"


@router.get("/{project_id}/reports/burndown", response_model=BurndownChartResponse)
async def get_burndown_chart(
    project_id: int,
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
    sprint_id: int = Query(..., description="Sprint ID"),
):
    """Get burndown chart data for a sprint.

    Returns:
        Daily story points remaining + ideal burndown line
    """
    await verify_project_access(project_id, current_user.id, db, current_user.role)

    # Get sprint info
    sprints_collection = db["sprints"]
    sprint = await sprints_collection.find_one({"sprint_number": sprint_id, "project_id": project_id})
    if not sprint:
        raise HTTPException(status_code=404, detail="Sprint not found")

    start_date = sprint.get("start_date")
    end_date = sprint.get("end_date")
    if not start_date or not end_date:
        raise HTTPException(status_code=400, detail="Sprint must have start and end dates")

    # Convert to date objects
    start = start_date.date() if isinstance(start_date, datetime) else start_date
    end = end_date.date() if isinstance(end_date, datetime) else end_date

    # Get all tickets in sprint
    tickets_collection = db["tickets"]
    tickets = await tickets_collection.find({
        "project_id": project_id,
        "sprint_id": sprint_id
    }).to_list(length=None)

    # Calculate total story points
    total_points = sum(ticket.get("story_points", 0) for ticket in tickets if ticket.get("story_points"))

    # Get ticket history to track daily changes
    history_collection = db["ticket_history"]

    # Build daily burndown data
    data_points = []
    current_date = start
    delta = timedelta(days=1)

    # Calculate ideal burndown (linear)
    days_total = (end - start).days + 1
    ideal_per_day = total_points / days_total if days_total > 0 else 0

    while current_date <= end:
        # Calculate remaining points on this date
        remaining_points = 0
        scope_change = 0

        for ticket in tickets:
            ticket_points = ticket.get("story_points", 0)
            if not ticket_points:
                continue

            # Check if ticket was added to sprint before or on this date
            ticket_created = ticket.get("created_at")
            if ticket_created:
                ticket_date = ticket_created.date() if isinstance(ticket_created, datetime) else ticket_created
                if ticket_date > current_date:
                    continue  # Ticket not yet in sprint

            # Check if ticket was completed before or on this date
            completed_at = ticket.get("completed_at")
            if completed_at:
                completed_date = completed_at.date() if isinstance(completed_at, datetime) else completed_at
                if completed_date <= current_date:
                    continue  # Ticket completed, don't count

            remaining_points += ticket_points

        # Calculate ideal remaining
        days_elapsed = (current_date - start).days
        ideal_remaining = max(0, total_points - (ideal_per_day * days_elapsed))

        data_points.append(BurndownDataPoint(
            date=current_date,
            story_points_remaining=remaining_points,
            ideal_remaining=int(ideal_remaining),
            scope_change=scope_change,
        ))

        current_date += delta

    return BurndownChartResponse(
        sprint_id=sprint_id,
        sprint_name=sprint.get("name", f"Sprint {sprint_id}"),
        start_date=start,
        end_date=end,
        total_story_points=total_points,
        data_points=data_points,
    )


@router.get("/{project_id}/reports/velocity", response_model=VelocityChartResponse)
async def get_velocity_chart(
    project_id: int,
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
    num_sprints: int = Query(6, ge=1, le=24, description="Number of sprints to include"),
):
    """Get velocity chart data showing committed vs completed story points per sprint.

    Args:
        num_sprints: Number of most recent sprints to include (default 6)

    Returns:
        Per-sprint committed vs completed + average velocity
    """
    await verify_project_access(project_id, current_user.id, db, current_user.role)

    # Get recent completed sprints. Ordered by when they were completed, so
    # sprints that ran in parallel still come out in a sensible order.
    sprints_collection = db["sprints"]
    sprints = await sprints_collection.find({
        "project_id": project_id,
        "state": SprintState.CLOSED,
    }).sort([("completed_at", -1), ("end_date", -1)]).limit(num_sprints).to_list(length=None)

    if not sprints:
        return VelocityChartResponse(sprints=[], average_velocity=0.0)

    # Reverse to chronological order
    sprints.reverse()

    tickets_collection = db["tickets"]
    statuses_collection = db["ticket_statuses"]
    done_statuses = await statuses_collection.find({
        "project_id": project_id,
        "name": {"$in": ["Done", "Closed", "Completed"]}
    }).to_list(length=None)
    done_status_ids = {s.get("status_number") for s in done_statuses}

    velocity_data = []
    total_completed = 0

    for sprint in sprints:
        sprint_id = sprint.get("sprint_number")

        if sprint.get("committed_points") is not None:
            # Snapshot taken when the sprint was completed, before unfinished
            # issues were moved out of it.
            committed_points = sprint.get("committed_points") or 0
            completed_points = sprint.get("completed_points") or 0
        else:
            # Sprints completed before snapshots existed: best effort from the
            # issues still in the sprint (unfinished ones were moved out).
            tickets = await tickets_collection.find({
                "project_id": project_id,
                "sprint_id": sprint_id
            }).to_list(length=None)
            committed_points = sum(ticket.get("story_points", 0) for ticket in tickets if ticket.get("story_points"))
            completed_points = sum(
                ticket.get("story_points", 0)
                for ticket in tickets
                if ticket.get("story_points") and ticket.get("status_id") in done_status_ids
            )

        total_completed += completed_points

        velocity_data.append(VelocityDataPoint(
            sprint_id=sprint_id,
            sprint_name=sprint.get("name", f"Sprint {sprint_id}"),
            committed=committed_points,
            completed=completed_points,
        ))

    # Calculate average velocity
    average_velocity = total_completed / len(sprints) if sprints else 0.0

    return VelocityChartResponse(
        sprints=velocity_data,
        average_velocity=round(average_velocity, 1),
    )


@router.get("/{project_id}/reports/sprint-report", response_model=SprintReportResponse)
async def get_sprint_report(
    project_id: int,
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
    sprint_id: int = Query(..., description="Sprint ID"),
):
    """Get comprehensive sprint report.

    Shows:
    - Completed issues
    - Incomplete issues
    - Issues added mid-sprint
    - Issues removed mid-sprint
    - Completion metrics

    Returns:
        Sprint summary with issue lists and metrics
    """
    await verify_project_access(project_id, current_user.id, db, current_user.role)

    # Get sprint info
    sprints_collection = db["sprints"]
    sprint = await sprints_collection.find_one({"sprint_number": sprint_id, "project_id": project_id})
    if not sprint:
        raise HTTPException(status_code=404, detail="Sprint not found")

    start_date = sprint.get("start_date")
    end_date = sprint.get("end_date")
    if not start_date or not end_date:
        raise HTTPException(status_code=400, detail="Sprint must have start and end dates")

    start = start_date.date() if isinstance(start_date, datetime) else start_date
    end = end_date.date() if isinstance(end_date, datetime) else end_date

    # Get all tickets in sprint
    tickets_collection = db["tickets"]
    tickets = await tickets_collection.find({
        "project_id": project_id,
        "sprint_id": sprint_id
    }).to_list(length=None)

    # Get done statuses
    statuses_collection = db["ticket_statuses"]
    done_statuses = await statuses_collection.find({
        "project_id": project_id,
        "name": {"$in": ["Done", "Closed", "Completed"]}
    }).to_list(length=None)
    done_status_ids = {s.get("status_number") for s in done_statuses}

    # Categorize issues
    completed_issues = []
    incomplete_issues = []
    added_issues = []
    removed_issues = []

    total_committed_points = 0
    total_completed_points = 0

    for ticket in tickets:
        ticket_id = ticket.get("ticket_number")
        ticket_points = ticket.get("story_points", 0)

        # Build issue summary
        assignee = None
        ae = ticket.get("assignee_email")
        if ae:
            assignee = await get_user_info_by_email(db, ae)
        elif ticket.get("assignee_id"):
            assignee = await get_user_info(db, ticket.get("assignee_id"))

        issue = SprintReportIssue(
            id=ticket_id,
            key=ticket.get("key"),
            title=ticket.get("title"),
            type=ticket.get("type"),
            status_name=await get_status_name(db, ticket.get("status_id")),
            story_points=ticket_points,
            assignee=assignee,
        )

        # Check if completed
        is_completed = ticket.get("status_id") in done_status_ids

        # Check if added mid-sprint (created after sprint start)
        created_at = ticket.get("created_at")
        if created_at:
            created_date = created_at.date() if isinstance(created_at, datetime) else created_at
            if created_date > start:
                added_issues.append(issue)

        # Categorize as completed or incomplete
        if is_completed:
            completed_issues.append(issue)
            total_completed_points += ticket_points
        else:
            incomplete_issues.append(issue)

        total_committed_points += ticket_points

    # Calculate completion percentage
    completion_percentage = (total_completed_points / total_committed_points * 100) if total_committed_points > 0 else 0.0

    return SprintReportResponse(
        sprint_id=sprint_id,
        sprint_name=sprint.get("name", f"Sprint {sprint_id}"),
        start_date=start,
        end_date=end,
        completed_issues=completed_issues,
        incomplete_issues=incomplete_issues,
        added_issues=added_issues,
        removed_issues=removed_issues,
        total_committed_points=total_committed_points,
        total_completed_points=total_completed_points,
        completion_percentage=round(completion_percentage, 1),
    )
