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


router = APIRouter(prefix="/projects", tags=["settings"])


# ========== Helper Functions ==========

async def verify_project_admin(
    project_id: int,
    current_user: CurrentUser,
    db: AsyncIOMotorDatabase,
) -> dict:
    """Verify that the current user is an admin of the project."""
    projects_collection = db["projects"]

    project = await projects_collection.find_one({"project_number": project_id})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Check if user is admin or project owner
    if current_user.role != "admin" and project.get("owner_id") != current_user.id:
        members_collection = db["project_members"]
        member = await members_collection.find_one({
            "project_id": project_id,
            "user_id": current_user.id,
            "role": "admin"
        })
        if not member:
            raise HTTPException(status_code=403, detail="Admin privileges required")

    return project


async def get_user_info(db: AsyncIOMotorDatabase, user_id: int) -> dict:
    """Get user information by user_id."""
    users_collection = db["users"]
    user = await users_collection.find_one({"user_number": user_id})
    if not user:
        return {"id": user_id, "name": "Unknown User", "email": "unknown@example.com"}
    return {
        "id": user_id,
        "name": user.get("name", "Unknown"),
        "email": user.get("email", "unknown@example.com")
    }


# ========== General Settings Endpoints ==========


__all__ = [
    "router",
    "verify_project_admin",
    "get_user_info",
]
