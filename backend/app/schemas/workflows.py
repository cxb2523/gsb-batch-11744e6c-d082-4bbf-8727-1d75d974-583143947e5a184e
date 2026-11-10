"""Pydantic schemas for Workflow endpoints."""

from datetime import datetime
from typing import Optional, List, Dict
from pydantic import BaseModel, Field


# ========== Workflow Schemas ==========

class WorkflowStatusRef(BaseModel):
    """Reference to a status within a workflow."""
    status_id: int
    position: int


class WorkflowTransition(BaseModel):
    """Defines a transition between two statuses."""
    from_status_id: int
    to_status_id: int
    name: Optional[str] = None  # e.g., "Start Progress", "Complete"
    conditions: Optional[Dict] = None  # Future: conditions like role requirements
    post_functions: Optional[Dict] = None  # Future: auto-assign, notifications


class WorkflowCreate(BaseModel):
    """Request schema for creating a workflow."""
    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = None
    statuses: List[WorkflowStatusRef] = []  # List of status IDs in order
    transitions: List[WorkflowTransition] = []  # Allowed transitions
    issue_types: Optional[List[str]] = []  # Issue types this workflow applies to


class WorkflowUpdate(BaseModel):
    """Request schema for updating a workflow."""
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    description: Optional[str] = None
    statuses: Optional[List[WorkflowStatusRef]] = None
    transitions: Optional[List[WorkflowTransition]] = None
    issue_types: Optional[List[str]] = None


class WorkflowOut(BaseModel):
    """Response schema for workflow."""
    id: int
    project_id: int
    name: str
    description: Optional[str] = None
    statuses: List[WorkflowStatusRef]
    transitions: List[WorkflowTransition]
    issue_types: List[str]
    is_default: bool = False
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class SetDefaultWorkflowRequest(BaseModel):
    """Request to set a workflow as default."""
    workflow_id: int
