"""
Google Workspace User Sync API Routes
"""
import logging
import time
from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from typing import Annotated, Optional
from motor.motor_asyncio import AsyncIOMotorDatabase
from datetime import datetime
from pymongo import ReturnDocument

logger = logging.getLogger(__name__)

from ..db.mongo import get_mongo_db
from ..core.security import get_current_user, CurrentUser
from ..core.settings import get_settings
from ..core.crypto import decrypt
from ..services.google_workspace import GoogleWorkspaceService


def require_workspace() -> str:
    """Refuse every route here unless this install has a Workspace configured.

    404, not 403: an install with no Workspace has no user directory to sync, so the
    feature does not exist here rather than being withheld from this caller. The UI
    hides these screens for the same reason, but hiding a button is not access
    control - without this the endpoints stay callable by hand.

    Returns the configured domain, so a route that needs it can depend on this
    instead of reading the settings again.
    """
    domain = get_settings().google_workspace_domain
    if not domain:
        raise HTTPException(
            status_code=404,
            detail="Google Workspace sync is not configured on this install.",
        )
    return domain


router = APIRouter(
    prefix="/google-sync",
    tags=["Google Workspace Sync"],
    dependencies=[Depends(require_workspace)],
)


def _resolve_google_token(user_doc: Optional[dict]) -> str:
    """Return a usable Google access token or raise 400 with a re-login hint."""
    tokens = (user_doc or {}).get("google_oauth_tokens") or {}
    # Stored encrypted at rest (app/core/crypto.py); decrypt() passes any legacy
    # plaintext value through unchanged.
    access_token = decrypt(tokens.get("access_token") or (user_doc or {}).get("google_access_token"))
    if not access_token:
        raise HTTPException(
            status_code=400,
            detail="Google access token not found. Please log out and log in again to refresh your Google credentials."
        )
    expires_at = tokens.get("expires_at")
    if isinstance(expires_at, (int, float)) and expires_at > 0 and expires_at < time.time():
        raise HTTPException(
            status_code=400,
            detail="Your Google access token has expired. Please log out and log in again to refresh it."
        )
    return access_token


@router.post("/users")
async def sync_users_from_google(
    background_tasks: BackgroundTasks,
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
    workspace_domain: Annotated[str, Depends(require_workspace)],
    exclude_suspended: bool = True,
):
    """
    Sync users from Google Workspace Directory (Admin only)

    This endpoint will:
    1. Fetch all users from Google Workspace
    2. Create new users in the database
    3. Update existing users with latest info from Google
    """
    # Only admins can sync users
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Only admins can sync users from Google Workspace")

    try:
        # Get current user's Google access token from database
        users_collection = db.users
        user_doc = await users_collection.find_one({"user_number": current_user.id})

        access_token = _resolve_google_token(user_doc)

        # Initialize Google Workspace service with user's access token
        google_service = GoogleWorkspaceService(access_token=access_token)

        # Fetch users from Google
        google_users = google_service.list_users(domain=workspace_domain)

        stats = {
            'total_fetched': len(google_users),
            'created': 0,
            'updated': 0,
            'skipped': 0,
            'errors': [],
        }

        users_collection = db.users
        counters_collection = db.counters
        user_availability_collection = db.user_availability

        for google_user in google_users:
            try:
                parsed_user = google_service.parse_user_data(google_user)

                # Skip suspended users if requested
                if exclude_suspended and parsed_user['is_suspended']:
                    stats['skipped'] += 1
                    continue

                email = parsed_user['email']

                # Check if user already exists
                existing_user = await users_collection.find_one({'email': email})

                if existing_user:
                    # Update existing user (preserve designation if already set)
                    update_data = {
                        'name': parsed_user['name'],
                        'department': parsed_user.get('department'),
                        'profile_photo': parsed_user.get('profile_photo'),
                    }

                    # Role is deliberately not synced: admin is granted in the app.
                    await users_collection.update_one(
                        {'email': email},
                        {'$set': update_data}
                    )
                    stats['updated'] += 1
                else:
                    # Create new user — use same counter as auth flow
                    counter = await counters_collection.find_one_and_update(
                        {"_id": "users"},
                        {"$inc": {"seq": 1}},
                        return_document=True,
                        upsert=True
                    )
                    user_number = int(counter.get("seq", 1))

                    new_user = {
                        'user_number': user_number,
                        'email': parsed_user['email'],
                        'name': parsed_user['name'],
                        'role': 'user',  # admin is granted in the app, never by the sync
                        'department': parsed_user.get('department'),
                        'designation': None,  # Will be set manually by admin
                        'profile_photo': parsed_user.get('profile_photo'),
                        'is_active': True,
                        'created_at': datetime.now(),
                        'last_login_at': None,
                    }

                    logger.info("Creating user: %s (%s) user_number=%d", parsed_user['name'], email, user_number)
                    await users_collection.insert_one(new_user)

                    # Initialize availability for new user
                    await user_availability_collection.insert_one({
                        'user_id': user_number,
                        'status': 'available',
                        'current_workload': 0,
                        'capacity': 100,
                        'available_hours_per_week': 40,
                        'updated_at': datetime.now(),
                    })

                    stats['created'] += 1

            except Exception as e:
                logger.error("Failed to sync user %s: %s", google_user.get('primaryEmail', 'unknown'), e, exc_info=True)
                stats['errors'].append({
                    'email': google_user.get('primaryEmail', 'unknown'),
                    'error': 'Failed to sync this user'
                })

        return {
            'success': True,
            'message': f"Synced {stats['created'] + stats['updated']} users from Google Workspace",
            'stats': stats,
        }

    except HTTPException:
        # Preserve auth/precondition errors raised above (don't mask as 500).
        raise
    except ValueError as e:
        # Missing credentials or configuration
        logger.warning("Google Workspace sync configuration error: %s", e)
        raise HTTPException(
            status_code=400,
            detail="Google Workspace is not configured correctly. Check the server configuration."
        )
    except Exception:
        logger.exception("Failed to sync users from Google Workspace")
        raise HTTPException(
            status_code=500,
            detail="Failed to sync users from Google Workspace. Please try again."
        )


@router.get("/test-connection")
async def test_google_connection(
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
    workspace_domain: Annotated[str, Depends(require_workspace)],
):
    """
    Test connection to Google Workspace API (Admin only)
    """
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Only admins can test Google Workspace connection")

    try:
        # Get current user's Google access token from database
        users_collection = db.users
        user_doc = await users_collection.find_one({"user_number": current_user.id})

        access_token = _resolve_google_token(user_doc)

        google_service = GoogleWorkspaceService(access_token=access_token)

        # Try to fetch just one user to test connection
        users = google_service.list_users(domain=workspace_domain, max_results=1)

        return {
            'success': True,
            'message': 'Successfully connected to Google Workspace',
            'sample_user_count': len(users),
        }

    except HTTPException:
        raise
    except ValueError as e:
        logger.warning("Google Workspace connection configuration error: %s", e)
        raise HTTPException(
            status_code=400,
            detail="Google Workspace is not configured correctly. Check the server configuration."
        )
    except Exception:
        logger.exception("Google Workspace connection test failed")
        raise HTTPException(
            status_code=500,
            detail="Failed to connect to Google Workspace. Please try again."
        )
