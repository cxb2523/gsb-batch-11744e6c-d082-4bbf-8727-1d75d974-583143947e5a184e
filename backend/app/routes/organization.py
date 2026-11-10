"""API routes for organization-level settings."""

import logging
from typing import Annotated
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from ..db.mongo import get_mongo_db
from ..schemas.organization import (
    NavigationConfigOut,
    NavigationConfigUpdate,
    ALWAYS_VISIBLE_NAV_IDS,
)
from ..core.security import get_current_user, CurrentUser

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/organization", tags=["organization"])

# For simplicity, we'll use organization_id = 1 (single org)
ORGANIZATION_ID = 1


@router.get("/navigation", response_model=NavigationConfigOut)
async def get_navigation_config(
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    """Which nav items are visible, install-wide.

    Every signed-in user reads this on page load, so it is deliberately tiny. An id
    that is absent means visible: that way a nav item added to the frontend needs no
    config change, and an install that has never configured anything behaves exactly
    as it did before this endpoint existed.

    Visibility is not access control. Hiding an item removes it from the sidebar; the
    route behind it is still reachable and still guarded by its own rules.
    """
    settings_collection = db["organization_settings"]
    settings = await settings_collection.find_one({"organization_id": ORGANIZATION_ID})
    stored = (settings or {}).get("navigation") or {}
    return {"navigation": {**stored, **{item: True for item in ALWAYS_VISIBLE_NAV_IDS}}}


@router.put("/navigation", response_model=NavigationConfigOut)
async def update_navigation_config(
    payload: NavigationConfigUpdate,
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    """Replace the navigation visibility map (admin only)."""
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admins can update navigation settings"
        )

    settings_collection = db["organization_settings"]
    # Upsert: an install that has never opened organization settings has no document
    # yet, and failing the first save would be a strange way to find that out.
    await settings_collection.update_one(
        {"organization_id": ORGANIZATION_ID},
        {
            "$set": {
                "navigation": payload.navigation,
                "updated_at": datetime.now(timezone.utc),
            },
            "$setOnInsert": {
                "organization_id": ORGANIZATION_ID,
                "created_at": datetime.now(timezone.utc),
            },
        },
        upsert=True,
    )
    return {"navigation": payload.navigation}
