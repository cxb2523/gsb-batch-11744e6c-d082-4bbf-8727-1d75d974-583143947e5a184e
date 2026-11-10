"""Schemas for "create a project from a spreadsheet" (structured import).

Reads an existing spreadsheet deterministically — columns auto-mapped onto
ticket fields — and creates a brand-new project with those tickets at commit time.
"""

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field


# The product's issue types (see ISSUE_TYPES in CreateIssueModal.tsx). `subtask`
# is excluded on purpose — the structured import produces only top-level tickets.
TOP_LEVEL_TYPES = ["story", "task", "bug", "epic"]

PRIORITIES = ["urgent", "high", "medium", "low"]


class ImportDraftRow(BaseModel):
    """One proposed ticket, before anything is written to the database."""
    ref: int = Field(..., description="Stable id for this row within one parse; parents are referenced by it")
    parent_ref: Optional[int] = Field(None, description="ref of the parent row; children are created as subtasks")

    title: Optional[str] = None
    description: Optional[str] = None
    type: Optional[str] = None
    status_id: Optional[int] = None
    # The mapped workflow-status name, resolved to a status_id only at commit once
    # the new project's statuses exist.
    status_name: Optional[str] = None
    priority: Optional[str] = None
    assignee_email: Optional[str] = None
    due_date: Optional[datetime] = None
    labels: List[str] = []
    story_points: Optional[int] = None

    # Populated by the server, not the client. The preview renders red cells
    # from `missing_required` and a warning icon from `warnings`.
    missing_required: List[str] = []
    warnings: List[str] = []


class ImportOptions(BaseModel):
    """The project's own values, so the preview can render real dropdowns."""
    statuses: List[dict] = []
    members: List[dict] = []
    types: List[str] = TOP_LEVEL_TYPES
    priorities: List[str] = PRIORITIES
    default_status_id: Optional[int] = None


class ColumnMapping(BaseModel):
    """How one spreadsheet column was auto-mapped onto a ticket field."""
    header: str                       # the column header as written in the sheet
    field: Optional[str] = None       # the ticket field it maps to, or None (ignored)


class AssigneeResolution(BaseModel):
    """How one distinct assignee value from the sheet was resolved."""
    source: str                       # the value as written (name or email)
    matched_email: Optional[str] = None
    matched_user_id: Optional[int] = None
    status: str                       # "matched" | "ambiguous" | "unmatched"


class SpreadsheetParseResponse(BaseModel):
    """Preview of a parsed spreadsheet. Nothing has been created yet."""
    rows: List[ImportDraftRow]
    options: ImportOptions
    columns: List[ColumnMapping]
    assignees: List[AssigneeResolution]
    # Distinct, directory-matched users to add to the new project as members.
    member_user_ids: List[int] = []
    source_filename: str
    row_count: int
    warnings: List[str] = []


class ProjectImportCommitRequest(BaseModel):
    """Create a project from the reviewed rows."""
    project_name: str = Field(..., min_length=1, max_length=120)
    project_key: str = Field(..., min_length=1, max_length=10)
    description: Optional[str] = None
    visibility: str = "private"
    deadline: Optional[datetime] = None
    rows: List[ImportDraftRow] = Field(..., min_length=1)
    # Directory-matched users to add as project members, from the parse preview.
    member_user_ids: List[int] = []


class ProjectImportRowResult(BaseModel):
    ref: int
    created: bool
    ticket_id: Optional[int] = None
    key: Optional[str] = None
    title: Optional[str] = None
    error: Optional[str] = None


class ProjectImportCommitResponse(BaseModel):
    project_id: int
    project_key: str
    created_count: int
    failed_count: int
    results: List[ProjectImportRowResult] = []
