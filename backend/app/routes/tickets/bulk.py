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

@router.post("/{project_id}/tickets/bulk_delete", response_model=TicketBulkDeleteResult)
async def bulk_delete_tickets(
    project_id: int,
    payload: TicketBulkDeleteRequest,
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    """Delete several tickets. Same permission rule as single delete: admin or reporter."""
    await verify_project_access(project_id, current_user.email, db, current_user.role, user_id=current_user.id)

    # Fetch and authorize the whole batch up front, then cascade once - a per-ticket
    # find + cascade loop would be ~10 round-trips per selected ticket.
    found = {
        t["ticket_number"]: t
        async for t in db["tickets"].find({
            "project_id": project_id,
            "ticket_number": {"$in": payload.ticket_numbers},
        })
    }

    deletable: List[int] = []
    errors: List[dict] = []
    for tnum in payload.ticket_numbers:
        ticket = found.get(tnum)
        if not ticket:
            errors.append({"ticket_number": tnum, "error": "Not found"})
        elif not _can_delete(ticket, current_user):
            errors.append({"ticket_number": tnum, "error": "Only the ticket creator or an admin can delete this ticket"})
        else:
            deletable.append(tnum)

    subtasks_deleted = (
        await _delete_ticket_cascade(db, project_id, deletable) if deletable else 0
    )

    return {"deleted": len(deletable), "subtasks_deleted": subtasks_deleted, "errors": errors}


@router.post("/{project_id}/tickets/bulk_update", response_model=TicketBulkUpdateResult)
async def bulk_update_tickets(
    project_id: int,
    payload: TicketBulkUpdateRequest,
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    """Apply the same set of updates to multiple tickets atomically per-ticket."""
    await verify_project_access(project_id, current_user.email, db, current_user.role, user_id=current_user.id)

    tickets_collection = db["tickets"]
    statuses_collection = db["ticket_statuses"]

    updates = payload.updates

    # Pre-validate status_id once
    target_requires_evidence = False
    if updates.status_id is not None:
        status_doc = await statuses_collection.find_one({
            "status_number": updates.status_id,
            "project_id": project_id,
        })
        if not status_doc:
            raise HTTPException(status_code=400, detail="Invalid status ID")
        target_requires_evidence = status_doc.get("name", "") in EVIDENCE_REQUIRED_STATUS_NAMES

    # Build a $set payload that applies to every ticket
    set_payload: dict = {}
    if updates.status_id is not None:
        set_payload["status_id"] = updates.status_id
    if updates.assignee_email is not None:
        set_payload["assignee_email"] = updates.assignee_email or None
    if updates.priority is not None:
        set_payload["priority"] = updates.priority
    if updates.sprint_id is not None:
        set_payload["sprint_id"] = updates.sprint_id
    if updates.epic_id is not None:
        set_payload["epic_id"] = updates.epic_id

    now = datetime.now(timezone.utc)

    updated = 0
    errors: List[dict] = []

    for tnum in payload.ticket_numbers:
        try:
            ticket = await tickets_collection.find_one({
                "ticket_number": tnum,
                "project_id": project_id,
            })
            if not ticket:
                errors.append({"ticket_number": tnum, "error": "Not found"})
                continue

            # Gate: don't let bulk move a ticket into an evidence-required status (In
            # Review, Testing, Done, …) without evidence (MR link or comment). Only
            # enforce on an actual transition IN from a non-evidence status; the ticket
            # is skipped entirely and reported so its state stays consistent.
            if target_requires_evidence:
                current_name = await get_status_name(db, ticket.get("status_id"))
                if current_name not in EVIDENCE_REQUIRED_STATUS_NAMES and not await ticket_has_done_evidence(
                    db, ticket, ticket.get("merge_request_url")
                ):
                    errors.append({"ticket_number": tnum, "error": DONE_EVIDENCE_MESSAGE})
                    continue

            # Cap forward status jumps per ticket. A single bulk target can be a legal
            # next step for some tickets and an illegal jump for others, so an offending
            # ticket is skipped and reported rather than aborting the batch. Epics and
            # subtasks are exempt.
            transition_extra: dict = {}
            if updates.status_id is not None and ticket.get("type") not in STATUS_CAP_EXEMPT_TYPES:
                try:
                    transition_extra = await validate_status_transition(
                        db, project_id, ticket.get("status_id"), updates.status_id, ticket
                    )
                except HTTPException as exc:
                    errors.append({"ticket_number": tnum, "error": exc.detail})
                    continue

            ticket_set = dict(set_payload)
            ticket_set.update(transition_extra)
            ticket_set["updated_at"] = now

            # Compute label add/remove per-ticket
            if updates.labels_add or updates.labels_remove:
                current_labels = list(ticket.get("labels") or [])
                if updates.labels_remove:
                    remove_set = set(updates.labels_remove)
                    current_labels = [l for l in current_labels if l not in remove_set]
                if updates.labels_add:
                    for l in updates.labels_add:
                        if l not in current_labels:
                            current_labels.append(l)
                ticket_set["labels"] = current_labels

            has_field_updates = list(ticket_set.keys()) != ["updated_at"]
            if not has_field_updates and updates.archived is None:
                # No-op for this ticket
                continue

            if has_field_updates:
                await tickets_collection.update_one(
                    {"ticket_number": tnum, "project_id": project_id},
                    {"$set": ticket_set},
                )

            # Go through the same helper the single-ticket route uses, so bulk archive
            # takes the subtasks along AND records history identically.
            if updates.archived is not None:
                await _set_archived(db, project_id, tnum, updates.archived, current_user.email)

            updated += 1
        except Exception as exc:  # noqa: BLE001
            logger.exception("Bulk update failed for ticket %s", tnum)
            errors.append({"ticket_number": tnum, "error": "Update failed"})

    return TicketBulkUpdateResult(updated=updated, errors=errors)


@router.post("/{project_id}/tickets/{ticket_id}/move", response_model=TicketOut)
async def move_ticket(
    project_id: int,
    ticket_id: int,
    move_request: TicketMoveRequest,
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    """Move a ticket to a different status (for drag-and-drop)."""
    await verify_project_access(project_id, current_user.email, db, current_user.role, user_id=current_user.id)
    tickets_collection = db["tickets"]
    statuses_collection = db["ticket_statuses"]

    # Verify ticket exists
    ticket = await tickets_collection.find_one({
        "ticket_number": ticket_id,
        "project_id": project_id
    })
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")

    # Verify status exists
    status_doc = await statuses_collection.find_one({
        "status_number": move_request.status_id,
        "project_id": project_id
    })
    if not status_doc:
        raise HTTPException(status_code=400, detail="Invalid status ID")

    # Check if this is a done status - match exact names like status.py does
    status_name = status_doc.get("name", "")
    is_done_status = status_name in ["Done", "Closed", "Completed"]
    requires_evidence = status_name in EVIDENCE_REQUIRED_STATUS_NAMES
    is_review_status = status_name in ["Review", "In Review", "Code Review", "Testing"]

    logger.info(f"[SUBTASK VALIDATION - MOVE] Ticket {ticket_id}: status_name='{status_name}', is_done={is_done_status}, is_review={is_review_status}, parent_id={ticket.get('parent_id')}")

    # If moving to Done or Review status, check if all subtasks meet the requirement (only for parent tickets)
    if (is_done_status or is_review_status) and ticket.get("parent_id") is None:
        logger.info(f"[SUBTASK VALIDATION - MOVE] Ticket {ticket_id} is a parent ticket moving to Review/Done, checking subtasks...")
        # This is a parent ticket (not a subtask), check if it has subtasks
        subtasks = await tickets_collection.find({
            "parent_id": ticket_id,
            "project_id": project_id,
            "type": "subtask"
        }).to_list(length=None)

        logger.info(f"[SUBTASK VALIDATION - MOVE] Found {len(subtasks)} subtasks for ticket {ticket_id}")

        if subtasks:
            # Check if all subtasks meet the required status
            incomplete_subtasks = []
            for subtask in subtasks:
                subtask_key = subtask.get("key", f"#{subtask.get('ticket_number')}")
                subtask_status_id = subtask.get("status_id")
                logger.info(f"[SUBTASK VALIDATION - MOVE] Checking subtask {subtask_key}: status_id={subtask_status_id}")

                if subtask_status_id is None:
                    # Subtask has no status, consider it incomplete
                    logger.info(f"[SUBTASK VALIDATION - MOVE] Subtask {subtask_key} has no status, marking as incomplete")
                    incomplete_subtasks.append(subtask_key)
                    continue

                subtask_status_doc = await statuses_collection.find_one({
                    "status_number": subtask_status_id,
                    "project_id": project_id
                })

                if not subtask_status_doc:
                    # Subtask has invalid status, consider it incomplete
                    logger.info(f"[SUBTASK VALIDATION - MOVE] Subtask {subtask_key} has invalid status, marking as incomplete")
                    incomplete_subtasks.append(subtask_key)
                    continue

                subtask_status_name = subtask_status_doc.get("name", "")
                is_subtask_done = subtask_status_name in ["Done", "Closed", "Completed"]
                logger.info(f"[SUBTASK VALIDATION - MOVE] Subtask {subtask_key}: status='{subtask_status_name}', is_done={is_subtask_done}")

                # For Done status: require all subtasks to be Done
                # For Review status: require all subtasks to be Done
                if not is_subtask_done:
                    logger.info(f"[SUBTASK VALIDATION - MOVE] Subtask {subtask_key} is not done, marking as incomplete")
                    incomplete_subtasks.append(subtask_key)

            logger.info(f"[SUBTASK VALIDATION - MOVE] Total incomplete subtasks: {len(incomplete_subtasks)}")
            if incomplete_subtasks:
                status_type = "Review" if is_review_status else "Done"
                incomplete_count = len(incomplete_subtasks)

                # Format subtask list with bullet points
                if incomplete_count <= 5:
                    subtask_list = "\n• " + "\n• ".join(incomplete_subtasks)
                else:
                    # Show first 5 and indicate there are more
                    subtask_list = "\n• " + "\n• ".join(incomplete_subtasks[:5])
                    subtask_list += f"\n• ... and {incomplete_count - 5} more"

                logger.error(f"[SUBTASK VALIDATION - MOVE] BLOCKING status change: {incomplete_count} incomplete subtasks")
                raise HTTPException(
                    status_code=400,
                    detail=f"Cannot move to '{status_type}' status until all subtasks are completed.\n\nPlease complete these {incomplete_count} subtask(s) first:{subtask_list}"
                )
            else:
                logger.info(f"[SUBTASK VALIDATION - MOVE] All subtasks are done, allowing status change")
        else:
            logger.info(f"[SUBTASK VALIDATION - MOVE] No subtasks found, allowing status change")
    else:
        logger.info(f"[SUBTASK VALIDATION - MOVE] Skipping validation: not a parent ticket moving to Review/Done")

    # Get old status name before update
    old_status_name = await get_status_name(db, ticket.get("status_id"))

    # Require evidence of the work (MR link or a comment) before a ticket can enter an
    # evidence-required status (In Review, Testing, Done, …). Only enforce on an actual
    # transition IN from a non-evidence status, so In Review -> Testing isn't re-prompted.
    was_evidence_status = old_status_name in EVIDENCE_REQUIRED_STATUS_NAMES
    if requires_evidence and not was_evidence_status:
        if not await ticket_has_done_evidence(db, ticket, ticket.get("merge_request_url")):
            raise HTTPException(status_code=400, detail=DONE_EVIDENCE_MESSAGE)

    # Cap forward status jumps (one step forward max; any number backward). Epics and
    # subtasks are exempt. May raise 400, or return pre_block_status_id set/clear fields.
    move_extra: dict = {}
    if ticket.get("type") not in STATUS_CAP_EXEMPT_TYPES:
        move_extra = await validate_status_transition(
            db, project_id, ticket.get("status_id"), move_request.status_id, ticket
        )

    # Update ticket status
    set_fields = {
        "status_id": move_request.status_id,
        "updated_at": datetime.now(timezone.utc),
    }
    set_fields.update(move_extra)
    updated_ticket = await tickets_collection.find_one_and_update(
        {"ticket_number": ticket_id, "project_id": project_id},
        {"$set": set_fields},
        return_document=ReturnDocument.AFTER,
    )

    # Record history for status change
    history_collection = db["ticket_history"]
    counters_collection = db["counters"]
    counter = await counters_collection.find_one_and_update(
        {"_id": f"ticket_history_{ticket_id}"},
        {"$inc": {"seq": 1}},
        upsert=True,
        return_document=ReturnDocument.AFTER,
    )
    history_number = int(counter.get("seq", 1))

    old_status_id = ticket.get("status_id")

    await history_collection.insert_one({
        "history_number": history_number,
        "ticket_id": ticket_id,
        "project_id": project_id,  # Added for standup reports
        "field_name": "status_id",  # Changed from "field" to "field_name" and from "status" to "status_id"
        "old_value": str(old_status_id) if old_status_id else None,  # Store as string
        "new_value": str(move_request.status_id),  # Store as string
        "changed_by": current_user.id,  # Use changed_by for consistency
        "changed_at": datetime.now(timezone.utc),  # Changed from "created_at" to "changed_at"
        "created_at": datetime.now(timezone.utc),  # Keep for backward compatibility
    })

    # Get assignee info (prefer assignee_email, fall back to legacy assignee_id)
    assignee = await _resolve_assignee(db, updated_ticket)

    # Get reporter info (prefer reporter_email, fall back to legacy reporter_id)
    reporter = await _resolve_reporter(db, updated_ticket)

    # Get status name + visual (colour/category) from the already-fetched doc
    status_name = status_doc.get("name")
    status_color = status_doc.get("color")
    status_category = categorize_status(status_name)

    # Create notifications for status change
    await create_ticket_notifications(
        db,
        project_id,
        updated_ticket,
        event_type="ticket_status_changed",
        message=f"Status changed to {status_name} for {updated_ticket.get('key')}",
        actor_user_id=current_user.id,
    )

    return {
        "id": ticket_id,
        "project_id": project_id,
        "key": updated_ticket.get("key"),
        "title": updated_ticket.get("title"),
        "description": updated_ticket.get("description"),
        "type": updated_ticket.get("type"),
        "status_id": updated_ticket.get("status_id"),
        "status_name": status_name,
        "status_color": status_color,
        "status_category": status_category,
        "pre_block_status_id": updated_ticket.get("pre_block_status_id"),
        "priority": updated_ticket.get("priority"),
        "assignee": assignee,
        "reporter": reporter,
        "due_date": updated_ticket.get("due_date"),
        "labels": updated_ticket.get("labels", []),
        "epic_id": updated_ticket.get("epic_id"),
        "sprint_id": updated_ticket.get("sprint_id"),
        "story_points": updated_ticket.get("story_points"),
        "created_at": updated_ticket.get("created_at"),
        "updated_at": updated_ticket.get("updated_at"),
    }


# ========== Comment Endpoints ==========

