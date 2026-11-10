"""Dashboard metrics and analytics endpoints."""

from typing import Annotated, List, Optional
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from ..db.mongo import get_mongo_db
from ..core.security import get_current_user, CurrentUser
from ..services.status_category import categorize_status
from ..schemas.dashboard import DashboardMetrics, DashboardTicket


router = APIRouter(prefix="/dashboard", tags=["dashboard"])


async def _accessible_project_ids(
  db: AsyncIOMotorDatabase, current_user: CurrentUser
) -> Optional[List[int]]:
  """Project ids the caller may see, or None for a global admin (no restriction)."""
  if current_user.role == "admin":
    return None
  or_clauses: List[dict] = [{"user_email": current_user.email}]
  if current_user.id is not None:
    or_clauses.append({"user_id": current_user.id})
  members = await db["project_members"].find(
    {"$or": or_clauses,
     "$and": [{"$or": [{"active": True}, {"active": {"$exists": False}}]}]},
    {"_id": 0, "project_id": 1},
  ).to_list(length=None)
  return sorted({m["project_id"] for m in members if m.get("project_id") is not None})


async def _load_dashboard_data(
  db: AsyncIOMotorDatabase,
  project_id: Optional[int] = None,
  allowed_project_ids: Optional[List[int]] = None,
):
  """Internal helper to load tickets and status metadata used by dashboard endpoints.

  Scope is enforced here so the dashboard can never widen a user's view:
  - project_id given: that one project only (the caller has already checked access);
  - allowed_project_ids given: restricted to those projects (the caller's own);
  - both None: no restriction — only a global admin reaches this.
  """
  tickets_collection = db["tickets"]
  statuses_collection = db["ticket_statuses"]
  ticket_types_collection = db["ticket_types"]
  users_collection = db["users"]

  if project_id is not None:
    scope: dict = {"project_id": project_id}
  elif allowed_project_ids is not None:
    scope = {"project_id": {"$in": allowed_project_ids}}
  else:
    scope = {}
  all_tickets = await tickets_collection.find(scope).to_list(length=None)
  # Statuses are project-specific; keep them to the same scope.
  all_statuses = await statuses_collection.find(scope).to_list(length=None)
  total_issues = len(all_tickets)

  # Status name → id mapping
  status_map: dict[str, int] = {}
  for status in all_statuses:
    status_name = status.get("name", "").lower()
    status_id = status.get("status_number")
    status_map[status_name] = status_id

  # Done / in-progress status ids
  done_status_ids: list[int] = []
  for name in ["done", "closed", "completed", "resolved"]:
    if name in status_map:
      done_status_ids.append(status_map[name])

  in_progress_status_ids: list[int] = []
  for name in ["in progress", "in development", "active", "working"]:
    if name in status_map:
      in_progress_status_ids.append(status_map[name])

  now = datetime.now(timezone.utc)
  now_iso = now.isoformat()

  # Overdue count
  overdue = 0
  for ticket in all_tickets:
    if ticket.get("status_id") not in done_status_ids:
      due_date = ticket.get("due_date")
      if due_date:
        if isinstance(due_date, str):
          due_date_str = due_date
        else:
          due_date_str = due_date.isoformat() if isinstance(due_date, datetime) else None

        if due_date_str and due_date_str < now_iso:
          overdue += 1

  # Due date metrics
  from datetime import timedelta
  today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
  today_end = today_start + timedelta(days=1)
  seven_days_from_now = today_start + timedelta(days=7)

  due_today = 0
  due_soon = 0
  past_due = 0

  for ticket in all_tickets:
    if ticket.get("status_id") not in done_status_ids:
      due_date = ticket.get("due_date")
      if due_date:
        if isinstance(due_date, str):
          try:
            due_date_dt = datetime.fromisoformat(due_date.replace("Z", "+00:00"))
          except Exception:
            continue
        elif isinstance(due_date, datetime):
          due_date_dt = due_date
        else:
          continue

        if due_date_dt.tzinfo is None:
          due_date_dt = due_date_dt.replace(tzinfo=timezone.utc)

        if due_date_dt < today_start:
          past_due += 1
        elif today_start <= due_date_dt < today_end:
          due_today += 1
        elif today_end <= due_date_dt < seven_days_from_now:
          due_soon += 1

  # Status distribution - only include statuses that have tickets
  status_distribution = []
  for status in all_statuses:
    status_id = status.get("status_number")
    status_name = status.get("name", "Unknown")
    count = sum(1 for ticket in all_tickets if ticket.get("status_id") == status_id)
    # Only include statuses that have tickets in this project
    if count > 0:
      status_distribution.append(
        {
          "name": status_name,
          "count": count,
          "color": status.get("color", "#6b7280"),
        }
      )

  # Type distribution (Task / Bug only) - derive from tickets in this project
  default_type_colors = {
    "task": "#3b82f6",
    "bug": "#ef4444",
  }
  type_distribution = []

  # Get unique types from filtered tickets (only Task and Bug)
  ticket_type_values = {
    ticket.get("type", "").lower()
    for ticket in all_tickets
    if ticket.get("type") and ticket.get("type", "").lower() in ["task", "bug"]
  }
  
  # Count tickets for each type
  for type_value in sorted(ticket_type_values):
    count = sum(
      1 for ticket in all_tickets if ticket.get("type", "").lower() == type_value
    )
    # Only include types that have tickets
    if count > 0:
      type_distribution.append(
        {
          "name": type_value.capitalize(),
          "count": count,
          "color": default_type_colors.get(type_value, "#6b7280"),
          "icon": "",
        }
      )

  # Completion / in-progress counts
  completed = sum(
    1 for ticket in all_tickets if ticket.get("status_id") in done_status_ids
  )
  in_progress = sum(
    1 for ticket in all_tickets if ticket.get("status_id") in in_progress_status_ids
  )
  completion_rate = (completed / total_issues * 100) if total_issues > 0 else 0.0

  # Recent activity
  tickets_with_timestamps = [
    t for t in all_tickets if t.get("updated_at") or t.get("created_at")
  ]
  recent_tickets = sorted(
    tickets_with_timestamps,
    key=lambda t: t.get("updated_at") or t.get("created_at"),
    reverse=True,
  )[:10]

  recent_activity = []
  for ticket in recent_tickets:
    # Prefer reporter_email, fall back to legacy reporter_id
    reporter_email = ticket.get("reporter_email")
    if reporter_email:
      user = await users_collection.find_one({"email": reporter_email})
    else:
      user = await users_collection.find_one({"user_number": ticket.get("reporter_id")})
    if user:
      user_name = user.get("name", "Unknown")
    elif reporter_email:
      user_name = reporter_email.split("@")[0]
    else:
      user_name = "Unknown"

    timestamp = ticket.get("updated_at", ticket.get("created_at", ""))
    if isinstance(timestamp, datetime):
      timestamp = timestamp.isoformat()

    recent_activity.append(
      {
        "ticket_key": ticket.get("key", ""),
        "title": ticket.get("title", ""),
        "action": "updated" if ticket.get("updated_at") else "created",
        "user_name": user_name,
        "timestamp": timestamp if isinstance(timestamp, str) else "",
      }
    )

  return {
    "all_tickets": all_tickets,
    "total_issues": total_issues,
    "done_status_ids": done_status_ids,
    "in_progress_status_ids": in_progress_status_ids,
    "overdue": overdue,
    "due_today": due_today,
    "due_soon": due_soon,
    "past_due": past_due,
    "status_distribution": status_distribution,
    "type_distribution": type_distribution,
    "completed": completed,
    "in_progress": in_progress,
    "completion_rate": completion_rate,
    "recent_activity": recent_activity,
  }


@router.get("/metrics", response_model=DashboardMetrics)
async def get_dashboard_metrics(
  db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
  current_user: Annotated[CurrentUser, Depends(get_current_user)],
  project_id: Optional[int] = Query(None, description="Filter metrics by project ID"),
):
  """Get dashboard metrics including ticket counts, status distribution, and type distribution."""
  allowed = await _accessible_project_ids(db, current_user)
  if project_id is not None and allowed is not None and project_id not in allowed:
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You don't have access to this project")
  data = await _load_dashboard_data(db, project_id=project_id, allowed_project_ids=allowed)

  return {
    "totalIssues": data["total_issues"],
    "completed": data["completed"],
    "inProgress": data["in_progress"],
    "overdue": data["overdue"],
    "completionRate": round(data["completion_rate"], 1),
    "dueDateMetrics": {
      "dueSoon": data["due_soon"],
      "dueToday": data["due_today"],
      "pastDue": data["past_due"],
    },
    "statusDistribution": data["status_distribution"],
    "typeDistribution": data["type_distribution"],
    "recentActivity": data["recent_activity"],
  }


@router.get("/tickets", response_model=List[DashboardTicket])
async def get_dashboard_tickets(
  db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
  current_user: Annotated[CurrentUser, Depends(get_current_user)],
  segment: str = Query(
    "total",
    description=(
      "Ticket segment to return. "
      "One of: total, completed, inProgress, overdue, dueToday, dueSoon, pastDue."
    ),
  ),
  project_id: Optional[int] = Query(None, description="Filter tickets by project ID"),
):
  """Return the list of tickets backing each dashboard metric card."""
  allowed = await _accessible_project_ids(db, current_user)
  if project_id is not None and allowed is not None and project_id not in allowed:
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You don't have access to this project")
  data = await _load_dashboard_data(db, project_id=project_id, allowed_project_ids=allowed)

  all_tickets = data["all_tickets"]
  done_status_ids = data["done_status_ids"]
  in_progress_status_ids = data["in_progress_status_ids"]

  from datetime import timedelta
  now = datetime.now(timezone.utc)
  today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
  today_end = today_start + timedelta(days=1)
  seven_days_from_now = today_start + timedelta(days=7)

  def is_past_due(ticket: dict) -> bool:
    if ticket.get("status_id") in done_status_ids:
      return False
    due_date = ticket.get("due_date")
    if not due_date:
      return False
    if isinstance(due_date, str):
      try:
        due_date_dt = datetime.fromisoformat(due_date.replace("Z", "+00:00"))
      except Exception:
        return False
    elif isinstance(due_date, datetime):
      due_date_dt = due_date
    else:
      return False
    if due_date_dt.tzinfo is None:
      due_date_dt = due_date_dt.replace(tzinfo=timezone.utc)
    return due_date_dt < today_start

  def is_due_today(ticket: dict) -> bool:
    if ticket.get("status_id") in done_status_ids:
      return False
    due_date = ticket.get("due_date")
    if not due_date:
      return False
    if isinstance(due_date, str):
      try:
        due_date_dt = datetime.fromisoformat(due_date.replace("Z", "+00:00"))
      except Exception:
        return False
    elif isinstance(due_date, datetime):
      due_date_dt = due_date
    else:
      return False
    if due_date_dt.tzinfo is None:
      due_date_dt = due_date_dt.replace(tzinfo=timezone.utc)
    return today_start <= due_date_dt < today_end

  def is_due_soon(ticket: dict) -> bool:
    if ticket.get("status_id") in done_status_ids:
      return False
    due_date = ticket.get("due_date")
    if not due_date:
      return False
    if isinstance(due_date, str):
      try:
        due_date_dt = datetime.fromisoformat(due_date.replace("Z", "+00:00"))
      except Exception:
        return False
    elif isinstance(due_date, datetime):
      due_date_dt = due_date
    else:
      return False
    if due_date_dt.tzinfo is None:
      due_date_dt = due_date_dt.replace(tzinfo=timezone.utc)
    return today_end <= due_date_dt < seven_days_from_now

  # Filter tickets by requested segment
  if segment == "completed":
    filtered = [
      t for t in all_tickets if t.get("status_id") in done_status_ids
    ]
  elif segment == "inProgress":
    filtered = [
      t for t in all_tickets if t.get("status_id") in in_progress_status_ids
    ]
  elif segment == "overdue" or segment == "pastDue":
    filtered = [t for t in all_tickets if is_past_due(t)]
  elif segment == "dueToday":
    filtered = [t for t in all_tickets if is_due_today(t)]
  elif segment == "dueSoon":
    filtered = [t for t in all_tickets if is_due_soon(t)]
  else:
    # "total" or unknown segment
    filtered = list(all_tickets)

  # Map to DashboardTicket
  users_collection = db["users"]
  results: List[DashboardTicket] = []
  for ticket in filtered:
    assignee_name: Optional[str] = None
    assignee_email = ticket.get("assignee_email")
    if assignee_email:
      user = await users_collection.find_one({"email": assignee_email})
      assignee_name = user.get("name") if user else assignee_email.split("@")[0]
    elif ticket.get("assignee_id"):
      user = await users_collection.find_one({"user_number": ticket.get("assignee_id")})
      if user:
        assignee_name = user.get("name", "Unknown")
        assignee_email = user.get("email")

    results.append(
      DashboardTicket(
        id=ticket.get("ticket_number"),
        project_id=ticket.get("project_id"),
        key=ticket.get("key"),
        title=ticket.get("title", ""),
        assignee_email=assignee_email,
        assignee_name=assignee_name,
        priority=ticket.get("priority"),
        due_date=ticket.get("due_date"),
      )
    )

  return results


@router.get("/your-work")
async def get_your_work(
  db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
  current_user: Annotated[CurrentUser, Depends(get_current_user)],
  project_id: Optional[int] = Query(None, description="Filter by project ID"),
):
  """Get personalized 'Your Work' dashboard data for the current user."""
  tickets_collection = db["tickets"]
  users_collection = db["users"]
  statuses_collection = db["ticket_statuses"]

  user_id = current_user.id
  user_email = current_user.email

  # Build query filter (prefer assignee_email; fall back to legacy assignee_id)
  query_filter: dict = {
    "$or": [
      {"assignee_email": user_email},
      {"assignee_id": user_id},
    ]
  }
  if project_id is not None:
    query_filter["project_id"] = project_id

  # Get all tickets assigned to current user
  assigned_tickets = await tickets_collection.find(query_filter).to_list(length=None)

  # Get all statuses (for categorization). status_number is unique per project, NOT globally,
  # so collect every id whose name maps to a given category — collisions across projects are real.
  all_statuses = await statuses_collection.find().to_list(length=None)

  def _ids_matching(buckets: List[str]) -> List[int]:
    wanted = {b.strip().lower() for b in buckets}
    return [
      int(s["status_number"])
      for s in all_statuses
      if (s.get("name") or "").strip().lower() in wanted and s.get("status_number") is not None
    ]

  todo_status_ids        = _ids_matching(["to do", "backlog", "open", "new", "ready to pick"])
  in_progress_status_ids = _ids_matching(["in progress", "in development", "active", "working"])
  in_review_status_ids   = _ids_matching(["in review", "review", "code review", "testing", "qa"])
  done_status_ids        = _ids_matching(["done", "closed", "completed", "resolved"])

  # Helper function to format tickets
  async def format_ticket(ticket):
    assignee_name = None
    assignee_email = ticket.get("assignee_email")
    if assignee_email:
      user = await users_collection.find_one({"email": assignee_email})
      assignee_name = user.get("name") if user else assignee_email.split("@")[0]
    elif ticket.get("assignee_id"):
      user = await users_collection.find_one({"user_number": ticket.get("assignee_id")})
      if user:
        assignee_name = user.get("name")
        assignee_email = user.get("email")

    updated_at = ticket.get("updated_at", ticket.get("created_at", ""))
    if isinstance(updated_at, datetime):
      updated_at = updated_at.isoformat()

    created_at = ticket.get("created_at", "")
    if isinstance(created_at, datetime):
      created_at = created_at.isoformat()

    due_date = ticket.get("due_date")
    if isinstance(due_date, datetime):
      due_date = due_date.isoformat()

    status_doc = next((s for s in all_statuses if s.get("status_number") == ticket.get("status_id")), None)
    status_name = status_doc.get("name") if status_doc else "Unknown"
    return {
      "id": ticket.get("ticket_number"),
      "key": ticket.get("key"),
      "title": ticket.get("title", ""),
      "status": status_name,
      "status_color": status_doc.get("color") if status_doc else None,
      "status_category": categorize_status(status_name),
      "project_id": ticket.get("project_id"),
      "project_key": "",  # Will need to fetch from projects if needed
      "project_name": "",  # Will need to fetch from projects if needed
      "priority": ticket.get("priority"),
      "assignee_email": assignee_email,
      "assignee_name": assignee_name,
      "updated_at": updated_at,
      "created_at": created_at,
      "due_date": due_date,
      "type": ticket.get("type"),
    }

  # Categorize assigned tickets
  todo_tickets = []
  in_progress_tickets = []
  in_review_tickets = []

  for ticket in assigned_tickets:
    status_id = ticket.get("status_id")
    if status_id in done_status_ids:
      continue  # Skip completed tickets

    formatted = await format_ticket(ticket)

    if status_id in todo_status_ids:
      todo_tickets.append(formatted)
    elif status_id in in_progress_status_ids:
      in_progress_tickets.append(formatted)
    elif status_id in in_review_status_ids:
      in_review_tickets.append(formatted)
    else:
      # Default to todo if status doesn't match
      todo_tickets.append(formatted)

  # Get recently viewed tickets (last 10 unique tickets updated by or assigned to user).
  # Prefer email fields; fall back to legacy *_id for pre-migration docs.
  all_user_tickets = await tickets_collection.find(
    {"$or": [
      {"assignee_email": user_email},
      {"reporter_email": user_email},
      {"assignee_id": user_id},
      {"reporter_id": user_id},
    ]}
  ).to_list(length=None)

  # Sort by last updated — normalize datetimes so we never compare str vs datetime
  # (migration paths produced a mix of native datetime and ISO-string values).
  _FAR_PAST = datetime.min.replace(tzinfo=timezone.utc)

  def _sort_key(t: dict) -> datetime:
    for field in ("updated_at", "created_at"):
      v = t.get(field)
      if isinstance(v, datetime):
        return v if v.tzinfo is not None else v.replace(tzinfo=timezone.utc)
      if isinstance(v, str) and v:
        try:
          parsed = datetime.fromisoformat(v.replace("Z", "+00:00"))
          return parsed if parsed.tzinfo is not None else parsed.replace(tzinfo=timezone.utc)
        except ValueError:
          continue
    return _FAR_PAST

  recently_viewed = sorted(all_user_tickets, key=_sort_key, reverse=True)[:10]

  recently_viewed_formatted = [await format_ticket(t) for t in recently_viewed]

  # Calculate quick stats for this week
  from datetime import timedelta
  now = datetime.now(timezone.utc)
  week_start = now - timedelta(days=7)

  def make_aware(dt):
    """Convert naive datetime to UTC-aware datetime"""
    if isinstance(dt, datetime):
      return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt
    elif isinstance(dt, str):
      return datetime.fromisoformat(dt.replace("Z", "+00:00"))
    return None

  created_this_week = len([
    t for t in assigned_tickets
    if t.get("created_at") and make_aware(t["created_at"]) >= week_start
  ])

  completed_this_week = len([
    t for t in assigned_tickets
    if t.get("status_id") in done_status_ids and t.get("updated_at") and make_aware(t["updated_at"]) >= week_start
  ])

  # Get activity stream (recent updates on user's tickets)
  recent_activity = []
  for ticket in recently_viewed[:5]:
    reporter_email = ticket.get("reporter_email")
    if reporter_email:
      user = await users_collection.find_one({"email": reporter_email})
    else:
      user = await users_collection.find_one({"user_number": ticket.get("reporter_id")})
    if user:
      user_name = user.get("name", "Unknown")
    elif reporter_email:
      user_name = reporter_email.split("@")[0]
    else:
      user_name = "Unknown"

    timestamp = ticket.get("updated_at", ticket.get("created_at", ""))
    if isinstance(timestamp, datetime):
      timestamp = timestamp.isoformat()

    recent_activity.append({
      "id": ticket.get("ticket_number"),
      "issue_key": ticket.get("key", ""),
      "issue_title": ticket.get("title", ""),
      "action": "updated" if ticket.get("updated_at") else "created",
      "user_name": user_name,
      "timestamp": timestamp,
    })

  return {
    "recentlyViewed": recently_viewed_formatted,
    "assignedToMe": {
      "todo": todo_tickets,
      "inProgress": in_progress_tickets,
      "inReview": in_review_tickets,
    },
    "watching": [],  # Placeholder - implement watching feature if needed
    "activityStream": recent_activity,
    "quickStats": {
      "created_this_week": created_this_week,
      "completed_this_week": completed_this_week,
      "hours_logged_this_week": 0,  # Placeholder - implement time tracking if needed
    },
    "savedFilters": [
      {"id": 1, "name": "My open issues", "query": "assignee=me AND status!=Done", "count": len(assigned_tickets)},
      {"id": 2, "name": "Recently updated", "query": "updated>-7d", "count": len(recently_viewed)},
    ],
  }


@router.get("/summary")
async def get_dashboard_summary(
  db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
  current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
  """Cross-project PM "current status" aggregates for the current user.

  Returns the data needed to populate the urgency-focused dashboard:
  overdue / due-today / blocked / at-risk ticket lists, in-progress work,
  active sprints the user is on, my epics, my releases, recent activity,
  and quick weekly stats. Computed server-side to avoid shipping every
  ticket to the client.
  """
  from datetime import timedelta

  tickets_collection = db["tickets"]
  users_collection = db["users"]
  statuses_collection = db["ticket_statuses"]
  projects_collection = db["projects"]
  sprints_collection = db["sprints"]
  releases_collection = db["releases"]
  worklogs_collection = db["worklogs"]

  user_id = current_user.id
  user_email = current_user.email

  now = datetime.now(timezone.utc)
  today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
  today_end = today_start + timedelta(days=1)
  three_days_out = today_start + timedelta(days=3)
  week_ago = now - timedelta(days=7)

  # --- statuses (categorized) ---
  all_statuses = await statuses_collection.find().to_list(length=None)

  def _ids_matching(buckets: List[str]) -> set[int]:
    wanted = {b.strip().lower() for b in buckets}
    return {
      int(s["status_number"])
      for s in all_statuses
      if (s.get("name") or "").strip().lower() in wanted and s.get("status_number") is not None
    }

  todo_ids        = _ids_matching(["to do", "backlog", "open", "new", "ready to pick"])
  in_progress_ids = _ids_matching(["in progress", "in development", "active", "working"])
  in_review_ids   = _ids_matching(["in review", "review", "code review"])
  testing_ids     = _ids_matching(["testing", "qa"])
  blocked_ids     = _ids_matching(["blocked"])
  done_ids        = _ids_matching(["done", "closed", "completed", "resolved"])

  status_name_by_id: dict[int, str] = {
    int(s["status_number"]): s.get("name", "Unknown")
    for s in all_statuses
    if s.get("status_number") is not None
  }
  # Configured hex colour per status, so the dashboard paints status chips the
  # same way the board does (via statusChipStyle on the client).
  status_color_by_id: dict[int, Optional[str]] = {
    int(s["status_number"]): s.get("color")
    for s in all_statuses
    if s.get("status_number") is not None
  }

  # --- assigned tickets (by email, fall back to legacy id) ---
  assigned_tickets = await tickets_collection.find({
    "$or": [
      {"assignee_email": user_email},
      {"assignee_id": user_id},
    ],
  }).to_list(length=None)

  # --- project lookup map ---
  project_ids = {t.get("project_id") for t in assigned_tickets if t.get("project_id") is not None}
  projects = await projects_collection.find({"project_number": {"$in": list(project_ids)}}).to_list(length=None) if project_ids else []
  project_by_id: dict[int, dict] = {p.get("project_number"): p for p in projects}

  def _parse_dt(v) -> Optional[datetime]:
    if isinstance(v, datetime):
      return v if v.tzinfo is not None else v.replace(tzinfo=timezone.utc)
    if isinstance(v, str) and v:
      try:
        parsed = datetime.fromisoformat(v.replace("Z", "+00:00"))
        return parsed if parsed.tzinfo is not None else parsed.replace(tzinfo=timezone.utc)
      except ValueError:
        return None
    return None

  def _is_urgent(priority: Optional[str]) -> bool:
    if not priority:
      return False
    p = priority.strip().lower()
    return p == "urgent"

  def _shape(ticket: dict) -> dict:
    proj = project_by_id.get(ticket.get("project_id"), {})
    updated = ticket.get("updated_at") or ticket.get("created_at")
    if isinstance(updated, datetime):
      updated = updated.isoformat()
    due = ticket.get("due_date")
    if isinstance(due, datetime):
      due = due.isoformat()
    status_name = status_name_by_id.get(ticket.get("status_id"), "Unknown")
    return {
      "id": ticket.get("ticket_number"),
      "key": ticket.get("key"),
      "title": ticket.get("title", ""),
      "status": status_name,
      "status_id": ticket.get("status_id"),
      "status_color": status_color_by_id.get(ticket.get("status_id")),
      "status_category": categorize_status(status_name),
      "project_id": ticket.get("project_id"),
      "project_key": proj.get("key", ""),
      "project_name": proj.get("name", ""),
      "priority": ticket.get("priority"),
      "type": ticket.get("type"),
      "due_date": due,
      "updated_at": updated,
    }

  overdue: list[dict] = []
  due_today: list[dict] = []
  blocked: list[dict] = []
  urgent_open: list[dict] = []
  in_progress: list[dict] = []
  at_risk: list[dict] = []

  for t in assigned_tickets:
    status_id = t.get("status_id")
    if status_id in done_ids:
      continue

    shape = _shape(t)
    due_dt = _parse_dt(t.get("due_date"))

    if status_id in blocked_ids:
      blocked.append(shape)

    if due_dt is not None:
      if due_dt < today_start:
        overdue.append(shape)
      elif today_start <= due_dt < today_end:
        due_today.append(shape)
      elif today_end <= due_dt < three_days_out and (status_id in todo_ids or status_id not in (in_progress_ids | in_review_ids | testing_ids | blocked_ids)):
        # Soon-due but not yet started
        at_risk.append(shape)

    if status_id in in_progress_ids:
      in_progress.append(shape)

    if _is_urgent(t.get("priority")) and status_id not in done_ids:
      urgent_open.append(shape)

  # Sort lists for stable presentation
  overdue.sort(key=lambda x: x.get("due_date") or "")
  due_today.sort(key=lambda x: x.get("due_date") or "")
  blocked.sort(key=lambda x: x.get("updated_at") or "", reverse=True)
  at_risk.sort(key=lambda x: x.get("due_date") or "")
  in_progress.sort(key=lambda x: x.get("updated_at") or "", reverse=True)
  urgent_open.sort(key=lambda x: x.get("due_date") or "zzz")

  # --- active sprints I'm on ---
  active_sprints_raw = await sprints_collection.find({"state": "active"}).to_list(length=None)
  my_sprints: list[dict] = []
  for sprint in active_sprints_raw:
    proj_id = sprint.get("project_id")
    sprint_id = sprint.get("sprint_number")
    # Only sprints that contain at least one ticket assigned to me
    sprint_tickets = [
      t for t in assigned_tickets
      if t.get("project_id") == proj_id and t.get("sprint_id") == sprint_id
    ]
    if not sprint_tickets:
      continue

    # Completion: all tickets in this sprint (not just mine) for accurate progress
    all_sprint_tickets = await tickets_collection.find({
      "project_id": proj_id,
      "sprint_id": sprint_id,
    }).to_list(length=None)
    total = len(all_sprint_tickets)
    completed = sum(1 for t in all_sprint_tickets if t.get("status_id") in done_ids)
    progress = round((completed / total * 100) if total > 0 else 0.0, 1)

    end_dt = _parse_dt(sprint.get("end_date"))
    days_remaining = None
    if end_dt is not None:
      days_remaining = max(0, (end_dt.date() - now.date()).days)

    proj = project_by_id.get(proj_id, {})
    my_sprints.append({
      "id": sprint_id,
      "project_id": proj_id,
      "project_key": proj.get("key", ""),
      "project_name": proj.get("name", ""),
      "name": sprint.get("name", ""),
      "goal": sprint.get("goal"),
      "end_date": sprint.get("end_date").isoformat() if isinstance(sprint.get("end_date"), datetime) else sprint.get("end_date"),
      "days_remaining": days_remaining,
      "total_tickets": total,
      "completed_tickets": completed,
      "my_tickets": len(sprint_tickets),
      "progress_percentage": progress,
    })

  my_sprints.sort(key=lambda s: (s.get("days_remaining") if s.get("days_remaining") is not None else 999))

  # --- my epics (tickets with type=epic where I am assignee OR reporter) ---
  my_epics_raw = await tickets_collection.find({
    "type": "epic",
    "$or": [
      {"assignee_email": user_email},
      {"assignee_id": user_id},
      {"reporter_email": user_email},
      {"reporter_id": user_id},
    ],
  }).to_list(length=None)

  my_epics: list[dict] = []
  for epic in my_epics_raw:
    if epic.get("status_id") in done_ids:
      continue
    epic_id = epic.get("ticket_number")
    proj_id = epic.get("project_id")
    # Progress: count child tickets linked via epic_id
    child_tickets = await tickets_collection.find({
      "project_id": proj_id,
      "epic_id": epic_id,
    }).to_list(length=None)
    total_children = len(child_tickets)
    completed_children = sum(1 for c in child_tickets if c.get("status_id") in done_ids)
    progress = round((completed_children / total_children * 100) if total_children > 0 else 0.0, 1)
    proj = project_by_id.get(proj_id, {})
    due = epic.get("due_date")
    if isinstance(due, datetime):
      due = due.isoformat()
    my_epics.append({
      "id": epic_id,
      "key": epic.get("key", ""),
      "title": epic.get("title", ""),
      "project_id": proj_id,
      "project_key": proj.get("key", ""),
      "project_name": proj.get("name", ""),
      "status": status_name_by_id.get(epic.get("status_id"), "Unknown"),
      "due_date": due,
      "total_tickets": total_children,
      "completed_tickets": completed_children,
      "progress_percentage": progress,
    })
  my_epics.sort(key=lambda e: e.get("due_date") or "zzz")

  # --- my releases (releases where I am the owner — match by owner email/id if stored) ---
  # Releases don't strictly have an owner field; we'll surface upcoming releases for any
  # project where the user has assigned work, sorted by release date.
  user_project_ids = list(project_ids)
  upcoming_releases: list[dict] = []
  if user_project_ids:
    releases_raw = await releases_collection.find({
      "project_id": {"$in": user_project_ids},
      "status": {"$in": ["planned", "in-progress"]},
    }).to_list(length=None)
    for r in releases_raw:
      rel_date = r.get("release_date")
      if isinstance(rel_date, datetime):
        rel_date_str = rel_date.isoformat()
      else:
        rel_date_str = rel_date
      proj = project_by_id.get(r.get("project_id"), {})
      upcoming_releases.append({
        "id": r.get("release_number"),
        "name": r.get("name", ""),
        "version": r.get("version", ""),
        "status": r.get("status", ""),
        "release_date": rel_date_str,
        "project_id": r.get("project_id"),
        "project_key": proj.get("key", ""),
        "project_name": proj.get("name", ""),
      })
  upcoming_releases.sort(key=lambda r: r.get("release_date") or "zzz")
  upcoming_releases = upcoming_releases[:5]

  # --- weekly stats ---
  def _is_within_week(v) -> bool:
    dt = _parse_dt(v)
    return dt is not None and dt >= week_ago

  created_this_week = sum(1 for t in assigned_tickets if _is_within_week(t.get("created_at")))
  completed_this_week = sum(
    1 for t in assigned_tickets
    if t.get("status_id") in done_ids and _is_within_week(t.get("updated_at"))
  )

  # Worklog hours (by email)
  user_worklogs = await worklogs_collection.find({
    "author_email": user_email,
  }).to_list(length=None) if user_email else []
  hours_logged_seconds = 0
  for w in user_worklogs:
    created = _parse_dt(w.get("created_at")) or _parse_dt(w.get("started_at"))
    if created and created >= week_ago:
      hours_logged_seconds += int(w.get("time_spent_seconds", 0) or 0)
  hours_logged = round(hours_logged_seconds / 3600.0, 1)

  # --- recent activity on my tickets ---
  related = await tickets_collection.find({
    "$or": [
      {"assignee_email": user_email},
      {"reporter_email": user_email},
      {"assignee_id": user_id},
      {"reporter_id": user_id},
    ],
  }).to_list(length=None)

  def _activity_sort_key(t: dict) -> datetime:
    dt = _parse_dt(t.get("updated_at")) or _parse_dt(t.get("created_at"))
    return dt or datetime.min.replace(tzinfo=timezone.utc)

  recent = sorted(related, key=_activity_sort_key, reverse=True)[:10]
  recent_activity = []
  for t in recent:
    reporter_email = t.get("reporter_email")
    if reporter_email:
      user_doc = await users_collection.find_one({"email": reporter_email})
    else:
      user_doc = await users_collection.find_one({"user_number": t.get("reporter_id")})
    if user_doc:
      user_name = user_doc.get("name", "Unknown")
    elif reporter_email:
      user_name = reporter_email.split("@")[0]
    else:
      user_name = "Unknown"
    ts = t.get("updated_at") or t.get("created_at") or ""
    if isinstance(ts, datetime):
      ts = ts.isoformat()
    proj = project_by_id.get(t.get("project_id"), {})
    recent_activity.append({
      "id": t.get("ticket_number"),
      "project_id": t.get("project_id"),
      "project_key": proj.get("key", ""),
      "issue_key": t.get("key", ""),
      "issue_title": t.get("title", ""),
      "action": "updated" if t.get("updated_at") else "created",
      "user_name": user_name,
      "timestamp": ts if isinstance(ts, str) else "",
    })

  return {
    "counts": {
      "overdue": len(overdue),
      "due_today": len(due_today),
      "blocked": len(blocked),
      "in_progress": len(in_progress),
      "at_risk": len(at_risk),
      "urgent_open": len(urgent_open),
    },
    "overdue": overdue,
    "due_today": due_today,
    "blocked": blocked,
    "urgent_open": urgent_open,
    "in_progress": in_progress,
    "at_risk": at_risk,
    "active_sprints": my_sprints,
    "my_epics": my_epics,
    "upcoming_releases": upcoming_releases,
    "recent_activity": recent_activity,
    "quick_stats": {
      "created_this_week": created_this_week,
      "completed_this_week": completed_this_week,
      "hours_logged_this_week": hours_logged,
    },
  }
