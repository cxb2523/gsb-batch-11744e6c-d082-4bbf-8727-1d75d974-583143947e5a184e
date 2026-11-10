"""Assemble the cross-project daily standup board.

The board is entirely what people put on it. Nothing is inferred from ticket
activity: for each person and standup date it shows

- Yesterday: tickets added to yesterday, plus adhoc tasks.
- Today: tickets added to today (including ones carried forward), plus adhoc tasks.
- Blockers: tickets added to blockers, plus free-text blocker notes.

Any ticket assigned to a person can be added to any column. Ticket details
(title, status, due date) are read live, so a row always shows the ticket's
current state — and a ticket that has since been archived or deleted, or whose
project was deleted, simply drops off the board.

The query count is fixed: one round of reads for everything the people added,
then one `$in` load of the tickets those entries reference.
"""

import asyncio
from collections import defaultdict
from datetime import date, timedelta
from typing import Dict, List, Optional, Set

from motor.motor_asyncio import AsyncIOMotorDatabase

from ..schemas.standup import (
    BlockerNote,
    StandupBoard,
    StandupCounts,
    StandupParent,
    StandupPerson,
    StandupProject,
    StandupStatus,
    StandupSummary,
    StandupTask,
    StandupTicketRow,
    StandupTodayColumn,
    StandupWindow,
    StandupYesterday,
)
from .standup_roster import Roster
from .standup_time import (
    ist_today,
    is_weekend,
    next_working_day,
    previous_working_day,
    to_aware_utc,
    to_ist_date,
    yesterday_window,
)
from .status_category import categorize_status

USER_PROJECTION = {"_id": 0, "email": 1, "name": 1, "profile_photo": 1, "is_active": 1}
TICKET_PROJECTION = {
    "_id": 0, "ticket_number": 1, "project_id": 1, "key": 1, "title": 1, "type": 1, "status_id": 1,
    "priority": 1, "parent_id": 1, "due_date": 1, "archived": 1,
}

# Muted, distinguishable project colours; a project always gets the same one.
PROJECT_PALETTE = ["#0052CC", "#6554C0", "#00875A", "#FF8B00", "#00A3BF", "#DE350B", "#5243AA", "#36B37E"]


def project_color(key: str) -> str:
    return PROJECT_PALETTE[sum(ord(char) for char in (key or "")) % len(PROJECT_PALETTE)]


def _label_day(day: date) -> str:
    return day.strftime("%a, %b ") + str(day.day)


async def _find(collection, query: dict, projection: dict) -> list:
    """`find(...).to_list()`, skipping the round trip when an `$in` list is empty."""
    for value in query.values():
        if isinstance(value, dict) and value.get("$in") == []:
            return []
    return await collection.find(query, projection).to_list(length=None)


async def build_board(
    db: AsyncIOMotorDatabase,
    standup_date: date,
    roster: Roster,
    is_admin: bool,
    viewer_email: str = "",
) -> StandupBoard:
    today = ist_today()
    window_start, window_end = yesterday_window(standup_date)
    previous_day = previous_working_day(standup_date)
    after = next_working_day(standup_date)

    since_label = "Yesterday" if previous_day == standup_date - timedelta(days=1) else f"Since {previous_day:%A}"
    window = StandupWindow(start=window_start, end=window_end, label=_label_day(previous_day), since_label=since_label)

    base = dict(
        date=standup_date,
        today=today,
        is_today=standup_date == today,
        is_weekend=is_weekend(standup_date),
        prev_date=previous_day,
        next_date=after if after <= today else (today if standup_date < today else None),
        carry_forward_date=after,
        yesterday_window=window,
        roster_is_default=roster.is_default,
        is_admin=is_admin,
        viewer_email=viewer_email,
    )

    if not roster.emails:
        return StandupBoard(**base, summary=StandupSummary(), projects={}, people=[])

    on_roster = {"email": {"$in": roster.emails}, "date": standup_date.isoformat()}

    users, pins, added_items, blocker_notes, task_docs, next_day_pins = await asyncio.gather(
        # All users, matched case-insensitively below: stored emails aren't guaranteed lowercase.
        db["users"].find({}, USER_PROJECTION).to_list(length=None),
        db["standup_today_items"].find({**on_roster, "kind": "pin"}).sort("created_at", 1).to_list(length=None),
        db["standup_added_items"].find({**on_roster, "section": {"$in": ["yesterday", "blockers"]}}).sort("created_at", 1).to_list(length=None),
        db["standup_blocker_notes"].find(on_roster).sort("created_at", 1).to_list(length=None),
        db["standup_tasks"].find(on_roster).sort("created_at", 1).to_list(length=None),
        db["standup_today_items"].find(
            {"email": {"$in": roster.emails}, "date": after.isoformat(), "kind": "pin"}, {"_id": 0, "email": 1, "ticket_id": 1},
        ).to_list(length=None),
    )

    # ---- the tickets people added, plus their parents, projects and statuses ----
    ticket_ids = list({item["ticket_id"] for item in (*pins, *added_items) if isinstance(item.get("ticket_id"), int)})
    tickets, carried_task_ids = await asyncio.gather(
        _find(db["tickets"], {"ticket_number": {"$in": ticket_ids}}, TICKET_PROJECTION),
        # Tasks already copied forward, whichever day the copy landed on.
        db["standup_tasks"].distinct("carried_from", {"carried_from": {"$in": [str(doc["_id"]) for doc in task_docs]}})
        if task_docs else asyncio.sleep(0, result=[]),
    )
    tickets_by_id = {ticket["ticket_number"]: ticket for ticket in tickets}
    carried_task_ids = set(carried_task_ids)

    parents, projects, statuses = await asyncio.gather(
        _find(
            db["tickets"],
            {"ticket_number": {"$in": [t["parent_id"] for t in tickets if t.get("parent_id") and t["parent_id"] not in tickets_by_id]}},
            {"_id": 0, "ticket_number": 1, "key": 1, "title": 1},
        ),
        _find(db["projects"], {"project_number": {"$in": list({t.get("project_id") for t in tickets})}}, {"_id": 0, "project_number": 1, "key": 1, "name": 1}),
        _find(
            db["ticket_statuses"],
            {"status_number": {"$in": list({t["status_id"] for t in tickets if t.get("status_id") is not None})}},
            {"_id": 0, "status_number": 1, "name": 1, "color": 1},
        ),
    )
    parents_by_id = {**{p["ticket_number"]: p for p in parents}, **tickets_by_id}
    projects_by_id = {p["project_number"]: p for p in projects if p.get("project_number") is not None}
    statuses_by_id = {s["status_number"]: s for s in statuses if s.get("status_number") is not None}
    user_by_email = {(u.get("email") or "").strip().lower(): u for u in users}

    used_projects: Set[int] = set()

    def ticket_row(ticket_id: int, added_by: Optional[str], carried_from_date: Optional[str] = None) -> Optional[StandupTicketRow]:
        ticket = tickets_by_id.get(ticket_id)
        project = projects_by_id.get(ticket.get("project_id")) if ticket else None
        if not ticket or not project or ticket.get("archived"):
            return None  # archived or deleted since it was added, or its project was deleted
        used_projects.add(project["project_number"])

        status = statuses_by_id.get(ticket.get("status_id"))
        category = categorize_status(status["name"]) if status else "todo"
        due = to_ist_date(ticket.get("due_date"))
        parent_doc = parents_by_id.get(ticket.get("parent_id")) if ticket.get("parent_id") else None

        return StandupTicketRow(
            id=ticket["ticket_number"],
            project_id=project["project_number"],
            key=ticket.get("key") or "",
            title=ticket.get("title") or "",
            type=ticket.get("type"),
            priority=ticket.get("priority"),
            status=StandupStatus(id=status["status_number"], name=status["name"], color=status.get("color"), category=category) if status else None,
            parent=StandupParent(id=parent_doc["ticket_number"], key=parent_doc["key"], title=parent_doc.get("title") or "")
            if parent_doc and parent_doc.get("key") else None,
            due_date=due,
            is_overdue=bool(due and due < standup_date and category != "done"),
            archived=bool(ticket.get("archived")),
            added_by=added_by,
            carried_from_date=carried_from_date,
        )

    # ---- group everything by person ----
    rows_by_email: Dict[str, Dict[str, List[StandupTicketRow]]] = defaultdict(lambda: {"yesterday": [], "today": [], "blockers": []})
    for item in pins:
        if row := ticket_row(item["ticket_id"], item.get("created_by"), item.get("carried_from_date")):
            rows_by_email[item["email"]]["today"].append(row)
    for item in added_items:
        if row := ticket_row(item["ticket_id"], item.get("created_by"), item.get("carried_from_date")):
            rows_by_email[item["email"]][item["section"]].append(row)

    carried_tickets: Dict[str, Set[int]] = defaultdict(set)
    for pin in next_day_pins:
        carried_tickets[pin["email"]].add(pin["ticket_id"])

    tasks_by_email: Dict[str, Dict[str, List[StandupTask]]] = defaultdict(lambda: {"yesterday": [], "today": []})
    for doc in task_docs:
        created_at = to_aware_utc(doc.get("created_at"))
        if created_at is None or doc.get("section") not in ("yesterday", "today") or not doc.get("text"):
            continue
        task_id = str(doc["_id"])
        tasks_by_email[doc["email"]][doc["section"]].append(StandupTask(
            id=task_id, section=doc["section"], text=doc["text"], status=doc.get("status") or "todo",
            created_by=doc.get("created_by"), created_at=created_at,
            carried_from=doc.get("carried_from"), carried_forward=task_id in carried_task_ids,
        ))

    notes_by_email: Dict[str, List[BlockerNote]] = defaultdict(list)
    for note in blocker_notes:
        created_at = to_aware_utc(note.get("created_at"))
        if created_at is None or not note.get("text"):
            continue
        notes_by_email[note["email"]].append(
            BlockerNote(
                id=str(note["_id"]), text=note["text"], created_by=note.get("created_by"),
                created_at=created_at, carried_from_date=note.get("carried_from_date"),
            )
        )

    # ---- people ----
    people: List[StandupPerson] = []
    summary = StandupSummary()

    for email in roster.emails:
        user = user_by_email.get(email)
        if user and user.get("is_active", True) is False:
            continue  # deactivated people stay on the saved roster but drop off the board

        rows = rows_by_email[email]
        for row in rows["today"]:
            row.carried_forward = row.id in carried_tickets[email]
        tasks = tasks_by_email[email]
        notes = notes_by_email.get(email, [])

        yesterday_count = len(rows["yesterday"]) + len(tasks["yesterday"])
        completed = sum(1 for row in rows["yesterday"] if row.status and row.status.category == "done")
        completed += sum(1 for task in tasks["yesterday"] if task.status == "done")
        blockers = len(rows["blockers"]) + len(notes)
        planned = len(rows["today"]) + len(tasks["today"])
        health = "blocked" if blockers else ("no_update" if yesterday_count == 0 else "ok")

        people.append(StandupPerson(
            email=email,
            name=(user or {}).get("name") or email.split("@")[0],
            photo=(user or {}).get("profile_photo"),
            has_account=user is not None,
            can_edit=is_admin or email == viewer_email,
            health=health,
            counts=StandupCounts(completed=completed, worked_on=yesterday_count - completed, today=planned, blockers=blockers),
            yesterday=StandupYesterday(items=rows["yesterday"], tasks=tasks["yesterday"]),
            today=StandupTodayColumn(items=rows["today"], tasks=tasks["today"]),
            blockers=rows["blockers"],
            blocker_notes=notes,
        ))

        summary.people += 1
        summary.updated += 1 if yesterday_count else 0
        summary.no_update += 1 if health == "no_update" else 0
        summary.completed += completed
        summary.blockers += blockers
        summary.planned_today += planned

    project_map = {
        str(pid): StandupProject(
            id=pid, key=projects_by_id[pid].get("key") or "", name=projects_by_id[pid].get("name") or "",
            color=project_color(projects_by_id[pid].get("key") or ""),
        )
        for pid in sorted(used_projects)
    }

    return StandupBoard(**base, summary=summary, projects=project_map, people=people)
