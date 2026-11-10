"""
Status report generation — comprehensive daily/weekly metrics for ticket activity.
"""

import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from motor.motor_asyncio import AsyncIOMotorDatabase

logger = logging.getLogger(__name__)


async def get_status_report(
    db: AsyncIOMotorDatabase,
    project_id: int,
    period: str = "weekly"  # "daily" or "weekly"
) -> dict[str, Any]:
    """
    Generate a comprehensive status report with all ticket metrics.

    Args:
        db: MongoDB database instance
        project_id: Project ID to generate report for
        period: Either "daily" or "weekly" for the report period

    Returns:
        Dictionary containing comprehensive ticket metrics
    """
    now = datetime.now(timezone.utc)

    # Define time periods
    if period == "daily":
        # Last 7 days
        periods = []
        for days_back in range(6, -1, -1):  # 6, 5, 4, 3, 2, 1, 0
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
        for weeks_back in range(3, -1, -1):  # 3, 2, 1, 0
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

    # Fetch workflow statuses from ticket_statuses collection
    # Match the pattern from status.py endpoint
    statuses = await db["ticket_statuses"].find({"project_id": project_id}).to_list(length=None)
    status_map: Dict[int, str] = {}

    # Build a list of all known status names from tickets if statuses collection is empty
    all_status_names = set()
    for ticket in all_tickets:
        # Check if ticket uses status (string) or status_id (int)
        if "status" in ticket and isinstance(ticket["status"], str):
            all_status_names.add(ticket["status"])

    # Get done statuses - matching exact names like status.py does
    # Also check ticket status strings directly
    done_status_names = {"Done", "Closed", "Completed", "done", "closed", "completed"}
    done_status_ids = set()

    # If we have statuses from ticket_statuses collection
    if statuses:
        done_statuses = await db["ticket_statuses"].find({
            "project_id": project_id,
            "name": {"$in": ["Done", "Closed", "Completed"]}
        }).to_list(length=None)
        done_status_ids = set(s.get("status_number") for s in done_statuses if s.get("status_number"))

        for status in statuses:
            status_id = status.get("status_number")
            status_name = status.get("name", "")
            if status_id:
                status_map[status_id] = status_name

    # Log for debugging
    logger.debug(f"Project {project_id} - Status Map: {status_map}")
    logger.debug(f"Project {project_id} - Done Status IDs: {done_status_ids}")
    logger.debug(f"Project {project_id} - Total tickets: {len(all_tickets)}")

    # Fetch project members for assignee information
    members = await db["project_members"].find({"project_id": project_id, "active": True}).to_list(length=None)
    all_users = await db["users"].find({}).to_list(length=None)
    email_to_user_number = {u.get("email"): u.get("user_number") for u in all_users if u.get("email")}
    user_number_to_email = {u.get("user_number"): u.get("email") for u in all_users if u.get("user_number")}

    member_map: Dict[int, str] = {}
    for m in members:
        uid = m.get("user_id")
        if not uid and m.get("user_email"):
            uid = email_to_user_number.get(m.get("user_email"))
        if uid:
            member_map[uid] = m.get("name", m.get("email", f"User {uid}"))

    def _ticket_assignee_uid(ticket: dict) -> Optional[int]:
        ae = ticket.get("assignee_email")
        if ae:
            return email_to_user_number.get(ae)
        return ticket.get("assignee_id")

    def _ticket_reporter_uid(ticket: dict) -> Optional[int]:
        re = ticket.get("reporter_email") or ticket.get("created_by_email")
        if re:
            return email_to_user_number.get(re)
        return ticket.get("created_by")

    # Calculate metrics for each period
    period_metrics = []
    for period_info in periods:
        start = period_info["start"]
        end = period_info["end"]

        # Filter tickets created in this period
        created_tickets = [
            t for t in all_tickets
            if t.get("created_at") and start <= t["created_at"] < end
        ]

        # Filter tickets completed/closed in this period
        # First try using ticket_history for status_id changes
        ticket_history = await db["ticket_history"].find({
            "project_id": project_id,
            "field_name": "status_id",
            "new_value": {"$in": [str(sid) for sid in done_status_ids]},
            "changed_at": {"$gte": start, "$lt": end}
        }).to_list(length=None) if done_status_ids else []

        # Also check for status (string) changes in history
        status_history = await db["ticket_history"].find({
            "project_id": project_id,
            "field_name": "status",
            "new_value": {"$in": list(done_status_names)},
            "changed_at": {"$gte": start, "$lt": end}
        }).to_list(length=None)

        completed_ticket_ids = set()
        for ch in ticket_history:
            completed_ticket_ids.add(ch.get("ticket_id"))
        for ch in status_history:
            completed_ticket_ids.add(ch.get("ticket_id"))

        # Also check tickets that are currently in done status and were updated in this period
        # (in case history is missing)
        for t in all_tickets:
            # Check if ticket has a done status
            has_done_status = False
            if "status" in t and isinstance(t["status"], str):
                has_done_status = t["status"] in done_status_names
            elif "status_id" in t and t["status_id"] in done_status_ids:
                has_done_status = True

            # If in done status and was updated/created in this period, count as completed
            if has_done_status:
                if t.get("completed_at") and start <= t["completed_at"] < end:
                    completed_ticket_ids.add(t.get("ticket_number"))
                elif t.get("updated_at") and start <= t["updated_at"] < end:
                    # Only count if it wasn't already in done status at period start
                    completed_ticket_ids.add(t.get("ticket_number"))

        completed_tickets = [
            t for t in all_tickets
            if t.get("ticket_number") in completed_ticket_ids
        ]

        # Debug logging for first period
        if period_metrics == []:
            logger.debug(f"Period {period_info['label']} - Checking completed tickets:")
            logger.debug(f"  Done status IDs: {done_status_ids}")
            logger.debug(f"  Period: {start} to {end}")
            logger.debug(f"  Found {len(completed_tickets)} completed tickets")
            for t in all_tickets[:3]:  # Check first 3 tickets
                logger.debug(f"  Ticket {t.get('key')}: status_id={t.get('status_id')}, in done_status_ids={t.get('status_id') in done_status_ids}, updated_at={t.get('updated_at')}, completed_at={t.get('completed_at')}")

        # Filter tickets updated in this period using ticket_history
        # Match the pattern from status.py - look for any changes
        all_changes = await db["ticket_history"].find({
            "project_id": project_id,
            "changed_at": {"$gte": start, "$lt": end}
        }).to_list(length=None)

        updated_ticket_ids = list(set(ch.get("ticket_id") for ch in all_changes))
        updated_tickets = [
            t for t in all_tickets
            if t.get("ticket_number") in updated_ticket_ids
        ]

        # Count open vs closed at end of period
        # Tickets that were created before end of period and are not in done status
        open_at_end = []
        for t in all_tickets:
            if t.get("created_at") and t["created_at"] < end:
                # Check if ticket is NOT in done status
                is_done = False
                if "status" in t and isinstance(t["status"], str):
                    is_done = t["status"] in done_status_names
                elif "status_id" in t:
                    is_done = t.get("status_id") in done_status_ids

                if not is_done:
                    open_at_end.append(t)

        # Count by type for created tickets
        type_counts = {}
        for ticket in created_tickets:
            ticket_type = ticket.get("type", "task")
            type_counts[ticket_type] = type_counts.get(ticket_type, 0) + 1

        # Count by priority for created tickets
        priority_counts = {}
        for ticket in created_tickets:
            priority = ticket.get("priority", "medium")
            priority_counts[priority] = priority_counts.get(priority, 0) + 1

        # Count by assignee for created tickets
        assignee_counts = {}
        for ticket in created_tickets:
            assignee_id = _ticket_assignee_uid(ticket)
            assignee_name = member_map.get(assignee_id, "Unassigned") if assignee_id else "Unassigned"
            assignee_counts[assignee_name] = assignee_counts.get(assignee_name, 0) + 1

        # Status distribution for all tickets at end of period
        status_distribution = {}
        for ticket in all_tickets:
            if ticket.get("created_at") and ticket["created_at"] < end:
                # Get status name from either status field or status_id
                if "status" in ticket and isinstance(ticket["status"], str):
                    status_name = ticket["status"]
                elif "status_id" in ticket:
                    status_name = status_map.get(ticket.get("status_id", 0), "Unknown")
                else:
                    status_name = "Unknown"

                status_distribution[status_name] = status_distribution.get(status_name, 0) + 1

        period_metrics.append({
            "period": period_info["label"],
            "start_date": start.isoformat(),
            "end_date": end.isoformat(),
            "tickets_created": len(created_tickets),
            "tickets_completed": len(completed_tickets),
            "tickets_updated": len(updated_tickets),
            "open_tickets": len(open_at_end),
            "by_type": type_counts,
            "by_priority": priority_counts,
            "by_assignee": assignee_counts,
            "status_distribution": status_distribution
        })

    # Calculate totals and averages
    total_created = sum(pm["tickets_created"] for pm in period_metrics)
    total_completed = sum(pm["tickets_completed"] for pm in period_metrics)
    total_updated = sum(pm["tickets_updated"] for pm in period_metrics)

    avg_created_per_period = total_created / len(periods) if periods else 0
    avg_completed_per_period = total_completed / len(periods) if periods else 0

    # Get current period metrics
    current_period = period_metrics[-1] if period_metrics else None
    previous_period = period_metrics[-2] if len(period_metrics) > 1 else None

    # Calculate trends for different metrics
    creation_trend = {"direction": "stable", "percentage": 0}
    completion_trend = {"direction": "stable", "percentage": 0}

    if current_period and previous_period:
        # Creation trend
        current_created = current_period["tickets_created"]
        previous_created = previous_period["tickets_created"]
        if previous_created > 0:
            change_percentage = ((current_created - previous_created) / previous_created) * 100
            creation_trend["percentage"] = round(abs(change_percentage), 1)
            if change_percentage > 10:
                creation_trend["direction"] = "up"
            elif change_percentage < -10:
                creation_trend["direction"] = "down"

        # Completion trend
        current_completed = current_period["tickets_completed"]
        previous_completed = previous_period["tickets_completed"]
        if previous_completed > 0:
            change_percentage = ((current_completed - previous_completed) / previous_completed) * 100
            completion_trend["percentage"] = round(abs(change_percentage), 1)
            if change_percentage > 10:
                completion_trend["direction"] = "up"
            elif change_percentage < -10:
                completion_trend["direction"] = "down"

    # Get top contributors (who created the most tickets)
    creator_counts = {}
    period_start = periods[0]["start"] if periods else now - timedelta(days=30)
    for ticket in all_tickets:
        if ticket.get("created_at") and ticket["created_at"] >= period_start:
            creator_id = _ticket_reporter_uid(ticket)
            if creator_id:
                creator_name = member_map.get(creator_id, f"User {creator_id}")
                creator_counts[creator_name] = creator_counts.get(creator_name, 0) + 1

    top_contributors = sorted(
        creator_counts.items(),
        key=lambda x: x[1],
        reverse=True
    )[:5]

    # Calculate velocity (average completion rate)
    velocity_rate = 0
    if current_period and current_period["tickets_created"] > 0:
        velocity_rate = round((current_period["tickets_completed"] / current_period["tickets_created"]) * 100, 1)

    # Generate status-based breakdown for all tickets
    status_breakdown = {}
    for ticket in all_tickets:
        # Get status name from either status field or status_id
        if "status" in ticket and isinstance(ticket["status"], str):
            status_name = ticket["status"]
        elif "status_id" in ticket:
            status_name = status_map.get(ticket.get("status_id", 0), "Unknown")
        else:
            status_name = "Unknown"

        if status_name not in status_breakdown:
            status_breakdown[status_name] = {
                "total": 0,
                "created_this_period": 0,
                "completed_this_period": 0,
                "updated_this_period": 0,
                "by_type": {},
                "by_priority": {},
                "is_done_status": status_name in done_status_names
            }

        status_breakdown[status_name]["total"] += 1

        # Count if created in current period
        if current_period and ticket.get("created_at"):
            # Parse the ISO format dates
            start_str = current_period["start_date"]
            end_str = current_period["end_date"]
            # Remove 'Z' and add '+00:00' for proper timezone parsing if needed
            if start_str.endswith('Z'):
                start_str = start_str[:-1] + '+00:00'
            if end_str.endswith('Z'):
                end_str = end_str[:-1] + '+00:00'

            period_start = datetime.fromisoformat(start_str) if isinstance(start_str, str) else start_str
            period_end = datetime.fromisoformat(end_str) if isinstance(end_str, str) else end_str

            if period_start <= ticket["created_at"] < period_end:
                status_breakdown[status_name]["created_this_period"] += 1

        # Count by type and priority
        ticket_type = ticket.get("type", "task")
        priority = ticket.get("priority", "medium")

        if ticket_type not in status_breakdown[status_name]["by_type"]:
            status_breakdown[status_name]["by_type"][ticket_type] = 0
        status_breakdown[status_name]["by_type"][ticket_type] += 1

        if priority not in status_breakdown[status_name]["by_priority"]:
            status_breakdown[status_name]["by_priority"][priority] = 0
        status_breakdown[status_name]["by_priority"][priority] += 1

    # Compile the report
    report = {
        "project_id": project_id,
        "generated_at": now.isoformat(),
        "report_type": period,
        "summary": {
            # Creation metrics
            "total_tickets_created": total_created,
            "avg_created_per_period": round(avg_created_per_period, 1),
            "current_period_created": current_period["tickets_created"] if current_period else 0,
            "previous_period_created": previous_period["tickets_created"] if previous_period else 0,
            "creation_trend": creation_trend,

            # Completion metrics
            "total_tickets_completed": total_completed,
            "avg_completed_per_period": round(avg_completed_per_period, 1),
            "current_period_completed": current_period["tickets_completed"] if current_period else 0,
            "previous_period_completed": previous_period["tickets_completed"] if previous_period else 0,
            "completion_trend": completion_trend,

            # Other metrics
            "total_tickets_updated": total_updated,
            "current_open_tickets": current_period["open_tickets"] if current_period else 0,
            "velocity_rate": velocity_rate
        },
        "periods": period_metrics,
        "top_contributors": [
            {"name": name, "tickets_created": count}
            for name, count in top_contributors
        ],
        "metadata": {
            "period_type": period,
            "period_count": len(periods),
            "start_date": periods[0]["start"].isoformat() if periods else None,
            "end_date": periods[-1]["end"].isoformat() if periods else None
        },
        "status_breakdown": status_breakdown
    }

    return report


async def get_comparison_report(
    db: AsyncIOMotorDatabase,
    project_ids: List[int],
    period: str = "weekly"
) -> dict[str, Any]:
    """
    Generate a comparison report across multiple projects.

    Args:
        db: MongoDB database instance
        project_ids: List of project IDs to compare
        period: Either "daily" or "weekly" for the report period

    Returns:
        Dictionary containing comparative metrics across projects
    """
    reports = []
    for project_id in project_ids:
        report = await get_status_report(db, project_id, period)
        # Get project details
        project = await db["projects"].find_one({"project_number": project_id})
        project_name = project.get("name", f"Project {project_id}") if project else f"Project {project_id}"

        reports.append({
            "project_id": project_id,
            "project_name": project_name,
            "total_created": report["summary"]["total_tickets_created"],
            "total_completed": report["summary"]["total_tickets_completed"],
            "avg_created_per_period": report["summary"]["avg_created_per_period"],
            "avg_completed_per_period": report["summary"]["avg_completed_per_period"],
            "current_period_created": report["summary"]["current_period_created"],
            "current_period_completed": report["summary"]["current_period_completed"],
            "creation_trend": report["summary"]["creation_trend"],
            "completion_trend": report["summary"]["completion_trend"],
            "velocity_rate": report["summary"]["velocity_rate"],
            "current_open_tickets": report["summary"]["current_open_tickets"]
        })

    # Sort by total created
    reports.sort(key=lambda x: x["total_created"], reverse=True)

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "period": period,
        "projects": reports,
        "summary": {
            "total_projects": len(reports),
            "total_tickets_created": sum(r["total_created"] for r in reports),
            "total_tickets_completed": sum(r["total_completed"] for r in reports),
            "avg_velocity": round(sum(r["velocity_rate"] for r in reports) / len(reports), 1) if reports else 0,
            "most_active_project": reports[0] if reports else None
        }
    }