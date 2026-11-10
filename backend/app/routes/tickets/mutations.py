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

@router.put("/{project_id}/tickets/{ticket_id}", response_model=TicketOut)
async def update_ticket(
    project_id: int,
    ticket_id: int,
    ticket_update: TicketUpdate,
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    """Update a ticket."""
    # Verify user has access to this project
    await verify_project_access(project_id, current_user.email, db, current_user.role, user_id=current_user.id)

    tickets_collection = db["tickets"]

    # Verify ticket exists
    ticket = await tickets_collection.find_one({
        "ticket_number": ticket_id,
        "project_id": project_id
    })
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")

    # --- Due / start date gate (mirrors the frontend; this was previously
    # frontend-only, so the API accepted values the UI rejects). Validate only when a
    # date is actually part of this update, using the effective values (the sent value
    # if present, otherwise what's already stored).
    due_sent = "due_date" in ticket_update.model_fields_set
    start_sent = "start_date" in ticket_update.model_fields_set
    if due_sent or start_sent:
        existing_due = ticket.get("due_date")
        existing_start = ticket.get("start_date")
        effective_due = ticket_update.due_date if due_sent else existing_due
        effective_start = ticket_update.start_date if start_sent else existing_start
        # Invariant: a due date can't precede its start date.
        err = due_before_start_error(effective_due, effective_start)
        if err:
            raise HTTPException(status_code=400, detail=err)
        # Workflow: reject only a date that is *newly* set to the past. An unchanged
        # date that has merely slipped into the past - e.g. editing the title of an old
        # ticket whose due date is now behind us - is left alone.
        changed_due = effective_due if (due_sent and not same_date(effective_due, existing_due)) else None
        err = not_in_past_error(changed_due)
        if err:
            raise HTTPException(status_code=400, detail=err)

    # Build update dict
    update_data = {}
    if ticket_update.title is not None:
        update_data["title"] = ticket_update.title
    if ticket_update.description is not None:
        update_data["description"] = ticket_update.description
    if ticket_update.type is not None:
        update_data["type"] = ticket_update.type
    if ticket_update.status_id is not None:
        # Verify status exists in ticket_statuses collection
        statuses_collection = db["ticket_statuses"]
        status_doc = await statuses_collection.find_one({
            "status_number": ticket_update.status_id,
            "project_id": project_id
        })
        if not status_doc:
            raise HTTPException(status_code=400, detail="Invalid status ID")

        # Check if this is a done status - match exact names like status.py does
        status_name = status_doc.get("name", "")
        is_done_status = status_name in ["Done", "Closed", "Completed"]
        requires_evidence = status_name in EVIDENCE_REQUIRED_STATUS_NAMES
        is_review_status = status_name in ["Review", "In Review", "Code Review", "Testing"]

        logger.info(f"[SUBTASK VALIDATION] Ticket {ticket_id}: status_name='{status_name}', is_done={is_done_status}, is_review={is_review_status}, parent_id={ticket.get('parent_id')}")

        # If moving to Done or Review status, check if all subtasks meet the requirement (only for parent tickets)
        if (is_done_status or is_review_status) and ticket.get("parent_id") is None:
            logger.info(f"[SUBTASK VALIDATION] Ticket {ticket_id} is a parent ticket moving to Review/Done, checking subtasks...")
            # This is a parent ticket (not a subtask), check if it has subtasks
            subtasks = await tickets_collection.find({
                "parent_id": ticket_id,
                "project_id": project_id,
                "type": "subtask"
            }).to_list(length=None)

            logger.info(f"[SUBTASK VALIDATION] Found {len(subtasks)} subtasks for ticket {ticket_id}")

            if subtasks:
                # Check if all subtasks meet the required status
                incomplete_subtasks = []
                for subtask in subtasks:
                    subtask_key = subtask.get("key", f"#{subtask.get('ticket_number')}")
                    subtask_status_id = subtask.get("status_id")
                    logger.info(f"[SUBTASK VALIDATION] Checking subtask {subtask_key}: status_id={subtask_status_id}")

                    if subtask_status_id is None:
                        # Subtask has no status, consider it incomplete
                        logger.info(f"[SUBTASK VALIDATION] Subtask {subtask_key} has no status, marking as incomplete")
                        incomplete_subtasks.append(subtask_key)
                        continue

                    subtask_status_doc = await statuses_collection.find_one({
                        "status_number": subtask_status_id,
                        "project_id": project_id
                    })

                    if not subtask_status_doc:
                        # Subtask has invalid status, consider it incomplete
                        logger.info(f"[SUBTASK VALIDATION] Subtask {subtask_key} has invalid status, marking as incomplete")
                        incomplete_subtasks.append(subtask_key)
                        continue

                    subtask_status_name = subtask_status_doc.get("name", "")
                    is_subtask_done = subtask_status_name in ["Done", "Closed", "Completed"]
                    logger.info(f"[SUBTASK VALIDATION] Subtask {subtask_key}: status='{subtask_status_name}', is_done={is_subtask_done}")

                    # For Done status: require all subtasks to be Done
                    # For Review status: require all subtasks to be Done
                    if not is_subtask_done:
                        logger.info(f"[SUBTASK VALIDATION] Subtask {subtask_key} is not done, marking as incomplete")
                        incomplete_subtasks.append(subtask_key)

                logger.info(f"[SUBTASK VALIDATION] Total incomplete subtasks: {len(incomplete_subtasks)}")
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

                    logger.error(f"[SUBTASK VALIDATION] BLOCKING status change: {incomplete_count} incomplete subtasks")
                    raise HTTPException(
                        status_code=400,
                        detail=f"Cannot move to '{status_type}' status until all subtasks are completed.\n\nPlease complete these {incomplete_count} subtask(s) first:{subtask_list}"
                    )
                else:
                    logger.info(f"[SUBTASK VALIDATION] All subtasks are done, allowing status change")
            else:
                logger.info(f"[SUBTASK VALIDATION] No subtasks found, allowing status change")
        else:
            logger.info(f"[SUBTASK VALIDATION] Skipping validation: not a parent ticket moving to Review/Done")

        # Determine whether the ticket is already in a done status, so we only act
        # on an actual transition INTO done (not edits to an already-done ticket).
        old_status_id = ticket.get("status_id")
        was_done = False
        was_evidence_status = False
        if old_status_id:
            old_status_doc = await statuses_collection.find_one({
                "status_number": old_status_id,
                "project_id": project_id
            })
            if old_status_doc:
                old_name = old_status_doc.get("name", "")
                was_done = old_name in DONE_STATUS_NAMES
                was_evidence_status = old_name in EVIDENCE_REQUIRED_STATUS_NAMES

        # Require evidence of the work before a ticket can enter an evidence-required
        # status (In Review, Testing, Done, …): either a merge request link or at least
        # one comment. Only on an actual transition IN from a non-evidence status, so the
        # normal In Review -> Testing hand-off isn't re-prompted. The MR link may be set
        # in this same request, so use the effective value.
        if requires_evidence and not was_evidence_status:
            effective_mr = (
                ticket_update.merge_request_url
                if "merge_request_url" in ticket_update.model_fields_set
                else ticket.get("merge_request_url")
            )
            if not await ticket_has_done_evidence(db, ticket, effective_mr):
                raise HTTPException(status_code=400, detail=DONE_EVIDENCE_MESSAGE)

        # Cap forward status jumps: a ticket may move at most one step forward in the
        # pipeline (any number of steps backward is fine). Epics/subtasks are exempt.
        # The returned dict sets/clears pre_block_status_id for the Blocked resume rule.
        if ticket.get("type") not in STATUS_CAP_EXEMPT_TYPES:
            transition_extra = await validate_status_transition(
                db, project_id, old_status_id, ticket_update.status_id, ticket
            )
            update_data.update(transition_extra)

        update_data["status_id"] = ticket_update.status_id

        # If moving to done status and not already done, set completed_at
        if is_done_status and not was_done and old_status_id != ticket_update.status_id:
            update_data["completed_at"] = datetime.now(timezone.utc)
    if ticket_update.priority is not None:
        update_data["priority"] = ticket_update.priority
    if "assignee_email" in ticket_update.model_fields_set:
        update_data["assignee_email"] = ticket_update.assignee_email
        # Best-effort: clear legacy assignee_id so reads can't reference stale data
        update_data["assignee_id"] = None
    if ticket_update.due_date is not None:
        update_data["due_date"] = ticket_update.due_date
    if hasattr(ticket_update, 'start_date') and ticket_update.start_date is not None:
        update_data["start_date"] = ticket_update.start_date
    if ticket_update.labels is not None:
        update_data["labels"] = ticket_update.labels
    if "epic_id" in ticket_update.model_fields_set:
        update_data["epic_id"] = ticket_update.epic_id
    if "parent_id" in ticket_update.model_fields_set:
        update_data["parent_id"] = ticket_update.parent_id
    if "sprint_id" in ticket_update.model_fields_set:
        update_data["sprint_id"] = ticket_update.sprint_id
    if ticket_update.story_points is not None:
        update_data["story_points"] = ticket_update.story_points
    if hasattr(ticket_update, 'original_estimate_seconds') and ticket_update.original_estimate_seconds is not None:
        update_data["original_estimate_seconds"] = ticket_update.original_estimate_seconds
    if hasattr(ticket_update, 'remaining_estimate_seconds') and ticket_update.remaining_estimate_seconds is not None:
        update_data["remaining_estimate_seconds"] = ticket_update.remaining_estimate_seconds
    if "merge_request_url" in ticket_update.model_fields_set:
        update_data["merge_request_url"] = ticket_update.merge_request_url

    update_data["updated_at"] = datetime.now(timezone.utc)

    # Record history for changes
    history_collection = db["ticket_history"]
    counters_collection = db["counters"]
    
    # Track what changed
    changes_to_record = []
    if ticket_update.title is not None and ticket.get("title") != ticket_update.title:
        changes_to_record.append({
            "field": "title",
            "old_value": ticket.get("title"),
            "new_value": ticket_update.title
        })
    if ticket_update.description is not None and ticket.get("description") != ticket_update.description:
        changes_to_record.append({
            "field": "description",
            "old_value": ticket.get("description") or "",
            "new_value": ticket_update.description or ""
        })
    if ticket_update.status_id is not None and ticket.get("status_id") != ticket_update.status_id:
        # Record status_id change for history (used by status reports)
        changes_to_record.append({
            "field": "status_id",
            "old_value": str(ticket.get("status_id")) if ticket.get("status_id") else None,
            "new_value": str(ticket_update.status_id)
        })
        # Also record human-readable status change
        old_status_name = await get_status_name(db, ticket.get("status_id"))
        new_status_name = await get_status_name(db, ticket_update.status_id)
        changes_to_record.append({
            "field": "status",
            "old_value": old_status_name,
            "new_value": new_status_name
        })
    if ticket_update.priority is not None and ticket.get("priority") != ticket_update.priority:
        changes_to_record.append({
            "field": "priority",
            "old_value": ticket.get("priority") or "",
            "new_value": ticket_update.priority or ""
        })
    if "assignee_email" in ticket_update.model_fields_set and ticket.get("assignee_email") != ticket_update.assignee_email:
        old_assignee = await _resolve_assignee(db, ticket)
        new_assignee = await get_user_info_by_email(db, ticket_update.assignee_email)
        changes_to_record.append({
            "field": "assignee",
            "old_value": old_assignee.get("name") if old_assignee else "Unassigned",
            "new_value": new_assignee.get("name") if new_assignee else "Unassigned"
        })
    if ticket_update.labels is not None:
        old_labels = ticket.get("labels", [])
        new_labels = ticket_update.labels or []
        if sorted(old_labels) != sorted(new_labels):
            changes_to_record.append({
                "field": "labels",
                "old_value": ", ".join(old_labels) if old_labels else "None",
                "new_value": ", ".join(new_labels) if new_labels else "None"
            })

    # Update ticket
    updated_ticket = await tickets_collection.find_one_and_update(
        {"ticket_number": ticket_id, "project_id": project_id},
        {"$set": update_data},
        return_document=ReturnDocument.AFTER,
    )

    # Record history entries
    actor_info = await get_user_info(db, current_user.id)
    for change in changes_to_record:
        counter = await counters_collection.find_one_and_update(
            {"_id": f"ticket_history_{ticket_id}"},
            {"$inc": {"seq": 1}},
            upsert=True,
            return_document=ReturnDocument.AFTER,
        )
        history_number = int(counter.get("seq", 1))
        
        await history_collection.insert_one({
            "history_number": history_number,
            "ticket_id": ticket_id,
            "project_id": project_id,  # Add project_id for consistency with status.py
            "field_name": change["field"],  # Use field_name to match status.py
            "old_value": change["old_value"],
            "new_value": change["new_value"],
            "changed_by": current_user.id,  # Use changed_by to match status.py
            "changed_at": datetime.now(timezone.utc),  # Use changed_at to match status.py
        })

    # Create notifications for update
    # If assignee changed, send ticket_assigned notification instead
    assignee_changed = (
        "assignee_email" in ticket_update.model_fields_set
        and ticket.get("assignee_email") != ticket_update.assignee_email
    )
    status_changed = (
        ticket_update.status_id is not None
        and ticket.get("status_id") != ticket_update.status_id
    )
    # Assignment is the highest-signal event (and drives auto-watch), so it wins when both
    # change in one PATCH. A status change maps to ticket_status_changed so watchers get the
    # same Slack DM they'd get from the board's drag-and-drop /move endpoint — otherwise a
    # status change made from the detail modal is silently downgraded to a generic
    # ticket_updated, which is excluded from watcher DMs.
    if assignee_changed:
        event_type = "ticket_assigned"
        message = f"Ticket assigned: {updated_ticket.get('key')}"
    elif status_changed:
        new_status_name = await get_status_name(db, ticket_update.status_id)
        event_type = "ticket_status_changed"
        message = f"Status changed to {new_status_name} for {updated_ticket.get('key')}"
    else:
        event_type = "ticket_updated"
        message = f"Ticket updated: {updated_ticket.get('key')}"

    # New assignee auto-subscribes as a watcher (before notifying so they're included).
    if assignee_changed and ticket_update.assignee_email:
        await ensure_watcher(db, project_id, ticket_id, ticket_update.assignee_email, current_user.email)

    await create_ticket_notifications(
        db,
        project_id,
        updated_ticket,
        event_type=event_type,
        message=message,
        actor_user_id=current_user.id,
        mention_text=ticket_update.description,
    )

    return await _ticket_out(db, project_id, updated_ticket)


@router.post("/{project_id}/tickets/{ticket_id}/promote", response_model=TicketOut)
async def promote_subtask(
    project_id: int,
    ticket_id: int,
    payload: TicketPromote,
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    """Turn a subtask into a standalone issue.

    Detaching the parent and changing the type are two edits that must not half
    apply — a row left as `type: subtask` with no parent is invisible on the board
    (subtasks are filtered out of the listing) and unreachable from any parent.
    One call does both and records why.
    """
    await verify_project_access(project_id, current_user.email, db, current_user.role, user_id=current_user.id)

    tickets_collection = db["tickets"]
    ticket = await tickets_collection.find_one({"ticket_number": ticket_id, "project_id": project_id})
    if not ticket:
        raise HTTPException(status_code=404, detail="Issue not found")

    parent_id = ticket.get("parent_id")
    if parent_id is None:
        raise HTTPException(status_code=400, detail="This issue is already a top-level issue")

    updated = await tickets_collection.find_one_and_update(
        {"ticket_number": ticket_id, "project_id": project_id},
        {"$set": {
            "parent_id": None,
            "type": payload.type,
            "updated_at": datetime.now(timezone.utc),
        }},
        return_document=ReturnDocument.AFTER,
    )

    parent = await tickets_collection.find_one(
        {"ticket_number": parent_id, "project_id": project_id}, {"key": 1, "title": 1}
    )
    parent_key = (parent or {}).get("key") or str(parent_id)

    # Both sides of the move are worth recording: the issue changed shape, and the
    # old parent quietly lost a child.
    await _add_history(db, project_id, ticket_id, "type", "subtask", payload.type, current_user.id)
    await _add_history(db, project_id, ticket_id, "parent", parent_key, None, current_user.id)
    await _add_history(
        db,
        project_id,
        parent_id,
        "subtask",
        f"{updated.get('key')} — {updated.get('title')}",
        f"promoted to a top-level {payload.type}",
        current_user.id,
    )

    return await _ticket_out(db, project_id, updated)


@router.post("/{project_id}/tickets/{ticket_id}/archive", response_model=TicketOut)
async def archive_ticket(
    project_id: int,
    ticket_id: int,
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    """Archive a ticket: hide it from the board, backlog, sprint and search. Reversible."""
    await verify_project_access(project_id, current_user.email, db, current_user.role, user_id=current_user.id)
    ticket = await _set_archived(db, project_id, ticket_id, True, current_user.email)
    return await _ticket_out(db, project_id, ticket)


@router.post("/{project_id}/tickets/{ticket_id}/unarchive", response_model=TicketOut)
async def unarchive_ticket(
    project_id: int,
    ticket_id: int,
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    """Restore an archived ticket back onto the work surfaces."""
    await verify_project_access(project_id, current_user.email, db, current_user.role, user_id=current_user.id)
    ticket = await _set_archived(db, project_id, ticket_id, False, current_user.email)
    return await _ticket_out(db, project_id, ticket)


