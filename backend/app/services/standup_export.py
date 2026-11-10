"""Export everything a person has had on the standup as a workbook.

Two sheets, because the two questions people ask are different:

- "Work Summary": one row per ticket or adhoc task, with the first and last day
  it appeared and how many standups it spanned. This is the sheet for a resume,
  an appraisal or a work summary.
- "Daily Log": one row per day per item, the raw record of what was on the board.

Reads the standup's own collections only — the board is what people wrote, so the
export is exactly that, not an interpretation of ticket history.
"""

from collections import OrderedDict
from datetime import date, datetime
from io import BytesIO
from typing import Dict, List, Optional, Tuple

from motor.motor_asyncio import AsyncIOMotorDatabase
from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

from .standup_time import IST, to_ist_date

SECTION_LABEL = {"yesterday": "Worked on", "today": "Planned", "blockers": "Blocker"}
HEADER_FILL = PatternFill("solid", fgColor="F4F5F7")
HEADER_FONT = Font(bold=True, color="172B4D")

SUMMARY_COLUMNS = [
    ("Type", 10), ("Key", 12), ("Title", 60), ("Project", 22), ("Current Status", 16),
    ("Priority", 12), ("First Day", 12), ("Last Day", 12), ("Days On Standup", 16),
    ("Worked On", 11), ("Planned", 10), ("Blocked", 10), ("Due Date", 12),
]
LOG_COLUMNS = [
    ("Date", 12), ("Column", 12), ("Type", 10), ("Key", 12), ("Title", 60),
    ("Project", 22), ("Status", 16), ("Added By", 28),
]


def _iso(value) -> str:
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    return str(value or "")


def _write_sheet(sheet, columns: List[Tuple[str, int]], rows: List[list]) -> None:
    sheet.append([name for name, _ in columns])
    for index, (_, width) in enumerate(columns, start=1):
        sheet.column_dimensions[get_column_letter(index)].width = width
        cell = sheet.cell(row=1, column=index)
        cell.font = HEADER_FONT
        cell.fill = HEADER_FILL
        cell.alignment = Alignment(vertical="center")
    for row in rows:
        sheet.append(row)
    sheet.freeze_panes = "A2"
    if rows:
        sheet.auto_filter.ref = f"A1:{get_column_letter(len(columns))}{len(rows) + 1}"


async def build_work_export(
    db: AsyncIOMotorDatabase,
    email: str,
    person_name: str,
    start: Optional[date] = None,
    end: Optional[date] = None,
) -> bytes:
    """Every standup entry for `email`, optionally limited to a date range."""
    day_filter: Dict[str, str] = {}
    if start:
        day_filter["$gte"] = start.isoformat()
    if end:
        day_filter["$lte"] = end.isoformat()
    scope: dict = {"email": email}
    if day_filter:
        scope["date"] = day_filter

    pins = await db["standup_today_items"].find({**scope, "kind": "pin"}).sort("date", 1).to_list(length=None)
    added = await db["standup_added_items"].find({**scope, "section": {"$in": ["yesterday", "blockers"]}}).sort("date", 1).to_list(length=None)
    tasks = await db["standup_tasks"].find(scope).sort("date", 1).to_list(length=None)

    ticket_ids = list({item["ticket_id"] for item in (*pins, *added) if isinstance(item.get("ticket_id"), int)})
    tickets = await db["tickets"].find(
        {"ticket_number": {"$in": ticket_ids}},
        {"_id": 0, "ticket_number": 1, "project_id": 1, "key": 1, "title": 1, "type": 1, "status_id": 1, "priority": 1, "due_date": 1},
    ).to_list(length=None) if ticket_ids else []
    tickets_by_id = {ticket["ticket_number"]: ticket for ticket in tickets}

    projects = await db["projects"].find(
        {"project_number": {"$in": list({t.get("project_id") for t in tickets})}}, {"_id": 0, "project_number": 1, "name": 1, "key": 1},
    ).to_list(length=None) if tickets else []
    statuses = await db["ticket_statuses"].find(
        {"status_number": {"$in": list({t["status_id"] for t in tickets if t.get("status_id") is not None})}},
        {"_id": 0, "status_number": 1, "name": 1},
    ).to_list(length=None) if tickets else []
    project_name = {p["project_number"]: f"{p.get('name') or ''} ({p.get('key')})" for p in projects}
    status_name = {s["status_number"]: s.get("name") or "" for s in statuses}

    # (kind, id) -> what it looked like, and on which days it showed up where.
    seen: "OrderedDict[tuple, dict]" = OrderedDict()
    log: List[list] = []

    def note(key: tuple, day: str, section: str, entry: dict) -> None:
        record = seen.setdefault(key, {**entry, "days": set(), "sections": set()})
        record["days"].add(day)
        record["sections"].add(section)
        # Later rows carry the newest status a task had.
        record.update({field: entry[field] for field in ("status",) if entry.get(field)})

    for item, section in [*((p, "today") for p in pins), *((a, a.get("section")) for a in added)]:
        ticket = tickets_by_id.get(item.get("ticket_id"))
        if not ticket or section not in SECTION_LABEL:
            continue
        entry = {
            "type": "Ticket",
            "key": ticket.get("key") or "",
            "title": ticket.get("title") or "",
            "project": project_name.get(ticket.get("project_id"), ""),
            "status": status_name.get(ticket.get("status_id"), ""),
            "priority": (ticket.get("priority") or "").title(),
            "due": _iso(to_ist_date(ticket.get("due_date"))),
        }
        note(("ticket", ticket["ticket_number"]), item["date"], section, entry)
        log.append([
            item["date"], SECTION_LABEL[section], "Ticket", entry["key"], entry["title"],
            entry["project"], entry["status"], item.get("created_by") or "Carried over",
        ])

    # Carry-over copies a task into Yesterday (copied_from) and on into Today (carried_from);
    # following those links back finds the first copy, so it counts as one piece of work.
    parent_of = {str(t["_id"]): t.get("carried_from") or t.get("copied_from") for t in tasks}

    def first_copy(task_id: str) -> str:
        seen_ids = set()
        while parent_of.get(task_id) and task_id not in seen_ids:
            seen_ids.add(task_id)
            task_id = parent_of[task_id]
        return task_id

    for task in tasks:
        section = task.get("section")
        if section not in ("yesterday", "today") or not task.get("text"):
            continue
        entry = {
            "type": "Adhoc Task", "key": "", "title": task["text"], "project": "",
            "status": (task.get("status") or "todo").replace("_", " ").title(), "priority": "", "due": "",
        }
        note(("task", first_copy(str(task["_id"]))), task["date"], section, entry)
        log.append([
            task["date"], SECTION_LABEL[section], "Adhoc Task", "", entry["title"],
            "", entry["status"], task.get("created_by") or "Carried over",
        ])

    summary: List[list] = []
    for record in seen.values():
        days = sorted(record["days"])
        sections = record["sections"]
        summary.append([
            record["type"], record["key"], record["title"], record["project"], record["status"], record["priority"],
            days[0], days[-1], len(days),
            "Yes" if "yesterday" in sections else "", "Yes" if "today" in sections else "",
            "Yes" if "blockers" in sections else "", record["due"],
        ])
    summary.sort(key=lambda row: (row[6], row[2]))
    log.sort(key=lambda row: (row[0], row[1], row[4]))

    workbook = Workbook()
    summary_sheet = workbook.active
    summary_sheet.title = "Work Summary"
    _write_sheet(summary_sheet, SUMMARY_COLUMNS, summary)
    _write_sheet(workbook.create_sheet("Daily Log"), LOG_COLUMNS, log)

    covers = "all standups" if not (start or end) else "{} to {}".format(start or "the beginning", end or "today")
    info = workbook.create_sheet("About")
    info.column_dimensions["A"].width = 100
    for line in [
        f"Standup work export for {person_name} <{email}>",
        f"Generated {datetime.now(IST).strftime('%d %b %Y, %H:%M')} IST",
        f"Covers {covers}",
        f"{len(summary)} distinct items across {len({row[0] for row in log})} standup days",
        "",
        "Work Summary: one row per ticket or adhoc task, with the days it was on the standup.",
        "Daily Log: one row per day per item, exactly as the board recorded it.",
    ]:
        info.append([line])
    info["A1"].font = Font(bold=True)

    buffer = BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()
