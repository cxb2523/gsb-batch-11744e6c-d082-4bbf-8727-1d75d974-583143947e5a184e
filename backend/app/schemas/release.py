from datetime import datetime
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field


# ========== Deployment Schemas ==========

class DeploymentRecord(BaseModel):
    """Record of a deployment to an environment."""
    environment: str = Field(..., pattern="^(dev|staging|production|qa)$")
    deployed_at: datetime
    deployed_by_email: Optional[str] = None
    deployed_by_name: Optional[str] = None
    status: str = Field(..., pattern="^(success|failed|in_progress|rolled_back)$")
    commit_hash: Optional[str] = None
    notes: Optional[str] = None


class ChangelogItem(BaseModel):
    """An item in the release changelog."""
    category: str = Field(..., pattern="^(feature|fix|breaking|enhancement|docs|other)$")
    description: str
    ticket_key: Optional[str] = None
    ticket_id: Optional[int] = None
    commit_hash: Optional[str] = None


class GitCommit(BaseModel):
    """A git commit associated with the release."""
    hash: str
    message: str
    author: str
    timestamp: datetime
    ticket_ids: Optional[List[int]] = []


class ReleaseMetrics(BaseModel):
    """Metrics calculated for a release."""
    lead_time_days: Optional[float] = None  # Days from first commit to release
    deployment_count: int = 0
    rollback_count: int = 0
    tickets_completed: int = 0
    tickets_total: int = 0
    code_changes_count: int = 0  # Number of commits


# ========== Release Schemas ==========

# Version may contain only letters, digits and dots - no other special characters.
VERSION_PATTERN = r"^[A-Za-z0-9.]+$"


class ReleaseBase(BaseModel):
    name: str
    version: str = Field(
        ...,
        pattern=VERSION_PATTERN,
        description="Version using letters, digits and dots only (e.g., 1.2.3)",
    )
    description: Optional[str] = None
    release_notes: Optional[str] = None
    release_date: Optional[datetime] = None
    git_merge_mr: Optional[str] = None  # GitLab/GitHub Merge Request URL


class ReleaseCreate(ReleaseBase):
    ticket_ids: Optional[List[int]] = []  # List of ticket IDs included in this release
    git_tag: Optional[str] = None
    git_branch: Optional[str] = None
    commits: Optional[List[GitCommit]] = []


class ReleaseUpdate(BaseModel):
    name: Optional[str] = None
    version: Optional[str] = Field(default=None, pattern=VERSION_PATTERN)
    description: Optional[str] = None
    release_notes: Optional[str] = None
    release_date: Optional[datetime] = None
    git_merge_mr: Optional[str] = None
    ticket_ids: Optional[List[int]] = None
    status: Optional[str] = Field(None, pattern="^(planned|in-progress|released|archived)$")
    git_tag: Optional[str] = None
    git_branch: Optional[str] = None
    commits: Optional[List[GitCommit]] = None
    changelog_items: Optional[List[ChangelogItem]] = None


class ReleaseOut(ReleaseBase):
    id: int
    project_id: int
    status: str  # planned, in-progress, released, archived
    ticket_count: int
    created_at: datetime
    updated_at: Optional[datetime] = None

    # Git integration
    git_tag: Optional[str] = None
    git_branch: Optional[str] = None
    commits: Optional[List[GitCommit]] = []

    # Deployment tracking
    deployments: Optional[List[DeploymentRecord]] = []
    current_environments: Optional[List[str]] = []  # Environments where this release is currently deployed

    # Changelog
    changelog_items: Optional[List[ChangelogItem]] = []
    auto_generated_changelog: bool = False

    # Metrics
    metrics: Optional[ReleaseMetrics] = None
    first_commit_date: Optional[datetime] = None
    release_completed_date: Optional[datetime] = None

    class Config:
        from_attributes = True


class DeploymentCreate(BaseModel):
    """Create a new deployment record for a release."""
    environment: str = Field(..., pattern="^(dev|staging|production|qa)$")
    status: str = Field(default="success", pattern="^(success|failed|in_progress)$")
    commit_hash: Optional[str] = None
    notes: Optional[str] = None
