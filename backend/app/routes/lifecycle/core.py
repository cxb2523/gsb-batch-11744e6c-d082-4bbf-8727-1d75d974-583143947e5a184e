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

@router.get("/lifecycle/active", response_model=LifecycleActive)
async def active_lifecycles(
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    """Projects whose lifecycle has actually started and is not finished.

    Only the ids: a list of projects wants to mark the ones that are moving, not
    read each one's whole funnel. Project access is checked where the lifecycle
    itself is read; an id alone says nothing a project list does not already show.
    """
    moving: List[int] = []
    async for lifecycle in db[LIFECYCLES].find({}, {"_id": 0, "project_id": 1, "stages.state": 1}):
        states = [stage.get("state") for stage in (lifecycle.get("stages") or [])]
        started = any(state in ("in_progress", "done", "blocked", "skipped") for state in states)
        finished = bool(states) and all(state in ("done", "skipped") for state in states)
        if started and not finished:
            moving.append(lifecycle["project_id"])
    return LifecycleActive(project_ids=sorted(moving))


# ---------- the board ----------

@router.get("/{project_id}/lifecycle", response_model=LifecycleOut)
async def get_lifecycle(
    project_id: int,
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    """Where the project is, with each stage's dates and days, and its modules."""
    project = await _project(db, project_id, current_user)
    await get_or_create(db, project_id, created_by=current_user.email)
    return await _lifecycle_response(db, project_id, project)


@router.patch("/{project_id}/lifecycle/stages/{stage_key}", response_model=LifecycleOut)
async def update_stage(
    project_id: int,
    stage_key: str,
    payload: StageUpdate,
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    """Move a stage, or set its owner, target date or note. Every change is recorded."""
    project = await _project(db, project_id, current_user)
    lifecycle = await get_or_create(db, project_id, created_by=current_user.email)
    stages = lifecycle.get("stages") or []
    stage = next((item for item in stages if item["key"] == stage_key), None)
    if not stage:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Stage not found")

    changes: List[tuple] = []
    if payload.state and payload.state != stage.get("state"):
        changes.append(("state", stage.get("state") or "not_started", payload.state))
        apply_state(stage, payload.state)

    if payload.assignees is not None or "assignees" in payload.clear:
        wanted = [] if "assignees" in payload.clear else await _known_people(db, payload.assignees or [])
        before = stage_assignees(stage)
        if wanted != before:
            changes.append(("assignees", ", ".join(before) or None, ", ".join(wanted) or None))
            stage["assignees"] = wanted
            # One source of truth from here on: the single owner field retires.
            stage["owner_email"] = None

    for field in ("target_date", "note", "started_at", "completed_at"):
        value = getattr(payload, field)
        if field in payload.clear:
            value = None
        elif value is None:
            continue
        if field in ("target_date", "started_at", "completed_at"):
            value = _to_datetime(value)
        if stage.get(field) != value:
            changes.append((field, _text(stage.get(field)), _text(value)))
            stage[field] = value

    if any(field in ("started_at", "completed_at") for field, _old, _new in changes):
        _rebuild_clock(stage)

    if changes:
        await db[LIFECYCLES].update_one(
            {"project_id": project_id}, {"$set": {"stages": stages, "updated_at": _now()}},
        )
        for field, old_value, new_value in changes:
            await record_event(
                db, project_id,
                action="stage_moved" if field == "state" else "stage_updated",
                actor=current_user.email, stage_key=stage["key"], stage_name=stage["name"],
                field=field, old_value=old_value, new_value=new_value,
                note=payload.note if field == "state" else None,
            )

    return await _lifecycle_response(db, project_id, project)


@router.post("/{project_id}/lifecycle/advance", response_model=LifecycleOut)
async def advance_stage(
    project_id: int,
    payload: AdvanceIn,
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    """Finish the stage in hand and start the next one, in one step.

    This is the move the team makes most often, so it is one action rather than
    two. Both moves are recorded separately, exactly as if they had been made by
    hand, and the write is guarded so two people advancing at the same moment
    cannot skip a stage between them.
    """
    project = await _project(db, project_id, current_user)
    lifecycle = await get_or_create(db, project_id, created_by=current_user.email)
    stages = sorted(lifecycle.get("stages") or [], key=lambda item: item.get("position", 0))

    index = next((position for position, item in enumerate(stages) if item["key"] == payload.stage_key), None)
    if index is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Stage not found")

    stage = stages[index]
    if stage.get("state") in ("done", "skipped"):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="That stage has already been finished. Refresh to see where the project is.",
        )

    moves = [(stage, stage.get("state") or "not_started", "done")]
    apply_state(stage, "done")
    following = next((item for item in stages[index + 1:] if item.get("state") not in ("done", "skipped")), None)
    if following is not None:
        moves.append((following, following.get("state") or "not_started", "in_progress"))
        apply_state(following, "in_progress")

    result = await db[LIFECYCLES].update_one(
        {"project_id": project_id, "updated_at": lifecycle.get("updated_at")},
        {"$set": {"stages": stages, "updated_at": _now()}},
    )
    if result.matched_count == 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Someone else changed this lifecycle a moment ago. Refresh and try again.",
        )

    for moved, old_value, new_value in moves:
        await record_event(
            db, project_id, action="stage_moved", actor=current_user.email,
            stage_key=moved["key"], stage_name=moved["name"],
            field="state", old_value=old_value, new_value=new_value,
        )

    return await _lifecycle_response(db, project_id, project)


@router.put("/{project_id}/lifecycle/flow", response_model=LifecycleOut)
async def replace_flow(
    project_id: int,
    payload: FlowIn,
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    """Tailor the flow for this project: rename, reorder, add or drop stages.

    A stage that keeps its key keeps its history; a stage that is dropped takes
    its dates with it, which is why the change is recorded.
    """
    project = await _project(db, project_id, current_user)
    lifecycle = await get_or_create(db, project_id, created_by=current_user.email)
    existing = {stage["key"]: stage for stage in lifecycle.get("stages") or []}

    stages: List[dict] = []
    keys: List[str] = []
    for position, incoming in enumerate(payload.stages):
        key = incoming.key if incoming.key and incoming.key in existing and incoming.key not in keys else _slug(incoming.name, keys)
        keys.append(key)
        stage = dict(existing.get(key) or new_stage({"key": key, "name": incoming.name}, position))
        stage.update({
            "key": key, "codename": incoming.codename, "name": incoming.name, "team": incoming.team,
            "description": incoming.description, "position": position, "is_milestone": incoming.is_milestone,
        })
        stages.append(stage)

    dropped = [stage["name"] for key, stage in existing.items() if key not in keys]
    # Once a project tailors its flow it stops following changes to the company one.
    await db[LIFECYCLES].update_one(
        {"project_id": project_id}, {"$set": {"stages": stages, "customised": True, "updated_at": _now()}},
    )
    await record_event(
        db, project_id, action="flow_updated", actor=current_user.email,
        old_value=", ".join(stage["name"] for stage in existing.values()) or None,
        new_value=", ".join(stage["name"] for stage in stages),
        note=f"Removed: {', '.join(dropped)}" if dropped else None,
    )
    return await _lifecycle_response(db, project_id, project)


# ---------- what a stage carries: remarks, files and links ----------

@router.get("/{project_id}/lifecycle/activity", response_model=List[LifecycleEvent])
async def get_activity(
    project_id: int,
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
):
    """What has happened to this project's lifecycle, newest first."""
    await _project(db, project_id, current_user)
    events = await db[EVENTS].find({"project_id": project_id}).sort("at", -1).to_list(length=limit)
    names = await _names_for(db, [event.get("actor") for event in events])
    return [
        LifecycleEvent(
            action=event.get("action") or "updated",
            stage_key=event.get("stage_key"),
            stage_name=event.get("stage_name"),
            field=event.get("field"),
            old_value=event.get("old_value"),
            new_value=event.get("new_value"),
            note=event.get("note"),
            actor=event.get("actor") or "",
            actor_name=names.get((event.get("actor") or "").lower()),
            at=event.get("at"),
        )
        for event in events
        if event.get("at")
    ]
