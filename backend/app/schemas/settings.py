"""Pydantic schemas for Settings endpoints."""

from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field


# ========== General Settings ==========

class ProjectSettingsUpdate(BaseModel):
    """Request schema for updating project settings."""
    name: Optional[str] = None
    description: Optional[str] = None
    visibility: Optional[str] = Field(None, pattern="^(public|private)$")
    status: Optional[str] = Field(None, pattern="^(active|in_progress|done|archived)$")
    project_deadline: Optional[datetime] = None  # Sacrosanct - only admin can change


class ProjectSettingsOut(BaseModel):
    """Response schema for project settings."""
    project_id: int
    name: str
    key: str
    description: str
    visibility: str
    status: str
    owner: dict
    created_at: datetime
    updated_at: Optional[datetime] = None
    project_deadline: Optional[datetime] = None  # Sacrosanct - only admin can change


class ProjectArchiveRequest(BaseModel):
    """Request schema for archiving a project."""
    confirm: bool = Field(..., description="Must be true to confirm archive")


# ========== Workflow Settings ==========

class WorkflowStatusCreate(BaseModel):
    """Request schema for creating a workflow status."""
    name: str = Field(..., min_length=1, max_length=50)
    color: Optional[str] = Field("#e5e7eb", pattern="^#[0-9a-fA-F]{6}$")
    position: Optional[int] = None


class WorkflowStatusUpdate(BaseModel):
    """Request schema for updating a workflow status."""
    name: Optional[str] = Field(None, min_length=1, max_length=50)
    color: Optional[str] = Field(None, pattern="^#[0-9a-fA-F]{6}$")
    position: Optional[int] = None


class WorkflowStatusOut(BaseModel):
    """Response schema for workflow status."""
    id: int
    project_id: int
    name: str
    color: str
    # Derived (not persisted) category: todo/in_progress/in_review/blocked/done.
    category: Optional[str] = None
    position: int


class WorkflowStatusReorderRequest(BaseModel):
    """Request schema for reordering workflow statuses."""
    status_ids: list[int] = Field(..., description="Ordered list of status IDs")


# ========== Labels Settings ==========

class LabelCreate(BaseModel):
    """Request schema for creating a label."""
    name: str = Field(..., min_length=1, max_length=30)
    color: Optional[str] = Field("#6b7280", pattern="^#[0-9a-fA-F]{6}$")
    description: Optional[str] = Field(None, max_length=200)


class LabelUpdate(BaseModel):
    """Request schema for updating a label."""
    name: Optional[str] = Field(None, min_length=1, max_length=30)
    color: Optional[str] = Field(None, pattern="^#[0-9a-fA-F]{6}$")
    description: Optional[str] = Field(None, max_length=200)


class LabelOut(BaseModel):
    """Response schema for label."""
    id: int
    project_id: int
    name: str
    color: str
    description: Optional[str] = None
    created_at: datetime


# ========== Permissions Settings ==========

class ProjectMemberAdd(BaseModel):
    """Request schema for adding a member to a project."""
    user_id: int
    role: str = Field(..., pattern="^(admin|member|viewer)$")


class ProjectMemberBulkItem(BaseModel):
    """One member in a bulk add: a user and the project role to grant them."""
    user_id: int
    role: str = Field("member", pattern="^(admin|member|viewer)$")


class ProjectMemberBulkAdd(BaseModel):
    """Request schema for adding several members to a project at once."""
    members: list[ProjectMemberBulkItem] = Field(..., min_length=1)


class AssignableUser(BaseModel):
    """A user who can be added to a project (active, not a global admin)."""
    user_id: int
    name: str
    email: str
    designation: str = ""


class ProjectMemberInvite(BaseModel):
    """Request schema for inviting a member by email."""
    email: str = Field(..., pattern=r"^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$")
    role: str = Field(..., pattern="^(admin|member|viewer)$")


class ProjectMemberUpdate(BaseModel):
    """Request schema for updating a member's role."""
    role: str = Field(..., pattern="^(admin|member|viewer)$")


class ProjectMemberOut(BaseModel):
    """Response schema for project member."""
    user_id: int
    email: str
    name: str
    role: str
    joined_at: datetime
    active: bool = True
    assigned_issues: int = 0
    last_active: Optional[str] = None
    initials: Optional[str] = None
    is_global_admin: bool = False
    # True when this row is not a real project_members entry but a global admin
    # injected at read time (implicit access). Such rows can't be removed or
    # role-edited on a project.
    implicit: bool = False


# ========== Notifications Settings ==========

class NotificationPreferencesUpdate(BaseModel):
    """Request schema for updating notification preferences."""
    issue_assignments: Optional[bool] = None
    mentions: Optional[bool] = None
    status_changes: Optional[bool] = None
    comments: Optional[bool] = None
    email_notifications: Optional[bool] = None


class NotificationPreferencesOut(BaseModel):
    """Response schema for notification preferences."""
    user_id: int
    issue_assignments: bool
    mentions: bool
    status_changes: bool
    comments: bool
    email_notifications: bool
    updated_at: datetime


class NotificationOut(BaseModel):
    """Response schema for notification."""
    id: int
    user_id: int
    type: str
    message: str
    read: bool
    project_id: Optional[int] = None
    ticket_id: Optional[int] = None
    ticket_key: Optional[str] = None
    created_at: datetime
