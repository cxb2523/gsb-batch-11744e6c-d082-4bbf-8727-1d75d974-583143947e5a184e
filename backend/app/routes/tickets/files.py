"""Ticket API endpoints for Kanban board and ticket management."""

import asyncio
import base64
import logging
import re
from typing import Annotated, List, Optional, Set, Union
from datetime import datetime, timezone
import os
import shutil
from pathlib import Path

logger = logging.getLogger(__name__)

from fastapi import APIRouter, Depends, HTTPException, Query, status, UploadFile, File as FastAPIFile
from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo import ReturnDocument

from ...core.file_security import signature_mismatch
from ...core.storage import get_storage, serve_stored_file
from ...db.mongo import get_mongo_db
from ...db.queries import NOT_ARCHIVED
from ...core.security import get_current_user, CurrentUser, require_admin
from ...schemas.tickets import (
    TicketPage,
    TicketPromote,
    TicketCreate,
    TicketUpdate,
    TicketOut,
    TicketMoveRequest,
    TicketBulkUpdateRequest,
    TicketBulkUpdateResult,
    TicketBulkDeleteRequest,
    TicketBulkDeleteResult,
    TicketDeleteImpact,
    TicketCommentCreate,
    TicketCommentOut,
    TicketFileOut,
    TicketHistoryOut,
)
from ..watchers import ensure_watcher
from ...services.status_category import categorize_status
from ...utils.date_rules import (
    due_before_start_error,
    not_in_past_error,
    same_date,
    MSG_DUE_REQUIRED,
)


from ._shared import *  # noqa: F401,F403
from ._notifications import *  # noqa: F401,F403

# Ticket attachments live under the "tickets" category of the shared storage
# backend (see app/core/storage.py), which owns the location and the path guard.
STORAGE_CATEGORY = "tickets"


def _storage_key(stored_path: str) -> str:
    """The storage key for a stored ticket file.

    We persist only a relative key (the unique filename) in the DB so it stays
    valid on any machine / backend. Reducing to ``.name`` also tolerates legacy
    rows that still hold an absolute path, so this works before and after
    migration.
    """
    return Path(str(stored_path or "").replace("\\", "/")).name

# Curated allowlist of attachment extensions. We validate by extension rather than
# the browser-supplied content_type (which is trivially spoofable). Downloads default
# to attachments; the inline/preview path (see download_ticket_file) renders in-browser
# but ships a sandbox CSP + nosniff so an uploaded SVG/HTML can't run script on our
# origin, which is what keeps this list safe to broaden beyond images/PDF.
ALLOWED_FILE_EXTENSIONS = {
    # Images
    ".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg",
    # Documents
    ".pdf", ".md", ".markdown", ".txt", ".log", ".rtf",
    ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
    # Data / archives
    ".csv", ".json", ".zip",
}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB

@router.get("/{project_id}/tickets/{ticket_id}/files", response_model=List[TicketFileOut])
async def get_ticket_files(
    project_id: int,
    ticket_id: int,
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    """Get all files for a ticket."""
    await verify_project_access(project_id, current_user.email, db, current_user.role, user_id=current_user.id)
    files_collection = db["ticket_files"]
    tickets_collection = db["tickets"]

    # Verify ticket exists
    ticket = await tickets_collection.find_one({
        "ticket_number": ticket_id,
        "project_id": project_id
    })
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")

    # Fetch files
    # IMPORTANT: Query by both ticket_id AND project_id to avoid cross-project contamination
    files = await files_collection.find({
        "ticket_id": ticket_id,
        "project_id": project_id
    }).sort("created_at", -1).to_list(length=None)

    # Enrich with uploader info (prefer uploader_email; for legacy rows, resolve uploaded_by -> email)
    result = []
    for file_doc in files:
        uploader_email = file_doc.get("uploader_email")
        if not uploader_email and file_doc.get("uploaded_by"):
            legacy_user = await db["users"].find_one({"user_number": file_doc.get("uploaded_by")})
            if legacy_user:
                uploader_email = legacy_user.get("email")
        result.append({
            "id": file_doc.get("file_number"),
            "ticket_id": ticket_id,
            "filename": file_doc.get("filename"),
            # Only the stored filename, never the absolute server path.
            "file_path": Path(file_doc.get("file_path") or "").name,
            "file_type": file_doc.get("file_type"),
            "file_size": file_doc.get("file_size"),
            "uploader_email": uploader_email,
            "created_at": file_doc.get("created_at").isoformat() if file_doc.get("created_at") else None,
        })

    return result


@router.post("/{project_id}/tickets/{ticket_id}/files")
async def upload_ticket_files(
    project_id: int,
    ticket_id: int,
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
    files: List[UploadFile] = FastAPIFile(...),
):
    """Upload files to a ticket."""
    await verify_project_access(project_id, current_user.email, db, current_user.role, user_id=current_user.id)
    files_collection = db["ticket_files"]
    tickets_collection = db["tickets"]
    counters_collection = db["counters"]

    # Verify ticket exists
    ticket = await tickets_collection.find_one({
        "ticket_number": ticket_id,
        "project_id": project_id
    })
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")

    uploaded_files = []

    for file in files:
        # Strip any directory components a client may have smuggled into the name
        # so it can never escape the tickets storage folder (path traversal).
        safe_filename = Path(file.filename or "").name
        if not safe_filename:
            raise HTTPException(status_code=400, detail="File is missing a name.")

        # Validate by extension against the curated allowlist.
        file_ext = Path(safe_filename).suffix.lower()
        if file_ext not in ALLOWED_FILE_EXTENSIONS:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"File {safe_filename} has an unsupported type "
                    f"({file_ext or 'no extension'})."
                ),
            )

        # Check file size (10MB limit)
        file_content = await file.read()
        file_size = len(file_content)
        if file_size > MAX_FILE_SIZE:
            raise HTTPException(
                status_code=400,
                detail=f"File {safe_filename} exceeds 10MB size limit."
            )

        # The extension check above trusts the (client-chosen) name. Verify the
        # real content signature so a file renamed to dodge the allowlist — e.g.
        # an .exe saved as report.pdf — is rejected before it lands on disk.
        mismatch = signature_mismatch(safe_filename, file_content)
        if mismatch:
            raise HTTPException(status_code=400, detail=mismatch)

        # Generate file number
        counter = await counters_collection.find_one_and_update(
            {"_id": f"files_{ticket_id}"},
            {"$inc": {"seq": 1}},
            upsert=True,
            return_document=ReturnDocument.AFTER,
        )
        file_number = int(counter.get("seq", 1))

        # Create unique filename (the bare key we persist and serve by)
        unique_filename = f"{ticket_id}_{file_number}_{safe_filename}"

        # Save via the shared storage backend (see app/core/storage.py).
        get_storage().save(STORAGE_CATEGORY, unique_filename, file_content)

        # Create file document
        file_doc = {
            "file_number": file_number,
            "ticket_id": ticket_id,
            "project_id": project_id,  # CRITICAL: Include project_id to prevent cross-project contamination
            "filename": safe_filename,
            # Store only the relative key, not the absolute path, so it stays
            # valid on any machine / backend. Resolved via the storage backend.
            "file_path": unique_filename,
            "file_type": file.content_type or "application/octet-stream",
            "file_size": file_size,
            "uploader_email": current_user.email,
            "created_at": datetime.now(timezone.utc),
        }

        await files_collection.insert_one(file_doc)

        uploaded_files.append({
            "id": file_number,
            "ticket_id": ticket_id,
            "filename": safe_filename,
            # Return the relative key only, never the absolute server path.
            "file_path": unique_filename,
            "file_type": file.content_type or "application/octet-stream",
            "file_size": file_size,
            "uploader_email": current_user.email,
            "created_at": file_doc["created_at"].isoformat(),
        })
    
    # Create notifications for file uploads
    if uploaded_files:
        await create_ticket_notifications(
            db,
            project_id,
            ticket,
            event_type="ticket_file_uploaded",
            message=f"{len(uploaded_files)} file(s) uploaded to {ticket.get('key')}",
            actor_user_id=current_user.id,
        )

    return {"files": uploaded_files}


@router.get("/{project_id}/tickets/{ticket_id}/files/{file_id}/download")
async def download_ticket_file(
    project_id: int,
    ticket_id: int,
    file_id: int,
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
    inline: bool = False,
):
    """Download a file from a ticket.

    ``inline=1`` serves the file with ``Content-Disposition: inline`` so the
    browser renders it in a tab (the "open/preview" action) instead of forcing a
    save. Inline responses are hardened against the XSS vector that attachments
    sidestep (an uploaded SVG/HTML running script on our origin): we send
    ``X-Content-Type-Options: nosniff`` and a ``sandbox`` CSP with no
    ``allow-scripts``, which neutralises any embedded script while still letting
    images, PDFs and text display natively. Without ``inline`` the response is an
    attachment, exactly as before.
    """
    await verify_project_access(project_id, current_user.email, db, current_user.role, user_id=current_user.id)
    files_collection = db["ticket_files"]
    tickets_collection = db["tickets"]

    # Verify ticket exists
    ticket = await tickets_collection.find_one({
        "ticket_number": ticket_id,
        "project_id": project_id
    })
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")

    # Get file document (scoped to this project so a file can't be fetched cross-project by id)
    file_doc = await files_collection.find_one({
        "file_number": file_id,
        "ticket_id": ticket_id,
        "project_id": project_id
    })
    if not file_doc:
        raise HTTPException(status_code=404, detail="File not found")

    key = _storage_key(file_doc.get("file_path"))
    media_type = file_doc.get("file_type", "application/octet-stream")
    try:
        if inline:
            # Render in-browser, but strip any ability for the file to execute as
            # a document on our origin (SVG/HTML can carry script). The sandbox
            # CSP without allow-scripts blocks that even for types the browser
            # renders.
            return serve_stored_file(
                STORAGE_CATEGORY,
                key,
                filename=file_doc.get("filename"),
                media_type=media_type,
                disposition="inline",
                extra_headers={
                    "X-Content-Type-Options": "nosniff",
                    "Content-Security-Policy": "sandbox; default-src 'none'; img-src 'self' data: blob:; style-src 'unsafe-inline'; object-src 'self'",
                },
            )
        return serve_stored_file(
            STORAGE_CATEGORY,
            key,
            filename=file_doc.get("filename"),
            media_type=media_type,
        )
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="File not found on disk")


@router.delete("/{project_id}/tickets/{ticket_id}/files/{file_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_ticket_file(
    project_id: int,
    ticket_id: int,
    file_id: int,
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    """Delete a file from a ticket."""
    # Verify user has access to this project
    await verify_project_access(project_id, current_user.email, db, current_user.role, user_id=current_user.id)

    files_collection = db["ticket_files"]
    tickets_collection = db["tickets"]

    # Verify ticket exists
    ticket = await tickets_collection.find_one({
        "ticket_number": ticket_id,
        "project_id": project_id
    })
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")

    # Get file document
    file_doc = await files_collection.find_one({
        "file_number": file_id,
        "ticket_id": ticket_id,
        "project_id": project_id  # CRITICAL: Filter by project_id
    })
    if not file_doc:
        raise HTTPException(status_code=404, detail="File not found")

    # Verify the user is the uploader or an admin (prefer uploader_email, fall back to legacy uploaded_by)
    uploader_email = file_doc.get("uploader_email")
    is_uploader = (
        uploader_email == current_user.email
        if uploader_email
        else file_doc.get("uploaded_by") == current_user.id
    )
    is_admin = current_user.role == "admin"

    if not (is_uploader or is_admin):
        raise HTTPException(status_code=403, detail="You can only delete files you uploaded or be an admin")

    # Delete the stored file (a missing file is not an error).
    get_storage().delete(STORAGE_CATEGORY, _storage_key(file_doc.get("file_path")))

    # Delete file document from database
    await files_collection.delete_one({
        "file_number": file_id,
        "ticket_id": ticket_id,
        "project_id": project_id  # CRITICAL: Filter by project_id
    })

    return None


# ========== Ticket History Endpoints ==========

