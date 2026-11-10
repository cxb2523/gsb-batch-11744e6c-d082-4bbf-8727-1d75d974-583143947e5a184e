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

@router.get("/notifications/preferences", response_model=NotificationPreferencesOut)
async def get_notification_preferences(
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    """Get current user's notification preferences."""
    preferences_collection = db["notification_preferences"]

    preferences = await preferences_collection.find_one({"user_id": current_user.id})

    # Return defaults if not found
    if not preferences:
        return {
            "user_id": current_user.id,
            "issue_assignments": True,
            "mentions": True,
            "status_changes": False,
            "comments": True,
            "email_notifications": False,
            "updated_at": datetime.now(timezone.utc),
        }

    return {
        "user_id": current_user.id,
        "issue_assignments": preferences.get("issue_assignments", True),
        "mentions": preferences.get("mentions", True),
        "status_changes": preferences.get("status_changes", False),
        "comments": preferences.get("comments", True),
        "email_notifications": preferences.get("email_notifications", False),
        "updated_at": preferences.get("updated_at", datetime.now(timezone.utc)),
    }


@router.put("/notifications/preferences", response_model=NotificationPreferencesOut)
async def update_notification_preferences(
    preferences_update: NotificationPreferencesUpdate,
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    """Update current user's notification preferences."""
    preferences_collection = db["notification_preferences"]

    # Build update dict
    update_data = {}
    if preferences_update.issue_assignments is not None:
        update_data["issue_assignments"] = preferences_update.issue_assignments
    if preferences_update.mentions is not None:
        update_data["mentions"] = preferences_update.mentions
    if preferences_update.status_changes is not None:
        update_data["status_changes"] = preferences_update.status_changes
    if preferences_update.comments is not None:
        update_data["comments"] = preferences_update.comments
    if preferences_update.email_notifications is not None:
        update_data["email_notifications"] = preferences_update.email_notifications

    update_data["updated_at"] = datetime.now(timezone.utc)

    # Upsert preferences
    updated_preferences = await preferences_collection.find_one_and_update(
        {"user_id": current_user.id},
        {"$set": update_data},
        upsert=True,
        return_document=ReturnDocument.AFTER,
    )

    return {
        "user_id": current_user.id,
        "issue_assignments": updated_preferences.get("issue_assignments", True),
        "mentions": updated_preferences.get("mentions", True),
        "status_changes": updated_preferences.get("status_changes", False),
        "comments": updated_preferences.get("comments", True),
        "email_notifications": updated_preferences.get("email_notifications", False),
        "updated_at": updated_preferences.get("updated_at"),
    }


@router.get("/notifications", response_model=List[NotificationOut])
async def list_notifications(
  db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
  current_user: Annotated[CurrentUser, Depends(get_current_user)],
  project_id: Optional[int] = Query(None, description="Filter notifications by project ID"),
):
  """List notifications for the current user, optionally filtered by project."""
  notifications_collection = db["notifications"]

  query: dict = {"user_id": current_user.id}
  if project_id is not None:
    query["project_id"] = project_id

  docs = await notifications_collection.find(query).sort("created_at", -1).to_list(length=None)

  result: List[NotificationOut] = []
  for doc in docs:
    result.append(
      NotificationOut(
        id=doc.get("notification_number"),
        user_id=doc.get("user_id"),
        type=doc.get("type", "ticket_updated"),
        message=doc.get("message", ""),
        read=doc.get("read", False),
        project_id=doc.get("project_id"),
        ticket_id=doc.get("ticket_id"),
        ticket_key=doc.get("ticket_key"),
        created_at=doc.get("created_at"),
      )
    )

  return result


@router.post("/notifications/{notification_id}/read", response_model=NotificationOut)
async def mark_notification_read(
  notification_id: int,
  db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
  current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
  """Mark a notification as read for the current user."""
  notifications_collection = db["notifications"]

  doc = await notifications_collection.find_one_and_update(
    {
      "notification_number": notification_id,
      "user_id": current_user.id,
    },
    {"$set": {"read": True}},
    return_document=ReturnDocument.AFTER,
  )

  if not doc:
    raise HTTPException(status_code=404, detail="Notification not found")

  return NotificationOut(
    id=doc.get("notification_number"),
    user_id=doc.get("user_id"),
    type=doc.get("type", "ticket_updated"),
    message=doc.get("message", ""),
    read=doc.get("read", False),
    project_id=doc.get("project_id"),
    ticket_id=doc.get("ticket_id"),
    ticket_key=doc.get("ticket_key"),
    created_at=doc.get("created_at"),
  )


@router.post("/notifications/read-all")
async def mark_all_notifications_read(
  db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
  current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
  """Mark all of the current user's unread notifications as read.

  Notifications are left in place (read=True) so the user still sees their
  history — this only clears the unread state behind the bell badge.
  """
  notifications_collection = db["notifications"]

  result = await notifications_collection.update_many(
    {"user_id": current_user.id, "read": False},
    {"$set": {"read": True}},
  )

  return {"updated": result.modified_count}


@router.delete("/notifications/{notification_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_notification(
  notification_id: int,
  db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
  current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
  """Delete a single notification. Scoped to the current user so no one can
  remove another person's notifications by guessing its number."""
  notifications_collection = db["notifications"]

  result = await notifications_collection.delete_one(
    {"notification_number": notification_id, "user_id": current_user.id},
  )

  if result.deleted_count == 0:
    raise HTTPException(status_code=404, detail="Notification not found")

  return None


@router.delete("/notifications")
async def clear_all_notifications(
  db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
  current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
  """Delete every notification for the current user (the bell's 'Clear all')."""
  notifications_collection = db["notifications"]

  result = await notifications_collection.delete_many({"user_id": current_user.id})

  return {"deleted": result.deleted_count}
