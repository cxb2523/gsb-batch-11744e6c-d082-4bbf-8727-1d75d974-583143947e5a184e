"""Settings API endpoints for project configuration and management."""

from typing import Annotated, List, Optional
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo import ReturnDocument

from ...db.mongo import get_mongo_db
from ...core.security import get_current_user, CurrentUser, require_admin, require_project_admin
from ...services.status_category import categorize_status
from ...schemas.settings import (
  ProjectSettingsUpdate,
  ProjectSettingsOut,
  ProjectArchiveRequest,
  WorkflowStatusCreate,
  WorkflowStatusUpdate,
  WorkflowStatusOut,
  WorkflowStatusReorderRequest,
  LabelCreate,
  LabelUpdate,
  LabelOut,
  ProjectMemberAdd,
  ProjectMemberBulkAdd,
  ProjectMemberInvite,
  ProjectMemberUpdate,
  ProjectMemberOut,
  AssignableUser,
  NotificationPreferencesUpdate,
  NotificationPreferencesOut,
  NotificationOut,
)


from ._shared import *  # noqa: F401,F403

@router.get("/{project_id}/statuses", response_model=List[WorkflowStatusOut])
async def get_workflow_statuses(
    project_id: int,
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    """Get all workflow statuses for a project."""
    statuses_collection = db["ticket_statuses"]

    statuses = await statuses_collection.find(
        {"project_id": project_id}
    ).sort("position", 1).to_list(length=None)

    return [
        {
            "id": status.get("status_number"),
            "project_id": project_id,
            "name": status.get("name"),
            "color": status.get("color", "#e5e7eb"),
            "category": categorize_status(status.get("name")),
            "position": status.get("position", 0),
        }
        for status in statuses
    ]


@router.post("/{project_id}/statuses", response_model=WorkflowStatusOut, status_code=status.HTTP_201_CREATED)
async def create_workflow_status(
    project_id: int,
    status_in: WorkflowStatusCreate,
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
    current_user: Annotated[CurrentUser, Depends(require_project_admin)],
):
    """Create a new workflow status (project admin or global admin only)."""
    statuses_collection = db["ticket_statuses"]
    counters_collection = db["counters"]

    # Get max position if not provided
    if status_in.position is None:
        max_status = await statuses_collection.find_one(
            {"project_id": project_id},
            sort=[("position", -1)]
        )
        position = (max_status.get("position", -1) + 1) if max_status else 0
    else:
        position = status_in.position

    # Generate status ID
    counter = await counters_collection.find_one_and_update(
        {"_id": "ticket_statuses"},
        {"$inc": {"seq": 1}},
        upsert=True,
        return_document=ReturnDocument.AFTER,
    )
    status_number = int(counter.get("seq", 1))

    # Create status
    status_doc = {
        "status_number": status_number,
        "project_id": project_id,
        "name": status_in.name,
        "color": status_in.color or "#e5e7eb",
        "position": position,
        "created_at": datetime.now(timezone.utc),
    }

    await statuses_collection.insert_one(status_doc)

    return {
        "id": status_number,
        "project_id": project_id,
        "name": status_in.name,
        "color": status_in.color or "#e5e7eb",
        "category": categorize_status(status_in.name),
        "position": position,
    }


@router.put("/{project_id}/statuses/{status_id}", response_model=WorkflowStatusOut)
async def update_workflow_status(
    project_id: int,
    status_id: int,
    status_update: WorkflowStatusUpdate,
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
    current_user: Annotated[CurrentUser, Depends(require_project_admin)],
):
    """Update a workflow status (project admin or global admin only)."""
    statuses_collection = db["ticket_statuses"]

    # Build update dict
    update_data = {}
    if status_update.name is not None:
        update_data["name"] = status_update.name
    if status_update.color is not None:
        update_data["color"] = status_update.color
    if status_update.position is not None:
        update_data["position"] = status_update.position

    update_data["updated_at"] = datetime.now(timezone.utc)

    # Update status
    updated_status = await statuses_collection.find_one_and_update(
        {"status_number": status_id, "project_id": project_id},
        {"$set": update_data},
        return_document=ReturnDocument.AFTER,
    )

    if not updated_status:
        raise HTTPException(status_code=404, detail="Status not found")

    return {
        "id": status_id,
        "project_id": project_id,
        "name": updated_status.get("name"),
        "color": updated_status.get("color"),
        "category": categorize_status(updated_status.get("name")),
        "position": updated_status.get("position"),
    }


@router.delete("/{project_id}/statuses/{status_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_workflow_status(
    project_id: int,
    status_id: int,
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
    current_user: Annotated[CurrentUser, Depends(require_project_admin)],
):
    """Delete a workflow status (project admin or global admin only)."""
    statuses_collection = db["ticket_statuses"]

    # Check if any tickets use this status
    tickets_collection = db["tickets"]
    tickets_with_status = await tickets_collection.count_documents({"status_id": status_id})

    if tickets_with_status > 0:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot delete status: {tickets_with_status} ticket(s) are using this status"
        )

    # Delete status
    result = await statuses_collection.delete_one({"status_number": status_id, "project_id": project_id})

    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Status not found")


@router.post("/{project_id}/statuses/reorder", response_model=List[WorkflowStatusOut])
async def reorder_workflow_statuses(
    project_id: int,
    reorder_request: WorkflowStatusReorderRequest,
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
    current_user: Annotated[CurrentUser, Depends(require_project_admin)],
):
    """Reorder workflow statuses (project admin or global admin only)."""
    statuses_collection = db["ticket_statuses"]

    # Update positions
    for position, status_id in enumerate(reorder_request.status_ids):
        await statuses_collection.update_one(
            {"status_number": status_id, "project_id": project_id},
            {"$set": {"position": position}}
        )

    # Return updated list
    statuses = await statuses_collection.find(
        {"project_id": project_id}
    ).sort("position", 1).to_list(length=None)

    return [
        {
            "id": status.get("status_number"),
            "project_id": project_id,
            "name": status.get("name"),
            "color": status.get("color", "#e5e7eb"),
            "category": categorize_status(status.get("name")),
            "position": status.get("position", 0),
        }
        for status in statuses
    ]


# ========== Labels Endpoints ==========

