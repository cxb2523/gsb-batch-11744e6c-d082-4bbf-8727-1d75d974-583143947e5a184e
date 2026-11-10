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

@router.get("/{project_id}/tickets/{ticket_id}/comments", response_model=List[TicketCommentOut])
async def get_ticket_comments(
    project_id: int,
    ticket_id: int,
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    """Get all comments for a ticket."""
    # Verify user has access to this project
    await verify_project_access(project_id, current_user.email, db, current_user.role, user_id=current_user.id)

    comments_collection = db["ticket_comments"]
    tickets_collection = db["tickets"]

    # Verify ticket exists
    ticket = await tickets_collection.find_one({
        "ticket_number": ticket_id,
        "project_id": project_id
    })
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")

    # Fetch comments
    # IMPORTANT: Query by both ticket_id AND project_id to avoid cross-project contamination
    comments = await comments_collection.find({
        "ticket_id": ticket_id,
        "project_id": project_id
    }).sort("created_at", 1).to_list(length=None)

    # Enrich with author info (prefer author_email, fall back to legacy author_id)
    result = []
    for comment in comments:
        author_email = comment.get("author_email")
        if author_email:
            author = await get_user_info_by_email(db, author_email)
        else:
            author = await get_user_info(db, comment.get("author_id"))
        result.append({
            "id": comment.get("comment_number"),
            "ticket_id": ticket_id,
            "content": comment.get("content"),
            "author": author,
            "created_at": comment.get("created_at"),
            "updated_at": comment.get("updated_at"),
        })

    return result


@router.post("/{project_id}/tickets/{ticket_id}/comments", response_model=TicketCommentOut, status_code=status.HTTP_201_CREATED)
async def create_ticket_comment(
    project_id: int,
    ticket_id: int,
    comment_in: TicketCommentCreate,
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    """Create a new comment on a ticket."""
    # Verify user has access to this project
    await verify_project_access(project_id, current_user.email, db, current_user.role, user_id=current_user.id)

    comments_collection = db["ticket_comments"]
    tickets_collection = db["tickets"]
    counters_collection = db["counters"]

    # Verify ticket exists
    ticket = await tickets_collection.find_one({
        "ticket_number": ticket_id,
        "project_id": project_id
    })
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")

    # Generate comment number
    counter = await counters_collection.find_one_and_update(
        {"_id": f"comments_{ticket_id}"},
        {"$inc": {"seq": 1}},
        upsert=True,
        return_document=ReturnDocument.AFTER,
    )
    comment_number = int(counter.get("seq", 1))

    # Create comment document
    comment_doc = {
        "comment_number": comment_number,
        "ticket_id": ticket_id,
        "project_id": project_id,  # CRITICAL: Include project_id to prevent cross-project contamination
        "author_email": current_user.email,
        "content": comment_in.content,
        "created_at": datetime.now(timezone.utc),
        "updated_at": None,
    }

    await comments_collection.insert_one(comment_doc)

    # Get author info
    author = await get_user_info_by_email(db, current_user.email)

    # Create notifications for comment
    await create_ticket_notifications(
        db,
        project_id,
        ticket,
        event_type="ticket_commented",
        message=f"New comment on {ticket.get('key')}",
        actor_user_id=current_user.id,
        mention_text=comment_in.content,
    )

    return {
        "id": comment_number,
        "ticket_id": ticket_id,
        "content": comment_in.content,
        "author": author,
        "created_at": comment_doc["created_at"],
        "updated_at": None,
    }


@router.put("/{project_id}/tickets/{ticket_id}/comments/{comment_id}", response_model=TicketCommentOut)
async def update_ticket_comment(
    project_id: int,
    ticket_id: int,
    comment_id: int,
    comment_in: TicketCommentCreate,
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    """Update a comment on a ticket. Only the author can update their comment."""
    # Verify user has access to this project
    await verify_project_access(project_id, current_user.email, db, current_user.role, user_id=current_user.id)

    comments_collection = db["ticket_comments"]
    tickets_collection = db["tickets"]

    # Verify ticket exists
    ticket = await tickets_collection.find_one({
        "ticket_number": ticket_id,
        "project_id": project_id
    })
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")

    # Find the comment
    comment = await comments_collection.find_one({
        "comment_number": comment_id,
        "ticket_id": ticket_id,
        "project_id": project_id  # CRITICAL: Filter by project_id
    })
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")

    # Verify the user is the author (prefer author_email, fall back to legacy author_id)
    author_email = comment.get("author_email")
    is_author = (
        author_email == current_user.email
        if author_email
        else comment.get("author_id") == current_user.id
    )
    if not is_author:
        raise HTTPException(status_code=403, detail="You can only edit your own comments")

    # Update the comment
    await comments_collection.update_one(
        {"comment_number": comment_id, "ticket_id": ticket_id, "project_id": project_id},
        {"$set": {
            "content": comment_in.content,
            "updated_at": datetime.now(timezone.utc)
        }}
    )

    # Get updated comment
    updated_comment = await comments_collection.find_one({
        "comment_number": comment_id,
        "ticket_id": ticket_id,
        "project_id": project_id  # CRITICAL: Filter by project_id
    })

    # Get author info
    author = await get_user_info_by_email(db, current_user.email)

    return {
        "id": comment_id,
        "ticket_id": ticket_id,
        "content": updated_comment["content"],
        "author": author,
        "created_at": updated_comment["created_at"],
        "updated_at": updated_comment.get("updated_at"),
    }


@router.delete("/{project_id}/tickets/{ticket_id}/comments/{comment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_ticket_comment(
    project_id: int,
    ticket_id: int,
    comment_id: int,
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    """Delete a comment on a ticket. Only the author or project admin can delete a comment."""
    # Verify user has access to this project
    await verify_project_access(project_id, current_user.email, db, current_user.role, user_id=current_user.id)

    comments_collection = db["ticket_comments"]
    tickets_collection = db["tickets"]

    # Verify ticket exists
    ticket = await tickets_collection.find_one({
        "ticket_number": ticket_id,
        "project_id": project_id
    })
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")

    # Find the comment
    comment = await comments_collection.find_one({
        "comment_number": comment_id,
        "ticket_id": ticket_id,
        "project_id": project_id  # CRITICAL: Filter by project_id
    })
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")

    # Verify the user is the author or an admin (prefer author_email, fall back to legacy author_id)
    author_email = comment.get("author_email")
    is_author = (
        author_email == current_user.email
        if author_email
        else comment.get("author_id") == current_user.id
    )
    is_admin = current_user.role == "admin"

    if not (is_author or is_admin):
        raise HTTPException(status_code=403, detail="You can only delete your own comments or be an admin")

    # Delete the comment
    await comments_collection.delete_one({
        "comment_number": comment_id,
        "ticket_id": ticket_id,
        "project_id": project_id  # CRITICAL: Filter by project_id
    })

    return None


# ========== File Endpoints ==========

