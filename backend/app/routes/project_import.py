"""Create a project from an existing spreadsheet (structured import).

Two endpoints, a parse/commit split:

* ``parse`` reads an .xlsx/.csv deterministically, auto-maps its columns onto
  ticket fields, resolves assignees against the user directory, and returns a
  preview. It creates nothing.
* ``commit`` takes the reviewed rows plus a project name/key, creates the
  project (with the default workflow statuses and the matched members), then
  creates the tickets.

v1 scope is tickets only: every row becomes a top-level ticket. Epics, sprints,
releases and parent/child hierarchy are intentionally out. Two rules differ
from manual entry, on purpose:

* **Due dates are optional here.** The product normally requires a due date on
  top-level work, but existing data routinely has none, so this path creates
  undated tickets rather than rejecting the import.
* **Assignees are resolved against the whole user directory** (not project
  members — the project is brand new), best-effort: exact email, then exact
  name, then a single unambiguous fuzzy match. Matched people are added to the
  project as members. Ambiguous or unknown names are left blank and reported.
  Email is the reliable key; names collide.
"""

import io
import logging
import re
from datetime import datetime, timezone
from typing import Annotated, Any, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import StreamingResponse
from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo import ReturnDocument

from ..core.security import CurrentUser, require_admin
from ..db.mongo import get_mongo_db
from ..schemas.project_import import (
    AssigneeResolution,
    ColumnMapping,
    ImportDraftRow,
    ImportOptions,
    PRIORITIES,
    ProjectImportCommitRequest,
    ProjectImportCommitResponse,
    ProjectImportRowResult,
    SpreadsheetParseResponse,
    TOP_LEVEL_TYPES,
)
from ..schemas.tickets import TicketCreate
from ..utils.documents import UnsupportedDocumentError, detect_file_type
from ..utils.spreadsheet import read_table
from .projects import DEFAULT_STATUSES, get_next_project_number, seed_default_statuses
from .tickets import _create_ticket

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/projects/import", tags=["project-import"])

MAX_ROWS = 500
MAX_UPLOAD_BYTES = 10 * 1024 * 1024
MAX_DISTINCT_ASSIGNEES = 500

# Words people actually write in bug sheets, mapped onto the product's priorities.
PRIORITY_SYNONYMS = {
    "critical": "urgent", "blocker": "urgent", "sev1": "urgent", "s1": "urgent",
    "highest": "urgent", "immediate": "urgent", "p0": "urgent",
    "major": "high", "sev2": "high", "s2": "high", "p1": "high",
    "normal": "medium", "moderate": "medium", "sev3": "medium", "s3": "medium", "p2": "medium",
    "minor": "low", "trivial": "low", "lowest": "low", "sev4": "low", "s4": "low",
}

TYPE_SYNONYMS = {
    "defect": "bug", "issue": "bug", "problem": "bug", "incident": "bug",
    "feature": "story", "requirement": "story", "user story": "story",
    "chore": "task", "todo": "task", "activity": "task", "work": "task",
    "initiative": "epic", "theme": "epic",
}


# ========== Cell normalisation ==========
#
# Every field read from the sheet is coerced onto a value the ticket API will
# actually accept, or dropped — an unrecognised status or assignee would fail at
# commit time, long after the user stopped looking at the preview.

def _clean_str(value: Any, limit: int) -> Optional[str]:
    if value is None:
        return None
    text = str(value).strip()
    if not text or text.lower() in {"n/a", "na", "none", "null", "unknown", "-", "tbd"}:
        return None
    return text[:limit]


def _normalise_priority(value: Any, warnings: list[str]) -> Optional[str]:
    text = _clean_str(value, 40)
    if not text:
        return None
    key = text.lower().replace("-", "").replace(" ", "")
    if key in PRIORITIES:
        return key
    resolved = PRIORITY_SYNONYMS.get(key)
    if not resolved:
        warnings.append(f"Unrecognised priority '{text}'")
        return None
    return resolved


def _normalise_date(value: Any, warnings: list[str]) -> Optional[datetime]:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value
    text = _clean_str(value, 40)
    if not text:
        return None
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y", "%d-%m-%Y", "%d %b %Y", "%d %B %Y"):
        try:
            return datetime.strptime(text, fmt).replace(tzinfo=timezone.utc)
        except ValueError:
            continue
    try:
        return datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        warnings.append(f"Could not read due date '{text}'")
        return None


def _normalise_points(value: Any) -> Optional[int]:
    try:
        points = int(float(value))
    except (TypeError, ValueError):
        return None
    return points if 0 <= points <= 100 else None


def _normalise_labels(value: Any) -> list[str]:
    if isinstance(value, str):
        parts = re.split(r"[,;/]", value)
    elif isinstance(value, list):
        parts = [str(part) for part in value]
    else:
        return []
    return [label for label in (part.strip()[:50] for part in parts) if label][:10]

# How spreadsheet column headers map onto ticket fields. Headers are matched
# case/space/underscore-insensitively against these aliases, so "Due Date",
# "due_date" and "DUEDATE" all land on `due_date`.
FIELD_ALIASES: dict[str, set[str]] = {
    "title": {"title", "summary", "name", "task", "ticket", "subject", "issue", "item"},
    "description": {"description", "details", "detail", "notes", "note", "body", "comment", "comments"},
    "type": {"type", "issuetype", "issue type", "kind", "category", "work type"},
    "priority": {"priority", "importance", "severity", "sev"},
    "assignee": {"assignee", "owner", "assigned to", "assigned", "assignedto", "responsible", "assigned_to"},
    "due_date": {"due date", "due", "duedate", "deadline", "target date", "end date", "due_on", "due on"},
    "status": {"status", "state", "stage", "column", "progress"},
    "labels": {"labels", "label", "tags", "tag"},
    "story_points": {"story points", "points", "estimate", "sp", "storypoints", "story_points"},
}

# Incoming status text -> one of the project's DEFAULT_STATUSES names.
STATUS_SYNONYMS: dict[str, str] = {
    "backlog": "Backlog", "todo": "Backlog", "to do": "Backlog", "open": "Backlog", "new": "Backlog",
    "ready": "Ready to Pick", "ready to pick": "Ready to Pick", "ready to start": "Ready to Pick", "selected": "Ready to Pick",
    "in progress": "In Progress", "inprogress": "In Progress", "doing": "In Progress", "started": "In Progress", "wip": "In Progress",
    "in review": "In Review", "review": "In Review", "code review": "In Review", "pr": "In Review", "in-review": "In Review",
    "testing": "Testing", "qa": "Testing", "test": "Testing", "in testing": "Testing",
    "done": "Done", "closed": "Done", "complete": "Done", "completed": "Done", "resolved": "Done", "finished": "Done",
    "blocked": "Blocked", "on hold": "Blocked", "stuck": "Blocked", "on-hold": "Blocked",
}
_DEFAULT_STATUS_NAMES = {s["name"].lower(): s["name"] for s in DEFAULT_STATUSES}
DEFAULT_STATUS = "Backlog"


def _norm_header(header: str) -> str:
    """Lowercase, trim, and collapse separators so headers match aliases loosely."""
    return re.sub(r"[\s_\-]+", " ", str(header or "").strip().lower()).strip()


def _map_columns(headers: list[str]) -> tuple[dict[str, str], list[ColumnMapping]]:
    """Auto-map sheet headers onto ticket fields. First header to claim a field wins."""
    field_to_header: dict[str, str] = {}
    mappings: list[ColumnMapping] = []
    for header in headers:
        norm = _norm_header(header)
        matched: Optional[str] = None
        for field, aliases in FIELD_ALIASES.items():
            if field in field_to_header:
                continue
            if norm in aliases or norm == field:
                matched = field
                field_to_header[field] = header
                break
        mappings.append(ColumnMapping(header=header, field=matched))
    return field_to_header, mappings


def _normalise_type(value: Any) -> str:
    """Resolve a type onto one of the product's issue types; default to task.

    A structured sheet can't have its type inferred, so an absent or unrecognised
    value becomes a plain task rather than being left blank (which would fail the
    required-field check).
    """
    text = _clean_str(value, 40)
    if not text:
        return "task"
    key = text.lower()
    if key in TOP_LEVEL_TYPES:
        return key
    return TYPE_SYNONYMS.get(key, "task")


def _map_status_name(value: Any) -> str:
    """Map an incoming status string onto a default workflow status name."""
    text = _clean_str(value, 60)
    if not text:
        return DEFAULT_STATUS
    key = text.lower()
    if key in _DEFAULT_STATUS_NAMES:
        return _DEFAULT_STATUS_NAMES[key]
    return STATUS_SYNONYMS.get(key, DEFAULT_STATUS)


async def _load_directory(db: AsyncIOMotorDatabase) -> tuple[dict, dict, list[dict]]:
    """Active users, indexed for assignee matching and listed for the dropdown.

    Returns ``(by_email, by_name, members)`` where by_email maps a lowercased
    email to ``(email, user_number)``, by_name maps a lowercased full name to a
    list of those pairs (a list, so same-name collisions are detectable), and
    members is ``[{email, name}]`` for every active user — the full directory, so
    the preview's assignee dropdown can assign a ticket to anyone, not just the
    people the sheet happened to name.
    """
    users = await db["users"].find({"is_active": {"$ne": False}}).to_list(length=None)
    by_email: dict[str, tuple[str, int]] = {}
    by_name: dict[str, list[tuple[str, int]]] = {}
    members: list[dict] = []
    for user in users:
        email = user.get("email")
        number = user.get("user_number")
        if not email or number is None:
            continue
        pair = (email, number)
        by_email.setdefault(email.lower(), pair)
        name = (user.get("name") or "").strip()
        if name:
            by_name.setdefault(name.lower(), []).append(pair)
        members.append({"email": email, "name": name or email})
    members.sort(key=lambda m: m["name"].lower())
    return by_email, by_name, members


def _resolve_assignee(value: Any, by_email: dict, by_name: dict) -> tuple[Optional[str], Optional[int], str]:
    """Best-effort match of a written assignee onto a directory user.

    Returns ``(email, user_number, status)`` where status is "matched",
    "ambiguous" or "unmatched". Email is exact; names fall back to a single
    unambiguous fuzzy match, and a name shared by two people stays unmatched.
    """
    text = _clean_str(value, 200)
    if not text:
        return None, None, "unmatched"
    key = text.lower().strip().strip("@<>,. ")

    if key in by_email:
        email, number = by_email[key]
        return email, number, "matched"
    # The local part of an email the writer typed in full, e.g. alex.taylor.
    for email_key, (email, number) in by_email.items():
        if email_key.split("@", 1)[0] == key:
            return email, number, "matched"

    exact = by_name.get(key)
    if exact and len(exact) == 1:
        return exact[0][0], exact[0][1], "matched"
    if exact and len(exact) > 1:
        return None, None, "ambiguous"

    # Single unambiguous fuzzy match: a first name, a token, or a prefix.
    tokens = [t for t in re.split(r"[\s.]+", key) if t]
    candidates: set[tuple[str, int]] = set()
    for name, pairs in by_name.items():
        name_tokens = [t for t in re.split(r"[\s.]+", name) if t]
        if any(t in name_tokens for t in tokens) or name.startswith(key) or key in name:
            candidates.update(pairs)
    for email_key, pair in by_email.items():
        if email_key.split("@", 1)[0].startswith(key):
            candidates.add(pair)

    if len(candidates) == 1:
        pair = next(iter(candidates))
        return pair[0], pair[1], "matched"
    if len(candidates) > 1:
        return None, None, "ambiguous"
    return None, None, "unmatched"


# The columns the template ships with — the headers that auto-map cleanly. The
# order is the recommended reading order; only Title is required.
TEMPLATE_COLUMNS = ["Title", "Description", "Type", "Priority", "Assignee", "Due Date", "Status", "Labels", "Story Points"]
TEMPLATE_EXAMPLES = [
    ["Fix login on Safari", "Users can't sign in on Safari 17", "bug", "high", "sam@acme.com", "2026-11-01", "In Progress", "auth", 3],
    ["Add CSV export to reports", "Export the reports table as CSV", "story", "medium", "jamie@acme.com", "2026-11-10", "Backlog", "reports", 5],
]


@router.get("/template")
async def download_template(
    current_user: Annotated[CurrentUser, Depends(require_admin)],
):
    """An .xlsx template whose headers auto-map on import. Title is the only required column."""
    import openpyxl

    workbook = openpyxl.Workbook()
    sheet = workbook.active
    sheet.title = "Tickets"
    sheet.append(TEMPLATE_COLUMNS)
    for row in TEMPLATE_EXAMPLES:
        sheet.append(row)

    buffer = io.BytesIO()
    workbook.save(buffer)
    buffer.seek(0)
    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="project-import-template.xlsx"'},
    )


@router.post("/parse", response_model=SpreadsheetParseResponse)
async def parse_spreadsheet(
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
    current_user: Annotated[CurrentUser, Depends(require_admin)],
    file: UploadFile = File(...),
):
    """Read an .xlsx/.csv and return draft tickets + a column/assignee preview."""
    try:
        file_type = detect_file_type(file.filename, file.content_type)
    except UnsupportedDocumentError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    if file_type not in ("csv", "xlsx"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Upload a spreadsheet (.xlsx or .csv) for a structured import.",
        )

    content = await file.read()
    if not content:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="The uploaded file is empty.")
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File is too large. Maximum is {MAX_UPLOAD_BYTES // 1024 // 1024}MB.",
        )

    try:
        headers, table = read_table(content, file_type)
    except UnsupportedDocumentError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Could not read {file.filename}: {exc}",
        )

    field_to_header, columns = _map_columns(headers)
    warnings: list[str] = []
    if "title" not in field_to_header:
        warnings.append("No Title/Summary column was found — every row needs a title before import.")

    by_email, by_name, directory = await _load_directory(db)

    rows: list[ImportDraftRow] = []
    resolutions: dict[str, AssigneeResolution] = {}
    member_ids: set[int] = set()
    truncated = len(table) > MAX_ROWS

    def cell(row: dict, field: str) -> Any:
        header = field_to_header.get(field)
        return row.get(header) if header else None

    for index, raw in enumerate(table[:MAX_ROWS]):
        assignee_email: Optional[str] = None
        source = _clean_str(cell(raw, "assignee"), 200)
        if source:
            email, number, state = _resolve_assignee(source, by_email, by_name)
            assignee_email = email
            if number is not None:
                member_ids.add(number)
            if source not in resolutions and len(resolutions) < MAX_DISTINCT_ASSIGNEES:
                resolutions[source] = AssigneeResolution(
                    source=source, matched_email=email, matched_user_id=number, status=state
                )

        title = _clean_str(cell(raw, "title"), 200)
        row = ImportDraftRow(
            ref=index,
            parent_ref=None,
            title=title,
            description=_clean_str(cell(raw, "description"), 20_000),
            type=_normalise_type(cell(raw, "type")),
            status_name=_map_status_name(cell(raw, "status")),
            priority=_normalise_priority(cell(raw, "priority"), []),
            assignee_email=assignee_email,
            due_date=_normalise_date(cell(raw, "due_date"), []),
            labels=_normalise_labels(cell(raw, "labels")),
            story_points=_normalise_points(cell(raw, "story_points")),
        )
        row.missing_required = [] if title else ["title"]
        rows.append(row)

    if not rows:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="The sheet has a header row but no data rows.",
        )
    if truncated:
        warnings.append(f"Stopped at the {MAX_ROWS}-row limit; split the sheet to import the rest.")

    unmatched = [r.source for r in resolutions.values() if r.status != "matched"]
    if unmatched:
        warnings.append(
            f"{len(unmatched)} assignee(s) couldn't be matched and were left blank: "
            f"{', '.join(unmatched[:10])}{'…' if len(unmatched) > 10 else ''}. "
            "Add an email column for reliable matching."
        )

    options = ImportOptions(
        statuses=[{"name": s["name"], "color": s["color"]} for s in DEFAULT_STATUSES],
        members=directory,  # the full directory, so any ticket can be (re)assigned
        types=TOP_LEVEL_TYPES,
        priorities=PRIORITIES,
        default_status_id=None,
    )

    return SpreadsheetParseResponse(
        rows=rows,
        options=options,
        columns=columns,
        assignees=list(resolutions.values()),
        member_user_ids=sorted(member_ids),
        source_filename=file.filename or "spreadsheet",
        row_count=len(rows),
        warnings=warnings,
    )


def _clean_key(raw: str) -> str:
    """A project key: uppercase letters/digits, 2–10 chars."""
    key = re.sub(r"[^A-Za-z0-9]", "", raw or "").upper()
    return key[:10]


@router.post("/commit", response_model=ProjectImportCommitResponse)
async def commit_spreadsheet(
    payload: ProjectImportCommitRequest,
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
    current_user: Annotated[CurrentUser, Depends(require_admin)],
):
    """Create the project, its members, and the reviewed tickets."""
    key = _clean_key(payload.project_key)
    if len(key) < 2:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Project key must be at least 2 letters/digits.")

    # Every row must have a title; everything else is best-effort.
    untitled = [row.ref for row in payload.rows if not (row.title and row.title.strip())]
    if untitled:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{len(untitled)} row(s) are missing a title.",
        )

    projects_collection = db["projects"]
    members_collection = db["project_members"]
    users_collection = db["users"]

    if await projects_collection.find_one({"key": key}):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Project key {key} already exists.")

    now = datetime.now(timezone.utc)
    project_number = await get_next_project_number(db)
    await projects_collection.insert_one({
        "project_number": project_number,
        "key": key,
        "name": payload.project_name,
        "description": payload.description or "",
        "visibility": payload.visibility,
        "status": "active",
        "owner_id": current_user.id,
        "created_at": now,
        "deadline": payload.deadline,
    })
    await seed_default_statuses(db, project_number)

    # Owner as admin member, then the directory-matched members (never a global
    # admin — they already have access — and never the owner twice).
    await members_collection.insert_one({
        "project_id": project_number,
        "user_id": current_user.id,
        "user_email": current_user.email,
        "role": "admin",
        "active": True,
        "joined_at": now,
    })
    global_admin_docs = await users_collection.find({"role": "admin"}, {"user_number": 1}).to_list(length=None)
    global_admin_ids = {u.get("user_number") for u in global_admin_docs}

    # Anyone actually assigned in the reviewed rows must be a member too — the user
    # may have assigned a directory person the sheet never named.
    assigned_emails = {r.assignee_email for r in payload.rows if r.assignee_email}
    assignee_ids: list[int] = []
    if assigned_emails:
        assignee_docs = await users_collection.find(
            {"email": {"$in": list(assigned_emails)}}, {"user_number": 1}
        ).to_list(length=None)
        assignee_ids = [u["user_number"] for u in assignee_docs if u.get("user_number") is not None]
    member_ids = list(dict.fromkeys([*payload.member_user_ids, *assignee_ids]))

    seen = {current_user.id}
    for user_id in member_ids:
        if user_id in seen or user_id in global_admin_ids:
            continue
        seen.add(user_id)
        member_user = await users_collection.find_one({"user_number": user_id})
        if not member_user:
            continue
        await members_collection.insert_one({
            "project_id": project_number,
            "user_id": user_id,
            "user_email": member_user.get("email"),
            "role": "member",
            "active": True,
            "joined_at": now,
        })

    # Map each default status name to the id it was just created with.
    status_docs = await db["ticket_statuses"].find({"project_id": project_number}).to_list(length=None)
    status_by_name = {doc["name"]: doc["status_number"] for doc in status_docs}
    default_status_id = status_by_name.get(DEFAULT_STATUS)

    results: list[ProjectImportRowResult] = []
    for row in payload.rows:
        try:
            ticket_in = TicketCreate(
                title=row.title,
                description=row.description,
                type=row.type if row.type in TOP_LEVEL_TYPES else "task",
                status_id=status_by_name.get(row.status_name or DEFAULT_STATUS, default_status_id),
                priority=row.priority,
                assignee_email=row.assignee_email,
                due_date=row.due_date,  # undated is allowed on this path
                labels=row.labels,
                story_points=row.story_points,
            )
            created = await _create_ticket(project_number, ticket_in, db, current_user)
        except HTTPException as exc:
            results.append(ProjectImportRowResult(ref=row.ref, created=False, title=row.title, error=str(exc.detail)))
            continue
        except Exception as exc:
            logger.error(f"[PROJECT IMPORT] Failed to create ticket for row {row.ref}: {exc}")
            results.append(ProjectImportRowResult(ref=row.ref, created=False, title=row.title, error="Failed to create this ticket"))
            continue
        results.append(ProjectImportRowResult(
            ref=row.ref, created=True, ticket_id=created["id"], key=created["key"], title=created["title"]
        ))

    created_count = sum(1 for r in results if r.created)
    return ProjectImportCommitResponse(
        project_id=project_number,
        project_key=key,
        created_count=created_count,
        failed_count=len(results) - created_count,
        results=results,
    )
