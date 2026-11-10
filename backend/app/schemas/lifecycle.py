"""Request and response models for project lifecycle tracking."""

from datetime import date, datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, Field, field_validator

StageState = Literal["not_started", "in_progress", "done", "blocked", "skipped"]


def _clean(value: Optional[str], field: str) -> Optional[str]:
    if value is None:
        return None
    value = value.strip()
    if not value:
        raise ValueError(f"{field} cannot be empty")
    return value


class PersonOut(BaseModel):
    """A person on a stage: the email is the identity, the name is for reading."""
    email: str
    name: str


class StageOut(BaseModel):
    key: str
    # The short name the team says out loud; the plain name sits under it.
    codename: Optional[str] = None
    name: str
    team: Optional[str] = None
    description: Optional[str] = None
    position: int
    # A checkpoint worth flagging on the route (handoff, delivery).
    is_milestone: bool = False
    state: StageState
    # Streams running side by side in this stage; each keeps its own record.
    tracks: List[str] = []
    assignees: List[PersonOut] = []
    target_date: Optional[date] = None
    note: Optional[str] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    # Whole days spent in this stage, including a run still in progress.
    days: int = 0
    is_overdue: bool = False
    # So a card can show there is something to read without loading it.
    remark_count: int = 0
    attachment_count: int = 0


class ModuleTicketOut(BaseModel):
    """A ticket doing part of this module's work, with any subtasks under it."""
    id: int
    key: str
    title: str
    status: str
    # From the shared categoriser, so "Done" here means what it means everywhere.
    category: str
    done: bool
    assignee_email: Optional[str] = None
    subtickets: List["ModuleTicketOut"] = []


class ModuleOut(BaseModel):
    id: int
    name: str
    assignees: List[PersonOut] = []
    deadline: Optional[date] = None
    done: bool = False
    done_at: Optional[datetime] = None
    position: int = 0
    is_overdue: bool = False
    tickets: List[ModuleTicketOut] = []
    # Counted across the linked tickets and every subtask under them, so the bar
    # on a module reflects all the work, not just its headline tickets.
    tickets_done: int = 0
    tickets_total: int = 0
    # True once tickets are linked: the tickets decide, not the tick box.
    done_from_tickets: bool = False


class LifecycleEvent(BaseModel):
    action: str
    stage_key: Optional[str] = None
    stage_name: Optional[str] = None
    field: Optional[str] = None
    old_value: Optional[str] = None
    new_value: Optional[str] = None
    note: Optional[str] = None
    actor: str
    actor_name: Optional[str] = None
    at: datetime


class LifecycleSummary(BaseModel):
    total_days: int = 0
    stages_done: int = 0
    stages_total: int = 0
    modules_done: int = 0
    modules_total: int = 0
    started_on: Optional[date] = None
    delivered_on: Optional[date] = None


class LifecycleOut(BaseModel):
    project_id: int
    project_name: str
    project_key: str
    stages: List[StageOut]
    current_stage: Optional[str] = None
    modules: List[ModuleOut] = []
    summary: LifecycleSummary
    can_edit: bool = False


class StageUpdate(BaseModel):
    """Any subset of a stage's own fields; only what is sent is changed."""
    state: Optional[StageState] = None
    # The whole list, not a delta: the picker sends what the stage should end up with.
    assignees: Optional[List[str]] = Field(None, max_length=20)
    target_date: Optional[date] = None
    note: Optional[str] = Field(None, max_length=2000)
    # Set by hand when a project was already running before it was tracked here.
    # Moving a stage still fills these in on its own.
    started_at: Optional[date] = None
    completed_at: Optional[date] = None
    # Sent explicitly to clear a field that is otherwise left alone.
    clear: List[Literal["assignees", "target_date", "note", "started_at", "completed_at"]] = []


class StageIn(BaseModel):
    """One stage when the flow itself is being edited."""
    key: Optional[str] = Field(None, max_length=64)
    codename: Optional[str] = Field(None, max_length=40)
    name: str = Field(..., max_length=120)
    is_milestone: bool = False
    team: Optional[str] = Field(None, max_length=60)
    description: Optional[str] = Field(None, max_length=500)

    @field_validator("name")
    @classmethod
    def _name(cls, value: str) -> str:
        return _clean(value, "name")


class FlowIn(BaseModel):
    """Replaces the project's stage list, in order."""
    stages: List[StageIn] = Field(..., min_length=1, max_length=30)


class AdvanceIn(BaseModel):
    """Finishes `stage_key` and starts the next stage still to be done.

    The key is sent rather than inferred so a click on a screen that has gone
    stale is rejected instead of quietly moving a different stage.
    """
    stage_key: str = Field(..., max_length=80)


class ModuleIn(BaseModel):
    name: str = Field(..., max_length=200)
    assignees: Optional[List[str]] = Field(None, max_length=20)
    deadline: Optional[date] = None

    @field_validator("name")
    @classmethod
    def _name(cls, value: str) -> str:
        return _clean(value, "name")


class ModuleUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=200)
    # The whole list, not a delta: the picker sends what the module should end up with.
    assignees: Optional[List[str]] = Field(None, max_length=20)
    deadline: Optional[date] = None
    done: Optional[bool] = None
    clear: List[Literal["assignees", "deadline"]] = []

    @field_validator("name")
    @classmethod
    def _name(cls, value: Optional[str]) -> Optional[str]:
        return _clean(value, "name")


class ModuleOrder(BaseModel):
    module_ids: List[int] = Field(..., max_length=200)


# ---------- what a stage carries: remarks, files and links ----------

class StageRemarkOut(BaseModel):
    id: int
    stage_key: str
    # Which stream of the stage this belongs to, or None when it has no streams.
    track: Optional[str] = None
    body: str
    author_email: str
    author_name: Optional[str] = None
    created_at: datetime


class RemarkIn(BaseModel):
    body: str = Field(..., max_length=4000)
    track: Optional[str] = Field(None, max_length=40)

    @field_validator("body")
    @classmethod
    def _body(cls, value: str) -> str:
        return _clean(value, "remark")


class StageAttachmentOut(BaseModel):
    id: int
    stage_key: str
    track: Optional[str] = None
    # "file" is stored by us and downloaded back; "link" points somewhere else.
    kind: Literal["file", "link"]
    label: str
    url: Optional[str] = None
    content_type: Optional[str] = None
    size_bytes: Optional[int] = None
    added_by: str
    added_by_name: Optional[str] = None
    created_at: datetime


class LinkIn(BaseModel):
    """A document that lives somewhere else: Figma, Drive, a shared doc."""
    url: str = Field(..., max_length=2000)
    label: Optional[str] = Field(None, max_length=200)
    track: Optional[str] = Field(None, max_length=40)

    @field_validator("url")
    @classmethod
    def _url(cls, value: str) -> str:
        value = _clean(value, "link") or ""
        if not value.startswith(("http://", "https://")):
            raise ValueError("Enter a link starting with http:// or https://")
        return value


class StageDetailOut(BaseModel):
    """Everything hanging off one stage, loaded when its panel is opened."""
    stage_key: str
    remarks: List[StageRemarkOut] = []
    attachments: List[StageAttachmentOut] = []


class ModuleTickets(BaseModel):
    """The tickets a module's work is being done in. Replaces the whole list."""
    ticket_ids: List[int] = Field(..., max_length=50)


ModuleTicketOut.model_rebuild()


class LifecycleActive(BaseModel):
    """Which projects have a lifecycle under way, for marking them in a list."""
    project_ids: List[int] = []
