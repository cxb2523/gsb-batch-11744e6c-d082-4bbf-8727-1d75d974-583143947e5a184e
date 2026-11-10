"""Pydantic schemas for Issue Link endpoints."""

from datetime import datetime
from typing import Optional, Literal
from pydantic import BaseModel, Field


# Supported issue link types
LinkType = Literal["blocks", "is_blocked_by", "relates_to", "duplicates", "is_duplicated_by"]


class IssueLinkCreate(BaseModel):
    """Request schema for creating an issue link."""
    target_issue_id: int = Field(..., description="The issue ID to link to")
    link_type: LinkType = Field(..., description="Type of relationship")


class IssueLinkOut(BaseModel):
    """Response schema for issue link."""
    id: int
    source_issue_id: int
    source_issue_key: str
    source_issue_title: str
    target_issue_id: int
    target_issue_key: str
    target_issue_title: str
    link_type: str
    created_at: datetime
    created_by: dict

    class Config:
        from_attributes = True


class IssueLinkGrouped(BaseModel):
    """Grouped issue links by type (outgoing and incoming)."""
    blocks: list[dict] = []
    blocked_by: list[dict] = []
    relates_to: list[dict] = []
    duplicates: list[dict] = []
    duplicated_by: list[dict] = []
