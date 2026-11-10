"""Request and response models for the cross-project daily standup."""

from datetime import date, datetime
from typing import Dict, List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

StatusCategory = Literal["done", "blocked", "in_review", "in_progress", "todo"]
PersonHealth = Literal["blocked", "no_update", "ok"]
TaskSection = Literal["yesterday", "today"]
TaskStatus = Literal["todo", "in_progress", "done"]


class StandupStatus(BaseModel):
    id: int
    name: str
    color: Optional[str] = None
    category: StatusCategory


class StandupParent(BaseModel):
    id: int
    key: str
    title: str


class StandupTicketRow(BaseModel):
    id: int
    project_id: int
    key: str
    title: str
    type: Optional[str] = None
    priority: Optional[str] = None
    status: Optional[StandupStatus] = None
    parent: Optional[StandupParent] = None
    due_date: Optional[date] = None
    is_overdue: bool = False
    archived: bool = False
    # Who put this ticket on the board.
    added_by: Optional[str] = None
    # Already added to the day it would be carried forward to.
    carried_forward: bool = False
    # Set when it came from the previous working day's Today automatically.
    carried_from_date: Optional[date] = None


class StandupCounts(BaseModel):
    completed: int = 0
    worked_on: int = 0
    today: int = 0
    blockers: int = 0


class StandupTask(BaseModel):
    """Plain-text work that has no ticket: ad-hoc tasks, projects not tracked in GRID."""
    id: str
    section: TaskSection
    text: str
    status: TaskStatus
    created_by: Optional[str] = None
    created_at: datetime
    carried_from: Optional[str] = None
    carried_forward: bool = False


class StandupYesterday(BaseModel):
    items: List[StandupTicketRow] = []
    tasks: List[StandupTask] = []


class StandupTodayColumn(BaseModel):
    items: List[StandupTicketRow] = []
    tasks: List[StandupTask] = []


class BlockerNote(BaseModel):
    """A free-text blocker someone raised for a person on a standup date."""
    id: str
    text: str
    created_by: Optional[str] = None
    created_at: datetime
    # Set when it was carried over from an earlier day's blockers.
    carried_from_date: Optional[date] = None


class StandupPerson(BaseModel):
    email: str
    name: str
    photo: Optional[str] = None
    has_account: bool = True
    # Whether the person looking may change this board (themselves, or an admin).
    can_edit: bool = False
    health: PersonHealth = "ok"
    counts: StandupCounts
    yesterday: StandupYesterday
    today: StandupTodayColumn
    blockers: List[StandupTicketRow] = []
    blocker_notes: List[BlockerNote] = []


class StandupProject(BaseModel):
    id: int
    key: str
    name: str
    color: str


class StandupSummary(BaseModel):
    people: int = 0
    updated: int = 0
    no_update: int = 0
    completed: int = 0
    blockers: int = 0
    planned_today: int = 0


class StandupWindow(BaseModel):
    start: datetime = Field(serialization_alias="from")
    end: datetime = Field(serialization_alias="to")
    label: str
    since_label: str


class StandupBoard(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    date: date
    today: date
    is_today: bool
    is_weekend: bool
    prev_date: date
    next_date: Optional[date] = None
    # Where "carry forward" from today's column lands: the next working day.
    carry_forward_date: date
    yesterday_window: StandupWindow
    summary: StandupSummary
    projects: Dict[str, StandupProject]
    people: List[StandupPerson]
    roster_is_default: bool
    is_admin: bool
    # Who is looking, so the page can open their own board first.
    viewer_email: str = ""


# ---------- Today pins ----------

class TodayItemIn(BaseModel):
    email: str = Field(..., min_length=3, max_length=254)
    date: date
    ticket_id: int = Field(..., ge=1)


class TodayItemOut(BaseModel):
    email: str
    date: date
    ticket_id: int


# ---------- Moving a card between Yesterday and Today ----------

class MoveIn(BaseModel):
    email: str = Field(..., min_length=3, max_length=254)
    date: date
    kind: Literal["ticket", "task"]
    # The column it goes to; it leaves the other one.
    to: Literal["yesterday", "today"]
    ticket_id: Optional[int] = Field(None, ge=1)
    task_id: Optional[str] = Field(None, min_length=1, max_length=64)

    @model_validator(mode="after")
    def _one_id(self) -> "MoveIn":
        if self.kind == "ticket" and self.ticket_id is None:
            raise ValueError("ticket_id is required to move a ticket")
        if self.kind == "task" and not self.task_id:
            raise ValueError("task_id is required to move a task")
        return self


class MoveOut(BaseModel):
    to: Literal["yesterday", "today"]


# ---------- Tickets added by hand (yesterday, blockers) ----------

AddedSection = Literal["yesterday", "blockers"]
# Which column's picker is asking; only affects ordering.
PickerSection = Literal["yesterday", "today", "blockers"]


class AddedItemIn(BaseModel):
    email: str = Field(..., min_length=3, max_length=254)
    date: date
    ticket_id: int = Field(..., ge=1)


class AddedItemOut(BaseModel):
    email: str
    date: date
    section: AddedSection
    ticket_id: int


# ---------- Blocker notes ----------

BLOCKER_NOTE_MAX = 500


class BlockerNoteIn(BaseModel):
    email: str = Field(..., min_length=3, max_length=254)
    date: date
    text: str = Field(..., max_length=BLOCKER_NOTE_MAX)

    @field_validator("text")
    @classmethod
    def _strip_text(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Blocker text cannot be empty")
        return value


# ---------- Plain-text tasks ----------

TASK_TEXT_MAX = 500


def _clean_task_text(value: str) -> str:
    value = value.strip()
    if not value:
        raise ValueError("Task text cannot be empty")
    return value


class TaskIn(BaseModel):
    email: str = Field(..., min_length=3, max_length=254)
    date: date
    section: TaskSection
    text: str = Field(..., max_length=TASK_TEXT_MAX)
    status: TaskStatus = "todo"

    @field_validator("text")
    @classmethod
    def _strip_text(cls, value: str) -> str:
        return _clean_task_text(value)


class TaskPatch(BaseModel):
    text: Optional[str] = Field(None, max_length=TASK_TEXT_MAX)
    status: Optional[TaskStatus] = None

    @field_validator("text")
    @classmethod
    def _strip_text(cls, value: Optional[str]) -> Optional[str]:
        return None if value is None else _clean_task_text(value)


class PersonTicketOption(BaseModel):
    id: int
    project_id: int
    key: str
    title: str
    type: Optional[str] = None
    status_name: Optional[str] = None


# ---------- Roster ----------

class RosterMember(BaseModel):
    email: str
    name: str
    photo: Optional[str] = None
    role: Optional[str] = None
    has_account: bool = True
    is_active: bool = True


class RosterOut(BaseModel):
    members: List[RosterMember]
    is_default: bool
    updated_at: Optional[datetime] = None
    updated_by: Optional[str] = None


class RosterIn(BaseModel):
    emails: List[str] = Field(..., max_length=200)
