"""Report generation — computes project metrics for a project."""

from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from motor.motor_asyncio import AsyncIOMotorDatabase


async def get_project_report(db: AsyncIOMotorDatabase, project_id: int) -> dict[str, Any]:
    """Compute all metrics for a project and return a structured report."""
    now = datetime.now(timezone.utc)
    week_ago = now - timedelta(days=7)
    month_ago = now - timedelta(days=30)

    # -----------------------------------------------------------------------
    # Raw ticket data
    # -----------------------------------------------------------------------
    all_tickets = await db["tickets"].find({"project_id": project_id}).to_list(length=None)
    statuses = await db["ticket_statuses"].find({"project_id": project_id}).to_list(length=None)
    members = await db["project_members"].find({"project_id": project_id, "active": True}).to_list(length=None)

    # Also include the project owner
    project = await db["projects"].find_one({"project_number": project_id})
    if project and project.get("owner_id"):
        owner_ids = {m.get("user_id") for m in members}
        if project["owner_id"] not in owner_ids:
            owner_doc = await db["users"].find_one({"user_number": project["owner_id"]})
            if owner_doc:
                members.append({"user_id": owner_doc["user_number"], "name": owner_doc.get("name", "Owner")})

    # Build status lookup
    status_map: dict[int, str] = {s["status_number"]: s["name"] for s in statuses}
    # Heuristic: "done" statuses contain "done" or "closed" or "completed" in the name
    done_status_ids = {
        s["status_number"] for s in statuses
        if any(kw in s["name"].lower() for kw in ("done", "closed", "completed", "resolved"))
    }

    # -----------------------------------------------------------------------
    # Basic counts
    # -----------------------------------------------------------------------
    total_tickets = len(all_tickets)
    open_tickets = [t for t in all_tickets if t.get("status_id") not in done_status_ids]
    closed_tickets = [t for t in all_tickets if t.get("status_id") in done_status_ids]

    created_this_week = [t for t in all_tickets if t.get("created_at") and t["created_at"] >= week_ago]
    created_this_month = [t for t in all_tickets if t.get("created_at") and t["created_at"] >= month_ago]
    closed_this_week = [t for t in closed_tickets if t.get("updated_at") and t["updated_at"] >= week_ago]
    closed_this_month = [t for t in closed_tickets if t.get("updated_at") and t["updated_at"] >= month_ago]

    # -----------------------------------------------------------------------
    # Email -> user_number map so email-only tickets can be grouped by user
    # -----------------------------------------------------------------------
    all_users = await db["users"].find({}).to_list(length=None)
    email_to_user_number = {u.get("email"): u.get("user_number") for u in all_users if u.get("email")}

    def _ticket_assignee_uid(ticket: dict) -> Optional[int]:
        ae = ticket.get("assignee_email")
        if ae:
            return email_to_user_number.get(ae)
        return ticket.get("assignee_id")

    # -----------------------------------------------------------------------
    # Backlog health
    # -----------------------------------------------------------------------
    unassigned = [t for t in open_tickets if not _ticket_assignee_uid(t)]
    overdue = [
        t for t in open_tickets
        if t.get("due_date") and t["due_date"] < now
    ]

    # -----------------------------------------------------------------------
    # Tickets per assignee
    # -----------------------------------------------------------------------
    member_map: dict[int, str] = {}
    for m in members:
        uid = m.get("user_id")
        if not uid and m.get("user_email"):
            uid = email_to_user_number.get(m.get("user_email"))
        if uid:
            member_map[uid] = m.get("name", m.get("email", f"User {uid}"))

    assignee_stats: dict[str, dict[str, int]] = {}
    for t in all_tickets:
        aid = _ticket_assignee_uid(t)
        name = member_map.get(aid, "Unassigned") if aid else "Unassigned"
        if name not in assignee_stats:
            assignee_stats[name] = {"open": 0, "closed": 0, "total": 0}
        assignee_stats[name]["total"] += 1
        if t.get("status_id") in done_status_ids:
            assignee_stats[name]["closed"] += 1
        else:
            assignee_stats[name]["open"] += 1

    # -----------------------------------------------------------------------
    # Status distribution
    # -----------------------------------------------------------------------
    status_distribution: dict[str, int] = {}
    for t in all_tickets:
        sname = status_map.get(t.get("status_id", 0), "Unknown")
        status_distribution[sname] = status_distribution.get(sname, 0) + 1

    # -----------------------------------------------------------------------
    # Velocity (tickets closed per week, last 4 weeks)
    # -----------------------------------------------------------------------
    velocity: list[dict[str, Any]] = []
    for weeks_back in range(3, -1, -1):  # 3, 2, 1, 0
        start = now - timedelta(weeks=weeks_back + 1)
        end = now - timedelta(weeks=weeks_back)
        closed_in_window = [
            t for t in closed_tickets
            if t.get("updated_at") and start <= t["updated_at"] < end
        ]
        label = f"Week -{weeks_back}" if weeks_back > 0 else "This week"
        velocity.append({"label": label, "closed": len(closed_in_window)})

    # -----------------------------------------------------------------------
    # Assemble report
    # -----------------------------------------------------------------------
    report: dict[str, Any] = {
        "project_id": project_id,
        "generated_at": now.isoformat(),
        "summary": {
            "total_tickets": total_tickets,
            "open": len(open_tickets),
            "closed": len(closed_tickets),
            "created_this_week": len(created_this_week),
            "created_this_month": len(created_this_month),
            "closed_this_week": len(closed_this_week),
            "closed_this_month": len(closed_this_month),
            "unassigned": len(unassigned),
            "overdue": len(overdue),
        },
        "assignee_stats": assignee_stats,
        "status_distribution": status_distribution,
        "velocity": velocity,
    }

    return report
