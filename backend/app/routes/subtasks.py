"""Subtask API endpoints for issue hierarchy."""

import logging
from typing import Annotated, List
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

from fastapi import APIRouter, Depends, HTTPException, Query, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo import ReturnDocument

from ..db.mongo import get_mongo_db
from ..db.queries import NOT_ARCHIVED
from ..core.security import get_current_user, CurrentUser
from ..schemas.subtasks import SubtaskCreate, SubtaskUpdate, SubtaskOut
from ..utils.date_rules import not_in_past_error
from ..routes.tickets import (
    verify_project_access,
    get_user_info,
    get_user_info_by_email,
    get_status_name,
    get_status_meta,
    generate_ticket_key,
    create_ticket_notifications,
    ticket_has_done_evidence,
    DONE_EVIDENCE_MESSAGE,
    _resolve_assignee,
    _resolve_reporter,
    _add_history,
    _delete_ticket_cascade,
)


router = APIRouter(prefix="/projects", tags=["subtasks"])

# What counts as finished. The listing derives a subtask's `completed` state from
# its status name, so the write path has to agree with this exact set.
DONE_STATUS_NAMES = ["Done", "Closed", "Completed", "Resolved"]


# ========== Helper Functions ==========

async def verify_parent_issue(
    db: AsyncIOMotorDatabase,
    project_id: int,
    parent_id: int,
) -> dict:
    """Verify parent issue exists and is not itself a subtask."""
    tickets_collection = db["tickets"]

    parent = await tickets_collection.find_one({
        "ticket_number": parent_id,
        "project_id": project_id
    })

    if not parent:
        raise HTTPException(status_code=404, detail="Parent issue not found")

    # Prevent subtask of subtask (subtasks cannot have subtasks)
    if parent.get("parent_id") is not None:
        raise HTTPException(
            status_code=400,
            detail="Cannot create subtask of a subtask. Subtasks can only be created under stories, tasks, bugs, or epics."
        )

    return parent


# ========== Subtask Endpoints ==========

@router.post("/{project_id}/issues/{issue_id}/subtasks", response_model=SubtaskOut, status_code=status.HTTP_201_CREATED)
async def create_subtask(
    project_id: int,
    issue_id: int,
    subtask_in: SubtaskCreate,
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    """Create a new subtask under a parent issue."""
    # Verify user has access to this project
    await verify_project_access(project_id, current_user.email, db, current_user.role, user_id=current_user.id)

    # Verify parent issue exists and is not a subtask
    parent = await verify_parent_issue(db, project_id, issue_id)

    # A newly created subtask can't be due in the past (mirrors the ticket gate; this
    # was previously enforced only in the browser). Subtasks have no start date.
    err = not_in_past_error(subtask_in.due_date)
    if err:
        raise HTTPException(status_code=400, detail=err)

    tickets_collection = db["tickets"]
    counters_collection = db["counters"]

    # If status_id not provided, inherit from parent
    status_id = subtask_in.status_id if subtask_in.status_id is not None else parent.get("status_id")

    # Verify status exists
    if status_id is not None:
        statuses_collection = db["ticket_statuses"]
        status_doc = await statuses_collection.find_one({
            "status_number": status_id,
            "project_id": project_id
        })
        if not status_doc:
            raise HTTPException(status_code=400, detail="Invalid status ID for this project")

    # Generate ticket number
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

    # Create subtask document (it's still a ticket, but with parent_id set)
    subtask_doc = {
        "ticket_number": ticket_number,
        "project_id": project_id,
        "key": ticket_key,
        "title": subtask_in.title,
        "description": subtask_in.description,
        "type": "subtask",  # Force type to subtask
        "status_id": status_id,
        "priority": subtask_in.priority or "medium",  # Default to medium when unset
        "assignee_email": subtask_in.assignee_email,
        "reporter_email": current_user.email,
        "parent_id": issue_id,  # Link to parent issue
        "epic_id": parent.get("epic_id"),  # Inherit epic from parent
        "sprint_id": parent.get("sprint_id"),  # Inherit sprint from parent
        "due_date": subtask_in.due_date,
        "labels": [],
        "completed": False,  # Track completion status
        "created_at": datetime.now(timezone.utc),
        "updated_at": None,
    }

    await tickets_collection.insert_one(subtask_doc)

    # Record history entry for subtask creation
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
        "field_name": "created",
        "old_value": None,
        "new_value": f"Subtask created under {parent.get('key')}",
        "changed_by": current_user.id,
        "changed_at": datetime.now(timezone.utc),
    })

    # Get assignee and reporter info
    assignee = await get_user_info_by_email(db, subtask_in.assignee_email)
    reporter = await get_user_info_by_email(db, current_user.email)

    # Get status name + visual (colour/category)
    status_meta = await get_status_meta(db, status_id) if status_id else None

    # Create notifications
    await create_ticket_notifications(
        db,
        project_id,
        subtask_doc,
        event_type="ticket_created",
        message=f"Subtask created: {ticket_key} under {parent.get('key')}",
        actor_user_id=current_user.id,
        mention_text=subtask_in.description,
    )

    return {
        "id": ticket_number,
        "parent_id": issue_id,
        "project_id": project_id,
        "key": ticket_key,
        "title": subtask_in.title,
        "description": subtask_in.description,
        "status_id": status_id,
        "status_name": status_meta["name"] if status_meta else None,
        "status_color": status_meta["color"] if status_meta else None,
        "status_category": status_meta["category"] if status_meta else None,
        "priority": subtask_doc["priority"],
        "assignee": assignee,
        "reporter": reporter,
        "completed": False,
        "created_at": subtask_doc["created_at"],
        "updated_at": None,
    }


@router.get("/{project_id}/issues/{issue_id}/subtasks", response_model=List[SubtaskOut])
async def list_subtasks(
    project_id: int,
    issue_id: int,
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
    include_archived: bool = Query(
        False,
        description="Include archived subtasks so they can be seen and restored in the parent view",
    ),
):
    """Get all subtasks for a parent issue."""
    # Verify user has access to this project
    await verify_project_access(project_id, current_user.email, db, current_user.role, user_id=current_user.id)

    tickets_collection = db["tickets"]

    # Verify parent exists
    parent = await tickets_collection.find_one({
        "ticket_number": issue_id,
        "project_id": project_id
    })
    if not parent:
        raise HTTPException(status_code=404, detail="Parent issue not found")

    # Archived subtasks are hidden by default, as everywhere else; the parent view
    # opts in (include_archived) so it can show them greyed-out with a restore action.
    subtask_query = {
        "parent_id": issue_id,
        "project_id": project_id,
        "type": "subtask",
    }
    if not include_archived:
        subtask_query.update(NOT_ARCHIVED)
    subtasks = await tickets_collection.find(subtask_query).sort("created_at", 1).to_list(length=None)

    # Enrich with additional data
    result = []
    for subtask in subtasks:
        ticket_number = subtask.get("ticket_number")
        if ticket_number is None:
            continue

        # Get assignee info (prefer assignee_email, fall back to legacy assignee_id)
        assignee = await _resolve_assignee(db, subtask)
        # Get reporter info (prefer reporter_email, fall back to legacy reporter_id)
        reporter = await _resolve_reporter(db, subtask)

        # Get status name + visual (colour/category)
        status_meta = await get_status_meta(db, subtask.get("status_id"))

        # Check if subtask is completed (status is Done/Closed/Completed)
        completed = False
        if subtask.get("status_id"):
            statuses_collection = db["ticket_statuses"]
            status_doc = await statuses_collection.find_one({
                "status_number": subtask.get("status_id"),
                "project_id": project_id
            })
            if status_doc:
                status_display_name = status_doc.get("name", "")
                completed = status_display_name in DONE_STATUS_NAMES

        result.append({
            "id": ticket_number,
            "parent_id": issue_id,
            "project_id": project_id,
            "key": subtask.get("key"),
            "title": subtask.get("title"),
            "description": subtask.get("description"),
            "status_id": subtask.get("status_id"),
            "status_name": status_meta["name"],
            "status_color": status_meta["color"],
            "status_category": status_meta["category"],
            "priority": subtask.get("priority"),
            "assignee": assignee,
            "reporter": reporter,
            "completed": completed,
            "archived": bool(subtask.get("archived", False)),
            "created_at": subtask.get("created_at"),
            "updated_at": subtask.get("updated_at"),
        })

    return result


@router.put("/{project_id}/issues/{issue_id}/subtasks/{subtask_id}", response_model=SubtaskOut)
async def update_subtask(
    project_id: int,
    issue_id: int,
    subtask_id: int,
    subtask_update: SubtaskUpdate,
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    """Update a subtask."""
    # Verify user has access to this project
    await verify_project_access(project_id, current_user.email, db, current_user.role, user_id=current_user.id)

    tickets_collection = db["tickets"]

    # Verify subtask exists and belongs to parent
    subtask = await tickets_collection.find_one({
        "ticket_number": subtask_id,
        "project_id": project_id,
        "parent_id": issue_id,
        "type": "subtask"
    })
    if not subtask:
        raise HTTPException(status_code=404, detail="Subtask not found")

    # Build update dict
    update_data = {}
    # Tracks whether this update moves the subtask INTO a Done status, so we can gate it.
    becoming_done = False
    if subtask_update.title is not None:
        update_data["title"] = subtask_update.title
    if subtask_update.description is not None:
        update_data["description"] = subtask_update.description
    if "assignee_email" in subtask_update.model_fields_set:
        update_data["assignee_email"] = subtask_update.assignee_email
        # Clear legacy assignee_id so the read path can't fall back to a stale value
        update_data["assignee_id"] = None
    if subtask_update.status_id is not None:
        # Verify status exists
        statuses_collection = db["ticket_statuses"]
        status_doc = await statuses_collection.find_one({
            "status_number": subtask_update.status_id,
            "project_id": project_id
        })
        if not status_doc:
            raise HTTPException(status_code=400, detail="Invalid status ID")

        update_data["status_id"] = subtask_update.status_id

        # Update completed flag based on status
        status_name = status_doc.get("name", "")
        is_done_status = status_name in DONE_STATUS_NAMES
        update_data["completed"] = is_done_status
        becoming_done = is_done_status

    if subtask_update.priority is not None:
        update_data["priority"] = subtask_update.priority

    if subtask_update.completed is not None:
        update_data["completed"] = subtask_update.completed

        # Completion has to move the status, not just set a flag. The read path
        # derives `completed` from the status name, so writing the flag alone
        # meant a ticked subtask reverted the moment the list refreshed.
        if subtask_update.status_id is None:
            statuses_collection = db["ticket_statuses"]
            statuses = await statuses_collection.find(
                {"project_id": project_id}
            ).sort("position", 1).to_list(length=None)

            def _is_done(status: dict) -> bool:
                return status.get("name", "") in DONE_STATUS_NAMES

            if subtask_update.completed:
                target = next((status for status in statuses if _is_done(status)), None)
                if not target:
                    raise HTTPException(
                        status_code=400,
                        detail="This project has no Done status, so a subtask cannot be completed. "
                               "Add one in the project's workflow settings.",
                    )
                becoming_done = True
            else:
                # Back to the first status that does not mean finished.
                target = next((status for status in statuses if not _is_done(status)), None)
                if not target:
                    raise HTTPException(status_code=400, detail="This project has no open status to reopen into.")

            update_data["status_id"] = target["status_number"]

    # A subtask may only enter a Done status with evidence of the work — a merge request
    # link or at least one comment — mirroring the rule enforced on tickets. Only fires on
    # an actual transition INTO Done, so editing an already-done subtask isn't blocked.
    if becoming_done:
        old_status_name = await get_status_name(db, subtask.get("status_id"))
        was_done = old_status_name in DONE_STATUS_NAMES
        if not was_done and not await ticket_has_done_evidence(
            db, subtask, subtask.get("merge_request_url")
        ):
            raise HTTPException(status_code=400, detail=DONE_EVIDENCE_MESSAGE)

    update_data["updated_at"] = datetime.now(timezone.utc)

    # Update subtask
    updated_subtask = await tickets_collection.find_one_and_update(
        {"ticket_number": subtask_id, "project_id": project_id},
        {"$set": update_data},
        return_document=ReturnDocument.AFTER,
    )

    # Record history
    history_collection = db["ticket_history"]
    counters_collection = db["counters"]

    changes = []
    if subtask_update.title and subtask.get("title") != subtask_update.title:
        changes.append({"field": "title", "old": subtask.get("title"), "new": subtask_update.title})
    # Read the applied status, not the requested one: toggling completion moves the
    # status implicitly, and keying off the request would leave that unrecorded.
    applied_status_id = update_data.get("status_id")
    if applied_status_id and subtask.get("status_id") != applied_status_id:
        old_status = await get_status_name(db, subtask.get("status_id"))
        new_status = await get_status_name(db, applied_status_id)
        changes.append({"field": "status", "old": old_status, "new": new_status})
    if subtask_update.priority is not None and subtask.get("priority") != subtask_update.priority:
        changes.append({
            "field": "priority",
            "old": subtask.get("priority") or "",
            "new": subtask_update.priority or "",
        })

    for change in changes:
        counter = await counters_collection.find_one_and_update(
            {"_id": f"ticket_history_{subtask_id}"},
            {"$inc": {"seq": 1}},
            upsert=True,
            return_document=ReturnDocument.AFTER,
        )
        history_number = int(counter.get("seq", 1))

        await history_collection.insert_one({
            "history_number": history_number,
            "ticket_id": subtask_id,
            "project_id": project_id,
            "field_name": change["field"],
            "old_value": change["old"],
            "new_value": change["new"],
            "changed_by": current_user.id,
            "changed_at": datetime.now(timezone.utc),
        })

    # Get assignee and reporter info (prefer email fields, fall back to legacy *_id)
    assignee = await _resolve_assignee(db, updated_subtask)
    reporter = await _resolve_reporter(db, updated_subtask)

    # Get status name + visual (colour/category)
    status_meta = await get_status_meta(db, updated_subtask.get("status_id"))

    # Create notifications
    await create_ticket_notifications(
        db,
        project_id,
        updated_subtask,
        event_type="ticket_updated",
        message=f"Subtask updated: {updated_subtask.get('key')}",
        actor_user_id=current_user.id,
        mention_text=subtask_update.description,
    )

    return {
        "id": subtask_id,
        "parent_id": issue_id,
        "project_id": project_id,
        "key": updated_subtask.get("key"),
        "title": updated_subtask.get("title"),
        "description": updated_subtask.get("description"),
        "status_id": updated_subtask.get("status_id"),
        "status_name": status_meta["name"],
        "status_color": status_meta["color"],
        "status_category": status_meta["category"],
        "priority": updated_subtask.get("priority"),
        "assignee": assignee,
        "reporter": reporter,
        "completed": updated_subtask.get("completed", False),
        "created_at": updated_subtask.get("created_at"),
        "updated_at": updated_subtask.get("updated_at"),
    }


@router.delete("/{project_id}/issues/{issue_id}/subtasks/{subtask_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_subtask(
    project_id: int,
    issue_id: int,
    subtask_id: int,
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    """Delete a subtask."""
    # Verify user has access to this project
    await verify_project_access(project_id, current_user.email, db, current_user.role, user_id=current_user.id)

    tickets_collection = db["tickets"]

    # Verify subtask exists and belongs to parent
    subtask = await tickets_collection.find_one({
        "ticket_number": subtask_id,
        "project_id": project_id,
        "parent_id": issue_id,
        "type": "subtask"
    })
    if not subtask:
        raise HTTPException(status_code=404, detail="Subtask not found")

    # Only creator or admin can delete (prefer reporter_email, fall back to legacy reporter_id)
    reporter_email = subtask.get("reporter_email")
    is_reporter = (
        reporter_email == current_user.email
        if reporter_email
        else subtask.get("reporter_id") == current_user.id
    )
    if current_user.role != "admin" and not is_reporter:
        raise HTTPException(status_code=403, detail="Only subtask creator or admin can delete subtasks")

    # Record on the parent before the row is gone. The subtask's own history is
    # deleted with it, so the parent is the only place this can be seen afterwards.
    await _add_history(
        db,
        project_id,
        issue_id,
        "subtask",
        f"{subtask.get('key')} — {subtask.get('title')}",
        None,
        current_user.id,
    )

    # Deleting only the ticket row left the subtask's comments, attachments,
    # worklogs, watchers, links and history behind as orphans.
    await _delete_ticket_cascade(db, project_id, [subtask_id])

    return None
