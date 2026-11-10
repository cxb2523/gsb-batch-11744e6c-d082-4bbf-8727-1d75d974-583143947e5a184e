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

@router.get("/{project_id}/lifecycle/stages/{stage_key}/details", response_model=StageDetailOut)
async def get_stage_detail(
    project_id: int,
    stage_key: str,
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    """The remarks, files and links recorded against one stage, newest first."""
    await _project(db, project_id, current_user)
    await _stage_or_404(db, project_id, stage_key, current_user.email)
    return await _stage_detail(db, project_id, stage_key)


@router.post("/{project_id}/lifecycle/stages/{stage_key}/remarks", response_model=StageDetailOut, status_code=status.HTTP_201_CREATED)
async def add_remark(
    project_id: int,
    stage_key: str,
    payload: RemarkIn,
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    """Add a remark to the stage. Remarks are appended, never overwritten."""
    await _project(db, project_id, current_user)
    stage = await _stage_or_404(db, project_id, stage_key, current_user.email)
    await db[REMARKS].insert_one({
        "remark_number": await _next_number(db, f"stage_remarks_{project_id}"),
        "project_id": project_id,
        "stage_key": stage_key,
        "track": _checked_track(stage, payload.track),
        "body": payload.body,
        "author_email": current_user.email,
        "created_at": _now(),
    })
    await record_event(
        db, project_id, action="remark_added", actor=current_user.email,
        stage_key=stage_key, stage_name=stage["name"],
    )
    return await _stage_detail(db, project_id, stage_key)


@router.delete("/{project_id}/lifecycle/stages/{stage_key}/remarks/{remark_id}", response_model=StageDetailOut)
async def remove_remark(
    project_id: int,
    stage_key: str,
    remark_id: int,
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    """Remove a remark. Your own, unless you are an admin."""
    await _project(db, project_id, current_user)
    where = {"project_id": project_id, "stage_key": stage_key, "remark_number": remark_id}
    remark = await db[REMARKS].find_one(where)
    if not remark:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Remark not found")
    if (remark.get("author_email") or "").lower() != current_user.email.lower() and current_user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You can only remove your own remarks")

    await db[REMARKS].delete_one(where)
    await record_event(db, project_id, action="remark_removed", actor=current_user.email, stage_key=stage_key)
    return await _stage_detail(db, project_id, stage_key)


@router.post("/{project_id}/lifecycle/stages/{stage_key}/links", response_model=StageDetailOut, status_code=status.HTTP_201_CREATED)
async def add_link(
    project_id: int,
    stage_key: str,
    payload: LinkIn,
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    """Point the stage at a document that lives elsewhere: Figma, Drive, a shared doc."""
    await _project(db, project_id, current_user)
    stage = await _stage_or_404(db, project_id, stage_key, current_user.email)
    label = payload.label or payload.url
    await db[ATTACHMENTS].insert_one({
        "attachment_number": await _next_number(db, f"stage_attachments_{project_id}"),
        "project_id": project_id,
        "stage_key": stage_key,
        "track": _checked_track(stage, payload.track),
        "kind": "link",
        "label": label,
        "url": payload.url,
        "added_by": current_user.email,
        "created_at": _now(),
    })
    await record_event(
        db, project_id, action="link_added", actor=current_user.email,
        stage_key=stage_key, stage_name=stage["name"], new_value=label,
    )
    return await _stage_detail(db, project_id, stage_key)


@router.post("/{project_id}/lifecycle/stages/{stage_key}/files", response_model=StageDetailOut, status_code=status.HTTP_201_CREATED)
async def upload_file(
    project_id: int,
    stage_key: str,
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
    file: Annotated[UploadFile, File(...)],
    track: Annotated[Optional[str], Form()] = None,
):
    """Attach a document or screenshot to a stage.

    Read with the size cap applied, validated against its real signature, then
    handed to the storage backend — so a rejected or oversized upload never
    reaches storage. The 10 MB ceiling keeps this comfortably in memory.
    """
    await _project(db, project_id, current_user)
    stage = await _stage_or_404(db, project_id, stage_key, current_user.email)
    track = _checked_track(stage, track)

    content_type = (file.content_type or "").split(";")[0].strip().lower()
    if content_type in GENERIC_TYPES:
        content_type = EXTENSION_TYPES.get(Path(file.filename or "").suffix.lower(), content_type)
    if content_type in BLOCKED_TYPES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="SVG files are not accepted. Attach a PNG or a PDF instead.",
        )
    if content_type not in ALLOWED_TYPES and not content_type.startswith(ALLOWED_PREFIXES):
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Attach an image, a PDF, or an Office or text document.",
        )

    number = await _next_number(db, f"stage_attachments_{project_id}")
    label = _safe_name(file.filename or "file")
    stored_name = f"{project_id}_{number}_{label}"

    # Read with the cap applied (one extra byte lets us detect oversize without
    # loading an unbounded file), then validate before anything is persisted.
    content = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Files must be 10 MB or smaller.",
        )

    # The checks above trust the client's declared content_type. Verify the real
    # signature and, when present, treat it as the source of truth over the label.
    _, detected_mime = sniff(content)
    if detected_mime is not None:
        if detected_mime in BLOCKED_TYPES:
            raise HTTPException(
                status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
                detail="SVG files are not accepted. Attach a PNG or a PDF instead.",
            )
        if detected_mime == "application/zip" and content_type in OOXML_TYPES:
            # A zip signature is exactly what a .docx/.xlsx/.pptx looks like; keep
            # the declared Office type rather than downgrading it to plain zip.
            pass
        elif detected_mime not in ALLOWED_TYPES and not detected_mime.startswith(ALLOWED_PREFIXES):
            raise HTTPException(
                status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
                detail=f"{file.filename or 'This file'} contents are {detected_mime}, which isn't an accepted type.",
            )
        else:
            content_type = detected_mime
    elif content_type not in {"text/plain", "text/csv", "text/markdown"}:
        # No signature, yet it claims to be a binary/office/image type — the
        # contents don't back the claim.
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"{file.filename or 'This file'} does not look like a real {content_type} file.",
        )

    get_storage().save(STORAGE_CATEGORY, stored_name, content)
    written = len(content)

    await db[ATTACHMENTS].insert_one({
        "attachment_number": number,
        "project_id": project_id,
        "stage_key": stage_key,
        "track": track,
        "kind": "file",
        "label": file.filename or label,
        "stored_name": stored_name,
        "content_type": content_type or "application/octet-stream",
        "size_bytes": written,
        "added_by": current_user.email,
        "created_at": _now(),
    })
    await record_event(
        db, project_id, action="file_added", actor=current_user.email,
        stage_key=stage_key, stage_name=stage["name"], new_value=file.filename or label,
    )
    return await _stage_detail(db, project_id, stage_key)


@router.get("/{project_id}/lifecycle/stages/{stage_key}/attachments/{attachment_id}/download")
async def download_attachment(
    project_id: int,
    stage_key: str,
    attachment_id: int,
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    """Send back an uploaded file, to people who can see the project and nobody else."""
    await _project(db, project_id, current_user)
    row = await db[ATTACHMENTS].find_one({
        "project_id": project_id, "stage_key": stage_key, "attachment_number": attachment_id, "kind": "file",
    })
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")

    # The storage backend reduces the stored name to a key inside the lifecycle
    # folder and refuses anything that would reach outside it (belt and braces
    # against a name tampered with in the database).
    key = Path((row.get("stored_name") or "").replace("\\", "/")).name
    media_type = row.get("content_type") or "application/octet-stream"
    label = row.get("label") or key
    # Shown in the viewer where the browser can render it safely, saved otherwise.
    # `nosniff` matters either way: it stops a browser deciding for itself that a
    # file we called text is something it should execute.
    inline = media_type in VIEWABLE_TYPES or media_type.startswith(VIEWABLE_PREFIXES)
    disposition = "inline" if inline else "attachment"
    try:
        return serve_stored_file(
            STORAGE_CATEGORY,
            key,
            filename=_safe_name(label),
            media_type=media_type,
            disposition=disposition,
            extra_headers={"X-Content-Type-Options": "nosniff"},
        )
    except (FileNotFoundError, StorageError):
        logger.error("lifecycle attachment %s missing on disk for project %s", attachment_id, project_id)
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")


@router.delete("/{project_id}/lifecycle/stages/{stage_key}/attachments/{attachment_id}", response_model=StageDetailOut)
async def remove_attachment(
    project_id: int,
    stage_key: str,
    attachment_id: int,
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    """Remove a file or link from a stage. The file on disk goes with it."""
    await _project(db, project_id, current_user)
    row = await db[ATTACHMENTS].find_one_and_delete({
        "project_id": project_id, "stage_key": stage_key, "attachment_number": attachment_id,
    })
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attachment not found")

    if row.get("kind") == "file" and row.get("stored_name"):
        key = Path(str(row["stored_name"]).replace("\\", "/")).name
        try:
            get_storage().delete(STORAGE_CATEGORY, key)
        except StorageError:
            pass

    await record_event(
        db, project_id, action="attachment_removed", actor=current_user.email,
        stage_key=stage_key, old_value=row.get("label"),
    )
    return await _stage_detail(db, project_id, stage_key)


# ---------- modules ----------

