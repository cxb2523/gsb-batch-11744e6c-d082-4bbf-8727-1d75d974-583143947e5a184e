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

@router.get("/{project_id}/labels", response_model=List[LabelOut])
async def get_project_labels(
    project_id: int,
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    """Get all labels for a project."""
    labels_collection = db["labels"]

    labels = await labels_collection.find(
        {"project_id": project_id}
    ).sort("name", 1).to_list(length=None)

    return [
        {
            "id": label.get("label_number"),
            "project_id": project_id,
            "name": label.get("name"),
            "color": label.get("color", "#6b7280"),
            "description": label.get("description"),
            "created_at": label.get("created_at"),
        }
        for label in labels
    ]


@router.post("/{project_id}/labels", response_model=LabelOut, status_code=status.HTTP_201_CREATED)
async def create_label(
    project_id: int,
    label_in: LabelCreate,
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
    current_user: Annotated[CurrentUser, Depends(require_project_admin)],
):
    """Create a new label (project admin or global admin only)."""
    labels_collection = db["labels"]
    counters_collection = db["counters"]

    # Check if label name already exists for this project
    existing = await labels_collection.find_one({"project_id": project_id, "name": label_in.name})
    if existing:
        raise HTTPException(status_code=400, detail="Label name already exists for this project")

    # Generate label ID
    counter = await counters_collection.find_one_and_update(
        {"_id": "labels"},
        {"$inc": {"seq": 1}},
        upsert=True,
        return_document=ReturnDocument.AFTER,
    )
    label_number = int(counter.get("seq", 1))

    # Create label
    label_doc = {
        "label_number": label_number,
        "project_id": project_id,
        "name": label_in.name,
        "color": label_in.color or "#6b7280",
        "description": label_in.description,
        "created_at": datetime.now(timezone.utc),
    }

    await labels_collection.insert_one(label_doc)

    return {
        "id": label_number,
        "project_id": project_id,
        "name": label_in.name,
        "color": label_in.color or "#6b7280",
        "description": label_in.description,
        "created_at": label_doc["created_at"],
    }


@router.put("/{project_id}/labels/{label_id}", response_model=LabelOut)
async def update_label(
    project_id: int,
    label_id: int,
    label_update: LabelUpdate,
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
    current_user: Annotated[CurrentUser, Depends(require_project_admin)],
):
    """Update a label (project admin or global admin only)."""
    labels_collection = db["labels"]

    # Build update dict
    update_data = {}
    if label_update.name is not None:
        # Check if new name conflicts
        existing = await labels_collection.find_one({
            "project_id": project_id,
            "name": label_update.name,
            "label_number": {"$ne": label_id}
        })
        if existing:
            raise HTTPException(status_code=400, detail="Label name already exists for this project")
        update_data["name"] = label_update.name
    if label_update.color is not None:
        update_data["color"] = label_update.color
    if label_update.description is not None:
        update_data["description"] = label_update.description

    update_data["updated_at"] = datetime.now(timezone.utc)

    # Update label
    updated_label = await labels_collection.find_one_and_update(
        {"label_number": label_id, "project_id": project_id},
        {"$set": update_data},
        return_document=ReturnDocument.AFTER,
    )

    if not updated_label:
        raise HTTPException(status_code=404, detail="Label not found")

    return {
        "id": label_id,
        "project_id": project_id,
        "name": updated_label.get("name"),
        "color": updated_label.get("color"),
        "description": updated_label.get("description"),
        "created_at": updated_label.get("created_at"),
    }


@router.delete("/{project_id}/labels/{label_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_label(
    project_id: int,
    label_id: int,
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
    current_user: Annotated[CurrentUser, Depends(require_project_admin)],
):
    """Delete a label (project admin or global admin only)."""
    labels_collection = db["labels"]

    # Delete label
    result = await labels_collection.delete_one({"label_number": label_id, "project_id": project_id})

    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Label not found")


# ========== Active Users for Member Picker ==========

