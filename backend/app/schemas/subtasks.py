"""Pydantic schemas for Subtask endpoints."""

from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field, field_validator

from ..core.priority import normalize_priority


class SubtaskCreate(BaseModel):
    """Request schema for creating a subtask."""
    title: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = None
    assignee_email: Optional[str] = None
    status_id: Optional[int] = None  # If not provided, use parent's status
    # Canonical scale is urgent/high/medium/low; legacy p0/p1/p2 are normalized on write.
    priority: Optional[str] = None
    due_date: Optional[str] = None

    @field_validator("priority")
    @classmethod
    def _norm_priority(cls, v):
        return normalize_priority(v)


class SubtaskUpdate(BaseModel):
    """Request schema for updating a subtask."""
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = None
    assignee_email: Optional[str] = None
    status_id: Optional[int] = None
    priority: Optional[str] = None
    completed: Optional[bool] = None  # Quick toggle for completion

    @field_validator("priority")
    @classmethod
    def _norm_priority(cls, v):
        return normalize_priority(v)


class SubtaskOut(BaseModel):
    """Response schema for subtask."""
    id: int
    parent_id: int
    project_id: int
    key: str
    title: str
    description: Optional[str] = None
    status_id: int
    status_name: Optional[str] = None
    status_color: Optional[str] = None
    status_category: Optional[str] = None
    priority: Optional[str] = None
    assignee: Optional[dict] = None
    reporter: Optional[dict] = None
    completed: bool = False
    archived: bool = False
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True
