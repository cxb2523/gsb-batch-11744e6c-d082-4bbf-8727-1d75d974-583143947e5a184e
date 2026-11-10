"""
Status reports API endpoints.
"""

import logging
from typing import Annotated, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from motor.motor_asyncio import AsyncIOMotorDatabase

logger = logging.getLogger(__name__)

from ..core.security import get_current_user, CurrentUser
from ..db.mongo import get_mongo_db
from ..services import status_reports as status_reports_service
from ..services import comprehensive_status_reports as comprehensive_reports_service
from ..services import standup_reports as standup_reports_service
from ..services import enhanced_standup_service

router = APIRouter(prefix="/status-reports", tags=["Status Reports"])


async def _check_project_access(
    db: AsyncIOMotorDatabase,
    user: CurrentUser,
    project_id: int
) -> None:
    """Check if user has access to the project."""
    if user.role == "admin":
        return

    # Check if user is a member of the project
    member = await db["project_members"].find_one({
        "project_id": project_id,
        "user_id": user.id,
        "$or": [{"active": True}, {"active": {"$exists": False}}]
    })

    if not member:
        # Check if user is the project owner
        project = await db["projects"].find_one({"project_number": project_id})
        if not project or project.get("owner_id") != user.id:
            raise HTTPException(status_code=403, detail="Access denied to this project")


@router.get("/project/{project_id}")
async def get_project_status_report(
    project_id: int,
    period: Annotated[str, Query(description="Report period: 'daily' or 'weekly'")] = "weekly",
    user: Annotated[CurrentUser, Depends(get_current_user)] = None,
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)] = None,
) -> dict:
    """
    Get status report for a specific project.

    The report focuses on ticket creation metrics only, showing:
    - Daily or weekly ticket creation counts
    - Breakdown by type, priority, and assignee
    - Trends and comparisons with previous periods
    - Top contributors
    """
    if period not in ["daily", "weekly"]:
        raise HTTPException(status_code=400, detail="Period must be 'daily' or 'weekly'")

    await _check_project_access(db, user, project_id)

    report = await status_reports_service.get_status_report(db, project_id, period)
    return report


@router.get("/compare")
async def get_comparison_report(
    project_ids: Annotated[List[int], Query(description="Comma-separated list of project IDs")],
    period: Annotated[str, Query(description="Report period: 'daily' or 'weekly'")] = "weekly",
    user: Annotated[CurrentUser, Depends(get_current_user)] = None,
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)] = None,
) -> dict:
    """
    Get comparison report across multiple projects.

    Compare ticket creation metrics across selected projects.
    Only accessible by admin users or project members.
    """
    if period not in ["daily", "weekly"]:
        raise HTTPException(status_code=400, detail="Period must be 'daily' or 'weekly'")

    # Admin can compare any projects
    if user.role != "admin":
        # Non-admin users can only compare projects they have access to
        for project_id in project_ids:
            try:
                await _check_project_access(db, user, project_id)
            except HTTPException:
                raise HTTPException(
                    status_code=403,
                    detail=f"You don't have access to project {project_id}"
                )

    if len(project_ids) > 10:
        raise HTTPException(status_code=400, detail="Maximum 10 projects can be compared at once")

    report = await status_reports_service.get_comparison_report(db, project_ids, period)
    return report


@router.get("/my-projects")
async def get_my_projects_status(
    period: Annotated[str, Query(description="Report period: 'daily' or 'weekly'")] = "weekly",
    user: Annotated[CurrentUser, Depends(get_current_user)] = None,
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)] = None,
) -> dict:
    """
    Get status report for all projects the current user has access to.

    Shows ticket creation metrics across all user's projects.
    """
    if period not in ["daily", "weekly"]:
        raise HTTPException(status_code=400, detail="Period must be 'daily' or 'weekly'")

    # Get user's projects
    if user.role == "admin":
        # Admin sees all projects
        projects = await db["projects"].find({}).to_list(length=100)
        project_ids = [p["project_number"] for p in projects]
    else:
        # Get projects where user is a member
        memberships = await db["project_members"].find({
            "user_id": user.id,
            "$or": [{"active": True}, {"active": {"$exists": False}}]
        }).to_list(length=100)
        member_project_ids = [m["project_id"] for m in memberships]

        # Get projects where user is owner
        owned_projects = await db["projects"].find({"owner_id": user.id}).to_list(length=100)
        owned_project_ids = [p["project_number"] for p in owned_projects]

        # Combine both lists
        project_ids = list(set(member_project_ids + owned_project_ids))

    if not project_ids:
        return {
            "generated_at": None,
            "period": period,
            "projects": [],
            "summary": {
                "total_projects": 0,
                "total_tickets_created": 0,
                "most_active_project": None
            }
        }

    report = await status_reports_service.get_comparison_report(db, project_ids, period)
    return report

@router.get("/comprehensive/{project_id}")
async def get_comprehensive_status_report(
    project_id: int,
    period: Annotated[str, Query(description="Report period: 'daily' or 'weekly'")] = "weekly",
    user: Annotated[CurrentUser, Depends(get_current_user)] = None,
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)] = None,
) -> dict:
    """
    Get comprehensive status report with per-status metrics and transitions.

    This report includes:
    - Detailed breakdown for each status (blocked, in-progress, done, etc.)
    - Transition metrics showing how tickets move between statuses
    - Assignee metrics showing work distribution
    - Velocity and trend analysis
    """
    if period not in ["daily", "weekly"]:
        raise HTTPException(status_code=400, detail="Period must be 'daily' or 'weekly'")

    await _check_project_access(db, user, project_id)

    report = await comprehensive_reports_service.get_comprehensive_status_report(db, project_id, period)
    return report


@router.get("/standup/{project_id}")
async def get_standup_report(
    project_id: int,
    assignee_id: Annotated[Optional[int], Query(description="Optional user ID to filter by assignee")] = None,
    user: Annotated[CurrentUser, Depends(get_current_user)] = None,
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)] = None,
) -> dict:
    """
    Get stand-up focused status report designed for morning stand-ups.

    This report includes:
    - Yesterday's activity (what was completed and worked on)
    - Today's priorities (what's in progress and newly created)
    - Blockers and impediments (currently blocked tickets)
    - Status transitions with regression detection (Done → Blocked is flagged as critical)

    If assignee_id is provided, filters to show only that user's tickets.
    """
    await _check_project_access(db, user, project_id)

    # If no assignee specified, default to current user (unless they're admin viewing all)
    if assignee_id is None and user.role != "admin":
        assignee_id = user.id

    report = await standup_reports_service.get_standup_report(db, project_id, assignee_id)
    return report


@router.get("/standup/team/{project_id}")
async def get_team_standup_report(
    project_id: int,
    user: Annotated[CurrentUser, Depends(get_current_user)] = None,
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)] = None,
) -> dict:
    """
    Get team-wide stand-up report with per-member breakdowns.

    This report includes:
    - Overall project metrics
    - Individual reports for each team member
    - Team summary showing who's active, who has blockers, etc.

    Perfect for team stand-ups where everyone shares their updates.
    """
    await _check_project_access(db, user, project_id)

    report = await standup_reports_service.get_team_standup_report(db, project_id)
    return report


@router.get("/enhanced-standup/{project_id}")
async def get_enhanced_standup_report(
    project_id: int,
    hours: Annotated[int, Query(description="Time window in hours (default 24)")] = 24,
    user: Annotated[CurrentUser, Depends(get_current_user)] = None,
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)] = None,
) -> dict:
    """
    Get enhanced stand-up report with project-specific status tracking and transition metrics.

    This comprehensive report includes:
    - **Status Movements**: Tickets moved TO/FROM each status in the time window
    - **Transition Matrix**: Shows flows between statuses (e.g., Todo → In Progress → Done)
    - **Current Snapshot**: How many tickets are in each status right now, broken down by type and assignee
    - **Velocity Metrics**: Throughput (tickets completed per day), WIP (work in progress)
    - **Blockers**: Tickets currently blocked, duration blocked, critical blockers (>3 days)
    - **Regressions**: Concerning transitions like Done → Blocked (flagged as critical)
    - **Stale Tickets**: Tickets with no activity in 7+ days
    - **Team Activity**: Who moved tickets, who completed work, who has blockers
    - **Time in Status**: Average time tickets spend in each status

    **Adapts to project-specific statuses** - no hardcoded status names!

    Args:
        project_id: Project ID
        hours: Time window in hours (default 24 for daily standup, use 168 for weekly)

    Returns:
        Comprehensive standup report with all metrics
    """
    await _check_project_access(db, user, project_id)

    try:
        report = await enhanced_standup_service.get_enhanced_standup_report(db, project_id, hours)
        return report
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to generate enhanced standup report: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to generate report")
