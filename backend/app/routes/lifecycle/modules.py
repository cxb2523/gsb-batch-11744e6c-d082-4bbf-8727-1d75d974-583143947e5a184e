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


from ._shared import *  # noqa: F401,F403

@router.post("/{project_id}/lifecycle/modules", response_model=LifecycleOut, status_code=status.HTTP_201_CREATED)
async def add_module(
    project_id: int,
    payload: ModuleIn,
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    """Add a module to the checklist, in priority order."""
    project = await _project(db, project_id, current_user)
    last = await db[MODULES].find_one({"project_id": project_id}, sort=[("position", -1)])
    await db[MODULES].insert_one({
        "module_number": await _next_module_number(db, project_id),
        "project_id": project_id,
        "name": payload.name,
        "assignees": await _known_people(db, payload.assignees or []),
        "deadline": _to_datetime(payload.deadline),
        "done": False,
        "done_at": None,
        "position": int((last or {}).get("position", -1)) + 1,
        "created_by": current_user.email,
        "created_at": _now(),
        "updated_at": _now(),
    })
    await record_event(db, project_id, action="module_added", actor=current_user.email, new_value=payload.name)
    return await _lifecycle_response(db, project_id, project)


@router.patch("/{project_id}/lifecycle/modules/{module_id}", response_model=LifecycleOut)
async def update_module(
    project_id: int,
    module_id: int,
    payload: ModuleUpdate,
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    """Rename a module, set its owner or deadline, or tick it off."""
    project = await _project(db, project_id, current_user)
    module = await db[MODULES].find_one({"project_id": project_id, "module_number": module_id})
    if not module:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Module not found")

    changes: Dict[str, object] = {}
    events: List[tuple] = []

    if payload.assignees is not None or "assignees" in payload.clear:
        wanted = [] if "assignees" in payload.clear else await _known_people(db, payload.assignees or [])
        before = module_assignees(module)
        if wanted != before:
            changes["assignees"] = wanted
            # One source of truth from here on: the single owner field retires.
            changes["owner_email"] = None
            events.append(("assignees", ", ".join(before) or None, ", ".join(wanted) or None))

    if payload.done is not None and (module.get("ticket_ids") or []):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="This module's tickets decide whether it is done. Close them, or unlink them first.",
        )

    for field in ("name", "deadline", "done"):
        value = getattr(payload, field, None)
        if field in payload.clear:
            value = None
        elif value is None:
            continue
        if field == "deadline":
            value = _to_datetime(value)
        if module.get(field) != value:
            changes[field] = value
            events.append((field, _text(module.get(field)), _text(value)))

    if "done" in changes:
        changes["done_at"] = _now() if changes["done"] else None

    if changes:
        changes["updated_at"] = _now()
        await db[MODULES].update_one({"project_id": project_id, "module_number": module_id}, {"$set": changes})
        for field, old_value, new_value in events:
            await record_event(
                db, project_id,
                action="module_done" if field == "done" and new_value == "True" else "module_updated",
                actor=current_user.email, field=field, old_value=old_value, new_value=new_value,
                note=module.get("name"),
            )

    return await _lifecycle_response(db, project_id, project)


@router.delete("/{project_id}/lifecycle/modules/{module_id}", response_model=LifecycleOut)
async def remove_module(
    project_id: int,
    module_id: int,
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    """Remove a module from the checklist."""
    project = await _project(db, project_id, current_user)
    module = await db[MODULES].find_one_and_delete({"project_id": project_id, "module_number": module_id})
    if module:
        await record_event(db, project_id, action="module_removed", actor=current_user.email, old_value=module.get("name"))
    return await _lifecycle_response(db, project_id, project)


@router.put("/{project_id}/lifecycle/modules/{module_id}/tickets", response_model=LifecycleOut)
async def link_module_tickets(
    project_id: int,
    module_id: int,
    payload: ModuleTickets,
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    """Say which tickets do this module's work.

    From then on the module is finished when they are, which is the point: a
    ticked box is a promise, a closed ticket is evidence.
    """
    project = await _project(db, project_id, current_user)
    module = await db[MODULES].find_one({"project_id": project_id, "module_number": module_id})
    if not module:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Module not found")

    wanted: List[int] = []
    for number in payload.ticket_ids:
        if number not in wanted:
            wanted.append(int(number))

    if wanted:
        # A ticket from another project, or one that has been archived, is not work
        # this module can be measured by.
        found = {
            ticket["ticket_number"]
            async for ticket in db["tickets"].find(
                {"project_id": project_id, "ticket_number": {"$in": wanted}, **NOT_ARCHIVED},
                {"_id": 0, "ticket_number": 1},
            )
        }
        missing = [number for number in wanted if number not in found]
        if missing:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Not a ticket on this project: {', '.join(str(number) for number in missing)}",
            )

    before = [int(number) for number in (module.get("ticket_ids") or [])]
    if wanted != before:
        await db[MODULES].update_one(
            {"project_id": project_id, "module_number": module_id},
            {"$set": {"ticket_ids": wanted, "updated_at": _now()}},
        )
        await record_event(
            db, project_id, action="module_tickets_linked", actor=current_user.email,
            field="tickets", old_value=str(len(before)), new_value=str(len(wanted)),
            note=module.get("name"),
        )

    return await _lifecycle_response(db, project_id, project)


@router.get("/{project_id}/lifecycle/tickets", response_model=List[ModuleTicketOut])
async def search_project_tickets(
    project_id: int,
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
    q: Annotated[str, Query(max_length=120)] = "",
    limit: Annotated[int, Query(ge=1, le=50)] = 25,
):
    """Tickets on this project, for choosing which ones a module is built in."""
    await _project(db, project_id, current_user)

    where: Dict[str, object] = {"project_id": project_id, **NOT_ARCHIVED}
    term = q.strip()
    if term:
        # Escaped: a search box is not a place to accept a regular expression.
        pattern = {"$regex": re.escape(term), "$options": "i"}
        where["$or"] = [{"title": pattern}, {"key": pattern}]

    tickets = await db["tickets"].find(where, TICKET_FIELDS).sort("ticket_number", -1).to_list(length=limit)
    statuses = await _project_statuses(db, project_id)
    found = [_ticket_out(ticket, statuses) for ticket in tickets]
    return found


@router.put("/{project_id}/lifecycle/modules/order", response_model=LifecycleOut)
async def reorder_modules(
    project_id: int,
    payload: ModuleOrder,
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    """Set the priority order of the modules."""
    project = await _project(db, project_id, current_user)
    for position, module_id in enumerate(payload.module_ids):
        await db[MODULES].update_one(
            {"project_id": project_id, "module_number": module_id}, {"$set": {"position": position, "updated_at": _now()}},
        )
    return await _lifecycle_response(db, project_id, project)


# ---------- activity ----------

