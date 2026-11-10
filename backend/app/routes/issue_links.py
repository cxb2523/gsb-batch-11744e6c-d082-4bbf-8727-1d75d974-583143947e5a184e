"""Issue Links API endpoints for issue relationships."""

import logging
from typing import Annotated, List
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

from fastapi import APIRouter, Depends, HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo import ReturnDocument

from ..db.mongo import get_mongo_db
from ..core.security import get_current_user, CurrentUser
from ..schemas.issue_links import IssueLinkCreate, IssueLinkOut, IssueLinkGrouped
from ..routes.tickets import (
    verify_project_access,
    get_user_info,
    create_ticket_notifications,
)


router = APIRouter(prefix="/projects", tags=["issue_links"])


# ========== Helper Functions ==========

async def verify_link_validity(
    db: AsyncIOMotorDatabase,
    project_id: int,
    source_id: int,
    target_id: int,
    link_type: str,
) -> tuple[dict, dict]:
    """Verify that both issues exist and link is valid (no circular refs)."""
    tickets_collection = db["tickets"]

    # Verify both issues exist in the same project
    source = await tickets_collection.find_one({
        "ticket_number": source_id,
        "project_id": project_id
    })
    target = await tickets_collection.find_one({
        "ticket_number": target_id,
        "project_id": project_id
    })

    if not source:
        raise HTTPException(status_code=404, detail="Source issue not found")
    if not target:
        raise HTTPException(status_code=404, detail="Target issue not found")

    # Prevent self-linking
    if source_id == target_id:
        raise HTTPException(status_code=400, detail="Cannot link an issue to itself")

    # Check for circular references (A blocks B, B blocks A)
    links_collection = db["issue_links"]
    inverse_link_types = {
        "blocks": "is_blocked_by",
        "is_blocked_by": "blocks",
        "duplicates": "is_duplicated_by",
        "is_duplicated_by": "duplicates",
    }

    # Check if inverse link already exists
    inverse_type = inverse_link_types.get(link_type)
    if inverse_type:
        existing_inverse = await links_collection.find_one({
            "source_issue_id": target_id,
            "target_issue_id": source_id,
            "link_type": inverse_type,
            "project_id": project_id
        })
        if existing_inverse:
            raise HTTPException(
                status_code=400,
                detail=f"Circular reference detected: Inverse link '{inverse_type}' already exists"
            )

    # Check if exact same link already exists
    existing_link = await links_collection.find_one({
        "source_issue_id": source_id,
        "target_issue_id": target_id,
        "link_type": link_type,
        "project_id": project_id
    })
    if existing_link:
        raise HTTPException(status_code=400, detail="This link already exists")

    return source, target


# ========== Issue Link Endpoints ==========

@router.post("/{project_id}/issues/{issue_id}/links", response_model=IssueLinkOut, status_code=status.HTTP_201_CREATED)
async def create_issue_link(
    project_id: int,
    issue_id: int,
    link_in: IssueLinkCreate,
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    """Create a link between two issues."""
    # Verify user has access to this project
    await verify_project_access(project_id, current_user.email, db, current_user.role, user_id=current_user.id)

    # Verify link validity
    source, target = await verify_link_validity(
        db, project_id, issue_id, link_in.target_issue_id, link_in.link_type
    )

    links_collection = db["issue_links"]
    counters_collection = db["counters"]

    # Generate link number
    counter = await counters_collection.find_one_and_update(
        {"_id": "issue_links"},
        {"$inc": {"seq": 1}},
        upsert=True,
        return_document=ReturnDocument.AFTER,
    )
    link_number = int(counter.get("seq", 1))

    # Create link document
    link_doc = {
        "link_number": link_number,
        "project_id": project_id,
        "source_issue_id": issue_id,
        "target_issue_id": link_in.target_issue_id,
        "link_type": link_in.link_type,
        "created_by": current_user.id,
        "created_at": datetime.now(timezone.utc),
    }

    await links_collection.insert_one(link_doc)

    # Get user info
    created_by = await get_user_info(db, current_user.id)

    # Create notifications for both issues
    link_type_display = link_in.link_type.replace("_", " ").title()
    await create_ticket_notifications(
        db,
        project_id,
        source,
        event_type="ticket_updated",
        message=f"Issue link created: {source.get('key')} {link_type_display} {target.get('key')}",
        actor_user_id=current_user.id,
    )

    return {
        "id": link_number,
        "source_issue_id": issue_id,
        "source_issue_key": source.get("key"),
        "source_issue_title": source.get("title"),
        "target_issue_id": link_in.target_issue_id,
        "target_issue_key": target.get("key"),
        "target_issue_title": target.get("title"),
        "link_type": link_in.link_type,
        "created_at": link_doc["created_at"],
        "created_by": created_by,
    }


@router.get("/{project_id}/issues/{issue_id}/links", response_model=IssueLinkGrouped)
async def get_issue_links(
    project_id: int,
    issue_id: int,
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    """Get all links for an issue, grouped by type (outgoing and incoming)."""
    # Verify user has access to this project
    await verify_project_access(project_id, current_user.email, db, current_user.role, user_id=current_user.id)

    tickets_collection = db["tickets"]
    links_collection = db["issue_links"]

    # Verify issue exists
    issue = await tickets_collection.find_one({
        "ticket_number": issue_id,
        "project_id": project_id
    })
    if not issue:
        raise HTTPException(status_code=404, detail="Issue not found")

    # Fetch outgoing links (where this issue is the source)
    outgoing_links = await links_collection.find({
        "source_issue_id": issue_id,
        "project_id": project_id
    }).to_list(length=None)

    # Fetch incoming links (where this issue is the target)
    incoming_links = await links_collection.find({
        "target_issue_id": issue_id,
        "project_id": project_id
    }).to_list(length=None)

    # Group links by type
    grouped = {
        "blocks": [],
        "blocked_by": [],
        "relates_to": [],
        "duplicates": [],
        "duplicated_by": [],
    }

    # Process outgoing links
    for link in outgoing_links:
        target = await tickets_collection.find_one({
            "ticket_number": link.get("target_issue_id"),
            "project_id": project_id
        })
        if not target:
            continue

        link_type = link.get("link_type")
        created_by = await get_user_info(db, link.get("created_by"))

        link_data = {
            "id": link.get("link_number"),
            "issue_id": target.get("ticket_number"),
            "issue_key": target.get("key"),
            "issue_title": target.get("title"),
            "issue_type": target.get("type"),
            "issue_status": target.get("status_id"),
            "created_at": link.get("created_at"),
            "created_by": created_by,
        }

        if link_type == "blocks":
            grouped["blocks"].append(link_data)
        elif link_type == "relates_to":
            grouped["relates_to"].append(link_data)
        elif link_type == "duplicates":
            grouped["duplicates"].append(link_data)

    # Process incoming links
    for link in incoming_links:
        source = await tickets_collection.find_one({
            "ticket_number": link.get("source_issue_id"),
            "project_id": project_id
        })
        if not source:
            continue

        link_type = link.get("link_type")
        created_by = await get_user_info(db, link.get("created_by"))

        link_data = {
            "id": link.get("link_number"),
            "issue_id": source.get("ticket_number"),
            "issue_key": source.get("key"),
            "issue_title": source.get("title"),
            "issue_type": source.get("type"),
            "issue_status": source.get("status_id"),
            "created_at": link.get("created_at"),
            "created_by": created_by,
        }

        if link_type == "blocks":
            grouped["blocked_by"].append(link_data)
        elif link_type == "is_blocked_by":
            grouped["blocks"].append(link_data)
        elif link_type == "relates_to":
            grouped["relates_to"].append(link_data)
        elif link_type == "duplicates":
            grouped["duplicated_by"].append(link_data)
        elif link_type == "is_duplicated_by":
            grouped["duplicates"].append(link_data)

    return grouped


@router.delete("/{project_id}/links/{link_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_issue_link(
    project_id: int,
    link_id: int,
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    """Delete an issue link."""
    # Verify user has access to this project
    await verify_project_access(project_id, current_user.email, db, current_user.role, user_id=current_user.id)

    links_collection = db["issue_links"]

    # Verify link exists
    link = await links_collection.find_one({
        "link_number": link_id,
        "project_id": project_id
    })
    if not link:
        raise HTTPException(status_code=404, detail="Link not found")

    # Only creator or admin can delete
    if current_user.role != "admin" and link.get("created_by") != current_user.id:
        raise HTTPException(status_code=403, detail="Only link creator or admin can delete links")

    # Delete link
    await links_collection.delete_one({
        "link_number": link_id,
        "project_id": project_id
    })

    return None
