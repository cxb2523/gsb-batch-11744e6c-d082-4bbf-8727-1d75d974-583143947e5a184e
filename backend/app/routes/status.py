from typing import Annotated
from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from ..db.mongo import get_mongo_db
from ..core.security import get_current_user, CurrentUser
from ..routes.projects import verify_project_access

# IST timezone
IST = ZoneInfo("Asia/Kolkata")


# Helper function to get status IDs by category
async def get_status_ids_by_category(db: AsyncIOMotorDatabase, project_id: int):
    """Get status IDs and names categorized by done, in-progress, blocked, and todo using simple keyword matching."""
    status_collection = db["ticket_statuses"]
    all_statuses = await status_collection.find({"project_id": project_id}).to_list(length=None)

    done_status_ids = []
    done_status_names = []
    in_progress_status_ids = []
    in_progress_status_names = []
    blocked_status_ids = []
    blocked_status_names = []
    todo_status_ids = []
    todo_status_names = []

    for status in all_statuses:
        status_name = status.get("name", "")
        status_id = status.get("status_number")
        status_lower = status_name.lower()

        # Simple keyword matching on exact status names from project
        if "done" in status_lower or "completed" in status_lower or "closed" in status_lower:
            if status_id:
                done_status_ids.append(status_id)
            done_status_names.append(status_name)
        elif "in progress" in status_lower or "in-progress" in status_lower:
            if status_id:
                in_progress_status_ids.append(status_id)
            in_progress_status_names.append(status_name)
        elif "block" in status_lower:
            if status_id:
                blocked_status_ids.append(status_id)
            blocked_status_names.append(status_name)
        elif "todo" in status_lower or "to do" in status_lower or "backlog" in status_lower:
            if status_id:
                todo_status_ids.append(status_id)
            todo_status_names.append(status_name)

    return {
        "done_ids": done_status_ids,
        "done_names": done_status_names,
        "in_progress_ids": in_progress_status_ids,
        "in_progress_names": in_progress_status_names,
        "blocked_ids": blocked_status_ids,
        "blocked_names": blocked_status_names,
        "todo_ids": todo_status_ids,
        "todo_names": todo_status_names
    }


router = APIRouter(prefix="/status", tags=["status"])


async def get_member_activity(
    db: AsyncIOMotorDatabase,
    project_id: int,
    start_time: datetime,
    end_time: datetime
):
    """Get member activity for a given time period."""
    tickets_collection = db["tickets"]
    users_collection = db["users"]
    ticket_history_collection = db["ticket_history"]

    # Get all project members
    members_collection = db["project_members"]
    project_members = await members_collection.find({
        "project_id": project_id,
        "$or": [
            {"active": True},
            {"active": {"$exists": False}}
        ]
    }).to_list(length=None)

    # Also get all unique assignees from tickets to include everyone with assignments
    all_tickets = await tickets_collection.find({"project_id": project_id}).to_list(length=None)
    assignee_ids_from_tickets: set = set()
    assignee_emails_from_tickets: set = set()
    for ticket in all_tickets:
        if ticket.get("assignee_id"):
            assignee_ids_from_tickets.add(ticket.get("assignee_id"))
        if ticket.get("assignee_email"):
            assignee_emails_from_tickets.add(ticket.get("assignee_email"))

    # Resolve any email-only assignees back to user_number so we can keep the
    # rest of this routine keyed on user_number.
    for email in assignee_emails_from_tickets:
        u = await users_collection.find_one({"email": email})
        if u and u.get("user_number"):
            assignee_ids_from_tickets.add(u.get("user_number"))

    # Combine member IDs and assignee IDs
    all_user_ids = set()
    for member in project_members:
        if member.get("user_id"):
            all_user_ids.add(member.get("user_id"))
        elif member.get("user_email"):
            u = await users_collection.find_one({"email": member.get("user_email")})
            if u and u.get("user_number"):
                all_user_ids.add(u.get("user_number"))
    all_user_ids.update(assignee_ids_from_tickets)

    member_activities = []

    for user_id in all_user_ids:
        # Get user info
        user = await users_collection.find_one({"user_number": user_id})
        if not user:
            continue

        user_name = user.get("name", "Unknown User")
        user_email = user.get("email")

        # Count tickets created by this user in this period
        tickets_created = await tickets_collection.count_documents({
            "project_id": project_id,
            "$or": [{"reporter_email": user_email}, {"reporter_id": user_id}],
            "created_at": {"$gte": start_time, "$lte": end_time}
        })

        # Count tickets assigned to this user that were updated in this period
        # First, get all tickets assigned to this user
        assigned_tickets = await tickets_collection.find({
            "project_id": project_id,
            "$or": [{"assignee_email": user_email}, {"assignee_id": user_id}],
        }).to_list(length=None)
        assigned_ticket_ids = [t.get("ticket_number") for t in assigned_tickets]

        # Then count history entries for these tickets in the time period
        tickets_updated = await ticket_history_collection.count_documents({
            "project_id": project_id,
            "ticket_id": {"$in": assigned_ticket_ids},
            "changed_at": {"$gte": start_time, "$lte": end_time}
        })

        # Count tickets assigned to this user that were completed in this period
        # Find tickets that transitioned to "Done" status during this period
        statuses = await get_status_ids_by_category(db, project_id)

        # Find history entries where tickets assigned to this user changed to done (check both status_id and status fields)
        completed_changes = await ticket_history_collection.find({
            "project_id": project_id,
            "ticket_id": {"$in": assigned_ticket_ids},  # Use assigned tickets
            "$or": [
                {
                    "field_name": "status_id",
                    "new_value": {"$in": [str(sid) for sid in statuses["done_ids"]]}
                },
                {
                    "field_name": "status",
                    "new_value": {"$in": statuses["done_names"]}
                }
            ],
            "changed_at": {"$gte": start_time, "$lte": end_time}
        }).to_list(length=None)

        tickets_completed = len(completed_changes)

        # Calculate story points completed
        completed_ticket_ids = [ch.get("ticket_id") for ch in completed_changes]
        completed_tickets = await tickets_collection.find({
            "ticket_number": {"$in": completed_ticket_ids},
            "project_id": project_id
        }).to_list(length=None)

        story_points_completed = sum(
            ticket.get("story_points", 0) or 0
            for ticket in completed_tickets
        )

        # Count active tickets assigned to this user (not done)
        active_tickets = await tickets_collection.count_documents({
            "project_id": project_id,
            "$or": [{"assignee_email": user_email}, {"assignee_id": user_id}],
            "$and": [
                {"status_id": {"$nin": statuses["done_ids"]}},
                {"status": {"$nin": statuses["done_names"]}}
            ]
        })

        member_activities.append({
            "user_id": user_id,
            "user_name": user_name,
            "tickets_created": tickets_created,
            "tickets_updated": tickets_updated,
            "tickets_completed": tickets_completed,
            "story_points_completed": story_points_completed,
            "active_tickets": active_tickets
        })

    # Sort by total activity (created + updated + completed)
    member_activities.sort(
        key=lambda x: x["tickets_created"] + x["tickets_updated"] + x["tickets_completed"],
        reverse=True
    )

    return member_activities


async def calculate_project_health(
    db: AsyncIOMotorDatabase,
    project_id: int
):
    """Calculate project health metrics."""
    tickets_collection = db["tickets"]
    projects_collection = db["projects"]
    status_collection = db["ticket_statuses"]

    # Get project info
    project = await projects_collection.find_one({"project_number": project_id})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Get all statuses for this project
    statuses = await get_status_ids_by_category(db, project_id)

    # Count tickets by status (check both status_id AND status fields)
    total_tickets = await tickets_collection.count_documents({"project_id": project_id})
    completed_tickets = await tickets_collection.count_documents({
        "project_id": project_id,
        "$or": [
            {"status_id": {"$in": statuses["done_ids"]}},
            {"status": {"$in": statuses["done_names"]}}
        ]
    })
    in_progress_tickets = await tickets_collection.count_documents({
        "project_id": project_id,
        "$or": [
            {"status_id": {"$in": statuses["in_progress_ids"]}},
            {"status": {"$in": statuses["in_progress_names"]}}
        ]
    })

    # Count blockers
    blockers_count = await tickets_collection.count_documents({
        "project_id": project_id,
        "labels": {"$in": ["Blocked", "blocked", "blocker", "Blocker"]}
    })

    # Calculate completion rate
    completion_rate = (completed_tickets / total_tickets * 100) if total_tickets > 0 else 0

    # Calculate velocity (story points completed in last 7 days)
    seven_days_ago = datetime.now(IST) - timedelta(days=7)
    ticket_history_collection = db["ticket_history"]

    # Find tickets completed in last 7 days (check both status_id and status fields)
    completed_changes = await ticket_history_collection.find({
        "project_id": project_id,
        "$or": [
            {
                "field_name": "status_id",
                "new_value": {"$in": [str(sid) for sid in statuses["done_ids"]]}
            },
            {
                "field_name": "status",
                "new_value": {"$in": statuses["done_names"]}
            }
        ],
        "changed_at": {"$gte": seven_days_ago}
    }).to_list(length=None)

    completed_ticket_ids = [ch.get("ticket_id") for ch in completed_changes]
    completed_tickets_list = await tickets_collection.find({
        "ticket_number": {"$in": completed_ticket_ids},
        "project_id": project_id
    }).to_list(length=None)

    story_points_last_week = sum(
        ticket.get("story_points", 0) or 0
        for ticket in completed_tickets_list
    )
    velocity = story_points_last_week  # Story points per week

    # Calculate days until deadline
    days_until_deadline = None
    if project.get("deadline"):
        deadline = project.get("deadline")
        # Ensure deadline is timezone-aware in IST
        if deadline.tzinfo is None:
            deadline = deadline.replace(tzinfo=IST)
        now = datetime.now(IST)
        days_until_deadline = (deadline - now).days

    # Generate warnings
    warnings = []

    if blockers_count > 0:
        warnings.append(f"{blockers_count} ticket(s) are blocked and need attention")

    if days_until_deadline is not None and days_until_deadline < 7:
        warnings.append(f"Deadline is in {days_until_deadline} days")

    if completion_rate < 25 and days_until_deadline is not None and days_until_deadline < 30:
        warnings.append("Low completion rate with approaching deadline")

    if velocity == 0 and in_progress_tickets > 0:
        warnings.append("No tickets completed in the last 7 days despite ongoing work")

    # Calculate health score (0-100)
    score = 0

    # Completion rate contributes 40 points
    score += completion_rate * 0.4

    # Velocity contributes 30 points (assume 10+ points per week is excellent)
    velocity_score = min(velocity / 10 * 30, 30)
    score += velocity_score

    # Lack of blockers contributes 20 points
    if blockers_count == 0:
        score += 20
    elif blockers_count <= 2:
        score += 10

    # Timeline health contributes 10 points
    if days_until_deadline is None:
        score += 10  # No deadline pressure
    elif days_until_deadline > 30:
        score += 10
    elif days_until_deadline > 7:
        score += 5

    # Determine status based on score
    if score >= 80:
        health_status = "excellent"
    elif score >= 60:
        health_status = "on-track"
    elif score >= 40:
        health_status = "at-risk"
    else:
        health_status = "critical"

    return {
        "score": round(score, 1),
        "status": health_status,
        "velocity": velocity,
        "completion_rate": round(completion_rate, 1),
        "days_until_deadline": days_until_deadline,
        "blockers_count": blockers_count,
        "warnings": warnings
    }


@router.get("/project/{project_id}")
async def get_project_status(
    project_id: int,
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    """Generate comprehensive status report for a project."""

    # Verify user has access to this project
    has_access = await verify_project_access(
        project_id=project_id,
        user_id=current_user.id,
        db=db,
        user_role=current_user.role
    )

    if not has_access:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have access to this project"
        )

    # Get project info
    projects_collection = db["projects"]
    project = await projects_collection.find_one({"project_number": project_id})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    tickets_collection = db["tickets"]
    status_collection = db["ticket_statuses"]

    now = datetime.now(IST)

    # Get done status IDs
    statuses = await get_status_ids_by_category(db, project_id)

    # Daily changes (last 24 hours)
    one_day_ago = now - timedelta(days=1)

    # Get actual tickets created in last 24 hours
    daily_created_tickets = await tickets_collection.find({
        "project_id": project_id,
        "created_at": {"$gte": one_day_ago}
    }).sort("created_at", -1).to_list(length=None)

    ticket_history_collection = db["ticket_history"]
    users_collection = db["users"]

    # Get tickets that were updated (any change) in last 24 hours
    daily_history = await ticket_history_collection.find({
        "project_id": project_id,
        "changed_at": {"$gte": one_day_ago}
    }).to_list(length=None)

    updated_ticket_ids = list(set([h.get("ticket_id") for h in daily_history]))
    daily_updated_tickets = await tickets_collection.find({
        "project_id": project_id,
        "ticket_number": {"$in": updated_ticket_ids}
    }).to_list(length=None)

    # Get tickets completed in last 24 hours (check both status_id and status fields)
    daily_completed_changes = await ticket_history_collection.find({
        "project_id": project_id,
        "$or": [
            {
                "field_name": "status_id",
                "new_value": {"$in": [str(sid) for sid in statuses["done_ids"]]}
            },
            {
                "field_name": "status",
                "new_value": {"$in": statuses["done_names"]}
            }
        ],
        "changed_at": {"$gte": one_day_ago}
    }).to_list(length=None)

    completed_ticket_ids = [ch.get("ticket_id") for ch in daily_completed_changes]
    daily_completed_tickets = await tickets_collection.find({
        "project_id": project_id,
        "ticket_number": {"$in": completed_ticket_ids}
    }).to_list(length=None)

    # Format ticket summaries
    async def format_ticket(ticket):
        assignee = None
        ae = ticket.get("assignee_email")
        if ae:
            assignee_user = await users_collection.find_one({"email": ae})
            if assignee_user:
                assignee = assignee_user.get("name")
            else:
                assignee = ae.split("@")[0] if "@" in ae else ae
        elif ticket.get("assignee_id"):
            assignee_user = await users_collection.find_one({"user_number": ticket.get("assignee_id")})
            if assignee_user:
                assignee = assignee_user.get("name")

        ticket_status = await status_collection.find_one({"status_number": ticket.get("status_id")})

        return {
            "id": ticket.get("ticket_number"),
            "key": f"{project.get('key')}-{ticket.get('ticket_number')}",
            "title": ticket.get("title"),
            "type": ticket.get("type", "Task"),
            "status": ticket_status.get("name") if ticket_status else "Unknown",
            "assignee": assignee,
            "story_points": ticket.get("story_points"),
            "labels": ticket.get("labels", [])
        }

    daily_created_summaries = [await format_ticket(t) for t in daily_created_tickets]
    daily_updated_summaries = [await format_ticket(t) for t in daily_updated_tickets]
    daily_completed_summaries = [await format_ticket(t) for t in daily_completed_tickets]

    daily_tickets_created = len(daily_created_tickets)
    daily_tickets_updated = len(daily_updated_tickets)
    daily_completed = len(daily_completed_tickets)

    # Get overdue tickets (due_date < today and not completed)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    overdue_tickets = await tickets_collection.find({
        "project_id": project_id,
        "due_date": {"$exists": True, "$ne": None, "$lt": today_start},
        "$and": [
            {"status_id": {"$nin": statuses["done_ids"]}},
            {"status": {"$nin": statuses["done_names"]}}
        ]
    }).sort("due_date", 1).to_list(length=None)

    # Get tickets with deadline today (due_date = today and not completed)
    today_end = today_start + timedelta(days=1)
    deadline_today_tickets = await tickets_collection.find({
        "project_id": project_id,
        "due_date": {"$exists": True, "$ne": None, "$gte": today_start, "$lt": today_end},
        "$and": [
            {"status_id": {"$nin": statuses["done_ids"]}},
            {"status": {"$nin": statuses["done_names"]}}
        ]
    }).sort("priority", -1).to_list(length=None)

    # Format overdue and deadline today tickets
    async def format_ticket_with_due_date(ticket):
        ticket_data = await format_ticket(ticket)
        if ticket.get("due_date"):
            due_date = ticket.get("due_date")
            # Ensure due_date is timezone-aware in IST
            if due_date.tzinfo is None:
                due_date = due_date.replace(tzinfo=IST)
            elif due_date.tzinfo != IST:
                # Convert to IST if it's in a different timezone
                due_date = due_date.astimezone(IST)

            ticket_data["due_date"] = due_date.isoformat()
            # Calculate days overdue
            days_diff = (now - due_date).days
            ticket_data["days_overdue"] = days_diff if days_diff > 0 else 0
        ticket_data["priority"] = ticket.get("priority", "Medium")
        return ticket_data

    overdue_summaries = [await format_ticket_with_due_date(t) for t in overdue_tickets]
    deadline_today_summaries = [await format_ticket_with_due_date(t) for t in deadline_today_tickets]

    daily_member_activities = await get_member_activity(db, project_id, one_day_ago, now)

    # Weekly changes (last 7 days)
    seven_days_ago = now - timedelta(days=7)
    weekly_tickets_created = await tickets_collection.count_documents({
        "project_id": project_id,
        "created_at": {"$gte": seven_days_ago}
    })

    weekly_tickets_updated = await ticket_history_collection.count_documents({
        "project_id": project_id,
        "changed_at": {"$gte": seven_days_ago}
    })

    weekly_completed = await ticket_history_collection.count_documents({
        "project_id": project_id,
        "$or": [
            {
                "field_name": "status_id",
                "new_value": {"$in": [str(sid) for sid in statuses["done_ids"]]}
            },
            {
                "field_name": "status",
                "new_value": {"$in": statuses["done_names"]}
            }
        ],
        "changed_at": {"$gte": seven_days_ago}
    })

    weekly_member_activities = await get_member_activity(db, project_id, seven_days_ago, now)

    # Overall progress
    total_tickets = await tickets_collection.count_documents({"project_id": project_id})
    completed_tickets = await tickets_collection.count_documents({
        "project_id": project_id,
        "$or": [
            {"status_id": {"$in": statuses["done_ids"]}},
            {"status": {"$in": statuses["done_names"]}}
        ]
    })
    in_progress_tickets = await tickets_collection.count_documents({
        "project_id": project_id,
        "$or": [
            {"status_id": {"$in": statuses["in_progress_ids"]}},
            {"status": {"$in": statuses["in_progress_names"]}}
        ]
    })
    todo_tickets = total_tickets - completed_tickets - in_progress_tickets

    # Calculate story points
    all_tickets = await tickets_collection.find({"project_id": project_id}).to_list(length=None)
    total_story_points = sum(ticket.get("story_points", 0) or 0 for ticket in all_tickets)

    completed_tickets_list = await tickets_collection.find({
        "project_id": project_id,
        "$or": [
            {"status_id": {"$in": statuses["done_ids"]}},
            {"status": {"$in": statuses["done_names"]}}
        ]
    }).to_list(length=None)
    completed_story_points = sum(ticket.get("story_points", 0) or 0 for ticket in completed_tickets_list)

    # Calculate project health
    health = await calculate_project_health(db, project_id)

    # Get epic statistics — epics live in tickets with type=epic
    all_epics = await tickets_collection.find(
        {"project_id": project_id, "type": "epic"}
    ).to_list(length=None)

    epic_stats = []
    for epic in all_epics:
        epic_id = epic.get("ticket_number")

        # Get tickets for this epic
        epic_tickets = await tickets_collection.find({
            "project_id": project_id,
            "epic_id": epic_id
        }).to_list(length=None)

        total_epic_tickets = len(epic_tickets)
        # Check both status_id and status fields
        completed_epic_tickets = len([
            t for t in epic_tickets
            if t.get("status_id") in statuses["done_ids"] or t.get("status") in statuses["done_names"]
        ])
        in_progress_epic_tickets = len([
            t for t in epic_tickets
            if t.get("status_id") in statuses["in_progress_ids"] or t.get("status") in statuses["in_progress_names"]
        ])
        todo_epic_tickets = total_epic_tickets - completed_epic_tickets - in_progress_epic_tickets

        total_epic_points = sum(t.get("story_points", 0) or 0 for t in epic_tickets)
        completed_epic_points = sum(
            t.get("story_points", 0) or 0 for t in epic_tickets
            if t.get("status_id") in statuses["done_ids"] or t.get("status") in statuses["done_names"]
        )

        completion_percentage = (completed_epic_tickets / total_epic_tickets * 100) if total_epic_tickets > 0 else 0

        epic_stats.append({
            "id": epic_id,
            "title": epic.get("title"),
            "description": epic.get("description"),
            "status": epic.get("status"),
            "color": epic.get("epic_color") or epic.get("color"),
            "total_tickets": total_epic_tickets,
            "completed_tickets": completed_epic_tickets,
            "in_progress_tickets": in_progress_epic_tickets,
            "todo_tickets": todo_epic_tickets,
            "total_story_points": total_epic_points,
            "completed_story_points": completed_epic_points,
            "completion_percentage": round(completion_percentage, 1)
        })

    return {
        "project_id": project_id,
        "project_name": project.get("name"),
        "project_key": project.get("key"),
        "generated_at": now.isoformat(),
        "overdue_tickets": overdue_summaries,
        "deadline_today_tickets": deadline_today_summaries,
        "daily": {
            "tickets_created": daily_tickets_created,
            "tickets_updated": daily_tickets_updated,
            "tickets_completed": daily_completed,
            "created_tickets": daily_created_summaries,
            "updated_tickets": daily_updated_summaries,
            "completed_tickets": daily_completed_summaries,
            "member_activities": daily_member_activities
        },
        "weekly": {
            "tickets_created": weekly_tickets_created,
            "tickets_updated": weekly_tickets_updated,
            "tickets_completed": weekly_completed,
            "member_activities": weekly_member_activities
        },
        "overall": {
            "total_tickets": total_tickets,
            "completed_tickets": completed_tickets,
            "in_progress_tickets": in_progress_tickets,
            "todo_tickets": todo_tickets,
            "total_story_points": total_story_points,
            "completed_story_points": completed_story_points
        },
        "epics": epic_stats,
        "health": health
    }
