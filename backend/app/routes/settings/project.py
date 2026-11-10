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

@router.get("/{project_id}/settings", response_model=ProjectSettingsOut)
async def get_project_settings(
    project_id: int,
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    """Get project settings and configuration."""
    projects_collection = db["projects"]

    project = await projects_collection.find_one({"project_number": project_id})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    owner_info = await get_user_info(db, project.get("owner_id"))

    return {
        "project_id": project_id,
        "name": project.get("name"),
        "key": project.get("key"),
        "description": project.get("description", ""),
        "visibility": project.get("visibility", "private"),
        "status": project.get("status", "active"),
        "owner": owner_info,
        "created_at": project.get("created_at"),
        "updated_at": project.get("updated_at"),
        "project_deadline": project.get("project_deadline"),
    }


@router.put("/{project_id}/settings", response_model=ProjectSettingsOut)
async def update_project_settings(
    project_id: int,
    settings_in: ProjectSettingsUpdate,
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
    current_user: Annotated[CurrentUser, Depends(require_project_admin)],
):
    """Update project settings (project admin or global admin only)."""
    projects_collection = db["projects"]

    # Build update dict
    update_data = {}
    if settings_in.name is not None:
        update_data["name"] = settings_in.name
    if settings_in.description is not None:
        update_data["description"] = settings_in.description
    if settings_in.visibility is not None:
        update_data["visibility"] = settings_in.visibility
    if settings_in.status is not None:
        update_data["status"] = settings_in.status

    # Sacrosanct field - only admin can modify project deadline
    # This is enforced by require_admin dependency, but we add this comment for clarity
    if settings_in.project_deadline is not None:
        update_data["project_deadline"] = settings_in.project_deadline

    update_data["updated_at"] = datetime.now(timezone.utc)

    # Update project
    updated_project = await projects_collection.find_one_and_update(
        {"project_number": project_id},
        {"$set": update_data},
        return_document=ReturnDocument.AFTER,
    )

    owner_info = await get_user_info(db, updated_project.get("owner_id"))

    return {
        "project_id": project_id,
        "name": updated_project.get("name"),
        "key": updated_project.get("key"),
        "description": updated_project.get("description", ""),
        "visibility": updated_project.get("visibility", "private"),
        "status": updated_project.get("status", "active"),
        "owner": owner_info,
        "created_at": updated_project.get("created_at"),
        "updated_at": updated_project.get("updated_at"),
        "project_deadline": updated_project.get("project_deadline"),
    }


@router.post("/{project_id}/archive", status_code=status.HTTP_204_NO_CONTENT)
async def archive_project(
    project_id: int,
    archive_request: ProjectArchiveRequest,
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
    current_user: Annotated[CurrentUser, Depends(require_project_admin)],
):
    """Archive a project (project admin or global admin only)."""
    if not archive_request.confirm:
        raise HTTPException(status_code=400, detail="Archive confirmation required")

    projects_collection = db["projects"]

    # Archive the project
    await projects_collection.update_one(
        {"project_number": project_id},
        {"$set": {"archived": True, "archived_at": datetime.now(timezone.utc)}}
    )


# ========== Workflow Status Endpoints ==========

