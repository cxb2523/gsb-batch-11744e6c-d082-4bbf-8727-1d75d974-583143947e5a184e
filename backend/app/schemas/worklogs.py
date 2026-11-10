"""Pydantic schemas for Worklog (Time Tracking) endpoints."""

from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field, field_validator


# ========== Worklog Schemas ==========

class WorklogCreate(BaseModel):
    """Request schema for logging work on an issue."""
    time_spent_seconds: int = Field(..., gt=0, description="Time spent in seconds")
    started_at: datetime = Field(..., description="When the work was performed")
    description: Optional[str] = Field(None, max_length=500)
    adjust_estimate: str = Field("auto", pattern="^(auto|manual|leave)$")
    new_remaining_seconds: Optional[int] = Field(None, ge=0, description="New remaining estimate (only used if adjust_estimate=manual)")

    @field_validator('time_spent_seconds')
    @classmethod
    def validate_time_spent(cls, v):
        # Max 24 hours per entry
        if v > 86400:
            raise ValueError('Time spent cannot exceed 24 hours (86400 seconds)')
        return v


class WorklogUpdate(BaseModel):
    """Request schema for updating a worklog."""
    time_spent_seconds: Optional[int] = Field(None, gt=0)
    started_at: Optional[datetime] = None
    description: Optional[str] = Field(None, max_length=500)
    adjust_estimate: Optional[str] = Field(None, pattern="^(auto|manual|leave)$")
    new_remaining_seconds: Optional[int] = Field(None, ge=0)

    @field_validator('time_spent_seconds')
    @classmethod
    def validate_time_spent(cls, v):
        if v is not None and v > 86400:
            raise ValueError('Time spent cannot exceed 24 hours (86400 seconds)')
        return v


class WorklogOut(BaseModel):
    """Response schema for worklog."""
    id: int
    issue_id: int
    issue_key: str
    time_spent_seconds: int
    started_at: datetime
    description: Optional[str] = None
    author: dict  # {"id": int, "name": str, "email": str}
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ========== Time Estimation Schemas ==========

class TimeEstimateUpdate(BaseModel):
    """Request schema for updating time estimates on an issue."""
    original_estimate_seconds: Optional[int] = Field(None, ge=0, description="Original time estimate in seconds")
    remaining_estimate_seconds: Optional[int] = Field(None, ge=0, description="Remaining time estimate in seconds")


class TimeTrackingSummary(BaseModel):
    """Summary of time tracking for an issue."""
    original_estimate_seconds: int = 0
    time_spent_seconds: int = 0
    remaining_estimate_seconds: int = 0
    worklogs_count: int = 0
