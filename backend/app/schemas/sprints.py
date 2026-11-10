"""Pydantic schemas for Sprint endpoints."""

from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field
from enum import Enum


class SprintState(str, Enum):
    """Sprint state enum."""
    FUTURE = "future"
    ACTIVE = "active"
    CLOSED = "closed"


# ========== Sprint Schemas ==========

class SprintCreate(BaseModel):
    """Request schema for creating a sprint."""
    name: str = Field(..., min_length=1, max_length=100)
    goal: Optional[str] = Field(None, max_length=500)
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None


class SprintComplete(BaseModel):
    """Request schema for completing a sprint.

    If move_to_sprint_id is provided, incomplete issues are moved to that
    sprint instead of the backlog.
    """
    move_to_sprint_id: Optional[int] = None


class SprintUpdate(BaseModel):
    """Request schema for updating a sprint."""
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    goal: Optional[str] = Field(None, max_length=500)
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None


class SprintStart(BaseModel):
    """Request schema for starting a sprint.

    Only the end date is accepted: activation always stamps the start date as the
    real "now" (no back-dating), so there is no start_date field here. The end
    date time-boxes the sprint and is mandatory — supplied here or already stored
    on the sprint — which the start endpoint enforces.
    """
    end_date: Optional[datetime] = None


class SprintDatesUpdate(BaseModel):
    """Request schema for an admin editing a running/planned sprint's end date.

    Restricted to global/project admins and guarded in the endpoint: the end date
    must be in the future and after the sprint's start date. The start date is not
    editable here — it is fixed at activation to keep historical metrics honest.
    """
    end_date: datetime


class SprintOut(BaseModel):
    """Response schema for sprint."""
    id: int
    project_id: int
    name: str
    goal: Optional[str] = None
    state: SprintState
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class SprintCapacityOut(BaseModel):
    """Response schema for sprint capacity."""
    sprint_id: int
    total_story_points: int
    completed_story_points: int
    remaining_story_points: int
    total_issues: int
    completed_issues: int
    remaining_issues: int
    days_remaining: Optional[int] = None
    progress_percentage: float


# ========== Sprint Issue Assignment Schemas ==========

class SprintIssueAssignment(BaseModel):
    """Request schema for adding issues to a sprint."""
    issue_ids: List[int] = Field(..., min_items=1)


class SprintIssueRemoval(BaseModel):
    """Request schema for removing an issue from a sprint."""
    issue_id: int
