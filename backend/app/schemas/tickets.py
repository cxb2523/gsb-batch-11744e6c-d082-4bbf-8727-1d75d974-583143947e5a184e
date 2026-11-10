"""Pydantic schemas for Ticket endpoints."""

from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field, field_validator

from ..core.priority import normalize_priority


# ========== Ticket Schemas ==========

class TicketCreate(BaseModel):
    """Request schema for creating a ticket."""
    title: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = None
    type: str = Field(..., pattern="^(story|task|bug|epic|subtask|campaign|design|engineering)$")
    status_id: int
    # Canonical scale is urgent/high/medium/low; legacy p0/p1/p2 are normalized on write.
    priority: Optional[str] = None
    assignee_email: Optional[str] = None
    due_date: Optional[datetime] = None
    start_date: Optional[datetime] = None  # Planned start date
    labels: Optional[List[str]] = []
    epic_id: Optional[int] = None
    parent_id: Optional[int] = None  # For subtasks, link to parent issue
    sprint_id: Optional[int] = None
    story_points: Optional[int] = Field(None, ge=0, le=100)
    # Time tracking fields
    original_estimate_seconds: Optional[int] = Field(None, ge=0, description="Original time estimate in seconds")
    # Development fields
    merge_request_url: Optional[str] = Field(None, description="URL to merge request/pull request")

    @field_validator("priority")
    @classmethod
    def _norm_priority(cls, v):
        return normalize_priority(v)


class TicketUpdate(BaseModel):
    """Request schema for updating a ticket."""
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = None
    type: Optional[str] = Field(None, pattern="^(story|task|bug|epic|subtask|campaign|design|engineering)$")
    status_id: Optional[int] = None
    priority: Optional[str] = None
    assignee_email: Optional[str] = None
    due_date: Optional[datetime] = None
    start_date: Optional[datetime] = None  # Planned start date
    labels: Optional[List[str]] = None
    epic_id: Optional[int] = None
    parent_id: Optional[int] = None  # For subtasks, link to parent issue
    sprint_id: Optional[int] = None
    story_points: Optional[int] = Field(None, ge=0, le=100)
    # Time tracking fields
    original_estimate_seconds: Optional[int] = Field(None, ge=0, description="Original time estimate in seconds")
    remaining_estimate_seconds: Optional[int] = Field(None, ge=0, description="Remaining time estimate in seconds")
    # Development fields
    merge_request_url: Optional[str] = Field(None, description="URL to merge request/pull request")

    @field_validator("priority")
    @classmethod
    def _norm_priority(cls, v):
        return normalize_priority(v)


class TicketPromote(BaseModel):
    """Turn a subtask into a standalone issue."""
    type: str = Field("task", pattern="^(story|task|bug)$")


class TicketOut(BaseModel):
    """Response schema for ticket."""
    id: int
    project_id: int
    key: str
    title: str
    description: Optional[str] = None
    type: str
    status_id: int
    status_name: Optional[str] = None
    # Configured hex colour of the status + its derived category (todo/in_progress/
    # in_review/blocked/done). Let every surface paint the status the same way.
    status_color: Optional[str] = None
    status_category: Optional[str] = None
    # Status the ticket held before it was moved to "Blocked"; drives the resume cap.
    pre_block_status_id: Optional[int] = None
    priority: Optional[str] = None
    assignee: Optional[dict] = None
    reporter: Optional[dict] = None
    due_date: Optional[datetime] = None
    start_date: Optional[datetime] = None  # Planned start date
    labels: List[str] = []
    epic_id: Optional[int] = None
    parent_id: Optional[int] = None  # For subtasks
    parent_key: Optional[str] = None  # Parent issue key for display
    epic_name: Optional[str] = None  # Epic name for breadcrumb
    subtasks_count: Optional[int] = None  # Number of subtasks
    subtasks_completed: Optional[int] = None  # Number of completed subtasks
    sprint_id: Optional[int] = None
    story_points: Optional[int] = None
    # Time tracking fields
    original_estimate_seconds: Optional[int] = None
    time_spent_seconds: Optional[int] = None
    remaining_estimate_seconds: Optional[int] = None
    # Development fields
    merge_request_url: Optional[str] = None
    # Archival. Archived tickets are hidden from work surfaces but are not deleted.
    archived: bool = False
    archived_at: Optional[datetime] = None
    created_at: datetime
    updated_at: Optional[datetime] = None


class TicketPage(BaseModel):
    """One page of tickets, returned when a caller passes `limit`.

    Without `limit` the endpoint returns a bare list, as it always has. The
    envelope only appears for callers that asked to page, so adding it broke
    nothing that was already reading the list.

    `next_cursor` is opaque: it encodes the position of the last row in the
    sort order, so the next page resumes from exactly there rather than
    counting rows from the start. It is null on the last page. `total` counts
    every row matching the filters, not the page, so a caller can say "1-10 of
    240" without fetching the rest.
    """
    items: List[TicketOut]
    next_cursor: Optional[str] = None
    total: int


class TicketMoveRequest(BaseModel):
    """Request schema for moving a ticket to a different status."""
    status_id: int
    position: Optional[int] = None


class TicketBulkUpdateFields(BaseModel):
    """Fields that can be applied to multiple tickets in bulk."""
    status_id: Optional[int] = None
    assignee_email: Optional[str] = None
    priority: Optional[str] = None
    labels_add: Optional[List[str]] = None
    labels_remove: Optional[List[str]] = None
    sprint_id: Optional[int] = None
    epic_id: Optional[int] = None
    archived: Optional[bool] = None

    @field_validator("priority")
    @classmethod
    def _norm_priority(cls, v):
        return normalize_priority(v)


class TicketBulkUpdateRequest(BaseModel):
    """Bulk update request payload."""
    ticket_numbers: List[int] = Field(..., min_length=1)
    updates: TicketBulkUpdateFields


class TicketBulkUpdateResult(BaseModel):
    """Bulk update response."""
    updated: int
    errors: List[dict] = []


class TicketBulkDeleteRequest(BaseModel):
    """Bulk delete request payload."""
    ticket_numbers: List[int] = Field(..., min_length=1)


class TicketBulkDeleteResult(BaseModel):
    """Bulk delete response."""
    deleted: int
    subtasks_deleted: int = 0
    errors: List[dict] = []


class TicketDeleteImpact(BaseModel):
    """What a delete would remove, so the UI can warn before destroying anything."""
    ticket_key: str
    subtasks: int = 0
    comments: int = 0
    attachments: int = 0
    worklogs: int = 0
    time_spent_seconds: int = 0


# ========== Comment Schemas ==========

class TicketCommentCreate(BaseModel):
    """Request schema for creating a ticket comment."""
    content: str = Field(..., min_length=1)


class TicketCommentOut(BaseModel):
    """Response schema for ticket comment."""
    id: int
    ticket_id: int
    content: str
    author: dict
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ========== File Schemas ==========

class TicketFileOut(BaseModel):
    """Response schema for ticket file."""
    id: int
    ticket_id: int
    filename: str
    file_path: str
    file_type: str
    file_size: int
    uploader_email: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


# ========== Ticket History Schemas ==========

class TicketHistoryOut(BaseModel):
    """Response schema for ticket history entry."""
    id: int
    ticket_id: int
    field: str
    old_value: Optional[str] = None
    new_value: Optional[str] = None
    changed_by: dict
    created_at: datetime

    class Config:
        from_attributes = True
