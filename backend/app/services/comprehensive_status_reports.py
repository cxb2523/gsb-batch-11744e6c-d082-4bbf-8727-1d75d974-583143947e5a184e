"""
Comprehensive status report generation with per-status metrics and transition tracking.
"""

import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional
from collections import defaultdict

from motor.motor_asyncio import AsyncIOMotorDatabase

logger = logging.getLogger(__name__)


async def get_comprehensive_status_report(
    db: AsyncIOMotorDatabase,
    project_id: int,
    period: str = "weekly"  # "daily" or "weekly"
) -> dict[str, Any]:
    """
    Generate a comprehensive status report with metrics for each status type.

    Args:
        db: MongoDB database instance
        project_id: Project ID to generate report for
        period: Either "daily" or "weekly" for the report period

    Returns:
        Dictionary containing comprehensive status metrics
    """
    now = datetime.now(timezone.utc)

    # Define time periods
    if period == "daily":
        # Last 7 days
        periods = []
        for days_back in range(6, -1, -1):
            start = (now - timedelta(days=days_back + 1)).replace(hour=0, minute=0, second=0, microsecond=0)
            end = (now - timedelta(days=days_back)).replace(hour=0, minute=0, second=0, microsecond=0)
            date_label = start.strftime("%a, %b %d")
            periods.append({
                "start": start,
                "end": end,
                "label": date_label
            })
    else:  # weekly
        # Last 4 weeks
        periods = []
        for weeks_back in range(3, -1, -1):
            start = (now - timedelta(weeks=weeks_back + 1)).replace(hour=0, minute=0, second=0, microsecond=0)
            end = (now - timedelta(weeks=weeks_back)).replace(hour=0, minute=0, second=0, microsecond=0)
            if weeks_back == 0:
                label = "This Week"
            elif weeks_back == 1:
                label = "Last Week"
            else:
                label = f"{weeks_back + 1} Weeks Ago"
            periods.append({
                "start": start,
                "end": end,
                "label": label
            })

    # Fetch all tickets for the project
    all_tickets = await db["tickets"].find({"project_id": project_id}).to_list(length=None)

    # Fetch actual project statuses from ticket_statuses collection
    project_statuses = await db["ticket_statuses"].find({"project_id": project_id}).to_list(length=None)

    # Build status categories from actual project statuses - keep it simple
    done_statuses = set()
    in_progress_statuses = set()
    blocked_statuses = set()
    todo_statuses = set()

    # Also build a map of status_id to status name
    status_id_to_name = {}

    for status in project_statuses:
        status_name = status.get("name", "")
        status_id = status.get("status_number")

        if status_id:
            status_id_to_name[status_id] = status_name

        # Simple keyword matching on exact status names from project
        status_lower = status_name.lower()

        if "done" in status_lower or "completed" in status_lower or "closed" in status_lower:
            done_statuses.add(status_name)
        elif "in progress" in status_lower or "in-progress" in status_lower:
            in_progress_statuses.add(status_name)
        elif "block" in status_lower:
            blocked_statuses.add(status_name)
        elif "todo" in status_lower or "to do" in status_lower or "backlog" in status_lower:
            todo_statuses.add(status_name)

    # Helper function to get actual status name from ticket
    def get_ticket_status(ticket: Dict[str, Any]) -> str:
        """Get the actual status name from a ticket, handling both status and status_id fields."""
        if "status" in ticket and isinstance(ticket["status"], str):
            return ticket["status"]
        elif "status_id" in ticket:
            return status_id_to_name.get(ticket["status_id"], "Unknown")
        return "Unknown"

    # Get all unique statuses from tickets
    all_statuses = set()
    for ticket in all_tickets:
        status = get_ticket_status(ticket)
        if status and status != "Unknown":
            all_statuses.add(status)

    # Fetch all team members for the project
    members = await db["project_members"].find({
        "project_id": project_id,
        "$or": [{"active": True}, {"active": {"$exists": False}}]
    }).to_list(length=None)

    # Also fetch all users to get names
    users = await db["users"].find({}).to_list(length=None)
    user_map = {u.get("user_number"): u.get("name", u.get("email", f"User {u.get('user_number')}")) for u in users}
    email_to_user_number = {u.get("email"): u.get("user_number") for u in users if u.get("email")}

    def ticket_assignee_uid(ticket: Dict[str, Any]) -> Optional[int]:
        ae = ticket.get("assignee_email")
        if ae:
            return email_to_user_number.get(ae)
        return ticket.get("assignee_id")

    # Build member map from both project members and ticket assignees
    member_map = {}

    # Add project members
    for m in members:
        uid = m.get("user_id")
        if not uid and m.get("user_email"):
            uid = email_to_user_number.get(m.get("user_email"))
        if uid:
            member_map[uid] = m.get("name", user_map.get(uid, f"User {uid}"))

    # Add any users who have tickets assigned but aren't project members
    for ticket in all_tickets:
        assignee_id = ticket_assignee_uid(ticket)
        if assignee_id and assignee_id not in member_map:
            member_map[assignee_id] = user_map.get(assignee_id, f"User {assignee_id}")

    # Fetch ticket history for transition tracking
    ticket_history = await db["ticket_history"].find({
        "project_id": project_id
    }).sort("changed_at", 1).to_list(length=None)

    # Build transition matrix
    transitions = defaultdict(lambda: defaultdict(int))
    transition_details = []

    for history_item in ticket_history:
        if history_item.get("field_name") == "status" or history_item.get("field") == "status":
            old_status = history_item.get("old_value", "Unknown")
            new_status = history_item.get("new_value", "Unknown")
            changed_at = history_item.get("changed_at") or history_item.get("created_at")

            if old_status and new_status and old_status != new_status:
                transitions[old_status][new_status] += 1
                transition_details.append({
                    "ticket_id": history_item.get("ticket_id"),
                    "from": old_status,
                    "to": new_status,
                    "changed_at": changed_at,
                    "changed_by": history_item.get("changed_by") or history_item.get("changed_by_id")
                })

    # Calculate metrics for each period
    period_metrics = []
    for period_info in periods:
        start = period_info["start"]
        end = period_info["end"]

        # Tickets created in this period
        created_tickets = [
            t for t in all_tickets
            if t.get("created_at") and start <= t["created_at"] < end
        ]

        # Tickets by current status (at end of period)
        status_counts = defaultdict(int)
        for ticket in all_tickets:
            if ticket.get("created_at") and ticket["created_at"] < end:
                status = get_ticket_status(ticket)
                status_counts[status] += 1

        # Tickets that moved to done in this period
        completed_in_period = []
        for ticket in all_tickets:
            status = get_ticket_status(ticket)
            if status in done_statuses:
                # Check if it was moved to done in this period
                # First check completed_at field
                if ticket.get("completed_at") and start <= ticket["completed_at"] < end:
                    completed_in_period.append(ticket)
                # If no completed_at, check if it was updated in this period and is now done
                elif ticket.get("updated_at") and start <= ticket["updated_at"] < end:
                    # Check history to see if it transitioned to done in this period
                    ticket_transitions = [
                        t for t in transition_details
                        if t["ticket_id"] == ticket.get("ticket_number") and
                        t["to"] in done_statuses and
                        start <= t["changed_at"] < end
                    ]
                    if ticket_transitions:
                        completed_in_period.append(ticket)

        # Count transitions in this period
        period_transitions = defaultdict(lambda: defaultdict(int))
        for trans in transition_details:
            if trans["changed_at"] and start <= trans["changed_at"] < end:
                period_transitions[trans["from"]][trans["to"]] += 1

        period_metrics.append({
            "period": period_info["label"],
            "start_date": start.isoformat(),
            "end_date": end.isoformat(),
            "tickets_created": len(created_tickets),
            "tickets_completed": len(completed_in_period),
            "status_distribution": dict(status_counts),
            "transitions": {
                from_status: dict(to_statuses)
                for from_status, to_statuses in period_transitions.items()
            }
        })

    # Calculate current status distribution
    current_status_distribution = defaultdict(lambda: {
        "count": 0,
        "tickets": [],
        "by_assignee": defaultdict(int),
        "by_type": defaultdict(int),
        "by_priority": defaultdict(int),
        "average_age_days": 0
    })

    for ticket in all_tickets:
        status = get_ticket_status(ticket)
        dist = current_status_distribution[status]

        ticket_uid = ticket_assignee_uid(ticket)
        dist["count"] += 1
        dist["tickets"].append({
            "id": ticket.get("ticket_number"),
            "key": ticket.get("key"),
            "title": ticket.get("title"),
            "assignee": member_map.get(ticket_uid, "Unassigned") if ticket_uid else "Unassigned",
            "created_at": ticket.get("created_at").isoformat() if ticket.get("created_at") else None,
            "age_days": (now - ticket.get("created_at")).days if ticket.get("created_at") else 0
        })

        # Count by assignee
        assignee_name = member_map.get(ticket_uid, "Unassigned") if ticket_uid else "Unassigned"
        dist["by_assignee"][assignee_name] += 1

        # Count by type
        ticket_type = ticket.get("type", "task")
        dist["by_type"][ticket_type] += 1

        # Count by priority
        priority = ticket.get("priority", "medium")
        dist["by_priority"][priority] += 1

        # Calculate average age
        if ticket.get("created_at"):
            age_days = (now - ticket.get("created_at")).days
            current_avg = dist["average_age_days"]
            current_count = dist["count"]
            dist["average_age_days"] = ((current_avg * (current_count - 1)) + age_days) / current_count

    # Convert defaultdicts to regular dicts for JSON serialization
    for status, dist in current_status_distribution.items():
        dist["by_assignee"] = dict(dist["by_assignee"])
        dist["by_type"] = dict(dist["by_type"])
        dist["by_priority"] = dict(dist["by_priority"])
        dist["average_age_days"] = round(dist["average_age_days"], 1)
        # Only keep first 10 tickets for brevity
        dist["tickets"] = dist["tickets"][:10]

    # Calculate velocity metrics
    current_period = period_metrics[-1] if period_metrics else None
    previous_period = period_metrics[-2] if len(period_metrics) > 1 else None

    velocity_metrics = {
        "current_period_velocity": 0,
        "average_velocity": 0,
        "trend": "stable"
    }

    if current_period:
        created = current_period["tickets_created"]
        completed = current_period["tickets_completed"]
        if created > 0:
            velocity_metrics["current_period_velocity"] = round((completed / created) * 100, 1)

    total_created = sum(p["tickets_created"] for p in period_metrics)
    total_completed = sum(p["tickets_completed"] for p in period_metrics)
    if total_created > 0:
        velocity_metrics["average_velocity"] = round((total_completed / total_created) * 100, 1)

    if current_period and previous_period:
        current_vel = velocity_metrics["current_period_velocity"]
        prev_created = previous_period["tickets_created"]
        prev_completed = previous_period["tickets_completed"]
        prev_vel = (prev_completed / prev_created * 100) if prev_created > 0 else 0

        if current_vel > prev_vel + 10:
            velocity_metrics["trend"] = "improving"
        elif current_vel < prev_vel - 10:
            velocity_metrics["trend"] = "declining"

    # Build assignee metrics
    assignee_metrics = {}
    for uid, name in member_map.items():
        assigned_tickets = [t for t in all_tickets if ticket_assignee_uid(t) == uid]

        assignee_metrics[name] = {
            "total_assigned": len(assigned_tickets),
            "by_status": defaultdict(int),
            "completed": 0,
            "in_progress": 0,
            "blocked": 0
        }

        for ticket in assigned_tickets:
            status = get_ticket_status(ticket)
            assignee_metrics[name]["by_status"][status] += 1

            if status in done_statuses:
                assignee_metrics[name]["completed"] += 1
            elif status in in_progress_statuses:
                assignee_metrics[name]["in_progress"] += 1
            elif status in blocked_statuses:
                assignee_metrics[name]["blocked"] += 1

        # Convert defaultdict to dict
        assignee_metrics[name]["by_status"] = dict(assignee_metrics[name]["by_status"])

    # Calculate transition metrics
    transition_metrics = {
        "most_common_transitions": [],
        "bottleneck_statuses": [],
        "average_time_in_status": {}
    }

    # Find most common transitions
    all_transitions = []
    for from_status, to_dict in transitions.items():
        for to_status, count in to_dict.items():
            all_transitions.append({
                "from": from_status,
                "to": to_status,
                "count": count
            })

    all_transitions.sort(key=lambda x: x["count"], reverse=True)
    transition_metrics["most_common_transitions"] = all_transitions[:5]

    # Find bottleneck statuses (statuses where tickets stay longest)
    status_durations = defaultdict(list)
    for trans in transition_details:
        # Calculate how long ticket was in the "from" status
        # This is simplified - would need more complex logic for full accuracy
        status_durations[trans["from"]].append(1)  # Placeholder

    # Identify statuses with many tickets but few transitions out
    for status in all_statuses:
        status_count = sum(1 for t in all_tickets if get_ticket_status(t) == status)
        transitions_out = sum(transitions[status].values()) if status in transitions else 0

        if status_count > 5 and transitions_out < status_count * 0.2:  # Less than 20% transition rate
            transition_metrics["bottleneck_statuses"].append({
                "status": status,
                "ticket_count": status_count,
                "transitions_out": transitions_out
            })

    # Compile the comprehensive report
    report = {
        "project_id": project_id,
        "generated_at": now.isoformat(),
        "report_type": period,
        "summary": {
            "total_tickets": len(all_tickets),
            "total_statuses": len(all_statuses),
            "done_tickets": len([t for t in all_tickets if t.get("status") in done_statuses]),
            "in_progress_tickets": len([t for t in all_tickets if t.get("status") in in_progress_statuses]),
            "blocked_tickets": len([t for t in all_tickets if t.get("status") in blocked_statuses]),
            "unassigned_tickets": len([t for t in all_tickets if not ticket_assignee_uid(t)])
        },
        "status_distribution": dict(current_status_distribution),
        "periods": period_metrics,
        "velocity_metrics": velocity_metrics,
        "assignee_metrics": assignee_metrics,
        "transition_metrics": transition_metrics,
        "all_statuses": sorted(list(all_statuses)),
        "metadata": {
            "period_type": period,
            "period_count": len(periods),
            "start_date": periods[0]["start"].isoformat() if periods else None,
            "end_date": periods[-1]["end"].isoformat() if periods else None
        }
    }

    return report