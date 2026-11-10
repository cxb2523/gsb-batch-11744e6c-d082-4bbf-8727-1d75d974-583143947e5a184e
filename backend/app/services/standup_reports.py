"""
Stand-up focused status report generation with real-time transition tracking.

Designed specifically for morning stand-ups with:
- Yesterday's activity (what was done)
- Today's priorities (what's planned)
- Blockers and impediments (what's blocking progress)
- Status transitions with regression detection (Done → Blocked is critical)
"""

import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional
from collections import defaultdict

from motor.motor_asyncio import AsyncIOMotorDatabase

logger = logging.getLogger(__name__)


async def get_standup_report(
    db: AsyncIOMotorDatabase,
    project_id: int,
    assignee_id: Optional[int] = None,
    date: Optional[datetime] = None
) -> dict[str, Any]:
    """
    Generate a stand-up focused status report.

    Args:
        db: MongoDB database instance
        project_id: Project ID to generate report for
        assignee_id: Optional user ID to filter by assignee (for individual stand-ups)
        date: Optional date for the stand-up (defaults to today)

    Returns:
        Dictionary containing stand-up formatted metrics
    """
    now = date or datetime.now(timezone.utc)

    # Define time periods for stand-up
    # Yesterday: previous working day (24 hours ago)
    yesterday_start = (now - timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
    yesterday_end = (now - timedelta(days=1)).replace(hour=23, minute=59, second=59, microsecond=999999)

    # Today: current day so far
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    today_end = now

    # Last 7 days for trend analysis
    week_start = (now - timedelta(days=7)).replace(hour=0, minute=0, second=0, microsecond=0)

    # Build email -> user_number mapping so we can normalize email-only tickets
    users = await db["users"].find({}).to_list(length=None)
    user_map = {u.get("user_number"): u.get("name", u.get("email", f"User {u.get('user_number')}")) for u in users}
    email_to_user_number = {u.get("email"): u.get("user_number") for u in users if u.get("email")}

    # Resolve the optional assignee filter via email-first, fall back to id
    target_email: Optional[str] = None
    if assignee_id:
        target_user = next((u for u in users if u.get("user_number") == assignee_id), None)
        target_email = target_user.get("email") if target_user else None

    # Fetch all tickets for the project
    ticket_filter: dict = {"project_id": project_id}
    if assignee_id:
        if target_email:
            ticket_filter["$or"] = [{"assignee_email": target_email}, {"assignee_id": assignee_id}]
        else:
            ticket_filter["assignee_id"] = assignee_id

    all_tickets = await db["tickets"].find(ticket_filter).to_list(length=None)

    def ticket_assignee_uid(ticket: Dict[str, Any]) -> Optional[int]:
        """Normalize a ticket's assignee to a user_number, preferring email."""
        ae = ticket.get("assignee_email")
        if ae:
            return email_to_user_number.get(ae)
        return ticket.get("assignee_id")

    # Fetch project members for assignee information
    members = await db["project_members"].find({
        "project_id": project_id,
        "$or": [{"active": True}, {"active": {"$exists": False}}]
    }).to_list(length=None)

    # Build member map
    member_map = {}
    for m in members:
        uid = m.get("user_id")
        if not uid and m.get("user_email"):
            uid = email_to_user_number.get(m.get("user_email"))
        if uid:
            member_map[uid] = m.get("name", user_map.get(uid, f"User {uid}"))

    # Add any users who have tickets assigned but aren't project members
    for ticket in all_tickets:
        assignee = ticket_assignee_uid(ticket)
        if assignee and assignee not in member_map:
            member_map[assignee] = user_map.get(assignee, f"User {assignee}")

    # Fetch actual project statuses from ticket_statuses collection
    project_statuses = await db["ticket_statuses"].find({"project_id": project_id}).to_list(length=None)

    # Build a map of status_id to status name for tickets that use status_id
    status_id_to_name = {}
    all_status_names = set()

    # Keep track of which statuses represent "done" based on exact names only
    # This allows showing actual status names while still grouping completed tickets
    done_statuses = set()
    in_progress_statuses = set()
    blocked_statuses = set()
    todo_statuses = set()

    for status in project_statuses:
        status_name = status.get("name", "")
        status_id = status.get("status_number")

        if status_id:
            status_id_to_name[status_id] = status_name
        if status_name:
            all_status_names.add(status_name)

            # Simple matching - just use the exact status names from the project
            # Add to done if status name contains these exact keywords
            status_lower = status_name.lower()
            if "done" in status_lower or "completed" in status_lower or "closed" in status_lower:
                done_statuses.add(status_name)
            elif "in progress" in status_lower or "in-progress" in status_lower:
                in_progress_statuses.add(status_name)
            elif "block" in status_lower:
                blocked_statuses.add(status_name)
            elif "todo" in status_lower or "to do" in status_lower or "backlog" in status_lower:
                todo_statuses.add(status_name)

    logger.debug(f"Project {project_id} has {len(all_status_names)} statuses: {all_status_names}")
    logger.debug(f"Categorized as done: {done_statuses}")
    logger.debug(f"Categorized as in-progress: {in_progress_statuses}")
    logger.debug(f"Categorized as blocked: {blocked_statuses}")

    # Helper function to get actual status name from ticket
    def get_ticket_status(ticket: Dict[str, Any]) -> str:
        """Get the actual status name from a ticket, handling both status and status_id fields."""
        # First check if ticket has direct status field (string)
        if "status" in ticket and isinstance(ticket["status"], str):
            return ticket["status"]
        # Otherwise check status_id and map to name
        elif "status_id" in ticket:
            return status_id_to_name.get(ticket["status_id"], "Unknown")
        return "Unknown"

    # Fetch ALL ticket history for the project (we need full history for transitions)
    history_filter = {"project_id": project_id}
    if assignee_id:
        # Get tickets assigned to this user (match either email or legacy id)
        user_ticket_ids = [t.get("ticket_number") for t in all_tickets if ticket_assignee_uid(t) == assignee_id]
        if user_ticket_ids:
            history_filter["ticket_id"] = {"$in": user_ticket_ids}

    all_history = await db["ticket_history"].find(history_filter).sort("changed_at", 1).to_list(length=None)

    # ==================== YESTERDAY'S ACTIVITY ====================
    # What was completed yesterday
    completed_yesterday = []
    for ticket in all_tickets:
        # Check if ticket was moved to done status yesterday
        ticket_history = [
            h for h in all_history
            if h.get("ticket_id") == ticket.get("ticket_number") and
            (h.get("field_name") == "status" or h.get("field") == "status")
        ]

        for history_item in ticket_history:
            new_status = history_item.get("new_value", "")
            changed_at = history_item.get("changed_at")

            if changed_at and yesterday_start <= changed_at <= yesterday_end and new_status in done_statuses:
                completed_yesterday.append({
                    "ticket_id": ticket.get("ticket_number"),
                    "key": ticket.get("key"),
                    "title": ticket.get("title"),
                    "assignee": member_map.get(ticket_assignee_uid(ticket), "Unassigned") if ticket_assignee_uid(ticket) else "Unassigned",
                    "completed_at": changed_at.isoformat() if changed_at else None,
                    "type": ticket.get("type", "task"),
                    "priority": ticket.get("priority", "medium")
                })
                break

    # What was worked on yesterday (updated/transitioned but not completed)
    worked_on_yesterday = []
    for ticket in all_tickets:
        ticket_history = [
            h for h in all_history
            if h.get("ticket_id") == ticket.get("ticket_number") and
            h.get("changed_at") and
            yesterday_start <= h.get("changed_at") <= yesterday_end
        ]

        if ticket_history:
            # Check if ticket was NOT completed (to avoid duplicates)
            is_completed = any(
                h.get("new_value") in done_statuses and
                (h.get("field_name") == "status" or h.get("field") == "status")
                for h in ticket_history
            )

            if not is_completed:
                # Get the most recent status change
                status_changes = [
                    h for h in ticket_history
                    if h.get("field_name") == "status" or h.get("field") == "status"
                ]

                if status_changes:
                    latest_change = max(status_changes, key=lambda x: x.get("changed_at", datetime.min.replace(tzinfo=timezone.utc)))
                    worked_on_yesterday.append({
                        "ticket_id": ticket.get("ticket_number"),
                        "key": ticket.get("key"),
                        "title": ticket.get("title"),
                        "assignee": member_map.get(ticket_assignee_uid(ticket), "Unassigned") if ticket_assignee_uid(ticket) else "Unassigned",
                        "current_status": ticket.get("status", "Unknown"),
                        "status_changed_from": latest_change.get("old_value"),
                        "status_changed_to": latest_change.get("new_value"),
                        "updated_at": latest_change.get("changed_at").isoformat() if latest_change.get("changed_at") else None,
                        "type": ticket.get("type", "task"),
                        "priority": ticket.get("priority", "medium")
                    })

    # ==================== TODAY'S PRIORITIES ====================
    # What's in progress right now
    in_progress_now = []
    for ticket in all_tickets:
        current_status = ticket.get("status", "")
        if current_status in in_progress_statuses:
            in_progress_now.append({
                "ticket_id": ticket.get("ticket_number"),
                "key": ticket.get("key"),
                "title": ticket.get("title"),
                "assignee": member_map.get(ticket_assignee_uid(ticket), "Unassigned") if ticket_assignee_uid(ticket) else "Unassigned",
                "status": current_status,
                "age_days": (now - ticket.get("created_at")).days if ticket.get("created_at") else 0,
                "type": ticket.get("type", "task"),
                "priority": ticket.get("priority", "medium"),
                "created_at": ticket.get("created_at").isoformat() if ticket.get("created_at") else None
            })

    # Sort by priority (high first) and age (oldest first)
    priority_order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
    in_progress_now.sort(key=lambda x: (priority_order.get(x["priority"], 4), -x["age_days"]))

    # What was created/assigned today
    created_today = []
    for ticket in all_tickets:
        if ticket.get("created_at") and today_start <= ticket["created_at"] <= today_end:
            created_today.append({
                "ticket_id": ticket.get("ticket_number"),
                "key": ticket.get("key"),
                "title": ticket.get("title"),
                "assignee": member_map.get(ticket_assignee_uid(ticket), "Unassigned") if ticket_assignee_uid(ticket) else "Unassigned",
                "status": ticket.get("status", "Unknown"),
                "type": ticket.get("type", "task"),
                "priority": ticket.get("priority", "medium"),
                "created_at": ticket.get("created_at").isoformat() if ticket.get("created_at") else None
            })

    # ==================== BLOCKERS AND IMPEDIMENTS ====================
    # Currently blocked tickets
    blocked_now = []
    for ticket in all_tickets:
        current_status = ticket.get("status", "")
        if current_status in blocked_statuses:
            # Find when it was blocked
            ticket_history = [
                h for h in all_history
                if h.get("ticket_id") == ticket.get("ticket_number") and
                (h.get("field_name") == "status" or h.get("field") == "status") and
                h.get("new_value") in blocked_statuses
            ]

            blocked_at = None
            blocked_from = None
            if ticket_history:
                latest_block = max(ticket_history, key=lambda x: x.get("changed_at", datetime.min.replace(tzinfo=timezone.utc)))
                blocked_at = latest_block.get("changed_at")
                blocked_from = latest_block.get("old_value")

            blocked_duration_days = (now - blocked_at).days if blocked_at else 0

            blocked_now.append({
                "ticket_id": ticket.get("ticket_number"),
                "key": ticket.get("key"),
                "title": ticket.get("title"),
                "assignee": member_map.get(ticket_assignee_uid(ticket), "Unassigned") if ticket_assignee_uid(ticket) else "Unassigned",
                "blocked_at": blocked_at.isoformat() if blocked_at else None,
                "blocked_from_status": blocked_from,
                "blocked_duration_days": blocked_duration_days,
                "type": ticket.get("type", "task"),
                "priority": ticket.get("priority", "medium")
            })

    # Sort by blocked duration (longest first) and priority
    blocked_now.sort(key=lambda x: (-x["blocked_duration_days"], priority_order.get(x["priority"], 4)))

    # ==================== STATUS TRANSITIONS ====================
    # ALL transitions in the last 24 hours with special attention to regressions
    transitions_yesterday = []
    regression_transitions = []

    for history_item in all_history:
        if (history_item.get("field_name") == "status" or history_item.get("field") == "status"):
            changed_at = history_item.get("changed_at")
            if changed_at and yesterday_start <= changed_at <= today_end:  # Yesterday + today
                old_status = history_item.get("old_value", "Unknown")
                new_status = history_item.get("new_value", "Unknown")
                ticket_id = history_item.get("ticket_id")

                # Find the ticket
                ticket = next((t for t in all_tickets if t.get("ticket_number") == ticket_id), None)

                if ticket and old_status != new_status:
                    transition_data = {
                        "ticket_id": ticket_id,
                        "key": ticket.get("key"),
                        "title": ticket.get("title"),
                        "assignee": member_map.get(ticket_assignee_uid(ticket), "Unassigned") if ticket_assignee_uid(ticket) else "Unassigned",
                        "from_status": old_status,
                        "to_status": new_status,
                        "changed_at": changed_at.isoformat() if changed_at else None,
                        "changed_by": member_map.get(history_item.get("changed_by_id"), "Unknown") if history_item.get("changed_by_id") else "Unknown",
                        "type": ticket.get("type", "task"),
                        "priority": ticket.get("priority", "medium"),
                        "is_regression": False
                    }

                    # Show all transitions with actual status names
                    # Don't try to categorize - just show the actual transition
                    transition_data["transition_label"] = f"{old_status} → {new_status}"

                    transitions_yesterday.append(transition_data)

    # Sort transitions by time (most recent first)
    transitions_yesterday.sort(key=lambda x: x["changed_at"] if x["changed_at"] else "", reverse=True)
    regression_transitions.sort(key=lambda x: x["changed_at"] if x["changed_at"] else "", reverse=True)

    # ==================== SUMMARY METRICS ====================
    # Count by status
    status_counts = defaultdict(int)
    for ticket in all_tickets:
        status = ticket.get("status", "Unknown")
        status_counts[status] += 1

    # Count by assignee
    assignee_counts = defaultdict(int)
    for ticket in all_tickets:
        assignee = ticket_assignee_uid(ticket)
        assignee_name = member_map.get(assignee, "Unassigned") if assignee else "Unassigned"
        assignee_counts[assignee_name] += 1

    # Calculate velocity (completed in last 7 days)
    completed_last_7_days = []
    for ticket in all_tickets:
        if get_ticket_status(ticket) in done_statuses:
            # Check if completed in last 7 days
            ticket_history = [
                h for h in all_history
                if h.get("ticket_id") == ticket.get("ticket_number") and
                (h.get("field_name") == "status" or h.get("field") == "status") and
                h.get("new_value") in done_statuses and
                h.get("changed_at") and
                week_start <= h.get("changed_at") <= now
            ]
            if ticket_history:
                completed_last_7_days.append(ticket.get("ticket_number"))

    # Build the stand-up report
    report = {
        "project_id": project_id,
        "assignee_id": assignee_id,
        "generated_at": now.isoformat(),
        "report_date": now.strftime("%Y-%m-%d"),
        "report_day": now.strftime("%A, %B %d, %Y"),

        # Yesterday's activity
        "yesterday": {
            "date": yesterday_start.strftime("%A, %B %d, %Y"),
            "completed": completed_yesterday,
            "worked_on": worked_on_yesterday,
            "summary": {
                "tickets_completed": len(completed_yesterday),
                "tickets_worked_on": len(worked_on_yesterday),
                "total_activity": len(completed_yesterday) + len(worked_on_yesterday)
            }
        },

        # Today's priorities
        "today": {
            "date": today_start.strftime("%A, %B %d, %Y"),
            "in_progress": in_progress_now,
            "created_today": created_today,
            "summary": {
                "tickets_in_progress": len(in_progress_now),
                "tickets_created_today": len(created_today),
                "high_priority_in_progress": len([t for t in in_progress_now if t["priority"] in ["critical", "high"]])
            }
        },

        # Blockers and impediments
        "blockers": {
            "blocked_tickets": blocked_now,
            "regression_transitions": regression_transitions,
            "summary": {
                "total_blocked": len(blocked_now),
                "critical_regressions": len([r for r in regression_transitions if "CRITICAL" in r.get("regression_type", "")]),
                "total_regressions": len(regression_transitions),
                "longest_blocked_days": max([b["blocked_duration_days"] for b in blocked_now], default=0)
            }
        },

        # Status transitions (all changes)
        "transitions": {
            "all_transitions": transitions_yesterday,
            "by_status": {
                # Group transitions by actual status names (to show real values)
                status: len([t for t in transitions_yesterday if t["to_status"] == status])
                for status in all_status_names
            },
            "by_type": {
                "to_done": len([t for t in transitions_yesterday if t["to_status"] in done_statuses]),
                "to_in_progress": len([t for t in transitions_yesterday if t["to_status"] in in_progress_statuses]),
                "to_blocked": len([t for t in transitions_yesterday if t["to_status"] in blocked_statuses]),
                "regressions": len(regression_transitions)
            },
            "summary": {
                "total_transitions": len(transitions_yesterday),
                "regression_count": len(regression_transitions)
            }
        },

        # Overall summary
        "summary": {
            "total_tickets": len(all_tickets),
            "by_status": dict(status_counts),
            "by_assignee": dict(assignee_counts),
            "velocity_7_days": len(completed_last_7_days),
            "avg_daily_completion": round(len(completed_last_7_days) / 7, 1)
        },

        # Metadata
        "metadata": {
            "yesterday_start": yesterday_start.isoformat(),
            "yesterday_end": yesterday_end.isoformat(),
            "today_start": today_start.isoformat(),
            "current_time": now.isoformat(),
            "week_start": week_start.isoformat()
        }
    }

    return report


async def get_team_standup_report(
    db: AsyncIOMotorDatabase,
    project_id: int,
    date: Optional[datetime] = None
) -> dict[str, Any]:
    """
    Generate a team-wide stand-up report with per-member breakdowns.

    Args:
        db: MongoDB database instance
        project_id: Project ID to generate report for
        date: Optional date for the stand-up (defaults to today)

    Returns:
        Dictionary containing team stand-up metrics
    """
    # Get project members
    members = await db["project_members"].find({
        "project_id": project_id,
        "$or": [{"active": True}, {"active": {"$exists": False}}]
    }).to_list(length=None)

    # Get overall project report
    overall_report = await get_standup_report(db, project_id, None, date)

    # Get individual reports for each team member
    member_reports = []
    for member in members:
        user_id = member.get("user_id")
        if user_id:
            member_report = await get_standup_report(db, project_id, user_id, date)
            member_reports.append({
                "user_id": user_id,
                "name": member.get("name", f"User {user_id}"),
                "email": member.get("email"),
                "yesterday_completed": member_report["yesterday"]["summary"]["tickets_completed"],
                "yesterday_worked_on": member_report["yesterday"]["summary"]["tickets_worked_on"],
                "today_in_progress": member_report["today"]["summary"]["tickets_in_progress"],
                "blocked": member_report["blockers"]["summary"]["total_blocked"],
                "regressions": member_report["blockers"]["summary"]["total_regressions"],
                "completed_tickets": member_report["yesterday"]["completed"],
                "in_progress_tickets": member_report["today"]["in_progress"],
                "blocked_tickets": member_report["blockers"]["blocked_tickets"]
            })

    # Sort by activity level (most active first)
    member_reports.sort(
        key=lambda x: (
            x["yesterday_completed"] + x["yesterday_worked_on"] + x["today_in_progress"]
        ),
        reverse=True
    )

    return {
        "project_id": project_id,
        "generated_at": overall_report["generated_at"],
        "report_date": overall_report["report_date"],
        "report_day": overall_report["report_day"],
        "overall": overall_report,
        "team_members": member_reports,
        "team_summary": {
            "total_members": len(member_reports),
            "active_members": len([m for m in member_reports if m["today_in_progress"] > 0]),
            "members_with_blockers": len([m for m in member_reports if m["blocked"] > 0]),
            "total_team_velocity": overall_report["summary"]["velocity_7_days"]
        }
    }
