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

@router.get("/{project_id}/tickets", response_model=Union[TicketPage, List[TicketOut]])
async def list_tickets(
    project_id: int,
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
    status_id: Optional[int] = Query(None, description="Filter by status ID"),
    assignee_email: Optional[str] = Query(None, description="Filter by assignee email"),
    assignee_id: Optional[int] = Query(None, description="Filter by assignee user id"),
    include_archived: bool = Query(False, description="Include archived tickets"),
    archived_only: bool = Query(False, description="Return only archived tickets"),
    include_subtasks: bool = Query(False, description="Include subtasks as top-level rows"),
    epic_id: Optional[int] = Query(None, description="Only tickets under this epic"),
    sprint_id: Optional[int] = Query(None, description="Only tickets in this sprint"),
    no_sprint: bool = Query(False, description="Only tickets in no sprint (the backlog)"),
    type: Optional[str] = Query(None, description="Filter by issue type"),
    types: Optional[List[str]] = Query(None, description="Filter by any of these issue types"),
    priority: Optional[str] = Query(None, description="Filter by priority"),
    label: Optional[str] = Query(None, description="Only tickets carrying this label"),
    q: Optional[str] = Query(None, description="Match key, title or assignee name"),
    no_epic: bool = Query(False, description="Only tickets belonging to no epic"),
    parent_id: Optional[int] = Query(None, description="Only subtasks of this ticket"),
    limit: Optional[int] = Query(None, ge=1, le=200, description="Page size; returns a page envelope"),
    cursor: Optional[str] = Query(None, description="Resume from a previous page's next_cursor"),
):
    """Get the tickets for a project, narrowed by any of the filters below.

    Archived tickets are excluded by default; this endpoint backs the board, the backlog
    and the sprint board, so the exclusion covers all three.

    Subtasks are excluded by default too. They belong to their parent and are shown inside
    it (and counted on its card); listing them here as well rendered every subtask as its
    own board card, so an issue broken into ten subtasks filled a column with eleven cards.

    The filters exist because the screens had them already and applied them in the
    browser, which meant downloading every ticket in the project to show a sprint's
    worth of them. Each is optional and omitting them all returns what it always did,
    so a caller that hasn't moved over is unaffected.

    Passing `limit` returns a TicketPage - items, a cursor for the next page, and the
    total matching the filters - instead of a bare list. Without it the response is
    the list it has always been.
    """
    # Verify user has access to this project
    await verify_project_access(project_id, current_user.email, db, current_user.role, user_id=current_user.id)

    tickets_collection = db["tickets"]

    query, or_conditions = await build_ticket_query(
        db,
        project_id,
        status_id=status_id,
        assignee_email=assignee_email,
        assignee_id=assignee_id,
        include_archived=include_archived,
        archived_only=archived_only,
        include_subtasks=include_subtasks,
        epic_id=epic_id,
        sprint_id=sprint_id,
        no_sprint=no_sprint,
        type=type,
        types=types,
        priority=priority,
        label=label,
        q=q,
        no_epic=no_epic,
        parent_id=parent_id,
    )

    total = await tickets_collection.count_documents(query) if limit else 0

    page_query = query
    if limit and cursor:
        parts = decode_cursor(cursor, 2)
        if parts:
            raw_created, raw_number = parts
            created_at = datetime.fromisoformat(raw_created) if raw_created else None
            page_query = dict(query)
            page_query["$and"] = [*or_conditions, _after_condition(created_at, int(raw_number))]

    # Newest first, with the ticket number breaking ties: two tickets written in the
    # same instant would otherwise have no fixed order between them.
    finder = tickets_collection.find(page_query).sort(
        [("created_at", -1), ("ticket_number", -1)]
    )
    if limit:
        # One more than asked for, to learn whether another page exists without
        # a second query. The extra row is dropped below.
        finder = finder.limit(limit + 1)
    tickets = await finder.to_list(length=None)

    has_more = bool(limit) and len(tickets) > limit
    if has_more:
        tickets = tickets[:limit]

    # Subtask rollup for the parents in this page. Now that subtasks are not listed
    # as cards of their own, the count is the only signal that an issue has any —
    # one aggregation for the whole list rather than a query per card.
    subtask_totals: dict[int, dict[str, int]] = {}
    if not include_subtasks:
        parent_ids = [
            ticket["ticket_number"] for ticket in tickets if ticket.get("ticket_number") is not None
        ]
        if parent_ids:
            done_status_ids = await _done_status_ids(db, project_id)
            rollup = await tickets_collection.aggregate([
                {"$match": {"project_id": project_id, "parent_id": {"$in": parent_ids}, **NOT_ARCHIVED}},
                {"$group": {
                    "_id": "$parent_id",
                    "total": {"$sum": 1},
                    "completed": {
                        "$sum": {"$cond": [{"$in": ["$status_id", done_status_ids]}, 1, 0]}
                    },
                }},
            ]).to_list(length=None)
            subtask_totals = {
                row["_id"]: {"total": row["total"], "completed": row["completed"]} for row in rollup
            }

    # Enrich with additional data, from one batch of statuses and users.
    lookups = await build_ticket_lookups(db, tickets)
    result = []
    for ticket in tickets:
        # Skip tickets without ticket_number or key (data inconsistency)
        ticket_number = ticket.get("ticket_number")
        ticket_key = ticket.get("key")
        if ticket_number is None or ticket_key is None:
            continue

        out = await _ticket_out(db, project_id, ticket, lookups)
        counts = subtask_totals.get(ticket_number)
        if counts:
            out["subtasks_count"] = counts["total"]
            out["subtasks_completed"] = counts["completed"]
        result.append(out)

    if not limit:
        return result

    next_cursor = None
    if has_more and tickets:
        # Taken from the last document rather than the serialized row, so the
        # cursor is in the same terms as the sort.
        last = tickets[-1]
        next_cursor = encode_cursor([
            last.get("created_at").isoformat() if last.get("created_at") else None,
            last.get("ticket_number"),
        ])
    return {"items": result, "next_cursor": next_cursor, "total": total}


@router.get("/{project_id}/tickets/{ticket_id}", response_model=TicketOut)
async def get_ticket(
    project_id: int,
    ticket_id: int,
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    """Get a specific ticket by ID."""
    # Verify user has access to this project
    await verify_project_access(project_id, current_user.email, db, current_user.role, user_id=current_user.id)

    tickets_collection = db["tickets"]

    ticket = await tickets_collection.find_one({
        "ticket_number": ticket_id,
        "project_id": project_id
    })

    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")

    return await _ticket_out(db, project_id, ticket)


@router.post("/{project_id}/tickets", response_model=TicketOut, status_code=status.HTTP_201_CREATED)
async def create_ticket(
    project_id: int,
    ticket_in: TicketCreate,
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    """Create a new ticket.

    Enforces the interactive due/start-date gate (a non-epic needs a due date; no
    past dates) before delegating. The CSV importer calls ``_create_ticket`` directly
    and is intentionally exempt from these workflow rules, so a backlog of historical
    or overdue issues still imports. The due-before-start invariant is not part of the
    exemption — it lives inside ``_create_ticket`` and holds on every create path.
    """
    if not ticket_in.due_date and ticket_in.type != "epic":
        raise HTTPException(status_code=400, detail=MSG_DUE_REQUIRED)
    err = not_in_past_error(ticket_in.due_date)
    if err:
        raise HTTPException(status_code=400, detail=err)
    return await _create_ticket(project_id, ticket_in, db, current_user)


async def _create_ticket(
    project_id: int,
    ticket_in: TicketCreate,
    db: AsyncIOMotorDatabase,
    current_user: CurrentUser,
):
    """Insert a ticket. Shared by the create endpoint and the CSV importer.

    The due-before-start invariant is enforced here so it holds no matter who calls.
    """
    err = due_before_start_error(ticket_in.due_date, ticket_in.start_date)
    if err:
        raise HTTPException(status_code=400, detail=err)
    # Verify user has access to this project
    await verify_project_access(project_id, current_user.email, db, current_user.role, user_id=current_user.id)

    tickets_collection = db["tickets"]
    counters_collection = db["counters"]

    # Verify project exists
    projects_collection = db["projects"]
    project = await projects_collection.find_one({"project_number": project_id})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Verify status exists
    statuses_collection = db["ticket_statuses"]
    status_doc = await statuses_collection.find_one({
        "status_number": ticket_in.status_id,
        "project_id": project_id
    })
    if not status_doc:
        raise HTTPException(status_code=400, detail="Invalid status ID for this project")

    # Validate issue type specific rules
    if ticket_in.type == "subtask":
        # Subtasks must have a parent
        if not ticket_in.parent_id:
            raise HTTPException(status_code=400, detail="Subtasks must have a parent issue")

        # Verify parent exists
        parent_ticket = await tickets_collection.find_one({
            "ticket_number": ticket_in.parent_id,
            "project_id": project_id
        })
        if not parent_ticket:
            raise HTTPException(status_code=404, detail="Parent issue not found")

        # Parent cannot be a subtask or epic
        if parent_ticket.get("type") in ["subtask", "epic"]:
            raise HTTPException(status_code=400, detail="Parent issue cannot be a subtask or epic")

    # Epics should not have certain fields
    if ticket_in.type == "epic":
        # Epics shouldn't have story points (they aggregate from children)
        if ticket_in.story_points:
            raise HTTPException(status_code=400, detail="Epics cannot have story points - they aggregate from child stories")

        # Epics shouldn't be in sprints (they span multiple sprints)
        if ticket_in.sprint_id:
            raise HTTPException(status_code=400, detail="Epics cannot be assigned to sprints - they span multiple sprints")

        # Epics cannot have a parent
        if ticket_in.parent_id:
            raise HTTPException(status_code=400, detail="Epics cannot have a parent issue")

    # Verify epic exists if provided
    if ticket_in.epic_id:
        epic_ticket = await tickets_collection.find_one({
            "ticket_number": ticket_in.epic_id,
            "project_id": project_id,
            "type": "epic"
        })
        if not epic_ticket:
            raise HTTPException(status_code=404, detail="Epic not found or invalid")

    # Generate ticket number (synced with actual max in DB)
    max_pipeline = [{"$group": {"_id": None, "max_num": {"$max": "$ticket_number"}}}]
    max_result = await tickets_collection.aggregate(max_pipeline).to_list(1)
    max_existing = max_result[0]["max_num"] if max_result and max_result[0].get("max_num") else 0

    counter = await counters_collection.find_one_and_update(
        {"_id": "tickets"},
        [{"$set": {"seq": {"$max": [{"$add": [{"$ifNull": ["$seq", 0]}, 1]}, max_existing + 1]}}}],
        upsert=True,
        return_document=ReturnDocument.AFTER,
    )
    ticket_number = int(counter["seq"])

    # Generate ticket key
    ticket_key = await generate_ticket_key(db, project_id)

    # Create ticket document
    ticket_doc = {
        "ticket_number": ticket_number,
        "project_id": project_id,
        "key": ticket_key,
        "title": ticket_in.title,
        "description": ticket_in.description,
        "type": ticket_in.type,
        "status_id": ticket_in.status_id,
        "priority": ticket_in.priority or "medium",
        "assignee_email": ticket_in.assignee_email,
        "reporter_email": current_user.email,
        "due_date": ticket_in.due_date,
        "start_date": ticket_in.start_date if hasattr(ticket_in, 'start_date') else None,
        "labels": ticket_in.labels or [],
        "epic_id": ticket_in.epic_id,
        "parent_id": ticket_in.parent_id,
        "sprint_id": ticket_in.sprint_id,
        "story_points": ticket_in.story_points,
        "original_estimate_seconds": ticket_in.original_estimate_seconds,
        "time_spent_seconds": 0,
        "remaining_estimate_seconds": ticket_in.original_estimate_seconds,
        "created_at": datetime.now(timezone.utc),
        "updated_at": None,
    }

    await tickets_collection.insert_one(ticket_doc)

    # Record initial history entry for ticket creation
    history_collection = db["ticket_history"]
    counter = await counters_collection.find_one_and_update(
        {"_id": f"ticket_history_{ticket_number}"},
        {"$inc": {"seq": 1}},
        upsert=True,
        return_document=ReturnDocument.AFTER,
    )
    history_number = int(counter.get("seq", 1))
    
    await history_collection.insert_one({
        "history_number": history_number,
        "ticket_id": ticket_number,
        "project_id": project_id,
        "field_name": "created",  # Use field_name to match status.py
        "old_value": None,
        "new_value": ticket_key,
        "changed_by": current_user.id,  # Use changed_by to match status.py
        "changed_at": datetime.now(timezone.utc),  # Use changed_at to match status.py
    })

    # Get assignee info
    assignee = await get_user_info_by_email(db, ticket_in.assignee_email)

    # Get reporter info (reporter is always current user on create)
    reporter = await get_user_info_by_email(db, current_user.email)

    # Get status name + visual (colour/category) from the already-fetched doc
    status_name = status_doc.get("name")
    status_color = status_doc.get("color")
    status_category = categorize_status(status_name)

    # Auto-subscribe the creator (and the initial assignee, if any) as watchers.
    # The watcher list only grows from here — done before notifying so they're included.
    await ensure_watcher(db, project_id, ticket_number, current_user.email, current_user.email)
    if ticket_in.assignee_email:
        await ensure_watcher(db, project_id, ticket_number, ticket_in.assignee_email, current_user.email)

    # Create notifications for admins and assignee
    await create_ticket_notifications(
        db,
        project_id,
        ticket_doc,
        event_type="ticket_created",
        message=f"Ticket created: {ticket_key}",
        actor_user_id=current_user.id,
        mention_text=ticket_in.description,
    )

    return {
        "id": ticket_number,
        "project_id": project_id,
        "key": ticket_key,
        "title": ticket_in.title,
        "description": ticket_in.description,
        "type": ticket_in.type,
        "status_id": ticket_in.status_id,
        "status_name": status_name,
        "status_color": status_color,
        "status_category": status_category,
        "priority": ticket_in.priority or "medium",
        "assignee": assignee,
        "reporter": reporter,
        "due_date": ticket_in.due_date,
        "start_date": ticket_in.start_date if hasattr(ticket_in, 'start_date') else None,
        "labels": ticket_in.labels or [],
        "epic_id": ticket_in.epic_id,
        "parent_id": ticket_in.parent_id,
        "sprint_id": ticket_in.sprint_id,
        "story_points": ticket_in.story_points,
        "original_estimate_seconds": ticket_in.original_estimate_seconds,
        "time_spent_seconds": 0,
        "remaining_estimate_seconds": ticket_in.original_estimate_seconds,
        "created_at": ticket_doc["created_at"],
        "updated_at": None,
    }


@router.get("/{project_id}/tickets/{ticket_id}/delete_impact", response_model=TicketDeleteImpact)
async def get_delete_impact(
    project_id: int,
    ticket_id: int,
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    """Report what deleting this ticket would destroy, so the UI can warn before it does."""
    await verify_project_access(project_id, current_user.email, db, current_user.role, user_id=current_user.id)

    tickets_collection = db["tickets"]
    ticket = await tickets_collection.find_one({
        "ticket_number": ticket_id,
        "project_id": project_id,
    })
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")

    subtask_ids = await _subtask_ids(db, project_id, [ticket_id])
    all_ids = [ticket_id, *subtask_ids]

    # Independent reads, and only the one field of each worklog is needed.
    worklogs, comments, attachments = await asyncio.gather(
        db["worklogs"]
        .find({"issue_id": {"$in": all_ids}}, {"time_spent_seconds": 1})
        .to_list(length=None),
        db["ticket_comments"].count_documents({"ticket_id": {"$in": all_ids}}),
        db["ticket_files"].count_documents({"ticket_id": {"$in": all_ids}}),
    )

    return {
        "ticket_key": ticket.get("key", ""),
        "subtasks": len(subtask_ids),
        "comments": comments,
        "attachments": attachments,
        "worklogs": len(worklogs),
        "time_spent_seconds": sum(w.get("time_spent_seconds", 0) or 0 for w in worklogs),
    }


@router.delete("/{project_id}/tickets/{ticket_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_ticket(
    project_id: int,
    ticket_id: int,
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    """Delete a ticket."""
    # Verify user has access to this project
    await verify_project_access(project_id, current_user.email, db, current_user.role, user_id=current_user.id)

    tickets_collection = db["tickets"]

    # Check if user is admin or ticket creator
    ticket = await tickets_collection.find_one({
        "ticket_number": ticket_id,
        "project_id": project_id
    })
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")

    if not _can_delete(ticket, current_user):
        raise HTTPException(status_code=403, detail="Only ticket creator or admin can delete tickets")

    await _delete_ticket_cascade(db, project_id, [ticket_id])


@router.get("/{project_id}/tickets/{ticket_id}/history", response_model=List[TicketHistoryOut])
async def get_ticket_history(
    project_id: int,
    ticket_id: int,
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    """Get history of changes for a ticket."""
    # Verify user has access to this project
    await verify_project_access(project_id, current_user.email, db, current_user.role, user_id=current_user.id)

    history_collection = db["ticket_history"]
    tickets_collection = db["tickets"]

    # Verify ticket exists
    ticket = await tickets_collection.find_one({
        "ticket_number": ticket_id,
        "project_id": project_id
    })
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")

    # Fetch history
    history_entries = await history_collection.find({
        "ticket_id": ticket_id,
        "project_id": project_id
    }).sort("changed_at", -1).to_list(length=None)

    # Enrich with changed_by info
    result = []
    for entry in history_entries:
        # Skip entries with missing required fields
        changed_at = entry.get("changed_at") or entry.get("created_at")
        if not entry.get("history_number") or not changed_at:
            continue

        changed_by_id = entry.get("changed_by")
        changed_by = await get_user_info(db, changed_by_id) if changed_by_id else None

        # Ensure old_value and new_value are strings or None (not other types)
        old_value = entry.get("old_value")
        new_value = entry.get("new_value")
        if old_value is not None and not isinstance(old_value, str):
            old_value = str(old_value)
        if new_value is not None and not isinstance(new_value, str):
            new_value = str(new_value)

        result.append({
            "id": entry.get("history_number"),
            "ticket_id": ticket_id,
            "field": entry.get("field_name") or "unknown",
            "old_value": old_value,
            "new_value": new_value,
            "changed_by": changed_by or {"id": 0, "name": "System", "email": "", "initials": "SYS"},
            "created_at": changed_at,
        })

    return result
