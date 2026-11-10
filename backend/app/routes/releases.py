from typing import Annotated, List
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo import ReturnDocument

from ..db.mongo import get_mongo_db
from ..schemas.release import (
    ReleaseCreate, ReleaseOut, ReleaseUpdate, DeploymentCreate,
    DeploymentRecord, ReleaseMetrics, ChangelogItem, GitCommit
)
from ..core.security import get_current_user, CurrentUser
from ..routes.projects import verify_project_access


router = APIRouter(prefix="/projects/{project_id}/releases", tags=["releases"])


def calculate_release_metrics(release_doc: dict, tickets_collection, release_tickets_collection) -> dict:
    """Calculate metrics for a release."""
    metrics = {
        "lead_time_days": None,
        "deployment_count": 0,
        "rollback_count": 0,
        "tickets_completed": 0,
        "tickets_total": 0,
        "code_changes_count": 0
    }

    # Calculate lead time
    if release_doc.get("first_commit_date") and release_doc.get("release_completed_date"):
        delta = release_doc["release_completed_date"] - release_doc["first_commit_date"]
        metrics["lead_time_days"] = delta.total_seconds() / 86400

    # Count deployments and rollbacks
    deployments = release_doc.get("deployments", [])
    metrics["deployment_count"] = len(deployments)
    metrics["rollback_count"] = sum(1 for d in deployments if d.get("status") == "rolled_back")

    # Count commits
    commits = release_doc.get("commits", [])
    metrics["code_changes_count"] = len(commits)

    return metrics


async def get_release_dict(release: dict, project_id: int, release_tickets_collection,
                           tickets_collection, statuses_collection, users_collection) -> dict:
    """Convert a release document to ReleaseOut dict with all related data."""
    release_id = release.get("release_number")

    # Count tickets and get ticket stats
    release_ticket_docs = await release_tickets_collection.find({
        "release_id": release_id,
        "project_id": project_id
    }).to_list(length=None)

    ticket_ids = [rt.get("ticket_id") for rt in release_ticket_docs]
    ticket_count = len(ticket_ids)

    # Count completed tickets
    tickets_completed = 0
    if ticket_ids:
        tickets = await tickets_collection.find({
            "ticket_number": {"$in": ticket_ids},
            "project_id": project_id
        }).to_list(length=None)

        for ticket in tickets:
            status_id = ticket.get("status_id")
            if status_id:
                status_doc = await statuses_collection.find_one({"status_number": status_id})
                if status_doc and status_doc.get("category") == "done":
                    tickets_completed += 1

    # Calculate metrics
    metrics = calculate_release_metrics(release, tickets_collection, release_tickets_collection)
    metrics["tickets_completed"] = tickets_completed
    metrics["tickets_total"] = ticket_count

    # Get current environments (latest successful deployment per environment)
    current_environments = []
    deployments = release.get("deployments", [])
    env_latest = {}
    for dep in deployments:
        env = dep.get("environment")
        if dep.get("status") == "success":
            if env not in env_latest or dep.get("deployed_at") > env_latest[env]:
                env_latest[env] = dep.get("deployed_at")
                if env not in current_environments:
                    current_environments.append(env)
        elif dep.get("status") == "rolled_back" and env in current_environments:
            current_environments.remove(env)

    # Enrich deployments with user names (prefer deployed_by_email, fall back to legacy deployed_by id)
    enriched_deployments = []
    for dep in deployments:
        dep_dict = dict(dep)
        email = dep.get("deployed_by_email")
        user = None
        if email:
            user = await users_collection.find_one({"email": email})
        elif dep.get("deployed_by"):
            user = await users_collection.find_one({"user_number": dep.get("deployed_by")})
        if user:
            dep_dict["deployed_by_name"] = user.get("name")
        elif email:
            dep_dict["deployed_by_name"] = email.split("@")[0]
        enriched_deployments.append(dep_dict)

    return {
        "id": release_id,
        "project_id": project_id,
        "name": release.get("name"),
        "version": release.get("version"),
        "description": release.get("description"),
        "release_notes": release.get("release_notes"),
        "release_date": release.get("release_date"),
        "git_merge_mr": release.get("git_merge_mr"),
        "status": release.get("status", "planned"),
        "ticket_count": ticket_count,
        "created_at": release.get("created_at"),
        "updated_at": release.get("updated_at"),
        # Git integration
        "git_tag": release.get("git_tag"),
        "git_branch": release.get("git_branch"),
        "commits": release.get("commits", []),
        # Deployment tracking
        "deployments": enriched_deployments,
        "current_environments": current_environments,
        # Changelog
        "changelog_items": release.get("changelog_items", []),
        "auto_generated_changelog": release.get("auto_generated_changelog", False),
        # Metrics
        "metrics": metrics,
        "first_commit_date": release.get("first_commit_date"),
        "release_completed_date": release.get("release_completed_date")
    }


@router.get("", response_model=List[ReleaseOut])
async def list_releases(
    project_id: int,
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    """Get all releases for a project."""
    # Verify user has access to this project
    has_access = await verify_project_access(
        project_id=project_id,
        user_id=current_user.id,
        db=db,
        user_role=current_user.role,
        user_email=current_user.email,
    )

    if not has_access:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have access to this project"
        )

    releases_collection = db["releases"]
    release_tickets_collection = db["release_tickets"]
    tickets_collection = db["tickets"]
    statuses_collection = db["ticket_statuses"]
    users_collection = db["users"]

    releases = await releases_collection.find({
        "project_id": project_id
    }).sort("created_at", -1).to_list(length=None)

    result = []
    for release in releases:
        release_dict = await get_release_dict(
            release, project_id, release_tickets_collection,
            tickets_collection, statuses_collection, users_collection
        )
        result.append(release_dict)

    return result


@router.post("", response_model=ReleaseOut, status_code=status.HTTP_201_CREATED)
async def create_release(
    project_id: int,
    release_in: ReleaseCreate,
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    """Create a new release."""
    # Verify user has access to this project
    has_access = await verify_project_access(
        project_id=project_id,
        user_id=current_user.id,
        db=db,
        user_role=current_user.role,
        user_email=current_user.email,
    )

    if not has_access:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have access to this project"
        )

    releases_collection = db["releases"]
    counters_collection = db["counters"]
    release_tickets_collection = db["release_tickets"]
    tickets_collection = db["tickets"]
    statuses_collection = db["ticket_statuses"]
    users_collection = db["users"]

    # Generate release ID
    counter = await counters_collection.find_one_and_update(
        {"_id": "releases"},
        {"$inc": {"seq": 1}},
        upsert=True,
        return_document=ReturnDocument.AFTER,
    )
    release_number = int(counter.get("seq", 1))

    now = datetime.now(timezone.utc)

    # Convert commits to dict for storage
    commits_data = [commit.model_dump() for commit in (release_in.commits or [])]

    # Determine first commit date
    first_commit_date = None
    if commits_data:
        first_commit_date = min(c["timestamp"] for c in commits_data)

    # Create release document
    release_doc = {
        "release_number": release_number,
        "project_id": project_id,
        "name": release_in.name,
        "version": release_in.version,
        "description": release_in.description,
        "release_notes": release_in.release_notes,
        "release_date": release_in.release_date,
        "git_merge_mr": release_in.git_merge_mr,
        "status": "planned",
        "created_by_email": current_user.email,
        "created_at": now,
        "updated_at": None,
        # Git integration
        "git_tag": release_in.git_tag,
        "git_branch": release_in.git_branch,
        "commits": commits_data,
        # Deployment tracking
        "deployments": [],
        # Changelog
        "changelog_items": [],
        "auto_generated_changelog": False,
        # Metrics
        "first_commit_date": first_commit_date,
        "release_completed_date": None
    }

    await releases_collection.insert_one(release_doc)

    # Add tickets to release
    if release_in.ticket_ids:
        for ticket_id in release_in.ticket_ids:
            release_ticket_doc = {
                "release_id": release_number,
                "project_id": project_id,
                "ticket_id": ticket_id,
                "added_at": now,
                "added_by_email": current_user.email
            }
            await release_tickets_collection.insert_one(release_ticket_doc)

    # Get the created release with all enriched data
    created_release = await releases_collection.find_one({"release_number": release_number})
    return await get_release_dict(
        created_release, project_id, release_tickets_collection,
        tickets_collection, statuses_collection, users_collection
    )


@router.get("/{release_id}", response_model=ReleaseOut)
async def get_release(
    project_id: int,
    release_id: int,
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    """Get a specific release by ID."""
    # Verify user has access to this project
    has_access = await verify_project_access(
        project_id=project_id,
        user_id=current_user.id,
        db=db,
        user_role=current_user.role,
        user_email=current_user.email,
    )

    if not has_access:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have access to this project"
        )

    releases_collection = db["releases"]
    release_tickets_collection = db["release_tickets"]
    tickets_collection = db["tickets"]
    statuses_collection = db["ticket_statuses"]
    users_collection = db["users"]

    release = await releases_collection.find_one({
        "release_number": release_id,
        "project_id": project_id
    })

    if not release:
        raise HTTPException(status_code=404, detail="Release not found")

    return await get_release_dict(
        release, project_id, release_tickets_collection,
        tickets_collection, statuses_collection, users_collection
    )


@router.put("/{release_id}", response_model=ReleaseOut)
async def update_release(
    project_id: int,
    release_id: int,
    release_update: ReleaseUpdate,
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    """Update a release."""
    # Verify user has access to this project
    has_access = await verify_project_access(
        project_id=project_id,
        user_id=current_user.id,
        db=db,
        user_role=current_user.role,
        user_email=current_user.email,
    )

    if not has_access:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have access to this project"
        )

    releases_collection = db["releases"]
    release_tickets_collection = db["release_tickets"]
    tickets_collection = db["tickets"]
    statuses_collection = db["ticket_statuses"]
    users_collection = db["users"]

    # Build update document
    update_data = {}
    if release_update.name is not None:
        update_data["name"] = release_update.name
    if release_update.version is not None:
        update_data["version"] = release_update.version
    if release_update.description is not None:
        update_data["description"] = release_update.description
    if release_update.release_notes is not None:
        update_data["release_notes"] = release_update.release_notes
    if release_update.release_date is not None:
        update_data["release_date"] = release_update.release_date
    if release_update.git_merge_mr is not None:
        update_data["git_merge_mr"] = release_update.git_merge_mr
    if release_update.git_tag is not None:
        update_data["git_tag"] = release_update.git_tag
    if release_update.git_branch is not None:
        update_data["git_branch"] = release_update.git_branch
    if release_update.commits is not None:
        commits_data = [commit.model_dump() for commit in release_update.commits]
        update_data["commits"] = commits_data
        # Update first commit date if commits changed
        if commits_data:
            update_data["first_commit_date"] = min(c["timestamp"] for c in commits_data)
    if release_update.changelog_items is not None:
        changelog_data = [item.model_dump() for item in release_update.changelog_items]
        update_data["changelog_items"] = changelog_data
    if release_update.status is not None:
        update_data["status"] = release_update.status
        # If status changed to released, record completion date
        if release_update.status == "released":
            update_data["release_completed_date"] = datetime.now(timezone.utc)

    if not update_data and release_update.ticket_ids is None:
        raise HTTPException(status_code=400, detail="No fields to update")

    now = datetime.now(timezone.utc)
    update_data["updated_at"] = now

    # Update release
    updated_release = await releases_collection.find_one_and_update(
        {"release_number": release_id, "project_id": project_id},
        {"$set": update_data},
        return_document=ReturnDocument.AFTER
    )

    if not updated_release:
        raise HTTPException(status_code=404, detail="Release not found")

    # Update tickets if provided
    if release_update.ticket_ids is not None:
        # Remove existing ticket associations
        await release_tickets_collection.delete_many({
            "release_id": release_id,
            "project_id": project_id
        })

        # Add new ticket associations
        for ticket_id in release_update.ticket_ids:
            release_ticket_doc = {
                "release_id": release_id,
                "project_id": project_id,
                "ticket_id": ticket_id,
                "added_at": now,
                "added_by_email": current_user.email
            }
            await release_tickets_collection.insert_one(release_ticket_doc)

    return await get_release_dict(
        updated_release, project_id, release_tickets_collection,
        tickets_collection, statuses_collection, users_collection
    )


@router.delete("/{release_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_release(
    project_id: int,
    release_id: int,
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    """Delete a release."""
    # Verify user has access to this project
    has_access = await verify_project_access(
        project_id=project_id,
        user_id=current_user.id,
        db=db,
        user_role=current_user.role,
        user_email=current_user.email,
    )

    if not has_access:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have access to this project"
        )

    releases_collection = db["releases"]
    release_tickets_collection = db["release_tickets"]

    # Delete release
    result = await releases_collection.delete_one({
        "release_number": release_id,
        "project_id": project_id
    })

    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Release not found")

    # Delete ticket associations
    await release_tickets_collection.delete_many({
        "release_id": release_id,
        "project_id": project_id
    })

    return None


@router.get("/{release_id}/tickets")
async def get_release_tickets(
    project_id: int,
    release_id: int,
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    """Get all tickets in a release."""
    # Verify user has access to this project
    has_access = await verify_project_access(
        project_id=project_id,
        user_id=current_user.id,
        db=db,
        user_role=current_user.role,
        user_email=current_user.email,
    )

    if not has_access:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have access to this project"
        )

    release_tickets_collection = db["release_tickets"]
    tickets_collection = db["tickets"]
    users_collection = db["users"]
    status_collection = db["ticket_statuses"]
    projects_collection = db["projects"]

    # Get project for key
    project = await projects_collection.find_one({"project_number": project_id})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Get ticket IDs in this release
    release_tickets = await release_tickets_collection.find({
        "release_id": release_id,
        "project_id": project_id
    }).to_list(length=None)

    ticket_ids = [rt.get("ticket_id") for rt in release_tickets]

    if not ticket_ids:
        return []

    # Get ticket details
    tickets = await tickets_collection.find({
        "ticket_number": {"$in": ticket_ids},
        "project_id": project_id
    }).to_list(length=None)

    result = []
    for ticket in tickets:
        # Get assignee info (prefer assignee_email; fall back to legacy assignee_id)
        assignee = None
        assignee_email = ticket.get("assignee_email")
        assignee_user = None
        if assignee_email:
            assignee_user = await users_collection.find_one({"email": assignee_email})
        elif ticket.get("assignee_id"):
            assignee_user = await users_collection.find_one({"user_number": ticket.get("assignee_id")})
            if assignee_user:
                assignee_email = assignee_user.get("email")
        if assignee_email:
            assignee = {
                "id": assignee_user.get("user_number") if assignee_user else None,
                "name": assignee_user.get("name") if assignee_user else assignee_email.split("@")[0],
                "email": assignee_email,
            }

        # Get status info
        ticket_status = await status_collection.find_one({"status_number": ticket.get("status_id")})

        result.append({
            "id": ticket.get("ticket_number"),
            "key": f"{project.get('key')}-{ticket.get('ticket_number')}",
            "title": ticket.get("title"),
            "description": ticket.get("description"),
            "type": ticket.get("type"),
            "status": {
                "id": ticket.get("status_id"),
                "name": ticket_status.get("name") if ticket_status else "Unknown",
                "color": ticket_status.get("color") if ticket_status else "#6b7280"
            },
            "assignee": assignee,
            "story_points": ticket.get("story_points"),
            "priority": ticket.get("priority"),
            "labels": ticket.get("labels", []),
            "created_at": ticket.get("created_at"),
            "due_date": ticket.get("due_date")
        })

    return result


@router.post("/{release_id}/deployments", response_model=ReleaseOut, status_code=status.HTTP_201_CREATED)
async def create_deployment(
    project_id: int,
    release_id: int,
    deployment: DeploymentCreate,
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    """Create a new deployment record for a release."""
    # Verify user has access to this project
    has_access = await verify_project_access(
        project_id=project_id,
        user_id=current_user.id,
        db=db,
        user_role=current_user.role,
        user_email=current_user.email,
    )

    if not has_access:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have access to this project"
        )

    releases_collection = db["releases"]
    release_tickets_collection = db["release_tickets"]
    tickets_collection = db["tickets"]
    statuses_collection = db["ticket_statuses"]
    users_collection = db["users"]

    # Check if release exists
    release = await releases_collection.find_one({
        "release_number": release_id,
        "project_id": project_id
    })

    if not release:
        raise HTTPException(status_code=404, detail="Release not found")

    now = datetime.now(timezone.utc)

    # Create deployment record
    deployment_record = {
        "environment": deployment.environment,
        "deployed_at": now,
        "deployed_by_email": current_user.email,
        "status": deployment.status,
        "commit_hash": deployment.commit_hash,
        "notes": deployment.notes
    }

    # Add deployment to release
    await releases_collection.update_one(
        {"release_number": release_id, "project_id": project_id},
        {
            "$push": {"deployments": deployment_record},
            "$set": {"updated_at": now}
        }
    )

    # Get updated release
    updated_release = await releases_collection.find_one({
        "release_number": release_id,
        "project_id": project_id
    })

    return await get_release_dict(
        updated_release, project_id, release_tickets_collection,
        tickets_collection, statuses_collection, users_collection
    )
