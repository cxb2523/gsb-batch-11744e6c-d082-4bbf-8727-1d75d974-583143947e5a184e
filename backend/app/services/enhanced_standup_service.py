"""
Enhanced standup report service with project-specific status tracking and transition metrics.

This service adapts to each project's custom statuses and provides:
- Status movement metrics (tickets moved to/from each status)
- Status transition matrix (flow between statuses)
- Current status snapshot with breakdowns
- Velocity and flow metrics
- Blockers and risks
- Team activity summary
"""

import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional
from collections import defaultdict

from motor.motor_asyncio import AsyncIOMotorDatabase

logger = logging.getLogger(__name__)


async def get_project_statuses(db: AsyncIOMotorDatabase, project_id: int) -> List[Dict[str, Any]]:
    """Get all statuses for a project, ordered by position."""
    statuses = await db["ticket_statuses"].find(
        {"project_id": project_id}
    ).sort("position", 1).to_list(length=None)
    return statuses


async def categorize_status(status_name: str) -> str:
    """Categorize a status into: todo, in_progress, blocked, done, or other."""
    name_lower = status_name.lower()

    if any(word in name_lower for word in ["done", "completed", "closed", "resolved", "finished"]):
        return "done"
    elif any(word in name_lower for word in ["block", "blocked", "blocker", "impediment"]):
        return "blocked"
    elif any(word in name_lower for word in ["in progress", "in-progress", "progress", "doing", "active", "started"]):
        return "in_progress"
    elif any(word in name_lower for word in ["todo", "to do", "backlog", "new", "open"]):
        return "todo"
    else:
        return "other"


async def get_enhanced_standup_report(
    db: AsyncIOMotorDatabase,
    project_id: int,
    hours: int = 24
) -> Dict[str, Any]:
    """
    Generate comprehensive standup report with project-specific status tracking.

    Args:
        db: MongoDB database
        project_id: Project ID
        hours: Time window in hours (default 24 for daily standup)

    Returns:
        Comprehensive standup report dictionary
    """
    now = datetime.now(timezone.utc)
    start_time = now - timedelta(hours=hours)

    # Get project info
    project = await db["projects"].find_one({"project_number": project_id})
    if not project:
        raise ValueError(f"Project {project_id} not found")

    project_name = project.get("name", f"Project {project_id}")
    project_key = project.get("key", "PROJ")

    # Get all project statuses
    statuses = await get_project_statuses(db, project_id)
    status_map = {s["status_number"]: s for s in statuses}  # id -> status object
    status_name_map = {s["status_number"]: s["name"] for s in statuses}  # id -> name

    # Categorize each status
    status_categories = {}
    for status in statuses:
        category = await categorize_status(status["name"])
        status_categories[status["status_number"]] = category

    # Get all tickets for the project
    all_tickets = await db["tickets"].find({"project_id": project_id}).to_list(length=None)

    # Build email -> user_number map so we can normalize email-only tickets
    all_users = await db["users"].find({}).to_list(length=None)
    email_to_user_number = {u.get("email"): u.get("user_number") for u in all_users if u.get("email")}

    def ticket_assignee_uid(ticket: Dict[str, Any]) -> Optional[int]:
        ae = ticket.get("assignee_email")
        if ae:
            return email_to_user_number.get(ae)
        return ticket.get("assignee_id")

    # Ensure all ticket timestamps are timezone-aware
    for ticket in all_tickets:
        if "created_at" in ticket and ticket["created_at"] and ticket["created_at"].tzinfo is None:
            ticket["created_at"] = ticket["created_at"].replace(tzinfo=timezone.utc)
        if "updated_at" in ticket and ticket["updated_at"] and ticket["updated_at"].tzinfo is None:
            ticket["updated_at"] = ticket["updated_at"].replace(tzinfo=timezone.utc)

    ticket_map = {t["ticket_number"]: t for t in all_tickets}

    # Get status transitions in the time window
    # Handle both "status_id" and "status" field names for backward compatibility
    transitions = await db["ticket_history"].find({
        "project_id": project_id,
        "field_name": {"$in": ["status_id", "status"]},
        "changed_at": {"$gte": start_time, "$lte": now}
    }).sort("changed_at", 1).to_list(length=None)

    # Ensure all transition timestamps are timezone-aware
    for trans in transitions:
        if "changed_at" in trans and trans["changed_at"] and trans["changed_at"].tzinfo is None:
            trans["changed_at"] = trans["changed_at"].replace(tzinfo=timezone.utc)

    # Get all changes (for updated tickets)
    all_changes = await db["ticket_history"].find({
        "project_id": project_id,
        "changed_at": {"$gte": start_time, "$lte": now}
    }).to_list(length=None)

    # Ensure all change timestamps are timezone-aware
    for change in all_changes:
        if "changed_at" in change and change["changed_at"] and change["changed_at"].tzinfo is None:
            change["changed_at"] = change["changed_at"].replace(tzinfo=timezone.utc)

    updated_ticket_ids = list(set(ch["ticket_id"] for ch in all_changes if ch.get("ticket_id") is not None))

    # Analyze status movements
    status_movements = defaultdict(lambda: {
        "moved_in": 0,  # Tickets that moved TO this status
        "moved_out": 0,  # Tickets that moved FROM this status
        "tickets_moved_in": [],
        "tickets_moved_out": [],
        "net_moved_in": 0,  # Net displacement: tickets that ENDED in this status (final state)
        "net_moved_out": 0,  # Net displacement: tickets that STARTED in this status but ended elsewhere
    })

    # Track transitions between statuses
    transition_matrix = defaultdict(lambda: defaultdict(int))  # from_status -> to_status -> count
    transition_details = defaultdict(lambda: defaultdict(list))  # from_status -> to_status -> [tickets]

    # Track concerning transitions (regressions)
    regressions = []  # Done → Blocked, Done → In Progress, etc.

    # Track initial and final states for each ticket (for net displacement)
    ticket_states = {}  # ticket_id -> {"initial": status_id, "final": status_id}

    # Create reverse lookup: status_name -> status_id
    status_name_to_id = {s["name"]: s["status_number"] for s in statuses}

    for trans in transitions:
        ticket_id = trans["ticket_id"]
        field_name = trans.get("field_name")

        # Handle both status_id (numeric) and status (name) field types
        old_value = trans.get("old_value")
        new_value = trans.get("new_value")

        if field_name == "status_id":
            # Try to parse as int first (new format)
            try:
                old_status_id = int(old_value) if old_value else None
                new_status_id = int(new_value) if new_value else None
            except (ValueError, TypeError):
                # If parsing fails, treat as status names (migrated old format)
                old_status_id = status_name_to_id.get(old_value)
                new_status_id = status_name_to_id.get(new_value)
        elif field_name == "status":
            # Old format: status names - need to look up IDs
            old_status_id = status_name_to_id.get(old_value)
            new_status_id = status_name_to_id.get(new_value)
        else:
            continue

        changed_at = trans["changed_at"]
        changed_by = trans.get("changed_by_id") or trans.get("changed_by")  # Handle both field names

        if not new_status_id or new_status_id not in status_map:
            continue

        ticket = ticket_map.get(ticket_id)
        if not ticket:
            continue

        # Track initial and final states for net displacement
        if ticket_id not in ticket_states:
            ticket_states[ticket_id] = {"initial": old_status_id, "final": new_status_id}
        else:
            # Update final state
            ticket_states[ticket_id]["final"] = new_status_id

        # Track movement TO new status
        status_movements[new_status_id]["moved_in"] += 1
        status_movements[new_status_id]["tickets_moved_in"].append({
            "ticket_id": ticket_id,
            "ticket_key": ticket.get("key"),
            "ticket_title": ticket.get("title"),
            "changed_at": changed_at,
            "changed_by_id": changed_by,
            "from_status_id": old_status_id,
            "from_status_name": status_name_map.get(old_status_id, "Unknown") if old_status_id else "None"
        })

        # Track movement FROM old status
        if old_status_id and old_status_id in status_map:
            status_movements[old_status_id]["moved_out"] += 1
            status_movements[old_status_id]["tickets_moved_out"].append({
                "ticket_id": ticket_id,
                "ticket_key": ticket.get("key"),
                "ticket_title": ticket.get("title"),
                "changed_at": changed_at,
                "changed_by_id": changed_by,
                "to_status_id": new_status_id,
                "to_status_name": status_name_map[new_status_id]
            })

            # Track transition in matrix
            transition_matrix[old_status_id][new_status_id] += 1
            transition_details[old_status_id][new_status_id].append({
                "ticket_id": ticket_id,
                "ticket_key": ticket.get("key"),
                "ticket_title": ticket.get("title"),
                "changed_at": changed_at
            })

            # Detect regressions
            old_category = status_categories.get(old_status_id, "other")
            new_category = status_categories.get(new_status_id, "other")

            if old_category == "done" and new_category in ["blocked", "in_progress", "todo"]:
                regressions.append({
                    "ticket_id": ticket_id,
                    "ticket_key": ticket.get("key"),
                    "ticket_title": ticket.get("title"),
                    "from_status": status_name_map[old_status_id],
                    "to_status": status_name_map[new_status_id],
                    "from_category": old_category,
                    "to_category": new_category,
                    "changed_at": changed_at,
                    "severity": "critical" if new_category == "blocked" else "warning"
                })

    # Calculate net displacement based on initial vs final states
    for ticket_id, states in ticket_states.items():
        initial_status = states.get("initial")
        final_status = states.get("final")

        # Only count net displacement if the status actually changed
        if initial_status and final_status and initial_status != final_status:
            # Ticket moved FROM initial_status (net loss)
            if initial_status in status_map:
                status_movements[initial_status]["net_moved_out"] += 1

            # Ticket moved TO final_status (net gain)
            if final_status in status_map:
                status_movements[final_status]["net_moved_in"] += 1

    # Get current status distribution
    current_status_distribution = defaultdict(lambda: {
        "count": 0,
        "tickets": [],
        "by_type": defaultdict(int),
        "by_assignee": defaultdict(int)
    })

    for ticket in all_tickets:
        status_id = ticket.get("status_id")
        if not status_id or status_id not in status_map:
            continue

        ticket_uid = ticket_assignee_uid(ticket)
        current_status_distribution[status_id]["count"] += 1
        current_status_distribution[status_id]["tickets"].append({
            "ticket_id": ticket["ticket_number"],
            "ticket_key": ticket.get("key"),
            "ticket_title": ticket.get("title"),
            "type": ticket.get("type", "task"),
            "assignee_id": ticket_uid,
            "priority": ticket.get("priority", "medium"),
            "created_at": ticket.get("created_at"),
            "updated_at": ticket.get("updated_at")
        })

        # Track by type
        ticket_type = ticket.get("type", "task")
        current_status_distribution[status_id]["by_type"][ticket_type] += 1

        # Track by assignee
        if ticket_uid:
            current_status_distribution[status_id]["by_assignee"][ticket_uid] += 1

    # Calculate velocity metrics
    done_statuses = [sid for sid, cat in status_categories.items() if cat == "done"]
    blocked_statuses = [sid for sid, cat in status_categories.items() if cat == "blocked"]
    in_progress_statuses = [sid for sid, cat in status_categories.items() if cat == "in_progress"]

    tickets_completed = sum(
        status_movements[sid]["moved_in"]
        for sid in done_statuses
    )

    tickets_blocked = sum(
        current_status_distribution[sid]["count"]
        for sid in blocked_statuses
    )

    tickets_in_progress = sum(
        current_status_distribution[sid]["count"]
        for sid in in_progress_statuses
    )

    # Get tickets created in time window
    tickets_created = await db["tickets"].count_documents({
        "project_id": project_id,
        "created_at": {"$gte": start_time, "$lte": now}
    })

    # Find blocked tickets and calculate blocked duration
    blocked_tickets_detailed = []
    for status_id in blocked_statuses:
        for ticket_info in current_status_distribution[status_id]["tickets"]:
            ticket_id = ticket_info["ticket_id"]

            # Find when this ticket was last moved to blocked status
            last_blocked_transition = await db["ticket_history"].find_one(
                {
                    "project_id": project_id,
                    "ticket_id": ticket_id,
                    "field_name": "status_id",
                    "new_value": str(status_id)
                },
                sort=[("changed_at", -1)]
            )

            blocked_since = last_blocked_transition.get("changed_at") if last_blocked_transition else None
            blocked_duration_hours = None
            if blocked_since:
                # Make blocked_since timezone-aware if it's not
                if blocked_since.tzinfo is None:
                    blocked_since = blocked_since.replace(tzinfo=timezone.utc)
                blocked_duration_hours = (now - blocked_since).total_seconds() / 3600

            blocked_tickets_detailed.append({
                **ticket_info,
                "status_name": status_name_map[status_id],
                "blocked_since": blocked_since,
                "blocked_duration_hours": blocked_duration_hours,
                "is_critical": blocked_duration_hours and blocked_duration_hours > 72  # >3 days
            })

    # Sort by blocked duration (most critical first)
    blocked_tickets_detailed.sort(
        key=lambda x: x.get("blocked_duration_hours", 0) or 0,
        reverse=True
    )

    # Find stale tickets (no updates in last 7 days)
    seven_days_ago = now - timedelta(days=7)
    stale_tickets = []
    for ticket in all_tickets:
        updated_at = ticket.get("updated_at") or ticket.get("created_at")
        status_id = ticket.get("status_id")

        # Make updated_at timezone-aware if it's not
        if updated_at and updated_at.tzinfo is None:
            updated_at = updated_at.replace(tzinfo=timezone.utc)

        if updated_at and updated_at < seven_days_ago:
            # Skip done tickets
            if status_id in done_statuses:
                continue

            stale_tickets.append({
                "ticket_id": ticket["ticket_number"],
                "ticket_key": ticket.get("key"),
                "ticket_title": ticket.get("title"),
                "status_name": status_name_map.get(status_id, "Unknown"),
                "last_updated": updated_at,
                "days_since_update": (now - updated_at).days,
                "assignee_id": ticket_assignee_uid(ticket)
            })

    # Sort stale tickets by days since update
    stale_tickets.sort(key=lambda x: x["days_since_update"], reverse=True)

    # Get team member activity
    users_cache = {}

    async def get_user_name(user_id: int) -> str:
        if user_id in users_cache:
            return users_cache[user_id]
        user = await db["users"].find_one({"user_number": user_id})
        name = user.get("name", f"User {user_id}") if user else f"User {user_id}"
        users_cache[user_id] = name
        return name

    # Track activity by user
    user_activity = defaultdict(lambda: {
        "user_id": 0,
        "user_name": "",
        "tickets_moved": 0,
        "tickets_completed": 0,
        "tickets_blocked": 0,
        "tickets_updated": 0,
        "moves": []
    })

    for trans in transitions:
        changed_by = trans.get("changed_by_id") or trans.get("changed_by")  # Handle both field names
        if not changed_by:
            continue

        # Parse new_status_id - handle both numeric and string values
        new_value = trans.get("new_value")
        try:
            new_status_id = int(new_value) if new_value else None
        except (ValueError, TypeError):
            # If it's a status name, look it up
            new_status_id = status_name_to_id.get(new_value)

        if not new_status_id:
            continue

        user_activity[changed_by]["user_id"] = changed_by
        user_activity[changed_by]["user_name"] = await get_user_name(changed_by)
        user_activity[changed_by]["tickets_moved"] += 1

        # Track completed
        if new_status_id in done_statuses:
            user_activity[changed_by]["tickets_completed"] += 1

        # Track blocked
        if new_status_id in blocked_statuses:
            user_activity[changed_by]["tickets_blocked"] += 1

        user_activity[changed_by]["moves"].append({
            "ticket_key": ticket_map.get(trans["ticket_id"], {}).get("key"),
            "to_status": status_name_map.get(new_status_id, "Unknown"),
            "changed_at": trans["changed_at"]
        })

    # Track users who updated tickets (any change)
    for change in all_changes:
        changed_by = change.get("changed_by_id") or change.get("changed_by")  # Handle both field names
        if changed_by:
            user_activity[changed_by]["user_id"] = changed_by
            user_activity[changed_by]["user_name"] = await get_user_name(changed_by)
            user_activity[changed_by]["tickets_updated"] += 1

    # Sort team activity by most active
    team_activity = sorted(
        user_activity.values(),
        key=lambda x: x["tickets_moved"] + x["tickets_updated"],
        reverse=True
    )

    # Pre-fetch all entry transitions for every ticket across all statuses in one query,
    # keyed by (ticket_id, status_id/name) so the per-status loop below does zero DB calls.
    all_ticket_ids = (
        [t["ticket_id"] for movements in status_movements.values() for t in movements["tickets_moved_out"]]
        + [t["ticket_id"] for dist in current_status_distribution.values() for t in dist["tickets"]]
    )
    all_status_values = [str(s["status_number"]) for s in statuses] + [s["name"] for s in statuses]

    entry_transitions_raw = []
    if all_ticket_ids:
        entry_transitions_raw = await db["ticket_history"].find({
            "project_id": project_id,
            "ticket_id": {"$in": list(set(all_ticket_ids))},
            "field_name": {"$in": ["status_id", "status"]},
            "new_value": {"$in": all_status_values},
        }).sort("changed_at", 1).to_list(length=None)

    # Index: ticket_id -> list of entry transitions (ascending time), for fast lookup
    entry_trans_by_ticket: Dict[int, List[Dict]] = defaultdict(list)
    for et in entry_transitions_raw:
        entry_trans_by_ticket[et["ticket_id"]].append(et)

    def _find_last_entry(ticket_id: int, status_id: int, status_name: str, before=None) -> Optional[Dict]:
        """Return the most recent entry transition for a ticket into a given status."""
        candidates = entry_trans_by_ticket.get(ticket_id, [])
        matched = [
            t for t in candidates
            if t.get("new_value") in (str(status_id), status_name)
            and (before is None or t["changed_at"] < before)
        ]
        return matched[-1] if matched else None

    # Build status-specific metrics
    status_metrics = []
    for status in statuses:
        status_id = status["status_number"]
        status_name = status["name"]
        category = status_categories.get(status_id, "other")

        movements = status_movements[status_id]
        distribution = current_status_distribution[status_id]

        # Calculate average time in status (no DB calls — uses pre-fetched index)
        time_in_status_samples = []

        # 1. For tickets that MOVED OUT (completed cycles)
        for ticket_out in movements["tickets_moved_out"]:
            ticket_id = ticket_out["ticket_id"]
            entry_transition = _find_last_entry(ticket_id, status_id, status_name, before=ticket_out["changed_at"])

            if entry_transition:
                entry_time = entry_transition["changed_at"]
                exit_time = ticket_out["changed_at"]
                if entry_time and entry_time.tzinfo is None:
                    entry_time = entry_time.replace(tzinfo=timezone.utc)
                if exit_time and exit_time.tzinfo is None:
                    exit_time = exit_time.replace(tzinfo=timezone.utc)
                duration_hours = (exit_time - entry_time).total_seconds() / 3600
                time_in_status_samples.append(duration_hours)

        # 2. For tickets CURRENTLY IN this status (partial cycles)
        for ticket_info in distribution["tickets"]:
            ticket_id = ticket_info["ticket_id"]
            entry_transition = _find_last_entry(ticket_id, status_id, status_name)

            if entry_transition:
                entry_time = entry_transition["changed_at"]
                if entry_time and entry_time.tzinfo is None:
                    entry_time = entry_time.replace(tzinfo=timezone.utc)
                duration_hours = (now - entry_time).total_seconds() / 3600
                time_in_status_samples.append(duration_hours)
            else:
                created_at = ticket_info.get("created_at")
                if created_at:
                    if created_at.tzinfo is None:
                        created_at = created_at.replace(tzinfo=timezone.utc)
                    duration_hours = (now - created_at).total_seconds() / 3600
                    time_in_status_samples.append(duration_hours)

        avg_time_hours = sum(time_in_status_samples) / len(time_in_status_samples) if time_in_status_samples else None

        status_metrics.append({
            "status_id": status_id,
            "status_name": status_name,
            "category": category,
            "color": status.get("color", "#gray"),
            "position": status.get("position", 0),
            "current_count": distribution["count"],
            "moved_in": movements["moved_in"],
            "moved_out": movements["moved_out"],
            "net_moved_in": movements["net_moved_in"],  # Net displacement IN
            "net_moved_out": movements["net_moved_out"],  # Net displacement OUT
            "by_type": dict(distribution["by_type"]),
            "by_assignee": dict(distribution["by_assignee"]),
            "avg_time_in_status_hours": round(avg_time_hours, 1) if avg_time_hours else None,
            "tickets_moved_in_sample": movements["tickets_moved_in"][:5],  # First 5
            "tickets_moved_out_sample": movements["tickets_moved_out"][:5]  # First 5
        })

    # Build transition matrix for frontend display
    transition_matrix_display = []
    for from_status_id, to_statuses in transition_matrix.items():
        for to_status_id, count in to_statuses.items():
            transition_matrix_display.append({
                "from_status_id": from_status_id,
                "from_status_name": status_name_map[from_status_id],
                "to_status_id": to_status_id,
                "to_status_name": status_name_map[to_status_id],
                "count": count,
                "tickets_sample": transition_details[from_status_id][to_status_id][:3]
            })

    # Sort by count
    transition_matrix_display.sort(key=lambda x: x["count"], reverse=True)

    # Calculate summary metrics
    throughput = tickets_completed / (hours / 24) if hours >= 24 else tickets_completed  # per day

    # ========== Deadline & Due Date Analysis ==========
    # Reuse the already-fetched all_tickets list (no second DB call needed)
    overdue_tickets = []
    due_today_tickets = []
    due_soon_tickets = []  # 1-3 days
    due_this_week_tickets = []  # 4-7 days
    due_later_tickets = []  # 7+ days
    no_due_date_tickets = []

    for ticket in all_tickets:
        due_date = ticket.get("due_date")

        if not due_date:
            no_due_date_tickets.append(ticket)
            continue

        # Ensure timezone awareness
        if due_date.tzinfo is None:
            due_date = due_date.replace(tzinfo=timezone.utc)

        # Calculate days until due
        time_until_due = due_date - now
        days_until_due = time_until_due.total_seconds() / (24 * 3600)

        status_id = ticket.get("status_id")

        # Build ticket info — use .get() to avoid KeyError on sparse documents
        ticket_info = {
            "ticket_id": ticket.get("ticket_number"),
            "key": ticket.get("key", ""),
            "title": ticket.get("title", ""),
            "status_id": status_id,
            "status_name": status_name_map.get(status_id, "Unknown"),
            "assignee_id": ticket_assignee_uid(ticket),
            "priority": ticket.get("priority"),
            "due_date": due_date.isoformat(),
            "days_until_due": round(days_until_due, 1),
            "type": ticket.get("type"),
        }

        # Categorize by due date
        if days_until_due < 0:
            ticket_info["days_overdue"] = abs(round(days_until_due, 1))
            ticket_info["severity"] = "critical" if abs(days_until_due) > 7 else "high" if abs(days_until_due) > 3 else "medium"
            overdue_tickets.append(ticket_info)
        elif days_until_due < 1:
            ticket_info["severity"] = "high"
            due_today_tickets.append(ticket_info)
        elif days_until_due < 3:
            ticket_info["severity"] = "medium"
            due_soon_tickets.append(ticket_info)
        elif days_until_due < 7:
            ticket_info["severity"] = "low"
            due_this_week_tickets.append(ticket_info)
        else:
            ticket_info["severity"] = "normal"
            due_later_tickets.append(ticket_info)

    # Sort overdue by severity (most overdue first)
    overdue_tickets.sort(key=lambda t: t["days_overdue"], reverse=True)

    # Calculate at-risk metrics (overdue + in non-done statuses)
    done_status_ids = [sid for sid, cat in status_categories.items() if cat == "done"]
    at_risk_overdue = [t for t in overdue_tickets if t["status_id"] not in done_status_ids]

    # Deadline health score (0-100)
    # Higher score = healthier (fewer overdue, more on track)
    total_with_deadlines = len(overdue_tickets) + len(due_today_tickets) + len(due_soon_tickets) + len(due_this_week_tickets) + len(due_later_tickets)
    if total_with_deadlines > 0:
        on_track_count = len(due_this_week_tickets) + len(due_later_tickets)
        deadline_health_score = round((on_track_count / total_with_deadlines) * 100, 1)
    else:
        deadline_health_score = None

    # Compile report
    report = {
        "project_id": project_id,
        "project_name": project_name,
        "project_key": project_key,
        "generated_at": now.isoformat(),
        "time_window_hours": hours,
        "time_window_start": start_time.isoformat(),
        "time_window_end": now.isoformat(),

        # Summary metrics
        "summary": {
            "tickets_created": tickets_created,
            "tickets_completed": tickets_completed,
            "tickets_updated": len(updated_ticket_ids),
            "tickets_in_progress": tickets_in_progress,
            "tickets_blocked": tickets_blocked,
            "throughput_per_day": round(throughput, 2),
            "total_statuses": len(statuses),
            "regressions_count": len(regressions),
            "critical_blockers_count": len([t for t in blocked_tickets_detailed if t.get("is_critical")]),
            "overdue_count": len(overdue_tickets),
            "at_risk_overdue_count": len(at_risk_overdue),
        },

        # Status-specific metrics (ordered by position)
        "status_metrics": status_metrics,

        # Transition analysis
        "transitions": {
            "matrix": transition_matrix_display[:10],  # Top 10 transitions
            "regressions": regressions
        },

        # Blockers & Risks
        "blockers": {
            "total_blocked": tickets_blocked,
            "blocked_tickets": blocked_tickets_detailed[:10],  # Top 10 by duration
            "critical_count": len([t for t in blocked_tickets_detailed if t.get("is_critical")])
        },

        # Stale tickets
        "stale_tickets": stale_tickets[:10],  # Top 10 by staleness

        # Team activity
        "team_activity": team_activity[:10],  # Top 10 contributors

        # Deadlines & Due Dates
        "deadlines": {
            "health_score": deadline_health_score,
            "total_with_deadlines": total_with_deadlines,
            "total_without_deadlines": len(no_due_date_tickets),
            "overdue": {
                "count": len(overdue_tickets),
                "at_risk_count": len(at_risk_overdue),  # Overdue + not done
                "tickets": overdue_tickets[:10],  # Top 10 most overdue
            },
            "due_today": {
                "count": len(due_today_tickets),
                "tickets": due_today_tickets,
            },
            "due_soon": {
                "count": len(due_soon_tickets),
                "label": "Due in 1-3 days",
                "tickets": due_soon_tickets[:10],
            },
            "due_this_week": {
                "count": len(due_this_week_tickets),
                "label": "Due in 4-7 days",
                "tickets": due_this_week_tickets[:10],
            },
            "due_later": {
                "count": len(due_later_tickets),
                "label": "Due in 7+ days",
                "tickets": due_later_tickets[:5],  # Show fewer for later items
            },
        },

        # Metadata
        "metadata": {
            "status_categories": {
                "done": [status_name_map[sid] for sid in done_statuses],
                "blocked": [status_name_map[sid] for sid in blocked_statuses],
                "in_progress": [status_name_map[sid] for sid in in_progress_statuses],
                "todo": [status_name_map[sid] for sid, cat in status_categories.items() if cat == "todo"]
            }
        }
    }

    return report
