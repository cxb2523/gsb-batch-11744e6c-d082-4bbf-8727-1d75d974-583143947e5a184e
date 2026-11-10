"""Project lifecycle tracking: where a project is in the company flow, and how it got there.

Every project runs the same funnel (PRD, design, review, handoff, scoping,
module development, delivery), so this records each stage's dates, how long it
took, who owns it and what changed. The flow can be tailored per project, and any
project member can move any stage; this is a record of reality, not a gate.
"""

import logging
import re
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Annotated, Dict, List, Optional, Sequence

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    UploadFile,
    status,
)
from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo import ReturnDocument

from ...core.file_security import sniff
from ...core.storage import get_storage, serve_stored_file, StorageError
from ...core.security import CurrentUser, get_current_user
from ...db.mongo import get_mongo_db
from ...db.queries import NOT_ARCHIVED
from ...schemas.lifecycle import (
    AdvanceIn,
    FlowIn,
    LifecycleActive,
    LifecycleEvent,
    LifecycleOut,
    LifecycleSummary,
    LinkIn,
    ModuleIn,
    ModuleOrder,
    ModuleOut,
    ModuleTicketOut,
    ModuleTickets,
    ModuleUpdate,
    PersonOut,
    RemarkIn,
    StageAttachmentOut,
    StageDetailOut,
    StageOut,
    StageRemarkOut,
    StageUpdate,
)
from ...services.project_lifecycle import (
    ATTACHMENTS,
    DEFAULT_CODENAMES,
    DEFAULT_MILESTONES,
    EVENTS,
    LIFECYCLES,
    MODULES,
    REMARKS,
    apply_state,
    days_in_stage,
    get_or_create,
    new_stage,
    record_event,
)
from ...services.standup_time import ist_today, to_ist_date
from ...services.status_category import categorize_status
from ..tickets import verify_project_access

logger = logging.getLogger(__name__)


router = APIRouter(prefix="/projects", tags=["lifecycle"])

# Files a stage carries. Stored under their own "lifecycle" category of the
# shared storage backend (see app/core/storage.py), so a lifecycle file is never
# confused with a ticket one and the location is configurable.
STORAGE_CATEGORY = "lifecycle"

# What a browser can be trusted to render in place rather than download. SVG is
# absent on purpose, and so is anything that could run as markup on our origin.
VIEWABLE_PREFIXES = ("image/",)
VIEWABLE_TYPES = {"application/pdf", "text/plain", "text/csv", "text/markdown"}

# Browsers do not agree on the type of a Markdown or CSV file, and several send
# nothing useful at all. When the browser has no opinion, the extension decides,
# but only for types that were already allowed: an unknown extension stays unknown.
GENERIC_TYPES = {"", "application/octet-stream", "binary/octet-stream", "text/x-markdown"}
EXTENSION_TYPES = {
    ".md": "text/markdown",
    ".markdown": "text/markdown",
    ".txt": "text/plain",
    ".csv": "text/csv",
    ".pdf": "application/pdf",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".doc": "application/msword",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xls": "application/vnd.ms-excel",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".ppt": "application/vnd.ms-powerpoint",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
}

MAX_UPLOAD_BYTES = 10 * 1024 * 1024
UPLOAD_CHUNK = 1024 * 1024
# Deliberately narrow: the artefacts of this funnel are documents and screenshots.
ALLOWED_PREFIXES = ("image/",)
# An SVG is a script that draws a picture. Nothing in this funnel needs one, and
# serving one back from our own origin would hand an uploader a script on it.
BLOCKED_TYPES = {"image/svg+xml"}
ALLOWED_TYPES = {
    "application/pdf",
    "text/plain",
    "text/csv",
    "text/markdown",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
}

# OOXML Office files (.docx/.xlsx/.pptx) are ZIP containers, so their true
# signature is a plain zip. A zip signature therefore legitimately backs a file
# declared as one of these — the same allowance file_security makes by extension
# (.docx -> {docx, zip}). Without it the signature check below would reject every
# real Office document, since application/zip is not itself an allowed type.
OOXML_TYPES = {
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _slug(name: str, taken: List[str]) -> str:
    base = re.sub(r"[^a-z0-9]+", "_", name.strip().lower()).strip("_") or "stage"
    key, suffix = base, 2
    while key in taken:
        key, suffix = f"{base}_{suffix}", suffix + 1
    return key


def _to_datetime(value) -> Optional[datetime]:
    """Mongo stores datetimes, not dates: a day is midnight UTC on that day."""
    if isinstance(value, date) and not isinstance(value, datetime):
        return datetime(value.year, value.month, value.day, tzinfo=timezone.utc)
    return value


def _as_date(value) -> Optional[date]:
    """The Indian calendar date of a stored value.

    A date picked in the UI is stored as midnight UTC and reads back as itself; a
    real timestamp reads back as the day it was in India, which is the day the
    team means when they talk about it.
    """
    if isinstance(value, datetime):
        return to_ist_date(value)
    return value if isinstance(value, date) else None


async def _project(db: AsyncIOMotorDatabase, project_id: int, current_user: CurrentUser) -> dict:
    """The project, once the caller is known to have access to it."""
    await verify_project_access(project_id, current_user.email, db, current_user.role, current_user.id)
    project = await db["projects"].find_one({"project_number": project_id}, {"_id": 0, "name": 1, "key": 1})
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    return project


async def _names_for(db: AsyncIOMotorDatabase, emails: List[str]) -> Dict[str, str]:
    wanted = sorted({email for email in emails if email})
    if not wanted:
        return {}
    return {
        (user.get("email") or "").lower(): user.get("name") or (user.get("email") or "").split("@")[0]
        async for user in db["users"].find({"email": {"$in": wanted}}, {"_id": 0, "email": 1, "name": 1})
    }


def stage_assignees(stage: dict) -> List[str]:
    """Who is carrying this stage.

    Stages written before a stage could have more than one person still hold a
    single `owner_email`; it is read as a one-item list so nothing is lost.
    """
    listed = stage.get("assignees")
    if isinstance(listed, list):
        return [email.lower() for email in listed if email]
    owner = (stage.get("owner_email") or "").lower()
    return [owner] if owner else []


async def _counts_by_stage(db: AsyncIOMotorDatabase, collection: str, project_id: int) -> Dict[str, int]:
    """How many remarks (or attachments) each stage has, in one round trip."""
    rows = await db[collection].aggregate([
        {"$match": {"project_id": project_id}},
        {"$group": {"_id": "$stage_key", "count": {"$sum": 1}}},
    ]).to_list(length=None)
    return {row["_id"]: row["count"] for row in rows if row.get("_id")}


def _stage_out(
    stage: dict,
    names: Dict[str, str],
    today: date,
    remarks: Optional[Dict[str, int]] = None,
    attachments: Optional[Dict[str, int]] = None,
) -> StageOut:
    target = _as_date(stage.get("target_date"))
    people = stage_assignees(stage)
    return StageOut(
        remark_count=(remarks or {}).get(stage["key"], 0),
        attachment_count=(attachments or {}).get(stage["key"], 0),
        key=stage["key"],
        codename=stage.get("codename") or DEFAULT_CODENAMES.get(stage["key"]),
        name=stage["name"],
        is_milestone=bool(stage.get("is_milestone", stage["key"] in DEFAULT_MILESTONES)),
        team=stage.get("team"),
        description=stage.get("description"),
        position=stage.get("position", 0),
        state=stage.get("state") or "not_started",
        tracks=list(stage.get("tracks") or []),
        assignees=[PersonOut(email=email, name=names.get(email) or email.split("@")[0]) for email in people],
        target_date=target,
        note=stage.get("note"),
        started_at=stage.get("started_at"),
        completed_at=stage.get("completed_at"),
        days=days_in_stage(stage),
        is_overdue=bool(target and target < today and stage.get("state") not in ("done", "skipped")),
    )


def _ticket_out(ticket: dict, statuses: Dict[int, str], children: Optional[List[ModuleTicketOut]] = None) -> ModuleTicketOut:
    name = statuses.get(ticket.get("status_id"), "")
    category = categorize_status(name)
    return ModuleTicketOut(
        id=ticket["ticket_number"],
        key=ticket.get("key") or f"#{ticket['ticket_number']}",
        title=ticket.get("title") or "",
        status=name or "Unknown",
        category=category,
        done=category == "done",
        assignee_email=(ticket.get("assignee_email") or "").lower() or None,
        subtickets=children or [],
    )


TICKET_FIELDS = {"_id": 0, "ticket_number": 1, "key": 1, "title": 1, "status_id": 1, "assignee_email": 1, "parent_id": 1}


async def _project_statuses(db: AsyncIOMotorDatabase, project_id: int) -> Dict[int, str]:
    return {
        row["status_number"]: row.get("name") or ""
        async for row in db["ticket_statuses"].find({"project_id": project_id}, {"_id": 0, "status_number": 1, "name": 1})
    }


async def _linked_tickets(db: AsyncIOMotorDatabase, project_id: int, modules: List[dict]) -> Dict[int, ModuleTicketOut]:
    """Every ticket the modules point at, with its subtasks, by ticket number.

    A ticket that was archived or deleted since it was linked simply does not come
    back, so a module counts only the work that still exists.
    """
    wanted = sorted({int(number) for module in modules for number in (module.get("ticket_ids") or [])})
    if not wanted:
        return {}

    tickets = await db["tickets"].find(
        {"project_id": project_id, "ticket_number": {"$in": wanted}, **NOT_ARCHIVED}, TICKET_FIELDS,
    ).to_list(length=None)
    # The work under those tickets counts too: a module with an open subtask is not done.
    subtasks = await db["tickets"].find(
        {"project_id": project_id, "parent_id": {"$in": [ticket["ticket_number"] for ticket in tickets]}, **NOT_ARCHIVED},
        TICKET_FIELDS,
    ).sort("ticket_number", 1).to_list(length=None)
    statuses = await _project_statuses(db, project_id)

    under: Dict[int, List[ModuleTicketOut]] = {}
    for subtask in subtasks:
        under.setdefault(int(subtask["parent_id"]), []).append(_ticket_out(subtask, statuses))

    return {
        ticket["ticket_number"]: _ticket_out(ticket, statuses, under.get(ticket["ticket_number"]))
        for ticket in tickets
    }


def _ticket_tally(tickets: List[ModuleTicketOut]) -> tuple:
    """How many of a module's items are finished, counting subtasks as their own work."""
    done = total = 0
    for ticket in tickets:
        for item in [ticket, *ticket.subtickets]:
            total += 1
            done += 1 if item.done else 0
    return done, total


def module_assignees(module: dict) -> List[str]:
    """Who is building this module, reading the single owner older rows still hold."""
    listed = module.get("assignees")
    if isinstance(listed, list):
        return [email.lower() for email in listed if email]
    owner = (module.get("owner_email") or "").lower()
    return [owner] if owner else []


def _module_out(
    module: dict,
    names: Dict[str, str],
    today: date,
    tickets: Optional[Dict[int, ModuleTicketOut]] = None,
) -> ModuleOut:
    deadline = _as_date(module.get("deadline"))
    people = module_assignees(module)

    linked = [(tickets or {})[number] for number in (module.get("ticket_ids") or []) if number in (tickets or {})]
    # Once a module says which tickets do its work, those tickets and their subtasks
    # decide whether it is finished. The tick box only speaks for a module with none.
    items_done, items_total = _ticket_tally(linked)
    done = items_done == items_total if linked else bool(module.get("done"))

    return ModuleOut(
        tickets=linked,
        tickets_done=items_done,
        tickets_total=items_total,
        done_from_tickets=bool(linked),
        id=module["module_number"],
        name=module.get("name") or "",
        assignees=[PersonOut(email=email, name=names.get(email) or email.split("@")[0]) for email in people],
        deadline=deadline,
        done=done,
        done_at=None if linked else module.get("done_at"),
        position=module.get("position", 0),
        is_overdue=bool(deadline and deadline < today and not done),
    )


def _summary(stages: List[dict], modules: List[ModuleOut]) -> LifecycleSummary:
    started = [stage["started_at"] for stage in stages if stage.get("started_at")]
    delivered = [
        stage.get("completed_at") for stage in stages
        if stage.get("state") == "done" and stage.get("completed_at")
    ]
    first_start = min(started) if started else None
    last_done = max(delivered) if delivered else None
    everything_done = bool(stages) and all(stage.get("state") in ("done", "skipped") for stage in stages)

    total_days = 0
    if first_start:
        end = last_done if everything_done and last_done else _now()
        began, finished = to_ist_date(first_start), to_ist_date(end)
        if began and finished:
            total_days = max(0, (finished - began).days)

    return LifecycleSummary(
        total_days=total_days,
        stages_done=sum(1 for stage in stages if stage.get("state") == "done"),
        stages_total=len(stages),
        modules_done=sum(1 for module in modules if module.done),
        modules_total=len(modules),
        started_on=_as_date(first_start),
        delivered_on=_as_date(last_done) if everything_done else None,
    )


async def _lifecycle_response(db: AsyncIOMotorDatabase, project_id: int, project: dict) -> LifecycleOut:
    lifecycle = await get_or_create(db, project_id)
    stages = sorted(lifecycle.get("stages") or [], key=lambda stage: stage.get("position", 0))
    modules = await db[MODULES].find({"project_id": project_id}).sort([("position", 1), ("module_number", 1)]).to_list(length=None)

    emails: List[str] = []
    for stage in stages:
        emails.extend(stage_assignees(stage))
    for module in modules:
        emails.extend(module_assignees(module))
    names = await _names_for(db, emails)
    module_tickets = await _linked_tickets(db, project_id, modules)
    remark_counts = await _counts_by_stage(db, REMARKS, project_id)
    attachment_counts = await _counts_by_stage(db, ATTACHMENTS, project_id)
    today = ist_today()
    # The stage being worked on: the first in progress, else the last one finished.
    in_progress = [stage for stage in stages if stage.get("state") == "in_progress"]
    done = [stage for stage in stages if stage.get("state") == "done"]
    current = in_progress[0]["key"] if in_progress else (done[-1]["key"] if done else None)

    shown = [_module_out(module, names, today, module_tickets) for module in modules]
    return LifecycleOut(
        project_id=project_id,
        project_name=project.get("name") or "",
        project_key=project.get("key") or "",
        stages=[_stage_out(stage, names, today, remark_counts, attachment_counts) for stage in stages],
        current_stage=current,
        modules=shown,
        summary=_summary(stages, shown),
        can_edit=True,  # everyone with project access may record progress
    )


def _aware(value: Optional[datetime]) -> Optional[datetime]:
    if value is None:
        return None
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def _rebuild_clock(stage: dict) -> None:
    """Make the day count agree with dates that were entered by hand.

    Normally a stage's clock is banked by `apply_state` as it moves. When someone
    records what actually happened on a project that was already running, the
    dates are the truth and the clock is rebuilt from them: a finished stage costs
    exactly what its two dates say, and a running one is counted from its start.
    """
    # Mongo hands back naive UTC, while a date just set is aware. Compare like for like.
    started, completed = _aware(stage.get("started_at")), _aware(stage.get("completed_at"))
    if started and completed and started > completed:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="A stage cannot finish before it started.",
        )
    today = ist_today()
    if (started and to_ist_date(started) > today) or (completed and to_ist_date(completed) > today):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="These dates record what happened, so they cannot be in the future.",
        )

    stage.pop("elapsed_seconds", None)
    if not started or stage.get("state") == "in_progress":
        # Never started, or still running: the live count runs from the start date.
        stage["elapsed_days"] = 0
    elif completed:
        stage["elapsed_days"] = max(0, (to_ist_date(completed) - to_ist_date(started)).days)


async def _known_people(db: AsyncIOMotorDatabase, emails: Sequence[str]) -> List[str]:
    """Normalised, de-duplicated, and checked to be real users.

    Order is kept so the picker's list reads back the way it was set. An address
    nobody owns is rejected rather than stored, so a typo cannot silently assign
    a stage to nobody.
    """
    cleaned: List[str] = []
    for email in emails:
        value = (email or "").strip().lower()
        if value and value not in cleaned:
            cleaned.append(value)
    if not cleaned:
        return []

    known = {
        (user.get("email") or "").lower()
        async for user in db["users"].find({"email": {"$in": cleaned}}, {"_id": 0, "email": 1})
    }
    unknown = [email for email in cleaned if email not in known]
    if unknown:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Not a known user: {', '.join(unknown)}",
        )
    return cleaned


def _text(value) -> Optional[str]:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    return str(value)


async def _next_number(db: AsyncIOMotorDatabase, counter_id: str) -> int:
    counter = await db["counters"].find_one_and_update(
        {"_id": counter_id}, {"$inc": {"seq": 1}}, upsert=True, return_document=ReturnDocument.AFTER,
    )
    return int(counter.get("seq", 1))


async def _stage_or_404(db: AsyncIOMotorDatabase, project_id: int, stage_key: str, actor: str) -> dict:
    lifecycle = await get_or_create(db, project_id, created_by=actor)
    stage = next((item for item in (lifecycle.get("stages") or []) if item["key"] == stage_key), None)
    if not stage:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Stage not found")
    return stage


def _checked_track(stage: dict, track: Optional[str]) -> Optional[str]:
    """The stream this entry belongs to, refused if the stage does not run it."""
    tracks = list(stage.get("tracks") or [])
    if not track:
        return None
    match = next((item for item in tracks if item.lower() == track.strip().lower()), None)
    if not match:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"{stage['name']} has no {track} stream.",
        )
    return match


async def _stage_detail(db: AsyncIOMotorDatabase, project_id: int, stage_key: str) -> StageDetailOut:
    where = {"project_id": project_id, "stage_key": stage_key}
    remarks = await db[REMARKS].find(where).sort("created_at", -1).to_list(length=200)
    attachments = await db[ATTACHMENTS].find(where).sort("created_at", -1).to_list(length=200)
    names = await _names_for(
        db,
        [row.get("author_email") for row in remarks] + [row.get("added_by") for row in attachments],
    )

    return StageDetailOut(
        stage_key=stage_key,
        remarks=[
            StageRemarkOut(
                id=row["remark_number"],
                stage_key=stage_key,
                track=row.get("track"),
                body=row.get("body") or "",
                author_email=row.get("author_email") or "",
                author_name=names.get((row.get("author_email") or "").lower()),
                created_at=row["created_at"],
            )
            for row in remarks
            if row.get("created_at")
        ],
        attachments=[
            StageAttachmentOut(
                id=row["attachment_number"],
                stage_key=stage_key,
                track=row.get("track"),
                kind=row.get("kind") or "file",
                label=row.get("label") or "",
                url=row.get("url"),
                content_type=row.get("content_type"),
                size_bytes=row.get("size_bytes"),
                added_by=row.get("added_by") or "",
                added_by_name=names.get((row.get("added_by") or "").lower()),
                created_at=row["created_at"],
            )
            for row in attachments
            if row.get("created_at")
        ],
    )


def _safe_name(name: str) -> str:
    """A filename that cannot escape the upload folder or collide with a path."""
    cleaned = re.sub(r"[^A-Za-z0-9._-]+", "_", Path(name or "").name).strip("._") or "file"
    return cleaned[:120]


async def _next_module_number(db: AsyncIOMotorDatabase, project_id: int) -> int:
    counter = await db["counters"].find_one_and_update(
        {"_id": f"project_modules_{project_id}"}, {"$inc": {"seq": 1}},
        upsert=True, return_document=ReturnDocument.AFTER,
    )
    return int(counter.get("seq", 1))



__all__ = [
    "router",
    "STORAGE_CATEGORY",
    "VIEWABLE_PREFIXES",
    "VIEWABLE_TYPES",
    "GENERIC_TYPES",
    "EXTENSION_TYPES",
    "MAX_UPLOAD_BYTES",
    "UPLOAD_CHUNK",
    "ALLOWED_PREFIXES",
    "BLOCKED_TYPES",
    "ALLOWED_TYPES",
    "OOXML_TYPES",
    "_now",
    "_slug",
    "_to_datetime",
    "_as_date",
    "_project",
    "_names_for",
    "stage_assignees",
    "_counts_by_stage",
    "_stage_out",
    "_ticket_out",
    "TICKET_FIELDS",
    "_project_statuses",
    "_linked_tickets",
    "_ticket_tally",
    "module_assignees",
    "_module_out",
    "_summary",
    "_lifecycle_response",
    "_aware",
    "_rebuild_clock",
    "_known_people",
    "_text",
    "_next_number",
    "_stage_or_404",
    "_checked_track",
    "_stage_detail",
    "_safe_name",
    "_next_module_number",
]
