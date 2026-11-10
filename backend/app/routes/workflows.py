"""Workflow API endpoints for managing project workflows."""

from typing import Annotated, List
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo import ReturnDocument

from ..db.mongo import get_mongo_db
from ..core.security import get_current_user, CurrentUser, require_admin, require_project_admin
from ..schemas.workflows import (
    WorkflowCreate,
    WorkflowUpdate,
    WorkflowOut,
    SetDefaultWorkflowRequest,
)


router = APIRouter(prefix="/projects", tags=["workflows"])


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


async def validate_workflow_statuses(
    project_id: int,
    status_refs: list,
    db: AsyncIOMotorDatabase,
) -> None:
    """Validate that all statuses exist in the project."""
    statuses_collection = db["ticket_statuses"]

    for status_ref in status_refs:
        status = await statuses_collection.find_one({
            "status_number": status_ref.status_id,
            "project_id": project_id
        })
        if not status:
            raise HTTPException(
                status_code=400,
                detail=f"Status with ID {status_ref.status_id} not found in project"
            )


async def validate_workflow_transitions(
    transitions: list,
    status_ids: set,
) -> None:
    """Validate that all transition statuses exist in workflow."""
    for transition in transitions:
        if transition.from_status_id not in status_ids:
            raise HTTPException(
                status_code=400,
                detail=f"Transition from_status_id {transition.from_status_id} not in workflow statuses"
            )
        if transition.to_status_id not in status_ids:
            raise HTTPException(
                status_code=400,
                detail=f"Transition to_status_id {transition.to_status_id} not in workflow statuses"
            )


# ========== Workflow CRUD Endpoints ==========

@router.post("/{project_id}/workflows", response_model=WorkflowOut, status_code=status.HTTP_201_CREATED)
async def create_workflow(
    project_id: int,
    workflow_in: WorkflowCreate,
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
    current_user: Annotated[CurrentUser, Depends(require_project_admin)],
):
    """Create a new workflow for a project (project admin or global admin only)."""
    # Validate statuses exist in project
    await validate_workflow_statuses(project_id, workflow_in.statuses, db)

    # Validate transitions
    status_ids = {s.status_id for s in workflow_in.statuses}
    await validate_workflow_transitions(workflow_in.transitions, status_ids)

    workflows_collection = db["workflows"]
    counters_collection = db["counters"]

    # Generate workflow ID
    counter = await counters_collection.find_one_and_update(
        {"_id": "workflows"},
        {"$inc": {"seq": 1}},
        upsert=True,
        return_document=ReturnDocument.AFTER,
    )
    workflow_number = int(counter.get("seq", 1))

    # Check if this is the first workflow - make it default
    existing_count = await workflows_collection.count_documents({"project_id": project_id})
    is_default = existing_count == 0

    # Create workflow
    workflow_doc = {
        "workflow_number": workflow_number,
        "project_id": project_id,
        "name": workflow_in.name,
        "description": workflow_in.description,
        "statuses": [s.model_dump() for s in workflow_in.statuses],
        "transitions": [t.model_dump() for t in workflow_in.transitions],
        "issue_types": workflow_in.issue_types or [],
        "is_default": is_default,
        "created_at": datetime.now(timezone.utc),
        "created_by": current_user.id,
    }

    await workflows_collection.insert_one(workflow_doc)

    return WorkflowOut(
        id=workflow_number,
        project_id=project_id,
        name=workflow_in.name,
        description=workflow_in.description,
        statuses=workflow_in.statuses,
        transitions=workflow_in.transitions,
        issue_types=workflow_in.issue_types or [],
        is_default=is_default,
        created_at=workflow_doc["created_at"],
    )


@router.get("/{project_id}/workflows", response_model=List[WorkflowOut])
async def list_workflows(
    project_id: int,
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    """Get all workflows for a project."""
    workflows_collection = db["workflows"]

    workflows = await workflows_collection.find(
        {"project_id": project_id}
    ).sort("created_at", 1).to_list(length=None)

    return [
        WorkflowOut(
            id=w.get("workflow_number"),
            project_id=project_id,
            name=w.get("name"),
            description=w.get("description"),
            statuses=w.get("statuses", []),
            transitions=w.get("transitions", []),
            issue_types=w.get("issue_types", []),
            is_default=w.get("is_default", False),
            created_at=w.get("created_at"),
            updated_at=w.get("updated_at"),
        )
        for w in workflows
    ]


@router.get("/{project_id}/workflows/{workflow_id}", response_model=WorkflowOut)
async def get_workflow(
    project_id: int,
    workflow_id: int,
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    """Get a specific workflow by ID."""
    workflows_collection = db["workflows"]

    workflow = await workflows_collection.find_one({
        "workflow_number": workflow_id,
        "project_id": project_id
    })

    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")

    return WorkflowOut(
        id=workflow.get("workflow_number"),
        project_id=project_id,
        name=workflow.get("name"),
        description=workflow.get("description"),
        statuses=workflow.get("statuses", []),
        transitions=workflow.get("transitions", []),
        issue_types=workflow.get("issue_types", []),
        is_default=workflow.get("is_default", False),
        created_at=workflow.get("created_at"),
        updated_at=workflow.get("updated_at"),
    )


@router.put("/{project_id}/workflows/{workflow_id}", response_model=WorkflowOut)
async def update_workflow(
    project_id: int,
    workflow_id: int,
    workflow_update: WorkflowUpdate,
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
    current_user: Annotated[CurrentUser, Depends(require_project_admin)],
):
    """Update a workflow (project admin or global admin only)."""
    workflows_collection = db["workflows"]

    # Check workflow exists
    workflow = await workflows_collection.find_one({
        "workflow_number": workflow_id,
        "project_id": project_id
    })
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")

    # Build update dict
    update_data = {}
    if workflow_update.name is not None:
        update_data["name"] = workflow_update.name
    if workflow_update.description is not None:
        update_data["description"] = workflow_update.description
    if workflow_update.statuses is not None:
        # Validate statuses
        await validate_workflow_statuses(project_id, workflow_update.statuses, db)
        update_data["statuses"] = [s.model_dump() for s in workflow_update.statuses]
    if workflow_update.transitions is not None:
        # Get status IDs for validation
        status_ids = {s.status_id for s in workflow_update.statuses} if workflow_update.statuses else {s['status_id'] for s in workflow.get("statuses", [])}
        await validate_workflow_transitions(workflow_update.transitions, status_ids)
        update_data["transitions"] = [t.model_dump() for t in workflow_update.transitions]
    if workflow_update.issue_types is not None:
        update_data["issue_types"] = workflow_update.issue_types

    update_data["updated_at"] = datetime.now(timezone.utc)

    # Update workflow
    updated_workflow = await workflows_collection.find_one_and_update(
        {"workflow_number": workflow_id, "project_id": project_id},
        {"$set": update_data},
        return_document=ReturnDocument.AFTER,
    )

    return WorkflowOut(
        id=workflow_id,
        project_id=project_id,
        name=updated_workflow.get("name"),
        description=updated_workflow.get("description"),
        statuses=updated_workflow.get("statuses", []),
        transitions=updated_workflow.get("transitions", []),
        issue_types=updated_workflow.get("issue_types", []),
        is_default=updated_workflow.get("is_default", False),
        created_at=updated_workflow.get("created_at"),
        updated_at=updated_workflow.get("updated_at"),
    )


@router.delete("/{project_id}/workflows/{workflow_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_workflow(
    project_id: int,
    workflow_id: int,
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
    current_user: Annotated[CurrentUser, Depends(require_project_admin)],
):
    """Delete a workflow if not in use (project admin or global admin only)."""
    workflows_collection = db["workflows"]
    tickets_collection = db["tickets"]

    # Check workflow exists
    workflow = await workflows_collection.find_one({
        "workflow_number": workflow_id,
        "project_id": project_id
    })
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")

    # Check if workflow is default
    if workflow.get("is_default"):
        raise HTTPException(
            status_code=400,
            detail="Cannot delete the default workflow. Set another workflow as default first."
        )

    # Check if any tickets use this workflow (future: when tickets reference workflows)
    # For now, we'll allow deletion

    # Delete workflow
    await workflows_collection.delete_one({
        "workflow_number": workflow_id,
        "project_id": project_id
    })


@router.post("/{project_id}/workflows/{workflow_id}/set-default", response_model=WorkflowOut)
async def set_default_workflow(
    project_id: int,
    workflow_id: int,
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
    current_user: Annotated[CurrentUser, Depends(require_project_admin)],
):
    """Set a workflow as the default for the project (project admin or global admin only)."""
    workflows_collection = db["workflows"]

    # Check workflow exists
    workflow = await workflows_collection.find_one({
        "workflow_number": workflow_id,
        "project_id": project_id
    })
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")

    # Unset current default
    await workflows_collection.update_many(
        {"project_id": project_id, "is_default": True},
        {"$set": {"is_default": False}}
    )

    # Set new default
    updated_workflow = await workflows_collection.find_one_and_update(
        {"workflow_number": workflow_id, "project_id": project_id},
        {"$set": {"is_default": True, "updated_at": datetime.now(timezone.utc)}},
        return_document=ReturnDocument.AFTER,
    )

    return WorkflowOut(
        id=workflow_id,
        project_id=project_id,
        name=updated_workflow.get("name"),
        description=updated_workflow.get("description"),
        statuses=updated_workflow.get("statuses", []),
        transitions=updated_workflow.get("transitions", []),
        issue_types=updated_workflow.get("issue_types", []),
        is_default=True,
        created_at=updated_workflow.get("created_at"),
        updated_at=updated_workflow.get("updated_at"),
    )
